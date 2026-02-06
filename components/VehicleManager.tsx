
import React, { useState, useMemo } from 'react';
import { Icons, MASTER_BRANDS } from '../constants';
import { Vehicle, User, MasterCategory, MasterRecord } from '../types';
import { extractVehicleDocInfo } from '../services/geminiService';
import * as XLSX from 'xlsx';

interface VehicleManagerProps {
  vehicles: Vehicle[];
  user: User;
  masterData: { [key in MasterCategory]?: MasterRecord[] };
  onAdd: (v: Partial<Vehicle>) => void;
  onUpdate: (id: string, data: Partial<Vehicle>) => void;
}

const VehicleManager: React.FC<VehicleManagerProps> = ({ vehicles, user, masterData, onAdd, onUpdate, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayType, setDisplayType] = useState<'table' | 'grid'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<Vehicle | null>(null);

  const vehicleTypeOptions = masterData['masterTiposVehiculo'] || [];

  const handleExportExcel = () => {
    const dataToExport = vehicles.map(v => ({
      Placa: v.plate, Marca: v.brand, Propietario: v.owner, 
      SOAT_Vence: v.soatExpiry, Tecno_Vence: v.technoExpiry, Capacidad: v.capacityM3
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flota");
    XLSX.writeFile(wb, `M7_Flota_${Date.now()}.xlsx`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'soatPdfUrl' | 'technoPdfUrl') => {
    const file = e.target.files?.[0];
    if (!file || !formData.plate) {
      if (!formData.plate) setAiError("ERROR: Ingrese la PLACA antes de cargar documentos.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setFormData(prev => ({ ...prev, [field]: base64 }));
      setIsProcessingAI(true);
      setAiError(null);
      try {
        const docType = field === 'soatPdfUrl' ? 'SOAT' : 'Techno';
        const result = await extractVehicleDocInfo({ data: base64, mimeType: file.type }, formData.plate, docType);
        if (result.plateMatches) {
          const expiryField = field === 'soatPdfUrl' ? 'soatExpiry' : 'technoExpiry';
          setFormData(prev => ({ 
            ...prev, 
            [expiryField]: result.expiryDate,
            brand: docType === 'SOAT' ? (result.brand || prev.brand) : prev.brand
          }));
        } else {
          setAiError(`M7 Vision: La placa en el documento (${result.plateFound || 'N/A'}) no coincide.`);
          setFormData(prev => ({ ...prev, [field]: null }));
        }
      } catch (e) { setAiError("Error en análisis IA."); }
      setIsProcessingAI(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = () => {
    if (recordToDelete) {
      onDelete(recordToDelete.id);
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
    }
  };

  const filtered = vehicles.filter(v => v.plate.toLowerCase().includes(searchTerm.toLowerCase()));
  const commonInput = "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all";

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* HEADER DINÁMICO */}
      <div className="bg-white px-8 py-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 h-12 px-5 rounded-2xl flex items-center gap-3 border border-slate-100">
            <Icons.Search className="text-slate-300 w-4 h-4" />
            <input type="text" placeholder="BUSCAR PLACA..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent outline-none font-black text-[10px] uppercase w-48" />
          </div>
          <button onClick={() => { setEditingItem(null); setFormData({ statusId: 'EST-01' }); setAiError(null); setIsModalOpen(true); }} className="bg-slate-900 text-white px-10 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg">NUEVO VEHÍCULO</button>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-12 relative w-24">
            <button onClick={() => setDisplayType('table')} className={`flex-1 p-2 rounded-xl transition-all relative z-10 ${displayType === 'table' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.List className="mx-auto" /></button>
            <button onClick={() => setDisplayType('grid')} className={`flex-1 p-2 rounded-xl transition-all relative z-10 ${displayType === 'grid' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.Grid className="mx-auto" /></button>
            <div className={`absolute top-1 bottom-1 w-[44px] bg-white rounded-xl shadow-md transition-all duration-300 ${displayType === 'table' ? 'left-1' : 'left-[47px]'}`}></div>
          </div>
          <button onClick={handleExportExcel} className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><Icons.Excel /></button>
          <div className="h-10 w-[1px] bg-slate-100 mx-2"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TOTAL FLOTA: {vehicles.length}</p>
        </div>
      </div>

      {/* VISTA DE CONTENIDO */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
        {displayType === 'table' ? (
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest">
              <tr>
                <th className="p-6">Placa / Marca</th>
                <th className="p-6">Propietario</th>
                <th className="p-6">SOAT (Exp)</th>
                <th className="p-6">TECNO (Exp)</th>
                <th className="p-6 text-center">Capacidad</th>
                <th className="p-6 text-right pr-12">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(v => (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors font-bold group">
                  <td className="p-6">
                    <p className="font-black text-slate-900 text-sm">{v.plate}</p>
                    <p className="text-[9px] text-slate-400 uppercase">{v.brand}</p>
                  </td>
                  <td className="p-6 uppercase text-slate-600">{v.owner}</td>
                  <td className="p-6">
                    <span className={`px-3 py-1 rounded-lg ${!v.soatExpiry ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-900'}`}>{v.soatExpiry || 'PENDIENTE'}</span>
                  </td>
                  <td className="p-6">
                    <span className={`px-3 py-1 rounded-lg ${!v.technoExpiry ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-900'}`}>{v.technoExpiry || 'PENDIENTE'}</span>
                  </td>
                  <td className="p-6 text-center text-emerald-600 font-black">{v.capacityM3}m³</td>
                  <td className="p-6 text-right pr-12 flex items-center justify-end gap-2">
                    <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all"><Icons.Eye /></button>
                    <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><Icons.Link /></button>
                    <button onClick={() => { setEditingItem(v); setFormData(v); setIsModalOpen(true); }} className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-blue-600 shadow-md"><Icons.Audit /></button>
                    <button onClick={() => { setRecordToDelete(v); setShowDeleteConfirm(true); }} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Icons.Trash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map(v => (
              <div key={v.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl hover:border-emerald-500 transition-all group overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-emerald-500 transition-all"><Icons.Truck /></div>
                  <div className="flex gap-1.5">
                    <button className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-900 hover:text-white"><Icons.Eye /></button>
                    <button className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-emerald-500 hover:text-white"><Icons.Link /></button>
                    <button onClick={() => { setRecordToDelete(v); setShowDeleteConfirm(true); }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-all"><Icons.Trash /></button>
                  </div>
                </div>
                <h3 className="font-black text-slate-900 text-xl uppercase mb-1">{v.plate}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-4">{v.brand} • {v.capacityM3}m³</p>
                <div className="space-y-2 mb-6">
                  <p className="text-[9px] font-black text-slate-500 uppercase">SOAT: <span className="text-slate-900">{v.soatExpiry || 'N/A'}</span></p>
                  <p className="text-[9px] font-black text-slate-500 uppercase">TECNO: <span className="text-slate-900">{v.technoExpiry || 'N/A'}</span></p>
                </div>
                <button onClick={() => { setEditingItem(v); setFormData(v); setIsModalOpen(true); }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all">Auditar Registro</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL M7 REGISTRO SEGURO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/10 animate-in zoom-in-95">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 text-slate-900 rounded-xl flex items-center justify-center shadow-xl"><Icons.Scan /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none">REGISTRO M7</h3>
                  <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">OPERACIÓN SEGURA</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-3xl font-thin hover:text-red-500 transition-all">&times;</button>
            </div>

            <div className="p-10 space-y-10 bg-slate-50/30 overflow-y-auto flex-1 custom-scrollbar">
              {aiError && <div className="p-6 bg-red-600 text-white rounded-[2rem] text-[10px] font-black uppercase text-center animate-in shake">{aiError}</div>}
              {isProcessingAI && <div className="p-8 bg-emerald-50 border-4 border-dashed border-emerald-500 rounded-[3rem] text-center font-black text-[10px] text-emerald-700 animate-pulse uppercase tracking-widest">M7 Vision Analizando Documentos...</div>}
              
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Placa</label>
                  <input 
                    type="text" 
                    value={formData.plate || ''} 
                    readOnly={!!editingItem}
                    onChange={e => setFormData({...formData, plate: e.target.value.toUpperCase()})} 
                    className={`${commonInput} ${editingItem ? 'bg-slate-100 cursor-not-allowed opacity-60' : ''}`} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Marca</label>
                  <select value={formData.brand || ''} onChange={e => setFormData({...formData, brand: e.target.value})} className={commonInput}>
                    <option value="">Seleccione...</option>{MASTER_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo de Vehículo</label>
                  <select value={formData.vehicleTypeId || ''} onChange={e => setFormData({...formData, vehicleTypeId: e.target.value})} className={commonInput}>
                    <option value="">Seleccione...</option>{vehicleTypeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Cliente Asignado</label>
                  <select 
                    value={formData.clientId || ''} 
                    onChange={e => setFormData({...formData, clientId: e.target.value})} 
                    className={commonInput}
                  >
                    <option value="">-- FLOTA GLOBAL (TODOS) --</option>
                    {(masterData['masterClientes'] || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Capacidad (m³)</label>
                  <input type="number" value={formData.capacityM3 || ''} onChange={e => setFormData({...formData, capacityM3: Number(e.target.value)})} className={commonInput} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Año Modelo</label>
                  <input type="number" value={formData.modelYear || ''} onChange={e => setFormData({...formData, modelYear: Number(e.target.value)})} placeholder="Ej: 2024" className={commonInput} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Color</label>
                  <input type="text" value={formData.color || ''} onChange={e => setFormData({...formData, color: e.target.value.toUpperCase()})} placeholder="Blanco, Gris..." className={commonInput} />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Propietario / Dueño</label>
                  <input type="text" value={formData.owner || ''} onChange={e => setFormData({...formData, owner: e.target.value.toUpperCase()})} className={commonInput} />
                </div>
              </div>

              {/* GESTION DE SOPORTES CON IA */}
              <div className="bg-slate-900 p-10 rounded-[3.5rem] shadow-inner space-y-8">
                <p className="text-[10px] font-black text-emerald-400 uppercase text-center tracking-[0.4em]">Soportes Legales Auditados</p>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className={`h-32 bg-white/5 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all ${formData.soatPdfUrl ? 'border-emerald-500' : 'border-white/10'}`}>
                      <Icons.Excel className="text-white/20 w-8 h-8 mb-2" /><span className="text-[9px] font-black text-white/40 uppercase">{formData.soatPdfUrl ? 'SOAT CARGADO' : 'SUBIR SOAT PDF'}</span>
                      <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'soatPdfUrl')} />
                    </label>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Vencimiento SOAT (Automático)</label>
                      <input type="date" value={formData.soatExpiry || ''} readOnly className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-emerald-400 text-xs font-black cursor-not-allowed" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className={`h-32 bg-white/5 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all ${formData.technoPdfUrl ? 'border-blue-500' : 'border-white/10'}`}>
                      <Icons.Excel className="text-white/20 w-8 h-8 mb-2" /><span className="text-[9px] font-black text-white/40 uppercase">{formData.technoPdfUrl ? 'TECNO CARGADA' : 'SUBIR TECNO PDF'}</span>
                      <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'technoPdfUrl')} />
                    </label>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase ml-2">Vencimiento Tecno (Automático)</label>
                      <input type="date" value={formData.technoExpiry || ''} readOnly className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-blue-400 text-xs font-black cursor-not-allowed" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 flex flex-col md:flex-row gap-6">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 bg-red-600 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all active:scale-95">DESCARTAR</button>
                <button onClick={() => { if (editingItem) onUpdate(editingItem.id, formData); else onAdd(formData); setIsModalOpen(false); }} className="flex-[2] py-6 bg-slate-900 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest shadow-2xl hover:bg-emerald-600 transition-all active:scale-95">CONFIRMAR OPERACIÓN</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleManager;
