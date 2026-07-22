import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Icons } from '../../constants';

const CyberDashboard: React.FC = () => {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real scenario, we would aggregate across all campaigns
    // For now we just mock some high-level metrics
    setLoading(false);
  }, []);

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 text-blue-500">
            <Icons.Mail className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-blue-400 mb-4 font-bold text-sm uppercase tracking-wider">
              <Icons.Mail className="w-5 h-5" />
              Correos Simulados
            </div>
            <div className="text-5xl font-black text-white">1,248</div>
            <p className="text-slate-400 text-sm mt-2">Enviados este trimestre</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 text-amber-500">
            <Icons.AlertTriangle className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-amber-400 mb-4 font-bold text-sm uppercase tracking-wider">
              <Icons.AlertTriangle className="w-5 h-5" />
              Tasa de Caída
            </div>
            <div className="text-5xl font-black text-white">12.4%</div>
            <p className="text-slate-400 text-sm mt-2">Usuarios vulnerables (Click)</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 text-emerald-500">
            <Icons.BookOpen className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-emerald-400 mb-4 font-bold text-sm uppercase tracking-wider">
              <Icons.BookOpen className="w-5 h-5" />
              Capacitados
            </div>
            <div className="text-5xl font-black text-white">85%</div>
            <p className="text-slate-400 text-sm mt-2">Aprobaron test de seguridad</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6">
        <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-wider">Actividad Reciente</h3>
        <div className="text-center p-10 text-slate-500">
          <Icons.Activity className="w-10 h-10 mx-auto mb-4 opacity-50" />
          <p>Los gráficos de actividad estarán disponibles a medida que se desplieguen campañas.</p>
        </div>
      </div>
    </div>
  );
};

export default CyberDashboard;
