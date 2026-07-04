/**
 * HVMaestras.tsx
 * Parametrización completa del módulo Hojas de Vida:
 *   · Tab 1 — Tipos de Documento (hv_tipos_documento_req)
 *   · Tab 2 — Tipos de Tercero  (hv_tipos_tercero)
 *   · Tab 3 — Campos Formulario (hv_campos_formulario)
 */

import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { API_URL } from '../../services/api';

const API = `${API_URL}/hv`;

// ── Interfaces ──────────────────────────────────────────────────────────────

interface TipoTercero {
    id?: number;
    codigo: string;
    nombre: string;
    descripcion?: string;
    icono: string;
    color: string;
    activo: boolean;
    orden: number;
}

interface TipoDocumento {
    id?: number;
    tipo_entidad: string;
    tipo_tercero_id: number | null;
    tipo_tercero_nombre?: string;
    nombre: string;
    nombre_archivo: string;
    descripcion?: string;
    obligatorio: boolean;
    acepta_vencimiento: boolean;
    dias_alerta_1: number;
    dias_alerta_2: number;
    dias_alerta_3: number;
    dias_alerta_4: number;
    orden: number;
    activo: boolean;
    formato_plantilla_path?: string | null;
    formato_nombre_archivo?: string | null;
}

interface CampoFormulario {
    id?: number;
    tipo_entidad: string;
    tipo_tercero_id: number | null;
    tipo_tercero_nombre?: string;
    nombre_campo: string;
    label: string;
    placeholder?: string;
    tipo_input: string;
    opciones?: string | null;
    obligatorio: boolean;
    validacion_regex?: string;
    mensaje_error?: string;
    orden: number;
    seccion: string;
    activo: boolean;
}

type ActiveTab = 'documentos' | 'terceros' | 'campos';

const COLORES = ['blue','green','orange','purple','red','indigo','teal','pink','amber','cyan'];
const ICONOS  = ['user','steering-wheel','user-check','key','building','truck','shield','file','users','star'];
const TIPO_INPUT_OPS = ['text','email','tel','number','date','select','textarea','checkbox'];
const SECCIONES = ['general','personal','salud','licencia','bancaria','datos','documentos','vehiculo'];

const COLOR_BADGE: Record<string, string> = {
    blue:'bg-blue-100 text-blue-700', green:'bg-green-100 text-green-700',
    orange:'bg-orange-100 text-orange-700', purple:'bg-purple-100 text-purple-700',
    red:'bg-red-100 text-red-700', indigo:'bg-indigo-100 text-indigo-700',
    teal:'bg-teal-100 text-teal-700', pink:'bg-pink-100 text-pink-700',
    amber:'bg-amber-100 text-amber-700', cyan:'bg-cyan-100 text-cyan-700',
};

// ── Componente principal ─────────────────────────────────────────────────────

const HVMaestras: React.FC = () => {
    const [tab, setTab] = useState<ActiveTab>('documentos');
    const [tipos, setTipos]           = useState<TipoDocumento[]>([]);
    const [terceros, setTerceros]     = useState<TipoTercero[]>([]);
    const [campos, setCampos]         = useState<CampoFormulario[]>([]);
    const [loading, setLoading]       = useState(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    useEffect(() => { cargar(); }, []);

    const cargar = async () => {
        setLoading(true);
        try {
            const res  = await fetch(`${API}/maestras`, { headers });
            const data = await res.json();
            setTerceros(data.tipos_tercero   || []);
            setTipos(data.tipos_documento    || []);
            setCampos(data.campos_formulario || []);
            return data;
        } catch { toast.error('Error al cargar maestras'); }
        finally  { setLoading(false); }
    };

    const TABS: { key: ActiveTab; label: string; count: number }[] = [
        { key: 'documentos', label: 'Tipos de Documento', count: tipos.length },
        { key: 'terceros',   label: 'Tipos de Tercero',   count: terceros.length },
        { key: 'campos',     label: 'Campos Formulario',  count: campos.length },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Parametrización DMS</h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                            tab === t.key ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        {t.label}
                        <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab===t.key ? 'bg-blue-100 text-blue-700':'bg-gray-200 text-gray-600'}`}>
                            {t.count}
                        </span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center h-40 items-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {tab === 'documentos' && (
                        <TabTiposDocumento
                            tipos={tipos} terceros={terceros} token={token!} API={API}
                            onRefresh={cargar}
                        />
                    )}
                    {tab === 'terceros' && (
                        <TabTiposTercero
                            terceros={terceros} token={token!} API={API}
                            onRefresh={cargar}
                        />
                    )}
                    {tab === 'campos' && (
                        <TabCamposFormulario
                            campos={campos} terceros={terceros} token={token!} API={API}
                            onRefresh={cargar}
                        />
                    )}
                </>
            )}
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — TIPOS DE DOCUMENTO
// ══════════════════════════════════════════════════════════════════════════════

const TabTiposDocumento: React.FC<{
    tipos: TipoDocumento[]; terceros: TipoTercero[];
    token: string; API: string; onRefresh: () => Promise<any>;
}> = ({ tipos, terceros, token, API, onRefresh }) => {
    const [editando, setEditando]         = useState<TipoDocumento | null>(null);
    const [saving, setSaving]             = useState(false);
    const [filtroTipo, setFiltroTipo]     = useState('');
    const [subiendoFormato, setSubiendo]  = useState<number | null>(null);
    const formatoInputRef = useRef<HTMLInputElement>(null);
    const formatoTipoIdRef = useRef<number | null>(null);
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const guardar = async () => {
        if (!editando?.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${API}/maestras/tipos-documento`, {
                method: 'PUT', headers: h, body: JSON.stringify(editando),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Guardado correctamente');
            setEditando(null);
            onRefresh();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const subirFormato = async (tipoDocId: number, file: File) => {
        setSubiendo(tipoDocId);
        try {
            const fd = new FormData();
            fd.append('archivo', file);
            const res = await fetch(`${API}/maestras/tipos-documento/${tipoDocId}/formato`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Plantilla subida');
            const data = await onRefresh();
            if (editando?.id === tipoDocId && data) {
                const upd = (data.tipos_documento || []).find((t: TipoDocumento) => t.id === tipoDocId);
                if (upd) setEditando(upd);
            }
        } catch (e: any) { toast.error(e.message); }
        finally { setSubiendo(null); }
    };

    const eliminarFormato = async (tipoDocId: number) => {
        if (!confirm('¿Eliminar la plantilla?')) return;
        try {
            const res = await fetch(`${API}/maestras/tipos-documento/${tipoDocId}/formato`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Plantilla eliminada');
            const data = await onRefresh();
            if (editando?.id === tipoDocId && data) {
                const upd = (data.tipos_documento || []).find((t: TipoDocumento) => t.id === tipoDocId);
                if (upd) setEditando(upd);
            }
        } catch (e: any) { toast.error(e.message); }
    };

    const nuevoTipo = () => setEditando({
        tipo_entidad: 'tercero', tipo_tercero_id: null, nombre: '', nombre_archivo: '',
        descripcion: '', obligatorio: true, acepta_vencimiento: false,
        dias_alerta_1: 90, dias_alerta_2: 30, dias_alerta_3: 15, dias_alerta_4: 7,
        orden: 0, activo: true,
    });

    const filtrados = filtroTipo
        ? tipos.filter(t => t.tipo_entidad === filtroTipo.split(':')[0] &&
            (filtroTipo.split(':')[1] ? String(t.tipo_tercero_id) === filtroTipo.split(':')[1] : !t.tipo_tercero_id))
        : tipos;

    return (
        <>
            <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap">
                    {[{ k: '', l: 'Todos' }, { k: 'vehiculo:', l: '🚗 Vehículos' }].map(f => (
                        <button key={f.k} onClick={() => setFiltroTipo(f.k)}
                            className={`px-3 py-1 rounded-lg text-xs border ${filtroTipo===f.k?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600'}`}>
                            {f.l}
                        </button>
                    ))}
                    {terceros.map(t => (
                        <button key={t.id} onClick={() => setFiltroTipo(`tercero:${t.id}`)}
                            className={`px-3 py-1 rounded-lg text-xs border ${filtroTipo===`tercero:${t.id}`?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600'}`}>
                            👤 {t.nombre}
                        </button>
                    ))}
                </div>
                <button onClick={nuevoTipo} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                    + Nuevo tipo
                </button>
            </div>

            <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Tipo</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Alertas</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-600">Oblig.</th>
                            <th className="px-4 py-3 text-center font-medium text-gray-600">Activo</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Plantilla</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filtrados.map(t => (
                            <tr key={t.id} className={`hover:bg-gray-50 ${!t.activo ? 'opacity-50' : ''}`}>
                                <td className="px-4 py-3">
                                    <p className="font-medium text-gray-800">{t.nombre}</p>
                                    {t.descripcion && <p className="text-xs text-gray-500 truncate max-w-[200px]">{t.descripcion}</p>}
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell text-gray-600 text-xs">
                                    {t.tipo_entidad === 'vehiculo' ? '🚗 Vehículo' : `👤 ${t.tipo_tercero_nombre || 'General'}`}
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                                    {t.acepta_vencimiento ? `${t.dias_alerta_1}/${t.dias_alerta_2}/${t.dias_alerta_3}/${t.dias_alerta_4}d` : <span className="text-gray-300">N/A</span>}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`text-xs font-bold ${t.obligatorio ? 'text-red-500' : 'text-gray-300'}`}>{t.obligatorio ? '✓' : '—'}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`text-sm ${t.activo ? 'text-green-500' : 'text-gray-300'}`}>{t.activo ? '●' : '○'}</span>
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                    {subiendoFormato === t.id ? (
                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                            <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block"/>Subiendo...
                                        </span>
                                    ) : t.formato_plantilla_path ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-green-600 font-medium truncate max-w-[120px]">📄 {t.formato_nombre_archivo}</span>
                                            <button onClick={() => { formatoTipoIdRef.current = t.id!; formatoInputRef.current?.click(); }} className="text-xs text-blue-600 hover:underline">Cambiar</button>
                                            <button onClick={() => eliminarFormato(t.id!)} className="text-xs text-red-500 hover:underline">✕</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => { formatoTipoIdRef.current = t.id!; formatoInputRef.current?.click(); }} className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50">
                                            + Subir plantilla
                                        </button>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => setEditando({ ...t })} className="text-xs text-blue-600 hover:underline">Editar</button>
                                </td>
                            </tr>
                        ))}
                        {filtrados.length === 0 && (
                            <tr><td colSpan={7} className="text-center text-gray-400 py-10">Sin resultados</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <input ref={formatoInputRef} type="file" accept=".pdf" className="hidden"
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file && formatoTipoIdRef.current) subirFormato(formatoTipoIdRef.current, file);
                    e.target.value = '';
                }}
            />

            {editando && (
                <Modal titulo={editando.id ? 'Editar tipo de documento' : 'Nuevo tipo de documento'} onClose={() => setEditando(null)}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-gray-600">Tipo de entidad</label>
                                <select value={editando.tipo_entidad} onChange={e => setEditando({ ...editando, tipo_entidad: e.target.value, tipo_tercero_id: null })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="tercero">Tercero</option>
                                    <option value="vehiculo">Vehículo</option>
                                </select>
                            </div>
                            {editando.tipo_entidad === 'tercero' && (
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Tipo de tercero</label>
                                    <select value={editando.tipo_tercero_id ?? ''} onChange={e => setEditando({ ...editando, tipo_tercero_id: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                        <option value="">Todos</option>
                                        {terceros.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <Campo label="Nombre del documento *">
                            <input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Licencia de conducción"/>
                        </Campo>
                        <Campo label="Nombre del archivo">
                            <input value={editando.nombre_archivo} onChange={e => setEditando({ ...editando, nombre_archivo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Licencia.pdf"/>
                        </Campo>
                        <Campo label="Descripción / instrucción">
                            <input value={editando.descripcion || ''} onChange={e => setEditando({ ...editando, descripcion: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Instrucción para el tercero"/>
                        </Campo>
                        <div className="flex gap-4 flex-wrap">
                            {[['obligatorio','Obligatorio'],['acepta_vencimiento','Tiene vencimiento'],['activo','Activo']].map(([k,l]) => (
                                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={(editando as any)[k]} onChange={e => setEditando({ ...editando, [k]: e.target.checked })}/>
                                    {l}
                                </label>
                            ))}
                        </div>
                        {editando.acepta_vencimiento && (
                            <Campo label="Alertas de vencimiento (días antes)">
                                <div className="grid grid-cols-4 gap-2">
                                    {['dias_alerta_1','dias_alerta_2','dias_alerta_3','dias_alerta_4'].map((k,i) => (
                                        <div key={k}>
                                            <p className="text-xs text-gray-500 mb-1">Alerta {i+1}</p>
                                            <input type="number" value={(editando as any)[k]} onChange={e => setEditando({ ...editando, [k]: Number(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                                        </div>
                                    ))}
                                </div>
                            </Campo>
                        )}
                        <Campo label="Orden de visualización">
                            <input type="number" value={editando.orden} onChange={e => setEditando({ ...editando, orden: Number(e.target.value) })} className="input-sm w-24"/>
                        </Campo>
                        {editando.id && (
                            <div className="border-t pt-4">
                                <label className="label-xs block mb-2">Plantilla descargable (formato en blanco para firmar)</label>
                                {subiendoFormato === editando.id ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block"/>Subiendo...
                                    </div>
                                ) : editando.formato_plantilla_path ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold text-amber-800">📄 {editando.formato_nombre_archivo}</p>
                                            <a href={`${API_URL}/public/hv/formato/${editando.id}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver / descargar</a>
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            <button onClick={() => { formatoTipoIdRef.current = editando.id!; formatoInputRef.current?.click(); }} className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50">Cambiar PDF</button>
                                            <button onClick={() => eliminarFormato(editando.id!)} className="text-xs text-red-500 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50">Eliminar</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => { formatoTipoIdRef.current = editando.id!; formatoInputRef.current?.click(); }}
                                        className="w-full border-2 border-dashed border-amber-300 rounded-lg py-3 text-sm text-amber-700 hover:bg-amber-50 flex items-center justify-center gap-2">
                                        ⬆️ Subir formato PDF (para que el tercero descargue, firme y suba)
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <BotonesModal onCancel={() => setEditando(null)} onSave={guardar} saving={saving}/>
                </Modal>
            )}
        </>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — TIPOS DE TERCERO
// ══════════════════════════════════════════════════════════════════════════════

const TabTiposTercero: React.FC<{
    terceros: TipoTercero[]; token: string; API: string; onRefresh: () => void;
}> = ({ terceros, token, API, onRefresh }) => {
    const [editando, setEditando] = useState<TipoTercero | null>(null);
    const [saving, setSaving]     = useState(false);
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const nuevoTercero = () => setEditando({
        codigo: '', nombre: '', descripcion: '', icono: 'user', color: 'blue', activo: true, orden: 0,
    });

    const guardar = async () => {
        if (!editando?.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
        if (!editando?.codigo.trim()) { toast.error('El código es obligatorio'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${API}/maestras/tipos-tercero`, {
                method: 'PUT', headers: h, body: JSON.stringify(editando),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Guardado correctamente');
            setEditando(null);
            onRefresh();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    return (
        <>
            <div className="flex justify-end">
                <button onClick={nuevoTercero} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                    + Nuevo tipo de tercero
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {terceros.map(t => (
                    <div key={t.id} className={`bg-white border rounded-xl p-4 flex items-start gap-3 ${!t.activo ? 'opacity-50' : ''}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${COLOR_BADGE[t.color] || 'bg-gray-100 text-gray-600'}`}>
                            <span className="text-lg">👤</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-800 text-sm">{t.nombre}</p>
                                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${COLOR_BADGE[t.color] || 'bg-gray-100 text-gray-600'}`}>{t.color}</span>
                            </div>
                            <p className="text-xs text-gray-400 font-mono">{t.codigo}</p>
                            {t.descripcion && <p className="text-xs text-gray-500 mt-1 truncate">{t.descripcion}</p>}
                            <p className="text-xs text-gray-400 mt-1">Orden: {t.orden}</p>
                        </div>
                        <button onClick={() => setEditando({ ...t })} className="text-xs text-blue-600 hover:underline shrink-0">Editar</button>
                    </div>
                ))}
                {terceros.length === 0 && (
                    <div className="col-span-3 text-center text-gray-400 py-10">Sin tipos de tercero configurados</div>
                )}
            </div>

            {editando && (
                <Modal titulo={editando.id ? 'Editar tipo de tercero' : 'Nuevo tipo de tercero'} onClose={() => setEditando(null)}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Campo label="Código único *">
                                <input value={editando.codigo} onChange={e => setEditando({ ...editando, codigo: e.target.value.toLowerCase().replace(/\s/g,'_') })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="Ej: conductor"/>
                            </Campo>
                            <Campo label="Orden">
                                <input type="number" value={editando.orden} onChange={e => setEditando({ ...editando, orden: Number(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                            </Campo>
                        </div>
                        <Campo label="Nombre visible *">
                            <input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Conductor"/>
                        </Campo>
                        <Campo label="Descripción">
                            <input value={editando.descripcion || ''} onChange={e => setEditando({ ...editando, descripcion: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Descripción breve del rol"/>
                        </Campo>
                        <Campo label="Color">
                            <div className="flex gap-2 flex-wrap">
                                {COLORES.map(c => (
                                    <button key={c} onClick={() => setEditando({ ...editando, color: c })}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${COLOR_BADGE[c]} ${editando.color===c?'ring-2 ring-offset-1 ring-blue-500 scale-110':''}`}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </Campo>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={editando.activo} onChange={e => setEditando({ ...editando, activo: e.target.checked })}/>
                            Activo
                        </label>
                    </div>
                    <BotonesModal onCancel={() => setEditando(null)} onSave={guardar} saving={saving}/>
                </Modal>
            )}
        </>
    );
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — CAMPOS FORMULARIO
// ══════════════════════════════════════════════════════════════════════════════

const TabCamposFormulario: React.FC<{
    campos: CampoFormulario[]; terceros: TipoTercero[];
    token: string; API: string; onRefresh: () => void;
}> = ({ campos, terceros, token, API, onRefresh }) => {
    const [editando, setEditando]   = useState<CampoFormulario | null>(null);
    const [saving, setSaving]       = useState(false);
    const [filtro, setFiltro]       = useState('');
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const nuevoCampo = () => setEditando({
        tipo_entidad: 'tercero', tipo_tercero_id: null, nombre_campo: '', label: '',
        placeholder: '', tipo_input: 'text', opciones: null, obligatorio: true,
        validacion_regex: '', mensaje_error: '', orden: 0, seccion: 'general', activo: true,
    });

    const guardar = async () => {
        if (!editando?.nombre_campo.trim()) { toast.error('El nombre_campo es obligatorio'); return; }
        if (!editando?.label.trim())        { toast.error('El label es obligatorio'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${API}/maestras/campos-formulario`, {
                method: 'PUT', headers: h, body: JSON.stringify(editando),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Guardado correctamente');
            setEditando(null);
            onRefresh();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const desactivar = async (id: number) => {
        if (!confirm('¿Desactivar este campo?')) return;
        try {
            const res = await fetch(`${API}/maestras/campos-formulario/${id}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Campo desactivado');
            onRefresh();
        } catch (e: any) { toast.error(e.message); }
    };

    const gruposFiltrados = (() => {
        const todos = filtro
            ? campos.filter(c => c.tipo_entidad===filtro.split(':')[0] &&
                (filtro.split(':')[1] ? String(c.tipo_tercero_id)===filtro.split(':')[1] : !c.tipo_tercero_id))
            : campos;
        const grupos: Record<string, CampoFormulario[]> = {};
        for (const c of todos) {
            const key = c.tipo_entidad === 'vehiculo'
                ? '🚗 Vehículo'
                : `👤 ${c.tipo_tercero_nombre || 'General'}`;
            if (!grupos[key]) grupos[key] = [];
            grupos[key].push(c);
        }
        return grupos;
    })();

    return (
        <>
            <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap">
                    {[{ k: '', l: 'Todos' }, { k: 'vehiculo:', l: '🚗 Vehículos' }].map(f => (
                        <button key={f.k} onClick={() => setFiltro(f.k)}
                            className={`px-3 py-1 rounded-lg text-xs border ${filtro===f.k?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600'}`}>
                            {f.l}
                        </button>
                    ))}
                    {terceros.map(t => (
                        <button key={t.id} onClick={() => setFiltro(`tercero:${t.id}`)}
                            className={`px-3 py-1 rounded-lg text-xs border ${filtro===`tercero:${t.id}`?'bg-blue-600 text-white border-blue-600':'border-gray-300 text-gray-600'}`}>
                            👤 {t.nombre}
                        </button>
                    ))}
                </div>
                <button onClick={nuevoCampo} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                    + Nuevo campo
                </button>
            </div>

            {Object.entries(gruposFiltrados).map(([grupo, lista]) => (
                <div key={grupo} className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 px-1 pt-2">{grupo}</h3>
                    <div className="bg-white border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600 text-xs">Campo (nombre_campo)</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600 text-xs hidden sm:table-cell">Label</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600 text-xs hidden md:table-cell">Sección</th>
                                    <th className="text-left px-4 py-2 font-medium text-gray-600 text-xs hidden md:table-cell">Tipo</th>
                                    <th className="px-4 py-2 text-center font-medium text-gray-600 text-xs">Oblig.</th>
                                    <th className="px-4 py-2 text-center font-medium text-gray-600 text-xs">Activo</th>
                                    <th className="px-4 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lista.map(c => (
                                    <tr key={c.id} className={`hover:bg-gray-50 ${!c.activo ? 'opacity-40' : ''}`}>
                                        <td className="px-4 py-2">
                                            <span className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{c.nombre_campo}</span>
                                        </td>
                                        <td className="px-4 py-2 hidden sm:table-cell text-gray-700 text-xs">{c.label}</td>
                                        <td className="px-4 py-2 hidden md:table-cell">
                                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{c.seccion}</span>
                                        </td>
                                        <td className="px-4 py-2 hidden md:table-cell">
                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{c.tipo_input}</span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`text-xs font-bold ${c.obligatorio ? 'text-red-500':'text-gray-300'}`}>{c.obligatorio?'✓':'—'}</span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`text-sm ${c.activo?'text-green-500':'text-gray-300'}`}>{c.activo?'●':'○'}</span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <div className="flex items-center gap-2 justify-end">
                                                <button onClick={() => setEditando({ ...c })} className="text-xs text-blue-600 hover:underline">Editar</button>
                                                {c.activo && (
                                                    <button onClick={() => desactivar(c.id!)} className="text-xs text-red-400 hover:underline">Desact.</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {Object.keys(gruposFiltrados).length === 0 && (
                <div className="text-center text-gray-400 py-10">Sin campos para este filtro</div>
            )}

            {editando && (
                <Modal titulo={editando.id ? 'Editar campo' : 'Nuevo campo de formulario'} onClose={() => setEditando(null)}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-gray-600">Tipo de entidad</label>
                                <select value={editando.tipo_entidad} onChange={e => setEditando({ ...editando, tipo_entidad: e.target.value, tipo_tercero_id: null })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="tercero">Tercero</option>
                                    <option value="vehiculo">Vehículo</option>
                                </select>
                            </div>
                            {editando.tipo_entidad === 'tercero' && (
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Tipo de tercero</label>
                                    <select value={editando.tipo_tercero_id ?? ''} onChange={e => setEditando({ ...editando, tipo_tercero_id: e.target.value ? Number(e.target.value) : null })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                        <option value="">General (todos)</option>
                                        {terceros.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Campo label="nombre_campo * (clave interna)">
                                <input value={editando.nombre_campo} onChange={e => setEditando({ ...editando, nombre_campo: e.target.value.toLowerCase().replace(/\s/g,'_') })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="Ej: fecha_nacimiento"/>
                            </Campo>
                            <Campo label="Sección">
                                <select value={editando.seccion} onChange={e => setEditando({ ...editando, seccion: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    {SECCIONES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Campo>
                        </div>
                        <Campo label="Label (texto visible al usuario) *">
                            <input value={editando.label} onChange={e => setEditando({ ...editando, label: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Fecha de nacimiento"/>
                        </Campo>
                        <Campo label="Placeholder">
                            <input value={editando.placeholder || ''} onChange={e => setEditando({ ...editando, placeholder: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: DD/MM/AAAA"/>
                        </Campo>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-gray-600">Tipo de input</label>
                                <select value={editando.tipo_input} onChange={e => setEditando({ ...editando, tipo_input: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    {TIPO_INPUT_OPS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                            <Campo label="Orden">
                                <input type="number" value={editando.orden} onChange={e => setEditando({ ...editando, orden: Number(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
                            </Campo>
                        </div>
                        {editando.tipo_input === 'select' && (
                            <Campo label='Opciones (JSON array, ej: ["Opción 1","Opción 2"])'>
                                <textarea value={editando.opciones || ''} onChange={e => setEditando({ ...editando, opciones: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" rows={2} placeholder='["Ahorros","Corriente"]'/>
                            </Campo>
                        )}
                        <div className="flex gap-4 flex-wrap">
                            {[['obligatorio','Obligatorio'],['activo','Activo']].map(([k,l]) => (
                                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={(editando as any)[k]} onChange={e => setEditando({ ...editando, [k]: e.target.checked })}/>
                                    {l}
                                </label>
                            ))}
                        </div>
                        <Campo label="Mensaje de error (opcional)">
                            <input value={editando.mensaje_error || ''} onChange={e => setEditando({ ...editando, mensaje_error: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Ingrese un número válido"/>
                        </Campo>
                    </div>
                    <BotonesModal onCancel={() => setEditando(null)} onSave={guardar} saving={saving}/>
                </Modal>
            )}
        </>
    );
};

// ── Helpers de UI ────────────────────────────────────────────────────────────

const Modal: React.FC<{ titulo: string; onClose: () => void; children: React.ReactNode }> = ({ titulo, onClose, children }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-gray-900">{titulo}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                {children}
            </div>
        </div>
    </div>
);

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="text-xs font-medium text-gray-600">{label}</label>
        <div className="mt-1">{children}</div>
    </div>
);

const BotonesModal: React.FC<{ onCancel: () => void; onSave: () => void; saving: boolean }> = ({ onCancel, onSave, saving }) => (
    <div className="flex gap-3 mt-6">
        <button onClick={onCancel} className="flex-1 border py-3 rounded-xl text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button onClick={onSave} disabled={saving} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar'}
        </button>
    </div>
);

export default HVMaestras;
