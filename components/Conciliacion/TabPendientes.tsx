import React, { useState, useCallback, useMemo } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import ConciliacionModal from '../Logistics/ConciliacionModal';

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
}

interface Props {
    docs: DocSummary[];
    loadingDocs: boolean;
    onRefresh: () => void;
    user: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCOP = (v: number | undefined | null) =>
    v != null && v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '—';

const fmtDate = (d: string | undefined) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const FORMA_COLOR: Record<string, { bg: string; text: string; label: string }> = {
    EFECTIVO:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '💵 Efectivo'      },
    TRANSFERENCIA: { bg: 'bg-blue-100',    text: 'text-blue-700',    label: '📱 Transferencia' },
    CONSIGNACION:  { bg: 'bg-violet-100',  text: 'text-violet-700',  label: '🏦 Consignación'  },
    CHEQUE:        { bg: 'bg-amber-100',   text: 'text-amber-700',   label: '📄 Cheque'        },
    DEVOLUCION:    { bg: 'bg-rose-100',    text: 'text-rose-700',    label: '🔄 Devolución'    },
};

// ── Componente ────────────────────────────────────────────────────────────────

const TabPendientes: React.FC<Props> = ({ docs, loadingDocs, onRefresh, user }) => {
    const [searchPend, setSearchPend]         = useState('');
    const [selectedDoc, setSelectedDoc]       = useState<DocSummary | null>(null);
    const [invoices, setInvoices]             = useState<InvoiceRow[]>([]);
    const [routes, setRoutes]                 = useState<RouteGroup[]>([]);
    const [unassigned, setUnassigned]         = useState(0);
    const [loadingInv, setLoadingInv]         = useState(false);
    const [modalInvoice, setModalInvoice]     = useState<InvoiceRow | null>(null);
    const [showReportInput, setShowReportInput] = useState(false);
    const [reportEmail, setReportEmail]       = useState('');
    const [sendingReport, setSendingReport]   = useState(false);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

    const loadDocDetail = useCallback(async (doc: DocSummary) => {
        setSelectedDoc(doc);
        setInvoices([]);
        setRoutes([]);
        setUnassigned(0);
        setSelectedRouteId(null);
        setShowReportInput(false);
        setLoadingInv(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            setInvoices(res.invoices || []);
            setRoutes(res.routes || []);
            setUnassigned(res.unassigned_invoices || 0);
        } catch { toast.error('Error cargando detalle del documento'); }
        finally { setLoadingInv(false); }
    }, []);

    const handleInvoiceSaved = () => {
        if (selectedDoc) loadDocDetail(selectedDoc);
        onRefresh();
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

    // Facturas filtradas por ruta seleccionada (o todas si no hay filtro de ruta)
    const visibleInvoices = useMemo(() => {
        if (!selectedRouteId) return invoices;
        // Filtrar por placa de la ruta seleccionada
        const route = routes.find(r => r.route_id === selectedRouteId);
        if (!route) return invoices;
        return invoices.filter(inv => inv.vehicle_plate === route.plate || !inv.vehicle_plate);
    }, [invoices, selectedRouteId, routes]);

    const isComplete = invoices.length > 0 && invoices.every(i => i.forma_pago);
    const totalRecaudado = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);

    const planBadge = (planType: string) => {
        const isPlanR = planType?.toUpperCase().includes('PLAN R') || planType?.toUpperCase() === 'R';
        return (
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wide
                ${isPlanR ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {isPlanR ? 'Plan R' : 'Normal'}
            </span>
        );
    };

    return (
        <div className="flex flex-1 overflow-hidden">

            {/* ── Panel izq — lista documentos ─────────────────────────────── */}
            <div className="w-full sm:w-80 lg:w-96 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col">
                {/* Buscador */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={searchPend} onChange={e => setSearchPend(e.target.value)}
                            placeholder="Buscar doc, placa, conductor…"
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500" />
                    </div>
                    <button onClick={onRefresh} disabled={loadingDocs}
                        className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center">
                        <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loadingDocs ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex gap-3">
                    <span className="text-[9px] font-bold text-slate-500">{filteredDocs.length} documentos</span>
                    <span className="text-[9px] text-emerald-600 font-bold ml-auto">{filteredDocs.filter(d => d.pendientes === 0).length} completos</span>
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
                    ) : filteredDocs.map(doc => {
                        const complete = doc.pendientes === 0;
                        const pct = doc.total_invoices > 0 ? Math.round((doc.conciliadas / doc.total_invoices) * 100) : 0;
                        const isActive = selectedDoc?.id === doc.id;
                        return (
                            <button key={doc.id} onClick={() => loadDocDetail(doc)}
                                className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-all hover:bg-slate-50
                                    ${isActive ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-[11px] font-black text-slate-900 truncate">{doc.external_doc_id}</p>
                                            {doc.plan_type && planBadge(doc.plan_type)}
                                        </div>
                                        <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">
                                            🚛 {doc.vehicle_plate || '—'}
                                            {doc.conductor_name && <span className="ml-1">· {doc.conductor_name}</span>}
                                        </p>
                                        {doc.delivery_date && (
                                            <p className="text-[8px] text-slate-400 mt-0.5">{fmtDate(doc.delivery_date)}</p>
                                        )}
                                        {/* Efectivo / Crédito */}
                                        {((doc.total_efectivo ?? 0) > 0 || (doc.total_credito ?? 0) > 0) && (
                                            <div className="flex gap-2 mt-1.5">
                                                {(doc.total_efectivo ?? 0) > 0 && (
                                                    <span className="text-[8px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">
                                                        💵 {fmtCOP(doc.total_efectivo)}
                                                    </span>
                                                )}
                                                {(doc.total_credito ?? 0) > 0 && (
                                                    <span className="text-[8px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md">
                                                        💳 {fmtCOP(doc.total_credito)}
                                                    </span>
                                                )}
                                            </div>
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

            {/* ── Panel der — detalle ───────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {!selectedDoc ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-5xl mb-3">💰</p>
                            <h3 className="text-base font-black text-slate-400 uppercase">Selecciona un Documento</h3>
                            <p className="text-xs text-slate-400 mt-1">Elige un documento para ver sus rutas y conciliar facturas</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="bg-white border-b border-slate-100 px-6 py-4 flex-shrink-0">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-black text-slate-900 uppercase">{selectedDoc.external_doc_id}</h3>
                                        {selectedDoc.plan_type && planBadge(selectedDoc.plan_type)}
                                        <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase
                                            ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {isComplete ? '✅ Completo' : `${invoices.filter(i => !i.forma_pago).length} pendientes`}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        {selectedDoc.delivery_date && `📅 ${fmtDate(selectedDoc.delivery_date)}`}
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

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                            {loadingInv ? (
                                <div className="flex items-center justify-center h-32">
                                    <Icons.Loader className="w-5 h-5 animate-spin text-emerald-500" />
                                </div>
                            ) : (
                                <>
                                    {/* ── Tarjetas de Rutas/Placas ─────────────────────────── */}
                                    {routes.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                    Rutas Asignadas ({routes.length})
                                                </p>
                                                {unassigned > 0 && (
                                                    <span className="bg-rose-100 text-rose-700 text-[8px] font-black px-2.5 py-1 rounded-full">
                                                        ⚠️ {unassigned} factura{unassigned > 1 ? 's' : ''} sin ruta
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                {routes.map(route => {
                                                    const isSelected = selectedRouteId === route.route_id;
                                                    return (
                                                        <button key={route.route_id}
                                                            onClick={() => setSelectedRouteId(isSelected ? null : route.route_id)}
                                                            className={`text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md
                                                                ${isSelected
                                                                    ? 'border-emerald-400 bg-emerald-50 shadow-md'
                                                                    : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                                            {/* Placa + conductor */}
                                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                                <div>
                                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                                        🚛 {route.plate || 'S/P'}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                                        👤 {route.driver_name || 'Sin conductor'}
                                                                    </p>
                                                                </div>
                                                                <span className="text-[9px] font-black bg-slate-900 text-white px-2 py-1 rounded-lg">
                                                                    {route.invoice_count} fact.
                                                                </span>
                                                            </div>
                                                            {/* Efectivo / Crédito */}
                                                            <div className="flex gap-2 mb-3">
                                                                <div className="flex-1 bg-emerald-50 rounded-xl px-2.5 py-2">
                                                                    <p className="text-[7px] font-black text-emerald-600 uppercase mb-0.5">💵 Efectivo</p>
                                                                    <p className="text-xs font-black text-emerald-800">{fmtCOP(route.efectivo)}</p>
                                                                </div>
                                                                <div className="flex-1 bg-blue-50 rounded-xl px-2.5 py-2">
                                                                    <p className="text-[7px] font-black text-blue-600 uppercase mb-0.5">💳 Crédito</p>
                                                                    <p className="text-xs font-black text-blue-800">{fmtCOP(route.credito)}</p>
                                                                </div>
                                                            </div>
                                                            {/* Contadores de estado */}
                                                            <div className="flex gap-1.5 flex-wrap">
                                                                <span className="text-[7px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                                    ✅ {route.completadas} entregadas
                                                                </span>
                                                                {route.devueltas > 0 && (
                                                                    <span className="text-[7px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                                        🔄 {route.devueltas} devueltas
                                                                    </span>
                                                                )}
                                                                {route.parciales > 0 && (
                                                                    <span className="text-[7px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                                                                        ⚡ {route.parciales} parciales
                                                                    </span>
                                                                )}
                                                                {(route.invoice_count - route.completadas - route.devueltas - route.parciales) > 0 && (
                                                                    <span className="text-[7px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                                                        ⏳ {route.invoice_count - route.completadas - route.devueltas - route.parciales} en tránsito
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                                {/* Tarjeta sin ruta */}
                                                {unassigned > 0 && (
                                                    <div className="text-left p-4 rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/50">
                                                        <p className="text-sm font-black text-rose-600 uppercase tracking-tight">⚠️ Sin Ruta</p>
                                                        <p className="text-[9px] text-rose-500 font-bold mt-0.5">{unassigned} factura{unassigned > 1 ? 's' : ''} no asignadas al planificador</p>
                                                    </div>
                                                )}
                                            </div>
                                            {selectedRouteId && (
                                                <button onClick={() => setSelectedRouteId(null)}
                                                    className="mt-2 text-[9px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors">
                                                    ✕ Quitar filtro de ruta
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Resumen formas de pago ────────────────────────────── */}
                                    {visibleInvoices.some(i => i.forma_pago) && (
                                        <div className="bg-white border border-slate-100 rounded-2xl p-4">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Resumen de Recaudo</p>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(
                                                    visibleInvoices.reduce((acc, inv) => {
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

                                    {/* ── Lista de facturas ─────────────────────────────────── */}
                                    {visibleInvoices.length === 0 ? (
                                        <div className="text-center py-10">
                                            <p className="text-2xl mb-2">📄</p>
                                            <p className="text-xs text-slate-400 font-bold">Sin facturas en este documento</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {selectedRouteId && (
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                    Facturas de la ruta seleccionada ({visibleInvoices.length})
                                                </p>
                                            )}
                                            {visibleInvoices.map(inv => {
                                                const conciliada = !!inv.forma_pago;
                                                const cfg = inv.forma_pago
                                                    ? (FORMA_COLOR[inv.forma_pago] || { bg: 'bg-slate-100', text: 'text-slate-700', label: inv.forma_pago })
                                                    : null;
                                                return (
                                                    <div key={inv.invoice_number}
                                                        className={`bg-white rounded-2xl border-2 transition-all p-4
                                                            ${conciliada ? 'border-emerald-100' : 'border-slate-200 hover:border-emerald-300'}`}>
                                                        <div className="flex items-start gap-3">
                                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5
                                                                ${conciliada ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                                                <span className="text-base">{conciliada ? '✅' : '⏳'}</span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <p className="text-[11px] font-black text-slate-900">{inv.invoice_number}</p>
                                                                    {cfg && <span className={`${cfg.bg} ${cfg.text} text-[8px] font-black px-2 py-0.5 rounded-full`}>{cfg.label}</span>}
                                                                    {inv.es_devolucion && <span className="bg-rose-100 text-rose-700 text-[8px] font-black px-2 py-0.5 rounded-full">🔄 Devolución</span>}
                                                                    {inv.invoice_metodo_pago && !conciliada && (
                                                                        <span className="bg-slate-100 text-slate-500 text-[7px] font-bold px-1.5 py-0.5 rounded">
                                                                            Esp: {inv.invoice_metodo_pago}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {inv.customer_name && <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate">{inv.customer_name}</p>}
                                                                {(inv.city || inv.address) && (
                                                                    <p className="text-[8px] text-slate-400 mt-0.5 truncate">📍 {[inv.city, inv.address].filter(Boolean).join(' — ')}</p>
                                                                )}
                                                                {inv.invoice_value != null && inv.invoice_value > 0 && !conciliada && (
                                                                    <p className="text-[8px] font-black text-slate-600 mt-0.5">Valor: {fmtCOP(inv.invoice_value)}</p>
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
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

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

export default TabPendientes;
