import React, { useState, useRef } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface Opcion {
  id?: number;
  texto: string;
  imagen_url?: string;
  es_correcta: boolean;
  orden: number;
}

interface Pregunta {
  id?: number;
  tipo: 'seleccion_unica' | 'seleccion_multiple' | 'falso_verdadero' | 'asociacion';
  pregunta: string;
  imagen_url?: string;
  peso: number;
  retroalimentacion_correcta?: string;
  retroalimentacion_incorrecta?: string;
  opciones: Opcion[];
}

interface Recurso {
  id?: number;
  tipo: string;
  titulo: string;
  descripcion?: string;
  drive_link?: string;
  url_externa?: string;
  orden: number;
  _file?: File;
  _uploading?: boolean;
}

interface Capacitacion {
  id?: number;
  titulo: string;
  descripcion: string;
  objetivo: string;
  categoria: string;
  nota_minima_aprobacion: number;
  max_intentos: number;
  tiempo_limite_minutos: number | '';
  tipo_proceso: 'INDUCCION' | 'REINDUCCION' | 'AMBOS';
  tipo_acceso: 'INTERNO' | 'EXTERNO' | 'AMBOS';
  estado: 'BORRADOR' | 'ACTIVO' | 'ARCHIVADO';
  preguntas: Pregunta[];
  recursos: Recurso[];
}

const BLANK: Capacitacion = {
  titulo: '', descripcion: '', objetivo: '', categoria: 'GENERAL',
  nota_minima_aprobacion: 70, max_intentos: 3, tiempo_limite_minutos: '',
  tipo_proceso: 'AMBOS', tipo_acceso: 'INTERNO', estado: 'BORRADOR', preguntas: [], recursos: [],
};

const CATEGORIAS = ['GENERAL', 'SST', 'INDUCCION CORPORATIVA', 'PROCESO OPERATIVO', 'COMPLIANCE', 'CALIDAD', 'TECNOLOGIA'];

const TIPO_LABELS: Record<string, string> = {
  seleccion_unica: 'Selección Única',
  seleccion_multiple: 'Selección Múltiple',
  falso_verdadero: 'Falso / Verdadero',
  asociacion: 'Asociación / Emparejar',
};

function buildFVOpciones(): Opcion[] {
  return [
    { texto: 'Verdadero', es_correcta: true, orden: 0 },
    { texto: 'Falso', es_correcta: false, orden: 1 },
  ];
}

interface Props {
  capacitacion?: Capacitacion | null;
  usuario_control: string;
  allowedCategorias?: string[];
  onClose: () => void;
  onSaved: () => void;
}

const CapacitacionEditor: React.FC<Props> = ({ capacitacion, usuario_control, allowedCategorias, onClose, onSaved }) => {
  const categoriasDisponibles = allowedCategorias?.length ? allowedCategorias : CATEGORIAS;
  const initialForm = (() => {
    const base = capacitacion || BLANK;
    if (!categoriasDisponibles.includes(base.categoria)) return { ...base, categoria: categoriasDisponibles[0] };
    return base;
  })();
  const [form, setForm] = useState<Capacitacion>(initialForm);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'preguntas' | 'recursos'>('info');
  const [confirmDeleteRecurso, setConfirmDeleteRecurso] = useState<number | null>(null); // idx del recurso a eliminar
  const [deletingRecurso, setDeletingRecurso] = useState(false);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const setF = (patch: Partial<Capacitacion>) => setForm(prev => ({ ...prev, ...patch }));

  // ── Preguntas ──────────────────────────────────────────────────────────────

  const addPregunta = (tipo: Pregunta['tipo']) => {
    const opciones: Opcion[] = tipo === 'falso_verdadero' ? buildFVOpciones()
      : tipo === 'seleccion_unica' || tipo === 'asociacion'
        ? [{ texto: '', es_correcta: true, orden: 0 }, { texto: '', es_correcta: false, orden: 1 }]
        : [{ texto: '', es_correcta: true, orden: 0 }, { texto: '', es_correcta: false, orden: 1 }];
    const nueva: Pregunta = { tipo, pregunta: '', peso: 1, opciones };
    setF({ preguntas: [...form.preguntas, nueva] });
  };

  const updatePregunta = (idx: number, patch: Partial<Pregunta>) => {
    const ps = [...form.preguntas];
    ps[idx] = { ...ps[idx], ...patch };
    setF({ preguntas: ps });
  };

  const removePregunta = (idx: number) => {
    setF({ preguntas: form.preguntas.filter((_, i) => i !== idx) });
  };

  const addOpcion = (pi: number) => {
    const ps = [...form.preguntas];
    ps[pi].opciones = [...ps[pi].opciones, { texto: '', es_correcta: false, orden: ps[pi].opciones.length }];
    setF({ preguntas: ps });
  };

  const updateOpcion = (pi: number, oi: number, patch: Partial<Opcion>) => {
    const ps = [...form.preguntas];
    const ops = [...ps[pi].opciones];
    ops[oi] = { ...ops[oi], ...patch };
    // Para seleccion_unica y falso_verdadero, solo una puede ser correcta
    if (patch.es_correcta && (ps[pi].tipo === 'seleccion_unica' || ps[pi].tipo === 'falso_verdadero')) {
      ops.forEach((o, i) => { if (i !== oi) o.es_correcta = false; });
    }
    ps[pi].opciones = ops;
    setF({ preguntas: ps });
  };

  const removeOpcion = (pi: number, oi: number) => {
    const ps = [...form.preguntas];
    ps[pi].opciones = ps[pi].opciones.filter((_, i) => i !== oi);
    setF({ preguntas: ps });
  };

  // ── Recursos ───────────────────────────────────────────────────────────────

  const addRecursoLink = () => {
    setF({ recursos: [...form.recursos, { tipo: 'LINK', titulo: '', url_externa: '', orden: form.recursos.length }] });
  };

  const updateRecurso = (idx: number, patch: Partial<Recurso>) => {
    const rs = [...form.recursos];
    rs[idx] = { ...rs[idx], ...patch };
    setF({ recursos: rs });
  };

  const confirmarEliminarRecurso = async () => {
    if (confirmDeleteRecurso === null) return;
    const r = form.recursos[confirmDeleteRecurso];
    setDeletingRecurso(true);
    try {
      if (r.id) await api.capDeleteRecurso(r.id);
      setF({ recursos: form.recursos.filter((_, i) => i !== confirmDeleteRecurso) });
      toast.success('Recurso eliminado');
    } catch {
      toast.error('Error al eliminar el recurso');
    } finally {
      setDeletingRecurso(false);
      setConfirmDeleteRecurso(null);
    }
  };

  const handleRecursoFile = (idx: number, file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const tipo = ext === 'pdf' ? 'PDF'
      : ['mp4', 'mov', 'avi', 'webm'].includes(ext) ? 'VIDEO'
      : ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'IMAGEN'
      : 'LINK';
    updateRecurso(idx, { _file: file, titulo: form.recursos[idx].titulo || file.name, tipo });
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!form.titulo.trim()) return 'El título es obligatorio';
    if (form.nota_minima_aprobacion < 1 || form.nota_minima_aprobacion > 100) return 'Nota mínima debe ser entre 1 y 100';
    if (form.max_intentos < 1) return 'Debe haber al menos 1 intento';
    for (const p of form.preguntas) {
      if (!p.pregunta.trim()) return 'Todas las preguntas deben tener texto';
      const correctas = p.opciones.filter(o => o.es_correcta);
      if (correctas.length === 0) return `La pregunta "${p.pregunta.substring(0, 30)}..." no tiene respuesta correcta marcada`;
      if (p.tipo !== 'falso_verdadero') {
        for (const o of p.opciones) {
          if (!o.texto.trim() && !o.imagen_url) return 'Todas las opciones deben tener texto o imagen';
        }
      }
    }
    return null;
  };

  const handleSave = async (publishNow?: boolean) => {
    const err = validate();
    if (err) { toast.error(err); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        preguntas: form.preguntas.map(p => ({
          ...p,
          opciones: p.tipo === 'asociacion' ? p.opciones.map(o => ({ ...o, es_correcta: true })) : p.opciones
        })),
        estado: publishNow ? 'ACTIVO' : form.estado,
        tiempo_limite_minutos: form.tiempo_limite_minutos === '' ? null : form.tiempo_limite_minutos,
        usuario_control,
      };

      const result = await api.capSaveCapacitacion(payload);
      const capId = result.id;

      // Subir recursos con archivo pendiente
      for (let i = 0; i < form.recursos.length; i++) {
        const r = form.recursos[i];
        if (r._file && capId) {
          const rs = [...form.recursos];
          rs[i] = { ...rs[i], _uploading: true };
          setF({ recursos: rs });

          const fd = new FormData();
          fd.append('file', r._file);
          fd.append('capacitacion_id', String(capId));
          fd.append('titulo', r.titulo);
          fd.append('descripcion', r.descripcion || '');
          fd.append('orden', String(r.orden));
          fd.append('usuario_control', usuario_control);
          try {
            await api.capUploadRecurso(fd);
          } catch {
            toast.error(`Error subiendo recurso "${r.titulo}" a Drive`);
          }
        }
      }

      toast.success(publishNow ? '¡Capacitación publicada exitosamente!' : 'Capacitación guardada como borrador');
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar capacitación');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'info', label: 'Información', icon: Icons.FileText },
    { key: 'preguntas', label: `Preguntas (${form.preguntas.length})`, icon: Icons.ClipboardCheck },
    { key: 'recursos', label: `Recursos (${form.recursos.length})`, icon: Icons.Book },
  ] as const;

  return (
    <>
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white flex-shrink-0">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter">
              {form.id ? 'Editar Capacitación' : 'Nueva Capacitación'}
            </h2>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">
              Sistema LMS OrbitM7 IQ
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 p-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveSection(t.key as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${activeSection === t.key ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">

          {/* ── SECCIÓN INFO ── */}
          {activeSection === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Título de la Capacitación *</label>
                  <input value={form.titulo} onChange={e => setF({ titulo: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                    placeholder="Ej: Inducción en Seguridad y Salud en el Trabajo" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Categoría</label>
                  <select value={form.categoria} onChange={e => setF({ categoria: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all uppercase">
                    {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Proceso</label>
                  <select value={form.tipo_proceso} onChange={e => setF({ tipo_proceso: e.target.value as any })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all uppercase">
                    <option value="AMBOS">Inducción y Reinducción</option>
                    <option value="INDUCCION">Solo Inducción</option>
                    <option value="REINDUCCION">Solo Reinducción</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Acceso</label>
                  <select value={form.tipo_acceso} onChange={e => setF({ tipo_acceso: e.target.value as any })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all uppercase">
                    <option value="INTERNO">Interno — solo desde la aplicación</option>
                    <option value="EXTERNO">Externo — solo por enlace público</option>
                    <option value="AMBOS">Ambos — app + enlace público</option>
                  </select>
                  <p className="text-[9px] text-slate-400 font-medium px-1">
                    {form.tipo_acceso === 'INTERNO' && '🔒 Solo colaboradores con cuenta pueden acceder.'}
                    {form.tipo_acceso === 'EXTERNO' && '🔗 Se genera un enlace compartible. Valida que la cédula esté autorizada.'}
                    {form.tipo_acceso === 'AMBOS' && '🌐 Accesible desde la app y por enlace externo con validación de cédula.'}
                  </p>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Descripción</label>
                  <textarea value={form.descripcion} onChange={e => setF({ descripcion: e.target.value })} rows={2}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-medium text-slate-700 outline-none focus:border-slate-900 transition-all resize-none"
                    placeholder="Breve descripción de la capacitación..." />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Objetivo</label>
                  <textarea value={form.objetivo} onChange={e => setF({ objetivo: e.target.value })} rows={2}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-medium text-slate-700 outline-none focus:border-slate-900 transition-all resize-none"
                    placeholder="Al finalizar esta capacitación el colaborador será capaz de..." />
                </div>
              </div>

              {/* Configuración examen */}
              <div className="bg-slate-50 rounded-2xl p-5 space-y-4 border-2 border-slate-100">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <Icons.Shield className="w-4 h-4 text-emerald-500" /> Configuración del Examen
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nota Mínima de Aprobación (%)</label>
                    <input type="number" min={1} max={100} value={form.nota_minima_aprobacion}
                      onChange={e => setF({ nota_minima_aprobacion: Number(e.target.value) })}
                      className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 outline-none focus:border-emerald-500 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Máximo de Intentos</label>
                    <input type="number" min={1} max={10} value={form.max_intentos}
                      onChange={e => setF({ max_intentos: Number(e.target.value) })}
                      className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-slate-900 outline-none focus:border-emerald-500 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Tiempo Límite (min, opcional)</label>
                    <input type="number" min={1} value={form.tiempo_limite_minutos}
                      onChange={e => setF({ tiempo_limite_minutos: e.target.value ? Number(e.target.value) : '' })}
                      placeholder="Sin límite"
                      className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 font-black text-slate-700 outline-none focus:border-emerald-500 transition-all" />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pt-1">
                  <Icons.CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Aprueba con {form.nota_minima_aprobacion}% · máximo {form.max_intentos} intento(s) ·
                  {form.tiempo_limite_minutos ? ` ${form.tiempo_limite_minutos} min` : ' sin tiempo límite'}
                </div>
              </div>

              {/* Estado */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Estado de publicación</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: 'BORRADOR', icon: '✏️', label: 'Borrador', desc: 'En construcción. Invisible para los colaboradores. Úsalo mientras configuras.', active: 'bg-amber-500 border-amber-500 text-white', inactive: 'border-amber-200 text-amber-700 hover:border-amber-400' },
                    { key: 'ACTIVO',   icon: '✅', label: 'Activo',   desc: 'Publicada. Los asignados ya pueden acceder y presentar el examen.', active: 'bg-emerald-500 border-emerald-500 text-white', inactive: 'border-emerald-200 text-emerald-700 hover:border-emerald-400' },
                    { key: 'ARCHIVADO',icon: '📦', label: 'Archivado',desc: 'Retirada. Se conserva el historial pero no acepta nuevos intentos.', active: 'bg-slate-500 border-slate-500 text-white', inactive: 'border-slate-200 text-slate-500 hover:border-slate-400' },
                  ] as const).map(({ key, icon, label, desc, active, inactive }) => (
                    <button key={key} onClick={() => setF({ estado: key })}
                      className={`relative flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 text-left transition-all ${form.estado === key ? active : `bg-white ${inactive}`}`}>
                      <span className="text-base leading-none">{icon}</span>
                      <span className="text-[10px] font-black uppercase tracking-wide leading-none">{label}</span>
                      <span className={`text-[9px] font-medium leading-snug ${form.estado === key ? 'text-white/80' : 'text-slate-400'}`}>{desc}</span>
                      {form.estado === key && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white/60" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-400 font-medium px-1">
                  💡 El botón <strong>"Publicar"</strong> en la parte inferior activa automáticamente el estado <strong>Activo</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ── SECCIÓN PREGUNTAS ── */}
          {activeSection === 'preguntas' && (
            <div className="space-y-5">
              {form.preguntas.length === 0 && (
                <div className="text-center py-12 text-slate-300 font-black uppercase tracking-widest italic text-xs">
                  No hay preguntas aún. Agrega la primera abajo.
                </div>
              )}

              {form.preguntas.map((p, pi) => (
                <div key={pi} className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 space-y-4 relative">
                  {/* Cabecera pregunta */}
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0">
                      {pi + 1}
                    </span>
                    <select value={p.tipo} onChange={e => {
                      const newTipo = e.target.value as Pregunta['tipo'];
                      const opciones = newTipo === 'falso_verdadero' ? buildFVOpciones()
                        : newTipo === 'seleccion_unica' || newTipo === 'asociacion'
                          ? [{ texto: '', es_correcta: true, orden: 0 }, { texto: '', es_correcta: false, orden: 1 }]
                          : p.opciones.map(o => ({ ...o, es_correcta: false }));
                      updatePregunta(pi, { tipo: newTipo, opciones });
                    }}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none flex-shrink-0">
                      {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase">
                      <span>Peso:</span>
                      <input type="number" min={1} max={10} value={p.peso}
                        onChange={e => updatePregunta(pi, { peso: Number(e.target.value) })}
                        className="w-14 text-center bg-white border border-slate-200 rounded-lg px-2 py-1.5 font-black text-slate-700 outline-none" />
                    </div>
                    <button onClick={() => removePregunta(pi)}
                      className="ml-auto w-8 h-8 bg-rose-50 text-rose-400 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all flex-shrink-0">
                      <Icons.Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Texto pregunta */}
                  <textarea value={p.pregunta} onChange={e => updatePregunta(pi, { pregunta: e.target.value })} rows={2}
                    className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all resize-none"
                    placeholder="Escribe la pregunta..." />

                  {/* Opciones */}
                  {p.tipo !== 'falso_verdadero' && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                        {p.tipo === 'asociacion' ? 'Pares a Emparejar (Concepto y Definición)' : 'Opciones de Respuesta'}
                        {p.tipo === 'seleccion_multiple' && <span className="ml-2 text-blue-500">(puedes marcar varias correctas)</span>}
                      </p>
                      {p.opciones.map((o, oi) => (
                        <div key={oi} className={`flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border-2 transition-all ${o.es_correcta && p.tipo !== 'asociacion' ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-100'}`}>
                          {/* Selector correcto (oculto en asociacion) */}
                          {p.tipo !== 'asociacion' && (
                            <button onClick={() => updateOpcion(pi, oi, { es_correcta: !o.es_correcta })}
                              className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all ${o.es_correcta ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                              {o.es_correcta && <Icons.Check className="w-3.5 h-3.5 text-white" />}
                            </button>
                          )}
                          
                          <div className="flex-1 flex flex-col sm:flex-row gap-2">
                            <input value={o.texto} onChange={e => updateOpcion(pi, oi, { texto: e.target.value })}
                              className="flex-1 bg-transparent border-b border-slate-200 outline-none text-sm font-medium text-slate-700 placeholder:text-slate-300 pb-1"
                              placeholder={p.tipo === 'asociacion' ? 'Ej: Caneca roja' : `Opción ${oi + 1}...`} />
                            
                            {p.tipo === 'asociacion' && (
                              <input value={o.imagen_url || ''} onChange={e => updateOpcion(pi, oi, { imagen_url: e.target.value })}
                                className="flex-1 bg-transparent border-b border-slate-200 outline-none text-sm font-medium text-slate-700 placeholder:text-slate-300 pb-1"
                                placeholder="Ej: Residuos biológicos..." />
                            )}
                          </div>

                          {p.opciones.length > 2 && (
                            <button onClick={() => removeOpcion(pi, oi)}
                              className="w-6 h-6 text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0 flex items-center justify-center">
                              <Icons.X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addOpcion(pi)}
                        className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition-all">
                        + Agregar {p.tipo === 'asociacion' ? 'par' : 'opción'}
                      </button>
                    </div>
                  )}

                  {/* Falso/Verdadero radio */}
                  {p.tipo === 'falso_verdadero' && (
                    <div className="flex gap-3">
                      {p.opciones.map((o, oi) => (
                        <button key={oi} onClick={() => updateOpcion(pi, oi, { es_correcta: true })}
                          className={`flex-1 py-3 rounded-xl border-2 text-sm font-black uppercase transition-all ${o.es_correcta ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>
                          {o.texto}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Retroalimentación */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest px-1">Feedback si acierta</label>
                      <input value={p.retroalimentacion_correcta || ''} onChange={e => updatePregunta(pi, { retroalimentacion_correcta: e.target.value })}
                        className="w-full bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-800 outline-none"
                        placeholder="Excelente! Esa es la respuesta correcta..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-rose-500 uppercase tracking-widest px-1">Feedback si falla</label>
                      <input value={p.retroalimentacion_incorrecta || ''} onChange={e => updatePregunta(pi, { retroalimentacion_incorrecta: e.target.value })}
                        className="w-full bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-rose-800 outline-none"
                        placeholder="Incorrecto. La respuesta correcta era..." />
                    </div>
                  </div>
                </div>
              ))}

              {/* Botones añadir pregunta */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {Object.entries(TIPO_LABELS).map(([tipo, label]) => (
                  <button key={tipo} onClick={() => addPregunta(tipo as Pregunta['tipo'])}
                    className="py-3 px-4 bg-white border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:border-slate-900 hover:text-slate-900 transition-all">
                    + {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── SECCIÓN RECURSOS ── */}
          {activeSection === 'recursos' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 font-medium">
                <Icons.Upload className="inline w-4 h-4 mr-1 text-amber-500" />
                Los archivos (PDF, video, imágenes) se subirán automáticamente a Google Drive en la carpeta
                <strong className="mx-1">CAPACITACIONES MILLA 7 / {form.titulo || 'nombre capacitación'} / recursos</strong>
                al guardar.
              </div>

              {form.recursos.map((r, ri) => (
                <div key={ri} className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${r.tipo === 'PDF' ? 'bg-rose-100 text-rose-600' : r.tipo === 'VIDEO' ? 'bg-blue-100 text-blue-600' : r.tipo === 'IMAGEN' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>
                      {r.tipo}
                    </span>
                    <input value={r.titulo} onChange={e => updateRecurso(ri, { titulo: e.target.value })}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none"
                      placeholder="Nombre del recurso..." />
                    <button onClick={() => setConfirmDeleteRecurso(ri)}
                      className="w-8 h-8 bg-rose-50 text-rose-400 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all flex-shrink-0">
                      <Icons.Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {r.tipo === 'LINK' ? (
                    <input value={r.url_externa || ''} onChange={e => updateRecurso(ri, { url_externa: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none"
                      placeholder="https://... (YouTube, web, etc.)" />
                  ) : (
                    <div>
                      {r._file ? (
                        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                          <Icons.CheckCircle className="w-4 h-4 text-emerald-500" />
                          {r._file.name} — {(r._file.size / 1024 / 1024).toFixed(2)} MB
                          {r._uploading && <span className="text-amber-500 animate-pulse">Subiendo...</span>}
                        </div>
                      ) : r.drive_link ? (
                        <a href={r.drive_link} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-emerald-600 font-bold hover:underline">
                          <Icons.Link className="w-3 h-3" /> Ver en Drive
                        </a>
                      ) : (
                        <div>
                          <input ref={(el: HTMLInputElement | null) => { fileRefs.current[ri] = el; }} type="file"
                            accept={r.tipo === 'PDF' ? '.pdf' : r.tipo === 'VIDEO' ? 'video/*' : 'image/*,.pdf,video/*'}
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) handleRecursoFile(ri, e.target.files[0]); }} />
                          <button onClick={() => fileRefs.current[ri]?.click()}
                            className="py-2 px-4 bg-white border-2 border-dashed border-slate-300 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition-all">
                            <Icons.Upload className="inline w-3.5 h-3.5 mr-1" /> Seleccionar archivo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Botones agregar recurso */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {[
                  { tipo: 'PDF', label: 'PDF', icon: Icons.FileText, color: 'text-rose-500' },
                  { tipo: 'VIDEO', label: 'Video', icon: Icons.Play, color: 'text-blue-500' },
                  { tipo: 'IMAGEN', label: 'Imagen', icon: Icons.Eye, color: 'text-purple-500' },
                  { tipo: 'LINK', label: 'Link Web', icon: Icons.Link, color: 'text-slate-500' },
                ].map(btn => (
                  <button key={btn.tipo} onClick={() => setF({ recursos: [...form.recursos, { tipo: btn.tipo, titulo: '', orden: form.recursos.length }] })}
                    className="py-3 px-4 bg-white border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:border-slate-900 hover:text-slate-900 transition-all flex items-center justify-center gap-2">
                    <btn.icon className={`w-4 h-4 ${btn.color}`} /> + {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 md:p-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50 flex-shrink-0">
          <div className="text-[10px] text-slate-400 font-bold uppercase">
            {form.preguntas.length} pregunta(s) · {form.recursos.length} recurso(s) · aprobación {form.nota_minima_aprobacion}%
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all">
              Cancelar
            </button>
            <button onClick={() => handleSave(false)} disabled={saving}
              className="px-6 py-3 bg-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-300 transition-all disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar Borrador'}
            </button>
            <button onClick={() => handleSave(true)} disabled={saving}
              className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl disabled:opacity-50">
              {saving ? 'Publicando...' : '🚀 Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* ── Modal confirmar eliminar recurso ────────────────────────────────── */}
    {confirmDeleteRecurso !== null && (() => {
      const r = form.recursos[confirmDeleteRecurso];
      const tieneArchivoDrive = !!r.id && r.tipo !== 'LINK';
      return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header rojo */}
            <div className="bg-gradient-to-br from-rose-500 to-rose-700 px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Icons.Trash className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-sm uppercase tracking-wide">Eliminar Recurso</p>
                  <p className="text-rose-100 text-xs font-medium mt-0.5 truncate max-w-[200px]">{r.titulo || 'Sin nombre'}</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3">
              <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 space-y-1.5">
                <p className="text-[11px] font-black text-rose-800">Esta acción eliminará permanentemente:</p>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2 text-[10px] text-rose-700 font-medium">
                    <span className="text-rose-400">•</span> El recurso de la capacitación
                  </li>
                  {tieneArchivoDrive && (
                    <li className="flex items-center gap-2 text-[10px] text-rose-700 font-medium">
                      <span className="text-rose-400">•</span> El archivo en Google Drive
                    </li>
                  )}
                </ul>
              </div>
              <p className="text-[10px] text-slate-400 font-medium text-center">Esta acción no se puede deshacer.</p>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setConfirmDeleteRecurso(null)} disabled={deletingRecurso}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmarEliminarRecurso} disabled={deletingRecurso}
                className="flex-1 py-3 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-rose-600 transition-all disabled:opacity-50">
                {deletingRecurso ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
};

export default CapacitacionEditor;
