import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { 
  Plus, Trash2, Save, Search, Calendar, X, FileText, 
  Package, RefreshCw, AlertCircle, Eye, ShoppingCart, 
  Truck, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, Barcode, Check,
  HelpCircle, CheckCircle, XCircle
} from 'lucide-react';

interface Props {
  user: User;
}

interface SearchableSelectProps {
  options: { value: string | number, label: string }[];
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
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer focus-within:ring-2 focus-within:ring-slate-900 ${disabled ? 'bg-slate-50 opacity-60 cursor-not-allowed text-slate-400' : 'text-slate-755'}`}
      >
        <span className={`text-xs font-semibold ${selectedOpt ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <>
          {/* Backdrop for easy dismiss */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-60 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Search Input bar */}
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
            
            {/* Options list */}
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

const EntregasSalidas: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'ordenes' | 'entradas' | 'salidas'>('ordenes');
  const [isLoading, setIsLoading] = useState(false);
  
  // Lists
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [entradas, setEntradas] = useState<any[]>([]);
  const [salidas, setSalidas] = useState<any[]>([]);
  
  // Dropdown list options
  const [elementosList, setElementosList] = useState<any[]>([]);
  const [tiposElementosList, setTiposElementosList] = useState<any[]>([]);
  const [pendingOrdersList, setPendingOrdersList] = useState<any[]>([]);
  const [provClientesList, setProvClientesList] = useState<any[]>([]);
  const [personalList, setPersonalList] = useState<any[]>([]);

  // Expanded row tracking for Details view
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filters State
  const [searchId, setSearchId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [searchProveedor, setSearchProveedor] = useState('');

  // Main Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null); // For linkage in warehouse entries
  const [showClosePOConfirm, setShowClosePOConfirm] = useState(false);

  // Form Header States
  const [formHeader, setFormHeader] = useState<any>({
    numero_orden: '',
    numero_factura: '',
    numero_salida: '',
    proveedor: '',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: '',
    orden_id: '',
    quien_recibio_id: ''
  });

  // Form Detail States
  const [formItems, setFormItems] = useState<any[]>([]);
  const [currentItem, setCurrentItem] = useState({
    elemento_id: '',
    cantidad: 1,
    valor_unitario: 0,
    es_serializado: false,
    serials: [] as string[]
  });

  // Nested Inline Element Creation Modal
  const [showNestedElementModal, setShowNestedElementModal] = useState(false);
  const [nestedElementForm, setNestedElementForm] = useState({
    nombre: '',
    tipo_id: '',
    es_serializado: false
  });

  // Helper State to select returning serials
  const [availableSerials, setAvailableSerials] = useState<any[]>([]);
  const [selectedSerialsToReturn, setSelectedSerialsToReturn] = useState<string[]>([]);
  const [selectingSerialsIdx, setSelectingSerialsIdx] = useState<number | null>(null);

  // Serial Entry Modal States
  const [serialModalIdx, setSerialModalIdx] = useState<number | null>(null);
  const [tempSerialValue, setTempSerialValue] = useState('');

  const serialInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (serialModalIdx !== null) {
      const timer = setTimeout(() => {
        serialInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [serialModalIdx, formItems]);

  useEffect(() => {
    loadTabRecords();
    loadDropdowns();
  }, [activeTab]);

  const loadDropdowns = async () => {
    try {
      const elRes = await api.getGhDropdownElementos();
      if (elRes.success) setElementosList(elRes.data);

      const tRes = await api.getGhTiposElementos();
      if (tRes.success) setTiposElementosList(tRes.data);

      const poRes = await api.getGhOrdenesCompra();
      if (poRes.success) {
        setPendingOrdersList(poRes.data.filter((po: any) => po.estado === 'PENDIENTE'));
      }

      const provRes = await api.getProvClientes();
      setProvClientesList(Array.isArray(provRes) ? provRes.filter((p: any) => p.estado === 'EST-01') : []);

      const persRes = await api.getPersonal();
      setPersonalList(Array.isArray(persRes) ? persRes.filter((p: any) => p.estado === 'EST-01') : []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadTabRecords = async (customParams?: any) => {
    setIsLoading(true);
    try {
      if (activeTab === 'ordenes') {
        const res = await api.getGhOrdenesCompra(customParams);
        if (res.success) setOrdenes(res.data);
      } else if (activeTab === 'entradas') {
        const res = await api.getGhEntradasBodega(customParams);
        if (res.success) setEntradas(res.data);
      } else {
        const res = await api.getGhSalidasProveedor(customParams);
        if (res.success) setSalidas(res.data);
      }
    } catch (error) {
      toast.error('Error al cargar transacciones');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: any = {};
    if (searchId.trim()) params.id = searchId.trim();
    if (fechaInicio) params.fecha_inicio = fechaInicio;
    if (fechaFin) params.fecha_fin = fechaFin;
    if (searchProveedor.trim()) params.proveedor = searchProveedor.trim();
    loadTabRecords(params);
  };

  const resetSearch = () => {
    setSearchId('');
    setFechaInicio('');
    setFechaFin('');
    setSearchProveedor('');
    loadTabRecords();
  };

  // Open modal for new record
  const handleOpenNewModal = () => {
    setFormHeader({
      numero_orden: '',
      numero_factura: '',
      numero_salida: '',
      proveedor: '',
      fecha: new Date().toISOString().split('T')[0],
      observaciones: '',
      orden_id: '',
      quien_recibio_id: ''
    });
    setFormItems([]);
    setCurrentItem({
      elemento_id: '',
      cantidad: 1,
      valor_unitario: 0,
      es_serializado: false,
      serials: []
    });
    setShowNewModal(true);
  };

  // Handle PO linkage in warehouse entry
  const handlePOLinkChange = (poId: string) => {
    setFormHeader({ ...formHeader, orden_id: poId });
    if (!poId) {
      setFormItems([]);
      return;
    }
    const linkedPO = pendingOrdersList.find(po => po.id.toString() === poId);
    if (linkedPO) {
      setFormHeader(prev => ({
        ...prev,
        proveedor: linkedPO.proveedor,
        orden_id: poId
      }));
      // Pre-fill detail rows from linked PO
      const itemsPrefilled = linkedPO.details.map((det: any) => {
        const matchingEl = elementosList.find(el => el.id === det.elemento_id);
        return {
          elemento_id: det.elemento_id.toString(),
          elemento_nombre: det.elemento_nombre,
          cantidad: det.cantidad,
          valor_unitario: Number(det.valor_unitario),
          es_serializado: matchingEl ? matchingEl.es_serializado : false,
          serials: [] as string[]
        };
      });
      setFormItems(itemsPrefilled);
      toast.success(`Datos cargados de la Orden de Compra #${linkedPO.numero_orden}`);
    }
  };

  const getProviderName = (docOrName: string) => {
    if (!docOrName) return 'N/A';
    const found = provClientesList.find(p => p.documento === docOrName || p.nombre === docOrName);
    return found ? found.nombre : docOrName;
  };

  // Handle adding current item to draft list
  const handleAddItemToDraft = () => {
    if (!currentItem.elemento_id) {
      return toast.warning('Debe seleccionar un elemento');
    }
    if (currentItem.cantidad <= 0) {
      return toast.warning('La cantidad debe ser mayor a cero');
    }
    if (currentItem.valor_unitario < 0) {
      return toast.warning('El valor unitario no puede ser negativo');
    }

    const matchingEl = elementosList.find(el => el.id.toString() === currentItem.elemento_id);
    if (!matchingEl) return;

    if (activeTab === 'salidas') {
      const stock = matchingEl.stock || 0;
      if (currentItem.cantidad > stock) {
        return toast.warning(`La cantidad a devolver (${currentItem.cantidad}) supera el saldo disponible en inventario (${stock}).`);
      }
    }

    // Validate if the element is already present in the draft items list
    const isAlreadyAdded = formItems.some(item => item.elemento_id.toString() === currentItem.elemento_id.toString());
    if (isAlreadyAdded) {
      return toast.warning('Este elemento ya está en la lista de artículos a registrar.');
    }

    const newItem = {
      ...currentItem,
      elemento_nombre: matchingEl.nombre,
      es_serializado: matchingEl.es_serializado
    };

    setFormItems([...formItems, newItem]);
    
    // Reset item input
    setCurrentItem({
      elemento_id: '',
      cantidad: 1,
      valor_unitario: 0,
      es_serializado: false,
      serials: []
    });
  };

  // Inline element creation
  const handleCreateNestedElement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nestedElementForm.nombre.trim()) return toast.warning('Nombre es obligatorio');
    if (!nestedElementForm.tipo_id) return toast.warning('Debe seleccionar un tipo');

    setIsLoading(true);
    try {
      const payload = {
        nombre: nestedElementForm.nombre.trim().toUpperCase(),
        tipo_id: nestedElementForm.tipo_id,
        estado_id: 'EST-01', // Active
        es_serializado: nestedElementForm.es_serializado,
        usuario_control: user.name
      };

      const res = await api.saveGhElemento(payload);
      if (res.success) {
        toast.success(`Código de Elemento "${payload.nombre}" creado exitosamente`);
        // Reload dropdown elements
        const dropdownRes = await api.getGhDropdownElementos();
        if (dropdownRes.success) {
          setElementosList(dropdownRes.data);
          // Auto-select newly created element
          setCurrentItem(prev => ({
            ...prev,
            elemento_id: res.data.id.toString(),
            es_serializado: res.data.es_serializado
          }));
        }
        setShowNestedElementModal(false);
        setNestedElementForm({ nombre: '', tipo_id: '', es_serializado: false });
      } else {
        toast.error(res.error || 'Error al guardar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  // Open serial lookup modal for returns
  const openSerialSelectorForReturn = async (elementoId: string, idx: number, qty: number, isEditInList: boolean = false) => {
    setIsLoading(true);
    try {
      const res = await api.getGhAvailableSerials(elementoId);
      if (res.success) {
        if (res.data.length === 0) {
          toast.warning('No hay seriales disponibles en bodega para este elemento.');
          return;
        }
        setAvailableSerials(res.data);
        setSelectingSerialsIdx(idx);
        // Pre-fill already selected serials if any
        if (isEditInList) {
          setSelectedSerialsToReturn(formItems[idx].serials || []);
        } else {
          setSelectedSerialsToReturn(currentItem.serials);
        }
      } else {
        toast.error(res.error || 'Error cargando seriales');
      }
    } catch {
      toast.error('Error de red al consultar seriales');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSelectedSerials = () => {
    const isEditInList = selectingSerialsIdx !== null && selectingSerialsIdx >= 0 && selectingSerialsIdx < formItems.length;
    const targetQty = isEditInList ? formItems[selectingSerialsIdx!].cantidad : Number(currentItem.cantidad);
    
    if (selectedSerialsToReturn.length !== Number(targetQty)) {
      return toast.warning(`Debe seleccionar exactamente ${targetQty} seriales.`);
    }

    if (isEditInList) {
      const updated = [...formItems];
      updated[selectingSerialsIdx!] = { ...updated[selectingSerialsIdx!], serials: selectedSerialsToReturn };
      setFormItems(updated);
    } else {
      setCurrentItem(prev => ({ ...prev, serials: selectedSerialsToReturn }));
    }
    setSelectingSerialsIdx(null);
    toast.success('Seriales vinculados con éxito');
  };

  // Save the complete transaction
  const handleSaveTransaction = async () => {
    if (formItems.length === 0) {
      return toast.warning('Debe agregar al menos un elemento al detalle');
    }

    // Validate that all serialized items have their serials completely registered
    if (activeTab === 'entradas' || activeTab === 'salidas') {
      const allSerials: string[] = [];
      for (const item of formItems) {
        if (item.es_serializado) {
          const registeredQty = item.serials ? item.serials.filter(Boolean).length : 0;
          if (registeredQty !== Number(item.cantidad)) {
            return toast.warning(`El elemento ${item.elemento_nombre} requiere exactamente ${item.cantidad} seriales. Registrados: ${registeredQty}`);
          }
          // Check duplicates inside the same element
          const uniqueSerials = new Set(item.serials);
          if (uniqueSerials.size !== item.serials.length) {
            return toast.warning(`El elemento ${item.elemento_nombre} tiene seriales repetidos.`);
          }
          // Check duplicates across elements in the same list
          for (const s of item.serials) {
            if (allSerials.includes(s)) {
              return toast.warning(`El serial "${s}" está duplicado en múltiples líneas.`);
            }
            allSerials.push(s);
          }
        }
      }
    }

    // If it's a warehouse entry and has an associated purchase order, show confirmation modal
    if (activeTab === 'entradas' && formHeader.orden_id) {
      setShowClosePOConfirm(true);
    } else {
      await executeSaveTransaction(false);
    }
  };

  const executeSaveTransaction = async (cerrar_orden: boolean) => {
    setShowClosePOConfirm(false);
    setIsLoading(true);
    try {
      let res;
      if (activeTab === 'ordenes') {
        if (!formHeader.numero_orden.trim()) return toast.warning('Número de Orden es obligatorio');
        if (!formHeader.proveedor.trim()) return toast.warning('Proveedor es obligatorio');
        
        const payload = {
          numero_orden: formHeader.numero_orden.trim().toUpperCase(),
          proveedor: formHeader.proveedor.trim().toUpperCase(),
          fecha: formHeader.fecha,
          usuario_control: user.name,
          items: formItems
        };
        res = await api.saveGhOrdenCompra(payload);
      } else if (activeTab === 'entradas') {
        if (!formHeader.numero_factura.trim()) return toast.warning('Número de Factura es obligatorio');
        if (!formHeader.quien_recibio_id) return toast.warning('Debe seleccionar quién recibió la entrega');
        if (formHeader.orden_id === '' && !formHeader.proveedor) {
          return toast.warning('Debe seleccionar el proveedor');
        }
        
        const payload = {
          numero_factura: formHeader.numero_factura.trim().toUpperCase(),
          orden_id: formHeader.orden_id || null,
          cerrar_orden: cerrar_orden,
          quien_recibio_id: formHeader.quien_recibio_id,
          proveedor: formHeader.proveedor || null,
          fecha: formHeader.fecha,
          observaciones: formHeader.observaciones,
          usuario_control: user.name,
          items: formItems
        };
        res = await api.saveGhEntradaBodega(payload);
      } else {
        if (!formHeader.numero_salida.trim()) return toast.warning('Número de Salida a Proveedor es obligatorio');
        if (!formHeader.proveedor.trim()) return toast.warning('Proveedor es obligatorio');

        const payload = {
          numero_salida: formHeader.numero_salida.trim().toUpperCase(),
          proveedor: formHeader.proveedor.trim().toUpperCase(),
          fecha: formHeader.fecha,
          observaciones: formHeader.observaciones,
          usuario_control: user.name,
          items: formItems
        };
        res = await api.saveGhSalidaProveedor(payload);
      }

      if (res.success) {
        toast.success('Transacción guardada exitosamente y stock actualizado.');
        setShowNewModal(false);
        loadTabRecords();
        loadDropdowns(); // refresh pending PO list
      } else {
        toast.error(res.error || 'Error al guardar la transacción');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Movimientos de Inventario</h1>
          <p className="text-slate-500 font-bold mt-1 uppercase text-xs tracking-widest">Órdenes de Compra, Entradas a Bodega y Devoluciones a Proveedor</p>
        </div>
        
        <button 
          onClick={handleOpenNewModal} 
          className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg text-xs uppercase"
        >
          <Plus size={16} /> Nuevo Registro
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full max-w-lg border border-slate-200/50">
        <button 
          onClick={() => { setActiveTab('ordenes'); setExpandedId(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'ordenes' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShoppingCart size={15} /> Órdenes de Compra
        </button>
        <button 
          onClick={() => { setActiveTab('entradas'); setExpandedId(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'entradas' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ArrowDownLeft size={15} className="text-emerald-500" /> Entradas a Bodega
        </button>
        <button 
          onClick={() => { setActiveTab('salidas'); setExpandedId(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'salidas' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ArrowUpRight size={15} className="text-rose-500" /> Salidas a Proveedor
        </button>
      </div>

      {/* Advanced Filter Panel */}
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Consultar por ID único</label>
          <input
            type="number"
            placeholder="Ej: 5"
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Proveedor</label>
          <SearchableSelect
            placeholder="Todos..."
            value={searchProveedor}
            onChange={val => setSearchProveedor(val)}
            options={provClientesList.map(p => ({
              value: p.documento, // Send document NIT/ID for strict database join match
              label: `${p.nombre} (${p.documento})`
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
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-black">
                <th className="p-4 pl-6 w-16">ID</th>
                <th className="p-4">Identificador</th>
                <th className="p-4">Proveedor</th>
                <th className="p-4">Fecha Operación</th>
                {activeTab === 'ordenes' && <th className="p-4">Estado OC</th>}
                {activeTab === 'entradas' && <th className="p-4">Origen OC</th>}
                {activeTab === 'entradas' && <th className="p-4">Recibido Por</th>}
                <th className="p-4 hidden md:table-cell">Registrado Por</th>
                <th className="p-4 text-right pr-6 w-32">Acción</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={activeTab === 'entradas' ? 9 : 8} className="p-10 text-center text-slate-400">
                    <div className="flex justify-center mb-2"><RefreshCw className="animate-spin" size={24} /></div>
                    Buscando registros en el servidor...
                  </td>
                </tr>
              ) : (activeTab === 'ordenes' ? ordenes : activeTab === 'entradas' ? entradas : salidas).length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'entradas' ? 9 : 8} className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider">
                    No se encontraron movimientos registrados para este mes.
                  </td>
                </tr>
              ) : (
                (activeTab === 'ordenes' ? ordenes : activeTab === 'entradas' ? entradas : salidas).map((item) => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-6 font-bold text-slate-900">#{item.id}</td>
                        <td className="p-4 font-black uppercase text-slate-800">
                          {activeTab === 'ordenes' ? `OC - ${item.numero_orden}` : activeTab === 'entradas' ? `FC - ${item.numero_factura}` : `DEV - ${item.numero_salida}`}
                        </td>
                        <td className="p-4 font-bold text-slate-700 uppercase">{item.proveedor_nombre || getProviderName(item.proveedor) || 'N/A'}</td>
                        <td className="p-4 font-medium text-slate-500">{new Date(item.fecha).toLocaleDateString()}</td>
                        
                        {/* Tab Specific Badges */}
                        {activeTab === 'ordenes' && (
                          <td className="p-4">
                            <span className={`inline-flex px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              item.estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {item.estado}
                            </span>
                          </td>
                        )}
                        {activeTab === 'entradas' && (
                          <td className="p-4 font-semibold text-slate-500">
                            {item.orden_numero ? `OC - ${item.orden_numero}` : 'Ingreso Directo'}
                          </td>
                        )}
                        {activeTab === 'entradas' && (
                          <td className="p-4 font-bold text-indigo-600 uppercase">
                            {item.quien_recibio_nombre || 'N/A'}
                          </td>
                        )}

                        <td className="p-4 hidden md:table-cell">
                          <p className="font-semibold text-slate-700">{item.usuario_control || 'Sistema'}</p>
                          <p className="text-[10px] text-slate-400">{new Date(item.fecha_control).toLocaleDateString()}</p>
                        </td>

                        <td className="p-4 pr-6 text-right">
                          <button 
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="flex items-center gap-1 ml-auto py-2 px-3 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors font-bold text-[10px] uppercase border border-slate-200"
                          >
                            <Eye size={12} /> {isExpanded ? 'Ocultar' : 'Ver Detalle'}
                          </button>
                        </td>
                      </tr>

                      {/* Nested Sub-Table Detail View */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={activeTab === 'entradas' ? 9 : 8} className="p-6 bg-slate-50 border-b border-slate-200">
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-inner p-5 space-y-4">
                              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Artículos del Documento</h4>
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    <th className="p-2.5">Código Elemento</th>
                                    <th className="p-2.5">¿Serializado?</th>
                                    <th className="p-2.5 text-center">Cantidad</th>
                                    <th className="p-2.5 text-right">Precio Unitario</th>
                                    <th className="p-2.5 text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.details?.map((det: any, idx: number) => (
                                    <tr key={idx} className="border-b border-slate-50 last:border-b-0 text-slate-700">
                                      <td className="p-2.5 font-bold uppercase text-slate-700">{det.elemento_nombre}</td>
                                      <td className="p-2.5">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black ${
                                          det.es_serializado ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                          {det.es_serializado ? 'SÍ' : 'NO'}
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-center font-bold">{det.cantidad}</td>
                                      <td className="p-2.5 text-right font-semibold">${Number(det.valor_unitario).toLocaleString()}</td>
                                      <td className="p-2.5 text-right font-black text-slate-900">${(Number(det.valor_unitario) * det.cantidad).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-slate-50/50 font-black text-slate-900">
                                    <td colSpan={4} className="p-3 text-right text-[10px] uppercase tracking-wider">Total Transacción:</td>
                                    <td className="p-3 text-right text-sm">
                                      ${item.details?.reduce((acc: number, det: any) => acc + (Number(det.valor_unitario) * det.cantidad), 0).toLocaleString()}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                              {item.observaciones && (
                                <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observaciones</p>
                                  <p className="text-xs font-semibold text-slate-600 mt-1 uppercase">{item.observaciones}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Creation Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-40 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[92vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  Registrar {activeTab === 'ordenes' ? 'Nueva Orden de Compra' : activeTab === 'entradas' ? 'Nueva Entrada a Bodega' : 'Nueva Salida a Proveedor'}
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase mt-0.5">Complete la información de cabecera y agregue artículos al detalle</p>
              </div>
              <button onClick={() => setShowNewModal(false)} className="text-2xl font-light hover:text-red-500 transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Content Wrapper */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {/* Header Inputs Grid */}
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-150 grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeTab === 'ordenes' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Número Orden de Compra</label>
                    <input
                      type="text"
                      placeholder="Ej: OC-1001"
                      value={formHeader.numero_orden}
                      onChange={e => setFormHeader({...formHeader, numero_orden: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold uppercase"
                    />
                  </div>
                )}

                {activeTab === 'entradas' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Número Factura / Remisión</label>
                      <input
                        type="text"
                        placeholder="Ej: FAC-98822"
                        value={formHeader.numero_factura}
                        onChange={e => setFormHeader({...formHeader, numero_factura: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Vincular Orden de Compra (Opcional)</label>
                      <SearchableSelect
                        placeholder="Ingreso sin orden de compra..."
                        value={formHeader.orden_id}
                        onChange={val => handlePOLinkChange(val)}
                        options={[
                          { value: '', label: 'Ingreso sin orden de compra...' },
                          ...pendingOrdersList.map(po => ({
                            value: po.id.toString(),
                            label: `#${po.id} - OC: ${po.numero_orden} (${po.proveedor_nombre || getProviderName(po.proveedor)})`
                          }))
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">¿Quién Recibió? *</label>
                      <SearchableSelect
                        placeholder="Seleccione personal que recibió..."
                        value={formHeader.quien_recibio_id}
                        onChange={val => setFormHeader({...formHeader, quien_recibio_id: val})}
                        options={personalList.map(pers => ({
                          value: pers.id.toString(),
                          label: `${pers.nombre} (${pers.cedula})`
                        }))}
                      />
                    </div>
                  </>
                )}

                {activeTab === 'salidas' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Número Salida a Proveedor</label>
                    <input
                      type="text"
                      placeholder="Ej: DEV-99"
                      value={formHeader.numero_salida}
                      onChange={e => setFormHeader({...formHeader, numero_salida: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold uppercase"
                    />
                  </div>
                )}

                {/* Shared inputs */}
                {formHeader.orden_id === '' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Proveedor</label>
                    <SearchableSelect
                      placeholder="Seleccione proveedor..."
                      value={formHeader.proveedor}
                      onChange={val => setFormHeader({...formHeader, proveedor: val})}
                      options={provClientesList.map(prov => ({
                        value: prov.documento,
                        label: `${prov.nombre} (${prov.documento})`
                      }))}
                    />
                  </div>
                )}
                
                {formHeader.orden_id !== '' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Proveedor (Vinculado OC)</label>
                    <input
                      type="text"
                      disabled
                      value={getProviderName(formHeader.proveedor)}
                      className="w-full px-4 py-2.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-xs font-bold uppercase"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha Operación</label>
                  <input
                    type="date"
                    value={formHeader.fecha}
                    onChange={e => setFormHeader({...formHeader, fecha: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Observaciones</label>
                  <textarea
                    placeholder="Ingrese observaciones de esta operación logística..."
                    value={formHeader.observaciones}
                    onChange={e => setFormHeader({...formHeader, observaciones: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold uppercase"
                    rows={2}
                  />
                </div>
              </div>

              {/* Item Adder Form (Only for direct additions, disabled if linking PO has populated items unless direct edit) */}
              {/* Item Adder Form */}
              <div className="bg-slate-100 p-6 rounded-[2rem] border border-slate-250 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Agregar Artículos al Detalle</h4>
                  {/* Nested creation launcher */}
                  {activeTab !== 'salidas' && (
                    <button 
                      onClick={() => setShowNestedElementModal(true)} 
                      type="button" 
                      className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-wider flex items-center gap-1"
                    >
                      <Plus size={12} /> + Crear Nuevo Código de Elemento
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className={activeTab === 'salidas' ? 'md:col-span-3' : 'md:col-span-2'}>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Código Elemento</label>
                    <SearchableSelect
                      placeholder="Seleccione elemento..."
                      value={currentItem.elemento_id}
                      onChange={val => {
                        const matchingEl = elementosList.find(el => el.id.toString() === val);
                        setCurrentItem({
                          ...currentItem,
                          elemento_id: val,
                          es_serializado: matchingEl ? matchingEl.es_serializado : false,
                          serials: [] // Reset serials
                        });
                      }}
                      options={(activeTab === 'salidas' 
                        ? elementosList.filter(el => (el.stock || 0) > 0)
                        : elementosList
                      ).map(el => ({
                        value: el.id.toString(),
                        label: `${el.nombre} ${el.es_serializado ? '(SERIALIZADO)' : ''} (Saldo: ${el.stock || 0})`
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Cantidad</label>
                    <input
                      type="number"
                      min={1}
                      value={currentItem.cantidad}
                      onChange={e => {
                        const qty = Math.max(1, Number(e.target.value));
                        setCurrentItem({
                          ...currentItem,
                          cantidad: qty,
                          serials: currentItem.serials.slice(0, qty) // Trim excess serials
                        });
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-bold"
                    />
                  </div>

                  {activeTab !== 'salidas' && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Valor Unitario ($)</label>
                      <input
                        type="number"
                        min={0}
                        value={currentItem.valor_unitario}
                        onChange={e => setCurrentItem({...currentItem, valor_unitario: Math.max(0, Number(e.target.value))})}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* Serial input logic if element is serialized */}
                {currentItem.elemento_id !== '' && currentItem.es_serializado && (
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1">
                      <Barcode size={14} /> Elemento Serializado Detectado
                    </p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">
                      Los seriales se registrarán directamente en la tabla de abajo una vez añadido al detalle usando el botón "Registrar Seriales".
                    </p>
                  </div>
                )}

                <div className="pt-2 text-right">
                  <button 
                    type="button" 
                    onClick={handleAddItemToDraft}
                    className="py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl transition-all text-xs uppercase flex items-center justify-center gap-1.5 ml-auto"
                  >
                    <Plus size={14} /> Añadir al Detalle
                  </button>
                </div>
              </div>

              {/* Items List Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Lista de Artículos a Registrar</h4>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="p-3 pl-6">Código Elemento</th>
                      <th className="p-3">¿Serializado?</th>
                      <th className="p-3 text-center">Cantidad</th>
                      {activeTab !== 'salidas' && <th className="p-3 text-right">Precio Unitario</th>}
                      {activeTab !== 'salidas' && <th className="p-3 text-right">Subtotal</th>}
                      <th className="p-3 text-right pr-6 w-20">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.length === 0 ? (
                      <tr>
                        <td colSpan={activeTab === 'salidas' ? 4 : 6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-wider">
                          Ningún elemento agregado al detalle todavía.
                        </td>
                      </tr>
                    ) : (
                      formItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-b-0 text-xs hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 pl-6">
                            <p className="font-black text-slate-900 uppercase">{item.elemento_nombre}</p>
                            
                            {/* Dynamic serial numbers entry button for warehouse entries */}
                            {item.es_serializado && activeTab === 'entradas' && (
                              <div className="mt-2 space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSerialModalIdx(idx);
                                    setTempSerialValue('');
                                  }}
                                  className={`py-2 px-4 font-black rounded-xl transition-all text-xs uppercase flex items-center justify-center gap-1.5 shadow-sm border ${
                                    (item.serials?.length || 0) === item.cantidad
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-255 hover:bg-emerald-100'
                                      : 'bg-amber-50 text-amber-700 border-amber-255 hover:bg-amber-100'
                                  }`}
                                >
                                  <Barcode size={14} /> Registrar Seriales ({item.serials?.length || 0} / {item.cantidad})
                                </button>
                                {item.serials && item.serials.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1 max-w-md">
                                    {item.serials.map((s: string, sIdx: number) => (
                                      <span key={sIdx} className="px-2 py-0.5 bg-slate-900 text-white rounded text-[8px] font-bold uppercase">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Dynamic serial selection button for exits/returns */}
                            {item.es_serializado && activeTab === 'salidas' && (
                              <div className="mt-2 space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => openSerialSelectorForReturn(item.elemento_id, idx, item.cantidad, true)}
                                  className={`py-2 px-4 font-black rounded-xl transition-all text-xs uppercase flex items-center justify-center gap-1.5 shadow-sm border ${
                                    (item.serials?.length || 0) === item.cantidad
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-255 hover:bg-emerald-100'
                                      : 'bg-amber-50 text-amber-700 border-amber-255 hover:bg-amber-100'
                                  }`}
                                >
                                  <Barcode size={14} /> Seleccionar Seriales ({item.serials?.length || 0} / {item.cantidad})
                                </button>
                                {item.serials && item.serials.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1 max-w-md">
                                    {item.serials.map((s: string, sIdx: number) => (
                                      <span key={sIdx} className="px-2 py-0.5 bg-slate-900 text-white rounded text-[8px] font-bold uppercase">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black ${
                              item.es_serializado ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {item.es_serializado ? 'SÍ' : 'NO'}
                            </span>
                          </td>
                          
                          {/* INLINE QUANTITY EDIT */}
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min={1}
                              value={item.cantidad}
                              onChange={e => {
                                const qty = Math.max(1, Number(e.target.value));
                                if (activeTab === 'salidas') {
                                  const matchingEl = elementosList.find(el => el.id.toString() === item.elemento_id.toString());
                                  if (matchingEl && qty > (matchingEl.stock || 0)) {
                                    return toast.warning(`La cantidad a devolver (${qty}) supera el saldo disponible en inventario (${matchingEl.stock || 0}).`);
                                  }
                                }
                                const updated = [...formItems];
                                updated[idx] = { 
                                  ...item, 
                                  cantidad: qty,
                                  serials: item.es_serializado ? (item.serials || []).slice(0, qty) : []
                                };
                                setFormItems(updated);
                              }}
                              className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-center font-black text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                            />
                          </td>

                          {/* INLINE PRICE EDIT */}
                          {activeTab !== 'salidas' && (
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                min={0}
                                value={item.valor_unitario}
                                onChange={e => {
                                  const price = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                                  const updated = [...formItems];
                                  updated[idx] = { ...item, valor_unitario: price };
                                  setFormItems(updated);
                                }}
                                className="w-28 px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-right font-black text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                              />
                            </td>
                          )}

                          {activeTab !== 'salidas' && (
                            <td className="p-3 text-right font-black text-slate-900">${((item.valor_unitario || 0) * item.cantidad).toLocaleString()}</td>
                          )}
                          
                          <td className="p-3 text-right pr-6">
                            <button 
                              onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))} 
                              type="button" 
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {activeTab !== 'salidas' && (
                    <tfoot>
                      <tr className="bg-slate-50 font-black text-slate-900 border-t border-slate-200">
                        <td colSpan={4} className="p-4 text-right text-[10px] uppercase tracking-widest">Total Transacción:</td>
                        <td colSpan={2} className="p-4 text-right pr-6 text-sm">
                          ${formItems.reduce((acc, item) => acc + ((item.valor_unitario || 0) * item.cantidad), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-between shrink-0">
              <button 
                type="button" 
                onClick={() => setShowNewModal(false)} 
                className="px-6 py-3.5 bg-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-300 transition-all text-xs uppercase"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                disabled={isLoading || formItems.length === 0}
                onClick={handleSaveTransaction} 
                className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                Confirmar y Registrar Movimiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Mini-Modal to create a New Element Code Inline */}
      {showNestedElementModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest">Crear Código de Elemento</h4>
              <button onClick={() => setShowNestedElementModal(false)} className="text-white hover:text-red-400">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateNestedElement} className="p-6 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Nombre Elemento</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: COMPUTADOR DE ESCRITORIO HP"
                  value={nestedElementForm.nombre}
                  onChange={e => setNestedElementForm({...nestedElementForm, nombre: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900 text-xs font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Elemento</label>
                <SearchableSelect
                  placeholder="Seleccione tipo..."
                  value={nestedElementForm.tipo_id}
                  onChange={val => setNestedElementForm({...nestedElementForm, tipo_id: val})}
                  options={tiposElementosList.filter(t => t.estado_id === 'EST-01').map(t => ({
                    value: t.id.toString(),
                    label: t.nombre
                  }))}
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer" onClick={() => setNestedElementForm({...nestedElementForm, es_serializado: !nestedElementForm.es_serializado})}>
                <input
                  type="checkbox"
                  checked={nestedElementForm.es_serializado}
                  onChange={e => setNestedElementForm({...nestedElementForm, es_serializado: e.target.checked})}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 text-emerald-500 border-slate-350 focus:ring-emerald-500 rounded cursor-pointer"
                />
                <div>
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-wide">Es Serializado</p>
                  <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Cada unidad posee un serial único</p>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button type="button" onClick={() => setShowNestedElementModal(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs uppercase">
                  Cancelar
                </button>
                <button type="submit" disabled={isLoading} className="flex-1 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 text-xs uppercase flex items-center justify-center gap-1 shadow-lg">
                  {isLoading ? <RefreshCw className="animate-spin" size={12} /> : <Save size={12} />}
                  Crear Código
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Returning Serials Checkbox List Modal for Returns */}
      {selectingSerialsIdx !== null && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between shrink-0">
              <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                <Barcode size={15} /> Seleccionar Seriales a Devolver
              </h4>
              <button onClick={() => setSelectingSerialsIdx(null)} className="text-white hover:text-slate-100">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 text-slate-600 text-[10px] font-bold uppercase">
              Seleccione exactamente {currentItem.cantidad} seriales. ({selectedSerialsToReturn.length} seleccionados)
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
              {availableSerials.map((ser) => {
                const isChecked = selectedSerialsToReturn.includes(ser.serial);
                return (
                  <label 
                    key={ser.id} 
                    className={`flex items-center justify-between p-3.5 border rounded-xl cursor-pointer hover:bg-slate-50 transition-all ${
                      isChecked ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isChecked && selectedSerialsToReturn.length >= Number(currentItem.cantidad)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (selectedSerialsToReturn.length < Number(currentItem.cantidad)) {
                              setSelectedSerialsToReturn([...selectedSerialsToReturn, ser.serial]);
                            }
                          } else {
                            setSelectedSerialsToReturn(selectedSerialsToReturn.filter(s => s !== ser.serial));
                          }
                        }}
                        className="w-4 h-4 text-amber-500 border-slate-350 focus:ring-amber-500 rounded disabled:opacity-40"
                      />
                      <span className="text-xs font-black text-slate-800 uppercase">{ser.serial}</span>
                    </div>
                    <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">
                      Disponible
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-2 shrink-0">
              <button 
                type="button" 
                onClick={() => setSelectingSerialsIdx(null)} 
                className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs uppercase"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleConfirmSelectedSerials} 
                disabled={selectedSerialsToReturn.length !== Number(currentItem.cantidad)}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={12} /> Confirmar Selección
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Serial Entry Modal for Warehouse Entry Items */}
      {serialModalIdx !== null && formItems[serialModalIdx] && (() => {
        const item = formItems[serialModalIdx];
        const currentSerials = item.serials || [];
        const requiredQty = Number(item.cantidad);
        
        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                    <Barcode size={15} /> Registrar Seriales
                  </h4>
                  <p className="text-[10px] text-slate-300 font-bold uppercase mt-0.5">{item.elemento_nombre}</p>
                </div>
                <button onClick={() => setSerialModalIdx(null)} className="text-white hover:text-red-400">
                  <X size={18} />
                </button>
              </div>

              {/* Progress and instructions */}
              <div className="p-5 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-600">
                  <span>Seriales Registrados:</span>
                  <span className={(currentSerials.length === requiredQty) ? 'text-emerald-600' : 'text-amber-600'}>
                    {currentSerials.length} de {requiredQty}
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-slate-900 h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (currentSerials.length / requiredQty) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Add Input form inside Modal */}
              <div className="p-6 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex gap-2">
                  <input
                    ref={serialInputRef}
                    type="text"
                    placeholder={currentSerials.length >= requiredQty ? "Cupo completo. Elimine algún serial si desea cambiarlo." : "Escriba o escanee un serial y presione ENTER..."}
                    disabled={currentSerials.length >= requiredQty}
                    value={tempSerialValue}
                    onChange={e => setTempSerialValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = tempSerialValue.trim().toUpperCase();
                        if (!trimmed) return;
                        if (currentSerials.length >= requiredQty) {
                          toast.warning(`Ya ha completado el cupo máximo de ${requiredQty} seriales.`);
                          return;
                        }
                        if (currentSerials.includes(trimmed)) {
                          toast.warning('Este serial ya fue ingresado.');
                          return;
                        }
                        const updated = [...formItems];
                        updated[serialModalIdx] = {
                          ...item,
                          serials: [...currentSerials, trimmed]
                        };
                        setFormItems(updated);
                        setTempSerialValue('');
                      }
                    }}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-bold uppercase disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={currentSerials.length >= requiredQty}
                    onClick={() => {
                      const trimmed = tempSerialValue.trim().toUpperCase();
                      if (!trimmed) return;
                      if (currentSerials.length >= requiredQty) {
                        toast.warning(`Ya ha completado el cupo máximo de ${requiredQty} seriales.`);
                        return;
                      }
                      if (currentSerials.includes(trimmed)) {
                        toast.warning('Este serial ya fue ingresado.');
                        return;
                      }
                      const updated = [...formItems];
                      updated[serialModalIdx] = {
                        ...item,
                        serials: [...currentSerials, trimmed]
                      };
                      setFormItems(updated);
                      setTempSerialValue('');
                    }}
                    className="py-2.5 px-5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-xs uppercase font-bold disabled:opacity-40"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Scrollable list of added serials */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-2 custom-scrollbar">
                {currentSerials.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                    Ningún serial ingresado aún. ¡Escanee o digite arriba!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentSerials.map((serial: string, sIdx: number) => (
                      <div 
                        key={sIdx}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">#{sIdx + 1}</span>
                          <span className="text-xs font-black text-slate-800 uppercase tracking-wide">{serial}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...formItems];
                            updated[serialModalIdx] = {
                              ...item,
                              serials: currentSerials.filter((_, i) => i !== sIdx)
                            };
                            setFormItems(updated);
                          }}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-2 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setSerialModalIdx(null)}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase shadow-md flex items-center justify-center gap-1.5"
                >
                  <Check size={14} /> Listo / Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CONFIRMATION MODAL TO CLOSE PURCHASE ORDER */}
      {showClosePOConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden transform scale-100 transition-all flex flex-col">
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-600 border border-amber-100 shadow-sm animate-bounce">
                <HelpCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Cerrar Orden de Compra</h3>
                <p className="text-slate-500 font-bold text-xs uppercase tracking-wide leading-relaxed">
                  ¿Desea dar por <span className="text-amber-600 font-black">cerrada y completada</span> la Orden de Compra asociada al confirmar este movimiento?
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detalle del Registro</p>
                <p className="text-[11px] font-extrabold text-slate-600 uppercase mt-1">Factura: {formHeader.numero_factura.trim().toUpperCase()}</p>
                <p className="text-[11px] font-extrabold text-slate-600 uppercase mt-0.5">Orden de Compra: #{pendingOrdersList.find(po => po.id.toString() === formHeader.orden_id.toString())?.numero_orden || formHeader.orden_id}</p>
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => executeSaveTransaction(true)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-md hover:shadow-emerald-200 transition-all flex items-center justify-center gap-1.5"
              >
                <CheckCircle size={16} /> SÍ, CERRAR COMPLETAMENTE
              </button>
              <button
                type="button"
                onClick={() => executeSaveTransaction(false)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-md hover:shadow-slate-300 transition-all flex items-center justify-center gap-1.5"
              >
                <XCircle size={16} /> NO, MANTENER PENDIENTE
              </button>
              <button
                type="button"
                onClick={() => setShowClosePOConfirm(false)}
                className="w-full py-2 bg-transparent text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest mt-1 transition-colors"
              >
                Regresar y Editar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EntregasSalidas;
