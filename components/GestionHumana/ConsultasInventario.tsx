import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { DataTable, ColumnDef } from '../shared/DataTable';
import * as XLSX from 'xlsx';
import {
  Package, Users, Search, RefreshCw, Barcode,
  Download, BoxIcon, Calendar, FileText, ChevronDown
} from 'lucide-react';

interface SearchableSelectProps {
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedOpt = options.find(o => o.value.toString() === value?.toString());

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    setSearch('');
  };

  return (
    <div className="relative w-full">
      <div 
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer focus-within:ring-2 focus-within:ring-slate-900 ${disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed text-slate-400' : 'text-slate-700'}`}
      >
        <span className={`text-xs font-semibold ${selectedOpt && selectedOpt.value !== '' ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-60 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50 shrink-0">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-xs font-bold text-slate-700 uppercase"
              />
            </div>
            
            <div className="overflow-y-auto custom-scrollbar flex-1 max-h-48">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Sin resultados
                </div>
              ) : (
                filteredOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value.toString());
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold uppercase transition-colors block ${opt.value.toString() === value?.toString() ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface Props {
  user: User;
}

const ConsultasInventario: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'bodega' | 'personal' | 'historial'>('bodega');
  const [isLoading, setIsLoading] = useState(false);

  // Bodega state
  const [bodegaData, setBodegaData] = useState<any[]>([]);
  const [filterElementoBodega, setFilterElementoBodega] = useState('');

  // Personal state
  const [personalData, setPersonalData] = useState<any[]>([]);
  const [filterPersonalId, setFilterPersonalId] = useState('');
  const [filterElementoPersonal, setFilterElementoPersonal] = useState('');

  // Historial state
  const [historialData, setHistorialData] = useState<any[]>([]);
  const [filterHistorialPersonalId, setFilterHistorialPersonalId] = useState('');
  const [filterHistorialTipo, setFilterHistorialTipo] = useState<'TODOS' | 'ENTREGA' | 'DEVOLUCION'>('TODOS');
  const [filterHistorialFechaInicio, setFilterHistorialFechaInicio] = useState('');
  const [filterHistorialFechaFin, setFilterHistorialFechaFin] = useState('');

  // Catalogs
  const [elementosList, setElementosList] = useState<any[]>([]);
  const [personalList, setPersonalList] = useState<any[]>([]);

  // View modals
  const [viewSerials, setViewSerials] = useState<any | null>(null);
  const [viewPersonalActivos, setViewPersonalActivos] = useState<any | null>(null);
  const [viewMovimientoItems, setViewMovimientoItems] = useState<any | null>(null);

  const bodegaColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'Elemento',
      key: 'elemento_nombre',
      render: (row) => <span className="font-black text-slate-900">{row.elemento_nombre}</span>
    },
    {
      header: 'Tipo',
      key: 'tipo_nombre',
      render: (row) => <span className="text-slate-500 font-bold">{row.tipo_nombre || '—'}</span>
    },
    {
      header: 'Serializado',
      key: 'es_serializado',
      render: (row) => row.es_serializado
        ? <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[9px] font-black uppercase">Sí</span>
        : <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg text-[9px] font-black uppercase">No</span>
    },
    {
      header: 'Stock Bodega',
      key: 'stock',
      render: (row) => <span className={`text-lg font-black ${Number(row.stock) === 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{row.stock}</span>
    },
    {
      header: 'Detalle',
      key: 'acciones',
      sortable: false,
      render: (row) => row.es_serializado && (
        <button
          onClick={() => setViewSerials(row)}
          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5 ml-auto"
        >
          <Barcode size={11} /> Seriales
        </button>
      )
    }
  ], []);

  const personalColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'Funcionario',
      key: 'personal_nombre',
      render: (row) => <span className="font-black text-slate-900">{row.personal_nombre}</span>
    },
    {
      header: 'Documento',
      key: 'personal_documento',
      render: (row) => <span className="text-slate-500 font-bold">{row.personal_documento}</span>
    },
    {
      header: 'Cargo',
      key: 'cargo',
      render: (row) => <span className="text-slate-500 font-bold">{row.cargo || '—'}</span>
    },
    {
      header: 'Elementos',
      key: 'items_count',
      render: (row) => <span className="font-black text-indigo-600">{row.items.length}</span>
    },
    {
      header: 'Total Unidades',
      key: 'total_items',
      render: (row) => <span className="font-black text-emerald-600 text-base">{row.totalItems}</span>
    },
    {
      header: 'Acción',
      key: 'acciones',
      sortable: false,
      render: (row) => (
        <button
          onClick={() => setViewPersonalActivos(row)}
          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5 ml-auto"
        >
          <Package size={11} /> Ver Activos
        </button>
      )
    }
  ], []);

  const historialColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'Documento',
      key: 'numero',
      render: (row) => <span className="font-black text-slate-900">{row.numero}</span>
    },
    {
      header: 'Tipo',
      key: 'tipo',
      render: (row) => row.tipo === 'ENTREGA' ? (
        <span className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[9px] font-black uppercase">
          Entrega
        </span>
      ) : (
        <span className="px-2 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-[9px] font-black uppercase">
          Devolución
        </span>
      )
    },
    {
      header: 'Fecha',
      key: 'fecha',
      render: (row) => <span className="text-slate-500 font-bold">{new Date(row.fecha).toLocaleDateString('es-CO')}</span>
    },
    {
      header: 'Colaborador',
      key: 'personal_nombre',
      render: (row) => (
        <div className="font-bold text-slate-900">
          {row.personal_nombre}
          <div className="text-[10px] text-slate-400 font-bold">C.C. {row.personal_documento}</div>
        </div>
      )
    },
    {
      header: 'Detalles / Obs',
      key: 'observaciones',
      render: (row) => <span className="max-w-xs truncate text-slate-500 font-medium block">{row.observaciones || '—'}</span>
    },
    {
      header: 'Firma',
      key: 'firma_estado',
      render: (row) => row.firma_estado === 'FIRMADO' ? (
        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase">
          Firmado
        </span>
      ) : (
        <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[9px] font-black uppercase">
          Pendiente
        </span>
      )
    },
    {
      header: 'Acciones',
      key: 'acciones',
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <button
            onClick={() => setViewMovimientoItems(row)}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[9px] uppercase tracking-wider flex items-center gap-1"
          >
            <Package size={11} /> Items
          </button>
          <button
            onClick={async () => {
              try {
                if (row.tipo === 'ENTREGA') {
                  await api.downloadAsignacionPDF(row.id);
                } else {
                  await api.downloadDevolucionPDF(row.id);
                }
              } catch (err: any) {
                toast.error(err.message || 'Error al descargar PDF');
              }
            }}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
            title="Descargar PDF"
          >
            <Download size={13} />
          </button>
        </div>
      )
    }
  ], []);

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
      if (Array.isArray(pRes)) setPersonalList(pRes);
    } catch (e) { console.error(e); }
  };

  const loadData = async (params?: any) => {
    setIsLoading(true);
    try {
      if (activeTab === 'bodega') {
        const res = await api.getGhInventarioBodega(params);
        if (res.success) setBodegaData(res.data);
      } else if (activeTab === 'personal') {
        const res = await api.getGhInventarioPersonal(params);
        if (res.success) setPersonalData(res.data);
      } else if (activeTab === 'historial') {
        const fetchParams: any = {};
        if (filterHistorialPersonalId) fetchParams.personal_id = filterHistorialPersonalId;
        if (filterHistorialFechaInicio) fetchParams.fecha_inicio = filterHistorialFechaInicio;
        if (filterHistorialFechaFin) fetchParams.fecha_fin = filterHistorialFechaFin;

        let assignments: any[] = [];
        let devoluciones: any[] = [];

        if (filterHistorialTipo === 'TODOS' || filterHistorialTipo === 'ENTREGA') {
          const res = await api.getGhAsignaciones(fetchParams);
          if (res.success) assignments = res.data || [];
        }
        if (filterHistorialTipo === 'TODOS' || filterHistorialTipo === 'DEVOLUCION') {
          const res = await api.getGhDevoluciones(fetchParams);
          if (res.success) devoluciones = res.data || [];
        }

        const merged = [
          ...assignments.map(a => ({
            id: a.id,
            numero: a.numero_asignacion,
            tipo: 'ENTREGA',
            personal_id: a.personal_id,
            personal_nombre: a.personal_nombre,
            personal_documento: a.personal_documento,
            fecha: a.fecha,
            observaciones: a.observaciones,
            autorizado_por: a.autorizado_por,
            firma_estado: a.firma_estado,
            fecha_firma: a.fecha_firma,
            firmado_por: a.firmado_por,
            details: a.details || []
          })),
          ...devoluciones.map(d => ({
            id: d.id,
            numero: d.numero_devolucion,
            tipo: 'DEVOLUCION',
            personal_id: d.personal_id,
            personal_nombre: d.personal_nombre,
            personal_documento: d.personal_documento,
            fecha: d.fecha,
            observaciones: d.observaciones || d.motivo,
            autorizado_por: d.usuario_control,
            firma_estado: d.firma_estado,
            fecha_firma: d.fecha_firma,
            firmado_por: d.firmado_por,
            details: d.details || []
          }))
        ];

        merged.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        setHistorialData(merged);
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

  const handleSearchHistorial = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
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

  const resetHistorial = () => {
    setFilterHistorialPersonalId('');
    setFilterHistorialTipo('TODOS');
    setFilterHistorialFechaInicio('');
    setFilterHistorialFechaFin('');
    setTimeout(() => {
      loadData();
    });
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

  const exportHistorialExcel = () => {
    const rows = historialData.flatMap(mov => {
      if (mov.details && mov.details.length > 0) {
        return mov.details.map((d: any) => ({
          'Fecha': new Date(mov.fecha).toLocaleDateString('es-CO'),
          'Documento Nro': mov.numero,
          'Tipo de Movimiento': mov.tipo,
          'Funcionario': mov.personal_nombre,
          'Cédula': mov.personal_documento,
          'Elemento': d.elemento_nombre,
          'Cantidad': d.cantidad,
          'Seriales': d.serials && d.serials.length > 0 ? d.serials.join(', ') : 'N/A',
          'Observaciones/Motivo': mov.observaciones || '',
          'Autorizado Por/Recibido': mov.autorizado_por || '',
          'Estado Firma': mov.firma_estado || 'PENDIENTE'
        }));
      } else {
        return [{
          'Fecha': new Date(mov.fecha).toLocaleDateString('es-CO'),
          'Documento Nro': mov.numero,
          'Tipo de Movimiento': mov.tipo,
          'Funcionario': mov.personal_nombre,
          'Cédula': mov.personal_documento,
          'Elemento': 'Ninguno',
          'Cantidad': 0,
          'Seriales': 'N/A',
          'Observaciones/Motivo': mov.observaciones || '',
          'Autorizado Por/Recibido': mov.autorizado_por || '',
          'Estado Firma': mov.firma_estado || 'PENDIENTE'
        }];
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Movimientos');
    XLSX.writeFile(wb, `GH_Historial_Movimientos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Summary stats for bodega
  const totalElementosBodega = bodegaData.length;
  const totalUnidadesBodega = bodegaData.reduce((acc, r) => acc + Number(r.stock || 0), 0);
  const elementosSinStock = bodegaData.filter(r => Number(r.stock) === 0).length;

  // Summary stats for personal
  const totalFuncionarios = [...new Set(personalData.map(r => r.personal_id))].length;
  const totalUnidadesPersonal = personalData.reduce((acc, r) => acc + Number(r.stock || 0), 0);

  // Summary stats for historical movements
  const totalMovimientos = historialData.length;
  const totalEntregas = historialData.filter(m => m.tipo === 'ENTREGA').length;
  const totalDevoluciones = historialData.filter(m => m.tipo === 'DEVOLUCION').length;

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
          onClick={() => { setActiveTab('bodega'); setViewSerials(null); setViewPersonalActivos(null); setViewMovimientoItems(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'bodega' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <BoxIcon size={15} className="text-indigo-500" /> Inventario Bodega
        </button>
        <button
          onClick={() => { setActiveTab('personal'); setViewSerials(null); setViewPersonalActivos(null); setViewMovimientoItems(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'personal' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <Users size={15} className="text-emerald-500" /> Inventario Personal
        </button>
        <button
          onClick={() => { setActiveTab('historial'); setViewSerials(null); setViewPersonalActivos(null); setViewMovimientoItems(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'historial' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <RefreshCw size={15} className="text-blue-500 animate-none" /> Historial Movimientos
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
              <SearchableSelect
                options={[{ value: '', label: 'Todos los elementos' }, ...elementosList.map(el => ({ value: el.id, label: el.nombre }))]}
                value={filterElementoBodega}
                onChange={setFilterElementoBodega}
                placeholder="Todos los elementos"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="py-2.5 px-5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 text-xs uppercase">
                <Search size={14} /> Consultar
              </button>
              <button type="button" onClick={resetBodega} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
                Limpiar
              </button>
            </div>
          </form>

          <DataTable
            data={bodegaData}
            columns={bodegaColumns}
            searchPlaceholder="Buscar en bodega..."
            excelFileName={`GH_Inventario_Bodega_${new Date().toISOString().split('T')[0]}.xlsx`}
            excelSheetName="Bodega"
          />
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
              <SearchableSelect
                options={[{ value: '', label: 'Todos los funcionarios' }, ...personalList.map(p => ({ value: p.id, label: p.nombre }))]}
                value={filterPersonalId}
                onChange={setFilterPersonalId}
                placeholder="Todos los funcionarios"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Elemento</label>
              <SearchableSelect
                options={[{ value: '', label: 'Todos los elementos' }, ...elementosList.map(el => ({ value: el.id, label: el.nombre }))]}
                value={filterElementoPersonal}
                onChange={setFilterElementoPersonal}
                placeholder="Todos los elementos"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="py-2.5 px-5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 text-xs uppercase">
                <Search size={14} /> Consultar
              </button>
              <button type="button" onClick={resetPersonal} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
                Limpiar
              </button>
            </div>
          </form>

          <DataTable
            data={Object.values(personalGrouped)}
            columns={personalColumns}
            searchPlaceholder="Buscar en inventario personal..."
            excelFileName={`GH_Inventario_Personal_${new Date().toISOString().split('T')[0]}.xlsx`}
            excelSheetName="Inventario Personal"
          />
        </>
      )}

      {/* ============ HISTORIAL TAB ============ */}
      {activeTab === 'historial' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Movimientos</div>
              <div className="text-3xl font-black text-slate-900">{totalMovimientos}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entregas Realizadas</div>
              <div className="text-3xl font-black text-indigo-600">{totalEntregas}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Devoluciones Recibidas</div>
              <div className="text-3xl font-black text-orange-600">{totalDevoluciones}</div>
            </div>
          </div>

          {/* Filter */}
          <form onSubmit={handleSearchHistorial} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Funcionario</label>
              <SearchableSelect
                options={[{ value: '', label: 'Todos los funcionarios' }, ...personalList.map(p => ({ value: p.id, label: p.nombre }))]}
                value={filterHistorialPersonalId}
                onChange={setFilterHistorialPersonalId}
                placeholder="Todos los funcionarios"
              />
            </div>
            <div className="flex-1 min-w-36">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tipo Movimiento</label>
              <select
                value={filterHistorialTipo}
                onChange={e => setFilterHistorialTipo(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
              >
                <option value="TODOS">Todos</option>
                <option value="ENTREGA">Entregas</option>
                <option value="DEVOLUCION">Devoluciones</option>
              </select>
            </div>
            <div className="min-w-32">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Desde</label>
              <input
                type="date"
                value={filterHistorialFechaInicio}
                onChange={e => setFilterHistorialFechaInicio(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
              />
            </div>
            <div className="min-w-32">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Hasta</label>
              <input
                type="date"
                value={filterHistorialFechaFin}
                onChange={e => setFilterHistorialFechaFin(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="py-2.5 px-5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 text-xs uppercase">
                <Search size={14} /> Consultar
              </button>
              <button type="button" onClick={resetHistorial} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
                Limpiar
              </button>
            </div>
          </form>

          <DataTable
            data={historialData}
            columns={historialColumns}
            searchPlaceholder="Buscar en historial..."
            excelFileName={`GH_Historial_Movimientos_${new Date().toISOString().split('T')[0]}.xlsx`}
            excelSheetName="Historial Movimientos"
          />
        </>
      )}

      {/* Bodega serials modal */}
      {viewSerials && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-8 py-6 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <Barcode size={24} />
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    Seriales Registrados
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">{viewSerials.elemento_nombre}</p>
                </div>
              </div>
              <button onClick={() => setViewSerials(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/25 hover:bg-white/35 text-white font-black text-sm transition-all">
                ×
              </button>
            </div>
            <div className="p-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewSerials.serials?.length === 0 ? (
                  <span className="text-xs text-slate-400 font-bold col-span-2 text-center py-8">Sin seriales registrados en bodega.</span>
                ) : viewSerials.serials?.map((s: any, i: number) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Barcode size={14} className="text-slate-400" />
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">{s.serial}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      {estadoSerialBadge(s.estado_serial)}
                      {s.asignado_a && (
                        <span className="text-[10px] text-slate-500 font-black truncate max-w-[150px]" title={s.asignado_a}>
                          {s.asignado_a}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Personal actives modal */}
      {viewPersonalActivos && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-8 py-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <Users size={24} />
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    Activos Asignados
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">{viewPersonalActivos.personal_nombre}</p>
                </div>
              </div>
              <button onClick={() => setViewPersonalActivos(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/25 hover:bg-white/35 text-white font-black text-sm transition-all">
                ×
              </button>
            </div>
            <div className="p-8 overflow-y-auto max-h-[70vh] custom-scrollbar space-y-3">
              {viewPersonalActivos.items?.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-8">Sin activos asignados.</p>
              ) : viewPersonalActivos.items.map((item: any, i: number) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-slate-900 text-xs">{item.elemento_nombre}</span>
                      <span className="ml-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">{item.tipo_nombre}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">x{item.stock}</span>
                  </div>
                  {item.es_serializado && item.serials?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1 border-t border-slate-200/60 pt-2">
                      {item.serials.map((s: any, si: number) => (
                        <span key={si} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Barcode size={9} /> {s.serial}
                          {s.fecha_asignacion && <span className="text-[8px] text-slate-400 font-medium ml-1">({new Date(s.fecha_asignacion).toLocaleDateString('es-CO')})</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Movement items modal */}
      {viewMovimientoItems && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-8 py-6 text-white flex justify-between items-center shrink-0 ${viewMovimientoItems.tipo === 'ENTREGA' ? 'bg-blue-600' : 'bg-orange-500'}`}>
              <div className="flex items-center gap-3">
                <FileText size={24} />
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    Items del Documento
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">{viewMovimientoItems.numero} - {viewMovimientoItems.tipo}</p>
                </div>
              </div>
              <button onClick={() => setViewMovimientoItems(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/25 hover:bg-white/35 text-white font-black text-sm transition-all">
                ×
              </button>
            </div>
            <div className="p-8 overflow-y-auto max-h-[70vh] custom-scrollbar space-y-3">
              {viewMovimientoItems.details?.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-8">Sin artículos registrados.</p>
              ) : viewMovimientoItems.details.map((item: any, idx: number) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900 text-xs">{item.elemento_nombre}</span>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-lg border ${viewMovimientoItems.tipo === 'ENTREGA' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>x{item.cantidad}</span>
                  </div>
                  {item.es_serializado && item.serials && item.serials.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1 border-t border-slate-200/60 pt-2">
                      {item.serials.map((s: string, si: number) => (
                        <span key={si} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Barcode size={9} /> {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ConsultasInventario;
