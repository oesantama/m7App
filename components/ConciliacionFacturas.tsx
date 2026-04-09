import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';
import ConciliacionModal from './Logistics/ConciliacionModal';

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

interface Props {
    user: any;
}

const FORMA_COLOR: Record<string, { bg: string; text: string; label: string }> = {
    EFECTIVO:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '💵 Efectivo'      },
    TRANSFERENCIA: { bg: 'bg-blue-100',    text: 'text-blue-700',    label: '📱 Transferencia' },
    CONSIGNACION:  { bg: 'bg-violet-100',  text: 'text-violet-700',  label: '🏦 Consignación'  },
    CHEQUE:        { bg: 'bg-amber-100',   text: 'text-amber-700',   label: '📄 Cheque'        },
    DEVOLUCION:    { bg: 'bg-rose-100',    text: 'text-rose-700',    label: '🔄 Devolución'    },
};

const ConciliacionFacturas: React.FC<Props> = ({ user }) => {
    const [docs, setDocs]             = useState<DocSummary[]>([]);
    const [loading, setLoading]       = useState(false);
    const [selectedDoc, setSelectedDoc] = useState<DocSummary | null>(null);
    const [invoices, setInvoices]     = useState<InvoiceRow[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [modalInvoice, setModalInvoice]       = useState<InvoiceRow | null>(null);

    // Report state
    const [reportEmail, setReportEmail] = useState('');
    const [sendingReport, setSendingReport] = useState(false);
    const [showReportInput, setShowReportInput] = useState(false);

    // Filters
    const [search, setSearch] = useState('');

    const loadDocs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.getConciliationPending();
            setDocs(res.data || []);
        } catch (err: any) {
            toast.error('Error cargando documentos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const loadDocDetail = useCallback(async (doc: DocSummary) => {
        setSelectedDoc(doc);
        setInvoices([]);
        setShowReportInput(false);
        setLoadingInvoices(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            setInvoices(res.invoices || []);
        } catch (err: any) {
            toast.error('Error cargando facturas');
        } finally {
            setLoadingInvoices(false);
        }
    }, []);

    const handleInvoiceSaved = (invoiceNumber: string) => {
        // Recargar el detalle y la lista
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
        } catch (err: any) {
            toast.error(err.message || 'Error enviando informe');
        } finally {
            setSendingReport(false);
        }
    };

    const filteredDocs = useMemo(() =>
        docs.filter(d =>
            !search ||
            d.external_doc_id?.toLowerCase().includes(search.toLowerCase()) ||
            d.vehicle_plate?.toLowerCase().includes(search.toLowerCase()) ||
            d.conductor_name?.toLowerCase().includes(search.toLowerCase())
        ), [docs, search]);

    const isComplete = invoices.length > 0 && invoices.every(inv => inv.forma_pago);
    const totalRecaudado = invoices.reduce((sum, inv) => sum + (Number(inv.valor) || 0), 0);

    return (
        <div className="flex h-full min-h-screen bg-slate-50">

            {/* ── LEFT PANEL — Lista de documentos ─────────────────────── */}
            <div className="w-full sm:w-80 lg:w-96 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col">

                {/* Header panel izquierdo */}
                <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center">
                            <span className="text-white text-sm">💰</span>
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Conciliación</h2>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Plan R — Facturas por conciliar</p>
                        </div>
                        <button onClick={loadDocs} disabled={loading}
                            className="ml-auto w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center transition-all">
                            <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="relative">
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar documento, placa, conductor..."
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500 transition-all"
                        />
                    </div>
                </div>

                {/* Contador */}
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex gap-3">
                    <span className="text-[9px] font-bold text-slate-500">
                        {filteredDocs.length} documentos
                    </span>
                    <span className="text-[9px] text-emerald-600 font-bold ml-auto">
                        {filteredDocs.filter(d => d.pendientes === 0).length} completos
                    </span>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <Icons.Loader className="w-5 h-5 animate-spin text-emerald-500" />
                        </div>
                    ) : filteredDocs.length === 0 ? (
                        <div className="text-center py-12 px-4">
                            <p className="text-3xl mb-2">📋</p>
                            <p className="text-xs font-bold text-slate-500">No hay documentos Plan R pendientes</p>
                        </div>
                    ) : filteredDocs.map(doc => {
                        const complete = doc.pendientes === 0;
                        const pct = doc.total_invoices > 0 ? Math.round((doc.conciliadas / doc.total_invoices) * 100) : 0;
                        const isActive = selectedDoc?.id === doc.id;

                        return (
                            <button key={doc.id} onClick={() => loadDocDetail(doc)}
                                className={`w-full text-left px-5 py-4 border-b border-slate-50 transition-all hover:bg-slate-50
                                    ${isActive ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-black text-slate-900 truncate">{doc.external_doc_id}</p>
                                        <p className="text-[9px] text-slate-500 font-bold mt-0.5">
                                            🚛 {doc.vehicle_plate || '—'}
                                            {doc.conductor_name && <span className="ml-1.5">· {doc.conductor_name}</span>}
                                        </p>
                                        {doc.delivery_date && (
                                            <p className="text-[8px] text-slate-400 mt-0.5">
                                                {new Date(doc.delivery_date).toLocaleDateString('es-CO')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase
                                            ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {complete ? '✅ Listo' : `${doc.pendientes} pend.`}
                                        </span>
                                    </div>
                                </div>

                                {/* Barra de progreso */}
                                <div className="mt-2">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[8px] text-slate-400">{doc.conciliadas}/{doc.total_invoices} facturas</span>
                                        <span className="text-[8px] font-bold text-slate-500">{pct}%</span>
                                    </div>
                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── RIGHT PANEL — Detalle de facturas ────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0">

                {!selectedDoc ? (
                    /* Empty state */
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-6xl mb-4">💰</p>
                            <h3 className="text-lg font-black text-slate-400 uppercase tracking-tight">Selecciona un Documento</h3>
                            <p className="text-xs text-slate-400 mt-1">Elige un documento Plan R de la lista para conciliar sus facturas</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header documento seleccionado */}
                        <div className="bg-white border-b border-slate-100 px-6 py-4">
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
                                        {selectedDoc.delivery_date && ` · ${new Date(selectedDoc.delivery_date).toLocaleDateString('es-CO')}`}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Total recaudado */}
                                    {totalRecaudado > 0 && (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                                            <p className="text-[8px] text-emerald-600 font-bold uppercase">Total Recaudado</p>
                                            <p className="text-sm font-black text-emerald-800">
                                                ${totalRecaudado.toLocaleString('es-CO')}
                                            </p>
                                        </div>
                                    )}

                                    {/* Botón informe — solo si está completo */}
                                    {isComplete && (
                                        <button
                                            onClick={() => setShowReportInput(v => !v)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <Icons.Send className="w-3.5 h-3.5" />
                                            Enviar Informe
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Input de correo para envío */}
                            {showReportInput && (
                                <div className="mt-3 flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                                    <input
                                        type="email"
                                        value={reportEmail}
                                        onChange={e => setReportEmail(e.target.value)}
                                        placeholder="correo@ejemplo.com"
                                        className="flex-1 bg-transparent text-[11px] outline-none text-slate-900 placeholder:text-slate-400"
                                        onKeyDown={e => { if (e.key === 'Enter') handleSendReport(); }}
                                    />
                                    <button
                                        onClick={handleSendReport}
                                        disabled={sendingReport || !reportEmail.trim()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase transition-all disabled:opacity-50"
                                    >
                                        {sendingReport
                                            ? <Icons.Loader className="w-3 h-3 animate-spin" />
                                            : <Icons.Send className="w-3 h-3" />
                                        }
                                        Enviar
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Tabla de facturas */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                            {loadingInvoices ? (
                                <div className="flex items-center justify-center h-40">
                                    <Icons.Loader className="w-5 h-5 animate-spin text-emerald-500" />
                                </div>
                            ) : invoices.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-2xl mb-2">📄</p>
                                    <p className="text-xs text-slate-400 font-bold">No se encontraron facturas en este documento</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {/* Resumen por forma de pago */}
                                    {invoices.some(i => i.forma_pago) && (
                                        <div className="bg-white border border-slate-100 rounded-2xl p-4 mb-4">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Resumen de Recaudo</p>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(
                                                    invoices.reduce((acc, inv) => {
                                                        if (!inv.forma_pago) return acc;
                                                        const fp = inv.forma_pago;
                                                        acc[fp] = (acc[fp] || 0) + (Number(inv.valor) || 0);
                                                        return acc;
                                                    }, {} as Record<string, number>)
                                                ).map(([fp, total]) => {
                                                    const cfg = FORMA_COLOR[fp] || { bg: 'bg-slate-100', text: 'text-slate-700', label: fp };
                                                    return (
                                                        <div key={fp} className={`${cfg.bg} rounded-xl px-3 py-2`}>
                                                            <p className={`text-[8px] font-bold ${cfg.text}`}>{cfg.label}</p>
                                                            <p className={`text-sm font-black ${cfg.text}`}>
                                                                ${Number(total).toLocaleString('es-CO')}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Filas de facturas */}
                                    {invoices.map(inv => {
                                        const conciliada = !!inv.forma_pago;
                                        const cfg = inv.forma_pago ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago }) : null;

                                        return (
                                            <div key={inv.invoice_number}
                                                className={`bg-white rounded-2xl border-2 transition-all p-4
                                                    ${conciliada ? 'border-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    {/* Estado visual */}
                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5
                                                        ${conciliada ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                                        <span className="text-base">{conciliada ? '✅' : '⏳'}</span>
                                                    </div>

                                                    {/* Info factura */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                            {cfg && (
                                                                <span className={`${cfg.bg} ${cfg.text} text-[8px] font-black px-2 py-0.5 rounded-full`}>
                                                                    {cfg.label}
                                                                </span>
                                                            )}
                                                            {inv.es_devolucion && (
                                                                <span className="bg-rose-100 text-rose-700 text-[8px] font-black px-2 py-0.5 rounded-full">
                                                                    🔄 Devolución
                                                                </span>
                                                            )}
                                                        </div>

                                                        {inv.customer_name && (
                                                            <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>
                                                        )}

                                                        {(inv.city || inv.address) && (
                                                            <p className="text-[8px] text-slate-400 mt-0.5 truncate">
                                                                📍 {[inv.city, inv.address].filter(Boolean).join(' — ')}
                                                            </p>
                                                        )}

                                                        {/* Detalle de la conciliación */}
                                                        {conciliada && (
                                                            <div className="mt-2 flex flex-wrap gap-3 text-[8px] text-slate-500">
                                                                {inv.valor != null && inv.valor > 0 && (
                                                                    <span className="font-black text-emerald-700">
                                                                        ${Number(inv.valor).toLocaleString('es-CO')}
                                                                    </span>
                                                                )}
                                                                {inv.banco && <span>🏦 {inv.banco}</span>}
                                                                {inv.comprobante && <span>📋 {inv.comprobante}</span>}
                                                                {inv.fecha_pago && <span>📅 {new Date(inv.fecha_pago).toLocaleDateString('es-CO')}</span>}
                                                                {inv.conciliado_por_nombre && (
                                                                    <span className="text-slate-400">por {inv.conciliado_por_nombre}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Botón acción */}
                                                    <button
                                                        onClick={() => setModalInvoice(inv)}
                                                        className={`flex-shrink-0 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all
                                                            ${conciliada
                                                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                                : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                                    >
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

            {/* Modal de conciliación */}
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
