import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  Package, Users, Search, RefreshCw, Barcode,
  Download, BoxIcon
} from 'lucide-react';

interface Props {
  user: User;
}

const ConsultasInventario: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'bodega' | 'personal'>('bodega');
  const [isLoading, setIsLoading] = useState(false);

  // Bodega state
  const [bodegaData, setBodegaData] = useState<any[]>([]);
  const [filterElementoBodega, setFilterElementoBodega] = useState('');

  // Personal state
  const [personalData, setPersonalData] = useState<any[]>([]);
  const [filterPersonalId, setFilterPersonalId] = useState('');
  const [filterElementoPersonal, setFilterElementoPersonal] = useState('');

  // Catalogs
  const [elementosList, setElementosList] = useState<any[]>([]);
  const [personalList, setPersonalList] = useState<any[]>([]);

  // Expanded rows
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    loadCatalogs();
  }, []);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadCatalogs = async () => {
    try {
      const [elRes, pRes] = await Promise.all([
        api.getGhDropdownElementos(),
        api.getPersonal(),
      ]);
      if (elRes.success) setElementosList(elRes.data);
      if (Array.isArray(pRes)) setPersonalList(pRes.filter((p: any) => p.estado === 'EST-01'));
    } catch (e) { console.error(e); }
  };

  const loadData = async (params?: any) => {
    setIsLoading(true);
    try {
      if (activeTab === 'bodega') {
        const res = await api.getGhInventarioBodega(params);
        if (res.success) setBodegaData(res.data);
      } else {
        const res = await api.getGhInventarioPersonal(params);
        if (res.success) setPersonalData(res.data);
      }
    } catch (e) {
      toast.error('Error al cargar inventario.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchBodega = (e: React.FormEvent) => {
    e.preventDefault();
    const params: any = {};
    if (filterElementoBodega) params.elemento_id = filterElementoBodega;
    loadData(params);
  };

  const handleSearchPersonal = (e: React.FormEvent) => {
    e.preventDefault();
    const params: any = {};
    if (filterPersonalId) params.personal_id = filterPersonalId;
    if (filterElementoPersonal) params.elemento_id = filterElementoPersonal;
    loadData(params);
  };

  const resetBodega = () => {
    setFilterElementoBodega('');
    loadData();
  };

  const resetPersonal = () => {
    setFilterPersonalId('');
    setFilterElementoPersonal('');
    loadData();
  };

  const exportBodegaExcel = () => {
    // Hoja 1: Cantidades (un registro por elemento)
    const cantRows = bodegaData.map(item => ({
      'Elemento': item.elemento_nombre,
      'Tipo': item.tipo_nombre || '',
      'Serializado': item.es_serializado ? 'Sí' : 'No',
      'Stock Bodega': item.stock,
      'Seriales Registrados': item.es_serializado ? (item.serials?.length || 0) : 'N/A',
    }));

    // Hoja 2: Solo seriales de los elementos serializados
    const serialRows: any[] = [];
    bodegaData.forEach(item => {
      if (item.es_serializado && item.serials?.length) {
        item.serials.forEach((s: any) => {
          serialRows.push({
            'Elemento': item.elemento_nombre,
            'Tipo': item.tipo_nombre || '',
            'Código Serial': s.serial,
            'Estado': s.estado_serial,
            'Asignado A': s.asignado_a || '',
          });
        });
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cantRows), 'Cantidades');
    if (serialRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serialRows), 'Seriales');
    }
    XLSX.writeFile(wb, `GH_Inventario_Bodega_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPersonalExcel = () => {
    // Hoja 1: Cantidades por funcionario y elemento
    const cantRows = personalData.map(item => ({
      'Funcionario': item.personal_nombre,
      'Documento': item.personal_documento,
      'Cargo': item.cargo || '',
      'Elemento': item.elemento_nombre,
      'Tipo': item.tipo_nombre || '',
      'Serializado': item.es_serializado ? 'Si' : 'No',
      'Cantidad': item.stock,
    }));

    // Hoja 2: Solo seriales de elementos serializados
    const serialRows: any[] = [];
    personalData.forEach(item => {
      if (item.es_serializado && item.serials?.length) {
        item.serials.forEach((s: any) => {
          serialRows.push({
            'Funcionario': item.personal_nombre,
            'Documento': item.personal_documento,
            'Elemento': item.elemento_nombre,
            'Codigo Serial': s.serial,
            'Fecha Asignacion': s.fecha_asignacion ? new Date(s.fecha_asignacion).toLocaleDateString('es-CO') : '',
          });
        });
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cantRows), 'Cantidades');
    if (serialRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serialRows), 'Seriales');
    }
    XLSX.writeFile(wb, `GH_Inventario_Personal_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Summary stats for bodega
  const totalElementosBodega = bodegaData.length;
  const totalUnidadesBodega = bodegaData.reduce((acc, r) => acc + Number(r.stock || 0), 0);
  const elementosSinStock = bodegaData.filter(r => Number(r.stock) === 0).length;

  // Summary stats for personal
  const totalFuncionarios = [...new Set(personalData.map(r => r.personal_id))].length;
  const totalUnidadesPersonal = personalData.reduce((acc, r) => acc + Number(r.stock || 0), 0);

  // Group personalData by personal for display
  const personalGrouped = personalData.reduce((acc: Record<string, any>, row) => {
    const key = String(row.personal_id);
    if (!acc[key]) {
      acc[key] = {
        personal_id: row.personal_id,
        personal_nombre: row.personal_nombre,
        personal_documento: row.personal_documento,
        cargo: row.cargo,
        items: [],
        totalItems: 0,
      };
    }
    acc[key].items.push(row);
    acc[key].totalItems += Number(row.stock || 0);
    return acc;
  }, {});

  const estadoSerialBadge = (estado: string) => {
    if (estado === 'DISPONIBLE') return <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase">{estado}</span>;
    if (estado === 'ASIGNADO') return <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[9px] font-black uppercase">{estado}</span>;
    return <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg text-[9px] font-black uppercase">{estado}</span>;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 shrink-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <Package className="text-indigo-600" size={32} />
            Consultas de Inventario
          </h1>
          <p className="text-slate-500 font-bold mt-1">Existencias en bodega y asignaciones al personal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2">
        <button
          onClick={() => { setActiveTab('bodega'); setExpandedKey(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'bodega' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <BoxIcon size={15} className="text-indigo-500" /> Inventario Bodega
        </button>
        <button
          onClick={() => { setActiveTab('personal'); setExpandedKey(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'personal' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <Users size={15} className="text-emerald-500" /> Inventario Personal
        </button>
      </div>

      {/* ============ BODEGA TAB ============ */}
      {activeTab === 'bodega' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipos de Elemento</div>
              <div className="text-3xl font-black text-slate-900">{totalElementosBodega}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Unidades</div>
              <div className="text-3xl font-black text-indigo-600">{totalUnidadesBodega}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sin Stock</div>
              <div className="text-3xl font-black text-rose-500">{elementosSinStock}</div>
            </div>
          </div>

          {/* Filter */}
          <form onSubmit={handleSearchBodega} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Elemento</label>
              <select
                value={filterElementoBodega}
                onChange={e => setFilterElementoBodega(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
              >
                <option value="">Todos los elementos</option>
                {elementosList.map(el => (
                  <option key={el.id} value={el.id}>{el.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="py-2.5 px-5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 text-xs uppercase">
                <Search size={14} /> Consultar
              </button>
              <button type="button" onClick={resetBodega} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
                Limpiar
              </button>
              <button type="button" onClick={exportBodegaExcel} className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 text-xs uppercase">
                <Download size={13} /> Excel
              </button>
            </div>
          </form>

          {/* Bodega table */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black">
                    <th className="p-4 pl-6">Elemento</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4 text-center w-24">Serializado</th>
                    <th className="p-4 text-center w-28">Stock Bodega</th>
                    <th className="p-4 text-right pr-6 w-28">Detalle</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {isLoading ? (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400"><div className="flex justify-center mb-2"><RefreshCw className="animate-spin text-indigo-500" size={24} /></div>Cargando inventario...</td></tr>
                  ) : bodegaData.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold uppercase tracking-wider">No hay registros de inventario.</td></tr>
                  ) : bodegaData.map(item => (
                    <React.Fragment key={item.elemento_id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50 font-bold text-slate-700">
                        <td className="p-4 pl-6 font-black text-slate-900">{item.elemento_nombre}</td>
                        <td className="p-4 text-slate-500">{item.tipo_nombre || '—'}</td>
                        <td className="p-4 text-center">
                          {item.es_serializado
                            ? <span className="px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[9px] font-black uppercase">Sí</span>
                            : <span className="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg text-[9px] font-black uppercase">No</span>}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-xl font-black ${Number(item.stock) === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{item.stock}</span>
                        </td>
                        <td className="p-4 text-right pr-6">
                          {item.es_serializado && (
                            <button
                              onClick={() => setExpandedKey(expandedKey === `b-${item.elemento_id}` ? null : `b-${item.elemento_id}`)}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5 ml-auto"
                            >
                              <Barcode size={11} /> Seriales
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedKey === `b-${item.elemento_id}` && item.es_serializado && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="p-5 pl-10 border-b border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Seriales de {item.elemento_nombre}:</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {item.serials?.length === 0 ? (
                                <span className="text-xs text-slate-400 font-bold col-span-4">Sin seriales registrados.</span>
                              ) : item.serials?.map((s: any, i: number) => (
                                <div key={i} className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <Barcode size={11} className="text-slate-400" />
                                    <span className="text-[10px] font-black text-slate-800 uppercase">{s.serial}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    {estadoSerialBadge(s.estado_serial)}
                                    {s.asignado_a && <span className="text-[9px] text-slate-500 font-bold truncate ml-1">{s.asignado_a.split(' ')[0]}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============ PERSONAL TAB ============ */}
      {activeTab === 'personal' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Funcionarios con activos</div>
              <div className="text-3xl font-black text-slate-900">{totalFuncionarios}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Unidades Asignadas</div>
              <div className="text-3xl font-black text-emerald-600">{totalUnidadesPersonal}</div>
            </div>
          </div>

          {/* Filter */}
          <form onSubmit={handleSearchPersonal} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Funcionario</label>
              <select
                value={filterPersonalId}
                onChange={e => setFilterPersonalId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
              >
                <option value="">Todos los funcionarios</option>
                {personalList.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Elemento</label>
              <select
                value={filterElementoPersonal}
                onChange={e => setFilterElementoPersonal(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
              >
                <option value="">Todos los elementos</option>
                {elementosList.map(el => (
                  <option key={el.id} value={el.id}>{el.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="py-2.5 px-5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 text-xs uppercase">
                <Search size={14} /> Consultar
              </button>
              <button type="button" onClick={resetPersonal} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
                Limpiar
              </button>
              <button type="button" onClick={exportPersonalExcel} className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 text-xs uppercase">
                <Download size={13} /> Excel
              </button>
            </div>
          </form>

          {/* Personal table - grouped by person */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black">
                    <th className="p-4 pl-6">Funcionario</th>
                    <th className="p-4">Documento</th>
                    <th className="p-4">Cargo</th>
                    <th className="p-4 text-center w-24">Elementos</th>
                    <th className="p-4 text-center w-28">Total Unidades</th>
                    <th className="p-4 text-right pr-6 w-28">Detalle</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-400"><div className="flex justify-center mb-2"><RefreshCw className="animate-spin text-emerald-500" size={24} /></div>Cargando inventario...</td></tr>
                  ) : Object.keys(personalGrouped).length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold uppercase tracking-wider">No hay activos asignados al personal.</td></tr>
                  ) : Object.values(personalGrouped).map((group: any) => (
                    <React.Fragment key={group.personal_id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50 font-bold text-slate-700">
                        <td className="p-4 pl-6 font-black text-slate-900">{group.personal_nombre}</td>
                        <td className="p-4 text-slate-500">{group.personal_documento}</td>
                        <td className="p-4 text-slate-500">{group.cargo || '—'}</td>
                        <td className="p-4 text-center font-black text-indigo-600">{group.items.length}</td>
                        <td className="p-4 text-center font-black text-emerald-600 text-lg">{group.totalItems}</td>
                        <td className="p-4 text-right pr-6">
                          <button
                            onClick={() => setExpandedKey(expandedKey === `p-${group.personal_id}` ? null : `p-${group.personal_id}`)}
                            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5 ml-auto"
                          >
                            <Package size={11} /> Ver activos
                          </button>
                        </td>
                      </tr>
                      {expandedKey === `p-${group.personal_id}` && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="p-5 pl-10 border-b border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Activos de {group.personal_nombre}:</div>
                            <div className="space-y-3">
                              {group.items.map((item: any, i: number) => (
                                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <span className="font-black text-slate-900 text-xs">{item.elemento_nombre}</span>
                                      <span className="ml-2 text-[9px] text-slate-400 font-bold uppercase">{item.tipo_nombre}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {item.es_serializado
                                        ? <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[9px] font-black uppercase">Serializado</span>
                                        : null}
                                      <span className="text-sm font-black text-emerald-600">x{item.stock}</span>
                                    </div>
                                  </div>
                                  {item.es_serializado && item.serials?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {item.serials.map((s: any, si: number) => (
                                        <span key={si} className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-[9px] font-black tracking-wider uppercase flex items-center gap-1">
                                          <Barcode size={9} /> {s.serial}
                                          {s.fecha_asignacion && <span className="text-[8px] text-indigo-400 font-normal ml-1">({new Date(s.fecha_asignacion).toLocaleDateString('es-CO')})</span>}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ConsultasInventario;
