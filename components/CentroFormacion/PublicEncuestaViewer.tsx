import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { FileText, CheckCircle2, UserCheck, CreditCard, Send, HelpCircle, ShieldCheck } from 'lucide-react';

interface Props {
  encuestaId?: string | number;
}

export default function PublicEncuestaViewer({ encuestaId }: Props) {
  const [idToLoad, setIdToLoad] = useState<string | number | null>(encuestaId || null);
  const [encuesta, setEncuesta] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [respuestas, setRespuestas] = useState<Record<string, any>>({});
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Si no se pasó por prop, buscar parámetro ?id= en la URL
    if (!idToLoad) {
      const hash = window.location.hash || '';
      const searchStr = hash.includes('?') ? hash.split('?')[1] : window.location.search;
      const params = new URLSearchParams(searchStr);
      const urlId = params.get('id');
      if (urlId) {
        setIdToLoad(urlId);
      } else {
        setErrorMsg('No se especificó ningún ID de encuesta válido en el enlace.');
        setLoading(false);
      }
    }
  }, [encuestaId]);

  useEffect(() => {
    if (idToLoad) {
      loadEncuesta(idToLoad);
    }
  }, [idToLoad]);

  const loadEncuesta = async (id: string | number) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getSondeoPublico(id);
      if (res.success && res.data) {
        setEncuesta(res.data);
      } else {
        setErrorMsg(res.error || 'No se encontró la encuesta solicitada.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar la encuesta.');
    } finally {
      setLoading(false);
    }
  };

  const handleSingleChoice = (questionId: number, optionValue: string) => {
    setRespuestas(prev => ({
      ...prev,
      [String(questionId)]: optionValue
    }));
  };

  const handleMultipleChoice = (questionId: number, optionValue: string) => {
    setRespuestas(prev => {
      const qKey = String(questionId);
      const currentList: string[] = Array.isArray(prev[qKey]) ? prev[qKey] : [];
      let updated: string[];
      if (currentList.includes(optionValue)) {
        updated = currentList.filter(o => o !== optionValue);
      } else {
        updated = [...currentList, optionValue];
      }
      return {
        ...prev,
        [qKey]: updated
      };
    });
  };

  const handleTextChange = (questionId: number, textValue: string) => {
    setRespuestas(prev => ({
      ...prev,
      [String(questionId)]: textValue
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encuesta) return;

    // Validar preguntas obligatorias
    const preguntas: any[] = encuesta.preguntas || [];
    for (const p of preguntas) {
      if (p.obligatoria) {
        const val = respuestas[String(p.id)];
        if (val === undefined || val === null || (typeof val === 'string' && !val.trim()) || (Array.isArray(val) && val.length === 0)) {
          toast.error(`Por favor responda la pregunta obligatoria: "${p.pregunta}"`);
          return;
        }
      }
    }

    // Validar identificación si es OBLIGATORIO
    if (encuesta.requiere_identificacion === 'OBLIGATORIO') {
      if (!nombre.trim() || !documento.trim()) {
        toast.error('Esta encuesta requiere ingresar su Nombre Completo y Documento de Identidad.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.submitSondeoRespuesta(encuesta.id, {
        nombre_encuestado: nombre.trim() || undefined,
        documento_encuestado: documento.trim() || undefined,
        respuestas
      });

      if (res.success) {
        setSubmitted(true);
        toast.success('¡Respuestas enviadas correctamente!');
      } else {
        toast.error(res.error || 'Error enviando respuestas');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar respuestas');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold tracking-wide">Cargando encuesta...</p>
      </div>
    );
  }

  if (errorMsg || !encuesta) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 max-w-md text-center shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <HelpCircle size={32} />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Encuesta no disponible</h2>
          <p className="text-slate-400 text-sm mb-6">{errorMsg || 'No fue posible acceder al formulario.'}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-all"
          >
            Regresar al Inicio
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-800 p-8 md:p-12 rounded-3xl border border-slate-700 max-w-lg text-center shadow-2xl animate-in zoom-in-95">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">¡MUCHAS GRACIAS!</h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            Tus respuestas a la encuesta <strong>"{encuesta.titulo}"</strong> han sido registradas exitosamente en la plataforma.
          </p>
          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-700 text-xs text-slate-400">
            © {new Date().getFullYear()} OrbitM7 Logistics Systems • Milla 7
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 md:px-8 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        {/* Banner Superior */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
              <FileText size={16} /> OrbitM7 • Encuesta
            </div>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-black uppercase">
              Activa
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            {encuesta.titulo}
          </h1>

          {encuesta.descripcion && (
            <p className="text-slate-300 text-sm mt-3 leading-relaxed whitespace-pre-line bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
              {encuesta.descripcion}
            </p>
          )}
        </div>

        {/* Formulario de Preguntas */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {encuesta.preguntas?.map((p: any, idx: number) => {
            const qKey = String(p.id);
            const currentVal = respuestas[qKey];

            return (
              <div
                key={p.id}
                className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 md:p-8 shadow-lg space-y-4 hover:border-indigo-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base md:text-lg font-bold text-white flex items-start gap-3">
                    <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    {p.pregunta}
                  </h3>
                  {p.obligatoria && (
                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-extrabold uppercase rounded-md border border-rose-500/20 shrink-0">
                      Obligatoria
                    </span>
                  )}
                </div>

                {/* Renderizar según Tipo de Pregunta */}
                {p.tipo === 'SELECCION_UNICA' && (
                  <div className="space-y-2 pt-2">
                    {p.opciones?.map((op: string, oIdx: number) => {
                      const isSelected = currentVal === op;
                      return (
                        <label
                          key={oIdx}
                          onClick={() => handleSingleChoice(p.id, op)}
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold shadow-md shadow-indigo-600/10'
                              : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                            isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600 bg-slate-900'
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm">{op}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {p.tipo === 'SELECCION_MULTIPLE' && (
                  <div className="space-y-2 pt-2">
                    {p.opciones?.map((op: string, oIdx: number) => {
                      const isSelected = Array.isArray(currentVal) && currentVal.includes(op);
                      return (
                        <label
                          key={oIdx}
                          onClick={() => handleMultipleChoice(p.id, op)}
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold shadow-md shadow-indigo-600/10'
                              : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                            isSelected ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600 bg-slate-900'
                          }`}>
                            {isSelected && <span className="text-xs font-black text-white">✓</span>}
                          </div>
                          <span className="text-sm">{op}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {p.tipo === 'RESPUESTA_LIBRE' && (
                  <div className="pt-2">
                    <textarea
                      rows={3}
                      value={currentVal || ''}
                      onChange={e => handleTextChange(p.id, e.target.value)}
                      placeholder="Escribe tu respuesta detallada aquí..."
                      className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Sección de Identificación del Encuestado */}
          {encuesta.requiere_identificacion !== 'ANONIMO' && (
            <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 md:p-8 shadow-lg space-y-4">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                <UserCheck size={18} /> Datos de Identificación del Encuestado
              </div>
              <p className="text-xs text-slate-400">
                {encuesta.requiere_identificacion === 'OBLIGATORIO'
                  ? 'Esta encuesta requiere ingresar Nombre y Documento para registrar sus respuestas.'
                  : 'Si lo deseas, puedes dejar tus datos para registrar tu participación.'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">
                    Nombre Completo {encuesta.requiere_identificacion === 'OBLIGATORIO' && '*'}
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    required={encuesta.requiere_identificacion === 'OBLIGATORIO'}
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm text-white outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">
                    Documento de Identidad / Cédula {encuesta.requiere_identificacion === 'OBLIGATORIO' && '*'}
                  </label>
                  <input
                    type="text"
                    value={documento}
                    onChange={e => setDocumento(e.target.value)}
                    required={encuesta.requiere_identificacion === 'OBLIGATORIO'}
                    placeholder="Ej. 1018239120"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm text-white outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Botón de Enviar */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <Send size={18} />
              {submitting ? 'Enviando Respuestas...' : 'Enviar Respuestas de la Encuesta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
