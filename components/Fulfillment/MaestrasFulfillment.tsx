import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Loader2, Power } from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface Props { user: User; }

interface Cliente {
  id: number; codigo: string; nombre: string; pais: string | null; moneda: 'USD' | 'COP';
  notas_tarifas: string | null; estado_id: string; estado: string | null;
}
interface MasterItem { id: number; nombre: string; estado_id: string; estado: string | null; }

const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";
const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const ACTIVO = 'EST-01', INACTIVO = 'EST-02';
const isActivo = (estadoId: string) => estadoId !== INACTIVO;

export default function MaestrasFulfillment({ user }: Props) {
  const [tab, setTab] = useState<'clientes' | 'transportistas' | 'productos'>('clientes');

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {[
          { key: 'clientes', label: 'Clientes / Marcas' },
          { key: 'transportistas', label: 'Transportistas' },
          { key: 'productos', label: 'Productos / Servicios' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'clientes' && <ClientesTab />}
      {tab === 'transportistas' && <TransportistasTab />}
      {tab === 'productos' && <ProductosTab />}
    </div>
  );
}

const EstadoBadge: React.FC<{ estadoId: string; estado: string | null }> = ({ estadoId, estado }) => (
  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${isActivo(estadoId) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
    {estado || (isActivo(estadoId) ? 'ACTIVO' : 'INACTIVO')}
  </span>
);

// ── Diálogo de confirmación estándar (activar/inactivar) — mismo patrón visual
// que "Eliminar OS", "Anular pago", etc. en el resto de la app.
const ConfirmToggleModal: React.FC<{
  nombre: string; activo: boolean; loading: boolean; onCancel: () => void; onConfirm: () => void;
}> = ({ nombre, activo, loading, onCancel, onConfirm }) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
      <p className="text-base font-black text-slate-800 mb-1">{activo ? 'Inactivar' : 'Activar'} Registro</p>
      <p className="text-sm text-slate-500 mb-5">
        ¿Seguro que deseas {activo ? 'inactivar' : 'activar'} <span className="font-black text-slate-800">{nombre}</span>?
        {activo && ' Dejará de estar disponible para nuevas selecciones, pero su histórico se conserva.'}
      </p>
      <div className="flex gap-3">
        <button onClick={onCancel} disabled={loading} className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
        <button onClick={onConfirm} disabled={loading}
          className={`flex-1 px-4 py-2.5 rounded-2xl text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2 ${activo ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} {activo ? 'Inactivar' : 'Activar'}
        </button>
      </div>
    </div>
  </div>
);

// ── Clientes / Marcas ────────────────────────────────────────────────────────
function ClientesTab() {
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ codigo: '', nombre: '', pais: '', moneda: 'COP' as 'USD' | 'COP', notas_tarifas: '' });
  const [saving, setSaving] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<Cliente | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getFulfillmentClientes();
      setRows(res.success ? res.data : []);
    } catch { toast.error('Error al cargar clientes'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ codigo: '', nombre: '', pais: '', moneda: 'COP', notas_tarifas: '' }); setEditItem(null); setShowModal(true); };
  const openEdit = (c: Cliente) => {
    setForm({ codigo: c.codigo, nombre: c.nombre, pais: c.pais || '', moneda: c.moneda, notas_tarifas: c.notas_tarifas || '' });
    setEditItem(c); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!editItem && !form.codigo.trim()) { toast.error('El código es obligatorio'); return; }
    setSaving(true);
    try {
      const res = editItem
        ? await api.updateFulfillmentCliente(editItem.id, { nombre: form.nombre, pais: form.pais, moneda: form.moneda, notas_tarifas: form.notas_tarifas })
        : await api.createFulfillmentCliente({ codigo: form.codigo, nombre: form.nombre, pais: form.pais, moneda: form.moneda, notas_tarifas: form.notas_tarifas });
      if (res.success) {
        toast.success(editItem ? 'Cliente actualizado' : 'Cliente creado');
        setShowModal(false); load();
      } else toast.error(res.error || 'No se pudo guardar el cliente');
    } catch (e: any) { toast.error(e.message || 'No se pudo guardar el cliente'); }
    finally { setSaving(false); }
  };

  const confirmarToggle = async () => {
    if (!confirmToggle) return;
    setToggling(true);
    try {
      const activo = isActivo(confirmToggle.estado_id);
      const res = await api.updateFulfillmentCliente(confirmToggle.id, { estado_id: activo ? INACTIVO : ACTIVO });
      if (res.success) { toast.success(activo ? 'Cliente inactivado' : 'Cliente activado'); setConfirmToggle(null); load(); }
      else toast.error(res.error || 'No se pudo cambiar el estado');
    } catch (e: any) { toast.error(e.message || 'No se pudo cambiar el estado'); }
    finally { setToggling(false); }
  };

  const columns: ColumnDef<Cliente>[] = [
    { header: 'Código', key: 'codigo', sortable: true, render: r => <span className="font-mono font-black text-slate-800">{r.codigo}</span> },
    { header: 'Nombre', key: 'nombre', sortable: true, render: r => <span className="font-bold">{r.nombre}</span> },
    { header: 'País', key: 'pais', sortable: true, render: r => r.pais || '—' },
    { header: 'Moneda', key: 'moneda', sortable: true, render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.moneda === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.moneda}</span> },
    { header: 'Notas / Tarifas', key: 'notas_tarifas', sortable: false, render: r => <span className="text-xs text-slate-500 line-clamp-2 max-w-xs block">{r.notas_tarifas || '—'}</span> },
    { header: 'Estado', key: 'estado', sortable: true, render: r => <EstadoBadge estadoId={r.estado_id} estado={r.estado} /> },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: r => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(r)} title="Editar" className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => setConfirmToggle(r)} title={isActivo(r.estado_id) ? 'Inactivar' : 'Activar'}
            className={`p-1.5 rounded-lg ${isActivo(r.estado_id) ? 'text-slate-400 hover:bg-slate-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
            <Power className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">Marcas/clientes de la operación Fullfilment — cada uno con su moneda nativa (USD o COP).</p>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-2xl text-sm font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Agregar Cliente
        </button>
      </div>

      <DataTable<Cliente>
        data={rows} columns={columns} loading={loading}
        searchPlaceholder="Buscar cliente..." excelFileName="fulfillment_clientes.xlsx" excelSheetName="Clientes"
      />

      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <p className="text-base font-black text-slate-800 mb-4">{editItem ? 'Editar' : 'Nuevo'} Cliente</p>
            <div className="space-y-3">
              {!editItem && (
                <div><label className={labelCls}>Código *</label><input className={inputCls} value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="Ej: SEEDOLOGY" /></div>
              )}
              <div><label className={labelCls}>Nombre *</label><input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
              <div><label className={labelCls}>País</label><input className={inputCls} value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value }))} placeholder="Estados Unidos / Colombia" /></div>
              <div>
                <label className={labelCls}>Moneda *</label>
                <select className={inputCls} value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'USD' | 'COP' }))}>
                  <option value="COP">COP — Pesos Colombianos</option>
                  <option value="USD">USD — Dólares (EE.UU.)</option>
                </select>
              </div>
              <div><label className={labelCls}>Notas / Tarifas</label>
                <textarea className={inputCls} rows={3} value={form.notas_tarifas} onChange={e => setForm(f => ({ ...f, notas_tarifas: e.target.value }))}
                  placeholder="Tramos de comisión, tamaños de caja, condiciones acordadas..." />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmToggle && (
        <ConfirmToggleModal
          nombre={confirmToggle.nombre} activo={isActivo(confirmToggle.estado_id)} loading={toggling}
          onCancel={() => setConfirmToggle(null)} onConfirm={confirmarToggle}
        />
      )}
    </div>
  );
}

// ── Genérico: tabla con "+ Agregar", Editar (diálogo) y Activar/Inactivar (diálogo) ──
// (Transportistas / Productos-Servicios) — nunca se elimina, se conserva el histórico.
function SimpleMasterTab({
  title, entidad, placeholder, excelFileName, load, create, update,
}: {
  title: string; entidad: string; placeholder: string; excelFileName: string;
  load: () => Promise<{ success: boolean; data: MasterItem[] }>;
  create: (nombre: string) => Promise<{ success: boolean; error?: string }>;
  update: (id: number, data: { nombre?: string; estado_id?: string }) => Promise<{ success: boolean; error?: string }>;
}) {
  const [rows, setRows] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);

  const [editItem, setEditItem] = useState<MasterItem | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmToggle, setConfirmToggle] = useState<MasterItem | null>(null);
  const [toggling, setToggling] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { const res = await load(); setRows(res.success ? res.data : []); }
    catch { toast.error(`Error al cargar ${title.toLowerCase()}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const res = await create(nombre.trim());
      if (res.success) { toast.success(`${entidad} creado`); setNombre(''); refresh(); }
      else toast.error(res.error || `No se pudo guardar el ${entidad.toLowerCase()}`);
    } catch (e: any) { toast.error(e.message || `No se pudo guardar el ${entidad.toLowerCase()}`); }
    finally { setSaving(false); }
  };

  const openEdit = (r: MasterItem) => { setEditItem(r); setEditNombre(r.nombre); };
  const saveEdit = async () => {
    if (!editItem) return;
    if (!editNombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSavingEdit(true);
    try {
      const res = await update(editItem.id, { nombre: editNombre.trim() });
      if (res.success) { toast.success(`${entidad} actualizado`); setEditItem(null); refresh(); }
      else toast.error(res.error || `No se pudo actualizar el ${entidad.toLowerCase()}`);
    } catch (e: any) { toast.error(e.message || `No se pudo actualizar el ${entidad.toLowerCase()}`); }
    finally { setSavingEdit(false); }
  };

  const confirmarToggle = async () => {
    if (!confirmToggle) return;
    setToggling(true);
    try {
      const activo = isActivo(confirmToggle.estado_id);
      const res = await update(confirmToggle.id, { estado_id: activo ? INACTIVO : ACTIVO });
      if (res.success) { toast.success(`${entidad} ${activo ? 'inactivado' : 'activado'}`); setConfirmToggle(null); refresh(); }
      else toast.error(res.error || 'No se pudo cambiar el estado');
    } catch (e: any) { toast.error(e.message || 'No se pudo cambiar el estado'); }
    finally { setToggling(false); }
  };

  const columns: ColumnDef<MasterItem>[] = [
    { header: 'Nombre', key: 'nombre', sortable: true, render: r => <span className="font-bold text-slate-700">{r.nombre}</span> },
    { header: 'Estado', key: 'estado', sortable: true, render: r => <EstadoBadge estadoId={r.estado_id} estado={r.estado} /> },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: r => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(r)} title="Editar" className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => setConfirmToggle(r)} title={isActivo(r.estado_id) ? 'Inactivar' : 'Activar'}
            className={`p-1.5 rounded-lg ${isActivo(r.estado_id) ? 'text-slate-400 hover:bg-slate-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
            <Power className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex gap-3 mb-5 max-w-lg">
        <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <button onClick={handleAdd} disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 shrink-0 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
        </button>
      </div>

      <DataTable<MasterItem>
        data={rows} columns={columns} loading={loading}
        searchPlaceholder={`Buscar ${title.toLowerCase()}...`} excelFileName={excelFileName} excelSheetName={title}
      />

      {/* Diálogo Editar */}
      {editItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-4">Editar {entidad}</p>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} value={editNombre} onChange={e => setEditNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditItem(null)} disabled={savingEdit} className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} {savingEdit ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo Activar/Inactivar */}
      {confirmToggle && (
        <ConfirmToggleModal
          nombre={confirmToggle.nombre} activo={isActivo(confirmToggle.estado_id)} loading={toggling}
          onCancel={() => setConfirmToggle(null)} onConfirm={confirmarToggle}
        />
      )}
    </div>
  );
}

function TransportistasTab() {
  return (
    <SimpleMasterTab
      title="Transportistas" entidad="Transportista" placeholder="Ej: UPS, FEDEX, DHL, SHIPAL..."
      excelFileName="fulfillment_transportistas.xlsx"
      load={api.getFulfillmentTransportistas}
      create={api.createFulfillmentTransportista}
      update={api.updateFulfillmentTransportista}
    />
  );
}

function ProductosTab() {
  return (
    <SimpleMasterTab
      title="Productos" entidad="Producto/Servicio" placeholder="Ej: Almacenamiento, Picking & Packing, Logística Especial..."
      excelFileName="fulfillment_productos.xlsx"
      load={api.getFulfillmentProductos}
      create={api.createFulfillmentProducto}
      update={api.updateFulfillmentProducto}
    />
  );
}
