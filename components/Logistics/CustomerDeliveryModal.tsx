
import React from 'react';
import { Icons } from '../../constants';

interface CustomerDeliveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    deliveryType: 'FULL' | 'PARTIAL' | 'RETURN';
    setDeliveryType: (type: 'FULL' | 'PARTIAL' | 'RETURN') => void;
    deliveryItems: any[];
    setDeliveryItems: (items: any[]) => void;
    deliveryReturnReason: string;
    setDeliveryReturnReason: (reason: string) => void;
    deliveryNotes: string;
    setDeliveryNotes: (notes: string) => void;
    deliveryPassword: string;
    setDeliveryPassword: (pass: string) => void;
    isConfirmingDelivery: boolean;
    handleConfirmDelivery: () => void;
}

const CustomerDeliveryModal: React.FC<CustomerDeliveryModalProps> = ({
    isOpen,
    onClose,
    invoice,
    deliveryType,
    setDeliveryType,
    deliveryItems,
    setDeliveryItems,
    deliveryReturnReason,
    setDeliveryReturnReason,
    deliveryNotes,
    setDeliveryNotes,
    deliveryPassword,
    setDeliveryPassword,
    isConfirmingDelivery,
    handleConfirmDelivery
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[900] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
                {/* HEADER */}
                <div className="p-5 bg-gradient-to-r from-slate-900 to-emerald-950 rounded-t-[2rem]">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">Entregar al Cliente</h3>
                            <p className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5">
                                Factura #{invoice?.invoiceNumber || invoice?.id}
                            </p>
                        </div>
                        <button onClick={onClose} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                            <Icons.X className="w-3.5 h-3.5 text-white" />
                        </button>
                    </div>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                    {/* TIPO DE ENTREGA */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Tipo de Entrega</p>
                        <div className="grid grid-cols-3 gap-2">
                            {(['FULL', 'PARTIAL', 'RETURN'] as const).map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => setDeliveryType(opt)}
                                    className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2 ${
                                        deliveryType === opt
                                            ? opt === 'FULL' ? 'bg-emerald-500 text-white border-emerald-500'
                                            : opt === 'PARTIAL' ? 'bg-amber-500 text-white border-amber-500'
                                            : 'bg-rose-500 text-white border-rose-500'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'
                                    }`}
                                >
                                    {opt === 'FULL' ? '✅ Completa' : opt === 'PARTIAL' ? '⚠️ Parcial' : '🔄 Devolver'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ITEMS */}
                    {deliveryItems.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                Artículos {deliveryType !== 'FULL' && <span className="text-rose-500">– Ajusta cantidades devueltas</span>}
                            </p>
                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {deliveryItems.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black text-slate-900 truncate">{item.articleName || item.sku}</p>
                                            <p className="text-[8px] text-slate-400 font-bold uppercase">{item.unit} • Cant: {item.quantityDelivered}</p>
                                        </div>
                                        {deliveryType !== 'FULL' && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <p className="text-[8px] text-slate-400 uppercase font-bold">Dev:</p>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={item.quantityDelivered}
                                                    value={item.quantityReturned}
                                                    onChange={e => {
                                                        const updated = [...deliveryItems];
                                                        updated[i] = { ...updated[i], quantityReturned: Number(e.target.value) };
                                                        setDeliveryItems(updated);
                                                    }}
                                                    className="w-14 text-center border border-rose-200 rounded-lg text-[10px] font-black text-rose-600 py-1 outline-none focus:border-rose-500"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* RAZÓN DEVOLUCIÓN */}
                    {deliveryType !== 'FULL' && (
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Motivo de Devolución</p>
                            <input
                                type="text"
                                value={deliveryReturnReason}
                                onChange={e => setDeliveryReturnReason(e.target.value)}
                                placeholder="Ej: Cliente ausente, rechazo de mercancía..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-rose-500 transition-all"
                            />
                        </div>
                    )}

                    {/* NOTAS */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Notas (opcional)</p>
                        <textarea
                            rows={2}
                            value={deliveryNotes}
                            onChange={e => setDeliveryNotes(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500 transition-all resize-none"
                        />
                    </div>

                    {/* CONTRASEÑA CONDUCTOR */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Contraseña del Conductor</p>
                        <input
                            type="password"
                            value={deliveryPassword}
                            onChange={e => setDeliveryPassword(e.target.value)}
                            placeholder="Ingresa tu contraseña para confirmar"
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500 transition-all"
                        />
                    </div>
                </div>

                {/* FOOTER */}
                <div className="p-5 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmDelivery}
                        disabled={isConfirmingDelivery}
                        className={`flex-1 py-3 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            deliveryType === 'FULL' ? 'bg-emerald-600 hover:bg-emerald-700'
                            : deliveryType === 'PARTIAL' ? 'bg-amber-500 hover:bg-amber-600'
                            : 'bg-rose-600 hover:bg-rose-700'
                        } disabled:opacity-50 disabled:cursor-wait`}
                    >
                        {isConfirmingDelivery && <Icons.Loader className="w-3 h-3 animate-spin" />}
                        {deliveryType === 'FULL' ? '✅ Confirmar Entrega' : deliveryType === 'PARTIAL' ? '⚠️ Guardar Parcial' : '🔄 Registrar Devolución'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerDeliveryModal;
