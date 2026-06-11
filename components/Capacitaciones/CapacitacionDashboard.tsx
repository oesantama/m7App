import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../../constants';
import { api, API_URL } from '../../services/api';

const certUrl = (numero: string) => `${API_URL.replace('/api', '')}/api/cap/public/certificado/${numero}`;
import { toast } from 'sonner';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface Asignacion {
  id: number;
  capacitacion_id: number;
  capacitacion_titulo: string;
  cedula: string;
  nombre_colaborador: string;
  tipo_proceso: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  intentos_realizados: number;
  max_intentos_total: number;
  mejor_calificacion: number | null;
  nota_minima_aprobacion: number;
  fecha_completado: string | null;
  numero_certificado: string | null;
  certificado_link: string | null;
}

interface Intento {
  id: number;
  numero_intento: number;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  calificacion: number | null;
  aprobado: boolean;
  tiempo_empleado_segundos: number | null;
  numero_certificado: string | null;
}

interface Stats {
  total: string; completados: string; pendientes: string;
  en_curso: string; fallidos: string; vencidos: string;
  aprobados: string; promedio_calificacion: string | null; promedio_intentos: string | null;
}

interface Props {
  capacitaciones: { id: number; titulo: string }[];
  usuarioControl?: string;
  cedulaFiltro?: string;
}

const ESTADO_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  PENDIENTE:  { color: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-300',   label: 'Pendiente' },
  EN_CURSO:   { color: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400',   label: 'En Curso' },
  COMPLETADO: { color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Completado' },
  FALLIDO:    { color: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500',    label: 'Fallido' },
  VENCIDO:    { color: 'bg-orange-50 text-orange-700',   dot: 'bg-orange-400',  label: 'Vencido' },
};

const fmtTime = (secs: number | null) => {
  if (!secs) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const CapacitacionDashboard: React.FC<Props> = ({ capacitaciones, usuarioControl = 'admin', cedulaFiltro }) => {
  const [loading, setLoading]       = useState(false);
  const [filterCapId, setFilterCapId] = useState<number | ''>('');
  const [filterEstado, setFilterEstado] = useState('');
  const [stats, setStats]           = useState<Stats | null>(null);
  const [detalle, setDetalle]       = useState<Asignacion[]>([]);

  const [modalIntento, setModalIntento]   = useState<Asignacion | null>(null);
  const [intentos, setIntentos]           = useState<Intento[]>([]);
  const [loadingIntentos, setLoadingIntentos] = useState(false);

  const [modalAmpliar, setModalAmpliar]   = useState<Asignacion | null>(null);
  const [cantidadAmpliar, setCantidadAmpliar] = useState(1);
  const [loadingAccion, setLoadingAccion] = useState(false);
  const [modalReset, setModalReset]       = useState<Asignacion | null>(null);
  const [modalFechas, setModalFechas]     = useState<Asignacion | null>(null);
  const [fechasEdit, setFechasEdit]       = useState({ desde: '', hasta: '' });

  useEffect(() => { loadDashboard(); }, [filterCapId]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await api.capGetDashboard(filterCapId || undefined, cedulaFiltro);
      setStats(data.stats);
      setDetalle(data.detalle);
    } catch { toast.error('Error al cargar el dashboard'); }
    finally { setLoading(false); }
  };

  const tableData = useMemo(() =>
    filterEstado ? detalle.filter(a => a.estado === filterEstado) : detalle,
  [detalle, filterEstado]);

  const pct = (a: string, b: string) => {
    const t = Number(a); if (!t) return 0;
    return Math.round((Number(b) / t) * 100);
  };

  const handleVerIntentos = async (a: Asignacion) => {
    setModalIntento(a); setLoadingIntentos(true);
    try { setIntentos(await api.capGetIntentosByAsignacion(a.id)); }
    catch { toast.error('Error al cargar intentos'); }
    finally { setLoadingIntentos(false); }
  };

  const handleResetAsignacion = (a: Asignacion) => setModalReset(a);

  const confirmarReset = async () => {
    if (!modalReset) return;
    setLoadingAccion(true);
    try {
      await api.capResetAsignacion(modalReset.id, usuarioControl);
      toast.success(`Nuevo ciclo habilitado para ${modalReset.nombre_colaborador || modalReset.cedula}.`);
      setModalReset(null); loadDashboard();
    } catch { toast.error('Error al resetear'); }
    finally { setLoadingAccion(false); }
  };

  const handleActualizarFechas = async () => {
    if (!modalFechas) return;
    if (!fechasEdit.desde || !fechasEdit.hasta) { toast.error('Las fechas son obligatorias'); return; }
    setLoadingAccion(true);
    try {
      await api.capActualizarFechas(modalFechas.id, fechasEdit.desde, fechasEdit.hasta);
      toast.success(`Fechas actualizadas para ${modalFechas.nombre_colaborador || modalFechas.cedula}`);
      setModalFechas(null); loadDashboard();
    } catch (e: any) { toast.error(e.message || 'Error al actualizar fechas'); }
    finally { setLoadingAccion(false); }
  };

  const handleAmpliarIntentos = async () => {
    if (!modalAmpliar) return;
    setLoadingAccion(true);
    try {
      const r = await api.capAmpliarIntentos(modalAmpliar.id, cantidadAmpliar, usuarioControl);
      const accion = cantidadAmpliar > 0 ? `Se agregaron ${cantidadAmpliar}` : `Se restaron ${Math.abs(cantidadAmpliar)}`;
      toast.success(`${accion} intento(s). Nuevo máximo: ${r.nuevo_max}`);
      setModalAmpliar(null); setCantidadAmpliar(1); loadDashboard();
    } catch { toast.error('Error al ampliar intentos'); }
    finally { setLoadingAccion(false); }
  };

  // ── Columnas para DataTable ──────────────────────────────────────────────────
  const columns: ColumnDef<Asignacion>[] = [
    {
      header: 'Colaborador', key: 'nombre_colaborador', sortable: true,
      exportRender: (a) => `${a.nombre_colaborador || '—'} (${a.cedula})`,
      render: (a) => (
        <div className="flex items-center gap-2.5 min-w-[160px]">
          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-500 text-xs flex-shrink-0">
            {(a.nombre_colaborador || a.cedula).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-black text-slate-900 uppercase leading-none">{a.nombre_colaborador || '—'}</p>
            <p className="text-[10px] text-slate-400 font-bold">{a.cedula}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Capacitación', key: 'capacitacion_titulo', sortable: true,
      render: (a) => <p className="text-xs font-bold text-slate-700 uppercase max-w-[160px] truncate">{a.capacitacion_titulo}</p>,
    },
    {
      header: 'Proceso', key: 'tipo_proceso', sortable: true,
      render: (a) => (
        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${a.tipo_proceso === 'INDUCCION' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
          {a.tipo_proceso}
        </span>
      ),
    },
    {
      header: 'Estado', key: 'estado', sortable: true,
      render: (a) => {
        const cfg = ESTADO_CONFIG[a.estado] || ESTADO_CONFIG.PENDIENTE;
        return (
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${cfg.color}`}>{cfg.label}</span>
          </div>
        );
      },
    },
    {
      header: 'Intentos', key: 'intentos_realizados', sortable: true,
      exportRender: (a) => `${a.intentos_realizados}/${a.max_intentos_total}`,
      render: (a) => {
        const agotado = a.intentos_realizados >= a.max_intentos_total && a.estado !== 'COMPLETADO';
        return (
          <div>
            <div className="flex items-center gap-1">
              <span className={`text-sm font-black ${agotado ? 'text-rose-600' : 'text-slate-900'}`}>{a.intentos_realizados}</span>
              <span className="text-[10px] text-slate-400 font-bold">/ {a.max_intentos_total}</span>
              {agotado && <span className="ml-1 text-[8px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded font-black">AGOTADO</span>}
            </div>
            <div className="w-14 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div className={`h-full rounded-full ${agotado ? 'bg-rose-500' : 'bg-slate-400'}`}
                style={{ width: `${Math.min(100, (a.intentos_realizados / a.max_intentos_total) * 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Calificación', key: 'mejor_calificacion', sortable: true,
      exportRender: (a) => a.mejor_calificacion !== null ? `${a.mejor_calificacion}%` : '—',
      render: (a) => {
        const aprobado = a.estado === 'COMPLETADO' && (a.mejor_calificacion ?? 0) >= a.nota_minima_aprobacion;
        return a.mejor_calificacion !== null ? (
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-black ${aprobado ? 'text-emerald-600' : 'text-rose-500'}`}>{a.mejor_calificacion}%</span>
              {aprobado ? <Icons.CheckCircle className="w-4 h-4 text-emerald-500" /> : <Icons.X className="w-4 h-4 text-rose-400" />}
            </div>
            <p className="text-[9px] text-slate-400">mín. {a.nota_minima_aprobacion}%</p>
          </div>
        ) : <span className="text-[10px] text-slate-300 font-black">—</span>;
      },
    },
    {
      header: 'Inicia', key: 'fecha_inicio', sortable: true,
      exportRender: (a) => a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleDateString('es-CO') : '—',
      render: (a) => {
        const notStarted = a.fecha_inicio && new Date(a.fecha_inicio) > new Date();
        return <p className={`text-[10px] font-bold ${notStarted ? 'text-amber-500' : 'text-slate-400'}`}>{a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleDateString('es-CO') : '—'}</p>;
      },
    },
    {
      header: 'Vence', key: 'fecha_fin', sortable: true,
      exportRender: (a) => new Date(a.fecha_fin).toLocaleDateString('es-CO'),
      render: (a) => {
        const isVencida = new Date(a.fecha_fin) < new Date() && a.estado !== 'COMPLETADO';
        return <p className={`text-[10px] font-bold ${isVencida ? 'text-rose-500' : 'text-slate-400'}`}>{new Date(a.fecha_fin).toLocaleDateString('es-CO')}</p>;
      },
    },
    {
      header: 'Cert.', key: 'numero_certificado', sortable: false,
      exportRender: (a) => a.numero_certificado || '—',
      render: (a) => a.numero_certificado ? (
        <a href={certUrl(a.numero_certificado)} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[9px] font-black uppercase hover:bg-emerald-500 hover:text-white transition-all">
          <Icons.Download className="w-3 h-3" /> Cert.
        </a>
      ) : <span className="text-slate-200 font-black text-[10px]">—</span>,
    },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: (a) => (
        <div className="flex items-center gap-1">
          {/* Ver intentos */}
          <div className="group relative">
            <button onClick={e => { e.stopPropagation(); handleVerIntentos(a); }}
              className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all text-[9px] font-black uppercase">
              <Icons.Eye className="w-3 h-3" /> Ver
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-slate-900 text-white text-[9px] font-medium rounded-xl px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 text-center leading-snug shadow-xl">
              Historial de intentos, calificaciones y tiempo empleado
            </div>
          </div>

          {/* Nuevo ciclo */}
          {(a.estado === 'COMPLETADO' || a.estado === 'FALLIDO' || a.estado === 'VENCIDO') && (
            <div className="group relative">
              <button onClick={e => { e.stopPropagation(); handleResetAsignacion(a); }}
                className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-500 hover:text-white transition-all text-[9px] font-black uppercase">
                <Icons.RotateCcw className="w-3 h-3" /> Ciclo
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-slate-900 text-white text-[9px] font-medium rounded-xl px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 text-center leading-snug shadow-xl">
                Reinicia la asignación a PENDIENTE conservando el historial anterior
              </div>
            </div>
          )}

          {/* Editar fechas */}
          <div className="group relative">
            <button onClick={e => {
              e.stopPropagation();
              setModalFechas(a);
              setFechasEdit({
                desde: a.fecha_inicio ? a.fecha_inicio.split('T')[0] : '',
                hasta: a.fecha_fin ? a.fecha_fin.split('T')[0] : '',
              });
            }}
              className="flex items-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-600 rounded-xl hover:bg-violet-500 hover:text-white transition-all text-[9px] font-black uppercase">
              <Icons.Calendar className="w-3 h-3" /> Fechas
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-slate-900 text-white text-[9px] font-medium rounded-xl px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 text-center leading-snug shadow-xl">
              Modificar fecha de inicio y vencimiento
            </div>
          </div>

          {/* Ampliar intentos */}
          <div className="group relative">
            <button onClick={e => { e.stopPropagation(); setModalAmpliar(a); setCantidadAmpliar(1); }}
              className="flex items-center gap-1 px-2 py-1.5 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-500 hover:text-white transition-all text-[9px] font-black uppercase">
              <Icons.Plus className="w-3 h-3" /> +Int
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-slate-900 text-white text-[9px] font-medium rounded-xl px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 text-center leading-snug shadow-xl">
              Agrega más intentos disponibles sin resetear el historial
            </div>
          </div>
        </div>
      ),
    },
  ];

  const KPICard = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
    <div className="bg-white rounded-2xl p-5 border-2 border-slate-100 shadow-sm">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Filtros externos */}
      <div className="flex flex-col md:flex-row gap-3">
        <select value={filterCapId} onChange={e => setFilterCapId(e.target.value ? Number(e.target.value) : '')}
          className="bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-[11px] font-black uppercase outline-none focus:border-slate-900 min-w-[220px]">
          <option value="">Todas las capacitaciones</option>
          {capacitaciones.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
          className="bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-[11px] font-black uppercase outline-none focus:border-slate-900">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={loadDashboard}
          className="px-5 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-2">
          <Icons.RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <KPICard label="Total asignados"  value={stats.total}       color="text-slate-900" />
          <KPICard label="Completados"      value={stats.completados} sub={`${pct(stats.total, stats.completados)}% del total`} color="text-emerald-600" />
          <KPICard label="Aprobados"        value={stats.aprobados}   sub={`${pct(stats.completados, stats.aprobados)}% de completados`} color="text-teal-600" />
          <KPICard label="Pendientes"       value={stats.pendientes}  color="text-slate-500" />
          <KPICard label="En curso"         value={stats.en_curso}    color="text-amber-600" />
          <KPICard label="Fallidos"         value={stats.fallidos}    color="text-rose-600" />
          <KPICard label="Promedio"         value={stats.promedio_calificacion ? `${stats.promedio_calificacion}%` : '—'} sub={`${stats.promedio_intentos || '—'} intentos prom.`} color="text-blue-600" />
        </div>
      )}

      {/* Barra de progreso */}
      {stats && Number(stats.total) > 0 && (
        <div className="bg-white rounded-2xl p-5 border-2 border-slate-100">
          <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-2">
            <span>Progreso general de aprobación</span>
            <span>{pct(stats.total, stats.aprobados)}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct(stats.total, stats.aprobados)}%` }} />
          </div>
          <div className="flex flex-wrap gap-6 mt-3 text-[9px] font-bold uppercase text-slate-400">
            {[
              { label: 'Aprobados', value: stats.aprobados, color: 'bg-emerald-500' },
              { label: 'En curso',  value: stats.en_curso,  color: 'bg-amber-400' },
              { label: 'Pendientes',value: stats.pendientes,color: 'bg-slate-300' },
              { label: 'Fallidos',  value: stats.fallidos,  color: 'bg-rose-500' },
              { label: 'Vencidos',  value: stats.vencidos,  color: 'bg-orange-400' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                {item.label}: {item.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DataTable */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable<Asignacion>
          data={tableData}
          columns={columns}
          searchPlaceholder="Buscar por nombre, cédula, capacitación..."
          excelFileName={`capacitaciones_radar_${new Date().toISOString().slice(0, 10)}.xlsx`}
          excelSheetName="Radar Capacitaciones"
        />
      )}

      {/* ── MODAL VER INTENTOS ── */}
      {modalIntento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-slate-900 px-6 py-5 flex items-start justify-between flex-shrink-0">
              <div>
                <h2 className="text-white font-black text-base uppercase tracking-tight">Historial de Intentos</h2>
                <p className="text-slate-400 text-xs font-medium mt-0.5">
                  {modalIntento.nombre_colaborador || modalIntento.cedula} · {modalIntento.capacitacion_titulo}
                </p>
              </div>
              <button onClick={() => setModalIntento(null)} className="text-slate-400 hover:text-white transition-colors ml-4">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Estado actual</p>
                  <span className={`text-xs font-black uppercase ${ESTADO_CONFIG[modalIntento.estado]?.color || ''} px-2 py-0.5 rounded-lg`}>
                    {ESTADO_CONFIG[modalIntento.estado]?.label || modalIntento.estado}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Intentos usados</p>
                  <p className="text-lg font-black text-slate-900">{modalIntento.intentos_realizados} / {modalIntento.max_intentos_total}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Mejor calificación</p>
                  <p className={`text-lg font-black ${modalIntento.mejor_calificacion !== null && modalIntento.mejor_calificacion >= modalIntento.nota_minima_aprobacion ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {modalIntento.mejor_calificacion !== null ? `${modalIntento.mejor_calificacion}%` : '—'}
                  </p>
                </div>
              </div>

              {loadingIntentos ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : intentos.length === 0 ? (
                <div className="text-center py-10 text-slate-300 text-sm font-black uppercase">Sin intentos registrados aún</div>
              ) : (
                <div className="space-y-2">
                  {intentos.map(i => (
                    <div key={i.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${i.aprobado ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${i.aprobado ? 'bg-emerald-500 text-white' : i.estado === 'COMPLETADO' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'}`}>
                        #{i.numero_intento}
                      </div>
                      <div className="flex-1 grid grid-cols-4 gap-3">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">Fecha</p>
                          <p className="text-xs font-bold text-slate-700">{new Date(i.fecha_inicio).toLocaleDateString('es-CO')}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">Calificación</p>
                          <p className={`text-sm font-black ${i.calificacion !== null ? (i.aprobado ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>
                            {i.calificacion !== null ? `${Number(i.calificacion).toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">Tiempo</p>
                          <p className="text-xs font-bold text-slate-700">{fmtTime(i.tiempo_empleado_segundos)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">Resultado</p>
                          <p className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg inline-block ${i.aprobado ? 'bg-emerald-100 text-emerald-700' : i.estado === 'COMPLETADO' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                            {i.estado === 'COMPLETADO' ? (i.aprobado ? '✓ Aprobó' : '✗ No aprobó') : i.estado}
                          </p>
                        </div>
                      </div>
                      {i.numero_certificado ? (
                        <a href={`/api/cap/public/certificado/${i.numero_certificado}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-600 transition-all flex-shrink-0 whitespace-nowrap">
                          <Icons.Download className="w-3.5 h-3.5" /> Descargar
                        </a>
                      ) : <div className="w-24 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3 flex-shrink-0">
              <button onClick={() => { setModalAmpliar(modalIntento); setCantidadAmpliar(1); setModalIntento(null); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-amber-600 transition-all">
                <Icons.Plus className="w-4 h-4" /> Ampliar intentos
              </button>
              {(modalIntento.estado === 'COMPLETADO' || modalIntento.estado === 'FALLIDO' || modalIntento.estado === 'VENCIDO') && (
                <button onClick={() => { setModalReset(modalIntento); setModalIntento(null); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-blue-600 transition-all">
                  <Icons.RotateCcw className="w-4 h-4" /> Habilitar nuevo ciclo
                </button>
              )}
              <button onClick={() => setModalIntento(null)}
                className="ml-auto px-5 py-2.5 bg-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-300 transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL AMPLIAR INTENTOS ── */}
      {modalAmpliar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className={`px-6 py-5 ${cantidadAmpliar >= 0 ? 'bg-amber-500' : 'bg-rose-500'}`}>
              <h2 className="text-white font-black text-base uppercase tracking-tight">Ajustar Intentos</h2>
              <p className="text-white/80 text-xs font-medium mt-0.5">{modalAmpliar.nombre_colaborador || modalAmpliar.cedula}</p>
            </div>
            <div className="p-6 space-y-5">
              <div className={`rounded-2xl p-4 text-center border-2 ${cantidadAmpliar >= 0 ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`}>
                <p className={`text-[9px] font-black uppercase ${cantidadAmpliar >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>Intentos actuales</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{modalAmpliar.intentos_realizados} usados / {modalAmpliar.max_intentos_total} máximo</p>
                {modalAmpliar.intentos_realizados >= modalAmpliar.max_intentos_total && (
                  <p className="text-xs text-rose-600 font-bold mt-1">⚠️ Intentos agotados</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {cantidadAmpliar >= 0 ? '¿Cuántos intentos adicionales?' : '¿Cuántos intentos reducir?'}
                </label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCantidadAmpliar(prev => {
                    const next = prev - 1;
                    const newMax = modalAmpliar.max_intentos_total + next;
                    return newMax >= 1 ? next : prev;
                  })} className="w-10 h-10 bg-slate-100 rounded-xl font-black text-slate-700 hover:bg-slate-200 transition-all text-lg">−</button>
                  <span className={`flex-1 text-center text-2xl font-black ${cantidadAmpliar > 0 ? 'text-amber-600' : cantidadAmpliar < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {cantidadAmpliar > 0 ? `+${cantidadAmpliar}` : cantidadAmpliar}
                  </span>
                  <button onClick={() => setCantidadAmpliar(prev => Math.min(20, prev + 1))}
                    className="w-10 h-10 bg-slate-100 rounded-xl font-black text-slate-700 hover:bg-slate-200 transition-all text-lg">+</button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium text-center">
                  Nuevo máximo: <span className="font-black text-slate-700">{modalAmpliar.max_intentos_total + cantidadAmpliar}</span> intentos
                  {cantidadAmpliar < 0 && modalAmpliar.max_intentos_total + cantidadAmpliar <= modalAmpliar.intentos_realizados && (
                    <span className="text-rose-500 block">⚠️ El máximo quedaría igual o menor a los intentos ya realizados</span>
                  )}
                </p>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => { setModalAmpliar(null); setCantidadAmpliar(1); }}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={handleAmpliarIntentos} disabled={loadingAccion || cantidadAmpliar === 0}
                className={`flex-1 py-3 text-white rounded-2xl text-[10px] font-black uppercase transition-all disabled:opacity-50 ${cantidadAmpliar >= 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
                {loadingAccion ? 'Guardando...' : cantidadAmpliar > 0 ? `Agregar ${cantidadAmpliar} intento(s)` : cantidadAmpliar < 0 ? `Restar ${Math.abs(cantidadAmpliar)} intento(s)` : 'Sin cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Habilitar Nuevo Ciclo ─────────────────────────────────────── */}
      {modalReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header azul */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Icons.RotateCcw className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-sm uppercase tracking-wide">Habilitar Nuevo Ciclo</p>
                  <p className="text-blue-100 text-xs font-medium mt-0.5">{modalReset.nombre_colaborador || modalReset.cedula}</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Estado actual */}
              <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
                <span className="text-[10px] font-black uppercase text-slate-500">Estado actual</span>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl ${ESTADO_CONFIG[modalReset.estado]?.color || 'bg-slate-100 text-slate-600'}`}>
                  {ESTADO_CONFIG[modalReset.estado]?.label || modalReset.estado}
                </span>
              </div>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 space-y-2">
                <p className="text-[11px] font-black text-blue-800">¿Qué hace «Nuevo Ciclo»?</p>
                <ul className="space-y-1.5">
                  {[
                    { icon: '↺', text: 'Resetea el estado a PENDIENTE' },
                    { icon: '📋', text: 'Los intentos anteriores se conservan en el historial' },
                    { icon: '🔢', text: 'El contador de intentos vuelve a 0' },
                    { icon: '✅', text: 'La persona podrá presentar la capacitación de nuevo' },
                  ].map(({ icon, text }) => (
                    <li key={text} className="flex items-start gap-2">
                      <span className="text-blue-500 text-[11px] w-4 shrink-0">{icon}</span>
                      <span className="text-[10px] text-blue-700 font-medium leading-snug">{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Capacitación */}
              <div className="text-[10px] text-slate-400 font-medium text-center">
                Capacitación: <span className="text-slate-600 font-black">{modalReset.capacitacion_titulo}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setModalReset(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarReset} disabled={loadingAccion}
                className="flex-1 py-3 bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-blue-600 transition-all disabled:opacity-50">
                {loadingAccion ? 'Procesando...' : 'Habilitar ciclo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR FECHAS ─────────────────────────────────────────────── */}
      {modalFechas && (
        <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-7 bg-violet-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Icons.Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-tight">Modificar Fechas</p>
                  <p className="text-violet-200 text-xs font-medium mt-0.5">{modalFechas.nombre_colaborador || modalFechas.cedula}</p>
                </div>
              </div>
            </div>
            <div className="p-7 space-y-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{modalFechas.capacitacion_titulo}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha Inicio</label>
                  <input type="date" value={fechasEdit.desde} onChange={e => setFechasEdit(f => ({ ...f, desde: e.target.value }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-violet-400 transition-all text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha Límite</label>
                  <input type="date" value={fechasEdit.hasta} onChange={e => setFechasEdit(f => ({ ...f, hasta: e.target.value }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-violet-400 transition-all text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setModalFechas(null)} disabled={loadingAccion}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
                  Cancelar
                </button>
                <button onClick={handleActualizarFechas} disabled={loadingAccion}
                  className="flex-1 py-3 bg-violet-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-violet-600 transition-all disabled:opacity-50">
                  {loadingAccion ? 'Guardando...' : 'Guardar fechas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapacitacionDashboard;
