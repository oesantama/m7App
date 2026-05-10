import React, { useState, useEffect, useMemo } from 'react';
import { X, History, Sparkles, AlertTriangle, CheckCircle, Truck, Package, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { Invoice, Vehicle } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface HistoricoGroupingProps {
  isOpen: boolean;
  onClose: () => void;
  pendingInvoices: Invoice[];
  vehicles: Vehicle[];
  clientId: string;
  onApplyGrouping: (groups: Array<{ vehicle: Vehicle; invoices: Invoice[]; title: string }>) => void;
}

export const HistoricoGrouping: React.FC<HistoricoGroupingProps> = ({
  isOpen,
  onClose,
  pendingInvoices,
  vehicles,
  clientId,
  onApplyGrouping,
}) => {
  const [loading, setLoading] = useState(false);
  const [deliveryPatterns, setDeliveryPatterns] = useState<any[]>([]);
  const [routingPatterns, setRoutingPatterns] = useState<any[]>([]);
  const [recentRoutes, setRecentRoutes] = useState<any[]>([]);

  // Agrupaciones propuestas
  const [proposedGroups, setProposedGroups] = useState<Array<{
    vehicle: Vehicle;
    invoices: Invoice[];
    title: string;
    totalVolume: number;
    utilization: number;
  }>>([]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadHistoryData();
    }
  }, [isOpen]);

  const loadHistoryData = async () => {
    setLoading(true);
    try {
      const [delPats, routPats, routes] = await Promise.all([
        (api as any).getDeliveryPatterns().catch(() => []),
        (api as any).getRoutingPatterns().catch(() => []),
        api.getRoutes().catch(() => []),
      ]);
      setDeliveryPatterns(Array.isArray(delPats) ? delPats : []);
      setRoutingPatterns(Array.isArray(routPats) ? routPats : []);
      setRecentRoutes(Array.isArray(routes) ? routes : []);
    } catch (e) {
      console.error('Error al cargar datos históricos', e);
      toast.error('Error al consultar bases de datos de patrones históricos.');
    } finally {
      setLoading(false);
    }
  };

  // Algoritmo de Agrupación Histórica con validación estricta de 28 facturas y 90% capacidad
  useEffect(() => {
    if (!isOpen || pendingInvoices.length === 0 || vehicles.length === 0) return;

    // 1. Organizar vehículos por capacidad descendente
    const activeVehicles = [...vehicles].filter(v => {
      const vStatus = String(v.status || '').toUpperCase();
      const vStatusId = String((v as any).statusId || (v as any).status_id || '').toUpperCase();
      return vStatus === 'DISPONIBLE' || vStatusId === 'EST-01';
    });
    if (activeVehicles.length === 0) {
      setProposedGroups([]);
      return;
    }

    // Mapa de patrones para búsqueda rápida
    const delPatternMap = new Map<string, any>();
    deliveryPatterns.forEach(p => {
      if (p.address_key && p.vehicle_id) {
        delPatternMap.set(p.address_key.toLowerCase().trim(), p);
      }
    });

    const routPatternMap = new Map<string, any>();
    routingPatterns.forEach(p => {
      const key = `${p.city || ''}|${p.neighborhood || ''}`.toUpperCase().trim();
      routPatternMap.set(key, p);
    });

    // Mapear facturas asignando puntuaciones/afinidades con vehículos
    const groupsMap = new Map<string, Invoice[]>();

    pendingInvoices.forEach(inv => {
      let matchedVehicleId = '';

      // Paso A: Buscar coincidencia exacta en patrones de entrega (dirección + ciudad)
      const addrKey = `${inv.address || ''}|${inv.city || ''}`.toLowerCase().trim();
      const matchedDelPattern = delPatternMap.get(addrKey);
      if (matchedDelPattern && matchedDelPattern.vehicle_id) {
        matchedVehicleId = String(matchedDelPattern.vehicle_id);
      }

      // Paso B: Si no, buscar coincidencia por barrio + ciudad
      if (!matchedVehicleId) {
        const routKey = `${inv.city || ''}|${(inv as any).neighborhood || ''}`.toUpperCase().trim();
        const matchedRoutPattern = routPatternMap.get(routKey);
        if (matchedRoutPattern && matchedRoutPattern.vehicle_id) {
          matchedVehicleId = String(matchedRoutPattern.vehicle_id);
        }
      }

      // Paso C: Si no, buscar si el cliente ya fue asignado en rutas recientes (últimos 7 días)
      if (!matchedVehicleId) {
        const matchingRecentRoute = recentRoutes.find(r => 
          (r.invoice_ids || []).includes(inv.id) ||
          String(r.driver_name || '').toUpperCase() === String(inv.customerName || '').toUpperCase()
        );
        if (matchingRecentRoute && matchingRecentRoute.vehicle_id) {
          matchedVehicleId = String(matchingRecentRoute.vehicle_id);
        }
      }

      // Paso D: Fallback si no hay historial: Agrupar por Ciudad y Barrio más cercano
      if (!matchedVehicleId) {
        // Encontrar un vehículo común que cubra la misma ciudad
        const cityMatch = routingPatterns.find(p => String(p.city).toUpperCase() === String(inv.city).toUpperCase());
        if (cityMatch && cityMatch.vehicle_id) {
          matchedVehicleId = String(cityMatch.vehicle_id);
        } else {
          // Asignar al vehículo por defecto (primero disponible)
          matchedVehicleId = String(activeVehicles[0].id);
        }
      }

      // Validar si el vehículo asignado realmente existe y está disponible
      const vehicleExists = activeVehicles.some(v => String(v.id) === matchedVehicleId);
      const finalVehicleId = vehicleExists ? matchedVehicleId : String(activeVehicles[0].id);

      if (!groupsMap.has(finalVehicleId)) {
        groupsMap.set(finalVehicleId, []);
      }
      groupsMap.get(finalVehicleId)!.push(inv);
    });

    // 2. Aplicar validación estricta de 28 facturas y 90% capacidad, creando subgrupos si es necesario
    const groupsList: Array<{
      vehicle: Vehicle;
      invoices: Invoice[];
      title: string;
      totalVolume: number;
      utilization: number;
    }> = [];

    groupsMap.forEach((invs, vId) => {
      const vehicle = activeVehicles.find(v => String(v.id) === vId) || activeVehicles[0];
      const maxInvoices = 28;
      const maxCapacityVolume = 0.9 * (Number(vehicle.capacityM3 || (vehicle as any).capacity_m3) || 30);

      let currentSubgroupInvoices: Invoice[] = [];
      let currentSubgroupVolume = 0;
      let subgroupIndex = 1;

      const addSubgroup = (list: Invoice[]) => {
        const vol = list.reduce((sum, item) => sum + (Number(item.volumeM3) || 0), 0);
        const cap = Number(vehicle.capacityM3 || (vehicle as any).capacity_m3) || 30;
        const util = Math.round((vol / cap) * 100);
        const title = subgroupIndex > 1 ? `${vehicle.plate} (Parte ${subgroupIndex})` : vehicle.plate;

        groupsList.push({
          vehicle,
          invoices: [...list],
          title,
          totalVolume: Number(vol.toFixed(2)),
          utilization: util,
        });
        subgroupIndex++;
      };

      invs.forEach(inv => {
        const invVol = Number(inv.volumeM3) || 0;

        // Comprobar si añadir la factura viola el límite de 28 facturas o el 90% de volumen
        if (
          currentSubgroupInvoices.length >= maxInvoices ||
          (currentSubgroupVolume + invVol) > maxCapacityVolume
        ) {
          // Guardar subgrupo anterior si tiene elementos
          if (currentSubgroupInvoices.length > 0) {
            addSubgroup(currentSubgroupInvoices);
          }
          // Resetear para nueva subdivisión
          currentSubgroupInvoices = [inv];
          currentSubgroupVolume = invVol;
        } else {
          currentSubgroupInvoices.push(inv);
          currentSubgroupVolume += invVol;
        }
      });

      // Añadir el último subgrupo remanente
      if (currentSubgroupInvoices.length > 0) {
        addSubgroup(currentSubgroupInvoices);
      }
    });

    setProposedGroups(groupsList);

    // Expandir todos por defecto
    const expanded: Record<string, boolean> = {};
    groupsList.forEach((_, idx) => {
      expanded[idx] = true;
    });
    setExpandedGroups(expanded);
  }, [isOpen, pendingInvoices, vehicles, deliveryPatterns, routingPatterns, recentRoutes]);

  if (!isOpen) return null;

  const totalAssignedInvoices = proposedGroups.reduce((acc, g) => acc + g.invoices.length, 0);
  const totalVolumeAssigned = proposedGroups.reduce((acc, g) => acc + g.totalVolume, 0);

  const toggleExpand = (idx: number) => {
    setExpandedGroups(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-950/60 backdrop-blur-sm flex items-center justify-end animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-500 rounded-l-[3rem]">
        {/* HEADER */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <History className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black uppercase tracking-tighter">Agrupación Histórica M7 IQ</h3>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md text-[8px] font-black uppercase tracking-widest">Inteligente</span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Agrupa facturas basándose en comportamiento de despachos anteriores.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all">
            <X size={18} className="text-slate-300" />
          </button>
        </div>

        {/* STATS OVERVIEW */}
        <div className="bg-slate-50 border-b border-slate-200/60 px-8 py-4 flex flex-wrap gap-6 items-center shrink-0">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Facturas Pendientes</span>
            <span className="text-lg font-black text-slate-800 leading-none">{pendingInvoices.length}</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Agrupadas con Éxito</span>
            <span className="text-lg font-black text-emerald-600 leading-none">{totalAssignedInvoices}</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Volumen Total</span>
            <span className="text-lg font-black text-slate-800 leading-none">{totalVolumeAssigned.toFixed(2)} m³</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rutas Propuestas</span>
            <span className="text-lg font-black text-slate-800 leading-none">{proposedGroups.length}</span>
          </div>

          <div className="ml-auto flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl text-[10px] text-indigo-700 font-black uppercase max-w-sm">
            <Info size={13} className="shrink-0" />
            <span>Restricción Activa: Máx 28 facturas o 90% capacidad de vehículo.</span>
          </div>
        </div>

        {/* LIST OF HISTORICAL GROUPS */}
        <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-slate-50/50 custom-scrollbar">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent animate-spin rounded-full"></div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">Analizando patrones históricos y georreferenciación...</p>
            </div>
          ) : proposedGroups.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-white rounded-3xl border border-slate-100">
              <Package size={40} className="text-slate-300 mb-4" />
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">No se generaron agrupaciones</h4>
              <p className="text-xs text-slate-400 mt-1">Verifique que posea facturas aptas para despacho y vehículos disponibles.</p>
            </div>
          ) : (
            proposedGroups.map((g, idx) => {
              const maxInvoices = 28;
              const isMaxInvs = g.invoices.length >= maxInvoices;
              const isMaxVolume = g.utilization >= 90;

              return (
                <div key={`${g.title}-${idx}`} className="bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden transition-all hover:border-slate-300">
                  {/* Grupo Cabecera */}
                  <div className="px-6 py-4 bg-slate-50 flex items-center justify-between cursor-pointer select-none" onClick={() => toggleExpand(idx)}>
                    <div className="flex items-center gap-4">
                      <button className="text-slate-400 hover:text-slate-800 transition-colors">
                        {expandedGroups[idx] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <div className="w-9 h-9 bg-slate-900 text-emerald-500 rounded-xl flex items-center justify-center font-black">
                        <Truck size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-slate-800 uppercase text-xs sm:text-sm tracking-tighter leading-none">{g.title}</h4>
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[8px] font-black rounded uppercase">
                            {g.vehicle.plate}
                          </span>
                        </div>
                        <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-wider">
                          Capacidad total vehículo: {(Number(g.vehicle.capacityM3 || (g.vehicle as any).capacity_m3) || 30).toFixed(1)} m³
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* KPI Facturas */}
                      <div className="text-right">
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Facturas</span>
                        <span className={`text-xs font-black ${isMaxInvs ? 'text-amber-600' : 'text-slate-800'}`}>
                          {g.invoices.length} <span className="text-[9px] text-slate-400 font-bold">/ 28</span>
                        </span>
                      </div>

                      {/* KPI Volumen */}
                      <div className="text-right">
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block">Volumen</span>
                        <span className={`text-xs font-black ${isMaxVolume ? 'text-amber-600' : 'text-emerald-700'}`}>
                          {g.totalVolume} m³
                        </span>
                      </div>

                      {/* Progreso de Capacidad */}
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase">{g.utilization}% ocupación</span>
                        <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${g.utilization > 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(g.utilization, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grupo Contenido (Facturas) */}
                  {expandedGroups[idx] && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-white">
                      <table className="w-full text-left text-[9px]">
                        <thead>
                          <tr className="text-slate-400 font-black uppercase tracking-wider border-b border-slate-100">
                            <th className="py-2 pl-3 w-8">#</th>
                            <th className="py-2">Factura</th>
                            <th className="py-2">Cliente</th>
                            <th className="py-2">Ciudad / Barrio</th>
                            <th className="py-2">Dirección</th>
                            <th className="py-2 text-right pr-3">m³</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {g.invoices.map((inv, iIdx) => (
                            <tr key={`${inv.id}-${iIdx}`} className="hover:bg-slate-50/50">
                              <td className="py-2 pl-3 font-bold text-slate-400">{iIdx + 1}</td>
                              <td className="py-2 font-black text-slate-800">{inv.invoiceNumber}</td>
                              <td className="py-2 font-bold text-slate-600">{inv.customerName}</td>
                              <td className="py-2 text-slate-500">
                                <span className="font-bold text-slate-700">{inv.city}</span>
                                {(inv as any).neighborhood && <span className="text-slate-400 ml-1">({(inv as any).neighborhood})</span>}
                              </td>
                              <td className="py-2 text-slate-400 font-medium truncate max-w-[200px]">{inv.address || '—'}</td>
                              <td className="py-2 text-right pr-3 font-black text-emerald-600">{(Number(inv.volumeM3) || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ACTIONS */}
        <div className="px-8 py-6 border-t border-slate-100 bg-slate-950 flex gap-4 shrink-0 justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              El motor aplicará estas agrupaciones como plan general activo.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 border border-slate-800 hover:border-slate-700 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const groups = proposedGroups.map(g => ({
                  vehicle: g.vehicle,
                  invoices: g.invoices,
                  title: g.title,
                }));
                onApplyGrouping(groups);
                onClose();
                toast.success('Agrupación histórica cargada en el plan general.');
              }}
              disabled={proposedGroups.length === 0}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-lg active:scale-95 disabled:opacity-40"
            >
              Aplicar Agrupación Histórica
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
