import React from 'react';
import { api } from '../services/api';
import { Icons } from '../constants';

interface Client { id: string; name: string; }

interface StockRow {
    article_id: string;
    sku?: string;
    article_name?: string;
    batch?: string;
    quantity?: number;
    qty?: number;
    unit?: string;
}

interface ReturnItem {
    articleId: string;
    articleName: string;
    batch: string;
    quantity: number;
    unit: string;
    availableQty: number;
    notes: string;
}

interface SupplierReturn {
    id: number;
    client_id: string;
    reference?: string;
    return_reason?: string;
    notes?: string;
    total_items: number;
    total_qty: number;
    status: 'borrador' | 'confirmada';
    created_by?: string;
    created_at: string;
    confirmed_at?: string;
    confirmed_by?: string;
    items?: any[];
}

type View = 'list' | 'new';

const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const SalidaProveedor: React.FC<{ user: any }> = ({ user }) => {
    const [view, setView] = React.useState<View>('list');
    const [clients, setClients] = React.useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = React.useState('');
    const [clientsReady, setClientsReady] = React.useState(false);
    const [returns, setReturns] = React.useState<SupplierReturn[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);

    // Form state
    const [stock, setStock] = React.useState<StockRow[]>([]);
    const [stockLoading, setStockLoading] = React.useState(false);
    const [articleSearch, setArticleSearch] = React.useState('');
    const [formItems, setFormItems] = React.useState<ReturnItem[]>([]);
    const [reference, setReference] = React.useState('');
    const [returnReason, setReturnReason] = React.useState('');
    const [formNotes, setFormNotes] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);

    // Confirm modal
    const [confirmingId, setConfirmingId] = React.useState<number | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    // ── Resolve allowed clients ───────────────────────────────────────────────
    React.useEffect(() => {
        const allowedIds: string[] = user?.clientIds?.length
            ? user.clientIds
            : user?.clientId ? [user.clientId] : [];

        api.getClients().then((all: any[]) => {
            const isAdmin = allowedIds.length === 1 && allowedIds[0] === 'CLI-01';
            const filtered = isAdmin ? all : all.filter((c: any) => allowedIds.includes(c.id));
            const mapped: Client[] = filtered.map((c: any) => ({ id: c.id, name: c.name || c.id }));
            setClients(mapped);
            if (mapped.length === 1) setSelectedClientId(mapped[0].id);
            setClientsReady(true);
        }).catch(() => setClientsReady(true));
    }, [user]);

    const loadReturns = React.useCallback(async (clientId: string) => {
        if (!clientId) return;
        setLoading(true);
        try {
            const res = await api.getSupplierReturns({ clientId });
            setReturns(Array.isArray(res) ? res : (res?.data ?? []));
        } catch { setReturns([]); } finally { setLoading(false); }
    }, []);

    React.useEffect(() => {
        if (selectedClientId) { setReturns([]); loadReturns(selectedClientId); }
    }, [selectedClientId, loadReturns]);

    // Load stock when opening new form
    React.useEffect(() => {
        if (view !== 'new' || !selectedClientId) return;
        setStockLoading(true);
        api.getInventoryStock({ clientId: selectedClientId })
            .then((r: any) => {
                if (Array.isArray(r)) {
                    setStock(r);
                } else if (r?.bodega) {
                    setStock(r.bodega);
                } else {
                    setStock(r?.data ?? []);
                }
            })
            .catch(() => setStock([]))
            .finally(() => setStockLoading(false));
    }, [view, selectedClientId]);

    const filteredStock = stock.filter(s => {
        if (!articleSearch) return true;
        const q = articleSearch.toLowerCase();
        return (s.article_id?.toLowerCase().includes(q)) ||
            (s.article_name?.toLowerCase().includes(q)) ||
            (s.sku?.toLowerCase().includes(q));
    });

    const addItem = (s: StockRow) => {
        const avail = Number(s.quantity ?? s.qty ?? 0);
        if (avail <= 0) { showToast('Sin stock disponible para este artículo', false); return; }
        if (formItems.find(i => i.articleId === s.article_id && i.batch === (s.batch || 'S/L'))) {
            showToast('Artículo ya agregado', false); return;
        }
        setFormItems(prev => [...prev, {
            articleId: s.article_id,
            articleName: s.article_name || s.article_id,
            batch: s.batch || 'S/L',
            quantity: 1,
            unit: s.unit || 'UND',
            availableQty: avail,
            notes: '',
        }]);
        setArticleSearch('');
    };

    const updateItem = (idx: number, field: 'quantity' | 'notes', val: string) => {
        setFormItems(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            if (field === 'quantity') {
                const n = Math.max(1, Math.min(item.availableQty, Number(val) || 1));
                return { ...item, quantity: n };
            }
            return { ...item, notes: val };
        }));
    };

    const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));

    const resetForm = () => {
        setFormItems([]); setReference(''); setReturnReason(''); setFormNotes(''); setArticleSearch('');
    };

    const handleSubmit = async () => {
        if (formItems.length === 0) { showToast('Agrega al menos un artículo', false); return; }
        setSubmitting(true);
        try {
            await api.createSupplierReturn({
                clientId: selectedClientId,
                reference: reference || undefined,
                returnReason: returnReason || undefined,
                notes: formNotes || undefined,
                createdBy: user?.name ?? user?.email ?? 'Bodega',
                items: formItems.map(i => ({
                    article_id: i.articleId,
                    article_name: i.articleName,
                    batch: i.batch,
                    quantity: i.quantity,
                    unit: i.unit,
                    notes: i.notes || undefined,
                })),
            });
            showToast('Salida a proveedor registrada');
            resetForm();
            setView('list');
            loadReturns(selectedClientId);
        } catch (e: any) {
            showToast(e?.message ?? 'Error al registrar', false);
        } finally { setSubmitting(false); }
    };

    const handleConfirm = async (id: number) => {
        setConfirmingId(id);
        try {
            await api.confirmSupplierReturn(id, user?.name ?? user?.email ?? 'Bodega');
            showToast('Salida confirmada');
            setReturns(prev => prev.map(r => r.id === id ? { ...r, status: 'confirmada' } : r));
        } catch (e: any) {
            showToast(e?.message ?? 'Error al confirmar', false);
        } finally { setConfirmingId(null); }
    };

    const selectedClientName = clients.find(c => c.id === selectedClientId)?.name ?? '';

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-[11px] font-black text-white transition-all
                    ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.ok ? '✅' : '❌'} {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">Salida a Proveedor</h1>
                    <p className="text-[11px] text-slate-500 mt-0.5">Registra devoluciones de mercancía hacia el proveedor</p>
                </div>
                {selectedClientId && view === 'list' && (
                    <button onClick={() => { resetForm(); setView('new'); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">
                        <Icons.Plus className="w-3.5 h-3.5" /> Nueva Salida
                    </button>
                )}
                {view === 'new' && (
                    <button onClick={() => { resetForm(); setView('list'); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                        ← Volver al listado
                    </button>
                )}
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
                    <select value={selectedClientId} onChange={e => { setSelectedClientId(e.target.value); setView('list'); }}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-amber-400 transition-all">
                        <option value="">— Seleccionar cliente —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                    </select>
                )}
                {selectedClientName && (
                    <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-700 font-black px-2 py-0.5 rounded-lg uppercase tracking-widest ml-auto shrink-0">
                        {selectedClientName}
                    </span>
                )}
            </div>

            {!selectedClientId ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white rounded-2xl border border-slate-200">
                    <Icons.Package className="w-12 h-12 text-slate-200" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Selecciona un cliente</p>
                </div>
            ) : view === 'new' ? (
                <NewReturnForm
                    stockLoading={stockLoading}
                    filteredStock={filteredStock}
                    articleSearch={articleSearch}
                    setArticleSearch={setArticleSearch}
                    formItems={formItems}
                    setFormItems={setFormItems}
                    reference={reference}
                    setReference={setReference}
                    returnReason={returnReason}
                    setReturnReason={setReturnReason}
                    formNotes={formNotes}
                    setFormNotes={setFormNotes}
                    submitting={submitting}
                    onAddItem={addItem}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    onSubmit={handleSubmit}
                    showToast={showToast}
                />
            ) : (
                <ReturnList
                    returns={returns}
                    loading={loading}
                    confirmingId={confirmingId}
                    onConfirm={handleConfirm}
                    onRefresh={() => loadReturns(selectedClientId)}
                />
            )}
        </div>
    );
};

// ── New Return Form ───────────────────────────────────────────────────────────
const NewReturnForm: React.FC<{
    stockLoading: boolean;
    filteredStock: StockRow[];
    articleSearch: string;
    setArticleSearch: (v: string) => void;
    formItems: ReturnItem[];
    setFormItems: React.Dispatch<React.SetStateAction<ReturnItem[]>>;
    reference: string;
    setReference: (v: string) => void;
    returnReason: string;
    setReturnReason: (v: string) => void;
    formNotes: string;
    setFormNotes: (v: string) => void;
    submitting: boolean;
    onAddItem: (s: StockRow) => void;
    onUpdateItem: (idx: number, field: 'quantity' | 'notes', val: string) => void;
    onRemoveItem: (idx: number) => void;
    onSubmit: () => void;
    showToast: (msg: string, ok?: boolean) => void;
}> = ({ stockLoading, filteredStock, articleSearch, setArticleSearch, formItems, setFormItems,
    reference, setReference, returnReason, setReturnReason, formNotes, setFormNotes,
    submitting, onAddItem, onUpdateItem, onRemoveItem, onSubmit, showToast }) => {

    const [batchCodeSearch, setBatchCodeSearch] = React.useState('');
    const [batchLoading, setBatchLoading]       = React.useState(false);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: article picker */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">1. Seleccionar artículos del inventario bodega</h2>
                <input
                    type="text"
                    value={articleSearch}
                    onChange={e => setArticleSearch(e.target.value)}
                    placeholder="Buscar por ID, nombre o SKU..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[11px] text-slate-700 outline-none focus:border-amber-400 transition-all"
                />
                {stockLoading ? (
                    <div className="flex justify-center py-8">
                        <Icons.Loader className="w-5 h-5 text-slate-400 animate-spin" />
                    </div>
                ) : filteredStock.length === 0 ? (
                    <div className="text-center py-8 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        {articleSearch ? 'Sin resultados' : 'Sin stock en bodega'}
                    </div>
                ) : (
                    <div className="overflow-y-auto max-h-[400px] flex flex-col gap-1.5">
                        {filteredStock.map((s, i) => {
                            const avail = Number(s.quantity ?? s.qty ?? 0);
                            return (
                                <button key={`${s.article_id}-${s.batch ?? i}`}
                                    onClick={() => onAddItem(s)}
                                    disabled={avail <= 0}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2
                                        ${avail > 0
                                            ? 'border-slate-100 hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer'
                                            : 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'}`}>
                                    <div>
                                        <p className="text-[11px] font-black text-slate-800">{s.article_name || s.article_id}</p>
                                        <p className="text-[9px] text-slate-400">ID: {s.article_id}{s.batch && s.batch !== 'S/L' ? ` · Lote: ${s.batch}` : ''}</p>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg shrink-0
                                        ${avail > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                        {avail} {s.unit || 'UND'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Right: form details */}
            <div className="flex flex-col gap-4">
                {/* Header fields */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">2. Datos del despacho</h2>

                    {/* Importar desde lote de aprobación */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                        <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1.5">
                            📋 Importar desde Lote de Aprobación
                        </label>
                        <div className="flex gap-2">
                            <input type="text" value={batchCodeSearch}
                                onChange={e => setBatchCodeSearch(e.target.value.toUpperCase())}
                                placeholder="Ej: DEV-2026-05-12-001"
                                className="flex-1 px-3 py-2 border border-indigo-200 rounded-xl text-[11px] text-slate-700 outline-none focus:border-indigo-500 bg-white font-mono transition-all" />
                            <button
                                disabled={!batchCodeSearch.trim() || batchLoading}
                                onClick={async () => {
                                    if (!batchCodeSearch.trim()) return;
                                    setBatchLoading(true);
                                    try {
                                        const res = await api.getApprovalBatchByCode(batchCodeSearch.trim());
                                        if (!res?.success) throw new Error(res?.error || 'Lote no encontrado');
                                        // Pre-llenar reference y notas
                                        setReference(res.batch.batch_code);
                                        setFormNotes(`Lote aprobación: ${res.batch.batch_code}${res.batch.notes ? ' — ' + res.batch.notes : ''}`);
                                        // Importar artículos de las facturas aprobadas
                                        const importedItems: any[] = [];
                                        for (const bItem of (res.items || [])) {
                                            for (const it of (bItem.items || [])) {
                                                if (it.sku) {
                                                    importedItems.push({
                                                        articleId: it.sku,
                                                        articleName: it.article_name || it.sku,
                                                        batch: 'S/L',
                                                        quantity: it.quantity_returned || 0,
                                                        unit: it.unit || 'und',
                                                        availableQty: it.quantity_returned || 0,
                                                        notes: `Factura ${bItem.invoice_id}`,
                                                    });
                                                }
                                            }
                                        }
                                        if (importedItems.length > 0) setFormItems(prev => [...prev, ...importedItems]);
                                        showToast(`Lote ${res.batch.batch_code} importado — ${importedItems.length} artículos`);
                                        setBatchCodeSearch('');
                                    } catch (e: any) { showToast(e.message || 'Error al importar lote', false); }
                                    finally { setBatchLoading(false); }
                                }}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                {batchLoading ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : null}
                                Cargar
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Referencia / Remisión</label>
                        <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                            placeholder="Ej: REM-2024-001"
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[11px] text-slate-700 outline-none focus:border-amber-400 transition-all" />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Motivo de devolución</label>
                        <select value={returnReason} onChange={e => setReturnReason(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[11px] text-slate-700 bg-white outline-none focus:border-amber-400 transition-all">
                            <option value="">— Seleccionar —</option>
                            <option value="VENCIMIENTO">Vencimiento</option>
                            <option value="AVERIA">Avería / Daño</option>
                            <option value="EXCESO_STOCK">Exceso de stock</option>
                            <option value="RECALL">Retiro de producto</option>
                            <option value="OTRO">Otro</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Observaciones</label>
                        <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)}
                            rows={2} placeholder="Notas adicionales..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[11px] text-slate-700 outline-none focus:border-amber-400 transition-all resize-none" />
                    </div>
                </div>

                {/* Items */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        3. Artículos a enviar {formItems.length > 0 && <span className="text-amber-600">({formItems.length})</span>}
                    </h2>
                    {formItems.length === 0 ? (
                        <p className="text-center py-6 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                            Selecciona artículos del panel izquierdo
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {formItems.map((item, idx) => (
                                <div key={`${item.articleId}-${item.batch}`}
                                    className="border border-slate-100 rounded-xl p-3 flex flex-col gap-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-[11px] font-black text-slate-800">{item.articleName}</p>
                                            <p className="text-[9px] text-slate-400">Lote: {item.batch} · Disp: {item.availableQty} {item.unit}</p>
                                        </div>
                                        <button onClick={() => onRemoveItem(idx)}
                                            className="p-1 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all">
                                            <Icons.X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Cant.</label>
                                        <input type="number" min={1} max={item.availableQty}
                                            value={item.quantity}
                                            onChange={e => onUpdateItem(idx, 'quantity', e.target.value)}
                                            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-[11px] text-slate-700 font-black outline-none focus:border-amber-400 transition-all text-center" />
                                        <input type="text" value={item.notes}
                                            onChange={e => onUpdateItem(idx, 'notes', e.target.value)}
                                            placeholder="Nota del artículo..."
                                            className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-[10px] text-slate-600 outline-none focus:border-amber-400 transition-all" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Submit */}
                <button onClick={onSubmit} disabled={submitting || formItems.length === 0}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                    {submitting
                        ? <><Icons.Loader className="w-4 h-4 animate-spin" /> Registrando...</>
                        : <><Icons.Package className="w-4 h-4" /> Registrar Salida a Proveedor</>}
                </button>
            </div>
        </div>
    );
};

// ── Return List ───────────────────────────────────────────────────────────────
const ReturnList: React.FC<{
    returns: SupplierReturn[];
    loading: boolean;
    confirmingId: number | null;
    onConfirm: (id: number) => void;
    onRefresh: () => void;
}> = ({ returns, loading, confirmingId, onConfirm, onRefresh }) => {
    const [expandedId, setExpandedId] = React.useState<number | null>(null);

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-end">
                <button onClick={onRefresh}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                    <Icons.RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Actualizar</span>
                </button>
            </div>

            {returns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                        <Icons.Package className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Sin salidas registradas</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3 max-w-3xl">
                    {returns.map(r => (
                        <div key={r.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${r.status === 'confirmada' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                    <div>
                                        <p className="text-[12px] font-black text-slate-800">
                                            {r.reference ? `Ref: ${r.reference}` : `Salida #${r.id}`}
                                        </p>
                                        <p className="text-[9px] text-slate-400">
                                            {fmtDate(r.created_at)} · {r.total_items} art. · {r.total_qty} unid.
                                            {r.return_reason ? ` · ${r.return_reason}` : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 ml-auto">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest
                                        ${r.status === 'confirmada' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                        {r.status === 'confirmada' ? 'Confirmada' : 'Borrador'}
                                    </span>
                                    {r.status !== 'confirmada' && (
                                        <button onClick={() => onConfirm(r.id)}
                                            disabled={confirmingId === r.id}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-1">
                                            {confirmingId === r.id
                                                ? <Icons.Loader className="w-3 h-3 animate-spin" />
                                                : '✓'} Confirmar
                                        </button>
                                    )}
                                    {r.items && r.items.length > 0 && (
                                        <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition-all">
                                            <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {expandedId === r.id && r.items && (
                                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                <th className="text-left pb-2">Artículo</th>
                                                <th className="text-left pb-2">Lote</th>
                                                <th className="text-right pb-2">Cant.</th>
                                                <th className="text-left pb-2 pl-3">Nota</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {r.items.map((item: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="py-1.5 font-bold text-slate-700">{item.article_name || item.article_id}</td>
                                                    <td className="py-1.5 text-slate-500">{item.batch || 'S/L'}</td>
                                                    <td className="py-1.5 text-right font-black text-slate-800">{item.quantity} {item.unit || 'UND'}</td>
                                                    <td className="py-1.5 pl-3 text-slate-400 italic">{item.notes || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {r.notes && <p className="mt-2 text-[10px] text-slate-500 italic">Obs: {r.notes}</p>}
                                    {r.confirmed_at && <p className="mt-1 text-[9px] text-emerald-600 font-black">Confirmada: {fmtDate(r.confirmed_at)} por {r.confirmed_by}</p>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SalidaProveedor;
