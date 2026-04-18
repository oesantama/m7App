import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { Icons } from '../constants';

// ── Tipos ─────────────────────────────────────────────────────────────────────

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
  statuses: string[];
}

const STEPS: StepDef[] = [
  {
    key: 'ingreso',
    label: 'Ingreso al Sistema',
    icon: <Icons.Upload />,
    statuses: ['EST-03', 'EST-01', 'PENDIENTE'],
  },
  {
    key: 'auditado',
    label: 'Auditado / Conteo',
    icon: <Icons.CheckCircle />,
    statuses: ['EST-04', 'EST-05', 'EST-06', 'EST-08', 'EST-09', 'EN CONTEO', 'AUDITADO', 'RECIBIDO', 'INVENTARIADO', 'ALISTADO'],
  },
  {
    key: 'asignado',
    label: 'Asignado a Ruta',
    icon: <Icons.Truck />,
    statuses: ['EST-10', 'ASIGNADO'],
  },
  {
    key: 'en_ruta',
    label: 'En Ruta',
    icon: <Icons.MapPin />,
    statuses: ['EST-11', 'EN RUTA'],
  },
  {
    key: 'entregado',
    label: 'Entrega',
    icon: <Icons.Package />,
    statuses: ['EST-12', 'EST-13', 'EST-14', 'EST-15', 'EST-17', 'ENTREGADO', 'DEVUELTO', 'ENTREGA PARCIAL', 'REPIQUE', 'RECHAZADO'],
  },
  {
    key: 'conciliado',
    label: 'Conciliado',
    icon: <Icons.CreditCard />,
    statuses: ['EST-07', 'COMPLETADO', 'FINALIZADO'],
  },
];

type StepStatus = 'done' | 'current' | 'pending';

function getStepStatuses(data: TraceabilityData): Record<StepKey, StepStatus> {
  const itemStatus  = (data.invoice.item_status  || '').toUpperCase();
  const docStatus   = (data.invoice.doc_status   || '').toUpperCase();

  const hasRoute       = !!data.route;
  const hasDispatch    = !!data.dispatch;
  const hasConciliation = !!data.conciliation;

  const isDelivered = ['EST-12','EST-13','EST-14','EST-15','EST-17',
    'ENTREGADO','DEVUELTO','ENTREGA PARCIAL','REPIQUE','RECHAZADO',
    'COMPLETED','FINALIZADO'].some(s => itemStatus === s || docStatus === s);

  const isInRoute    = isDelivered || ['EST-11','EN RUTA'].some(s => itemStatus === s || docStatus === s);
  const isAssigned   = isInRoute   || hasRoute || hasDispatch || ['EST-10','ASIGNADO'].some(s => itemStatus === s || docStatus === s);
  const isAudited    = isAssigned  || ['EST-04','EST-05','EST-06','EST-08','EST-09',
    'EN CONTEO','AUDITADO','RECIBIDO','INVENTARIADO','ALISTADO'].some(s => itemStatus === s || docStatus === s);
  const isIngested   = true; // si llegó a la respuesta, está ingresado
  const isConciliated = hasConciliation;

  return {
    ingreso:    isIngested   ? (isAudited    ? 'done' : 'current') : 'pending',
    auditado:   isAudited    ? (isAssigned   ? 'done' : 'current') : 'pending',
    asignado:   isAssigned   ? (isInRoute    ? 'done' : 'current') : 'pending',
    en_ruta:    isInRoute    ? (isDelivered  ? 'done' : 'current') : 'pending',
    entregado:  isDelivered  ? (isConciliated ? 'done' : 'current') : 'pending',
    conciliado: isConciliated ? 'done' : 'pending',
  };
}

const DELIVERY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'EST-12':         { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200'  },
  'ENTREGADO':      { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200'  },
  'EST-13':         { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200'    },
  'DEVUELTO':       { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200'    },
  'EST-14':         { bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-200'   },
  'ENTREGA PARCIAL':{ bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-200'   },
  'EST-15':         { bg: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200'   },
  'REPIQUE':        { bg: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200'   },
  'EST-17':         { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200'     },
  'RECHAZADO':      { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200'     },
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

// ── Subcomponentes ────────────────────────────────────────────────────────────

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

// ── Componente principal ──────────────────────────────────────────────────────

const ConsultaFacturas: React.FC = () => {
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [data, setData]         = useState<TraceabilityData | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

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
    <div className="min-h-full flex flex-col bg-slate-50 p-6 md:p-10">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600">Trazabilidad Logística</span>
        </div>
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
          Consulta de Facturas
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          Ingrese el número de factura para ver su ciclo de vida completo en el sistema.
        </p>
      </div>

      {/* ── Buscador ── */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-3 max-w-xl">
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4">
              <Icons.Search />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ej: FAC-2024-001 o número de pedido..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 text-sm shadow-sm transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm transition-all active:scale-95 whitespace-nowrap"
          >
            {loading ? 'Buscando...' : 'Consultar'}
          </button>
        </div>
      </form>

      {/* ── Estado vacío ── */}
      {!data && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
          <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-5 text-slate-300">
            <Icons.Search />
          </div>
          <p className="text-slate-400 font-semibold text-lg">Ingrese un número de factura para comenzar</p>
          <p className="text-slate-300 text-sm mt-1">Se mostrará toda la trazabilidad disponible en el sistema</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="max-w-xl bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3">
          <div className="text-rose-500 w-5 h-5 mt-0.5 shrink-0"><Icons.Alert /></div>
          <div>
            <p className="font-bold text-rose-700 text-sm">No se encontró la factura</p>
            <p className="text-rose-500 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Cargando ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium">Consultando trazabilidad...</p>
          </div>
        </div>
      )}

      {/* ── Resultado ── */}
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
              {/* Línea conectora */}
              <div className="absolute top-6 left-6 right-6 h-0.5 bg-slate-200 hidden md:block" />

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-2 relative z-10">
                {STEPS.map((step) => {
                  const st = stepStatuses[step.key];
                  const isDone    = st === 'done';
                  const isCurrent = st === 'current';

                  // Datos adicionales por paso
                  let detail: string | null = null;
                  if (step.key === 'ingreso' && data.invoice.received_at)
                    detail = fmtDate(data.invoice.received_at)!;
                  if (step.key === 'auditado' && data.invoice.inventory_date)
                    detail = fmtDate(data.invoice.inventory_date)!;
                  if (step.key === 'asignado' && data.route?.assigned_at)
                    detail = fmtDate(data.route.assigned_at)!;
                  if (step.key === 'en_ruta' && data.dispatch?.dispatched_at)
                    detail = fmtDate(data.dispatch.dispatched_at)!;
                  if (step.key === 'entregado' && data.invoice.delivery_date)
                    detail = fmtDate(data.invoice.delivery_date)!;
                  if (step.key === 'conciliado' && data.conciliation?.conciliado_at)
                    detail = fmtDate(data.conciliation.conciliado_at)!;

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
                        {detail && (
                          <div className="text-[9px] text-slate-400 mt-0.5">{detail}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Secciones de detalle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Ingreso */}
            <SectionCard title="Ingreso al Sistema" icon={<Icons.Upload />} accent="border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Fecha Ingreso"    value={fmtDateTime(data.invoice.received_at)} />
                <InfoRow label="Recibido por"     value={data.invoice.received_by_name} />
                <InfoRow label="Doc. Origen"      value={data.invoice.external_doc_id} />
                <InfoRow label="Plan"             value={data.invoice.plan_type} />
                <InfoRow label="Cant. Esperada"   value={data.invoice.total_qty ? `${data.invoice.total_qty} uds` : null} />
                <InfoRow label="Placa Asignada"   value={data.invoice.vehicle_plate} />
              </div>
            </SectionCard>

            {/* Auditoría */}
            <SectionCard title="Auditoría / Conteo" icon={<Icons.CheckCircle />} accent="border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Fecha Inventario" value={fmtDate(data.invoice.inventory_date)} />
                <InfoRow label="Auditor"          value={data.invoice.inventory_user} />
                <InfoRow label="Estado Doc."      value={data.invoice.doc_status_name} />
                <InfoRow label="Cant. Recibida"   value={data.invoice.received_qty != null ? `${data.invoice.received_qty} uds` : null} />
              </div>
            </SectionCard>

            {/* Ruta */}
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
                  <InfoRow label="Fecha Despacho"  value={fmtDateTime(data.dispatch.dispatched_at)} />
                  <InfoRow label="Conductor"        value={data.dispatch.driver_name} />
                  <InfoRow label="Placa"            value={data.dispatch.plate} />
                  <InfoRow label="Estado"           value={data.dispatch.dispatch_status} />
                </div>
              </SectionCard>
            ) : (
              <SectionCard title="Asignación a Ruta" icon={<Icons.Truck />} accent="border-slate-100">
                <div className="text-center py-4">
                  <p className="text-slate-300 text-sm font-medium">Sin asignación de ruta registrada</p>
                </div>
              </SectionCard>
            )}

            {/* Entrega */}
            <SectionCard title="Estado de Entrega" icon={<Icons.Package />} accent="border-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <InfoRow label="Fecha Entrega"     value={fmtDate(data.invoice.delivery_date)} />
                <InfoRow label="Estado Final"      value={deliveryBadge(data.invoice.item_status_name || data.invoice.item_status)} />
                {data.items.some(i => i.novedad) && (
                  <div className="col-span-2">
                    <InfoRow
                      label="Novedad"
                      value={data.items.find(i => i.novedad)?.novedad}
                    />
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Conciliación */}
            {data.conciliation ? (
              <SectionCard title="Conciliación" icon={<Icons.CreditCard />} accent="border-emerald-100">
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Fecha Pago"       value={fmtDate(data.conciliation.fecha_pago) || fmtDateTime(data.conciliation.conciliado_at)} />
                  <InfoRow label="Forma de Pago"    value={data.conciliation.es_devolucion ? 'Devolución' : data.conciliation.forma_pago} />
                  <InfoRow label="Valor"            value={fmtCOP(data.conciliation.valor) || fmtCOP(data.payment?.vmetodo)} />
                  <InfoRow label="Banco"            value={data.conciliation.banco} />
                  {data.conciliation.comprobante && (
                    <InfoRow label="Comprobante"    value={data.conciliation.comprobante} />
                  )}
                  {data.conciliation.numero_cheque && (
                    <InfoRow label="N° Cheque"      value={data.conciliation.numero_cheque} />
                  )}
                  <InfoRow label="Conciliado por"   value={data.conciliation.conciliado_por_nombre} />
                  <InfoRow label="Fecha Registro"   value={fmtDateTime(data.conciliation.conciliado_at)} />
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
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold normal-case tracking-normal">
                  {data.items.length}
                </span>
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
                              <span className={`font-bold ${item.received_qty < item.expected_qty ? 'text-rose-500' : 'text-emerald-600'}`}>
                                {item.received_qty}
                              </span>
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

        </div>
      )}
    </div>
  );
};

export default ConsultaFacturas;
