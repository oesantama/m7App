/**
 * HVAlertas.tsx
 * Panel de alertas de vencimiento de documentos.
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

const API = '/api/hv';

interface AlertaDoc {
    id: number;
    solicitud_id: string;
    nombre_doc: string;
    nombre_entidad: string;
    tipo_entidad: string;
    tipo_tercero: string;
    fecha_vencimiento: string;
    dias_restantes: number;
}

const HVAlertas: React.FC = () => {
    const [alertas, setAlertas] = useState<AlertaDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [dias, setDias] = useState(90);
    const token = localStorage.getItem('m7_token');

    useEffect(() => { cargar(); }, [dias]);

    const cargar = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/alertas?dias=${dias}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            setAlertas(await res.json());
        } catch {
            toast.error('Error al cargar alertas');
        } finally {
            setLoading(false);
        }
    };

    const getBadge = (dias: number) => {
        if (dias <= 0) return 'bg-red-200 text-red-900';
        if (dias <= 7) return 'bg-red-100 text-red-700';
        if (dias <= 15) return 'bg-orange-100 text-orange-700';
        if (dias <= 30) return 'bg-yellow-100 text-yellow-800';
        return 'bg-blue-100 text-blue-700';
    };

    const vencidos = alertas.filter(a => a.dias_restantes <= 0);
    const proximos7 = alertas.filter(a => a.dias_restantes > 0 && a.dias_restantes <= 7);
    const proximos30 = alertas.filter(a => a.dias_restantes > 7 && a.dias_restantes <= 30);
    const resto = alertas.filter(a => a.dias_restantes > 30);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Alertas de vencimiento</h2>
                <select
                    value={dias}
                    onChange={e => setDias(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                    <option value={30}>Próximos 30 días</option>
                    <option value={60}>Próximos 60 días</option>
                    <option value={90}>Próximos 90 días</option>
                </select>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3">
                <KPIAlerta label="Vencidos" valor={vencidos.length} color="red" />
                <KPIAlerta label="7 días" valor={proximos7.length} color="orange" />
                <KPIAlerta label="30 días" valor={proximos30.length} color="yellow" />
                <KPIAlerta label="90 días" valor={resto.length} color="blue" />
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-40">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : alertas.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                    <p className="text-2xl mb-2">✓</p>
                    <p className="text-green-700 font-medium">No hay documentos próximos a vencer en los próximos {dias} días</p>
                </div>
            ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Entidad</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Documento</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Vencimiento</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {alertas.map(a => (
                                <tr key={`${a.solicitud_id}-${a.id}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{a.nombre_entidad}</p>
                                        <p className="text-xs text-gray-500">
                                            {a.tipo_entidad === 'vehiculo' ? '🚗' : '👤'} {a.tipo_tercero}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell text-gray-700">{a.nombre_doc}</td>
                                    <td className="px-4 py-3 text-gray-700">
                                        {new Date(a.fecha_vencimiento).toLocaleDateString('es-CO')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getBadge(a.dias_restantes)}`}>
                                            {a.dias_restantes <= 0
                                                ? 'Vencido'
                                                : `${a.dias_restantes}d`}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const KPIAlerta: React.FC<{ label: string; valor: number; color: string }> = ({ label, valor, color }) => {
    const colors: Record<string, string> = {
        red: 'bg-red-50 border-red-200 text-red-700',
        orange: 'bg-orange-50 border-orange-200 text-orange-700',
        yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
        blue: 'bg-blue-50 border-blue-200 text-blue-700',
    };
    return (
        <div className={`rounded-xl border p-3 text-center ${colors[color]}`}>
            <div className="text-2xl font-bold">{valor}</div>
            <div className="text-xs mt-0.5">{label}</div>
        </div>
    );
};

export default HVAlertas;
