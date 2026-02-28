import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { User } from '../types';
import { toast } from 'sonner';

interface Lesson {
  id: string;
  title: string;
  content?: string;
  video_url?: string;
  resource_url?: string;
  order: number;
  progress_status?: 'in_progress' | 'completed';
  finished_at?: string;
}

interface Course {
  id: string;
  category_id: string;
  title: string;
  description: string;
  cover_image?: string;
  level: number;
  lessons?: Lesson[];
}

interface Category {
  id: string;
  name: string;
  description: string;
}

interface CentroCapacitacionesProps {
  user: User;
}

const CentroCapacitaciones: React.FC<CentroCapacitacionesProps> = ({ user }) => {
  const [view, setView] = useState<'home' | 'course' | 'lesson'>('home');
  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [activeTab, setActiveTab] = useState<1 | 2>(1); // 1: Sistema, 2: Usuarios
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, [activeTab]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [catsRes, coursesRes] = await Promise.all([
        api.getTrainingCategories(),
        api.getTrainingCourses(undefined, activeTab)
      ]);
      setCategories(catsRes);
      setCourses(coursesRes);
    } catch (err) {
      toast.error("Error al cargar capacitaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCourse = async (course: Course) => {
    setLoading(true);
    try {
      const fullCourse = await api.getCourseWithLessons(course.id, user.id);
      setSelectedCourse(fullCourse);
      setView('course');
    } catch (err) {
      toast.error("Error al cargar detalles del curso");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setView('lesson');
    if (lesson.progress_status !== 'completed') {
      api.updateTrainingProgress({ user_id: user.id, lesson_id: lesson.id, status: 'in_progress' }).catch(console.error);
    }
  };

  const completeLesson = async (lessonId: string) => {
    try {
      await api.updateTrainingProgress({ user_id: user.id, lesson_id: lessonId, status: 'completed' });
      toast.success("¡Lección completada!");
      if (selectedCourse) {
        // Recargar para ver el check
        const updated = await api.getCourseWithLessons(selectedCourse.id, user.id);
        setSelectedCourse(updated);
      }
    } catch (err) {
      toast.error("Error al guardar progreso");
    }
  };

  const renderHome = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Centro de Capacitación</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Fortalece tus habilidades en Milla 7</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200">
          <button 
            onClick={() => setActiveTab(1)} 
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === 1 ? 'bg-white shadow-md text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Icons.Award className="w-4 h-4" /> Oficiales (Sistema)
          </button>
          <button 
            onClick={() => setActiveTab(2)} 
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === 2 ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Icons.Users className="w-4 h-4" /> Comunidad (Usuarios)
          </button>
        </div>
      </div>

      {activeTab === 2 ? (
        <div className="bg-white/50 border-2 border-dashed border-indigo-100 rounded-[2.5rem] p-4 lg:p-32 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-400 animate-pulse">
            <Icons.Settings className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase">Módulo en Construcción</h3>
            <p className="text-sm font-bold text-slate-400 mt-2 max-w-sm">Pronto podrás crear tus propias capacitaciones y compartirlas con el equipo.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="bg-slate-50 rounded-[2rem] h-64 animate-pulse border border-slate-100"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <div 
              key={course.id} 
              onClick={() => handleSelectCourse(course)}
              className="group bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden cursor-pointer hover:shadow-2xl hover:scale-[1.02] transition-all"
            >
              <div className="h-40 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                {course.cover_image ? (
                  <img src={course.cover_image} alt={course.title} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                  <div className="text-emerald-500/20"><Icons.Book className="w-24 h-24" /></div>
                )}
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 bg-emerald-500 text-slate-900 text-[8px] font-black uppercase rounded-lg shadow-lg">Nivel {course.level}</span>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <h3 className="text-base font-black text-slate-900 uppercase leading-tight line-clamp-2">{course.title}</h3>
                <p className="text-[11px] font-medium text-slate-500 line-clamp-3 leading-relaxed italic">{course.description}</p>
                <div className="pt-4 flex justify-between items-center border-t border-slate-50">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Icons.List className="w-3.5 h-3.5" /> 12 Lecciones
                  </span>
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center group-hover:bg-emerald-500 transition-colors">
                    <Icons.ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {courses.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase tracking-widest">No hay cursos disponibles aún</div>
          )}
        </div>
      )}
    </div>
  );

  const renderCourse = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <button onClick={() => setView('home')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors">
        <Icons.CornerDownLeft className="w-4 h-4" /> Volver al catálogo
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="relative z-10 space-y-4">
              <span className="px-4 py-1.5 bg-emerald-500 text-slate-900 text-[9px] font-black uppercase rounded-xl">Curso Oficial Milla 7</span>
              <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-tighter leading-none">{selectedCourse?.title}</h1>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xl italic">{selectedCourse?.description}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Contenido del Curso</h4>
            <div className="grid grid-cols-1 gap-3">
              {selectedCourse?.lessons?.map((lesson, idx) => (
                <div 
                  key={lesson.id}
                  onClick={() => handleSelectLesson(lesson)}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-emerald-200 hover:shadow-lg transition-all"
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${lesson.progress_status === 'completed' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-300 group-hover:bg-slate-900 group-hover:text-white'} transition-all`}>
                      {lesson.progress_status === 'completed' ? <Icons.CheckCircle className="w-6 h-6" /> : (idx + 1).toString().padStart(2, '0')}
                    </div>
                    <div>
                      <h5 className="text-sm font-black text-slate-900 uppercase group-hover:text-emerald-600 transition-colors uppercase">{lesson.title}</h5>
                      <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2 mt-1 uppercase">
                        {lesson.video_url ? <Icons.Play className="w-3 h-3" /> : <Icons.Book className="w-3 h-3" />}
                        {lesson.video_url ? 'Video Clase' : 'Lectura Técnica'}
                      </p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                    <Icons.ChevronRight className="w-5 h-5 text-emerald-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Tu Progreso</h4>
            <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden">
               <div 
                 className="absolute top-0 left-0 h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(16,185,129,0.5)]" 
                 style={{ width: `${(selectedCourse?.lessons?.filter(l => l.progress_status === 'completed').length || 0) / (selectedCourse?.lessons?.length || 1) * 100}%` }}
               ></div>
            </div>
            <div className="flex justify-between text-[11px] font-black uppercase italic">
              <span className="text-slate-400">Completado</span>
              <span className="text-emerald-600">
                {Math.round(((selectedCourse?.lessons?.filter(l => l.progress_status === 'completed').length || 0) / (selectedCourse?.lessons?.length || 1)) * 100)}%
              </span>
            </div>
            {selectedCourse?.lessons?.every(l => l.progress_status === 'completed') && (
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center space-y-2 animate-bounce">
                <Icons.Award className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-[10px] font-black text-emerald-700 uppercase">¡Felicidades! Has terminado este curso</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderLesson = () => (
    <div className="space-y-6 animate-in zoom-in-95 duration-500">
      <div className="flex justify-between items-center">
        <button onClick={() => setView('course')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors">
          <Icons.CornerDownLeft className="w-4 h-4" /> Volver al curso
        </button>
        <button 
          onClick={() => selectedLesson && completeLesson(selectedLesson.id)}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg flex items-center gap-2 ${selectedLesson?.progress_status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-105 active:scale-95'}`}
        >
          {selectedLesson?.progress_status === 'completed' ? <><Icons.CheckCircle className="w-4 h-4" /> Completada</> : 'Marcar como completada'}
        </button>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[70vh] flex flex-col">
        {selectedLesson?.video_url && (
          <div className="aspect-video bg-black w-full relative">
             <iframe 
                className="w-full h-full" 
                src={selectedLesson.video_url} 
                title={selectedLesson.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
              ></iframe>
          </div>
        )}
        <div className="p-10 lg:p-16 space-y-8 flex-1">
          <div className="space-y-2 border-b border-slate-100 pb-8">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Lección {selectedLesson?.order}</span>
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 uppercase tracking-tight">{selectedLesson?.title}</h2>
          </div>
          
          <div className="prose prose-slate max-w-none text-slate-600 font-medium leading-loose whitespace-pre-wrap italic text-lg">
            {selectedLesson?.content || 'Esta lección es exclusivamente visual. Por favor visualiza el video adjunto.'}
          </div>

          {selectedLesson?.resource_url && (
            <div className="pt-8">
              <a 
                href={selectedLesson.resource_url} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase hover:bg-emerald-600 hover:shadow-xl transition-all"
              >
                <Icons.Paperclip className="w-4 h-4" /> Descargar Material de Apoyo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8">
      {view === 'home' && renderHome()}
      {view === 'course' && renderCourse()}
      {view === 'lesson' && renderLesson()}
    </div>
  );
};

export default CentroCapacitaciones;
