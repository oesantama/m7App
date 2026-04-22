
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { cleanSkuM7 } from '../utils/scanner';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { Route, Invoice } from '../types';
import DeliveryHistoryModal from './Logistics/DeliveryHistoryModal';
import CustomerDeliveryModal from './Logistics/CustomerDeliveryModal';
import DispatchControlModal from './Logistics/DispatchControlModal';
import SignatureInputModal from './Logistics/SignatureInputModal';
import GenericConfirmModal from './Logistics/GenericConfirmModal';
import PaymentVoucherModal from './Logistics/PaymentVoucherModal';
import ReturnsControlModal from './Logistics/ReturnsControlModal';
import ConciliacionModal from '../Logistics/ConciliacionModal';

interface LogisticsDispatchProps {
    user: any;
    selectedClient: string;
    vehicles: any[];
    drivers: any[];
    assignments: any[];
    invoices: Invoice[];
    activeRoutes: Route[];
    onRefresh: () => void;
    clients?: any[];
}

const M7_HUB_ORIGIN = {
    lat: 6.110595,
    lng: -75.641505,
    address: "CR 48C N°100 Sur - 72 Bodega 4 y 10, La Tablaza"
};

const LogisticsDispatch: React.FC<LogisticsDispatchProps> = ({
    user,
    selectedClient,
    vehicles,
    drivers,
    assignments,
    invoices,
    activeRoutes,
    onRefresh,
    clients = []
}) => {
    const [selectedActiveRoute, setSelectedActiveRoute] = useState<Route | null>(null);
    const [visualizedRoute, setVisualizedRoute] = useState<Route | null>(null);
    const [routeInvoices, setRouteInvoices] = useState<any[]>([]);
    
    // MODALES Y FLUJO DE ASIGNACIÓN
    const [viewingItemsInvoice, setViewingItemsInvoice] = useState<any | null>(null);
    const [assigningInvoice, setAssigningInvoice] = useState<any | null>(null);
    const [scannedItems, setScannedItems] = useState<Record<string, number>>({});
    const [isAccompanied, setIsAccompanied] = useState(false);
    const [helperCount, setHelperCount] = useState(1);
    const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);
    const [pendingSignatures, setPendingSignatures] = useState<any[]>([]);
    // All unsigned signatures for each invoice (keyed by invoiceId) — used to block ENTREGAR
    const [invoiceAllPending, setInvoiceAllPending] = useState<Record<string, any[]>>({});
    // IDs of invoices dispatched this session — bulletproof guard against any stale-data overwrite
    const [dispatchedIds, setDispatchedIds] = useState<Set<string>>(new Set());
    const routeInvoicesCache = useRef<Map<string, { data: any[]; ts: number }>>(new Map());
    const CACHE_TTL = 60_000; // 60 segundos
    const [signatureKeys, setSignatureKeys] = useState<Record<string, string>>({});
    const [signNowMap, setSignNowMap] = useState<Record<string, boolean>>({});
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Control colapsable
    const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");

    // ── Client selector ──────────────────────────────────────────────────────
    const [internalClientId, setInternalClientId] = useState<string>('');
    const [filteredClients, setFilteredClients] = useState<any[]>([]);
    const [clientsReady, setClientsReady] = useState(false);

    const [vehicleLocations, setVehicleLocations] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
    const [isValidating, setIsValidating] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isReassigningPlate, setIsReassigningPlate] = useState(false);

    // MEJORA: Filtrar flota disponible (misma lógica que RoutePlanner para consistencia)
    const availableVehicles = useMemo(() => {
        const activeLinks = assignments.filter(a => {
            const active = a.isActive !== undefined ? a.isActive : (a as any).is_active;
            const cId = a.clientId || (a as any).client_id;
            const currentClientId = internalClientId || user.clientId || (user as any).client_id || 'CLI-01';
            return active && String(cId) === String(currentClientId);
        });

        return activeLinks.map(link => {
            const linkVId = link.vehicleId || (link as any).vehicle_id;
            const linkDId = link.driverId || (link as any).driver_id;
            const v = vehicles.find(veh => String(veh.id) === String(linkVId));
            const d = drivers.find(drv => String(drv.id) === String(linkDId));

            if (!v || !d) return null;

            return {
                ...v,
                driverName: d.name,
                driverId: d.id,
                assignmentId: link.id
            };
        }).filter(item => item !== null) as (any)[];
    }, [assignments, vehicles, drivers, user.clientId]);

    const [showReassignModal, setShowReassignModal] = useState<{ isOpen: boolean; route: any }>({ isOpen: false, route: null });
    const [reassignData, setReassignData] = useState({ newVehicleId: '', observations: '' });
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [vehicleDropOpen, setVehicleDropOpen] = useState(false);
    const [reassignTab, setReassignTab] = useState<'placa' | 'factura'>('placa');
    const [modalRouteInvoices, setModalRouteInvoices] = useState<any[]>([]);
    const [loadingModalInvoices, setLoadingModalInvoices] = useState(false);
    const [selectedInvoicesToRemove, setSelectedInvoicesToRemove] = useState<Set<string>>(new Set());
    const [unassignObs, setUnassignObs] = useState('');
    const [isUnassigning, setIsUnassigning] = useState(false);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<{ [key: string]: L.Marker }>({});
    const routeLinesRef = useRef<{ [key: string]: L.Polyline }>({});
    const routeMarkersRef = useRef<L.Marker[]>([]);
    const routePolylineRef = useRef<L.Polyline | null>(null);
    const [fetchStatus, setFetchStatus] = useState<string>('IDLE');
    
    // MODALES DE INTERACCIÓN MEJORADA
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);
    const [signatureInputModal, setSignatureInputModal] = useState<{ isOpen: boolean, invoice: any, role?: string, onConfirm: (pass: string) => void } | null>(null);

    // ENTREGA AL CLIENTE
    const [deliveryModal, setDeliveryModal] = useState<{
        isOpen: boolean;
        invoice: any;
        route: any;
    } | null>(null);
    const [deliveryType, setDeliveryType] = useState<'FULL' | 'PARTIAL' | 'RETURN' | 'REPICE'>('FULL');
    const [repiceDestination, setRepiceDestination] = useState<'BODEGA' | 'SAME_PLATE'>('BODEGA');
    const [deliveryItems, setDeliveryItems] = useState<any[]>([]);
    const [deliveryNotes, setDeliveryNotes] = useState('');
    const [deliveryReturnReason, setDeliveryReturnReason] = useState('');
    const [deliveryPassword, setDeliveryPassword] = useState('');
    const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);
    const [voucherModal, setVoucherModal]   = useState<{ isOpen: boolean; invoice: any } | null>(null);
    const [showReturnsModal, setShowReturnsModal] = useState(false);
    const [routeSearch, setRouteSearch]     = useState('');
    const [showMap, setShowMap]             = useState(false);
    const drawMapRunRef = useRef<number>(0); // cancel concurrent drawRouteOnMap calls
    const [mapRouteInfo, setMapRouteInfo] = useState<{
        plate: string; driverName: string;
        stops: { invNum: string; customer: string; items: number; estMin: number }[];
        distanceKm: number; drivingMin: number; totalDeliveryMin: number;
    } | null>(null);

    // TAB HISTORIAL
    const [historyTab, setHistoryTab] = useState<'ENTREGAS' | 'DEVOLUCIONES'>('ENTREGAS');
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyFilters, setHistoryFilters] = useState({
        invoiceId: '', driverId: '', vehicleId: '', dateFrom: '', dateTo: '', deliveryType: '', status: ''
    });

    // ── Load filtered clients via API (same pattern as other pages) ──────────
    useEffect(() => {
        const allowedIds: string[] = (user as any)?.clientIds?.length
            ? (user as any).clientIds
            : user?.clientId ? [user.clientId] : [];
        api.getClients().then((all: any[]) => {
            const isAdmin = allowedIds.length === 1 && allowedIds[0] === 'CLI-01';
            const filtered = isAdmin || allowedIds.length === 0
                ? all
                : all.filter((c: any) => allowedIds.includes(c.id));
            setFilteredClients(filtered);
            if (filtered.length === 1) setInternalClientId(filtered[0].id);
            setClientsReady(true);
        }).catch(() => setClientsReady(true));
    }, [user]);

    // 1. Inicialización del Mapa
    useEffect(() => {
        if (!mapRef.current) {
            const container = document.getElementById('logistics-dispatch-map');
            if (container) {
                mapRef.current = L.map('logistics-dispatch-map', {
                    zoomControl: false,
                    attributionControl: false
                }).setView([6.110595, -75.641505], 12);

                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    maxZoom: 20
                }).addTo(mapRef.current);

                L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

                // Agregar marcador del HUB M7 con diseño estático pero elegante
                const hubIcon = L.divIcon({
                    className: 'custom-hub-marker',
                    html: `
                        <div class="relative group">
                            <div class="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center border-2 border-emerald-500 shadow-2xl transition-transform group-hover:scale-110">
                                <span class="text-emerald-500 font-black text-[10px]">M7</span>
                            </div>
                            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-emerald-500 rounded-full"></div>
                        </div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                });

                L.marker([M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng], { icon: hubIcon })
                    .addTo(mapRef.current)
                    .bindPopup(`
                        <div class="p-3 font-inter">
                            <p class="text-xs font-black uppercase text-emerald-600">🏢 HUB M7</p>
                            <p class="text-[10px] text-slate-600 mt-1">${M7_HUB_ORIGIN.address}</p>
                        </div>
                    `);
            }
        }

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // 2. Cargar Ubicaciones GPS
    const fetchLocations = async () => {
        setIsValidating(true);
        try {
            const res = await api.getLatestVehicleLocations();
            if (Array.isArray(res)) {
                setVehicleLocations(res);
                updateMarkers(res);
            }
        } catch (error) {
            console.error('[M7-GPS-FETCH-ERR]', error);
            toast.error("Error al obtener ubicaciones GPS");
        } finally {
            setIsValidating(false);
        }
    };

    const updateMarkers = (locations: any[]) => {
        if (!mapRef.current) return;

        // Limpiar marcadores antiguos
        const currentIds = new Set(locations.map(l => l.vehicle_id));
        Object.keys(markersRef.current).forEach(id => {
            if (!currentIds.has(id)) {
                markersRef.current[id].remove();
                delete markersRef.current[id];
            }
        });

        // Limpiar rutas antiguas
        Object.keys(routeLinesRef.current).forEach(id => {
            if (!currentIds.has(id)) {
                routeLinesRef.current[id].remove();
                delete routeLinesRef.current[id];
            }
        });

        const activePoints: L.LatLng[] = [];

        locations.forEach(loc => {
            const pos: [number, number] = [Number(loc.latitude), Number(loc.longitude)];
            activePoints.push(L.latLng(pos));

            // Actualizar o crear marcador
            if (markersRef.current[loc.vehicle_id]) {
                markersRef.current[loc.vehicle_id].setLatLng(pos);
            } else {
                const customIcon = L.divIcon({
                    className: 'custom-m7-marker',
                    html: `
                        <div class="relative group">
                            <div class="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center border border-emerald-500 shadow-lg transform -rotate-45 transition-transform group-hover:scale-110">
                                <span class="text-emerald-500 font-black text-[9px] transform rotate-45">${loc.plate || 'N/A'}</span>
                            </div>
                            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                        </div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                });

                const speedKmh = loc.speed ? (loc.speed * 3.6).toFixed(0) : '0';
                const lastUpdate = new Date(loc.updated_at).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                markersRef.current[loc.vehicle_id] = L.marker(pos, { icon: customIcon })
                    .addTo(mapRef.current!)
                    .bindPopup(`
                        <div class="p-3 font-inter min-w-[200px]">
                            <p class="text-[10px] font-black uppercase text-slate-400">VEHÍCULO EN RUTA</p>
                            <p class="text-lg font-black text-slate-950">${loc.plate || 'N/A'}</p>
                            <div class="h-px bg-slate-100 my-2"></div>
                            <div class="space-y-1">
                                <div class="flex justify-between items-center">
                                    <p class="text-[8px] font-bold text-slate-500">VELOCIDAD:</p>
                                    <p class="text-xs font-black text-emerald-600">${speedKmh} km/h</p>
                                </div>
                                <div class="flex justify-between items-center">
                                    <p class="text-[8px] font-bold text-slate-500">ÚLTIMA SEÑAL:</p>
                                    <p class="text-xs font-black text-slate-700">${lastUpdate}</p>
                                </div>
                                ${loc.accuracy ? `
                                <div class="flex justify-between items-center">
                                    <p class="text-[8px] font-bold text-slate-500">PRECISIÓN:</p>
                                    <p class="text-xs font-black text-slate-700">±${Math.round(loc.accuracy)}m</p>
                                </div>` : ''}
                            </div>
                        </div>
                    `);
            }

            // Dibujar ruta desde HUB al vehículo
            const routeCoords: [number, number][] = [
                [M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng],
                pos
            ];

            if (routeLinesRef.current[loc.vehicle_id]) {
                routeLinesRef.current[loc.vehicle_id].setLatLngs(routeCoords);
            } else {
                routeLinesRef.current[loc.vehicle_id] = L.polyline(routeCoords, {
                    color: '#10b981',
                    weight: 3,
                    opacity: 0.7,
                    dashArray: '10, 10',
                    className: 'route-line-animated'
                }).addTo(mapRef.current!);
            }
        });

        // Ajustar vista del mapa solo si no hay interacción del usuario o es la primera carga
        if (activePoints.length > 0 && mapRef.current) {
            activePoints.push(L.latLng([M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng]));
            const bounds = L.latLngBounds(activePoints);

            // Solo auto-ajustar si el mapa no ha sido movido manualmente por el usuario en los últimos 10s
            // Por ahora, lo dejamos como una opción o solo la primera vez para evitar saltos (lag visual)
            if (!markersRef.current['init_view']) {
                mapRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
                markersRef.current['init_view'] = true as any;
            }
        }
    };

    const generateRoutePDF = async (routeData: any) => {
        setIsGeneratingPDF(true);
        try {
            // 1. Preparar datos (buscar facturas reales)
            const rawIds = routeData.invoice_ids || routeData.invoiceIds || [];
            const targetIds = rawIds.map((id: any) => {
                const val = typeof id === 'object' && id !== null ? (id.id || id.invoice_id) : id;
                return cleanId(val);
            });

            // [M7-FIX] Si las facturas no están en la lista local, las descargamos de la API
            let routeInvList = (invoices || []).filter(inv => {
                const invId = cleanId(inv.id);
                const invNum = cleanId(inv.invoiceNumber);
                return targetIds.includes(invId) || targetIds.includes(invNum);
            });

            if (routeInvList.length === 0 && targetIds.length > 0) {
                console.log(`[M7-PDF] Facturas no encontradas localmente. Descargando ${targetIds.length} facturas...`);
                try {
                    const freshInvoices = await api.getInvoices(routeData.client_id, targetIds.join(','));
                    if (Array.isArray(freshInvoices) && freshInvoices.length > 0) {
                        routeInvList = freshInvoices;
                    }
                } catch (err) {
                    console.error('[M7-PDF] Error descargando facturas faltantes:', err);
                }
            }

            if (routeInvList.length === 0) {
                toast.error("No se encontraron facturas para esta ruta en el servidor");
                setIsGeneratingPDF(false);
                return;
            }

            const despachador = user.name || 'SISTEMA ORBIT';
            const driverName = String(routeData.driver_name || 'Conductor');
            // Obtener nombre del cliente desde las facturas cargadas en el componente
            const currentClient = invoices.find((c: any) => String(c.clientId || c.client_id) === String(routeData.client_id));
            const clientName = currentClient?.customerName || currentClient?.client_name || 'CLIENTE GENERAL';
            const dateStr = new Date().toLocaleDateString('es-CO');
            const fileName = `PLANILLA-${routeData.plate || 'RUTA'}-${dateStr.replace(/\//g, '')}.pdf`;

            // 2. Inicializar jsPDF
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
                ['DOC L', String(routeInvList[0]?.docLId || 'S/N')],
                ['FECHA', dateStr],
                ['VEHICULO', String(routeData.plate || 'N/A')],
                ['CONDUCTOR', driverName.substring(0, 18)],
                ['FACTURAS', String(routeInvList.length)],
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

            // ── PAYMENT SECTION (RECUADRO DE RECAUDO) ────────────────────────────────
            const bankW = Math.floor(CW * 0.62);
            const totW = CW - bankW - 3;
            const totX = ML + bankW + 3;

            autoTable(pdf, {
                startY: y, margin: { left: ML }, tableWidth: bankW,
                head: [['BANCO', 'VALOR', 'COMPROBANTE', 'FECHA']],
                body: [['','','',''],['','','',''],['','','','']],
                styles: { fontSize: 6, cellPadding: 1.5, minCellHeight: 5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
                headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', fontSize: 6, lineWidth: 0.1, lineColor: [0, 0, 0] },
                theme: 'grid',
                margin: { bottom: 28 }
            });
            const bankEndY = (pdf as any).lastAutoTable.finalY;

            const fmtCOP = (v: number) => `$ ${v.toLocaleString('es-CO')}`;
            const cashTotal = routeInvList.reduce((acc, inv) => {
                const m = String(inv.paymentMethod || inv.items?.[0]?.paymentMethod || 'EF').toUpperCase();
                return (m === 'EF' || m === 'CONTADO' || m === 'EFECTIVO') ? acc + (Number(inv.invoiceValue) || 0) : acc;
            }, 0);
            const creditTotal = routeInvList.reduce((acc, inv) => {
                const m = String(inv.paymentMethod || inv.items?.[0]?.paymentMethod || '').toUpperCase();
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

            // ── INVOICES TABLE ──────────────────────────────────────────────────────
            autoTable(pdf, {
                startY: y, margin: { left: ML, right: MR },
                head: [['#', 'U.NEG', 'DOC L', 'FACTURA', 'PEDIDO', 'CANT', 'REF', 'VALOR', 'PAG', 'CLIENTE / DIRECCION']],
                body: [...routeInvList]
                    .sort((a, b) => String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || ''), undefined, { numeric: true, sensitivity: 'base' }))
                    .map((inv, idx) => {
                        const firstItem = inv.items?.[0] || {} as any;
                        const method = String(inv.paymentMethod || firstItem.paymentMethod || firstItem.payment_method || '-').toUpperCase();
                        return [
                            String(idx + 1),
                            String(inv.unCode || firstItem.unCode || firstItem.un_code || '-'),
                            String(inv.docLId || '-'),
                            String(inv.invoiceNumber),
                            String(inv.orderNumber || '-'),
                            String(inv.totalItems || '-'),
                            String(inv.clientRef || firstItem.clientRef || firstItem.client_ref || '-'),
                            fmtCOP(inv.invoiceValue || 0),
                            method,
                            `${inv.customerName || ''} · ${inv.address} - ${inv.city}`,
                        ];
                    }),
                styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
                headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', fontSize: 6.5, lineWidth: 0.1, lineColor: [0, 0, 0] },
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
                margin: { bottom: 28 }
            });
            y = (pdf as any).lastAutoTable.finalY + 5;

            // ── CARGO CONSOLIDATION ──────────────────────────────────────────────────
            const cargoMap = new Map<string, { id: string; name: string; total: number }>();
            routeInvList.forEach(inv => {
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
                pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
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
                    startY: y, margin: { left: ML, right: MR },
                    tableWidth: CW, // Forzar el ancho al margen de la tabla superior
                    head: [['ID','CANT','NOTAS','ID','CANT','NOTAS','ID','CANT','NOTAS','ID','CANT','NOTAS']],
                    body: cargoRows,
                    styles: { fontSize: 5.5, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
                    headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', fontSize: 5.5, lineWidth: 0.1, lineColor: [0, 0, 0] },
                    columnStyles: {
                        0:  { cellWidth: 29, halign: 'center' },
                        1:  { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
                        2:  { cellWidth: 12 },
                        3:  { cellWidth: 29, halign: 'center' },
                        4:  { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
                        5:  { cellWidth: 12 },
                        6:  { cellWidth: 29, halign: 'center' },
                        7:  { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
                        8:  { cellWidth: 12 },
                        9:  { cellWidth: 29, halign: 'center' },
                        10: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
                        11: { cellWidth: 12 },
                    },
                    theme: 'grid',
                    margin: { bottom: 28 }
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
                pdf.text(`Página ${i} de ${totalPages} | ORBITM7 Intelligence - ${dateStr} - ${routeData.plate} - ${routeInvList.length} facturas`, PW / 2, PH - 5, { align: 'center' });
            }

            pdf.save(fileName);
        } catch (err: any) {
            console.error('[PDF-GEN-ERR]', err);
            toast.error("Error al generar PDF: " + err.message);
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const loadModalInvoices = async (routeId: string) => {
        setLoadingModalInvoices(true);
        setModalRouteInvoices([]);
        setSelectedInvoicesToRemove(new Set());
        try {
            const res = await api.getRouteInvoices(routeId);
            setModalRouteInvoices(res.data || []);
        } catch { toast.error('Error cargando facturas de la ruta'); }
        finally { setLoadingModalInvoices(false); }
    };

    const handleUnassignInvoices = async () => {
        if (!showReassignModal.route || selectedInvoicesToRemove.size === 0) return;
        if (!unassignObs.trim()) { toast.error('Debe ingresar una observación'); return; }
        setIsUnassigning(true);
        let ok = 0; let fail = 0;
        for (const invoiceId of selectedInvoicesToRemove) {
            try {
                await api.unassignRouteInvoice({
                    routeId: showReassignModal.route.id,
                    invoiceId,
                    observations: unassignObs,
                    userId: user.id,
                });
                ok++;
            } catch { fail++; }
        }
        setIsUnassigning(false);
        if (ok > 0) {
            toast.success(`${ok} factura${ok > 1 ? 's' : ''} liberada${ok > 1 ? 's' : ''} correctamente`);
            setUnassignObs('');
            setSelectedInvoicesToRemove(new Set());
            loadModalInvoices(showReassignModal.route.id);
            onRefresh();
        }
        if (fail > 0) toast.error(`${fail} no se pudieron liberar`);
    };

    const handleReassignPlate = async () => {
        if (!showReassignModal.route || !reassignData.newVehicleId) {
            toast.error("Debe seleccionar un vehículo");
            return;
        }

        setIsReassigningPlate(true);
        try {
            const res = await api.reassignRouteVehicle({
                routeId: showReassignModal.route.id,
                newVehicleId: reassignData.newVehicleId,
                observations: reassignData.observations,
                userId: user.id
            });

            if (res.success) {
                toast.success("Vehículo reasignado exitosamente. Se ha creado una nueva ruta.");
                setShowReassignModal({ isOpen: false, route: null });
                setReassignData({ newVehicleId: '', observations: '' });
                setVehicleSearch('');
                setVehicleDropOpen(false);
                onRefresh();
            } else {
                toast.error(res.error || "Error al reasignar vehículo");
            }
        } catch (err: any) {
            toast.error("Error el servidor: " + err.message);
        } finally {
            setIsReassigningPlate(false);
        }
    };

    // Helper for robust ID matching
    const cleanId = (id: any) => String(id).trim().replace(/[\r\n\t\f\v ]/g, '');

    // Load route invoices — always via direct ids-based API to get fresh statuses
    // (bypasses the status filter that excludes EST-11/12/13/14 from the general invoices list)
    const fetchInvoiceAllPending = async (invList: any[]) => {
        const map: Record<string, any[]> = {};
        await Promise.all(invList.map(async (inv) => {
            const invId = inv.invoiceNumber || inv.id;
            if (!invId) return;
            try {
                const data = await api.getInvoicePendingSignatures(invId);
                map[invId] = Array.isArray(data) ? data : [];
            } catch {
                map[invId] = [];
            }
        }));
        setInvoiceAllPending(prev => ({ ...prev, ...map }));
    };

    const loadRouteInvoicesData = async (route: any, setFn: (data: any[]) => void, drawMap: boolean = false) => {
        const rawIds = route.invoice_ids || route.invoiceIds || [];
        if (!rawIds.length) {
            setFn([]);
            return;
        }

        const idsParam = rawIds.map((id: any) => {
            const val = typeof id === 'object' && id !== null ? (id.id || id.invoice_id) : id;
            return cleanId(val);
        }).join(',');

        // Caché local por ruta — evita refetch innecesario en 60 segundos
        const cached = routeInvoicesCache.current.get(route.id);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            setFn(cached.data);
            if (drawMap) drawRouteOnMap(cached.data);
            fetchInvoiceAllPending(cached.data);
            return;
        }

        setFetchStatus('FETCHING');
        try {
            const paramsData = await api.getInvoices(undefined, idsParam);
            if (Array.isArray(paramsData)) {
                const seen = new Set<string>();
                const deduplicated = paramsData.filter(inv => {
                    const key = cleanId(inv.invoiceNumber || inv.id || '');
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                setFetchStatus(`OK (${deduplicated.length})`);
                routeInvoicesCache.current.set(route.id, { data: deduplicated, ts: Date.now() });
                setFn(deduplicated);
                if (drawMap) drawRouteOnMap(deduplicated);
                fetchInvoiceAllPending(deduplicated);
                return;
            }
            setFetchStatus('ERROR (Invalid Data)');
        } catch (e: any) {
            if (import.meta.env.DEV) console.error('[M7-INVOICES-FALLBACK]', e);
            setFetchStatus(`ERROR: ${e.message}`);
        }

        // Fallback to local match only if API failed
        const targetIds = rawIds.map((id: any) => {
            const val = typeof id === 'object' && id !== null ? (id.id || id.invoice_id) : id;
            return cleanId(val);
        });
        const localMatches = invoices.filter(inv =>
            targetIds.includes(cleanId(inv.id)) || targetIds.includes(cleanId(inv.invoiceNumber))
        );
        setFn(localMatches);
        if (drawMap) drawRouteOnMap(localMatches);
        fetchInvoiceAllPending(localMatches);
    };

    // Geocodifica una dirección a través del BACKEND (proxy para evitar CORS con Nominatim)
    const geocodeAddress = async (inv: any): Promise<{ coords: [number, number]; exact: boolean; cached: boolean } | null> => {
        const city = inv.city || inv.municipio || '';
        const address = inv.address || inv.direccion || inv.customerAddress || inv.shipAddress || '';

        // Coordenadas propias distintas al genérico de Medellín → usar directamente
        if (inv.lat && inv.lng) {
            const lat = Number(inv.lat);
            const lng = Number(inv.lng);
            if (Math.abs(lat - 6.2518) > 0.001 || Math.abs(lng + 75.5636) > 0.001) {
                return { coords: [lat, lng], exact: true, cached: true };
            }
        }

        // Sin dirección ni ciudad → coordenada aproximada de Colombia centro
        if (!address && !city) return { coords: [6.2518, -75.5636], exact: false, cached: true };

        try {
            const data = await api.geocodeAddress({ address: address || '', city: city || '' });
            if (data?.lat && data?.lng) {
                const exact = !data.fallback;
                return { coords: [data.lat as number, data.lng as number], exact, cached: !!data.cached };
            }
        } catch (e) {
            console.warn('[M7-GEO] Error geocoding:', e);
        }
        return { coords: [6.2518, -75.5636], exact: false, cached: false };
    };


    // Algoritmo Nearest-Neighbor para ruta óptima (Greedy TSP)
    const optimizeRouteOrder = (
        origin: [number, number],
        points: { inv: any; coords: [number, number]; exact: boolean }[]
    ) => {
        if (points.length === 0) return [];
        const dist = (a: [number, number], b: [number, number]) =>
            Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));

        const unvisited = [...points];
        const route: typeof points = [];
        let current: [number, number] = origin;

        while (unvisited.length > 0) {
            let minDist = Infinity;
            let nearestIdx = 0;
            unvisited.forEach((p, i) => {
                const d = dist(current, p.coords);
                if (d < minDist) { minDist = d; nearestIdx = i; }
            });
            const nearest = unvisited.splice(nearestIdx, 1)[0];
            route.push(nearest);
            current = nearest.coords;
        }
        return route;
    };

    const drawRouteOnMap = async (data: any[]) => {
        if (!mapRef.current || data.length === 0) return;

        // Increment run counter — any older concurrent execution will detect the change and stop
        const runId = ++drawMapRunRef.current;

        // Limpiar visualización previa
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];
        if (routePolylineRef.current) {
            routePolylineRef.current.remove();
            routePolylineRef.current = null;
        }

        // Marcador de estado "cargando"
        const loadingToast = toast.loading(`📍 Geocodificando ${data.length} puntos de entrega...`);

        // Geocodificar todas las facturas — omite delay si la respuesta viene de caché
        const geocoded: { inv: any; coords: [number, number]; exact: boolean }[] = [];
        for (let i = 0; i < data.length; i++) {
            if (drawMapRunRef.current !== runId) { toast.dismiss(loadingToast); return; } // aborted
            const inv = data[i];
            const result = await geocodeAddress(inv);
            if (result) {
                geocoded.push({ inv, coords: result.coords, exact: result.exact });
            }
            // Only throttle when NOT served from cache (geocodeAddress returns cached=true flag)
            if (i < data.length - 1 && !(result as any)?.cached) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        toast.dismiss(loadingToast);
        if (drawMapRunRef.current !== runId) return; // aborted after geocoding

        if (geocoded.length === 0) {
            toast.error('No se pudieron geocodificar las direcciones.');
            return;
        }

        // Distribuir en espiral los puntos que cayeron en la misma coordenada (fallback)
        const seen = new Map<string, number>();
        geocoded.forEach(g => {
            const key = `${g.coords[0].toFixed(4)},${g.coords[1].toFixed(4)}`;
            const count = seen.get(key) || 0;
            if (count > 0) {
                const angle = (count * 137.5 * Math.PI) / 180;
                const radius = 0.004 * Math.ceil(count / 8);
                g.coords = [g.coords[0] + radius * Math.cos(angle), g.coords[1] + radius * Math.sin(angle)];
            }
            seen.set(key, count + 1);
        });

        // Ordenar puntos con Nearest-Neighbor desde el HUB M7
        const origin: [number, number] = [M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng];
        const optimized = optimizeRouteOrder(origin, geocoded);

        // Construir lista de puntos para la polyline
        const points: L.LatLng[] = [L.latLng(origin[0], origin[1])];

        optimized.forEach(({ inv, coords, exact }, idx) => {
            if (drawMapRunRef.current !== runId) return; // aborted mid-render
            if (!mapRef.current) return;

            const pos = L.latLng(coords[0], coords[1]);
            points.push(pos);

            // Color: verde=entregado, slate=pendiente, ámbar=ubicación aproximada
            const isDelivered = ['EST-12', 'EST-13', 'EST-14', 'COMPLETED', 'ENTREGADO', 'Entregado'].includes(inv.status);
            const isApprox    = !exact;
            const markerColor = isDelivered ? '#10b981' : isApprox ? '#f59e0b' : '#1e293b';
            const borderColor = isDelivered ? '#059669' : isApprox ? '#d97706' : '#10b981';

            // Wrap index in <span> to prevent Leaflet tagName error on text-node clicks
            const icon = L.divIcon({
                className: 'custom-invoice-marker',
                html: `<div style="width:32px;height:32px;background:${markerColor};border:3px solid ${borderColor};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);position:relative;${isApprox ? 'opacity:0.75;' : ''}"><span>${idx + 1}</span>${isDelivered ? '<div style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#10b981;border-radius:50%;border:2px solid white;"></div>' : ''}${isApprox ? '<div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid white;"></div>' : ''}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const city    = String(inv.city || '');
            const address = String(inv.address || inv.customerAddress || 'Sin dirección');
            const notes   = String(inv.notes || inv.observaciones || '');
            const name    = String(inv.customerName || '');
            const invNum  = String(inv.invoiceNumber || inv.id || '');
            const vol     = (Number(inv.volumeM3) || 0).toFixed(2);
            const statusLabel = isDelivered ? '✅ ENTREGADO' : '⏳ PENDIENTE';

            const statusBg  = isDelivered ? '#d1fae5' : '#fef3c7';
            const statusClr = isDelivered ? '#065f46' : '#92400e';
            const popupHtml = `
<div style="font-family:system-ui,sans-serif;width:240px;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18);">
  <!-- Header -->
  <div style="background:${markerColor};padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
    <div>
      <div style="font-size:9px;font-weight:900;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;">Parada ${idx + 1} de ${optimized.length}</div>
      <div style="font-size:15px;font-weight:900;color:#fff;margin-top:2px;">#${invNum}</div>
    </div>
    <div style="background:rgba(255,255,255,.2);border-radius:8px;padding:4px 8px;font-size:9px;font-weight:900;color:#fff;text-transform:uppercase;">${isDelivered ? '✓ OK' : '⏳'}</div>
  </div>
  <!-- Body -->
  <div style="background:#fff;padding:10px 14px;">
    <!-- Cliente -->
    <div style="font-size:12px;font-weight:900;color:#0f172a;text-transform:uppercase;line-height:1.2;">${name || '—'}</div>
    <!-- Dirección -->
    <div style="display:flex;align-items:flex-start;gap:4px;margin-top:6px;">
      <span style="font-size:11px;color:#64748b;margin-top:1px;">📍</span>
      <div style="font-size:11px;color:#475569;font-weight:600;line-height:1.4;">${address}${city ? '<span style="color:#94a3b8;"> · ' + city + '</span>' : ''}</div>
    </div>
    ${isApprox ? '<div style="margin-top:5px;background:#fef3c7;border-radius:6px;padding:3px 8px;font-size:9px;font-weight:900;color:#92400e;">⚠ Ubicación aproximada</div>' : ''}
    ${notes ? '<div style="margin-top:5px;background:#f8fafc;border-radius:6px;padding:4px 8px;font-size:10px;color:#64748b;font-style:italic;">📝 ' + notes + '</div>' : ''}
    <!-- Separador -->
    <div style="height:1px;background:#f1f5f9;margin:8px 0;"></div>
    <!-- Estado + Volumen -->
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="background:${statusBg};border-radius:20px;padding:3px 10px;font-size:10px;font-weight:900;color:${statusClr};">${statusLabel}</div>
      <div style="font-size:10px;color:#94a3b8;font-weight:700;">${vol} m³</div>
    </div>
  </div>
</div>`;
            const marker = L.marker(pos, { icon })
                .addTo(mapRef.current)
                .bindPopup(popupHtml, { maxWidth: 260, className: 'm7-map-popup' });
            routeMarkersRef.current.push(marker);
        });

        if (drawMapRunRef.current !== runId) return; // aborted after forEach

        // ── RUTA POR CALLES REALES (OSRM) ─────────────────────────────────
        // Waypoints: HUB → paradas en orden optimizado → HUB
        const waypointList = [
            { lat: origin[0], lng: origin[1] },
            ...optimized.map(({ coords }) => ({ lat: coords[0], lng: coords[1] })),
            { lat: origin[0], lng: origin[1] }
        ];

        // Todos los puntos para fitBounds (fallback y OSRM)
        const allLatLngs = waypointList.map(w => L.latLng(w.lat, w.lng));

        // ── ESTIMADO DE ENTREGA POR PARADA ──────────────────────────────────
        // Base 3 min + 0.5 min por cada 5 artículos + 3 min si requiere firma
        const stopEstimates = optimized.map(({ inv }) => {
            const items    = Number(inv.totalItems || inv.item_count || 1);
            const baseMin  = 3;
            const itemsMin = Math.ceil(items / 5);
            const sigMin   = 2; // siempre hay recepción + firma
            const estMin   = baseMin + itemsMin + sigMin;
            return {
                invNum:   String(inv.invoiceNumber || inv.id || ''),
                customer: String(inv.customerName || ''),
                items,
                estMin
            };
        });
        const totalDeliveryMin = stopEstimates.reduce((s, st) => s + st.estMin, 0);

        let usedRoadRoute = false;
        try {
            const roadData = await api.getRoadRoute(waypointList);
            if (drawMapRunRef.current !== runId) return;
            if (roadData?.coordinates?.length > 1) {
                // OSRM devuelve [lng, lat] — Leaflet necesita [lat, lng]
                const roadPoints = (roadData.coordinates as [number, number][])
                    .map(([lng, lat]) => L.latLng(lat, lng));
                routePolylineRef.current = L.polyline(roadPoints, {
                    color: '#0ea5e9',
                    weight: 5,
                    opacity: 0.9,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(mapRef.current!);

                const distKm    = (roadData.distance_m || 0) / 1000;
                const drivingMn = Math.round((roadData.duration_s || 0) / 60);
                setMapRouteInfo({
                    plate:           visualizedRoute?.plate || '',
                    driverName:      visualizedRoute?.driver_name || '',
                    stops:           stopEstimates,
                    distanceKm:      distKm,
                    drivingMin:      drivingMn,
                    totalDeliveryMin
                });
                usedRoadRoute = true;
            }
        } catch (e) {
            console.warn('[M7-OSRM] Fallback a líneas rectas:', e);
            toast.warning('Ruteo por calles no disponible — mostrando trayectoria aproximada', { duration: 4000 });
        }

        // Fallback: líneas rectas si OSRM falló
        if (!usedRoadRoute && mapRef.current) {
            routePolylineRef.current = L.polyline(allLatLngs, {
                color: '#f59e0b',
                weight: 3,
                opacity: 0.7,
                dashArray: '8, 10'
            }).addTo(mapRef.current);
            setMapRouteInfo({
                plate:           visualizedRoute?.plate || '',
                driverName:      visualizedRoute?.driver_name || '',
                stops:           stopEstimates,
                distanceKm:      0,
                drivingMin:      0,
                totalDeliveryMin
            });
        }

        if (mapRef.current) {
            mapRef.current.fitBounds(L.latLngBounds(allLatLngs), { padding: [60, 60], maxZoom: 14 });
        }
    };

    // 4. Efecto para cargar detalle de ruta y dibujar en mapa (visualizedRoute)
    useEffect(() => {
        if (visualizedRoute) {
            // Draw map requested
            loadRouteInvoicesData(visualizedRoute, (data) => {
                 if (selectedActiveRoute && selectedActiveRoute.id === visualizedRoute.id) {
                    setRouteInvoices(data);
                }
            }, true);
        } else {
             // Cleanup map if null
            routeMarkersRef.current.forEach(m => m.remove());
            routeMarkersRef.current = [];
            if (routePolylineRef.current) {
                routePolylineRef.current.remove();
                routePolylineRef.current = null;
            }
            setMapRouteInfo(null);
        }
    }, [visualizedRoute, selectedActiveRoute, invoices]);

    // Cleanup effect for map elements on unmount
    useEffect(() => {
        return () => {
            routeMarkersRef.current.forEach(m => m.remove());
            routeMarkersRef.current = [];
            if (routePolylineRef.current) {
                routePolylineRef.current.remove();
                routePolylineRef.current = null;
            }
        };
    }, []);

    // Load route invoices when user opens a route — does NOT re-fire on invoices prop changes
    // (re-firing on invoices would overwrite dispatch optimistic updates with stale cached data)
    useEffect(() => {
        if (selectedActiveRoute) {
            loadRouteInvoicesData(selectedActiveRoute, setRouteInvoices, false);
        } else {
            setRouteInvoices([]);
        }
    }, [selectedActiveRoute]);

    // 5. Auto-reporte de ubicación y WakeLock (Mantener pantalla encendida)
    useEffect(() => {
        if (!navigator.geolocation) return;

        let wakeLock: any = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                }
            } catch { /* wakeLock no soportado o denegado — no critico */ }
        };

        requestWakeLock();

        const interval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const activeLink = assignments.find(a => a.driverId === user.id && a.isActive);
                    if (activeLink) {
                        try {
                            await api.updateVehicleLocation({
                                vehicleId: activeLink.vehicleId,
                                driverId: user.id,
                                latitude: pos.coords.latitude,
                                longitude: pos.coords.longitude,
                                accuracy: pos.coords.accuracy,
                                speed: pos.coords.speed,
                                heading: pos.coords.heading
                            });
                        } catch { /* GPS update failed silently */ }
                    }
                },
                () => { /* GPS permission denied */ },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }, 15000); // Reducción a 15 segundos para mayor precisión

        return () => {
            clearInterval(interval);
            if (wakeLock) wakeLock.release();
        };
    }, [user, assignments]);

    const fetchPendingSignatures = async () => {
        if (!user?.id) return;
        try {
            const data = await api.getPendingSignatures(user.id);
            setPendingSignatures(data);
        } catch (e) {
            if (import.meta.env.DEV) console.error('[M7-SIGNATURES]', e);
        }
    };

    const fetchAllUsers = async () => {
        try {
            const data = await api.getUsers();
            setAllUsers(data);
        } catch (e) {
            if (import.meta.env.DEV) console.error('[M7-USERS]', e);
        }
    };

    useEffect(() => {
        fetchLocations();
        fetchPendingSignatures();
        fetchAllUsers();
        const interval = setInterval(fetchLocations, 60000); 
        return () => clearInterval(interval);
    }, []);

    // FILTRO DE PRIVACIDAD POR ROL DE CONDUCTOR + CLIENTE
    const filteredRoutes = React.useMemo(() => {
        if (!user) return [];
        let routes = activeRoutes;

        // Filtro por cliente seleccionado
        if (internalClientId) {
            routes = routes.filter(route => {
                const rClientId = (route as any).client_id || (route as any).clientId;
                return !rClientId || String(rClientId) === String(internalClientId);
            });
        }

        // Si es CONDUCTOR (ROL-03), solo mostrar sus rutas
        const userRoleId = user.role_id || user.roleId || '';
        if (userRoleId === 'ROL-03' || userRoleId === 'CONDUCTOR') {
            const userDoc = String(user.document_number || user.documentNumber || '').trim();
            const userId  = String(user.id || user.userId || '').trim();
            if (!userDoc && !userId) return [];

            return routes.filter(route => {
                // 1. driver_document viene directo del JOIN en getRoutes
                const routeDoc = String((route as any).driver_document || '').trim();
                if (userDoc && routeDoc && routeDoc === userDoc) return true;

                // 2. Verificar vía assignments (si hay datos)
                const link = assignments.find(a => {
                    const aDriverId = a.driverId || (a as any).driver_id;
                    const aActive = a.isActive !== undefined ? a.isActive : (a as any).is_active;
                    return String(aDriverId) === String(route.driver_id) && aActive;
                });
                if (link) {
                    const linkDriverId = link?.driverId || (link as any)?.driver_id;
                    const drv = drivers.find(d => String(d.id) === String(linkDriverId));
                    const drvDoc = String((drv as any)?.document_number || (drv as any)?.documentNumber || '').trim();
                    if (userDoc && drvDoc && drvDoc === userDoc) return true;
                }

                // 3. Fallback: driver_id coincide con user.id (cuando el usuario ES el conductor)
                if (userId && String(route.driver_id || '').trim() === userId) return true;

                return false;
            });
        }
        // Admin u otros roles ven todo (filtrado por cliente)
        return routes;
    }, [activeRoutes, user, assignments, drivers, internalClientId]);

    // DIAGNÓSTICO DE DATOS (M7-DEBUG)
    useEffect(() => {
        if (import.meta.env.DEV) {
            console.log('%c [M7-DISPATCH-DIAGNOSTIC] 🛰️ RUTAS RECIBIDAS', 'background: #0ea5e9; color: white; padding: 4px; border-radius: 4px;');
            console.table(activeRoutes.map(r => ({
                id: r.id,
                plate: r.plate || (r as any).vehicle_id,
                status: r.status || (r as any).status_id,
                invoices: (r as any).invoice_ids?.length || 0
            })));
            console.log(`[M7-DISPATCH] Visibles despues de filtro: ${filteredRoutes.length}`);
        }
    }, [activeRoutes, filteredRoutes]);

    // FILTRA UBICACIONES GPS BASADAS EN LAS RUTAS VISIBLES
    const filteredLocations = React.useMemo(() => {
        const visibleVehicleIds = new Set(filteredRoutes.map(r => r.vehicle_id));
        return vehicleLocations.filter(loc => visibleVehicleIds.has(loc.vehicle_id));
    }, [filteredRoutes, vehicleLocations]);

    // LOGICA DE NEGOCIO PARA DESPACHO (MOVIDA ANTES DEL RETURN)
    const handleBarcodeScan = async (barcode: string) => {
        if (!assigningInvoice) return;
        const barcodeClean = cleanSkuM7(barcode);
        
        // Buscar el ítem por SKU o Barcode de forma robusta
        const item = (assigningInvoice.items || []).find((it: any) => 
            String(it.sku || '').trim().toUpperCase() === barcodeClean || 
            String(it.barcode || '').trim().toUpperCase() === barcodeClean
        );

        if (!item) {
            toast.error(`Artículo no encontrado: ${barcode}`);
            return;
        }

        const sku = item.sku;
        const currentCount = scannedItems[sku] || 0;
        
        // Detectar cantidad esperada con fallback robusto
        const expected = Number(item.qty || item.expectedQty || item.quantity || 0);

        if (currentCount >= expected) {
            toast.error(`BLOQUEO: Ya se cumplió la cantidad máxima para ${item.articleName || sku} (${currentCount}/${expected})`, {
                style: { background: '#ef4444', color: '#fff' }
            });
            return;
        }

        const newScanned = {
            ...scannedItems,
            [sku]: currentCount + 1
        };

        setScannedItems(newScanned);
        toast.success(`Escaneado: ${item.articleName || sku} (${currentCount + 1}/${expected})`);
    };

    const handleConfirmDispatch = async () => {
        if (!assigningInvoice) return;
        const totalScanned = Object.values(scannedItems).reduce((a,b)=>a+b, 0);
        const totalExpected = (assigningInvoice.items || []).reduce((a: any, b: any) => a + Number(b.qty || b.expectedQty || 0), 0);
        if (totalExpected > 0 && totalScanned > 0 && totalScanned < totalExpected) {
             setConfirmModal({
                isOpen: true,
                title: "Artículos incompletos",
                message: `Solo se escanearon ${totalScanned} de ${totalExpected} artículos. ¿Continuar con el despacho?`,
                onConfirm: processDispatchConfirmation
             });
             return;
        }
        processDispatchConfirmation();
    };

    const processDispatchConfirmation = async () => {
        if (!assigningInvoice) return;
        const route = activeRoutes.find(r => r.id === (assigningInvoice.route_id || assigningInvoice.routeId));
        const actualDriver = drivers.find(d => d.id === route?.driver_id || d.id === route?.driverId);

        // Solo requerir firma del despachador. El conductor firma con FIRMAR (paso separado).
        if (signNowMap[user.id] !== false && !signatureKeys[user.id]) {
            toast.error(`Falta su firma de despachador`); return;
        }

        setIsValidating(true);
        try {
            const signatures = [];
            signatures.push({ userId: user.id, role: 'DISPATCHER', signNow: signNowMap[user.id] !== false, password: signatureKeys[user.id] });
            if (actualDriver) {
                const driverSignNow = signNowMap[actualDriver.id] !== false;
                // Si el conductor firma ahora, validar que haya ingresado su clave
                if (driverSignNow && !signatureKeys[actualDriver.id]) {
                    toast.error('Falta la clave del conductor — seleccione "DESPUÉS" si firmará luego');
                    setIsValidating(false);
                    return;
                }
                signatures.push({ userId: actualDriver.id, role: 'DRIVER', signNow: driverSignNow, password: signatureKeys[actualDriver.id] || '' });
            }

            if (isAccompanied) {
                selectedHelpers.slice(0, helperCount).forEach(hid => {
                    if (hid) signatures.push({ userId: hid, role: 'HELPER', signNow: false, password: '' });
                });
            }

            const res = await api.initDispatch({
                invoiceId: assigningInvoice.invoiceNumber || assigningInvoice.id,
                driverId: actualDriver?.id || user.id,
                helperIds: isAccompanied ? selectedHelpers.slice(0, helperCount).filter(Boolean) : [],
                scannedItems,
                isAccompanied,
                helperCount: isAccompanied ? helperCount : 0,
                createdBy: user.id,
                signatures
            });
            if (res.success) {
                toast.success("✅ Despacho confirmado — revise estado de firmas para proceder");
                // Registrar en Set local — inmune a cualquier stale-data refresh
                const dispKey = cleanId(assigningInvoice.invoiceNumber || assigningInvoice.id);
                setDispatchedIds(prev => new Set([...prev, dispKey]));
                // Optimistic update del estado
                setRouteInvoices(prev => prev.map(inv =>
                    (inv.id === assigningInvoice.id || inv.invoiceNumber === assigningInvoice.invoiceNumber)
                        ? { ...inv, itemStatus: 'EST-11' }
                        : inv
                ));
                setAssigningInvoice(null);
                setScannedItems({});
                // Refrescar firmas pendientes del usuario actual
                fetchPendingSignatures();
                // Refrescar firmas de TODOS para esta factura (badges FIRMA BODEGA / FIRMA CONDUCTOR)
                const invIdForSigs = assigningInvoice.invoiceNumber || assigningInvoice.id;
                if (invIdForSigs) {
                    api.getInvoicePendingSignatures(invIdForSigs).then((data: any) => {
                        setInvoiceAllPending(prev => ({ ...prev, [invIdForSigs]: Array.isArray(data) ? data : [] }));
                    }).catch(() => {});
                }
                // Invalidar caché y refrescar datos del servidor
                if (selectedActiveRoute) {
                    routeInvoicesCache.current.delete(selectedActiveRoute.id);
                    loadRouteInvoicesData(selectedActiveRoute, setRouteInvoices, false);
                }
                // Refrescar contadores de ruta en el panel lateral
                onRefresh();
            }
        } catch (e: any) { toast.error(e.message); } finally { setIsValidating(false); }
    };

    const handleDelayedSignature = async (inv: any) => {
        const pending = pendingSignatures.find(
            ps => ps.invoiceId === inv.id || ps.invoiceId === inv.invoiceNumber
        );
        setSignatureInputModal({
            isOpen: true,
            invoice: inv,
            role: pending?.role || 'DRIVER',
            onConfirm: (pass: string) => executeSignature(inv, pass)
        });
    };

    const executeSignature = async (inv: any, password: string) => {
        if (!password) return;
        setIsValidating(true);
        try {
            let dId = inv.dispatchId;
            if (!dId) {
                const match = pendingSignatures.find(ps => ps.invoiceId === inv.id || ps.invoiceId === inv.invoiceNumber);
                if (match) dId = match.dispatchId;
            }
            if (!dId) { toast.error("No se encontró ID de despacho"); return; }
            const res = await api.signDispatchPending({ dispatchId: dId, userId: user.id, password });
            if (res.success) {
                toast.success("Firma registrada");
                fetchPendingSignatures();
                // Refresh invoice-level pending so ENTREGAR / badges update immediately
                const invKey = inv.invoiceNumber || inv.id;
                if (invKey) {
                    try {
                        const fresh = await api.getInvoicePendingSignatures(invKey);
                        setInvoiceAllPending(prev => ({ ...prev, [invKey]: Array.isArray(fresh) ? fresh : [] }));
                    } catch {}
                }
                onRefresh();
            }
        } catch (e: any) { toast.error(e.message); } finally { setIsValidating(false); }
    };

    // ─── CONFIRMACIÓN ENTREGA AL CLIENTE ─────────────────────────────────────
    const handleConfirmDelivery = async () => {
        if (!deliveryModal?.invoice) return;

        const inv = deliveryModal.invoice;
        const route = deliveryModal.route;

        // Buscar driverId vinculado a la ruta
        const routeLink = assignments.find(a => a.vehicleId === route?.vehicle_id && a.isActive);
        const driverForRoute = drivers.find(d => d.id === routeLink?.driverId);
        const driverId = driverForRoute?.id || user.id;

        setIsConfirmingDelivery(true);
        try {
            const res = await api.confirmDelivery({
                invoiceId: inv.id || inv.invoiceNumber,
                dispatchId: inv.dispatchId || undefined,
                driverId,
                vehicleId: route?.vehicle_id || undefined,
                deliveryType,
                deliveredItems: deliveryItems,
                notes: deliveryNotes || undefined,
                returnReason: deliveryReturnReason || undefined,
                repiceDestination: deliveryType === 'REPICE' ? repiceDestination : undefined,
            });

            if (res.success) {
                const newItemStatus =
                    deliveryType === 'FULL'    ? 'EST-12' :
                    deliveryType === 'PARTIAL' ? 'EST-13' :
                    deliveryType === 'REPICE' ? (repiceDestination === 'SAME_PLATE' ? 'EST-11' : 'EST-15') :
                    'EST-01';
                const msg =
                    deliveryType === 'FULL'    ? '✅ Entrega completa registrada'              :
                    deliveryType === 'PARTIAL' ? '⚠️ Entrega parcial – devolución creada'      :
                    deliveryType === 'REPICE' ? (repiceDestination === 'SAME_PLATE'
                        ? '🔁 Repice — reasignado a la misma placa'
                        : '🔁 Repice — devuelto a bodega')                                    :
                    '🔄 Devolución total registrada';
                toast.success(msg);
                // Optimistic update
                setRouteInvoices(prev => prev.map(i =>
                    (i.id === inv.id || i.invoiceNumber === inv.invoiceNumber)
                        ? { ...i, itemStatus: newItemStatus }
                        : i
                ));
                setDeliveryModal(null);
                onRefresh();
            }
        } catch (e: any) {
            toast.error(e.message || 'Error al confirmar entrega');
        } finally {
            setIsConfirmingDelivery(false);
        }
    };

    // ─── CARGA HISTORIAL ──────────────────────────────────────────────────────
    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const filters: Record<string, string> = {};
            if (historyFilters.invoiceId)    filters.invoiceId    = historyFilters.invoiceId;
            if (historyFilters.driverId)     filters.driverId     = historyFilters.driverId;
            if (historyFilters.vehicleId)    filters.vehicleId    = historyFilters.vehicleId;
            if (historyFilters.dateFrom)     filters.dateFrom     = historyFilters.dateFrom;
            if (historyFilters.dateTo)       filters.dateTo       = historyFilters.dateTo;
            if (historyTab === 'ENTREGAS' && historyFilters.deliveryType)
                filters.deliveryType = historyFilters.deliveryType;
            if (historyTab === 'DEVOLUCIONES' && historyFilters.status)
                filters.status = historyFilters.status;

            const res = historyTab === 'ENTREGAS'
                ? await api.getDeliveryHistory(filters)
                : await api.getReturnHistory(filters);

            setHistoryData(res.data || []);
        } catch (e: any) {
            toast.error(e.message || 'Error al cargar historial');
        } finally {
            setHistoryLoading(false);
        }
    };


    return (
        <>
        <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-inter">
            {/* Header M7 Inteligencia - Ultra Compacto (UNA SOLA LÍNEA) */}
            <header className="h-14 bg-slate-900 flex items-center justify-between px-6 shrink-0 z-50 border-b border-white/5 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Icons.Radar className="text-slate-950 w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                            <h1 className="text-xs font-black text-white uppercase tracking-tighter leading-none flex items-center gap-2">
                                 Centro de Mando
                                 <span className="bg-emerald-500/20 text-emerald-400 text-[6px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 font-black tracking-widest">IQ V1.8</span>
                            </h1>
                        </div>
                    </div>

                    {/* KPIs INTEGRADOS EN EL HEADER (UNA SOLA LÍNEA) */}
                    <div className="hidden lg:flex items-center gap-4 ml-6 border-l border-white/10 pl-6">
                        <div className="flex items-center gap-2">
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Visibles</span>
                            <span className="text-xs font-black text-white">{vehicleLocations.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">GPS OK</span>
                            <span className="text-xs font-black text-emerald-400">
                                {vehicleLocations.filter(l => (Date.now() - new Date(l.updated_at).getTime()) < 600000).length}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
                            <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Sin Señal</span>
                            <span className="text-xs font-black text-rose-400">
                                {vehicleLocations.filter(l => (Date.now() - new Date(l.updated_at).getTime()) >= 600000).length}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowMap(v => !v)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all group ${showMap ? 'bg-sky-500/20 text-sky-300 border-sky-500/30 hover:bg-sky-500/30' : 'bg-white/5 text-white border-white/5 hover:bg-white/10'}`}
                    >
                        <Icons.MapPin className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                        <span>{showMap ? 'Ocultar Mapa' : 'Ver Mapa'}</span>
                    </button>
                    <button
                        onClick={() => setShowHistoryModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 text-[8px] font-black uppercase tracking-widest transition-all group"
                    >
                        <Icons.History className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                        <span>Historial</span>
                    </button>
                    <button
                        onClick={() => setShowReturnsModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/20 text-[8px] font-black uppercase tracking-widest transition-all group"
                    >
                        <Icons.Package className="w-3 h-3 opacity-80 group-hover:opacity-100" />
                        <span>Devoluciones</span>
                    </button>
                    <button 
                        onClick={() => {
                            fetchLocations();
                            onRefresh();
                            toast.info("Actualizando datos operativos...");
                        }}
                        disabled={isValidating}
                        className={`w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 hover:bg-emerald-400 transition-all ${isValidating ? 'animate-spin' : ''}`}
                    >
                        <Icons.RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

                <main className="flex-1 flex overflow-hidden">
                    {/* Lista de Rutas - ancho fijo con mapa, expandida sin mapa */}
                    <div className={`${showMap ? 'w-[380px] shrink-0' : 'flex-1'} border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar p-4 space-y-3`}>
                        {/* Client selector */}
                        {clientsReady && filteredClients.length !== 1 && (
                            <div className="mb-3">
                                {filteredClients.length === 0 ? null : (
                                    <select
                                        value={internalClientId}
                                        onChange={e => setInternalClientId(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-emerald-500 transition-all"
                                    >
                                        <option value="">— Seleccionar cliente —</option>
                                        {filteredClients.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.name || c.id}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}
                        {clientsReady && filteredClients.length === 1 && (
                            <div className="mb-3 px-1">
                                <span className="text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                                    {filteredClients[0].name || filteredClients[0].id}
                                </span>
                            </div>
                        )}

                        {/* Guard: require client selection when multiple clients exist */}
                        {clientsReady && filteredClients.length > 1 && !internalClientId && (
                            <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-2">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">Seleccione un cliente para ver las rutas</p>
                            </div>
                        )}

                        {(filteredClients.length <= 1 || internalClientId) && <>

                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Unidades en Ruta</h3>

                        {/* ── RESUMEN TOTAL DE TODAS LAS RUTAS ── */}
                        {filteredRoutes.length > 0 && (() => {
                            const totalInvoices = filteredRoutes.reduce((s, r) => s + (r.invoice_ids?.length || 0), 0);
                            const totalVol = filteredRoutes.reduce((s, r) => {
                                return s + (r.invoice_ids || []).reduce((sv: number, id: string) => {
                                    const inv = invoices.find(i => String(i.id).trim() === String(id).trim() || String(i.invoiceNumber).trim() === String(id).trim());
                                    return sv + Number(inv?.volumeM3 || 0);
                                }, 0);
                            }, 0);
                            const delivered = invoices.filter(i => {
                                const key = cleanId((i as any).invoiceNumber || i.id);
                                return dispatchedIds.has(key) || ['EST-11','EST-12','EST-13','EST-14'].includes(((i as any).itemStatus || i.status) as string);
                            }).length;
                            const pct = totalInvoices > 0 ? Math.round((delivered / totalInvoices) * 100) : 0;
                            return (
                                <div className="bg-slate-900 rounded-2xl p-3 mb-1 space-y-2">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Resumen Total de Despacho</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-center">
                                            <div className="text-lg font-black text-white">{filteredRoutes.length}</div>
                                            <div className="text-[7px] font-bold text-slate-500 uppercase">Rutas</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-black text-emerald-400">{totalInvoices}</div>
                                            <div className="text-[7px] font-bold text-slate-500 uppercase">Facturas</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-lg font-black text-amber-400">{totalVol.toFixed(1)}</div>
                                            <div className="text-[7px] font-bold text-slate-500 uppercase">m³</div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-[7px] font-black text-slate-400 uppercase">Progreso entregas</span>
                                            <span className="text-[8px] font-black text-emerald-400">{delivered}/{totalInvoices} · {pct}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Buscador de rutas */}
                        <div className="px-1">
                            <input 
                                type="text"
                                placeholder="Buscar placa, conductor..."
                                value={routeSearch}
                                onChange={(e) => setRouteSearch(e.target.value.toUpperCase())}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500"
                            />
                        </div>

                        {filteredRoutes.length === 0 ? (
                            <div className="text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">{activeRoutes.length === 0 ? 'Esperando despacho...' : 'Sin rutas para este criterio'}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredRoutes
                            .filter(route => {
                                if (!routeSearch) return true;
                                const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                                const q = norm(routeSearch);
                                return norm(route.plate || '').includes(q)
                                    || norm(route.driver_name || '').includes(q);
                            })
                            .map((route) => {
                                const vehicleData = vehicles.find(v => v.id === route.vehicle_id);
                                const totalVolume = (route.invoice_ids || []).reduce((acc: number, id: string) => {
                                    const cleanId = String(id).trim().replace(/[\r\n\t\f\v ]/g, '');
                                    const inv = invoices.find(i => String(i.id).trim().replace(/[\r\n\t\f\v ]/g, '') === cleanId);
                                    return acc + Number(inv?.volumeM3 || 0);
                                }, 0);
                                const utilizationPercent = vehicleData ? (totalVolume / vehicleData.capacityM3) * 100 : 0;

                                const routeInvList = invoices.filter(inv => {
                                    const invId = cleanId(inv.id);
                                    const invNum = cleanId(inv.invoiceNumber);
                                    const rawIds = route.invoice_ids || route.invoiceIds || [];
                                    const targetIds = rawIds.map((id: any) => {
                                        const val = typeof id === 'object' && id !== null ? (id.id || id.invoice_id) : id;
                                        return cleanId(val);
                                    });
                                    return targetIds.includes(invId) || targetIds.includes(invNum);
                                });
                                const isSelectedRoute = selectedActiveRoute?.id === route.id;
                                const totalRouteInvoices = isSelectedRoute
                                    ? (routeInvoices.length || (route.total_invoices ?? routeInvList.length))
                                    : (route.total_invoices ?? routeInvList.length);
                                const deliveredRouteCount = isSelectedRoute
                                    ? routeInvoices.filter(i => {
                                        const key = cleanId((i as any).invoiceNumber || i.id);
                                        return dispatchedIds.has(key) || ['EST-11','EST-12','EST-13','EST-14','ENTREGADO'].includes(((i as any).itemStatus || i.status) as string);
                                    }).length
                                    : (route.delivered_invoices ?? routeInvList.filter(i => ['EST-11','EST-12','EST-13','EST-14','ENTREGADO'].includes(((i as any).itemStatus || i.status) as string)).length);
                                const percent = totalRouteInvoices > 0 ? (deliveredRouteCount / totalRouteInvoices) * 100 : 0;

                                 return (
                                    <div key={route.id} className="relative group">
                                        <div 
                                            className={`p-6 rounded-[2.5rem] border ${selectedActiveRoute?.id === route.id ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-white'} hover:border-emerald-200 hover:shadow-xl transition-all cursor-pointer overflow-hidden`}
                                            onClick={() => setSelectedActiveRoute(route)}
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-xl font-black text-slate-900 tracking-tighter leading-none">{route.plate}</h3>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{route.driver_name || 'PENDIENTE'}</p>
                                                    {(() => {
                                                        const raw = route.createdAt || (route as any).created_at;
                                                        if (!raw) return null;
                                                        const d = new Date(raw);
                                                        if (isNaN(d.getTime())) return null;
                                                        const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
                                                        const hora  = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
                                                        return (
                                                            <p className="text-[10px] font-black text-slate-600 mt-1 flex items-center gap-1">
                                                                <span>📅</span>{fecha} · {hora}
                                                            </p>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                                                        {deliveredRouteCount}/{totalRouteInvoices} <span className="text-[8px] text-indigo-400">fact</span>
                                                    </div>
                                                    <p className="text-[11px] font-black text-emerald-500 mt-1">{Math.round(percent)}%</p>
                                                </div>
                                            </div>

                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-5">
                                                <div 
                                                    className="h-full bg-emerald-400 rounded-full transition-all duration-1000"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    className="flex-1 py-2.5 bg-slate-50 text-slate-600 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-white hover:shadow-md transition-all flex items-center justify-center gap-1.5"
                                                    onClick={(e) => { e.stopPropagation(); setVisualizedRoute(route); setShowMap(true); }}
                                                >
                                                    <Icons.MapPin className="w-3 h-3" />
                                                    {visualizedRoute?.id === route.id ? 'Tracker' : 'Mapa'}
                                                </button>
                                                <button
                                                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 shadow-lg"
                                                    onClick={(e) => { e.stopPropagation(); setSelectedActiveRoute(route); }}
                                                >
                                                    <Icons.Package className="w-3 h-3" />
                                                    Despacho
                                                </button>
                                                <button
                                                    className="flex-1 py-2.5 bg-slate-900 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5 shadow-lg"
                                                    onClick={(e) => { e.stopPropagation(); generateRoutePDF(route); }}
                                                >
                                                    <Icons.FileText className="w-3 h-3" />
                                                    Planilla
                                                </button>
                                            </div>
                                        </div>

                                        {/* BOTÓN EDITAR PLACA - FLOTANTE (Solo disponible para rutas de hoy) */}
                                        {(() => {
                                            const rDate = new Date(route.createdAt || route.created_at || Date.now());
                                            const today = new Date();
                                            const isToday = rDate.getDate() === today.getDate() && 
                                                           rDate.getMonth() === today.getMonth() && 
                                                           rDate.getFullYear() === today.getFullYear();
                                            
                                            if (!isToday) return null;

                                            return (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setShowReassignModal({ isOpen: true, route }); }}
                                                    className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-slate-200 text-slate-400 rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-600 hover:text-white hover:scale-110 transition-all z-10"
                                                    title="Editar Placa / Reasignar"
                                                >
                                                    <Icons.Settings className="w-4 h-4" />
                                                </button>
                                            );
                                        })()}
                                    </div>
                                );
                            })
                            }
                            </div>
                        )}
                        </>}
                    </div>

                    {/* MAPA EXPANDIDO TOTAL */}
                    <div className={`flex-1 relative bg-slate-950 ${showMap ? '' : 'hidden'}`}>
                        <div id="logistics-dispatch-map" className="absolute inset-0 w-full h-full grayscale-[0.1] contrast-[1.05]" />
                        
                        {/* Indicador Flotante Sutil */}
                        <div className="absolute top-4 left-4 z-[400] bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Monitor Live</span>
                            </div>
                            <div className="w-px h-3 bg-white/20"></div>
                            <div className="text-[9px] font-black text-white">{vehicleLocations.length} Activos</div>
                        </div>

                        {/* ── PANEL FLOTANTE DE RUTA ACTIVA ── */}
                        {mapRouteInfo && (
                            <div className="absolute top-4 right-4 z-[400] w-72 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                                {/* Header vehículo */}
                                <div className="px-4 py-3 bg-slate-800/80 flex items-center justify-between border-b border-white/5">
                                    <div className="flex items-center gap-2">
                                        <Icons.Truck className="w-4 h-4 text-emerald-400" />
                                        <span className="text-sm font-black text-white tracking-wider">{mapRouteInfo.plate || '—'}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[110px]">{mapRouteInfo.driverName || 'Sin conductor'}</span>
                                </div>

                                {/* Stats de ruta */}
                                {mapRouteInfo.distanceKm > 0 && (
                                    <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5">
                                        <div className="px-3 py-2 text-center">
                                            <div className="text-base font-black text-sky-400">{mapRouteInfo.stops.length}</div>
                                            <div className="text-[7px] font-bold text-slate-500 uppercase">Paradas</div>
                                        </div>
                                        <div className="px-3 py-2 text-center">
                                            <div className="text-base font-black text-amber-400">{mapRouteInfo.distanceKm.toFixed(1)}</div>
                                            <div className="text-[7px] font-bold text-slate-500 uppercase">km ruta</div>
                                        </div>
                                        <div className="px-3 py-2 text-center">
                                            <div className="text-base font-black text-emerald-400">{mapRouteInfo.drivingMin + mapRouteInfo.totalDeliveryMin}</div>
                                            <div className="text-[7px] font-bold text-slate-500 uppercase">min total</div>
                                        </div>
                                    </div>
                                )}

                                {/* Desglose tiempo */}
                                {mapRouteInfo.distanceKm > 0 && (
                                    <div className="px-4 py-2 flex gap-3 text-[9px] border-b border-white/5">
                                        <span className="text-slate-400">🚗 Conducción: <span className="text-white font-bold">{mapRouteInfo.drivingMin} min</span></span>
                                        <span className="text-slate-400">📦 Entregas: <span className="text-white font-bold">{mapRouteInfo.totalDeliveryMin} min</span></span>
                                    </div>
                                )}

                                {/* Lista de paradas con tiempo estimado */}
                                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                                    {mapRouteInfo.stops.map((st, i) => (
                                        <div key={i} className="flex items-center gap-2 px-4 py-2 border-b border-white/5 hover:bg-white/5 transition-all">
                                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                                                <span className="text-[8px] font-black text-slate-300">{i + 1}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[9px] font-black text-white truncate">#{st.invNum}</div>
                                                <div className="text-[8px] text-slate-400 truncate">{st.customer}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[9px] font-black text-amber-400">~{st.estMin} min</div>
                                                <div className="text-[7px] text-slate-500">{st.items} art.</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer total */}
                                <div className="px-4 py-2 bg-slate-800/60 flex justify-between items-center">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Tiempo estimado total</span>
                                    <span className="text-sm font-black text-emerald-400">
                                        {Math.floor((mapRouteInfo.drivingMin + mapRouteInfo.totalDeliveryMin) / 60) > 0
                                            ? `${Math.floor((mapRouteInfo.drivingMin + mapRouteInfo.totalDeliveryMin) / 60)}h ${(mapRouteInfo.drivingMin + mapRouteInfo.totalDeliveryMin) % 60}min`
                                            : `${mapRouteInfo.drivingMin + mapRouteInfo.totalDeliveryMin} min`}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modal de Detalle Mejorado */}
            {selectedActiveRoute && (
                <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-[95vw] lg:max-w-7xl max-h-[95vh] flex flex-col items-stretch overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-emerald-50 shrink-0">
                            <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                                       <Icons.Truck className="w-5 h-5 text-emerald-400" />
                                   </div>
                                   <div>
                                       <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{selectedActiveRoute.plate}</h3>
                                       <p className="text-[10px] font-bold text-slate-500 uppercase">{selectedActiveRoute.driver_name || 'Sin Conductor'}</p>
                                   </div>
                                </div>
                                <button onClick={() => setSelectedActiveRoute(null)} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 transition-all">
                                    <Icons.X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 items-center">
                                <div className="flex-1 min-w-[200px] relative">
                                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="BUSCAR FACTURA O CLIENTE..."
                                        value={invoiceSearchQuery}
                                        onChange={(e) => { setInvoiceSearchQuery(e.target.value); }}
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold uppercase outline-none focus:border-slate-300"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <div className="px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                                        <p className="text-[7px] font-black text-slate-400 uppercase">Documentos</p>
                                        <p className="text-sm font-black text-slate-900">{routeInvoices.length}</p>
                                    </div>
                                    <div className="px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                                        <p className="text-[7px] font-black text-slate-400 uppercase">Volumen</p>
                                        <p className="text-sm font-black text-emerald-600">
                                            {(Number(routeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.volumeM3) || 0), 0)) || 0).toFixed(2)}<span className="text-[9px] ml-0.5">m³</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 custom-scrollbar bg-slate-50/50">
                            {routeInvoices
                                .filter(inv => {
                                    if (!invoiceSearchQuery) return true;
                                    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                                    const query = norm(invoiceSearchQuery);
                                    return norm(String(inv.invoiceNumber || '')).includes(query) ||
                                           norm(String(inv.customerName  || '')).includes(query) ||
                                           norm(String(inv.id            || '')).includes(query);
                                })
                                .map((inv: any, idx: number) => {
                                    const invKey = inv.invoiceNumber || inv.id;
                                    // dispatchedIds: override inmune a stale-data
                                    const wasDispatched = dispatchedIds.has(cleanId(invKey));
                                    const effectiveStatus = wasDispatched ? 'EST-11' : (inv.itemStatus || inv.status || '');
                                    const hasPendingSignature = pendingSignatures.some(ps => ps.invoiceId === inv.id || ps.invoiceId === inv.invoiceNumber);
                                    // All unsigned signatures for this invoice (any user) — used to block ENTREGAR
                                    const allPendingForInv = invoiceAllPending[invKey] || [];
                                    const pendingBodega = allPendingForInv.some(p => p.role === 'BODEGA');
                                    const pendingConductor = allPendingForInv.some(p => p.role === 'CONDUCTOR');
                                    return (
                                        <div key={`${inv.id || idx}`} className="p-4 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-emerald-400/40 transition-all group">
                                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xs shrink-0 group-hover:bg-slate-900 group-hover:text-emerald-400 transition-colors">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <h5 className="text-[14px] font-black text-slate-900">#{inv.invoiceNumber || inv.id}</h5>
                                                        {effectiveStatus === 'EST-11' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-black rounded-full">EN RUTA</span>}
                                                        {effectiveStatus === 'EST-12' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black rounded-full">ENTREGADO</span>}
                                                        {effectiveStatus === 'EST-13' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black rounded-full">PARCIAL</span>}
                                                        {pendingBodega && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[8px] font-black rounded-full animate-pulse">FIRMA BODEGA</span>}
                                                        {pendingConductor && <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-[8px] font-black rounded-full animate-pulse">FIRMA CONDUCTOR</span>}
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase leading-none">{inv.customerName || 'S/N'}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                                                <button
                                                    onClick={() => setViewingItemsInvoice(inv)}
                                                    className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all border border-slate-200"
                                                    title="Ver Artículos"
                                                >
                                                    <Icons.Eye className="w-4 h-4" />
                                                </button>

                                                {/* DESPACHAR — solo si NO está en ruta y no tiene firma pendiente */}
                                                {!['EST-11','EST-12','EST-13','EST-14'].includes(effectiveStatus) && !hasPendingSignature && (
                                                    <button
                                                        onClick={() => setAssigningInvoice(inv)}
                                                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg"
                                                    >
                                                        <Icons.Truck className="w-4 h-4" />
                                                        Despachar
                                                    </button>
                                                )}

                                                {/* ENTREGAR — EN RUTA + el usuario actual no tiene firma propia pendiente */}
                                                {effectiveStatus === 'EST-11' && !hasPendingSignature && (
                                                    <button
                                                        onClick={() => {
                                                            const items = (inv.items || []).map((it: any) => ({
                                                                sku: it.sku,
                                                                articleName: it.articleName || it.article_name || it.sku,
                                                                unit: it.unit || 'UND',
                                                                quantityDelivered: Number(it.qty || it.expectedQty || 0),
                                                                quantityReturned: 0,
                                                                notes: ''
                                                            }));
                                                            setDeliveryItems(items);
                                                            setDeliveryType('FULL');
                                                            setDeliveryModal({ isOpen: true, invoice: inv, route: selectedActiveRoute });
                                                        }}
                                                        className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                                    >
                                                        <Icons.CheckCircle className="w-4 h-4" />
                                                        Entregar
                                                    </button>
                                                )}

                                                {/* SUBIR SOPORTE — cuando ya fue entregado */}
                                                {(['EST-12','EST-13','EST-14'].includes(effectiveStatus)) && (
                                                    <button
                                                        onClick={() => setVoucherModal({ isOpen: true, invoice: inv })}
                                                        className="px-4 py-2.5 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-amber-600 transition-all flex items-center gap-2"
                                                    >
                                                        <Icons.Upload className="w-4 h-4" />
                                                        Soporte
                                                    </button>
                                                )}

                                                {/* FIRMAR — firma pendiente */}
                                                {hasPendingSignature && (
                                                    <button
                                                        onClick={() => handleDelayedSignature(inv)}
                                                        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-all flex items-center gap-2"
                                                    >
                                                        <Icons.Signature className="w-4 h-4" />
                                                        Firma Pend.
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        <div className="p-6 bg-white border-t border-slate-100 flex flex-col sm:flex-row gap-4 shrink-0 rounded-b-[2rem]">
                            <button
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                onClick={() => generateRoutePDF(selectedActiveRoute)}
                                disabled={isGeneratingPDF}
                            >
                                {isGeneratingPDF ? <Icons.RotateCcw className="w-5 h-5 animate-spin" /> : <Icons.FileText className="w-5 h-5" />}
                                {isGeneratingPDF ? 'GENERANDO...' : 'DESCARGAR PLANILLA'}
                            </button>
                            <button
                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                                onClick={() => setSelectedActiveRoute(null)}
                            >
                                CERRAR DETALLE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: VER ARTÍCULOS */}
            {viewingItemsInvoice && (
                <div className="fixed inset-0 z-[700] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Artículos del Documento</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Factura: {viewingItemsInvoice.invoiceNumber || viewingItemsInvoice.id}</p>
                            </div>
                            <button onClick={() => setViewingItemsInvoice(null)} className="w-10 h-10 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all">
                                <Icons.X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar">
                                {(viewingItemsInvoice.items || []).map((item: any, i: number) => (
                                    <div key={i} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center hover:bg-white hover:shadow-md transition-all">
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{item.articleName || item.sku || 'Artículo'}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">SKU: {item.sku || 'N/A'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-indigo-600">{item.qty || item.expectedQty || 0} <span className="text-[10px] text-slate-400">{item.unit || 'UND'}</span></p>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            <GenericConfirmModal 
                isOpen={!!confirmModal}
                title={confirmModal?.title || ''}
                message={confirmModal?.message || ''}
                onClose={() => setConfirmModal(null)}
                onConfirm={() => {
                    const cb = confirmModal?.onConfirm;
                    setConfirmModal(null);
                    if (cb) cb();
                }}
            />
            
            <SignatureInputModal
                isOpen={!!signatureInputModal}
                user={user}
                role={signatureInputModal?.role}
                invoice={signatureInputModal?.invoice}
                onClose={() => setSignatureInputModal(null)}
                onConfirm={(pass) => {
                    const cb = signatureInputModal?.onConfirm;
                    setSignatureInputModal(null);
                    if (cb) cb(pass);
                }}
            />

            <CustomerDeliveryModal
                isOpen={!!deliveryModal?.isOpen}
                onClose={() => setDeliveryModal(null)}
                invoice={deliveryModal?.invoice}
                deliveryType={deliveryType}
                setDeliveryType={setDeliveryType}
                deliveryItems={deliveryItems}
                setDeliveryItems={setDeliveryItems}
                deliveryReturnReason={deliveryReturnReason}
                setDeliveryReturnReason={setDeliveryReturnReason}
                deliveryNotes={deliveryNotes}
                setDeliveryNotes={setDeliveryNotes}
                deliveryPassword={deliveryPassword}
                setDeliveryPassword={setDeliveryPassword}
                repiceDestination={repiceDestination}
                setRepiceDestination={setRepiceDestination}
                isConfirmingDelivery={isConfirmingDelivery}
                handleConfirmDelivery={handleConfirmDelivery}
            />

            <DeliveryHistoryModal 
                isOpen={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                historyTab={historyTab}
                setHistoryTab={setHistoryTab}
                historyFilters={historyFilters}
                setHistoryFilters={setHistoryFilters}
                drivers={drivers}
                vehicles={vehicles}
                loadHistory={loadHistory}
                historyLoading={historyLoading}
                historyData={historyData}
            />

            <DispatchControlModal 
                isOpen={!!assigningInvoice}
                onClose={() => { setAssigningInvoice(null); setScannedItems({}); }}
                invoice={assigningInvoice}
                scannedItems={scannedItems}
                handleBarcodeScan={handleBarcodeScan}
                isAccompanied={isAccompanied}
                setIsAccompanied={setIsAccompanied}
                helperCount={helperCount}
                setHelperCount={setHelperCount}
                selectedHelpers={selectedHelpers}
                setSelectedHelpers={setSelectedHelpers}
                allUsers={allUsers}
                user={user}
                drivers={drivers}
                activeRoutes={activeRoutes}
                signNowMap={signNowMap}
                setSignNowMap={setSignNowMap}
                signatureKeys={signatureKeys}
                setSignatureKeys={setSignatureKeys}
                showPasswordMap={showPasswordMap}
                setShowPasswordMap={setShowPasswordMap}
                isValidating={isValidating}
                handleConfirmDispatch={handleConfirmDispatch}
            />

            {/* MODAL: REASIGNAR PLACA / LIBERAR FACTURA */}
            {showReassignModal.isOpen && (
                <div className="fixed inset-0 z-[800] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">

                        {/* Header */}
                        <div className="px-7 pt-6 pb-4 border-b border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Gestión de Ruta</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">🚛 {showReassignModal.route?.plate}</p>
                                </div>
                                <button onClick={() => { setShowReassignModal({ isOpen: false, route: null }); setVehicleSearch(''); setVehicleDropOpen(false); setReassignTab('placa'); }}
                                    className="w-9 h-9 bg-slate-100 hover:bg-rose-50 hover:text-rose-500 rounded-full flex items-center justify-center text-slate-400 transition-all text-lg font-black">×</button>
                            </div>
                            {/* Tabs */}
                            <div className="flex gap-2">
                                <button onClick={() => setReassignTab('placa')}
                                    className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all
                                        ${reassignTab === 'placa' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                                    🔄 Cambio de Placa
                                </button>
                                <button onClick={() => { setReassignTab('factura'); loadModalInvoices(showReassignModal.route.id); }}
                                    className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all
                                        ${reassignTab === 'factura' ? 'bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-200' : 'bg-white border-slate-200 text-slate-500 hover:border-rose-300'}`}>
                                    📦 Liberar Factura
                                </button>
                            </div>
                        </div>

                        {/* ── TAB: CAMBIO DE PLACA ── */}
                        {reassignTab === 'placa' && (
                            <>
                                <div className="p-7 space-y-5 overflow-y-auto flex-1">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Nuevo Vehículo / Placa</label>
                                        <div className="relative">
                                            <div className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-indigo-400/30 cursor-text flex items-center gap-2"
                                                onClick={() => setVehicleDropOpen(true)}>
                                                <input
                                                    className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-900 placeholder:text-slate-400"
                                                    placeholder={reassignData.newVehicleId
                                                        ? (availableVehicles.find((v: any) => v.id === reassignData.newVehicleId)?.plate + ' — ' + availableVehicles.find((v: any) => v.id === reassignData.newVehicleId)?.driverName)
                                                        : 'Buscar placa o conductor...'}
                                                    value={vehicleSearch}
                                                    onChange={e => { setVehicleSearch(e.target.value); setVehicleDropOpen(true); }}
                                                    onFocus={() => setVehicleDropOpen(true)}
                                                />
                                                {reassignData.newVehicleId && (
                                                    <button onClick={e => { e.stopPropagation(); setReassignData({ ...reassignData, newVehicleId: '' }); setVehicleSearch(''); }}
                                                        className="text-slate-400 hover:text-rose-500 text-lg leading-none">×</button>
                                                )}
                                            </div>
                                            {vehicleDropOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setVehicleDropOpen(false)} />
                                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-56 overflow-y-auto">
                                                        {availableVehicles
                                                            .filter((v: any) => { const q = vehicleSearch.toLowerCase(); return !q || v.plate?.toLowerCase().includes(q) || v.driverName?.toLowerCase().includes(q); })
                                                            .map((v: any) => (
                                                                <button key={v.id}
                                                                    className={`w-full text-left px-4 py-3 text-sm font-bold hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${reassignData.newVehicleId === v.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
                                                                    onClick={() => { setReassignData({ ...reassignData, newVehicleId: v.id }); setVehicleSearch(''); setVehicleDropOpen(false); }}>
                                                                    <span className="font-black">{v.plate}</span>
                                                                    {v.driverName && <span className="text-slate-400 font-normal"> — {v.driverName}</span>}
                                                                </button>
                                                            ))}
                                                        {availableVehicles.filter((v: any) => { const q = vehicleSearch.toLowerCase(); return !q || v.plate?.toLowerCase().includes(q) || v.driverName?.toLowerCase().includes(q); }).length === 0 && (
                                                            <p className="px-4 py-3 text-xs text-slate-400 font-bold">Sin resultados</p>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Observación</label>
                                        <textarea className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 h-28 resize-none"
                                            placeholder="Motivo del cambio (ej: falla mecánica, calamidad...)"
                                            value={reassignData.observations}
                                            onChange={e => setReassignData({ ...reassignData, observations: e.target.value })} />
                                    </div>
                                </div>
                                <div className="px-7 py-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                                    <button className="px-5 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        onClick={() => { setShowReassignModal({ isOpen: false, route: null }); setVehicleSearch(''); setVehicleDropOpen(false); setReassignTab('placa'); }}>
                                        Cancelar
                                    </button>
                                    <button className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                                        onClick={handleReassignPlate} disabled={isReassigningPlate || !reassignData.newVehicleId}>
                                        {isReassigningPlate ? 'Procesando...' : 'Confirmar Cambio'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ── TAB: LIBERAR FACTURA ── */}
                        {reassignTab === 'factura' && (
                            <>
                                <div className="flex-1 overflow-y-auto">
                                    {loadingModalInvoices ? (
                                        <div className="flex items-center justify-center py-16">
                                            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : modalRouteInvoices.length === 0 ? (
                                        <div className="text-center py-16 text-slate-400">
                                            <p className="text-3xl mb-2">📦</p>
                                            <p className="text-sm font-bold">No hay facturas en esta ruta</p>
                                        </div>
                                    ) : (
                                        <div className="px-7 pt-5 space-y-2">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                    {selectedInvoicesToRemove.size} de {modalRouteInvoices.length} seleccionadas
                                                </p>
                                                <div className="flex gap-3">
                                                    <button onClick={() => setSelectedInvoicesToRemove(new Set(modalRouteInvoices.map(i => i.invoice_id)))}
                                                        className="text-[8px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest">Todas</button>
                                                    <span className="text-slate-300 text-[8px]">|</span>
                                                    <button onClick={() => setSelectedInvoicesToRemove(new Set())}
                                                        className="text-[8px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">Ninguna</button>
                                                </div>
                                            </div>
                                            {modalRouteInvoices.map((inv: any) => {
                                                const checked = selectedInvoicesToRemove.has(inv.invoice_id);
                                                return (
                                                    <label key={inv.invoice_id}
                                                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all
                                                            ${checked ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}>
                                                        <input type="checkbox" checked={checked} className="w-4 h-4 accent-rose-500 shrink-0"
                                                            onChange={() => {
                                                                setSelectedInvoicesToRemove(prev => {
                                                                    const next = new Set(prev);
                                                                    next.has(inv.invoice_id) ? next.delete(inv.invoice_id) : next.add(inv.invoice_id);
                                                                    return next;
                                                                });
                                                            }} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-black text-slate-900">{inv.invoice_number || inv.invoice_id}</p>
                                                            {inv.customer_name && <p className="text-[9px] text-slate-500 truncate">{inv.customer_name}</p>}
                                                        </div>
                                                        {inv.invoice_value && (
                                                            <span className="text-[9px] font-black text-slate-600 shrink-0">
                                                                ${Number(inv.invoice_value).toLocaleString('es-CO')}
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* Observación */}
                                    <div className="px-7 pt-4 pb-5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                            Observación <span className="text-rose-500">*</span>
                                        </label>
                                        <textarea className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-400/30 h-24 resize-none"
                                            placeholder="Motivo de liberación (ej: cliente no encontrado, dirección incorrecta...)"
                                            value={unassignObs}
                                            onChange={e => setUnassignObs(e.target.value)} />
                                    </div>
                                </div>
                                <div className="px-7 py-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                                    <button className="px-5 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                                        onClick={() => { setShowReassignModal({ isOpen: false, route: null }); setReassignTab('placa'); setUnassignObs(''); setSelectedInvoicesToRemove(new Set()); }}>
                                        Cancelar
                                    </button>
                                    <button className="flex-1 py-3 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                                        onClick={handleUnassignInvoices}
                                        disabled={isUnassigning || selectedInvoicesToRemove.size === 0 || !unassignObs.trim()}>
                                        {isUnassigning ? 'Liberando...' : `Liberar (${selectedInvoicesToRemove.size}) Factura${selectedInvoicesToRemove.size !== 1 ? 's' : ''}`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL: SOPORTE DE PAGO */}
            {voucherModal?.isOpen && (
                <PaymentVoucherModal
                    isOpen={voucherModal.isOpen}
                    onClose={() => setVoucherModal(null)}
                    invoice={voucherModal.invoice}
                    user={user}
                />
            )}

            {/* MODAL: CONTROL DE DEVOLUCIONES */}
            <ReturnsControlModal
                isOpen={showReturnsModal}
                onClose={() => setShowReturnsModal(false)}
                user={user}
            />
        </>
    );
};

export default LogisticsDispatch;

