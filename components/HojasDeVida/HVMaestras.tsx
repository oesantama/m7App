/**
 * HVMaestras.tsx
 * Parametrización de tipos de documento y catálogos del sistema HV.
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

const API = '/api/hv';

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
}

interface TipoTercero {
    id: number;
    nombre: string;
    codigo: string;
}

const HVMaestras: React.FC = () => {
    const [tipos, setTipos] = useState<TipoDocumento[]>([]);
    const [tiposTercero, setTiposTercero] = useState<TipoTercero[]>([]);
    const [loading, setLoading] = useState(true);
    const [editando, setEditando] = useState<TipoDocumento | null>(null);
    const [saving, setSaving] = useState(false);
    const [filtroTipo, setFiltroTipo] = useState('');
    const token = localStorage.getItem('m7_token');

    useEffect(() => { cargar(); }, []);

    const cargar = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/maestras`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setTipos(data.tipos_documento || []);
            setTiposTercero(data.tipos_tercero || []);
        } catch {
            toast.error('Error al cargar maestras');
        } finally {
            setLoading(false);
        }
    };

    const guardar = async () => {
        if (!editando) return;
        if (!editando.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${API}/maestras/tipos-documento`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(editando),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success('Guardado correctamente');
            setEditando(null);
            cargar();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const nuevoTipo = () => setEditando({
        tipo_entidad: 'tercero',
        tipo_tercero_id: null,
        nombre: '',
        nombre_archivo: '',
        descripcion: '',
        obligatorio: true,
        acepta_vencimiento: false,
        dias_alerta_1: 90,
        dias_alerta_2: 30,
        dias_alerta_3: 15,
        dias_alerta_4: 7,
        orden: 0,
        activo: true,
    });

    const tiposFiltrados = filtroTipo
        ? tipos.filter(t => t.tipo_entidad === filtroTipo.split(':')[0] &&
            (filtroTipo.split(':')[1]
                ? String(t.tipo_tercero_id) === filtroTipo.split(':')[1]
                : !t.tipo_tercero_id))
        : tipos;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Parametrización</h2>
                <button
                    onClick={nuevoTipo}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                    + Nuevo tipo doc.
                </button>
            </div>

            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => setFiltroTipo('')}
                    className={`px-3 py-1 rounded-lg text-sm border ${!filtroTipo ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}
                >
                    Todos
                </button>
                <button
                    onClick={() => setFiltroTipo('vehiculo:')}
                    className={`px-3 py-1 rounded-lg text-sm border ${filtroTipo === 'vehiculo:' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}
                >
                    🚗 Vehículos
                </button>
                {tiposTercero.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setFiltroTipo(`tercero:${t.id}`)}
                        className={`px-3 py-1 rounded-lg text-sm border ${filtroTipo === `tercero:${t.id}` ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}
                    >
                        👤 {t.nombre}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center h-40 items-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Tipo</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Alertas (días)</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-600">Oblig.</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-600">Activo</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {tiposFiltrados.map(t => (
                                <tr key={t.id} className={`hover:bg-gray-50 ${!t.activo ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-800">{t.nombre}</p>
                                        {t.descripcion && (
                                            <p className="text-xs text-gray-500 truncate max-w-[200px]">{t.descripcion}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                                        {t.tipo_entidad === 'vehiculo' ? '🚗 Vehículo' : `👤 ${t.tipo_tercero_nombre || 'General'}`}
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                                        {t.acepta_vencimiento
                                            ? `${t.dias_alerta_1}/${t.dias_alerta_2}/${t.dias_alerta_3}/${t.dias_alerta_4}d`
                                            : <span className="text-gray-300">N/A</span>}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`text-xs font-semibold ${t.obligatorio ? 'text-red-600' : 'text-gray-400'}`}>
                                            {t.obligatorio ? '✓' : '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`text-xs ${t.activo ? 'text-green-600' : 'text-gray-400'}`}>
                                            {t.activo ? '●' : '○'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => setEditando({ ...t })}
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            Editar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {tiposFiltrados.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center text-gray-500 py-8">
                                        No hay tipos de documento configurados para este filtro
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal edición */}
            {editando && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">
                                {editando.id ? 'Editar' : 'Nuevo'} tipo de documento
                            </h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-600">Tipo de entidad</label>
                                        <select
                                            value={editando.tipo_entidad}
                                            onChange={e => setEditando({ ...editando, tipo_entidad: e.target.value })}
                                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        >
                                            <option value="vehiculo">Vehículo</option>
                                            <option value="tercero">Tercero</option>
                                        </select>
                                    </div>
                                    {editando.tipo_entidad === 'tercero' && (
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Tipo de tercero</label>
                                            <select
                                                value={editando.tipo_tercero_id ?? ''}
                                                onChange={e => setEditando({ ...editando, tipo_tercero_id: e.target.value ? Number(e.target.value) : null })}
                                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                            >
                                                <option value="">Todos</option>
                                                {tiposTercero.map(t => (
                                                    <option key={t.id} value={t.id}>{t.nombre}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Nombre del documento *</label>
                                    <input
                                        type="text"
                                        value={editando.nombre}
                                        onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Ej: Licencia de conducción"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Nombre del archivo</label>
                                    <input
                                        type="text"
                                        value={editando.nombre_archivo}
                                        onChange={e => setEditando({ ...editando, nombre_archivo: e.target.value })}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Ej: licencia-conduccion.pdf"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Descripción</label>
                                    <input
                                        type="text"
                                        value={editando.descripcion || ''}
                                        onChange={e => setEditando({ ...editando, descripcion: e.target.value })}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Instrucción para el usuario"
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editando.obligatorio}
                                            onChange={e => setEditando({ ...editando, obligatorio: e.target.checked })}
                                        />
                                        Obligatorio
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editando.acepta_vencimiento}
                                            onChange={e => setEditando({ ...editando, acepta_vencimiento: e.target.checked })}
                                        />
                                        Tiene vencimiento
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editando.activo}
                                            onChange={e => setEditando({ ...editando, activo: e.target.checked })}
                                        />
                                        Activo
                                    </label>
                                </div>

                                {editando.acepta_vencimiento && (
                                    <div>
                                        <label className="text-xs font-medium text-gray-600">Alertas de vencimiento (días)</label>
                                        <div className="grid grid-cols-4 gap-2 mt-1">
                                            {['dias_alerta_1', 'dias_alerta_2', 'dias_alerta_3', 'dias_alerta_4'].map((k, i) => (
                                                <div key={k}>
                                                    <label className="text-xs text-gray-500">Alerta {i + 1}</label>
                                                    <input
                                                        type="number"
                                                        value={(editando as any)[k]}
                                                        onChange={e => setEditando({ ...editando, [k]: Number(e.target.value) })}
                                                        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Orden</label>
                                    <input
                                        type="number"
                                        value={editando.orden}
                                        onChange={e => setEditando({ ...editando, orden: Number(e.target.value) })}
                                        className="mt-1 w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setEditando(null)} className="flex-1 border py-3 rounded-xl text-gray-700">
                                    Cancelar
                                </button>
                                <button
                                    onClick={guardar}
                                    disabled={saving}
                                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-60"
                                >
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HVMaestras;
