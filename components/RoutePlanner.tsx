
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Invoice, Vehicle, Route, VehicleStatus, Driver, VehicleAssignment, DocumentL, DocStatus, RouteLog, User } from '../types';
import { Icons, INITIAL_CLIENTS } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';

interface RoutePlannerProps {
  invoices: Invoice[];
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: VehicleAssignment[];
  documents: DocumentL[];
  activeRoutes: Route[]; // Nueva prop
  user: User;
  onAssign: (vId: string, dId: string, cId: string) => void;
  onSaveRoute: (route: Partial<Route>) => void;
  onRefresh?: () => void;
}

const M7_HUB_ORIGIN = {
  lat: 6.110595,
  lng: -75.641505,
  address: "CR 48C N°100 Sur - 72 Bodega 4 y 10, La Tablaza"
};

interface RoutingPattern {
  city: string;
  vehicle_id: string;
  strength: number;
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
  invoices, vehicles, drivers, assignments, documents, activeRoutes, user, onAssign, onSaveRoute, onRefresh
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const [selectedClient, setSelectedClient] = useState(user.clientId || 'c1');
  const [suggestedRoutes, setSuggestedRoutes] = useState<SuggestedRoute[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [viewMode, setViewMode] = useState<'intelligence' | 'map' | 'active'>('intelligence');

  const [auditLogs, setAuditLogs] = useState<RouteLog[]>([]);
  const [learningPatterns, setLearningPatterns] = useState<RoutingPattern[]>([]);
  const [learningExemptions, setLearningExemptions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [auditModal, setAuditModal] = useState<{ isOpen: boolean; action: any; data: any } | null>(null);
  const [auditComment, setAuditComment] = useState('');
  const [addInvoiceModal, setAddInvoiceModal] = useState<{ isOpen: boolean; routeIndex: number | null }>({ isOpen: false, routeIndex: null });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<Invoice | null>(null);
  const [lastReadjustmentResult, setLastReadjustmentResult] = useState<{ docs: number, facts: number, unrouted: number, docIds: string[] } | null>(null);
  const [dispatchConfirmation, setDispatchConfirmation] = useState<{ isOpen: boolean, route: SuggestedRoute | null, isMass: boolean }>({ isOpen: false, route: null, isMass: false });
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [swapVehicleModal, setSwapVehicleModal] = useState<{ isOpen: boolean; routeIndex: number | null }>({ isOpen: false, routeIndex: null });
  const [readjustmentModal, setReadjustmentModal] = useState<{ isOpen: boolean; selectedDocIds: Set<string> }>({ isOpen: false, selectedDocIds: new Set() });
  const [expandedDocLId, setExpandedDocLId] = useState<string | null>(null);
  const [capacityAlert, setCapacityAlert] = useState<{
    isOpen: boolean;
    type: 'warning' | 'error';
    message: string;
    onConfirm?: () => void;
    confirmLabel?: string;
  }>({ isOpen: false, type: 'warning', message: '' });

  const handleDeleteDocument = async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar este Documento Maestro? Esta acción ocultará sus facturas de la planificación activa.')) return;
    try {
      const res = await api.deleteDocument(id, user.name);
      if (res.success) {
        toast.success('Documento eliminado correctamente');
        if (onRefresh) onRefresh();
      } else {
        toast.error('Error al intentar eliminar');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  // FILTRADO DE FACTURAS APTAS: Real (basado en lo que viene del API de facturas)
  const validInvoices = useMemo(() => {
    // REGLA M7: Solo planificar items en estado 'Pendiente' o 'Auditado'
    const filtered = invoices.filter(inv => {
      if (learningExemptions.includes(inv.id)) return false;
      const s = String(inv.status || '').toUpperCase();
      return s === 'PENDIENTE' || s === 'AUDITADO';
    });

    return filtered;
  }, [invoices, learningExemptions]);

  // Facturas que NO están en ninguna ruta sugerida
  const unassignedInvoices = useMemo(() => {
    const assignedIds = new Set(suggestedRoutes.flatMap(r => r.assignedInvoices.map(i => i.id)));
    return validInvoices.filter(inv => !assignedIds.has(inv.id));
  }, [validInvoices, suggestedRoutes]);

  // DESGLOSE DE PENDIENTES POR TIPO DE PLAN (Solicitud Usuario)
  const unassignedCounts = useMemo(() => {
    let planR = 0;
    let planNormal = 0;
    unassignedInvoices.forEach(inv => {
      const doc = documents.find(d => d.id === inv.docLId);
      if (doc?.planType === 'Plan R') planR++;
      else planNormal++;
    });
    return { planR, planNormal };
  }, [unassignedInvoices, documents]);

  // Carga inicial de patrones de aprendizaje
  useEffect(() => {
    api.getRoutingPatterns().then(data => {
      if (Array.isArray(data)) {
        // console.log(`[M7-INTELLIGENCE] Cargados ${data.length} patrones de aprendizaje regenerativo.`);
        setLearningPatterns(data);
      }
    }).catch(err => console.error("Error cargando patrones IA:", err));
  }, [onRefresh]);


  const availableVehicles = useMemo(() => {


    const activeLinks = assignments.filter(a =>
      a.isActive &&
      (a.clientId === selectedClient)
    );

    const fleet = activeLinks.map(link => {
      const v = vehicles.find(veh => veh.id === link.vehicleId);
      const d = drivers.find(drv => drv.id === link.driverId);

      // Si el vehículo o conductor no existe, o si el vehículo está en una RUTA ACTIVA, lo ocultamos
      if (!v || !d) return null;

      // ST-FIX: Validar estado del vehículo 'Disponible' (Case insensitive y cast seguro)
      const vStatus = String(v.status || '').toUpperCase();
      if (vStatus !== 'DISPONIBLE') return null;

      const isBusy = activeRoutes.some(r =>
        r.vehicleId === v.id &&
        ['Assigned', 'In Route', 'EN_RUTA', 'Asignada', 'En Ruta'].includes(r.status)
      );

      if (isBusy) return null; // Ocultar vehículos ocupados

      return {
        ...v,
        driverName: d.name,
        driverId: d.id,
        assignmentId: link.id
      };
    }).filter(item => item !== null) as (Vehicle & { driverName: string, driverId: string, assignmentId: string })[];

    return fleet;
  }, [assignments, vehicles, drivers, selectedClient, activeRoutes]);

  // CÁLCULO DE DÉFICIT DE FLOTA
  const unassignedMetrics = useMemo(() => {
    const vol = unassignedInvoices.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0);
    // Capacidad promedio de la flota actual para estimar vehículos faltantes
    const avgCapacity = availableVehicles.length > 0
      ? availableVehicles.reduce((acc, v) => acc + (Number(v.capacityM3) || 0), 0) / availableVehicles.length
      : 10; // Fallback a 10m3 si no hay flota para promediar
    const additionalVehicles = Math.ceil(vol / (avgCapacity > 0 ? avgCapacity : 10));

    return {
      count: unassignedInvoices.length,
      volume: vol.toFixed(2),
      additionalVehicles: additionalVehicles
    };
  }, [unassignedInvoices, availableVehicles]);

  const handleGeneralReadjustment = () => {
    setReadjustmentModal({ isOpen: true, selectedDocIds: new Set() });
  };

  // Función interna para obtener items seleccionados.
  // Si no hay selección manual, toma todos los pendientes validInvoices
  const getOptimizationTargets = (specificDocIds?: Set<string>) => {
    if (!specificDocIds || specificDocIds.size === 0) return [...validInvoices];
    // Filtrar usando la misma lógica de agrupación "flexible"
    return validInvoices.filter(inv => {
      const groupKey = (inv.docLId && documents.some(d => d.id === inv.docLId))
        ? inv.docLId
        : (inv.externalDocId || inv.orderNumber || inv.invoiceNumber || inv.id);
      return specificDocIds.has(groupKey);
    });
  };

  const runM7Optimization = (specificInvoices?: Invoice[]) => {
    setIsOptimizing(true);
    setSuggestedRoutes([]);
    if (!specificInvoices) setLastReadjustmentResult(null);
    setReadjustmentModal({ isOpen: false, selectedDocIds: new Set() }); // Cerrar modal si estaba abierto

    setTimeout(() => {
      const suggestions: SuggestedRoute[] = [];

      // 1. Preparación de Facturas (Copias)
      // Si se pasan facturas específicas (Reajuste Selectivo), usamos esas. Si no, usamos todas las válidas.
      let availableInvoices = (specificInvoices || [...validInvoices]).map(inv => ({ ...inv }));

      // 2. Detección de Prioridades
      // 2. Detección Inteligente de Prioridades y Horarios
      const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|PARA LAS|A LAS)\b/i;
      const priorityKeywords = ['URGENTE', 'PRIMERA HORA', 'PRIORIDAD'];

      availableInvoices.forEach(inv => {
        const doc = documents.find(d => d.id === inv.docLId);
        const notes = (doc?.inventory_observation || inv.notes || '').toUpperCase();

        // Detección de Hora Específica
        const timeMatch = notes.match(timeRegex);
        // @ts-ignore
        inv.detectedTime = timeMatch ? timeMatch[0].trim() : null;

        // @ts-ignore
        inv.isPriority = priorityKeywords.some(kw => notes.includes(kw)) || !!timeMatch;
        // @ts-ignore
        inv.cityKey = (inv.city || 'SIN_CIUDAD').toUpperCase().trim();
      });

      // 3. Ordenamiento Global Inicial (Prioridad > Volumen)
      // Esto ayuda a que los items más difíciles de asignar se procesen primero
      availableInvoices.sort((a, b) => {
        // @ts-ignore
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        return b.volumeM3 - a.volumeM3;
      });

      const usedVehicleIds = new Set<string>();

      // ============================================
      // ALGORITMO AGRESIVO DE LLENADO (90% TARGET)
      // ============================================

      // Iteramos sobre cada vehículo disponible
      availableVehicles.forEach(vehicle => {
        if (availableInvoices.length === 0) return;

        const load: Invoice[] = [];
        let currentLoadVolume = 0;

        // Capacidad REGLA M7: MÁXIMO 90% (TECHO DURO)
        const nominalCapacity = vehicle.capacityM3 > 0 ? vehicle.capacityM3 : 30;
        const targetMaxCapacity = nominalCapacity * 0.90; // Meta y límite: 90%
        const absoluteMaxCapacity = targetMaxCapacity;      // Techo duro estricto

        // Rastreo de conflictos horarios en esta ruta específica
        const earlyBirdAssigned = new Set<string>();

        // -- FASE 1: NÚCLEO DE CIUDAD (IA REGENERATIVA) --
        // Buscamos si este vehículo tiene una ciudad de alta afinidad aprendida
        const affinity = learningPatterns.find(p => p.vehicle_id === vehicle.id);
        const targetCity = affinity ? affinity.city : null;

        if (availableInvoices.length > 0) {
          // IA: Si hay afinidad, intentamos empezar con una factura de esa ciudad
          let seedInvoice = null;
          if (targetCity) {
            // @ts-ignore
            seedInvoice = availableInvoices.find(inv => inv.cityKey === targetCity);
            if (seedInvoice) { /* console.log(`[M7-IA] Aplicando patrón aprendido: ${vehicle.plate} -> ${targetCity}`) */ }
          }

          // Si no hay afinidad o no hay facturas de esa ciudad, tomamos la primera disponible
          if (!seedInvoice) seedInvoice = availableInvoices[0];

          // @ts-ignore
          const seedCity = seedInvoice.cityKey;

          // Filtramos candidatos principales: misma ciudad
          // @ts-ignore
          let primaryCandidates = availableInvoices.filter(inv => inv.cityKey === seedCity);

          // Llenamos con candidatos de la misma ciudad
          for (let i = 0; i < primaryCandidates.length; i++) {
            const inv = primaryCandidates[i];

            // Lógica de No Interferencia de Horarios Críticos
            // @ts-ignore
            if (inv.detectedTime && earlyBirdAssigned.has(inv.detectedTime)) continue;

            if (currentLoadVolume + inv.volumeM3 <= absoluteMaxCapacity) {
              load.push(inv);
              currentLoadVolume += inv.volumeM3;

              // @ts-ignore
              if (inv.detectedTime) earlyBirdAssigned.add(inv.detectedTime);

              // Eliminar de availableInvoices (buscando por ID original para seguridad)
              const globalIdx = availableInvoices.findIndex(x => x.id === inv.id);
              if (globalIdx !== -1) availableInvoices.splice(globalIdx, 1);
            }
          }
        }

        // -- FASE 2: RELLENO AGRESIVO (FILL THE GAPS) --
        // Si aún no llegamos al target, buscamos CUALQUIER factura que quepa
        if (currentLoadVolume < targetMaxCapacity && availableInvoices.length > 0) {
          // Recorremos las facturas restantes para encontrar las que "calzan" mejor
          for (let i = 0; i < availableInvoices.length; i++) {
            const inv = availableInvoices[i];

            if (currentLoadVolume >= targetMaxCapacity) break;

            // Chequeo simple de capacidad
            if (currentLoadVolume + inv.volumeM3 <= absoluteMaxCapacity) {
              load.push(inv);
              currentLoadVolume += inv.volumeM3;
              availableInvoices.splice(i, 1);
              i--; // Ajustar índice al borrar
            }
          }
        }

        // -- FASE 3: UBICACIÓN DE VEHÍCULO --
        // Asignamos el vehículo si lleva carga significativa
        if (load.length > 0) {
          // IA REGENERATIVA M7: Aprender de la ciudad dominante para fortalecer el patrón
          const cityCounts: { [key: string]: number } = {};
          load.forEach(inv => {
            // @ts-ignore
            const c = inv.cityKey;
            cityCounts[c] = (cityCounts[c] || 0) + 1;
          });
          const dominantCity = Object.keys(cityCounts).reduce((a, b) => cityCounts[a] > cityCounts[b] ? a : b);

          suggestions.push({
            id: `route-${Date.now()}-${vehicle.plate}`,
            vehicle,
            assignedInvoices: load,
            totalVolume: Number(currentLoadVolume.toFixed(2)),
            utilization: Math.round((currentLoadVolume / nominalCapacity) * 100),
            city: dominantCity
          });
          usedVehicleIds.add(vehicle.id);
        }
      });

      // Reporte final para el usuario
      if (suggestions.length === 0) {
        if (availableVehicles.length === 0) {
          toast.error(`NO HAY TRIPULACIONES ACTIVAS PARA ${INITIAL_CLIENTS.find(c => c.id === selectedClient)?.name || 'EL CLIENTE'}.`);
        } else {
          toast.info("No se hallaron rutas factibles.");
        }
      } else {
        toast.success(`Algoritmo M7 (Fuerza 90%): ${suggestions.length} rutas generadas.`);
      }

      setSuggestedRoutes(suggestions);

      // Si fue un reajuste, calculamos el resumen para la visual especial
      if (specificInvoices) {
        const totalInvoices = specificInvoices.length;
        const assignedCount = suggestions.reduce((acc, r) => acc + r.assignedInvoices.length, 0);

        // Obtener los external_doc_id reales para el resumen
        const processedDocIds = Array.from(readjustmentModal.selectedDocIds).map(id => {
          const strId = String(id);
          const d = documents.find(doc => doc.id === strId);
          return d?.externalDocId || strId.slice(-8);
        });

        setLastReadjustmentResult({
          docs: readjustmentModal.selectedDocIds.size,
          facts: totalInvoices,
          unrouted: totalInvoices - assignedCount,
          docIds: processedDocIds
        });
      } else {
        setLastReadjustmentResult(null);
      }

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

    // Recalculate using fallback capacity same as optimization loop to prevent NaN
    const realCapacity = route.vehicle.capacityM3 > 0 ? route.vehicle.capacityM3 : 30;
    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + curr.volumeM3, 0);
    route.totalVolume = parseFloat(newVol.toFixed(2));
    route.utilization = Math.round((newVol / realCapacity) * 100);

    // Registrar Auditoría en el Servidor
    api.logRouteMovement({
      routeId: route.id,
      invoiceId: data.invoice.id,
      action: action,
      userId: user.name,
      previousPlate: action === 'REMOVE' ? route.vehicle.plate : null,
      newPlate: action === 'ADD' ? route.vehicle.plate : null,
      details: {
        comment: auditComment,
        volume: data.invoice.volumeM3,
        city: data.invoice.city // REGLA M7: Enviamos ciudad para aprendizaje IA
      }
    }).catch(err => console.error("Error logging movement:", err));

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

  const handleAddInvoiceToRoute = (invoice: Invoice) => {
    if (addInvoiceModal.routeIndex === null) return;
    const newSuggestions = [...suggestedRoutes];
    const route = newSuggestions[addInvoiceModal.routeIndex];

    route.assignedInvoices.push(invoice);
    const realCapacity = route.vehicle.capacityM3 > 0 ? route.vehicle.capacityM3 : 30; // Fallback
    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + curr.volumeM3, 0);
    route.totalVolume = parseFloat(newVol.toFixed(2));
    route.utilization = Math.round((newVol / realCapacity) * 100);

    setSuggestedRoutes(newSuggestions);
    setAddInvoiceModal({ isOpen: false, routeIndex: null });
    toast.success(`Factura agregada a ruta ${route.vehicle.plate}`);
  };

  const handleSwapRouteVehicle = (routeIndex: number, newVehicle: Vehicle) => {
    const newSuggestions = [...suggestedRoutes];
    const route = newSuggestions[routeIndex];

    if (newSuggestions.some(r => r.vehicle.id === newVehicle.id && r.id !== route.id)) {
      toast.error("El vehículo seleccionado ya está asignado a otra ruta.");
      return;
    }

    const newCapacity = newVehicle.capacityM3 > 0 ? newVehicle.capacityM3 : 30;
    const loadVolume = route.assignedInvoices.reduce((acc, inv) => acc + (inv.volumeM3 || 0), 0);
    const utilization = (loadVolume / newCapacity) * 100;

    // REGLA DE CAPACIDAD M7
    if (utilization > 95) {
      setCapacityAlert({
        isOpen: true,
        type: 'error',
        message: `BLOQUEO: La carga actual (${loadVolume.toFixed(2)}m³) excede el límite crítico del 95% para este vehículo (${newCapacity}m³). ¿Deseas ajustar automáticamente la carga al 90%?`,
        confirmLabel: 'Ajustar al 90% y Asignar',
        onConfirm: () => {
          const targetVolume = newCapacity * 0.90;
          let currentVol = loadVolume;
          const removedInvoices: Invoice[] = [];
          while (currentVol > targetVolume && route.assignedInvoices.length > 0) {
            const removed = route.assignedInvoices.pop()!;
            currentVol -= (removed.volumeM3 || 0);
            removedInvoices.push(removed);
          }
          route.vehicle = newVehicle;
          route.totalVolume = parseFloat(currentVol.toFixed(2));
          route.utilization = Math.round((currentVol / newCapacity) * 100);
          route.id = `route-${Date.now()}-${newVehicle.plate}`;
          setSuggestedRoutes(newSuggestions);
          setSwapVehicleModal({ isOpen: false, routeIndex: null });
          setCapacityAlert(prev => ({ ...prev, isOpen: false }));
          toast.success(`Vehículo asignado. Se retiraron ${removedInvoices.length} facturas.`);
        }
      });
      return;
    }

    if (utilization > 90) {
      setCapacityAlert({
        isOpen: true,
        type: 'warning',
        message: `ALERTA: La carga excede el 90% de capacidad (${utilization.toFixed(1)}%). ¿Deseas proceder con el cambio o ajustar la carga al 90%?`,
        confirmLabel: 'Proceder con Cambio',
        onConfirm: () => {
          route.vehicle = newVehicle;
          route.totalVolume = parseFloat(loadVolume.toFixed(2));
          route.utilization = Math.round((loadVolume / newCapacity) * 100);
          route.id = `route-${Date.now()}-${newVehicle.plate}`;
          setSuggestedRoutes(newSuggestions);
          setSwapVehicleModal({ isOpen: false, routeIndex: null });
          setCapacityAlert(prev => ({ ...prev, isOpen: false }));
          toast.success(`Vehículo cambiado a ${newVehicle.plate}`);
        }
      });
      return;
    }

    // Proceso normal
    route.vehicle = newVehicle;
    route.totalVolume = parseFloat(loadVolume.toFixed(2));
    route.utilization = Math.round((loadVolume / newCapacity) * 100);
    route.id = `route-${Date.now()}-${newVehicle.plate}`;

    setSuggestedRoutes(newSuggestions);
    setSwapVehicleModal({ isOpen: false, routeIndex: null });
    toast.success(`Vehículo cambiado a ${newVehicle.plate}`);
  };

  const handleConfirmDispatch = (route: SuggestedRoute) => {
    setDispatchConfirmation({ isOpen: true, route, isMass: false });
  };

  const actualConfirmDispatch = async (route: SuggestedRoute) => {
    setIsSaving(true);
    try {
      // Buscamos el conductor real del vínculo
      const link = assignments.find(a => a.vehicleId === route.vehicle.id && a.isActive);
      const res = await api.saveRoute({
        id: `rt-${Date.now()}`,
        vehicleId: route.vehicle.id,
        driverId: link?.driverId || 'S/A',
        clientId: selectedClient,
        invoiceIds: route.assignedInvoices.map(i => i.id),
        createdBy: user.name
      });

      if (res.success) {
        toast.success("Despacho M7 Confirmado Exitosamente");
        setSuggestedRoutes(prev => prev.filter(r => r.id !== route.id));
        if (onRefresh) onRefresh();
      } else {
        toast.error("Error al confirmar despacho");
      }
    } catch (error) {
      toast.error("Error de conexión al guardar ruta");
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Efecto para Instancia del Mapa (Crear/Destruir)
  useEffect(() => {
    if (viewMode === 'map' && !mapRef.current) {
      console.log('[M7-MAP] Inicializando instancia Leaflet Premium...');
      const container = document.getElementById('m7-routing-map');
      if (container) {
        mapRef.current = L.map('m7-routing-map', {
          zoomControl: false, // Desactivar nativo para personalizar
          attributionControl: false
        }).setView([4.6097, -74.0817], 12);

        // Capa CartoDB Voyager (Premium Look)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 20
        }).addTo(mapRef.current);

        // Control de zoom personalizado en esquina inferior derecha
        L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
      }
    }

    return () => {
      if (mapRef.current) {
        console.log('[M7-MAP] Destruyendo instancia Leaflet...');
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [viewMode]);

  // 2. Efecto para Renderizado de Datos en el Mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || (viewMode !== 'map' && viewMode !== 'active')) return;

    console.log('[M7-MAP] Actualizando capas de datos...');

    // Invalidar tamaño con retardo para asegurar que el contenedor está listo
    setTimeout(() => { map.invalidateSize(); }, 400);

    // Limpiar capas previas excepto el TileLayer
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const colorPalette = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

    const filteredRoutesForMap = suggestedRoutes.filter(r =>
      r.vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ((r.vehicle as any).driverName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const allPoints: L.LatLngExpression[] = [[M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng]];

    // Marker de ORIGEN MAESTRO (HUB LA TABLAZA)
    L.marker([M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng], {
      icon: L.divIcon({
        html: `<div class="w-10 h-10 flex items-center justify-center bg-slate-900 rounded-[1rem] shadow-2xl border-2 border-slate-700 text-emerald-400 rotate-45 transform hover:scale-110 transition-transform duration-300">
                    <div class="-rotate-45">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                   </div>`,
        className: 'm7-hub-marker',
        iconSize: [40, 40]
      })
    }).addTo(map).bindPopup(`<div class="p-4 font-sans">
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ORIGEN MAESTRO M7</p>
        <p class="font-black text-slate-800 text-sm leading-tight">${M7_HUB_ORIGIN.address}</p>
        <div class="mt-2 w-full h-1 bg-emerald-500 rounded-full"></div>
    </div>`);

    filteredRoutesForMap.forEach((route, idx) => {
      const routeColor = colorPalette[idx % colorPalette.length];
      const routePoints: L.LatLngExpression[] = [];

      route.assignedInvoices.forEach((inv, iIdx) => {
        if (inv.lat && inv.lng) {
          const point: L.LatLngExpression = [Number(inv.lat), Number(inv.lng)];
          routePoints.push(point);
          allPoints.push(point);

          const icon = L.divIcon({
            html: `<div class="w-9 h-9 relative flex items-center justify-center group">
                      <div class="absolute inset-0 bg-white rounded-full shadow-2xl scale-110 group-hover:scale-125 transition-all duration-300"></div>
                      <div class="absolute inset-0 rounded-full border-4 opacity-30 shadow-inner" style="border-color: ${routeColor}"></div>
                      <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shadow-lg relative z-10" style="background-color: ${routeColor}; color: #fff">
                        ${iIdx + 1}
                      </div>
                    </div>`,
            className: 'custom-m7-pin', iconSize: [36, 36], iconAnchor: [18, 18],
          });

          L.marker(point, { icon }).addTo(map)
            .bindPopup(`
                 <div class="font-sans overflow-hidden rounded-2xl shadow-2xl border-0 min-w-[180px]">
                   <div class="px-3 py-2 text-white font-black text-[10px] uppercase tracking-widest flex justify-between items-center" style="background-color: ${routeColor}">
                     <span>Entrega #${iIdx + 1}</span>
                     <span class="bg-white/20 px-1.5 py-0.5 rounded">${inv.volumeM3}m³</span>
                   </div>
                   <div class="p-3 bg-white">
                     <p class="font-black text-slate-900 text-xs mb-1 uppercase tracking-tighter line-clamp-2">${inv.customerName}</p>
                     <p class="text-[9px] text-slate-500 font-bold mb-2">${inv.address}</p>
                     <div class="flex gap-2 items-center pt-2 border-t border-slate-50">
                        <div class="w-2 h-2 rounded-full" style="background-color: ${routeColor}"></div>
                        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">${inv.city}</p>
                     </div>
                   </div>
                 </div>
              `, { className: 'm7-premium-popup', offset: [0, -10] });
        }
      });

      if (routePoints.length > 1) {
        L.polyline(routePoints, {
          color: routeColor,
          weight: 5,
          opacity: 0.7,
          dashArray: '1, 10',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        // Línea de fondo para efecto "glow"
        L.polyline(routePoints, {
          color: routeColor,
          weight: 12,
          opacity: 0.1,
          lineCap: 'round'
        }).addTo(map);
      }

      if (routePoints.length > 0) {
        const vIcon = L.divIcon({
          html: `<div class="flex flex-col items-center">
                       <div class="bg-slate-950 text-white px-3 py-1 rounded-[10px] shadow-2xl font-black text-[9px] uppercase tracking-[0.2em] mb-1 whitespace-nowrap border-b-4 transform -translate-y-1 hover:scale-110 transition-all duration-300" style="border-color: ${routeColor}">
                          ${route.vehicle.plate}
                       </div>
                       <div class="w-11 h-11 bg-slate-950 rounded-full flex items-center justify-center shadow-2xl relative">
                          <div class="absolute inset-0 rounded-full animate-ping opacity-20 scale-150" style="background-color: ${routeColor}"></div>
                          <span class="text-2xl relative z-10 drop-shadow-lg">🚚</span>
                       </div>
                     </div>`,
          className: 'custom-vehicle-icon', iconSize: [120, 70], iconAnchor: [60, 70],
        });

        L.marker(routePoints[0], { icon: vIcon, zIndexOffset: 2000 }).addTo(map)
          .bindPopup(`
                <div class="bg-slate-950 text-white p-4 rounded-3xl shadow-2xl min-w-[220px] border-l-8" style="border-color: ${routeColor}">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">VEHÍCULO</p>
                            <h5 class="text-xl font-black">${route.vehicle.plate}</h5>
                        </div>
                        <div class="px-2 py-1 bg-white/10 rounded-lg text-[10px] font-black text-emerald-400">
                            ${route.utilization}%
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mb-4">
                         <div class="bg-white/5 p-2 rounded-xl">
                            <p class="text-[7px] font-black text-slate-500 uppercase">CARGA</p>
                            <p class="text-xs font-bold">${route.totalVolume}m³</p>
                         </div>
                         <div class="bg-white/5 p-2 rounded-xl">
                            <p class="text-[7px] font-black text-slate-500 uppercase">PARADAS</p>
                            <p class="text-xs font-bold">${route.assignedInvoices.length}</p>
                         </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full animate-pulse" style="background-color: ${routeColor}"></div>
                        <p class="text-[9px] font-black uppercase text-slate-300">${route.city}</p>
                    </div>
                </div>
             `, { className: 'vehicle-premium-popup' });
      }
    });

    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [suggestedRoutes, viewMode, searchTerm]);

  const handleMassAssign = () => {
    if (suggestedRoutes.length === 0) return;
    setDispatchConfirmation({ isOpen: true, route: null, isMass: true });
  };

  const actualMassAssign = async () => {
    setIsSaving(true);
    let successCount = 0;

    for (const route of suggestedRoutes) {
      try {
        const link = assignments.find(a => a.vehicleId === route.vehicle.id && a.isActive);
        const res = await api.saveRoute({
          id: `rt-${Date.now()}-${Math.random()}`,
          vehicleId: route.vehicle.id,
          driverId: link?.driverId || 'S/A',
          clientId: selectedClient,
          invoiceIds: route.assignedInvoices.map(i => i.id),
          createdBy: user.name
        });
        if (res.success) successCount++;
      } catch (e) {
        console.error(e);
      }
    }

    setIsSaving(false);
    toast.success(`${successCount} Despachos Confirmados Exitosamente`);
    setSuggestedRoutes([]);
  };

  const handleExportPlanilla = (route: SuggestedRoute) => {
    const totalVolActual = route.assignedInvoices.reduce((acc, i) => acc + (i.volumeM3 || 0), 0);
    // Generación premium de planilla HTML
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>PLANILLA M7 - ${route.vehicle.plate}</title>
          <style>
            @page { size: letter; margin: 1cm; }
            body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; }
            .header-table { width: 100%; margin-bottom: 25px; border-bottom: 3px solid #0f172a; padding-bottom: 15px; }
            .logo-placeholder { font-size: 28px; font-weight: 900; color: #020617; letter-spacing: -1px; }
            .m7-accent { color: #10b981; }
            .doc-title { text-align: right; font-size: 14px; font-weight: 900; color: #64748b; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 15px; }
            .info-item { font-size: 11px; }
            .info-label { font-weight: 900; color: #94a3b8; text-transform: uppercase; font-size: 8px; margin-bottom: 3px; }
            .info-value { font-weight: 800; color: #1e293b; font-size: 13px; }

            table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
            th { background-color: #0f172a; color: white; padding: 12px 8px; text-align: left; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
            td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; font-weight: 600; }
            tr:last-child td { border-bottom: none; }
            tr:nth-child(even) { background-color: #f1f5f9; }

            .prio-badge { background: #fee2e2; color: #ef4444; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 900; }
            .footer-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 60px; padding: 0 40px; }
            .sig-box { border-top: 2px solid #0f172a; padding-top: 10px; text-align: center; }
            .sig-label { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #64748b; }
            
            .summary-box { margin-top: 30px; text-align: right; padding-right: 20px; }
            .summary-total { font-size: 16px; font-weight: 900; color: #0f172a; }
          </style>
        </head>
        <body>
          <table class="header-table" style="border:none;">
            <tr style="background:none;">
              <td style="border:none; padding:0;">
                <div class="logo-placeholder">MILLA<span class="m7-accent">7</span></div>
                <div style="font-size: 9px; font-bold; color: #64748b;">SOFTWARE DE LOGÍSTICA INTELIGENTE</div>
              </td>
              <td class="doc-title" style="border:none; padding:0;">
                PLANILLA DE DESPACHO<br/>
                <span style="color: #10b981;">ID RUTA: ${route.id.split('-').slice(-1)}</span>
              </td>
            </tr>
          </table>

          <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Vehículo / Placa</div>
                <div class="info-value">${route.vehicle.plate}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Conductor Asignado</div>
                <div class="info-value">${(route.vehicle as any).driverName || 'Óscar Santamaría'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Fecha de Salida</div>
                <div class="info-value">${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Capacidad Utilizada</div>
                <div class="info-value">${totalVolActual.toFixed(2)}m³ / ${route.vehicle.capacityM3}m³ (${Math.round((totalVolActual / route.vehicle.capacityM3) * 100)}%)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th width="30">#</th>
                <th width="100">Factura</th>
                <th>Cliente</th>
                <th>Destino / Ciudad</th>
                <th width="60">Vol (m³)</th>
                <th width="150">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${route.assignedInvoices.map((inv, idx) => {
      const isPrio = (inv as any).isPriority ? '<span class="prio-badge">★ PRIORIDAD</span>' : '';
      return `
                    <tr>
                      <td>${idx + 1}</td>
                      <td style="font-weight:900; color:#0f172a;">${inv.invoiceNumber}</td>
                      <td>${inv.customerName}</td>
                      <td>
                        <div style="font-weight:800;">${inv.city}</div>
                        <div style="font-size:8px; color:#64748b;">${inv.address}</div>
                      </td>
                      <td style="font-weight:900; color:#10b981;">${inv.volumeM3.toFixed(3)}</td>
                      <td>
                        ${isPrio}
                        <div style="font-size:8px; margin-top:2px;">${inv.notes || ''}</div>
                      </td>
                    </tr>
                  `;
    }).join('')}
            </tbody>
          </table>

          <div class="summary-box">
             <div class="summary-total">TOTAL FACTURAS: ${route.assignedInvoices.length}</div>
             <div style="font-size: 11px; font-weight: 700; color: #64748b;">CARGA TOTAL: ${totalVolActual.toFixed(2)}m³</div>
          </div>

          <div class="footer-signatures">
            <div class="sig-box">
                <div class="sig-label">Firma Conductor</div>
                <div style="font-size: 8px; margin-top: 5px;">${(route.vehicle as any).driverName || 'Óscar Santamaría'}</div>
            </div>
            <div class="sig-box">
                <div class="sig-label">Revisión de Bodega / Despacho</div>
            </div>
          </div>

          <div style="margin-top: 40px; text-align: center; font-size: 8px; color: #94a3b8; font-weight: 700;">
            DOCUMENTO GENERADO POR SISTEMA MILLA 7 LOGÍSTICA - ${new Date().toLocaleString()}
          </div>

          <script>window.print();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleConfirmedDispatchWrapper = (route: SuggestedRoute) => {
    handleConfirmDispatch(route);
  };

  return (
    <div className="flex flex-col gap-4 min-h-screen animate-in fade-in duration-500 pb-20">
      {/* HEADER COMPACTO */}
      <div className="bg-white p-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col xl:flex-row justify-between items-center gap-4 shrink-0 transition-all">
        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto justify-center">
          <div className="w-12 h-12 bg-slate-950 text-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
            <Icons.Route className="w-6 h-6" />
          </div>
          <div className="space-y-1 text-center md:text-left">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">M7 Intelligence</h2>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 rounded-md text-[8px] font-black uppercase tracking-widest">Optimización 90%</span>
              <select
                value={selectedClient}
                onChange={(e) => { setSelectedClient(e.target.value); setSuggestedRoutes([]); }}
                className="bg-slate-50 border border-slate-200 px-3 py-0.5 rounded-md text-[9px] font-black uppercase outline-none focus:border-emerald-500"
              >
                {INITIAL_CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-2 w-full xl:w-auto">
          <div className="bg-slate-100 p-1 rounded-2xl flex shadow-inner h-10 relative w-full md:w-auto">
            <button onClick={() => setViewMode('intelligence')} className={`flex-1 md:flex-none px-6 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all relative z-10 ${viewMode === 'intelligence' ? 'text-slate-900' : 'text-slate-400'}`}>Sugerencias de Ruta</button>
            <div className="absolute top-1 bottom-1 left-1 w-[calc(100%-8px)] bg-white rounded-xl shadow-md transition-all"></div>
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icons.Search className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Buscar placa o conductor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border-0 rounded-2xl pl-10 pr-4 py-3 text-[10px] font-bold uppercase tracking-wide focus:ring-2 focus:ring-indigo-500 shadow-sm w-48 md:w-64"
            />
          </div>

          <button
            onClick={handleGeneralReadjustment}
            disabled={isOptimizing || suggestedRoutes.length === 0}
            className="w-full md:w-auto px-4 py-3 bg-amber-50 text-amber-600 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all shadow-md active:scale-95 disabled:opacity-20 whitespace-nowrap"
          >
            REAJUSTE
          </button>

          <button
            onClick={() => runM7Optimization(undefined)}
            disabled={isOptimizing || validInvoices.length === 0}
            className="w-full md:w-auto bg-slate-900 text-emerald-500 px-6 py-3 rounded-2xl font-black text-[9px] uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-500 hover:text-slate-900 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {isOptimizing ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full"></div> : <Icons.Scan className="w-4 h-4" />}
            {isOptimizing ? '...' : (suggestedRoutes.length > 0 ? 'RECALCULAR' : 'GENERAR')}
          </button>
        </div>
      </div>

      {/* INDICADORES DE DÉFICIT EN HEADER (RELOCALIZADOS) */}
      {(unassignedMetrics.count > 0) && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 p-2 px-4 rounded-[1.5rem] animate-in slide-in-from-top duration-500 shadow-sm ml-auto">
          <div className="flex flex-col border-r border-rose-200 pr-3">
            <p className="text-[6px] font-black text-rose-500 uppercase tracking-widest">Sin Ruta</p>
            <p className="text-xs font-black text-rose-900 leading-none">{unassignedMetrics.count} <span className="text-[8px] font-bold text-slate-400">FACTS</span></p>
          </div>
          <div className="flex flex-col border-r border-rose-200 px-3">
            <p className="text-[6px] font-black text-rose-500 uppercase tracking-widest">Volumen</p>
            <p className="text-xs font-black text-rose-900 leading-none">{unassignedMetrics.volume}m³</p>
          </div>
          <div className="flex items-center gap-2 pl-2">
            <div className="flex flex-col text-right">
              <p className="text-[6px] font-black text-rose-500 uppercase tracking-widest">Requeridos</p>
              <p className="text-xs font-black text-rose-900 leading-none">~{unassignedMetrics.additionalVehicles}</p>
            </div>
            <div className="w-6 h-6 bg-rose-500 text-white rounded-lg flex items-center justify-center shadow-lg">
              <Icons.Truck className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}
      {lastReadjustmentResult && (
        <div className="bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 p-2 px-4 rounded-2xl shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300 mx-4 border-l-4 border-l-indigo-500">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
              <Icons.Zap className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex flex-col">
              <p className="text-[7px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">Resultado M7 aplicado</p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black text-white uppercase tracking-tighter">
                  DOCS: <span className="text-indigo-300">{lastReadjustmentResult.docIds.join(', ')}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <div className="text-center px-3 border-r border-white/10">
              <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-0.5">PROCESADAS</p>
              <p className="text-xs font-black text-white">{lastReadjustmentResult.facts}</p>
            </div>
            <div className="text-center px-3 border-r border-white/10">
              <p className="text-[6px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">ASIGNADAS</p>
              <p className="text-xs font-black text-emerald-400 font-bold">{lastReadjustmentResult.facts - lastReadjustmentResult.unrouted}</p>
            </div>
            <div className="text-center px-3">
              <p className="text-[6px] font-black text-amber-400 uppercase tracking-widest mb-0.5">SIN CAPACIDAD</p>
              <p className="text-xs font-black text-amber-400 font-bold">{lastReadjustmentResult.unrouted}</p>
            </div>

            <button onClick={() => setLastReadjustmentResult(null)} className="ml-2 p-1.5 hover:bg-white/10 rounded-lg transition-all">
              <Icons.X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 space-y-4 pr-2">
          {suggestedRoutes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-white rounded-[3rem] border border-slate-100 shadow-lg space-y-6">
              <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200 border-4 border-dashed border-slate-100">
                <Icons.Audit className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Motor M7 en Reposo</h3>
                <p className="text-xs text-slate-400 font-bold max-w-sm mt-2 uppercase tracking-wide">
                  Inicie el análisis basado en facturas aprobadas listas para despacho.
                </p>
              </div>
            </div>
          ) : (

            <div className="flex flex-col gap-4">
              {/* Banner IA y Controles Masivos */}
              <div className="bg-emerald-500 p-4 rounded-[2.5rem] shadow-lg flex flex-col md:flex-row items-center gap-4 animate-in zoom-in duration-500 justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center shrink-0 shadow-xl">
                    <Icons.Brain className="text-emerald-500 w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] mb-1">M7 Intelligence</h4>
                    <p className="text-slate-900 text-xs font-bold leading-tight">
                      Opt. Promedio: {Math.round(suggestedRoutes.reduce((acc, r) => acc + r.utilization, 0) / suggestedRoutes.length)}% | Rutas: {suggestedRoutes.length}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleMassAssign}
                  disabled={isSaving}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl disabled:opacity-50 whitespace-nowrap"
                >
                  {isSaving ? '...' : 'CONFIRMAR TODO'}
                </button>
              </div>

              {/* Lista de Rutas Filtrada */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-10">
                {suggestedRoutes
                  .filter(r =>
                    r.vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    ((r.vehicle as any).driverName || '').toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((route, rIdx) => (
                    <div key={route.id} className="bg-white rounded-[2.5rem] shadow-lg border border-slate-100 overflow-hidden flex flex-col group hover:border-emerald-500 transition-all">
                      <div className="p-4 bg-slate-950 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${route.utilization >= 90 ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`}><Icons.Truck className="w-5 h-5" /></div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-black text-sm uppercase tracking-tighter leading-none">{route.vehicle.plate}</p>
                              <button
                                onClick={() => setSwapVehicleModal({ isOpen: true, routeIndex: rIdx })}
                                className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded-md flex items-center justify-center transition-all"
                                title="Cambiar Vehículo"
                              >
                                <Icons.Check className="w-3 h-3 text-white" />
                              </button>
                            </div>
                            <p className="text-[8px] text-slate-500 font-black uppercase mt-1 tracking-widest">
                              {route.city} • {(route.vehicle as any).driverName || 'S/C'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">CAPACIDAD</p>
                            <p className="text-xs font-black text-white">
                              <span className={route.totalVolume > route.vehicle.capacityM3 ? 'text-red-500' : 'text-emerald-400'}>
                                {route.totalVolume.toFixed(2)}
                              </span>
                              <span className="text-slate-500 mx-1">/</span>
                              {route.vehicle.capacityM3.toFixed(2)}m³
                            </p>
                          </div>
                          <div className="w-[1px] h-6 bg-white/10"></div>
                          <div>
                            <p className={`text-xl font-black ${route.utilization > 100 ? 'text-red-500' : (route.utilization >= 90 ? 'text-emerald-400' : 'text-amber-400')}`}>{route.utilization}%</p>
                            <p className="text-[6px] font-black uppercase text-slate-600 tracking-widest">Ocupación</p>
                          </div>
                          <button
                            onClick={() => setAddInvoiceModal({ isOpen: true, routeIndex: rIdx })}
                            className="w-8 h-8 bg-white/10 hover:bg-emerald-500 rounded-lg flex items-center justify-center transition-all"
                            title="Agregar Factura Manual"
                          >
                            <Icons.Plus className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-2 max-h-[300px] bg-slate-50/30">
                        {route.assignedInvoices.map((inv, iIdx) => {
                          const isPriority = (inv as any).isPriority;
                          return (
                            <div key={`${inv.id}-${iIdx}`} className={`p-3 bg-white rounded-xl border ${isPriority ? 'border-amber-400 ring-1 ring-amber-100' : 'border-slate-100'} shadow-sm group/item hover:shadow-md transition-all flex flex-col gap-2`}>
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-6 h-6 ${isPriority ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'} rounded-lg flex items-center justify-center font-black text-[9px] shrink-0`}>{iIdx + 1}</div>
                                  <div className="min-w-0">
                                    <p className="font-black text-[10px] text-slate-900 truncate">
                                      {inv.invoiceNumber}
                                    </p>
                                    <p className="text-[8px] text-slate-500 font-bold truncate">
                                      {inv.customerName}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[9px] font-black text-slate-700">DOC: {inv.externalDocId || 'N/A'}</p>
                                  <p className="text-[8px] text-slate-400 font-bold">PED: {inv.orderNumber || 'S/N'}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-[8px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                                <Icons.MapPin className="w-3 h-3 text-slate-400" />
                                <span className="truncate flex-1 font-bold">{inv.address} • {inv.city}</span>
                              </div>

                              {inv.notes && (
                                <div className="text-[8px] text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100 italic">
                                  "{inv.notes.substring(0, 60)}{inv.notes.length > 60 ? '...' : ''}"
                                </div>
                              )}

                              <div className="flex items-center justify-between border-t pt-2 mt-1">
                                <div className="flex gap-3">
                                  <div className="text-center">
                                    <p className="text-[7px] font-bold text-slate-400 uppercase">VOL</p>
                                    <p className="text-[10px] font-black text-emerald-600">{Number(inv.volumeM3 || 0).toFixed(2)}m³</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[7px] font-bold text-slate-400 uppercase">VALOR</p>
                                    <p className="text-[10px] font-black text-indigo-600">
                                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(inv.invoiceValue || 0)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setSelectedInvoiceDetail(inv)}
                                    className="w-7 h-7 bg-indigo-50 text-indigo-500 rounded-md hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center border border-indigo-100 shadow-sm"
                                    title="Ver detalle de items"
                                  >
                                    <Icons.Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleAuditAction('REMOVE', rIdx, inv)}
                                    className="w-7 h-7 bg-rose-50 text-rose-500 rounded-md hover:bg-red-500 hover:text-white transition-all flex items-center justify-center border border-rose-100 shadow-sm"
                                    title="Remover de ruta"
                                  >
                                    <Icons.X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-3 border-t bg-white flex gap-2 shrink-0">
                        <button
                          onClick={() => handleConfirmedDispatchWrapper(route)}
                          disabled={isSaving}
                          className="flex-1 py-2 bg-slate-950 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md disabled:opacity-50"
                        >
                          {isSaving ? '...' : 'CONFIRMAR'}
                        </button>
                        <button
                          onClick={() => handleExportPlanilla(route)}
                          className="px-4 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 transition-all shadow-sm font-bold text-[10px] uppercase gap-2"
                          title="Exportar Planilla PDF"
                        >
                          <Icons.FileText className="w-4 h-4" />
                          PDF
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:flex w-72 bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 flex-col gap-6 shrink-0 overflow-hidden">
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2">Planificación</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-slate-900 border-l-4 border-emerald-500 p-6 rounded-[2rem] shadow-2xl relative overflow-hidden group hover:scale-[1.02] transition-all">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-all"></div>
                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Pendientes Totales</p>
                <p className="text-4xl font-black text-white">{validInvoices.length}</p>
                <p className="text-[7px] font-bold text-slate-400 mt-2 uppercase tracking-widest">APTAS DESPACHO</p>
              </div>
              <div className="bg-white p-5 rounded-[1.5rem] border-2 border-slate-100 shadow-lg">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Vehículos</p>
                <p className="text-3xl font-black text-slate-900">{availableVehicles.length}</p>
                <p className="text-[7px] font-bold text-slate-400 mt-2 uppercase tracking-widest">EN BASE</p>
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* Modal de Auditoría para Movimientos Manuales */}
      {auditModal?.isOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                <Icons.Alert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Auditoría Requerida</h3>
                <p className="text-xs font-bold text-slate-500 uppercase">Justifique este movimiento manual</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">ACCIÓN</p>
                <p className="font-bold text-slate-900">{auditModal.action === 'REMOVE' ? 'ELIMINAR FACTURA DE RUTA' : 'AGREGAR FACTURA A RUTA'}</p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 pl-2 mb-1 block">Motivo del ajuste</label>
                <textarea
                  value={auditComment}
                  onChange={(e) => setAuditComment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500 transition-all min-h-[100px]"
                  placeholder="Ej: Cliente solicitó cambio de fecha..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setAuditModal(null)}
                  className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmAuditAction}
                  disabled={!auditComment.trim()}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all disabled:opacity-50"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Agregar Facturas Pendientes */}
      {addInvoiceModal.isOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex flex-col gap-4 bg-emerald-50 rounded-t-[2.5rem] shrink-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white text-emerald-600 rounded-2xl flex items-center justify-center shadow-md">
                    <Icons.Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Agregar Factura</h3>
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Seleccione una factura pendiente</p>
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <div className="flex gap-2">
                          <div className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[8px] font-black uppercase">
                            UN ORIG (N): {unassignedCounts.planNormal}
                          </div>
                          <div className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[8px] font-black uppercase">
                            UN ORIG (R): {unassignedCounts.planR}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setAddInvoiceModal({ isOpen: false, routeIndex: null }); setModalSearchTerm(''); }} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                  <Icons.X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="relative">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar por factura, cliente o pedido..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-3">
              {(() => {
                const filtered = unassignedInvoices.filter(inv => {
                  const term = modalSearchTerm.toLowerCase();
                  return (inv.invoiceNumber || '').toLowerCase().includes(term) ||
                    (inv.customerName || '').toLowerCase().includes(term) ||
                    (inv.orderNumber || '').toLowerCase().includes(term);
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 scale-150 opacity-20">
                        <Icons.Plus className="w-8 h-8" />
                      </div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin resultados para tu búsqueda</p>
                    </div>
                  );
                }

                return filtered.map((inv, index) => (
                  <div key={`${inv.id}-${index}`} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-emerald-100 group gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xs text-slate-900 uppercase flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="whitespace-nowrap">{inv.invoiceNumber}</span>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <span className="truncate text-slate-600 font-bold">{inv.customerName}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase truncate">
                          {inv.address} • {inv.city}
                        </p>
                        {inv.orderNumber && (
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded text-[9px] font-bold uppercase border border-indigo-100">
                            PED: {inv.orderNumber}
                          </span>
                        )}
                        {inv.externalDocId && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase border border-slate-200">
                            DOC: {inv.externalDocId}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${documents.find(d => d.id === inv.docLId)?.planType === 'Plan R' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                          {documents.find(d => d.id === inv.docLId)?.planType || 'Plan Normal'}
                        </span>
                      </div>
                      {(inv as any).isPriority && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 shadow-sm animate-pulse">
                            <Icons.Alert className="w-2.5 h-2.5" />
                            <span className="text-[8px] font-black uppercase">Horario Crítico</span>
                          </div>
                          {(inv as any).detectedTime && (
                            <span className="bg-slate-900 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase shadow-md flex items-center gap-1">
                              <Icons.Clock className="w-2 h-2" />
                              {(inv as any).detectedTime}
                            </span>
                          )}
                        </div>
                      )}
                      {(inv.notes || (inv as any).detectedTime) && (
                        <p className="text-[9px] text-amber-600 italic mt-1 truncate opacity-90 font-bold bg-amber-50/50 p-1 rounded-lg inline-block border border-amber-100">
                          "{inv.notes || `ENTREGA PRIORITARIA: ${(inv as any).detectedTime}`}"
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-600">{inv.volumeM3.toFixed(3)}m³</p>
                      <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-tight">
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(inv.invoiceValue || 0)}
                      </p>
                      <button
                        onClick={() => handleAddInvoiceToRoute(inv)}
                        className="mt-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-sm"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal Reasignar Vehículo */}
      {swapVehicleModal.isOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-[2.5rem]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white text-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
                  <Icons.Check className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Reasignar Vehículo</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase">Seleccione una unidad disponible</p>
                </div>
              </div>
              <button onClick={() => setSwapVehicleModal({ isOpen: false, routeIndex: null })} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                <Icons.X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {/* Información de Condiciones M7 */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="flex items-center gap-3 mb-2">
                  <Icons.Alert className="w-4 h-4 text-amber-600" />
                  <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Condiciones de Visibilidad</span>
                </div>
                <ul className="text-[10px] font-bold text-amber-700 space-y-1 list-disc ml-4 uppercase tracking-tighter">
                  <li>Debe tener un Vínculo Operativo Activo.</li>
                  <li>Debe pertenecer al Cliente Seleccionado.</li>
                  <li>Debe estar en estado "Disponible".</li>
                </ul>
              </div>

              {availableVehicles
                .filter(v => !suggestedRoutes.some(r => r.vehicle.id === v.id))
                .map(v => (
                  <div
                    key={v.id}
                    onClick={() => handleSwapRouteVehicle(swapVehicleModal.routeIndex!, v)}
                    className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-500 hover:bg-white transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-xs text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm">
                          {v.plate.slice(0, 3)}
                        </div>
                        <div>
                          <p className="font-black text-sm text-slate-900 uppercase">{v.plate}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{(v as any).driverName || 'Sin Conductor'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Capacidad</p>
                        <p className="text-xs font-black text-indigo-600">{v.capacityM3}m³</p>
                      </div>
                    </div>
                  </div>
                ))}

              {availableVehicles.filter(v => !suggestedRoutes.some(r => r.vehicle.id === v.id)).length === 0 && (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 scale-150 opacity-20">
                    <Icons.Truck className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No hay otros vehículos disponibles</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reajuste Selectivo */}
      {readjustmentModal.isOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-amber-50 rounded-t-[2.5rem]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shadow-md">
                  <Icons.Settings className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Reajuste por Documento</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase">Seleccione Documentos Maestros (L)</p>
                </div>
              </div>
              <button onClick={() => setReadjustmentModal({ isOpen: false, selectedDocIds: new Set() })} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                <Icons.X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              <div className="flex justify-between mb-4">
                <button
                  onClick={() => {
                    const newSet = new Set<string>();
                    validInvoices.forEach(inv => {
                      // Prioridad total al Documento Maestro (docLId)
                      const key = (inv.docLId && documents.some(d => d.id === inv.docLId))
                        ? inv.docLId
                        : (inv.externalDocId || inv.orderNumber || inv.invoiceNumber || inv.id);
                      newSet.add(key);
                    });
                    setReadjustmentModal(prev => ({ ...prev, selectedDocIds: newSet }));
                  }}
                  className="text-[9px] font-bold uppercase text-indigo-500 hover:text-indigo-700 underline"
                >
                  Seleccionar Todos
                </button>
                <button
                  onClick={() => setReadjustmentModal(prev => ({ ...prev, selectedDocIds: new Set() }))}
                  className="text-[9px] font-bold uppercase text-slate-400 hover:text-slate-600 underline"
                >
                  Limpiar Selección
                </button>
              </div>

              <div className="space-y-4">
                {(() => {
                  const docMap = new Map<string, { label: string, desc: string, invoices: Invoice[], volume: number }>();

                  validInvoices.forEach(inv => {
                    if (!inv.docLId) return; // Filtrado estricto: Solo Documentos L

                    const doc = documents.find(d => d.id === inv.docLId);
                    const groupKey = inv.docLId;
                    const label = doc?.externalDocId
                      ? `Documento Maestro: ${doc.externalDocId}`
                      : `Documento L: ${String(inv.docLId).slice(-8)}`;
                    const desc = doc?.inventory_observation || "Carga Masiva M7";

                    if (!docMap.has(groupKey)) {
                      docMap.set(groupKey, { label, desc, invoices: [], volume: 0 });
                    }
                    const entry = docMap.get(groupKey)!;
                    entry.invoices.push(inv);
                    entry.volume += (inv.volumeM3 || 0);
                  });

                  if (docMap.size === 0) {
                    return (
                      <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                        <Icons.Settings className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No hay Documentos L disponibles para reajustar.</p>
                      </div>
                    );
                  }

                  return Array.from(docMap.entries()).map(([key, { label, desc, invoices, volume }], index) => {
                    const isSelected = readjustmentModal.selectedDocIds.has(key);
                    const isExpanded = expandedDocLId === key;

                    return (
                      <div
                        key={`DOC_GRP_${key}_${index}`}
                        className={`rounded-3xl border-2 transition-all overflow-hidden ${isSelected ? 'border-amber-400 bg-amber-50/30' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                      >
                        <div className="p-6 flex items-center justify-between gap-4">
                          <div
                            onClick={() => {
                              setReadjustmentModal(prev => {
                                const newSet = new Set(prev.selectedDocIds);
                                if (newSet.has(key)) newSet.delete(key);
                                else newSet.add(key);
                                return { ...prev, selectedDocIds: newSet };
                              });
                            }}
                            className="flex items-center gap-4 flex-1 cursor-pointer"
                          >
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 border-amber-500 shadow-md shadow-amber-200' : 'bg-white border-slate-200'}`}>
                              {isSelected && <Icons.Check className="w-4 h-4 text-white" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-sm text-slate-900 uppercase tracking-tight">{label}</p>
                                <span className="bg-amber-100 text-amber-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Activo</span>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{desc}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-[9px] font-black text-amber-600 bg-white border border-amber-200 px-2 py-1 rounded-lg uppercase">
                                  {invoices.length} Facturas
                                </span>
                                <span className="text-[9px] font-black text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg uppercase">
                                  {volume.toFixed(2)}m³ Total
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => setExpandedDocLId(isExpanded ? null : key)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isExpanded ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                            title="Ver detalle de facturas"
                          >
                            {isExpanded ? <Icons.X className="w-5 h-5" /> : <Icons.Plus className="w-5 h-5" />}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="px-6 pb-6 pt-2 bg-white/50 border-t border-slate-100 flex flex-col gap-2 animate-in slide-in-from-top-2 duration-300">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Contenido del Documento:</p>
                            {invoices.map((inv, index) => (
                              <div key={`INV_ITM_${inv.id}_${index}`} className="p-3 bg-white border border-slate-100 rounded-2xl flex justify-between items-center">
                                <div>
                                  <p className="font-black text-[11px] text-slate-800 uppercase leading-none">{inv.invoiceNumber}</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{inv.customerName}</p>
                                </div>
                                <p className="text-[11px] font-black text-indigo-500">{inv.volumeM3.toFixed(2)}m³</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 rounded-b-[2.5rem] flex gap-4">
                <button
                  onClick={() => setReadjustmentModal({ isOpen: false, selectedDocIds: new Set() })}
                  className="flex-1 py-3 text-slate-400 font-bold uppercase text-[10px] hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const targets = getOptimizationTargets(readjustmentModal.selectedDocIds);
                    setSuggestedRoutes([]);
                    runM7Optimization(targets);
                  }}
                  disabled={readjustmentModal.selectedDocIds.size === 0}
                  className="flex-[2] py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Icons.Scan className="w-4 h-4" />
                  Ejecutar Reajuste ({readjustmentModal.selectedDocIds.size || 'Todos'})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Despacho Premium */}
      {dispatchConfirmation.isOpen && (
        <div className="fixed inset-0 z-[700] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 border-t-[12px] border-amber-500">
            <div className="p-12 text-center">
              <div className="w-24 h-24 bg-amber-50 text-amber-500 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border-2 border-amber-100 shadow-inner">
                <Icons.AlertTriangle className="w-12 h-12" />
              </div>

              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4">Confirmar Despacho</h3>
              <p className="text-slate-500 font-medium mb-8 leading-relaxed">
                {dispatchConfirmation.isMass
                  ? `¿Está seguro de confirmar el despacho masivo de ${suggestedRoutes.length} rutas planteadas?`
                  : `¿Confirmar el despacho individual para el vehículo ${dispatchConfirmation.route?.vehicle.plate}?`
                }
              </p>

              <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-3xl mb-10">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                  <Icons.Settings className="w-4 h-4 animate-spin-slow" /> Advertencia de Control
                </p>
                <p className="text-xs font-bold text-rose-500 uppercase leading-snug">
                  UNA VEZ CONFIRMADO, EL DOCUMENTO PASARÁ A ESTADO "EN RUTA".
                  <span className="block mt-2 text-rose-700 font-black">LA REVERSIÓN REQUERIRÁ UN PROCESO DE DEVOLUCIÓN AFECTANDO LOS KPI OPERATIVOS.</span>
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setDispatchConfirmation({ isOpen: false, route: null, isMass: false })}
                  className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (dispatchConfirmation.isMass) actualMassAssign();
                    else if (dispatchConfirmation.route) actualConfirmDispatch(dispatchConfirmation.route);
                    setDispatchConfirmation({ isOpen: false, route: null, isMass: false });
                  }}
                  className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl"
                >
                  Confirmar y Afectar KPI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle de Ítems de la Factura */}
      {selectedInvoiceDetail && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                  <Icons.Eye className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Detalle de items: {selectedInvoiceDetail.invoiceNumber}</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase">{selectedInvoiceDetail.customerName}</p>
                </div>
              </div>
              <button onClick={() => setSelectedInvoiceDetail(null)} className="w-10 h-10 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center transition-all">
                <Icons.X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest sticky top-0">
                  <tr>
                    <th className="p-4 rounded-tl-xl">SKU / Artículo</th>
                    <th className="p-4 text-center">UN</th>
                    <th className="p-4 text-center">REF</th>
                    <th className="p-4 text-center">Pedido</th>
                    <th className="p-4 text-center">Cant.</th>
                    <th className="p-4 text-center">UM</th>
                    <th className="p-4 text-center">Volumen</th>
                    <th className="p-4 text-center">Peso</th>
                    <th className="p-4 rounded-tr-xl">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const doc = documents.find(d => d.id === selectedInvoiceDetail.docLId);
                    const items = doc?.items.filter(it => {
                      const inv = (it.invoice || '').trim().toLowerCase();
                      const ord = (it.orderNumber || '').trim().toLowerCase();
                      const target = (selectedInvoiceDetail.invoiceNumber || '').trim().toLowerCase();
                      const targetOrd = (selectedInvoiceDetail.orderNumber || '').trim().toLowerCase();

                      return inv === target || ord === target || inv === targetOrd || ord === targetOrd;
                    }) || [];

                    if (items.length === 0) return <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold uppercase text-xs italic">Cargando ítems o sin datos disponibles...</td></tr>;

                    return items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 text-[10px] font-bold">
                        <td className="p-4 text-slate-900 uppercase">
                          <p className="font-black">{it.articleId}</p>
                          {/* Intentar buscar nombre del artículo si es posible mediante el ID */}
                          <p className="text-[8px] text-slate-400 line-clamp-1">{(it as any).name || 'Artículo M7'}</p>
                        </td>
                        <td className="p-4 text-center text-slate-500">{it.unCode || '-'}</td>
                        <td className="p-4 text-center text-slate-500">{it.clientRef || '-'}</td>
                        <td className="p-4 text-center text-indigo-600 font-bold">{it.orderNumber || '-'}</td>
                        <td className="p-4 text-center text-emerald-600 font-black">{it.expectedQty || it.countedQty || 0}</td>
                        <td className="p-4 text-center text-slate-400 uppercase">{it.unit || 'UND'}</td>
                        <td className="p-4 text-center text-slate-500 font-medium">{(Number(it.volume || it.unitVolume || 0)).toFixed(3)}m³</td>
                        <td className="p-4 text-center text-emerald-600 font-black">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(it.peso || 0)}
                        </td>
                        <td className="p-4 text-slate-400 italic text-[9px] truncate max-w-[150px]" title={it.observation || it.inventoryNote}>{it.observation || it.inventoryNote || '-'}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            <div className="p-8 border-t bg-slate-50 flex justify-end shrink-0">
              <button onClick={() => setSelectedInvoiceDetail(null)} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg">Cerrar Detalle</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Alerta de Capacidad Personalizado */}
      {capacityAlert.isOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className={`bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-4 ${capacityAlert.type === 'error' ? 'border-red-500' : 'border-amber-400'}`}>
            <div className={`p-8 text-center ${capacityAlert.type === 'error' ? 'bg-red-50' : 'bg-amber-50'}`}>
              <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg animate-bounce ${capacityAlert.type === 'error' ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-900'}`}>
                {capacityAlert.type === 'error' ? <Icons.Alert className="w-10 h-10" /> : <Icons.Settings className="w-10 h-10" />}
              </div>
              <h3 className={`text-2xl font-black uppercase tracking-tighter mb-4 ${capacityAlert.type === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                {capacityAlert.type === 'error' ? 'Límite Crítico' : 'Aviso de Capacidad'}
              </h3>
              <p className="text-slate-600 font-bold text-sm uppercase leading-relaxed px-4">
                {capacityAlert.message}
              </p>
            </div>
            <div className="p-6 bg-slate-50 flex flex-col gap-3">
              <button
                onClick={() => capacityAlert.onConfirm?.()}
                className={`w-full py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 ${capacityAlert.type === 'error' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-400 text-slate-900 hover:bg-amber-500'}`}
              >
                {capacityAlert.confirmLabel || 'Confirmar'}
              </button>
              <button
                onClick={() => {
                  if (capacityAlert.type === 'warning' && capacityAlert.message.includes('ajustar la carga')) {
                    // Caso especial para el warning donde Cancelar significa AJUSTAR
                    const newSuggestions = [...suggestedRoutes];
                    const route = newSuggestions[swapVehicleModal.routeIndex!];
                    const newVeh = availableVehicles.find(v => !newSuggestions.some(r => r.vehicle.id === v.id)); // Esto es simplificado
                    // En un caso real, el trigger del ajuste está en el onConfirm o un botón dedicado.
                    // Pero por UX, vamos a simplificar el warning a "Aceptar" o "Ajustar al 90%" abajo.
                  }
                  setCapacityAlert(prev => ({ ...prev, isOpen: false }));
                }}
                className="w-full py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;
