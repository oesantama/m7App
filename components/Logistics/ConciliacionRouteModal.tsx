import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { useAppData } from '../../hooks/useAppData';

import { toast } from 'sonner';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoEntrega = 'entregado' | 'devolucion' | 'parcial' | 'repice';
type MetodoPago   = 'TRANSFERENCIA' | 'CONSIGNACION';
type ModalTab     = 'individual' | 'grupal' | 'sobrecosto';

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
    items?: InvoiceItem[];
    bodega_received_at?: string;
    sobrecosto?: number;
}

interface InvoiceItem {
    id: string | number;
    article_id: string;
    article_name: string;
    qty: number;
    unit: string;
    returned_qty?: number;
    returned_value?: number;
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
    valor: string;
    numConsignacion: string;
    metodo: MetodoPago;
    fecha: string;
    saving: boolean;
    items: InvoiceItem[];
    statusUnlocked: boolean;
    targetRouteId?: string; // Para reasignación en REPICE
}

// Fila de consignación grupal
interface ConsignacionRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
    observacion?: string;
    metodo?: MetodoPago;
    plate?: string;
}

interface SobrecostoRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
    statusId: string;
    plate?: string;
    observaciones?: string;
    facturas?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    route: RouteGroup;
    invoices: InvoiceRow[];
    documentId: string;
    currentUserId: string;
    onSaved: () => void;
    initialSurcharges?: SobrecostoRow[];
    initialGroupPayments?: ConsignacionRow[];
    allRoutes?: RouteGroup[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCOP = (v: number | undefined | null) =>
    v != null 
        ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
        : '—';

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
};

const ENTREGADO_STATUS = ['EST-12', 'ENTREGADO', 'COMPLETED', 'FINALIZADO'];
// EST-16/EST-17 = devolución completa/parcial registrada por BODEGA (registerRouteReturn),
// distinta de EST-13/EST-14 que registra facturación en este mismo modal. Ambos vocabularios
// deben reconocerse aquí o el modal y el botón "Reversar Cambio" quedan ciegos a lo que bodega ya registró.
const DEVUELTO_STATUS  = ['EST-13', 'EST-16', 'DEVUELTO', 'DEVUELT'];
const PARCIAL_STATUS   = ['EST-14', 'EST-17', 'ENTREGA PARCIAL', 'PARCIAL'];

// Determina qué opciones están disponibles según MasterSuite
function getMsConstraint(inv: InvoiceRow): { allowed: Set<EstadoEntrega>; hint: string | null } {
    const ms = (inv.mastersuite_estado || '').toLowerCase().trim();
    if (!ms) return { allowed: new Set<EstadoEntrega>(['entregado', 'parcial', 'devolucion', 'repice']), hint: null };
    if (ms.includes('complet') || ms === 'entregado')
        return { allowed: new Set<EstadoEntrega>(['entregado']), hint: `MasterSuite: ${inv.mastersuite_estado}` };
    if (ms.includes('no entregad') || ms.includes('devol'))
        return { allowed: new Set<EstadoEntrega>(['parcial', 'devolucion', 'repice']), hint: `MasterSuite: ${inv.mastersuite_estado}` };
    if (ms.includes('parcial'))
        return { allowed: new Set<EstadoEntrega>(['parcial', 'devolucion', 'repice']), hint: `MasterSuite: ${inv.mastersuite_estado}` };
    return { allowed: new Set<EstadoEntrega>(['entregado', 'parcial', 'devolucion', 'repice']), hint: null };
}

const REPICE_STATUS    = ['EST-15', 'REPICE'];

function inferEstado(inv: InvoiceRow): EstadoEntrega {
    const ms = (inv.mastersuite_estado || '').toLowerCase().trim();
    if (ms.includes('complet') || ms === 'entregado') return 'entregado';
    if (ms.includes('devol'))  return 'devolucion';
    if (ms.includes('parcial')) return 'parcial';
    if (inv.es_devolucion) return 'devolucion';
    const s = (inv.item_status || '').toUpperCase();
    if (DEVUELTO_STATUS.includes(s)) return 'devolucion';
    if (PARCIAL_STATUS.includes(s))  return 'parcial';
    if (REPICE_STATUS.includes(s))   return 'repice';
    return 'entregado';
}

function initForm(inv: InvoiceRow): InvoiceFormState {
    const estadoEntrega = inferEstado(inv);
    const isLegalized   = !!inv.forma_pago;
    return {
        estadoEntrega,
        valor:            isLegalized ? String(inv.valor ?? '')
                          : estadoEntrega === 'devolucion' ? '0'
                          : estadoEntrega === 'parcial'    ? '0'
                          : String(inv.invoice_value ?? ''),
        numConsignacion:  inv.comprobante || '',
        metodo:           (inv.forma_pago as MetodoPago) || 'TRANSFERENCIA',
        fecha:            inv.fecha_pago
                            ? inv.fecha_pago.slice(0, 10)
                            : getYesterday(),
        saving:           false,
        statusUnlocked:   false,
        items:            (inv.items || []).map(it => ({ ...it, returned_qty: it.returned_qty || 0 })),
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
        repice:     isActive ? 'bg-blue-500    border-blue-500    text-white' : 'border-slate-200 text-slate-500 hover:border-blue-400    hover:text-blue-600',
    };
    return (
        <button onClick={onClick}
            className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl border-2 text-[9px] font-black uppercase tracking-wide transition-all ${colors[value]}`}>
            <span className="text-lg">{icon}</span>
            {label}
        </button>
    );
};

// ── Componente de Diálogo de Legalización ─────────────────────────────────────

const ItemRow: React.FC<{
    it: InvoiceItem;
    unitPrice: number;
    invoiceVal: number;
    canEdit: boolean;
    form: InvoiceFormState;
    onUpdateItem: (itemId: string | number, rq: number, rv?: number) => void;
    onUpdate: (patch: Partial<InvoiceFormState>) => void;
}> = ({ it, unitPrice, invoiceVal, canEdit, form, onUpdateItem, onUpdate }) => {
    const devVal = (Number(it.returned_qty) || 0) * unitPrice;
    const [localQty, setLocalQty] = useState(String(it.returned_qty || 0));
    const [localVal, setLocalVal] = useState(String(Math.round(it.returned_value ?? devVal)));

    // Sincronizar si cambia desde afuera (ej: al resetear el formulario)
    useEffect(() => {
        const currentVal = it.returned_value !== undefined ? it.returned_value : devVal;
        setLocalQty(String(it.returned_qty || 0));
        setLocalVal(String(Math.round(currentVal)));
    }, [it.returned_qty, it.returned_value, devVal]);

    const handleQtyChange = (val: string) => {
        setLocalQty(val);
        const n = Math.min(it.qty, Math.max(0, Number(val) || 0));
        const newVal = n * unitPrice;
        setLocalVal(String(Math.round(newVal)));
        onUpdateItem(it.id, n, newVal);
    };

    const handleValChange = (val: string) => {
        setLocalVal(val);
        const n = Number(val) || 0;
        onUpdateItem(it.id, Number(it.returned_qty) || 0, n);
    };

    return (
        <tr className="bg-white">
            <td className="px-4 py-2.5 font-bold text-slate-700">{it.article_name}</td>
            <td className="px-3 py-2.5 text-center font-black text-slate-400">{it.qty}</td>
            {form.estadoEntrega === 'parcial' && (
                <td className="px-3 py-2.5 bg-amber-50/30 text-center">
                    {!canEdit ? (
                        <span className="font-black text-amber-700 text-sm">{it.returned_qty}</span>
                    ) : (
                        <input type="number" min={0} max={it.qty} value={localQty}
                            onChange={e => handleQtyChange(e.target.value)}
                            className="w-16 text-center bg-white border border-amber-200 rounded-lg py-1.5 font-black text-amber-800 outline-none" />
                    )}
                </td>
            )}
            <td className="px-4 py-2.5 text-right font-black text-slate-500">
                {form.estadoEntrega === 'parcial' ? (
                    <div className="flex flex-col items-end gap-1">
                        {!canEdit ? (
                        <span className="font-black text-rose-500">{fmtCOP(it.returned_value !== undefined ? it.returned_value : devVal)}</span>
                    ) : (
                        <div className="relative group/val">
                            <span className="absolute -left-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-300">$</span>
                            <input type="number" 
                                value={localVal}
                                onChange={e => handleValChange(e.target.value)}
                                className="w-24 text-right bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 font-black text-rose-600 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-50 transition-all" />
                        </div>
                    )}
                    {it.returned_value !== undefined && (
                        <span className="text-[7px] font-black text-amber-500 uppercase animate-pulse">✨ Manual</span>
                    )}
                </div>
            ) : (
                <span className="text-emerald-600">Completo</span>
            )}
        </td>
        </tr>
    );
};

interface BodegaReturn {
    id: number;
    return_reason: string | null;
    status: string;
    created_at: string;
    vehicle_plate: string | null;
    driver_name: string | null;
    vendedor: string | null;
    conciliacion_confirmada_at: string | null;
    conciliacion_confirmada_by: string | null;
    items: { sku: string | null; article_name: string | null; quantity_returned: number; unit: string | null }[];
}

const LegalizationDialog: React.FC<{
    inv: InvoiceRow;
    form: InvoiceFormState;
    onClose: () => void;
    onUpdate: (patch: Partial<InvoiceFormState>) => void;
    onUpdateItem: (itemId: string | number, rq: number, rv?: number) => void;
    onSave: () => void;
    allRoutes?: RouteGroup[];
    onCheckReference?: (ref: string) => void;
    currentUserId: string;
    onConfirmReturnAndSave: (returnId: number, returnType: 'COMPLETA' | 'PARCIAL', consignar: number, comprobante: string, metodo: string, fecha: string) => Promise<void>;
}> = ({ inv, form, onClose, onUpdate, onUpdateItem, onSave, allRoutes, onCheckReference, currentUserId, onConfirmReturnAndSave }) => {
    const isLegalized   = !!inv.forma_pago;
    const isRepice      = (inv.item_status || '').toUpperCase() === 'EST-15' || (inv.item_status || '').toUpperCase() === 'REPICE';
    const invoiceVal    = Number(inv.invoice_value) || 0;
    const isWarehouseReceived = !!inv.bodega_received_at;

    // Devoluciones de bodega para esta factura
    const [bodegaReturns, setBodegaReturns]   = useState<BodegaReturn[]>([]);
    const [loadingReturns, setLoadingReturns] = useState(true);
    const [confirmingReturn, setConfirmingReturn] = useState(false);
    const [returnConsignar,   setReturnConsignar]   = useState<string>('0');
    const [returnComprobante, setReturnComprobante] = useState<string>('');
    const [returnMetodo,      setReturnMetodo]      = useState<MetodoPago>('TRANSFERENCIA');
    const [returnFecha,       setReturnFecha]       = useState<string>(getYesterday());

    useEffect(() => {
        let cancelled = false;
        setLoadingReturns(true);
        api.getReturnsForInvoice(inv.invoice_number)
            .then((res: any) => {
                if (!cancelled) {
                    const data: BodegaReturn[] = res?.data ?? [];
                    setBodegaReturns(data);
                    setReturnConsignar('0');
                    setReturnComprobante('');
                    setReturnMetodo('TRANSFERENCIA');
                    setReturnFecha(getYesterday());
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoadingReturns(false); });
        return () => { cancelled = true; };
    }, [inv.invoice_number]);

    const pendingReturns   = bodegaReturns.filter(r => r.status === 'PENDING' || r.status === 'PROCESSED');
    const confirmedReturns = bodegaReturns.filter(r => r.status === 'CONFIRMED');
    // Bloquear el formulario normal cuando hay una devolución bodega pendiente de confirmar
    const hasPendingBodegaReturn = !loadingReturns && pendingReturns.length > 0 && !isLegalized;

    const handleConfirmReturn = async (ret: BodegaReturn) => {
        const totalQtyItems = ret.items.reduce((s, i) => s + (Number(i.quantity_returned) || 0), 0);
        const returnType = (totalQtyItems > 0 && inv.items && inv.items.length > 0
            && totalQtyItems < inv.items.reduce((s, i) => s + (Number(i.qty) || 0), 0))
            ? 'PARCIAL' : 'COMPLETA';
        const consignarVal = returnType === 'COMPLETA' ? 0 : (Number(returnConsignar) || 0);
        setConfirmingReturn(true);
        try {
            await onConfirmReturnAndSave(ret.id, returnType, consignarVal, returnComprobante, returnMetodo, returnFecha);
        } finally {
            setConfirmingReturn(false);
        }
    };
    
    // El REPICE es editable aunque esté legalizado, hasta que se reciba en bodega
    const canEdit       = !isWarehouseReceived && (!isLegalized || isRepice);

    const { allowed: msAllowed, hint: msHint } = getMsConstraint(inv);
    
    // Si está desbloqueado, todas las opciones están permitidas
    const currentAllowed = form.statusUnlocked ? new Set<EstadoEntrega>(['entregado', 'parcial', 'devolucion', 'repice']) : msAllowed;

    const totalQtyItems = form.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const unitPrice     = totalQtyItems > 0 ? (invoiceVal / totalQtyItems) : 0;
    
    // M7 FIX: Usar lógica explícita para priorizar manual sobre prorrateo (incluyendo el 0)
    const returnedVal   = form.items.reduce((s, it) => {
        const val = (it.returned_value !== undefined) 
            ? Number(it.returned_value) 
            : (Number(it.returned_qty || 0) * unitPrice);
        return s + val;
    }, 0);

    const expectedVal   = form.estadoEntrega === 'parcial' ? (invoiceVal - returnedVal) : (form.estadoEntrega === 'repice' || form.estadoEntrega === 'devolucion' ? 0 : invoiceVal);
    const diff          = expectedVal - (Number(form.valor) || 0);

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 border border-slate-100">
                
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-emerald-50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                            <Icons.FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Legalizar Factura</p>
                            <h3 className="text-lg font-black text-slate-900 leading-none">{inv.invoice_number}</h3>
                            <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tighter truncate max-w-[300px]">👤 {inv.customer_name || 'Sin cliente'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-sm transition-all">
                        <Icons.X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

                    {/* ── Verificando devoluciones ── */}
                    {loadingReturns && (
                        <div className="flex items-center gap-2 text-[9px] text-slate-400">
                            <Icons.Loader className="w-3 h-3 animate-spin" />
                            Verificando devoluciones en bodega…
                        </div>
                    )}

                    {/* ── MODO CONFIRMACIÓN DE DEVOLUCIÓN BODEGA ─────────── */}
                    {/* Cuando hay devolución pendiente: solo mostrar este bloque, nada más */}
                    {hasPendingBodegaReturn && pendingReturns.map(ret => {
                        const totalDevuelto = ret.items.reduce((s, i) => s + (Number(i.quantity_returned) || 0), 0);
                        const totalEsperado = (inv.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                        const esCompleta    = totalEsperado === 0 || totalDevuelto >= totalEsperado;
                        return (
                            <div key={ret.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50/40 overflow-hidden">
                                {/* Cabecera */}
                                <div className="px-4 py-3 bg-amber-400/20 border-b border-amber-200 flex items-center gap-2">
                                    <span className="text-base">⚠️</span>
                                    <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest">
                                        Devolución registrada en bodega — confirmar para legalizar
                                    </p>
                                </div>

                                <div className="p-4 space-y-4">
                                    {/* Tipo + fecha */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase border
                                            ${esCompleta ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                            {esCompleta ? '🔄 Devolución Completa' : '📦 Devolución Parcial'}
                                        </span>
                                        <span className="text-[8px] text-slate-500">
                                            {new Date(ret.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>

                                    {/* Motivo + datos */}
                                    <div className="bg-white rounded-xl border border-amber-100 px-3 py-2.5 space-y-1.5">
                                        {ret.return_reason && (
                                            <div className="flex gap-2">
                                                <span className="text-[8px] font-black text-slate-400 uppercase w-16 shrink-0">Motivo</span>
                                                <span className="text-[9px] font-semibold text-slate-800">{ret.return_reason}</span>
                                            </div>
                                        )}
                                        {ret.vehicle_plate && (
                                            <div className="flex gap-2">
                                                <span className="text-[8px] font-black text-slate-400 uppercase w-16 shrink-0">Placa</span>
                                                <span className="text-[9px] font-black text-slate-900">{ret.vehicle_plate}</span>
                                            </div>
                                        )}
                                        {ret.driver_name && (
                                            <div className="flex gap-2">
                                                <span className="text-[8px] font-black text-slate-400 uppercase w-16 shrink-0">Conductor</span>
                                                <span className="text-[9px] text-slate-700 truncate">{ret.driver_name}</span>
                                            </div>
                                        )}
                                        {ret.vendedor && (
                                            <div className="flex gap-2">
                                                <span className="text-[8px] font-black text-slate-400 uppercase w-16 shrink-0">Vendedor</span>
                                                <span className="text-[9px] font-black text-slate-900">{ret.vendedor}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Artículos devueltos */}
                                    {ret.items.length > 0 && (
                                        <div className="rounded-xl overflow-hidden border border-amber-200 bg-white">
                                            <table className="w-full text-[8px]">
                                                <thead>
                                                    <tr className="bg-amber-50 border-b border-amber-100">
                                                        <th className="px-3 py-1.5 text-left font-black text-amber-700 uppercase tracking-widest">Artículo</th>
                                                        <th className="px-3 py-1.5 text-right font-black text-amber-700 uppercase tracking-widest">Cant. devuelta</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-amber-50">
                                                    {ret.items.map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td className="px-3 py-1.5 text-slate-700 font-medium truncate max-w-[200px]">
                                                                {item.article_name || item.sku || '—'}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right font-black text-slate-900">
                                                                {item.quantity_returned}
                                                                <span className="font-normal text-slate-400 ml-0.5">{item.unit || ''}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Valores + Datos de Recaudo */}
                                    <div className="bg-white rounded-xl border border-amber-200 px-4 py-3 space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-[7px] font-black text-slate-400 uppercase mb-1">Valor factura</p>
                                                <p className="text-lg font-black text-slate-900">
                                                    ${(Number(inv.invoice_value) || 0).toLocaleString('es-CO')}
                                                </p>
                                            </div>
                                            {esCompleta ? (
                                                <div>
                                                    <p className="text-[7px] font-black text-slate-400 uppercase mb-1">Total a consignar</p>
                                                    <p className="text-lg font-black text-rose-600">$0</p>
                                                    <p className="text-[7px] text-rose-500 mt-0.5">Devolución total — sin cobro</p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <label className="text-[7px] font-black text-amber-600 uppercase mb-1 block">
                                                        Total a consignar <span className="text-[6px] font-normal text-slate-400">(puede ser $0)</span>
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                                                        <input
                                                            type="number" min={0}
                                                            value={returnConsignar}
                                                            onChange={e => setReturnConsignar(e.target.value)}
                                                            className="w-full pl-6 pr-2 py-2 border-2 border-amber-300 focus:border-amber-500 rounded-xl text-sm font-black outline-none bg-amber-50"
                                                        />
                                                    </div>
                                                    {Number(returnConsignar) >= 0 && (
                                                        <p className="text-[7px] text-amber-700 font-bold mt-0.5">
                                                            Valor devuelto: ${((Number(inv.invoice_value) || 0) - (Number(returnConsignar) || 0)).toLocaleString('es-CO')}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Datos de recaudo — solo para devolución parcial */}
                                        {!esCompleta && (
                                            <>
                                                <div className="border-t border-amber-100 pt-2">
                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Datos de Recaudo</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[7px] font-black text-slate-400 uppercase">Método de Pago</label>
                                                            <div className="grid grid-cols-2 gap-0.5 p-0.5 bg-amber-50 border border-amber-200 rounded-xl">
                                                                <button type="button" onClick={() => setReturnMetodo('TRANSFERENCIA')}
                                                                    className={`py-1.5 rounded-lg text-[7px] font-black uppercase transition-all ${returnMetodo === 'TRANSFERENCIA' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:bg-amber-100'}`}>
                                                                    📱 Transfer</button>
                                                                <button type="button" onClick={() => setReturnMetodo('CONSIGNACION')}
                                                                    className={`py-1.5 rounded-lg text-[7px] font-black uppercase transition-all ${returnMetodo === 'CONSIGNACION' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:bg-amber-100'}`}>
                                                                    🏦 Consig</button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[7px] font-black text-slate-400 uppercase">Fecha</label>
                                                            <input type="date" value={returnFecha}
                                                                onChange={e => setReturnFecha(e.target.value)}
                                                                className="w-full px-2 py-1.5 border border-amber-200 focus:border-amber-500 rounded-xl text-[9px] font-black outline-none bg-amber-50" />
                                                        </div>
                                                    </div>
                                                    <div className="mt-2">
                                                        <label className="text-[7px] font-black text-slate-400 uppercase">No. Comprobante / Ref.</label>
                                                        <input type="text" value={returnComprobante}
                                                            onChange={e => setReturnComprobante(e.target.value)}
                                                            placeholder="Referencia del pago (opcional si total = $0)"
                                                            className="w-full mt-1 px-3 py-1.5 border border-amber-200 focus:border-amber-500 rounded-xl text-[9px] font-black outline-none bg-amber-50 placeholder:text-slate-300" />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Botón confirmar */}
                                    <button
                                        onClick={() => handleConfirmReturn(ret)}
                                        disabled={confirmingReturn || form.saving}
                                        className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all shadow-md">
                                        {confirmingReturn
                                            ? <><Icons.Loader className="w-4 h-4 animate-spin" /> Procesando…</>
                                            : <>✓ Confirmar devolución {esCompleta ? 'completa' : 'parcial'} y legalizar</>
                                        }
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Devolución ya confirmada (banner informativo) */}
                    {!loadingReturns && confirmedReturns.length > 0 && pendingReturns.length === 0 && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5">
                            <span className="text-sm">✅</span>
                            <div>
                                <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Devolución confirmada por facturación</p>
                                {confirmedReturns[0].conciliacion_confirmada_by && (
                                    <p className="text-[8px] text-emerald-600 mt-0.5">
                                        {confirmedReturns[0].conciliacion_confirmada_by} · {new Date(confirmedReturns[0].conciliacion_confirmada_at!).toLocaleDateString('es-CO')}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── FORMULARIO NORMAL (oculto mientras haya devolución bodega pendiente) ── */}
                    {!hasPendingBodegaReturn && (<>

                    {/* Estado de Entrega */}
                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado de Entrega <span className="text-rose-500">*</span></p>
                            <div className="flex items-center gap-2">
                                {msHint && !form.statusUnlocked && (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">🏢 {msHint}</span>
                                )}
                                {!isLegalized && (
                                    <button onClick={() => onUpdate({ statusUnlocked: !form.statusUnlocked })}
                                        className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-all
                                            ${form.statusUnlocked ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}>
                                        {form.statusUnlocked ? '🔒 Bloquear MS' : '🔓 Habilitar Edición'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            <EstadoPill value="entregado"  active={form.estadoEntrega} label="Entregado"  icon="✅" disabled={!canEdit || !currentAllowed.has('entregado')}  onClick={() => onUpdate({ estadoEntrega: 'entregado',  valor: String(Math.round(invoiceVal)), fecha: getYesterday() })} />
                            <EstadoPill value="parcial"    active={form.estadoEntrega} label="Parcial"    icon="📦" disabled={!canEdit || !currentAllowed.has('parcial')}    onClick={() => onUpdate({ estadoEntrega: 'parcial', fecha: getYesterday() })} />
                            <EstadoPill value="repice"     active={form.estadoEntrega} label="REPICE"     icon="📋" disabled={!canEdit || !currentAllowed.has('repice')}     onClick={() => onUpdate({ estadoEntrega: 'repice',    valor: '0', fecha: getYesterday() })} />
                            <EstadoPill value="devolucion" active={form.estadoEntrega} label="Devolución" icon="🔄" disabled={!canEdit || !currentAllowed.has('devolucion')} onClick={() => onUpdate({ estadoEntrega: 'devolucion', valor: '0', fecha: getYesterday() })} />
                        </div>
                    </div>

                    {/* Detalle de items para Parcial o REPICE */}
                    {(form.estadoEntrega === 'parcial' || form.estadoEntrega === 'repice') && (
                        <div className="space-y-4">
                            {form.estadoEntrega === 'repice' && (
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-2">Información de Repice</p>
                                    <div className="flex gap-2">
                                        <button
                                            disabled={!canEdit}
                                            onClick={() => onUpdate({ numConsignacion: 'MISMO_CONDUCTOR', targetRouteId: undefined })}
                                            className={`flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase transition-all border-2
                                                ${form.numConsignacion === 'MISMO_CONDUCTOR' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-blue-200 text-blue-500 hover:bg-blue-50'}`}>
                                            🔄 Mismo Conductor
                                        </button>
                                        <button
                                            disabled={!canEdit}
                                            onClick={() => onUpdate({ numConsignacion: 'OTRO_CONDUCTOR', targetRouteId: undefined })}
                                            className={`flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase transition-all border-2
                                                ${form.numConsignacion === 'OTRO_CONDUCTOR' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-blue-200 text-blue-500 hover:bg-blue-50'}`}>
                                            🔀 Otro Conductor
                                        </button>
                                    </div>

                                    {form.numConsignacion === 'MISMO_CONDUCTOR' && (
                                        <div className="mt-2 bg-blue-50/80 border border-blue-100 rounded-xl p-3 space-y-1">
                                            <p className="text-[8px] font-black text-blue-700 uppercase tracking-widest">🚗 Placa actual: {inv.vehicle_plate || '—'}</p>
                                            <p className="text-[7px] text-blue-500 font-bold">
                                                El sistema asignará la factura a la ruta más reciente de <span className="font-black">{inv.vehicle_plate || 'este vehículo'}</span>.
                                                Quedará pendiente para ser legalizada como entregada, parcial o devolución.
                                            </p>
                                        </div>
                                    )}

                                    {!form.numConsignacion && (
                                        <p className="text-[7px] text-blue-400 font-bold mt-1 uppercase text-center italic">
                                            ℹ️ Seleccione el tipo de disposición para el Repice.
                                        </p>
                                    )}

                                    {form.numConsignacion === 'OTRO_CONDUCTOR' && (() => {
                                        const [isOpen, setIsOpen] = useState(false);
                                        const [search, setSearch] = useState('');
                                        const dropdownRef = useRef<HTMLDivElement>(null);

                                        const filteredRoutes = (allRoutes || []).filter(r => {
                                            if (r.plate === inv.vehicle_plate) return false;
                                            if (!search) return true;
                                            const s = search.toLowerCase();
                                            return r.plate.toLowerCase().includes(s) || (r.driver_name || '').toLowerCase().includes(s);
                                        });

                                        const selectedRoute = allRoutes?.find(r => r.route_id === form.targetRouteId);

                                        // Click outside handler
                                        useEffect(() => {
                                            const handleClickOutside = (event: MouseEvent) => {
                                                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                                                    setIsOpen(false);
                                                }
                                            };
                                            document.addEventListener('mousedown', handleClickOutside);
                                            return () => document.removeEventListener('mousedown', handleClickOutside);
                                        }, []);

                                        return (
                                            <div className="mt-3 animate-in slide-in-from-top-1 duration-200" ref={dropdownRef}>
                                                <label className="block text-[8px] font-black text-blue-600 uppercase tracking-widest mb-1.5 ml-1">
                                                    Conductor / Placa de Destino
                                                </label>
                                                <p className="text-[7px] text-blue-400 font-bold mb-2 ml-1">
                                                    El sistema usará la ruta más reciente del conductor seleccionado.
                                                </p>
                                                <div className="relative">
                                                    <div
                                                        onClick={() => canEdit && setIsOpen(!isOpen)}
                                                        className={`w-full px-4 py-3 bg-blue-50 border-2 rounded-xl text-[10px] font-black flex items-center justify-between transition-all cursor-pointer
                                                            ${isOpen ? 'border-blue-400 ring-2 ring-blue-100' : 'border-blue-100'}
                                                            ${!canEdit ? 'opacity-70 cursor-not-allowed' : 'hover:border-blue-300'}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {selectedRoute ? (
                                                                <>
                                                                    <span className="text-blue-900">🚗 {selectedRoute.plate}</span>
                                                                    <span className="text-blue-400 text-[8px]">| {selectedRoute.driver_name}</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-blue-300 uppercase tracking-tighter">Buscar por placa o conductor...</span>
                                                            )}
                                                        </div>
                                                        <Icons.ChevronDown className={`w-3 h-3 text-blue-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                    </div>

                                                    {isOpen && (
                                                        <div className="absolute z-[1000] top-full left-0 right-0 mt-2 bg-white border border-blue-100 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                                            <div className="p-2 bg-blue-50/50 border-b border-blue-50">
                                                                <div className="relative">
                                                                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-400" />
                                                                    <input
                                                                        autoFocus
                                                                        type="text"
                                                                        value={search}
                                                                        onChange={(e) => setSearch(e.target.value)}
                                                                        placeholder="Filtrar por placa o conductor..."
                                                                        className="w-full pl-8 pr-4 py-2 bg-white border border-blue-100 rounded-lg text-[10px] font-bold outline-none focus:border-blue-300 transition-all"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                                                {filteredRoutes.length > 0 ? (
                                                                    filteredRoutes.map((r, ridx) => (
                                                                        <div
                                                                            key={r.route_id}
                                                                            onClick={() => {
                                                                                onUpdate({ targetRouteId: r.route_id });
                                                                                setIsOpen(false);
                                                                                setSearch('');
                                                                            }}
                                                                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between border-b border-blue-50 last:border-0 transition-colors"
                                                                        >
                                                                            <div className="flex flex-col gap-0.5">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[10px] font-black text-blue-900">🚗 {r.plate}</span>
                                                                                    {ridx === 0 && <span className="text-[7px] font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Más reciente</span>}
                                                                                </div>
                                                                                <span className="text-[8px] font-bold text-slate-400 uppercase">{r.driver_name || 'Sin conductor'}</span>
                                                                            </div>
                                                                            {form.targetRouteId === r.route_id && (
                                                                                <Icons.Check className="w-3 h-3 text-emerald-500" />
                                                                            )}
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div className="px-4 py-8 text-center">
                                                                        <p className="text-[9px] font-black text-slate-400 uppercase italic">No se encontraron rutas disponibles</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {form.estadoEntrega === 'parcial' ? 'Detalle de Devolución Parcial' : 'Detalle de Entrega (REPICE)'}
                                </p>
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                                    <table className="w-full text-[10px] text-left">
                                        <thead className="bg-slate-100 text-slate-600 font-black uppercase border-b">
                                            <tr>
                                                <th className="px-4 py-2.5">Artículo</th>
                                                <th className="px-3 py-2.5 text-center">Cant</th>
                                                {form.estadoEntrega === 'parcial' && <th className="px-3 py-2.5 text-center bg-amber-100 text-amber-900">Devolver</th>}
                                                <th className="px-4 py-2.5 text-right">{form.estadoEntrega === 'parcial' ? 'Valor Dev.' : 'Estado'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {form.items.map(it => (
                                                <ItemRow 
                                                    key={it.id} 
                                                    it={it} 
                                                    unitPrice={unitPrice} 
                                                    invoiceVal={invoiceVal} 
                                                    canEdit={canEdit} 
                                                    form={form} 
                                                    onUpdateItem={onUpdateItem} 
                                                    onUpdate={onUpdate} 
                                                />
                                            ))}
                                        </tbody>
                                        {form.estadoEntrega === 'parcial' && (
                                            <tfoot className="bg-rose-50 border-t border-rose-100">
                                                <tr>
                                                    <td colSpan={3} className="px-4 py-2 font-black text-rose-700 uppercase text-right">Total Devolución:</td>
                                                    <td className="px-4 py-2 text-right font-black text-rose-800">{fmtCOP(returnedVal)}</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Valores y Consignación */}
                    {(form.estadoEntrega !== 'devolucion' && form.estadoEntrega !== 'repice') && (
                        <div className="space-y-4">
                            {!canEdit ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 space-y-4 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Resumen de Pago</h4>
                                        <span className="text-[9px] font-black px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200">
                                            {form.metodo || 'REGISTRADO'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Recaudado</p>
                                            <p className="text-lg font-black text-slate-900">{fmtCOP(Number(form.valor))}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Referencia / Comprobante</p>
                                            <p className="text-sm font-black text-slate-700">{form.numConsignacion || '—'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha Registro</p>
                                            <p className="text-sm font-black text-slate-700">{form.fecha || '—'}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Valor Factura</p>
                                            <p className="text-xl font-black text-slate-900">{fmtCOP(invoiceVal)}</p>
                                        </div>
                                        <div className={`p-4 rounded-2xl border transition-all ${diff === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                                            <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${diff === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Diferencia</p>
                                            <p className={`text-xl font-black ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtCOP(diff)}</p>
                                        </div>
                                    </div>

                                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-[2rem] p-6 space-y-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-emerald-900/20">💰</div>
                                            <div>
                                                <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Datos de Recaudo</p>
                                                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">Ingrese los detalles del pago recibido</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Total a Consignar</label>
                                                    <div className="relative group">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm transition-colors group-focus-within:text-emerald-500">$</span>
                                                        <input type="number" value={form.valor}
                                                            onChange={e => onUpdate({ valor: e.target.value })}
                                                            className="w-full pl-8 pr-4 py-3 bg-white border border-slate-200 focus:border-emerald-500 rounded-2xl text-sm font-black outline-none transition-all" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Método</label>
                                                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl">
                                                        <button onClick={() => onUpdate({ metodo: 'TRANSFERENCIA' })}
                                                            className={`py-2 rounded-xl text-[8px] font-black uppercase transition-all ${form.metodo === 'TRANSFERENCIA' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>📱 Transfer</button>
                                                        <button onClick={() => onUpdate({ metodo: 'CONSIGNACION' })}
                                                            className={`py-2 rounded-xl text-[8px] font-black uppercase transition-all ${form.metodo === 'CONSIGNACION' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>🏦 Consig</button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">No. Comprobante / Ref.</label>
                                                    <input type="text" value={form.numConsignacion}
                                                        onChange={e => onUpdate({ numConsignacion: e.target.value })} 
                                                        onBlur={e => {
                                                            if (e.target.value && onCheckReference) {
                                                                onCheckReference(e.target.value);
                                                            }
                                                        }}
                                                        placeholder="Ref. del pago"
                                                        className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-emerald-500 rounded-2xl text-sm font-black outline-none transition-all placeholder:text-slate-300" />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Consignación</label>
                                                <input type="date" value={form.fecha}
                                                    onChange={e => onUpdate({ fecha: e.target.value })}
                                                    className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-emerald-500 rounded-2xl text-sm font-black outline-none transition-all" />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {form.estadoEntrega === 'devolucion' && (
                        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-8 text-center space-y-3">
                            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
                                <Icons.RotateCcw className="w-8 h-8 text-rose-600" />
                            </div>
                            <h4 className="text-sm font-black text-rose-800 uppercase tracking-widest">Factura en Devolución</h4>
                            <p className="text-[11px] text-rose-600 font-medium">Se registrará como devolución total sin recaudo de efectivo.</p>
                        </div>
                    )}

                    {isWarehouseReceived && isLegalized && (
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-center">
                            <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">✅ Recibido en Bodega</p>
                            <p className="text-[8px] text-blue-500 mt-0.5 font-bold">Esta factura ya fue procesada por almacén y no puede ser editada.</p>
                        </div>
                    )}

                    {/* Cierre bloque formulario normal */}
                    </>)}
                </div>

                {/* Footer — solo muestra "Confirmar Legalización" cuando NO hay devolución pendiente */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                    <button onClick={onClose} className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all">
                        {!canEdit || hasPendingBodegaReturn ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {canEdit && !hasPendingBodegaReturn && (
                        <button onClick={onSave} disabled={form.saving}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all
                                ${form.saving ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20'}`}>
                            {form.saving && <Icons.Loader className="w-4 h-4 animate-spin" />}
                            {form.saving ? 'Guardando...' : 'Confirmar Legalización'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ──────────────────────────────────────────────────────

const ConciliacionRouteModal: React.FC<Props> = ({
    isOpen, onClose, route, invoices, documentId, currentUserId, onSaved,
    initialSurcharges, initialGroupPayments, allRoutes
}) => {
    useAppData();
    const canDelete = false; // permiso gestionado a nivel de padre
    const [tab, setTab]         = useState<ModalTab>('individual');
    const [forms, setForms]     = useState<Map<string, InvoiceFormState>>(new Map());
    const [activeDialog, setActiveDialog] = useState<string | null>(null);


    // Estado consignación grupal
    const [consignaciones, setConsignaciones] = useState<ConsignacionRow[]>([{ id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: getYesterday(), observacion: '', metodo: 'CONSIGNACION' }]);
    const [isGrupalUnlocked, setIsGrupalUnlocked] = useState(false);
    const [savingGrupal, setSavingGrupal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // --- NUEVO: Ajuste de Método de Pago ---
    const [activePaymentModal, setActivePaymentModal] = useState<string | null>(null);
    const [adjustingPayment, setAdjustingPayment] = useState(false);
    const [paymentObs, setPaymentObs] = useState('');
    const [selectedNewMethod, setSelectedNewMethod] = useState('');

    // --- NUEVO: Reverso de Conciliación ---
    const [showReverseModal, setShowReverseModal] = useState(false);
    const [reverseInvoice, setReverseInvoice] = useState<InvoiceRow | null>(null);
    const [reverseObservations, setReverseObservations] = useState('');
    const [reversingState, setReversingState] = useState(false);

    // Refs de comprobantes ya confirmados como duplicados (para no bloquear el guardado tras confirmar)
    const confirmedRefsRef = useRef<Set<string>>(new Set());

    // Estado para modal de edición de valor/comprobante en facturas ENTREGADAS
    const [adjustModal, setAdjustModal] = useState<{
        isOpen: boolean;
        invoice: any | null;
        newValor: string;
        newComprobante: string;
        saving: boolean;
        checkingRef: boolean;
        refDuplicate: boolean;
    }>({ isOpen: false, invoice: null, newValor: '', newComprobante: '', saving: false, checkingRef: false, refDuplicate: false });

    // Estado para alerta de referencia duplicada
    const [duplicateAlert, setDuplicateAlert] = useState<{
        reference: string;
        sourceType: 'individual' | 'grupal';
        groupIndex?: number;
        invoiceNumber?: string;
        details: Array<{
            type: 'individual' | 'grupal';
            document_id: string;
            invoice_number?: string;
            vehicle_plate: string;
            conductor_name?: string;
            external_doc_id?: string;
            valor?: number;
            fecha?: string;
        }>;
    } | null>(null);

    const handleCheckReference = async (ref: string, sourceType: 'individual' | 'grupal', groupIndex?: number, invoiceNumber?: string) => {
        if (!ref || ref.trim() === '') return;
        try {
            const res = await api.checkReferenceExists(ref);
            if (res.success && res.exists) {
                setDuplicateAlert({
                    reference: ref,
                    sourceType,
                    groupIndex,
                    invoiceNumber,
                    details: res.data
                });
            }
        } catch (error) {
            console.error('Error checking reference:', error);
        }
    };


    const handleExecuteReverse = async () => {
        if (!reverseInvoice) return;
        if (!reverseObservations.trim()) {
            toast.error('Las observaciones son obligatorias para reversar el movimiento.');
            return;
        }

        setReversingState(true);
        try {
            const res = await api.reverseConciliation({
                documentId,
                invoiceNumber: reverseInvoice.invoice_number,
                userId: currentUserId,
                userName: undefined,
                observations: reverseObservations
            });

            if (res.success) {
                toast.success(`Movimiento de la factura ${reverseInvoice.invoice_number} reversado con éxito.`);
                setShowReverseModal(false);
                setReverseInvoice(null);
                setReverseObservations('');
                if (onSaved) {
                    onSaved();
                }
            } else {
                toast.error(res.error || 'No se pudo reversar el movimiento.');
            }
        } catch (err: any) {
            console.error('[REVERSE] error:', err);
            toast.error(err.message || 'Error de conexión al reversar el movimiento.');
        } finally {
            setReversingState(false);
        }
    };

    const handleUpdatePaymentMethod = async (inv: InvoiceRow) => {
        if (!paymentObs.trim()) {
            toast.error('Las observaciones son obligatorias para registrar el cambio.');
            return;
        }
        if (!selectedNewMethod) {
            toast.error('Debe seleccionar un nuevo método de pago.');
            return;
        }

        setAdjustingPayment(true);
        try {
            await api.updatePaymentMethod({
                documentId,
                invoice: inv.invoice_number,
                newMethod: selectedNewMethod,
                userId: currentUserId,
                userName: undefined, // Se puede obtener del store si es necesario
                observations: paymentObs
            });
            toast.success(`✅ Método de pago actualizado para ${inv.invoice_number}`);
            setActivePaymentModal(null);
            setPaymentObs('');
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al actualizar método de pago');
        } finally {
            setAdjustingPayment(false);
        }
    };

    const [headerFilter, setHeaderFilter]     = useState<string | null>(null);

    // Estado sobrecostos
    const [sobrecostos, setSobrecostos]       = useState<SobrecostoRow[]>([{ id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: getYesterday(), statusId: 'EST-01', observaciones: '', facturas: '' }]);
    const [savingSobrecosto, setSavingSobrecosto] = useState(false);
    const [surchargeSearch, setSurchargeSearch]   = useState<Record<string, string>>({});

    // Modal para editar valor de factura
    const [editValueModal, setEditValueModal] = useState<{ isOpen: boolean; invoice: InvoiceRow | null; inputValue: string; saving: boolean }>({
        isOpen: false, invoice: null, inputValue: '', saving: false
    });

    useEffect(() => {
        if (!isOpen) return;
        const m = new Map<string, InvoiceFormState>();
        invoices.forEach(inv => m.set(inv.invoice_number, initForm(inv)));
        setForms(m);

        // Cargar consignaciones grupales previas si existen
        if (initialGroupPayments && initialGroupPayments.length > 0) {
            setConsignaciones(initialGroupPayments.map(p => ({
                id: String(p.id),
                valor: p.valor ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.floor(Number(p.valor) || 0)) : '',
                nroAprobacion: p.nroAprobacion || '',
                // M7 FIX: Usar slice(0,10) pero asegurar que si no hay fecha, use getYesterday
                fecha: p.fecha ? (typeof p.fecha === 'string' ? p.fecha.slice(0, 10) : new Date(p.fecha).toISOString().slice(0, 10)) : getYesterday(),
                observacion: p.observacion || '',
                metodo: p.metodo as MetodoPago || 'CONSIGNACION'
            })));
        } else {
            setConsignaciones([{ id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: getYesterday(), observacion: '', metodo: 'CONSIGNACION' }]);
        }

        // Cargar sobrecostos previos si existen
        if (initialSurcharges && initialSurcharges.length > 0) {
            setSobrecostos(initialSurcharges.map(s => ({
                ...s,
                // Asegurar que el valor sea un string formateado sin decimales
                // Aquí usamos Number() directo porque el valor viene del API (formato standard)
                valor: s.valor ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.floor(Number(s.valor) || 0)) : ''
            })));
        } else {
            setSobrecostos([{ id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: getYesterday(), statusId: 'EST-01', observaciones: '', facturas: '' }]);
        }

        setTab('individual');
        setActiveDialog(null);
        setIsGrupalUnlocked(false);
    }, [isOpen, invoices, initialGroupPayments, initialSurcharges]);

    const updateForm = useCallback((invoiceNum: string, patch: Partial<InvoiceFormState>) => {
        setForms(prev => {
            const next = new Map(prev);
            const cur  = next.get(invoiceNum);
            if (cur) next.set(invoiceNum, { ...cur, ...patch });
            return next;
        });
    }, []);

    const updateItem = useCallback((invoiceNum: string, itemId: string | number, returnedQty: number, returnedValue?: number) => {
        setForms(prev => {
            const next = new Map(prev);
            const cur  = next.get(invoiceNum);
            if (cur) {
                const nextItems = cur.items.map(it => {
                    // M7 FIX: Comparación flexible de IDs (String) para evitar fallos de tipo
                    if (String(it.id) === String(itemId)) {
                        return { 
                            ...it, 
                            returned_qty: returnedQty,
                            returned_value: returnedValue !== undefined ? returnedValue : it.returned_value
                        };
                    }
                    return it;
                });

                // Si es entrega parcial, auto-calcular el valor total a cobrar basándose en lo devuelto
                let nextValor = cur.valor;
                if (cur.estadoEntrega === 'parcial') {
                    const originalInvoice = invoices.find(i => i.invoice_number === invoiceNum);
                    const invoiceVal = Number(originalInvoice?.invoice_value) || 0;
                    const totalQtyItems = nextItems.reduce((acc, x) => acc + (Number(x.qty) || 0), 0);
                    const unitPrice = totalQtyItems > 0 ? (invoiceVal / totalQtyItems) : 0;
                    
                    const totalReturnedVal = nextItems.reduce((acc, x) => {
                        const val = x.returned_value !== undefined 
                            ? Number(x.returned_value) 
                            : (Number(x.returned_qty) || 0) * unitPrice;
                        return acc + val;
                    }, 0);

                    nextValor = String(Math.round(Math.max(0, invoiceVal - totalReturnedVal)));
                }

                next.set(invoiceNum, { ...cur, items: nextItems, valor: nextValor });
            }
            return next;
        });
    }, [invoices]);

    const handleSaveGrupal = async () => {
        // Registros existentes (con ID real de DB) siempre se incluyen — pueden editarse a 0
        const existingRecords = consignaciones.filter(c => c.id && !String(c.id).startsWith('temp-'));
        // Registros nuevos solo si tienen valor > 0
        const newNonZero = consignaciones.filter(c => {
            if (c.id && !String(c.id).startsWith('temp-')) return false;
            const rawVal = String(c.valor || '').replace(/\D/g, '');
            return rawVal !== '' && Number(rawVal) > 0;
        });
        const allToSave = [...existingRecords, ...newNonZero];

        if (allToSave.length === 0) {
            toast.error('Ingrese al menos un valor de consignación válido.');
            return;
        }

        // Referencia obligatoria solo para pagos con valor > 0
        const nonZeroWithMissingRef = allToSave.filter(c => {
            const val = Number(String(c.valor || '').replace(/\D/g, ''));
            return val > 0 && (!c.nroAprobacion || c.nroAprobacion.trim() === '');
        });
        if (nonZeroWithMissingRef.length > 0) {
            toast.error('La Referencia es obligatoria para cada pago registrado.');
            return;
        }


        setSavingGrupal(true);
        try {
            const payload = allToSave.map(c => ({
                    id: String(c.id).startsWith('temp-') ? undefined : c.id,
                    valor: Math.floor(Number(String(c.valor || '').replace(/\D/g, '')) || 0),
                    referencia: c.nroAprobacion,
                    fecha: c.fecha,
                    metodo: c.metodo || 'CONSIGNACION',
                    observacion: c.observacion
                }));

            await api.saveRouteGroupPayments({
                documentId,
                plate: route.plate,
                payments: payload,
                userId: currentUserId
            });
            toast.success('✅ Pagos de ruta actualizados correctamente');
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar consignación grupal');
        } finally {
            setSavingGrupal(false);
        }
    };

    const handleSaveSobrecosto = async () => {
        // Validación de campos obligatorios
        for (const s of sobrecostos) {
            if (!s.valor || Number(s.valor.replace(/\./g, '').replace(',', '')) <= 0) {
                toast.error('Cada sobrecosto debe tener un valor válido.');
                return;
            }
            if (!s.fecha) {
                toast.error('La Fecha es obligatoria para cada sobrecosto.');
                return;
            }
        }

        setSavingSobrecosto(true);
        try {
            await api.saveSobrecostos({
                documentId,
                plate: route.plate,
                items: sobrecostos.map(s => ({
                    id: s.id,
                    valor: Math.floor(Number(String(s.valor).replace(/\D/g, '')) || 0),
                    referencia: s.nroAprobacion,
                    fecha: s.fecha,
                    statusId: s.statusId || 'PENDIENTE',
                    observaciones: s.observaciones || null,
                    facturas: s.facturas || null,
                })),
                userId: currentUserId
            });
            toast.success('✅ Sobrecostos guardados (Pendientes de aprobación)');
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar sobrecostos');
        } finally {
            setSavingSobrecosto(false);
        }
    };

    const handleApproveSurcharge = async (sId: string) => {
        try {
            // Reutilizamos saveSobrecostos o una API específica si existe, 
            // por ahora simulamos aprobación vía api.saveSobrecostos pasando el nuevo estado
            const s = sobrecostos.find(x => x.id === sId);
            if (!s) return;

            if (!s.nroAprobacion || s.nroAprobacion.trim().length < 3) {
                toast.error('La Referencia/NIT es obligatoria para aprobar un sobrecosto.');
                return;
            }
            
            await api.saveSobrecostos({
                documentId,
                plate: route.plate,
                items: [{
                    id: s.id,
                    valor: Math.floor(Number(String(s.valor).replace(/\D/g, '')) || 0),
                    referencia: s.nroAprobacion,
                    fecha: s.fecha,
                    statusId: 'APROBADO',
                    observaciones: s.observaciones || null,
                    facturas: s.facturas || null,
                }],
                userId: currentUserId
            });
            toast.success('✅ Sobrecosto aprobado');
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al aprobar sobrecosto');
        }
    };

    const totalConsignado = useMemo(() =>
        consignaciones.reduce((s, c) => s + (Number(c.valor.replace(/\./g, '').replace(',', '')) || 0), 0),
    [consignaciones]);


    const filteredInvoices = useMemo(() => {
        let list = invoices.filter(inv => {
            const num = (inv.invoice_number || '').toLowerCase();
            const cli = (inv.customer_name || '').toLowerCase();
            const term = searchTerm.toLowerCase();
            return num.includes(term) || cli.includes(term);
        });

        if (headerFilter === 'individual') {
            list = list.filter(i => !!i.forma_pago);
        } else if (headerFilter === 'devolucion') {
            list = list.filter(i => i.es_devolucion || DEVUELTO_STATUS.includes((i.item_status || '').toUpperCase()));
        } else if (headerFilter === 'pendiente') {
            list = list.filter(i => !i.forma_pago && ( (i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') || (i.invoice_metodo_pago || '').toUpperCase().trim() === '' ));
        } else if (headerFilter === 'credito') {
            list = list.filter(i => !( (i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') || (i.invoice_metodo_pago || '').toUpperCase().trim() === '' ));
        }

        return list;
    }, [invoices, searchTerm, headerFilter]);

    const surchargeStats = useMemo(() => {
        const approved = sobrecostos
            .filter(c => c.statusId === 'APROBADO' || c.statusId === 'EST-02')
            .reduce((s, c) => s + (Math.floor(Number(String(c.valor).replace(/\D/g, '')) || 0)), 0);
        const pending = sobrecostos
            .filter(c => c.statusId === 'PENDIENTE' || c.statusId === 'EST-01' || !c.statusId)
            .reduce((s, c) => s + (Math.floor(Number(String(c.valor).replace(/\D/g, '')) || 0)), 0);
        
        const approvedCount = sobrecostos.filter(c => c.statusId === 'APROBADO' || c.statusId === 'EST-02').length;
        const pendingCount = sobrecostos.filter(c => c.statusId === 'PENDIENTE' || c.statusId === 'EST-01' || !c.statusId).length;

        // Sumar también los sobrecostos individuales de las facturas (si están aprobados)
        const totalApproved = approved + invoices.filter(i => (i.item_status === 'APROBADO' || i.item_status === 'EST-02')).reduce((s, i) => s + (Number(i.sobrecosto) || 0), 0);

        return { approved: totalApproved, pending, approvedCount, pendingCount };
    }, [sobrecostos]);

    const plateTotals = useMemo(() => {
        // FILTRO CRÍTICO: EF -> Total Placa (Efectivo), !EF -> Crédito
        const efectivoInvoices = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '';
        });

        const creditoInvoices = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return !(m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '');
        });

        const totalValue   = efectivoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const valorCredito = creditoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        
        // El valor devuelto (EF) incluye: 
        // 1. Facturas con estado devolución (total)
        // 2. La parte no cobrada de las facturas con entrega parcial
        const valorDevuelto = efectivoInvoices.reduce((s, i) => {
            const isDev = i.es_devolucion || DEVUELTO_STATUS.includes((i.item_status || '').toUpperCase());
            const isPar = PARCIAL_STATUS.includes((i.item_status || '').toUpperCase());
            
            // Si es una devolución total, sumamos el valor completo de la factura
            if (isDev) return s + (Number(i.invoice_value) || 0);
            
            // Si es parcial, la parte devuelta es el valor de los ítems retornados
            if (isPar) {
                // Intentar calcular basado en los ítems si están presentes
                const totalQtyItems = i.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                const unitPrice     = (Number(i.invoice_value) || 0) / (totalQtyItems || 1);
                const itemsDevVal   = i.items?.reduce((acc: number, it: any) => {
                    const val = it.returned_value !== undefined 
                        ? Number(it.returned_value) 
                        : (Number(it.returned_qty || 0) * unitPrice);
                    return acc + val;
                }, 0) || 0;
                
                if (itemsDevVal > 0) return s + itemsDevVal;

                // Si no hay ítems detallados pero ya se legalizó, usamos la diferencia (Total - Recaudado)
                if (i.forma_pago) {
                    return s + (Math.max(0, (Number(i.invoice_value) || 0) - (Number(i.valor) || 0)));
                }
            }
            return s;
        }, 0);
        
        // Individual Legalizado (Solo lo que ya se guardó)
        const legalizedIndividual = invoices.filter(i => !!i.forma_pago).reduce((s, i) => s + (Number(i.valor) || 0), 0);
        
        // Sumar consignaciones grupales guardadas
        const legalizedGrupal = (initialGroupPayments || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
        
        const legalCount   = invoices.filter(i => !!i.forma_pago).length;
        
        // PENDIENTE = TOTAL EF - (LEG INDIVIDUAL + LEG GRUPAL + DEVUELTO EF + SOBRECOSTO APROBADO)
        // Nota: legalizedIndividual ya contiene la parte cobrada de los parciales.
        // valorDevuelto contiene la parte NO cobrada de los parciales (si están legalizados) y el total de las devoluciones.
        const pendingVal   = totalValue - (legalizedIndividual + legalizedGrupal + surchargeStats.approved + valorDevuelto);
        
        return { 
            totalValue, 
            valorCredito,
            legalizedVal: legalizedIndividual + legalizedGrupal + surchargeStats.approved, 
            legalizedIndividual,
            legalizedGrupal,
            legalCount, 
            pendingVal, 
            valorDevuelto,
            total: invoices.length 
        };
    }, [invoices, surchargeStats, initialGroupPayments]);

    const pct = plateTotals.total > 0 ? Math.round((plateTotals.legalCount / plateTotals.total) * 100) : 0;

    const submitEditValue = async () => {
        const { invoice, inputValue } = editValueModal;
        if (!invoice) return;
        const num = Number(String(inputValue).replace(/[^0-9.]/g, ''));
        if (isNaN(num) || num < 0) { toast.error('Ingrese un valor válido'); return; }
        setEditValueModal(prev => ({ ...prev, saving: true }));
        try {
            await api.updateInvoiceValue({
                documentId,
                invoiceNumber: invoice.invoice_number,
                value: num,
            });
            toast.success(`Factura ${invoice.invoice_number} actualizada a $${num.toLocaleString('es-CO')}`);
            setEditValueModal({ isOpen: false, invoice: null, inputValue: '', saving: false });
            onSaved();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al actualizar el valor');
            setEditValueModal(prev => ({ ...prev, saving: false }));
        }
    };

    const handleSave = async (inv: InvoiceRow) => {
        const form = forms.get(inv.invoice_number);
        if (!form) return;
        const esDevolucion = form.estadoEntrega === 'devolucion';
        const valorNum = Number(form.valor);
        const invoiceVal = Number(inv.invoice_value) || 0;

        // Validaciones REPICE
        if (form.estadoEntrega === 'repice') {
            if (!form.numConsignacion || (form.numConsignacion !== 'MISMO_CONDUCTOR' && form.numConsignacion !== 'OTRO_CONDUCTOR')) {
                toast.error('Debe seleccionar "Mismo Conductor" o "Otro Conductor" para el Repice.');
                return;
            }
            if (form.numConsignacion === 'OTRO_CONDUCTOR' && !form.targetRouteId) {
                toast.error('Debe seleccionar la placa de destino para la reasignación.');
                return;
            }
        }

        // Validación de comprobante y valor obligatorio para Entregado/Parcial
        if (!esDevolucion && form.estadoEntrega !== 'repice') {
            // Comprobante solo es obligatorio si realmente hay un valor a consignar.
            // Si es Parcial con $0 (ej: solo se devolvieron artículos, sin recaudo), no hay
            // pago que referenciar.
            if (valorNum > 0 && (!form.numConsignacion || form.numConsignacion.trim() === '')) {
                toast.error('El número de comprobante / referencia es obligatorio.');
                return;
            }
            // Para 'entregado' debe ser > 0, para 'parcial' puede ser 0
            if (valorNum < 0 || (form.estadoEntrega === 'entregado' && valorNum <= 0)) {
                toast.error(form.estadoEntrega === 'parcial' ? 'El valor no puede ser negativo.' : 'El total a consignar debe ser mayor a $0 para facturas entregadas.');
                return;
            }
        }

        // Verificar referencia duplicada antes de guardar (si no fue ya confirmada por el usuario)
        const refToCheck = form.numConsignacion?.trim();
        if (refToCheck && !esDevolucion && form.estadoEntrega !== 'repice') {
            const confirmedKey = refToCheck.toUpperCase();
            if (!confirmedRefsRef.current.has(confirmedKey)) {
                try {
                    const checkRes = await api.checkReferenceExists(refToCheck);
                    if (checkRes.success && checkRes.exists) {
                        setDuplicateAlert({
                            reference: refToCheck,
                            sourceType: 'individual',
                            invoiceNumber: inv.invoice_number,
                            details: checkRes.data
                        });
                        return;
                    }
                } catch {
                    // Si la verificación falla, permitir continuar
                }
            }
        }

        updateForm(inv.invoice_number, { saving: true });
        try {
            await api.saveConciliation({
                documentId,
                invoiceNumber:  inv.invoice_number,
                valor:          esDevolucion ? 0 : valorNum,
                banco:          'Bancolombia',
                comprobante:    form.numConsignacion || undefined,
                fechaPago:      form.fecha    || undefined,
                formaPago:      esDevolucion ? 'DEVOLUCION' : form.metodo,
                esDevolucion,
                conciliadoPor:  currentUserId,
                vehiclePlate:   inv.vehicle_plate || route.plate,
                conductorId:    inv.conductor_id,
                conductorName:  inv.conductor_name || route.driver_name || undefined,
                estadoEntrega:  form.estadoEntrega,
                valorFactura:   invoiceVal || undefined,
                itemsReturned:  (form.estadoEntrega === 'parcial' || form.estadoEntrega === 'devolucion')
                                ? (() => {
                                    const totalItemsQty = form.items.reduce((s, x) => s + (Number(x.qty) || 0), 0);
                                    const uPrice = totalItemsQty > 0 ? (invoiceVal / totalItemsQty) : 0;

                                    return form.items.map(it => {
                                        const qty = form.estadoEntrega === 'devolucion' ? it.qty : it.returned_qty;
                                        const val = (it.returned_value !== undefined) 
                                            ? Number(it.returned_value) 
                                            : (Number(qty || 0) * uPrice);
                                            
                                        return {
                                            ...it,
                                            returned_qty: qty,
                                            returned_value: Math.round(Number(val))
                                        };
                                    }).filter(it => (Number(it.returned_qty) || 0) > 0);
                                })()
                                : [],
                targetRouteId:  form.targetRouteId,
            });
            toast.success(`✅ ${inv.invoice_number} legalizada`);
            updateForm(inv.invoice_number, { saving: false });
            setActiveDialog(null);
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
            updateForm(inv.invoice_number, { saving: false });
        }
    };

    // Confirma la devolución de bodega Y legaliza la factura en un solo paso
    const handleConfirmReturnAndSave = async (inv: InvoiceRow, returnId: number, returnType: 'COMPLETA' | 'PARCIAL', consignar: number, comprobante: string, metodo: string, fecha: string) => {
        updateForm(inv.invoice_number, { saving: true });
        try {
            // 1. Confirmar devolución por facturación
            await api.confirmReturnByFacturacion(returnId, currentUserId);

            // 2. Legalizar la factura
            const esCompleta = returnType === 'COMPLETA';
            const estadoEntrega: EstadoEntrega = esCompleta ? 'devolucion' : 'parcial';
            const invoiceVal = Number(inv.invoice_value) || 0;

            await api.saveConciliation({
                documentId,
                invoiceNumber:  inv.invoice_number,
                // Para PARCIAL: valor = total_a_consignar; backend calcula valor_devuelto = factura - consignar
                // Para COMPLETA: valor = 0 (sin cobro)
                valor:          esCompleta ? 0 : consignar,
                banco:          'Bancolombia',
                comprobante:    comprobante || `DEV-BOD-${returnId}`,
                fechaPago:      fecha || new Date().toISOString().slice(0, 10),
                formaPago:      (esCompleta ? 'DEVOLUCION' : metodo) as any,
                esDevolucion:   esCompleta,
                conciliadoPor:  currentUserId,
                vehiclePlate:   inv.vehicle_plate || route.plate,
                conductorId:    inv.conductor_id,
                conductorName:  inv.conductor_name || route.driver_name || undefined,
                estadoEntrega,
                valorFactura:   invoiceVal || undefined,
                itemsReturned:  [],
            });

            toast.success(`✅ ${inv.invoice_number} confirmada y legalizada`);
            updateForm(inv.invoice_number, { saving: false });
            setActiveDialog(null);
            onSaved();
        } catch (err: any) {
            toast.error(err.message || 'Error al confirmar devolución');
            updateForm(inv.invoice_number, { saving: false });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[960] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full h-full sm:h-auto sm:max-w-[98vw] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col sm:max-h-[95vh] border border-slate-100 animate-in zoom-in-95 duration-250">

                {/* Header */}
                <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-b border-emerald-100 px-6 pt-5 pb-4 shrink-0">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
                                <span className="text-xl">🚛</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-0.5">Conciliar Facturas</p>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">{route.plate || 'Sin placa'}</h3>
                                {route.driver_name && <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">👤 {route.driver_name}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-8 gap-2 flex-1 max-w-full">
                            <div onClick={() => { setHeaderFilter(headerFilter === 'individual' ? null : 'individual'); setTab('individual'); }}
                                className={`rounded-2xl px-3 py-2 shadow-lg border cursor-pointer transition-all ${headerFilter === 'individual' ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-500/40' : 'bg-white border-emerald-100/50 shadow-emerald-500/10'}`}>
                                <p className={`text-[7px] font-black uppercase tracking-widest mb-1 text-center ${headerFilter === 'individual' ? 'text-emerald-100' : 'text-emerald-600'}`}>Individual</p>
                                <p className="text-[11px] font-black leading-none text-center">{fmtCOP(plateTotals.legalizedIndividual)}</p>
                                <p className={`text-[6px] font-bold mt-1 text-center ${headerFilter === 'individual' ? 'text-emerald-100/70' : 'text-emerald-600/60'}`}>{plateTotals.legalCount} Facts</p>
                            </div>
                            <div onClick={() => { setHeaderFilter(headerFilter === 'grupal' ? null : 'grupal'); setTab('grupal'); }}
                                className={`rounded-2xl px-3 py-2 shadow-lg border cursor-pointer transition-all ${headerFilter === 'grupal' ? 'bg-violet-600 text-white border-violet-700 shadow-violet-500/40' : 'bg-white border-violet-100/50 shadow-violet-500/10'}`}>
                                <p className={`text-[7px] font-black uppercase tracking-widest mb-1 text-center ${headerFilter === 'grupal' ? 'text-violet-100' : 'text-violet-600'}`}>Grupal</p>
                                <p className="text-[11px] font-black leading-none text-center">{fmtCOP(plateTotals.legalizedGrupal)}</p>
                                <p className={`text-[6px] font-bold mt-1 text-center ${headerFilter === 'grupal' ? 'text-violet-100/70' : 'text-violet-600/60'}`}>Ruta</p>
                            </div>
                            <div className="bg-white rounded-2xl px-3 py-2 shadow-lg shadow-blue-500/10 border border-blue-100/50">
                                <p className="text-[7px] font-black text-blue-600 uppercase tracking-widest mb-1 text-center">Total Leg.</p>
                                <p className="text-[11px] font-black text-blue-800 leading-none text-center">{fmtCOP(plateTotals.legalizedVal)}</p>
                            </div>
                            {(() => {
                                const isSurplus = plateTotals.pendingVal < -1;
                                return (
                                    <div onClick={() => { setHeaderFilter(headerFilter === 'pendiente' ? null : 'pendiente'); setTab('individual'); }}
                                        className={`rounded-2xl px-3 py-2 shadow-lg border cursor-pointer transition-all ${isSurplus 
                                            ? (headerFilter === 'pendiente' ? 'bg-blue-700 text-white border-blue-800' : 'bg-blue-600 text-white border-blue-700 shadow-blue-500/40')
                                            : (headerFilter === 'pendiente' ? 'bg-amber-600 text-white border-amber-700 shadow-amber-500/40' : 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20')}`}>
                                        <p className={`text-[7px] font-black uppercase tracking-widest mb-1 text-center ${isSurplus ? 'text-blue-100' : 'text-amber-100'}`}>
                                            {isSurplus ? '💎 Sobrante' : 'Pendiente'}
                                        </p>
                                        <p className="text-[11px] font-black leading-none text-center">{fmtCOP(Math.abs(plateTotals.pendingVal))}</p>
                                        <p className={`text-[6px] font-bold mt-1 text-center ${isSurplus ? 'text-blue-100/70' : 'text-amber-100/70'}`}>
                                            {isSurplus ? 'Excedente' : 'Falta Cobrar'}
                                        </p>
                                    </div>
                                );
                            })()}
                            {plateTotals.valorDevuelto > 0 && (
                                <div onClick={() => { setHeaderFilter(headerFilter === 'devolucion' ? null : 'devolucion'); setTab('individual'); }}
                                    className={`rounded-2xl px-3 py-2 shadow-lg border cursor-pointer transition-all ${headerFilter === 'devolucion' ? 'bg-orange-600 text-white border-orange-700 shadow-orange-500/40' : 'bg-white border-orange-100/50 shadow-orange-500/10'}`}>
                                    <p className={`text-[7px] font-black uppercase tracking-widest mb-1 text-center ${headerFilter === 'devolucion' ? 'text-orange-100' : 'text-orange-600'}`}>Devuelto</p>
                                    <p className="text-[11px] font-black leading-none text-center">{fmtCOP(plateTotals.valorDevuelto)}</p>
                                </div>
                            )}
                            <div className="bg-white rounded-2xl px-3 py-2 shadow-lg shadow-slate-500/10 border border-slate-100">
                                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 text-center">Total Placa</p>
                                <p className="text-[11px] font-black text-slate-800 leading-none text-center">{fmtCOP(plateTotals.totalValue)}</p>
                                <p className="text-[6px] text-slate-400 font-bold mt-1 text-center">{plateTotals.total} Facts (EF)</p>
                            </div>
                            <div onClick={() => { setHeaderFilter(headerFilter === 'credito' ? null : 'credito'); setTab('individual'); }}
                                className={`rounded-2xl px-3 py-2 shadow-lg border cursor-pointer transition-all ${headerFilter === 'credito' ? 'bg-slate-900 text-white border-slate-900 shadow-slate-900/40' : 'bg-slate-800 text-white border-slate-900 shadow-slate-900/10'}`}>
                                <p className={`text-[7px] font-black uppercase tracking-widest mb-1 text-center ${headerFilter === 'credito' ? 'text-slate-400' : 'text-slate-400'}`}>Crédito</p>
                                <p className="text-[11px] font-black leading-none text-center">{fmtCOP(plateTotals.valorCredito)}</p>
                                <p className={`text-[6px] font-bold mt-1 text-center ${headerFilter === 'credito' ? 'text-slate-500' : 'text-slate-500'}`}>Cartera</p>
                            </div>
                            <div className="bg-white rounded-2xl px-3 py-2 shadow-lg shadow-rose-500/10 border border-rose-100/50">
                                <p className="text-[7px] font-black text-rose-600 uppercase tracking-widest mb-1 text-center font-bold">Sobrecostos</p>
                                <div className="space-y-1 mt-1">
                                    <div className="flex justify-between items-center bg-amber-50/50 px-1.5 py-0.5 rounded-lg">
                                        <p className="text-[6px] font-black text-amber-600 uppercase tracking-tight">P:</p>
                                        <p className="text-[8px] font-black text-slate-700 leading-none">{fmtCOP(surchargeStats.pending)}</p>
                                    </div>
                                    <div className="flex justify-between items-center bg-emerald-50/50 px-1.5 py-0.5 rounded-lg">
                                        <p className="text-[6px] font-black text-emerald-600 uppercase tracking-tight">A:</p>
                                        <p className="text-[8px] font-black text-slate-700 leading-none">{fmtCOP(surchargeStats.approved)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button onClick={onClose} className="w-9 h-9 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-sm self-end lg:self-center">
                            <Icons.X className="w-4 h-4 text-slate-500 hover:text-rose-500" />
                        </button>
                    </div>

                    <div className="flex gap-2 mt-4">
                        {(['individual', 'grupal', 'sobrecosto'] as ModalTab[]).map(t => {
                            const active = tab === t;
                            const labels = { individual: '📄 Individual', grupal: '🏦 Consignación Grupal', sobrecosto: '💰 Sobrecosto' };
                            const colors = { 
                                individual: active ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
                                grupal: active ? 'bg-violet-500 border-violet-500 text-white shadow-md shadow-violet-200' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600',
                                sobrecosto: active ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-200' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600'
                            };
                            return (
                                <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-2 ${colors[t]}`}>
                                    {labels[t]}
                                </button>
                            );
                        })}
                    </div>


                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
                    {tab === 'individual' && (
                        <div className="space-y-4">
                            {/* Buscador de facturas */}
                            <div className="relative mb-4">
                                <Icons.Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar factura por número o cliente..."
                                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all shadow-sm"
                                />
                            </div>

                            {filteredInvoices.map(inv => {
                                const isLegalized = !!inv.forma_pago;
                                const invoiceVal = Number(inv.invoice_value) || 0;
                                const ms = inv.mastersuite_estado?.toLowerCase();
                                const msBadge = ms ? (
                                    ms.includes('complet') ? { bg: 'bg-teal-100', text: 'text-teal-700' }
                                    : ms.includes('devol') ? { bg: 'bg-rose-100', text: 'text-rose-700' }
                                    : ms.includes('parcial') ? { bg: 'bg-amber-100', text: 'text-amber-700' }
                                    : { bg: 'bg-slate-100', text: 'text-slate-600' }
                                ) : null;

                                return (
                                    <div key={inv.invoice_number} className={`bg-white rounded-2xl border-2 px-4 py-3.5 flex items-start gap-3 transition-all ${isLegalized ? 'border-emerald-200' : 'border-slate-100 hover:border-slate-200'}`}>
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isLegalized ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                            <span className="text-sm">{isLegalized ? '✅' : '⏳'}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[11px] font-black text-slate-900">{inv.invoice_number}</span>
                                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${isLegalized ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {isLegalized ? 'Legalizada' : 'Pendiente'}
                                                </span>
                                                {(() => {
                                                    const status = (inv.item_status || '').toUpperCase();
                                                    const isDev = inv.es_devolucion || DEVUELTO_STATUS.includes(status);
                                                    const isPar = PARCIAL_STATUS.includes(status);
                                                    const isDevOrPar = isDev || isPar;
                                                    
                                                    return isLegalized && isDevOrPar && (
                                                        <button 
                                                            onClick={() => {
                                                                setReverseInvoice(inv);
                                                                setReverseObservations('');
                                                                setShowReverseModal(true);
                                                            }}
                                                            className="text-[8px] font-black px-2 py-0.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-all hover:scale-105 active:scale-95 duration-150 uppercase tracking-wider flex items-center gap-1"
                                                        >
                                                            ↩ Reversar Cambio
                                                        </button>
                                                    );
                                                })()}
                                                <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${inv.invoice_metodo_pago?.toUpperCase().includes('EFE') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                    {inv.invoice_metodo_pago || 'EFECTIVO'}
                                                </span>
                                                {msBadge && <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${msBadge.bg} ${msBadge.text}`}>🏢 MS: {inv.mastersuite_estado}</span>}
                                                {(inv.item_status === 'repice' || inv.item_status === 'REPICE') && (
                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">📋 REPICE</span>
                                                )}
                                            </div>
                                            {inv.customer_name && <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>}
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] font-bold text-slate-600">Factura: {fmtCOP(invoiceVal)}</span>
                                                <button
                                                    title="Modificar valor de factura"
                                                    onClick={() => setEditValueModal({ isOpen: true, invoice: inv, inputValue: String(invoiceVal || ''), saving: false })}
                                                    className="w-4 h-4 rounded-full bg-slate-200 hover:bg-indigo-500 hover:text-white text-slate-500 flex items-center justify-center transition-all flex-shrink-0"
                                                >
                                                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                </button>
                                                {isLegalized && <span className="text-[9px] font-black text-emerald-600">Recaudado: {fmtCOP(inv.valor)}</span>}
                                                {(() => {
                                                    const status = (inv.item_status || '').toUpperCase();
                                                    const isDev = inv.es_devolucion || DEVUELTO_STATUS.includes(status);
                                                    const isPar = PARCIAL_STATUS.includes(status);
                                                    if (!isDev && !isPar) return null;
                                                    
                                                    const vDevol = (() => {
                                                        if (isDev) return invoiceVal;
                                                        const totalQtyItems = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                                                        const unitPrice     = invoiceVal / (totalQtyItems || 1);
                                                        const itemsDevVal   = inv.items?.reduce((acc: number, it: any) => {
                                                            const val = it.returned_value !== undefined 
                                                                ? Number(it.returned_value) 
                                                                : (Number(it.returned_qty || 0) * unitPrice);
                                                            return acc + val;
                                                        }, 0) || 0;
                                                        if (itemsDevVal > 0) return itemsDevVal;
                                                        if (isLegalized) return Math.max(0, invoiceVal - (Number(inv.valor) || 0));
                                                        return 0;
                                                    })();

                                                    return vDevol > 0 && (
                                                        <span className="text-[9px] font-black text-amber-600">Devuelto: {fmtCOP(vDevol)}</span>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button onClick={() => setActiveDialog(inv.invoice_number)} className={`shrink-0 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all ${isLegalized ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-900/20'}`}>
                                                {isLegalized ? 'Ver Detalle' : 'Legalizar'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedNewMethod('');
                                                    setPaymentObs('');
                                                    setActivePaymentModal(inv.invoice_number);
                                                }}
                                                className="shrink-0 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all bg-slate-800 text-white hover:bg-slate-700"
                                            >
                                                💳 Ajustar Pago
                                            </button>
                                            {(() => {
                                                const status = (inv.item_status || '').toUpperCase();
                                                const isDev = inv.es_devolucion || DEVUELTO_STATUS.includes(status);
                                                const isPar = PARCIAL_STATUS.includes(status);
                                                if (!isLegalized || isDev || isPar) return null;
                                                return (
                                                    <button
                                                        onClick={() => setAdjustModal({
                                                            isOpen: true,
                                                            invoice: inv,
                                                            newValor: String(inv.valor || ''),
                                                            newComprobante: inv.comprobante || '',
                                                            saving: false,
                                                            checkingRef: false,
                                                            refDuplicate: false,
                                                        })}
                                                        className="shrink-0 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all bg-amber-500 text-white hover:bg-amber-600"
                                                    >
                                                        ✏️ Editar Recaudo
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {tab === 'grupal' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Detalle de Consignaciones</h4>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Registre los comprobantes de pago de la placa</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsGrupalUnlocked(!isGrupalUnlocked)}
                                        className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border-2 flex items-center gap-2
                                            ${isGrupalUnlocked 
                                                ? 'bg-amber-500 border-amber-500 text-white shadow-md' 
                                                : 'bg-white border-slate-200 text-slate-500 hover:border-violet-400 hover:text-violet-600'}`}>
                                        {isGrupalUnlocked ? '🔒 Bloquear Edición' : '🔓 Habilitar Edición'}
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {consignaciones.map((c, idx) => (
                                             <div key={c.id} className={`grid grid-cols-12 gap-3 p-3 rounded-2xl border shadow-sm relative group transition-all
                                                ${String(c.id).startsWith('temp-') ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-80'}`}>
                                                <div className="col-span-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Valor</p>
                                                    <input type="text" value={c.valor} disabled={!String(c.id).startsWith('temp-') && !isGrupalUnlocked}
                                                        onChange={e => {
                                                            const val = e.target.value.replace(/\D/g, '');
                                                            const fmt = val ? new Intl.NumberFormat('es-CO').format(Number(val)) : '';
                                                            const next = [...consignaciones];
                                                            next[idx].valor = fmt;
                                                            setConsignaciones(next);
                                                        }}
                                                        placeholder="$ 0" className="w-full bg-white px-2 py-2 rounded-xl text-[10px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent disabled:bg-transparent" />
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Referencia</p>
                                                    <input type="text" value={c.nroAprobacion} disabled={!String(c.id).startsWith('temp-') && !isGrupalUnlocked}
                                                        onChange={e => {
                                                            const next = [...consignaciones];
                                                            next[idx].nroAprobacion = e.target.value;
                                                            setConsignaciones(next);
                                                        }}
                                                        onBlur={e => {
                                                            if (e.target.value) {
                                                                handleCheckReference(e.target.value, 'grupal', idx);
                                                            }
                                                        }}
                                                        placeholder="N°" className="w-full bg-white px-2 py-2 rounded-xl text-[10px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent disabled:bg-transparent" />
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Método</p>
                                                    <select value={c.metodo || 'CONSIGNACION'} disabled={!String(c.id).startsWith('temp-') && !isGrupalUnlocked}
                                                        onChange={e => {
                                                            const next = [...consignaciones];
                                                            next[idx].metodo = e.target.value as MetodoPago;
                                                            setConsignaciones(next);
                                                        }}
                                                        className="w-full bg-white px-1 py-2 rounded-xl text-[9px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent appearance-none text-center disabled:bg-transparent">
                                                        <option value="CONSIGNACION">🏦 CONSIGNACIÓN</option>
                                                        <option value="TRANSFERENCIA">📱 TRANSFERENCIA</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Fecha</p>
                                                    <input type="date" value={c.fecha} disabled={!String(c.id).startsWith('temp-') && !isGrupalUnlocked}
                                                        onChange={e => {
                                                            const next = [...consignaciones];
                                                            next[idx].fecha = e.target.value;
                                                            setConsignaciones(next);
                                                        }}
                                                        className="w-full bg-white px-2 py-2 rounded-xl text-[10px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent disabled:bg-transparent" />
                                                </div>
                                                <div className="col-span-4">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Observación</p>
                                                    <input type="text" value={c.observacion || ''} disabled={!String(c.id).startsWith('temp-') && !isGrupalUnlocked}
                                                        onChange={e => {
                                                            const next = [...consignaciones];
                                                            next[idx].observacion = e.target.value;
                                                            setConsignaciones(next);
                                                        }}
                                                        placeholder="Notas..." className="w-full bg-white px-2 py-2 rounded-xl text-[10px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent disabled:bg-transparent" />
                                                </div>
                                                {consignaciones.length > 1 && String(c.id).startsWith('temp-') && (
                                                    <button onClick={() => setConsignaciones(consignaciones.filter(x => x.id !== c.id))}
                                                        className="absolute -right-2 -top-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-100">
                                                        <Icons.X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                    ))}
                                </div>

                                <button onClick={() => setConsignaciones([...consignaciones, { id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: getYesterday(), observacion: '', metodo: 'CONSIGNACION' }])}
                                    className="mt-4 w-full py-2.5 border-2 border-dashed border-slate-300 rounded-2xl text-[9px] font-black text-slate-500 uppercase tracking-widest hover:border-violet-400 hover:text-violet-600 transition-all">
                                    + Agregar otra consignación
                                </button>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Total Consignado</p>
                                    <p className="text-xl font-black text-emerald-900">{fmtCOP(totalConsignado)}</p>
                                </div>
                                <button onClick={handleSaveGrupal} disabled={savingGrupal}
                                    className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all
                                        ${savingGrupal ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20'}`}>
                                    {savingGrupal ? 'Procesando...' : 'Guardar Pago de Ruta'}
                                </button>
                            </div>
                            
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
                                <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">ℹ Manejo de Plata</p>
                                <p className="text-[8px] text-amber-600 mt-0.5 font-bold uppercase tracking-tight">Este recaudo se asocia a la placa {route.plate} y suma al total legalizado de la ruta.</p>
                            </div>
                        </div>
                    )}
                    
                    {tab === 'sobrecosto' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Gestión de Sobrecostos</h4>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Registre gastos adicionales asociados a la placa {route.plate}</p>
                                    </div>
                                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black uppercase tracking-widest">Estado: Pendiente de Aprobación</span>
                                </div>
                                <div className="space-y-3">
                                    {sobrecostos.map((s, idx) => {
                                        const isApproved = s.statusId === 'APROBADO' || s.statusId === 'EST-02';
                                        const isAnulado  = s.statusId === 'ANULADO';
                                        const isPending  = !isApproved && !isAnulado;
                                        const isNew      = String(s.id).length > 10;
                                        const showDelete = isNew || (isPending && canDelete);

                                        return (
                                            <div key={s.id} className={`p-3 rounded-2xl border-2 shadow-sm relative group transition-all
                                                ${isApproved ? 'bg-blue-50 border-blue-200' : isAnulado ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white border-slate-100'}`}>

                                                {/* Fila 1: Valor / Referencia / Fecha / Aprobar */}
                                                <div className="grid grid-cols-12 gap-3 mb-3">
                                                    <div className="col-span-3">
                                                        <p className={`text-[8px] font-black text-slate-400 uppercase mb-1 ${isAnulado ? 'line-through' : ''}`}>Valor</p>
                                                        <input type="text" value={s.valor} disabled={!isPending}
                                                            onChange={e => {
                                                                const val = e.target.value.replace(/\D/g, '');
                                                                const fmt = val ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val)) : '';
                                                                const next = [...sobrecostos]; next[idx].valor = fmt; setSobrecostos(next);
                                                            }}
                                                            placeholder="$ 0.00" className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                                ${isApproved ? 'bg-transparent text-blue-900' : isAnulado ? 'bg-transparent text-slate-400 line-through' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <p className={`text-[8px] font-black text-slate-400 uppercase mb-1 ${isAnulado ? 'line-through' : ''}`}>Referencia / NIT</p>
                                                        <input type="text" value={s.nroAprobacion} disabled={!isPending}
                                                            onChange={e => { const next = [...sobrecostos]; next[idx].nroAprobacion = e.target.value; setSobrecostos(next); }}
                                                            placeholder="Obligatorio" className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                                ${isApproved ? 'bg-transparent text-blue-900' : isAnulado ? 'bg-transparent text-slate-400 line-through' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <p className={`text-[8px] font-black text-slate-400 uppercase mb-1 ${isAnulado ? 'line-through' : ''}`}>Fecha</p>
                                                        <input type="date" value={s.fecha} disabled={!isPending}
                                                            onChange={e => { const next = [...sobrecostos]; next[idx].fecha = e.target.value; setSobrecostos(next); }}
                                                            className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                                ${isApproved ? 'bg-transparent text-blue-900' : isAnulado ? 'bg-transparent text-slate-400 line-through' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                    </div>
                                                    <div className="col-span-3 flex flex-col justify-end">
                                                        {isApproved ? (
                                                            <span className="bg-blue-600 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest">Aprobado</span>
                                                        ) : isAnulado ? (
                                                            <span className="bg-slate-400 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest">Anulado</span>
                                                        ) : (
                                                            <button onClick={() => handleApproveSurcharge(s.id)}
                                                                className="bg-emerald-500 hover:bg-emerald-600 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest shadow-sm shadow-emerald-200">
                                                                ✅ Aprobar
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Fila 2: Observaciones */}
                                                <div className="mb-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Observaciones</p>
                                                    <input type="text" value={s.observaciones || ''} disabled={!isPending}
                                                        onChange={e => { const next = [...sobrecostos]; next[idx].observaciones = e.target.value; setSobrecostos(next); }}
                                                        placeholder="Notas adicionales (opcional)"
                                                        className={`w-full px-3 py-2 rounded-xl text-[11px] outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : isAnulado ? 'bg-transparent text-slate-400' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>

                                                {/* Fila 3: Facturas asociadas (multi-select) */}
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Facturas asociadas</p>
                                                    {invoices.length === 0 ? (
                                                        <p className="text-[9px] text-slate-400 italic">Sin facturas en esta placa</p>
                                                    ) : (
                                                        <>
                                                            {/* Botones de acción rápida y buscador para facturas de sobrecosto */}
                                                            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                                                                <div className="flex gap-2">
                                                                    <button 
                                                                        type="button"
                                                                        disabled={!isPending}
                                                                        onClick={() => {
                                                                            const allInvoices = invoices.map(i => i.invoice_number);
                                                                            const next = [...sobrecostos];
                                                                            next[idx].facturas = allInvoices.join(', ');
                                                                            setSobrecostos(next);
                                                                        }}
                                                                        className="px-3 py-1.5 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 rounded-xl text-[8px] font-black uppercase tracking-wider border-2 border-slate-200 hover:border-orange-200 transition-all disabled:opacity-50 flex items-center gap-1"
                                                                    >
                                                                        <span>✓</span> Seleccionar Todas
                                                                    </button>
                                                                    <button 
                                                                        type="button"
                                                                        disabled={!isPending}
                                                                        onClick={() => {
                                                                            const next = [...sobrecostos];
                                                                            next[idx].facturas = '';
                                                                            setSobrecostos(next);
                                                                        }}
                                                                        className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-[8px] font-black uppercase tracking-wider border-2 border-slate-200 hover:border-rose-200 transition-all disabled:opacity-50 flex items-center gap-1"
                                                                    >
                                                                        <span>✗</span> Deseleccionar Todas
                                                                    </button>
                                                                </div>
                                                                <div className="relative">
                                                                    <input 
                                                                        type="text"
                                                                        placeholder="Buscar factura..."
                                                                        value={surchargeSearch[s.id] || ''}
                                                                        onChange={(e) => setSurchargeSearch({ ...surchargeSearch, [s.id]: e.target.value })}
                                                                        disabled={!isPending}
                                                                        className="pl-7 pr-3 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-[9px] font-bold outline-none focus:border-orange-500 w-36 placeholder:text-slate-400 focus:ring-4 focus:ring-orange-500/5 transition-all shadow-sm"
                                                                    />
                                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">🔍</span>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1 border-2 border-slate-100/50 p-2 rounded-2xl bg-slate-50/50">
                                                                {invoices
                                                                    .filter(inv => {
                                                                        const term = (surchargeSearch[s.id] || '').toLowerCase().trim();
                                                                        if (!term) return true;
                                                                        return inv.invoice_number.toLowerCase().includes(term);
                                                                    })
                                                                    .map(inv => {
                                                                        const selected = (s.facturas || '').split(',').map(f => f.trim()).filter(Boolean).includes(inv.invoice_number);
                                                                        const canToggle = isPending;
                                                                        return (
                                                                            <button key={inv.invoice_number}
                                                                                type="button"
                                                                                disabled={!canToggle}
                                                                                onClick={() => {
                                                                                    if (!canToggle) return;
                                                                                    const current = (s.facturas || '').split(',').map(f => f.trim()).filter(Boolean);
                                                                                    const updated = selected
                                                                                        ? current.filter(f => f !== inv.invoice_number)
                                                                                        : [...current, inv.invoice_number];
                                                                                    const next = [...sobrecostos];
                                                                                    next[idx].facturas = updated.join(', ');
                                                                                    setSobrecostos(next);
                                                                                }}
                                                                                className={`px-3 py-1.5 rounded-xl text-[9px] font-black transition-all border-2 flex items-center gap-1
                                                                                    ${selected
                                                                                        ? 'bg-orange-500 text-white border-orange-600 shadow-sm shadow-orange-500/30'
                                                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-600'
                                                                                    } ${!canToggle ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}>
                                                                                {selected && <span className="text-[10px]">✓</span>}
                                                                                {inv.invoice_number}
                                                                            </button>
                                                                        );
                                                                    })}
                                                            </div>
                                                        </>
                                                    )}
                                                    {(s.facturas || '').trim() && (
                                                        <p className="text-[8px] text-orange-600 font-bold mt-1">
                                                            Seleccionadas: {s.facturas}
                                                        </p>
                                                    )}
                                                </div>

                                                {showDelete && (
                                                    <button onClick={() => {
                                                        if (isNew) {
                                                            setSobrecostos(sobrecostos.filter(x => x.id !== s.id));
                                                        } else {
                                                            const next = [...sobrecostos];
                                                            next[idx].statusId = 'ANULADO';
                                                            setSobrecostos(next);
                                                        }
                                                    }}
                                                        className="absolute -right-2 -top-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-100 z-10">
                                                        <Icons.X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <button onClick={() => setSobrecostos([...sobrecostos, { id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: getYesterday(), statusId: 'EST-01', observaciones: '', facturas: '' }])}
                                    className="mt-4 w-full py-2.5 border-2 border-dashed border-slate-300 rounded-2xl text-[9px] font-black text-slate-500 uppercase tracking-widest hover:border-orange-400 hover:text-orange-600 transition-all">
                                    + Agregar otro sobrecosto
                                </button>
                            </div>

                            <div className="bg-white rounded-[2rem] p-6 flex items-center justify-between shadow-xl shadow-slate-200/30 border border-slate-100">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Sobrecostos</p>
                                    <p className="text-xl font-black text-slate-900">{fmtCOP(surchargeStats.approved + surchargeStats.pending)}</p>
                                </div>
                                <button onClick={handleSaveSobrecosto} disabled={savingSobrecosto}
                                    className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all
                                        ${savingSobrecosto ? 'bg-slate-200 text-slate-400' : 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-900/20'}`}>
                                    {savingSobrecosto ? 'Enviando...' : 'Solicitar Aprobación de Sobrecostos'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                    <button onClick={onClose} className="w-full py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all">
                        Cerrar Módulo
                    </button>
                </div>
            </div>

            {/* Diálogo de Legalización */}
            {activeDialog && (() => {
                const inv = invoices.find(i => i.invoice_number === activeDialog);
                const form = forms.get(activeDialog);
                if (!inv || !form) return null;
                return (
                    <LegalizationDialog
                        inv={inv}
                        form={form}
                        onClose={() => setActiveDialog(null)}
                        onUpdate={(patch) => updateForm(inv.invoice_number, patch)}
                        onUpdateItem={(itemId, rq, rv) => updateItem(inv.invoice_number, itemId, rq, rv)}
                        onSave={() => handleSave(inv)}
                        allRoutes={allRoutes}
                        onCheckReference={(ref) => handleCheckReference(ref, 'individual', undefined, inv.invoice_number)}
                        currentUserId={currentUserId}
                        onConfirmReturnAndSave={(returnId, returnType, consignar, comprobante, metodo, fecha) => handleConfirmReturnAndSave(inv, returnId, returnType, consignar, comprobante, metodo, fecha)}
                    />
                );
            })()}

            {/* Diálogo de Ajuste de Método de Pago */}
            {activePaymentModal && (() => {
                const inv = invoices.find(i => i.invoice_number === activePaymentModal);
                if (!inv) return null;
                
                const currentMethod = (inv.invoice_metodo_pago || 'EF').toUpperCase();
                const options = currentMethod === 'EF' 
                    ? ['030D', 'CA030', 'CP010'] 
                    : ['EF', '030D', 'CA030', 'CP010'].filter(o => o !== currentMethod);

                return (
                    <div className="fixed inset-0 z-[990] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                            <div className="bg-slate-900 px-6 py-5 text-white">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Ajustar Método de Pago</p>
                                <h4 className="text-xl font-black">{inv.invoice_number}</h4>
                            </div>
                            
                            <div className="p-6 space-y-5">
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Cliente</p>
                                    <p className="text-xs font-bold text-slate-700">{inv.customer_name}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Actual</p>
                                        <p className="text-sm font-black text-slate-900">{currentMethod}</p>
                                    </div>
                                    <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                                        <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Nuevo Método</p>
                                        <select 
                                            value={selectedNewMethod}
                                            onChange={(e) => setSelectedNewMethod(e.target.value)}
                                            className="w-full bg-transparent outline-none text-sm font-black text-emerald-900 appearance-none cursor-pointer"
                                        >
                                            <option value="">Seleccione...</option>
                                            {options.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Observaciones de Cambio (Obligatorio)</p>
                                    <textarea 
                                        value={paymentObs}
                                        onChange={(e) => setPaymentObs(e.target.value)}
                                        placeholder="Ej: Cambio solicitado por el cliente por error en despacho..."
                                        className="w-full h-24 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold outline-none focus:border-slate-400 transition-all resize-none"
                                    />
                                </div>
                            </div>

                            <div className="px-6 py-5 bg-slate-50 flex gap-3">
                                <button 
                                    onClick={() => setActivePaymentModal(null)}
                                    className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={() => handleUpdatePaymentMethod(inv)}
                                    disabled={adjustingPayment}
                                    className={`flex-[1.5] py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all
                                        ${adjustingPayment ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20'}`}
                                >
                                    {adjustingPayment ? 'Actualizando...' : 'Guardar Cambio'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showReverseModal && reverseInvoice && (
                <div className="fixed inset-0 z-[995] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-rose-600 to-red-500 px-6 py-5 text-white">
                            <p className="text-[10px] font-black text-rose-100 uppercase tracking-[0.2em] mb-1">Peligro: Reversar Movimiento</p>
                            <h4 className="text-xl font-black">{reverseInvoice.invoice_number}</h4>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl">
                                <p className="text-xs font-bold text-rose-700 leading-relaxed">
                                    ⚠️ <strong>Atención:</strong> Está a punto de deshacer y eliminar la legalización de esta factura. El estado del ítem en la ruta volverá a ser "Pendiente (Asignado)". Esta acción quedará registrada en la bitácora de auditoría de M7.
                                </p>
                            </div>

                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Justificación / Observaciones (Obligatorio)</p>
                                <textarea 
                                    value={reverseObservations}
                                    onChange={(e) => setReverseObservations(e.target.value)}
                                    placeholder="Indique la razón para reversar la conciliación de esta factura..."
                                    className="w-full h-24 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-semibold outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-500/5 transition-all resize-none text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-5 bg-slate-50 flex gap-3 border-t border-slate-100">
                            <button 
                                onClick={() => { setShowReverseModal(false); setReverseInvoice(null); }}
                                className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleExecuteReverse}
                                disabled={reversingState || !reverseObservations.trim()}
                                className={`flex-[1.5] py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all
                                    ${reversingState || !reverseObservations.trim() ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-900/20'}`}
                            >
                                {reversingState ? 'Reversando...' : 'Reversar Ahora'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Advertencia de Referencia Duplicada */}
            {duplicateAlert && (
                <div className="fixed inset-0 z-[1050] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-rose-100 animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-rose-600 to-red-500 px-6 py-5 text-white flex items-center gap-3">
                            <span className="text-2xl">⚠️</span>
                            <div>
                                <p className="text-[10px] font-black text-rose-100 uppercase tracking-[0.2em] mb-0.5">Advertencia de Duplicado</p>
                                <h4 className="text-base font-black">Referencia ya Registrada</h4>
                            </div>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center">
                                <p className="text-xs font-semibold text-slate-500">La referencia / número de aprobación</p>
                                <p className="text-lg font-black text-rose-600 mt-1">"{duplicateAlert.reference}"</p>
                                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mt-1.5">ya existe en el sistema</p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Detalles del Registro Previo:</p>
                                <div className="max-h-[160px] overflow-y-auto custom-scrollbar space-y-2">
                                    {duplicateAlert.details.map((detail, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl space-y-1.5 text-left">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[8px] font-black text-slate-400 uppercase">Tipo</span>
                                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${detail.type === 'individual' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                                                    {detail.type === 'individual' ? 'Individual' : 'Consignación Grupal'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[8px] font-black text-slate-400 uppercase">Documento / Plan</span>
                                                <span className="text-[10px] font-bold text-slate-700">{detail.external_doc_id || detail.document_id}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[8px] font-black text-slate-400 uppercase">Placa Vehículo</span>
                                                <span className="text-[10px] font-black text-slate-800">🚗 {detail.vehicle_plate || '—'}</span>
                                            </div>
                                            {detail.type === 'individual' && detail.invoice_number && (
                                                <div className="flex justify-between items-center bg-white p-1 px-2 rounded-lg border border-slate-100">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">Factura Asociada</span>
                                                    <span className="text-[10px] font-black text-emerald-600">{detail.invoice_number}</span>
                                                </div>
                                            )}
                                            {detail.conductor_name && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">Conductor</span>
                                                    <span className="text-[10px] font-semibold text-slate-500">{detail.conductor_name}</span>
                                                </div>
                                            )}
                                            {detail.valor !== undefined && detail.valor !== null && (
                                                <div className="flex justify-between items-center border-t border-slate-200/50 pt-1 mt-1">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">Valor Recaudado</span>
                                                    <span className="text-[10px] font-black text-emerald-700">${Number(detail.valor).toLocaleString('es-CO')}</span>
                                                </div>
                                            )}
                                            {detail.fecha && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">Fecha Registro</span>
                                                    <span className="text-[10px] font-semibold text-slate-600">📅 {detail.fecha.slice(0, 10)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 text-center">
                                <p className="text-xs font-black text-slate-800">¿Desea continuar con esta referencia?</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Si cancela, el campo se limpiará para ingresar un nuevo dato.</p>
                            </div>
                        </div>

                        <div className="px-6 py-5 bg-slate-50 flex gap-3 border-t border-slate-100">
                            <button 
                                onClick={() => {
                                    // CANCEL: Limpiar el campo
                                    if (duplicateAlert.sourceType === 'individual') {
                                        const activeInvNum = duplicateAlert.invoiceNumber || activeDialog;
                                        if (activeInvNum) {
                                            updateForm(activeInvNum, { numConsignacion: '' });
                                        }
                                    } else if (duplicateAlert.sourceType === 'grupal' && duplicateAlert.groupIndex !== undefined) {
                                        const next = [...consignaciones];
                                        next[duplicateAlert.groupIndex].nroAprobacion = '';
                                        setConsignaciones(next);
                                    }
                                    setDuplicateAlert(null);
                                    toast.info('Se ha limpiado el número de referencia para ingresar uno nuevo.');
                                }}
                                className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all shadow-sm"
                            >
                                ❌ No, Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    // Registrar referencia como confirmada para no bloquear el guardado
                                    confirmedRefsRef.current.add(duplicateAlert.reference.trim().toUpperCase());
                                    setDuplicateAlert(null);
                                    toast.success('Se ha permitido el uso de la referencia duplicada.');
                                }}
                                className="flex-[1.2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all"
                            >
                                Sí, Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Editar Recaudo (valor + comprobante) de factura ENTREGADA ── */}
            {adjustModal.isOpen && adjustModal.invoice && (
                <div className="fixed inset-0 z-[1060] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-amber-100 animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-400 px-6 py-5 text-white flex items-center gap-3">
                            <span className="text-2xl">✏️</span>
                            <div>
                                <p className="text-[10px] font-black text-amber-100 uppercase tracking-[0.2em] mb-0.5">Editar Recaudo</p>
                                <h4 className="text-base font-black">{adjustModal.invoice.invoice_number}</h4>
                                <p className="text-[9px] text-amber-100 font-bold mt-0.5 uppercase">{adjustModal.invoice.customer_name}</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Valor Recaudado</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        autoFocus
                                        value={adjustModal.newValor}
                                        onChange={e => setAdjustModal(prev => ({ ...prev, newValor: e.target.value }))}
                                        disabled={adjustModal.saving}
                                        className="w-full pl-8 pr-4 py-3 bg-white border-2 border-slate-200 focus:border-amber-500 rounded-2xl text-sm font-black outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold ml-1">Actual: {fmtCOP(Number(adjustModal.invoice.valor))}</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">No. Comprobante / Ref.</label>
                                <input
                                    type="text"
                                    value={adjustModal.newComprobante}
                                    onChange={e => setAdjustModal(prev => ({ ...prev, newComprobante: e.target.value, refDuplicate: false }))}
                                    onBlur={async e => {
                                        const ref = e.target.value.trim();
                                        const origRef = (adjustModal.invoice?.comprobante || '').trim();
                                        if (!ref || ref.toUpperCase() === origRef.toUpperCase()) return;
                                        const confirmedKey = ref.toUpperCase();
                                        if (confirmedRefsRef.current.has(confirmedKey)) return;
                                        setAdjustModal(prev => ({ ...prev, checkingRef: true, refDuplicate: false }));
                                        try {
                                            const res = await api.checkReferenceExists(ref);
                                            setAdjustModal(prev => ({ ...prev, checkingRef: false, refDuplicate: !!(res.success && res.exists) }));
                                            if (res.success && res.exists) {
                                                setDuplicateAlert({
                                                    reference: ref,
                                                    sourceType: 'individual',
                                                    invoiceNumber: adjustModal.invoice?.invoice_number,
                                                    details: res.data
                                                });
                                            }
                                        } catch {
                                            setAdjustModal(prev => ({ ...prev, checkingRef: false }));
                                        }
                                    }}
                                    disabled={adjustModal.saving}
                                    placeholder="Ref. del pago"
                                    className={`w-full px-4 py-3 bg-white border-2 rounded-2xl text-sm font-black outline-none transition-all placeholder:text-slate-300 disabled:opacity-50 ${adjustModal.refDuplicate ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-amber-500'}`}
                                />
                                {adjustModal.checkingRef && <p className="text-[9px] text-slate-400 font-bold ml-1">Verificando referencia...</p>}
                                {adjustModal.refDuplicate && <p className="text-[9px] text-rose-500 font-bold ml-1">⚠️ Esta referencia ya existe. Confirme para continuar.</p>}
                                <p className="text-[9px] text-slate-400 font-bold ml-1">Actual: {adjustModal.invoice.comprobante || '—'}</p>
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setAdjustModal({ isOpen: false, invoice: null, newValor: '', newComprobante: '', saving: false, checkingRef: false, refDuplicate: false })}
                                disabled={adjustModal.saving}
                                className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                disabled={adjustModal.saving || adjustModal.checkingRef}
                                onClick={async () => {
                                    const inv = adjustModal.invoice;
                                    const newValorNum = Number(adjustModal.newValor);
                                    const newRef = adjustModal.newComprobante.trim();
                                    const origRef = (inv.comprobante || '').trim();

                                    if (isNaN(newValorNum) || newValorNum < 0) {
                                        toast.error('El valor debe ser un número mayor o igual a 0.');
                                        return;
                                    }

                                    // Verificar duplicado si el comprobante cambió y no fue confirmado
                                    if (newRef && newRef.toUpperCase() !== origRef.toUpperCase()) {
                                        const confirmedKey = newRef.toUpperCase();
                                        if (!confirmedRefsRef.current.has(confirmedKey)) {
                                            try {
                                                const res = await api.checkReferenceExists(newRef);
                                                if (res.success && res.exists) {
                                                    setAdjustModal(prev => ({ ...prev, refDuplicate: true }));
                                                    setDuplicateAlert({
                                                        reference: newRef,
                                                        sourceType: 'individual',
                                                        invoiceNumber: inv.invoice_number,
                                                        details: res.data
                                                    });
                                                    return;
                                                }
                                            } catch { /* continuar */ }
                                        }
                                    }

                                    setAdjustModal(prev => ({ ...prev, saving: true }));
                                    try {
                                        await api.adjustPayment({
                                            documentId,
                                            invoiceNumber: inv.invoice_number,
                                            newValor: newValorNum,
                                            newComprobante: newRef || undefined,
                                            userId: currentUserId,
                                        });
                                        toast.success(`✅ Recaudo de ${inv.invoice_number} actualizado`);
                                        setAdjustModal({ isOpen: false, invoice: null, newValor: '', newComprobante: '', saving: false, checkingRef: false, refDuplicate: false });
                                        onSaved();
                                    } catch (err: any) {
                                        toast.error(err.message || 'Error al ajustar el recaudo.');
                                        setAdjustModal(prev => ({ ...prev, saving: false }));
                                    }
                                }}
                                className="flex-[1.5] py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/30 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                            >
                                {adjustModal.saving
                                    ? <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75"/></svg> Guardando</>
                                    : '💾 Guardar Cambios'
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Editar valor de factura ─────────────────────────── */}
            {editValueModal.isOpen && editValueModal.invoice && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-100 overflow-hidden">
                        <div className="p-7 space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                                    <svg width="18" height="18" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modificar Valor</p>
                                    <p className="text-sm font-black text-slate-800">{editValueModal.invoice.invoice_number}</p>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                                    {Number(editValueModal.invoice.invoice_value) > 0 ? 'Editar valor existente' : 'Agregar valor (estaba en $0)'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        autoFocus
                                        className="w-full pl-7 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-black text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                        value={editValueModal.inputValue}
                                        onChange={e => setEditValueModal(prev => ({ ...prev, inputValue: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && submitEditValue()}
                                        disabled={editValueModal.saving}
                                    />
                                </div>
                                {Number(editValueModal.invoice.invoice_value) > 0 && (
                                    <p className="text-[9px] text-slate-400 font-bold mt-1 px-1">
                                        Valor actual: {fmtCOP(Number(editValueModal.invoice.invoice_value))}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="px-7 pb-7 flex gap-3">
                            <button
                                onClick={() => setEditValueModal({ isOpen: false, invoice: null, inputValue: '', saving: false })}
                                disabled={editValueModal.saving}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={submitEditValue}
                                disabled={editValueModal.saving || editValueModal.inputValue === ''}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                            >
                                {editValueModal.saving
                                    ? <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75"/></svg> Guardando</>
                                    : 'Guardar'
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConciliacionRouteModal;
