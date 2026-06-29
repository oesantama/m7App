import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Icons } from '../../constants';

interface ReturnItem {
    sku: string | null;
    article_name: string | null;
    quantity_returned: number;
    unit: string | null;
}

interface InvoiceReturn {
    id: number;
    invoice_id: string;
    return_reason: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    vendedor: string | null;
    vehicle_plate: string | null;
    driver_name: string | null;
    conciliacion_confirmada_at: string | null;
    conciliacion_confirmada_by: string | null;
    items: ReturnItem[];
}

interface Props {
    invoiceNumber: string;
    currentUserName: string;
}

const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

const ReturnApprovalInline: React.FC<Props> = ({ invoiceNumber, currentUserName }) => {
    const [returns, setReturns]     = useState<InvoiceReturn[]>([]);
    const [loading, setLoading]     = useState(true);
    const [confirming, setConfirming] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.getReturnsForInvoice(invoiceNumber)
            .then((res: any) => { if (!cancelled) setReturns(res?.data ?? []); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [invoiceNumber]);

    const handleConfirm = async (returnId: number) => {
        setConfirming(returnId);
        try {
            await api.confirmReturnByFacturacion(returnId, currentUserName);
            toast.success('Devolución confirmada por facturación');
            setReturns(prev => prev.map(r =>
                r.id === returnId
                    ? { ...r, status: 'CONFIRMED', conciliacion_confirmada_at: new Date().toISOString(), conciliacion_confirmada_by: currentUserName }
                    : r
            ));
        } catch (e: any) {
            toast.error(e?.message ?? 'Error al confirmar');
        } finally {
            setConfirming(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-[9px] text-slate-400 py-1">
                <Icons.Loader className="w-3 h-3 animate-spin" />
                Verificando devoluciones…
            </div>
        );
    }

    if (returns.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-rose-100" />
                <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                    ⚠ Esta factura tiene devolución en bodega
                </span>
                <div className="h-px flex-1 bg-rose-100" />
            </div>

            {returns.map(ret => {
                const isConfirmed = ret.status === 'CONFIRMED';
                const isPending   = ret.status === 'PENDING' || ret.status === 'PROCESSED';

                return (
                    <div key={ret.id}
                        className={`rounded-2xl border-2 p-3 ${isConfirmed ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/30'}`}>

                        {/* Header de la devolución */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase border
                                        ${isConfirmed
                                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                            : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                        {isConfirmed ? '✅ Confirmada' : '⏳ Pendiente confirmación'}
                                    </span>
                                    <span className="text-[8px] text-slate-500">{fmtDate(ret.created_at)}</span>
                                </div>
                                {ret.return_reason && (
                                    <p className="text-[9px] text-slate-700 font-semibold mt-1 truncate">
                                        Motivo: {ret.return_reason}
                                    </p>
                                )}
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    {ret.vehicle_plate && (
                                        <span className="text-[8px] text-slate-500">
                                            🚛 <strong className="text-slate-700">{ret.vehicle_plate}</strong>
                                        </span>
                                    )}
                                    {ret.driver_name && (
                                        <span className="text-[8px] text-slate-500 truncate max-w-[140px]">
                                            👤 {ret.driver_name}
                                        </span>
                                    )}
                                    {ret.vendedor && (
                                        <span className="text-[8px] text-slate-500">
                                            Vendedor: <strong className="text-slate-700">{ret.vendedor}</strong>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isPending && (
                                <button
                                    onClick={() => handleConfirm(ret.id)}
                                    disabled={confirming === ret.id}
                                    className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[8px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5 transition-all">
                                    {confirming === ret.id
                                        ? <Icons.Loader className="w-3 h-3 animate-spin" />
                                        : '✓ Confirmar'}
                                </button>
                            )}
                        </div>

                        {/* Ítems devueltos */}
                        {ret.items.length > 0 && (
                            <div className="bg-white/70 rounded-xl overflow-hidden border border-slate-100">
                                <table className="w-full text-[8px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="px-2 py-1.5 text-left font-black text-slate-500 uppercase tracking-widest">Artículo</th>
                                            <th className="px-2 py-1.5 text-right font-black text-slate-500 uppercase tracking-widest">Cant. Dev.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {ret.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-2 py-1.5 text-slate-700 font-medium truncate max-w-[160px]">
                                                    {item.article_name || item.sku || '—'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-black text-slate-900">
                                                    {item.quantity_returned} <span className="font-normal text-slate-400">{item.unit || ''}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Confirmado por */}
                        {isConfirmed && ret.conciliacion_confirmada_at && (
                            <p className="text-[8px] text-emerald-700 font-bold mt-2">
                                Confirmado por {ret.conciliacion_confirmada_by} · {fmtDate(ret.conciliacion_confirmada_at)}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ReturnApprovalInline;
