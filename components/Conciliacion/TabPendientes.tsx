import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ConciliacionModal from '../Logistics/ConciliacionModal';
import ConciliacionRouteModal from '../Logistics/ConciliacionRouteModal';
import AssignmentModal from './AssignmentModal';
import { exportToExcel } from '../../utils/exportUtils';
import TableControls from '../shared/TableControls';
import Pagination from '../shared/Pagination';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface DocSummary {
    id: string;
    external_doc_id: string;
    vehicle_plate: string;
    plan_type: string;
    status: string;
    created_at: string;
    delivery_date?: string;
    total_invoices: number;
    conciliadas: number;
    pendientes: number;
    conductor_id?: string;
    conductor_name?: string;
    total_efectivo?: number;
    total_credito?: number;
    total_legalizado_individual?: number;
    total_pago_grupal?: number;
    total_sobrecosto_ruta?: number;
    client_id?: string;
}

interface RouteGroup {
    route_id: string;
    plate: string;
    driver_name: string | null;
    invoice_count: number;
    efectivo: number;
    credito: number;
    completadas: number;
    devueltas: number;
    parciales: number;
    legalizadas: number;
    valor_legalizado: number;
    valor_devuelto: number;
    valor_parcial: number;
    total_sobrecosto: number;
}

interface InvoiceRow {
    invoice_number: string;
    customer_name?: string;
    city?: string;
    address?: string;
    total_qty?: number;
    conciliation_id?: number;
    banco?: string;
    valor?: number;
    comprobante?: string;
    fecha_pago?: string;
    forma_pago?: string;
    numero_cheque?: string;
    es_devolucion?: boolean;
    conciliado_por?: string;
    conductor_id?: string;
    conductor_name?: string;
    vehicle_plate?: string;
    conciliado_at?: string;
    conciliado_por_nombre?: string;
    invoice_value?: number;
    invoice_metodo_pago?: string;
    item_status?: string;
    route_vehicle_plate?: string;
    sobrecosto?: number;
    mastersuite_estado?: string;
    mastersuite_id_carga?: string;
    mastersuite_fecha_despacho?: string;
    mastersuite_fecha_entrega?: string;
    mastersuite_motivo_dev?: string;
    items?: any[];
    bodega_received_at?: string;
    assigned_at?: string;
    document_created_at?: string;
}

interface Props {
    docs: DocSummary[];
    loadingDocs: boolean;
    onRefresh: () => void;
    user: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCOP = (v: number | undefined | null) =>
    (v != null) ? `$${Number(v).toLocaleString('es-CO')}` : '—';

const fmtDate = (d: string | undefined) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const FORMA_COLOR: Record<string, { bg: string; text: string; label: string }> = {
    EFECTIVO:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '💵 Efectivo'      },
    TRANSFERENCIA: { bg: 'bg-blue-100',    text: 'text-blue-700',    label: '📱 Transferencia' },
    CONSIGNACION:  { bg: 'bg-violet-100',  text: 'text-violet-700',  label: '🏦 Consignación'  },
    CHEQUE:        { bg: 'bg-amber-100',   text: 'text-amber-700',   label: '📄 Cheque'        },
    DEVOLUCION:    { bg: 'bg-rose-100',    text: 'text-rose-700',    label: '🔄 Devolución'    },
};

const ENTREGADO_STATUS = ['EST-12', 'ENTREGADO', 'COMPLETED', 'FINALIZADO'];
const DEVUELTO_STATUS  = ['EST-13', 'DEVUELTO', 'DEVUELT'];
const PARCIAL_STATUS   = ['EST-14', 'ENTREGA PARCIAL', 'PARCIAL'];
const REPICE_STATUS    = ['EST-15', 'REPICE'];

// ── Sub-componente: Metric pill ───────────────────────────────────────────────

const Metric: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
    <div className={`flex flex-col items-center px-3 py-2 rounded-xl ${color}`}>
        <span className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-none mb-0.5">{label}</span>
        <span className="text-sm font-black leading-none">{value}</span>
    </div>
);

// ── Componente principal ──────────────────────────────────────────────────────

const TabPendientes: React.FC<Props> = ({ docs, loadingDocs, onRefresh, user }) => {
    const [searchPend, setSearchPend]       = useState('');
    const [selectedDoc, setSelectedDoc]     = useState<DocSummary | null>(null);
    const [invoices, setInvoices]           = useState<InvoiceRow[]>([]);
    const [routes, setRoutes]               = useState<RouteGroup[]>([]);
    const [unassigned, setUnassigned]       = useState(0);
    const [loadingInv, setLoadingInv]       = useState(false);
    const [routeSurcharges, setRouteSurcharges] = useState<any[]>([]);
    const [groupPayments, setGroupPayments]     = useState<any[]>([]);
    const [activeDetailCard, setActiveDetailCard] = useState<string | null>(null);
    const [modalInvoice, setModalInvoice]   = useState<InvoiceRow | null>(null);
    const [showReportInput, setShowReportInput] = useState(false);
    const [reportEmail, setReportEmail]     = useState('');
    const [sendingReport, setSendingReport] = useState(false);
    const [modalRoute, setModalRoute]           = useState<RouteGroup | null>(null);
    const [detailRoute, setDetailRoute]         = useState<RouteGroup | null>(null);
    const [searchInvoice, setSearchInvoice]     = useState('');
    const [searchRoute, setSearchRoute]         = useState('');
    const [importingMS, setImportingMS]         = useState(false);
    const msFileRef                             = React.useRef<HTMLInputElement>(null);
    const [pendingMsFile, setPendingMsFile]     = useState<File | null>(null);
    const [msPreviewData, setMsPreviewData]     = useState<any[]>([]);
    const [summaryFilter, setSummaryFilter]     = useState<string | null>(null);
    const [showMsPreview, setShowMsPreview]     = useState(false);
    const [closingCycle, setClosingCycle]       = useState(false);
    const [confirmClose, setConfirmClose]       = useState<{ plate?: string } | null>(null);

    // ASIGNACIÓN
    const [vehicles, setVehicles]           = useState<any[]>([]);
    const [assignments, setAssignments]     = useState<any[]>([]);
    const [assigningInvoice, setAssigningInvoice] = useState<InvoiceRow | null>(null);

    // PAGINACIÓN
    const [collapseDocs, setCollapseDocs]       = useState(false);
    const [docPage, setDocPage] = useState(1);
    const [docPageSize, setDocPageSize] = useState<number | 'all'>('all');
    const [routePage, setRoutePage] = useState(1);
    const [routePageSize, setRoutePageSize] = useState<number | 'all'>(10);
    const [invoicePage, setInvoicePage] = useState(1);
    const [invoicePageSize, setInvoicePageSize] = useState<number | 'all'>(10);

    // ── Carga de vehículos y vínculos ──────────────────────────────────────────
    useEffect(() => {
        Promise.all([api.getVehicles(), api.getAssignments()])
            .then(([v, a]) => {
                setVehicles(v || []);
                setAssignments(a || []);
            })
            .catch(() => {}); // Fallo silencioso, no crítico hasta intentar asignar
    }, []);

    // ── Carga detalle del documento ───────────────────────────────────────────
    const loadDocDetail = useCallback(async (doc: DocSummary) => {
        setSelectedDoc(doc);
        // En móvil (<640px) colapsar lista para mostrar el detalle automáticamente
        if (window.innerWidth < 640) setCollapseDocs(true);
        setInvoices([]);
        setRoutes([]);
        setUnassigned(0);
        setShowReportInput(false);
        setRouteSurcharges([]);
        setGroupPayments([]);
        setActiveDetailCard(null);
        setLoadingInv(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            setInvoices(res.invoices || []);
            setRoutes(res.routes   || []);
            setUnassigned(res.unassigned_invoices || 0);
            setRouteSurcharges(res.routeSurcharges || []);
            setGroupPayments(res.groupPayments || []);
        } catch { toast.error('Error cargando detalle del documento'); }
        finally { setLoadingInv(false); }
    }, []);

    const handleInvoiceSaved = () => {
        if (selectedDoc) loadDocDetail(selectedDoc);
        onRefresh();
    };

    const handleImportMasterSuite = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (msFileRef.current) msFileRef.current.value = '';

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target?.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                // Row 7 (index 6) = header, data starts at row 8 (index 7)
                const all: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, range: 6, defval: '' });
                const dataRows = all.slice(1).filter(r => String(r[4] || '').trim() !== '');
                const preview = dataRows.map(r => ({
                    Placa:          String(r[0] || '').trim(),
                    Factura:        String(r[4] || '').trim(),
                    Estado:         String(r[5] || '').trim(),
                    FechaDespacho:  String(r[7] || '').trim(),
                    FechaEntrega:   String(r[8] || '').trim(),
                    MotivoDevol:    String(r[11] || '').trim(),
                }));
                setPendingMsFile(file);
                setMsPreviewData(preview);
                setShowMsPreview(true);
            } catch {
                toast.error('No se pudo leer el archivo Excel');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleConfirmMasterSuite = async () => {
        if (!pendingMsFile) return;
        setShowMsPreview(false);
        setImportingMS(true);
        try {
            const res = await api.importMasterSuite(pendingMsFile);
            toast.success(`MasterSuite: ${res.updated} actualizadas, ${res.notFound} no encontradas`);
            if (selectedDoc) loadDocDetail(selectedDoc);
        } catch (err: any) {
            toast.error(err.message || 'Error importando MasterSuite');
        } finally {
            setImportingMS(false);
            setPendingMsFile(null);
            setMsPreviewData([]);
        }
    };

    const handleCloseCycle = async (plate?: string) => {
        if (!selectedDoc) return;
        setConfirmClose({ plate });
    };

    const handleConfirmClose = async () => {
        if (!selectedDoc || !confirmClose) return;
        const plate = confirmClose.plate;
        setConfirmClose(null);
        setClosingCycle(true);
        try {
            const res = await api.closeConciliationCycle({
                documentId: selectedDoc.id,
                userId: user.id,
                vehiclePlate: plate
            });
            toast.success(`Ciclo cerrado: ${res.closedCount} facturas conciliadas administrativamente.`);
            loadDocDetail(selectedDoc);
            onRefresh();
        } catch (err: any) {
            toast.error(err.message || 'Error cerrando ciclo');
        } finally {
            setClosingCycle(false);
        }
    };

    const handleSendReport = async () => {
        if (!selectedDoc || !reportEmail.trim()) return;
        setSendingReport(true);
        try {
            await api.generateConciliationReport(selectedDoc.id, reportEmail.trim());
            toast.success(`Informe enviado a ${reportEmail}`);
            setShowReportInput(false);
            setReportEmail('');
        } catch (err: any) { toast.error(err.message || 'Error enviando informe'); }
        finally { setSendingReport(false); }
    };

    const handleExportExcel = useCallback(() => {
        if (!selectedDoc) return;
        try {
            const wb = XLSX.utils.book_new();
            const docName = selectedDoc.external_doc_id ? `DOC-L-${selectedDoc.external_doc_id}` : 'CONCILIACION';

            const getStatusName = (id: string | undefined) => {
                if (!id) return 'PENDIENTE';
                const upper = id.toUpperCase();
                if (upper === 'EST-10') return 'PENDIENTE';
                if (upper === 'EST-11') return 'EN TRANSITO';
                if (upper === 'EST-12' || ENTREGADO_STATUS.includes(upper)) return 'ENTREGADO';
                if (upper === 'EST-13' || DEVUELTO_STATUS.includes(upper)) return 'DEVUELTO';
                if (upper === 'EST-14' || PARCIAL_STATUS.includes(upper)) return 'PARCIAL';
                if (upper === 'EST-15' || REPICE_STATUS.includes(upper)) return 'REPICE';
                return id;
            };

            const getScStatusName = (id: string | undefined) => {
                if (!id) return 'PENDIENTE';
                const upper = id.toUpperCase();
                if (upper === 'EST-01' || upper === 'PENDIENTE') return 'PENDIENTE';
                if (upper === 'EST-02' || upper === 'APROBADO') return 'APROBADO';
                return id;
            };

            // --- FUNCIÓN PARA FORMATEAR DATOS DE FACTURAS ---
            const mapInvoices = (list: any[]) => list.map(i => {
                const totalQty = i.items?.reduce((s, it: any) => s + (it.qty || 0), 0) || 1;
                const unitPrice = (i.invoice_value || 0) / (totalQty || 1);
                const devVal = i.items?.reduce((s, it: any) => {
                    const v = (it.returned_value !== undefined && it.returned_value !== null)
                        ? Number(it.returned_value)
                        : (Number(it.returned_qty || 0) * unitPrice);
                    return s + v;
                }, 0) || 0;
                
                return {
                    'FACTURA': i.invoice_number,
                    'CLIENTE': i.customer_name || '—',
                    'CIUDAD': i.city || '—',
                    'PLACA': i.route_vehicle_plate || '—',
                    'UN_CODE': i.un_code || '—',
                    'METODO PAGO PLANILLA': i.invoice_metodo_pago || '—',
                    'VALOR PLANILLA': Math.round(Number(i.invoice_value || 0)),
                    'ESTADO': getStatusName(i.item_status),
                    'VALOR FACTURA': Math.round(Number(i.invoice_value || 0)),
                    'VALOR RECAUDADO': Math.round(Number(i.valor || 0)),
                    'VALOR DEVUELTO': (() => {
                        const upperStatus = (i.item_status || '').toUpperCase();
                        const isDev = i.es_devolucion || DEVUELTO_STATUS.includes(upperStatus);
                        const isPar = PARCIAL_STATUS.includes(upperStatus);
                        const invVal = Number(i.invoice_value) || 0;
                        const recVal = Number(i.valor) || 0;

                        if (isDev) return invVal;
                        
                        // Para parciales, PRIORIZAMOS el valor de los ítems devueltos registrados
                        const itemsDev = i.items?.reduce((s: number, it: any) => {
                            const v = (it.returned_value !== undefined && it.returned_value !== null)
                                ? Number(it.returned_value)
                                : (Number(it.returned_qty || 0) * unitPrice);
                            return s + v;
                        }, 0) || 0;
                        if (isPar && itemsDev > 0) return Math.round(itemsDev);
                        
                        // Si es parcial pero no hay ítems (o el valor es 0), usamos la diferencia como último recurso
                        if (isPar) return Math.max(0, invVal - recVal);
                        
                        return Math.round(itemsDev);
                    })(),
                    'METODO CONCILIACION': i.forma_pago || '—',
                    'COMPROBANTE': i.comprobante || '—',
                    'FECHA PAGO': i.fecha_pago ? i.fecha_pago.slice(0, 10) : '—',
                    'FECHA CARGA SISTEMA': i.document_created_at ? i.document_created_at.slice(0, 10) : '—',
                    'FECHA RECIBIDO DOC': i.bodega_received_at ? i.bodega_received_at.slice(0, 10) : '—',
                    'FECHA ASIGNACION PLACA': i.assigned_at ? i.assigned_at.slice(0, 10) : '—',
                };
            });

            // --- HOJA 1: CONSOLIDADO GENERAL ---
            const consolidatedData = mapInvoices(invoices);
            
            const totalDocumentoGlobal = Math.round(invoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0));
            const individualLeg = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);
            const grupalLeg = (groupPayments || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
            const sobrecostosLeg = Math.round((routeSurcharges || []).filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02').reduce((s, r) => s + (Number(r.valor) || 0), 0));
            const totalLegalizadoGlobal = Math.round(individualLeg + grupalLeg + sobrecostosLeg);

            const totalCreditoGlobal = Math.round(invoices.filter(i => {
                const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
                return !(m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '');
            }).reduce((s, i) => s + (Number(i.invoice_value) || 0), 0));
            
            const totalDevolucionesGlobal = Math.round(consolidatedData.reduce((s, i) => s + (Number(i['VALOR DEVUELTO']) || 0), 0));

            const wsConsolidated = XLSX.utils.aoa_to_sheet([
                ['REPORTE CONSOLIDADO DE CONCILIACIÓN', '', '', '', 'TOTAL DOCUMENTO:', totalDocumentoGlobal],
                ['', '', '', '', 'TOTAL CRÉDITO:', totalCreditoGlobal],
                ['', '', '', '', 'TOTAL DEVOLUCION:', totalDevolucionesGlobal],
                ['', '', '', '', 'TOTAL SOBRECOSTO:', sobrecostosLeg],
                ['', '', '', '', 'TOTAL LEGALIZADO:', totalLegalizadoGlobal],
                []
            ]);
            if (wsConsolidated['F1']) wsConsolidated['F1'].z = '#,##0';
            if (wsConsolidated['F2']) wsConsolidated['F2'].z = '#,##0';
            if (wsConsolidated['F3']) wsConsolidated['F3'].z = '#,##0';
            if (wsConsolidated['F4']) wsConsolidated['F4'].z = '#,##0';
            if (wsConsolidated['F5']) wsConsolidated['F5'].z = '#,##0';

            // 1. CONSIGNACIONES GRUPALES
            if (groupPayments && groupPayments.length > 0) {
                XLSX.utils.sheet_add_aoa(wsConsolidated, [['CONSIGNACIONES GRUPALES']], { origin: -1 });
                XLSX.utils.sheet_add_json(wsConsolidated, groupPayments.map(p => ({
                    'PLACA': p.plate || '—',
                    'METODO': p.metodo_pago || p.metodo || '—',
                    'VALOR': Number(p.valor) || 0,
                    'REFERENCIA': p.referencia || p.nro_aprobacion || p.nroAprobacion || '—',
                    'FECHA CONSIGNACION': p.fecha ? String(p.fecha).slice(0, 10) : '—',
                    'OBSERVACION': p.observacion || '—'
                })), { origin: -1 });
                XLSX.utils.sheet_add_aoa(wsConsolidated, [[]], { origin: -1 });
            }

            // 2. SOBRECOSTOS DE RUTA
            if (routeSurcharges && routeSurcharges.length > 0) {
                XLSX.utils.sheet_add_aoa(wsConsolidated, [['SOBRECOSTOS DE RUTA']], { origin: -1 });
                XLSX.utils.sheet_add_json(wsConsolidated, routeSurcharges.map(s => ({
                    'PLACA': s.plate || '—',
                    'VALOR': Number(s.valor) || 0,
                    'REFERENCIA': s.referencia || s.nro_aprobacion || s.nroAprobacion || '—',
                    'FECHA': s.fecha ? String(s.fecha).slice(0, 10) : '—',
                    'ESTADO': getScStatusName(s.status_id || s.statusId)
                })), { origin: -1 });
                XLSX.utils.sheet_add_aoa(wsConsolidated, [[]], { origin: -1 });
            }

            // 3. DETALLE DE FACTURAS
            XLSX.utils.sheet_add_aoa(wsConsolidated, [['DETALLE DE FACTURAS']], { origin: -1 });
            XLSX.utils.sheet_add_json(wsConsolidated, consolidatedData, { origin: -1 });

            XLSX.utils.book_append_sheet(wb, wsConsolidated, docName.slice(0, 30));

            // --- HOJAS SIGUIENTES: POR PLACA ---
            const plates = Array.from(new Set(invoices.map(i => i.route_vehicle_plate).filter(Boolean)));
            plates.forEach(p => {
                if (!p) return;
                const plateInvs = invoices.filter(i => i.route_vehicle_plate === p);
                const plateData = mapInvoices(plateInvs);
                const plateGroup = groupPayments?.filter(g => g.plate === p) || [];
                const plateSur = routeSurcharges?.filter(s => s.plate === p) || [];

                const plateTotalDoc = Math.round(plateInvs.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0));
                const plateIndLeg = plateInvs.reduce((s, i) => s + (Number(i.valor) || 0), 0);
                const plateGrpLeg = plateGroup.reduce((s, g) => s + (Number(g.valor) || 0), 0);
                const plateSurLeg = Math.round(plateSur.filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02').reduce((s, r) => s + (Number(r.valor) || 0), 0));
                const plateTotalLeg = Math.round(plateIndLeg + plateGrpLeg + plateSurLeg);
                
                const plateTotalCredito = Math.round(plateInvs.filter(i => {
                    const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
                    return !(m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '');
                }).reduce((s, i) => s + (Number(i.invoice_value) || 0), 0));
                
                const plateTotalDevolucion = Math.round(plateData.reduce((s, i) => s + (Number(i['VALOR DEVUELTO']) || 0), 0));

                const wsPlate = XLSX.utils.aoa_to_sheet([
                    ['REPORTE DE CONCILIACIÓN - PLACA ' + p, '', '', '', 'TOTAL DOCUMENTO:', plateTotalDoc],
                    ['', '', '', '', 'TOTAL CRÉDITO:', plateTotalCredito],
                    ['', '', '', '', 'TOTAL DEVOLUCION:', plateTotalDevolucion],
                    ['', '', '', '', 'TOTAL SOBRECOSTO:', plateSurLeg],
                    ['', '', '', '', 'TOTAL LEGALIZADO:', plateTotalLeg],
                    []
                ]);
                if (wsPlate['F1']) wsPlate['F1'].z = '#,##0';
                if (wsPlate['F2']) wsPlate['F2'].z = '#,##0';
                if (wsPlate['F3']) wsPlate['F3'].z = '#,##0';
                if (wsPlate['F4']) wsPlate['F4'].z = '#,##0';
                if (wsPlate['F5']) wsPlate['F5'].z = '#,##0';

                // 1. Pagos grupales de esta placa
                if (plateGroup.length > 0) {
                    XLSX.utils.sheet_add_aoa(wsPlate, [['CONSIGNACIONES GRUPALES - ' + p]], { origin: -1 });
                    XLSX.utils.sheet_add_json(wsPlate, plateGroup.map(g => ({
                        'METODO': g.metodo_pago || g.metodo || '—',
                        'VALOR': Number(g.valor) || 0,
                        'REFERENCIA': g.referencia || g.nro_aprobacion || g.nroAprobacion || '—',
                        'FECHA CONSIGNACION': g.fecha ? String(g.fecha).slice(0, 10) : '—',
                        'OBSERVACION': g.observacion || '—'
                    })), { origin: -1 });
                    XLSX.utils.sheet_add_aoa(wsPlate, [[]], { origin: -1 });
                }

                // 2. Sobrecostos de esta placa
                if (plateSur.length > 0) {
                    XLSX.utils.sheet_add_aoa(wsPlate, [['SOBRECOSTOS DE RUTA - ' + p]], { origin: -1 });
                    XLSX.utils.sheet_add_json(wsPlate, plateSur.map(s => ({
                        'VALOR': Number(s.valor) || 0,
                        'REFERENCIA': s.referencia || s.nro_aprobacion || s.nroAprobacion || '—',
                        'FECHA': s.fecha ? String(s.fecha).slice(0, 10) : '—',
                        'ESTADO': getScStatusName(s.status_id || s.statusId)
                    })), { origin: -1 });
                    XLSX.utils.sheet_add_aoa(wsPlate, [[]], { origin: -1 });
                }

                // 3. Detalle de facturas
                XLSX.utils.sheet_add_aoa(wsPlate, [['DETALLE DE FACTURAS']], { origin: -1 });
                XLSX.utils.sheet_add_json(wsPlate, plateData, { origin: -1 });

                XLSX.utils.book_append_sheet(wb, wsPlate, p.slice(0, 30));
            });

            XLSX.writeFile(wb, `${docName}_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success('Excel generado correctamente');
        } catch (err: any) {
            console.error('Export Error:', err);
            toast.error('Error al generar Excel: ' + err.message);
        }
    }, [selectedDoc, invoices, groupPayments, routeSurcharges]);

    const handleExportSobrecostos = useCallback(() => {
        if (!selectedDoc || routeSurcharges.length === 0) {
            toast.error('No hay sobrecostos para exportar');
            return;
        }
        try {
            const wb = XLSX.utils.book_new();
            const data = routeSurcharges.map(s => ({
                'DOCUMENTO':     selectedDoc.external_doc_id,
                'PLACA':         s.plate || '—',
                'VALOR':         Number(s.valor) || 0,
                'REFERENCIA':    s.referencia || '—',
                'FECHA':         s.fecha ? String(s.fecha).slice(0, 10) : '—',
                'ESTADO':        (s.status_id === 'APROBADO' || s.status_id === 'EST-02') ? 'Aprobado' : 'Pendiente',
                'OBSERVACIONES': s.observaciones || '—',
                'FACTURAS':      s.facturas || '—',
                'REGISTRADO':    s.created_at ? String(s.created_at).replace('T', ' ').slice(0, 16) : '—',
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, 'Sobrecostos');
            XLSX.writeFile(wb, `SOBRECOSTOS-${selectedDoc.external_doc_id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success('Sobrecostos exportados correctamente');
        } catch (err: any) {
            toast.error('Error al exportar: ' + err.message);
        }
    }, [selectedDoc, routeSurcharges]);

    // ── Filtros ───────────────────────────────────────────────────────────────
    const filteredDocs = useMemo(() =>
        docs.filter(d =>
            !searchPend ||
            d.external_doc_id?.toLowerCase().includes(searchPend.toLowerCase()) ||
            d.vehicle_plate?.toLowerCase().includes(searchPend.toLowerCase()) ||
            d.conductor_name?.toLowerCase().includes(searchPend.toLowerCase())
        ), [docs, searchPend]);

    // Rutas filtradas por búsqueda de placa/conductor
    const filteredRoutes = useMemo(() => {
        if (!searchRoute.trim()) return routes;
        const q = searchRoute.toLowerCase();
        return routes.filter(r =>
            r.plate?.toLowerCase().includes(q) ||
            r.driver_name?.toLowerCase().includes(q)
        );
    }, [routes, searchRoute]);

    // Lista inferior: solo facturas sin asignar, filtradas por búsqueda
    const visibleInvoices = useMemo(() => {
        const unassigned = invoices.filter(inv => !inv.route_vehicle_plate);
        if (!searchInvoice.trim()) return unassigned;
        const q = searchInvoice.toLowerCase();
        return unassigned.filter(inv =>
            inv.invoice_number?.toLowerCase().includes(q) ||
            inv.customer_name?.toLowerCase().includes(q)
        );
    }, [invoices, searchInvoice]);

    // ── Valores financieros por placa calculados desde invoices individuales ──
    // Evita el doble conteo que ocurre en el SQL cuando hay múltiples JOINs.
    const routeFinancials = useMemo(() => {
        const map = new Map<string, {
            valor_legalizado: number; valor_devuelto: number;
            valor_parcial: number; total_sobrecosto_aprobado: number;
            efectivo: number; credito: number;
            completadas: number; devueltas: number; parciales: number; legalizadas: number;
            repice_count: number; valor_repice: number;
            valor_grupal: number; valor_total: number; valor_credito: number;
        }>();

        invoices.forEach(inv => {
            const plate = inv.route_vehicle_plate || inv.vehicle_plate || '';
            if (!plate) return;
            const cur = map.get(plate) ?? {
                valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto_aprobado: 0,
                efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                repice_count: 0, valor_repice: 0, valor_grupal: 0, valor_total: 0, valor_credito: 0
            };
            const val    = Number(inv.valor) || 0;
            const invVal = Number(inv.invoice_value) || 0;
            const sc     = Number(inv.sobrecosto) || 0;
            const metodo = (inv.forma_pago || '').toUpperCase();
            const metodoInv = (inv.invoice_metodo_pago || '').toUpperCase();
            const isEfectivo = metodoInv === 'EF' || metodoInv.includes('EFE') || metodoInv === 'CASH' || metodoInv === ''; 
            const isCredito  = !isEfectivo; // Todo lo que no sea EF es Crédito/Cartera
            const status = (inv.item_status || '').toUpperCase();

            // Solo sumar al valor total si es efectivo (EF)
            if (isEfectivo) {
                cur.valor_total += invVal;
            } 
            
            // Solo sumar al valor crédito si es DIFERENTE a EF
            if (isCredito) {
                cur.valor_credito += invVal;
            }

            if (inv.forma_pago) {
                cur.valor_legalizado += val;
                cur.legalizadas += 1;
                if (metodo === 'EFECTIVO' || metodo.includes('EFE')) cur.efectivo += val;
                else cur.credito += val;
            }

            if (REPICE_STATUS.includes(status)) {
                cur.repice_count += 1;
                cur.valor_repice += invVal;
            }

            // Solo sumar devoluciones si es efectivo
            const isDev = inv.es_devolucion || DEVUELTO_STATUS.includes(status);
            const isPar = PARCIAL_STATUS.includes(status);
            if (isEfectivo) {
                if (isDev) {
                    cur.valor_devuelto += invVal;
                } else if (isPar) {
                    // Priorizar ítems
                    const totalQtyItems = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                    const unitPrice     = invVal / (totalQtyItems || 1);
                    const itemsDevVal   = inv.items?.reduce((acc: number, it: any) => {
                        const v = (it.returned_value !== undefined && it.returned_value !== null)
                            ? Number(it.returned_value)
                            : (Number(it.returned_qty || 0) * unitPrice);
                        return acc + v;
                    }, 0) || 0;
                    
                    if (itemsDevVal > 0) {
                        cur.valor_devuelto += itemsDevVal;
                    } else if (inv.forma_pago) {
                        cur.valor_devuelto += Math.max(0, invVal - val);
                    }
                }
            }
            
            if (PARCIAL_STATUS.includes(status)) { cur.valor_parcial += val; cur.parciales += 1; }
            if (inv.es_devolucion || DEVUELTO_STATUS.includes(status)) cur.devueltas += 1;
            if (ENTREGADO_STATUS.includes(status)) cur.completadas += 1;
            // Individual surcharge (if any)
            if (isEfectivo && (inv.item_status === 'APROBADO' || inv.item_status === 'EST-02')) {
                cur.total_sobrecosto_aprobado += sc;
            }
            map.set(plate, cur);
        });

        // Sumar consignaciones grupales por placa
        groupPayments.forEach(p => {
            const plate = p.plate || '';
            if (!plate) return;
            const cur = map.get(plate) ?? {
                valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto_aprobado: 0,
                efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                repice_count: 0, valor_repice: 0, valor_grupal: 0, valor_total: 0, valor_credito: 0
            };
            cur.valor_grupal += (Number(p.valor) || 0);
            map.set(plate, cur);
        });

        // Sumar sobrecostos globales aprobados por placa
        routeSurcharges.forEach(s => {
            if (s.status_id !== 'APROBADO' && s.status_id !== 'EST-02') return;
            const plate = s.plate || '';
            if (!plate) return;
            const cur = map.get(plate) ?? {
                valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto_aprobado: 0,
                efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                repice_count: 0, valor_repice: 0, valor_grupal: 0, valor_total: 0, valor_credito: 0
            };
            cur.total_sobrecosto_aprobado += (Number(s.valor) || 0);
            map.set(plate, cur);
        });

        return map;
    }, [invoices, groupPayments, routeSurcharges]);

    // ── Métricas globales del documento ───────────────────────────────────────
    const stats = useMemo(() => {
        const total           = invoices.length;
        const legalizadas     = invoices.filter(i => !!i.forma_pago).length;
        const entregadas      = invoices.filter(i => ENTREGADO_STATUS.includes(i.item_status || '')).length;
        const devueltas       = invoices.filter(i => i.es_devolucion || DEVUELTO_STATUS.includes(i.item_status || '')).length;
        const parciales       = invoices.filter(i => PARCIAL_STATUS.includes(i.item_status || '')).length;
        
        const valorTotalGlobal = invoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        
        // RE-DEFINICIÓN: El 'Legalizado' en las cards principales se refiere a las FACTURAS.
        // Las consignaciones grupales y sobrecostos son 'Recaudos Extra' que no matan facturas directamente.
        const individualLeg   = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);
        
        // Recaudos adicionales: Solo contamos los que NO tienen factura asociada (los que son realmente grupales)
        const grupalRows      = groupPayments.filter(p => !p.invoice || p.invoice.trim() === '');
        const totalGrupal     = grupalRows.reduce((s, p) => s + (Number(p.valor) || 0), 0);

        // FILTRO CRÍTICO: 'EF' -> TOTAL DOCUMENTO, '030D' -> TOTAL CREDITO
        const efectivoInvoices = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '';
        });

        const approvedRows    = routeSurcharges.filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02');
        const approvedSurch   = approvedRows.reduce((s, r) => s + (Number(r.valor) || 0), 0) + 
                                efectivoInvoices.filter(i => (i.item_status === 'APROBADO' || i.item_status === 'EST-02')).reduce((s, i) => s + (Number(i.sobrecosto) || 0), 0);
        
        const pendingRows     = routeSurcharges.filter(s => s.status_id === 'PENDIENTE' || s.status_id === 'EST-01' || !s.status_id);
        const pendingSurch    = pendingRows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
        
        const totalExtra      = totalGrupal + approvedSurch;

        const valorTotal      = efectivoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const valorDevuelto   = efectivoInvoices.reduce((s, i) => {
            const status = (i.item_status || '').toUpperCase();
            const isDev = i.es_devolucion || DEVUELTO_STATUS.includes(status);
            const isPar = PARCIAL_STATUS.includes(status);
            
            if (isDev) return s + (Number(i.invoice_value) || 0);
            
            if (isPar) {
                // Priorizar valor de ítems devueltos
                const totalQtyItems = i.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                const unitPrice     = (Number(i.invoice_value) || 0) / (totalQtyItems || 1);
                const itemsDevVal   = i.items?.reduce((acc: number, it: any) => {
                    const v = (it.returned_value !== undefined && it.returned_value !== null)
                        ? Number(it.returned_value)
                        : (Number(it.returned_qty || 0) * unitPrice);
                    return acc + v;
                }, 0) || 0;

                if (itemsDevVal > 0) return s + itemsDevVal;
                
                // Fallback a diferencia si ya está legalizado (forma_pago)
                if (i.forma_pago) {
                    return s + (Math.max(0, (Number(i.invoice_value) || 0) - (Number(i.valor) || 0)));
                }
            }
            return s;
        }, 0);
        const valorParcial    = efectivoInvoices.filter(i => PARCIAL_STATUS.includes((i.item_status || '').toUpperCase())).reduce((s, i) => s + (Number(i.valor) || 0), 0);

        // Filtrar Facturas a CRÉDITO (Todo lo que NO sea 'EF')
        const creditoInvoices = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return !(m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '');
        });
        const valorTotalCredito = creditoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);

        const assigned        = total - unassigned;
        
        const repiceRows      = invoices.filter(i => REPICE_STATUS.includes((i.item_status || '').toUpperCase()));
        const repiceCount     = repiceRows.length;
        const valorRepice     = repiceRows.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);

        // Valor de crédito pagado (para saber cuánto se ha legalizado de lo que era crédito)
        const individualCredito = invoices.filter(i => !!i.forma_pago && !( (i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') )).reduce((s, i) => s + (Number(i.valor) || 0), 0);

        return { 
            total, legalizadas, entregadas, devueltas, parciales, 
            valorTotal, valorTotalGlobal, valorTotalCredito,
            valorLegalizado: individualLeg, // Individual total
            individualCredito,
            totalGrupal,
            totalLegalizado: individualLeg + totalGrupal + approvedSurch,
            valorDevuelto, valorParcial, 
            approvedSurch, pendingSurch, totalExtra,
            assigned,
            grupalCount: grupalRows.length,
            approvedSurchCount: approvedRows.length,
            pendingSurchCount: pendingRows.length,
            repiceCount, valorRepice,
            pendiente: valorTotal - (individualLeg + totalGrupal + approvedSurch + valorDevuelto),
            isSurplus: (valorTotal - (individualLeg + totalGrupal + approvedSurch + valorDevuelto)) < -1
        };
    }, [invoices, unassigned, groupPayments, routeSurcharges]);

    const isAllLegalized = stats.total > 0 && stats.legalizadas === stats.total;

    const planBadge = (planType: string) => {
        const isPlanR = planType?.toUpperCase().includes('PLAN R') || planType?.toUpperCase() === 'R';
        return (
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wide
                ${isPlanR ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {isPlanR ? 'Plan R' : 'Normal'}
            </span>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-1 overflow-hidden">

            {/* ══ Panel izquierdo — lista de documentos ═══════════════════════ */}
            <div className={`${collapseDocs ? 'hidden' : 'w-full sm:w-72 lg:w-80'} flex-shrink-0 bg-white border-r border-slate-100 flex flex-col transition-all duration-300 overflow-hidden`}>
                {/* Buscador */}
                <div className="px-3 py-3 border-b border-slate-100 flex flex-col gap-2">
                    <TableControls 
                        searchValue={searchPend}
                        onSearchChange={(v) => { setSearchPend(v); setDocPage(1); }}
                        pageSize={docPageSize}
                        onPageSizeChange={(s) => { setDocPageSize(s); setDocPage(1); }}
                        placeholder="Buscar doc, placa…"
                        compact
                        showPageSize={false}
                    />
                    <button onClick={onRefresh} disabled={loadingDocs}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500">
                        <Icons.RefreshCw className={`w-3.5 h-3.5 ${loadingDocs ? 'animate-spin' : ''}`} />
                        Sincronizar
                    </button>
                    {summaryFilter && (
                        <button onClick={() => setSummaryFilter(null)}
                            className="w-full py-2 bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-2 text-[10px] font-black text-white uppercase tracking-widest shadow-md">
                            <Icons.X className="w-3.5 h-3.5" />
                            Quitar Filtro
                        </button>
                    )}
                </div>
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex gap-2">
                    <span className="text-[8px] font-bold text-slate-500">{filteredDocs.length} documentos</span>
                    <span className="text-[8px] text-emerald-600 font-bold ml-auto">
                        {filteredDocs.filter(d => d.pendientes === 0).length} completos
                    </span>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingDocs ? (
                        <div className="flex items-center justify-center h-32">
                            <Icons.Loader className="w-5 h-5 animate-spin text-emerald-500" />
                        </div>
                    ) : filteredDocs.length === 0 ? (
                        <div className="text-center py-10 px-4">
                            <p className="text-3xl mb-2">📋</p>
                            <p className="text-xs font-bold text-slate-400">No hay documentos pendientes</p>
                        </div>
                    ) : filteredDocs
                        .slice(docPageSize === 'all' ? 0 : (docPage - 1) * docPageSize, docPageSize === 'all' ? filteredDocs.length : docPage * docPageSize)
                        .map(doc => {
                        const complete = doc.pendientes === 0;
                        const totalEF = Number(doc.total_efectivo || 0);
                        const totalLeg = Number(doc.total_legalizado_individual || 0) + 
                                       Number(doc.total_pago_grupal || 0) + 
                                       Number(doc.total_sobrecosto_ruta || 0);
                        
                        const pct = totalEF > 0
                            ? Math.min(100, Math.round((totalLeg / totalEF) * 100)) 
                            : (complete ? 100 : 0);
                        const isActive = selectedDoc?.id === doc.id;
                        return (
                            <button key={doc.id} onClick={() => loadDocDetail(doc)}
                                className={`w-full text-left px-3 py-3 border-b border-slate-50 transition-all
                                    ${isActive
                                        ? 'bg-emerald-50 border-l-4 border-l-emerald-500'
                                        : 'border-l-4 border-l-transparent hover:bg-slate-50'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-[11px] font-black text-slate-900 truncate">{doc.external_doc_id}</p>
                                            {doc.plan_type && planBadge(doc.plan_type)}
                                        </div>
                                        <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">
                                            🚛 {doc.vehicle_plate || '—'}
                                            {doc.conductor_name && ` · ${doc.conductor_name}`}
                                        </p>
                                        {doc.delivery_date && (
                                            <p className="text-[8px] text-slate-400 mt-0.5">📅 {fmtDate(doc.delivery_date)}</p>
                                        )}
                                        {((doc.total_efectivo ?? 0) > 0 || (doc.total_credito ?? 0) > 0) && (
                                            <div className="flex gap-1.5 mt-1">
                                                {(doc.total_efectivo ?? 0) > 0 && (
                                                    <span className="text-[7px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                                        💵 {fmtCOP(doc.total_efectivo)}
                                                    </span>
                                                )}
                                                {(doc.total_credito ?? 0) > 0 && (
                                                    <span className="text-[7px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                                        💳 {fmtCOP(doc.total_credito)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[7px] font-black uppercase
                                        ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {complete ? '✅' : `${pct}% Rec.`}
                                    </span>
                                </div>
                                <div className="mt-2">
                                    <div className="flex justify-between mb-0.5">
                                        <span className="text-[7px] text-slate-400">{fmtCOP(totalLeg)} / {fmtCOP(totalEF)}</span>
                                        <span className="text-[7px] font-bold text-slate-400">{pct}%</span>
                                    </div>
                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <Pagination 
                    currentPage={docPage}
                    totalPages={docPageSize === 'all' ? 1 : Math.ceil(filteredDocs.length / docPageSize)}
                    onPageChange={setDocPage}
                    totalResults={filteredDocs.length}
                    pageSize={docPageSize}
                />
            </div>

            {/* ══ Panel derecho — detalle del documento ═══════════════════════ */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
                {!selectedDoc ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-5xl mb-3">💰</p>
                            <h3 className="text-base font-black text-slate-400 uppercase">Selecciona un Documento</h3>
                            <p className="text-xs text-slate-400 mt-1">Elige un documento para ver sus rutas y conciliar</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ── Encabezado del documento ─────────────────────── */}
                        <div className="bg-white border-b border-slate-200 px-5 py-3 flex-shrink-0">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button onClick={() => setCollapseDocs(!collapseDocs)}
                                        className={`rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border-2 px-3 py-2
                                            ${collapseDocs
                                                ? 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900'
                                                : 'bg-white text-emerald-600 border-emerald-500 hover:bg-emerald-50'}`}
                                        title={collapseDocs ? "Mostrar lista de documentos" : "Ocultar lista de documentos"}>
                                        {collapseDocs
                                            ? <><Icons.ChevronLeft className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-wider sm:hidden">Lista</span></>
                                            : <Icons.ChevronLeft className="w-5 h-5" />}
                                    </button>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                        {selectedDoc.external_doc_id}
                                    </h3>
                                    {selectedDoc.plan_type && planBadge(selectedDoc.plan_type)}
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase
                                        ${isAllLegalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {isAllLegalized
                                            ? '✅ Legalizado completo'
                                            : `${stats.total - stats.legalizadas} sin legalizar`}
                                    </span>
                                    {selectedDoc.delivery_date && (
                                        <span className="text-[9px] text-slate-400 font-bold">
                                            📅 {fmtDate(selectedDoc.delivery_date)}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Importar MasterSuite */}
                                    <input
                                        ref={msFileRef}
                                        type="file"
                                        accept=".xlsx,.xls"
                                        className="hidden"
                                        onChange={handleImportMasterSuite}
                                    />
                                    {/* Cerrar Facturación */}
                                    <button
                                        onClick={() => handleCloseCycle()}
                                        disabled={closingCycle}
                                        title="Cerrar administrativamente las facturas restantes"
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm
                                            ${!closingCycle 
                                                ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                                        {closingCycle ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Lock className="w-3 h-3" />}
                                        Cerrar Facturación
                                    </button>

                                    <button
                                        onClick={handleExportExcel}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm">
                                        <Icons.Download className="w-3 h-3" />
                                        Exportar Excel
                                    </button>
                                    <button
                                        onClick={handleExportSobrecostos}
                                        title="Exportar tabla de sobrecostos con observaciones y facturas"
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm">
                                        <Icons.Download className="w-3 h-3" />
                                        Exportar Sobrecostos
                                    </button>
                                    <button
                                        onClick={() => msFileRef.current?.click()}
                                        disabled={importingMS}
                                        title="Importar reporte MasterSuite (.xlsx)"
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
                                        {importingMS
                                            ? <Icons.Loader className="w-3 h-3 animate-spin" />
                                            : <Icons.Upload className="w-3 h-3" />}
                                        MasterSuite
                                    </button>
                                    {isAllLegalized && (
                                        <button onClick={() => setShowReportInput(v => !v)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all">
                                            <Icons.Send className="w-3 h-3" /> Enviar Informe
                                        </button>
                                    )}
                                </div>
                            </div>
                            {showReportInput && (
                                <div className="mt-2 flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                                    <input type="email" value={reportEmail}
                                        onChange={e => setReportEmail(e.target.value)}
                                        placeholder="correo@ejemplo.com"
                                        className="flex-1 bg-transparent text-[11px] outline-none text-slate-900 placeholder:text-slate-400"
                                        onKeyDown={e => { if (e.key === 'Enter') handleSendReport(); }} />
                                    <button onClick={handleSendReport} disabled={sendingReport || !reportEmail.trim()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[8px] font-black uppercase transition-all disabled:opacity-50">
                                        {sendingReport ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Send className="w-3 h-3" />}
                                        Enviar
                                    </button>
                                </div>
                            )}
                        </div>

                        {loadingInv ? (
                            <div className="flex-1 flex items-center justify-center">
                                <Icons.Loader className="w-6 h-6 animate-spin text-emerald-500" />
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto custom-scrollbar">

                                {/* ── Bloque de métricas del documento ─────── */}
                                <div className="bg-white border-b border-slate-200 px-5 py-4 overflow-x-auto custom-scrollbar">
                                    <div className="flex gap-2 min-w-max pb-2">
                                        <div onClick={() => setSummaryFilter(null)}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${!summaryFilter ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-900 border-slate-100 hover:border-slate-300 shadow-md'}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${!summaryFilter ? 'text-slate-400' : 'text-slate-500'}`}>Total Placa (EF)</span>
                                            <span className="text-base font-black leading-none">{fmtCOP(stats.valorTotal)}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${!summaryFilter ? 'text-slate-500' : 'text-slate-400'}`}>{stats.total} Facts</span>
                                        </div>

                                        <div onClick={() => setSummaryFilter('individual')}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${summaryFilter === 'individual' ? 'bg-emerald-600 text-white border-emerald-700 shadow-xl' : 'bg-white text-emerald-600 border-emerald-100 hover:border-emerald-300 shadow-md'}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'individual' ? 'text-emerald-100' : 'text-emerald-500'}`}>Leg. Individual</span>
                                            <span className="text-base font-black leading-none">{fmtCOP(stats.valorLegalizado)}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'individual' ? 'text-emerald-100/70' : 'text-emerald-400'}`}>{stats.legalizadas} Facturas</span>
                                        </div>

                                        <div onClick={() => setSummaryFilter('grupal')}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${summaryFilter === 'grupal' ? 'bg-violet-600 text-white border-violet-700 shadow-xl' : 'bg-white text-violet-600 border-violet-100 hover:border-violet-300 shadow-md'}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'grupal' ? 'text-violet-100' : 'text-violet-500'}`}>Leg. Grupal</span>
                                            <span className="text-base font-black leading-none">{fmtCOP(stats.totalGrupal)}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'grupal' ? 'text-violet-100/70' : 'text-violet-400'}`}>{stats.grupalCount} Movs</span>
                                        </div>

                                        <div onClick={() => setSummaryFilter('pendiente')}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${summaryFilter === 'pendiente' 
                                                    ? (stats.isSurplus ? 'bg-blue-700 text-white border-blue-800 shadow-xl' : 'bg-amber-600 text-white border-amber-700 shadow-xl')
                                                    : (stats.isSurplus ? 'bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-300 shadow-md' : 'bg-white text-amber-600 border-amber-100 hover:border-amber-300 shadow-md')}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'pendiente' ? 'text-blue-100' : (stats.isSurplus ? 'text-blue-500' : 'text-amber-500')}`}>
                                                {stats.isSurplus ? '💎 Sobrante' : 'Pendiente'}
                                            </span>
                                            <span className="text-base font-black leading-none">{fmtCOP(Math.abs(stats.pendiente))}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'pendiente' ? 'text-white/70' : (stats.isSurplus ? 'text-blue-400' : 'text-amber-400')}`}>
                                                {stats.isSurplus ? 'Excedente' : `${stats.total - stats.legalizadas} Por Cobrar`}
                                            </span>
                                        </div>

                                        <div onClick={() => setSummaryFilter('credito')}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${summaryFilter === 'credito' ? 'bg-slate-800 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-md'}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'credito' ? 'text-slate-400' : 'text-slate-500'}`}>Crédito</span>
                                            <span className="text-base font-black leading-none">{fmtCOP(stats.valorTotalCredito)}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'credito' ? 'text-slate-500' : 'text-slate-400'}`}>En Cartera</span>
                                        </div>

                                        <div onClick={() => setSummaryFilter('devolucion')}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${summaryFilter === 'devolucion' ? 'bg-orange-600 text-white border-orange-700 shadow-xl' : 'bg-white text-orange-600 border-orange-100 hover:border-orange-300 shadow-md'}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'devolucion' ? 'text-orange-100' : 'text-orange-500'}`}>Devolución</span>
                                            <span className="text-base font-black leading-none">{fmtCOP(stats.valorDevuelto)}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'devolucion' ? 'text-orange-100/70' : 'text-orange-400'}`}>{stats.devueltas} Facturas</span>
                                        </div>

                                        <div onClick={() => setSummaryFilter('parcial')}
                                            className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                ${summaryFilter === 'parcial' ? 'bg-orange-400 text-white border-orange-500 shadow-xl' : 'bg-white text-orange-400 border-orange-100 hover:border-orange-300 shadow-md'}`}>
                                            <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'parcial' ? 'text-orange-100' : 'text-orange-500'}`}>Parcial</span>
                                            <span className="text-base font-black leading-none">{fmtCOP(stats.valorParcial)}</span>
                                            <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'parcial' ? 'text-orange-100/70' : 'text-orange-400'}`}>{stats.parciales} Facturas</span>
                                        </div>

                                        {stats.approvedSurch > 0 && (
                                            <div onClick={() => setSummaryFilter('sobrecostos')}
                                                className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                    ${summaryFilter === 'sobrecostos' ? 'bg-rose-600 text-white border-rose-700 shadow-xl' : 'bg-white text-rose-600 border-rose-100 hover:border-rose-300 shadow-md'}`}>
                                                <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'sobrecostos' ? 'text-rose-100' : 'text-rose-500'}`}>Sobrecostos (A)</span>
                                                <span className="text-base font-black leading-none">{fmtCOP(stats.approvedSurch)}</span>
                                                <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'sobrecostos' ? 'text-rose-100/70' : 'text-rose-400'}`}>{stats.approvedSurchCount} Aprobados</span>
                                            </div>
                                        )}

                                        {stats.pendingSurch > 0 && (
                                            <div onClick={() => setSummaryFilter('sobrecostos_p')}
                                                className={`flex flex-col px-4 py-2.5 rounded-2xl cursor-pointer transition-all border-2
                                                    ${summaryFilter === 'sobrecostos_p' ? 'bg-amber-600 text-white border-amber-700 shadow-xl' : 'bg-white text-amber-600 border-amber-100 hover:border-amber-300 shadow-md'}`}>
                                                <span className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${summaryFilter === 'sobrecostos_p' ? 'text-amber-100' : 'text-amber-500'}`}>Sobrecostos (P)</span>
                                                <span className="text-base font-black leading-none">{fmtCOP(stats.pendingSurch)}</span>
                                                <span className={`text-[8px] font-bold mt-1 ${summaryFilter === 'sobrecostos_p' ? 'text-amber-100/70' : 'text-amber-400'}`}>{stats.pendingSurchCount} Pendientes</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* SECCIÓN ELIMINADA: BARRA DE AVANCE PRINCIPAL */}

                                    {/* Fila 3: Otros Valores y Conteo de Estados */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-4 border-r border-slate-100 pr-4">
                                            <Metric label="Asignadas" value={stats.assigned} color="bg-blue-50 text-blue-700" />
                                            {unassigned > 0 && <Metric label="Sin Asignar" value={unassigned} color="bg-rose-50 text-rose-700" />}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Metric label="Entregadas"   value={stats.entregadas}  color="bg-teal-50 text-teal-700" />
                                            <Metric label="Devueltas"    value={stats.devueltas}   color="bg-amber-100 text-amber-700" />
                                            <Metric label="Parciales"    value={stats.parciales}   color="bg-orange-100 text-orange-700" />
                                        </div>
                                        
                                        {/* Valores de Devolución y Parcial */}
                                        <div className="flex gap-2 ml-auto">
                                            {stats.valorDevuelto > 0 && (
                                                <div className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200">
                                                    <span className="text-[7px] font-bold text-amber-600 uppercase block leading-none mb-0.5">Val. Devuelto</span>
                                                    <span className="text-[10px] font-black text-amber-800 leading-none">{fmtCOP(stats.valorDevuelto)}</span>
                                                </div>
                                            )}
                                            {stats.valorParcial > 0 && (
                                                <div className="px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200">
                                                    <span className="text-[7px] font-bold text-orange-600 uppercase block leading-none mb-0.5">Val. Parcial</span>
                                                    <span className="text-[10px] font-black text-orange-800 leading-none">{fmtCOP(stats.valorParcial)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 space-y-4">
                                    {/* Vista filtrada por Tarjeta (Desglose solicitado por usuario) */}
                                    {summaryFilter && (
                                        <div className="bg-white rounded-[2rem] border-2 border-slate-100 overflow-hidden shadow-xl animate-in slide-in-from-top-2 duration-300">
                                            <div className={`px-6 py-4 flex items-center justify-between border-b 
                                                ${summaryFilter === 'individual' ? 'bg-emerald-50 border-emerald-100' : 
                                                  summaryFilter === 'devolucion' ? 'bg-orange-50 border-orange-100' :
                                                  summaryFilter === 'parcial'    ? 'bg-amber-50 border-amber-100' :
                                                  'bg-slate-50 border-slate-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg
                                                        ${summaryFilter === 'individual' ? 'bg-emerald-600' : 
                                                          summaryFilter === 'devolucion' ? 'bg-orange-600' :
                                                          summaryFilter === 'parcial'    ? 'bg-amber-500' :
                                                          'bg-slate-800'}`}>
                                                        <Icons.List className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Desglose: {summaryFilter}</h4>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Listado detallado de facturas</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => setSummaryFilter(null)}
                                                    className="w-8 h-8 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center shadow-sm border border-slate-200 transition-all">
                                                    <Icons.X className="w-4 h-4 text-slate-500" />
                                                </button>
                                            </div>
                                            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
                                                {invoices.filter(i => {
                                                    if (summaryFilter === 'individual') return !!i.forma_pago;
                                                    if (summaryFilter === 'devolucion') return i.es_devolucion || DEVUELTO_STATUS.includes((i.item_status || '').toUpperCase());
                                                    if (summaryFilter === 'parcial')    return PARCIAL_STATUS.includes((i.item_status || '').toUpperCase());
                                                    if (summaryFilter === 'pendiente')  return !i.forma_pago && ( (i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') || (i.invoice_metodo_pago || '').toUpperCase().trim() === '' );
                                                    if (summaryFilter === 'credito')    return !( (i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') || (i.invoice_metodo_pago || '').toUpperCase().trim() === '' );
                                                    return true;
                                                }).map(inv => {
                                                    const legalizada = !!inv.forma_pago;
                                                    const cfg = inv.forma_pago ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago }) : null;
                                                    return (
                                                        <div key={inv.invoice_number} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">🚛 {inv.route_vehicle_plate || 'S/A'}</span>
                                                                    {cfg && <span className={`${cfg.bg} ${cfg.text} text-[7px] font-black px-1.5 py-0.5 rounded-full`}>{cfg.label}</span>}
                                                                </div>
                                                                <p className="text-[9px] text-slate-500 font-bold truncate max-w-[200px]">{inv.customer_name}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-black text-slate-900">{fmtCOP(inv.invoice_value)}</p>
                                                                {inv.valor > 0 && <p className="text-[8px] font-black text-emerald-600">Leg: {fmtCOP(inv.valor)}</p>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Tarjetas de placas/rutas ──────────── */}
                                    {!summaryFilter && routes.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                    Placas asignadas ({filteredRoutes.length}{searchRoute ? ` de ${routes.length}` : ''})
                                                </p>
                                            </div>
                                            {/* Búsqueda por placa */}
                                            <div className="relative mb-3">
                                                <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                                <input
                                                    value={searchRoute}
                                                    onChange={e => setSearchRoute(e.target.value)}
                                                    placeholder="Buscar por placa o conductor…"
                                                    className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                                {filteredRoutes.map(route => {
                                                    // Usar valores calculados desde invoices individuales (sin multiplicación SQL)
                                                    const fin = routeFinancials.get(route.plate) ?? {
                                                        valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto_aprobado: 0,
                                                        efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                                                        valor_grupal: 0, valor_total: 0
                                                    };
                                                    const totalLegPlate = fin.valor_legalizado + fin.valor_grupal + fin.total_sobrecosto_aprobado;
                                                    const pct = fin.valor_total > 0
                                                        ? Math.min(100, Math.round((totalLegPlate / fin.valor_total) * 100)) 
                                                        : (fin.legalizadas === route.invoice_count && route.invoice_count > 0 ? 100 : 0);
                                                    
                                                    const hasPendingSurcharge = routeSurcharges.some(s => s.plate === route.plate && (s.status_id === 'PENDIENTE' || s.status_id === 'EST-01' || !s.status_id));

                                                    return (
                                                        <div key={route.route_id}
                                                            className="rounded-2xl border-2 border-slate-100 bg-white transition-all overflow-hidden hover:border-slate-200">
                                                            {/* Cabecera de la tarjeta */}
                                                            <div className="px-4 py-3 bg-white">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0">
                                                                        <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-none">
                                                                            🚛 {route.plate || 'S/P'}
                                                                        </p>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <p className="text-[9px] text-slate-500 font-bold">
                                                                                👤 {route.driver_name || 'Sin conductor asignado'}
                                                                            </p>
                                                                            <button 
                                                                                onClick={(e) => { e.stopPropagation(); handleCloseCycle(route.plate); }}
                                                                                disabled={closingCycle}
                                                                                className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[7px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-1"
                                                                            >
                                                                                <Icons.Lock className="w-2 h-2" />
                                                                                Cerrar Facturación
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <p className="text-xl font-black text-slate-900 leading-none">{route.invoice_count}</p>
                                                                        <p className="text-[8px] font-bold text-slate-400 uppercase">facturas</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Métricas de la ruta */}
                                                            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                                                                {/* Barra de progreso legalización */}
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-emerald-500 rounded-full transition-all"
                                                                            style={{ width: `${pct}%` }} />
                                                                    </div>
                                                                    <span className="text-[8px] font-black text-emerald-700 shrink-0">{pct}% leg.</span>
                                                                </div>
                                                                {/* Contadores estado (desde invoices individuales) */}
                                                                <div className="grid grid-cols-4 gap-1 text-center">
                                                                    <div className="bg-emerald-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-emerald-700 leading-none">{fin.legalizadas}</p>
                                                                        <p className="text-[7px] font-bold text-emerald-600 uppercase mt-0.5">Leg.</p>
                                                                    </div>
                                                                    <div className="bg-teal-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-teal-700 leading-none">{fin.completadas}</p>
                                                                        <p className="text-[7px] font-bold text-teal-600 uppercase mt-0.5">Entregadas</p>
                                                                    </div>
                                                                    <div className="bg-amber-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-amber-700 leading-none">{fin.devueltas}</p>
                                                                        <p className="text-[7px] font-bold text-amber-600 uppercase mt-0.5">Devueltas</p>
                                                                    </div>
                                                                    <div className="bg-orange-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-orange-700 leading-none">{fin.parciales}</p>
                                                                        <p className="text-[7px] font-bold text-orange-600 uppercase mt-0.5">Parciales</p>
                                                                    </div>
                                                                </div>
                                                                {/* Valores financieros (calculados desde invoices, sin doble conteo) */}
                                                                <div className="grid grid-cols-2 gap-2 mt-3 mb-2">
                                                                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-2.5 py-2">
                                                                        <p className="text-[7px] font-black text-emerald-600 uppercase tracking-wider mb-0.5">💵 Legalizado</p>
                                                                        <p className="text-xs font-black text-emerald-800">{fmtCOP(fin.valor_legalizado + fin.valor_grupal)}</p>
                                                                    </div>
                                                                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl px-2.5 py-2">
                                                                        <p className="text-[7px] font-black text-amber-600 uppercase tracking-wider mb-0.5">🔄 Devuelto</p>
                                                                        <p className="text-xs font-black text-amber-800">{fmtCOP(fin.valor_devuelto)}</p>
                                                                    </div>
                                                                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2">
                                                                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-wider mb-0.5">💳 Crédito</p>
                                                                        <p className="text-xs font-black text-slate-700">{fmtCOP(fin.valor_credito)}</p>
                                                                    </div>
                                                                    {(() => {
                                                                        const pending = fin.valor_total - (fin.valor_legalizado + fin.valor_grupal + fin.valor_devuelto + fin.total_sobrecosto_aprobado);
                                                                        const isSurplus = pending < -1;
                                                                        return (
                                                                            <div className={`border rounded-xl px-2.5 py-2 ${isSurplus ? 'bg-blue-600 border-blue-700' : 'bg-amber-500 border-amber-600'}`}>
                                                                                <p className={`text-[7px] font-black uppercase tracking-wider mb-0.5 ${isSurplus ? 'text-blue-100' : 'text-amber-100'}`}>
                                                                                    {isSurplus ? '💎 Sobrante' : '⏳ Pendiente'}
                                                                                </p>
                                                                                <p className="text-xs font-black text-white">{fmtCOP(Math.abs(pending))}</p>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {fin.valor_parcial > 0 && (
                                                                        <div className="bg-orange-50/50 border border-orange-100 rounded-xl px-2.5 py-2">
                                                                            <p className="text-[7px] font-black text-orange-600 uppercase tracking-wider mb-0.5">📦 Parcial</p>
                                                                            <p className="text-xs font-black text-orange-800">{fmtCOP(fin.valor_parcial)}</p>
                                                                        </div>
                                                                    )}
                                                                    {fin.valor_repice > 0 && (
                                                                        <div className="bg-blue-50/50 border border-blue-100 rounded-xl px-2.5 py-2">
                                                                            <p className="text-[7px] font-black text-blue-600 uppercase tracking-wider mb-0.5">🔄 Repice</p>
                                                                            <p className="text-xs font-black text-blue-800">{fmtCOP(fin.valor_repice)} <span className="text-[8px] text-blue-500">({fin.repice_count})</span></p>
                                                                        </div>
                                                                    )}
                                                                    {fin.total_sobrecosto > 0 && (
                                                                        <div className="bg-rose-50/50 border border-rose-100 rounded-xl px-2.5 py-2">
                                                                            <p className="text-[7px] font-black text-rose-600 uppercase tracking-wider mb-0.5">⚠️ Sobrecosto</p>
                                                                            <p className="text-xs font-black text-rose-800">{fmtCOP(fin.total_sobrecosto)}</p>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Efectivo / Crédito */}
                                                                {(fin.efectivo > 0 || fin.credito > 0) && (
                                                                    <div className="flex gap-2">
                                                                        {fin.efectivo > 0 && (
                                                                            <div className="flex-1 bg-white border border-emerald-50 rounded-lg px-2 py-1 flex items-center justify-between">
                                                                                <span className="text-[7px] font-black text-emerald-600 uppercase">EFE</span>
                                                                                <span className="text-[9px] font-black text-emerald-700">{fmtCOP(fin.efectivo)}</span>
                                                                            </div>
                                                                        )}
                                                                        {fin.credito > 0 && (
                                                                            <div className="flex-1 bg-white border border-blue-50 rounded-lg px-2 py-1 flex items-center justify-between">
                                                                                <span className="text-[7px] font-black text-blue-600 uppercase">CRE</span>
                                                                                <span className="text-[9px] font-black text-blue-700">{fmtCOP(fin.credito)}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Botones: Consultar (solo lectura) + Conciliar (edición) */}
                                                            <div className="px-4 pb-3 pt-2 flex gap-2">
                                                                <button
                                                                    onClick={() => setDetailRoute(route)}
                                                                    className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                                                                    Ver detalle
                                                                </button>
                                                                 <button
                                                                    onClick={() => setModalRoute(route)}
                                                                    className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-emerald-600 transition-all">
                                                                    Conciliar →
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {/* Tarjeta sin ruta */}
                                                {unassigned > 0 && (
                                                    <div className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-4 flex flex-col justify-center items-center text-center">
                                                        <p className="text-2xl mb-1">⚠️</p>
                                                        <p className="text-sm font-black text-rose-700 uppercase tracking-tight">Sin Ruta</p>
                                                        <p className="text-[9px] text-rose-500 font-bold mt-1">
                                                            {unassigned} factura{unassigned !== 1 ? 's' : ''} no asignada{unassigned !== 1 ? 's' : ''} al planificador
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Facturas sin asignar ─────────────── */}
                                    {unassigned > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                ⚠️ Sin asignar ({visibleInvoices.length}{searchInvoice ? ` de ${invoices.filter(i => !i.route_vehicle_plate).length}` : ''})
                                            </p>
                                            {visibleInvoices.some(i => i.forma_pago) && (
                                                <span className="text-[8px] font-bold text-emerald-600">
                                                    {visibleInvoices.filter(i => i.forma_pago).length} legalizadas
                                                </span>
                                            )}
                                        </div>

                                        {/* Búsqueda */}
                                        <div className="relative mb-2">
                                            <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                            <input
                                                value={searchInvoice}
                                                onChange={e => setSearchInvoice(e.target.value)}
                                                placeholder="Buscar por factura o cliente…"
                                                className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        {visibleInvoices.length === 0 ? (
                                            <div className="text-center py-8 bg-white rounded-2xl border border-slate-100">
                                                <p className="text-2xl mb-2">🔍</p>
                                                <p className="text-xs text-slate-400 font-bold">Sin resultados para la búsqueda</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {visibleInvoices.map(inv => {
                                                    const legalizada = !!inv.forma_pago;
                                                    const cfg = inv.forma_pago
                                                        ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago })
                                                        : null;
                                                    const itemBadge = ENTREGADO_STATUS.includes(inv.item_status || '')
                                                        ? { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Entregada' }
                                                        : DEVUELTO_STATUS.includes(inv.item_status || '')
                                                        ? { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Devuelta' }
                                                        : PARCIAL_STATUS.includes(inv.item_status || '')
                                                        ? { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Parcial' }
                                                        : null;

                                                    return (
                                                        <div key={inv.invoice_number}
                                                            className={`bg-white rounded-2xl border-2 p-3.5 transition-all
                                                                ${legalizada ? 'border-emerald-100' : 'border-slate-200'}`}>
                                                            <div className="flex items-start gap-3">
                                                                {/* Icono estado legalización */}
                                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5
                                                                    ${legalizada ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                                                    <span className="text-sm">{legalizada ? '✅' : '⏳'}</span>
                                                                </div>

                                                                <div className="flex-1 min-w-0">
                                                                    {/* Número + badges */}
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                        {cfg && (
                                                                            <span className={`${cfg.bg} ${cfg.text} text-[7px] font-black px-1.5 py-0.5 rounded-full`}>
                                                                                {cfg.label}
                                                                            </span>
                                                                        )}
                                                                        {itemBadge && (
                                                                            <span className={`${itemBadge.bg} ${itemBadge.text} text-[7px] font-black px-1.5 py-0.5 rounded-full`}>
                                                                                {itemBadge.label}
                                                                            </span>
                                                                        )}
                                                                        {inv.es_devolucion && (
                                                                            <span className="bg-rose-100 text-rose-700 text-[7px] font-black px-1.5 py-0.5 rounded-full">🔄 Dev.</span>
                                                                        )}
                                                                    </div>
                                                                    {/* Cliente + ubicación */}
                                                                    {inv.customer_name && (
                                                                        <p className="text-[9px] text-slate-600 font-bold mt-0.5 truncate">{inv.customer_name}</p>
                                                                    )}
                                                                    {(inv.city || inv.address) && (
                                                                        <p className="text-[8px] text-slate-400 mt-0.5 truncate">
                                                                            📍 {[inv.city, inv.address].filter(Boolean).join(' — ')}
                                                                        </p>
                                                                    )}
                                                                    {/* Valor de factura */}
                                                                    {inv.invoice_value != null && inv.invoice_value > 0 && (
                                                                        <p className="text-[8px] font-black text-slate-500 mt-0.5">
                                                                            Valor: {fmtCOP(inv.invoice_value)} | {inv.un_code || '—'} | {inv.invoice_metodo_pago || '—'}
                                                                        </p>
                                                                    )}
                                                                    {/* Info de conciliación si ya está legalizada */}
                                                                    {legalizada && (
                                                                        <div className="mt-1.5 flex flex-wrap gap-2 text-[8px] text-slate-500">
                                                                            {inv.valor != null && inv.valor > 0 && (
                                                                                <span className="font-black text-emerald-700">{fmtCOP(inv.valor)}</span>
                                                                            )}
                                                                            {inv.banco && <span>🏦 {inv.banco}</span>}
                                                                            {inv.comprobante && <span>📋 {inv.comprobante}</span>}
                                                                            {inv.fecha_pago && <span>📅 {fmtDate(inv.fecha_pago)}</span>}
                                                                            {inv.conciliado_por_nombre && (
                                                                                <span className="text-slate-400">por {inv.conciliado_por_nombre}</span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Botón conciliar/editar/asignar */}
                                                                {!inv.route_vehicle_plate && !legalizada ? (
                                                                    <button onClick={() => setAssigningInvoice(inv)}
                                                                        className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[8px] font-black uppercase tracking-wide transition-all flex items-center gap-1.5">
                                                                        <Icons.Truck className="w-3 h-3" />
                                                                        Asignar
                                                                    </button>
                                                                ) : (
                                                                    <button onClick={() => setModalInvoice(inv)}
                                                                        className={`shrink-0 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all
                                                                            ${legalizada
                                                                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                                                : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                                                        {legalizada ? 'Detalle' : 'Legalizar'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal de conciliación individual */}
            {modalInvoice && selectedDoc && (
                <ConciliacionModal
                    isOpen={!!modalInvoice}
                    onClose={() => setModalInvoice(null)}
                    invoice={modalInvoice as any}
                    documentId={selectedDoc.id}
                    currentUserId={user?.id || ''}
                    vehiclePlate={selectedDoc.vehicle_plate}
                    conductorId={selectedDoc.conductor_id}
                    conductorName={selectedDoc.conductor_name}
                    onSaved={handleInvoiceSaved}
                    isReadOnly={!!modalInvoice.forma_pago && !REPICE_STATUS.includes((modalInvoice.item_status || '').toUpperCase())}
                />
            )}

            {/* Modal preview MasterSuite */}
            {showMsPreview && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white w-[95vw] max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50">
                            <div>
                                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">🏢 Vista previa — MasterSuite</h2>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                    {msPreviewData.length} facturas encontradas · Confirme para actualizar
                                </p>
                            </div>
                            <button onClick={() => { setShowMsPreview(false); setPendingMsFile(null); setMsPreviewData([]); }}
                                className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center">
                                <Icons.X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        {/* Tabla */}
                        <div className="flex-1 overflow-auto p-4 bg-slate-50">
                            <table className="w-full text-[10px] text-left border-collapse bg-white rounded-xl overflow-hidden shadow-sm">
                                <thead className="bg-slate-100 sticky top-0 font-black uppercase text-slate-600 border-b">
                                    <tr>
                                        {['Placa', 'Factura', 'Estado', 'Fecha Despacho', 'Fecha Entrega', 'Motivo Dev.'].map(h => (
                                            <th key={h} className="px-3 py-2.5 whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {msPreviewData.slice(0, 200).map((r, i) => (
                                        <tr key={i} className="hover:bg-violet-50/30 transition-colors">
                                            <td className="px-3 py-2 font-bold text-slate-700">{r.Placa}</td>
                                            <td className="px-3 py-2 font-black text-slate-900">{r.Factura}</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase
                                                    ${r.Estado?.toLowerCase().includes('entregado') ? 'bg-emerald-100 text-emerald-700'
                                                    : r.Estado?.toLowerCase().includes('devol') ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-slate-100 text-slate-600'}`}>
                                                    {r.Estado || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">{r.FechaDespacho || '—'}</td>
                                            <td className="px-3 py-2 text-slate-500">{r.FechaEntrega || '—'}</td>
                                            <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]">{r.MotivoDevol || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {msPreviewData.length > 200 && (
                                <p className="text-center text-[9px] text-slate-400 mt-2 font-bold">
                                    Mostrando 200 de {msPreviewData.length} registros
                                </p>
                            )}
                        </div>
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => { setShowMsPreview(false); setPendingMsFile(null); setMsPreviewData([]); }}
                                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                Cancelar
                            </button>
                            <button onClick={handleConfirmMasterSuite}
                                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
                                <Icons.Upload className="w-3.5 h-3.5" />
                                Confirmar importación
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dialog SOLO LECTURA — detalle de placa ────────────────────── */}
            {detailRoute && selectedDoc && (() => {
                const routeInvs = invoices.filter(i => (i.route_vehicle_plate || i.vehicle_plate) === detailRoute.plate);
                const fin = routeFinancials.get(detailRoute.plate) ?? {
                    valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto: 0,
                    efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                    repice_count: 0, valor_repice: 0, valor_grupal: 0, valor_total: 0, valor_credito: 0
                };
                const totalVal = fin.valor_total;
                const legalPct = detailRoute.invoice_count > 0
                    ? Math.round((fin.legalizadas / detailRoute.invoice_count) * 100)
                    : 0;
                return (
                    <div className="fixed inset-0 z-[700] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-emerald-50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow">
                                        <span className="text-lg">🚛</span>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detalle de placa — solo lectura</p>
                                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none">{detailRoute.plate}</h3>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">👤 {detailRoute.driver_name || 'Sin conductor'}</p>
                                    </div>
                                </div>
                                <button onClick={() => setDetailRoute(null)}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                                    <Icons.X className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>

                            {/* Resumen financiero */}
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
                                    <div className="bg-white border border-slate-100 rounded-xl px-2 py-2 text-center cursor-default">
                                        <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5 leading-none">Total documento</p>
                                        <p className="text-[11px] font-black text-slate-900 leading-none mt-1">{fmtCOP(totalVal)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center transition-all cursor-pointer ${activeDetailCard === 'leg' ? 'bg-emerald-600 text-white border-emerald-700 shadow-lg' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'leg' ? null : 'leg')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${activeDetailCard === 'leg' ? 'text-emerald-100' : 'text-emerald-600'}`}>Individual</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_legalizado)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center transition-all cursor-pointer ${activeDetailCard === 'leg' ? 'bg-violet-600 text-white border-violet-700 shadow-lg' : 'bg-violet-50 border-violet-100 hover:bg-violet-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'leg' ? null : 'leg')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${activeDetailCard === 'leg' ? 'text-violet-100' : 'text-violet-600'}`}>Grupal</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_grupal)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center transition-all cursor-pointer ${activeDetailCard === 'par' ? 'bg-orange-600 text-white border-orange-700 shadow-lg' : 'bg-orange-50 border-orange-100 hover:bg-orange-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'par' ? null : 'par')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${activeDetailCard === 'par' ? 'text-orange-100' : 'text-orange-600'}`}>Parcial</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_parcial)}</p>
                                    </div>
                                    <div className="bg-slate-800 text-white border border-slate-900 rounded-xl px-2 py-2 text-center cursor-default shadow-md">
                                        <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5 leading-none">Crédito</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_credito)}</p>
                                    </div>
                                    {(() => {
                                        const pending = fin.valor_total - (fin.valor_legalizado + fin.valor_grupal + fin.valor_devuelto + routeSurcharges.filter(s => s.plate === detailRoute.plate && (s.status_id === 'APROBADO' || s.status_id === 'EST-02')).reduce((s, r) => s + (Number(r.valor) || 0), 0));
                                        const isSurplus = pending < -1;
                                        return (
                                            <div className={`border rounded-xl px-2 py-2 text-center cursor-default shadow-md ${isSurplus ? 'bg-blue-600 border-blue-700 text-white' : 'bg-amber-500 border-amber-600 text-white'}`}>
                                                <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${isSurplus ? 'text-blue-100' : 'text-amber-100'}`}>
                                                    {isSurplus ? '💎 Sobrante' : '⏳ Pendiente'}
                                                </p>
                                                <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(Math.abs(pending))}</p>
                                            </div>
                                        );
                                    })()}
                                    <div className={`border rounded-xl px-2 py-2 text-center transition-all cursor-pointer ${activeDetailCard === 'dev' ? 'bg-amber-600 text-white border-amber-700 shadow-lg' : 'bg-amber-50 border-amber-100 hover:bg-amber-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'dev' ? null : 'dev')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${activeDetailCard === 'dev' ? 'text-amber-100' : 'text-amber-600'}`}>🔄 Devuelto</p>
                                        <p className="text-[11px] font-black mt-1 leading-none">{fmtCOP(fin.valor_devuelto)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center transition-all cursor-pointer ${activeDetailCard === 'sc' ? 'bg-emerald-600 text-white border-emerald-700 shadow-lg' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'sc' ? null : 'sc')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${activeDetailCard === 'sc' ? 'text-emerald-100' : 'text-emerald-600'}`}>✅ S.C Aprobado</p>
                                        <p className="text-[11px] font-black mt-1 leading-none">
                                            {fmtCOP(routeSurcharges.filter(s => s.plate === detailRoute.plate && (s.status_id === 'APROBADO' || s.status_id === 'EST-02')).reduce((s, r) => s + (Number(r.valor) || 0), 0))}
                                        </p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center transition-all cursor-pointer ${activeDetailCard === 'sc' ? 'bg-rose-600 text-white border-rose-700 shadow-lg' : 'bg-rose-50 border-rose-100 hover:bg-rose-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'sc' ? null : 'sc')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 leading-none ${activeDetailCard === 'sc' ? 'text-rose-100' : 'text-rose-600'}`}>⚠️ S.C Pendiente</p>
                                        <p className="text-[11px] font-black mt-1 leading-none">
                                            {fmtCOP(routeSurcharges.filter(s => s.plate === detailRoute.plate && (s.status_id === 'PENDIENTE' || s.status_id === 'EST-01' || !s.status_id)).reduce((s, r) => s + (Number(r.valor) || 0), 0))}
                                        </p>
                                    </div>
                                </div>

                                {/* Vista detallada al dar clic en Card */}
                                {activeDetailCard && (
                                    <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                                    Detalle: {activeDetailCard === 'leg' ? 'Legalizaciones' : activeDetailCard === 'dev' ? 'Devoluciones' : activeDetailCard === 'par' ? 'Parciales / Repice' : 'Sobrecostos'}
                                                </h4>
                                                <button onClick={() => setActiveDetailCard(null)} className="text-slate-400 hover:text-slate-600">
                                                    <Icons.X className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                                {activeDetailCard === 'leg' && (
                                                    <>
                                                        {/* Facturas legalizadas */}
                                                        {routeInvs.filter(i => i.forma_pago).map((inv, idx) => (
                                                            <div key={idx} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                    <p className="text-[8px] text-slate-500 font-bold uppercase">{inv.forma_pago} · {inv.comprobante || 'S/R'}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[11px] font-black text-emerald-600">{fmtCOP(inv.valor)}</p>
                                                                    <p className="text-[8px] text-slate-400">{inv.fecha_pago ? String(inv.fecha_pago).slice(0, 10) : '—'}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {/* Consignaciones grupales */}
                                                        {groupPayments.filter(p => p.plate === detailRoute.plate).map((p, idx) => (
                                                            <div key={`gp-${idx}`} className="flex items-center justify-between bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-emerald-900">Consignación Grupal</p>
                                                                    <p className="text-[8px] text-emerald-600 font-bold uppercase">{p.metodo_pago} · {p.referencia || 'S/R'}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[11px] font-black text-emerald-700">{fmtCOP(p.valor)}</p>
                                                                    <p className="text-[8px] text-emerald-400">{p.fecha ? String(p.fecha).slice(0, 10) : '—'}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                                {activeDetailCard === 'dev' && routeInvs.filter(i => i.es_devolucion || DEVUELTO_STATUS.includes((i.item_status || '').toUpperCase())).map((inv, idx) => (
                                                    <div key={idx} className="flex items-center justify-between bg-amber-50 p-2.5 rounded-xl border border-amber-100">
                                                        <div>
                                                            <p className="text-[10px] font-black text-amber-900">{inv.invoice_number}</p>
                                                            <p className="text-[8px] text-amber-600 font-bold uppercase">Devolución Total</p>
                                                        </div>
                                                        <p className="text-[11px] font-black text-amber-700">{fmtCOP(inv.invoice_value)}</p>
                                                    </div>
                                                ))}
                                                {activeDetailCard === 'par' && routeInvs.filter(i => PARCIAL_STATUS.includes((i.item_status || '').toUpperCase())).map((inv, idx) => (
                                                    <div key={idx} className="flex items-center justify-between bg-orange-50 p-2.5 rounded-xl border border-orange-100">
                                                        <div>
                                                            <p className="text-[10px] font-black text-orange-900">{inv.invoice_number}</p>
                                                            <p className="text-[8px] text-orange-600 font-bold uppercase">Entrega Parcial</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[11px] font-black text-orange-700">{fmtCOP(inv.valor)}</p>
                                                            <p className="text-[8px] text-orange-400">Orig: {fmtCOP(inv.invoice_value)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                                  {activeDetailCard === 'sc' && routeSurcharges.filter(s => s.plate === detailRoute.plate).map((s, idx) => {
                                                      const approved = s.status_id === 'APROBADO' || s.status_id === 'EST-02';
                                                      return (
                                                          <div key={idx} className={`p-2.5 rounded-xl border ${approved ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                                                              <div className="flex items-start justify-between gap-2">
                                                                  <div className="min-w-0">
                                                                      <p className={`text-[10px] font-black ${approved ? 'text-emerald-900' : 'text-rose-900'}`}>Surcharge / Gasto</p>
                                                                      <p className={`text-[8px] font-bold uppercase ${approved ? 'text-emerald-600' : 'text-rose-600'}`}>{s.referencia || 'S/R'} · {approved ? 'Aprobado' : 'Pendiente'}</p>
                                                                      {s.observaciones && <p className="text-[8px] text-slate-500 mt-0.5 italic">{s.observaciones}</p>}
                                                                      {s.facturas && <p className="text-[7px] font-bold text-slate-400 mt-0.5">Facturas: {s.facturas}</p>}
                                                                  </div>
                                                                  <div className="text-right shrink-0">
                                                                      <p className={`text-[11px] font-black ${approved ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtCOP(s.valor)}</p>
                                                                      <p className="text-[8px] text-slate-400">{s.fecha ? String(s.fecha).slice(0, 10) : '—'}</p>
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      );
                                                  })}
                                                {((activeDetailCard === 'leg' && routeInvs.filter(i => i.forma_pago).length === 0 && groupPayments.filter(p => p.plate === detailRoute.plate).length === 0) ||
                                                  (activeDetailCard === 'dev' && routeInvs.filter(i => i.es_devolucion || DEVUELTO_STATUS.includes((i.item_status || '').toUpperCase())).length === 0) ||
                                                  (activeDetailCard === 'par' && routeInvs.filter(i => PARCIAL_STATUS.includes((i.item_status || '').toUpperCase())).length === 0) ||
                                                  (activeDetailCard === 'sc' && routeSurcharges.filter(s => s.plate === detailRoute.plate).length === 0)) && (
                                                    <p className="text-center py-4 text-[9px] text-slate-400 font-bold uppercase tracking-widest">Sin movimientos registrados</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Tabla de facturas — solo lectura */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-[10px]">
                                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="text-left px-3 py-2.5 font-black text-slate-500 uppercase tracking-widest">Factura</th>
                                            <th className="text-left px-3 py-2.5 font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                                            <th className="text-center px-2 py-2.5 font-black text-slate-500 uppercase tracking-widest">Estado</th>
                                            <th className="text-center px-2 py-2.5 font-black text-slate-500 uppercase tracking-widest">Pago</th>
                                            <th className="text-center px-2 py-2.5 font-black text-slate-500 uppercase tracking-widest">Consig./Ref.</th>
                                            <th className="text-right px-2 py-2.5 font-black text-slate-500 uppercase tracking-widest">V. Original</th>
                                            <th className="text-right px-2 py-2.5 font-black text-slate-500 uppercase tracking-widest">V. Legalizado</th>
                                            <th className="text-right px-2 py-2.5 font-black text-slate-500 uppercase tracking-widest">V. Devol.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {routeInvs.map(inv => {
                                            const legalizada  = !!inv.forma_pago;
                                            const itemS       = (inv.item_status || '').toUpperCase();
                                            const isDevuelta  = inv.es_devolucion || DEVUELTO_STATUS.includes(itemS);
                                            const isParcial   = PARCIAL_STATUS.includes(itemS);
                                            const isRepice    = REPICE_STATUS.includes(itemS);
                                            const statusLabel = ENTREGADO_STATUS.includes(itemS)
                                                ? { label: 'Entregada', color: 'bg-teal-100 text-teal-700' }
                                                : isDevuelta ? { label: 'Devuelta', color: 'bg-amber-100 text-amber-700' }
                                                : isParcial  ? { label: 'Parcial',  color: 'bg-orange-100 text-orange-700' }
                                                : isRepice   ? { label: 'Repice',   color: 'bg-blue-100 text-blue-700' }
                                                : { label: 'Pendiente', color: 'bg-slate-100 text-slate-500' };
                                            const pagoLabel  = inv.forma_pago
                                                ? (FORMA_COLOR[inv.forma_pago]?.label || inv.forma_pago) : '—';
                                            const vOriginal  = Number(inv.invoice_value) || 0;
                                            const vLegal     = legalizada ? (Number(inv.valor) || 0) : 0;
                                            const vDevol = (() => {
                                                if (isDevuelta) return vOriginal;
                                                if (isParcial) {
                                                    // Priorizar valor de ítems devueltos
                                                    const totalQtyItems = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                                                    const unitPrice     = vOriginal / (totalQtyItems || 1);
                                                    const itemsDevVal   = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.returned_qty || 0) * unitPrice), 0) || 0;
                                                    
                                                    if (itemsDevVal > 0) return itemsDevVal;
                                                    if (inv.forma_pago) return Math.max(0, vOriginal - vLegal);
                                                }
                                                return 0;
                                            })();
                                            const sc         = Number(inv.sobrecosto) || 0;
                                            return (
                                                <tr key={inv.invoice_number} className={`hover:bg-slate-50/80 ${legalizada ? 'bg-emerald-50/20' : ''}`}>
                                                    <td className="px-3 py-2.5 font-black text-slate-900 whitespace-nowrap">{inv.invoice_number}</td>
                                                    <td className="px-3 py-2.5 text-slate-600 max-w-[140px] truncate">{inv.customer_name || '—'}</td>
                                                    <td className="px-2 py-2.5 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${statusLabel.color}`}>
                                                            {statusLabel.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-2.5 text-center text-slate-500 whitespace-nowrap">{pagoLabel}</td>
                                                    <td className="px-2 py-2.5 text-center font-bold text-slate-700">
                                                        {inv.comprobante ? (
                                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded-lg text-[9px] font-black">{inv.comprobante}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right text-slate-500">{vOriginal > 0 ? fmtCOP(vOriginal) : '—'}</td>
                                                    <td className="px-2 py-2.5 text-right font-black text-emerald-700">{vLegal > 0 ? fmtCOP(vLegal) : '—'}</td>
                                                    <td className="px-2 py-2.5 text-right font-black text-amber-700">{vDevol > 0 ? fmtCOP(vDevol) : '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {routeInvs.length === 0 && (
                                    <div className="text-center py-12">
                                        <p className="text-slate-400 text-xs font-bold">Sin facturas asignadas a esta placa</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                                <p className="text-[9px] text-slate-400 font-bold">{routeInvs.length} facturas · {detailRoute.invoice_count} en ruta</p>
                                <button onClick={() => setDetailRoute(null)}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal de conciliación por placa/ruta */}
            {modalRoute && selectedDoc && (
                <ConciliacionRouteModal
                    isOpen={!!modalRoute}
                    onClose={() => setModalRoute(null)}
                    route={modalRoute}
                    invoices={invoices.filter(inv =>
                        inv.route_vehicle_plate === modalRoute.plate
                    )}
                    documentId={selectedDoc.id}
                    currentUserId={user?.id || ''}
                    onSaved={() => {
                        if (selectedDoc) loadDocDetail(selectedDoc);
                        onRefresh();
                    }}
                    initialSurcharges={routeSurcharges.filter(s => s.plate === modalRoute.plate).map(s => ({
                        id: s.id,
                        valor: String(s.valor),
                        nroAprobacion: s.referencia,
                        fecha: s.fecha ? s.fecha.slice(0, 10) : '',
                        statusId: s.status_id,
                        observaciones: s.observaciones || '',
                        facturas: s.facturas || '',
                    }))}
                    initialGroupPayments={groupPayments
                        .filter(p => p.plate === modalRoute.plate)
                        .map(p => ({
                            id: String(p.id),
                            valor: String(p.valor || 0),
                            nroAprobacion: p.referencia || '',
                            fecha: p.fecha ? String(p.fecha).slice(0, 10) : '',
                            observacion: p.observacion || '',
                            metodo: p.metodo_pago || 'CONSIGNACION'
                        }))}
                    allRoutes={routes}
                />
            )}

            {/* Modal de asignación de factura a placa */}
            {/* Modal confirmación Cerrar Facturación */}
            {confirmClose && selectedDoc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                                <Icons.Lock className="w-5 h-5 text-amber-600" />
                            </div>
                            <h3 className="text-base font-black text-slate-900">Cerrar Facturación</h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                            ¿Está seguro de cerrar administrativamente las facturas{' '}
                            {confirmClose.plate
                                ? <><span className="font-black text-slate-900">de la placa {confirmClose.plate}</span></>
                                : <><span className="font-black text-slate-900">del documento {selectedDoc.external_doc_id}</span></>
                            }?
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-6">
                            ⚠️ Las facturas restantes se marcarán como conciliadas. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmClose(null)}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmClose}
                                disabled={closingCycle}
                                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow transition-all active:scale-95 flex items-center gap-2">
                                {closingCycle && <Icons.Loader className="w-3 h-3 animate-spin" />}
                                Confirmar Cierre
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {assigningInvoice && selectedDoc && (
                <AssignmentModal
                    isOpen={!!assigningInvoice}
                    onClose={() => setAssigningInvoice(null)}
                    invoice={assigningInvoice}
                    clientId={selectedDoc.client_id || ''}
                    vehicles={vehicles}
                    assignments={assignments}
                    userName={user?.name || 'Sistema'}
                    onAssigned={() => {
                        if (selectedDoc) loadDocDetail(selectedDoc);
                        onRefresh();
                    }}
                />
            )}
        </div>
    );
};

export default TabPendientes;
