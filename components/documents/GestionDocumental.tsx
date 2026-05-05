import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { 
    Upload, FileText, CheckCircle2, AlertCircle, ExternalLink, 
    Search, Calendar, RotateCcw, Download, X, Loader2, LayoutGrid, List, Edit2, Trash2, FolderSearch, Link
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
    isDeleted?: boolean;
    deleteReason?: string;
}

const colombiaToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

const GestionDocumental: React.FC = () => {
    const { user, allMasterData } = useAppStore();
    const [activeTab, setActiveTab] = useState<'upload' | 'consult' | 'explore'>('upload');
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isConsulting, setIsConsulting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [history, setHistory] = useState<DocumentLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClientFilter, setSelectedClientFilter] = useState('');
    const [selectedUserFilter, setSelectedUserFilter] = useState('');
    const [folderDateFilter, setFolderDateFilter] = useState('');
    const [usersList, setUsersList] = useState<{id: string, name: string}[]>([]);
    const [localClients, setLocalClients] = useState<{id: string; name: string}[]>([]);

    const today = colombiaToday();
    const [uploadDate, setUploadDate] = useState<string>(today);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    // Explore States
    const [exploreYear, setExploreYear] = useState<string>(new Date().getFullYear().toString());
    const [exploreClient, setExploreClient] = useState<string>('');
    const [exploreFiles, setExploreFiles] = useState<any[]>([]);
    const [isExploring, setIsExploring] = useState(false);
    const [explorePath, setExplorePath] = useState('');

    const isSuper = user?.roleId === 'ROL-01' || user?.email === 'admin@millasiete.com';
    const hasEditPermission = isSuper || user?.permissions?.some((p: any) => p.module === 'PAG-45' && p.actions.includes('edit'));

    // Fetch clients directly if masterClientes not yet hydrated
    useEffect(() => {
        const token = user?.token || localStorage.getItem('token') || '';
        axios.get('/api/clients', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                if (Array.isArray(res.data)) {
                    setLocalClients(res.data.map((c: any) => ({
                        id: String(c.id || ''),
                        name: String(c.name || c.nombre || c.business_name || ''),
                    })).filter((c: any) => c.id && c.name));
                }
            }).catch(() => {});
    }, [user?.token]);

    const masterList = (allMasterData.masterClientes || []).length > 0
        ? allMasterData.masterClientes
        : localClients;

    const allClients: { id: string; name: string }[] = masterList.map((c: any) => ({
        id: String(c.id || c.clientId || ''),
        name: String(c.name || c.nombre || c.businessName || c.business_name || ''),
    })).filter((c: any) => c.id && c.name);

    // Normalize clientIds to strings to avoid number/string mismatch from DB
    const userClientIds = (user?.clientIds || (user?.clientId ? [user.clientId] : []))
        .map((id: any) => String(id));
    const authorizedClients = isSuper
        ? allClients
        : allClients.filter(c => userClientIds.includes(String(c.id)));

    useEffect(() => {
        if (authorizedClients.length === 1 && !selectedClient) {
            setSelectedClient(authorizedClients[0].id);
        }
    }, [authorizedClients.length]);

    const fetchHistory = useCallback(async () => {
        setIsConsulting(true);
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
        } catch { 
            toast.error("Error al consultar el Drive");
        } finally {
            setIsConsulting(false);
        }
    }, [user?.token, dateFrom, dateTo, searchTerm, selectedClientFilter, selectedUserFilter, folderDateFilter]);

    // Solo cargar automáticamente al entrar a la pestaña si no hay datos
    useEffect(() => { 
        if (activeTab === 'consult' && history.length === 0) {
            fetchHistory(); 
        }
    }, [activeTab]);

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
            fetchHistory();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al subir archivos');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRename = async (doc: DocumentLog) => {
        const newName = window.prompt("Ingrese el nuevo nombre para el archivo:", doc.fileName);
        if (!newName || newName.trim() === '' || newName === doc.fileName) return;

        try {
            const token = user?.token || '';
            const res = await axios.put(`/api/documents/cumplido/${doc.id}/rename`, { newName }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Archivo renombrado exitosamente");
            fetchHistory();
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Error al renombrar el archivo");
        }
    };

    const handleDelete = async (doc: DocumentLog) => {
        const reason = window.prompt("Por favor, ingrese el motivo de la eliminación:");
        if (!reason || reason.trim() === '') {
            toast.error("Debe ingresar un motivo para eliminar.");
            return;
        }

        if (window.confirm(`¿Está seguro que desea eliminar del drive el archivo: ${doc.fileName}?`)) {
            try {
                const token = user?.token || '';
                await axios.delete(`/api/documents/cumplido/${doc.id}/delete`, {
                    headers: { Authorization: `Bearer ${token}` },
                    data: { reason }
                });
                toast.success("Archivo eliminado exitosamente");
                fetchHistory();
            } catch (error: any) {
                toast.error(error.response?.data?.error || "Error al eliminar el archivo");
            }
        }
    };

    const handleExplore = async () => {
        if (!exploreYear || !exploreClient) {
            toast.error('Seleccione un cliente y un año');
            return;
        }
        setIsExploring(true);
        try {
            const token = user?.token || '';
            const clientObj = authorizedClients.find(c => c.id === exploreClient);
            const res = await axios.get('/api/documents/drive-explorer', {
                headers: { Authorization: `Bearer ${token}` },
                params: { year: exploreYear, clientName: clientObj?.name }
            });
            setExploreFiles(res.data.files || []);
            setExplorePath(res.data.path || '');
            if (res.data.files?.length === 0) toast.info('No se encontraron archivos en esa ruta.');
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Error al explorar Drive");
        } finally {
            setIsExploring(false);
        }
    };

    const handleOpenDriveLink = async (filePath: string) => {
        try {
            const token = user?.token || '';
            const toastId = toast.loading('Obteniendo enlace seguro de Google Drive...');
            const res = await axios.post('/api/documents/drive-link', {
                remotePath: `${explorePath}/${filePath}`
            }, { headers: { Authorization: `Bearer ${token}` } });
            toast.dismiss(toastId);
            if (res.data.link) {
                window.open(res.data.link, '_blank');
            } else {
                toast.error('No se pudo obtener el enlace');
            }
        } catch (error) {
            toast.dismiss();
            toast.error('Error al comunicarse con Drive');
        }
    };

    const calculateSLA = (uploadStr: string, folderStr: string, type: string) => {
        if (!uploadStr || !folderStr) return { diffHours: 0, status: 'SUCCESS', limit: 24 };
        
        const upload = new Date(uploadStr);
        // Si folder date viene como YYYY-MM-DD, añadir T12 para evitar desfases
        const folder = folderStr.includes('T') ? new Date(folderStr) : new Date(`${folderStr}T12:00:00`);
        
        const uploadMs = isNaN(upload.getTime()) ? Date.now() : upload.getTime();
        const folderMs = isNaN(folder.getTime()) ? uploadMs : folder.getTime();
        
        const diffMs = uploadMs - folderMs;
        const diffHours = diffMs / (1000 * 60 * 60);
        
        const limit = (type || '').toUpperCase() === 'NACIONAL' ? 72 : 24;
        return {
            diffHours: isNaN(diffHours) ? 0 : diffHours,
            status: diffHours <= limit ? 'SUCCESS' : 'LATE',
            limit
        };
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '---';
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
                    'Fecha Carpeta': formatDate(h.folderDate),
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
            {/* Header */}
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
                    <button 
                        onClick={() => setActiveTab('explore')}
                        className={`flex-1 lg:flex-none px-8 py-3 rounded-[1.75rem] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest transition-all
                            ${activeTab === 'explore' ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <FolderSearch size={18} /> Explorador Remoto
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative min-h-[600px]">
                {/* Overlay de Carga */}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 items-end">
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
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Buscar</label>
                                    <div className="relative">
                                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Nombre archivo..."
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <button 
                                        onClick={() => fetchHistory()}
                                        disabled={isConsulting}
                                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 disabled:opacity-50"
                                    >
                                        {isConsulting ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                                        CONSULTAR
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Tabla de Resultados */}
                        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
                            <div className="flex justify-between items-center p-8 bg-slate-50/30 border-b border-slate-50">
                                <h3 className="text-slate-800 font-black uppercase tracking-tight flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    Registros de Trazabilidad ({history.length})
                                </h3>
                                <div className="flex gap-3">
                                    <button onClick={exportToExcel} className="px-5 py-3 bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                                        <Download size={16} /> Exportar
                                    </button>
                                </div>
                            </div>

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
                                                <tr key={h.id} className={`transition-all group ${h.isDeleted ? 'bg-rose-50/30' : 'hover:bg-slate-50/50'}`}>
                                                    <td className="px-8 py-6">
                                                        <div className={`w-4 h-4 rounded-full shadow-lg ${status === 'SUCCESS' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-rose-500 shadow-rose-500/20'}`} 
                                                             title={status === 'SUCCESS' ? 'Cumple SLA' : 'Fuera de Tiempo'} />
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-3 rounded-2xl transition-all ${h.isDeleted ? 'bg-rose-100 text-rose-500' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-500 group-hover:text-white'}`}>
                                                                <FileText size={20} />
                                                            </div>
                                                            <div className="flex flex-col max-w-[200px]">
                                                                <span className={`font-black text-[13px] truncate ${h.isDeleted ? 'text-rose-700 line-through' : 'text-slate-800'}`} title={h.fileName}>{h.fileName}</span>
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase">{formatDate(h.uploadDate)} @ {formatTime(h.uploadDate)}</span>
                                                                {h.isDeleted && (
                                                                    <span className="text-[9px] text-rose-600 font-bold mt-1 line-clamp-2" title={h.deleteReason}>Motivo: {h.deleteReason}</span>
                                                                )}
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
                                                        <div className="flex items-center justify-center gap-2">
                                                            {!h.isDeleted && (
                                                                <a href={h.driveLink} target="_blank" rel="noopener noreferrer" title="Ver en Drive" className="w-10 h-10 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-[1rem] transition-all inline-flex items-center justify-center shadow-sm text-slate-500">
                                                                    <ExternalLink size={16} />
                                                                </a>
                                                            )}
                                                            {hasEditPermission && !h.isDeleted && (
                                                                <>
                                                                    <button onClick={() => handleRename(h)} title="Renombrar Archivo" className="w-10 h-10 bg-slate-50 hover:bg-indigo-500 hover:text-white rounded-[1rem] transition-all inline-flex items-center justify-center shadow-sm text-slate-500">
                                                                        <Edit2 size={16} />
                                                                    </button>
                                                                    <button onClick={() => handleDelete(h)} title="Eliminar Archivo" className="w-10 h-10 bg-slate-50 hover:bg-rose-500 hover:text-white rounded-[1rem] transition-all inline-flex items-center justify-center shadow-sm text-slate-500">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                        {h.isDeleted && (
                                                            <div className="mt-2 text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-lg font-bold w-fit mx-auto" title={h.deleteReason}>
                                                                ELIMINADO
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {history.length === 0 && !isConsulting && (
                                <div className="flex flex-col items-center justify-center py-32 gap-6 bg-slate-50/20">
                                    <div className="w-32 h-32 bg-white rounded-[3rem] shadow-xl flex items-center justify-center text-slate-100">
                                        <Search size={64} />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <h3 className="text-slate-800 font-black uppercase tracking-widest text-lg">Inicia una consulta</h3>
                                        <p className="text-slate-400 text-sm font-medium">Usa los filtros superiores y haz clic en CONSULTAR.</p>
                                    </div>
                                </div>
                            )}
                            
                            {isConsulting && (
                                <div className="flex flex-col items-center justify-center py-32 gap-6 bg-slate-50/20">
                                    <Loader2 className="animate-spin text-indigo-500" size={64} />
                                    <p className="text-slate-500 font-black uppercase tracking-widest animate-pulse">Sincronizando Historial...</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB: EXPLORE */}
                {activeTab === 'explore' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500">
                        {/* Filtros Explorer */}
                        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Año</label>
                                    <select 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all appearance-none"
                                        value={exploreYear}
                                        onChange={e => setExploreYear(e.target.value)}
                                    >
                                        {[...Array(5)].map((_, i) => {
                                            const y = new Date().getFullYear() - i;
                                            return <option key={y} value={y}>{y}</option>;
                                        })}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cliente</label>
                                    <select 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl text-sm font-black outline-none focus:border-indigo-500 focus:bg-white transition-all appearance-none"
                                        value={exploreClient}
                                        onChange={e => setExploreClient(e.target.value)}
                                    >
                                        <option value="">SELECCIONAR CLIENTE</option>
                                        {authorizedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <button 
                                        onClick={handleExplore}
                                        disabled={isExploring || !exploreYear || !exploreClient}
                                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 disabled:opacity-50"
                                    >
                                        {isExploring ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                                        EXPLORAR CARPETAS
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Resultados Explorer */}
                        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[400px]">
                            <div className="flex justify-between items-center p-8 bg-slate-50/30 border-b border-slate-50">
                                <h3 className="text-slate-800 font-black uppercase tracking-tight flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    Archivos Encontrados ({exploreFiles.length})
                                </h3>
                                {explorePath && (
                                    <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">{explorePath}</span>
                                )}
                            </div>

                            {exploreFiles.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-8">
                                    {exploreFiles.filter((f: any) => !f.IsDir).map((file: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-300 transition-all group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-indigo-100 text-indigo-500 rounded-lg group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                                    <FileText size={18} />
                                                </div>
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className="text-[12px] font-black text-slate-700 truncate" title={file.Path}>{file.Name}</span>
                                                    <span className="text-[9px] text-slate-400 font-mono truncate">{file.Path}</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleOpenDriveLink(file.Path)}
                                                className="ml-2 w-8 h-8 flex-shrink-0 bg-white hover:bg-slate-900 hover:text-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm transition-all"
                                                title="Obtener Enlace de Drive"
                                            >
                                                <Link size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                !isExploring && (
                                    <div className="flex flex-col items-center justify-center py-20 gap-6">
                                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                                            <FolderSearch size={40} />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h3 className="text-slate-600 font-black uppercase tracking-widest text-sm">Explorador Vacío</h3>
                                            <p className="text-slate-400 text-xs font-medium">Selecciona un cliente y haz clic en explorar.</p>
                                        </div>
                                    </div>
                                )
                            )}
                            
                            {isExploring && (
                                <div className="flex flex-col items-center justify-center py-20 gap-6 bg-white/80 absolute inset-0 z-10 backdrop-blur-sm">
                                    <Loader2 className="animate-spin text-indigo-500" size={48} />
                                    <p className="text-slate-500 font-black uppercase tracking-widest text-sm animate-pulse">Consultando Google Drive...</p>
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
