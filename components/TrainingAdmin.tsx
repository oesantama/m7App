
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Icons } from '../constants';
import * as XLSX from 'xlsx';

const TrainingAdmin: React.FC = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any>(null);
    const [attendance, setAttendance] = useState<any[]>([]);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [extendSession, setExtendSession] = useState<any>(null);
    const [newExpiresAt, setNewExpiresAt] = useState('');

    // Form State
    const [form, setForm] = useState({
        topic: '',
        content: '',
        instructor: '',
        locationType: 'PRESENCIAL',
        scheduledAt: '',
        durationMinutes: '60',
        expiresAt: '',
    });

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/training/sessions', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            setSessions(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error("Error al cargar sesiones");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/training/sessions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(form)
            });
            if (res.ok) {
                toast.success("Sesión guardada correctamente");
                setShowModal(false);
                fetchSessions();
                setForm({
                    topic: '', content: '', instructor: '', locationType: 'PRESENCIAL',
                    scheduledAt: '', durationMinutes: '60', expiresAt: ''
                });
            }
        } catch (err) {
            toast.error("Error al guardar");
        }
    };

    const viewAttendance = async (session: any) => {
        setSelectedSession(session);
        setLoadingAttendance(true);
        try {
            const res = await fetch(`/api/training/sessions/${session.id}/attendance`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await res.json();
            setAttendance(data);
        } catch (err) {
            toast.error("Error al cargar asistencias");
        } finally {
            setLoadingAttendance(false);
        }
    };

    const exportToExcel = () => {
        if (!attendance.length) return toast.error("No hay datos para exportar");
        
        const dataToExport = attendance.map(a => ({
            'SESIÓN': selectedSession?.topic,
            'INSTRUCTOR': selectedSession?.instructor,
            'FECHA': new Date(a.registered_at).toLocaleString(),
            'NOMBRE COMPLETO': a.full_name,
            'CÉDULA': a.document_number,
            'CARGO': a.job_title
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Asistencias");
        XLSX.writeFile(wb, `Asistencias_${selectedSession?.topic}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExtend = async () => {
        if (!extendSession || !newExpiresAt) return;
        try {
            const res = await fetch(`/api/training/sessions/${extendSession.id}/extend`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ newExpiresAt })
            });
            if (res.ok) {
                toast.success("Fecha de expiración actualizada");
                setExtendSession(null);
                setNewExpiresAt('');
                fetchSessions();
            } else {
                const data = await res.json();
                toast.error(data.error || "Error al actualizar");
            }
        } catch {
            toast.error("Error al conectar con el servidor");
        }
    };

    const copyRegistrationLink = (token: string) => {
        const link = `${window.location.origin}/attendance/register/${token}`;
        navigator.clipboard.writeText(link);
        toast.info("Link de asistencia copiado al portapapeles", {
            description: "Puedes enviarlo por WhatsApp o correo.",
            icon: <Icons.Package className="text-blue-500 w-5 h-5" />
        });
    };

    return (
        <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-8 -mt-8"></div>
                <div className="flex items-center gap-5 z-10">
                    <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 text-white">
                        <Icons.Package className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Gestión de Asistencias</h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                             <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                             Creación y Seguimiento de Capacitaciones
                        </p>
                    </div>
                </div>
                <button 
                    onClick={() => setShowModal(true)}
                    className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all active:scale-95 flex items-center gap-3"
                >
                    <Icons.Plus className="w-5 h-5" />
                    Nueva Capacitación
                </button>
            </div>

            {/* Grid de Sesiones */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {sessions.map(s => (
                    <div key={s.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col group">
                        <div className="p-6 flex-grow">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${s.location_type === 'VIRTUAL' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                    {s.location_type}
                                </span>
                                <div className="text-[10px] font-black text-slate-300 uppercase">{new Date(s.scheduled_at).toLocaleDateString()}</div>
                            </div>
                            <h3 className="text-lg font-black text-slate-900 uppercase leading-none mb-2 group-hover:text-blue-600 transition-colors">{s.topic}</h3>
                            <p className="text-xs text-slate-500 font-bold line-clamp-2 mb-4 leading-relaxed">{s.content}</p>
                            
                            <div className="space-y-3 pt-4 border-t border-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400"><Icons.History className="w-4 h-4" /></div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase leading-none">Instructor</span>
                                        <span className="text-[11px] font-bold text-slate-700 uppercase">{s.instructor}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400"><Icons.History className="w-4 h-4" /></div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase leading-none">Expiración</span>
                                        <span className={`text-[11px] font-bold uppercase ${new Date(s.expires_at) < new Date() ? 'text-red-500' : 'text-slate-700'}`}>
                                            {new Date(s.expires_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-3 gap-2">
                            <button
                                onClick={() => viewAttendance(s)}
                                className="py-3 px-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                            >
                                Asistentes
                            </button>
                            <button
                                onClick={() => { setExtendSession(s); setNewExpiresAt(''); }}
                                className="py-3 px-2 bg-amber-500 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-amber-600 transition-all shadow-md shadow-amber-500/20"
                            >
                                Ampliar
                            </button>
                            <button
                                onClick={() => copyRegistrationLink(s.tracking_token)}
                                className="py-3 px-2 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md shadow-blue-500/20"
                            >
                                Link
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal Asistentes */}
            {selectedSession && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedSession(null)}></div>
                    <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl z-10 overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-300">
                        <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Listado de Asistencia</p>
                                <h2 className="text-xl font-black uppercase tracking-tight">{selectedSession.topic}</h2>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={exportToExcel} className="flex items-center gap-2 px-5 py-3 bg-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all">
                                    <Icons.History className="w-4 h-4" /> Exportar
                                </button>
                                <button onClick={() => setSelectedSession(null)} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-red-500 transition-all">
                                    <Icons.Plus className="w-5 h-5 rotate-45" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-grow overflow-auto p-6">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-white z-10">
                                    <tr className="border-b border-slate-100">
                                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
                                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cédula</th>
                                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</th>
                                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Fecha</th>
                                        <th className="py-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Firma</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {attendance.map((a, idx) => (
                                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="py-4 px-4 font-black text-slate-900 text-xs uppercase">{a.full_name}</td>
                                            <td className="py-4 px-4 font-bold text-slate-600 text-xs">{a.document_number}</td>
                                            <td className="py-4 px-4 font-bold text-slate-500 text-[11px] uppercase">{a.job_title}</td>
                                            <td className="py-4 px-4 font-bold text-slate-400 text-[10px]">{new Date(a.registered_at).toLocaleString()}</td>
                                            <td className="py-4 px-4 text-center">
                                                <img src={a.signature_b64} alt="firma" className="h-8 mx-auto" />
                                            </td>
                                        </tr>
                                    ))}
                                    {attendance.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase text-xs tracking-widest">Aún no hay registros de asistencia</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Ampliar Expiración */}
            {extendSession && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setExtendSession(null)}></div>
                    <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Ampliar Expiración</p>
                                <h2 className="text-sm font-black uppercase tracking-tight line-clamp-1">{extendSession.topic}</h2>
                            </div>
                            <button onClick={() => setExtendSession(null)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl hover:bg-red-500 transition-all">
                                <Icons.Plus className="w-4 h-4 rotate-45" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">Nueva fecha y hora de expiración</label>
                                <input
                                    type="datetime-local"
                                    value={newExpiresAt}
                                    onChange={e => setNewExpiresAt(e.target.value)}
                                    className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-xs outline-none focus:border-amber-400 transition-all"
                                />
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold px-1">
                                Actual: <span className={`font-black ${new Date(extendSession.expires_at) < new Date() ? 'text-red-500' : 'text-slate-700'}`}>
                                    {new Date(extendSession.expires_at).toLocaleString()}
                                </span>
                            </div>
                            <button
                                onClick={handleExtend}
                                disabled={!newExpiresAt}
                                className="w-full py-4 bg-amber-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Guardar Nueva Fecha
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Creación (Resumido por espacio) */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                     <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                     <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-[2.5rem] shadow-2xl z-10 border border-slate-100 animate-in zoom-in-95 duration-300 flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-8 pb-4 flex justify-between items-center bg-white border-b border-slate-50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Programar Sesión</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Nuevos Contenidos y Formación</p>
                            </div>
                            <button type="button" onClick={() => setShowModal(false)} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
                                <Icons.Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>

                        {/* Modal Content (Scrollable) */}
                        <form id="training-form" onSubmit={handleSave} className="flex-grow overflow-y-auto p-8 space-y-6 bg-slate-50/30">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Tema de Capacitación</label>
                                <input required value={form.topic} onChange={e => setForm({...form, topic: e.target.value.toUpperCase()})} placeholder="EJ: SEGURIDAD EN ALTURAS..." className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all shadow-sm" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Descripción / Contenido</label>
                                <textarea required value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Resumen de los puntos tratados..." className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-xs outline-none focus:border-blue-500 transition-all min-h-[100px] shadow-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Instructor</label>
                                    <input required value={form.instructor} onChange={e => setForm({...form, instructor: e.target.value.toUpperCase()})} placeholder="NOMBRE..." className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all shadow-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Medio</label>
                                    <select value={form.locationType} onChange={e => setForm({...form, locationType: e.target.value})} className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all uppercase shadow-sm">
                                        <option value="PRESENCIAL">PRESENCIAL</option>
                                        <option value="VIRTUAL">VIRTUAL</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Fecha y Hora de Inicio</label>
                                <input required type="datetime-local" value={form.scheduledAt} onChange={e => setForm({...form, scheduledAt: e.target.value})} className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all shadow-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Duración (Min)</label>
                                    <input type="number" value={form.durationMinutes} onChange={e => setForm({...form, durationMinutes: e.target.value})} className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all shadow-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase block px-3 tracking-widest">Expiración Link</label>
                                    <input type="datetime-local" value={form.expiresAt} onChange={e => setForm({...form, expiresAt: e.target.value})} className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all shadow-sm" />
                                </div>
                            </div>
                        </form>

                        {/* Modal Footer (Fixed) */}
                        <div className="p-8 bg-white border-t border-slate-50">
                            <button 
                                form="training-form"
                                type="submit" 
                                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center gap-3"
                            >
                                <Icons.Plus className="w-5 h-5" />
                                Guardar y Generar Link
                            </button>
                        </div>

                     </div>
                </div>
            )}
        </div>
    );
};

export default TrainingAdmin;
