import React, { useState } from 'react';
import { Icons } from '../../constants';

const TrainingPlans: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-6 md:p-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Capacitaciones</h2>
          <p className="text-slate-400 text-sm">Gestiona los planes de entrenamiento en seguridad para tus empleados.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
        >
          <Icons.Plus className="w-4 h-4" />
          Nuevo Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Placeholder Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 group hover:border-emerald-500/50 transition-colors cursor-pointer">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Icons.Shield className="w-6 h-6" />
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-widest">
              General
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Seguridad Básica de la Información</h3>
          <p className="text-sm text-slate-400 mb-6">Curso obligatorio anual sobre manejo de contraseñas y detección de correos maliciosos.</p>
          <div className="flex items-center justify-between text-sm">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">45</div>
            </div>
            <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
              Ver Detalles <Icons.ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
              <h3 className="text-xl font-bold text-white">Subir Capacitación</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <Icons.X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Título del Plan</label>
                <input type="text" placeholder="Ej: Prevención de Ransomware" className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Archivo (PDF / Video)</label>
                <div className="border-2 border-dashed border-slate-800 rounded-xl p-6 text-center hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <Icons.Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Clic para subir el material de estudio</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Roles Requeridos</label>
                <select className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors appearance-none">
                  <option>Todos los empleados</option>
                  <option>Área Financiera</option>
                  <option>Área Administrativa</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/80 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-300 hover:text-white transition-colors">
                Cancelar
              </button>
              <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all">
                Guardar Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingPlans;
