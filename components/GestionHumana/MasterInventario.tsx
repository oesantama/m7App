import React, { useState, useEffect } from 'react';
import { User, MasterRecord } from '../../types';
import { FileDown, FileUp, Plus, Edit2, Trash2, Search, Settings2, Package, Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { DataTable, ColumnDef } from '../shared/DataTable';
import * as XLSX from 'xlsx';
import { hasPermission } from '../../utils/permissions';

interface Props {
  user: User;
}

export default function MasterInventario({ user }: Props) {
  const [activeTab, setActiveTab] = useState<'elementos' | 'tipos'>('elementos');
  
  // Data
  const [elementos, setElementos] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [masterEstados, setMasterEstados] = useState<MasterRecord[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [formData, setFormData] = useState({ nombre: '', tipo_id: '', estado_id: 'EST-01', es_serializado: false });

  // Import Preview State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [deleteItemId, setDeleteItemId] = useState<string | number | null>(null);

  // Permissions
  const canView = hasPermission(user, 'MASTER_INVENTARIO_GH', 'view');
  const canCreate = hasPermission(user, 'MASTER_INVENTARIO_GH', 'create');
  const canEdit = hasPermission(user, 'MASTER_INVENTARIO_GH', 'edit');
  const canDelete = hasPermission(user, 'MASTER_INVENTARIO_GH', 'delete');

  const elementosColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'ID',
      key: 'id',
      render: (row) => <span className="font-bold text-slate-900">#{row.id}</span>
    },
    {
      header: 'Nombre',
      key: 'nombre',
      render: (row) => <span className="font-bold text-slate-700 uppercase">{row.nombre}</span>
    },
    {
      header: 'Tipo',
      key: 'tipo_nombre',
      render: (row) => (
        <span className="inline-flex px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-bold uppercase">
          {row.tipo_nombre || 'N/A'}
        </span>
      )
    },
    {
      header: 'Serializado',
      key: 'es_serializado',
      render: (row) => (
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
          row.es_serializado ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
        }`}>
          {row.es_serializado ? 'SÍ' : 'NO'}
        </span>
      )
    },
    {
      header: 'Estado',
      key: 'estado_id',
      render: (row) => (
        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-black uppercase ${
          row.estado_id === 'EST-01' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}>
          {row.estado_id === 'EST-01' ? 'ACTIVO' : 'INACTIVO'}
        </span>
      )
    },
    {
      header: 'Último Control',
      key: 'usuario_control',
      render: (row) => (
        <div>
          <p className="text-slate-900 font-medium">{row.usuario_control || 'Sistema'}</p>
          <p className="text-xs text-slate-400">{new Date(row.fecha_control).toLocaleDateString('es-CO')}</p>
        </div>
      )
    },
    {
      header: 'Acciones',
      key: 'acciones',
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          {canEdit && (
            <button onClick={() => openModal(row)} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
              <Edit2 size={18} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => setDeleteItemId(row.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )
    }
  ], [canEdit, canDelete, tipos]);

  const tiposColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'ID',
      key: 'id',
      render: (row) => <span className="font-bold text-slate-900">#{row.id}</span>
    },
    {
      header: 'Nombre',
      key: 'nombre',
      render: (row) => <span className="font-bold text-slate-700 uppercase">{row.nombre}</span>
    },
    {
      header: 'Estado',
      key: 'estado_id',
      render: (row) => (
        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-black uppercase ${
          row.estado_id === 'EST-01' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}>
          {row.estado_id === 'EST-01' ? 'ACTIVO' : 'INACTIVO'}
        </span>
      )
    },
    {
      header: 'Último Control',
      key: 'usuario_control',
      render: (row) => (
        <div>
          <p className="text-slate-900 font-medium">{row.usuario_control || 'Sistema'}</p>
          <p className="text-xs text-slate-400">{new Date(row.fecha_control).toLocaleDateString('es-CO')}</p>
        </div>
      )
    },
    {
      header: 'Acciones',
      key: 'acciones',
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          {canEdit && (
            <button onClick={() => openModal(row)} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
              <Edit2 size={18} />
            </button>
          )}
          {canDelete && (
            <button onClick={() => setDeleteItemId(row.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )
    }
  ], [canEdit, canDelete]);

  useEffect(() => {
    if (canView) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [canView]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [resElem, resTipos, mEstados] = await Promise.all([
        api.getGhElementos(),
        api.getGhTiposElementos(),
        api.getEstados()
      ]);

      if (resElem.success) setElementos(resElem.data);
      if (resTipos.success) setTipos(resTipos.data);
      if (mEstados) setMasterEstados(mEstados);

    } catch (error) {
      console.error(error);
      toast.error('Error al cargar datos del servidor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre) return toast.warning('El nombre es obligatorio');
    
    if (activeTab === 'elementos' && !formData.tipo_id) return toast.warning('Debe seleccionar un tipo');

    // Frontend duplicate check
    const currentNameNormalized = formData.nombre.trim().toUpperCase();
    const listToSearch = activeTab === 'elementos' ? elementos : tipos;
    const exists = listToSearch.some(item => 
      item.nombre.trim().toUpperCase() === currentNameNormalized && 
      (!editItem || item.id !== editItem.id)
    );

    if (exists) {
      return toast.warning(`El nombre "${currentNameNormalized}" ya existe.`);
    }

    setIsLoading(true);
    try {
      const payload = { ...formData, usuario_control: user.name };
      
      let res;
      if (activeTab === 'elementos') {
        res = await api.saveGhElemento(payload, editItem?.id);
      } else {
        res = await api.saveGhTipoElemento(payload, editItem?.id);
      }

      if (res.success) {
        toast.success(`Registro ${editItem ? 'actualizado' : 'creado'} exitosamente`);
        setShowModal(false);
        loadData();
      } else {
        toast.error(res.error || 'Error al guardar');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItemId) return;
    setIsLoading(true);
    try {
      let res;
      if (activeTab === 'elementos') {
        res = await api.deleteGhElemento(deleteItemId);
      } else {
        res = await api.deleteGhTipoElemento(deleteItemId);
      }
      
      if (res.success) {
        toast.success('Registro eliminado con éxito');
        setDeleteItemId(null);
        loadData();
      } else {
        toast.error(res.error || 'Error al eliminar');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = (item?: any) => {
    if (item) {
      setEditItem(item);
      setFormData({ 
        nombre: item.nombre, 
        tipo_id: item.tipo_id || '', 
        estado_id: item.estado_id || 'EST-01',
        es_serializado: !!item.es_serializado
      });
    } else {
      setEditItem(null);
      setFormData({ nombre: '', tipo_id: '', estado_id: 'EST-01', es_serializado: false });
    }
    setShowModal(true);
  };

  const exportToExcel = () => {
    const data = activeTab === 'elementos' ? elementos : tipos;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `Master_Inventario_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  const downloadTemplate = () => {
    let headers: string[] = [];
    let exampleRow: any = {};
    
    if (activeTab === 'elementos') {
      headers = ['nombre', 'tipo', 'serializado'];
      const defaultTipo = tipos.filter(t => t.estado_id === 'EST-01')[0]?.nombre || 'TECNOLOGÍA';
      exampleRow = {
        nombre: 'COMPUTADOR PORTÁTIL AJOVER',
        tipo: defaultTipo,
        serializado: 'SI'
      };
    } else {
      headers = ['nombre'];
      exampleRow = {
        nombre: 'TECNOLOGÍA'
      };
    }

    const worksheet = XLSX.utils.json_to_sheet([exampleRow], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Formato Importar");
    XLSX.writeFile(workbook, `Formato_Importar_${activeTab === 'elementos' ? 'Codigos_Elementos' : 'Tipos_Elementos'}.xlsx`);
    toast.success('Plantilla del formato descargada con éxito');
  };

  const importFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) return toast.warning('El archivo está vacío');
        
        const analyzed: any[] = [];
        const currentList = activeTab === 'elementos' ? elementos : tipos;

        for (const row of data as any[]) {
          const rawNombre = row.nombre?.toString() || '';
          
          let esSerializado = false;
          if (activeTab === 'elementos' && row.serializado) {
            const serStr = row.serializado.toString().trim().toUpperCase();
            if (['SI', 'SÍ', 'YES', 'TRUE', '1'].includes(serStr)) {
              esSerializado = true;
            }
          }

          if (!rawNombre.trim()) {
            analyzed.push({
              nombre: '(SIN NOMBRE)',
              tipo: row.tipo || '',
              estado: 'ACTIVO',
              es_serializado: esSerializado,
              status: 'ERROR',
              reason: 'El nombre es obligatorio'
            });
            continue;
          }

          const nameNormalized = rawNombre.trim().toUpperCase();
          
          // Check local duplicate check
          const isDuplicate = currentList.some(item => item.nombre.trim().toUpperCase() === nameNormalized);
          
          if (isDuplicate) {
            analyzed.push({
              nombre: nameNormalized,
              tipo: row.tipo || '',
              estado: 'ACTIVO',
              es_serializado: esSerializado,
              status: 'REPETIDO',
              reason: 'Ya existe registrado en el sistema'
            });
            continue;
          }

          let tipoValido = true;
          let resolvedTipoId = null;

          if (activeTab === 'elementos') {
            if (!row.tipo) {
              analyzed.push({
                nombre: nameNormalized,
                tipo: '(VACÍO)',
                estado: 'ACTIVO',
                es_serializado: esSerializado,
                status: 'ERROR',
                reason: 'El tipo es obligatorio para códigos de elementos'
              });
              continue;
            }
            const tipoStr = row.tipo.toString().trim().toUpperCase();
            const foundTipo = tipos.find(t => t.nombre.trim().toUpperCase() === tipoStr);
            if (!foundTipo) {
              tipoValido = false;
            } else {
              resolvedTipoId = foundTipo.id;
            }
          }

          if (activeTab === 'elementos' && !tipoValido) {
            analyzed.push({
              nombre: nameNormalized,
              tipo: row.tipo || '',
              estado: 'ACTIVO',
              es_serializado: esSerializado,
              status: 'ERROR',
              reason: `El tipo de elemento "${row.tipo}" no existe`
            });
            continue;
          }

          // If everything is fine, it is APTO!
          analyzed.push({
            nombre: nameNormalized,
            tipo: row.tipo || '',
            estado: 'ACTIVO',
            es_serializado: esSerializado,
            status: 'APTO',
            reason: 'Apto para importar',
            resolvedTipoId
          });
        }

        setPreviewRows(analyzed);
        setShowPreviewModal(true);
      } catch (error) {
        toast.error('Error procesando el archivo de Excel');
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const confirmImport = async () => {
    const aptos = previewRows.filter(r => r.status === 'APTO');
    if (aptos.length === 0) {
      toast.warning('No hay registros aptos para importar');
      return;
    }

    setIsLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const row of aptos) {
        try {
          // Payload formulation (Enforce EST-01 ACTIVE by default)
          const payload: any = {
            nombre: row.nombre,
            estado_id: 'EST-01',
            usuario_control: user.name
          };

          if (activeTab === 'elementos') {
            payload.tipo_id = row.resolvedTipoId;
            payload.es_serializado = !!row.es_serializado;
          }

          let res;
          if (activeTab === 'elementos') {
            res = await api.saveGhElemento(payload);
          } else {
            res = await api.saveGhTipoElemento(payload);
          }

          if (res.success) successCount++;
          else errorCount++;
        } catch {
          errorCount++;
        }
      }

      toast.success(`Importación finalizada con éxito: ${successCount} guardados correctamente.`);
      setShowPreviewModal(false);
      loadData();
    } catch (error) {
      toast.error('Error durante la importación');
    } finally {
      setIsLoading(false);
    }
  };

  const exportPreviewToExcel = () => {
    const dataToExport = previewRows.map(r => {
      if (activeTab === 'elementos') {
        return {
          Nombre: r.nombre,
          Tipo: r.tipo,
          Serializado: r.es_serializado ? 'SI' : 'NO',
          Estado: r.estado,
          Estado_Importacion: r.status,
          Observacion: r.reason
        };
      } else {
        return {
          Nombre: r.nombre,
          Estado: r.estado,
          Estado_Importacion: r.status,
          Observacion: r.reason
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vista Previa Importar");
    XLSX.writeFile(workbook, `Vista_Previa_Importacion_${activeTab}.xlsx`);
    toast.success('Resultados de vista previa exportados con éxito');
  };

  // Filter & Pagination Logic
  const dataList = activeTab === 'elementos' ? elementos : tipos;
  const filteredData = dataList.filter(item => 
    item.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (!canView) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-2xl font-black text-red-500">ACCESO DENEGADO</h2>
        <p className="text-slate-500">No tienes permisos para ver este módulo.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">MASTER INVENTARIO</h1>
          <p className="text-slate-500 font-bold mt-1">Configuración de elementos y tipos de Gestión Humana</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={loadData} className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          
          <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-600 font-bold rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100">
            <FileDown size={20} /> Exportar
          </button>

          {canCreate && (
            <label className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors cursor-pointer border border-blue-100">
              <FileUp size={20} /> Importar
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importFromExcel} />
            </label>
          )}

          {canCreate && (
            <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-3 bg-amber-50 text-amber-600 font-bold rounded-xl hover:bg-amber-100 transition-colors border border-amber-100">
              <FileDown size={20} /> Descargar Formato
            </button>
          )}

          {canCreate && (
            <button onClick={() => openModal()} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg">
              <Plus size={20} /> Nuevo
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => { setActiveTab('elementos'); setCurrentPage(1); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'elementos' ? 'bg-white text-emerald-600 shadow-md' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          <Package size={18} /> Códigos Elementos
        </button>
        <button
          onClick={() => { setActiveTab('tipos'); setCurrentPage(1); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'tipos' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          <Settings2 size={18} /> Tipos de Elementos
        </button>
      </div>

      <DataTable
        data={activeTab === 'elementos' ? elementos : tipos}
        columns={activeTab === 'elementos' ? elementosColumns : tiposColumns}
        searchPlaceholder="Buscar por nombre..."
        excelFileName={`GH_Master_Inventario_${activeTab === 'elementos' ? 'Elementos' : 'Tipos'}_${new Date().toISOString().split('T')[0]}.xlsx`}
        excelSheetName={activeTab === 'elementos' ? 'Códigos Elementos' : 'Tipos de Elementos'}
      />

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                {editItem ? 'Editar' : 'Nuevo'} {activeTab === 'elementos' ? 'Elemento' : 'Tipo'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={e => setFormData({...formData, nombre: e.target.value.toUpperCase()})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-bold text-slate-700 uppercase"
                  placeholder="Ej. COMPUTADOR PORTÁTIL"
                />
              </div>

              {activeTab === 'elementos' && (
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Tipo de Elemento</label>
                  <select
                    required
                    value={formData.tipo_id}
                    onChange={e => setFormData({...formData, tipo_id: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-bold text-slate-700"
                  >
                    <option value="">Seleccione un tipo...</option>
                    {tipos.filter(t => t.estado_id === 'EST-01').map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeTab === 'elementos' && (() => {
                const isSerializationDisabled = !!(editItem && editItem.tiene_movimientos);
                return (
                  <div 
                    className={`flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl transition-all ${
                      isSerializationDisabled ? 'opacity-75 cursor-not-allowed' : 'hover:bg-slate-100/50 cursor-pointer'
                    }`} 
                    onClick={() => {
                      if (!isSerializationDisabled) {
                        setFormData({...formData, es_serializado: !formData.es_serializado});
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={isSerializationDisabled}
                      checked={formData.es_serializado}
                      onChange={e => {
                        if (!isSerializationDisabled) {
                          setFormData({...formData, es_serializado: e.target.checked});
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                      className={`w-5 h-5 rounded-lg border-slate-300 text-emerald-500 focus:ring-emerald-500 transition-all ${
                        isSerializationDisabled ? 'cursor-not-allowed text-slate-400 bg-slate-100' : 'cursor-pointer'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Es Elemento Serializado</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Marque esta casilla si cada unidad de este elemento posee un número de serial único</p>
                      {isSerializationDisabled && (
                        <p className="text-[9px] text-amber-600 font-extrabold uppercase mt-2 tracking-wide">
                          * Bloqueado: Este elemento ya posee saldo en inventario o transacciones registradas.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {editItem && (
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Estado</label>
                  <select
                    value={formData.estado_id}
                    onChange={e => setFormData({...formData, estado_id: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-bold text-slate-700"
                  >
                    <option value="EST-01">ACTIVO</option>
                    <option value="EST-02">INACTIVO</option>
                  </select>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isLoading} className="flex-1 py-3 px-4 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2">
                  {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Análisis de Importación ({activeTab === 'elementos' ? 'Códigos' : 'Tipos'})</h3>
                <p className="text-xs text-slate-400 font-bold uppercase mt-0.5">Revise el diagnóstico antes de confirmar el guardado permanente</p>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="text-2xl font-light hover:text-red-500 transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Stats Summary Panel */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-8 bg-slate-50 shrink-0 border-b border-slate-100">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Leídos</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{previewRows.length}</p>
              </div>
              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Aptos para Guardar</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">{previewRows.filter(r => r.status === 'APTO').length}</p>
              </div>
              <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Repetidos (Se Omitirán)</p>
                <p className="text-2xl font-black text-amber-700 mt-1">{previewRows.filter(r => r.status === 'REPETIDO').length}</p>
              </div>
              <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-center">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Errores Críticos</p>
                <p className="text-2xl font-black text-rose-700 mt-1">{previewRows.filter(r => r.status === 'ERROR').length}</p>
              </div>
            </div>

            {/* Pre-Import Data Grid */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest font-black">
                    <th className="p-3 pl-4 border-b border-slate-200">Nombre</th>
                    {activeTab === 'elementos' && <th className="p-3 border-b border-slate-200">Tipo</th>}
                    {activeTab === 'elementos' && <th className="p-3 border-b border-slate-200">Serializado</th>}
                    <th className="p-3 border-b border-slate-200">Estado</th>
                    <th className="p-3 border-b border-slate-200">Diagnóstico</th>
                    <th className="p-3 pr-4 border-b border-slate-200">Observación</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                      <td className="p-3 pl-4 font-bold text-slate-700 uppercase">{row.nombre}</td>
                      {activeTab === 'elementos' && <td className="p-3 font-semibold text-slate-600 uppercase">{row.tipo || 'N/A'}</td>}
                      {activeTab === 'elementos' && (
                        <td className="p-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            row.es_serializado ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {row.es_serializado ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                      )}
                      <td className="p-3 font-semibold text-slate-600 uppercase">{row.estado}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          row.status === 'APTO' ? 'bg-emerald-100 text-emerald-700' :
                          row.status === 'REPETIDO' ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3 pr-4 font-medium text-slate-500 uppercase">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Actions */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button 
                type="button" 
                onClick={exportPreviewToExcel} 
                className="flex items-center gap-2 px-5 py-3.5 bg-emerald-50 text-emerald-600 font-bold rounded-2xl hover:bg-emerald-100 transition-all border border-emerald-100 text-xs"
              >
                <FileDown size={16} /> Exportar Vista Previa a Excel
              </button>
              
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowPreviewModal(false)} 
                  className="px-5 py-3.5 bg-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-300 transition-all text-xs"
                >
                  Descartar
                </button>
                <button 
                  type="button" 
                  disabled={isLoading || previewRows.filter(r => r.status === 'APTO').length === 0}
                  onClick={confirmImport} 
                  className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  Confirmar e Importar ({previewRows.filter(r => r.status === 'APTO').length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteItemId !== null && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">¿Confirmar eliminación?</h3>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Esta acción es permanente y no se podrá deshacer.</p>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                type="button" 
                onClick={() => setDeleteItemId(null)} 
                className="flex-1 py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors text-xs uppercase"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleDelete} 
                disabled={isLoading}
                className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-500/20 text-xs uppercase flex items-center justify-center gap-1.5"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <Trash2 size={14} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
