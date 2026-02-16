
import React, { useState, useMemo } from 'react';
import { Icons, INITIAL_CLIENTS } from '../constants';
import { Vehicle, Driver, VehicleAssignment, User, VehicleStatus, MasterRecord } from '../types';

interface AssignmentManagerProps {
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: VehicleAssignment[];
  user: User;
  clients: MasterRecord[];
  onAssign: (vId: string, dId: string, cId: string) => void;
  onEndAssignment: (aId: string) => void;
}

const AssignmentManager: React.FC<AssignmentManagerProps> = ({ 
  vehicles, drivers, assignments, user, clients, onAssign, onEndAssignment 
}) => {
  // Estado local para almacenar la selección de cliente temporal por cada vehículo (fila)
  // Clave: vehicleId, Valor: clientId seleccionado
  const [rowClients, setRowClients] = useState<{[key: string]: string}>({});
  
  // Estado local para selección de conductor (fila)
  const [rowDrivers, setRowDrivers] = useState<{[key: string]: string}>({});
  
  const [showHistory, setShowHistory] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // ... (perms and memo logic remains same)
  const isSuperUser = user.roleId === 'ROL-01';
  const assignmentPerms = user.permissions.find(p => p.module === 'PAG-05');
  const canCreate = isSuperUser || assignmentPerms?.actions.includes('create');

  // No filtrar por clientId en el frontend por ahora para debuggear visibilidad
  const activeAssignments = useMemo(() => 
    assignments.filter(a => {
      const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
      return active;
    }),
    [assignments]
  );

  const historyAssignments = useMemo(() => 
    assignments.filter(a => {
      const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
      return !active;
    }),
    [assignments]
  );

  // Vehículos pendientes: TODOS los que no tienen asignación activa actualmente
  const pendingVehicles = useMemo(() => 
    vehicles.filter(v => !activeAssignments.some(a => a.vehicleId === v.id)),
    [vehicles, activeAssignments]
  );

  // Conductores disponibles: TODOS los activos y sin asignación
  const availableDrivers = useMemo(() => 
    drivers.filter(d => d.status === 'Activo' && !activeAssignments.some(a => a.driverId === d.id)),
    [drivers, activeAssignments]
  );

  const handleAssignClick = (vehicleId: string) => {
    // Buscar cliente seleccionado para esa fila
    const selectedClientId = rowClients[vehicleId];
    const selectedDriverId = rowDrivers[vehicleId];
    
    // Si no ha seleccionado conductor
    if (!selectedDriverId) {
       alert("Por favor seleccione un CONDUCTOR para asignar.");
       return;
    }

    // Si no ha seleccionado cliente, intentar usar el del vehículo o el del conductor como fallback
    let finalClientId = selectedClientId;
    if (!finalClientId) {
      const v = vehicles.find(x => x.id === vehicleId);
      if (v && v.clientId) {
         finalClientId = v.clientId;
      } else {
        alert("Por favor seleccione el CLIENTE para esta operación.");
        return;
      }
    }
    
    onAssign(vehicleId, selectedDriverId, finalClientId);
    
    // Limpiar selección de esa fila
    setRowDrivers(prev => { const n = {...prev}; delete n[vehicleId]; return n; });
    setRowClients(prev => { const n = {...prev}; delete n[vehicleId]; return n; });
  };

  const handleAutoSuggest = () => {
    setIsSuggesting(true);
    setTimeout(() => {
      pendingVehicles.forEach(v => {
        // Buscar última asignación exitosa en historial
        const lastAssigned = historyAssignments.find(h => h.vehicleId === v.id);
        if (lastAssigned) {
          const driverStillAvailable = availableDrivers.find(d => d.id === lastAssigned.driverId);
          if (driverStillAvailable) {
             // Usar el mismo cliente que tenía en el historial
             onAssign(v.id, driverStillAvailable.id, lastAssigned.clientId);
          }
        }
      });
      setIsSuggesting(false);
    }, 800);
  };

  return (
    <div className="space-y-6 animate-in fade-in h-full">
      {/* Barra de Acciones Superior Compacta */}
      <div className="flex flex-wrap items-center gap-4 bg-white/50 p-4 rounded-3xl border border-slate-100 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 border-r border-slate-200">
           <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-emerald-500 shadow-lg">
              <Icons.Link className="w-5 h-5" />
           </div>
           <span className="font-black text-slate-800 uppercase tracking-tighter text-sm">Operativa de Vínculos</span>
        </div>

        <div className="flex flex-1 gap-2 justify-end">
            {canCreate && !showHistory && (
              <button 
                onClick={handleAutoSuggest}
                disabled={isSuggesting || pendingVehicles.length === 0}
                className="bg-emerald-500 text-slate-900 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all flex items-center gap-2 disabled:opacity-30"
              >
                {isSuggesting ? <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent animate-spin rounded-full"></div> : <Icons.Scan className="w-4 h-4" />}
                SUGERIR POR HISTORIAL
              </button>
            )}

            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 shadow-lg transition-all"
            >
              {showHistory ? 'Volver al Plan' : 'Ver Histórico'}
            </button>
        </div>
      </div>

      {/* Sugerencia IA M7 - Ahora más compacta y arriba */}
      {!showHistory && pendingVehicles.length > 0 && availableDrivers.length > 0 && (
        <div className="p-4 bg-slate-900 rounded-3xl border border-white/5 flex items-center gap-6 animate-in slide-in-from-top-2 duration-500">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg">
              <Icons.Brain className="text-slate-950 w-5 h-5" />
          </div>
          <div className="flex-1">
              <p className="text-slate-300 text-[11px] font-medium leading-tight">
                  <span className="text-emerald-400 font-black uppercase mr-2">M7 AI Analysis:</span>
                  Detecto <span className="text-white font-black">{pendingVehicles.length} vehículos</span> listos. Sugiero vincular por historial para optimizar despacho.
              </p>
          </div>
          <button onClick={handleAutoSuggest} className="px-5 py-2.5 bg-emerald-500 text-slate-950 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-emerald-400 transition-all shrink-0">
              Confirmar Vínculo IA
          </button>
        </div>
      )}

        {!showHistory ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Columna Pendientes */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Vehículos sin Tripulación ({pendingVehicles.length})</h3>
                <div className="h-1 flex-1 mx-6 bg-slate-100 rounded-full"></div>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingVehicles.map(v => (
                  <div key={v.id} className="bg-slate-50 p-6 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col gap-4 group hover:bg-white hover:border-emerald-500 transition-all">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 font-black text-xs shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0">{v.plate.slice(0,3)}</div>
                       <div>
                          <p className="font-black text-slate-900 uppercase">{v.plate}</p>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{v.brand} • {v.capacityM3}m³</p>
                       </div>
                    </div>
                    
                    {/* CONTROLES DE ASIGNACIÓN EN FILA (USER REQUEST) */}
                    <div className="flex flex-col gap-2 w-full">
                        <div className="flex gap-2">
                            <select 
                                value={rowClients[v.id] || (v.clientId || '')} 
                                onChange={(e) => setRowClients(prev => ({...prev, [v.id]: e.target.value}))}
                                className="flex-1 bg-white border border-slate-200 px-3 py-3 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                            >
                                <option value="">1. CLIENTE...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>

                            <select 
                                value={rowDrivers[v.id] || ''}
                                onChange={(e) => setRowDrivers(prev => ({...prev, [v.id]: e.target.value}))}
                                className="flex-[1.5] bg-white border border-slate-200 px-3 py-3 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                            >
                                <option value="">2. CONDUCTOR...</option>
                                {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <button 
                            onClick={() => handleAssignClick(v.id)}
                            className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg"
                        >
                            Confirmar Asignación
                        </button>
                    </div>
                  </div>
                ))}
                {pendingVehicles.length === 0 && <p className="text-center py-10 text-xs font-bold text-slate-300 italic uppercase">Toda la flota está vinculada ✓</p>}
              </div>
            </div>

            {/* Columna Activos */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-4">
                <h3 className="text-sm font-black text-emerald-500 uppercase tracking-widest">Plan de Operación Activo ({activeAssignments.length})</h3>
                <div className="h-1 flex-1 mx-6 bg-emerald-100 rounded-full"></div>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {activeAssignments.map(a => {
                  const v = vehicles.find(veh => veh.id === a.vehicleId);
                  const d = drivers.find(drv => drv.id === a.driverId);
                  return (
                    <div key={a.id} className="bg-white p-6 rounded-3xl border-2 border-emerald-100 shadow-xl flex justify-between items-center group animate-in slide-in-from-right-4 relative overflow-hidden">
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><Icons.Truck /></div>
                        <div>
                          <p className="font-black text-slate-900 uppercase text-sm">{v?.plate} <span className="text-emerald-500 mx-2">↔</span> {d?.name.split(' ')[0]}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded-md uppercase tracking-wider">
                              {clients.find(c => c.id === (a.clientId || (a as any).client_id))?.name || 'S/C'}
                            </span>
                            <p className="text-[9px] text-slate-400 font-black uppercase">Vínculo Activo M7</p>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => onEndAssignment(a.id)} 
                        className="relative z-10 w-10 h-10 bg-red-100 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                        title="Finalizar Turno"
                      >
                        <Icons.X className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-dashed border-slate-200">
             <div className="space-y-4">
                {historyAssignments.length === 0 ? <p className="text-slate-400 text-center py-20 font-black uppercase text-xs tracking-widest">Sin registros históricos</p> : historyAssignments.map(a => (
                  <div key={a.id} className="bg-white p-6 rounded-2xl border border-slate-100 flex justify-between items-center opacity-60">
                    <div>
                      <p className="font-black text-slate-900 uppercase text-xs">{vehicles.find(v => v.id === a.vehicleId)?.plate} <span className="text-slate-300 mx-4">|</span> {drivers.find(d => d.id === a.driverId)?.name}</p>
                      <p className="text-[9px] text-emerald-600 font-bold uppercase mt-1">{clients.find(c => c.id === (a.clientId || (a as any).client_id))?.name || 'Cliente Desconocido'}</p>
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Cierre: {new Date(a.updatedAt).toLocaleDateString()}</p>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>
  );
};

export default AssignmentManager;
