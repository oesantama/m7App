import React, { useState } from 'react';
import { Truck, Package, Container, Search, Download, RefreshCw, Filter, TrendingUp } from 'lucide-react';
import { User } from '../../types';

type Tab = 'linea-blanca' | 'tat' | 'secos';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'linea-blanca', label: 'Fletes Línea Blanca', icon: <Truck size={14} /> },
  { key: 'tat',          label: 'Fletes TAT',          icon: <Package size={14} /> },
  { key: 'secos',        label: 'Fletes Secos',        icon: <Container size={14} /> },
];

interface FleteSummaryCard {
  label: string;
  value: string;
  color: string;
}

// ─── Componente de tabla de fletes reutilizable ───────────────────────────────
const TablaFletes: React.FC<{ tipo: string; icon: React.ReactNode }> = ({ tipo, icon }) => {
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');

  const summaryCards: FleteSummaryCard[] = [
    { label: 'Total Fletes',      value: '$0',  color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { label: 'Pendiente Pago',    value: '$0',  color: 'bg-amber-50 border-amber-200 text-amber-700' },
    { label: 'Pagado',            value: '$0',  color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: 'N° Viajes',         value: '0',   color: 'bg-slate-50 border-slate-200 text-slate-700' },
  ];

  return (
    <div className="space-y-4">
      {/* Cards resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map(card => (
          <div key={card.label} className={`p-4 rounded-2xl border ${card.color}`}>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">{card.label}</p>
            <p className="text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <Filter size={13} className="text-slate-400" />
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Buscar ${tipo}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">
          <RefreshCw size={12} />
          Consultar
        </button>
        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all ml-auto">
          <Download size={12} />
          Exportar
        </button>
      </div>

      {/* Tabla */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Fecha', 'N° Viaje', 'Placa', 'Conductor', 'Origen', 'Destino', 'Kilometraje', 'Valor Flete', 'Estado Pago', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={10} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <span className="text-slate-300">{icon}</span>
                  <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Sin fletes registrados</p>
                  <p className="text-[10px] text-slate-300 font-medium">Seleccione un rango de fechas para consultar</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const FletesConciliacion: React.FC<{ user: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<Tab>('linea-blanca');

  const currentTab = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Operación Éxito — MOD-11</p>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Fletes de Conciliación</h1>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <TrendingUp size={14} className="text-emerald-600" />
          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Control de Fletes</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido del tab activo */}
      <div>
        {activeTab === 'linea-blanca' && (
          <TablaFletes tipo="Fletes Línea Blanca" icon={<Truck size={32} />} />
        )}
        {activeTab === 'tat' && (
          <TablaFletes tipo="Fletes TAT" icon={<Package size={32} />} />
        )}
        {activeTab === 'secos' && (
          <TablaFletes tipo="Fletes Secos" icon={<Container size={32} />} />
        )}
      </div>
    </div>
  );
};

export default FletesConciliacion;
