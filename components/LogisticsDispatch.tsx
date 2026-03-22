
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Control colapsable

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
    const [voucherModal, setVoucherModal]   = useState<{ isOpen: boolean; invoice: any } | null>(null);
    const [showReturnsModal, setShowReturnsModal] = useState(false);
    const [routeSearch, setRouteSearch]     = useState('');

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
    const generateRoutePDF = async (route: any) => {
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
        
        setIsGeneratingPDF(true);

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
                            <td><div style="font-weight:900; font-size:8px;">${inv.customerName}</div><div style="font-size:8px; color:#1e293b; font-weight:900;">${inv.address || ''}</div></td>
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

            </body>
          </html>
        `;

        // Renderizar en iframe oculto → html2canvas → jsPDF → descarga directa
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1122px;height:794px;border:none;visibility:hidden;';
        document.body.appendChild(iframe);

        await new Promise<void>(resolve => {
          iframe.onload = () => resolve();
          iframe.srcdoc = html;
        });

        // Dar tiempo para que carguen imágenes dentro del iframe
        await new Promise(r => setTimeout(r, 800));

        try {
          const canvas = await html2canvas(iframe.contentDocument!.body, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: 1122,
            windowWidth: 1122,
          });

          const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
          const pdfW = pdf.internal.pageSize.getWidth();
          const pdfH = pdf.internal.pageSize.getHeight();
          const pageHeightPx = canvas.width * (pdfH / pdfW);

          let y = 0;
          let pageNum = 0;
          while (y < canvas.height) {
            const sliceH = Math.min(pageHeightPx, canvas.height - y);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceH;
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(canvas, 0, -y);
            const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.93);
            if (pageNum > 0) pdf.addPage();
            pdf.addImage(sliceImg, 'JPEG', 0, 0, pdfW, pdfH * (sliceH / pageHeightPx));
            y += sliceH;
            pageNum++;
          }

          const fecha = new Date().toISOString().split('T')[0];
          pdf.save(`planilla_${route.plate || 'ruta'}_${fecha}.pdf`);
        } finally {
          document.body.removeChild(iframe);
          setIsGeneratingPDF(false);
        }
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
                if (import.meta.env.DEV) console.error('[M7-INVOICES-FALLBACK]', e);
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
    const geocodeAddress = async (inv: any): Promise<{ coords: [number, number]; exact: boolean } | null> => {
        const city = inv.city || inv.municipio || '';
        const address = inv.address || inv.direccion || inv.customerAddress || inv.shipAddress || '';

        // Coordenadas propias distintas al genérico de Medellín → usar directamente
        if (inv.lat && inv.lng) {
            const lat = Number(inv.lat);
            const lng = Number(inv.lng);
            if (Math.abs(lat - 6.2518) > 0.001 || Math.abs(lng + 75.5636) > 0.001) {
                return { coords: [lat, lng], exact: true };
            }
        }

        // Sin dirección ni ciudad → coordenada aproximada de Colombia centro
        if (!address && !city) return { coords: [6.2518, -75.5636], exact: false };

        try {
            const data = await api.geocodeAddress({ address: address || '', city: city || '' });
            if (data?.lat && data?.lng) {
                const exact = !data.fallback;
                return { coords: [data.lat as number, data.lng as number], exact };
            }
        } catch (e) {
            console.warn('[M7-GEO] Error geocoding:', e);
        }
        return { coords: [6.2518, -75.5636], exact: false };
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

        // Geocodificar todas las facturas secuencialmente (caché BD = rápido en 2ª consulta)
        const geocoded: { inv: any; coords: [number, number]; exact: boolean }[] = [];
        for (let i = 0; i < data.length; i++) {
            const inv = data[i];
            const result = await geocodeAddress(inv);
            if (result) {
                geocoded.push({ inv, coords: result.coords, exact: result.exact });
            }
            if (i < data.length - 1) await new Promise(r => setTimeout(r, 200));
        }

        toast.dismiss(loadingToast);

        if (geocoded.length === 0) {
            toast.error('No se pudieron geocodificar las direcciones.');
            return;
        }

        // Distribuir en espiral los puntos que cayeron en la misma coordenada (sin geocodificar exacto)
        const seen = new Map<string, number>();
        geocoded.forEach(g => {
            const key = `${g.coords[0].toFixed(4)},${g.coords[1].toFixed(4)}`;
            const count = seen.get(key) || 0;
            if (count > 0) {
                // Pequeño jitter en espiral para que sean visibles por separado
                const angle = (count * 137.5 * Math.PI) / 180;
                const radius = 0.003 * Math.ceil(count / 8);
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
            const pos = L.latLng(coords[0], coords[1]);
            points.push(pos);

            // Color: verde=entregado, slate=pendiente, ámbar=ubicación aproximada
            const isDelivered = ['EST-12', 'EST-14', 'COMPLETED', 'Entregado'].includes(inv.status);
            const isApprox    = !exact;
            const markerColor = isDelivered ? '#10b981' : isApprox ? '#f59e0b' : '#1e293b';
            const borderColor = isDelivered ? '#059669' : isApprox ? '#d97706' : '#10b981';
            const textColor   = '#fff';

            const icon = L.divIcon({
                className: 'custom-invoice-marker',
                html: `
                    <div style="
                        width:32px; height:32px;
                        background:${markerColor};
                        border:3px solid ${borderColor};
                        border-radius:50%;
                        display:flex; align-items:center; justify-content:center;
                        font-size:11px; font-weight:900; color:${textColor};
                        box-shadow:0 4px 12px rgba(0,0,0,0.3);
                        position:relative;
                        ${isApprox ? 'opacity:0.75;' : ''}
                    ">
                        ${idx + 1}
                        ${isDelivered ? '<div style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#10b981;border-radius:50%;border:2px solid white;font-size:7px;display:flex;align-items:center;justify-content:center;">✓</div>' : ''}
                        ${isApprox ? '<div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid white;font-size:7px;display:flex;align-items:center;justify-content:center;">~</div>' : ''}
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
                        ${isApprox ? '<div style="font-size:9px;color:#d97706;font-weight:700;margin-top:2px;">⚠ Ubicación aproximada</div>' : ''}
                        ${notes ? `<div style="font-size:9px; color:#94a3b8; margin-top:2px; font-style:italic">📝 ${notes}</div>` : ''}
                        <div style="margin-top:4px; font-size:9px; font-weight:900; color:${isDelivered ? '#10b981' : '#f59e0b'}">${statusLabel}</div>
                        <div style="font-size:9px; color:#94a3b8">${(Number(inv.volumeM3) || 0).toFixed(2)} m³</div>
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
        const barcodeClean = String(barcode).trim().toUpperCase();
        
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
                        onClick={() => setShowReturnsModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/20 text-[8px] font-black uppercase tracking-widest transition-all group"
                    >
                        <Icons.Package className="w-3 h-3 opacity-80 group-hover:opacity-100" />
                        <span>Devoluciones</span>
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

                        {/* Buscador de rutas */}
                        <div className="relative mb-1">
                            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                            <input
                                type="text"
                                placeholder="Buscar placa, conductor..."
                                value={routeSearch}
                                onChange={e => setRouteSearch(e.target.value.toUpperCase())}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold uppercase outline-none focus:border-emerald-400 transition-all"
                            />
                            {routeSearch && (
                                <button onClick={() => setRouteSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Icons.X className="w-3 h-3 text-slate-300 hover:text-slate-500" />
                                </button>
                            )}
                        </div>

                        {activeRoutes.length === 0 ? (
                            <div className="text-center p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">Esperando despacho...</p>
                            </div>
                        ) : (
                            activeRoutes
                            .filter(route => {
                                if (!routeSearch) return true;
                                const q = routeSearch.toLowerCase();
                                return (route.plate || '').toLowerCase().includes(q)
                                    || (route.driver_name || '').toLowerCase().includes(q);
                            })
                            .map((route) => {
                                const vehicleData = vehicles.find(v => v.id === route.vehicle_id);
                                const totalVolume = (route.invoice_ids || []).reduce((acc: number, id: string) => {
                                    const cleanId = String(id).trim().replace(/[\r\n\t\f\v ]/g, '');
                                    const inv = invoices.find(i => String(i.id).trim().replace(/[\r\n\t\f\v ]/g, '') === cleanId);
                                    return acc + Number(inv?.volumeM3 || 0);
                                }, 0);
                                const utilizationPercent = vehicleData ? (totalVolume / vehicleData.capacityM3) * 100 : 0;

                                return (
                                    <div key={route.id} className="bg-slate-50 rounded-2xl border border-slate-100 shadow-sm p-4 group hover:shadow-xl hover:scale-[1.02] transition-all border-l-4 border-l-slate-900 hover:border-l-emerald-500">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{route.plate}</span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[120px]">{route.driver_name || 'PENDIENTE'}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-black text-slate-900">{(Number(utilizationPercent) || 0).toFixed(0)}%</div>
                                                <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(utilizationPercent, 100)}%` }}></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button 
                                                onClick={() => {
                                                    setVisualizedRoute(route);
                                                }}
                                                className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${visualizedRoute?.id === route.id ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                            >
                                                <Icons.Truck className="w-3 h-3" />
                                                {visualizedRoute?.id === route.id ? 'Tracker On' : 'Ver Mapa'}
                                            </button>
                                            <button 
                                                onClick={() => setSelectedActiveRoute(route)}
                                                className="flex items-center justify-center gap-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-slate-900/20"
                                            >
                                                <Icons.FileText className="w-3 h-3" />
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
                                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text"
                                        placeholder="BUSCAR FACTURA O CLIENTE..."
                                        value={invoiceSearchQuery}
                                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all shadow-sm"
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
                                    const query = invoiceSearchQuery.toLowerCase();
                                    return (inv.invoiceNumber || "").toLowerCase().includes(query) || 
                                           (inv.customerName || "").toLowerCase().includes(query) ||
                                           (inv.id || "").toLowerCase().includes(query);
                                })
                                .map((inv: any, idx: number) => {
                                    const hasPendingSignature = pendingSignatures.some(ps => ps.invoiceId === inv.id || ps.invoiceId === inv.invoiceNumber);
                                    return (
                                        <div key={`${inv.id || idx}`} className="p-4 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-emerald-400/40 transition-all group">
                                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xs shrink-0 group-hover:bg-slate-900 group-hover:text-emerald-400 transition-colors">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h5 className="text-[14px] font-black text-slate-900">#{inv.invoiceNumber || inv.id}</h5>
                                                        {inv.status === 'EST-12' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black rounded-full">ENTREGADO</span>}
                                                        {inv.status === 'EST-13' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black rounded-full">PARCIAL</span>}
                                                        {hasPendingSignature && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[8px] font-black rounded-full animate-pulse">FIRMA</span>}
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

                                                {/* DESPACHAR — si no ha sido enviado al camión aún */}
                                                {!['EST-11','EST-12','EST-13','EST-14'].includes(inv.status) && !hasPendingSignature && (
                                                    <button
                                                        onClick={() => setAssigningInvoice(inv)}
                                                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg"
                                                    >
                                                        <Icons.Truck className="w-4 h-4" />
                                                        Despachar
                                                    </button>
                                                )}

                                                {/* ENTREGAR — cuando ya está en ruta */}
                                                {inv.status === 'EST-11' && (
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
                                                {(inv.status === 'EST-12' || inv.status === 'EST-14') && (
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

