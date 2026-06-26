import React from 'react';
import { api } from '../../services/api';
import { ReturnCard, RETURN_REASONS } from './ReturnCard';
import { Icons } from '../../constants';
import { DataTable } from '../shared/DataTable';
import { cleanSkuM7, extractQtyFromBarcode } from '../../utils/scanner';

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface Client { id: string; name: string; }
type Tab = 'recibir' | 'legalizacion' | 'aprobacion' | 'historial';

interface BodegaReturn {
    invoiceNumber: string; documentId: string | number;
    conductorName?: string; vehiclePlate?: string;
    legalizadoAt: string; externalDocId?: string; items: any[];
}
interface PendingReturn {
    id: number; invoice_id: string; return_reason?: string; notes?: string;
    status: string; created_at: string; vehicle_plate?: string;
    driver_name?: string; client_id?: string; items: any[];
}
interface ApprovalBatch {
    id: number; batch_code: string; client_id: string; notes?: string;
    status: string; created_by?: string; created_at: string;
    total_items: number; approved_items: number;
    email_proveedor?: string; email_sent_at?: string;
    confirmed_at?: string; confirmed_by_name?: string;
}
interface InvoiceItem {
    article_id: string; article_name: string; barcode: string; sku: string;
    un_code: string; unit: string; expected_qty: number;
    qty_returned: number; remaining_qty: number;
    factor_inter: number; factor_std: number;
    uom_inter_name: string; uom_std_name: string;
}
interface InvoiceData {
    invoice: {
        invoice_id: string; order_number: string; customer_name: string;
        client_ref: string; vehicle_plate: string; numero_planilla: string;
        fecha_placa: string; plan_type: string; client_id: string;
    };
    returnStatus: 'none' | 'partial' | 'complete';
    previousReturns: Array<{
        return_id: number; return_reason: string; status: string;
        created_at: string; vendedor: string;
        items: Array<{ article_id: string; qty_returned: number }>;
    }>;
    items: InvoiceItem[];
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
const DevolucionesBodega: React.FC<{ user: any }> = ({ user }) => {
    const [tab, setTab]         = React.useState<Tab>('recibir');
    const [loading, setLoading] = React.useState(false);
    const [toast, setToast]     = React.useState<{ msg: string; ok: boolean } | null>(null);

    // Client selector
    const [clients, setClients]                   = React.useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = React.useState('');
    const [clientsReady, setClientsReady]         = React.useState(false);

    // ── Tab: Post-Legalización ────────────────────────────────────────────────
    const [bodegaReturns, setBodegaReturns]     = React.useState<BodegaReturn[]>([]);
    const [processingId, setProcessingId]       = React.useState<string | null>(null);
    const [searchLegalizacion, setSearchLegalizacion] = React.useState('');

    // ── Tab: Aprobación ───────────────────────────────────────────────────────
    const [pendingReturns, setPendingReturns]       = React.useState<PendingReturn[]>([]);
    const [batches, setBatches]                     = React.useState<ApprovalBatch[]>([]);
    const [selectedReturnIds, setSelectedReturnIds] = React.useState<Set<number>>(new Set());
    const [batchNotes, setBatchNotes]               = React.useState('');
    const [creatingBatch, setCreatingBatch]         = React.useState(false);
    const [batchTab, setBatchTab]                   = React.useState<'pending' | 'batches'>('pending');
    const [emailModal, setEmailModal]               = React.useState<{ batch: ApprovalBatch } | null>(null);
    const [emailInput, setEmailInput]               = React.useState('');
    const [nombreInput, setNombreInput]             = React.useState('');
    const [sendingEmail, setSendingEmail]           = React.useState(false);

    // ── Tab: Recibir devolución ───────────────────────────────────────────────
    const [invoiceSearch, setInvoiceSearch]         = React.useState('');
    const [searchingInvoice, setSearchingInvoice]   = React.useState(false);
    const [invoiceData, setInvoiceData]             = React.useState<InvoiceData | null>(null);
    const [vendedor, setVendedor]                   = React.useState('');
    const [returnType, setReturnType]               = React.useState<'COMPLETA' | 'PARCIAL'>('COMPLETA');
    const [returnReason, setReturnReason]           = React.useState('');
    const [returnNotes, setReturnNotes]             = React.useState('');
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
        setLoading(true);
        try {
            const [br, ap, bt] = await Promise.all([
                api.getPendingBodegaReturns(clientId).catch(() => ({ data: [] })),
                api.getApprovalPendingReturns(clientId).catch(() => ({ data: [] })),
                api.getApprovalBatches(clientId).catch(() => ({ data: [] })),
            ]);
            setBodegaReturns(Array.isArray(br) ? br : (br?.data ?? []));
            setPendingReturns(ap?.data ?? []);
            setBatches(bt?.data ?? []);
        } finally { setLoading(false); }
    }, []);

    React.useEffect(() => {
        if (selectedClientId) {
            setBodegaReturns([]); setPendingReturns([]); setBatches([]);
            loadAll(selectedClientId);
        }
    }, [selectedClientId, loadAll]);

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

    React.useEffect(() => {
        if (tab === 'historial') loadHistory();
    }, [tab, loadHistory]);

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
                vehiclePlate:    invoiceData.invoice.vehicle_plate || undefined,
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
            setScannedQtys({}); setPickingModes({}); setLastScanned(null);
            loadAll(selectedClientId);
        } catch (e: any) { showToast(e?.message ?? 'Error al guardar', false); }
        finally { setSavingReturn(false); }
    };

    // ── Post-Legalización ─────────────────────────────────────────────────────
    const handleConfirmBodega = async (ret: BodegaReturn, obs: string, reason: string) => {
        setProcessingId(`b-${ret.invoiceNumber}`);
        try {
            await api.confirmBodegaReturn({
                invoiceNumber: ret.invoiceNumber,
                documentId: String(ret.documentId),
                receivedBy: user?.name ?? user?.email ?? 'Bodega',
                observation: `${reason}${obs ? ' — ' + obs : ''}`,
            });
            showToast(`Devolución de ${ret.invoiceNumber} confirmada`);
            setBodegaReturns(prev => prev.filter(r => r.invoiceNumber !== ret.invoiceNumber));
        } catch (e: any) { showToast(e?.message ?? 'Error al confirmar', false); }
        finally { setProcessingId(null); }
    };

    // ── Lote de aprobación ────────────────────────────────────────────────────
    const handleCreateBatch = async () => {
        if (selectedReturnIds.size === 0) { showToast('Seleccione al menos una devolución', false); return; }
        setCreatingBatch(true);
        try {
            const res = await api.createApprovalBatch({
                clientId: selectedClientId,
                returnIds: Array.from(selectedReturnIds),
                notes: batchNotes,
                createdBy: user?.name ?? user?.email,
            });
            showToast(`Lote ${res.batchCode} creado con ${selectedReturnIds.size} devoluciones`);
            setSelectedReturnIds(new Set()); setBatchNotes('');
            loadAll(selectedClientId);
        } catch (e: any) { showToast(e?.message ?? 'Error al crear lote', false); }
        finally { setCreatingBatch(false); }
    };

    const handleSendEmail = async () => {
        if (!emailModal) return;
        const email = emailInput.trim();
        if (!email || !email.includes('@')) { showToast('Ingresa un email válido', false); return; }
        setSendingEmail(true);
        try {
            await api.sendApprovalBatchEmail(emailModal.batch.id, email, nombreInput.trim());
            showToast(`Email enviado a ${email}`);
            setBatches(prev => prev.map(b =>
                b.id === emailModal.batch.id
                    ? { ...b, status: 'enviado', email_proveedor: email, email_sent_at: new Date().toISOString() }
                    : b
            ));
            setEmailModal(null); setEmailInput(''); setNombreInput('');
        } catch (e: any) { showToast(e.message || 'Error enviando email', false); }
        finally { setSendingEmail(false); }
    };

    // ── Totales para badge ─────────────────────────────────────────────────────
    const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';
    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'recibir',      label: 'Recibir Devolución' },
        { id: 'legalizacion', label: 'Post-Legalización', count: bodegaReturns.length },
        { id: 'aprobacion',   label: 'Por Aprobar',       count: pendingReturns.length },
        { id: 'historial',    label: 'Historial' },
    ];

    // ── Columnas Excel historial ───────────────────────────────────────────────
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
        { header: 'UNIDAD NEGOCIO',   key: 'unidad_negocio' },
    ];

    return (
        <>
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-[11px] font-black text-white transition-all
                    ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.ok ? '✅' : '❌'} {toast.msg}
                </div>
            )}

            <div className="mb-5">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Devoluciones — Bodega</h1>
                <p className="text-[11px] text-slate-500 mt-0.5">Recepción, seguimiento y aprobación de mercancía devuelta</p>
            </div>

            {/* Client selector */}
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
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
                            <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
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
                                                <p className="font-bold text-slate-700">{invoiceData.invoice.vehicle_plate || '—'}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Pedido</span>
                                                <p className="font-bold text-slate-700 font-mono">{invoiceData.invoice.order_number || '—'}</p></div>
                                            <div><span className="text-indigo-400 font-black uppercase tracking-widest text-[9px]">Plan</span>
                                                <p className="font-bold text-slate-700">{invoiceData.invoice.plan_type || '—'}</p></div>
                                        </div>
                                    </div>

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
                                    <div className={`bg-white rounded-2xl border border-slate-200 p-5 space-y-4 ${invoiceData.returnStatus === 'complete' ? 'opacity-40 pointer-events-none' : ''}`}>
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
                                            <select value={returnReason} onChange={e => setReturnReason(e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                                                <option value="">— Seleccionar motivo —</option>
                                                {RETURN_REASONS.map((r: string) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
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

                                    {/* Botón confirmar — bloqueado si ya fue devuelta completamente */}
                                    {invoiceData.returnStatus === 'complete' ? (
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
                        TAB: POST-LEGALIZACIÓN
                    ══════════════════════════════════════════════════════════ */}
                    {tab === 'legalizacion' && (
                        <div className="max-w-2xl space-y-3">
                            {loading ? (
                                <div className="flex justify-center py-20"><Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" /></div>
                            ) : bodegaReturns.length === 0 ? (
                                <EmptyState msg="No hay devoluciones post-legalización pendientes" />
                            ) : (
                                <>
                                    <input value={searchLegalizacion} onChange={e => setSearchLegalizacion(e.target.value)}
                                        placeholder="Buscar factura..."
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] outline-none focus:border-indigo-400 font-bold mb-1" />
                                    {bodegaReturns
                                        .filter(r => !searchLegalizacion || r.invoiceNumber.toLowerCase().includes(searchLegalizacion.toLowerCase()))
                                        .map(ret => (
                                            <ReturnCard key={ret.invoiceNumber}
                                                invoiceId={ret.invoiceNumber}
                                                conductorName={ret.conductorName}
                                                vehiclePlate={ret.vehiclePlate}
                                                createdAt={ret.legalizadoAt}
                                                externalDocId={ret.externalDocId}
                                                items={ret.items}
                                                isProcessing={processingId === `b-${ret.invoiceNumber}`}
                                                onConfirm={(obs, reason) => handleConfirmBodega(ret, obs, reason)}
                                                type="legalizacion" />
                                        ))}
                                </>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════════
                        TAB: POR APROBAR
                    ══════════════════════════════════════════════════════════ */}
                    {tab === 'aprobacion' && (
                        <div className="max-w-2xl">
                            {!selectedClientId ? (
                                <EmptyState msg="Selecciona un cliente" />
                            ) : (
                                <>
                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 mb-4">
                                        {(['pending', 'batches'] as const).map(bt => (
                                            <button key={bt} onClick={() => setBatchTab(bt)}
                                                className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                                                    ${batchTab === bt ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                                {bt === 'pending' ? `Pendientes (${pendingReturns.length})` : `Lotes (${batches.length})`}
                                            </button>
                                        ))}
                                    </div>

                                    {batchTab === 'pending' && (
                                        loading ? <div className="flex justify-center py-20"><Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" /></div>
                                        : pendingReturns.length === 0 ? <EmptyState msg="No hay devoluciones pendientes de aprobación" />
                                        : (
                                            <>
                                                <div className="space-y-2 mb-4">
                                                    {pendingReturns.map(ret => {
                                                        const sel = selectedReturnIds.has(ret.id);
                                                        const isPart = ret.status === 'EST-17' || ret.status === 'PARCIAL';
                                                        return (
                                                            <label key={ret.id}
                                                                className={`block bg-white border-2 rounded-2xl px-4 py-3 cursor-pointer transition-all
                                                                    ${sel ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
                                                                <div className="flex items-start gap-3">
                                                                    <input type="checkbox" checked={sel}
                                                                        onChange={() => setSelectedReturnIds(prev => {
                                                                            const n = new Set(prev);
                                                                            n.has(ret.id) ? n.delete(ret.id) : n.add(ret.id);
                                                                            return n;
                                                                        })}
                                                                        className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer shrink-0" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="text-[12px] font-black text-slate-900 font-mono">{ret.invoice_id}</span>
                                                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase
                                                                                ${isPart ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                                                                {isPart ? 'Parcial' : 'Completa'}
                                                                            </span>
                                                                        </div>
                                                                        {ret.return_reason && <p className="text-[10px] text-slate-500 mt-0.5">{ret.return_reason}</p>}
                                                                        <p className="text-[8px] text-slate-400 mt-0.5">
                                                                            {new Date(ret.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                                                                            {ret.vehicle_plate && ` · ${ret.vehicle_plate}`}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                {selectedReturnIds.size > 0 && (
                                                    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                            {selectedReturnIds.size} devolución(es) seleccionada(s)
                                                        </p>
                                                        <input value={batchNotes} onChange={e => setBatchNotes(e.target.value)}
                                                            placeholder="Notas del lote (opcional)"
                                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                                        <button onClick={handleCreateBatch} disabled={creatingBatch}
                                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2">
                                                            {creatingBatch ? <><Icons.Loader className="w-3.5 h-3.5 animate-spin" /> Creando…</> : <><Icons.Package className="w-3.5 h-3.5" /> Crear Lote</>}
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    )}

                                    {batchTab === 'batches' && (
                                        batches.length === 0
                                            ? <EmptyState msg="No hay lotes creados aún" />
                                            : <div className="space-y-2">
                                                {batches.map(b => (
                                                    <div key={b.id} className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-[12px] font-black text-slate-900 font-mono">{b.batch_code}</span>
                                                                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase
                                                                        ${b.status === 'aprobado'         ? 'bg-emerald-100 text-emerald-700'
                                                                        : b.status === 'aprobado_parcial' ? 'bg-teal-100 text-teal-700'
                                                                        : b.status === 'enviado'          ? 'bg-indigo-100 text-indigo-700'
                                                                        : 'bg-amber-100 text-amber-700'}`}>
                                                                        {b.status}
                                                                    </span>
                                                                </div>
                                                                {b.notes && <p className="text-[9px] text-slate-500 mt-1">📝 {b.notes}</p>}
                                                                <p className="text-[8px] text-slate-400 mt-1">
                                                                    👤 {b.created_by || '—'} · {new Date(b.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                                                                </p>
                                                                {b.confirmed_at && (
                                                                    <p className="text-[8px] text-emerald-600 font-bold mt-0.5">
                                                                        ✅ Confirmado por {b.confirmed_by_name || 'Proveedor'} · {new Date(b.confirmed_at).toLocaleDateString('es-CO')}
                                                                    </p>
                                                                )}
                                                                {b.email_sent_at && !b.confirmed_at && (
                                                                    <p className="text-[8px] text-indigo-500 font-bold mt-0.5">
                                                                        📧 Email enviado a {b.email_proveedor}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-[10px] font-black text-slate-700">{b.total_items} facturas</p>
                                                                {b.approved_items > 0 && (
                                                                    <p className="text-[8px] text-emerald-600 font-bold">{b.approved_items} aprobadas</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                                                            <span className="text-[8px] text-slate-400 font-mono flex-1">
                                                                <strong className="text-slate-700">{b.batch_code}</strong>
                                                            </span>
                                                            <button onClick={() => navigator.clipboard.writeText(b.batch_code).then(() => showToast('Código copiado'))}
                                                                className="text-[8px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest px-2 py-1 bg-indigo-50 rounded-lg">
                                                                Copiar
                                                            </button>
                                                            {!b.confirmed_at && (
                                                                <button
                                                                    onClick={() => { setEmailModal({ batch: b }); setEmailInput(b.email_proveedor || ''); setNombreInput(''); }}
                                                                    className="text-[8px] font-black text-emerald-600 hover:text-emerald-800 uppercase tracking-widest px-2 py-1 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1">
                                                                    <Icons.Send className="w-3 h-3" />
                                                                    {b.email_sent_at ? 'Reenviar' : 'Enviar Email'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

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
                                <button onClick={loadHistory} disabled={histLoading}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5">
                                    <Icons.RefreshCw className={`w-3.5 h-3.5 ${histLoading ? 'animate-spin' : ''}`} />
                                    Aplicar
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

        {/* ── Modal envío email al proveedor ───────────────────────────────────── */}
        {emailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-900 to-emerald-900 px-6 py-4 flex items-center justify-between">
                        <div>
                            <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-0.5">Enviar al Proveedor</p>
                            <p className="text-white font-black text-sm font-mono">{emailModal.batch.batch_code}</p>
                        </div>
                        <button onClick={() => setEmailModal(null)} className="text-slate-400 hover:text-white">
                            <Icons.X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre del proveedor</label>
                            <input type="text" value={nombreInput} onChange={e => setNombreInput(e.target.value)}
                                placeholder="Ej: Distribuidora XYZ"
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        </div>
                        <div>
                            <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Email del proveedor *</label>
                            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
                                placeholder="proveedor@empresa.com"
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                onKeyDown={e => e.key === 'Enter' && handleSendEmail()} />
                        </div>
                        <p className="text-[9px] text-slate-400">
                            Se enviará un correo con el detalle del lote y un enlace válido por 7 días para confirmar el recibo.
                        </p>
                        <div className="flex gap-3 pt-1">
                            <button onClick={() => setEmailModal(null)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 hover:bg-slate-50 uppercase tracking-widest">
                                Cancelar
                            </button>
                            <button onClick={handleSendEmail} disabled={sendingEmail}
                                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                {sendingEmail
                                    ? <><Icons.Loader className="w-3.5 h-3.5 animate-spin" /> Enviando…</>
                                    : <><Icons.Send className="w-3.5 h-3.5" /> Enviar Email</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
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
