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

const CITY_TO_DEPT: Record<string, string> = {
  'MEDELLIN': 'ANTIOQUIA',
  'ITAGUI': 'ANTIOQUIA',
  'ENVIGADO': 'ANTIOQUIA',
  'BELLO': 'ANTIOQUIA',
  'SABANETA': 'ANTIOQUIA',
  'LA ESTRELLA': 'ANTIOQUIA',
  'COPACABANA': 'ANTIOQUIA',
  'GIRARDOTA': 'ANTIOQUIA',
  'CALDAS': 'ANTIOQUIA',
  'BARBOSA': 'ANTIOQUIA',
  'RIONEGRO': 'ANTIOQUIA',
  'MARINILLA': 'ANTIOQUIA',
  'GUARNE': 'ANTIOQUIA',
  'CARMEN DE VIBORAL': 'ANTIOQUIA',
  'BOGOTA': 'CUNDINAMARCA',
  'BOGOTA D.C.': 'CUNDINAMARCA',
  'CALI': 'VALLE DEL CAUCA',
  'YUMBO': 'VALLE DEL CAUCA',
  'PALMIRA': 'VALLE DEL CAUCA',
  'BUENAVENTURA': 'VALLE DEL CAUCA',
  'BARRANQUILLA': 'ATLANTICO',
  'SOLEDAD': 'ATLANTICO',
  'CARTAGENA': 'BOLIVAR',
  'SANTA MARTA': 'MAGDALENA',
  'MONTERIA': 'CORDOBA',
  'SINCELEJO': 'SUCRE',
  'VALLEDUPAR': 'CESAR',
  'PEREIRA': 'RISARALDA',
  'DOSQUEBRADAS': 'RISARALDA',
  'MANIZALES': 'CALDAS',
  'ARMENIA': 'QUINDIO',
  'IBAGUE': 'TOLIMA',
  'NEIVA': 'HUILA',
  'VILLAVICENCIO': 'META',
  'CUCUTA': 'NORTE DE SANTANDER',
  'BUCARAMANGA': 'SANTANDER',
  'FLORIDABLANCA': 'SANTANDER',
  'GIRON': 'SANTANDER',
  'PIEDECUESTA': 'SANTANDER',
  'POPAYAN': 'CAUCA',
  'PASTO': 'NARIÑO',
  'TUNJA': 'BOYACA',
};

const getDepartment = (city: string) => {
  const cleanCity = (city || '').toUpperCase().trim();
  return CITY_TO_DEPT[cleanCity] || cleanCity || 'SIN DEPARTAMENTO/CIUDAD';
};

const EmptyChart = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-slate-300">
    <p className="text-4xl mb-2">📊</p>
    <p className="text-xs font-bold uppercase tracking-widest">{label}</p>
    <p className="text-[10px] mt-1">Sin datos en el rango seleccionado</p>
  </div>
);

const truncateName = (str: string, maxLen: number = 18) => {
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
};

const InteractiveBarCard = ({
  title, data, colors, rawRows, primaryGroup, secondaryGroup, dateRange, dualColumns
}: {
  title: string;
  data: any[];
  colors: string[];
  rawRows: any[];
  primaryGroup: 'client' | 'department';
  secondaryGroup: 'client' | 'department';
  dateRange: string;
  dualColumns?: boolean;
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);

  const selected = activeIdx !== null ? data[activeIdx] : null;

  const getPrimaryName = (r: any) => primaryGroup === 'client' ? r.client_name : getDepartment(r.department || r.city);
  const getSecondaryName = (r: any) => secondaryGroup === 'client' ? r.client_name : getDepartment(r.department || r.city);

  // Filter rows based on selection
  const filteredRows = selected 
    ? rawRows.filter(r => getPrimaryName(r) === selected.name)
    : rawRows; 

  // Group breakdown
  const detailBreakdown = selected
    ? Object.entries(
        filteredRows.reduce((acc: Record<string, number>, r) => {
          const key = dualColumns 
            ? `${r.client_name}|||${getDepartment(r.department || r.city)}`
            : getSecondaryName(r);
          acc[key] = (acc[key] || 0) + r.quantity;
          return acc;
        }, {})
      ).map(([key, qty]) => {
         if (dualColumns) {
           const [client, dept] = key.split('|||');
           return { client, dept, qty: qty as number };
         }
         return { label: key, qty: qty as number };
      }).sort((a, b) => b.qty - a.qty)
    : Object.entries(
        filteredRows.reduce((acc: Record<string, number>, r) => {
          const key = dualColumns
            ? `${r.client_name}|||${getDepartment(r.department || r.city)}`
            : getPrimaryName(r);
          acc[key] = (acc[key] || 0) + r.quantity;
          return acc;
        }, {})
      ).map(([key, qty]) => {
         if (dualColumns) {
           const [client, dept] = key.split('|||');
           return { client, dept, qty: qty as number };
         }
         return { label: key, qty: qty as number };
      }).sort((a, b) => b.qty - a.qty);

  const primaryLabel = primaryGroup === 'client' ? 'Cliente' : 'Departamento';
  const secondaryLabel = secondaryGroup === 'client' ? 'Cliente' : 'Departamento';

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">{title}</h3>
        <span className="px-3 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-500">{total} viajes</span>
      </div>

      {data.length === 0 ? (
        <EmptyChart label="Sin operaciones" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={460}>
            <BarChart data={data} margin={{ top: 30, right: 20, bottom: 120, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tickFormatter={(v) => truncateName(v)} angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 9, fontWeight: 600, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                formatter={(v: any, name: string) => [
                  `${v} viajes (${((v / total) * 100).toFixed(1)}%)`, 'Viajes'
                ]}
              />
              <Bar dataKey="value" onClick={(e, idx) => setActiveIdx(prev => prev === idx ? null : idx)} cursor="pointer">
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]}
                    opacity={activeIdx === null || activeIdx === i ? 1 : 0.45} />
                ))}
                <LabelList dataKey="value" position="top" style={{ fontSize: 10, fontWeight: 'bold', fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detail panel */}
          <div className={`mt-4 rounded-2xl border-2 p-4 transition-all`}
            style={{ 
              borderColor: selected ? colors[activeIdx! % colors.length] + '55' : '#e2e8f0', 
              background: selected ? colors[activeIdx! % colors.length] + '0d' : '#f8fafc' 
            }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                {selected ? (
                  <>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colors[activeIdx! % colors.length] }} />
                    <span className="font-black text-slate-800 text-sm leading-tight">
                      {selected.name} <span className="text-slate-400 font-bold ml-1">({dateRange}) — {selected.value.toLocaleString('es-CO')} Viajes</span>
                    </span>
                  </>
                ) : (
                  <span className="font-black text-slate-800 text-sm flex items-center gap-2">
                    <span className="text-lg">📋</span> TODA LA INFORMACIÓN 
                    <span className="text-slate-400 font-bold ml-1">({dateRange}) — {total.toLocaleString('es-CO')} Viajes</span>
                  </span>
                )}
              </div>
              {selected && (
                <button onClick={() => setActiveIdx(null)}
                  className="text-slate-500 hover:text-slate-800 text-xs font-black px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-all flex-shrink-0 border border-slate-200 bg-white shadow-sm">
                  ✕ Mostrar Todos
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Viajes</p>
                <p className="text-xl font-black" style={{ color: selected ? colors[activeIdx! % colors.length] : '#475569' }}>
                  {(selected ? selected.value : total).toLocaleString('es-CO')}
                </p>
              </div>
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">% del Total</p>
                <p className="text-xl font-black text-slate-700">
                  {selected ? ((selected.value / total) * 100).toFixed(1) : '100.0'}%
                </p>
              </div>
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {dualColumns ? 'Registros' : (selected ? secondaryLabel : primaryLabel) + '(s)'}
                </p>
                <p className="text-xl font-black text-slate-700">{detailBreakdown.length}</p>
              </div>
            </div>

            {detailBreakdown.length > 0 && (
              <div className="overflow-x-auto bg-white rounded-xl border border-slate-100 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100">
                      {dualColumns ? (
                        <>
                          <th className="text-left py-3 px-4">Cliente</th>
                          <th className="text-left py-3 px-4">Departamento</th>
                        </>
                      ) : (
                        <th className="text-left py-3 px-4">{selected ? secondaryLabel : primaryLabel}</th>
                      )}
                      <th className="text-right py-3 px-4">Viajes</th>
                      <th className="text-right py-3 px-4">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailBreakdown.map((row: any, idx) => (
                      <tr key={idx} className="border-t border-slate-50 hover:bg-slate-50/80 transition-colors">
                        {dualColumns ? (
                          <>
                            <td className="py-2.5 px-4 font-bold text-slate-700">{row.client}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-500">{row.dept}</td>
                          </>
                        ) : (
                          <td className="py-2.5 px-4 font-bold text-slate-700">{row.label}</td>
                        )}
                        <td className="text-right px-4 font-black text-slate-800">{row.qty}</td>
                        <td className="text-right px-4 font-bold text-slate-500">
                          {((row.qty / (selected ? selected.value : total)) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
  const [tdmFinancial, setTdmFinancial] = useState<{ totalCobrar: number; totalPagar: number; totalManif: number }>({ totalCobrar: 0, totalPagar: 0, totalManif: 0 });
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!from || !to) { toast.error('Seleccione rango de fechas'); return; }
    setLoading(true);
    try {
      const [res, tdmRes] = await Promise.all([
        api.getFlotaReport({ from, to }),
        api.getTdmManifiestos({ from, to, view: 'summary' }).catch(() => ({ success: false, data: [] })),
      ]);
      if (res.success) {
        setRawData(res.data || []);
        setSearched(true);
      } else {
        toast.error(res.error || 'Error al cargar datos');
      }
      if (tdmRes.success) {
        const rows = tdmRes.data || [];
        setTdmFinancial({
          totalCobrar: rows.reduce((s: number, r: any) => s + Number(r.total_cobrar || 0), 0),
          totalPagar:  rows.reduce((s: number, r: any) => s + Number(r.total_pagar  || 0), 0),
          totalManif:  rows.reduce((s: number, r: any) => s + Number(r.total_manifiestos || 0), 0),
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const groupRows = (rows: any[], keyFn: (r: any) => string) => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      const key = keyFn(r);
      map.set(key, (map.get(key) || 0) + r.quantity);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const m7Rows  = rawData.filter(r => r.operator === 'M7');
  const tdmRows = rawData.filter(r => r.operator === 'TDM');

  const m7Data  = groupRows(m7Rows, r => r.client_name);
  const tdmData = groupRows(tdmRows, r => r.client_name);

  // Data grouped by Department
  const m7DeptData  = groupRows(m7Rows, r => getDepartment(r.department || r.city));
  const tdmDeptData = groupRows(tdmRows, r => getDepartment(r.department || r.city));

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
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Viajes', value: totalViajes.toLocaleString('es-CO'), color: 'bg-indigo-600', icon: '🚛' },
              { label: 'Viajes M7', value: m7Rows.reduce((s, r) => s + r.quantity, 0).toLocaleString('es-CO'), color: 'bg-violet-600', icon: '🏢' },
              { label: 'Viajes TDM', value: tdmRows.reduce((s, r) => s + r.quantity, 0).toLocaleString('es-CO'), color: 'bg-amber-500', icon: '⭐' },
              { label: 'Clientes', value: new Set(rawData.map(r => r.client_name)).size.toLocaleString('es-CO'), color: 'bg-emerald-600', icon: '👥' },
            ].map(k => (
              <div key={k.label} className={`${k.color} text-white rounded-3xl p-5 shadow-sm`}>
                <p className="text-2xl">{k.icon}</p>
                <p className="text-2xl font-black mt-1">{k.value}</p>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
          {tdmFinancial.totalManif > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Manifiestos TDM', value: tdmFinancial.totalManif.toLocaleString('es-CO'), color: 'bg-amber-700', icon: '📋' },
                { label: 'TDM — Total Cobrar', value: `$${tdmFinancial.totalCobrar.toLocaleString('es-CO')}`, color: 'bg-emerald-700', icon: '💰' },
                { label: 'TDM — Total Pagar',  value: `$${tdmFinancial.totalPagar.toLocaleString('es-CO')}`,  color: 'bg-rose-700',    icon: '📤' },
              ].map(k => (
                <div key={k.label} className={`${k.color} text-white rounded-3xl p-5 shadow-sm`}>
                  <p className="text-2xl">{k.icon}</p>
                  <p className="text-xl font-black mt-1">{k.value}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gráficas interactivas — ancho completo */}
      {searched && (
        <>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
            Haz clic en una tajada para ver detalle del cliente
          </p>

          <InteractiveBarCard title="🏢 Flota M7 — Por Cliente" data={m7Data} colors={COLORS} rawRows={m7Rows} primaryGroup="client" secondaryGroup="department" dateRange={`${from} a ${to}`} />
          <InteractiveBarCard title="⭐ Flota TDM — Por Cliente" data={tdmData} colors={TDM_COLORS} rawRows={tdmRows} primaryGroup="client" secondaryGroup="department" dateRange={`${from} a ${to}`} />
          
          <div className="grid grid-cols-1 gap-6">
            <InteractiveBarCard title="🏙️ Flota M7 — Por Departamento" data={m7DeptData} colors={CITY_COLORS} rawRows={m7Rows} primaryGroup="department" secondaryGroup="client" dateRange={`${from} a ${to}`} dualColumns />
            <InteractiveBarCard title="🗺️ Flota TDM — Por Departamento" data={tdmDeptData} colors={TDM_COLORS.slice().reverse()} rawRows={tdmRows} primaryGroup="department" secondaryGroup="client" dateRange={`${from} a ${to}`} dualColumns />
          </div>

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
