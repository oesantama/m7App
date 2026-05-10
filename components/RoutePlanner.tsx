
import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Invoice, Vehicle, Route, VehicleStatus, Driver, VehicleAssignment, DocumentL, DocStatus, RouteLog, User, MasterRecord } from '../types';
import { Icons, INITIAL_CLIENTS } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useAppStore } from '../stores/useAppStore';
import { HistoricoGrouping } from './Logistics/HistoricoGrouping';
import {
  OPTIMIZATION_CONSTANTS,
  estimateStopArrival,
  estimateRouteReturn,
  estimateRouteTotalMinutes,
  parseDetectedTimeToMinutes,
  rebalanceSingleRoute,
  haversineKm,
  hasDefaultCoords,
  twoOptImprove,
  threeOptImprove,
  orOpt1Intra,
  orOptInterRoute,
  ilsImprove,
  buildRoadDistFn,
  buildRoadTimeFn,
  estimateArrivalAtStopMinutes,
  classifyCorridor,
  corridorsCompatible,
} from '../utils/routeUtils';
import {
  ORBIT_HUB_ORIGIN,
  RESTRICTED_NEIGHBORHOODS,
  LARGE_VEHICLE_THRESHOLD_M3,
  RETAIL_CHAIN_KEYWORDS,
  RETAIL_CHAIN_MIN_VOLUME_M3,
  CORRIDOR_ORDER,
  MAX_ROUTE_MINUTES,
  DISPATCH_DEPARTURE_HOUR,
  normalizeCityName,
  type ViaCorridor,
} from '../config/routeConfig';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ── Sistema de Corredores Viales M7 ──────────────────────────────────────────
// Primera capa: macro-región (Oriente/Occidente Antioqueño nunca se mezclan)
// Segunda capa: corredor vial (Autopista Norte, Sur, Medellín O/Centro/E, etc.)
// La función classifyCorridor y corridorsCompatible viven en routeUtils.ts

// Barrios conocidos por lado del río — para inferir corredor desde dirección
// cuando no hay coordenadas GPS en la factura
const BARRIOS_OCCIDENTE = [
  'LAURELES','ESTADIO','SAN JAVIER','BELÉN','BELEN','ROBLEDO','FLORESTA',
  'LA AMERICA','GUAYABAL','CARLOS E RESTREPO','CALASANZ','CONQUISTADORES',
  'LA COLINA','SANTA MONICA','SANTA LUCIA','LAS VIOLETAS','LA MOTA',
  'EL VELODROMO','NUEVA VILLA DE ABURRÁ','TRINIDAD','SAN FERNANDO',
];
const BARRIOS_ORIENTE = [
  'MANRIQUE','ARANJUEZ','POPULAR','BUENOS AIRES','VILLA HERMOSA',
  'CAMPO NUÑEZ','PRADO','SEVILLA','BOSTON','LORETO','MANILA','MIAMI',
  'EL POBLADO','POBLADO','LA CANDELARIA','ALPUJARRA','EL CHAGUALO',
  'JESUS NAZARENO','SAN BENITO','LA CRUZ','MORAVIA','CASTILLA',
  'DOCE DE OCTUBRE','EL PESEBRE','PESEBRE','EL TRIUNFO','TRIUNFO',
  'CALVO SUR','NARANJAL','INDUSTRIALES',
];

/**
 * Coordenadas centroid por barrio de Medellín.
 * Usadas para asignar una ubicación aproximada real a facturas sin geocodificar
 * cuando conocemos el barrio por el texto de la dirección.
 */
const BARRIO_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // ── Occidente ──────────────────────────────────────────────────────────────
  'LAURELES':             { lat: 6.2448, lng: -75.5927 },
  'ESTADIO':              { lat: 6.2523, lng: -75.5883 },
  'SAN JAVIER':           { lat: 6.2629, lng: -75.6035 },
  'BELÉN':                { lat: 6.2260, lng: -75.6050 },
  'BELEN':                { lat: 6.2260, lng: -75.6050 },
  'ROBLEDO':              { lat: 6.2840, lng: -75.6020 },
  'FLORESTA':             { lat: 6.2532, lng: -75.6002 },
  'LA AMERICA':           { lat: 6.2479, lng: -75.5993 },
  'GUAYABAL':             { lat: 6.2060, lng: -75.5940 },
  'CARLOS E RESTREPO':    { lat: 6.2553, lng: -75.5921 },
  'CALASANZ':             { lat: 6.2577, lng: -75.5989 },
  'CONQUISTADORES':       { lat: 6.2508, lng: -75.5950 },
  'LA COLINA':            { lat: 6.2590, lng: -75.5970 },
  'SANTA MONICA':         { lat: 6.2415, lng: -75.5975 },
  'SANTA LUCIA':          { lat: 6.2350, lng: -75.6020 },
  'LAS VIOLETAS':         { lat: 6.2290, lng: -75.6060 },
  'LA MOTA':              { lat: 6.2260, lng: -75.6100 },
  'EL VELODROMO':         { lat: 6.2492, lng: -75.5862 },
  'NUEVA VILLA DE ABURRÁ':{ lat: 6.2310, lng: -75.6000 },
  'TRINIDAD':             { lat: 6.2680, lng: -75.6030 },
  'SAN FERNANDO':         { lat: 6.2352, lng: -75.5930 },
  // ── Oriente / Centro ───────────────────────────────────────────────────────
  'MANRIQUE':             { lat: 6.2878, lng: -75.5510 },
  'ARANJUEZ':             { lat: 6.2934, lng: -75.5575 },
  'POPULAR':              { lat: 6.3111, lng: -75.5555 },
  'BUENOS AIRES':         { lat: 6.2360, lng: -75.5620 },
  'VILLA HERMOSA':        { lat: 6.2440, lng: -75.5600 },
  'CAMPO NUÑEZ':          { lat: 6.2610, lng: -75.5570 },
  'PRADO':                { lat: 6.2682, lng: -75.5631 },
  'SEVILLA':              { lat: 6.2630, lng: -75.5645 },
  'BOSTON':               { lat: 6.2512, lng: -75.5620 },
  'LORETO':               { lat: 6.2475, lng: -75.5585 },
  'MANILA':               { lat: 6.2450, lng: -75.5610 },
  'MIAMI':                { lat: 6.2430, lng: -75.5555 },
  'EL POBLADO':           { lat: 6.2104, lng: -75.5700 },
  'POBLADO':              { lat: 6.2104, lng: -75.5700 },
  'LA CANDELARIA':        { lat: 6.2518, lng: -75.5636 },
  'ALPUJARRA':            { lat: 6.2478, lng: -75.5679 },
  'EL CHAGUALO':          { lat: 6.2618, lng: -75.5680 },
  'JESUS NAZARENO':       { lat: 6.2545, lng: -75.5710 },
  'SAN BENITO':           { lat: 6.2476, lng: -75.5730 },
  'LA CRUZ':              { lat: 6.3080, lng: -75.5480 },
  'MORAVIA':              { lat: 6.2850, lng: -75.5617 },
  'CASTILLA':             { lat: 6.2975, lng: -75.5740 },
  'DOCE DE OCTUBRE':      { lat: 6.3003, lng: -75.5717 },
  'EL PESEBRE':           { lat: 6.2750, lng: -75.5810 },
  'PESEBRE':              { lat: 6.2750, lng: -75.5810 },
  'EL TRIUNFO':           { lat: 6.2810, lng: -75.5760 },
  'TRIUNFO':              { lat: 6.2810, lng: -75.5760 },
  'CALVO SUR':            { lat: 6.2620, lng: -75.5695 },
  'NARANJAL':             { lat: 6.2658, lng: -75.5735 },
  'INDUSTRIALES':         { lat: 6.2550, lng: -75.5780 },
};

/** Devuelve las coordenadas del centroide de un barrio, o null si no está en la tabla. */
function getBarrioCentroid(neighborhoodKey: string): { lat: number; lng: number } | null {
  const k = neighborhoodKey.toUpperCase().trim();
  return BARRIO_CENTROIDS[k] ?? null;
}

/**
 * Infiere el lado del río desde el texto de una dirección cuando no hay barrio/coordenadas.
 * Usa keywords de barrios conocidos y luego número de carrera (río ~ CR 57-58 en Medellín).
 */
function inferMedellínSide(address: string): 'OCCIDENTE' | 'ORIENTE' | null {
  const a = address.toUpperCase();
  if (BARRIOS_OCCIDENTE.some(b => a.includes(b))) return 'OCCIDENTE';
  if (BARRIOS_ORIENTE.some(b => a.includes(b))) return 'ORIENTE';
  // Número de carrera como último recurso (río ≈ CR 57)
  const m = a.match(/\b(?:CR|CRA|CARRERA|K\.?)\s*\.?\s*(\d+)/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num > 59) return 'OCCIDENTE';
    if (num < 56) return 'ORIENTE';
  }
  return null;
}

// Centroides de municipios del Área Metropolitana del Valle de Aburrá y Oriente Antioqueño.
// Se usan cuando una factura no tiene coords históricas ni barrio reconocido,
// para que classifyCorridor reciba una coordenada real y no 0,0.
const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // Valle de Aburrá — Norte
  'BELLO':           { lat: 6.3370, lng: -75.5550 },
  'COPACABANA':      { lat: 6.3530, lng: -75.5120 },
  'GIRARDOTA':       { lat: 6.3780, lng: -75.4470 },
  'BARBOSA':         { lat: 6.4380, lng: -75.3320 },
  // Valle de Aburrá — Sur
  'ITAGÜÍ':          { lat: 6.1843, lng: -75.5990 },
  'ITAGUI':          { lat: 6.1843, lng: -75.5990 },
  'ENVIGADO':        { lat: 6.1672, lng: -75.5940 },
  'SABANETA':        { lat: 6.1513, lng: -75.6163 },
  'LA ESTRELLA':     { lat: 6.1570, lng: -75.6440 },
  'CALDAS':          { lat: 6.0937, lng: -75.6353 },
  // Oriente Antioqueño
  'RIONEGRO':        { lat: 6.1541, lng: -75.3739 },
  'MARINILLA':       { lat: 6.1753, lng: -75.3396 },
  'EL RETIRO':       { lat: 6.0560, lng: -75.5003 },
  'GUARNE':          { lat: 6.2827, lng: -75.4406 },
  'SAN VICENTE':     { lat: 6.3003, lng: -75.3346 },
  'EL SANTUARIO':    { lat: 6.1386, lng: -75.2713 },
  'CARMEN DE VIBORAL': { lat: 6.0876, lng: -75.3359 },
  // Occidente Antioqueño
  'SANTA FE DE ANTIOQUIA': { lat: 6.5567, lng: -75.8285 },
  'SOPETRÁN':        { lat: 6.5048, lng: -75.7395 },
  // Centro-Norte
  'BELMIRA':         { lat: 6.6044, lng: -75.6696 },
  'ENTRERRÍOS':      { lat: 6.5592, lng: -75.5461 },
};

// Radio máximo de dispersión geográfica por ruta (km) — se mantiene para cohesión intra-corredor
const MAX_ROUTE_RADIUS_KM = 18;

// ── Helpers de visualización ──────────────────────────────────────────────────
const CITY_PALETTE = ['#6366f1', '#8b5cf6', '#06b6d4', '#14b8a6', '#f43f5e', '#f97316', '#22c55e', '#3b82f6', '#ec4899', '#84cc16'];
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
    const invCorridor: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';
    for (const other of invoices) {
      if (assigned.has(other.id)) continue;
      // Nunca mezclar macro-regiones incompatibles aunque estén cerca por coords
      const otherCorridor: ViaCorridor = (other as any).corridor || 'MED_CENTRO';
      if (!corridorsCompatible(invCorridor, otherCorridor)) continue;
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
  neighborhood?: string;
  last_used?: string;
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

  // IDs de facturas ya confirmadas en esta sesión — evita que reboten al limpiar suggestedRoutes
  const [confirmedSessionIds, setConfirmedSessionIds] = useState<Set<string>>(new Set());
  const [currentShift, setCurrentShift] = useState<1 | 2>(1);
  const [shift1CompletedVehicleIds, setShift1CompletedVehicleIds] = useState<Set<string>>(new Set());

  const setInvoices = useAppStore(state => state.setInvoices);
  const setRoutes  = useAppStore(state => state.setRoutes);

  // Al montar: sincronizar rutas activas para que el contador SIN RUTA sea exacto desde el inicio
  useEffect(() => {
    api.getRoutes().then((r: any[]) => { if (Array.isArray(r)) setRoutes(r); }).catch(() => { });
    api.getDailyKPIs().then((d: any) => { if (d && typeof d === 'object') setDailyKPIs(d); }).catch(() => {});
  }, []);

  // Recargar facturas automáticamente cuando el usuario cambia de cliente
  useEffect(() => {
    if (!selectedClient) return;
    api.getInvoices(selectedClient === 'GLOBAL' ? undefined : selectedClient)
      .then((data: any[]) => {
        if (Array.isArray(data)) setInvoices(data);
      })
      .catch(() => { });
  }, [selectedClient]);
  const [suggestedRoutes, setSuggestedRoutes] = useState<SuggestedRoute[]>([]);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [unroutedReason, setUnroutedReason] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizingProgress, setOptimizingProgress] = useState(0);
  const [optimizingPhase, setOptimizingPhase] = useState('');
  const [viewMode, setViewMode] = useState<'intelligence' | 'map' | 'active'>('intelligence');

  const [auditLogs, setAuditLogs] = useState<RouteLog[]>([]);
  const [learningPatterns, setLearningPatterns] = useState<RoutingPattern[]>([]);
  const [deliveryPatterns, setDeliveryPatterns] = useState<Array<{ address_key: string; vehicle_id: string; plate: string; strength: number }>>([]);
  const [deliverySchedules, setDeliverySchedules] = useState<Array<{ customer_key: string; day_of_week: number; close_time: string }>>([]);
  const [learningExemptions, setLearningExemptions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [auditModal, setAuditModal] = useState<{ isOpen: boolean; action: any; data: any } | null>(null);
  const [auditComment, setAuditComment] = useState('');
  const [addInvoiceModal, setAddInvoiceModal] = useState<{ isOpen: boolean; routeIndex: number | null; tab: 'plan' | 'repice' }>({ isOpen: false, routeIndex: null, tab: 'plan' });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<Invoice | null>(null);
  const [manualRouteModal, setManualRouteModal] = useState(false);
  const [historicoModalOpen, setHistoricoModalOpen] = useState(false);
  const [manualVehicleSearch, setManualVehicleSearch] = useState('');
  const [scheduleModal, setScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ customerName: '', city: '', dayOfWeek: new Date().getDay(), closeTime: '10:00', label: '' });
  const [scheduleSaving, setScheduleSaving] = useState(false);
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
  const [allRoutesMapOpen, setAllRoutesMapOpen] = useState(false);
  const allRoutesMapRef = useRef<L.Map | null>(null);
  const [routeMapStats, setRouteMapStats] = useState<{ km: number; minutes: number } | null>(null);
  const routePreviewMapRef = useRef<L.Map | null>(null);
  const [dailyKPIs, setDailyKPIs] = useState<{
    routes_today: number; total_volume_m3: number; avg_utilization: number;
    invoices_assigned: number; invoices_delivered: number; invoices_returned: number;
    invoices_repice: number; shift2_routes: number; vehicles_active: number;
  } | null>(null);
  const scanSuppressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addInvoiceInputRef = useRef<HTMLInputElement>(null);
  const [isPendingInvoicesModalOpen, setIsPendingInvoicesModalOpen] = useState(false);
  const [pendingInvoicesSearch, setPendingInvoicesSearch] = useState('');

  const handleApplyHistoricalGrouping = (groups: Array<{ vehicle: Vehicle; invoices: Invoice[]; title: string }>) => {
    const mapped: SuggestedRoute[] = groups.map((g, idx) => {
      const vol = g.invoices.reduce((sum, item) => sum + (Number(item.volumeM3) || 0), 0);
      const cap = Number(g.vehicle.capacityM3 || (g.vehicle as any).capacity_m3) || 30;
      const util = Math.round((vol / cap) * 100);

      return {
        id: `route-hist-${Date.now()}-${idx}`,
        vehicle: g.vehicle,
        assignedInvoices: g.invoices,
        totalVolume: Number(vol.toFixed(4)),
        utilization: util,
        city: g.invoices[0]?.city || 'GLOBAL'
      };
    });

    setSuggestedRoutes(mapped);
  };

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

  const exportPendingInvoices = () => {
    const data = unassignedInvoices.map(inv => {
      const doc = documents.find(d => d.id === inv.docLId);
      return {
        'Documento L': doc?.externalDocId || inv.docLId,
        'Fecha': doc?.deliveryDate || doc?.createdAt || 'N/A',
        'Placa': doc?.vehicleData || 'N/A',
        'Factura': inv.invoiceNumber || 'N/A',
        'Cant Artículos': inv.items?.length || 0,
        'Cliente': inv.customerName || 'N/A',
        'Ciudad': inv.city || 'N/A',
        'Volumen M3': inv.volumeM3 || 0
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturas Pendientes");
    XLSX.writeFile(wb, `Facturas_Pendientes_Orbit_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Mapa de vista previa de ruta
  useEffect(() => {
    if (!routeMapModal.isOpen || !routeMapModal.route) {
      if (routePreviewMapRef.current) {
        routePreviewMapRef.current.remove();
        routePreviewMapRef.current = null;
      }
      setRouteMapStats(null);
      return;
    }
    let cancelled = false;

    const initMap = async () => {
      // Esperar a que el container tenga dimensiones reales (máx 20 intentos × 50ms)
      let container: HTMLElement | null = null;
      for (let i = 0; i < 20; i++) {
        container = document.getElementById('route-preview-map');
        if (container && container.clientWidth > 0 && container.clientHeight > 0) break;
        await new Promise(r => setTimeout(r, 50));
        if (cancelled) return;
      }
      if (!container || cancelled) return;

      if (routePreviewMapRef.current) {
        routePreviewMapRef.current.remove();
        routePreviewMapRef.current = null;
      }

      const route = routeMapModal.route!;
      const dotColor = getCityDotColor(route.city);

      // Usar coordenadas existentes directamente (sin bloquear con geocodificación)
      const DEFAULT_LAT = 6.2518, DEFAULT_LNG = -75.5636;
      const isDefaultCoord = (lat: number, lng: number) =>
        Math.abs(lat - DEFAULT_LAT) < 0.0001 && Math.abs(lng - DEFAULT_LNG) < 0.0001;
      const stops = route.assignedInvoices.filter(inv => {
        const lat = Number(inv.lat), lng = Number(inv.lng);
        return lat !== 0 && lng !== 0 && !isDefaultCoord(lat, lng);
      });
      const centerLat = stops.length > 0 ? stops.reduce((a, inv) => a + Number(inv.lat), 0) / stops.length : ORBIT_HUB_ORIGIN.lat;
      const centerLng = stops.length > 0 ? stops.reduce((a, inv) => a + Number(inv.lng), 0) / stops.length : ORBIT_HUB_ORIGIN.lng;

      // Inicializar mapa con dimensiones ya garantizadas
      const map = L.map(container, { zoomControl: true, preferCanvas: true }).setView([centerLat, centerLng], 12);
      routePreviewMapRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);
      // Forzar recálculo de tamaño por si el contenedor estaba oculto al montar
      setTimeout(() => map.invalidateSize(), 0);

      // Hub marker
      const hubIcon = L.divIcon({
        html: `<div style="background:#0f172a;color:#10b981;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;border:2px solid #10b981;box-shadow:0 2px 8px rgba(0,0,0,0.5)">HUB</div>`,
        className: '', iconSize: [30, 30], iconAnchor: [15, 15]
      });
      L.marker([ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng], { icon: hubIcon })
        .bindPopup('<b>HUB ORBIT</b><br>Punto de despacho').addTo(map);

      // Agrupar paradas por coordenada única (radio ~11m = 4 decimales)
      const stopGroups = new Map<string, typeof stops>();
      stops.forEach(inv => {
        const key = `${Number(inv.lat).toFixed(4)}_${Number(inv.lng).toFixed(4)}`;
        if (!stopGroups.has(key)) stopGroups.set(key, []);
        stopGroups.get(key)!.push(inv);
      });

      const points: L.LatLng[] = [L.latLng(ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng)];
      let stopSeq = 0;
      stopGroups.forEach((group) => {
        stopSeq++;
        const lat = Number(group[0].lat), lng = Number(group[0].lng);
        points.push(L.latLng(lat, lng));
        const count = group.length;
        const badge = count > 1
          ? `<div style="position:absolute;top:-6px;right:-6px;background:#f43f5e;color:white;width:16px;height:16px;border-radius:50%;font-size:8px;font-weight:900;display:flex;align-items:center;justify-content:center;border:1.5px solid white">${count}</div>`
          : '';
        const stopIcon = L.divIcon({
          html: `<div style="position:relative;display:inline-block"><div style="background:${dotColor};color:white;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${stopSeq}</div>${badge}</div>`,
          className: '', iconSize: [28, 28], iconAnchor: [14, 14]
        });
        const popupContent = group.map((inv, gi) =>
          `<b>${gi === 0 ? stopSeq + '. ' : '&nbsp;&nbsp;&nbsp;'}${inv.invoiceNumber}</b> — ${inv.customerName || ''}<br><small>${inv.address} · ${inv.city}</small>`
        ).join('<hr style="margin:4px 0">');
        L.marker([lat, lng], { icon: stopIcon })
          .bindPopup(`<div style="min-width:180px">${popupContent}</div>`)
          .addTo(map);
      });

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });

        // Línea de fallback inmediata (guiones) mientras carga OSRM
        const fallbackLine = L.polyline(points, { color: dotColor, weight: 2.5, opacity: 0.55, dashArray: '8,5' }).addTo(map);

        // OSRM en background: reemplaza la línea de fallback sin bloquear el render
        const MAX_WP = 9;
        const wpArray = points.map(p => ({ lat: p.lat, lng: p.lng }));
        setRouteMapStats(null);
        try {
          let allCoords: [number, number][] = [];
          let totalDistM = 0, totalDurS = 0;
          if (wpArray.length <= MAX_WP + 1) {
            const rd = await api.getRoadRoute(wpArray);
            if (rd?.coordinates?.length > 1) {
              allCoords = rd.coordinates;
              totalDistM = rd.distance || 0;
              totalDurS = rd.duration || 0;
            }
          } else {
            // Construir chunks con solapamiento para continuidad de la polilínea
            const chunks: { lat: number; lng: number }[][] = [];
            for (let ci = 0; ci < wpArray.length - 1; ci += MAX_WP) {
              chunks.push(wpArray.slice(ci, ci + MAX_WP + 1));
            }
            // Llamar todos los chunks en paralelo en lugar de secuencial
            const results = await Promise.all(chunks.map(c => api.getRoadRoute(c).catch(() => null)));
            for (const rd of results) {
              if (rd?.coordinates?.length > 1) {
                allCoords = [...allCoords, ...rd.coordinates];
                totalDistM += rd.distance || 0;
                totalDurS += rd.duration || 0;
              } else { allCoords = []; break; }
            }
          }
          if (!cancelled && allCoords.length > 1 && routePreviewMapRef.current) {
            map.removeLayer(fallbackLine);
            const latlngs = allCoords.map(([lng, lat]: [number, number]) => L.latLng(lat, lng));
            L.polyline(latlngs, { color: dotColor, weight: 3.5, opacity: 0.85 }).addTo(map);
            if (totalDistM > 0) {
              setRouteMapStats({ km: Math.round(totalDistM / 100) / 10, minutes: Math.round(totalDurS / 60) });
            }
          }
        } catch { /* conservar línea de fallback */ }
      }
    };

    initMap();
    return () => { cancelled = true; };
  }, [routeMapModal.isOpen, routeMapModal.route]);

  // All-routes map
  useEffect(() => {
    if (!allRoutesMapOpen) {
      if (allRoutesMapRef.current) {
        allRoutesMapRef.current.remove();
        allRoutesMapRef.current = null;
      }
      return;
    }
    const ROUTE_COLORS = ['#6366f1','#f43f5e','#f59e0b','#10b981','#06b6d4','#8b5cf6','#f97316','#22c55e','#3b82f6','#ec4899'];
    const init = async () => {
      let container: HTMLElement | null = null;
      for (let i = 0; i < 20; i++) {
        container = document.getElementById('all-routes-map');
        if (container && container.clientWidth > 0) break;
        await new Promise(r => setTimeout(r, 50));
      }
      if (!container) return;
      if (allRoutesMapRef.current) { allRoutesMapRef.current.remove(); allRoutesMapRef.current = null; }
      const map = L.map(container, { zoomControl: true, preferCanvas: true }).setView([ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng], 11);
      allRoutesMapRef.current = map;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20 }).addTo(map);
      const hubIcon = L.divIcon({ html: `<div style="background:#0f172a;color:#10b981;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;border:2px solid #10b981;box-shadow:0 2px 8px rgba(0,0,0,0.5)">M7</div>`, className: '', iconSize: [32,32], iconAnchor: [16,16] });
      L.marker([ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng], { icon: hubIcon }).addTo(map);
      const allPoints: L.LatLng[] = [];

      // Collect ALL invoices: routed + unrouted, using GPS → city centroid → corridor centroid
      const CORRIDOR_COLORS: Record<string, string> = {
        MED_CENTRO: '#6366f1', NORTE: '#10b981', NORTE_LEJANO: '#059669',
        SUR: '#f43f5e', SUR_LEJANO: '#be123c', ORIENTE_ANT: '#f59e0b', OCCIDENTE_ANT: '#8b5cf6',
      };
      const DEFAULT_LAT = 6.2518, DEFAULT_LNG = -75.5636;

      // All invoices from all routes
      const allInvoicesFlat = suggestedRoutes.flatMap(r => r.assignedInvoices.map(inv => ({ inv, plate: r.vehicle.plate, routeIdx: suggestedRoutes.indexOf(r) })));

      // Group by position key — use lat/lng as assigned by algorithm (includes city centroids)
      const posMap = new Map<string, { lat: number; lng: number; items: { inv: any; plate: string }[]; isApprox: boolean }>();
      allInvoicesFlat.forEach(({ inv, plate }) => {
        let lat = Number(inv.lat || 0), lng = Number(inv.lng || 0);
        const isDefault = Math.abs(lat - DEFAULT_LAT) < 0.002 && Math.abs(lng - DEFAULT_LNG) < 0.002;
        const isZero = lat === 0 || lng === 0;
        // If still at default/zero, use CITY_CENTROIDS fallback via corridor
        if (isDefault || isZero) {
          const corr: string = (inv as any).corridor || 'MED_CENTRO';
          const centroid = (window as any).__ORBIT_CITY_CENTROIDS?.[inv.city?.toUpperCase()] || null;
          if (centroid) { lat = centroid.lat; lng = centroid.lng; }
          else {
            const CORR_FALLBACK: Record<string, [number,number]> = {
              NORTE: [6.337, -75.555], NORTE_LEJANO: [6.38, -75.55],
              SUR: [6.15, -75.61], SUR_LEJANO: [6.09, -75.63],
              ORIENTE_ANT: [6.16, -75.37], OCCIDENTE_ANT: [6.25, -75.72],
              MED_CENTRO: [6.24, -75.573],
            };
            const fb = CORR_FALLBACK[corr] || CORR_FALLBACK.MED_CENTRO;
            lat = fb[0]; lng = fb[1];
          }
        }
        const isApprox = isDefault || isZero;
        const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
        if (!posMap.has(key)) posMap.set(key, { lat, lng, items: [], isApprox });
        posMap.get(key)!.items.push({ inv, plate });
      });

      posMap.forEach(({ lat, lng, items, isApprox }) => {
        allPoints.push(L.latLng(lat, lng));
        const cnt = items.length;
        const corr: string = (items[0].inv as any).corridor || 'MED_CENTRO';
        const color = ROUTE_COLORS[suggestedRoutes.findIndex(r => r.vehicle.plate === items[0].plate) % ROUTE_COLORS.length] || '#94a3b8';
        const corrColor = CORRIDOR_COLORS[corr] || '#94a3b8';
        const border = isApprox ? '2px dashed #f59e0b' : `2px solid ${corrColor}`;
        const badge = cnt > 1 ? `<div style="position:absolute;top:-5px;right:-5px;background:#f43f5e;color:white;width:14px;height:14px;border-radius:50%;font-size:7px;font-weight:900;display:flex;align-items:center;justify-content:center">${cnt}</div>` : '';
        const approxDot = isApprox ? `<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#f59e0b;border-radius:50%"></div>` : '';
        const icon = L.divIcon({ html: `<div style="position:relative"><div style="background:${color};color:white;width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:${border}">${cnt}</div>${badge}${approxDot}</div>`, className: '', iconSize: [20,20], iconAnchor: [10,10] });
        const popLines = items.map(it => `${it.inv.invoiceNumber} · ${it.plate}`).join('<br>');
        L.marker([lat, lng], { icon }).bindPopup(`<b>${corr}${isApprox ? ' ⚠ coord aproximada' : ''}</b><br>${popLines}<br><small>${items[0].inv.address} · ${items[0].inv.city}</small>`).addTo(map);
      });

      // Draw route polylines
      suggestedRoutes.forEach((route, ri) => {
        const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
        const pts: L.LatLng[] = [L.latLng(ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng)];
        route.assignedInvoices.forEach(inv => {
          const lat = Number(inv.lat || 0), lng = Number(inv.lng || 0);
          if (lat !== 0 && lng !== 0 && !(Math.abs(lat - DEFAULT_LAT) < 0.002 && Math.abs(lng - DEFAULT_LNG) < 0.002)) {
            pts.push(L.latLng(lat, lng));
          }
        });
        pts.push(L.latLng(ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng));
        if (pts.length > 2) L.polyline(pts, { color, weight: 2, opacity: 0.6, dashArray: '6 3' }).addTo(map);
      });

      if (allPoints.length > 0) map.fitBounds(L.latLngBounds([L.latLng(ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng), ...allPoints]), { padding: [40, 40] });
    };
    init();
    return () => { if (allRoutesMapRef.current) { allRoutesMapRef.current.remove(); allRoutesMapRef.current = null; } };
  }, [allRoutesMapOpen, suggestedRoutes]);

  // FILTRADO DE FACTURAS APTAS: Real (basado en lo que viene del API de facturas)
  const validInvoices = useMemo(() => {
    // Estados de ítems que indican la factura ya tiene ruta activa — excluir del planificador
    const assignedItemStatuses = new Set(['EST-10', 'EST-11', 'EST-15', 'EST-12', 'EST-13', 'EST-14', 'COMPLETADO', 'FINALIZADO', 'ENTREGADO']);

    const filtered = invoices.filter(inv => {
      // FILTRO 1: Debe pertenecer al cliente seleccionado
      const invClientId = inv.clientId || (inv as any).client_id;
      const clientMatch = selectedClient === 'GLOBAL' || invClientId === selectedClient;
      if (!clientMatch) return false;

      // FILTRO 2: Excluir si los ítems ya están asignados a una ruta activa
      // itemStatus = MAX(item_status) del API → si algún ítem está en EST-10, es EST-10
      const itemSt = String((inv as any).itemStatus || (inv as any).item_status || '').toUpperCase();
      if (itemSt && assignedItemStatuses.has(itemSt)) return false;

      // FILTRO 3: Estado del documento apto para despacho
      const s = String(inv.status || '').toUpperCase();
      const validStatuses = ['EST-03', 'EST-04', 'EST-05', 'EST-08', 'PENDIENTE', 'AUDITADO', 'INVENTARIADO', 'EN CONTEO'];
      return validStatuses.includes(s);
    });

    // Deduplicar por número de factura: el SQL puede retornar la misma factura
    // más de una vez cuando sus ítems pertenecen a documentos distintos.
    // Conservar la primera ocurrencia (la de mayor docLId por MAX en SQL).
    const seen = new Set<string>();
    return filtered.filter(inv => {
      const key = String(inv.invoiceNumber || inv.id || '').trim().toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [invoices, selectedClient]);

  // Facturas que NO están en ninguna ruta sugerida NI en rutas activas ya confirmadas
  const unassignedInvoices = useMemo(() => {
    // 1. IDs asignados en la sesión actual (sugerencias)
    const suggestedIds = new Set(suggestedRoutes.flatMap(r => r.assignedInvoices.map(i => i.id)));
    
    // 2. IDs ya confirmados en la base de datos (rutas activas)
    // Buscamos en invoiceIds e invoice_ids por compatibilidad de aliasing
    const activeConfirmedIds = new Set(activeRoutes.flatMap(r => r.invoiceIds || (r as any).invoice_ids || []));

    return validInvoices.filter(inv =>
      !suggestedIds.has(inv.id) &&
      !activeConfirmedIds.has(inv.id) &&
      !confirmedSessionIds.has(inv.id)
    );
  }, [validInvoices, suggestedRoutes, activeRoutes, confirmedSessionIds]);

  // DESGLOSE DE PENDIENTES POR TIPO DE PLAN (Solicitud Usuario)
  const unassignedCounts = useMemo(() => {
    let planR = 0;
    let planNormal = 0;
    unassignedInvoices.forEach(inv => {
      const doc = documents.find(d => d.id === inv.docLId);
      const pt = String(doc?.planType || '').toUpperCase();
      if (pt.includes('PLAN R') || pt.includes('(R)') || pt === 'R') planR++;
      else planNormal++;
    });
    return { planR, planNormal };
  }, [unassignedInvoices, documents]);
  const unassignedMetrics = useMemo(() => {
    const count = unassignedInvoices.length;
    const volume = Number(unassignedInvoices.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0).toFixed(2));
    const additionalVehicles = Math.ceil(volume / 10);
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
      // En shift 2, vehículos que completaron shift 1 son re-disponibles
      const isShift2Override = currentShift === 2 && shift1CompletedVehicleIds.has(String(v.id));
      if (!isShift2Override && (['EST-10', 'EST-11', 'OCUPADO'].includes(vStatusId) || isBusy)) return null;

      return {
        ...v,
        capacityM3: Number(v.capacityM3 || (v as any).capacity_m3 || 0),
        driverName: d.name,
        driverId: d.id,
        assignmentId: link.id
      };
    }).filter(item => item !== null) as (Vehicle & { driverName: string, driverId: string, assignmentId: string })[];

    return fleet;
  }, [assignments, vehicles, drivers, selectedClient, activeRoutes, currentShift, shift1CompletedVehicleIds]);

  const remainingVehicles = useMemo(() => {
    const usedIds = new Set(suggestedRoutes.map(r => r.vehicle.id));
    return availableVehicles.filter(v => !usedIds.has(v.id));
  }, [availableVehicles, suggestedRoutes]);

  const routeDistancesKm = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of suggestedRoutes) {
      let d = 0;
      const stops = r.assignedInvoices;
      if (stops.length > 0) {
        d += haversineKm(ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng, Number(stops[0].lat) || ORBIT_HUB_ORIGIN.lat, Number(stops[0].lng) || ORBIT_HUB_ORIGIN.lng);
        for (let i = 0; i < stops.length - 1; i++) {
          d += haversineKm(Number(stops[i].lat) || ORBIT_HUB_ORIGIN.lat, Number(stops[i].lng) || ORBIT_HUB_ORIGIN.lng, Number(stops[i+1].lat) || ORBIT_HUB_ORIGIN.lat, Number(stops[i+1].lng) || ORBIT_HUB_ORIGIN.lng);
        }
        d += haversineKm(Number(stops[stops.length-1].lat) || ORBIT_HUB_ORIGIN.lat, Number(stops[stops.length-1].lng) || ORBIT_HUB_ORIGIN.lng, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
      }
      map.set(r.id, Math.round(d));
    }
    return map;
  }, [suggestedRoutes]);

  const routePlanKPIs = useMemo(() => {
    if (suggestedRoutes.length === 0) return null;
    const totalKm = Array.from(routeDistancesKm.values()).reduce((a, b) => a + b, 0);
    const totalMin = suggestedRoutes.reduce((acc, r) => acc + estimateRouteTotalMinutes(r.assignedInvoices, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng), 0);
    const totalInvoices = suggestedRoutes.reduce((acc, r) => acc + r.assignedInvoices.length, 0);
    const avgUtil = suggestedRoutes.length > 0
      ? Math.round(suggestedRoutes.reduce((acc, r) => acc + (r.utilization || 0), 0) / suggestedRoutes.length)
      : 0;
    const h = Math.floor(totalMin / 60);
    const m = Math.round(totalMin % 60);
    return { totalKm, totalMin, totalInvoices, avgUtil, routes: suggestedRoutes.length, timeLabel: h > 0 ? `${h}h ${m}m` : `${m}m` };
  }, [suggestedRoutes, routeDistancesKm]);

  const preflightWarning = useMemo(() => {
    if (validInvoices.length === 0 || availableVehicles.length === 0) return null;
    const totalDemand = validInvoices.reduce((acc, inv) => acc + (Number(inv.volumeM3) || 0), 0);
    const totalFleetCapacity = availableVehicles.reduce((acc, v) => acc + (Number(v.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY), 0);
    const usableCapacity = totalFleetCapacity * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION;
    if (totalDemand <= usableCapacity) return null;
    const gap = Number((totalDemand - usableCapacity).toFixed(2));
    const extraVehicles = Math.ceil(gap / OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY);
    return { totalDemand: Number(totalDemand.toFixed(2)), usableCapacity: Number(usableCapacity.toFixed(2)), gap, extraVehicles };
  }, [validInvoices, availableVehicles]);

  // Carga inicial de patrones de aprendizaje
  useEffect(() => {
    api.getRoutingPatterns().then(data => {
      if (Array.isArray(data)) setLearningPatterns(data);
    }).catch(err => { if (import.meta.env.DEV) console.error('[M7-IA-PATTERNS]', err); });

    api.getDeliveryPatterns().then((data: any) => {
      if (Array.isArray(data)) setDeliveryPatterns(data);
    }).catch(err => { if (import.meta.env.DEV) console.error('[M7-DELIVERY-PATTERNS]', err); });

    // Horarios de entrega por día de semana — se cargan una vez y se aplican durante optimización
    if (selectedClient) {
      api.getDeliverySchedules(selectedClient).then((data: any) => {
        if (Array.isArray(data)) setDeliverySchedules(data);
      }).catch(() => {});
    }
  }, [onRefresh, selectedClient]);




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

  /**
   * Geocodifica en batch las facturas que tienen coordenadas default (sin geocodificar).
   * Respeta el rate-limit de Nominatim (1 req/s) y actualiza in-place.
   * Máximo GEOCODE_BATCH_LIMIT facturas para no bloquear la UI.
   */
  const GEOCODE_BATCH_LIMIT = 40;
  const enrichInvoicesWithGeocode = async (invoices: Invoice[]): Promise<Invoice[]> => {
    const DEFAULT_LAT = 6.2518, DEFAULT_LNG = -75.5636;
    const needsGeocode = invoices.filter(inv => {
      const lat = Number(inv.lat || 0), lng = Number(inv.lng || 0);
      return (lat === 0 && lng === 0) ||
        (Math.abs(lat - DEFAULT_LAT) < 0.001 && Math.abs(lng - DEFAULT_LNG) < 0.001);
    }).slice(0, GEOCODE_BATCH_LIMIT);

    if (needsGeocode.length === 0) return invoices;

    const geocoded = new Map<string, { lat: number; lng: number }>();

    for (const inv of needsGeocode) {
      const address   = String(inv.address || '').trim();
      const city      = String(inv.city || '').trim();
      const notes     = String(inv.notes || '').trim();
      const barrio    = String((inv as any).neighborhood || '').trim();

      // Extraer dirección de las notas cuando el campo address está vacío
      // p.ej. "Entregar en CL 80 #50-23 Laureles" → "CL 80 #50-23 Laureles"
      const notesAddr = !address
        ? (notes.match(/(?:CL|CR|CRA|CARRERA|CALLE|AV|AVENIDA|DG|DIAGONAL|TR|TRANSVERSAL)\s*[\d#.\-\/\w\s,]+/i)?.[0]?.trim() ?? '')
        : '';

      // Construir queries en orden de precisión decreciente
      const bestAddress = address || notesAddr;
      const queries: [string, string][] = []; // [address, city] para la API

      if (bestAddress && city)  queries.push([bestAddress, city]);
      if (bestAddress && !city) queries.push([bestAddress, '']);
      if (!bestAddress && barrio && city) queries.push([barrio, city]);
      if (!bestAddress && barrio && !city) queries.push([barrio, '']);
      if (!bestAddress && !barrio && city) queries.push([city, '']);

      if (queries.length === 0) continue;

      try {
        for (const [qAddr, qCity] of queries) {
          const geo = await api.geocodeAddress({ address: qAddr, city: qCity });
          if (geo?.lat && geo?.lng && !geo.fallback) {
            geocoded.set(inv.id, { lat: geo.lat, lng: geo.lng });
            break;
          }
        }
      } catch { /* ignorar errores individuales */ }
    }

    setGeocodedCount(geocoded.size);
    if (geocoded.size === 0) return invoices;

    return invoices.map(inv => {
      const coords = geocoded.get(inv.id);
      if (coords) return { ...inv, lat: coords.lat, lng: coords.lng };
      return inv;
    });
  };

  const runOrbitOptimization = (specificInvoices?: Invoice[]) => {
    setIsOptimizing(true);
    setOptimizingProgress(0); setOptimizingPhase('Preparando facturas...');
    setSuggestedRoutes([]);
    setGeocodedCount(0);
    if (!specificInvoices) setLastReadjustmentResult(null);
    setReadjustmentModal({ isOpen: false, selectedDocIds: new Set() });

    setTimeout(async () => {
      const suggestions: SuggestedRoute[] = [];
      const usedVehicleIds = new Set<string>(); // MOVIMIENTO DE DECLARACIÓN AQUÍ

      // 1. Preparación de Facturas (Copias)
      // Excluir facturas que ya tienen ruta activa confirmada o confirmadas en esta sesión
      const _activeRouteIds = new Set<string>(activeRoutes.flatMap(r => r.invoiceIds || (r as any).invoice_ids || []));
      const baseInvoicePool = specificInvoices
        ? specificInvoices
        : validInvoices.filter(inv => !_activeRouteIds.has(inv.id) && !confirmedSessionIds.has(inv.id));
      // Deduplicar el pool de entrada por número de factura.
      // El SQL puede retornar la misma factura N veces si sus ítems están
      // en documentos distintos o si algún JOIN expande filas antes del GROUP BY.
      const _poolSeen = new Set<string>();
      let availableInvoices = baseInvoicePool
        .filter(inv => {
          if (!inv || typeof inv !== 'object') return false;
          const k = String(inv.invoiceNumber || inv.id || '').trim().toUpperCase();
          if (!k || _poolSeen.has(k)) return false;
          _poolSeen.add(k);
          return true;
        })
        .map(inv => ({ ...inv }));

      // ── FASE 0: Coordenadas históricas de clientes recurrentes ─────────────
      // Antes de geocodificar vía API, cargamos las últimas coords conocidas
      // de document_items para cada cliente+ciudad. Esto resuelve el 90%+ de
      // los casos (clientes recurrentes) sin consumir cuota de geocodificación
      // y garantiza que Bello, Rionegro, Copacabana, etc. no caigan en el
      // mismo nogeo_NORTE_* que Medellín norte.
      setOptimizingProgress(3); setOptimizingPhase('Cargando ubicaciones históricas...');
      try {
        const invoicesNeedingCoords = availableInvoices.filter(inv => {
          const lat = Number(inv.lat || 0), lng = Number(inv.lng || 0);
          return (lat === 0 && lng === 0) || hasDefaultCoords(lat, lng);
        });
        if (invoicesNeedingCoords.length > 0) {
          const clientIdForQuery = selectedClient !== 'GLOBAL' ? selectedClient : undefined;
          const payload = invoicesNeedingCoords.map(inv => ({
            invoiceId: inv.id,
            customerName: String((inv as any).customerName || (inv as any).customer_name || '').trim(),
            city: String(inv.city || '').trim(),
          })).filter(p => p.customerName.length > 0);

          if (payload.length > 0) {
            const result = await api.resolveCustomerCoords({ invoices: payload, clientId: clientIdForQuery });
            if (result?.coords && typeof result.coords === 'object') {
              availableInvoices = availableInvoices.map(inv => {
                const hist = (result.coords as Record<string, { lat: number; lng: number }>)[inv.id];
                if (hist && hist.lat && hist.lng) {
                  return { ...inv, lat: hist.lat, lng: hist.lng };
                }
                return inv;
              });
              if (result.resolved > 0) {
                setOptimizingPhase(`${result.resolved}/${result.total} clientes con coords históricas`);
              }
            }
          }
        }
      } catch {
        // Fallo silencioso: continuar con geocodificación normal
      }
      // ──────────────────────────────────────────────────────────────────────

      // --- FASE PREVIA M7 IQ: ALMACENES DE CADENA (MEJORA 6: clustering espacial) ---
      setOptimizingProgress(5); setOptimizingPhase('Analizando cadenas comerciales...');
      const retailGroups: { [key: string]: Invoice[] } = {};
      RETAIL_CHAIN_KEYWORDS.forEach(chain => {
        const matches = availableInvoices.filter(inv =>
          (String(inv.customerName || '')).toUpperCase().includes(chain)
        );
        if (matches.length > 0) retailGroups[chain] = matches;
      });

      Object.entries(retailGroups).forEach(([chain, chainInvoices]) => {
        const totalChainVol = chainInvoices.reduce((acc, inv) => acc + Number(inv.volumeM3 || (inv as any).volume_m3 || 0), 0);

        if (totalChainVol >= RETAIL_CHAIN_MIN_VOLUME_M3 && availableVehicles.length > 0) {
          // MEJORA 6: Agrupar por proximidad antes de asignar vehículos
          const clusters = clusterByProximity(chainInvoices, 8);

          clusters.forEach((cluster, clusterIdx) => {
            const clusterVol = cluster.reduce((acc, inv) => acc + Number(inv.volumeM3 || (inv as any).volume_m3 || 0), 0);
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

        // ── Horarios estructurados por día de semana ────────────────────────────
        // Si la factura no tiene ventana de notas, buscar en delivery_schedules
        // usando customer_key = customer_name|city (normalizado lowercase).
        if (!(inv as any).timeWindowMinutes && deliverySchedules.length > 0) {
          const dow = new Date().getDay(); // 0=Dom..6=Sáb
          const custName = String((inv as any).customer_name || (inv as any).customerName || '').toLowerCase().trim();
          const custCity = String(inv.city || '').toLowerCase().trim();
          const custKey = `${custName}|${custCity}`;
          const sched = deliverySchedules.find(s => s.customer_key === custKey && s.day_of_week === dow);
          if (sched) {
            const [hh, mm] = sched.close_time.split(':').map(Number);
            // @ts-ignore
            inv.timeWindowMinutes = hh * 60 + mm;
            // @ts-ignore
            inv.isPriority = true; // cliente con horario definido = entrega prioritaria
          }
        }

        // Normalizar ciudad: convierte códigos DANE, abreviaciones y variantes al nombre canónico
        const normalizedCity = normalizeCityName(String(inv.city || 'SIN_CIUDAD'));
        if (normalizedCity !== (inv.city || '').trim().toUpperCase()) {
          (inv as any).city = normalizedCity; // actualizar para display en UI y geocodificación
        }
        // @ts-ignore
        inv.cityKey = normalizedCity;

        const rawAddr = (String(inv.address || '')).toUpperCase();
        // @ts-ignore
        inv.startAddressForSort = rawAddr.replace(/\d+/g, num => num.padStart(5, '0')).replace(/[^0-9A-Z]/g, '');
        // @ts-ignore
        inv.neighborhoodKey = (String(inv.neighborhood || '')).toUpperCase().trim() || 'SIN_BARRIO';

        // MEJORA 2: Detectar coordenadas default (sin geocodificar)
        const lat = Number(inv.lat || 0);
        const lng = Number(inv.lng || 0);
        // @ts-ignore
        inv.hasDefaultCoords = (lat === 0 && lng === 0) || hasDefaultCoords(lat, lng);

        // Clasificar corredor vial (nueva lógica jerárquica)
        const cUpper = (inv as any).cityKey || '';

        // Enriquecimiento de barrio desde dirección cuando no hay datos.
        // Aplica para Medellín y cualquier ciudad con centroide de barrio registrado.
        const hubIsMedellin = Math.abs(ORBIT_HUB_ORIGIN.lat - 6.24) < 0.18
          && Math.abs(ORBIT_HUB_ORIGIN.lng - (-75.58)) < 0.12;

        // 1. Intentar extraer barrio del campo address si neighborhoodKey está vacío.
        //    Muchas facturas traen "CL 80 #50-23, Laureles" o "CR 48 #100, El Poblado".
        if ((inv as any).neighborhoodKey === 'SIN_BARRIO' || !(inv as any).neighborhoodKey) {
          // Buscar después de la última coma en la dirección
          const afterComma = rawAddr.includes(',')
            ? rawAddr.split(',').pop()!.trim()
            : '';
          // Escanear tokens de la dirección contra lista de barrios conocidos
          const allTokens = (rawAddr + ' ' + afterComma).toUpperCase();
          const foundOcc = BARRIOS_OCCIDENTE.find(b => allTokens.includes(b));
          const foundOri = BARRIOS_ORIENTE.find(b => allTokens.includes(b));
          if (foundOcc) (inv as any).neighborhoodKey = foundOcc;
          else if (foundOri) (inv as any).neighborhoodKey = foundOri;
          else if (afterComma.length > 2) (inv as any).neighborhoodKey = afterComma;
        }

        // 2. Sin coords reales → asignar centroide de barrio si existe
        if ((inv as any).hasDefaultCoords || (lat === 0 && lng === 0)) {
          const nk = (inv as any).neighborhoodKey || '';
          const centroid = getBarrioCentroid(nk);
          if (centroid) {
            (inv as any).lat = centroid.lat;
            (inv as any).lng = centroid.lng;
            (inv as any).hasDefaultCoords = false;
          } else if (hubIsMedellin && cUpper.includes('MEDELL')) {
            // Fallback Medellín: inferir lado por keywords de dirección
            const side = inferMedellínSide(rawAddr + ' ' + nk);
            if (side === 'OCCIDENTE') { (inv as any).lat = 6.248; (inv as any).lng = -75.598; }
            else if (side === 'ORIENTE') { (inv as any).lat = 6.252; (inv as any).lng = -75.558; }
            (inv as any).zoneInferred = true;
          } else {
            // Fallback: centroide del municipio para ciudades fuera de Medellín
            // (Bello, Rionegro, Copacabana, Envigado, Itagüí, etc.)
            const cityCentroid = CITY_CENTROIDS[cUpper] || CITY_CENTROIDS[cUpper.replace(/[ÁÉÍÓÚÑ]/g, c =>
              ({ Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N' } as any)[c] || c)];
            if (cityCentroid) {
              (inv as any).lat = cityCentroid.lat;
              (inv as any).lng = cityCentroid.lng;
              (inv as any).hasDefaultCoords = false;
              (inv as any).zoneInferred = true; // marcar como inferido para evitar sobreescribir coords reales
            }
          }
        }

        // Asignar corredor usando lat/lng definitivos
        const finalLat = Number((inv as any).lat || 0);
        const finalLng = Number((inv as any).lng || 0);
        (inv as any).corridor = classifyCorridor(finalLat, finalLng, cUpper) as ViaCorridor;
      });

      // 3. Ordenamiento Global — prioridad → ventana horaria → CORREDOR → ciudad → barrio
      availableInvoices.sort((a, b) => {
        // @ts-ignore
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        const aTime = (a as any).timeWindowMinutes ?? Infinity;
        const bTime = (b as any).timeWindowMinutes ?? Infinity;
        if (aTime !== bTime) return aTime - bTime;
        const cA = CORRIDOR_ORDER.indexOf((a as any).corridor || 'MED_CENTRO');
        const cB = CORRIDOR_ORDER.indexOf((b as any).corridor || 'MED_CENTRO');
        if (cA !== cB) return cA - cB;
        // @ts-ignore
        if (a.cityKey !== b.cityKey) return (a.cityKey || '').localeCompare(b.cityKey || '');
        // @ts-ignore
        if (a.neighborhoodKey !== b.neighborhoodKey) return (a.neighborhoodKey || '').localeCompare(b.neighborhoodKey || '');
        if (Number(a.lat) !== Number(b.lat)) return Number(a.lat) - Number(b.lat);
        return Number(a.lng) - Number(b.lng);
      });

      // ── PRE-PASO: Agrupación por dirección/cliente ────────────────────────
      setOptimizingProgress(12); setOptimizingPhase('Agrupando por dirección y cliente...');
      {
        const addrGroups = new Map<string, Invoice[]>();
        availableInvoices.forEach(inv => {
          const aKey = (
            (inv.address || '').toUpperCase().trim().replace(/\s+/g, ' ') +
            '|' + ((inv as any).cityKey || '')
          );
          (inv as any).addressGroupKey = aKey;
          if (!addrGroups.has(aKey)) addrGroups.set(aKey, []);
          addrGroups.get(aKey)!.push(inv);
        });

        // Propagar coords y corredor desde la mejor factura del grupo
        addrGroups.forEach(group => {
          if (group.length < 2) return;
          const withCoords = group.find(i => Number(i.lat) > 0 && !(i as any).hasDefaultCoords);
          if (!withCoords) return;
          group.forEach(inv => {
            if ((inv as any).hasDefaultCoords || Number(inv.lat) === 0) {
              (inv as any).lat = withCoords.lat;
              (inv as any).lng = withCoords.lng;
              (inv as any).hasDefaultCoords = false;
              (inv as any).corridor = (withCoords as any).corridor;
            }
          });
        });
      }
      // ──────────────────────────────────────────────────────────────────────

      // ── ALGORITMO CLUSTER-FIRST ────────────────────────────────────────────
      // 1. Agrupar todas las facturas en celdas de ~2.4km (0.022° × 0.022°)
      // 2. Para cada vehículo: anclar en la celda más densa, llenar con celdas
      //    cercanas hasta agotar capacidad. Overflow → siguiente vehículo.
      // ──────────────────────────────────────────────────────────────────────

      const CELL_SIZE_DEFAULT = 0.014; // fallback global ~1.5km
      // Adaptive CELL_SIZE: analyze per-corridor density and tune cell granularity
      // Dense urban (>3 inv/km²) → 0.006° (~670m); normal urban → 0.010°; default → 0.014°; sparse rural → 0.022°
      const corridorInvMap = new Map<ViaCorridor, { lats: number[]; lngs: number[] }>();
      availableInvoices.forEach(inv => {
        const lat = Number(inv.lat || 0);
        const lng = Number(inv.lng || 0);
        if (lat === 0 || lng === 0 || (inv as any).hasDefaultCoords) return;
        const corr: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';
        if (!corridorInvMap.has(corr)) corridorInvMap.set(corr, { lats: [], lngs: [] });
        corridorInvMap.get(corr)!.lats.push(lat);
        corridorInvMap.get(corr)!.lngs.push(lng);
      });
      const corridorCellSize = new Map<ViaCorridor, number>();
      corridorInvMap.forEach(({ lats, lngs }, corr) => {
        if (lats.length < 3) { corridorCellSize.set(corr, CELL_SIZE_DEFAULT); return; }
        const latSpan = Math.max(...lats) - Math.min(...lats);
        const lngSpan = Math.max(...lngs) - Math.min(...lngs);
        const areaKm2 = Math.max((latSpan * 111) * (lngSpan * 111 * Math.cos((lats.reduce((a,b)=>a+b,0)/lats.length)*Math.PI/180)), 1);
        const density = lats.length / areaKm2;
        let cs = CELL_SIZE_DEFAULT;
        if (density > 3) cs = 0.006;
        else if (density > 1.5) cs = 0.010;
        else if (density < 0.3) cs = 0.022;
        corridorCellSize.set(corr, cs);
      });
      // Tag each invoice with its corridor's adaptive cell size
      availableInvoices.forEach(inv => {
        const corr: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';
        (inv as any).adaptiveCellSize = corridorCellSize.get(corr) ?? CELL_SIZE_DEFAULT;
      });

      const SPREAD_KM_BY_CORRIDOR: Partial<Record<ViaCorridor, number>> = {
        NORTE: 9, NORTE_LEJANO: 13,
        SUR: 9, SUR_LEJANO: 13,
        ORIENTE_ANT: 18, OCCIDENTE_ANT: 18,
      };
      const getMaxSpread = (corridor: ViaCorridor) => SPREAD_KM_BY_CORRIDOR[corridor] ?? 6;
      const MIN_ANCHOR_SEPARATION_KM = 8;

      interface GeoCell {
        key: string;
        zone: string;
        centerLat: number;
        centerLng: number;
        invoices: Invoice[];
        totalVolume: number;
      }

      // Construir mapa de celdas usando corredor como clave de fallback
      const cellMap = new Map<string, GeoCell>();
      availableInvoices.forEach(inv => {
        const invVol = Number(inv.volumeM3 || (inv as any).volume_m3 || 0);
        const lat = Number(inv.lat || 0);
        const lng = Number(inv.lng || 0);
        const hasDefCoords = (inv as any).hasDefaultCoords;
        const corridor: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';

        // Sin coords → celda por corredor+ciudad+barrio para no mezclar municipios distintos sin geocodificar
        const cs = (inv as any).adaptiveCellSize || CELL_SIZE_DEFAULT;
        const cellKey = hasDefCoords || (lat === 0 && lng === 0)
          ? `nogeo_${corridor}_${(inv as any).cityKey || 'SIN_CIUDAD'}_${(inv as any).neighborhoodKey || 'SIN_BARRIO'}`
          : `${Math.floor(lat / cs)}_${Math.floor(lng / cs)}`;

        if (!cellMap.has(cellKey)) {
          cellMap.set(cellKey, {
            key: cellKey,
            zone: corridor, // reutilizamos el campo zone con el corredor
            centerLat: hasDefCoords ? 0 : lat,
            centerLng: hasDefCoords ? 0 : lng,
            invoices: [],
            totalVolume: 0,
          });
        }
        const cell = cellMap.get(cellKey)!;
        cell.invoices.push(inv);
        cell.totalVolume += invVol;

        // Recalcular centroide de la celda
        const validInCell = cell.invoices.filter(i => Number(i.lat) > 0 && !(i as any).hasDefaultCoords);
        if (validInCell.length > 0) {
          cell.centerLat = validInCell.reduce((s, i) => s + Number(i.lat), 0) / validInCell.length;
          cell.centerLng = validInCell.reduce((s, i) => s + Number(i.lng), 0) / validInCell.length;
        }
      });

      // Ordenar celdas por CORRIDOR_ORDER (norte → sur → oriente), luego densidad desc
      let remainingCells = Array.from(cellMap.values()).sort((a, b) => {
        const zA = CORRIDOR_ORDER.indexOf(a.zone as ViaCorridor);
        const zB = CORRIDOR_ORDER.indexOf(b.zone as ViaCorridor);
        if (zA !== zB) return zA - zB;
        return b.invoices.length - a.invoices.length;
      });

      const prioritizedFleet = [...availableVehicles]
        .filter(v => !usedVehicleIds.has(v.id))
        .sort((a, b) => (Number(b.capacityM3) || 0) - (Number(a.capacityM3) || 0));

      // ── Análisis de volumen por corredor — corredores con pocas facturas se marcan
      // como "esparsos" y sus facturas se etiquetan como flexibles para que en el
      // sweep final puedan ser absorbidas por la ruta más cercana sin restricción
      // de corredor (solo distancia ≤ MAX_SPARSE_ABSORB_KM).
      const MIN_CORRIDOR_INVOICES = 4; // menos de 4 facturas = corredor esparso
      const MAX_SPARSE_ABSORB_KM  = 12; // radio máximo para absorber factura esparsa
      const corridorInvoiceCount = new Map<string, number>();
      availableInvoices.forEach(inv => {
        const c: string = (inv as any).corridor || 'MED_CENTRO';
        corridorInvoiceCount.set(c, (corridorInvoiceCount.get(c) || 0) + 1);
      });
      availableInvoices.forEach(inv => {
        const c: string = (inv as any).corridor || 'MED_CENTRO';
        (inv as any).sparseCorridor = (corridorInvoiceCount.get(c) || 0) < MIN_CORRIDOR_INVOICES;
      });

      // Registra las coordenadas del ancla de cada vehículo para evitar solapamiento
      const usedAnchors: { lat: number; lng: number }[] = [];

      // ── ZONA PRE-ASIGNACIÓN ────────────────────────────────────────────────
      // Fase 1: Agregar fuerza total por vehículo y determinar qué ciudades/zonas
      // ha operado más frecuentemente. Vehículos con más experiencia en una zona
      // la "reclaman" primero en competencia greedy. Así cada vehículo arranca
      // en su área histórica determinista en vez de solo usar un hint débil.
      // ──────────────────────────────────────────────────────────────────────

      // Mapa: vehicle_id → Map<"CIUDAD|BARRIO", strength>
      // ── FASE 0: Pre-asignación por cliente recurrente (delivery_patterns) ────
      setOptimizingProgress(20); setOptimizingPhase('Aplicando patrones de entrega...');
      // Facturas cuya dirección exacta tiene un patrón fuerte (≥3) se anclan al
      // vehículo que históricamente las entrega, sacándolas del pool general.
      if (deliveryPatterns.length > 0) {
        // Construir mapa addressKey → vehicleId (el patrón más fuerte gana)
        const addrToVehicle = new Map<string, string>();
        const addrStrength = new Map<string, number>();
        for (const dp of deliveryPatterns) {
          if ((dp.strength || 0) < 1.5) continue; // patrones desde 2da visita
          const existing = addrStrength.get(dp.address_key) || 0;
          if ((dp.strength || 0) > existing) {
            addrToVehicle.set(dp.address_key, dp.vehicle_id);
            addrStrength.set(dp.address_key, dp.strength);
          }
        }

        if (addrToVehicle.size > 0) {
          // Agrupar facturas pre-asignadas por vehículo
          const preAssigned = new Map<string, Invoice[]>();
          const preAssignedIds = new Set<string>();

          availableInvoices.forEach(inv => {
            const addrKey = (
              (inv.address || '').trim().toLowerCase() + '|' + ((inv as any).cityKey || '').toLowerCase()
            );
            const vehicleId = addrToVehicle.get(addrKey);
            if (!vehicleId) return;
            const vehicle = prioritizedFleet.find(v => v.id === vehicleId);
            if (!vehicle) return;
            if (!preAssigned.has(vehicleId)) preAssigned.set(vehicleId, []);
            preAssigned.get(vehicleId)!.push(inv);
            preAssignedIds.add(inv.id);
          });

          // Para cada vehículo con facturas pre-asignadas, crear ruta si supera umbral mínimo
          preAssigned.forEach((invoices, vehicleId) => {
            const vehicle = prioritizedFleet.find(v => v.id === vehicleId);
            if (!vehicle || usedVehicleIds.has(vehicleId)) return;

            const cap = Number(vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
            const totalVol = invoices.reduce((s, i) => s + (Number(i.volumeM3) || 0), 0);
            if (totalVol > cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) return; // no caben

            const cityCounts: Record<string, number> = {};
            invoices.forEach(inv => {
              const c = (inv as any).cityKey || 'SIN_CIUDAD';
              cityCounts[c] = (cityCounts[c] || 0) + 1;
            });
            const dominantCity = Object.keys(cityCounts).reduce((a, b) => cityCounts[a] > cityCounts[b] ? a : b, 'LOGÍSTICA');

            const optimizedLoad = invoices.length >= 4
              ? twoOptImprove(invoices, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[]
              : invoices;

            suggestions.push({
              id: `route-dp-${Date.now()}-${vehicle.plate}`,
              vehicle,
              assignedInvoices: optimizedLoad,
              totalVolume: Number(totalVol.toFixed(4)),
              utilization: Math.round((totalVol / cap) * 100),
              city: dominantCity,
            });
            usedVehicleIds.add(vehicleId);
          });

          // Quitar del pool las que fueron pre-asignadas exitosamente
          const confirmedPreAssignedIds = new Set(
            suggestions.filter(r => r.id.startsWith('route-dp-')).flatMap(r => r.assignedInvoices.map(i => i.id))
          );
          availableInvoices = availableInvoices.filter(i => !confirmedPreAssignedIds.has(i.id));
        }
      }
      // ──────────────────────────────────────────────────────────────────────────

      // ── Territorio aprendido con decaimiento por recencia ────────────────────
      setOptimizingProgress(30); setOptimizingPhase('Calculando territorios optimizados...');
      // effectiveStrength = strength * decay(lastUsed)
      // decay: 1.0 (usado hoy) → 0.2 (mínimo, +180 días sin uso)
      const MS_PER_DAY = 86_400_000;
      const DECAY_HALF_LIFE_MS = 90 * MS_PER_DAY; // 50% a los 90 días
      const FLOOR_DECAY = 0.2;
      const now = Date.now();
      const computeEffectiveStrength = (p: RoutingPattern): number => {
        const raw = p.strength || 0;
        if (!p.last_used) return raw * FLOOR_DECAY;
        const msElapsed = now - new Date(p.last_used).getTime();
        const decay = Math.max(FLOOR_DECAY, 1 - msElapsed / (DECAY_HALF_LIFE_MS * 2));
        return raw * decay;
      };

      const vehicleTerritoryStrength = new Map<string, Map<string, number>>();
      for (const p of learningPatterns) {
        if (!p.vehicle_id || !p.city) continue;
        if (!vehicleTerritoryStrength.has(p.vehicle_id)) vehicleTerritoryStrength.set(p.vehicle_id, new Map());
        const tMap = vehicleTerritoryStrength.get(p.vehicle_id)!;
        const tKey = p.neighborhood ? `${p.city}|${p.neighborhood}` : p.city;
        tMap.set(tKey, (tMap.get(tKey) || 0) + computeEffectiveStrength(p));
      }

      // Fuerza máxima en todo el sistema — sirve de referencia para escalar el bonus
      let maxSystemStrength = 1;
      for (const tMap of vehicleTerritoryStrength.values()) {
        for (const v of tMap.values()) {
          if (v > maxSystemStrength) maxSystemStrength = v;
        }
      }

      // Ordenar vehículos por fuerza total efectiva desc (más experimentados reclaman primero)
      const vehiclesByExperience = [...prioritizedFleet].sort((a, b) => {
        const totalA = [...(vehicleTerritoryStrength.get(a.id)?.values() || [])].reduce((s, v) => s + v, 0);
        const totalB = [...(vehicleTerritoryStrength.get(b.id)?.values() || [])].reduce((s, v) => s + v, 0);
        return totalB - totalA;
      });

      // Competencia greedy: cada vehículo reclama sus top territorios (ciudad+barrio) no reclamados
      const claimedTerritories = new Map<string, string>(); // territoryKey → vehicle_id
      const vehicleOwnedNeighborhoods = new Map<string, Set<string>>(); // vehicle_id → Set<neighborhoodKey>

      for (const vehicle of vehiclesByExperience) {
        const tMap = vehicleTerritoryStrength.get(vehicle.id);
        if (!tMap) continue;
        const sortedTerritories = [...tMap.entries()].sort((a, b) => b[1] - a[1]);
        for (const [tKey] of sortedTerritories) {
          if (!claimedTerritories.has(tKey)) {
            claimedTerritories.set(tKey, vehicle.id);
            if (!vehicleOwnedNeighborhoods.has(vehicle.id)) vehicleOwnedNeighborhoods.set(vehicle.id, new Set());
            // Guardar solo la parte del barrio (o ciudad si no hay barrio) para match con invoices
            const parts = tKey.split('|');
            vehicleOwnedNeighborhoods.get(vehicle.id)!.add(parts[1] || parts[0]);
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      // ── OSRM pre-fetch: distancias reales para centroides de celdas ──────────
      // Antes de construir rutas, pedimos una matriz NxN de centroides vía OSRM.
      // Así el nearest-neighbor greedy elige celdas por km reales de carretera,
      // no por distancia en línea recta. Fallback silencioso a Haversine.
      setOptimizingProgress(38); setOptimizingPhase('Pre-cargando distancias reales (OSRM)...');
      let cellRoadDistFn: (lat1: number, lng1: number, lat2: number, lng2: number) => number = getDistance;
      {
        const validCentroids = remainingCells
          .filter(c => c.centerLat > 0 && c.centerLng > 0)
          .map(c => ({ lat: c.centerLat, lng: c.centerLng }));
        // Hub como punto 0; backend limita a 30 coords en total
        const matrixPoints = [
          { lat: ORBIT_HUB_ORIGIN.lat, lng: ORBIT_HUB_ORIGIN.lng },
          ...validCentroids.slice(0, 29),
        ];
        if (matrixPoints.length >= 2) {
          try {
            const mr = await api.getRoadMatrix(matrixPoints);
            if (mr?.distMatrix) {
              cellRoadDistFn = buildRoadDistFn(matrixPoints, mr.distMatrix);
            }
          } catch { /* sin OSRM — usa Haversine */ }
        }
      }

      setOptimizingProgress(40); setOptimizingPhase('Ejecutando algoritmo cluster-first...');

      prioritizedFleet.forEach(vehicle => {
        if (remainingCells.every(c => c.invoices.length === 0)) return;
        if (usedVehicleIds.has(vehicle.id)) return;

        const vCap = Number(vehicle.capacityM3 || (vehicle as any).capacity_m3) || 0;
        const nominalCapacity = vCap > 0 ? vCap : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
        const absoluteMaxCapacity = nominalCapacity * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION;
        const isLargeVehicle = nominalCapacity > LARGE_VEHICLE_THRESHOLD_M3;
        // Restricción de peso: undefined = sin límite (vehículos sin dato configurado)
        const maxWeightKg = Number(vehicle.maxWeightKg || (vehicle as any).max_weight_kg || 0) || undefined;

        // Territorios propios: barrios históricos de este vehículo
        const ownedNeighborhoods = vehicleOwnedNeighborhoods.get(vehicle.id) || new Set<string>();
        // Compatibilidad con código de candidatos que usa ownedCities (ahora = barrios propios)
        const ownedCities = ownedNeighborhoods;

        // Helper: verificar que una celda está suficientemente lejos de anclas ya usadas
        const isFarEnoughFromUsedAnchors = (c: GeoCell): boolean => {
          if (c.centerLat === 0 || usedAnchors.length === 0) return true;
          return usedAnchors.every(a =>
            a.lat === 0 || cellRoadDistFn(c.centerLat, c.centerLng, a.lat, a.lng) >= MIN_ANCHOR_SEPARATION_KM
          );
        };

        // Encontrar celda ancla: ciudades propias + separada de anclas existentes
        // Si no hay celda que cumpla separación, se relaja y toma la más lejana disponible
        const candidateAnchors = remainingCells.filter(c => c.invoices.length > 0);
        const ownedAndFar = candidateAnchors.find(c =>
          c.invoices.some(i => ownedCities.has((i as any).neighborhoodKey || (i as any).cityKey || '')) && isFarEnoughFromUsedAnchors(c)
        );
        const anyFar = candidateAnchors.find(c => isFarEnoughFromUsedAnchors(c));
        // Fallback: celda más lejana de todas las anclas usadas
        const farthestFallback = candidateAnchors.length > 0
          ? candidateAnchors.reduce((best, c) => {
              if (usedAnchors.length === 0 || c.centerLat === 0) return best;
              const dMin = Math.min(...usedAnchors.map(a => a.lat === 0 ? 999 : cellRoadDistFn(c.centerLat, c.centerLng, a.lat, a.lng)));
              const bestDMin = Math.min(...usedAnchors.map(a => a.lat === 0 ? 999 : cellRoadDistFn(best.centerLat, best.centerLng, a.lat, a.lng)));
              return dMin > bestDMin ? c : best;
            }, candidateAnchors[0])
          : null;

        const anchorCell = ownedAndFar || anyFar || farthestFallback || candidateAnchors[0];
        if (!anchorCell) return;

        // Registrar esta ancla para que vehículos siguientes respeten la separación
        if (anchorCell.centerLat > 0) usedAnchors.push({ lat: anchorCell.centerLat, lng: anchorCell.centerLng });

        // Corredor del ancla — es la restricción dura de compatibilidad
        const anchorCorridor = anchorCell.zone as ViaCorridor;
        // Radio dinámico según corredor: autopistas lineales tienen spread más amplio
        const maxSpreadKm = getMaxSpread(anchorCorridor);

        // Fuerza máxima de este vehículo → escala el bonus de distancia (hasta 22 km)
        // Aumentado de 10 a 22 para que el aprendizaje histórico tenga peso real
        // y no sea solo un desempate frente a la distancia pura.
        const vTMap = vehicleTerritoryStrength.get(vehicle.id);
        const vehicleMaxStrength = vTMap ? Math.max(0, ...vTMap.values()) : 0;
        const MAX_OWNED_BONUS_KM = 22;
        const ownedBonus = (vehicleMaxStrength / maxSystemStrength) * MAX_OWNED_BONUS_KM;
        // Umbral para radio expandido: conductor con experiencia sólida (+5 ef. strength)
        const STRONG_TERRITORY_THRESHOLD = 5;
        const canExpandRadius = vehicleMaxStrength >= STRONG_TERRITORY_THRESHOLD;

        const candidateCells = remainingCells.filter(c => {
          if (c.invoices.length === 0) return false;
          const cellCorridor = c.zone as ViaCorridor;

          // Celdas de corredor esparso (<4 facts) se incluyen si están dentro del
          // radio geográfico del ancla, pero NUNCA si viola la regla dura NORTE↔SUR.
          const allSparse = c.invoices.every(i => (i as any).sparseCorridor);
          const corridorOk = corridorsCompatible(anchorCorridor, cellCorridor);

          // La excepción sparse nunca aplica para la separación NORTE↔SUR (regla del río).
          const NORTE_SIDE = new Set(['NORTE', 'NORTE_LEJANO']);
          const SUR_SIDE   = new Set(['SUR', 'SUR_LEJANO']);
          const isHardRuleViolation =
            (NORTE_SIDE.has(anchorCorridor) && SUR_SIDE.has(cellCorridor)) ||
            (SUR_SIDE.has(anchorCorridor)   && NORTE_SIDE.has(cellCorridor));

          if (!corridorOk && (!allSparse || isHardRuleViolation)) return false;

          const hasOwnedInvoice = c.invoices.some(i => ownedCities.has((i as any).neighborhoodKey || (i as any).cityKey || ''));
          if (anchorCell.centerLat > 0 && c.centerLat > 0) {
            const distToAnchor = cellRoadDistFn(anchorCell.centerLat, anchorCell.centerLng, c.centerLat, c.centerLng);
            const effectiveMax = allSparse && !corridorOk
              ? MAX_SPARSE_ABSORB_KM  // radio para celdas esparsas fuera del corredor
              : maxSpreadKm;
            if (distToAnchor > effectiveMax) {
              if (hasOwnedInvoice && canExpandRadius && distToAnchor <= maxSpreadKm * 1.5) return true;
              return hasOwnedInvoice;
            }
          }
          return true;
        });

        // ── Nearest-Neighbor Greedy ──────────────────────────────────────────────
        const cellPool = [...candidateCells]; // pool mutable

        // Llenar vehículo celda por celda — NN desde centroide dinámico
        const load: Invoice[] = [];
        let currentLoadVolume = 0;
        let currentLoadWeight = 0; // kg acumulados en la ruta
        let clusterCenterLat = anchorCell.centerLat;
        let clusterCenterLng = anchorCell.centerLng;

        while (cellPool.length > 0) {
          if (currentLoadVolume >= absoluteMaxCapacity) break;
          if (load.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) break;

          // Buscar la celda más cercana al centroide actual
          // Bonus de 3 km para celdas de territorios propios del vehículo
          let nearestIdx = 0;
          let nearestScore = Infinity;
          for (let ci = 0; ci < cellPool.length; ci++) {
            const c = cellPool[ci];
            if (c.invoices.length === 0) { cellPool.splice(ci, 1); ci--; continue; }
            const isOwned = c.invoices.some(
              i => ownedCities.has((i as any).neighborhoodKey || (i as any).cityKey || '')
            );
            const dist = (clusterCenterLat > 0 && c.centerLat > 0)
              ? cellRoadDistFn(clusterCenterLat, clusterCenterLng, c.centerLat, c.centerLng)
              : (isOwned ? 0 : 30);
            const score = isOwned ? Math.max(0, dist - ownedBonus) : dist;
            if (score < nearestScore) { nearestScore = score; nearestIdx = ci; }
          }
          if (cellPool.length === 0) break;
          const cell = cellPool.splice(nearestIdx, 1)[0];

          // P4: Restricción de 8 horas — estimar duración si se agrega esta celda
          if (load.length > 0) {
            const preview = [...load, ...cell.invoices.slice(0, 1)];
            const estimatedMin = estimateRouteTotalMinutes(preview, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
            if (estimatedMin >= MAX_ROUTE_MINUTES) continue;
          }

          // Chequeo de cohesión: la celda no debe alejar el centroide más allá del radio
          if (clusterCenterLat > 0 && cell.centerLat > 0) {
            const distToCluster = cellRoadDistFn(clusterCenterLat, clusterCenterLng, cell.centerLat, cell.centerLng);
            if (distToCluster > maxSpreadKm) continue;
          }

          const toAdd: Invoice[] = [];
          // Ordenar facturas dentro de la celda por prioridad → horario → lat/lng
          const cellInvs = [...cell.invoices].sort((a, b) => {
            if ((a as any).isPriority !== (b as any).isPriority) return (a as any).isPriority ? -1 : 1;
            const aT = (a as any).timeWindowMinutes ?? Infinity;
            const bT = (b as any).timeWindowMinutes ?? Infinity;
            if (aT !== bT) return aT - bT;
            const aOwn = ownedCities.has((a as any).neighborhoodKey || (a as any).cityKey || '') ? -1 : 0;
            const bOwn = ownedCities.has((b as any).neighborhoodKey || (b as any).cityKey || '') ? -1 : 0;
            if (aOwn !== bOwn) return aOwn - bOwn;
            return Number(a.lat) - Number(b.lat);
          });

          for (const inv of cellInvs) {
            if (load.length + toAdd.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) break;
            const invVol = Number(inv.volumeM3 || (inv as any).volume_m3 || 0);
            const nKey = (inv as any).neighborhoodKey || '';
            if (isLargeVehicle && RESTRICTED_NEIGHBORHOODS.includes(nKey)) continue;
            const invWeight = Number(inv.weightKg || 0);
            const weightOk = !maxWeightKg || (currentLoadWeight + invWeight <= maxWeightKg);
            if (currentLoadVolume + invVol <= absoluteMaxCapacity && weightOk) {
              // Verificar que agregar esta parada no supera 8h
              const withInv = [...load, ...toAdd, inv];
              const testMin = estimateRouteTotalMinutes(withInv, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
              if (testMin >= MAX_ROUTE_MINUTES) continue;
              // Verificar ventana de tiempo: si tiene hora límite, estimar llegada y rechazar si llega tarde
              const tw = (inv as any).timeWindowMinutes;
              if (typeof tw === 'number') {
                const pos = withInv.length - 1;
                const arrivalFromDep = estimateArrivalAtStopMinutes(withInv, pos, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
                if (DISPATCH_DEPARTURE_HOUR * 60 + arrivalFromDep > tw) continue;
              }
              toAdd.push(inv);
              currentLoadVolume += invVol;
              currentLoadWeight += invWeight;
            }
          }

          // Marcar las añadidas como consumidas de la celda
          const addedIds = new Set(toAdd.map(i => i.id));
          cell.invoices = cell.invoices.filter(i => !addedIds.has(i.id));
          cell.totalVolume = cell.invoices.reduce((s, i) => s + Number(i.volumeM3 || (i as any).volume_m3 || 0), 0);
          load.push(...toAdd);

          // Recalcular centroide real de la ruta con las facturas geocodificadas ya agregadas
          const geocodedLoad = load.filter(i => Number(i.lat) > 0 && !(i as any).hasDefaultCoords && !(i as any).zoneInferred);
          if (geocodedLoad.length > 0) {
            clusterCenterLat = geocodedLoad.reduce((s, i) => s + Number(i.lat), 0) / geocodedLoad.length;
            clusterCenterLng = geocodedLoad.reduce((s, i) => s + Number(i.lng), 0) / geocodedLoad.length;
          }
        }

        // También quitar las facturas usadas de availableInvoices (para consistencia)
        const usedIds = new Set(load.map(i => i.id));
        availableInvoices = availableInvoices.filter(i => !usedIds.has(i.id));

        // Optimización 2-opt → Or-opt(1) → 3-opt intra post-cluster
        if (load.length >= 4) {
          const opt2 = twoOptImprove(load, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
          const opt3 = orOpt1Intra(opt2, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
          const opt4 = threeOptImprove(opt3, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
          load.length = 0;
          load.push(...opt4);
        }

        if (load.length > 0) {
          const cityCounts: { [key: string]: number } = {};
          load.forEach(inv => {
            const c = (inv as any).cityKey || 'SIN_CIUDAD';
            cityCounts[c] = (cityCounts[c] || 0) + 1;
          });
          const dominantCity = Object.keys(cityCounts).reduce((a, b) => cityCounts[a] > cityCounts[b] ? a : b, 'LOGÍSTICA');

          suggestions.push({
            id: `route-${Date.now()}-${vehicle.plate}`,
            vehicle,
            assignedInvoices: load,
            totalVolume: Number(currentLoadVolume.toFixed(4)),
            utilization: Math.round((currentLoadVolume / nominalCapacity) * 100),
            city: dominantCity
          });
          usedVehicleIds.add(vehicle.id);
        }

        // Limpiar celdas vacías
        remainingCells = remainingCells.filter(c => c.invoices.length > 0);
      });

      // ── Balance post-clustering ────────────────────────────────────────────────
      setOptimizingProgress(65); setOptimizingPhase('Balanceando carga entre rutas...');
      // Mueve facturas de rutas con muy pocas paradas hacia rutas livianas de la
      // misma zona geográfica, respetando capacidad de volumen y MAX_INVOICES.
      if (suggestions.length >= 2) {
        const MIN_INVOICES_THRESHOLD = Math.round(OPTIMIZATION_CONSTANTS.TARGET_INVOICES * 0.55); // ~13 facturas
        let balanced = true;
        let balanceIterations = 0;
        while (balanced && balanceIterations < 10) {
          balanced = false;
          balanceIterations++;
          for (let i = 0; i < suggestions.length; i++) {
            const donor = suggestions[i];
            if (donor.assignedInvoices.length <= MIN_INVOICES_THRESHOLD) continue;

            const donorCorridor: ViaCorridor = (donor.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
            const donorCap = Number(donor.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;

            // Receptores ordenados: mismo corredor primero, luego adyacentes
            // Garantiza que el overflow de SUR va a SUR antes que a ENVIGADO o MED_OCC
            const receiverOrder = suggestions
              .map((r, idx) => ({ r, idx }))
              .filter(({ idx }) => idx !== i)
              .filter(({ r }) => {
                if (r.assignedInvoices.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) return false;
                const cap = Number(r.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
                if (r.totalVolume >= cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) return false;
                const rCorridor: ViaCorridor = (r.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
                return corridorsCompatible(donorCorridor, rCorridor);
              })
              .sort(({ r: a }, { r: b }) => {
                const aC: ViaCorridor = (a.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
                const bC: ViaCorridor = (b.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
                // Mismo corredor que el donante tiene máxima prioridad
                const aExact = aC === donorCorridor ? 0 : 1;
                const bExact = bC === donorCorridor ? 0 : 1;
                return aExact - bExact;
              });

            for (const { r: receiver, idx: j } of receiverOrder) {
              const receiverCap = Number(receiver.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;

              // Intentar mover la última factura del donor (más cerca del receiver geográficamente)
              const movable = [...donor.assignedInvoices].sort((a, b) => {
                const rLat = receiver.assignedInvoices.length > 0 ? Number(receiver.assignedInvoices[receiver.assignedInvoices.length - 1].lat || 0) : 0;
                const rLng = receiver.assignedInvoices.length > 0 ? Number(receiver.assignedInvoices[receiver.assignedInvoices.length - 1].lng || 0) : 0;
                const dA = Math.pow(Number(a.lat || 0) - rLat, 2) + Math.pow(Number(a.lng || 0) - rLng, 2);
                const dB = Math.pow(Number(b.lat || 0) - rLat, 2) + Math.pow(Number(b.lng || 0) - rLng, 2);
                return dA - dB;
              });

              for (const inv of movable) {
                const vol = Number(inv.volumeM3) || 0;
                if (receiver.totalVolume + vol > receiverCap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) continue;
                if (donor.assignedInvoices.length - 1 < 1) break;

                // No mover si hay otras facturas del mismo grupo de dirección en el donor
                const addrKey = (inv as any).addressGroupKey;
                if (addrKey) {
                  const siblingsInDonor = donor.assignedInvoices.filter(
                    x => x.id !== inv.id && (x as any).addressGroupKey === addrKey
                  );
                  if (siblingsInDonor.length > 0) continue;
                }

                // Mover factura: quitar del donor, agregar al receiver
                const newDonorInvoices = donor.assignedInvoices.filter(x => x.id !== inv.id);
                const newReceiverInvoices = [...receiver.assignedInvoices, inv];

                suggestions[i] = {
                  ...donor,
                  assignedInvoices: newDonorInvoices,
                  totalVolume: Number((donor.totalVolume - vol).toFixed(4)),
                  utilization: Math.round(((donor.totalVolume - vol) / donorCap) * 100),
                };
                suggestions[j] = {
                  ...receiver,
                  assignedInvoices: newReceiverInvoices,
                  totalVolume: Number((receiver.totalVolume + vol).toFixed(4)),
                  utilization: Math.round(((receiver.totalVolume + vol) / receiverCap) * 100),
                };
                balanced = true;
                break;
              }
            }
          }
        }
        // Eliminar rutas que quedaron vacías tras el balance
        suggestions.splice(0, suggestions.length, ...suggestions.filter(r => r.assignedInvoices.length > 0));

        // Re-aplicar 2-opt a rutas modificadas
        suggestions.forEach((r, idx) => {
          if (r.assignedInvoices.length >= 4) {
            const optimized = twoOptImprove(r.assignedInvoices, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
            suggestions[idx] = { ...r, assignedInvoices: optimized };
          }
        });
      }
      // ─────────────────────────────────────────────────────────────────────────

      // ── Sweep final: absorber facturas sobrantes en rutas existentes ─────────
      setOptimizingProgress(72); setOptimizingPhase('Absorbiendo facturas sobrantes...');
      // PASO 1: corredor compatible (regla estricta).
      // PASO 2 (fallback): si la factura es de un corredor esparso (<4 facts) o
      //   quedó sin ruta, buscar la ruta más cercana por distancia pura
      //   (≤ MAX_SPARSE_ABSORB_KM) sin importar el corredor.
      //   Esto garantiza que ninguna factura quede sin ruta por falta de volumen
      //   en su zona, sin generar rutas mezcladas innecesariamente.
      if (availableInvoices.length > 0 && suggestions.length > 0) {
        const swept = new Set<string>();

        const trySweepInvoice = (inv: Invoice, relaxCorridor: boolean) => {
          const invCorridor: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';
          const invVol = Number(inv.volumeM3) || 0;
          const invLat = Number((inv as any).lat || 0);
          const invLng = Number((inv as any).lng || 0);
          let bestIdx = -1;
          let bestDist = Infinity;

          for (let ri = 0; ri < suggestions.length; ri++) {
            const r = suggestions[ri];
            if (r.assignedInvoices.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) continue;
            const cap = Number(r.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
            if (r.totalVolume + invVol > cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) continue;
            const rCorridor: ViaCorridor = (r.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';

            if (!relaxCorridor && !corridorsCompatible(invCorridor, rCorridor)) continue;

            const lastInv = r.assignedInvoices[r.assignedInvoices.length - 1];
            const rLat = Number((lastInv as any)?.lat || 0);
            const rLng = Number((lastInv as any)?.lng || 0);
            const dist = (invLat > 0 && rLat > 0)
              ? haversineKm(invLat, invLng, rLat, rLng)
              : (invCorridor === rCorridor ? 5 : 20);

            // En modo relaxado: solo aceptar si está dentro del radio máximo
            if (relaxCorridor && dist > MAX_SPARSE_ABSORB_KM) continue;

            const withInv = [...r.assignedInvoices, inv];
            if (estimateRouteTotalMinutes(withInv, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) >= MAX_ROUTE_MINUTES) continue;
            if (dist < bestDist) { bestDist = dist; bestIdx = ri; }
          }

          if (bestIdx >= 0) {
            const t = suggestions[bestIdx];
            const cap = Number(t.vehicle.capacityM3) || OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
            suggestions[bestIdx] = {
              ...t,
              assignedInvoices: [...t.assignedInvoices, inv],
              totalVolume: Number((t.totalVolume + invVol).toFixed(4)),
              utilization: Math.round(((t.totalVolume + invVol) / cap) * 100),
            };
            swept.add(inv.id);
          }
        };

        // Paso 1: corredor estricto
        for (const inv of availableInvoices) trySweepInvoice(inv, false);

        // Paso 2: facturas aún sin ruta y corredor esparso → distancia pura
        const stillPending = availableInvoices.filter(i => !swept.has(i.id));
        for (const inv of stillPending) {
          if ((inv as any).sparseCorridor) trySweepInvoice(inv, true);
        }

        // Paso 3: cualquier sobrante → distancia pura sin restricción de corredor
        const finalPending = availableInvoices.filter(i => !swept.has(i.id));
        for (const inv of finalPending) trySweepInvoice(inv, true);

        if (swept.size > 0) {
          suggestions.forEach((r, idx) => {
            if (r.assignedInvoices.some(i => swept.has(i.id)) && r.assignedInvoices.length >= 4) {
              suggestions[idx] = { ...r, assignedInvoices: twoOptImprove(r.assignedInvoices, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[] };
            }
          });
          availableInvoices = availableInvoices.filter(i => !swept.has(i.id));
        }
      }

      // ── FASE FORZADA: Asignar TODO lo que quedó sin ruta ──────────────────
      // Principio M7: ninguna factura puede quedar sin asignar.
      // Cascada: 1) nuevo vehículo por corredor  2) overflow en ruta compatible  3) distribuir en cualquier ruta
      if (availableInvoices.length > 0) {
        setOptimizingProgress(88); setOptimizingPhase(`Forzando ${availableInvoices.length} facturas restantes...`);

        // Agrupar por corredor para no cruzar zonas geográficas
        const forceGroups = new Map<ViaCorridor, Invoice[]>();
        availableInvoices.forEach(inv => {
          const c: ViaCorridor = (inv as any).corridor || 'MED_CENTRO';
          if (!forceGroups.has(c)) forceGroups.set(c, []);
          forceGroups.get(c)!.push(inv);
        });

        const forceAssigned = new Set<string>();
        const freeVehicles = availableVehicles.filter(v => !usedVehicleIds.has(v.id));

        forceGroups.forEach((batch, corridor) => {
          let remaining = [...batch];

          // Paso A: crear nuevas rutas con vehículos libres
          while (remaining.length > 0 && freeVehicles.length > 0) {
            const batchVol = remaining.reduce((s, i) => s + (Number(i.volumeM3) || 0), 0);
            const bestVehIdx = freeVehicles
              .map((v, i) => ({ i, diff: Math.abs((Number(v.capacityM3) || 30) * 0.85 - batchVol) }))
              .sort((a, b) => a.diff - b.diff)[0]?.i ?? 0;
            const bestVeh = freeVehicles[bestVehIdx];
            const cap = Number(bestVeh.capacityM3) || 30;

            const toAssign: Invoice[] = [];
            let assignedVol = 0;
            for (const inv of remaining) {
              if (toAssign.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) break;
              const vol = Number(inv.volumeM3) || 0;
              if (assignedVol + vol > cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) break;
              toAssign.push(inv);
              assignedVol += vol;
            }
            if (toAssign.length === 0) break;

            const assignedSet = new Set(toAssign.map(i => i.id));
            remaining = remaining.filter(i => !assignedSet.has(i.id));
            toAssign.forEach(i => forceAssigned.add(i.id));

            const cityLabel = (toAssign[0] as any).cityKey || toAssign[0].city || corridor;
            suggestions.push({
              id: `route-force-${corridor}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              vehicle: bestVeh,
              assignedInvoices: toAssign.length >= 4
                ? (twoOptImprove(toAssign, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[])
                : toAssign,
              totalVolume: Number(assignedVol.toFixed(4)),
              utilization: Math.round((assignedVol / cap) * 100),
              city: cityLabel,
            });
            usedVehicleIds.add(bestVeh.id);
            freeVehicles.splice(bestVehIdx, 1);
          }

          if (remaining.length === 0) return;

          // Paso B: overflow en rutas compatibles (ordenar de menor a mayor carga)
          const compatRoutes = suggestions
            .map((r, idx) => {
              const rc: ViaCorridor = (r.assignedInvoices[0] as any)?.corridor || 'MED_CENTRO';
              return { idx, r, compatible: corridorsCompatible(corridor, rc) || rc === corridor };
            })
            .filter(x => x.compatible)
            .sort((a, b) => a.r.totalVolume - b.r.totalVolume);

          // Paso C: si no hay compatibles, usar cualquier ruta (último recurso)
          const targetRoutes = compatRoutes.length > 0
            ? compatRoutes
            : suggestions.map((r, idx) => ({ idx, r, compatible: true })).sort((a, b) => a.r.assignedInvoices.length - b.r.assignedInvoices.length);

          for (const inv of remaining) {
            const invVol = Number(inv.volumeM3) || 0;
            let targetRouteIdx = -1;

            // Encontrar la primera ruta que tenga espacio disponible sin violar restricciones
            for (const target of targetRoutes) {
              const rIdx = target.idx;
              const route = suggestions[rIdx];
              const cap = Number(route.vehicle.capacityM3) || 30;
              const newVol = route.totalVolume + invVol;

              if (route.assignedInvoices.length < OPTIMIZATION_CONSTANTS.MAX_INVOICES &&
                  newVol <= cap * OPTIMIZATION_CONSTANTS.MAX_UTILIZATION) {
                targetRouteIdx = rIdx;
                break;
              }
            }

            if (targetRouteIdx !== -1) {
              const cap = Number(suggestions[targetRouteIdx].vehicle.capacityM3) || 30;
              const newVol = suggestions[targetRouteIdx].totalVolume + invVol;
              suggestions[targetRouteIdx] = {
                ...suggestions[targetRouteIdx],
                assignedInvoices: [...suggestions[targetRouteIdx].assignedInvoices, inv],
                totalVolume: Number(newVol.toFixed(4)),
                utilization: Math.round((newVol / cap) * 100),
              };
              forceAssigned.add(inv.id);
            }
          }
          // Cualquier factura en 'remaining' que no fue asignada por falta de espacio/límites
          // se queda como 'sin ruta' y regresará al pool de facturas disponibles.
          remaining = [];
        });

        if (forceAssigned.size > 0) {
          availableInvoices = availableInvoices.filter(i => !forceAssigned.has(i.id));
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      // ── Or-opt inter-ruta ───────────────────────────────────────────────────
      setOptimizingProgress(80); setOptimizingPhase('Optimizando inter-rutas (Or-opt)...');
      // Mueve paradas individuales entre rutas para minimizar distancia total.
      // Corre después del sweep para que trabaje sobre el conjunto final completo.
      if (suggestions.length > 1) {
        const orOptResult = orOptInterRoute(suggestions, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
        // Re-aplicar 2-opt + Or-opt(1) intra a las rutas que cambiaron
        const origLengths = suggestions.map(r => r.assignedInvoices.length);
        orOptResult.forEach((r, idx) => {
          if (r.assignedInvoices.length !== origLengths[idx] && r.assignedInvoices.length >= 4) {
            const opt2 = twoOptImprove(r.assignedInvoices, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
            const opt3 = orOpt1Intra(opt2, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
            const opt4 = threeOptImprove(opt3, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng) as Invoice[];
            orOptResult[idx] = { ...r, assignedInvoices: opt4 };
          }
        });
        suggestions.splice(0, suggestions.length, ...orOptResult);
      }

      // ── ILS: perturbación adaptiva + tabú + reparación ───────────────────────
      setOptimizingProgress(87); setOptimizingPhase('Refinando con ILS (12 rondas)...');
      if (suggestions.length > 1) {
        const ilsResult = ilsImprove(suggestions, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng);
        suggestions.splice(0, suggestions.length, ...ilsResult);
      }

      // ── OSRM: refinamiento final con distancias reales por red vial ──────────
      setOptimizingProgress(93); setOptimizingPhase('Calculando rutas reales (OSRM)...');
      // Cada ruta recibe su propia matriz NxN de OSRM y re-corre 2-opt + Or-opt(1).
      // Corre en paralelo (Promise.all). Si OSRM falla en alguna ruta, esa ruta
      // conserva el orden Haversine ya optimizado — sin pérdida de datos.
      let osrmRefinedCount = 0;
      if (suggestions.length > 0) {
        await Promise.all(suggestions.map(async (route, idx) => {
          if (route.assignedInvoices.length < 3) return;
          try {
            const points = [
              { lat: ORBIT_HUB_ORIGIN.lat, lng: ORBIT_HUB_ORIGIN.lng },
              ...route.assignedInvoices.map(inv => ({
                lat: Number(inv.lat) || ORBIT_HUB_ORIGIN.lat,
                lng: Number(inv.lng) || ORBIT_HUB_ORIGIN.lng,
              })),
            ];
            const result = await api.getRoadMatrix(points);
            if (!result?.distMatrix) return;
            const distFn = buildRoadDistFn(points, result.distMatrix);
            const timeFn = result.durMatrix ? buildRoadTimeFn(points, result.durMatrix) : undefined;
            const opt2 = twoOptImprove(route.assignedInvoices, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng, distFn) as Invoice[];
            const opt3 = orOpt1Intra(opt2, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng, distFn) as Invoice[];
            // 3-opt con distancias reales — máximo impacto en rutas ≥12 paradas
            const opt4 = threeOptImprove(opt3, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng, distFn) as Invoice[];
            // Validate the OSRM-refined route still respects 8h (road times may differ from Haversine)
            const roadMinutes = estimateRouteTotalMinutes(opt4, ORBIT_HUB_ORIGIN.lat, ORBIT_HUB_ORIGIN.lng, DISPATCH_DEPARTURE_HOUR, timeFn);
            suggestions[idx] = { ...route, assignedInvoices: roadMinutes < MAX_ROUTE_MINUTES ? opt4 : route.assignedInvoices };
            osrmRefinedCount++;
          } catch { /* OSRM no disponible — conservar orden Haversine */ }
        }));
      }

      // ── Deduplicación global final ───────────────────────────────────────────
      setOptimizingProgress(98); setOptimizingPhase('Validando y deduplicando...');
      // Una factura nunca debe aparecer en más de una ruta ni repetida en la misma.
      // Esto es la tercera línea de defensa (pool input + validInvoices + esta).
      {
        const _globalSeen = new Set<string>();
        suggestions.forEach((r, ri) => {
          const unique = r.assignedInvoices.filter(inv => {
            const k = String(inv.invoiceNumber || inv.id || '').trim().toUpperCase();
            if (!k || _globalSeen.has(k)) return false;
            _globalSeen.add(k);
            return true;
          });
          if (unique.length !== r.assignedInvoices.length) {
            const cap = Number(r.vehicle.capacityM3) || 25;
            const vol = unique.reduce((s, i) => s + (Number(i.volumeM3) || 0), 0);
            suggestions[ri] = { ...r, assignedInvoices: unique, totalVolume: Number(vol.toFixed(4)), utilization: Math.round((vol / cap) * 100) };
          }
        });
        // Eliminar rutas que quedaron vacías tras la dedup
        suggestions.splice(0, suggestions.length, ...suggestions.filter(r => r.assignedInvoices.length > 0));
      }

      if (suggestions.length === 0) {
        if (availableVehicles.length === 0) {
          toast.error(`NO HAY TRIPULACIONES DISPONIBLES.`);
        } else {
          toast.info("No se hallaron rutas factibles.");
        }
      } else {
        const assignedCount = suggestions.reduce((acc, r) => acc + r.assignedInvoices.length, 0);
        const leftover = availableInvoices.length;
        const leftoverTxt = leftover > 0 ? ` · ${leftover} sin ruta` : '';
        const osrmTag = osrmRefinedCount > 0 ? ` · OSRM ${osrmRefinedCount}/${suggestions.length}` : '';
        toast.success(`OrbitM7: ${suggestions.length} rutas · ${assignedCount} facturas asignadas${leftoverTxt}${osrmTag}`);
      }

      setSuggestedRoutes(suggestions);

      // ── Calcular motivo real de facturas sin ruta ──────────────────────────
      if (availableInvoices.length > 0) {
        const usedCount = usedVehicleIds.size;
        const totalAvail = availableVehicles.length;
        const noCoordCount = availableInvoices.filter(inv => {
          const lat = Number((inv as any).lat || 0), lng = Number((inv as any).lng || 0);
          return (lat === 0 && lng === 0) || hasDefaultCoords(lat, lng);
        }).length;

        if (usedCount >= totalAvail) {
          setUnroutedReason('Todos los vehículos utilizados');
        } else if (noCoordCount > availableInvoices.length * 0.6) {
          setUnroutedReason('Sin coordenadas de entrega');
        } else if (suggestions.length === 0) {
          setUnroutedReason('No se generaron rutas');
        } else {
          // Quedan vehículos disponibles pero el algoritmo no les encontró ancla
          setUnroutedReason(`Sin ancla geográfica (${totalAvail - usedCount} veh. libres)`);
        }
      } else {
        setUnroutedReason('');
      }
      // ──────────────────────────────────────────────────────────────────────

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

      setOptimizingProgress(100); setOptimizingPhase('');
      setIsOptimizing(false);
      setOptimizingProgress(0);
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
    const realCapacity = Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) > 0 ? Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) : OPTIMIZATION_CONSTANTS.DEFAULT_CAPACITY;
    const newVol = route.assignedInvoices.reduce((acc, curr) => acc + Number(curr.volumeM3 || (curr as any).volume_m3 || 0), 0);
    route.totalVolume = Number(Number(newVol).toFixed(4));
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
    const nominalCapacity = Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) || 0;
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

    if (route.assignedInvoices.length >= OPTIMIZATION_CONSTANTS.MAX_INVOICES) {
      toast.warning(`Advertencia: Esta ruta supera el límite sugerido de ${OPTIMIZATION_CONSTANTS.MAX_INVOICES} facturas. Continúa bajo tu criterio.`);
    }

    const realCapacity = Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) > 0 ? Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) : 30; // Fallback
    const invoiceVol = Number(invoice.volumeM3 || (invoice as any).volume_m3 || 0);
    const currentVol = route.assignedInvoices.reduce((acc, curr) => acc + Number(curr.volumeM3 || (curr as any).volume_m3 || 0), 0);
    const newVol = currentVol + invoiceVol;
    const utilization = (newVol / realCapacity) * 100;

    if (utilization > OPTIMIZATION_CONSTANTS.CRITICAL_THRESHOLD * 100) {
      toast.error(`BLOQUEO: Agregar esta factura superaría el umbral crítico de capacidad (${utilization.toFixed(1)}% de ${realCapacity}m³).`);
      return;
    }

    // Marcar como repice si viene del tab repice
    const invoiceToAdd = addInvoiceModal.tab === 'repice'
      ? { ...invoice, isRepice: true, status: 'EST-15' } as any
      : invoice;
    route.assignedInvoices.push(invoiceToAdd);
    route.totalVolume = Number(Number(newVol).toFixed(4));
    route.utilization = Math.round(utilization);

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
    const loadVolume = route.assignedInvoices.reduce((acc, inv) => acc + Number(inv.volumeM3 || (inv as any).volume_m3 || 0), 0);
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
            currentVol -= Number(removed.volumeM3 || (removed as any).volume_m3 || 0);
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
        createdBy: user.name,
        totalVolume: route.totalVolume,
        utilization: route.utilization,
        capacityM3: Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3 || 0),
        shift: currentShift
      });

      if (res.success) {
        toast.success("Despacho Orbit Confirmado Exitosamente");

        // Registrar IDs confirmados para que no reboten en el contador SIN RUTA
        const confirmedIds = route.assignedInvoices.map(i => i.id || i.invoiceNumber);
        setConfirmedSessionIds(prev => new Set([...prev, ...confirmedIds]));
        if (currentShift === 1) {
          setShift1CompletedVehicleIds(prev => new Set([...prev, route.vehicle.id]));
        }

        // M7 IQ: aprender de la ruta confirmada (señal más fuerte que adición manual)
        const stops = route.assignedInvoices.map(inv => ({
          city: (inv as any).cityKey || normalizeCityName(String(inv.city || 'SIN_CIUDAD')),
          neighborhood: String((inv as any).neighborhoodKey || '').toUpperCase().trim(),
          address: String(inv.address || '').trim(),
          clientId: String(inv.clientId || (inv as any).docLId || '').trim(),
        }));
        api.learnFromCompletedRoute({ vehicleId: route.vehicle.id, stops })
          .then(() => {
            // Refrescar patrones para que la próxima optimización en la misma sesión ya use los nuevos
            api.getRoutingPatterns().then((d: any[]) => { if (Array.isArray(d)) setLearningPatterns(d); }).catch(() => {});
          })
          .catch(() => { /* non-critical */ });

        setSuggestedRoutes(prev => prev.filter(r => r.id !== route.id));
        // Actualizar rutas en el store inmediatamente (no esperar al onRefresh del padre)
        api.getRoutes().then((r: any[]) => { if (Array.isArray(r)) setRoutes(r); }).catch(() => { });
        api.getDailyKPIs().then((d: any) => { if (d && typeof d === 'object') setDailyKPIs(d); }).catch(() => {});
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
                     <span class="bg-white/20 px-1.5 py-0.5 rounded">${Number(inv.volumeM3 || (inv as any).volume_m3 || 0).toFixed(3)}m³</span>
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

  const handleExportRoutesExcel = () => {
    if (suggestedRoutes.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    const DEFAULT_LAT = 6.2518, DEFAULT_LNG = -75.5636;
    const isDefaultCoord = (lat: any, lng: any) => {
      const la = Number(lat || 0), lo = Number(lng || 0);
      return (la === 0 && lo === 0) ||
        (Math.abs(la - DEFAULT_LAT) < 0.001 && Math.abs(Math.abs(lo) - Math.abs(DEFAULT_LNG)) < 0.001);
    };

    // Deduplicar assignedInvoices por número de factura (por si el pool aún tiene duplicados)
    const dedupRoute = (invs: typeof suggestedRoutes[0]['assignedInvoices']) => {
      const seen = new Set<string>();
      return invs.filter(inv => {
        const k = String(inv.invoiceNumber || inv.id || '').trim().toUpperCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    // ── RESUMEN: una fila por ruta + desglose por documento ─────────────────
    const summaryRows: Record<string, any>[] = [];

    suggestedRoutes.forEach((r, idx) => {
      const deduped = dedupRoute(r.assignedInvoices);
      const conductorLink = assignments.find(a => a.vehicleId === r.vehicle.id && a.isActive);
      const conductorName = conductorLink
        ? (drivers.find(d => d.id === conductorLink.driverId)?.name || conductorLink.driverId)
        : 'SIN ASIGNAR';

      // Agrupar por documento
      const docCounts = new Map<string, number>();
      deduped.forEach(inv => {
        const doc = documents.find(d => d.id === inv.docLId);
        const docLabel = doc?.externalDocId || String(inv.docLId || 'S/DOC').slice(-8);
        docCounts.set(docLabel, (docCounts.get(docLabel) || 0) + 1);
      });

      const row: Record<string, any> = {
        '#': idx + 1,
        'PLACA': r.vehicle.plate,
        'CONDUCTOR': conductorName,
        'CIUDAD DOMINANTE': r.city,
        'FACTURAS': deduped.length,
        'VOLUMEN M3': Number(r.totalVolume.toFixed(3)),
        'UTILIZACION %': r.utilization,
      };
      // Columnas dinámicas por documento
      docCounts.forEach((count, docId) => {
        row[`DOC ${docId}`] = count;
      });
      summaryRows.push(row);
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'RESUMEN');

    // ── Hojas de detalle: una fila por factura (deduplicada) ─────────────────
    suggestedRoutes.forEach((r, idx) => {
      const deduped = dedupRoute(r.assignedInvoices);
      const rows = deduped.map((inv, pos) => {
        const doc = documents.find(d => d.id === inv.docLId);
        const docLabel = doc?.externalDocId || String(inv.docLId || '').slice(-8) || 'S/DOC';
        const lat = isDefaultCoord(inv.lat, inv.lng) ? 0 : Number(inv.lat || 0);
        const lng = isDefaultCoord(inv.lat, inv.lng) ? 0 : Number(inv.lng || 0);
        return {
          'ORDEN': pos + 1,
          'DOCUMENTO': docLabel,
          'FACTURA': inv.invoiceNumber || inv.id,
          'CLIENTE': inv.customerName || '',
          'CIUDAD': inv.city || '',
          'BARRIO': (inv as any).neighborhoodKey || (inv as any).neighborhood || '',
          'DIRECCIÓN': inv.address || '',
          'VOLUMEN M3': Number(inv.volumeM3 || (inv as any).volume_m3 || 0),
          'VALOR': inv.invoiceValue || '',
          'PAGO': (inv as any).paymentMethod || '',
          'LAT': lat,
          'LNG': lng,
        };
      });
      const sheetName = `${idx + 1}_${r.vehicle.plate}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
    });

    XLSX.writeFile(wb, `RUTAS-PLANIFICADAS_${today}.xlsx`);
  };

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
          createdBy: user.name || 'SISTEMA',
          totalVolume: route.totalVolume,
          utilization: route.utilization,
          capacityM3: Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3 || 0),
          shift: currentShift
        });

        if (res.success) {
          successCount++;
          // Registrar IDs confirmados para que no reboten en el contador SIN RUTA
          const confirmedIds = route.assignedInvoices.map(i => i.id || i.invoiceNumber);
          setConfirmedSessionIds(prev => new Set([...prev, ...confirmedIds]));
          if (currentShift === 1) {
            setShift1CompletedVehicleIds(prev => new Set([...prev, route.vehicle.id]));
          }
          // M7 IQ: aprender de cada ruta confirmada en despacho masivo
          const stops = route.assignedInvoices.map(inv => ({
            city: (inv as any).cityKey || normalizeCityName(String(inv.city || 'SIN_CIUDAD')),
            neighborhood: String((inv as any).neighborhoodKey || '').toUpperCase().trim(),
            address: String(inv.address || '').trim(),
            clientId: String(inv.clientId || (inv as any).docLId || '').trim(),
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
      setCurrentShift(1);
      setShift1CompletedVehicleIds(new Set());
      setConfirmedSessionIds(new Set());
      // Refrescar rutas y patrones de aprendizaje para que la próxima sesión ya los use
      api.getRoutes().then((r: any[]) => { if (Array.isArray(r)) setRoutes(r); }).catch(() => { });
      api.getRoutingPatterns().then((d: any[]) => { if (Array.isArray(d)) setLearningPatterns(d); }).catch(() => {});
      api.getDailyKPIs().then((d: any) => { if (d && typeof d === 'object') setDailyKPIs(d); }).catch(() => {});
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
    const ML = 7, MR = 7, CW = PW - ML - MR;
    let y = ML;

    // ── HEADER BAR ──────────────────────────────────────────────────────────
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(0, 0, 0);
    pdf.roundedRect(ML, y, CW, 22, 1, 1, 'FD');
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
    pdf.text((currentClient?.name || 'OPERACION LOGISTICA').toUpperCase().substring(0, 32), ML + 4, y + 9);
    pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
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
      pdf.setFontSize(5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
      pdf.text(label, ix, iy);
      pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.text(val, ix, iy + 5);
    });
    y += 26;

    // ── PAYMENT SECTION ──────────────────────────────────────────────────────
    const bankW = Math.floor(CW * 0.62);
    const totW = CW - bankW - 3;
    const totX = ML + bankW + 3;

    autoTable(pdf, {
      startY: y, margin: { left: ML, bottom: 28 }, tableWidth: bankW,
      head: [['BANCO', 'VALOR', 'COMPROBANTE', 'FECHA']],
      body: [['', '', '', ''], ['', '', '', ''], ['', '', '', '']],
      styles: { fontSize: 6, cellPadding: 1.5, minCellHeight: 5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6, lineWidth: 0.1, lineColor: [0, 0, 0] },
      theme: 'grid'
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
      pdf.setFillColor(255, 255, 255);
      pdf.rect(totX, totY, totW, 5.5, 'F');
      pdf.setDrawColor(0, 0, 0); pdf.rect(totX, totY, totW, 5.5);
      pdf.setFontSize(5.5); pdf.setFont('helvetica', isLast ? 'bold' : 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(label, totX + 1.5, totY + 4);
      pdf.text(val, totX + totW - 1.5, totY + 4, { align: 'right' });
      totY += 5.5;
    });
    y = Math.max(bankEndY, totY) + 3;

    pdf.setFillColor(255, 255, 255); pdf.rect(ML, y, CW, 5, 'F');
    pdf.setDrawColor(0, 0, 0); pdf.rect(ML, y, CW, 5);
    pdf.setFontSize(6); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
    pdf.text('CUENTA CORRIENTE BANCOLOMBIA 217-392356-56 (RECAUDO OFICIAL)', PW / 2, y + 3.5, { align: 'center' });
    y += 7;

    // ── INVOICES TABLE (SPLIT NORMAL / REPICE) ────────────────────────────────
    const normalInvoices = route.assignedInvoices.filter(inv => !(inv as any).isRepice);
    const repiceInvoices = route.assignedInvoices.filter(inv => (inv as any).isRepice);

    const renderInvoiceTable = (list: any[], title?: string) => {
      if (list.length === 0) return;

      if (title) {
        if (y > PH - 40) { pdf.addPage(); y = ML; }
        pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(185, 28, 28); // Rojo para destacar Repice
        pdf.text(title, ML, y + 4);
        y += 6;
      }

      autoTable(pdf, {
        startY: y, margin: { left: ML, right: MR, bottom: 28 },
        head: [['#', 'U.NEG', 'DOC L', 'FACTURA', 'PEDIDO', 'CANT', 'REF', 'VALOR', 'PAG', 'CLIENTE / DIRECCION']],
        body: list
          .sort((a, b) => String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || ''), undefined, { numeric: true, sensitivity: 'base' }))
          .map((inv, idx) => {
            const fi = (inv.items?.[0] || {}) as any;
            const method = String((inv as any).paymentMethod || fi.paymentMethod || fi.payment_method || '-').toUpperCase();
            const isRepice = !!(inv as any).isRepice;
            return [
              String(idx + 1),
              String(inv.unCode || fi.unCode || fi.un_code || '-'),
              String(inv.docLId || '-'),
              isRepice ? `⚡ ${inv.invoiceNumber}` : inv.invoiceNumber,
              String(inv.orderNumber || '-'),
              String(inv.totalItems || '-'),
              String(inv.clientRef || fi.clientRef || fi.client_ref || '-'),
              fmtCOP(inv.invoiceValue || 0),
              method,
              `${inv.customerName || ''} · ${inv.address} - ${inv.city}`,
            ];
          }),
        styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6.5, lineWidth: 0.1, lineColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
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
          if (data.section === 'body' && title) { // Si hay título es que estamos en tabla de repice
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [185, 28, 28];
          }
        },
      });
      y = (pdf as any).lastAutoTable.finalY + 5;
    };

    // Renderizar primero normales, luego repices
    renderInvoiceTable(normalInvoices);
    renderInvoiceTable(repiceInvoices, 'FACTURAS DE REPICE (RE-DESPACHO)');

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
      // 4 bloques por fila: ID | CANT | NOTAS (Acondicionado para 12 columnas totales)
      const cargoRows: string[][] = [];
      for (let i = 0; i < cargoItems.length; i += 4) {
        const a = cargoItems[i], b = cargoItems[i + 1], c = cargoItems[i + 2], d = cargoItems[i + 3];
        const row = [
          a.id, String(a.total), '',
          b ? b.id : '', b ? String(b.total) : '', '',
          c ? c.id : '', c ? String(c.total) : '', '',
          d ? d.id : '', d ? String(d.total) : '', '',
        ];
        cargoRows.push(row);
      }
      autoTable(pdf, {
        startY: y, margin: { left: ML, right: MR, bottom: 28 },
        tableWidth: CW, // Forzar el ancho al margen de la tabla superior
        head: [['ID', 'CANT', 'NOTAS', 'ID', 'CANT', 'NOTAS', 'ID', 'CANT', 'NOTAS', 'ID', 'CANT', 'NOTAS']],
        body: cargoRows,
        styles: { fontSize: 5.5, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 5.5, lineWidth: 0.1, lineColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 29, halign: 'center' },
          1: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 12 },
          3: { cellWidth: 29, halign: 'center' },
          4: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
          5: { cellWidth: 12 },
          6: { cellWidth: 29, halign: 'center' },
          7: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
          8: { cellWidth: 12 },
          9: { cellWidth: 29, halign: 'center' },
          10: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
          11: { cellWidth: 12 },
        },
        theme: 'grid'
      });
      y = (pdf as any).lastAutoTable.finalY + 8;
    }

    const totalPages = (pdf as any).internal.getNumberOfPages();
    const sigW = (CW - 20) / 2;
    const footerY = PH - 26;

    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);

      // ── FOOTER SIGNATURES (ON EVERY PAGE) ─────────────────────────────
      pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.3);
      pdf.line(ML + 5, footerY + 12, ML + 5 + sigW, footerY + 12);
      pdf.line(ML + 5 + sigW + 20, footerY + 12, ML + 5 + sigW * 2 + 20, footerY + 12);

      pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.text('FIRMA CONDUCTOR', ML + 5 + sigW / 2, footerY + 16, { align: 'center' });
      pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text(driverName.toUpperCase(), ML + 5 + sigW / 2, footerY + 20, { align: 'center' });

      pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.text('DESPACHO / AUDITORIA', ML + 5 + sigW + 20 + sigW / 2, footerY + 16, { align: 'center' });
      pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      pdf.text(despachador.toUpperCase(), ML + 5 + sigW + 20 + sigW / 2, footerY + 20, { align: 'center' });

      // Page numbers
      pdf.setFontSize(5); pdf.setTextColor(100, 116, 139);
      pdf.text(`Página ${i} de ${totalPages} | ORBITM7 Intelligence - ${dateStr} - ${route.vehicle.plate} - ${route.assignedInvoices.length} facturas`, PW / 2, PH - 5, { align: 'center' });
    }

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
              {currentShift === 2 && (
                <span className="px-2 py-0.5 bg-violet-600 text-white rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm animate-pulse">2DA VUELTA</span>
              )}
              <select
                value={selectedClient}
                onChange={(e) => { setSelectedClient(e.target.value); setSuggestedRoutes([]); }}
                className="bg-slate-50 border border-slate-200 px-3 py-0.5 rounded-md text-[9px] font-black uppercase outline-none focus:border-emerald-500 shadow-sm max-w-[160px]"
              >

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

          <div className="shrink-0 flex flex-col items-center gap-1">
            <button
              onClick={async () => {
                setIsOptimizing(true);
                setOptimizingProgress(0);
                setOptimizingPhase('Iniciando...');
                const enriched = await enrichInvoicesWithGeocode([...validInvoices]);
                runOrbitOptimization(enriched.length > 0 ? enriched : undefined);
              }}
              disabled={isOptimizing || validInvoices.length === 0}
              className="bg-slate-900 text-emerald-500 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[0.15em] shadow-xl hover:bg-emerald-500 hover:text-slate-900 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 whitespace-nowrap"
            >
              {isOptimizing ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full"></div> : <Icons.Scan className="w-3.5 h-3.5" />}
              {isOptimizing ? (optimizingProgress < 100 ? `${optimizingProgress}%` : '...') : (suggestedRoutes.length > 0 ? 'RECALCULAR' : 'GENERAR')}
            </button>
            {isOptimizing && (
              <div className="w-full flex flex-col items-center gap-0.5" style={{ minWidth: 120 }}>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${optimizingProgress}%` }}
                  />
                </div>
                <p className="text-[7px] text-slate-400 font-bold uppercase tracking-wide truncate max-w-[130px] text-center">{optimizingPhase}</p>
              </div>
            )}
          </div>

          <button
            onClick={handleExportRoutesExcel}
            disabled={suggestedRoutes.length === 0}
            className="shrink-0 px-4 py-2.5 bg-teal-50 text-teal-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-teal-600 hover:text-white transition-all shadow-md active:scale-95 disabled:opacity-20 whitespace-nowrap flex items-center gap-1.5"
          >
            <Icons.Download className="w-3 h-3" />
            EXPORTAR
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

          <button
            onClick={() => setHistoricoModalOpen(true)}
            title="Agrupamiento Histórico de Despacho"
            className="shrink-0 px-3 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center gap-1.5 relative animate-pulse"
          >
            <Icons.Clock className="w-3.5 h-3.5 animate-spin-slow" />
            HISTÓRICO
          </button>

          {/* SEGUNDA VUELTA — disponible cuando hay vehículos que completaron shift 1 */}
          {shift1CompletedVehicleIds.size > 0 && currentShift === 1 && (
            <button
              onClick={() => {
                setCurrentShift(2);
                setSuggestedRoutes([]);
                toast.info(`Segunda vuelta activada · ${shift1CompletedVehicleIds.size} vehículo(s) disponibles`);
              }}
              className="shrink-0 px-4 py-2.5 bg-violet-50 text-violet-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-violet-600 hover:text-white transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center gap-1.5 border border-violet-200 animate-pulse"
            >
              <Icons.RefreshCw className="w-3 h-3" />
              2DA VUELTA ({shift1CompletedVehicleIds.size})
            </button>
          )}
          {currentShift === 2 && (
            <button
              onClick={() => { setCurrentShift(1); setSuggestedRoutes([]); }}
              className="shrink-0 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-violet-700 transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center gap-1.5"
            >
              <Icons.RefreshCw className="w-3 h-3" />
              VUELTA 2 ACTIVA
            </button>
          )}
        </div>
      </div>

      {/* ADVERTENCIA DE CAPACIDAD INSUFICIENTE (preflight) */}
      {preflightWarning && suggestedRoutes.length === 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-2 px-4 rounded-[1.5rem] animate-in slide-in-from-top duration-500 shadow-sm ml-auto">
          <div className="flex flex-col border-r border-amber-200 pr-3">
            <p className="text-[6px] font-black text-amber-600 uppercase tracking-widest">Demanda</p>
            <p className="text-xs font-black text-amber-900 leading-none">{preflightWarning.totalDemand}m³</p>
          </div>
          <div className="flex flex-col border-r border-amber-200 px-3">
            <p className="text-[6px] font-black text-amber-600 uppercase tracking-widest">Flota</p>
            <p className="text-xs font-black text-amber-900 leading-none">{preflightWarning.usableCapacity}m³</p>
          </div>
          <div className="flex flex-col pl-2">
            <p className="text-[6px] font-black text-amber-600 uppercase tracking-widest">Déficit</p>
            <p className="text-xs font-black text-amber-900 leading-none">+{preflightWarning.extraVehicles} veh.</p>
          </div>
        </div>
      )}

      {/* ── BANNER CONSOLIDADO: Sin Ruta + Plan Actual + Resultado Orbit ───────── */}
      {routePlanKPIs && (
        <div className="bg-slate-950 rounded-[2rem] border border-slate-800 shadow-xl flex items-stretch animate-in slide-in-from-top duration-300 overflow-hidden">

          {/* LEFT: Facturas sin ruta */}
          {unassignedMetrics.count > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 border-r border-white/10 shrink-0 bg-rose-950/40">
              <div className="flex flex-col">
                <p className="text-[6px] font-black text-rose-400 uppercase tracking-widest leading-none mb-1">Sin Ruta</p>
                <p className="text-sm font-black text-white leading-none">{unassignedMetrics.count}<span className="text-[8px] text-slate-500 ml-1">FACTS</span></p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex flex-col">
                <p className="text-[6px] font-black text-rose-400 uppercase tracking-widest leading-none mb-1">Volumen</p>
                <p className="text-sm font-black text-white leading-none">{unassignedMetrics.volume}m³</p>
              </div>
              <div className="w-px h-6 bg-white/10" />
              {unroutedReason && (
                <div className="flex flex-col">
                  <p className="text-[6px] font-black text-rose-400 uppercase tracking-widest leading-none mb-1">Motivo</p>
                  <p className="text-[9px] font-black text-rose-300 leading-none">{unroutedReason}</p>
                </div>
              )}
              <button
                onClick={() => setIsPendingInvoicesModalOpen(true)}
                className="flex items-center gap-1.5 ml-1 px-3 py-1.5 bg-rose-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all active:scale-95 whitespace-nowrap">
                <Icons.Truck className="w-3 h-3" />
                VER
              </button>
            </div>
          )}

          {/* CENTER: KPIs del plan */}
          <div className="flex items-center gap-3 px-5 py-3 flex-1 flex-wrap">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-5 h-5 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Icons.Route className="w-3 h-3 text-slate-950" />
              </div>
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Plan actual</p>
            </div>
            {[
              { label: 'Rutas',    value: routePlanKPIs.routes,          color: 'text-white' },
              { label: 'Facturas', value: routePlanKPIs.totalInvoices,   color: 'text-white' },
              { label: 'Km',       value: `${routePlanKPIs.totalKm}`,    color: 'text-emerald-400' },
              { label: 'Tiempo',   value: routePlanKPIs.timeLabel,       color: 'text-sky-400' },
              { label: 'Utiliz.',  value: `${routePlanKPIs.avgUtil}%`,   color: routePlanKPIs.avgUtil >= 80 ? 'text-emerald-400' : routePlanKPIs.avgUtil >= 60 ? 'text-amber-400' : 'text-rose-400' },
              ...(geocodedCount > 0 ? [{ label: 'Geoloc.', value: `+${geocodedCount}`, color: 'text-violet-400' }] : []),
            ].map((kpi, i, arr) => (
              <div key={kpi.label} className="flex items-center gap-3">
                <div className="w-px h-5 bg-slate-700" />
                <div className="flex flex-col items-center">
                  <p className={`text-sm font-black leading-none ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-[6px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: Barra de capacidad + Resultado Orbit (si aplica) */}
          <div className="flex items-center gap-3 px-4 py-3 border-l border-white/10 shrink-0">
            <div className="flex flex-col items-end gap-1">
              <div className="h-1.5 w-28 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(routePlanKPIs.avgUtil, 100)}%`, backgroundColor: routePlanKPIs.avgUtil >= 80 ? '#10b981' : routePlanKPIs.avgUtil >= 60 ? '#f59e0b' : '#f43f5e' }} />
              </div>
              <p className="text-[7px] font-black text-slate-500 uppercase">{routePlanKPIs.avgUtil}% cap</p>
            </div>

            {lastReadjustmentResult && (
              <>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col shrink-0">
                  <p className="text-[6px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Orbit Aplicado · DOCS: <span className="text-indigo-300">{lastReadjustmentResult.docIds.join(', ')}</span></p>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-[6px] font-black text-slate-500 uppercase">Proc.</p>
                      <p className="text-xs font-black text-white">{lastReadjustmentResult.facts}</p>
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                    <div className="text-center">
                      <p className="text-[6px] font-black text-emerald-400 uppercase">Asig.</p>
                      <p className="text-xs font-black text-emerald-400">{lastReadjustmentResult.facts - lastReadjustmentResult.unrouted}</p>
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                    <div className="text-center">
                      <p className="text-[6px] font-black text-amber-400 uppercase">Sin Cap.</p>
                      <p className="text-xs font-black text-amber-400">{lastReadjustmentResult.unrouted}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setAllRoutesMapOpen(true)} title="Ver diagnóstico geográfico Orbit IQ" className="p-1.5 hover:bg-indigo-500/20 rounded-lg transition-all">
                  <Icons.MapPin className="w-3.5 h-3.5 text-indigo-400" />
                </button>
                <button onClick={() => setLastReadjustmentResult(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                  <Icons.X className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Banner Sin Ruta independiente cuando aún no hay plan generado */}
      {!routePlanKPIs && unassignedMetrics.count > 0 && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 p-2 px-4 rounded-[1.5rem] animate-in slide-in-from-top duration-500 shadow-sm ml-auto">
          <div className="flex flex-col border-r border-rose-200 pr-3">
            <p className="text-[6px] font-black text-rose-500 uppercase tracking-widest">Sin Ruta</p>
            <p className="text-xs font-black text-rose-900 leading-none">{unassignedMetrics.count} <span className="text-[8px] font-bold text-slate-400">FACTS</span></p>
          </div>
          <div className="flex flex-col border-r border-rose-200 px-3">
            <p className="text-[6px] font-black text-rose-500 uppercase tracking-widest">Volumen</p>
            <p className="text-xs font-black text-rose-900 leading-none">{unassignedMetrics.volume}m³</p>
          </div>
          <button onClick={() => setIsPendingInvoicesModalOpen(true)}
            className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-rose-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-md active:scale-95 whitespace-nowrap">
            <Icons.Truck className="w-3.5 h-3.5" />
            VER PENDIENTES
          </button>
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

            <div className="flex flex-col gap-3">
              {/* Lista de Rutas Filtrada */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pb-10">
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
                            {(routeDistancesKm.get(route.id) ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 ml-1 mt-1 px-2 py-0.5 bg-blue-500/20 rounded-full text-[7px] text-blue-300 font-bold">
                                {routeDistancesKm.get(route.id)} km
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-black text-white">
                              <span className={(Number(route.totalVolume) || 0) > (Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) || 30) ? 'text-red-400' : 'text-emerald-400'}>
                                {(Number(route.totalVolume) || 0).toFixed(2)}
                              </span>
                              <span className="text-slate-500 mx-1">/</span>
                              {(Number(route.vehicle.capacityM3 || (route.vehicle as any).capacity_m3) || 0).toFixed(2)}m³
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
                            onClick={() => setAddInvoiceModal({ isOpen: true, routeIndex: rIdx, tab: 'plan' })}
                            className="w-8 h-8 bg-white/10 hover:bg-emerald-500 rounded-lg flex items-center justify-center transition-all"
                            title="Agregar Factura Manual"
                          >
                            <Icons.Plus className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[260px] bg-slate-50/30">
                        <table className="w-full text-[9px]">
                          <thead className="sticky top-0 bg-slate-100 z-10">
                            <tr>
                              <th className="text-left pl-3 py-1.5 font-black text-slate-500 uppercase tracking-wide w-6">#</th>
                              <th className="text-left pl-2 py-1.5 font-black text-slate-500 uppercase tracking-wide">Factura / Cliente</th>
                              <th className="text-left py-1.5 font-black text-slate-500 uppercase tracking-wide hidden sm:table-cell">Dirección</th>
                              <th className="text-right pr-1 py-1.5 font-black text-slate-500 uppercase tracking-wide">m³</th>
                              <th className="text-right pr-1 py-1.5 font-black text-slate-500 uppercase tracking-wide">Hora</th>
                              <th className="pr-2 py-1.5 w-14"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {route.assignedInvoices.map((inv, iIdx) => {
                              const isPriority = (inv as any).isPriority;
                              const estimatedArrival = estimateStopArrival(iIdx);
                              const hasTimeWindow = !!(inv as any).detectedTime;
                              const urg = hasTimeWindow ? getTimeWindowUrgency((inv as any).timeWindowMinutes) : null;
                              return (
                                <tr key={`${inv.id}-${iIdx}`} className={`border-b border-slate-100 hover:bg-white transition-colors ${isPriority ? 'bg-amber-50/60' : ''}`}>
                                  <td className="pl-3 py-1.5">
                                    <div className={`w-5 h-5 ${isPriority ? 'bg-amber-500' : 'bg-slate-800'} text-white rounded-md flex items-center justify-center font-black text-[8px]`}>{iIdx + 1}</div>
                                  </td>
                                  <td className="pl-2 py-1.5 max-w-0">
                                    <p className="font-black text-slate-900 truncate">{inv.invoiceNumber}</p>
                                    <p className="text-slate-400 font-bold truncate">{inv.customerName}</p>
                                  </td>
                                  <td className="py-1.5 max-w-0 hidden sm:table-cell">
                                    <p className="text-slate-500 font-bold truncate">{inv.address}</p>
                                    <p className="text-slate-400 truncate">{inv.city}</p>
                                  </td>
                                  <td className="text-right pr-1 py-1.5 font-black text-emerald-600 whitespace-nowrap">{(Number(inv.volumeM3) || 0).toFixed(1)}</td>
                                  <td className="text-right pr-1 py-1.5 whitespace-nowrap">
                                    {urg ? (
                                      <span className={`px-1 py-0.5 rounded font-black text-[7px] ${urg === 'critical' ? 'bg-red-100 text-red-600' : urg === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                        {(inv as any).detectedTime}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-bold">{estimatedArrival}</span>
                                    )}
                                  </td>
                                  <td className="pr-2 py-1.5">
                                    <div className="flex gap-1 justify-end">
                                      <button onClick={() => setSelectedInvoiceDetail(inv)} className="w-5 h-5 bg-indigo-50 text-indigo-400 rounded hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center" title="Ver detalle">
                                        <Icons.Eye className="w-3 h-3" />
                                      </button>
                                      <button onClick={() => handleAuditAction('REMOVE', rIdx, inv)} className="w-5 h-5 bg-rose-50 text-rose-400 rounded hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center" title="Remover">
                                        <Icons.X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
        const routeInvCount = activeRoute?.assignedInvoices?.length ?? 0;
        const routeVolUsed = activeRoute?.assignedInvoices?.reduce((s, i) => s + (Number(i.volumeM3) || 0), 0) ?? 0;
        const vehicleCapacity = Number((activeRoute?.vehicle as any)?.capacityM3 || (activeRoute?.vehicle as any)?.capacity_m3 || 0);
        const plate = (activeRoute?.vehicle as any)?.plate || '—';
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
                      <p className="text-[10px] font-bold text-slate-500 uppercase">{addInvoiceModal.tab === 'plan' ? 'Seleccione una factura pendiente' : 'Factura de repice (no está en el plan)'}</p>
                    </div>
                  </div>
                  <button onClick={() => { setAddInvoiceModal({ isOpen: false, routeIndex: null, tab: 'plan' }); setModalSearchTerm(''); }} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
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

                {/* Tabs: Plan / Repice */}
                <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
                  <button
                    onClick={() => setAddInvoiceModal(m => ({ ...m, tab: 'plan' }))}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${addInvoiceModal.tab === 'plan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    📋 Del Plan
                  </button>
                  <button
                    onClick={() => setAddInvoiceModal(m => ({ ...m, tab: 'repice' }))}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${addInvoiceModal.tab === 'repice' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    ⚡ Repice
                  </button>
                </div>

                <div className="relative">
                  <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                  <input
                    ref={addInvoiceInputRef}
                    autoFocus
                    type="text"
                    placeholder={addInvoiceModal.tab === 'plan' ? 'Buscar por factura, cliente o pedido...' : 'Buscar factura de repice por número...'}
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
                          (inv.orderNumber || '').toLowerCase().includes(term)
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
                  // Para repice: solo facturas en estado EST-15 que NO estén ya en otra ruta activa
                  const pool = addInvoiceModal.tab === 'repice'
                    ? invoices.filter(inv => {
                      const status = String((inv as any).status || (inv as any).item_status || '').toUpperCase();
                      if (status !== 'EST-15' && status !== 'REPICE') return false;
                      
                      // EXCLUSIÓN CRÍTICA: No mostrar si ya está en una ruta activa confirmada
                      const activeConfirmedIds = new Set(activeRoutes.flatMap(r => r.invoiceIds || (r as any).invoice_ids || []));
                      if (activeConfirmedIds.has(inv.id)) return false;

                      const term = modalSearchTerm.toLowerCase().trim();
                      if (!term || term.length < 2) return true;
                      return (inv.invoiceNumber || '').toLowerCase().includes(term) ||
                        (inv.customerName || '').toLowerCase().includes(term) ||
                        (inv.orderNumber || '').toLowerCase().includes(term);
                    })
                    : unassignedInvoices;

                  const filtered = addInvoiceModal.tab === 'repice' ? pool : pool.filter(inv => {
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
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                          {addInvoiceModal.tab === 'repice'
                            ? 'No hay facturas en estado Repice (EST-15)'
                            : 'Sin resultados para tu búsqueda'}
                        </p>
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
                            {addInvoiceModal.tab === 'repice' && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black uppercase border border-amber-300 animate-pulse">
                                ⚡ REPICE
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${String(documents.find(d => d.id === inv.docLId)?.planType || '').toUpperCase().includes('PLAN R') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
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

                  // Solo excluir documentos en estado terminal (eliminado, entregado, anulado)
                  const terminalDocStatuses = new Set(['est-16','est-12','est-07','est-17','eliminado','anulado','entregado']);
                  validInvoices.forEach(inv => {
                    if (!inv.docLId) return;

                    const doc = documents.find(d => d.id === inv.docLId);
                    if (doc && terminalDocStatuses.has(String(doc.status || '').toLowerCase())) return;
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
                    entry.volume += Number(inv.volumeM3 || (inv as any).volume_m3 || 0);
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
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${String(planType).toUpperCase().includes('PLAN R') || planType.includes('(R)') ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
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

      {allRoutesMapOpen && (
        <div className="fixed inset-0 z-[800] bg-slate-950/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Icons.MapPin className="w-4 h-4 text-slate-950" />
              </div>
              <div>
                <p className="text-white font-black text-sm uppercase tracking-tight">Diagnóstico Geográfico — Orbit IQ</p>
                <p className="text-slate-400 text-[10px] font-bold uppercase">{suggestedRoutes.length} rutas · {suggestedRoutes.reduce((a, r) => a + r.assignedInvoices.length, 0)} facturas · <span className="text-amber-400">⚠ punto naranja = coord. aproximada</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {['#6366f1','#f43f5e','#f59e0b','#10b981','#06b6d4','#8b5cf6','#f97316','#22c55e','#3b82f6','#ec4899'].slice(0, suggestedRoutes.length).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: `${c}20`, border: `1px solid ${c}40` }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span className="text-[9px] font-black" style={{ color: c }}>{suggestedRoutes[i]?.vehicle.plate}</span>
                </div>
              ))}
              <button onClick={() => setAllRoutesMapOpen(false)} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all ml-2">
                <Icons.X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <div id="all-routes-map" className="absolute inset-0 w-full h-full" />
          </div>
        </div>
      )}

      {/* Modal Vista Previa de Ruta en Mapa */}
      {routeMapModal.isOpen && routeMapModal.route && (
        <div className="fixed inset-0 z-[700] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden" style={{ height: 'min(90vh, 680px)' }}>
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
                    {routeMapModal.route.city} · {(routeMapModal.route.vehicle as any).driverName || 'S/C'} · {routeMapModal.route.assignedInvoices.length} paradas{routeMapStats ? ` · ${routeMapStats.km}km · ${routeMapStats.minutes}min` : ''}
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

            {/* Map + Stop list: fila siempre, mapa a la izquierda, lista a la derecha */}
            <div className="flex flex-row flex-1 overflow-hidden min-h-0">
              {/* Wrapper relativo: le da dimensiones reales a Leaflet */}
              <div className="flex-1 relative min-h-0" style={{ minHeight: 300 }}>
                <div id="route-preview-map" style={{ position: 'absolute', inset: 0 }} />
              </div>

              {/* Stop list — panel derecho siempre visible con scroll */}
              <div className="w-56 shrink-0 overflow-y-auto custom-scrollbar bg-slate-50 border-l border-slate-100 p-3 space-y-2">
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

      {/* Modal Horarios de Entrega por Día de Semana */}
      {scheduleModal && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-sky-50 rounded-t-[2.5rem]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white text-sky-600 rounded-2xl flex items-center justify-center shadow-md">
                  <Icons.Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tighter">Horarios de Entrega</h3>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Ventanas de tiempo por cliente y día</p>
                </div>
              </div>
              <button onClick={() => setScheduleModal(false)} className="w-9 h-9 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                <Icons.X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-5">
              {/* Formulario de nuevo horario */}
              <div className="bg-sky-50 rounded-2xl p-4 flex flex-col gap-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-sky-700">Agregar horario</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] font-black uppercase text-slate-400">Cliente / Destinatario</label>
                    <input
                      value={scheduleForm.customerName}
                      onChange={e => setScheduleForm(f => ({ ...f, customerName: e.target.value }))}
                      placeholder="Nombre del cliente..."
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400/30 focus:border-sky-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] font-black uppercase text-slate-400">Ciudad</label>
                    <input
                      value={scheduleForm.city}
                      onChange={e => setScheduleForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="Ciudad..."
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400/30 focus:border-sky-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] font-black uppercase text-slate-400">Día de semana</label>
                    <select
                      value={scheduleForm.dayOfWeek}
                      onChange={e => setScheduleForm(f => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                    >
                      {['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] font-black uppercase text-slate-400">Hora límite (HH:MM)</label>
                    <input
                      type="time"
                      value={scheduleForm.closeTime}
                      onChange={e => setScheduleForm(f => ({ ...f, closeTime: e.target.value }))}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-black uppercase text-slate-400">Etiqueta (opcional)</label>
                  <input
                    value={scheduleForm.label}
                    onChange={e => setScheduleForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Ej: Solo mañanas, Antes del mediodía..."
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400/30 focus:border-sky-400"
                  />
                </div>
                <button
                  disabled={scheduleSaving || !scheduleForm.customerName.trim() || !scheduleForm.closeTime}
                  onClick={async () => {
                    if (!selectedClient) return;
                    setScheduleSaving(true);
                    try {
                      await api.upsertDeliverySchedule({
                        clientId: selectedClient,
                        customerName: scheduleForm.customerName.trim(),
                        city: scheduleForm.city.trim(),
                        dayOfWeek: scheduleForm.dayOfWeek,
                        closeTime: scheduleForm.closeTime,
                        label: scheduleForm.label.trim() || undefined,
                      });
                      const updated: any[] = await api.getDeliverySchedules(selectedClient);
                      if (Array.isArray(updated)) setDeliverySchedules(updated);
                      setScheduleForm(f => ({ ...f, customerName: '', city: '', label: '' }));
                    } catch { /* non-critical */ }
                    finally { setScheduleSaving(false); }
                  }}
                  className="self-end px-5 py-2 bg-sky-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-sky-400 transition-all active:scale-95 disabled:opacity-40"
                >
                  {scheduleSaving ? '...' : '+ Guardar Horario'}
                </button>
              </div>

              {/* Lista de horarios existentes */}
              {deliverySchedules.length === 0 ? (
                <p className="text-center text-xs text-slate-400 font-semibold py-4">Sin horarios configurados</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((dayName, dow) => {
                    const daySchedules = deliverySchedules.filter(s => s.day_of_week === dow);
                    if (daySchedules.length === 0) return null;
                    return (
                      <div key={dow}>
                        <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">{dayName}</p>
                        {daySchedules.map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 mb-1">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-800">{s.customer_name}</span>
                              <span className="text-[9px] text-slate-500">{s.city} · hasta {s.close_time}{s.label ? ` · ${s.label}` : ''}</span>
                            </div>
                            <button
                              onClick={async () => {
                                await api.deleteDeliverySchedule(s.id).catch(() => {});
                                setDeliverySchedules(prev => prev.filter((x: any) => x.id !== s.id));
                              }}
                              className="w-6 h-6 bg-rose-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
                            >
                              <Icons.X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Drawer de Agrupamiento Histórico de Facturas */}
      <HistoricoGrouping
        isOpen={historicoModalOpen}
        onClose={() => setHistoricoModalOpen(false)}
        pendingInvoices={unassignedInvoices}
        vehicles={vehicles}
        clientId={selectedClient}
        onApplyGrouping={handleApplyHistoricalGrouping}
      />

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
      {/* Modal Facturas Pendientes */}
      {isPendingInvoicesModalOpen && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-[98vw] h-[95vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-rose-50 rounded-t-[2rem] shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white text-rose-600 rounded-2xl flex items-center justify-center shadow-md">
                  <Icons.FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Facturas Pendientes de Ruta</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Listado total de facturas aptas para despacho</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={exportPendingInvoices}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95"
                >
                  <Icons.Download className="w-4 h-4" />
                  Exportar Excel
                </button>
                <button onClick={() => setIsPendingInvoicesModalOpen(false)} className="w-9 h-9 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                  <Icons.X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="relative">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input
                  autoFocus
                  type="text"
                  value={pendingInvoicesSearch}
                  onChange={(e) => setPendingInvoicesSearch(e.target.value.toUpperCase())}
                  placeholder="Buscar por factura, placa o documento..."
                  className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-rose-400 transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar p-0">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                  <tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Doc. L</th>
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Fecha Entrega</th>
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Placa</th>
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Factura</th>
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Cliente</th>
                    <th className="px-4 py-3 text-center text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Art.</th>
                    <th className="px-4 py-3 text-right text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Volumen</th>
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">F. Carga</th>
                    <th className="px-4 py-3 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Usuario</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-50">
                  {(() => {
                    const query = (pendingInvoicesSearch || '').toUpperCase();
                    const filtered = unassignedInvoices.filter(inv => {
                      const doc = documents.find(d => d.id === inv.docLId);
                      const searchStr = `${inv.invoiceNumber} ${doc?.externalDocId} ${doc?.vehicleData} ${inv.customerName}`.toUpperCase();
                      return searchStr.includes(query);
                    });

                    return (
                      <>
                        {filtered.map((inv) => {
                          const doc = documents.find(d => d.id === inv.docLId);
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-4 py-2">
                                <span className="text-[9px] font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded-lg uppercase">{doc?.externalDocId || inv.docLId}</span>
                              </td>
                              <td className="px-4 py-2 text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
                                {doc?.deliveryDate ? new Date(doc.deliveryDate).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-lg uppercase">{doc?.vehicleData || 'N/A'}</span>
                              </td>
                              <td className="px-4 py-2 text-[9px] font-black text-slate-900">{inv.invoiceNumber}</td>
                              <td className="px-4 py-2 min-w-[150px]">
                                <p className="text-[9px] font-black text-slate-700 truncate max-w-[200px] uppercase">{inv.customerName}</p>
                                <p className="text-[7px] text-slate-400 font-bold uppercase">{inv.city}</p>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className="text-[9px] font-black text-slate-600 bg-slate-50 w-6 h-6 rounded-full flex items-center justify-center mx-auto border border-slate-100">
                                  {inv.items?.length || 0}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className="text-[9px] font-black text-emerald-600">{(Number(inv.volumeM3) || 0).toFixed(3)}m³</span>
                              </td>
                              <td className="px-4 py-2 text-[8px] font-bold text-slate-400 uppercase whitespace-nowrap">
                                {doc?.createdAt ? new Date(doc.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td className="px-4 py-2 text-[8px] font-black text-slate-500 uppercase truncate max-w-[80px]">
                                {doc?.createdBy || doc?.inventoryUser || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })()}
                </tbody>
              </table>
              {(() => {
                const query = (pendingInvoicesSearch || '').toUpperCase();
                const filtered = unassignedInvoices.filter(inv => {
                  const doc = documents.find(d => d.id === inv.docLId);
                  const searchStr = `${inv.invoiceNumber} ${doc?.externalDocId} ${doc?.vehicleData} ${inv.customerName}`.toUpperCase();
                  return searchStr.includes(query);
                });
                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                      <Icons.Audit className="w-12 h-12 opacity-20 mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        {unassignedInvoices.length === 0 ? "No hay facturas pendientes" : "No se encontraron coincidencias"}
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="p-6 bg-slate-900 border-t border-slate-800 shrink-0 flex justify-between items-center">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                {(() => {
                  const query = (pendingInvoicesSearch || '').toUpperCase();
                  const filteredCount = unassignedInvoices.filter(inv => {
                    const doc = documents.find(d => d.id === inv.docLId);
                    const searchStr = `${inv.invoiceNumber} ${doc?.externalDocId} ${doc?.vehicleData} ${inv.customerName}`.toUpperCase();
                    return searchStr.includes(query);
                  }).length;
                  return `Mostrando ${filteredCount} de ${unassignedInvoices.length} facturas`;
                })()}
              </p>
              <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest animate-pulse">
                Sincronización en tiempo real activa
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;
