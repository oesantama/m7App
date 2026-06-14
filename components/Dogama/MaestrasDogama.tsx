import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { toast } from 'sonner';
import { hasPermission } from '../../utils/permissions';
import { DataTable, ColumnDef } from '../shared/DataTable';
import * as XLSX from 'xlsx';

interface Props { user: User; }

interface Confeccionista {
  id: number;
  descripcion_conf: string;
  direccion: string;
  ciudad: string | null;
  estado: string;
  usuariocreacion: string | null;
  fecha_creacion: string;
  telefono: string | null;
  correo: string | null;
}

const EMPTY_FORM = {
  descripcion_conf: '',
  direccion: '',
  ciudad: '',
  estado: 'activo',
  telefono: '',
  correo: '',
};

type FormState = typeof EMPTY_FORM;

// ── Utilidades de similitud ───────────────────────────────────────────────────
const normalize = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

// Palabras comunes en nombres de confeccionistas colombianas
const STOPWORDS = new Set(['sas', 'sa', 'ltda', 'eu', 's a s', 'de', 'y', 'la', 'el', 'los', 'las',
  'confecciones', 'confeccion', 'confeccionista', 'industria', 'industrias', 'empresa', 'grupo',
  'textil', 'textiles', 'moda', 'modas', 'creacion', 'creaciones', 'fabricacion', 'fabrica',
  'manufactura', 'produccion', 'diseno', 'disenio', 'comercializadora', 'comercio']);

function keyWords(name: string): string[] {
  return normalize(name).split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w));
}

const nameSimilar = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  // Iguales normalizados
  if (na === nb) return true;
  // Uno contiene al otro completo (ej. "CAMVERS" ⊂ "CONFECCIONES CAMVERS")
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word-overlap sobre palabras clave (sin stopwords)
  const ka = keyWords(a);
  const kb = keyWords(b);
  if (!ka.length || !kb.length) return false;
  const hits = ka.filter(w => kb.some(kw => kw.includes(w) || w.includes(kw))).length;
  const score = hits / Math.max(ka.length, kb.length);
  return score >= 0.6;
};

type ImportStatus = 'nuevo' | 'duplicado_exacto' | 'posible_duplicado';

interface PreviewRow {
  index: number;
  descripcion_conf: string;
  direccion: string;
  ciudad: string;
  correo: string;
  status: ImportStatus;
  matchedWith?: string;
  selected: boolean;
}

function checkVsDB(conf: string, dir: string, correo: string, ciudad: string, existing: Confeccionista[]): { status: ImportStatus; matchedWith?: string } {
  const nc  = normalize(conf);
  const nd  = normalize(dir);
  const nco = normalize(correo);
  const nciu = normalize(ciudad);
  for (const ex of existing) {
    const ec   = normalize(ex.descripcion_conf);
    const ed   = normalize(ex.direccion || '');
    const eco  = normalize(ex.correo || '');
    const eciu = normalize(ex.ciudad || '');
    // Exacto: mismo nombre + misma dirección
    if (ec === nc && ed === nd) return { status: 'duplicado_exacto', matchedWith: ex.descripcion_conf };
    // Exacto extendido: mismo correo + misma dirección
    if (nco && eco && nco === eco && ed === nd)
      return { status: 'duplicado_exacto', matchedWith: ex.descripcion_conf };
    // Exacto extendido: mismo correo + misma ciudad + nombre similar
    if (nco && eco && nco === eco && nciu && eciu && nciu === eciu && nameSimilar(conf, ex.descripcion_conf))
      return { status: 'duplicado_exacto', matchedWith: ex.descripcion_conf };
    // Posible: mismo correo + nombre similar (sin importar ciudad/dirección)
    if (nco && eco && nco === eco && nameSimilar(conf, ex.descripcion_conf))
      return { status: 'posible_duplicado', matchedWith: ex.descripcion_conf };
    // Posible: misma dirección + nombre similar
    if (nd && ed && nd === ed && nameSimilar(conf, ex.descripcion_conf))
      return { status: 'posible_duplicado', matchedWith: ex.descripcion_conf };
    // Posible: solo por nombre muy similar (contiene o word-overlap alto)
    if (nameSimilar(conf, ex.descripcion_conf))
      return { status: 'posible_duplicado', matchedWith: ex.descripcion_conf };
  }
  return { status: 'nuevo' };
}

function compareTwoRows(a: PreviewRow, b: PreviewRow): { status: ImportStatus; matchedWith?: string } {
  const na  = normalize(a.descripcion_conf);
  const nb  = normalize(b.descripcion_conf);
  const da  = normalize(a.direccion);
  const db2 = normalize(b.direccion);
  const ca  = normalize(a.correo);
  const cb  = normalize(b.correo);
  const cia = normalize(a.ciudad);
  const cib = normalize(b.ciudad);
  // Exacto: nombre igual + dirección igual
  if (na === nb && da === db2) return { status: 'duplicado_exacto', matchedWith: b.descripcion_conf };
  // Exacto extendido: mismo correo + misma dirección
  if (ca && ca === cb && da === db2)
    return { status: 'duplicado_exacto', matchedWith: b.descripcion_conf };
  // Exacto extendido: mismo correo + misma ciudad + nombre similar
  if (ca && ca === cb && cia && cia === cib && nameSimilar(a.descripcion_conf, b.descripcion_conf))
    return { status: 'duplicado_exacto', matchedWith: b.descripcion_conf };
  // Posible: mismo correo + nombre similar
  if (ca && ca === cb && nameSimilar(a.descripcion_conf, b.descripcion_conf))
    return { status: 'posible_duplicado', matchedWith: b.descripcion_conf };
  // Posible: misma dirección + nombre similar
  if (da && da === db2 && nameSimilar(a.descripcion_conf, b.descripcion_conf))
    return { status: 'posible_duplicado', matchedWith: b.descripcion_conf };
  // Posible: solo nombre muy similar (word-overlap sin stopwords)
  if (nameSimilar(a.descripcion_conf, b.descripcion_conf))
    return { status: 'posible_duplicado', matchedWith: b.descripcion_conf };
  return { status: 'nuevo' };
}

function buildPreviewRows(json: any[], existingDB: Confeccionista[]): PreviewRow[] {
  // Primera pasada: extraer campos
  const rows: PreviewRow[] = json
    .map((row, i) => ({
      index: i,
      descripcion_conf: (row.Confeccionista || row.confeccionista || row.descripcion_conf || '').trim(),
      direccion: (row.Direccion || row.direccion || '').trim(),
      ciudad: (row.CIUDAD || row.Ciudad || row.ciudad || '').trim(),
      correo: (row.correo || row.Correo || row.email || '').trim(),
      status: 'nuevo' as ImportStatus,
      matchedWith: undefined,
      selected: true,
    }))
    .filter(r => r.descripcion_conf !== '');

  // Segunda pasada: detectar duplicados
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Contra BD
    const dbCheck = checkVsDB(r.descripcion_conf, r.direccion, r.correo, r.ciudad, existingDB);
    if (dbCheck.status !== 'nuevo') {
      r.status = dbCheck.status;
      r.matchedWith = `[BD] ${dbCheck.matchedWith}`;
      continue;
    }
    // Contra filas anteriores del mismo Excel
    for (let j = 0; j < i; j++) {
      const prev = rows[j];
      const cmp = compareTwoRows(r, prev);
      if (cmp.status !== 'nuevo') {
        r.status = cmp.status;
        r.matchedWith = `[Excel fila ${j + 2}] ${prev.descripcion_conf}`;
        break;
      }
    }
  }

  return rows.map(r => ({ ...r, selected: r.status === 'nuevo' }));
}

const STATUS_LABELS: Record<ImportStatus, { label: string; cls: string }> = {
  nuevo: { label: 'Nuevo', cls: 'bg-emerald-100 text-emerald-700' },
  duplicado_exacto: { label: 'Duplicado exacto', cls: 'bg-red-100 text-red-700' },
  posible_duplicado: { label: 'Posible duplicado', cls: 'bg-amber-100 text-amber-700' },
};

// ── Descarga plantilla Excel ──────────────────────────────────────────────────
const downloadTemplate = (filename: string, columns: string[], exampleRow?: Record<string, string>) => {
  const ws = XLSX.utils.aoa_to_sheet([
    columns,
    ...(exampleRow ? [columns.map(c => exampleRow[c] || '')] : []),
  ]);
  ws['!cols'] = columns.map(c => ({ wch: Math.max(c.length + 4, 20) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Formato');
  XLSX.writeFile(wb, filename);
};

// ── Modal Formulario ──────────────────────────────────────────────────────────
function FormModal({ editing, user, onClose, onSaved }: {
  editing: Confeccionista | null;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          descripcion_conf: editing.descripcion_conf,
          direccion: editing.direccion,
          ciudad: editing.ciudad || '',
          estado: editing.estado,
          telefono: editing.telefono || '',
          correo: editing.correo || '',
        }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.descripcion_conf.trim() || !form.direccion.trim()) {
      toast.error('Confeccionista y dirección son obligatorios');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.dogamaUpdateConfeccionista(editing.id, form);
        toast.success('Confeccionista actualizado');
      } else {
        await api.dogamaCreateConfeccionista({ ...form, usuariocreacion: user.name || user.email });
        toast.success('Confeccionista creado');
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const fields: [string, keyof FormState, string][] = [
    ['Confeccionista *', 'descripcion_conf', 'text'],
    ['Dirección *', 'direccion', 'text'],
    ['Ciudad', 'ciudad', 'text'],
    ['Teléfono', 'telefono', 'text'],
    ['Correo', 'correo', 'email'],
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <h3 className="text-lg font-black text-slate-800 mb-5 uppercase tracking-wide">
          {editing ? 'Editar Confeccionista' : 'Nuevo Confeccionista'}
        </h3>
        <div className="space-y-3">
          {fields.map(([label, key, type]) => (
            <div key={key}>
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Estado</label>
            <select
              value={form.estado}
              onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
              className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={onClose}
            className="px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

type SortDir = 'asc' | 'desc';
type SortKey = keyof Pick<PreviewRow, 'descripcion_conf' | 'direccion' | 'ciudad' | 'correo' | 'status'>;

const PREVIEW_COLS: { key: SortKey; label: string }[] = [
  { key: 'descripcion_conf', label: 'Confeccionista' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'correo', label: 'Correo' },
  { key: 'status', label: 'Estado' },
];

// ── Modal Preview Excel ───────────────────────────────────────────────────────
function ImportPreviewModal({ rows, onClose, onConfirm, importing }: {
  rows: PreviewRow[];
  onClose: () => void;
  onConfirm: (selected: PreviewRow[]) => void;
  importing: boolean;
}) {
  const isBlocked = (r: PreviewRow) => r.status === 'duplicado_exacto' || r.status === 'posible_duplicado';

  const [items, setItems] = useState<PreviewRow[]>(rows.map(r => ({
    ...r,
    selected: !isBlocked(r),
  })));
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggle = (idx: number) =>
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));

  const visibleSelectable = items.filter(r => !isBlocked(r));
  const allChecked = visibleSelectable.length > 0 && visibleSelectable.every(r => r.selected);
  const toggleAll = () => {
    const next = !allChecked;
    setItems(prev => prev.map(r => isBlocked(r) ? r : { ...r, selected: next }));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = items.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.descripcion_conf.toLowerCase().includes(q) ||
      r.direccion.toLowerCase().includes(q) ||
      r.ciudad.toLowerCase().includes(q) ||
      r.correo.toLowerCase().includes(q) ||
      STATUS_LABELS[r.status].label.toLowerCase().includes(q);
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = (a[sortKey] || '').toLowerCase();
        const bv = (b[sortKey] || '').toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : filtered;

  const counts = {
    nuevo: items.filter(r => r.status === 'nuevo').length,
    posible: items.filter(r => r.status === 'posible_duplicado').length,
    exacto: items.filter(r => r.status === 'duplicado_exacto').length,
    selected: items.filter(r => r.selected).length,
  };

  const exportExcel = () => {
    const data = sorted.map(r => ({
      Confeccionista: r.descripcion_conf,
      Dirección: r.direccion,
      Ciudad: r.ciudad,
      Correo: r.correo,
      Estado: STATUS_LABELS[r.status].label,
      'Coincide con': r.matchedWith || '',
      Seleccionado: r.selected ? 'Sí' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Preview');
    XLSX.writeFile(wb, 'preview_importacion.xlsx');
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 inline-block opacity-60">
      {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide mb-1">Vista previa de importación</h3>
          <p className="text-xs text-slate-400">Revisa y selecciona los registros que deseas importar. Los duplicados exactos están bloqueados.</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{counts.nuevo} nuevos</span>
            {counts.posible > 0 && <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{counts.posible} posibles duplicados</span>}
            {counts.exacto > 0 && <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">{counts.exacto} duplicados exactos</span>}
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{counts.selected} seleccionados</span>
          </div>
        </div>

        {/* Toolbar: search + export */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm group">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
            <input
              type="text"
              placeholder="Buscar en la vista previa…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-500">
              Mostrando <span className="text-indigo-700">{sorted.length}</span> de {items.length}
            </div>
            <button onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
              Exportar Excel
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 p-4">
          <div className="rounded-3xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white text-xs uppercase tracking-widest select-none">
                  <th className="px-3 py-4 text-center w-10 border-b border-slate-800">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="rounded cursor-pointer accent-indigo-400" />
                  </th>
                  {PREVIEW_COLS.map(col => (
                    <th key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-4 text-left font-black border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-colors">
                      {col.label}<SortIcon k={col.key} />
                    </th>
                  ))}
                  <th className="px-4 py-4 text-left font-black border-b border-slate-800">Coincide con</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400 font-medium">Sin resultados</td></tr>
                ) : sorted.map((r, i) => {
                  const globalIdx = items.indexOf(r);
                  return (
                    <tr key={i} className={`transition-colors hover:bg-slate-50/70 ${!r.selected ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={r.selected}
                          disabled={isBlocked(r)}
                          onChange={() => toggle(globalIdx)}
                          className="rounded cursor-pointer disabled:cursor-not-allowed accent-indigo-500" />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 break-words min-w-[120px]">{r.descripcion_conf}</td>
                      <td className="px-4 py-3 text-slate-600 break-words min-w-[140px]">{r.direccion}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.ciudad || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 break-words min-w-[120px]">{r.correo || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${STATUS_LABELS[r.status].cls}`}>
                          {STATUS_LABELS[r.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 italic break-words min-w-[120px]">{r.matchedWith || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={importing}
            className="px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={() => onConfirm(items.filter(r => r.selected))}
            disabled={importing || counts.selected === 0}
            className="px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {importing ? 'Importando…' : `Importar ${counts.selected} registros`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confeccionistas Tab ───────────────────────────────────────────────────────
function ConfeccionistasTab({ user }: { user: User }) {
  const [rows, setRows] = useState<Confeccionista[]>([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState<{ open: boolean; editing: Confeccionista | null }>({ open: false, editing: null });
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'MAESTRAS_DOGAMA', 'create');
  const canEdit = hasPermission(user, 'MAESTRAS_DOGAMA', 'edit');
  const canDelete = hasPermission(user, 'MAESTRAS_DOGAMA', 'delete');

  const load = async () => {
    setLoading(true);
    try { setRows(await api.dogamaGetConfeccionistas()); }
    catch { toast.error('Error al cargar confeccionistas'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (r: Confeccionista) => {
    if (!confirm(`¿Eliminar "${r.descripcion_conf}"?`)) return;
    try {
      await api.dogamaDeleteConfeccionista(r.id);
      toast.success('Eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const handleExcelParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (json.length === 0) { toast.error('El archivo está vacío'); return; }
      const preview = buildPreviewRows(json, rows);
      if (preview.length === 0) { toast.error('No se encontraron filas válidas en el Excel'); return; }
      setPreviewRows(preview);
    } catch {
      toast.error('Error al leer el archivo Excel');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirmImport = async (selected: PreviewRow[]) => {
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const toImport = selected.map(r => ({
        Confeccionista: r.descripcion_conf,
        direccion: r.direccion,
        CIUDAD: r.ciudad,
        correo: r.correo,
      }));
      const result = await api.dogamaBulkConfeccionistas(toImport, user.name || user.email);
      toast.success(`Importados: ${result.inserted}${result.duplicates > 0 ? ` | Duplicados ignorados: ${result.duplicates}` : ''}${result.errors > 0 ? ` | Errores: ${result.errors}` : ''}`);
      setPreviewRows(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Error al importar');
    } finally { setImporting(false); }
  };

  const columns: ColumnDef<Confeccionista>[] = [
    { header: '#', key: 'id', sortable: true, render: r => <span className="text-slate-400 text-xs">{r.id}</span> },
    { header: 'Confeccionista', key: 'descripcion_conf', sortable: true,
      render: r => <span className="font-semibold text-slate-800">{r.descripcion_conf}</span> },
    { header: 'Dirección', key: 'direccion', sortable: true, minWidth: '160px',
      render: r => <span className="text-slate-600">{r.direccion}</span> },
    { header: 'Ciudad', key: 'ciudad', sortable: true, noWrap: true },
    { header: 'Teléfono', key: 'telefono', sortable: false, noWrap: true },
    { header: 'Correo', key: 'correo', sortable: false, minWidth: '160px',
      render: r => <span className="text-xs text-slate-500">{r.correo || '—'}</span> },
    { header: 'Estado', key: 'estado', sortable: true,
      render: r => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.estado}
        </span>
      )},
    { header: 'Creado por', key: 'usuariocreacion', sortable: false,
      render: r => <span className="text-xs text-slate-400">{r.usuariocreacion || '—'}</span> },
    { header: 'Fecha', key: 'fecha_creacion', sortable: true,
      render: r => <span className="text-xs text-slate-400">{r.fecha_creacion ? new Date(r.fecha_creacion).toLocaleDateString('es-CO') : '—'}</span> },
    ...(canEdit || canDelete ? [{
      header: 'Acciones',
      key: 'acciones' as keyof Confeccionista,
      sortable: false,
      render: (r: Confeccionista) => (
        <div className="flex gap-2">
          {canEdit && (
            <button onClick={() => setFormModal({ open: true, editing: r })}
              className="text-indigo-500 hover:text-indigo-700 font-bold text-xs transition">Editar</button>
          )}
          {canDelete && (
            <button onClick={() => handleDelete(r)}
              className="text-red-400 hover:text-red-600 font-bold text-xs transition">Eliminar</button>
          )}
        </div>
      ),
    }] : []),
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {canCreate && (
          <button onClick={() => setFormModal({ open: true, editing: null })}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition shadow-sm">
            + Nuevo
          </button>
        )}
        {canCreate && (
          <label className="px-5 py-2.5 rounded-2xl text-sm font-black cursor-pointer transition bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={fileRef} onChange={handleExcelParse} />
          </label>
        )}
        <button
          onClick={() => downloadTemplate('formato_confeccionistas.xlsx',
            ['Confeccionista', 'direccion', 'correo', 'CIUDAD'],
            { Confeccionista: 'EJEMPLO SAS', direccion: 'CR 45 # 80-12', correo: 'ejemplo@correo.com', CIUDAD: 'MEDELLÍN' })}
          className="px-5 py-2.5 rounded-2xl text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition shadow-sm">
          📄 Ver Formato
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable<Confeccionista>
          data={rows}
          columns={columns}
          searchPlaceholder="Buscar confeccionista, dirección, ciudad…"
          excelFileName="confeccionistas.xlsx"
          excelSheetName="Confeccionistas"
        />
      )}

      {formModal.open && (
        <FormModal
          editing={formModal.editing}
          user={user}
          onClose={() => setFormModal({ open: false, editing: null })}
          onSaved={load}
        />
      )}

      {previewRows && (
        <ImportPreviewModal
          rows={previewRows}
          onClose={() => setPreviewRows(null)}
          onConfirm={handleConfirmImport}
          importing={importing}
        />
      )}
    </div>
  );
}

// ── Tab Catálogo Genérico (Marcas + Tipos Prenda) ─────────────────────────────
interface CatalogItem { id: number; descripcion: string; estado: string; fecha_creacion: string; usuariocreacion: string | null; }
type CatalogRowStatus = 'nuevo' | 'ya_existe' | 'duplicado_archivo';

interface CatalogPreviewRow { index: number; descripcion: string; status: CatalogRowStatus; selected: boolean; }

const CATALOG_STATUS: Record<CatalogRowStatus, { label: string; cls: string }> = {
  nuevo:             { label: 'Nuevo',                cls: 'bg-emerald-100 text-emerald-700' },
  ya_existe:         { label: 'Ya existe en BD',      cls: 'bg-blue-100 text-blue-700' },
  duplicado_archivo: { label: 'Duplicado en archivo', cls: 'bg-amber-100 text-amber-700' },
};

function buildCatalogPreview(json: any[], existing: CatalogItem[]): CatalogPreviewRow[] {
  const existingNorm = new Set(existing.map(e => normalize(e.descripcion)));
  const seen = new Set<string>();
  return json
    .map((row, i) => {
      const desc = (row.descripcion || row.Descripcion || row.DESCRIPCION || '').trim();
      if (!desc) return null;
      const nd = normalize(desc);
      let status: CatalogRowStatus = 'nuevo';
      if (seen.has(nd)) status = 'duplicado_archivo';
      else if (existingNorm.has(nd)) status = 'ya_existe';
      if (status !== 'duplicado_archivo') seen.add(nd);
      return { index: i, descripcion: desc, status, selected: status !== 'duplicado_archivo' };
    })
    .filter(Boolean) as CatalogPreviewRow[];
}

function CatalogPreviewModal({ rows, label, onClose, onConfirm, importing }: {
  rows: CatalogPreviewRow[]; label: string;
  onClose: () => void; onConfirm: (sel: CatalogPreviewRow[]) => void; importing: boolean;
}) {
  const [items, setItems] = useState(rows);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'descripcion' | 'status' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const isBk = (r: CatalogPreviewRow) => r.status === 'duplicado_archivo';
  const toggleAll = () => {
    const eligible = items.filter(r => !isBk(r));
    const next = !eligible.every(r => r.selected);
    setItems(prev => prev.map(r => isBk(r) ? r : { ...r, selected: next }));
  };
  const toggle = (idx: number) => setItems(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));

  const counts = {
    nuevo: items.filter(r => r.status === 'nuevo').length,
    ya_existe: items.filter(r => r.status === 'ya_existe').length,
    duplicado: items.filter(r => r.status === 'duplicado_archivo').length,
    selected: items.filter(r => r.selected).length,
  };

  const filtered = items
    .filter(r => !search || r.descripcion.toLowerCase().includes(search.toLowerCase()) || CATALOG_STATUS[r.status].label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = sortKey === 'descripcion' ? a.descripcion : a.status;
      const bv = sortKey === 'descripcion' ? b.descripcion : b.status;
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span className="ml-1 opacity-60">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
  );
  const handleSort = (k: 'descripcion' | 'status') => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      Descripción: r.descripcion, Estado: CATALOG_STATUS[r.status].label, Seleccionado: r.selected ? 'Sí' : 'No',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Preview');
    XLSX.writeFile(wb, `preview_${label}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide mb-1">Vista previa — {label}</h3>
          <p className="text-xs text-slate-400">Los duplicados dentro del mismo archivo están bloqueados. Los que ya existen en BD pueden incluirse.</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{counts.nuevo} nuevos</span>
            {counts.ya_existe > 0 && <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{counts.ya_existe} ya existen en BD</span>}
            {counts.duplicado > 0 && <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{counts.duplicado} dup. en archivo</span>}
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{counts.selected} seleccionados</span>
          </div>
        </div>
        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm group">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
            <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
          </div>
          <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-500">
            <span className="text-indigo-700">{filtered.length}</span> / {items.length}
          </div>
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm transition active:scale-95">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
            Exportar
          </button>
        </div>
        {/* Table */}
        <div className="overflow-auto flex-1 p-4">
          <div className="rounded-3xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white text-xs uppercase tracking-widest select-none">
                  <th className="px-3 py-4 text-center w-10 border-b border-slate-800">
                    <input type="checkbox" checked={items.filter(r => !isBk(r)).every(r => r.selected)} onChange={toggleAll} className="rounded cursor-pointer accent-indigo-400" />
                  </th>
                  <th className="px-4 py-4 text-left font-black border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition" onClick={() => handleSort('descripcion')}>
                    Descripción <SortIcon k="descripcion" />
                  </th>
                  <th className="px-4 py-4 text-left font-black border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition" onClick={() => handleSort('status')}>
                    Estado <SortIcon k="status" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-10 text-center text-slate-400">Sin resultados</td></tr>
                ) : filtered.map((r, i) => {
                  const gi = items.indexOf(r);
                  return (
                    <tr key={i} className={`transition-colors hover:bg-slate-50/70 ${!r.selected ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={r.selected} disabled={isBk(r)} onChange={() => toggle(gi)}
                          className="rounded cursor-pointer disabled:cursor-not-allowed accent-indigo-500" />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.descripcion}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${CATALOG_STATUS[r.status].cls}`}>
                          {CATALOG_STATUS[r.status].label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={importing} className="px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">Cancelar</button>
          <button onClick={() => onConfirm(items.filter(r => r.selected))} disabled={importing || counts.selected === 0}
            className="px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {importing ? 'Importando…' : `Importar ${counts.selected} registros`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogTab({ user, table, label }: { user: User; table: string; label: string }) {
  const [rows, setRows] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: CatalogItem | null }>({ open: false, editing: null });
  const [form, setForm] = useState({ descripcion: '', estado: 'activo' });
  const [saving, setSaving] = useState(false);
  const [previewRows, setPreviewRows] = useState<CatalogPreviewRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'MAESTRAS_DOGAMA', 'create');
  const canEdit = hasPermission(user, 'MAESTRAS_DOGAMA', 'edit');
  const canDelete = hasPermission(user, 'MAESTRAS_DOGAMA', 'delete');

  const load = async () => {
    setLoading(true);
    try { setRows(await api.dogamaGetCatalog(table)); }
    catch { toast.error(`Error al cargar ${label}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [table]);

  const openNew = () => { setForm({ descripcion: '', estado: 'activo' }); setModal({ open: true, editing: null }); };
  const openEdit = (r: CatalogItem) => { setForm({ descripcion: r.descripcion, estado: r.estado }); setModal({ open: true, editing: r }); };

  const handleSave = async () => {
    if (!form.descripcion.trim()) { toast.error('Descripción es obligatoria'); return; }
    setSaving(true);
    try {
      if (modal.editing) {
        await api.dogamaUpdateCatalogItem(table, modal.editing.id, form);
        toast.success('Actualizado');
      } else {
        await api.dogamaCreateCatalogItem(table, { ...form, usuariocreacion: user.name || user.email });
        toast.success('Creado');
      }
      setModal({ open: false, editing: null }); load();
    } catch (e: any) { toast.error(e?.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (r: CatalogItem) => {
    if (!confirm(`¿Eliminar "${r.descripcion}"?`)) return;
    try { await api.dogamaDeleteCatalogItem(table, r.id); toast.success('Eliminado'); load(); }
    catch { toast.error('Error al eliminar'); }
  };

  const handleExcelParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const json: any[] = XLSX.utils.sheet_to_json(XLSX.read(data).Sheets[XLSX.read(data).SheetNames[0]], { defval: '' });
      if (json.length === 0) { toast.error('Archivo vacío'); return; }
      const preview = buildCatalogPreview(json, rows);
      if (preview.length === 0) { toast.error('No se encontraron filas válidas'); return; }
      setPreviewRows(preview);
    } catch { toast.error('Error al leer el archivo'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleConfirmImport = async (selected: CatalogPreviewRow[]) => {
    if (!selected.length) return;
    setImporting(true);
    try {
      const r = await api.dogamaBulkCatalog(table, selected.map(s => ({ descripcion: s.descripcion })), user.name || user.email);
      toast.success(`Importados: ${r.inserted}${r.duplicates > 0 ? ` | Ya existían: ${r.duplicates}` : ''}${r.errors > 0 ? ` | Errores: ${r.errors}` : ''}`);
      setPreviewRows(null); load();
    } catch (e: any) { toast.error(e?.message || 'Error al importar'); }
    finally { setImporting(false); }
  };

  const columns: ColumnDef<CatalogItem>[] = [
    { header: '#', key: 'id', sortable: true, render: r => <span className="text-slate-400 text-xs">{r.id}</span> },
    { header: 'Descripción', key: 'descripcion', sortable: true, render: r => <span className="font-semibold text-slate-800">{r.descripcion}</span> },
    { header: 'Estado', key: 'estado', sortable: true, render: r => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.estado}</span>
    )},
    { header: 'Creado por', key: 'usuariocreacion', sortable: false, render: r => <span className="text-xs text-slate-400">{r.usuariocreacion || '—'}</span> },
    { header: 'Fecha', key: 'fecha_creacion', sortable: true, render: r => <span className="text-xs text-slate-400">{r.fecha_creacion ? new Date(r.fecha_creacion).toLocaleDateString('es-CO') : '—'}</span> },
    ...(canEdit || canDelete ? [{
      header: 'Acciones', key: 'acciones' as keyof CatalogItem, sortable: false,
      render: (r: CatalogItem) => (
        <div className="flex gap-2">
          {canEdit && <button onClick={() => openEdit(r)} className="text-indigo-500 hover:text-indigo-700 font-bold text-xs">Editar</button>}
          {canDelete && <button onClick={() => handleDelete(r)} className="text-red-400 hover:text-red-600 font-bold text-xs">Eliminar</button>}
        </div>
      ),
    }] : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        {canCreate && <button onClick={openNew} className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition shadow-sm">+ Nuevo</button>}
        {canCreate && (
          <label className="px-5 py-2.5 rounded-2xl text-sm font-black cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition">
            Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" ref={fileRef} onChange={handleExcelParse} />
          </label>
        )}
        <button
          onClick={() => downloadTemplate(`formato_${table}.xlsx`, ['descripcion'], { descripcion: `Ejemplo ${label}` })}
          className="px-5 py-2.5 rounded-2xl text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition shadow-sm">
          📄 Ver Formato
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <DataTable<CatalogItem> data={rows} columns={columns} searchPlaceholder={`Buscar ${label.toLowerCase()}…`} excelFileName={`${table}.xlsx`} excelSheetName={label} />
      )}
      {previewRows && (
        <CatalogPreviewModal rows={previewRows} label={label}
          onClose={() => setPreviewRows(null)} onConfirm={handleConfirmImport} importing={importing} />
      )}
      {modal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setModal({ open: false, editing: null }); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h3 className="text-lg font-black text-slate-800 mb-5 uppercase">{modal.editing ? `Editar ${label}` : `Nuevo ${label}`}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descripción *</label>
                <input type="text" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Estado</label>
                <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition">
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setModal({ open: false, editing: null })} className="px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab Vinculación Correo ────────────────────────────────────────────────────
interface EmailAccount { id: number; provider: string; email: string; display_name: string; is_active: boolean; created_at: string; }

const PROVIDER_META: Record<string, { label: string; color: string; icon: string; setupUrl: string; setupLabel: string }> = {
  gmail: {
    label: 'Gmail',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: '✉️',
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupLabel: 'Google Cloud Console',
  },
  outlook: {
    label: 'Outlook / Microsoft 365',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    icon: '📧',
    setupUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    setupLabel: 'Azure Portal',
  },
};

function VinculacionCorreoTab({ user }: { user: User }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const canEdit = hasPermission(user, 'MAESTRAS_DOGAMA', 'edit');

  const load = async () => {
    setLoading(true);
    try { setAccounts(await api.dogamaGetEmailConfig()); }
    catch { toast.error('Error al cargar configuración'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Listen for OAuth popup postMessage
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'DOGAMA_OAUTH_SUCCESS') {
        toast.success(`✅ ${PROVIDER_META[e.data.provider]?.label || e.data.provider} vinculado: ${e.data.email}`);
        load();
      } else if (e.data?.type === 'DOGAMA_OAUTH_ERROR') {
        toast.error(`Error al vincular: ${e.data.error}`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleConnect = (provider: 'gmail' | 'outlook') => {
    const url = api.dogamaEmailInitUrl(provider);
    window.open(url, `oauth_${provider}`, 'width=520,height=640,scrollbars=yes,popup=yes');
  };

  const handleUnlink = async (provider: string) => {
    if (!confirm(`¿Desvincular ${PROVIDER_META[provider]?.label || provider}?`)) return;
    setUnlinking(provider);
    try { await api.dogamaDeleteEmailConfig(provider); toast.success('Cuenta desvinculada'); load(); }
    catch { toast.error('Error al desvincular'); }
    finally { setUnlinking(null); }
  };

  const handleTest = async (provider: string) => {
    setTesting(provider);
    try {
      const r = await api.dogamaTestEmail(provider);
      toast.success(r.message || 'Correo de prueba enviado');
    } catch (e: any) { toast.error(e?.message || 'Error al enviar prueba'); }
    finally { setTesting(null); }
  };

  const getAccount = (p: string) => accounts.find(a => a.provider === p);

  return (
    <div className="max-w-3xl">
      {/* Info banner */}
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3 items-start">
        <span className="text-2xl mt-0.5">⚡</span>
        <div>
          <p className="text-sm font-bold text-amber-800">Envío de correos vía cuenta propia</p>
          <p className="text-xs text-amber-700 mt-1">
            Al vincular tu Gmail u Outlook, los correos del módulo Dogama se enviarán desde esa cuenta.
            Si no hay cuenta vinculada, se usa Resend (servicio actual del sistema).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {(['gmail', 'outlook'] as const).map(provider => {
            const meta = PROVIDER_META[provider];
            const account = getAccount(provider);
            return (
              <div key={provider} className={`rounded-3xl border-2 p-5 transition ${account ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-2xl ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-base">{meta.label}</p>
                      {account ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                          <span className="text-sm text-slate-600">{account.display_name}</span>
                          <span className="text-xs text-slate-400">({account.email})</span>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 mt-0.5">No vinculado</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {account ? (
                      <>
                        <button
                          onClick={() => handleTest(provider)}
                          disabled={testing === provider}
                          className="px-4 py-2 rounded-2xl text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 transition">
                          {testing === provider ? 'Enviando…' : '📨 Enviar prueba'}
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => handleUnlink(provider)}
                            disabled={unlinking === provider}
                            className="px-4 py-2 rounded-2xl text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition">
                            {unlinking === provider ? 'Desvinculando…' : '🔗 Desvincular'}
                          </button>
                        )}
                      </>
                    ) : canEdit ? (
                      <button
                        onClick={() => handleConnect(provider)}
                        className="px-5 py-2 rounded-2xl text-sm font-black bg-slate-900 text-white hover:bg-slate-700 transition shadow-sm">
                        Vincular con {meta.label}
                      </button>
                    ) : null}
                  </div>
                </div>
                {account && (
                  <p className="text-xs text-slate-400 mt-3">
                    Vinculado el {new Date(account.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Setup Guide */}
      <div className="mt-6">
        <button onClick={() => setShowSetup(v => !v)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition">
          <span className={`transition-transform ${showSetup ? 'rotate-90' : ''}`}>▶</span>
          ¿Cómo configurar las credenciales OAuth?
        </button>
        {showSetup && (
          <div className="mt-4 p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-5 text-sm">
            {(['gmail', 'outlook'] as const).map(provider => (
              <div key={provider}>
                <p className="font-black text-slate-700 mb-2">{PROVIDER_META[provider].label}</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 text-xs">
                  {provider === 'gmail' ? (
                    <>
                      <li>Ir a <a href={PROVIDER_META.gmail.setupUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">Google Cloud Console</a> → Crear credencial OAuth 2.0 → Web Application</li>
                      <li>Agregar URI de redirección: <code className="bg-slate-200 px-1 rounded">{`${window.location.origin.replace('5173', '8081')}/api/dogama/email-config/callback`}</code></li>
                      <li>Copiar el <strong>Client ID</strong> y <strong>Client Secret</strong></li>
                      <li>Agregar en el <code className="bg-slate-200 px-1 rounded">.env</code> del backend: <code className="bg-slate-200 px-1 rounded">GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...</code></li>
                      <li>Habilitar la API <strong>Gmail API</strong> en Google Cloud</li>
                    </>
                  ) : (
                    <>
                      <li>Ir a <a href={PROVIDER_META.outlook.setupUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">Azure Portal</a> → Registros de aplicaciones → Nuevo registro</li>
                      <li>URI de redirección: <code className="bg-slate-200 px-1 rounded">{`${window.location.origin.replace('5173', '8081')}/api/dogama/email-config/callback`}</code></li>
                      <li>En <strong>Permisos de API</strong> agregar: <code className="bg-slate-200 px-1 rounded">Mail.Send</code></li>
                      <li>Agregar en el <code className="bg-slate-200 px-1 rounded">.env</code>: <code className="bg-slate-200 px-1 rounded">MICROSOFT_CLIENT_ID=... MICROSOFT_CLIENT_SECRET=...</code></li>
                    </>
                  )}
                </ol>
              </div>
            ))}
            <p className="text-xs text-slate-400">Después de editar el .env, reiniciar el contenedor del backend.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'confeccionistas', label: 'Confeccionistas' },
  { key: 'marcas', label: 'Marcas Dogama' },
  { key: 'tipos-prenda', label: 'Tipos de Prendas' },
  { key: 'tipos-oc', label: 'Tipos OC' },
  { key: 'vinculacion-correo', label: 'Vinculación Correo' },
];

export default function MaestrasDogama({ user }: Props) {
  const [tab, setTab] = useState('confeccionistas');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Maestras Dogama</h1>
        <p className="text-slate-400 text-sm mt-1">Operación Jhon Uribe</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'confeccionistas' && <ConfeccionistasTab user={user} />}
      {tab === 'marcas' && <CatalogTab user={user} table="dogama_marcas" label="Marca Dogama" />}
      {tab === 'tipos-prenda' && <CatalogTab user={user} table="dogama_tipos_prenda" label="Tipo de Prenda" />}
      {tab === 'tipos-oc' && <CatalogTab user={user} table="dogama_tipos_oc" label="Tipo OC" />}
      {tab === 'vinculacion-correo' && <VinculacionCorreoTab user={user} />}
    </div>
  );
}
