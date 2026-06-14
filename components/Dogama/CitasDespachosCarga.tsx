import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Search, Download, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { hasPermission } from '../../utils/permissions';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface Props { user: User; }

// ── Catalog types ─────────────────────────────────────────────────────────────

interface CatalogItem { id: number; descripcion: string; estado: string; }
interface ConfItem    { id: number; descripcion_conf: string; }

// ── Validation / master data ──────────────────────────────────────────────────

interface ValidationCtx {
  marcas:          CatalogItem[];
  proveedores:     CatalogItem[];
  confeccionistas: ConfItem[];
  tiposPrenda:     CatalogItem[];
  tiposOc:         CatalogItem[];
}

type MatchStatus = 'exact' | 'similar' | 'not_found' | 'empty';

interface MatchResult {
  status:      MatchStatus;
  id:          number | null;
  matchedName: string | null;
  suggestion:  string | null;
}

function normM(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.\-,;:'"()[\]]/g, ' ')
    .replace(/\bs\.?a\.?s\.?\b/g, 'sas')
    .replace(/\bs\.?a\.?\b/g, 'sa')
    .replace(/\bltda\.?\b/g, 'ltda')
    .replace(/\s+/g, ' ').trim();
}

// Suffixes that appear in many company names and are useless for matching
const COMPANY_TOKENS = new Set(['sas', 'sa', 'ltda', 'eu', 'de', 'y', 'la', 'el', 'los', 'las', 'and']);

function matchCatalog(name: string, list: { id: number; descripcion: string }[]): MatchResult {
  const n = normM(name);
  if (!n) return { status: 'empty', id: null, matchedName: null, suggestion: null };

  for (const item of list) {
    if (normM(item.descripcion) === n)
      return { status: 'exact', id: item.id, matchedName: item.descripcion, suggestion: null };
  }

  // Prefix/contains match — only for longer strings (handles Excel truncation like "CREACIONES GU...")
  for (const item of list) {
    const m = normM(item.descripcion);
    if (n.length >= 6 && m.length >= 6 && (m.startsWith(n) || n.startsWith(m)))
      return { status: 'similar', id: item.id, matchedName: item.descripcion, suggestion: item.descripcion };
  }

  // Word-overlap: exact word equality only, skip company tokens, raise threshold to 0.6
  const words = n.split(' ').filter(w => w.length > 3 && !COMPANY_TOKENS.has(w));
  if (words.length) {
    let best: MatchResult = { status: 'not_found', id: null, matchedName: null, suggestion: null };
    let bestScore = 0.6;
    for (const item of list) {
      const mw = normM(item.descripcion).split(' ').filter(w => w.length > 3 && !COMPANY_TOKENS.has(w));
      if (!mw.length) continue;
      const hits = words.filter(w => mw.includes(w)).length;
      const score = hits / Math.max(words.length, mw.length, 1);
      if (score > bestScore) {
        bestScore = score;
        best = { status: 'similar', id: item.id, matchedName: item.descripcion, suggestion: item.descripcion };
      }
    }
    if (best.status !== 'not_found') return best;
  }

  return { status: 'not_found', id: null, matchedName: null, suggestion: null };
}

function matchConf(name: string, list: ConfItem[]): MatchResult {
  return matchCatalog(name, list.map(c => ({ id: c.id, descripcion: c.descripcion_conf })));
}

// ── Row types ─────────────────────────────────────────────────────────────────

type DupStatus = 'nuevo' | 'duplicado_bd' | 'duplicado_archivo';

interface DespachoRow {
  index: number;
  fecha: string; orden_cargue: string; confeccionista_txt: string;
  orden_servicio: string; marca_txt: string; referencia: string;
  lote: string; unidades: string; tipo_prenda_txt: string;
  status: DupStatus; selected: boolean;
  // resolved:
  conf_match: MatchResult; marca_match: MatchResult; tipo_match: MatchResult;
}

interface CitaRow {
  index: number;
  fecha: string; turno: string; hora_inicio: string; hora_fin: string;
  marca_txt: string; referencia: string; color: string; lote: string;
  mesa: string; cantidad: string; proveedor_txt: string;
  numero_documento: string; tipo_oc: string;
  status: DupStatus; selected: boolean;
  // resolved:
  marca_match: MatchResult; prov_match: MatchResult; tipo_oc_match: MatchResult;
}

// ── DB row types ──────────────────────────────────────────────────────────────

interface Despacho {
  id: number; fecha: string | null; orden_cargue: string | null;
  confeccionista_id: number | null; confeccionista_txt: string | null; confeccionista_nombre: string | null;
  orden_servicio: string | null; marca_id: number | null; marca_txt: string | null; marca_nombre: string | null;
  referencia: string | null; lote: string | null; unidades: number | null;
  tipo_prenda_id: number | null; tipo_prenda_txt: string | null; tipo_prenda_nombre: string | null;
  estado: string; usuario_creacion: string | null; fecha_creacion: string;
}

interface Cita {
  id: number; fecha: string | null; turno: string | null;
  hora_inicio: string | null; hora_fin: string | null;
  marca_id: number | null; marca_txt: string | null; marca_nombre: string | null;
  referencia: string | null; color: string | null; lote: string | null;
  mesa: number | null; cantidad: number | null;
  proveedor: string | null; proveedor_id: number | null; proveedor_nombre: string | null;
  numero_documento: string | null;
  tipo_oc: string | null; tipo_oc_id: number | null; tipo_oc_nombre: string | null;
  estado: string; usuario_creacion: string | null; fecha_creacion: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const str  = (v: any) => String(v ?? '').trim();
const num  = (v: any) => { const n = Number(v); return isNaN(n) ? '' : String(Math.round(n)); };
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function excelDate(v: any): string {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return String(v);
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const ddmm = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
  const iso = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return String(v);
}

function excelTime(v: any): string {
  if (!v && v !== 0) return '';
  if (typeof v === 'number' && v < 1) {
    const total = Math.round(v * 86400);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return String(v);
}

const downloadTemplate = (filename: string, cols: string[], example: Record<string, string>) => {
  const ws = XLSX.utils.aoa_to_sheet([cols, cols.map(c => example[c] || '')]);
  ws['!cols'] = cols.map(c => ({ wch: Math.max(c.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Formato');
  XLSX.writeFile(wb, filename);
};

// ── Mini-modal para crear confeccionista desde preview ────────────────────────

function ConfMiniModal({ name, usuariocreacion, onClose, onCreated }: {
  name: string;
  usuariocreacion: string;
  onClose: () => void;
  onCreated: (conf: ConfItem) => void;
}) {
  const [ciudad, setCiudad]   = useState('');
  const [correo, setCorreo]   = useState('');
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.dogamaCreateConfeccionista({
        descripcion_conf: name,
        direccion: '',
        ciudad: ciudad || null,
        correo: correo || null,
        estado: 'activo',
        usuariocreacion,
      });
      onCreated(res);
      toast.success(`Confeccionista "${name}" creado`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || `Error al crear "${name}"`);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-150">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-0.5">Nuevo Confeccionista</p>
          <p className="text-base font-black text-slate-800">{name}</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Ciudad <span className="text-slate-300 font-normal">(opcional)</span></label>
            <input type="text" value={ciudad} onChange={e => setCiudad(e.target.value)}
              placeholder="Ej: MEDELLÍN"
              className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 focus:bg-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Correo <span className="text-slate-300 font-normal">(opcional)</span></label>
            <input type="email" value={correo} onChange={e => setCorreo(e.target.value)}
              placeholder="correo@empresa.com"
              className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 focus:bg-white" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Match badge ───────────────────────────────────────────────────────────────

function MatchBadge({ m, label }: { m: MatchResult; label: string }) {
  if (m.status === 'empty')    return <span className="text-slate-300 text-xs italic">—</span>;
  if (m.status === 'exact')    return <span className="text-emerald-600 font-semibold text-xs">{label}</span>;
  if (m.status === 'similar')  return (
    <span className="text-amber-600 text-xs" title={`Sugerido: ${m.suggestion}`}>
      {label} <span className="opacity-70">→ {m.suggestion}</span>
    </span>
  );
  return <span className="text-red-500 font-bold text-xs">{label} ⚠</span>;
}

// ── Inline create buttons ─────────────────────────────────────────────────────

interface UnresolvedItem { name: string; count: number; }


// ── Combobox buscable (input + datalist nativo) ───────────────────────────────

function SearchableCombo({ listId, options, value, onChange, placeholder, className }: {
  listId: string;
  options: { id: number; label: string }[];
  value: string;
  onChange: (text: string, matchedId: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <>
      <input list={listId} value={value}
        onChange={e => {
          const text = e.target.value;
          const m = options.find(o => normM(o.label) === normM(text));
          onChange(text, m?.id ?? null);
        }}
        placeholder={placeholder || 'Buscar…'}
        onClick={e => e.stopPropagation()}
        className={`text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition ${className ?? ''}`} />
      <datalist id={listId}>
        {options.map(o => <option key={o.id} value={o.label} />)}
      </datalist>
    </>
  );
}

// ── Controles de tabla reutilizables (igual que DataTable) ───────────────────

function PreviewTableControls({
  search, onSearch, total, pageSize, onPageSize, currentPage, totalPages, onPage, onExport,
  searchPlaceholder,
}: {
  search: string; onSearch: (v: string) => void;
  total: number; filtered: number;
  pageSize: number | 'all'; onPageSize: (v: number | 'all') => void;
  currentPage: number; totalPages: number; onPage: (p: number) => void;
  onExport: () => void;
  searchPlaceholder?: string;
}) {
  return (
    <>
      {/* Barra igual a DataTable */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 min-w-0 w-full sm:max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors w-5 h-5" />
          <input type="text" placeholder={searchPlaceholder || 'Buscar en la vista previa…'}
            value={search} onChange={e => { onSearch(e.target.value); onPage(1); }}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total:</span>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black">{total}</span>
          </div>
          <button onClick={onExport}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/10 active:scale-95 transition-all">
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>
      {/* Paginación igual a DataTable */}
      <div className="px-4 sm:px-6 py-2 border-b border-slate-100 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ver:</span>
          <select value={pageSize}
            onChange={e => { onPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); onPage(1); }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-indigo-600 transition-all cursor-pointer">
            {[5,10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
            <option value="all">Todos</option>
          </select>
        </div>
        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={() => onPage(Math.max(currentPage - 1, 1))} disabled={currentPage === 1}
              className={`p-2 rounded-xl border transition-all ${currentPage === 1 ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'}`}>
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-500">Página {currentPage} de {totalPages}</span>
            <button onClick={() => onPage(Math.min(currentPage + 1, totalPages))} disabled={currentPage === totalPages}
              className={`p-2 rounded-xl border transition-all ${currentPage === totalPages ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'}`}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        <span className="text-xs text-slate-400 font-semibold ml-auto">{total} filas</span>
      </div>
    </>
  );
}

// ── DESPACHOS PREVIEW MODAL ───────────────────────────────────────────────────

function DespachoPreviewModal({
  rows: initRows, ctx: initCtx, user, onClose, onConfirm, importing,
}: {
  rows: DespachoRow[];
  ctx: ValidationCtx;
  user: User;
  onClose: () => void;
  onConfirm: (rows: DespachoRow[], ctx: ValidationCtx) => void;
  importing: boolean;
}) {
  const [marcas, setMarcas] = useState(initCtx.marcas);
  const confs = initCtx.confeccionistas;
  const [tipos, setTipos]   = useState(initCtx.tiposPrenda);
  const [creatingM, setCreatingM] = useState<Set<string>>(new Set());
  const [creatingT, setCreatingT] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (col: string) => {
    if (sortCol === col) { if (sortDir === 'asc') setSortDir('desc'); else { setSortCol(null); } }
    else { setSortCol(col); setSortDir('asc'); }
  };

  // Re-resolve matches when master data changes
  const rows = useMemo<DespachoRow[]>(() =>
    initRows.map(r => ({
      ...r,
      conf_match:  matchConf(r.confeccionista_txt, confs),
      marca_match: matchCatalog(r.marca_txt, marcas),
      tipo_match:  matchCatalog(r.tipo_prenda_txt, tipos),
    })),
    [initRows, confs, marcas, tipos]
  );

  const [selected, setSelected] = useState<boolean[]>(() => initRows.map(r => r.status === 'nuevo'));

  const createMarca = async (name: string) => {
    setCreatingM(prev => new Set(prev).add(name));
    try {
      const res = await api.dogamaCreateCatalogItem('dogama_marcas', { descripcion: name, estado: 'activo', usuariocreacion: user.name || user.email });
      setMarcas(prev => [...prev, res]);
      toast.success(`Marca "${name}" creada`);
    } catch { toast.error(`Error al crear marca "${name}"`); }
    finally { setCreatingM(prev => { const s = new Set(prev); s.delete(name); return s; }); }
  };

  const createTipo = async (name: string) => {
    setCreatingT(prev => new Set(prev).add(name));
    try {
      const res = await api.dogamaCreateCatalogItem('dogama_tipos_prenda', { descripcion: name, estado: 'activo', usuariocreacion: user.name || user.email });
      setTipos(prev => [...prev, res]);
      toast.success(`Tipo de prenda "${name}" creado`);
    } catch { toast.error(`Error al crear tipo "${name}"`); }
    finally { setCreatingT(prev => { const s = new Set(prev); s.delete(name); return s; }); }
  };

  const acceptMarcaSuggestion = (original: string, id: number, name: string) => {
    setMarcas(prev => prev.map(m => m.id === id ? m : m));
    // Force re-match by adding the original name as an alias via a fake entry
    setMarcas(prev => {
      if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
      return [...prev, { id, descripcion: original, estado: 'activo' }];
    });
    toast.success(`"${original}" mapeado a "${name}"`);
  };

  const acceptTipoSuggestion = (original: string, id: number, name: string) => {
    setTipos(prev => {
      if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
      return [...prev, { id, descripcion: original, estado: 'activo' }];
    });
    toast.success(`"${original}" mapeado a "${name}"`);
  };

  const notFoundMarcas = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => { if (r.marca_txt && r.marca_match.status === 'not_found') map.set(r.marca_txt, (map.get(r.marca_txt) || 0) + 1); });
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [rows]);

  const notFoundTipos = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => { if (r.tipo_prenda_txt && r.tipo_match.status === 'not_found') map.set(r.tipo_prenda_txt, (map.get(r.tipo_prenda_txt) || 0) + 1); });
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [rows]);

  const similarMarcas = useMemo(() => {
    const seen = new Set<string>();
    return rows.flatMap(r => {
      if (r.marca_match.status !== 'similar' || seen.has(r.marca_txt)) return [];
      seen.add(r.marca_txt);
      return [{ original: r.marca_txt, suggested: r.marca_match.matchedName!, id: r.marca_match.id! }];
    });
  }, [rows]);

  const similarTipos = useMemo(() => {
    const seen = new Set<string>();
    return rows.flatMap(r => {
      if (r.tipo_match.status !== 'similar' || seen.has(r.tipo_prenda_txt)) return [];
      seen.add(r.tipo_prenda_txt);
      return [{ original: r.tipo_prenda_txt, suggested: r.tipo_match.matchedName!, id: r.tipo_match.id! }];
    });
  }, [rows]);

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(rows.length / (pageSize as number)) || 1;
  React.useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages]);

  const exportDespachos = () => {
    const exportRows = filtered.map(r => ({
      Fecha: r.fecha, 'Ord. Cargue': r.orden_cargue, Confeccionista: r.confeccionista_txt,
      'Ord. Servicio': r.orden_servicio, Marca: r.marca_txt, Referencia: r.referencia,
      Lote: r.lote, Unidades: r.unidades, 'Tipo Prenda': r.tipo_prenda_txt, Estado: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Despachos');
    XLSX.writeFile(wb, 'preview_despachos.xlsx');
  };

  const q = search.toLowerCase();
  const filtered = rows.filter(r =>
    !q || [r.confeccionista_txt, r.marca_txt, r.referencia, r.lote, r.tipo_prenda_txt, r.orden_cargue]
      .some(v => (v || '').toLowerCase().includes(q))
  );

  const DCOL: Record<string, keyof DespachoRow | null> = {
    'Fecha': 'fecha', 'Ord.Cargue': 'orden_cargue', 'Confeccionista': 'confeccionista_txt',
    'Ord.Servicio': 'orden_servicio', 'Marca': 'marca_txt', 'Referencia': 'referencia',
    'Lote': 'lote', 'Und.': 'unidades', 'Tipo Prenda': 'tipo_prenda_txt', 'Estado': 'status',
  };
  const dSorted = sortCol ? [...filtered].sort((a, b) => {
    const k = DCOL[sortCol] as keyof DespachoRow;
    if (!k) return 0;
    const av = String(a[k] ?? ''); const bv = String(b[k] ?? '');
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  }) : filtered;
  const paginated = pageSize === 'all' ? dSorted : dSorted.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  const counts = {
    nuevo: rows.filter(r => r.status === 'nuevo').length,
    dup_bd: rows.filter(r => r.status === 'duplicado_bd').length,
    dup_arch: rows.filter(r => r.status === 'duplicado_archivo').length,
    selected: selected.filter(Boolean).length,
    unresolved: notFoundMarcas.length + notFoundTipos.length + similarMarcas.length + similarTipos.length,
  };

  const isBlocked = (r: DespachoRow) => r.status !== 'nuevo';
  const allChecked = filtered.filter(r => !isBlocked(r)).every((r) => selected[r.index]);

  const toggleAll = () => {
    const next = !allChecked;
    setSelected(prev => {
      const copy = [...prev];
      filtered.filter(r => !isBlocked(r)).forEach(r => { copy[r.index] = next; });
      return copy;
    });
  };

  const toggle = (idx: number) => setSelected(prev => { const c = [...prev]; c[idx] = !c[idx]; return c; });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-7xl h-[97vh] sm:max-h-[94vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-wide mb-1">Vista previa — Despachos Dogama</h3>
          <div className="flex gap-2 flex-wrap mt-2">
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{counts.nuevo} nuevos</span>
            {counts.dup_bd > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">{counts.dup_bd} ya en BD</span>}
            {counts.dup_arch > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{counts.dup_arch} dup.</span>}
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{counts.selected} sel.</span>
            {counts.unresolved > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-red-200 text-red-800">⚠ {counts.unresolved} sin resolver</span>}
          </div>
        </div>

        {/* Resolution panels */}
        {(notFoundMarcas.length > 0 || notFoundTipos.length > 0 || similarMarcas.length > 0 || similarTipos.length > 0) && (
          <div className="px-4 sm:px-6 pt-2 pb-2 overflow-y-auto flex-shrink-0 max-h-[30vh] border-b border-slate-100 space-y-2">
            {(notFoundMarcas.length > 0 || similarMarcas.length > 0) && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Marcas sin resolver</p>
                <div className="flex flex-wrap gap-2">
                  {notFoundMarcas.map(({ name, count }) => (
                    <div key={name} className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-red-700">{name}</span>
                      <span className="text-[10px] text-red-400">×{count}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`dm-nf-${name}`} options={marcas.map(m => ({ id: m.id, label: m.descripcion }))} value=""
                        onChange={(text, id) => { if (id) acceptMarcaSuggestion(name, id, text); }} placeholder="Seleccionar…" className="w-32" />
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingM.has(name)} onClick={() => createMarca(name)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingM.has(name) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                  {similarMarcas.map(({ original, suggested, id }) => (
                    <div key={original} className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700">{original}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`dm-sim-${original}`} options={marcas.map(m => ({ id: m.id, label: m.descripcion }))} value={suggested}
                        onChange={(text, selId) => { if (selId) acceptMarcaSuggestion(original, selId, text); }} placeholder="Seleccionar…" className="w-32" />
                      <button onClick={() => acceptMarcaSuggestion(original, id, suggested)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 transition whitespace-nowrap">✓ Usar</button>
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingM.has(original)} onClick={() => createMarca(original)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingM.has(original) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(notFoundTipos.length > 0 || similarTipos.length > 0) && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Tipos de prenda sin resolver</p>
                <div className="flex flex-wrap gap-2">
                  {notFoundTipos.map(({ name, count }) => (
                    <div key={name} className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-red-700">{name}</span>
                      <span className="text-[10px] text-red-400">×{count}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`dt-nf-${name}`} options={tipos.map(t => ({ id: t.id, label: t.descripcion }))} value=""
                        onChange={(text, id) => { if (id) acceptTipoSuggestion(name, id, text); }} placeholder="Seleccionar…" className="w-32" />
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingT.has(name)} onClick={() => createTipo(name)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingT.has(name) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                  {similarTipos.map(({ original, suggested, id }) => (
                    <div key={original} className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700">{original}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`dt-sim-${original}`} options={tipos.map(t => ({ id: t.id, label: t.descripcion }))} value={suggested}
                        onChange={(text, selId) => { if (selId) acceptTipoSuggestion(original, selId, text); }} placeholder="Seleccionar…" className="w-32" />
                      <button onClick={() => acceptTipoSuggestion(original, id, suggested)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 transition whitespace-nowrap">✓ Usar</button>
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingT.has(original)} onClick={() => createTipo(original)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingT.has(original) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search + Pagination controls */}
        <PreviewTableControls
          search={search} onSearch={v => { setSearch(v); setCurrentPage(1); }}
          total={filtered.length} filtered={filtered.length}
          pageSize={pageSize} onPageSize={v => { setPageSize(v); setCurrentPage(1); }}
          currentPage={currentPage} totalPages={totalPages} onPage={setCurrentPage}
          onExport={exportDespachos} searchPlaceholder="Buscar confeccionista, marca, referencia…"
        />

        {/* Table — grows to fill remaining space, scrolls both axes */}
        <div className="overflow-auto flex-1 px-2 sm:px-4 py-2 sm:py-3">
          <div className="rounded-2xl sm:rounded-3xl border border-slate-100 overflow-hidden min-w-[600px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white uppercase tracking-widest select-none sticky top-0">
                  <th className="px-2 py-3 text-center w-8 border-b border-slate-800">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-400" />
                  </th>
                  {['Fecha','Ord.Cargue','Confeccionista','Ord.Servicio','Marca','Referencia','Lote','Und.','Tipo Prenda','Estado'].map(h => (
                    <th key={h} onClick={() => toggleSort(h)} title="Ordenar"
                      className="px-2 py-3 text-left font-black border-b border-slate-800 whitespace-nowrap cursor-pointer hover:bg-slate-700 select-none">
                      {h} {sortCol === h ? (sortDir === 'asc' ? '↑' : '↓') : <span className="opacity-30">↕</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-slate-400">Sin resultados</td></tr>
                ) : paginated.map(r => (
                  <tr key={r.index} className={`hover:bg-slate-50/70 transition-colors ${!selected[r.index] ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={selected[r.index]} disabled={isBlocked(r)}
                        onChange={() => toggle(r.index)} className="accent-indigo-500 disabled:cursor-not-allowed" />
                    </td>
                    <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{r.fecha || '—'}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.orden_cargue || '—'}</td>
                    <td className="px-2 py-2 max-w-[120px] truncate">
                      <MatchBadge m={r.conf_match} label={r.confeccionista_txt || '—'} />
                    </td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.orden_servicio || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <MatchBadge m={r.marca_match} label={r.marca_txt || '—'} />
                    </td>
                    <td className="px-2 py-2 font-semibold whitespace-nowrap">{r.referencia}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.lote}</td>
                    <td className="px-2 py-2 text-center">{r.unidades}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <MatchBadge m={r.tipo_match} label={r.tipo_prenda_txt || '—'} />
                    </td>
                    <td className="px-2 py-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                        r.status === 'nuevo' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'duplicado_bd' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'nuevo' ? 'Nuevo' : r.status === 'duplicado_bd' ? 'Ya en BD' : 'Dup.'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={importing}
            className="px-4 sm:px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button
            onClick={() => {
              const sel = rows.filter((_, i) => selected[i]);
              const msgs: string[] = [];
              const unresMarcas = [...new Set(sel.filter(r => r.marca_match.status !== 'exact').map(r => r.marca_txt).filter(Boolean))];
              const unresTipos  = [...new Set(sel.filter(r => r.tipo_match.status !== 'exact').map(r => r.tipo_prenda_txt).filter(Boolean))];
              if (unresMarcas.length) msgs.push(`Marcas sin definir: ${unresMarcas.join(', ')}`);
              if (unresTipos.length)  msgs.push(`Tipos de prenda sin definir: ${unresTipos.join(', ')}`);
              if (msgs.length) { toast.error('Debe resolver antes de importar:\n' + msgs.join('\n')); return; }
              onConfirm(
                rows.map((r, i) => ({ ...r, selected: selected[i] })).filter(r => r.selected),
                { marcas, proveedores: initCtx.proveedores, confeccionistas: confs, tiposPrenda: tipos, tiposOc: initCtx.tiposOc }
              );
            }}
            disabled={importing || counts.selected === 0}
            className="px-4 sm:px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {importing ? 'Importando…' : `Importar ${counts.selected}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CITAS PREVIEW MODAL ───────────────────────────────────────────────────────

function CitaPreviewModal({
  rows: initRows, ctx: initCtx, user, onClose, onConfirm, importing,
}: {
  rows: CitaRow[];
  ctx: ValidationCtx;
  user: User;
  onClose: () => void;
  onConfirm: (rows: CitaRow[], ctx: ValidationCtx) => void;
  importing: boolean;
}) {
  const [marcas, setMarcas]   = useState(initCtx.marcas);
  const [confs, setConfs]     = useState(initCtx.confeccionistas);
  const [tiposOc, setTiposOc] = useState(initCtx.tiposOc);
  const [creatingM, setCreatingM]   = useState<Set<string>>(new Set());
  const [creatingTOC, setCreatingTOC] = useState<Set<string>>(new Set());
  const [confMiniName, setConfMiniName] = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [pageSize, setPageSize]   = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  // Per-row overrides
  const [provOverrides, setProvOverrides] = useState<Map<number, number>>(new Map());
  const [provSelText, setProvSelText]     = useState<Map<number, string>>(new Map());
  const [horaOverrides, setHoraOverrides] = useState<Map<number, string>>(new Map());
  // Per-name overrides for marcas and tipos_oc (applies to all rows with that text)
  const [marcaNameOverrides, setMarcaNameOverrides]   = useState<Map<string, number>>(new Map());
  const [tipoOcNameOverrides, setTipoOcNameOverrides] = useState<Map<string, number>>(new Map());
  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (col: string) => {
    if (sortCol === col) { if (sortDir === 'asc') setSortDir('desc'); else { setSortCol(null); } }
    else { setSortCol(col); setSortDir('asc'); }
  };

  const rows = useMemo<CitaRow[]>(() =>
    initRows.map(r => ({
      ...r,
      marca_match:   matchCatalog(r.marca_txt, marcas),
      prov_match:    matchConf(r.proveedor_txt, confs),
      tipo_oc_match: matchCatalog(r.tipo_oc, tiposOc),
    })),
    [initRows, marcas, confs, tiposOc]
  );

  const [selected, setSelected] = useState<boolean[]>(() => initRows.map(r => r.status === 'nuevo'));

  const createMarca = async (name: string) => {
    setCreatingM(prev => new Set(prev).add(name));
    try {
      const res = await api.dogamaCreateCatalogItem('dogama_marcas', { descripcion: name, estado: 'activo', usuariocreacion: user.name || user.email });
      setMarcas(prev => [...prev, res]);
      toast.success(`Marca "${name}" creada`);
    } catch { toast.error(`Error al crear marca "${name}"`); }
    finally { setCreatingM(prev => { const s = new Set(prev); s.delete(name); return s; }); }
  };

  const acceptMarcaSimilar = (original: string, id: number, name: string) => {
    setMarcas(prev => {
      if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
      return [...prev, { id, descripcion: original, estado: 'activo' }];
    });
    toast.success(`"${original}" → "${name}"`);
  };

  const notFoundMarcas = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => { if (r.marca_txt && r.marca_match.status === 'not_found') map.set(r.marca_txt, (map.get(r.marca_txt)||0)+1); });
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [rows]);

  const notFoundTiposOc = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => { if (r.tipo_oc && r.tipo_oc_match.status === 'not_found') map.set(r.tipo_oc, (map.get(r.tipo_oc)||0)+1); });
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [rows]);

  const similarTiposOc = useMemo(() => {
    const seen = new Set<string>();
    return rows.flatMap(r => {
      if (r.tipo_oc_match.status !== 'similar' || seen.has(r.tipo_oc)) return [];
      seen.add(r.tipo_oc);
      return [{ original: r.tipo_oc, suggested: r.tipo_oc_match.matchedName!, id: r.tipo_oc_match.id! }];
    });
  }, [rows]);

  const createTipoOc = async (name: string) => {
    setCreatingTOC(prev => new Set(prev).add(name));
    try {
      const res = await api.dogamaCreateCatalogItem('dogama_tipos_oc', { descripcion: name, estado: 'activo', usuariocreacion: user.name || user.email });
      setTiposOc(prev => [...prev, res]);
      toast.success(`Tipo OC "${name}" creado`);
    } catch { toast.error(`Error al crear tipo OC "${name}"`); }
    finally { setCreatingTOC(prev => { const s = new Set(prev); s.delete(name); return s; }); }
  };

  const acceptTipoOcSimilar = (original: string, id: number, name: string) => {
    setTiposOc(prev => {
      if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
      return [...prev, { id, descripcion: original, estado: 'activo' }];
    });
    toast.success(`"${original}" → "${name}"`);
  };

  const similarMarcas = useMemo(() => {
    const seen = new Set<string>();
    return rows.flatMap(r => {
      if (r.marca_match.status !== 'similar' || seen.has(r.marca_txt)) return [];
      seen.add(r.marca_txt);
      return [{ original: r.marca_txt, suggested: r.marca_match.matchedName!, id: r.marca_match.id! }];
    });
  }, [rows]);

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(rows.length / (pageSize as number)) || 1;
  React.useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages]);

  const exportCitas = () => {
    const exportRows = filtered.map(r => ({
      Fecha: r.fecha, Turno: r.turno, 'H. Inicio': r.hora_inicio, 'H. Real Carga': r.hora_fin,
      Marca: r.marca_txt, Referencia: r.referencia, Color: r.color, Lote: r.lote,
      Mesa: r.mesa, Cantidad: r.cantidad, Proveedor: r.proveedor_txt,
      'Nro. Documento': r.numero_documento, 'Tipo OC': r.tipo_oc, Estado: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Citas');
    XLSX.writeFile(wb, 'preview_citas.xlsx');
  };

  const q = search.toLowerCase();
  const filtered = rows.filter(r =>
    !q || [r.marca_txt, r.referencia, r.lote, r.color, r.proveedor_txt, r.numero_documento, r.turno, r.tipo_oc]
      .some(v => (v || '').toLowerCase().includes(q))
  );

  const CCOL: Record<string, keyof CitaRow | null> = {
    'Fecha': 'fecha', 'Turno': 'turno', 'H.Inicio': 'hora_inicio', 'H.Real Carga': 'hora_fin',
    'Marca': 'marca_txt', 'Referencia': 'referencia', 'Color': 'color', 'Lote': 'lote',
    'Mesa': 'mesa', 'Cant.': 'cantidad', 'Proveedor': 'proveedor_txt',
    'Nro.Doc': 'numero_documento', 'Tipo OC': 'tipo_oc', 'Estado': 'status',
  };
  const cSorted = sortCol ? [...filtered].sort((a, b) => {
    const k = CCOL[sortCol] as keyof CitaRow;
    if (!k) return 0;
    const av = String(a[k] ?? ''); const bv = String(b[k] ?? '');
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  }) : filtered;
  const paginated = pageSize === 'all' ? cSorted : cSorted.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  const counts = {
    nuevo: rows.filter(r => r.status === 'nuevo').length,
    dup_bd: rows.filter(r => r.status === 'duplicado_bd').length,
    dup_arch: rows.filter(r => r.status === 'duplicado_archivo').length,
    selected: selected.filter(Boolean).length,
    unresolved: notFoundMarcas.length + notFoundTiposOc.length + similarMarcas.length + similarTiposOc.length,
  };

  const isBlocked = (r: CitaRow) => r.status !== 'nuevo';
  const allChecked = filtered.filter(r => !isBlocked(r)).every(r => selected[r.index]);

  const toggleAll = () => {
    const next = !allChecked;
    setSelected(prev => {
      const copy = [...prev];
      filtered.filter(r => !isBlocked(r)).forEach(r => { copy[r.index] = next; });
      return copy;
    });
  };
  const toggle = (idx: number) => setSelected(prev => { const c = [...prev]; c[idx] = !c[idx]; return c; });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-7xl h-[97vh] sm:max-h-[94vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-wide mb-1">Vista previa — Citas / Recogidas Dogama</h3>
          <div className="flex gap-2 flex-wrap mt-2">
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{counts.nuevo} nuevos</span>
            {counts.dup_bd > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">{counts.dup_bd} ya en BD</span>}
            {counts.dup_arch > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{counts.dup_arch} dup.</span>}
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{counts.selected} sel.</span>
            {counts.unresolved > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-red-200 text-red-800">⚠ {counts.unresolved} sin resolver</span>}
          </div>
        </div>

        {/* Resolution panels — Marcas and TiposOC (confeccionista handled per-row) */}
        {(notFoundMarcas.length > 0 || notFoundTiposOc.length > 0 || similarMarcas.length > 0 || similarTiposOc.length > 0) && (
          <div className="px-4 sm:px-6 pt-2 pb-2 overflow-y-auto flex-shrink-0 max-h-[30vh] border-b border-slate-100 space-y-2">
            {(notFoundMarcas.length > 0 || similarMarcas.length > 0) && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Marcas sin resolver</p>
                <div className="flex flex-wrap gap-2">
                  {notFoundMarcas.map(({ name, count }) => (
                    <div key={name} className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-red-700">{name}</span>
                      <span className="text-[10px] text-red-400">×{count}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`cm-nf-${name}`} options={marcas.map(m => ({ id: m.id, label: m.descripcion }))} value=""
                        onChange={(text, id) => { if (id) acceptMarcaSimilar(name, id, text); }} placeholder="Seleccionar…" className="w-32" />
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingM.has(name)} onClick={() => createMarca(name)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingM.has(name) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                  {similarMarcas.map(({ original, suggested, id }) => (
                    <div key={original} className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700">{original}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`cm-sim-${original}`} options={marcas.map(m => ({ id: m.id, label: m.descripcion }))} value={suggested}
                        onChange={(text, selId) => { if (selId) acceptMarcaSimilar(original, selId, text); }} placeholder="Seleccionar…" className="w-32" />
                      <button onClick={() => acceptMarcaSimilar(original, id, suggested)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 transition whitespace-nowrap">✓ Usar</button>
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingM.has(original)} onClick={() => createMarca(original)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingM.has(original) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(notFoundTiposOc.length > 0 || similarTiposOc.length > 0) && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Tipos OC sin resolver</p>
                <div className="flex flex-wrap gap-2">
                  {notFoundTiposOc.map(({ name, count }) => (
                    <div key={name} className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-red-700">{name}</span>
                      <span className="text-[10px] text-red-400">×{count}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`ct-nf-${name}`} options={tiposOc.map(t => ({ id: t.id, label: t.descripcion }))} value=""
                        onChange={(text, id) => { if (id) acceptTipoOcSimilar(name, id, text); }} placeholder="Seleccionar…" className="w-32" />
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingTOC.has(name)} onClick={() => createTipoOc(name)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingTOC.has(name) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                  {similarTiposOc.map(({ original, suggested, id }) => (
                    <div key={original} className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1 flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700">{original}</span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <SearchableCombo listId={`ct-sim-${original}`} options={tiposOc.map(t => ({ id: t.id, label: t.descripcion }))} value={suggested}
                        onChange={(text, selId) => { if (selId) acceptTipoOcSimilar(original, selId, text); }} placeholder="Seleccionar…" className="w-32" />
                      <button onClick={() => acceptTipoOcSimilar(original, id, suggested)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 transition whitespace-nowrap">✓ Usar</button>
                      <span className="text-[10px] text-slate-400">o</span>
                      <button disabled={creatingTOC.has(original)} onClick={() => createTipoOc(original)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap">
                        {creatingTOC.has(original) ? '…' : '+ Crear'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {confMiniName && (
          <ConfMiniModal
            name={confMiniName}
            usuariocreacion={user.name || user.email}
            onClose={() => setConfMiniName(null)}
            onCreated={conf => {
              setConfs(prev => [...prev, conf]);
              setConfMiniName(null);
            }}
          />
        )}

        {/* Search + Pagination controls */}
        <PreviewTableControls
          search={search} onSearch={v => { setSearch(v); setCurrentPage(1); }}
          total={filtered.length} filtered={filtered.length}
          pageSize={pageSize} onPageSize={v => { setPageSize(v); setCurrentPage(1); }}
          currentPage={currentPage} totalPages={totalPages} onPage={setCurrentPage}
          onExport={exportCitas} searchPlaceholder="Buscar marca, proveedor, referencia, tipo OC…"
        />

        {/* Table — grows to fill remaining space, scrolls both axes */}
        <div className="overflow-auto flex-1 px-2 sm:px-4 py-2 sm:py-3">
          <div className="rounded-2xl sm:rounded-3xl border border-slate-100 overflow-hidden min-w-[750px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white uppercase tracking-widest select-none sticky top-0">
                  <th className="px-2 py-3 text-center w-8 border-b border-slate-800">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-400" />
                  </th>
                  {['Fecha','Turno','H.Inicio','H.Real Carga','Marca','Referencia','Color','Lote','Mesa','Cant.','Proveedor','Nro.Doc','Tipo OC','Estado'].map(h => (
                    <th key={h} onClick={() => toggleSort(h)} title="Ordenar"
                      className="px-2 py-3 text-left font-black border-b border-slate-800 whitespace-nowrap cursor-pointer hover:bg-slate-700 select-none">
                      {h} {sortCol === h ? (sortDir === 'asc' ? '↑' : '↓') : <span className="opacity-30">↕</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={15} className="py-10 text-center text-slate-400">Sin resultados</td></tr>
                ) : paginated.map(r => (
                  <tr key={r.index} className={`hover:bg-slate-50/70 transition-colors ${!selected[r.index] ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={selected[r.index]} disabled={isBlocked(r)}
                        onChange={() => toggle(r.index)} className="accent-indigo-500 disabled:cursor-not-allowed" />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">{r.fecha || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.turno || '—'}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.hora_inicio || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <input type="time"
                        value={horaOverrides.get(r.index) ?? r.hora_fin ?? ''}
                        onChange={e => setHoraOverrides(prev => new Map(prev).set(r.index, e.target.value))}
                        onClick={e => e.stopPropagation()}
                        className="text-xs border border-slate-200 rounded-lg px-1 py-0.5 w-[5.5rem] font-mono bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition" />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap"><MatchBadge m={r.marca_match} label={r.marca_txt || '—'} /></td>
                    <td className="px-2 py-2 font-semibold whitespace-nowrap">{r.referencia}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.color || '—'}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.lote}</td>
                    <td className="px-2 py-2 text-center">{r.mesa || '—'}</td>
                    <td className="px-2 py-2 text-center">{r.cantidad}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {r.prov_match.status === 'exact' && !provOverrides.has(r.index)
                        ? <span className="text-emerald-600 text-xs font-semibold">{r.proveedor_txt}</span>
                        : <div className="flex items-center gap-1">
                            <SearchableCombo
                              listId={`prov-${r.index}`}
                              options={confs.map(c => ({ id: c.id, label: c.descripcion_conf }))}
                              value={provSelText.get(r.index) ?? (r.prov_match.matchedName || '')}
                              onChange={(text, id) => {
                                setProvSelText(prev => new Map(prev).set(r.index, text));
                                if (id) setProvOverrides(prev => new Map(prev).set(r.index, id));
                                else setProvOverrides(prev => { const m = new Map(prev); m.delete(r.index); return m; });
                              }}
                              placeholder={r.proveedor_txt || 'Buscar…'}
                              className="w-[130px]"
                            />
                            <button title="Crear nuevo" onClick={() => setConfMiniName(r.proveedor_txt)}
                              className="text-xs px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition font-bold">+</button>
                          </div>
                      }
                    </td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.numero_documento}</td>
                    <td className="px-2 py-2 whitespace-nowrap"><MatchBadge m={r.tipo_oc_match} label={r.tipo_oc || '—'} /></td>
                    <td className="px-2 py-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                        r.status === 'nuevo' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'duplicado_bd' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'nuevo' ? 'Nuevo' : r.status === 'duplicado_bd' ? 'Ya en BD' : 'Dup.'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={importing}
            className="px-4 sm:px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button
            onClick={() => {
              const sel = rows.filter((_, i) => selected[i]);
              const msgs: string[] = [];
              const unresMarcas = [...new Set(sel.filter(r => r.marca_match.status !== 'exact').map(r => r.marca_txt).filter(Boolean))];
              const unresProvs  = sel.filter(r => r.prov_match.status !== 'exact' && !provOverrides.has(r.index));
              const uresTocs    = [...new Set(sel.filter(r => r.tipo_oc && r.tipo_oc_match.status !== 'exact').map(r => r.tipo_oc).filter(Boolean))];
              if (unresMarcas.length) msgs.push(`Marcas sin definir (col. MARCA): ${unresMarcas.join(', ')}`);
              if (unresProvs.length)  msgs.push(`Confeccionista sin asignar en ${unresProvs.length} fila(s) — use el selector de la columna Proveedor`);
              if (uresTocs.length)    msgs.push(`Tipos OC sin definir (col. TIPO OC): ${uresTocs.join(', ')}`);
              if (msgs.length) { toast.error('Debe resolver antes de importar:\n' + msgs.join('\n')); return; }
              onConfirm(
                rows.map((r, i) => {
                  const provId = provOverrides.get(r.index);
                  const provConf = provId !== undefined ? confs.find(c => c.id === provId) : null;
                  return {
                    ...r,
                    selected: selected[i],
                    proveedor_txt: provConf ? provConf.descripcion_conf : r.proveedor_txt,
                    hora_fin: horaOverrides.get(r.index) ?? r.hora_fin,
                  };
                }).filter(r => r.selected),
                { ...initCtx, marcas, confeccionistas: confs, tiposOc }
              );
            }}
            disabled={importing || counts.selected === 0}
            className="px-4 sm:px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {importing ? 'Importando…' : `Importar ${counts.selected}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Estado / Hora inline editors ──────────────────────────────────────────────

const ESTADOS_DESPACHO = ['pendiente', 'programado', 'despachado', 'cancelado'];
const ESTADOS_CITA     = ['pendiente', 'confirmado', 'atendido', 'cancelado'];

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-700', programado: 'bg-blue-100 text-blue-700',
    despachado: 'bg-emerald-100 text-emerald-700', confirmado: 'bg-blue-100 text-blue-700',
    atendido: 'bg-emerald-100 text-emerald-700', cancelado: 'bg-red-100 text-red-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${map[estado] || 'bg-slate-100 text-slate-500'}`}>{estado}</span>;
}

function EstadoSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()}
      className="text-xs border border-slate-200 rounded-xl px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer">
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function HoraCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');

  React.useEffect(() => { setVal(value || ''); }, [value]);

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value || ''); setEditing(true); }}
        title="Click para editar"
        className={`font-mono text-xs transition ${
          value
            ? 'text-slate-700 hover:text-indigo-600 hover:underline'
            : 'text-slate-300 hover:text-indigo-500 border border-dashed border-slate-200 rounded px-1'
        }`}>
        {value || '+ hora'}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input type="time" value={val} onChange={e => setVal(e.target.value)}
        className="text-xs border border-indigo-300 rounded px-1 py-0.5 w-24 font-mono" autoFocus />
      <button onClick={() => { onSave(val); setEditing(false); }}
        className="text-xs font-black text-emerald-600 hover:text-emerald-800">✓</button>
      <button onClick={() => setEditing(false)}
        className="text-xs text-slate-400 hover:text-slate-600">✕</button>
    </div>
  );
}

// ── Despacho Form Modal ───────────────────────────────────────────────────────

const EMPTY_DESPACHO = {
  fecha: '', orden_cargue: '', confeccionista_txt: '', orden_servicio: '',
  marca_txt: '', referencia: '', lote: '', unidades: '', tipo_prenda_txt: '', estado: 'pendiente',
};

function DespachoFormModal({ ctx, user, onClose, onSaved }: {
  ctx: ValidationCtx; user: User; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_DESPACHO });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.referencia && !form.orden_cargue) { toast.error('Ingrese al menos referencia u orden de cargue'); return; }
    setSaving(true);
    try {
      const payload = [{
        fecha: form.fecha || null, orden_cargue: form.orden_cargue || null,
        confeccionista_txt: form.confeccionista_txt,
        orden_servicio: form.orden_servicio || null,
        marca_txt: form.marca_txt, referencia: form.referencia || null,
        lote: form.lote || null, unidades: form.unidades || null,
        tipo_prenda_txt: form.tipo_prenda_txt,
      }];
      const res = await api.dogamaBulkDespachos(payload, user.name || user.email);
      if (res.errors > 0) { toast.error('Registro duplicado o error al guardar'); return; }
      toast.success('Despacho creado');
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e?.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, k, type = 'text', required }: { label: string; k: string; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={(form as any)[k]} onChange={e => set(k, e.target.value)}
        className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition bg-slate-50 focus:bg-white" />
    </div>
  );

  const CatalogSelect = ({ label, k, list }: { label: string; k: string; list: CatalogItem[] }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <input list={`ds-${k}`} value={(form as any)[k]} onChange={e => set(k, e.target.value)}
          className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition bg-slate-50 focus:bg-white" />
        <datalist id={`ds-${k}`}>{list.map(i => <option key={i.id} value={i.descripcion} />)}</datalist>
      </div>
    </div>
  );

  const ConfSelect = ({ label, k }: { label: string; k: string }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <input list="ds-conf" value={(form as any)[k]} onChange={e => set(k, e.target.value)}
          className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition bg-slate-50 focus:bg-white" />
        <datalist id="ds-conf">{ctx.confeccionistas.map(c => <option key={c.id} value={c.descripcion_conf} />)}</datalist>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-wide">Nuevo Despacho</h3>
        </div>
        <div className="px-4 sm:px-6 py-4 sm:py-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 overflow-y-auto flex-1">
          <Field label="Fecha" k="fecha" type="date" />
          <Field label="Orden de Cargue" k="orden_cargue" />
          <ConfSelect label="Confeccionista" k="confeccionista_txt" />
          <Field label="Orden de Servicio" k="orden_servicio" />
          <CatalogSelect label="Marca" k="marca_txt" list={ctx.marcas} />
          <Field label="Referencia" k="referencia" required />
          <Field label="Lote" k="lote" />
          <Field label="Unidades" k="unidades" type="number" />
          <CatalogSelect label="Tipo de Prenda" k="tipo_prenda_txt" list={ctx.tiposPrenda} />
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Estado</label>
            <select value={form.estado} onChange={e => set('estado', e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 focus:bg-white">
              {ESTADOS_DESPACHO.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 sm:px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 sm:px-5 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cita Form Modal ───────────────────────────────────────────────────────────

const EMPTY_CITA = {
  fecha: '', turno: '', hora_inicio: '', hora_fin: '', marca_txt: '',
  referencia: '', color: '', lote: '', mesa: '', cantidad: '',
  proveedor_txt: '', numero_documento: '', tipo_oc: '', estado: 'pendiente',
};

function CitaFormModal({ ctx, user, onClose, onSaved }: {
  ctx: ValidationCtx; user: User; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_CITA });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.referencia && !form.numero_documento) { toast.error('Ingrese referencia o número de documento'); return; }
    setSaving(true);
    try {
      const payload = [{
        fecha: form.fecha || null, turno: form.turno || null,
        hora_inicio: form.hora_inicio || null, hora_fin: form.hora_fin || null,
        marca_txt: form.marca_txt, referencia: form.referencia || null,
        color: form.color || null, lote: form.lote || null,
        mesa: form.mesa ? Number(form.mesa) : null, cantidad: form.cantidad ? Number(form.cantidad) : null,
        proveedor_txt: form.proveedor_txt, proveedor: form.proveedor_txt || null,
        numero_documento: form.numero_documento || null, tipo_oc: form.tipo_oc || null,
      }];
      const res = await api.dogamaBulkCitas(payload, user.name || user.email);
      if (res.errors > 0) { toast.error('Registro duplicado o error al guardar'); return; }
      toast.success('Cita creada');
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e?.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, k, type = 'text', required }: { label: string; k: string; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={(form as any)[k]} onChange={e => set(k, e.target.value)}
        className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition bg-slate-50 focus:bg-white" />
    </div>
  );

  const CatalogSelect = ({ label, k, list }: { label: string; k: string; list: { id: number; descripcion: string }[] }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <input list={`dsc-${k}`} value={(form as any)[k]} onChange={e => set(k, e.target.value)}
          className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition bg-slate-50 focus:bg-white" />
        <datalist id={`dsc-${k}`}>{list.map(i => <option key={i.id} value={i.descripcion} />)}</datalist>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide">Nueva Cita / Recogida</h3>
        </div>
        <div className="px-6 py-5 grid grid-cols-2 gap-4">
          <Field label="Fecha" k="fecha" type="date" />
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Turno</label>
            <select value={form.turno} onChange={e => set('turno', e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 focus:bg-white">
              <option value="">— Seleccionar —</option>
              {['DANI','CAROLINA','DIURNO','NOCTURNO','MAÑANA','TARDE'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Field label="Hora Inicio" k="hora_inicio" type="time" />
          <Field label="H. Real Carga" k="hora_fin" type="time" />
          <CatalogSelect label="Marca" k="marca_txt" list={ctx.marcas} />
          <Field label="Referencia" k="referencia" required />
          <Field label="Color" k="color" />
          <Field label="Lote" k="lote" />
          <Field label="Mesa" k="mesa" type="number" />
          <Field label="Cantidad" k="cantidad" type="number" />
          <CatalogSelect label="Proveedor" k="proveedor_txt" list={ctx.confeccionistas.map(c => ({ id: c.id, descripcion: c.descripcion_conf }))} />
          <Field label="Número de Documento" k="numero_documento" required />
          <CatalogSelect label="Tipo OC" k="tipo_oc" list={ctx.tiposOc} />
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Estado</label>
            <select value={form.estado} onChange={e => set('estado', e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 focus:bg-white">
              {ESTADOS_CITA.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving}
            className="px-5 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
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

// ── Build preview rows ────────────────────────────────────────────────────────

function buildDespachoRows(json: any[], existing: Despacho[], ctx: ValidationCtx): DespachoRow[] {
  const bdKeys = new Set(existing.map(d =>
    `${norm(d.orden_cargue||'')}|${norm(d.orden_servicio||'')}|${norm(d.referencia||'')}|${norm(d.lote||'')}`
  ));
  const seen = new Set<string>();
  return json.map((row, i) => {
    const fecha            = excelDate(row['FECHA'] ?? row['Fecha'] ?? row['fecha'] ?? '');
    const orden_cargue     = str(row['ORDEN DE CARGUE'] ?? row['orden_cargue'] ?? '');
    const confeccionista_txt = str(row['CONFECCIONISTA'] ?? row['Confeccionista'] ?? '');
    const orden_servicio   = str(row['ORDEN DE SERVICIO'] ?? row['orden_servicio'] ?? '');
    const marca_txt        = str(row['MARCA'] ?? row['Marca'] ?? '');
    const referencia       = str(row['REFERENCIA'] ?? row['Referencia'] ?? '');
    const lote             = str(row['LOTE'] ?? row['Lote'] ?? '');
    const unidades         = num(row['UNIDADES'] ?? row['Unidades'] ?? '');
    const tipo_prenda_txt  = str(row['TIPO DE PRENDA'] ?? row['TipoPrenda'] ?? row['tipo_prenda'] ?? '');

    if (!orden_cargue && !referencia && !lote) return null;

    const key = `${norm(orden_cargue)}|${norm(orden_servicio)}|${norm(referencia)}|${norm(lote)}`;
    let status: DupStatus = 'nuevo';
    if (bdKeys.has(key)) status = 'duplicado_bd';
    else if (seen.has(key)) status = 'duplicado_archivo';
    if (status !== 'duplicado_archivo') seen.add(key);

    return {
      index: i, fecha, orden_cargue, confeccionista_txt, orden_servicio, marca_txt,
      referencia, lote, unidades, tipo_prenda_txt, status,
      selected: status === 'nuevo',
      conf_match:  matchConf(confeccionista_txt, ctx.confeccionistas),
      marca_match: matchCatalog(marca_txt, ctx.marcas),
      tipo_match:  matchCatalog(tipo_prenda_txt, ctx.tiposPrenda),
    };
  }).filter(Boolean) as DespachoRow[];
}

function buildCitaRows(json: any[], existing: Cita[], ctx: ValidationCtx): CitaRow[] {
  const bdKeys = new Set(existing.map(c =>
    `${norm(c.numero_documento||'')}|${norm(c.referencia||'')}|${norm(c.lote||'')}|${norm(c.color||'')}|${String(c.mesa??'')}`
  ));
  const seen = new Set<string>();
  return json.map((row, i) => {
    const fecha            = excelDate(row['Fecha'] ?? row['FECHA'] ?? '');
    const turno            = str(row['TURNO'] ?? row['Turno'] ?? '');
    const keys             = Object.keys(row);
    const horaIdx          = keys.findIndex(k => /hora/i.test(k));
    const hora_inicio      = excelTime(horaIdx >= 0 ? row[keys[horaIdx]] : '');
    const hora_fin         = excelTime(horaIdx >= 0 && keys[horaIdx + 1] ? row[keys[horaIdx + 1]] : '');
    const marca_txt        = str(row['Marca'] ?? row['MARCA'] ?? '');
    const referencia       = str(row['Referencia'] ?? row['REFERENCIA'] ?? '');
    const color            = str(row['COLOR'] ?? row['Color'] ?? '');
    const lote             = str(row['Lote'] ?? row['LOTE'] ?? '');
    const mesa             = num(row['MESA'] ?? row['Mesa'] ?? '');
    const cantidad         = num(row['Cantidad'] ?? row['CANTIDAD'] ?? '');
    const proveedor_txt    = str(row['Proveedor'] ?? row['PROVEEDOR'] ?? '');
    const numero_documento = str(row['Numero del documento'] ?? row['numero_documento'] ?? row['NroDocumento'] ?? '');
    const tipo_oc          = str(row['TIPO DE OC'] ?? row['tipo_oc'] ?? '');

    if (!referencia && !numero_documento && !lote) return null;

    const key = `${norm(numero_documento)}|${norm(referencia)}|${norm(lote)}|${norm(color)}|${mesa}`;
    let status: DupStatus = 'nuevo';
    if (bdKeys.has(key)) status = 'duplicado_bd';
    else if (seen.has(key)) status = 'duplicado_archivo';
    if (status !== 'duplicado_archivo') seen.add(key);

    return {
      index: i, fecha, turno, hora_inicio, hora_fin, marca_txt, referencia, color,
      lote, mesa, cantidad, proveedor_txt, numero_documento, tipo_oc,
      status, selected: status === 'nuevo',
      marca_match:    matchCatalog(marca_txt, ctx.marcas),
      prov_match:     matchConf(proveedor_txt, ctx.confeccionistas),
      tipo_oc_match:  matchCatalog(tipo_oc, ctx.tiposOc),
    };
  }).filter(Boolean) as CitaRow[];
}

// ── DESPACHOS TAB ─────────────────────────────────────────────────────────────

function DespachoTab({ user }: { user: User }) {
  const [rows, setRows]     = useState<Despacho[]>([]);
  const [ctx, setCtx]       = useState<ValidationCtx>({ marcas: [], proveedores: [], confeccionistas: [], tiposPrenda: [], tiposOc: [] });
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<DespachoRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'create');
  const canEdit   = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'edit');
  const canDelete = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'delete');

  const load = async () => {
    setLoading(true);
    try {
      const [data, marcas, confs, tipos] = await Promise.all([
        api.dogamaGetDespachos(),
        api.dogamaGetCatalog('dogama_marcas'),
        api.dogamaGetConfeccionistas(),
        api.dogamaGetCatalog('dogama_tipos_prenda'),
      ]);
      setRows(data);
      setCtx(prev => ({ ...prev, marcas, confeccionistas: confs, tiposPrenda: tipos }));
    } catch { toast.error('Error al cargar despachos'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: false });
      const sheet = wb.SheetNames.find(n => n.toUpperCase().includes('DESPACHO')) || wb.SheetNames[0];
      const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
      if (!json.length) { toast.error('Archivo vacío'); return; }
      const p = buildDespachoRows(json, rows, ctx);
      if (!p.length) { toast.error('Sin filas válidas'); return; }
      setPreview(p);
    } catch { toast.error('Error al leer el archivo'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleConfirm = async (selected: DespachoRow[], resolvedCtx: ValidationCtx) => {
    setImporting(true);
    try {
      const toSend = selected.map(r => ({
        fecha: r.fecha || null, orden_cargue: r.orden_cargue || null,
        confeccionista_txt: r.confeccionista_txt,
        orden_servicio: r.orden_servicio || null,
        marca_txt: r.marca_txt, referencia: r.referencia || null,
        lote: r.lote || null, unidades: r.unidades || null,
        tipo_prenda_txt: r.tipo_prenda_txt,
      }));
      const res = await api.dogamaBulkDespachos(toSend, user.name || user.email);
      toast.success(`Importados: ${res.inserted}${res.duplicates > 0 ? ` | Dup: ${res.duplicates}` : ''}${res.errors > 0 ? ` | Errores: ${res.errors}` : ''}`);
      setCtx(resolvedCtx);
      setPreview(null);
      load();
    } catch (e: any) { toast.error(e?.message || 'Error al importar'); }
    finally { setImporting(false); }
  };

  const handleEstado = async (id: number, estado: string) => {
    try {
      await api.dogamaUpdateDespachoEstado(id, estado);
      setRows(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
    } catch { toast.error('Error al actualizar estado'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este despacho?')) return;
    try { await api.dogamaDeleteDespacho(id); toast.success('Eliminado'); load(); }
    catch { toast.error('Error al eliminar'); }
  };

  const resolve = (id: number | null, txt: string | null, nombre: string | null) =>
    nombre || txt || (id ? `#${id}` : '—');

  const columns: ColumnDef<Despacho>[] = [
    { header: '#', key: 'id', sortable: true, render: r => <span className="text-slate-400 text-xs">{r.id}</span> },
    { header: 'Fecha', key: 'fecha', sortable: true, render: r => <span className="text-xs">{r.fecha ? new Date(r.fecha).toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Ord. Cargue', key: 'orden_cargue', sortable: true },
    { header: 'Confeccionista', key: 'confeccionista_txt', sortable: true, render: r => <span className="font-semibold text-xs">{resolve(r.confeccionista_id, r.confeccionista_txt, r.confeccionista_nombre)}</span> },
    { header: 'Ord. Servicio', key: 'orden_servicio', sortable: true },
    { header: 'Marca', key: 'marca_txt', sortable: true, render: r => <span className="text-xs">{resolve(r.marca_id, r.marca_txt, r.marca_nombre)}</span> },
    { header: 'Referencia', key: 'referencia', sortable: true },
    { header: 'Lote', key: 'lote', sortable: true },
    { header: 'Unidades', key: 'unidades', sortable: true },
    { header: 'Tipo Prenda', key: 'tipo_prenda_txt', sortable: true, render: r => <span className="text-xs">{resolve(r.tipo_prenda_id, r.tipo_prenda_txt, r.tipo_prenda_nombre)}</span> },
    { header: 'Estado', key: 'estado', sortable: true, render: r => canEdit
        ? <EstadoSelect value={r.estado} options={ESTADOS_DESPACHO} onChange={v => handleEstado(r.id, v)} />
        : <EstadoBadge estado={r.estado} /> },
    { header: 'Creado', key: 'usuario_creacion', sortable: false, render: r => <span className="text-xs text-slate-400">{r.usuario_creacion || '—'}</span> },
    ...(canDelete ? [{ header: 'Acc.', key: 'acciones' as keyof Despacho, sortable: false,
      render: (r: Despacho) => <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 font-bold text-xs">Eliminar</button> }] : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {canCreate && (
          <>
            <button onClick={() => setShowForm(true)}
              className="px-5 py-2.5 rounded-2xl text-sm font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition">
              + Agregar
            </button>
            <label className="px-5 py-2.5 rounded-2xl text-sm font-black cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition">
              Importar Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileRef} onChange={handleFile} />
            </label>
          </>
        )}
        <button onClick={() => downloadTemplate('formato_despachos_dogama.xlsx',
          ['FECHA','ORDEN DE CARGUE','CONFECCIONISTA','ORDEN DE SERVICIO','MARCA','REFERENCIA','LOTE','UNIDADES','TIPO DE PRENDA'],
          { FECHA:'2026-06-01','ORDEN DE CARGUE':'30850','CONFECCIONISTA':'SUVETEX','ORDEN DE SERVICIO':'30850','MARCA':'ESPRIT','REFERENCIA':'113H011','LOTE':'30850','UNIDADES':'1944','TIPO DE PRENDA':'CAMISA' })}
          className="px-5 py-2.5 rounded-2xl text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition shadow-sm">
          Ver Formato
        </button>
        <span className="ml-auto text-xs text-slate-400 font-semibold">{rows.length} registros</span>
      </div>
      {loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
        : <DataTable<Despacho> data={rows} columns={columns} searchPlaceholder="Buscar confeccionista, referencia, marca…" excelFileName="despachos_dogama.xlsx" excelSheetName="Despachos" />}
      {preview && (
        <DespachoPreviewModal rows={preview} ctx={ctx} user={user}
          onClose={() => setPreview(null)} onConfirm={handleConfirm} importing={importing} />
      )}
      {showForm && (
        <DespachoFormModal ctx={ctx} user={user} onClose={() => setShowForm(false)} onSaved={load} />
      )}
    </div>
  );
}

// ── CITAS / RECOGIDAS TAB ─────────────────────────────────────────────────────

function CitasTab({ user }: { user: User }) {
  const [rows, setRows]       = useState<Cita[]>([]);
  const [ctx, setCtx]         = useState<ValidationCtx>({ marcas: [], proveedores: [], confeccionistas: [], tiposPrenda: [], tiposOc: [] });
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<CitaRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'create');
  const canEdit   = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'edit');
  const canDelete = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'delete');

  const load = async () => {
    setLoading(true);
    try {
      const [data, marcas, confs, tiposOc] = await Promise.all([
        api.dogamaGetCitas(),
        api.dogamaGetCatalog('dogama_marcas'),
        api.dogamaGetConfeccionistas(),
        api.dogamaGetCatalog('dogama_tipos_oc'),
      ]);
      setRows(data);
      setCtx(prev => ({ ...prev, marcas, confeccionistas: confs, tiposOc }));
    } catch { toast.error('Error al cargar citas'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: false });
      const sheet = wb.SheetNames.find(n => /cita/i.test(n)) || wb.SheetNames[0];
      const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
      if (!json.length) { toast.error('Archivo vacío'); return; }
      const p = buildCitaRows(json, rows, ctx);
      if (!p.length) { toast.error('Sin filas válidas'); return; }
      setPreview(p);
    } catch { toast.error('Error al leer el archivo'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleConfirm = async (selected: CitaRow[], resolvedCtx: ValidationCtx) => {
    setImporting(true);
    try {
      const toSend = selected.map(r => ({
        fecha: r.fecha || null, turno: r.turno || null,
        hora_inicio: r.hora_inicio || null, hora_fin: r.hora_fin || null,
        marca_txt: r.marca_txt, referencia: r.referencia || null, color: r.color || null,
        lote: r.lote || null, mesa: r.mesa ? Number(r.mesa) : null,
        cantidad: r.cantidad ? Number(r.cantidad) : null,
        proveedor_txt: r.proveedor_txt, proveedor: r.proveedor_txt || null,
        numero_documento: r.numero_documento || null, tipo_oc: r.tipo_oc || null,
      }));
      const res = await api.dogamaBulkCitas(toSend, user.name || user.email);
      toast.success(`Importados: ${res.inserted}${res.duplicates > 0 ? ` | Dup: ${res.duplicates}` : ''}${res.errors > 0 ? ` | Errores: ${res.errors}` : ''}`);
      setCtx(resolvedCtx);
      setPreview(null);
      await load();
    } catch (e: any) { toast.error(e?.message || 'Error al importar'); }
    finally { setImporting(false); }
  };

  const handleEstado = async (id: number, estado: string) => {
    try {
      await api.dogamaUpdateCitaEstado(id, estado);
      setRows(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
    } catch { toast.error('Error al actualizar estado'); }
  };

  const handlePatchHora = async (id: number, field: 'hora_inicio' | 'hora_fin', value: string) => {
    try {
      await api.dogamaPatchCita(id, { [field]: value || null });
      setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value || null } : r));
      toast.success('Hora actualizada');
    } catch { toast.error('Error al actualizar hora'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta cita?')) return;
    try { await api.dogamaDeleteCita(id); toast.success('Eliminado'); load(); }
    catch { toast.error('Error al eliminar'); }
  };

  const columns: ColumnDef<Cita>[] = [
    { header: '#', key: 'id', sortable: true, render: r => <span className="text-slate-400 text-xs">{r.id}</span> },
    { header: 'Fecha', key: 'fecha', sortable: true, render: r => <span className="text-xs">{r.fecha ? new Date(r.fecha).toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Turno', key: 'turno', sortable: true },
    { header: 'H. Inicio', key: 'hora_inicio', sortable: true,
      render: r => canEdit
        ? <HoraCell value={r.hora_inicio} onSave={v => handlePatchHora(r.id, 'hora_inicio', v)} />
        : <span className="font-mono text-xs">{r.hora_inicio || '—'}</span> },
    { header: 'H. Real Carga', key: 'hora_fin', sortable: false,
      render: r => canEdit
        ? <HoraCell value={r.hora_fin} onSave={v => handlePatchHora(r.id, 'hora_fin', v)} />
        : <span className="font-mono text-xs">{r.hora_fin || '—'}</span> },
    { header: 'Marca', key: 'marca_txt', sortable: true, render: r => <span className="font-semibold text-xs">{r.marca_nombre || r.marca_txt || '—'}</span> },
    { header: 'Referencia', key: 'referencia', sortable: true },
    { header: 'Color', key: 'color', sortable: true },
    { header: 'Lote', key: 'lote', sortable: true },
    { header: 'Mesa', key: 'mesa', sortable: true, render: r => <span className="font-mono text-xs">{r.mesa ?? '—'}</span> },
    { header: 'Cantidad', key: 'cantidad', sortable: true },
    { header: 'Proveedor', key: 'proveedor', sortable: true, render: r => <span className="text-xs max-w-[130px] block truncate">{r.proveedor_nombre || r.proveedor || '—'}</span> },
    { header: 'Nro. Documento', key: 'numero_documento', sortable: true },
    { header: 'Tipo OC', key: 'tipo_oc', sortable: true, render: r => <span className="text-xs">{r.tipo_oc_nombre || r.tipo_oc || '—'}</span> },
    { header: 'Estado', key: 'estado', sortable: true, render: r => canEdit
        ? <EstadoSelect value={r.estado} options={ESTADOS_CITA} onChange={v => handleEstado(r.id, v)} />
        : <EstadoBadge estado={r.estado} /> },
    { header: 'Creado', key: 'usuario_creacion', sortable: false, render: r => <span className="text-xs text-slate-400">{r.usuario_creacion || '—'}</span> },
    ...(canDelete ? [{ header: 'Acc.', key: 'acciones' as keyof Cita, sortable: false,
      render: (r: Cita) => <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 font-bold text-xs">Eliminar</button> }] : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {canCreate && (
          <>
            <button onClick={() => setShowForm(true)}
              className="px-5 py-2.5 rounded-2xl text-sm font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition">
              + Agregar
            </button>
            <label className="px-5 py-2.5 rounded-2xl text-sm font-black cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition">
              Importar Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileRef} onChange={handleFile} />
            </label>
          </>
        )}
        <button onClick={() => downloadTemplate('formato_citas_dogama.xlsx',
          ['Fecha','TURNO','Hora inicio','Hora fin','Marca','Referencia','COLOR','Lote','MESA','Cantidad','Proveedor','Numero del documento','TIPO DE OC'],
          { Fecha:'2026-06-01',TURNO:'DANI','Hora inicio':'07:30','Hora fin':'08:00',Marca:'AMERICANINO',Referencia:'070-810G000',COLOR:'Blanco',Lote:'29931',MESA:'1',Cantidad:'218',Proveedor:'C.VERA S.A.S','Numero del documento':'4500291966','TIPO DE OC':'SERV - Producción' })}
          className="px-5 py-2.5 rounded-2xl text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-700 transition shadow-sm">
          Ver Formato
        </button>
        <span className="ml-auto text-xs text-slate-400 font-semibold">{rows.length} registros</span>
      </div>
      {loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
        : <DataTable<Cita> data={rows} columns={columns} searchPlaceholder="Buscar referencia, proveedor, marca, documento…" excelFileName="citas_recogidas_dogama.xlsx" excelSheetName="Citas" />}
      {preview && (
        <CitaPreviewModal rows={preview} ctx={ctx} user={user}
          onClose={() => setPreview(null)} onConfirm={handleConfirm} importing={importing} />
      )}
      {showForm && (
        <CitaFormModal ctx={ctx} user={user} onClose={() => setShowForm(false)} onSaved={load} />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CitasDespachosCarga({ user }: Props) {
  const [tab, setTab] = useState('despachos');
  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Citas, Despacho y Carga</h1>
        <p className="text-slate-400 text-sm mt-1">Operación Jhon Uribe — Dogama</p>
      </div>
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {[{ key: 'despachos', label: 'Despachos Dogama' }, { key: 'citas', label: 'Citas / Recogidas' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'despachos' && <DespachoTab user={user} />}
      {tab === 'citas'     && <CitasTab user={user} />}
    </div>
  );
}
