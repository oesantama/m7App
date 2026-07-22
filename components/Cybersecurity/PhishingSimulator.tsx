import React, { useState } from 'react';
import { Icons } from '../../constants';

const PhishingSimulator: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <div className="p-6 md:p-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Campañas de Phishing</h2>
          <p className="text-slate-400 text-sm">Crea simulacros de ataques para evaluar la vulnerabilidad de tu equipo.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/20"
        >
          <Icons.Plus className="w-4 h-4" />
          Nueva Campaña
        </button>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-10 text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-500">
            <Icons.Mail className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No hay campañas activas</h3>
          <p className="text-slate-400">Crea tu primera campaña para empezar a simular ataques controlados.</p>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
              <h3 className="text-xl font-bold text-white">Crear Simulación de Phishing</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <Icons.X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nombre de la Campaña</label>
                <input type="text" placeholder="Ej: Simulación Banco Falso Q3" className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-red-500 transition-colors" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Remitente (Falso)</label>
                  <input type="text" placeholder="Ej: Soporte IT" className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-red-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email Remitente</label>
                  <input type="email" placeholder="soporte@m7-seguridad.com" className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-red-500 transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Asunto del Correo</label>
                <input type="text" placeholder="Urgente: Actualización de Contraseña" className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-red-500 transition-colors" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cuerpo del Mensaje (HTML/Texto)</label>
                <textarea rows={4} placeholder="Su contraseña expirará en 24h. Haga clic aquí para renovarla..." className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-red-500 transition-colors resize-none"></textarea>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/80 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-300 hover:text-white transition-colors">
                Cancelar
              </button>
              <button className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/20 transition-all">
                Guardar y Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhishingSimulator;
