/**
 * HVSolicitudes.tsx
 * Lista de solicitudes con búsqueda, filtros, paginación y creación.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const API = '/api/hv';
const BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;

interface Solicitud {
    id: string;
    tipo_entidad: string;
    nombre_entidad: string;
    estado: string;
    tipo_tercero_nombre: string;
    total_docs: string;
    docs_aprobados: string;
    created_at: string;
    token: string;
    token_expira_at: string;
    creado_por_nombre: string;
}

interface Catalogo {
    tipos_tercero: { id: number; nombre: string; codigo: string }[];
}

interface Props {
    onRevisar: (id: string) => void;
}

const ESTADO_BADGE: Record<string, string> = {
    creada: 'bg-gray-100 text-gray-700',
    link_enviado: 'bg-indigo-100 text-indigo-700',
    abierta: 'bg-blue-100 text-blue-700',
    en_diligenciamiento: 'bg-yellow-100 text-yellow-800',
    pendiente_aprobacion: 'bg-orange-100 text-orange-800',
    en_revision: 'bg-cyan-100 text-cyan-700',
    aprobada: 'bg-green-100 text-green-700',
    rechazada: 'bg-red-100 text-red-700',
    completa: 'bg-emerald-100 text-emerald-800',
};

const ESTADO_LABEL: Record<string, string> = {
    creada: 'Creada',
    link_enviado: 'Link enviado',
    abierta: 'Abierta',
    en_diligenciamiento: 'Diligenciando',
    pendiente_aprobacion: 'Pend. aprobación',
    en_revision: 'En revisión',
    correcciones_solicitadas: 'Correcciones',
    corregida: 'Corregida',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
    completa: 'Completada',
};

const HVSolicitudes: React.FC<Props> = ({ onRevisar }) => {
    const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [catalogos, setCatalogos] = useState<Catalogo>({ tipos_tercero: [] });
    const [showCrear, setShowCrear] = useState(false);
    const [copiadoId, setCopiadoId] = useState<string | null>(null);

    // Filtros
    const [q, setQ] = useState('');
    const [estado, setEstado] = useState('');
    const [tipoEntidad, setTipoEntidad] = useState('');

    const token = localStorage.getItem('m7_token');

    useEffect(() => { cargarCatalogos(); }, []);
    useEffect(() => { cargar(); }, [page, estado, tipoEntidad]);

    const cargarCatalogos = async () => {
        const res = await fetch(`${API}/catalogos`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setCatalogos(await res.json());
    };

    const cargar = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: '15' });
            if (estado) params.set('estado', estado);
            if (tipoEntidad) params.set('tipo_entidad', tipoEntidad);
            if (q.trim()) params.set('q', q.trim());

            const res = await fetch(`${API}/solicitudes?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setSolicitudes(data.data || []);
            setTotal(data.total || 0);
        } catch (e: any) {
            toast.error('Error al cargar solicitudes');
        } finally {
            setLoading(false);
        }
    };

    const buscar = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        cargar();
    };

    const copiarLink = async (sol: Solicitud) => {
        const link = `${BASE_URL}/documentacion/${sol.token}`;
        await navigator.clipboard.writeText(link);
        setCopiadoId(sol.id);
        toast.success('Link copiado');
        setTimeout(() => setCopiadoId(null), 2000);
    };

    const reenviarLink = async (sol: Solicitud) => {
        const res = await fetch(`${API}/solicitudes/${sol.id}/reenviar-link`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ canal: 'manual' }),
        });
        const data = await res.json();
        if (res.ok) {
            toast.success('Link renovado');
            await navigator.clipboard.writeText(data.link);
            toast.info('Nuevo link copiado al portapapeles');
            cargar();
        } else {
            toast.error(data.error);
        }
    };

    const totalPages = Math.ceil(total / 15);

    return (
        <div className="space-y-4">
            {/* Barra de acciones */}
            <div className="flex flex-col sm:flex-row gap-3">
                <form onSubmit={buscar} className="flex gap-2 flex-1">
                    <input
                        type="text"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Buscar por nombre o token..."
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        Buscar
                    </button>
                </form>
                <button
                    onClick={() => setShowCrear(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap"
                >
                    + Nueva solicitud
                </button>
            </div>

            {/* Filtros */}
            <div className="flex gap-3 flex-wrap">
                <select
                    value={estado}
                    onChange={e => { setEstado(e.target.value); setPage(1); }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">Todos los estados</option>
                    {Object.entries(ESTADO_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                    ))}
                </select>
                <select
                    value={tipoEntidad}
                    onChange={e => { setTipoEntidad(e.target.value); setPage(1); }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                    <option value="">Todos los tipos</option>
                    <option value="vehiculo">Vehículo</option>
                    <option value="tercero">Tercero</option>
                </select>
                <span className="text-sm text-gray-500 self-center">{total} resultado{total !== 1 ? 's' : ''}</span>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border overflow-hidden">
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : solicitudes.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">No hay solicitudes</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Entidad</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Tipo</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Docs</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Creado</th>
                                    <th className="px-4 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {solicitudes.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{s.nombre_entidad || '—'}</div>
                                            <div className="text-xs text-gray-400">{s.id.substring(0, 8)}...</div>
                                        </td>
                                        <td className="px-4 py-3 hidden sm:table-cell text-gray-600">
                                            {s.tipo_entidad === 'vehiculo' ? '🚗 Vehículo' : `👤 ${s.tipo_tercero_nombre || 'Tercero'}`}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[s.estado] || 'bg-gray-100 text-gray-700'}`}>
                                                {ESTADO_LABEL[s.estado] || s.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                                            {s.docs_aprobados}/{s.total_docs}
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                                            {new Date(s.created_at).toLocaleDateString('es-CO')}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-1 justify-end flex-wrap">
                                                <button
                                                    onClick={() => onRevisar(s.id)}
                                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-200"
                                                >
                                                    Ver
                                                </button>
                                                {new Date(s.token_expira_at) > new Date() ? (
                                                    <button
                                                        onClick={() => copiarLink(s)}
                                                        className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-200"
                                                    >
                                                        {copiadoId === s.id ? '✓ Copiado' : '🔗 Link'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => reenviarLink(s)}
                                                        className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-200"
                                                    >
                                                        🔄 Renovar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40"
                    >
                        ←
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40"
                    >
                        →
                    </button>
                </div>
            )}

            {/* Modal crear solicitud */}
            {showCrear && (
                <CrearSolicitudModal
                    catalogos={catalogos}
                    token={token!}
                    onClose={() => setShowCrear(false)}
                    onCreada={() => { setShowCrear(false); cargar(); }}
                />
            )}
        </div>
    );
};

// ─── Modal crear solicitud ────────────────────────────────────────────────────

const CrearSolicitudModal: React.FC<{
    catalogos: Catalogo;
    token: string;
    onClose: () => void;
    onCreada: () => void;
}> = ({ catalogos, token, onClose, onCreada }) => {
    const [tipoEntidad, setTipoEntidad] = useState('tercero');
    const [tipoTerceroId, setTipoTerceroId] = useState('');
    const [entidadId, setEntidadId] = useState('');
    const [nombreEntidad, setNombreEntidad] = useState('');
    const [horas, setHoras] = useState('72');
    const [saving, setSaving] = useState(false);
    const [linkCreado, setLinkCreado] = useState('');

    const crear = async () => {
        if (!nombreEntidad.trim()) { toast.error('Ingrese el nombre de la entidad'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/hv/solicitudes', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo_entidad: tipoEntidad,
                    tipo_tercero_id: tipoTerceroId ? Number(tipoTerceroId) : null,
                    entidad_id: entidadId || null,
                    nombre_entidad: nombreEntidad.trim(),
                    horas_expiracion: Number(horas),
                }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error); return; }
            setLinkCreado(data.link_publico);
            toast.success('Solicitud creada');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const copiarLink = () => {
        navigator.clipboard.writeText(linkCreado);
        toast.success('Link copiado');
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                <div className="p-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Nueva solicitud de documentación</h2>

                    {linkCreado ? (
                        <div className="space-y-4">
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <p className="text-sm font-semibold text-green-800 mb-2">✓ Link generado</p>
                                <p className="text-xs text-green-700 break-all">{linkCreado}</p>
                            </div>
                            <button
                                onClick={copiarLink}
                                className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium"
                            >
                                📋 Copiar link
                            </button>
                            <button onClick={onCreada} className="w-full border py-3 rounded-xl text-gray-700">
                                Cerrar
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de entidad</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['vehiculo', 'tercero'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setTipoEntidad(t)}
                                            className={`py-2 rounded-lg border text-sm font-medium ${tipoEntidad === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'}`}
                                        >
                                            {t === 'vehiculo' ? '🚗 Vehículo' : '👤 Tercero'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {tipoEntidad === 'tercero' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de tercero</label>
                                    <select
                                        value={tipoTerceroId}
                                        onChange={e => setTipoTerceroId(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    >
                                        <option value="">Seleccione...</option>
                                        {catalogos.tipos_tercero.map(t => (
                                            <option key={t.id} value={t.id}>{t.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {tipoEntidad === 'vehiculo' ? 'Placa' : 'CC / NIT'}
                                </label>
                                <input
                                    type="text"
                                    value={entidadId}
                                    onChange={e => setEntidadId(e.target.value.toUpperCase())}
                                    placeholder={tipoEntidad === 'vehiculo' ? 'ABC123' : '1234567890'}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nombre completo <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={nombreEntidad}
                                    onChange={e => setNombreEntidad(e.target.value)}
                                    placeholder={tipoEntidad === 'vehiculo' ? 'Ej: ABC123 — Chevrolet NPR' : 'Ej: Juan Carlos Pérez'}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Vigencia del link
                                </label>
                                <select
                                    value={horas}
                                    onChange={e => setHoras(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="24">24 horas</option>
                                    <option value="48">48 horas</option>
                                    <option value="72">72 horas (3 días)</option>
                                    <option value="168">7 días</option>
                                    <option value="336">14 días</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={onClose} className="flex-1 border py-3 rounded-xl text-gray-700">
                                    Cancelar
                                </button>
                                <button
                                    onClick={crear}
                                    disabled={saving}
                                    className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold disabled:opacity-60"
                                >
                                    {saving ? 'Creando...' : 'Crear y generar link'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HVSolicitudes;
