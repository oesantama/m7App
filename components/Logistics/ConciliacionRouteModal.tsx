import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoEntrega = 'entregado' | 'devolucion' | 'parcial';
type MetodoPago   = 'TRANSFERENCIA' | 'CONSIGNACION';
type ModalTab     = 'individual' | 'grupal';

interface InvoiceRow {
    invoice_number: string;
    customer_name?: string;
    city?: string;
    address?: string;
    total_qty?: number;
    conciliation_id?: number;
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
    mastersuite_estado?: string;
    mastersuite_id_carga?: string;
    mastersuite_fecha_despacho?: string;
    mastersuite_fecha_entrega?: string;
    mastersuite_motivo_dev?: string;
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
    valor: string;
    numConsignacion: string;
    metodo: MetodoPago;
    fecha: string;
    expanded: boolean;
    saving: boolean;
}

// Fila de consignación grupal
interface ConsignacionRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
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

// Determina qué opciones están disponibles según MasterSuite
function getMsConstraint(inv: InvoiceRow): { allowed: Set<EstadoEntrega>; hint: string | null } {
    const ms = (inv.mastersuite_estado || '').toLowerCase().trim();
    if (!ms) return { allowed: new Set<EstadoEntrega>(['entregado', 'parcial', 'devolucion']), hint: null };
    if (ms.includes('complet') || ms === 'entregado')
        return { allowed: new Set<EstadoEntrega>(['entregado']), hint: `MasterSuite: ${inv.mastersuite_estado}` };
    if (ms.includes('no entregad') || ms.includes('devol'))
        return { allowed: new Set<EstadoEntrega>(['parcial', 'devolucion']), hint: `MasterSuite: ${inv.mastersuite_estado}` };
    if (ms.includes('parcial'))
        return { allowed: new Set<EstadoEntrega>(['parcial', 'devolucion']), hint: `MasterSuite: ${inv.mastersuite_estado}` };
    return { allowed: new Set<EstadoEntrega>(['entregado', 'parcial', 'devolucion']), hint: null };
}

function inferEstado(inv: InvoiceRow): EstadoEntrega {
    // MasterSuite tiene prioridad sobre item_status
    const ms = (inv.mastersuite_estado || '').toLowerCase().trim();
    if (ms.includes('complet') || ms === 'entregado') return 'entregado';
    if (ms.includes('devol'))  return 'devolucion';
    if (ms.includes('parcial')) return 'parcial';
    // Fallback a item_status / es_devolucion
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
        fecha:            inv.fecha_pago
                            ? inv.fecha_pago.slice(0, 10)
                            : new Date().toISOString().slice(0, 10),
        expanded:         false,
        saving:           false,
    };
}

function newConsignacionRow(): ConsignacionRow {
    return {
        id:              crypto.randomUUID(),
        valor:           '',
        nroAprobacion:   '',
        fecha:           new Date().toISOString().slice(0, 10),
    };
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

const EstadoPill: React.FC<{
    value: EstadoEntrega;
    active: EstadoEntrega;
    label: string;
    icon: string;
    onClick: () => void;
    disabled?: boolean;
}> = ({ value, active, label, icon, onClick, disabled }) => {
    const isActive = value === active;
    if (disabled)
        return (
            <button disabled
                className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-300 text-[9px] font-black uppercase tracking-wide cursor-not-allowed opacity-40">
                <span className="text-lg grayscale">{icon}</span>
                {label}
            </button>
        );
    const colors: Record<EstadoEntrega, string> = {
        entregado:  isActive ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-600',
        devolucion: isActive ? 'bg-rose-500    border-rose-500    text-white' : 'border-slate-200 text-slate-500 hover:border-rose-400    hover:text-rose-600',
        parcial:    isActive ? 'bg-amber-500   border-amber-500   text-white' : 'border-slate-200 text-slate-500 hover:border-amber-400   hover:text-amber-600',
    };
    return (
        <button onClick={onClick}
            className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border-2 text-[9px] font-black uppercase tracking-wide transition-all ${colors[value]}`}>
            <span className="text-lg">{icon}</span>
            {label}
        </button>
    );
};

// ── Componente principal ──────────────────────────────────────────────────────

const ConciliacionRouteModal: React.FC<Props> = ({
    isOpen, onClose, route, invoices, documentId, currentUserId, onSaved,
}) => {
    const [tab, setTab]         = useState<ModalTab>('individual');
    const [forms, setForms]     = useState<Map<string, InvoiceFormState>>(new Map());

    // Estado consignación grupal
    const [consignaciones, setConsignaciones] = useState<ConsignacionRow[]>([newConsignacionRow()]);
    const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
    const [grupalMetodo, setGrupalMetodo]     = useState<MetodoPago>('CONSIGNACION');
    const [savingGrupal, setSavingGrupal]     = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const m = new Map<string, InvoiceFormState>();
        invoices.forEach(inv => m.set(inv.invoice_number, initForm(inv)));
        setForms(m);
        setConsignaciones([newConsignacionRow()]);
        setSelectedInvoices(new Set());
        setTab('individual');
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
        const legalizedVal = invoices.filter(i => !!i.forma_pago).reduce((s, i) => s + (Number(i.valor) || 0), 0);
        const legalCount   = invoices.filter(i => !!i.forma_pago).length;
        return { totalValue, legalizedVal, legalCount, pendingVal: totalValue - legalizedVal, total: invoices.length };
    }, [invoices]);

    const pct = plateTotals.total > 0 ? Math.round((plateTotals.legalCount / plateTotals.total) * 100) : 0;

    // ── Totales grupal ────────────────────────────────────────────────────────
    const totalConsignado = useMemo(() =>
        consignaciones.reduce((s, c) => s + (Number(c.valor.replace(/\./g, '').replace(',', '.')) || 0), 0),
    [consignaciones]);

    const totalSeleccionado = useMemo(() =>
        invoices
            .filter(inv => selectedInvoices.has(inv.invoice_number))
            .reduce((s, inv) => s + (Number(inv.invoice_value) || 0), 0),
    [invoices, selectedInvoices]);

    const grupalMatch = totalConsignado > 0 && Math.abs(totalConsignado - totalSeleccionado) <= 1500;

    // ── Guardar individual ────────────────────────────────────────────────────
    const handleSave = async (inv: InvoiceRow) => {
        const form = forms.get(inv.invoice_number);
        if (!form) return;
        const esDevolucion  = form.estadoEntrega === 'devolucion';
        const valorNum      = Number(form.valor);
        const invoiceVal    = Number(inv.invoice_value) || 0;
        const sobrecostoNum = Number(form.sobrecosto) || 0;
        const expectedTotal = invoiceVal + sobrecostoNum;

        if (!esDevolucion && (isNaN(valorNum) || valorNum <= 0)) {
            toast.error('Ingrese un valor mayor a 0');
            return;
        }
        // Entregado: el total a pagar debe coincidir con valor factura + sobrecosto (±1500)
        if (form.estadoEntrega === 'entregado' && expectedTotal > 0 && Math.abs(valorNum - expectedTotal) > 1500) {
            toast.error(`Entregado requiere el valor completo: ${fmtCOP(expectedTotal)}. Diferencia: ${fmtCOP(Math.abs(valorNum - expectedTotal))}`);
            return;
        }
        // Parcial: el valor debe ser menor al total esperado
        if (form.estadoEntrega === 'parcial' && expectedTotal > 0 && valorNum >= expectedTotal) {
            toast.error(`Parcial: el valor (${fmtCOP(valorNum)}) no puede ser igual o mayor al total de la factura (${fmtCOP(expectedTotal)})`);
            return;
        }
        updateForm(inv.invoice_number, { saving: true });
        try {
            await api.saveConciliation({
                documentId,
                invoiceNumber:  inv.invoice_number,
                valor:          esDevolucion ? 0 : valorNum,
                comprobante:    form.numConsignacion || undefined,
                fechaPago:      form.fecha    || undefined,
                formaPago:      esDevolucion ? 'DEVOLUCION' : form.metodo,
                esDevolucion,
                conciliadoPor:  currentUserId,
                vehiclePlate:   inv.vehicle_plate || route.plate,
                conductorId:    inv.conductor_id,
                conductorName:  inv.conductor_name || route.driver_name || undefined,
                estadoEntrega:  form.estadoEntrega,
                valorFactura:   Number(inv.invoice_value) || undefined,
            });
            toast.success(`✅ ${inv.invoice_number} legalizada`);
            updateForm(inv.invoice_number, { saving: false, expanded: false });
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
            updateForm(inv.invoice_number, { saving: false });
        }
    };

    // ── Guardar grupal ────────────────────────────────────────────────────────
    const handleSaveGrupal = async () => {
        if (!grupalMatch || selectedInvoices.size === 0) return;

        // Cada factura seleccionada se guarda con su propio valor.
        // El comprobante agrupa el nro de aprobación de la primera (o todos unidos).
        const comprobantes = consignaciones
            .filter(c => c.nroAprobacion.trim())
            .map(c => c.nroAprobacion.trim())
            .join(' / ');
        const fechaRef = consignaciones[0]?.fecha || new Date().toISOString().slice(0, 10);

        setSavingGrupal(true);
        let savedCount = 0;
        let errorCount = 0;
        for (const inv of invoices.filter(i => selectedInvoices.has(i.invoice_number))) {
            try {
                await api.saveConciliation({
                    documentId,
                    invoiceNumber:  inv.invoice_number,
                    valor:          Number(inv.invoice_value) || 0,
                    comprobante:    comprobantes || undefined,
                    fechaPago:      fechaRef,
                    formaPago:      grupalMetodo,
                    esDevolucion:   false,
                    conciliadoPor:  currentUserId,
                    vehiclePlate:   inv.vehicle_plate || route.plate,
                    conductorId:    inv.conductor_id,
                    conductorName:  inv.conductor_name || route.driver_name || undefined,
                });
                savedCount++;
            } catch {
                errorCount++;
            }
        }
        setSavingGrupal(false);
        if (savedCount > 0) {
            toast.success(`✅ ${savedCount} facturas legalizadas`);
            onSaved();
            setSelectedInvoices(new Set());
            setConsignaciones([newConsignacionRow()]);
        }
        if (errorCount > 0) toast.error(`${errorCount} facturas no se pudieron guardar`);
    };

    // ── Helpers de consignaciones ─────────────────────────────────────────────
    const updateConsignacion = (id: string, patch: Partial<ConsignacionRow>) => {
        setConsignaciones(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    };
    const removeConsignacion = (id: string) => {
        setConsignaciones(prev => prev.filter(c => c.id !== id));
    };
    const toggleInvoice = (num: string) => {
        setSelectedInvoices(prev => {
            const next = new Set(prev);
            if (next.has(num)) next.delete(num); else next.add(num);
            return next;
        });
    };
    const selectAll = () => {
        setSelectedInvoices(new Set(invoices.filter(i => !i.forma_pago).map(i => i.invoice_number)));
    };
    const clearAll = () => setSelectedInvoices(new Set());

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[960] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-[90vw] rounded-3xl shadow-2xl shadow-slate-900/20 animate-in zoom-in-95 duration-250 flex flex-col max-h-[92vh] overflow-hidden border border-slate-100">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-b border-emerald-100 px-6 pt-5 pb-4 rounded-t-3xl flex-shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
                                <span className="text-xl">🚛</span>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-0.5">Conciliar Facturas</p>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">{route.plate || 'Sin placa'}</h3>
                                {route.driver_name && (
                                    <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">👤 {route.driver_name}</p>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose}
                            className="w-9 h-9 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-full flex items-center justify-center transition-all flex-shrink-0 mt-1 shadow-sm">
                            <Icons.X className="w-4 h-4 text-slate-500 hover:text-rose-500" />
                        </button>
                    </div>

                    {/* Progreso */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="col-span-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Avance de Legalización</span>
                                <span className="text-[9px] font-black text-emerald-600">{plateTotals.legalCount}/{plateTotals.total} · {pct}%</span>
                            </div>
                            <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                        <div className="bg-emerald-100 border border-emerald-200 rounded-2xl px-4 py-2.5 text-center">
                            <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Legalizado</p>
                            <p className="text-sm font-black text-emerald-800">{fmtCOP(plateTotals.legalizedVal)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-center">
                            <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-0.5">Pendiente</p>
                            <p className="text-sm font-black text-amber-800">{fmtCOP(plateTotals.pendingVal)}</p>
                        </div>
                        <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-2.5 text-center">
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Total Placa</p>
                            <p className="text-sm font-black text-slate-800">{fmtCOP(plateTotals.totalValue)}</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => setTab('individual')}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-2
                                ${tab === 'individual'
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-200'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'}`}>
                            📄 Individual
                        </button>
                        <button onClick={() => setTab('grupal')}
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-2
                                ${tab === 'grupal'
                                    ? 'bg-violet-500 border-violet-500 text-white shadow-md shadow-violet-200'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600'}`}>
                            🏦 Consignación Grupal
                        </button>
                    </div>
                </div>

                {/* ══ TAB INDIVIDUAL ══════════════════════════════════════════ */}
                {tab === 'individual' && (
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
                            const sobrecostoNum = Number(form.sobrecosto) || 0;
                            const { allowed: msAllowed, hint: msHint } = getMsConstraint(inv);

                            const itemBadge = ENTREGADO_STATUS.includes(inv.item_status || '')
                                ? { bg: 'bg-teal-100', text: 'text-teal-700', label: '✅ Entregada' }
                                : DEVUELTO_STATUS.includes(inv.item_status || '')
                                ? { bg: 'bg-rose-100', text: 'text-rose-700', label: '🔄 Devuelta' }
                                : PARCIAL_STATUS.includes(inv.item_status || '')
                                ? { bg: 'bg-amber-100', text: 'text-amber-700', label: '📦 Parcial' }
                                : null;

                            return (
                                <div key={inv.invoice_number}
                                    className={`bg-white rounded-2xl border-2 overflow-hidden transition-all
                                        ${isLegalized ? 'border-emerald-200' : isExpanded ? 'border-emerald-400 shadow-md shadow-emerald-100' : 'border-slate-100'}`}>

                                    {/* Fila compacta */}
                                    <div className="flex items-start gap-3 px-4 py-3.5">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5
                                            ${isLegalized ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                            <span className="text-sm">{isLegalized ? '✅' : '⏳'}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[11px] font-black text-slate-900">{inv.invoice_number}</span>
                                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${isLegalized ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {isLegalized ? 'Legalizada' : 'Pendiente'}
                                                </span>
                                                {itemBadge && (
                                                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${itemBadge.bg} ${itemBadge.text}`}>{itemBadge.label}</span>
                                                )}
                                            </div>
                                            {inv.customer_name && (
                                                <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                {invoiceVal > 0 && (
                                                    <span className="text-[9px] font-bold text-slate-600">Factura: {fmtCOP(invoiceVal)}</span>
                                                )}
                                                {isLegalized && inv.valor != null && (
                                                    <span className="text-[9px] font-black text-emerald-600">Recaudado: {fmtCOP(inv.valor)}</span>
                                                )}
                                            </div>
                                            {/* Badge MasterSuite */}
                                            {inv.mastersuite_estado && (() => {
                                                const ms = inv.mastersuite_estado.toLowerCase();
                                                const cfg = ms.includes('complet') ? { bg: 'bg-teal-100', text: 'text-teal-700' }
                                                    : ms.includes('devol') ? { bg: 'bg-rose-100', text: 'text-rose-700' }
                                                    : ms.includes('parcial') ? { bg: 'bg-amber-100', text: 'text-amber-700' }
                                                    : { bg: 'bg-slate-100', text: 'text-slate-600' };
                                                return (
                                                    <span className={`inline-flex items-center gap-1 text-[7px] font-black px-1.5 py-0.5 rounded-full mt-0.5 ${cfg.bg} ${cfg.text}`}>
                                                        🏢 MS: {inv.mastersuite_estado}
                                                        {inv.mastersuite_id_carga && ` · ${inv.mastersuite_id_carga}`}
                                                    </span>
                                                );
                                            })()}
                                            {inv.mastersuite_motivo_dev && (
                                                <p className="text-[7px] text-rose-500 mt-0.5">⚠️ {inv.mastersuite_motivo_dev}</p>
                                            )}
                                            {isLegalized && (
                                                <div className="flex flex-wrap gap-x-2 mt-1 text-[8px] text-slate-400">
                                                    {inv.forma_pago && <span className="font-bold text-slate-600">{inv.forma_pago}</span>}
                                                    {inv.comprobante && <span>📋 {inv.comprobante}</span>}
                                                    {inv.conciliado_por_nombre && <span>por {inv.conciliado_por_nombre}</span>}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => updateForm(inv.invoice_number, { expanded: !isExpanded })}
                                            className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all
                                                ${isExpanded ? 'bg-emerald-600 text-white' : isLegalized ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                            {isExpanded ? 'Cerrar' : isLegalized ? 'Editar' : 'Legalizar'}
                                        </button>
                                    </div>

                                    {/* Formulario expandido */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 bg-slate-50/60 px-4 pt-4 pb-5 space-y-4">

                                            {/* Estado de entrega */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                        Estado de Entrega <span className="text-rose-500">*</span>
                                                    </p>
                                                    {msHint && (
                                                        <span className="text-[7px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                                                            🏢 {msHint}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <EstadoPill value="entregado"  active={form.estadoEntrega} label="Entregado"  icon="✅" disabled={!msAllowed.has('entregado')}  onClick={() => updateForm(inv.invoice_number, { estadoEntrega: 'entregado',  valor: String(invoiceVal + sobrecostoNum || '') })} />
                                                    <EstadoPill value="parcial"    active={form.estadoEntrega} label="Parcial"    icon="📦" disabled={!msAllowed.has('parcial')}    onClick={() => updateForm(inv.invoice_number, { estadoEntrega: 'parcial'    })} />
                                                    <EstadoPill value="devolucion" active={form.estadoEntrega} label="Devolución" icon="🔄" disabled={!msAllowed.has('devolucion')} onClick={() => updateForm(inv.invoice_number, { estadoEntrega: 'devolucion', valor: '0' })} />
                                                </div>
                                            </div>

                                            {form.estadoEntrega !== 'devolucion' && (
                                                <>
                                                    {/* Valor factura + sobrecosto + total */}
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Valor Factura</label>
                                                            <div className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-600">
                                                                {invoiceVal > 0 ? fmtCOP(invoiceVal) : '—'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Sobrecosto</label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">$</span>
                                                                <input type="number" min={0} value={form.sobrecosto}
                                                                    onChange={e => {
                                                                        const sc = e.target.value;
                                                                        updateForm(inv.invoice_number, { sobrecosto: sc, valor: String(invoiceVal + (Number(sc) || 0)) });
                                                                    }}
                                                                    placeholder="0"
                                                                    className="w-full pl-6 pr-2 py-2.5 bg-white border border-slate-200 focus:border-amber-500 rounded-xl text-xs font-bold text-slate-900 outline-none transition-all" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                                Total a Pagar <span className="text-rose-500">*</span>
                                                            </label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">$</span>
                                                                <input type="number" min={0} value={form.valor}
                                                                    onChange={e => updateForm(inv.invoice_number, { valor: e.target.value })}
                                                                    placeholder="0"
                                                                    className="w-full pl-6 pr-2 py-2.5 bg-white border border-emerald-300 focus:border-emerald-500 rounded-xl text-xs font-black text-emerald-900 outline-none transition-all" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Indicador de validación */}
                                                    {(() => {
                                                        const valN  = Number(form.valor) || 0;
                                                        const scN   = Number(form.sobrecosto) || 0;
                                                        const total = invoiceVal + scN;
                                                        if (total <= 0 || valN <= 0) return null;
                                                        const diff  = valN - total;
                                                        const absDiff = Math.abs(diff);

                                                        if (form.estadoEntrega === 'entregado') {
                                                            const ok = absDiff <= 1500;
                                                            return (
                                                                <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-[9px] font-black border
                                                                    ${ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                                                                    <span>{ok ? '✓ Valor completo' : `⚠ Faltan ${fmtCOP(absDiff)}`}</span>
                                                                    <span>{fmtCOP(valN)} / {fmtCOP(total)}</span>
                                                                </div>
                                                            );
                                                        }
                                                        if (form.estadoEntrega === 'parcial') {
                                                            const ok = valN > 0 && valN < total;
                                                            const devuelto = total - valN;
                                                            return (
                                                                <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-[9px] font-black border
                                                                    ${ok ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                                                                    <span>{ok ? `📦 Entrega: ${fmtCOP(valN)} · Devuelve: ${fmtCOP(devuelto)}` : '⚠ Debe ser menor al total'}</span>
                                                                    <span>{fmtCOP(total)}</span>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    {/* Método */}
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
                                                                    <button key={m} onClick={() => updateForm(inv.invoice_number, { metodo: m })}
                                                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-wide transition-all ${active ? cfg.activeClass : cfg.inactiveClass}`}>
                                                                        <span>{cfg.icon}</span>{cfg.label}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* N° Consignación + Fecha */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">N° Consignación / Ref.</label>
                                                            <input type="text" value={form.numConsignacion}
                                                                onChange={e => updateForm(inv.invoice_number, { numConsignacion: e.target.value })}
                                                                placeholder="Ej: 0012345678"
                                                                className="w-full px-3 py-2.5 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha de Pago</label>
                                                            <input type="date" value={form.fecha}
                                                                onChange={e => updateForm(inv.invoice_number, { fecha: e.target.value })}
                                                                className="w-full px-3 py-2.5 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all" />
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {form.estadoEntrega === 'devolucion' && (
                                                <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 text-center">
                                                    <p className="text-xs font-black text-rose-600 uppercase tracking-wide">🔄 Factura marcada como devolución</p>
                                                    <p className="text-[9px] text-rose-400 mt-0.5">No se registrará valor de recaudo</p>
                                                </div>
                                            )}

                                            <div className="flex gap-2 pt-1">
                                                <button onClick={() => updateForm(inv.invoice_number, { expanded: false })}
                                                    className="px-4 py-2.5 rounded-xl text-slate-500 font-black text-[9px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all">
                                                    Cancelar
                                                </button>
                                                <button onClick={() => handleSave(inv)}
                                                    disabled={form.saving || (() => {
                                                        if (form.estadoEntrega === 'devolucion') return false;
                                                        const valN  = Number(form.valor) || 0;
                                                        const scN   = Number(form.sobrecosto) || 0;
                                                        const total = (Number(inv.invoice_value) || 0) + scN;
                                                        if (valN <= 0) return true;
                                                        if (form.estadoEntrega === 'entregado' && total > 0 && Math.abs(valN - total) > 1500) return true;
                                                        if (form.estadoEntrega === 'parcial'   && total > 0 && valN >= total) return true;
                                                        return false;
                                                    })()}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all
                                                        ${form.saving || (() => {
                                                            if (form.estadoEntrega === 'devolucion') return false;
                                                            const valN  = Number(form.valor) || 0;
                                                            const scN   = Number(form.sobrecosto) || 0;
                                                            const total = (Number(inv.invoice_value) || 0) + scN;
                                                            if (valN <= 0) return true;
                                                            if (form.estadoEntrega === 'entregado' && total > 0 && Math.abs(valN - total) > 1500) return true;
                                                            if (form.estadoEntrega === 'parcial'   && total > 0 && valN >= total) return true;
                                                            return false;
                                                        })()
                                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20'}`}>
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
                )}

                {/* ══ TAB GRUPAL ══════════════════════════════════════════════ */}
                {tab === 'grupal' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">

                        {/* Tabla de consignaciones */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Consignaciones</p>
                                <button onClick={() => setConsignaciones(prev => [...prev, newConsignacionRow()])}
                                    className="flex items-center gap-1 text-[8px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest">
                                    <Icons.Plus className="w-3 h-3" /> Agregar fila
                                </button>
                            </div>

                            {/* Encabezado tabla */}
                            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 bg-slate-100 rounded-xl mb-2">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Consignación</span>
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Nro Aprobación</span>
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Fecha Consig.</span>
                                <span className="w-6" />
                            </div>

                            <div className="space-y-2">
                                {consignaciones.map(c => (
                                    <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">$</span>
                                            <input type="number" min={0} value={c.valor}
                                                onChange={e => updateConsignacion(c.id, { valor: e.target.value })}
                                                placeholder="0"
                                                className="w-full pl-6 pr-2 py-2 bg-white border border-slate-200 focus:border-emerald-500 rounded-xl text-xs font-black text-slate-900 outline-none transition-all" />
                                        </div>
                                        <input type="text" value={c.nroAprobacion}
                                            onChange={e => updateConsignacion(c.id, { nroAprobacion: e.target.value })}
                                            placeholder="582636"
                                            className="w-full px-2.5 py-2 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all" />
                                        <input type="date" value={c.fecha}
                                            onChange={e => updateConsignacion(c.id, { fecha: e.target.value })}
                                            className="w-full px-2 py-2 bg-white border border-slate-200 focus:border-slate-400 rounded-xl text-xs text-slate-900 outline-none transition-all" />
                                        <button onClick={() => consignaciones.length > 1 ? removeConsignacion(c.id) : undefined}
                                            disabled={consignaciones.length === 1}
                                            className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-20">
                                            <Icons.X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Total consignado */}
                            <div className="mt-3 flex justify-between items-center px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Consignado</span>
                                <span className="text-sm font-black text-slate-900">{fmtCOP(totalConsignado)}</span>
                            </div>
                        </div>

                        {/* Método */}
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Método</p>
                            <div className="grid grid-cols-2 gap-2">
                                {(['TRANSFERENCIA', 'CONSIGNACION'] as MetodoPago[]).map(m => {
                                    const active = grupalMetodo === m;
                                    const cfg = m === 'TRANSFERENCIA'
                                        ? { icon: '📱', label: 'Transferencia', activeClass: 'bg-blue-500 border-blue-500 text-white', inactiveClass: 'border-slate-200 text-slate-600 hover:border-blue-400' }
                                        : { icon: '🏦', label: 'Consignación',  activeClass: 'bg-violet-600 border-violet-600 text-white', inactiveClass: 'border-slate-200 text-slate-600 hover:border-violet-400' };
                                    return (
                                        <button key={m} onClick={() => setGrupalMetodo(m)}
                                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-wide transition-all ${active ? cfg.activeClass : cfg.inactiveClass}`}>
                                            <span>{cfg.icon}</span>{cfg.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Selector de facturas */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    Facturas a cubrir ({selectedInvoices.size} seleccionadas)
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={selectAll} className="text-[8px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest">Todas</button>
                                    <span className="text-slate-300 text-[8px]">|</span>
                                    <button onClick={clearAll} className="text-[8px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest">Ninguna</button>
                                </div>
                            </div>

                            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                {invoices.map(inv => {
                                    const isChecked  = selectedInvoices.has(inv.invoice_number);
                                    const isLegalized = !!inv.forma_pago;
                                    const invVal     = Number(inv.invoice_value) || 0;
                                    return (
                                        <label key={inv.invoice_number}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all
                                                ${isLegalized ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-100' :
                                                  isChecked ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                            <input type="checkbox" checked={isChecked}
                                                disabled={isLegalized}
                                                onChange={() => !isLegalized && toggleInvoice(inv.invoice_number)}
                                                className="w-3.5 h-3.5 accent-emerald-500 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-slate-900">{inv.invoice_number}</span>
                                                    {isLegalized && <span className="text-[7px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-black">Ya legalizada</span>}
                                                </div>
                                                {inv.customer_name && (
                                                    <p className="text-[8px] text-slate-500 truncate">{inv.customer_name}</p>
                                                )}
                                            </div>
                                            <span className="text-[9px] font-black text-slate-700 shrink-0">{fmtCOP(invVal)}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Totales comparativos */}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Facturas Sel.</p>
                                    <p className="text-sm font-black text-slate-900">{fmtCOP(totalSeleccionado)}</p>
                                </div>
                                <div className={`rounded-xl px-3 py-2 border transition-all
                                    ${grupalMatch ? 'bg-emerald-50 border-emerald-300' : totalConsignado > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <p className="text-[8px] font-black uppercase tracking-widest mb-0.5 text-inherit opacity-70">Total Consignado</p>
                                    <p className={`text-sm font-black ${grupalMatch ? 'text-emerald-700' : totalConsignado > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                        {fmtCOP(totalConsignado)} {grupalMatch ? '✓' : totalConsignado > 0 ? '≠' : ''}
                                    </p>
                                </div>
                            </div>
                            {!grupalMatch && totalConsignado > 0 && totalSeleccionado > 0 && (
                                <p className="text-[9px] text-rose-500 font-bold mt-1.5 text-center">
                                    Diferencia: {fmtCOP(Math.abs(totalConsignado - totalSeleccionado))}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Footer ──────────────────────────────────────────────── */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0 bg-slate-50 rounded-b-3xl">
                    {tab === 'individual' ? (
                        <>
                            <p className="text-[9px] font-bold text-slate-400">{plateTotals.legalCount} de {plateTotals.total} facturas legalizadas</p>
                            <button onClick={onClose}
                                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white font-black text-[9px] uppercase tracking-widest transition-all">
                                Cerrar
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onClose}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:bg-slate-50 transition-all">
                                Cancelar
                            </button>
                            <button onClick={handleSaveGrupal}
                                disabled={!grupalMatch || selectedInvoices.size === 0 || savingGrupal}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all
                                    ${grupalMatch && selectedInvoices.size > 0 && !savingGrupal
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                                {savingGrupal && <Icons.Loader className="w-3 h-3 animate-spin" />}
                                {savingGrupal ? 'Guardando...' : `✅ Legalizar ${selectedInvoices.size > 0 ? `(${selectedInvoices.size})` : ''} Facturas`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConciliacionRouteModal;
