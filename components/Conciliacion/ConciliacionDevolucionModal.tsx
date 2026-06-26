import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface InvoiceRow {
    invoice_number: string;
    customer_name?: string;
    city?: string;
    invoice_value?: number;
    total_qty?: number;
    items_returned?: any[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    invoice: InvoiceRow | null;
    documentId: string;
    currentUserId: string;
    vehiclePlate?: string;
    conductorId?: string;
    conductorName?: string;
    onSaved: (invoiceNumber: string) => void;
}

const fmtCOP = (v: number | undefined | null) =>
    v != null && v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '—';

const ConciliacionDevolucionModal: React.FC<Props> = ({
    isOpen, onClose, invoice, documentId,
    currentUserId, vehiclePlate, conductorId, conductorName, onSaved,
}) => {
    const [valor, setValor]     = useState('');
    const [obs, setObs]         = useState('');
    const [saving, setSaving]   = useState(false);

    useEffect(() => {
        if (isOpen && invoice) {
            setValor(invoice.invoice_value != null ? String(invoice.invoice_value) : '');
            setObs('');
        }
    }, [isOpen, invoice]);

    if (!isOpen || !invoice) return null;

    const canSave = Number(valor) >= 0;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await api.saveConciliation({
                documentId,
                invoiceNumber:  invoice.invoice_number,
                esDevolucion:   true,
                valor:          Number(valor),
                comprobante:    obs || 'DEVOLUCION',
                fechaPago:      new Date().toISOString().slice(0, 10),
                formaPago:      'DEVOLUCION' as any,
                conciliadoPor:  currentUserId,
                vehiclePlate,
                conductorId,
                conductorName,
                estadoEntrega:  'devolucion',
            });
            toast.success(`Devolución registrada — Factura ${invoice.invoice_number}`);
            onSaved(invoice.invoice_number);
            onClose();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[960] bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full sm:max-w-sm rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250 overflow-hidden flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="bg-gradient-to-r from-rose-900 to-rose-800 px-6 pt-5 pb-5 rounded-t-[2rem]">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[9px] font-black text-rose-300 uppercase tracking-[0.2em] mb-0.5">Confirmar Devolución</p>
                            <h3 className="text-lg font-black text-white tracking-tight">{invoice.invoice_number}</h3>
                            {invoice.customer_name && (
                                <p className="text-[10px] text-rose-200 mt-0.5 truncate">{invoice.customer_name}</p>
                            )}
                        </div>
                        <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                            <Icons.X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                    {invoice.city && (
                        <div className="mt-2.5 flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-1.5">
                            <Icons.MapPin className="w-3 h-3 text-rose-300 flex-shrink-0" />
                            <span className="text-[10px] text-rose-200">{invoice.city}</span>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">

                    {/* Valor de factura referencia */}
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                        <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2">Referencia de Factura</p>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-600">Valor original</span>
                            <span className="text-sm font-black text-rose-700">{fmtCOP(invoice.invoice_value)}</span>
                        </div>
                        {invoice.total_qty != null && (
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] font-bold text-slate-600">Cantidad</span>
                                <span className="text-[11px] font-black text-slate-700">{invoice.total_qty} uds</span>
                            </div>
                        )}
                    </div>

                    {/* Valor a registrar */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            Valor de la Devolución <span className="text-slate-400 font-medium">(modifique si es distinto)</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                            <input
                                type="number" min={0} step="1"
                                value={valor}
                                onChange={e => setValor(e.target.value)}
                                placeholder="0"
                                className="w-full pl-7 pr-4 py-3 border border-slate-200 focus:border-rose-400 bg-slate-50 focus:bg-white rounded-2xl text-sm font-black text-slate-900 outline-none transition-all"
                            />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1">Ingrese 0 si no hay valor a cobrar por esta devolución.</p>
                    </div>

                    {/* Observaciones */}
                    <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            Observaciones / Motivo
                        </label>
                        <textarea
                            value={obs}
                            onChange={e => setObs(e.target.value)}
                            rows={3}
                            placeholder="Ej: Mercancía dañada, cliente no encontrado, rechazo de pedido..."
                            className="w-full px-4 py-3 border border-slate-200 focus:border-rose-400 bg-slate-50 focus:bg-white rounded-2xl text-xs text-slate-700 outline-none transition-all resize-none"
                        />
                    </div>

                    {/* Aviso */}
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <Icons.AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-800 font-semibold leading-relaxed">
                            Esta factura quedará marcada como <strong>devolución</strong>. Recuerde registrar la salida a proveedor en el módulo correspondiente.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-2xl text-slate-500 font-black text-[9px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave || saving}
                        className={`flex-[2] py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2
                            ${canSave && !saving
                                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/20'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                        {saving && <Icons.Loader className="w-3.5 h-3.5 animate-spin" />}
                        {saving ? 'Guardando...' : '🔄 Confirmar Devolución'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConciliacionDevolucionModal;
