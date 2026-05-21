import React, { useState, useCallback } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, Sector,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface User { id: string; name: string; }
interface Props { user: User; }

const COLORS = [
  '#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6',
  '#a855f7','#3b82f6','#e11d48','#65a30d','#0891b2',
  '#d946ef','#0ea5e9','#10b981','#f43f5e','#7c3aed',
];

const TDM_COLORS = ['#f59e0b','#fbbf24','#fcd34d','#f97316','#fb923c','#fdba74','#fde68a','#d97706','#b45309','#92400e','#78350f','#451a03'];

const EmptyChart = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-slate-300">
    <p className="text-4xl mb-2">📊</p>
    <p className="text-xs font-bold uppercase tracking-widest">{label}</p>
    <p className="text-[10px] mt-1">Sin datos en el rango seleccionado</p>
  </div>
);

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 12}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 14} outerRadius={outerRadius + 18}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

interface PieEntry { name: string; value: number; }

const InteractivePieCard = ({
  title, data, colors, rawRows, cityMode,
}: {
  title: string;
  data: PieEntry[];
  colors: string[];
  rawRows: any[];
  cityMode?: boolean;
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);

  const selected = activeIdx !== null ? data[activeIdx] : null;

  // In cityMode: show operator breakdown; otherwise: show city breakdown
  const detailBreakdown: { label: string; qty: number }[] = selected
    ? cityMode
      ? Object.entries(
          rawRows
            .filter(r => (r.city || 'SIN CIUDAD').toUpperCase().trim() === selected.name)
            .reduce((acc: Record<string, number>, r) => {
              acc[r.operator] = (acc[r.operator] || 0) + r.quantity;
              return acc;
            }, {})
        ).map(([label, qty]) => ({ label, qty: qty as number })).sort((a, b) => b.qty - a.qty)
      : Object.entries(
          rawRows
            .filter(r => r.client_name === selected.name)
            .reduce((acc: Record<string, number>, r) => {
              acc[(r.city || 'SIN CIUDAD').toUpperCase()] = (acc[(r.city || 'SIN CIUDAD').toUpperCase()] || 0) + r.quantity;
              return acc;
            }, {})
        ).map(([label, qty]) => ({ label, qty: qty as number })).sort((a, b) => b.qty - a.qty)
    : [];

  const cityBreakdown = detailBreakdown; // alias for template below

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">{title}</h3>
        <span className="px-3 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-500">{total} viajes</span>
      </div>

      {data.length === 0 ? (
        <EmptyChart label="Sin operaciones" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={460}>
            <PieChart>
              <Pie
                data={data}
                cx="50%" cy="50%"
                outerRadius={160}
                dataKey="value"
                activeIndex={activeIdx ?? undefined}
                activeShape={renderActiveShape}
                onMouseEnter={(_, idx) => setActiveIdx(idx)}
                onMouseLeave={() => { if (activeIdx !== null) {} }}
                onClick={(_, idx) => setActiveIdx(prev => prev === idx ? null : idx)}
                cursor="pointer"
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]}
                    opacity={activeIdx === null || activeIdx === i ? 1 : 0.45} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any, name: string) => [
                  `${v} viajes (${((v / total) * 100).toFixed(1)}%)`, name
                ]}
              />
              <Legend
                iconType="circle" iconSize={8}
                formatter={(v) => (
                  <span className="text-[10px] font-bold text-slate-600">{v}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Detail panel */}
          {selected && (
            <div className={`mt-4 rounded-2xl border-2 p-4 transition-all`}
              style={{ borderColor: colors[activeIdx! % colors.length] + '55', background: colors[activeIdx! % colors.length] + '0d' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: colors[activeIdx! % colors.length] }} />
                  <span className="font-black text-slate-800 text-sm">{selected.name}</span>
                </div>
                <button onClick={() => setActiveIdx(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-black px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-all">
                  ✕ Cerrar
                </button>
              </div>

              <div className="flex flex-wrap gap-4 mb-3">
                <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Viajes</p>
                  <p className="text-xl font-black" style={{ color: colors[activeIdx! % colors.length] }}>
                    {selected.value.toLocaleString('es-CO')}
                  </p>
                </div>
                <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">% del Total</p>
                  <p className="text-xl font-black text-slate-700">
                    {((selected.value / total) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {cityMode ? 'Operadores' : 'Ciudades'}
                  </p>
                  <p className="text-xl font-black text-slate-700">{cityBreakdown.length}</p>
                </div>
              </div>

              {cityBreakdown.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                      <th className="text-left pb-2">{cityMode ? 'Operador' : 'Ciudad'}</th>
                      <th className="text-right pb-2">Viajes</th>
                      <th className="text-right pb-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityBreakdown.map(({ label, qty }) => (
                      <tr key={label} className="border-t border-slate-100">
                        <td className="py-1.5 font-bold text-slate-700">{label}</td>
                        <td className="text-right font-black text-slate-800">{qty}</td>
                        <td className="text-right font-bold text-slate-500">
                          {((qty / selected!.value) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default function InformesFlota({ user: _user }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!from || !to) { toast.error('Seleccione rango de fechas'); return; }
    setLoading(true);
    try {
      const res = await api.getFlotaReport({ from, to });
      if (res.success) {
        setRawData(res.data || []);
        setSearched(true);
      } else {
        toast.error(res.error || 'Error al cargar datos');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const aggregate = (rows: any[]): PieEntry[] => {
    const map = new Map<string, number>();
    rows.forEach(r => map.set(r.client_name, (map.get(r.client_name) || 0) + r.quantity));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const m7Rows  = rawData.filter(r => r.operator === 'M7');
  const tdmRows = rawData.filter(r => r.operator === 'TDM');

  const m7Data  = aggregate(m7Rows);
  const tdmData = aggregate(tdmRows);

  // Participation by city — aggregate all operators
  const cityMap = new Map<string, number>();
  rawData.forEach(r => {
    const city = (r.city || 'SIN CIUDAD').toUpperCase().trim();
    cityMap.set(city, (cityMap.get(city) || 0) + r.quantity);
  });
  const cityData: PieEntry[] = Array.from(cityMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const CITY_COLORS = [
    '#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6',
    '#a855f7','#3b82f6',
  ];

  const m7Clients  = new Set(m7Rows.map(r => r.client_name)).size;
  const tdmClients = new Set(tdmRows.map(r => r.client_name)).size;
  const totalClients = m7Clients + tdmClients || 1;

  const barData = [
    { name: 'Milla 7', clientes: m7Clients, viajes: m7Rows.reduce((s, r) => s + r.quantity, 0), pct: Math.round((m7Clients / totalClients) * 100), fill: '#6366f1' },
    { name: 'TDM',     clientes: tdmClients, viajes: tdmRows.reduce((s, r) => s + r.quantity, 0), pct: Math.round((tdmClients / totalClients) * 100), fill: '#f59e0b' },
  ];

  const totalViajes = rawData.reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Módulo Gerencia • PAG-61</p>
          <h1 className="text-2xl font-black text-slate-900 mt-0.5">Informes Flota</h1>
          <p className="text-sm text-slate-500 mt-0.5">Distribución de operaciones por cliente, operador y ciudad</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all" />
          </div>
          <button onClick={handleSearch} disabled={loading}
            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50">
            {loading ? 'Cargando...' : '📊 Generar Informe'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {searched && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Viajes', value: totalViajes, color: 'bg-indigo-600', icon: '🚛' },
            { label: 'Viajes M7', value: m7Rows.reduce((s, r) => s + r.quantity, 0), color: 'bg-violet-600', icon: '🏢' },
            { label: 'Viajes TDM', value: tdmRows.reduce((s, r) => s + r.quantity, 0), color: 'bg-amber-500', icon: '⭐' },
            { label: 'Clientes', value: new Set(rawData.map(r => r.client_name)).size, color: 'bg-emerald-600', icon: '👥' },
          ].map(k => (
            <div key={k.label} className={`${k.color} text-white rounded-3xl p-5 shadow-sm`}>
              <p className="text-2xl">{k.icon}</p>
              <p className="text-2xl font-black mt-1">{k.value.toLocaleString('es-CO')}</p>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Gráficas interactivas — ancho completo */}
      {searched && (
        <>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Haz clic en una tajada para ver detalle del cliente
          </p>

          <InteractivePieCard title="🏢 Flota M7 — Por Cliente"    data={m7Data}   colors={COLORS}      rawRows={m7Rows} />
          <InteractivePieCard title="⭐ Flota TDM — Por Cliente"  data={tdmData}  colors={TDM_COLORS}  rawRows={tdmRows} />
          <InteractivePieCard title="🏙️ Participación por Ciudad" data={cityData} colors={CITY_COLORS} rawRows={rawData} cityMode />

          {/* Gráfica comparativa */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">📊 Comparativo M7 vs TDM — Clientes y Viajes</h3>
            </div>
            {(m7Clients === 0 && tdmClients === 0) ? (
              <EmptyChart label="Sin datos para comparativo" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Cantidad de Clientes</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [`${v} clientes`, 'Clientes']} />
                      <Bar dataKey="clientes" radius={[8, 8, 0, 0]}>
                        {barData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                        <LabelList dataKey="pct" position="top" formatter={(v: any) => `${v}%`} style={{ fontSize: 11, fontWeight: 'bold' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Cantidad de Viajes</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip formatter={(v: any) => [`${v} viajes`, 'Viajes']} />
                      <Bar dataKey="viajes" radius={[8, 8, 0, 0]}>
                        {barData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                        <LabelList dataKey="viajes" position="top" style={{ fontSize: 11, fontWeight: 'bold' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="lg:col-span-2 border-t border-slate-100 pt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="text-left pb-3">Operador</th>
                        <th className="text-right pb-3">Clientes</th>
                        <th className="text-right pb-3">% Clientes</th>
                        <th className="text-right pb-3">Viajes</th>
                        <th className="text-right pb-3">% Viajes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barData.map(b => (
                        <tr key={b.name} className="border-t border-slate-50">
                          <td className="py-2.5 font-black" style={{ color: b.fill }}>{b.name}</td>
                          <td className="text-right font-bold text-slate-700">{b.clientes}</td>
                          <td className="text-right font-bold text-slate-500">{b.pct}%</td>
                          <td className="text-right font-bold text-slate-700">{b.viajes.toLocaleString('es-CO')}</td>
                          <td className="text-right font-bold text-slate-500">
                            {totalViajes > 0 ? Math.round((b.viajes / totalViajes) * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 font-black text-slate-900">
                        <td className="py-2.5">TOTAL</td>
                        <td className="text-right">{m7Clients + tdmClients}</td>
                        <td className="text-right">100%</td>
                        <td className="text-right">{totalViajes.toLocaleString('es-CO')}</td>
                        <td className="text-right">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!searched && !loading && (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-100 shadow-sm">
          <p className="text-5xl mb-4">📊</p>
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Selecciona un rango de fechas y genera el informe</p>
        </div>
      )}
    </div>
  );
}
