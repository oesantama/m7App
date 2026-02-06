
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { Driver, User, MasterCategory, MasterRecord } from '../types';
import { extractLicenseInfo } from '../services/geminiService';
import * as XLSX from 'xlsx';

interface DriverManagerProps {
  drivers: Driver[];
  user: User;
  masterData: { [key in MasterCategory]?: MasterRecord[] };
  onAdd: (d: Partial<Driver>) => void;
  onUpdate: (id: string, data: Partial<Driver>) => void;
}

const DriverManager: React.FC<DriverManagerProps> = ({ drivers, user, masterData, onAdd, onUpdate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayType, setDisplayType] = useState<'table' | 'grid'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Driver | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [uploadMode, setUploadMode] = useState<'photos' | 'pdf'>('photos');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const docTypeOptions = masterData['masterTipoDocumento'] || [];

  const handleExportExcel = () => {
    const dataToExport = drivers.map(d => ({
      Nombre: d.name, Documento: `${d.documentType} ${d.documentNumber}`, 
      Telefono: d.phone, Licencia_Vence: d.licenseExpiry, Estado: d.status
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Talento");
    XLSX.writeFile(wb, `M7_Talento_${Date.now()}.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const nextData = { ...formData, [field]: base64 };
      setFormData(nextData);

      if (uploadMode === 'pdf' && field === 'licensePdf') {
        processIA([{ data: base64, mimeType: file.type }], nextData.documentNumber);
      } else if (uploadMode === 'photos') {
        if (field === 'licenseSideA' && nextData.licenseSideB) {
          processIA([{ data: base64, mimeType: file.type }, { data: nextData.licenseSideB, mimeType: 'image/jpeg' }], nextData.documentNumber);
        } else if (field === 'licenseSideB' && nextData.licenseSideA) {
          processIA([{ data: nextData.licenseSideA, mimeType: 'image/jpeg' }, { data: base64, mimeType: file.type }], nextData.documentNumber);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const processIA = async (files: any[], expectedDoc?: string) => {
    setIsProcessingAI(true);
    setAiError(null);
    try {
      const result = await extractLicenseInfo(files);
      if (result.success && result.data) {
        // VALIDACIÓN DE DOCUMENTO SEGÚN FORMULARIO
        if (expectedDoc && result.data.documentNumber !== expectedDoc) {
           setAiError(`CRÍTICO M7 Vision: El documento ${result.data.documentNumber} no coincide con el registrado.`);
           setIsProcessingAI(false);
           return;
        }

        setFormData(prev => ({
          ...prev,
          name: result.data.fullName || prev.name,
          documentNumber: result.data.documentNumber || prev.documentNumber,
          licenseExpiry: result.data.expiry || prev.licenseExpiry
        }));
      } else { setAiError(result.error || "Error interpretando licencia."); }
    } catch (e) { setAiError("Falla en M7 Vision."); }
    setIsProcessingAI(false);
  };

  const filtered = drivers.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const commonInput = "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all";

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* HEADER DINÁMICO */}
      <div className="bg-white px-8 py-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 h-12 px-5 rounded-2xl flex items-center gap-3 border border-slate-100">
            <Icons.Search className="text-slate-300 w-4 h-4" />
            <input type="text" placeholder="BUSCAR NOMBRE..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent outline-none font-black text-[10px] uppercase w-48" />
          </div>
          <button onClick={() => { setEditingItem(null); setFormData({ status: 'Activo' }); setAiError(null); setIsModalOpen(true); }} className="bg-slate-900 text-white px-10 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg">NUEVO CONDUCTOR</button>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner h-12 relative w-24">
            <button onClick={() => setDisplayType('table')} className={`flex-1 p-2 rounded-xl transition-all relative z-10 ${displayType === 'table' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.List className="mx-auto" /></button>
            <button onClick={() => setDisplayType('grid')} className={`flex-1 p-2 rounded-xl transition-all relative z-10 ${displayType === 'grid' ? 'text-slate-900' : 'text-slate-400'}`}><Icons.Grid className="mx-auto" /></button>
            <div className={`absolute top-1 bottom-1 w-[44px] bg-white rounded-xl shadow-md transition-all duration-300 ${displayType === 'table' ? 'left-1' : 'left-[47px]'}`}></div>
          </div>
          <button onClick={handleExportExcel} className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><Icons.Excel /></button>
          <div className="h-10 w-[1px] bg-slate-100 mx-2"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">M7 TALENT: {drivers.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
        {displayType === 'table' ? (
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest">
              <tr>
                <th className="p-6">Nombre / Identificación</th>
                <th className="p-6">Teléfono</th>
                <th className="p-6">Vencimiento Licencia</th>
                <th className="p-6 text-center">Estado</th>
                <th className="p-6 text-right pr-12">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors font-bold group">
                  <td className="p-6">
                    <p className="font-black text-slate-900 text-sm">{d.name}</p>
                    <p className="text-[9px] text-slate-400 uppercase">{d.documentType}: {d.documentNumber}</p>
                  </td>
                  <td className="p-6 text-slate-600">{d.phone}</td>
                  <td className="p-6 font-black text-slate-900">{d.licenseExpiry || 'N/A'}</td>
                  <td className="p-6 text-center">
                    <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase border ${d.status === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{d.status}</span>
                  </td>
                  <td className="p-6 text-right pr-12 flex items-center justify-end gap-2">
                     <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all"><Icons.Eye /></button>
                     <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><Icons.Link /></button>
                     <button onClick={() => { setEditingItem(d); setFormData(d); setIsModalOpen(true); }} className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-blue-600 shadow-md"><Icons.Audit /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map(d => (
              <div key={d.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl hover:border-emerald-500 transition-all group overflow-hidden">
                 <div className="flex justify-between items-start mb-6">
                   <div className="w-12 h-12 bg-emerald-500 text-slate-900 rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-slate-900 group-hover:text-white transition-all"><Icons.Users /></div>
                   <div className="flex gap-1.5">
                     <button className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-900 hover:text-white transition-all"><Icons.Eye /></button>
                     <button className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"><Icons.Link /></button>
                   </div>
                 </div>
                 <h3 className="font-black text-slate-900 text-lg uppercase mb-1">{d.name}</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase mb-4">{d.documentType}: {d.documentNumber}</p>
                 <div className="space-y-1 mb-6">
                   <p className="text-[9px] font-black text-slate-500 uppercase">LICENCIA VENCE: <span className="text-slate-900">{d.licenseExpiry || 'N/A'}</span></p>
                   <p className="text-[9px] font-black text-slate-500 uppercase">TEL: <span className="text-slate-900">{d.phone || 'S/I'}</span></p>
                 </div>
                 <button onClick={() => { setEditingItem(d); setFormData(d); setIsModalOpen(true); }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all">Auditar Talento</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col my-auto border border-white/10 animate-in zoom-in-95">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 text-slate-900 rounded-xl flex items-center justify-center shadow-xl"><Icons.Scan /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none">REGISTRO M7</h3>
                  <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">IDENTIDAD SEGURA</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-3xl font-thin hover:text-red-500 transition-all">&times;</button>
            </div>

            <div className="p-10 space-y-10 bg-slate-50/30 overflow-y-auto flex-1 custom-scrollbar">
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
                      <div className="flex flex-col items-center gap-3"><Icons.Excel className="text-white/20 w-8 h-8" /><span className="text-[10px] font-black text-white/40 uppercase">Vincular Documento</span></div>
                      <input type="file" className="hidden" accept="application/pdf" onChange={e => handleFileUpload(e, 'licensePdf')} />
                    </label>
                  </div>
                )}
                {isProcessingAI && <p className="text-center text-emerald-500 text-[8px] font-black uppercase mt-4 animate-pulse">M7 Vision Procesando...</p>}
                {uploadMode === 'photos' && (!formData.licenseSideA || !formData.licenseSideB) && <p className="text-center text-amber-500 text-[8px] font-black uppercase mt-4 animate-pulse">Cargue ambas caras para auditoría IA</p>}
              </div>

              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Nombre Completo</label>
                  <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})} placeholder="Nombre..." className={commonInput} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Tipo Documento</label>
                    <select value={formData.documentType || ''} onChange={e => setFormData({...formData, documentType: e.target.value})} className={commonInput}>
                      <option value="">Seleccione...</option>{docTypeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Nro Documento</label>
                    <input 
                      type="text" 
                      value={formData.documentNumber || ''} 
                      readOnly={!!editingItem}
                      onChange={e => setFormData({...formData, documentNumber: e.target.value})} 
                      className={`${commonInput} ${editingItem ? 'bg-slate-100 cursor-not-allowed opacity-60' : ''}`} 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Vencimiento Licencia</label>
                    <input type="date" value={formData.licenseExpiry || ''} readOnly className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl text-[11px] font-black text-emerald-600 cursor-not-allowed" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Categoría de Licencia</label>
                    <select value={formData.licenseCategory || ''} onChange={e => setFormData({...formData, licenseCategory: e.target.value})} className={commonInput}>
                      <option value="">Seleccione...</option>
                      <option value="A1">A1</option><option value="A2">A2</option>
                      <option value="B1">B1</option><option value="B2">B2</option><option value="B3">B3</option>
                      <option value="C1">C1</option><option value="C2">C2</option><option value="C3">C3</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Número Telefónico</label>
                    <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+57 ..." className={commonInput} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Estado Operativo</label>
                    <select value={formData.statusId || 'EST-01'} onChange={e => setFormData({...formData, statusId: e.target.value})} className={commonInput}>
                      <option value="EST-01">ACTIVO</option>
                      <option value="EST-02">INACTIVO</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-8 flex flex-col md:flex-row gap-6">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 bg-red-600 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all active:scale-95">DESCARTAR</button>
                <button onClick={() => { if (editingItem) onUpdate(editingItem.id, formData); else onAdd(formData); setIsModalOpen(false); }} className="flex-[2] py-6 bg-slate-900 text-white rounded-[2rem] font-black text-[11px] uppercase tracking-widest shadow-2xl hover:bg-emerald-600 transition-all active:scale-95">CONFIRMAR CONDUCTOR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverManager;
