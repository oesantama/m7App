
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

const OrderTracking: React.FC = () => {
    const [trackingInput, setTrackingInput] = useState('');
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    
    // Check URL params for auto-search
    useEffect(() => {
        const hash = window.location.hash;
        const parts = hash.split('/');
        if (parts.length > 3 && parts[2] === 'tracking') {
            const id = parts[3];
            if (id) {
                setTrackingInput(id);
                handleSearch(id);
            }
        }
    }, []);

    const handleSearch = async (id: string) => {
        if (!id) return;
        setLoading(true);
        setOrder(null);
        try {
            const res = await fetch(`/api/portal/tracking/${id}`);
            const data = await res.json();
            
            if (res.ok) {
                setOrder(data);
            } else {
                toast.error(data.error || 'Pedido no encontrado');
            }
        } catch (err) {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EST-12': case 'EST-14': case 'ENTREGADO': return 'bg-emerald-500 text-slate-950';
            case 'EST-11': case 'EN RUTA':    return 'bg-blue-500 text-white';
            case 'EST-13': case 'DEVUELTO':   return 'bg-red-500 text-white';
            case 'EST-10': case 'ASIGNADO':   return 'bg-indigo-500 text-white';
            case 'EST-08': case 'INVENTARIADO': case 'EST-09': case 'ALISTADO': return 'bg-violet-500 text-white';
            case 'EST-03': case 'PENDIENTE':  return 'bg-amber-500 text-slate-950';
            default:                          return 'bg-slate-700 text-slate-300';
        }
    };

    const getStatusDisplay = (status: string) => {
        const labels: Record<string, string> = {
            'EST-03': 'Pendiente',    'EST-04': 'En Conteo',
            'EST-05': 'Auditado',     'EST-06': 'Recibido',
            'EST-07': 'Completado',   'EST-08': 'Inventariado',
            'EST-09': 'Alistado',     'EST-10': 'Asignado',
            'EST-11': 'En Ruta',      'EST-12': 'Entregado',
            'EST-13': 'Devuelto',     'EST-14': 'Entrega Parcial',
            'EST-15': 'Repice',      'EST-16': 'Eliminado',
            'EST-17': 'Rechazado',
        };
        return labels[status] ?? status;
    };

    return (
        <div className="max-w-4xl mx-auto">
             {/* Search Bar */}
             <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-[2rem] p-8 mb-10 shadow-2xl">
                <h1 className="text-2xl font-black text-white mb-6 uppercase tracking-tight text-center">Rastreo de Pedidos</h1>
                <div className="flex gap-4">
                    <input 
                        type="text" 
                        value={trackingInput}
                        onChange={e => setTrackingInput(e.target.value)}
                        placeholder="Número de Factura o Guía (ej. FE-1234)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500 transition-colors text-lg"
                    />
                    <button 
                        onClick={() => handleSearch(trackingInput)}
                        disabled={loading}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-8 py-4 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                        {loading ? 'Buscando...' : 'Rastrear'}
                    </button>
                </div>
             </div>

             {/* Result */}
             {order && (
                 <div className="bg-white text-slate-900 rounded-[2.5rem] p-10 shadow-2xl animate-in slide-in-from-bottom-5 duration-500">
                    <div className="flex justify-between items-start mb-10 border-b border-slate-100 pb-8">
                        <div>
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Pedido</span>
                            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{order.external_doc_id}</h2>
                        </div>
                        <div className={`px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest ${getStatusColor(order.status)}`}>
                            {getStatusDisplay(order.status)}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Fecha Creación</span>
                             <p className="font-bold text-lg">{new Date(order.created_at).toLocaleDateString()}</p>
                             <p className="text-sm text-slate-500">{new Date(order.created_at).toLocaleTimeString()}</p>
                         </div>
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Fecha Entrega Est.</span>
                             <p className="font-bold text-lg">{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'Pendiente'}</p>
                         </div>
                         <div>
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Vehículo Asignado</span>
                             <p className="font-bold text-lg">{order.vehicle_plate || 'Sin asignar'}</p>
                         </div>
                    </div>

                    {/* Timeline */}
                    <div className="relative mb-12 px-4">
                        <div className="absolute left-0 top-1/2 w-full h-1 bg-slate-100 -z-10 -translate-y-1/2"></div>
                        <div className="flex justify-between">
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${order.created_at ? 'border-emerald-500' : 'border-slate-200'}`}>
                                    {order.created_at && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${order.created_at ? 'text-emerald-600' : 'text-slate-300'}`}>Recibido</span>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${order.picking_date ? 'border-emerald-500' : 'border-slate-200'}`}>
                                     {order.picking_date && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${order.picking_date ? 'text-emerald-600' : 'text-slate-300'}`}>Alistado</span>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${['EST-11','EST-12','EST-13','EST-14','EN RUTA','ENTREGADO'].includes(order.status) ? 'border-emerald-500' : 'border-slate-200'}`}>
                                     {['EST-11','EST-12','EST-13','EST-14','EN RUTA','ENTREGADO'].includes(order.status) && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${['EST-11','EST-12','EST-13','EST-14','EN RUTA','ENTREGADO'].includes(order.status) ? 'text-emerald-600' : 'text-slate-300'}`}>En Ruta</span>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center bg-white ${['EST-12','EST-14','ENTREGADO'].includes(order.status) ? 'border-emerald-500' : 'border-slate-200'}`}>
                                     {['EST-12','EST-14','ENTREGADO'].includes(order.status) && <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${['EST-12','EST-14','ENTREGADO'].includes(order.status) ? 'text-emerald-600' : 'text-slate-300'}`}>Entregado</span>
                            </div>
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="bg-slate-50 rounded-2xl p-6">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4">Items del Pedido</span>
                        {order.items?.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between items-center py-3 border-b border-slate-200 last:border-0">
                                <span className="font-medium text-slate-700">{item.desc || item.sku}</span>
                                <span className="font-bold text-slate-900">x{item.qty}</span>
                            </div>
                        ))}
                    </div>

                 </div>
             )}
        </div>
    );
};

export default OrderTracking;
