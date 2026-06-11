import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api, API_URL } from '../../services/api';
import { toast } from 'sonner';

interface Opcion  { id: number; texto: string; imagen_url?: string; es_correcta?: boolean; }
interface Pregunta { id: number; tipo: string; pregunta: string; imagen_url?: string; peso: number; opciones: Opcion[]; }
interface Recurso  { id: number; tipo: string; titulo: string; descripcion?: string; drive_link?: string; drive_path?: string; url_externa?: string; }
interface Capacitacion {
  id: number; titulo: string; descripcion?: string; objetivo?: string;
  nota_minima_aprobacion: number; tiempo_limite_minutos?: number; max_intentos: number; tipo_proceso: string;
}

function toYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=0&rel=0`;
  return null;
}

const streamUrl = (r: Recurso) =>
  `${API_URL.replace('/api', '')}/api/cap/public/recursos/${r.id}/stream`;

interface Props { capacitacionId: number; titulo: string; onClose: () => void; }

const CapPreviewModal: React.FC<Props> = ({ capacitacionId, titulo, onClose }) => {
  const [loading, setLoading]         = useState(true);
  const [cap, setCap]                 = useState<Capacitacion | null>(null);
  const [preguntas, setPreguntas]     = useState<Pregunta[]>([]);
  const [recursos, setRecursos]       = useState<Recurso[]>([]);
  const [tab, setTab]                 = useState<'intro' | 'preguntas'>('intro');
  const [pregIdx, setPregIdx]         = useState(0);
  const [visor, setVisor]             = useState<Recurso | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [resourceLoading, setResourceLoading] = useState(false);

  useEffect(() => {
    api.capGetPreview(capacitacionId)
      .then(d => { setCap(d.capacitacion); setPreguntas(d.preguntas); setRecursos(d.recursos); })
      .catch(() => toast.error('Error al cargar preview'))
      .finally(() => setLoading(false));
  }, [capacitacionId]);

  if (loading) return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const pActual = preguntas[pregIdx];

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 shadow-xl flex-shrink-0">
        <div className="w-8 h-8 bg-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icons.Eye className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-sm truncate">{titulo}</p>
          <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest">Vista previa · Como la ve el usuario</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-800 rounded-2xl p-1">
          <button onClick={() => setTab('intro')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${tab === 'intro' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            Intro
          </button>
          <button onClick={() => setTab('preguntas')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${tab === 'preguntas' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            Preguntas ({preguntas.length})
          </button>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-rose-500 transition-all flex-shrink-0">
          <Icons.X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── TAB INTRO ── */}
        {tab === 'intro' && cap && (
          <div className="max-w-2xl mx-auto p-6 space-y-5">
            {/* Banner */}
            <div className="bg-slate-900 rounded-3xl p-6">
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${cap.tipo_proceso === 'INDUCCION' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'}`}>
                {cap.tipo_proceso}
              </span>
              <h1 className="text-xl font-black text-white uppercase tracking-tighter mt-3">{cap.titulo}</h1>
              {cap.descripcion && <p className="text-slate-400 text-sm font-medium mt-2">{cap.descripcion}</p>}
            </div>

            {cap.objetivo && (
              <div className="bg-blue-950/50 border border-blue-800 rounded-2xl p-4">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Objetivo</p>
                <p className="text-sm text-blue-100 font-medium">{cap.objetivo}</p>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Preguntas', value: preguntas.length, icon: Icons.ClipboardCheck, color: 'text-slate-300' },
                { label: 'Nota mínima', value: `${cap.nota_minima_aprobacion}%`, icon: Icons.Target, color: 'text-emerald-400' },
                { label: 'Intentos', value: cap.max_intentos, icon: Icons.RefreshCw, color: 'text-amber-400' },
                { label: 'Tiempo', value: cap.tiempo_limite_minutos ? `${cap.tiempo_limite_minutos} min` : 'Sin límite', icon: Icons.Clock, color: 'text-blue-400' },
              ].map(item => (
                <div key={item.label} className="bg-slate-800 rounded-2xl p-4 text-center">
                  <item.icon className={`w-5 h-5 mx-auto mb-1 ${item.color}`} />
                  <p className="text-lg font-black text-white">{item.value}</p>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Recursos */}
            {recursos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Icons.Book className="w-4 h-4" /> Material de Estudio ({recursos.length})
                </h3>
                {recursos.map(r => (
                  <button key={r.id} onClick={() => { setVisor(r); setIframeError(false); setResourceLoading(true); }}
                    className="w-full flex items-center gap-4 p-4 bg-slate-800 rounded-2xl border-2 border-slate-700 hover:border-violet-500 hover:bg-slate-700 transition-all group text-left">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${r.tipo === 'PDF' ? 'bg-rose-500/20 text-rose-400' : r.tipo === 'VIDEO' ? 'bg-blue-500/20 text-blue-400' : r.tipo === 'IMAGEN' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-600 text-slate-300'}`}>
                      {r.tipo === 'PDF' ? <Icons.FileText className="w-5 h-5" />
                        : r.tipo === 'VIDEO' ? <Icons.Play className="w-5 h-5" />
                        : r.tipo === 'IMAGEN' ? <Icons.Image className="w-5 h-5" />
                        : <Icons.Link className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors">{r.titulo}</p>
                      {r.descripcion && <p className="text-[10px] text-slate-500 font-medium">{r.descripcion}</p>}
                      <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest mt-0.5">Toca para ver</p>
                    </div>
                    <Icons.Eye className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors" />
                  </button>
                ))}
              </div>
            )}

            {/* CTA fake */}
            <div className="w-full py-5 bg-emerald-500/20 border-2 border-emerald-500/30 text-emerald-300 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 cursor-default">
              <Icons.Zap className="w-5 h-5" /> Iniciar Examen (botón del usuario)
            </div>
          </div>
        )}

        {/* ── TAB PREGUNTAS ── */}
        {tab === 'preguntas' && preguntas.length > 0 && pActual && (
          <div className="max-w-2xl mx-auto p-6 space-y-5">
            {/* Progreso */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-xs font-black uppercase">Pregunta {pregIdx + 1} de {preguntas.length}</span>
              <div className="flex gap-1">
                {preguntas.map((_, i) => (
                  <button key={i} onClick={() => setPregIdx(i)}
                    className={`w-6 h-2 rounded-full transition-all ${i === pregIdx ? 'bg-violet-500' : 'bg-slate-700 hover:bg-slate-500'}`} />
                ))}
              </div>
            </div>

            {/* Pregunta card */}
            <div className="bg-slate-900 rounded-3xl p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-400 font-black text-sm">{pregIdx + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                    {pActual.tipo.replace('_', ' ')} · {pActual.peso}%
                  </p>
                  <p className="text-white font-bold text-sm leading-relaxed">{pActual.pregunta}</p>
                </div>
              </div>

              {pActual.imagen_url && (
                <img src={pActual.imagen_url} alt="pregunta" className="w-full rounded-2xl object-contain max-h-60" />
              )}

              {/* Opciones */}
              <div className="space-y-2">
                {pActual.opciones.map(op => (
                  <div key={op.id}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${op.es_correcta ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 bg-slate-800'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${op.es_correcta ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600'}`}>
                      {op.es_correcta && <Icons.Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm font-medium ${op.es_correcta ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{op.texto}</span>
                    {op.es_correcta && (
                      <span className="ml-auto text-[9px] font-black text-emerald-400 uppercase bg-emerald-500/20 px-2 py-0.5 rounded-lg">Correcta</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Navegación */}
            <div className="flex gap-3">
              <button onClick={() => setPregIdx(Math.max(0, pregIdx - 1))} disabled={pregIdx === 0}
                className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-700 transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                <Icons.ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button onClick={() => setPregIdx(Math.min(preguntas.length - 1, pregIdx + 1))} disabled={pregIdx === preguntas.length - 1}
                className="flex-1 py-3 bg-violet-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-violet-700 transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                Siguiente <Icons.ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {tab === 'preguntas' && preguntas.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-600 gap-3">
            <Icons.ClipboardCheck className="w-10 h-10" />
            <p className="text-sm font-black uppercase">Sin preguntas aún</p>
          </div>
        )}
      </div>

      {/* ── Visor de recurso (overlay) ── */}
      {visor && (() => {
        const urlExterna = visor.url_externa || '';
        const urlDrive   = visor.drive_link || '';
        const esDriveFile = visor.tipo !== 'LINK' && !!visor.drive_path;
        const esPDF   = visor.tipo === 'PDF';
        const esVideo = visor.tipo === 'VIDEO';
        const esImg   = visor.tipo === 'IMAGEN';
        const esLink  = visor.tipo === 'LINK';
        const ytEmbed = esLink ? toYouTubeEmbed(urlExterna) : null;
        const urlExterno = urlDrive || urlExterna || '#';

        return (
          <div className="fixed inset-0 z-[400] flex flex-col bg-slate-950">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 shadow-xl flex-shrink-0">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${esPDF ? 'bg-rose-500' : esVideo ? 'bg-blue-500' : esImg ? 'bg-violet-500' : 'bg-slate-600'}`}>
                {esPDF ? <Icons.FileText className="w-4 h-4 text-white" />
                  : esVideo ? <Icons.Play className="w-4 h-4 text-white" />
                  : esImg ? <Icons.Image className="w-4 h-4 text-white" />
                  : <Icons.Link className="w-4 h-4 text-white" />}
              </div>
              <p className="flex-1 text-white font-black text-sm truncate">{visor.titulo}</p>
              <a href={urlExterno} target="_blank" rel="noreferrer"
                className="w-9 h-9 bg-white/10 text-slate-300 rounded-xl flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all flex-shrink-0"
                title="Abrir en nueva pestaña">
                <Icons.ExternalLink className="w-4 h-4" />
              </a>
              <button onClick={() => { setVisor(null); setIframeError(false); }}
                className="w-9 h-9 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-rose-500 transition-all flex-shrink-0">
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex items-center justify-center bg-slate-950 relative">
              {resourceLoading && !iframeError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4">
                  <div className="w-12 h-12 border-4 border-slate-700 border-t-violet-500 rounded-full animate-spin" />
                  <p className="text-slate-400 text-sm font-medium">Cargando recurso...</p>
                </div>
              )}
              {esDriveFile && esPDF && !iframeError && (
                <iframe src={streamUrl(visor)} className="w-full h-full border-0" title={visor.titulo} onLoad={() => setResourceLoading(false)} onError={() => { setIframeError(true); setResourceLoading(false); }} />
              )}
              {esDriveFile && esVideo && !iframeError && (
                <video src={streamUrl(visor)} controls className="w-full h-full max-h-full object-contain" onLoadedMetadata={() => setResourceLoading(false)} onError={() => { setIframeError(true); setResourceLoading(false); }} />
              )}
              {esDriveFile && esImg && !iframeError && (
                <img src={streamUrl(visor)} alt={visor.titulo} className="max-w-full max-h-full object-contain p-4" onLoad={() => setResourceLoading(false)} onError={() => { setIframeError(true); setResourceLoading(false); }} />
              )}
              {esLink && ytEmbed && !iframeError && (
                <iframe src={ytEmbed} className="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={visor.titulo} onLoad={() => setResourceLoading(false)} onError={() => { setIframeError(true); setResourceLoading(false); }} />
              )}
              {esLink && !ytEmbed && !iframeError && (
                <iframe src={urlExterna} className="w-full h-full border-0" title={visor.titulo} onLoad={() => setResourceLoading(false)} onError={() => { setIframeError(true); setResourceLoading(false); }} sandbox="allow-scripts allow-same-origin allow-popups" />
              )}
              {(iframeError || (!esDriveFile && !esLink)) && (
                <div className="flex flex-col items-center gap-6 text-center px-8 max-w-sm">
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${esPDF ? 'bg-rose-500/20' : esVideo ? 'bg-blue-500/20' : esImg ? 'bg-violet-500/20' : 'bg-slate-600/20'}`}>
                    {esPDF ? <Icons.FileText className="w-10 h-10 text-rose-400" />
                      : esVideo ? <Icons.Play className="w-10 h-10 text-blue-400" />
                      : esImg ? <Icons.Image className="w-10 h-10 text-violet-400" />
                      : <Icons.Link className="w-10 h-10 text-slate-400" />}
                  </div>
                  <div>
                    <p className="text-white font-black text-base">{visor.titulo}</p>
                    {visor.descripcion && <p className="text-slate-400 text-sm font-medium mt-1">{visor.descripcion}</p>}
                    <p className="text-slate-500 text-xs font-medium mt-3">No fue posible mostrar el archivo directamente.</p>
                  </div>
                  <a href={urlExterno} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase hover:bg-emerald-600 transition-all w-full justify-center">
                    <Icons.ExternalLink className="w-5 h-5" /> Abrir archivo
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CapPreviewModal;
