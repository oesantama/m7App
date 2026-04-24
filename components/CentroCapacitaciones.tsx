import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { User, MasterRecord } from '../types';
import { toast } from 'sonner';

interface Question {
  id?: number;
  tipo: 'seleccion_unica' | 'seleccion_multiple' | 'imagen' | 'abierta' | 'falso_verdadero' | 'drag_drop' | 'puzzle';
  pregunta: string;
  config_json: any;
}

interface Capacitacion {
  id?: number;
  titulo: string;
  descripcion: string;
  puntos_premio: number;
  estado: 'BORRADOR' | 'ACTIVO' | 'CERRADO';
  preguntas?: Question[];
}

interface Asignacion {
  id: number;
  capacitacion_id: number;
  cedula: string;
  colaborador_nombre: string;
  area_nombre: string;
  tipo_proceso: 'INDUCCION' | 'REINDUCCION';
  desde: string;
  hasta: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'FALLIDO';
  progreso: number;
  calificacion: number;
  fecha_completado: string;
}

const CentroCapacitaciones: React.FC<{ user: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<1 | 2>(1); // 1: Misiones, 2: Radar Seguimiento
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);
  const [selectedCap, setSelectedCap] = useState<Capacitacion | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Tracking state
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [trackingCapId, setTrackingCapId] = useState<number | null>(null);

  // Assignment Modal state
  const [showAsignar, setShowAsignar] = useState(false);
  const [personal, setPersonal] = useState<any[]>([]);
  const [selectedCedulas, setSelectedCedulas] = useState<string[]>([]);
  const [asigDates, setAsigDates] = useState({ desde: '', hasta: '' });

  useEffect(() => {
    loadCapacitaciones();
    loadPersonal();
  }, []);

  const loadCapacitaciones = async () => {
    try {
      const data = await api.getCapacitaciones();
      setCapacitaciones(data);
    } catch (err) {
      toast.error("Error al cargar capacitaciones");
    }
  };

  const loadPersonal = async () => {
    try {
      const data = await api.getPersonal();
      setPersonal(data);
    } catch (err) {}
  };

  const handleSaveCap = async (cap: Capacitacion) => {
    setLoading(true);
    try {
      await api.saveCapacitacion(cap);
      toast.success("Misión guardada exitosamente");
      setShowEditor(false);
      loadCapacitaciones();
    } catch (err) {
      toast.error("Error al guardar capacitación");
    } finally {
      setLoading(false);
    }
  };

  const handleAsignar = async () => {
    if (!selectedCap?.id || selectedCedulas.length === 0) return;
    setLoading(true);
    try {
      await api.asignarCapacitacion({
        capacitacion_id: selectedCap.id,
        cedulas: selectedCedulas,
        desde: asigDates.desde,
        hasta: asigDates.hasta
      });
      toast.success("Personal asignado exitosamente");
      setShowAsignar(false);
      setSelectedCedulas([]);
    } catch (err) {
      toast.error("Error al asignar capacitación");
    } finally {
      setLoading(false);
    }
  };

  const loadTracking = async (capId: number) => {
    setTrackingCapId(capId);
    setLoading(true);
    try {
      const data = await api.getAsignacionesCapacitacion(capId);
      setAsignaciones(data);
    } catch (err) {
      toast.error("Error al cargar seguimiento");
    } finally {
      setLoading(false);
    }
  };

  const copyPublicLink = (capId: number) => {
    const url = `${window.location.origin}/publico/capacitacion?id=${capId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link público copiado al portapapeles");
  };

  return (
    <div className="p-6 md:p-10 space-y-8 animate-in fade-in duration-500 bg-slate-50 min-h-screen">
      {/* Header Gamificado */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-slate-900 rounded-[2rem] shadow-xl text-emerald-500">
            <Icons.Layout className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">LMS OrbitM7 IQ</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestión de Conocimiento Gamificado</p>
          </div>
        </div>

        <div className="flex bg-white p-2 rounded-[2rem] shadow-lg border border-slate-100">
          <button 
            onClick={() => setActiveTab(1)}
            className={`px-8 py-3 rounded-3xl text-[11px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === 1 ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Icons.Target className="w-4 h-4" /> Administrar Misiones
          </button>
          <button 
            onClick={() => setActiveTab(2)}
            className={`px-8 py-3 rounded-3xl text-[11px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === 2 ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Icons.Activity className="w-4 h-4" /> Radar de Seguimiento
          </button>
        </div>
      </div>

      {activeTab === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Tarjeta para Crear Nueva */}
          <div 
            onClick={() => { setSelectedCap({ titulo: '', descripcion: '', puntos_premio: 100, estado: 'BORRADOR', preguntas: [] }); setShowEditor(true); }}
            className="group h-full min-h-[300px] border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center gap-4 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all cursor-pointer"
          >
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-inner">
              <Icons.Plus className="w-10 h-10" />
            </div>
            <span className="text-sm font-black text-slate-400 group-hover:text-emerald-600 uppercase tracking-widest">Nueva Misión de Entrenamiento</span>
          </div>

          {capacitaciones.map(cap => (
            <div key={cap.id} className="bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="h-32 bg-slate-900 p-8 relative flex items-center justify-between overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                <div className="relative z-10">
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${cap.estado === 'ACTIVO' ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`}>
                    {cap.estado}
                  </span>
                  <h3 className="text-white font-black text-xl uppercase tracking-tighter mt-2">{cap.titulo}</h3>
                </div>
                <Icons.Target className="text-white/10 w-20 h-20 absolute -right-4 -bottom-4 group-hover:scale-110 transition-transform" />
              </div>
              <div className="p-8 space-y-6">
                <p className="text-xs text-slate-400 font-medium line-clamp-2 italic leading-relaxed">{cap.descripcion || 'Sin descripción detallada...'}</p>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span><Icons.Star className="inline w-4 h-4 mr-1 text-amber-500" /> {cap.puntos_premio} XP</span>
                  <span><Icons.Layers className="inline w-4 h-4 mr-1" /> {cap.preguntas?.length || 0} Niveles</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <button 
                    onClick={() => { setSelectedCap(cap); setShowEditor(true); }}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-100 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all"
                  >
                    <Icons.Edit className="w-4 h-4" /> Editar
                  </button>
                  <button 
                    onClick={() => { setSelectedCap(cap); setShowAsignar(true); }}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-lg"
                  >
                    <Icons.UserPlus className="w-4 h-4" /> Asignar
                  </button>
                </div>
                <button 
                  onClick={() => cap.id && copyPublicLink(cap.id)}
                  className="w-full py-3 border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all"
                >
                  <Icons.Link className="inline w-3 h-3 mr-2" /> Copiar Link Público
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 2 && (
        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500">
          <div className="p-8 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase">Radar de Seguimiento</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monitoreo en tiempo real de capacitaciones</p>
            </div>
            <select 
              className="bg-white border-2 border-slate-200 rounded-2xl px-6 py-3 text-[11px] font-black uppercase outline-none focus:border-slate-900"
              onChange={(e) => e.target.value && loadTracking(Number(e.target.value))}
              value={trackingCapId || ''}
            >
              <option value="">Selecciona Capacitación...</option>
              {capacitaciones.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
            </select>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Colaborador</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Proceso</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Estado</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Progreso</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Calificación</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {asignaciones.map(asig => (
                  <tr key={asig.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400">{asig.colaborador_nombre[0]}</div>
                        <div>
                          <p className="text-xs font-black text-slate-900 uppercase">{asig.colaborador_nombre}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{asig.cedula} • {asig.area_nombre}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${asig.tipo_proceso === 'INDUCCION' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                        {asig.tipo_proceso}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${asig.estado === 'COMPLETADO' ? 'bg-emerald-500' : asig.estado === 'PENDIENTE' ? 'bg-slate-300' : 'bg-amber-500'}`}></div>
                        <span className="text-[10px] font-black uppercase text-slate-600">{asig.estado}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="w-32 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${asig.progreso}%` }}></div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-xs font-black text-slate-900">{asig.calificacion || '—'}/100</span>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-[10px] font-bold text-slate-400">{asig.fecha_completado ? new Date(asig.fecha_completado).toLocaleDateString() : '—'}</p>
                    </td>
                  </tr>
                ))}
                {asignaciones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-slate-300 font-black uppercase tracking-widest italic">Selecciona una capacitación para ver el radar</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL EDITOR DE MISIONES */}
      {showEditor && selectedCap && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-12 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">Editor de Misiones IQ</h2>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Constructor de experiencias gamificadas</p>
              </div>
              <button onClick={() => setShowEditor(false)} className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                <Icons.X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-4">Título de la Misión</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                    placeholder="Ej: Inducción en Seguridad y Salud"
                    value={selectedCap.titulo}
                    onChange={e => setSelectedCap({...selectedCap, titulo: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-4">Premio (XP)</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                    value={selectedCap.puntos_premio}
                    onChange={e => setSelectedCap({...selectedCap, puntos_premio: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase border-b border-slate-100 pb-4 flex items-center gap-2">
                  <Icons.Layers className="w-5 h-5 text-emerald-500" /> Niveles de Desafío (Preguntas)
                </h3>
                
                <div className="space-y-6">
                  {(selectedCap.preguntas || []).map((q, idx) => (
                    <div key={idx} className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 space-y-4 relative group">
                      <div className="flex justify-between items-center">
                        <span className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black">{(idx + 1).toString().padStart(2, '0')}</span>
                        <div className="flex gap-2">
                          <select 
                            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-[9px] font-black uppercase"
                            value={q.tipo}
                            onChange={e => {
                              const newPreguntas = [...(selectedCap.preguntas || [])];
                              newPreguntas[idx].tipo = e.target.value as any;
                              setSelectedCap({...selectedCap, preguntas: newPreguntas});
                            }}
                          >
                            <option value="seleccion_unica">Selección Única</option>
                            <option value="seleccion_multiple">Selección Múltiple</option>
                            <option value="imagen">Validación Imagen</option>
                            <option value="abierta">Pregunta Abierta</option>
                            <option value="falso_verdadero">Falso / Verdadero</option>
                            <option value="drag_drop">Drag and Drop</option>
                            <option value="puzzle">Puzzle IQ</option>
                          </select>
                          <button 
                            onClick={() => {
                              const newPreguntas = (selectedCap.preguntas || []).filter((_, i) => i !== idx);
                              setSelectedCap({...selectedCap, preguntas: newPreguntas});
                            }}
                            className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
                          >
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <input 
                        type="text"
                        className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500"
                        placeholder="Escribe la consigna del desafío..."
                        value={q.pregunta}
                        onChange={e => {
                          const newPreguntas = [...(selectedCap.preguntas || [])];
                          newPreguntas[idx].pregunta = e.target.value;
                          setSelectedCap({...selectedCap, preguntas: newPreguntas});
                        }}
                      />
                      {/* Sub-configuración según tipo iría aquí */}
                      <p className="text-[9px] font-bold text-slate-400 uppercase italic">Configuración de respuestas activada para tipo: {q.tipo}</p>
                    </div>
                  ))}
                  <button 
                    onClick={() => setSelectedCap({...selectedCap, preguntas: [...(selectedCap.preguntas || []), { tipo: 'seleccion_unica', pregunta: '', config_json: {} }]})}
                    className="w-full py-4 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-[2.5rem] text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                  >
                    + Agregar Nuevo Nivel de Desafío
                  </button>
                </div>
              </div>
            </div>

            <div className="p-8 md:p-12 border-t border-slate-100 flex justify-end gap-4 bg-slate-50">
              <button 
                onClick={() => setShowEditor(false)}
                className="px-8 py-4 bg-white border-2 border-slate-200 rounded-[2rem] text-[11px] font-black uppercase hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleSaveCap(selectedCap)}
                className="px-10 py-4 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl"
              >
                {loading ? 'Guardando...' : 'Publicar Misión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR */}
      {showAsignar && selectedCap && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-slate-100 text-center">
              <h2 className="text-2xl font-black uppercase text-slate-900">Asignación Inteligente</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Misión: {selectedCap.titulo}</p>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-4">Desde</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-bold text-slate-900"
                    onChange={e => setAsigDates({...asigDates, desde: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-4">Hasta</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 font-bold text-slate-900"
                    onChange={e => setAsigDates({...asigDates, hasta: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase px-4">Seleccionar Personal</label>
                <div className="max-h-[300px] overflow-y-auto border-2 border-slate-100 rounded-[2rem] p-4 space-y-2">
                  {personal.map(p => (
                    <div 
                      key={p.cedula}
                      onClick={() => setSelectedCedulas(prev => prev.includes(p.cedula) ? prev.filter(c => c !== p.cedula) : [...prev, p.cedula])}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${selectedCedulas.includes(p.cedula) ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}
                    >
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedCedulas.includes(p.cedula) ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-200'}`}>
                        {selectedCedulas.includes(p.cedula) && <Icons.Check className="w-4 h-4 text-white" />}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase">{p.nombre}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{p.cedula} • {p.cargo_nombre}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-10 border-t border-slate-100 flex justify-end gap-4 bg-slate-50">
              <button onClick={() => setShowAsignar(false)} className="px-8 py-4 bg-white border-2 border-slate-200 rounded-[2rem] text-[11px] font-black uppercase">Cancelar</button>
              <button 
                onClick={handleAsignar}
                className="px-10 py-4 bg-slate-900 text-white rounded-[2rem] text-[11px] font-black uppercase hover:bg-emerald-600 transition-all shadow-xl"
              >
                {loading ? 'Procesando...' : `Asignar a ${selectedCedulas.length} Colaboradores`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CentroCapacitaciones;
