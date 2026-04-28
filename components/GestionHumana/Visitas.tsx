import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { formatDate } from '../../utils/formatting';

const fmtDate = (d: string | undefined) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtTime = (d: string | undefined) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
};

interface Visita {
    id?: number;
    fecha_entrada: string;
    nombre: string;
    cedula: string;
    area_dependencia: string;
    cuenta_arl: boolean;
    cuenta_eps: boolean;
    contacto_emergencia: string;
    acuerdo_requisitos: boolean;
    contiene_equipos: boolean;
    marca_dispositivo?: string;
    numero_serie?: string;
    hora_salida?: string;
    registrado_por_nombre?: string;
    fecha_registro?: string;
}

const Visitas: React.FC<{ user: any }> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'registro' | 'consulta'>('registro');
    const [isLoading, setIsLoading] = useState(false);
    const [visitas, setVisitas] = useState<Visita[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    
    // Filtros de consulta
    const [filters, setFilters] = useState({
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        search: ''
    });

    // Formulario de registro
    const initialForm: Visita = {
        fecha_entrada: new Date().toISOString().slice(0, 16),
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
        hora_salida: '',
    };
    const [form, setForm] = useState<Visita>(initialForm);

    useEffect(() => {
        if (activeTab === 'consulta') {
            fetchVisitas();
        }
        fetchAreas();
    }, [activeTab]);

    const fetchAreas = async () => {
        try {
            const res = await api.getGhMiscelaneos('areas');
            setAreas(res || []);
        } catch (error) {
            console.error('Error fetching areas:', error);
        }
    };

    const fetchVisitas = async () => {
        setIsLoading(true);
        try {
            const res = await api.getVisitas(filters);
            setVisitas(res || []);
        } catch (error) {
            toast.error('Error al cargar visitas');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.acuerdo_requisitos) {
            toast.warning('El visitante debe aceptar los requisitos de ingreso');
            return;
        }
        
        setIsLoading(true);
        try {
            const payload = {
                ...form,
                registrado_por_id: user.id,
                registrado_por_nombre: user.name,
                // Si se especificó hora de salida manual, usarla; de lo contrario null
                hora_salida: form.hora_salida ? new Date(form.hora_salida).toISOString() : null
            };
            await api.saveVisita(payload);
            toast.success('Visita registrada exitosamente');
            setForm(initialForm);
            if (activeTab === 'consulta') fetchVisitas();
        } catch (error) {
            toast.error('Error al registrar visita');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMarcarSalida = async (id: number) => {
        try {
            await api.marcarSalidaVisita(id);
            toast.success('Salida registrada');
            fetchVisitas();
        } catch (error) {
            toast.error('Error al registrar salida');
        }
    };

    const filteredVisitas = useMemo(() => {
        return visitas.filter(v => 
            v.nombre.toLowerCase().includes(filters.search.toLowerCase()) ||
            v.cedula.includes(filters.search)
        );
    }, [visitas, filters.search]);

    return (
        <div className="flex flex-col bg-slate-50 p-6 md:p-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Registro de Visitas</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Gestión Humana / Control de Acceso</p>
                </div>

                <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
                    <button 
                        onClick={() => setActiveTab('registro')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'registro' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        Registrar
                    </button>
                    <button 
                        onClick={() => setActiveTab('consulta')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'consulta' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        Consultar
                    </button>
                </div>
            </div>

            {activeTab === 'registro' ? (
                <div className="max-w-4xl mx-auto w-full bg-white rounded-[2.5rem] shadow-xl border border-slate-100">
                    <div className="bg-slate-900 p-8 text-white flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                            <Icons.UserPlus className="text-emerald-500 w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-black uppercase tracking-tight text-lg">Nueva Visita</h3>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Complete los datos del visitante</p>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Fecha y Hora de Entrada</label>
                                <input 
                                    type="datetime-local" 
                                    required
                                    value={form.fecha_entrada}
                                    onChange={e => setForm({...form, fecha_entrada: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nombre Completo</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="Ej: Juan Pérez"
                                    value={form.nombre}
                                    onChange={e => setForm({...form, nombre: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Cédula / Documento</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="12345678"
                                    value={form.cedula}
                                    onChange={e => setForm({...form, cedula: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Área o Dependencia</label>
                                <select 
                                    required
                                    value={form.area_dependencia}
                                    onChange={e => setForm({...form, area_dependencia: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="">Seleccione el área...</option>
                                    {areas.map(area => (
                                        <option key={area.id} value={area.nombre}>{area.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Fecha y Hora de Salida (Opcional)</label>
                                <input 
                                    type="datetime-local" 
                                    value={form.hora_salida}
                                    onChange={e => setForm({...form, hora_salida: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Contacto de Emergencia</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="Nombre y Teléfono"
                                    value={form.contacto_emergencia}
                                    onChange={e => setForm({...form, contacto_emergencia: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">Seguridad Social y Requisitos</h4>
                                
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-600">Cuenta con ARL vigente?</span>
                                    <button 
                                        type="button"
                                        onClick={() => setForm({...form, cuenta_arl: !form.cuenta_arl})}
                                        className={`w-12 h-6 rounded-full transition-all relative ${form.cuenta_arl ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.cuenta_arl ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-600">Cuenta con EPS vigente?</span>
                                    <button 
                                        type="button"
                                        onClick={() => setForm({...form, cuenta_eps: !form.cuenta_eps})}
                                        className={`w-12 h-6 rounded-full transition-all relative ${form.cuenta_eps ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.cuenta_eps ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                <label className="flex items-start gap-3 cursor-pointer group mt-4">
                                    <input 
                                        type="checkbox" 
                                        required
                                        checked={form.acuerdo_requisitos}
                                        onChange={e => setForm({...form, acuerdo_requisitos: e.target.checked})}
                                        className="mt-1 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900" 
                                    />
                                    <span className="text-[10px] font-bold text-slate-500 leading-tight group-hover:text-slate-700 transition-colors">
                                        Acepto los términos y requisitos de ingreso a las instalaciones de la compañía.
                                    </span>
                                </label>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">Equipos y Herramientas</h4>
                                
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-600">Ingresa con equipos?</span>
                                    <button 
                                        type="button"
                                        onClick={() => setForm({...form, contiene_equipos: !form.contiene_equipos})}
                                        className={`w-12 h-6 rounded-full transition-all relative ${form.contiene_equipos ? 'bg-blue-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.contiene_equipos ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                {form.contiene_equipos && (
                                    <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-300">
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Marca / Dispositivo</label>
                                            <input 
                                                type="text" 
                                                placeholder="Ej: Laptop Dell"
                                                value={form.marca_dispositivo}
                                                onChange={e => setForm({...form, marca_dispositivo: e.target.value})}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Número de Serie</label>
                                            <input 
                                                type="text" 
                                                placeholder="SN-12345"
                                                value={form.numero_serie}
                                                onChange={e => setForm({...form, numero_serie: e.target.value})}
                                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-2 pt-4 border-t border-slate-100 flex justify-end">
                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="flex items-center gap-2 px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                            >
                                {isLoading ? <Icons.Loader className="animate-spin w-4 h-4" /> : <Icons.Save className="w-4 h-4" />}
                                Registrar Ingreso
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2 relative">
                            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input 
                                type="text" 
                                placeholder="Buscar por nombre o cédula..."
                                value={filters.search}
                                onChange={e => setFilters({...filters, search: e.target.value})}
                                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium shadow-sm"
                            />
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="date" 
                                value={filters.from}
                                onChange={e => setFilters({...filters, from: e.target.value})}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold uppercase shadow-sm"
                            />
                            <input 
                                type="date" 
                                value={filters.to}
                                onChange={e => setFilters({...filters, to: e.target.value})}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold uppercase shadow-sm"
                            />
                        </div>
                        <button 
                            onClick={fetchVisitas}
                            className="bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                        >
                            <Icons.RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                            Consultar
                        </button>
                    </div>

                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitante</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingreso</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Destino</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Salud/ARL</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Equipos</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredVisitas.map(v => (
                                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-slate-900 uppercase leading-none mb-1">{v.nombre}</span>
                                                    <span className="text-[10px] font-bold text-slate-400">{v.cedula}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-600">{fmtDate(v.fecha_entrada)}</span>
                                                    <span className="text-[10px] font-medium text-slate-400">{fmtTime(v.fecha_entrada)}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-black text-slate-600 uppercase">{v.area_dependencia}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-1.5">
                                                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${v.cuenta_arl ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>ARL</div>
                                                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${v.cuenta_eps ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>EPS</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {v.contiene_equipos ? (
                                                    <div className="flex flex-col items-center">
                                                        <Icons.Laptop className="w-4 h-4 text-blue-500 mb-1" />
                                                        <span className="text-[8px] font-black text-blue-600 uppercase">{v.marca_dispositivo}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {v.hora_salida ? (
                                                    <div className="inline-flex flex-col items-center px-3 py-1 bg-slate-100 text-slate-500 rounded-xl">
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Salida</span>
                                                        <span className="text-[8px] font-bold">{fmtTime(v.hora_salida)}</span>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-xl animate-pulse">
                                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">En Planta</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {!v.hora_salida && (
                                                    <button 
                                                        onClick={() => v.id && handleMarcarSalida(v.id)}
                                                        className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                                    >
                                                        Registrar Salida
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredVisitas.length === 0 && !isLoading && (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-20 text-center">
                                                <Icons.Inbox className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                                <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No se encontraron visitas registradas</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Visitas;
