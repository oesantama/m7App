import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoEntrega = 'entregado' | 'devolucion' | 'parcial';
type MetodoPago   = 'TRANSFERENCIA' | 'CONSIGNACION';

interface InvoiceRow {
    invoice_number: string;
    customer_name?: string;
    city?: string;
    address?: string;
    total_qty?: number;
    conciliation_id?: number;
    banco?: string;
    valor?: number;
    comprobante?: string;
    fecha_pago?: string;
    forma_pago?: string;
    numero_cheque?: string;
    es_devolucion?: boolean;
    conciliado_por?: string;
    conductor_id?: string;
    conductor_name?: string;
    vehicle_plate?: string;
    conciliado_at?: string;
    conciliado_por_nombre?: string;
    invoice_value?: number;
    invoice_metodo_pago?: string;
    item_status?: string;
    route_vehicle_plate?: string;
}

interface RouteGroup {
    route_id: string;
    plate: string;
    driver_name: string | null;
    invoice_count: number;
    efectivo: number;
    credito: number;
    completadas: number;
    devueltas: number;
    parciales: number;
    legalizadas: number;
}

interface InvoiceFormState {
    estadoEntrega: EstadoEntrega;
    sobrecosto: string;
    valor: string;         // total a pagar
    numConsignacion: string;
    metodo: MetodoPago;
    banco: string;
    fecha: string;
    expanded: boolean;
    saving: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    route: RouteGroup;
    invoices: InvoiceRow[];
    documentId: string;
    currentUserId: string;
    onSaved: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCOP = (v: number | undefined | null) =>
    v != null && v > 0
        ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
        : '—';

const ENTREGADO_STATUS = ['EST-12', 'ENTREGADO', 'COMPLETED', 'FINALIZADO'];
const DEVUELTO_STATUS  = ['EST-13', 'DEVUELTO'];
const PARCIAL_STATUS   = ['EST-14', 'ENTREGA PARCIAL'];

function inferEstado(inv: InvoiceRow): EstadoEntrega {
    if (inv.es_devolucion) return 'devolucion';
    const s = (inv.item_status || '').toUpperCase();
    if (DEVUELTO_STATUS.includes(s)) return 'devolucion';
    if (PARCIAL_STATUS.includes(s))  return 'parcial';
    return 'entregado';
}

function initForm(inv: InvoiceRow): InvoiceFormState {
    const estadoEntrega = inferEstado(inv);
    const isLegalized   = !!inv.forma_pago;
    return {
        estadoEntrega,
        sobrecosto:       '',
        valor:            isLegalized ? String(inv.valor ?? '')
                          : estadoEntrega === 'devolucion' ? '0'
                          : String(inv.invoice_value ?? ''),
        numConsignacion:  inv.comprobante || '',
        metodo:           (inv.forma_pago as MetodoPago) || 'TRANSFERENCIA',
        banco:            inv.banco || '',
        fecha:            inv.fecha_pago
                            ? inv.fecha_pago.slice(0, 10)
                            : new Date().toISOString().slice(0, 10),
        expanded:         false,
        saving:           false,
    };
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

const EstadoPill: React.FC<{
    value: EstadoEntrega;
    active: EstadoEntrega;
    label: string;
    icon: string;
    onClick: () => void;
}> = ({ value, active, label, icon, onClick }) => {
    const isActive = value === active;
    const colors: Record<EstadoEntrega, string> = {
        entregado:  isActive ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-600',
        devolucion: isActive ? 'bg-rose-500    border-rose-500    text-white' : 'border-slate-200 text-slate-500 hover:border-rose-400    hover:text-rose-600',
        parcial:    isActive ? 'bg-amber-500   border-amber-500   text-white' : 'border-slate-200 text-slate-500 hover:border-amber-400   hover:text-amber-600',
    };
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border-2 text-[9px] font-black uppercase tracking-wide transition-all ${colors[value]}`}
        >
            <span className="text-lg">{icon}</span>
            {label}
        </button>
    );
};

// ── Componente principal ──────────────────────────────────────────────────────

const ConciliacionRouteModal: React.FC<Props> = ({
    isOpen, onClose, route, invoices, documentId, currentUserId, onSaved,
}) => {
    const [forms, setForms] = useState<Map<string, InvoiceFormState>>(new Map());

    // Inicializar / re-inicializar formularios cuando cambia la lista de facturas
    useEffect(() => {
        if (!isOpen) return;
        const m = new Map<string, InvoiceFormState>();
        invoices.forEach(inv => m.set(inv.invoice_number, initForm(inv)));
        setForms(m);
    }, [isOpen, invoices]);

    const updateForm = useCallback((invoiceNum: string, patch: Partial<InvoiceFormState>) => {
        setForms(prev => {
            const next = new Map(prev);
            const cur  = next.get(invoiceNum);
            if (cur) next.set(invoiceNum, { ...cur, ...patch });
            return next;
        });
    }, []);

    // ── Totales de placa ──────────────────────────────────────────────────────
    const plateTotals = useMemo(() => {
        const totalValue   = invoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const legalizedVal = invoices
            .filter(i => !!i.forma_pago)
            .reduce((s, i) => s + (Number(i.valor) || 0), 0);
        const legalCount   = invoices.filter(i => !!i.forma_pago).length;
        const pendingVal   = totalValue - legalizedVal;
        return { totalValue, legalizedVal, legalCount, pendingVal, total: invoices.length };
    }, [invoices]);

    const pct = plateTotals.total > 0
        ? Math.round((plateTotals.legalCount / plateTotals.total) * 100) : 0;

    // ── Guardar una factura ───────────────────────────────────────────────────
    const handleSave = async (inv: InvoiceRow) => {
        const form = forms.get(inv.invoice_number);
        if (!form) return;

        const esDevolucion = form.estadoEntrega === 'devolucion';
        const valorNum     = Number(form.valor);

        if (!esDevolucion && (isNaN(valorNum) || valorNum <= 0)) {
            toast.error('Ingrese un valor mayor a 0');
            return;
        }

        updateForm(inv.invoice_number, { saving: true });
        try {
            await api.saveConciliation({
                documentId,
                invoiceNumber:  inv.invoice_number,
                banco:          form.banco    || undefined,
                valor:          esDevolucion ? 0 : valorNum,
                comprobante:    form.numConsignacion || undefined,
                fechaPago:      form.fecha    || undefined,
                formaPago:      esDevolucion ? 'DEVOLUCION' : form.metodo,
                esDevolucion,
                conciliadoPor:  currentUserId,
                vehiclePlate:   inv.vehicle_plate || route.plate,
                conductorId:    inv.conductor_id,
                conductorName:  inv.conductor_name || route.driver_name || undefined,
            });
            toast.success(`✅ ${inv.invoice_number} legalizada`);
            updateForm(inv.invoice_number, { saving: false, expanded: false });
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
            updateForm(inv.invoice_number, { saving: false });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[960] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-250 flex flex-col max-h-[92vh] overflow-hidden">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-6 pt-6 pb-5 rounded-t-[2rem] flex-shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-0.5">
                                Conciliar Facturas
                            </p>
                            <h3 className="text-2xl font-black text-white tracking-tight">
                                🚛 {route.plate || 'Sin placa'}
                            </h3>
                            {route.driver_name && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    👤 {route.driver_name}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all flex-shrink-0 mt-1"
                        >
                            <Icons.X className="w-4 h-4 text-white" />
                        </button>
                    </div>

                    {/* Barra de progreso placa */}
                    <div className="mt-4 bg-white/5 rounded-2xl px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                Avance de Legalización
                            </span>
                            <span className="text-[9px] font-black text-emerald-400">
                                {plateTotals.legalCount}/{plateTotals.total} · {pct}%
                            </span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-2.5 gap-2">
                            <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 text-center">
                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Legalizado</p>
                                <p className="text-[11px] font-black text-emerald-300">{fmtCOP(plateTotals.legalizedVal)}</p>
                            </div>
                            <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-1.5 text-center">
                                <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-0.5">Pendiente</p>
                                <p className="text-[11px] font-black text-amber-300">{fmtCOP(plateTotals.pendingVal)}</p>
                            </div>
                            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-center">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Placa</p>
                                <p className="text-[11px] font-black text-white">{fmtCOP(plateTotals.totalValue)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Lista de facturas ────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-2.5">
                    {invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <span className="text-4xl mb-3">📄</span>
                            <p className="text-sm font-bold text-slate-400">No hay facturas para esta ruta</p>
                        </div>
                    ) : invoices.map(inv => {
                        const form        = forms.get(inv.invoice_number);
                        if (!form) return null;
                        const isLegalized = !!inv.forma_pago;
                        const isExpanded  = form.expanded;
                        const invoiceVal  = Number(inv.invoice_value) || 0;

                        // Calcular total a pagar (factura + sobrecosto)
                        const sobrecostoNum = Number(form.sobrecosto) || 0;
                        const totalPagar    = form.estadoEntrega === 'devolucion'
                            ? 0
                            : invoiceVal + sobrecostoNum;

                        // Badge de estado de entrega
                        const itemBadge = ENTREGADO_STATUS.includes(inv.item_status || '')
                            ? { bg: 'bg-teal-100', text: 'text-teal-700', label: '✅ Entregada' }
                            : DEVUELTO_STATUS.includes(inv.item_status || '')
                            ? { bg: 'bg-rose-100', text: 'text-rose-700', label: '🔄 Devuelta' }
                            : PARCIAL_STATUS.includes(inv.item_status || '')
                            ? { bg: 'bg-amber-100', text: 'text-amber-700', label: '📦 Parcial' }
                            : null;

                        const legBadgeColor = isLegalized ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';

                        return (
                            <div
                                key={inv.invoice_number}
                                className={`bg-white rounded-2xl border-2 overflow-hidden transition-all
                                    ${isLegalized ? 'border-emerald-200' : isExpanded ? 'border-emerald-400 shadow-md shadow-emerald-100' : 'border-slate-100'}`}
                            >
                                {/* ── Fila compacta ──────────────────────── */}
                                <div className="flex items-start gap-3 px-4 py-3.5">
                                    {/* Icono estado */}
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5
                                        ${isLegalized ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                        <span className="text-sm">{isLegalized ? '✅' : '⏳'}</span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        {/* Número + badges */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[11px] font-black text-slate-900">
                                                {inv.invoice_number}
                                            </span>
                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${legBadgeColor}`}>
                                                {isLegalized ? 'Legalizada' : 'Pendiente'}
                                            </span>
                                            {itemBadge && (
                                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${itemBadge.bg} ${itemBadge.text}`}>
                                                    {itemBadge.label}
                                                </span>
                                            )}
                                        </div>
                                        {/* Cliente */}
                                        {inv.customer_name && (
                                            <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>
                                        )}
                                        {/* Valor */}
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            {invoiceVal > 0 && (
                                                <span className="text-[9px] font-bold text-slate-600">
                                                    Factura: {fmtCOP(invoiceVal)}
                                                </span>
                                            )}
                                            {isLegalized && inv.valor != null && (
                                                <span className="text-[9px] font-black text-emerald-600">
                                                    Recaudado: {fmtCOP(inv.valor)}
                                                </span>
                                            )}
                                        </div>
                                        {/* Info conciliación si ya está legalizada */}
                                        {isLegalized && (
                                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[8px] text-slate-400">
                                                {inv.forma_pago && (
                                                    <span className="font-bold text-slate-600">{inv.forma_pago}</span>
                                                )}
                                                {inv.banco && <span>🏦 {inv.banco}</span>}
                                                {inv.comprobante && <span>📋 {inv.comprobante}</span>}
                                                {inv.conciliado_por_nombre && (
                                                    <span>por {inv.conciliado_por_nombre}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Botón expandir/editar */}
                                    <button
                                        onClick={() => updateForm(inv.invoice_number, { expanded: !isExpanded })}
                                        className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all
                                            ${isExpanded
                                                ? 'bg-emerald-600 text-white'
                                                : isLegalized
                                                    ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                    >
                                        {isExpanded ? (
                                            <>
                                                <Icons.ChevronRight className="w-3 h-3 rotate-90" />
                                                Cerrar
                                            </>
                                        ) : isLegalized ? 'Editar' : 'Legalizar'}
                                    </button>
                                </div>

                                {/* ── Formulario expandido ────────────────── */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 pt-4 pb-5 space-y-4">

                                        {/* Estado de entrega */}
                                        <div>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                Estado de Entrega <span className="text-rose-500">*</span>
                                            </p>
                                            <div className="flex gap-2">
                                                <EstadoPill
                                                    value="entregado"
                                                    active={form.estadoEntrega}
                                                    label="Entregado"
                                                    icon="✅"
                                                    onClick={() => {
                                                        updateForm(inv.invoice_number, {
                                                            estadoEntrega: 'entregado',
                                                            valor: String(invoiceVal + (Number(form.sobrecosto) || 0) || ''),
                                                        });
                                                    }}
                                                />
                                                <EstadoPill
                                                    value="parcial"
                                                    active={form.estadoEntrega}
                                                    label="Parcial"
                                                    icon="📦"
                                                    onClick={() => updateForm(inv.invoice_number, { estadoEntrega: 'parcial' })}
                                                />
                                                <EstadoPill
                                                    value="devolucion"
                                                    active={form.estadoEntrega}
                                                    label="Devolución"
                                                    icon="🔄"
                                                    onClick={() => updateForm(inv.invoice_number, {
                                                        estadoEntrega: 'devolucion',
                                                        valor: '0',
                                                    })}
                                                />
                                            </div>
                                        </div>

                                        {form.estadoEntrega !== 'devolucion' && (
                                            <>
                                                {/* Valor factura + sobrecosto + total */}
                                                <div className="grid grid-cols-3 gap-3">
                                                    {/* Valor factura (readonly) */}
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                            Valor Factura
                                                        </label>
                                                        <div className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-600">
                                                            {invoiceVal > 0 ? fmtCOP(invoiceVal) : '—'}
                                                        </div>
                                                    </div>

                                                    {/* Sobrecosto */}
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                            Sobrecosto
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">$</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={form.sobrecosto}
                                                                onChange={e => {
                                                                    const sc  = e.target.value;
                                                                    const scN = Number(sc) || 0;
                                                                    updateForm(inv.invoice_number, {
                                                                        sobrecosto: sc,
                                                                        valor: String(invoiceVal + scN),
                                                                    });
                                                                }}
                                                                placeholder="0"
                                                                className="w-full pl-6 pr-2 py-2.5 bg-white border border-slate-200 focus:border-amber-500 rounded-xl text-xs font-bold text-slate-900 outline-none transition-all"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Total a pagar */}
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                            Total a Pagar <span className="text-rose-500">*</span>
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">$</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={form.valor}
                                                                onChange={e => updateForm(inv.invoice_number, { valor: e.target.value })}
                                                                placeholder="0"
                                                                className="w-full pl-6 pr-2 py-2.5 bg-white border border-emerald-300 focus:border-emerald-500 rounded-xl text-xs font-black text-emerald-900 outline-none transition-all"
                                                            />
                                                        </div>
                                                        {totalPagar > 0 && sobrecostoNum > 0 && (
                                                            <p className="text-[8px] text-amber-600 font-bold mt-0.5 ml-1">
                                                                +{fmtCOP(sobrecostoNum)} sobrecosto
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Método de consignación */}
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                        Método de Pago <span className="text-rose-500">*</span>
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {(['TRANSFERENCIA', 'CONSIGNACION'] as MetodoPago[]).map(m => {
                                                            const active = form.metodo === m;
                                                            const cfg = m === 'TRANSFERENCIA'
                                                                ? { icon: '📱', label: 'Transferencia', activeClass: 'bg-blue-500 border-blue-500 text-white', inactiveClass: 'border-slate-200 text-slate-600 hover:border-blue-400' }
                                                                : { icon: '🏦', label: 'Consignación',  activeClass: 'bg-violet-600 border-violet-600 text-white', inactiveClass: 'border-slate-200 text-slate-600 hover:border-violet-400' };
                                                            return (
                                                                <button
                                                                    key={m}
                                                                    onClick={() => updateForm(inv.invoice_number, { metodo: m })}
                                                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-wide transition-all
                                                                        ${active ? cfg.activeClass : cfg.inactiveClass}`}
                                                                >
                                                                    <span>{cfg.icon}</span>
                                                                    {cfg.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Número de consignación + Banco */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                            N° Consignación / Ref.
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={form.numConsignacion}
                                                            onChange={e => updateForm(inv.invoice_number, { numConsignacion: e.target.value })}
                                                            placeholder="Ej: 0012345678"
                                                            className="w-full px-3 py-2.5 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                            Banco / Entidad
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={form.banco}
                                                            onChange={e => updateForm(inv.invoice_number, { banco: e.target.value })}
                                                            placeholder="Ej: Bancolombia"
                                                            className="w-full px-3 py-2.5 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Fecha */}
                                                <div>
                                                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                        Fecha de Pago
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={form.fecha}
                                                        onChange={e => updateForm(inv.invoice_number, { fecha: e.target.value })}
                                                        className="w-full px-3 py-2.5 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {form.estadoEntrega === 'devolucion' && (
                                            <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 text-center">
                                                <p className="text-xs font-black text-rose-600 uppercase tracking-wide">🔄 Factura marcada como devolución</p>
                                                <p className="text-[9px] text-rose-400 mt-0.5">No se registrará valor de recaudo</p>
                                            </div>
                                        )}

                                        {/* Botones acción */}
                                        <div className="flex gap-2 pt-1">
                                            <button
                                                onClick={() => updateForm(inv.invoice_number, { expanded: false })}
                                                className="px-4 py-2.5 rounded-xl text-slate-500 font-black text-[9px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={() => handleSave(inv)}
                                                disabled={form.saving || (form.estadoEntrega !== 'devolucion' && (!form.valor || Number(form.valor) <= 0))}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all
                                                    ${form.saving || (form.estadoEntrega !== 'devolucion' && (!form.valor || Number(form.valor) <= 0))
                                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20'}`}
                                            >
                                                {form.saving && <Icons.Loader className="w-3 h-3 animate-spin" />}
                                                {form.saving ? 'Guardando...' : '✅ Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Footer ──────────────────────────────────────────────── */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0 bg-white rounded-b-[2rem]">
                    <p className="text-[9px] font-bold text-slate-400">
                        {plateTotals.legalCount} de {plateTotals.total} facturas legalizadas
                    </p>
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white font-black text-[9px] uppercase tracking-widest transition-all"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConciliacionRouteModal;
