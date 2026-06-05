import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
    ClipboardList, Plus, Eye, RefreshCw, CheckCircle2, AlertTriangle,
    XCircle, Lock, Unlock, ChevronDown, ChevronUp, Save, X, KeyRound,
    PackageSearch, Loader2, BadgeCheck, ShieldAlert, Archive, Search,
} from 'lucide-react';
import { api } from '../../services/api';

interface Props { user: any }

interface Sesion {
    id: number;
    titulo: string;
    fecha_apertura: string;
    fecha_cierre: string | null;
    created_by: string;
    assigned_to: string;
    estado: 'ABIERTO' | 'EN_CONTEO' | 'PENDIENTE_AUTORIZACION' | 'CERRADO' | 'ANULADO';
    observaciones: string | null;
    total_items: number;
    items_con_diferencia: number;
    items_justificados: number;
}

interface Item {
    id: number;
    inventario_id: number;
    elemento_id: number;
    elemento_nombre: string;
    cantidad_sistema: number;
    cantidad_fisica: number | null;
    cantidad_final: number | null;
    diferencia: number | null;
    tipo_diferencia: 'PENDIENTE' | 'OK' | 'SOBRANTE' | 'FALTANTE';
    justificacion: string | null;
    estado_justificacion: 'PENDIENTE' | 'JUSTIFICADO';
}

interface Elemento { id: number; nombre: string; stock: number }

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    ABIERTO:                 { label: 'Abierto',          color: 'bg-blue-100 text-blue-700',    icon: <PackageSearch size={12} /> },
    EN_CONTEO:               { label: 'En Conteo',        color: 'bg-amber-100 text-amber-700',  icon: <ClipboardList size={12} /> },
    PENDIENTE_AUTORIZACION:  { label: 'Pend. Autorización', color: 'bg-purple-100 text-purple-700', icon: <Lock size={12} /> },
    CERRADO:                 { label: 'Cerrado',          color: 'bg-emerald-100 text-emerald-700', icon: <BadgeCheck size={12} /> },
    ANULADO:                 { label: 'Anulado',          color: 'bg-rose-100 text-rose-700',    icon: <XCircle size={12} /> },
};

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';

export default function InventarioFisico({ user }: Props) {
    const isSuper = user?.roleId === 'ROL-01' || user?.email === 'admin@millasiete.com';
    const userName = user?.name || user?.email || 'Usuario';

    // ── Vistas ────────────────────────────────────────────────────────────────
    const [vista, setVista] = useState<'lista' | 'detalle'>('lista');
    const [sesionActiva, setSesionActiva] = useState<Sesion | null>(null);
    const [items, setItems] = useState<Item[]>([]);

    // ── Listas ────────────────────────────────────────────────────────────────
    const [sesiones, setSesiones] = useState<Sesion[]>([]);
    const [elementos, setElementos] = useState<Elemento[]>([]);
    const [cargando, setCargando] = useState(false);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);

    // ── Formulario nueva sesión ───────────────────────────────────────────────
    const [showForm, setShowForm] = useState(false);
    const [formTitulo, setFormTitulo] = useState('');
    const [formAuditor, setFormAuditor] = useState('');
    const [formObs, setFormObs] = useState('');
    const [formElementos, setFormElementos] = useState<number[]>([]);
    const [formSearchElemento, setFormSearchElemento] = useState('');
    const [creando, setCreando] = useState(false);

    // ── Conteo ────────────────────────────────────────────────────────────────
    const [conteos, setConteos] = useState<Record<number, string>>({}); // elemento_id → valor
    const [guardandoConteos, setGuardandoConteos] = useState(false);
    const [searchConteo, setSearchConteo] = useState('');
    const [showConfirmConteos, setShowConfirmConteos] = useState(false);

    // ── Justificaciones ───────────────────────────────────────────────────────
    const [justifs, setJustifs] = useState<Record<number, string>>({}); // item_id → texto
    const [cantFinal, setCantFinal] = useState<Record<number, string>>({}); // item_id → cantidad_final
    const [guardandoJustifs, setGuardandoJustifs] = useState(false);

    // ── Módal generación de código (supervisor) ───────────────────────────────
    const [showGenCodigo, setShowGenCodigo] = useState(false);
    const [codigoGenerado, setCodigoGenerado] = useState<{ codigo: string; expira_at: string } | null>(null);
    const [generandoCodigo, setGenerandoCodigo] = useState(false);

    // ── Módal cierre (auditor) ────────────────────────────────────────────────
    const [showCierre, setShowCierre] = useState(false);
    const [codigoIngresado, setCodigoIngresado] = useState('');
    const [cerrando, setCerrando] = useState(false);

    // ── Módal anular ──────────────────────────────────────────────────────────
    const [showAnular, setShowAnular] = useState(false);
    const [motivoAnular, setMotivoAnular] = useState('');
    const [anulando, setAnulando] = useState(false);

    // ── Cargar lista de sesiones ──────────────────────────────────────────────
    const cargarSesiones = async () => {
        setCargando(true);
        try {
            const res = await api.getInventariosFisicos();
            if (res.success) setSesiones(res.data);
        } catch { toast.error('Error al cargar sesiones'); }
        finally { setCargando(false); }
    };

    // ── Cargar elementos (para formulario) ───────────────────────────────────
    const cargarElementos = async () => {
        try {
            const res = await api.getGhDropdownElementos();
            if (res.success) setElementos(res.data || []);
        } catch {}
    };

    useEffect(() => {
        cargarSesiones();
        cargarElementos();
    }, []);

    // ── Abrir sesión en detalle ───────────────────────────────────────────────
    const abrirDetalle = async (sesion: Sesion) => {
        setCargandoDetalle(true);
        setSesionActiva(sesion);
        setVista('detalle');
        setConteos({});
        setJustifs({});
        try {
            const res = await api.getInventarioFisicoById(sesion.id);
            if (res.success) {
                setSesionActiva(res.data.sesion);
                setItems(res.data.items);
                // Pre-cargar conteos guardados
                const c: Record<number, string> = {};
                res.data.items.forEach((it: Item) => {
                    if (it.cantidad_fisica !== null) c[it.elemento_id] = String(it.cantidad_fisica);
                });
                setConteos(c);
                // Pre-cargar justificaciones guardadas
                const j: Record<number, string> = {};
                res.data.items.forEach((it: Item) => {
                    if (it.justificacion) j[it.id] = it.justificacion;
                });
                setJustifs(j);
                // Pre-cargar cantidad_final (si no existe, usar cantidad_fisica)
                const cf: Record<number, string> = {};
                res.data.items.forEach((it: Item) => {
                    if (it.tipo_diferencia === 'SOBRANTE' || it.tipo_diferencia === 'FALTANTE') {
                        cf[it.id] = String(it.cantidad_final ?? it.cantidad_fisica ?? 0);
                    }
                });
                setCantFinal(cf);
            }
        } catch { toast.error('Error al cargar detalle'); }
        finally { setCargandoDetalle(false); }
    };

    const refrescarDetalle = () => { if (sesionActiva) abrirDetalle(sesionActiva); };

    // ── Crear nueva sesión ────────────────────────────────────────────────────
    const handleCrear = async () => {
        if (!formTitulo.trim()) return toast.error('Ingrese un título');
        if (!formAuditor.trim()) return toast.error('Ingrese el auditor asignado');
        setCreando(true);
        try {
            const res = await api.createInventarioFisico({
                titulo: formTitulo.trim(),
                assigned_to: formAuditor.trim(),
                created_by: userName,
                observaciones: formObs.trim() || undefined,
                elementos_ids: formElementos.length > 0 ? formElementos : undefined,
            });
            if (res.success) {
                toast.success(`Sesión creada con ${res.total_elementos} elementos`);
                setShowForm(false);
                setFormTitulo(''); setFormAuditor(''); setFormObs(''); setFormElementos([]); setFormSearchElemento('');
                await cargarSesiones();
            } else {
                toast.error(res.error || 'Error al crear sesión');
            }
        } catch (e: any) {
            toast.error(e?.message || 'Error al crear sesión');
        } finally { setCreando(false); }
    };

    // ── Guardar conteos ───────────────────────────────────────────────────────
    const contadosCount = Object.values(conteos).filter(v => v !== '').length;
    const noContadosCount = items.length - contadosCount;

    const handleGuardarConteos = () => {
        if (contadosCount === 0) return toast.warning('Ingrese al menos un conteo');
        setShowConfirmConteos(true);
    };

    const executeGuardarConteos = async () => {
        setShowConfirmConteos(false);
        setGuardandoConteos(true);
        // todos los ítems: contados con su valor, no contados → 0
        const lista = items.map(it => ({
            elemento_id: it.elemento_id,
            cantidad_fisica: conteos[it.elemento_id] !== undefined && conteos[it.elemento_id] !== ''
                ? Number(conteos[it.elemento_id])
                : 0,
        }));
        try {
            const res = await api.saveConteos(sesionActiva!.id, lista);
            if (res.success) {
                toast.success('Conteos guardados — el conteo ya no es modificable');
                refrescarDetalle();
            } else toast.error(res.error || 'Error');
        } catch { toast.error('Error al guardar conteos'); }
        finally { setGuardandoConteos(false); }
    };

    // ── Guardar justificaciones ───────────────────────────────────────────────
    const handleGuardarJustifs = async () => {
        const itemsConDiff = items.filter(it => it.tipo_diferencia === 'SOBRANTE' || it.tipo_diferencia === 'FALTANTE');
        const sinJustif = itemsConDiff.filter(it => !justifs[it.id]?.trim());
        if (sinJustif.length > 0) {
            return toast.error(`Faltan ${sinJustif.length} justificación(es) por completar`);
        }
        // Si se modificó cantidad_final, la justificación es obligatoria (ya validada arriba)
        const lista = itemsConDiff.map(it => ({
            item_id: it.id,
            justificacion: justifs[it.id].trim(),
            cantidad_final: cantFinal[it.id] !== undefined ? Number(cantFinal[it.id]) : (it.cantidad_fisica ?? 0),
        }));
        setGuardandoJustifs(true);
        try {
            const res = await api.saveJustificaciones(sesionActiva!.id, lista);
            if (res.success) {
                toast.success(res.nuevo_estado === 'PENDIENTE_AUTORIZACION'
                    ? '¡Todas justificadas! Sesión lista para autorización'
                    : 'Justificaciones guardadas');
                refrescarDetalle();
            } else toast.error(res.error || 'Error');
        } catch { toast.error('Error al guardar justificaciones'); }
        finally { setGuardandoJustifs(false); }
    };

    // ── Generar código (supervisor) ───────────────────────────────────────────
    const handleGenerarCodigo = async () => {
        setGenerandoCodigo(true);
        try {
            const res = await api.generarCodigoInventario(sesionActiva!.id, userName);
            if (res.success) {
                setCodigoGenerado(res.data);
                toast.success('Código generado — válido 30 minutos');
            } else toast.error(res.error || 'Error');
        } catch (e: any) { toast.error(e?.message || 'Error'); }
        finally { setGenerandoCodigo(false); }
    };

    // ── Cerrar inventario ─────────────────────────────────────────────────────
    const handleCerrar = async () => {
        if (!codigoIngresado.trim()) return toast.error('Ingrese el código');
        setCerrando(true);
        try {
            const res = await api.cerrarInventarioFisico(sesionActiva!.id, codigoIngresado.trim(), userName);
            if (res.success) {
                toast.success(`Inventario cerrado — ${res.ajustes} ajuste(s) aplicados`);
                setShowCierre(false);
                setCodigoIngresado('');
                setVista('lista');
                cargarSesiones();
            } else toast.error(res.error || 'Error');
        } catch (e: any) { toast.error(e?.message || 'Error'); }
        finally { setCerrando(false); }
    };

    // ── Anular ────────────────────────────────────────────────────────────────
    const handleAnular = async () => {
        if (!motivoAnular.trim()) return toast.error('Ingrese un motivo');
        setAnulando(true);
        try {
            const res = await api.anularInventarioFisico(sesionActiva!.id, motivoAnular.trim());
            if (res.success) {
                toast.success('Sesión anulada');
                setShowAnular(false);
                setVista('lista');
                cargarSesiones();
            } else toast.error(res.error || 'Error');
        } catch { toast.error('Error al anular'); }
        finally { setAnulando(false); }
    };

    // ── KPIs de conciliación ──────────────────────────────────────────────────
    const kpis = useMemo(() => {
        const total = items.length;
        const contados = items.filter(i => i.cantidad_fisica !== null).length;
        const ok = items.filter(i => i.tipo_diferencia === 'OK').length;
        const sobrantes = items.filter(i => i.tipo_diferencia === 'SOBRANTE').length;
        const faltantes = items.filter(i => i.tipo_diferencia === 'FALTANTE').length;
        const justificados = items.filter(i => (i.tipo_diferencia === 'SOBRANTE' || i.tipo_diferencia === 'FALTANTE') && i.estado_justificacion === 'JUSTIFICADO').length;
        const pendJustif = sobrantes + faltantes - justificados;
        return { total, contados, ok, sobrantes, faltantes, justificados, pendJustif };
    }, [items]);

    // ── Items filtrados en conteo ─────────────────────────────────────────────
    const itemsFiltrados = useMemo(() => {
        if (!searchConteo.trim()) return items;
        return items.filter(i => i.elemento_nombre.toLowerCase().includes(searchConteo.toLowerCase()));
    }, [items, searchConteo]);

    const itemsConDiff = items.filter(i => i.tipo_diferencia === 'SOBRANTE' || i.tipo_diferencia === 'FALTANTE');

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER LISTA
    // ─────────────────────────────────────────────────────────────────────────
    if (vista === 'lista') return (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">INVENTARIO FÍSICO</h1>
                    <p className="text-slate-500 text-sm font-bold flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        Control de toma física y conciliación de inventario
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={cargarSesiones} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-sm">
                        <RefreshCw size={16} /> Refrescar
                    </button>
                    {isSuper && (
                        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all flex items-center gap-2 font-black text-sm shadow-lg shadow-indigo-500/30">
                            <Plus size={16} /> Nueva Sesión
                        </button>
                    )}
                </div>
            </div>

            {/* Tabla de sesiones */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                {cargando ? (
                    <div className="flex justify-center items-center py-20"><Loader2 className="animate-spin text-indigo-500" size={48} /></div>
                ) : sesiones.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Archive size={48} className="text-slate-200" />
                        <p className="text-slate-400 font-bold uppercase text-sm">No hay sesiones de inventario</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-6 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">ID / Título</th>
                                <th className="px-4 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                                <th className="px-4 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Auditor</th>
                                <th className="px-4 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Apertura</th>
                                <th className="px-4 py-4 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Cierre</th>
                                <th className="px-4 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Ítems / Dif.</th>
                                <th className="px-6 py-4 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {sesiones.map(s => {
                                const cfg = ESTADO_CONFIG[s.estado];
                                return (
                                    <tr key={s.id} className="hover:bg-slate-50/50 transition-all">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] text-slate-400 font-bold">#{s.id}</span>
                                                <span className="font-black text-slate-800 text-sm">{s.titulo}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ${cfg.color}`}>
                                                {cfg.icon} {cfg.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-600 font-bold">{s.assigned_to}</td>
                                        <td className="px-4 py-4 text-xs text-slate-500">{fmt(s.fecha_apertura)}</td>
                                        <td className="px-4 py-4 text-xs text-slate-500">{s.fecha_cierre ? fmt(s.fecha_cierre) : '---'}</td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="text-sm font-black text-slate-700">{s.total_items}</span>
                                            {Number(s.items_con_diferencia) > 0 && (
                                                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black">
                                                    {s.items_con_diferencia} dif.
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => abrirDetalle(s)}
                                                className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 mx-auto"
                                            >
                                                <Eye size={14} /> Ver
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal: Nueva Sesión */}
            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
                        <div className="p-8 space-y-5">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-black text-slate-800 uppercase">Nueva Sesión de Inventario</h2>
                                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Título *</label>
                                    <input value={formTitulo} onChange={e => setFormTitulo(e.target.value)}
                                        placeholder="Ej: Inventario Bodega Junio 2026"
                                        className="mt-1 w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auditor Asignado *</label>
                                    <input value={formAuditor} onChange={e => setFormAuditor(e.target.value)}
                                        placeholder="Nombre de quien realizará el conteo"
                                        className="mt-1 w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Observaciones</label>
                                    <textarea value={formObs} onChange={e => setFormObs(e.target.value)}
                                        placeholder="Notas adicionales (opcional)"
                                        rows={2}
                                        className="mt-1 w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 resize-none" />
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-xs text-amber-700 font-bold">
                                        <span className="font-black">Elementos a incluir:</span> Se incluirán todos los elementos activos del inventario.
                                        Si desea un subconjunto específico, selecciónelo a continuación (opcional).
                                    </p>
                                    {elementos.length > 0 && (
                                        <>
                                            <div className="relative mt-2 mb-1.5">
                                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400" />
                                                <input
                                                    value={formSearchElemento}
                                                    onChange={e => setFormSearchElemento(e.target.value)}
                                                    placeholder="Buscar elemento..."
                                                    className="w-full pl-7 pr-3 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-bold outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div className="max-h-36 overflow-y-auto space-y-1">
                                                {elementos
                                                    .filter(el => el.nombre.toLowerCase().includes(formSearchElemento.toLowerCase()))
                                                    .map(el => (
                                                        <label key={el.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-amber-100/50 px-1 py-0.5 rounded">
                                                            <input type="checkbox"
                                                                checked={formElementos.includes(el.id)}
                                                                onChange={e => {
                                                                    if (e.target.checked) setFormElementos(p => [...p, el.id]);
                                                                    else setFormElementos(p => p.filter(x => x !== el.id));
                                                                }} />
                                                            {el.nombre}
                                                        </label>
                                                    ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 flex gap-3 border-t border-slate-100">
                            <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-500 hover:bg-slate-100">Cancelar</button>
                            <button onClick={handleCrear} disabled={creando}
                                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-50">
                                {creando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Crear Sesión
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER DETALLE
    // ─────────────────────────────────────────────────────────────────────────
    if (!sesionActiva) return null;
    const cfg = ESTADO_CONFIG[sesionActiva.estado];
    const puedeContar = sesionActiva.estado === 'ABIERTO';
    const puedeVerConteo = ['ABIERTO', 'EN_CONTEO'].includes(sesionActiva.estado);
    const puedeJustificar = ['EN_CONTEO', 'PENDIENTE_AUTORIZACION'].includes(sesionActiva.estado);
    const puedeGenCodigo = sesionActiva.estado === 'PENDIENTE_AUTORIZACION' && isSuper;
    const puedeCerrar = sesionActiva.estado === 'PENDIENTE_AUTORIZACION';
    const puedeAnular = !['CERRADO', 'ANULADO'].includes(sesionActiva.estado) && isSuper;

    return (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header detalle */}
            <div className="flex flex-col lg:flex-row justify-between items-start gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => setVista('lista')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                        <ChevronDown size={20} className="rotate-90" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-slate-900 uppercase">{sesionActiva.titulo}</h1>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black ${cfg.color}`}>
                                {cfg.icon} {cfg.label}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold mt-1">
                            Auditor: <span className="text-slate-600">{sesionActiva.assigned_to}</span>
                            {' · '}Creado por: <span className="text-slate-600">{sesionActiva.created_by}</span>
                            {' · '}Apertura: <span className="text-slate-600">{fmt(sesionActiva.fecha_apertura)}</span>
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={refrescarDetalle} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-1.5 text-xs font-bold">
                        <RefreshCw size={14} /> Refrescar
                    </button>
                    {puedeAnular && (
                        <button onClick={() => setShowAnular(true)} className="px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all flex items-center gap-1.5 text-xs font-bold">
                            <XCircle size={14} /> Anular
                        </button>
                    )}
                    {puedeGenCodigo && (
                        <button onClick={() => setShowGenCodigo(true)} className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition-all flex items-center gap-1.5 text-xs font-black shadow-lg shadow-purple-500/30">
                            <KeyRound size={14} /> Generar Código
                        </button>
                    )}
                    {puedeCerrar && (
                        <button onClick={() => setShowCierre(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all flex items-center gap-1.5 text-xs font-black shadow-lg shadow-emerald-500/30">
                            <Unlock size={14} /> Aplicar Ajustes
                        </button>
                    )}
                </div>
            </div>

            {cargandoDetalle ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" size={48} /></div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {[
                            { label: 'Total Ítems', value: kpis.total, color: 'text-slate-700', bg: 'bg-slate-50' },
                            { label: 'Contados', value: kpis.contados, color: 'text-blue-700', bg: 'bg-blue-50' },
                            { label: 'Sin Diferencia', value: kpis.ok, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                            { label: 'Sobrantes', value: kpis.sobrantes, color: 'text-amber-700', bg: 'bg-amber-50' },
                            { label: 'Faltantes', value: kpis.faltantes, color: 'text-rose-700', bg: 'bg-rose-50' },
                            { label: 'Justificados', value: kpis.justificados, color: 'text-purple-700', bg: 'bg-purple-50' },
                            { label: 'Pend. Justif.', value: kpis.pendJustif, color: kpis.pendJustif > 0 ? 'text-rose-700' : 'text-emerald-700', bg: kpis.pendJustif > 0 ? 'bg-rose-50' : 'bg-emerald-50' },
                        ].map(k => (
                            <div key={k.label} className={`${k.bg} rounded-2xl p-4 text-center`}>
                                <div className={`text-2xl font-black ${k.color}`}>{k.value}</div>
                                <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">{k.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* ─── SECCIÓN CONTEO ─────────────────────────────────── */}
                    {puedeVerConteo && (
                        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                                <h3 className="font-black text-slate-800 uppercase flex items-center gap-2">
                                    <ClipboardList size={18} className="text-indigo-500" /> Registro de Conteo Físico
                                </h3>
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input value={searchConteo} onChange={e => setSearchConteo(e.target.value)}
                                        placeholder="Buscar elemento..."
                                        className="pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-400 w-52" />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50/50">
                                            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Elemento</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad Física Contada</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {itemsFiltrados.map(it => {
                                            const val = conteos[it.elemento_id] ?? '';
                                            return (
                                                <tr key={it.id} className="hover:bg-slate-50/50">
                                                    <td className="px-6 py-3 font-bold text-slate-700 text-sm">{it.elemento_nombre}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {puedeContar ? (
                                                        <input
                                                            type="number" min="0"
                                                            value={val}
                                                            onChange={e => setConteos(p => ({ ...p, [it.elemento_id]: e.target.value }))}
                                                            className="w-24 px-3 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-center font-black text-sm outline-none focus:border-indigo-500 transition-all"
                                                            placeholder="—"
                                                        />
                                                    ) : (
                                                        <span className="font-black text-slate-700 text-sm">
                                                            {val !== '' ? val : <span className="text-slate-300">—</span>}
                                                        </span>
                                                    )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {puedeContar && (
                                <div className="p-4 border-t border-slate-50 flex justify-end">
                                    <button onClick={handleGuardarConteos} disabled={guardandoConteos}
                                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-500 transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/30 disabled:opacity-50">
                                        {guardandoConteos ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Guardar Conteos
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── SECCIÓN CONCILIACIÓN ───────────────────────────── */}
                    {itemsConDiff.length > 0 && (
                        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                            <div className="p-6 border-b border-slate-50">
                                <h3 className="font-black text-slate-800 uppercase flex items-center gap-2">
                                    <ShieldAlert size={18} className="text-amber-500" /> Conciliación de Diferencias ({itemsConDiff.length})
                                </h3>
                                <p className="text-xs text-slate-400 font-bold mt-1">
                                    Justifique cada diferencia encontrada. Sin justificaciones completas no puede solicitar autorización.
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50/50">
                                            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Elemento</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Sistema</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Físico</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Diferencia</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-indigo-400 uppercase tracking-widest">Cantidad Final</th>
                                            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Justificación *</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {itemsConDiff.map(it => {
                                            const cfVal = cantFinal[it.id] ?? String(it.cantidad_final ?? it.cantidad_fisica ?? 0);
                                            const cfModificado = Number(cfVal) !== (it.cantidad_fisica ?? 0);
                                            return (
                                            <tr key={it.id} className={`${it.tipo_diferencia === 'SOBRANTE' ? 'bg-amber-50/30' : 'bg-rose-50/30'}`}>
                                                <td className="px-6 py-4 font-bold text-slate-700 text-sm">{it.elemento_nombre}</td>
                                                <td className="px-4 py-4 text-center font-black text-slate-600">{it.cantidad_sistema}</td>
                                                <td className="px-4 py-4 text-center font-black text-slate-600">{it.cantidad_fisica}</td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className={`font-black text-sm px-2 py-0.5 rounded-full ${it.tipo_diferencia === 'SOBRANTE' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        {it.tipo_diferencia === 'SOBRANTE' ? '+' : ''}{it.diferencia} {it.tipo_diferencia}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    {puedeJustificar ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <input
                                                                type="number" min="0"
                                                                value={cfVal}
                                                                onChange={e => setCantFinal(p => ({ ...p, [it.id]: e.target.value }))}
                                                                className={`w-20 px-2 py-1.5 border-2 rounded-xl text-center font-black text-sm outline-none transition-all ${cfModificado ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 focus:border-indigo-500'}`}
                                                            />
                                                            {cfModificado && (
                                                                <span className="text-[9px] text-indigo-600 font-black">Modificado</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className={`font-black text-sm ${it.cantidad_final !== null && it.cantidad_final !== it.cantidad_fisica ? 'text-indigo-700' : 'text-slate-600'}`}>
                                                            {it.cantidad_final ?? it.cantidad_fisica ?? '---'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {puedeJustificar ? (
                                                        <textarea
                                                            value={justifs[it.id] ?? it.justificacion ?? ''}
                                                            onChange={e => setJustifs(p => ({ ...p, [it.id]: e.target.value }))}
                                                            rows={2}
                                                            placeholder={cfModificado ? "Justifique la diferencia y la cantidad final..." : "Explique el motivo de la diferencia..."}
                                                            className={`w-full px-3 py-2 bg-white border-2 rounded-xl text-xs font-bold outline-none resize-none min-w-[200px] ${cfModificado ? 'border-indigo-300 focus:border-indigo-500' : 'border-slate-200 focus:border-indigo-400'}`}
                                                        />
                                                    ) : (
                                                        <p className="text-xs text-slate-600 font-bold">{it.justificacion || '---'}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    {it.estado_justificacion === 'JUSTIFICADO' ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black">
                                                            <CheckCircle2 size={10} /> OK
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black">
                                                            <AlertTriangle size={10} /> Pend.
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {puedeJustificar && (
                                <div className="p-4 border-t border-slate-50 flex justify-between items-center">
                                    <p className="text-xs text-slate-400 font-bold">
                                        {kpis.pendJustif > 0
                                            ? `Faltan ${kpis.pendJustif} justificación(es)`
                                            : '¡Todas las diferencias están justificadas!'}
                                    </p>
                                    <button onClick={handleGuardarJustifs} disabled={guardandoJustifs}
                                        className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-black text-sm hover:bg-amber-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/30 disabled:opacity-50">
                                        {guardandoJustifs ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Guardar Justificaciones
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── TABLA COMPLETA (modo solo lectura) ─────────────── */}
                    {sesionActiva.estado === 'CERRADO' && (
                        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                            <div className="p-6 border-b border-slate-50">
                                <h3 className="font-black text-slate-800 uppercase flex items-center gap-2">
                                    <BadgeCheck size={18} className="text-emerald-500" /> Resumen Final — Inventario Cerrado
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50/50">
                                            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Elemento</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Sistema</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Físico</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Diferencia</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-indigo-400 uppercase tracking-widest">Cant. Final</th>
                                            <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Justificación</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items.map(it => (
                                            <tr key={it.id} className={
                                                it.tipo_diferencia === 'SOBRANTE' ? 'bg-amber-50/20' :
                                                it.tipo_diferencia === 'FALTANTE' ? 'bg-rose-50/20' : ''
                                            }>
                                                <td className="px-6 py-3 font-bold text-slate-700 text-sm">{it.elemento_nombre}</td>
                                                <td className="px-4 py-3 text-center font-black text-slate-600">{it.cantidad_sistema}</td>
                                                <td className="px-4 py-3 text-center font-black text-slate-600">{it.cantidad_fisica ?? '---'}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {it.diferencia !== null && it.diferencia !== 0 ? (
                                                        <span className={`font-black text-sm ${it.diferencia > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                            {it.diferencia > 0 ? '+' : ''}{it.diferencia}
                                                        </span>
                                                    ) : (
                                                        <CheckCircle2 size={16} className="text-emerald-400 mx-auto" />
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {it.cantidad_final !== null && it.cantidad_final !== undefined ? (
                                                        <span className={`font-black text-sm ${it.cantidad_final !== it.cantidad_fisica ? 'text-indigo-700' : 'text-slate-600'}`}>
                                                            {it.cantidad_final}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-sm">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-500 font-bold">{it.justificacion || '---'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ─── Modal: Confirmar Guardar Conteos ────────────────────────── */}
            {showConfirmConteos && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
                        <div className="p-8 space-y-5">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
                                    <Save size={20} className="text-indigo-500" /> Confirmar Conteo
                                </h2>
                                <button onClick={() => setShowConfirmConteos(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
                            </div>

                            <div className="space-y-3">
                                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-1">
                                    <p className="text-sm font-black text-indigo-800">Resumen del conteo:</p>
                                    <p className="text-xs text-indigo-700 font-bold">• <span className="font-black">{contadosCount}</span> elemento(s) contados con cantidad registrada</p>
                                    {noContadosCount > 0 && (
                                        <p className="text-xs text-amber-700 font-bold">• <span className="font-black">{noContadosCount}</span> elemento(s) sin contar → se registrarán con cantidad física <span className="font-black">= 0</span></p>
                                    )}
                                </div>

                                {noContadosCount > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                        <p className="text-xs text-amber-700 font-bold">
                                            <span className="font-black">Aviso:</span> Los {noContadosCount} elemento(s) no contados quedarán con cantidad física 0.
                                            Si el sistema registra stock para alguno de ellos, se generará automáticamente una diferencia que deberá justificar en la conciliación.
                                        </p>
                                    </div>
                                )}

                                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                                    <p className="text-xs text-rose-700 font-bold">
                                        <span className="font-black">Advertencia:</span> Una vez guardado, el conteo físico es <span className="font-black">inmodificable</span>.
                                        Cualquier ajuste posterior solo podrá realizarse a través del proceso de conciliación y justificación.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setShowConfirmConteos(false)}
                                    className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-500 hover:bg-slate-100">
                                    Cancelar — seguir contando
                                </button>
                                <button onClick={executeGuardarConteos} disabled={guardandoConteos}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 disabled:opacity-50">
                                    {guardandoConteos ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Confirmar y Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal: Generar Código (Supervisor) ──────────────────────── */}
            {showGenCodigo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
                        <div className="p-8 space-y-5">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
                                    <KeyRound size={20} className="text-purple-500" /> Autorización de Inventario
                                </h2>
                                <button onClick={() => { setShowGenCodigo(false); setCodigoGenerado(null); }} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
                            </div>

                            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-2">
                                <p className="text-xs text-purple-700 font-bold">
                                    <span className="font-black">Segregación de funciones:</span> Usted ({userName}) actuará como supervisor autorizante.
                                    El código generado deberá entregarlo al auditor <span className="font-black">{sesionActiva.assigned_to}</span> para que lo ingrese.
                                </p>
                                <p className="text-xs text-purple-600 font-bold">El código tendrá una vigencia de <span className="font-black">30 minutos</span>.</p>
                            </div>

                            {codigoGenerado ? (
                                <div className="text-center space-y-4">
                                    <div className="bg-slate-900 rounded-2xl p-6">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Código de Autorización</p>
                                        <p className="text-5xl font-black text-white tracking-[0.3em]">{codigoGenerado.codigo}</p>
                                        <p className="text-[10px] text-slate-400 mt-3">Expira: {fmt(codigoGenerado.expira_at)}</p>
                                    </div>
                                    <p className="text-xs text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        Entregue este código al auditor de forma segura. No lo comparta por canales públicos.
                                    </p>
                                </div>
                            ) : (
                                <button onClick={handleGenerarCodigo} disabled={generandoCodigo}
                                    className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-500 transition-all flex items-center justify-center gap-2 shadow-xl shadow-purple-500/30 disabled:opacity-50">
                                    {generandoCodigo ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                                    Generar Código de Autorización
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal: Cerrar / Aplicar Ajustes ─────────────────────────── */}
            {showCierre && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
                        <div className="p-8 space-y-5">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
                                    <Unlock size={20} className="text-emerald-500" /> Aplicar Ajustes
                                </h2>
                                <button onClick={() => { setShowCierre(false); setCodigoIngresado(''); }} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                                <p className="text-xs text-emerald-700 font-bold">
                                    Se aplicarán <span className="font-black">{itemsConDiff.length} ajuste(s)</span> de inventario en bodega.
                                    Ingrese el código de autorización generado por el supervisor.
                                </p>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Código de Autorización *</label>
                                <input
                                    type="text" maxLength={6}
                                    value={codigoIngresado}
                                    onChange={e => setCodigoIngresado(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    className="mt-2 w-full px-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-3xl font-black text-center tracking-[0.3em] outline-none focus:border-emerald-500 transition-all"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => { setShowCierre(false); setCodigoIngresado(''); }}
                                    className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-500 hover:bg-slate-100">Cancelar</button>
                                <button onClick={handleCerrar} disabled={cerrando || codigoIngresado.length < 6}
                                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-sm hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 disabled:opacity-50">
                                    {cerrando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    Confirmar y Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal: Anular ───────────────────────────────────────────── */}
            {showAnular && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100">
                        <div className="p-8 space-y-5">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
                                    <XCircle size={20} className="text-rose-500" /> Anular Sesión
                                </h2>
                                <button onClick={() => setShowAnular(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Motivo de Anulación *</label>
                                <textarea value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)} rows={3}
                                    placeholder="Explique por qué se anula esta sesión..."
                                    className="mt-2 w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-rose-500 resize-none" />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowAnular(false)}
                                    className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-500 hover:bg-slate-100">Cancelar</button>
                                <button onClick={handleAnular} disabled={anulando}
                                    className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-sm hover:bg-rose-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                    {anulando ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                    Confirmar Anulación
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
