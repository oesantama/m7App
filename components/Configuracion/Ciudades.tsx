import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { User } from '../../types';
import { Icons } from '../../constants';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Departamento {
  id: number;
  nombre: string;
  estado: string;
  usuario_control: string;
  fecha_control: string;
}

interface Ciudad {
  id: number;
  nombre: string;
  id_departamento: number;
  departamento_nombre: string;
  estado: string;
  usuario_control: string;
  fecha_control: string;
}

interface Estado {
  id: string;
  name: string;
}

interface Props {
  user: User;
}

type ActiveTab = 'departamentos' | 'ciudades';

// ─── Tab Departamentos ────────────────────────────────────────────────────────

interface DepTabProps { user: User; estados: Estado[]; onDepChange: (deps: Departamento[]) => void; }

const DepartamentosTab: React.FC<DepTabProps> = ({ user, estados, onDepChange }) => {
  const [records, setRecords]   = useState<Departamento[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const PAGE_SIZE = 10;

  const [isOpen, setIsOpen]     = useState(false);
  const [editing, setEditing]   = useState<Departamento | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formEstado, setFormEstado] = useState('EST-01');
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDepartamentos();
      const list = Array.isArray(data) ? data : [];
      setRecords(list);
      onDepChange(list);
    } catch {
      toast.error('Error al cargar departamentos');
    } finally {
      setLoading(false);
    }
  }, [onDepChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() =>
    records.filter(r => r.nombre?.toLowerCase().includes(search.toLowerCase())),
    [records, search]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setEditing(null); setFormNombre(''); setFormEstado('EST-01'); setIsOpen(true); };
  const openEdit   = (r: Departamento) => { setEditing(r); setFormNombre(r.nombre); setFormEstado(r.estado || 'EST-01'); setIsOpen(true); };

  const handleSave = async () => {
    if (!formNombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      await api.saveDepartamento({ id: editing?.id, nombre: formNombre.trim(), estado: formEstado, usuarioControl: user.name });
      toast.success(editing ? 'Departamento actualizado' : 'Departamento creado');
      setIsOpen(false);
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.deleteDepartamento(id);
      toast.success('Departamento eliminado');
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Error al eliminar'); }
    finally { setDeleting(null); }
  };

  const estadoLabel = (id: string) => estados.find(e => e.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3 w-full sm:w-72 border border-slate-100 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
          <Icons.Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar departamento..."
            className="bg-transparent border-none outline-none font-bold text-[11px] uppercase text-slate-700 placeholder:text-slate-300 w-full" />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 shrink-0">
          <Icons.Plus className="w-3.5 h-3.5" />Nuevo Departamento
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['ID','Nombre','Estado','Usuario Control','Fecha Control','Acciones'].map(h => (
                  <th key={h} className={`${h === 'Acciones' ? 'text-right' : 'text-left'} px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando...</p>
                </td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <Icons.MapPin className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Sin departamentos</p>
                </td></tr>
              ) : paginated.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 !== 0 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-5 py-3.5 text-[11px] font-black text-slate-400">{r.id}</td>
                  <td className="px-5 py-3.5 text-[11px] font-bold text-slate-700 uppercase">{r.nombre}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${r.estado === 'EST-01' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'EST-01' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {estadoLabel(r.estado)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">{r.usuario_control}</td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">{r.fecha_control ? new Date(r.fecha_control).toLocaleDateString('es-CO') : '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                        <Icons.Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40">
                        {deleting === r.id ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Icons.Trash className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filtered.length} registros · Pág {page}/{totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"><Icons.ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"><Icons.ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">{editing ? 'Editar' : 'Nuevo'} Registro</p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Departamento</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500"><Icons.X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nombre *</label>
                <input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Nombre del departamento..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</label>
                <select value={formEstado} onChange={e => setFormEstado(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
                  {estados.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setIsOpen(false)} className="flex-1 h-11 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Guardando...</> : <><Icons.Check className="w-3.5 h-3.5" />{editing ? 'Actualizar' : 'Guardar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tab Ciudades ─────────────────────────────────────────────────────────────

interface CiudadTabProps { user: User; estados: Estado[]; departamentos: Departamento[]; }

const CiudadesTab: React.FC<CiudadTabProps> = ({ user, estados, departamentos }) => {
  const [records, setRecords]         = useState<Ciudad[]>([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState('');
  const [filterDep, setFilterDep]     = useState<string>('');
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 10;

  const [isOpen, setIsOpen]           = useState(false);
  const [editing, setEditing]         = useState<Ciudad | null>(null);
  const [formNombre, setFormNombre]   = useState('');
  const [formDep, setFormDep]         = useState<string>('');
  const [formEstado, setFormEstado]   = useState('EST-01');
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCiudades();
      setRecords(Array.isArray(data) ? data : []);
    } catch { toast.error('Error al cargar ciudades'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() =>
    records.filter(r =>
      r.nombre?.toLowerCase().includes(search.toLowerCase()) &&
      (filterDep === '' || String(r.id_departamento) === filterDep)
    ),
    [records, search, filterDep]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null); setFormNombre('');
    setFormDep(departamentos[0] ? String(departamentos[0].id) : '');
    setFormEstado('EST-01'); setIsOpen(true);
  };
  const openEdit = (r: Ciudad) => {
    setEditing(r); setFormNombre(r.nombre);
    setFormDep(String(r.id_departamento)); setFormEstado(r.estado || 'EST-01'); setIsOpen(true);
  };

  const handleSave = async () => {
    if (!formNombre.trim()) { toast.error('El nombre es requerido'); return; }
    if (!formDep) { toast.error('Seleccione un departamento'); return; }
    setSaving(true);
    try {
      await api.saveCiudad({ id: editing?.id, nombre: formNombre.trim(), idDepartamento: Number(formDep), estado: formEstado, usuarioControl: user.name });
      toast.success(editing ? 'Ciudad actualizada' : 'Ciudad creada');
      setIsOpen(false);
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await api.deleteCiudad(id);
      toast.success('Ciudad eliminada');
      fetchData();
    } catch (e: any) { toast.error(e.message || 'Error al eliminar'); }
    finally { setDeleting(null); }
  };

  const estadoLabel = (id: string) => estados.find(e => e.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 flex-wrap">
          <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3 w-60 border border-slate-100 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
            <Icons.Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar ciudad..."
              className="bg-transparent border-none outline-none font-bold text-[11px] uppercase text-slate-700 placeholder:text-slate-300 w-full" />
          </div>
          <select value={filterDep} onChange={e => { setFilterDep(e.target.value); setPage(1); }}
            className="h-10 px-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] font-bold uppercase text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
            <option value="">Todos los Departamentos</option>
            {departamentos.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
          </select>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 shrink-0">
          <Icons.Plus className="w-3.5 h-3.5" />Nueva Ciudad
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['ID','Ciudad','Departamento','Estado','Usuario Control','Fecha Control','Acciones'].map(h => (
                  <th key={h} className={`${h === 'Acciones' ? 'text-right' : 'text-left'} px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Cargando...</p>
                </td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center">
                  <Icons.MapPin className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Sin ciudades</p>
                </td></tr>
              ) : paginated.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i % 2 !== 0 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-5 py-3.5 text-[11px] font-black text-slate-400">{r.id}</td>
                  <td className="px-5 py-3.5 text-[11px] font-bold text-slate-700 uppercase">{r.nombre}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100">
                      <Icons.MapPin className="w-3 h-3" />{r.departamento_nombre || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${r.estado === 'EST-01' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'EST-01' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {estadoLabel(r.estado)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">{r.usuario_control}</td>
                  <td className="px-5 py-3.5 text-[11px] text-slate-500">{r.fecha_control ? new Date(r.fecha_control).toLocaleDateString('es-CO') : '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(r)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"><Icons.Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40">
                        {deleting === r.id ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Icons.Trash className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filtered.length} registros · Pág {page}/{totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"><Icons.ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"><Icons.ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">{editing ? 'Editar' : 'Nueva'} Ciudad</p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Ciudad</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-500"><Icons.X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nombre *</label>
                <input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Nombre de la ciudad..."
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Departamento *</label>
                <select value={formDep} onChange={e => setFormDep(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
                  <option value="">— Seleccionar —</option>
                  {departamentos.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</label>
                <select value={formEstado} onChange={e => setFormEstado(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
                  {estados.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setIsOpen(false)} className="flex-1 h-11 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Guardando...</> : <><Icons.Check className="w-3.5 h-3.5" />{editing ? 'Actualizar' : 'Guardar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const Ciudades: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab]       = useState<ActiveTab>('departamentos');
  const [estados, setEstados]           = useState<Estado[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);

  useEffect(() => {
    api.getEstados()
      .then((data: any[]) => setEstados(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-6 min-h-full bg-slate-50">
      {/* Encabezado */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Icons.MapPin className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Configuración Maestros</p>
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ciudades</h1>
        </div>
      </div>

      {/* Panel con tabs */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="px-6 border-b border-slate-100">
          <div className="flex gap-0">
            {(['departamentos', 'ciudades'] as ActiveTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
                }`}
              >
                {tab === 'departamentos' ? 'Departamentos' : 'Ciudades'}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {activeTab === 'departamentos' ? (
            <DepartamentosTab user={user} estados={estados} onDepChange={setDepartamentos} />
          ) : (
            <CiudadesTab user={user} estados={estados} departamentos={departamentos} />
          )}
        </div>
      </div>
    </div>
  );
};

export default Ciudades;
