import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Trash2, Download, Upload, FileSpreadsheet, X, ChevronDown } from 'lucide-react';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface User { id: string; name: string; clientIds?: string[]; clientId?: string; role?: string; }
interface Props { user: User; }

interface TdmRow {
  manifiesto: string;
  fecha_operacion: string;
  remesa: string;
  valor_cobrar: number;
  valor_pagar: number;
  ciudad_origen: string;
  ciudad_destino: string;
  placa: string;
}

const TEMPLATE_COLUMNS = ['manifiesto', 'fecha_operacion', 'remesa', 'valor_cobrar', 'valor_pagar', 'ciudad_origen', 'ciudad_destino', 'placa'];

const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-CO')}`;
const fmtDate = (d: string) => {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

export default function OperacionesFlotaManual({ user }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const fileRef = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  // Upload state
  const [previewRows, setPreviewRows] = useState<TdmRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<1 | 2>(1);

  // Results state
  const [activeTab, setActiveTab] = useState<'resumen' | 'detalle'>('resumen');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [summaryRows, setSummaryRows] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const allowedIds = user.clientIds || [];

  // Manual entry state
  const [showManualForm, setShowManualForm] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const emptyManual = (): TdmRow & { clientId: string } => ({
    clientId: '', manifiesto: '', fecha_operacion: today,
    remesa: '', valor_cobrar: 0, valor_pagar: 0,
    ciudad_origen: '', ciudad_destino: '', placa: '',
  });
  const [manualRow, setManualRow] = useState(emptyManual);
  const setManual = (field: string, value: any) =>
    setManualRow(prev => ({ ...prev, [field]: value }));

  useEffect(() => {
    api.getClients().then((res: any) => {
      const all: any[] = Array.isArray(res) ? res : (res?.data || []);
      const filtered = isSuperAdmin
        ? all
        : all.filter((c: any) => allowedIds.includes(c.id) || allowedIds.includes(String(c.id)));
      setClients(filtered.filter((c: any) => c.status_id === 'EST-01' || !c.status_id));
    }).catch(() => {});
    loadResults();
  }, []);

  const selectedClient = clients.find(c => String(c.id) === selectedClientId);

  // ── Template download ──────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_COLUMNS,
      ['MANI-001', today, 'REM-001', 500000, 450000, 'MEDELLIN', 'BOGOTA', 'ABC123'],
      ['MANI-002', today, 'REM-002', 320000, 300000, 'CALI', 'MEDELLIN', 'XYZ456'],
    ]);
    ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla TDM');
    XLSX.writeFile(wb, 'plantilla_tdm_operaciones.xlsx');
  };

  // ── Excel parsing ──────────────────────────────────────────────────────────

  // Detecta si una celda tiene formato "CIUDAD DD/MM/YYYY" o "CIUDAD D/M/YYYY"
  const TITULO_F2 = /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s\.]+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*$/i;

  const parseNumF2 = (v: any) =>
    Number(String(v || '0').replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.-]/g, '')) || 0;

  const parseFormat2 = (aoa: any[][], ciudadOrigen: string): TdmRow[] => {
    const rows: TdmRow[] = [];
    let i = 0;
    while (i < aoa.length) {
      // Buscar celda título: puede estar en columna 0 o 1
      const rowCells = (aoa[i] || []).map(c => String(c ?? '').trim());
      const titleCell = rowCells.find(c => TITULO_F2.test(c)) || '';
      const m = titleCell.match(TITULO_F2);
      if (m) {
        const ciudadDestino = m[1].trim().toUpperCase();
        const [dd, mm, yyyy] = m[2].split('/');
        const fecha = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;

        // Leer hasta 12 filas del bloque, construir mapa label→valor
        const block: Record<string, string> = {};
        for (let j = i + 1; j < Math.min(i + 13, aoa.length); j++) {
          const r = aoa[j] || [];
          // Cada fila tiene pares [etiqueta, valor, etiqueta2, valor2]
          for (let col = 0; col < r.length - 1; col += 2) {
            const lbl = String(r[col] ?? '').trim().toUpperCase();
            const val = String(r[col + 1] ?? '').trim();
            if (lbl) block[lbl] = val;
          }
          // Si la siguiente fila empieza con otro título, parar
          const nextTitle = String(r[0] ?? '').trim();
          if (j > i + 1 && TITULO_F2.test(nextTitle)) break;
        }

        const manifiesto = block['MANIFIESTO'] || '';
        if (!manifiesto) { i++; continue; }

        rows.push({
          manifiesto: manifiesto.toUpperCase(),
          fecha_operacion: fecha,
          remesa: block['REMESA'] || '',
          valor_cobrar: parseNumF2(block['SOCODA']),   // SOCODA = valor CxC
          valor_pagar:  parseNumF2(block['FLETE']),    // FLETE  = valor CxP
          ciudad_origen: ciudadOrigen.trim().toUpperCase() || 'SIN CIUDAD',
          ciudad_destino: ciudadDestino,
          placa: (block['PLACA'] || '').toUpperCase(),
        });
      }
      i++;
    }
    return rows;
  };

  const sheetHasFormat2 = (aoa: any[][]): boolean =>
    aoa.slice(0, 8).some(row =>
      (row || []).some(cell => {
        const s = String(cell ?? '').trim();
        return s.length > 5 && TITULO_F2.test(s);
      })
    );

  const parseFile = (file: File) => {
    setParseError('');
    setPreviewRows([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });

        // ── Detectar formato 2 en CUALQUIER hoja del libro ────────────────────
        const allAoas: Array<{ name: string; aoa: any[][] }> = wb.SheetNames.map(name => ({
          name,
          aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][],
        }));

        const f2Sheets = allAoas.filter(s => sheetHasFormat2(s.aoa));

        if (f2Sheets.length > 0) {
          setDetectedFormat(2);
          const allRows: TdmRow[] = [];
          for (const s of f2Sheets) {
            allRows.push(...parseFormat2(s.aoa, 'GUARNE'));
          }
          if (allRows.length === 0) {
            setParseError(`Formato 2 detectado (${f2Sheets.length} hoja(s)) pero no se encontraron bloques con MANIFIESTO.`);
            return;
          }
          // Deduplicar por manifiesto
          const seen = new Set<string>();
          const unique = allRows.filter(r => {
            if (seen.has(r.manifiesto)) return false;
            seen.add(r.manifiesto);
            return true;
          });
          setPreviewRows(unique);
          return;
        }

        // ── Formato 1: columnas estándar (primera hoja) ───────────────────────
        setDetectedFormat(1);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (jsonRows.length === 0) { setParseError('El archivo no tiene filas de datos.'); return; }

        const normalize = (key: string) => key.toLowerCase().replace(/\s+/g, '_');
        const mapped: TdmRow[] = [];
        const errs: string[] = [];

        jsonRows.forEach((raw, i) => {
          const r: any = {};
          Object.entries(raw).forEach(([k, v]) => { r[normalize(k)] = v; });

          const manifiesto = String(r['manifiesto'] || '').trim();
          let fechaRaw = r['fecha_operacion'];
          let fecha = '';

          if (fechaRaw instanceof Date) {
            fecha = fechaRaw.toISOString().slice(0, 10);
          } else if (typeof fechaRaw === 'number') {
            const d = XLSX.SSF.parse_date_code(fechaRaw);
            fecha = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
          } else {
            fecha = String(fechaRaw || '').trim();
          }

          if (!manifiesto) { errs.push(`Fila ${i + 2}: falta "manifiesto"`); return; }
          if (!fecha)       { errs.push(`Fila ${i + 2}: falta "fecha_operacion"`); return; }

          mapped.push({
            manifiesto,
            fecha_operacion: fecha,
            remesa: String(r['remesa'] || '').trim(),
            valor_cobrar: Number(String(r['valor_cobrar'] || '0').replace(/[^0-9.-]/g, '')) || 0,
            valor_pagar:  Number(String(r['valor_pagar']  || '0').replace(/[^0-9.-]/g, '')) || 0,
            ciudad_origen: String(r['ciudad_origen'] || 'SIN CIUDAD').trim().toUpperCase(),
            ciudad_destino: String(r['ciudad_destino'] || 'SIN CIUDAD').trim().toUpperCase(),
            placa: String(r['placa'] || '').trim().toUpperCase(),
          });
        });

        if (errs.length > 0) { setParseError(errs.slice(0, 5).join(' | ')); return; }
        setPreviewRows(mapped);
      } catch (ex: any) {
        setParseError('No se pudo leer el archivo: ' + ex.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  // ── Upload confirm ─────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedClientId) { toast.error('Seleccione un cliente'); return; }
    if (previewRows.length === 0) { toast.error('No hay filas para cargar'); return; }

    setUploading(true);
    try {
      const res = await api.uploadTdmManifiestos({
        clientId: selectedClientId,
        rows: previewRows,
        uploadedBy: user.id, // Only user ID sent
      });

      if (res.success) {
        toast.success(`✅ ${res.inserted} nuevos · ${res.updated} actualizados`);
        if (res.errors?.length > 0) toast.warning(`${res.errors.length} filas con error`);
        setPreviewRows([]);
        setSelectedClientId('');
        loadResults();
      } else {
        toast.error(res.error || 'Error al cargar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar');
    } finally {
      setUploading(false);
    }
  };

  // ── Load results ───────────────────────────────────────────────────────────
  const loadResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const params: any = {};
      if (filterFrom)   params.from = filterFrom;
      if (filterTo)     params.to = filterTo;
      if (filterClient) params.clientId = filterClient;

      const [detail, summary] = await Promise.all([
        api.getTdmManifiestos({ ...params, view: 'detail' }),
        api.getTdmManifiestos({ ...params, view: 'summary' }),
      ]);

      setDetailRows(detail.data || []);
      setSummaryRows(summary.data || []);
    } catch {
      toast.error('Error cargando registros');
    } finally {
      setLoadingResults(false);
    }
  }, [filterFrom, filterTo, filterClient]);

  const handleSaveManual = async () => {
    if (!manualRow.clientId) { toast.error('Seleccione un cliente'); return; }
    if (!manualRow.manifiesto.trim()) { toast.error('El manifiesto es obligatorio'); return; }
    if (!manualRow.fecha_operacion) { toast.error('La fecha es obligatoria'); return; }
    setSavingManual(true);
    try {
      const res = await api.uploadTdmManifiestos({
        clientId: manualRow.clientId,
        rows: [{
          manifiesto: manualRow.manifiesto.trim().toUpperCase(),
          fecha_operacion: manualRow.fecha_operacion,
          remesa: manualRow.remesa.trim(),
          valor_cobrar: Number(manualRow.valor_cobrar) || 0,
          valor_pagar: Number(manualRow.valor_pagar) || 0,
          ciudad_origen: manualRow.ciudad_origen.trim().toUpperCase() || 'SIN CIUDAD',
          ciudad_destino: manualRow.ciudad_destino.trim().toUpperCase() || 'SIN CIUDAD',
          placa: manualRow.placa.trim().toUpperCase(),
        }],
        uploadedBy: user.id,
      });
      if (res.success) {
        toast.success(`Manifiesto ${manualRow.manifiesto} guardado correctamente`);
        setManualRow(emptyManual());
        setShowManualForm(false);
        loadResults();
      } else {
        toast.error(res.error || 'Error al guardar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSavingManual(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.deleteTdmManifiesto(id);
      toast.success('Registro eliminado');
      setDetailRows(prev => prev.filter(r => r.id !== id));
      loadResults();
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleting(null);
    }
  };

  const totalCobrar = summaryRows.reduce((s, r) => s + Number(r.total_cobrar || 0), 0);
  const totalPagar  = summaryRows.reduce((s, r) => s + Number(r.total_pagar || 0), 0);
  const totalManif  = summaryRows.reduce((s, r) => s + Number(r.total_manifiestos || 0), 0);

  const summaryColumns: ColumnDef<any>[] = [
    { header: 'Cliente TDM', key: 'client_name', sortable: true, render: r => <span className="font-bold text-amber-700">TDM {r.client_name}</span> },
    { header: 'Manifiestos', key: 'total_manifiestos', sortable: true, render: r => <span className="font-black text-slate-900">{Number(r.total_manifiestos).toLocaleString('es-CO')}</span> },
    { header: 'Total Cobrar', key: 'total_cobrar', sortable: true, render: r => <span className="font-bold text-emerald-700">{fmt(r.total_cobrar)}</span> },
    { header: 'Total Pagar', key: 'total_pagar', sortable: true, render: r => <span className="font-bold text-rose-600">{fmt(r.total_pagar)}</span> },
    { header: 'Fecha Desde', key: 'fecha_desde', sortable: true, render: r => <span className="text-slate-500 text-xs">{fmtDate(r.fecha_desde)}</span> },
    { header: 'Fecha Hasta', key: 'fecha_hasta', sortable: true, render: r => <span className="text-slate-500 text-xs">{fmtDate(r.fecha_hasta)}</span> },
  ];

  const detailColumns: ColumnDef<any>[] = [
    { header: 'Manifiesto', key: 'manifiesto', sortable: true, render: r => <span className="font-bold text-slate-800">{r.manifiesto}</span> },
    { header: 'Cliente TDM', key: 'client_name', sortable: true, render: r => <span className="font-bold text-amber-700">TDM {r.client_name}</span> },
    { header: 'Fecha', key: 'fecha_operacion', sortable: true, render: r => <span className="text-slate-600 text-xs">{fmtDate(r.fecha_operacion)}</span> },
    { header: 'Remesa', key: 'remesa', render: r => <span className="text-slate-500 text-xs">{r.remesa || '—'}</span> },
    { header: 'V. Cobrar', key: 'valor_cobrar', sortable: true, render: r => <span className="font-bold text-emerald-700">{fmt(r.valor_cobrar)}</span> },
    { header: 'V. Pagar', key: 'valor_pagar', sortable: true, render: r => <span className="font-bold text-rose-600">{fmt(r.valor_pagar)}</span> },
    { header: 'Origen', key: 'ciudad_origen', render: r => <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600">{r.ciudad_origen}</span> },
    { header: 'Destino', key: 'ciudad_destino', render: r => <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600">{r.ciudad_destino}</span> },
    { header: 'Placa', key: 'placa', render: r => r.placa
      ? <span className="px-2 py-0.5 bg-indigo-50 rounded-full text-[10px] font-black text-indigo-700 tracking-widest">{r.placa}</span>
      : <span className="text-slate-300 text-xs">—</span> },
    { header: 'Subido por', key: 'uploaded_by', render: r => <span className="text-slate-400 text-xs">{r.uploaded_by || '—'}</span> },
    ...(isSuperAdmin ? [{
      header: '',
      key: 'id' as const,
      render: (r: any) => (
        <button onClick={() => {
          toast.custom((t) => (
            <div className="bg-white rounded-xl shadow-xl border border-rose-100 p-5 flex flex-col gap-3 min-w-[280px]">
              <p className="text-sm font-bold text-slate-800">¿Eliminar manifiesto {r.manifiesto}?</p>
              <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => toast.dismiss(t)} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button onClick={() => { toast.dismiss(t); handleDelete(r.id); }} className="px-3 py-1.5 text-xs font-bold bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors">Eliminar</button>
              </div>
            </div>
          ), { duration: Infinity });
        }} disabled={deleting === r.id}
          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40">
          {deleting === r.id ? <span className="animate-spin inline-block text-xs">⏳</span> : <Trash2 size={14} />}
        </button>
      ),
    }] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestión Documentos Drive • PAG-62</p>
        <h1 className="text-2xl font-black text-slate-900 mt-0.5">Operaciones Flota Manual</h1>
        <p className="text-sm text-slate-500 mt-0.5">Carga masiva de manifiestos TDM desde Excel</p>
      </div>

      {/* ── Carga Excel ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Cargar Operaciones TDM</h2>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">
            <Download size={13} /> Descargar Plantilla
          </button>
        </div>

        {/* Cliente selector */}
        <div className="space-y-1 max-w-xs">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente *</label>
          <div className="relative">
            <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all bg-white appearance-none pr-10">
              <option value="">-- Seleccionar cliente --</option>
              {clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          {selectedClient && (
            <p className="text-[10px] font-black text-amber-600 pl-1">Se registrará como: "TDM {selectedClient.name}"</p>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
            ${dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'}`}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
          <FileSpreadsheet size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">Arrastra tu archivo Excel aquí</p>
          <p className="text-xs text-slate-400 mt-1">O haz clic para explorar (.xlsx, .xls)</p>
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">
            Columnas: {TEMPLATE_COLUMNS.join(' · ')}
          </p>
        </div>

        {parseError && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
            <X size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs font-bold text-rose-700">{parseError}</p>
          </div>
        )}

        {/* Preview */}
        {previewRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                  Vista previa — {previewRows.length} filas
                </p>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  detectedFormat === 2
                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                    : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                }`}>
                  {detectedFormat === 2 ? 'Formato 2 — Bloque (origen: GUARNE)' : 'Formato 1 — Columnas'}
                </span>
              </div>
              <button onClick={() => { setPreviewRows([]); setDetectedFormat(1); }}
                className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">
                Limpiar
              </button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-100 max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="text-left px-3 py-2">Manifiesto</th>
                    <th className="text-center px-3 py-2">Fecha</th>
                    <th className="text-left px-3 py-2">Remesa</th>
                    <th className="text-right px-3 py-2">V. Cobrar</th>
                    <th className="text-right px-3 py-2">V. Pagar</th>
                    <th className="text-center px-3 py-2">Origen</th>
                    <th className="text-center px-3 py-2">Destino</th>
                    <th className="text-center px-3 py-2">Placa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {previewRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-800">{r.manifiesto}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{fmtDate(r.fecha_operacion)}</td>
                      <td className="px-3 py-2 text-slate-500">{r.remesa || '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(r.valor_cobrar)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-600">{fmt(r.valor_pagar)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600">{r.ciudad_origen}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600">{r.ciudad_destino}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.placa
                          ? <span className="px-2 py-0.5 bg-indigo-50 rounded-full text-[10px] font-black text-indigo-700 tracking-widest">{r.placa}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button onClick={handleUpload} disabled={uploading || !selectedClientId}
                className="flex items-center gap-2 px-8 py-3 bg-amber-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-sm disabled:opacity-50">
                <Upload size={15} />
                {uploading ? 'Guardando...' : `Guardar ${previewRows.length} registros`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Carga Manual ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
        <button
          onClick={() => setShowManualForm(v => !v)}
          className="w-full flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <span className="text-indigo-600 text-base">✏️</span>
            </div>
            <div className="text-left">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Ingreso Manual</p>
              <p className="text-xs text-slate-400 font-medium">Agregar un manifiesto individualmente</p>
            </div>
          </div>
          <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${showManualForm ? 'rotate-180' : ''}`} />
        </button>

        {showManualForm && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            {/* Cliente */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente *</label>
                <div className="relative">
                  <select value={manualRow.clientId} onChange={e => setManual('clientId', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all bg-white appearance-none pr-10">
                    <option value="">-- Seleccionar cliente --</option>
                    {clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Manifiesto */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manifiesto *</label>
                <input
                  type="text"
                  value={manualRow.manifiesto}
                  onChange={e => setManual('manifiesto', e.target.value.toUpperCase())}
                  placeholder="Ej. MANI-001"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Fecha */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Operacion *</label>
                <input
                  type="date"
                  value={manualRow.fecha_operacion}
                  onChange={e => setManual('fecha_operacion', e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all"
                />
              </div>

              {/* Remesa */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Remesa</label>
                <input
                  type="text"
                  value={manualRow.remesa}
                  onChange={e => setManual('remesa', e.target.value.toUpperCase())}
                  placeholder="Ej. REM-001"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>

              {/* Placa */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa</label>
                <input
                  type="text"
                  value={manualRow.placa}
                  onChange={e => setManual('placa', e.target.value.toUpperCase())}
                  placeholder="Ej. ABC123"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Valor Cobrar */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor a Cobrar</label>
                <input
                  type="number"
                  min="0"
                  value={manualRow.valor_cobrar || ''}
                  onChange={e => setManual('valor_cobrar', Number(e.target.value) || 0)}
                  placeholder="$0"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-emerald-400 transition-all"
                />
              </div>

              {/* Valor Pagar */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor a Pagar</label>
                <input
                  type="number"
                  min="0"
                  value={manualRow.valor_pagar || ''}
                  onChange={e => setManual('valor_pagar', Number(e.target.value) || 0)}
                  placeholder="$0"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-rose-400 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ciudad Origen */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ciudad Origen</label>
                <input
                  type="text"
                  value={manualRow.ciudad_origen}
                  onChange={e => setManual('ciudad_origen', e.target.value.toUpperCase())}
                  placeholder="Ej. MEDELLIN"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>

              {/* Ciudad Destino */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ciudad Destino</label>
                <input
                  type="text"
                  value={manualRow.ciudad_destino}
                  onChange={e => setManual('ciudad_destino', e.target.value.toUpperCase())}
                  placeholder="Ej. BOGOTA"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>
            </div>

            {/* Preview card */}
            {manualRow.manifiesto && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 flex flex-wrap gap-4 text-xs font-bold text-indigo-800">
                <span>📋 {manualRow.manifiesto}</span>
                {manualRow.fecha_operacion && <span>📅 {fmtDate(manualRow.fecha_operacion)}</span>}
                {manualRow.remesa && <span>🔖 {manualRow.remesa}</span>}
                {manualRow.placa && <span>🚛 {manualRow.placa}</span>}
                {manualRow.valor_cobrar > 0 && <span className="text-emerald-700">💰 {fmt(manualRow.valor_cobrar)}</span>}
                {manualRow.valor_pagar > 0 && <span className="text-rose-600">📤 {fmt(manualRow.valor_pagar)}</span>}
                {manualRow.ciudad_origen && <span>📍 {manualRow.ciudad_origen} → {manualRow.ciudad_destino || '?'}</span>}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setManualRow(emptyManual()); setShowManualForm(false); }}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveManual}
                disabled={savingManual}
                className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50"
              >
                <Upload size={13} />
                {savingManual ? 'Guardando...' : 'Guardar Manifiesto'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Filtros + Resultados ─────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</label>
            <div className="relative">
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all bg-white appearance-none pr-8">
                <option value="">Todos</option>
                {clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <button onClick={loadResults} disabled={loadingResults}
            className="px-6 py-2.5 bg-slate-700 text-white rounded-2xl text-sm font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-50">
            {loadingResults ? '...' : 'Filtrar'}
          </button>
        </div>

        {/* KPIs resumen */}
        {(summaryRows.length > 0 || detailRows.length > 0) && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Manifiestos', value: totalManif.toLocaleString('es-CO'), color: 'bg-slate-700', icon: '📋' },
              { label: 'Total a Cobrar', value: fmt(totalCobrar), color: 'bg-emerald-600', icon: '💰' },
              { label: 'Total a Pagar',  value: fmt(totalPagar),  color: 'bg-rose-600',    icon: '📤' },
            ].map(k => (
              <div key={k.label} className={`${k.color} text-white rounded-2xl px-5 py-4`}>
                <p className="text-xl">{k.icon}</p>
                <p className="text-xl font-black mt-1">{k.value}</p>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
          {(['resumen', 'detalle'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab === 'resumen' ? '📊 Resumen' : '📋 Detalle'}
            </button>
          ))}
        </div>

        {/* Tab: Resumen */}
        {activeTab === 'resumen' && (
          <DataTable
            data={summaryRows}
            columns={summaryColumns}
            loading={loadingResults}
            searchPlaceholder="Buscar cliente..."
            excelFileName="manifiestos_tdm_resumen.xlsx"
            excelSheetName="Resumen"
          />
        )}

        {/* Tab: Detalle */}
        {activeTab === 'detalle' && (
          <DataTable
            data={detailRows}
            columns={detailColumns}
            loading={loadingResults}
            searchPlaceholder="Buscar manifiesto, remesa, ciudad..."
            excelFileName="manifiestos_tdm_detalle.xlsx"
            excelSheetName="Detalle"
          />
        )}
      </div>
    </div>
  );
}
