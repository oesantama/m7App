import React, { useState, useCallback, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface DocNormal {
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
    conductor_name?: string;
    client_id?: string;
}

interface InvoiceRow {
    invoice_number: string;
    customer_name?: string;
    city?: string;
    address?: string;
    item_status?: string;
    conciliation_id?: number;
    forma_pago?: string;
    es_devolucion?: boolean;
}

type EstadoEntrega = 'entregado' | 'parcial' | 'devolucion' | '';

interface Props {
    clientId: string;
    user: any;
}

const fmtDate = (d: string | undefined) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_OPTS: { value: EstadoEntrega; label: string; color: string }[] = [
    { value: 'entregado',  label: '✅ Entregado',  color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { value: 'parcial',    label: '⚠️ Parcial',    color: 'bg-amber-100 text-amber-700 border-amber-300'       },
    { value: 'devolucion', label: '🔄 Devolución', color: 'bg-rose-100 text-rose-700 border-rose-300'          },
];

const SAVED_COLOR: Record<string, string> = {
    entregado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    parcial:    'bg-amber-50 text-amber-700 border-amber-200',
    devolucion: 'bg-rose-50 text-rose-700 border-rose-200',
    DEVOLUCION: 'bg-rose-50 text-rose-700 border-rose-200',
};

const TabPlanNormal: React.FC<Props> = ({ clientId, user }) => {
    const [docs, setDocs]             = useState<DocNormal[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [searchDoc, setSearchDoc]   = useState('');
    const [selectedDoc, setSelectedDoc] = useState<DocNormal | null>(null);

    const [invoices, setInvoices]     = useState<InvoiceRow[]>([]);
    const [loadingInv, setLoadingInv] = useState(false);

    // per-invoice estado selections
    const [estados, setEstados]       = useState<Record<string, EstadoEntrega>>({});
    const [saving, setSaving]         = useState<Record<string, boolean>>({});

    const loadDocs = useCallback(async () => {
        if (!clientId) return;
        setLoadingDocs(true);
        try {
            const res = await api.getConciliationPendingNormal({ clientId });
            setDocs(res.data || []);
        } catch {
            toast.error('Error cargando documentos Plan Normal');
        } finally {
            setLoadingDocs(false);
        }
    }, [clientId]);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const loadInvoices = useCallback(async (doc: DocNormal) => {
        setSelectedDoc(doc);
        setInvoices([]);
        setEstados({});
        setLoadingInv(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            const rows: InvoiceRow[] = res.invoices || [];
            setInvoices(rows);
            // pre-populate already-saved estados
            const init: Record<string, EstadoEntrega> = {};
            rows.forEach(r => {
                if (r.forma_pago === 'DEVOLUCION' || r.es_devolucion) {
                    init[r.invoice_number] = 'devolucion';
                } else if (r.forma_pago === 'PARCIAL') {
                    init[r.invoice_number] = 'parcial';
                } else if (r.conciliation_id) {
                    init[r.invoice_number] = 'entregado';
                }
            });
            setEstados(init);
        } catch {
            toast.error('Error cargando facturas');
        } finally {
            setLoadingInv(false);
        }
    }, []);

    const saveEstado = useCallback(async (inv: InvoiceRow, estado: EstadoEntrega) => {
        if (!selectedDoc || !estado) return;
        setSaving(s => ({ ...s, [inv.invoice_number]: true }));
        try {
            await api.saveConciliation({
                documentId: selectedDoc.id,
                invoiceNumber: inv.invoice_number,
                estadoEntrega: estado,
                conciliadoPor: user?.id,
                usuarioNombre: user?.name,
            });
            setEstados(s => ({ ...s, [inv.invoice_number]: estado }));
            toast.success(`Factura ${inv.invoice_number} → ${estado}`);
            // refresh doc list badge
            loadDocs();
        } catch {
            toast.error('Error guardando estado');
        } finally {
            setSaving(s => ({ ...s, [inv.invoice_number]: false }));
        }
    }, [selectedDoc, user, loadDocs]);

    const filtered = docs.filter(d =>
        !searchDoc ||
        d.external_doc_id?.toLowerCase().includes(searchDoc.toLowerCase()) ||
        d.vehicle_plate?.toLowerCase().includes(searchDoc.toLowerCase())
    );

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── Panel izquierdo: lista documentos ──────────────────────────── */}
            <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
                <div className="p-3 border-b border-slate-100">
                    <input
                        value={searchDoc}
                        onChange={e => setSearchDoc(e.target.value)}
                        placeholder="Buscar documento / placa…"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-violet-400"
                    />
                </div>

                {loadingDocs ? (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <Icons.Loader className="w-5 h-5 text-violet-500 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <span className="text-3xl">📋</span>
                        <p className="text-[10px] font-black uppercase tracking-widest">Sin pendientes</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {filtered.map(doc => {
                            const isSelected = selectedDoc?.id === doc.id;
                            return (
                                <button key={doc.id} onClick={() => loadInvoices(doc)}
                                    className={`w-full text-left px-3 py-2.5 transition-all hover:bg-violet-50 ${isSelected ? 'bg-violet-50 border-l-2 border-violet-500' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-black text-slate-800 truncate">{doc.external_doc_id}</span>
                                        <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                                            {doc.pendientes} pdt
                                        </span>
                                    </div>
                                    <p className="text-[8px] text-slate-500 mt-0.5">
                                        🚛 {doc.vehicle_plate || '—'} · 📅 {fmtDate(doc.created_at)}
                                    </p>
                                    <div className="flex gap-1 mt-1">
                                        <span className="text-[7px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                                            {doc.conciliadas}/{doc.total_invoices} fact.
                                        </span>
                                        {doc.plan_type && (
                                            <span className="text-[7px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-bold truncate max-w-[80px]">
                                                {doc.plan_type}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Panel derecho: facturas ─────────────────────────────────────── */}
            {!selectedDoc ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <span className="text-5xl">📋</span>
                    <p className="text-[13px] font-black uppercase tracking-widest">Selecciona un documento</p>
                    <p className="text-[10px]">para ver sus facturas pendientes</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
                    {/* Header doc */}
                    <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 shrink-0">
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black text-slate-900">{selectedDoc.external_doc_id}</h3>
                            <p className="text-[9px] text-slate-500 font-bold">
                                🚛 {selectedDoc.vehicle_plate || '—'} · 👤 {selectedDoc.conductor_name || '—'} · 📅 {fmtDate(selectedDoc.created_at)}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] font-black bg-violet-100 text-violet-700 px-2 py-1 rounded-xl">
                                {selectedDoc.conciliadas}/{selectedDoc.total_invoices} conciliadas
                            </span>
                            <button onClick={loadDocs}
                                className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                                <Icons.RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                        </div>
                    </div>

                    {/* Instrucción */}
                    <div className="px-5 py-2 bg-violet-50 border-b border-violet-100 shrink-0">
                        <p className="text-[9px] text-violet-700 font-bold">
                            Indica el estado de entrega de cada factura. No se requiere información de pago.
                        </p>
                    </div>

                    {/* Facturas */}
                    {loadingInv ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Icons.Loader className="w-5 h-5 text-violet-500 animate-spin" />
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <span className="text-3xl">📭</span>
                            <p className="text-[10px] font-black uppercase">Sin facturas</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {invoices.map(inv => {
                                const current = estados[inv.invoice_number] || '';
                                const isSaved = !!inv.conciliation_id || !!current;
                                const isBusy  = saving[inv.invoice_number];

                                return (
                                    <div key={inv.invoice_number}
                                        className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 hover:border-slate-300 transition-all">

                                        {/* Invoice info */}
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[11px] font-black text-slate-900">{inv.invoice_number}</span>
                                            {inv.customer_name && (
                                                <p className="text-[8px] text-slate-500 font-bold truncate">{inv.customer_name}</p>
                                            )}
                                            {inv.city && (
                                                <p className="text-[7px] text-slate-400">{inv.city}</p>
                                            )}
                                        </div>

                                        {/* Estado buttons */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {STATUS_OPTS.map(opt => {
                                                const isActive = current === opt.value;
                                                return (
                                                    <button key={opt.value}
                                                        onClick={() => saveEstado(inv, opt.value)}
                                                        disabled={isBusy}
                                                        className={`px-2.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-wide transition-all disabled:opacity-40
                                                            ${isActive
                                                                ? opt.color + ' shadow-sm'
                                                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                        {isBusy && isActive
                                                            ? <Icons.Loader className="w-3 h-3 animate-spin" />
                                                            : opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Saved indicator */}
                                        {isSaved && !isBusy && (
                                            <Icons.Check className={`w-4 h-4 shrink-0 ${
                                                current === 'devolucion' ? 'text-rose-500' :
                                                current === 'parcial'    ? 'text-amber-500' :
                                                'text-emerald-500'
                                            }`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TabPlanNormal;
