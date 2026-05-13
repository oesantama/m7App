import React from 'react';
import { Icons } from '../../constants';

export const RETURN_REASONS = [
    'Cliente no atiende',
    'Ya no desea el producto',
    'Domicilio equivocado',
    'Artículo en mal estado',
    'Excedente de pedido',
    'Error en pedido',
    'Otro',
];

interface ReturnItem {
    sku?: string;
    article_id?: string;
    article_name?: string;
    batch?: string;
    qty?: number;
    quantity_returned?: number;
    quantity_delivered?: number;
    expected_qty?: number;
    unit?: string;
}

interface ReturnCardProps {
    invoiceId: string;
    driverName?: string;
    vehiclePlate?: string;
    conductorName?: string;
    createdAt: string;
    externalDocId?: string;
    items: ReturnItem[];
    isProcessing: boolean;
    onConfirm: (obs: string, reason: string) => void;
    onCancel?: () => void;
    type: 'ruta' | 'legalizacion';
    returnReason?: string;
}

const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const isPartial = (items: ReturnItem[]) => {
    return items.some(i => {
        const returned  = i.quantity_returned ?? i.qty ?? 0;
        const expected  = i.expected_qty ?? (i.quantity_returned ?? i.qty ?? 0);
        const delivered = i.quantity_delivered ?? 0;
        return delivered > 0 || returned < expected;
    });
};

export const ReturnCard: React.FC<ReturnCardProps> = ({
    invoiceId, driverName, vehiclePlate, conductorName, createdAt,
    externalDocId, items, isProcessing, onConfirm, onCancel, type, returnReason: initialReason,
}) => {
    const [obs, setObs]         = React.useState('');
    const [reason, setReason]   = React.useState(initialReason || '');
    const [expanded, setExpanded] = React.useState(false);

    const displayName  = driverName || conductorName || '—';
    const plate        = vehiclePlate || '—';
    const validItems   = items.filter(i => (i.sku || i.article_id));
    const partial      = isPartial(validItems);

    return (
        <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden hover:border-slate-200 transition-all">
            {/* Header */}
            <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-black text-slate-900">{invoiceId}</span>
                        {externalDocId && (
                            <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{externalDocId}</span>
                        )}
                        <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase
                            ${type === 'ruta' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                            {type === 'ruta' ? '🚛 De Ruta' : '📋 Post-Legalización'}
                        </span>
                        <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase
                            ${partial ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {partial ? '⚠️ Parcial' : '✅ Completa'}
                        </span>
                    </div>
                    <p className="text-[9px] text-slate-500 font-bold mt-0.5">
                        👤 {displayName} · 🚛 {plate}
                    </p>
                    <p className="text-[8px] text-slate-400 mt-0.5">📅 {fmtDate(createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-black text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
                        {validItems.length} art.
                    </span>
                    <button onClick={() => setExpanded(v => !v)}
                        className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                        <Icons.ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Detalle artículos */}
            {expanded && validItems.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                    <table className="w-full text-[9px]">
                        <thead>
                            <tr className="text-slate-400 font-black uppercase">
                                <th className="text-left pb-1.5">Artículo</th>
                                <th className="text-left pb-1.5">Lote</th>
                                <th className="text-right pb-1.5">Devuelto</th>
                                <th className="text-right pb-1.5">Entregado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {validItems.map((item, i) => (
                                <tr key={i}>
                                    <td className="py-1 font-bold text-slate-700">
                                        {item.article_id || item.sku}
                                        {item.article_name && <span className="block text-[7px] text-slate-400 font-normal">{item.article_name}</span>}
                                    </td>
                                    <td className="py-1 text-slate-500">{item.batch || 'S/L'}</td>
                                    <td className="py-1 text-right font-black text-rose-600">
                                        {item.quantity_returned ?? item.qty ?? '—'} {item.unit || 'und'}
                                    </td>
                                    <td className="py-1 text-right font-black text-emerald-600">
                                        {item.quantity_delivered ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Acciones */}
            <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-rose-400 text-slate-700 font-bold">
                    <option value="">— Motivo de devolución —</option>
                    {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex items-center gap-2">
                    <input
                        value={obs}
                        onChange={e => setObs(e.target.value)}
                        placeholder="Observación (opcional)…"
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500"
                    />
                    {onCancel && (
                        <button onClick={onCancel} disabled={isProcessing}
                            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-[9px] font-black uppercase hover:bg-slate-50 disabled:opacity-40 transition-all">
                            Cancelar
                        </button>
                    )}
                    <button onClick={() => onConfirm(obs, reason)} disabled={isProcessing || !reason}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5">
                        {isProcessing ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Check className="w-3 h-3" />}
                        Recibir
                    </button>
                </div>
            </div>
        </div>
    );
};
