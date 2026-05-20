import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { formatDate } from '../../utils/formatting';
import { hasPermission } from '../../utils/permissions';

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
    area_nombre?: string;
    cuenta_arl: boolean;
    cuenta_eps: boolean;
    contacto_emergencia: string;
    acuerdo_requisitos: boolean;
    contiene_equipos: boolean;
    marca_dispositivo?: string;
    numero_serie?: string;
    hora_salida?: string;
    registrado_por_id?: string;
    registrado_por_nombre?: string;
    fecha_registro?: string;
    area_id?: number | string;
}

const Visitas: React.FC<{ user: any }> = ({ user }) => {
    const canCreate = hasPermission(user, 'VISITAS_GH', 'create');
    const canEdit = hasPermission(user, 'VISITAS_GH', 'edit');
    const [activeTab, setActiveTab] = useState<'registro' | 'consulta'>(canCreate ? 'registro' : 'consulta');
    const [showQR, setShowQR] = useState(false);
    const PUBLIC_URL = `${window.location.origin}/publico/visitas`;
    const [editingSalidaId, setEditingSalidaId] = useState<number | null>(null);
    const [editingSalidaHora, setEditingSalidaHora] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterArea, setFilterArea] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    // Paginación
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [visitas, setVisitas] = useState<Visita[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    
    // Filtros de consulta
    const [filters, setFilters] = useState({
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        search: '',
        area_id: 'all'
    });

    // Formulario de registro
    const getLocalISOString = () => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000; // offset in milliseconds
        const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
        return localISOTime;
    };

    const initialForm: Visita = {
        fecha_entrada: getLocalISOString(),
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

    const handleExportExcel = () => {
        if (visitas.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        const data = visitas.map(v => ({
            'FECHA Y HORA DE ENTRADA': v.fecha_entrada ? new Date(v.fecha_entrada).toLocaleString('es-CO') : '—',
            'NOMBRE': v.nombre,
            'CÉDULA': v.cedula,
            'AREA O DEPENDENCIA PARA DONDE SE DIRIGE': v.area_nombre || v.area_dependencia,
            'VISITA CUENTA CON ARL': v.cuenta_arl ? 'SÍ' : 'NO',
            'VISITA CUENTA CON EPS': v.cuenta_eps ? 'SÍ' : 'NO',
            'CONTACTO Y NUMERO DE EMERGENCIA': v.contacto_emergencia || '—',
            'ESTA DE ACUERDO CON LOS REQUISITOS DE INGRESO DE MILLA 7': v.acuerdo_requisitos ? 'SÍ' : 'NO',
            'DISPOSITIVO DE COMPUTO O HERRAMIENTAS': v.contiene_equipos ? 'SÍ' : 'NO',
            'MARCA DE DISPOSITIVO O HERRAMIENTA': v.marca_dispositivo || '—',
            'NUMERO DE SERIE': v.numero_serie || '—',
            'HORA DE ENTRADA': v.fecha_entrada ? fmtTime(v.fecha_entrada) : '—',
            'HORA DE SALIDA': v.hora_salida ? fmtTime(v.hora_salida) : 'Pendiente',
            'USUARIO CONTROL': v.registrado_por_nombre || '—',
            'FECHA CONTROL': v.fecha_registro ? fmtDate(v.fecha_registro) : '—'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Visitas");
        XLSX.writeFile(wb, `Reporte_Visitas_${filters.from}_${filters.to}.xlsx`);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.acuerdo_requisitos) {
            toast.warning('El visitante debe aceptar los requisitos de ingreso');
            return;
        }
        
        setIsLoading(true);
        try {
            let combinedSalida = null;
            if (form.hora_salida) {
                // Tomar la fecha de entrada y ponerle la hora de salida especificada
                const datePart = form.fecha_entrada.split('T')[0];
                combinedSalida = `${datePart}T${form.hora_salida}:00`;
            }

            const payload = {
                ...form,
                registrado_por_id: user.id,
                hora_salida: combinedSalida
            };
            await api.saveVisita(payload);
            toast.success('Visita registrada exitosamente');
            setForm({ ...initialForm, fecha_entrada: getLocalISOString() });
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
        return visitas.filter(v => {
            const matchesSearch = !filterSearch || 
                v.nombre.toLowerCase().includes(filterSearch.toLowerCase()) ||
                v.cedula.includes(filterSearch);
            const matchesArea = !filterArea || String(v.area_id) === filterArea;
            return matchesSearch && matchesArea;
        });
    }, [visitas, filterSearch, filterArea]);

    const totalPages = limit === 0 ? 1 : Math.max(1, Math.ceil(filteredVisitas.length / limit));
    const paginatedVisitas = useMemo(() => {
        if (limit === 0) return filteredVisitas;
        const start = (page - 1) * limit;
        return filteredVisitas.slice(start, start + limit);
    }, [filteredVisitas, page, limit]);

    return (
        <div className="flex flex-col bg-slate-50 p-6 md:p-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Registro de Visitas</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Gestión Humana / Control de Acceso</p>
                </div>

                <div className="flex items-center gap-3">
                    {canCreate && (
                        <button
                            onClick={() => setShowQR(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg"
                        >
                            <Icons.Grid className="w-4 h-4" />
                            QR Público
                        </button>
                    )}
                    <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
                        {canCreate && (
                            <button
                                onClick={() => setActiveTab('registro')}
                                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'registro' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Registrar
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('consulta')}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'consulta' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Consultar
                        </button>
                    </div>
                </div>

                {/* Modal QR */}
                {showQR && (
                    <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowQR(false)}>
                        <div className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-sm w-full text-center animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <div className="text-left">
                                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Registro Público</h3>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Formulario sin login</p>
                                </div>
                                <button onClick={() => setShowQR(false)} className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all">
                                    <Icons.X className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>

                            <div className="bg-slate-50 rounded-3xl p-6 mb-6 flex items-center justify-center">
                                <QRCodeSVG value={PUBLIC_URL} size={180} bgColor="#f8fafc" fgColor="#0f172a" level="M" />
                            </div>

                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Link directo</p>
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-6">
                                <p className="text-[10px] font-bold text-slate-700 truncate flex-1 text-left">{PUBLIC_URL}</p>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(PUBLIC_URL); toast.success('Link copiado'); }}
                                    className="flex-shrink-0 w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-emerald-600 transition-all"
                                >
                                    <Icons.Copy className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <p className="text-[9px] text-slate-400 leading-relaxed">Escanee el QR o comparta el link. Cualquier persona puede registrar su visita sin necesidad de iniciar sesión.</p>
                        </div>
                    </div>
                )}
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
                                        <option key={area.id} value={area.id}>{area.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Hora de Salida (Opcional)</label>
                                <input 
                                    type="time" 
                                    value={form.hora_salida}
                                    onChange={e => setForm({...form, hora_salida: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                                <p className="mt-1 text-[8px] font-bold text-slate-400 uppercase ml-1">Solo si la visita ya concluyó</p>
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
                    {/* FILTROS DE CONSULTA */}
                    <div className="p-8 bg-white border-b border-slate-100">
                        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                            <div className="flex-1 space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Visitante</label>
                                <div className="relative">
                                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text"
                                        placeholder="Nombre o Cédula..."
                                        value={filters.search}
                                        onChange={e => setFilters({...filters, search: e.target.value})}
                                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="w-full lg:w-48 space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Área / Destino</label>
                                <select 
                                    value={filters.area_id}
                                    onChange={e => setFilters({...filters, area_id: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="all">Todas las áreas</option>
                                    {areas.map(a => (
                                        <option key={a.id} value={a.id}>{a.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="w-full lg:w-44 space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Desde</label>
                                <input 
                                    type="date"
                                    value={filters.from}
                                    onChange={e => setFilters({...filters, from: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>

                            <div className="w-full lg:w-44 space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hasta</label>
                                <input 
                                    type="date"
                                    value={filters.to}
                                    onChange={e => setFilters({...filters, to: e.target.value})}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all"
                                />
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    onClick={fetchVisitas}
                                    disabled={isLoading}
                                    className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Icons.Search className="w-4 h-4" />
                                    {isLoading ? 'Cargando...' : 'Consultar'}
                                </button>
                                <button 
                                    onClick={handleExportExcel}
                                    className="px-4 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
                                    title="Exportar a Excel"
                                >
                                    <Icons.Download className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Fecha y Hora de Entrada</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Nombre</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Cédula</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Area o Dependencia para donde se dirige</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Visita cuenta con ARL</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Visita cuenta con EPS</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Contacto y Número de Emergencia</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Esta de acuerdo con los requisitos</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Dispositivo de Computo</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Marca</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Número de Serie</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Hora de Entrada</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-center">Hora de Salida</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Usuario Control</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Fecha Control</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {paginatedVisitas.map(v => (
                                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-600">
                                                {v.fecha_entrada ? new Date(v.fecha_entrada).toLocaleString('es-CO') : '—'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-black text-slate-900 uppercase">
                                                {v.nombre}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-500">
                                                {v.cedula}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-black text-slate-700 uppercase">
                                                {v.area_nombre || v.area_dependencia}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${v.cuenta_arl ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {v.cuenta_arl ? 'SÍ' : 'NO'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${v.cuenta_eps ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {v.cuenta_eps ? 'SÍ' : 'NO'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-600">
                                                {v.contacto_emergencia || '—'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-[10px] font-black text-slate-600">
                                                {v.acuerdo_requisitos ? 'SÍ' : 'NO'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-[10px] font-black text-slate-600">
                                                {v.contiene_equipos ? 'SÍ' : 'NO'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-600 uppercase">
                                                {v.marca_dispositivo || '—'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-600 uppercase">
                                                {v.numero_serie || '—'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-[10px] font-bold text-slate-600">
                                                {v.fecha_entrada ? fmtTime(v.fecha_entrada) : '—'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                {editingSalidaId === v.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="time"
                                                            value={editingSalidaHora}
                                                            onChange={e => setEditingSalidaHora(e.target.value)}
                                                            className="px-2 py-1 text-[10px] font-bold border border-emerald-300 rounded-lg outline-none focus:border-emerald-500 w-24"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={async () => {
                                                                if (!editingSalidaHora) return;
                                                                await api.marcarSalidaVisita(v.id!, editingSalidaHora);
                                                                toast.success('Hora de salida registrada');
                                                                setEditingSalidaId(null);
                                                                setEditingSalidaHora('');
                                                                fetchVisitas();
                                                            }}
                                                            className="w-6 h-6 bg-emerald-500 text-white rounded-lg flex items-center justify-center hover:bg-emerald-600 transition-all flex-shrink-0"
                                                        >
                                                            <Icons.Check className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => { setEditingSalidaId(null); setEditingSalidaHora(''); }}
                                                            className="w-6 h-6 bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-300 transition-all flex-shrink-0"
                                                        >
                                                            <Icons.X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : v.hora_salida ? (
                                                    <div className="flex items-center gap-1 justify-center group">
                                                        <span className="text-[10px] font-black text-slate-500">{fmtTime(v.hora_salida)}</span>
                                                        {canEdit && (
                                                            <button
                                                                onClick={() => { setEditingSalidaId(v.id!); setEditingSalidaHora(new Date(v.hora_salida!).toTimeString().slice(0,5)); }}
                                                                className="opacity-0 group-hover:opacity-100 w-5 h-5 bg-slate-100 rounded flex items-center justify-center transition-all"
                                                            >
                                                                <Icons.Edit className="w-2.5 h-2.5 text-slate-400" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    canEdit ? (
                                                        <button
                                                            onClick={() => { setEditingSalidaId(v.id!); setEditingSalidaHora(''); }}
                                                            className="text-[10px] font-black text-emerald-600 animate-pulse uppercase hover:animate-none hover:bg-emerald-50 px-2 py-1 rounded-lg transition-all"
                                                        >
                                                            En Planta
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] font-black text-slate-400 uppercase">En Planta</span>
                                                    )
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-400 uppercase">
                                                {v.registrado_por_id === 'AUTOREGISTRO' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wide">
                                                        <Icons.Link className="w-2.5 h-2.5" />
                                                        Link Público
                                                    </span>
                                                ) : (
                                                    v.registrado_por_nombre || '—'
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-bold text-slate-400">
                                                {v.fecha_registro ? fmtDate(v.fecha_registro) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredVisitas.length === 0 && !isLoading && (
                                        <tr>
                                            <td colSpan={15} className="px-6 py-20 text-center">
                                                <Icons.Inbox className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                                <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No se encontraron visitas registradas</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        <div className="px-8 py-4 border-t border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/30">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase text-slate-400">Mostrar</span>
                                    <select 
                                        value={limit} 
                                        onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                                        className="h-8 px-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                                    >
                                        <option value={5}>5</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={0}>TODOS</option>
                                    </select>
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Total resultados: <span className="text-emerald-600">{filteredVisitas.length}</span>
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button 
                                    disabled={page === 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm"
                                >
                                    <Icons.ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="px-4 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                    <span className="text-[10px] font-black text-slate-600 uppercase">
                                        Página <span className="text-emerald-600">{page}</span> de {totalPages}
                                    </span>
                                </div>
                                <button 
                                    disabled={page === totalPages || limit === 0}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all shadow-sm"
                                >
                                    <Icons.ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Visitas;
