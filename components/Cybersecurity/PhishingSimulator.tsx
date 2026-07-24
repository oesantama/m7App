import React, { useEffect, useState } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface PhishingSimulatorProps {
  currentUser?: {
    roleId?: string;
    role_id?: string;
    email?: string;
  };
}

export const PhishingSimulator: React.FC<PhishingSimulatorProps> = ({ currentUser }) => {
  const isSuperAdmin =
    currentUser?.roleId === 'ROL-01' ||
    currentUser?.role_id === 'ROL-01' ||
    currentUser?.email?.toLowerCase() === 'directorti@millasiete.com';

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedStats, setSelectedStats] = useState<any>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [title, setTitle] = useState('Jornada Preventiva de Ciberseguridad BASC V6-2022');
  const [subject, setSubject] = useState('[Milla Siete TI] Comunicación Oficial: Verificación de Seguridad');
  const [bodyHtml, setBodyHtml] = useState('<p>Estimado colaborador,</p><p>En cumplimiento con el estándar de ciberseguridad BASC V6-2022, le solicitamos realizar la verificación de concientización preventiva.</p><p>Por favor haga clic en el siguiente enlace para completar la actividad:</p>');
  const [targetGroup, setTargetGroup] = useState('TODOS');

  useEffect(() => {
    if (isSuperAdmin) {
      loadCampaigns();
    }
  }, [isSuperAdmin]);

  const loadCampaigns = async () => {
    try {
      const data = await api.getCyberCampaigns();
      if (data && data.success) setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Error cargando campañas:', err);
    }
  };

  const loadStats = async (campaignId: number) => {
    setLoading(true);
    setSelectedCampaignId(campaignId);
    try {
      const data = await api.getCyberCampaignStats(campaignId);
      if (data && data.success) {
        setSelectedStats(data);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      toast.error('Error al cargar trazabilidad');
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingCampaignId(null);
    setTitle('Jornada Preventiva de Ciberseguridad BASC V6-2022');
    setSubject('[Milla Siete TI] Comunicación Oficial: Verificación de Seguridad');
    setBodyHtml('<p>Estimado colaborador,</p><p>En cumplimiento con el estándar de ciberseguridad BASC V6-2022, le solicitamos realizar la verificación de concientización preventiva.</p><p>Por favor haga clic en el siguiente enlace para completar la actividad:</p>');
    setTargetGroup('TODOS');
    setShowModal(true);
  };

  const openEditModal = (c: any) => {
    setEditingCampaignId(c.id);
    setTitle(c.title);
    setSubject(c.subject);
    setBodyHtml(c.body_html || '');
    setTargetGroup(c.target_group || 'TODOS');
    setShowModal(true);
  };

  const handleSaveCampaign = async () => {
    if (!title || !subject) {
      toast.error('Campos Incompletos', { description: 'Título y Asunto son requeridos.' });
      return;
    }

    try {
      if (editingCampaignId) {
        const data = await api.updateCyberCampaign(editingCampaignId, { title, subject, bodyHtml, targetGroup });
        if (data && data.success) {
          toast.success('Jornada Actualizada', { description: 'Los correos y contenido han sido actualizados.' });
          setShowModal(false);
          loadCampaigns();
        }
      } else {
        const data = await api.createCyberCampaign({ title, subject, bodyHtml, targetGroup });
        if (data && data.success) {
          toast.success('Jornada Creada', { description: 'La jornada ha sido registrada correctamente.' });
          setShowModal(false);
          loadCampaigns();
        }
      }
    } catch (err: any) {
      console.error('Error al guardar jornada:', err);
      toast.error('Error al guardar', { description: err.message });
    }
  };

  const handleDeleteCampaign = async (campaignId: number) => {
    if (!confirm('¿Estás seguro de eliminar esta jornada y sus registros?')) return;
    try {
      const data = await api.deleteCyberCampaign(campaignId);
      if (data && data.success) {
        toast.success('Jornada Eliminada');
        if (selectedCampaignId === campaignId) {
          setSelectedStats(null);
          setSelectedCampaignId(null);
        }
        loadCampaigns();
      }
    } catch (err: any) {
      toast.error('Error al eliminar', { description: err.message });
    }
  };

  const [sendingCampaignId, setSendingCampaignId] = useState<number | null>(null);

  const handleSendCampaign = async (campaignId: number) => {
    setSendingCampaignId(campaignId);
    try {
      const data = await api.sendCyberCampaign(campaignId);
      if (data && data.success) {
        toast.success('Envío Exitoso', {
          description: data.message || 'Jornada enviada correctamente.',
          duration: 5000
        });
        loadCampaigns();
        if (selectedCampaignId === campaignId) {
          loadStats(campaignId);
        }
      }
    } catch (err: any) {
      console.error('Error al enviar campaña:', err);
      toast.error('Error de Envío', {
        description: err.message || 'No se pudo enviar la jornada.'
      });
    } finally {
      setSendingCampaignId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-10 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-500">
          <Icons.Shield className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Acceso Restringido al SuperAdmin</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Este módulo está reservado exclusivamente para la Dirección de TI. No tienes permisos de SuperAdmin.
        </p>
      </div>
    );
  }

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="p-6 md:p-10 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Concientización & Métricas de Ciberseguridad</h2>
          <p className="text-slate-400 text-sm">Panel exclusivo del SuperAdmin (BASC V6-2022).</p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/20"
        >
          <Icons.Plus className="w-4 h-4" />
          Nueva Jornada
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LISTA DE CAMPAÑAS */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Jornadas Registradas</h3>
          {campaigns.length === 0 ? (
            <p className="text-slate-500 text-sm">No hay jornadas creadas.</p>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const isSelected = c.id === selectedCampaignId;
                return (
                  <div
                    key={c.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                      isSelected
                        ? 'bg-slate-800/80 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="space-y-1 overflow-hidden max-w-full">
                      <h4 className="font-bold text-white text-sm truncate">{c.title}</h4>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                          c.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {c.status}
                        </span>
                        <span className="text-slate-400 text-[11px] truncate max-w-[200px]">
                          Destinatarios: <strong className="text-slate-200">{c.target_group || 'TODOS'}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => openEditModal(c)}
                        title="Editar lista de correos / contenido"
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs"
                      >
                        <Icons.Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleSendCampaign(c.id)}
                        disabled={sendingCampaignId === c.id}
                        title="Enviar / Re-enviar correos"
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all"
                      >
                        {sendingCampaignId === c.id ? (
                          <>
                            <Icons.Loader className="w-3.5 h-3.5 animate-spin" />
                            <span>Enviando...</span>
                          </>
                        ) : (
                          <>
                            <Icons.Mail className="w-3.5 h-3.5" />
                            <span>{c.status === 'SENT' ? 'Re-enviar' : 'Enviar'}</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => loadStats(c.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        Ver Registro
                      </button>

                      <button
                        onClick={() => handleDeleteCampaign(c.id)}
                        title="Eliminar jornada"
                        className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg text-xs"
                      >
                        <Icons.Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* REGISTRO DE EVENTOS */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white">Registro de Interacción en Tiempo Real</h3>
            {selectedCampaign && (
              <span className="text-xs bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1 rounded-full font-mono">
                Jornada #{selectedCampaign.id}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm py-8 text-center">Cargando trazabilidad desde PostgreSQL...</p>
          ) : selectedStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-800 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Total Accesos (Clics):</span>
                  <span className="text-xl font-black text-amber-400">
                    {selectedStats.recentEvents?.length || 0}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Estado del Envío:</span>
                  <span className="text-xl font-black text-emerald-400">
                    {selectedCampaign?.status || 'ACTIVO'}
                  </span>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {!selectedStats.recentEvents || selectedStats.recentEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    <Icons.Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No hay interacciones registradas aún para esta jornada.</p>
                  </div>
                ) : (
                  selectedStats.recentEvents.map((e: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-950 rounded-xl text-xs flex justify-between items-center border border-slate-800">
                      <div>
                        <span className="font-bold text-amber-400 block">{e.user_email}</span>
                        <span className="text-slate-500 text-[11px]">
                          {new Date(e.created_at).toLocaleString()} {e.ip_address ? `— IP: ${e.ip_address}` : ''}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 font-mono font-bold text-[10px]">
                        {e.event_type}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Icons.Shield className="w-10 h-10 mx-auto opacity-30 text-slate-400" />
              <p className="text-sm">Selecciona una jornada y haz clic en <strong>Ver Registro</strong> para desplegar la trazabilidad.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold text-white">
                {editingCampaignId ? 'Editar Jornada' : 'Crear Jornada de Concientización'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white p-1">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Título de la Jornada</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Jornada Preventiva Q3 BASC"
                className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-2.5 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Asunto del Correo</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Actualización de Seguridad TI"
                className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-2.5 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Correos Destinatarios (Separados por coma)</label>
              <input
                type="text"
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value)}
                placeholder="ejemplo@millasiete.com, usuario2@millasiete.com (o deja TODOS)"
                className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-mono text-amber-300"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Puedes agregar o quitar correos electrónicos en cualquier momento.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Contenido Informativo (HTML / Texto)</label>
              <textarea
                rows={4}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="Estimado colaborador, le invitamos a revisar las nuevas políticas..."
                className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-2.5 rounded-xl text-sm resize-none font-mono text-xs"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-400">
                Cancelar
              </button>
              <button onClick={handleSaveCampaign} className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-red-500/20">
                {editingCampaignId ? 'Guardar Cambios' : 'Guardar Jornada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhishingSimulator;
