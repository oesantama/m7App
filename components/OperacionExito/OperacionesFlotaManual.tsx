import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Trash2, Download, Upload, FileSpreadsheet, X, ChevronDown } from 'lucide-react';

interface User { id: string; name: string; clientIds?: string[]; clientId?: string; role?: string; }
interface Props { user: User; }

interface TdmRow {
  manifiesto: string;
  fecha_operacion: string;
  remesa: string;
  valor_cobrar: number;
  valor_pagar: number;
  ciudad: string;
}

const TEMPLATE_COLUMNS = ['manifiesto', 'fecha_operacion', 'remesa', 'valor_cobrar', 'valor_pagar', 'ciudad'];

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
      ['MANI-001', today, 'REM-001', 500000, 450000, 'MEDELLIN'],
      ['MANI-002', today, 'REM-002', 320000, 300000, 'CALI'],
    ]);
    ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla TDM');
    XLSX.writeFile(wb, 'plantilla_tdm_operaciones.xlsx');
  };

  // ── Excel parsing ──────────────────────────────────────────────────────────
  const parseFile = (file: File) => {
    setParseError('');
    setPreviewRows([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (jsonRows.length === 0) { setParseError('El archivo no tiene filas de datos.'); return; }

        const normalize = (key: string): string => key.toLowerCase().replace(/\s+/g, '_');
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
            ciudad: String(r['ciudad'] || 'SIN CIUDAD').trim().toUpperCase(),
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
        clientName: selectedClient?.name || '',
        rows: previewRows,
        uploadedBy: user.name,
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
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                Vista previa — {previewRows.length} filas
              </p>
              <button onClick={() => setPreviewRows([])}
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
                    <th className="text-center px-3 py-2">Ciudad</th>
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
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600">{r.ciudad}</span>
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
          loadingResults ? (
            <div className="text-center py-10 text-slate-400 text-sm font-bold">Cargando...</div>
          ) : summaryRows.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin datos en el rango seleccionado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="text-left pb-3 pr-4">Cliente TDM</th>
                    <th className="text-center pb-3 pr-4">Manifiestos</th>
                    <th className="text-right pb-3 pr-4">Total Cobrar</th>
                    <th className="text-right pb-3 pr-4">Total Pagar</th>
                    <th className="text-center pb-3 pr-4">Fecha Desde</th>
                    <th className="text-center pb-3">Fecha Hasta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {summaryRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 font-bold text-amber-700">TDM {r.client_name}</td>
                      <td className="py-3 pr-4 text-center font-black text-slate-900">{Number(r.total_manifiestos).toLocaleString('es-CO')}</td>
                      <td className="py-3 pr-4 text-right font-bold text-emerald-700">{fmt(r.total_cobrar)}</td>
                      <td className="py-3 pr-4 text-right font-bold text-rose-600">{fmt(r.total_pagar)}</td>
                      <td className="py-3 pr-4 text-center text-slate-500 text-xs">{fmtDate(r.fecha_desde)}</td>
                      <td className="py-3 text-center text-slate-500 text-xs">{fmtDate(r.fecha_hasta)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200">
                  <tr className="font-black text-slate-900">
                    <td className="pt-3 pr-4">Total</td>
                    <td className="pt-3 pr-4 text-center">{totalManif.toLocaleString('es-CO')}</td>
                    <td className="pt-3 pr-4 text-right text-emerald-700">{fmt(totalCobrar)}</td>
                    <td className="pt-3 text-right text-rose-600">{fmt(totalPagar)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {/* Tab: Detalle */}
        {activeTab === 'detalle' && (
          loadingResults ? (
            <div className="text-center py-10 text-slate-400 text-sm font-bold">Cargando...</div>
          ) : detailRows.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin registros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="text-left pb-3 pr-4">Manifiesto</th>
                    <th className="text-left pb-3 pr-4">Cliente TDM</th>
                    <th className="text-center pb-3 pr-4">Fecha</th>
                    <th className="text-left pb-3 pr-4">Remesa</th>
                    <th className="text-right pb-3 pr-4">V. Cobrar</th>
                    <th className="text-right pb-3 pr-4">V. Pagar</th>
                    <th className="text-center pb-3 pr-4">Ciudad</th>
                    <th className="text-center pb-3 pr-4">Subido por</th>
                    {isSuperAdmin && <th className="pb-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {detailRows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-4 font-bold text-slate-800">{r.manifiesto}</td>
                      <td className="py-2.5 pr-4 font-bold text-amber-700">TDM {r.client_name}</td>
                      <td className="py-2.5 pr-4 text-center text-slate-600 text-xs">{fmtDate(r.fecha_operacion)}</td>
                      <td className="py-2.5 pr-4 text-slate-500 text-xs">{r.remesa || '—'}</td>
                      <td className="py-2.5 pr-4 text-right font-bold text-emerald-700">{fmt(r.valor_cobrar)}</td>
                      <td className="py-2.5 pr-4 text-right font-bold text-rose-600">{fmt(r.valor_pagar)}</td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600">{r.ciudad}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-center text-slate-400 text-xs">{r.uploaded_by || '—'}</td>
                      {isSuperAdmin && (
                        <td className="py-2.5 text-center">
                          <button onClick={() => {
                            toast.custom((t) => (
                              <div className="bg-white rounded-xl shadow-xl border border-rose-100 p-5 flex flex-col gap-3 min-w-[280px]">
                                <p className="text-sm font-bold text-slate-800">¿Eliminar manifiesto {r.manifiesto}?</p>
                                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => toast.dismiss(t)}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                                  <button onClick={() => { toast.dismiss(t); handleDelete(r.id); }}
                                    className="px-3 py-1.5 text-xs font-bold bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors">Eliminar</button>
                                </div>
                              </div>
                            ), { duration: Infinity });
                          }} disabled={deleting === r.id}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40">
                            {deleting === r.id ? <span className="animate-spin inline-block text-xs">⏳</span> : <Trash2 size={14} />}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
