import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  FileText, Plus, Trash2, Edit3, Eye, Copy, Share2, CheckCircle2,
  HelpCircle, UserCheck, Calendar, Clock, BarChart2, CheckSquare,
  Circle, AlignLeft, X, ExternalLink, Download, Layers, ShieldCheck,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown
} from 'lucide-react';

interface Props {
  user: User;
}

export interface Pregunta {
  id?: number;
  pregunta: string;
  tipo: 'SELECCION_UNICA' | 'SELECCION_MULTIPLE' | 'RESPUESTA_LIBRE';
  obligatoria: boolean;
  opciones: string[];
}

export interface Encuesta {
  id?: number;
  titulo: string;
  descripcion: string;
  tipo_acceso: 'APP' | 'ENLACE' | 'AMBOS';
  estado: 'ACTIVO' | 'INACTIVO' | 'FINALIZADO';
  requiere_identificacion: 'OPCIONAL' | 'OBLIGATORIO' | 'ANONIMO';
  fecha_vencimiento?: string | null;
  total_respuestas?: number;
  total_preguntas?: number;
  created_at?: string;
  preguntas?: Pregunta[];
}

const BLANK_ENCUESTA: Encuesta = {
  titulo: '',
  descripcion: '',
  tipo_acceso: 'AMBOS',
  estado: 'ACTIVO',
  requiere_identificacion: 'OPCIONAL',
  fecha_vencimiento: '',
  preguntas: [
    {
      pregunta: '',
      tipo: 'SELECCION_UNICA',
      obligatoria: true,
      opciones: ['Opción 1', 'Opción 2']
    }
  ]
};

export default function EncuestasSondeos({ user }: Props) {
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de Creación / Edición
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEncuesta, setCurrentEncuesta] = useState<Encuesta>(BLANK_ENCUESTA);
  const [saving, setSaving] = useState(false);

  // Estado para preguntas expansibles (accordion map)
  const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>({ 0: true });

  // Modal de Resultados / Estadísticas
  const [resultadosModal, setResultadosModal] = useState<any | null>(null);
  const [loadingResultados, setLoadingResultados] = useState(false);

  useEffect(() => {
    loadEncuestas();
  }, []);

  const loadEncuestas = async () => {
    setLoading(true);
    try {
      const res = await api.getSondeos();
      if (res.success) {
        setEncuestas(res.data || []);
      }
    } catch (err: any) {
      toast.error('Error al cargar encuestas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setCurrentEncuesta(JSON.parse(JSON.stringify(BLANK_ENCUESTA)));
    setExpandedMap({ 0: true });
    setModalOpen(true);
  };

  const handleOpenEdit = async (id: number) => {
    try {
      const res = await api.getSondeoById(id);
      if (res.success && res.data) {
        setCurrentEncuesta(res.data);
        // Colapsar todas por defecto para dar vista resumen ágil
        const map: Record<number, boolean> = {};
        (res.data.preguntas || []).forEach((_: any, idx: number) => { map[idx] = false; });
        if (res.data.preguntas?.length > 0) map[0] = true; // primera abierta
        setExpandedMap(map);
        setModalOpen(true);
      }
    } catch (err: any) {
      toast.error('Error al obtener detalle: ' + err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar esta encuesta y todas sus respuestas?')) return;
    try {
      const res = await api.deleteSondeo(id);
      if (res.success) {
        toast.success('Encuesta eliminada correctamente');
        loadEncuestas();
      }
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    }
  };

  const handleSave = async () => {
    if (!currentEncuesta.titulo.trim()) {
      toast.error('El título de la encuesta es obligatorio');
      return;
    }
    if (!currentEncuesta.preguntas || currentEncuesta.preguntas.length === 0) {
      toast.error('Debe agregar al menos una pregunta a la encuesta');
      return;
    }

    for (let i = 0; i < currentEncuesta.preguntas.length; i++) {
      const p = currentEncuesta.preguntas[i];
      if (!p.pregunta.trim()) {
        toast.error(`La pregunta #${i + 1} no puede estar vacía`);
        // Abrir la pregunta con error automáticamente
        setExpandedMap(prev => ({ ...prev, [i]: true }));
        return;
      }
      if ((p.tipo === 'SELECCION_UNICA' || p.tipo === 'SELECCION_MULTIPLE') && (!p.opciones || p.opciones.length < 2)) {
        toast.error(`La pregunta #${i + 1} debe tener al menos 2 opciones de selección`);
        setExpandedMap(prev => ({ ...prev, [i]: true }));
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.saveSondeo(currentEncuesta, currentEncuesta.id);
      if (res.success) {
        toast.success('Encuesta guardada exitosamente');
        setModalOpen(false);
        loadEncuestas();
      } else {
        toast.error(res.error || 'Error al guardar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ── Gestor de Acordeón / Plegado ──────────────────────────────────────────
  const toggleExpand = (index: number) => {
    setExpandedMap(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const expandAll = () => {
    const map: Record<number, boolean> = {};
    (currentEncuesta.preguntas || []).forEach((_, idx) => { map[idx] = true; });
    setExpandedMap(map);
  };

  const collapseAll = () => {
    setExpandedMap({});
  };

  // ── Modificadores de Preguntas ──────────────────────────────────────────
  const addPregunta = () => {
    setCurrentEncuesta(prev => {
      const preguntas = [
        ...(prev.preguntas || []),
        {
          pregunta: '',
          tipo: 'SELECCION_UNICA' as const,
          obligatoria: true,
          opciones: ['Opción 1', 'Opción 2']
        }
      ];
      const newIdx = preguntas.length - 1;
      setExpandedMap(old => ({ ...old, [newIdx]: true }));
      return { ...prev, preguntas };
    });
  };

  const duplicatePregunta = (index: number) => {
    setCurrentEncuesta(prev => {
      const preguntas = [...(prev.preguntas || [])];
      const target = preguntas[index];
      if (!target) return prev;
      const clone: Pregunta = {
        pregunta: target.pregunta ? `${target.pregunta} (Copia)` : '',
        tipo: target.tipo,
        obligatoria: target.obligatoria,
        opciones: target.opciones ? [...target.opciones] : []
      };
      preguntas.splice(index + 1, 0, clone);
      return { ...prev, preguntas };
    });
    setExpandedMap(prev => ({ ...prev, [index + 1]: true }));
    toast.success(`Pregunta #${index + 1} duplicada`);
  };

  const movePregunta = (index: number, direction: 'UP' | 'DOWN') => {
    setCurrentEncuesta(prev => {
      const list = [...(prev.preguntas || [])];
      const newIdx = direction === 'UP' ? index - 1 : index + 1;
      if (newIdx < 0 || newIdx >= list.length) return prev;
      const temp = list[index];
      list[index] = list[newIdx];
      list[newIdx] = temp;
      return { ...prev, preguntas: list };
    });
    setExpandedMap(prev => {
      const newIdx = direction === 'UP' ? index - 1 : index + 1;
      return {
        ...prev,
        [index]: prev[newIdx],
        [newIdx]: prev[index]
      };
    });
  };

  const removePregunta = (index: number) => {
    setCurrentEncuesta(prev => ({
      ...prev,
      preguntas: (prev.preguntas || []).filter((_, i) => i !== index)
    }));
  };

  const updatePregunta = (index: number, field: keyof Pregunta, val: any) => {
    setCurrentEncuesta(prev => {
      const newP = [...(prev.preguntas || [])];
      newP[index] = { ...newP[index], [field]: val };
      return { ...prev, preguntas: newP };
    });
  };

  const addOpcion = (pIndex: number) => {
    setCurrentEncuesta(prev => {
      const newP = [...(prev.preguntas || [])];
      const count = (newP[pIndex].opciones || []).length + 1;
      newP[pIndex].opciones = [...(newP[pIndex].opciones || []), `Opción ${count}`];
      return { ...prev, preguntas: newP };
    });
  };

  const updateOpcion = (pIndex: number, oIndex: number, text: string) => {
    setCurrentEncuesta(prev => {
      const newP = [...(prev.preguntas || [])];
      const newOps = [...(newP[pIndex].opciones || [])];
      newOps[oIndex] = text;
      newP[pIndex].opciones = newOps;
      return { ...prev, preguntas: newP };
    });
  };

  const removeOpcion = (pIndex: number, oIndex: number) => {
    setCurrentEncuesta(prev => {
      const newP = [...(prev.preguntas || [])];
      newP[pIndex].opciones = (newP[pIndex].opciones || []).filter((_, i) => i !== oIndex);
      return { ...prev, preguntas: newP };
    });
  };

  // Copiar Enlace Público
  const copyPublicLink = (id: number) => {
    const url = `${window.location.origin}/#/publico/encuesta?id=${id}`;
    navigator.clipboard.writeText(url);
    toast.success('Enlace público copiado al portapapeles');
  };

  // Cargar Resultados
  const handleOpenResultados = async (id: number) => {
    setLoadingResultados(true);
    setResultadosModal(null);
    try {
      const res = await api.getSondeoResultados(id);
      if (res.success) {
        setResultadosModal(res.data);
      } else {
        toast.error(res.error || 'No se pudieron obtener resultados');
      }
    } catch (err: any) {
      toast.error('Error cargando resultados: ' + err.message);
    } finally {
      setLoadingResultados(false);
    }
  };

  // Exportar Excel de Resultados
  const exportResultadosExcel = () => {
    if (!resultadosModal) return;
    const { encuesta, preguntas, respuestasDetalladas } = resultadosModal;

    const headers = ['#', 'Fecha Respuesta', 'Nombre Encuestado', 'Documento / Cédula', 'IP'];
    preguntas.forEach((p: any) => headers.push(p.pregunta));

    const rows = respuestasDetalladas.map((r: any, idx: number) => {
      const rowData: any[] = [
        idx + 1,
        new Date(r.created_at).toLocaleString('es-CO'),
        r.nombre_encuestado || 'Anónimo / No registrado',
        r.documento_encuestado || 'Sin documento',
        r.ip_address || 'Local'
      ];
      preguntas.forEach((p: any) => {
        const val = r.respuestas ? r.respuestas[String(p.id)] : '';
        if (Array.isArray(val)) {
          rowData.push(val.join('; '));
        } else {
          rowData.push(val || '');
        }
      });
      return rowData;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Respuestas');
    XLSX.writeFile(wb, `Respuestas_Encuesta_${encuesta.id}_${encuesta.titulo.slice(0, 15)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl shadow-indigo-950/20 mb-8 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-3">
              <FileText size={14} /> Centro de Formación & Mediciones
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              ENCUESTAS Y SONDEOS
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Crea encuestas interactivas con preguntas de selección única, múltiple o respuesta libre.
              Configura acceso interno o público y recolecta datos con o sin identificación obligatoria.
            </p>
          </div>
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95"
          >
            <Plus size={18} /> Nueva Encuesta
          </button>
        </div>
      </div>

      {/* Grid de Encuestas */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold">Cargando encuestas...</p>
        </div>
      ) : encuestas.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <HelpCircle size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">No hay encuestas registradas</h3>
          <p className="text-slate-500 text-sm mt-1 mb-6">Comienza creando tu primera encuesta o sondeo de opinión.</p>
          <button
            onClick={handleOpenNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition-all"
          >
            <Plus size={16} /> Crear primera encuesta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {encuestas.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    item.estado === 'ACTIVO'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {item.estado}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {item.tipo_acceso === 'AMBOS' ? 'App + Enlace' : item.tipo_acceso === 'APP' ? 'Solo App' : 'Solo Enlace'}
                    </span>
                  </div>
                </div>

                <h3 className="text-lg font-black text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-2">
                  {item.titulo}
                </h3>
                <p className="text-slate-500 text-xs mt-2 line-clamp-3 leading-relaxed">
                  {item.descripcion || 'Sin descripción adicional.'}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600 font-medium">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={14} className="text-indigo-500" />
                    <span>Preguntas: <strong>{item.total_preguntas || 0}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserCheck size={14} className="text-emerald-500" />
                    <span>Identificación: <strong>{item.requiere_identificacion}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart2 size={14} className="text-amber-500" />
                    <span>Respuestas registradas: <strong className="text-amber-700">{item.total_respuestas || 0}</strong></span>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenResultados(item.id!)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 font-bold text-xs rounded-xl transition-all"
                  >
                    <BarChart2 size={14} /> Resultados
                  </button>
                  <button
                    onClick={() => copyPublicLink(item.id!)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-xl transition-all"
                  >
                    <Share2 size={14} /> Enlace
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <a
                    href={`/#/publico/encuesta?id=${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                  >
                    <ExternalLink size={13} /> Vista previa
                  </a>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(item.id!)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-all"
                      title="Editar"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id!)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL: CREADOR / EDITOR DE ENCUESTA ───────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8 overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header Modal */}
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black tracking-tight">
                  {currentEncuesta.id ? 'EDITAR ENCUESTA' : 'DISEÑAR NUEVA ENCUESTA'}
                </h2>
                <p className="text-xs text-slate-400">Configura los parámetros, tipos de acceso y preguntas del formulario</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body Modal */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {/* Sección Datos Principales */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={14} className="text-indigo-500" /> Información General
                </h3>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Título de la Encuesta *</label>
                  <input
                    type="text"
                    value={currentEncuesta.titulo}
                    onChange={e => setCurrentEncuesta(prev => ({ ...prev, titulo: e.target.value }))}
                    placeholder="Ej. Encuesta de Satisfacción Clientes 2026"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Descripción o Instrucciones</label>
                  <textarea
                    rows={2}
                    value={currentEncuesta.descripcion}
                    onChange={e => setCurrentEncuesta(prev => ({ ...prev, descripcion: e.target.value }))}
                    placeholder="Explica el propósito de este sondeo a los encuestados..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Canal de Acceso</label>
                    <select
                      value={currentEncuesta.tipo_acceso}
                      onChange={e => setCurrentEncuesta(prev => ({ ...prev, tipo_acceso: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="AMBOS">App + Enlace Público (Mixto)</option>
                      <option value="APP">Solo App (Interno)</option>
                      <option value="ENLACE">Solo Enlace Público (Externo)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Identificación Encuestado</label>
                    <select
                      value={currentEncuesta.requiere_identificacion}
                      onChange={e => setCurrentEncuesta(prev => ({ ...prev, requiere_identificacion: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="OPCIONAL">Opcional (Si el encuestado lo desea)</option>
                      <option value="OBLIGATORIO">Obligatorio (Requiere Nombre y Documento)</option>
                      <option value="ANONIMO">100% Anónimo</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Estado</label>
                    <select
                      value={currentEncuesta.estado}
                      onChange={e => setCurrentEncuesta(prev => ({ ...prev, estado: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="ACTIVO">Activo</option>
                      <option value="INACTIVO">Inactivo</option>
                      <option value="FINALIZADO">Finalizado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Diseñador de Preguntas (Acordeón Expansible) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-100/90 p-3 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Layers size={14} className="text-indigo-600" /> Creador de Preguntas ({currentEncuesta.preguntas?.length || 0})
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={expandAll}
                      type="button"
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-indigo-700 hover:bg-slate-200/80 rounded-lg transition-all"
                    >
                      Desplegar Todas
                    </button>
                    <button
                      onClick={collapseAll}
                      type="button"
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-indigo-700 hover:bg-slate-200/80 rounded-lg transition-all"
                    >
                      Plegar Todas
                    </button>
                    <button
                      onClick={addPregunta}
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                    >
                      <Plus size={14} /> Añadir Pregunta
                    </button>
                  </div>
                </div>

                {currentEncuesta.preguntas?.map((p, pIdx) => {
                  const isExpanded = !!expandedMap[pIdx];

                  return (
                    <div key={pIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all group">
                      {/* Header de Pregunta Plegable */}
                      <div
                        onClick={() => toggleExpand(pIdx)}
                        className="p-4 bg-slate-50/90 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between gap-3 select-none transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-sm">
                            {pIdx + 1}
                          </span>

                          <div className="truncate flex-1">
                            <h4 className="text-xs font-bold text-slate-800 truncate">
                              {p.pregunta.trim() || <span className="text-slate-400 italic">(Pregunta sin título asignado aún)</span>}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {p.tipo === 'SELECCION_UNICA' ? 'Radio Única' : p.tipo === 'SELECCION_MULTIPLE' ? 'Checkbox Múltiple' : 'Texto Libre'}
                            </span>
                            {p.obligatoria && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100">
                                Obligatoria
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botones de acción rápida en header */}
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => movePregunta(pIdx, 'UP')}
                            disabled={pIdx === 0}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-200/80 disabled:opacity-20 transition-all"
                            title="Mover arriba"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => movePregunta(pIdx, 'DOWN')}
                            disabled={pIdx === (currentEncuesta.preguntas?.length || 0) - 1}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-200/80 disabled:opacity-20 transition-all"
                            title="Mover abajo"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() => duplicatePregunta(pIdx)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-all"
                            title="Duplicar pregunta"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => removePregunta(pIdx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all"
                            title="Eliminar pregunta"
                          >
                            <Trash2 size={14} />
                          </button>

                          <button
                            onClick={() => toggleExpand(pIdx)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200 ml-1 transition-all"
                          >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>
                      </div>

                      {/* Cuerpo de la pregunta (Desplegable) */}
                      {isExpanded && (
                        <div className="p-5 bg-white border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-xs font-bold text-slate-700">Enunciado de la Pregunta *</label>
                              <input
                                type="text"
                                value={p.pregunta}
                                onChange={e => updatePregunta(pIdx, 'pregunta', e.target.value)}
                                placeholder={`Ej. ¿Cómo califica la atención brindada en la entrega?`}
                                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-700">Tipo de Respuesta</label>
                              <select
                                value={p.tipo}
                                onChange={e => updatePregunta(pIdx, 'tipo', e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 bg-white"
                              >
                                <option value="SELECCION_UNICA">Selección Única (Radio)</option>
                                <option value="SELECCION_MULTIPLE">Selección Múltiple (Checkbox)</option>
                                <option value="RESPUESTA_LIBRE">Respuesta Libre (Texto)</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={p.obligatoria}
                                onChange={e => updatePregunta(pIdx, 'obligatoria', e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              Respuesta obligatoria para el encuestado
                            </label>
                          </div>

                          {/* Opciones para Selección Única o Múltiple */}
                          {(p.tipo === 'SELECCION_UNICA' || p.tipo === 'SELECCION_MULTIPLE') && (
                            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 space-y-2">
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                  Opciones de Elección:
                                </label>
                                <span className="text-[10px] text-slate-400 font-medium">Presiona Enter para añadir otra opción</span>
                              </div>
                              {p.opciones?.map((op, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  {p.tipo === 'SELECCION_UNICA' ? (
                                    <Circle size={14} className="text-slate-400 shrink-0" />
                                  ) : (
                                    <CheckSquare size={14} className="text-slate-400 shrink-0" />
                                  )}
                                  <input
                                    type="text"
                                    value={op}
                                    onChange={e => updateOpcion(pIdx, oIdx, e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addOpcion(pIdx);
                                      }
                                    }}
                                    placeholder={`Opción ${oIdx + 1}`}
                                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-indigo-500 bg-white"
                                  />
                                  {p.opciones.length > 2 && (
                                    <button
                                      onClick={() => removeOpcion(pIdx, oIdx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 transition-all"
                                      title="Eliminar opción"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                onClick={() => addOpcion(pIdx)}
                                type="button"
                                className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                              >
                                <Plus size={12} /> Añadir otra opción
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Botón persistent para añadir nueva pregunta al final */}
                <button
                  onClick={addPregunta}
                  type="button"
                  className="w-full py-3.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50 text-indigo-700 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all group"
                >
                  <Plus size={16} className="group-hover:scale-125 transition-transform" />
                  Añadir Nueva Pregunta a la Encuesta
                </button>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar Encuesta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: VER RESULTADOS Y ESTADÍSTICAS ─────────────────────────────── */}
      {resultadosModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8 overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase">
                  Estadísticas & Respuestas
                </span>
                <h2 className="text-lg font-black tracking-tight mt-1">
                  {resultadosModal.encuesta.titulo}
                </h2>
                <p className="text-xs text-slate-400">
                  Total encuestados: <strong className="text-emerald-400">{resultadosModal.totalRespuestas}</strong> respuestas registradas
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportResultadosExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                >
                  <Download size={14} /> Exportar Excel
                </button>
                <button
                  onClick={() => setResultadosModal(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {resultadosModal.totalRespuestas === 0 ? (
                <div className="bg-white p-8 rounded-2xl text-center border border-slate-200 text-slate-500 text-sm">
                  Aún no se han recibido respuestas para esta encuesta.
                </div>
              ) : (
                resultadosModal.estadisticas.map((st: any, idx: number) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <h4 className="text-sm font-black text-slate-800 flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      {st.pregunta}
                    </h4>

                    {st.tipo === 'RESPUESTA_LIBRE' ? (
                      <div className="space-y-2 mt-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Respuestas Cualitativas ({st.respuestasLibres.length}):
                        </label>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                          {st.respuestasLibres.map((respText: string, rIdx: number) => (
                            <div key={rIdx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700 italic">
                              "{respText}"
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 mt-3">
                        {Object.entries(st.conteoOpciones || {}).map(([opName, count]: [string, any], oIdx: number) => {
                          const pct = resultadosModal.totalRespuestas > 0
                            ? Math.round((count / resultadosModal.totalRespuestas) * 100)
                            : 0;
                          return (
                            <div key={oIdx} className="space-y-1">
                              <div className="flex justify-between text-xs font-semibold text-slate-700">
                                <span>{opName}</span>
                                <span className="font-bold text-slate-900">{count} ({pct}%)</span>
                              </div>
                              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
