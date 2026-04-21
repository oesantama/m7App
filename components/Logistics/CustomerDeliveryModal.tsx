
import React from 'react';
import { Icons } from '../../constants';

type DeliveryType = 'FULL' | 'PARTIAL' | 'RETURN' | 'REPICE';
type RepiceDestination = 'BODEGA' | 'SAME_PLATE';

interface CustomerDeliveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    deliveryType: DeliveryType;
    setDeliveryType: (type: DeliveryType) => void;
    deliveryItems: any[];
    setDeliveryItems: (items: any[]) => void;
    deliveryReturnReason: string;
    setDeliveryReturnReason: (reason: string) => void;
    deliveryNotes: string;
    setDeliveryNotes: (notes: string) => void;
    deliveryPassword: string;
    setDeliveryPassword: (pass: string) => void;
    repiceDestination: RepiceDestination;
    setRepiceDestination: (dest: RepiceDestination) => void;
    isConfirmingDelivery: boolean;
    handleConfirmDelivery: () => void;
}

const MODE_INFO: Record<DeliveryType, { label: string; desc: string; color: 'emerald' | 'amber' | 'rose' | 'violet' }> = {
    FULL:    { label: '✅ Completa',  desc: 'Se entregó todo al cliente.',                          color: 'emerald' },
    PARTIAL: { label: '⚠️ Parcial',   desc: 'Parte entregada — el resto regresa a bodega.',         color: 'amber'   },
    RETURN:  { label: '🔄 Devolver',  desc: 'Nada entregado — toda la mercancía regresa a bodega.', color: 'rose'    },
    REPICE:  { label: '🔁 Repice',   desc: 'No recibido — se reasigna o devuelve según destino.',  color: 'violet'  },
} as const;

const COLOR_MAP = {
    emerald: { active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'bg-slate-50 text-slate-600 border-slate-200 hover:border-emerald-400' },
    amber:   { active: 'bg-amber-500 text-white border-amber-500',     inactive: 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-400'   },
    rose:    { active: 'bg-rose-500 text-white border-rose-500',       inactive: 'bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-400'    },
    violet:  { active: 'bg-violet-600 text-white border-violet-600',   inactive: 'bg-slate-50 text-slate-600 border-slate-200 hover:border-violet-400'  },
};

const CustomerDeliveryModal: React.FC<CustomerDeliveryModalProps> = ({
    isOpen, onClose, invoice,
    deliveryType, setDeliveryType,
    deliveryItems, setDeliveryItems,
    deliveryReturnReason, setDeliveryReturnReason,
    deliveryNotes, setDeliveryNotes,
    repiceDestination, setRepiceDestination,
    isConfirmingDelivery, handleConfirmDelivery
}) => {
    if (!isOpen) return null;

    const mode = MODE_INFO[deliveryType];
    const needsReason = deliveryType !== 'FULL';
    const observations = deliveryReturnReason || deliveryNotes;
    const setObservations = (val: string) => {
        setDeliveryReturnReason(val);
        setDeliveryNotes(val);
    };

    const confirmDisabled = isConfirmingDelivery || (needsReason && !observations.trim());

    const confirmLabel =
        deliveryType === 'FULL'    ? '✅ Confirmar Entrega'        :
        deliveryType === 'PARTIAL' ? '⚠️ Guardar Entrega Parcial'  :
        deliveryType === 'REPICE' ? '🔁 Registrar Repice'        :
                                     '🔄 Registrar Devolución';

    const confirmBtnColor =
        deliveryType === 'FULL'    ? 'bg-emerald-600 hover:bg-emerald-700' :
        deliveryType === 'PARTIAL' ? 'bg-amber-500 hover:bg-amber-600'     :
        deliveryType === 'REPICE' ? 'bg-violet-600 hover:bg-violet-700'   :
                                     'bg-rose-600 hover:bg-rose-700';

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

                    {/* TIPO DE ENTREGA — 4 tabs en grid 2x2 en móvil, 4 cols en desktop */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Tipo de Entrega</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                            {(['FULL', 'PARTIAL', 'RETURN', 'REPICE'] as DeliveryType[]).map(opt => {
                                const m = MODE_INFO[opt];
                                const active = deliveryType === opt;
                                return (
                                    <button key={opt} onClick={() => setDeliveryType(opt)}
                                        className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2 ${COLOR_MAP[m.color][active ? 'active' : 'inactive']}`}>
                                        {m.label}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Descripción del modo */}
                        <p className={`text-[9px] font-bold px-3 py-1.5 rounded-lg ${
                            deliveryType === 'FULL'    ? 'bg-emerald-50 text-emerald-700' :
                            deliveryType === 'PARTIAL' ? 'bg-amber-50 text-amber-700'     :
                            deliveryType === 'REPICE' ? 'bg-violet-50 text-violet-700'   :
                                                         'bg-rose-50 text-rose-700'
                        }`}>{mode.desc}</p>
                    </div>

                    {/* DESTINO REPICE */}
                    {deliveryType === 'REPICE' && (
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                Destino del Repice <span className="text-violet-500">*</span>
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setRepiceDestination('BODEGA')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                                        repiceDestination === 'BODEGA'
                                            ? 'bg-violet-600 border-violet-600 text-white'
                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-300'
                                    }`}
                                >
                                    <span className="text-xl">🏭</span>
                                    <span className="text-[9px] font-black uppercase tracking-wide leading-tight text-center">
                                        Devolver<br />a Bodega
                                    </span>
                                    <span className={`text-[8px] font-medium leading-tight text-center ${repiceDestination === 'BODEGA' ? 'text-violet-200' : 'text-slate-400'}`}>
                                        Vuelve a pendiente
                                    </span>
                                </button>

                                <button
                                    onClick={() => setRepiceDestination('SAME_PLATE')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                                        repiceDestination === 'SAME_PLATE'
                                            ? 'bg-violet-600 border-violet-600 text-white'
                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-300'
                                    }`}
                                >
                                    <span className="text-xl">🚛</span>
                                    <span className="text-[9px] font-black uppercase tracking-wide leading-tight text-center">
                                        Reasignar<br />Misma Placa
                                    </span>
                                    <span className={`text-[8px] font-medium leading-tight text-center ${repiceDestination === 'SAME_PLATE' ? 'text-violet-200' : 'text-slate-400'}`}>
                                        Sigue en ruta
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ARTÍCULOS */}
                    {deliveryItems.length > 0 && deliveryType !== 'REPICE' && (
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

                    {/* ARTÍCULOS REPICE — solo lectura (todos vuelven) */}
                    {deliveryItems.length > 0 && deliveryType === 'REPICE' && (
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                Artículos — <span className="text-violet-600 normal-case font-bold">todos se {repiceDestination === 'BODEGA' ? 'devuelven a bodega' : 'reasignan a la misma placa'}</span>
                            </p>
                            <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                {deliveryItems.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-100">
                                        <p className="text-[10px] font-black text-slate-700 truncate">{item.articleName || item.sku}</p>
                                        <span className="text-[9px] font-bold text-violet-600 flex-shrink-0 ml-2">
                                            {Number(item.quantityDelivered) || 0} {item.unit || 'UND'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* OBSERVACIONES */}
                    <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                            {needsReason ? 'Motivo / Notas *' : 'Observaciones (opcional)'}
                        </p>
                        <textarea
                            rows={2}
                            value={observations}
                            onChange={e => setObservations(e.target.value)}
                            placeholder={
                                deliveryType === 'REPICE'
                                    ? 'Ej: Cliente ausente en segunda visita, reagendar para mañana...'
                                    : needsReason
                                    ? 'Ej: Cliente ausente, rechazo de mercancía, dirección incorrecta...'
                                    : 'Ej: Cliente firmó conforme, entrega en portería...'
                            }
                            className={`w-full px-3 py-2 border rounded-xl text-[10px] outline-none transition-all resize-none ${
                                deliveryType === 'REPICE' ? 'border-violet-200 focus:border-violet-500' :
                                needsReason               ? 'border-rose-200 focus:border-rose-500'     :
                                                            'border-slate-200 focus:border-emerald-500'
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
                        disabled={confirmDisabled}
                        className={`flex-1 py-3 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${confirmBtnColor} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isConfirmingDelivery && <Icons.Loader className="w-3 h-3 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerDeliveryModal;
