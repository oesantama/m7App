
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

const MODE_INFO = {
    FULL:    { label: '✅ Completa',  desc: 'Se entregó todo al cliente.',                          color: 'emerald' },
    PARTIAL: { label: '⚠️ Parcial',   desc: 'Parte entregada — el resto regresa a bodega.',         color: 'amber'   },
    RETURN:  { label: '🔄 Devolver',  desc: 'Nada entregado — toda la mercancía regresa a bodega.', color: 'rose'    },
} as const;

const CustomerDeliveryModal: React.FC<CustomerDeliveryModalProps> = ({
    isOpen, onClose, invoice,
    deliveryType, setDeliveryType,
    deliveryItems, setDeliveryItems,
    deliveryReturnReason, setDeliveryReturnReason,
    deliveryNotes, setDeliveryNotes,
    isConfirmingDelivery, handleConfirmDelivery
}) => {
    if (!isOpen) return null;

    const mode = MODE_INFO[deliveryType];
    const needsReason = deliveryType !== 'FULL';
    // Use returnReason as the single observations field (maps to both notes+returnReason)
    const observations = deliveryReturnReason || deliveryNotes;
    const setObservations = (val: string) => {
        setDeliveryReturnReason(val);
        setDeliveryNotes(val);
    };

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
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            {(['FULL', 'PARTIAL', 'RETURN'] as const).map(opt => {
                                const m = MODE_INFO[opt];
                                const active = deliveryType === opt;
                                const colorMap = { emerald: active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-emerald-400', amber: active ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-400', rose: active ? 'bg-rose-500 text-white border-rose-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-400' };
                                return (
                                    <button key={opt} onClick={() => setDeliveryType(opt)}
                                        className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2 ${colorMap[m.color]}`}>
                                        {m.label}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Descripción del modo */}
                        <p className={`text-[9px] font-bold px-3 py-1.5 rounded-lg ${
                            deliveryType === 'FULL' ? 'bg-emerald-50 text-emerald-700' :
                            deliveryType === 'PARTIAL' ? 'bg-amber-50 text-amber-700' :
                            'bg-rose-50 text-rose-700'
                        }`}>{mode.desc}</p>
                    </div>

                    {/* ARTÍCULOS */}
                    {deliveryItems.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                Artículos
                                {deliveryType !== 'FULL' && (
                                    <span className="ml-1 text-rose-500 normal-case font-bold">
                                        — indique cuántas unidades NO entregó
                                    </span>
                                )}
                            </p>
                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {deliveryItems.map((item, i) => {
                                    const total = Number(item.quantityDelivered) || 0;
                                    const noEntregadas = Number(item.quantityReturned) || 0;
                                    const entregadas = total - noEntregadas;
                                    return (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-900 truncate">{item.articleName || item.sku}</p>
                                                <p className="text-[8px] text-slate-400 font-bold uppercase">
                                                    {item.unit} · Total: {total}
                                                    {deliveryType !== 'FULL' && (
                                                        <span className="ml-2 text-emerald-600">Entregadas: {entregadas}</span>
                                                    )}
                                                </p>
                                            </div>
                                            {deliveryType !== 'FULL' && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <p className="text-[8px] text-rose-500 uppercase font-black">No entregadas:</p>
                                                    <input
                                                        type="number" min={0} max={total}
                                                        value={item.quantityReturned}
                                                        onChange={e => {
                                                            const updated = [...deliveryItems];
                                                            updated[i] = { ...updated[i], quantityReturned: Math.min(Number(e.target.value), total) };
                                                            setDeliveryItems(updated);
                                                        }}
                                                        className="w-14 text-center border border-rose-200 rounded-lg text-[10px] font-black text-rose-600 py-1 outline-none focus:border-rose-500"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* OBSERVACIONES (único campo: reemplaza motivo + notas) */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                            {needsReason ? 'Motivo de devolución *' : 'Observaciones (opcional)'}
                        </p>
                        <textarea
                            rows={2}
                            value={observations}
                            onChange={e => setObservations(e.target.value)}
                            placeholder={needsReason
                                ? 'Ej: Cliente ausente, rechazo de mercancía, dirección incorrecta...'
                                : 'Ej: Cliente firmó conforme, entrega en portería...'}
                            className={`w-full px-3 py-2 border rounded-xl text-[10px] outline-none transition-all resize-none ${
                                needsReason ? 'border-rose-200 focus:border-rose-500' : 'border-slate-200 focus:border-emerald-500'
                            }`}
                        />
                    </div>
                </div>

                {/* FOOTER */}
                <div className="p-5 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmDelivery}
                        disabled={isConfirmingDelivery || (needsReason && !observations.trim())}
                        className={`flex-1 py-3 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                            deliveryType === 'FULL'    ? 'bg-emerald-600 hover:bg-emerald-700' :
                            deliveryType === 'PARTIAL' ? 'bg-amber-500 hover:bg-amber-600'    :
                                                         'bg-rose-600 hover:bg-rose-700'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isConfirmingDelivery && <Icons.Loader className="w-3 h-3 animate-spin" />}
                        {deliveryType === 'FULL'    ? '✅ Confirmar Entrega'     :
                         deliveryType === 'PARTIAL' ? '⚠️ Guardar Entrega Parcial' :
                                                      '🔄 Registrar Devolución'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerDeliveryModal;
