import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { api } from '../services/api'; 
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Icons } from '../constants';

const AdminDBManager: React.FC = () => {
  const { user } = useAppStore();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  
  // Data State
  const [data, setData] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  
  const getRowId = (row: any) => {
      if (!row) return undefined;
      return row.id ?? row.ID ?? row.Id ?? row.iD ?? Object.values(row)[0];
  };
  
  // Params
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [tableSearch, setTableSearch] = useState('');

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<any>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  // SQL Mode
  const [mode, setMode] = useState<'TABLE' | 'SQL' | 'CRON'>('TABLE');
  const [customQuery, setCustomQuery] = useState('');
  const [sqlResult, setSqlResult] = useState<any>(null);
  
  // SQL Pagination State
  const [sqlPage, setSqlPage] = useState(1);
  const [sqlLimit, setSqlLimit] = useState(5);

  // Query Builder State
  const [conditions, setConditions] = useState<any[]>([]);

  // Schema Info State
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState<{description: string, columns: any[]} | null>(null);

  // Custom Confirm State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean, type: 'SINGLE' | 'BULK', id?: any } | null>(null);

  // Cron State
  const [cronLogs, setCronLogs] = useState<string[]>([]);
  const [isCronRunning, setIsCronRunning] = useState(false);

  const handleRunCron = async (cronName: string) => {
      setIsCronRunning(true);
      setCronLogs([`Ejecutando ${cronName}...`]);
      try {
          const res = await api.runAdminCron(cronName);
          setCronLogs(prev => [...prev, ...res.logs]);
          toast.success('CRON ejecutado con éxito');
      } catch (err: any) {
          setCronLogs(prev => [...prev, `Error: ${err.message}`]);
          toast.error('Error al ejecutar CRON');
      } finally {
          setIsCronRunning(false);
      }
  };

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
           const response = await api.getAdminData({ 
                tableName: selectedTable, 
                page: 1,
                limit: 1000000, // Force All
                search: searchTerm,
                sortBy,
                sortOrder
           });
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
    if (user && user.token) {
        loadTables();
    }
  }, [user]);

  useEffect(() => {
    if (selectedTable && mode === 'TABLE' && user && user.token) {
        // Limpiar TODOS los filtros al cambiar de tabla para evitar errores de tipo
        setPage(1);
        setSortBy('');
        setSortOrder('ASC');
        setSearchTerm('');
        setConditions([]);
        setSelectedIds(new Set());
        loadData(1);
    }
  }, [selectedTable, user]);

  const loadTables = async () => {
    try {
      const list = await api.getAdminTables();
      setTables(list);
    } catch (e) {
      toast.error('Error cargando tablas');
    }
  };

  const triggerManualCron = async () => {
    try {
      toast.info('Iniciando sincronización manual...');
      const token = localStorage.getItem('token');
      await fetch('/api/planillas-operativas/force-sync', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast.success('CRON disparado. Revisa la tabla cron_logs.');
    } catch (e) {
      toast.error('Error al disparar el CRON');
    }
  };

  const fetchSchemaColumns = async (tableName: string) => {
    try {
        const result = await api.getAdminSchema(tableName);
        if (result.columns) {
            setTableColumns(result.columns.map((c: any) => c.column_name));
        }
    } catch (e) {
        console.error("Error fetching schema columns:", e);
    }
  };

  const loadData = async (newPage: number, newLimit?: number, newSortBy?: string, newSortOrder?: 'ASC' | 'DESC') => {
    if (!selectedTable) return;
    setLoading(true);
    setSelectedIds(new Set()); // Clear selection on load
    fetchSchemaColumns(selectedTable); // Fetch columns too
    
    const currentLimit = newLimit ?? limit;
    const currentSortBy = newSortBy !== undefined ? newSortBy : sortBy;
    const currentSortOrder = newSortOrder !== undefined ? newSortOrder : sortOrder;

    try {
      const response = await api.getAdminData({ 
            tableName: selectedTable, 
            page: newPage,
            limit: currentLimit,
            search: searchTerm,
            sortBy: currentSortBy,
            sortOrder: currentSortOrder,
            conditions: conditions
      });
      
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
        const result = await api.getAdminSchema(selectedTable);
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
        const result = await api.executeAdminSql(customQuery);
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
      const result = await api.saveAdminRecord(selectedTable, formData);
      toast.success(result.action === 'UPDATE' ? 'Registro Actualizado' : 'Registro Creado');
      setIsModalOpen(false);
      loadData(page);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: any) => {
    setConfirmDelete({ isOpen: true, type: 'SINGLE', id });
  };

  const executeDelete = async (id: any) => {
    try {
      await api.deleteAdminRecord(selectedTable, id);
      toast.success('Registro Eliminado');
      loadData(page);
    } catch (e: any) {
      console.error(e);
      toast.error("Error de Base de Datos", { description: e.message, duration: 6000 });
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setConfirmDelete({ isOpen: true, type: 'BULK' });
  };

  const executeBulkDelete = async () => {
    setLoading(true);
    try {
        const result = await api.bulkDeleteAdminRecords(selectedTable, Array.from(selectedIds));
        toast.success(`${result.count} registros eliminados exitosamente`);
        setSelectedIds(new Set());
        loadData(page);
    } catch (e: any) {
        toast.error("Error en Eliminación Masiva", { description: e.message, duration: 6000 });
    } finally {
        setLoading(false);
        setConfirmDelete(null);
    }
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === data.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(data.map(r => getRowId(r))));
      }
  };

  const toggleSelectRow = (id: any) => {
      const newSelection = new Set(selectedIds);
      if (newSelection.has(id)) {
          newSelection.delete(id);
      } else {
          newSelection.add(id);
      }
      setSelectedIds(newSelection);
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
                                  <th className="px-4 py-2 border-b w-10 text-center">Acciones</th>
                                  {Object.keys(rowsToDisplay[0]).map(k => <th key={k} className="px-4 py-2 border-b">{k}</th>)}
                              </tr>
                          </thead>
                          <tbody>
                              {rowsToDisplay.map((r: any, i: number) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                      <td className="px-4 py-2 border-b text-center">
                                          <button 
                                              onClick={() => {
                                                  if (!selectedTable) {
                                                      toast.error("Seleccione la tabla en el panel superior antes de editar un registro SQL.");
                                                      return;
                                                  }
                                                  openModal(r);
                                              }} 
                                              className="text-blue-600 hover:text-blue-800 p-1"
                                              title="Editar Registro (Requiere tener la tabla seleccionada arriba)"
                                          >
                                              ✏️
                                          </button>
                                      </td>
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

  const columns = tableColumns.length > 0 ? tableColumns : (data.length > 0 ? Object.keys(data[0]) : []);
  const totalPages = Math.ceil(totalRecords / limit);

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Gestor de Base de Datos</h2>
            <button 
                onClick={triggerManualCron}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded shadow-md text-sm transition-colors flex items-center gap-2"
                title="Provisional: Disparar CRON de Planillas Drive"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                FORZAR CRON DRIVE
            </button>
        </div>
        
        <div className="flex gap-2">
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
                <button 
                    onClick={() => setMode('CRON')}
                    className={`px-4 py-1 rounded text-sm font-bold transition-colors ${mode === 'CRON' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}
                >
                    Tareas (CRON)
                </button>
            </div>
        </div>
      </div>

      {mode === 'TABLE' && (
          <>
            <div className="flex gap-2 mb-4 bg-white p-4 rounded shadow border border-slate-200 items-center flex-wrap">
                <div className="flex items-center gap-1">
                    <div className="relative">
                        <input 
                            type="text"
                            placeholder="Filtrar tablas..."
                            className="bg-slate-50 border text-sm border-slate-300 rounded-l px-3 py-2 w-32 outline-none focus:ring-1 focus:ring-blue-500 border-r-0"
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                        />
                        <select 
                            className="bg-slate-50 border text-sm border-slate-300 rounded-r px-3 py-2 w-48 outline-none focus:ring-1 focus:ring-blue-500"
                            value={selectedTable}
                            onChange={(e) => setSelectedTable(e.target.value)}
                        >
                            <option value="">-- Tabla --</option>
                            {tables
                                .filter(t => t.toLowerCase().includes(tableSearch.toLowerCase()))
                                .map(t => <option key={t} value={t}>{t}</option>)
                            }
                        </select>
                    </div>
                    <button 
                        onClick={loadSchema}
                        disabled={!selectedTable}
                        className="text-slate-400 hover:text-blue-600 disabled:opacity-30 p-2 border rounded bg-slate-50 hover:bg-slate-100 transition-colors h-[38px]"
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
                
                {selectedIds.size > 0 && (
                    <button 
                        onClick={handleBulkDelete}
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm font-bold shadow transition-all flex items-center gap-2 animate-in fade-in zoom-in duration-300"
                    >
                        🗑️ Eliminar ({selectedIds.size})
                    </button>
                )}

                <button 
                    onClick={() => openModal(null)}
                    disabled={!selectedTable}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50"
                >
                    + Nuevo
                </button>
            </div>

            {selectedTable && (
                <div className="bg-white p-4 rounded-lg shadow border border-slate-200 mb-4 flex flex-col gap-3 transition-all">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                            <span>🔍</span> Filtros Avanzados (AND / OR)
                        </h3>
                        <button 
                            onClick={() => setConditions([...conditions, { logical: conditions.length === 0 ? '' : 'AND', column: columns[0] || '', operator: '=', value: '' }])}
                            className="text-[10px] uppercase bg-blue-50 text-blue-600 font-black px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors border border-blue-100"
                        >
                            + Añadir Condición
                        </button>
                    </div>
                    {conditions.map((cond, idx) => (
                        <div key={idx} className="flex gap-2 items-center flex-wrap animate-in fade-in duration-200">
                            {idx > 0 ? (
                                <select 
                                    className="border border-slate-200 bg-slate-50 rounded px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-400"
                                    value={cond.logical}
                                    onChange={(e) => {
                                        const newC = [...conditions];
                                        newC[idx].logical = e.target.value;
                                        setConditions(newC);
                                    }}
                                >
                                    <option value="AND">AND</option>
                                    <option value="OR">OR</option>
                                </select>
                            ) : (
                                <span className="text-[10px] font-black text-slate-400 w-12 text-center uppercase tracking-widest bg-slate-50 py-1.5 rounded border border-slate-100">WHERE</span>
                            )}
                            
                            <select 
                                className="border border-slate-200 rounded px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 min-w-[150px]"
                                value={cond.column}
                                onChange={(e) => {
                                    const newC = [...conditions];
                                    newC[idx].column = e.target.value;
                                    setConditions(newC);
                                }}
                            >
                                <option value="" disabled>- Columna -</option>
                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>

                            <select 
                                className="border border-slate-200 bg-slate-50 rounded px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-400"
                                value={cond.operator}
                                onChange={(e) => {
                                    const newC = [...conditions];
                                    newC[idx].operator = e.target.value;
                                    setConditions(newC);
                                }}
                            >
                                <option value="=">=</option>
                                <option value="!=">!=</option>
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<=">&lt;=</option>
                                <option value="LIKE">LIKE (Contiene)</option>
                                <option value="IS NULL">ES NULO</option>
                                <option value="IS NOT NULL">NO ES NULO</option>
                            </select>

                            {cond.operator !== 'IS NULL' && cond.operator !== 'IS NOT NULL' && (
                                <input 
                                    className="border border-slate-200 rounded px-3 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 flex-1 min-w-[200px]"
                                    placeholder="Valor a buscar..."
                                    value={cond.value}
                                    onChange={(e) => {
                                        const newC = [...conditions];
                                        newC[idx].value = e.target.value;
                                        setConditions(newC);
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && loadData(1)}
                                />
                            )}

                            <button 
                                onClick={() => {
                                    const newC = conditions.filter((_, i) => i !== idx);
                                    setConditions(newC);
                                }}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                title="Eliminar condición"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    {conditions.length > 0 && (
                        <div className="flex justify-end mt-2 pt-2 border-t border-slate-100">
                             <button 
                                onClick={() => loadData(1)}
                                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-md transition-colors flex items-center gap-2"
                             >
                                Aplicar Filtros <span>▶</span>
                             </button>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden mb-4">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-600">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                              <tr>
                                <th className="px-4 py-3 text-center w-10">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 cursor-pointer accent-blue-600"
                                        checked={data.length > 0 && selectedIds.size === data.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
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
                            {data.map((row, idx) => {
                                const rowId = getRowId(row);
                                return (
                                <tr key={idx} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(rowId) ? 'bg-blue-50/50' : ''}`}>
                                    <td className="px-4 py-2 text-center">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 cursor-pointer accent-blue-600"
                                            checked={selectedIds.has(rowId)}
                                            onChange={() => toggleSelectRow(rowId)}
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-center flex gap-1 justify-center">
                                        <button onClick={() => openModal(row)} className="text-blue-600 hover:text-blue-800 p-1">✏️</button>
                                        <button onClick={() => handleDelete(rowId)} className="text-red-500 hover:text-red-700 p-1">🗑️</button>
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
                                )
                            })}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-slate-400 italic">
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

      {mode === 'CRON' && (
          <div className="bg-white p-6 rounded shadow border border-slate-200 h-[calc(100vh-150px)] flex flex-col gap-6 overflow-auto">
              <div>
                  <h3 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">Administración de Tareas Programadas</h3>
                  <p className="text-sm text-slate-500 mb-6">Ejecute manualmente las tareas programadas (CRON) y observe los logs de ejecución en tiempo real.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="border border-slate-200 rounded p-4 flex flex-col gap-3 bg-slate-50 hover:shadow-md transition-shadow">
                          <h4 className="font-bold text-slate-800">Facturación Pendiente General</h4>
                          <p className="text-xs text-slate-500">Genera y envía un reporte Excel con los manifiestos no facturados a los correos activos en notificaciones (TGN-04).</p>
                          <div className="mt-auto pt-2">
                              <button 
                                  onClick={() => handleRunCron('facturacionPendiente')}
                                  disabled={isCronRunning}
                                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50"
                              >
                                  {isCronRunning ? 'Ejecutando...' : 'Ejecutar CRON ▶'}
                              </button>
                          </div>
                      </div>

                      <div className="border border-slate-200 rounded p-4 flex flex-col gap-3 bg-slate-50 hover:shadow-md transition-shadow">
                          <h4 className="font-bold text-slate-800">Sincronización Planillas Drive</h4>
                          <p className="text-xs text-slate-500">Sincroniza las fechas de cumplido desde Google Drive hacia el sistema de Planillas Operativas (CLI-09).</p>
                          <div className="mt-auto pt-2">
                              <button 
                                  onClick={() => handleRunCron('syncDrive')}
                                  disabled={isCronRunning}
                                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50"
                              >
                                  {isCronRunning ? 'Ejecutando...' : 'Ejecutar CRON ▶'}
                              </button>
                          </div>
                      </div>

                      <div className="border border-slate-200 rounded p-4 flex flex-col gap-3 bg-slate-50 hover:shadow-md transition-shadow">
                          <h4 className="font-bold text-slate-800">Limpieza Novedades Inventario</h4>
                          <p className="text-xs text-slate-500">Elimina las novedades de inventario que superen los 5 días hábiles de antigüedad.</p>
                          <div className="mt-auto pt-2">
                              <button 
                                  onClick={() => handleRunCron('cleanNews')}
                                  disabled={isCronRunning}
                                  className="w-full bg-slate-600 hover:bg-slate-700 text-white py-2 rounded text-sm font-bold shadow transition-colors disabled:opacity-50"
                              >
                                  {isCronRunning ? 'Ejecutando...' : 'Ejecutar CRON ▶'}
                              </button>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="flex-1 flex flex-col border border-slate-200 rounded overflow-hidden">
                  <div className="bg-slate-800 text-white px-4 py-2 font-mono text-sm flex justify-between items-center">
                      <span>Terminal de Logs (CRON)</span>
                      <button onClick={() => setCronLogs([])} className="text-xs hover:text-slate-300">Limpiar</button>
                  </div>
                  <div className="flex-1 bg-slate-900 text-green-400 p-4 font-mono text-xs overflow-auto whitespace-pre-wrap flex flex-col gap-1 min-h-[200px]">
                      {cronLogs.length === 0 ? (
                          <span className="text-slate-500">Esperando ejecución de tareas...</span>
                      ) : (
                          cronLogs.map((log, i) => (
                              <div key={i}>{log}</div>
                          ))
                      )}
                  </div>
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

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete?.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in slide-in-from-bottom-4 duration-300">
                  <div className="p-8 text-center">
                      <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-4 ring-red-50">
                          <Icons.Trash className="w-10 h-10 animate-bounce" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">
                          {confirmDelete.type === 'SINGLE' ? '¿Eliminar Registro?' : `¿Eliminar ${selectedIds.size} Registros?`}
                      </h3>
                      <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
                          Esta acción es <span className="text-red-600 font-bold underline">IRREVERSIBLE</span> y podría afectar la integridad de otros datos asociados.
                      </p>

                      <div className="flex flex-col gap-3">
                          <button 
                            onClick={() => {
                                if (confirmDelete.type === 'SINGLE') executeDelete(confirmDelete.id);
                                else executeBulkDelete();
                            }}
                            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 group active:scale-95"
                          >
                             CONFIRMAR ELIMINACIÓN
                             <span className="group-hover:translate-x-1 transition-transform">➔</span>
                          </button>
                          
                          <button 
                            onClick={() => setConfirmDelete(null)}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
                          >
                             Cancelar
                          </button>
                      </div>
                  </div>
                  <div className="bg-slate-50 p-4 border-t text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
                      Administrador de Base de Datos M7
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminDBManager;
