
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

    const drawRouteOnMap = (data: any[]) => {
        if (!mapRef.current || data.length === 0) return;

        // Limpiar visualización previa
        routeMarkersRef.current.forEach(m => m.remove());
        routeMarkersRef.current = [];
        if (routePolylineRef.current) {
            routePolylineRef.current.remove();
            routePolylineRef.current = null;
        }

        const points: L.LatLng[] = [L.latLng(M7_HUB_ORIGIN.lat, M7_HUB_ORIGIN.lng)];

        data.forEach((inv, idx) => {
             if (inv.lat && inv.lng) { 
                const pos = L.latLng(inv.lat, inv.lng);
                points.push(pos);

                // Marcador numérico
                const icon = L.divIcon({
                    className: 'custom-invoice-marker',
                    html: `<div class="w-6 h-6 bg-emerald-500 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-black text-white">${idx + 1}</div>`,
                    iconSize: [24, 24]
                });

                const marker = L.marker(pos, { icon })
                    .addTo(mapRef.current!)
                    .bindPopup(`
                        <div class="p-2">
                            <p class="font-bold text-xs">${inv.invoiceNumber}</p>
                            <p class="text-[10px] text-slate-500 mb-1">${inv.customerName}</p>
                            <p class="text-[9px] text-emerald-600 font-bold uppercase">${inv.city || ''} ${inv.neighborhood ? `• ${inv.neighborhood}` : ''}</p>
                        </div>
                    `);
                routeMarkersRef.current.push(marker);
            }
        });

        // Polilinea
        if (points.length > 1) {
            routePolylineRef.current = L.polyline(points, {
                color: '#0ea5e9', // Sky blue
                weight: 4,
                opacity: 0.8,
                dashArray: '5, 10'
            }).addTo(mapRef.current);
            
            const bounds = L.latLngBounds(points);
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
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
        const expected = Number(item.expectedQty);
        if (currentCount >= expected) {
            toast.warning(`Cantidad máxima alcanzada para ${item.articleName || item.sku}`);
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
        const totalExpected = (assigningInvoice.items || []).reduce((a: any, b: any) => a + Number(b.expectedQty), 0);
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Cabecera de Control */}
            {/* Cabecera de Control Compacta */}
            <div className="bg-white rounded-[2rem] p-4 shadow-md border border-slate-100 flex flex-col xl:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg border border-emerald-500">
                        <Icons.Radar className="w-5 h-5 text-emerald-500 animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Centro de Mando</h2>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rastreo GPS (v1.2-PRIVACY)</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:gap-4 justify-center">
                    <div className="flex bg-slate-50 p-1 rounded-xl items-center gap-1 border border-slate-100">
                         <div className="text-center px-3 py-1 bg-white rounded-lg shadow-sm border border-slate-100">
                            <p className="text-[6px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-0.5">Visibles</p>
                            <p className="text-sm font-black text-slate-900 leading-none">{filteredRoutes.length}</p>
                        </div>
                        <div className="text-center px-3 py-1">
                            <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">GPS Ok</p>
                            <p className="text-sm font-black text-slate-700 leading-none">{filteredLocations.length}</p>
                        </div>
                        <div className="text-center px-3 py-1">
                            <p className="text-[6px] font-black text-rose-500 uppercase tracking-widest leading-none mb-0.5">Sin Señal</p>
                            <p className="text-sm font-black text-slate-700 leading-none">{Math.max(0, filteredRoutes.length - filteredLocations.length)}</p>
                        </div>
                    </div>

                    <div className="hidden xl:flex bg-slate-50 p-1 rounded-xl items-center gap-3 border border-slate-100 px-3 h-full">
                        <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest">Ref:</p>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                            <p className="text-[7px] font-black text-slate-600 uppercase">HUB</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                             <div className="w-1.5 h-1.5 bg-slate-900 rounded-sm rotate-45"></div>
                            <p className="text-[7px] font-black text-slate-600 uppercase">En Ruta</p>
                        </div>
                         <div className="flex items-center gap-1.5">
                            <div className="w-3 h-px bg-emerald-500 border-t border-dashed border-emerald-600"></div>
                            <p className="text-[7px] font-black text-slate-600 uppercase">Trayecto</p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={fetchLocations}
                            disabled={isValidating}
                            className={`px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all flex items-center gap-2 ${isValidating ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isValidating ? <Icons.RotateCcw className="w-3 h-3 animate-spin" /> : <Icons.MapPin className="w-3 h-3" />}
                            {isValidating ? '...' : 'GPS'}
                        </button>
                        <button
                            onClick={onRefresh}
                            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-emerald-500 transition-all shadow-sm"
                        >
                            <Icons.RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-280px)]">
                <div className="lg:col-span-1 space-y-4 overflow-y-auto custom-scrollbar pr-2 pb-10">
                    {activeRoutes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-white/40 backdrop-blur-xl rounded-[3rem] border border-white/20 shadow-xl">
                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                                <Icons.Truck className="w-12 h-12 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Sin Despachos</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">No hay vehículos en ruta.</p>
                        </div>
                    ) : (
                        activeRoutes.map((route) => {
                            const totalVolume = (route.invoice_ids || []).reduce((acc: number, id: string) => {
                                const cleanId = String(id).trim().replace(/[\r\n\t\f\v ]/g, '');
                                const inv = invoices.find(i => String(i.id).trim().replace(/[\r\n\t\f\v ]/g, '') === cleanId);
                                return acc + Number(inv?.volumeM3 || 0);
                            }, 0);

                            const vehicleData = vehicles.find(v => v.id === route.vehicle_id);
                            const utilizationPercent = vehicleData ? (totalVolume / vehicleData.capacityM3) * 100 : 0;

                            return (
                                <div key={route.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col group hover:shadow-2xl transition-all border-l-8 border-l-slate-900 hover:border-l-emerald-500">
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="bg-emerald-500 text-slate-900 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                {route.status === 'EN_RUTA' ? '🚚 EN RUTA' : '✅ CONFIRMADA'}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">PLACA</p>
                                                <h4 className="text-xl font-black text-slate-900">{route.plate}</h4>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
                                                    <Icons.User className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-900 uppercase">
                                                        {(() => {
                                                            if (route.driver_name && route.driver_name !== 'S/A') return route.driver_name;
                                                            const link = assignments.find(a => a.vehicleId === route.vehicle_id && a.isActive);
                                                            const drv = drivers.find(d => d.id === link?.driverId);
                                                            return drv?.name || 'SIN CONDUCTOR';
                                                        })()}
                                                    </p>
                                                    <p className="text-[8px] text-slate-500 font-black uppercase">Responsable Operativo</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                                                    <p className="text-[7px] font-black text-slate-400 uppercase">DOCUMENTOS</p>
                                                    <p className="text-sm font-black text-slate-900">{(route.invoice_ids || []).length}</p>
                                                </div>
                                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                                                    <p className="text-[7px] font-black text-slate-400 uppercase">OCUPACIÓN</p>
                                                    <p className="text-sm font-black text-emerald-600">
                                                        {utilizationPercent.toFixed(0)}%
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setVisualizedRoute(route)}
                                                        className={`flex-1 py-3 border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${visualizedRoute?.id === route.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50'}`}
                                                    >
                                                        {visualizedRoute?.id === route.id ? 'Viendo Mapa' : '🗺️ Ver Mapa'}
                                                    </button>
                                                    <div className="flex gap-1 flex-1">
                                                        <button
                                                            onClick={() => setSelectedActiveRoute(route)}
                                                            className="flex-1 py-3 bg-slate-50 hover:bg-slate-900 hover:text-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Detalles
                                                        </button>
                                                        <button
                                                            onClick={() => generateRoutePDF(route)}
                                                            disabled={isGeneratingPDF}
                                                            className="px-3 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                                        >
                                                            {isGeneratingPDF ? '...' : 'PDF'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Mapa del Centro de Mando */}
                <div className="lg:col-span-2 bg-slate-200 rounded-[3rem] shadow-xl border-8 border-white overflow-hidden relative group">
                    <div id="logistics-dispatch-map" className="w-full h-full"></div>




                </div>
            </div>

            {/* Modal de Detalle Mejorado */}
            {selectedActiveRoute && (
                <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-[95vw] max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-emerald-50 rounded-t-[2.5rem]">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                                    <Icons.Truck className="w-7 h-7 text-emerald-500" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Detalle de Despacho</h3>
                                    <p className="text-xs font-bold text-slate-500 uppercase">
                                        Ruta {selectedActiveRoute.plate} • {(() => {
                                            if (selectedActiveRoute.driver_name && selectedActiveRoute.driver_name !== 'S/A') return selectedActiveRoute.driver_name;
                                            const link = assignments.find(a => a.vehicleId === selectedActiveRoute.vehicle_id && a.isActive);
                                            const drv = drivers.find(d => d.id === link?.driverId);
                                            return drv?.name || 'CONDUCTOR EXTERNO';
                                        })()}
                                    </p>
                                    <p className="text-[10px] text-emerald-600 font-bold mt-1">
                                        📌 {routeInvoices.length} Puntos de Entrega (Visible en Mapa)
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedActiveRoute(null)} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                                <Icons.X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-4 custom-scrollbar">
                            {/* SECCIÓN DE BÚSQUEDA Y TÍTULO (AHORA ARRIBA) */}
                            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-[2rem] shadow-lg border border-slate-100 gap-4">
                                <div className="flex items-center gap-4">
                                    <p className="text-sm font-black text-slate-900 uppercase tracking-widest pl-2">Desglose de Documentos</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">{routeInvoices.length} FACTURAS</span>
                                        <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                                        <p className="text-[9px] font-black text-emerald-500 uppercase">GESTIÓN DE RUTA</p>
                                    </div>
                                </div>
                                <div className="relative w-full md:w-80">
                                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text"
                                        placeholder="BUSCAR FACTURA O CLIENTE..."
                                        value={invoiceSearchQuery}
                                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all"
                                    />
                                </div>
                            </div>

                            {/* MÉTRICAS COMPACTAS (RIBBON) */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                                    <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">FACTURAS</p>
                                    <p className="text-xl font-black text-slate-950 leading-none">{routeInvoices.length}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                                    <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">ENTREGADAS</p>
                                    <p className="text-xl font-black text-emerald-600 leading-none">
                                        {routeInvoices.filter(inv => inv.status === 'EST-11' || inv.status === 'COMPLETED' || inv.status === 'Entregado').length}
                                        <span className="text-[10px] text-slate-400 ml-1">/ {routeInvoices.length}</span>
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                                    <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">VOLUMEN</p>
                                    <p className="text-xl font-black text-emerald-600 leading-none">
                                        {routeInvoices.reduce((acc: number, inv: any) => acc + Number(inv.volumeM3 || 0), 0).toFixed(1)}m³
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col items-center justify-center">
                                    <div className="flex justify-between items-center w-full px-2 mb-0.5">
                                        <p className="text-[7px] font-black text-slate-400 uppercase">CAPACIDAD</p>
                                        <span className="text-[8px] font-black text-emerald-600">
                                            {Math.round((routeInvoices.reduce((acc: number, inv: any) => acc + Number(inv.volumeM3 || 0), 0) / (vehicles.find(v => v.id === selectedActiveRoute.vehicle_id)?.capacityM3 || 1)) * 100)}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-200 h-1.5 rounded-full px-2">
                                        <div
                                            className="bg-emerald-500 h-full rounded-full transition-all"
                                            style={{
                                                width: `${Math.min(100, (routeInvoices.reduce((acc: number, inv: any) => acc + Number(inv.volumeM3 || 0), 0) / (vehicles.find(v => v.id === selectedActiveRoute.vehicle_id)?.capacityM3 || 1)) * 100)}%`
                                            }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center">
                                    <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">ESTADO</p>
                                    <p className="text-[9px] font-black text-emerald-600 uppercase">
                                        {selectedActiveRoute.status === 'EN_RUTA' ? '🚚 TRÁNSITO' : '✅ CONFIRMADA'}
                                    </p>
                                </div>
                            </div>
                                
                                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2 pb-10">
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
                                            <div key={`${inv.id || idx}-${idx}`} className="p-5 bg-white border border-slate-100 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-4 hover:border-emerald-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(16,185,129,0.08)] transition-all group relative overflow-hidden">
                                                <div className="flex items-center gap-5 flex-1">
                                                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-emerald-500 font-black text-lg shadow-lg group-hover:scale-110 transition-all shrink-0">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="text-base font-black text-slate-900 truncate">#{inv?.invoiceNumber || inv.id || 'N/A'}</p>
                                                            {hasPendingSignature && (
                                                                <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-2 py-0.5 rounded-full animate-pulse uppercase">FIRMA PENDIENTE</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate max-w-[200px]">{inv?.customerName || 'Cliente Genérico'}</p>
                                                        <div className="flex items-center gap-3 mt-2">
                                                            <div className="flex items-center gap-1">
                                                                <Icons.MapPin className="w-3 h-3 text-slate-300" />
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{inv?.city || 'N/A'}</p>
                                                            </div>
                                                            <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                                                            <p className="text-[9px] font-black text-emerald-600 uppercase">{Number(inv?.volumeM3 || 0).toFixed(2)} m³</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
                                                    <button 
                                                        onClick={() => setViewingItemsInvoice(inv)}
                                                        className="px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2 border border-slate-200"
                                                    >
                                                        <Icons.Eye className="w-3.5 h-3.5" />
                                                        Artículos
                                                    </button>
                                                    
                                                    {inv.status !== 'EST-11' && inv.status !== 'Entregado' && !inv.dispatchId && (
                                                        <button 
                                                            onClick={() => setAssigningInvoice(inv)}
                                                            className="px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2 border border-emerald-100"
                                                        >
                                                            <Icons.Scan className="w-3.5 h-3.5" />
                                                            Entregar Material
                                                        </button>
                                                    )}

                                                    {hasPendingSignature && (
                                                        <button 
                                                            onClick={() => handleDelayedSignature(inv)}
                                                            className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
                                                        >
                                                            <Icons.Signature className="w-3.5 h-3.5" />
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
                                            <p className="text-lg font-black text-indigo-600">{item.expectedQty} <span className="text-[10px] text-slate-400">{item.unit || 'UND'}</span></p>
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
                                        <span className="text-emerald-600">PROGRESO: {Object.values(scannedItems).reduce((a,b)=>a+b, 0)} / {(assigningInvoice.items || []).reduce((a: any, b: any) => a + Number(b.expectedQty), 0)}</span>
                                    </h4>
                                    <div className="space-y-2">
                                        {(assigningInvoice.items || []).map((item: any, i: number) => {
                                            const scanned = scannedItems[item.sku] || 0;
                                            const expected = Number(item.expectedQty);
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
        </div>
    );
};

export default LogisticsDispatch;
