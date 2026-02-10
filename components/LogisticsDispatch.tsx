
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LogisticsDispatchProps {
    user: any;
    selectedClient: string;
    vehicles: any[];
    drivers: any[];
    assignments: any[];
    invoices: any[];
    activeRoutes: any[];
    onRefresh: () => void;
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
    onRefresh
}) => {
    const [selectedActiveRoute, setSelectedActiveRoute] = useState<any | null>(null);
    const [vehicleLocations, setVehicleLocations] = useState<any[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<{ [key: string]: L.Marker }>({});
    const routeLinesRef = useRef<{ [key: string]: L.Polyline }>({});

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

    // 3. Generación de Planilla en PDF
    const generateRoutePDF = (route: any) => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF();

            // Header
            doc.setFillColor(15, 23, 42); // slate-900
            doc.rect(0, 0, 210, 35, 'F');

            doc.setTextColor(16, 185, 129); // emerald-500
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text('M7 INTELLIGENCE', 105, 15, { align: 'center' });

            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184); // slate-400
            doc.text('PLANILLA DE DESPACHO LOGÍSTICO', 105, 23, { align: 'center' });
            doc.text(new Date().toLocaleDateString('es-CO', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            }), 105, 29, { align: 'center' });

            // Información del Vehículo
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('INFORMACIÓN DEL DESPACHO', 14, 45);

            const driverName = (() => {
                if (route.driver_name && route.driver_name !== 'S/A') return route.driver_name;
                const link = assignments.find(a => a.vehicleId === route.vehicle_id && a.isActive);
                const drv = drivers.find(d => d.id === link?.driverId);
                return drv?.name || 'SIN CONDUCTOR ASIGNADO';
            })();

            const vehicleInfo = [
                ['PLACA VEHÍCULO:', route.plate || 'N/A'],
                ['CONDUCTOR:', driverName],
                ['TOTAL DOCUMENTOS:', (route.invoice_ids || []).length.toString()],
                ['VOLUMEN TOTAL:', `${(route.invoice_ids || []).reduce((acc: number, id: string) => {
                    const inv = invoices.find(i => i.id === id);
                    return acc + (inv?.volumeM3 || 0);
                }, 0).toFixed(2)} m³`],
                ['ESTADO:', 'EN RUTA'],
                ['FECHA DESPACHO:', new Date(route.created_at || Date.now()).toLocaleString('es-CO')]
            ];

            autoTable(doc, {
                startY: 50,
                head: [],
                body: vehicleInfo,
                theme: 'plain',
                styles: {
                    fontSize: 9,
                    cellPadding: 2,
                    textColor: [15, 23, 42]
                },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 50, textColor: [100, 116, 139] },
                    1: { fontStyle: 'normal', cellWidth: 130 }
                }
            });

            // Tabla de Documentos
            let finalY = (doc as any).lastAutoTable.finalY || 90;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('DESGLOSE DE DOCUMENTOS', 14, finalY + 10);

            const documentRows = (route.invoice_ids || []).map((id: string, idx: number) => {
                const inv = invoices.find(i => i.id === id);
                return [
                    (idx + 1).toString(),
                    inv?.invoiceNumber || id,
                    inv?.customerName || 'Cliente Genérico',
                    inv?.city || 'N/A',
                    `${inv?.volumeM3?.toFixed(2) || '0.00'} m³`,
                    inv?.orderNumber || 'N/A'
                ];
            });

            autoTable(doc, {
                startY: finalY + 15,
                head: [['#', 'FACTURA', 'CLIENTE', 'CIUDAD', 'VOLUMEN', 'ORDEN']],
                body: documentRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [16, 185, 129],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'center'
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [15, 23, 42]
                },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 60 },
                    3: { cellWidth: 30 },
                    4: { cellWidth: 25, halign: 'right' },
                    5: { cellWidth: 30 }
                }
            });

            // Footer
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(
                    `Generado por M7 Intelligence • Página ${i} de ${pageCount}`,
                    105,
                    285,
                    { align: 'center' }
                );
            }

            // Guardar PDF
            const fileName = `M7_Planilla_${route.plate}_${new Date().getTime()}.pdf`;
            doc.save(fileName);

            toast.success('✅ Planilla PDF generada exitosamente');
        } catch (error) {
            console.error('[PDF-GENERATION-ERROR]', error);
            toast.error('Error al generar PDF');
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    // 4. Auto-reporte de ubicación y WakeLock (Mantener pantalla encendida)
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

    useEffect(() => {
        fetchLocations();
        const interval = setInterval(fetchLocations, 60000); // Actualizar cada 60 segundos
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Cabecera de Control */}
            <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center shadow-2xl border-2 border-emerald-500">
                        <Icons.Radar className="w-8 h-8 text-emerald-500 animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Centro de Mando</h2>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rastreo GPS en Tiempo Real (v1.2-FIX)</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={fetchLocations}
                        disabled={isValidating}
                        className={`px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition-all flex items-center gap-3 ${isValidating ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isValidating ? <Icons.RotateCcw className="w-4 h-4 animate-spin" /> : <Icons.MapPin className="w-4 h-4" />}
                        {isValidating ? 'Actualizando...' : 'Actualizar GPS'}
                    </button>
                    <button
                        onClick={onRefresh}
                        className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-emerald-500 transition-all shadow-sm"
                    >
                        <Icons.RefreshCw className="w-5 h-5" />
                    </button>
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
                                return acc + (inv?.volumeM3 || 0);
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
                                                <button
                                                    onClick={() => setSelectedActiveRoute(route)}
                                                    className="flex-1 py-3 bg-slate-50 hover:bg-slate-900 hover:text-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
                                                >
                                                    Ver Detalle
                                                </button>
                                                <button
                                                    onClick={() => generateRoutePDF(route)}
                                                    disabled={isGeneratingPDF}
                                                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                                >
                                                    {isGeneratingPDF ? '...' : '📄 PDF'}
                                                </button>
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

                    {/* Overlay de Estadísticas Flotante y Moderno */}
                    <div className="absolute bottom-8 right-8 z-[400] flex flex-col gap-3">
                        <div className="bg-slate-900/90 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/10 shadow-2xl flex items-center gap-8">
                            <div className="text-center px-2">
                                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Activas</p>
                                <p className="text-2xl font-black text-white">{activeRoutes.length}</p>
                            </div>
                            <div className="h-8 w-px bg-white/10"></div>
                            <div className="text-center px-2">
                                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">GPS Ok</p>
                                <p className="text-2xl font-black text-white">{vehicleLocations.length}</p>
                            </div>
                            <div className="h-8 w-px bg-white/10"></div>
                            <div className="text-center px-2">
                                <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-1">Sin Señal</p>
                                <p className="text-2xl font-black text-white">{Math.max(0, activeRoutes.length - vehicleLocations.length)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Leyenda del Mapa Minimalista (Top-Right) */}
                    <div className="absolute top-6 right-6 z-[400] bg-slate-900/40 backdrop-blur-md p-4 rounded-3xl border border-white/5 shadow-inner hidden md:block group-hover:bg-slate-900/80 transition-all">
                        <p className="text-[7px] font-black text-white/50 uppercase mb-3 tracking-widest text-center">Referencia</p>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                <p className="text-[8px] font-black text-white/70 uppercase">HUB M7</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-slate-100 rounded-md rotate-45 border border-emerald-500"></div>
                                <p className="text-[8px] font-black text-white/70 uppercase">En Ruta</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-px bg-emerald-500/50 border-t border-dashed border-emerald-500"></div>
                                <p className="text-[8px] font-black text-white/70 uppercase">Trayecto</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Detalle Mejorado */}
            {selectedActiveRoute && (
                <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
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
                                </div>
                            </div>
                            <button onClick={() => setSelectedActiveRoute(null)} className="w-10 h-10 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center transition-all shadow-sm">
                                <Icons.X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">FACTURAS</p>
                                    <p className="text-2xl font-black text-slate-950">{(selectedActiveRoute.invoice_ids || []).length}</p>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">VOLUMEN</p>
                                    <p className="text-2xl font-black text-emerald-600">
                                        {(selectedActiveRoute.invoice_ids || []).reduce((acc: number, id: string) => {
                                            const inv = invoices.find(i => i.id === id);
                                            return acc + (inv?.volumeM3 || 0);
                                        }, 0).toFixed(1)}m³
                                    </p>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">CAPACIDAD</p>
                                    <div className="w-full bg-slate-200 h-2 rounded-full mt-2">
                                        <div
                                            className="bg-emerald-500 h-full rounded-full transition-all"
                                            style={{
                                                width: `${Math.min(100, ((selectedActiveRoute.invoice_ids || []).reduce((acc: number, id: string) => {
                                                    const inv = invoices.find(i => i.id === id);
                                                    return acc + (inv?.volumeM3 || 0);
                                                }, 0) / (vehicles.find(v => v.id === selectedActiveRoute.vehicle_id)?.capacityM3 || 1)) * 100)}%`
                                            }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">ESTADO</p>
                                    <p className="text-[10px] font-black text-emerald-600 uppercase">
                                        {selectedActiveRoute.status === 'EN_RUTA' ? '🚚 EN TRÁNSITO' : '✅ CONFIRMADA'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <p className="text-sm font-black text-slate-900 uppercase tracking-wider">Desglose de Documentos</p>
                                    <p className="text-xs text-slate-400 font-bold">{(selectedActiveRoute.invoice_ids || []).length} items</p>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                    {[...new Set(selectedActiveRoute.invoice_ids || [])].map((id: any, idx: number) => {
                                        console.log('Rendering Invoice Row:', id, idx, `${id}-${idx}`);
                                        const cleanId = String(id).trim().replace(/[\r\n\t\f\v ]/g, '');
                                        const inv = invoices.find(i => String(i.id).trim().replace(/[\r\n\t\f\v ]/g, '') === cleanId);
                                        return (
                                            <div key={`${id}-${idx}`} className="p-4 bg-gradient-to-r from-white to-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center hover:shadow-md transition-all group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-emerald-500 font-black text-xs">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-emerald-500 transition-all">
                                                        <Icons.FileText className="w-5 h-5 text-slate-400 group-hover:text-slate-950" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-900">{inv?.invoiceNumber || id}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{inv?.customerName || 'Cliente Genérico'}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-emerald-600">{inv?.volumeM3?.toFixed(2) || '0.00'} m³</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase">{inv?.city || 'N/A'}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
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
        </div>
    );
};

export default LogisticsDispatch;
