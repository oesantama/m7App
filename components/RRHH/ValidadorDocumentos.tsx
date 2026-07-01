import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Plus, Pencil, Trash2, ExternalLink, CheckCircle2, XCircle, AlertCircle, Loader2, FileText, Users, Car, Settings } from 'lucide-react';
import { api, API_URL } from '../../services/api';

// Convierte link relativo /api/... en URL absoluta del backend
function resolveLink(link: string): string {
    if (!link) return '';
    if (link.startsWith('/api/')) return API_URL.replace('/api', '') + link;
    return link;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type EntityType = 'tercero' | 'placa';

interface ValidationSource {
    id: string;
    name: string;
    url: string;
    entity_type: EntityType | 'ambos';
    file_name: string;
    is_active: boolean;
    description: string;
    requires_doc_type: boolean;
    doc_type_options: string[];
}

interface ValidationRecord {
    id: number;
    entity_type: EntityType;
    entity_id: string;
    entity_name: string;
    source_id: string;
    source_name: string;
    file_name: string;
    status: 'found' | 'not_found' | 'error';
    drive_path: string;
    drive_link: string;
    result_summary: string;
    validated_at: string;
    validated_by: string;
}

interface ValidationEntry {
    id: string;
    name: string;
}

interface RunResult {
    source_id: string;
    source_name: string;
    status: 'found' | 'not_found' | 'error';
    summary: string;
    drive_link: string;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
    tercero: 'Tercero (Cédula)',
    placa: 'Vehículo (Placa)',
    ambos: 'Ambos',
};

const STATUS_CONFIG = {
    found:     { icon: AlertCircle,    color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200',  label: 'ENCONTRADO en lista' },
    not_found: { icon: CheckCircle2,   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'No sancionado' },
    error:     { icon: XCircle,        color: 'text-red-500',    bg: 'bg-red-50 border-red-200',      label: 'Error' },
};

// ─────────────────────────────────────────────
// Subcomponent: SourceFormModal
// ─────────────────────────────────────────────
interface SourceFormProps {
    initial?: ValidationSource | null;
    onSave: (data: Omit<ValidationSource, 'created_at' | 'updated_at'>) => Promise<void>;
    onClose: () => void;
}

const SourceFormModal: React.FC<SourceFormProps> = ({ initial, onSave, onClose }) => {
    const [form, setForm] = useState({
        id: initial?.id || '',
        name: initial?.name || '',
        url: initial?.url || '',
        entity_type: (initial?.entity_type || 'tercero') as ValidationSource['entity_type'],
        file_name: initial?.file_name || '',
        description: initial?.description || '',
        is_active: initial?.is_active !== false,
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try { await onSave(form); } finally { setSaving(false); }
    };

    const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
            <input
                type={type}
                value={String(form[key])}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                disabled={key === 'id' && !!initial}
                required={['id','name','url','file_name'].includes(key)}
            />
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-black text-slate-800 text-lg">{initial ? 'Editar Fuente' : 'Nueva Fuente de Validación'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        {field('ID (clave única)', 'id', 'text', 'ej: ofac, runt, simit')}
                        {field('Nombre', 'name', 'text', 'ej: OFAC Sanctions List')}
                    </div>
                    {field('URL del portal', 'url', 'url', 'https://...')}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Aplica a</label>
                            <select
                                value={form.entity_type}
                                onChange={e => setForm(p => ({ ...p, entity_type: e.target.value as any }))}
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                <option value="tercero">Terceros (Cédula)</option>
                                <option value="placa">Vehículos (Placa)</option>
                                <option value="ambos">Ambos</option>
                            </select>
                        </div>
                        {field('Nombre del archivo PDF', 'file_name', 'text', 'ej: ofac.pdf')}
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Descripción</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                            rows={2}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="Descripción de qué verifica esta fuente..."
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                            className="w-4 h-4 accent-indigo-600" />
                        <span className="text-sm text-slate-700 font-medium">Fuente activa</span>
                    </label>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2 text-sm font-semibold hover:bg-slate-50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// Subcomponent: RunResultCard
// ─────────────────────────────────────────────
const RunResultCard: React.FC<{ result: RunResult }> = ({ result }) => {
    const cfg = STATUS_CONFIG[result.status];
    const Icon = cfg.icon;
    return (
        <div className={`border rounded-xl p-4 flex flex-col gap-2 ${cfg.bg}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon size={18} className={cfg.color} />
                    <span className="font-bold text-slate-800 text-sm">{result.source_name}</span>
                </div>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${cfg.color} bg-white border ${cfg.bg.split(' ')[1]}`}>
                    {cfg.label}
                </span>
            </div>
            <p className="text-xs text-slate-600 font-mono">{result.summary}</p>
            {result.drive_link && (
                <a href={resolveLink(result.drive_link)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline w-fit">
                    <FileText size={12} /> Ver PDF {result.drive_link.startsWith('/api/') ? '(local)' : 'en Drive'} <ExternalLink size={10} />
                </a>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// Tab: Validar Terceros
// ─────────────────────────────────────────────
const TabTerceros: React.FC<{ sources: ValidationSource[] }> = ({ sources }) => {
    const activeSources = sources.filter(s => s.is_active && (s.entity_type === 'tercero' || s.entity_type === 'ambos'));

    const [entries, setEntries] = useState<ValidationEntry[]>([{ id: '', name: '' }]);
    const [selectedSources, setSelectedSources] = useState<string[]>(activeSources.map(s => s.id));
    const [docType, setDocType] = useState<string>('Cédula de ciudadanía');
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<{ entry: ValidationEntry; results: RunResult[] }[]>([]);
    const [history, setHistory] = useState<ValidationRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Fuentes seleccionadas que requieren tipo de documento
    const docTypeOptions = activeSources
        .filter(s => selectedSources.includes(s.id) && s.requires_doc_type && s.doc_type_options?.length > 0)
        .flatMap(s => s.doc_type_options || [])
        .filter((v, i, a) => a.indexOf(v) === i); // únicos
    const needsDocType = docTypeOptions.length > 0;

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const data = await api.validationGetRecords({ entity_type: 'tercero', limit: 30 });
            setHistory(data);
        } catch { /* silent */ } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => { loadHistory(); }, [loadHistory]);
    useEffect(() => {
        setSelectedSources(activeSources.map(s => s.id));
    }, [sources]);

    const addEntry = () => setEntries(p => [...p, { id: '', name: '' }]);
    const removeEntry = (i: number) => setEntries(p => p.filter((_, idx) => idx !== i));
    const updateEntry = (i: number, field: 'id' | 'name', value: string) =>
        setEntries(p => p.map((e, idx) => idx === i ? { ...e, [field]: value } : e));

    const handleRun = async () => {
        const valid = entries.filter(e => e.id.trim() && e.name.trim());
        if (valid.length === 0) { toast.error('Ingrese al menos una cédula con nombre'); return; }
        if (selectedSources.length === 0) { toast.error('Seleccione al menos una fuente de validación'); return; }

        setRunning(true);
        setResults([]);
        const allResults: { entry: ValidationEntry; results: RunResult[] }[] = [];

        for (const entry of valid) {
            try {
                toast.info(`Validando cédula ${entry.id}...`);
                const res = await api.validationRun({
                    entity_type: 'tercero',
                    entity_id: entry.id.trim(),
                    entity_name: entry.name.trim().toLowerCase(),
                    source_ids: selectedSources,
                    doc_type: needsDocType ? docType : undefined,
                });
                allResults.push({ entry, results: res.results });
            } catch (err: any) {
                allResults.push({ entry, results: [{ source_id: 'error', source_name: 'Error', status: 'error', summary: err.message, drive_link: '' }] });
            }
        }

        setResults(allResults);
        setRunning(false);
        toast.success('Validación completada');
        loadHistory();
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Formulario */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Users size={18} className="text-indigo-600" />
                    <h3 className="font-black text-slate-800">Cédulas a validar</h3>
                    <span className="text-xs text-slate-400 ml-1">— ingrese nombre completo en minúsculas para el nombre de la carpeta en Drive</span>
                </div>
                <div className="flex flex-col gap-3">
                    {entries.map((entry, i) => (
                        <div key={i} className="flex gap-3 items-center">
                            <input
                                type="text"
                                value={entry.id}
                                onChange={e => updateEntry(i, 'id', e.target.value)}
                                placeholder="Cédula / NIT"
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
                            />
                            <input
                                type="text"
                                value={entry.name}
                                onChange={e => updateEntry(i, 'name', e.target.value)}
                                placeholder="Nombre completo (para carpeta Drive)"
                                className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            {entries.length > 1 && (
                                <button onClick={() => removeEntry(i)} className="text-red-400 hover:text-red-600 p-1">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                    <button onClick={addEntry} className="flex items-center gap-2 text-indigo-600 text-sm font-semibold hover:underline w-fit">
                        <Plus size={14} /> Agregar otra cédula
                    </button>
                </div>

                {/* Tipo de documento (aparece cuando alguna fuente seleccionada lo requiere) */}
                {needsDocType && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tipo de documento</p>
                        <select
                            value={docType}
                            onChange={e => setDocType(e.target.value)}
                            className="border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64"
                        >
                            {docTypeOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Requerido por una o más fuentes seleccionadas</p>
                    </div>
                )}

                {/* Fuentes */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Fuentes a consultar</p>
                    {activeSources.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No hay fuentes activas para terceros. Configure en la pestaña "Fuentes".</p>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {activeSources.map(src => (
                                <label key={src.id} className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300">
                                    <input
                                        type="checkbox"
                                        checked={selectedSources.includes(src.id)}
                                        onChange={e => setSelectedSources(p => e.target.checked ? [...p, src.id] : p.filter(x => x !== src.id))}
                                        className="accent-indigo-600"
                                    />
                                    <span className="text-sm font-semibold text-slate-700">{src.name}</span>
                                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-500">
                                        <ExternalLink size={12} />
                                    </a>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        onClick={handleRun}
                        disabled={running || activeSources.length === 0}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 font-bold text-sm shadow-sm transition-colors disabled:opacity-50"
                    >
                        {running ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        {running ? 'Validando...' : 'Validar ahora'}
                    </button>
                </div>
            </div>

            {/* Resultados de la última ejecución */}
            {results.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-emerald-600" /> Resultados
                    </h3>
                    <div className="flex flex-col gap-5">
                        {results.map(({ entry, results: res }, i) => (
                            <div key={i}>
                                <div className="text-sm font-bold text-slate-700 mb-2">
                                    {entry.id} — {entry.name}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {res.map(r => <RunResultCard key={r.source_id} result={r} />)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Historial */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                        <FileText size={18} className="text-slate-500" /> Historial de validaciones
                    </h3>
                    <button onClick={loadHistory} className="text-xs text-indigo-600 font-semibold hover:underline">
                        Actualizar
                    </button>
                </div>
                {loadingHistory ? (
                    <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
                ) : history.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-6">No hay validaciones registradas aún.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    {['Cédula', 'Nombre', 'Fuente', 'Estado', 'Resultado', 'Fecha', 'PDF'].map(h => (
                                        <th key={h} className="text-left py-2 px-3 font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(r => {
                                    const cfg = STATUS_CONFIG[r.status];
                                    const Icon = cfg.icon;
                                    return (
                                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="py-2 px-3 font-mono font-bold text-slate-800">{r.entity_id}</td>
                                            <td className="py-2 px-3 text-slate-600">{r.entity_name}</td>
                                            <td className="py-2 px-3 text-slate-600">{r.source_name}</td>
                                            <td className="py-2 px-3">
                                                <span className={`flex items-center gap-1 font-bold ${cfg.color}`}>
                                                    <Icon size={12} /> {cfg.label}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate">{r.result_summary}</td>
                                            <td className="py-2 px-3 text-slate-500">
                                                {new Date(r.validated_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="py-2 px-3">
                                                {r.drive_link ? (
                                                    <a href={resolveLink(r.drive_link)} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-indigo-600 font-semibold hover:underline">
                                                        <FileText size={12} /> PDF <ExternalLink size={10} />
                                                    </a>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// Tab: Maestras Fuentes (CRUD)
// ─────────────────────────────────────────────
const TabFuentes: React.FC<{ sources: ValidationSource[]; onRefresh: () => void }> = ({ sources, onRefresh }) => {
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<ValidationSource | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleSave = async (data: any) => {
        try {
            if (editing) {
                await api.validationUpdateSource(editing.id, data);
                toast.success('Fuente actualizada');
            } else {
                await api.validationCreateSource(data);
                toast.success('Fuente creada');
            }
            setShowForm(false);
            setEditing(null);
            onRefresh();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(`¿Eliminar fuente "${id}"? Los registros históricos quedarán sin referencia.`)) return;
        setDeleting(id);
        try {
            await api.validationDeleteSource(id);
            toast.success('Fuente eliminada');
            onRefresh();
        } catch (err: any) {
            toast.error(err.message || 'Error al eliminar');
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-black text-slate-800 text-lg">Fuentes de Validación</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Define qué portales se consultan y para qué tipo de entidad aplica cada uno.</p>
                </div>
                <button
                    onClick={() => { setEditing(null); setShowForm(true); }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-bold shadow-sm transition-colors"
                >
                    <Plus size={16} /> Nueva fuente
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sources.map(src => (
                    <div key={src.id} className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col gap-2 ${src.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="font-black text-slate-800">{src.name}</span>
                                    {src.is_active
                                        ? <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">ACTIVA</span>
                                        : <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">INACTIVA</span>
                                    }
                                </div>
                                <span className="text-xs text-slate-400 font-mono">{src.id}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => { setEditing(src); setShowForm(true); }}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                                    <Pencil size={14} />
                                </button>
                                <button onClick={() => handleDelete(src.id)} disabled={deleting === src.id}
                                    className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                                    {deleting === src.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">{src.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                                {ENTITY_TYPE_LABEL[src.entity_type]}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">{src.file_name}</span>
                            <a href={src.url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-indigo-500 flex items-center gap-1 hover:underline ml-auto">
                                Ver portal <ExternalLink size={10} />
                            </a>
                        </div>
                    </div>
                ))}
                {sources.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-slate-400 italic">
                        No hay fuentes configuradas. Cree la primera con el botón "Nueva fuente".
                    </div>
                )}
            </div>

            {showForm && (
                <SourceFormModal
                    initial={editing}
                    onSave={handleSave}
                    onClose={() => { setShowForm(false); setEditing(null); }}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
type TabKey = 'terceros' | 'placas' | 'fuentes';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'terceros', label: 'Terceros',  icon: <Users size={15} /> },
    { key: 'placas',   label: 'Placas',    icon: <Car size={15} /> },
    { key: 'fuentes',  label: 'Fuentes',   icon: <Settings size={15} /> },
];

const ValidadorDocumentos: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabKey>('terceros');
    const [sources, setSources] = useState<ValidationSource[]>([]);

    const loadSources = useCallback(async () => {
        try {
            const data = await api.validationGetSources();
            setSources(data);
        } catch (err: any) {
            toast.error('Error cargando fuentes: ' + err.message);
        }
    }, []);

    useEffect(() => { loadSources(); }, [loadSources]);

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                    <ShieldCheck size={20} className="text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Validador de Documentos</h1>
                    <p className="text-xs text-slate-400">Consulta de personas y vehículos en listas de control y sanciones</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-6 w-fit shadow-sm">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                            activeTab === tab.key
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {activeTab === 'terceros' && <TabTerceros sources={sources} />}
            {activeTab === 'placas'   && (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
                    <Car size={40} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-semibold">Validación de placas — próximamente</p>
                    <p className="text-xs text-slate-400 mt-1">Configure las fuentes para "Vehículos" en la pestaña Fuentes para habilitar esta sección.</p>
                </div>
            )}
            {activeTab === 'fuentes'  && <TabFuentes sources={sources} onRefresh={loadSources} />}
        </div>
    );
};

export default ValidadorDocumentos;
