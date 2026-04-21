import React from 'react';
import { api } from '../../services/api';
import { ReturnCard } from './ReturnCard';
import { Icons } from '../../constants';

interface RouteReturn {
    id: number;
    invoice_number: string;
    driver_name?: string;
    vehicle_plate?: string;
    return_type: string;
    items: any[];
    created_at: string;
    external_doc_id?: string;
}

interface BodegaReturn {
    invoice_number: string;
    document_id: string | number;
    conductor_name?: string;
    vehicle_plate?: string;
    created_at: string;
    external_doc_id?: string;
    items: any[];
}

type Tab = 'rutas' | 'legalizacion';

const DevolucionesBodega: React.FC<{ user: any }> = ({ user }) => {
    const [tab, setTab] = React.useState<Tab>('rutas');
    const [routeReturns, setRouteReturns] = React.useState<RouteReturn[]>([]);
    const [bodegaReturns, setBodegaReturns] = React.useState<BodegaReturn[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [processingId, setProcessingId] = React.useState<string | null>(null);
    const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const loadRouteReturns = async () => {
        try {
            const res = await api.getPendingRouteReturns();
            setRouteReturns(res?.data ?? res ?? []);
        } catch { setRouteReturns([]); }
    };

    const loadBodegaReturns = async () => {
        try {
            const res = await api.getPendingBodegaReturns();
            setBodegaReturns(res?.data ?? res ?? []);
        } catch { setBodegaReturns([]); }
    };

    React.useEffect(() => {
        setLoading(true);
        Promise.all([loadRouteReturns(), loadBodegaReturns()]).finally(() => setLoading(false));
    }, []);

    const handleConfirmRoute = async (ret: RouteReturn, obs: string) => {
        setProcessingId(`r-${ret.id}`);
        try {
            await api.confirmRouteReturn(ret.id, {
                status: 'PROCESSED',
                handledBy: user?.name ?? user?.email ?? 'Bodega',
                notes: obs,
            });
            showToast(`Devolución de ${ret.invoice_number} confirmada`);
            setRouteReturns(prev => prev.filter(r => r.id !== ret.id));
        } catch (e: any) {
            showToast(e?.message ?? 'Error al confirmar', false);
        } finally {
            setProcessingId(null);
        }
    };

    const handleConfirmBodega = async (ret: BodegaReturn, obs: string) => {
        setProcessingId(`b-${ret.invoice_number}`);
        try {
            await api.confirmBodegaReturn({
                invoiceNumber: ret.invoice_number,
                documentId: ret.document_id,
                receivedBy: user?.name ?? user?.email ?? 'Bodega',
                observation: obs,
            });
            showToast(`Devolución post-legalización de ${ret.invoice_number} confirmada`);
            setBodegaReturns(prev => prev.filter(r => r.invoice_number !== ret.invoice_number));
        } catch (e: any) {
            showToast(e?.message ?? 'Error al confirmar', false);
        } finally {
            setProcessingId(null);
        }
    };

    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'rutas', label: 'De Rutas', count: routeReturns.length },
        { id: 'legalizacion', label: 'Post-Legalización', count: bodegaReturns.length },
    ];

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-[11px] font-black text-white transition-all
                    ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.ok ? '✅' : '❌'} {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="mb-5">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Devoluciones — Bodega</h1>
                <p className="text-[11px] text-slate-500 mt-0.5">Confirma recepción física de mercancía devuelta</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5
                            ${tab === t.id
                                ? 'bg-slate-900 text-white shadow'
                                : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {t.label}
                        {t.count > 0 && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black
                                ${tab === t.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
                <button onClick={() => {
                    setLoading(true);
                    Promise.all([loadRouteReturns(), loadBodegaReturns()]).finally(() => setLoading(false));
                }} className="ml-auto px-3 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                    <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
            ) : tab === 'rutas' ? (
                routeReturns.length === 0 ? (
                    <EmptyState msg="No hay devoluciones de ruta pendientes" />
                ) : (
                    <div className="grid gap-3 max-w-2xl">
                        {routeReturns.map(ret => (
                            <ReturnCard
                                key={ret.id}
                                type="ruta"
                                invoiceId={ret.invoice_number}
                                driverName={ret.driver_name}
                                vehiclePlate={ret.vehicle_plate}
                                createdAt={ret.created_at}
                                externalDocId={ret.external_doc_id}
                                items={ret.items ?? []}
                                isProcessing={processingId === `r-${ret.id}`}
                                onConfirm={obs => handleConfirmRoute(ret, obs)}
                            />
                        ))}
                    </div>
                )
            ) : (
                bodegaReturns.length === 0 ? (
                    <EmptyState msg="No hay devoluciones post-legalización pendientes" />
                ) : (
                    <div className="grid gap-3 max-w-2xl">
                        {bodegaReturns.map(ret => (
                            <ReturnCard
                                key={ret.invoice_number}
                                type="legalizacion"
                                invoiceId={ret.invoice_number}
                                conductorName={ret.conductor_name}
                                vehiclePlate={ret.vehicle_plate}
                                createdAt={ret.created_at}
                                externalDocId={ret.external_doc_id}
                                items={ret.items ?? []}
                                isProcessing={processingId === `b-${ret.invoice_number}`}
                                onConfirm={obs => handleConfirmBodega(ret, obs)}
                            />
                        ))}
                    </div>
                )
            )}
        </div>
    );
};

const EmptyState: React.FC<{ msg: string }> = ({ msg }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
            <Icons.Package className="w-6 h-6 text-slate-300" />
        </div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{msg}</p>
    </div>
);

export default DevolucionesBodega;
