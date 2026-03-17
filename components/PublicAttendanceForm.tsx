import React, { useState, useEffect, useRef } from 'react';
import SignaturePad from 'react-signature-canvas';
import { toast } from 'sonner';
import { Icons } from '../constants';

const PublicAttendanceForm: React.FC = () => {
    const pathParts = window.location.pathname.split('/');
    const token = pathParts[pathParts.length - 1];
    
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [expired, setExpired] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        fullName: '',
        documentNumber: '',
        jobTitle: ''
    });

    const sigPad = useRef<any>(null);

    useEffect(() => {
        fetchSession();
    }, [token]);

    const fetchSession = async () => {
        try {
            const res = await fetch(`/api/training/public/session/${token}`);
            const data = await res.json();
            
            if (res.status === 410 || data.expired) {
                setExpired(true);
            } else if (!res.ok) {
                toast.error(data.error || "Error al cargar la capacitación");
            } else {
                setSession(data);
            }
        } catch (err) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sigPad.current || sigPad.current.isEmpty()) {
            return toast.error("La firma es obligatoria");
        }

        const signatureB64 = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
        
        setSubmitting(true);
        try {
            const res = await fetch('/api/training/public/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: session.id,
                    ...formData,
                    signatureB64
                })
            });

            const data = await res.json();
            if (res.ok) {
                setSuccess(true);
                toast.success("¡Asistencia registrada!");
            } else {
                toast.error(data.error || "Error al registrar asistencia");
            }
        } catch (err) {
            toast.error("Error al enviar los datos");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
    );

    if (expired) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
            <div className="max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-500">
                    <Icons.Alert className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase">Link Expirado</h2>
                <p className="text-slate-500 font-bold text-sm">El tiempo para registrar la asistencia a esta capacitación ha finalizado.</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest">Reintentar</button>
            </div>
        </div>
    );

    if (success) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
            <div className="max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center gap-4 animate-in zoom-in-95">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
                    <Icons.History className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase">¡Registro Exitoso!</h2>
                <p className="text-slate-500 font-bold text-sm">Tu asistencia a la capacitación "{session?.topic}" ha sido guardada correctamente.</p>
                <div className="w-full h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-emerald-500 animate-progress-fast"></div>
                </div>
                <p className="text-[10px] text-slate-300 font-bold uppercase mt-2">Puedes cerrar esta ventana</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4 sm:px-6">
            <div className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                {/* Header */}
                <div className="bg-slate-900 p-8 text-white relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Icons.Package className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1 text-left">Asistencia Pública</p>
                            <h1 className="text-xl font-black uppercase tracking-tight text-left leading-none">{session?.topic || 'Cargando...'}</h1>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 font-bold leading-relaxed text-left border-l-2 border-emerald-500 pl-4 py-1 italic">
                            {session?.content}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Instructor</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                    <span className="text-[11px] font-bold text-slate-200 uppercase">{session?.instructor}</span>
                                </div>
                             </div>
                             <div className="flex flex-col gap-1 text-right">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Medio</span>
                                <div className="flex items-center gap-2 justify-end">
                                    <span className="text-[11px] font-bold text-slate-200 uppercase">
                                        {session?.location_type === 'VIRTUAL' ? '🌐 VIRTUAL' : '📍 PRESENCIAL'}
                                    </span>
                                </div>
                             </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                             <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Fecha y Hora</span>
                                <div className="flex items-center gap-2">
                                    <Icons.History className="w-3 h-3 text-emerald-500" />
                                    <span className="text-[11px] font-bold text-slate-300 uppercase">
                                        {session?.scheduled_at ? new Date(session.scheduled_at).toLocaleString('es-CO', { 
                                            day: '2-digit', month: '2-digit', year: 'numeric', 
                                            hour: '2-digit', minute: '2-digit', hour12: true 
                                        }) : 'No programada'}
                                    </span>
                                </div>
                             </div>
                             <div className="flex flex-col gap-1 text-right">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Duración</span>
                                <span className="text-[11px] font-bold text-emerald-500 uppercase">
                                    {session?.duration_minutes} MINUTOS
                                </span>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2 text-left">Nombre Completo</label>
                            <input 
                                required
                                type="text" 
                                value={formData.fullName}
                                onChange={e => setFormData({...formData, fullName: e.target.value.toUpperCase()})}
                                className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-blue-500 transition-all text-left text-slate-900"
                                placeholder="ESCRIBA SU NOMBRE..."
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2 text-left">Cédula / ID</label>
                                <input 
                                    required
                                    type="text" 
                                    value={formData.documentNumber}
                                    onChange={e => setFormData({...formData, documentNumber: e.target.value.toUpperCase()})}
                                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all text-left text-slate-900"
                                    placeholder="NÚMERO..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2 text-left">Cargo / Rol</label>
                                <input 
                                    required
                                    type="text" 
                                    value={formData.jobTitle}
                                    onChange={e => setFormData({...formData, jobTitle: e.target.value.toUpperCase()})}
                                    className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-blue-500 transition-all text-left text-slate-900"
                                    placeholder="SU CARGO..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Signature Pad */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-end px-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block text-left">Firma Digital</label>
                             <button type="button" onClick={() => sigPad.current?.clear()} className="text-[9px] font-black text-blue-600 uppercase hover:text-blue-800 transition-colors">Limpiar</button>
                        </div>
                        <div className="border-2 border-slate-100 rounded-2xl overflow-hidden bg-slate-50 h-[180px] relative group">
                            <SignaturePad 
                                ref={sigPad}
                                canvasProps={{
                                    className: "w-full h-full cursor-crosshair",
                                    style: { width: '100%', height: '180px' }
                                }}
                            />
                            <div className="absolute inset-x-0 bottom-4 pointer-events-none flex justify-center">
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">Firme dentro del cuadro</span>
                            </div>
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={submitting}
                        className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-600 hover:shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {submitting ? (
                            <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <Icons.Check className="w-5 h-5" />
                                REGISTRAR MI ASISTENCIA
                            </>
                        )}
                    </button>
                </form>
            </div>
            <p className="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-widest">Powered by Milla 7 Logic System</p>
        </div>
    );
};

export default PublicAttendanceForm;
