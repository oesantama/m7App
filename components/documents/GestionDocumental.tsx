import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { Upload, FileText, CheckCircle2, AlertCircle, ExternalLink, Search, Calendar } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

interface DocumentLog {
    id: number;
    file_name: string;
    client_id: string;
    drive_path: string;
    drive_link: string;
    upload_date: string;
}

const colombiaToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD

const GestionDocumental: React.FC = () => {
    const { user, allMasterData } = useAppStore();
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [history, setHistory] = useState<DocumentLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const today = colombiaToday();
    const [uploadDate, setUploadDate] = useState<string>(today);
    const [dateFrom, setDateFrom] = useState<string>(today);
    const [dateTo, setDateTo] = useState<string>(today);

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

    const fetchHistory = async (from: string, to: string) => {
        try {
            const token = user?.token || '';
            const res = await axios.get('/api/documents/stats', {
                headers: { Authorization: `Bearer ${token}` },
                params: { dateFrom: from, dateTo: to },
            });
            if (Array.isArray(res.data)) setHistory(res.data);
        } catch {
            // silencioso
        }
    };

    useEffect(() => { fetchHistory(dateFrom, dateTo); }, [dateFrom, dateTo]);

    const handleUpload = async () => {
        if (!selectedClient || !file) {
            toast.error('Por favor seleccione un cliente y un archivo');
            return;
        }
        const client = authorizedClients.find(c => c.id === selectedClient);
        if (!client) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('clientId', client.id);
        formData.append('clientName', client.name);
        formData.append('userId', String(user?.id || ''));
        formData.append('uploadDate', uploadDate);

        try {
            const token = user?.token || '';
            await axios.post('/api/documents/upload-cumplido', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`,
                },
            });
            toast.success('¡Cumplido subido exitosamente!');
            setFile(null);
            if (authorizedClients.length !== 1) setSelectedClient('');
            fetchHistory(dateFrom, dateTo);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al subir el archivo');
        } finally {
            setIsUploading(false);
        }
    };

    const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const refDate = uploadDate ? new Date(`${uploadDate}T12:00:00`) : new Date();
    const currentPathPreview = selectedClient
        ? `CUMPLIDOS MILLA 7/${refDate.getFullYear()}/${authorizedClients.find(c => c.id === selectedClient)?.name?.replace(/[^a-zA-Z0-9 ()-]/g, '').trim()}/${MESES_ES[refDate.getMonth()].toUpperCase()}/DIA ${refDate.getDate()}`
        : 'Seleccione un cliente para ver la ruta';

    const filteredHistory = history.filter(h =>
        h.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (allClients.find(c => c.id === h.client_id)?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-slate-800">Gestión Documental de Cumplidos</h1>
                <p className="text-slate-500 text-lg">Carga de soportes directamente a Google Drive con trazabilidad total.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Formulario de Carga */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-xl border border-slate-100 space-y-5">
                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
                            1. Cliente Autorizado
                        </label>
                        {authorizedClients.length === 1 ? (
                            <div className="w-full p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-800 flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                {authorizedClients[0].name}
                            </div>
                        ) : (
                            <select
                                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                value={selectedClient}
                                onChange={e => setSelectedClient(e.target.value)}
                            >
                                <option value="">-- Seleccione Cliente --</option>
                                {authorizedClients.map(client => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
                            2. Fecha del Cumplido
                        </label>
                        <input
                            type="date"
                            className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-sm"
                            value={uploadDate}
                            max={today}
                            onChange={e => setUploadDate(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
                            3. Adjuntar PDF de Cumplido
                        </label>
                        <div
                            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
                                ${file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-indigo-400 bg-slate-50'}`}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
                            }}
                        >
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                accept=".pdf"
                                onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                            />
                            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
                                {file ? (
                                    <>
                                        <FileText size={48} className="text-emerald-500" />
                                        <span className="font-medium text-slate-700 truncate w-full px-4">{file.name}</span>
                                        <button onClick={e => { e.preventDefault(); setFile(null); }} className="text-xs text-rose-500 font-bold hover:underline">CAMBIAR ARCHIVO</button>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={48} className="text-slate-300" />
                                        <span className="text-slate-500">Arrastra tu PDF aquí o haz clic para buscar</span>
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                    <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
                        <span className="text-[10px] uppercase font-bold text-indigo-400">Ruta de Destino Automática</span>
                        <p className="text-xs font-mono break-all leading-relaxed text-slate-300">{currentPathPreview}</p>
                    </div>

                    <button
                        onClick={handleUpload}
                        disabled={!file || !selectedClient || isUploading}
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-3
                            ${(!file || !selectedClient || isUploading)
                                ? 'bg-slate-300 cursor-not-allowed'
                                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-[1.02] active:scale-[0.98] shadow-indigo-200'}`}
                    >
                        {isUploading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                        ) : (
                            <><CheckCircle2 size={20} /> SUBIR CUMPLIDO A DRIVE</>
                        )}
                    </button>
                </div>

                {/* Trazabilidad */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                        {/* Header con filtros */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-3">
                            <h2 className="text-xl font-bold text-slate-800">Trazabilidad de Cargas</h2>
                            <div className="flex flex-wrap gap-3 items-center">
                                <div className="flex items-center gap-2">
                                    <Calendar size={15} className="text-slate-400" />
                                    <span className="text-xs font-semibold text-slate-500 uppercase">Desde</span>
                                    <input
                                        type="date"
                                        className="p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                        value={dateFrom}
                                        max={dateTo}
                                        onChange={e => setDateFrom(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-500 uppercase">Hasta</span>
                                    <input
                                        type="date"
                                        className="p-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                        value={dateTo}
                                        min={dateFrom}
                                        max={today}
                                        onChange={e => setDateTo(e.target.value)}
                                    />
                                </div>
                                <div className="relative ml-auto">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar archivo o cliente..."
                                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none w-52"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivo</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                                        <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Link</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredHistory.map(h => (
                                        <tr key={h.id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
                                                        <FileText size={18} />
                                                    </div>
                                                    <span className="font-medium text-slate-700 text-sm">{h.file_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase">
                                                    {allClients.find(c => c.id === h.client_id)?.name || h.client_id}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 text-sm">
                                                {new Date(h.upload_date).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {h.drive_link ? (
                                                    <a href={h.drive_link} target="_blank" rel="noopener noreferrer"
                                                        className="text-indigo-600 hover:text-indigo-800 p-2 hover:bg-indigo-100 rounded-lg transition-all inline-block">
                                                        <ExternalLink size={18} />
                                                    </a>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {filteredHistory.length === 0 && (
                                <div className="p-16 text-center space-y-3">
                                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                        <AlertCircle size={32} className="text-slate-300" />
                                    </div>
                                    <h3 className="text-slate-800 font-bold">Sin cargas en el rango seleccionado</h3>
                                    <p className="text-slate-400 text-sm max-w-xs mx-auto">Ajusta el rango de fechas o sube un nuevo cumplido para verlo aquí.</p>
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
