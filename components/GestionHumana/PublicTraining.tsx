import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast, Toaster } from 'sonner';

const PublicTraining: React.FC = () => {
  const [step, setStep] = useState<'login' | 'intro' | 'mision' | 'finished'>('login');
  const [cedula, setCedula] = useState('');
  const [capId, setCapId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [userAnswers, setUserAnswers] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCapId(params.get('id'));
  }, []);

  const handleValidate = async () => {
    if (!cedula || !capId) return;
    setLoading(true);
    try {
      const res = await api.getPublicCapacitacion(capId, cedula);
      setData(res);
      if (res.asignacion.estado === 'COMPLETADO') {
        setStep('finished');
      } else {
        setStep('intro');
      }
    } catch (err: any) {
      toast.error(err.message || "No tienes acceso a esta misión");
    } finally {
      setLoading(false);
    }
  };

  const startMission = () => {
    setStep('mision');
    setCurrentLevel(0);
  };

  const handleNext = async (answer: any) => {
    const newAnswers = [...userAnswers, answer];
    setUserAnswers(newAnswers);
    
    if (currentLevel < data.preguntas.length - 1) {
      setCurrentLevel(currentLevel + 1);
    } else {
      // Finalizar misión
      setLoading(true);
      try {
        const calif = 100; // Lógica simple para demo
        await api.submitCapacitacionResult({
          asignacion_id: data.asignacion.id,
          calificacion: calif,
          progreso: 100
        });
        setStep('finished');
        toast.success("¡MISIÓN COMPLETADA!", { description: "Has ganado " + data.asignacion.puntos_premio + " XP" });
      } catch (err) {
        toast.error("Error al guardar resultados");
      } finally {
        setLoading(false);
      }
    }
  };

  if (step === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
        <Toaster position="top-center" richColors theme="dark" />
        {/* Background FX */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-48 -mt-48 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -ml-48 -mb-48 animate-pulse"></div>
        
        <div className="w-full max-w-md space-y-12 relative z-10">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] mx-auto flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)] animate-bounce">
              <Icons.Target className="text-slate-950 w-10 h-10" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase tracking-tighter">ORBITM7 IQ</h1>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Módulo de Entrenamiento Externo</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-2xl p-10 rounded-[3rem] border border-white/10 shadow-2xl space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-4">Ingresa tu Cédula</label>
              <input 
                type="text" 
                className="w-full bg-slate-950/50 border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-black text-center text-lg outline-none focus:border-emerald-500 focus:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
                placeholder="12345678"
                value={cedula}
                onChange={e => setCedula(e.target.value)}
              />
            </div>
            <button 
              onClick={handleValidate}
              disabled={loading}
              className="w-full py-5 bg-emerald-500 text-slate-950 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-400 hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.2)]"
            >
              {loading ? 'Verificando...' : 'Iniciar Desafío'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-12 md:p-20 rounded-[4rem] border border-white/10 text-center space-y-10 shadow-2xl">
            <div className="space-y-4">
              <span className="px-5 py-2 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">Misión Disponible</span>
              <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">{data.asignacion.titulo}</h1>
              <p className="text-slate-400 text-lg font-medium leading-relaxed italic">{data.asignacion.descripcion}</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5 text-left">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Premio Misión</p>
                <h4 className="text-2xl font-black text-emerald-500">{data.asignacion.puntos_premio} XP</h4>
              </div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5 text-left">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Niveles</p>
                <h4 className="text-2xl font-black text-blue-500">{data.preguntas.length} DESAFÍOS</h4>
              </div>
            </div>

            <button 
              onClick={startMission}
              className="w-full py-6 bg-white text-slate-950 rounded-3xl font-black uppercase text-sm tracking-[0.2em] hover:bg-emerald-500 transition-all shadow-xl"
            >
              ACEPTAR MISIÓN
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'mision') {
    const q = data.preguntas[currentLevel];
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col p-6 lg:p-12">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col space-y-10">
          {/* Progress Bar */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <h2 className="text-white font-black uppercase text-sm tracking-widest">Nivel {(currentLevel + 1).toString().padStart(2, '0')} / {data.preguntas.length.toString().padStart(2, '0')}</h2>
              <span className="text-emerald-500 font-black text-xs uppercase">{Math.round((currentLevel / data.preguntas.length) * 100)}%</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-700" style={{ width: `${(currentLevel / data.preguntas.length) * 100}%` }}></div>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-[4rem] shadow-2xl p-10 md:p-20 flex flex-col justify-center items-center text-center space-y-12 animate-in slide-in-from-right-10 duration-500">
            <div className="space-y-6">
              <div className="w-20 h-20 bg-slate-100 rounded-[2rem] mx-auto flex items-center justify-center text-slate-900 shadow-inner border border-slate-200">
                 {q.tipo === 'puzzle' ? <Icons.Puzzle className="w-10 h-10" /> : <Icons.HelpCircle className="w-10 h-10" />}
              </div>
              <h3 className="text-2xl md:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">{q.pregunta}</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Responde correctamente para avanzar de nivel</p>
            </div>

            {/* Renderización dinámica del tipo de pregunta para Demo */}
            <div className="w-full max-w-lg grid grid-cols-1 gap-4">
              {q.tipo === 'falso_verdadero' ? (
                <>
                  <button onClick={() => handleNext('Verdadero')} className="py-6 bg-slate-900 text-white rounded-3xl font-black uppercase hover:bg-emerald-600 transition-all">VERDADERO</button>
                  <button onClick={() => handleNext('Falso')} className="py-6 bg-slate-100 text-slate-900 rounded-3xl font-black uppercase hover:bg-rose-500 hover:text-white transition-all">FALSO</button>
                </>
              ) : q.tipo === 'abierta' ? (
                <div className="space-y-4">
                  <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 font-bold text-slate-900 outline-none focus:border-slate-900 h-32" placeholder="Escribe tu respuesta aquí..."></textarea>
                  <button onClick={() => handleNext('text')} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase hover:bg-emerald-600 transition-all">ENVIAR RESPUESTA</button>
                </div>
              ) : (
                <>
                  <button onClick={() => handleNext(1)} className="py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-slate-900 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left px-10 relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-[10px] group-hover:bg-emerald-500 group-hover:border-emerald-500 group-hover:text-white transition-all">A</span>
                    Opción de Respuesta Gamificada Alpha
                  </button>
                  <button onClick={() => handleNext(2)} className="py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-slate-900 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left px-10 relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-[10px] group-hover:bg-emerald-500 group-hover:border-emerald-500 group-hover:text-white transition-all">B</span>
                    Opción de Respuesta Gamificada Beta
                  </button>
                  <button onClick={() => handleNext(3)} className="py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold text-slate-900 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left px-10 relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-[10px] group-hover:bg-emerald-500 group-hover:border-emerald-500 group-hover:text-white transition-all">C</span>
                    Opción de Respuesta Gamificada Delta
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'finished') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl text-center space-y-10 animate-in zoom-in-95 duration-700">
           <div className="w-32 h-32 bg-emerald-500 rounded-[2.5rem] mx-auto flex items-center justify-center text-slate-950 shadow-[0_0_60px_rgba(16,185,129,0.4)] relative">
              <Icons.Award className="w-16 h-16" />
              <div className="absolute inset-0 border-4 border-white/20 rounded-[2.5rem] animate-ping"></div>
           </div>
           <div className="space-y-4">
             <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter">¡MISIÓN CUMPLIDA!</h2>
             <p className="text-emerald-500 text-xl font-black uppercase tracking-[0.3em]">Has ganado {data?.asignacion.puntos_premio || 100} XP</p>
           </div>
           <div className="bg-white/5 p-10 rounded-[3rem] border border-white/10 space-y-6">
             <p className="text-slate-400 text-lg font-medium leading-relaxed italic">Tu proceso de {data?.asignacion.tipo_proceso || 'ENTRENAMIENTO'} ha sido registrado exitosamente en el núcleo OrbitM7 IQ. Ya puedes cerrar esta ventana.</p>
             <button onClick={() => window.close()} className="px-10 py-5 bg-white text-slate-950 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-500 transition-all">FINALIZAR SESIÓN</button>
           </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PublicTraining;
