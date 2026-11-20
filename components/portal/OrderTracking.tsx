
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import ExitoTrackingView from './ExitoTrackingView';

const OrderTracking: React.FC = () => {
    const [trackingInput, setTrackingInput] = useState('');
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    
    // Check URL params for auto-search on mount
    useEffect(() => {
        try {
            const path = window.location.pathname || '';
            const hash = window.location.hash || '';
            const search = new URLSearchParams(window.location.search);
            
            let id = search.get('q') || search.get('id') || search.get('guia') || search.get('order');
            
            if (!id && path) {
                const parts = path.split('/').filter(Boolean);
                const trackingIdx = parts.findIndex(p => p.toLowerCase() === 'tracking');
                if (trackingIdx !== -1 && parts[trackingIdx + 1]) {
                    id = parts[trackingIdx + 1];
                }
            }

            if (!id && hash) {
                const hashParts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
                const trackingIdx = hashParts.findIndex(p => p.toLowerCase() === 'tracking');
                if (trackingIdx !== -1 && hashParts[trackingIdx + 1]) {
                    id = hashParts[trackingIdx + 1];
                }
            }

            if (id && id.trim()) {
                const cleanId = decodeURIComponent(id.trim());
                setTrackingInput(cleanId);
                handleSearch(cleanId);
            }
        } catch (e) {
            console.warn('[TRACKING] URL parse error:', e);
        }
    }, []);

    const handleSearch = async (id: string) => {
        const queryId = String(id || '').trim();
        if (!queryId) {
            toast.error('Ingrese un número de guía o pedido');
            return;
        }
        setLoading(true);
        setOrder(null);
        try {
            const res = await fetch(`/api/portal/tracking/${encodeURIComponent(queryId)}`);
            const data = await res.json();
            
            if (res.ok) {
                setOrder(data);
            } else {
                toast.error(data.error || 'Guía o pedido no encontrado');
            }
        } catch (err) {
            toast.error('Error de conexión con el servidor de rastreo');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        const s = String(status || '').toUpperCase();
        switch (s) {
            case 'EST-12':
            case 'EST-14':
            case 'ENTREGADO':
            case 'ENTREGA_EXITOSA':
                return 'bg-emerald-500 text-slate-950';
            case 'EST-11':
            case 'EN RUTA':
            case 'EN_REPARTO':
            case 'EN_DISTRIBUCION':
                return 'bg-blue-500 text-white';
            case 'EST-13':
            case 'DEVUELTO':
            case 'DEVUELTO_ALMACEN':
            case 'ANULADA':
            case 'CANCELADA':
                return 'bg-red-500 text-white';
            case 'EST-10':
            case 'ASIGNADO':
            case 'ASIGNADO_REPARTO':
            case 'PROGRAMADO_RECOGIDA':
                return 'bg-indigo-500 text-white';
            case 'EST-08':
            case 'INVENTARIADO':
            case 'EST-09':
            case 'ALISTADO':
            case 'EN_ALMACEN':
            case 'RECOGIDO_TIENDA':
                return 'bg-violet-500 text-white';
            case 'EST-03':
            case 'PENDIENTE':
            case 'ESPERA_RECOGIDA':
            case 'CREADA':
                return 'bg-amber-500 text-slate-950';
            case 'NOVEDAD':
            case 'CON_NOVEDAD':
                return 'bg-orange-500 text-white';
            default:
                return 'bg-slate-700 text-slate-300';
        }
    };

    const getStatusDisplay = (status: string) => {
        const labels: Record<string, string> = {
            'EST-03': 'Pendiente',
            'EST-04': 'En Conteo',
            'EST-05': 'Auditado',
            'EST-06': 'Recibido',
            'EST-07': 'Completado',
            'EST-08': 'Inventariado',
            'EST-09': 'Alistado',
            'EST-10': 'Asignado',
            'EST-11': 'En Ruta',
            'EST-12': 'Entregado',
            'EST-13': 'Devuelto',
            'EST-14': 'Entrega Parcial',
            'EST-15': 'Repice',
            'EST-16': 'Eliminado',
            'EST-17': 'Rechazado',
            // Estados Éxito Mensajería
            'CREADA': 'Guía Creada',
            'ESPERA_RECOGIDA': 'En Espera de Recogida en Tienda',
            'PROGRAMADO_RECOGIDA': 'Programado para Recogida',
            'RECOGIDO_TIENDA': 'Recogido en Tienda / Nodo',
            'EN_ALMACEN': 'Recibido en Centro de Distribución',
            'ASIGNADO_REPARTO': 'Asignado a Vehículo de Reparto',
            'EN_REPARTO': 'En Ruta hacia Destinatario',
            'ENTREGADO': 'Entregado al Destinatario',
            'NOVEDAD': 'Con Novedad de Entrega',
            'DEVUELTO_ALMACEN': 'Devuelto a Bodega Central',
            'ANULADA': 'Guía Anulada',
        };
        const upper = String(status || '').toUpperCase();
        return labels[upper] || labels[status] || status;
    };

    const isStepCompleted = (step: string, status: string) => {
        const s = String(status || '').toUpperCase();
        const orderWeight: Record<string, number> = {
            'CREADA': 1,
            'ESPERA_RECOGIDA': 1,
            'PROGRAMADO_RECOGIDA': 2,
            'RECOGIDO_TIENDA': 2,
            'EN_ALMACEN': 3,
            'ALISTADO': 3,
            'INVENTARIADO': 3,
            'ASIGNADO_REPARTO': 4,
            'EN_REPARTO': 4,
            'EN RUTA': 4,
            'EST-11': 4,
            'ENTREGADO': 5,
            'EST-12': 5,
            'EST-14': 5,
        };
        const currentWeight = orderWeight[s] || 1;
        switch (step) {
            case 'recibido':
                return currentWeight >= 1;
            case 'almacen':
                return currentWeight >= 2;
            case 'en_ruta':
                return currentWeight >= 4;
            case 'entregado':
                return currentWeight >= 5;
            default:
                return false;
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
             {/* Search Bar */}
             <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-[2rem] p-6 md:p-8 mb-8 shadow-2xl">
                <div className="text-center mb-6">
                    <span className="text-xs font-black text-emerald-400 tracking-widest uppercase mb-1 block">Milla 7 Logistics • Portal de Rastreo</span>
                    <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">Rastreo de Guías y Pedidos</h1>
                    <p className="text-xs text-slate-400 mt-1">Consulte en tiempo real la trazabilidad de sus envíos y descargue rótulos o comprobantes.</p>
                </div>
                <form 
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSearch(trackingInput);
                    }}
                    className="flex flex-col sm:flex-row gap-3"
                >
                    <input 
                        type="text" 
                        value={trackingInput}
                        onChange={e => setTrackingInput(e.target.value)}
                        placeholder="Número de Guía o Pedido (ej. GUIA-202611... / 167561...)"
                        aria-label="Número de Guía o Pedido"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-emerald-500 transition-colors text-base md:text-lg"
                    />
                    <button 
                        type="submit"
                        disabled={loading}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-4 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                                <span>Buscando...</span>
                            </>
                        ) : (
                            <span>Rastrear</span>
                        )}
                    </button>
                </form>
             </div>

             {/* Guías Éxito: vista con etapas, intentos y evidencias */}
             {order && order.is_exito && Array.isArray(order.etapas) && <ExitoTrackingView order={order} />}

             {/* Result Card (documentos / pedidos) */}
             {order && !(order.is_exito && Array.isArray(order.etapas)) && (
                 <div className="bg-white text-slate-900 rounded-[2.5rem] p-6 md:p-10 shadow-2xl animate-in slide-in-from-bottom-5 duration-500 border border-slate-100">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 border-b border-slate-100 pb-6">
                        <div>
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
                                {order.is_exito ? 'Guía Éxito Mensajería' : 'Documento / Pedido'}
                            </span>
                            <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter break-all">
                                {order.external_doc_id}
                            </h2>
                            {order.numero_pedido && (
                                <p className="text-sm font-semibold text-slate-500 mt-1">
                                    Pedido asociado: <span className="text-slate-800 font-mono font-bold">{order.numero_pedido}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col items-start sm:items-end gap-2">
                            <span className={`px-5 py-2.5 rounded-full font-black text-xs uppercase tracking-widest shadow-sm ${getStatusColor(order.status)}`}>
                                {getStatusDisplay(order.status)}
                            </span>
                            {order.label_url && (
                                <a 
                                    href={order.label_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={`Rotulo_${order.external_doc_id}.pdf`}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-200"
                                >
                                    📥 Descargar Rótulo Térmico (PDF)
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 bg-slate-50 p-6 rounded-2xl">
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Fecha Registro</span>
                             <p className="font-bold text-base text-slate-800">
                                 {order.created_at ? new Date(order.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                             </p>
                             <p className="text-xs text-slate-500">
                                 {order.created_at ? new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}
                             </p>
                         </div>
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Fecha Entrega</span>
                             <p className="font-bold text-base text-slate-800">
                                 {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : 'En proceso'}
                             </p>
                             {order.delivery_date && (
                                 <p className="text-xs text-slate-500">
                                     {new Date(order.delivery_date).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                 </p>
                             )}
                         </div>
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Destino</span>
                             <p className="font-bold text-base text-slate-800 truncate">
                                 {order.destination?.city || order.destination?.address || 'Urbano'}
                             </p>
                             {order.destination?.recipient && (
                                 <p className="text-xs text-slate-500 truncate">{order.destination.recipient}</p>
                             )}
                         </div>
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">Vehículo de Reparto</span>
                             <p className="font-bold text-base text-slate-800 font-mono">
                                 {order.vehicle_plate || 'Asignación en curso'}
                             </p>
                         </div>
                    </div>

                    {/* Timeline Tracker */}
                    <div className="relative mb-12 px-2 md:px-6">
                        <div className="absolute left-6 right-6 top-4 h-1 bg-slate-200 -z-0"></div>
                        <div className="relative z-10 flex justify-between">
                            {/* Step 1: Recibido */}
                            <div className="flex flex-col items-center gap-2 text-center max-w-[80px]">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${isStepCompleted('recibido', order.status) ? 'border-emerald-500' : 'border-slate-300'}`}>
                                    {isStepCompleted('recibido', order.status) && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${isStepCompleted('recibido', order.status) ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    Registrado
                                </span>
                            </div>

                            {/* Step 2: En Bodega / Alistado */}
                            <div className="flex flex-col items-center gap-2 text-center max-w-[80px]">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${isStepCompleted('almacen', order.status) ? 'border-emerald-500' : 'border-slate-300'}`}>
                                     {isStepCompleted('almacen', order.status) && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${isStepCompleted('almacen', order.status) ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    En Bodega
                                </span>
                            </div>

                            {/* Step 3: En Reparto */}
                            <div className="flex flex-col items-center gap-2 text-center max-w-[80px]">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${isStepCompleted('en_ruta', order.status) ? 'border-emerald-500' : 'border-slate-300'}`}>
                                     {isStepCompleted('en_ruta', order.status) && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${isStepCompleted('en_ruta', order.status) ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    En Ruta
                                </span>
                            </div>

                            {/* Step 4: Entregado */}
                            <div className="flex flex-col items-center gap-2 text-center max-w-[80px]">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${isStepCompleted('entregado', order.status) ? 'border-emerald-500' : 'border-slate-300'}`}>
                                     {isStepCompleted('entregado', order.status) && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[11px] font-bold uppercase tracking-wider ${isStepCompleted('entregado', order.status) ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    Entregado
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Delivery Proof Photo / Signature if available */}
                    {(order.foto_entrega_url || order.firma_entrega_url) && (
                        <div className="mb-8 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
                            <span className="text-xs font-black text-emerald-800 uppercase tracking-widest block mb-3">Evidencias de Entrega en Destino</span>
                            <div className="flex flex-wrap gap-4 items-center">
                                {order.foto_entrega_url && (
                                    <a 
                                        href={order.foto_entrega_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-sm hover:bg-emerald-100 transition-colors"
                                    >
                                        📷 Ver Foto de Entrega
                                    </a>
                                )}
                                {order.firma_entrega_url && (
                                    <a 
                                        href={order.firma_entrega_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-sm hover:bg-emerald-100 transition-colors"
                                    >
                                        ✍️ Ver Firma del Receptor
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Detailed Event History */}
                    {order.timeline && order.timeline.length > 0 && (
                        <div className="mb-8">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4">Historial de Eventos</span>
                            <div className="space-y-3">
                                {order.timeline.map((evt: any, i: number) => (
                                    <div key={i} className="flex items-start gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-baseline gap-2">
                                                <span className="font-bold text-slate-800">
                                                    {getStatusDisplay(evt.estado_nuevo || evt.estado || 'Evento')}
                                                </span>
                                                <span className="text-xs text-slate-400 font-mono">
                                                    {evt.created_at || evt.fecha ? new Date(evt.created_at || evt.fecha).toLocaleString('es-CO') : ''}
                                                </span>
                                            </div>
                                            {evt.observacion && (
                                                <p className="text-xs text-slate-600 mt-1">{evt.observacion}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Items List */}
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4">Detalle de Paquetes / Artículos</span>
                        {order.items && order.items.length > 0 ? (
                            order.items.map((item: any, i: number) => (
                                <div key={i} className="flex justify-between items-center py-3 border-b border-slate-200 last:border-0">
                                    <span className="font-medium text-slate-700 text-sm">{item.desc || item.sku}</span>
                                    <span className="font-mono font-bold text-slate-900 text-sm">x{item.qty || 1}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-slate-400 italic">No se registran artículos individuales.</p>
                        )}
                    </div>

                 </div>
             )}
        </div>
    );
};

export default OrderTracking;
