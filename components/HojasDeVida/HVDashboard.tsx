/**
 * HVDashboard.tsx
 * Dashboard KPIs del módulo Hojas de Vida.
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

const API = '/api/hv';

interface DashboardData {
    por_estado: { estado: string; total: string }[];
    tiempos: {
        horas_creacion_apertura: string;
        horas_diligenciamiento: string;
        horas_aprobacion: string;
    };
    vencimientos: {
        vencidos: string;
        vence_30d: string;
        vence_7d: string;
    };
    pendientes_revision: {
        id: string;
        nombre_entidad: string;
        tipo_entidad: string;
        tipo_tercero: string;
        horas_pendiente: string;
    }[];
    totales: {
        total: string;
        completas: string;
        aprobadas: string;
        pct_completas: number;
        pct_aprobadas: number;
    };
}

const ESTADO_LABELS: Record<string, string> = {
    creada: 'Creadas',
    link_enviado: 'Link enviado',
    abierta: 'Abiertas',
    en_diligenciamiento: 'Diligenciando',
    enviada: 'Enviadas',
    pendiente_aprobacion: 'Pend. aprobación',
    en_revision: 'En revisión',
    correcciones_solicitadas: 'Con correcciones',
    corregida: 'Corregidas',
    aprobada: 'Aprobadas',
    rechazada: 'Rechazadas',
    completa: 'Completadas',
};

const ESTADO_COLOR: Record<string, string> = {
    creada: 'bg-gray-100 text-gray-700',
    link_enviado: 'bg-indigo-100 text-indigo-700',
    abierta: 'bg-blue-100 text-blue-700',
    en_diligenciamiento: 'bg-yellow-100 text-yellow-800',
    enviada: 'bg-purple-100 text-purple-700',
    pendiente_aprobacion: 'bg-orange-100 text-orange-800',
    en_revision: 'bg-cyan-100 text-cyan-700',
    correcciones_solicitadas: 'bg-red-100 text-red-700',
    corregida: 'bg-teal-100 text-teal-700',
    aprobada: 'bg-green-100 text-green-700',
    rechazada: 'bg-red-200 text-red-800',
    completa: 'bg-emerald-100 text-emerald-800',
};

interface Props {
    onAbrirSolicitud: (id: string) => void;
}

const HVDashboard: React.FC<Props> = ({ onAbrirSolicitud }) => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    const token = localStorage.getItem('m7_token');

    useEffect(() => { cargar(); }, []);

    const cargar = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/dashboard`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(await res.text());
            setData(await res.json());
        } catch (e: any) {
            toast.error('Error al cargar dashboard: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!data) return null;

    const { totales, vencimientos, tiempos, por_estado, pendientes_revision } = data;

    return (
        <div className="space-y-6">
            {/* KPIs principales */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KPICard label="Total solicitudes" valor={totales.total} color="blue" />
                <KPICard label="Aprobadas" valor={`${totales.aprobadas} (${totales.pct_aprobadas}%)`} color="green" />
                <KPICard label="Completadas" valor={`${totales.completas} (${totales.pct_completas}%)`} color="emerald" />
                <KPICard label="Pend. revisión" valor={pendientes_revision.length} color="orange" />
            </div>

            {/* Alertas de vencimiento */}
            {(Number(vencimientos.vence_7d) > 0 || Number(vencimientos.vencidos) > 0) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <h3 className="font-semibold text-red-800 mb-3">⚠ Alertas de vencimiento</h3>
                    <div className="grid grid-cols-3 gap-3">
                        <AlertaVenc label="Vencidos" valor={vencimientos.vencidos} color="red" />
                        <AlertaVenc label="Vencen en 7d" valor={vencimientos.vence_7d} color="orange" />
                        <AlertaVenc label="Vencen en 30d" valor={vencimientos.vence_30d} color="yellow" />
                    </div>
                </div>
            )}

            {/* Tiempos promedio */}
            <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold text-gray-800 mb-3">⏱ Tiempos promedio</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-2xl font-bold text-blue-600">
                            {tiempos.horas_creacion_apertura ?? '—'}h
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Creación → apertura</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-purple-600">
                            {tiempos.horas_diligenciamiento ?? '—'}h
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Diligenciamiento</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-green-600">
                            {tiempos.horas_aprobacion ?? '—'}h
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Revisión → aprobación</div>
                    </div>
                </div>
            </div>

            {/* Estado de solicitudes */}
            <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold text-gray-800 mb-3">📊 Por estado</h3>
                <div className="flex flex-wrap gap-2">
                    {por_estado.map(e => (
                        <span key={e.estado} className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADO_COLOR[e.estado] || 'bg-gray-100 text-gray-700'}`}>
                            {ESTADO_LABELS[e.estado] || e.estado}: <strong>{e.total}</strong>
                        </span>
                    ))}
                </div>
            </div>

            {/* Pendientes de revisión */}
            {pendientes_revision.length > 0 && (
                <div className="bg-white rounded-xl border p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">🔍 Pendientes de revisión</h3>
                    <div className="space-y-2">
                        {pendientes_revision.map(p => (
                            <button
                                key={p.id}
                                onClick={() => onAbrirSolicitud(p.id)}
                                className="w-full text-left flex justify-between items-center p-3 rounded-lg hover:bg-blue-50 border border-gray-100 transition-colors"
                            >
                                <div>
                                    <p className="font-medium text-gray-800 text-sm">{p.nombre_entidad}</p>
                                    <p className="text-xs text-gray-500">
                                        {p.tipo_entidad === 'vehiculo' ? '🚗 Vehículo' : `👤 ${p.tipo_tercero}`}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                        Number(p.horas_pendiente) > 48 ? 'bg-red-100 text-red-700'
                                        : Number(p.horas_pendiente) > 24 ? 'bg-orange-100 text-orange-700'
                                        : 'bg-green-100 text-green-700'
                                    }`}>
                                        {Math.round(Number(p.horas_pendiente))}h
                                    </span>
                                    <p className="text-xs text-blue-600 mt-0.5">Ver →</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const KPICard: React.FC<{ label: string; valor: string | number; color: string }> = ({ label, valor, color }) => {
    const colors: Record<string, string> = {
        blue: 'bg-blue-50 border-blue-200 text-blue-700',
        green: 'bg-green-50 border-green-200 text-green-700',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        orange: 'bg-orange-50 border-orange-200 text-orange-700',
    };
    return (
        <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
            <div className="text-2xl font-bold">{valor}</div>
            <div className="text-xs mt-1 opacity-80">{label}</div>
        </div>
    );
};

const AlertaVenc: React.FC<{ label: string; valor: string; color: string }> = ({ label, valor, color }) => {
    const colors: Record<string, string> = {
        red: 'text-red-700 font-bold',
        orange: 'text-orange-700 font-bold',
        yellow: 'text-yellow-700 font-bold',
    };
    return (
        <div className="text-center">
            <div className={`text-2xl ${colors[color] || ''}`}>{valor}</div>
            <div className="text-xs text-gray-600">{label}</div>
        </div>
    );
};

export default HVDashboard;
