import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

type FormaPago = 'TRANSFERENCIA' | 'CONSIGNACION';

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
    forma_pago?: FormaPago;
    numero_cheque?: string;
    es_devolucion?: boolean;
    conciliado_por?: string;
    conductor_id?: string;
    conductor_name?: string;
    vehicle_plate?: string;
    conciliado_at?: string;
    conciliado_por_nombre?: string;
    invoice_value?: number;
    invoice_banco?: string;
    un_code?: string;
    invoice_metodo_pago?: string;
}

interface ConciliacionModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: InvoiceRow;
    documentId: string;
    currentUserId: string;
    vehiclePlate?: string;
    conductorId?: string;
    conductorName?: string;
    onSaved: (invoiceNumber: string) => void;
    isReadOnly?: boolean;
}

const FORMAS_PAGO: { value: FormaPago; label: string; icon: string; color: string }[] = [
    { value: 'TRANSFERENCIA', label: 'Transferencia', icon: '📱', color: 'blue'   },
    { value: 'CONSIGNACION',  label: 'Consignación',  icon: '🏦', color: 'violet' },
];

const COLOR_MAP: Record<string, { active: string; inactive: string }> = {
    blue:   { active: 'bg-blue-500 border-blue-500 text-white',     inactive: 'border-slate-200 text-slate-600 hover:border-blue-400'   },
    violet: { active: 'bg-violet-600 border-violet-600 text-white', inactive: 'border-slate-200 text-slate-600 hover:border-violet-400' },
};

const fmtCOP = (v: number | undefined | null) =>
    v != null && v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '—';

const ConciliacionModal: React.FC<ConciliacionModalProps> = ({
    isOpen, onClose, invoice, documentId,
    currentUserId, vehiclePlate, conductorId, conductorName, onSaved,
    isReadOnly = false
}) => {
    const [formaPago, setFormaPago]     = useState<FormaPago | ''>('');
    const [valor, setValor]             = useState('');
    const [comprobante, setComprobante] = useState('');
    const [fechaPago, setFechaPago]     = useState('');
    const [numeroCheque, setNumeroCheque] = useState('');
    const [saving, setSaving]           = useState(false);

    // Precargar datos: si ya está conciliado usa esos valores,
    // si es nueva conciliación pre-carga desde los datos de pago de la factura
    useEffect(() => {
        if (isOpen && invoice) {
            const yaConciliado = !!invoice.conciliation_id;
            if (yaConciliado) {
                setFormaPago((invoice.forma_pago as FormaPago) || '');
                setValor(invoice.valor != null ? String(invoice.valor) : '');
                setComprobante(invoice.comprobante || '');
                setFechaPago(invoice.fecha_pago ? invoice.fecha_pago.slice(0, 10) : new Date().toISOString().slice(0, 10));
                setNumeroCheque(invoice.numero_cheque || '');
            } else {
                // Nueva conciliación — pre-cargar desde datos de pago de la factura
                setFormaPago('TRANSFERENCIA');
                setValor(invoice.invoice_value != null ? String(invoice.invoice_value) : '');
                setComprobante('');
                setFechaPago(new Date().toISOString().slice(0, 10));
                setNumeroCheque('');
            }
        }
    }, [isOpen, invoice]);

    if (!isOpen) return null;

    const needsBanco = true; // Siempre aplica para transferencia y consignación
    const canSave    = formaPago !== '' && valor.trim() !== '' && Number(valor) > 0;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await api.saveConciliation({
                documentId,
                invoiceNumber:  invoice.invoice_number,
                valor:          Number(valor),
                comprobante:    comprobante || undefined,
                fechaPago:      fechaPago || undefined,
                formaPago:      formaPago as FormaPago,
                numeroCheque:   numeroCheque || undefined,
                esDevolucion:   false,
                conciliadoPor:  currentUserId,
                vehiclePlate,
                conductorId,
                conductorName,
            });
            toast.success(`Factura ${invoice.invoice_number} conciliada`);
            onSaved(invoice.invoice_number);
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[950] bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250 overflow-hidden flex flex-col max-h-[95vh]">

                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-emerald-950 px-6 pt-6 pb-5 rounded-t-[2rem]">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-0.5">Conciliar Factura</p>
                            <h3 className="text-xl font-black text-white tracking-tight">{invoice.invoice_number}</h3>
                            {invoice.customer_name && (
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{invoice.customer_name}</p>
                            )}
                        </div>
                        <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all flex-shrink-0">
                            <Icons.X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                    {isReadOnly && (
                        <div className="mt-2 flex items-center gap-1.5 bg-emerald-500/20 w-fit px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <Icons.Eye className="w-2.5 h-2.5 text-emerald-400" />
                            <span className="text-[8px] font-black text-emerald-300 uppercase tracking-widest">Modo Consulta</span>
                        </div>
                    )}

                    {/* Datos de entrega */}
                    {(invoice.city || invoice.address) && (
                        <div className="mt-3 flex items-start gap-2 bg-white/10 rounded-xl px-3 py-2">
                            <Icons.MapPin className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <span className="text-[10px] text-slate-300 leading-tight">
                                {[invoice.city, invoice.address].filter(Boolean).join(' — ')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">

                    {/* Información de Planilla (Nueva sección solicitada) */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Datos de Planilla Importada</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white rounded-xl p-2 border border-slate-100 shadow-sm">
                                <p className="text-[7px] font-black text-slate-400 uppercase leading-none mb-1">UN_CODE</p>
                                <p className="text-[10px] font-black text-slate-900 truncate">{invoice.un_code || '—'}</p>
                            </div>
                            <div className="bg-white rounded-xl p-2 border border-slate-100 shadow-sm">
                                <p className="text-[7px] font-black text-slate-400 uppercase leading-none mb-1">Método Pago</p>
                                <p className="text-[10px] font-black text-slate-900 truncate">{invoice.invoice_metodo_pago || '—'}</p>
                            </div>
                            <div className="bg-white rounded-xl p-2 border border-slate-100 shadow-sm">
                                <p className="text-[7px] font-black text-slate-400 uppercase leading-none mb-1">Valor Planilla</p>
                                <p className="text-[10px] font-black text-emerald-700">{fmtCOP(invoice.invoice_value)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Forma de pago */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                            Forma de Pago <span className="text-rose-500">*</span>
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {FORMAS_PAGO.map(fp => {
                                const active = formaPago === fp.value;
                                return (
                                    <button
                                        key={fp.value}
                                        onClick={() => !isReadOnly && setFormaPago(fp.value)}
                                        disabled={isReadOnly}
                                        className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all text-[9px] font-black uppercase tracking-wide
                                            ${isReadOnly && active ? 'bg-slate-100 border-slate-300 text-slate-500' : COLOR_MAP[fp.color][active ? 'active' : 'inactive']}`}
                                    >
                                        <span className="text-2xl">{fp.icon}</span>
                                        {fp.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Valor */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            Valor Recaudado <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                            <input
                                type="number" min={0} step="0.01"
                                value={valor}
                                onChange={e => setValor(e.target.value)}
                                readOnly={isReadOnly}
                                placeholder="0"
                                className={`w-full pl-7 pr-4 py-3 border focus:border-emerald-500 focus:bg-white rounded-2xl text-sm font-black outline-none transition-all
                                    ${isReadOnly ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                            />
                        </div>
                    </div>


                    {/* Comprobante */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            No. Comprobante / Referencia
                        </label>
                        <input
                            type="text"
                            value={comprobante}
                            onChange={e => setComprobante(e.target.value)}
                            readOnly={isReadOnly}
                            placeholder="Ej: 0012345678, REF-987..."
                            className={`w-full px-4 py-3 border focus:border-slate-500 focus:bg-white rounded-2xl text-sm outline-none transition-all
                                ${isReadOnly ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                        />
                    </div>

                    {/* Fecha de pago */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha de Pago</label>
                        <input
                            type="date"
                            value={fechaPago}
                            onChange={e => setFechaPago(e.target.value)}
                            readOnly={isReadOnly}
                            className={`w-full px-4 py-3 border focus:border-slate-500 focus:bg-white rounded-2xl text-sm outline-none transition-all
                                ${isReadOnly ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-5 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-5 py-3.5 rounded-2xl text-slate-500 font-black text-[9px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">
                        {isReadOnly ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {!isReadOnly && (
                        <button
                            onClick={handleSave}
                            disabled={!canSave || saving}
                            className={`flex-[2] py-3.5 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2
                                ${canSave && !saving
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                        >
                            {saving && <Icons.Loader className="w-3.5 h-3.5 animate-spin" />}
                            {saving ? 'Guardando...' : '✅ Guardar Conciliación'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConciliacionModal;
