import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface ReturnsControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

const ReturnsControlModal: React.FC<ReturnsControlModalProps> = ({ isOpen, onClose, user }) => {
  const [returns, setReturns]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPendingReturns();
      setReturns(Array.isArray(data) ? data : []);
    } catch { setReturns([]); toast.error('Error al cargar devoluciones'); }
    finally { setLoading(false); }
  };

  const handleStatus = async (id: number, status: 'PROCESSED' | 'CANCELLED') => {
    setProcessing(id);
    try {
      await api.updateReturnStatus(id, { status, notes: notesMap[id] });
      toast.success(status === 'PROCESSED' ? 'Devolución procesada — artículos reingresados a bodega' : 'Devolución cancelada');
      setReturns(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      toast.error(e?.message || 'Error al actualizar');
    } finally { setProcessing(null); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center justify-between rounded-t-[2rem] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center">
              <Icons.Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">Control de Devoluciones</h3>
              <p className="text-[10px] font-bold text-slate-500">
                {returns.length} devolución{returns.length !== 1 ? 'es' : ''} pendiente{returns.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-slate-100 transition-all shadow-sm" title="Recargar">
              <Icons.RotateCcw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-slate-100 transition-all shadow-sm">
              <Icons.X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="text-center py-16">
              <span className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin inline-block" />
              <p className="text-xs font-black text-slate-400 uppercase mt-4">Cargando devoluciones...</p>
            </div>
          )}

          {!loading && returns.length === 0 && (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
              <Icons.CheckCircle className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
              <p className="text-xs font-black text-slate-400 uppercase">Sin devoluciones pendientes</p>
              <p className="text-[10px] text-slate-300 mt-1">Todas las devoluciones han sido procesadas</p>
            </div>
          )}

          {returns.map(ret => {
            const items: any[] = Array.isArray(ret.items) ? ret.items.filter((i: any) => i.sku) : [];
            const isExpanded = expanded === ret.id;
            const isProc = processing === ret.id;
            return (
              <div key={ret.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                {/* Card header */}
                <div
                  className="p-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-all"
                  onClick={() => setExpanded(isExpanded ? null : ret.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-black text-slate-900">#{ret.invoice_id}</span>
                      <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">PENDIENTE</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{ret.driver_name || ret.driver_id}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{ret.return_reason}</p>
                    <p className="text-[9px] text-slate-300 mt-0.5">{new Date(ret.created_at).toLocaleString('es-CO')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="bg-slate-100 text-slate-600 text-[10px] font-black px-2 py-1 rounded-lg">{items.length} art.</span>
                    <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-50 px-4 pb-4">
                    {/* Items table */}
                    {items.length > 0 && (
                      <div className="mt-3 mb-4 overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-slate-900 text-slate-300">
                              <th className="text-left px-3 py-2 font-black uppercase rounded-tl-xl">Artículo</th>
                              <th className="text-center px-3 py-2 font-black uppercase">Entregado</th>
                              <th className="text-center px-3 py-2 font-black uppercase rounded-tr-xl">Devuelto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, i) => (
                              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="px-3 py-2 font-bold text-slate-700">
                                  <div className="font-black text-slate-900">{it.sku}</div>
                                  <div className="text-[9px] text-slate-400">{it.article_name}</div>
                                </td>
                                <td className="px-3 py-2 text-center font-bold text-emerald-600">{it.quantity_delivered} {it.unit}</td>
                                <td className="px-3 py-2 text-center font-black text-rose-600">{it.quantity_returned} {it.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Notes */}
                    <div className="mb-3">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Notas de procesamiento</label>
                      <textarea
                        value={notesMap[ret.id] || ''}
                        onChange={e => setNotesMap(prev => ({ ...prev, [ret.id]: e.target.value }))}
                        rows={2} placeholder="Destino, observaciones de ingreso a bodega..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-400 resize-none"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStatus(ret.id, 'PROCESSED')}
                        disabled={isProc}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        {isProc ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.CheckCircle className="w-4 h-4" />}
                        Ingresar a Bodega
                      </button>
                      <button
                        onClick={() => handleStatus(ret.id, 'CANCELLED')}
                        disabled={isProc}
                        className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <Icons.X className="w-4 h-4" />
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReturnsControlModal;
