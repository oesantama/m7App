import React, { useState, useCallback, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ── Componente ────────────────────────────────────────────────────────────────

const TabPlanilla: React.FC = () => {
    const [clients, setClients]         = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [planDate, setPlanDate]       = useState(new Date().toISOString().split('T')[0]);
    const [routesList, setRoutesList]   = useState<any[]>([]);
    const [loadingRoutes, setLoadingRoutes] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);

    const loadClients = useCallback(async () => {
        try {
            const res = await api.getClients();
            setClients(res || []);
        } catch { console.error('Error cargando clientes'); }
    }, []);

    useEffect(() => { loadClients(); }, [loadClients]);

    const handleSearchRoutes = async () => {
        if (!selectedClient || !planDate) {
            toast.error('Seleccione cliente y fecha');
            return;
        }
        setLoadingRoutes(true);
        try {
            const res = await api.searchConciliationRoutes(selectedClient, planDate);
            setRoutesList(res.data || []);
            if (res.data?.length === 0) toast.info('No se encontraron rutas para este día');
        } catch (err: any) {
            toast.error(err.message || 'Error buscando rutas');
        } finally {
            setLoadingRoutes(false);
        }
    };

    const handleDownloadRoute = async (route: any) => {
        setDownloading(String(route.id));
        try {
            const url = api.getConciliationPlanillaUrl(route.id);
            const token = localStorage.getItem('token') || localStorage.getItem('m7_token');
            const headers: any = {};
            if (token) headers['Authorization'] = `Bearer ${token.trim()}`;

            const resp = await fetch(url, { headers, credentials: 'include' });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Error al generar planilla');
            }
            const blob = await resp.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Planilla_${route.vehicle_plate || 'SV'}_${planDate}.xlsx`;
            link.click();
            URL.revokeObjectURL(link.href);
            toast.success('Planilla descargada');
        } catch (err: any) {
            toast.error(err.message || 'Error descargando planilla');
        } finally {
            setDownloading(null);
        }
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden">

            {/* Filtros */}
            <div className="bg-white border-b border-slate-100 px-6 py-6 flex-shrink-0">
                <div className="max-w-4xl mx-auto">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Cliente</label>
                            <select
                                value={selectedClient}
                                onChange={e => setSelectedClient(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 transition-all"
                            >
                                <option value="">Seleccione un cliente...</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="w-48">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Fecha de Ruta</label>
                            <input
                                type="date"
                                value={planDate}
                                onChange={e => setPlanDate(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 transition-all"
                            />
                        </div>
                        <button
                            onClick={handleSearchRoutes}
                            disabled={loadingRoutes || !selectedClient || !planDate}
                            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                        >
                            {loadingRoutes ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Search className="w-4 h-4" />}
                            Buscar Rutas
                        </button>
                    </div>
                </div>
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-auto custom-scrollbar p-6">
                <div className="max-w-5xl mx-auto">
                    {loadingRoutes ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Icons.Loader className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Consultando rutas en Orbis...</p>
                        </div>
                    ) : routesList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6">
                                <span className="text-4xl text-slate-300">🚚</span>
                            </div>
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-tight">No hay rutas para mostrar</h3>
                            <p className="text-[10px] text-slate-400 mt-1 max-w-[240px]">Seleccione un cliente y fecha para listar las rutas disponibles y descargar sus planillas.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {routesList.map(route => {
                                const isAllConciliated = route.total_invoices > 0 && route.total_invoices === Number(route.conciliadas);
                                const pct = route.total_invoices > 0 ? Math.round((Number(route.conciliadas) / route.total_invoices) * 100) : 0;

                                return (
                                    <div key={route.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-6 hover:shadow-md transition-all group">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isAllConciliated ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                                                <span className="text-xl">{isAllConciliated ? '🏁' : '🚚'}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{route.vehicle_plate || `RUTA-${route.id}`}</h4>
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${isAllConciliated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {route.estado || (isAllConciliated ? 'Conciliado' : 'Pendiente')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-slate-500">
                                                    <span className="flex items-center gap-1">🚛 {route.vehicle_plate || '—'}</span>
                                                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                                    <span className="truncate">👤 {route.conductor_name || 'Sin conductor'}</span>
                                                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                                    <span className="text-emerald-600">📄 {route.total_invoices || 0} facturas</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8 shrink-0">
                                            <div className="text-right hidden sm:block">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avance</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black text-slate-900">{pct}%</span>
                                                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-500 ${isAllConciliated ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleDownloadRoute(route)}
                                                disabled={downloading === String(route.id)}
                                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                            >
                                                {downloading === String(route.id)
                                                    ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" />
                                                    : <Icons.Download className="w-3.5 h-3.5" />
                                                }
                                                {downloading === String(route.id) ? 'Generando...' : 'Descargar'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TabPlanilla;
