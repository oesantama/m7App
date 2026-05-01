import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { 
    Upload, FileText, CheckCircle2, AlertCircle, ExternalLink, 
    Search, Calendar, RotateCcw, Download, X, Loader2 
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
}

const colombiaToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

const GestionDocumental: React.FC = () => {
    const { user, allMasterData } = useAppStore();
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
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
            if (Array.isArray(res.data)) setHistory(res.data);
            
            // Extraer lista de usuarios única de los resultados para el filtro
            if (usersList.length === 0 && Array.isArray(res.data)) {
                const uniqueUsers = Array.from(new Set(res.data.map((h: any) => JSON.stringify({ id: h.userId || h.userName, name: h.userName }))))
                    .map(s => JSON.parse(s as string));
                setUsersList(uniqueUsers);
            }
        } catch { /* silencioso */ }
    };

    useEffect(() => { fetchHistory(); }, [dateFrom, dateTo, searchTerm, selectedClientFilter, selectedUserFilter, folderDateFilter]);

    const handleUpload = async () => {
        if (!selectedClient || files.length === 0) {
            toast.error('Seleccione un cliente y al menos un archivo');
            return;
        }
        const client = authorizedClients.find(c => c.id === selectedClient);
        if (!client) return;

        setIsUploading(true);
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
            });
            toast.success(`¡${files.length} archivo(s) subido(s) exitosamente!`);
            setFiles([]);
            fetchHistory();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al subir archivos');
        } finally {
            setIsUploading(false);
        }
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
                    'Fecha Subida': new Date(h.uploadDate).toLocaleString(),
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

    const calculateSLA = (uploadStr: string, folderStr: string, type: string) => {
        const upload = new Date(uploadStr);
        const folder = new Date(`${folderStr}T00:00:00`);
        const diffMs = upload.getTime() - folder.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        
        const limit = type === 'NACIONAL' ? 72 : 24;
        return {
            diffHours,
            status: diffHours <= limit ? 'SUCCESS' : 'LATE',
            limit
        };
    };

    const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const refDate = uploadDate ? new Date(`${uploadDate}T12:00:00`) : new Date();
    const currentPathPreview = selectedClient
        ? `CUMPLIDOS MILLA 7/${refDate.getFullYear()}/${authorizedClients.find(c => c.id === selectedClient)?.name?.replace(/[^a-zA-Z0-9 ()-]/g, '').trim()}/${MESES_ES[refDate.getMonth()].toUpperCase()}/DIA ${refDate.getDate()}`
        : 'Seleccione un cliente para ver la ruta';

    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">GESTIÓN DOCUMENTAL DRIVE</h1>
                    <p className="text-slate-500 font-medium italic">Dashboard de Trazabilidad y Cumplimiento de SLAs</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => fetchHistory()} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                        <RotateCcw size={18} className="text-slate-600" />
                    </button>
                    <button onClick={exportToExcel} className="px-5 py-3 bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                        <Download size={16} /> Exportar Excel
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Formulario de Carga */}
                <div className="xl:col-span-1 bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-5 h-fit sticky top-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">1. Cliente</label>
                        <select
                            className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 focus:border-indigo-500 transition-all outline-none"
                            value={selectedClient}
                            onChange={e => setSelectedClient(e.target.value)}
                        >
                            <option value="">-- Seleccionar --</option>
                            {authorizedClients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">2. Fecha Carpeta</label>
                        <input
                            type="date"
                            className="w-full p-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 focus:border-indigo-500 transition-all outline-none"
                            value={uploadDate}
                            max={today}
                            onChange={e => setUploadDate(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">3. Adjuntar PDFs ({files.length})</label>
                        <div
                            className={`border-2 border-dashed rounded-[2rem] p-8 text-center transition-all cursor-pointer group
                                ${files.length > 0 ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-indigo-400 bg-slate-50'}`}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                if (e.dataTransfer.files) setFiles(Array.from(e.dataTransfer.files));
                            }}
                        >
                            <input type="file" id="file-upload" className="hidden" accept=".pdf" multiple onChange={e => e.target.files && setFiles(Array.from(e.target.files))} />
                            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${files.length > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400 group-hover:bg-indigo-500 group-hover:text-white'}`}>
                                    <Upload size={32} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-black text-slate-700 uppercase">Click para cargar</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Puedes subir hasta 10 archivos PDF</p>
                                </div>
                            </label>
                        </div>
                        {files.length > 0 && (
                            <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {files.map((f, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <span className="text-xs font-bold text-slate-600 truncate flex-1">{f.name}</span>
                                        <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-rose-500 hover:text-rose-700 p-1"><X size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900 text-white p-5 rounded-[2rem] space-y-3 relative overflow-hidden group">
                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity"><FileText size={100} /></div>
                        <span className="text-[9px] uppercase font-black text-indigo-400 tracking-widest">Ruta Automática IQ</span>
                        <p className="text-[11px] font-mono leading-relaxed text-slate-400 break-all">{currentPathPreview}</p>
                    </div>

                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || !selectedClient || isUploading}
                        className={`w-full py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-widest text-white shadow-2xl transition-all flex items-center justify-center gap-3
                            ${(files.length === 0 || !selectedClient || isUploading)
                                ? 'bg-slate-200 cursor-not-allowed text-slate-400'
                                : 'bg-indigo-600 hover:bg-indigo-500 hover:-translate-y-1 shadow-indigo-500/20'}`}
                    >
                        {isUploading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={18} /> PROCESAR CARGA</>}
                    </button>
                </div>

                {/* Trazabilidad Pro */}
                <div className="xl:col-span-3 space-y-6">
                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col h-[800px]">
                        {/* Filtros Inteligentes */}
                        <div className="p-8 border-b border-slate-50 bg-slate-50/30 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cargue (Desde)</label>
                                <input type="date" className="w-full p-2 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cargue (Hasta)</label>
                                <input type="date" className="w-full p-2 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Carpeta (Día)</label>
                                <input type="date" className="w-full p-2 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" value={folderDateFilter} onChange={e => setFolderDateFilter(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtrar Cliente</label>
                                <select 
                                    className="w-full p-2 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                                    value={selectedClientFilter}
                                    onChange={e => setSelectedClientFilter(e.target.value)}
                                >
                                    <option value="">Todos</option>
                                    {authorizedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filtrar Usuario</label>
                                <select 
                                    className="w-full p-2 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                                    value={selectedUserFilter}
                                    onChange={e => setSelectedUserFilter(e.target.value)}
                                >
                                    <option value="">Todos</option>
                                    {usersList.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre Archivo</label>
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        className="w-full pl-9 pr-3 py-2 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full border-collapse">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">SLA</th>
                                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento</th>
                                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Carpeta</th>
                                        <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Respuesta</th>
                                        <th className="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Drive</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {history.map(h => {
                                        const { diffHours, status } = calculateSLA(h.uploadDate, h.folderDate, h.clientType);
                                        return (
                                            <tr key={h.id} className="hover:bg-slate-50/50 transition-all group">
                                                <td className="px-8 py-5">
                                                    <div className={`w-3 h-3 rounded-full shadow-lg ${status === 'SUCCESS' ? 'bg-emerald-500 shadow-emerald-500/20 animate-pulse' : 'bg-rose-500 shadow-rose-500/20'}`} />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-rose-50 p-2.5 rounded-xl text-rose-500 group-hover:scale-110 transition-transform">
                                                            <FileText size={20} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-slate-800 text-xs truncate max-w-[200px]">{h.fileName}</span>
                                                            <span className="text-[10px] text-slate-400 font-bold">{new Date(h.uploadDate).toLocaleTimeString()}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-slate-700 text-[11px] uppercase tracking-tight">{h.clientName}</span>
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full w-fit mt-1 ${h.clientType === 'NACIONAL' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                                            {h.clientType}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-slate-500 text-[11px] font-bold uppercase">{h.userName}</td>
                                                <td className="px-6 py-5 text-slate-500 text-[11px] font-black">{h.folderDate}</td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col">
                                                        <span className={`text-[11px] font-black ${status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {Math.floor(diffHours)}h {Math.round((diffHours % 1) * 60)}m
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-medium">Diferencia neta</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-center">
                                                    <a href={h.driveLink} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-50 hover:bg-indigo-500 hover:text-white rounded-2xl transition-all inline-flex shadow-sm">
                                                        <ExternalLink size={18} />
                                                    </a>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {history.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-[500px] gap-4">
                                    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200">
                                        <Search size={40} />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-slate-800 font-black uppercase tracking-widest text-sm">Sin registros detectados</h3>
                                        <p className="text-slate-400 text-xs font-medium">Ajusta los filtros o realiza una nueva carga inteligente.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GestionDocumental;
