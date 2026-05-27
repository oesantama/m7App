import React, { useState, useEffect, useCallback } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Client { id: string; name: string; }

interface AjoverStats {
  vehicles:    { total: number; available: number; onRoute: number; totalCapacityM3: number; totalCapacityKg: number };
  drivers:     { total: number; active: number };
  routes:      { total: number; active: number; completed: number; pending: number };
  invoices:    { total: number; delivered: number; inRoute: number; pending: number; returned: number; deliveredWeight: number; effectivenessRate: number; returnRate: number };
  topCities:   { city: string; total: number; delivered: number; returned: number; effectiveness: number }[];
  activeRoutes:{ name: string; status: string; plate: string; driver: string }[];
  vehicleEfficiency: { plate: string; capacityM3: number; totalRoutes: number; avgUtilization: number; avgVolume: number; maxUtilization: number; totalVolumeDispatched: number }[];
  conciliation: { total: number; completadas: number; pendientes: number; devoluciones: number; devolucionesPendientesBodega: number };
  devolucionesPendientesRuta: number;
  stock: { bodegaQty: number; bodegaSkus: number };
}

interface Props { user: any; }

// ── Sub-componentes ───────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon?: React.ReactNode }> = ({ label, value, sub, color = 'blue', icon }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500',
    red: 'bg-red-500', purple: 'bg-purple-500', slate: 'bg-slate-700',
    rose: 'bg-rose-500', cyan: 'bg-cyan-500',
  };
  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-lg p-5 flex items-center gap-4">
      <div className={`w-12 h-12 ${colors[color] ?? 'bg-slate-700'} rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
        {sub && <p className="text-[10px] font-bold text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
};

const BarChart: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const CircleProgress: React.FC<{ label: string; value: number; total: number; textColor: string }> = ({ label, value, total, textColor }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6 flex flex-col items-center justify-center gap-3">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{label}</p>
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" className={textColor} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-slate-900">{pct}%</span>
        </div>
      </div>
      <p className="text-[10px] font-bold text-slate-400">{value} / {total}</p>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────

const AjoverDashboard: React.FC<Props> = ({ user }) => {
  const [stats, setStats]           = useState<AjoverStats | null>(null);
  const [loading, setLoading]       = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Client selector
  const [clients, setClients]               = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientsReady, setClientsReady]     = useState(false);

  // ── Load allowed clients ──────────────────────────────────────────────────
  useEffect(() => {
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

  // ── Fetch stats ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (clientId: string) => {
    if (!clientId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/dashboard/ajover-stats?clientId=${encodeURIComponent(clientId)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setStats(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      console.error('[AjoverDashboard]', e);
      setFetchError(e?.message || 'Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClientId) { setStats(null); fetchStats(selectedClientId); }
  }, [selectedClientId, fetchStats]);

  const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? selectedClientId;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="flex items-center gap-5 z-10 min-w-0 flex-1">
          <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 text-white shrink-0">
            <Icons.Package className="w-8 h-8" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Dashboard Informativa</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              {selectedClientName || 'Selecciona un cliente'}
              {lastUpdated && <span className="text-slate-300 font-bold normal-case tracking-normal">· {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 z-10 shrink-0">
          {/* Client selector */}
          {!clientsReady ? (
            <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          ) : clients.length === 1 ? (
            <span className="text-[9px] bg-slate-100 text-slate-600 font-black px-3 py-1.5 rounded-xl uppercase tracking-widest">{clients[0].name}</span>
          ) : (
            <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-2xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-slate-400 transition-all min-w-[160px]">
              <option value="">— Seleccionar cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {selectedClientId && (
            <button onClick={() => fetchStats(selectedClientId)}
              className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all flex items-center gap-2">
              <Icons.RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          )}
        </div>
      </div>

      {/* Sin cliente seleccionado */}
      {!selectedClientId ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white rounded-[2rem] border border-slate-100 shadow-lg">
          <Icons.Package className="w-14 h-14 text-slate-200" />
          <p className="text-[13px] font-black text-slate-400 uppercase tracking-widest">Selecciona un cliente</p>
          <p className="text-[10px] text-slate-400">para ver el dashboard operativo</p>
        </div>
      ) : loading && !stats ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Cargando datos…</p>
          </div>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-[2rem] border border-red-100 shadow-lg">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center">
            <Icons.AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-[13px] font-black text-slate-700 uppercase tracking-widest">Sin datos disponibles</p>
          <p className="text-[11px] text-slate-400 text-center max-w-xs">{fetchError}</p>
          <button
            onClick={() => fetchStats(selectedClientId)}
            className="mt-2 px-5 py-2 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
          >
            Reintentar
          </button>
        </div>
      ) : stats ? (
        <DashboardContent stats={stats} />
      ) : null}
    </div>
  );
};

// ── Contenido principal separado para claridad ────────────────────────────────

const DashboardContent: React.FC<{ stats: AjoverStats }> = ({ stats }) => {
  const { vehicles: veh, drivers: drv, routes: rts, invoices: inv, topCities, activeRoutes, vehicleEfficiency = [], conciliation, devolucionesPendientesRuta, stock } = stats;
  const fleetUtilization = veh.total > 0 ? Math.round((veh.onRoute / veh.total) * 100) : 0;

  return (
    <div className="space-y-8">

      {/* KPI: Flota */}
      <Section title="Flota & Conductores">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Vehículos Total" value={veh.total}        icon={<Icons.Truck className="w-6 h-6" />}       color="slate" />
          <StatCard label="En Ruta"         value={veh.onRoute}      sub={`${fleetUtilization}% utilización`} icon={<Icons.MapPin className="w-6 h-6" />}       color="blue" />
          <StatCard label="Disponibles"     value={veh.available}    icon={<Icons.CheckCircle className="w-6 h-6" />} color="green" />
          <StatCard label="Conductores"     value={drv.total}        sub={`${drv.active} activos`}            icon={<Icons.User className="w-6 h-6" />}           color="purple" />
          <StatCard label="Cap. Total M³"   value={veh.totalCapacityM3.toFixed(1)} icon={<Icons.Package className="w-6 h-6" />} color="amber" />
          <StatCard label="Cap. Total Kg"   value={veh.totalCapacityKg > 0 ? `${(veh.totalCapacityKg/1000).toFixed(1)}T` : '—'} icon={<Icons.Package className="w-6 h-6" />} color="amber" />
        </div>
      </Section>

      {/* KPI: Entregas */}
      <Section title="Operación de Entregas (últimos 30 días)">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Docs"    value={inv.total}     icon={<Icons.FileText className="w-6 h-6" />}      color="slate" />
          <StatCard label="Entregados"    value={inv.delivered} sub={`${inv.effectivenessRate}% efectividad`} icon={<Icons.CheckCircle className="w-6 h-6" />}   color="green" />
          <StatCard label="En Ruta"       value={inv.inRoute}   icon={<Icons.Truck className="w-6 h-6" />}         color="blue" />
          <StatCard label="Pendientes"    value={inv.pending}   icon={<Icons.History className="w-6 h-6" />}       color="amber" />
          <StatCard label="Devueltos"     value={inv.returned}  sub={`${inv.returnRate}% tasa`} icon={<Icons.AlertTriangle className="w-6 h-6" />} color="red" />
          <StatCard label="Rutas Activas" value={rts.active}    sub={`${rts.total} totales`} icon={<Icons.MapPin className="w-6 h-6" />} color="purple" />
        </div>
      </Section>

      {/* KPI: Conciliación + Devoluciones + Stock */}
      <Section title="Conciliación & Inventario">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Concil. Pendientes"  value={conciliation.pendientes}  icon={<Icons.History className="w-6 h-6" />}      color="amber" />
          <StatCard label="Concil. Completadas" value={conciliation.completadas} icon={<Icons.CheckCircle className="w-6 h-6" />}  color="green" />
          <StatCard label="Devoluciones (30d)"  value={conciliation.devoluciones} icon={<Icons.AlertTriangle className="w-6 h-6" />} color="rose" />
          <StatCard label="Dev. Pend. Bodega"   value={conciliation.devolucionesPendientesBodega + devolucionesPendientesRuta}
            sub={`${conciliation.devolucionesPendientesBodega} post-leg · ${devolucionesPendientesRuta} ruta`}
            icon={<Icons.Package className="w-6 h-6" />} color="red" />
          <StatCard label="Stock Bodega (ud)"   value={stock.bodegaQty.toLocaleString('es-CO')} sub={`${stock.bodegaSkus} SKUs`} icon={<Icons.Package className="w-6 h-6" />} color="cyan" />
          <StatCard label="Concil. Total (30d)" value={conciliation.total} icon={<Icons.FileText className="w-6 h-6" />} color="slate" />
        </div>
      </Section>

      {/* Indicadores + Rutas activas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Indicadores clave */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6 space-y-5">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Indicadores Clave</h3>
          <div className="space-y-4">
            {[
              { label: 'Efectividad de entrega',  value: inv.effectivenessRate, color: 'bg-emerald-500', text: 'text-emerald-600' },
              { label: 'Utilización de flota',     value: fleetUtilization,      color: 'bg-blue-500',    text: 'text-blue-600' },
              { label: 'Tasa de devolución',       value: inv.returnRate,         color: inv.returnRate > 10 ? 'bg-red-500' : 'bg-amber-400', text: inv.returnRate > 10 ? 'text-red-500' : 'text-amber-500' },
              { label: 'Conductores activos',      value: drv.total > 0 ? Math.round((drv.active / drv.total) * 100) : 0, color: 'bg-purple-500', text: 'text-purple-600' },
              { label: 'Conciliaciones completadas', value: conciliation.total > 0 ? Math.round((conciliation.completadas / conciliation.total) * 100) : 0, color: 'bg-emerald-400', text: 'text-emerald-600' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black text-slate-600 uppercase">{item.label}</span>
                  <span className={`text-[11px] font-black ${item.text}`}>{item.value}%</span>
                </div>
                <BarChart value={item.value} max={100} color={item.color} />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-50 grid grid-cols-4 gap-2">
            {[
              { label: 'Entregados', val: inv.delivered,  color: 'bg-emerald-500' },
              { label: 'En Ruta',    val: inv.inRoute,    color: 'bg-blue-500' },
              { label: 'Pendientes', val: inv.pending,    color: 'bg-amber-400' },
              { label: 'Devueltos',  val: inv.returned,   color: 'bg-red-500' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className={`w-3 h-3 ${item.color} rounded-full mx-auto mb-1`} />
                <div className="text-lg font-black text-slate-900">{item.val}</div>
                <div className="text-[8px] font-black text-slate-400 uppercase leading-tight">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rutas en operación */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-4">Rutas en Operación</h3>
          {activeRoutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-300">
              <Icons.MapPin className="w-10 h-10 mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest">Sin rutas activas</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-72">
              {activeRoutes.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                    <Icons.Truck className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-900 uppercase truncate">{r.name || 'Ruta s/n'}</p>
                    <p className="text-[9px] font-bold text-slate-400 truncate">{r.driver || 'Sin conductor'} · {r.plate || 'Sin vehículo'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase shrink-0 ${
                    ['activo','active','en ruta'].includes(String(r.status || '').toLowerCase())
                      ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}>{r.status || 'N/A'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Efectividad por ciudad */}
      {topCities.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-4">Efectividad por Ciudad</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Ciudad', 'Total Docs', 'Entregados', 'Devueltos', 'Efectividad'].map(h => (
                    <th key={h} className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCities.map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-black text-slate-900 text-xs uppercase">{c.city}</td>
                    <td className="py-3 px-4 font-bold text-slate-600 text-xs">{c.total}</td>
                    <td className="py-3 px-4"><span className="flex items-center gap-1 text-xs font-black text-emerald-600"><Icons.CheckCircle className="w-3 h-3" />{c.delivered}</span></td>
                    <td className="py-3 px-4"><span className="flex items-center gap-1 text-xs font-black text-red-500"><Icons.AlertTriangle className="w-3 h-3" />{c.returned}</span></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-1.5 rounded-full ${c.effectiveness >= 80 ? 'bg-emerald-500' : c.effectiveness >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                            style={{ width: `${c.effectiveness}%` }} />
                        </div>
                        <span className={`text-[10px] font-black ${c.effectiveness >= 80 ? 'text-emerald-600' : c.effectiveness >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{c.effectiveness}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Eficiencia de vehículos */}
      {vehicleEfficiency.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-4">Eficiencia de Vehículos — últimos 30 días</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Vehículo', 'Cap. M³', 'Rutas', 'Util. Prom.', 'Util. Máx.', 'Vol. Total'].map(h => (
                    <th key={h} className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicleEfficiency.map((v, i) => {
                  const utilColor = v.avgUtilization >= 80 ? 'text-emerald-600' : v.avgUtilization >= 50 ? 'text-amber-500' : 'text-red-500';
                  const barColor  = v.avgUtilization >= 80 ? 'bg-emerald-500' : v.avgUtilization >= 50 ? 'bg-amber-400' : 'bg-red-500';
                  return (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-black text-slate-900 text-xs uppercase">{v.plate}</td>
                      <td className="py-3 px-4 font-bold text-slate-500 text-xs">{v.capacityM3.toFixed(1)} m³</td>
                      <td className="py-3 px-4 font-bold text-slate-700 text-xs">{v.totalRoutes}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.min(v.avgUtilization, 100)}%` }} />
                          </div>
                          <span className={`text-[10px] font-black ${utilColor}`}>{v.avgUtilization.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4"><span className={`text-[10px] font-black ${v.maxUtilization >= 90 ? 'text-red-500' : 'text-slate-600'}`}>{v.maxUtilization}%</span></td>
                      <td className="py-3 px-4 font-bold text-slate-600 text-xs">{v.totalVolumeDispatched.toFixed(2)} m³</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Círculos de progreso */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CircleProgress label="Vehículos en Ruta"        value={veh.onRoute}              total={veh.total}              textColor="text-blue-600" />
        <CircleProgress label="Documentos Completados"   value={inv.delivered}            total={inv.total}              textColor="text-emerald-600" />
        <CircleProgress label="Conciliaciones Completas" value={conciliation.completadas} total={conciliation.total || 1} textColor="text-purple-600" />
      </div>

    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{title}</p>
    {children}
  </div>
);

export default AjoverDashboard;
