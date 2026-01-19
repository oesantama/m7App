
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icons, INITIAL_CLIENTS, MASTER_BRANDS, MASTER_DOC_TYPES } from '../constants';
import { Vehicle, Driver, User, MasterCategory, MasterRecord } from '../types';
import { extractLicenseInfo, extractVehicleDocInfo } from '../services/geminiService';

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
}

const FleetManager: React.FC<FleetManagerProps> = ({ 
  vehicles, drivers, user, masterData,
  onAddVehicle, onAddDriver, onUpdateVehicle, onUpdateDriver 
}) => {
  const [viewTab, setViewTab] = useState<'vehicles' | 'drivers'>('vehicles');
  const [displayType, setDisplayType] = useState<'table' | 'cards'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'single' | 'edit'>('single');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'photos' | 'pdf'>('photos');

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 40 }, (_, i) => currentYear + 1 - i);
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const normalizePlate = (plate: string) => (plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const validateDate = (dateStr: string) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(dateStr);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today;
  };

  const handleFileAction = (action: 'view' | 'download', base64: string, filename: string) => {
    if (!base64) return;
    if (action === 'download') {
      const link = document.createElement('a');
      link.href = base64;
      link.download = filename;
      link.click();
    } else {
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${base64}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      }
    }
  };

  const processVehicleDocument = async (field: 'soatPdfUrl' | 'technoPdfUrl', base64: string, type: string) => {
    if (!formData.plate) {
      setAiError("ERROR: Ingrese la PLACA primero para validar el documento.");
      setFormData(prev => ({ ...prev, [field]: null }));
      return;
    }
    
    setIsProcessingAI(true);
    setAiError(null);
    
    const docType = field === 'soatPdfUrl' ? 'SOAT' : 'Techno';
    const expiryField = field === 'soatPdfUrl' ? 'soatExpiry' : 'technoExpiry';

    try {
      const result = await extractVehicleDocInfo({ data: base64, mimeType: type }, formData.plate, docType);
      const normalizedFound = normalizePlate(result.plateFound);
      const normalizedExpected = normalizePlate(formData.plate);

      if (result && (normalizedFound === normalizedExpected || result.plateMatches)) {
        if (!validateDate(result.expiryDate)) {
          setAiError(`ALERTA: El ${docType} cargado está VENCIDO (${result.expiryDate}). Documento no válido para la operación.`);
          setFormData(prev => ({ ...prev, [field]: null, [expiryField]: '' }));
        } else {
          setFormData(prev => ({
            ...prev,
            [expiryField]: result.expiryDate,
            brand: docType === 'SOAT' ? (result.brand || prev.brand) : prev.brand,
            modelYear: docType === 'SOAT' ? (result.modelYear || prev.modelYear) : prev.modelYear
          }));
        }
      } else {
        setAiError(`ERROR: Placa ${normalizedFound || 'DESCONOCIDA'} no coincide con ${normalizedExpected}.`);
        setFormData(prev => ({ ...prev, [field]: null, [expiryField]: '' }));
      }
    } catch (e) {
      setAiError(`M7 Vision: Error analizando soporte de ${docType}.`);
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
          setAiError(`CRÍTICO: Licencia detectada como VENCIDA (${result.data.expiry}). Carga rechazada.`);
          setFormData(prev => ({ ...prev, licensePdf: null, licenseSideA: null, licenseSideB: null, licenseExpiry: '' }));
        } else {
          setFormData(prev => ({
            ...prev,
            name: result.data.fullName || prev.name,
            documentNumber: result.data.documentNumber || prev.documentNumber,
            licenseCategory: result.data.category || prev.licenseCategory,
            licenseExpiry: result.data.expiry || prev.licenseExpiry
          }));
        }
      } else {
        setAiError(result.error || "M7 VISION: No se pudo procesar la licencia.");
        setFormData(prev => ({ ...prev, licensePdf: null, licenseSideA: null, licenseSideB: null }));
      }
    } catch (e) {
      setAiError("Fallo en M7 Vision al procesar licencia.");
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
      
      setFormData(prev => {
        const next = { ...prev, [field]: base64 };
        
        if (viewTab === 'vehicles') {
          if (field === 'soatPdfUrl' || field === 'technoPdfUrl') {
            processVehicleDocument(field as any, base64, mimeType);
          }
        } else if (viewTab === 'drivers') {
          if (uploadMode === 'pdf' && field === 'licensePdf') {
            processLicenseFlow([{ data: base64, mimeType }]);
          } else if (uploadMode === 'photos') {
             if (field === 'licenseSideA' && next.licenseSideB) {
                processLicenseFlow([
                   { data: base64, mimeType },
                   { data: next.licenseSideB, mimeType: 'image/jpeg' }
                ]);
             } else if (field === 'licenseSideB' && next.licenseSideA) {
                processLicenseFlow([
                   { data: next.licenseSideA, mimeType: 'image/jpeg' },
                   { data: base64, mimeType }
                ]);
             }
          }
        }
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    setAiError(null);
    
    // Validación de fechas mínimas antes de guardar
    if (viewTab === 'vehicles') {
      if (formData.soatExpiry && !validateDate(formData.soatExpiry)) {
        setAiError("ERROR: El SOAT ingresado ya está vencido. No se puede guardar."); return;
      }
      if (formData.technoExpiry && !validateDate(formData.technoExpiry)) {
        setAiError("ERROR: La revisión Técnico-Mecánica ya está vencida."); return;
      }
    }
    
    if (viewTab === 'drivers') {
      if (formData.licenseExpiry && !validateDate(formData.licenseExpiry)) {
        setAiError("ERROR: La Licencia de Conducción ya está vencida."); return;
      }
    }

    if (modalMode === 'single') {
      viewTab === 'vehicles' ? onAddVehicle(formData) : onAddDriver(formData);
    } else {
      viewTab === 'vehicles' ? onUpdateVehicle(selectedItem.id, formData) : onUpdateDriver(selectedItem.id, formData);
    }
    setIsModalOpen(false);
    setFormData({});
    setAiError(null);
  };

  const isSuperUser = user.roleId === 'ROL-01';
  const fleetPerms = user.permissions.find(p => p.module === 'PAG-OP-04');
  const canCreate = isSuperUser || fleetPerms?.actions.includes('create');
  const canEdit = isSuperUser || fleetPerms?.actions.includes('edit');

  const statusOptions = masterData['masterEstados'] || [];
  const vehicleTypeOptions = masterData['masterTiposVehiculo'] || [];
  const clientsOptions = masterData['masterClientes'] || INITIAL_CLIENTS;

  const activeData = useMemo(() => {
    const list = viewTab === 'vehicles' ? vehicles : drivers;
    return list.filter(item => 
      (item.plate || item.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [viewTab, vehicles, drivers, searchTerm]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in h-full p-4 md:p-10 bg-slate-50/50">
      {/* Header */}
      <div className="bg-white p-6 md:p-10 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col xl:flex-row justify-between items-center gap-8 shrink-0 transition-all">
        <div className="flex items-center gap-6 w-full xl:w-auto">
          <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center text-emerald-500 shadow-xl">
            {viewTab === 'vehicles' ? <Icons.Truck /> : <Icons.Users />}
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{viewTab === 'vehicles' ? 'M7 Fleet' : 'M7 Talent'}</h2>
            <p className="text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest mt-2">Seguridad Operativa Validada</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-end">
           <div className="flex bg-slate-100 p-2 rounded-[2rem] shadow-inner">
              <button onClick={() => setViewTab('vehicles')} className={`px-8 py-3 rounded-[1.5rem] font-black text-xs uppercase transition-all ${viewTab === 'vehicles' ? 'bg-white shadow-xl text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Vehículos</button>
              <button onClick={() => setViewTab('drivers')} className={`px-8 py-3 rounded-[1.5rem] font-black text-xs uppercase transition-all ${viewTab === 'drivers' ? 'bg-white shadow-xl text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Conductores</button>
           </div>
           
           <div className="flex bg-slate-100 p-2 rounded-[2rem] shadow-inner">
              <button onClick={() => setDisplayType('table')} className={`p-3.5 rounded-2xl transition-all ${displayType === 'table' ? 'bg-white shadow-xl text-slate-900' : 'text-slate-400'}`}><Icons.List /></button>
              <button onClick={() => setDisplayType('cards')} className={`p-3.5 rounded-2xl transition-all ${displayType === 'cards' ? 'bg-white shadow-xl text-slate-900' : 'text-slate-400'}`}><Icons.Grid /></button>
           </div>

           {canCreate && (
             <button onClick={() => { setModalMode('single'); setFormData({ statusId: 'EST-01', clientId: INITIAL_CLIENTS[0].id }); setAiError(null); setIsModalOpen(true); }} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center gap-4 hover:bg-emerald-600 shadow-2xl transition-all active:scale-95">
                <Icons.Scan /> REGISTRAR NUEVO
             </button>
           )}
        </div>
      </div>

      {/* Listado */}
      <div className="flex-1 bg-white rounded-[4rem] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden">
        <div className="p-8 border-b border-slate-50 bg-slate-50/20 shrink-0">
          <div className="relative group/search max-w-2xl">
             <div className="absolute inset-y-0 left-0 pl-6 flex items-center text-slate-400 pointer-events-none group-focus-within/search:text-emerald-500 transition-colors"><Icons.Search /></div>
             <input type="text" placeholder={`Buscar en ${viewTab === 'vehicles' ? 'Flota' : 'Conductores'}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border-2 border-slate-100 focus:border-emerald-500 rounded-3xl py-5 pl-16 pr-6 outline-none font-bold text-sm transition-all shadow-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {displayType === 'table' ? (
            <div className="overflow-x-auto rounded-[2.5rem] border border-slate-100">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-10 py-6 text-[10px] uppercase font-black tracking-widest">Identificación</th>
                    <th className="px-10 py-6 text-[10px] uppercase font-black tracking-widest">Documentación</th>
                    <th className="px-10 py-6 text-[10px] uppercase font-black tracking-widest text-center">Estado</th>
                    <th className="px-10 py-6 text-[10px] uppercase font-black tracking-widest text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeData.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-all group/row">
                      <td className="px-10 py-6">
                         <div className="flex items-center gap-5">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xs shadow-lg ${viewTab === 'vehicles' ? 'bg-slate-800' : 'bg-emerald-500'}`}>
                               {viewTab === 'vehicles' ? item.plate.slice(0,3) : item.name.slice(0,1)}
                            </div>
                            <div>
                               <p className="font-black text-slate-900 text-sm uppercase">{viewTab === 'vehicles' ? item.plate : item.name}</p>
                               <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{viewTab === 'vehicles' ? item.brand : item.documentNumber}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-10 py-6">
                         <p className={`text-[10px] font-black uppercase ${!validateDate(item.soatExpiry || item.licenseExpiry) ? 'text-red-500' : 'text-slate-700'}`}>
                            VENCE: {viewTab === 'vehicles' ? (item.soatExpiry || 'PENDIENTE') : (item.licenseExpiry || 'N/A')}
                         </p>
                         <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{viewTab === 'vehicles' ? 'SOAT ACTIVO' : `CATEGORÍA: ${item.licenseCategory || 'N/A'}`}</p>
                      </td>
                      <td className="px-10 py-6 text-center">
                         <span className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            {statusOptions.find(s => s.id === item.statusId)?.name || 'ACTIVO'}
                         </span>
                      </td>
                      <td className="px-10 py-6 text-right">
                         {canEdit && (
                           <button onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setAiError(null); setIsModalOpen(true); }} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white shadow-sm transition-all active:scale-90"><Icons.Audit /></button>
                         )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
               {activeData.map((item: any) => (
                 <div key={item.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group overflow-hidden">
                    <div className="flex justify-between items-start mb-8">
                       <div className={`w-14 h-14 rounded-3xl flex items-center justify-center text-white shadow-2xl ${viewTab === 'vehicles' ? 'bg-slate-900' : 'bg-emerald-500'}`}>
                          {viewTab === 'vehicles' ? <Icons.Truck /> : <Icons.Users />}
                       </div>
                       <div className="text-right">
                          <p className="text-lg font-black text-slate-900 uppercase">{viewTab === 'vehicles' ? item.plate : item.name.split(' ')[0]}</p>
                          <span className={`text-[9px] font-black uppercase tracking-widest ${item.statusId === 'EST-01' ? 'text-emerald-500' : 'text-red-500'}`}>
                             {statusOptions.find(s => s.id === item.statusId)?.name || 'ACTIVO'}
                          </span>
                       </div>
                    </div>
                    <div className="space-y-4 mb-8">
                       <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Vencimiento Operativo</p>
                          <p className={`text-xs font-black uppercase ${!validateDate(item.soatExpiry || item.licenseExpiry) ? 'text-red-500' : 'text-slate-700'}`}>
                             {viewTab === 'vehicles' ? `SOAT: ${item.soatExpiry || 'N/A'}` : `LIC: ${item.licenseExpiry || 'N/A'}`}
                          </p>
                       </div>
                    </div>
                    <button onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setAiError(null); setIsModalOpen(true); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all">Auditar Registro</button>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Formulario */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh] border border-white/20">
            <div className="bg-slate-900 p-8 md:p-12 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-500 text-slate-950 rounded-[2rem] flex items-center justify-center shadow-2xl"><Icons.Scan /></div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">{modalMode === 'edit' ? 'Auditoría' : 'Registro'} M7</h3>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Módulo: {viewTab === 'vehicles' ? 'Flota' : 'Talento Humano'}</p>
                  </div>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="w-14 h-14 flex items-center justify-center rounded-3xl hover:bg-red-500 transition-all text-4xl font-thin">×</button>
            </div>

            <div className="p-8 md:p-12 space-y-10 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/30">
              {aiError && (
                <div className="p-6 bg-red-600 text-white rounded-[2rem] text-xs font-black uppercase flex items-center gap-4 animate-in shake shadow-2xl">
                  <Icons.Alert /> {aiError}
                </div>
              )}

              {isProcessingAI && (
                <div className="p-10 bg-emerald-50 border-4 border-dashed border-emerald-500 rounded-[3rem] flex flex-col items-center justify-center gap-4 animate-pulse">
                   <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                   <p className="text-sm font-black text-emerald-700 uppercase tracking-widest">M7 VISION ANALIZANDO DOCUMENTOS...</p>
                </div>
              )}

              {viewTab === 'vehicles' ? (
                <div className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Placa (Base de Validación)</label>
                      <input type="text" required value={formData.plate || ''} onChange={e => setFormData({...formData, plate: e.target.value.toUpperCase()})} className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl font-black text-base outline-none focus:border-emerald-500 transition-all" />
                    </div>
                    
                    <SearchableSelect label="Marca" value={formData.brand} options={MASTER_BRANDS} onChange={(val: string) => setFormData({...formData, brand: val})} />
                    <SearchableSelect label="Tipo Vehículo" value={formData.vehicleTypeId} options={vehicleTypeOptions} onChange={(val: string) => setFormData({...formData, vehicleTypeId: val})} />
                    <SearchableSelect label="Año Modelo" value={formData.modelYear} options={years} onChange={(val: number) => setFormData({...formData, modelYear: val})} />

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Capacidad (m³)</label>
                      <input type="number" required value={formData.capacityM3 || ''} onChange={e => setFormData({...formData, capacityM3: parseFloat(e.target.value)})} className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl font-black text-base outline-none" />
                    </div>
                    
                    <SearchableSelect label="Cliente / Operación" value={formData.clientId} options={clientsOptions} onChange={(val: string) => setFormData({...formData, clientId: val})} />
                  </div>

                  {/* Documentación Vehículo */}
                  <div className="bg-slate-900 p-8 md:p-12 rounded-[4rem] space-y-10 shadow-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* SOAT */}
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest text-center">Soporte SOAT (PDF)</p>
                        <div className="relative group">
                           <label className="flex flex-col items-center justify-center h-44 bg-white/5 border-2 border-dashed border-white/10 rounded-[3rem] cursor-pointer hover:bg-white/10 transition-all overflow-hidden shadow-inner">
                              {formData.soatPdfUrl ? (
                                <div className="flex flex-col items-center gap-3 text-emerald-400">
                                  <Icons.Excel /><span className="text-[10px] font-black uppercase">SOAT VALIDADO ✓</span>
                                </div>
                              ) : (
                                <div className="text-slate-600 flex flex-col items-center gap-3">
                                  <Icons.Excel /><span className="text-[10px] font-black uppercase">CARGAR PDF</span>
                                </div>
                              )}
                              <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'soatPdfUrl')} />
                           </label>
                           {formData.soatPdfUrl && (
                             <div className="absolute inset-0 bg-slate-900/90 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-3 rounded-[3rem]">
                               <button type="button" onClick={() => handleFileAction('view', formData.soatPdfUrl, '')} className="bg-emerald-500 text-slate-950 px-6 py-2 rounded-xl font-black text-[10px] uppercase">Ver</button>
                               <button type="button" onClick={() => handleFileAction('download', formData.soatPdfUrl, `SOAT_${formData.plate}.pdf`)} className="bg-white/10 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase">Descargar</button>
                               <button type="button" onClick={() => setFormData(prev => ({ ...prev, soatPdfUrl: null, soatExpiry: '' }))} className="text-red-400 font-black text-[9px] uppercase mt-2">Eliminar</button>
                             </div>
                           )}
                        </div>
                        <div className="relative group/date">
                           <input 
                             type="date" 
                             readOnly={!formData.soatPdfUrl}
                             min={todayStr}
                             value={formData.soatExpiry || ''} 
                             onChange={e => setFormData({...formData, soatExpiry: e.target.value})} 
                             className={`w-full p-5 rounded-2xl bg-white/5 border font-bold transition-all outline-none ${!formData.soatPdfUrl ? 'opacity-30 border-white/5 cursor-not-allowed text-slate-500' : 'border-white/20 text-white focus:border-emerald-500'}`} 
                           />
                           {!formData.soatPdfUrl && <div className="absolute inset-y-0 right-4 flex items-center text-slate-600"><Icons.Alert /></div>}
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase text-center tracking-tighter">Edición bloqueada hasta cargar soporte vigente</p>
                      </div>

                      {/* TÉCNICA */}
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest text-center">Soporte TÉCNICA (PDF)</p>
                        <div className="relative group">
                           <label className="flex flex-col items-center justify-center h-44 bg-white/5 border-2 border-dashed border-white/10 rounded-[3rem] cursor-pointer hover:bg-white/10 transition-all overflow-hidden shadow-inner">
                              {formData.technoPdfUrl ? (
                                <div className="flex flex-col items-center gap-3 text-blue-400">
                                  <Icons.Excel /><span className="text-[10px] font-black uppercase">TÉCNICA VALIDADA ✓</span>
                                </div>
                              ) : (
                                <div className="text-slate-600 flex flex-col items-center gap-3">
                                  <Icons.Excel /><span className="text-[10px] font-black uppercase">CARGAR PDF</span>
                                </div>
                              )}
                              <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'technoPdfUrl')} />
                           </label>
                           {formData.technoPdfUrl && (
                             <div className="absolute inset-0 bg-slate-900/90 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-3 rounded-[3rem]">
                               <button type="button" onClick={() => handleFileAction('view', formData.technoPdfUrl, '')} className="bg-blue-500 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase">Ver</button>
                               <button type="button" onClick={() => handleFileAction('download', formData.technoPdfUrl, `TECNICA_${formData.plate}.pdf`)} className="bg-white/10 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase">Descargar</button>
                               <button type="button" onClick={() => setFormData(prev => ({ ...prev, technoPdfUrl: null, technoExpiry: '' }))} className="text-red-400 font-black text-[9px] uppercase mt-2">Eliminar</button>
                             </div>
                           )}
                        </div>
                        <div className="relative group/date">
                           <input 
                             type="date" 
                             readOnly={!formData.technoPdfUrl}
                             min={todayStr}
                             value={formData.technoExpiry || ''} 
                             onChange={e => setFormData({...formData, technoExpiry: e.target.value})} 
                             className={`w-full p-5 rounded-2xl bg-white/5 border font-bold transition-all outline-none ${!formData.technoPdfUrl ? 'opacity-30 border-white/5 cursor-not-allowed text-slate-500' : 'border-white/20 text-white focus:border-emerald-500'}`} 
                           />
                           {!formData.technoPdfUrl && <div className="absolute inset-y-0 right-4 flex items-center text-slate-600"><Icons.Alert /></div>}
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase text-center tracking-tighter">Edición bloqueada hasta cargar soporte vigente</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Selector de modo conductores */}
                  <div className="flex bg-slate-200 p-2 rounded-[2.5rem] shadow-inner w-full max-w-lg mx-auto">
                     <button type="button" onClick={() => setUploadMode('photos')} className={`flex-1 py-4 rounded-[2rem] font-black text-xs uppercase transition-all ${uploadMode === 'photos' ? 'bg-white shadow-2xl text-slate-900' : 'text-slate-500'}`}>Fotos A/B</button>
                     <button type="button" onClick={() => setUploadMode('pdf')} className={`flex-1 py-4 rounded-[2rem] font-black text-xs uppercase transition-all ${uploadMode === 'pdf' ? 'bg-white shadow-2xl text-slate-900' : 'text-slate-500'}`}>Archivo PDF</button>
                  </div>

                  {/* Carga de Licencia */}
                  <div className="p-8 bg-white border-4 border-dashed border-slate-200 rounded-[3rem]">
                     {uploadMode === 'photos' ? (
                       <div className="grid grid-cols-2 gap-8">
                          <label className="h-52 bg-slate-50 rounded-[3rem] border-4 border-slate-100 flex flex-col items-center justify-center cursor-pointer hover:bg-emerald-50 relative overflow-hidden group">
                             {formData.licenseSideA ? <img src={formData.licenseSideA} className="w-full h-full object-cover" /> : <><Icons.Camera /><span className="mt-2 text-[8px] font-black uppercase text-slate-400">Cara Frontal</span></>}
                             <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'licenseSideA')} />
                             {formData.licenseSideA && <button type="button" onClick={(e)=>{e.preventDefault(); setFormData({...formData, licenseSideA: null})}} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-lg z-10">×</button>}
                          </label>
                          <label className="h-52 bg-slate-50 rounded-[3rem] border-4 border-slate-100 flex flex-col items-center justify-center cursor-pointer hover:bg-emerald-50 relative overflow-hidden group">
                             {formData.licenseSideB ? <img src={formData.licenseSideB} className="w-full h-full object-cover" /> : <><Icons.Camera /><span className="mt-2 text-[8px] font-black uppercase text-slate-400">Cara Trasera</span></>}
                             <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'licenseSideB')} />
                             {formData.licenseSideB && <button type="button" onClick={(e)=>{e.preventDefault(); setFormData({...formData, licenseSideB: null})}} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-lg z-10">×</button>}
                          </label>
                       </div>
                     ) : (
                       <label className="h-52 bg-slate-50 rounded-[3rem] border-4 border-slate-100 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 relative overflow-hidden">
                          {formData.licensePdf ? <div className="flex flex-col items-center text-blue-500"><Icons.Excel /><span className="mt-2 text-[8px] font-black uppercase">Archivo PDF Listo</span></div> : <><Icons.Excel /><span className="mt-4 font-black text-[10px] uppercase">Cargar Licencia PDF</span></>}
                          <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'licensePdf')} />
                          {formData.licensePdf && <button type="button" onClick={(e)=>{e.preventDefault(); setFormData({...formData, licensePdf: null})}} className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-lg z-10">×</button>}
                       </label>
                     )}
                     <p className="mt-4 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                       {uploadMode === 'photos' ? 'Sube ambas caras para activar el análisis inteligente' : 'Sube el soporte PDF para validar datos'}
                     </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100">
                    <div className="md:col-span-2 space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre Completo</label>
                       <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-base outline-none focus:border-emerald-500" />
                    </div>
                    
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Tipo Documento</label>
                       <select value={formData.documentType || ''} onChange={e => setFormData({...formData, documentType: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-base outline-none">
                          <option value="">Seleccione...</option>
                          {MASTER_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nro Documento</label>
                       <input type="text" value={formData.documentNumber || ''} onChange={e => setFormData({...formData, documentNumber: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-base outline-none focus:border-emerald-500" />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Celular</label>
                       <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-base outline-none focus:border-emerald-500" />
                    </div>
                    
                    <SearchableSelect label="Cliente / Operación" value={formData.clientId} options={clientsOptions} onChange={(val: string) => setFormData({...formData, clientId: val})} />

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Categoría Licencia</label>
                       <input type="text" value={formData.licenseCategory || ''} onChange={e => setFormData({...formData, licenseCategory: e.target.value.toUpperCase()})} className="w-full p-5 bg-emerald-50/50 border-2 border-emerald-100 rounded-3xl font-black text-base outline-none focus:border-emerald-500" />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Vencimiento Licencia</label>
                       <div className="relative">
                          <input 
                            type="date" 
                            readOnly={!(formData.licensePdf || (formData.licenseSideA && formData.licenseSideB))}
                            min={todayStr}
                            value={formData.licenseExpiry || ''} 
                            onChange={e => setFormData({...formData, licenseExpiry: e.target.value})} 
                            className={`w-full p-5 border-2 rounded-3xl font-black text-base outline-none transition-all ${!(formData.licensePdf || (formData.licenseSideA && formData.licenseSideB)) ? 'bg-slate-100 border-slate-200 opacity-40 cursor-not-allowed text-slate-500' : (validateDate(formData.licenseExpiry) ? 'border-emerald-100 bg-emerald-50/30 text-emerald-950' : 'border-red-500 bg-red-50 text-red-600')}`} 
                          />
                          {!(formData.licensePdf || (formData.licenseSideA && formData.licenseSideB)) && <div className="absolute inset-y-0 right-4 flex items-center text-slate-400"><Icons.Alert /></div>}
                       </div>
                       <p className="text-[9px] text-slate-400 font-black uppercase text-center mt-2 tracking-tighter">Campo habilitado solo con soporte vigente cargado</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-12 border-t border-slate-200 flex flex-col md:flex-row gap-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-12 py-6 bg-red-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all active:scale-95">DESCARTAR</button>
                <button onClick={handleSave} className="flex-1 bg-slate-900 text-white py-6 rounded-[2.5rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-xl transition-all flex items-center justify-center gap-4 active:scale-95 group/save">
                   {modalMode === 'edit' ? 'GUARDAR CAMBIOS' : 'CONFIRMAR REGISTRO'} <Icons.ChevronRight />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetManager;
