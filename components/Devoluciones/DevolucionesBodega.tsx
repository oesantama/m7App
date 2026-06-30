import React from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../services/api';
import { ReturnCard, RETURN_REASONS, ReturnReasonOption } from './ReturnCard';
import { Icons } from '../../constants';
import { DataTable } from '../shared/DataTable';
import { cleanSkuM7, extractQtyFromBarcode } from '../../utils/scanner';

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface Client { id: string; name: string; }
type Tab = 'recibir' | 'sin_registrar' | 'seguimiento' | 'historial';

interface ConcilPendingInvoice {
    invoice_id: string;
    customer_name?: string;
    codigo_cliente?: string;
    fecha_placa?: string;
    plan_type?: string;
    client_id?: string;
    vehicle_plate?: string;
    vehicle_id?: string;
    driver_id?: string;
    driver_name?: string;
    numero_planilla?: string;
    items: Array<{ article_id: string; article_name?: string; sku?: string; un_code?: string; unit?: string; quantity_returned: number }>;
}

interface TrackingReturn {
    id: number; invoice_id: string; return_type?: 'COMPLETA' | 'PARCIAL';
    return_reason?: string; notes?: string; status: string;
    fecha?: string; vehicle_plate?: string; driver_name?: string;
    client_id?: string; vendedor?: string; customer_name?: string;
    codigo_cliente?: string; order_number?: string; fecha_placa?: string;
    items: Array<{ sku?: string; article_id?: string; article_name?: string; quantity_returned: number; un_code?: string; unit?: string }>;
    conciliacion_confirmada_at?: string; conciliacion_confirmada_by?: string;
    pre_approval_at?: string; pre_approval_by?: string;
    pre_approved_at?: string; pre_approved_by?: string;
    supplier_exit_at?: string; supplier_exit_by?: string;
    completed_at?: string; completed_by?: string;
    excel_downloaded_at?: string;
    plan_type?: string; numero_planilla?: string;
}
interface InvoiceItem {
    article_id: string; article_name: string; barcode: string; sku: string;
    un_code: string; unit: string; expected_qty: number;
    qty_returned: number; remaining_qty: number;
    factor_inter: number; factor_std: number;
    uom_inter_name: string; uom_std_name: string;
}
interface InvoiceData {
    fromConciliacion?: boolean;
    invoice: {
        invoice_id: string; order_number: string; customer_name: string;
        client_ref: string; vehicle_plate: string; numero_planilla: string;
        fecha_placa: string; plan_type: string; client_id: string;
        conductor_name: string | null; assigned_plate: string | null; assigned_at: string | null;
        vehicle_id: string | null; driver_id: string | null;
    };
    returnStatus: 'none' | 'partial' | 'complete';
    previousReturns: Array<{
        return_id: number; return_reason: string; status: string;
        created_at: string; vendedor: string;
        items: Array<{ article_id: string; qty_returned: number }>;
    }>;
    items: InvoiceItem[];
}

// ─── ORDENAMIENTO GENÉRICO PARA TABLAS ────────────────────────────────────────
function sortByKey<T extends Record<string, any>>(rows: T[], key: string | null, dir: 'asc'|'desc'): T[] {
    if (!key) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
        let av = a[key]; let bv = b[key];
        if (av === null || av === undefined) av = '';
        if (bv === null || bv === undefined) bv = '';
        if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
        const ad = Date.parse(av); const bd = Date.parse(bv);
        if (!isNaN(ad) && !isNaN(bd) && isNaN(Number(av)) && isNaN(Number(bv))) {
            return dir === 'asc' ? ad - bd : bd - ad;
        }
        const as = String(av).trim().toLowerCase(); const bs = String(bv).trim().toLowerCase();
        if (as < bs) return dir === 'asc' ? -1 : 1;
        if (as > bs) return dir === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
}

interface SortThProps {
    label: string; sortKey: string;
    activeKey: string | null; dir: 'asc'|'desc';
    onSort: (key: string) => void;
    className?: string;
}
const SortTh: React.FC<SortThProps> = ({ label, sortKey, activeKey, dir, onSort, className }) => {
    const active = activeKey === sortKey;
    return (
        <th onClick={() => onSort(sortKey)}
            className={`px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:bg-slate-100/70 transition-colors ${className || ''}`}>
            <span className="inline-flex items-center gap-1">
                {label}
                {active
                    ? (dir === 'asc' ? <Icons.ChevronUp className="w-3 h-3 text-indigo-600" /> : <Icons.ChevronDown className="w-3 h-3 text-indigo-600" />)
                    : <Icons.ChevronDown className="w-3 h-3 text-slate-300" />}
            </span>
        </th>
    );
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
const DevolucionesBodega: React.FC<{ user: any }> = ({ user }) => {
    const [tab, setTab]   = React.useState<Tab>('recibir');
    const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);

    // Client selector
    const [clients, setClients]                   = React.useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = React.useState('');
    const [clientsReady, setClientsReady]         = React.useState(false);

    // ── Tab: Seguimiento ──────────────────────────────────────────────────────
    const [trackingReturns, setTrackingReturns]   = React.useState<TrackingReturn[]>([]);
    const [trackingLoading, setTrackingLoading]   = React.useState(false);
    const [selectedExcelIds, setSelectedExcelIds] = React.useState<Set<number>>(new Set());
    const [advancingId, setAdvancingId]           = React.useState<number | null>(null);
    const [visibleStatuses, setVisibleStatuses]   = React.useState<Set<string>>(
        new Set(['PENDING','CONFIRMED','PRE_APPROVAL','PRE_APPROVED','SUPPLIER_EXIT'])
    );
    const [seguimientoSearch, setSeguimientoSearch]   = React.useState('');
    const [seguimientoSortKey, setSeguimientoSortKey] = React.useState<string | null>(null);
    const [seguimientoSortDir, setSeguimientoSortDir] = React.useState<'asc'|'desc'>('asc');
    const [expandedTrackingIds, setExpandedTrackingIds] = React.useState<Set<number>>(new Set());

    // ── Tab: Sin registrar (desde conciliación) ───────────────────────────────
    const [concilPending, setConcilPending]       = React.useState<ConcilPendingInvoice[]>([]);
    const [concilLoading, setConcilLoading]       = React.useState(false);
    const [selectedConcilIds, setSelectedConcilIds] = React.useState<Set<string>>(new Set());
    const [importingConcil, setImportingConcil]   = React.useState(false);
    const [concilExtras, setConcilExtras]         = React.useState<Record<string,{vendedor:string; return_reason:string; return_type:'COMPLETA'|'PARCIAL'}>>({});
    const [concilOtroMode, setConcilOtroMode]     = React.useState<Set<string>>(new Set());
    const [concilSearch, setConcilSearch]         = React.useState('');
    const [concilSortKey, setConcilSortKey]       = React.useState<string | null>(null);
    const [concilSortDir, setConcilSortDir]       = React.useState<'asc'|'desc'>('asc');
    const [concilOtroText, setConcilOtroText]     = React.useState<Record<string,string>>({});

    const setConcilExtra = (invoiceId: string, field: string, value: string) =>
        setConcilExtras(prev => ({ ...prev, [invoiceId]: { vendedor:'', return_reason:'', return_type:'COMPLETA', ...prev[invoiceId], [field]: value } }));

    const confirmConcilOtro = async (invoiceId: string) => {
        const text = (concilOtroText[invoiceId] || '').trim();
        if (!text) return;
        try {
            const res = await api.createReturnReason(text);
            if (res?.data) {
                setReasonOptions(prev => prev.some(r => r.id === res.data.id) ? prev : [...prev, res.data]);
            }
        } catch { /* si falla igual registramos el texto */ }
        setConcilExtra(invoiceId, 'return_reason', text);
        setConcilOtroMode(prev => { const n = new Set(prev); n.delete(invoiceId); return n; });
    };

    // ── Tab: Recibir devolución ───────────────────────────────────────────────
    const [invoiceSearch, setInvoiceSearch]         = React.useState('');
    const [searchingInvoice, setSearchingInvoice]   = React.useState(false);
    const [invoiceData, setInvoiceData]             = React.useState<InvoiceData | null>(null);
    const [vendedor, setVendedor]                   = React.useState('');
    const [returnType, setReturnType]               = React.useState<'COMPLETA' | 'PARCIAL'>('COMPLETA');
    const [returnReason, setReturnReason]           = React.useState('');
    const [returnNotes, setReturnNotes]             = React.useState('');
    const [reasonOptions, setReasonOptions]         = React.useState<ReturnReasonOption[]>([]);
    const [showOtroInput, setShowOtroInput]         = React.useState(false);
    const [otroText, setOtroText]                   = React.useState('');
    const [scannedQtys, setScannedQtys]             = React.useState<Record<string, number>>({});
    const [pickingModes, setPickingModes]           = React.useState<Record<string, 'UND' | 'CAJA' | 'STD'>>({});
    const [lastScanned, setLastScanned]             = React.useState<string | null>(null);
    const [savingReturn, setSavingReturn]           = React.useState(false);
    const [barcodeRaw, setBarcodeRaw]               = React.useState('');
    const barcodeRef = React.useRef<HTMLInputElement>(null);

    // ── Tab: Historial ────────────────────────────────────────────────────────
    const [history, setHistory]         = React.useState<any[]>([]);
    const [histLoading, setHistLoading] = React.useState(false);
    const [histFrom, setHistFrom]       = React.useState('');
    const [histTo, setHistTo]           = React.useState('');

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Clientes ──────────────────────────────────────────────────────────────
    React.useEffect(() => {
        api.getReturnReasons().then((r: any) => {
            if (r?.data) setReasonOptions(r.data);
        }).catch(() => {});
    }, []);

    React.useEffect(() => {
        const allowedIds: string[] = user?.clientIds?.length
            ? user.clientIds : user?.clientId ? [user.clientId] : [];
        api.getClients().then((all: any[]) => {
            const isAdmin = allowedIds.length === 1 && allowedIds[0] === 'CLI-01';
            const filtered = isAdmin ? all : all.filter((c: any) => allowedIds.includes(c.id));
            const mapped: Client[] = filtered.map((c: any) => ({ id: c.id, name: c.name || c.id }));
            setClients(mapped);
            if (mapped.length === 1) setSelectedClientId(mapped[0].id);
            setClientsReady(true);
        }).catch(() => setClientsReady(true));
    }, [user]);

    // ── Carga inicial al cambiar cliente ──────────────────────────────────────
    const loadAll = React.useCallback(async (clientId: string) => {
        if (!clientId) return;
        setTrackingLoading(true);
        try {
            const res = await api.getReturnsTracking(clientId).catch(() => ({ data: [] }));
            setTrackingReturns(Array.isArray(res) ? res : (res?.data ?? []));
        } finally { setTrackingLoading(false); }
    }, []);

    React.useEffect(() => {
        if (selectedClientId) {
            setTrackingReturns([]);
            setSelectedExcelIds(new Set());
            loadAll(selectedClientId);
        }
    }, [selectedClientId, loadAll]);

    const loadConcilPending = React.useCallback(async (clientId: string) => {
        if (!clientId) return;
        setConcilLoading(true);
        try {
            const res = await api.getConciliacionPending(clientId).catch(() => ({ data: [] }));
            setConcilPending(Array.isArray(res) ? res : (res?.data ?? []));
        } finally { setConcilLoading(false); }
    }, []);

    React.useEffect(() => {
        if (tab === 'sin_registrar' && selectedClientId) loadConcilPending(selectedClientId);
    }, [tab, selectedClientId, loadConcilPending]);

    const handleImportConcil = async () => {
        if (selectedConcilIds.size === 0) return;
        const toImport = concilPending.filter(i => selectedConcilIds.has(i.invoice_id));
        // Validar campos obligatorios
        const missing = toImport.filter(i => !concilExtras[i.invoice_id]?.vendedor?.trim() || !concilExtras[i.invoice_id]?.return_reason);
        if (missing.length > 0) {
            showToast(`Complete Vendedor y Motivo en: ${missing.map(i => i.invoice_id).join(', ')}`, false);
            return;
        }
        setImportingConcil(true);
        try {
            const payload = toImport.map(i => ({
                ...i,
                vendedor:      concilExtras[i.invoice_id]?.vendedor ?? '',
                return_reason: concilExtras[i.invoice_id]?.return_reason ?? '',
                return_type:   concilExtras[i.invoice_id]?.return_type ?? 'COMPLETA',
            }));
            const res = await api.importFromConciliacion(payload, user?.name || user?.email || 'BODEGA');
            if (!res?.success) throw new Error(res?.error ?? 'Error al importar');
            showToast(`✅ ${res.created} devolucion(es) registradas en seguimiento`);
            setSelectedConcilIds(new Set());
            await Promise.all([
                loadConcilPending(selectedClientId),
                loadAll(selectedClientId),
            ]);
            setTab('seguimiento');
        } catch (e: any) {
            showToast(e.message ?? 'Error al importar', false);
        } finally { setImportingConcil(false); }
    };

    // ── Historial ─────────────────────────────────────────────────────────────
    const loadHistory = React.useCallback(async () => {
        setHistLoading(true);
        try {
            const res = await api.getBodegaReturnsHistory({
                clientId: selectedClientId || undefined,
                dateFrom: histFrom || undefined,
                dateTo:   histTo   || undefined,
            });
            setHistory(res?.data ?? []);
        } catch { showToast('Error cargando historial', false); }
        finally { setHistLoading(false); }
    }, [selectedClientId, histFrom, histTo]);

    // historial se carga solo cuando el usuario hace clic en "Aplicar" con ambas fechas

    // ── Buscar factura para recibir ───────────────────────────────────────────
    const handleSearchInvoice = async () => {
        const inv = invoiceSearch.trim();
        if (!inv) return;
        setSearchingInvoice(true);
        setInvoiceData(null);
        setScannedQtys({}); setPickingModes({}); setLastScanned(null);
        setVendedor(''); setReturnType('COMPLETA'); setReturnReason(''); setReturnNotes('');
        try {
            const res = await api.getInvoiceReturnData(inv);
            if (!res?.success) throw new Error(res?.error ?? 'No encontrada');
            setInvoiceData(res);
            // inicializar cantidades: COMPLETA pone remaining_qty (lo que falta), PARCIAL en 0
            const init: Record<string, number> = {};
            res.items.forEach((it: InvoiceItem) => { init[it.article_id] = it.remaining_qty; });
            setScannedQtys(init);
            setTimeout(() => barcodeRef.current?.focus(), 100);
        } catch (e: any) {
            showToast(e.message ?? 'Factura no encontrada', false);
        } finally { setSearchingInvoice(false); }
    };

    // Cuando cambia a PARCIAL: resetear cantidades a 0
    const handleChangeReturnType = (rt: 'COMPLETA' | 'PARCIAL') => {
        setReturnType(rt);
        if (rt === 'COMPLETA' && invoiceData) {
            const init: Record<string, number> = {};
            // COMPLETA: pre-llenar con lo que RESTA por devolver (remaining_qty)
            invoiceData.items.forEach(it => { init[it.article_id] = it.remaining_qty; });
            setScannedQtys(init);
        } else if (rt === 'PARCIAL') {
            const init: Record<string, number> = {};
            invoiceData?.items.forEach(it => { init[it.article_id] = 0; });
            setScannedQtys(init ?? {});
        }
    };

    // ── Scanner de código de barras ───────────────────────────────────────────
    const handleBarcodeScan = (raw: string) => {
        if (!invoiceData || returnType !== 'PARCIAL') return;
        const sku = cleanSkuM7(raw);
        const item = invoiceData.items.find(it =>
            it.sku.toUpperCase() === sku.toUpperCase() ||
            it.article_id.toUpperCase() === sku.toUpperCase() ||
            it.barcode.toUpperCase() === sku.toUpperCase()
        ) ?? invoiceData.items.find(it =>
            it.sku.toUpperCase() === sku.replaceAll("'", '-').toUpperCase() ||
            it.sku.toUpperCase() === sku.replaceAll('-', "'").toUpperCase()
        );
        if (!item) { showToast(`SKU no encontrado: ${sku}`, false); return; }

        const max = item.remaining_qty;  // máximo = lo que falta por devolver
        const current = scannedQtys[item.article_id] ?? 0;

        // Ya llegó al máximo — no se puede agregar más
        if (current >= max) {
            showToast(`⚠ ${item.article_name}: límite máximo alcanzado (${max} ${item.unit})`, false);
            setLastScanned(item.article_id);
            return;
        }

        const embeddedQty = extractQtyFromBarcode(raw);
        const mode = pickingModes[item.article_id] ?? 'UND';
        let qty = embeddedQty;
        if (mode === 'CAJA') qty = (item.factor_inter || 1) * embeddedQty;
        else if (mode === 'STD') qty = (item.factor_std || 1) * embeddedQty;

        const desired = current + qty;
        const next = Math.min(desired, max);

        setScannedQtys(prev => ({ ...prev, [item.article_id]: next }));
        setLastScanned(item.article_id);

        if (desired > max) {
            // Superó el límite — se ajustó al máximo
            showToast(`⚠ ${item.article_name}: ajustado a ${next}/${max} ${item.unit} (excedía el límite)`, false);
        } else if (next >= max) {
            // Completado exacto
            showToast(`✓ ${item.article_name}: COMPLETO ${next}/${max} ${item.unit}`);
        } else {
            // Adición normal
            showToast(`${item.article_name}: ${next}/${max} ${item.unit}`);
        }
    };

    const handleManualAdd = (articleId: string, qty: number) => {
        if (!invoiceData) return;
        const item = invoiceData.items.find(it => it.article_id === articleId);
        if (!item) return;
        const max = item.remaining_qty;
        const current = scannedQtys[articleId] ?? 0;

        if (current >= max) {
            showToast(`⚠ ${item.article_name}: límite máximo alcanzado (${max})`, false);
            setLastScanned(articleId);
            return;
        }

        const desired = current + qty;
        const next = Math.min(desired, max);
        setScannedQtys(prev => ({ ...prev, [articleId]: next }));
        setLastScanned(articleId);

        if (desired > max) {
            showToast(`⚠ ${item.article_name}: ajustado a ${next}/${max} (excedía el límite)`, false);
        } else if (next >= max) {
            showToast(`✓ ${item.article_name}: COMPLETO ${next}/${max}`);
        }
    };

    const handleManualSet = (articleId: string, val: string) => {
        const n = parseInt(val) || 0;
        const item = invoiceData?.items.find(it => it.article_id === articleId);
        const max = item?.remaining_qty ?? 9999;
        const clamped = Math.max(0, Math.min(n, max));
        setScannedQtys(prev => ({ ...prev, [articleId]: clamped }));
        if (n > max) showToast(`⚠ Cantidad ajustada al máximo permitido: ${max}`, false);
    };

    // ── Guardar devolución ────────────────────────────────────────────────────
    const handleSaveReturn = async () => {
        if (!invoiceData) return;
        if (!vendedor.trim()) { showToast('El vendedor es obligatorio', false); return; }
        if (!returnReason) { showToast('Seleccione el motivo de devolución', false); return; }

        const items = invoiceData.items
            .filter(it => (scannedQtys[it.article_id] ?? 0) > 0)
            .map(it => ({
                article_id:   it.article_id,
                sku:          it.sku,
                un_code:      it.un_code,
                article_name: it.article_name,
                return_qty:   scannedQtys[it.article_id] ?? 0,
                expected_qty: it.expected_qty,
                unit:         it.unit,
            }));

        if (items.length === 0) { showToast('Ingrese al menos un artículo con cantidad', false); return; }

        setSavingReturn(true);
        try {
            await api.registerRouteReturn({
                invoiceId:       invoiceData.invoice.invoice_id,
                vehiclePlate:    invoiceData.invoice.assigned_plate || invoiceData.invoice.vehicle_plate || undefined,
                vehicleId:       invoiceData.invoice.vehicle_id   || undefined,
                driverId:        invoiceData.invoice.driver_id    || undefined,
                returnType,
                returnReason,
                notes:           returnNotes,
                items,
                createdBy:       user?.id,
                vendedor:        vendedor.trim(),
                numeroPlanilla:  invoiceData.invoice.numero_planilla || undefined,
                fechaPlaca:      invoiceData.invoice.fecha_placa || undefined,
            });
            showToast(`Devolución de ${invoiceData.invoice.invoice_id} registrada`);
            // Reset
            setInvoiceData(null); setInvoiceSearch(''); setVendedor('');
            setReturnType('COMPLETA'); setReturnReason(''); setReturnNotes('');
            setShowOtroInput(false); setOtroText('');
            setScannedQtys({}); setPickingModes({}); setLastScanned(null);
            loadAll(selectedClientId);
        } catch (e: any) { showToast(e?.message ?? 'Error al guardar', false); }
        finally { setSavingReturn(false); }
    };

    // ── Seguimiento: construir filas Excel ───────────────────────────────────
    const buildExcelRows = (returns: TrackingReturn[]) =>
        returns.flatMap(r =>
            r.items.length > 0
                ? r.items.map(it => ({
                    FECHA:               r.fecha ?? '',
                    CLIENTE:             r.customer_name ?? '',
                    'CODIGO CLIENTE':    r.codigo_cliente ?? '',
                    VENDEDOR:            r.vendedor ?? '',
                    'FECHA Y PLACA':     `${r.fecha_placa ?? ''} ${r.vehicle_plate ?? ''}`.trim(),
                    'NUMERO PLANILLA':   r.numero_planilla ?? '',
                    REMISION:            r.invoice_id,
                    PEDIDO:              r.order_number ?? '',
                    REFERENCIA:          it.article_id ?? it.sku ?? '',
                    UM:                  it.unit ?? '',
                    CANTIDAD:            Number(it.quantity_returned ?? 0),
                    'MOTIVO DEVOLUCION': r.return_reason ?? '',
                    'UNIDAD NEGOCIO':    it.un_code ?? '',
                }))
                : [{
                    FECHA:               r.fecha ?? '',
                    CLIENTE:             r.customer_name ?? '',
                    'CODIGO CLIENTE':    r.codigo_cliente ?? '',
                    VENDEDOR:            r.vendedor ?? '',
                    'FECHA Y PLACA':     `${r.fecha_placa ?? ''} ${r.vehicle_plate ?? ''}`.trim(),
                    'NUMERO PLANILLA':   r.numero_planilla ?? '',
                    REMISION:            r.invoice_id,
                    PEDIDO:              r.order_number ?? '',
                    REFERENCIA:          '', UM: '', CANTIDAD: 0,
                    'MOTIVO DEVOLUCION': r.return_reason ?? '',
                    'UNIDAD NEGOCIO':    '',
                }]
        );

    const writeExcel = (returns: TrackingReturn[], suffix = '') => {
        const title = `DEVOLUCIONES PLAN ${returns[0]?.plan_type ?? ''} ${new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' }).toUpperCase()}`;
        const rows  = buildExcelRows(returns);
        const wb    = XLSX.utils.book_new();
        const GREEN = 'FFD9EAD3';

        const styleCell = (ws: XLSX.WorkSheet, addr: string, s: any) => {
            if (!ws[addr]) ws[addr] = { t: 's', v: ws[addr]?.v ?? '' };
            ws[addr].s = s;
        };

        // ── Hoja 1: Codigo General ───────────────────────────────────────────
        const skuMap = new Map<string, { articulo: string; unidad: string; cantidad: number }>();
        returns.forEach(r => r.items.forEach(it => {
            const key = it.article_id ?? it.sku ?? '';
            if (!key) return;
            const prev = skuMap.get(key) ?? { articulo: it.article_name ?? '', unidad: it.unit ?? '', cantidad: 0 };
            skuMap.set(key, { articulo: prev.articulo || (it.article_name ?? ''), unidad: prev.unidad || (it.unit ?? ''), cantidad: prev.cantidad + Number(it.quantity_returned ?? 0) });
        }));
        const generalRows = Array.from(skuMap.entries()).map(([ref, v]) => ({
            REFERENCIA: ref, ARTICULO: v.articulo, UM: v.unidad, 'CANTIDAD TOTAL': v.cantidad,
        }));
        const wsGen = XLSX.utils.json_to_sheet(generalRows);
        wsGen['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 8 }, { wch: 14 }];
        ['A1','B1','C1','D1'].forEach(a => styleCell(wsGen, a, {
            font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: GREEN } }, alignment: { horizontal: 'center' },
        }));
        XLSX.utils.book_append_sheet(wb, wsGen, 'Codigo General');

        // ── Hoja 2: Devoluciones ─────────────────────────────────────────────
        const COLS = ['FECHA','CLIENTE','CODIGO CLIENTE','VENDEDOR','FECHA Y PLACA','NUMERO PLANILLA','REMISION','PEDIDO','REFERENCIA','UM','CANTIDAD','MOTIVO DEVOLUCION','UNIDAD NEGOCIO'];
        const WIDTHS = [12,32,14,10,16,18,14,14,16,6,10,30,14];

        // Construir hoja: fila 1 = título, fila 2 = cabeceras, fila 3+ = datos
        const wsDevData = [
            [title, ...Array(COLS.length - 1).fill('')],
            COLS,
            ...rows.map(r => COLS.map(c => (r as any)[c] ?? '')),
        ];
        const wsDev = XLSX.utils.aoa_to_sheet(wsDevData);
        wsDev['!cols'] = WIDTHS.map(w => ({ wch: w }));
        // Merge título A1:M1
        wsDev['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLS.length - 1 } }];
        // Estilo título
        styleCell(wsDev, 'A1', {
            font: { bold: true, sz: 13 },
            fill: { patternType: 'solid', fgColor: { rgb: GREEN } },
            alignment: { horizontal: 'center', vertical: 'center' },
        });
        // Estilo cabeceras fila 2
        COLS.forEach((_, i) => {
            const addr = XLSX.utils.encode_cell({ r: 1, c: i });
            styleCell(wsDev, addr, {
                font: { bold: true },
                fill: { patternType: 'solid', fgColor: { rgb: GREEN } },
                alignment: { horizontal: 'center' },
            });
        });
        XLSX.utils.book_append_sheet(wb, wsDev, 'Devoluciones');

        XLSX.writeFile(wb, `DEVOLUCIONES_${(returns[0]?.plan_type ?? 'PLAN').replace(/\s+/g,'_')}_${suffix || new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true });
    };

    // ── Exportar Excel sin cambio de estado (todos los bloques) ──────────────
    const handleExportExcel = (returns: TrackingReturn[]) => {
        writeExcel(returns);
        showToast(`Excel exportado — ${returns.length} devolución(es)`);
    };

    // ── Descargar Excel pre-aprobación (sin avanzar estado) ──────────────────
    const handleDownloadExcel = (returns: TrackingReturn[]) => {
        writeExcel(returns, `PREAPROBACION_${new Date().toISOString().slice(0, 10)}`);
        showToast(`Excel descargado — ${returns.length} devolución(es)`);
    };

    // ── Avanzar CONFIRMED → PRE_APPROVAL y registrar descarga del excel ───────
    const handleSendPreApproval = async (returns: TrackingReturn[]) => {
        const userName = user?.name ?? user?.email ?? 'USUARIO';
        setAdvancingId(-1);
        try {
            for (const r of returns) {
                await api.markExcelDownloaded(r.id);
                await api.advanceReturnState(r.id, 'PRE_APPROVAL', userName);
            }
            setSelectedExcelIds(new Set());
            showToast(`${returns.length} devolución(es) enviadas a Pre-Aprobación`);
            loadAll(selectedClientId);
        } catch (e: any) { showToast(e?.message ?? 'Error al avanzar estado', false); }
        finally { setAdvancingId(null); }
    };

    // ── Seguimiento: avanzar estados en lote ─────────────────────────────────
    const handleAdvanceBatch = async (ids: number[], newStatus: string, msg: string) => {
        const userName = user?.name ?? user?.email ?? 'USUARIO';
        setAdvancingId(-1);
        try {
            await Promise.all(ids.map(id => api.advanceReturnState(id, newStatus, userName)));
            showToast(`${msg} (${ids.length})`);
            setTrackingReturns(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: newStatus } : r));
            setSelectedExcelIds(new Set());
        } catch (e: any) { showToast(e?.message ?? 'Error al avanzar estado', false); }
        finally { setAdvancingId(null); }
    };

    // ── Totales para badge ─────────────────────────────────────────────────────
    const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';
    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'recibir',       label: 'Recibir Devolución' },
        { id: 'sin_registrar', label: 'Sin Registrar', count: concilPending.length },
        { id: 'seguimiento',   label: 'Seguimiento',   count: trackingReturns.length },
        { id: 'historial',     label: 'Historial' },
    ];

    // ── Columnas Excel historial ───────────────────────────────────────────────
    const fmtDate = (v: string | null | undefined) => {
        if (!v) return '—';
        const d = new Date(v);
        const p = (n: number) => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };

    const historyColumns = [
        { header: 'FECHA',            key: 'fecha' },
        { header: 'CLIENTE',          key: 'customer_name' },
        { header: 'CODIGO CLIENTE',   key: 'codigo_cliente' },
        { header: 'COD. VENDEDOR',    key: 'vendedor' },
        { header: 'FECHA Y PLACA',    key: 'fecha_placa', render: (r: any) => r.fecha_placa ? `${r.fecha_placa?.split('T')[0] ?? ''} ${r.placa ?? ''}`.trim() : (r.placa ?? '') },
        { header: 'NUMERO PLANILLA',  key: 'numero_planilla' },
        { header: 'REMISION',         key: 'remision' },
        { header: 'PEDIDO',           key: 'pedido' },
        { header: 'REFERENCIA',       key: 'referencia' },
        { header: 'UM',               key: 'um' },
        { header: 'CANTIDAD',         key: 'cantidad' },
        { header: 'MOTIVO DEVOLUCION',key: 'motivo_devolucion' },
        { header: 'UNIDAD NEGOCIO',   key: 'un_code' },
        { header: 'TIPO PLAN',        key: 'unidad_negocio' },
        { header: 'ESTADO',           key: 'status' },
        { header: 'F. CONFIRMACIÓN FACT.', key: 'conciliacion_confirmada_at', render: (r: any) => fmtDate(r.conciliacion_confirmada_at), exportRender: (r: any) => fmtDate(r.conciliacion_confirmada_at) },
        { header: 'POR (CONFIRMACIÓN)',    key: 'conciliacion_confirmada_by' },
        { header: 'F. EXCEL ENVIADO',  key: 'pre_approval_at',  render: (r: any) => fmtDate(r.pre_approval_at),  exportRender: (r: any) => fmtDate(r.pre_approval_at) },
        { header: 'POR (EXCEL)',       key: 'pre_approval_by' },
        { header: 'F. APROBACIÓN PROV.', key: 'pre_approved_at', render: (r: any) => fmtDate(r.pre_approved_at), exportRender: (r: any) => fmtDate(r.pre_approved_at) },
        { header: 'POR (APROBACIÓN)', key: 'pre_approved_by' },
        { header: 'F. SALIDA PROV.',   key: 'supplier_exit_at', render: (r: any) => fmtDate(r.supplier_exit_at), exportRender: (r: any) => fmtDate(r.supplier_exit_at) },
        { header: 'POR (SALIDA)',      key: 'supplier_exit_by' },
        { header: 'F. COMPLETADO',     key: 'completed_at',     render: (r: any) => fmtDate(r.completed_at),     exportRender: (r: any) => fmtDate(r.completed_at) },
        { header: 'POR (COMPLETADO)', key: 'completed_by' },
    ];

    // ── Sin Registrar: filtrado + ordenamiento ────────────────────────────────
    const displayedConcilPending = React.useMemo(() => {
        const term = concilSearch.trim().toLowerCase();
        const filtered = !term ? concilPending : concilPending.filter(inv =>
            [inv.invoice_id, inv.customer_name, inv.numero_planilla, inv.vehicle_plate, inv.fecha_placa, inv.plan_type]
                .some(v => v && String(v).toLowerCase().includes(term))
        );
        return sortByKey(filtered, concilSortKey, concilSortDir);
    }, [concilPending, concilSearch, concilSortKey, concilSortDir]);

    const handleConcilSort = (key: string) => {
        if (concilSortKey === key) {
            setConcilSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setConcilSortKey(key);
            setConcilSortDir('asc');
        }
    };

    // ── Seguimiento: filtrado + ordenamiento (compartido entre todas las etapas) ──
    const displayedTrackingReturns = React.useMemo(() => {
        const term = seguimientoSearch.trim().toLowerCase();
        if (!term) return trackingReturns;
        return trackingReturns.filter(r =>
            [r.invoice_id, r.customer_name, r.vendedor, r.numero_planilla, r.return_reason, r.vehicle_plate]
                .some(v => v && String(v).toLowerCase().includes(term))
        );
    }, [trackingReturns, seguimientoSearch]);

    const handleSeguimientoSort = (key: string) => {
        if (seguimientoSortKey === key) {
            setSeguimientoSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSeguimientoSortKey(key);
            setSeguimientoSortDir('asc');
        }
    };

    return (
        <>
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-[11px] font-black text-white transition-all
                    ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.ok ? '✅' : '❌'} {toast.msg}
                </div>
            )}

            {/* Client selector — 3 de 12 columnas */}
            <div className="grid grid-cols-12 gap-3 mb-5">
                <div className="col-span-12 md:col-span-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Cliente</span>
                    {!clientsReady ? (
                        <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    ) : clients.length === 0 ? (
                        <span className="text-[10px] text-slate-400">Sin clientes asignados</span>
                    ) : clients.length === 1 ? (
                        <span className="text-[11px] font-black text-slate-700">{clients[0].name}</span>
                    ) : (
                        <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-rose-400 transition-all">
                            <option value="">— Seleccionar cliente —</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                        </select>
                    )}
                    {selectedClientName && (
                        <span className="text-[9px] bg-rose-50 border border-rose-200 text-rose-700 font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ml-auto shrink-0">
                            {selectedClientName}
                        </span>
                    )}
                </div>
            </div>

            {!clientsReady ? null : (
                <>
                    {/* Tabs */}
                    <div className="flex flex-wrap gap-2 mb-5">
                        {tabs.map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5
                                    ${tab === t.id ? 'bg-slate-900 text-white shadow' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                {t.label}
                                {(t.count ?? 0) > 0 && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black
                                        ${tab === t.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                                        {t.count}
                                    </span>
                                )}
                            </button>
                        ))}
                        <button onClick={() => loadAll(selectedClientId)}
                            className="ml-auto px-3 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                            <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${trackingLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* ══════════════════════════════════════════════════════════
                        TAB: RECIBIR DEVOLUCIÓN
                    ══════════════════════════════════════════════════════════ */}
                    {tab === 'recibir' && (
                        <div className="max-w-2xl space-y-4">
                            {/* Buscador de factura */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                    Número de Factura / Remisión
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        value={invoiceSearch}
                                        onChange={e => setInvoiceSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchInvoice()}
                                        placeholder="Ej: AFE7826049"
                                        className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-400 uppercase"
                                    />
                                    <button onClick={handleSearchInvoice} disabled={searchingInvoice}
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                        {searchingInvoice
                                            ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" />
                                            : <Icons.Search className="w-3.5 h-3.5" />}
                                        Buscar
                                    </button>
                                </div>
                            </div>

                            {invoiceData && (
                                <>
                                    {/* Info de la factura */}
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Factura</span>
                                                <p className="font-black text-indigo-900 font-mono">{invoiceData.invoice.invoice_id}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Cliente</span>
                                                <p className="font-bold text-slate-700 text-xs">{invoiceData.invoice.customer_name}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Planilla</span>
                                                <p className="font-bold text-slate-700 font-mono">{invoiceData.invoice.numero_planilla || '—'}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Placa</span>
                                                <p className="font-bold text-slate-700">{invoiceData.invoice.assigned_plate || invoiceData.invoice.vehicle_plate || '—'}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Conductor</span>
                                                <p className="font-bold text-slate-700">{invoiceData.invoice.conductor_name || '—'}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Fecha Asignación</span>
                                                <p className="font-bold text-slate-700">{invoiceData.invoice.assigned_at ? new Date(invoiceData.invoice.assigned_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Pedido</span>
                                                <p className="font-bold text-slate-700 font-mono">{invoiceData.invoice.order_number || '—'}</p></div>
                                        </div>
                                    </div>

                                    {/* Banner: factura ya procesada por conciliación */}
                                    {invoiceData.fromConciliacion && invoiceData.returnStatus !== 'complete' && (
                                        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex items-start gap-3">
                                            <span className="text-2xl">⚠️</span>
                                            <div className="flex-1">
                                                <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest">Esta factura ya fue procesada en conciliación</p>
                                                <p className="text-xs text-amber-700 mt-1">Fue marcada como <strong>DEVUELTA</strong> en el módulo de conciliación. Use el tab <strong>"Sin Registrar"</strong> para confirmar la recepción física — ingresará directamente en estado CONFIRMADO sin requerir aprobación de facturación.</p>
                                                <button
                                                    onClick={() => setTab('sin_registrar')}
                                                    className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-black uppercase tracking-widest rounded-xl">
                                                    Ir a Sin Registrar →
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Banner de devoluciones previas */}
                                    {invoiceData.returnStatus === 'complete' && (
                                        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-start gap-3">
                                            <span className="text-2xl">🚫</span>
                                            <div>
                                                <p className="text-[11px] font-black text-rose-700 uppercase tracking-widest">Devolución completa ya registrada</p>
                                                <p className="text-xs text-rose-500 mt-0.5">Esta factura ya fue devuelta en su totalidad. No se puede registrar otra devolución.</p>
                                                {invoiceData.previousReturns.map(pr => (
                                                    <p key={pr.return_id} className="text-[10px] text-rose-400 mt-1 font-mono">
                                                        #{pr.return_id} · {new Date(pr.created_at).toLocaleDateString('es-CO')} · {pr.return_reason}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {invoiceData.returnStatus === 'partial' && (
                                        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
                                            <span className="text-2xl">⚠️</span>
                                            <div>
                                                <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Devolución parcial previa</p>
                                                <p className="text-xs text-amber-600 mt-0.5">Ya se registró una devolución parcial. Solo puedes devolver las cantidades restantes.</p>
                                                {invoiceData.previousReturns.map(pr => (
                                                    <p key={pr.return_id} className="text-[10px] text-amber-500 mt-1 font-mono">
                                                        #{pr.return_id} · {new Date(pr.created_at).toLocaleDateString('es-CO')} · {pr.return_reason} · Cód: {pr.vendedor || '—'}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Campos: vendedor, tipo, motivo, notas */}
                                    <div className={`bg-white rounded-2xl border border-slate-200 p-5 space-y-4 ${invoiceData.returnStatus === 'complete' || invoiceData.fromConciliacion ? 'opacity-40 pointer-events-none' : ''}`}>
                                        {/* CÓDIGO VENDEDOR — obligatorio */}
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                Código Vendedor <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                value={vendedor}
                                                onChange={e => setVendedor(e.target.value.toUpperCase())}
                                                placeholder="Ej: R204"
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-400"
                                            />
                                        </div>

                                        {/* Tipo devolución */}
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                Tipo de Devolución
                                            </label>
                                            <div className="flex gap-2">
                                                {(['COMPLETA', 'PARCIAL'] as const).map(rt => (
                                                    <button key={rt} onClick={() => handleChangeReturnType(rt)}
                                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                                            ${returnType === rt ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                                                        {rt}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Motivo */}
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                Motivo de Devolución <span className="text-rose-500">*</span>
                                            </label>
                                            <select
                                                value={showOtroInput ? '__otro__' : returnReason}
                                                onChange={e => {
                                                    if (e.target.value === '__otro__') {
                                                        setShowOtroInput(true);
                                                        setReturnReason('');
                                                        setOtroText('');
                                                    } else {
                                                        setShowOtroInput(false);
                                                        setReturnReason(e.target.value);
                                                    }
                                                }}
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                                                <option value="">— Seleccionar motivo —</option>
                                                {reasonOptions.map(r => (
                                                    <option key={r.id} value={r.name}>{r.name}</option>
                                                ))}
                                                <option value="__otro__">➕ Otro (crear nuevo)...</option>
                                            </select>
                                            {showOtroInput && (
                                                <div className="mt-2 flex gap-2">
                                                    <input
                                                        autoFocus
                                                        value={otroText}
                                                        onChange={e => setOtroText(e.target.value)}
                                                        onKeyDown={async e => {
                                                            if (e.key === 'Enter' && otroText.trim()) {
                                                                const val = otroText.trim();
                                                                try {
                                                                    const res = await api.createReturnReason(val);
                                                                    if (res?.data) setReasonOptions(prev => prev.some(r => r.id === res.data.id) ? prev : [...prev, res.data]);
                                                                } catch { /* continuar igual */ }
                                                                setReturnReason(val);
                                                                setShowOtroInput(false);
                                                                setOtroText('');
                                                            }
                                                        }}
                                                        placeholder="Escribir motivo y presionar Enter..."
                                                        className="flex-1 border border-indigo-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={!otroText.trim()}
                                                        onClick={async () => {
                                                            const val = otroText.trim();
                                                            if (!val) return;
                                                            try {
                                                                const res = await api.createReturnReason(val);
                                                                if (res?.data) setReasonOptions(prev => prev.some(r => r.id === res.data.id) ? prev : [...prev, res.data]);
                                                            } catch { /* continuar igual */ }
                                                            setReturnReason(val);
                                                            setShowOtroInput(false);
                                                            setOtroText('');
                                                        }}
                                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[10px] font-black uppercase rounded-xl">
                                                        Agregar
                                                    </button>
                                                </div>
                                            )}
                                            {returnReason && !showOtroInput && !reasonOptions.some(r => r.name === returnReason) && (
                                                <p className="text-[9px] text-indigo-500 font-bold mt-1">✓ Motivo personalizado: "{returnReason}"</p>
                                            )}
                                        </div>

                                        {/* Observaciones */}
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                Observaciones
                                            </label>
                                            <input value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
                                                placeholder="Opcional"
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                            />
                                        </div>
                                    </div>

                                    {/* Scanner (solo visible en PARCIAL) */}
                                    {returnType === 'PARCIAL' && (
                                        <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-3">
                                            <Icons.Scan className="w-5 h-5 text-emerald-400 shrink-0" />
                                            <div className="flex-1">
                                                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">
                                                    Lectora de Código de Barras
                                                </p>
                                                <input
                                                    ref={barcodeRef}
                                                    value={barcodeRaw}
                                                    onChange={e => setBarcodeRaw(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && barcodeRaw.trim()) {
                                                            handleBarcodeScan(barcodeRaw.trim());
                                                            setBarcodeRaw('');
                                                        }
                                                    }}
                                                    placeholder="Escanear o escribir código..."
                                                    className="w-full bg-slate-800 text-emerald-300 placeholder-slate-500 font-mono text-sm px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Artículos */}
                                    <div className="space-y-2">
                                        {invoiceData.items.map(item => {
                                            const qty        = scannedQtys[item.article_id] ?? 0;
                                            const max        = item.remaining_qty;
                                            const alreadyRet = item.qty_returned;
                                            const done       = qty >= max && max > 0;
                                            const fullyDone  = alreadyRet >= item.expected_qty;
                                            const mode       = pickingModes[item.article_id] ?? 'UND';
                                            const isLast     = lastScanned === item.article_id;

                                            return (
                                                <div key={item.article_id}
                                                    className={`bg-white rounded-2xl border-2 p-4 transition-all
                                                        ${fullyDone ? 'border-slate-200 opacity-60' : done ? 'border-emerald-300' : isLast ? 'border-amber-300' : 'border-slate-100'}`}>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        {isLast && <>
                                                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                                            <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Último escaneado</span>
                                                        </>}
                                                        {alreadyRet > 0 && (
                                                            <span className={`ml-auto text-[8px] font-black px-2 py-0.5 rounded-full ${fullyDone ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                                                                Ya devuelto: {alreadyRet} {item.unit}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex justify-between items-start gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-black text-slate-900 leading-tight truncate">{item.article_name}</p>
                                                            <div className="flex gap-2 mt-0.5 flex-wrap">
                                                                <span className="text-[9px] text-slate-400 font-mono">{item.article_id}</span>
                                                                {item.un_code && <span className="text-[8px] bg-slate-100 text-slate-500 font-black px-1.5 py-0.5 rounded">{item.un_code}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className={`text-xl font-black tabular-nums ${fullyDone ? 'text-slate-400' : done ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                                {qty} <span className="text-[11px] text-slate-300">/</span> {max}
                                                            </p>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase">{item.unit}</p>
                                                            {alreadyRet > 0 && (
                                                                <p className="text-[8px] text-slate-400 mt-0.5">
                                                                    Total: {item.expected_qty}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Controles de cantidad */}
                                                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                                                        {/* Modo: UND / CAJA / STD */}
                                                        {returnType === 'PARCIAL' && (
                                                            <>
                                                                <button onClick={() => setPickingModes(p => ({ ...p, [item.article_id]: 'UND' }))}
                                                                    className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase flex flex-col items-center gap-0.5 transition-all
                                                                        ${mode === 'UND' ? 'bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
                                                                    <span>x1</span><span className="text-[7px] opacity-70">{item.unit}</span>
                                                                </button>
                                                                {(item.factor_inter ?? 0) > 1 && (
                                                                    <button onClick={() => setPickingModes(p => ({ ...p, [item.article_id]: 'CAJA' }))}
                                                                        className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase flex flex-col items-center gap-0.5 transition-all
                                                                            ${mode === 'CAJA' ? 'bg-indigo-600 text-white ring-2 ring-indigo-600 ring-offset-1' : 'bg-indigo-50 text-indigo-400 border border-indigo-100'}`}>
                                                                        <span>x{item.factor_inter}</span><span className="text-[7px] opacity-70">{item.uom_inter_name}</span>
                                                                    </button>
                                                                )}
                                                                {(item.factor_std ?? 0) > 1 && item.factor_std !== item.factor_inter && (
                                                                    <button onClick={() => setPickingModes(p => ({ ...p, [item.article_id]: 'STD' }))}
                                                                        className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase flex flex-col items-center gap-0.5 transition-all
                                                                            ${mode === 'STD' ? 'bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-1' : 'bg-amber-50 text-amber-400 border border-amber-100'}`}>
                                                                        <span>x{item.factor_std}</span><span className="text-[7px] opacity-70">{item.uom_std_name}</span>
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Input manual de cantidad */}
                                                        {returnType === 'PARCIAL' && (
                                                            <>
                                                                <input
                                                                    type="number" min={0} max={item.remaining_qty}
                                                                    value={qty}
                                                                    onChange={e => handleManualSet(item.article_id, e.target.value)}
                                                                    className="w-14 text-center border border-slate-200 rounded-xl text-sm font-black focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        const mult = mode === 'CAJA' ? (item.factor_inter || 1) : mode === 'STD' ? (item.factor_std || 1) : 1;
                                                                        handleManualAdd(item.article_id, mult);
                                                                    }}
                                                                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[9px] font-black uppercase flex items-center gap-1">
                                                                    <Icons.Plus className="w-3 h-3" /> +
                                                                </button>
                                                            </>
                                                        )}

                                                        {/* Modo COMPLETA: solo muestra qty total */}
                                                        {returnType === 'COMPLETA' && (
                                                            <div className="flex-1 flex items-center justify-center">
                                                                <span className="text-[9px] text-emerald-600 font-black uppercase">✓ Devolución completa</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Botón confirmar */}
                                    {invoiceData.fromConciliacion ? (
                                        <button onClick={() => setTab('sin_registrar')}
                                            className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2">
                                            ⚠️ Ir a "Sin Registrar" para confirmar recepción →
                                        </button>
                                    ) : invoiceData.returnStatus === 'complete' ? (
                                        <div className="w-full py-4 bg-slate-100 text-slate-400 font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed">
                                            🚫 Devolución ya completa — no se puede registrar otra
                                        </div>
                                    ) : (
                                        <button onClick={handleSaveReturn} disabled={savingReturn}
                                            className="w-full py-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 disabled:opacity-50 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2">
                                            {savingReturn
                                                ? <><Icons.Loader className="w-4 h-4 animate-spin" /> Guardando…</>
                                                : <><Icons.Package className="w-4 h-4" /> {invoiceData.returnStatus === 'partial' ? 'Confirmar Devolución Adicional' : 'Confirmar Recepción de Devolución'}</>}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                        TAB: SIN REGISTRAR (desde conciliación)
                    ══════════════════════════════════════════════════════════ */}
                    {tab === 'sin_registrar' && (
                        <div className="space-y-4">
                            {/* Cabecera informativa */}
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                                <span className="text-lg mt-0.5">⚠️</span>
                                <div>
                                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Devoluciones aprobadas en conciliación sin recibo físico en bodega</p>
                                    <p className="text-[9px] text-amber-700 mt-0.5">Estas facturas ya fueron marcadas como DEVUELTO en conciliación. Al registrar la recepción física entran directamente al pipeline en estado <strong>CONFIRMADO</strong>, saltando la espera de facturación.</p>
                                </div>
                            </div>

                            {/* Buscador */}
                            {concilPending.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-2xl p-3">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Buscar</p>
                                    <div className="relative">
                                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            value={concilSearch}
                                            onChange={e => setConcilSearch(e.target.value)}
                                            placeholder="Buscar por factura, cliente, planilla, placa…"
                                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] outline-none focus:bg-white focus:border-indigo-400 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Acciones */}
                            {concilPending.length > 0 && (
                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        onClick={() => setSelectedConcilIds(new Set(concilPending.map(i => i.invoice_id)))}
                                        className="px-3 py-1.5 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50">
                                        Seleccionar todo
                                    </button>
                                    <button
                                        onClick={() => setSelectedConcilIds(new Set())}
                                        className="px-3 py-1.5 border border-rose-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50">
                                        Quitar todo
                                    </button>
                                    {selectedConcilIds.size > 0 && (
                                        <button
                                            onClick={handleImportConcil}
                                            disabled={importingConcil}
                                            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
                                            {importingConcil
                                                ? <><Icons.Loader className="w-3.5 h-3.5 animate-spin" /> Registrando…</>
                                                : <><Icons.Package className="w-3.5 h-3.5" /> Registrar recepción ({selectedConcilIds.size})</>}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Tabla */}
                            {concilLoading ? (
                                <div className="flex justify-center py-20"><Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" /></div>
                            ) : displayedConcilPending.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                                        <Icons.CheckCircle className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                        {concilSearch ? 'Sin resultados para la búsqueda' : 'Todo registrado — sin pendientes de conciliación'}
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                                <th className="px-3 py-2 w-8">
                                                    <input type="checkbox"
                                                        checked={selectedConcilIds.size > 0 && displayedConcilPending.every(i => selectedConcilIds.has(i.invoice_id))}
                                                        onChange={e => setSelectedConcilIds(e.target.checked ? new Set(displayedConcilPending.map(i => i.invoice_id)) : new Set())}
                                                        className="rounded" />
                                                </th>
                                                <SortTh label="Factura" sortKey="invoice_id" activeKey={concilSortKey} dir={concilSortDir} onSort={handleConcilSort} className="text-[8px]" />
                                                <SortTh label="Cliente" sortKey="customer_name" activeKey={concilSortKey} dir={concilSortDir} onSort={handleConcilSort} className="text-[8px]" />
                                                <SortTh label="Planilla" sortKey="numero_planilla" activeKey={concilSortKey} dir={concilSortDir} onSort={handleConcilSort} className="text-[8px]" />
                                                <SortTh label="Placa" sortKey="vehicle_plate" activeKey={concilSortKey} dir={concilSortDir} onSort={handleConcilSort} className="text-[8px]" />
                                                <SortTh label="Fecha" sortKey="fecha_placa" activeKey={concilSortKey} dir={concilSortDir} onSort={handleConcilSort} className="text-[8px]" />
                                                <SortTh label="Plan" sortKey="plan_type" activeKey={concilSortKey} dir={concilSortDir} onSort={handleConcilSort} className="text-[8px]" />
                                                <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[8px]">Art.</th>
                                                <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[8px]">Tipo</th>
                                                <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[8px]">Vendedor <span className="text-rose-500">*</span></th>
                                                <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest text-[8px]">Motivo <span className="text-rose-500">*</span></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {displayedConcilPending.map(inv => {
                                                const sel = selectedConcilIds.has(inv.invoice_id);
                                                return (
                                                    <tr key={inv.invoice_id}
                                                        onClick={() => setSelectedConcilIds(prev => {
                                                            const n = new Set(prev);
                                                            n.has(inv.invoice_id) ? n.delete(inv.invoice_id) : n.add(inv.invoice_id);
                                                            return n;
                                                        })}
                                                        className={`cursor-pointer transition-colors ${sel ? 'bg-emerald-50' : 'hover:bg-slate-50/70'}`}>
                                                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                                            <input type="checkbox" checked={sel}
                                                                onChange={() => setSelectedConcilIds(prev => {
                                                                    const n = new Set(prev);
                                                                    n.has(inv.invoice_id) ? n.delete(inv.invoice_id) : n.add(inv.invoice_id);
                                                                    return n;
                                                                })}
                                                                className="rounded" />
                                                        </td>
                                                        <td className="px-3 py-2 font-black text-slate-800 text-[10px]">{inv.invoice_id}</td>
                                                        <td className="px-3 py-2 text-slate-600 max-w-[130px] truncate text-[10px]" title={inv.customer_name}>{inv.customer_name ?? '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 text-[10px]">{inv.numero_planilla ?? '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 text-[10px]">{inv.vehicle_plate ?? '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-[10px]">{inv.fecha_placa ?? '—'}</td>
                                                        <td className="px-3 py-2">
                                                            {inv.plan_type && (
                                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-lg uppercase ${inv.plan_type.includes('R') ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                    {inv.plan_type}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className="bg-indigo-100 text-indigo-700 text-[8px] font-black px-2 py-0.5 rounded-lg">
                                                                {inv.items.length}
                                                            </span>
                                                        </td>
                                                        {/* Tipo COMPLETA/PARCIAL */}
                                                        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                                                            <div className="flex gap-1">
                                                                {(['COMPLETA','PARCIAL'] as const).map(t => (
                                                                    <button key={t} onClick={() => setConcilExtra(inv.invoice_id, 'return_type', t)}
                                                                        className={`text-[7px] font-black px-1.5 py-0.5 rounded-lg uppercase transition-all ${(concilExtras[inv.invoice_id]?.return_type ?? 'COMPLETA') === t ? (t === 'COMPLETA' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white') : 'bg-slate-100 text-slate-500'}`}>
                                                                        {t === 'COMPLETA' ? 'Comp.' : 'Parc.'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        {/* Vendedor */}
                                                        <td className="px-2 py-2 min-w-[90px]" onClick={e => e.stopPropagation()}>
                                                            <input
                                                                type="text"
                                                                placeholder="Cód. vendedor"
                                                                value={concilExtras[inv.invoice_id]?.vendedor ?? ''}
                                                                onChange={e => setConcilExtra(inv.invoice_id, 'vendedor', e.target.value)}
                                                                className="w-full text-[9px] px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                                                            />
                                                        </td>
                                                        {/* Motivo */}
                                                        <td className="px-2 py-2 min-w-[150px]" onClick={e => e.stopPropagation()}>
                                                            {concilOtroMode.has(inv.invoice_id) ? (
                                                                <div className="flex gap-1">
                                                                    <input
                                                                        autoFocus
                                                                        type="text"
                                                                        placeholder="Escribir motivo..."
                                                                        value={concilOtroText[inv.invoice_id] ?? ''}
                                                                        onChange={e => setConcilOtroText(prev => ({ ...prev, [inv.invoice_id]: e.target.value }))}
                                                                        onKeyDown={e => { if (e.key === 'Enter') confirmConcilOtro(inv.invoice_id); if (e.key === 'Escape') setConcilOtroMode(prev => { const n = new Set(prev); n.delete(inv.invoice_id); return n; }); }}
                                                                        className="flex-1 text-[9px] px-2 py-1 border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                                                                    />
                                                                    <button onClick={() => confirmConcilOtro(inv.invoice_id)}
                                                                        className="text-[8px] px-1.5 py-1 bg-indigo-600 text-white rounded-lg font-black">✓</button>
                                                                    <button onClick={() => setConcilOtroMode(prev => { const n = new Set(prev); n.delete(inv.invoice_id); return n; })}
                                                                        className="text-[8px] px-1.5 py-1 bg-slate-200 text-slate-600 rounded-lg font-black">✕</button>
                                                                </div>
                                                            ) : (
                                                                <select
                                                                    value={concilExtras[inv.invoice_id]?.return_reason ?? ''}
                                                                    onChange={e => {
                                                                        if (e.target.value === '__otro__') {
                                                                            setConcilOtroMode(prev => new Set([...prev, inv.invoice_id]));
                                                                            setConcilOtroText(prev => ({ ...prev, [inv.invoice_id]: '' }));
                                                                        } else {
                                                                            setConcilExtra(inv.invoice_id, 'return_reason', e.target.value);
                                                                        }
                                                                    }}
                                                                    className="w-full text-[9px] px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                                                                    <option value="">— Seleccionar —</option>
                                                                    {reasonOptions.map((r: ReturnReasonOption) => (
                                                                        <option key={r.id} value={r.name}>{r.name}</option>
                                                                    ))}
                                                                    <option value="__otro__">➕ Otro (crear nuevo)...</option>
                                                                </select>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                        TAB: SEGUIMIENTO
                    ══════════════════════════════════════════════════════════ */}
                    {tab === 'seguimiento' && (() => {
                        type Stage = { status: string; label: string; color: string; nextStatus?: string; actionLabel?: string; isPreApproval?: boolean };
                        const stages: Stage[] = [
                            { status: 'PENDING',       label: 'Pendiente confirmación facturación',     color: 'amber' },
                            { status: 'CONFIRMED',     label: 'Confirmadas — enviar pre-aprobación',    color: 'emerald', nextStatus: 'PRE_APPROVAL', actionLabel: 'Enviar Pre-Aprobación', isPreApproval: true },
                            { status: 'PRE_APPROVAL',  label: 'Excel enviado — pendiente proveedor',    color: 'indigo',  nextStatus: 'PRE_APPROVED', actionLabel: 'Confirmar aprobación prov.' },
                            { status: 'PRE_APPROVED',  label: 'Aprobado proveedor — pendiente salida',  color: 'sky',     nextStatus: 'SUPPLIER_EXIT',actionLabel: 'Confirmar salida' },
                            { status: 'SUPPLIER_EXIT', label: 'Salida realizada — pendiente documento', color: 'violet',  nextStatus: 'COMPLETED',    actionLabel: 'Confirmar doc. recibido' },
                        ];

                        const hdr: Record<string,string> = {
                            amber:   'bg-amber-50 border-amber-200 text-amber-800',
                            emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                            indigo:  'bg-indigo-50 border-indigo-200 text-indigo-800',
                            sky:     'bg-sky-50 border-sky-200 text-sky-800',
                            violet:  'bg-violet-50 border-violet-200 text-violet-800',
                        };
                        const btnColor: Record<string,string> = {
                            emerald: 'bg-emerald-600 hover:bg-emerald-700',
                            indigo:  'bg-indigo-600 hover:bg-indigo-700',
                            sky:     'bg-sky-600 hover:bg-sky-700',
                            violet:  'bg-violet-600 hover:bg-violet-700',
                        };

                        const selForStage = (st: string) => trackingReturns.filter(r => r.status === st && selectedExcelIds.has(r.id));
                        const toggleStatus = (st: string) => setVisibleStatuses(prev => {
                            const n = new Set(prev);
                            n.has(st) ? n.delete(st) : n.add(st);
                            return n;
                        });

                        const stageTimestamp = (r: TrackingReturn): string | undefined => ({
                            PENDING:       r.fecha,
                            CONFIRMED:     r.conciliacion_confirmada_at,
                            PRE_APPROVAL:  r.pre_approval_at,
                            PRE_APPROVED:  r.pre_approved_at,
                            SUPPLIER_EXIT: r.supplier_exit_at,
                        } as Record<string,string|undefined>)[r.status];

                        const daysInStage = (r: TrackingReturn): number => {
                            const ts = stageTimestamp(r);
                            if (!ts) return 0;
                            return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
                        };

                        const kpiColors: Record<string,{ bg: string; text: string; badge: string; warn: string }> = {
                            amber:   { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-800',   warn: 'text-rose-600' },
                            emerald: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-800', warn: 'text-rose-600' },
                            indigo:  { bg: 'bg-indigo-50 border-indigo-200',  text: 'text-indigo-800',  badge: 'bg-indigo-100 text-indigo-800',  warn: 'text-rose-600' },
                            sky:     { bg: 'bg-sky-50 border-sky-200',        text: 'text-sky-800',     badge: 'bg-sky-100 text-sky-800',        warn: 'text-rose-600' },
                            violet:  { bg: 'bg-violet-50 border-violet-200',  text: 'text-violet-800',  badge: 'bg-violet-100 text-violet-800',  warn: 'text-rose-600' },
                        };

                        return (
                            <div className="space-y-4">

                                {/* ── KPI Panel ── */}
                                {trackingReturns.length > 0 && (
                                    <div>
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">KPI — Días en cada etapa</p>
                                        <div className="grid grid-cols-5 gap-2">
                                            {stages.map(s => {
                                                const rows = trackingReturns.filter(r => r.status === s.status);
                                                const days = rows.map(daysInStage);
                                                const maxDays = days.length ? Math.max(...days) : 0;
                                                const avgDays = days.length ? Math.round(days.reduce((a,b) => a+b, 0) / days.length) : 0;
                                                const c = kpiColors[s.color];
                                                return (
                                                    <div key={s.status} className={`border rounded-2xl p-3 flex flex-col gap-1.5 ${c.bg}`}>
                                                        <span className={`text-[8px] font-black uppercase tracking-widest leading-tight ${c.text}`}>{s.label.split('—')[0].trim()}</span>
                                                        <div className="flex items-end justify-between gap-1">
                                                            <span className={`text-2xl font-black leading-none ${c.text}`}>{rows.length}</span>
                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-lg ${c.badge}`}>{rows.length === 1 ? '1 ret.' : `${rows.length} ret.`}</span>
                                                        </div>
                                                        {rows.length > 0 && (
                                                            <div className="space-y-0.5">
                                                                <div className="flex justify-between">
                                                                    <span className="text-[7px] text-slate-500 uppercase">Promedio</span>
                                                                    <span className={`text-[8px] font-black ${avgDays > 7 ? c.warn : c.text}`}>{avgDays}d</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-[7px] text-slate-500 uppercase">Máximo</span>
                                                                    <span className={`text-[8px] font-black ${maxDays > 14 ? c.warn : c.text}`}>{maxDays}d</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {rows.length === 0 && (
                                                            <span className="text-[8px] text-slate-400">Sin pendientes</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ── Filtros de estado ── */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-3">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Filtrar por estado</p>
                                    <div className="flex flex-wrap gap-2">
                                        {stages.map(s => {
                                            const cnt = trackingReturns.filter(r => r.status === s.status).length;
                                            const active = visibleStatuses.has(s.status);
                                            const pillOn: Record<string,string> = {
                                                amber:   'bg-amber-500 text-white border-amber-500',
                                                emerald: 'bg-emerald-600 text-white border-emerald-600',
                                                indigo:  'bg-indigo-600 text-white border-indigo-600',
                                                sky:     'bg-sky-600 text-white border-sky-600',
                                                violet:  'bg-violet-600 text-white border-violet-600',
                                            };
                                            const pillOff: Record<string,string> = {
                                                amber:   'bg-white text-amber-600 border-amber-300',
                                                emerald: 'bg-white text-emerald-700 border-emerald-300',
                                                indigo:  'bg-white text-indigo-700 border-indigo-300',
                                                sky:     'bg-white text-sky-700 border-sky-300',
                                                violet:  'bg-white text-violet-700 border-violet-300',
                                            };
                                            return (
                                                <button key={s.status} onClick={() => toggleStatus(s.status)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${active ? pillOn[s.color] : pillOff[s.color]}`}>
                                                    <span>{s.label.split('—')[0].trim()}</span>
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-slate-100'}`}>{cnt}</span>
                                                </button>
                                            );
                                        })}
                                        <button onClick={() => setVisibleStatuses(new Set(stages.map(s => s.status)))}
                                            className="px-3 py-1.5 rounded-xl border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50">
                                            Todos
                                        </button>
                                        <button onClick={() => setVisibleStatuses(new Set())}
                                            className="px-3 py-1.5 rounded-xl border border-rose-200 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50">
                                            Quitar todo
                                        </button>
                                    </div>
                                </div>

                                {/* ── Buscador ── */}
                                {trackingReturns.length > 0 && (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-3">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Buscar</p>
                                        <div className="relative">
                                            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                value={seguimientoSearch}
                                                onChange={e => setSeguimientoSearch(e.target.value)}
                                                placeholder="Buscar por factura, cliente, vendedor, planilla, motivo…"
                                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] outline-none focus:bg-white focus:border-indigo-400 transition-colors"
                                            />
                                        </div>
                                    </div>
                                )}

                                {trackingLoading ? (
                                    <div className="flex justify-center py-20"><Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" /></div>
                                ) : trackingReturns.length === 0 ? (
                                    <EmptyState msg="No hay devoluciones activas en seguimiento" />
                                ) : displayedTrackingReturns.length === 0 ? (
                                    <EmptyState msg="Sin resultados para la búsqueda" />
                                ) : stages.map(stage => {
                                    if (!visibleStatuses.has(stage.status)) return null;
                                    const rows = sortByKey(
                                        displayedTrackingReturns.filter(r => r.status === stage.status),
                                        seguimientoSortKey, seguimientoSortDir
                                    );
                                    if (rows.length === 0) return null;
                                    const sel = selForStage(stage.status);
                                    const allSel = rows.every(r => selectedExcelIds.has(r.id));

                                    return (
                                        <div key={stage.status} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                            {/* Cabecera del grupo */}
                                            <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${hdr[stage.color]}`}>
                                                <span className="text-[10px] font-black uppercase tracking-widest">{stage.label} ({rows.length})</span>
                                                <div className="flex items-center gap-2">
                                                    {/* Excel: genérico para otros estados, dedicado (marca descarga) para CONFIRMED */}
                                                    {stage.isPreApproval ? (
                                                        sel.length > 0 && (
                                                            <button
                                                                onClick={() => handleDownloadExcel(sel)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/70 hover:bg-white border border-emerald-400 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">
                                                                <Icons.Download className="w-3 h-3" />
                                                                Excel ({sel.length})
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button
                                                            onClick={() => handleExportExcel(sel.length > 0 ? sel : rows)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white/70 hover:bg-white border border-current text-[9px] font-black uppercase tracking-widest rounded-xl opacity-80 hover:opacity-100 transition-all">
                                                            <Icons.Download className="w-3 h-3" />
                                                            Excel{sel.length > 0 ? ` (${sel.length})` : ''}
                                                        </button>
                                                    )}
                                                    {/* Acción de avance de estado — solo cuando hay seleccionados */}
                                                    {stage.nextStatus && sel.length > 0 && (
                                                        <button
                                                            disabled={advancingId === -1}
                                                            onClick={() => stage.isPreApproval
                                                                ? handleSendPreApproval(sel)
                                                                : handleAdvanceBatch(sel.map(r => r.id), stage.nextStatus!, stage.actionLabel!)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-[9px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50 ${btnColor[stage.color]}`}>
                                                            {advancingId === -1 ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <>{stage.actionLabel} ({sel.length})</>}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Tabla */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[10px]">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 bg-slate-50/60">
                                                            {/* Checkbox en TODOS los bloques */}
                                                            <th className="px-3 py-2 w-8">
                                                                <input type="checkbox" checked={allSel}
                                                                    onChange={e => setSelectedExcelIds(prev => {
                                                                        const n = new Set(prev);
                                                                        rows.forEach(r => e.target.checked ? n.add(r.id) : n.delete(r.id));
                                                                        return n;
                                                                    })}
                                                                    className="w-3.5 h-3.5 accent-slate-600 cursor-pointer" />
                                                            </th>
                                                            <SortTh label="Fecha" sortKey="fecha" activeKey={seguimientoSortKey} dir={seguimientoSortDir} onSort={handleSeguimientoSort} />
                                                            <SortTh label="Remisión" sortKey="invoice_id" activeKey={seguimientoSortKey} dir={seguimientoSortDir} onSort={handleSeguimientoSort} />
                                                            <SortTh label="Cliente" sortKey="customer_name" activeKey={seguimientoSortKey} dir={seguimientoSortDir} onSort={handleSeguimientoSort} />
                                                            <SortTh label="Vendedor" sortKey="vendedor" activeKey={seguimientoSortKey} dir={seguimientoSortDir} onSort={handleSeguimientoSort} />
                                                            <SortTh label="Planilla" sortKey="numero_planilla" activeKey={seguimientoSortKey} dir={seguimientoSortDir} onSort={handleSeguimientoSort} />
                                                            <SortTh label="Motivo" sortKey="return_reason" activeKey={seguimientoSortKey} dir={seguimientoSortDir} onSort={handleSeguimientoSort} />
                                                            <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Artículos</th>
                                                            <th className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Historial</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((ret, idx) => {
                                                            const expanded = expandedTrackingIds.has(ret.id);
                                                            return (
                                                            <React.Fragment key={ret.id}>
                                                            <tr className={`border-b border-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'} ${selectedExcelIds.has(ret.id) ? 'bg-indigo-50/50' : ''}`}>
                                                                <td className="px-3 py-2">
                                                                    <input type="checkbox" checked={selectedExcelIds.has(ret.id)}
                                                                        onChange={() => setSelectedExcelIds(prev => {
                                                                            const n = new Set(prev); n.has(ret.id) ? n.delete(ret.id) : n.add(ret.id); return n;
                                                                        })}
                                                                        className="w-3.5 h-3.5 accent-slate-600 cursor-pointer" />
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{ret.fecha ?? '—'}</td>
                                                                <td className="px-3 py-2 font-black text-slate-900 font-mono whitespace-nowrap">{ret.invoice_id}</td>
                                                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                                                    <div>{ret.customer_name ?? ret.client_id ?? '—'}</div>
                                                                    {ret.codigo_cliente && <div className="text-[8px] text-slate-400">{ret.codigo_cliente}</div>}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{ret.vendedor ?? '—'}</td>
                                                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                                                    <div>{ret.numero_planilla ?? '—'}</div>
                                                                    {ret.vehicle_plate && <div className="text-[8px] text-slate-400">{ret.vehicle_plate}</div>}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate" title={ret.return_reason}>{ret.return_reason ?? '—'}</td>
                                                                <td className="px-3 py-2 text-slate-500">
                                                                    {ret.items.length > 0
                                                                        ? (
                                                                            <button
                                                                                onClick={() => setExpandedTrackingIds(prev => {
                                                                                    const n = new Set(prev); n.has(ret.id) ? n.delete(ret.id) : n.add(ret.id); return n;
                                                                                })}
                                                                                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-lg text-[9px] font-black transition-colors">
                                                                                {ret.items.length} art.
                                                                                <Icons.ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                                                            </button>
                                                                        )
                                                                        : '—'}
                                                                </td>
                                                                <td className="px-3 py-2 text-[8px] text-slate-400 max-w-[160px]">
                                                                    {ret.conciliacion_confirmada_at && <div className="text-emerald-600">✅ Fact: {ret.conciliacion_confirmada_by} {ret.conciliacion_confirmada_at?.slice(0,10)}</div>}
                                                                    {ret.pre_approval_at && <div className="text-indigo-500">📤 Excel: {ret.pre_approval_by} {ret.pre_approval_at?.slice(0,10)}</div>}
                                                                    {ret.pre_approved_at && <div className="text-sky-500">📋 Aprob: {ret.pre_approved_by} {ret.pre_approved_at?.slice(0,10)}</div>}
                                                                    {ret.supplier_exit_at && <div className="text-violet-500">🚚 Salida: {ret.supplier_exit_by} {ret.supplier_exit_at?.slice(0,10)}</div>}
                                                                </td>
                                                            </tr>
                                                            {expanded && (
                                                                <tr className="bg-indigo-50/60">
                                                                    <td colSpan={8} className="px-4 py-2.5 border-l-4 border-indigo-400">
                                                                        <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Artículos devueltos</p>
                                                                        <table className="w-full text-[9px]">
                                                                            <thead>
                                                                                <tr className="text-indigo-400 font-black uppercase">
                                                                                    <th className="text-left pb-1">Artículo</th>
                                                                                    <th className="text-right pb-1">Cantidad devuelta</th>
                                                                                    <th className="text-right pb-1">Unidad</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-indigo-100">
                                                                                {ret.items.map((it, i) => (
                                                                                    <tr key={i}>
                                                                                        <td className="py-1 font-bold text-slate-700">
                                                                                            {it.article_id || it.sku}
                                                                                            {it.article_name && <span className="block text-[8px] text-slate-400 font-normal">{it.article_name}</span>}
                                                                                        </td>
                                                                                        <td className="py-1 text-right font-black text-rose-600">{it.quantity_returned}</td>
                                                                                        <td className="py-1 text-right text-slate-500">{it.unit || 'und'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            </React.Fragment>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}


                    {/* ══════════════════════════════════════════════════════════
                        TAB: HISTORIAL
                    ══════════════════════════════════════════════════════════ */}
                    {tab === 'historial' && (
                        <div>
                            {/* Filtros de fecha */}
                            <div className="flex flex-wrap gap-3 mb-4 items-end">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Desde</label>
                                    <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
                                        className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Hasta</label>
                                    <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
                                        className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                                <button
                                    onClick={loadHistory}
                                    disabled={histLoading || !histFrom || !histTo}
                                    title={!histFrom || !histTo ? 'Seleccione ambas fechas para consultar' : ''}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5">
                                    <Icons.RefreshCw className={`w-3.5 h-3.5 ${histLoading ? 'animate-spin' : ''}`} />
                                    Consultar
                                </button>
                                <button
                                    onClick={() => { setHistFrom(''); setHistTo(''); setHistory([]); }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5">
                                    <Icons.X className="w-3.5 h-3.5" />
                                    Limpiar
                                </button>
                            </div>

                            {histLoading ? (
                                <div className="flex justify-center py-20"><Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" /></div>
                            ) : (
                                <DataTable
                                    data={history}
                                    columns={historyColumns}
                                    searchPlaceholder="Buscar por factura, cliente, referencia..."
                                    excelFileName={`DEVOLUCIONES_${selectedClientId || 'TODOS'}_${new Date().toISOString().split('T')[0]}.xlsx`}
                                    excelSheetName="Devoluciones"
                                />
                            )}
                        </div>
                    )}
                </>
            )}
        </div>

        </>
    );
};

const EmptyState: React.FC<{ msg: string }> = ({ msg }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
            <Icons.Package className="w-6 h-6 text-slate-300" />
        </div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{msg}</p>
    </div>
);

export default DevolucionesBodega;
