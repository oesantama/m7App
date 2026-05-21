import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';

interface User { id: string; name: string; clientIds?: string[]; clientId?: string; role?: string; }
interface Props { user: User; }

const CITIES = ['MEDELLIN', 'CALI', 'BOGOTA', 'BARRANQUILLA', 'OTRA'];

export default function OperacionesFlotaManual({ user }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [clients, setClients] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [form, setForm] = useState({
    clientId: '',
    operationDate: today,
    quantity: '1',
    city: 'MEDELLIN',
    notes: '',
  });

  const [filter, setFilter] = useState({ from: '', to: '' });

  const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const allowedIds = user.clientIds || [];

  useEffect(() => {
    api.getClients().then((res: any) => {
      const all: any[] = Array.isArray(res) ? res : (res?.data || []);
      const filtered = isSuperAdmin
        ? all
        : all.filter((c: any) => allowedIds.includes(c.id) || allowedIds.includes(String(c.id)));
      setClients(filtered.filter((c: any) => c.status_id === 'EST-01' || !c.status_id));
    }).catch(() => {});
    loadEntries();
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getFlotaManualEntries(filter.from && filter.to ? { from: filter.from, to: filter.to } : undefined);
      setEntries(res.data || []);
    } catch {
      toast.error('Error cargando registros');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const selectedClient = clients.find(c => String(c.id) === form.clientId);
  const clientDisplayName = selectedClient ? `TDM ${selectedClient.name}` : '';

  const handleSave = async () => {
    if (!form.clientId) { toast.error('Seleccione un cliente'); return; }
    if (!form.operationDate) { toast.error('Ingrese la fecha de operación'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      await api.saveFlotaManualEntry({
        clientId: form.clientId,
        clientName: clientDisplayName,
        operationDate: form.operationDate,
        quantity: Number(form.quantity),
        city: form.city,
        notes: form.notes,
        createdBy: user.name,
      });
      toast.success(`✅ Operación TDM registrada: ${clientDisplayName}`);
      setForm({ clientId: '', operationDate: today, quantity: '1', city: 'MEDELLIN', notes: '' });
      loadEntries();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    setDeleting(id);
    try {
      await api.deleteFlotaManualEntry(id);
      toast.success('Registro eliminado');
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestión Documentos Drive • PAG-62</p>
        <h1 className="text-2xl font-black text-slate-900 mt-0.5">Operaciones Flota Manual</h1>
        <p className="text-sm text-slate-500 mt-0.5">Registro de operaciones TDM no capturadas en el archivo de manifiestos</p>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
        <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">➕ Nueva Operación TDM</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente *</label>
            <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all bg-white appearance-none">
              <option value="">-- Seleccionar cliente --</option>
              {clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            {clientDisplayName && (
              <p className="text-[10px] font-black text-amber-600 pl-1 mt-0.5">Se registrará como: "{clientDisplayName}"</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha de Operación *</label>
            <input type="date" value={form.operationDate} onChange={e => setForm(f => ({ ...f, operationDate: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad (Viajes) *</label>
            <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ciudad *</label>
            <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all bg-white appearance-none">
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observaciones</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Notas opcionales..."
              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-8 py-3 bg-amber-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-sm disabled:opacity-50">
            {saving ? 'Guardando...' : '✅ Registrar Operación'}
          </button>
        </div>
      </div>

      {/* Filtros y lista */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</label>
            <input type="date" value={filter.from} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))}
              className="px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</label>
            <input type="date" value={filter.to} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))}
              className="px-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-amber-400 transition-all" />
          </div>
          <button onClick={loadEntries} disabled={loading}
            className="px-6 py-2.5 bg-slate-700 text-white rounded-2xl text-sm font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-50">
            {loading ? '...' : '🔍 Filtrar'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm font-bold">Cargando registros...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No hay registros manuales</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="text-left pb-3 pr-4">Cliente (TDM)</th>
                  <th className="text-center pb-3 pr-4">Fecha</th>
                  <th className="text-center pb-3 pr-4">Viajes</th>
                  <th className="text-center pb-3 pr-4">Ciudad</th>
                  <th className="text-left pb-3 pr-4">Notas</th>
                  <th className="text-center pb-3">Registrado por</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 pr-4 font-bold text-amber-700">{e.client_name}</td>
                    <td className="py-3 pr-4 text-center text-slate-600 font-medium">
                      {new Date(e.operation_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3 pr-4 text-center font-black text-slate-900">{e.quantity}</td>
                    <td className="py-3 pr-4 text-center">
                      <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-black text-slate-600 uppercase">{e.city}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 text-xs">{e.notes || '—'}</td>
                    <td className="py-3 pr-4 text-center text-slate-400 text-xs">{e.created_by || '—'}</td>
                      <div className="flex justify-center items-center gap-2">
                        {isSuperAdmin && (
                          <button onClick={() => {
                            // Pre-fill form and maybe scroll up
                            setForm({
                              clientId: String(e.client_id || e.clientId || ''),
                              operationDate: e.operation_date ? new Date(e.operation_date).toISOString().slice(0,10) : today,
                              quantity: String(e.quantity),
                              city: e.city,
                              notes: e.notes || '',
                            });
                            // Store edit ID? We would need a state for it, but for now we can just delete the old one or something...
                            // Let's implement full edit if needed, or just delete and re-insert. Since there's no update endpoint in the previous snapshot, let's just prefill.
                            // Actually, let's add full edit state if we can.
                            toast.info('Se han cargado los datos para editar. Si guarda, se creará un nuevo registro (debe eliminar el anterior si desea reemplazarlo).');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar">
                            <Pencil size={14} />
                          </button>
                        )}
                        <button onClick={() => {
                          toast.custom((t) => (
                            <div className="bg-white rounded-xl shadow-xl border border-rose-100 p-5 flex flex-col gap-3 min-w-[300px]">
                              <p className="text-sm font-bold text-slate-800">¿Eliminar este registro?</p>
                              <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                              <div className="flex gap-2 justify-end mt-2">
                                <button onClick={() => toast.dismiss(t)} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                                <button onClick={() => {
                                  toast.dismiss(t);
                                  handleDelete(e.id);
                                }} className="px-3 py-1.5 text-xs font-bold bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors">Eliminar</button>
                              </div>
                            </div>
                          ), { duration: Infinity });
                        }} disabled={deleting === e.id}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                          title="Eliminar">
                          {deleting === e.id ? <span className="animate-spin inline-block">⏳</span> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200">
                <tr className="font-black text-slate-900 text-sm">
                  <td colSpan={2} className="pt-3 pr-4 text-right">Total:</td>
                  <td className="pt-3 text-center">{entries.reduce((s, e) => s + Number(e.quantity), 0)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
