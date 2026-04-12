
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { Vehicle, Driver, VehicleAssignment, User, MasterRecord } from '../types';

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
  const [rowClients, setRowClients]     = useState<Record<string, string>>({});
  const [rowDrivers, setRowDrivers]     = useState<Record<string, string>>({});
  const [driverSearch, setDriverSearch] = useState<Record<string, string>>({});
  const [driverOpen, setDriverOpen]     = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory]   = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [filterPlatePending, setFilterPlatePending] = useState('');
  const [filterClientActive, setFilterClientActive] = useState('');
  const [filterPlateActive,  setFilterPlateActive]  = useState('');

  const isSuperUser    = user.roleId === 'ROL-01';
  const assignmentPerms = user.permissions.find(p => p.module === 'PAG-05');
  const canCreate      = isSuperUser || assignmentPerms?.actions.includes('create');

  const activeAssignments = useMemo(() =>
    assignments.filter(a => {
      const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
      if (!active) return false;
      const matchesClient = !filterClientActive || (a.clientId || (a as any).client_id) === filterClientActive;
      const vId = a.vehicleId || (a as any).vehicle_id;
      const plateStr = (a as any).plate || vehicles.find(v => v.id === vId)?.plate || '';
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

  const pendingVehicles = useMemo(() =>
    vehicles.filter(v => {
      const isPending  = !activeAssignments.some(a => (a.vehicleId || (a as any).vehicle_id) === v.id);
      const matchPlate = !filterPlatePending || v.plate.toLowerCase().includes(filterPlatePending.toLowerCase());
      return isPending && matchPlate;
    }),
    [vehicles, activeAssignments, filterPlatePending]
  );

  const availableDrivers = useMemo(() =>
    drivers.filter(d =>
      (d.status === 'Activo' || d.statusId === 'EST-01') &&
      !activeAssignments.some(a => (a.driverId || (a as any).driver_id) === d.id)
    ),
    [drivers, activeAssignments]
  );

  const handleAssign = (vehicleId: string) => {
    const dId = rowDrivers[vehicleId];
    if (!dId) { alert('Seleccione un CONDUCTOR.'); return; }
    let cId = rowClients[vehicleId];
    if (!cId) {
      const v = vehicles.find(x => x.id === vehicleId);
      if (v?.clientId) cId = v.clientId;
      else { alert('Seleccione el CLIENTE.'); return; }
    }
    onAssign(vehicleId, dId, cId);
    setRowDrivers(p => { const n = {...p}; delete n[vehicleId]; return n; });
    setRowClients(p => { const n = {...p}; delete n[vehicleId]; return n; });
  };

  const handleAutoSuggest = () => {
    setIsSuggesting(true);
    setTimeout(() => {
      pendingVehicles.forEach(v => {
        const last = historyAssignments.find(h => (h.vehicleId || (h as any).vehicle_id) === v.id);
        if (last) {
          const dId = last.driverId || (last as any).driver_id;
          const cId = last.clientId || (last as any).client_id;
          const driverOk = availableDrivers.find(d => d.id === dId);
          if (driverOk) onAssign(v.id, dId, cId);
        }
      });
      setIsSuggesting(false);
    }, 800);
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-emerald-500 shadow-md">
            <Icons.Link className="w-4 h-4" />
          </div>
          <span className="font-black text-slate-800 uppercase tracking-tighter text-sm">Operativa de Vínculos</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {canCreate && !showHistory && (
            <button
              onClick={handleAutoSuggest}
              disabled={isSuggesting || pendingVehicles.length === 0}
              className="flex items-center gap-2 bg-emerald-500 text-slate-900 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-emerald-400 transition-all disabled:opacity-30 whitespace-nowrap"
            >
              {isSuggesting
                ? <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent animate-spin rounded-full" />
                : <Icons.Scan className="w-3.5 h-3.5" />}
              Sugerir por Historial
            </button>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="bg-slate-900 text-white px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-700 shadow-md transition-all whitespace-nowrap"
          >
            {showHistory ? 'Volver al Plan' : 'Ver Histórico'}
          </button>
        </div>
      </div>

      {/* ── CONTENIDO ──────────────────────────────────────────────── */}
      {!showHistory ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── COLUMNA PENDIENTES ─────────────────────────── */}
          <div className="flex flex-col gap-3">
            {/* Título + filtro */}
            <div className="flex flex-col gap-2 bg-white rounded-2xl border border-slate-100 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Vehículos sin Tripulación
                </span>
                <span className="ml-auto bg-slate-100 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-full">
                  {pendingVehicles.length}
                </span>
              </div>
              <div className="relative">
                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por placa..."
                  value={filterPlatePending}
                  onChange={e => setFilterPlatePending(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Lista */}
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {pendingVehicles.length === 0 && (
                <p className="text-center py-12 text-xs font-bold text-slate-300 uppercase tracking-widest">
                  Toda la flota está vinculada ✓
                </p>
              )}
              {pendingVehicles.map(v => (
                <div key={v.id} className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-4 flex flex-col gap-3 hover:border-emerald-400 transition-all group">
                  {/* Info vehículo */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 group-hover:bg-slate-900 rounded-xl flex items-center justify-center font-black text-[10px] text-slate-500 group-hover:text-white transition-all shrink-0">
                      {v.plate.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 uppercase text-sm truncate">{v.plate}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">{v.brand} · {v.capacityM3}m³</p>
                    </div>
                  </div>

                  {/* Selects + botón */}
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Cliente */}
                      <select
                        value={rowClients[v.id] || v.clientId || ''}
                        onChange={e => setRowClients(p => ({...p, [v.id]: e.target.value}))}
                        className="bg-slate-50 border border-slate-200 px-2 py-2.5 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all w-full"
                      >
                        <option value="">1. Cliente...</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>

                      {/* Conductor searchable */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setDriverOpen(p => ({...p, [v.id]: !p[v.id]}))}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-2.5 rounded-xl text-[9px] font-black uppercase text-left flex items-center justify-between gap-1 focus:border-emerald-500 transition-all"
                        >
                          <span className={`truncate ${rowDrivers[v.id] ? 'text-slate-900' : 'text-slate-400'}`}>
                            {rowDrivers[v.id]
                              ? availableDrivers.find(d => d.id === rowDrivers[v.id])?.name?.split(' ')[0] || '2. Conductor...'
                              : '2. Conductor...'}
                          </span>
                          <Icons.ChevronRight className="w-3 h-3 text-slate-400 shrink-0 rotate-90" />
                        </button>
                        {driverOpen[v.id] && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                            <div className="p-2 border-b border-slate-100">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Buscar..."
                                value={driverSearch[v.id] || ''}
                                onChange={e => setDriverSearch(p => ({...p, [v.id]: e.target.value}))}
                                onClick={e => e.stopPropagation()}
                                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-bold uppercase outline-none focus:border-emerald-400"
                              />
                            </div>
                            <div className="max-h-44 overflow-y-auto">
                              {availableDrivers
                                .filter(d => d.name.toUpperCase().includes((driverSearch[v.id] || '').toUpperCase()))
                                .map(d => (
                                  <button key={d.id} type="button"
                                    onClick={() => {
                                      setRowDrivers(p => ({...p, [v.id]: d.id}));
                                      setDriverOpen(p => ({...p, [v.id]: false}));
                                      setDriverSearch(p => ({...p, [v.id]: ''}));
                                    }}
                                    className="w-full text-left px-3 py-2 text-[9px] font-black uppercase hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                  >
                                    {d.name}
                                  </button>
                                ))}
                              {availableDrivers.filter(d => d.name.toUpperCase().includes((driverSearch[v.id] || '').toUpperCase())).length === 0 && (
                                <p className="px-3 py-3 text-[9px] text-slate-400 font-bold uppercase text-center">Sin resultados</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleAssign(v.id)}
                      className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-500 hover:text-slate-900 transition-all shadow-sm"
                    >
                      Confirmar Asignación
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── COLUMNA ACTIVOS ────────────────────────────── */}
          <div className="flex flex-col gap-3">
            {/* Título + filtros */}
            <div className="flex flex-col gap-2 bg-white rounded-2xl border border-emerald-100 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">
                  Plan de Operación Activo
                </span>
                <span className="ml-auto bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                  {activeAssignments.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filterClientActive}
                  onChange={e => setFilterClientActive(e.target.value)}
                  className="bg-white border border-emerald-100 px-2 py-2 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                >
                  <option value="">Todos los clientes</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="relative">
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-400" />
                  <input
                    type="text"
                    placeholder="Placa..."
                    value={filterPlateActive}
                    onChange={e => setFilterPlateActive(e.target.value)}
                    className="w-full bg-white border border-emerald-100 pl-8 pr-2 py-2 rounded-xl text-[9px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Lista activos */}
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {activeAssignments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
                    <Icons.Truck className="w-6 h-6 text-slate-200" />
                  </div>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin vínculos activos</p>
                </div>
              )}
              {activeAssignments.map(a => {
                const vId = a.vehicleId || (a as any).vehicle_id;
                const dId = a.driverId  || (a as any).driver_id;
                const cId = a.clientId  || (a as any).client_id;
                const plate      = (a as any).plate       || vehicles.find(v => v.id === vId)?.plate || 'S/P';
                const driverName = (a as any).driver_name || drivers.find(d => d.id === dId)?.name   || 'S/C';
                const clientName = clients.find(c => c.id === cId)?.name || 'S/C';
                const createdAt  = (a as any).created_at  ? new Date((a as any).created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
                return (
                  <div key={a.id} className="bg-white rounded-2xl border-2 border-emerald-100 shadow-sm p-4 flex items-center gap-3 group hover:border-emerald-400 transition-all">
                    <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      <Icons.Truck className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 uppercase text-sm leading-tight truncate">
                        {plate} <span className="text-emerald-500 mx-1">↔</span> {driverName.split(' ').slice(0, 2).join(' ')}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black rounded-md uppercase truncate max-w-[120px]">
                          {clientName}
                        </span>
                        {createdAt && (
                          <span className="text-[8px] text-slate-400 font-bold">{createdAt}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onEndAssignment(a.id)}
                      className="w-9 h-9 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center shrink-0 shadow-sm"
                      title="Finalizar Turno"
                    >
                      <Icons.X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      ) : (
        /* ── HISTÓRICO ─────────────────────────────────────────────── */
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm flex items-center gap-2">
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Historial de Vínculos</span>
            <span className="ml-auto bg-slate-100 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-full">
              {historyAssignments.length}
            </span>
          </div>

          {historyAssignments.length === 0 ? (
            <p className="text-center py-16 text-xs font-bold text-slate-300 uppercase tracking-widest">Sin registros históricos</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto pr-1">
              {historyAssignments.map(a => {
                const vId = a.vehicleId || (a as any).vehicle_id;
                const dId = a.driverId  || (a as any).driver_id;
                const cId = a.clientId  || (a as any).client_id;
                const plate      = (a as any).plate       || vehicles.find(v => v.id === vId)?.plate || 'S/P';
                const driverName = (a as any).driver_name || drivers.find(d => d.id === dId)?.name   || 'S/C';
                const clientName = clients.find(c => c.id === cId)?.name || 'S/C';
                const closed     = a.updatedAt || (a as any).updated_at;
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-wrap items-center gap-3 opacity-70 hover:opacity-100 transition-all">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                      <Icons.Truck className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 uppercase text-xs truncate">
                        {plate} <span className="text-slate-300 mx-1">|</span> {driverName}
                      </p>
                      <p className="text-[9px] text-emerald-600 font-bold uppercase mt-0.5">{clientName}</p>
                    </div>
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest whitespace-nowrap shrink-0">
                      {closed ? new Date(closed).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AssignmentManager;
