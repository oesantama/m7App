import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Upload, Loader2, Trash2, DollarSign, TrendingUp, Package, Users, X, Search, Plus, FileDown, Pencil, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';
import { LineaManualForm, MESES, DetalleEditable } from './LineaManualForm';

interface Props { user: User; }

interface Cliente { id: number; codigo: string; nombre: string; moneda: 'USD' | 'COP'; sede: 'CAF' | 'M7' | null; }
interface MasterItem { id: number; nombre: string; }
interface Registro {
  id: number; cliente_id: number; cliente_nombre: string; cliente_codigo: string; cliente_moneda: 'USD' | 'COP';
  anio: number; mes: string; subtipo: string | null; hoja_origen: string | null;
  moneda: 'USD' | 'COP'; valor_total: string; costo_transporte_total: string; utilidad: string;
  num_lineas: number; referencia_factura: string | null; fecha_creacion: string;
}
interface DetalleRow {
  id: number; fecha: string | null; producto_servicio_nombre: string | null; descripcion: string | null;
  orden: string | null; cantidad: string; tarifa: string; monto: string;
  costo_transportista: string | null; transportista_nombre: string | null; seguimiento: string | null;
  nota: string | null;
}

// COP no maneja centavos en la práctica (convención del país); USD sí — y ahí es donde antes se
// perdía precisión: Math.round() descartaba los centavos por completo. Ahora USD siempre muestra
// 2 decimales exactos, sin redondear.
const fmt = (v: any, moneda: string) => {
  const n = Number(v) || 0;
  return moneda === 'USD'
    ? `US$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${Math.round(n).toLocaleString('es-CO')}`;
};
// Fecha por sede del cliente — CAF (USA) en MM/DD/AAAA, M7 (Colombia) en DD/MM/AAAA. Se opera
// directo sobre el string "YYYY-MM-DD" (nunca con `new Date()`) para no arrastrar el problema de
// interpretación UTC ya conocido en este proyecto.
const fmtFechaPorSede = (fecha: string | null, sede: 'CAF' | 'M7' | null | undefined) => {
  if (!fecha) return '—';
  const [y, m, d] = fecha.slice(0, 10).split('-');
  if (!y || !m || !d) return fecha;
  return sede === 'CAF' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
};

const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";

const KpiCard: React.FC<{ label: string; value: string; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className={`rounded-2xl border-2 p-4 ${color}`}>
    <div className="flex items-center justify-between">
      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</p>
      {icon}
    </div>
    <p className="text-xl font-black mt-1">{value}</p>
  </div>
);

// ── Modal Detalle (compartido por las 2 pestañas) ───────────────────────────
// Incluye el mismo formulario de captura de línea (reutilizado), en modo "período fijo":
// se puede agregar un ítem/producto/valor nuevo directamente a ESTE registro ya existente,
// editar o eliminar una línea puntual, y saltar rápido a otro cliente/período sin cerrar.
const DetalleModal: React.FC<{
  registro: Registro; onClose: () => void; clientes: Cliente[]; registros: Registro[];
  onRegistroChanged?: () => void; onSwitchRegistro?: (r: Registro) => void;
}> = ({ registro, onClose, clientes, registros, onRegistroChanged, onSwitchRegistro }) => {
  const { t, i18n } = useTranslation(['fulfillment', 'common']);
  const dateLocale = i18n.language.startsWith('en') ? 'en-US' : 'es-CO';
  const cliente = clientes.find(c => c.id === registro.cliente_id);
  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<MasterItem[]>([]);
  const [transportistas, setTransportistas] = useState<MasterItem[]>([]);
  const [editLinea, setEditLinea] = useState<DetalleRow | null>(null);
  const [delLinea, setDelLinea] = useState<DetalleRow | null>(null);
  const [deletingLinea, setDeletingLinea] = useState(false);

  const cargarDetalle = async () => {
    setLoading(true);
    try {
      const res = await api.getFulfillmentRegistroDetalle(registro.id);
      setRows(res.success ? res.detalle : []);
    } catch { toast.error(t('common:toast.loadError')); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    cargarDetalle();
    api.getFulfillmentProductos().then(r => setProductos(r.success ? r.data : [])).catch(() => {});
    api.getFulfillmentTransportistas().then(r => setTransportistas(r.success ? r.data : [])).catch(() => {});
  }, [registro.id]);

  const handleLineaAgregada = () => {
    cargarDetalle();
    onRegistroChanged?.();
  };
  const handleLineaEditada = () => {
    setEditLinea(null);
    cargarDetalle();
    onRegistroChanged?.();
  };

  const confirmarEliminarLinea = async () => {
    if (!delLinea) return;
    setDeletingLinea(true);
    try {
      const res = await api.deleteFulfillmentDetalleManual(delLinea.id);
      if (res.success) { toast.success(t('fulfillment:registro.toastLineDeleted')); setDelLinea(null); cargarDetalle(); onRegistroChanged?.(); }
      else toast.error(res.error || t('fulfillment:registro.toastLineDeleteError'));
    } catch (e: any) { toast.error(e.message || t('fulfillment:registro.toastLineDeleteError')); }
    finally { setDeletingLinea(false); }
  };

  // Columnas visibles al cliente (Fecha→Monto) primero; las internas (Costo Transportista,
  // Transportista, Seguimiento, Nota) van marcadas aparte con un estilo de fondo distinto, para
  // que quede claro a simple vista que esa información nunca se comparte con el cliente.
  const columns: ColumnDef<DetalleRow>[] = [
    { header: t('fulfillment:registro.colDate'), key: 'fecha', sortable: true, render: r => fmtFechaPorSede(r.fecha, cliente?.sede) },
    { header: t('fulfillment:registro.colProduct'), key: 'producto_servicio_nombre', sortable: true },
    { header: t('fulfillment:registro.colDescription'), key: 'descripcion', sortable: false },
    { header: t('fulfillment:registro.colOrder'), key: 'orden', sortable: true, render: r => r.orden || '—' },
    { header: t('fulfillment:registro.colQuantity'), key: 'cantidad', sortable: true },
    { header: t('fulfillment:registro.colRate'), key: 'tarifa', sortable: true, render: r => fmt(r.tarifa, registro.moneda) },
    { header: t('fulfillment:registro.colAmount'), key: 'monto', sortable: true, render: r => <span className="font-black">{fmt(r.monto, registro.moneda)}</span> },
    {
      header: t('fulfillment:registro.colCarrierCost'), key: 'costo_transportista', sortable: true,
      headerClassName: 'bg-slate-800', cellClassName: 'bg-slate-50/70',
      render: r => r.costo_transportista ? fmt(r.costo_transportista, registro.moneda) : '—',
    },
    { header: t('fulfillment:registro.colCarrier'), key: 'transportista_nombre', sortable: true, cellClassName: 'bg-slate-50/70', render: r => r.transportista_nombre || '—' },
    { header: t('fulfillment:registro.colTracking'), key: 'seguimiento', sortable: true, cellClassName: 'bg-slate-50/70', render: r => r.seguimiento || '—' },
    { header: t('fulfillment:registro.colNote'), key: 'nota', sortable: true, cellClassName: 'bg-slate-50/70', render: r => r.nota || '—' },
    {
      header: t('common:fields.actions'), key: 'id', sortable: false,
      render: r => (
        <div className="flex gap-2 items-center">
          <button onClick={() => setEditLinea(r)} title={t('common:actions.edit')} className="text-indigo-600 hover:text-indigo-800"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => setDelLinea(r)} title={t('common:actions.delete')} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  // Excel "Cliente" — solo lo que se les entrega cada mes para conciliar (Fecha→Monto, con Orden).
  // Formateado con el mismo criterio de fecha por sede que se ve en pantalla.
  const exportarCliente = () => {
    const headers = [
      t('fulfillment:registro.colDate'), t('fulfillment:registro.colProduct'), t('fulfillment:registro.colDescription'),
      t('fulfillment:registro.colOrder'), t('fulfillment:registro.colQuantity'), t('fulfillment:registro.colRate'), t('fulfillment:registro.colAmount'),
    ];
    const data = rows.map(r => [
      fmtFechaPorSede(r.fecha, cliente?.sede), r.producto_servicio_nombre || '', r.descripcion || '', r.orden || '',
      Number(r.cantidad) || 0, Number(r.tarifa) || 0, Number(r.monto) || 0,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cliente');
    XLSX.writeFile(wb, `fulfillment_${registro.cliente_codigo}_${registro.mes}_${registro.anio}_cliente.xlsx`);
  };

  const periodosDelCliente = registros.filter(r => r.cliente_id === registro.cliente_id);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-8 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-black text-indigo-200 uppercase tracking-widest mb-0.5">{registro.cliente_nombre}</p>
              <p className="text-lg font-black text-white">{t(`common:months.${registro.mes}`)} {registro.anio}{registro.subtipo ? ` · ${registro.subtipo}` : ''}</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          {onSwitchRegistro && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-white/15 text-white border border-white/20 outline-none"
                value={registro.cliente_id}
                onChange={e => {
                  const nuevoCliente = Number(e.target.value);
                  const primero = registros.find(r => r.cliente_id === nuevoCliente);
                  if (primero) onSwitchRegistro(primero);
                }}
              >
                {clientes.map(c => <option key={c.id} value={c.id} className="text-slate-800">{c.nombre}</option>)}
              </select>
              <select
                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-white/15 text-white border border-white/20 outline-none"
                value={registro.id}
                onChange={e => {
                  const target = periodosDelCliente.find(r => r.id === Number(e.target.value));
                  if (target) onSwitchRegistro(target);
                }}
              >
                {periodosDelCliente.map(r => (
                  <option key={r.id} value={r.id} className="text-slate-800">{t(`common:months.${r.mes}`)} {r.anio}{r.subtipo ? ` · ${r.subtipo}` : ''}</option>
                ))}
              </select>
              <span className="text-[9px] text-white/60 font-bold">{t('fulfillment:registro.quickSwitchHint')}</span>
            </div>
          )}
        </div>
        <div className="p-6">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 mb-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('fulfillment:registro.detailAddHint')}</p>
            <LineaManualForm
              clientes={clientes} productos={productos} transportistas={transportistas}
              periodoFijo={{ cliente_id: registro.cliente_id, anio: registro.anio, mes: registro.mes, subtipo: registro.subtipo }}
              onSaved={handleLineaAgregada}
            />
          </div>
          <div className="flex justify-end mb-3">
            <button onClick={exportarCliente} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-emerald-200 hover:bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-xl">
              <Download className="w-3.5 h-3.5" /> {t('fulfillment:registro.exportClient')}
            </button>
          </div>
          {loading
            ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            : <DataTable<DetalleRow> data={rows} columns={columns} defaultPageSize={100} searchPlaceholder={t('common:actions.searchPlaceholder')}
                excelFileName={`fulfillment_${registro.cliente_codigo}_${registro.mes}_${registro.anio}_interno.xlsx`} excelSheetName="Detalle" />
          }
        </div>
      </div>

      {/* Editar línea — mismo formulario, en modo edición */}
      {editLinea && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
              <p className="text-lg font-black text-white">{t('fulfillment:registro.editLineTitle')}</p>
              <button onClick={() => setEditLinea(null)} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <LineaManualForm
                clientes={clientes} productos={productos} transportistas={transportistas}
                periodoFijo={{ cliente_id: registro.cliente_id, anio: registro.anio, mes: registro.mes, subtipo: registro.subtipo }}
                editDetalle={editLinea as DetalleEditable}
                onSaved={handleLineaEditada}
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar línea */}
      {delLinea && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-1">{t('fulfillment:registro.deleteLineTitle')}</p>
            <p className="text-sm text-slate-500 mb-5">{t('fulfillment:registro.deleteLineConfirm')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDelLinea(null)} disabled={deletingLinea} className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">{t('common:actions.cancel')}</button>
              <button onClick={confirmarEliminarLinea} disabled={deletingLinea} className="flex-1 px-4 py-2.5 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {deletingLinea && <Loader2 className="w-4 h-4 animate-spin" />} {t('common:actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function RegistroLegalizacionFulfillment({ user }: Props) {
  const { t } = useTranslation('fulfillment');
  const [tab, setTab] = useState<'consulta' | 'registro'>('consulta');
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    api.getFulfillmentClientes().then(res => setClientes(res.success ? res.data : [])).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {[
          { key: 'consulta', label: t('registro.tabConsulta') },
          { key: 'registro', label: t('registro.tabRegistro') },
        ].map(tItem => (
          <button key={tItem.key} onClick={() => setTab(tItem.key as any)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === tItem.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {tItem.label}
          </button>
        ))}
      </div>
      {tab === 'consulta' && <ConsultaTab clientes={clientes} />}
      {tab === 'registro' && <RegistroTab clientes={clientes} user={user} />}
    </div>
  );
}

// ══════════════════════════════ TAB: CONSULTA (solo lectura) ═══════════════
function ConsultaTab({ clientes }: { clientes: Cliente[] }) {
  const { t } = useTranslation(['fulfillment', 'common']);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [resumen, setResumen] = useState<{ porMoneda: any[]; topTransportistas: any[]; topProductos: any[] } | null>(null);
  const [detalleReg, setDetalleReg] = useState<Registro | null>(null);

  const buscar = async (opts?: { latest?: boolean }) => {
    setLoading(true);
    const filtros = opts?.latest
      ? { latest: true }
      : { cliente_id: filtroCliente || undefined, anio: filtroAnio || undefined, mes: filtroMes || undefined };
    try {
      const [regRes, resRes] = await Promise.all([
        api.getFulfillmentRegistros(filtros),
        api.getFulfillmentResumenGerencial(filtros),
      ]);
      setRegistros(regRes.success ? regRes.data : []);
      if (resRes.success) setResumen(resRes);
    } catch { toast.error(t('fulfillment:registro.toastConsultError')); }
    finally { setLoading(false); }
  };

  // Al entrar, se muestra automáticamente solo el último mes/año — sin necesidad de filtrar.
  useEffect(() => { buscar({ latest: true }); }, []);

  const limpiar = () => {
    setFiltroCliente(''); setFiltroAnio(''); setFiltroMes('');
    buscar({ latest: true });
  };

  const usd = resumen?.porMoneda.find(m => m.moneda === 'USD');
  const cop = resumen?.porMoneda.find(m => m.moneda === 'COP');

  const columns: ColumnDef<Registro>[] = [
    { header: t('fulfillment:registro.colClient'), key: 'cliente_nombre', sortable: true, render: r => <span className="font-black text-slate-800">{r.cliente_nombre}</span> },
    { header: t('fulfillment:registro.colPeriod'), key: 'mes', sortable: true, render: r => <span>{t(`common:months.${r.mes}`)} {r.anio}{r.subtipo ? ` · ${r.subtipo}` : ''}</span> },
    { header: t('fulfillment:registro.colCurrency'), key: 'moneda', sortable: true, render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.moneda === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.moneda}</span> },
    { header: t('fulfillment:registro.colTotalValue'), key: 'valor_total', sortable: true, render: r => <span className="font-black text-slate-800">{fmt(r.valor_total, r.moneda)}</span> },
    { header: t('fulfillment:registro.colTransportCost'), key: 'costo_transporte_total', sortable: true, render: r => fmt(r.costo_transporte_total, r.moneda) },
    { header: t('fulfillment:registro.colProfit'), key: 'utilidad', sortable: true, render: r => <span className="font-black text-emerald-700">{fmt(r.utilidad, r.moneda)}</span> },
    { header: t('fulfillment:registro.colLines'), key: 'num_lineas', sortable: true },
    { header: t('fulfillment:registro.colInvoice'), key: 'referencia_factura', sortable: true, render: r => r.referencia_factura || '—' },
    {
      header: t('common:fields.actions'), key: 'id', sortable: false,
      render: r => <button onClick={() => setDetalleReg(r)} className="text-indigo-600 hover:text-indigo-800 font-black text-[9px] uppercase">{t('common:actions.viewDetail')}</button>,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KpiCard label={t('fulfillment:registro.kpiInvoicedUsd')} value={fmt(usd?.valor_total || 0, 'USD')} icon={<DollarSign className="w-4 h-4" />} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
        <KpiCard label={t('fulfillment:registro.kpiInvoicedCop')} value={fmt(cop?.valor_total || 0, 'COP')} icon={<DollarSign className="w-4 h-4" />} color="bg-blue-50 border-blue-100 text-blue-800" />
        <KpiCard label={t('fulfillment:registro.kpiProfitUsd')} value={fmt(usd?.utilidad || 0, 'USD')} icon={<TrendingUp className="w-4 h-4" />} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
        <KpiCard label={t('fulfillment:registro.kpiProfitCop')} value={fmt(cop?.utilidad || 0, 'COP')} icon={<TrendingUp className="w-4 h-4" />} color="bg-blue-50 border-blue-100 text-blue-800" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {t('fulfillment:registro.topCarriers')}</p>
          {resumen?.topTransportistas.length ? resumen.topTransportistas.map((tr: any) => (
            <div key={tr.nombre} className="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-600">{tr.nombre}</span>
              <span className="text-slate-400">{tr.envios} {t('fulfillment:registro.shipments')}</span>
            </div>
          )) : <p className="text-xs text-slate-300 py-3 text-center">{t('fulfillment:registro.noData')}</p>}
        </div>
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> {t('fulfillment:registro.topProducts')}</p>
          {resumen?.topProductos.length ? resumen.topProductos.map((p: any) => (
            <div key={p.nombre} className="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-600">{p.nombre}</span>
              <span className="text-slate-400">{p.lineas} {t('fulfillment:registro.lines')}</span>
            </div>
          )) : <p className="text-xs text-slate-300 py-3 text-center">{t('fulfillment:registro.noData')}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="w-52"><label className={labelCls}>{t('fulfillment:registro.filterClient')}</label>
          <select className={inputCls} value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
            <option value="">{t('fulfillment:registro.filterAll')}</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="w-32"><label className={labelCls}>{t('fulfillment:registro.filterYear')}</label><input className={inputCls} value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} placeholder="2026" /></div>
        <div className="w-40"><label className={labelCls}>{t('fulfillment:registro.filterMonth')}</label>
          <select className={inputCls} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="">{t('fulfillment:registro.filterAll')}</option>
            {MESES.map(m => <option key={m} value={m}>{t(`common:months.${m}`)}</option>)}
          </select>
        </div>
        <button onClick={() => buscar()} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} {t('common:actions.consult')}
        </button>
        <button onClick={limpiar} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest">{t('common:actions.clear')}</button>
        <p className="text-[9px] text-slate-400 font-bold ml-auto">{t('fulfillment:registro.consultHint')}</p>
      </div>

      <DataTable<Registro> data={registros} columns={columns} loading={loading} searchPlaceholder={t('fulfillment:registro.searchPlaceholder')} excelFileName="fulfillment_consulta.xlsx" excelSheetName="Consulta" />

      {detalleReg && (
        <DetalleModal
          registro={detalleReg} onClose={() => setDetalleReg(null)} clientes={clientes} registros={registros}
          onRegistroChanged={() => buscar()} onSwitchRegistro={setDetalleReg}
        />
      )}
    </div>
  );
}

// ══════════════════════════════ TAB: REGISTRO (crear mes / importar / gestionar) ═
function RegistroTab({ clientes, user }: { clientes: Cliente[]; user: User }) {
  const { t } = useTranslation(['fulfillment', 'common']);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<MasterItem[]>([]);
  const [transportistas, setTransportistas] = useState<MasterItem[]>([]);

  const [detalleReg, setDetalleReg] = useState<Registro | null>(null);
  const [confirmDel, setConfirmDel] = useState<Registro | null>(null);
  const [deleting, setDeleting] = useState(false);

  // "Registrar Mes" — crea el período (Cliente+Año+Mes+Subtipo) SIN ítems; los ítems se agregan
  // después desde "Ver Detalle". Reemplaza el viejo flujo que mezclaba ambas cosas en un solo paso.
  const [showMes, setShowMes] = useState(false);
  const [mesForm, setMesForm] = useState({ cliente_id: '', anio: String(new Date().getFullYear()), mes: '', subtipo: '' });
  const [savingMes, setSavingMes] = useState(false);

  // Editar período (año/mes/subtipo) de un registro ya existente.
  const [editReg, setEditReg] = useState<Registro | null>(null);
  const [editForm, setEditForm] = useState({ anio: '', mes: '', subtipo: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importCliente, setImportCliente] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingPlantilla, setDownloadingPlantilla] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDescargarPlantilla = async () => {
    setDownloadingPlantilla(true);
    try { await api.downloadFulfillmentPlantilla(); }
    catch (e: any) { toast.error(e.message || t('fulfillment:registro.toastTemplateError')); }
    finally { setDownloadingPlantilla(false); }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await api.getFulfillmentRegistros();
      setRegistros(res.success ? res.data : []);
    } catch { toast.error(t('fulfillment:registro.toastLoadError')); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    loadAll();
    api.getFulfillmentProductos().then(r => setProductos(r.success ? r.data : [])).catch(() => {});
    api.getFulfillmentTransportistas().then(r => setTransportistas(r.success ? r.data : [])).catch(() => {});
  }, []);

  const abrirRegistrarMes = () => { setMesForm({ cliente_id: '', anio: String(new Date().getFullYear()), mes: '', subtipo: '' }); setShowMes(true); };
  const handleRegistrarMes = async () => {
    if (!mesForm.cliente_id) { toast.error(t('fulfillment:lineaManualForm.toastClientRequired')); return; }
    if (!mesForm.anio || !mesForm.mes) { toast.error(t('fulfillment:lineaManualForm.toastPeriodRequired')); return; }
    setSavingMes(true);
    try {
      const res = await api.createFulfillmentRegistro({ cliente_id: Number(mesForm.cliente_id), anio: mesForm.anio, mes: mesForm.mes, subtipo: mesForm.subtipo || undefined });
      if (res.success) {
        toast.success(t('fulfillment:registro.toastMonthRegistered'));
        setShowMes(false);
        const fresh = await api.getFulfillmentRegistros();
        const listaFresh: Registro[] = fresh.success ? fresh.data : [];
        setRegistros(listaFresh);
        const nuevo = listaFresh.find(r => r.id === res.data.id);
        if (nuevo) setDetalleReg(nuevo); // abre directo Ver Detalle para empezar a agregar ítems
      } else toast.error(res.error || t('fulfillment:registro.toastMonthRegisterError'));
    } catch (e: any) { toast.error(e.message || t('fulfillment:registro.toastMonthRegisterError')); }
    finally { setSavingMes(false); }
  };

  const abrirEditar = (r: Registro) => { setEditReg(r); setEditForm({ anio: String(r.anio), mes: r.mes, subtipo: r.subtipo || '' }); };
  const handleGuardarEdicion = async () => {
    if (!editReg) return;
    if (!editForm.anio || !editForm.mes) { toast.error(t('fulfillment:lineaManualForm.toastPeriodRequired')); return; }
    setSavingEdit(true);
    try {
      const res = await api.updateFulfillmentRegistro(editReg.id, { anio: editForm.anio, mes: editForm.mes, subtipo: editForm.subtipo || undefined });
      if (res.success) { toast.success(t('fulfillment:registro.toastRegistryUpdated')); setEditReg(null); loadAll(); }
      else toast.error(res.error || t('fulfillment:registro.toastRegistryUpdateError'));
    } catch (e: any) { toast.error(e.message || t('fulfillment:registro.toastRegistryUpdateError')); }
    finally { setSavingEdit(false); }
  };

  const handleImport = async () => {
    if (!importCliente) { toast.error(t('fulfillment:registro.clientLabel')); return; }
    if (!importFile) { toast.error(t('fulfillment:registro.selectFile')); return; }
    setImporting(true);
    try {
      const res = await api.importFulfillmentXlsx(importFile, Number(importCliente));
      if (res.success) {
        toast.success(t('fulfillment:registro.toastImportSuccess', { sheets: res.hojasImportadas, lines: res.lineasImportadas }));
        setShowImport(false); setImportFile(null); setImportCliente('');
        loadAll();
      } else toast.error(res.error || t('fulfillment:registro.toastImportError'));
    } catch (e: any) { toast.error(e.message || t('fulfillment:registro.toastImportError')); }
    finally { setImporting(false); }
  };

  const handleDeleteRegistro = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      const res = await api.deleteFulfillmentRegistro(confirmDel.id);
      if (res.success) { toast.success(t('fulfillment:registro.toastDeleted')); setConfirmDel(null); loadAll(); }
      else toast.error(res.error || t('fulfillment:registro.toastDeleteError'));
    } catch (e: any) { toast.error(e.message || t('fulfillment:registro.toastDeleteError')); }
    finally { setDeleting(false); }
  };

  const columns: ColumnDef<Registro>[] = [
    { header: t('fulfillment:registro.colClient'), key: 'cliente_nombre', sortable: true, render: r => <span className="font-black text-slate-800">{r.cliente_nombre}</span> },
    { header: t('fulfillment:registro.colPeriod'), key: 'mes', sortable: true, render: r => <span>{t(`common:months.${r.mes}`)} {r.anio}{r.subtipo ? ` · ${r.subtipo}` : ''}</span> },
    { header: t('fulfillment:registro.colCurrency'), key: 'moneda', sortable: true, render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.moneda === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.moneda}</span> },
    { header: t('fulfillment:registro.colTotalValue'), key: 'valor_total', sortable: true, render: r => <span className="font-black text-slate-800">{fmt(r.valor_total, r.moneda)}</span> },
    { header: t('fulfillment:registro.colLines'), key: 'num_lineas', sortable: true },
    {
      header: t('common:fields.actions'), key: 'id', sortable: false,
      render: r => (
        <div className="flex gap-2 items-center">
          <button onClick={() => setDetalleReg(r)} className="text-indigo-600 hover:text-indigo-800 font-black text-[9px] uppercase">{t('common:actions.viewDetail')}</button>
          <button onClick={() => abrirEditar(r)} title={t('fulfillment:registro.editRegistry')} className="text-slate-500 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => setConfirmDel(r)} title={t('common:actions.delete')} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-5">
        <button onClick={abrirRegistrarMes} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
          <Plus className="w-3.5 h-3.5" /> {t('fulfillment:registro.registerMonth')}
        </button>
        <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
          <Upload className="w-3.5 h-3.5" /> {t('fulfillment:registro.importExcel')}
        </button>
      </div>

      <DataTable<Registro> data={registros} columns={columns} loading={loading} searchPlaceholder={t('fulfillment:registro.searchPlaceholder')} excelFileName="fulfillment_registros.xlsx" excelSheetName="Registros" />

      {/* Registrar Mes — solo Cliente + Año + Mes + Subtipo, sin campos de ítem */}
      {showMes && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
              <p className="text-lg font-black text-white">{t('fulfillment:registro.registerMonthTitle')}</p>
              <button onClick={() => setShowMes(false)} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-500">{t('fulfillment:registro.registerMonthHint')}</p>
              <div><label className={labelCls}>{t('fulfillment:lineaManualForm.clientLabel')}</label>
                <select className={inputCls} value={mesForm.cliente_id} onChange={e => setMesForm(f => ({ ...f, cliente_id: e.target.value }))}>
                  <option value="">{t('common:actions.selectPlaceholder')}</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>{t('fulfillment:lineaManualForm.yearLabel')}</label><input className={inputCls} value={mesForm.anio} onChange={e => setMesForm(f => ({ ...f, anio: e.target.value }))} /></div>
                <div><label className={labelCls}>{t('fulfillment:lineaManualForm.monthLabel')}</label>
                  <select className={inputCls} value={mesForm.mes} onChange={e => setMesForm(f => ({ ...f, mes: e.target.value }))}>
                    <option value="">{t('common:actions.selectPlaceholder')}</option>
                    {MESES.map(m => <option key={m} value={m}>{t(`common:months.${m}`)}</option>)}
                  </select>
                </div>
              </div>
              <div><label className={labelCls}>{t('fulfillment:lineaManualForm.subtypeLabel')}</label><input className={inputCls} value={mesForm.subtipo} onChange={e => setMesForm(f => ({ ...f, subtipo: e.target.value }))} placeholder={t('fulfillment:lineaManualForm.subtypePlaceholder')} /></div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowMes(false)} disabled={savingMes} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">{t('common:actions.cancel')}</button>
              <button onClick={handleRegistrarMes} disabled={savingMes} className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {savingMes && <Loader2 className="w-4 h-4 animate-spin" />} {savingMes ? t('common:actions.saving') : t('common:actions.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar período (Año/Mes/Subtipo) de un registro existente */}
      {editReg && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
              <p className="text-lg font-black text-white">{t('fulfillment:registro.editRegistryTitle')}</p>
              <button onClick={() => setEditReg(null)} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-500">{editReg.cliente_nombre}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>{t('fulfillment:lineaManualForm.yearLabel')}</label><input className={inputCls} value={editForm.anio} onChange={e => setEditForm(f => ({ ...f, anio: e.target.value }))} /></div>
                <div><label className={labelCls}>{t('fulfillment:lineaManualForm.monthLabel')}</label>
                  <select className={inputCls} value={editForm.mes} onChange={e => setEditForm(f => ({ ...f, mes: e.target.value }))}>
                    {MESES.map(m => <option key={m} value={m}>{t(`common:months.${m}`)}</option>)}
                  </select>
                </div>
              </div>
              <div><label className={labelCls}>{t('fulfillment:lineaManualForm.subtypeLabel')}</label><input className={inputCls} value={editForm.subtipo} onChange={e => setEditForm(f => ({ ...f, subtipo: e.target.value }))} placeholder={t('fulfillment:lineaManualForm.subtypePlaceholder')} /></div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setEditReg(null)} disabled={savingEdit} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">{t('common:actions.cancel')}</button>
              <button onClick={handleGuardarEdicion} disabled={savingEdit} className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} {savingEdit ? t('common:actions.saving') : t('common:actions.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-6 py-4">
              <p className="text-xs font-black text-teal-200 uppercase tracking-widest mb-0.5">{t('fulfillment:registro.tabRegistro')}</p>
              <p className="text-lg font-black text-white">{t('fulfillment:registro.importExcel')}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>{t('fulfillment:registro.clientLabel')}</label>
                <select className={inputCls} value={importCliente} onChange={e => setImportCliente(e.target.value)}>
                  <option value="">{t('common:actions.selectPlaceholder')}</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </select>
              </div>
              <p className="text-xs text-slate-500">{t('fulfillment:registro.detailModalHint')}</p>
              <button onClick={handleDescargarPlantilla} disabled={downloadingPlantilla}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 text-xs font-black uppercase tracking-widest disabled:opacity-60">
                {downloadingPlantilla ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} {t('fulfillment:registro.downloadTemplate')}
              </button>
              <div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => fileRef.current?.click()}
                  className={`w-full py-3 rounded-2xl border-2 border-dashed text-sm font-semibold transition ${importFile ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-600'}`}>
                  {importFile ? `✓ ${importFile.name}` : t('fulfillment:registro.selectFile')}
                </button>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => { setShowImport(false); setImportFile(null); }} disabled={importing}
                className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">{t('common:actions.cancel')}</button>
              <button onClick={handleImport} disabled={importing || !importFile || !importCliente}
                className="flex-1 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />} {importing ? t('fulfillment:registro.importing') : t('fulfillment:registro.import')}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalleReg && (
        <DetalleModal
          registro={detalleReg} onClose={() => setDetalleReg(null)} clientes={clientes} registros={registros}
          onRegistroChanged={loadAll} onSwitchRegistro={setDetalleReg}
        />
      )}

      {/* Confirmar eliminar registro */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-1">{t('fulfillment:registro.deleteRegistryTitle')}</p>
            <p className="text-sm text-slate-500 mb-5">
              {t('fulfillment:registro.deleteRegistryConfirmPrefix')}{' '}
              <span className="font-black text-slate-800">{confirmDel.cliente_nombre} — {t(`common:months.${confirmDel.mes}`)} {confirmDel.anio}</span>
              {t('fulfillment:registro.deleteRegistryConfirmSuffix')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">{t('common:actions.cancel')}</button>
              <button onClick={handleDeleteRegistro} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />} {t('common:actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
