import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';
import ConciliacionModal from './Logistics/ConciliacionModal';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface DocSummary {
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
}

interface HistoryRow {
    id: number;
    invoice_number: string;
    document_id: string;
    external_doc_id: string;
    vehicle_plate: string;
    conductor_name?: string;
    forma_pago: string;
    valor?: number;
    banco?: string;
    comprobante?: string;
    numero_cheque?: string;
    fecha_pago?: string;
    es_devolucion?: boolean;
    conciliado_at: string;
    conciliado_por_nombre?: string;
    customer_name?: string;
    city?: string;
}

interface Props { user: any; }

type Tab = 'pendientes' | 'conciliado' | 'planilla';

// ── Constantes visuales ───────────────────────────────────────────────────────

const FORMA_COLOR: Record<string, { bg: string; text: string; label: string }> = {
    EFECTIVO:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '💵 Efectivo'      },
    TRANSFERENCIA: { bg: 'bg-blue-100',    text: 'text-blue-700',    label: '📱 Transferencia' },
    CONSIGNACION:  { bg: 'bg-violet-100',  text: 'text-violet-700',  label: '🏦 Consignación'  },
    CHEQUE:        { bg: 'bg-amber-100',   text: 'text-amber-700',   label: '📄 Cheque'        },
    DEVOLUCION:    { bg: 'bg-rose-100',    text: 'text-rose-700',    label: '🔄 Devolución'    },
};

const fmtCOP = (v: number | undefined | null) =>
    v != null && v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '—';

const fmtDate = (d: string | undefined) =>
    d ? new Date(d).toLocaleDateString('es-CO') : '—';

// ── Componente principal ─────────────────────────────────────────────────────

const ConciliacionFacturas: React.FC<Props> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<Tab>('pendientes');

    // ── Tab 1: Pendientes ────────────────────────────────────────────────────
    const [docs, setDocs]               = useState<DocSummary[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState<DocSummary | null>(null);
    const [invoices, setInvoices]       = useState<InvoiceRow[]>([]);
    const [loadingInv, setLoadingInv]   = useState(false);
    const [modalInvoice, setModalInvoice] = useState<InvoiceRow | null>(null);
    const [searchPend, setSearchPend]   = useState('');
    const [showReportInput, setShowReportInput] = useState(false);
    const [reportEmail, setReportEmail] = useState('');
    const [sendingReport, setSendingReport] = useState(false);

    // ── Tab 2: Historial conciliado ──────────────────────────────────────────
    const [history, setHistory]         = useState<HistoryRow[]>([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [histFilters, setHistFilters] = useState({ from: '', to: '', doc_id: '', invoice: '', plate: '' });

    // ── Tab 3: Descarga planilla ─────────────────────────────────────────────
    const [planFilters, setPlanFilters] = useState({ plate: '', from: '', to: '' });
    const [downloading, setDownloading] = useState(false);

    // ── Carga datos Tab 1 ────────────────────────────────────────────────────
    const loadDocs = useCallback(async () => {
        setLoadingDocs(true);
        try {
            const res = await api.getConciliationPending();
            setDocs(res.data || []);
        } catch { toast.error('Error cargando documentos'); }
        finally { setLoadingDocs(false); }
    }, []);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const loadDocDetail = useCallback(async (doc: DocSummary) => {
        setSelectedDoc(doc);
        setInvoices([]);
        setShowReportInput(false);
        setLoadingInv(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            setInvoices(res.invoices || []);
        } catch { toast.error('Error cargando facturas'); }
        finally { setLoadingInv(false); }
    }, []);

    const handleInvoiceSaved = () => {
        if (selectedDoc) loadDocDetail(selectedDoc);
        loadDocs();
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

    const filteredDocs = useMemo(() =>
        docs.filter(d =>
            !searchPend ||
            d.external_doc_id?.toLowerCase().includes(searchPend.toLowerCase()) ||
            d.vehicle_plate?.toLowerCase().includes(searchPend.toLowerCase()) ||
            d.conductor_name?.toLowerCase().includes(searchPend.toLowerCase())
        ), [docs, searchPend]);

    const isComplete = invoices.length > 0 && invoices.every(i => i.forma_pago);
    const totalRecaudado = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);

    // ── Carga datos Tab 2 ────────────────────────────────────────────────────
    const loadHistory = useCallback(async () => {
        setLoadingHist(true);
        try {
            const res = await api.getConciliationHistory(histFilters);
            setHistory(res.data || []);
        } catch { toast.error('Error cargando historial'); }
        finally { setLoadingHist(false); }
    }, [histFilters]);

    useEffect(() => {
        if (activeTab === 'conciliado') loadHistory();
    }, [activeTab, loadHistory]);

    // ── Descarga Tab 3 ───────────────────────────────────────────────────────
    const handleDownload = async () => {
        const { plate, from, to } = planFilters;
        if (!plate.trim() || !from || !to) {
            toast.error('Ingrese placa, fecha desde y fecha hasta');
            return;
        }
        setDownloading(true);
        try {
            const url = api.getConciliationPlanillaUrl(plate.trim(), from, to);
            const resp = await fetch(url, { credentials: 'include' });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Error al generar planilla');
            }
            const blob = await resp.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Planilla_${plate.toUpperCase()}_${from}_${to}.xlsx`;
            link.click();
            URL.revokeObjectURL(link.href);
            toast.success('Planilla descargada');
        } catch (err: any) { toast.error(err.message || 'Error descargando planilla'); }
        finally { setDownloading(false); }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full min-h-screen bg-slate-50">

            {/* ── TABS HEADER ─────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-200 px-4 pt-4 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                        <span className="text-white text-sm">💰</span>
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Conciliación Facturas</h2>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Plan R</p>
                    </div>
                </div>
                <div className="flex gap-1">
                    {([
                        { id: 'pendientes', label: 'Pendientes', icon: '⏳', badge: docs.filter(d => d.pendientes > 0).length },
                        { id: 'conciliado', label: 'Conciliado', icon: '✅', badge: null },
                        { id: 'planilla',   label: 'Descarga Planilla', icon: '📥', badge: null },
                    ] as const).map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-wide border-b-2 transition-all
                                ${activeTab === tab.id
                                    ? 'border-emerald-500 text-emerald-700 bg-emerald-50/60'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                            {tab.badge !== null && tab.badge > 0 && (
                                <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 1 — PENDIENTES                                           */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'pendientes' && (
                <div className="flex flex-1 overflow-hidden">

                    {/* Panel izquierdo — lista documentos */}
                    <div className="w-full sm:w-80 lg:w-96 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                            <div className="relative flex-1">
                                <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <input value={searchPend} onChange={e => setSearchPend(e.target.value)}
                                    placeholder="Buscar doc, placa, conductor…"
                                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500" />
                            </div>
                            <button onClick={loadDocs} disabled={loadingDocs}
                                className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center">
                                <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loadingDocs ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex gap-3">
                            <span className="text-[9px] font-bold text-slate-500">{filteredDocs.length} documentos</span>
                            <span className="text-[9px] text-emerald-600 font-bold ml-auto">{filteredDocs.filter(d => d.pendientes === 0).length} completos</span>
                        </div>
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
                            ) : filteredDocs.map(doc => {
                                const complete = doc.pendientes === 0;
                                const pct = doc.total_invoices > 0 ? Math.round((doc.conciliadas / doc.total_invoices) * 100) : 0;
                                const isActive = selectedDoc?.id === doc.id;
                                return (
                                    <button key={doc.id} onClick={() => loadDocDetail(doc)}
                                        className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-all hover:bg-slate-50
                                            ${isActive ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-black text-slate-900 truncate">{doc.external_doc_id}</p>
                                                <p className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                    🚛 {doc.vehicle_plate || '—'}
                                                    {doc.conductor_name && <span className="ml-1">· {doc.conductor_name}</span>}
                                                </p>
                                                {doc.delivery_date && (
                                                    <p className="text-[8px] text-slate-400 mt-0.5">{fmtDate(doc.delivery_date)}</p>
                                                )}
                                            </div>
                                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase
                                                ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {complete ? '✅ Listo' : `${doc.pendientes} pend.`}
                                            </span>
                                        </div>
                                        <div className="mt-2">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-[8px] text-slate-400">{doc.conciliadas}/{doc.total_invoices} facturas</span>
                                                <span className="text-[8px] font-bold text-slate-500">{pct}%</span>
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
                    </div>

                    {/* Panel derecho — detalle facturas */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        {!selectedDoc ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <p className="text-5xl mb-3">💰</p>
                                    <h3 className="text-base font-black text-slate-400 uppercase">Selecciona un Documento</h3>
                                    <p className="text-xs text-slate-400 mt-1">Elige un documento Plan R para conciliar sus facturas</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Header doc seleccionado */}
                                <div className="bg-white border-b border-slate-100 px-6 py-4 flex-shrink-0">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-black text-slate-900 uppercase">{selectedDoc.external_doc_id}</h3>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase
                                                    ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {isComplete ? '✅ Completo' : `${invoices.filter(i => !i.forma_pago).length} pendientes`}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                🚛 {selectedDoc.vehicle_plate}
                                                {selectedDoc.conductor_name && ` · ${selectedDoc.conductor_name}`}
                                                {selectedDoc.delivery_date && ` · ${fmtDate(selectedDoc.delivery_date)}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {totalRecaudado > 0 && (
                                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                                                    <p className="text-[8px] text-emerald-600 font-bold uppercase">Total Recaudado</p>
                                                    <p className="text-sm font-black text-emerald-800">{fmtCOP(totalRecaudado)}</p>
                                                </div>
                                            )}
                                            {isComplete && (
                                                <button onClick={() => setShowReportInput(v => !v)}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                                    <Icons.Send className="w-3.5 h-3.5" /> Enviar Informe
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {showReportInput && (
                                        <div className="mt-3 flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                                            <input type="email" value={reportEmail} onChange={e => setReportEmail(e.target.value)}
                                                placeholder="correo@ejemplo.com"
                                                className="flex-1 bg-transparent text-[11px] outline-none text-slate-900 placeholder:text-slate-400"
                                                onKeyDown={e => { if (e.key === 'Enter') handleSendReport(); }} />
                                            <button onClick={handleSendReport} disabled={sendingReport || !reportEmail.trim()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase transition-all disabled:opacity-50">
                                                {sendingReport ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Send className="w-3 h-3" />}
                                                Enviar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Lista facturas */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                                    {loadingInv ? (
                                        <div className="flex items-center justify-center h-32">
                                            <Icons.Loader className="w-5 h-5 animate-spin text-emerald-500" />
                                        </div>
                                    ) : invoices.length === 0 ? (
                                        <div className="text-center py-10">
                                            <p className="text-2xl mb-2">📄</p>
                                            <p className="text-xs text-slate-400 font-bold">Sin facturas en este documento</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Resumen formas de pago */}
                                            {invoices.some(i => i.forma_pago) && (
                                                <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Resumen de Recaudo</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(
                                                            invoices.reduce((acc, inv) => {
                                                                if (!inv.forma_pago) return acc;
                                                                acc[inv.forma_pago] = (acc[inv.forma_pago] || 0) + (Number(inv.valor) || 0);
                                                                return acc;
                                                            }, {} as Record<string, number>)
                                                        ).map(([fp, total]) => {
                                                            const cfg = FORMA_COLOR[fp] || { bg: 'bg-slate-100', text: 'text-slate-700', label: fp };
                                                            return (
                                                                <div key={fp} className={`${cfg.bg} rounded-xl px-3 py-2`}>
                                                                    <p className={`text-[8px] font-bold ${cfg.text}`}>{cfg.label}</p>
                                                                    <p className={`text-sm font-black ${cfg.text}`}>{fmtCOP(total)}</p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {invoices.map(inv => {
                                                const conciliada = !!inv.forma_pago;
                                                const cfg = inv.forma_pago ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago }) : null;
                                                return (
                                                    <div key={inv.invoice_number}
                                                        className={`bg-white rounded-2xl border-2 transition-all p-4 ${conciliada ? 'border-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}>
                                                        <div className="flex items-start gap-3">
                                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${conciliada ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                                                <span className="text-base">{conciliada ? '✅' : '⏳'}</span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                    {cfg && <span className={`${cfg.bg} ${cfg.text} text-[8px] font-black px-2 py-0.5 rounded-full`}>{cfg.label}</span>}
                                                                    {inv.es_devolucion && <span className="bg-rose-100 text-rose-700 text-[8px] font-black px-2 py-0.5 rounded-full">🔄 Devolución</span>}
                                                                </div>
                                                                {inv.customer_name && <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>}
                                                                {(inv.city || inv.address) && (
                                                                    <p className="text-[8px] text-slate-400 mt-0.5 truncate">📍 {[inv.city, inv.address].filter(Boolean).join(' — ')}</p>
                                                                )}
                                                                {conciliada && (
                                                                    <div className="mt-2 flex flex-wrap gap-3 text-[8px] text-slate-500">
                                                                        {inv.valor != null && inv.valor > 0 && <span className="font-black text-emerald-700">{fmtCOP(inv.valor)}</span>}
                                                                        {inv.banco && <span>🏦 {inv.banco}</span>}
                                                                        {inv.comprobante && <span>📋 {inv.comprobante}</span>}
                                                                        {inv.fecha_pago && <span>📅 {fmtDate(inv.fecha_pago)}</span>}
                                                                        {inv.conciliado_por_nombre && <span className="text-slate-400">por {inv.conciliado_por_nombre}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button onClick={() => setModalInvoice(inv)}
                                                                className={`shrink-0 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all
                                                                    ${conciliada ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                                                {conciliada ? 'Editar' : 'Conciliar'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 2 — CONCILIADO (HISTORIAL)                               */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'conciliado' && (
                <div className="flex flex-col flex-1 overflow-hidden">

                    {/* Filtros */}
                    <div className="bg-white border-b border-slate-100 px-4 py-3 flex-shrink-0">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            <div>
                                <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Desde</label>
                                <input type="date" value={histFilters.from}
                                    onChange={e => setHistFilters(f => ({ ...f, from: e.target.value }))}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Hasta</label>
                                <input type="date" value={histFilters.to}
                                    onChange={e => setHistFilters(f => ({ ...f, to: e.target.value }))}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Documento L</label>
                                <input type="text" value={histFilters.doc_id} placeholder="LO109..."
                                    onChange={e => setHistFilters(f => ({ ...f, doc_id: e.target.value }))}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Factura</label>
                                <input type="text" value={histFilters.invoice} placeholder="FAC-..."
                                    onChange={e => setHistFilters(f => ({ ...f, invoice: e.target.value }))}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Placa</label>
                                <input type="text" value={histFilters.plate} placeholder="LKM502..."
                                    onChange={e => setHistFilters(f => ({ ...f, plate: e.target.value }))}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-emerald-500" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <button onClick={loadHistory} disabled={loadingHist}
                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                {loadingHist ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Search className="w-3 h-3" />}
                                Buscar
                            </button>
                            <button onClick={() => { setHistFilters({ from: '', to: '', doc_id: '', invoice: '', plate: '' }); setHistory([]); }}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase transition-all">
                                Limpiar
                            </button>
                            {history.length > 0 && (
                                <span className="ml-auto text-[9px] text-slate-500 font-bold">{history.length} registros</span>
                            )}
                        </div>
                    </div>

                    {/* Tabla historial */}
                    <div className="flex-1 overflow-auto custom-scrollbar p-4">
                        {loadingHist ? (
                            <div className="flex items-center justify-center h-40">
                                <Icons.Loader className="w-6 h-6 animate-spin text-emerald-500" />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center">
                                <p className="text-3xl mb-2">🔍</p>
                                <p className="text-xs font-bold text-slate-400">Use los filtros y presione Buscar</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="bg-slate-900 text-white">
                                                {['Documento L', 'Factura', 'Cliente', 'Ciudad', 'Placa', 'Conductor', 'Forma Pago', 'Valor', 'Banco', 'Comprobante', 'Fecha Pago', 'Conciliado Por', 'Fecha Conc.'].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-left font-black uppercase tracking-wide text-[8px] whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((row, i) => {
                                                const cfg = FORMA_COLOR[row.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: row.forma_pago };
                                                return (
                                                    <tr key={row.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                                        <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">{row.external_doc_id}</td>
                                                        <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{row.invoice_number}</td>
                                                        <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{row.customer_name || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.city || '—'}</td>
                                                        <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{row.vehicle_plate || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.conductor_name || '—'}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`${cfg.bg} ${cfg.text} px-2 py-0.5 rounded-full text-[8px] font-black whitespace-nowrap`}>{cfg.label}</span>
                                                        </td>
                                                        <td className="px-3 py-2 font-black text-emerald-700 whitespace-nowrap">{fmtCOP(row.valor)}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.banco || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.comprobante || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(row.fecha_pago)}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.conciliado_por_nombre || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtDate(row.conciliado_at)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 3 — DESCARGA DE PLANILLA                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'planilla' && (
                <div className="flex flex-col flex-1 items-center justify-start pt-10 px-4">
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm w-full max-w-lg p-8">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">📥</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Descarga de Planilla</h3>
                            <p className="text-xs text-slate-500 mt-1">Descarga la ruta completa por placa y rango de fechas en Excel</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Placa del vehículo <span className="text-rose-500">*</span></label>
                                <input type="text" value={planFilters.plate}
                                    onChange={e => setPlanFilters(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                                    placeholder="Ej: LKM502"
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 transition-all uppercase placeholder:normal-case placeholder:font-normal" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha Desde <span className="text-rose-500">*</span></label>
                                    <input type="date" value={planFilters.from}
                                        onChange={e => setPlanFilters(f => ({ ...f, from: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha Hasta <span className="text-rose-500">*</span></label>
                                    <input type="date" value={planFilters.to}
                                        onChange={e => setPlanFilters(f => ({ ...f, to: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all" />
                                </div>
                            </div>

                            <button onClick={handleDownload} disabled={downloading}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 mt-2">
                                {downloading
                                    ? <><Icons.Loader className="w-4 h-4 animate-spin" /> Generando…</>
                                    : <><Icons.Download className="w-4 h-4" /> Descargar Excel</>
                                }
                            </button>
                        </div>

                        <div className="mt-6 bg-slate-50 rounded-2xl p-4">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">El Excel incluye:</p>
                            <ul className="space-y-1">
                                {['Planilla Ruta — todos los documentos y facturas de la placa en el período', 'Resumen Pago — totales por forma de pago (efectivo, transferencia, etc.)'].map(t => (
                                    <li key={t} className="flex items-start gap-2 text-[10px] text-slate-600">
                                        <span className="text-emerald-500 mt-0.5">✓</span> {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal conciliación */}
            {modalInvoice && selectedDoc && (
                <ConciliacionModal
                    isOpen={!!modalInvoice}
                    onClose={() => setModalInvoice(null)}
                    invoice={modalInvoice}
                    documentId={selectedDoc.id}
                    currentUserId={user?.id || ''}
                    vehiclePlate={selectedDoc.vehicle_plate}
                    conductorId={selectedDoc.conductor_id}
                    conductorName={selectedDoc.conductor_name}
                    onSaved={handleInvoiceSaved}
                />
            )}
        </div>
    );
};

export default ConciliacionFacturas;
