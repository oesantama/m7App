import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import TabPendientes, { DocSummary } from './Conciliacion/TabPendientes';
import TabDocumentosLegalizados from './Conciliacion/TabDocumentosLegalizados';
import TabPlanilla from './Conciliacion/TabPlanilla';

interface Props { user: any; }

interface Client { id: string; name: string; }

type Tab = 'pendientes' | 'documentos_legalizados' | 'planilla';

const ConciliacionFacturas: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<Tab>('pendientes');
    const [docs, setDocs]           = useState<DocSummary[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);

    // ── Client selector ──────────────────────────────────────────────────────
    const [clients, setClients]           = useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [clientsReady, setClientsReady] = useState(false);

    useEffect(() => {
        const allowedIds: string[] = user?.clientIds?.length
            ? user.clientIds
            : user?.clientId ? [user.clientId] : [];

        api.getClients().then((all: any[]) => {
            const isAdmin = allowedIds.length === 1 && allowedIds[0] === 'CLI-01';
            const filtered = isAdmin
                ? all
                : all.filter((c: any) => allowedIds.includes(c.id));
            const mapped: Client[] = filtered.map((c: any) => ({ id: c.id, name: c.name || c.id }));
            setClients(mapped);
            if (mapped.length === 1) {
                setSelectedClientId(mapped[0].id);  // auto-select único cliente
            }
            setClientsReady(true);
        }).catch(() => setClientsReady(true));
    }, [user]);

    // ── Load docs when client is selected ────────────────────────────────────
    const loadDocs = useCallback(async (clientId: string) => {
        if (!clientId) return;
        setLoadingDocs(true);
        try {
            const res = await api.getConciliationPending({ clientId });
            setDocs(res.data || []);
        } catch { toast.error('Error cargando documentos'); }
        finally { setLoadingDocs(false); }
    }, []);

    useEffect(() => {
        if (selectedClientId) {
            setDocs([]);
            loadDocs(selectedClientId);
        }
    }, [selectedClientId, loadDocs]);

    const pendingBadge = docs.filter(d => d.pendientes > 0 || (d as any).pending_surcharges > 0).length;
    const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';

    return (
        <div className="flex flex-col h-full min-h-screen bg-slate-50">

            {/* ── HEADER + TABS ────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-200 px-4 pt-4 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                        <span className="text-white text-sm">💰</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Conciliación Facturas</h2>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                            {selectedClientName ? selectedClientName : 'Selecciona un cliente'}
                        </p>
                    </div>

                    {/* Client selector */}
                    <div className="shrink-0">
                        {!clientsReady ? (
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        ) : clients.length === 1 ? (
                            <span className="text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                                {clients[0].name}
                            </span>
                        ) : (
                            <select
                                value={selectedClientId}
                                onChange={e => setSelectedClientId(e.target.value)}
                                className="px-3 py-1.5 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-emerald-500 transition-all min-w-[160px]">
                                <option value="">— Seleccionar cliente —</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <div className="flex gap-1">
                    {([
                        { id: 'pendientes' as Tab, label: 'Pendientes',       icon: '⏳', badge: pendingBadge },
                        { id: 'documentos_legalizados' as Tab, label: 'Documentos Legalizados', icon: '✅', badge: 0 },
                        { id: 'planilla'   as Tab, label: 'Descarga Planilla', icon: '📥', badge: 0           },
                    ]).map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-wide border-b-2 transition-all
                                ${activeTab === tab.id
                                    ? 'border-emerald-500 text-emerald-700 bg-emerald-50/60'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                            {tab.badge > 0 && (
                                <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── CONTENIDO POR TAB ───────────────────────────────────────── */}
            {!selectedClientId ? (
                <div className="flex flex-col items-center justify-center flex-1 py-24 gap-3">
                    <span className="text-5xl">💰</span>
                    <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest">Selecciona un cliente</p>
                    <p className="text-[10px] text-slate-400">para ver sus documentos pendientes de legalización</p>
                </div>
            ) : activeTab === 'pendientes' ? (
                <TabPendientes
                    docs={docs}
                    loadingDocs={loadingDocs}
                    onRefresh={() => loadDocs(selectedClientId)}
                    user={user}
                />
            ) : activeTab === 'documentos_legalizados' ? (
                <TabDocumentosLegalizados user={user} />
            ) : (
                <TabPlanilla user={user} />
            )}
        </div>
    );
};

export default ConciliacionFacturas;
