
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Icons } from '../constants';
import { api } from '../services/api';

const WhatsAppConnect: React.FC = () => {
    const [status, setStatus] = useState<'DISCONNECTED' | 'QR_READY' | 'CONNECTED'>('DISCONNECTED');
    const [qr, setQr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const data = await api.getWhatsAppStatus();
            setStatus(data.status);
            setQr(data.qr);
        } catch (error) {
            console.error("Error fetching WA status", error);
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
        <div className="flex flex-col items-center justify-center p-10 bg-slate-50 min-h-full rounded-[3rem] animate-in fade-in duration-700">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-lg w-full text-center relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-2 ${status === 'CONNECTED' ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                
                <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[1.5rem] mx-auto flex items-center justify-center mb-6 shadow-sm">
                    <Icons.Settings className="w-10 h-10" />
                </div>

                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Conexión Asistente M7</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Estado Actual: <span className={status === 'CONNECTED' ? 'text-emerald-500' : 'text-orange-500'}>{status}</span></p>

                {status === 'CONNECTED' ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl animate-in zoom-in">
                        <Icons.Check className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-emerald-800 font-black uppercase text-sm">Sistema Vinculado</h3>
                        <p className="text-emerald-600 text-xs mt-2">El Asistente Inteligente está activo y respondiendo mensajes.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {qr ? (
                            <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 inline-block shadow-lg">
                                <QRCodeSVG value={qr} size={256} />
                            </div>
                        ) : (
                            <div className="w-64 h-64 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto text-slate-400 font-black text-xs uppercase animate-pulse">
                                Esperando Código QR...
                            </div>
                        )}
                        <p className="text-slate-500 text-xs max-w-xs mx-auto leading-relaxed">
                            Abre WhatsApp en tu teléfono, ve a <strong className="text-slate-700">Dispositivos Vinculados</strong> y escanea este código para activar la IA.
                        </p>
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
