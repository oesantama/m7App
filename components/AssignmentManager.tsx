
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
  const [driverSearch, setDriverSearch] = useState<{[key: string]: string}>({});
  const [driverDropdownOpen, setDriverDropdownOpen] = useState<{[key: string]: boolean}>({});
  
  const [showHistory, setShowHistory] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  // Filtros
  const [filterPlatePending, setFilterPlatePending] = useState('');
  const [filterClientActive, setFilterClientActive] = useState('');
  const [filterPlateActive, setFilterPlateActive] = useState('');

  // ... (perms and memo logic remains same)
  const isSuperUser = user.roleId === 'ROL-01';
  const assignmentPerms = user.permissions.find(p => p.module === 'PAG-05');
  const canCreate = isSuperUser || assignmentPerms?.actions.includes('create');

  // No filtrar por clientId en el frontend por ahora para debuggear visibilidad
  const activeAssignments = useMemo(() => 
    assignments.filter(a => {
      const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
      if (!active) return false;

      // Aplicar filtros
      const matchesClient = !filterClientActive || (a.clientId || (a as any).client_id) === filterClientActive;
      const vId = a.vehicleId || (a as any).vehicle_id;
      const plateStr = (a as any).plate || vehicles.find(veh => veh.id === vId)?.plate || '';
      const matchesPlate = !filterPlateActive || plateStr.toLowerCase().includes(filterPlateActive.toLowerCase());

      return matchesClient && matchesPlate;
    }),
    [assignments, filterClientActive, filterPlateActive, vehicles]
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
    vehicles.filter(v => {
      const isPending = !activeAssignments.some(a => (a.vehicleId || (a as any).vehicle_id) === v.id);
      const matchesPlate = !filterPlatePending || v.plate.toLowerCase().includes(filterPlatePending.toLowerCase());
      return isPending && matchesPlate;
    }),
    [vehicles, activeAssignments, filterPlatePending]
  );

  // Conductores disponibles: TODOS los activos y sin asignación
  const availableDrivers = useMemo(() => 
    drivers.filter(d => (d.status === 'Activo' || d.statusId === 'EST-01') && !activeAssignments.some(a => (a.driverId || (a as any).driver_id) === d.id)),
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



        {!showHistory ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Columna Pendientes */}
            <div className="space-y-6">
              <div className="flex flex-col gap-4 px-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Vehículos sin Tripulación ({pendingVehicles.length})</h3>
                  <div className="h-1 flex-1 ml-6 bg-slate-100 rounded-full"></div>
                </div>
                {/* Filtro por Placa */}
                <div className="relative">
                  <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="BUSCAR POR PLACA..."
                    value={filterPlatePending}
                    onChange={(e) => setFilterPlatePending(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                  />
                </div>
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

                            {/* Conductor searchable dropdown */}
                            <div className="flex-[1.5] relative">
                              <button
                                type="button"
                                onClick={() => setDriverDropdownOpen(prev => ({...prev, [v.id]: !prev[v.id]}))}
                                className="w-full bg-white border border-slate-200 px-3 py-3 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all text-left flex items-center justify-between"
                              >
                                <span className={rowDrivers[v.id] ? 'text-slate-900' : 'text-slate-400'}>
                                  {rowDrivers[v.id] ? availableDrivers.find(d => d.id === rowDrivers[v.id])?.name || '2. CONDUCTOR...' : '2. CONDUCTOR...'}
                                </span>
                                <Icons.ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0 rotate-90" />
                              </button>
                              {driverDropdownOpen[v.id] && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                  <div className="p-2 border-b border-slate-100">
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="Buscar conductor..."
                                      value={driverSearch[v.id] || ''}
                                      onChange={(e) => setDriverSearch(prev => ({...prev, [v.id]: e.target.value}))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-bold uppercase outline-none focus:border-emerald-400"
                                    />
                                  </div>
                                  <div className="max-h-48 overflow-y-auto">
                                    {availableDrivers
                                      .filter(d => d.name.toUpperCase().includes((driverSearch[v.id] || '').toUpperCase()))
                                      .map(d => (
                                        <button
                                          key={d.id}
                                          type="button"
                                          onClick={() => {
                                            setRowDrivers(prev => ({...prev, [v.id]: d.id}));
                                            setDriverDropdownOpen(prev => ({...prev, [v.id]: false}));
                                            setDriverSearch(prev => ({...prev, [v.id]: ''}));
                                          }}
                                          className="w-full text-left px-3 py-2 text-[9px] font-black uppercase hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                        >
                                          {d.name}
                                        </button>
                                      ))
                                    }
                                    {availableDrivers.filter(d => d.name.toUpperCase().includes((driverSearch[v.id] || '').toUpperCase())).length === 0 && (
                                      <p className="px-3 py-3 text-[9px] text-slate-400 font-bold uppercase text-center">Sin resultados</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
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
              <div className="flex flex-col gap-4 px-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-emerald-500 uppercase tracking-widest">Plan de Operación Activo ({activeAssignments.length})</h3>
                  <div className="h-1 flex-1 ml-6 bg-emerald-100 rounded-full"></div>
                </div>
                {/* Filtros Activos */}
                <div className="grid grid-cols-2 gap-2">
                  <select 
                    value={filterClientActive}
                    onChange={(e) => setFilterClientActive(e.target.value)}
                    className="bg-white border border-emerald-100 px-3 py-3 rounded-2xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all shadow-sm"
                  >
                    <option value="">TODOS LOS CLIENTES</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="relative">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500" />
                    <input 
                      type="text"
                      placeholder="PLACA..."
                      value={filterPlateActive}
                      onChange={(e) => setFilterPlateActive(e.target.value)}
                      className="w-full bg-white border border-emerald-100 pl-8 pr-3 py-3 rounded-2xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {activeAssignments.map(a => {
                  // El API retorna snake_case; el store puede tener camelCase o snake_case
                  const vId = a.vehicleId || (a as any).vehicle_id;
                  const dId = a.driverId   || (a as any).driver_id;
                  const cId = a.clientId   || (a as any).client_id;
                  // Usar plate/driver_name del API directamente si están disponibles, sino buscar en arrays
                  const plate      = (a as any).plate      || vehicles.find(veh => veh.id === vId)?.plate      || vId || 'S/P';
                  const driverName = (a as any).driver_name || drivers.find(drv => drv.id === dId)?.name       || dId || 'S/C';
                  const clientName = clients.find(c => c.id === cId)?.name || cId || 'S/C';
                  return (
                    <div key={a.id} className="bg-white p-6 rounded-3xl border-2 border-emerald-100 shadow-xl flex justify-between items-center group animate-in slide-in-from-right-4 relative overflow-hidden">
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><Icons.Truck /></div>
                        <div>
                          <p className="font-black text-slate-900 uppercase text-sm">{plate} <span className="text-emerald-500 mx-2">↔</span> {driverName.split(' ')[0]}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded-md uppercase tracking-wider">
                              {clientName}
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
                      <p className="font-black text-slate-900 uppercase text-xs">
                        {(a as any).plate || vehicles.find(v => v.id === (a.vehicleId || (a as any).vehicle_id))?.plate || 'S/P'}
                        <span className="text-slate-300 mx-4">|</span>
                        {(a as any).driver_name || drivers.find(d => d.id === (a.driverId || (a as any).driver_id))?.name || 'S/C'}
                      </p>
                      <p className="text-[9px] text-emerald-600 font-bold uppercase mt-1">
                        {clients.find(c => c.id === (a.clientId || (a as any).client_id))?.name || 'Cliente Desconocido'}
                      </p>
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Cierre: {new Date(a.updatedAt || (a as any).updated_at).toLocaleDateString()}</p>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>
  );
};

export default AssignmentManager;
