import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { api } from '../services/api'; 
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const AdminDBManager: React.FC = () => {
  const { user } = useAppStore();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  
  // Data State
  const [data, setData] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Params
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  // SQL Mode
  const [mode, setMode] = useState<'TABLE' | 'SQL'>('TABLE');
  const [customQuery, setCustomQuery] = useState('');
  const [sqlResult, setSqlResult] = useState<any>(null);
  
  // SQL Pagination State
  const [sqlPage, setSqlPage] = useState(1);
  const [sqlLimit, setSqlLimit] = useState(5);

  // Schema Info State
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState<{description: string, columns: any[]} | null>(null);

  const exportToExcel = (dataToExport: any[], fileName: string) => {
    if (!dataToExport || dataToExport.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleExportTable = async () => {
      if (!selectedTable) return;
      setLoading(true);
      try {
           // Fetch ALL data for export
           const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tableName: selectedTable, 
                user,
                page: 1,
                limit: 1000000, // Force All
                search: searchTerm,
                sortBy,
                sortOrder
            })
          });
          const response = await res.json();
          const rows = Array.isArray(response) ? response : response.data;
          
          exportToExcel(rows, `tabla_${selectedTable}`);
          toast.success('Exportación completada');
      } catch (e) {
          toast.error('Error al exportar');
      } finally {
          setLoading(false);
      }
  };

  const handleExportSql = () => {
      if (!sqlResult) return;
      // Handle array or single
      const results = Array.isArray(sqlResult) ? sqlResult : [sqlResult];
      // Export check: usually users want the rows of the last result if multiple?
      // Or export strictly the first one with rows?
      // Let's iterate and find first with rows.
      const dataWithRows = results.find(r => r.rows && r.rows.length > 0);
      
      if (dataWithRows) {
          exportToExcel(dataWithRows.rows, 'query_result');
      } else {
          toast.error('La consulta no devolvió filas para exportar.');
      }
  };

  // Security Check
  if (user?.email !== 'admin@millasiete.com') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-500 mb-4">ACCESO DENEGADO</h1>
          <p>Este módulo es exclusivo para administradores de sistema.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (selectedTable && mode === 'TABLE') {
        setPage(1);
        setSortBy('');
        setSortOrder('ASC');
        loadData(1);
    }
  }, [selectedTable]);

  const loadTables = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user })
      });
      if (!res.ok) throw new Error('Error loading tables');
      const list = await res.json();
      setTables(list);
    } catch (e) {
      toast.error('Error cargando tablas');
    }
  };

  const loadData = async (newPage: number, newLimit?: number, newSortBy?: string, newSortOrder?: 'ASC' | 'DESC') => {
    if (!selectedTable) return;
    setLoading(true);
    
    const currentLimit = newLimit ?? limit;
    const currentSortBy = newSortBy !== undefined ? newSortBy : sortBy;
    const currentSortOrder = newSortOrder !== undefined ? newSortOrder : sortOrder;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            tableName: selectedTable, 
            user,
            page: newPage,
            limit: currentLimit,
            search: searchTerm,
            sortBy: currentSortBy,
            sortOrder: currentSortOrder
        })
      });
      if (!res.ok) throw new Error('Error loading data');
      const response = await res.json();
      
      if (Array.isArray(response)) {
          setData(response);
          setTotalRecords(response.length);
      } else {
          setData(response.data);
          setTotalRecords(response.total);
          setPage(response.page);
      }
    } catch (e) {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  const loadSchema = async () => {
    if (!selectedTable) return;
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/schema`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableName: selectedTable, user })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        setSchemaInfo(result);
        setIsSchemaModalOpen(true);
    } catch (e: any) {
        toast.error(e.message);
    }
  };

  const handleSort = (col: string) => {
      let newOrder: 'ASC' | 'DESC' = 'ASC';
      if (sortBy === col && sortOrder === 'ASC') {
          newOrder = 'DESC';
      }
      setSortBy(col);
      setSortOrder(newOrder);
      loadData(1, limit, col, newOrder);
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLimit = parseInt(e.target.value);
      setLimit(newLimit);
      setPage(1);
      loadData(1, newLimit);
  };
  
  const handleExecuteSql = async () => {
      setLoading(true);
      setSqlResult(null);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: customQuery, user })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error SQL');
        
        setSqlResult(result);
        toast.success('Query Ejecutado');
      } catch (e: any) {
          toast.error(e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/save`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ tableName: selectedTable, data: formData, user })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error guardando');
      
      toast.success(result.action === 'UPDATE' ? 'Registro Actualizado' : 'Registro Creado');
      setIsModalOpen(false);
      loadData(page);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: any) => {
    if (!window.confirm('¿Está seguro de eliminar este registro? Esta acción es IRREVERSIBLE.')) return;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/delete`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ tableName: selectedTable, id, user })
      });
      const result = await res.json();
      if (!res.ok) {
          if (result.details && result.details.includes('foreign key constraint')) {
              throw new Error(`NO SE PUEDE ELIMINAR:\nEl registro tiene datos asociados en otras tablas (Integridad Referencial).\n\nDetalle: ${result.details}`);
          }
          throw new Error(result.details || result.error || 'Error eliminando');
      }
      
      toast.success('Registro Eliminado');
      loadData(page);
    } catch (e: any) {
      console.error(e);
      toast.error("Error de Base de Datos", { description: e.message, duration: 6000 });
    }
  };

  const openModal = (record: any = null) => {
    setEditingRecord(record);
    if (record) {
        setFormData({ ...record });
    } else {
        const empty = {};
        if (data.length > 0) {
            Object.keys(data[0]).forEach(k => empty[k] = '');
        }
        setFormData(empty);
    }
    setIsModalOpen(true);
  };
  
  const renderSqlResult = () => {
      if (!sqlResult) return null;
      const results = Array.isArray(sqlResult) ? sqlResult : [sqlResult];
      
      return results.map((res, idx) => {
          let rowsToDisplay = res.rows || [];
          const totalSqlRows = rowsToDisplay.length;
          const totalSqlPages = Math.ceil(totalSqlRows / sqlLimit);
          
          if (totalSqlRows > 0) {
              const start = (sqlPage - 1) * sqlLimit;
              rowsToDisplay = rowsToDisplay.slice(start, start + sqlLimit);
          }
          
          return (
          <div key={idx} className="mb-8">
              <div className="flex justify-between items-center mb-2">
                 <div className="bg-slate-100 p-2 text-xs font-mono border rounded">
                   {res.command} - {res.rowCount} filas afectadas
                 </div>
                 {totalSqlRows > 0 && (
                     <div className="flex gap-2 items-center">
                         <select 
                            className="bg-slate-50 border text-xs border-slate-300 rounded px-2 py-1 outline-none"
                            value={sqlLimit}
                            onChange={(e) => { setSqlLimit(parseInt(e.target.value)); setSqlPage(1); }}
                        >
                            <option value="5">5</option>
                            <option value="10">10</option>
                            <option value="50">50</option>
                            <option value="1000000">Todos</option>
                        </select>
                        
                        <div className="flex gap-1">
                            <button 
                                disabled={sqlPage === 1}
                                onClick={() => setSqlPage(sqlPage - 1)}
                                className="px-2 py-1 text-xs border rounded hover:bg-slate-50 disabled:opacity-50"
                            >
                                ◀
                            </button>
                            <span className="px-2 py-1 text-xs font-bold text-slate-500">{sqlPage} / {totalSqlPages || 1}</span>
                            <button 
                                disabled={sqlPage >= totalSqlPages}
                                onClick={() => setSqlPage(sqlPage + 1)}
                                className="px-2 py-1 text-xs border rounded hover:bg-slate-50 disabled:opacity-50"
                            >
                                ▶
                            </button>
                        </div>
                     </div>
                 )}
              </div>

              {rowsToDisplay.length > 0 && (
                  <div className="overflow-x-auto bg-white border rounded shadow-sm">
                      <table className="w-full text-xs text-left text-slate-600">
                          <thead className="bg-slate-50 font-bold uppercase">
                              <tr>
                                  {Object.keys(rowsToDisplay[0]).map(k => <th key={k} className="px-4 py-2 border-b">{k}</th>)}
                              </tr>
                          </thead>
                          <tbody>
                              {rowsToDisplay.map((r: any, i: number) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                      {Object.values(r).map((v: any, j: number) => (
                                          <td key={j} className="px-4 py-2 border-b whitespace-nowrap max-w-[200px] truncate">
                                              {v === null ? 'NULL' : String(v)}
                                          </td>
                                      ))}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
          );
      });
  };

  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const totalPages = Math.ceil(totalRecords / limit);

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Gestor de Base de Datos <span className="text-xs bg-red-600 text-white px-2 py-1 rounded ml-2">ADMIN</span></h1>
        
        <div className="flex bg-slate-200 rounded p-1">
            <button 
                onClick={() => setMode('TABLE')}
                className={`px-4 py-1 rounded text-sm font-bold transition-colors ${mode === 'TABLE' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
            >
                Tabla
            </button>
            <button 
                onClick={() => setMode('SQL')}
                className={`px-4 py-1 rounded text-sm font-bold transition-colors ${mode === 'SQL' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
            >
                SQL
            </button>
        </div>
      </div>

      {mode === 'TABLE' && (
          <>
            <div className="flex gap-2 mb-4 bg-white p-4 rounded shadow border border-slate-200 items-center flex-wrap">
                <div className="flex items-center gap-1">
                    <select 
                        className="bg-slate-50 border text-sm border-slate-300 rounded px-3 py-2 w-64 outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                    >
                        <option value="">-- Seleccionar Tabla --</option>
                        {tables.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button 
                        onClick={loadSchema}
                        disabled={!selectedTable}
                        className="text-slate-400 hover:text-blue-600 disabled:opacity-30 p-2 border rounded bg-slate-50 hover:bg-slate-100 transition-colors"
                        title="Ver Estructura de Tabla"
                    >
                       ℹ️
                    </button>
                </div>
                
                <input 
                    placeholder="Buscar..." 
                    className="bg-slate-50 border text-sm border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadData(1)}
                />

                <select 
                    className="bg-slate-50 border text-sm border-slate-300 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={limit}
                    onChange={handleLimitChange}
                >
                    <option value="5">5 por pág</option>
                    <option value="10">10 por pág</option>
                    <option value="15">15 por pág</option>
                    <option value="20">20 por pág</option>
                    <option value="50">50 por pág</option>
                    <option value="1000000">Todos</option>
                </select>

                <button 
                    onClick={() => loadData(1)}
                    disabled={!selectedTable || loading}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50"
                >
                    Consultar
                </button>
                
                <button 
                    onClick={handleExportTable}
                    disabled={!selectedTable || loading}
                    className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                   Exportar 📥
                </button>

                <div className="flex-1"></div>
                
                <button 
                    onClick={() => openModal(null)}
                    disabled={!selectedTable}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50"
                >
                    + Nuevo
                </button>
            </div>

            <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden mb-4">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-600">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                             <tr>
                                <th className="px-4 py-3 text-center w-20">Acciones</th>
                                {columns.map(col => (
                                    <th 
                                        key={col} 
                                        className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-200 select-none"
                                        onClick={() => handleSort(col)}
                                    >
                                        <div className="flex items-center gap-1">
                                            {col}
                                            {sortBy === col && (
                                                <span className="text-blue-600">{sortOrder === 'ASC' ? '▲' : '▼'}</span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2 text-center flex gap-1 justify-center">
                                        <button onClick={() => openModal(row)} className="text-blue-600 hover:text-blue-800 p-1">✏️</button>
                                        <button onClick={() => handleDelete(row.id)} className="text-red-500 hover:text-red-700 p-1">🗑️</button>
                                    </td>
                                    {columns.map(col => {
                                        let content = row[col];
                                        if (content && (col.toLowerCase() === 'created_at' || col.toLowerCase() === 'updated_at')) {
                                            content = new Date(content).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
                                        }
                                        return (
                                        <td key={col} className="px-4 py-2 whitespace-nowrap max-w-[200px] truncate" title={String(row[col])}>
                                            {content === null ? <span className="text-slate-300 italic">null</span> : String(content)}
                                        </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400 italic">
                                        {selectedTable ? 'No hay registros.' : 'Seleccione una tabla.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {totalRecords > 0 && (
                <div className="flex justify-between items-center bg-white p-3 rounded shadow border border-slate-200">
                    <span className="text-xs text-slate-500">
                        Mostrando {((page - 1) * limit) + 1} - {Math.min(page * limit, totalRecords)} de {totalRecords}
                    </span>
                    <div className="flex gap-2">
                        <button 
                            disabled={page === 1}
                            onClick={() => loadData(page - 1)}
                            className="px-3 py-1 text-xs border rounded hover:bg-slate-50 disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <span className="px-3 py-1 text-xs font-bold bg-slate-100 rounded">Página {page} / {totalPages || 1}</span>
                        <button 
                            disabled={page >= totalPages}
                            onClick={() => loadData(page + 1)}
                            className="px-3 py-1 text-xs border rounded hover:bg-slate-50 disabled:opacity-50"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}
          </>
      )}

      {mode === 'SQL' && (
          <div className="bg-white p-4 rounded shadow border border-slate-200 h-[calc(100vh-150px)] flex flex-col">
              <textarea 
                className="w-full h-40 p-4 font-mono text-sm bg-slate-900 text-green-400 border rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="SELECT * FROM users WHERE..."
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
              />
              <div className="flex justify-between mb-4">
                  <button 
                      onClick={handleExportSql}
                      disabled={!sqlResult}
                      className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                      Exportar Result. 📥
                  </button>

                  <button 
                    onClick={handleExecuteSql}
                    disabled={!customQuery || loading}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold shadow transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                      {loading ? 'Ejecutando...' : 'Ejecutar SQL'} 
                      <span>▶</span>
                  </button>
              </div>
              
              <div className="flex-1 overflow-auto border-t border-slate-200 pt-4">
                  {renderSqlResult()}
                  {!sqlResult && <div className="text-center text-slate-400 mt-10">Los resultados de su consulta aparecerán aquí.</div>}
              </div>
          </div>
      )}

      {/* SCHEMA MODAL */}
      {isSchemaModalOpen && schemaInfo && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-lg">
                      <div className="flex flex-col">
                          <h3 className="font-bold text-lg uppercase text-slate-800">ESTRUCTURA: <span className="text-blue-600">{selectedTable}</span></h3>
                          <p className="text-xs text-slate-500 italic mt-1">{schemaInfo.description}</p>
                      </div>
                      <button onClick={() => setIsSchemaModalOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-xl">×</button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                      <table className="w-full text-sm text-left border rounded shadow-sm">
                          <thead className="bg-slate-100 text-slate-700 font-bold">
                              <tr>
                                  <th className="px-4 py-3 border-b">#</th>
                                  <th className="px-4 py-3 border-b">Columna</th>
                                  <th className="px-4 py-3 border-b">Tipo</th>
                                  <th className="px-4 py-3 border-b text-center">PK</th>
                                  <th className="px-4 py-3 border-b text-center">FK</th>
                                  <th className="px-4 py-3 border-b text-center">Null</th>
                                  <th className="px-4 py-3 border-b">Default</th>
                                  <th className="px-4 py-3 border-b">Descripción / Referencia</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {schemaInfo.columns.map((col: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-blue-50 transition-colors">
                                      <td className="px-4 py-2 border-b text-slate-400 text-xs">{idx + 1}</td>
                                      <td className="px-4 py-2 border-b font-mono font-bold text-slate-700">{col.column_name}</td>
                                      <td className="px-4 py-2 border-b text-blue-600 font-mono text-xs">{col.data_type}</td>
                                      <td className="px-4 py-2 border-b text-center">
                                          {col.is_primary_key === 'YES' && <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-200">PK</span>}
                                      </td>
                                      <td className="px-4 py-2 border-b text-center">
                                          {col.is_foreign_key === 'YES' && <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-200">FK</span>}
                                      </td>
                                      <td className="px-4 py-2 border-b text-center">
                                          {col.is_nullable === 'YES' ? 
                                            <span className="text-green-500 font-bold">✓</span> : 
                                            <span className="text-red-400 font-bold">✕</span>
                                          }
                                      </td>
                                      <td className="px-4 py-2 border-b text-slate-500 text-xs truncate max-w-[100px]" title={col.column_default}>{col.column_default}</td>
                                      <td className="px-4 py-2 border-b text-xs">
                                          {col.is_foreign_key === 'YES' && (
                                              <div className="flex items-center gap-1 text-indigo-700 font-mono bg-indigo-50 px-2 py-1 rounded w-fit mb-1">
                                                  <span>➔ {col.foreign_table_name}.{col.foreign_column_name}</span>
                                              </div>
                                          )}
                                          {col.column_description ? (
                                              <span className="text-slate-600 italic">{col.column_description}</span>
                                          ) : (
                                              <span className="text-slate-300 italic">-</span>
                                          )}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <div className="p-4 border-t bg-slate-50 rounded-b-lg text-right">
                      <button 
                          onClick={() => setIsSchemaModalOpen(false)}
                          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 font-bold"
                      >
                          Cerrar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <h3 className="font-bold text-slate-800 uppercase">{editingRecord ? 'Editar Registro' : 'Nuevo Registro'} - {selectedTable}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.keys(formData).map(key => (
                         <div key={key} className="flex flex-col">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">{key}</label>
                            <input 
                                className="border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                                value={formData[key] || ''}
                                onChange={(e) => setFormData({...formData, [key]: e.target.value})}
                                disabled={key === 'id' && !!editingRecord} // ID usually immutable on edit
                            />
                         </div>
                    ))}
                    {Object.keys(formData).length === 0 && (
                        <div className="col-span-2 text-center text-slate-500 p-4">
                            No se detectaron columnas. Escriba el JSON del objeto o cargue datos primero.
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-xl">
                    <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded">Cancelar</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded shadow">Guardar Cambios</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminDBManager;
