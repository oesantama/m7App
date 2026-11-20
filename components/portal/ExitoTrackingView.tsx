import React, { useEffect, useState } from 'react';
import {
  Check, Truck, Warehouse, Store, FileText, PackageCheck, RotateCcw, AlertTriangle,
  XCircle, Camera, MapPin, Package, Clock, Download, X, ChevronLeft, ChevronRight, CircleDot,
} from 'lucide-react';

type Foto = { url: string; label: string; fecha?: string };
type Etapa = { key: string; label: string; estado: 'done' | 'current' | 'warning' | 'error' | 'pending'; fecha?: string | null; detalle?: string | null };
type Evento = { tipo: string; titulo: string; detalle: string; fecha: string; fotos: Foto[] };

const fFecha = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fHora = (d?: string | null) =>
  d ? new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
const fFechaHora = (d?: string | null) => (d ? `${fFecha(d)} · ${fHora(d)}` : '');

/** Color y texto del estado general de la guía */
const ESTADO_UI: Record<string, { chip: string; banner?: string }> = {
  ESPERA_RECOGIDA: { chip: 'bg-amber-100 text-amber-800 ring-amber-200' },
  DISPONIBLE: { chip: 'bg-amber-100 text-amber-800 ring-amber-200' },
  RECOGIDA_TIENDA: { chip: 'bg-violet-100 text-violet-800 ring-violet-200' },
  EN_ALMACEN: { chip: 'bg-violet-100 text-violet-800 ring-violet-200' },
  EN_RUTA: { chip: 'bg-blue-100 text-blue-800 ring-blue-200' },
  ENTREGADO: { chip: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  DEVOLUCION: { chip: 'bg-rose-100 text-rose-800 ring-rose-200' },
  ANULADO: { chip: 'bg-slate-200 text-slate-700 ring-slate-300' },
};

const ICONO_ETAPA: Record<string, React.ElementType> = {
  registrado: FileText,
  recogido: Store,
  bodega: Warehouse,
  ruta: Truck,
  intentos: AlertTriangle,
  devolucion: RotateCcw,
  anulada: XCircle,
  entregado: PackageCheck,
};

const ESTILO_ETAPA: Record<Etapa['estado'], { circulo: string; texto: string; linea: string }> = {
  done: { circulo: 'bg-emerald-500 text-white ring-emerald-100', texto: 'text-slate-800', linea: 'bg-emerald-400' },
  current: { circulo: 'bg-blue-600 text-white ring-blue-100 animate-pulse', texto: 'text-blue-700', linea: 'bg-slate-200' },
  warning: { circulo: 'bg-amber-500 text-white ring-amber-100', texto: 'text-amber-700', linea: 'bg-amber-300' },
  error: { circulo: 'bg-rose-500 text-white ring-rose-100', texto: 'text-rose-700', linea: 'bg-rose-300' },
  pending: { circulo: 'bg-white text-slate-300 ring-slate-100 border-2 border-slate-200', texto: 'text-slate-400', linea: 'bg-slate-200' },
};

const ESTILO_EVENTO: Record<string, { icono: React.ElementType; color: string }> = {
  registro: { icono: FileText, color: 'bg-slate-100 text-slate-600 ring-slate-200' },
  recogida: { icono: Store, color: 'bg-violet-100 text-violet-700 ring-violet-200' },
  bodega: { icono: Warehouse, color: 'bg-indigo-100 text-indigo-700 ring-indigo-200' },
  ruta: { icono: Truck, color: 'bg-blue-100 text-blue-700 ring-blue-200' },
  intento: { icono: AlertTriangle, color: 'bg-amber-100 text-amber-700 ring-amber-200' },
  novedad: { icono: AlertTriangle, color: 'bg-amber-100 text-amber-700 ring-amber-200' },
  devolucion: { icono: RotateCcw, color: 'bg-rose-100 text-rose-700 ring-rose-200' },
  anulada: { icono: XCircle, color: 'bg-slate-200 text-slate-700 ring-slate-300' },
  entrega: { icono: PackageCheck, color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  otro: { icono: CircleDot, color: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

const Dato: React.FC<{ icono: React.ElementType; titulo: string; children: React.ReactNode }> = ({ icono: Icono, titulo, children }) => (
  <div className="flex gap-3 min-w-0">
    <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0">
      <Icono size={17} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{titulo}</p>
      <div className="text-sm text-slate-800 break-words">{children}</div>
    </div>
  </div>
);

const ExitoTrackingView: React.FC<{ order: any }> = ({ order }) => {
  const etapas: Etapa[] = order.etapas || [];
  const eventos: Evento[] = order.eventos || [];
  const evidencias: Foto[] = order.evidencias || [];
  const ui = ESTADO_UI[order.status] || { chip: 'bg-slate-100 text-slate-700 ring-slate-200' };
  const [fotoAbierta, setFotoAbierta] = useState<number | null>(null);

  useEffect(() => {
    if (fotoAbierta === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFotoAbierta(null);
      if (e.key === 'ArrowRight') setFotoAbierta(i => (i === null ? i : (i + 1) % evidencias.length));
      if (e.key === 'ArrowLeft') setFotoAbierta(i => (i === null ? i : (i - 1 + evidencias.length) % evidencias.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fotoAbierta, evidencias.length]);

  const abrirFoto = (url: string) => {
    const idx = evidencias.findIndex(f => f.url === url);
    setFotoAbierta(idx >= 0 ? idx : null);
  };

  const devolucion = order.status === 'DEVOLUCION';
  const entregado = order.status === 'ENTREGADO';
  const intentos = Number(order.intentos) || 0;
  const maxIntentos = Number(order.max_intentos) || 3;

  return (
    <div className="bg-white text-slate-900 rounded-3xl shadow-2xl ring-1 ring-slate-100 overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
      {/* Encabezado */}
      <div className="p-6 md:p-8 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Guía Éxito Mensajería</p>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 break-all">{order.external_doc_id}</h2>
            {order.numero_pedido && (
              <p className="text-sm text-slate-500 mt-1">
                Pedido <span className="font-mono font-semibold text-slate-700">{order.numero_pedido}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ring-1 ${ui.chip}`}>
              {order.status_label || order.status}
            </span>
            {order.label_url && (
              <a
                href={order.label_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Download size={14} /> Descargar rótulo (PDF)
              </a>
            )}
          </div>
        </div>

        {/* Aviso según el estado */}
        {devolucion && (
          <div className="mt-5 flex gap-3 p-4 rounded-2xl bg-rose-50 ring-1 ring-rose-200 text-rose-800">
            <RotateCcw size={20} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              <strong>La guía está en devolución.</strong> Se realizaron {intentos} de {maxIntentos} intentos de entrega sin éxito.
              Abajo puede ver el motivo y la foto de cada intento.
            </p>
          </div>
        )}
        {!devolucion && !entregado && intentos > 0 && (
          <div className="mt-5 flex gap-3 p-4 rounded-2xl bg-amber-50 ring-1 ring-amber-200 text-amber-800">
            <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm">
              <strong>{intentos} {intentos === 1 ? 'intento fallido' : 'intentos fallidos'}</strong> de {maxIntentos} permitidos.
              Se programará un nuevo intento de entrega.
            </p>
          </div>
        )}
      </div>

      {/* Línea de progreso */}
      <div className="px-4 md:px-8 py-8 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
        {/* Escritorio: horizontal */}
        <ol className="hidden md:flex items-start">
          {etapas.map((et, i) => {
            const est = ESTILO_ETAPA[et.estado];
            const Icono = et.estado === 'done' && !['devolucion', 'intentos', 'anulada'].includes(et.key) ? Check : (ICONO_ETAPA[et.key] || CircleDot);
            const sig = etapas[i + 1];
            return (
              <li key={et.key} className="flex-1 relative flex flex-col items-center text-center px-1">
                {sig && (
                  <div className={`absolute top-5 left-1/2 w-full h-1 rounded-full ${sig.estado === 'pending' ? 'bg-slate-200' : ESTILO_ETAPA[sig.estado].linea}`} />
                )}
                <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ring-4 ${est.circulo}`}>
                  <Icono size={18} strokeWidth={2.5} />
                </div>
                <p className={`mt-3 text-xs font-bold uppercase tracking-wide ${est.texto}`}>{et.label}</p>
                {et.detalle && <p className={`text-xs font-semibold ${est.texto}`}>{et.detalle}</p>}
                {et.fecha && et.estado !== 'pending' && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{fFecha(et.fecha)}<br />{fHora(et.fecha)}</p>
                )}
              </li>
            );
          })}
        </ol>

        {/* Móvil: vertical */}
        <ol className="md:hidden space-y-0">
          {etapas.map((et, i) => {
            const est = ESTILO_ETAPA[et.estado];
            const Icono = et.estado === 'done' && !['devolucion', 'intentos', 'anulada'].includes(et.key) ? Check : (ICONO_ETAPA[et.key] || CircleDot);
            const sig = etapas[i + 1];
            return (
              <li key={et.key} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ring-4 ${est.circulo}`}>
                    <Icono size={16} strokeWidth={2.5} />
                  </div>
                  {sig && <div className={`w-1 flex-1 min-h-[18px] my-1 rounded-full ${sig.estado === 'pending' ? 'bg-slate-200' : ESTILO_ETAPA[sig.estado].linea}`} />}
                </div>
                <div className="pb-4 pt-1.5">
                  <p className={`text-sm font-bold ${est.texto}`}>
                    {et.label}{et.detalle ? <span className="font-semibold"> · {et.detalle}</span> : null}
                  </p>
                  {et.fecha && et.estado !== 'pending' && <p className="text-xs text-slate-400">{fFechaHora(et.fecha)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Datos del envío */}
      <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 bg-slate-50/60 border-b border-slate-100">
        <Dato icono={Store} titulo="Origen">
          <p className="font-semibold">{order.origen?.tienda || 'Tienda Éxito'}</p>
          {order.origen?.ciudad && <p className="text-slate-500">{order.origen.ciudad}</p>}
        </Dato>
        <Dato icono={MapPin} titulo="Destino">
          <p className="font-semibold">{order.destination?.recipient || '—'}</p>
          <p className="text-slate-500">
            {[order.destination?.address, order.destination?.barrio, order.destination?.city].filter(Boolean).join(' · ')}
          </p>
        </Dato>
        <Dato icono={Package} titulo="Paquete">
          <p className="font-semibold">
            {order.paquete?.cajas || 1} {Number(order.paquete?.cajas) === 1 ? 'caja' : 'cajas'}
            {order.paquete?.peso_kg ? ` · ${order.paquete.peso_kg} kg` : ''}
          </p>
          {order.paquete?.contenido && <p className="text-slate-500">{order.paquete.contenido}</p>}
        </Dato>
        <Dato icono={Clock} titulo="Registro">
          <p className="font-semibold">{fFecha(order.created_at)}</p>
          <p className="text-slate-500">{fHora(order.created_at)}{order.servicio ? ` · ${order.servicio}` : ''}</p>
        </Dato>
        <Dato icono={PackageCheck} titulo="Entrega">
          {order.delivery_date ? (
            <>
              <p className="font-semibold text-emerald-700">{fFecha(order.delivery_date)}</p>
              <p className="text-slate-500">{fHora(order.delivery_date)}</p>
            </>
          ) : (
            <p className="font-semibold text-slate-500">{devolucion ? 'No entregado (devolución)' : 'En proceso'}</p>
          )}
        </Dato>
        <Dato icono={Truck} titulo="Intentos de entrega">
          <div className="flex items-center gap-1.5 mt-1">
            {Array.from({ length: maxIntentos }).map((_, i) => (
              <span
                key={i}
                className={`h-2 w-8 rounded-full ${i < intentos ? (devolucion ? 'bg-rose-400' : 'bg-amber-400') : 'bg-slate-200'}`}
              />
            ))}
            <span className="ml-1 font-semibold">{intentos} / {maxIntentos}</span>
          </div>
          {order.vehicle_plate && <p className="text-slate-500 mt-1">En ruta · placa <span className="font-mono font-semibold">{order.vehicle_plate}</span></p>}
        </Dato>
      </div>

      {/* Evidencias */}
      {evidencias.length > 0 && (
        <div className="p-6 md:p-8 border-b border-slate-100">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
            <Camera size={16} /> Evidencias fotográficas <span className="text-slate-400 font-semibold">({evidencias.length})</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {evidencias.map((f, i) => (
              <button
                key={f.url}
                type="button"
                onClick={() => setFotoAbierta(i)}
                className="group text-left rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 hover:ring-2 hover:ring-emerald-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <div className="aspect-[4/3] overflow-hidden bg-slate-200">
                  <img src={f.url} alt={f.label} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="px-3 py-2 bg-white">
                  <p className="text-xs font-semibold text-slate-700 truncate">{f.label}</p>
                  {f.fecha && <p className="text-[11px] text-slate-400">{fFechaHora(f.fecha)}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Historial (más reciente arriba) */}
      <div className="p-6 md:p-8 border-b border-slate-100">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-5">
          Historial de la guía <span className="text-slate-400 font-semibold normal-case tracking-normal">· más reciente primero</span>
        </h3>
        {eventos.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay movimientos registrados.</p>
        ) : (
          <ol className="relative">
            {eventos.map((ev, i) => {
              const st = ESTILO_EVENTO[ev.tipo] || ESTILO_EVENTO.otro;
              const Icono = st.icono;
              const ultimo = i === eventos.length - 1;
              return (
                <li key={`${ev.fecha}-${i}`} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-1 flex-shrink-0 ${st.color} ${i === 0 ? 'ring-4' : ''}`}>
                      <Icono size={18} />
                    </div>
                    {!ultimo && <div className="w-px flex-1 bg-slate-200 my-1" />}
                  </div>
                  <div className={`flex-1 min-w-0 ${ultimo ? '' : 'pb-6'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-3 pt-2">
                      <p className={`font-bold text-slate-900 ${i === 0 ? 'text-base' : 'text-sm'}`}>{ev.titulo}</p>
                      <p className="text-xs text-slate-400 whitespace-nowrap">{fFechaHora(ev.fecha)}</p>
                    </div>
                    {ev.detalle && <p className="text-sm text-slate-600 mt-1">{ev.detalle}</p>}
                    {ev.fotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {ev.fotos.map(f => (
                          <button
                            key={f.url + f.label}
                            type="button"
                            onClick={() => abrirFoto(f.url)}
                            className="group relative w-24 h-20 rounded-xl overflow-hidden ring-1 ring-slate-200 hover:ring-2 hover:ring-emerald-400 transition-all"
                            title={f.label}
                          >
                            <img src={f.url} alt={f.label} loading="lazy" className="w-full h-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Paquetes */}
      {order.items?.length > 0 && (
        <div className="p-6 md:p-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Paquetes</h3>
          <div className="rounded-2xl ring-1 ring-slate-200 divide-y divide-slate-100">
            {order.items.map((it: any, i: number) => (
              <div key={i} className="flex justify-between items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 truncate">{it.desc || it.sku}</p>
                  {it.sku && it.desc && <p className="text-xs font-mono text-slate-400 truncate">{it.sku}</p>}
                </div>
                <span className="font-mono font-bold text-slate-900">x{it.qty || 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visor de fotos */}
      {fotoAbierta !== null && evidencias[fotoAbierta] && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setFotoAbierta(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            onClick={() => setFotoAbierta(null)}
            aria-label="Cerrar"
          >
            <X size={22} />
          </button>
          {evidencias.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 md:left-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                onClick={e => { e.stopPropagation(); setFotoAbierta((fotoAbierta - 1 + evidencias.length) % evidencias.length); }}
                aria-label="Anterior"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                className="absolute right-2 md:right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                onClick={e => { e.stopPropagation(); setFotoAbierta((fotoAbierta + 1) % evidencias.length); }}
                aria-label="Siguiente"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
          <figure className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={evidencias[fotoAbierta].url}
              alt={evidencias[fotoAbierta].label}
              className="w-full max-h-[78vh] object-contain rounded-2xl"
            />
            <figcaption className="mt-3 text-center text-white">
              <p className="font-semibold">{evidencias[fotoAbierta].label}</p>
              <p className="text-xs text-white/60">
                {fFechaHora(evidencias[fotoAbierta].fecha)} · {fotoAbierta + 1} de {evidencias.length}
              </p>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
};

export default ExitoTrackingView;
