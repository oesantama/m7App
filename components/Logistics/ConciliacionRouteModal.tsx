import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
    banco: string;
    fecha: string;
    saving: boolean;
    items: InvoiceItem[];
    statusUnlocked: boolean;
}

// Fila de consignación grupal
interface ConsignacionRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
    observacion?: string;
    metodo?: MetodoPago;
}

interface SobrecostoRow {
    id: string;
    valor: string;
    nroAprobacion: string;
    fecha: string;
    statusId: string;
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCOP = (v: number | undefined | null) =>
    v != null && v >= 0
        ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
        : '—';

const ENTREGADO_STATUS = ['EST-12', 'ENTREGADO', 'COMPLETED', 'FINALIZADO'];
const DEVUELTO_STATUS  = ['EST-13', 'DEVUELTO'];
const PARCIAL_STATUS   = ['EST-14', 'ENTREGA PARCIAL'];

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
                          : String(inv.invoice_value ?? ''),
        numConsignacion:  inv.comprobante || '',
        metodo:           (inv.forma_pago as MetodoPago) || 'TRANSFERENCIA',
        banco:            inv.banco || '',
        fecha:            inv.fecha_pago
                            ? inv.fecha_pago.slice(0, 10)
                            : new Date().toISOString().slice(0, 10),
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

const LegalizationDialog: React.FC<{
    inv: InvoiceRow;
    form: InvoiceFormState;
    onClose: () => void;
    onUpdate: (patch: Partial<InvoiceFormState>) => void;
    onUpdateItem: (itemId: string | number, rq: number) => void;
    onSave: () => void;
}> = ({ inv, form, onClose, onUpdate, onUpdateItem, onSave }) => {
    const isLegalized   = !!inv.forma_pago;
    const invoiceVal    = Number(inv.invoice_value) || 0;
    const isWarehouseReceived = !!inv.bodega_received_at;

    const { allowed: msAllowed, hint: msHint } = getMsConstraint(inv);
    
    // Si está desbloqueado, todas las opciones están permitidas
    const currentAllowed = form.statusUnlocked ? new Set<EstadoEntrega>(['entregado', 'parcial', 'devolucion', 'repice']) : msAllowed;

    const totalQtyItems = form.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const unitPrice     = totalQtyItems > 0 ? (invoiceVal / totalQtyItems) : 0;
    const returnedVal   = form.items.reduce((s, it) => s + (Number(it.returned_qty || 0) * unitPrice), 0);
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
                            <EstadoPill value="entregado"  active={form.estadoEntrega} label="Entregado"  icon="✅" disabled={isLegalized || !currentAllowed.has('entregado')}  onClick={() => onUpdate({ estadoEntrega: 'entregado',  valor: String(Math.round(invoiceVal)) })} />
                            <EstadoPill value="parcial"    active={form.estadoEntrega} label="Parcial"    icon="📦" disabled={isLegalized || !currentAllowed.has('parcial')}    onClick={() => onUpdate({ estadoEntrega: 'parcial' })} />
                            <EstadoPill value="repice"     active={form.estadoEntrega} label="REPICE"     icon="📋" disabled={isLegalized || !currentAllowed.has('repice')}     onClick={() => onUpdate({ estadoEntrega: 'repice',    valor: '0' })} />
                            <EstadoPill value="devolucion" active={form.estadoEntrega} label="Devolución" icon="🔄" disabled={isLegalized || !currentAllowed.has('devolucion')} onClick={() => onUpdate({ estadoEntrega: 'devolucion', valor: '0' })} />
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
                                            disabled={isLegalized}
                                            onClick={() => onUpdate({ numConsignacion: 'MISMO_CONDUCTOR' })}
                                            className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase transition-all border-2 
                                                ${form.numConsignacion === 'MISMO_CONDUCTOR' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-200 text-blue-500 hover:bg-blue-50'}`}>
                                            Mismo Conductor
                                        </button>
                                        <button 
                                            disabled={isLegalized}
                                            onClick={() => onUpdate({ numConsignacion: 'OTRO_CONDUCTOR' })}
                                            className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase transition-all border-2 
                                                ${form.numConsignacion !== 'MISMO_CONDUCTOR' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-200 text-blue-500 hover:bg-blue-50'}`}>
                                            Otro Conductor
                                        </button>
                                    </div>
                                    <p className="text-[7px] text-blue-400 font-bold mt-2 uppercase text-center italic">
                                        {form.numConsignacion === 'MISMO_CONDUCTOR' 
                                            ? 'ℹ️ Quedará pendiente hasta entrega por el mismo conductor.' 
                                            : 'ℹ️ Factura será liberada para re-asignación a otro vehículo.'}
                                    </p>
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
                                            {form.items.map(it => {
                                                const devVal = (Number(it.returned_qty) || 0) * unitPrice;
                                                return (
                                                    <tr key={it.id} className="bg-white">
                                                        <td className="px-4 py-2.5 font-bold text-slate-700">{it.article_name}</td>
                                                        <td className="px-3 py-2.5 text-center font-black text-slate-400">{it.qty}</td>
                                                        {form.estadoEntrega === 'parcial' && (
                                                            <td className="px-3 py-2.5 bg-amber-50/30 text-center">
                                                                {isLegalized ? (
                                                                    <span className="font-black text-amber-700 text-sm">{it.returned_qty}</span>
                                                                ) : (
                                                                    <input type="number" min={0} max={it.qty} value={it.returned_qty}
                                                                        onChange={e => {
                                                                            const rq = Math.min(Number(it.qty), Math.max(0, Number(e.target.value) || 0));
                                                                            onUpdateItem(it.id, rq);
                                                                            const otherDev = form.items.filter(x => x.id !== it.id).reduce((s, x) => s + (Number(x.returned_qty) || 0) * unitPrice, 0);
                                                                            const finalVal = Math.max(0, invoiceVal - (otherDev + (rq * unitPrice)));
                                                                            onUpdate({ valor: String(Math.round(finalVal)) });
                                                                        }}
                                                                        className="w-16 text-center bg-white border border-amber-200 rounded-lg py-1.5 font-black text-amber-800 outline-none" />
                                                                )}
                                                            </td>
                                                        )}
                                                        <td className="px-4 py-2.5 text-right font-black text-slate-500">
                                                            {form.estadoEntrega === 'parcial' ? (
                                                                <span className="text-rose-500">{fmtCOP(devVal)}</span>
                                                            ) : (
                                                                <span className="text-emerald-600">Completo</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
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
                            {isLegalized ? (
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
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Banco</p>
                                            <p className="text-sm font-black text-slate-700">{form.banco || '—'}</p>
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

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">No. Comprobante / Ref.</label>
                                                    <input type="text" value={form.numConsignacion}
                                                        onChange={e => onUpdate({ numConsignacion: e.target.value })} placeholder="Ref. del pago"
                                                        className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-emerald-500 rounded-2xl text-sm font-black outline-none transition-all placeholder:text-slate-300" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Banco</label>
                                                    <input type="text" value={form.banco}
                                                        onChange={e => onUpdate({ banco: e.target.value })} placeholder="Ej: Bancolombia"
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
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                    <button onClick={onClose} className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all">
                        {isLegalized ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {!isWarehouseReceived && !isLegalized && (
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
    initialSurcharges, initialGroupPayments
}) => {
    const { user } = useAppData();
    const [tab, setTab]         = useState<ModalTab>('individual');
    const [forms, setForms]     = useState<Map<string, InvoiceFormState>>(new Map());
    const [activeDialog, setActiveDialog] = useState<string | null>(null);

    // Estado consignación grupal
    const [consignaciones, setConsignaciones] = useState<ConsignacionRow[]>([{ id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: new Date().toISOString().slice(0, 10), observacion: '', metodo: 'CONSIGNACION' }]);
    const [savingGrupal, setSavingGrupal]     = useState(false);
    const [searchTerm, setSearchTerm]         = useState('');

    // Estado sobrecostos
    const [sobrecostos, setSobrecostos]       = useState<SobrecostoRow[]>([{ id: '1', valor: '', nroAprobacion: '', fecha: new Date().toISOString().slice(0, 10), statusId: 'EST-01' }]);
    const [savingSobrecosto, setSavingSobrecosto] = useState(false);

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
                fecha: p.fecha ? new Date(p.fecha).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                observacion: p.observacion || '',
                metodo: p.metodo as MetodoPago || 'CONSIGNACION'
            })));
        } else {
            setConsignaciones([{ id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: new Date().toISOString().slice(0, 10), observacion: '', metodo: 'CONSIGNACION' }]);
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
            setSobrecostos([{ id: '1', valor: '', nroAprobacion: '', fecha: new Date().toISOString().slice(0, 10), statusId: 'EST-01' }]);
        }

        setTab('individual');
        setActiveDialog(null);
    }, [isOpen, invoices, initialGroupPayments, initialSurcharges]);

    const updateForm = useCallback((invoiceNum: string, patch: Partial<InvoiceFormState>) => {
        setForms(prev => {
            const next = new Map(prev);
            const cur  = next.get(invoiceNum);
            if (cur) next.set(invoiceNum, { ...cur, ...patch });
            return next;
        });
    }, []);

    const updateItem = useCallback((invoiceNum: string, itemId: string | number, returnedQty: number) => {
        setForms(prev => {
            const next = new Map(prev);
            const cur  = next.get(invoiceNum);
            if (cur) {
                const nextItems = cur.items.map(it => it.id === itemId ? { ...it, returned_qty: returnedQty } : it);
                next.set(invoiceNum, { ...cur, items: nextItems });
            }
            return next;
        });
    }, []);

    const handleSaveGrupal = async () => {
        const activePayments = consignaciones.filter(c => Number(String(c.valor).replace(/\D/g, '')) > 0);
        if (activePayments.length === 0) {
            toast.error('Ingrese al menos un valor de consignación válido.');
            return;
        }

        const hasMissingRef = activePayments.some(c => !c.nroAprobacion || c.nroAprobacion.trim() === '');
        if (hasMissingRef) {
            toast.error('La Referencia es obligatoria para cada pago registrado.');
            return;
        }

        setSavingGrupal(true);
        try {
            await api.saveRouteGroupPayments({
                documentId,
                plate: route.plate,
                payments: consignaciones.filter(c => Number(String(c.valor).replace(/\D/g, '')) > 0).map(c => ({
                    id: c.id,
                    valor: Math.floor(Number(String(c.valor).replace(/\D/g, '')) || 0),
                    referencia: c.nroAprobacion,
                    fecha: c.fecha,
                    metodo: c.metodo || 'CONSIGNACION',
                    observacion: c.observacion
                })),
                userId: currentUserId
            });
            toast.success('✅ Pagos de ruta registrados correctamente');
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
                    valor: Math.floor(Number(String(s.valor).replace(/\D/g, '')) || 0),
                    referencia: s.nroAprobacion,
                    fecha: s.fecha,
                    statusId: s.statusId || 'PENDIENTE'
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
                    statusId: 'APROBADO'
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
        if (!searchTerm) return invoices;
        const lower = searchTerm.toLowerCase();
        return invoices.filter(inv => 
            inv.invoice_number.toLowerCase().includes(lower) || 
            inv.customer_name?.toLowerCase().includes(lower)
        );
    }, [invoices, searchTerm]);

    const surchargeStats = useMemo(() => {
        const approved = sobrecostos
            .filter(c => c.statusId === 'APROBADO' || c.statusId === 'EST-02')
            .reduce((s, c) => s + (Math.floor(Number(String(c.valor).replace(/\D/g, '')) || 0)), 0);
        const pending = sobrecostos
            .filter(c => c.statusId === 'PENDIENTE' || c.statusId === 'EST-01' || !c.statusId)
            .reduce((s, c) => s + (Math.floor(Number(String(c.valor).replace(/\D/g, '')) || 0)), 0);
        
        const approvedCount = sobrecostos.filter(c => c.statusId === 'APROBADO' || c.statusId === 'EST-02').length;
        const pendingCount = sobrecostos.filter(c => c.statusId === 'PENDIENTE' || c.statusId === 'EST-01' || !c.statusId).length;

        return { approved, pending, approvedCount, pendingCount };
    }, [sobrecostos]);

    const plateTotals = useMemo(() => {
        const totalValue   = invoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const legalizedIndividual = invoices.filter(i => !!i.forma_pago).reduce((s, i) => s + (Number(i.valor) || 0), 0);
        
        // Sumar consignaciones grupales guardadas
        const legalizedGrupal = (initialGroupPayments || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
        
        // Total Legalizado = Individual + Grupal + Sobrecostos Aprobados
        const totalLegalizado = legalizedIndividual + legalizedGrupal + surchargeStats.approved;
        
        const legalCount   = invoices.filter(i => !!i.forma_pago).length;
        const pendingVal   = Math.max(0, totalValue - totalLegalizado);
        
        return { 
            totalValue, 
            legalizedVal: totalLegalizado, 
            legalizedIndividual,
            legalizedGrupal,
            legalCount, 
            pendingVal, 
            total: invoices.length 
        };
    }, [invoices, surchargeStats, initialGroupPayments]);

    const pct = plateTotals.total > 0 ? Math.round((plateTotals.legalCount / plateTotals.total) * 100) : 0;

    const handleSave = async (inv: InvoiceRow) => {
        const form = forms.get(inv.invoice_number);
        if (!form) return;
        const esDevolucion = form.estadoEntrega === 'devolucion';
        const valorNum = Number(form.valor);
        const invoiceVal = Number(inv.invoice_value) || 0;

        updateForm(inv.invoice_number, { saving: true });
        try {
            await api.saveConciliation({
                documentId,
                invoiceNumber:  inv.invoice_number,
                valor:          esDevolucion ? 0 : valorNum,
                banco:          form.banco || undefined,
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
                itemsReturned:  form.estadoEntrega === 'parcial' ? form.items.filter(it => (Number(it.returned_qty) || 0) > 0) : [],
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

                        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 flex-1 max-w-full">
                            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-emerald-500/10 border border-emerald-100/50">
                                <p className="text-[7px] font-black text-emerald-600 uppercase tracking-widest mb-1 text-center">Legalización Individual</p>
                                <p className="text-sm font-black text-emerald-800 leading-none text-center">{fmtCOP(plateTotals.legalizedIndividual)}</p>
                                <p className="text-[7px] text-emerald-600/60 font-bold mt-1.5 text-center">{plateTotals.legalCount} Facts</p>
                            </div>
                            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-violet-500/10 border border-violet-100/50">
                                <p className="text-[7px] font-black text-violet-600 uppercase tracking-widest mb-1 text-center">Legalización Grupal</p>
                                <p className="text-sm font-black text-violet-800 leading-none text-center">{fmtCOP(plateTotals.legalizedGrupal)}</p>
                                <p className="text-[7px] text-violet-600/60 font-bold mt-1.5 text-center">Consignado Ruta</p>
                            </div>
                            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-blue-500/10 border border-blue-100/50">
                                <p className="text-[7px] font-black text-blue-600 uppercase tracking-widest mb-1 text-center">Total Legalizado</p>
                                <p className="text-sm font-black text-blue-800 leading-none text-center">{fmtCOP(plateTotals.legalizedVal)}</p>
                                <p className="text-[7px] text-blue-600/60 font-bold mt-1.5 text-center">Acumulado Total</p>
                            </div>
                            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-amber-500/10 border border-amber-100/50">
                                <p className="text-[7px] font-black text-amber-600 uppercase tracking-widest mb-1 text-center">Pendiente</p>
                                <p className="text-sm font-black text-amber-800 leading-none text-center">{fmtCOP(plateTotals.pendingVal)}</p>
                                <p className="text-[7px] text-amber-600/60 font-bold mt-1.5 text-center">Falta Cobrar</p>
                            </div>
                            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-slate-500/10 border border-slate-100">
                                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1 text-center">Total Placa</p>
                                <p className="text-sm font-black text-slate-800 leading-none text-center">{fmtCOP(plateTotals.totalValue)}</p>
                                <p className="text-[7px] text-slate-400 font-bold mt-1.5 text-center">{plateTotals.total} Facts</p>
                            </div>
                            <div className="bg-white rounded-2xl px-4 py-2.5 shadow-lg shadow-rose-500/10 border border-rose-100/50">
                                <p className="text-[7px] font-black text-rose-600 uppercase tracking-widest mb-1 text-center font-bold">Resumen Sobrecostos</p>
                                <div className="space-y-1.5 mt-2">
                                    <div className="flex justify-between items-center bg-amber-50/50 px-2 py-1 rounded-lg">
                                        <p className="text-[7px] font-black text-amber-600 uppercase tracking-tight">Pendiente:</p>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-700 leading-none">{fmtCOP(surchargeStats.pending)}</p>
                                            <p className="text-[6px] font-bold text-slate-400 uppercase mt-0.5">Cant: {surchargeStats.pendingCount}</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center bg-emerald-50/50 px-2 py-1 rounded-lg">
                                        <p className="text-[7px] font-black text-emerald-600 uppercase tracking-tight">Aprobados:</p>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-700 leading-none">{fmtCOP(surchargeStats.approved)}</p>
                                            <p className="text-[6px] font-bold text-slate-400 uppercase mt-0.5">Cant: {surchargeStats.approvedCount}</p>
                                        </div>
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

                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Avance de Legalización</span>
                            <span className="text-[9px] font-black text-emerald-600">{plateTotals.legalCount}/{plateTotals.total} · {pct}%</span>
                        </div>
                        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
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
                                                {msBadge && <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full ${msBadge.bg} ${msBadge.text}`}>🏢 MS: {inv.mastersuite_estado}</span>}
                                                {(inv.item_status === 'repice' || inv.item_status === 'REPICE') && (
                                                    <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">📋 REPICE</span>
                                                )}
                                            </div>
                                            {inv.customer_name && <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>}
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] font-bold text-slate-600">Factura: {fmtCOP(invoiceVal)}</span>
                                                {isLegalized && <span className="text-[9px] font-black text-emerald-600">Recaudado: {fmtCOP(inv.valor)}</span>}
                                            </div>
                                        </div>
                                        <button onClick={() => setActiveDialog(inv.invoice_number)} className={`shrink-0 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all ${isLegalized ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-900/20'}`}>
                                            {isLegalized ? 'Ver Detalle' : 'Legalizar'}
                                        </button>
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
                                </div>

                                <div className="space-y-3">
                                    {consignaciones.map((c, idx) => (
                                             <div key={c.id} className={`grid grid-cols-12 gap-3 p-3 rounded-2xl border shadow-sm relative group transition-all
                                                ${String(c.id).startsWith('temp-') ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-80'}`}>
                                                <div className="col-span-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Valor</p>
                                                    <input type="text" value={c.valor} disabled={!String(c.id).startsWith('temp-')}
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
                                                    <input type="text" value={c.nroAprobacion} disabled={!String(c.id).startsWith('temp-')}
                                                        onChange={e => {
                                                            const next = [...consignaciones];
                                                            next[idx].nroAprobacion = e.target.value;
                                                            setConsignaciones(next);
                                                        }}
                                                        placeholder="N°" className="w-full bg-white px-2 py-2 rounded-xl text-[10px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent disabled:bg-transparent" />
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Método</p>
                                                    <select value={c.metodo || 'CONSIGNACION'} disabled={!String(c.id).startsWith('temp-')}
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
                                                    <input type="date" value={c.fecha} disabled={!String(c.id).startsWith('temp-')}
                                                        onChange={e => {
                                                            const next = [...consignaciones];
                                                            next[idx].fecha = e.target.value;
                                                            setConsignaciones(next);
                                                        }}
                                                        className="w-full bg-white px-2 py-2 rounded-xl text-[10px] font-black text-slate-700 outline-none focus:border-violet-300 border border-transparent disabled:bg-transparent" />
                                                </div>
                                                <div className="col-span-4">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Observación</p>
                                                    <input type="text" value={c.observacion || ''} disabled={!String(c.id).startsWith('temp-')}
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

                                <button onClick={() => setConsignaciones([...consignaciones, { id: `temp-${Date.now()}`, valor: '', nroAprobacion: '', fecha: new Date().toISOString().slice(0, 10), observacion: '', metodo: 'CONSIGNACION' }])}
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
                                        const isPending  = !isApproved;

                                        return (
                                            <div key={s.id} className={`grid grid-cols-12 gap-3 p-3 rounded-2xl border-2 shadow-sm relative group transition-all
                                                ${isApproved ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                                                
                                                <div className="col-span-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Valor</p>
                                                    <input type="text" value={s.valor} disabled={isApproved}
                                                        onChange={e => {
                                                            const val = e.target.value.replace(/\D/g, '');
                                                            const fmt = val ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(val)) : '';
                                                            const next = [...sobrecostos];
                                                            next[idx].valor = fmt;
                                                            setSobrecostos(next);
                                                        }}
                                                        placeholder="$ 0.00" className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>
                                                <div className="col-span-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Referencia / NIT</p>
                                                    <input type="text" value={s.nroAprobacion} disabled={isApproved}
                                                        onChange={e => {
                                                            const next = [...sobrecostos];
                                                            next[idx].nroAprobacion = e.target.value;
                                                            setSobrecostos(next);
                                                        }}
                                                        placeholder="Obligatorio" className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>
                                                <div className="col-span-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Fecha</p>
                                                    <input type="date" value={s.fecha} disabled={isApproved}
                                                        onChange={e => {
                                                            const next = [...sobrecostos];
                                                            next[idx].fecha = e.target.value;
                                                            setSobrecostos(next);
                                                        }}
                                                        className={`w-full px-3 py-2 rounded-xl text-[11px] font-black outline-none border border-transparent
                                                            ${isApproved ? 'bg-transparent text-blue-900' : 'bg-slate-50 text-slate-700 focus:border-orange-300'}`} />
                                                </div>
                                                <div className="col-span-3 flex flex-col justify-end">
                                                    {isApproved ? (
                                                        <span className="bg-blue-600 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest">Aprobado</span>
                                                    ) : (
                                                        <button onClick={() => handleApproveSurcharge(s.id)}
                                                            className="bg-emerald-500 hover:bg-emerald-600 text-white text-[7px] font-black px-2 py-2 rounded-xl text-center uppercase tracking-widest shadow-sm shadow-emerald-200">
                                                            ✅ Aprobar
                                                        </button>
                                                    )}
                                                </div>

                                                {isPending && (
                                                    <button onClick={() => setSobrecostos(sobrecostos.filter(x => x.id !== s.id))}
                                                        className="absolute -right-2 -top-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-100">
                                                        <Icons.X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <button onClick={() => setSobrecostos([...sobrecostos, { id: String(Date.now()), valor: '', nroAprobacion: '', fecha: new Date().toISOString().slice(0, 10), statusId: 'EST-01' }])}
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
                        onUpdateItem={(itemId, rq) => updateItem(inv.invoice_number, itemId, rq)}
                        onSave={() => handleSave(inv)}
                    />
                );
            })()}
        </div>
    );
};

export default ConciliacionRouteModal;
