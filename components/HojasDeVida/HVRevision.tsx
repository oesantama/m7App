/**
 * HVRevision.tsx
 * Panel de revisión y aprobación de una solicitud específica.
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

const API = '/api/hv';
const BASE_URL = window.location.origin;

interface Documento {
    id: number;
    nombre_doc: string;
    nombre_archivo: string;
    estado: 'pendiente' | 'aprobado' | 'rechazado' | 'vencido';
    obs_rechazo?: string;
    drive_link?: string;
    fecha_vencimiento?: string;
    subido_at: string;
    version: number;
}

interface EstadoHistorial {
    id: number;
    estado_ant: string;
    estado_nuevo: string;
    usuario_nombre: string;
    created_at: string;
    observacion?: string;
}

interface SolicitudDetalle {
    id: string;
    tipo_entidad: string;
    nombre_entidad: string;
    estado: string;
    tipo_tercero_nombre: string;
    creado_por_nombre: string;
    created_at: string;
    datos_json: Record<string, any>;
    token: string;
    token_expira_at: string;
    veces_abierto: number;
    primera_apertura_at?: string;
    doc_fisica_estado?: string;
    doc_fisica_obs?: string;
    documentos: Documento[];
    historial: EstadoHistorial[];
}

const ESTADOS_TRANSICION: Record<string, string[]> = {
    creada: ['link_enviado'],
    link_enviado: ['abierta'],
    abierta: ['en_diligenciamiento'],
    en_diligenciamiento: ['pendiente_aprobacion'],
    pendiente_aprobacion: ['en_revision', 'rechazada'],
    en_revision: ['correcciones_solicitadas', 'aprobada', 'rechazada'],
    correcciones_solicitadas: ['en_revision'],
    corregida: ['en_revision'],
    aprobada: ['completa', 'doc_fisica_pendiente'],
    doc_fisica_pendiente: ['doc_fisica_recibida'],
    doc_fisica_recibida: ['completa'],
};

const ESTADO_LABEL: Record<string, string> = {
    creada: 'Creada',
    link_enviado: 'Link enviado',
    abierta: 'Abierta',
    en_diligenciamiento: 'Diligenciando',
    enviada: 'Enviada',
    pendiente_aprobacion: 'Pend. aprobación',
    en_revision: 'En revisión',
    correcciones_solicitadas: 'Correcciones solicitadas',
    corregida: 'Corregida',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
    doc_fisica_pendiente: 'Doc. física pendiente',
    doc_fisica_recibida: 'Doc. física recibida',
    completa: 'Completada',
};

interface Props {
    solicitudId: string | null;
    onVolver: () => void;
}

const HVRevision: React.FC<Props> = ({ solicitudId, onVolver }) => {
    const [sol, setSol] = useState<SolicitudDetalle | null>(null);
    const [loading, setLoading] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [docRechazando, setDocRechazando] = useState<number | null>(null);
    const [obsRechazo, setObsRechazo] = useState('');
    const [cambioEstado, setCambioEstado] = useState('');
    const [obsEstado, setObsEstado] = useState('');
    const [showCambioEstado, setShowCambioEstado] = useState(false);

    const token = localStorage.getItem('m7_token');

    useEffect(() => {
        if (solicitudId) cargar();
        else setSol(null);
    }, [solicitudId]);

    const cargar = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/solicitudes/${solicitudId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            setSol(await res.json());
        } catch {
            toast.error('Error al cargar solicitud');
        } finally {
            setLoading(false);
        }
    };

    const aprobarDoc = async (docId: number, estado: 'aprobado' | 'rechazado') => {
        if (estado === 'rechazado' && docRechazando === docId) {
            if (!obsRechazo.trim()) { toast.error('Ingrese el motivo de rechazo'); return; }
        }
        setGuardando(true);
        try {
            const res = await fetch(`${API}/documentos/${docId}/aprobar`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado, obs_rechazo: obsRechazo || null }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success(estado === 'aprobado' ? 'Documento aprobado' : 'Documento rechazado');
            setDocRechazando(null);
            setObsRechazo('');
            cargar();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstadoSol = async () => {
        if (!cambioEstado) return;
        setGuardando(true);
        try {
            const res = await fetch(`${API}/solicitudes/${solicitudId}/estado`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: cambioEstado, observacion: obsEstado }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success(`Estado cambiado a: ${ESTADO_LABEL[cambioEstado]}`);
            setShowCambioEstado(false);
            setCambioEstado('');
            setObsEstado('');
            cargar();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setGuardando(false);
        }
    };

    const copiarLink = () => {
        navigator.clipboard.writeText(`${BASE_URL}/documentacion/${sol?.token}`);
        toast.success('Link copiado');
    };

    if (!solicitudId) return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-4xl mb-3">🔍</p>
            <p>Seleccione una solicitud de la lista para revisar</p>
        </div>
    );

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!sol) return null;

    const transiciones = ESTADOS_TRANSICION[sol.estado] || [];
    const todosAprobados = sol.documentos.every(d => d.estado === 'aprobado');

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={onVolver} className="text-gray-500 hover:text-gray-800">
                    ← Volver
                </button>
                <div className="flex-1">
                    <h2 className="text-lg font-bold text-gray-900">{sol.nombre_entidad}</h2>
                    <p className="text-sm text-gray-500">
                        {sol.tipo_entidad === 'vehiculo' ? '🚗 Vehículo' : `👤 ${sol.tipo_tercero_nombre}`}
                        {' · '}
                        <span className="font-medium">{ESTADO_LABEL[sol.estado] || sol.estado}</span>
                    </p>
                </div>
                <button
                    onClick={copiarLink}
                    className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200"
                >
                    🔗 Link
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-blue-600">{sol.veces_abierto}</div>
                    <div className="text-xs text-gray-500">Aperturas</div>
                </div>
                <div className="bg-white border rounded-xl p-3 text-center">
                    <div className="text-xl font-bold text-green-600">
                        {sol.documentos.filter(d => d.estado === 'aprobado').length}/{sol.documentos.length}
                    </div>
                    <div className="text-xs text-gray-500">Docs aprobados</div>
                </div>
                <div className="bg-white border rounded-xl p-3 text-center">
                    <div className="text-sm font-bold text-gray-700">
                        {sol.primera_apertura_at
                            ? new Date(sol.primera_apertura_at).toLocaleDateString('es-CO')
                            : '—'}
                    </div>
                    <div className="text-xs text-gray-500">Primera apertura</div>
                </div>
            </div>

            {/* Datos del formulario */}
            {sol.datos_json && Object.keys(sol.datos_json).length > 0 && (
                <div className="bg-white border rounded-xl p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">📋 Datos ingresados</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {Object.entries(sol.datos_json).map(([k, v]) => (
                            <div key={k}>
                                <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}: </span>
                                <span className="font-medium text-gray-800">{String(v)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Documentos */}
            <div className="bg-white border rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-3">📎 Documentos</h3>
                {sol.documentos.length === 0 ? (
                    <p className="text-sm text-gray-500">No se han subido documentos aún.</p>
                ) : (
                    <div className="space-y-3">
                        {sol.documentos.map(doc => (
                            <div key={doc.id} className={`border rounded-xl p-3 ${
                                doc.estado === 'aprobado' ? 'border-green-300 bg-green-50'
                                : doc.estado === 'rechazado' ? 'border-red-300 bg-red-50'
                                : 'border-gray-200'
                            }`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-800 text-sm truncate">{doc.nombre_doc}</p>
                                        <p className="text-xs text-gray-500">{doc.nombre_archivo} (v{doc.version})</p>
                                        {doc.fecha_vencimiento && (
                                            <p className="text-xs text-orange-600">
                                                Vence: {new Date(doc.fecha_vencimiento).toLocaleDateString('es-CO')}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                        doc.estado === 'aprobado' ? 'bg-green-100 text-green-700'
                                        : doc.estado === 'rechazado' ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {doc.estado === 'aprobado' ? '✓ Aprobado'
                                         : doc.estado === 'rechazado' ? '✗ Rechazado'
                                         : 'Pendiente'}
                                    </span>
                                </div>

                                {doc.obs_rechazo && (
                                    <p className="text-xs text-red-700 mt-1 bg-red-100 rounded px-2 py-1">
                                        {doc.obs_rechazo}
                                    </p>
                                )}

                                {/* Acciones */}
                                {doc.estado !== 'aprobado' && (
                                    <div className="mt-2 flex gap-2 flex-wrap">
                                        {doc.drive_link && (
                                            <a
                                                href={doc.drive_link}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-200"
                                            >
                                                👁 Ver
                                            </a>
                                        )}
                                        <button
                                            onClick={() => aprobarDoc(doc.id, 'aprobado')}
                                            disabled={guardando}
                                            className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 disabled:opacity-60"
                                        >
                                            ✓ Aprobar
                                        </button>
                                        {docRechazando === doc.id ? (
                                            <div className="w-full mt-1 flex gap-2">
                                                <input
                                                    type="text"
                                                    value={obsRechazo}
                                                    onChange={e => setObsRechazo(e.target.value)}
                                                    placeholder="Motivo de rechazo..."
                                                    className="flex-1 border border-red-300 rounded px-2 py-1 text-xs"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => aprobarDoc(doc.id, 'rechazado')}
                                                    disabled={guardando}
                                                    className="text-xs bg-red-600 text-white px-2 py-1 rounded"
                                                >
                                                    Confirmar
                                                </button>
                                                <button
                                                    onClick={() => setDocRechazando(null)}
                                                    className="text-xs text-gray-500 px-2 py-1 rounded border"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setDocRechazando(doc.id)}
                                                className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200"
                                            >
                                                ✗ Rechazar
                                            </button>
                                        )}
                                    </div>
                                )}
                                {doc.estado === 'aprobado' && doc.drive_link && (
                                    <a
                                        href={doc.drive_link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1 inline-block text-xs text-blue-600 underline"
                                    >
                                        Ver documento
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Cambio de estado */}
            {transiciones.length > 0 && (
                <div className="bg-white border rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-gray-800">🔄 Cambiar estado</h3>
                        {todosAprobados && sol.estado === 'en_revision' && (
                            <span className="text-xs text-green-600 font-medium">✓ Todos los docs aprobados</span>
                        )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {transiciones.map(e => (
                            <button
                                key={e}
                                onClick={() => { setCambioEstado(e); setShowCambioEstado(true); }}
                                className={`text-sm px-4 py-2 rounded-lg font-medium border ${
                                    e === 'aprobada' ? 'bg-green-600 text-white border-green-600'
                                    : e === 'rechazada' ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                {ESTADO_LABEL[e] || e}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal cambio estado */}
            {showCambioEstado && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                        <h3 className="font-bold text-gray-900 mb-3">
                            Cambiar a: {ESTADO_LABEL[cambioEstado]}
                        </h3>
                        <textarea
                            value={obsEstado}
                            onChange={e => setObsEstado(e.target.value)}
                            placeholder="Observación (opcional)..."
                            rows={3}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowCambioEstado(false)} className="flex-1 border py-2 rounded-lg">
                                Cancelar
                            </button>
                            <button
                                onClick={cambiarEstadoSol}
                                disabled={guardando}
                                className={`flex-1 py-2 rounded-lg text-white font-medium ${
                                    cambioEstado === 'rechazada' ? 'bg-red-600' : 'bg-blue-600'
                                }`}
                            >
                                {guardando ? 'Guardando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Historial */}
            {sol.historial.length > 0 && (
                <div className="bg-white border rounded-xl p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">📅 Historial</h3>
                    <div className="space-y-2">
                        {sol.historial.map(h => (
                            <div key={h.id} className="flex gap-3 text-xs">
                                <div className="text-gray-400 whitespace-nowrap pt-0.5">
                                    {new Date(h.created_at).toLocaleDateString('es-CO', {
                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                    })}
                                </div>
                                <div>
                                    <span className="text-gray-700">
                                        {h.estado_ant ? `${ESTADO_LABEL[h.estado_ant] || h.estado_ant} → ` : ''}
                                        <strong>{ESTADO_LABEL[h.estado_nuevo] || h.estado_nuevo}</strong>
                                    </span>
                                    {h.observacion && <p className="text-gray-500">{h.observacion}</p>}
                                    <p className="text-gray-400">{h.usuario_nombre}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HVRevision;
