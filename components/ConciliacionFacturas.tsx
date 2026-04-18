import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import TabPendientes, { DocSummary } from './Conciliacion/TabPendientes';
import TabConciliado from './Conciliacion/TabConciliado';
import TabPlanilla from './Conciliacion/TabPlanilla';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Props { user: any; }

type Tab = 'pendientes' | 'conciliado' | 'planilla';

// ── Componente principal ──────────────────────────────────────────────────────

const ConciliacionFacturas: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<Tab>('pendientes');
    const [docs, setDocs]           = useState<DocSummary[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);

    const loadDocs = useCallback(async () => {
        setLoadingDocs(true);
        try {
            const res = await api.getConciliationPending();
            setDocs(res.data || []);
        } catch { toast.error('Error cargando documentos'); }
        finally { setLoadingDocs(false); }
    }, []);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const pendingBadge = docs.filter(d => d.pendientes > 0).length;

    return (
        <div className="flex flex-col h-full min-h-screen bg-slate-50">

            {/* ── HEADER + TABS ────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-200 px-4 pt-4 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                        <span className="text-white text-sm">💰</span>
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Conciliación Facturas</h2>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Plan R</p>
                    </div>
                </div>
                <div className="flex gap-1">
                    {([
                        { id: 'pendientes' as Tab, label: 'Pendientes',       icon: '⏳', badge: pendingBadge },
                        { id: 'conciliado' as Tab, label: 'Conciliado',        icon: '✅', badge: 0           },
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
            {activeTab === 'pendientes' && (
                <TabPendientes
                    docs={docs}
                    loadingDocs={loadingDocs}
                    onRefresh={loadDocs}
                    user={user}
                />
            )}
            {activeTab === 'conciliado' && <TabConciliado />}
            {activeTab === 'planilla'   && <TabPlanilla />}
        </div>
    );
};

export default ConciliacionFacturas;
