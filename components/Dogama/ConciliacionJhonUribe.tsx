import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, Loader2, CheckCircle2, Upload, FileDown, X, AlertTriangle, CircleCheck, FileSpreadsheet, Banknote } from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface Props { user: User; }

interface ConciliacionRow {
  id: number;
  orden_maestra: string | null;
  unidades_reales: number | null;
  documento_compras: string | null;
  factura: string | null;
  valor_por_om: string | null;
  tarifa: string | null;
  flete_ida: string | null;
  manifiesto_ida: string | null;
  remesa_ida: string | null;
  pedido_sap: string | null;
  flete_regreso: string | null;
  manifiesto_regreso: string | null;
  remesa_regreso: string | null;
  cantidad_ingresada_cedi: number | null;
  liquidacion_factura: string | null;
  fecha_creacion: string;
  confeccionista_nombre: string | null;
  estado_id: string;
  estado: string | null;
  numero_factura_m7: string | null;
  fecha_factura_m7: string | null;
  fecha_pago_factura: string | null;
}

interface FacturaM7Resumen {
  numero_factura_m7: string;
  fecha_factura_m7: string | null;
  cantidad_oms: number;
  valor_total_enviado: string;
  fecha_pago_factura: string | null;
  pagada: boolean;
}

const fmtCOP = (v: any) => (v === null || v === undefined || v === '') ? '—' : `$${Math.round(Number(v)).toLocaleString('es-CO')}`;
const fmtDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ESTADO_COLORS: Record<string, string> = {
  'EST-03': 'bg-amber-100 text-amber-700',   // PENDIENTE
  'EST-19': 'bg-emerald-100 text-emerald-700', // CONCILIADO
  'EST-16': 'bg-red-100 text-red-700',       // ELIMINADO
};
const ESTADO_PENDIENTE = 'EST-03';
const ESTADO_CONCILIADO = 'EST-19';

const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";

const CAMPOS_COMPARABLES: { key: string; label: string; tipo: 'texto' | 'moneda' | 'fecha' }[] = [
  { key: 'remesa_ida', label: 'Remesa Ida', tipo: 'texto' },
  { key: 'manifiesto_ida', label: 'Manifiesto Ida', tipo: 'texto' },
  { key: 'flete_ida', label: 'Ingreso Tercero Ida', tipo: 'moneda' },
  { key: 'remesa_regreso', label: 'Remesa Regreso', tipo: 'texto' },
  { key: 'manifiesto_regreso', label: 'Manifiesto Regreso', tipo: 'texto' },
  { key: 'flete_regreso', label: 'Ingreso Tercero Regreso', tipo: 'moneda' },
  { key: 'factura', label: 'Factura', tipo: 'texto' },
  { key: 'fecha_factura', label: 'Fecha Factura', tipo: 'fecha' },
];
const CAMPO_INFO: Record<string, { key: string; label: string; tipo: 'texto' | 'moneda' | 'fecha' }> =
  Object.fromEntries(CAMPOS_COMPARABLES.map(c => [c.key, c]));

const ESTADO_CAMPO: Record<string, { label: string; bg: string; text: string }> = {
  coincide: { label: 'Coincide', bg: '', text: 'text-emerald-600' },
  solo_archivo: { label: 'Solo en archivo', bg: 'bg-blue-50', text: 'text-blue-600' },
  solo_sistema: { label: 'Solo en sistema', bg: 'bg-slate-50', text: 'text-slate-500' },
  diferente: { label: 'Diferente', bg: 'bg-amber-50', text: 'text-amber-700' },
};

const fmtCampoValor = (v: any, tipo: 'texto' | 'moneda' | 'fecha') => {
  if (v === null || v === undefined || v === '') return '—';
  if (tipo === 'moneda') return fmtCOP(v);
  if (tipo === 'fecha') return fmtDate(v);
  return String(v);
};

export default function ConciliacionJhonUribe({ user }: Props) {
  const [tab, setTab] = useState<'conciliacion' | 'facturacion'>('conciliacion');
  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {[
          { key: 'conciliacion', label: 'Conciliación' },
          { key: 'facturacion', label: 'Facturación M7' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'conciliacion' && <ConciliacionTab user={user} />}
      {tab === 'facturacion' && <FacturacionM7Tab user={user} />}
    </div>
  );
}

// ══════════════════════════════ TAB: CONCILIACIÓN ═══════════════════════════
function ConciliacionTab({ user }: { user: User }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ConciliacionRow[]>([]);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [aprobando, setAprobando] = useState(false);
  const [aprobarTarget, setAprobarTarget] = useState<{ ids: number[]; label: string } | null>(null);
  const [aprobarNota, setAprobarNota] = useState('');

  const [showValidar, setShowValidar] = useState(false);

  const consultar = async () => {
    setLoading(true);
    setBuscado(true);
    setSelected(new Set());
    try {
      const data = await api.dogamaGetConciliacionJhonUribe({ from: from || undefined, to: to || undefined });
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(`Error al consultar: ${err.message || err}`);
    } finally { setLoading(false); }
  };

  const limpiar = () => {
    setFrom(''); setTo(''); setRows([]); setBuscado(false); setSelected(new Set());
  };

  const seleccionadosPendientes = [...selected].filter(id => rows.some(r => r.id === id && r.estado_id === ESTADO_PENDIENTE));

  const confirmarAprobar = async () => {
    if (!aprobarTarget) return;
    setAprobando(true);
    try {
      const res: any = await api.dogamaConciliarOrdenesServicio({
        ids: aprobarTarget.ids,
        nota: aprobarNota.trim() || undefined,
        usuario_actualizacion: user?.name || user?.email,
      });
      toast.success(`${res.conciliados} fila(s) conciliada(s) — ${aprobarTarget.label}`);
      setSelected(new Set());
      setAprobarTarget(null);
      setAprobarNota('');
      await consultar();
    } catch (err: any) {
      toast.error(`Error al conciliar: ${err.message || err}`);
    } finally { setAprobando(false); }
  };

  const columns: ColumnDef<ConciliacionRow>[] = [
    { header: 'Orden Maestra', key: 'orden_maestra', sortable: true, render: r => <span className="font-mono font-black text-slate-900">{r.orden_maestra || '—'}</span> },
    { header: 'Unidades Reales', key: 'unidades_reales', sortable: true, render: r => r.unidades_reales ?? '—' },
    { header: 'Documento Compras', key: 'documento_compras', sortable: true, render: r => <span className="font-mono">{r.documento_compras || '—'}</span> },
    { header: 'Factura', key: 'factura', sortable: true, render: r => r.factura || '—' },
    { header: 'Valor por OM', key: 'valor_por_om', sortable: true, render: r => <span className="font-black text-slate-800">{fmtCOP(r.valor_por_om)}</span> },
    { header: 'Tarifa', key: 'tarifa', sortable: true, render: r => fmtCOP(r.tarifa) },
    { header: 'Flete Ida', key: 'flete_ida', sortable: true, render: r => fmtCOP(r.flete_ida) },
    { header: 'Manifiesto Ida', key: 'manifiesto_ida', sortable: true, render: r => r.manifiesto_ida || '—' },
    { header: 'Remesa Ida', key: 'remesa_ida', sortable: true, render: r => r.remesa_ida || '—' },
    { header: 'Pedido SAP', key: 'pedido_sap', sortable: true, render: r => r.pedido_sap || '—' },
    { header: 'Flete Regreso', key: 'flete_regreso', sortable: true, render: r => fmtCOP(r.flete_regreso) },
    { header: 'Manifiesto Regreso', key: 'manifiesto_regreso', sortable: true, render: r => r.manifiesto_regreso || '—' },
    { header: 'Remesa Regreso', key: 'remesa_regreso', sortable: true, render: r => r.remesa_regreso || '—' },
    { header: 'Cantidad Ingresada al CEDI', key: 'cantidad_ingresada_cedi', sortable: true, render: r => r.cantidad_ingresada_cedi ?? 0 },
    { header: 'Liquidacion Factura', key: 'liquidacion_factura', sortable: true, render: r => fmtDate(r.liquidacion_factura) },
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true, render: r => r.confeccionista_nombre || '—' },
    {
      header: 'Estado', key: 'estado', sortable: true,
      render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${ESTADO_COLORS[r.estado_id] || 'bg-slate-100 text-slate-500'}`}>{r.estado || r.estado_id}</span>,
    },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: r => r.estado_id !== ESTADO_PENDIENTE ? null : (
        <button
          disabled={aprobando}
          onClick={() => setAprobarTarget({ ids: [r.id], label: `OM ${r.orden_maestra}` })}
          title="Aprobar esta fila"
          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-black text-[9px] uppercase"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 mb-5">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Filtrar por rango de fecha (opcional)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Desde</label><input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className={labelCls}>Hasta</label><input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="flex items-end gap-2 col-span-2">
            <button onClick={consultar} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Consultar
            </button>
            <button onClick={limpiar}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest">
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {!buscado ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2">
          <Search className="w-10 h-10 text-slate-300" />
          <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Consulta de Conciliación</p>
          <p className="text-[10px] text-slate-400">Aplica un rango de fechas (o deja vacío para ver todo) y presiona Consultar</p>
        </div>
      ) : (
        <DataTable<ConciliacionRow>
          data={rows}
          columns={columns}
          searchPlaceholder="Buscar OM, OC, Pedido SAP, confeccionista..."
          excelFileName="conciliacion_jhon_uribe.xlsx"
          excelSheetName="Conciliación"
          loading={loading}
          selectable
          isRowSelectable={r => r.estado_id === ESTADO_PENDIENTE}
          selectedIds={selected}
          onSelectionChange={setSelected}
          toolbarActions={
            <>
              <button onClick={() => setShowValidar(true)}
                className="flex items-center gap-2 px-4 py-3.5 bg-white border-2 border-indigo-200 hover:bg-indigo-50 text-indigo-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                <FileSpreadsheet className="w-4 h-4" /> Validar por Excel
              </button>
              {seleccionadosPendientes.length > 0 && (
                <button
                  disabled={aprobando}
                  onClick={() => setAprobarTarget({ ids: seleccionadosPendientes as number[], label: `${seleccionadosPendientes.length} fila(s) seleccionada(s)` })}
                  className="flex items-center gap-2 px-4 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                  {aprobando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Aprobar seleccionados ({seleccionadosPendientes.length})
                </button>
              )}
            </>
          }
        />
      )}

      {/* Confirmar aprobación — nota opcional */}
      {aprobarTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-1">Aprobar Conciliación</p>
            <p className="text-sm text-slate-500 mb-4">{aprobarTarget.label}</p>
            <label className={labelCls}>Nota (opcional)</label>
            <textarea value={aprobarNota} onChange={e => setAprobarNota(e.target.value)} rows={3}
              placeholder="Observación de la conciliación..."
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <div className="flex gap-3">
              <button onClick={() => { setAprobarTarget(null); setAprobarNota(''); }} disabled={aprobando}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition">
                Cancelar
              </button>
              <button onClick={confirmarAprobar} disabled={aprobando}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50 transition">
                {aprobando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {aprobando ? 'Aprobando…' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showValidar && (
        <ValidarExcelModal user={user} onClose={() => setShowValidar(false)} onAprobado={() => { setShowValidar(false); consultar(); }} />
      )}
    </div>
  );
}

// ── Modal: Validar Pendientes por Excel ──────────────────────────────────────
// Compara el archivo subido contra las OS pendientes del sistema. Solo lo que coincide
// EXACTAMENTE en todos los campos queda habilitado para conciliar de forma masiva.
// Tabla campo por campo (Sistema vs Archivo) reutilizada tanto en "Coinciden exacto" como en
// "Con diferencias" — así siempre se ve el detalle de remesas, manifiestos, fletes, factura y
// fecha de ida/regreso que sustenta el resultado, no solo la etiqueta del Pedido.
const CamposTable: React.FC<{ campos: any[] }> = ({ campos }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[10px]">
      <thead>
        <tr className="text-slate-400 uppercase tracking-wider">
          <th className="text-left font-black pr-3 pb-1">Campo</th>
          <th className="text-left font-black pr-3 pb-1">Sistema</th>
          <th className="text-left font-black pr-3 pb-1">Archivo</th>
          <th className="text-left font-black pb-1">Estado</th>
        </tr>
      </thead>
      <tbody>
        {campos.filter((c: any) => c.estado !== 'sin_datos').map((c: any) => {
          const info = CAMPO_INFO[c.key];
          const est = ESTADO_CAMPO[c.estado] || ESTADO_CAMPO.diferente;
          return (
            <tr key={c.key} className={est.bg}>
              <td className="pr-3 py-1 text-slate-500 font-bold">{info?.label || c.key}</td>
              <td className="pr-3 py-1 font-bold text-slate-600">
                {c.sistema.length ? c.sistema.map((v: any) => fmtCampoValor(v, info?.tipo || 'texto')).join(' / ') : '—'}
              </td>
              <td className="pr-3 py-1 font-bold text-slate-600">{fmtCampoValor(c.archivo, info?.tipo || 'texto')}</td>
              <td className={`py-1 font-black ${est.text}`}>{est.label}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

function ValidarExcelModal({ user, onClose, onAprobado }: { user: User; onClose: () => void; onAprobado: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [validando, setValidando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [reporte, setReporte] = useState<{ total: number; coincidencias: any[]; diferencias: any[]; soloEnArchivo: any[]; soloEnSistema: any[] } | null>(null);
  const [notaAprobacion, setNotaAprobacion] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const totalIdsCoincidencias = reporte?.coincidencias.reduce((s, c) => s + c.ids.length, 0) || 0;

  const handleDescargarPlantilla = async () => {
    setDescargando(true);
    try { await api.dogamaDescargarPlantillaConciliacion(); }
    catch (e: any) { toast.error(e.message || 'No se pudo descargar la plantilla'); }
    finally { setDescargando(false); }
  };

  const handleValidar = async () => {
    if (!file) { toast.error('Selecciona el archivo Excel'); return; }
    setValidando(true);
    try {
      const res = await api.dogamaValidarConciliacionXlsx(file);
      setReporte(res);
    } catch (e: any) { toast.error(e.message || 'No se pudo validar el archivo'); }
    finally { setValidando(false); }
  };

  const handleAprobarCoincidencias = async () => {
    if (!reporte?.coincidencias.length) return;
    setAprobando(true);
    try {
      const res: any = await api.dogamaConciliarOrdenesServicio({
        ids: reporte.coincidencias.flatMap(c => c.ids),
        nota: notaAprobacion.trim() || 'Conciliación masiva validada por Excel — coincidencia exacta en todos los campos.',
        usuario_actualizacion: user?.name || user?.email,
      });
      toast.success(`${res.conciliados} fila(s) conciliada(s) por coincidencia exacta.`);
      onAprobado();
    } catch (e: any) { toast.error(e.message || 'No se pudo conciliar'); }
    finally { setAprobando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
          <p className="text-lg font-black text-white">Validar Pendientes por Excel</p>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          {!reporte ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Sube el archivo con las columnas Entrega, Pedido, Fecha Entrega, Pto. Plan, Transporte, Placa, Factura, Fecha Factura,
                Solicitante, Origen, Destino e Ingreso tercero — cada Pedido (código SAP) trae 2 filas (ida y regreso). Se compara Entrega
                (remesa), Transporte (manifiesto) e Ingreso tercero de cada tramo, más Factura y Fecha Factura, contra las OS
                <span className="font-black"> pendientes</span> del sistema. Solo lo que coincida exactamente en todos los campos podrá
                pasar a estado Conciliación de forma masiva.
              </p>
              <button onClick={handleDescargarPlantilla} disabled={descargando}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-black uppercase tracking-widest disabled:opacity-60">
                {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Descargar Plantilla de Ejemplo
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => fileRef.current?.click()}
                className={`w-full py-3 rounded-2xl border-2 border-dashed text-sm font-semibold transition ${file ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600'}`}>
                {file ? `✓ ${file.name}` : 'Seleccionar archivo .xlsx…'}
              </button>
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button onClick={handleValidar} disabled={validando || !file}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">
                  {validando && <Loader2 className="w-4 h-4 animate-spin" />} {validando ? 'Validando…' : 'Validar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Coinciden exacto</p>
                  <p className="text-2xl font-black text-emerald-800">{totalIdsCoincidencias}</p>
                </div>
                <div className="rounded-2xl border-2 border-amber-100 bg-amber-50 p-3">
                  <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Con diferencias</p>
                  <p className="text-2xl font-black text-amber-800">{reporte.diferencias.length}</p>
                </div>
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Solo en archivo</p>
                  <p className="text-2xl font-black text-slate-700">{reporte.soloEnArchivo.length}</p>
                </div>
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Solo en sistema</p>
                  <p className="text-2xl font-black text-slate-700">{reporte.soloEnSistema.length}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CircleCheck className="w-3.5 h-3.5" /> Coinciden exacto — listas para conciliar</p>
                <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                  {reporte.coincidencias.length ? reporte.coincidencias.map((c, i) => (
                    <div key={c.id ?? `ok-${i}`} className="px-3 py-2.5 text-xs">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-mono font-bold">Pedido SAP {c.pedido}</span>
                        {c.multiplesOm && <span className="text-[9px] font-black text-emerald-600 uppercase">{c.ids.length} OM idénticas — se aprueban todas</span>}
                      </div>
                      <CamposTable campos={c.campos} />
                    </div>
                  )) : <p className="text-xs text-slate-300 text-center py-4">Ninguna</p>}
                </div>
              </div>

              {reporte.diferencias.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Con diferencias — no se concilian automáticamente</p>
                  <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                    {reporte.diferencias.map((d, i) => (
                      <div key={d.id ?? `multi-${i}`} className="px-3 py-2.5 text-xs">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-mono font-bold">Pedido SAP {d.pedido}</span>
                          {d.multiplesOm && <span className="text-[9px] font-black text-amber-600 uppercase">{d.ids.length} OM pendientes bajo este Pedido — revisión manual</span>}
                        </div>
                        <CamposTable campos={d.campos} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Solo en archivo (no existen en sistema)</p>
                  <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                    {reporte.soloEnArchivo.length ? reporte.soloEnArchivo.map((s, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs flex justify-between"><span className="font-mono font-bold">Pedido SAP {s.pedido}</span></div>
                    )) : <p className="text-xs text-slate-300 text-center py-4">Ninguna</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Solo en sistema (pendientes no incluidas en el archivo)</p>
                  <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                    {reporte.soloEnSistema.length ? reporte.soloEnSistema.map(s => (
                      <div key={s.id} className="px-3 py-1.5 text-xs flex justify-between"><span className="font-mono font-bold">Pedido SAP {s.pedido}</span></div>
                    )) : <p className="text-xs text-slate-300 text-center py-4">Ninguna</p>}
                  </div>
                </div>
              </div>

              {totalIdsCoincidencias > 0 && (
                <div>
                  <label className={labelCls}>Nota general de aprobación (opcional)</label>
                  <textarea value={notaAprobacion} onChange={e => setNotaAprobacion(e.target.value)} rows={2}
                    placeholder="Observación para todas las coincidencias que se van a conciliar..."
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setReporte(null)} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Volver</button>
                <button onClick={handleAprobarCoincidencias} disabled={aprobando || !totalIdsCoincidencias}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50">
                  {aprobando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {aprobando ? 'Aprobando…' : `Aprobar ${totalIdsCoincidencias} coincidencia(s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════ TAB: FACTURACIÓN M7 ══════════════════════════
function FacturacionM7Tab({ user }: { user: User }) {
  const [loading, setLoading] = useState(true);
  const [conciliadas, setConciliadas] = useState<ConciliacionRow[]>([]);
  const [facturas, setFacturas] = useState<FacturaM7Resumen[]>([]);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const [showRegistrar, setShowRegistrar] = useState(false);
  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaFactura, setFechaFactura] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pagoTarget, setPagoTarget] = useState<FacturaM7Resumen | null>(null);
  const [fechaPago, setFechaPago] = useState('');
  const [marcandoPago, setMarcandoPago] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [conc, fact] = await Promise.all([
        api.dogamaGetConciliacionJhonUribe({}),
        api.dogamaGetFacturasM7(),
      ]);
      setConciliadas(Array.isArray(conc) ? conc.filter((r: ConciliacionRow) => r.estado_id === ESTADO_CONCILIADO && !r.numero_factura_m7) : []);
      setFacturas(Array.isArray(fact) ? fact : []);
    } catch (e: any) { toast.error(`Error al cargar: ${e.message || e}`); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { loadAll(); }, []);

  const seleccionadas = [...selected].filter(id => conciliadas.some(r => r.id === id));

  const handleDescargarPlantilla = async () => {
    setDescargandoPlantilla(true);
    try { await api.dogamaDescargarPlantillaFacturaM7(); }
    catch (e: any) { toast.error(e.message || 'No se pudo descargar la plantilla'); }
    finally { setDescargandoPlantilla(false); }
  };

  const handleRegistrar = async () => {
    if (!seleccionadas.length) { toast.error('Selecciona al menos una OM conciliada'); return; }
    if (!numeroFactura.trim() || !fechaFactura) { toast.error('El número de factura M7 y su fecha son obligatorios — se registran juntos'); return; }
    setGuardando(true);
    try {
      const res: any = await api.dogamaRegistrarFacturaM7({
        ids: seleccionadas as number[], numero_factura_m7: numeroFactura.trim(), fecha_factura_m7: fechaFactura,
        usuario_actualizacion: user?.name || user?.email,
      });
      toast.success(`Factura M7 registrada en ${res.actualizados} OM(s).`);
      setShowRegistrar(false); setNumeroFactura(''); setFechaFactura(''); setSelected(new Set());
      await loadAll();
    } catch (e: any) { toast.error(e.message || 'No se pudo registrar la factura M7'); }
    finally { setGuardando(false); }
  };

  const handleImport = async () => {
    if (!importFile) { toast.error('Selecciona el archivo Excel'); return; }
    setImporting(true);
    try {
      const res: any = await api.dogamaImportarFacturaM7Xlsx(importFile, user?.name || user?.email);
      toast.success(`Factura M7 aplicada a ${res.actualizados} OM(s)${res.sinCoincidencia ? ` — ${res.sinCoincidencia} sin coincidencia` : ''}${res.incompletos ? ` — ${res.incompletos} fila(s) incompleta(s)` : ''}.`);
      setShowImport(false); setImportFile(null);
      await loadAll();
    } catch (e: any) { toast.error(e.message || 'No se pudo importar el archivo'); }
    finally { setImporting(false); }
  };

  const confirmarPago = async (marcar: boolean) => {
    if (!pagoTarget) return;
    if (marcar && !fechaPago) { toast.error('Indica la fecha de pago'); return; }
    setMarcandoPago(true);
    try {
      await api.dogamaMarcarPagoFacturaM7({
        numero_factura_m7: pagoTarget.numero_factura_m7, fecha_pago_factura: marcar ? fechaPago : null,
        usuario_actualizacion: user?.name || user?.email,
      });
      toast.success(marcar ? 'Factura marcada como pagada.' : 'Factura marcada como no pagada.');
      setPagoTarget(null); setFechaPago('');
      await loadAll();
    } catch (e: any) { toast.error(e.message || 'No se pudo actualizar el pago'); }
    finally { setMarcandoPago(false); }
  };

  const columnsConciliadas: ColumnDef<ConciliacionRow>[] = [
    { header: 'Orden Maestra', key: 'orden_maestra', sortable: true, render: r => <span className="font-mono font-black text-slate-900">{r.orden_maestra || '—'}</span> },
    { header: 'Documento Compras', key: 'documento_compras', sortable: true, render: r => <span className="font-mono">{r.documento_compras || '—'}</span> },
    { header: 'Pedido SAP', key: 'pedido_sap', sortable: true, render: r => r.pedido_sap || '—' },
    { header: 'Valor por OM', key: 'valor_por_om', sortable: true, render: r => <span className="font-black text-slate-800">{fmtCOP(r.valor_por_om)}</span> },
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true, render: r => r.confeccionista_nombre || '—' },
  ];

  const columnsFacturas: ColumnDef<FacturaM7Resumen>[] = [
    { header: 'Numero Factura M7', key: 'numero_factura_m7', sortable: true, render: r => <span className="font-mono font-black text-slate-900">{r.numero_factura_m7}</span> },
    { header: 'Fecha Factura M7', key: 'fecha_factura_m7', sortable: true, render: r => fmtDate(r.fecha_factura_m7) },
    { header: 'OMs Incluidas', key: 'cantidad_oms', sortable: true },
    { header: 'Valor Total Enviado', key: 'valor_total_enviado', sortable: true, render: r => <span className="font-black text-slate-800">{fmtCOP(r.valor_total_enviado)}</span> },
    {
      header: 'Estado de Pago', key: 'pagada', sortable: true,
      render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.pagada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.pagada ? 'Pagada' : 'No Pagada'}</span>,
    },
    { header: 'Fecha de Pago', key: 'fecha_pago_factura', sortable: true, render: r => fmtDate(r.fecha_pago_factura) },
    {
      header: 'Acciones', key: 'numero_factura_m7', sortable: false,
      render: r => (
        <button onClick={() => { setPagoTarget(r); setFechaPago(r.fecha_pago_factura ? r.fecha_pago_factura.slice(0, 10) : new Date().toISOString().slice(0, 10)); }}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-black text-[9px] uppercase">
          <Banknote className="w-3.5 h-3.5" /> {r.pagada ? 'Editar Pago' : 'Marcar Pago'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OMs Conciliadas Sin Factura M7</p>
          <div className="flex gap-2">
            <button onClick={handleDescargarPlantilla} disabled={descargandoPlantilla}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-xl disabled:opacity-60">
              {descargandoPlantilla ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Plantilla
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
              <Upload className="w-3.5 h-3.5" /> Importar Excel
            </button>
          </div>
        </div>
        <DataTable<ConciliacionRow>
          data={conciliadas}
          columns={columnsConciliadas}
          searchPlaceholder="Buscar OM, OC, Pedido SAP..."
          excelFileName="conciliadas_sin_factura_m7.xlsx"
          excelSheetName="Sin Factura M7"
          loading={loading}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          toolbarActions={
            seleccionadas.length > 0 && (
              <button onClick={() => setShowRegistrar(true)}
                className="flex items-center gap-2 px-4 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                <CheckCircle2 className="w-4 h-4" /> Registrar Factura M7 ({seleccionadas.length})
              </button>
            )
          }
        />
      </div>

      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Facturas M7 y Pago</p>
        <DataTable<FacturaM7Resumen>
          data={facturas}
          columns={columnsFacturas}
          searchPlaceholder="Buscar número de factura..."
          excelFileName="facturas_m7.xlsx"
          excelSheetName="Facturas M7"
          loading={loading}
        />
      </div>

      {/* Diálogo: registrar factura M7 sobre las OM seleccionadas */}
      {showRegistrar && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
              <p className="text-lg font-black text-white">Registrar Factura M7</p>
              <button onClick={() => setShowRegistrar(false)} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">{seleccionadas.length} OM(s) seleccionada(s). El número y la fecha se registran juntos.</p>
              <div><label className={labelCls}>Numero Factura M7 *</label><input className={inputCls} value={numeroFactura} onChange={e => setNumeroFactura(e.target.value)} placeholder="Ej: FM7-000123" /></div>
              <div><label className={labelCls}>Fecha Factura M7 *</label><input type="date" className={inputCls} value={fechaFactura} onChange={e => setFechaFactura(e.target.value)} /></div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowRegistrar(false)} disabled={guardando} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleRegistrar} disabled={guardando}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo: importar Excel de facturación M7 */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-6 py-4">
              <p className="text-xs font-black text-teal-200 uppercase tracking-widest mb-0.5">Facturación M7</p>
              <p className="text-lg font-black text-white">Importar Excel</p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">El archivo debe tener OM (u OC), Numero Factura M7 y Fecha Factura M7. Solo aplica sobre OMs ya conciliadas.</p>
              <button onClick={handleDescargarPlantilla} disabled={descargandoPlantilla}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 text-xs font-black uppercase tracking-widest disabled:opacity-60">
                {descargandoPlantilla ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Descargar Plantilla de Ejemplo
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => fileRef.current?.click()}
                className={`w-full py-3 rounded-2xl border-2 border-dashed text-sm font-semibold transition ${importFile ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-600'}`}>
                {importFile ? `✓ ${importFile.name}` : 'Seleccionar archivo .xlsx…'}
              </button>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => { setShowImport(false); setImportFile(null); }} disabled={importing}
                className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleImport} disabled={importing || !importFile}
                className="flex-1 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />} {importing ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo: marcar pago de factura M7 */}
      {pagoTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-1">Pago de Factura M7</p>
            <p className="text-sm text-slate-500 mb-1">{pagoTarget.numero_factura_m7}</p>
            <p className="text-sm text-slate-500 mb-4">Valor total enviado: <span className="font-black text-slate-800">{fmtCOP(pagoTarget.valor_total_enviado)}</span></p>
            <label className={labelCls}>Fecha de pago</label>
            <input type="date" className={`${inputCls} mb-5`} value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setPagoTarget(null)} disabled={marcandoPago}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              {pagoTarget.pagada && (
                <button onClick={() => confirmarPago(false)} disabled={marcandoPago}
                  className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-amber-200 text-amber-700 text-sm font-black hover:bg-amber-50 disabled:opacity-50">
                  No Pagada
                </button>
              )}
              <button onClick={() => confirmarPago(true)} disabled={marcandoPago}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50">
                {marcandoPago ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Marcar Pagada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
