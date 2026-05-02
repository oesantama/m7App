import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { 
    Upload, FileText, CheckCircle2, AlertCircle, ExternalLink, 
    Search, Calendar, RotateCcw, Download, X, Loader2, LayoutGrid, List
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

interface DocumentLog {
    id: number;
    fileName: string;
    clientName: string;
    clientType: string;
    driveLink: string;
    uploadDate: string;
    folderDate: string;
    userName: string;
    userId: string;
}

const colombiaToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

const GestionDocumental: React.FC = () => {
    const { user, allMasterData } = useAppStore();
    const [activeTab, setActiveTab] = useState<'upload' | 'consult'>('upload');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [history, setHistory] = useState<DocumentLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClientFilter, setSelectedClientFilter] = useState('');
    const [selectedUserFilter, setSelectedUserFilter] = useState('');
    const [folderDateFilter, setFolderDateFilter] = useState('');
    const [usersList, setUsersList] = useState<{id: string, name: string}[]>([]);

    const today = colombiaToday();
    const [uploadDate, setUploadDate] = useState<string>(today);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    const isSuper = user?.roleId === 'ROL-01' || user?.email === 'admin@millasiete.com';

    const allClients: { id: string; name: string }[] = (allMasterData.masterClientes || []).map((c: any) => ({
        id: String(c.id || c.clientId || ''),
        name: String(c.name || c.nombre || c.businessName || c.business_name || ''),
    })).filter(c => c.id && c.name);

    const authorizedClients = isSuper
        ? allClients
        : allClients.filter(c => user?.clientIds?.includes(c.id));

    useEffect(() => {
        if (authorizedClients.length === 1 && !selectedClient) {
            setSelectedClient(authorizedClients[0].id);
        }
    }, [authorizedClients.length]);

    const fetchHistory = async () => {
        try {
            const token = user?.token || '';
            const res = await axios.get('/api/documents/stats', {
                headers: { Authorization: `Bearer ${token}` },
                params: { 
                    dateFrom, 
                    dateTo, 
                    search: searchTerm, 
                    clientId: selectedClientFilter,
                    userId: selectedUserFilter,
                    folderDate: folderDateFilter
                },
            });
            if (Array.isArray(res.data)) {
                setHistory(res.data);
                // Extraer lista de usuarios única
                const uniqueUsersMap = new Map();
                res.data.forEach((h: any) => {
                    const id = h.userId || h.userName;
                    if (!uniqueUsersMap.has(id)) {
                        uniqueUsersMap.set(id, { id, name: h.userName || 'Usuario M7' });
                    }
                });
                setUsersList(Array.from(uniqueUsersMap.values()));
            }
        } catch { /* silencioso */ }
    };

    useEffect(() => { 
        if (activeTab === 'consult') fetchHistory(); 
    }, [activeTab, dateFrom, dateTo, searchTerm, selectedClientFilter, selectedUserFilter, folderDateFilter]);

    const handleUpload = async () => {
        if (!selectedClient || files.length === 0) {
            toast.error('Seleccione un cliente y al menos un archivo');
            return;
        }
        const client = authorizedClients.find(c => c.id === selectedClient);
        if (!client) return;

        setIsUploading(true);
        setUploadProgress(0);
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('clientId', client.id);
        formData.append('clientName', client.name);
        formData.append('uploadDate', uploadDate);

        try {
            const token = user?.token || '';
            await axios.post('/api/documents/upload-cumplido', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`,
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    setUploadProgress(percentCompleted);
                }
            });
            toast.success(`¡${files.length} archivo(s) subido(s) exitosamente!`);
            setFiles([]);
            setUploadProgress(0);
            setActiveTab('consult');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al subir archivos');
        } finally {
            setIsUploading(false);
        }
    };

    const calculateSLA = (uploadStr: string, folderStr: string, type: string) => {
        const upload = uploadStr ? new Date(uploadStr) : new Date();
        // Normalizar folder date a medianoche Bogota
        const folder = folderStr ? new Date(`${folderStr}T00:00:00`) : upload;
        
        const uploadMs = isNaN(upload.getTime()) ? Date.now() : upload.getTime();
        const folderMs = isNaN(folder.getTime()) ? uploadMs : folder.getTime();
        
        const diffMs = uploadMs - folderMs;
        const diffHours = diffMs / (1000 * 60 * 60);
        
        const limit = type === 'NACIONAL' ? 72 : 24;
        return {
            diffHours: isNaN(diffHours) ? 0 : diffHours,
            status: diffHours <= limit ? 'SUCCESS' : 'LATE',
            limit
        };
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '---';
        // Añadir T12:00:00 para evitar saltos de día por zona horaria al parsear YYYY-MM-DD
        const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
        const d = new Date(normalized);
        if (isNaN(d.getTime())) return '---';
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const exportToExcel = () => {
        if (history.length === 0) return;
        import('xlsx').then(XLSX => {
            const data = history.map(h => {
                const { diffHours, status } = calculateSLA(h.uploadDate, h.folderDate, h.clientType);
                return {
                    'Archivo': h.fileName,
                    'Cliente': h.clientName,
                    'Tipo Cliente': h.clientType,
                    'Usuario': h.userName,
                    'Fecha Carpeta': h.folderDate,
                    'Fecha Subida': `${formatDate(h.uploadDate)} ${formatTime(h.uploadDate)}`,
                    'Tiempo Respuesta (Horas)': diffHours.toFixed(1),
                    'Estado SLA': status === 'SUCCESS' ? 'A TIEMPO' : 'FUERA DE TIEMPO'
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Trazabilidad");
            XLSX.writeFile(wb, `Trazabilidad_Drive_${Date.now()}.xlsx`);
        });
    };

    const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const refDate = (uploadDate && !isNaN(new Date(uploadDate).getTime())) ? new Date(`${uploadDate}T12:00:00`) : new Date();
    const selectedClientName = authorizedClients.find(c => c.id === selectedClient)?.name || '';
    const cleanClientName = selectedClientName.replace(/[^a-zA-Z0-9 ()-]/g, '').trim();

    const currentPathPreview = selectedClient
        ? `CUMPLIDOS MILLA 7/${refDate.getFullYear()}/${cleanClientName}/${(MESES_ES[refDate.getMonth()] || 'MES').toUpperCase()}/DIA ${refDate.getDate()}`
        : 'Seleccione un cliente para ver la ruta';

    return (
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">CUMPLIDOS DRIVE PRO</h1>
                    <p className="text-slate-500 font-bold flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                        Gestión de Documentación y Trazabilidad SLA
                    </p>
                </div>
                
                <div className="flex bg-slate-100 p-1.5 rounded-[2rem] shadow-inner w-full lg:w-auto">
                    <button 
                        onClick={() => setActiveTab('upload')}
                        className={`flex-1 lg:flex-none px-8 py-3 rounded-[1.75rem] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all
                            ${activeTab === 'upload' ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Upload size={18} /> Cargar Soporte
                    </button>
                    <button 
                        onClick={() => setActiveTab('consult')}
                        className={`flex-1 lg:flex-none px-8 py-3 rounded-[1.75rem] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all
                            ${activeTab === 'consult' ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <List size={18} /> Consultar Drive
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative min-h-[600px]">
                {/* Overlay de Carga con Progreso Real */}
                {isUploading && (
                    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-md rounded-[3rem] flex flex-col items-center justify-center p-10 animate-in fade-in zoom-in duration-300">
                        <div className="w-full max-w-md space-y-6 text-center">
                            <div className="relative inline-block">
                                <div className="w-24 h-24 border-8 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center font-black text-indigo-600 text-lg">
                                    {uploadProgress}%
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-slate-900 uppercase">Sincronizando con Drive</h3>
                                <p className="text-slate-500 font-medium">Comprimiendo y transfiriendo {files.length} archivos...</p>
                            </div>
                            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out" 
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: UPLOAD */}
                {activeTab === 'upload' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-5 duration-500">
                        <div className="lg:col-span-4 space-y-6">
                            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-6">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2">1. Entidad / Cliente</label>
                                    <div className="relative">
                                        <select
                                            className="w-full p-5 rounded-[1.5rem] border-2 border-slate-50 bg-slate-50 font-black text-slate-800 focus:border-indigo-500 focus:bg-white transition-all outline-none appearance-none"
                                            value={selectedClient}
                                            onChange={e => setSelectedClient(e.target.value)}
                                        >
                                            <option value="">SELECCIONAR CLIENTE</option>
                                            {authorizedClients.map(client => (
                                                <option key={client.id} value={client.id}>{client.name}</option>
                                            ))}
                                        </select>
                                        <LayoutGrid size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2">2. Fecha de Carpeta Destino</label>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            className="w-full p-5 rounded-[1.5rem] border-2 border-slate-50 bg-slate-50 font-black text-slate-800 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                                            value={uploadDate}
                                            max={today}
                                            onChange={e => setUploadDate(e.target.value)}
                                        />
                                        <Calendar size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="bg-slate-900 text-white p-6 rounded-[2rem] space-y-3 relative overflow-hidden group shadow-2xl">
                                    <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-opacity rotate-12"><FileText size={120} /></div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                                        <span className="text-[10px] uppercase font-black text-indigo-400 tracking-widest">Ruta Inteligente IQ</span>
                                    </div>
                                    <p className="text-[11px] font-mono leading-relaxed text-slate-400 break-all">{currentPathPreview}</p>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-8 space-y-6">
                            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 h-full flex flex-col">
                                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2 mb-6">3. Área de Carga Paralela</label>
                                
                                <div
                                    className={`flex-1 border-4 border-dashed rounded-[3rem] p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-6 min-h-[300px]
                                        ${files.length > 0 ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-100 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30'}`}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => {
                                        e.preventDefault();
                                        if (e.dataTransfer.files) setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)].slice(0, 10));
                                    }}
                                >
                                    <input type="file" id="file-upload" className="hidden" accept=".pdf" multiple onChange={e => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files)].slice(0, 10))} />
                                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-6">
                                        <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all shadow-2xl
                                            ${files.length > 0 ? 'bg-emerald-500 text-white scale-110' : 'bg-white text-slate-300 group-hover:text-indigo-500'}`}>
                                            <Upload size={40} />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Suelta tus PDFs aquí</h4>
                                            <p className="text-sm text-slate-500 font-medium">Hasta 10 archivos simultáneos para procesamiento paralelo</p>
                                        </div>
                                    </label>
                                </div>

                                {files.length > 0 && (
                                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                        {files.map((f, i) => (
                                            <div key={i} className="flex justify-between items-center p-4 bg-white border-2 border-slate-50 rounded-2xl animate-in zoom-in-95 duration-200">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="bg-rose-50 p-2 rounded-lg text-rose-500"><FileText size={16}/></div>
                                                    <span className="text-xs font-black text-slate-700 truncate">{f.name}</span>
                                                </div>
                                                <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-rose-500 p-2 transition-colors"><X size={18}/></button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-8">
                                    <button
                                        onClick={handleUpload}
                                        disabled={files.length === 0 || !selectedClient || isUploading}
                                        className={`w-full py-6 rounded-[2rem] font-black text-[13px] uppercase tracking-widest text-white shadow-2xl transition-all flex items-center justify-center gap-3
                                            ${(files.length === 0 || !selectedClient || isUploading)
                                                ? 'bg-slate-200 cursor-not-allowed text-slate-400'
                                                : 'bg-indigo-600 hover:bg-indigo-500 hover:-translate-y-1 shadow-indigo-500/40'}`}
                                    >
                                        {isUploading ? <Loader2 className="animate-spin" size={24} /> : <><CheckCircle2 size={24} /> INICIAR TRANSFERENCIA MASIVA</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: CONSULT */}
                {activeTab === 'consult' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500">
                        {/* Filtros Premium */}
                        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Desde (Cargue)</label>
                                    <input type="date" className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Hasta (Cargue)</label>
                                    <input type="date" className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Día Carpeta</label>
                                    <input type="date" className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all" value={folderDateFilter} onChange={e => setFolderDateFilter(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cliente</label>
                                    <select 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all appearance-none"
                                        value={selectedClientFilter}
                                        onChange={e => setSelectedClientFilter(e.target.value)}
                                    >
                                        <option value="">TODOS LOS CLIENTES</option>
                                        {authorizedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Usuario</label>
                                    <select 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all appearance-none"
                                        value={selectedUserFilter}
                                        onChange={e => setSelectedUserFilter(e.target.value)}
                                    >
                                        <option value="">TODOS LOS USUARIOS</option>
                                        {usersList.map((u, i) => <option key={u.id || i} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Buscar</label>
                                    <div className="relative">
                                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Nombre de archivo..."
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabla de Resultados Responsive */}
                        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full border-collapse min-w-[1000px]">
                                    <thead>
                                        <tr className="bg-slate-50/50">
                                            <th className="px-8 py-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">SLA</th>
                                            <th className="px-6 py-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Documento & Cargue</th>
                                            <th className="px-6 py-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                            <th className="px-6 py-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Usuario Responsable</th>
                                            <th className="px-6 py-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Carpeta Origen</th>
                                            <th className="px-6 py-6 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Respuesta Neta</th>
                                            <th className="px-8 py-6 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Nube</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {history.map(h => {
                                            const { diffHours, status } = calculateSLA(h.uploadDate, h.folderDate, h.clientType);
                                            return (
                                                <tr key={h.id} className="hover:bg-slate-50/50 transition-all group">
                                                    <td className="px-8 py-6">
                                                        <div className={`w-4 h-4 rounded-full shadow-lg ${status === 'SUCCESS' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-rose-500 shadow-rose-500/20'}`} 
                                                             title={status === 'SUCCESS' ? 'Cumple SLA' : 'Fuera de Tiempo'} />
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="bg-slate-50 p-3 rounded-2xl text-slate-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                                                <FileText size={20} />
                                                            </div>
                                                            <div className="flex flex-col max-w-[200px]">
                                                                <span className="font-black text-slate-800 text-[13px] truncate">{h.fileName}</span>
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase">{formatDate(h.uploadDate)} @ {formatTime(h.uploadDate)}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-slate-700 text-[12px] uppercase">{h.clientName}</span>
                                                            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full w-fit mt-1 shadow-sm ${h.clientType === 'NACIONAL' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {h.clientType}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <span className="text-slate-500 text-[11px] font-black uppercase tracking-tight">{h.userName}</span>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar size={12} className="text-slate-400" />
                                                            <span className="text-slate-800 text-[12px] font-black">{formatDate(h.folderDate)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex flex-col">
                                                            <span className={`text-[13px] font-black ${status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {Math.floor(diffHours)}h {Math.round((diffHours % 1) * 60)}m
                                                            </span>
                                                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">SLA: {status === 'SUCCESS' ? 'EFECTIVO' : 'CRÍTICO'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6 text-center">
                                                        <a href={h.driveLink} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-[1.25rem] transition-all inline-flex items-center justify-center shadow-sm">
                                                            <ExternalLink size={20} />
                                                        </a>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {history.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-32 gap-6 bg-slate-50/20">
                                    <div className="w-32 h-32 bg-white rounded-[3rem] shadow-xl flex items-center justify-center text-slate-100">
                                        <Search size={64} />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <h3 className="text-slate-800 font-black uppercase tracking-widest text-lg">Inicia una consulta</h3>
                                        <p className="text-slate-400 text-sm font-medium">Usa los filtros superiores para auditar la trazabilidad del Drive.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GestionDocumental;
