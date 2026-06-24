import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Search, Download, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { hasPermission } from '../../utils/permissions';
import { DataTable, ColumnDef } from '../shared/DataTable';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

interface Props { user: User; }

// ── Catalog types ─────────────────────────────────────────────────────────────

interface CatalogItem { id: number; descripcion: string; estado_id: string | null; accion_importacion?: string | null; }
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
  const isBlocked = (r: CitaRow) => r.status !== 'nuevo';
  const allChecked = filtered.filter(r => !isBlocked(r)).every(r => selected[r.index]);

  // Devuelve la accion_importacion del tipo OC (busca por id o por texto exacto)
  const getTipoOcAccion = (r: CitaRow): 'carga' | 'valida' => {
    if (!r.tipo_oc || r.tipo_oc_match.status === 'empty') return 'carga';
    // Buscar por id si hay match, o por descripcion si es exact
    const byId  = r.tipo_oc_match.id != null ? tiposOc.find(t => t.id === r.tipo_oc_match.id) : null;
    const byTxt = tiposOc.find(t => normM(t.descripcion) === normM(r.tipo_oc));
    const found = byId ?? byTxt;
    if (!found) return 'valida'; // no encontrado → requiere revisión
    return (found.accion_importacion as 'carga' | 'valida') || 'valida';
  };

  // Rojo: bloqueos reales (marca o proveedor sin resolver)
  const isRowErrorC = (r: CitaRow) =>
    (r.prov_match.status !== 'exact' && !provOverrides.has(r.index)) ||
    (r.marca_match.status !== 'exact' && r.marca_match.status !== 'empty');

  // Amarillo: tipo OC con accion='valida' (siempre requiere revisión visual del usuario)
  const isRowWarningC = (r: CitaRow) =>
    !isRowErrorC(r) && !!r.tipo_oc && r.tipo_oc_match.status !== 'empty' && getTipoOcAccion(r) === 'valida';

  // Alias para compatibilidad con el sort y demás lógica
  const isRowUnresolvedC = (r: CitaRow) => isRowErrorC(r) || isRowWarningC(r);

  // Prioridad: rojo(0) → amarillo(1) → limpio(2), luego sort elegido
  const rowPriority = (r: CitaRow) => isRowErrorC(r) ? 0 : isRowWarningC(r) ? 1 : 2;

  const cSorted = [...filtered].sort((a, b) => {
    const pa = rowPriority(a); const pb = rowPriority(b);
    if (pa !== pb) return pa - pb;
    if (!sortCol) return 0;
    const k = CCOL[sortCol] as keyof CitaRow;
    if (!k) return 0;
    const av = String(a[k] ?? ''); const bv = String(b[k] ?? '');
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  const paginated = pageSize === 'all' ? cSorted : cSorted.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  const counts = {
    nuevo: rows.filter(r => r.status === 'nuevo').length,
    dup_bd: rows.filter(r => r.status === 'duplicado_bd').length,
    dup_arch: rows.filter(r => r.status === 'duplicado_archivo').length,
    selected: selected.filter(Boolean).length,
    errors:   rows.filter(r => r.status === 'nuevo' && isRowErrorC(r)).length,
    warnings: rows.filter(r => r.status === 'nuevo' && isRowWarningC(r)).length,
  };

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
            {counts.errors > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-red-200 text-red-800">✕ {counts.errors} sin resolver</span>}
            {counts.warnings > 0 && <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold bg-amber-300 text-amber-900">⚠ {counts.warnings} por validar (Tipo OC)</span>}
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
                  <tr key={r.index} className={`transition-colors ${!selected[r.index] ? 'opacity-40' : ''} ${
                    isRowErrorC(r)   ? 'bg-red-100 border-l-2 border-red-400 hover:bg-red-50' :
                    isRowWarningC(r) ? 'bg-amber-50 border-l-2 border-amber-400 hover:bg-amber-100/60' :
                    'hover:bg-slate-50/70'
                  }`}>
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
              const sinHoraReal = sel.filter(r => !(horaOverrides.get(r.index) ?? r.hora_fin));
              if (sinHoraReal.length) msgs.push(`Hora Real de Carga faltante en ${sinHoraReal.length} fila(s) — complete el campo en la columna H.Real Carga`);
              if (unresMarcas.length) msgs.push(`Marcas sin definir (col. MARCA): ${unresMarcas.join(', ')}`);
              if (unresProvs.length)  msgs.push(`Confeccionista sin asignar en ${unresProvs.length} fila(s) — use el selector de la columna Proveedor`);
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
    if (!form.hora_fin) { toast.error('La Hora Real de Carga es obligatoria'); return; }
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
          <Field label="H. Real Carga" k="hora_fin" type="time" required />
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
type TipoReg  = 'despachos' | 'citas' | 'ambos' | 'material_empaque';

interface PlanillaHistorial {
  id: number;
  enc_id: number;
  // Campos del encabezado (nivel ruta)
  fecha: string;
  vehicle_id: string | null; placa: string | null; vehicle_brand: string | null;
  conductor_id: string | null; conductor_nombre: string | null;
  client_id: string | null; client_nombre: string | null;
  remesa: string | null; manifiesto: string | null;
  valor_cxc: string | null; valor_cxp: string | null;
  intermediacion: string | null;
  enc_estado_id: string | null;
  // Campos del ítem (nivel confeccionista)
  tipo: 'despacho' | 'cita' | 'material_empaque';
  despacho_id: number | null; cita_id: number | null;
  usuario_creacion: string | null; fecha_creacion: string;
  usuario_nombre: string | null; confeccionista_nombre: string | null;
  cajas: number | null; tulas: number | null; canastas: number | null; costales: number | null;
  estado_id: string;
  motivo_cancelacion: string | null;
  tipo_cancelacion: 'reasignar' | 'definitivo' | null;
  confeccionista_direccion: string | null;
  confeccionista_ciudad: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  turno: string | null;
  referencia: string | null;
  // Campos extra de despachos / citas
  marca: string | null;
  lote: string | null;
  unidades: number | null;
  orden_cargue: string | null;
  orden_servicio: string | null;
  color: string | null;
  mesa: number | null;
  numero_documento: string | null;
  tipo_oc: string | null;
  tipo_prenda: string | null;
}

interface RouteGroup {
  key: string;
  enc_id: number;
  vehicle_id: string | null;
  conductor_id: string | null;
  client_id: string | null;
  fecha: string;
  placa: string | null;
  vehicle_brand: string | null;
  conductor_nombre: string | null;
  client_nombre: string | null;
  tipo: PlanillaHistorial['tipo'];
  remesa: string | null;
  manifiesto: string | null;
  valor_cxc: string | null;
  valor_cxp: string | null;
  intermediacion: string | null;
  records: PlanillaHistorial[];
}

function groupByRoute(records: PlanillaHistorial[]): RouteGroup[] {
  const map = new Map<number, RouteGroup>();
  for (const r of records) {
    if (!map.has(r.enc_id)) {
      map.set(r.enc_id, {
        key: String(r.enc_id),
        enc_id: r.enc_id,
        vehicle_id: r.vehicle_id, conductor_id: r.conductor_id,
        client_id: r.client_id, fecha: r.fecha,
        placa: r.placa, vehicle_brand: r.vehicle_brand,
        conductor_nombre: r.conductor_nombre, client_nombre: r.client_nombre,
        tipo: r.tipo,
        remesa: r.remesa, manifiesto: r.manifiesto,
        valor_cxc: r.valor_cxc, valor_cxp: r.valor_cxp,
        intermediacion: r.intermediacion,
        records: [],
      });
    }
    map.get(r.enc_id)!.records.push(r);
  }
  return Array.from(map.values());
}

interface FleteIntermediacion {
  id: number;
  flete_minimo: string | null;
  valor_intermediacion_minimo: string | null;
  flete_maximo: string | null;
  intermediacion_final: string | null;
  estado_id: string;
  estado_nombre: string | null;
}

// ── Formateador moneda COP ─────────────────────────────────────────────────────

const formatCOP = (v: string | number | null): string => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
};

// ── Diálogo de nueva asignación ────────────────────────────────────────────────

function AsignacionDialog({ open, user, onClose, onSaved }: {
  open: boolean; user: User; onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode]               = useState<AsignMode | null>(null);
  const [clients,         setClients]         = useState<Client[]>([]);
  const [vehicles,        setVehicles]        = useState<Vehicle[]>([]);
  const [assignments,     setAssignments]     = useState<FleetAssignment[]>([]);
  const [despachos,       setDespachos]       = useState<Despacho[]>([]);
  const [citas,           setCitas]           = useState<Cita[]>([]);
  const [confeccionistas, setConfeccionistas] = useState<ConfItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setMode(null); return; }
    const load = async () => {
      setLoading(true);
      try {
        const [asgns, desps, cts, confs] = await Promise.all([
          api.dogamaGetFleetAssignments(),
          api.dogamaGetDespachos(true),
          api.dogamaGetCitas(true),
          api.dogamaGetConfeccionistas(),
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
        setConfeccionistas(Array.isArray(confs) ? confs : []);
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
            confeccionistas={confeccionistas}
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

// ── Tipo badge helper ─────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: PlanillaHistorial['tipo'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    despacho:        { label: 'Despacho',        cls: 'bg-amber-100 text-amber-700' },
    cita:            { label: 'Cita',             cls: 'bg-emerald-100 text-emerald-700' },
    material_empaque:{ label: 'Mat. Empaque',     cls: 'bg-purple-100 text-purple-700' },
  };
  const m = map[tipo] || { label: tipo, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ${m.cls}`}>{m.label}</span>;
}

// ── EditPlanillaModal ─────────────────────────────────────────────────────────

function EditPlanillaModal({ record, onClose, onSaved }: {
  record: PlanillaHistorial; onClose: () => void; onSaved: (updated: PlanillaHistorial) => void;
}) {
  const [form, setForm] = useState({
    remesa:     record.remesa     ?? '',
    manifiesto: record.manifiesto ?? '',
    valor_cxc:  record.valor_cxc  ?? '',
    valor_cxp:  record.valor_cxp  ?? '',
  });
  const [fletes,        setFletes]        = useState<FleteIntermediacion[]>([]);
  const [intermediacion, setIntermediacion] = useState<number | null>(
    record.intermediacion != null ? Number(record.intermediacion) : null
  );
  const [saving, setSaving] = useState(false);

  const activeFlete = fletes.find(f => f.estado_id === 'EST-01');

  const intermediacionOpts = useMemo<number[]>(() => {
    if (!activeFlete) return [];
    const minVal = Number(activeFlete.valor_intermediacion_minimo ?? 0);
    const maxVal = Number(activeFlete.intermediacion_final ?? 0);
    if (isNaN(minVal) || isNaN(maxVal)) return [];
    const opts: number[] = [];
    for (let i = Math.ceil(minVal); i <= Math.floor(maxVal); i++) opts.push(i);
    if (opts.length === 0 && !isNaN(minVal)) opts.push(Math.round(minVal));
    return opts;
  }, [activeFlete]);

  // Cargar fletes al montar
  useEffect(() => {
    api.dogamaGetFletes().then((rows: FleteIntermediacion[]) => {
      setFletes(rows);
      const af = rows.find((f: FleteIntermediacion) => f.estado_id === 'EST-01');
      // Pre-llenar CxC con flete mínimo solo si no tiene valor previo
      if (af?.flete_minimo && !form.valor_cxc) {
        setForm(p => ({ ...p, valor_cxc: String(Number(af.flete_minimo)) }));
      }
      // Pre-seleccionar intermediación mínima solo si no tiene valor previo
      if (intermediacion == null && af?.valor_intermediacion_minimo != null) {
        setIntermediacion(Math.ceil(Number(af.valor_intermediacion_minimo)));
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-calcular CxP = CxC − (CxC × int%)
  useEffect(() => {
    if (intermediacion == null || !form.valor_cxc) return;
    const cxc = Number(form.valor_cxc);
    if (isNaN(cxc)) return;
    const cxp = Math.round(cxc - (cxc * intermediacion / 100));
    setForm(p => ({ ...p, valor_cxp: String(cxp) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.valor_cxc, intermediacion]);

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const cxpAutoCalc = intermediacion != null && !!form.valor_cxc;

  const cxcNum    = form.valor_cxc ? Number(form.valor_cxc) : null;
  const cxcMin    = activeFlete?.flete_minimo  ? Number(activeFlete.flete_minimo)  : null;
  const cxcMax    = activeFlete?.flete_maximo  ? Number(activeFlete.flete_maximo)  : null;
  const cxcBelowMin = cxcNum != null && cxcMin != null && cxcNum < cxcMin;
  const cxcAboveMax = cxcNum != null && cxcMax != null && cxcNum > cxcMax;
  const cxcError    = cxcBelowMin || cxcAboveMax;

  const handleSave = async () => {
    if (cxcError) {
      toast.error(cxcBelowMin
        ? `El valor CxC no puede ser menor al flete mínimo (${formatCOP(cxcMin)})`
        : `El valor CxC no puede superar el flete máximo (${formatCOP(cxcMax)})`
      );
      return;
    }
    setSaving(true);
    try {
      const updatedEnc = await api.dogamaPatchEncPlanilla(record.enc_id, {
        remesa:         form.remesa     || null,
        manifiesto:     form.manifiesto || null,
        valor_cxc:      form.valor_cxc  ? Number(form.valor_cxc)  : null,
        valor_cxp:      form.valor_cxp  ? Number(form.valor_cxp)  : null,
        intermediacion: intermediacion  ?? null,
      });
      toast.success('Planilla actualizada');
      onSaved({ ...record, ...updatedEnc });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-4 duration-150">
        <div className="mb-4">
          <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">Editar Encabezado de Ruta</p>
          <p className="text-base font-black text-slate-800">Enc #{record.enc_id} — <span className="font-mono text-indigo-600">{record.placa}</span></p>
          <p className="text-xs text-slate-400">Estos valores aplican a toda la ruta</p>
        </div>
        <div className="space-y-3">
          {/* Remesa + Manifiesto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Remesa</label>
              <input value={form.remesa} onChange={setF('remesa')} placeholder="Ej: 001234"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Manifiesto</label>
              <input value={form.manifiesto} onChange={setF('manifiesto')} placeholder="Ej: M-5678"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>
          {/* CxC */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Valor CxC
              {activeFlete?.flete_minimo && (
                <span className={`ml-2 text-[10px] font-normal ${cxcError ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                  Flete mín: {formatCOP(activeFlete.flete_minimo)} · máx: {formatCOP(activeFlete.flete_maximo)}
                </span>
              )}
            </label>
            <input type="number" value={form.valor_cxc} onChange={setF('valor_cxc')} min="0" placeholder="0"
              className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 transition ${
                cxcError
                  ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                  : 'border-slate-200 focus:ring-indigo-300'
              }`} />
            {cxcBelowMin && (
              <p className="text-[10px] text-red-500 font-semibold mt-1">
                ✕ Valor menor al flete mínimo ({formatCOP(cxcMin)})
              </p>
            )}
            {cxcAboveMax && (
              <p className="text-[10px] text-red-500 font-semibold mt-1">
                ✕ Valor mayor al flete máximo ({formatCOP(cxcMax)})
              </p>
            )}
          </div>
          {/* Int. (select) */}
          {intermediacionOpts.length > 0 ? (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Int. (%)</label>
              <select
                value={intermediacion ?? intermediacionOpts[0]}
                onChange={e => setIntermediacion(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {intermediacionOpts.map(p => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Int. (%)</label>
              <input type="number" value={intermediacion ?? ''} onChange={e => setIntermediacion(e.target.value ? Number(e.target.value) : null)} placeholder="0"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          )}
          {/* CxP — auto-calculado */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Valor CxP
              {cxpAutoCalc && (
                <span className="ml-2 text-[10px] font-normal text-emerald-600">calculado automáticamente</span>
              )}
            </label>
            <input
              type="number" value={form.valor_cxp} min="0" placeholder="0"
              readOnly={cxpAutoCalc}
              onChange={cxpAutoCalc ? undefined : setF('valor_cxp')}
              className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                cxpAutoCalc ? 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-200'
              }`} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || cxcError}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CancelModal ───────────────────────────────────────────────────────────────

function CancelModal({ title, onClose, onConfirm }: {
  title: string; onClose: () => void;
  onConfirm: (motivo: string, tipoCancelacion: 'reasignar' | 'definitivo') => Promise<void>;
}) {
  const [motivo,  setMotivo]  = useState('');
  const [tipo,    setTipo]    = useState<'reasignar' | 'definitivo'>('reasignar');
  const [saving,  setSaving]  = useState(false);

  const handleConfirm = async () => {
    if (!motivo.trim()) { toast.warning('Ingrese el motivo de cancelación'); return; }
    setSaving(true);
    try { await onConfirm(motivo.trim(), tipo); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm">Cancelar Asignación</h3>
            <p className="text-xs text-slate-400">{title}</p>
          </div>
        </div>

        {/* Tipo de cancelación */}
        <p className="text-xs font-bold text-slate-600 mb-2">Tipo de cancelación *</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setTipo('reasignar')}
            className={`flex flex-col items-start gap-1 px-4 py-3 rounded-2xl border-2 text-left transition ${tipo === 'reasignar' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
            <span className="text-xs font-black text-amber-700">Por el día</span>
            <span className="text-[10px] text-slate-500 leading-tight">La cita/despacho vuelve a pendiente para reasignarse otro día</span>
          </button>
          <button onClick={() => setTipo('definitivo')}
            className={`flex flex-col items-start gap-1 px-4 py-3 rounded-2xl border-2 text-left transition ${tipo === 'definitivo' ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
            <span className="text-xs font-black text-red-700">Definitivo</span>
            <span className="text-[10px] text-slate-500 leading-tight">La cita/despacho queda cancelada permanentemente</span>
          </button>
        </div>

        <label className="block text-xs font-bold text-slate-600 mb-1">Motivo de cancelación *</label>
        <textarea
          value={motivo} onChange={e => setMotivo(e.target.value)}
          rows={3} placeholder="Ej: Cliente canceló el pedido..."
          className="w-full text-sm border border-slate-200 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Volver
          </button>
          <button onClick={handleConfirm} disabled={saving || !motivo.trim()}
            className="flex-1 py-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50 transition">
            {saving ? 'Cancelando…' : 'Confirmar cancelación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tipos para colores de ruta ────────────────────────────────────────────────

interface ColorBand { id: string; label: string; desde: string; hasta: string; color: string; }
const COLOR_PRESETS = ['#86efac','#fde68a','#93c5fd','#fdba74','#f9a8d4','#e2e8f0','#fca5a5'];
const BANDS_KEY = 'dogama_color_bands';
const ROW_COLORS_KEY = 'dogama_row_colors';

function loadBands(): ColorBand[] {
  try { return JSON.parse(localStorage.getItem(BANDS_KEY) || '[]'); } catch { return []; }
}
function saveBands(b: ColorBand[]) { localStorage.setItem(BANDS_KEY, JSON.stringify(b)); }
function loadRowColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ROW_COLORS_KEY) || '{}'); } catch { return {}; }
}
function saveRowColors(rc: Record<string, string>) { localStorage.setItem(ROW_COLORS_KEY, JSON.stringify(rc)); }

function timeToMin(t: string | null): number {
  if (!t) return -1;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function getRowBgColor(record: PlanillaHistorial, bands: ColorBand[], rowColors: Record<string, string>): string {
  if (rowColors[String(record.id)]) return rowColors[String(record.id)];
  // Prioriza hora real (hora_fin) sobre la programada (hora_inicio)
  const hora = record.hora_fin || record.hora_inicio;
  if (hora) {
    const min = timeToMin(hora);
    for (const b of bands) {
      if (min >= timeToMin(b.desde) && min < timeToMin(b.hasta)) return b.color;
    }
  }
  return '';
}

// ── AddToRouteModal ───────────────────────────────────────────────────────────

function AddToRouteModal({ group, user, onClose, onAdded }: {
  group: RouteGroup; user: User; onClose: () => void; onAdded: (r: PlanillaHistorial) => void;
}) {
  type Mode = 'conf' | 'despacho' | 'cita';
  const [mode, setMode]           = useState<Mode>('conf');
  const [confList,   setConfList]   = useState<ConfItem[]>([]);
  const [despachos,  setDespachos]  = useState<Despacho[]>([]);
  const [citas,      setCitas]      = useState<Cita[]>([]);
  const [confId,     setConfId]     = useState('');
  const [despId,     setDespId]     = useState('');
  const [citaId,     setCitaId]     = useState('');
  const [remesa,     setRemesa]     = useState('');
  const [manif,      setManif]      = useState('');
  const [cxc,        setCxc]        = useState('');
  const [cxp,        setCxp]        = useState('');
  const [query,      setQuery]      = useState('');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    api.dogamaGetConfeccionistas?.().then((d: any) => setConfList(Array.isArray(d) ? d : [])).catch(() => {});
    api.dogamaGetDespachos(true).then((d: any) => setDespachos(Array.isArray(d) ? d : [])).catch(() => {});
    api.dogamaGetCitas(true).then((d: any) => setCitas(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const filteredConf = confList.filter(c => !query || c.descripcion_conf?.toLowerCase().includes(query.toLowerCase()));
  const filteredDesp = despachos.filter(d => !query || String(d.confeccionista_nombre || d.orden_servicio || '').toLowerCase().includes(query.toLowerCase()));
  const filteredCita = citas.filter(c => !query || String(c.proveedor_nombre || c.referencia || '').toLowerCase().includes(query.toLowerCase()));

  const handleAdd = async () => {
    setSaving(true);
    try {
      let r: any;
      if (mode === 'conf') {
        if (!confId) { toast.warning('Seleccione un confeccionista'); setSaving(false); return; }
        r = await api.dogamaAddConfeccionistaToRoute({
          enc_id: group.enc_id,
          confeccionista_id: Number(confId),
          tipo: group.tipo, usuario_creacion: user.id, user_nombre: user.name,
        });
      } else {
        const id = mode === 'despacho' ? Number(despId) : Number(citaId);
        if (!id) { toast.warning('Seleccione un elemento'); setSaving(false); return; }
        const result = await api.dogamaCreatePlanillaHistorial({
          vehicle_id: group.vehicle_id!, fecha: group.fecha,
          items: [{ tipo: mode, id }],
          usuario_creacion: user.id,
        });
        r = result?.rows?.[0] ?? result;
      }
      toast.success('Agregado a la ruta');
      onAdded(r);
    } catch { toast.error('Error al agregar'); }
    finally { setSaving(false); }
  };

  const tabCls = (m: Mode) => `px-3 py-1.5 rounded-xl text-xs font-bold transition ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl p-6 flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-slate-800 text-base">Agregar a Ruta</h3>
            <p className="text-xs text-slate-400">{group.placa} · {group.fecha ? new Date(group.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <button className={tabCls('conf')}    onClick={() => { setMode('conf');    setQuery(''); }}>Confeccionista directo</button>
          <button className={tabCls('despacho')} onClick={() => { setMode('despacho'); setQuery(''); }}>Despacho existente</button>
          <button className={tabCls('cita')}    onClick={() => { setMode('cita');    setQuery(''); }}>Cita existente</button>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl mb-3 min-h-0" style={{ minHeight: 300 }}>
          {mode === 'conf' && filteredConf.map(c => (
            <button key={c.id} onClick={() => setConfId(String(c.id))}
              className={`w-full text-left px-4 py-3 text-sm border-b border-slate-50 last:border-0 transition ${confId === String(c.id) ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}>
              {c.descripcion_conf}
            </button>
          ))}
          {mode === 'despacho' && filteredDesp.map(d => (
            <button key={d.id} onClick={() => setDespId(String(d.id))}
              className={`w-full text-left px-4 py-3 text-sm border-b border-slate-50 last:border-0 transition ${despId === String(d.id) ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}>
              <span className="font-bold">{d.confeccionista_nombre || '—'}</span>
              {d.orden_servicio && <span className="text-slate-400 ml-2 text-xs">OS: {d.orden_servicio}</span>}
              {d.referencia && <span className="text-slate-400 ml-2 text-xs">Ref: {d.referencia}</span>}
            </button>
          ))}
          {mode === 'cita' && filteredCita.map(c => (
            <button key={c.id} onClick={() => setCitaId(String(c.id))}
              className={`w-full text-left px-4 py-3 text-sm border-b border-slate-50 last:border-0 transition ${citaId === String(c.id) ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}>
              <span className="font-bold">{c.proveedor_nombre || '—'}</span>
              {c.hora_inicio && <span className="text-slate-400 ml-2 text-xs">{c.hora_inicio}</span>}
              {c.referencia && <span className="text-slate-400 ml-2 text-xs">Ref: {c.referencia}</span>}
            </button>
          ))}
        </div>
        {mode === 'conf' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[['Remesa', remesa, setRemesa], ['Manifiesto', manif, setManif]].map(([label, val, setter]) => (
              <div key={label as string}>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">{label as string}</label>
                <input value={val as string} onChange={e => (setter as any)(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            ))}
            {[['Valor CxC', cxc, setCxc], ['Valor CxP', cxp, setCxp]].map(([label, val, setter]) => (
              <div key={label as string}>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">{label as string}</label>
                <input type="number" value={val as string} onChange={e => (setter as any)(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleAdd} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50 transition">
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ChangePlacaModal ──────────────────────────────────────────────────────────

function ChangePlacaModal({ group, user, onClose, onChanged }: {
  group: RouteGroup; user: User;
  onClose: () => void;
  onChanged: (newVehicleId: string, newPlate: string, newBrand: string | null) => void;
}) {
  const [vehicles, setVehicles] = useState<{ id: string; plate: string; brand: string | null }[]>([]);
  const [selected, setSelected] = useState('');
  const [query,    setQuery]    = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    api.dogamaGetFleetAssignments().then((data: any) => {
      const arr: FleetAssignment[] = Array.isArray(data) ? data : [];
      const unique = new Map<string, { id: string; plate: string; brand: string | null }>();
      arr.forEach(a => { if (!unique.has(a.vehicle_id)) unique.set(a.vehicle_id, { id: a.vehicle_id, plate: a.plate, brand: a.vehicle_brand }); });
      setVehicles([...unique.values()].filter(v => v.id !== group.vehicle_id));
    }).catch(() => {});
  }, []);

  const filtered = vehicles.filter(v => !query || v.plate.toLowerCase().includes(query.toLowerCase()) || (v.brand || '').toLowerCase().includes(query.toLowerCase()));

  const handleConfirm = async () => {
    if (!selected) { toast.warning('Seleccione una placa de destino'); return; }
    setSaving(true);
    try {
      const result: any = await api.dogamaChangeRouteVehicle({
        old_vehicle_id: group.vehicle_id!,
        conductor_id: group.conductor_id,
        client_id: group.client_id,
        fecha: group.fecha,
        new_vehicle_id: selected,
        user_id: user.id,
        user_nombre: user.name,
      });
      toast.success(`Ruta transferida a ${result.new_plate}`);
      onChanged(result.new_vehicle_id, result.new_plate, result.new_brand ?? null);
    } catch { toast.error('Error al cambiar placa'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-800 text-sm">Cambiar Placa de Ruta</h3>
            <p className="text-xs text-slate-400">Actual: <span className="font-mono font-bold text-slate-700">{group.placa}</span> · {group.fecha}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar placa o marca…"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <div className="overflow-y-auto border border-slate-100 rounded-2xl" style={{ maxHeight: 260 }}>
          {filtered.length === 0 && <p className="text-xs text-slate-400 italic p-4 text-center">Sin vehículos disponibles</p>}
          {filtered.map(v => (
            <button key={v.id} onClick={() => setSelected(v.id)}
              className={`w-full text-left px-4 py-3 text-sm border-b border-slate-50 last:border-0 transition flex items-center gap-3 ${selected === v.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}>
              <span className="font-mono font-black text-base tracking-widest bg-slate-900 text-white px-2 py-0.5 rounded-lg">{v.plate}</span>
              {v.brand && <span className="text-xs text-slate-400">{v.brand}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving || !selected}
            className="flex-1 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold disabled:opacity-50 transition">
            {saving ? 'Guardando…' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RouteDetailDialog — tabla completa con colores configurables ───────────────

function RouteDetailDialog({ group, user, localRecords, onEdit, onClose, onGroupUpdated }: {
  group: RouteGroup; user: User; localRecords: PlanillaHistorial[];
  onEdit: (r: PlanillaHistorial) => void; onClose: () => void;
  onGroupUpdated: (records: PlanillaHistorial[], newGroup?: Partial<RouteGroup>) => void;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [cancelTarget,    setCancelTarget]    = useState<PlanillaHistorial | null>(null);
  const [showAdd,         setShowAdd]         = useState(false);
  const [showChangePlaca, setShowChangePlaca] = useState(false);
  const [showAuditLog,    setShowAuditLog]    = useState(false);
  const [auditLog,        setAuditLog]        = useState<any[]>([]);
  const [auditLoading,    setAuditLoading]    = useState(false);
  const [currentPlaca,    setCurrentPlaca]    = useState(group.placa);
  const [showEditEnc,     setShowEditEnc]     = useState(false);
  const [showBandsCfg,    setShowBandsCfg]    = useState(false);
  const [bands,           setBands]           = useState<ColorBand[]>(loadBands);
  const [rowColors,       setRowColors]       = useState<Record<string, string>>(loadRowColors);
  const [colorPickerId,   setColorPickerId]   = useState<string | null>(null);
  const [innerRecords,  setInnerRecords]  = useState<PlanillaHistorial[]>(localRecords);
  useEffect(() => { setInnerRecords(localRecords); }, [localRecords]);

  const allCancelled = innerRecords.every(r => r.estado_id === 'EST-16');

  // Qué tipos de bultos tienen al menos un valor > 0 en el grupo
  const hasCajas    = innerRecords.some(r => (r.cajas    ?? 0) > 0);
  const hasTulas    = innerRecords.some(r => (r.tulas    ?? 0) > 0);
  const hasCanastas = innerRecords.some(r => (r.canastas ?? 0) > 0);
  const hasCostales = innerRecords.some(r => (r.costales ?? 0) > 0);
  const hasBultos   = hasCajas || hasTulas || hasCanastas || hasCostales;

  const cancelRecord = async (target: PlanillaHistorial, motivo: string, tipoCancelacion: 'reasignar' | 'definitivo') => {
    await api.dogamaPatchPlanillaHistorial(target.id, {
      estado_id: 'EST-16',
      motivo_cancelacion: motivo,
      tipo_cancelacion: tipoCancelacion,
      user_id: user.id,
      user_nombre: user.name,
    });
    const updated = innerRecords.map(r =>
      r.id === target.id
        ? { ...r, estado_id: 'EST-16', motivo_cancelacion: motivo, tipo_cancelacion: tipoCancelacion }
        : r
    );
    setInnerRecords(updated);
    onGroupUpdated(updated);
    const label = tipoCancelacion === 'definitivo' ? 'Cancelado definitivamente' : 'Cancelado para reasignar';
    toast.success(label);
    setCancelTarget(null);
  };

  const setRowColor = (id: string, color: string) => {
    const updated = { ...rowColors, [id]: color };
    setRowColors(updated);
    saveRowColors(updated);
    setColorPickerId(null);
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    try {
      const data: any = await api.dogamaGetRouteAuditLog(group.enc_id);
      setAuditLog(Array.isArray(data) ? data : []);
    } catch { toast.error('Error al cargar historial'); }
    finally { setAuditLoading(false); }
  };

  const handleShowAudit = () => {
    setShowAuditLog(true);
    loadAuditLog();
  };

  const handlePlacaChanged = (newVehicleId: string, newPlate: string, newBrand: string | null) => {
    setCurrentPlaca(newPlate);
    setShowChangePlaca(false);
    onGroupUpdated(innerRecords, { vehicle_id: newVehicleId, placa: newPlate, vehicle_brand: newBrand });
  };

  const addBand = () => {
    const b: ColorBand[] = [...bands, { id: Date.now().toString(), label: '', desde: '06:00', hasta: '09:00', color: '#86efac' }];
    setBands(b); saveBands(b);
  };
  const updateBand = (id: string, key: keyof ColorBand, val: string) => {
    const b = bands.map(x => x.id === id ? { ...x, [key]: val } : x);
    setBands(b); saveBands(b);
  };
  const removeBand = (id: string) => {
    const b = bands.filter(x => x.id !== id);
    setBands(b); saveBands(b);
  };

  const exportImage = async () => {
    if (!tableRef.current) return;
    const el = tableRef.current;
    try {
      toast.loading('Generando imagen…', { id: 'img-export' });
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: { overflow: 'visible', maxHeight: 'none' },
        filter: (node: Element) => {
          if (node instanceof HTMLElement && node.getAttribute('data-no-export')) return false;
          return true;
        },
      });
      toast.dismiss('img-export');
      const link = document.createElement('a');
      link.download = `ruta_${currentPlaca}_${group.fecha}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Imagen exportada');
    } catch (e: any) {
      toast.dismiss('img-export');
      toast.error('Error al exportar: ' + (e as Error).message);
    }
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      let y = 12;
      const img = new Image(); img.src = '/logo-encuesta.png';
      try { doc.addImage(img, 'PNG', 10, y, 45, 13); } catch {}
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138);
      doc.text('PLANILLA DE RUTA', W / 2, y + 6, { align: 'center' });
      y += 18;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      doc.text(`Placa: ${group.placa || '—'}   Fecha: ${group.fecha || '—'}   Conductor: ${group.conductor_nombre || '—'}   Cliente: ${group.client_nombre || '—'}`, 10, y);
      y += 8;
      // Table header
      const cols = [['Confeccionista', 60], ['Dirección', 55], ['Tipo/Hora', 28], ['ID Ref', 20], ['Bultos', 35], ['Estado', 22]] as [string, number][];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.setFillColor(30, 58, 138); doc.rect(10, y - 4.5, W - 20, 7, 'F');
      doc.setTextColor(255, 255, 255);
      let cx = 12;
      cols.forEach(([label, w]) => { doc.text(label, cx, y); cx += w; });
      y += 4;
      innerRecords.forEach((r, idx) => {
        const rowY = y + idx * 7;
        const bg = getRowBgColor(r, bands, rowColors);
        if (bg) {
          const rgb = /^#(..)(..)(..)$/.exec(bg);
          if (rgb) doc.setFillColor(parseInt(rgb[1], 16), parseInt(rgb[2], 16), parseInt(rgb[3], 16));
          else if (idx % 2 === 1) doc.setFillColor(248, 250, 252);
          doc.rect(10, rowY - 4.5, W - 20, 7, 'F');
        } else if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252); doc.rect(10, rowY - 4.5, W - 20, 7, 'F');
        }
        const cancelled = r.estado_id === 'EST-16';
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.setTextColor(cancelled ? 160 : 15, cancelled ? 160 : 23, cancelled ? 160 : 42);
        let rx = 12;
        const pHorario = r.hora_inicio ? `${r.hora_inicio}${r.hora_fin ? '-'+r.hora_fin : ''}` : (r.turno || '');
        const pIdRef   = r.despacho_id ? `D-${r.despacho_id}` : r.cita_id ? `C-${r.cita_id}` : '—';
        const pBultos  = [r.cajas && `${r.cajas}cj`, r.tulas && `${r.tulas}tl`, r.canastas && `${r.canastas}cn`, r.costales && `${r.costales}cs`].filter(Boolean).join(' ') || '—';
        const vals = [
          (r.confeccionista_nombre || '—').substring(0, 28),
          (r.confeccionista_direccion || '—').substring(0, 25),
          `${r.tipo || ''}${pHorario ? ' '+pHorario : ''}`,
          pIdRef,
          pBultos,
          cancelled ? 'Cancelado' : 'Activo',
        ];
        cols.forEach(([, w], i) => { doc.text(vals[i], rx, rowY); rx += w; });
      });
      doc.save(`ruta_${group.placa}_${group.fecha}.pdf`);
      toast.success('PDF generado');
    } catch (e: any) { toast.error('Error PDF: ' + e.message); }
  };

  return (
    <>
      {cancelTarget !== null && (
        <CancelModal
          title={`Confeccionista: ${cancelTarget.confeccionista_nombre || '—'}`}
          onClose={() => setCancelTarget(null)}
          onConfirm={(motivo, tipoCancelacion) => cancelRecord(cancelTarget, motivo, tipoCancelacion)}
        />
      )}
      {showAdd && (
        <AddToRouteModal group={group} user={user} onClose={() => setShowAdd(false)}
          onAdded={r => { setInnerRecords(p => [...p, r]); onGroupUpdated([...innerRecords, r]); setShowAdd(false); }}
        />
      )}
      {showChangePlaca && (
        <ChangePlacaModal group={group} user={user}
          onClose={() => setShowChangePlaca(false)}
          onChanged={handlePlacaChanged}
        />
      )}
      {showAuditLog && (
        <div className="fixed inset-0 z-[850] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-sm">Historial de Cambios — {currentPlaca}</h3>
              <button onClick={() => setShowAuditLog(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {auditLoading && <p className="text-xs text-slate-400 text-center py-8">Cargando…</p>}
              {!auditLoading && auditLog.length === 0 && <p className="text-xs text-slate-400 italic text-center py-8">Sin cambios registrados para esta ruta</p>}
              {!auditLoading && auditLog.map((log, i) => {
                const actionLabels: Record<string, { label: string; color: string }> = {
                  add_confeccionista: { label: 'Confeccionista agregado', color: 'bg-green-100 text-green-700' },
                  cancel_confeccionista: { label: 'Confeccionista cancelado', color: 'bg-red-100 text-red-700' },
                  change_vehicle: { label: 'Cambio de placa', color: 'bg-amber-100 text-amber-700' },
                };
                const act = actionLabels[log.action_type] ?? { label: log.action_type, color: 'bg-slate-100 text-slate-600' };
                return (
                  <div key={i} className="border-b border-slate-50 py-3 last:border-0">
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${act.color}`}>{act.label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-600">{log.notes || '—'}</p>
                        {log.new_value && <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{JSON.stringify(log.new_value)}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-slate-600">{log.user_nombre || log.user_id || '—'}</p>
                        <p className="text-[10px] text-slate-400">{log.created_at ? new Date(log.created_at).toLocaleString('es-CO') : ''}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowAuditLog(false)}
                className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditEnc && innerRecords.length > 0 && (
        <EditPlanillaModal
          record={innerRecords[0]}
          onClose={() => setShowEditEnc(false)}
          onSaved={updated => {
            const encFields = { remesa: updated.remesa, manifiesto: updated.manifiesto, valor_cxc: updated.valor_cxc, valor_cxp: updated.valor_cxp, intermediacion: updated.intermediacion };
            const updatedAll = innerRecords.map(r => ({ ...r, ...encFields }));
            setInnerRecords(updatedAll);
            onGroupUpdated(updatedAll);
            setShowEditEnc(false);
          }}
        />
      )}

      <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-3">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl flex flex-col" style={{ maxHeight: '92vh' }}>

          {/* Header */}
          <div className="flex items-start gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
            <span className="font-mono font-black text-2xl tracking-widest bg-slate-900 text-white px-3 py-1.5 rounded-xl shrink-0">{currentPlaca || '—'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <TipoBadge tipo={group.tipo} />
                {allCancelled && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-lg uppercase tracking-widest">Cancelada</span>}
                <span className="text-xs text-slate-400">{group.fecha ? new Date(group.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                <span className="font-semibold">{group.conductor_nombre || '—'}</span>
                <span className="mx-2 text-slate-300">·</span>
                {group.client_nombre || '—'}
              </p>
              {/* Campos enc: Remesa, Manifiesto, CxC, Int., CxP */}
              {(() => {
                const enc = innerRecords[0] ?? group;
                const remesa        = enc.remesa;
                const manifiesto    = enc.manifiesto;
                const cxc           = enc.valor_cxc;
                const cxp           = enc.valor_cxp;
                const intermediacion = enc.intermediacion != null ? Number(enc.intermediacion) : null;
                if (!remesa && !manifiesto && !cxc && !cxp && intermediacion == null) return null;
                return (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                    {remesa && (
                      <span className="text-[10px] text-slate-500">
                        <span className="font-bold text-slate-600">Remesa:</span> {remesa}
                      </span>
                    )}
                    {manifiesto && (
                      <span className="text-[10px] text-slate-500">
                        <span className="font-bold text-slate-600">Manifiesto:</span> {manifiesto}
                      </span>
                    )}
                    {cxc && (
                      <span className="text-[10px] font-bold text-indigo-700">
                        CxC: {formatCOP(cxc)}
                      </span>
                    )}
                    {intermediacion != null && (
                      <span className="text-[10px] font-bold text-violet-600">
                        Int.: {intermediacion}%
                      </span>
                    )}
                    {cxp && (
                      <span className="text-[10px] font-bold text-emerald-700">
                        CxP: {formatCOP(cxp)}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Color bands config toggle */}
              <button onClick={() => setShowBandsCfg(p => !p)}
                title="Configurar colores" className={`w-8 h-8 flex items-center justify-center rounded-xl transition ${showBandsCfg ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
                </svg>
              </button>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* Color band config panel */}
          {showBandsCfg && (
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Configurar colores por horario</p>
                <button onClick={addBand} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                  Agregar franja
                </button>
              </div>
              {bands.length === 0 && <p className="text-xs text-slate-400 italic">Sin franjas configuradas — también puede asignar colores manualmente por fila (ícono 🎨). Los cambios se guardan automáticamente.</p>}
              {bands.length > 0 && <p className="text-[10px] text-slate-400 mb-2">Compara contra <b>hora real</b> (si existe) o <b>hora programada</b>. Se guarda automáticamente en este navegador.</p>}
              <div className="space-y-1.5">
                {bands.map(b => (
                  <div key={b.id} className="flex items-center gap-2">
                    <input type="color" value={b.color} onChange={e => updateBand(b.id, 'color', e.target.value)}
                      className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5" title="Color" />
                    <input value={b.label} onChange={e => updateBand(b.id, 'label', e.target.value)}
                      placeholder="Etiqueta" className="text-xs border border-slate-200 rounded-xl px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    <input type="time" value={b.desde} onChange={e => updateBand(b.id, 'desde', e.target.value)}
                      className="text-xs border border-slate-200 rounded-xl px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    <span className="text-xs text-slate-400">—</span>
                    <input type="time" value={b.hasta} onChange={e => updateBand(b.id, 'hasta', e.target.value)}
                      className="text-xs border border-slate-200 rounded-xl px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    <button onClick={() => removeBand(b.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
            <div ref={tableRef} className="bg-white">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="text-left px-2 py-2 rounded-tl-xl font-bold w-5">#</th>
                    <th className="text-left px-2 py-2 font-bold">Confeccionista / Prov.</th>
                    <th className="text-left px-2 py-2 font-bold">Dirección / Ciudad</th>
                    <th className="text-left px-2 py-2 font-bold">Tipo · Turno · Hora</th>
                    <th className="text-left px-2 py-2 font-bold">Referencia</th>
                    <th className="text-left px-2 py-2 font-bold">Detalle</th>
                    <th className="text-left px-2 py-2 font-bold">ID</th>
                    {hasBultos && <th className="text-left px-2 py-2 font-bold">Bultos</th>}
                    <th className="text-center px-2 py-2 font-bold">Estado</th>
                    <th data-no-export="1" className="text-center px-2 py-2 rounded-tr-xl font-bold">Acc.</th>
                  </tr>
                </thead>
                <tbody>
                  {innerRecords.map((r, idx) => {
                    const bg = getRowBgColor(r, bands, rowColors);
                    const cancelled = r.estado_id === 'EST-16';
                    return (
                      <tr key={r.id}
                        style={bg ? { backgroundColor: bg } : undefined}
                        className={`border-b border-slate-100 ${!bg && idx % 2 === 1 ? 'bg-slate-50' : ''} ${cancelled ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-2 text-slate-400 font-mono">{idx + 1}</td>
                        {/* Confeccionista / Proveedor */}
                        <td className="px-2 py-2 max-w-[150px]">
                          <span className={`font-semibold block truncate ${cancelled ? 'line-through text-slate-400' : 'text-slate-700'}`}
                            title={r.confeccionista_nombre || ''}>
                            {r.confeccionista_nombre || '—'}
                          </span>
                          {cancelled && r.motivo_cancelacion && (
                            <span className="text-[10px] text-red-500 italic">{r.motivo_cancelacion}</span>
                          )}
                        </td>
                        {/* Dirección + Municipio */}
                        <td className="px-2 py-2 text-slate-500 max-w-[130px]">
                          <span className="block truncate text-[11px]" title={[r.confeccionista_direccion, r.confeccionista_ciudad].filter(Boolean).join(', ')}>
                            {r.confeccionista_direccion || '—'}
                          </span>
                          {r.confeccionista_ciudad && (
                            <span className="text-[10px] text-slate-400 font-semibold">{r.confeccionista_ciudad}</span>
                          )}
                        </td>
                        {/* Tipo + Turno + Hora */}
                        <td className="px-2 py-2 whitespace-nowrap">
                          <TipoBadge tipo={r.tipo} />
                          {r.turno && (
                            <span className="block text-[10px] font-bold text-indigo-500 mt-0.5">{r.turno}</span>
                          )}
                          {r.hora_inicio && (
                            <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                              <span className="text-slate-400">Prog:</span> {r.hora_inicio}
                            </span>
                          )}
                          {r.hora_fin && (
                            <span className="block text-[10px] font-bold text-emerald-600 font-mono">
                              <span className="font-normal text-slate-400">Real:</span> {r.hora_fin}
                            </span>
                          )}
                        </td>
                        {/* Referencia */}
                        <td className="px-2 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">{r.referencia || '—'}</td>
                        {/* Info — tipo-específico */}
                        <td className="px-2 py-2 min-w-[180px] max-w-[240px]">
                          <div className="space-y-0.5 text-[10px]">
                            {/* Marca — ambos */}
                            {r.marca && (
                              <span className="inline-block bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded-md mr-1 mb-0.5">{r.marca}</span>
                            )}
                            {r.tipo === 'cita' && (<>
                              <div className="flex flex-wrap gap-x-3">
                                {r.lote && r.lote !== '0'  && <span><b className="text-slate-600">Lote:</b> {r.lote}</span>}
                                {r.mesa != null             && <span><b className="text-slate-600">Mesa:</b> {r.mesa}</span>}
                                {(r.unidades ?? 0) > 0     && <span><b className="text-slate-600">Cant:</b> {r.unidades}</span>}
                              </div>
                              {r.color && (
                                <div><b className="text-slate-600">Color:</b> {r.color}</div>
                              )}
                              {r.numero_documento && (
                                <div className="truncate max-w-[220px]" title={r.numero_documento}>
                                  <b className="text-slate-600">Doc:</b> {r.numero_documento}
                                </div>
                              )}
                              {r.tipo_oc && (
                                <div className="text-slate-400">{r.tipo_oc}</div>
                              )}
                            </>)}
                            {r.tipo === 'despacho' && (<>
                              <div className="flex flex-wrap gap-x-3">
                                {r.orden_cargue  && <span><b className="text-slate-600">OC:</b> {r.orden_cargue}</span>}
                                {r.orden_servicio && <span><b className="text-slate-600">OS:</b> {r.orden_servicio}</span>}
                              </div>
                              <div className="flex flex-wrap gap-x-3">
                                {r.lote && r.lote !== '0'  && <span><b className="text-slate-600">Lote:</b> {r.lote}</span>}
                                {(r.unidades ?? 0) > 0     && <span><b className="text-slate-600">Unid:</b> {r.unidades}</span>}
                              </div>
                              {r.tipo_prenda && (
                                <div className="text-slate-400">{r.tipo_prenda}</div>
                              )}
                            </>)}
                            {r.tipo === 'material_empaque' && (<>
                              {r.lote && r.lote !== '0' && <div><b className="text-slate-600">Lote:</b> {r.lote}</div>}
                            </>)}
                          </div>
                        </td>
                        <td className="px-2 py-2 font-mono text-[10px]">
                          {r.despacho_id
                            ? <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-md font-bold">D-{r.despacho_id}</span>
                            : r.cita_id
                              ? <span className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-md font-bold">C-{r.cita_id}</span>
                              : <span className="text-slate-400">—</span>}
                        </td>
                        {hasBultos && (
                          <td className="px-2 py-2 text-[10px] text-slate-700">
                            <div className="space-y-0.5">
                              {hasCajas    && <div><span className="text-slate-400 font-semibold">Caj:</span> {r.cajas    ?? <span className="text-slate-300">—</span>}</div>}
                              {hasTulas    && <div><span className="text-slate-400 font-semibold">Tul:</span> {r.tulas    ?? <span className="text-slate-300">—</span>}</div>}
                              {hasCanastas && <div><span className="text-slate-400 font-semibold">Can:</span> {r.canastas ?? <span className="text-slate-300">—</span>}</div>}
                              {hasCostales && <div><span className="text-slate-400 font-semibold">Cos:</span> {r.costales ?? <span className="text-slate-300">—</span>}</div>}
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${cancelled ? (r.tipo_cancelacion === 'definitivo' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700') : 'bg-emerald-100 text-emerald-700'}`}>
                            {cancelled ? (r.tipo_cancelacion === 'definitivo' ? 'Cancelado definitivo' : 'Cancel. reasignar') : 'Activo'}
                          </span>
                        </td>
                        <td data-no-export="1" className="px-2 py-2">
                          <div className="flex items-center justify-center gap-0.5">
                            <div className="relative">
                              <button onClick={() => setColorPickerId(colorPickerId === String(r.id) ? null : String(r.id))}
                                title="Color" className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition">
                                <span className="text-sm">🎨</span>
                              </button>
                              {colorPickerId === String(r.id) && (
                                <div className="absolute right-0 top-7 z-10 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 flex gap-1 flex-wrap w-36">
                                  {[...COLOR_PRESETS, ''].map(c => (
                                    <button key={c} onClick={() => setRowColor(String(r.id), c)}
                                      style={c ? { backgroundColor: c } : undefined}
                                      className={`w-6 h-6 rounded-lg border-2 transition ${!c ? 'border-slate-200 bg-white text-slate-400 text-[10px]' : 'border-transparent hover:border-slate-400'}`}
                                      title={c || 'Sin color'}>
                                      {!c && '✕'}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => onEdit(r)} title="Editar"
                              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-indigo-50 text-indigo-500 transition">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            {!cancelled && (
                              <button onClick={() => setCancelTarget(r)} title="Cancelar"
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400 transition">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-100 shrink-0 flex-wrap">
            {!allCancelled && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                Agregar
              </button>
            )}
            <button onClick={() => setShowEditEnc(true)}
              title="Editar remesa, manifiesto, CxC, CxP e intermediación de la planilla"
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold border border-violet-200 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Editar Planilla
            </button>
            <button onClick={() => setShowChangePlaca(true)}
              title="Reasignar esta ruta a un vehículo diferente"
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
              Cambiar Placa
            </button>
            <button onClick={handleShowAudit}
              title="Ver historial de cambios de esta ruta"
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              Historial
            </button>
            <button onClick={exportImage}
              className="flex items-center gap-1 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Imagen
            </button>
            <button onClick={exportPDF}
              className="flex items-center gap-1 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              PDF
            </button>
            <div className="flex-1" />
            <button onClick={onClose}
              className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── RouteCard — compacto, abre el dialog ──────────────────────────────────────

function RouteCard({ group, user, onEdit, onGroupUpdated }: {
  group: RouteGroup;
  user: User;
  onEdit: (r: PlanillaHistorial) => void;
  onGroupUpdated: (records: PlanillaHistorial[]) => void;
}) {
  const [showDetail,    setShowDetail]    = useState(false);
  const [showEditEnc,   setShowEditEnc]   = useState(false);
  const [localRecords,  setLocalRecords]  = useState<PlanillaHistorial[]>(group.records);
  const [currentGroup,  setCurrentGroup]  = useState<RouteGroup>(group);

  useEffect(() => { setLocalRecords(group.records); setCurrentGroup(group); }, [group.records]);

  const allCancelled  = localRecords.every(r => r.estado_id === 'EST-16');
  const activeRecords = localRecords.filter(r => r.estado_id !== 'EST-16');
  const activeCount   = activeRecords.length;
  const totalCajas    = activeRecords.reduce((s, r) => s + (Number(r.cajas)    || 0), 0);
  const totalTulas    = activeRecords.reduce((s, r) => s + (Number(r.tulas)    || 0), 0);
  const totalCanastas = activeRecords.reduce((s, r) => s + (Number(r.canastas) || 0), 0);
  const totalCostales = activeRecords.reduce((s, r) => s + (Number(r.costales) || 0), 0);

  const handleGroupUpdated = (updated: PlanillaHistorial[], newGroupData?: Partial<RouteGroup>) => {
    setLocalRecords(updated);
    if (newGroupData) setCurrentGroup(p => ({ ...p, ...newGroupData }));
    onGroupUpdated(updated);
  };

  return (
    <>
      {showEditEnc && localRecords.length > 0 && (
        <EditPlanillaModal
          record={localRecords[0]}
          onClose={() => setShowEditEnc(false)}
          onSaved={updated => {
            const encFields = { remesa: updated.remesa, manifiesto: updated.manifiesto, valor_cxc: updated.valor_cxc, valor_cxp: updated.valor_cxp, intermediacion: updated.intermediacion };
            const updatedAll = localRecords.map(r => ({ ...r, ...encFields }));
            setLocalRecords(updatedAll);
            onGroupUpdated(updatedAll);
            setShowEditEnc(false);
          }}
        />
      )}
      {showDetail && (
        <RouteDetailDialog
          group={currentGroup} user={user}
          localRecords={localRecords}
          onEdit={onEdit}
          onClose={() => setShowDetail(false)}
          onGroupUpdated={handleGroupUpdated}
        />
      )}

      <div className={`bg-white border rounded-3xl shadow-sm hover:shadow-md transition-shadow overflow-hidden ${allCancelled ? 'border-red-200 opacity-60' : 'border-slate-200'}`}>
        {allCancelled && (
          <div className="bg-red-50 text-red-700 text-center text-xs font-black py-1.5 uppercase tracking-widest border-b border-red-100">
            ✕ Ruta Cancelada
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="font-mono font-black text-xl tracking-widest bg-slate-900 text-white px-3 py-1 rounded-xl">
              {currentGroup.placa || '—'}
            </span>
            <TipoBadge tipo={group.tipo} />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-slate-400">
              {group.fecha ? new Date(group.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </span>
            <span className="text-slate-200">·</span>
            <span className="text-xs text-slate-400">{activeCount} activo(s) / {localRecords.length} total</span>
          </div>
          <div className="space-y-1 text-xs mb-3">
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">Conductor</span>
              <span className="font-semibold text-slate-700 text-right max-w-[55%] truncate">{group.conductor_nombre || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium">Cliente</span>
              <span className="font-semibold text-slate-700 text-right max-w-[55%] truncate">{group.client_nombre || '—'}</span>
            </div>
          </div>
          {/* Enc fields: Remesa, Manifiesto, CxC, Int., CxP */}
          {(() => {
            const enc = localRecords[0];
            if (!enc) return null;
            const remesa        = enc.remesa;
            const manifiesto    = enc.manifiesto;
            const cxc           = enc.valor_cxc;
            const cxp           = enc.valor_cxp;
            const interm        = enc.intermediacion != null ? Number(enc.intermediacion) : null;
            if (!remesa && !manifiesto && !cxc && !cxp && interm == null) return null;
            return (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-3">
                {remesa && <span className="text-[10px] text-slate-500"><span className="font-bold text-slate-600">Remesa:</span> {remesa}</span>}
                {manifiesto && <span className="text-[10px] text-slate-500"><span className="font-bold text-slate-600">Manifiesto:</span> {manifiesto}</span>}
                {cxc && <span className="text-[10px] font-bold text-indigo-700">CxC: {formatCOP(cxc)}</span>}
                {interm != null && <span className="text-[10px] font-bold text-violet-600">Int.: {interm}%</span>}
                {cxp && <span className="text-[10px] font-bold text-emerald-700">CxP: {formatCOP(cxp)}</span>}
              </div>
            );
          })()}
          {(totalCajas > 0 || totalTulas > 0 || totalCanastas > 0 || totalCostales > 0) && (
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Bultos activos</p>
              <p className="text-xs font-black text-slate-700">
                {[
                  totalCajas    > 0 && `${totalCajas} cajas`,
                  totalTulas    > 0 && `${totalTulas} tulas`,
                  totalCanastas > 0 && `${totalCanastas} canastas`,
                  totalCostales > 0 && `${totalCostales} costales`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={() => setShowEditEnc(true)} title="Editar datos de planilla (remesa, manifiesto, valores)"
            className="py-2 px-3 rounded-2xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold border border-violet-200 transition flex items-center gap-1.5 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Editar
          </button>
          <button onClick={() => setShowDetail(true)}
            className="flex-1 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            Ver Ruta
          </button>
        </div>
      </div>
    </>
  );
}

// ── Tab principal: historial + filtros ────────────────────────────────────────

function AsignacionPlacaTab({ user }: { user: User }) {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const [showDialog,  setShowDialog]  = useState(false);
  const [historial,   setHistorial]   = useState<PlanillaHistorial[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [editRecord,  setEditRecord]  = useState<PlanillaHistorial | null>(null);

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

  const handleUpdated = (updated: PlanillaHistorial) => {
    setHistorial(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleGroupUpdated = (updatedRecords: PlanillaHistorial[]) => {
    setHistorial(prev => {
      const byId = new Map(updatedRecords.map(r => [r.id, r]));
      return prev.map(r => byId.has(r.id) ? byId.get(r.id)! : r);
    });
  };

  const routeGroups = useMemo(() => groupByRoute(historial), [historial]);

  return (
    <>
      <AsignacionDialog
        open={showDialog}
        user={user}
        onClose={() => setShowDialog(false)}
        onSaved={() => { setShowDialog(false); loadHistorial({ placa: fPlaca || undefined, fecha: fFecha || undefined, confeccionista: fConf || undefined }); }}
      />

      {editRecord && (
        <EditPlanillaModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={updated => { handleUpdated(updated); setEditRecord(null); }}
        />
      )}

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

      {/* Cards historial agrupadas por ruta */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : routeGroups.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-bold text-sm">Sin asignaciones para los filtros seleccionados</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 font-semibold mb-4">
            {routeGroups.length} ruta(s) · {historial.length} registro(s)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routeGroups.map(g => (
              <RouteCard
                key={g.key}
                group={g}
                user={user}
                onEdit={setEditRecord}
                onGroupUpdated={handleGroupUpdated}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Dialog confirmación envío de correos ──────────────────────────────────────

function EmailConfirmDialog({ open, plate, onSend, onSkip }: {
  open: boolean; plate: string; onSend: () => void; onSkip: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center">
        <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
        </div>
        <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">Notificación</p>
        <h3 className="text-lg font-black text-slate-800 mb-2">¿Enviar correos ahora?</h3>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Planilla guardada para <span className="font-bold text-slate-700">{plate}</span>. ¿Desea enviar correo de confirmación a los confeccionistas ahora o guardar para enviar luego?
        </p>
        <div className="flex gap-3">
          <button onClick={onSkip}
            className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition">
            Guardar pendiente
          </button>
          <button onClick={onSend}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 transition">
            Enviar ahora
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal guardar planilla ─────────────────────────────────────────────────────

interface PlanillaModalData { remesa: string; manifiesto: string; valor_cxc: string; valor_cxp: string; intermediacion: number | null; }

function GuardarPlanillaModal({ open, plate, totalItems, saving, onConfirm, onClose }: {
  open: boolean; plate: string; totalItems: number; saving: boolean;
  onConfirm: (d: PlanillaModalData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<PlanillaModalData>({ remesa: '', manifiesto: '', valor_cxc: '', valor_cxp: '', intermediacion: null });
  const [fletes, setFletes] = useState<FleteIntermediacion[]>([]);
  const [intermediacion, setIntermediacion] = useState<number | null>(null);

  const intermediacionOpts = useMemo<number[]>(() => {
    const activeFlete = fletes.find(f => f.estado_id === 'EST-01');
    if (!activeFlete) return [];
    const minVal = Number(activeFlete.valor_intermediacion_minimo ?? 0);
    const maxVal = Number(activeFlete.intermediacion_final ?? 0);
    if (isNaN(minVal) || isNaN(maxVal)) return [];
    const opts: number[] = [];
    const start = Math.ceil(minVal);
    const end   = Math.floor(maxVal);
    for (let i = start; i <= end; i++) opts.push(i);
    if (opts.length === 0 && !isNaN(minVal)) opts.push(Math.round(minVal));
    return opts;
  }, [fletes]);

  useEffect(() => {
    if (!open) return;
    setForm({ remesa: '', manifiesto: '', valor_cxc: '', valor_cxp: '', intermediacion: null });
    setFletes([]);
    setIntermediacion(null);
    api.dogamaGetFletes().then((rows: FleteIntermediacion[]) => {
      setFletes(rows);
      const activeFlete = rows.find((f: FleteIntermediacion) => f.estado_id === 'EST-01');
      if (activeFlete?.flete_minimo) {
        setForm(p => ({ ...p, valor_cxc: String(Number(activeFlete.flete_minimo)) }));
      }
      if (activeFlete?.valor_intermediacion_minimo != null) {
        setIntermediacion(Math.ceil(Number(activeFlete.valor_intermediacion_minimo)));
      }
    }).catch(() => {});
  }, [open]);

  // Auto-calculate CxP when CxC or intermediacion changes
  useEffect(() => {
    if (intermediacion == null || !form.valor_cxc) return;
    const cxc = Number(form.valor_cxc);
    if (isNaN(cxc)) return;
    const cxp = Math.round(cxc - (cxc * intermediacion / 100));
    setForm(p => ({ ...p, valor_cxp: String(cxp) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.valor_cxc, intermediacion]);

  const setF = (k: keyof PlanillaModalData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  if (!open) return null;

  const activeFlete = fletes.find(f => f.estado_id === 'EST-01');
  const cxpAutoCalc = intermediacion != null && !!form.valor_cxc;

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
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Valor CxC
              {activeFlete?.flete_minimo && (
                <span className="ml-2 text-[10px] font-normal text-slate-400">
                  Flete mín: {formatCOP(activeFlete.flete_minimo)}
                </span>
              )}
            </label>
            <input value={form.valor_cxc} onChange={setF('valor_cxc')} type="number" min="0" placeholder="0"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          {intermediacionOpts.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Intermediación (%)</label>
              <select
                value={intermediacion ?? intermediacionOpts[0]}
                onChange={e => setIntermediacion(Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                {intermediacionOpts.map(p => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Valor CxP
              {cxpAutoCalc && (
                <span className="ml-2 text-[10px] font-normal text-emerald-600">calculado automáticamente</span>
              )}
            </label>
            <input
              value={form.valor_cxp}
              readOnly={cxpAutoCalc}
              onChange={cxpAutoCalc ? undefined : setF('valor_cxp')}
              type="number" min="0" placeholder="0"
              className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                cxpAutoCalc ? 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-200'
              }`} />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={() => onConfirm({ ...form, intermediacion })} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
            {saving ? 'Guardando…' : 'Guardar planilla'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Material Empaque Form (inline in step 4 when tipo=material_empaque) ────────

interface MatEmpForm {
  fecha: string; confeccionista_id: string; remesa: string; manifiesto: string;
  valor_cxc: string; valor_cxp: string;
  cajas: string; tulas: string; canastas: string; costales: string;
}

// ── Flow A: selecciono placa → asigno registros ────────────────────────────

function FlowPlacaARegistros({ user, clients, assignments, despachos, citas, confeccionistas, onBack, onSaved }: {
  user: User; clients: Client[]; assignments: FleetAssignment[];
  despachos: Despacho[]; citas: Cita[];
  confeccionistas: ConfItem[];
  onBack: () => void; onSaved: () => void;
}) {
  const [step, setStep]           = useState<1|2|3|4>(1);
  const [clientId,  setClientId]  = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [tipo,      setTipo]      = useState<TipoReg>('ambos');
  const [selDesp, setSelDesp] = useState<Set<number>>(new Set());
  const [selCita, setSelCita] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; plate: string }>({ open: false, plate: '' });
  const pendingEncIdRef = useRef<number | null>(null);

  const createNotifPendientes = async (encId: number): Promise<any[]> => {
    const r = await api.dogamaCreateNotifCorreos(encId, user.id);
    return r?.rows ?? [];
  };

  const handleEmailDialogSend = async () => {
    const encId = pendingEncIdRef.current;
    pendingEncIdRef.current = null;
    setEmailDialog({ open: false, plate: '' });
    if (!encId) { onSaved(); return; }
    try {
      const rows = await createNotifPendientes(encId);
      if (rows.length === 0) { toast.info('No hay confeccionistas con correo para notificar'); onSaved(); return; }
      // Enviar correos inmediatamente
      let enviados = 0;
      for (const row of rows) {
        try { await api.dogamaSendNotifCorreo(row.id); enviados++; } catch { /* continuar */ }
      }
      if (enviados > 0) toast.success(`${enviados} correo(s) enviado(s) exitosamente`);
      else toast.warning(`Notificaciones creadas pero no se pudieron enviar los correos`);
    } catch { toast.error('Error al procesar notificaciones de correo'); }
    onSaved();
  };

  const handleEmailDialogSkip = async () => {
    const encId = pendingEncIdRef.current;
    pendingEncIdRef.current = null;
    setEmailDialog({ open: false, plate: '' });
    if (!encId) { onSaved(); return; }
    try {
      const rows = await createNotifPendientes(encId);
      if (rows.length > 0) toast.info(`${rows.length} notificación(es) guardada(s) como pendiente`);
    } catch { /* no bloquear el flujo */ }
    onSaved();
  };

  // Material empaque form state
  const today = new Date().toLocaleDateString('en-CA');
  const [matForm, setMatForm] = useState<MatEmpForm>({
    fecha: today, confeccionista_id: '', remesa: '', manifiesto: '',
    valor_cxc: '', valor_cxp: '', cajas: '', tulas: '', canastas: '', costales: '',
  });
  const setMF = (k: keyof MatEmpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setMatForm(p => ({ ...p, [k]: e.target.value }));

  // Fletes para material empaque
  const [matFletes, setMatFletes] = useState<FleteIntermediacion[]>([]);
  const [matIntermed, setMatIntermed] = useState<number | null>(null);
  const matActiveFlete = matFletes.find(f => f.estado_id === 'EST-01');
  const matIntermOpts = useMemo<number[]>(() => {
    if (!matActiveFlete) return [];
    const minV = Number(matActiveFlete.valor_intermediacion_minimo ?? 0);
    const maxV = Number(matActiveFlete.intermediacion_final ?? 0);
    if (isNaN(minV) || isNaN(maxV)) return [];
    const opts: number[] = [];
    for (let i = Math.ceil(minV); i <= Math.floor(maxV); i++) opts.push(i);
    if (opts.length === 0 && !isNaN(minV)) opts.push(Math.round(minV));
    return opts;
  }, [matActiveFlete]);

  // Cargar fletes al llegar al paso 4 de material empaque
  useEffect(() => {
    if (step !== 4 || tipo !== 'material_empaque') return;
    api.dogamaGetFletes().then((rows: FleteIntermediacion[]) => {
      setMatFletes(rows);
      const af = rows.find((f: FleteIntermediacion) => f.estado_id === 'EST-01');
      if (af?.flete_minimo) setMatForm(p => p.valor_cxc ? p : { ...p, valor_cxc: String(Number(af.flete_minimo)) });
      if (af?.valor_intermediacion_minimo != null) setMatIntermed(Math.ceil(Number(af.valor_intermediacion_minimo)));
    }).catch(() => {});
  }, [step, tipo]);

  // Auto-calc CxP en material empaque
  useEffect(() => {
    if (matIntermed == null || !matForm.valor_cxc) return;
    const cxc = Number(matForm.valor_cxc);
    if (isNaN(cxc)) return;
    setMatForm(p => ({ ...p, valor_cxp: String(Math.round(cxc - (cxc * matIntermed / 100))) }));
  }, [matForm.valor_cxc, matIntermed]);

  const clientAssignments = assignments.filter(a => a.client_id === clientId);
  const selectedAssignment = assignments.find(a => a.vehicle_id === vehicleId);

  const shownDespachos = (tipo !== 'citas' && tipo !== 'material_empaque')    ? despachos : [];
  const shownCitas     = (tipo !== 'despachos' && tipo !== 'material_empaque') ? citas     : [];
  const totalSelected  = selDesp.size + selCita.size;

  const handleConfirmSave = async (formData: PlanillaModalData) => {
    if (!selectedAssignment) return;
    setSaving(true);
    try {
      const items = [
        ...Array.from(selDesp).map(id => ({ tipo: 'despacho' as const, id })),
        ...Array.from(selCita).map(id => ({ tipo: 'cita' as const, id })),
      ];
      const result = await api.dogamaCreatePlanillaHistorial({
        vehicle_id: vehicleId,
        remesa:     formData.remesa     || null,
        manifiesto: formData.manifiesto || null,
        valor_cxc:  formData.valor_cxc  ? Number(formData.valor_cxc)  : null,
        valor_cxp:  formData.valor_cxp  ? Number(formData.valor_cxp)  : null,
        intermediacion: formData.intermediacion ?? null,
        items,
        usuario_creacion: user.id,
      });
      pendingEncIdRef.current = result?.enc?.id ?? null;
      toast.success(`Planilla guardada: ${items.length} registro(s) asignados a ${selectedAssignment.plate}`);
      setShowModal(false);
      setEmailDialog({ open: true, plate: selectedAssignment.plate });
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e?.message ?? 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaterialEmpaque = async () => {
    if (!vehicleId) { toast.error('Seleccione una placa'); return; }
    setSaving(true);
    try {
      await api.dogamaCreateMaterialEmpaque({
        vehicle_id: vehicleId,
        fecha: matForm.fecha || null,
        confeccionista_id: matForm.confeccionista_id ? Number(matForm.confeccionista_id) : null,
        remesa: matForm.remesa || null,
        manifiesto: matForm.manifiesto || null,
        valor_cxc: matForm.valor_cxc ? Number(matForm.valor_cxc) : null,
        valor_cxp: matForm.valor_cxp ? Number(matForm.valor_cxp) : null,
        intermediacion: matIntermed ?? null,
        cajas: matForm.cajas ? Number(matForm.cajas) : null,
        tulas: matForm.tulas ? Number(matForm.tulas) : null,
        canastas: matForm.canastas ? Number(matForm.canastas) : null,
        costales: matForm.costales ? Number(matForm.costales) : null,
        usuario_creacion: user.id,
      });
      toast.success(`Despacho material de empaque guardado para ${selectedAssignment?.plate}`);
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
      <EmailConfirmDialog
        open={emailDialog.open}
        plate={emailDialog.plate}
        onSend={handleEmailDialogSend}
        onSkip={handleEmailDialogSkip}
      />
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              { k: 'ambos',            label: 'Ambos',                   desc: 'Citas y Despachos',     color: 'indigo'  },
              { k: 'citas',            label: 'Citas',                   desc: 'Solo recogidas',        color: 'emerald' },
              { k: 'despachos',        label: 'Despachos',               desc: 'Solo despachos',        color: 'amber'   },
              { k: 'material_empaque', label: 'Despacho Mat. Empaque',   desc: 'Registro directo',      color: 'purple'  },
            ] as const).map(opt => (
              <button key={opt.k} onClick={() => { setTipo(opt.k); setSelDesp(new Set()); setSelCita(new Set()); setStep(4); }}
                className={`p-5 rounded-2xl border-2 transition-all hover:shadow-md text-left
                  ${tipo === opt.k
                    ? opt.color === 'indigo'  ? 'border-indigo-500 bg-indigo-50'
                    : opt.color === 'emerald' ? 'border-emerald-500 bg-emerald-50'
                    : opt.color === 'amber'   ? 'border-amber-500 bg-amber-50'
                    : 'border-purple-500 bg-purple-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                <p className={`font-black text-sm ${
                  opt.color === 'indigo'  ? 'text-indigo-700'
                  : opt.color === 'emerald' ? 'text-emerald-700'
                  : opt.color === 'amber'   ? 'text-amber-700'
                  : 'text-purple-700'}`}>{opt.label}</p>
                <p className="text-xs text-slate-400 mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="mt-5 text-xs text-slate-400 hover:text-slate-600 underline">← Cambiar placa</button>
        </div>
      )}

      {/* Step 4: Selección de registros con DataTable o formulario material empaque */}
      {step === 4 && tipo === 'material_empaque' && (
        <div className="max-w-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm font-bold text-slate-700">
                Despacho Material de Empaque — Placa <span className="text-purple-600">{selectedAssignment?.plate}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Registro directo sin citas/despachos</p>
            </div>
            <button onClick={() => setStep(3)} className="text-xs text-slate-400 hover:text-slate-600 underline">← Cambiar tipo</button>
          </div>
          <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
                <input type="date" value={matForm.fecha} onChange={setMF('fecha')}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Confeccionista / Proveedor</label>
                <select value={matForm.confeccionista_id} onChange={setMF('confeccionista_id')}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white">
                  <option value="">— Seleccionar —</option>
                  {confeccionistas.map(c => <option key={c.id} value={c.id}>{c.descripcion_conf}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Remesa</label>
                <input value={matForm.remesa} onChange={setMF('remesa')} placeholder="Ej: 001234"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Manifiesto</label>
                <input value={matForm.manifiesto} onChange={setMF('manifiesto')} placeholder="Ej: M-5678"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">
                Valor CxC
                {matActiveFlete?.flete_minimo && (
                  <span className="ml-2 text-[10px] font-normal text-slate-400">
                    Flete mín: {formatCOP(matActiveFlete.flete_minimo)} — máx: {formatCOP(matActiveFlete.flete_maximo ?? '')}
                  </span>
                )}
              </label>
              <input type="number" value={matForm.valor_cxc} onChange={setMF('valor_cxc')} placeholder="0"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
            </div>
            {matIntermOpts.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Intermediación (%)</label>
                <select value={matIntermed ?? matIntermOpts[0]} onChange={e => setMatIntermed(Number(e.target.value))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white">
                  {matIntermOpts.map(p => <option key={p} value={p}>{p}%</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">
                Valor CxP
                {matIntermed != null && matForm.valor_cxc && (
                  <span className="ml-2 text-[10px] font-normal text-emerald-600">calculado automáticamente</span>
                )}
              </label>
              <input type="number" value={matForm.valor_cxp}
                readOnly={matIntermed != null && !!matForm.valor_cxc}
                onChange={matIntermed != null && matForm.valor_cxc ? undefined : setMF('valor_cxp')}
                placeholder="0"
                className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                  matIntermed != null && matForm.valor_cxc ? 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-200'
                }`} />
            </div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest pt-1">Cantidades</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['cajas','tulas','canastas','costales'] as const).map(k => (
                <div key={k}>
                  <label className="block text-xs font-bold text-slate-500 mb-1 capitalize">{k}</label>
                  <input type="number" min="0" value={matForm[k]} onChange={setMF(k)} placeholder="0"
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
              ))}
            </div>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-slate-100 pt-4 mt-4 flex justify-end">
            <button
              disabled={saving}
              onClick={handleSaveMaterialEmpaque}
              className="px-6 py-2.5 rounded-2xl bg-purple-600 text-white text-sm font-black disabled:opacity-40 hover:bg-purple-700 flex items-center gap-2 transition">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando…</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Guardar Material Empaque</>
              }
            </button>
          </div>
        </div>
      )}

      {step === 4 && tipo !== 'material_empaque' && (
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
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; encIds: number[]; plates: string }>({ open: false, encIds: [], plates: '' });

  const handleEmailDialogSendB = async () => {
    if (emailDialog.encIds.length > 0) {
      try {
        await Promise.all(emailDialog.encIds.map(eid => api.dogamaCreateNotifCorreos(eid, user.id)));
        toast.success('Notificaciones de correo creadas correctamente');
      } catch { toast.error('No se pudieron crear las notificaciones de correo'); }
    }
    setEmailDialog({ open: false, encIds: [], plates: '' });
    onSaved();
  };

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

      const results = await Promise.all(
        [...byVehicle.entries()].map(([vid, grp]) => {
          return api.dogamaCreatePlanillaHistorial({
            vehicle_id: vid,
            remesa:     formData.remesa     || null,
            manifiesto: formData.manifiesto || null,
            valor_cxc:  formData.valor_cxc  ? Number(formData.valor_cxc)  : null,
            valor_cxp:  formData.valor_cxp  ? Number(formData.valor_cxp)  : null,
            intermediacion: formData.intermediacion ?? null,
            items: grp.map(i => ({ tipo: i.tipo, id: i.item_id })),
            usuario_creacion: user.id,
          });
        })
      );

      const encIds = results.map((r: any) => r?.enc?.id).filter(Boolean) as number[];
      const plates = [...byVehicle.entries()]
        .map(([vid]) => assignments.find(a => a.vehicle_id === vid)?.plate ?? vid)
        .join(', ');

      toast.success(`Asignaciones guardadas: ${allItems.length} registro(s) en ${byVehicle.size} placa(s)`);
      setShowModal(false);
      setEmailDialog({ open: true, encIds, plates });
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
      <EmailConfirmDialog
        open={emailDialog.open}
        plate={emailDialog.plates}
        onSend={handleEmailDialogSendB}
        onSkip={() => { setEmailDialog({ open: false, encIds: [], plates: '' }); onSaved(); }}
      />
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

// ── Correos Tab ────────────────────────────────────────────────────────────────

interface NotifCorreo {
  id: number;
  enc_id: number | null;
  confeccionista_id: number | null;
  confeccionista_nombre: string | null;
  confeccionista_email: string | null;
  placa: string | null;
  placa_actual: string | null;
  fecha_cita: string | null;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  celular_conductor: string | null;
  lotes: string | null;
  ruta_descripcion: string | null;
  from_email: string | null;
  from_provider: string | null;
  estado: 'pendiente' | 'enviado' | 'cancelado';
  sent_at: string | null;
  created_at: string;
  remesa: string | null;
  manifiesto: string | null;
  conf_nombre_actual: string | null;
  conf_email_actual: string | null;
  conf_ciudad: string | null;
}

const ESTADO_CORREO_LABELS: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700' },
  enviado:    { label: 'Enviado',    cls: 'bg-emerald-100 text-emerald-700' },
  cancelado:  { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
};

function CorreosTab({ user }: { user: User }) {
  const [rows, setRows] = useState<NotifCorreo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('pendiente');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [sending, setSending] = useState<number | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.dogamaGetNotifCorreos({
        estado: filtroEstado === 'todos' ? undefined : filtroEstado,
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch { toast.error('Error al cargar notificaciones'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filtroEstado, fechaDesde, fechaHasta]);

  const handleSend = async (notif: NotifCorreo) => {
    if (!notif.confeccionista_email && !notif.conf_email_actual) {
      toast.error('El confeccionista no tiene correo registrado');
      return;
    }
    setSending(notif.id);
    try {
      await api.dogamaSendNotifCorreo(notif.id);
      toast.success(`Correo enviado a ${notif.confeccionista_email ?? notif.conf_email_actual}`);
      setRows(prev => prev.map(r => r.id === notif.id ? { ...r, estado: 'enviado' } : r));
    } catch (e: any) {
      toast.error('Error al enviar: ' + (e?.message ?? 'Error desconocido'));
    }
    setSending(null);
  };

  const handleUpdateEstado = async (notif: NotifCorreo, estado: 'pendiente' | 'enviado' | 'cancelado') => {
    setUpdating(notif.id);
    try {
      await api.dogamaUpdateNotifCorreo(notif.id, estado);
      setRows(prev => prev.map(r => r.id === notif.id ? { ...r, estado } : r));
    } catch { toast.error('Error al actualizar estado'); }
    setUpdating(null);
  };

  const correosColumns: ColumnDef<NotifCorreo>[] = [
    {
      header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true,
      render: r => {
        const nombre = r.conf_nombre_actual ?? r.confeccionista_nombre ?? '—';
        return (
          <div>
            <p className="font-semibold text-slate-800 text-xs">{nombre}</p>
            {r.conf_ciudad && <p className="text-[10px] text-slate-400">{r.conf_ciudad}</p>}
          </div>
        );
      },
      exportRender: r => r.conf_nombre_actual ?? r.confeccionista_nombre ?? '',
    },
    {
      header: 'Email', key: 'confeccionista_email', sortable: true,
      render: r => {
        const correo = r.conf_email_actual ?? r.confeccionista_email;
        return correo
          ? <span className="text-indigo-700 font-medium text-xs">{correo}</span>
          : <span className="text-red-400 text-[11px]">Sin correo</span>;
      },
      exportRender: r => r.conf_email_actual ?? r.confeccionista_email ?? '',
    },
    {
      header: 'Lote(s)', key: 'lotes', sortable: true,
      render: r => <span className="text-slate-600 text-xs">{r.lotes ?? '—'}</span>,
    },
    {
      header: 'Fecha Cita', key: 'fecha_cita', sortable: true,
      render: r => {
        if (!r.fecha_cita) return <span className="text-slate-300">—</span>;
        return <span className="text-slate-600 text-xs">{new Date(r.fecha_cita + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
      },
    },
    {
      header: 'Placa', key: 'placa', sortable: true,
      render: r => <span className="font-mono font-black text-slate-700 tracking-widest text-xs">{r.placa_actual ?? r.placa ?? '—'}</span>,
      exportRender: r => r.placa_actual ?? r.placa ?? '',
    },
    {
      header: 'Conductor', key: 'conductor_nombre', sortable: true,
      render: r => <span className="text-slate-700 text-xs">{r.conductor_nombre ?? '—'}</span>,
    },
    {
      header: 'Cédula', key: 'cedula_conductor', sortable: true,
      render: r => <span className="text-slate-600 text-xs">{r.cedula_conductor ?? '—'}</span>,
    },
    {
      header: 'Celular', key: 'celular_conductor', sortable: true,
      render: r => <span className="text-slate-600 text-xs">{r.celular_conductor ?? '—'}</span>,
    },
    {
      header: 'Estado', key: 'estado', sortable: true,
      render: r => {
        const meta = ESTADO_CORREO_LABELS[r.estado] ?? { label: r.estado, cls: 'bg-slate-100 text-slate-600' };
        return (
          <div>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
            {r.sent_at && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                {new Date(r.sent_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: 'Acciones', key: 'id',
      render: r => {
        const correo = r.conf_email_actual ?? r.confeccionista_email;
        const isSending  = sending  === r.id;
        const isUpdating = updating === r.id;
        return (
          <div className="flex gap-1.5 flex-wrap">
            {r.estado === 'pendiente' && (
              <>
                <button onClick={() => handleSend(r)} disabled={isSending || !correo}
                  title={!correo ? 'Sin correo registrado' : 'Enviar correo'}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1">
                  {isSending
                    ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                      </svg>}
                  Enviar
                </button>
                <button onClick={() => handleUpdateEstado(r, 'cancelado')} disabled={isUpdating}
                  className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100 disabled:opacity-40 transition">
                  Cancelar
                </button>
              </>
            )}
            {r.estado === 'cancelado' && (
              <button onClick={() => handleUpdateEstado(r, 'pendiente')} disabled={isUpdating}
                className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-40 transition">
                Reactivar
              </button>
            )}
            {r.estado === 'enviado' && (
              <span className="text-[11px] text-emerald-600 font-bold">✓ Entregado</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1">
          {(['pendiente', 'enviado', 'cancelado', 'todos'] as const).map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${filtroEstado === e ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {e === 'todos' ? 'Todos' : ESTADO_CORREO_LABELS[e]?.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs font-bold text-slate-500">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <label className="text-xs font-bold text-slate-500">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <button onClick={load} disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition disabled:opacity-50">
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      <DataTable
        data={rows}
        columns={correosColumns}
        loading={loading}
        searchPlaceholder="Buscar confeccionista, placa, referencia..."
        excelFileName="envio_correos_confeccionistas.xlsx"
        excelSheetName="Correos"
      />
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
          { key: 'correos',    label: 'Envío de Correos' },
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
      {tab === 'correos'    && <CorreosTab user={user} />}
    </div>
  );
}
