import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { API_URL, fetchJson } from '../services/api';

interface ManualEntry {
  name: string;
  filename: string;
  hasPdf: boolean;
  updatedAt: string;
  sourceFile: string | null;
  size: number;
}

interface ManualContent {
  name: string;
  content: string;
  updatedAt: string;
  hasPdf: boolean;
}

interface ComponentEntry {
  name: string;
  relativePath: string;
  isTopLevel: boolean;
  hasManual: boolean;
  hasPdf: boolean;
  updatedAt: string | null;
}

interface ProgressState {
  running: boolean;
  done: number;
  total: number;
  current: string;
  errors: string[];
  startedAt: string | null;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  const inlineRender = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    return parts.filter(Boolean).map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="bg-slate-100 text-emerald-700 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const isTableSep = (s: string) => /^\|[-| :]+\|/.test(s);

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={k++} className="text-2xl font-black text-slate-900 border-b-2 border-emerald-500 pb-3 mb-4 mt-2">
          {inlineRender(line.slice(2))}
        </h1>
      );
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={k++} className="text-lg font-bold text-blue-800 border-l-4 border-emerald-500 pl-3 mt-6 mb-3">
          {inlineRender(line.slice(3))}
        </h2>
      );
      i++; continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={k++} className="text-base font-semibold text-slate-700 mt-4 mb-2">
          {inlineRender(line.slice(4))}
        </h3>
      );
      i++; continue;
    }
    if (line.trim() === '---') {
      elements.push(<hr key={k++} className="border-slate-200 my-5" />);
      i++; continue;
    }
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={k++} className="border-l-4 border-emerald-400 bg-emerald-50 pl-4 py-2 pr-2 my-3 rounded-r text-sm text-emerald-900">
          {inlineRender(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={k++} className="bg-slate-900 text-emerald-300 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono leading-relaxed">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++; continue;
    }
    if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = line.split('|').filter(c => c.trim()).map(c => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter(c => c.trim()).map(c => c.trim()));
        i++;
      }
      elements.push(
        <div key={k++} className="overflow-x-auto my-4 rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            {headers.some(h => h.length > 0) && (
              <thead>
                <tr className="bg-slate-800 text-white">
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wide">
                      {inlineRender(h)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 border-b border-slate-100 text-slate-700">
                      {inlineRender(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={k++} className="list-none my-2 space-y-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-2 text-slate-700 text-sm">
              <span className="text-emerald-500 mt-0.5 flex-shrink-0">▸</span>
              <span>{inlineRender(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={k++} className="my-2 space-y-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-3 text-slate-700 text-sm">
              <span className="text-emerald-600 font-bold flex-shrink-0 w-5 text-right">{ii + 1}.</span>
              <span>{inlineRender(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }
    if (line.startsWith('![')) { i++; continue; }
    if (line.trim() === '') {
      elements.push(<div key={k++} className="h-2" />);
      i++; continue;
    }
    elements.push(
      <p key={k++} className="text-slate-700 text-sm leading-relaxed my-1">
        {inlineRender(line)}
      </p>
    );
    i++;
  }

  return <div className="max-w-none">{elements}</div>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Modal de componentes ──────────────────────────────────────────────────────

function ComponentsModal({
  onClose,
  onGenerate,
  generatingOne,
}: {
  onClose: () => void;
  onGenerate: (relativePath: string, name: string) => void;
  generatingOne: string | null;
}) {
  const [components, setComponents] = useState<ComponentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');

  useEffect(() => {
    fetchJson(`${API_URL}/helpdesk/components`)
      .then(d => setComponents(d.components || []))
      .catch(() => toast.error('Error cargando componentes'))
      .finally(() => setLoading(false));
  }, [generatingOne]); // recargar cuando termine una generación

  const filtered = components.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true :
      filter === 'pending' ? !c.hasManual :
      c.hasManual;
    return matchSearch && matchFilter;
  });

  const withManual = components.filter(c => c.hasManual).length;
  const pending = components.length - withManual;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-black text-slate-900 text-lg">Gestionar componentes</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {withManual} con manual · <span className="text-amber-600 font-semibold">{pending} pendientes</span> · {components.length} total
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-slate-100 flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Buscar componente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {(['all', 'pending', 'done'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'pending' ? `Sin manual (${pending})` : `Con manual (${withManual})`}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="w-6 h-6 text-emerald-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">Sin resultados</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(c => (
                <div
                  key={c.relativePath}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {/* Status icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    c.hasManual ? 'bg-emerald-50' : 'bg-amber-50'
                  }`}>
                    {c.hasManual ? (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {c.relativePath}
                      {c.updatedAt && (
                        <> · <span className="text-emerald-600">{formatDateTime(c.updatedAt)}</span></>
                      )}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!c.isTopLevel && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">sub</span>
                    )}
                    {c.hasPdf && (
                      <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">PDF</span>
                    )}
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={() => onGenerate(c.relativePath, c.name)}
                    disabled={generatingOne === c.name}
                    className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ${
                      generatingOne === c.name
                        ? 'bg-slate-100 text-slate-400'
                        : c.hasManual
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    }`}
                  >
                    {generatingOne === c.name ? (
                      <><Spinner className="w-3 h-3" /> Generando...</>
                    ) : c.hasManual ? (
                      'Regenerar'
                    ) : (
                      'Generar'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
          Mostrando {filtered.length} de {components.length} componentes
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const HelpDesk: React.FC = () => {
  const [manuals, setManuals] = useState<ManualEntry[]>([]);
  const [selected, setSelected] = useState<ManualContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [showComponents, setShowComponents] = useState(false);
  const [generatingOne, setGeneratingOne] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadManuals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`${API_URL}/helpdesk/manuals`);
      setManuals(data.manuals || []);
    } catch {
      toast.error('No se pudieron cargar los manuales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadManuals(); }, [loadManuals]);

  // Polling de progreso cuando se está generando
  useEffect(() => {
    if (!generating) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const p = await fetchJson(`${API_URL}/helpdesk/progress`);
        setProgress(p);
        if (!p.running && p.total > 0 && p.done >= p.total) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setGenerating(false);
          setProgress(null);
          await loadManuals();
          const msg = p.errors.length > 0
            ? `Generación completa: ${p.done}/${p.total} manuales (${p.errors.length} errores)`
            : `Generación completa: ${p.done} manuales generados`;
          toast.success(msg);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [generating, loadManuals]);

  const openManual = async (name: string) => {
    setLoadingContent(true);
    try {
      const data = await fetchJson(`${API_URL}/helpdesk/manuals/${name}`);
      setSelected(data);
    } catch {
      toast.error('No se pudo cargar el manual');
    } finally {
      setLoadingContent(false);
    }
  };

  const downloadPdf = (name: string) => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/helpdesk/manuals/${name}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}-manual.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error('PDF no disponible para este manual'));
  };

  const generateAll = async () => {
    setGenerating(true);
    setProgress(null);
    try {
      const data = await fetchJson(`${API_URL}/helpdesk/generate-all`, { method: 'POST' });
      if (data.success === false) {
        toast.info(data.message || 'Ya hay una generación en curso');
        setGenerating(false);
        return;
      }
      toast.info(`Generación iniciada: ${data.total} componentes en cola`);
    } catch {
      toast.error('Error al iniciar la generación');
      setGenerating(false);
    }
  };

  const generateOne = async (relativePath: string, name: string) => {
    setGeneratingOne(name);
    try {
      await fetchJson(`${API_URL}/helpdesk/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentPath: relativePath }),
      });
      toast.success(`Manual de ${name} generado`);
      await loadManuals();
    } catch {
      toast.error(`Error generando manual de ${name}`);
    } finally {
      setGeneratingOne(null);
    }
  };

  const regenerateOne = async (manual: ManualEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!manual.sourceFile) {
      toast.error('No se conoce el archivo fuente de este manual');
      return;
    }
    setGeneratingOne(manual.name);
    try {
      await fetchJson(`${API_URL}/helpdesk/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentPath: manual.sourceFile }),
      });
      toast.success(`Manual de ${manual.name} regenerado`);
      await loadManuals();
    } catch {
      toast.error(`Error regenerando ${manual.name}`);
    } finally {
      setGeneratingOne(null);
    }
  };

  const filtered = manuals.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Vista detalle ───────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-500 flex-1">
            Manual: <span className="font-semibold text-slate-700">{selected.name}</span>
          </span>
          <span className="text-xs text-slate-400">
            Actualizado: {formatDateTime(selected.updatedAt)}
          </span>
          {selected.hasPdf && (
            <button
              onClick={() => downloadPdf(selected.name)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar PDF
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-6">
            <MarkdownRenderer content={selected.content} />
          </div>
        </div>
      </div>
    );
  }

  // ── Lista de manuales ───────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-slate-950 px-8 py-5 text-white">
        <div className="flex items-start justify-between max-w-5xl mx-auto gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
                <svg className="w-5 h-5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">Mesa de Ayuda</h1>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">HelpDesk — OrbitM7</p>
              </div>
            </div>

            {/* Progress bar */}
            {generating && progress && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>
                    Generando{progress.current ? `: ${progress.current}` : '...'}
                  </span>
                  <span className="font-mono text-emerald-400">
                    {progress.done}/{progress.total}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                  />
                </div>
                {progress.errors.length > 0 && (
                  <p className="text-xs text-red-400 mt-1">{progress.errors.length} error(es)</p>
                )}
              </div>
            )}
            {generating && !progress && (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <Spinner className="w-3.5 h-3.5 text-emerald-500" />
                Iniciando generación...
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-start gap-2 flex-shrink-0">
            <button
              onClick={() => setShowComponents(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Gestionar
            </button>
            <button
              onClick={generateAll}
              disabled={generating}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-900 font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
            >
              {generating ? (
                <Spinner className="w-4 h-4 text-slate-700" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {generating ? 'Generando...' : 'Regenerar todos'}
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar manual por nombre de módulo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-slate-50"
            />
          </div>
          {!loading && (
            <p className="text-xs text-slate-400 mt-2">
              {filtered.length} manuales disponibles
              {search && ` · filtrando por "${search}"`}
            </p>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Spinner className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Cargando manuales...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <p className="text-slate-600 font-semibold">No hay manuales disponibles</p>
              <p className="text-slate-400 text-sm mt-1">
                {search
                  ? 'No se encontraron resultados para la búsqueda.'
                  : 'Usa "Regenerar todos" para generar los manuales, o "Gestionar" para generar uno específico.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(manual => (
                <button
                  key={manual.name}
                  onClick={() => openManual(manual.name)}
                  className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-500/10 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-50 group-hover:bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      {manual.hasPdf && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full w-fit">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          PDF
                        </span>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm group-hover:text-slate-900 mb-1 leading-tight">
                    {manual.name.replace(/([A-Z])/g, ' $1').trim()}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Actualizado: {formatDateTime(manual.updatedAt)}
                  </p>

                  {/* Regenerar button (only if sourceFile known) */}
                  {manual.sourceFile && (
                    <div
                      className="mt-3 pt-3 border-t border-slate-100 flex justify-end"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={e => regenerateOne(manual, e)}
                        disabled={generatingOne === manual.name}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {generatingOne === manual.name ? (
                          <><Spinner className="w-3 h-3" /> Generando...</>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Regenerar
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {loadingContent && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-4 shadow-2xl">
            <Spinner className="w-6 h-6 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700">Cargando manual...</span>
          </div>
        </div>
      )}

      {/* Components modal */}
      {showComponents && (
        <ComponentsModal
          onClose={() => setShowComponents(false)}
          onGenerate={generateOne}
          generatingOne={generatingOne}
        />
      )}
    </div>
  );
};

export default HelpDesk;
