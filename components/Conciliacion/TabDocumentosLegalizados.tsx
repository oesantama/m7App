import React, { useState, useCallback, useMemo } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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
    items?: any[];
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

const STATUS_NAMES: Record<string, string> = {
    'EST-10': 'Asignado',        'ASIGNADO': 'Asignado',
    'EST-11': 'En Ruta',         'EN_RUTA': 'En Ruta',
    'EST-12': 'Entregado',       'ENTREGADO': 'Entregado',
    'EST-13': 'Devuelto',        'DEVUELTO': 'Devuelto',
    'EST-14': 'Entrega Parcial', 'PARCIAL': 'Entrega Parcial',
    'EST-15': 'Repice',          'REPICE': 'Repice',
    'EST-16': 'Cancelado/Reasignado',
    'EST-17': 'Cancelado',
};
const getStatusName = (code?: string) => {
    if (!code) return '—';
    return STATUS_NAMES[code.toUpperCase()] || STATUS_NAMES[code] || code;
};

const fmtDateExcel = (d?: string | null) => {
    if (!d) return '—';
    return String(d).replace('T', ' ').slice(0, 16);
};

const Metric: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
    <div className={`flex flex-col items-center px-3 py-2 rounded-xl ${color}`}>
        <span className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-none mb-0.5">{label}</span>
        <span className="text-sm font-black leading-none">{value}</span>
    </div>
);

// ── Componente principal ──────────────────────────────────────────────────────

const TabDocumentosLegalizados: React.FC<{ user?: any }> = () => {
    const [searchId, setSearchId]             = useState('');
    const [loading, setLoading]               = useState(false);
    const [selectedDoc, setSelectedDoc]       = useState<DocSummary | null>(null);
    const [invoices, setInvoices]             = useState<InvoiceRow[]>([]);
    const [routes, setRoutes]                 = useState<RouteGroup[]>([]);
    const [routeSurcharges, setRouteSurcharges] = useState<any[]>([]);
    const [groupPayments, setGroupPayments]   = useState<any[]>([]);
    const [unassigned, setUnassigned]         = useState(0);
    const [loadingDetail, setLoadingDetail]   = useState(false);

    const [searchInvoice, setSearchInvoice]   = useState('');
    const [searchRoute, setSearchRoute]       = useState('');
    const [summaryFilter, setSummaryFilter]   = useState<string | null>(null);
    const [detailRoute, setDetailRoute]       = useState<RouteGroup | null>(null);
    const [activeDetailCard, setActiveDetailCard] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!searchId.trim()) return;
        setLoading(true);
        setSelectedDoc(null);
        setInvoices([]);
        setRoutes([]);
        setRouteSurcharges([]);
        setGroupPayments([]);
        setUnassigned(0);
        setSummaryFilter(null);
        try {
            const res = await api.getConciliationPending({ docId: searchId.trim() });
            if (res.data && res.data.length > 0) {
                const doc = res.data[0];
                setSelectedDoc(doc);
                loadDocDetail(doc);
            } else {
                toast.error('Documento no encontrado');
            }
        } catch {
            toast.error('Error buscando documento');
        } finally {
            setLoading(false);
        }
    };

    const loadDocDetail = async (doc: DocSummary) => {
        setLoadingDetail(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            setInvoices(res.invoices || []);
            setRoutes(res.routes   || []);
            setUnassigned(res.unassigned_invoices || 0);
            setRouteSurcharges(res.routeSurcharges || []);
            setGroupPayments(res.groupPayments || []);
        } catch {
            toast.error('Error cargando detalle');
        } finally {
            setLoadingDetail(false);
        }
    };

    // ── Financials por placa ──────────────────────────────────────────────────
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
            const metodo = (inv.forma_pago || '').toUpperCase();
            const metodoInv = (inv.invoice_metodo_pago || '').toUpperCase();
            const isEfectivo = metodoInv === 'EF' || metodoInv.includes('EFE') || metodoInv === 'CASH' || metodoInv === '';
            const status = (inv.item_status || '').toUpperCase();

            if (isEfectivo) cur.valor_total += invVal;
            else cur.valor_credito += invVal;

            if (inv.forma_pago) {
                cur.valor_legalizado += val;
                cur.legalizadas += 1;
                if (metodo === 'EFECTIVO' || metodo.includes('EFE')) cur.efectivo += val;
                else cur.credito += val;
            }

            if (REPICE_STATUS.includes(status)) { cur.repice_count += 1; cur.valor_repice += invVal; }

            const isDev = inv.es_devolucion || DEVUELTO_STATUS.includes(status);
            const isPar = PARCIAL_STATUS.includes(status);
            if (isEfectivo) {
                if (isDev) {
                    cur.valor_devuelto += invVal;
                } else if (isPar) {
                    const totalQtyItems = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                    const unitPrice     = invVal / (totalQtyItems || 1);
                    const itemsDevVal   = inv.items?.reduce((acc: number, it: any) => {
                        const v = (it.returned_value !== undefined && it.returned_value !== null)
                            ? Number(it.returned_value)
                            : (Number(it.returned_qty || 0) * unitPrice);
                        return acc + v;
                    }, 0) || 0;
                    if (itemsDevVal > 0) cur.valor_devuelto += itemsDevVal;
                    else if (inv.forma_pago) cur.valor_devuelto += Math.max(0, invVal - val);
                }
            }

            if (PARCIAL_STATUS.includes(status)) { cur.valor_parcial += val; cur.parciales += 1; }
            if (isDev) cur.devueltas += 1;
            if (ENTREGADO_STATUS.includes(status)) cur.completadas += 1;
            map.set(plate, cur);
        });

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

    // ── Métricas globales ─────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total       = invoices.length;
        const legalizadas = invoices.filter(i => !!i.forma_pago).length;
        const entregadas  = invoices.filter(i => ENTREGADO_STATUS.includes(i.item_status || '')).length;
        const devueltas   = invoices.filter(i => i.es_devolucion || DEVUELTO_STATUS.includes(i.item_status || '')).length;
        const parciales   = invoices.filter(i => PARCIAL_STATUS.includes(i.item_status || '')).length;

        const individualLeg = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);
        const grupalRows    = groupPayments.filter(p => !p.invoice || p.invoice.trim() === '');
        const totalGrupal   = grupalRows.reduce((s, p) => s + (Number(p.valor) || 0), 0);

        const efectivoInvoices = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '';
        });

        const approvedRows  = routeSurcharges.filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02');
        const approvedSurch = approvedRows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
        const pendingRows   = routeSurcharges.filter(s => s.status_id === 'PENDIENTE' || s.status_id === 'EST-01' || !s.status_id);
        const pendingSurch  = pendingRows.reduce((s, r) => s + (Number(r.valor) || 0), 0);

        const valorTotal    = efectivoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const valorDevuelto = efectivoInvoices.reduce((s, i) => {
            const status = (i.item_status || '').toUpperCase();
            const isDev  = i.es_devolucion || DEVUELTO_STATUS.includes(status);
            const isPar  = PARCIAL_STATUS.includes(status);
            if (isDev) return s + (Number(i.invoice_value) || 0);
            if (isPar) {
                const totalQtyItems = i.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                const unitPrice     = (Number(i.invoice_value) || 0) / (totalQtyItems || 1);
                const itemsDevVal   = i.items?.reduce((acc: number, it: any) => {
                    const v = (it.returned_value !== undefined && it.returned_value !== null)
                        ? Number(it.returned_value)
                        : (Number(it.returned_qty || 0) * unitPrice);
                    return acc + v;
                }, 0) || 0;
                if (itemsDevVal > 0) return s + itemsDevVal;
                if (i.forma_pago) return s + (Math.max(0, (Number(i.invoice_value) || 0) - (Number(i.valor) || 0)));
            }
            return s;
        }, 0);
        const valorParcial = efectivoInvoices.filter(i => PARCIAL_STATUS.includes((i.item_status || '').toUpperCase()))
            .reduce((s, i) => s + (Number(i.valor) || 0), 0);

        const creditoInvoices   = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return !(m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '');
        });
        const valorTotalCredito = creditoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);

        const pendiente = valorTotal - (individualLeg + totalGrupal + approvedSurch + valorDevuelto);

        return {
            total, legalizadas, entregadas, devueltas, parciales,
            valorTotal, valorTotalCredito,
            valorLegalizado: individualLeg,
            totalGrupal,
            totalLegalizado: individualLeg + totalGrupal + approvedSurch,
            valorDevuelto, valorParcial,
            approvedSurch, pendingSurch,
            assigned: total - unassigned,
            grupalCount: grupalRows.length,
            approvedSurchCount: approvedRows.length,
            pendingSurchCount: pendingRows.length,
            pendiente,
            isSurplus: pendiente < -1
        };
    }, [invoices, unassigned, groupPayments, routeSurcharges]);

    const isAllLegalized = stats.total > 0 && stats.legalizadas === stats.total;

    const filteredRoutes = useMemo(() => {
        if (!searchRoute.trim()) return routes;
        const q = searchRoute.toLowerCase();
        return routes.filter(r => r.plate?.toLowerCase().includes(q) || r.driver_name?.toLowerCase().includes(q));
    }, [routes, searchRoute]);

    const visibleInvoices = useMemo(() => {
        const unass = invoices.filter(inv => !inv.route_vehicle_plate);
        if (!searchInvoice.trim()) return unass;
        const q = searchInvoice.toLowerCase();
        return unass.filter(inv => inv.invoice_number?.toLowerCase().includes(q) || inv.customer_name?.toLowerCase().includes(q));
    }, [invoices, searchInvoice]);

    const planBadge = (planType: string) => {
        const isPlanR = planType?.toUpperCase().includes('PLAN R') || planType?.toUpperCase() === 'R';
        return (
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wide
                ${isPlanR ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {isPlanR ? 'Plan R' : 'Normal'}
            </span>
        );
    };

    // ── Export Excel ──────────────────────────────────────────────────────────
    const handleExportExcel = useCallback(() => {
        if (!selectedDoc) return;
        try {
            const wb = XLSX.utils.book_new();
            const docName = `HIST-L-${selectedDoc.external_doc_id}`;

            const mapInvoices = (list: any[]) => list.map(i => ({
                'FACTURA':         i.invoice_number,
                'CLIENTE':         i.customer_name || '—',
                'CIUDAD':          i.city || '—',
                'PLACA':           i.route_vehicle_plate || '—',
                'ESTADO':          getStatusName(i.item_status),
                'VALOR FACTURA':   i.invoice_value || 0,
                'VALOR RECAUDADO': i.valor || 0,
                'METODO':          i.forma_pago || '—',
                'COMPROBANTE':     i.comprobante || '—',
                'FECHA PAGO':      fmtDateExcel(i.fecha_pago),
            }));

            const totalDocumentoGlobal = Math.round(invoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0));
            const individualLeg = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);
            const grupalLeg = (groupPayments || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
            const sobrecostosLeg = (routeSurcharges || []).filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02').reduce((s, r) => s + (Number(r.valor) || 0), 0);
            const totalLegalizadoGlobal = Math.round(individualLeg + grupalLeg + sobrecostosLeg);

            const wsMain = XLSX.utils.aoa_to_sheet([
                [`REPORTE CONCILIACIÓN - ${selectedDoc.external_doc_id}`, '', '', '', 'TOTAL DOCUMENTO:', totalDocumentoGlobal],
                ['', '', '', '', 'TOTAL LEGALIZADO:', totalLegalizadoGlobal],
                []
            ]);
            if (wsMain['F1']) wsMain['F1'].z = '#,##0';
            if (wsMain['F2']) wsMain['F2'].z = '#,##0';
            if (groupPayments.length > 0) {
                XLSX.utils.sheet_add_aoa(wsMain, [['CONSIGNACIONES GRUPALES']], { origin: -1 });
                XLSX.utils.sheet_add_json(wsMain, groupPayments.map(g => ({
                    'PLACA': g.plate || '—', 'METODO': g.metodo_pago || '—',
                    'VALOR': Number(g.valor) || 0, 'REFERENCIA': g.referencia || '—',
                    'FECHA': g.fecha ? String(g.fecha).slice(0, 10) : '—',
                })), { origin: -1 });
                XLSX.utils.sheet_add_aoa(wsMain, [[]], { origin: -1 });
            }
            XLSX.utils.sheet_add_aoa(wsMain, [['DETALLE DE FACTURAS']], { origin: -1 });
            XLSX.utils.sheet_add_json(wsMain, mapInvoices(invoices), { origin: -1 });
            XLSX.utils.book_append_sheet(wb, wsMain, docName.slice(0, 30));

            const plates = Array.from(new Set(invoices.map(i => i.route_vehicle_plate).filter(Boolean)));
            plates.forEach(p => {
                if (!p) return;
                const plateInvs = invoices.filter(i => i.route_vehicle_plate === p);
                const plateGroup = groupPayments.filter(g => g.plate === p);
                const plateSur = routeSurcharges.filter(s => s.plate === p);

                const plateTotalDoc = Math.round(plateInvs.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0));
                const plateIndLeg = plateInvs.reduce((s, i) => s + (Number(i.valor) || 0), 0);
                const plateGrpLeg = plateGroup.reduce((s, g) => s + (Number(g.valor) || 0), 0);
                const plateSurLeg = plateSur.filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02').reduce((s, r) => s + (Number(r.valor) || 0), 0);
                const plateTotalLeg = Math.round(plateIndLeg + plateGrpLeg + plateSurLeg);

                const ws = XLSX.utils.aoa_to_sheet([
                    ['PLACA: ' + p, '', '', '', 'TOTAL DOCUMENTO:', plateTotalDoc],
                    ['', '', '', '', 'TOTAL LEGALIZADO:', plateTotalLeg],
                    []
                ]);
                if (ws['F1']) ws['F1'].z = '#,##0';
                if (ws['F2']) ws['F2'].z = '#,##0';
                if (plateGroup.length > 0) {
                    XLSX.utils.sheet_add_aoa(ws, [['CONSIGNACIONES GRUPALES']], { origin: -1 });
                    XLSX.utils.sheet_add_json(ws, plateGroup.map(g => ({
                        'METODO': g.metodo_pago || '—', 'VALOR': Number(g.valor) || 0,
                        'REFERENCIA': g.referencia || '—', 'FECHA': g.fecha ? String(g.fecha).slice(0, 10) : '—',
                    })), { origin: -1 });
                    XLSX.utils.sheet_add_aoa(ws, [[]], { origin: -1 });
                }
                XLSX.utils.sheet_add_aoa(ws, [['FACTURAS']], { origin: -1 });
                XLSX.utils.sheet_add_json(ws, mapInvoices(plateInvs), { origin: -1 });
                XLSX.utils.book_append_sheet(wb, ws, p.slice(0, 30));
            });

            XLSX.writeFile(wb, `${docName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success('Excel generado correctamente');
        } catch (err: any) { toast.error('Error al generar Excel: ' + err.message); }
    }, [selectedDoc, invoices, groupPayments, routeSurcharges]);

    const handleExportSobrecostos = useCallback(() => {
        if (!selectedDoc) return;
        try {
            const wb = XLSX.utils.book_new();
            const data = routeSurcharges.map(s => ({
                'DOCUMENTO':    selectedDoc.external_doc_id,
                'PLACA':        s.plate || '—',
                'VALOR':        Number(s.valor) || 0,
                'REFERENCIA':   s.referencia || '—',
                'FECHA':        fmtDateExcel(s.fecha),
                'ESTADO':       (s.status_id === 'APROBADO' || s.status_id === 'EST-02') ? 'Aprobado' : 'Pendiente',
                'OBSERVACIONES': s.observaciones || '—',
                'FACTURAS':     s.facturas || '—',
                'REGISTRADO':   fmtDateExcel(s.created_at),
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, 'Sobrecostos');
            XLSX.writeFile(wb, `SOBRECOSTOS-${selectedDoc.external_doc_id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success('Sobrecostos exportados correctamente');
        } catch (err: any) { toast.error('Error al exportar sobrecostos: ' + err.message); }
    }, [selectedDoc, routeSurcharges]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col flex-1 bg-slate-50 overflow-hidden">

            {/* Cabecera de búsqueda */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-3">
                <div className="flex-1 relative">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        value={searchId}
                        onChange={e => setSearchId(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="Ingrese Documento (ej: L010913671)"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                    />
                </div>
                <button
                    onClick={handleSearch}
                    disabled={loading || !searchId.trim()}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 shrink-0">
                    {loading ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Search className="w-4 h-4" />}
                    Consultar
                </button>
            </div>

            {!selectedDoc ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                        <Icons.Search className="w-10 h-10" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-sm font-black uppercase tracking-tight">Consulta Histórica</h3>
                        <p className="text-[10px] font-bold mt-1">Ingrese el ID del documento para ver su detalle de conciliación</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Encabezado del documento encontrado */}
                    <div className="bg-white border-b border-slate-200 px-5 py-3 flex-shrink-0">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                    {selectedDoc.external_doc_id}
                                </h3>
                                {selectedDoc.plan_type && planBadge(selectedDoc.plan_type)}
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase
                                    ${isAllLegalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {isAllLegalized ? '✅ Legalizado completo' : `${stats.total - stats.legalizadas} sin legalizar`}
                                </span>
                                {selectedDoc.delivery_date && (
                                    <span className="text-[9px] text-slate-400 font-bold">📅 {fmtDate(selectedDoc.delivery_date)}</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-1 rounded-lg bg-slate-100 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                                    🔒 Solo Lectura
                                </span>
                                <button
                                    onClick={handleExportExcel}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm">
                                    <Icons.Download className="w-3 h-3" />
                                    Exportar Excel
                                </button>
                                <button
                                    onClick={handleExportSobrecostos}
                                    disabled={routeSurcharges.length === 0}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-40">
                                    <Icons.Download className="w-3 h-3" />
                                    Exportar Sobrecostos
                                </button>
                            </div>
                        </div>
                    </div>

                    {loadingDetail ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Icons.Loader className="w-6 h-6 animate-spin text-emerald-500" />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar">

                            {/* Bloque de métricas */}
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

                                {/* Fila de conteos */}
                                <div className="flex flex-wrap items-center gap-3 mt-3">
                                    <div className="flex items-center gap-4 border-r border-slate-100 pr-4">
                                        <Metric label="Asignadas" value={stats.assigned} color="bg-blue-50 text-blue-700" />
                                        {unassigned > 0 && <Metric label="Sin Asignar" value={unassigned} color="bg-rose-50 text-rose-700" />}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Metric label="Entregadas" value={stats.entregadas}  color="bg-teal-50 text-teal-700" />
                                        <Metric label="Devueltas"  value={stats.devueltas}   color="bg-amber-100 text-amber-700" />
                                        <Metric label="Parciales"  value={stats.parciales}   color="bg-orange-100 text-orange-700" />
                                    </div>
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
                                {/* Vista filtrada por tarjeta */}
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
                                                      summaryFilter === 'parcial'    ? 'bg-amber-500' : 'bg-slate-800'}`}>
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
                                                if (summaryFilter === 'pendiente')  return !i.forma_pago && ((i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') || (i.invoice_metodo_pago || '').toUpperCase().trim() === '');
                                                if (summaryFilter === 'credito')    return !((i.invoice_metodo_pago || '').toUpperCase().trim() === 'EF' || (i.invoice_metodo_pago || '').toUpperCase().trim().includes('EFE') || (i.invoice_metodo_pago || '').toUpperCase().trim() === '');
                                                return true;
                                            }).map(inv => {
                                                const cfg = inv.forma_pago ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago }) : null;
                                                return (
                                                    <div key={inv.invoice_number} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase">🚛 {inv.route_vehicle_plate || 'S/A'}</span>
                                                                {cfg && <span className={`${cfg.bg} ${cfg.text} text-[7px] font-black px-1.5 py-0.5 rounded-full`}>{cfg.label}</span>}
                                                            </div>
                                                            <p className="text-[9px] text-slate-500 font-bold truncate max-w-[200px]">{inv.customer_name}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-black text-slate-900">{fmtCOP(inv.invoice_value)}</p>
                                                            {(inv.valor ?? 0) > 0 && <p className="text-[8px] font-black text-emerald-600">Leg: {fmtCOP(inv.valor)}</p>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Tarjetas de placas */}
                                {!summaryFilter && routes.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                Placas asignadas ({filteredRoutes.length}{searchRoute ? ` de ${routes.length}` : ''})
                                            </p>
                                        </div>
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
                                                const fin = routeFinancials.get(route.plate) ?? {
                                                    valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto_aprobado: 0,
                                                    efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                                                    repice_count: 0, valor_repice: 0, valor_grupal: 0, valor_total: 0, valor_credito: 0
                                                };
                                                const totalLegPlate = fin.valor_legalizado + fin.valor_grupal + fin.total_sobrecosto_aprobado;
                                                const pct = fin.valor_total > 0
                                                    ? Math.min(100, Math.round((totalLegPlate / fin.valor_total) * 100))
                                                    : (fin.legalizadas === route.invoice_count && route.invoice_count > 0 ? 100 : 0);

                                                return (
                                                    <div key={route.route_id} className="rounded-2xl border-2 border-slate-100 bg-white transition-all overflow-hidden hover:border-slate-200">
                                                        {/* Cabecera */}
                                                        <div className="px-4 py-3 bg-white">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-none">
                                                                        🚛 {route.plate || 'S/P'}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-500 font-bold mt-1">
                                                                        👤 {route.driver_name || 'Sin conductor asignado'}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <p className="text-xl font-black text-slate-900 leading-none">{route.invoice_count}</p>
                                                                    <p className="text-[8px] font-bold text-slate-400 uppercase">facturas</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Métricas */}
                                                        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                                                </div>
                                                                <span className="text-[8px] font-black text-emerald-700 shrink-0">{pct}% leg.</span>
                                                            </div>
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
                                                                        <p className="text-xs font-black text-blue-800">{fmtCOP(fin.valor_repice)}</p>
                                                                    </div>
                                                                )}
                                                            </div>
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

                                                        {/* Solo botón Ver detalle */}
                                                        <div className="px-4 pb-3 pt-2">
                                                            <button
                                                                onClick={() => setDetailRoute(route)}
                                                                className="w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                                                                Ver detalle →
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {unassigned > 0 && (
                                                <div className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-4 flex flex-col justify-center items-center text-center">
                                                    <p className="text-2xl mb-1">⚠️</p>
                                                    <p className="text-sm font-black text-rose-700 uppercase tracking-tight">Sin Ruta</p>
                                                    <p className="text-[9px] text-rose-500 font-bold mt-1">
                                                        {unassigned} factura{unassigned !== 1 ? 's' : ''} no asignada{unassigned !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Facturas sin asignar */}
                                {unassigned > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                ⚠️ Sin asignar ({visibleInvoices.length})
                                            </p>
                                        </div>
                                        <div className="relative mb-2">
                                            <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                            <input
                                                value={searchInvoice}
                                                onChange={e => setSearchInvoice(e.target.value)}
                                                placeholder="Buscar por factura o cliente…"
                                                className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            {visibleInvoices.map(inv => {
                                                const cfg = inv.forma_pago ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago }) : null;
                                                return (
                                                    <div key={inv.invoice_number} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                {cfg && <span className={`${cfg.bg} ${cfg.text} text-[7px] font-black px-1.5 py-0.5 rounded-full`}>{cfg.label}</span>}
                                                            </div>
                                                            <p className="text-[9px] text-slate-500 font-bold truncate max-w-[180px]">{inv.customer_name}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-[10px] font-black text-slate-900">{fmtCOP(inv.invoice_value)}</p>
                                                            {(inv.valor ?? 0) > 0 && <p className="text-[8px] font-black text-emerald-600">{fmtCOP(inv.valor)}</p>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Dialog solo lectura — detalle de placa */}
            {detailRoute && selectedDoc && (() => {
                const routeInvs = invoices.filter(i => (i.route_vehicle_plate || i.vehicle_plate) === detailRoute.plate);
                const fin = routeFinancials.get(detailRoute.plate) ?? {
                    valor_legalizado: 0, valor_devuelto: 0, valor_parcial: 0, total_sobrecosto_aprobado: 0,
                    efectivo: 0, credito: 0, completadas: 0, devueltas: 0, parciales: 0, legalizadas: 0,
                    repice_count: 0, valor_repice: 0, valor_grupal: 0, valor_total: 0, valor_credito: 0
                };
                const totalVal = fin.valor_total;
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
                                <button onClick={() => { setDetailRoute(null); setActiveDetailCard(null); }}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                                    <Icons.X className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>

                            {/* Resumen financiero */}
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
                                    <div className="bg-white border border-slate-100 rounded-xl px-2 py-2 text-center">
                                        <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Total doc.</p>
                                        <p className="text-[11px] font-black text-slate-900 leading-none mt-1">{fmtCOP(totalVal)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center cursor-pointer transition-all ${activeDetailCard === 'leg' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'leg' ? null : 'leg')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 ${activeDetailCard === 'leg' ? 'text-emerald-100' : 'text-emerald-600'}`}>Individual</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_legalizado)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center cursor-pointer transition-all ${activeDetailCard === 'leg' ? 'bg-violet-600 text-white border-violet-700' : 'bg-violet-50 border-violet-100 hover:bg-violet-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'leg' ? null : 'leg')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 ${activeDetailCard === 'leg' ? 'text-violet-100' : 'text-violet-600'}`}>Grupal</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_grupal)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center cursor-pointer transition-all ${activeDetailCard === 'par' ? 'bg-orange-600 text-white border-orange-700' : 'bg-orange-50 border-orange-100 hover:bg-orange-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'par' ? null : 'par')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 ${activeDetailCard === 'par' ? 'text-orange-100' : 'text-orange-600'}`}>Parcial</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_parcial)}</p>
                                    </div>
                                    <div className="bg-slate-800 text-white border border-slate-900 rounded-xl px-2 py-2 text-center">
                                        <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Crédito</p>
                                        <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(fin.valor_credito)}</p>
                                    </div>
                                    {(() => {
                                        const pending = fin.valor_total - (fin.valor_legalizado + fin.valor_grupal + fin.valor_devuelto + routeSurcharges.filter(s => s.plate === detailRoute.plate && (s.status_id === 'APROBADO' || s.status_id === 'EST-02')).reduce((s, r) => s + (Number(r.valor) || 0), 0));
                                        const isSurplus = pending < -1;
                                        return (
                                            <div className={`border rounded-xl px-2 py-2 text-center ${isSurplus ? 'bg-blue-600 border-blue-700 text-white' : 'bg-amber-500 border-amber-600 text-white'}`}>
                                                <p className={`text-[7px] font-black uppercase mb-0.5 ${isSurplus ? 'text-blue-100' : 'text-amber-100'}`}>
                                                    {isSurplus ? '💎 Sobrante' : '⏳ Pendiente'}
                                                </p>
                                                <p className="text-[11px] font-black leading-none mt-1">{fmtCOP(Math.abs(pending))}</p>
                                            </div>
                                        );
                                    })()}
                                    <div className={`border rounded-xl px-2 py-2 text-center cursor-pointer transition-all ${activeDetailCard === 'dev' ? 'bg-amber-600 text-white border-amber-700' : 'bg-amber-50 border-amber-100 hover:bg-amber-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'dev' ? null : 'dev')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 ${activeDetailCard === 'dev' ? 'text-amber-100' : 'text-amber-600'}`}>🔄 Devuelto</p>
                                        <p className="text-[11px] font-black mt-1 leading-none">{fmtCOP(fin.valor_devuelto)}</p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center cursor-pointer transition-all ${activeDetailCard === 'sc' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'sc' ? null : 'sc')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 ${activeDetailCard === 'sc' ? 'text-emerald-100' : 'text-emerald-600'}`}>✅ S.C Apr.</p>
                                        <p className="text-[11px] font-black mt-1 leading-none">
                                            {fmtCOP(routeSurcharges.filter(s => s.plate === detailRoute.plate && (s.status_id === 'APROBADO' || s.status_id === 'EST-02')).reduce((s, r) => s + (Number(r.valor) || 0), 0))}
                                        </p>
                                    </div>
                                    <div className={`border rounded-xl px-2 py-2 text-center cursor-pointer transition-all ${activeDetailCard === 'sc' ? 'bg-rose-600 text-white border-rose-700' : 'bg-rose-50 border-rose-100 hover:bg-rose-100'}`}
                                        onClick={() => setActiveDetailCard(activeDetailCard === 'sc' ? null : 'sc')}>
                                        <p className={`text-[7px] font-black uppercase mb-0.5 ${activeDetailCard === 'sc' ? 'text-rose-100' : 'text-rose-600'}`}>⚠️ S.C Pend.</p>
                                        <p className="text-[11px] font-black mt-1 leading-none">
                                            {fmtCOP(routeSurcharges.filter(s => s.plate === detailRoute.plate && (s.status_id === 'PENDIENTE' || s.status_id === 'EST-01' || !s.status_id)).reduce((s, r) => s + (Number(r.valor) || 0), 0))}
                                        </p>
                                    </div>
                                </div>

                                {activeDetailCard && (
                                    <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                                    Detalle: {activeDetailCard === 'leg' ? 'Legalizaciones' : activeDetailCard === 'dev' ? 'Devoluciones' : activeDetailCard === 'par' ? 'Parciales' : 'Sobrecostos'}
                                                </h4>
                                                <button onClick={() => setActiveDetailCard(null)} className="text-slate-400 hover:text-slate-600">
                                                    <Icons.X className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                                {activeDetailCard === 'leg' && (
                                                    <>
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

                            {/* Tabla de facturas */}
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
                                                : isDevuelta ? { label: 'Devuelta',  color: 'bg-amber-100 text-amber-700' }
                                                : isParcial  ? { label: 'Parcial',   color: 'bg-orange-100 text-orange-700' }
                                                : isRepice   ? { label: 'Repice',    color: 'bg-blue-100 text-blue-700' }
                                                : { label: 'Pendiente', color: 'bg-slate-100 text-slate-500' };
                                            const pagoLabel = inv.forma_pago ? (FORMA_COLOR[inv.forma_pago]?.label || inv.forma_pago) : '—';
                                            const vOriginal = Number(inv.invoice_value) || 0;
                                            const vLegal    = legalizada ? (Number(inv.valor) || 0) : 0;
                                            const vDevol    = (() => {
                                                if (isDevuelta) return vOriginal;
                                                if (isParcial) {
                                                    const totalQtyItems = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0) || 1;
                                                    const unitPrice     = vOriginal / (totalQtyItems || 1);
                                                    const itemsDevVal   = inv.items?.reduce((acc: number, it: any) => acc + (Number(it.returned_qty || 0) * unitPrice), 0) || 0;
                                                    if (itemsDevVal > 0) return itemsDevVal;
                                                    if (inv.forma_pago) return Math.max(0, vOriginal - vLegal);
                                                }
                                                return 0;
                                            })();
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
                                <button onClick={() => { setDetailRoute(null); setActiveDetailCard(null); }}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default TabDocumentosLegalizados;
