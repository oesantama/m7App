
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Invoice, Vehicle, Route, VehicleStatus, Driver, VehicleAssignment, DocumentL, DocStatus, RouteLog, User } from '../types';
import { Icons, INITIAL_CLIENTS } from '../constants';

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
  const [selectedClient, setSelectedClient] = useState(user.clientId || 'c1');
  const [suggestedRoutes, setSuggestedRoutes] = useState<SuggestedRoute[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'intelligence'>('intelligence');
  
  const [auditLogs, setAuditLogs] = useState<RouteLog[]>([]);
  const [learningExemptions, setLearningExemptions] = useState<string[]>([]);
  const [auditModal, setAuditModal] = useState<{ isOpen: boolean; action: any; data: any } | null>(null);
  const [auditComment, setAuditComment] = useState('');

  // FILTRADO DE FACTURAS APTAS: Cualquier doc en estado INVENTORED del cliente seleccionado
  const validInvoices = useMemo(() => {
    const inventoredDocIds = documents
      .filter(d => d.status === DocStatus.INVENTORED && d.clientId === selectedClient)
      .map(d => d.id);
    
    return invoices.filter(inv => 
      inventoredDocIds.includes(inv.docLId) && 
      inv.status === DocStatus.PENDING &&
      inv.clientId === selectedClient &&
      !learningExemptions.includes(inv.id)
    );
  }, [invoices, documents, learningExemptions, selectedClient]);

  const availableVehicles = useMemo(() => 
    vehicles.filter(v => v.status === VehicleStatus.AVAILABLE && v.clientId === selectedClient),
    [vehicles, selectedClient]
  );

  const runM7Optimization = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      const suggestions: SuggestedRoute[] = [];
      let remainingInvoices = [...validInvoices];
      const cityGroups: { [city: string]: Invoice[] } = {};
      remainingInvoices.forEach(inv => {
        const city = inv.city || 'Principal';
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
          for (let i = 0; i < currentInvoices.length; i++) {
            const inv = currentInvoices[i];
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
    }, 1200);
  };

  const handleAuditAction = (type: 'ADD' | 'REMOVE', routeIndex: number, invoice: Invoice) => {
    setAuditModal({ isOpen: true, action: type, data: { routeIndex, invoice } });
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

    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + curr.volumeM3, 0);
    route.totalVolume = parseFloat(newVol.toFixed(2));
    route.utilization = Math.round((newVol / route.vehicle.capacityM3) * 100);

    setAuditLogs(prev => [{
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
    }, ...prev]);

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
      suggestedRoutes.forEach((route) => {
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
      <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-6 shrink-0 transition-all">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-950 text-emerald-500 rounded-[1.8rem] flex items-center justify-center shadow-2xl animate-pulse">
             <Icons.Route />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">M7 Intelligence Routing</h2>
            <div className="flex items-center gap-3">
               <span className="px-3 py-1 bg-emerald-500 text-slate-950 rounded-lg text-[9px] font-black uppercase tracking-widest">Optimización 90%</span>
               <select 
                 value={selectedClient}
                 onChange={(e) => {setSelectedClient(e.target.value); setSuggestedRoutes([]);}}
                 className="bg-slate-50 border border-slate-200 px-4 py-1 rounded-lg text-[10px] font-black uppercase outline-none focus:border-emerald-500"
               >
                 {INITIAL_CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
               </select>
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
            {isOptimizing ? <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full"></div> : <Icons.Scan />}
            {suggestedRoutes.length > 0 ? 'RECALCULAR FLUJO' : 'GENERAR RUTAS M7'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {viewMode === 'map' ? (
          <div className="flex-1 bg-slate-200 rounded-[3.5rem] shadow-2xl border-8 border-white overflow-hidden relative">
             <div id="m7-routing-map" className="w-full h-full"></div>
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
                     <p className="text-sm text-slate-400 font-bold max-w-sm mt-3 uppercase tracking-wide">
                       Inicie el análisis basado en documentos inventariados con doble conteo auditado.
                     </p>
                  </div>
               </div>
             ) : (
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-10">
                 {suggestedRoutes.map((route, rIdx) => {
                    return (
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
                                        <p className="text-[8px] text-slate-400 font-black uppercase mt-1">Auditado OK</p>
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
                            <button 
                              className="flex-1 py-5 bg-slate-950 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-2xl"
                            >
                              Confirmar Despacho M7
                            </button>
                          </div>
                      </div>
                    );
                 })}
               </div>
             )}
          </div>
        )}

        <div className="w-full lg:w-96 bg-white p-10 rounded-[4rem] shadow-2xl border border-slate-100 flex flex-col gap-10 shrink-0 overflow-hidden animate-in slide-in-from-right-8">
           <div className="space-y-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-b pb-4">Activos de Planificación</h3>
              <div className="grid grid-cols-1 gap-4">
                 <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Facturas con Inventario Auditado</p>
                    <p className="text-4xl font-black">{validInvoices.length}</p>
                    <p className="text-[9px] font-bold text-slate-500 mt-4 uppercase tracking-widest">APTAS PARA DESPACHO</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Vehículos en Base</p>
                    <p className="text-4xl font-black text-slate-900">{availableVehicles.length}</p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {auditModal?.isOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="bg-white w-full max-w-lg rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/5">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ${auditModal.action === 'REMOVE' ? 'bg-red-600' : 'bg-emerald-500'} text-slate-950`}><Icons.Audit /></div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter leading-none">Auditoría de Ruta</h3>
                 </div>
                 <button onClick={() => setAuditModal(null)} className="text-4xl font-thin">×</button>
              </div>
              <div className="p-10 space-y-8 bg-slate-50/20">
                 <textarea 
                   value={auditComment}
                   onChange={e => setAuditComment(e.target.value)}
                   placeholder="Justificación del movimiento manual..."
                   className="w-full p-8 bg-white border-2 border-slate-100 rounded-[2.5rem] font-bold text-sm outline-none focus:border-emerald-500 transition-all min-h-[150px]"
                 ></textarea>
                 <button onClick={confirmAuditAction} disabled={!auditComment.trim()} className="w-full py-6 bg-slate-950 text-white rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-20">Confirmar Ajuste</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;
