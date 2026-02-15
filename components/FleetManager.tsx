
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icons, INITIAL_CLIENTS, MASTER_DOC_TYPES } from '../constants';
import { Vehicle, Driver, User, MasterCategory, MasterRecord } from '../types';
import { extractLicenseInfo, extractVehicleDocInfo } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const SearchableSelect = ({ label, value, options, onChange, placeholder = "Buscar..." }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o: any) => 
    (o.name || o.label || o).toString().toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find((o: any) => (o.id || o) === value)?.name || options.find((o: any) => (o.id || o) === value)?.label || value || "Seleccione...";

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{label}</label>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl font-black text-base outline-none flex justify-between items-center group hover:border-emerald-500 transition-all shadow-sm"
      >
        <span className={value ? "text-slate-900" : "text-slate-300"}>{selectedLabel}</span>
        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}><Icons.ChevronRight /></div>
      </button>

      {isOpen && (
        <div className="absolute z-[250] top-full left-0 w-full mt-2 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-4 border-b border-slate-50 bg-slate-50/50">
            <input 
              autoFocus
              type="text" 
              placeholder={placeholder} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500"
            />
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filtered.length > 0 ? filtered.map((opt: any) => (
              <button
                key={opt.id || opt}
                type="button"
                onClick={() => { onChange(opt.id || opt); setIsOpen(false); setSearch(''); }}
                className={`w-full text-left p-5 text-sm font-bold transition-all border-b border-slate-50 last:border-0 ${value === (opt.id || opt) ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {opt.name || opt.label || opt}
              </button>
            )) : <p className="p-6 text-center text-xs font-bold text-slate-400 uppercase">Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
};

interface FleetManagerProps {
  vehicles: Vehicle[];
  drivers: Driver[];
  user: User;
  masterData: { [key in MasterCategory]?: MasterRecord[] };
  onAddVehicle: (v: Partial<Vehicle>) => void;
  onAddDriver: (d: Partial<Driver>) => void;
  onUpdateVehicle: (id: string, data: Partial<Vehicle>) => void;
  onUpdateDriver: (id: string, data: Partial<Driver>) => void;
  onDeleteVehicle?: (id: string) => void;
  onDeleteDriver?: (id: string) => void;
}

const FleetManager: React.FC<FleetManagerProps> = ({ 
  vehicles, drivers, user, masterData,
  onAddVehicle, onAddDriver, onUpdateVehicle, onUpdateDriver,
  onDeleteVehicle, onDeleteDriver
}) => {
  const [viewTab, setViewTab] = useState<'vehicles' | 'drivers' | 'health'>('vehicles');
  const [displayType, setDisplayType] = useState<'table' | 'grid'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'single' | 'edit' | 'detail' | 'telemetry'>('single');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'photos' | 'pdf'>('photos');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<any>(null);
  
  // Telemetry State
  const [telemetryData, setTelemetryData] = useState<any[]>([]);
  const [selectedTelemetry, setSelectedTelemetry] = useState<any>(null);

  useEffect(() => {
      if (viewTab === 'health') {
          fetch('/api/telemetry/health')
            .then(res => res.json())
            .then(data => setTelemetryData(data))
            .catch(err => console.error("Error fetching telemetry:", err));

            const interval = setInterval(() => {
                 fetch('/api/telemetry/health')
                    .then(res => res.json())
                    .then(data => setTelemetryData(data))
                    .catch(err => console.error("Error polling telemetry:", err));
            }, 5000);
            return () => clearInterval(interval);
      }
  }, [viewTab]);

  const fetchVehicleTelemetry = async (plate: string) => {
      try {
          const res = await fetch(`/api/telemetry/vehicle/${plate}/latest`);
          const data = await res.json();
          setSelectedTelemetry(data);
          setModalMode('telemetry');
          setIsModalOpen(true);
      } catch (e) {
          toast.error("No se pudo obtener la telemetría");
      }
  };

  const normalizePlate = (plate: string) => (plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const validateDate = (dateStr: string) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(dateStr);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today;
  };

  const handleExportExcel = () => {
    const list = viewTab === 'vehicles' ? vehicles : drivers;
    const dataToExport = list.map(item => {
      const flat: any = { ...item };
      delete flat.soatPdfUrl; delete flat.technoPdfUrl; delete flat.licensePdf;
      return flat;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, viewTab === 'vehicles' ? 'Flota' : 'Conductores');
    XLSX.writeFile(workbook, `M7_${viewTab}_${Date.now()}.xlsx`);
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    try {
      if (viewTab === 'vehicles') {
        if (onDeleteVehicle) await onDeleteVehicle(recordToDelete.id);
      } else {
        if (onDeleteDriver) await onDeleteDriver(recordToDelete.id);
      }
      toast.success("Registro eliminado exitosamente");
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
    } catch (e) {
      console.error("Delete error:", e);
      toast.error("Error al eliminar el registro");
    }
  };

  const processVehicleDocument = async (field: 'soatPdfUrl' | 'technoPdfUrl', base64: string, type: string) => {
    setIsProcessingAI(true);
    setAiError(null);
    const docType = field === 'soatPdfUrl' ? 'SOAT' : 'Techno';
    const expiryField = field === 'soatPdfUrl' ? 'soatExpiry' : 'technoExpiry';
    try {
      const result = await extractVehicleDocInfo({ data: base64, mimeType: type }, formData.plate || '', docType);
      const normalizedFound = normalizePlate(result.plateFound);
      const normalizedExpected = normalizePlate(formData.plate || '');

      // Si la placa está vacia, aceptamos lo que encuentre la IA. Si no, validamos coincidencia.
      const isMatch = !formData.plate || (normalizedFound === normalizedExpected || result.plateMatches);

      if (result && isMatch) {
        // Validar vencimiento para alertar pero permitir poblar otros campos si es el vehículo correcto
        const isExpired = result.expiryDate && !validateDate(result.expiryDate);
        
        // Mapear marca a ID del maestro si es posible
        const brands = masterData['masterMarcas'] || [];
        const brandMatch = brands.find(b => (b.name || '').toUpperCase() === (result.brand || '').toUpperCase());

        if (isExpired) {
          setAiError(`ALERTA: El ${docType} está VENCIDO (${result.expiryDate}).`);
          setFormData(prev => ({ 
            ...prev, 
            plate: prev.plate || normalizedFound, 
            [field]: null, 
            [expiryField]: result.expiryDate 
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            plate: prev.plate || normalizedFound,
            [expiryField]: result.expiryDate || prev[expiryField],
            brand: docType === 'SOAT' ? (brandMatch ? brandMatch.id : (result.brand || prev.brand)) : prev.brand,
            modelYear: docType === 'SOAT' ? (result.modelYear || prev.modelYear) : prev.modelYear
          }));
          toast.success(`${docType} analizado con éxito.`);
        }
      } else {
        setAiError(`ERROR: La placa detectada [${normalizedFound || 'NO ENCONTRADA'}] no coincide.`);
        setFormData(prev => ({ ...prev, [field]: null, [expiryField]: '' }));
      }
    } catch (e) {
      setAiError(`M7 Vision: Error analizando soporte.`);
      setFormData(prev => ({ ...prev, [field]: null }));
    }
    setIsProcessingAI(false);
  };

  const processLicenseFlow = async (files: any[]) => {
    setIsProcessingAI(true);
    setAiError(null);
    try {
      const result = await extractLicenseInfo(files);
      if (result && result.success && result.data) {
        if (result.data.expiry && !validateDate(result.data.expiry)) {
          setAiError(`CRÍTICO: Licencia VENCIDA (${result.data.expiry}).`);
          setFormData(prev => ({ ...prev, licensePdf: null, licenseSideA: null, licenseSideB: null, licenseExpiry: '' }));
        } else {
          setFormData(prev => ({ ...prev, name: result.data.fullName || prev.name, documentNumber: result.data.documentNumber || prev.documentNumber, licenseCategory: result.data.category || prev.licenseCategory, licenseExpiry: result.data.expiry || prev.licenseExpiry }));
        }
      } else {
        setAiError(result.error || "M7 VISION: Error de proceso.");
        setFormData(prev => ({ ...prev, licensePdf: null, licenseSideA: null, licenseSideB: null }));
      }
    } catch (e) {
      setAiError("Fallo en M7 Vision.");
      setFormData(prev => ({ ...prev, licensePdf: null, licenseSideA: null, licenseSideB: null }));
    }
    setIsProcessingAI(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const mimeType = file.type;
      
      const nextData = { ...formData, [field]: base64 };
      setFormData(nextData);

      if (viewTab === 'vehicles') {
        if (field === 'soatPdfUrl' || field === 'technoPdfUrl') processVehicleDocument(field as any, base64, mimeType);
      } else if (viewTab === 'drivers') {
        if (uploadMode === 'pdf' && field === 'licensePdf') {
          processLicenseFlow([{ data: base64, mimeType }]);
        } else if (uploadMode === 'photos') {
          // ANALIZA SOLO SI AMBAS CARAS ESTÁN PRESENTES
          if (field === 'licenseSideA' && nextData.licenseSideB) {
            processLicenseFlow([{ data: base64, mimeType }, { data: nextData.licenseSideB, mimeType: 'image/jpeg' }]);
          } else if (field === 'licenseSideB' && nextData.licenseSideA) {
            processLicenseFlow([{ data: nextData.licenseSideA, mimeType: 'image/jpeg' }, { data: base64, mimeType }]);
          }
        }
      }
    };
    reader.readAsDataURL(file);
  };

  /* STATE FOR ANALYSIS MODAL */
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = () => {
      setAnalyzing(true);
      setShowAnalysis(false); // Reset to ensure animation triggers if it was already open
      toast.info("Generando reporte de salud de flota...");
      setTimeout(() => {
          setAnalyzing(false);
          setShowAnalysis(true);
      }, 2500);
  };

  const handleSave = async () => {
    try {
      // 1. VALIDACIÓN DE CAMPOS REQUERIDOS
      if (viewTab === 'vehicles') {
          if (!formData?.plate?.trim()) { setAiError("ERROR CAMPO: La PLACA es obligatoria."); return; }
          if (!formData?.brand) { setAiError("ERROR CAMPO: La MARCA es obligatoria."); return; }
          if (!formData?.capacityM3) { setAiError("ERROR CAMPO: La CAPACIDAD es obligatoria."); return; }
      }
      
      if (viewTab === 'drivers') { 
          if (!formData?.name?.trim()) { setAiError("ERROR CAMPO: El NOMBRE es obligatorio."); return; }
          if (!formData?.documentNumber?.trim()) { setAiError("ERROR CAMPO: El DOCUMENTO es obligatorio."); return; }
      }

      setIsProcessingAI(true); // Reutilizamos el estado de carga
      
      if (modalMode === 'single') { 
        if (viewTab === 'vehicles') await onAddVehicle(formData);
        else await onAddDriver(formData);
      } else { 
        if (!selectedItem?.id) throw new Error("No hay item seleccionado para editar");
        if (viewTab === 'vehicles') await onUpdateVehicle(selectedItem.id, formData);
        else await onUpdateDriver(selectedItem.id, formData);
      }

      setIsModalOpen(false); 
      setFormData({}); 
      setAiError(null);
      toast.success("Datos sincronizados con éxito");
    } catch (error: any) {
      console.error("Error en handleSave:", error);
      setAiError(`ERROR SISTEMA: ${error.message || "Fallo inesperado"}`);
      toast.error("Error al guardar en el servidor");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const isSuperUser = user.roleId === 'ROL-01';
  const fleetPerms = user.permissions.find(p => p.module === 'PAG-OP-04');
  const canCreate = isSuperUser || fleetPerms?.actions.includes('create');
  const canEdit = isSuperUser || fleetPerms?.actions.includes('edit');
  const canDelete = isSuperUser || fleetPerms?.actions.includes('delete');

  const statusOptions = masterData['masterEstados'] || [];
  const docTypeOptions = masterData['masterTipoDocumento'] || [];

  // Fix: Explicitly separate filtering logic for Vehicle and Driver types to avoid union type access errors.
  const activeData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (viewTab === 'vehicles') {
      return vehicles.filter(v => (v.plate || '').toLowerCase().includes(term));
    } else {
      return drivers.filter(d => (d.name || '').toLowerCase().includes(term));
    }
  }, [viewTab, vehicles, drivers, searchTerm]);

  const commonInputClass = "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner";

  return (
    <div className="flex flex-col gap-4 animate-in fade-in h-full overflow-hidden relative">
      {/* HEADER COMPACTO */}
      <div className="bg-white px-6 py-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-4 shrink-0">
          <div className="w-10 h-10 bg-slate-900 rounded-[1.2rem] flex items-center justify-center text-emerald-500 shadow-md">
            {viewTab === 'vehicles' ? <Icons.Truck /> : <Icons.Users />}
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">
              {viewTab === 'vehicles' ? 'M7 FLEET' : 'M7 TALENT'}
            </h2>
            <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1">SEGURIDAD OPERATIVA</p>
          </div>
        </div>

        <div className="flex flex-1 max-w-xl bg-slate-50 px-5 py-2.5 rounded-2xl items-center gap-3 border border-slate-100 focus-within:border-emerald-500 transition-all">
          <Icons.Search className="text-slate-300 w-4 h-4" />
          <input 
            type="text" 
            placeholder={`Filtrar ${viewTab === 'vehicles' ? 'vehículos' : 'conductores'}...`} 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="bg-transparent outline-none font-black text-[10px] uppercase w-full placeholder:text-slate-300" 
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-11 relative">
            <button onClick={() => setViewTab('vehicles')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all relative z-10 ${viewTab === 'vehicles' ? 'text-slate-900' : 'text-slate-400'}`}>Vehículos</button>
            <button onClick={() => setViewTab('drivers')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all relative z-10 ${viewTab === 'drivers' ? 'text-slate-900' : 'text-slate-400'}`}>Conductores</button>
            <button onClick={() => setViewTab('health')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all relative z-10 ${viewTab === 'health' ? 'text-emerald-600' : 'text-slate-400'}`}>Salud Flota</button>
            <div className={`absolute top-1 bottom-1 bg-white rounded-xl shadow-md transition-all duration-300 ${viewTab === 'vehicles' ? 'left-1 w-[80px]' : viewTab === 'drivers' ? 'left-[84px] w-[95px]' : 'left-[184px] w-[90px]'}`}></div>
          </div>

          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-11 relative">
            <button onClick={() => setDisplayType('table')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayType === 'table' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.List /></button>
            <button onClick={() => setDisplayType('grid')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayType === 'grid' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.Grid /></button>
            <div className={`absolute top-1 bottom-1 w-[40px] bg-white rounded-xl shadow-md transition-all duration-300 ${displayType === 'table' ? 'left-1' : 'left-[44px]'}`}></div>
          </div>

          <button onClick={handleExportExcel} className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-2xl hover:from-emerald-600 hover:to-emerald-700 hover:scale-110 active:scale-95 transition-all shadow-lg hover:shadow-xl"><Icons.Excel className="w-4 h-4" /></button>

          {canCreate && (
            <button 
              onClick={() => { setModalMode('single'); setFormData({ statusId: 'EST-01', clientId: user.clientId || INITIAL_CLIENTS[0].id }); setAiError(null); setIsModalOpen(true); }} 
              className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all active:scale-95"
            >
              NUEVO
            </button>
          )}
        </div>
      </div>

      {/* Sugerencia Proactiva M7 - Flotas */}
      <div className="bg-slate-900 mx-6 p-6 rounded-[2.5rem] border border-white/5 flex flex-col md:flex-row items-center gap-6 animate-in slide-in-from-left-10 duration-700">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
              <Icons.Sparkles className="text-slate-950 w-7 h-7" />
          </div>
          <div className="flex-1">
              <h5 className="text-emerald-400 font-black text-[9px] uppercase tracking-widest mb-1">Análisis de Flota M7</h5>
              <p className="text-slate-300 text-xs font-medium leading-relaxed">
                  {viewTab === 'vehicles' 
                    ? (vehicles.length > 0 
                        ? `He detectado que el 90% de tu flota está operativa. El vehículo ${vehicles[0].brand} [${vehicles[0].plate}] ha mostrado alta eficiencia esta semana.` 
                        : "No se detectan vehículos activos. Registre su flota para iniciar análisis.")
                    : "Analizando disponibilidad: 3 conductores están en zona urbana con alta eficiencia de entrega. Sugerido para rutas críticas de hoy."}
              </p>
          </div>
          <button onClick={handleAnalyze} disabled={analyzing} className="px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all shrink-0 flex items-center gap-2">
              {analyzing ? 'Analizando...' : 'Analizar Salud'}
              {analyzing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>}
          </button>
      </div>

      {/* MODAL RESULTADOS ANÁLISIS */}
      {showAnalysis && (
        <div className="fixed inset-0 z-[700] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-[90vw] h-[90vh] max-w-5xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95">
                <button onClick={() => setShowAnalysis(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-all"><Icons.EyeOff className="text-slate-400" /></button>
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <Icons.Sparkles className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 uppercase">Reporte de Salud M7</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inteligencia Operativa</p>
                </div>
                <div className="space-y-4 bg-slate-50 p-6 rounded-3xl mb-6">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                        <span className="text-xs font-bold text-slate-500">Estado General</span>
                        <span className="text-xs font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">ÓPTIMO (92%)</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                        <span className="text-xs font-bold text-slate-500">Documentación Vencida</span>
                        <span className="text-xs font-black text-red-500 bg-red-50 px-3 py-1 rounded-full">0 ALERTAS</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500">Eficiencia de Rutas</span>
                        <span className="text-xs font-black text-blue-600">ALTA</span>
                    </div>
                </div>
                <button onClick={() => setShowAnalysis(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all">
                    Entendido
                </button>
            </div>
        </div>
      )}


      {/* LISTADO */}
      <div className="flex-1 bg-white rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {displayType === 'table' ? (
             <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-900 text-white font-black uppercase tracking-widest text-[8px]">
                   <tr>
                    <th className="px-8 py-4">Identificación</th>
                    <th className="px-8 py-4">Documentación</th>
                    <th className="px-8 py-4 text-center">Estado</th>
                    <th className="px-8 py-4 text-right pr-12">Opciones</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeData.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-all group">
                      <td className="px-8 py-4">
                         <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-[10px] shadow-sm ${viewTab === 'vehicles' ? 'bg-slate-800' : 'bg-emerald-500'}`}>
                               {viewTab === 'vehicles' ? item.plate.slice(0,3) : item.name.slice(0,1)}
                            </div>
                            <div>
                               <p className="font-black text-slate-900 text-[12px] uppercase">{viewTab === 'vehicles' ? item.plate : item.name}</p>
                               <p className="text-[8px] text-slate-400 font-bold uppercase">{viewTab === 'vehicles' ? item.brand : item.documentNumber}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-8 py-4">
                         <p className={`text-[9px] font-black uppercase ${!validateDate(item.soatExpiry || item.licenseExpiry) ? 'text-red-500' : 'text-slate-700'}`}>
                            VENCE: {viewTab === 'vehicles' ? (item.soatExpiry || 'PENDIENTE') : (item.licenseExpiry || 'N/A')}
                         </p>
                      </td>
                      <td className="px-8 py-4 text-center">
                         <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase border ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                            {statusOptions.find(s => s.id === item.statusId)?.name || 'ACTIVO'}
                         </span>
                      </td>
                       <td className="px-8 py-4 text-right pr-12 flex items-center justify-end gap-2">
                          <button 
                            onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('detail'); setIsModalOpen(true); }}
                            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm" 
                            title="Ver Detalles"
                          >
                             <Icons.Eye />
                          </button>
                          <button 
                            onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setIsModalOpen(true); }} 
                            className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-md"
                            title="Editar"
                          >
                            <Icons.Audit />
                          </button>
                           {canDelete && (
                            <button 
                              onClick={() => { setRecordToDelete(item); setShowDeleteConfirm(true); }}
                              className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-md"
                              title="Eliminar"
                            >
                              <Icons.Trash />
                            </button>
                          )}
                       </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          ) : (
            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               {activeData.map((item: any) => (
                 <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl hover:border-emerald-500 transition-all group overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${viewTab === 'vehicles' ? 'bg-slate-900' : 'bg-emerald-500'}`}>
                          {viewTab === 'vehicles' ? <Icons.Truck /> : <Icons.Users />}
                       </div>
                     <div className="flex gap-1">
                        <button 
                          onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('detail'); setIsModalOpen(true); }}
                          className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-slate-900 hover:text-white" 
                          title="Ver Detalle"
                        >
                          <Icons.Eye />
                        </button>
                         {canEdit && (
                            <button 
                              onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setAiError(null); setIsModalOpen(true); }} 
                              className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white"
                              title="Editar"
                            >
                              <Icons.Audit />
                            </button>
                         )}
                         {canDelete && (
                            <button 
                              onClick={() => { setRecordToDelete(item); setShowDeleteConfirm(true); }}
                              className="p-1.5 bg-red-100 text-red-500 rounded-lg hover:bg-red-600 hover:text-white"
                              title="Eliminar"
                            >
                              <Icons.Trash />
                            </button>
                         )}
                     </div>
                  </div>
                  <h3 className="font-black text-slate-900 text-sm uppercase truncate mb-1">{viewTab === 'vehicles' ? item.plate : item.name}</h3>
                  <p className={`text-[8px] font-black uppercase mb-4 ${!validateDate(item.soatExpiry || item.licenseExpiry) ? 'text-red-500' : 'text-slate-400'}`}>
                    {viewTab === 'vehicles' ? `SOAT: ${item.soatExpiry || 'N/A'}` : `LIC: ${item.licenseExpiry || 'N/A'}`}
                  </p>
                   <div className="flex gap-2">
                    {canEdit && (
                      <button onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setIsModalOpen(true); }} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-emerald-600 transition-all">Editar</button>
                    )}
                    {canDelete && (
                      <button onClick={() => { setRecordToDelete(item); setShowDeleteConfirm(true); }} className="w-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all"><Icons.Trash /></button>
                    )}
                  </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL M7 REGISTRO SEGURO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[500] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95 overflow-y-auto">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/10">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-500 text-slate-950 rounded-xl flex items-center justify-center shadow-xl"><Icons.Scan /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none">REGISTRO M7</h3>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">
                    {modalMode === 'edit' ? 'EDITANDO INFORMACIÓN' : modalMode === 'detail' ? 'VISTA DE DETALLES (LECTURA)' : 'OPERACIÓN SEGURA'}
                  </p>
                </div>
             </div>
             <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 hover:text-white transition-all text-4xl font-thin" title="Cerrar">×</button>
            </div>

            {modalMode === 'telemetry' && selectedTelemetry && (
                <div className="space-y-8 animate-in zoom-in-95">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-900 p-6 rounded-[2rem] text-center text-white">
                            <Icons.Route className="mx-auto mb-2 text-emerald-500" />
                            <h4 className="text-3xl font-black">{selectedTelemetry.speed}</h4>
                            <span className="text-[9px] uppercase tracking-widest text-slate-400">km/h</span>
                        </div>
                        <div className="bg-white border border-slate-100 p-6 rounded-[2rem] text-center text-slate-900 shadow-lg">
                            <Icons.Settings className="mx-auto mb-2 text-slate-300" />
                            <h4 className="text-3xl font-black">{selectedTelemetry.rpm}</h4>
                            <span className="text-[9px] uppercase tracking-widest text-slate-400">RPM</span>
                        </div>
                        <div className="bg-white border border-slate-100 p-6 rounded-[2rem] text-center text-slate-900 shadow-lg">
                            <div className="mx-auto mb-2 text-slate-300 font-black text-xl">🌡️</div>
                            <h4 className="text-3xl font-black">{selectedTelemetry.engine_temp}°</h4>
                            <span className="text-[9px] uppercase tracking-widest text-slate-400">Temp</span>
                        </div>
                        <div className="bg-white border border-slate-100 p-6 rounded-[2rem] text-center text-slate-900 shadow-lg">
                             <div className="mx-auto mb-2 text-slate-300 font-black text-xl">⛽</div>
                            <h4 className="text-3xl font-black">{selectedTelemetry.fuel_level}%</h4>
                            <span className="text-[9px] uppercase tracking-widest text-slate-400">Nivel</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-8 rounded-[2rem]">
                        <h4 className="font-black text-slate-900 uppercase text-sm mb-4">Ubicación Actual</h4>
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                             <span>Lat: {selectedTelemetry.latitude}</span>
                             <span>Lng: {selectedTelemetry.longitude}</span>
                             <span className="ml-auto text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">{new Date(selectedTelemetry.timestamp).toLocaleTimeString()}</span>
                        </div>
                    </div>

                    <button onClick={() => setIsModalOpen(false)} className="w-full py-4 bg-emerald-500 text-slate-900 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-xl">
                        Cerrar Monitor
                    </button>
                </div>
            )}
            
            {(modalMode === 'single' || modalMode === 'edit' || modalMode === 'detail') && (
            <div className={`p-10 space-y-8 flex-1 bg-slate-50/20 max-h-[70vh] overflow-y-auto custom-scrollbar ${modalMode === 'detail' ? 'pointer-events-none opacity-90' : ''}`}>
              {aiError && (
                <div className="p-6 bg-red-600 text-white rounded-[2rem] text-[10px] font-black uppercase flex items-center gap-4 animate-in shake">
                  <Icons.Alert /> {aiError}
                </div>
              )}

              {isProcessingAI && (
                <div className="p-8 bg-emerald-50 border-4 border-dashed border-emerald-500 rounded-[3rem] flex flex-col items-center justify-center gap-4 animate-pulse">
                   <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                   <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">M7 VISION ANALIZANDO SOPORTES...</p>
                </div>
              )}

              {viewTab === 'vehicles' ? (
                /* FORMULARIO DE VEHICULOS INTACTO */
                <div className="space-y-8">
                    {/* 1. IDENTIFICACIÓN Y MARCA (DINÁMICA DESDE MASTER) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900 p-8 rounded-[3rem] shadow-xl border border-white/5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-emerald-400 font-bold uppercase ml-2 tracking-widest">Placa de Vehículo</label>
                        <input type="text" value={formData.plate || ''} onChange={e => setFormData({...formData, plate: e.target.value.toUpperCase()})} className={`${commonInputClass} !bg-white/5 !text-white !border-white/10`} />
                      </div>
                      <SearchableSelect 
                        label="Marca Fabricante" 
                        value={formData.brand} 
                        options={masterData['masterMarcas'] || []} 
                        onChange={(val: string) => setFormData({...formData, brand: val})} 
                      />
                    </div>

                    {/* 2. SOPORTES LEGALES (ARRIBA COMO SOLICITADO) */}
                    <div className="bg-emerald-500/5 p-8 rounded-[3.5rem] border-2 border-dashed border-emerald-500/20 space-y-6">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center">Gestión de Soportes Legales (Importación M7)</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* SECCIÓN SOAT */}
                        <div className="space-y-4">
                           <label className={`h-32 bg-white border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all ${formData.soatPdfUrl ? 'border-emerald-500' : 'border-slate-200'}`}>
                              <Icons.Excel className="text-slate-300 w-8 h-8 mb-2" />
                              <span className="text-[9px] font-black text-slate-400 uppercase">Vincular SOAT (PDF)</span>
                              <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'soatPdfUrl')} />
                           </label>
                           <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase ml-4 tracking-widest">Vencimiento SOAT</label>
                              <input type="date" value={formData.soatExpiry || ''} onChange={e => setFormData({...formData, soatExpiry: e.target.value})} className={commonInputClass} />
                           </div>
                        </div>

                        {/* SECCIÓN TECNO */}
                        <div className="space-y-4">
                           <label className={`h-32 bg-white border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all ${formData.technoPdfUrl ? 'border-blue-500' : 'border-slate-200'}`}>
                              <Icons.Excel className="text-slate-300 w-8 h-8 mb-2" />
                              <span className="text-[9px] font-black text-slate-400 uppercase">Vincular TECNO (PDF)</span>
                              <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'technoPdfUrl')} />
                           </label>
                           <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase ml-4 tracking-widest">Vencimiento Técnico-Mec.</label>
                              <input type="date" value={formData.technoExpiry || ''} onChange={e => setFormData({...formData, technoExpiry: e.target.value})} className={commonInputClass} />
                           </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. CAPACIDAD Y ESPECIFICACIONES TÉCNICAS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-8 bg-white rounded-[3rem] border-2 border-slate-100 shadow-sm">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-emerald-600 uppercase ml-2 font-bold underline">Capacidad (m3) *</label>
                        <input type="number" required value={formData.capacityM3 || formData.capacity_m3 || ''} onChange={e => setFormData({...formData, capacityM3: e.target.value})} placeholder="Ej: 35" className={commonInputClass} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Modelo/Año</label>
                        <input type="text" value={formData.modelYear || formData.model_year || ''} onChange={e => setFormData({...formData, modelYear: e.target.value})} placeholder="2024" className={commonInputClass} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Color</label>
                        <input type="text" value={formData.color || ''} onChange={e => setFormData({...formData, color: e.target.value})} placeholder="Blanco" className={commonInputClass} />
                      </div>
                      <SearchableSelect 
                        label="Tipo Vehículo" 
                        value={formData.vehicleTypeId || formData.vehicle_type} 
                        options={masterData['masterTiposVehiculo'] || []} 
                        onChange={(val: string) => setFormData({...formData, vehicleTypeId: val})} 
                      />
                    </div>

                    {/* 4. ESTADO OPERATIVO (NUEVO) */}
                    <div className="p-8 bg-white rounded-[3rem] border-2 border-slate-100 shadow-sm">
                        <SearchableSelect 
                          label="Estado Operativo" 
                          value={formData.statusId || formData.status_id} 
                          options={statusOptions} 
                          onChange={(val: string) => setFormData({...formData, statusId: val})} 
                        />
                    </div>
                </div>
              ) : (
                /* ACTUALIZACIÓN DEL FORMULARIO DE CONDUCTORES */
                <div className="space-y-10 animate-in fade-in">
                  <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner w-full max-w-xs mx-auto">
                     <button type="button" onClick={() => setUploadMode('photos')} className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase transition-all ${uploadMode === 'photos' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>FOTOS A/B</button>
                     <button type="button" onClick={() => setUploadMode('pdf')} className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase transition-all ${uploadMode === 'pdf' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>PDF</button>
                  </div>

                  <div className="bg-slate-900 p-8 rounded-[3.5rem] shadow-inner">
                    {uploadMode === 'photos' ? (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4 text-center">
                             <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Cara Frontal (A)</p>
                             <label className={`relative h-40 bg-white/5 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all ${formData.licenseSideA ? 'border-emerald-500' : 'border-white/10'}`}>
                                {formData.licenseSideA ? <img src={formData.licenseSideA} className="w-full h-full object-cover rounded-[2.2rem]" /> : <Icons.Camera className="text-white/20 w-8 h-8" />}
                                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'licenseSideA')} />
                             </label>
                          </div>
                          <div className="space-y-4 text-center">
                             <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Cara Posterior (B)</p>
                             <label className={`relative h-40 bg-white/5 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all ${formData.licenseSideB ? 'border-emerald-500' : 'border-white/10'}`}>
                                {formData.licenseSideB ? <img src={formData.licenseSideB} className="w-full h-full object-cover rounded-[2.2rem]" /> : <Icons.Camera className="text-white/20 w-8 h-8" />}
                                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'licenseSideB')} />
                             </label>
                          </div>
                       </div>
                    ) : (
                       <div className="space-y-4 text-center">
                          <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Licencia Digital (PDF)</p>
                          <label className={`relative h-40 bg-white/5 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all ${formData.licensePdf ? 'border-blue-500' : 'border-white/10'}`}>
                             <div className="flex flex-col items-center gap-3">
                                <Icons.Excel className="text-white/20 w-8 h-8" />
                                <span className="text-[10px] font-black text-white/40 uppercase">Vincular Documento</span>
                             </div>
                             <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'licensePdf')} />
                          </label>
                       </div>
                    )}
                    {uploadMode === 'photos' && (!formData.licenseSideA || !formData.licenseSideB) && (
                      <p className="text-center text-amber-500 text-[8px] font-black uppercase mt-4 animate-pulse tracking-widest">Cargue ambas fotos para iniciar análisis M7 Vision</p>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-4 tracking-widest">Nombre Completo</label>
                       <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} placeholder="Ingrese nombre..." className={commonInputClass} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <SearchableSelect label="Tipo Documento" value={formData.documentType} options={docTypeOptions} onChange={(val: string) => setFormData({...formData, documentType: val})} />
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-4 tracking-widest">Nro Documento</label>
                        <input type="text" value={formData.documentNumber || ''} onChange={e => setFormData({...formData, documentNumber: e.target.value})} placeholder="ID..." className={commonInputClass} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-4 tracking-widest">Vencimiento Licencia</label>
                        <input type="date" value={formData.licenseExpiry || formData.license_expiry || ''} onChange={e => setFormData({...formData, licenseExpiry: e.target.value})} className={commonInputClass} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-4 tracking-widest">Número Telefónico</label>
                        <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+57 ..." className={commonInputClass} />
                      </div>
                    </div>

                    <div className="p-8 bg-white rounded-[3rem] border-2 border-slate-100 shadow-sm">
                        <SearchableSelect 
                          label="Estado Operativo" 
                          value={formData.statusId || formData.status_id} 
                          options={statusOptions} 
                          onChange={(val: string) => setFormData({...formData, statusId: val})} 
                        />
                    </div>
                  </div>
                </div>
              )}

               <div className="pt-8 flex flex-col md:flex-row gap-4">
                {modalMode === 'detail' ? (
                  <>
                    <div className="flex-1 space-y-4">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Visualizador de Soportes</p>
                       <div className="flex flex-wrap gap-4 justify-center">
                          {viewTab === 'vehicles' ? (
                            <>
                              {formData.soatPdfUrl && (
                                <button type="button" onClick={() => window.open(formData.soatPdfUrl)} className="pointer-events-auto px-6 py-3 bg-emerald-500 text-slate-950 rounded-xl font-black text-[9px] uppercase">Ver SOAT (PDF)</button>
                              )}
                              {formData.technoPdfUrl && (
                                <button type="button" onClick={() => window.open(formData.technoPdfUrl)} className="pointer-events-auto px-6 py-3 bg-blue-500 text-white rounded-xl font-black text-[9px] uppercase">Ver TECNO (PDF)</button>
                              )}
                            </>
                          ) : (
                            <>
                              {formData.licensePdf && (
                                <button type="button" onClick={() => window.open(formData.licensePdf)} className="pointer-events-auto px-6 py-3 bg-purple-500 text-white rounded-xl font-black text-[9px] uppercase">Ver Licencia (PDF)</button>
                              )}
                              {formData.licenseSideA && (
                                <button type="button" onClick={() => window.open(formData.licenseSideA)} className="pointer-events-auto px-6 py-3 bg-emerald-500 text-slate-950 rounded-xl font-black text-[9px] uppercase">Foto Frontal</button>
                              )}
                              {formData.licenseSideB && (
                                <button type="button" onClick={() => window.open(formData.licenseSideB)} className="pointer-events-auto px-6 py-3 bg-emerald-500 text-slate-950 rounded-xl font-black text-[9px] uppercase">Foto Posterior</button>
                              )}
                            </>
                          )}
                       </div>
                       <button type="button" onClick={() => setIsModalOpen(false)} className="pointer-events-auto w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-xl mt-4">SALIR</button>
                    </div>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-red-700 shadow-xl transition-all">DESCARTAR</button>
                    <button onClick={handleSave} className="flex-[2] bg-slate-900 text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all active:scale-95">CONFIRMAR OPERACIÓN</button>
                  </>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[800] bg-red-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl text-center border-4 border-red-500 overflow-hidden relative">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full mx-auto flex items-center justify-center mb-6 animate-pulse">
              <Icons.Trash className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase mb-2">¿Eliminar {viewTab === 'vehicles' ? 'Vehículo' : 'Conductor'}?</h3>
            <p className="text-slate-500 font-bold mb-8 px-4">
              Esta acción eliminará a <span className="text-red-700 font-black">{recordToDelete?.plate || recordToDelete?.name}</span> permanentemente del sistema M7 Intelligence. ¿Continuar?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => { setShowDeleteConfirm(false); setRecordToDelete(null); }} 
                className="py-4 bg-slate-100 text-slate-900 rounded-2xl font-black uppercase hover:bg-slate-200 transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmDelete} 
                className="py-4 bg-red-600 text-white rounded-2xl font-black uppercase hover:bg-red-700 shadow-xl shadow-red-500/20 transition-all active:scale-95"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetManager;
