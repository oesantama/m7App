import React, { useState, useEffect } from 'react';
import { INITIAL_CLIENTS } from '../../constants';
import { useAppStore } from '../../stores/useAppStore';
import { Upload, FileText, CheckCircle2, AlertCircle, ExternalLink, Search, UploadCloud } from 'lucide-react';
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

const GestionDocumental: React.FC = () => {
    const { user } = useAppStore();
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [history, setHistory] = useState<DocumentLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Filtrar clientes autorizados para el usuario
    const authorizedClients = INITIAL_CLIENTS.filter(client => 
        user?.roleId === 'ROL-01' || user?.clientIds?.includes(client.id)
    );

    const fetchHistory = async () => {
        try {
            const response = await axios.get('/api/documents/stats');
            // En una implementación real, esto traería el historial detallado. 
            // Por ahora simularemos con los datos de la tabla logs que creamos.
        } catch (error) {
            // Error silencioso en producción para no ensuciar consola
        }
    };

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

        try {
            const response = await axios.post('/api/documents/upload-cumplido', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success('¡Cumplido subido exitosamente!');
            setFile(null);
            setSelectedClient('');
            fetchHistory();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al subir el archivo');
        } finally {
            setIsUploading(false);
        }
    };

    const now = new Date();
    const currentPathPreview = selectedClient 
        ? `cumplidos / ${now.getFullYear()} / ${authorizedClients.find(c => c.id === selectedClient)?.name} / ${now.toLocaleString('es-ES', { month: 'long' })} / dia ${now.getDate()}`
        : 'Seleccione un cliente para ver la ruta';

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-slate-800">Gestión Documental de Cumplidos</h1>
                <p className="text-slate-500 text-lg">Carga de soportes directamente a Google Drive con trazabilidad total.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Formulario de Carga */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-xl border border-slate-100 space-y-6">
                    <div className="space-y-4">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
                            1. Seleccionar Cliente Autorizado
                        </label>
                        <select 
                            className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                            value={selectedClient}
                            onChange={(e) => setSelectedClient(e.target.value)}
                        >
                            <option value="">-- Seleccione Cliente --</option>
                            {authorizedClients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
                            2. Adjuntar PDF de Cumplido
                        </label>
                        <div 
                            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
                                ${file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-indigo-400 bg-slate-50'}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
                            }}
                        >
                            <input 
                                type="file" 
                                id="file-upload" 
                                className="hidden" 
                                accept=".pdf"
                                onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                            />
                            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
                                {file ? (
                                    <>
                                        <FileText size={48} className="text-emerald-500" />
                                        <span className="font-medium text-slate-700 truncate w-full px-4">{file.name}</span>
                                        <button onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-xs text-rose-500 font-bold hover:underline">CAMBIAR ARCHIVO</button>
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
                        <p className="text-xs font-mono break-all leading-relaxed text-slate-300">
                            {currentPathPreview}
                        </p>
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
                            <>
                                <CheckCircle2 size={20} />
                                SUBIR CUMPLIDO A DRIVE
                            </>
                        )}
                    </button>
                </div>

                {/* Dashboard de Eficiencia / Historial */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="text-xl font-bold text-slate-800">Trazabilidad de Cargas</h2>
                            <div className="relative">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text"
                                    placeholder="Buscar por archivo..."
                                    className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
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
                                    {/* Aquí se mapearán los datos reales de document_logs */}
                                    <tr className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
                                                    <FileText size={18} />
                                                </div>
                                                <span className="font-medium text-slate-700 text-sm">Ejemplo_Cumplido.pdf</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase">AJOVER S.A.S</span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-sm">30/04/2026 16:24</td>
                                        <td className="px-6 py-4 text-center">
                                            <button className="text-indigo-600 hover:text-indigo-800 p-2 hover:bg-indigo-100 rounded-lg transition-all">
                                                <ExternalLink size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            {/* Estado vacío */}
                            <div className="p-20 text-center space-y-3">
                                <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                                    <AlertCircle size={32} className="text-slate-300" />
                                </div>
                                <h3 className="text-slate-800 font-bold">Sin cargas registradas hoy</h3>
                                <p className="text-slate-400 text-sm max-w-xs mx-auto">Los archivos que subas aparecerán aquí para que puedas consultar sus links rápidamente.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GestionDocumental;
