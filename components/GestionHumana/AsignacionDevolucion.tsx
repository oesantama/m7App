import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { DataTable, ColumnDef } from '../shared/DataTable';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowLeftRight,
  Search,
  Trash2,
  Plus,
  RefreshCw,
  FileText,
  CheckCircle2,
  ChevronDown,
  Calendar,
  Barcode,
  Users,
  UserCheck,
  UserMinus,
  MessageSquare,
  FileSpreadsheet,
  PenLine,
  Clock,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Download,
  FileDown
} from 'lucide-react';

interface Props {
  user: User;
}

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
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer focus-within:ring-2 focus-within:ring-slate-900 ${disabled ? 'bg-slate-50 opacity-60 cursor-not-allowed text-slate-400' : 'text-slate-700'}`}
      >
        <span className={`text-xs font-semibold ${selectedOpt ? 'text-slate-800' : 'text-slate-400'}`}>
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

const AsignacionDevolucion: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'asignaciones' | 'devoluciones'>('asignaciones');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Lists
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [devoluciones, setDevoluciones] = useState<any[]>([]);
  
  // Dropdowns/Catalogs
  const [personalList, setPersonalList] = useState<any[]>([]);
  const [elementosBodegaList, setElementosBodegaList] = useState<any[]>([]); // elements with warehouse stock
  const [personalElementsList, setPersonalElementsList] = useState<any[]>([]); // elements assigned to selected person

  // Filtering
  const [searchId, setSearchId] = useState('');
  const [searchPersonalId, setSearchPersonalId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Row Expansion / Details Modal
  const [viewDetail, setViewDetail] = useState<any | null>(null);

  // Main Modal for new movements
  const [showModal, setShowModal] = useState(false);

  // Header & Detail states for new records
  const [formHeader, setFormHeader] = useState<any>({
    numero_operacion: '',
    personal_id: '',
    autorizado_por: '',
    motivo: '',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: ''
  });
  const [formItems, setFormItems] = useState<any[]>([]);
  
  // Add item scratch state
  const [selectedElementId, setSelectedElementId] = useState('');
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [inputCantidad, setInputCantidad] = useState<number>(1);
  const [availableStock, setAvailableStock] = useState<number>(0);
  
  // Serial control
  const [availableSerials, setAvailableSerials] = useState<any[]>([]); // serials available to select
  const [selectedSerial, setSelectedSerial] = useState('');
  const [scannedSerials, setScannedSerials] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Post-create: sign now or later dialog
  const [signDialog, setSignDialog] = useState<{ isOpen: boolean; asignacionId: number | null; personalNombre: string; tab: 'asignaciones' | 'devoluciones' }>({ isOpen: false, asignacionId: null, personalNombre: '', tab: 'asignaciones' });

  // Firma key modal (from list or from sign-now dialog)
  const [firmaModal, setFirmaModal] = useState<{ isOpen: boolean; asignacionId: number | null; personalNombre: string; clave: string; isSigning: boolean; tab: 'asignaciones' | 'devoluciones' }>({
    isOpen: false, asignacionId: null, personalNombre: '', clave: '', isSigning: false, tab: 'asignaciones'
  });
  const [showFirmaClave, setShowFirmaClave] = useState(false);

  // Derived permissions
  const isAdmin = user.roleId === 'ROL-01' || (user as any).role_id === 'ROL-01' || user.email === 'admin@millasiete.com';
  const canCreate = isAdmin || user.permissions?.some((p: any) => p.module === 'MASTER_INVENTARIO_GH' && p.actions.includes('create'));
  const canEdit = canCreate || user.permissions?.some((p: any) => p.module === 'MASTER_INVENTARIO_GH' && p.actions.includes('edit'));

  const asignacionesColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'ID',
      key: 'id',
      render: (asig) => <span className="text-slate-400">#{asig.id}</span>
    },
    {
      header: 'Identificador',
      key: 'numero_asignacion',
      render: (asig) => <span className="font-black text-slate-900">{asig.numero_asignacion}</span>
    },
    {
      header: 'Funcionario',
      key: 'personal_nombre',
      render: (asig) => <span>{asig.personal_nombre || `Funcionario ID: ${asig.personal_id}`}</span>
    },
    {
      header: 'Fecha Operación',
      key: 'fecha',
      render: (asig) => <span>{new Date(asig.fecha).toLocaleDateString()}</span>
    },
    {
      header: 'Autorizado Por',
      key: 'autorizado_por',
      render: (asig) => <span className="text-indigo-600 font-black">{asig.autorizado_por}</span>
    },
    {
      header: 'Registrado Por',
      key: 'usuario_control',
      render: (asig) => (
        <div className="text-slate-400 font-medium">
          {asig.usuario_control}
          <div className="text-[9px]">{new Date(asig.fecha_control).toLocaleString()}</div>
        </div>
      )
    },
    {
      header: 'Firma',
      key: 'firma_estado',
      render: (asig) => (
        <div className="text-center">
          {asig.firma_estado === 'FIRMADO' ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wider">
                <ShieldCheck size={10} /> Firmado
              </span>
              <span className="text-[9px] text-slate-600 font-bold">{asig.personal_nombre?.split(' ')[0]}</span>
              {asig.fecha_firma && (
                <span className="text-[9px] text-slate-400 font-medium">
                  {new Date(asig.fecha_firma).toLocaleDateString()}
                </span>
              )}
            </div>
          ) : (
            (() => {
              const isOwnRecord = user.documentNumber && asig.personal_documento === user.documentNumber;
              const canSign = canEdit || isOwnRecord;
              return canSign ? (
                <button
                  onClick={() => setFirmaModal({ isOpen: true, asignacionId: asig.id, personalNombre: asig.personal_nombre || '', clave: '', isSigning: false, tab: 'asignaciones' })}
                  className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                >
                  <span className="flex items-center gap-1"><Clock size={10} /> Pendiente</span>
                  <span className="text-[8px] text-amber-600 normal-case font-bold">{asig.personal_nombre?.split(' ')[0]}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
                  <Clock size={10} /> Pendiente
                </span>
              );
            })()
          )}
        </div>
      )
    },
    {
      header: 'Acción',
      key: 'acciones',
      sortable: false,
      render: (asig) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => exportToPDF(asig)}
            title="Exportar PDF"
            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-colors border border-red-200"
          >
            <FileDown size={12} />
          </button>
          <button
            onClick={() => setViewDetail(asig)}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5"
          >
            <FileText size={11} /> Detalle
          </button>
        </div>
      )
    }
  ], [user, canEdit]);

  const devolucionesColumns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      header: 'ID',
      key: 'id',
      render: (dev) => <span className="text-slate-400">#{dev.id}</span>
    },
    {
      header: 'Identificador',
      key: 'numero_devolucion',
      render: (dev) => <span className="font-black text-slate-900">{dev.numero_devolucion}</span>
    },
    {
      header: 'Funcionario',
      key: 'personal_nombre',
      render: (dev) => <span>{dev.personal_nombre || `Funcionario ID: ${dev.personal_id}`}</span>
    },
    {
      header: 'Fecha Operación',
      key: 'fecha',
      render: (dev) => <span>{new Date(dev.fecha).toLocaleDateString()}</span>
    },
    {
      header: 'Motivo Devolución',
      key: 'motivo',
      render: (dev) => <span className="text-rose-500 font-black truncate max-w-xs block">{dev.motivo}</span>
    },
    {
      header: 'Registrado Por',
      key: 'usuario_control',
      render: (dev) => (
        <div className="text-slate-400 font-medium">
          {dev.usuario_control}
          <div className="text-[9px]">{new Date(dev.fecha_control).toLocaleString()}</div>
        </div>
      )
    },
    {
      header: 'Firma',
      key: 'firma_estado',
      render: (dev) => (
        <div className="text-center">
          {dev.firma_estado === 'FIRMADO' ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wider">
                <ShieldCheck size={10} /> Firmado
              </span>
              <span className="text-[9px] text-slate-600 font-bold">{dev.personal_nombre?.split(' ')[0]}</span>
              {dev.fecha_firma && (
                <span className="text-[9px] text-slate-400 font-medium">
                  {new Date(dev.fecha_firma).toLocaleDateString()}
                </span>
              )}
            </div>
          ) : (
            (() => {
              const isOwnRecord = user.documentNumber && dev.personal_documento === user.documentNumber;
              const canSign = canEdit || isOwnRecord;
              return canSign ? (
                <button
                  onClick={() => setFirmaModal({ isOpen: true, asignacionId: dev.id, personalNombre: dev.personal_nombre || '', clave: '', isSigning: false, tab: 'devoluciones' })}
                  className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                >
                  <span className="flex items-center gap-1"><Clock size={10} /> Pendiente</span>
                  <span className="text-[8px] text-amber-600 normal-case font-bold">{dev.personal_nombre?.split(' ')[0]}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
                  <Clock size={10} /> Pendiente
                </span>
              );
            })()
          )}
        </div>
      )
    },
    {
      header: 'Acción',
      key: 'acciones',
      sortable: false,
      render: (dev) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => exportToPDF(dev)}
            title="Exportar PDF"
            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-colors border border-red-200"
          >
            <FileDown size={12} />
          </button>
          <button
            onClick={() => setViewDetail(dev)}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5"
          >
            <FileText size={11} /> Detalle
          </button>
        </div>
      )
    }
  ], [user, canEdit]);

  // Auto-focus barcode input
  useEffect(() => {
    if (showModal && selectedElement?.es_serializado) {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [showModal, selectedElement, scannedSerials]);

  useEffect(() => {
    loadTabRecords();
    loadDropdowns();
  }, [activeTab]);

  const loadDropdowns = async () => {
    try {
      const pRes = await api.getPersonal();
      setPersonalList(Array.isArray(pRes) ? pRes.filter((p: any) => p.estado === 'EST-01') : []);

      // Load all available elements from bodega dropdown
      const elRes = await api.getGhDropdownElementos();
      if (elRes.success) {
        setElementosBodegaList(elRes.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTabRecords = async (customParams?: any) => {
    setIsLoading(true);
    try {
      if (activeTab === 'asignaciones') {
        const res = await api.getGhAsignaciones(customParams);
        if (res.success) setAsignaciones(res.data);
      } else {
        const res = await api.getGhDevoluciones(customParams);
        if (res.success) setDevoluciones(res.data);
      }
    } catch (e) {
      toast.error('Error al cargar movimientos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: any = {};
    if (searchId.trim()) params.id = searchId.trim();
    if (searchPersonalId) params.personal_id = searchPersonalId;
    if (fechaInicio) params.fecha_inicio = fechaInicio;
    if (fechaFin) params.fecha_fin = fechaFin;
    loadTabRecords(params);
  };

  const resetSearch = () => {
    setSearchId('');
    setSearchPersonalId('');
    setFechaInicio('');
    setFechaFin('');
    loadTabRecords();
  };

  // Triggered when personal is selected inside the modal
  const handlePersonalChange = async (personalId: string) => {
    setFormHeader(prev => ({ ...prev, personal_id: personalId }));
    setFormItems([]);
    setSelectedElementId('');
    setSelectedElement(null);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);

    if (activeTab === 'devoluciones' && personalId) {
      try {
        const res = await api.getGhPersonalInventario(personalId);
        if (res.success) {
          setPersonalElementsList(res.data);
        }
      } catch (err) {
        toast.error('Error al obtener inventario del personal.');
      }
    }
  };

  // Triggered when element is selected inside the modal
  const handleElementChange = async (elementoId: string) => {
    setSelectedElementId(elementoId);
    setScannedSerials([]);
    setSelectedSerial('');
    setBarcodeInput('');

    if (!elementoId) {
      setSelectedElement(null);
      setAvailableStock(0);
      setAvailableSerials([]);
      return;
    }

    if (activeTab === 'asignaciones') {
      const el = elementosBodegaList.find(e => e.id.toString() === elementoId.toString());
      setSelectedElement(el || null);
      setAvailableStock(el ? el.stock : 0);

      if (el?.es_serializado) {
        try {
          const res = await api.getGhAvailableSerials(elementoId);
          if (res.success) {
            setAvailableSerials(res.data);
          }
        } catch (err) {
          toast.error('Error al consultar seriales en bodega.');
        }
      }
    } else {
      const el = personalElementsList.find(e => e.elemento_id.toString() === elementoId.toString());
      setSelectedElement(el ? { id: el.elemento_id, nombre: el.elemento_nombre, es_serializado: el.es_serializado } : null);
      setAvailableStock(el ? el.stock : 0);

      if (el?.es_serializado && formHeader.personal_id) {
        try {
          const res = await api.getGhPersonalSerials(formHeader.personal_id, elementoId);
          if (res.success) {
            setAvailableSerials(res.data);
          }
        } catch (err) {
          toast.error('Error al consultar seriales del personal.');
        }
      }
    }
  };

  const handleAddSerial = (serial: string) => {
    const raw = serial.trim().toUpperCase();
    if (!raw) return;

    if (scannedSerials.includes(raw)) {
      toast.error('El serial ya está adicionado.');
      setBarcodeInput('');
      return;
    }

    // Verify if serial is in the pool of available serials
    const exists = availableSerials.some(s => s.serial.toUpperCase() === raw);
    if (!exists) {
      toast.error(`El serial "${raw}" no está disponible en la lista.`);
      setBarcodeInput('');
      return;
    }

    setScannedSerials(prev => [...prev, raw]);
    setInputCantidad(prev => Math.max(prev, scannedSerials.length + 1));
    setBarcodeInput('');
    setSelectedSerial('');
  };

  const handleRemoveSerial = (serial: string) => {
    setScannedSerials(prev => prev.filter(s => s !== serial));
  };

  // Add Element to detailed form list
  const handleAddElementToForm = () => {
    if (!selectedElement) {
      toast.error('Seleccione un elemento válido.');
      return;
    }

    if (formItems.some(i => i.elemento_id.toString() === selectedElement.id.toString())) {
      toast.error('Este elemento ya está registrado en la transacción.');
      return;
    }

    const qty = selectedElement.es_serializado ? scannedSerials.length : inputCantidad;
    if (qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0.');
      return;
    }

    if (qty > availableStock) {
      toast.error(`La cantidad excede el stock disponible (${availableStock}).`);
      return;
    }

    if (selectedElement.es_serializado && scannedSerials.length === 0) {
      toast.error('Debe adicionar al menos un serial.');
      return;
    }

    const newItem = {
      elemento_id: selectedElement.id,
      nombre: selectedElement.nombre,
      es_serializado: selectedElement.es_serializado,
      cantidad: qty,
      serials: selectedElement.es_serializado ? [...scannedSerials] : []
    };

    setFormItems(prev => [...prev, newItem]);

    // Reset scratch state
    setSelectedElementId('');
    setSelectedElement(null);
    setInputCantidad(1);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);
  };

  // Open modal and initialize Header
  const handleOpenNewModal = () => {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    setFormHeader({
      numero_operacion: activeTab === 'asignaciones' ? `ASIG-${randomNum}` : `DEV-${randomNum}`,
      personal_id: '',
      autorizado_por: '',
      motivo: '',
      fecha: new Date().toISOString().split('T')[0],
      observaciones: ''
    });
    setFormItems([]);
    setSelectedElementId('');
    setSelectedElement(null);
    setInputCantidad(1);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);
    setShowModal(true);
  };

  const handleSaveMovement = async () => {
    if (!formHeader.personal_id) {
      toast.error('Seleccione la persona.');
      return;
    }

    if (activeTab === 'asignaciones' && !formHeader.autorizado_por.trim()) {
      toast.error('Indique quién autoriza la asignación.');
      return;
    }

    if (activeTab === 'devoluciones' && !formHeader.motivo.trim()) {
      toast.error('Indique el motivo de la devolución.');
      return;
    }

    if (formItems.length === 0) {
      toast.error('Debe registrar al menos un elemento en el detalle.');
      return;
    }

    setIsSaving(true);
    try {
      if (activeTab === 'asignaciones') {
        const payload = {
          numero_asignacion: formHeader.numero_operacion.trim().toUpperCase(),
          personal_id: formHeader.personal_id,
          autorizado_por: formHeader.autorizado_por.trim(),
          fecha: formHeader.fecha,
          observaciones: formHeader.observaciones,
          items: formItems,
          usuario_control: user.name
        };
        const res = await api.saveGhAsignacion(payload);
        if (res.success) {
          toast.success('Asignación registrada con éxito.');
          const personalSeleccionado = personalList.find(p => p.id.toString() === formHeader.personal_id.toString());
          setShowModal(false);
          loadTabRecords();
          setSignDialog({ isOpen: true, asignacionId: res.data?.id ?? null, personalNombre: personalSeleccionado?.nombre || '', tab: 'asignaciones' });
        } else {
          toast.error(res.error || 'Error al guardar la asignación.');
        }
      } else {
        const payload = {
          numero_devolucion: formHeader.numero_operacion.trim().toUpperCase(),
          personal_id: formHeader.personal_id,
          motivo: formHeader.motivo.trim(),
          fecha: formHeader.fecha,
          items: formItems,
          usuario_control: user.name
        };
        const res = await api.saveGhDevolucion(payload);
        if (res.success) {
          const personalSeleccionado = personalList.find(p => p.id.toString() === formHeader.personal_id.toString());
          setShowModal(false);
          loadTabRecords();
          // If the movement was done by someone else (not the personal), ask for signature
          if (res.data?.firma_estado === 'PENDIENTE') {
            toast.success('Devolución registrada. Firma pendiente del funcionario.');
            setSignDialog({ isOpen: true, asignacionId: res.data?.id ?? null, personalNombre: personalSeleccionado?.nombre || '', tab: 'devoluciones' });
          } else {
            toast.success('Devolución registrada y firmada automáticamente.');
          }
        } else {
          toast.error(res.error || 'Error al guardar la devolución.');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error de conexión.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFirmar = async () => {
    if (!firmaModal.asignacionId || !firmaModal.clave.trim()) {
      toast.error('Ingrese la clave de firma.');
      return;
    }
    setFirmaModal(prev => ({ ...prev, isSigning: true }));
    try {
      const firmarFn = firmaModal.tab === 'devoluciones' ? api.firmarDevolucion : api.firmarAsignacion;
      const res = await firmarFn(firmaModal.asignacionId, {
        clave_firma: firmaModal.clave.trim(),
        firmado_por: user.name,
      });
      if (res.success) {
        toast.success(res.message || 'Firmado exitosamente.');
        setFirmaModal({ isOpen: false, asignacionId: null, personalNombre: '', clave: '', isSigning: false, tab: 'asignaciones' });
        setShowFirmaClave(false);
        loadTabRecords();
      } else {
        toast.warning(res.error || 'Error al firmar.', {
          duration: Infinity,
          action: { label: 'Aceptar', onClick: () => {} },
        });
      }
    } catch (err: any) {
      toast.warning(err.message || 'Error de conexión.', {
        duration: Infinity,
        action: { label: 'Aceptar', onClick: () => {} },
      });
    } finally {
      setFirmaModal(prev => ({ ...prev, isSigning: false }));
    }
  };

  const exportToExcel = () => {
    const records = activeTab === 'asignaciones' ? asignaciones : devoluciones;
    const rows = records.map(r => {
      const base: any = {
        'ID': r.id,
        'Identificador': activeTab === 'asignaciones' ? r.numero_asignacion : r.numero_devolucion,
        'Funcionario': r.personal_nombre || '',
        'Documento': r.personal_documento || '',
        'Fecha Operación': new Date(r.fecha).toLocaleDateString('es-CO'),
      };
      if (activeTab === 'asignaciones') {
        base['Autorizado Por'] = r.autorizado_por || '';
      } else {
        base['Motivo'] = r.motivo || '';
      }
      base['Registrado Por'] = r.usuario_control || '';
      base['Fecha Registro'] = r.fecha_control ? new Date(r.fecha_control).toLocaleString('es-CO') : '';
      base['Estado Firma'] = r.firma_estado || 'PENDIENTE';
      base['Fecha Firma'] = r.fecha_firma ? new Date(r.fecha_firma).toLocaleDateString('es-CO') : '';
      base['Firmado Por'] = r.firmado_por || '';
      base['Elementos'] = r.details?.map((d: any) => `${d.elemento_nombre} x${d.cantidad}`).join('; ') || '';
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === 'asignaciones' ? 'Asignaciones' : 'Devoluciones');
    XLSX.writeFile(wb, `GH_${activeTab === 'asignaciones' ? 'Asignaciones' : 'Devoluciones'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = async (record: any) => {
    const isAsig = activeTab === 'asignaciones';
    try {
      if (isAsig) {
        await api.downloadAsignacionPDF(record.id);
      } else {
        await api.downloadDevolucionPDF(record.id);
      }
      toast.success('Documento PDF descargado exitosamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al descargar el acta PDF.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 shrink-0">
      
      {/* Header card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <ArrowLeftRight className="text-indigo-600" size={32} />
            Asignación y Devolución
          </h1>
          <p className="text-slate-500 font-bold mt-1">Gestión de activos y devoluciones del personal de la empresa</p>
        </div>
        {canCreate && (
          <button
            onClick={handleOpenNewModal}
            className="px-6 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl text-xs uppercase tracking-wider flex items-center gap-2 group border border-slate-800 active:scale-95"
          >
            <Plus size={16} className="transition-transform group-hover:rotate-90" />
            Nuevo Registro
          </button>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2">
        <button 
          onClick={() => { setActiveTab('asignaciones'); setViewDetail(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'asignaciones' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <UserCheck size={15} className="text-indigo-500" /> Asignaciones a Personal
        </button>
        <button 
          onClick={() => { setActiveTab('devoluciones'); setViewDetail(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'devoluciones' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <UserMinus size={15} className="text-rose-500" /> Devoluciones a Bodega
        </button>
      </div>

      {/* Filter panel */}
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Consultar por ID</label>
          <input
            type="number"
            placeholder="Ej: 5"
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Funcionario</label>
          <SearchableSelect
            placeholder="Todos..."
            value={searchPersonalId}
            onChange={val => setSearchPersonalId(val)}
            options={personalList.map(p => ({
              value: p.id,
              label: `${p.nombre} (${p.cedula})`
            }))}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={e => setFechaInicio(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Fin</label>
          <input
            type="date"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-xs uppercase">
            <Search size={14} /> Consultar
          </button>
          <button type="button" onClick={resetSearch} className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
            Limpiar
          </button>
        </div>
      </form>

      {/* Main Records List */}
      {activeTab === 'asignaciones' ? (
        <DataTable
          data={canEdit ? asignaciones : asignaciones.filter(a => user.documentNumber && a.personal_documento === user.documentNumber)}
          columns={asignacionesColumns}
          searchPlaceholder="Buscar en asignaciones..."
          excelFileName={`GH_Asignaciones_${new Date().toISOString().split('T')[0]}.xlsx`}
          excelSheetName="Asignaciones"
        />
      ) : (
        <DataTable
          data={devoluciones}
          columns={devolucionesColumns}
          searchPlaceholder="Buscar en devoluciones..."
          excelFileName={`GH_Devoluciones_${new Date().toISOString().split('T')[0]}.xlsx`}
          excelSheetName="Devoluciones"
        />
      )}

      {/* Main Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className={`px-8 py-6 text-white flex justify-between items-center shrink-0 ${activeTab === 'asignaciones' ? 'bg-indigo-600' : 'bg-rose-500'}`}>
              <div className="flex items-center gap-3">
                {activeTab === 'asignaciones' ? (
                  <UserCheck size={26} className="bg-indigo-700/50 p-1 rounded-lg" />
                ) : (
                  <UserMinus size={26} className="bg-rose-600/50 p-1 rounded-lg" />
                )}
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    {activeTab === 'asignaciones' ? 'Nueva Asignación a Funcionario' : 'Nueva Devolución a Bodega'}
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">Control de Inventario y Activos</p>
                </div>
              </div>
              <span className="bg-white/20 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider">
                {formHeader.numero_operacion}
              </span>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto space-y-6 flex-1 max-h-[70vh] custom-scrollbar">
              
              {/* Header card form */}
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Funcionario *</label>
                  <SearchableSelect
                    placeholder="Seleccione funcionario..."
                    value={formHeader.personal_id}
                    onChange={handlePersonalChange}
                    options={personalList.map(p => ({
                      value: p.id,
                      label: `${p.nombre} (${p.cedula})`
                    }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha *</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={formHeader.fecha}
                      onChange={e => setFormHeader({ ...formHeader, fecha: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800"
                    />
                  </div>
                </div>

                {activeTab === 'asignaciones' ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Autorizado Por *</label>
                    <input
                      type="text"
                      placeholder="Ej: Gerente Operaciones"
                      value={formHeader.autorizado_por}
                      onChange={e => setFormHeader({ ...formHeader, autorizado_por: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Motivo Devolución *</label>
                    <input
                      type="text"
                      placeholder="Ej: Fin de contrato / Daño"
                      value={formHeader.motivo}
                      onChange={e => setFormHeader({ ...formHeader, motivo: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800"
                    />
                  </div>
                )}

                {activeTab === 'asignaciones' && (
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Observaciones</label>
                    <textarea
                      placeholder="Indique especificaciones de la entrega o estado de los activos..."
                      rows={2}
                      value={formHeader.observaciones}
                      onChange={e => setFormHeader({ ...formHeader, observaciones: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800 resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Add item scratch area */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileSpreadsheet className="text-slate-500" size={14} /> Adicionar Elemento al Detalle
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Elemento *</label>
                    <SearchableSelect
                      placeholder={
                        !formHeader.personal_id 
                          ? 'Seleccione primero el funcionario...' 
                          : activeTab === 'asignaciones' 
                            ? 'Seleccione de Bodega...' 
                            : 'Seleccione de su inventario...'
                      }
                      disabled={!formHeader.personal_id}
                      value={selectedElementId}
                      onChange={handleElementChange}
                      options={
                        activeTab === 'asignaciones'
                          ? elementosBodegaList.map(e => ({
                              value: e.id,
                              label: `${e.nombre} (Disponible: ${e.stock})${e.es_serializado ? ' - [SERIALIZADO]' : ''}`
                            }))
                          : personalElementsList.map(e => ({
                              value: e.elemento_id,
                              label: `${e.elemento_nombre} (Asignado: ${e.stock})${e.es_serializado ? ' - [SERIALIZADO]' : ''}`
                            }))
                      }
                    />
                  </div>

                  {!selectedElement?.es_serializado ? (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                        Cantidad * {availableStock > 0 && <span className="text-[9px] text-slate-400 font-bold uppercase">(Disponible: {availableStock})</span>}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={availableStock}
                        value={inputCantidad}
                        onChange={e => setInputCantidad(Math.max(1, Math.min(availableStock, Number(e.target.value))))}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-black text-slate-900 focus:bg-white"
                      />
                    </div>
                  ) : (
                    <div className="md:col-span-2 space-y-3">
                      
                      {/* Barcode scanner focus panel */}
                      <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                          <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <Barcode size={13} className="animate-pulse" /> Ingreso Rápido por Código de Barras / Serial
                          </label>
                          <input
                            ref={barcodeInputRef}
                            type="text"
                            placeholder="Escanee serial con lector..."
                            value={barcodeInput}
                            onChange={e => setBarcodeInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSerial(barcodeInput);
                              }
                            }}
                            className="w-full px-4 py-2 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 text-xs font-black text-indigo-900 uppercase"
                          />
                        </div>
                        
                        <div className="w-full md:w-56">
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            Selección Manual de Serial
                          </label>
                          <SearchableSelect
                            placeholder="Seleccione de la lista..."
                            value={selectedSerial}
                            onChange={val => {
                              setSelectedSerial(val);
                              handleAddSerial(val);
                            }}
                            options={availableSerials
                              .filter(s => !scannedSerials.includes(s.serial.toUpperCase()))
                              .map(s => ({
                                value: s.serial,
                                label: s.serial
                              }))}
                          />
                        </div>
                      </div>

                      {/* Display scanned serial badges */}
                      {scannedSerials.length > 0 && (
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
                            <span>Seriales seleccionados ({scannedSerials.length}):</span>
                            <button 
                              type="button" 
                              onClick={() => setScannedSerials([])}
                              className="text-[9px] text-rose-500 underline uppercase"
                            >
                              Limpiar todos
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200/60 custom-scrollbar">
                            {scannedSerials.map((s, idx) => (
                              <span key={idx} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-800 rounded-lg text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                                <Barcode size={10} className="text-slate-400" />
                                {s}
                                <button 
                                  onClick={() => handleRemoveSerial(s)}
                                  type="button" 
                                  className="text-rose-500 hover:text-rose-700 font-bold ml-0.5"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!selectedElement?.es_serializado && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddElementToForm}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-white ${activeTab === 'asignaciones' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-500 hover:bg-rose-600'}`}
                      >
                        <Plus size={14} /> Adicionar
                      </button>
                    </div>
                  )}
                </div>

                {selectedElement?.es_serializado && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleAddElementToForm}
                      className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-white ${activeTab === 'asignaciones' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-500 hover:bg-rose-600'}`}
                    >
                      <Plus size={14} /> Adicionar Elemento ({scannedSerials.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Form detailed items list table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="text-emerald-500" size={15} /> Detalle de la Transacción
                </h4>
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs font-semibold text-slate-600">
                    <thead>
                      <tr className="bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest">
                        <th className="p-4 pl-6 w-16">Item</th>
                        <th className="p-4">Elemento</th>
                        <th className="p-4 text-center">Cantidad</th>
                        <th className="p-4">Seriales</th>
                        <th className="p-4 text-right pr-6 w-24">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase tracking-wide">
                            Ningún elemento adicionado aún.
                          </td>
                        </tr>
                      ) : (
                        formItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="p-4 pl-6 text-slate-400 font-bold">#{idx + 1}</td>
                            <td className="p-4 font-black text-slate-800">{item.nombre}</td>
                            <td className="p-4 text-center font-black text-slate-900 bg-slate-50/50">{item.cantidad}</td>
                            <td className="p-4">
                              {item.es_serializado ? (
                                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 custom-scrollbar">
                                  {item.serials.map((s: string, sIdx: number) => (
                                    <span key={sIdx} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-md text-[9px] font-black tracking-wider uppercase flex items-center gap-1">
                                      <Barcode size={8} /> {s}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 uppercase font-black">No Serializado</span>
                              )}
                            </td>
                            <td className="p-4 text-right pr-6">
                              <button
                                type="button"
                                onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-6 py-3.5 bg-slate-200 text-slate-700 font-black rounded-2xl hover:bg-slate-300 transition-all text-xs uppercase tracking-wider"
              >
                Cancelar
              </button>
              
              <button
                type="button"
                onClick={handleSaveMovement}
                disabled={isSaving || formItems.length === 0}
                className={`px-8 py-3.5 text-white font-black rounded-2xl shadow-lg transition-all text-xs uppercase tracking-wider flex items-center gap-2 ${
                  isSaving || formItems.length === 0 
                    ? 'bg-slate-300 shadow-none cursor-not-allowed text-slate-400' 
                    : activeTab === 'asignaciones' 
                      ? 'bg-indigo-600 hover:bg-indigo-700' 
                      : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Confirmar Movimiento
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Diálogo: Firmar ahora o después */}
      {signDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-indigo-600 px-6 py-5 text-white flex items-center gap-3">
              <PenLine size={22} className="bg-indigo-700/50 p-1 rounded-lg shrink-0" />
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">Firma de Asignación</h3>
                <p className="text-[11px] text-indigo-200 font-bold mt-0.5">Asignación creada — estado PENDIENTE DE FIRMA</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 font-semibold">
                ¿Desea que <span className="text-indigo-600 font-black">{signDialog.personalNombre}</span> firme ahora?
              </p>
              <p className="text-xs text-slate-500">
                El funcionario debe tener firma digital registrada y aprobada. Se requiere su clave de firma personal.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSignDialog({ isOpen: false, asignacionId: null, personalNombre: '', tab: 'asignaciones' })}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all text-xs uppercase tracking-wider"
                >
                  Firmar Después
                </button>
                <button
                  onClick={() => {
                    setSignDialog({ isOpen: false, asignacionId: null, personalNombre: '', tab: 'asignaciones' });
                    setFirmaModal({ isOpen: true, asignacionId: signDialog.asignacionId, personalNombre: signDialog.personalNombre, clave: '', isSigning: false, tab: signDialog.tab });
                  }}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <PenLine size={13} /> Firmar Ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ingresar clave de firma */}
      {firmaModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center gap-3">
              <KeyRound size={22} className="bg-white/10 p-1 rounded-lg shrink-0" />
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">Validar Firma Digital</h3>
                <p className="text-[11px] text-slate-300 font-bold mt-0.5">
                  Firma de: <span className="text-white">{firmaModal.personalNombre}</span>
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  Clave de Firma de {firmaModal.personalNombre} *
                </label>
                <div className="relative">
                  <input
                    type={showFirmaClave ? 'text' : 'password'}
                    autoFocus
                    placeholder="••••••••"
                    value={firmaModal.clave}
                    onChange={e => setFirmaModal(prev => ({ ...prev, clave: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleFirmar(); }}
                    className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-800 tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirmaClave(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
                  >
                    {showFirmaClave ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <KeyRound size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 font-semibold">
                  Esta es la <strong>clave de firma digital</strong>, diferente a la clave de inicio de sesión. Si no la recuerda, contacte al administrador.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setFirmaModal({ isOpen: false, asignacionId: null, personalNombre: '', clave: '', isSigning: false, tab: 'asignaciones' }); setShowFirmaClave(false); }}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all text-xs uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFirmar}
                  disabled={firmaModal.isSigning || !firmaModal.clave.trim()}
                  className={`flex-1 py-3 px-4 font-black rounded-2xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 text-white ${
                    firmaModal.isSigning || !firmaModal.clave.trim()
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-slate-900 hover:bg-slate-700'
                  }`}
                >
                  {firmaModal.isSigning ? (
                    <><RefreshCw size={13} className="animate-spin" /> Firmando...</>
                  ) : (
                    <><ShieldCheck size={13} /> Confirmar Firma</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {viewDetail && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-8 py-6 text-white flex justify-between items-center shrink-0 ${activeTab === 'asignaciones' ? 'bg-indigo-600' : 'bg-rose-500'}`}>
              <div className="flex items-center gap-3">
                <FileText size={24} />
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    Detalle de {activeTab === 'asignaciones' ? 'Asignación' : 'Devolución'}
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">#{viewDetail.id} - {viewDetail.numero_asignacion || viewDetail.numero_devolucion}</p>
                </div>
              </div>
              <button onClick={() => setViewDetail(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-sm transition-all">
                ×
              </button>
            </div>
            <div className="p-8 overflow-y-auto space-y-6 max-h-[70vh] custom-scrollbar">
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Elementos:</h4>
                <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs font-semibold text-slate-600">
                    <thead>
                      <tr className="bg-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest border-b border-slate-200">
                        <th className="p-3 pl-5">Elemento</th>
                        <th className="p-3 text-center">Cantidad</th>
                        <th className="p-3">Seriales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDetail.details?.map((det: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                          <td className="p-3 pl-5 font-bold text-slate-800">{det.elemento_nombre}</td>
                          <td className="p-3 text-center font-black text-slate-900">{det.cantidad}</td>
                          <td className="p-3">
                            {det.es_serializado ? (
                              <div className="flex flex-wrap gap-1.5">
                                {det.serials?.map((s: string, sIdx: number) => (
                                  <span key={sIdx} className={`px-2 py-0.5 border rounded-lg text-[9px] font-black tracking-wider uppercase flex items-center gap-1 ${activeTab === 'asignaciones' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                    <Barcode size={9} /> {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 uppercase font-black">N/A (No Serializado)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {viewDetail.observaciones && (
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 flex items-start gap-2 shadow-sm">
                  <MessageSquare size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Observaciones:</div>
                    <p className="text-xs text-slate-700 font-medium mt-0.5">{viewDetail.observaciones}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AsignacionDevolucion;
