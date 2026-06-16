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

interface CatalogItem { id: number; descripcion: string; estado_id: string | null; }
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
  // resolved IDs (set before onConfirm):
  confeccionista_id?: number | null; marca_id?: number | null; tipo_prenda_id?: number | null;
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
  // resolved IDs (set before onConfirm):
  proveedor_id?: number | null; marca_id?: number | null; tipo_oc_id?: number | null;
}

// ── DB row types ──────────────────────────────────────────────────────────────

interface Despacho {
  id: number; fecha: string | null; orden_cargue: string | null;
  confeccionista_id: number | null; confeccionista_nombre: string | null;
  orden_servicio: string | null; marca_id: number | null; marca_nombre: string | null;
  referencia: string | null; lote: string | null; unidades: number | null;
  tipo_prenda_id: number | null; tipo_prenda_nombre: string | null;
  estado_id: string | null; estado_nombre: string | null;
  usuario_creacion: string | null; fecha_creacion: string;
}

interface Cita {
  id: number; fecha: string | null; turno: string | null;
  hora_inicio: string | null; hora_fin: string | null;
  marca_id: number | null; marca_nombre: string | null;
  referencia: string | null; color: string | null; lote: string | null;
  mesa: number | null; cantidad: number | null;
  proveedor_id: number | null; proveedor_nombre: string | null;
  numero_documento: string | null;
  tipo_oc_id: number | null; tipo_oc_nombre: string | null;
  estado_id: string | null; estado_nombre: string | null;
  usuario_creacion: string | null; fecha_creacion: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const str  = (v: any) => String(v ?? '').trim();
const num  = (v: any) => { const n = Number(v); return isNaN(n) ? '' : String(Math.round(n)); };
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function excelDate(v: any): string {
  if (!v && v !== 0) return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return '';
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd/mm/yyyy HH:MM:SS
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`;
  // dd-mm-yyyy
  const ddmmd = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (ddmmd) return `${ddmmd[3]}-${ddmmd[2].padStart(2,'0')}-${ddmmd[1].padStart(2,'0')}`;
  // yyyy-mm-dd (ISO)
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return '';
}

// Normalize Excel row keys to UPPERCASE+TRIM for flexible column matching
function normalizeRow(row: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) out[k.trim().toUpperCase()] = row[k];
  return out;
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
  const [correo, setCorreo]   = useState('');
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.dogamaCreateConfeccionista({
        descripcion_conf: name,
        direccion: '',
        correo: correo || null,
        estado_id: 'EST-01',
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

// ── Mini-modal genérico para crear items de catálogo (marca, tipo OC, tipo prenda) ──

function CatalogMiniModal({ label, initialName, table, usuariocreacion, onClose, onCreated }: {
  label: string;
  initialName: string;
  table: string;
  usuariocreacion: string;
  onClose: () => void;
  onCreated: (item: CatalogItem) => void;
}) {
  const [nombre, setNombre] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nombre.trim()) { toast.error('El nombre no puede estar vacío'); return; }
    setSaving(true);
    try {
      const res = await api.dogamaCreateCatalogItem(table as any, { descripcion: nombre.trim(), estado_id: 'EST-01', usuariocreacion });
      onCreated(res);
      toast.success(`${label} "${nombre.trim()}" creada`);
      onClose();
    } catch (e: any) { toast.error(e?.message || `Error al crear "${nombre.trim()}"`); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-150">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-0.5">Nueva {label}</p>
          <p className="text-sm text-slate-400">Del archivo: <span className="font-bold text-slate-600">{initialName}</span></p>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 focus:bg-white" />
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !nombre.trim()}
            className="px-4 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diálogo de confirmación ───────────────────────────────────────────────────

function ConfirmDialog({ message, detail, labelYes = 'Sí, confirmar', labelNo = 'Cancelar', onYes, onNo }: {
  message: string;
  detail?: string;
  labelYes?: string;
  labelNo?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onNo}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-slate-800 mb-1">{message}</p>
        {detail && <p className="text-xs text-slate-500 mb-4">{detail}</p>}
        {!detail && <div className="mb-4" />}
        <div className="flex justify-end gap-2">
          <button onClick={onNo}
            className="px-4 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition">
            {labelNo}
          </button>
          <button onClick={onYes}
            className="px-4 py-2 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition">
            {labelYes}
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
  const [confs, setConfs]   = useState(initCtx.confeccionistas);
  const [tipos, setTipos]   = useState(initCtx.tiposPrenda);
  const [catalogMiniD, setCatalogMiniD] = useState<null | {
    label: string; table: string; initialName: string; onCreated: (item: CatalogItem) => void;
  }>(null);
  const [confMiniNameD, setConfMiniNameD] = useState<{ name: string; rowIndex: number; sourceTxt: string } | null>(null);
  const [confirmDlgD, setConfirmDlgD] = useState<null | {
    message: string; detail?: string; labelYes?: string; labelNo?: string; onYes: () => void;
  }>(null);
  const [confOverrides, setConfOverrides]   = useState<Map<number, number>>(new Map());
  const [confSelText, setConfSelText]       = useState<Map<number, string>>(new Map());
  const [validErrDlgD, setValidErrDlgD]    = useState<string[] | null>(null);
  const [highlightErrors, setHighlightErrors] = useState(false);
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

  // Auto-accept similar conf matches on first load
  React.useEffect(() => {
    setConfOverrides(prev => {
      const m = new Map(prev);
      let changed = false;
      rows.forEach(r => {
        if (r.conf_match.status === 'similar' && r.conf_match.id !== null && !m.has(r.index)) {
          m.set(r.index, r.conf_match.id!);
          changed = true;
        }
      });
      return changed ? m : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState<boolean[]>(() => initRows.map(r => r.status === 'nuevo'));

  const openCreateMarcaD = (name: string) =>
    setCatalogMiniD({ label: 'Marca', table: 'dogama_marcas', initialName: name, onCreated: item => setMarcas(prev => [...prev, item]) });

  const openCreateTipoD = (name: string) =>
    setCatalogMiniD({ label: 'Tipo de Prenda', table: 'dogama_tipos_prenda', initialName: name, onCreated: item => setTipos(prev => [...prev, item]) });

  const acceptMarcaSuggestion = (original: string, id: number, name: string) => {
    const count = rows.filter(r => normM(r.marca_txt) === normM(original)).length;
    const doAccept = () => {
      setMarcas(prev => {
        if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
        return [...prev, { id, descripcion: original, estado_id: 'EST-01' }];
      });
      toast.success(`"${original}" → "${name}"`);
    };
    setConfirmDlgD({ message: `¿Usar "${name}" para "${original}"?`, detail: `Se aplicará a las ${count} fila(s) con esa marca.`, labelYes: 'Sí, usar', labelNo: 'Cancelar', onYes: doAccept });
  };

  const acceptTipoSuggestion = (original: string, id: number, name: string) => {
    const count = rows.filter(r => normM(r.tipo_prenda_txt) === normM(original)).length;
    const doAccept = () => {
      setTipos(prev => {
        if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
        return [...prev, { id, descripcion: original, estado_id: 'EST-01' }];
      });
      toast.success(`"${original}" → "${name}"`);
    };
    setConfirmDlgD({ message: `¿Usar "${name}" para "${original}"?`, detail: `Se aplicará a las ${count} fila(s) con ese tipo.`, labelYes: 'Sí, usar', labelNo: 'Cancelar', onYes: doAccept });
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

  const unresolvedConfs = rows.filter(r =>
    r.conf_match.status !== 'exact' && r.conf_match.status !== 'empty' && !confOverrides.has(r.index)
  ).length;

  const counts = {
    nuevo: rows.filter(r => r.status === 'nuevo').length,
    dup_bd: rows.filter(r => r.status === 'duplicado_bd').length,
    dup_arch: rows.filter(r => r.status === 'duplicado_archivo').length,
    selected: selected.filter(Boolean).length,
    unresolved: notFoundMarcas.length + notFoundTipos.length + similarMarcas.length + similarTipos.length + unresolvedConfs,
  };

  const isBlocked = (r: DespachoRow) => r.status !== 'nuevo';
  const allChecked = filtered.filter(r => !isBlocked(r)).every((r) => selected[r.index]);

  const isRowUnresolvedD = (r: DespachoRow) =>
    (r.conf_match.status !== 'exact' && !confOverrides.has(r.index)) ||
    r.marca_match.status === 'not_found' ||
    r.tipo_match.status === 'not_found';

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
                      <button onClick={() => openCreateMarcaD(name)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition whitespace-nowrap">+ Crear</button>
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
                      <button onClick={() => openCreateMarcaD(original)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition whitespace-nowrap">+ Crear</button>
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
                      <button onClick={() => openCreateTipoD(name)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition whitespace-nowrap">+ Crear</button>
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
                      <button onClick={() => openCreateTipoD(original)}
                        className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition whitespace-nowrap">+ Crear</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {catalogMiniD && (
          <CatalogMiniModal label={catalogMiniD.label} table={catalogMiniD.table}
            initialName={catalogMiniD.initialName} usuariocreacion={user.id}
            onClose={() => setCatalogMiniD(null)}
            onCreated={item => { catalogMiniD.onCreated(item); setCatalogMiniD(null); }} />
        )}
        {confMiniNameD && (
          <ConfMiniModal name={confMiniNameD.name} usuariocreacion={user.id}
            onClose={() => setConfMiniNameD(null)}
            onCreated={conf => {
              setConfs(prev => [...prev, conf]);
              const { rowIndex, sourceTxt } = confMiniNameD;
              // Auto-select the new conf for the triggering row
              setConfOverrides(prev => new Map(prev).set(rowIndex, conf.id));
              setConfSelText(prev => new Map(prev).set(rowIndex, conf.descripcion_conf));
              setConfMiniNameD(null);
              // Find other rows with the same source name
              const sameRows = rows.filter(x =>
                x.index !== rowIndex &&
                normM(x.confeccionista_txt) === normM(sourceTxt) &&
                x.conf_match.status !== 'exact'
              );
              if (sameRows.length > 0) {
                setConfirmDlgD({
                  message: `"${conf.descripcion_conf}" creado y seleccionado en esta fila.`,
                  detail: `Hay ${sameRows.length} fila(s) más con "${sourceTxt}". ¿Aplicar el mismo confeccionista a todas?`,
                  labelYes: `Sí, aplicar a todas (${sameRows.length + 1})`,
                  labelNo: 'Solo esta fila',
                  onYes: () => {
                    setConfOverrides(prev => {
                      const m = new Map(prev);
                      sameRows.forEach(x => m.set(x.index, conf.id));
                      return m;
                    });
                    setConfSelText(prev => {
                      const m = new Map(prev);
                      sameRows.forEach(x => m.set(x.index, conf.descripcion_conf));
                      return m;
                    });
                    toast.success(`"${conf.descripcion_conf}" aplicado a ${sameRows.length + 1} filas`);
                  },
                });
              } else {
                toast.success(`"${conf.descripcion_conf}" creado y seleccionado`);
              }
            }} />
        )}
        {confirmDlgD && (
          <ConfirmDialog message={confirmDlgD.message} detail={confirmDlgD.detail}
            labelYes={confirmDlgD.labelYes} labelNo={confirmDlgD.labelNo}
            onYes={() => { confirmDlgD.onYes(); setConfirmDlgD(null); }}
            onNo={() => setConfirmDlgD(null)} />
        )}
        {validErrDlgD && (
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
              <p className="text-base font-black text-red-700 mb-3">Debe resolver antes de importar</p>
              <ul className="space-y-2 mb-5">
                {validErrDlgD.map((msg, i) => <li key={i} className="text-sm text-slate-700">• {msg}</li>)}
              </ul>
              <div className="flex justify-end">
                <button onClick={() => setValidErrDlgD(null)}
                  className="px-5 py-2 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition">
                  Entendido
                </button>
              </div>
            </div>
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
        <div className="flex-1 overflow-hidden px-2 sm:px-4 py-2 sm:py-3">
          <div className="h-full rounded-2xl sm:rounded-3xl border border-slate-100 overflow-auto">
            <table className="min-w-max w-full text-xs border-collapse">
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
                  <tr key={r.index} className={`hover:bg-slate-50/70 transition-colors ${!selected[r.index] ? 'opacity-40' : ''} ${highlightErrors && isRowUnresolvedD(r) ? 'bg-red-200' : ''}`}>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={selected[r.index]} disabled={isBlocked(r)}
                        onChange={() => toggle(r.index)} className="accent-indigo-500 disabled:cursor-not-allowed" />
                    </td>
                    <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{r.fecha || '—'}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.orden_cargue || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {r.conf_match.status === 'exact' && !confSelText.has(r.index)
                        ? <span className="text-emerald-600 text-xs font-semibold">{r.confeccionista_txt}</span>
                        : <div className="flex items-center gap-1">
                            <SearchableCombo
                              listId={`conf-${r.index}`}
                              options={confs.map(c => ({ id: c.id, label: c.descripcion_conf }))}
                              value={confSelText.get(r.index) ?? (r.conf_match.matchedName || '')}
                              onChange={(text, selId) => {
                                setConfSelText(prev => new Map(prev).set(r.index, text));
                                if (!selId) { setConfOverrides(prev => { const m = new Map(prev); m.delete(r.index); return m; }); return; }
                                const sameRows = rows.filter(x =>
                                  x.index !== r.index &&
                                  normM(x.confeccionista_txt) === normM(r.confeccionista_txt) &&
                                  x.conf_match.status !== 'exact'
                                );
                                const applyOne = () => setConfOverrides(prev => new Map(prev).set(r.index, selId));
                                const applyAll = () => {
                                  setConfOverrides(prev => {
                                    const m = new Map(prev);
                                    m.set(r.index, selId);
                                    sameRows.forEach(x => m.set(x.index, selId));
                                    return m;
                                  });
                                  setConfSelText(prev => {
                                    const m = new Map(prev);
                                    sameRows.forEach(x => m.set(x.index, text));
                                    return m;
                                  });
                                };
                                applyOne();
                                if (sameRows.length > 0) {
                                  setConfirmDlgD({
                                    message: `Hay ${sameRows.length} fila(s) más con "${r.confeccionista_txt}".`,
                                    detail: `¿Usar "${text}" para todas?`,
                                    labelYes: `Sí, aplicar a todas (${sameRows.length + 1})`,
                                    labelNo: 'Solo esta fila',
                                    onYes: applyAll,
                                  });
                                }
                              }}
                              placeholder={r.confeccionista_txt || 'Buscar…'}
                              className="w-[130px]"
                            />
                            <button title="Crear nuevo confeccionista"
                              onClick={() => setConfMiniNameD({ name: r.confeccionista_txt, rowIndex: r.index, sourceTxt: r.confeccionista_txt })}
                              className="text-xs px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition font-bold">+</button>
                          </div>
                      }
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
              const unresConfs  = sel.filter(r => r.conf_match.status !== 'exact' && !confOverrides.has(r.index));
              if (unresMarcas.length) msgs.push(`Marcas sin definir: ${unresMarcas.join(', ')}`);
              if (unresTipos.length)  msgs.push(`Tipos de prenda sin definir: ${unresTipos.join(', ')}`);
              if (unresConfs.length)  msgs.push(`Confeccionista sin asignar en ${unresConfs.length} fila(s) — use el selector de la columna Confeccionista`);
              if (msgs.length) { setValidErrDlgD(msgs); setHighlightErrors(true); return; }
              onConfirm(
                rows.map((r, i) => ({
                  ...r,
                  selected: selected[i],
                  confeccionista_id: confOverrides.get(r.index) ?? r.conf_match.id ?? null,
                  marca_id: r.marca_match.id ?? null,
                  tipo_prenda_id: r.tipo_match.id ?? null,
                })).filter(r => r.selected),
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
  const [confMiniName, setConfMiniName] = useState<string | null>(null);
  // CatalogMiniModal para marcas y tipos OC
  const [catalogMini, setCatalogMini] = useState<null | {
    label: string; table: string; initialName: string; onCreated: (item: CatalogItem) => void;
  }>(null);
  // Diálogo de confirmación genérico
  const [confirmDlg, setConfirmDlg] = useState<null | {
    message: string; detail?: string; labelYes?: string; labelNo?: string; onYes: () => void;
  }>(null);
  const [search, setSearch]   = useState('');
  const [pageSize, setPageSize]   = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  // Per-row overrides
  const [provOverrides, setProvOverrides] = useState<Map<number, number>>(new Map());
  const [provSelText, setProvSelText]     = useState<Map<number, string>>(new Map());
  const [horaOverrides, setHoraOverrides] = useState<Map<number, string>>(new Map());
  const [marcaSelText, setMarcaSelText]   = useState<Map<number, string>>(new Map());
  const [tipoOcSelText, setTipoOcSelText] = useState<Map<number, string>>(new Map());
  // Dialog de error de validación (reemplaza toast)
  const [validErrDlg, setValidErrDlg] = useState<string[] | null>(null);
  const [highlightErrorsC, setHighlightErrorsC] = useState(false);
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

  // Auto-accept similar proveedor matches on first load
  React.useEffect(() => {
    setProvOverrides(prev => {
      const m = new Map(prev);
      let changed = false;
      rows.forEach(r => {
        if (r.prov_match.status === 'similar' && r.prov_match.id !== null && !m.has(r.index)) {
          m.set(r.index, r.prov_match.id!);
          changed = true;
        }
      });
      return changed ? m : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState<boolean[]>(() => initRows.map(r => r.status === 'nuevo'));

  const openCreateMarca = (name: string) => {
    setCatalogMini({
      label: 'Marca', table: 'dogama_marcas', initialName: name,
      onCreated: item => setMarcas(prev => [...prev, item]),
    });
  };

  const doAcceptMarca = (original: string, id: number, name: string) => {
    setMarcas(prev => {
      if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
      return [...prev, { id, descripcion: original, estado_id: 'EST-01' }];
    });
    toast.success(`"${original}" → "${name}"`);
  };

  const unresolvedMarcaNames = useMemo(() =>
    new Set(rows.filter(r => r.marca_txt && r.marca_match.status !== 'exact' && r.marca_match.status !== 'empty').map(r => r.marca_txt)),
    [rows]);

  const unresolvedTipoOcNames = useMemo(() =>
    new Set(rows.filter(r => r.tipo_oc && r.tipo_oc_match.status !== 'exact' && r.tipo_oc_match.status !== 'empty').map(r => r.tipo_oc)),
    [rows]);

  const openCreateTipoOc = (name: string) => {
    setCatalogMini({
      label: 'Tipo OC', table: 'dogama_tipos_oc', initialName: name,
      onCreated: item => setTiposOc(prev => [...prev, item]),
    });
  };

  const doAcceptTipoOc = (original: string, id: number, name: string) => {
    setTiposOc(prev => {
      if (prev.find(m => normM(m.descripcion) === normM(original))) return prev;
      return [...prev, { id, descripcion: original, estado_id: 'EST-01' }];
    });
    toast.success(`"${original}" → "${name}"`);
  };

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
    unresolved: unresolvedMarcaNames.size + unresolvedTipoOcNames.size,
  };

  const isBlocked = (r: CitaRow) => r.status !== 'nuevo';
  const allChecked = filtered.filter(r => !isBlocked(r)).every(r => selected[r.index]);

  const isRowUnresolvedC = (r: CitaRow) =>
    (r.prov_match.status !== 'exact' && !provOverrides.has(r.index)) ||
    (r.marca_match.status !== 'exact' && r.marca_match.status !== 'empty') ||
    (r.tipo_oc_match.status === 'not_found');

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

        {/* Overlays: ConfMiniModal, CatalogMiniModal, ConfirmDialog, ValidationError */}
        {confMiniName && (
          <ConfMiniModal name={confMiniName} usuariocreacion={user.id}
            onClose={() => setConfMiniName(null)}
            onCreated={conf => { setConfs(prev => [...prev, conf]); setConfMiniName(null); }} />
        )}
        {catalogMini && (
          <CatalogMiniModal label={catalogMini.label} table={catalogMini.table}
            initialName={catalogMini.initialName} usuariocreacion={user.id}
            onClose={() => setCatalogMini(null)}
            onCreated={item => { catalogMini.onCreated(item); setCatalogMini(null); }} />
        )}
        {confirmDlg && (
          <ConfirmDialog message={confirmDlg.message} detail={confirmDlg.detail}
            labelYes={confirmDlg.labelYes} labelNo={confirmDlg.labelNo}
            onYes={() => { confirmDlg.onYes(); setConfirmDlg(null); }}
            onNo={() => setConfirmDlg(null)} />
        )}
        {validErrDlg && (
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
              <p className="text-base font-black text-red-700 mb-3">Debe resolver antes de importar</p>
              <ul className="space-y-2 mb-5">
                {validErrDlg.map((msg, i) => <li key={i} className="text-sm text-slate-700">• {msg}</li>)}
              </ul>
              <div className="flex justify-end">
                <button onClick={() => setValidErrDlg(null)}
                  className="px-5 py-2 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition">
                  Entendido
                </button>
              </div>
            </div>
          </div>
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
        <div className="flex-1 overflow-hidden px-2 sm:px-4 py-2 sm:py-3">
          <div className="h-full rounded-2xl sm:rounded-3xl border border-slate-100 overflow-auto">
            <table className="min-w-max w-full text-xs border-collapse">
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
                  <tr key={r.index} className={`hover:bg-slate-50/70 transition-colors ${!selected[r.index] ? 'opacity-40' : ''} ${highlightErrorsC && isRowUnresolvedC(r) ? 'bg-red-200' : ''}`}>
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
                    <td className="px-2 py-2 whitespace-nowrap">
                      {r.marca_match.status === 'exact' && !marcaSelText.has(r.index)
                        ? <span className="text-emerald-600 text-xs font-semibold">{r.marca_txt}</span>
                        : <div className="flex items-center gap-1">
                            <SearchableCombo
                              listId={`marca-${r.index}`}
                              options={marcas.map(m => ({ id: m.id, label: m.descripcion }))}
                              value={marcaSelText.get(r.index) ?? (r.marca_match.matchedName || '')}
                              onChange={(text, selId) => {
                                setMarcaSelText(prev => new Map(prev).set(r.index, text));
                                if (!selId) return;
                                const sameRows = rows.filter(x =>
                                  x.index !== r.index &&
                                  normM(x.marca_txt) === normM(r.marca_txt) &&
                                  x.marca_match.status !== 'exact'
                                );
                                if (sameRows.length > 0) {
                                  setConfirmDlg({
                                    message: `Hay ${sameRows.length} fila(s) más con "${r.marca_txt}".`,
                                    detail: `¿Usar "${text}" para todas?`,
                                    labelYes: `Sí, aplicar a todas (${sameRows.length + 1})`,
                                    labelNo: 'Solo esta fila',
                                    onYes: () => doAcceptMarca(r.marca_txt, selId, text),
                                  });
                                }
                                doAcceptMarca(r.marca_txt, selId, text);
                              }}
                              placeholder={r.marca_txt || 'Buscar…'}
                              className="w-[110px]"
                            />
                            <button title="Crear nueva marca" onClick={() => openCreateMarca(r.marca_txt)}
                              className="text-xs px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition font-bold">+</button>
                          </div>
                      }
                    </td>
                    <td className="px-2 py-2 font-semibold whitespace-nowrap">{r.referencia}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.color || '—'}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.lote}</td>
                    <td className="px-2 py-2 text-center">{r.mesa || '—'}</td>
                    <td className="px-2 py-2 text-center">{r.cantidad}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {r.prov_match.status === 'exact' && !provSelText.has(r.index)
                        ? <span className="text-emerald-600 text-xs font-semibold">{r.proveedor_txt}</span>
                        : <div className="flex items-center gap-1">
                            <SearchableCombo
                              listId={`prov-${r.index}`}
                              options={confs.map(c => ({ id: c.id, label: c.descripcion_conf }))}
                              value={provSelText.get(r.index) ?? (r.prov_match.matchedName || '')}
                              onChange={(text, selId) => {
                                setProvSelText(prev => new Map(prev).set(r.index, text));
                                if (!selId) { setProvOverrides(prev => { const m = new Map(prev); m.delete(r.index); return m; }); return; }
                                // All other non-exact rows with the same source name
                                const sameRows = rows.filter(x =>
                                  x.index !== r.index &&
                                  normM(x.proveedor_txt) === normM(r.proveedor_txt) &&
                                  x.prov_match.status !== 'exact'
                                );
                                const applyOne = () => setProvOverrides(prev => new Map(prev).set(r.index, selId));
                                const applyAll = () => {
                                  setProvOverrides(prev => {
                                    const m = new Map(prev);
                                    m.set(r.index, selId);
                                    sameRows.forEach(x => m.set(x.index, selId));
                                    return m;
                                  });
                                  setProvSelText(prev => {
                                    const m = new Map(prev);
                                    sameRows.forEach(x => m.set(x.index, text));
                                    return m;
                                  });
                                };
                                applyOne();
                                if (sameRows.length > 0) {
                                  setConfirmDlg({
                                    message: `Hay ${sameRows.length} fila(s) más con "${r.proveedor_txt}".`,
                                    detail: `¿Usar "${text}" para todas?`,
                                    labelYes: `Sí, aplicar a todas (${sameRows.length + 1})`,
                                    labelNo: 'Solo esta fila',
                                    onYes: applyAll,
                                  });
                                }
                              }}
                              placeholder={r.proveedor_txt || 'Buscar…'}
                              className="w-[130px]"
                            />
                            <button title="Crear nuevo confeccionista" onClick={() => setConfMiniName(r.proveedor_txt)}
                              className="text-xs px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition font-bold">+</button>
                          </div>
                      }
                    </td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{r.numero_documento}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {r.tipo_oc_match.status === 'exact' && !tipoOcSelText.has(r.index)
                        ? <span className="text-emerald-600 text-xs font-semibold">{r.tipo_oc}</span>
                        : r.tipo_oc_match.status === 'empty'
                          ? <span className="text-slate-300 text-xs">—</span>
                          : <div className="flex items-center gap-1">
                              <SearchableCombo
                                listId={`tipooc-${r.index}`}
                                options={tiposOc.map(t => ({ id: t.id, label: t.descripcion }))}
                                value={tipoOcSelText.get(r.index) ?? (r.tipo_oc_match.matchedName || '')}
                                onChange={(text, selId) => {
                                  setTipoOcSelText(prev => new Map(prev).set(r.index, text));
                                  if (!selId) return;
                                  const sameRows = rows.filter(x =>
                                    x.index !== r.index &&
                                    normM(x.tipo_oc) === normM(r.tipo_oc) &&
                                    x.tipo_oc_match.status !== 'exact'
                                  );
                                  if (sameRows.length > 0) {
                                    setConfirmDlg({
                                      message: `Hay ${sameRows.length} fila(s) más con "${r.tipo_oc}".`,
                                      detail: `¿Usar "${text}" para todas?`,
                                      labelYes: `Sí, aplicar a todas (${sameRows.length + 1})`,
                                      labelNo: 'Solo esta fila',
                                      onYes: () => doAcceptTipoOc(r.tipo_oc, selId, text),
                                    });
                                  }
                                  doAcceptTipoOc(r.tipo_oc, selId, text);
                                }}
                                placeholder={r.tipo_oc || 'Buscar…'}
                                className="w-[110px]"
                              />
                              <button title="Crear tipo OC" onClick={() => openCreateTipoOc(r.tipo_oc)}
                                className="text-xs px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition font-bold">+</button>
                            </div>
                      }
                    </td>
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
              if (msgs.length) { setValidErrDlg(msgs); setHighlightErrorsC(true); return; }
              onConfirm(
                rows.map((r, i) => ({
                  ...r,
                  selected: selected[i],
                  hora_fin: horaOverrides.get(r.index) ?? r.hora_fin,
                  proveedor_id: provOverrides.get(r.index) ?? r.prov_match.id ?? null,
                  marca_id: r.marca_match.id ?? null,
                  tipo_oc_id: r.tipo_oc_match.id ?? null,
                })).filter(r => r.selected),
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

const ESTADOS_DESPACHO: { id: string; label: string }[] = [
  { id: 'EST-03', label: 'PENDIENTE' }, { id: 'EST-09', label: 'ALISTADO' },
  { id: 'EST-10', label: 'ASIGNADO' }, { id: 'EST-11', label: 'EN RUTA' },
  { id: 'EST-12', label: 'ENTREGADO' }, { id: 'EST-17', label: 'RECHAZADO' },
];
const ESTADOS_CITA: { id: string; label: string }[] = [
  { id: 'EST-03', label: 'PENDIENTE' }, { id: 'EST-06', label: 'RECIBIDO' },
  { id: 'EST-07', label: 'COMPLETADO' }, { id: 'EST-17', label: 'RECHAZADO' },
];

const ESTADO_COLORS: Record<string, string> = {
  'EST-03': 'bg-amber-100 text-amber-700',
  'EST-06': 'bg-blue-100 text-blue-700',
  'EST-07': 'bg-emerald-100 text-emerald-700',
  'EST-09': 'bg-purple-100 text-purple-700',
  'EST-10': 'bg-indigo-100 text-indigo-700',
  'EST-11': 'bg-sky-100 text-sky-700',
  'EST-12': 'bg-green-100 text-green-700',
  'EST-17': 'bg-red-100 text-red-700',
};

function EstadoBadge({ estado_id, estado_nombre }: { estado_id: string | null; estado_nombre: string | null }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ESTADO_COLORS[estado_id || ''] || 'bg-slate-100 text-slate-500'}`}>
      {estado_nombre || estado_id || '—'}
    </span>
  );
}

function EstadoSelect({ value, options, onChange }: { value: string | null; options: { id: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()}
      className="text-xs border border-slate-200 rounded-xl px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer">
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
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
  marca_txt: '', referencia: '', lote: '', unidades: '', tipo_prenda_txt: '',
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
      const res = await api.dogamaBulkDespachos(payload, user.id);
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
  proveedor_txt: '', numero_documento: '', tipo_oc: '',
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
      const res = await api.dogamaBulkCitas(payload, user.id);
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
  return json.map((rawRow, i) => {
    const row              = normalizeRow(rawRow);
    const fecha            = excelDate(row['FECHA'] ?? '');
    const orden_cargue     = str(row['ORDEN DE CARGUE'] ?? '');
    const confeccionista_txt = str(row['CONFECCIONISTA'] ?? '');
    const orden_servicio   = str(row['ORDEN DE SERVICIO'] ?? '');
    const marca_txt        = str(row['MARCA'] ?? '');
    const referencia       = str(row['REFERENCIA'] ?? '');
    const lote             = str(row['LOTE'] ?? '');
    const unidades         = num(row['UNIDADES'] ?? '');
    const tipo_prenda_txt  = str(row['TIPO DE PRENDA'] ?? '');

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
  return json.map((rawRow, i) => {
    const row              = normalizeRow(rawRow);
    const fecha            = excelDate(row['FECHA'] ?? '');
    const turno            = str(row['TURNO'] ?? '');
    // Find hora columns by partial key match (flexible: "HORA INICIO", "Hora Inicio", etc.)
    const allKeys          = Object.keys(row);
    const horaKeys         = allKeys.filter(k => /^HORA/.test(k));
    const hora_inicio      = excelTime(horaKeys[0] ? row[horaKeys[0]] : '');
    const hora_fin         = excelTime(horaKeys[1] ? row[horaKeys[1]] : '');
    const marca_txt        = str(row['MARCA'] ?? '');
    const referencia       = str(row['REFERENCIA'] ?? '');
    const color            = str(row['COLOR'] ?? '');
    const lote             = str(row['LOTE'] ?? '');
    const mesa             = num(row['MESA'] ?? '');
    const cantidad         = num(row['CANTIDAD'] ?? '');
    const proveedor_txt    = str(row['PROVEEDOR'] ?? '');
    const numero_documento = str(row['NUMERO DEL DOCUMENTO'] ?? row['NRODOCUMENTO'] ?? row['NRO DOCUMENTO'] ?? '');
    const tipo_oc          = str(row['TIPO DE OC'] ?? '');

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
  const [formatErrDlg, setFormatErrDlg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'create');
  const canEdit   = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'edit');
  const canDelete = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'delete');

  const DESPACHO_REQUIRED_COLS = ['FECHA','ORDEN DE CARGUE','CONFECCIONISTA','ORDEN DE SERVICIO','MARCA','REFERENCIA','LOTE','UNIDADES'];

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
      // Validate format: required columns must be present
      const fileKeys = Object.keys(json[0]).map(k => k.trim().toUpperCase());
      const missing = DESPACHO_REQUIRED_COLS.filter(col => !fileKeys.includes(col));
      if (missing.length > 0) { setFormatErrDlg(true); return; }
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
        fecha: r.fecha || null,
        orden_cargue: r.orden_cargue || null,
        confeccionista_id: r.confeccionista_id ?? null,
        orden_servicio: r.orden_servicio || null,
        marca_id: r.marca_id ?? null,
        marca_txt: r.marca_txt || null,
        referencia: r.referencia || null,
        lote: r.lote || null,
        unidades: r.unidades || null,
        tipo_prenda_id: r.tipo_prenda_id ?? null,
      }));
      const res = await api.dogamaBulkDespachos(toSend, user.id);
      toast.success(`Importados: ${res.inserted}${res.duplicates > 0 ? ` | Dup: ${res.duplicates}` : ''}${res.errors > 0 ? ` | Errores: ${res.errors}` : ''}`);
      setCtx(resolvedCtx);
      setPreview(null);
      load();
    } catch (e: any) { toast.error(e?.message || 'Error al importar'); }
    finally { setImporting(false); }
  };

  const handleEstado = async (id: number, estado_id: string) => {
    try {
      await api.dogamaUpdateDespachoEstado(id, estado_id);
      const found = ESTADOS_DESPACHO.find(e => e.id === estado_id);
      setRows(prev => prev.map(r => r.id === id ? { ...r, estado_id, estado_nombre: found?.label || null } : r));
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
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true, render: r => <span className="font-semibold text-xs">{r.confeccionista_nombre || (r.confeccionista_id ? `#${r.confeccionista_id}` : '—')}</span> },
    { header: 'Ord. Servicio', key: 'orden_servicio', sortable: true },
    { header: 'Marca', key: 'marca_nombre', sortable: true, render: r => <span className="text-xs">{r.marca_nombre || (r.marca_id ? `#${r.marca_id}` : '—')}</span> },
    { header: 'Referencia', key: 'referencia', sortable: true },
    { header: 'Lote', key: 'lote', sortable: true },
    { header: 'Unidades', key: 'unidades', sortable: true },
    { header: 'Tipo Prenda', key: 'tipo_prenda_nombre', sortable: true, render: r => <span className="text-xs">{r.tipo_prenda_nombre || (r.tipo_prenda_id ? `#${r.tipo_prenda_id}` : '—')}</span> },
    { header: 'Estado', key: 'estado_id', sortable: true, render: r => <EstadoBadge estado_id={r.estado_id} estado_nombre={r.estado_nombre} /> },
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
      {formatErrDlg && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <p className="text-base font-black text-red-700 mb-2">Formato incorrecto</p>
            <p className="text-sm text-slate-600 mb-3">
              El archivo no corresponde al formato de <strong>Despachos Dogama</strong>.<br/>
              Descarga el formato correcto con el botón <strong>"Ver Formato"</strong> y asegúrate de que el archivo tenga las siguientes columnas:
            </p>
            <ul className="text-xs text-slate-500 space-y-1 mb-5 bg-slate-50 rounded-2xl px-4 py-3">
              {DESPACHO_REQUIRED_COLS.map(c => <li key={c} className="font-mono">• {c}</li>)}
            </ul>
            <div className="flex justify-end">
              <button onClick={() => setFormatErrDlg(false)}
                className="px-5 py-2 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
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
  const [formatErrDlg, setFormatErrDlg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'create');
  const canEdit   = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'edit');
  const canDelete = hasPermission(user, 'CITAS_DESPACHO_CARGA', 'delete');

  const CITA_REQUIRED_COLS = ['FECHA','TURNO','MARCA','REFERENCIA','COLOR','LOTE','MESA','CANTIDAD','PROVEEDOR','NUMERO DEL DOCUMENTO','TIPO DE OC'];

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
      const fileKeys = Object.keys(json[0]).map(k => k.trim().toUpperCase());
      const missing = CITA_REQUIRED_COLS.filter(col => !fileKeys.includes(col));
      if (missing.length > 0) { setFormatErrDlg(true); return; }
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
        fecha: r.fecha || null,
        turno: r.turno || null,
        hora_inicio: r.hora_inicio || null,
        hora_fin: r.hora_fin || null,
        marca_id: r.marca_id ?? null,
        referencia: r.referencia || null,
        color: r.color || null,
        lote: r.lote || null,
        mesa: r.mesa ? Number(r.mesa) : null,
        cantidad: r.cantidad ? Number(r.cantidad) : null,
        proveedor_id: r.proveedor_id ?? null,
        numero_documento: r.numero_documento || null,
        tipo_oc_id: r.tipo_oc_id ?? null,
      }));
      const res = await api.dogamaBulkCitas(toSend, user.id);
      toast.success(`Importados: ${res.inserted}${res.duplicates > 0 ? ` | Dup: ${res.duplicates}` : ''}${res.errors > 0 ? ` | Errores: ${res.errors}` : ''}`);
      setCtx(resolvedCtx);
      setPreview(null);
      await load();
    } catch (e: any) { toast.error(e?.message || 'Error al importar'); }
    finally { setImporting(false); }
  };

  const handleEstado = async (id: number, estado_id: string) => {
    try {
      await api.dogamaUpdateCitaEstado(id, estado_id);
      const found = ESTADOS_CITA.find(e => e.id === estado_id);
      setRows(prev => prev.map(r => r.id === id ? { ...r, estado_id, estado_nombre: found?.label || null } : r));
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
    { header: 'Marca', key: 'marca_nombre', sortable: true, render: r => <span className="font-semibold text-xs">{r.marca_nombre || (r.marca_id ? `#${r.marca_id}` : '—')}</span> },
    { header: 'Referencia', key: 'referencia', sortable: true },
    { header: 'Color', key: 'color', sortable: true },
    { header: 'Lote', key: 'lote', sortable: true },
    { header: 'Mesa', key: 'mesa', sortable: true, render: r => <span className="font-mono text-xs">{r.mesa ?? '—'}</span> },
    { header: 'Cantidad', key: 'cantidad', sortable: true },
    { header: 'Proveedor', key: 'proveedor_nombre', sortable: true, render: r => <span className="text-xs max-w-[130px] block truncate">{r.proveedor_nombre || (r.proveedor_id ? `#${r.proveedor_id}` : '—')}</span> },
    { header: 'Nro. Documento', key: 'numero_documento', sortable: true },
    { header: 'Tipo OC', key: 'tipo_oc_nombre', sortable: true, render: r => <span className="text-xs">{r.tipo_oc_nombre || (r.tipo_oc_id ? `#${r.tipo_oc_id}` : '—')}</span> },
    { header: 'Estado', key: 'estado_id', sortable: true, render: r => <EstadoBadge estado_id={r.estado_id} estado_nombre={r.estado_nombre} /> },
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
      {formatErrDlg && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <p className="text-base font-black text-red-700 mb-2">Formato incorrecto</p>
            <p className="text-sm text-slate-600 mb-3">
              El archivo no corresponde al formato de <strong>Citas / Recogidas Dogama</strong>.<br/>
              Descarga el formato correcto con el botón <strong>"Ver Formato"</strong> y asegúrate de que el archivo tenga las siguientes columnas:
            </p>
            <ul className="text-xs text-slate-500 space-y-1 mb-5 bg-slate-50 rounded-2xl px-4 py-3">
              {CITA_REQUIRED_COLS.map(c => <li key={c} className="font-mono">• {c}</li>)}
            </ul>
            <div className="flex justify-end">
              <button onClick={() => setFormatErrDlg(false)}
                className="px-5 py-2 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

// ── Asignación Placa × Planilla ───────────────────────────────────────────────

interface Client    { id: string; name: string; status_id: string | null; }
interface Vehicle   { id: string; plate: string; client_id: string | null; status_id: string | null; brand: string | null; }
interface Driver    { id: string; name: string; client_id: string | null; status_id: string | null; }
interface FleetAssignment {
  assignment_id: number;
  vehicle_id: string; plate: string; vehicle_brand: string | null;
  driver_id: string; driver_name: string;
  client_id: string; client_name: string;
}
type AsignMode = 'placa_a_registros' | 'registros_a_placa';
type TipoReg  = 'despachos' | 'citas' | 'ambos';

interface PlanillaHistorial {
  id: number; fecha: string;
  vehicle_id: string | null; placa: string | null; vehicle_brand: string | null;
  conductor_id: string | null; conductor_nombre: string | null;
  client_id: string | null; client_nombre: string | null;
  remesa: string | null; manifiesto: string | null;
  valor_cxc: string | null; valor_cxp: string | null;
  tipo: 'despacho' | 'cita';
  despacho_id: number | null; cita_id: number | null;
  usuario_creacion: string | null; fecha_creacion: string;
  usuario_nombre: string | null; confeccionista_nombre: string | null;
}

// ── Diálogo de nueva asignación ────────────────────────────────────────────────

function AsignacionDialog({ open, user, onClose, onSaved }: {
  open: boolean; user: User; onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode]               = useState<AsignMode | null>(null);
  const [clients,     setClients]     = useState<Client[]>([]);
  const [vehicles,    setVehicles]    = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<FleetAssignment[]>([]);
  const [despachos,   setDespachos]   = useState<Despacho[]>([]);
  const [citas,       setCitas]       = useState<Cita[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setMode(null); return; }
    const load = async () => {
      setLoading(true);
      try {
        const [asgns, desps, cts] = await Promise.all([
          api.dogamaGetFleetAssignments(),
          api.dogamaGetDespachos(true),
          api.dogamaGetCitas(true),
        ]);
        const userClientIds = user.clientIds ?? (user.clientId ? [user.clientId] : []);
        const allAsgns: FleetAssignment[] = Array.isArray(asgns) ? asgns : [];
        const authorizedAsgns = userClientIds.length
          ? allAsgns.filter(a => userClientIds.includes(a.client_id))
          : allAsgns;
        setAssignments(authorizedAsgns);

        // Derive unique clients from active assignments
        const clientMap = new Map<string, Client>();
        authorizedAsgns.forEach(a => {
          if (!clientMap.has(a.client_id))
            clientMap.set(a.client_id, { id: a.client_id, name: a.client_name, status_id: null });
        });
        setClients([...clientMap.values()]);

        // Derive vehicles from active assignments (already filtered + active by definition)
        setVehicles(authorizedAsgns.map(a => ({
          id: a.vehicle_id, plate: a.plate,
          client_id: a.client_id, status_id: 'EST-01',
          brand: a.vehicle_brand,
        })));

        setDespachos(Array.isArray(desps) ? desps : []);
        setCitas(Array.isArray(cts) ? cts : []);
      } catch { toast.error('Error al cargar datos'); }
      finally { setLoading(false); }
    };
    load();
  }, [open]);

  if (!open) return null;

  const handleClose = () => { setMode(null); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header del diálogo */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        {mode ? (
          <button onClick={() => setMode(null)}
            className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <div className="w-9 h-9 rounded-2xl bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">Nueva Asignación</h2>
          <p className="text-xs text-slate-400">
            {!mode ? '¿Cómo desea realizar la asignación?' :
             mode === 'placa_a_registros' ? 'Seleccione placa y los registros pendientes' :
             'Asigne una placa a cada cita y/o despacho pendiente'}
          </p>
        </div>
        <button onClick={handleClose}
          className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition text-slate-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center items-center py-32">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !mode ? (
          /* Selección de modo */
          <div className="max-w-2xl mx-auto py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <button onClick={() => setMode('placa_a_registros')}
                className="group text-left p-6 rounded-3xl border-2 border-slate-200 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-100 transition-all duration-200 bg-white">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center mb-4 transition-colors">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-black text-slate-800 mb-1">Selecciono una placa</p>
                <p className="text-xs text-slate-500 leading-relaxed">Elijo una placa y le asigno múltiples citas y/o despachos pendientes en bloque.</p>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:gap-2 transition-all">Seleccionar →</div>
              </button>
              <button onClick={() => setMode('registros_a_placa')}
                className="group text-left p-6 rounded-3xl border-2 border-slate-200 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100 transition-all duration-200 bg-white">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center mb-4 transition-colors">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </div>
                <p className="text-sm font-black text-slate-800 mb-1">Asigno placa a cada registro</p>
                <p className="text-xs text-slate-500 leading-relaxed">Veo todos los pendientes y asigno una placa diferente a cada cita y/o despacho.</p>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 group-hover:gap-2 transition-all">Seleccionar →</div>
              </button>
            </div>
          </div>
        ) : mode === 'placa_a_registros' ? (
          <FlowPlacaARegistros
            user={user} clients={clients} assignments={assignments}
            despachos={despachos} citas={citas}
            onBack={() => setMode(null)}
            onSaved={() => { handleClose(); onSaved(); }}
          />
        ) : (
          <FlowRegistrosAPlaca
            user={user} assignments={assignments}
            despachos={despachos} citas={citas}
            onBack={() => setMode(null)}
            onSaved={() => { handleClose(); onSaved(); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab principal: historial + filtros ────────────────────────────────────────

function AsignacionPlacaTab({ user }: { user: User }) {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const [showDialog, setShowDialog] = useState(false);
  const [historial,  setHistorial]  = useState<PlanillaHistorial[]>([]);
  const [loading,    setLoading]    = useState(false);

  // Filtros
  const [fPlaca, setFPlaca] = useState('');
  const [fFecha, setFFecha] = useState(today);
  const [fConf,  setFConf]  = useState('');

  const loadHistorial = async (filters: { placa?: string; fecha?: string; confeccionista?: string }) => {
    setLoading(true);
    try {
      const rows = await api.dogamaGetPlanillasHistorial(filters);
      setHistorial(Array.isArray(rows) ? rows : []);
    } catch { toast.error('Error al cargar historial'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadHistorial({ fecha: today }); }, []);

  const handleConsultar = () => loadHistorial({
    placa: fPlaca || undefined,
    fecha: fFecha || undefined,
    confeccionista: fConf || undefined,
  });

  const handleLimpiar = () => {
    setFPlaca(''); setFFecha(today); setFConf('');
    loadHistorial({ fecha: today });
  };

  const histCols: ColumnDef<PlanillaHistorial>[] = [
    { header: '#',              key: 'id',                    sortable: true, render: r => <span className="text-slate-400 text-xs">{r.id}</span> },
    { header: 'Fecha',          key: 'fecha',                 sortable: true, render: r => <span>{r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Cliente',        key: 'client_nombre',         sortable: true, render: r => <span className="text-xs font-medium text-slate-700">{r.client_nombre || r.client_id || '—'}</span> },
    { header: 'Placa',          key: 'placa',                 sortable: true, render: r => <span className="font-mono font-bold text-indigo-700">{r.placa || '—'}</span> },
    { header: 'Conductor',      key: 'conductor_nombre',      sortable: true, render: r => <span className="font-medium text-slate-700">{r.conductor_nombre || '—'}</span> },
    { header: 'Tipo',           key: 'tipo',                  sortable: true, render: r => (
      <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ${r.tipo === 'despacho' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {r.tipo === 'despacho' ? 'Despacho' : 'Cita'}
      </span>
    )},
    { header: 'ID Reg.',        key: 'despacho_id',           sortable: true, render: r => <span className="text-slate-500 text-xs">{r.despacho_id ?? r.cita_id ?? '—'}</span> },
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true, render: r => <span className="font-medium">{r.confeccionista_nombre || '—'}</span> },
    { header: 'Remesa',         key: 'remesa',                sortable: true, render: r => <span className="font-mono">{r.remesa || '—'}</span> },
    { header: 'Manifiesto',     key: 'manifiesto',            sortable: true, render: r => <span className="font-mono">{r.manifiesto || '—'}</span> },
    { header: 'CxC',            key: 'valor_cxc',             sortable: true, render: r => <span>{r.valor_cxc ? Number(r.valor_cxc).toLocaleString('es-CO') : '—'}</span> },
    { header: 'CxP',            key: 'valor_cxp',             sortable: true, render: r => <span>{r.valor_cxp ? Number(r.valor_cxp).toLocaleString('es-CO') : '—'}</span> },
    { header: 'Usuario',        key: 'usuario_nombre',        sortable: true, render: r => <span className="text-xs text-slate-500">{r.usuario_nombre || r.usuario_creacion || '—'}</span> },
  ];

  return (
    <>
      <AsignacionDialog
        open={showDialog}
        user={user}
        onClose={() => setShowDialog(false)}
        onSaved={() => { setShowDialog(false); loadHistorial({ placa: fPlaca || undefined, fecha: fFecha || undefined, confeccionista: fConf || undefined }); }}
      />

      {/* Cabecera */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Historial de Asignaciones</h3>
          <p className="text-xs text-slate-400 mt-0.5">Planillas asignadas a vehículos</p>
        </div>
        <button onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black transition shadow-md shadow-indigo-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva asignación
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Placa</label>
            <input value={fPlaca} onChange={e => setFPlaca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConsultar()}
              placeholder="Ej: JYO631"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
            <input type="date" value={fFecha} onChange={e => setFFecha(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Confeccionista / Proveedor</label>
            <input value={fConf} onChange={e => setFConf(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConsultar()}
              placeholder="Nombre..."
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleConsultar} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50 transition">
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/></svg>
            }
            Consultar
          </button>
          <button onClick={handleLimpiar} disabled={loading}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Limpiar
          </button>
        </div>
      </div>

      {/* Tabla historial */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : historial.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-bold text-sm">Sin asignaciones para los filtros seleccionados</p>
        </div>
      ) : (
        <DataTable<PlanillaHistorial>
          data={historial}
          columns={histCols}
          searchPlaceholder="Buscar en historial..."
          excelFileName="historial_asignaciones"
          excelSheetName="Historial"
        />
      )}
    </>
  );
}

// ── Modal guardar planilla ─────────────────────────────────────────────────────

interface PlanillaModalData { remesa: string; manifiesto: string; valor_cxc: string; valor_cxp: string; }

function GuardarPlanillaModal({ open, plate, totalItems, saving, onConfirm, onClose }: {
  open: boolean; plate: string; totalItems: number; saving: boolean;
  onConfirm: (d: PlanillaModalData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<PlanillaModalData>({ remesa: '', manifiesto: '', valor_cxc: '', valor_cxp: '' });
  const setF = (k: keyof PlanillaModalData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (open) setForm({ remesa: '', manifiesto: '', valor_cxc: '', valor_cxp: '' });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-7">
        <div className="mb-5">
          <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">Confirmar asignación</p>
          <h3 className="text-lg font-black text-slate-800">Planilla para <span className="text-indigo-600">{plate}</span></h3>
          <p className="text-xs text-slate-400 mt-1">{totalItems} registro(s) serán asignados</p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Remesa</label>
              <input value={form.remesa} onChange={setF('remesa')} placeholder="Ej: 001234"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Manifiesto</label>
              <input value={form.manifiesto} onChange={setF('manifiesto')} placeholder="Ej: M-5678"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Valor CxC</label>
              <input value={form.valor_cxc} onChange={setF('valor_cxc')} type="number" min="0" placeholder="0.00"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Valor CxP</label>
              <input value={form.valor_cxp} onChange={setF('valor_cxp')} type="number" min="0" placeholder="0.00"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={() => onConfirm(form)} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
            {saving ? 'Guardando…' : 'Guardar planilla'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flow A: selecciono placa → asigno registros ────────────────────────────

function FlowPlacaARegistros({ user, clients, assignments, despachos, citas, onBack, onSaved }: {
  user: User; clients: Client[]; assignments: FleetAssignment[];
  despachos: Despacho[]; citas: Cita[]; onBack: () => void; onSaved: () => void;
}) {
  const [step, setStep]           = useState<1|2|3|4>(1);
  const [clientId,  setClientId]  = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [tipo,      setTipo]      = useState<TipoReg>('ambos');
  const [selDesp, setSelDesp] = useState<Set<number>>(new Set());
  const [selCita, setSelCita] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const clientAssignments = assignments.filter(a => a.client_id === clientId);
  const selectedAssignment = assignments.find(a => a.vehicle_id === vehicleId);

  const shownDespachos = tipo !== 'citas'    ? despachos : [];
  const shownCitas     = tipo !== 'despachos' ? citas     : [];
  const totalSelected  = selDesp.size + selCita.size;

  const handleConfirmSave = async (formData: PlanillaModalData) => {
    if (!selectedAssignment) return;
    setSaving(true);
    try {
      const items = [
        ...Array.from(selDesp).map(id => ({ tipo: 'despacho' as const, id })),
        ...Array.from(selCita).map(id => ({ tipo: 'cita' as const, id })),
      ];
      await api.dogamaCreatePlanillaHistorial({
        vehicle_id: vehicleId,
        remesa:     formData.remesa     || null,
        manifiesto: formData.manifiesto || null,
        valor_cxc:  formData.valor_cxc  ? Number(formData.valor_cxc)  : null,
        valor_cxp:  formData.valor_cxp  ? Number(formData.valor_cxp)  : null,
        items,
        usuario_creacion: user.id,
      });
      toast.success(`Planilla guardada: ${items.length} registro(s) asignados a ${selectedAssignment.plate}`);
      setShowModal(false);
      onSaved();
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e?.message ?? 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const StepBar = () => (
    <div className="flex items-center gap-2 mb-8">
      {([1,2,3,4] as const).map((s, i) => {
        const labels = ['Cliente','Placa','Tipo','Registros'];
        const done = step > s; const active = step === s;
        return (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 ${active ? 'text-indigo-700' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all
                ${active ? 'border-indigo-600 bg-indigo-600 text-white' : done ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white'}`}>
                {done ? '✓' : s}
              </div>
              <span className="text-xs font-bold hidden sm:block">{labels[i]}</span>
            </div>
            {i < 3 && <div className={`flex-1 h-0.5 rounded-full ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ── DataTable column definitions (computed on each render so closures capture current state) ──

  const despColumns: ColumnDef<Despacho>[] = [
    {
      header: 'Sel.',
      key: '_sel',
      sortable: false,
      render: d => (
        <input type="checkbox" checked={selDesp.has(d.id)}
          onChange={e => setSelDesp(prev => { const s = new Set(prev); e.target.checked ? s.add(d.id) : s.delete(d.id); return s; })}
          className="rounded accent-indigo-500 cursor-pointer" />
      ),
    },
    { header: '#',              key: 'id',                    sortable: true,  render: d => <span className="text-slate-400 text-xs">{d.id}</span> },
    { header: 'Fecha',          key: 'fecha',                 sortable: true,  render: d => <span className="text-xs">{d.fecha ? new Date(d.fecha).toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Ord. Cargue',    key: 'orden_cargue',          sortable: true,  render: d => <span className="font-mono text-xs">{d.orden_cargue || '—'}</span> },
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true,  render: d => <span className="font-semibold text-xs">{d.confeccionista_nombre || '—'}</span> },
    { header: 'Ord. Servicio',  key: 'orden_servicio',        sortable: true,  render: d => <span className="text-xs">{d.orden_servicio || '—'}</span> },
    { header: 'Marca',          key: 'marca_nombre',          sortable: true,  render: d => <span className="text-xs">{d.marca_nombre || '—'}</span> },
    { header: 'Referencia',     key: 'referencia',            sortable: true,  render: d => <span className="text-xs">{d.referencia || '—'}</span> },
    { header: 'Lote',           key: 'lote',                  sortable: true,  render: d => <span className="text-xs">{d.lote || '—'}</span> },
    { header: 'Unidades',       key: 'unidades',              sortable: true,  render: d => <span className="text-xs">{d.unidades ?? '—'}</span> },
    { header: 'Tipo Prenda',    key: 'tipo_prenda_nombre',    sortable: true,  render: d => <span className="text-xs">{d.tipo_prenda_nombre || '—'}</span> },
    { header: 'Estado',         key: 'estado_nombre',         sortable: true,  render: d => <EstadoBadge estado_id={d.estado_id} estado_nombre={d.estado_nombre} /> },
  ];

  const citaColumns: ColumnDef<Cita>[] = [
    {
      header: 'Sel.',
      key: '_sel',
      sortable: false,
      render: c => (
        <input type="checkbox" checked={selCita.has(c.id)}
          onChange={e => setSelCita(prev => { const s = new Set(prev); e.target.checked ? s.add(c.id) : s.delete(c.id); return s; })}
          className="rounded accent-emerald-500 cursor-pointer" />
      ),
    },
    { header: '#',           key: 'id',               sortable: true, render: c => <span className="text-slate-400 text-xs">{c.id}</span> },
    { header: 'Fecha',       key: 'fecha',            sortable: true, render: c => <span className="text-xs">{c.fecha ? new Date(c.fecha).toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Turno',       key: 'turno',            sortable: true, render: c => <span className="text-xs">{c.turno || '—'}</span> },
    { header: 'H. Inicio',   key: 'hora_inicio',      sortable: true, render: c => <span className="font-mono text-xs">{c.hora_inicio || '—'}</span> },
    { header: 'H. Fin',      key: 'hora_fin',         sortable: true, render: c => <span className="font-mono text-xs">{c.hora_fin || '—'}</span> },
    { header: 'Proveedor',   key: 'proveedor_nombre', sortable: true, render: c => <span className="font-semibold text-xs">{c.proveedor_nombre || '—'}</span> },
    { header: 'Marca',       key: 'marca_nombre',     sortable: true, render: c => <span className="text-xs">{c.marca_nombre || '—'}</span> },
    { header: 'Referencia',  key: 'referencia',       sortable: true, render: c => <span className="text-xs">{c.referencia || '—'}</span> },
    { header: 'Color',       key: 'color',            sortable: true, render: c => <span className="text-xs">{c.color || '—'}</span> },
    { header: 'Lote',        key: 'lote',             sortable: true, render: c => <span className="text-xs">{c.lote || '—'}</span> },
    { header: 'Mesa',        key: 'mesa',             sortable: true, render: c => <span className="font-mono text-xs">{c.mesa ?? '—'}</span> },
    { header: 'Cantidad',    key: 'cantidad',         sortable: true, render: c => <span className="text-xs">{c.cantidad ?? '—'}</span> },
    { header: 'Nro. Doc',    key: 'numero_documento', sortable: true, render: c => <span className="font-mono text-xs">{c.numero_documento || '—'}</span> },
    { header: 'Tipo OC',     key: 'tipo_oc_nombre',   sortable: true, render: c => <span className="text-xs">{c.tipo_oc_nombre || '—'}</span> },
    { header: 'Estado',      key: 'estado_nombre',    sortable: true, render: c => <EstadoBadge estado_id={c.estado_id} estado_nombre={c.estado_nombre} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <GuardarPlanillaModal
        open={showModal}
        plate={selectedAssignment?.plate ?? ''}
        totalItems={totalSelected}
        saving={saving}
        onConfirm={handleConfirmSave}
        onClose={() => setShowModal(false)}
      />

      <StepBar />

      {/* Step 1: Cliente */}
      {step === 1 && (
        <div>
          <p className="text-sm font-bold text-slate-700 mb-4">Seleccione el cliente:</p>
          {clients.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">No hay clientes disponibles para su usuario.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {clients.map(c => (
                <button key={c.id} onClick={() => { setClientId(c.id); setVehicleId(''); setStep(2); }}
                  className={`text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md ${clientId === c.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}>
                  <p className="font-black text-sm text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.id}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Placa */}
      {step === 2 && (
        <div>
          <p className="text-sm font-bold text-slate-700 mb-1">Seleccione la placa:</p>
          <p className="text-xs text-slate-400 mb-4">Cliente: <span className="font-bold text-slate-600">{clients.find(c=>c.id===clientId)?.name}</span></p>
          {clientAssignments.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">No hay vehículos con asignación activa para este cliente.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {clientAssignments.map(a => (
                <button key={a.vehicle_id} onClick={() => { setVehicleId(a.vehicle_id); setStep(3); }}
                  className={`text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md ${vehicleId === a.vehicle_id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}>
                  <p className="font-black text-lg text-slate-800 tracking-widest">{a.plate}</p>
                  <p className="text-xs text-indigo-600 font-semibold mt-0.5 truncate">{a.driver_name}</p>
                  {a.vehicle_brand && <p className="text-xs text-slate-400">{a.vehicle_brand}</p>}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setStep(1)} className="mt-5 text-xs text-slate-400 hover:text-slate-600 underline">← Cambiar cliente</button>
        </div>
      )}

      {/* Step 3: Tipo de registros */}
      {step === 3 && (
        <div>
          <p className="text-sm font-bold text-slate-700 mb-1">¿Qué va a asignar a la placa <span className="text-indigo-600">{selectedAssignment?.plate}</span>?</p>
          <p className="text-xs text-slate-400 mb-5">Seleccione el tipo de registros pendientes</p>
          <div className="grid grid-cols-3 gap-4">
            {([
              { k: 'ambos',     label: 'Ambos',     desc: 'Citas y Despachos', color: 'indigo' },
              { k: 'citas',     label: 'Citas',     desc: 'Solo recogidas',    color: 'emerald' },
              { k: 'despachos', label: 'Despachos', desc: 'Solo despachos',    color: 'amber' },
            ] as const).map(opt => (
              <button key={opt.k} onClick={() => { setTipo(opt.k); setSelDesp(new Set()); setSelCita(new Set()); setStep(4); }}
                className={`p-5 rounded-2xl border-2 transition-all hover:shadow-md text-left
                  ${tipo === opt.k ? `border-${opt.color}-500 bg-${opt.color}-50` : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                <p className={`font-black text-sm text-${opt.color}-700`}>{opt.label}</p>
                <p className="text-xs text-slate-400 mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="mt-5 text-xs text-slate-400 hover:text-slate-600 underline">← Cambiar placa</button>
        </div>
      )}

      {/* Step 4: Selección de registros con DataTable */}
      {step === 4 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-slate-700">
                Placa: <span className="text-indigo-600">{selectedAssignment?.plate}</span>
                <span className="mx-2 text-slate-300">|</span>
                {tipo === 'ambos' ? 'Citas + Despachos' : tipo === 'citas' ? 'Citas' : 'Despachos'} pendientes
              </p>
              {totalSelected > 0 && (
                <p className="text-xs text-emerald-600 font-bold mt-0.5">{totalSelected} registro(s) seleccionado(s)</p>
              )}
            </div>
            <button onClick={() => setStep(3)} className="text-xs text-slate-400 hover:text-slate-600 underline">← Cambiar tipo</button>
          </div>

          {/* Despachos */}
          {shownDespachos.length > 0 && (
            <div className="mb-6">
              {tipo === 'ambos' && <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-2">Despachos ({shownDespachos.length})</p>}
              <div className="flex justify-end mb-2">
                <button onClick={() => setSelDesp(
                  shownDespachos.every(d => selDesp.has(d.id))
                    ? new Set()
                    : new Set(shownDespachos.map(d => d.id))
                )} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">
                  {shownDespachos.every(d => selDesp.has(d.id)) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              </div>
              <DataTable<Despacho>
                data={shownDespachos}
                columns={despColumns}
                searchPlaceholder="Buscar despacho..."
                excelFileName="despachos_pendientes"
                excelSheetName="Despachos"
              />
            </div>
          )}

          {/* Citas */}
          {shownCitas.length > 0 && (
            <div className="mb-6">
              {tipo === 'ambos' && <p className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-2">Citas ({shownCitas.length})</p>}
              <div className="flex justify-end mb-2">
                <button onClick={() => setSelCita(
                  shownCitas.every(c => selCita.has(c.id))
                    ? new Set()
                    : new Set(shownCitas.map(c => c.id))
                )} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 underline">
                  {shownCitas.every(c => selCita.has(c.id)) ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
              </div>
              <DataTable<Cita>
                data={shownCitas}
                columns={citaColumns}
                searchPlaceholder="Buscar cita..."
                excelFileName="citas_pendientes"
                excelSheetName="Citas"
              />
            </div>
          )}

          {shownDespachos.length === 0 && shownCitas.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-bold">No hay registros pendientes</p>
            </div>
          )}

          {/* CTA */}
          <div className="sticky bottom-0 bg-white border-t border-slate-100 pt-4 mt-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              {totalSelected > 0
                ? <><span className="font-black text-slate-800">{totalSelected}</span> registro(s) se asignarán a <span className="font-black text-indigo-700">{selectedAssignment?.plate}</span></>
                : 'Seleccione al menos un registro para continuar'}
            </p>
            <button
              disabled={totalSelected === 0}
              onClick={() => setShowModal(true)}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 flex items-center gap-2 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Guardar asignación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Searchable plate selector ──────────────────────────────────────────────────

function SearchablePlacaSelect({ value, assignments, onChange }: {
  value: string; assignments: FleetAssignment[]; onChange: (v: string) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = assignments.find(a => a.vehicle_id === value);
  const filtered = assignments.filter(a =>
    a.plate.toLowerCase().includes(search.toLowerCase()) ||
    a.driver_name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className={`text-xs border rounded-xl px-2 py-1 bg-white w-28 text-left flex items-center justify-between gap-1 focus:outline-none focus:ring-1 focus:ring-indigo-300 transition
          ${value ? 'border-indigo-400 text-indigo-700 font-bold' : 'border-slate-200 text-slate-400'}`}
      >
        <span className="truncate font-mono">{selected ? selected.plate : '— Placa —'}</span>
        {selected && <span className="truncate text-indigo-500 text-[10px] leading-none">{selected.driver_name.split(' ')[0]}</span>}
        <svg className="w-3 h-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl w-48 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar placa..."
              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 transition">
              — Sin placa —
            </button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs text-slate-400">Sin resultados</p>
              : filtered.map(a => (
                <button key={a.vehicle_id} type="button"
                  onClick={() => { onChange(a.vehicle_id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition
                    ${value === a.vehicle_id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span className="font-mono font-bold">{a.plate}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{a.driver_name}</span>
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flow B: veo registros → asigno placa a cada uno ───────────────────────

function FlowRegistrosAPlaca({ user, assignments, despachos, citas, onBack, onSaved }: {
  user: User; assignments: FleetAssignment[];
  despachos: Despacho[]; citas: Cita[]; onBack: () => void; onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoReg>('ambos');
  const [placasDesp, setPlacasDesp] = useState<Record<number, string>>({});
  const [placasCita, setPlacasCita] = useState<Record<number, string>>({});
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const shownDespachos = tipo !== 'citas'    ? despachos : [];
  const shownCitas     = tipo !== 'despachos' ? citas     : [];
  const totalAsignados = Object.values(placasDesp).filter(Boolean).length + Object.values(placasCita).filter(Boolean).length;

  const handleConfirmSave = async (formData: PlanillaModalData) => {
    setSaving(true);
    try {
      const allItems = [
        ...Object.entries(placasDesp)
          .filter(([, vid]) => vid)
          .map(([id, vid]) => ({ tipo: 'despacho' as const, item_id: Number(id), vehicle_id: vid })),
        ...Object.entries(placasCita)
          .filter(([, vid]) => vid)
          .map(([id, vid]) => ({ tipo: 'cita' as const, item_id: Number(id), vehicle_id: vid })),
      ];

      // Group by vehicle and create one request per plate
      const byVehicle = new Map<string, typeof allItems>();
      allItems.forEach(item => {
        if (!byVehicle.has(item.vehicle_id)) byVehicle.set(item.vehicle_id, []);
        byVehicle.get(item.vehicle_id)!.push(item);
      });

      await Promise.all(
        [...byVehicle.entries()].map(([vid, grp]) => {
          return api.dogamaCreatePlanillaHistorial({
            vehicle_id: vid,
            remesa:     formData.remesa     || null,
            manifiesto: formData.manifiesto || null,
            valor_cxc:  formData.valor_cxc  ? Number(formData.valor_cxc)  : null,
            valor_cxp:  formData.valor_cxp  ? Number(formData.valor_cxp)  : null,
            items: grp.map(i => ({ tipo: i.tipo, id: i.item_id })),
            usuario_creacion: user.id,
          });
        })
      );

      toast.success(`Asignaciones guardadas: ${allItems.length} registro(s) en ${byVehicle.size} placa(s)`);
      setShowModal(false);
      onSaved();
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e?.message ?? 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // DataTable columns — render functions close over state/setters
  const despColsB: ColumnDef<Despacho>[] = [
    { header: '#',              key: 'id',                    sortable: true, render: d => <span className="text-slate-400 text-xs">{d.id}</span> },
    { header: 'Fecha',          key: 'fecha',                 sortable: true, render: d => <span className="text-xs">{d.fecha ? new Date(d.fecha).toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Ord. Cargue',    key: 'orden_cargue',          sortable: true, render: d => <span className="font-mono text-xs">{d.orden_cargue || '—'}</span> },
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true, render: d => <span className="font-semibold text-xs">{d.confeccionista_nombre || '—'}</span> },
    { header: 'Ord. Servicio',  key: 'orden_servicio',        sortable: true, render: d => <span className="text-xs">{d.orden_servicio || '—'}</span> },
    { header: 'Marca',          key: 'marca_nombre',          sortable: true, render: d => <span className="text-xs">{d.marca_nombre || '—'}</span> },
    { header: 'Referencia',     key: 'referencia',            sortable: true, render: d => <span className="text-xs">{d.referencia || '—'}</span> },
    { header: 'Lote',           key: 'lote',                  sortable: true, render: d => <span className="text-xs">{d.lote || '—'}</span> },
    { header: 'Unidades',       key: 'unidades',              sortable: true, render: d => <span className="text-xs">{d.unidades ?? '—'}</span> },
    { header: 'Tipo Prenda',    key: 'tipo_prenda_nombre',    sortable: true, render: d => <span className="text-xs">{d.tipo_prenda_nombre || '—'}</span> },
    { header: 'Estado',         key: 'estado_nombre',         sortable: true, render: d => <EstadoBadge estado_id={d.estado_id} estado_nombre={d.estado_nombre} /> },
    {
      header: 'Placa',
      key: '_placa',
      sortable: false,
      render: d => <SearchablePlacaSelect assignments={assignments} value={placasDesp[d.id] || ''} onChange={v => setPlacasDesp(p => ({ ...p, [d.id]: v }))} />,
    },
  ];

  const citaColsB: ColumnDef<Cita>[] = [
    { header: '#',           key: 'id',               sortable: true, render: c => <span className="text-slate-400 text-xs">{c.id}</span> },
    { header: 'Fecha',       key: 'fecha',            sortable: true, render: c => <span className="text-xs">{c.fecha ? new Date(c.fecha).toLocaleDateString('es-CO') : '—'}</span> },
    { header: 'Turno',       key: 'turno',            sortable: true, render: c => <span className="text-xs">{c.turno || '—'}</span> },
    { header: 'H. Inicio',   key: 'hora_inicio',      sortable: true, render: c => <span className="font-mono text-xs">{c.hora_inicio || '—'}</span> },
    { header: 'H. Fin',      key: 'hora_fin',         sortable: true, render: c => <span className="font-mono text-xs">{c.hora_fin || '—'}</span> },
    { header: 'Proveedor',   key: 'proveedor_nombre', sortable: true, render: c => <span className="font-semibold text-xs">{c.proveedor_nombre || '—'}</span> },
    { header: 'Marca',       key: 'marca_nombre',     sortable: true, render: c => <span className="text-xs">{c.marca_nombre || '—'}</span> },
    { header: 'Referencia',  key: 'referencia',       sortable: true, render: c => <span className="text-xs">{c.referencia || '—'}</span> },
    { header: 'Color',       key: 'color',            sortable: true, render: c => <span className="text-xs">{c.color || '—'}</span> },
    { header: 'Lote',        key: 'lote',             sortable: true, render: c => <span className="text-xs">{c.lote || '—'}</span> },
    { header: 'Mesa',        key: 'mesa',             sortable: true, render: c => <span className="font-mono text-xs">{c.mesa ?? '—'}</span> },
    { header: 'Cantidad',    key: 'cantidad',         sortable: true, render: c => <span className="text-xs">{c.cantidad ?? '—'}</span> },
    { header: 'Nro. Doc',    key: 'numero_documento', sortable: true, render: c => <span className="font-mono text-xs">{c.numero_documento || '—'}</span> },
    { header: 'Tipo OC',     key: 'tipo_oc_nombre',   sortable: true, render: c => <span className="text-xs">{c.tipo_oc_nombre || '—'}</span> },
    { header: 'Estado',      key: 'estado_nombre',    sortable: true, render: c => <EstadoBadge estado_id={c.estado_id} estado_nombre={c.estado_nombre} /> },
    {
      header: 'Placa',
      key: '_placa',
      sortable: false,
      render: c => <SearchablePlacaSelect assignments={assignments} value={placasCita[c.id] || ''} onChange={v => setPlacasCita(p => ({ ...p, [c.id]: v }))} />,
    },
  ];

  // Fake vehicle for modal (mixed plates) — use empty plate string
  const modalPlate = totalAsignados > 0
    ? [...new Set([
        ...Object.entries(placasDesp).filter(([,v])=>v).map(([,vid])=>assignments.find(a=>a.vehicle_id===vid)?.plate??''),
        ...Object.entries(placasCita).filter(([,v])=>v).map(([,vid])=>assignments.find(a=>a.vehicle_id===vid)?.plate??''),
      ])].filter(Boolean).join(', ')
    : '';

  return (
    <div className="max-w-6xl mx-auto">
      <GuardarPlanillaModal
        open={showModal}
        plate={modalPlate}
        totalItems={totalAsignados}
        saving={saving}
        onConfirm={handleConfirmSave}
        onClose={() => setShowModal(false)}
      />

      {/* Filtro tipo */}
      <div className="flex gap-2 mb-6">
        {([
          { k: 'ambos', label: 'Todos' }, { k: 'despachos', label: 'Despachos' }, { k: 'citas', label: 'Citas' },
        ] as const).map(opt => (
          <button key={opt.k} onClick={() => setTipo(opt.k)}
            className={`px-4 py-2 rounded-2xl text-sm font-bold transition ${tipo === opt.k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {opt.label}
          </button>
        ))}
        <div className="flex-1" />
        {totalAsignados > 0 && (
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-2xl">
            {totalAsignados} asignado(s)
          </span>
        )}
      </div>

      {shownDespachos.length > 0 && (
        <div className="mb-6">
          {tipo === 'ambos' && <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-2">Despachos ({shownDespachos.length})</p>}
          <DataTable<Despacho>
            data={shownDespachos}
            columns={despColsB}
            searchPlaceholder="Buscar despacho..."
            excelFileName="despachos_pendientes"
            excelSheetName="Despachos"
          />
        </div>
      )}

      {shownCitas.length > 0 && (
        <div className="mb-6">
          {tipo === 'ambos' && <p className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-2">Citas ({shownCitas.length})</p>}
          <DataTable<Cita>
            data={shownCitas}
            columns={citaColsB}
            searchPlaceholder="Buscar cita..."
            excelFileName="citas_pendientes"
            excelSheetName="Citas"
          />
        </div>
      )}

      {shownDespachos.length === 0 && shownCitas.length === 0 && (
        <div className="py-20 text-center text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-bold">No hay registros pendientes</p>
        </div>
      )}

      {/* CTA */}
      <div className="sticky bottom-0 bg-white border-t border-slate-100 pt-4 mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {totalAsignados > 0
            ? <><span className="font-black text-slate-800">{totalAsignados}</span> registro(s) con placa asignada listos para guardar</>
            : 'Asigne al menos una placa para continuar'}
        </p>
        <button
          disabled={totalAsignados === 0}
          onClick={() => setShowModal(true)}
          className="px-6 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 flex items-center gap-2 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Guardar asignaciones
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CitasDespachosCarga({ user }: Props) {
  const [tab, setTab] = useState('asignacion');
  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Citas, Despacho y Carga</h1>
        <p className="text-slate-400 text-sm mt-1">Operación Jhon Uribe — Dogama</p>
      </div>
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {[
          { key: 'asignacion', label: 'Asignación Placa × Planilla' },
          { key: 'despachos',  label: 'Despachos Dogama' },
          { key: 'citas',      label: 'Citas / Recogidas' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'asignacion' && <AsignacionPlacaTab user={user} />}
      {tab === 'despachos'  && <DespachoTab user={user} />}
      {tab === 'citas'      && <CitasTab user={user} />}
    </div>
  );
}
