import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Bell, ChevronLeft, ChevronRight, Clock, Info, Loader2, MapPin, Package, Plus, Save, Search,
  Send, ShieldCheck, Truck, UserCheck, X, SlidersHorizontal,
} from 'lucide-react';
import { api } from '../../services/api';
import { hasPermission } from '../../utils/permissions';
import SearchableSelect from '../common/SearchableSelect';
import { ImageLightbox, SecureImage } from './shared/Evidencias';

export const ESTADOS_ENVIO: Record<string, { label: string; cls: string; dot: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  ASIGNADO: { label: 'Asignado', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  EN_CAMINO: { label: 'En camino', cls: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  ENTREGADO: { label: 'Entregado', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  FALLIDO: { label: 'Fallido', cls: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  DEVUELTO: { label: 'Devuelto', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-slate-200 text-slate-500', dot: 'bg-slate-500' },
};
export const EstadoEnvioBadge: React.FC<{ estado: string }> = ({ estado }) => {
  const e = ESTADOS_ENVIO[estado] || ESTADOS_ENVIO.PENDIENTE;
  return <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${e.cls}`}>{e.label}</span>;
};

const ARCHIVO_LABEL: Record<string, string> = {
  FIRMA_MENSAJERO: 'Firma mensajero (recogida)',
  FIRMA_DESTINATARIO: 'Firma destinatario (entrega)',
  FOTO_PAQUETE: 'Foto del paquete',
  FOTO_ENTREGA: 'Foto de la entrega',
  FOTO_INCIDENCIA: 'Foto de la incidencia',
};

const fmtDT = (d?: string | null) => d
  ? new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';
const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none transition-all';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1';

const emptyEnvio = () => ({
  remitente_id: null as any, tipo: 'DOCUMENTO', prioridad: 'NORMAL', contenido: '', cantidad: 1 as any, peso_kg: '', valor_declarado: '',
  destinatario_nombre: '', destinatario_empresa: '', destinatario_documento: '', destinatario_telefono: '',
  destinatario_direccion: '', destinatario_ciudad: '', fecha_entrega_estimada: '', mensajero_id: null as any, observaciones: '',
});

const Mensajeria: React.FC<{ user: any }> = ({ user }) => {
  const canCreate = hasPermission(user, 'MENSAJERIA_GH', 'create');
  const canEdit = hasPermission(user, 'MENSAJERIA_GH', 'edit');

  const [tab, setTab] = useState<'envios' | 'dashboard' | 'alertas'>('envios');
  const [personal, setPersonal] = useState<any[]>([]);
  const [mensajeros, setMensajeros] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({ q: '', estado: 'ABIERTOS', mensajero_id: '', desde: '', hasta: '', atrasados: false });
  const [qDeb, setQDeb] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ data: any[]; total: number; pageSize: number }>({ data: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [dash, setDash] = useState<any>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [form, setForm] = useState<ReturnType<typeof emptyEnvio> | null>(null);
  const [saving, setSaving] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [verFiltros, setVerFiltros] = useState(false);

  const loadCatalogos = useCallback(() => {
    api.ghMsjMensajeros().then(setMensajeros).catch(() => {});
  }, []);
  useEffect(() => {
    api.getPersonal().then((r: any[]) => setPersonal(r.filter(p => p.estado !== 'EST-02'))).catch(() => {});
    loadCatalogos();
    api.ghMsjAlertas().then(setAlertas).catch(() => {});
  }, [loadCatalogos]);

  useEffect(() => {
    const t = setTimeout(() => { setQDeb(filtros.q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [filtros.q]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api.ghMsjList({
        q: qDeb, estado: filtros.estado, mensajero_id: filtros.mensajero_id, desde: filtros.desde, hasta: filtros.hasta,
        atrasados: filtros.atrasados ? 'true' : '', page, pageSize: 20,
      }));
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar envíos');
    } finally {
      setLoading(false);
    }
  }, [qDeb, filtros.estado, filtros.mensajero_id, filtros.desde, filtros.hasta, filtros.atrasados, page]);

  useEffect(() => { if (tab === 'envios') loadList(); }, [tab, loadList]);
  useEffect(() => {
    // Los contadores de los chips de estado salen del mismo resumen del dashboard
    if (tab === 'dashboard' || tab === 'envios') api.ghMsjDashboard().then(setDash).catch(() => { if (tab === 'dashboard') toast.error('Error al cargar indicadores'); });
    if (tab === 'alertas') api.ghMsjAlertas().then(setAlertas).catch(() => toast.error('Error al cargar alertas'));
  }, [tab]);

  const refreshAll = () => { loadList(); loadCatalogos(); api.ghMsjAlertas().then(setAlertas).catch(() => {}); api.ghMsjDashboard().then(setDash).catch(() => {}); };

  const personalOpts = useMemo(() => personal.map(p => ({ id: p.id, nombre: `${p.nombre} · ${p.area_nombre || p.cargo || ''}` })), [personal]);
  const mensajeroOpts = useMemo(() => mensajeros.map(m => ({ id: m.id, nombre: `${m.nombre} (${m.envios_activos} activos)` })), [mensajeros]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.remitente_id) { toast.error('Seleccione el remitente'); return; }
    setSaving(true);
    try {
      const res = await api.ghMsjCreate(form);
      toast.success(`Envío ${res.data.tracking} creado`);
      setForm(null);
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear el envío');
    } finally {
      setSaving(false);
    }
  };

  const ESTADO_CHIPS: { key: string; label: string; count?: number }[] = [
    { key: 'ABIERTOS', label: 'Abiertos', count: dash ? dash.resumen.pendientes + dash.resumen.asignados + dash.resumen.en_camino + dash.resumen.fallidos : undefined },
    { key: 'PENDIENTE', label: 'Pendientes', count: dash?.resumen.pendientes },
    { key: 'ASIGNADO', label: 'Asignados', count: dash?.resumen.asignados },
    { key: 'EN_CAMINO', label: 'En camino', count: dash?.resumen.en_camino },
    { key: 'FALLIDO', label: 'Fallidos', count: dash?.resumen.fallidos },
    { key: 'ENTREGADO', label: 'Entregados' },
    { key: '', label: 'Todos' },
  ];
  const nFiltros = [filtros.mensajero_id, filtros.desde, filtros.hasta].filter(Boolean).length;
  const hayFiltros = !!(filtros.q || filtros.mensajero_id || filtros.desde || filtros.hasta || filtros.atrasados || filtros.estado !== 'ABIERTOS');
  const desdeN = list.total === 0 ? 0 : (page - 1) * list.pageSize + 1;
  const hastaN = Math.min(page * list.pageSize, list.total);

  return (
    <div className="flex flex-col bg-slate-50 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter uppercase">Mensajería</h2>
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mt-1">Gestión Humana · Control de entregas a mensajeros</p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
          <div className="grid grid-cols-3 bg-white p-1 rounded-2xl shadow-sm border border-slate-200 w-full sm:w-auto" role="tablist">
            {([['envios', 'Envíos'], ['dashboard', 'Indicadores'], ['alertas', 'Alertas']] as const).map(([t, l]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`relative px-4 sm:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}>
                {l}
                {t === 'alertas' && alertas.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center">{alertas.length}</span>
                )}
              </button>
            ))}
          </div>
          {canCreate && (
            <button onClick={() => setForm(emptyEnvio())}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm shrink-0">
              <Plus className="w-4 h-4" /> Nuevo envío
            </button>
          )}
        </div>
      </div>

      {tab === 'dashboard' && <MensajeriaDashboard data={dash} />}

      {tab === 'alertas' && (
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden">
          {alertas.length === 0 ? (
            <div className="py-20 text-center text-slate-400"><ShieldCheck className="w-10 h-10 mx-auto mb-3 text-emerald-400" /><p className="text-sm font-bold">Sin alertas abiertas.</p></div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alertas.map(a => (
                <li key={a.id}>
                  <button onClick={() => setDetalleId(a.envio_id)} className="w-full text-left px-4 sm:px-6 py-4 hover:bg-slate-50 flex items-start sm:items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${a.tipo === 'FALLIDO' ? 'bg-rose-100 text-rose-600' : a.tipo === 'ATRASADO' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-600'}`}>
                      {a.tipo === 'FALLIDO' ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{a.tipo.replace('_', ' ')} · <span className="font-mono">{a.tracking}</span></p>
                        <EstadoEnvioBadge estado={a.estado} />
                      </div>
                      <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{a.destinatario_nombre} — {a.destinatario_ciudad}</p>
                      <p className="text-[11px] text-slate-500">{a.detalle} · Remitente: {a.remitente_nombre} · Mensajero: {a.mensajero_nombre || 'sin asignar'}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 self-center" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'envios' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/70 overflow-hidden">
          {/* Estado rápido */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar por estado">
            {ESTADO_CHIPS.map(c => {
              const activo = filtros.estado === c.key && !filtros.atrasados;
              return (
                <button key={c.key || 'todos'} onClick={() => { setFiltros({ ...filtros, estado: c.key, atrasados: false }); setPage(1); }} aria-pressed={activo}
                  className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all ${activo ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                  {c.label}
                  {c.count !== undefined && <span className={`min-w-5 px-1.5 rounded-full text-[10px] ${activo ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{c.count}</span>}
                </button>
              );
            })}
            <button onClick={() => { setFiltros({ ...filtros, atrasados: !filtros.atrasados, estado: filtros.atrasados ? filtros.estado : 'ABIERTOS' }); setPage(1); }} aria-pressed={filtros.atrasados}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all ${filtros.atrasados ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-200 text-amber-700 hover:border-amber-400'}`}>
              <Clock className="w-3.5 h-3.5" /> Atrasados +24 h
              {dash && <span className={`min-w-5 px-1.5 rounded-full text-[10px] ${filtros.atrasados ? 'bg-white/20' : 'bg-amber-50'}`}>{dash.resumen.atrasados}</span>}
            </button>
          </div>

          {/* Búsqueda y filtros: plegables en celular/tablet, siempre visibles en escritorio */}
          <div className={`px-4 sm:px-6 pt-4 pb-4 lg:hidden flex gap-2 ${verFiltros ? '' : 'border-b border-slate-100'}`}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input aria-label="Buscar envío" placeholder="Buscar tracking, destinatario…" value={filtros.q}
                onChange={e => setFiltros({ ...filtros, q: e.target.value })} className={`${inputCls} pl-11`} />
            </div>
            <button onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}
              className={`shrink-0 px-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${verFiltros || nFiltros ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600'}`}>
              <SlidersHorizontal className="w-4 h-4" /> Filtros{nFiltros ? ` (${nFiltros})` : ''}
            </button>
          </div>
          <div className={`${verFiltros ? 'grid' : 'hidden'} lg:grid px-4 sm:px-6 pb-4 sm:pb-6 pt-0 lg:pt-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-3 border-b border-slate-100`}>
            <div className="hidden lg:block lg:col-span-4">
              <label htmlFor="msj-q" className={labelCls}>Buscar</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input id="msj-q" placeholder="Tracking, destinatario, remitente…" value={filtros.q}
                  onChange={e => setFiltros({ ...filtros, q: e.target.value })} className={`${inputCls} pl-11`} />
              </div>
            </div>
            <div className="sm:col-span-2 md:col-span-2 lg:col-span-3">
              <label htmlFor="msj-mens" className={labelCls}>Mensajero</label>
              <select id="msj-mens" value={filtros.mensajero_id} onChange={e => { setFiltros({ ...filtros, mensajero_id: e.target.value }); setPage(1); }} className={inputCls}>
                <option value="">Todos</option>
                {mensajeros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="msj-desde" className={labelCls}>Creado desde</label>
              <input id="msj-desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={e => { setFiltros({ ...filtros, desde: e.target.value }); setPage(1); }} className={`${inputCls} px-3`} />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="msj-hasta" className={labelCls}>Hasta</label>
              <input id="msj-hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={e => { setFiltros({ ...filtros, hasta: e.target.value }); setPage(1); }} className={`${inputCls} px-3`} />
            </div>
            <div className="sm:col-span-2 md:col-span-4 lg:col-span-1 flex items-end">
              <button onClick={() => { setFiltros({ q: '', estado: 'ABIERTOS', mensajero_id: '', desde: '', hasta: '', atrasados: false }); setPage(1); }} disabled={!hayFiltros}
                className="w-full py-3 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="Limpiar filtros">
                Limpiar
              </button>
            </div>
          </div>

          {/* Resultados */}
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : list.data.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-400">No hay envíos con estos filtros.</p>
            </div>
          ) : (
            <>
              {/* Escritorio / tablet */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3 font-black">Envío</th>
                      <th className="px-4 py-3 font-black">Destinatario</th>
                      <th className="px-4 py-3 font-black hidden lg:table-cell">Remitente</th>
                      <th className="px-4 py-3 font-black">Mensajero</th>
                      <th className="px-4 py-3 font-black">Estado</th>
                      <th className="px-6 py-3 font-black hidden xl:table-cell text-right">Creado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.data.map(e => (
                      <tr key={e.id} onClick={() => setDetalleId(e.id)} tabIndex={0} onKeyDown={k => { if (k.key === 'Enter') setDetalleId(e.id); }}
                        className="group hover:bg-slate-50 cursor-pointer transition-colors focus:outline-none focus:bg-slate-50">
                        <td className="px-6 py-4 align-top">
                          <div className="flex items-center gap-2">
                            <p className="text-[12px] font-black text-slate-900 font-mono whitespace-nowrap">{e.tracking}</p>
                            {e.prioridad === 'URGENTE' && <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[9px] font-black">URGENTE</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate max-w-[220px] mt-0.5" title={e.contenido}>{e.tipo.charAt(0) + e.tipo.slice(1).toLowerCase()} · {e.contenido}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="text-[13px] font-bold text-slate-800 leading-snug">{e.destinatario_nombre}</p>
                          <p className="text-[11px] text-slate-400">{e.destinatario_ciudad}</p>
                        </td>
                        <td className="px-4 py-4 align-top hidden lg:table-cell text-[12px] text-slate-600">{e.remitente_nombre}</td>
                        <td className="px-4 py-4 align-top text-[12px] text-slate-600">{e.mensajero_nombre || <span className="text-slate-300 italic">Sin asignar</span>}</td>
                        <td className="px-4 py-4 align-top">
                          <EstadoEnvioBadge estado={e.estado} />
                          {e.atrasado && <p className="text-[10px] font-bold text-amber-600 mt-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> +24 h</p>}
                        </td>
                        <td className="px-6 py-4 align-top hidden xl:table-cell text-[11px] text-slate-500 text-right whitespace-nowrap">{fmtDT(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Celular: tarjetas */}
              <ul className="md:hidden divide-y divide-slate-100">
                {list.data.map(e => (
                  <li key={e.id}>
                    <button onClick={() => setDetalleId(e.id)} className="w-full text-left px-4 py-4 active:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-black text-slate-900 font-mono">{e.tracking}</span>
                        <EstadoEnvioBadge estado={e.estado} />
                      </div>
                      <p className="text-sm font-bold text-slate-800 mt-1.5">{e.destinatario_nombre}</p>
                      <p className="text-[11px] text-slate-500 truncate">{e.destinatario_ciudad} · {e.contenido}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" />{e.mensajero_nombre || 'Sin asignar'}</span>
                        <span>{fmtDT(e.created_at)}</span>
                        {e.prioridad === 'URGENTE' && <span className="font-black text-rose-600">URGENTE</span>}
                        {e.atrasado && <span className="font-bold text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" /> +24 h</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-100 text-[11px] font-bold text-slate-500">
            <span>{list.total === 0 ? '0 envíos' : `Mostrando ${desdeN}–${hastaN} de ${list.total}`}</span>
            <div className="flex items-center gap-1">
              <button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-1">{page} / {totalPages}</span>
              <button aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[700] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 md:p-6" role="dialog" aria-modal="true">
          <form onSubmit={save} className="bg-white w-full max-w-3xl rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)]">
            <div className="bg-slate-900 px-5 py-4 sm:p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-emerald-500/20 rounded-2xl flex items-center justify-center"><Package className="text-emerald-400 w-5 h-5" /></div>
                <div>
                  <h3 className="font-black uppercase tracking-tight">Nuevo envío</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">El código de tracking se genera al guardar</p>
                </div>
              </div>
              <button type="button" onClick={() => setForm(null)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 content-start overflow-y-auto overscroll-contain flex-1 min-h-0">
              <div className="md:col-span-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">Qué se envía</div>
              <div>
                <label className={labelCls}>Remitente *</label>
                <SearchableSelect options={personalOpts} value={form.remitente_id} onChange={v => setForm({ ...form, remitente_id: v ? Number(v) : null })} placeholder="Colaborador que envía…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="env-tipo">Tipo</label>
                  <select id="env-tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className={inputCls}>
                    <option value="DOCUMENTO">Documento</option><option value="PAQUETE">Paquete</option><option value="ENCOMIENDA">Encomienda</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="env-prio">Prioridad</label>
                  <select id="env-prio" value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} className={inputCls}>
                    <option value="NORMAL">Normal</option><option value="URGENTE">Urgente</option>
                  </select>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls} htmlFor="env-cont">Contenido *</label>
                <textarea id="env-cont" required rows={2} maxLength={2000} value={form.contenido} onChange={e => setForm({ ...form, contenido: e.target.value })} className={`${inputCls} resize-none`} placeholder="Ej: Contrato original firmado + 2 copias" />
              </div>
              <div className="grid grid-cols-3 gap-3 md:col-span-2">
                <div><label className={labelCls} htmlFor="env-cant">Cantidad</label><input id="env-cant" type="number" min={1} value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls} htmlFor="env-peso">Peso (kg)</label><input id="env-peso" type="number" min={0} step="0.01" value={form.peso_kg} onChange={e => setForm({ ...form, peso_kg: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls} htmlFor="env-valor">Valor declarado</label><input id="env-valor" type="number" min={0} value={form.valor_declarado} onChange={e => setForm({ ...form, valor_declarado: e.target.value })} className={inputCls} /></div>
              </div>

              <div className="md:col-span-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2">Para quién</div>
              <div><label className={labelCls} htmlFor="env-dnom">Nombre destinatario *</label><input id="env-dnom" required maxLength={200} value={form.destinatario_nombre} onChange={e => setForm({ ...form, destinatario_nombre: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="env-demp">Empresa</label><input id="env-demp" maxLength={200} value={form.destinatario_empresa} onChange={e => setForm({ ...form, destinatario_empresa: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="env-ddoc">Documento</label><input id="env-ddoc" maxLength={30} value={form.destinatario_documento} onChange={e => setForm({ ...form, destinatario_documento: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="env-dtel">Celular (WhatsApp)</label><input id="env-dtel" type="tel" maxLength={30} value={form.destinatario_telefono} onChange={e => setForm({ ...form, destinatario_telefono: e.target.value })} className={inputCls} placeholder="3001234567" /></div>
              <div><label className={labelCls} htmlFor="env-ddir">Dirección *</label><input id="env-ddir" required maxLength={300} value={form.destinatario_direccion} onChange={e => setForm({ ...form, destinatario_direccion: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="env-dciu">Ciudad *</label><input id="env-dciu" required maxLength={100} value={form.destinatario_ciudad} onChange={e => setForm({ ...form, destinatario_ciudad: e.target.value })} className={inputCls} /></div>

              <div className="md:col-span-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2">Logística</div>
              <div>
                <label className={labelCls}>Mensajero (opcional)</label>
                <SearchableSelect options={mensajeroOpts} value={form.mensajero_id} onChange={v => setForm({ ...form, mensajero_id: v ? Number(v) : null })} placeholder="Asignar después…" />
              </div>
              <div><label className={labelCls} htmlFor="env-fest">Entrega estimada</label><input id="env-fest" type="datetime-local" value={form.fecha_entrega_estimada} onChange={e => setForm({ ...form, fecha_entrega_estimada: e.target.value })} className={inputCls} /></div>
              <div className="md:col-span-2"><label className={labelCls} htmlFor="env-obs">Observaciones</label><textarea id="env-obs" rows={2} value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={`${inputCls} resize-none`} /></div>
            </div>
            <div className="px-5 sm:px-6 py-4 flex gap-3 border-t border-slate-100 bg-white shrink-0">
              <button type="button" onClick={() => setForm(null)} className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-[2] py-3.5 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Crear envío
              </button>
            </div>
          </form>
        </div>
      )}

      {detalleId && (
        <EnvioDetalle id={detalleId} canEdit={canEdit} mensajeroOpts={mensajeroOpts}
          onClose={() => setDetalleId(null)} onChanged={refreshAll} />
      )}
    </div>
  );
};

// ── Indicadores ──────────────────────────────────────────────────────────────

const MensajeriaDashboard: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></div>;
  const r = data.resumen;
  const tiles = [
    { label: 'Creados hoy', value: r.creados_hoy, cls: 'text-slate-900' },
    { label: 'Entregados hoy', value: r.entregados_hoy, cls: 'text-emerald-600' },
    { label: 'Pendientes', value: r.pendientes, cls: 'text-slate-900' },
    { label: 'Asignados', value: r.asignados, cls: 'text-sky-600' },
    { label: 'En camino', value: r.en_camino, cls: 'text-indigo-600' },
    { label: 'Fallidos', value: r.fallidos, cls: r.fallidos > 0 ? 'text-rose-600' : 'text-slate-900' },
    { label: 'Atrasados +24 h', value: r.atrasados, cls: r.atrasados > 0 ? 'text-amber-600' : 'text-slate-900' },
    { label: 'Horas prom. entrega (30 d)', value: r.horas_promedio_30d ?? '—', cls: 'text-slate-900' },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</p>
            <p className={`text-2xl font-black mt-1 ${t.cls}`}>{t.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-[2rem] border border-slate-100 p-6">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Carga por mensajero</h3>
        {data.porMensajero.length === 0 ? <p className="text-sm text-slate-400">Ningún mensajero con envíos activos.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-[9px] font-black text-slate-400 uppercase tracking-widest"><tr><th className="py-2">Mensajero</th><th className="py-2 text-right">Activos</th><th className="py-2 text-right">Entregados hoy</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.porMensajero.map((m: any) => (
                <tr key={m.id}><td className="py-2.5 font-bold text-slate-800">{m.nombre}</td><td className="py-2.5 text-right font-black">{m.activos}</td><td className="py-2.5 text-right font-black text-emerald-600">{m.entregados_hoy}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── Detalle / tracking ───────────────────────────────────────────────────────

export const EvidenciasGrid: React.FC<{ archivos: any[]; urlFor: (id: number) => string }> = ({ archivos, urlFor }) => {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!archivos.length) return <p className="text-xs text-slate-400">Aún no hay firmas ni fotos.</p>;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {archivos.map(f => (
          <figure key={f.id} className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden">
            <SecureImage src={urlFor(f.id)} alt={ARCHIVO_LABEL[f.tipo] || f.tipo}
              className={`${f.tipo.startsWith('FIRMA') ? 'h-40 sm:h-32 bg-white p-2' : 'h-60 sm:h-40'}`} onClick={setLightbox} />
            <figcaption className="p-2.5 border-t border-slate-100">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{ARCHIVO_LABEL[f.tipo] || f.tipo}</p>
              {f.firmante_nombre && <p className="text-[11px] font-bold text-slate-800">{f.firmante_nombre}{f.firmante_documento ? ` · ${f.firmante_documento}` : ''}</p>}
              <p className="text-[9px] text-slate-400">{fmtDT(f.created_at)}{f.estado_subida !== 'SUBIDO' ? ' · subiendo a Drive…' : ''}</p>
              <p className="text-[8px] text-slate-300 font-mono truncate" title={`SHA-256 ${f.sha256}`}>SHA-256 {f.sha256}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
};

export const TrackingTimeline: React.FC<{ eventos: any[] }> = ({ eventos }) => (
  <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
    {eventos.map(ev => (
      <li key={ev.id} className="ml-5">
        <span className={`absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full ring-4 ring-slate-50 ${ESTADOS_ENVIO[ev.estado_nuevo]?.dot || 'bg-slate-400'}`} />
        <div className="flex flex-wrap items-center gap-2">
          <EstadoEnvioBadge estado={ev.estado_nuevo} />
          <span className="text-[10px] font-bold text-slate-400">{fmtDT(ev.created_at)}</span>
        </div>
        {ev.motivo && <p className="text-xs text-slate-700 mt-1">{ev.motivo}</p>}
        <p className="text-[10px] text-slate-400 mt-0.5">
          {ev.user_name}
          {ev.capturado_at && ` · capturado offline ${fmtDT(ev.capturado_at)}`}
          {ev.lat && ev.lng && (
            <> · <a href={`https://www.google.com/maps?q=${ev.lat},${ev.lng}`} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />ubicación</a></>
          )}
        </p>
      </li>
    ))}
  </ol>
);

const EnvioDetalle: React.FC<{
  id: number; canEdit: boolean; mensajeroOpts: { id: number; nombre: string }[];
  onClose: () => void; onChanged: () => void;
}> = ({ id, canEdit, mensajeroOpts, onClose, onChanged }) => {
  const [e, setE] = useState<any>(null);
  const [accion, setAccion] = useState<null | { estado: string; titulo: string; pideMensajero?: boolean; pideMotivo?: boolean }>(null);
  const [mensajeroId, setMensajeroId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.ghMsjGet(id).then(setE).catch((err: any) => { toast.error(err.message); onClose(); });
  }, [id, onClose]);
  useEffect(() => { setE(null); load(); }, [load]);

  const acciones = (() => {
    if (!e || !canEdit) return [];
    switch (e.estado) {
      case 'PENDIENTE': return [
        { estado: 'ASIGNADO', titulo: 'Asignar mensajero', pideMensajero: true },
        { estado: 'CANCELADO', titulo: 'Cancelar envío', pideMotivo: true },
      ];
      case 'ASIGNADO': return [
        { estado: 'ASIGNADO', titulo: 'Reasignar mensajero', pideMensajero: true },
        { estado: 'PENDIENTE', titulo: 'Quitar mensajero' },
        { estado: 'CANCELADO', titulo: 'Cancelar envío', pideMotivo: true },
      ];
      case 'FALLIDO': return [
        { estado: 'ASIGNADO', titulo: 'Programar nuevo intento', pideMensajero: true },
        { estado: 'DEVUELTO', titulo: 'Marcar devuelto al remitente', pideMotivo: true },
      ];
      default: return [];
    }
  })();

  const ejecutar = async () => {
    if (!accion) return;
    if (accion.pideMensajero && !mensajeroId) { toast.error('Seleccione un mensajero'); return; }
    if (accion.pideMotivo && !motivo.trim()) { toast.error('Indique el motivo'); return; }
    setBusy(true);
    try {
      await api.ghMsjCambiarEstado(id, { estado: accion.estado, motivo: motivo.trim() || undefined, mensajero_id: mensajeroId || undefined });
      toast.success('Envío actualizado');
      setAccion(null); setMotivo(''); setMensajeroId(null);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[650] bg-slate-950/60 backdrop-blur-sm flex justify-end" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-slate-50 w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={ev => ev.stopPropagation()}>
        {!e ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></div>
        ) : (
          <>
            <div className="bg-slate-900 text-white p-6 sticky top-0 z-10 flex justify-between items-start gap-3">
              <div>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{e.tipo} {e.prioridad === 'URGENTE' && '· URGENTE'}</p>
                <h3 className="text-xl font-black tracking-tight font-mono mt-1">{e.tracking}</h3>
                <div className="mt-2 flex items-center gap-2"><EstadoEnvioBadge estado={e.estado} />{e.atrasado && <span className="text-[10px] font-black text-amber-400">+24 h sin entregar</span>}</div>
              </div>
              <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl border border-slate-100 p-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Send className="w-3 h-3" /> Remitente</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{e.remitente_nombre}</p>
                  <p className="text-xs text-slate-600 mt-2">{e.contenido}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Cant. {e.cantidad}{e.peso_kg ? ` · ${e.peso_kg} kg` : ''}{e.valor_declarado ? ` · Valor $${Number(e.valor_declarado).toLocaleString('es-CO')}` : ''}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 p-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><MapPin className="w-3 h-3" /> Destinatario</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{e.destinatario_nombre}</p>
                  {e.destinatario_empresa && <p className="text-xs text-slate-600">{e.destinatario_empresa}</p>}
                  <p className="text-xs text-slate-600 mt-1">{e.destinatario_direccion}, {e.destinatario_ciudad}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{[e.destinatario_documento && `Doc. ${e.destinatario_documento}`, e.destinatario_telefono && `Tel. ${e.destinatario_telefono}`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 p-4 md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest"><Truck className="w-3 h-3 inline" /> Mensajero</p><p className="font-bold text-slate-800">{e.mensajero_nombre || '—'}</p></div>
                  <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recogido</p><p className="font-bold text-slate-800">{fmtDT(e.fecha_recogida)}</p></div>
                  <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entregado</p><p className="font-bold text-slate-800">{fmtDT(e.fecha_entrega_real)}</p></div>
                  <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest"><UserCheck className="w-3 h-3 inline" /> Recibió</p><p className="font-bold text-slate-800">{e.receptor_nombre || '—'}{e.receptor_documento ? ` · ${e.receptor_documento}` : ''}</p></div>
                </div>
                {e.observaciones && <p className="md:col-span-2 text-xs text-slate-600 bg-white rounded-2xl border border-slate-100 p-4">{e.observaciones}</p>}
              </div>

              {acciones.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {acciones.map(a => (
                      <button key={a.titulo} onClick={() => { setAccion(a); setMotivo(''); setMensajeroId(null); }}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${accion?.titulo === a.titulo ? 'bg-slate-900 text-white' : a.estado === 'CANCELADO' || a.estado === 'DEVUELTO' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        {a.titulo}
                      </button>
                    ))}
                  </div>
                  {accion && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      {accion.pideMensajero && (
                        <div>
                          <label className={labelCls}>Mensajero</label>
                          <SearchableSelect options={mensajeroOpts} value={mensajeroId} onChange={v => setMensajeroId(v ? Number(v) : null)} placeholder="Seleccione…" />
                          {mensajeroOpts.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No hay usuarios con perfil MENSAJERO enlazados por cédula a Gestión Humana.</p>}
                        </div>
                      )}
                      <div>
                        <label className={labelCls} htmlFor="acc-motivo">Motivo {accion.pideMotivo ? '*' : '(opcional)'}</label>
                        <textarea id="acc-motivo" rows={2} value={motivo} onChange={ev => setMotivo(ev.target.value)} className={`${inputCls} resize-none`} />
                      </div>
                      <button onClick={ejecutar} disabled={busy} className="w-full py-3 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Confirmar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {['ASIGNADO', 'EN_CAMINO'].includes(e.estado) && (
                <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800">
                  <Info className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    {e.estado === 'ASIGNADO'
                      ? <>Esperando la recogida. <b>{e.mensajero_nombre || 'El mensajero'}</b> debe entrar a <b>Gestión Humana → Mis Envíos</b> en su celular, tomar la foto del paquete y firmar.</>
                      : <>En camino. Al entregar, <b>{e.mensajero_nombre || 'el mensajero'}</b> registra en <b>Mis Envíos</b> la foto de la entrega y la <b>firma de quien recibe</b> en su celular.</>}
                    {' '}Las firmas no se capturan desde este panel: deben hacerse en el sitio, por quien tiene el paquete.
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-3 flex items-center gap-2"><Bell className="w-3.5 h-3.5" /> Seguimiento</h4>
                <TrackingTimeline eventos={e.eventos} />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-3">Firmas y evidencias</h4>
                <EvidenciasGrid archivos={e.archivos} urlFor={api.ghMsjArchivoUrl} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Mensajeria;
