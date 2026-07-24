import React, { useEffect, useState } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';

export const CyberDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<{
    totalEvents: number;
    totalClicks: number;
    fallRate: string;
    recentEvents: any[];
  }>({
    totalEvents: 0,
    totalClicks: 0,
    fallRate: '0.0%',
    recentEvents: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const data = await api.getCyberMetrics();
      if (data && data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Error al cargar métricas de ciberseguridad:', err);
    } finally {
      setLoading(false);
    }
  };

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
              Eventos Registrados
            </div>
            <div className="text-5xl font-black text-white">{loading ? '...' : metrics.totalEvents}</div>
            <p className="text-slate-400 text-sm mt-2">Registros de interacción</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 text-amber-500">
            <Icons.AlertTriangle className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-amber-400 mb-4 font-bold text-sm uppercase tracking-wider">
              <Icons.AlertTriangle className="w-5 h-5" />
              Tasa de Clics (Vulnerabilidad)
            </div>
            <div className="text-5xl font-black text-white">{loading ? '...' : metrics.fallRate}</div>
            <p className="text-slate-400 text-sm mt-2">Interacciones registradas</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 text-emerald-500">
            <Icons.BookOpen className="w-24 h-24" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-emerald-400 mb-4 font-bold text-sm uppercase tracking-wider">
              <Icons.BookOpen className="w-5 h-5" />
              Total Clics Capturados
            </div>
            <div className="text-5xl font-black text-white">{loading ? '...' : metrics.totalClicks}</div>
            <p className="text-slate-400 text-sm mt-2">Usuarios en concientización</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6">
        <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-wider">Actividad Reciente en Tiempo Real</h3>
        {loading ? (
          <p className="text-slate-500 text-sm text-center py-6">Cargando datos reales de PostgreSQL...</p>
        ) : metrics.recentEvents?.length === 0 ? (
          <div className="text-center p-10 text-slate-500">
            <Icons.Activity className="w-10 h-10 mx-auto mb-4 opacity-50" />
            <p>Aún no hay interacciones registradas. Crea y envía tu primera jornada desde la pestaña <strong>PHISHING</strong>.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {metrics.recentEvents.map((evt, idx) => (
              <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-sm">
                <div>
                  <span className="font-bold text-white block">{evt.user_email}</span>
                  <span className="text-xs text-slate-400">Jornada: {evt.campaign_title || 'General'} — {new Date(evt.created_at).toLocaleString()}</span>
                </div>
                <span className="px-3 py-1 bg-amber-500/10 text-amber-400 rounded-full font-mono text-xs font-bold">
                  {evt.event_type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CyberDashboard;
