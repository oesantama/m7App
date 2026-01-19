
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icons, INITIAL_CLIENTS, MASTER_BRANDS, MASTER_DOC_TYPES } from '../constants';
import { Vehicle, Driver, User, MasterCategory, MasterRecord } from '../types';
import { extractLicenseInfo, extractVehicleDocInfo } from '../services/geminiService';
import * as XLSX from 'xlsx';

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
  const [displayType, setDisplayType] = useState<'table' | 'grid'>('table');
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
      setAiError("ERROR: Ingrese la PLACA primero.");
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
          setAiError(`ALERTA: El ${docType} está VENCIDO (${result.expiryDate}).`);
          setFormData(prev => ({ ...prev, [field]: null, [expiryField]: '' }));
        } else {
          setFormData(prev => ({ ...prev, [expiryField]: result.expiryDate, brand: docType === 'SOAT' ? (result.brand || prev.brand) : prev.brand, modelYear: docType === 'SOAT' ? (result.modelYear || prev.modelYear) : prev.modelYear }));
        }
      } else {
        setAiError(`ERROR: Placa ${normalizedFound || 'DESCONOCIDA'} no coincide.`);
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
      setFormData(prev => {
        const next = { ...prev, [field]: base64 };
        if (viewTab === 'vehicles') { if (field === 'soatPdfUrl' || field === 'technoPdfUrl') processVehicleDocument(field as any, base64, mimeType); }
        else if (viewTab === 'drivers') {
          if (uploadMode === 'pdf' && field === 'licensePdf') processLicenseFlow([{ data: base64, mimeType }]);
          else if (uploadMode === 'photos') {
             if (field === 'licenseSideA' && next.licenseSideB) processLicenseFlow([{ data: base64, mimeType }, { data: next.licenseSideB, mimeType: 'image/jpeg' }]);
             else if (field === 'licenseSideB' && next.licenseSideA) processLicenseFlow([{ data: next.licenseSideA, mimeType: 'image/jpeg' }, { data: base64, mimeType }]);
          }
        }
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (viewTab === 'vehicles') {
      if (formData.soatExpiry && !validateDate(formData.soatExpiry)) { setAiError("ERROR: SOAT vencido."); return; }
      if (formData.technoExpiry && !validateDate(formData.technoExpiry)) { setAiError("ERROR: Técnico-Mecánica vencida."); return; }
    }
    if (viewTab === 'drivers') { if (formData.licenseExpiry && !validateDate(formData.licenseExpiry)) { setAiError("ERROR: Licencia vencida."); return; } }
    if (modalMode === 'single') { viewTab === 'vehicles' ? onAddVehicle(formData) : onAddDriver(formData); }
    else { viewTab === 'vehicles' ? onUpdateVehicle(selectedItem.id, formData) : onUpdateDriver(selectedItem.id, formData); }
    setIsModalOpen(false); setFormData({}); setAiError(null);
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
    return list.filter(item => (item.plate || item.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  }, [viewTab, vehicles, drivers, searchTerm]);

  const totalPages = useMemo(() => Math.ceil(activeData.length / 10), [activeData]);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in h-full overflow-hidden">
      {/* HEADER COMPACTO TIPO IMAGEN 2 */}
      <div className="bg-white px-6 py-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-4 shrink-0 transition-all">
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

        {/* BUSCADOR COMPACTO */}
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
          {/* TOGGLE TABS (Vehiculos/Conductores) */}
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-11 relative">
            <button onClick={() => setViewTab('vehicles')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all relative z-10 ${viewTab === 'vehicles' ? 'text-slate-900' : 'text-slate-400'}`}>Vehículos</button>
            <button onClick={() => setViewTab('drivers')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all relative z-10 ${viewTab === 'drivers' ? 'text-slate-900' : 'text-slate-400'}`}>Conductores</button>
            <div className={`absolute top-1 bottom-1 bg-white rounded-xl shadow-md transition-all duration-300 ${viewTab === 'vehicles' ? 'left-1 w-[80px]' : 'left-[84px] w-[95px]'}`}></div>
          </div>

          {/* TOGGLE GRID/TABLE */}
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-11 relative">
            <button onClick={() => setDisplayType('table')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayType === 'table' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.List /></button>
            <button onClick={() => setDisplayType('grid')} className={`p-2.5 rounded-xl transition-all relative z-10 ${displayType === 'grid' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.Grid /></button>
            <div className={`absolute top-1 bottom-1 w-[40px] bg-white rounded-xl shadow-md transition-all duration-300 ${displayType === 'table' ? 'left-1' : 'left-[44px]'}`}></div>
          </div>

          <button onClick={handleExportExcel} className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-2 font-black text-[9px] uppercase">
            <Icons.Excel />
            <span className="hidden xl:inline">Excel</span>
          </button>

          {canCreate && (
            <button 
              onClick={() => { setModalMode('single'); setFormData({ statusId: 'EST-01', clientId: INITIAL_CLIENTS[0].id }); setAiError(null); setIsModalOpen(true); }} 
              className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all active:scale-95"
            >
              NUEVO
            </button>
          )}
        </div>
      </div>

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
                    <th className="px-8 py-4 text-right">Auditoría</th>
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
                      <td className="px-8 py-4 text-right">
                         {canEdit && (
                           <button onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setAiError(null); setIsModalOpen(true); }} className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-blue-600 transition-all shadow-md active:scale-90"><Icons.Audit /></button>
                         )}
                      </td>
                    </tr>
                  ))}
                  {activeData.length === 0 && <tr><td colSpan={4} className="py-20 text-center font-black text-slate-200 uppercase text-[10px] tracking-widest">Sin registros encontrados</td></tr>}
                </tbody>
             </table>
          ) : (
            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
               {activeData.map((item: any) => (
                 <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl hover:border-emerald-500 transition-all group overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${viewTab === 'vehicles' ? 'bg-slate-900' : 'bg-emerald-500'}`}>
                          {viewTab === 'vehicles' ? <Icons.Truck /> : <Icons.Users />}
                       </div>
                       <span className={`px-3 py-1 rounded-full text-[7px] font-black uppercase border ${item.statusId === 'EST-01' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                          {statusOptions.find(s => s.id === item.statusId)?.name || 'ACTIVO'}
                       </span>
                    </div>
                    <h3 className="font-black text-slate-900 text-sm uppercase truncate mb-1">{viewTab === 'vehicles' ? item.plate : item.name}</h3>
                    <p className={`text-[8px] font-black uppercase mb-4 ${!validateDate(item.soatExpiry || item.licenseExpiry) ? 'text-red-500' : 'text-slate-400'}`}>
                      {viewTab === 'vehicles' ? `SOAT: ${item.soatExpiry || 'N/A'}` : `LIC: ${item.licenseExpiry || 'N/A'}`}
                    </p>
                    <button onClick={() => { setSelectedItem(item); setFormData({...item}); setModalMode('edit'); setAiError(null); setIsModalOpen(true); }} className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md">Auditar</button>
                 </div>
               ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
           <div className="flex items-center gap-3">
              <label className="text-[8px] font-black text-slate-400 uppercase">Página 1 de {totalPages || 1}</label>
           </div>
           <div className="flex items-center gap-4">
              <button disabled className="p-2 bg-white border border-slate-200 rounded-lg text-slate-300 disabled:opacity-20"><Icons.ChevronRight className="rotate-180 w-3 h-3" /></button>
              <button disabled className="p-2 bg-white border border-slate-200 rounded-lg text-slate-300 disabled:opacity-20"><Icons.ChevronRight className="w-3 h-3" /></button>
           </div>
        </div>
      </div>

      {/* MODAL FORMULARIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[500] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh] border border-white/10">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-emerald-500 text-slate-950 rounded-[1.5rem] flex items-center justify-center shadow-xl"><Icons.Scan /></div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">{modalMode === 'edit' ? 'Auditoría' : 'Registro'} M7</h3>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">CONFIGURACIÓN SEGURA</p>
                  </div>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-4xl font-thin">×</button>
            </div>

            <div className="p-10 space-y-8 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/20">
              {aiError && (
                <div className="p-6 bg-red-600 text-white rounded-[2rem] text-xs font-black uppercase flex items-center gap-4 animate-in shake">
                  <Icons.Alert /> {aiError}
                </div>
              )}

              {isProcessingAI && (
                <div className="p-10 bg-emerald-50 border-4 border-dashed border-emerald-500 rounded-[3rem] flex flex-col items-center justify-center gap-4 animate-pulse">
                   <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                   <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">M7 VISION ANALIZANDO SOPORTES...</p>
                </div>
              )}

              {viewTab === 'vehicles' ? (
                <div className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Placa</label>
                      <input type="text" required value={formData.plate || ''} onChange={e => setFormData({...formData, plate: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs" />
                    </div>
                    <SearchableSelect label="Marca" value={formData.brand} options={MASTER_BRANDS} onChange={(val: string) => setFormData({...formData, brand: val})} />
                    <SearchableSelect label="Tipo Vehículo" value={formData.vehicleTypeId} options={vehicleTypeOptions} onChange={(val: string) => setFormData({...formData, vehicleTypeId: val})} />
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Capacidad (m³)</label>
                      <input type="number" required value={formData.capacityM3 || ''} onChange={e => setFormData({...formData, capacityM3: parseFloat(e.target.value)})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs" />
                    </div>
                  </div>

                  <div className="bg-slate-900 p-8 rounded-[3rem] space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest text-center">SOAT (PDF)</p>
                        <div className="relative h-32 bg-white/5 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 overflow-hidden">
                           {formData.soatPdfUrl ? <Icons.Excel /> : <Icons.Excel />}
                           <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="application/pdf" onChange={e => handleFileUpload(e, 'soatPdfUrl')} />
                        </div>
                        <input type="date" value={formData.soatExpiry || ''} onChange={e => setFormData({...formData, soatExpiry: e.target.value})} className="w-full p-3 bg-white/10 border border-white/10 rounded-xl text-white text-[10px] font-bold" />
                      </div>
                      <div className="space-y-4">
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest text-center">TÉCNICA (PDF)</p>
                        <div className="relative h-32 bg-white/5 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 overflow-hidden">
                           <Icons.Excel />
                           <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="application/pdf" onChange={e => handleFileUpload(e, 'technoPdfUrl')} />
                        </div>
                        <input type="date" value={formData.technoExpiry || ''} onChange={e => setFormData({...formData, technoExpiry: e.target.value})} className="w-full p-3 bg-white/10 border border-white/10 rounded-xl text-white text-[10px] font-bold" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner w-full max-w-xs mx-auto">
                     <button type="button" onClick={() => setUploadMode('photos')} className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase transition-all ${uploadMode === 'photos' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>Fotos A/B</button>
                     <button type="button" onClick={() => setUploadMode('pdf')} className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase transition-all ${uploadMode === 'pdf' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>PDF</button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="md:col-span-2 space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre Completo</label>
                       <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nro Documento</label>
                       <input type="text" value={formData.documentNumber || ''} onChange={e => setFormData({...formData, documentNumber: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Vencimiento Licencia</label>
                       <input type="date" value={formData.licenseExpiry || ''} onChange={e => setFormData({...formData, licenseExpiry: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs" />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-12 py-5 bg-red-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-red-700 shadow-xl transition-all">DESCARTAR</button>
                <button onClick={handleSave} className="flex-1 bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 shadow-xl transition-all flex items-center justify-center gap-4">
                   CONFIRMAR OPERACIÓN
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
