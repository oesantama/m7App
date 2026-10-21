import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Box, Calendar, Camera, ChevronLeft, ChevronRight, ClipboardList, DollarSign, Edit2, FileText, Info,
  Loader2, MapPin, Paperclip, Plus, Save, Search, Tag, Trash2, Truck, User as UserIcon, Wrench, X,
} from 'lucide-react';
import { api } from '../../services/api';
import { fetchProtectedObjectUrl } from '../../services/api/ghOperaciones.api';
import { hasPermission } from '../../utils/permissions';
import SearchableSelect from '../common/SearchableSelect';
import { compressImage, ImageLightbox, SecureImage } from './shared/Evidencias';

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtMoney = (v: any) => COP.format(Number(v) || 0);
const fmtDate = (d?: string | null) => d
  ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const inicioMes = () => `${today().slice(0, 8)}01`;

/** Estados de activo: IDs de la maestra global `estados` (EST-24…27). */
const ESTADO_ACTIVO = { OPERATIVO: 'EST-24', EN_MANTENIMIENTO: 'EST-25', DANADO: 'EST-26', BAJA: 'EST-27' };
const ESTADO_CLS: Record<string, string> = {
  'EST-24': 'bg-emerald-100 text-emerald-700',
  'EST-25': 'bg-amber-100 text-amber-700',
  'EST-26': 'bg-rose-100 text-rose-700',
  'EST-27': 'bg-slate-200 text-slate-600',
};

const TIPOS_EVENTO = [
  { id: 'MANTENIMIENTO_PREVENTIVO', label: 'Mantenimiento preventivo', color: 'bg-emerald-500' },
  { id: 'MANTENIMIENTO_CORRECTIVO', label: 'Mantenimiento correctivo', color: 'bg-amber-500' },
  { id: 'GASTO', label: 'Gasto', color: 'bg-indigo-500' },
  { id: 'INCIDENCIA', label: 'Incidencia', color: 'bg-rose-500' },
  { id: 'REVISION', label: 'Revisión / inspección', color: 'bg-sky-500' },
  { id: 'CAMBIO_RESPONSABLE', label: 'Cambio de responsable', color: 'bg-violet-500' },
  { id: 'CAMBIO_UBICACION', label: 'Cambio de ubicación', color: 'bg-violet-500' },
  { id: 'BAJA', label: 'Dar de baja', color: 'bg-slate-700' },
  { id: 'REGISTRO', label: 'Registro del activo', color: 'bg-slate-400' },
];
const eventoInfo = (t: string) => TIPOS_EVENTO.find(x => x.id === t) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1];
// Los cambios de responsable/ubicación se registran solos al editar la ficha
const EVENTOS_MANUALES = TIPOS_EVENTO.filter(t => !['REGISTRO', 'CAMBIO_RESPONSABLE', 'CAMBIO_UBICACION'].includes(t.id));

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none transition-all';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1';

interface Opcion { id: string | number; nombre: string }
interface Catalogos { tipos: Opcion[]; marcas: Opcion[]; proveedores: (Opcion & { documento: string })[]; estados: Opcion[] }

const EstadoBadge: React.FC<{ id: string; nombre?: string }> = ({ id, nombre }) => (
  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${ESTADO_CLS[id] || 'bg-slate-100 text-slate-600'}`}>
    {nombre || id}
  </span>
);

/** Aviso de dónde se crean los valores de una maestra cuando no aparecen en la lista. */
const HintMaestra: React.FC<{ texto: string }> = ({ texto }) => (
  <p className="text-[10px] text-slate-400 mt-1 ml-1 flex items-start gap-1"><Info className="w-3 h-3 mt-px shrink-0" />{texto}</p>
);

const RangoFechas: React.FC<{ desde: string; hasta: string; onChange: (d: string, h: string) => void; disabled?: boolean }> =
  ({ desde, hasta, onChange, disabled }) => (
    <div className={`flex items-center gap-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <input aria-label="Desde" type="date" value={desde} max={hasta || undefined} onChange={e => onChange(e.target.value, hasta)} className={`${inputCls} px-3`} />
      <span className="text-slate-400 text-xs">—</span>
      <input aria-label="Hasta" type="date" value={hasta} min={desde || undefined} max={today()} onChange={e => onChange(desde, e.target.value)} className={`${inputCls} px-3`} />
    </div>
  );

const emptyActivo = () => ({
  id: undefined as number | undefined, codigo: '', tipo_id: null as any, nombre: '', descripcion: '', serial: '',
  marca_id: null as any, modelo: '', ubicacion: '', area_id: null as any, responsable_id: null as any,
  proveedor_id: null as any, fecha_adquisicion: '', costo_inicial: '' as any, estado_id: ESTADO_ACTIVO.OPERATIVO,
  criticidad: 'MEDIA', frecuencia_mantenimiento_dias: '' as any, proximo_mantenimiento: '',
});

const HojaVidaActivos: React.FC<{ user: any }> = ({ user }) => {
  const canCreate = hasPermission(user, 'ACTIVOS_GH', 'create');
  const canEdit = hasPermission(user, 'ACTIVOS_GH', 'edit');
  const canDelete = hasPermission(user, 'ACTIVOS_GH', 'delete');

  const [tab, setTab] = useState<'dashboard' | 'activos'>('activos');
  const [cat, setCat] = useState<Catalogos>({ tipos: [], marcas: [], proveedores: [], estados: [] });
  const [personal, setPersonal] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);

  // Por defecto: lo corrido del mes en curso
  const [filtros, setFiltros] = useState({
    q: '', tipo_id: '', estado_id: '', proveedor_id: '', mant_vencido: false,
    desde: inicioMes(), hasta: today(), todos: false,
  });
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ data: any[]; total: number; pageSize: number }>({ data: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(false);

  const [dashFiltros, setDashFiltros] = useState({ desde: inicioMes(), hasta: today(), tipo_id: '', area_id: '' });
  const [dash, setDash] = useState<any>(null);

  const [form, setForm] = useState<ReturnType<typeof emptyActivo> | null>(null);
  const [saving, setSaving] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const loadCatalogos = useCallback(() => {
    api.ghActivosCatalogos().then(setCat).catch(() => toast.error('Error al cargar maestras'));
  }, []);

  useEffect(() => {
    loadCatalogos();
    api.getPersonal().then((rows: any[]) => setPersonal(rows.filter(p => p.estado !== 'EST-02'))).catch(() => {});
    api.getGhMiscelaneos('areas').then(setAreas).catch(() => {});
  }, [loadCatalogos]);

  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(filtros.q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [filtros.q]);

  const setF = (patch: Partial<typeof filtros>) => { setFiltros(f => ({ ...f, ...patch })); setPage(1); };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.ghActivosList({
        q: qDebounced, tipo_id: filtros.tipo_id, estado_id: filtros.estado_id, proveedor_id: filtros.proveedor_id,
        mant_vencido: filtros.mant_vencido ? 'true' : '', desde: filtros.desde, hasta: filtros.hasta,
        todos: filtros.todos ? 'true' : '', page, pageSize: 20,
      });
      setList(res);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar activos');
    } finally {
      setLoading(false);
    }
  }, [qDebounced, filtros.tipo_id, filtros.estado_id, filtros.proveedor_id, filtros.mant_vencido, filtros.desde, filtros.hasta, filtros.todos, page]);

  useEffect(() => { if (tab === 'activos') loadList(); }, [tab, loadList]);
  useEffect(() => {
    if (tab !== 'dashboard') return;
    setDash(null);
    api.ghActivosDashboard(dashFiltros).then(setDash).catch(() => toast.error('Error al cargar los indicadores'));
  }, [tab, dashFiltros]);

  const personalOpts = useMemo(() => personal.map(p => ({ id: p.id, nombre: `${p.nombre} · ${p.cedula}` })), [personal]);
  const areaOpts = useMemo(() => areas.map((a: any) => ({ id: a.id, nombre: a.nombre })), [areas]);
  const proveedorOpts = useMemo(() => cat.proveedores.map(p => ({ id: p.id, nombre: `${p.nombre} · NIT ${p.documento}` })), [cat.proveedores]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  const openEdit = async (id: number) => {
    try {
      const a = await api.ghActivosGet(id);
      setForm({
        ...emptyActivo(),
        id: a.id, codigo: a.codigo, tipo_id: a.tipo_id, nombre: a.nombre, descripcion: a.descripcion || '',
        serial: a.serial || '', marca_id: a.marca_id, modelo: a.modelo || '', ubicacion: a.ubicacion || '',
        area_id: a.area_id, responsable_id: a.responsable_id, proveedor_id: a.proveedor_id,
        fecha_adquisicion: a.fecha_adquisicion?.slice(0, 10) || '', costo_inicial: a.costo_inicial ?? '',
        estado_id: a.estado_id, criticidad: a.criticidad,
        frecuencia_mantenimiento_dias: a.frecuencia_mantenimiento_dias ?? '',
        proximo_mantenimiento: a.proximo_mantenimiento?.slice(0, 10) || '',
      });
    } catch (e: any) { toast.error(e.message); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.tipo_id || !form.nombre.trim()) { toast.error('Tipo y nombre son obligatorios'); return; }
    setSaving(true);
    try {
      const res = await api.ghActivosSave(form);
      toast.success(form.id ? 'Activo actualizado' : `Activo ${res.data.codigo} creado`);
      setForm(null);
      loadList();
      if (form.id && detalleId === form.id) setDetalleId(null);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: any) => {
    if (!window.confirm(`¿Eliminar el activo ${a.codigo} - ${a.nombre}? Su hoja de vida se conserva para auditoría.`)) return;
    try {
      await api.ghActivosDelete(a.id);
      toast.success('Activo eliminado');
      setDetalleId(null);
      loadList();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="flex flex-col bg-slate-50 p-4 md:p-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase">Hoja de Vida de Activos</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Gestión Humana / Mantenimientos, gastos e incidencias</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canCreate && (
            <button onClick={() => setForm(emptyActivo())}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">
              <Plus className="w-4 h-4" /> Nuevo activo
            </button>
          )}
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200" role="tablist">
            {(['activos', 'dashboard'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                {t === 'activos' ? 'Activos' : 'Indicadores'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'dashboard' ? (
        <ActivosDashboard data={dash} filtros={dashFiltros} setFiltros={setDashFiltros} tipos={cat.tipos} areas={areaOpts}
          onOpen={id => { setTab('activos'); setDetalleId(id); }} />
      ) : (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-3 border-b border-slate-100">
            <div className="md:col-span-4 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input aria-label="Buscar activo" placeholder="Código, nombre, serial, ubicación, responsable, marca…"
                value={filtros.q} onChange={e => setFiltros({ ...filtros, q: e.target.value })}
                className={`${inputCls} pl-11`} />
            </div>
            <div className="md:col-span-5">
              <RangoFechas desde={filtros.desde} hasta={filtros.hasta} disabled={filtros.todos} onChange={(d, h) => setF({ desde: d, hasta: h })} />
            </div>
            <label className="md:col-span-3 flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={filtros.todos} onChange={e => setF({ todos: e.target.checked })} />
              Ver todo el inventario (sin fecha)
            </label>
            <select aria-label="Filtrar por tipo" value={filtros.tipo_id} onChange={e => setF({ tipo_id: e.target.value })} className={`${inputCls} md:col-span-3`}>
              <option value="">Todos los tipos</option>
              {cat.tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select aria-label="Filtrar por estado" value={filtros.estado_id} onChange={e => setF({ estado_id: e.target.value })} className={`${inputCls} md:col-span-3`}>
              <option value="">Todos los estados</option>
              {cat.estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <select aria-label="Filtrar por proveedor" value={filtros.proveedor_id} onChange={e => setF({ proveedor_id: e.target.value })} className={`${inputCls} md:col-span-4`}>
              <option value="">Todos los proveedores</option>
              {cat.proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <label className="md:col-span-2 flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={filtros.mant_vencido} onChange={e => setF({ mant_vencido: e.target.checked })} />
              Mant. vencido
            </label>
            <p className="md:col-span-12 text-[10px] text-slate-400 ml-1">
              {filtros.todos ? 'Mostrando todo el inventario.' : `Activos con movimiento (registro, mantenimiento, gasto, incidencia…) entre ${fmtDate(filtros.desde)} y ${fmtDate(filtros.hasta)}.`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-5 py-3">Activo</th>
                  <th className="px-5 py-3 hidden md:table-cell">Tipo / Marca</th>
                  <th className="px-5 py-3 hidden lg:table-cell">Ubicación / Responsable</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 hidden md:table-cell text-right">{filtros.todos ? 'Costo acumulado' : 'Costo período / acumulado'}</th>
                  <th className="px-5 py-3 hidden lg:table-cell">Próx. mant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></td></tr>
                ) : list.data.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400 text-sm font-bold">
                    No hay activos con movimiento en este período.
                    {!filtros.todos && <button onClick={() => setF({ todos: true })} className="block mx-auto mt-2 text-emerald-600 underline text-xs">Ver todo el inventario</button>}
                  </td></tr>
                ) : list.data.map(a => {
                  const vencido = a.proximo_mantenimiento && a.estado_id !== ESTADO_ACTIVO.BAJA && a.proximo_mantenimiento.slice(0, 10) < today();
                  const acumulado = Number(a.costo_inicial) + Number(a.total_costos_eventos);
                  return (
                    <tr key={a.id} onClick={() => setDetalleId(a.id)} className="hover:bg-slate-50 cursor-pointer transition-colors"
                      tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setDetalleId(a.id); }}>
                      <td className="px-5 py-4">
                        <p className="text-[10px] font-black text-slate-400">{a.codigo}{a.criticidad === 'ALTA' && <span className="ml-2 text-rose-500">● CRÍTICO</span>}</p>
                        <p className="text-sm font-bold text-slate-900">{a.nombre}</p>
                        {a.serial && <p className="text-[10px] text-slate-400">S/N {a.serial}</p>}
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="text-xs font-bold text-slate-600">{a.tipo_nombre}</p>
                        <p className="text-[10px] text-slate-400">{[a.marca_nombre, a.modelo].filter(Boolean).join(' · ') || '—'}</p>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <p className="text-xs text-slate-700">{a.ubicacion || '—'}</p>
                        <p className="text-[10px] text-slate-400">{a.responsable_nombre || 'Sin responsable'}</p>
                      </td>
                      <td className="px-5 py-4"><EstadoBadge id={a.estado_id} nombre={a.estado_nombre} /></td>
                      <td className="px-5 py-4 hidden md:table-cell text-right">
                        {filtros.todos ? (
                          <p className="text-sm font-black text-slate-900">{fmtMoney(acumulado)}</p>
                        ) : (
                          <>
                            <p className="text-sm font-black text-slate-900">{fmtMoney(a.costo_periodo)}</p>
                            <p className="text-[10px] text-slate-400">Acum. {fmtMoney(acumulado)}</p>
                          </>
                        )}
                        <p className="text-[10px] text-slate-400">{a.total_eventos} eventos</p>
                      </td>
                      <td className={`px-5 py-4 hidden lg:table-cell text-xs font-bold ${vencido ? 'text-rose-600' : 'text-slate-600'}`}>
                        {vencido && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}{fmtDate(a.proximo_mantenimiento)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 text-[11px] font-bold text-slate-500">
            <span>{list.total} activo(s)</span>
            <div className="flex items-center gap-2">
              <button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span>{page} / {totalPages}</span>
              <button aria-label="Página siguiente" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Formulario activo */}
      {form && (
        <div className="fixed inset-0 z-[700] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 md:p-6" role="dialog" aria-modal="true">
          <form onSubmit={save} className="bg-white w-full max-w-3xl rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)]">
            <div className="bg-slate-900 px-5 py-4 sm:p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-emerald-500/20 rounded-2xl flex items-center justify-center"><Box className="text-emerald-400 w-5 h-5" /></div>
                <div>
                  <h3 className="font-black uppercase tracking-tight">{form.id ? 'Editar activo' : 'Nuevo activo'}</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{form.id ? form.codigo : 'El código se asigna automáticamente'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setForm(null)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 content-start overflow-y-auto overscroll-contain flex-1 min-h-0">
              <div>
                <label className={labelCls}>Tipo de activo *</label>
                <SearchableSelect options={cat.tipos} value={form.tipo_id} onChange={v => setForm({ ...form, tipo_id: v ? Number(v) : null })} placeholder="Seleccione tipo…" />
                <HintMaestra texto="¿No está? Créelo en Gestión Humana → Misceláneos → Tipos de Activo." />
              </div>
              <div>
                <label className={labelCls} htmlFor="act-nombre">Nombre / descripción corta *</label>
                <input id="act-nombre" required maxLength={200} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Ej: Cámara entrada principal" />
              </div>
              <div>
                <label className={labelCls}>Marca</label>
                <SearchableSelect options={cat.marcas} value={form.marca_id} onChange={v => setForm({ ...form, marca_id: v || null })} placeholder="Seleccione marca…" />
                <HintMaestra texto="¿No está? Créela en Configuración Maestros → Marcas." />
              </div>
              <div><label className={labelCls} htmlFor="act-modelo">Modelo</label><input id="act-modelo" value={form.modelo || ''} onChange={e => setForm({ ...form, modelo: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="act-serial">Serial</label><input id="act-serial" value={form.serial || ''} onChange={e => setForm({ ...form, serial: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="act-ubic">Ubicación</label><input id="act-ubic" value={form.ubicacion || ''} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className={inputCls} placeholder="Ej: Bodega 10 - Muelle 2" /></div>
              <div>
                <label className={labelCls}>Área</label>
                <SearchableSelect options={areaOpts} value={form.area_id} onChange={v => setForm({ ...form, area_id: v ? Number(v) : null })} placeholder="Seleccione área…" />
              </div>
              <div>
                <label className={labelCls}>Responsable</label>
                <SearchableSelect options={personalOpts} value={form.responsable_id} onChange={v => setForm({ ...form, responsable_id: v ? Number(v) : null })} placeholder="Seleccione colaborador…" />
              </div>
              <div>
                <label className={labelCls}>Proveedor</label>
                <SearchableSelect options={proveedorOpts} value={form.proveedor_id} onChange={v => setForm({ ...form, proveedor_id: v || null })} placeholder="Seleccione proveedor…" />
                <HintMaestra texto="¿No está? Créelo en Configuración Maestros → Prov Cliente." />
              </div>
              <div><label className={labelCls} htmlFor="act-fadq">Fecha de adquisición</label><input id="act-fadq" type="date" max={today()} value={form.fecha_adquisicion || ''} onChange={e => setForm({ ...form, fecha_adquisicion: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="act-costo">Costo inicial (COP)</label><input id="act-costo" type="number" min={0} step="1" value={form.costo_inicial ?? ''} onChange={e => setForm({ ...form, costo_inicial: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="act-estado">Estado</label>
                  <select id="act-estado" value={form.estado_id} onChange={e => setForm({ ...form, estado_id: e.target.value })} className={inputCls}>
                    {cat.estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="act-crit">Criticidad</label>
                  <select id="act-crit" value={form.criticidad} onChange={e => setForm({ ...form, criticidad: e.target.value })} className={inputCls}>
                    <option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option>
                  </select>
                </div>
              </div>
              <div><label className={labelCls} htmlFor="act-frec">Mantenimiento cada (días)</label><input id="act-frec" type="number" min={1} value={form.frecuencia_mantenimiento_dias ?? ''} onChange={e => setForm({ ...form, frecuencia_mantenimiento_dias: e.target.value })} className={inputCls} placeholder="Ej: 90" /></div>
              <div><label className={labelCls} htmlFor="act-prox">Próximo mantenimiento</label><input id="act-prox" type="date" value={form.proximo_mantenimiento || ''} onChange={e => setForm({ ...form, proximo_mantenimiento: e.target.value })} className={inputCls} /></div>
              <div className="md:col-span-2"><label className={labelCls} htmlFor="act-desc">Descripción / observaciones</label><textarea id="act-desc" rows={3} value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={`${inputCls} resize-none`} /></div>
            </div>
            <div className="px-5 sm:px-6 py-4 flex gap-3 border-t border-slate-100 bg-white shrink-0">
              <button type="button" onClick={() => { setForm(null); loadCatalogos(); }} className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-[2] py-3.5 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {detalleId && (
        <ActivoDetalle id={detalleId} cat={cat} proveedorOpts={proveedorOpts} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete}
          onClose={() => setDetalleId(null)} onEdit={() => openEdit(detalleId)} onDelete={remove} onChanged={loadList} />
      )}
    </div>
  );
};

// ── Indicadores ──────────────────────────────────────────────────────────────

const ActivosDashboard: React.FC<{
  data: any; filtros: { desde: string; hasta: string; tipo_id: string; area_id: string };
  setFiltros: (f: { desde: string; hasta: string; tipo_id: string; area_id: string }) => void;
  tipos: Opcion[]; areas: Opcion[]; onOpen: (id: number) => void;
}> = ({ data, filtros, setFiltros, tipos, areas, onOpen }) => {
  const anio = filtros.hasta.slice(0, 4);
  const esMesActual = filtros.desde === inicioMes() && filtros.hasta === today();
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] border border-slate-100 p-4 md:p-5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="md:col-span-5"><RangoFechas desde={filtros.desde} hasta={filtros.hasta} onChange={(d, h) => setFiltros({ ...filtros, desde: d, hasta: h })} /></div>
        <select aria-label="Tipo" value={filtros.tipo_id} onChange={e => setFiltros({ ...filtros, tipo_id: e.target.value })} className={`${inputCls} md:col-span-3`}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <select aria-label="Área" value={filtros.area_id} onChange={e => setFiltros({ ...filtros, area_id: e.target.value })} className={`${inputCls} md:col-span-2`}>
          <option value="">Todas las áreas</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <button disabled={esMesActual && !filtros.tipo_id && !filtros.area_id}
          onClick={() => setFiltros({ desde: inicioMes(), hasta: today(), tipo_id: '', area_id: '' })}
          className="md:col-span-2 py-3 rounded-2xl bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-40">
          Mes actual
        </button>
      </div>

      {!data ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></div>
      ) : (() => {
        const r = data.resumen;
        const maxCosto = Math.max(1, ...data.porTipo.map((t: any) => Number(t.costo_eventos)));
        const tiles = [
          { label: 'Activos', value: r.total, cls: 'text-slate-900' },
          { label: 'Operativos', value: r.operativos, cls: 'text-emerald-600' },
          { label: 'En mantenimiento', value: r.en_mantenimiento, cls: 'text-amber-600' },
          { label: 'Dañados', value: r.danados, cls: 'text-rose-600' },
          { label: 'Críticos', value: r.criticos, cls: 'text-rose-600' },
          { label: 'Mant. vencidos', value: r.mant_vencidos, cls: r.mant_vencidos > 0 ? 'text-rose-600' : 'text-slate-900' },
        ];
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-slate-900 rounded-2xl p-5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gasto del período</p>
                <p className="text-2xl font-black mt-1 text-emerald-400">{fmtMoney(r.costo_periodo)}</p>
                <p className="text-[10px] text-slate-400 mt-1">{fmtDate(data.desde)} — {fmtDate(data.hasta)}</p>
              </div>
              <div className="bg-slate-800 rounded-2xl p-5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gasto año {anio}</p>
                <p className="text-2xl font-black mt-1 text-white">{fmtMoney(r.costo_anio)}</p>
                <p className="text-[10px] text-slate-400 mt-1">Acumulado al {fmtDate(data.hasta)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Eventos en el período</p>
                <p className="text-2xl font-black mt-1 text-slate-900">{r.eventos_periodo}</p>
                <p className="text-[10px] text-slate-400 mt-1">Mantenimientos, gastos, incidencias…</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Activos nuevos</p>
                <p className="text-2xl font-black mt-1 text-slate-900">{r.nuevos_periodo}</p>
                <p className="text-[10px] text-slate-400 mt-1">Registrados en el período</p>
              </div>
            </div>

            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Estado actual del inventario</p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {tiles.map(t => (
                  <div key={t.label} className="bg-white rounded-2xl border border-slate-100 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.label}</p>
                    <p className={`text-2xl font-black mt-1 ${t.cls}`}>{t.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-[2rem] border border-slate-100 p-6 lg:col-span-2 space-y-6">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Costo por tipo de activo (período)</h3>
                  {data.porTipo.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
                    <div className="space-y-3">
                      {data.porTipo.map((t: any) => (
                        <div key={t.tipo}>
                          <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                            <span>{t.tipo} <span className="text-slate-400">· {t.cantidad} activos · {t.mantenimientos} mant.</span></span>
                            <span className="text-slate-900">{fmtMoney(t.costo_eventos)}</span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(Number(t.costo_eventos) / maxCosto) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">Por tipo de evento (período)</h3>
                  {data.porEvento.length === 0 ? <p className="text-sm text-slate-400">Sin eventos en el período.</p> : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {data.porEvento.map((e: any) => (
                          <tr key={e.tipo_evento}>
                            <td className="py-2 font-bold text-slate-700 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${eventoInfo(e.tipo_evento).color}`} />{eventoInfo(e.tipo_evento).label}</td>
                            <td className="py-2 text-right text-slate-500">{e.cantidad}</td>
                            <td className="py-2 text-right font-black text-slate-900">{fmtMoney(e.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Más costosos (período)</h3>
                  {data.topCostosos.length === 0 ? <p className="text-sm text-slate-400">Sin gastos en el período.</p> : data.topCostosos.map((a: any) => (
                    <button key={a.id} onClick={() => onOpen(a.id)} className="w-full flex justify-between items-center py-2 text-left hover:bg-slate-50 rounded-xl px-2 gap-2">
                      <span><span className="text-[10px] font-black text-slate-400">{a.codigo}</span><br /><span className="text-xs font-bold text-slate-800">{a.nombre}</span></span>
                      <span className="text-xs font-black text-slate-900 whitespace-nowrap">{fmtMoney(a.costo_total)}</span>
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Mantenimientos próximos / vencidos</h3>
                  {data.proximosMantenimientos.length === 0 ? <p className="text-sm text-slate-400">Nada en los próximos 15 días.</p> : data.proximosMantenimientos.map((a: any) => {
                    const vencido = a.proximo_mantenimiento.slice(0, 10) < today();
                    return (
                      <button key={a.id} onClick={() => onOpen(a.id)} className="w-full flex justify-between items-center py-2 text-left hover:bg-slate-50 rounded-xl px-2">
                        <span className="text-xs font-bold text-slate-800">{a.codigo} · {a.nombre}</span>
                        <span className={`text-[10px] font-black ${vencido ? 'text-rose-600' : 'text-amber-600'}`}>{fmtDate(a.proximo_mantenimiento)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

// ── Detalle + línea de tiempo ────────────────────────────────────────────────

const ActivoDetalle: React.FC<{
  id: number; cat: Catalogos; proveedorOpts: Opcion[]; canCreate: boolean; canEdit: boolean; canDelete: boolean;
  onClose: () => void; onEdit: () => void; onDelete: (a: any) => void; onChanged: () => void;
}> = ({ id, cat, proveedorOpts, canCreate, canEdit, canDelete, onClose, onEdit, onDelete, onChanged }) => {
  const [a, setA] = useState<any>(null);
  const [showEvento, setShowEvento] = useState(false);
  const eventoVacio = { tipo_evento: 'MANTENIMIENTO_PREVENTIVO', fecha: today(), descripcion: '', costo: '', proveedor_id: null as any, factura: '', estado_resultante_id: '' };
  const [evt, setEvt] = useState(eventoVacio);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(() => {
    api.ghActivosGet(id).then(setA).catch((e: any) => { toast.error(e.message); onClose(); });
  }, [id, onClose]);
  useEffect(() => { setA(null); load(); }, [load]);

  const saveEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evt.descripcion.trim()) { toast.error('Describa el evento'); return; }
    if (evt.tipo_evento === 'BAJA' && !window.confirm('El activo quedará DADO DE BAJA. ¿Continuar?')) return;
    const grandes = archivos.filter(f => f.size > (f.type === 'application/pdf' ? 10 : 5) * 1024 * 1024);
    if (grandes.length) { toast.error(`Archivo demasiado grande: ${grandes[0].name}`); return; }
    setSaving(true);
    try {
      await api.ghActivosCreateEvento(id, evt, archivos);
      toast.success('Evento registrado');
      setShowEvento(false);
      setArchivos([]);
      setEvt(eventoVacio);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar el evento');
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async (archivoId: number) => {
    try {
      const url = await fetchProtectedObjectUrl(api.ghActivosArchivoUrl(archivoId));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { toast.error('No se pudo abrir el archivo'); }
  };

  const costoTotal = a ? Number(a.costo_inicial) + a.eventos.reduce((s: number, e: any) => s + Number(e.costo || 0), 0) : 0;
  const estadoNombre = (eid: string) => cat.estados.find(e => e.id === eid)?.nombre || eid;

  return (
    <>
      <div className="fixed inset-0 z-[650] bg-slate-950/60 backdrop-blur-sm flex justify-end" onClick={onClose} role="dialog" aria-modal="true">
        <div className="bg-slate-50 w-full max-w-2xl h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
          {!a ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-300" /></div>
          ) : (
            <>
              <div className="bg-slate-900 text-white p-6 sticky top-0 z-10">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{a.codigo} · {a.tipo_nombre}</p>
                    <h3 className="text-xl font-black tracking-tight mt-1">{a.nombre}</h3>
                    <div className="mt-2"><EstadoBadge id={a.estado_id} nombre={a.estado_nombre} /></div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canEdit && <button onClick={onEdit} aria-label="Editar" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><Edit2 className="w-4 h-4" /></button>}
                    {canDelete && <button onClick={() => onDelete(a)} aria-label="Eliminar" className="w-9 h-9 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>}
                    <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div className="bg-white rounded-2xl border border-slate-100 p-5 grid grid-cols-2 gap-4 text-xs">
                  <Dato icon={<MapPin className="w-3.5 h-3.5" />} label="Ubicación" value={a.ubicacion} />
                  <Dato icon={<UserIcon className="w-3.5 h-3.5" />} label="Responsable" value={a.responsable_nombre} />
                  <Dato label="Área" value={a.area_nombre} />
                  <Dato icon={<Tag className="w-3.5 h-3.5" />} label="Marca / modelo" value={[a.marca_nombre, a.modelo].filter(Boolean).join(' · ')} />
                  <Dato label="Serial" value={a.serial} />
                  <Dato icon={<Truck className="w-3.5 h-3.5" />} label="Proveedor" value={a.proveedor_nombre ? `${a.proveedor_nombre} · NIT ${a.proveedor_id}` : null} />
                  <Dato icon={<Calendar className="w-3.5 h-3.5" />} label="Adquirido" value={fmtDate(a.fecha_adquisicion)} />
                  <Dato icon={<Wrench className="w-3.5 h-3.5" />} label="Próx. mantenimiento" value={a.proximo_mantenimiento ? `${fmtDate(a.proximo_mantenimiento)}${a.frecuencia_mantenimiento_dias ? ` (cada ${a.frecuencia_mantenimiento_dias} d)` : ''}` : null} />
                  <Dato icon={<DollarSign className="w-3.5 h-3.5" />} label="Costo inicial" value={fmtMoney(a.costo_inicial)} />
                  <Dato icon={<DollarSign className="w-3.5 h-3.5" />} label="Costo total de vida" value={fmtMoney(costoTotal)} strong />
                  {a.descripcion && <div className="col-span-2"><Dato label="Descripción" value={a.descripcion} /></div>}
                </div>

                {canCreate && a.estado_id !== ESTADO_ACTIVO.BAJA && (
                  showEvento ? (
                    <form onSubmit={saveEvento} className="bg-white rounded-2xl border-2 border-emerald-200 p-5 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900">Registrar evento</h4>
                        <button type="button" onClick={() => setShowEvento(false)} aria-label="Cancelar" className="text-slate-400"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls} htmlFor="ev-tipo">Tipo</label>
                          <select id="ev-tipo" value={evt.tipo_evento} onChange={e => setEvt({ ...evt, tipo_evento: e.target.value })} className={inputCls}>
                            {EVENTOS_MANUALES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <div><label className={labelCls} htmlFor="ev-fecha">Fecha</label><input id="ev-fecha" type="date" required max={today()} value={evt.fecha} onChange={e => setEvt({ ...evt, fecha: e.target.value })} className={inputCls} /></div>
                      </div>
                      <div><label className={labelCls} htmlFor="ev-desc">Descripción *</label><textarea id="ev-desc" required rows={3} value={evt.descripcion} onChange={e => setEvt({ ...evt, descripcion: e.target.value })} className={`${inputCls} resize-none`} placeholder="¿Qué se hizo o qué pasó?" /></div>
                      <div>
                        <label className={labelCls}>Proveedor</label>
                        <SearchableSelect options={proveedorOpts} value={evt.proveedor_id} onChange={v => setEvt({ ...evt, proveedor_id: v || null })} placeholder="Seleccione proveedor…" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls} htmlFor="ev-costo">Costo</label><input id="ev-costo" type="number" min={0} value={evt.costo} onChange={e => setEvt({ ...evt, costo: e.target.value })} className={inputCls} /></div>
                        <div><label className={labelCls} htmlFor="ev-fact">Factura</label><input id="ev-fact" value={evt.factura} onChange={e => setEvt({ ...evt, factura: e.target.value })} className={inputCls} /></div>
                      </div>
                      {evt.tipo_evento !== 'BAJA' && (
                        <div>
                          <label className={labelCls} htmlFor="ev-estado">Estado del activo después del evento</label>
                          <select id="ev-estado" value={evt.estado_resultante_id} onChange={e => setEvt({ ...evt, estado_resultante_id: e.target.value })} className={inputCls}>
                            <option value="">Sin cambio ({a.estado_nombre})</option>
                            {cat.estados.filter(e => e.id !== ESTADO_ACTIVO.BAJA).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                          </select>
                        </div>
                      )}
                      <SoportesPicker archivos={archivos} onChange={setArchivos} />
                      <button type="submit" disabled={saving} className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Registrar
                      </button>
                    </form>
                  ) : (
                    <button onClick={() => setShowEvento(true)} className="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                      <ClipboardList className="w-4 h-4" /> Registrar mantenimiento, gasto o incidencia
                    </button>
                  )
                )}

                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-3">Hoja de vida ({a.eventos.length})</h4>
                  <ol className="relative border-l-2 border-slate-200 ml-2 space-y-5">
                    {a.eventos.map((e: any) => {
                      const info = eventoInfo(e.tipo_evento);
                      return (
                        <li key={e.id} className="ml-5">
                          <span className={`absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full ring-4 ring-slate-50 ${info.color}`} />
                          <div className="bg-white rounded-2xl border border-slate-100 p-4">
                            <div className="flex justify-between gap-2 flex-wrap">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{info.label}</p>
                              <p className="text-[10px] font-bold text-slate-400">{fmtDate(e.fecha)}</p>
                            </div>
                            <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{e.descripcion}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500 font-bold">
                              {Number(e.costo) > 0 && <span className="text-slate-900">{fmtMoney(e.costo)}</span>}
                              {e.proveedor_nombre && <span>Proveedor: {e.proveedor_nombre}</span>}
                              {e.factura && <span>Factura: {e.factura}</span>}
                              {e.estado_resultante_id && <span>→ {e.estado_resultante_nombre || estadoNombre(e.estado_resultante_id)}</span>}
                              <span>Por: {e.created_by_name || '—'}</span>
                            </div>
                            {e.archivos.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {e.archivos.map((f: any) => f.mime === 'application/pdf' ? (
                                  <button key={f.id} onClick={() => openPdf(f.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200">
                                    <FileText className="w-3.5 h-3.5" /> {f.nombre || 'PDF'}
                                  </button>
                                ) : (
                                  <SecureImage key={f.id} src={api.ghActivosArchivoUrl(f.id)} alt={`Soporte ${info.label}`} className="w-20 h-20 rounded-xl" onClick={setLightbox} />
                                ))}
                              </div>
                            )}
                            {e.archivos.length === 0 && e.tipo_evento.startsWith('MANTENIMIENTO') && (
                              <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1"><Paperclip className="w-3 h-3" /> Sin soportes adjuntos</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
};

/** Soportes de un evento: foto con la cámara o archivos (fotos/PDF). Las fotos se comprimen con buena calidad. */
const SoportesPicker: React.FC<{ archivos: File[]; onChange: (f: File[]) => void }> = ({ archivos, onChange }) => {
  const camRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const MAX = 6;

  const agregar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setBusy(true);
    try {
      const nuevos: File[] = [];
      for (const f of Array.from(lista).slice(0, MAX - archivos.length)) {
        if (f.type.startsWith('image/')) {
          const r = await compressImage(f);
          nuevos.push(new File([r.blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        } else if (f.type === 'application/pdf') {
          if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} supera 10 MB`); continue; }
          nuevos.push(f);
        } else {
          toast.error(`${f.name}: solo fotos o PDF`);
        }
      }
      onChange([...archivos, ...nuevos].slice(0, MAX));
    } catch (e: any) {
      toast.error(e.message || 'No se pudo procesar el archivo');
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <p className={labelCls}>Soportes (fotos o PDF, máx. {MAX})</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy || archivos.length >= MAX} onClick={() => camRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
          <Camera className="w-4 h-4" /> Tomar foto
        </button>
        <button type="button" disabled={busy || archivos.length >= MAX} onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
          <Paperclip className="w-4 h-4" /> Adjuntar
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => agregar(e.target.files)} />
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={e => agregar(e.target.files)} />
      {busy && <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Procesando…</p>}
      {archivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {archivos.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 text-[11px] text-slate-600">
              <span className="truncate flex items-center gap-1.5">{f.type === 'application/pdf' ? <FileText className="w-3.5 h-3.5 shrink-0" /> : <Camera className="w-3.5 h-3.5 shrink-0" />}{f.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-slate-400">{f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`}</span>
                <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => onChange(archivos.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Dato: React.FC<{ label: string; value?: React.ReactNode; icon?: React.ReactNode; strong?: boolean }> = ({ label, value, icon, strong }) => (
  <div>
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">{icon}{label}</p>
    <p className={`mt-0.5 ${strong ? 'text-sm font-black text-slate-900' : 'font-bold text-slate-700'}`}>{value || '—'}</p>
  </div>
);

export default HojaVidaActivos;
