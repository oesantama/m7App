import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';

interface AjoverStats {
  vehicles: { total: number; available: number; onRoute: number; totalCapacityM3: number; totalCapacityKg: number };
  drivers: { total: number; active: number };
  routes: { total: number; active: number; completed: number; pending: number };
  invoices: { total: number; delivered: number; inRoute: number; pending: number; returned: number; deliveredWeight: number; effectivenessRate: number; returnRate: number };
  topCities: { city: string; total: number; delivered: number; returned: number; effectiveness: number }[];
  activeRoutes: { name: string; status: string; plate: string; driver: string }[];
}

interface Props {
  user: any;
  vehicles?: any[];
  drivers?: any[];
  routes?: any[];
  invoices?: any[];
}

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon?: React.ReactNode }> = ({ label, value, sub, color = 'blue', icon }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500',
    red: 'bg-red-500', purple: 'bg-purple-500', slate: 'bg-slate-700',
  };
  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-lg p-5 flex items-center gap-4">
      <div className={`w-12 h-12 ${colors[color]} rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg`}>
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

const AjoverDashboard: React.FC<Props> = ({ vehicles = [], drivers = [], routes = [], invoices = [] }) => {
  const [stats, setStats] = useState<AjoverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/ajover-stats', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      setStats(data);
      setLastUpdated(new Date());
    } catch {
      // Fallback con datos locales del store si el endpoint falla
      const onRouteVehicles = vehicles.filter(v =>
        ['en ruta', 'in route', 'activo', 'est-02'].includes(String(v.status || v.statusId || '').toLowerCase())
      );
      const availableVehicles = vehicles.filter(v =>
        ['disponible', 'available', 'est-01'].includes(String(v.status || v.statusId || '').toLowerCase())
      );
      const activeDrivers = drivers.filter(d =>
        ['activo', 'active', 'est-01'].includes(String(d.status || d.statusId || '').toLowerCase())
      );
      const activeRoutesList = routes.filter(r =>
        ['activo', 'active', 'en ruta'].includes(String(r.status || '').toLowerCase())
      );
      const delivered = invoices.filter(i => ['entregado', 'finalizado', 'delivered'].includes(String(i.status || '').toLowerCase()));
      const returned = invoices.filter(i => ['devuelto', 'returned', 'retorno'].includes(String(i.status || '').toLowerCase()));
      const inRoute = invoices.filter(i => ['en ruta', 'despachado', 'in route'].includes(String(i.status || '').toLowerCase()));
      const pending = invoices.filter(i => ['pendiente', 'pending', 'procesando'].includes(String(i.status || '').toLowerCase()));
      const total = invoices.length || 1;
      setStats({
        vehicles: {
          total: vehicles.length,
          available: availableVehicles.length,
          onRoute: onRouteVehicles.length,
          totalCapacityM3: vehicles.reduce((s, v) => s + (Number(v.capacityM3) || 0), 0),
          totalCapacityKg: vehicles.reduce((s, v) => s + (Number(v.capacityKg) || 0), 0),
        },
        drivers: { total: drivers.length, active: activeDrivers.length },
        routes: { total: routes.length, active: activeRoutesList.length, completed: 0, pending: 0 },
        invoices: {
          total: invoices.length,
          delivered: delivered.length,
          inRoute: inRoute.length,
          pending: pending.length,
          returned: returned.length,
          deliveredWeight: 0,
          effectivenessRate: Math.round((delivered.length / total) * 100),
          returnRate: Math.round((returned.length / total) * 100),
        },
        topCities: [],
        activeRoutes: activeRoutesList.slice(0, 8).map(r => ({
          name: r.name || r.id,
          status: r.status,
          plate: r.plate || r.vehicleId || '-',
          driver: r.driverName || r.driverId || '-',
        })),
      });
      setError('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Cargando operación Ajover...</p>
      </div>
    </div>
  );

  if (!stats) return null;

  const { vehicles: veh, drivers: drv, routes: rts, invoices: inv, topCities, activeRoutes } = stats;
  const fleetUtilization = veh.total > 0 ? Math.round((veh.onRoute / veh.total) * 100) : 0;

  return (
    <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="flex items-center gap-5 z-10">
          <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 text-white shrink-0">
            <Icons.Package className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Dashboard Informativa Ajover</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Operación en tiempo real · CLI-01
              {lastUpdated && <span className="text-slate-300 font-bold normal-case tracking-normal">· {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={fetchStats}
          className="px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all flex items-center gap-2"
        >
          <Icons.History className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* KPI Cards — Fila 1: Flota */}
      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Flota & Conductores</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Vehículos Total" value={veh.total} icon={<Icons.Truck className="w-6 h-6" />} color="slate" />
          <StatCard label="En Ruta" value={veh.onRoute} sub={`${fleetUtilization}% utilización`} icon={<Icons.MapPin className="w-6 h-6" />} color="blue" />
          <StatCard label="Disponibles" value={veh.available} icon={<Icons.CheckCircle className="w-6 h-6" />} color="green" />
          <StatCard label="Conductores" value={drv.total} sub={`${drv.active} activos`} icon={<Icons.User className="w-6 h-6" />} color="purple" />
          <StatCard label="Cap. Total M³" value={veh.totalCapacityM3.toFixed(1)} icon={<Icons.Package className="w-6 h-6" />} color="amber" />
          <StatCard label="Cap. Total Kg" value={veh.totalCapacityKg > 0 ? `${(veh.totalCapacityKg/1000).toFixed(1)}T` : '-'} icon={<Icons.Package className="w-6 h-6" />} color="amber" />
        </div>
      </div>

      {/* KPI Cards — Fila 2: Operación */}
      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Operación de Entregas (últimos 30 días)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Docs" value={inv.total} icon={<Icons.FileText className="w-6 h-6" />} color="slate" />
          <StatCard label="Entregados" value={inv.delivered} sub={`${inv.effectivenessRate}% efectividad`} icon={<Icons.CheckCircle className="w-6 h-6" />} color="green" />
          <StatCard label="En Ruta" value={inv.inRoute} icon={<Icons.Truck className="w-6 h-6" />} color="blue" />
          <StatCard label="Pendientes" value={inv.pending} icon={<Icons.History className="w-6 h-6" />} color="amber" />
          <StatCard label="Devueltos" value={inv.returned} sub={`${inv.returnRate}% tasa`} icon={<Icons.AlertTriangle className="w-6 h-6" />} color="red" />
          <StatCard label="Rutas Activas" value={rts.active} sub={`${rts.total} totales`} icon={<Icons.MapPin className="w-6 h-6" />} color="purple" />
        </div>
      </div>

      {/* Fila 3: Gráficas de efectividad + Rutas activas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Efectividad y métricas */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6 space-y-5">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Indicadores Clave</h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black text-slate-600 uppercase">Efectividad de entrega</span>
                <span className="text-[11px] font-black text-emerald-600">{inv.effectivenessRate}%</span>
              </div>
              <BarChart value={inv.effectivenessRate} max={100} color="bg-emerald-500" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black text-slate-600 uppercase">Utilización de flota</span>
                <span className="text-[11px] font-black text-blue-600">{fleetUtilization}%</span>
              </div>
              <BarChart value={fleetUtilization} max={100} color="bg-blue-500" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black text-slate-600 uppercase">Tasa de devolución</span>
                <span className={`text-[11px] font-black ${inv.returnRate > 10 ? 'text-red-500' : 'text-amber-500'}`}>{inv.returnRate}%</span>
              </div>
              <BarChart value={inv.returnRate} max={100} color={inv.returnRate > 10 ? 'bg-red-500' : 'bg-amber-400'} />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black text-slate-600 uppercase">Conductores activos</span>
                <span className="text-[11px] font-black text-purple-600">{drv.total > 0 ? Math.round((drv.active / drv.total) * 100) : 0}%</span>
              </div>
              <BarChart value={drv.active} max={drv.total} color="bg-purple-500" />
            </div>
          </div>

          {/* Resumen visual docs */}
          <div className="pt-4 border-t border-slate-50 grid grid-cols-4 gap-2">
            {[
              { label: 'Entregados', val: inv.delivered, color: 'bg-emerald-500' },
              { label: 'En Ruta', val: inv.inRoute, color: 'bg-blue-500' },
              { label: 'Pendientes', val: inv.pending, color: 'bg-amber-400' },
              { label: 'Devueltos', val: inv.returned, color: 'bg-red-500' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className={`w-3 h-3 ${item.color} rounded-full mx-auto mb-1`} />
                <div className="text-lg font-black text-slate-900">{item.val}</div>
                <div className="text-[8px] font-black text-slate-400 uppercase leading-tight">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rutas Activas */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-4">Rutas en Operación</h3>
          {activeRoutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-300">
              <Icons.MapPin className="w-10 h-10 mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest">Sin rutas activas</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-64">
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
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}>{r.status || 'N/A'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla: Top ciudades / rutas */}
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
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs font-black text-emerald-600">
                        <Icons.CheckCircle className="w-3 h-3" />{c.delivered}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs font-black text-red-500">
                        <Icons.AlertTriangle className="w-3 h-3" />{c.returned}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${c.effectiveness >= 80 ? 'bg-emerald-500' : c.effectiveness >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                            style={{ width: `${c.effectiveness}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-black ${c.effectiveness >= 80 ? 'text-emerald-600' : c.effectiveness >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                          {c.effectiveness}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Estado de la flota en detalle */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Vehículos en Ruta', value: veh.onRoute, total: veh.total, color: 'bg-blue-500', textColor: 'text-blue-600' },
          { label: 'Documentos Completados', value: inv.delivered, total: inv.total, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
          { label: 'Rutas Completadas', value: rts.completed, total: rts.total, color: 'bg-purple-500', textColor: 'text-purple-600' },
        ].map(item => {
          const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
          return (
            <div key={item.label} className="bg-white rounded-[2rem] border border-slate-100 shadow-lg p-6 flex flex-col items-center justify-center gap-3">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{item.label}</p>
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${pct} ${100 - pct}`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    className={item.textColor}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-900">{pct}%</span>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400">{item.value} / {item.total}</p>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default AjoverDashboard;
