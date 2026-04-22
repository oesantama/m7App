import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { Icons } from '../constants';
import { hasPermission } from '../utils/permissions';

// ── Tipos trazabilidad factura ────────────────────────────────────────────────

interface TraceabilityItem {
  article_id: string;
  article_name: string;
  expected_qty: number;
  received_qty: number | null;
  item_status: string | null;
  item_status_name: string | null;
  novedad: string | null;
  observation: string | null;
  unit: string | null;
}

interface TraceabilityData {
  invoice: {
    invoice_number: string;
    order_number: string | null;
    customer_name: string | null;
    address: string | null;
    city: string | null;
    document_id: string;
    item_status: string | null;
    item_status_name: string | null;
    external_doc_id: string | null;
    plan_type: string | null;
    client_id: string | null;
    received_at: string | null;
    received_by_name: string | null;
    inventory_date: string | null;
    inventory_user: string | null;
    doc_status: string | null;
    doc_status_name: string | null;
    vehicle_plate: string | null;
    codplan: string | null;
    delivery_date: string | null;
    total_qty: number;
    received_qty: number | null;
  };
  items: TraceabilityItem[];
  route: {
    route_id: string;
    ri_invoice_id: string;
    assigned_at: string;
    plate: string | null;
    driver_name: string | null;
    driver_document: string | null;
    route_status_name: string | null;
    status_id: string | null;
  } | null;
  dispatch: {
    dispatch_id: string;
    dispatched_at: string;
    dispatch_status: string | null;
    plate: string | null;
    driver_name: string | null;
  } | null;
  conciliation: {
    forma_pago: string | null;
    valor: number | null;
    banco: string | null;
    comprobante: string | null;
    fecha_pago: string | null;
    numero_cheque: string | null;
    es_devolucion: boolean | null;
    conciliado_at: string | null;
    conciliado_por_nombre: string | null;
    conductor_name: string | null;
    vehicle_plate: string | null;
  } | null;
  payment: {
    metodo_pago: string | null;
    vmetodo: number | null;
    banco: string | null;
    referencia: string | null;
  } | null;
  modifications: RouteModificationLog[];
}

interface RouteModificationLog {
  id: number;
  route_id: string;
  action: string;
  previous_plate: string | null;
  new_plate: string | null;
  details: any;
  created_at: string;
  user_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtCOP = (v: number | null | undefined) => {
  if (v == null) return null;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
};

// ── Clasificación de estado del ítem ─────────────────────────────────────────

type StepKey = 'ingreso' | 'auditado' | 'asignado' | 'en_ruta' | 'entregado' | 'conciliado';

interface StepDef {
  key: StepKey;
  label: string;
  icon: React.ReactNode;
}

const STEPS: StepDef[] = [
  { key: 'ingreso',    label: 'Ingreso al Sistema',  icon: <Icons.Upload /> },
  { key: 'auditado',   label: 'Auditado / Conteo',   icon: <Icons.CheckCircle /> },
  { key: 'asignado',   label: 'Asignado a Ruta',     icon: <Icons.Truck /> },
  { key: 'en_ruta',    label: 'En Ruta',              icon: <Icons.MapPin /> },
  { key: 'entregado',  label: 'Entrega',              icon: <Icons.Package /> },
  { key: 'conciliado', label: 'Conciliado',           icon: <Icons.CreditCard /> },
];

type StepStatus = 'done' | 'current' | 'pending';

function getStepStatuses(data: TraceabilityData): Record<StepKey, StepStatus> {
  const itemStatus = (data.invoice.item_status  || '').toUpperCase();
  const docStatus  = (data.invoice.doc_status   || '').toUpperCase();

  const hasRoute        = !!data.route;
  const hasDispatch     = !!data.dispatch;
  const hasConciliation = !!data.conciliation;

  const isDelivered = ['EST-12','EST-13','EST-14','EST-15','EST-17',
    'ENTREGADO','DEVUELTO','ENTREGA PARCIAL','REPICE','RECHAZADO',
    'COMPLETED','FINALIZADO'].some(s => itemStatus === s || docStatus === s);

  const isInRoute  = isDelivered || ['EST-11','EN RUTA'].some(s => itemStatus === s || docStatus === s);
  const isAssigned = isInRoute   || hasRoute || hasDispatch || ['EST-10','ASIGNADO'].some(s => itemStatus === s || docStatus === s);
  const isAudited  = isAssigned  || ['EST-04','EST-05','EST-06','EST-08','EST-09',
    'EN CONTEO','AUDITADO','RECIBIDO','INVENTARIADO','ALISTADO'].some(s => itemStatus === s || docStatus === s);
  const isConciliated = hasConciliation;

  return {
    ingreso:    (isAudited    ? 'done' : 'current'),
    auditado:   isAudited    ? (isAssigned   ? 'done' : 'current') : 'pending',
    asignado:   isAssigned   ? (isInRoute    ? 'done' : 'current') : 'pending',
    en_ruta:    isInRoute    ? (isDelivered  ? 'done' : 'current') : 'pending',
    entregado:  isDelivered  ? (isConciliated ? 'done' : 'current') : 'pending',
    conciliado: isConciliated ? 'done' : 'pending',
  };
}

const DELIVERY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'EST-12':          { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'ENTREGADO':       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'EST-13':          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  'DEVUELTO':        { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  'EST-14':          { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
  'ENTREGA PARCIAL': { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
  'EST-15':          { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200'  },
  'REPICE':          { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200'  },
  'EST-17':          { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
  'RECHAZADO':       { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
};

function deliveryBadge(status: string | null) {
  if (!status) return null;
  const s = status.toUpperCase();
  const c = DELIVERY_COLOR[s] || { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${c.bg} ${c.text} ${c.border} uppercase tracking-wide`}>
      {status}
    </span>
  );
}

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
    <span className="text-sm font-semibold text-slate-800">{value || <span className="text-slate-300 font-normal italic">—</span>}</span>
  </div>
);

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }> = ({ title, icon, accent, children }) => (
  <div className={`rounded-2xl border ${accent} bg-white overflow-hidden shadow-sm`}>
    <div className={`px-5 py-3 flex items-center gap-2.5 border-b ${accent}`}>
      <span className="w-4 h-4 flex items-center justify-center text-current opacity-70">{icon}</span>
      <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ── Tipos movimientos ─────────────────────────────────────────────────────────

interface Movement {
  id: number;
  client_id: string | null;
  article_id: string;
  article_name: string | null;
  batch: string | null;
  movement_type: string;
  quantity: number;
  location_from: string | null;
  location_to: string | null;
  reference_type: string | null;
  reference_id: string | null;
  invoice: string | null;
  vehicle_plate: string | null;
  driver_id: string | null;
  user_id: string | null;
  notes: string | null;
  created_at: string;
}

interface StockRow {
  article_id: string;
  article_name: string | null;
  batch: string | null;
  quantity: number;
  location: string | null;
  vehicle_plate: string | null;
  driver_name: string | null;
  client_id: string | null;
  last_updated: string | null;
}

const MOVEMENT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  INGRESO:           { label: 'Ingreso',           color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: '📥' },
  RECIBO:            { label: 'Recibo',             color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: '📥' },
  DESPACHO:          { label: 'Despacho',           color: 'text-blue-700',   bg: 'bg-blue-50',     border: 'border-blue-200',    icon: '🚛' },
  ENTREGA:           { label: 'Entrega Completa',   color: 'text-teal-700',   bg: 'bg-teal-50',     border: 'border-teal-200',    icon: '✅' },
  ENTREGA_PARCIAL:   { label: 'Entrega Parcial',    color: 'text-orange-700', bg: 'bg-orange-50',   border: 'border-orange-200',  icon: '📦' },
  DEVOLUCION:        { label: 'Devolución',         color: 'text-amber-700',  bg: 'bg-amber-50',    border: 'border-amber-200',   icon: '🔄' },
  REPICE:            { label: 'Repice',             color: 'text-violet-700', bg: 'bg-violet-50',   border: 'border-violet-200',  icon: '🔃' },
  SALIDA_PROVEEDOR:  { label: 'Salida Proveedor',   color: 'text-rose-700',   bg: 'bg-rose-50',     border: 'border-rose-200',    icon: '↩️' },
  AJUSTE:            { label: 'Ajuste Inventario',  color: 'text-slate-700',  bg: 'bg-slate-50',    border: 'border-slate-200',   icon: '⚙️' },
};

function movBadge(type: string) {
  const c = MOVEMENT_CONFIG[type] || { label: type, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: '•' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${c.bg} ${c.color} ${c.border} uppercase tracking-wide`}>
      {c.icon} {c.label}
    </span>
  );
}

// ── Tab Consulta Ítem ─────────────────────────────────────────────────────────

interface Client { id: string; name: string; }

const ConsultaItem: React.FC<{ user: any }> = ({ user }) => {
  const [articleSearch, setArticleSearch] = useState('');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [loading, setLoading]             = useState(false);
  const [stockBodega, setStockBodega]     = useState<StockRow[]>([]);
  const [stockVehicle, setStockVehicle]   = useState<StockRow[]>([]);
  const [movements, setMovements]         = useState<Movement[]>([]);
  const [searched, setSearched]           = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [articleLabel, setArticleLabel]   = useState('');

  // Client selector
  const [clients, setClients]             = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  useEffect(() => {
    const allowedIds: string[] = user?.clientIds?.length
      ? user.clientIds
      : user?.clientId ? [user.clientId] : [];
    api.getClients().then((all: any[]) => {
      const filtered = allowedIds.length
        ? all.filter((c: any) => allowedIds.includes(c.id))
        : all;
      setClients(filtered);
      if (filtered.length === 1) setSelectedClientId(filtered[0].id);
    }).catch(() => {});
  }, [user]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = articleSearch.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      const [stockRes, movRes] = await Promise.all([
        api.getInventoryStock({ articleId: term, clientId: selectedClientId || undefined }),
        api.getInventoryMovements({
          articleId: term,
          clientId: selectedClientId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          limit: 500,
        }),
      ]);

      // Stock API returns { success, bodega: [], vehiculos: [] }
      const bodega:   StockRow[] = Array.isArray(stockRes?.bodega)    ? stockRes.bodega    : [];
      const vehiculos:StockRow[] = Array.isArray(stockRes?.vehiculos)  ? stockRes.vehiculos : [];
      const movData:  Movement[] = Array.isArray(movRes?.data)         ? movRes.data        : [];

      setStockBodega(bodega);
      setStockVehicle(vehiculos);
      setMovements(movData);
      setArticleLabel(bodega[0]?.article_name || vehiculos[0]?.article_name || movData[0]?.article_name || term);
      setSearched(true);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const totalBodega  = stockBodega.reduce((a, s)  => a + Number(s.quantity || 0), 0);
  const totalVehicle = stockVehicle.reduce((a, s) => a + Number(s.quantity || 0), 0);
  const totalStock   = totalBodega + totalVehicle;
  const stock        = [...stockBodega, ...stockVehicle];

  // Totales de movimientos
  const totalIngresado  = movements.filter(m => ['INGRESO','RECIBO'].includes(m.movement_type)).reduce((a, m) => a + Number(m.quantity), 0);
  const totalDespachado = movements.filter(m => m.movement_type === 'DESPACHO').reduce((a, m) => a + Number(m.quantity), 0);
  const totalEntregado  = movements.filter(m => ['ENTREGA','ENTREGA_PARCIAL'].includes(m.movement_type)).reduce((a, m) => a + Number(m.quantity), 0);
  const totalDevuelto   = movements.filter(m => m.movement_type === 'DEVOLUCION').reduce((a, m) => a + Number(m.quantity), 0);
  const totalProveedor  = movements.filter(m => m.movement_type === 'SALIDA_PROVEEDOR').reduce((a, m) => a + Number(m.quantity), 0);

  return (
    <div className="flex flex-col gap-6">

      {/* Buscador */}
      <form onSubmit={handleSearch} className="flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap">
          {clients.length > 1 && (
            <div className="flex flex-col">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5 px-1">Cliente</label>
              <select
                value={selectedClientId}
                onChange={e => setSelectedClientId(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm min-w-[160px]"
              >
                <option value="">Todos los clientes</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1 min-w-[220px] relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"><Icons.Search /></div>
            <input
              type="text"
              value={articleSearch}
              onChange={e => setArticleSearch(e.target.value)}
              placeholder="SKU o nombre del artículo..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 text-sm shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5 px-1">Desde</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm" />
            </div>
            <div className="flex flex-col mt-4 text-slate-400 text-xs font-bold">—</div>
            <div className="flex flex-col">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5 px-1">Hasta</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm" />
            </div>
          </div>
          <button type="submit" disabled={loading || !articleSearch.trim()}
            className="self-end px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm transition-all active:scale-95 whitespace-nowrap">
            {loading ? 'Buscando...' : 'Consultar'}
          </button>
          {(dateFrom || dateTo) && (
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="self-end px-3 py-3 text-slate-400 hover:text-slate-600 text-[10px] font-bold rounded-xl border border-slate-200 bg-white transition-all">
              Limpiar fechas
            </button>
          )}
        </div>
        {(dateFrom || dateTo) && (
          <p className="text-[10px] text-indigo-600 font-bold">
            Filtrando por periodo {dateFrom ? fmtDate(dateFrom) : '…'} → {dateTo ? fmtDate(dateTo) : '…'}
          </p>
        )}
      </form>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="text-rose-500 w-4 h-4 shrink-0"><Icons.Alert /></div>
          <p className="text-rose-700 text-sm font-semibold">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium">Consultando historial...</p>
          </div>
        </div>
      )}

      {!searched && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
          <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-4 text-slate-300"><Icons.Search /></div>
          <p className="text-slate-400 font-semibold text-lg">Busque un artículo para ver su historial</p>
          <p className="text-slate-300 text-sm mt-1">Ingrese el SKU o nombre. El rango de fecha es opcional.</p>
        </div>
      )}

      {searched && !loading && (
        <>
          {/* Encabezado del artículo */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-1">Artículo</div>
                <div className="text-2xl font-black tracking-tight">{articleLabel || articleSearch}</div>
                <div className="text-slate-400 text-xs mt-1 font-mono">{articleSearch}</div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="text-center bg-white/5 rounded-2xl px-5 py-3 border border-white/10">
                  <div className="text-2xl font-black text-white">{totalStock}</div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Total Stock</div>
                </div>
                <div className="text-center bg-emerald-500/10 rounded-2xl px-5 py-3 border border-emerald-500/20">
                  <div className="text-2xl font-black text-emerald-400">{totalBodega}</div>
                  <div className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Bodega</div>
                </div>
                <div className="text-center bg-blue-500/10 rounded-2xl px-5 py-3 border border-blue-500/20">
                  <div className="text-2xl font-black text-blue-400">{totalVehicle}</div>
                  <div className="text-[8px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Vehículos</div>
                </div>
              </div>
            </div>

            {/* Resumen de movimientos */}
            <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Ingresado',  val: totalIngresado,  color: 'text-emerald-400' },
                { label: 'Despachado', val: totalDespachado, color: 'text-blue-400' },
                { label: 'Entregado',  val: totalEntregado,  color: 'text-teal-400' },
                { label: 'Devuelto',   val: totalDevuelto,   color: 'text-amber-400' },
                { label: 'A Proveedor',val: totalProveedor,  color: 'text-rose-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                  <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Stock por ubicación */}
          {stock.length > 0 && (
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                Stock Actual por Ubicación
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold normal-case">{stock.length}</span>
              </h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Ubicación</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Placa / Conductor</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Lote</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Cliente</th>
                        <th className="text-right px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Cantidad</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Última Act.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stock.map((s, i) => {
                        const isVehicle = !!s.vehicle_plate || s.location === 'VEHICULO';
                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-bold">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${isVehicle ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {isVehicle ? '🚛 Vehículo' : '🏭 Bodega'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {s.vehicle_plate ? <span className="font-mono font-black text-slate-800">{s.vehicle_plate}</span> : '—'}
                              {s.driver_name && <span className="text-slate-400 ml-1">· {s.driver_name}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 font-mono">{s.batch || 'S/L'}</td>
                            <td className="px-4 py-2.5 text-slate-500">{s.client_id || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-black text-slate-900 tabular-nums">{Number(s.quantity)}</td>
                            <td className="px-4 py-2.5 text-slate-400">{fmtDateTime(s.last_updated)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Historial de movimientos */}
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
              Historial de Movimientos
              <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold normal-case">{movements.length}</span>
            </h2>
            {movements.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                <p className="text-slate-300 font-semibold">Sin movimientos registrados para este artículo{(dateFrom || dateTo) ? ' en el periodo seleccionado' : ''}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo</th>
                        <th className="text-right px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Cant.</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Lote</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Factura</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Desde → Hacia</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Placa</th>
                        <th className="text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m, i) => (
                        <tr key={m.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                          <td className="px-4 py-2.5">{movBadge(m.movement_type)}</td>
                          <td className="px-4 py-2.5 text-right font-black text-slate-900 tabular-nums">{Number(m.quantity)}</td>
                          <td className="px-4 py-2.5 text-slate-500 font-mono">{m.batch || 'S/L'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-700 text-[10px]">{m.invoice || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                            {m.location_from && <span className="text-slate-400">{m.location_from}</span>}
                            {m.location_from && m.location_to && <span className="text-slate-300 mx-1">→</span>}
                            {m.location_to && <span className="font-semibold text-slate-700">{m.location_to}</span>}
                            {!m.location_from && !m.location_to && <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{m.vehicle_plate || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-400 max-w-[160px] truncate">{m.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Tab Consulta Factura ──────────────────────────────────────────────────────

const ConsultaFacturaTab: React.FC<{ user: any }> = ({ user }) => {
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<TraceabilityData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [liberando, setLiberando]         = useState(false);
  const [liberadoMsg, setLiberadoMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [showLiberarModal, setShowLiberarModal] = useState(false);
  const [liberarObs, setLiberarObs]       = useState('');
  const inputRef                          = useRef<HTMLInputElement>(null);

  const canEdit = hasPermission(user, 'consulta-facturas', 'edit');

  const handleLiberar = async () => {
    if (!liberarObs.trim()) return;
    if (!data?.route?.route_id) return;
    setLiberando(true);
    setLiberadoMsg(null);
    try {
      const invoiceId = data.route.ri_invoice_id || data.invoice.invoice_number;
      await api.unassignRouteInvoice({
        routeId: data.route.route_id,
        invoiceId,
        observations: liberarObs.trim(),
        userId: user?.id,
      });
      setLiberadoMsg({ ok: true, text: 'Factura liberada de la ruta correctamente.' });
      setData(prev => prev ? { ...prev, route: null } : prev);
      setShowLiberarModal(false);
      setLiberarObs('');
    } catch (err: any) {
      setLiberadoMsg({ ok: false, text: err.message || 'No se pudo liberar la factura' });
      setShowLiberarModal(false);
    } finally {
      setLiberando(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = query.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.getInvoiceTraceability(term);
      if (res?.success && res.data) {
        setData(res.data as TraceabilityData);
      } else {
        setError(res?.error || 'Factura no encontrada');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const stepStatuses = data ? getStepStatuses(data) : null;

  return (
    <div className="flex flex-col gap-8">

      {/* Buscador */}
      <form onSubmit={handleSearch}>
        <div className="flex gap-3 max-w-xl">
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"><Icons.Search /></div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ej: FAC-2024-001 o número de pedido..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 text-sm shadow-sm transition-all"
            />
          </div>
          <button type="submit" disabled={loading || !query.trim()}
            className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm transition-all active:scale-95 whitespace-nowrap">
            {loading ? 'Buscando...' : 'Consultar'}
          </button>
        </div>
      </form>

      {/* Estado vacío */}
      {!data && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-5 text-slate-300"><Icons.Search /></div>
          <p className="text-slate-400 font-semibold text-lg">Ingrese un número de factura para comenzar</p>
          <p className="text-slate-300 text-sm mt-1">Se mostrará toda la trazabilidad disponible en el sistema</p>
        </div>
      )}

      {error && (
        <div className="max-w-xl bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3">
          <div className="text-rose-500 w-5 h-5 mt-0.5 shrink-0"><Icons.Alert /></div>
          <div>
            <p className="font-bold text-rose-700 text-sm">No se encontró la factura</p>
            <p className="text-rose-500 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium">Consultando trazabilidad...</p>
          </div>
        </div>
      )}

      {liberadoMsg && (
        <div className={`max-w-xl rounded-2xl p-4 flex items-center gap-3 border ${!liberadoMsg.ok ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <p className="text-sm font-semibold">{liberadoMsg.text}</p>
        </div>
      )}

      {/* Modal Liberar Factura */}
      {showLiberarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4">
            <h3 className="text-lg font-black text-slate-900 mb-1">Liberar Factura de Ruta</h3>
            <p className="text-sm text-slate-500 mb-5">
              La factura <span className="font-black text-slate-800">{data?.invoice.invoice_number}</span> será desvinculada de la ruta{data?.route?.plate ? ` (${data.route.plate})` : ''}. Esta acción queda registrada en el historial.
            </p>
            <div className="flex flex-col gap-2 mb-6">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Observación <span className="text-rose-500">*</span></label>
              <textarea
                value={liberarObs}
                onChange={e => setLiberarObs(e.target.value)}
                placeholder="Motivo por el cual se libera la factura..."
                rows={3}
                className="px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-semibold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400 resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowLiberarModal(false); setLiberarObs(''); }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleLiberar}
                disabled={liberando || !liberarObs.trim()}
                className="px-6 py-2.5 bg-rose-500 hover:bg-rose-400 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow transition-all active:scale-95"
              >
                {liberando ? 'Liberando...' : 'Confirmar Liberación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {data && stepStatuses && (
        <div className="flex flex-col gap-8 animate-in fade-in duration-500">

          {/* Encabezado de factura */}
          <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Factura</div>
                  <div className="text-3xl md:text-4xl font-black tracking-tight">{data.invoice.invoice_number}</div>
                  {data.invoice.order_number && data.invoice.order_number !== data.invoice.invoice_number && (
                    <div className="text-slate-400 text-xs mt-1">Pedido: {data.invoice.order_number}</div>
                  )}
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  {deliveryBadge(data.invoice.item_status_name || data.invoice.item_status)}
                  {data.invoice.plan_type && (
                    <span className="text-[10px] font-bold bg-white/10 px-2.5 py-1 rounded-full uppercase tracking-wide">
                      {data.invoice.plan_type}
                    </span>
                  )}
                  {canEdit && data.route?.route_id && (
                    <button
                      onClick={() => setShowLiberarModal(true)}
                      className="mt-1 px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow transition-all active:scale-95 whitespace-nowrap"
                    >
                      Liberar Factura
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Cliente</div>
                  <div className="text-sm font-semibold text-white">{data.invoice.customer_name || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Ciudad</div>
                  <div className="text-sm font-semibold text-white">{data.invoice.city || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Dirección</div>
                  <div className="text-sm font-semibold text-white">{data.invoice.address || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Documento Origen</div>
                  <div className="text-sm font-semibold text-white">{data.invoice.external_doc_id || data.invoice.document_id}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Ciclo de Vida</h2>
            <div className="relative">
              <div className="absolute top-6 left-6 right-6 h-0.5 bg-slate-200 hidden md:block" />
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-2 relative z-10">
                {STEPS.map((step) => {
                  const st = stepStatuses[step.key];
                  const isDone    = st === 'done';
                  const isCurrent = st === 'current';

                  let detail: string | null = null;
                  if (step.key === 'ingreso'    && data.invoice.received_at)         detail = fmtDate(data.invoice.received_at)!;
                  if (step.key === 'auditado'   && data.invoice.inventory_date)      detail = fmtDate(data.invoice.inventory_date)!;
                  if (step.key === 'asignado'   && data.route?.assigned_at)          detail = fmtDate(data.route.assigned_at)!;
                  if (step.key === 'en_ruta'    && data.dispatch?.dispatched_at)     detail = fmtDate(data.dispatch.dispatched_at)!;
                  if (step.key === 'entregado'  && data.invoice.delivery_date)       detail = fmtDate(data.invoice.delivery_date)!;
                  if (step.key === 'conciliado' && data.conciliation?.conciliado_at) detail = fmtDate(data.conciliation.conciliado_at)!;

                  return (
                    <div key={step.key} className="flex flex-col items-center gap-2 text-center">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm
                        ${isDone    ? 'bg-emerald-500 text-white shadow-emerald-500/30 shadow-md' : ''}
                        ${isCurrent ? 'bg-amber-500  text-white shadow-amber-500/30  shadow-md animate-pulse' : ''}
                        ${st === 'pending' ? 'bg-slate-100 text-slate-300' : ''}
                      `}>
                        <span className="w-5 h-5">{step.icon}</span>
                      </div>
                      <div>
                        <div className={`text-[10px] font-black uppercase tracking-wide leading-tight
                          ${isDone    ? 'text-emerald-600' : ''}
                          ${isCurrent ? 'text-amber-600'   : ''}
                          ${st === 'pending' ? 'text-slate-300' : ''}
                        `}>
                          {step.label}
                        </div>
                        {detail && <div className="text-[9px] text-slate-400 mt-0.5">{detail}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Secciones de detalle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SectionCard title="Ingreso al Sistema" icon={<Icons.Upload />} accent="border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Fecha Ingreso"  value={fmtDateTime(data.invoice.received_at)} />
                <InfoRow label="Recibido por"   value={data.invoice.received_by_name} />
                <InfoRow label="Doc. Origen"    value={data.invoice.external_doc_id} />
                <InfoRow label="Plan"           value={data.invoice.plan_type} />
                <InfoRow label="Cant. Esperada" value={data.invoice.total_qty ? `${data.invoice.total_qty} uds` : null} />
                <InfoRow label="Placa Asignada" value={data.invoice.vehicle_plate} />
              </div>
            </SectionCard>

            <SectionCard title="Auditoría / Conteo" icon={<Icons.CheckCircle />} accent="border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Fecha Inventario" value={fmtDate(data.invoice.inventory_date)} />
                <InfoRow label="Auditor"          value={data.invoice.inventory_user} />
                <InfoRow label="Estado Doc."      value={data.invoice.doc_status_name} />
                <InfoRow label="Cant. Recibida"   value={data.invoice.received_qty != null ? `${data.invoice.received_qty} uds` : null} />
              </div>
            </SectionCard>

            {data.route ? (
              <SectionCard title="Asignación a Ruta" icon={<Icons.Truck />} accent="border-blue-100">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Fecha Asignación" value={fmtDateTime(data.route.assigned_at)} />
                  <InfoRow label="Conductor"         value={data.route.driver_name} />
                  <InfoRow label="Documento"         value={data.route.driver_document} />
                  <InfoRow label="Placa"             value={data.route.plate} />
                  <InfoRow label="Estado Ruta"       value={data.route.route_status_name} />
                  <InfoRow label="ID Ruta"           value={data.route.route_id} />
                </div>
              </SectionCard>
            ) : data.dispatch ? (
              <SectionCard title="Despacho Directo" icon={<Icons.Truck />} accent="border-blue-100">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Fecha Despacho" value={fmtDateTime(data.dispatch.dispatched_at)} />
                  <InfoRow label="Conductor"       value={data.dispatch.driver_name} />
                  <InfoRow label="Placa"           value={data.dispatch.plate} />
                  <InfoRow label="Estado"          value={data.dispatch.dispatch_status} />
                </div>
              </SectionCard>
            ) : (
              <SectionCard title="Asignación a Ruta" icon={<Icons.Truck />} accent="border-slate-100">
                <div className="text-center py-4">
                  <p className="text-slate-300 text-sm font-medium">Sin asignación de ruta registrada</p>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Estado de Entrega" icon={<Icons.Package />} accent="border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Fecha Entrega" value={fmtDate(data.invoice.delivery_date)} />
                <InfoRow label="Estado Final"  value={deliveryBadge(data.invoice.item_status_name || data.invoice.item_status)} />
                {data.items.some(i => i.novedad) && (
                  <div className="col-span-2">
                    <InfoRow label="Novedad" value={data.items.find(i => i.novedad)?.novedad} />
                  </div>
                )}
              </div>
            </SectionCard>

            {data.conciliation ? (
              <SectionCard title="Conciliación" icon={<Icons.CreditCard />} accent="border-emerald-100">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Fecha Pago"    value={fmtDate(data.conciliation.fecha_pago) || fmtDateTime(data.conciliation.conciliado_at)} />
                  <InfoRow label="Forma de Pago" value={data.conciliation.es_devolucion ? 'Devolución' : data.conciliation.forma_pago} />
                  <InfoRow label="Valor"         value={fmtCOP(data.conciliation.valor) || fmtCOP(data.payment?.vmetodo)} />
                  <InfoRow label="Banco"         value={data.conciliation.banco} />
                  {data.conciliation.comprobante && <InfoRow label="Comprobante" value={data.conciliation.comprobante} />}
                  {data.conciliation.numero_cheque && <InfoRow label="N° Cheque" value={data.conciliation.numero_cheque} />}
                  <InfoRow label="Conciliado por"  value={data.conciliation.conciliado_por_nombre} />
                  <InfoRow label="Fecha Registro"  value={fmtDateTime(data.conciliation.conciliado_at)} />
                </div>
              </SectionCard>
            ) : data.payment ? (
              <SectionCard title="Pago Registrado" icon={<Icons.CreditCard />} accent="border-emerald-100">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Método de Pago" value={data.payment.metodo_pago} />
                  <InfoRow label="Valor"          value={fmtCOP(data.payment.vmetodo)} />
                  <InfoRow label="Banco"          value={data.payment.banco} />
                  <InfoRow label="Referencia"     value={data.payment.referencia} />
                </div>
                <p className="mt-3 text-[11px] text-amber-600 font-semibold bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
                  Pago registrado · Pendiente de conciliación formal
                </p>
              </SectionCard>
            ) : (
              <SectionCard title="Conciliación" icon={<Icons.CreditCard />} accent="border-slate-100">
                <div className="text-center py-4">
                  <p className="text-slate-300 text-sm font-medium">Sin conciliación registrada</p>
                </div>
              </SectionCard>
            )}
          </div>

          {/* Tabla de ítems */}
          {data.items.length > 0 && (
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                Ítems de la Factura
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold normal-case tracking-normal">{data.items.length}</span>
              </h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">SKU / Artículo</th>
                        <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción</th>
                        <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Esperado</th>
                        <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Recibido</th>
                        <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                        <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Novedad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, idx) => (
                        <tr key={idx} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-5 py-3 font-bold text-slate-700 text-xs">{item.article_id}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{item.article_name}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-700 text-xs tabular-nums">{item.expected_qty}</td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums">
                            {item.received_qty != null ? (
                              <span className={`font-bold ${item.received_qty < item.expected_qty ? 'text-rose-500' : 'text-emerald-600'}`}>{item.received_qty}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {item.item_status_name
                              ? <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{item.item_status_name}</span>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{item.novedad || item.observation || <span className="text-slate-200">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Historial de modificaciones de ruta */}
          {data.modifications?.length > 0 && (
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                Historial de Modificaciones de Ruta
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold normal-case tracking-normal">{data.modifications.length}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {data.modifications.map((log, i) => {
                  const isUnassign   = log.action === 'UNASSIGN_INVOICE';
                  const isReassign   = log.action === 'REASSIGN_PLATE' || log.action === 'REASSIGN_VEHICLE' || log.action === 'REASSIGN';
                  const isAdd        = log.action === 'ADD';
                  let parsedDetails: any = null;
                  try {
                    parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                  } catch { parsedDetails = null; }
                  const obs = parsedDetails?.observations || null;
                  const accentBg    = isUnassign ? 'bg-rose-50 border-rose-200'
                                    : isReassign ? 'bg-amber-50 border-amber-200'
                                    : isAdd      ? 'bg-emerald-50 border-emerald-200'
                                    : 'bg-slate-50 border-slate-200';
                  const accentText  = isUnassign ? 'text-rose-700'
                                    : isReassign ? 'text-amber-700'
                                    : isAdd      ? 'text-emerald-700'
                                    : 'text-slate-600';
                  const icon        = isUnassign ? '🔓' : isReassign ? '🔄' : isAdd ? '➕' : '📝';
                  const actionLabel = isUnassign ? 'Liberación de Ruta'
                                    : isReassign ? 'Cambio de Placa / Reasignación'
                                    : isAdd      ? 'Asignada a Ruta'
                                    : log.action;
                  return (
                    <div key={log.id || i} className={`rounded-2xl border ${accentBg} px-5 py-4 flex flex-col md:flex-row md:items-start gap-3`}>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-lg">{icon}</span>
                        <div>
                          <div className={`text-[10px] font-black uppercase tracking-widest ${accentText}`}>{actionLabel}</div>
                          <div className="text-[10px] text-slate-400">{fmtDateTime(log.created_at)}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 flex-1 text-xs">
                        {log.user_name && (
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Usuario</div>
                            <div className="font-semibold text-slate-700">{log.user_name}</div>
                          </div>
                        )}
                        {(log.previous_plate || log.new_plate) && (
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Placa</div>
                            <div className="font-mono font-black text-slate-800 flex items-center gap-1">
                              {log.previous_plate && <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded">{log.previous_plate}</span>}
                              {log.previous_plate && log.new_plate && <span className="text-slate-300">→</span>}
                              {log.new_plate && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{log.new_plate}</span>}
                            </div>
                          </div>
                        )}
                        {log.route_id && (
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Ruta ID</div>
                            <div className="font-mono text-slate-500">{log.route_id}</div>
                          </div>
                        )}
                        {obs && (
                          <div className="w-full md:w-auto">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Observación</div>
                            <div className="text-slate-700 font-semibold">{obs}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Componente principal con tabs ─────────────────────────────────────────────

type Tab = 'factura' | 'item';

const ConsultaFacturas: React.FC<{ user: any }> = ({ user }) => {
  const [tab, setTab] = useState<Tab>('factura');

  return (
    <div className="min-h-full flex flex-col bg-slate-50 p-6 md:p-10">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-4">
          Consulta de Facturas
        </h1>
        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1 w-fit shadow-sm">
          <button
            onClick={() => setTab('factura')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              tab === 'factura'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Consulta Factura
          </button>
          <button
            onClick={() => setTab('item')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              tab === 'item'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            Consulta Ítem
          </button>
        </div>
      </div>

      {/* Contenido del tab */}
      {tab === 'factura' ? <ConsultaFacturaTab user={user} /> : <ConsultaItem user={user} />}
    </div>
  );
};

export default ConsultaFacturas;
