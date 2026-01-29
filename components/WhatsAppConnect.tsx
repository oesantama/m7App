
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';

const WhatsAppConnect: React.FC = () => {
    const [status, setStatus] = useState<'DISCONNECTED' | 'QR_READY' | 'CONNECTED'>('DISCONNECTED');
    const [qr, setQr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reconnecting, setReconnecting] = useState(false);

    const [history, setHistory] = useState<any[]>([]);
    const [viewHistory, setViewHistory] = useState(false);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await api.getWhatsAppStatus();
            setStatus(data.status);
            setQr(data.qr || null);
            
            if (data.status === 'CONNECTED') {
                const logs = await api.getWhatsAppHistory();
                setHistory(logs);
            }
        } catch (error: any) {
            console.error("Error fetching WA status", error);
            setError("No se pudo conectar con el servicio de WhatsApp.");
        } finally {
            setLoading(false);
        }
    };

    const handleReconnect = async () => {
        try {
            setReconnecting(true);
            toast.info("Iniciando sesión...");
            const data = await api.connectWhatsApp();
            
            if (data.success) {
                setStatus(data.status);
                setQr(data.qr || null);
                if (data.status === 'CONNECTED') fetchStatus();
                toast.success("Sesión iniciada correctamente");
            } else {
                toast.error("Error al iniciar: " + (data.error || "Error desconocido"));
            }
        } catch (error: any) {
            console.error("Error connecting", error);
            toast.error("Error al conectar con WhatsApp");
        } finally {
            setReconnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('¿Estás seguro de desvincular la sesión? Tendrás que escanear el QR nuevamente.')) return;
        
        try {
            setLoading(true);
            await api.disconnectWhatsApp();
            toast.success("Sesión desvinculada");
            await fetchStatus();
        } catch (e: any) {
             toast.error("Error al desvincular");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // Polling cada 5s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center p-10 bg-slate-50 min-h-full rounded-[3rem] animate-in fade-in duration-700 w-full">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-4xl w-full text-center relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-2 ${status === 'CONNECTED' ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                
                <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[1.5rem] mx-auto flex items-center justify-center mb-6 shadow-sm">
                    <Icons.Settings className="w-10 h-10" />
                </div>

                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Conexión Asistente M7</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Estado Actual: <span className={status === 'CONNECTED' ? 'text-emerald-500' : 'text-orange-500'}>{status}</span></p>

                {error && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-2xl mb-6 animate-in fade-in">
                        <p className="text-red-700 text-xs font-medium">{error}</p>
                    </div>
                )}

                {status === 'CONNECTED' ? (
                    <div className="space-y-6">
                        <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl animate-in zoom-in">
                            <Icons.Check className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                            <h3 className="text-emerald-800 font-black uppercase text-sm">Sistema Vinculado</h3>
                            <p className="text-emerald-600 text-xs mt-2">El Asistente Inteligente está activo y respondiendo mensajes.</p>
                        </div>
                        
                        <div className="flex gap-4 justify-center">
                            <button 
                                onClick={handleDisconnect}
                                className="px-6 py-3 bg-red-100 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-200 transition-all"
                            >
                                Desvincular Sesión
                            </button>
                             <button 
                                onClick={() => setViewHistory(!viewHistory)}
                                className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                            >
                                {viewHistory ? 'Ocultar Historial' : 'Ver Historial'}
                            </button>
                        </div>

                        {viewHistory && (
                            <div className="mt-8 animate-in slide-in-from-bottom-4">
                                <h3 className="text-left font-bold text-slate-700 mb-4 ml-2">Historial de Mensajes Recientes</h3>
                                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                    <table className="w-full text-left text-sm text-slate-600">
                                        <thead className="bg-slate-50 text-xs uppercase text-slate-400 font-bold">
                                            <tr>
                                                <th className="p-4">Fecha</th>
                                                <th className="p-4">Número</th>
                                                <th className="p-4">Mensaje</th>
                                                <th className="p-4">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {history.length === 0 ? (
                                                <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No hay mensajes recientes</td></tr>
                                            ) : (
                                                history.map((h, i) => (
                                                    <tr key={h.id || i} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-4 whitespace-nowrap text-xs text-slate-400">{new Date(h.sent_at).toLocaleString()}</td>
                                                        <td className="p-4 font-mono text-xs">{h.phone_number}</td>
                                                        <td className="p-4 max-w-xs truncate" title={h.message_body}>{h.message_body}</td>
                                                        <td className="p-4"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${h.status === 'SENT' ? 'bg-blue-100 text-blue-600' : h.status === 'FAILED' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{h.status}</span></td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {qr ? (
                            <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 inline-block shadow-lg">
                                <img src={qr} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
                            </div>
                        ) : (
                            <div className="w-64 h-64 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto text-slate-400 font-black text-xs uppercase animate-pulse">
                                Esperando Código QR...
                            </div>
                        )}
                        <p className="text-slate-500 text-xs max-w-xs mx-auto leading-relaxed">
                            Abre WhatsApp en tu teléfono, ve a <strong className="text-slate-700">Dispositivos Vinculados</strong> y escanea este código para activar la IA.
                        </p>
                        
                        {!qr && (
                            <div className="flex flex-col items-center gap-2 mt-4">
                                <span className="loading loading-spinner text-emerald-500"></span>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">Iniciando motor de WhatsApp...</p>
                            </div>
                        )}
                    </div>
                )}

                <button onClick={fetchStatus} className="mt-8 text-[10px] font-black uppercase text-slate-400 hover:text-emerald-500 transition-colors flex items-center justify-center gap-2 mx-auto">
                    <Icons.RotateCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Actualizar Estado
                </button>
            </div>
        </div>
    );
};

export default WhatsAppConnect;
