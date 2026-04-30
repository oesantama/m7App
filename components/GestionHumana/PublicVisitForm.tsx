import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200">
        <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide">{label}</span>
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-7' : 'left-1'}`} />
        </button>
    </div>
);

const PublicVisitForm: React.FC = () => {
    const [areas, setAreas] = useState<{ id: string; nombre: string }[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const getLocalISO = () => {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    const [form, setForm] = useState({
        nombre: '',
        cedula: '',
        area_dependencia: '',
        cuenta_arl: false,
        cuenta_eps: false,
        contacto_emergencia: '',
        acuerdo_requisitos: false,
        contiene_equipos: false,
        marca_dispositivo: '',
        numero_serie: '',
        fecha_entrada: getLocalISO(),
    });

    useEffect(() => {
        fetch(`${API_URL}/gh-visitas/public/areas`)
            .then(r => r.json())
            .then(data => setAreas(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, []);

    const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.nombre.trim() || !form.cedula.trim()) {
            toast.error('Nombre y cédula son obligatorios');
            return;
        }
        if (!form.area_dependencia) {
            toast.error('Seleccione el área o dependencia');
            return;
        }
        if (!form.acuerdo_requisitos) {
            toast.error('Debe aceptar los requisitos de ingreso');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/gh-visitas/public/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al registrar');
            setSubmitted(true);
        } catch (err: any) {
            toast.error(err.message || 'Error al enviar el formulario');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-6">
                <Toaster position="top-right" richColors />
                <div className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-md w-full text-center animate-in zoom-in-95">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">¡Registro Exitoso!</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6">Su ingreso ha sido registrado correctamente</p>
                    <p className="text-slate-400 text-[11px]">Bienvenido/a a las instalaciones. Por favor diríjase al área indicada.</p>
                    <button
                        onClick={() => { setSubmitted(false); setForm({ nombre: '', cedula: '', area_dependencia: '', cuenta_arl: false, cuenta_eps: false, contacto_emergencia: '', acuerdo_requisitos: false, contiene_equipos: false, marca_dispositivo: '', numero_serie: '', fecha_entrada: getLocalISO() }); }}
                        className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all"
                    >
                        Nuevo Registro
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-start justify-center p-4 py-10">
            <Toaster position="top-right" richColors />
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-3xl shadow-xl mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Registro de Visitas</h1>
                    <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Control de Acceso · Milla 7</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="bg-slate-900 px-8 py-5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Complete todos los datos requeridos para ingresar</p>
                    </div>

                    <div className="p-8 space-y-5">
                        {/* Fecha */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Fecha y Hora de Entrada</label>
                            <input
                                type="datetime-local"
                                value={form.fecha_entrada}
                                onChange={e => set('fecha_entrada', e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                            />
                        </div>

                        {/* Nombre */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nombre Completo <span className="text-red-400">*</span></label>
                            <input
                                type="text"
                                required
                                value={form.nombre}
                                onChange={e => set('nombre', e.target.value.toUpperCase())}
                                placeholder="Ej: Juan Pérez"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                            />
                        </div>

                        {/* Cédula */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Cédula / Documento <span className="text-red-400">*</span></label>
                            <input
                                type="text"
                                required
                                value={form.cedula}
                                onChange={e => set('cedula', e.target.value)}
                                placeholder="12345678"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                            />
                        </div>

                        {/* Área */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Área o Dependencia <span className="text-red-400">*</span></label>
                            <select
                                required
                                value={form.area_dependencia}
                                onChange={e => set('area_dependencia', e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                            >
                                <option value="">Seleccione el área...</option>
                                {areas.map(a => (
                                    <option key={a.id} value={a.id}>{a.nombre}</option>
                                ))}
                            </select>
                        </div>

                        {/* Contacto emergencia */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Contacto y Número de Emergencia</label>
                            <input
                                type="text"
                                value={form.contacto_emergencia}
                                onChange={e => set('contacto_emergencia', e.target.value)}
                                placeholder="Nombre — 3001234567"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                            />
                        </div>

                        {/* Seguridad social */}
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Seguridad Social y Requisitos</p>
                            <Toggle label="Cuenta con ARL vigente?" checked={form.cuenta_arl} onChange={v => set('cuenta_arl', v)} />
                            <Toggle label="Cuenta con EPS vigente?" checked={form.cuenta_eps} onChange={v => set('cuenta_eps', v)} />
                        </div>

                        {/* Equipos */}
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Equipos y Herramientas</p>
                            <Toggle label="¿Ingresa con equipos?" checked={form.contiene_equipos} onChange={v => set('contiene_equipos', v)} />
                            {form.contiene_equipos && (
                                <div className="space-y-3 animate-in slide-in-from-top-2">
                                    <input
                                        type="text"
                                        value={form.marca_dispositivo}
                                        onChange={e => set('marca_dispositivo', e.target.value)}
                                        placeholder="Marca del dispositivo o herramienta"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                                    />
                                    <input
                                        type="text"
                                        value={form.numero_serie}
                                        onChange={e => set('numero_serie', e.target.value)}
                                        placeholder="Número de serie"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Acuerdo */}
                        <div
                            onClick={() => set('acuerdo_requisitos', !form.acuerdo_requisitos)}
                            className={`flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${form.acuerdo_requisitos ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                        >
                            <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-all ${form.acuerdo_requisitos ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                {form.acuerdo_requisitos && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                                Acepto los términos y requisitos de ingreso a las instalaciones de la compañía.
                                <span className="text-red-400 ml-1">*</span>
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Registrando...
                                </>
                            ) : 'Registrar Visita'}
                        </button>
                    </div>
                </form>

                <p className="text-center text-slate-600 text-[9px] font-bold uppercase tracking-widest mt-6">
                    Milla 7 · Sistema de Control de Acceso
                </p>
            </div>
        </div>
    );
};

export default PublicVisitForm;
