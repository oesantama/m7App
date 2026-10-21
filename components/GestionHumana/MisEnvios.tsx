import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, CloudOff, Loader2, MapPin, Navigation, Package, Phone,
  RefreshCw, Truck, Wifi, WifiOff, X,
} from 'lucide-react';
import { api } from '../../services/api';
import { AccionMensajero, AccionRechazadaError, enviarAccionMensajero } from '../../services/api/ghOperaciones.api';
import { PhotoCapture, SignaturePad, SignaturePadHandle } from './shared/Evidencias';
import { AccionPendiente, colaOffline, nuevoUuid, sincronizarCola } from './shared/offlineQueue';
import { EstadoEnvioBadge, EvidenciasGrid, TrackingTimeline } from './Mensajeria';

const CACHE_KEY = 'm7_mis_envios_cache';
const fmtDT = (d?: string | null) => d
  ? new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

const MOTIVOS_INCIDENCIA = [
  'Destinatario ausente',
  'Dirección incorrecta o incompleta',
  'Destinatario rechazó el envío',
  'Lugar cerrado',
  'Zona de difícil acceso / orden público',
  'Otro',
];

const ESTADO_TRAS_ACCION: Record<AccionMensajero, string> = { recoger: 'EN_CAMINO', entregar: 'ENTREGADO', incidencia: 'FALLIDO' };

const leerCache = (): any[] => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
};
const escribirCache = (rows: any[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* sin almacenamiento */ }
};

/** GPS opcional: si el mensajero no da permiso o tarda, se continúa sin ubicación. */
function obtenerUbicacion(): Promise<{ lat: string; lng: string; precision: string } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: String(p.coords.latitude), lng: String(p.coords.longitude), precision: String(Math.round(p.coords.accuracy)) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

const MisEnvios: React.FC<{ user: any }> = () => {
  const [envios, setEnvios] = useState<any[]>(() => leerCache());
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [cola, setCola] = useState<AccionPendiente[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [accion, setAccion] = useState<{ envio: any; tipo: AccionMensajero } | null>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const refrescarCola = useCallback(async () => setCola(await colaOffline.listar()), []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.ghMsjMisEnvios();
      setEnvios(rows);
      escribirCache(rows);
      setErrorCarga(null);
    } catch (e: any) {
      // Sin conexión se trabaja con la última lista descargada
      setErrorCarga(navigator.onLine ? (e.message || 'Error al cargar') : null);
    } finally {
      setLoading(false);
    }
  }, []);

  const sincronizar = useCallback(async (silencioso = false) => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await sincronizarCola();
      if (r.enviadas) toast.success(`${r.enviadas} acción(es) sincronizada(s)`);
      if (r.rechazadas) toast.error(`${r.rechazadas} acción(es) fueron rechazadas. Revísalas.`);
      if ((r.enviadas || r.rechazadas) || !silencioso) await cargar();
    } finally {
      setSyncing(false);
      refrescarCola();
    }
  }, [cargar, refrescarCola]);

  useEffect(() => {
    refrescarCola();
    sincronizar(true).then(() => cargar());
    const on = () => { setOnline(true); sincronizar(true); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Reintento periódico por si el evento "online" no se dispara (redes inestables)
    const iv = setInterval(() => { if (navigator.onLine) sincronizar(true); }, 60_000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv); };
  }, [cargar, sincronizar, refrescarCola]);

  const pendientePorEnvio = (id: number) => cola.find(c => c.envioId === id && !c.error);

  const verDetalle = async (envio: any) => {
    if (!navigator.onLine) { setDetalle({ ...envio, eventos: [], archivos: [], offline: true }); return; }
    try { setDetalle(await api.ghMsjMiEnvio(envio.id)); } catch (e: any) { toast.error(e.message); }
  };

  /** Resultado de una acción: se aplica en pantalla aunque haya quedado en cola offline. */
  const onAccionHecha = (envioId: number, nuevoEstado: string, enCola: boolean) => {
    const rows = envios.map(e => e.id === envioId ? { ...e, estado: nuevoEstado } : e);
    setEnvios(rows);
    escribirCache(rows);
    setAccion(null);
    refrescarCola();
    if (!enCola) cargar();
  };

  const activos = envios.filter(e => ['ASIGNADO', 'EN_CAMINO', 'FALLIDO'].includes(e.estado));
  const cerradosHoy = envios.filter(e => !['ASIGNADO', 'EN_CAMINO', 'FALLIDO'].includes(e.estado));
  const rechazadas = cola.filter(c => c.error);
  const enEspera = cola.filter(c => !c.error);

  return (
    <div className="min-h-full bg-slate-100 pb-24">
      <div className="bg-slate-900 text-white px-4 pt-5 pb-6 rounded-b-[2rem] shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight uppercase">Mis envíos</h2>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">{activos.length} por gestionar · {cerradosHoy.length} cerrados hoy</p>
          </div>
          <button onClick={() => sincronizar(false)} disabled={syncing || !online} aria-label="Actualizar"
            className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center disabled:opacity-40">
            <RefreshCw className={`w-5 h-5 ${syncing || loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider ${online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`} role="status">
          {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          {online ? 'En línea' : 'Sin conexión — puedes seguir trabajando'}
          {enEspera.length > 0 && <span className="ml-auto flex items-center gap-1"><CloudOff className="w-4 h-4" /> {enEspera.length} por sincronizar</span>}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {rechazadas.map(r => (
          <div key={r.uuid} className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <p className="text-xs font-black text-rose-700 uppercase">{r.tracking} · {r.accion} no se pudo registrar</p>
            <p className="text-sm text-rose-700 mt-1">{r.error}</p>
            <button onClick={async () => { await colaOffline.eliminar(r.uuid); refrescarCola(); cargar(); }}
              className="mt-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-[11px] font-black uppercase">Entendido, descartar</button>
          </div>
        ))}

        {errorCarga && <p className="text-sm text-rose-600 font-bold text-center py-2">{errorCarga}</p>}
        {loading && envios.length === 0 && <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>}
        {!loading && activos.length === 0 && (
          <div className="bg-white rounded-3xl p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-black text-slate-800">No tienes envíos pendientes</p>
            <p className="text-sm text-slate-500">Cuando te asignen uno te llegará un WhatsApp.</p>
          </div>
        )}

        {activos.map(e => {
          const pend = pendientePorEnvio(e.id);
          return (
            <article key={e.id} className={`bg-white rounded-3xl shadow-sm overflow-hidden border-l-8 ${e.estado === 'EN_CAMINO' ? 'border-indigo-500' : e.estado === 'FALLIDO' ? 'border-rose-500' : 'border-sky-500'}`}>
              <button className="w-full text-left p-4" onClick={() => verDetalle(e)}>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-mono text-xs font-black text-slate-500">{e.tracking}</span>
                  <div className="flex items-center gap-1.5">
                    {e.prioridad === 'URGENTE' && <span className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[9px] font-black">URGENTE</span>}
                    <EstadoEnvioBadge estado={e.estado} />
                  </div>
                </div>
                <p className="text-lg font-black text-slate-900 mt-2 leading-tight">{e.destinatario_nombre}</p>
                {e.destinatario_empresa && <p className="text-sm text-slate-500">{e.destinatario_empresa}</p>}
                <p className="text-sm text-slate-700 mt-1 flex items-start gap-1"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />{e.destinatario_direccion}, {e.destinatario_ciudad}</p>
                <p className="text-xs text-slate-500 mt-2 flex items-start gap-1"><Package className="w-4 h-4 shrink-0 text-slate-400" />{e.tipo} · {e.contenido}</p>
                <p className="text-[11px] text-slate-400 mt-1">De: {e.remitente_nombre}</p>
                {pend && <p className="text-[11px] font-black text-amber-600 mt-2 flex items-center gap-1"><CloudOff className="w-3.5 h-3.5" /> Guardado en el celular, se enviará al tener señal</p>}
              </button>
              <div className="grid grid-cols-2 gap-px bg-slate-100 border-t border-slate-100">
                {e.destinatario_telefono ? (
                  <a href={`tel:${e.destinatario_telefono}`} className="bg-white py-3.5 flex items-center justify-center gap-2 text-sm font-black text-slate-700 active:bg-slate-50">
                    <Phone className="w-4 h-4" /> Llamar
                  </a>
                ) : <span className="bg-white py-3.5 text-center text-xs text-slate-300 font-bold">Sin teléfono</span>}
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.destinatario_direccion}, ${e.destinatario_ciudad}, Colombia`)}`}
                  target="_blank" rel="noopener noreferrer" className="bg-white py-3.5 flex items-center justify-center gap-2 text-sm font-black text-slate-700 active:bg-slate-50">
                  <Navigation className="w-4 h-4" /> Cómo llegar
                </a>
              </div>
              {!pend && e.estado === 'ASIGNADO' && (
                <button onClick={() => setAccion({ envio: e, tipo: 'recoger' })} className="w-full py-4 bg-sky-600 active:bg-sky-700 text-white font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                  <Truck className="w-5 h-5" /> Recoger envío
                </button>
              )}
              {!pend && e.estado === 'EN_CAMINO' && (
                <div className="grid grid-cols-3">
                  <button onClick={() => setAccion({ envio: e, tipo: 'incidencia' })} className="py-4 bg-rose-50 active:bg-rose-100 text-rose-700 font-black uppercase text-xs flex flex-col items-center justify-center gap-1">
                    <AlertTriangle className="w-5 h-5" /> Incidencia
                  </button>
                  <button onClick={() => setAccion({ envio: e, tipo: 'entregar' })} className="col-span-2 py-4 bg-emerald-500 active:bg-emerald-600 text-slate-900 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Entregar
                  </button>
                </div>
              )}
              {e.estado === 'FALLIDO' && !pend && (
                <p className="px-4 py-3 bg-rose-50 text-rose-700 text-xs font-bold">Entrega fallida. Gestión Humana programará un nuevo intento.</p>
              )}
            </article>
          );
        })}

        {cerradosHoy.length > 0 && (
          <div className="pt-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Cerrados hoy</p>
            {cerradosHoy.map(e => (
              <button key={e.id} onClick={() => verDetalle(e)} className="w-full bg-white/70 rounded-2xl p-3 mb-2 flex justify-between items-center text-left">
                <span><span className="font-mono text-[11px] text-slate-400">{e.tracking}</span><br /><span className="text-sm font-bold text-slate-700">{e.destinatario_nombre}</span></span>
                <EstadoEnvioBadge estado={e.estado} />
              </button>
            ))}
          </div>
        )}
      </div>

      {accion && <AccionScreen envio={accion.envio} tipo={accion.tipo} onClose={() => setAccion(null)} onDone={onAccionHecha} />}

      {detalle && (
        <div className="fixed inset-0 z-[800] bg-slate-100 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-slate-900 text-white p-4 sticky top-0 flex items-center gap-3 z-10">
            <button onClick={() => setDetalle(null)} aria-label="Volver" className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
            <div><p className="font-mono font-black">{detalle.tracking}</p><EstadoEnvioBadge estado={detalle.estado} /></div>
          </div>
          <div className="p-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 text-sm space-y-1">
              <p className="font-black text-slate-900">{detalle.destinatario_nombre}</p>
              <p className="text-slate-600">{detalle.destinatario_direccion}, {detalle.destinatario_ciudad}</p>
              <p className="text-slate-500 text-xs">{detalle.tipo} · {detalle.contenido} · Cant. {detalle.cantidad}</p>
              {detalle.observaciones && <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-2 mt-2">{detalle.observaciones}</p>}
            </div>
            {detalle.offline ? (
              <p className="text-sm text-slate-500 text-center">El historial completo se ve con conexión.</p>
            ) : (
              <>
                <div className="bg-white rounded-2xl p-4"><TrackingTimeline eventos={detalle.eventos} /></div>
                <EvidenciasGrid archivos={detalle.archivos} urlFor={api.ghMsjArchivoUrl} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Pantalla de acción (recoger / entregar / incidencia) ─────────────────────

const AccionScreen: React.FC<{
  envio: any; tipo: AccionMensajero; onClose: () => void;
  onDone: (envioId: number, estado: string, enCola: boolean) => void;
}> = ({ envio, tipo, onClose, onDone }) => {
  const firmaRef = useRef<SignaturePadHandle>(null);
  const [firmaVacia, setFirmaVacia] = useState(true);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [receptor, setReceptor] = useState(envio.destinatario_nombre || '');
  const [receptorDoc, setReceptorDoc] = useState('');
  const [motivoSel, setMotivoSel] = useState('');
  const [motivoTxt, setMotivoTxt] = useState('');
  const [enviando, setEnviando] = useState(false);

  const titulo = tipo === 'recoger' ? 'Recoger envío' : tipo === 'entregar' ? 'Entregar envío' : 'Reportar incidencia';
  const motivo = motivoSel === 'Otro' ? motivoTxt.trim() : [motivoSel, motivoTxt.trim()].filter(Boolean).join(' — ');
  const faltantes = [
    tipo === 'entregar' && !receptor.trim() && 'nombre de quien recibe',
    tipo === 'incidencia' && !motivoSel && 'motivo',
    tipo === 'incidencia' && motivoSel === 'Otro' && !motivoTxt.trim() && 'describir qué pasó',
    !foto && 'foto',
    tipo !== 'incidencia' && firmaVacia && 'firma',
  ].filter(Boolean) as string[];
  const listo = faltantes.length === 0;

  const confirmar = async () => {
    if (!listo || enviando) return;
    setEnviando(true);
    try {
      const firma = tipo === 'incidencia' ? null : await firmaRef.current?.toBlob();
      if (tipo !== 'incidencia' && !firma) { toast.error('La firma está vacía'); return; }
      const gps = await obtenerUbicacion();
      const uuid = nuevoUuid();
      const campos: Record<string, string> = {
        capturado_at: new Date().toISOString(),
        ...(gps || {}),
        ...(tipo === 'entregar' ? { receptor_nombre: receptor.trim(), receptor_documento: receptorDoc.trim() } : {}),
        ...(tipo === 'incidencia' ? { motivo } : {}),
      };
      const pendiente: AccionPendiente = { uuid, envioId: envio.id, tracking: envio.tracking, accion: tipo, campos, firma, foto, creadoEn: Date.now() };

      if (!navigator.onLine) {
        await colaOffline.guardar(pendiente);
        toast.success('Guardado en el celular. Se enviará cuando tengas señal.');
        onDone(envio.id, ESTADO_TRAS_ACCION[tipo], true);
        return;
      }
      try {
        await enviarAccionMensajero(envio.id, tipo, { ...campos, client_uuid: uuid }, firma, foto);
        toast.success(tipo === 'entregar' ? '¡Entrega registrada!' : tipo === 'recoger' ? 'Envío recogido. ¡Buen viaje!' : 'Incidencia reportada');
        onDone(envio.id, ESTADO_TRAS_ACCION[tipo], false);
      } catch (e: any) {
        if (e instanceof AccionRechazadaError) { toast.error(e.message); return; }
        // Falló la red en el último momento: no se pierde nada, queda en cola
        await colaOffline.guardar(pendiente);
        toast.warning('Sin conexión estable. Quedó guardado y se enviará automáticamente.');
        onDone(envio.id, ESTADO_TRAS_ACCION[tipo], true);
      }
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[800] bg-slate-100 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="accion-titulo">
      <div className={`p-4 sticky top-0 z-10 flex items-center gap-3 text-white ${tipo === 'incidencia' ? 'bg-rose-600' : tipo === 'entregar' ? 'bg-emerald-600' : 'bg-sky-600'}`}>
        <button onClick={onClose} aria-label="Cancelar" className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center"><X className="w-5 h-5" /></button>
        <div className="min-w-0">
          <h3 id="accion-titulo" className="font-black uppercase tracking-tight">{titulo}</h3>
          <p className="text-xs text-white/80 truncate font-mono">{envio.tracking} · {envio.destinatario_nombre}</p>
        </div>
      </div>

      <div className="p-4 space-y-5 pb-32">
        {tipo === 'recoger' && (
          <p className="text-sm text-slate-600 bg-white rounded-2xl p-4">
            Verifica el contenido: <b>{envio.contenido}</b> (cant. {envio.cantidad}). Toma la foto del paquete y firma como constancia de que lo recibes.
          </p>
        )}

        {tipo === 'entregar' && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div>
              <label htmlFor="rec-nombre" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nombre de quien recibe *</label>
              <input id="rec-nombre" value={receptor} onChange={e => setReceptor(e.target.value)} autoComplete="off"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-bold" />
            </div>
            <div>
              <label htmlFor="rec-doc" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Documento de quien recibe</label>
              <input id="rec-doc" inputMode="numeric" value={receptorDoc} onChange={e => setReceptorDoc(e.target.value)} autoComplete="off"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-bold" />
            </div>
          </div>
        )}

        {tipo === 'incidencia' && (
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">¿Qué pasó? *</p>
            <div className="grid grid-cols-1 gap-2">
              {MOTIVOS_INCIDENCIA.map(m => (
                <button key={m} type="button" onClick={() => setMotivoSel(m)} aria-pressed={motivoSel === m}
                  className={`text-left px-4 py-3.5 rounded-2xl border-2 text-sm font-bold ${motivoSel === m ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-700'}`}>
                  {m}
                </button>
              ))}
            </div>
            <textarea aria-label="Detalle de la incidencia" rows={2} value={motivoTxt} onChange={e => setMotivoTxt(e.target.value)}
              placeholder={motivoSel === 'Otro' ? 'Describe qué pasó *' : 'Detalle adicional (opcional)'}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none" />
          </div>
        )}

        <div className="bg-white rounded-2xl p-4">
          <PhotoCapture
            label={tipo === 'recoger' ? 'Foto del paquete *' : tipo === 'entregar' ? 'Foto de la entrega *' : 'Foto de evidencia *'}
            value={foto} onChange={setFoto} />
        </div>

        {tipo !== 'incidencia' && (
          <div className="bg-white rounded-2xl p-4">
            <SignaturePad ref={firmaRef} onChange={setFirmaVacia} height={220}
              label={tipo === 'recoger' ? 'Tu firma (mensajero) *' : 'Firma de quien recibe *'}
              hint={tipo === 'entregar' ? 'Entrega el celular al destinatario para que firme con el dedo.' : undefined} />
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 z-10">
        <button onClick={confirmar} disabled={!listo || enviando}
          className={`w-full py-4 rounded-2xl text-base font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 ${tipo === 'incidencia' ? 'bg-rose-600 text-white' : tipo === 'entregar' ? 'bg-emerald-500 text-slate-900' : 'bg-sky-600 text-white'}`}>
          {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : tipo === 'entregar' ? <CheckCircle2 className="w-5 h-5" /> : tipo === 'recoger' ? <Truck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {tipo === 'entregar' ? 'Marcar como entregado' : tipo === 'recoger' ? 'Confirmar recogida' : 'Reportar incidencia'}
        </button>
        {faltantes.length > 0 && (
          <p className="text-center text-[11px] text-slate-400 mt-2">Falta: {faltantes.join(', ')}.</p>
        )}
      </div>
    </div>
  );
};

export default MisEnvios;
