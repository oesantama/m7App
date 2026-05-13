import React from 'react';
import { api } from '../../services/api';
import { ReturnCard, RETURN_REASONS } from './ReturnCard';
import { Icons } from '../../constants';

interface Client { id: string; name: string; }
type Tab = 'rutas' | 'legalizacion' | 'aprobacion';

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface BodegaReturn {
    invoiceNumber: string; documentId: string | number;
    conductorName?: string; vehiclePlate?: string;
    legalizadoAt: string; externalDocId?: string; items: any[];
}
interface ActivePlate {
    plate: string; vehicle_id: string; driver_name?: string; invoice_count: number;
}
interface PlateInvoice {
    invoice_id: string; customer_name?: string; address?: string;
    city?: string; item_count: number; total_qty: number; items: any[];
}
interface PendingReturn {
    id: number; invoice_id: string; return_reason?: string; notes?: string;
    status: string; created_at: string; vehicle_plate?: string;
    driver_name?: string; client_id?: string; external_doc_id?: string; items: any[];
}
interface ApprovalBatch {
    id: number; batch_code: string; client_id: string; notes?: string;
    status: string; created_by?: string; created_at: string; sent_at?: string;
    total_items: number; approved_items: number;
}

// ─── STEP DE REGISTRO DESDE RUTA ─────────────────────────────────────────────
type RouteStep = 'plate' | 'invoice' | 'form';

interface RouteReturnForm {
    plate: string; vehicleId: string; driverName: string;
    invoice: PlateInvoice | null;
    returnType: 'COMPLETA' | 'PARCIAL';
    returnReason: string; notes: string;
    itemQtys: Record<string, number>; // article_id → qty a devolver
}

const EMPTY_FORM: RouteReturnForm = {
    plate: '', vehicleId: '', driverName: '',
    invoice: null, returnType: 'COMPLETA', returnReason: '', notes: '', itemQtys: {},
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
const DevolucionesBodega: React.FC<{ user: any }> = ({ user }) => {
    const [tab, setTab]               = React.useState<Tab>('rutas');
    const [loading, setLoading]       = React.useState(false);
    const [toast, setToast]           = React.useState<{ msg: string; ok: boolean } | null>(null);

    // Client selector
    const [clients, setClients]           = React.useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = React.useState<string>('');
    const [clientsReady, setClientsReady] = React.useState(false);

    // Tab: Post-Legalización
    const [bodegaReturns, setBodegaReturns]   = React.useState<BodegaReturn[]>([]);
    const [processingId, setProcessingId]     = React.useState<string | null>(null);

    // Tab: De Rutas (flujo multi-step)
    const [routeStep, setRouteStep]           = React.useState<RouteStep>('plate');
    const [activePlates, setActivePlates]     = React.useState<ActivePlate[]>([]);
    const [plateInvoices, setPlateInvoices]   = React.useState<PlateInvoice[]>([]);
    const [routeForm, setRouteForm]           = React.useState<RouteReturnForm>(EMPTY_FORM);
    const [savingRoute, setSavingRoute]       = React.useState(false);
    const [plateSearch, setPlateSearch]       = React.useState('');

    // Tab: Aprobación
    const [pendingReturns, setPendingReturns] = React.useState<PendingReturn[]>([]);
    const [batches, setBatches]               = React.useState<ApprovalBatch[]>([]);
    const [selectedReturnIds, setSelectedReturnIds] = React.useState<Set<number>>(new Set());
    const [batchNotes, setBatchNotes]         = React.useState('');
    const [creatingBatch, setCreatingBatch]   = React.useState(false);
    const [batchTab, setBatchTab]             = React.useState<'pending' | 'batches'>('pending');

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Clientes ─────────────────────────────────────────────────────────────
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

    // ── Carga inicial al cambiar cliente ─────────────────────────────────────
    const loadAll = React.useCallback(async (clientId: string) => {
        if (!clientId) return;
        setLoading(true);
        try {
            const [br, ap, pl, bt] = await Promise.all([
                api.getPendingBodegaReturns(clientId).catch(() => ({ data: [] })),
                api.getApprovalPendingReturns(clientId).catch(() => ({ data: [] })),
                api.getRouteActivePlates(clientId).catch(() => ({ data: [] })),
                api.getApprovalBatches(clientId).catch(() => ({ data: [] })),
            ]);
            setBodegaReturns(Array.isArray(br) ? br : (br?.data ?? []));
            setPendingReturns(ap?.data ?? []);
            setActivePlates(pl?.data ?? []);
            setBatches(bt?.data ?? []);
        } finally { setLoading(false); }
    }, []);

    React.useEffect(() => {
        if (selectedClientId) {
            setBodegaReturns([]); setPendingReturns([]); setActivePlates([]); setBatches([]);
            setRouteStep('plate'); setRouteForm(EMPTY_FORM);
            loadAll(selectedClientId);
        }
    }, [selectedClientId, loadAll]);

    // ── Confirmar devolución Post-Legalización ────────────────────────────────
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

    // ── Flujo De Rutas ────────────────────────────────────────────────────────
    const handleSelectPlate = async (p: ActivePlate) => {
        setRouteForm({ ...EMPTY_FORM, plate: p.plate, vehicleId: p.vehicle_id, driverName: p.driver_name || '' });
        setPlateInvoices([]);
        setRouteStep('invoice');
        setLoading(true);
        try {
            const res = await api.getRoutePlateInvoices(p.plate, selectedClientId);
            setPlateInvoices(res?.data ?? []);
        } catch { showToast('Error cargando facturas', false); }
        finally { setLoading(false); }
    };

    const handleSelectInvoice = (inv: PlateInvoice) => {
        const qtys: Record<string, number> = {};
        inv.items.forEach((it: any) => { qtys[it.article_id] = it.expected_qty || 0; });
        setRouteForm(f => ({ ...f, invoice: inv, itemQtys: qtys, returnType: 'COMPLETA' }));
        setRouteStep('form');
    };

    const handleSaveRouteReturn = async () => {
        if (!routeForm.invoice || !routeForm.returnReason) {
            showToast('Seleccione motivo de devolución', false); return;
        }
        setSavingRoute(true);
        try {
            const items = routeForm.invoice.items.map((it: any) => ({
                article_id: it.article_id,
                article_name: it.article_name,
                return_qty: routeForm.returnType === 'COMPLETA'
                    ? (it.expected_qty || 0)
                    : (routeForm.itemQtys[it.article_id] ?? 0),
                delivered_qty: routeForm.returnType === 'COMPLETA'
                    ? 0
                    : Math.max(0, (it.expected_qty || 0) - (routeForm.itemQtys[it.article_id] ?? 0)),
                unit: it.unit || 'und',
            }));
            await api.registerRouteReturn({
                invoiceId: routeForm.invoice.invoice_id,
                vehiclePlate: routeForm.plate,
                returnType: routeForm.returnType,
                returnReason: routeForm.returnReason,
                notes: routeForm.notes,
                items,
                createdBy: user?.id,
            });
            showToast(`Devolución de ${routeForm.invoice.invoice_id} registrada`);
            setRouteForm(EMPTY_FORM);
            setRouteStep('plate');
            loadAll(selectedClientId);
        } catch (e: any) { showToast(e?.message ?? 'Error al guardar', false); }
        finally { setSavingRoute(false); }
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
            setSelectedReturnIds(new Set());
            setBatchNotes('');
            loadAll(selectedClientId);
        } catch (e: any) { showToast(e?.message ?? 'Error al crear lote', false); }
        finally { setCreatingBatch(false); }
    };

    const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';
    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'rutas',       label: 'De Rutas',          count: activePlates.length },
        { id: 'legalizacion',label: 'Post-Legalización', count: bodegaReturns.length },
        { id: 'aprobacion',  label: 'Por Aprobar',       count: pendingReturns.length },
    ];

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-[11px] font-black text-white transition-all
                    ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.ok ? '✅' : '❌'} {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="mb-5">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Devoluciones — Bodega</h1>
                <p className="text-[11px] text-slate-500 mt-0.5">Confirma recepción física de mercancía devuelta</p>
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

            {!selectedClientId ? (
                <EmptyState msg="Selecciona un cliente" />
            ) : (
                <>
                    {/* Tabs */}
                    <div className="flex gap-2 mb-5">
                        {tabs.map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5
                                    ${tab === t.id ? 'bg-slate-900 text-white shadow' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                {t.label}
                                {t.count > 0 && (
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

                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* ── TAB: DE RUTAS ── */}
                            {tab === 'rutas' && (
                                <div className="max-w-2xl">
                                    {/* Breadcrumb */}
                                    <div className="flex items-center gap-2 mb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <button onClick={() => { setRouteStep('plate'); setRouteForm(EMPTY_FORM); }}
                                            className={routeStep !== 'plate' ? 'text-indigo-600 hover:underline' : ''}>
                                            Placa
                                        </button>
                                        {routeStep !== 'plate' && <>
                                            <span>›</span>
                                            <button onClick={() => { setRouteStep('invoice'); }}
                                                className={routeStep === 'form' ? 'text-indigo-600 hover:underline' : ''}>
                                                Factura
                                            </button>
                                        </>}
                                        {routeStep === 'form' && <>
                                            <span>›</span><span className="text-slate-600">Registrar</span>
                                        </>}
                                    </div>

                                    {/* Step 1: Seleccionar placa */}
                                    {routeStep === 'plate' && (
                                        activePlates.length === 0
                                            ? <EmptyState msg="No hay vehículos activos en ruta" />
                                            : <>
                                                <input
                                                    value={plateSearch}
                                                    onChange={e => setPlateSearch(e.target.value)}
                                                    placeholder="Buscar placa o conductor..."
                                                    className="w-full mb-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] outline-none focus:border-indigo-400 font-bold"
                                                />
                                                <div className="grid gap-2">
                                                    {activePlates
                                                        .filter(p => {
                                                            const q = plateSearch.toLowerCase();
                                                            return !q || p.plate.toLowerCase().includes(q) || (p.driver_name || '').toLowerCase().includes(q);
                                                        })
                                                        .map(p => (
                                                            <button key={p.plate} onClick={() => handleSelectPlate(p)}
                                                                className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left">
                                                                <div>
                                                                    <p className="text-[13px] font-black text-slate-900">{p.plate}</p>
                                                                    {p.driver_name && <p className="text-[10px] text-slate-500 mt-0.5">👤 {p.driver_name}</p>}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[9px] bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-full">
                                                                        {p.invoice_count} fact.
                                                                    </span>
                                                                    <Icons.ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
                                                                </div>
                                                            </button>
                                                        ))}
                                                </div>
                                            </>
                                    )}

                                    {/* Step 2: Seleccionar factura */}
                                    {routeStep === 'invoice' && (
                                        plateInvoices.length === 0
                                            ? <EmptyState msg="No hay facturas en ruta para esta placa" />
                                            : <div className="grid gap-2">
                                                {plateInvoices.map(inv => (
                                                    <button key={inv.invoice_id} onClick={() => handleSelectInvoice(inv)}
                                                        className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left">
                                                        <div>
                                                            <p className="text-[12px] font-black text-slate-900">{inv.invoice_id}</p>
                                                            {inv.customer_name && <p className="text-[9px] text-slate-500 mt-0.5">{inv.customer_name}</p>}
                                                            {inv.address && <p className="text-[8px] text-slate-400">{inv.address}{inv.city ? `, ${inv.city}` : ''}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[9px] bg-slate-100 text-slate-600 font-black px-2 py-0.5 rounded-full">{inv.item_count} art.</span>
                                                            <Icons.ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                    )}

                                    {/* Step 3: Formulario de devolución */}
                                    {routeStep === 'form' && routeForm.invoice && (
                                        <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 space-y-4">
                                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                                <div>
                                                    <p className="text-[12px] font-black text-slate-900">{routeForm.invoice.invoice_id}</p>
                                                    <p className="text-[9px] text-slate-500">🚛 {routeForm.plate} · 👤 {routeForm.driverName || '—'}</p>
                                                </div>
                                            </div>

                                            {/* Tipo de devolución */}
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de Devolución</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {(['COMPLETA', 'PARCIAL'] as const).map(t => (
                                                        <button key={t} onClick={() => setRouteForm(f => ({ ...f, returnType: t }))}
                                                            className={`py-2.5 rounded-xl border-2 text-[10px] font-black uppercase transition-all
                                                                ${routeForm.returnType === t
                                                                    ? t === 'COMPLETA' ? 'bg-rose-50 border-rose-400 text-rose-700' : 'bg-orange-50 border-orange-400 text-orange-700'
                                                                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                                            {t === 'COMPLETA' ? '📦 Completa' : '⚠️ Parcial'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Cantidades parciales */}
                                            {routeForm.returnType === 'PARCIAL' && (
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Cantidad a Devolver por Artículo</p>
                                                    <div className="space-y-2">
                                                        {routeForm.invoice.items.map((it: any) => (
                                                            <div key={it.article_id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[10px] font-black text-slate-700 truncate">{it.article_id}</p>
                                                                    {it.article_name && <p className="text-[8px] text-slate-400">{it.article_name}</p>}
                                                                    <p className="text-[8px] text-slate-400">Esperado: {it.expected_qty} {it.unit}</p>
                                                                </div>
                                                                <input
                                                                    type="number" min={0} max={it.expected_qty}
                                                                    value={routeForm.itemQtys[it.article_id] ?? 0}
                                                                    onChange={e => setRouteForm(f => ({
                                                                        ...f, itemQtys: { ...f.itemQtys, [it.article_id]: Math.min(it.expected_qty, Math.max(0, Number(e.target.value))) }
                                                                    }))}
                                                                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-black text-center outline-none focus:border-orange-400"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Motivo */}
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Motivo <span className="text-rose-500">*</span></p>
                                                <select value={routeForm.returnReason}
                                                    onChange={e => setRouteForm(f => ({ ...f, returnReason: e.target.value }))}
                                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-rose-400">
                                                    <option value="">— Seleccionar motivo —</option>
                                                    {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </div>

                                            {/* Notas */}
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Observaciones</p>
                                                <textarea
                                                    value={routeForm.notes}
                                                    onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))}
                                                    placeholder="Detalle adicional..."
                                                    rows={3}
                                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-rose-400 resize-none"
                                                />
                                            </div>

                                            {/* Acciones */}
                                            <div className="flex gap-3 pt-1">
                                                <button onClick={() => setRouteStep('invoice')}
                                                    className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                                                    Atrás
                                                </button>
                                                <button onClick={handleSaveRouteReturn}
                                                    disabled={savingRoute || !routeForm.returnReason}
                                                    className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                                    {savingRoute ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" /> : null}
                                                    Registrar Devolución
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── TAB: POST-LEGALIZACIÓN ── */}
                            {tab === 'legalizacion' && (
                                bodegaReturns.length === 0
                                    ? <EmptyState msg="No hay devoluciones post-legalización pendientes" />
                                    : <div className="grid gap-3 max-w-2xl">
                                        {bodegaReturns.map(ret => (
                                            <ReturnCard
                                                key={ret.invoiceNumber}
                                                type="legalizacion"
                                                invoiceId={ret.invoiceNumber}
                                                conductorName={ret.conductorName}
                                                vehiclePlate={ret.vehiclePlate}
                                                createdAt={ret.legalizadoAt}
                                                externalDocId={ret.externalDocId}
                                                items={ret.items ?? []}
                                                isProcessing={processingId === `b-${ret.invoiceNumber}`}
                                                onConfirm={(obs, reason) => handleConfirmBodega(ret, obs, reason)}
                                            />
                                        ))}
                                    </div>
                            )}

                            {/* ── TAB: POR APROBAR ── */}
                            {tab === 'aprobacion' && (
                                <div className="max-w-2xl space-y-4">
                                    {/* Sub-tabs */}
                                    <div className="flex gap-2">
                                        <button onClick={() => setBatchTab('pending')}
                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5
                                                ${batchTab === 'pending' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                            Pendientes
                                            {pendingReturns.length > 0 && (
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black ${batchTab === 'pending' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                                                    {pendingReturns.length}
                                                </span>
                                            )}
                                        </button>
                                        <button onClick={() => setBatchTab('batches')}
                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5
                                                ${batchTab === 'batches' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                            Lotes Creados
                                            {batches.length > 0 && (
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black ${batchTab === 'batches' ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>
                                                    {batches.length}
                                                </span>
                                            )}
                                        </button>
                                    </div>

                                    {batchTab === 'pending' && (
                                        <>
                                            {pendingReturns.length === 0 ? (
                                                <EmptyState msg="No hay devoluciones pendientes de agrupar" />
                                            ) : (
                                                <>
                                                    {/* Selección y crear lote */}
                                                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                                {selectedReturnIds.size} de {pendingReturns.length} seleccionadas
                                                            </p>
                                                            <div className="flex gap-3">
                                                                <button onClick={() => setSelectedReturnIds(new Set(pendingReturns.map(r => r.id)))}
                                                                    className="text-[8px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest">Todas</button>
                                                                <button onClick={() => setSelectedReturnIds(new Set())}
                                                                    className="text-[8px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">Ninguna</button>
                                                            </div>
                                                        </div>
                                                        <textarea
                                                            value={batchNotes}
                                                            onChange={e => setBatchNotes(e.target.value)}
                                                            placeholder="Notas del lote (ej: devoluciones semana 20)..."
                                                            rows={2}
                                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-indigo-400 resize-none"
                                                        />
                                                        <button onClick={handleCreateBatch}
                                                            disabled={creatingBatch || selectedReturnIds.size === 0}
                                                            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                                            {creatingBatch ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" /> : null}
                                                            Crear Lote de Aprobación ({selectedReturnIds.size})
                                                        </button>
                                                    </div>

                                                    {/* Lista de devoluciones */}
                                                    <div className="space-y-2">
                                                        {pendingReturns.map(ret => {
                                                            const checked = selectedReturnIds.has(ret.id);
                                                            return (
                                                                <label key={ret.id}
                                                                    className={`flex items-start gap-3 bg-white border-2 rounded-2xl px-4 py-3 cursor-pointer transition-all
                                                                        ${checked ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
                                                                    <input type="checkbox" checked={checked} className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0"
                                                                        onChange={() => setSelectedReturnIds(prev => {
                                                                            const next = new Set(prev);
                                                                            next.has(ret.id) ? next.delete(ret.id) : next.add(ret.id);
                                                                            return next;
                                                                        })} />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="text-[11px] font-black text-slate-900">{ret.invoice_id}</span>
                                                                            {ret.external_doc_id && <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{ret.external_doc_id}</span>}
                                                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase
                                                                                ${ret.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                                {ret.status === 'PROCESSED' ? '✅ Recibida' : '⏳ Pendiente'}
                                                                            </span>
                                                                        </div>
                                                                        {ret.vehicle_plate && <p className="text-[9px] text-slate-500 mt-0.5">🚛 {ret.vehicle_plate} · 👤 {ret.driver_name || '—'}</p>}
                                                                        {ret.return_reason && <p className="text-[9px] text-slate-500 mt-0.5">📌 {ret.return_reason}</p>}
                                                                        <p className="text-[8px] text-slate-400 mt-0.5">
                                                                            {new Date(ret.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-[9px] font-black text-slate-500 shrink-0">
                                                                        {(ret.items || []).length} art.
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </>
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
                                                                        ${b.status === 'procesado' ? 'bg-emerald-100 text-emerald-700'
                                                                        : b.status === 'aprobado'  ? 'bg-blue-100 text-blue-700'
                                                                        : b.status === 'enviado'   ? 'bg-indigo-100 text-indigo-700'
                                                                        : 'bg-amber-100 text-amber-700'}`}>
                                                                        {b.status}
                                                                    </span>
                                                                </div>
                                                                {b.notes && <p className="text-[9px] text-slate-500 mt-1">📝 {b.notes}</p>}
                                                                <p className="text-[8px] text-slate-400 mt-1">
                                                                    👤 {b.created_by || '—'} · {new Date(b.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                                                                </p>
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
                                                                ID para Salida Proveedor: <strong className="text-slate-700">{b.batch_code}</strong>
                                                            </span>
                                                            <button onClick={() => navigator.clipboard.writeText(b.batch_code).then(() => showToast('Código copiado'))}
                                                                className="text-[8px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest px-2 py-1 bg-indigo-50 rounded-lg">
                                                                Copiar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
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
