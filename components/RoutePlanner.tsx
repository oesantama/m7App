
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Invoice, Vehicle, Route, VehicleStatus, Driver, VehicleAssignment, DocumentL, DocStatus, RouteLog, User } from '../types';
import { Icons } from '../constants';

interface RoutePlannerProps {
  invoices: Invoice[];
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: VehicleAssignment[];
  documents: DocumentL[];
  user: User;
  onAssign: (vId: string, dId: string, cId: string) => void;
  onSaveRoute: (route: Partial<Route>) => void;
}

interface SuggestedRoute {
  id: string;
  vehicle: Vehicle;
  assignedInvoices: Invoice[];
  totalVolume: number;
  utilization: number;
  city: string;
}

const RoutePlanner: React.FC<RoutePlannerProps> = ({ 
  invoices, vehicles, drivers, assignments, documents, user, onAssign, onSaveRoute 
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [suggestedRoutes, setSuggestedRoutes] = useState<SuggestedRoute[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'intelligence'>('intelligence');
  
  // Auditoría y Aprendizaje
  const [auditLogs, setAuditLogs] = useState<RouteLog[]>([]);
  const [learningExemptions, setLearningExemptions] = useState<string[]>([]); // IDs de facturas que no deben agruparse
  const [auditModal, setAuditModal] = useState<{ isOpen: boolean; action: any; data: any } | null>(null);
  const [auditComment, setAuditComment] = useState('');

  // 1. FILTRADO ESTRICTO: Solo facturas de documentos INVENTARIADOS
  const validInvoices = useMemo(() => {
    const inventoredDocIds = documents
      .filter(d => d.status === DocStatus.INVENTORED)
      .map(d => d.id);
    
    return invoices.filter(inv => 
      inventoredDocIds.includes(inv.docLId) && 
      inv.status === DocStatus.PENDING &&
      !learningExemptions.includes(inv.id)
    );
  }, [invoices, documents, learningExemptions]);

  const availableVehicles = useMemo(() => 
    vehicles.filter(v => v.status === VehicleStatus.AVAILABLE),
    [vehicles]
  );

  // MOTOR M7 INTELLIGENCE - Bin Packing al 90%
  const runM7Optimization = () => {
    setIsOptimizing(true);
    
    setTimeout(() => {
      const suggestions: SuggestedRoute[] = [];
      let remainingInvoices = [...validInvoices];
      
      // Agrupar por ciudad/proximidad
      const cityGroups: { [city: string]: Invoice[] } = {};
      remainingInvoices.forEach(inv => {
        const city = inv.city || inv.address.split(',').pop()?.trim() || 'Principal';
        if (!cityGroups[city]) cityGroups[city] = [];
        cityGroups[city].push(inv);
      });

      const usedVehicleIds = new Set<string>();

      Object.entries(cityGroups).forEach(([city, cityInvoices]) => {
        let currentInvoices = [...cityInvoices].sort((a, b) => b.volumeM3 - a.volumeM3);
        
        availableVehicles.forEach(vehicle => {
          if (usedVehicleIds.has(vehicle.id) || currentInvoices.length === 0) return;

          const load: Invoice[] = [];
          let loadVolume = 0;
          const targetLimit = vehicle.capacityM3 * 0.9; // Target estricto 90%

          for (let i = 0; i < currentInvoices.length; i++) {
            const inv = currentInvoices[i];
            // Validación de Factura Completa (No se fracciona)
            if (loadVolume + inv.volumeM3 <= vehicle.capacityM3) {
              load.push(inv);
              loadVolume += inv.volumeM3;
              currentInvoices.splice(i, 1);
              i--;
            }
          }

          if (load.length > 0) {
            suggestions.push({
              id: `suggested-${Date.now()}-${vehicle.plate}`,
              vehicle,
              assignedInvoices: load,
              totalVolume: parseFloat(loadVolume.toFixed(2)),
              utilization: Math.round((loadVolume / vehicle.capacityM3) * 100),
              city
            });
            usedVehicleIds.add(vehicle.id);
          }
        });
      });

      setSuggestedRoutes(suggestions);
      setIsOptimizing(false);
      setSelectedInvoices(suggestions.flatMap(s => s.assignedInvoices.map(i => i.id)));
    }, 1200);
  };

  const handleAuditAction = (type: 'ADD' | 'REMOVE', routeIndex: number, invoice: Invoice) => {
    setAuditModal({ 
      isOpen: true, 
      action: type, 
      data: { routeIndex, invoice } 
    });
  };

  const confirmAuditAction = () => {
    if (!auditModal || !auditComment.trim()) return;

    const { action, data } = auditModal;
    const newSuggestions = [...suggestedRoutes];
    const route = newSuggestions[data.routeIndex];

    if (action === 'REMOVE') {
      route.assignedInvoices = route.assignedInvoices.filter(i => i.id !== data.invoice.id);
      setLearningExemptions(prev => [...prev, data.invoice.id]);
    } else {
      route.assignedInvoices.push(data.invoice);
    }

    // Recalcular volumetría
    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + curr.volumeM3, 0);
    route.totalVolume = parseFloat(newVol.toFixed(2));
    route.utilization = Math.round((newVol / route.vehicle.capacityM3) * 100);

    // Guardar Log de Auditoría
    const log: RouteLog = {
      id: `LOG-${Date.now()}`,
      action: action === 'REMOVE' ? 'REMOVE_INVOICE' : 'ADD_INVOICE',
      entityId: data.invoice.id,
      comment: auditComment,
      previousState: action === 'REMOVE' ? 'En sugerencia IA' : 'Fuera de ruta',
      newState: action === 'REMOVE' ? 'Excluido por usuario' : 'Agregado manualmente',
      createdBy: user.name,
      createdAt: new Date().toISOString(),
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
      statusId: 'EST-01'
    };

    setAuditLogs(prev => [log, ...prev]);
    setSuggestedRoutes(newSuggestions);
    setAuditModal(null);
    setAuditComment('');
  };

  useEffect(() => {
    if (viewMode === 'map' && !mapRef.current) {
      mapRef.current = L.map('m7-routing-map').setView([4.6097, -74.0817], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    }
    const map = mapRef.current;
    if (map && viewMode === 'map') {
      map.eachLayer((layer: any) => { if (layer instanceof L.Marker) map.removeLayer(layer); });
      
      suggestedRoutes.forEach((route, rIdx) => {
        route.assignedInvoices.forEach((inv, iIdx) => {
          const icon = L.divIcon({
            html: `<div class="w-10 h-10 rounded-2xl bg-slate-900 border-2 border-emerald-500 shadow-2xl flex flex-col items-center justify-center text-white transition-all transform hover:scale-110">
                    <span class="text-[7px] font-black uppercase text-emerald-400 leading-none mb-1">${route.vehicle.plate}</span>
                    <span class="text-[12px] font-black leading-none">${iIdx + 1}</span>
                  </div>`,
            className: 'custom-m7-icon', iconSize: [40, 40], iconAnchor: [20, 20],
          });
          L.marker([inv.lat, inv.lng], { icon }).addTo(map)
            .bindPopup(`<b>VEHÍCULO: ${route.vehicle.plate}</b><br>Destino ${iIdx+1}: ${inv.customerName}<br>Ciudad: ${inv.city}`);
        });
      });
    }
  }, [suggestedRoutes, viewMode]);

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 overflow-hidden">
      {/* HEADER DE INTELIGENCIA M7 */}
      <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-6 shrink-0 transition-all">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-950 text-emerald-500 rounded-[1.8rem] flex items-center justify-center shadow-2xl animate-pulse">
             <Icons.Scan />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">M7 Intelligence Routing</h2>
            <div className="flex items-center gap-3 mt-2">
               <span className="px-3 py-1 bg-emerald-500 text-slate-950 rounded-lg text-[9px] font-black uppercase tracking-widest">Optimización 90%</span>
               <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Autoaprendizaje Activo</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-1.5 rounded-[1.5rem] flex shadow-inner h-14 relative">
             <button onClick={() => setViewMode('intelligence')} className={`px-8 py-2.5 rounded-2xl text-[10px] font-black uppercase transition-all relative z-10 ${viewMode === 'intelligence' ? 'text-slate-900' : 'text-slate-400'}`}>Sugerencias IA</button>
             <button onClick={() => setViewMode('map')} className={`px-8 py-2.5 rounded-2xl text-[10px] font-black uppercase transition-all relative z-10 ${viewMode === 'map' ? 'text-slate-900' : 'text-slate-400'}`}>Mapa de Ruta</button>
             <div className={`absolute top-1.5 bottom-1.5 w-[140px] bg-white rounded-2xl shadow-xl transition-all duration-300 ${viewMode === 'intelligence' ? 'left-1.5' : 'left-[148px]'}`}></div>
          </div>

          <button 
            onClick={runM7Optimization}
            disabled={isOptimizing || validInvoices.length === 0}
            className="bg-slate-900 text-emerald-500 px-10 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.3em] shadow-2xl hover:bg-emerald-500 hover:text-slate-900 transition-all flex items-center gap-4 disabled:opacity-20 active:scale-95"
          >
            {isOptimizing ? <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full"></div> : <Icons.Route />}
            {suggestedRoutes.length > 0 ? 'RECALCULAR FLUJO' : 'GENERAR RUTAS M7'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {viewMode === 'map' ? (
          <div className="flex-1 bg-slate-200 rounded-[3.5rem] shadow-2xl border-8 border-white overflow-hidden relative">
             <div id="m7-routing-map" className="w-full h-full"></div>
             <div className="absolute bottom-8 left-8 bg-slate-900/90 backdrop-blur-md p-6 rounded-3xl text-white border border-white/10 z-[400]">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">Leyenda de Tripulación</h4>
                <div className="space-y-2">
                   {suggestedRoutes.map(s => (
                     <div key={s.id} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-[9px] font-black uppercase">{s.vehicle.plate} • {s.assignedInvoices.length} paradas</span>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-4">
             {suggestedRoutes.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-center p-20 bg-white rounded-[4rem] border border-slate-100 shadow-xl space-y-8">
                  <div className="w-32 h-32 bg-slate-50 rounded-[3rem] flex items-center justify-center text-slate-200 border-4 border-dashed border-slate-100">
                     <Icons.Audit />
                  </div>
                  <div>
                     <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Motor M7 en Reposo</h3>
                     <p className="text-sm text-slate-400 font-bold max-w-sm mt-3 uppercase tracking-wide">Inicie el análisis de rutas basadas en documentos con inventario completo.</p>
                  </div>
               </div>
             ) : (
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                 {suggestedRoutes.map((route, rIdx) => (
                   <div key={route.id} className="bg-white rounded-[3.5rem] shadow-2xl border-2 border-slate-100 overflow-hidden flex flex-col group hover:border-emerald-500 transition-all animate-in slide-in-from-bottom-8">
                      <div className="p-8 bg-slate-950 text-white flex justify-between items-center shrink-0">
                         <div className="flex items-center gap-5">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${route.utilization >= 90 ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`}><Icons.Truck /></div>
                            <div>
                               <p className="font-black text-2xl uppercase tracking-tighter leading-none">{route.vehicle.plate}</p>
                               <p className="text-[10px] text-slate-500 font-black uppercase mt-2 tracking-widest">{route.city} • Sugerencia IA</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className={`text-3xl font-black ${route.utilization >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>{route.utilization}%</p>
                            <p className="text-[8px] font-black uppercase text-slate-600 tracking-widest">Ocupación m³</p>
                         </div>
                      </div>

                      <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-4 max-h-[400px] bg-slate-50/30">
                         <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secuencia de Entrega ({route.assignedInvoices.length})</h4>
                            <button className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 uppercase hover:bg-emerald-500 hover:text-white transition-all">Añadir Factura</button>
                         </div>
                         {route.assignedInvoices.map((inv, iIdx) => (
                           <div key={inv.id} className="p-6 bg-white rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm group/item hover:shadow-xl transition-all">
                              <div className="flex items-center gap-5">
                                 <div className="w-10 h-10 bg-slate-900 text-emerald-500 rounded-xl flex items-center justify-center font-black text-xs">{iIdx + 1}</div>
                                 <div className="max-w-[200px]">
                                    <p className="font-black text-[12px] uppercase truncate text-slate-900">{inv.customerName}</p>
                                    <p className="text-[9px] text-slate-400 font-bold truncate uppercase">{inv.address}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-6">
                                 <div className="text-right">
                                    <p className="text-xs font-black text-emerald-600 leading-none">{inv.volumeM3}m³</p>
                                    <p className="text-[8px] text-slate-400 font-black uppercase mt-1">{inv.id}</p>
                                 </div>
                                 <button 
                                  onClick={() => handleAuditAction('REMOVE', rIdx, inv)}
                                  className="w-10 h-10 bg-slate-100 text-slate-300 rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover/item:opacity-100"
                                 >
                                    <Icons.X />
                                 </button>
                              </div>
                           </div>
                         ))}
                      </div>

                      <div className="p-8 border-t bg-white flex gap-4 shrink-0">
                         <button className="flex-1 py-5 bg-slate-950 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-2xl">Confirmar Despacho M7</button>
                      </div>
                   </div>
                 ))}
               </div>
             )}

             {/* LOGS DE AUDITORÍA */}
             {auditLogs.length > 0 && (
               <div className="bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
                  <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                     <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-3"><Icons.Audit /> Historial de Ajustes M7 Intelligence</h4>
                     <span className="text-[10px] font-black text-slate-500">{auditLogs.length} EVENTOS</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                     <table className="w-full text-left text-[10px]">
                        <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest sticky top-0">
                           <tr><th className="p-4">Usuario</th><th className="p-4">Acción</th><th className="p-4">Comentario Auditoría</th><th className="p-4 text-right">Fecha</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {auditLogs.map(log => (
                             <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-black uppercase text-slate-900">{log.createdBy}</td>
                                <td className="p-4">
                                   <span className={`px-3 py-1 rounded-lg font-black text-[8px] uppercase ${log.action === 'REMOVE_INVOICE' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{log.action}</span>
                                </td>
                                <td className="p-4 text-slate-500 italic">"{log.comment}"</td>
                                <td className="p-4 text-right text-slate-400 font-bold">{new Date(log.createdAt).toLocaleTimeString()}</td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
             )}
          </div>
        )}

        {/* BARRA LATERAL DE RESUMEN */}
        <div className="w-full lg:w-96 bg-white p-10 rounded-[4rem] shadow-2xl border border-slate-100 flex flex-col gap-10 shrink-0 overflow-hidden animate-in slide-in-from-right-8">
           <div className="space-y-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b pb-4">Activos de Planificación</h3>
              <div className="grid grid-cols-1 gap-4">
                 <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Facturas Inventariadas</p>
                    <p className="text-4xl font-black">{validInvoices.length}</p>
                    <p className="text-[9px] font-bold text-slate-500 mt-4 uppercase tracking-widest">LISTAS PARA ASIGNACIÓN</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Vehículos Disponibles</p>
                    <p className="text-4xl font-black text-slate-900">{availableVehicles.length}</p>
                 </div>
              </div>
           </div>

           <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-6">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cola Manual / Pendientes</h4>
                 <Icons.List />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-4">
                 {validInvoices.filter(i => !selectedInvoices.includes(i.id)).map(inv => (
                   <div key={inv.id} className="p-5 bg-white border-2 border-dashed border-slate-200 rounded-3xl flex justify-between items-center group cursor-pointer hover:border-emerald-500 hover:bg-slate-50 transition-all">
                      <div>
                         <p className="font-black text-[11px] uppercase truncate max-w-[120px] text-slate-900">{inv.customerName}</p>
                         <p className="text-[10px] text-emerald-600 font-black mt-1 uppercase tracking-widest">{inv.volumeM3}m³</p>
                      </div>
                      <button className="w-10 h-10 bg-slate-950 text-white rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl"><Icons.Check /></button>
                   </div>
                 ))}
                 {validInvoices.filter(i => !selectedInvoices.includes(i.id)).length === 0 && (
                   <p className="text-center py-20 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">Cola Vacía</p>
                 )}
              </div>
           </div>

           <div className="pt-8 border-t border-slate-100 space-y-4 shrink-0">
              <div className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Volumen Plan</span>
                 <span className="text-xl font-black text-slate-950">
                   {suggestedRoutes.reduce((acc, curr) => acc + curr.totalVolume, 0).toFixed(2)}m³
                 </span>
              </div>
           </div>
        </div>
      </div>

      {/* MODAL DE AUDITORÍA M7 */}
      {auditModal?.isOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="bg-white w-full max-w-lg rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/5">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ${auditModal.action === 'REMOVE' ? 'bg-red-600' : 'bg-emerald-500'} text-slate-950`}><Icons.Audit /></div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">Auditoría de Ruta</h3>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Justificación de Movimiento</p>
                    </div>
                 </div>
                 <button onClick={() => setAuditModal(null)} className="w-10 h-10 rounded-full hover:bg-red-600 transition-all text-4xl font-thin">×</button>
              </div>
              <div className="p-10 space-y-8 bg-slate-50/20">
                 <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Factura / Cliente</p>
                    <p className="text-lg font-black text-slate-950 uppercase leading-none">{auditModal.data.invoice.customerName}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">{auditModal.data.invoice.address}</p>
                 </div>
                 
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Comentario de Auditoría (Obligatorio)</label>
                    <textarea 
                      value={auditComment}
                      onChange={e => setAuditComment(e.target.value)}
                      placeholder="Explique el motivo de este cambio manual..."
                      className="w-full p-8 bg-white border-2 border-slate-100 rounded-[2.5rem] font-bold text-sm outline-none focus:border-emerald-500 transition-all min-h-[150px] shadow-inner"
                    ></textarea>
                 </div>

                 <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={confirmAuditAction}
                      disabled={!auditComment.trim()}
                      className="w-full py-6 bg-slate-950 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all disabled:opacity-20 active:scale-95"
                    >
                      Confirmar Ajuste y Log
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;
