
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Invoice, Vehicle, Route, VehicleStatus, Driver, VehicleAssignment, DocumentL, DocStatus, RouteLog, User, MasterRecord } from '../types';
import { Icons, INITIAL_CLIENTS } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useAppStore } from '../stores/useAppStore';
import {
  OPTIMIZATION_CONSTANTS,
  estimateStopArrival,
  estimateRouteReturn,
  parseDetectedTimeToMinutes,
  rebalanceSingleRoute,
  haversineKm,
  hasDefaultCoords,
  twoOptImprove
} from '../utils/routeUtils';
import {
  ORBIT_HUB_ORIGIN,
  RESTRICTED_NEIGHBORHOODS,
  LARGE_VEHICLE_THRESHOLD_M3,
  RETAIL_CHAIN_KEYWORDS,
  RETAIL_CHAIN_MIN_VOLUME_M3
} from '../config/routeConfig';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Zonas geográficas Valle de Aburrá (7 corredores) ─────────────────────────
// Cada zona define un corredor de reparto. Las zonas adyacentes pueden mezclarse
// solo si la carga está muy vacía; zonas no adyacentes se excluyen completamente.
const GEO_ZONES_ADJACENT: Record<string, string[]> = {
  'NORTE_LEJANO':    ['NORTE'],
  'NORTE':           ['NORTE_LEJANO', 'CENTRO_NORTE'],
  'CENTRO_NORTE':    ['NORTE', 'CENTRO', 'CENTRO_OCC'],
  'CENTRO':          ['CENTRO_NORTE', 'CENTRO_OCC', 'CENTRO_SUR'],
  'CENTRO_OCC':      ['CENTRO_NORTE', 'CENTRO', 'CENTRO_SUR'],
  'CENTRO_SUR':      ['CENTRO', 'CENTRO_OCC', 'SUR'],
  'SUR':             ['CENTRO_SUR', 'SUR_LEJANO'],
  'SUR_LEJANO':      ['SUR'],
};

function classifyGeoZone(lat: number, lng: number, cityUpper: string): string {
  // Norte lejano: Girardota, Barbosa, Don Matías, Santo Domingo (+)
  const nFar = ['GIRARDOTA','BARBOSA','DON MATÍAS','DONMATÍAS','SANTO DOMINGO'];
  if (nFar.some(c => cityUpper.includes(c)) || lat > 6.42) return 'NORTE_LEJANO';
  // Norte: Bello, Copacabana
  if (['BELLO','COPACABANA'].some(c => cityUpper.includes(c)) || lat > 6.31) return 'NORTE';
  // Centro-norte Medellín (Castilla, Aranjuez, Robledo norte)
  if (lat > 6.265) return 'CENTRO_NORTE';
  // Centro Medellín: split por corredor occidente (San Javier, Laureles, Belén)
  if (lat > 6.205) return lng < -75.595 ? 'CENTRO_OCC' : 'CENTRO';
  // Sur: Envigado, Itagüí, Sabaneta
  const sCities = ['ITAGÜÍ','ITAGUI','SABANETA','ENVIGADO'];
  if (sCities.some(c => cityUpper.includes(c)) || lat > 6.135) return 'SUR';
  // Sur lejano: Caldas, La Estrella, El Retiro
  return 'SUR_LEJANO';
}

// Radio máximo de dispersión geográfica por ruta (km)
// Una ruta no debería cubrir más de este radio desde su centroide
const MAX_ROUTE_RADIUS_KM = 18;

// ── Helpers de visualización ──────────────────────────────────────────────────
const CITY_PALETTE = ['#6366f1','#8b5cf6','#06b6d4','#14b8a6','#f43f5e','#f97316','#22c55e','#3b82f6','#ec4899','#84cc16'];
const getCityDotColor = (city: string): string => {
  let h = 0;
  for (let i = 0; i < city.length; i++) h = city.charCodeAt(i) + ((h << 5) - h);
  return CITY_PALETTE[Math.abs(h) % CITY_PALETTE.length];
};
const getTimeWindowUrgency = (mins: number | null): 'critical' | 'warning' | 'ok' => {
  if (!mins) return 'ok';
  if (mins < 600) return 'critical';  // antes de las 10 AM
  if (mins < 780) return 'warning';   // 10 AM – 1 PM
  return 'ok';
};

interface RoutePlannerProps {
  invoices: Invoice[];
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: VehicleAssignment[];
  documents: DocumentL[];
  activeRoutes: Route[]; // Nueva prop
  user: User;
  clients: MasterRecord[]; // Nueva prop
  onAssign: (vId: string, dId: string, cId: string) => void;
  onSaveRoute: (route: Partial<Route>) => void;
  onRefresh?: () => void;
}


// MEJORA 1: Haversine reemplaza distancia euclidiana — más precisa para rutas reales
const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  return haversineKm(Number(lat1 || 0), Number(lng1 || 0), Number(lat2 || 0), Number(lng2 || 0));
};

// MEJORA 6: Clustering espacial para cadenas de almacenes
// Agrupa facturas cercanas entre sí usando un threshold de distancia (km).
// Evita rutas en zigzag cuando hay sucursales muy dispersas.
const clusterByProximity = (invoices: Invoice[], thresholdKm = 8): Invoice[][] => {
  if (invoices.length === 0) return [];
  const clusters: Invoice[][] = [];
  const assigned = new Set<string>();

  for (const inv of invoices) {
    if (assigned.has(inv.id)) continue;
    const cluster = [inv];
    assigned.add(inv.id);
    for (const other of invoices) {
      if (assigned.has(other.id)) continue;
      const d = haversineKm(
        Number(inv.lat || 0), Number(inv.lng || 0),
        Number(other.lat || 0), Number(other.lng || 0)
      );
      if (d <= thresholdKm) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
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
  invoices, vehicles, drivers, assignments, documents, activeRoutes, user, clients, onAssign, onSaveRoute, onRefresh
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const isSuperAdmin = user.roleId === 'ROL-01' || user.email === 'admin@millasiete.com';
  const allowedClientIds = user.clientIds || [];
  
  // Filtrar clientes permitidos
  const allowedClients = useMemo(() => {
    if (isSuperAdmin) return clients;
    return clients.filter(c => allowedClientIds.includes(c.id));
  }, [clients, isSuperAdmin, allowedClientIds]);

  const [selectedClient, setSelectedClient] = useState(() => {
    if (isSuperAdmin) return user.clientId || 'GLOBAL';
    return allowedClientIds.includes(user.clientId) ? user.clientId : (allowedClientIds[0] || '');
  });

  const setInvoices = useAppStore(state => state.setInvoices);

  // Recargar facturas automáticamente cuando el usuario cambia de cliente
  useEffect(() => {
    if (!selectedClient) return;
    api.getInvoices(selectedClient === 'GLOBAL' ? undefined : selectedClient)
      .then((data: any[]) => {
        if (Array.isArray(data)) setInvoices(data);
      })
      .catch(() => {});
  }, [selectedClient]);
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
  const [manualRouteModal, setManualRouteModal] = useState(false);
  const [manualVehicleSearch, setManualVehicleSearch] = useState('');
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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ isOpen: boolean; id: string } | null>(null);
  const [routeMapModal, setRouteMapModal] = useState<{ isOpen: boolean; route: SuggestedRoute | null }>({ isOpen: false, route: null });
  const routePreviewMapRef = useRef<L.Map | null>(null);
  const scanSuppressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addInvoiceInputRef = useRef<HTMLInputElement>(null);

  const handleDeleteDocument = async (id: string) => {
    setShowDeleteConfirm({ isOpen: true, id });
  };

  const confirmDeleteDocument = async () => {
    if (!showDeleteConfirm) return;
    const { id } = showDeleteConfirm;
    setShowDeleteConfirm(null);
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

  // Mapa de vista previa de ruta
  useEffect(() => {
    if (!routeMapModal.isOpen || !routeMapModal.route) {
      if (routePreviewMapRef.current) {
        routePreviewMapRef.current.remove();
        routePreviewMapRef.current = null;
      }
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const container = document.getElementById('route-preview-map');
      if (!container || cancelled) return;
      if (routePreviewMapRef.current) {
        routePreviewMapRef.current.remove();
        routePreviewMapRef.current = null;
      }
      const route = routeMapModal.route!;

      // Geocodificar stops que tienen coordenadas por defecto (centro de Medellín)
      const DEFAULT_LAT = 6.2518, DEFAULT_LNG = -75.5636;
      const enriched = await Promise.all(
        route.assignedInvoices.map(async (inv) => {
          const lat = Number(inv.lat), lng = Number(inv.lng);
          const isDefault = Math.abs(lat - DEFAULT_LAT) < 0.001 && Math.abs(lng - DEFAULT_LNG) < 0.001;
          if (isDefault && inv.address && inv.city) {
            try {
              const geo = await api.geocodeAddress({ address: inv.address, city: inv.city });
              if (geo?.lat && geo?.lng && !geo.fallback) return { ...inv, lat: geo.lat, lng: geo.lng };
            } catch {}
          }
          return inv;
        })
      );
      if (cancelled) return;

      const stops = enriched.filter(inv => Number(inv.lat) && Number(inv.lng));
      const centerLat = stops.length > 0 ? stops.reduce((a, inv) => a + Number(inv.lat), 0) / stops.length : ORBIT_HUB_ORIGIN.lat;
      const centerLng = stops.length > 0 ? stops.reduce((a, inv) => a + Number(inv.lng), 0) / stops.length : ORBIT_HUB_ORIGIN.lng;

      const map = L.map(container, { zoomControl: true }).setView([centerLat, centerLng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      // Forzar recalculo de tamaño después de que el DOM haya establecido las dimensiones del flex container
      setTimeout(() => map.invalidateSize(), 100);

      // Hub marker
      const hubIcon = L.divIcon({
        html: `<div style="background:#0f172a;color:#10b981;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;border:2px solid #10b981;box-shadow:0 2px 8px rgba(0,0,0,0.5)">HUB</div>`,
        className: '', iconSize: [30, 30], iconAnchor: [15, 15]
      });
      L.marker([ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng], { icon: hubIcon })
        .bindPopup('<b>HUB ORBIT</b><br>Punto de despacho').addTo(map);

      const points: L.LatLng[] = [L.latLng(ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng)];
      const dotColor = getCityDotColor(route.city);

      stops.forEach((inv, i) => {
        const lat = Number(inv.lat), lng = Number(inv.lng);
        points.push(L.latLng(lat, lng));
        const stopIcon = L.divIcon({
          html: `<div style="background:${dotColor};color:white;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${i + 1}</div>`,
          className: '', iconSize: [26, 26], iconAnchor: [13, 13]
        });
        L.marker([lat, lng], { icon: stopIcon })
          .bindPopup(`<b>${i + 1}. ${inv.invoiceNumber}</b><br>${inv.customerName || ''}<br><small>${inv.address} · ${inv.city}</small>`)
          .addTo(map);
      });

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });

        // Intentar ruta real por calles via OSRM
        // OSRM público limita a ~10 waypoints por petición → chunking para rutas largas
        const MAX_WP_PER_CALL = 9; // 9 stops + 1 overlap = 10 per chunk
        const wpArray = points.map(p => ({ lat: p.lat, lng: p.lng }));
        let allCoords: [number, number][] = [];
        let osrmOk = false;

        try {
          if (wpArray.length <= MAX_WP_PER_CALL + 1) {
            // Ruta corta: una sola llamada
            const roadData = await api.getRoadRoute(wpArray);
            if (roadData?.coordinates?.length > 1) {
              allCoords = roadData.coordinates;
              osrmOk = true;
            }
          } else {
            // Ruta larga: dividir en chunks con overlap de 1 punto
            for (let ci = 0; ci < wpArray.length - 1; ci += MAX_WP_PER_CALL) {
              const chunk = wpArray.slice(ci, ci + MAX_WP_PER_CALL + 1);
              try {
                const rd = await api.getRoadRoute(chunk);
                if (rd?.coordinates?.length > 1) {
                  allCoords = [...allCoords, ...rd.coordinates];
                  osrmOk = true;
                } else { osrmOk = false; break; }
              } catch { osrmOk = false; break; }
            }
          }
        } catch { osrmOk = false; }

        if (!cancelled) {
          if (osrmOk && allCoords.length > 1) {
            const latlngs = allCoords.map(([lng, lat]: [number, number]) => L.latLng(lat, lng));
            L.polyline(latlngs, { color: dotColor, weight: 3.5, opacity: 0.85 }).addTo(map);
          } else {
            // Fallback: línea recta entre paradas (indicado con guiones)
            L.polyline(points, { color: dotColor, weight: 2.5, opacity: 0.7, dashArray: '8,5' }).addTo(map);
          }
        }
      }
      routePreviewMapRef.current = map;
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [routeMapModal.isOpen, routeMapModal.route]);

  // FILTRADO DE FACTURAS APTAS: Real (basado en lo que viene del API de facturas)
  const validInvoices = useMemo(() => {
    // REGLA ORBIT: Solo planificar items en estado 'Pendiente' o 'Auditado'
    const filtered = invoices.filter(inv => {
      if (learningExemptions.includes(inv.id)) return false;

      // FILTRO 1: Debe pertenecer al cliente seleccionado
      const invClientId = inv.clientId || (inv as any).client_id;
      const clientMatch = selectedClient === 'GLOBAL' || invClientId === selectedClient;
      if (!clientMatch) return false;

      // FILTRO 2: Estados aptos para despacho Orbit
      const s = String(inv.status || '').toUpperCase();
      const validStatuses = ['PENDIENTE', 'AUDITADO', 'INVENTARIADO', 'EN CONTEO'];
      return validStatuses.includes(s);
    });

    return filtered;
  }, [invoices, learningExemptions, selectedClient]);

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
      if (doc?.planType === 'Orbit (R)') planR++;
      else planNormal++;
    });
    return { planR, planNormal };
  }, [unassignedInvoices, documents]);
  const unassignedMetrics = useMemo(() => {
    const count = unassignedInvoices.length;
    const volume = Number(unassignedInvoices.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0).toFixed(2));
    const additionalVehicles = Math.ceil(volume / 10); // Estimación rápida: 1 camión cada 10m3
    return { count, volume, additionalVehicles };
  }, [unassignedInvoices]);

  const availableVehicles = useMemo(() => {
    // REGLA M7: Un vehículo es "disponible" si:
    // 1. Tiene un vínculo activo (VehicleAssignment) con el cliente seleccionado.
    // 2. Su estado es 'Disponible'.
    // 3. NO tiene una ruta activa (despacho pendiente o en curso).

    const activeLinks = assignments.filter(a => {
      const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
      const cId = a.clientId || (a as any).client_id;
      const clientMatch = selectedClient === 'GLOBAL' || cId === selectedClient;
      return active && clientMatch;
    });

    const fleet = activeLinks.map(link => {
      const linkVId = link.vehicleId || (link as any).vehicle_id;
      const linkDId = link.driverId || (link as any).driver_id;
      const v = vehicles.find(veh => String(veh.id) === String(linkVId));
      const d = drivers.find(drv => String(drv.id) === String(linkDId));

      if (!v || !d) return null;

      // Validar estado 'Disponible' — soporta camelCase y snake_case
      const vStatus = String(v.status || (v as any).status_id || '').toUpperCase();
      const vStatusId = String(v.statusId || (v as any).status_id || '').toUpperCase();
      const isAvailable = vStatus === 'DISPONIBLE' || vStatusId === 'EST-01';
      if (!isAvailable) return null;

      // Validar si está en despacho o ruta activa
      const normalizeId = (id: any) => String(id || '').trim().toUpperCase();
      const vId = normalizeId(v.id);

      const isBusy = activeRoutes.some(r =>
        normalizeId(r.vehicleId || (r as any).vehicle_id) === vId &&
        ['EST-10', 'EST-11', 'ASSIGNED', 'IN ROUTE', 'EN_RUTA', 'ASIGNADA', 'EN RUTA', 'PENDIENTE', 'CONFIRMADA', 'PENDING_SIGNATURES'].includes(String(r.status).toUpperCase())
      );

      // Regla estricta: Si el vehículo tiene estado ocupado en la BD, no se usa
      if (['EST-10', 'EST-11', 'OCUPADO'].includes(vStatusId) || isBusy) return null;

      return {
        ...v,
        driverName: d.name,
        driverId: d.id,
        assignmentId: link.id
      };
    }).filter(item => item !== null) as (Vehicle & { driverName: string, driverId: string, assignmentId: string })[];

    return fleet;
  }, [assignments, vehicles, drivers, selectedClient, activeRoutes]);

  const remainingVehicles = useMemo(() => {
    const usedIds = new Set(suggestedRoutes.map(r => r.vehicle.id));
    return availableVehicles.filter(v => !usedIds.has(v.id));
  }, [availableVehicles, suggestedRoutes]);

  // Carga inicial de patrones de aprendizaje
  useEffect(() => {
    api.getRoutingPatterns().then(data => {
      if (Array.isArray(data)) {
        // console.log(`[ORBIT-INTELLIGENCE] Cargados ${data.length} patrones de aprendizaje regenerativo.`);
        setLearningPatterns(data);
      }
    }).catch(err => { if (import.meta.env.DEV) console.error('[M7-IA-PATTERNS]', err); });
  }, [onRefresh]);




  const fleetGeneralMetrics = useMemo(() => {
    const activeLinks = assignments.filter(a => {
      const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
      const cId = a.clientId || (a as any).client_id;
      return active && (selectedClient === 'GLOBAL' || cId === selectedClient);
    });

    let onBase = 0;
    let assigned = 0;
    let inRoute = 0;

    activeLinks.forEach(link => {
      const linkVId = link.vehicleId || (link as any).vehicle_id;
      const v = vehicles.find(veh => String(veh.id) === String(linkVId));
      if (!v) return;

      const normalizeId = (id: any) => String(id || '').trim().toUpperCase();
      const vId = normalizeId(v.id);

      const activeRoute = activeRoutes.find(r =>
        normalizeId(r.vehicleId || (r as any).vehicle_id) === vId &&
        ['EST-10', 'EST-11', 'ASSIGNED', 'IN ROUTE', 'EN_RUTA', 'ASIGNADA', 'EN RUTA', 'PENDIENTE', 'CONFIRMADA', 'PENDING_SIGNATURES'].includes(String(r.status || '').toUpperCase())
      );

      if (activeRoute) {
        const s = String(activeRoute.status || '').toUpperCase();
        if (s === 'EST-10' || s === 'ASSIGNED' || s === 'ASIGNADA') {
          assigned++;
        } else {
          inRoute++;
        }
      } else {
        // Solo contar "En Base" si está Disponible Y NO tiene ruta activa
        const vStatusId = String(v.statusId || (v as any).status_id || '').toUpperCase();
        const vStatus = String(v.status || '').toUpperCase();
        if (vStatusId === 'EST-01' || vStatus === 'DISPONIBLE') {
          onBase++;
        }
      }
    });

    return { onBase, assigned, inRoute };
  }, [assignments, vehicles, selectedClient, activeRoutes]);

  const getOptimizationTargets = (selectedIds: Set<string | number>) => {
    if (selectedIds.size === 0) return undefined;
    const ids = Array.from(selectedIds).map(id => String(id));
    return validInvoices.filter(inv => ids.includes(String(inv.docLId)));
  };




  // ...

  const handleGeneralReadjustment = () => {
    if (suggestedRoutes.length === 0) return;
    setReadjustmentModal({ isOpen: true, selectedDocIds: new Set() });
  };

  const handleCreateManualRoute = (vehicle: Vehicle) => {
    const newRoute: SuggestedRoute = {
      id: `route-manual-${Date.now()}-${vehicle.plate}`,
      vehicle: vehicle as any,
      assignedInvoices: [],
      totalVolume: 0,
      utilization: 0,
      city: 'MANUAL'
    };
    setSuggestedRoutes([...suggestedRoutes, newRoute]);
    setManualRouteModal(false);
    toast.success(`Ruta manual creada para ${vehicle.plate}`);
  };

  const onManualSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {

  };

  const runOrbitOptimization = (specificInvoices?: Invoice[]) => {
    setIsOptimizing(true);
    setSuggestedRoutes([]);
    if (!specificInvoices) setLastReadjustmentResult(null);
    setReadjustmentModal({ isOpen: false, selectedDocIds: new Set() });

    setTimeout(() => {
      const suggestions: SuggestedRoute[] = [];
      const usedVehicleIds = new Set<string>(); // MOVIMIENTO DE DECLARACIÓN AQUÍ

      // 1. Preparación de Facturas (Copias)
      let availableInvoices = (specificInvoices || [...validInvoices])
        .filter(inv => inv && typeof inv === 'object') // Guardia extra
        .map(inv => ({ ...inv }));

      // --- FASE PREVIA M7 IQ: ALMACENES DE CADENA (MEJORA 6: clustering espacial) ---
      const retailGroups: { [key: string]: Invoice[] } = {};
      RETAIL_CHAIN_KEYWORDS.forEach(chain => {
        const matches = availableInvoices.filter(inv =>
          (String(inv.customerName || '')).toUpperCase().includes(chain)
        );
        if (matches.length > 0) retailGroups[chain] = matches;
      });

      Object.entries(retailGroups).forEach(([chain, chainInvoices]) => {
        const totalChainVol = chainInvoices.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0);

        if (totalChainVol >= RETAIL_CHAIN_MIN_VOLUME_M3 && availableVehicles.length > 0) {
          // MEJORA 6: Agrupar por proximidad antes de asignar vehículos
          const clusters = clusterByProximity(chainInvoices, 8);

          clusters.forEach((cluster, clusterIdx) => {
            const clusterVol = cluster.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0);
            if (clusterVol < 1) return; // Ignorar clusters triviales

            const bestVeh = [...availableVehicles]
              .filter(v => !usedVehicleIds.has(v.id))
              .sort((a, b) => Math.abs(Number(a.capacityM3) - clusterVol) - Math.abs(Number(b.capacityM3) - clusterVol))[0];

            if (bestVeh) {
              const vCap = Number(bestVeh.capacityM3) || 25;
              suggestions.push({
                id: `route-iq-retail-${chain}-${clusterIdx}-${Date.now()}`,
                vehicle: bestVeh,
                assignedInvoices: cluster,
                totalVolume: Number(clusterVol.toFixed(2)),
                utilization: Math.round((clusterVol / vCap) * 100),
                city: (cluster[0]?.city || 'LOGÍSTICA ESPECIAL')
              });
              usedVehicleIds.add(bestVeh.id);
              const clusterIds = new Set(cluster.map(i => i.id));
              availableInvoices = availableInvoices.filter(i => !clusterIds.has(i.id));
            }
          });
        }
      });

      // 2. Detección Inteligente de Prioridades, Horarios y DIRECCIONES
      const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|PARA LAS|A LAS)\b/i;
      const priorityKeywords = ['URGENTE', 'PRIMERA HORA', 'PRIORIDAD'];

      availableInvoices.forEach(inv => {
        const doc = documents.find(d => d.id === inv.docLId);
        const notesRaw = (doc?.inventory_observation || inv.notes || '');
        const notes = String(notesRaw).toUpperCase();

        const timeMatch = notes.match(timeRegex);
        // @ts-ignore
        inv.detectedTime = timeMatch ? timeMatch[0].trim() : null;
        // @ts-ignore
        inv.timeWindowMinutes = (inv as any).detectedTime
          ? parseDetectedTimeToMinutes((inv as any).detectedTime)
          : null;
        // @ts-ignore
        inv.isPriority = priorityKeywords.some(kw => notes.includes(kw)) || !!timeMatch;
        // @ts-ignore
        inv.cityKey = (String(inv.city || 'SIN_CIUDAD')).toUpperCase().trim();

        const rawAddr = (String(inv.address || '')).toUpperCase();
        // @ts-ignore
        inv.startAddressForSort = rawAddr.replace(/\d+/g, num => num.padStart(5, '0')).replace(/[^0-9A-Z]/g, '');
        // @ts-ignore
        inv.neighborhoodKey = (String(inv.neighborhood || 'SIN_BARRIO')).toUpperCase().trim();

        // MEJORA 2: Detectar coordenadas default (sin geocodificar)
        const lat = Number(inv.lat || 0);
        const lng = Number(inv.lng || 0);
        // @ts-ignore
        inv.hasDefaultCoords = (lat === 0 && lng === 0) || hasDefaultCoords(lat, lng);

        // MEJORA 7 v2: Zona geográfica granular (7 corredores Valle de Aburrá)
        const cUpper = (inv as any).cityKey || '';
        // @ts-ignore
        inv.geoZone = classifyGeoZone(lat, lng, cUpper);
      });

      // 3. Ordenamiento Global — prioridad → ventana horaria → ZONA GEOGRÁFICA → ciudad → barrio
      const ZONE_ORDER = ['NORTE_LEJANO','NORTE','CENTRO_NORTE','CENTRO_OCC','CENTRO','CENTRO_SUR','SUR','SUR_LEJANO'];
      availableInvoices.sort((a, b) => {
        // @ts-ignore
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        const aTime = (a as any).timeWindowMinutes ?? Infinity;
        const bTime = (b as any).timeWindowMinutes ?? Infinity;
        if (aTime !== bTime) return aTime - bTime;
        // Zona geográfica primero (agrupa corredores)
        const zA = ZONE_ORDER.indexOf((a as any).geoZone || 'CENTRO');
        const zB = ZONE_ORDER.indexOf((b as any).geoZone || 'CENTRO');
        if (zA !== zB) return zA - zB;
        // @ts-ignore
        if (a.cityKey !== b.cityKey) return (a.cityKey || '').localeCompare(b.cityKey || '');
        // @ts-ignore
        if (a.neighborhoodKey !== b.neighborhoodKey) return (a.neighborhoodKey || '').localeCompare(b.neighborhoodKey || '');
        // Dentro del mismo barrio, ordenar por lat/lng (nearest-neighbor natural)
        if (Number(a.lat) !== Number(b.lat)) return Number(a.lat) - Number(b.lat);
        return Number(a.lng) - Number(b.lng);
      });

      const prioritizedFleet = [...availableVehicles]
        .filter(v => !usedVehicleIds.has(v.id))
        .sort((a, b) => (Number(b.capacityM3) || 0) - (Number(a.capacityM3) || 0));

      prioritizedFleet.forEach(vehicle => {
        if (availableInvoices.length === 0) return;
        if (usedVehicleIds.has(vehicle.id)) return;

        const load: Invoice[] = [];
        let currentLoadVolume = 0;

        const vCap = Number(vehicle.capacityM3) || 0;
        const nominalCapacity = vCap > 0 ? vCap : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
        const targetMaxCapacity = nominalCapacity * OPTIMIZATION_CONSTANTS.TARGET_UTILIZATION;
        const absoluteMaxCapacity = nominalCapacity * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION;
        const isLargeVehicle = nominalCapacity > LARGE_VEHICLE_THRESHOLD_M3;

        // MEJORA 5: Afinidad ordenada por strength (mayor primero)
        const affinity = [...learningPatterns]
          .filter(p => p.vehicle_id === vehicle.id)
          .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        const targetCity = affinity ? affinity.city : null;

        let currentLat = ORBIT_HUB_ORIGIN.lat;
        let currentLng = ORBIT_HUB_ORIGIN.lng;
        let stopIndex = 0; // Para estimación de ventana horaria (MEJORA 3)

        // MEJORA 7: rastrear zona dominante de la carga actual
        const loadZoneCounts: Record<string, number> = {};

        let i = 0;
        while (i < availableInvoices.length && currentLoadVolume < targetMaxCapacity) {
          let bestNextIdx = -1;
          let minDist = Infinity;

          // Zona dominante: calculada solo cuando hay >= 2 paradas cargadas
          const dominantZone = load.length >= 2
            ? Object.entries(loadZoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
            : null;

          // Centroide de la carga actual (para restricción de radio)
          let centLat = 0, centLng = 0;
          if (load.length >= 2) {
            const validLoad = load.filter(inv => !inv.hasDefaultCoords && Number(inv.lat) > 0);
            if (validLoad.length >= 2) {
              centLat = validLoad.reduce((s, inv) => s + Number(inv.lat), 0) / validLoad.length;
              centLng = validLoad.reduce((s, inv) => s + Number(inv.lng), 0) / validLoad.length;
            }
          }

          for (let j = 0; j < availableInvoices.length; j++) {
              const inv = availableInvoices[j];
              const invVol = Number(inv.volumeM3) || 0;

              // @ts-ignore
              const nKey = inv.neighborhoodKey || '';
              const isRestricted = isLargeVehicle && RESTRICTED_NEIGHBORHOODS.includes(nKey);
              if (isRestricted) continue;

              if (currentLoadVolume + invVol <= absoluteMaxCapacity) {
                  const invLat = Number(inv.lat || 0);
                  const invLng = Number(inv.lng || 0);
                  const invZone = (inv as any).geoZone || 'CENTRO';
                  const hasDefCoords = (inv as any).hasDefaultCoords;

                  // ── RESTRICCIÓN GEOGRÁFICA DURA (después de 3 paradas) ──────────
                  // Una vez establecida la zona dominante, excluir zonas incompatibles.
                  // Permitido: misma zona + zonas adyacentes.
                  // Bloqueado: cualquier otra zona → skip total (no penalidad, exclusión).
                  if (dominantZone && load.length >= 3 && !hasDefCoords) {
                    const adjacent = GEO_ZONES_ADJACENT[dominantZone] || [];
                    if (invZone !== dominantZone && !adjacent.includes(invZone)) {
                      continue; // Corredor incompatible — saltar completamente
                    }
                  }

                  // ── RESTRICCIÓN DE RADIO (centroide) ────────────────────────────
                  // La ruta no puede dispersarse más de MAX_ROUTE_RADIUS_KM desde
                  // el centroide de las paradas ya cargadas.
                  if (centLat > 0 && !hasDefCoords && invLat > 0) {
                    const distFromCentroid = getDistance(centLat, centLng, invLat, invLng);
                    if (distFromCentroid > MAX_ROUTE_RADIUS_KM) continue;
                  }

                  // ── CÁLCULO DE DISTANCIA PONDERADA ──────────────────────────────
                  let dist = getDistance(currentLat, currentLng, invLat, invLng);

                  // Penalizar coords default (sin geocodificar)
                  if (hasDefCoords) dist *= 5;

                  // Penalizar llegada fuera de ventana horaria
                  const timeWindow = (inv as any).timeWindowMinutes;
                  if (timeWindow != null) {
                    const estimatedArrivalMin = stopIndex > 0 ? (8 * 60) + stopIndex * 25 : 8 * 60;
                    if (estimatedArrivalMin > timeWindow) {
                      const delayMin = estimatedArrivalMin - timeWindow;
                      dist *= (1 + Math.min(delayMin / 150, 2));
                    }
                  }

                  // Bonus por ciudad favorita del vehículo (patrón histórico)
                  const cKey = (inv as any).cityKey || '';
                  const affinityBonus = (targetCity && cKey === targetCity) ? 0.8 : 1.0;

                  // Penalidad de zona (aplica principalmente antes de las 3 paradas
                  // donde todavía no hay restricción dura)
                  const zonePenalty = (!dominantZone || invZone === dominantZone) ? 1.0
                    : (GEO_ZONES_ADJACENT[dominantZone] || []).includes(invZone) ? 2.0
                    : 8.0; // Zona no adyacente — penalidad muy alta antes del hard-skip

                  const finalDist = dist * affinityBonus * zonePenalty;

                  if (finalDist < minDist) {
                      minDist = finalDist;
                      bestNextIdx = j;
                  }
              }
          }

          if (bestNextIdx !== -1) {
              const inv = availableInvoices[bestNextIdx];
              load.push(inv);
              currentLoadVolume += Number(inv.volumeM3) || 0;
              currentLat = Number(inv.lat || currentLat);
              currentLng = Number(inv.lng || currentLng);
              availableInvoices.splice(bestNextIdx, 1);
              stopIndex++;
              // MEJORA 7: registrar zona de la parada añadida
              // @ts-ignore
              const addedZone = (inv as any).geoZone || 'CENTRO';
              loadZoneCounts[addedZone] = (loadZoneCounts[addedZone] || 0) + 1;
              i = 0;
          } else {
              break;
          }
        }

        // MEJORA 4: Optimización 2-opt post-greedy
        if (load.length >= 4) {
          const optimized = twoOptImprove(load, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
          load.length = 0;
          load.push(...optimized);
        }

        if (load.length > 0) {
          const cityCounts: { [key: string]: number } = {};
          load.forEach(inv => {
            // @ts-ignore
            const c = inv.cityKey || 'SIN_CIUDAD';
            cityCounts[c] = (cityCounts[c] || 0) + 1;
          });
          const dominantCity = Object.keys(cityCounts).reduce((a, b) => cityCounts[a] > cityCounts[b] ? a : b, 'LOGÍSTICA');

          suggestions.push({
            id: `route-${Date.now()}-${vehicle.plate}`,
            vehicle,
            assignedInvoices: load,
            totalVolume: Number(Number(currentLoadVolume).toFixed(2)),
            utilization: Math.round((Number(currentLoadVolume) / nominalCapacity) * 100),
            city: dominantCity
          });
          usedVehicleIds.add(vehicle.id);
        }
      });

      if (suggestions.length === 0) {
        if (availableVehicles.length === 0) {
          toast.error(`NO HAY TRIPULACIONES DISPONIBLES.`);
        } else {
          toast.info("No se hallaron rutas factibles.");
        }
      } else {
        toast.success(`Algoritmo OrbitM7 (IQ 90%): ${suggestions.length} rutas generadas.`);
      }

      setSuggestedRoutes(suggestions);

      if (specificInvoices) {
        const totalInvoices = specificInvoices.length;
        const assignedCount = suggestions.reduce((acc, r) => acc + r.assignedInvoices.length, 0);

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

    // Recalculate using fallback capacity
    const realCapacity = Number(route.vehicle.capacityM3) > 0 ? Number(route.vehicle.capacityM3) : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + (Number(curr.volumeM3) || 0), 0);
    route.totalVolume = Number(Number(newVol).toFixed(2));
    route.utilization = Math.round((Number(newVol) / realCapacity) * 100);

    // Rebalanceo incremental: si se removió una factura, intentar rellenar desde no asignadas
    if (action === 'REMOVE') {
      const assignedIds = new Set(newSuggestions.flatMap(r => r.assignedInvoices.map(i => i.id)));
      const currentUnassigned = validInvoices.filter(inv =>
        !assignedIds.has(inv.id) && !learningExemptions.includes(inv.id) && inv.id !== data.invoice.id
      );
      const { updatedRoute, addedInvoiceIds } = rebalanceSingleRoute(route, currentUnassigned);
      if (addedInvoiceIds.size > 0) {
        newSuggestions[data.routeIndex] = updatedRoute;
        toast.info(`Rebalanceo: ${addedInvoiceIds.size} factura(s) agregada(s) automáticamente`);
      }
    }

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
        city: data.invoice.city || 'SIN_CIUDAD',
        neighborhood: (data.invoice as any).neighborhood || 'SIN_BARRIO'
      }
    }).catch(() => { /* movement log failed — non-critical */ });

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

    // Advertencia si vehículo grande entra a barrio restringido
    const nominalCapacity = Number(route.vehicle.capacityM3) || 0;
    const isLarge = nominalCapacity > LARGE_VEHICLE_THRESHOLD_M3;
    const neighborhood = ((data.invoice as any).neighborhood || '').toUpperCase().trim();
    if (isLarge && RESTRICTED_NEIGHBORHOODS.includes(neighborhood)) {
      toast.warning(`Atención: ${neighborhood} tiene restricciones para vehículos grandes (${nominalCapacity}m³).`, { duration: 5000 });
    }

    setSuggestedRoutes(newSuggestions);
    setAuditModal(null);
    setAuditComment('');
  };

  const handleAddInvoiceToRoute = (invoice: Invoice) => {
    if (addInvoiceModal.routeIndex === null) return;
    const newSuggestions = [...suggestedRoutes];
    const route = newSuggestions[addInvoiceModal.routeIndex];

    route.assignedInvoices.push(invoice);
    const realCapacity = Number(route.vehicle.capacityM3) > 0 ? Number(route.vehicle.capacityM3) : 30; // Fallback
    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + (Number(curr.volumeM3) || 0), 0);
    route.totalVolume = Number(Number(newVol).toFixed(2));
    route.utilization = Math.round((Number(newVol) / realCapacity) * 100);

    setSuggestedRoutes(newSuggestions);
    setModalSearchTerm('');
    toast.success(`✓ ${invoice.invoiceNumber} → ${route.vehicle.plate}`);
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
    if (utilization > OPTIMIZATION_CONSTANTS.CRITICAL_THRESHOLD * 100) {
      setCapacityAlert({
        isOpen: true,
        type: 'error',
        message: `BLOQUEO: La carga actual (${(Number(loadVolume) || 0).toFixed(2)}m³) excede el límite crítico del ${OPTIMIZATION_CONSTANTS.CRITICAL_THRESHOLD * 100}% para este vehículo (${newCapacity}m³). ¿Deseas ajustar automáticamente la carga al ${OPTIMIZATION_CONSTANTS.TARGET_UTILIZATION * 100}%?`,
        confirmLabel: `Ajustar al ${OPTIMIZATION_CONSTANTS.TARGET_UTILIZATION * 100}% y Asignar`,
        onConfirm: () => {
          const targetVolume = newCapacity * OPTIMIZATION_CONSTANTS.TARGET_UTILIZATION;
          let currentVol = loadVolume;
          const removedInvoices: Invoice[] = [];
          while (currentVol > targetVolume && route.assignedInvoices.length > 0) {
            const removed = route.assignedInvoices.pop()!;
            currentVol -= (removed.volumeM3 || 0);
            removedInvoices.push(removed);
          }
          route.vehicle = newVehicle;
          route.totalVolume = Number(Number(currentVol).toFixed(2));
          route.utilization = Math.round((Number(currentVol) / newCapacity) * 100);
          route.id = `route-${Date.now()}-${newVehicle.plate}`;
          setSuggestedRoutes(newSuggestions);
          setSwapVehicleModal({ isOpen: false, routeIndex: null });
          setCapacityAlert(prev => ({ ...prev, isOpen: false }));
          toast.success(`Vehículo asignado. Se retiraron ${removedInvoices.length} facturas.`);
        }
      });
      return;
    }

    if (utilization > OPTIMIZATION_CONSTANTS.WARN_THRESHOLD * 100) {
      setCapacityAlert({
        isOpen: true,
        type: 'warning',
        message: `ALERTA: La carga excede el ${OPTIMIZATION_CONSTANTS.WARN_THRESHOLD * 100}% de capacidad (${utilization.toFixed(1)}%). ¿Deseas proceder con el cambio?`,
        confirmLabel: 'Proceder con Cambio',
        onConfirm: () => {
          route.vehicle = newVehicle;
          route.totalVolume = Number(Number(loadVolume).toFixed(2));
          route.utilization = Math.round((Number(loadVolume) / newCapacity) * 100);
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
    route.totalVolume = Number(Number(loadVolume).toFixed(2));
    route.utilization = Math.round((Number(loadVolume) / newCapacity) * 100);
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
        toast.success("Despacho Orbit Confirmado Exitosamente");

        // M7 IQ: aprender de la ruta confirmada (señal más fuerte que adición manual)
        const stops = route.assignedInvoices.map(inv => ({
          city: String(inv.city || 'SIN_CIUDAD').toUpperCase().trim(),
          neighborhood: String((inv as any).neighborhoodKey || '').toUpperCase().trim()
        }));
        api.learnFromCompletedRoute({ vehicleId: route.vehicle.id, stops })
          .catch(() => { /* route learning failed — non-critical */ });

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
      const container = document.getElementById('orbit-routing-map');
      if (container) {
        mapRef.current = L.map('orbit-routing-map', {
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
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [viewMode]);

  // 2. Efecto para Renderizado de Datos en el Mapa

  useEffect(() => {
    const map = mapRef.current;
    if (!map || (viewMode !== 'map' && viewMode !== 'active')) return;


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

    const allPoints: L.LatLngExpression[] = [[ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng]];

    // Marker de ORIGEN MAESTRO (HUB LA TABLAZA)
    L.marker([ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng], {
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
        <p class="font-black text-slate-800 text-sm leading-tight">${ORBIT_HUB_ORIGIN.address}</p>
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
    if (isSaving) return;
    setIsSaving(true);
    let successCount = 0;
    let failCount = 0;

    // Clonar para evitar problemas de mutación durante el loop
    const routesToProcess = [...suggestedRoutes];

    for (const route of routesToProcess) {
      try {
        const link = assignments.find(a => a.vehicleId === route.vehicle.id && a.isActive);
        // Generar ID más robusto
        const uniqueId = `rt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const res = await api.saveRoute({
          id: uniqueId,
          vehicleId: route.vehicle.id,
          driverId: link?.driverId || 'S/A',
          clientId: selectedClient,
          invoiceIds: route.assignedInvoices.map(i => i.id || i.invoiceNumber),
          createdBy: user.name || 'SISTEMA'
        });

        if (res.success) {
          successCount++;
          // M7 IQ: aprender de cada ruta confirmada en despacho masivo
          const stops = route.assignedInvoices.map(inv => ({
            city: String(inv.city || 'SIN_CIUDAD').toUpperCase().trim(),
            neighborhood: String((inv as any).neighborhoodKey || '').toUpperCase().trim()
          }));
          api.learnFromCompletedRoute({ vehicleId: route.vehicle.id, stops })
            .catch(() => { /* non-critical */ });
        } else {
          failCount++;
        }

        if (routesToProcess.length > 5) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch {
        failCount++;
      }
    }

    setIsSaving(false);
    if (successCount > 0) {
      toast.success(`${successCount} Despachos Confirmados Exitosamente`);
      if (failCount > 0) {
        toast.warning(`${failCount} rutas no pudieron ser confirmadas.`);
      }
      setSuggestedRoutes([]);
      if (onRefresh) onRefresh();
    } else if (failCount > 0) {
      toast.error("Error al procesar el despacho masivo. No se confirmó ninguna ruta.");
    }
    
    setDispatchConfirmation({ isOpen: false, route: null, isMass: false });
  };

  const handleExportPlanilla = async (route: SuggestedRoute) => {
    const despachador = user.name || 'SISTEMA ORBIT';
    const driverName = (route.vehicle as any).driverName || (route.vehicle as any).driver_name || 'Conductor';
    const currentClient = (clients || []).find(c => String(c.id) === String(selectedClient));
    const dateStr = new Date().toLocaleDateString('es-CO');
    const fileName = `PLANILLA-${route.vehicle.plate}-${dateStr.replace(/\//g, '')}.pdf`;

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW = pdf.internal.pageSize.getWidth();
    const PH = pdf.internal.pageSize.getHeight();
    const ML = 6, MR = 6, CW = PW - ML - MR;
    let y = ML;

    // ── HEADER BAR ──────────────────────────────────────────────────────────
    pdf.setFillColor(15, 23, 42);
    pdf.roundedRect(ML, y, CW, 22, 2, 2, 'F');
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
    pdf.text((currentClient?.name || 'OPERACION LOGISTICA').toUpperCase().substring(0, 32), ML + 4, y + 9);
    pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(16, 185, 129);
    pdf.text('ORBITM7 LOGISTICS INTELLIGENCE', ML + 4, y + 15);

    const infoItems: [string, string][] = [
      ['DOC L', route.assignedInvoices[0]?.docLId || 'S/N'],
      ['FECHA', dateStr],
      ['VEHICULO', route.vehicle.plate],
      ['CONDUCTOR', driverName.substring(0, 18)],
      ['FACTURAS', String(route.assignedInvoices.length)],
      ['DESPACHADOR', despachador.substring(0, 16)],
    ];
    const gridX = ML + CW * 0.42;
    const itemW = (CW - CW * 0.42 - 2) / 3;
    infoItems.forEach(([label, val], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const ix = gridX + col * itemW, iy = y + 4 + row * 9;
      pdf.setFontSize(5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 116, 139);
      pdf.text(label, ix, iy);
      pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
      pdf.text(val, ix, iy + 5);
    });
    y += 26;

    // ── PAYMENT SECTION ──────────────────────────────────────────────────────
    const bankW = Math.floor(CW * 0.62);
    const totW = CW - bankW - 3;
    const totX = ML + bankW + 3;

    autoTable(pdf, {
      startY: y, margin: { left: ML }, tableWidth: bankW,
      head: [['BANCO', 'VALOR', 'COMPROBANTE', 'FECHA']],
      body: [['','','',''],['','','',''],['','','','']],
      styles: { fontSize: 6, cellPadding: 2, minCellHeight: 6.5 },
      headStyles: { fillColor: [241,245,249], textColor: [15,23,42], fontStyle: 'bold', fontSize: 6 },
      theme: 'grid',
    });
    const bankEndY = (pdf as any).lastAutoTable.finalY;

    const fmtCOP = (v: number) => `$ ${v.toLocaleString('es-CO')}`;
    const cashTotal = route.assignedInvoices.reduce((acc, inv) => {
      const m = String((inv as any).paymentMethod || inv.items?.[0]?.paymentMethod || 'EF').toUpperCase();
      return (m === 'EF' || m === 'CONTADO' || m === 'EFECTIVO') ? acc + (Number(inv.invoiceValue) || 0) : acc;
    }, 0);
    const creditTotal = route.assignedInvoices.reduce((acc, inv) => {
      const m = String((inv as any).paymentMethod || inv.items?.[0]?.paymentMethod || '').toUpperCase();
      return (m.includes('30D') || m.includes('60D') || m.includes('CREDIT') || m === 'CR') ? acc + (Number(inv.invoiceValue) || 0) : acc;
    }, 0);
    const totRows: [string, string][] = [
      ['EFECTIVO (EF)', fmtCOP(cashTotal)],
      ['CREDITO (30/60D)', fmtCOP(creditTotal)],
      ['DIFERENCIA', '$ 0'],
      ['TOTAL RECAUDO', fmtCOP(cashTotal + creditTotal)],
    ];
    let totY = y;
    totRows.forEach(([label, val], i) => {
      const isLast = i === totRows.length - 1;
      pdf.setFillColor(...(isLast ? [15,23,42] : [241,245,249]) as [number,number,number]);
      pdf.rect(totX, totY, totW, 6.5, 'F');
      pdf.setDrawColor(203, 213, 225); pdf.rect(totX, totY, totW, 6.5);
      pdf.setFontSize(5.5); pdf.setFont('helvetica', isLast ? 'bold' : 'normal');
      pdf.setTextColor(...(isLast ? [255,255,255] : [15,23,42]) as [number,number,number]);
      pdf.text(label, totX + 1.5, totY + 4.5);
      pdf.text(val, totX + totW - 1.5, totY + 4.5, { align: 'right' });
      totY += 6.5;
    });
    y = Math.max(bankEndY, totY) + 3;

    pdf.setFillColor(15, 23, 42); pdf.rect(ML, y, CW, 6, 'F');
    pdf.setFontSize(6); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(16, 185, 129);
    pdf.text('CUENTA CORRIENTE BANCOLOMBIA 217-392356-56 (RECAUDO OFICIAL)', PW / 2, y + 4, { align: 'center' });
    y += 8;

    // ── INVOICES TABLE ────────────────────────────────────────────────────────
    // Columnas: # | U.NEG | DOC L | FACTURA | PEDIDO | CANT | REF | VALOR | PAG | CLIENTE / DIRECCION
    // Anchos (landscape A4, CW≈285mm): 8+12+26+26+24+10+18+26+12 = 162 → CLIENTE ocupa resto ≈123mm
    autoTable(pdf, {
      startY: y, margin: { left: ML, right: MR },
      head: [['#', 'U.NEG', 'DOC L', 'FACTURA', 'PEDIDO', 'CANT', 'REF', 'VALOR', 'PAG', 'CLIENTE / DIRECCION']],
      body: route.assignedInvoices.map((inv, idx) => {
        const fi = (inv.items?.[0] || {}) as any;
        const method = String((inv as any).paymentMethod || fi.paymentMethod || '-').toUpperCase();
        return [
          String(idx + 1),
          String(inv.unCode || fi.unCode || fi.un_code || '-'),
          String(inv.docLId || '-'),
          inv.invoiceNumber,
          String(inv.orderNumber || '-'),
          String(inv.totalItems || '-'),
          String(inv.clientRef || fi.clientRef || fi.client_ref || '-'),
          fmtCOP(inv.invoiceValue || 0),
          method,
          `${inv.customerName || ''} · ${inv.address} - ${inv.city}`,
        ];
      }),
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: { fillColor: [15,23,42], textColor: [255,255,255], fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        1: { cellWidth: 12, halign: 'center' },
        2: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 24, halign: 'center' },
        5: { cellWidth: 10, halign: 'center' },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 26, halign: 'right' },
        8: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
        9: { halign: 'left' },
      },
      theme: 'grid',
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index % 2 !== 0)
          data.cell.styles.fillColor = [248, 250, 252];
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 5;

    // ── CARGO CONSOLIDATION ───────────────────────────────────────────────────
    const cargoMap = new Map<string, { id: string; name: string; total: number }>();
    route.assignedInvoices.forEach(inv => {
      inv.items?.forEach((it: any) => {
        const id = String(it.sku || it.articleId || it.id || 'N/A');
        const name = String(it.articleName || it.name || id);
        if (!cargoMap.has(id)) cargoMap.set(id, { id, name, total: 0 });
        cargoMap.get(id)!.total += Number(it.qty || it.expectedQty || it.quantity || 0);
      });
    });
    const cargoItems = Array.from(cargoMap.values()).sort((a, b) => a.id.localeCompare(b.id));
    if (cargoItems.length > 0) {
      if (y > PH - 65) { pdf.addPage(); y = ML; }
      pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(15, 23, 42);
      pdf.text('CONSOLIDADO DE MERCANCIA (RESUMEN DE CARGA)', ML, y);
      y += 4;
      // 3 grupos por fila: ID | DESCRIPCIÓN | CANT | NOTAS  ×3
      // Anchos por grupo (CW≈285mm / 3 = 95mm): id=18, desc=47, cant=11, notas=19 = 95mm
      const cargoRows: string[][] = [];
      for (let i = 0; i < cargoItems.length; i += 3) {
        const a = cargoItems[i], b = cargoItems[i + 1], c = cargoItems[i + 2];
        cargoRows.push([
          a.id, a.name.substring(0, 28), String(a.total), '',
          b ? b.id : '', b ? b.name.substring(0, 28) : '', b ? String(b.total) : '', '',
          c ? c.id : '', c ? c.name.substring(0, 28) : '', c ? String(c.total) : '', '',
        ]);
      }
      autoTable(pdf, {
        startY: y, margin: { left: ML, right: MR },
        head: [['ID','DESCRIPCION','CANT','NOTAS','ID','DESCRIPCION','CANT','NOTAS','ID','DESCRIPCION','CANT','NOTAS']],
        body: cargoRows,
        styles: { fontSize: 6, cellPadding: 2 },
        headStyles: { fillColor: [15,23,42], textColor: [255,255,255], fontStyle: 'bold', fontSize: 6 },
        columnStyles: {
          0:  { cellWidth: 18, halign: 'center' },
          1:  { cellWidth: 47 },
          2:  { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
          3:  { cellWidth: 19 },
          4:  { cellWidth: 18, halign: 'center' },
          5:  { cellWidth: 47 },
          6:  { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
          7:  { cellWidth: 19 },
          8:  { cellWidth: 18, halign: 'center' },
          9:  { cellWidth: 47 },
          10: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
          11: { cellWidth: 19 },
        },
        theme: 'grid',
      });
      y = (pdf as any).lastAutoTable.finalY + 8;
    }

    // ── SIGNATURES ────────────────────────────────────────────────────────────
    if (y > PH - 40) { pdf.addPage(); y = ML + 20; }
    const sigW = (CW - 20) / 2;
    pdf.setDrawColor(15, 23, 42); pdf.setLineWidth(0.4);
    pdf.line(ML + 5, y + 18, ML + 5 + sigW, y + 18);
    pdf.line(ML + 5 + sigW + 20, y + 18, ML + 5 + sigW * 2 + 20, y + 18);
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(15, 23, 42);
    pdf.text('FIRMA CONDUCTOR', ML + 5 + sigW / 2, y + 22, { align: 'center' });
    pdf.setFontSize(6); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 116, 139);
    pdf.text(driverName.toUpperCase(), ML + 5 + sigW / 2, y + 27, { align: 'center' });
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(15, 23, 42);
    pdf.text('DESPACHO / AUDITORIA', ML + 5 + sigW + 20 + sigW / 2, y + 22, { align: 'center' });
    pdf.setFontSize(6); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 116, 139);
    pdf.text(despachador.toUpperCase(), ML + 5 + sigW + 20 + sigW / 2, y + 27, { align: 'center' });

    pdf.setFontSize(5); pdf.setTextColor(148, 163, 184);
    pdf.text(`ORBITM7 Intelligence - ${dateStr} - ${route.vehicle.plate} - ${route.assignedInvoices.length} facturas`, PW / 2, PH - 5, { align: 'center' });

    pdf.save(fileName);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unusedLegacy = (route: SuggestedRoute) => {
    const despachador = user.name || 'SISTEMA ORBIT';
    const driverName = (route.vehicle as any).driverName || (route.vehicle as any).driver_name || (route as any).driver_name || 'Oscar Santamaria';

    // 0. Logo del Cliente Dinamico (Soporte multi-campo & Base64 robusto)
    const currentClient = (clients || []).find(c => String(c.id) === String(selectedClient));
    let clientLogo = currentClient?.logo_url || currentClient?.logoUrl || currentClient?.logo || currentClient?.avatar || '';

    if (clientLogo && !clientLogo.startsWith('http') && !clientLogo.startsWith('data:')) {
        clientLogo = `data:image/png;base64,${clientLogo}`;
    }
    if (!clientLogo) clientLogo = 'https://placehold.co/150x50?text=CLIENTE+LOGO';

    // 1. Cálculos de Cabecera y Resumen
    const totalItemsCount = route.assignedInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.totalItems) || 0), 0);
    
    // 2. Consolidación de Carga
    const cargoMap = new Map<string, { id: string, name: string, total: number, unit?: string }>();
    route.assignedInvoices.forEach(inv => {
      inv.items?.forEach((it: any) => {
        const id = it.sku || it.articleId || (it as any).id || 'N/A';
        const name = (it as any).articleName || (it as any).name || id;
        if (!cargoMap.has(id)) cargoMap.set(id, { id, name, total: 0, unit: it.unit });
        cargoMap.get(id)!.total += Number(it.qty || it.expectedQty || (it as any).quantity || 0);
      });
    });

    // 3. Lógica de Totales Verídicos
    const cashTotal = route.assignedInvoices.reduce((acc, inv) => {
      const method = String((inv as any).paymentMethod || inv.items?.[0]?.paymentMethod || 'EF').toUpperCase();
      const isCash = method === 'EF' || method === 'CONTADO' || method === 'EFECTIVO';
      return isCash ? acc + (Number(inv.invoiceValue) || 0) : acc;
    }, 0);

    const creditTotal = route.assignedInvoices.reduce((acc, inv) => {
      const method = String((inv as any).paymentMethod || inv.items?.[0]?.paymentMethod || '').toUpperCase();
      const isCredit = method.includes('30D') || method.includes('60D') || method.includes('CREDIT') || method === 'CR';
      return isCredit ? acc + (Number(inv.invoiceValue) || 0) : acc;
    }, 0);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>PLANILLA - ${route.vehicle.plate}</title>
          <style>
            @page { size: letter landscape; margin: 0.3cm; }
            body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 8px; }
            .compact-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
            .logo-img { max-height: 45px; max-width: 150px; object-fit: contain; }
            .header-info-grid { display: flex; gap: 12px; }
            .info-col { display: flex; flex-direction: column; line-height: 1.1; }
            .info-label { font-size: 6px; font-weight: 800; color: #64748b; text-transform: uppercase; }
            .info-val { font-size: 9px; font-weight: 900; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 3px; font-size: 7px; font-weight: 900; text-transform: uppercase; }
            td { border: 1px solid #cbd5e1; padding: 3px; font-weight: 700; height: 14px; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }

            .top-grid { display: grid; grid-template-columns: 2.2fr 1fr; gap: 15px; }
            .totals-box { border: 2px solid #000; border-radius: 4px; overflow: hidden; }
            .total-row { display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
            .total-row:last-child { border-bottom: none; background: #f8fafc; font-weight: 900; font-size: 10px; }
            .bank-strip { background: #0f172a; color: #fff; text-align: center; padding: 3px; font-weight: 900; margin-bottom: 5px; font-size: 7px; }
            
            .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 40px; padding: 0 40px; }
            .sig-box { border-top: 2px solid #0f172a; text-align: center; padding-top: 8px; font-weight: 900; text-transform: uppercase; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="compact-header">
            <div style="display:flex; align-items:center; gap:12px;">
              <img src="${clientLogo}" class="logo-img" onerror="this.src='https://placehold.co/100x45?text=LOGO'"/>
              <div>
                <div style="font-size: 11px; font-weight: 900;">${(currentClient?.name || 'OPERACIÓN LOGÍSTICA').toUpperCase()}</div>
                <div style="font-size: 6px; font-weight: 700; color:#64748b">ORBITM7 LOGISTICS INTELLIGENCE</div>
              </div>
            </div>
            <div class="header-info-grid">
               <div class="info-col"> <span class="info-label">Operación (DOC L)</span> <span class="info-val">${route.assignedInvoices[0]?.docLId || 'S/N'}</span> </div>
               <div class="info-col"> <span class="info-label">Fecha</span> <span class="info-val">${new Date().toLocaleDateString('es-CO')}</span> </div>
               <div class="info-col"> <span class="info-label">Vehículo</span> <span class="info-val">${route.vehicle.plate}</span> </div>
               <div class="info-col"> <span class="info-label">FACTURAS</span> <span class="info-val">${route.assignedInvoices.length}</span> </div>
               <div class="info-col"> <span class="info-label">Conductor</span> <span class="info-val">${driverName}</span> </div>
               <div class="info-col"> <span class="info-label">Despachador</span> <span class="info-val">${despachador}</span> </div>
            </div>
          </div>

          <div class="top-grid">
            <table>
              <thead> <tr><th>BANCO</th><th>VALOR</th><th>COMPROBANTE</th><th>FECHA</th></tr> </thead>
              <tbody> ${Array(4).fill(0).map(() => `<tr><td></td><td></td><td></td><td></td></tr>`).join('')} </tbody>
            </table>
            <div class="totals-box">
              <div class="total-row"><span>EFECTIVO (EF):</span> <span>$ ${cashTotal.toLocaleString()}</span></div>
              <div class="total-row"><span>CRÉDITO (30D/60D):</span> <span>$ ${creditTotal.toLocaleString()}</span></div>
              <div class="total-row"><span>DIFERENCIA:</span> <span style="color:red">$ 0</span></div>
              <div class="total-row"><span>TOTAL RECAUDO:</span> <span>$ ${cashTotal.toLocaleString()}</span></div>
            </div>
          </div>

          <div class="bank-strip">🏦 CUENTA CORRIENTE BANCOLOMBIA 217-392356-56 (RECAUDO OFICIAL)</div>

          <table>
            <thead>
              <tr>
                <th width="35">U.NEG</th>
                <th width="75">FACTURA</th>
                <th width="75"># INTERNO</th>
                <th width="35">CANT</th>
                <th width="85">REF CLIENTE</th>
                <th width="75">VALOR</th>
                <th width="35">C.PAG</th>
                <th>CLIENTE / DIRECCIÓN</th>
              </tr>
            </thead>
            <tbody>
              ${route.assignedInvoices.map(inv => {
                const firstItem = inv.items?.[0] || {} as any;
                const method = String(inv.paymentMethod || firstItem.paymentMethod || '-').toUpperCase();
                return `
                  <tr>
                    <td class="text-center">${inv.unCode || firstItem.unCode || firstItem.un_code || '-'}</td>
                    <td class="text-center" style="font-weight:900;">${inv.invoiceNumber}</td>
                    <td class="text-center">${inv.orderNumber || inv.docLId || '-'}</td>
                    <td class="text-center">${inv.totalItems || '-'}</td>
                    <td class="text-center">${inv.clientRef || firstItem.clientRef || firstItem.client_ref || '-'}</td>
                    <td class="text-right" style="font-family: monospace;">$ ${(inv.invoiceValue || 0).toLocaleString()}</td>
                    <td class="text-center" style="background:#f8fafc; font-weight:900;">${method}</td>
                    <td><div style="font-weight:900">${inv.customerName}</div><div style="font-size:7px; color:#64748b">${inv.address} - ${inv.city}</div></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div style="margin-top:10px;">
            <div style="font-weight:900; font-size:8px; border-bottom:1px solid #000; margin-bottom:5px; text-transform:uppercase;">📦 CONSOLIDADO DE MERCANCÍA (RESUMEN DE CARGA) - ORDENADO POR ID</div>
            <table style="width:100%; table-layout: fixed;">
              <thead>
                <tr>
                  <th width="15%">ID</th><th width="25%">DESCRIPCIÓN</th><th width="10%">CANT</th>
                  <th style="border-left: 2px solid #000;" width="15%">ID</th><th width="25%">DESCRIPCIÓN</th><th width="10%">CANT</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  const items = Array.from(cargoMap.values()).sort((a, b) => a.id.localeCompare(b.id));
                  const rows = [];
                  for (let i = 0; i < items.length; i += 2) {
                    const it1 = items[i];
                    const it2 = items[i + 1];
                    rows.push(`
                      <tr>
                        <td class="text-center">${it1.id}</td>
                        <td style="font-size:6.5px; overflow:hidden; white-space:nowrap;">${it1.name}</td>
                        <td class="text-center" style="font-weight:900; background:#fefce8;">${it1.total}</td>
                        
                        <td style="border-left: 2px solid #000;" class="text-center">${it2 ? it2.id : ''}</td>
                        <td style="font-size:6.5px; overflow:hidden; white-space:nowrap;">${it2 ? it2.name : ''}</td>
                        <td class="text-center" style="font-weight:900; background:#fefce8;">${it2 ? it2.total : ''}</td>
                      </tr>
                    `);
                  }
                  return rows.join('');
                })()}
              </tbody>
            </table>
          </div>

          <div class="signature-section">
            <div class="sig-box">FIRMA CONDUCTOR: ${driverName.toUpperCase()}</div>
            <div class="sig-box">DESPACHO / AUDITORÍA: ${despachador.toUpperCase()}</div>
          </div>

          <script>window.onload = () => { setTimeout(() => { window.print(); }, 500); };</script>
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
      <div className="bg-white p-4 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col gap-3 shrink-0 transition-all">
        {/* Fila 1: icono + título + KPIs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 bg-slate-950 text-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
            <Icons.Route className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-base sm:text-xl font-black text-slate-900 tracking-tighter uppercase leading-none">OrbitM7 Intelligence</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm">Optimización 90%</span>
              <select
                value={selectedClient}
                onChange={(e) => { setSelectedClient(e.target.value); setSuggestedRoutes([]); }}
                className="bg-slate-50 border border-slate-200 px-3 py-0.5 rounded-md text-[9px] font-black uppercase outline-none focus:border-emerald-500 shadow-sm max-w-[160px]"
              >
                {isSuperAdmin && <option value="GLOBAL">FLOTA GLOBAL ORBIT</option>}
                {allowedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* KPI BADGES */}
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 ml-auto shrink-0">
            <div className="flex flex-col items-center">
              <p className="text-[12px] font-black text-slate-900 leading-none">{validInvoices.length}</p>
              <p className="text-[6px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Aptas</p>
            </div>
            <div className="w-px h-4 bg-slate-100 mx-1"></div>
            <div className="flex flex-col items-center">
              <p className="text-[12px] font-black text-slate-900 leading-none">{fleetGeneralMetrics.onBase}</p>
              <p className="text-[6px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Base</p>
            </div>
            <div className="w-px h-4 bg-slate-100 mx-1"></div>
            <div className="flex flex-col items-center">
              <p className="text-[12px] font-black text-slate-900 leading-none">{fleetGeneralMetrics.assigned}</p>
              <p className="text-[6px] font-black text-indigo-500 uppercase tracking-widest mt-0.5">Asig</p>
            </div>
            <div className="w-px h-4 bg-slate-100 mx-1"></div>
            <div className="flex flex-col items-center">
              <p className="text-[12px] font-black text-slate-900 leading-none">{fleetGeneralMetrics.inRoute}</p>
              <p className="text-[6px] font-black text-amber-500 uppercase tracking-widest mt-0.5">Ruta</p>
            </div>
          </div>
        </div>

        {/* Fila 2: controles de acción — scroll horizontal en móvil */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" style={{ scrollbarWidth: 'none' }}>
          <div className="relative shrink-0 group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icons.Search className="h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Placa o conductor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2.5 text-[10px] font-bold uppercase tracking-wide focus:ring-2 focus:ring-indigo-500 shadow-sm w-36 sm:w-52 shrink-0"
            />
          </div>

          <button
            onClick={() => runOrbitOptimization(undefined)}
            disabled={isOptimizing || validInvoices.length === 0}
            className="shrink-0 bg-slate-900 text-emerald-500 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[0.15em] shadow-xl hover:bg-emerald-500 hover:text-slate-900 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            {isOptimizing ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full"></div> : <Icons.Scan className="w-3.5 h-3.5" />}
            {isOptimizing ? '...' : (suggestedRoutes.length > 0 ? 'RECALCULAR' : 'GENERAR')}
          </button>

          <button
            onClick={handleMassAssign}
            disabled={isSaving || suggestedRoutes.length === 0}
            className="shrink-0 bg-emerald-500 text-slate-950 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 disabled:opacity-20 active:scale-95 whitespace-nowrap"
          >
            <Icons.CheckCircle className="w-3.5 h-3.5" />
            {isSaving ? '...' : 'CONFIRMAR TODO'}
          </button>

          <button
            onClick={handleGeneralReadjustment}
            disabled={isOptimizing || suggestedRoutes.length === 0}
            className="shrink-0 px-4 py-2.5 bg-amber-50 text-amber-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all shadow-md active:scale-95 disabled:opacity-20 whitespace-nowrap"
          >
            REAJUSTE
          </button>

          <button
            onClick={() => setManualRouteModal(true)}
            disabled={remainingVehicles.length === 0}
            className="shrink-0 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-md active:scale-95 disabled:opacity-20 whitespace-nowrap flex items-center gap-1.5"
          >
            <Icons.Plus className="w-3 h-3" />
            RUTA MANUAL
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
              <p className="text-[7px] font-black text-indigo-300 uppercase tracking-widest leading-none mb-1">Resultado Orbit aplicado</p>
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
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Motor Orbit en Reposo</h3>
                <p className="text-xs text-slate-400 font-bold max-w-sm mt-2 uppercase tracking-wide">
                  Inicie el análisis basado en facturas aprobadas listas para despacho.
                </p>
              </div>
            </div>
          ) : (

            <div className="flex flex-col gap-4">
              {/* Información de Optimización IA (Compacta) */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                  <Icons.Brain className="text-emerald-500 w-5 h-5 animate-pulse" />
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    Plan óptimo generado con {Math.round(suggestedRoutes.reduce((acc, r) => acc + (r.utilization || 0), 0) / (suggestedRoutes.length || 1))}% de eficiencia promedio
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-900 leading-none">{suggestedRoutes.length}</p>
                    <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest mt-1">Rutas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-900 leading-none">{suggestedRoutes.reduce((acc, r) => acc + (r.assignedInvoices?.length || 0), 0)}</p>
                    <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest mt-1">Facts</p>
                  </div>
                </div>
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
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${route.utilization > 92 ? 'bg-red-500 text-white' : route.utilization >= 85 ? 'bg-emerald-500 text-slate-950' : 'bg-amber-400 text-slate-950'}`}><Icons.Truck className="w-5 h-5" /></div>
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
                            <p className="text-[8px] text-slate-400 font-black uppercase mt-1 tracking-widest flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getCityDotColor(route.city) }} />
                              {route.city} • {(route.vehicle as any).driverName || 'S/C'}
                            </p>
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-white/10 rounded-full text-[7px] text-slate-300 font-bold">
                              ↩ ~{estimateRouteReturn(route.assignedInvoices.length)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-black text-white">
                              <span className={(Number(route.totalVolume) || 0) > (Number(route.vehicle.capacityM3) || 30) ? 'text-red-400' : 'text-emerald-400'}>
                                {(Number(route.totalVolume) || 0).toFixed(2)}
                              </span>
                              <span className="text-slate-500 mx-1">/</span>
                              {(Number(route.vehicle.capacityM3) || 0).toFixed(2)}m³
                            </p>
                            <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden w-20 ml-auto">
                              <div
                                className={`h-full rounded-full transition-all ${route.utilization > 92 ? 'bg-red-400' : route.utilization >= 85 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                style={{ width: `${Math.min(route.utilization, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="w-[1px] h-6 bg-white/10"></div>
                          <div>
                            <p className={`text-xl font-black ${route.utilization > 92 ? 'text-red-400' : route.utilization >= 85 ? 'text-emerald-400' : 'text-amber-400'}`}>{route.utilization}%</p>
                            <p className="text-[6px] font-black uppercase text-slate-600 tracking-widest">Ocupacion</p>
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
                          const estimatedArrival = estimateStopArrival(iIdx);
                          const hasTimeWindow = !!(inv as any).detectedTime;
                          return (
                            <div key={`${inv.id}-${iIdx}`} className={`p-3 bg-white rounded-xl border ${isPriority ? 'border-amber-400 ring-1 ring-amber-100' : 'border-slate-100'} shadow-sm group/item hover:shadow-md transition-all flex flex-col gap-2`}>
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-7 h-7 ${isPriority ? 'bg-amber-500 text-white ring-2 ring-amber-300/50' : 'bg-slate-800 text-white'} rounded-lg flex items-center justify-center font-black text-[9px] shrink-0 shadow-sm`}>{iIdx + 1}</div>
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

                              <div className="flex items-center gap-2 text-[8px]">
                                <Icons.Clock className="w-3 h-3 text-slate-400" />
                                <span className="text-slate-500 font-semibold">Est. llegada:</span>
                                <span className="font-black text-slate-700">{estimatedArrival}</span>
                                {hasTimeWindow && (() => {
                                  const urg = getTimeWindowUrgency((inv as any).timeWindowMinutes);
                                  return (
                                    <span className={`ml-1 px-1.5 py-0.5 font-black rounded text-[7px] border ${urg === 'critical' ? 'bg-red-100 text-red-700 border-red-200' : urg === 'warning' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                                      {urg === 'critical' ? '🔴' : urg === 'warning' ? '🟡' : '🟢'} {(inv as any).detectedTime}
                                    </span>
                                  );
                                })()}
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
                                    <p className="text-[10px] font-black text-emerald-600">{(Number(inv.volumeM3) || 0).toFixed(2)}m³</p>
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
                          onClick={() => setRouteMapModal({ isOpen: true, route })}
                          className="px-4 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all shadow-sm font-bold text-[10px] uppercase gap-2"
                          title="Ver ruta en mapa"
                        >
                          <Icons.MapPin className="w-4 h-4" />
                          MAPA
                        </button>
                        <button
                          onClick={() => handleExportPlanilla(route)}
                          className="px-4 bg-slate-50 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm font-bold text-[10px] uppercase gap-2"
                          title="Exportar Planilla PDF A4"
                        >
                          <Icons.FileText className="w-4 h-4" />
                          PDF
                        </button>
                        <button
                          onClick={() => {
                            setSuggestedRoutes(prev => prev.filter((_, i) => i !== rIdx));
                            toast.success(`Ruta del vehículo ${route.vehicle.plate} descartada. Facturas devueltas a la bolsa.`);
                          }}
                          className="px-4 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm font-bold text-[10px] uppercase gap-2"
                          title="Eliminar ruta de sugerencias y devolver facturas"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
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
      {addInvoiceModal.isOpen && (() => {
        const activeRoute = addInvoiceModal.routeIndex !== null ? suggestedRoutes[addInvoiceModal.routeIndex] : null;
        const routeInvCount  = activeRoute?.assignedInvoices?.length ?? 0;
        const routeVolUsed   = activeRoute?.assignedInvoices?.reduce((s, i) => s + (Number(i.volumeM3) || 0), 0) ?? 0;
        const vehicleCapacity = Number((activeRoute?.vehicle as any)?.capacityM3 || (activeRoute?.vehicle as any)?.capacity_m3 || 0);
        const plate      = (activeRoute?.vehicle as any)?.plate || '—';
        const driverName = (activeRoute?.vehicle as any)?.driverName || (activeRoute?.vehicle as any)?.driver_name || 'Sin conductor';
        return (
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
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Seleccione una factura pendiente</p>
                  </div>
                </div>
                <button onClick={() => { setAddInvoiceModal({ isOpen: false, routeIndex: null }); setModalSearchTerm(''); }} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                  <Icons.X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Datos del vehículo destino */}
              {activeRoute && (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 bg-slate-900 text-white rounded-xl px-3 py-1.5">
                    <Icons.Truck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-black uppercase tracking-wider">{plate}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 border border-slate-200">
                    <Icons.User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase truncate max-w-[160px]">{driverName}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 border border-slate-200">
                    <Icons.Package className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[11px] font-black text-slate-700">{routeInvCount} fact.</span>
                  </div>
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 border ${vehicleCapacity > 0 && routeVolUsed / vehicleCapacity > 0.9 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                    <Icons.Package className="w-3.5 h-3.5 text-amber-400" />
                    <span className={`text-[11px] font-black ${vehicleCapacity > 0 && routeVolUsed / vehicleCapacity > 0.9 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {routeVolUsed.toFixed(2)} / {vehicleCapacity > 0 ? vehicleCapacity.toFixed(2) : '—'} m³
                    </span>
                  </div>
                </div>
              )}

              <div className="relative">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input
                  ref={addInvoiceInputRef}
                  autoFocus
                  type="text"
                  placeholder="Buscar por factura, cliente o pedido..."
                  value={modalSearchTerm}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const clearAll = () => {
                      setModalSearchTerm('');
                      if (addInvoiceInputRef.current) {
                        addInvoiceInputRef.current.value = '';
                        addInvoiceInputRef.current.focus();
                      }
                    };

                    // ── SUPRIMIR chars residuales post-scan ──
                    // Usamos React state (no DOM) para que el input controlado quede realmente vacío
                    if (scanSuppressRef.current) {
                      clearTimeout(scanSuppressRef.current);
                      scanSuppressRef.current = setTimeout(() => { scanSuppressRef.current = null; }, 1200);
                      setModalSearchTerm('');
                      return;
                    }

                    // ── DETECCIÓN DE SCAN (pistola/QR) ──
                    // Solo dispara si contiene prefijo DIAN "NumFac" O si el texto llega muy largo
                    // de golpe (> 50 chars). Evita falsos positivos al escribir manualmente.
                    const isScan = raw.length > 50 || /NumFac/i.test(raw);

                    if (isScan) {
                      // Estrategia 1: formato DIAN PDF417/QR → NumFac:XXXXXXX
                      let invoiceNum: string | null = null;
                      const numFacMatch = raw.match(/NumFac[:\s]*([A-Z0-9\-]+)/i);
                      if (numFacMatch) invoiceNum = numFacMatch[1].toUpperCase();

                      // Estrategia 2: buscar patrón alfanumérico en lista de facturas
                      if (!invoiceNum) {
                        const candidates = raw.toUpperCase().match(/[A-Z]{1,5}[0-9]{4,12}/g) || [];
                        for (const c of candidates) {
                          if (unassignedInvoices.some(inv => (inv.invoiceNumber || '').toUpperCase() === c)) {
                            invoiceNum = c; break;
                          }
                        }
                        // Estrategia 3: primer candidato como filtro
                        if (!invoiceNum && candidates.length > 0) invoiceNum = candidates[0];
                      }

                      // Limpiar estado React y activar supresión
                      setModalSearchTerm('');
                      if (scanSuppressRef.current) clearTimeout(scanSuppressRef.current);
                      scanSuppressRef.current = setTimeout(() => { scanSuppressRef.current = null; }, 1200);

                      if (invoiceNum) {
                        const match = unassignedInvoices.find(
                          inv => (inv.invoiceNumber || '').toUpperCase() === invoiceNum
                               || (inv.id || '').toUpperCase().includes(invoiceNum)
                        );
                        if (match) {
                          handleAddInvoiceToRoute(match);
                        } else {
                          setModalSearchTerm(invoiceNum); // mostrar número en buscador si no está en lista
                        }
                      }
                      return;
                    }

                    // ── ESCRITURA MANUAL ──
                    setModalSearchTerm(raw.toUpperCase());
                    if (raw.length >= 4) {
                      const term = raw.toLowerCase();
                      const matches = unassignedInvoices.filter(inv =>
                        (inv.invoiceNumber || '').toLowerCase().includes(term) ||
                        (inv.orderNumber  || '').toLowerCase().includes(term)
                      );
                      if (matches.length === 1) { handleAddInvoiceToRoute(matches[0]); setModalSearchTerm(''); }
                    }
                  }}
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
                  <div key={`${inv.id}-${index}`} className="bg-slate-50 p-4 rounded-2xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-emerald-100 group">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs text-slate-900 uppercase flex flex-wrap items-center gap-1 gap-x-2">
                          <span className="whitespace-nowrap">{inv.invoiceNumber}</span>
                          <span className="text-slate-300">|</span>
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
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${documents.find(d => d.id === inv.docLId)?.planType === 'Orbit (R)' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
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
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-emerald-600">
                          {(() => { try { return (Number(inv.volumeM3) || 0).toFixed(3); } catch (e) { return "0.000"; } })()}m³
                        </p>
                        <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-tight">
                          {(() => { try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(inv.invoiceValue || 0); } catch (e) { return "$0"; } })()}
                        </p>
                        <button
                          onClick={() => handleAddInvoiceToRoute(inv)}
                          className="mt-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-sm"
                        >
                          Agregar
                        </button>
                      </div>
                    </div>
                    {(inv.notes || (inv as any).detectedTime) && (
                      <p className="text-[9px] text-amber-600 italic mt-2 line-clamp-2 font-bold bg-amber-50/50 px-2 py-1 rounded-lg border border-amber-100 w-full">
                        "{inv.notes || `ENTREGA PRIORITARIA: ${(inv as any).detectedTime}`}"
                      </p>
                    )}
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
        );
      })()}

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
                  const docMap = new Map<string, { label: string, desc: string, planType: string, invoices: Invoice[], volume: number }>();

                  // DocStatus enum usa Title Case: 'Pendiente', 'Recibido', 'En Conteo', 'Inventariado'
                  const validDocStatuses = ['pendiente', 'recibido', 'en conteo', 'inventariado'];
                  validInvoices.forEach(inv => {
                    if (!inv.docLId) return;

                    const doc = documents.find(d => d.id === inv.docLId);
                    if (doc && !validDocStatuses.includes(String(doc.status || '').toLowerCase())) return;
                    const groupKey = inv.docLId;
                    const label = doc?.externalDocId
                      ? `Documento Maestro: ${doc.externalDocId}`
                      : `Documento L: ${String(inv.docLId).slice(-8)}`;
                    const desc = doc?.inventory_observation || "Carga Masiva Orbit";

                    if (!docMap.has(groupKey)) {
                      docMap.set(groupKey, { 
                        label, 
                        desc, 
                        planType: doc?.planType || 'Normal',
                        invoices: [], 
                        volume: 0 
                      });
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

                  return Array.from(docMap.entries()).map(([key, { label, desc, planType, invoices, volume }], index) => {
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
                                <div className="flex gap-1.5">
                                  <span className="bg-amber-100 text-amber-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Activo</span>
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${planType.includes('(R)') ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {planType}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{desc}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-[9px] font-black text-amber-600 bg-white border border-amber-200 px-2 py-1 rounded-lg uppercase">
                                  {invoices.length} Facturas
                                </span>
                                <span className="text-[9px] font-black text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg uppercase">
                                  {(Number(volume) || 0).toFixed(2)}m³ Total
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
                                <p className="text-[11px] font-black text-indigo-500">
                                  {(() => {
                                    try {
                                      return (Number(inv.volumeM3) || 0).toFixed(2);
                                    } catch (e) {
                                      return "0.00";
                                    }
                                  })()}m³
                                </p>
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
                    runOrbitOptimization(targets);
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
      {/* MODAL DE CONFIRMACIÓN ELIMINACIÓN PREMIUM */}
      {showDeleteConfirm?.isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-red-500/20 max-w-sm w-full p-10 rounded-[3rem] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-[2rem] flex items-center justify-center mx-auto animate-bounce shadow-[0_0_50px_rgba(239,68,68,0.2)]">
              <div className="w-12 h-12 rotate-12"><Icons.Alert /></div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Acción Crítica</h3>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] leading-relaxed">
                ¿Deseas eliminar este Documento Maestro?
                <span className="block text-red-500 mt-1">Las facturas asociadas se ocultarán de la planificación.</span>
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <button
                onClick={confirmDeleteDocument}
                className="w-full bg-red-500 hover:bg-red-400 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-red-500/20 active:scale-95"
              >
                Confirmar Eliminación
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl font-black text-[9px] uppercase tracking-[0.2em] transition-all"
              >
                Cancelar
              </button>
            </div>
            
            <p className="text-[7px] text-slate-600 font-bold uppercase tracking-widest pt-2">OrbitM7 Data Integrity Protocol</p>
          </div>
        </div>
      )}

      {/* Modal Vista Previa de Ruta en Mapa */}
      {routeMapModal.isOpen && routeMapModal.route && (
        <div className="fixed inset-0 z-[700] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-950 rounded-t-[2.5rem] shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ backgroundColor: getCityDotColor(routeMapModal.route.city) }}>
                  <Icons.MapPin className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter">
                    Ruta — {routeMapModal.route.vehicle.plate}
                  </h3>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCityDotColor(routeMapModal.route.city) }} />
                    {routeMapModal.route.city} · {(routeMapModal.route.vehicle as any).driverName || 'S/C'} · {routeMapModal.route.assignedInvoices.length} paradas
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1.5 rounded-xl text-xs font-black ${routeMapModal.route.utilization > 92 ? 'bg-red-500/20 text-red-300' : routeMapModal.route.utilization >= 85 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {routeMapModal.route.utilization}% · {routeMapModal.route.totalVolume}m³
                </div>
                <button
                  onClick={() => setRouteMapModal({ isOpen: false, route: null })}
                  className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all"
                >
                  <Icons.X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Map + Stop list side by side */}
            <div className="flex flex-1 overflow-hidden">
              {/* Leaflet map */}
              <div id="route-preview-map" className="flex-1 z-0" style={{ minHeight: 320 }} />

              {/* Stop list */}
              <div className="w-64 shrink-0 overflow-y-auto custom-scrollbar bg-slate-50 border-l border-slate-100 p-3 space-y-2">
                {/* Hub */}
                <div className="flex items-center gap-2 p-2 bg-slate-900 rounded-xl">
                  <div className="w-7 h-7 bg-emerald-500 text-slate-950 rounded-lg flex items-center justify-center font-black text-[9px] shadow-sm shrink-0">HUB</div>
                  <div>
                    <p className="text-[8px] font-black text-emerald-400 uppercase">Punto de Despacho</p>
                    <p className="text-[7px] text-slate-400 font-bold">ORBIT HUB</p>
                  </div>
                </div>
                {routeMapModal.route.assignedInvoices.map((inv, i) => (
                  <div key={inv.id} className="flex items-start gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[9px] text-white shrink-0 shadow-sm" style={{ backgroundColor: getCityDotColor(routeMapModal.route!.city) }}>{i + 1}</div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-slate-900 truncate">{inv.invoiceNumber}</p>
                      <p className="text-[7px] text-slate-500 font-bold truncate">{inv.customerName}</p>
                      <p className="text-[7px] text-slate-400 truncate">{inv.address}</p>
                      {(inv as any).detectedTime && (
                        <span className="text-[6px] font-black text-amber-600 bg-amber-50 px-1 py-0.5 rounded mt-0.5 inline-block">
                          {(inv as any).detectedTime}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nueva Ruta Manual */}
      {manualRouteModal && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-[2.5rem]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white text-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
                  <Icons.Truck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Nueva Ruta Manual</h3>
                  <p className="text-xs font-bold text-slate-500 uppercase">Vehículos con vínculos activos remanentes</p>
                </div>
              </div>
              <button onClick={() => { setManualRouteModal(false); setManualVehicleSearch(''); }} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                <Icons.X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="px-8 pt-6 pb-2">
              <div className="relative">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar por placa o conductor..."
                  onChange={(e) => setManualVehicleSearch(e.target.value.toUpperCase())}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>
            </div>

            <div className="px-8 pb-8 overflow-y-auto custom-scrollbar flex-1 space-y-3 pt-3">
              {remainingVehicles.length === 0 && (
                <div className="py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No hay vínculos activos sobrantes</p>
                </div>
              )}
              {remainingVehicles.length > 0 && remainingVehicles.filter(v =>
                v.plate.toUpperCase().includes(manualVehicleSearch) ||
                ((v as any).driverName || '').toUpperCase().includes(manualVehicleSearch)
              ).length === 0 && (
                <div className="py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin resultados para "{manualVehicleSearch}"</p>
                </div>
              )}
              {remainingVehicles.filter(v =>
                v.plate.toUpperCase().includes(manualVehicleSearch) ||
                ((v as any).driverName || '').toUpperCase().includes(manualVehicleSearch)
              ).map(v => (
                <div
                  key={v.id}
                  onClick={() => handleCreateManualRoute(v)}
                  className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-500 hover:bg-white transition-all cursor-pointer group flex justify-between items-center"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs shadow-lg transform group-hover:scale-110 transition-transform">
                      {v.plate.slice(0, 3)}
                    </div>
                    <div>
                      <p className="font-black text-sm text-slate-900 uppercase">{v.plate}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{(v as any).driverName || 'Sin Conductor'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">CAPACIDAD</p>
                    <p className="text-sm font-black text-indigo-600">{v.capacityM3}m³</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 rounded-b-[2.5rem]">
              <p className="text-[8px] text-slate-400 font-bold uppercase text-center">Solo se muestran vehículos en estado "Disponible" con operadora activa</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;
