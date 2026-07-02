/**
 * HojasDeVidaMain.tsx
 * Componente raíz del módulo Hojas de Vida (MOD-14).
 * Enruta internamente entre: Dashboard, Solicitudes, Revisión, Alertas, Maestras.
 */

import React, { useState, lazy, Suspense } from 'react';

const HVDashboard = lazy(() => import('./HVDashboard.js'));
const HVSolicitudes = lazy(() => import('./HVSolicitudes.js'));
const HVRevision = lazy(() => import('./HVRevision.js'));
const HVAlertas = lazy(() => import('./HVAlertas.js'));
const HVMaestras = lazy(() => import('./HVMaestras.js'));

type Tab = 'dashboard' | 'solicitudes' | 'revision' | 'alertas' | 'maestras';

interface Props {
    defaultTab?: Tab;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'solicitudes', label: 'Solicitudes', icon: '📋' },
    { id: 'revision', label: 'Revisión', icon: '🔍' },
    { id: 'alertas', label: 'Alertas', icon: '🔔' },
    { id: 'maestras', label: 'Maestras', icon: '⚙️' },
];

const Spinner = () => (
    <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
);

const HojasDeVidaMain: React.FC<Props> = ({ defaultTab = 'dashboard' }) => {
    const [tab, setTab] = useState<Tab>(defaultTab);
    const [solicitudId, setSolicitudId] = useState<string | null>(null);

    const abrirRevision = (id: string) => {
        setSolicitudId(id);
        setTab('revision');
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header con tabs */}
            <div className="bg-white border-b">
                <div className="px-4 pt-4 pb-0">
                    <h1 className="text-xl font-bold text-gray-900 mb-3">Hojas de Vida DMS</h1>
                    <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-hide">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                                    ${tab === t.id
                                        ? 'border-blue-600 text-blue-700 bg-blue-50'
                                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                    }`}
                            >
                                <span>{t.icon}</span>
                                <span className="hidden sm:inline">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-auto bg-gray-50 p-4">
                <Suspense fallback={<Spinner />}>
                    {tab === 'dashboard' && <HVDashboard onAbrirSolicitud={abrirRevision} />}
                    {tab === 'solicitudes' && <HVSolicitudes onRevisar={abrirRevision} />}
                    {tab === 'revision' && <HVRevision solicitudId={solicitudId} onVolver={() => setTab('solicitudes')} />}
                    {tab === 'alertas' && <HVAlertas />}
                    {tab === 'maestras' && <HVMaestras />}
                </Suspense>
            </div>
        </div>
    );
};

export default HojasDeVidaMain;
