import React from 'react';
import { api } from '../../services/api';
import { ReturnCard } from './ReturnCard';
import { Icons } from '../../constants';

interface Client { id: string; name: string; }

interface RouteReturn {
    id: number;
    invoice_number: string;
    driver_name?: string;
    vehicle_plate?: string;
    items: any[];
    created_at: string;
    external_doc_id?: string;
}

interface BodegaReturn {
    invoiceNumber: string;
    documentId: string | number;
    conductorName?: string;
    vehiclePlate?: string;
    legalizadoAt: string;
    externalDocId?: string;
    items: any[];
}

type Tab = 'rutas' | 'legalizacion';

const DevolucionesBodega: React.FC<{ user: any }> = ({ user }) => {
    const [tab, setTab]               = React.useState<Tab>('rutas');
    const [routeReturns, setRouteReturns]   = React.useState<RouteReturn[]>([]);
    const [bodegaReturns, setBodegaReturns] = React.useState<BodegaReturn[]>([]);
    const [loading, setLoading]       = React.useState(false);
    const [processingId, setProcessingId] = React.useState<string | null>(null);
    const [toast, setToast]           = React.useState<{ msg: string; ok: boolean } | null>(null);

    // Client selector
    const [clients, setClients]               = React.useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = React.useState<string>('');
    const [clientsReady, setClientsReady]     = React.useState(false);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Resolve allowed clients ───────────────────────────────────────────────
    React.useEffect(() => {
        const allowedIds: string[] = user?.clientIds?.length
            ? user.clientIds
            : user?.clientId ? [user.clientId] : [];

        api.getClients().then((all: any[]) => {
            const isAdmin = allowedIds.length === 1 && allowedIds[0] === 'CLI-01';
            const filtered = isAdmin ? all : all.filter((c: any) => allowedIds.includes(c.id));
            const mapped: Client[] = filtered.map((c: any) => ({ id: c.id, name: c.name || c.id }));
            setClients(mapped);
            if (mapped.length === 1) setSelectedClientId(mapped[0].id);
            setClientsReady(true);
        }).catch(() => setClientsReady(true));
    }, [user]);

    // ── Load data when client selected ───────────────────────────────────────
    const loadAll = React.useCallback(async (clientId: string) => {
        if (!clientId) return;
        setLoading(true);
        try {
            const [rr, br] = await Promise.all([
                api.getPendingRouteReturns(clientId).catch(() => []),
                api.getPendingBodegaReturns(clientId).catch(() => ({ data: [] })),
            ]);
            setRouteReturns(Array.isArray(rr) ? rr : (rr?.data ?? []));
            const brData = Array.isArray(br) ? br : (br?.data ?? []);
            setBodegaReturns(brData);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (selectedClientId) { setRouteReturns([]); setBodegaReturns([]); loadAll(selectedClientId); }
    }, [selectedClientId, loadAll]);

    // ── Confirm handlers ─────────────────────────────────────────────────────
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
        } finally { setProcessingId(null); }
    };

    const handleConfirmBodega = async (ret: BodegaReturn, obs: string) => {
        setProcessingId(`b-${ret.invoiceNumber}`);
        try {
            await api.confirmBodegaReturn({
                invoiceNumber: ret.invoiceNumber,
                documentId: String(ret.documentId),
                receivedBy: user?.name ?? user?.email ?? 'Bodega',
                observation: obs,
            });
            showToast(`Devolución post-legalización de ${ret.invoiceNumber} confirmada`);
            setBodegaReturns(prev => prev.filter(r => r.invoiceNumber !== ret.invoiceNumber));
        } catch (e: any) {
            showToast(e?.message ?? 'Error al confirmar', false);
        } finally { setProcessingId(null); }
    };

    const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';
    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'rutas',        label: 'De Rutas',           count: routeReturns.length },
        { id: 'legalizacion', label: 'Post-Legalización',  count: bodegaReturns.length },
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
            <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">Devoluciones — Bodega</h1>
                    <p className="text-[11px] text-slate-500 mt-0.5">Confirma recepción física de mercancía devuelta</p>
                </div>
            </div>

            {/* Client selector */}
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Cliente</span>
                {!clientsReady ? (
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                ) : clients.length === 0 ? (
                    <span className="text-[10px] text-slate-400">Sin clientes asignados</span>
                ) : clients.length === 1 ? (
                    <span className="text-[11px] font-black text-slate-700">{clients[0].name}</span>
                ) : (
                    <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-rose-400 transition-all">
                        <option value="">— Seleccionar cliente —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                    </select>
                )}
                {selectedClientName && (
                    <span className="text-[9px] bg-rose-50 border border-rose-200 text-rose-700 font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ml-auto shrink-0">
                        {selectedClientName}
                    </span>
                )}
            </div>

            {/* Sin cliente */}
            {!selectedClientId ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white rounded-2xl border border-slate-200">
                    <Icons.Package className="w-12 h-12 text-slate-200" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Selecciona un cliente</p>
                </div>
            ) : (
                <>
                    {/* Tabs + Refresh */}
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
                        <button onClick={() => loadAll(selectedClientId)}
                            className="ml-auto px-3 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                            <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" />
                        </div>
                    ) : tab === 'rutas' ? (
                        routeReturns.length === 0
                            ? <EmptyState msg="No hay devoluciones de ruta pendientes" />
                            : (
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
                        bodegaReturns.length === 0
                            ? <EmptyState msg="No hay devoluciones post-legalización pendientes" />
                            : (
                                <div className="grid gap-3 max-w-2xl">
                                    {bodegaReturns.map(ret => (
                                        <ReturnCard
                                            key={ret.invoiceNumber}
                                            type="legalizacion"
                                            invoiceId={ret.invoiceNumber}
                                            conductorName={ret.conductorName}
                                            vehiclePlate={ret.vehiclePlate}
                                            createdAt={ret.legalizadoAt}
                                            externalDocId={ret.externalDocId}
                                            items={ret.items ?? []}
                                            isProcessing={processingId === `b-${ret.invoiceNumber}`}
                                            onConfirm={obs => handleConfirmBodega(ret, obs)}
                                        />
                                    ))}
                                </div>
                            )
                    )}
                </>
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
