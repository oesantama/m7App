import React, { useState } from 'react';
import { CheckSquare, History, FileSpreadsheet, Search, Download, RefreshCw, Filter } from 'lucide-react';
import { User } from '../../types';
import ValidacionLineaBlanca from './ValidacionLineaBlanca';
import TarifasLineaBlancaCRUD from './TarifasLineaBlancaCRUD';
import * as api from '../../services/api';

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

// ─── Tab: Histórico Conciliación ──────────────────────────────────────────────
const TabHistorico: React.FC<{ user: User }> = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    fetchHistorico();
  }, []);

  const fetchHistorico = async () => {
    setLoading(true);
    try {
      const data = await api.getHistorialConciliacionesLB();
      setHistorico(data);
    } catch (e) {
      console.error('Error fetching historico', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = historico.filter(h => {
    if (dateFrom && new Date(h.fecha_creacion) < new Date(dateFrom)) return false;
    if (dateTo && new Date(h.fecha_creacion) > new Date(dateTo)) return false;
    return true;
  });

  const totalConciliado = filtered.reduce((acc, h) => acc + (parseFloat(h.total_milla7) || 0), 0);
  const totalDiferenciaNeta = filtered.reduce((acc, h) => acc + (parseFloat(h.diferencia_neta) || 0), 0);
  const totalDiscrepancias = filtered.reduce((acc, h) => acc + (parseInt(h.discrepancias) || 0), 0);
  const totalRegistros = filtered.reduce((acc, h) => acc + (parseInt(h.total_registros) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Filtrar por período</span>
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
        <button onClick={fetchHistorico} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">
          <RefreshCw size={12} />
          Actualizar
        </button>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl border bg-emerald-50 border-emerald-200 text-emerald-700">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Total Milla 7</p>
          <p className="text-2xl font-black">${Math.round(totalConciliado).toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-2xl border bg-amber-50 border-amber-200 text-amber-700">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Diferencia Neta</p>
          <p className="text-2xl font-black">${Math.round(totalDiferenciaNeta).toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-2xl border bg-rose-50 border-rose-200 text-rose-700">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Discrepancias</p>
          <p className="text-2xl font-black">{totalDiscrepancias}</p>
        </div>
        <div className="p-4 rounded-2xl border bg-slate-50 border-slate-200 text-slate-700">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Total Servicios</p>
          <p className="text-2xl font-black">{totalRegistros}</p>
        </div>
      </div>

      {/* Tabla histórico */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Fecha', 'Archivo', 'Mes/Año', 'Servicios', 'Coincidencias', 'Discrepancias', 'Total Milla 7', 'Diferencia Neta'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Cargando histórico...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <History size={32} className="text-slate-300" />
                    <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Sin histórico disponible</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((h: any) => (
                <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{new Date(h.fecha_creacion).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{h.nombre_archivo}</td>
                  <td className="px-4 py-3 text-slate-600">{h.mes_anio}</td>
                  <td className="px-4 py-3 text-slate-600">{h.total_registros}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{h.coincidencias}</td>
                  <td className="px-4 py-3 text-red-600 font-medium">{h.discrepancias}</td>
                  <td className="px-4 py-3 font-black text-slate-800">${parseFloat(h.total_milla7 || 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 font-black ${parseFloat(h.diferencia_neta) < 0 ? 'text-red-500' : 'text-green-500'}`}>${parseFloat(h.diferencia_neta || 0).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Tab: Planillas Operativas ────────────────────────────────────────────────
const TabPlanillas: React.FC<{ user: User }> = () => {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar planilla por placa, conductor o fecha..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">
          <RefreshCw size={12} />
          Actualizar
        </button>
        <button className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
          <Download size={12} />
          Exportar Todo
        </button>
      </div>

      {/* Grid de planillas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Placeholder card */}
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
          <FileSpreadsheet size={28} className="text-slate-300" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Sin planillas</p>
          <p className="text-[10px] text-slate-300">Las planillas operativas aparecerán aquí</p>
        </div>
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const ValidacionConciliaciones: React.FC<{ user: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<Tab | 'archivo-base'>('linea-blanca');

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Operación Éxito — MOD-11</p>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Validación Conciliaciones</h1>
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
