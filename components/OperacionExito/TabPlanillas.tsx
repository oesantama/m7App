import React, { useState, useEffect, useRef } from 'react';
import { Search, Folder, Upload, BookOpen, Trash2, Download, AlertTriangle, Calendar, Filter, X, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import geminiService from '../../services/geminiPlanillas.service';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';
import { hasPermission } from '../../utils/permissions';
import { useAppStore } from '../../stores/useAppStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const currentMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    desde: `${y}-${String(m).padStart(2,'0')}-01`,
    hasta: `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
  };
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface SkippedInfo {
  name: string;
  total_registros: number;
  fecha_subida: string;
  registros: {
    pedido: string; cedula: string; cliente: string; plu: string;
    articulo: string; placa: string; fecha1: string; fecha2: string; ciudad_barrio: string;
  }[];
}

// ─── Componente ───────────────────────────────────────────────────────────────
export const TabPlanillas: React.FC<{ user?: User }> = ({ user }) => {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressInfo, setProgressInfo]  = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [loadingMode, setLoadingMode]    = useState<string | null>(null);

  // Filtros
  const [filterFields, setFilterFields] = useState({ placa: '', plu: '', pedido: '', articulo: '', cliente: '' });
  const [searchGlobal, setSearchGlobal] = useState('');
  const { desde, hasta } = currentMonthRange();
  const [fechaDesde, setFechaDesde] = useState(desde);
  const [fechaHasta, setFechaHasta] = useState(hasta);
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(true);

  // Dialogs
  const [showErrorDialog,  setShowErrorDialog]  = useState(false);
  const [failedFiles,      setFailedFiles]       = useState<any[]>([]);
  const [showSkippedDialog,setShowSkippedDialog] = useState(false);
  const [skippedFiles,     setSkippedFiles]      = useState<SkippedInfo[]>([]);
  const [showingDuplicates, setShowingDuplicates] = useState(false);

  // Historial de salidas y entregas
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyWarnings, setHistoryWarnings] = useState<any[]>([]);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef  = useRef<HTMLInputElement>(null);

  const activePageId = useAppStore(s => s.activePageId);
  const isSuperUser  = user?.roleId === 'ROL-01' || user?.email === 'admin@millasiete.com';
  const canDelete    = isSuperUser || hasPermission(user!, activePageId || 'CONCILIACION', 'delete');

  // ─── Carga inicial / recargar con filtros ────────────────────────────────────
  const loadRecords = async (overrides?: Partial<typeof filterFields> & { global?: string; desde?: string; hasta?: string; currentMonth?: boolean }) => {
    try {
      const f = overrides ? { ...filterFields, ...overrides } : filterFields;
      const params: any = {
        placa:    f.placa    || '',
        plu:      f.plu      || '',
        pedido:   f.pedido   || '',
        articulo: f.articulo || '',
        cliente:  f.cliente  || '',
        search:   overrides?.global ?? searchGlobal,
        onlyCurrentMonth: String(overrides?.currentMonth ?? onlyCurrentMonth),
      };
      if (!(overrides?.currentMonth ?? onlyCurrentMonth)) {
        params.fechaDesde = overrides?.desde ?? fechaDesde;
        params.fechaHasta = overrides?.hasta ?? fechaHasta;
      }
      const data = await api.getPlanillasRecords(params);
      setResults(data);
    } catch (e) {
      console.error('Error loading planillas records', e);
      toast.error('Error al cargar los registros');
    }
  };

  // Cargar API key desde el backend (que sí tiene acceso al .env del servidor)
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        // Primero intenta desde el env del frontend (compilado por Vite)
        const frontendKey = process.env.GEMINI_API_KEY || '';
        if (frontendKey) {
          setApiKey(frontendKey);
          setApiKeyLoaded(true);
          return;
        }
        // Si no, pide la key al backend de forma segura
        const res = await fetch(`${(window as any).__API_URL__ || '/api'}/config/gemini-key`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hasKey && data.key) setApiKey(data.key);
        }
      } catch (e) {
        console.warn('[TabPlanillas] No se pudo obtener API key del servidor');
      } finally {
        setApiKeyLoaded(true);
      }
    };
    loadApiKey();
  }, []);

  useEffect(() => { loadRecords(); }, []);


  // ─── Análisis con validación real en BD ──────────────────────────────────────
  const runAnalysis = async (files: { file: File; name: string }[]) => {
    if (!apiKey)        { toast.error('API Key no detectada'); return; }
    if (!files.length)  return;

    geminiService.init(apiKey);
    setAnalyzing(true);
    setProgressValue(0);
    setFailedFiles([]);
    setSkippedFiles([]);

    try {
      // 1 ─ Consultar la BD (no el cache) cuáles ya existen
      const fileNames = files.map(f => f.name);
      const existingMap: Record<string, any> = await api.checkPlanillasFiles(fileNames);

      const toProcess   = files.filter(f => !existingMap[f.name]);
      const toSkipInfos = files
        .filter(f => existingMap[f.name])
        .map(f => ({
          name:              f.name,
          total_registros:   existingMap[f.name].total_registros,
          fecha_subida:      existingMap[f.name].fecha_subida,
          registros:         existingMap[f.name].registros || [],
        }));

      if (toSkipInfos.length > 0) {
        setSkippedFiles(toSkipInfos);
        setShowSkippedDialog(true);
      }

      if (toProcess.length === 0) {
        toast.info('Todos los archivos seleccionados ya están registrados en la base de datos.');
        setAnalyzing(false);
        setLoadingMode(null);
        return;
      }

      // 2 ─ Procesar solo los que NO existen
      const totalFiles = toProcess.length;
      let processedCount = 0;
      const newRecordsBatch: any[] = [];
      let currentDelay = 12000;
      const localFailed: any[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        const fileObj = toProcess[i];

        if (processedCount > 1500) {
          toast.error('Límite diario de Gemini Free alcanzado (1500).');
          break;
        }

        try {
          setProgressInfo(`[${i + 1}/${totalFiles}] Preparando: ${fileObj.name}`);
          const buffer = await fileObj.file.arrayBuffer();

          setProgressInfo(`[${i + 1}/${totalFiles}] IA Analizando: ${fileObj.name}`);
          const matches = await geminiService.analyzeDocument(buffer, 'application/pdf');

          if (Array.isArray(matches) && matches.length > 0) {
            const batch = matches.map((analysis: any) => ({
              archivo:       fileObj.name,
              pedido:        analysis.pedido       || 'N/A',
              cedula:        analysis.cedula        || 'N/A',
              cliente:       analysis.cliente       || 'N/A',
              plu:           analysis.plu           || 'N/A',
              articulo:      analysis.articulo      || 'N/A',
              direccion:     analysis.direccion     || 'N/A',
              fecha1:        analysis.fecha1        || 'N/A',
              fecha2:        analysis.fecha2        || 'N/A',
              ciudad_barrio: analysis.ciudad_barrio || 'N/A',
              placa:         analysis.placa         || 'N/A',
              notas:         analysis.notas         || '',
            }));
            newRecordsBatch.push(...batch);
          }
        } catch (error: any) {
          console.error(`Error procesando ${fileObj.name}:`, error);
          localFailed.push({ name: fileObj.name, reason: error.message || 'Error desconocido' });
          currentDelay += 5000;
          toast.error(`Error en ${fileObj.name}. Saltando...`);
        } finally {
          processedCount++;
          setProgressValue(Math.round((processedCount / totalFiles) * 100));

          if (i < toProcess.length - 1) {
            setProgressInfo(`Esperando cuota (próximo en ${currentDelay / 1000}s)...`);
            await new Promise(resolve => setTimeout(resolve, currentDelay));
          }
        }
      }

      if (newRecordsBatch.length > 0) {
        await api.savePlanillasRecords(newRecordsBatch);
        await loadRecords(); // recargar desde BD
        
        // Verificar historial para alertar de salidas repetidas o ya entregadas
        try {
          const pedidosUnicos = Array.from(new Set(newRecordsBatch.map(r => r.pedido).filter(p => p && p !== 'N/A')));
          if (pedidosUnicos.length > 0) {
            const hist = await api.checkPlanillasHistory(pedidosUnicos);
            const warnings = hist.filter((h: any) => Number(h.salidas) > 1).map((h: any) => {
              const fullRecord = newRecordsBatch.find(r => r.pedido === h.pedido) || {};
              return {
                ...fullRecord,
                pedido: h.pedido,
                salidas_previas: Number(h.salidas) - 1,
                total_salidas: Number(h.salidas),
                estado_entrega: h.estado_entrega || 'No Conciliado Aún'
              };
            });
            if (warnings.length > 0) {
              setHistoryWarnings(warnings);
              setShowHistoryDialog(true);
            }
          }
        } catch (e) {
          console.error("Error al verificar el historial de pedidos:", e);
        }
      }

      setFailedFiles(localFailed);
      if (localFailed.length > 0) {
        setShowErrorDialog(true);
        toast(`Proceso terminado. ${newRecordsBatch.length} guardados, ${localFailed.length} fallidos.`, { icon: '⚠️' });
      } else {
        toast.success(`Proceso terminado. ${newRecordsBatch.length} registros nuevos guardados.`);
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') toast.error(`Error general: ${error.message}`);
    } finally {
      setAnalyzing(false);
      setLoadingMode(null);
      setProgressInfo('');
    }
  };

  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files)
      .filter(f => f.name.toLowerCase().endsWith('.pdf'))
      .map(f => ({ file: f, name: f.name }));
    if (files.length) { setLoadingMode('folder'); runAnalysis(files); }
    e.target.value = '';
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).map(f => ({ file: f, name: f.name }));
    if (files.length) { setLoadingMode('files'); runAnalysis(files); }
    e.target.value = '';
  };

  const deleteRow = async (id: string) => {
    if (!canDelete) return toast.error('No tienes permisos para eliminar registros.');
    if (window.confirm('¿Eliminar este registro? Quedará registrado en auditoría.')) {
      await api.deletePlanillaRecord(id);
      setResults(prev => prev.filter(r => r.id !== id));
      toast.success('Registro eliminado');
    }
  };

  const confirmClear = async () => {
    if (!canDelete) return toast.error('Sin permisos de eliminación.');
    if (window.confirm('¿Borrar todo el historial? Esta acción quedará en el log de auditoría y no se puede deshacer.')) {
      await api.clearPlanillasRecords();
      setResults([]);
      toast.success('Historial borrado');
    }
  };

  const checkDuplicates = () => {
    if (!results.length) return;
    const groups: Record<string, any[]> = {};
    results.forEach(r => {
      const key = `${(r.cedula||'').trim()}|${(r.articulo||'').trim().toLowerCase()}|${(r.plu||'').trim()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const dups = Object.values(groups)
      .filter(g => g.length > 1 && new Set(g.map(r => r.fecha1)).size > 1)
      .flat();
    if (dups.length) {
      setResults(dups);
      setShowingDuplicates(true);
      toast(`${dups.length} duplicados detectados.`, { icon: '⚠️' });
    } else {
      toast.success('No se encontraron duplicados.');
    }
  };

  // ─── Columnas DataTable ───────────────────────────────────────────────────────
  const columns: ColumnDef<any>[] = [
    {
      header: 'Soporte Drive', key: 'drive_link', sortable: false,
      render: row => row.drive_link
        ? <a href={row.drive_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold hover:bg-emerald-200">🔗 Ver</a>
        : <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-bold">Pendiente</span>
    },
    { header: 'PDF',     key: 'archivo' },
    { header: 'Pedido',  key: 'pedido' },
    { header: 'Cédula',  key: 'cedula' },
    { header: 'Cliente', key: 'cliente' },
    { header: 'PLU',     key: 'plu' },
    { header: 'Artículo',key: 'articulo' },
    { header: 'Dirección',key:'direccion' },
    { header: 'Fecha 1', key: 'fecha1' },
    { header: 'Fecha 2', key: 'fecha2' },
    { header: 'Ciudad-Barrio', key: 'ciudad_barrio' },
    { header: 'Placa',   key: 'placa' },
    { header: 'Notas',   key: 'notas' },
  ];

  if (canDelete) {
    columns.push({
      header: 'Eliminar', key: 'actions', sortable: false,
      render: row => (
        <button onClick={() => deleteRow(row.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
          <Trash2 size={12} />
        </button>
      )
    });
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <BookOpen size={16} className="text-indigo-600" /> Base de Datos Logística
          </h2>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
            !apiKeyLoaded ? 'bg-slate-100 text-slate-400' :
            apiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}>
            {!apiKeyLoaded ? 'Cargando...' : apiKey ? 'IA Online' : 'Sin API Key'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="file" ref={folderInputRef} {...{ webkitdirectory:'true', directory:'true' } as any} multiple style={{ display:'none' }} onChange={handleFolderSelected} />
          <input type="file" ref={filesInputRef}  multiple accept="application/pdf"                       style={{ display:'none' }} onChange={handleFilesSelected} />

          <button onClick={() => folderInputRef.current?.click()} disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-[11px] font-bold shadow-sm hover:bg-indigo-700 disabled:opacity-50">
            <Folder size={14} /> Carpeta {loadingMode==='folder' && '...'}
          </button>

          <button onClick={() => filesInputRef.current?.click()} disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-xl text-[11px] font-bold shadow-sm hover:bg-blue-600 disabled:opacity-50">
            <Upload size={14} /> Archivos {loadingMode==='files' && '...'}
          </button>

          <button onClick={checkDuplicates} disabled={analyzing || !results.length}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-[11px] font-bold shadow-sm hover:bg-amber-600 disabled:opacity-50">
            <AlertTriangle size={14} /> Duplicados
          </button>

          {showingDuplicates && (
            <button onClick={() => { loadRecords(); setShowingDuplicates(false); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 rounded-xl text-[11px] font-bold hover:bg-slate-50">
              Ver Todo
            </button>
          )}

          {canDelete && (
            <button onClick={confirmClear} disabled={analyzing || !results.length}
              className="flex items-center gap-1.5 px-3 py-2 border border-rose-200 text-rose-600 rounded-xl text-[11px] font-bold hover:bg-rose-50 disabled:opacity-50">
              <Trash2 size={14} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Barra de Filtros (estilo imagen 3) ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        {/* Fila 1: filtros por campo */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(['placa','plu','pedido','articulo','cliente'] as const).map(field => (
            <input key={field} type="text"
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              value={filterFields[field]}
              onChange={e => setFilterFields(prev => ({ ...prev, [field]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && loadRecords()}
              className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] focus:outline-none focus:border-indigo-400 bg-slate-50"
            />
          ))}
        </div>

        {/* Fila 2: búsqueda global + fechas + botón */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Búsqueda global..."
              value={searchGlobal}
              onChange={e => setSearchGlobal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadRecords()}
              className="w-full pl-8 pr-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[11px] focus:outline-none focus:border-indigo-400"
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={onlyCurrentMonth}
              onChange={e => { setOnlyCurrentMonth(e.target.checked); loadRecords({ currentMonth: e.target.checked }); }}
              className="accent-indigo-600 w-3.5 h-3.5"
            />
            <span className="text-[11px] font-bold text-slate-600">Solo mes actual</span>
          </label>

          {!onlyCurrentMonth && (
            <>
              <div className="flex items-center gap-1">
                <Calendar size={13} className="text-slate-400" />
                <input type="date" value={fechaDesde}
                  onChange={e => setFechaDesde(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-indigo-400 bg-slate-50"
                />
              </div>
              <span className="text-[11px] text-slate-400 font-medium">—</span>
              <div className="flex items-center gap-1">
                <input type="date" value={fechaHasta}
                  onChange={e => setFechaHasta(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:border-indigo-400 bg-slate-50"
                />
              </div>
            </>
          )}

          <button onClick={() => loadRecords()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-xl text-[11px] font-black hover:bg-slate-700 shadow-sm">
            <Filter size={13} /> Consultar
          </button>

          <button onClick={() => {
            setFilterFields({ placa:'', plu:'', pedido:'', articulo:'', cliente:'' });
            setSearchGlobal('');
            setOnlyCurrentMonth(true);
            const { desde, hasta } = currentMonthRange();
            setFechaDesde(desde); setFechaHasta(hasta);
            loadRecords({ placa:'', plu:'', pedido:'', articulo:'', cliente:'', global:'', currentMonth: true });
          }} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-500 rounded-xl text-[11px] font-bold hover:bg-slate-50">
            <X size={13} /> Limpiar filtros
          </button>
        </div>
      </div>

      {/* ── Progreso ── */}
      {analyzing && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <div className="w-full bg-indigo-200 rounded-full h-2 mb-2">
            <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progressValue}%` }} />
          </div>
          <div className="text-xs text-indigo-800 font-medium text-center">{progressInfo} ({progressValue}%)</div>
        </div>
      )}

      {/* ── Tabla ── */}
      <DataTable
        data={results}
        columns={columns}
        searchPlaceholder="Filtrar en esta página..."
        excelFileName="Reporte_Logistico_Milla7.xlsx"
      />

      {/* ── Dialog: Archivos ya en BD ── */}
      {showSkippedDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-indigo-700 flex items-center gap-2 uppercase tracking-wide">
                  <CheckCircle size={18} /> PDFs Ya Registrados en Base de Datos
                </h3>
                <p className="text-[11px] text-indigo-500 mt-0.5">
                  Estos archivos se omitieron — ya tienen información en BD y no se enviarán a la IA.
                </p>
              </div>
              <span className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-black text-sm shrink-0">
                {skippedFiles.length}
              </span>
            </div>

            {/* Tabs por PDF + DataTable */}
            <div className="flex flex-col overflow-hidden flex-1">
              {skippedFiles.map((f, i) => (
                <div key={i} className="flex flex-col overflow-hidden flex-1">
                  {/* Info del PDF */}
                  <div className="flex items-center justify-between gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center text-xs shrink-0">📄</div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-slate-800 truncate">{f.name}</p>
                        <p className="text-[10px] text-slate-500">
                          Primera vez subido: <span className="font-bold text-indigo-700">{fmtDate(f.fecha_subida)}</span>
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-black shrink-0">
                      {f.total_registros} registros guardados
                    </span>
                  </div>

                  {/* DataTable con registros de ese PDF */}
                  <div className="overflow-auto flex-1 px-4 py-3">
                    <DataTable
                      data={f.registros}
                      columns={[
                        { header: 'Pedido',   key: 'pedido',       render: r => <span className="font-bold text-blue-600">{r.pedido}</span> },
                        { header: 'Cédula',   key: 'cedula' },
                        { header: 'Cliente',  key: 'cliente' },
                        { header: 'PLU',      key: 'plu',          render: r => <span className="font-bold">{r.plu}</span> },
                        { header: 'Artículo', key: 'articulo' },
                        { header: 'Placa',    key: 'placa',        render: r => <span className="font-bold text-indigo-600">{r.placa}</span> },
                        { header: 'Fecha 1',  key: 'fecha1' },
                        { header: 'Fecha 2',  key: 'fecha2' },
                        { header: 'Ciudad',   key: 'ciudad_barrio' },
                      ]}
                      searchPlaceholder="Filtrar registros del PDF..."
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
              <button onClick={() => setShowSkippedDialog(false)}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dialog: Archivos con errores ── */}
      {showErrorDialog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-rose-100 bg-rose-50">
              <h3 className="text-base font-black text-rose-600 flex items-center gap-2 uppercase">
                <AlertTriangle size={18} /> Archivos No Procesados
              </h3>
              <p className="text-[10px] text-rose-500 mt-1">Los siguientes archivos fallaron durante el análisis IA:</p>
            </div>
            <div className="p-5 overflow-y-auto max-h-[55vh] bg-slate-50 space-y-2 custom-scrollbar">
              {failedFiles.map((f, i) => (
                <div key={i} className="bg-white p-3 rounded-2xl border border-rose-100 flex items-start gap-3 shadow-sm">
                  <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black text-slate-800">{f.name}</p>
                    <p className="text-[10px] text-slate-500">{f.reason}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t bg-white flex justify-end">
              <button onClick={() => setShowErrorDialog(false)}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-800">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO: Historial de Pedidos (Re-despachos) */}
      {showHistoryDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-orange-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-orange-800">Alertas de Historial: Re-Despachos</h3>
                  <p className="text-sm text-orange-600 font-medium mt-1">
                    Se detectaron {historyWarnings.length} pedidos en esta planilla que ya han salido previamente.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowHistoryDialog(false)}
                className="p-2 text-orange-400 hover:bg-orange-100 rounded-xl transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white p-2">
                <DataTable 
                  data={historyWarnings}
                  columns={[
                    { header: 'Pedido', key: 'pedido', render: (r: any) => <span className="font-bold text-slate-700">{r.pedido}</span> },
                    { header: 'Cédula', key: 'cedula' },
                    { header: 'Cliente', key: 'cliente' },
                    { header: 'PLU', key: 'plu' },
                    { header: 'Artículo', key: 'articulo' },
                    { header: 'Dirección', key: 'direccion' },
                    { header: 'Placa', key: 'placa' },
                    { header: 'Fecha', key: 'fecha1' },
                    { header: 'Salidas Previas', key: 'salidas_previas', render: (r: any) => <span className="text-center block">{r.salidas_previas}</span> },
                    { header: 'Total Salidas', key: 'total_salidas', render: (r: any) => <span className="text-center font-black text-orange-600 block">{r.total_salidas}</span> },
                    { header: 'Último Estado', key: 'estado_entrega', render: (r: any) => {
                        const estado = r.estado_entrega;
                        const color = estado === 'Entregado' ? 'bg-green-100 text-green-700' :
                                      estado === 'No Conciliado Aún' ? 'text-slate-400 italic' :
                                      'bg-red-100 text-red-700';
                        return estado === 'No Conciliado Aún' ? 
                          <span className={color}>{estado}</span> :
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${color}`}>{estado}</span>;
                    }}
                  ]}
                  searchPlaceholder="Buscar pedido, placa, cliente..."
                  excelFileName="Alertas_Redespachos.xlsx"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
              <button 
                onClick={() => setShowHistoryDialog(false)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TabPlanillas;
