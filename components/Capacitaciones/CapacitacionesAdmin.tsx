import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { User } from '../../types';
import { hasPermission } from '../../utils/permissions';
import { toast } from 'sonner';
import CapacitacionEditor from './CapacitacionEditor';
import CapacitacionDashboard from './CapacitacionDashboard';
import CapPreviewModal from './CapPreviewModal';
import PublicCapacitacion from './PublicCapacitacion';

interface Capacitacion {
  id: number;
  titulo: string;
  descripcion: string;
  objetivo: string;
  categoria: string;
  nota_minima_aprobacion: number;
  max_intentos: number;
  tiempo_limite_minutos: number | null;
  tipo_proceso: string;
  tipo_acceso: 'INTERNO' | 'EXTERNO' | 'AMBOS';
  estado: 'BORRADOR' | 'ACTIVO' | 'ARCHIVADO';
  total_preguntas: number;
  total_recursos: number;
  total_asignados: number;
  total_con_intentos: number;
  mi_estado_asignacion?: string;
  mis_intentos_restantes?: number;
}

interface Personal { cedula: string; nombre: string; cargo_nombre: string; cargo_id: number; }
interface Cargo { id: number; nombre: string; }

const ESTADO_STYLE: Record<string, string> = {
  ACTIVO:    'bg-emerald-500 text-slate-950',
  BORRADOR:  'bg-amber-400 text-slate-950',
  ARCHIVADO: 'bg-slate-400 text-white',
};

interface Props { user: User; }

interface AppUser { id: string; name: string; email: string; documentNumber?: string; roleId?: string; }
interface Especialista {
  id: number; user_id: string; categorias: string[]; activo: boolean;
  user_name?: string; user_email?: string; user_document?: string;
}
const CATEGORIAS_CAP = ['GENERAL', 'SST', 'INDUCCION CORPORATIVA', 'PROCESO OPERATIVO', 'COMPLIANCE', 'CALIDAD', 'TECNOLOGIA'];

const CapacitacionesAdmin: React.FC<Props> = ({ user }) => {
  const [tab, setTab] = useState<'lista' | 'dashboard' | 'especialistas'>('lista');
  const [caps, setCaps] = useState<Capacitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedCap, setSelectedCap] = useState<any | null>(null);
  const [showAsignar, setShowAsignar] = useState(false);
  const [asignarCap, setAsignarCap] = useState<Capacitacion | null>(null);

  // Asignación state
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [asigMode, setAsigMode] = useState<'individual' | 'cargo'>('individual');
  const [selectedCedulas, setSelectedCedulas] = useState<string[]>([]);
  const [selectedCargoId, setSelectedCargoId] = useState<number | ''>('');
  const [asigSearch, setAsigSearch] = useState('');
  const [asigFechas, setAsigFechas] = useState({ desde: '', hasta: '' });
  const [asigLoading, setAsigLoading] = useState(false);
  const [yaAsignadosCedulas, setYaAsignadosCedulas] = useState<Set<string>>(new Set());

  // Modal eliminar/archivar
  const [modalEliminar, setModalEliminar] = useState<Capacitacion | null>(null);

  // Especialistas state
  const [especialistas, setEspecialistas] = useState<Especialista[]>([]);
  const [loadingEsp, setLoadingEsp] = useState(false);
  const [modalEsp, setModalEsp] = useState<Partial<Especialista> | null>(null);
  const [savingEsp, setSavingEsp] = useState(false);
  const [confirmDeleteEsp, setConfirmDeleteEsp] = useState<Especialista | null>(null);
  const [espUserSearch, setEspUserSearch] = useState('');
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [previewCap, setPreviewCap] = useState<Capacitacion | null>(null);
  const [iniciarCap, setIniciarCap] = useState<Capacitacion | null>(null);

  const isEspecialista = hasPermission(user, 'CAPACITACIONES', 'create');
  const canEdit        = hasPermission(user, 'CAPACITACIONES', 'edit');
  const canDelete      = hasPermission(user, 'CAPACITACIONES', 'delete');

  useEffect(() => {
    loadCaps();
    if (isEspecialista) {
      api.getPersonal().then(setPersonal).catch(() => {});
      api.capGetCargos().then(setCargos).catch(() => {});
      api.getUsers().then(setAppUsers).catch(() => {});
      loadEspecialistas();
    }
  }, []);

  const loadEspecialistas = async () => {
    setLoadingEsp(true);
    try { setEspecialistas(await api.capGetEspecialistas()); }
    catch { toast.error('Error al cargar especialistas'); }
    finally { setLoadingEsp(false); }
  };

  const handleSaveEsp = async () => {
    if (!modalEsp) return;
    if (!modalEsp.user_id) return toast.error('Debe seleccionar un usuario');
    setSavingEsp(true);
    try {
      await api.capSaveEspecialista({ ...modalEsp, usuario_control: user.name });
      toast.success(modalEsp.id ? 'Especialista actualizado' : 'Especialista creado');
      setModalEsp(null); loadEspecialistas();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally { setSavingEsp(false); }
  };

  const handleDeleteEsp = async () => {
    if (!confirmDeleteEsp) return;
    try {
      await api.capDeleteEspecialista(confirmDeleteEsp.id);
      toast.success('Especialista eliminado');
      setConfirmDeleteEsp(null); loadEspecialistas();
    } catch { toast.error('Error al eliminar'); }
  };

  const loadCaps = async () => {
    setLoading(true);
    try {
      const cedula = isEspecialista ? undefined : (user.documentNumber || undefined);
      const cedulaSelf = user.documentNumber || undefined;
      const data = await api.capGetCapacitaciones(cedula, cedulaSelf);
      setCaps(data);
    } catch { toast.error('Error al cargar capacitaciones'); }
    finally { setLoading(false); }
  };

  const handleEditar = async (cap: Capacitacion) => {
    try {
      const full = await api.capGetCapacitacion(cap.id);
      setSelectedCap(full);
      setShowEditor(true);
    } catch { toast.error('Error al cargar capacitación'); }
  };

  const handleNueva = () => { setSelectedCap(null); setShowEditor(true); };

  const handleEliminar = (cap: Capacitacion) => setModalEliminar(cap);

  const confirmarEliminar = async () => {
    if (!modalEliminar) return;
    try {
      await api.capDeleteCapacitacion(modalEliminar.id);
      toast.success('Capacitación eliminada');
      setModalEliminar(null); loadCaps();
    } catch { toast.error('Error al eliminar'); }
  };

  const confirmarArchivar = async () => {
    if (!modalEliminar) return;
    try {
      await api.capSaveCapacitacion({ id: modalEliminar.id, titulo: modalEliminar.titulo,
        descripcion: modalEliminar.descripcion, objetivo: modalEliminar.objetivo,
        categoria: modalEliminar.categoria, nota_minima_aprobacion: modalEliminar.nota_minima_aprobacion,
        max_intentos: modalEliminar.max_intentos, tiempo_limite_minutos: modalEliminar.tiempo_limite_minutos,
        tipo_proceso: modalEliminar.tipo_proceso, tipo_acceso: modalEliminar.tipo_acceso,
        estado: 'ARCHIVADO', preguntas: [], usuario_control: user.name,
      });
      toast.success('Capacitación archivada');
      setModalEliminar(null); loadCaps();
    } catch { toast.error('Error al archivar'); }
  };

  const copyPublicLink = (capId: number) => {
    const url = `${window.location.origin}/publico/cap?id=${capId}`;
    navigator.clipboard.writeText(url);
    toast.success('Link público copiado');
  };

  const handleAsignar = async () => {
    if (!asignarCap) return;
    if (!asigFechas.desde || !asigFechas.hasta) { toast.error('Las fechas son obligatorias'); return; }
    if (asigMode === 'individual' && selectedCedulas.length === 0) { toast.error('Selecciona al menos un colaborador'); return; }
    if (asigMode === 'cargo' && !selectedCargoId) { toast.error('Selecciona un cargo'); return; }

    setAsigLoading(true);
    try {
      const payload: any = {
        capacitacion_id: asignarCap.id,
        fecha_inicio: asigFechas.desde,
        fecha_fin: asigFechas.hasta,
        asignado_por: user.name,
      };
      if (asigMode === 'individual') payload.cedulas = selectedCedulas;
      else payload.cargo_id = selectedCargoId;

      const result = await api.capAsignar(payload);
      toast.success(`${result.asignados} colaborador(es) asignado(s) exitosamente`);
      setShowAsignar(false);
      setSelectedCedulas([]);
      setSelectedCargoId('');
    } catch { toast.error('Error al asignar'); }
    finally { setAsigLoading(false); }
  };

  // Combina personal + usuarios de la app que no estén ya en gh_personal
  const cedulasEnPersonal = new Set(personal.map(p => p.cedula));
  const appUsersAsPersonal: Personal[] = appUsers
    .filter(u => u.documentNumber && !cedulasEnPersonal.has(u.documentNumber))
    .map(u => ({ cedula: u.documentNumber!, nombre: u.name, cargo_nombre: 'Usuario App', cargo_id: 0 }));
  const personalCombinado = [...personal, ...appUsersAsPersonal];

  const filteredPersonal = personalCombinado
    .filter(p => !yaAsignadosCedulas.has(p.cedula))
    .filter(p => {
      if (!asigSearch) return true;
      const q = asigSearch.toLowerCase();
      return p.nombre?.toLowerCase().includes(q) || p.cedula.includes(q) || p.cargo_nombre?.toLowerCase().includes(q);
    });

  return (
    <div className="p-6 md:p-10 space-y-8 animate-in fade-in duration-500 bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-slate-900 rounded-[2rem] shadow-xl text-emerald-500">
            <Icons.Award className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">LMS OrbitM7 IQ</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
              Gestión de Conocimiento Gamificado · {caps.length} capacitación(es)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex bg-white p-1.5 rounded-2xl shadow border border-slate-100">
            <button onClick={() => setTab('lista')}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${tab === 'lista' ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}>
              <Icons.Target className="w-3.5 h-3.5" /> Misiones
            </button>
            {isEspecialista && (
              <button onClick={() => setTab('dashboard')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${tab === 'dashboard' ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}>
                <Icons.Activity className="w-3.5 h-3.5" /> Radar
              </button>
            )}
            {isEspecialista && (
              <button onClick={() => setTab('especialistas')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${tab === 'especialistas' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}>
                <Icons.Star className="w-3.5 h-3.5" /> Especialistas
              </button>
            )}
          </div>
          {tab === 'lista' && isEspecialista && (
            <button onClick={handleNueva}
              className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-lg flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Nueva Misión
            </button>
          )}
          {tab === 'especialistas' && isEspecialista && (
            <button onClick={() => setModalEsp({ categorias: [], activo: true })}
              className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2">
              <Icons.Plus className="w-4 h-4" /> Nuevo Especialista
            </button>
          )}
        </div>
      </div>

      {/* ── TAB LISTA ── */}
      {tab === 'lista' && (
        <>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card nueva — solo para especialista */}
              {isEspecialista && (
                <button onClick={handleNueva}
                  className="group h-full min-h-[300px] border-4 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all cursor-pointer">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <Icons.Plus className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-black text-slate-400 group-hover:text-emerald-600 uppercase tracking-widest text-center px-6">
                    Nueva Misión de Capacitación
                  </span>
                </button>
              )}

              {caps.map(cap => (
                <div key={cap.id} className="bg-white rounded-[2.5rem] shadow-lg border border-slate-100 overflow-hidden hover:shadow-2xl transition-all group flex flex-col">
                  {/* Card header */}
                  <div className="h-28 bg-slate-900 p-6 relative flex items-end overflow-hidden flex-shrink-0">
                    <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10" />
                    <div className="relative z-10 w-full">
                      <div className="flex justify-between items-start">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${ESTADO_STYLE[cap.estado] || 'bg-slate-200 text-slate-700'}`}>
                          {cap.estado}
                        </span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase">{cap.categoria}</span>
                      </div>
                      <h3 className="text-white font-black text-base uppercase tracking-tight mt-2 line-clamp-2 leading-tight">{cap.titulo}</h3>
                    </div>
                    <Icons.Target className="text-white/5 w-24 h-24 absolute -right-4 -bottom-4" />
                  </div>

                  {/* Card body */}
                  <div className="p-5 space-y-4 flex-1 flex flex-col">
                    <p className="text-xs text-slate-400 font-medium line-clamp-2 leading-relaxed italic flex-1">
                      {cap.descripcion || 'Sin descripción.'}
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-2 py-2 border-y border-slate-50">
                      <div className="text-center">
                        <p className="text-lg font-black text-slate-900">{cap.total_preguntas}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Preguntas</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black text-slate-900">{cap.total_recursos}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Recursos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black text-slate-900">{cap.nota_minima_aprobacion}%</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Aprobación</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black text-slate-900">{cap.total_asignados}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase">Asignados</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase">
                      <Icons.Clock className="w-3 h-3" />
                      {cap.tiempo_limite_minutos ? `${cap.tiempo_limite_minutos} min` : 'Sin límite de tiempo'} ·
                      <Icons.RefreshCw className="w-3 h-3" /> {cap.max_intentos} intento(s)
                    </div>

                    {/* Actions */}
                    {isEspecialista && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button onClick={() => handleEditar(cap)}
                          className="flex items-center justify-center gap-1 py-2.5 bg-slate-100 rounded-2xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                          <Icons.Edit className="w-3 h-3" /> Editar
                        </button>
                        <button onClick={async () => {
                          setAsignarCap(cap); setShowAsignar(true); setSelectedCedulas([]); setSelectedCargoId(''); setAsigSearch('');
                          try {
                            const data: any[] = await api.capGetAsignaciones(cap.id);
                            const cedulas = new Set<string>(data.map((a) => a.cedula as string));
                            setYaAsignadosCedulas(cedulas);
                          } catch { setYaAsignadosCedulas(new Set()); }
                        }}
                          className="flex items-center justify-center gap-1 py-2.5 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase hover:bg-emerald-600 transition-all shadow-md">
                          <Icons.UserPlus className="w-3 h-3" /> Asignar
                        </button>
                        <button onClick={() => setPreviewCap(cap)}
                          className="flex items-center justify-center gap-1 py-2.5 bg-violet-50 text-violet-700 rounded-2xl text-[9px] font-black uppercase hover:bg-violet-600 hover:text-white transition-all"
                          title="Ver como el usuario vería la capacitación">
                          <Icons.Eye className="w-3 h-3" /> Vista
                        </button>
                      </div>
                    )}
                    {/* Botón iniciar: para todos cuando tienen asignación activa */}
                    {(() => {
                      const estado = cap.mi_estado_asignacion;
                      const intentosRestantes = Number(cap.mis_intentos_restantes ?? 0);
                      if (!estado) return null; // sin asignación activa → no mostrar
                      if (estado === 'COMPLETADO') return (
                        <button onClick={() => setIniciarCap(cap)}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-slate-700 active:scale-95 transition-all">
                          <Icons.RefreshCw className="w-4 h-4" /> Repetir Capacitación
                        </button>
                      );
                      if (estado === 'VENCIDO') return (
                        <div className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-400 rounded-2xl text-[10px] font-black uppercase cursor-not-allowed">
                          <Icons.Clock className="w-4 h-4" /> Capacitación Vencida
                        </div>
                      );
                      if (intentosRestantes <= 0 && estado !== 'PENDIENTE') return (
                        <div className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-400 rounded-2xl text-[10px] font-black uppercase cursor-not-allowed">
                          Sin intentos disponibles
                        </div>
                      );
                      return (
                        <button onClick={() => setIniciarCap(cap)}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 active:scale-95 transition-all shadow-md shadow-emerald-500/20">
                          <Icons.Zap className="w-4 h-4" />
                          {estado === 'EN_CURSO' ? 'Continuar Capacitación' : 'Iniciar Capacitación'}
                        </button>
                      );
                    })()}
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase">
                      {cap.tipo_acceso === 'INTERNO' && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 rounded-lg">
                          <Icons.Lock className="w-3 h-3" /> Interno
                        </span>
                      )}
                      {cap.tipo_acceso === 'EXTERNO' && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-lg">
                          <Icons.Link className="w-3 h-3" /> Solo Enlace
                        </span>
                      )}
                      {(cap.tipo_acceso === 'AMBOS' || !cap.tipo_acceso) && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg">
                          <Icons.Link className="w-3 h-3" /> App + Enlace
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {isEspecialista && ((cap.tipo_acceso === 'EXTERNO' || cap.tipo_acceso === 'AMBOS') ? (
                        <button onClick={() => copyPublicLink(cap.id)}
                          className="flex items-center justify-center gap-1.5 py-2 border-2 border-blue-100 rounded-2xl text-[9px] font-black uppercase text-blue-500 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all">
                          <Icons.Link className="w-3 h-3" /> Copiar Enlace
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 py-2 border-2 border-slate-50 rounded-2xl text-[9px] font-black uppercase text-slate-300 cursor-not-allowed">
                          <Icons.Lock className="w-3 h-3" /> Sin Enlace
                        </div>
                      ))}
                      {canDelete ? (
                        <button onClick={() => handleEliminar(cap)}
                          className="flex items-center justify-center gap-1.5 py-2 border-2 border-rose-100 rounded-2xl text-[9px] font-black uppercase text-rose-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all">
                          <Icons.Trash className="w-3 h-3" /> Eliminar
                        </button>
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TAB DASHBOARD ── */}
      {tab === 'dashboard' && (
        <CapacitacionDashboard
          capacitaciones={caps.map(c => ({ id: c.id, titulo: c.titulo }))}
          usuarioControl={user.name}
          cedulaFiltro={isEspecialista ? undefined : (user.documentNumber || undefined)}
        />
      )}

      {/* ── TAB ESPECIALISTAS ── */}
      {tab === 'especialistas' && isEspecialista && (
        <div className="space-y-6">
          {loadingEsp ? (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : especialistas.length === 0 ? (
            <div className="text-center py-20 text-slate-300 font-black uppercase text-sm">
              No hay especialistas registrados aún.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {especialistas.map(e => (
                <div key={e.id} className={`bg-white rounded-[2rem] shadow border overflow-hidden transition-all hover:shadow-xl ${e.activo ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}>
                  <div className="bg-slate-900 px-6 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Icons.Star className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-sm uppercase truncate">{e.user_name || e.user_id}</p>
                      <p className="text-slate-400 text-[10px] font-bold truncate">{e.user_email}{e.user_document ? ` · ${e.user_document}` : ''}</p>
                    </div>
                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${e.activo ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Categorías autorizadas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {e.categorias.length === 0 && (
                          <span className="text-[9px] text-slate-300 font-bold italic">Sin restricciones (todas)</span>
                        )}
                        {e.categorias.map(cat => (
                          <span key={cat} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase rounded-lg border border-emerald-200">{cat}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setModalEsp(e)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                        <Icons.Edit className="w-3 h-3" /> Editar
                      </button>
                      <button onClick={() => setConfirmDeleteEsp(e)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 border-2 border-rose-100 text-rose-400 rounded-xl text-[9px] font-black uppercase hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all">
                        <Icons.Trash className="w-3 h-3" /> Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL EDITOR ── */}
      {showEditor && (() => {
        const miEsp = especialistas.find(e => e.user_id === user.id);
        const allowedCategorias = miEsp?.categorias?.length ? miEsp.categorias : undefined;
        return (
          <CapacitacionEditor
            capacitacion={selectedCap}
            usuario_control={user.name}
            allowedCategorias={allowedCategorias}
            onClose={() => setShowEditor(false)}
            onSaved={() => { setShowEditor(false); loadCaps(); }}
          />
        );
      })()}

      {/* ── MODAL ASIGNAR ── */}
      {showAsignar && asignarCap && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 bg-slate-900 text-white flex-shrink-0">
              <h2 className="text-xl font-black uppercase tracking-tighter">Asignación Inteligente</h2>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">{asignarCap.titulo}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {/* Modo */}
              <div className="flex gap-2">
                {[{ key: 'individual', label: 'Por Persona', icon: Icons.UserPlus }, { key: 'cargo', label: 'Por Cargo', icon: Icons.Layers }].map(m => (
                  <button key={m.key} onClick={() => setAsigMode(m.key as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase border-2 transition-all ${asigMode === m.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                    <m.icon className="w-4 h-4" /> {m.label}
                  </button>
                ))}
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha Inicio *</label>
                  <input type="date" value={asigFechas.desde} onChange={e => setAsigFechas(f => ({ ...f, desde: e.target.value }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-slate-900" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha Límite *</label>
                  <input type="date" value={asigFechas.hasta} onChange={e => setAsigFechas(f => ({ ...f, hasta: e.target.value }))}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-slate-900" />
                </div>
              </div>

              {/* Selección cargo */}
              {asigMode === 'cargo' && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Cargo</label>
                  <select value={selectedCargoId} onChange={e => setSelectedCargoId(Number(e.target.value) || '')}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-900 outline-none focus:border-slate-900 uppercase">
                    <option value="">Seleccionar cargo...</option>
                    {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <p className="text-[9px] text-slate-400 font-medium px-1">
                    Se asignará a todos los colaboradores activos con ese cargo
                  </p>
                </div>
              )}

              {/* Selección individual */}
              {asigMode === 'individual' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Colaboradores ({selectedCedulas.length} seleccionados)
                    </label>
                    {selectedCedulas.length > 0 && (
                      <button onClick={() => setSelectedCedulas([])} className="text-[9px] text-slate-400 hover:text-rose-500 font-bold uppercase">
                        Limpiar selección
                      </button>
                    )}
                  </div>
                  <input value={asigSearch} onChange={e => setAsigSearch(e.target.value)} placeholder="Buscar por nombre, cédula o cargo..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-900" />
                  <div className="max-h-[220px] overflow-y-auto border-2 border-slate-100 rounded-2xl space-y-1 p-2">
                    {filteredPersonal.map(p => (
                      <div key={p.cedula} onClick={() => setSelectedCedulas(prev => prev.includes(p.cedula) ? prev.filter(c => c !== p.cedula) : [...prev, p.cedula])}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedCedulas.includes(p.cedula) ? 'bg-emerald-50 border-2 border-emerald-300' : 'hover:bg-slate-50 border-2 border-transparent'}`}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${selectedCedulas.includes(p.cedula) ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-200'}`}>
                          {selectedCedulas.includes(p.cedula) && <Icons.Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-900 uppercase truncate">{p.nombre}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">{p.cedula} · {p.cargo_nombre}</p>
                        </div>
                      </div>
                    ))}
                    {filteredPersonal.length === 0 && (
                      <p className="text-center py-6 text-slate-300 text-xs font-black uppercase italic">Sin resultados</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0">
              <button onClick={() => setShowAsignar(false)}
                className="px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all">
                Cancelar
              </button>
              <button onClick={handleAsignar} disabled={asigLoading}
                className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl disabled:opacity-50">
                {asigLoading ? 'Asignando...' : asigMode === 'cargo' ? 'Asignar por Cargo' : `Asignar a ${selectedCedulas.length} Colaborador(es)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ELIMINAR / ARCHIVAR ── */}
      {modalEliminar && (() => {
        const tieneIntentos = Number(modalEliminar.total_con_intentos) > 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

              {/* Header */}
              <div className={`px-7 py-6 ${tieneIntentos ? 'bg-amber-500' : 'bg-rose-600'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${tieneIntentos ? 'bg-amber-400' : 'bg-rose-500'}`}>
                    {tieneIntentos
                      ? <Icons.Archive className="w-5 h-5 text-white" />
                      : <Icons.Trash className="w-5 h-5 text-white" />}
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base uppercase tracking-tight">
                      {tieneIntentos ? 'No se puede eliminar' : 'Eliminar capacitación'}
                    </h2>
                    <p className="text-white/70 text-xs font-medium mt-0.5 uppercase tracking-wide">
                      {modalEliminar.titulo}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-7 py-6 space-y-4">
                {tieneIntentos ? (
                  <>
                    <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border-2 border-amber-100">
                      <Icons.Shield className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-black text-amber-800">Hay presentaciones registradas</p>
                        <p className="text-xs text-amber-600 font-medium mt-1">
                          <strong>{modalEliminar.total_con_intentos}</strong> colaborador(es) ya presentaron esta capacitación.
                          Eliminarla borraría su historial de intentos y certificados.
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 font-medium">
                      Solo puedes <strong className="text-slate-900">archivarla</strong> — quedará inactiva y no aceptará nuevos intentos, pero el historial y certificados se conservan.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3 p-4 bg-rose-50 rounded-2xl border-2 border-rose-100">
                      <Icons.X className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-rose-700 font-medium">
                        Esta acción <strong>no se puede deshacer</strong>. Se eliminarán permanentemente la capacitación, todas sus preguntas, recursos y asignaciones.
                      </p>
                    </div>
                    {Number(modalEliminar.total_asignados) > 0 && (
                      <p className="text-xs text-slate-500 font-medium">
                        ⚠️ Tiene <strong>{modalEliminar.total_asignados}</strong> asignación(es) que también se eliminarán (ninguna ha sido presentada aún).
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-7 pb-7 flex gap-3">
                <button onClick={() => setModalEliminar(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
                  Cancelar
                </button>
                {tieneIntentos ? (
                  <button onClick={confirmarArchivar}
                    className="flex-1 py-3 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-amber-600 transition-all flex items-center justify-center gap-2">
                    <Icons.Archive className="w-4 h-4" /> Archivar
                  </button>
                ) : (
                  <button onClick={confirmarEliminar}
                    className="flex-1 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-rose-700 transition-all flex items-center justify-center gap-2">
                    <Icons.Trash className="w-4 h-4" /> Eliminar definitivamente
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {/* ── MODAL CREAR/EDITAR ESPECIALISTA ── */}
      {modalEsp !== null && (() => {
        const idsYaRegistrados = new Set(especialistas.filter(e => e.id !== modalEsp.id).map(e => e.user_id));
        const filteredUsers = appUsers.filter(u => {
          if (!espUserSearch) return false;
          if (idsYaRegistrados.has(u.id)) return false;
          const q = espUserSearch.toLowerCase();
          return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.documentNumber?.includes(q);
        });
        const selectedUser = modalEsp.user_id ? appUsers.find(u => u.id === modalEsp.user_id) : null;
        return (
          <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh]">
              {/* Header */}
              <div className="p-7 bg-emerald-600 text-white flex-shrink-0">
                <h2 className="text-xl font-black uppercase tracking-tighter">
                  {modalEsp.id ? 'Editar Especialista' : 'Nuevo Especialista'}
                </h2>
                <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-0.5">
                  Sistema LMS OrbitM7 IQ
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-7 space-y-5">
                {/* Seleccionar usuario */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                    Usuario del sistema *
                  </label>

                  {/* Usuario ya seleccionado */}
                  {selectedUser ? (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icons.Users className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 uppercase truncate">{selectedUser.name}</p>
                        <p className="text-[9px] text-slate-500 font-bold">{selectedUser.email}{selectedUser.documentNumber ? ` · ${selectedUser.documentNumber}` : ''}</p>
                      </div>
                      {!modalEsp.id && (
                        <button onClick={() => { setModalEsp(m => ({ ...m, user_id: undefined })); setEspUserSearch(''); }}
                          className="w-7 h-7 bg-slate-200 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all flex-shrink-0">
                          <Icons.X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <input value={espUserSearch} onChange={e => setEspUserSearch(e.target.value)}
                        placeholder="Buscar por nombre, email o documento..."
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500" />
                      {espUserSearch.length >= 2 && (
                        <div className="border-2 border-slate-100 rounded-2xl max-h-48 overflow-y-auto">
                          {filteredUsers.length === 0 ? (
                            <p className="text-center py-4 text-slate-300 text-xs font-black uppercase italic">Sin resultados</p>
                          ) : filteredUsers.slice(0, 8).map(u => (
                            <div key={u.id} onClick={() => { setModalEsp(m => ({ ...m, user_id: u.id })); setEspUserSearch(''); }}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 cursor-pointer transition-all border-b border-slate-50 last:border-0">
                              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <Icons.Users className="w-4 h-4 text-slate-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-slate-900 uppercase truncate">{u.name}</p>
                                <p className="text-[9px] text-slate-400 font-bold truncate">{u.email}{u.documentNumber ? ` · ${u.documentNumber}` : ''}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Categorías */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                    Categorías autorizadas <span className="text-slate-300 font-medium normal-case">(ninguna = todas)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_CAP.map(cat => {
                      const sel = (modalEsp.categorias || []).includes(cat);
                      return (
                        <button key={cat} type="button" onClick={() => setModalEsp(m => ({
                          ...m,
                          categorias: sel
                            ? (m.categorias || []).filter(c => c !== cat)
                            : [...(m.categorias || []), cat]
                        }))}
                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase border-2 transition-all ${sel ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-400'}`}>
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Activo */}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setModalEsp(m => ({ ...m, activo: !m.activo }))}
                    className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0 ${modalEsp.activo !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${modalEsp.activo !== false ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="text-[10px] font-black text-slate-700 uppercase">
                    {modalEsp.activo !== false ? 'Especialista activo' : 'Especialista inactivo'}
                  </span>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0">
                <button onClick={() => { setModalEsp(null); setEspUserSearch(''); }}
                  className="px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveEsp} disabled={savingEsp}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all shadow-xl disabled:opacity-50">
                  {savingEsp ? 'Guardando...' : modalEsp.id ? 'Guardar Cambios' : 'Crear Especialista'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL CONFIRMAR ELIMINAR ESPECIALISTA ── */}
      {confirmDeleteEsp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-7 py-6 bg-rose-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-500 rounded-2xl flex items-center justify-center">
                  <Icons.Trash className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-black text-base uppercase">Eliminar Especialista</h3>
                  <p className="text-rose-200 text-[10px] font-bold uppercase mt-0.5">Esta acción no se puede deshacer</p>
                </div>
              </div>
            </div>
            <div className="p-7 space-y-3">
              <p className="text-slate-700 font-bold text-sm">
                ¿Eliminar a <strong>{confirmDeleteEsp.user_name || confirmDeleteEsp.user_id}</strong> como especialista?
              </p>
              <p className="text-slate-400 text-xs">
                El usuario dejará de tener acceso a gestionar capacitaciones de las categorías asignadas.
              </p>
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button onClick={() => setConfirmDeleteEsp(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={handleDeleteEsp}
                className="flex-1 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-rose-700 transition-all">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Vista Previa (especialista) ────────────────────────────── */}
      {previewCap && (
        <CapPreviewModal
          capacitacionId={previewCap.id}
          titulo={previewCap.titulo}
          onClose={() => setPreviewCap(null)}
        />
      )}

      {/* ── Modal Iniciar Capacitación (usuario visor desde la app) ──────── */}
      {iniciarCap && (
        <div className="fixed inset-0 z-[300] overflow-y-auto">
          <PublicCapacitacion
            embeddedCapId={iniciarCap.id}
            embeddedCedula={user.documentNumber || ''}
            onEmbeddedClose={() => setIniciarCap(null)}
          />
        </div>
      )}
    </div>
  );
};

export default CapacitacionesAdmin;
