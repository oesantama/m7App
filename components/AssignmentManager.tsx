
import React, { useState, useMemo } from 'react';
import { Icons, INITIAL_CLIENTS } from '../constants';
import { Vehicle, Driver, VehicleAssignment, User, VehicleStatus } from '../types';

interface AssignmentManagerProps {
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: VehicleAssignment[];
  user: User;
  onAssign: (vId: string, dId: string, cId: string) => void;
  onEndAssignment: (aId: string) => void;
}

const AssignmentManager: React.FC<AssignmentManagerProps> = ({ 
  vehicles, drivers, assignments, user, onAssign, onEndAssignment 
}) => {
  const [selectedClient, setSelectedClient] = useState(user.clientId !== 'GLOBAL' ? user.clientId : 'c1');
  const [showHistory, setShowHistory] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const isSuperUser = user.roleId === 'ROL-01';
  const assignmentPerms = user.permissions.find(p => p.module === 'PAG-OP-05');
  const canCreate = isSuperUser || assignmentPerms?.actions.includes('create');
  const canEdit = isSuperUser || assignmentPerms?.actions.includes('edit');

  const activeAssignments = useMemo(() => 
    assignments.filter(a => a.isActive && (user.clientId === 'GLOBAL' || a.clientId === user.clientId)),
    [assignments, user.clientId]
  );

  const historyAssignments = useMemo(() => 
    assignments.filter(a => !a.isActive && (user.clientId === 'GLOBAL' || a.clientId === user.clientId)),
    [assignments, user.clientId]
  );

  // Vehículos del cliente actual que no tienen conductor hoy
  const pendingVehicles = useMemo(() => 
    vehicles.filter(v => v.clientId === selectedClient && !activeAssignments.some(a => a.vehicleId === v.id)),
    [vehicles, selectedClient, activeAssignments]
  );

  // Conductores del cliente actual que están libres hoy
  const availableDrivers = useMemo(() => 
    drivers.filter(d => d.clientId === selectedClient && d.status === 'Activo' && !activeAssignments.some(a => a.driverId === d.id)),
    [drivers, selectedClient, activeAssignments]
  );

  const handleAutoSuggest = () => {
    setIsSuggesting(true);
    // Simulación de lógica inteligente: busca en el historial la última pareja exitosa
    setTimeout(() => {
      pendingVehicles.forEach(v => {
        const lastAssigned = historyAssignments.find(h => h.vehicleId === v.id);
        const driverStillAvailable = availableDrivers.find(d => d.id === lastAssigned?.driverId);
        
        if (driverStillAvailable) {
          onAssign(v.id, driverStillAvailable.id, selectedClient);
        }
      });
      setIsSuggesting(false);
    }, 800);
  };

  return (
    <div className="space-y-8 animate-in fade-in h-full">
      {/* Header Inteligente */}
      <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 mb-10">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-emerald-500 shadow-xl">
              <Icons.Link />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Despacho Diario M7</h2>
              <p className="text-slate-500 font-bold mt-2 uppercase text-[10px] tracking-widest">Planificación de Tripulaciones y Activos</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 w-full xl:w-auto">
            <select 
              value={selectedClient} 
              onChange={(e) => setSelectedClient(e.target.value)}
              className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500"
            >
              {INITIAL_CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {canCreate && !showHistory && (
              <button 
                onClick={handleAutoSuggest}
                disabled={isSuggesting || pendingVehicles.length === 0}
                className="bg-emerald-500 text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all flex items-center gap-3 disabled:opacity-30"
              >
                {isSuggesting ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent animate-spin rounded-full"></div> : <Icons.Scan />}
                SUGERIR VÍNCULOS POR HISTORIAL
              </button>
            )}

            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 shadow-xl transition-all"
            >
              {showHistory ? 'Volver al Plan' : 'Ver Histórico'}
            </button>
          </div>
        </div>

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
                  <div key={v.id} className="bg-slate-50 p-6 rounded-3xl border-2 border-dashed border-slate-200 flex justify-between items-center group hover:bg-white hover:border-emerald-500 transition-all">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 font-black text-xs shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all">{v.plate.slice(0,3)}</div>
                       <div>
                          <p className="font-black text-slate-900 uppercase">{v.plate}</p>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{v.brand} • {v.capacityM3}m³</p>
                       </div>
                    </div>
                    <select 
                      onChange={(e) => onAssign(v.id, e.target.value, selectedClient)}
                      className="bg-white border-2 border-slate-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                    >
                      <option value="">Asignar Conductor...</option>
                      {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
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
                    <div key={a.id} className="bg-white p-6 rounded-3xl border-2 border-emerald-100 shadow-xl flex justify-between items-center group animate-in slide-in-from-right-4">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><Icons.Truck /></div>
                        <div>
                          <p className="font-black text-slate-900 uppercase text-sm">{v?.plate} <span className="text-emerald-500 mx-2">↔</span> {d?.name.split(' ')[0]}</p>
                          <p className="text-[9px] text-slate-400 font-black uppercase mt-1">Vínculo Activo M7 Operaciones</p>
                        </div>
                      </div>
                      <button onClick={() => onEndAssignment(a.id)} className="p-3 bg-slate-50 text-slate-300 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Icons.X /></button>
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
                    <p className="font-black text-slate-900 uppercase text-xs">{vehicles.find(v => v.id === a.vehicleId)?.plate} <span className="text-slate-300 mx-4">|</span> {drivers.find(d => d.id === a.driverId)?.name}</p>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Cierre: {new Date(a.updatedAt).toLocaleDateString()}</p>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignmentManager;
