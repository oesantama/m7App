import React, { useState } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Package, Truck, RotateCcw, FileText, Car, Users,
  MapPin, Search, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle, Clock, ArrowRight, BarChart2
} from 'lucide-react';

// ── tipos ─────────────────────────────────────────────────────
interface GerenciaData {
  periodo: { from: string; to: string };
  recibido:    { total_docs: number; total_items: number; items_auditados: number; pct_auditado: number };
  despacho:    { total: number; completados: number; by_day: { fecha: string; despachos: number }[] };
  devoluciones:{ total: number; by_status: PieItem[]; by_type: PieItem[] };
  documentos:  { total: number; by_status: PieItem[] };
  vehiculos:   { total: number; activos: number };
  conductores: { total: number; activos: number };
  rutas:       { total: number; activas: number };
}
interface PieItem { name: string; value: number }

// ── paleta ────────────────────────────────────────────────────
const PIE_COLORS  = ['#1E5AC8','#0EB574','#F59E0B','#EF4444','#7C3AED','#06B6D4'];
const BAR_COLOR   = '#1E5AC8';
const AREA_COLOR  = '#0EB574';

const fmtNum = (n: number) => n.toLocaleString('es-CO');
const fmtPct = (n: number) => `${n}%`;

// ── componentes pequeños ──────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, color = '#1E5AC8', trend }: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: string; trend?: 'up' | 'down' | 'neutral';
}) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <div className="p-2 rounded-xl" style={{ background: `${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      {trend === 'up'   && <TrendingUp  size={14} className="text-emerald-500" />}
      {trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
    </div>
    <div>
      <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-400 font-semibold mt-0.5">{sub}</p>}
    </div>
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{children}</h3>
);

const ProgressBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span className="font-black">{fmtNum(value)} <span className="text-slate-400 font-normal">/ {fmtNum(total)}</span></span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[10px] text-slate-400 text-right">{pct}% utilización</p>
    </div>
  );
};

const CustomTooltipBar = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {fmtNum(p.value)}</p>
      ))}
    </div>
  );
};

const CustomTooltipPie = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-slate-700">{payload[0].name}</p>
      <p className="font-black" style={{ color: payload[0].payload.fill }}>{fmtNum(payload[0].value)}</p>
    </div>
  );
};

// ── funnel del ciclo ──────────────────────────────────────────
const CycleStep = ({ icon: Icon, label, value, color, arrow }: {
  icon: any; label: string; value: number; color: string; arrow?: boolean;
}) => (
  <div className="flex items-center gap-2">
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${color}18` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <p className="text-lg font-black text-slate-900">{fmtNum(value)}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center leading-tight">{label}</p>
    </div>
    {arrow && <ArrowRight size={16} className="text-slate-300 shrink-0" />}
  </div>
);

// ── componente principal ──────────────────────────────────────
const ExecutiveDashboard: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = `${today.slice(0, 7)}-01`;

  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo,   setDateTo]   = useState(today);
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState<GerenciaData | null>(null);
  const [queried,  setQueried]  = useState(false);

  const handleConsultar = async () => {
    if (!dateFrom || !dateTo) { toast.error('Seleccione rango de fechas'); return; }
    if (dateFrom > dateTo)    { toast.error('Fecha inicial mayor que final'); return; }
    setLoading(true);
    setQueried(true);
    try {
      const result = await (api as any).getGerenciaDashboard(dateFrom, dateTo);
      setData(result);
    } catch (e: any) {
      toast.error('Error cargando datos: ' + (e.message || 'Error de red'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-blue-50 rounded-xl">
              <BarChart2 size={22} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Dashboard Ejecutivo</h1>
              <p className="text-xs text-slate-400 font-medium">Gestión integral — Recibido · Despacho · Devolución · Flota</p>
            </div>
          </div>

          {/* controles de fecha */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Desde</span>
              <input
                type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="text-sm font-semibold text-slate-700 bg-transparent outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta</span>
              <input
                type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="text-sm font-semibold text-slate-700 bg-transparent outline-none"
              />
            </div>
            <button
              onClick={handleConsultar}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition active:scale-95 shadow-lg shadow-blue-200"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Cargando...</>
                : <><Search size={14} />Consultar</>
              }
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Estado inicial ── */}
        {!queried && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center">
              <Search size={28} className="text-blue-400" />
            </div>
            <p className="text-slate-400 font-semibold text-sm">Seleccione un rango de fechas y presione Consultar</p>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-slate-400 font-semibold text-sm">Cargando datos de la operación...</p>
          </div>
        )}

        {/* ── Datos ── */}
        {!loading && data && (
          <>
            {/* período activo */}
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-xs font-bold text-slate-500">
                Período: {data.periodo.from} → {data.periodo.to}
              </span>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                icon={Package} label="Docs Recibidos" color="#1E5AC8"
                value={fmtNum(data.recibido.total_docs)}
                sub={`${fmtNum(data.recibido.total_items)} ítems`}
              />
              <KpiCard
                icon={CheckCircle} label="Auditado" color="#0EB574"
                value={fmtPct(data.recibido.pct_auditado)}
                sub={`${fmtNum(data.recibido.items_auditados)} ítems`}
                trend={data.recibido.pct_auditado >= 90 ? 'up' : 'down'}
              />
              <KpiCard
                icon={Truck} label="Despachos" color="#7C3AED"
                value={fmtNum(data.despacho.total)}
                sub={`${fmtNum(data.despacho.completados)} completados`}
                trend="up"
              />
              <KpiCard
                icon={RotateCcw} label="Devoluciones" color="#EF4444"
                value={fmtNum(data.devoluciones.total)}
                sub="en el período"
                trend={data.devoluciones.total > 5 ? 'down' : 'neutral'}
              />
              <KpiCard
                icon={Car} label="Vehículos" color="#F59E0B"
                value={`${data.vehiculos.activos} / ${data.vehiculos.total}`}
                sub="activos / total"
              />
              <KpiCard
                icon={Users} label="Conductores" color="#06B6D4"
                value={`${data.conductores.activos} / ${data.conductores.total}`}
                sub="activos / total"
              />
            </div>

            {/* ── Ciclo operativo ── */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <SectionTitle>Ciclo Operativo — Bodega Ajover</SectionTitle>
              <div className="flex items-start justify-center gap-0 flex-wrap">
                <CycleStep icon={Package}    label="Recibidos"   value={data.recibido.total_docs}     color="#1E5AC8" arrow />
                <CycleStep icon={FileText}   label="Auditados"   value={data.recibido.items_auditados} color="#0EB574" arrow />
                <CycleStep icon={Truck}      label="Despachados" value={data.despacho.completados}     color="#7C3AED" arrow />
                <CycleStep icon={RotateCcw}  label="Devueltos"   value={data.devoluciones.total}       color="#EF4444" arrow />
                <CycleStep icon={MapPin}     label="Rutas Activas" value={data.rutas.activas}          color="#F59E0B" />
              </div>
            </div>

            {/* ── Gráficas fila 1 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Bar — despachos por día */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <SectionTitle>Despachos por Día</SectionTitle>
                {data.despacho.by_day.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-12">Sin despachos en el período</p>
                  : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.despacho.by_day} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="fecha" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                          tickFormatter={v => v.slice(5)} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<CustomTooltipBar />} />
                        <Bar dataKey="despachos" name="Despachos" fill={BAR_COLOR} radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>

              {/* Pie — documentos por estado */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <SectionTitle>Estado Documentos</SectionTitle>
                {data.documentos.total === 0
                  ? <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <AlertCircle size={24} className="text-slate-300" />
                      <p className="text-slate-400 text-xs">Sin documentos en el período</p>
                    </div>
                  : (
                    <>
                      <ResponsiveContainer width="100%" height={150}>
                        <PieChart>
                          <Pie data={data.documentos.by_status} cx="50%" cy="50%"
                            innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                            {data.documentos.by_status.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltipPie />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-2">
                        {data.documentos.by_status.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="font-semibold text-slate-600">{item.name}</span>
                            </div>
                            <span className="font-black text-slate-800">{fmtNum(item.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                }
              </div>
            </div>

            {/* ── Gráficas fila 2 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Pie — devoluciones por estado */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <SectionTitle>Devoluciones por Estado</SectionTitle>
                {data.devoluciones.total === 0
                  ? <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <CheckCircle size={24} className="text-emerald-300" />
                      <p className="text-slate-400 text-xs">Sin devoluciones en el período</p>
                    </div>
                  : (
                    <>
                      <ResponsiveContainer width="100%" height={150}>
                        <PieChart>
                          <Pie data={data.devoluciones.by_status} cx="50%" cy="50%"
                            innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                            {data.devoluciones.by_status.map((_, i) => (
                              <Cell key={i} fill={['#EF4444','#F59E0B','#0EB574','#1E5AC8'][i % 4]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltipPie />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-2">
                        {data.devoluciones.by_status.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: ['#EF4444','#F59E0B','#0EB574','#1E5AC8'][i%4] }} />
                              <span className="font-semibold text-slate-600">{item.name}</span>
                            </div>
                            <span className="font-black text-slate-800">{fmtNum(item.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                }
              </div>

              {/* Area — tendencia auditado vs despacho por día */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <SectionTitle>Tendencia Operativa — Despachos Acumulados</SectionTitle>
                {data.despacho.by_day.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-12">Sin datos en el período</p>
                  : (() => {
                      let acc = 0;
                      const cumulative = data.despacho.by_day.map(d => ({
                        fecha: d.fecha.slice(5),
                        despachos: d.despachos,
                        acumulado: (acc += d.despachos)
                      }));
                      return (
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={cumulative} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gradD" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#1E5AC8" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#1E5AC8" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={AREA_COLOR} stopOpacity={0.2} />
                                <stop offset="95%" stopColor={AREA_COLOR} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="fecha" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomTooltipBar />} />
                            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                            <Area type="monotone" dataKey="despachos" name="Por día"   stroke="#1E5AC8" fill="url(#gradD)" strokeWidth={2} dot={false} />
                            <Area type="monotone" dataKey="acumulado"  name="Acumulado" stroke={AREA_COLOR} fill="url(#gradA)" strokeWidth={2} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      );
                    })()
                }
              </div>
            </div>

            {/* ── Flota y conductores ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Vehículos */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                <SectionTitle>Flota de Vehículos</SectionTitle>
                <ProgressBar
                  label="Activos"
                  value={data.vehiculos.activos}
                  total={data.vehiculos.total}
                  color="#F59E0B"
                />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { label: 'Total',     val: data.vehiculos.total,  color: '#1E5AC8' },
                    { label: 'Activos',   val: data.vehiculos.activos, color: '#0EB574' },
                    { label: 'Inactivos', val: data.vehiculos.total - data.vehiculos.activos, color: '#EF4444' },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col items-center p-3 rounded-xl bg-slate-50 gap-1">
                      <p className="text-xl font-black" style={{ color: item.color }}>{fmtNum(item.val)}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Activos',   value: data.vehiculos.activos },
                        { name: 'Inactivos', value: Math.max(0, data.vehiculos.total - data.vehiculos.activos) }
                      ]}
                      cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={4} dataKey="value"
                    >
                      <Cell fill="#0EB574" />
                      <Cell fill="#FCA5A5" />
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Conductores */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                <SectionTitle>Conductores</SectionTitle>
                <ProgressBar
                  label="Activos"
                  value={data.conductores.activos}
                  total={data.conductores.total}
                  color="#06B6D4"
                />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { label: 'Total',     val: data.conductores.total,  color: '#1E5AC8' },
                    { label: 'Activos',   val: data.conductores.activos, color: '#0EB574' },
                    { label: 'Inactivos', val: data.conductores.total - data.conductores.activos, color: '#EF4444' },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col items-center p-3 rounded-xl bg-slate-50 gap-1">
                      <p className="text-xl font-black" style={{ color: item.color }}>{fmtNum(item.val)}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Activos',   value: data.conductores.activos },
                        { name: 'Inactivos', value: Math.max(0, data.conductores.total - data.conductores.activos) }
                      ]}
                      cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={4} dataKey="value"
                    >
                      <Cell fill="#06B6D4" />
                      <Cell fill="#A5F3FC" />
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Rutas + resumen ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                <SectionTitle>Rutas</SectionTitle>
                <ProgressBar
                  label="Activas"
                  value={data.rutas.activas}
                  total={data.rutas.total}
                  color="#7C3AED"
                />
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { label: 'Total rutas',  val: data.rutas.total,  color: '#1E5AC8' },
                    { label: 'Rutas activas',val: data.rutas.activas, color: '#7C3AED' },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col items-center p-3 rounded-xl bg-slate-50 gap-1">
                      <p className="text-2xl font-black" style={{ color: item.color }}>{fmtNum(item.val)}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <SectionTitle>Resumen Ejecutivo del Período</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      icon: Package, color: '#1E5AC8', bg: '#EFF6FF',
                      label: 'Recibido de Material',
                      lines: [
                        `${fmtNum(data.recibido.total_docs)} documentos procesados`,
                        `${fmtNum(data.recibido.total_items)} ítems en total`,
                        `${fmtPct(data.recibido.pct_auditado)} auditado`,
                      ]
                    },
                    {
                      icon: Truck, color: '#7C3AED', bg: '#F5F3FF',
                      label: 'Despacho Logístico',
                      lines: [
                        `${fmtNum(data.despacho.total)} despachos realizados`,
                        `${fmtNum(data.despacho.completados)} completados (${data.despacho.total > 0 ? Math.round(data.despacho.completados / data.despacho.total * 100) : 0}%)`,
                        `${data.despacho.by_day.length} días con actividad`,
                      ]
                    },
                    {
                      icon: RotateCcw, color: '#EF4444', bg: '#FEF2F2',
                      label: 'Devoluciones Bodega',
                      lines: [
                        `${fmtNum(data.devoluciones.total)} devoluciones registradas`,
                        ...data.devoluciones.by_status.slice(0,2).map(s => `${s.name}: ${fmtNum(s.value)}`),
                      ]
                    },
                    {
                      icon: Clock, color: '#F59E0B', bg: '#FFFBEB',
                      label: 'Disponibilidad de Flota',
                      lines: [
                        `${fmtNum(data.vehiculos.activos)} vehículos activos`,
                        `${fmtNum(data.conductores.activos)} conductores disponibles`,
                        `${fmtNum(data.rutas.activas)} rutas configuradas`,
                      ]
                    },
                  ].map((card, i) => (
                    <div key={i} className="p-3 rounded-xl border border-slate-100 flex flex-col gap-2" style={{ background: card.bg }}>
                      <div className="flex items-center gap-2">
                        <card.icon size={14} style={{ color: card.color }} />
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: card.color }}>{card.label}</span>
                      </div>
                      <ul className="space-y-0.5">
                        {card.lines.map((l, j) => (
                          <li key={j} className="text-xs text-slate-600 font-medium">• {l}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
