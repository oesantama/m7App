
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Route, Invoice } from '../types';

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
    const [signatureKeys, setSignatureKeys] = useState<Record<string, string>>({});
    const [signNowMap, setSignNowMap] = useState<Record<string, boolean>>({});
    const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");

    const [vehicleLocations, setVehicleLocations] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
    const [isValidating, setIsValidating] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<{ [key: string]: L.Marker }>({});
    const routeLinesRef = useRef<{ [key: string]: L.Polyline }>({});
    const routeMarkersRef = useRef<L.Marker[]>([]);
    const routePolylineRef = useRef<L.Polyline | null>(null);
    const [fetchStatus, setFetchStatus] = useState<string>('IDLE');
    
    // MODALES DE INTERACCIÓN MEJORADA
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);
    const [signatureInputModal, setSignatureInputModal] = useState<{ isOpen: boolean, invoice: any, onConfirm: (pass: string) => void } | null>(null);

    // ENTREGA AL CLIENTE
    const [deliveryModal, setDeliveryModal] = useState<{
        isOpen: boolean;
        invoice: any;
        route: any;
    } | null>(null);
    const [deliveryType, setDeliveryType] = useState<'FULL' | 'PARTIAL' | 'RETURN'>('FULL');
    const [deliveryItems, setDeliveryItems] = useState<any[]>([]);
    const [deliveryNotes, setDeliveryNotes] = useState('');
    const [deliveryReturnReason, setDeliveryReturnReason] = useState('');
    const [deliveryPassword, setDeliveryPassword] = useState('');
    const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);

    // TAB HISTORIAL
    const [historyTab, setHistoryTab] = useState<'ENTREGAS' | 'DEVOLUCIONES'>('ENTREGAS');
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyFilters, setHistoryFilters] = useState({
        invoiceId: '', driverId: '', vehicleId: '', dateFrom: '', dateTo: '', deliveryType: '', status: ''
    });

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

    // 3. Generación de Planilla Profesional (Unificada & Refinada)
    const generateRoutePDF = (route: any) => {
        const despachador = user.name || 'SISTEMA ORBIT';
        const driverName = route.driver_name !== 'S/A' ? route.driver_name : 'Óscar Santamaría';

        // 0. Logo del Cliente Dinámico (Soporte multi-campo & Base64 robusto)
        const currentClient = (clients || []).find(c => String(c.id) === String(selectedClient));
        let clientLogo = currentClient?.logo_url || currentClient?.logoUrl || currentClient?.logo || currentClient?.avatar || '';
        
        // Si es base64 y le falta el prefijo, lo agregamos
        if (clientLogo && !clientLogo.startsWith('http') && !clientLogo.startsWith('data:')) {
            clientLogo = `data:image/png;base64,${clientLogo}`;
        }
        if (!clientLogo) clientLogo = 'https://placehold.co/150x50?text=CLIENTE+LOGO';

        // 1. Obtener facturas asociadas para consolidación y cálculos
        const routeInvoices = invoices.filter(inv => {
           const rid = route.invoice_ids || route.invoiceIds || [];
           return rid.includes(String(inv.id)) || rid.includes(String(inv.invoiceNumber)) || rid.includes(inv.docLId);
        });

        // Cálculos de Cabecera y Resumen basados en las facturas filtradas
        const totalItemsCount = routeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.totalItems) || 0), 0);
        const totalValue = routeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.invoiceValue) || 0), 0);
        const totalVolume = routeInvoices.reduce((acc: number, inv: any) => acc + (Number(inv.volumeM3) || 0), 0);

        const cargoMap = new Map<string, { id: string, name: string, total: number, unit?: string }>();
        routeInvoices.forEach(inv => {
          inv.items?.forEach((it: any) => {
            const id = it.sku || it.articleId || it.id || 'N/A';
            const name = it.articleName || it.name || id;
            if (!cargoMap.has(id)) cargoMap.set(id, { id, name, total: 0, unit: it.unit });
            cargoMap.get(id)!.total += Number(it.qty || it.expectedQty || it.quantity || 0);
          });
        });

        // 2. Lógica de Totales Verídicos
        const cashTotal = routeInvoices.reduce((acc, inv) => {
          const method = String((inv as any).paymentMethod || inv.items?.[0]?.paymentMethod || 'EF').toUpperCase();
          const isCash = method === 'EF' || method === 'CONTADO' || method === 'EFECTIVO';
          return isCash ? acc + (Number(inv.invoiceValue) || 0) : acc;
        }, 0);

        const creditTotal = routeInvoices.reduce((acc, inv) => {
          const method = String((inv as any).paymentMethod || inv.items?.[0]?.paymentMethod || '').toUpperCase();
          const isCredit = method.includes('30D') || method.includes('60D') || method.includes('CREDIT') || method === 'CR';
          return isCredit ? acc + (Number(inv.invoiceValue) || 0) : acc;
        }, 0);
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // Construcción del HTML mediante template literal PURO (sin sintaxis React)
        const html = `
          <html>
            <head>
              <title>PLANILLA - ${route.plate}</title>
              <style>
                @page { size: letter landscape; margin: 0.3cm; }
                body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 7.5px; }
                .compact-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 8px; }
                .logo-img { max-height: 45px; max-width: 150px; object-fit: contain; }
                .header-info-grid { display: flex; gap: 12px; }
                .info-col { display: flex; flex-direction: column; line-height: 1.1; }
                .info-label { font-size: 6px; font-weight: 800; color: #64748b; text-transform: uppercase; }
                .info-val { font-size: 9px; font-weight: 900; }

                .content-flex { display: flex; gap: 10px; align-items: flex-start; }
                .table-main { flex: 0 0 72%; }
                .table-side { flex: 1; }

                table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
                th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 3px; font-size: 6px; font-weight: 900; text-transform: uppercase; }
                td { border: 1px solid #cbd5e1; padding: 2px 3px; font-weight: 700; height: 13px; font-size: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }

                .top-grid { display: grid; grid-template-columns: 2.2fr 1fr; gap: 15px; margin-bottom: 5px; }
                .totals-box { border: 2px solid #000; border-radius: 4px; overflow: hidden; }
                .total-row { display: flex; justify-content: space-between; padding: 3px 8px; border-bottom: 1px solid #e2e8f0; }
                .total-row:last-child { border-bottom: none; background: #f8fafc; font-weight: 900; font-size: 9px; }
                .bank-strip { background: #0f172a; color: #fff; text-align: center; padding: 2px; font-weight: 900; margin-bottom: 5px; font-size: 7px; }
                
                .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 30px; padding: 0 40px; }
                .sig-box { border-top: 2px solid #0f172a; text-align: center; padding-top: 8px; font-weight: 900; text-transform: uppercase; font-size: 9px; }
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
                   <div class="info-col"> <span class="info-label">Operación (DOC L)</span> <span class="info-val">${routeInvoices[0]?.docLId || 'S/N'}</span> </div>
                   <div class="info-col"> <span class="info-label">Fecha</span> <span class="info-val">${new Date().toLocaleDateString('es-CO')}</span> </div>
                   <div class="info-col"> <span class="info-label">Vehículo</span> <span class="info-val">${route.plate || 'N/A'}</span> </div>
                   <div class="info-col"> <span class="info-label">FACTURAS</span> <span class="info-val">${routeInvoices.length}</span> </div>
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
                  <div class="total-row"><span>TOTAL RECAUDO:</span> <span style="font-weight:900;">$ ${cashTotal.toLocaleString()}</span></div>
                </div>
              </div>

              <div class="bank-strip">🏦 CUENTA CORRIENTE BANCOLOMBIA 217-392356-56 (RECAUDO OFICIAL)</div>

              <div class="content-flex">
                <div class="table-main">
                  <table>
                    <thead>
                      <tr>
                        <th width="35">U.NEG</th>
                        <th width="75">FACTURA</th>
                        <th width="75"># INTERNO</th>
                        <th width="85">REF CLIENTE</th>
                        <th width="75">VALOR</th>
                        <th width="35">C.PAG</th>
                        <th>CLIENTE / DIRECCIÓN</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${routeInvoices.map(inv => {
                        const firstItem = inv.items?.[0] || {} as any;
                        const method = String(inv.paymentMethod || firstItem.paymentMethod || '-').toUpperCase();
                        return `
                          <tr>
                            <td class="text-center">${inv.unCode || firstItem.unCode || firstItem.un_code || '-'}</td>
                            <td class="text-center" style="font-weight:900;">${inv.invoiceNumber}</td>
                            <td class="text-center">${inv.orderNumber || inv.docLId || '-'}</td>
                            <td class="text-center">${inv.clientRef || firstItem.clientRef || firstItem.client_ref || '-'}</td>
                            <td class="text-right" style="font-family: monospace;">$ ${(inv.invoiceValue || 0).toLocaleString()}</td>
                            <td class="text-center" style="background:#f8fafc; font-weight:900;">${method}</td>
                            <td><div style="font-weight:900">${inv.customerName}</div><div style="font-size:6px; color:#64748b; font-weight:normal;">${inv.address}</div></td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>

                <div class="table-side">
                  <div style="font-weight:900; font-size:7px; border-bottom:1.5px solid #000; margin-bottom:3px; text-transform:uppercase;">📦 CONSOLIDADO</div>
                  <table>
                    <thead>
                      <tr>
                        <th width="70%">ID</th><th width="30%">CANT</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(() => {
                        const items = Array.from(cargoMap.values()).sort((a, b) => a.id.localeCompare(b.id));
                        return items.map(it => `
                          <tr>
                            <td class="text-center" style="font-size:6.5px;">${it.id}</td>
                            <td class="text-center" style="font-weight:900; background:#fefce8;">${it.total}</td>
                          </tr>
                        `).join('');
                      })()}
                    </tbody>
                  </table>
                </div>
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


    // Helper for robust ID matching
    const cleanId = (id: any) => String(id).trim().replace(/[\r\n\t\f\v ]/g, '');

    // Unified function to load invoices (Hybrid: Local + Fetch Fallback)
    const loadRouteInvoicesData = async (route: any, setFn: (data: any[]) => void, drawMap: boolean = false) => {
        const rawIds = route.invoice_ids || route.invoiceIds || [];
        if (!rawIds.length) {
            setFn([]);
            return;
        }

        // 1. Clean IDs
        const targetIds = rawIds.map((id: any) => {
            const val = typeof id === 'object' && id !== null ? (id.id || id.invoice_id) : id;
            return cleanId(val);
        });

        // 2. Try Local Match
        const localMatches = invoices.filter(inv => {
            const invId = cleanId(inv.id);
            const invNum = cleanId(inv.invoiceNumber); 
            return targetIds.includes(invId) || targetIds.includes(invNum);
        });

        // 3. Fallback to API if we don't have all invoices locally
        if (localMatches.length < rawIds.length) {
            console.log(`[ROUTE-DEBUG] Missing ${rawIds.length - localMatches.length} invoices locally. Fetching...`);
            setFetchStatus('FETCHING'); 
            try {
                const idsParam = targetIds.join(',');
                // Use centralized API method
                const paramsData = await api.getInvoices(undefined, idsParam);
                
                if (Array.isArray(paramsData)) {
                    setFetchStatus(`OK (${paramsData.length})`);
                    setFn(paramsData);
                    if (drawMap) drawRouteOnMap(paramsData);
                    return; // Exit, we have fresh data
                } else {
                    setFetchStatus('ERROR (Invalid Data)');
                }
            } catch (e: any) {
                console.error("Error fetching route invoices fallback:", e);
                setFetchStatus(`ERROR: ${e.message}`);
            }
        } else {
            setFetchStatus('SKIPPED (Local Match OK)');
        }

        // Default to local matches if fetch skipped or failed
        setFn(localMatches);
        if (drawMap) drawRouteOnMap(localMatches);
    };

    // Geocodifica una dirección a través del BACKEND (proxy para evitar CORS con Nominatim)
    const geocodeAddress = async (inv: any): Promise<[number, number] | null> => {
        const city = inv.city || inv.municipio || '';
        const address = inv.address || inv.direccion || inv.customerAddress || inv.shipAddress || '';

        // Si las coordenadas propias son distintas al punto genérico de Medellín, usarlas
        if (inv.lat && inv.lng) {
            const lat = Number(inv.lat);
            const lng = Number(inv.lng);
            if (Math.abs(lat - 6.2518) > 0.001 || Math.abs(lng + 75.5636) > 0.001) {
                return [lat, lng];
            }
        }

        if (!address && !city) return null;

        try {
            const params = new URLSearchParams();
            if (address) params.set('address', address);
            if (city) params.set('city', city);

            // Llamar al backend proxy (sin CORS, con caché y rate-limit)
            const res = await fetch(`/api/geocode?${params.toString()}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.success && data.coords) {
                return data.coords as [number, number];
            }
        } catch (e) {
            console.warn('[M7-GEO] Error al llamar proxy geocoding:', e);
        }
        return null;
    };


    // Algoritmo Nearest-Neighbor para ruta óptima (Greedy TSP)
    const optimizeRouteOrder = (
        origin: [number, number],
        points: { inv: any; coords: [number, number] }[]
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

        // Limpiar visualización previa
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];
        if (routePolylineRef.current) {
            routePolylineRef.current.remove();
            routePolylineRef.current = null;
        }

        // Marcador de estado "cargando"
        const loadingToast = toast.loading(`📍 Geocodificando ${data.length} puntos de entrega...`);

        // Geocodificar todas las facturas en paralelo (con pequeño delay para respetar Nominatim)
        const geocoded: { inv: any; coords: [number, number] }[] = [];
        for (let i = 0; i < data.length; i++) {
            const inv = data[i];
            const coords = await geocodeAddress(inv);
            if (coords) {
                geocoded.push({ inv, coords });
            }
            // Pequeña pausa entre peticiones para no saturar Nominatim (1 req/seg)
            if (i < data.length - 1) await new Promise(r => setTimeout(r, 300));
        }

        toast.dismiss(loadingToast);

        if (geocoded.length === 0) {
            toast.error('No se pudieron geocodificar las direcciones. Verifique ciudad y dirección en las facturas.');
            return;
        }

        // Ordenar puntos con Nearest-Neighbor desde el HUB M7
        const origin: [number, number] = [M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng];
        const optimized = optimizeRouteOrder(origin, geocoded);

        // Construir lista de puntos para la polyline
        const points: L.LatLng[] = [L.latLng(origin[0], origin[1])];

        optimized.forEach(({ inv, coords }, idx) => {
            const pos = L.latLng(coords[0], coords[1]);
            points.push(pos);

            // Color del marcador según estado
            const isDelivered = inv.status === 'EST-11' || inv.status === 'COMPLETED' || inv.status === 'Entregado';
            const markerColor = isDelivered ? '#10b981' : '#1e293b';
            const textColor = isDelivered ? '#fff' : '#10b981';

            const icon = L.divIcon({
                className: 'custom-invoice-marker',
                html: `
                    <div style="
                        width:32px; height:32px;
                        background:${markerColor};
                        border:3px solid ${isDelivered ? '#059669' : '#10b981'};
                        border-radius:50%;
                        display:flex; align-items:center; justify-content:center;
                        font-size:11px; font-weight:900; color:${textColor};
                        box-shadow:0 4px 12px rgba(0,0,0,0.3);
                        position:relative;
                    ">
                        ${idx + 1}
                        ${isDelivered ? '<div style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#10b981;border-radius:50%;border:2px solid white">✓</div>' : ''}
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const city = inv.city || '';
            const address = inv.address || inv.customerAddress || 'Sin dirección';
            const notes = inv.notes || inv.observaciones || '';
            const statusLabel = isDelivered ? '✅ ENTREGADO' : '⏳ PENDIENTE';

            const marker = L.marker(pos, { icon })
                .addTo(mapRef.current!)
                .bindPopup(`
                    <div style="min-width:180px; font-family:system-ui; padding:4px">
                        <div style="font-size:9px; font-weight:900; color:#64748b; text-transform:uppercase; letter-spacing:.05em">Entrega #${idx + 1}</div>
                        <div style="font-size:13px; font-weight:900; color:#0f172a; margin:2px 0">#${inv.invoiceNumber || inv.id}</div>
                        <div style="height:1px; background:#f1f5f9; margin:4px 0"></div>
                        <div style="font-size:10px; font-weight:700; color:#475569; text-transform:uppercase">${inv.customerName || ''}</div>
                        <div style="font-size:10px; color:#64748b; margin-top:2px">📍 ${city}${city && address ? ' — ' : ''}${address}</div>
                        ${notes ? `<div style="font-size:9px; color:#94a3b8; margin-top:2px; font-style:italic">📝 ${notes}</div>` : ''}
                        <div style="margin-top:4px; font-size:9px; font-weight:900; color:${isDelivered ? '#10b981' : '#f59e0b'}">${statusLabel}</div>
                        <div style="font-size:9px; color:#94a3b8">${Number(inv.volumeM3 || 0).toFixed(2)} m³</div>
                    </div>
                `);
            routeMarkersRef.current.push(marker);
        });

        // Añadir marcador de regreso al HUB al final
        points.push(L.latLng(origin[0], origin[1]));

        // Dibujar polyline con la ruta optimizada
        if (points.length > 2) {
            routePolylineRef.current = L.polyline(points, {
                color: '#0ea5e9',
                weight: 4,
                opacity: 0.85,
                dashArray: '8, 12'
            }).addTo(mapRef.current!);

            const bounds = L.latLngBounds(points);
            mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        }

        toast.success(`🗺️ Ruta optimizada: ${optimized.length} de ${data.length} puntos geocodificados`, { duration: 4000, icon: '🚚' });
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

    // Effect to load data for MODAL specifically
    useEffect(() => {
        if (selectedActiveRoute) {
            loadRouteInvoicesData(selectedActiveRoute, setRouteInvoices, false);
        }
    }, [selectedActiveRoute, invoices]);

    // 5. Auto-reporte de ubicación y WakeLock (Mantener pantalla encendida)
    useEffect(() => {
        if (!navigator.geolocation) return;

        let wakeLock: any = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                    console.log('[M7-WAKE] Pantalla bloqueada encendida');
                }
            } catch (err) {
                console.warn('[M7-WAKE-ERR]', err);
            }
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
                        } catch (e) {
                            console.warn('[M7-GPS-REPORT-SILENT-ERR]', e);
                        }
                    }
                },
                (err) => console.warn('[M7-GPS-PERM-DENIED]', err.message),
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
            console.error("Error fetching pending signatures:", e);
        }
    };

    const fetchAllUsers = async () => {
        try {
            const data = await api.getUsers();
            setAllUsers(data);
        } catch (e) {
            console.error("Error fetching all users:", e);
        }
    };

    useEffect(() => {
        fetchLocations();
        fetchPendingSignatures();
        fetchAllUsers();
        const interval = setInterval(fetchLocations, 60000); 
        return () => clearInterval(interval);
    }, []);

    // FILTRO DE PRIVACIDAD POR ROL DE CONDUCTOR
    const filteredRoutes = React.useMemo(() => {
        if (!user) return [];
        // Si es CONDUCTOR (ROL-03), solo mostrar sus rutas por documento
        if (user.roleId === 'ROL-03' || user.roleId === 'CONDUCTOR') {
            const userDoc = String(user.documentNumber || '').trim();
            if (!userDoc) return [];
            
            return activeRoutes.filter(route => {
                // 1. Verificar si la ruta tiene el documento pegado
                if (String(route.driver_document || '').trim() === userDoc) return true;
                
                // 2. Verificar vía asignación activa
                const link = assignments.find(a => a.driverId === route.driver_id && a.isActive);
                const drv = drivers.find(d => d.id === link?.driverId);
                return String(drv?.documentNumber || '').trim() === userDoc;
            });
        }
        // Admin u otros roles ven todo
        return activeRoutes;
    }, [activeRoutes, user, assignments, drivers]);

    // FILTRA UBICACIONES GPS BASADAS EN LAS RUTAS VISIBLES
    const filteredLocations = React.useMemo(() => {
        const visibleVehicleIds = new Set(filteredRoutes.map(r => r.vehicle_id));
        return vehicleLocations.filter(loc => visibleVehicleIds.has(loc.vehicle_id));
    }, [filteredRoutes, vehicleLocations]);

    // LOGICA DE NEGOCIO PARA DESPACHO (MOVIDA ANTES DEL RETURN)
    const handleBarcodeScan = async (barcode: string) => {
        if (!assigningInvoice) return;
        const item = (assigningInvoice.items || []).find((it: any) => it.sku === barcode || it.barcode === barcode);
        if (!item) {
            toast.error(`Artículo no encontrado: ${barcode}`);
            return;
        }
        const currentCount = scannedItems[item.sku] || 0;
        const expected = Number(item.qty || item.expectedQty || 0);
        if (currentCount >= expected) {
            toast.warning(`Cantidad máxima alcanzada para ${item.articleName || item.sku} (${currentCount}/${expected})`);
            return;
        }
        setScannedItems({
            ...scannedItems,
            [item.sku]: currentCount + 1
        });
        toast.success(`Escaneado: ${item.articleName || item.sku}`);
    };

    const handleConfirmDispatch = async () => {
        if (!assigningInvoice) return;
        const totalScanned = Object.values(scannedItems).reduce((a,b)=>a+b, 0);
        if (totalScanned === 0) {
            toast.error("Debe escanear al menos un artículo.");
            return;
        }
        const totalExpected = (assigningInvoice.items || []).reduce((a: any, b: any) => a + Number(b.qty || b.expectedQty || 0), 0);
        if (totalScanned < totalExpected) {
             setConfirmModal({
                isOpen: true,
                title: "Entrega Parcial",
                message: `Faltan artículos (${totalScanned}/${totalExpected}). ¿Continuar?`,
                onConfirm: processDispatchConfirmation
             });
             return;
        }
        processDispatchConfirmation();
    };

    const processDispatchConfirmation = async () => {
        if (!assigningInvoice) return;
        const route = activeRoutes.find(r => r.id === (assigningInvoice.route_id || assigningInvoice.routeId));
        // Priorizar conductor vinculado a la ruta
        const actualDriver = drivers.find(d => d.id === route?.driver_id || d.id === route?.driverId);

        if ((signNowMap[user.id] !== false && !signatureKeys[user.id])) {
            toast.error(`Falta firma de ${user.name}`); return;
        }
        if (actualDriver && signNowMap[actualDriver.id] !== false && !signatureKeys[actualDriver.id]) {
            toast.error(`Falta firma de ${actualDriver.name}`); return;
        }

        setIsValidating(true);
        try {
            const signatures = [];
            signatures.push({ userId: user.id, role: 'DISPATCHER', signNow: signNowMap[user.id] !== false, password: signatureKeys[user.id] });
            if (actualDriver) signatures.push({ userId: actualDriver.id, role: 'DRIVER', signNow: signNowMap[actualDriver.id] !== false, password: signatureKeys[actualDriver.id] });
            
            if (isAccompanied) {
                selectedHelpers.slice(0, helperCount).forEach(hid => {
                    if (hid) signatures.push({ userId: hid, role: 'HELPER', signNow: signNowMap[hid] !== false, password: signatureKeys[hid] });
                });
            }

            const res = await api.initDispatch({
                invoiceId: assigningInvoice.id || assigningInvoice.invoiceNumber,
                driverId: actualDriver?.id || user.id,
                helperIds: isAccompanied ? selectedHelpers.slice(0, helperCount).filter(Boolean) : [],
                scannedItems,
                isAccompanied,
                helperCount: isAccompanied ? helperCount : 0,
                createdBy: user.id,
                signatures
            });
            if (res.success) {
                toast.success("Despacho exitoso");
                setAssigningInvoice(null);
                setScannedItems({});
                onRefresh();
                fetchPendingSignatures();
            }
        } catch (e: any) { toast.error(e.message); } finally { setIsValidating(false); }
    };

    const handleDelayedSignature = async (inv: any) => {
        setSignatureInputModal({
            isOpen: true,
            invoice: inv,
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
                onRefresh();
            }
        } catch (e: any) { toast.error(e.message); } finally { setIsValidating(false); }
    };

    // ─── CONFIRMACIÓN ENTREGA AL CLIENTE ─────────────────────────────────────
    const handleConfirmDelivery = async () => {
        if (!deliveryModal?.invoice) return;
        if (!deliveryPassword) { toast.error('Ingresa la contraseña del conductor'); return; }

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
                password: deliveryPassword,
            });

            if (res.success) {
                const msg = deliveryType === 'FULL'
                    ? '✅ Entrega completa registrada'
                    : deliveryType === 'PARTIAL'
                    ? '⚠️ Entrega parcial – devolución creada'
                    : '🔄 Devolución total registrada';
                toast.success(msg);
                setDeliveryModal(null);
                onRefresh(); // Refresca el estado de las facturas
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
                        onClick={() => setShowHistoryModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 text-[8px] font-black uppercase tracking-widest transition-all group"
                    >
                        <Icons.History className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                        <span>Historial</span>
                    </button>
                    <button 
                        onClick={fetchLocations}
                        disabled={isValidating}
                        className={`w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 hover:bg-emerald-400 transition-all ${isValidating ? 'animate-spin' : ''}`}
                    >
                        <Icons.RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </header>

                <main className="flex-1 flex overflow-hidden">
                    {/* Lista de Rutas Lateral - Más delgada y sólida */}
                    <div className="w-[340px] border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar p-4 space-y-3 shrink-0">
                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-1">Unidades en Ruta</h3>
                        {activeRoutes.length === 0 ? (
                            <div className="text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">Esperando despacho...</p>
                            </div>
                        ) : (
                            activeRoutes.map((route) => {
                                const vehicleData = vehicles.find(v => v.id === route.vehicle_id);
                                const totalVolume = (route.invoice_ids || []).reduce((acc: number, id: string) => {
                                    const cleanId = String(id).trim().replace(/[\r\n\t\f\v ]/g, '');
                                    const inv = invoices.find(i => String(i.id).trim().replace(/[\r\n\t\f\v ]/g, '') === cleanId);
                                    return acc + Number(inv?.volumeM3 || 0);
                                }, 0);
                                const utilizationPercent = vehicleData ? (totalVolume / vehicleData.capacityM3) * 100 : 0;

                                return (
                                    <div key={route.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 group hover:shadow-md transition-all border-l-4 border-l-slate-900 hover:border-l-emerald-500">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-black text-slate-900 leading-none">{route.plate}</h4>
                                            <div className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                                {utilizationPercent.toFixed(0)}% Cap.
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setVisualizedRoute(route)}
                                                className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${visualizedRoute?.id === route.id ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                                            >
                                                {visualizedRoute?.id === route.id ? '📍 Rastreo On' : 'Ver Mapa'}
                                            </button>
                                            <button 
                                                onClick={() => setSelectedActiveRoute(route)}
                                                className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-700 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all"
                                            >
                                                Docs
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* MAPA EXPANDIDO TOTAL */}
                    <div className="flex-1 relative bg-slate-950">
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
                    </div>
                </main>
            </div>

            {/* Modal de Detalle Mejorado */}
            {selectedActiveRoute && (
                <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-[90vw] max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300">
                        {/* HEADER COMPACTO */}
                        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-emerald-50 rounded-t-[2rem]">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center shadow-md shrink-0">
                                        <Icons.Truck className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">Detalle de Despacho</h3>
                                        <p className="text-[9px] font-bold text-slate-500 uppercase">
                                            Ruta {selectedActiveRoute.plate} • {(() => {
                                                if (selectedActiveRoute.driver_name && selectedActiveRoute.driver_name !== 'S/A') return selectedActiveRoute.driver_name;
                                                const link = assignments.find(a => a.vehicleId === selectedActiveRoute.vehicle_id && a.isActive);
                                                const drv = drivers.find(d => d.id === link?.driverId);
                                                return drv?.name || 'CONDUCTOR EXTERNO';
                                            })()} • 📌 {routeInvoices.length} Puntos
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedActiveRoute(null)} className="w-7 h-7 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                                    <Icons.X className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                            </div>
                            {/* BUSCADOR + MÉTRICAS en el header */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative flex-1 min-w-[160px]">
                                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="BUSCAR FACTURA O CLIENTE..."
                                        value={invoiceSearchQuery}
                                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all"
                                    />
                                </div>
                                {/* MÉTRICAS INLINE */}
                                <div className="flex items-center gap-2">
                                    <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-center">
                                        <p className="text-[6px] font-black text-slate-400 uppercase">FACTURAS</p>
                                        <p className="text-sm font-black text-slate-900 leading-none">{routeInvoices.length}</p>
                                    </div>
                                    <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-center">
                                        <p className="text-[6px] font-black text-slate-400 uppercase">ENTREGADAS</p>
                                        <p className="text-sm font-black text-emerald-600 leading-none">
                                            {routeInvoices.filter(inv => ['EST-12','EST-13','COMPLETED','Entregado'].includes(inv.status)).length}
                                            <span className="text-[8px] text-slate-300">/{routeInvoices.length}</span>
                                        </p>
                                    </div>
                                    <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-center">
                                        <p className="text-[6px] font-black text-slate-400 uppercase">VOL.</p>
                                        <p className="text-sm font-black text-emerald-600 leading-none">{routeInvoices.reduce((acc: number, inv: any) => acc + Number(inv.volumeM3 || 0), 0).toFixed(1)}m³</p>
                                    </div>
                                    <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-center min-w-[70px]">
                                        <div className="flex justify-between">
                                            <p className="text-[6px] font-black text-slate-400 uppercase">CAPAC.</p>
                                            <span className="text-[6px] font-black text-emerald-600">{Math.round((routeInvoices.reduce((acc: number, inv: any) => acc + Number(inv.volumeM3 || 0), 0) / (vehicles.find(v => v.id === selectedActiveRoute.vehicle_id)?.capacityM3 || 1)) * 100)}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1 rounded-full mt-1">
                                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, (routeInvoices.reduce((acc: number, inv: any) => acc + Number(inv.volumeM3 || 0), 0) / (vehicles.find(v => v.id === selectedActiveRoute.vehicle_id)?.capacityM3 || 1)) * 100)}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="px-3 py-1.5 bg-white rounded-xl border border-slate-200 text-center">
                                        <p className="text-[6px] font-black text-slate-400 uppercase">ESTADO</p>
                                        <p className="text-[9px] font-black text-emerald-600 uppercase leading-tight">{selectedActiveRoute.status === 'EN_RUTA' ? '🚚 TRANS.' : '✅ OK'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 custom-scrollbar">
                            {/* ETIQUETA DESGLOSE - Ahora sólo decorativa y compacta */}
                            <div className="flex items-center gap-2 px-1 py-1">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Desglose de Documentos</p>
                                <span className="text-[8px] font-black text-slate-300">{routeInvoices.length} FACTURAS</span>
                                <div className="h-0.5 flex-1 bg-slate-100 rounded"></div>
                                <p className="text-[8px] font-black text-emerald-500 uppercase">GESTIÓN DE RUTA</p>
                            </div>
                                
                                {/* LISTA COMPACTA DE FACTURAS */}
                            <div className="space-y-1 overflow-y-auto custom-scrollbar pb-4">
                                {routeInvoices
                                    .filter(inv => {
                                        const query = invoiceSearchQuery.toLowerCase();
                                        return (inv.invoiceNumber || "").toLowerCase().includes(query) || 
                                               (inv.customerName || "").toLowerCase().includes(query) ||
                                               (inv.id || "").toLowerCase().includes(query);
                                    })
                                    .map((inv: any, idx: number) => {
                                        const hasPendingSignature = pendingSignatures.some(ps => ps.invoiceId === inv.id || ps.invoiceId === inv.invoiceNumber);
                                        return (
                                            <div key={`${inv.id || idx}-${idx}`} className="px-3 py-2 bg-white border border-slate-100 rounded-2xl flex items-center justify-between gap-3 hover:border-emerald-400/40 hover:shadow-sm transition-all group">
                                                {/* Número de orden */}
                                                <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center text-emerald-400 font-black text-[10px] shrink-0 group-hover:scale-105 transition-all">
                                                    {idx + 1}
                                                </div>
                                                {/* Info principal */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-[11px] font-black text-slate-900">#{inv?.invoiceNumber || inv.id || 'N/A'}</p>
                                                        {hasPendingSignature && (
                                                            <span className="bg-amber-100 text-amber-700 text-[7px] font-black px-1.5 py-0.5 rounded-full animate-pulse uppercase">FIRMA</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[140px]">{inv?.customerName || 'S/N'}</p>
                                                        {inv?.city && <>
                                                            <div className="w-0.5 h-0.5 bg-slate-200 rounded-full"></div>
                                                            <p className="text-[8px] font-bold text-slate-300 uppercase">{inv.city}</p>
                                                        </>}
                                                        <div className="w-0.5 h-0.5 bg-slate-200 rounded-full"></div>
                                                        <p className="text-[8px] font-black text-emerald-500 uppercase">{Number(inv?.volumeM3 || 0).toFixed(2)}m³</p>
                                                    </div>
                                                </div>
                                                {/* Botones compactos */}
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button 
                                                        onClick={() => setViewingItemsInvoice(inv)}
                                                        className="px-2.5 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-[8px] font-black uppercase hover:bg-slate-200 transition-all flex items-center gap-1 border border-slate-200"
                                                    >
                                                        <Icons.Eye className="w-3 h-3" />
                                                        Art.
                                                    </button>
                                                    {/* DESPACHAR - solo para facturas pendientes/sin despachar */}
                                                    {!['EST-11','EST-12','EST-13','COMPLETED','Entregado'].includes(inv.status) && !inv.dispatchId && (
                                                        <button 
                                                            onClick={() => setAssigningInvoice(inv)}
                                                            className="px-2.5 py-1.5 bg-slate-900 text-emerald-400 rounded-lg text-[8px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1 border border-slate-700"
                                                        >
                                                            <Icons.Scan className="w-3 h-3" />
                                                            Despachar
                                                        </button>
                                                    )}
                                                    {/* ENTREGAR CLIENTE - solo para facturas en ruta (EST-11) */}
                                                    {inv.status === 'EST-11' && (
                                                        <button 
                                                            onClick={() => {
                                                                const route = selectedActiveRoute;
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
                                                                setDeliveryNotes('');
                                                                setDeliveryReturnReason('');
                                                                setDeliveryPassword('');
                                                                setDeliveryModal({ isOpen: true, invoice: inv, route });
                                                            }}
                                                            className="px-2.5 py-1.5 bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase hover:bg-emerald-600 transition-all flex items-center gap-1 shadow-md shadow-emerald-200"
                                                        >
                                                            <Icons.CheckCircle className="w-3 h-3" />
                                                            Entregar Cliente
                                                        </button>
                                                    )}
                                                    {/* Badge estado entregado/devuelto */}
                                                    {['EST-12','EST-13'].includes(inv.status) && (
                                                        <span className={`px-2 py-1 rounded-lg text-[7px] font-black uppercase ${
                                                            inv.status === 'EST-12' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                            {inv.status === 'EST-12' ? '✅ Entregado' : '⚠️ Parcial'}
                                                        </span>
                                                    )}
                                                    {hasPendingSignature && (
                                                        <button 
                                                            onClick={() => handleDelayedSignature(inv)}
                                                            className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-[8px] font-black uppercase hover:bg-indigo-700 transition-all flex items-center gap-1"
                                                        >
                                                            <Icons.Signature className="w-3 h-3" />
                                                            Firmar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                                </div>
                        <div className="p-8 bg-gradient-to-r from-slate-50 to-emerald-50 border-t border-slate-100 rounded-b-[2.5rem] flex gap-4">
                            <button
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                                onClick={() => {
                                    generateRoutePDF(selectedActiveRoute);
                                    setSelectedActiveRoute(null);
                                }}
                                disabled={isGeneratingPDF}
                            >
                                {isGeneratingPDF ? (
                                    <>
                                        <Icons.RotateCcw className="w-4 h-4 animate-spin" />
                                        Generando...
                                    </>
                                ) : (
                                    <>
                                        <Icons.FileText className="w-4 h-4" />
                                        Descargar Planilla PDF
                                    </>
                                )}
                            </button>
                            <button
                                className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                                onClick={() => setSelectedActiveRoute(null)}
                            >
                                Cerrar Vista
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

            {/* MODAL: ASIGNACIÓN DE ENTREGA (ESCANEADO) */}
            {assigningInvoice && (
                <div className="fixed inset-0 z-[700] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-[95vw] max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
                                    <Icons.Scan className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Control de Despacho</h3>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Validación de carga por escaneo</p>
                                </div>
                            </div>
                            <button onClick={() => { setAssigningInvoice(null); setScannedItems({}); }} className="w-10 h-10 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all">
                                <Icons.X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center justify-center gap-4">
                             <input 
                                id="m7-dispatch-barcode-input"
                                type="text"
                                autoFocus
                                autoComplete="off"
                                placeholder="ESCANEANDO... ESPERANDO BARCODE"
                                className="bg-transparent text-center text-sm font-mono font-black text-slate-900 outline-none w-full max-w-md"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = e.currentTarget.value.trim();
                                        if (val) {
                                            handleBarcodeScan(val);
                                            e.currentTarget.value = '';
                                        }
                                    }
                                }}
                             />
                             <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Lectora Activa</span>
                             </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Lista de Artículos y Progreso */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-2 flex justify-between">
                                        <span>Artículos a Cargar</span>
                                        <span className="text-emerald-600">PROGRESO: {Object.values(scannedItems).reduce((a,b)=>a+b, 0)} / {(assigningInvoice.items || []).reduce((a: any, b: any) => a + Number(b.qty || b.expectedQty || 0), 0)}</span>
                                    </h4>
                                    <div className="space-y-2">
                                        {(assigningInvoice.items || []).map((item: any, i: number) => {
                                            const scanned = scannedItems[item.sku] || 0;
                                            const expected = Number(item.qty || item.expectedQty || 0);
                                            const isDone = scanned >= expected;
                                            
                                            return (
                                                <div key={i} className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${isDone ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100 opacity-80'}`}>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-900">{item.articleName || 'Artículo'}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase">SKU: {item.sku}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-xl font-black ${isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                            {scanned} / {expected}
                                                        </p>
                                                        <p className="text-[8px] font-bold text-slate-400 uppercase">{item.unit || 'UND'}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Configuración de Entrega y Firmas */}
                                <div className="space-y-6">
                                    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Equipo de Entrega</h4>
                                        <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <Icons.Users className="w-5 h-5 text-slate-400" />
                                                <span className="text-[10px] font-black text-slate-900 uppercase">¿Entrega Acompañada?</span>
                                            </div>
                                            <button 
                                                onClick={() => setIsAccompanied(!isAccompanied)}
                                                className={`w-12 h-6 rounded-full transition-all relative ${isAccompanied ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isAccompanied ? 'left-7' : 'left-1'}`}></div>
                                            </button>
                                        </div>

                                        {isAccompanied && (
                                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                                <div className="flex items-center gap-4">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase">Cantidad Auxiliares:</p>
                                                    <div className="flex items-center gap-2">
                                                        {[1, 2, 3].map(n => (
                                                            <button 
                                                                key={n}
                                                                onClick={() => setHelperCount(n)}
                                                                className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${helperCount === n ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}
                                                            >
                                                                {n}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {Array.from({ length: helperCount }).map((_, i) => (
                                                        <select 
                                                            key={i}
                                                            value={selectedHelpers[i] || ''}
                                                            onChange={(e) => {
                                                                const newHelpers = [...selectedHelpers];
                                                                newHelpers[i] = e.target.value;
                                                                setSelectedHelpers(newHelpers);
                                                            }}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                                                        >
                                                            <option value="">Seleccionar Auxiliar {i+1}...</option>
                                                            {allUsers.filter(u => u.id !== user.id).map(u => (
                                                                <option key={u.id} value={u.id}>{u.name}</option>
                                                            ))}
                                                        </select>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Panel de Validación de Firmas */}
                                    <div className="bg-slate-900 p-6 rounded-[2rem] shadow-2xl space-y-4 border border-white/5">
                                        <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                                            <Icons.Shield className="w-4 h-4" />
                                            PROTOCOLOS DE SEGURIDAD M7
                                        </h4>
                                        <div className="space-y-3">
                                            {/* Firma del Despachador (USUARIO ACTUAL) */}
                                            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-lg shadow-black/20">
                                                <div className="flex justify-between items-center mb-2">
                                                    <div>
                                                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">RESPONSABLE TIENDA</p>
                                                        <p className="text-[11px] font-black text-white uppercase">{user.name}</p>
                                                    </div>
                                                    <div className="flex bg-white/10 p-1 rounded-lg">
                                                        <button 
                                                            onClick={() => setSignNowMap({...signNowMap, [user.id]: true})}
                                                            className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[user.id] !== false ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20' : 'text-slate-400'}`}
                                                        >AHORA</button>
                                                        <button 
                                                            onClick={() => setSignNowMap({...signNowMap, [user.id]: false})}
                                                            className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[user.id] === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-400'}`}
                                                        >DESPUÉS</button>
                                                    </div>
                                                </div>
                                                {signNowMap[user.id] !== false && (
                                                    <div className="relative">
                                                        <input 
                                                            type={showPasswordMap[user.id] ? "text" : "password"}
                                                            placeholder="SU CLAVE DE FIRMA..."
                                                            autoComplete="new-password"
                                                            className="w-full bg-slate-950 border border-white/5 p-3 rounded-xl text-xs font-black text-emerald-400 outline-none focus:border-emerald-500/50 pr-10 shadow-inner"
                                                            onChange={(e) => setSignatureKeys({...signatureKeys, [user.id]: e.target.value})}
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => setShowPasswordMap({...showPasswordMap, [user.id]: !showPasswordMap[user.id]})}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                                        >
                                                            {showPasswordMap[user.id] ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Firma del Conductor Real */}
                                            {(() => {
                                                const route = activeRoutes.find(r => r.id === (assigningInvoice.route_id || assigningInvoice.routeId));
                                                // Priorizar conductor vinculado a la ruta
                                                const actualDriver = drivers.find(d => d.id === route?.driver_id || d.id === route?.driverId);
                                                
                                                if (!actualDriver) return null;

                                                return (
                                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-lg shadow-black/20">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <div>
                                                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">RESPONSABLE LOGÍSTICO</p>
                                                                <p className="text-[11px] font-black text-white uppercase">{actualDriver.name} (CONDUCTOR)</p>
                                                            </div>
                                                            <div className="flex bg-white/10 p-1 rounded-lg">
                                                                <button 
                                                                    onClick={() => setSignNowMap({...signNowMap, [actualDriver.id]: true})}
                                                                    className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[actualDriver.id] !== false ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20' : 'text-slate-400'}`}
                                                                >AHORA</button>
                                                                <button 
                                                                    onClick={() => setSignNowMap({...signNowMap, [actualDriver.id]: false})}
                                                                    className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[actualDriver.id] === false ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-400'}`}
                                                                >DESPUÉS</button>
                                                            </div>
                                                        </div>
                                                        {signNowMap[actualDriver.id] !== false && (
                                                            <div className="relative">
                                                                <input 
                                                                    type={showPasswordMap[actualDriver.id] ? "text" : "password"}
                                                                    placeholder="CLAVE CONDUCTOR..."
                                                                    autoComplete="new-password"
                                                                    className="w-full bg-slate-950 border border-white/5 p-3 rounded-xl text-xs font-black text-emerald-400 outline-none focus:border-emerald-500/50 pr-10 shadow-inner"
                                                                    onChange={(e) => setSignatureKeys({...signatureKeys, [actualDriver.id]: e.target.value})}
                                                                />
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setShowPasswordMap({...showPasswordMap, [actualDriver.id]: !showPasswordMap[actualDriver.id]})}
                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                                                >
                                                                    {showPasswordMap[actualDriver.id] ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {/* Firmas de Auxiliares */}
                                            {isAccompanied && selectedHelpers.slice(0, helperCount).map((hid) => {
                                                const helper = drivers.find(d => d.id === hid);
                                                if (!helper) return null;
                                                return (
                                                    <div key={hid} className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <p className="text-[9px] font-black text-white uppercase">{helper.name} (AUXILIAR)</p>
                                                            <div className="flex bg-white/10 p-1 rounded-lg">
                                                                <button 
                                                                    onClick={() => setSignNowMap({...signNowMap, [hid]: true})}
                                                                    className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[hid] !== false ? 'bg-emerald-500 text-slate-900' : 'text-slate-400'}`}
                                                                >AHORA</button>
                                                                <button 
                                                                    onClick={() => setSignNowMap({...signNowMap, [hid]: false})}
                                                                    className={`px-3 py-1 rounded-md text-[8px] font-black transition-all ${signNowMap[hid] === false ? 'bg-rose-500 text-white' : 'text-slate-400'}`}
                                                                >DESPUÉS</button>
                                                            </div>
                                                        </div>
                                                        {signNowMap[hid] !== false && (
                                                            <div className="relative">
                                                                <input 
                                                                    type={showPasswordMap[hid] ? "text" : "password"}
                                                                    placeholder="CLAVE DE FIRMA AUXILIAR..."
                                                                    autoComplete="new-password"
                                                                    className="w-full bg-white/10 border border-white/20 p-3 rounded-xl text-xs font-black text-emerald-400 outline-none focus:border-emerald-500 pr-10"
                                                                    onChange={(e) => setSignatureKeys({...signatureKeys, [hid]: e.target.value})}
                                                                />
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setShowPasswordMap({...showPasswordMap, [hid]: !showPasswordMap[hid]})}
                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                                                >
                                                                    {showPasswordMap[hid] ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50 flex gap-4">
                            <button 
                                className="flex-1 py-4 bg-emerald-500 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                                onClick={handleConfirmDispatch}
                                disabled={isValidating}
                            >
                                {isValidating ? (
                                    <>
                                        <Icons.RotateCcw className="w-4 h-4 animate-spin" />
                                        PROCESANDO...
                                    </>
                                ) : (
                                    <>
                                        <Icons.Check className="w-4 h-4" />
                                        CONFIRMAR ENTREGA
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL CONFIRMACIÓN GENÉRICO */}
            {confirmModal && (
                <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                                <Icons.Alert className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">{confirmModal.title}</h3>
                            <p className="text-sm font-bold text-slate-500 mb-6">{confirmModal.message}</p>
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setConfirmModal(null)}
                                    className="flex-1 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        setConfirmModal(null);
                                        confirmModal.onConfirm();
                                    }}
                                    className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* MODAL INPUT FIRMA */}
            {signatureInputModal && (
                 <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                                <Icons.Signature className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-1">Firma Requerida</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-6 tracking-widest">Ingrese su clave personal</p>
                            
                            <input 
                                type="password" 
                                autoFocus
                                id="signature-modal-input"
                                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center text-lg font-black text-slate-900 outline-none focus:border-indigo-500 mb-6"
                                placeholder="••••••"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const val = e.currentTarget.value;
                                        setSignatureInputModal(null);
                                        signatureInputModal.onConfirm(val);
                                    }
                                }}
                            />

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setSignatureInputModal(null)}
                                    className="flex-1 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        const val = (document.getElementById('signature-modal-input') as HTMLInputElement).value;
                                        setSignatureInputModal(null);
                                        signatureInputModal.onConfirm(val);
                                    }}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all"
                                >
                                    Firmar Ahora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        {/* ═══════════════════════════════════════════════════════════
             MODAL: ENTREGAR CLIENTE
        ═══════════════════════════════════════════════════════════ */}

        {deliveryModal?.isOpen && (
            <div className="fixed inset-0 z-[900] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
                    {/* HEADER */}
                    <div className="p-5 bg-gradient-to-r from-slate-900 to-emerald-950 rounded-t-[2rem]">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-wider">Entregar al Cliente</h3>
                                <p className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5">
                                    Factura #{deliveryModal.invoice?.invoiceNumber || deliveryModal.invoice?.id}
                                </p>
                            </div>
                            <button onClick={() => setDeliveryModal(null)} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                                <Icons.X className="w-3.5 h-3.5 text-white" />
                            </button>
                        </div>
                    </div>

                    {/* BODY */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                        {/* TIPO DE ENTREGA */}
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Tipo de Entrega</p>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 'FULL', label: '✅ Completa', color: 'emerald' },
                                    { value: 'PARTIAL', label: '⚠️ Parcial', color: 'amber' },
                                    { value: 'RETURN', label: '🔄 Devolver', color: 'rose' },
                                ] as { value: 'FULL'|'PARTIAL'|'RETURN', label: string, color: string }[]).map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setDeliveryType(opt.value)}
                                        className={`py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2 ${
                                            deliveryType === opt.value
                                                ? opt.value === 'FULL' ? 'bg-emerald-500 text-white border-emerald-500'
                                                : opt.value === 'PARTIAL' ? 'bg-amber-500 text-white border-amber-500'
                                                : 'bg-rose-500 text-white border-rose-500'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ITEMS */}
                        {deliveryItems.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                    Artículos {deliveryType !== 'FULL' && <span className="text-rose-500">– Ajusta cantidades devueltas</span>}
                                </p>
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                    {deliveryItems.map((item, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-900 truncate">{item.articleName || item.sku}</p>
                                                <p className="text-[8px] text-slate-400 font-bold uppercase">{item.unit} • Cant: {item.quantityDelivered}</p>
                                            </div>
                                            {deliveryType !== 'FULL' && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <p className="text-[8px] text-slate-400 uppercase font-bold">Dev:</p>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={item.quantityDelivered}
                                                        value={item.quantityReturned}
                                                        onChange={e => {
                                                            const updated = [...deliveryItems];
                                                            updated[i] = { ...updated[i], quantityReturned: Number(e.target.value) };
                                                            setDeliveryItems(updated);
                                                        }}
                                                        className="w-14 text-center border border-rose-200 rounded-lg text-[10px] font-black text-rose-600 py-1 outline-none focus:border-rose-500"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* RAZÓN DEVOLUCIÓN */}
                        {deliveryType !== 'FULL' && (
                            <div>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Motivo de Devolución</p>
                                <input
                                    type="text"
                                    value={deliveryReturnReason}
                                    onChange={e => setDeliveryReturnReason(e.target.value)}
                                    placeholder="Ej: Cliente ausente, rechazo de mercancía..."
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-rose-500 transition-all"
                                />
                            </div>
                        )}

                        {/* NOTAS */}
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Notas (opcional)</p>
                            <textarea
                                rows={2}
                                value={deliveryNotes}
                                onChange={e => setDeliveryNotes(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500 transition-all resize-none"
                            />
                        </div>

                        {/* CONTRASEÑA CONDUCTOR */}
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Contraseña del Conductor</p>
                            <input
                                type="password"
                                value={deliveryPassword}
                                onChange={e => setDeliveryPassword(e.target.value)}
                                placeholder="Ingresa tu contraseña para confirmar"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500 transition-all"
                            />
                        </div>
                    </div>

                    {/* FOOTER */}
                    <div className="p-5 border-t border-slate-100 flex gap-3">
                        <button onClick={() => setDeliveryModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmDelivery}
                            disabled={isConfirmingDelivery}
                            className={`flex-1 py-3 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                deliveryType === 'FULL' ? 'bg-emerald-600 hover:bg-emerald-700'
                                : deliveryType === 'PARTIAL' ? 'bg-amber-500 hover:bg-amber-600'
                                : 'bg-rose-600 hover:bg-rose-700'
                            } disabled:opacity-50 disabled:cursor-wait`}
                        >
                            {isConfirmingDelivery && <Icons.Loader className="w-3 h-3 animate-spin" />}
                            {deliveryType === 'FULL' ? '✅ Confirmar Entrega' : deliveryType === 'PARTIAL' ? '⚠️ Guardar Parcial' : '🔄 Registrar Devolución'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
             MODAL: HISTORIAL ENTREGAS / DEVOLUCIONES
        ═══════════════════════════════════════════════════════════ */}
        {showHistoryModal && (
            <div className="fixed inset-0 z-[900] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
                    {/* HEADER */}
                    <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 rounded-t-[2rem] flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">Historial de Operaciones</h3>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Entregas y devoluciones registradas</p>
                        </div>
                        <button onClick={() => setShowHistoryModal(false)} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                            <Icons.X className="w-3.5 h-3.5 text-white" />
                        </button>
                    </div>

                    {/* TABS */}
                    <div className="flex border-b border-slate-100">
                        {(['ENTREGAS', 'DEVOLUCIONES'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => { setHistoryTab(tab); setHistoryData([]); }}
                                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                                    historyTab === tab ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-700'
                                }`}
                            >
                                {tab === 'ENTREGAS' ? '🚚 Entregas' : '🔄 Devoluciones'}
                            </button>
                        ))}
                    </div>

                    {/* FILTROS */}
                    <div className="p-4 bg-slate-50 border-b border-slate-100">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                            <input type="text" placeholder="Factura" value={historyFilters.invoiceId}
                                onChange={e => setHistoryFilters(p => ({...p, invoiceId: e.target.value}))}
                                className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white" />
                            <select value={historyFilters.driverId}
                                onChange={e => setHistoryFilters(p => ({...p, driverId: e.target.value}))}
                                className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white">
                                <option value="">Conductor</option>
                                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            <select value={historyFilters.vehicleId}
                                onChange={e => setHistoryFilters(p => ({...p, vehicleId: e.target.value}))}
                                className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white">
                                <option value="">Placa</option>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                            </select>
                            <input type="date" value={historyFilters.dateFrom}
                                onChange={e => setHistoryFilters(p => ({...p, dateFrom: e.target.value}))}
                                className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black outline-none focus:border-emerald-400 bg-white" />
                            <input type="date" value={historyFilters.dateTo}
                                onChange={e => setHistoryFilters(p => ({...p, dateTo: e.target.value}))}
                                className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black outline-none focus:border-emerald-400 bg-white" />
                            <button onClick={loadHistory} disabled={historyLoading}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 disabled:opacity-50">
                                {historyLoading ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Search className="w-3 h-3" />}
                                Buscar
                            </button>
                        </div>
                    </div>

                    {/* TABLA */}
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        {historyLoading ? (
                            <div className="flex items-center justify-center h-32">
                                <Icons.Loader className="w-6 h-6 animate-spin text-emerald-500" />
                                <span className="ml-2 text-slate-400 text-xs font-bold uppercase">Cargando...</span>
                            </div>
                        ) : historyData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-slate-300">
                                <Icons.FileText className="w-8 h-8 mb-2" />
                                <p className="text-xs font-black uppercase">Sin registros. Usa los filtros y presiona Buscar.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {historyTab === 'ENTREGAS'
                                            ? ['ID', 'Factura', 'Conductor', 'Placa', 'Tipo', 'Fecha', 'Dev.'].map(h => (
                                                <th key={h} className="pb-2 text-[9px] font-black text-slate-400 uppercase tracking-widest pr-4">{h}</th>
                                            ))
                                            : ['ID', 'Factura', 'Conductor', 'Placa', 'Motivo', 'Estado', 'Fecha'].map(h => (
                                                <th key={h} className="pb-2 text-[9px] font-black text-slate-400 uppercase tracking-widest pr-4">{h}</th>
                                            ))
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyData.map((row: any) => (
                                        <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all">
                                            {historyTab === 'ENTREGAS' ? <>
                                                <td className="py-2 pr-4 text-[9px] font-black text-slate-500">#{row.id}</td>
                                                <td className="py-2 pr-4 text-[9px] font-black text-slate-900">{row.invoiceId}</td>
                                                <td className="py-2 pr-4 text-[9px] text-slate-600 uppercase">{row.driverName || row.driverId}</td>
                                                <td className="py-2 pr-4 text-[9px] font-black text-emerald-600">{row.vehiclePlate || '-'}</td>
                                                <td className="py-2 pr-4">
                                                    <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${
                                                        row.deliveryType === 'FULL' ? 'bg-emerald-100 text-emerald-700'
                                                        : row.deliveryType === 'PARTIAL' ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                    }`}>
                                                        {row.deliveryType === 'FULL' ? 'Completa' : row.deliveryType === 'PARTIAL' ? 'Parcial' : 'Devolución'}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-4 text-[9px] text-slate-400">{new Date(row.deliveredAt).toLocaleDateString('es-CO')}</td>
                                                <td className="py-2 pr-4 text-[9px] font-black">{row.returnId ? <span className="text-rose-500">#{row.returnId}</span> : <span className="text-slate-300">—</span>}</td>
                                            </> : <>
                                                <td className="py-2 pr-4 text-[9px] font-black text-slate-500">#{row.id}</td>
                                                <td className="py-2 pr-4 text-[9px] font-black text-slate-900">{row.invoiceId}</td>
                                                <td className="py-2 pr-4 text-[9px] text-slate-600 uppercase">{row.driverName || row.driverId}</td>
                                                <td className="py-2 pr-4 text-[9px] font-black text-emerald-600">{row.vehiclePlate || '-'}</td>
                                                <td className="py-2 pr-4 text-[9px] text-slate-600 max-w-[120px] truncate">{row.returnReason || '—'}</td>
                                                <td className="py-2 pr-4">
                                                    <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${
                                                        row.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700'
                                                        : row.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500'
                                                        : 'bg-amber-100 text-amber-700'
                                                    }`}>{row.status}</span>
                                                </td>
                                                <td className="py-2 pr-4 text-[9px] text-slate-400">{new Date(row.createdAt).toLocaleDateString('es-CO')}</td>
                                            </>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default LogisticsDispatch;

