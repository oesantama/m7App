import React, { useState } from 'react';
import { CheckSquare, History, FileSpreadsheet, Search, Download, RefreshCw, Filter } from 'lucide-react';
import { User } from '../../types';
import ValidacionLineaBlanca from './ValidacionLineaBlanca';
import TarifasLineaBlancaCRUD from './TarifasLineaBlancaCRUD';
import { api } from '../../services/api';
import TabPlanillas from './TabPlanillas';

type Tab = 'linea-blanca' | 'historico' | 'planillas';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'linea-blanca', label: 'Conciliación Línea Blanca', icon: <CheckSquare size={14} /> },
  { key: 'historico',    label: 'Histórico Conciliación',    icon: <History size={14} /> },
  { key: 'planillas',    label: 'Planillas Operativas',      icon: <FileSpreadsheet size={14} /> },
];

// ─── Tab: Conciliación Línea Blanca ──────────────────────────────────────────
const TabLineaBlanca: React.FC<{ user: User }> = () => {
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por factura, placa o conductor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">
          <RefreshCw size={12} />
          Actualizar
        </button>
        <button className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
          <Download size={12} />
          Exportar
        </button>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        {['Todos', 'Pendiente', 'Conciliado', 'Con Diferencia'].map(f => (
          <button
            key={f}
            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-all"
          >
            {f}
          </button>
        ))}
      </div>

      {/* Tabla placeholder */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Fecha', 'Documento', 'Factura', 'Conductor', 'Placa', 'Valor Esperado', 'Valor Conciliado', 'Diferencia', 'Estado'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} className="px-4 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                  <CheckSquare size={32} className="text-slate-300" />
                  <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Sin datos de conciliación</p>
                  <p className="text-[10px] text-slate-300 font-medium">Configure los parámetros y actualice para cargar</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

import DashboardResultadosLB from './DashboardResultadosLB';

// ─── Tab: Histórico Conciliación ──────────────────────────────────────────────
const TabHistorico: React.FC<{ user: User }> = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [placa, setPlaca] = useState('');
  const [systram, setSystram] = useState('');
  const [pedido, setPedido] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<any[]>([]);

  const handleConsultar = async () => {
    setLoading(true);
    try {
      const data = await api.searchConciliacionLB({
        fecha_desde: dateFrom,
        fecha_hasta: dateTo,
        placa,
        systram,
        pedido
      });
      setResultados(data);
    } catch (e) {
      console.error('Error fetching search results', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLimpiar = () => {
    setDateFrom('');
    setDateTo('');
    setPlaca('');
    setSystram('');
    setPedido('');
    setResultados([]);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 p-6 bg-slate-50 rounded-3xl border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={16} className="text-slate-400" />
          <span className="text-[12px] font-black uppercase tracking-widest text-slate-500">Opciones de Búsqueda</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">Placa</label>
            <input
              type="text"
              placeholder="Ej. ABC123"
              value={placa}
              onChange={e => setPlaca(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white uppercase"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">Systram</label>
            <input
              type="text"
              placeholder="# Systram"
              value={systram}
              onChange={e => setSystram(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase">Pedido / Viaje</label>
            <input
              type="text"
              placeholder="# Pedido"
              value={pedido}
              onChange={e => setPedido(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button 
            onClick={handleLimpiar} 
            className="px-6 py-2 border border-slate-200 text-slate-500 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 hover:text-slate-700 transition-all"
          >
            Limpiar
          </button>
          <button 
            onClick={handleConsultar} 
            disabled={loading}
            className="flex items-center gap-2 px-8 py-2 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            <Search size={14} />
            {loading ? 'Buscando...' : 'Consultar'}
          </button>
        </div>
      </div>

      {/* Resultados (Dashboard exacto al de la carga) */}
      {!loading && resultados.length === 0 && (
        <div className="text-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-xl mt-6">
          <div className="flex flex-col items-center gap-4">
            <History size={48} className="text-slate-200" />
            <div>
              <p className="text-lg font-black text-slate-600">No hay datos para mostrar</p>
              <p className="text-sm text-slate-400 font-medium mt-1">Ajusta los filtros y presiona Consultar para ver el dashboard.</p>
            </div>
          </div>
        </div>
      )}

      {resultados.length > 0 && (
        <div className="mt-8">
          <DashboardResultadosLB resultados={resultados} />
        </div>
      )}
    </div>
  );
};


// TabPlanillas was moved to TabPlanillas.tsx

// ─── Componente Principal ─────────────────────────────────────────────────────
const ValidacionConciliaciones: React.FC<{ user: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<Tab | 'archivo-base'>('linea-blanca');

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
       
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Conciliaciones Linea blanca exito</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {[...TABS, { key: 'archivo-base', label: 'Archivo Base (Tarifas)', icon: <CheckSquare size={14} /> }].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
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
        {activeTab === 'linea-blanca' && <ValidacionLineaBlanca user={user} />}
        {activeTab === 'archivo-base' && <TarifasLineaBlancaCRUD user={user} />}
        {activeTab === 'historico'    && <TabHistorico user={user} />}
        {activeTab === 'planillas'    && <TabPlanillas user={user} />}
      </div>
    </div>
  );
};

export default ValidacionConciliaciones;
