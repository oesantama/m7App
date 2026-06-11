import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../../constants';
import { api, API_URL } from '../../services/api';
import { toast } from 'sonner';

const certUrl = (numero: string) => `${API_URL.replace('/api', '')}/api/cap/public/certificado/${numero}`;

type Step = 'login' | 'intro' | 'examen' | 'resultado';

interface Opcion { id: number; texto: string; imagen_url?: string; }
interface Pregunta {
  id: number;
  tipo: string;
  pregunta: string;
  imagen_url?: string;
  peso: number;
  opciones: Opcion[];
  retroalimentacion_correcta?: string;
  retroalimentacion_incorrecta?: string;
}
interface Recurso { id: number; tipo: string; titulo: string; descripcion?: string; drive_link?: string; drive_path?: string; url_externa?: string; }
interface Asignacion {
  id: number;
  capacitacion_id: number;
  cedula: string;
  titulo: string;
  descripcion?: string;
  objetivo?: string;
  nota_minima_aprobacion: number;
  tiempo_limite_minutos?: number;
  max_intentos_total: number;
  intentos_realizados: number;
  estado: string;
  mejor_calificacion?: number;
  tipo_proceso: string;
}
interface Retroalimentacion {
  pregunta_id: number;
  es_correcta: boolean;
  retroalimentacion_correcta?: string;
  retroalimentacion_incorrecta?: string;
}

// Convierte URLs de YouTube a embed
function toYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=0&rel=0`;
  return null;
}

const streamUrl = (recurso: Recurso) =>
  `${API_URL.replace('/api', '')}/api/cap/public/recursos/${recurso.id}/stream`;

interface PublicCapacitacionProps {
  embeddedCapId?: number;
  embeddedCedula?: string;
  onEmbeddedClose?: () => void;
}

const PublicCapacitacion: React.FC<PublicCapacitacionProps> = ({ embeddedCapId, embeddedCedula, onEmbeddedClose }) => {
  const params = new URLSearchParams(window.location.search);
  const capId = embeddedCapId || Number(params.get('id'));

  const [step, setStep] = useState<Step>(embeddedCedula ? 'login' : 'login');
  const [cedula, setCedula] = useState(embeddedCedula || '');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [asignacion, setAsignacion] = useState<Asignacion | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [certificadoAnterior, setCertificadoAnterior] = useState<any>(null);
  const [visorRecurso, setVisorRecurso] = useState<Recurso | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [resourceLoading, setResourceLoading] = useState(false);

  // Examen state
  const [intentoId, setIntentoId] = useState<number | null>(null);
  const [pregIdx, setPregIdx] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<number, number[]>>({});
  const [showRetro, setShowRetro] = useState(false);
  const [timerSecs, setTimerSecs] = useState<number | null>(null);
  const [tiempoUsado, setTiempoUsado] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Resultado state
  const [resultado, setResultado] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!capId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-white font-bold">Link inválido. Contacta a Recursos Humanos.</p>
      </div>
    );
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  const handleLogin = async () => {
    if (!cedula.trim()) { setLoginError('Ingresa tu número de cédula'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await api.capGetPublicCapacitacion(capId, cedula.trim());
      setAsignacion(data.asignacion);
      setPreguntas(data.preguntas);
      setRecursos(data.recursos);
      setCertificadoAnterior(data.certificado);
      setStep('intro');
    } catch (err: any) {
      const codigo = err.codigo || '';
      const msg = err.message || '';
      if (codigo === 'NO_ASIGNADO') setLoginError('No has sido asignado a esta capacitación. Contacta a Recursos Humanos.');
      else if (codigo === 'FUERA_DE_RANGO_INICIO' || codigo === 'FUERA_DE_RANGO_FIN') setLoginError(msg);
      else if (msg.includes('solo está disponible dentro')) setLoginError('Esta capacitación solo está disponible dentro de la aplicación. Por favor inicia sesión.');
      else if (msg.includes('agotado')) setLoginError('Has agotado los intentos disponibles para esta capacitación.');
      else if (msg.includes('activa') || msg.includes('autorizada')) setLoginError('Tu cédula no está autorizada o no tienes una capacitación activa asignada.');
      else if (msg.includes('no encontrada')) setLoginError('Esta capacitación no existe o no está activa.');
      else setLoginError('Error al verificar acceso. Verifica tu cédula e intenta de nuevo.');
    } finally {
      setLoginLoading(false);
    }
  };

  // ── INICIAR EXAMEN ─────────────────────────────────────────────────────────

  const handleIniciarExamen = async () => {
    if (!asignacion) return;
    try {
      const result = await api.capIniciarIntento({ asignacion_id: asignacion.id, cedula });
      setIntentoId(result.intento_id);
      setPregIdx(0);
      setRespuestas({});
      setShowRetro(false);
      startTimeRef.current = Date.now();

      if (asignacion.tiempo_limite_minutos) {
        const secs = asignacion.tiempo_limite_minutos * 60;
        setTimerSecs(secs);
        timerRef.current = setInterval(() => {
          setTimerSecs(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(timerRef.current!);
              handleSubmitExamen(true);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }

      setStep('examen');
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar examen');
    }
  };

  // ── SUBMIT EXAMEN ──────────────────────────────────────────────────────────

  const handleSubmitExamen = useCallback(async (autoSubmit = false) => {
    if (!intentoId || !asignacion) return;
    if (!autoSubmit) {
      const sinResponder = preguntas.filter(p => !respuestas[p.id] || respuestas[p.id].length === 0);
      if (sinResponder.length > 0 && !confirm(`Tienes ${sinResponder.length} pregunta(s) sin responder. ¿Enviar de todas formas?`)) return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);

    const tiempo = Math.round((Date.now() - startTimeRef.current) / 1000);
    const respArray = Object.entries(respuestas).map(([pregId, opcIds]) => ({
      pregunta_id: Number(pregId),
      opciones_seleccionadas: opcIds,
    }));

    try {
      const result = await api.capSubmitIntento({
        intento_id: intentoId,
        asignacion_id: asignacion.id,
        cedula,
        respuestas: respArray,
        tiempo_empleado_segundos: tiempo,
      });
      setTiempoUsado(tiempo);
      setResultado(result);
      setStep('resultado');
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar respuestas');
    } finally {
      setSubmitting(false);
    }
  }, [intentoId, asignacion, cedula, preguntas, respuestas]);

  // Auto-login cuando se usa en modo embebido (desde la app)
  useEffect(() => {
    if (embeddedCedula && capId) {
      setLoginLoading(true);
      api.capGetPublicCapacitacion(capId, embeddedCedula)
        .then((data: any) => {
          setAsignacion(data.asignacion);
          setPreguntas(data.preguntas);
          setRecursos(data.recursos);
          setCertificadoAnterior(data.certificado);
          setStep('intro');
        })
        .catch((err: any) => {
          const msg = err.message || '';
          if (msg.includes('agotado')) setLoginError('Has agotado los intentos disponibles.');
          else setLoginError('No tienes una capacitación activa asignada.');
          setStep('login');
        })
        .finally(() => setLoginLoading(false));
    }
  }, []);

  // Timer cleanup
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const pregActual = preguntas[pregIdx];
  const opcionesSeleccionadas = respuestas[pregActual?.id] || [];

  const toggleOpcion = (opcionId: number) => {
    if (!pregActual) return;
    const tipo = pregActual.tipo;
    setRespuestas(prev => {
      const cur = prev[pregActual.id] || [];
      if (tipo === 'seleccion_unica' || tipo === 'falso_verdadero' || tipo === 'imagen_opciones') {
        return { ...prev, [pregActual.id]: [opcionId] };
      }
      if (cur.includes(opcionId)) return { ...prev, [pregActual.id]: cur.filter(id => id !== opcionId) };
      return { ...prev, [pregActual.id]: [...cur, opcionId] };
    });
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── RENDER LOGIN ───────────────────────────────────────────────────────────

  if (step === 'login') return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-emerald-500/30">
            <Icons.Award className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">OrbitM7 IQ</h1>
          <p className="text-slate-400 text-sm font-medium mt-2">Plataforma de Capacitación</p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Acceder a Capacitación</h2>
            <p className="text-xs text-slate-400 font-medium mt-1">Ingresa tu número de cédula para continuar</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Número de Cédula</label>
            <input
              type="number"
              value={cedula}
              onChange={e => { setCedula(e.target.value); setLoginError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 font-black text-slate-900 text-lg outline-none focus:border-emerald-500 transition-all"
              placeholder="Ej: 1234567890"
              autoFocus />
          </div>

          {loginError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
              <Icons.X className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 font-medium">{loginError}</p>
            </div>
          )}

          <button onClick={handleLogin} disabled={loginLoading}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3">
            {loginLoading
              ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verificando...</>
              : <><Icons.Play className="w-5 h-5" /> Ingresar</>}
          </button>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6 font-medium">
          ¿Problemas para ingresar? Contacta a Recursos Humanos.
        </p>
      </div>
    </div>
  );

  // ── RENDER INTRO ───────────────────────────────────────────────────────────

  if (step === 'login' && loginLoading && embeddedCedula) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Verificando acceso...</p>
      </div>
    </div>
  );

  if (step === 'intro' && asignacion) return (
    <>
    {/* Header de cierre en modo embebido */}
    {onEmbeddedClose && (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-slate-900/95 backdrop-blur-sm shadow-xl">
        <button onClick={onEmbeddedClose}
          className="w-9 h-9 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-rose-500 transition-all flex-shrink-0">
          <Icons.X className="w-4 h-4" />
        </button>
        <p className="text-white font-black text-sm truncate flex-1">{asignacion.titulo}</p>
        <span className="text-slate-400 text-[10px] font-black uppercase">Desde la App</span>
      </div>
    )}
    <div className={`min-h-screen bg-slate-950 flex flex-col items-center justify-start p-4 py-10 ${onEmbeddedClose ? 'pt-16' : ''}`}>
      <div className="w-full max-w-2xl space-y-5">
        {/* Badge bienvenida */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-2 mb-4">
            <Icons.CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">Acceso verificado</span>
          </div>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="bg-slate-900 p-8">
            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${asignacion.tipo_proceso === 'INDUCCION' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
              {asignacion.tipo_proceso}
            </span>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter mt-3 leading-tight">{asignacion.titulo}</h1>
          </div>

          <div className="p-8 space-y-6">
            {asignacion.objetivo && (
              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Objetivo</p>
                <p className="text-sm text-blue-900 font-medium">{asignacion.objetivo}</p>
              </div>
            )}

            {asignacion.descripcion && (
              <p className="text-sm text-slate-600 font-medium leading-relaxed">{asignacion.descripcion}</p>
            )}

            {/* Reglas del examen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Preguntas', value: preguntas.length, icon: Icons.ClipboardCheck, color: 'bg-slate-50' },
                { label: 'Nota mínima', value: `${asignacion.nota_minima_aprobacion}%`, icon: Icons.Target, color: 'bg-emerald-50' },
                { label: 'Intentos restantes', value: asignacion.max_intentos_total - asignacion.intentos_realizados, icon: Icons.RefreshCw, color: 'bg-amber-50' },
                { label: 'Tiempo límite', value: asignacion.tiempo_limite_minutos ? `${asignacion.tiempo_limite_minutos} min` : 'Sin límite', icon: Icons.Clock, color: 'bg-blue-50' },
              ].map(item => (
                <div key={item.label} className={`${item.color} rounded-2xl p-4 text-center`}>
                  <item.icon className="w-5 h-5 mx-auto text-slate-500 mb-1" />
                  <p className="text-lg font-black text-slate-900">{item.value}</p>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Recursos de estudio */}
            {recursos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <Icons.Book className="w-4 h-4 text-slate-400" /> Material de Estudio
                </h3>
                {recursos.map(r => (
                  <button key={r.id} onClick={() => { setVisorRecurso(r); setIframeError(false); setResourceLoading(true); }}
                    className="w-full flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 hover:border-emerald-400 hover:bg-emerald-50 transition-all group text-left">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${r.tipo === 'PDF' ? 'bg-rose-100 text-rose-600' : r.tipo === 'VIDEO' ? 'bg-blue-100 text-blue-600' : r.tipo === 'IMAGEN' ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                      {r.tipo === 'PDF' ? <Icons.FileText className="w-5 h-5" />
                        : r.tipo === 'VIDEO' ? <Icons.Play className="w-5 h-5" />
                        : r.tipo === 'IMAGEN' ? <Icons.Image className="w-5 h-5" />
                        : <Icons.Link className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{r.titulo}</p>
                      {r.descripcion && <p className="text-[10px] text-slate-400 font-medium">{r.descripcion}</p>}
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Toca para ver</p>
                    </div>
                    <Icons.Eye className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Botón iniciar */}
        {asignacion.estado === 'COMPLETADO' ? (
          /* Ya aprobó — mostrar las dos opciones claramente */
          <div className="space-y-3">
            {/* Banner de logro */}
            <div className="bg-emerald-500 rounded-[2rem] p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Icons.Award className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-sm uppercase tracking-wide">¡Ya aprobaste esta capacitación!</p>
                {asignacion.mejor_calificacion !== undefined && (
                  <p className="text-emerald-100 text-xs font-medium mt-0.5">
                    Mejor calificación: <strong>{asignacion.mejor_calificacion}%</strong>
                    {certificadoAnterior && ` · Cert. ${certificadoAnterior.numero_certificado}`}
                  </p>
                )}
              </div>
            </div>

            {/* Opción 1 — Descargar certificado */}
            {certificadoAnterior && (
              <a href={certUrl(certificadoAnterior.numero_certificado)}
                target="_blank" rel="noreferrer"
                className="w-full py-4 bg-white border-2 border-emerald-500 text-emerald-700 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center justify-center gap-3">
                <Icons.Download className="w-5 h-5" /> Descargar mi certificado
              </a>
            )}

            {/* Opción 2 — Nuevo intento para mejorar nota */}
            {asignacion.intentos_realizados < asignacion.max_intentos_total ? (
              <button onClick={handleIniciarExamen}
                className="w-full py-4 bg-slate-800 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-3">
                <Icons.RefreshCw className="w-5 h-5" /> Intentar de nuevo para mejorar nota
              </button>
            ) : (
              <div className="text-center py-2 text-slate-400 text-xs font-bold uppercase">
                No quedan intentos disponibles para mejorar la nota.
              </div>
            )}
          </div>
        ) : asignacion.intentos_realizados < asignacion.max_intentos_total ? (
          <button onClick={handleIniciarExamen}
            className="w-full py-5 bg-emerald-500 text-white rounded-[2rem] font-black text-base uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all shadow-2xl shadow-emerald-500/30 flex items-center justify-center gap-3">
            <Icons.Zap className="w-6 h-6" /> Iniciar Examen
          </button>
        ) : (
          <div className="text-center py-4 text-slate-400 font-black uppercase text-sm">
            Has agotado todos los intentos disponibles. Contacta a Recursos Humanos.
          </div>
        )}
      </div>
    </div>

    {/* ── Modal visor de recursos ─────────────────────────────────────────── */}
    {visorRecurso && (() => {
      const urlExterna = visorRecurso.url_externa || '';
      const urlDrive   = visorRecurso.drive_link || '';
      const esDriveFile = visorRecurso.tipo !== 'LINK' && !!visorRecurso.drive_path;
      const esPDF   = visorRecurso.tipo === 'PDF';
      const esVideo = visorRecurso.tipo === 'VIDEO';
      const esImg   = visorRecurso.tipo === 'IMAGEN';
      const esLink  = visorRecurso.tipo === 'LINK';

      // YouTube embed
      const ytEmbed = esLink ? toYouTubeEmbed(urlExterna) : null;

      // URL de apertura externa
      const urlAbrirExterno = urlDrive || urlExterna || '#';

      const iconEl = esPDF ? <Icons.FileText className="w-4 h-4 text-white" />
        : esVideo ? <Icons.Play className="w-4 h-4 text-white" />
        : esImg ? <Icons.Image className="w-4 h-4 text-white" />
        : <Icons.Link className="w-4 h-4 text-white" />;
      const iconBg = esPDF ? 'bg-rose-500' : esVideo ? 'bg-blue-500' : esImg ? 'bg-violet-500' : 'bg-slate-600';

      return (
        <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950/98 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 flex-shrink-0 shadow-xl">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              {iconEl}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-sm truncate">{visorRecurso.titulo}</p>
              {visorRecurso.descripcion && (
                <p className="text-slate-400 text-[10px] font-medium truncate">{visorRecurso.descripcion}</p>
              )}
            </div>
            {/* Botón abrir externo */}
            <a href={urlAbrirExterno} target="_blank" rel="noreferrer"
              className="w-9 h-9 bg-white/10 text-slate-300 rounded-xl flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all flex-shrink-0"
              title="Abrir en nueva pestaña">
              <Icons.ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={() => { setVisorRecurso(null); setIframeError(false); }}
              className="w-9 h-9 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-rose-500 transition-all flex-shrink-0">
              <Icons.X className="w-4 h-4" />
            </button>
          </div>

          {/* Contenido */}
          <div className="flex-1 overflow-hidden flex items-center justify-center bg-slate-950 relative">
            {/* Loading spinner mientras carga */}
            {resourceLoading && !iframeError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4">
                <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-slate-400 text-sm font-medium">Cargando recurso...</p>
              </div>
            )}

            {/* PDF de Drive → proxy stream en iframe */}
            {esDriveFile && esPDF && !iframeError && (
              <iframe
                src={streamUrl(visorRecurso)}
                className="w-full h-full border-0"
                title={visorRecurso.titulo}
                onLoad={() => setResourceLoading(false)}
                onError={() => { setIframeError(true); setResourceLoading(false); }}
              />
            )}

            {/* Video de Drive → proxy stream en <video> */}
            {esDriveFile && esVideo && !iframeError && (
              <video
                src={streamUrl(visorRecurso)}
                controls
                className="w-full h-full max-h-full object-contain"
                onLoadedMetadata={() => setResourceLoading(false)}
                onError={() => { setIframeError(true); setResourceLoading(false); }}
              />
            )}

            {/* Imagen de Drive → proxy stream en <img> */}
            {esDriveFile && esImg && !iframeError && (
              <img
                src={streamUrl(visorRecurso)}
                alt={visorRecurso.titulo}
                className="max-w-full max-h-full object-contain p-4"
                onLoad={() => setResourceLoading(false)}
                onError={() => { setIframeError(true); setResourceLoading(false); }}
              />
            )}

            {/* LINK YouTube → embed iframe */}
            {esLink && ytEmbed && !iframeError && (
              <iframe
                src={ytEmbed}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={visorRecurso.titulo}
                onLoad={() => setResourceLoading(false)}
                onError={() => { setIframeError(true); setResourceLoading(false); }}
              />
            )}

            {/* LINK genérico → iframe con fallback */}
            {esLink && !ytEmbed && !iframeError && (
              <iframe
                src={urlExterna}
                className="w-full h-full border-0"
                title={visorRecurso.titulo}
                onLoad={() => setResourceLoading(false)}
                onError={() => { setIframeError(true); setResourceLoading(false); }}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            )}

            {/* Fallback: error de carga o tipo no manejado */}
            {(iframeError || (!esDriveFile && !esLink)) && (
              <div className="flex flex-col items-center gap-6 text-center px-8 max-w-sm">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${esPDF ? 'bg-rose-500/20' : esVideo ? 'bg-blue-500/20' : esImg ? 'bg-violet-500/20' : 'bg-slate-600/20'}`}>
                  {esPDF ? <Icons.FileText className="w-10 h-10 text-rose-400" />
                    : esVideo ? <Icons.Play className="w-10 h-10 text-blue-400" />
                    : esImg ? <Icons.Image className="w-10 h-10 text-violet-400" />
                    : <Icons.Link className="w-10 h-10 text-slate-400" />}
                </div>
                <div>
                  <p className="text-white font-black text-base">{visorRecurso.titulo}</p>
                  {visorRecurso.descripcion && <p className="text-slate-400 text-sm font-medium mt-1">{visorRecurso.descripcion}</p>}
                  <p className="text-slate-500 text-xs font-medium mt-3">
                    No fue posible mostrar el archivo directamente.
                  </p>
                </div>
                <a href={urlAbrirExterno} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase hover:bg-emerald-600 transition-all shadow-xl w-full justify-center">
                  <Icons.ExternalLink className="w-5 h-5" /> Abrir archivo
                </a>
              </div>
            )}
          </div>
        </div>
      );
    })()}
    </>
  );

  // ── RENDER EXAMEN ──────────────────────────────────────────────────────────

  if (step === 'examen' && pregActual) return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-900 px-5 py-3 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Icons.Award className="w-5 h-5 text-emerald-400" />
          <span className="text-white font-black text-xs uppercase tracking-widest hidden sm:block">
            {asignacion?.titulo}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {timerSecs !== null && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${timerSecs < 60 ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/10 text-white'}`}>
              <Icons.Clock className="w-3.5 h-3.5" />
              {formatTimer(timerSecs)}
            </div>
          )}
          <span className="text-slate-400 text-xs font-black">{pregIdx + 1} / {preguntas.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-800">
        <div className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${((pregIdx + 1) / preguntas.length) * 100}%` }} />
      </div>

      {/* Pregunta */}
      <div className="flex-1 flex items-start justify-center p-4 md:p-8 overflow-y-auto">
        <div className="w-full max-w-2xl space-y-6 pb-10">
          <div className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-2xl space-y-6">
            {/* Tipo badge */}
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm">{pregIdx + 1}</span>
              <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase">
                {pregActual.tipo === 'seleccion_unica' ? 'Selección única'
                  : pregActual.tipo === 'seleccion_multiple' ? 'Selección múltiple'
                    : pregActual.tipo === 'falso_verdadero' ? 'Verdadero / Falso'
                      : 'Con imagen'}
              </span>
              {pregActual.tipo === 'seleccion_multiple' && (
                <span className="text-[9px] text-blue-500 font-black uppercase">Puede haber varias correctas</span>
              )}
            </div>

            {/* Imagen de contexto */}
            {pregActual.imagen_url && (
              <img src={pregActual.imagen_url} alt="pregunta" className="w-full rounded-2xl object-contain max-h-56" />
            )}

            {/* Texto pregunta */}
            <p className="text-base font-black text-slate-900 leading-snug">{pregActual.pregunta}</p>

            {/* Opciones */}
            <div className="space-y-3">
              {pregActual.opciones.map(op => {
                const selected = opcionesSeleccionadas.includes(op.id);
                const isMulti = pregActual.tipo === 'seleccion_multiple';
                return (
                  <button key={op.id} onClick={() => { if (!showRetro) toggleOpcion(op.id); }}
                    disabled={showRetro}
                    className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selected
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'}`}>
                    <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? 'bg-emerald-500 border-emerald-500' : isMulti ? 'bg-slate-100 border-slate-200' : 'rounded-full bg-slate-100 border-slate-200'}`}>
                      {selected && <Icons.Check className="w-4 h-4 text-white" />}
                    </div>
                    {op.imagen_url
                      ? <img src={op.imagen_url} alt={op.texto || ''} className="h-16 rounded-xl object-contain" />
                      : <span className="text-sm font-bold">{op.texto}</span>}
                  </button>
                );
              })}
            </div>

            {/* Retroalimentación inline */}
            {showRetro && (
              <div className={`rounded-2xl p-4 border ${opcionesSeleccionadas.length > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className={`text-sm font-bold ${opcionesSeleccionadas.length > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {opcionesSeleccionadas.length > 0 && pregActual.retroalimentacion_correcta
                    ? pregActual.retroalimentacion_correcta
                    : pregActual.retroalimentacion_incorrecta || ''}
                </p>
              </div>
            )}
          </div>

          {/* Navegación */}
          <div className="flex gap-3">
            {pregIdx > 0 && (
              <button onClick={() => { setPregIdx(i => i - 1); setShowRetro(false); }}
                className="flex items-center gap-2 px-6 py-4 bg-white/10 text-white rounded-2xl text-sm font-black uppercase hover:bg-white/20 transition-all">
                <Icons.ChevronDown className="w-4 h-4 rotate-90" /> Anterior
              </button>
            )}
            <button
              onClick={() => {
                if (pregIdx < preguntas.length - 1) { setPregIdx(i => i + 1); setShowRetro(false); }
                else handleSubmitExamen();
              }}
              disabled={submitting || opcionesSeleccionadas.length === 0}
              className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl text-sm font-black uppercase hover:bg-emerald-600 active:scale-95 transition-all shadow-xl disabled:opacity-40 flex items-center justify-center gap-2">
              {submitting ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
              ) : pregIdx < preguntas.length - 1 ? (
                <>Siguiente <Icons.ChevronDown className="w-4 h-4 -rotate-90" /></>
              ) : (
                <><Icons.CheckCircle className="w-5 h-5" /> Finalizar Examen</>
              )}
            </button>
          </div>

          {/* Mini progreso */}
          <div className="flex gap-1 justify-center flex-wrap">
            {preguntas.map((p, i) => (
              <button key={p.id} onClick={() => { setPregIdx(i); setShowRetro(false); }}
                className={`w-7 h-7 rounded-lg text-[9px] font-black transition-all ${i === pregIdx ? 'bg-emerald-500 text-white' : respuestas[p.id]?.length > 0 ? 'bg-white/30 text-white' : 'bg-white/10 text-slate-500'}`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── RENDER RESULTADO ───────────────────────────────────────────────────────

  if (step === 'resultado' && resultado) {
    const aprobado = resultado.aprobado;
    const intentosRestantes = resultado.max_intentos - resultado.intentos_realizados;

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-5">
          {/* Resultado principal */}
          <div className={`rounded-[3rem] overflow-hidden shadow-2xl ${aprobado ? 'shadow-emerald-500/20' : 'shadow-rose-500/20'}`}>
            <div className={`p-10 text-center ${aprobado ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                {aprobado
                  ? <Icons.Award className="w-10 h-10 text-white" />
                  : <Icons.X className="w-10 h-10 text-white" />}
              </div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                {aprobado ? '¡Aprobado!' : 'No Aprobado'}
              </h2>
              <p className="text-white/80 text-sm font-medium mt-2">
                {aprobado ? 'Excelente desempeño. ¡Sigue así!' : 'No alcanzaste la nota mínima esta vez.'}
              </p>
            </div>

            <div className="bg-white p-8 space-y-5">
              {/* Calificación grande */}
              <div className="text-center">
                <p className={`text-7xl font-black ${aprobado ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {resultado.calificacion}%
                </p>
                <p className="text-slate-400 text-xs font-bold uppercase mt-1">
                  Nota mínima: {resultado.nota_minima}%
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-slate-900">{Math.floor(tiempoUsado / 60)}m {tiempoUsado % 60}s</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Tiempo empleado</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-slate-900">{resultado.intentos_realizados}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase">de {resultado.max_intentos} intentos</p>
                </div>
              </div>

              {/* Retroalimentación por pregunta */}
              {resultado.retroalimentacion?.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultados por pregunta</p>
                  {resultado.retroalimentacion.map((r: Retroalimentacion, i: number) => {
                    const pregunta = preguntas.find(p => p.id === r.pregunta_id);
                    const idsSeleccionados = respuestas[r.pregunta_id] || [];
                    const opcionesSeleccionadas = pregunta?.opciones.filter(op => idsSeleccionados.includes(op.id)) || [];
                    return (
                      <div key={i} className={`rounded-2xl border overflow-hidden ${r.es_correcta ? 'border-emerald-200' : 'border-rose-200'}`}>
                        {/* Encabezado */}
                        <div className={`flex items-center gap-2.5 px-4 py-2.5 ${r.es_correcta ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                          <div className="w-5 h-5 bg-white/25 rounded-lg flex items-center justify-center flex-shrink-0">
                            {r.es_correcta
                              ? <Icons.Check className="w-3 h-3 text-white" />
                              : <Icons.X className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-white text-[10px] font-black uppercase tracking-wide">
                            Pregunta {i + 1} · {r.es_correcta ? 'Correcta' : 'Incorrecta'}
                          </span>
                        </div>

                        <div className={`px-4 py-3 space-y-2.5 ${r.es_correcta ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                          {/* Texto de la pregunta */}
                          {pregunta && (
                            <p className="text-xs font-black text-slate-800 leading-snug">{pregunta.pregunta}</p>
                          )}

                          {/* Respuesta del usuario */}
                          {opcionesSeleccionadas.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tu respuesta</p>
                              {opcionesSeleccionadas.map(op => (
                                <div key={op.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${r.es_correcta ? 'bg-emerald-100 border border-emerald-200' : 'bg-rose-100 border border-rose-200'}`}>
                                  <div className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 ${r.es_correcta ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                                    {r.es_correcta
                                      ? <Icons.Check className="w-2.5 h-2.5 text-white" />
                                      : <Icons.X className="w-2.5 h-2.5 text-white" />}
                                  </div>
                                  {op.imagen_url
                                    ? <img src={op.imagen_url} alt={op.texto} className="h-8 rounded-lg object-contain" />
                                    : <span className={`text-[11px] font-bold ${r.es_correcta ? 'text-emerald-800' : 'text-rose-800'}`}>{op.texto}</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic font-medium">Sin respuesta</p>
                          )}

                          {/* Retroalimentación */}
                          {(r.es_correcta ? r.retroalimentacion_correcta : r.retroalimentacion_incorrecta) && (
                            <p className={`text-[10px] font-medium leading-snug italic ${r.es_correcta ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {r.es_correcta ? r.retroalimentacion_correcta : r.retroalimentacion_incorrecta}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Acciones */}
              {aprobado && resultado.certificado ? (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                    <Icons.Award className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                    <p className="text-xs font-black text-emerald-700 uppercase">Certificado generado</p>
                    <p className="text-[10px] text-emerald-600 font-medium">{resultado.certificado.numero_certificado}</p>
                  </div>
                  <a href={certUrl(resultado.certificado.numero_certificado)} target="_blank" rel="noreferrer"
                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl flex items-center justify-center gap-3 block text-center">
                    <Icons.Download className="w-5 h-5" /> Descargar Certificado
                  </a>
                </div>
              ) : !aprobado && intentosRestantes > 0 ? (
                <div className="space-y-3">
                  <p className="text-center text-xs text-slate-500 font-medium">
                    Tienes <strong>{intentosRestantes}</strong> intento(s) restante(s). Estudia el material y vuelve a intentarlo.
                  </p>
                  <button onClick={() => { setStep('intro'); setResultado(null); }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center justify-center gap-3">
                    <Icons.RefreshCw className="w-5 h-5" /> Volver a Intentar
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl p-4 text-center">
                  <p className="text-xs text-slate-500 font-medium">
                    {aprobado ? '¡Felicidades! Capacitación completada.' : 'Has agotado todos los intentos disponibles. Contacta a Recursos Humanos.'}
                  </p>
                </div>
              )}

              {/* Botón regresar */}
              <button
                onClick={() => onEmbeddedClose ? onEmbeddedClose() : setStep('login')}
                className="w-full py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2 mt-2">
                <Icons.ChevronLeft className="w-4 h-4" />
                {onEmbeddedClose ? 'Volver al menú' : 'Volver al inicio'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PublicCapacitacion;
