import React, { useState, useCallback, useMemo } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ConciliacionModal from '../Logistics/ConciliacionModal';
import ConciliacionRouteModal from '../Logistics/ConciliacionRouteModal';

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
    legalizadas: number;
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
    mastersuite_estado?: string;
    mastersuite_id_carga?: string;
    mastersuite_fecha_despacho?: string;
    mastersuite_fecha_entrega?: string;
    mastersuite_motivo_dev?: string;
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

const ENTREGADO_STATUS = ['EST-12', 'ENTREGADO', 'COMPLETED', 'FINALIZADO'];
const DEVUELTO_STATUS  = ['EST-13', 'DEVUELTO'];
const PARCIAL_STATUS   = ['EST-14', 'ENTREGA PARCIAL'];

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
    const [modalInvoice, setModalInvoice]   = useState<InvoiceRow | null>(null);
    const [showReportInput, setShowReportInput] = useState(false);
    const [reportEmail, setReportEmail]     = useState('');
    const [sendingReport, setSendingReport] = useState(false);
    const [modalRoute, setModalRoute]           = useState<RouteGroup | null>(null);
    const [searchInvoice, setSearchInvoice]     = useState('');
    const [searchRoute, setSearchRoute]         = useState('');
    const [importingMS, setImportingMS]         = useState(false);
    const msFileRef                             = React.useRef<HTMLInputElement>(null);
    const [pendingMsFile, setPendingMsFile]     = useState<File | null>(null);
    const [msPreviewData, setMsPreviewData]     = useState<any[]>([]);
    const [showMsPreview, setShowMsPreview]     = useState(false);

    // ── Carga detalle del documento ───────────────────────────────────────────
    const loadDocDetail = useCallback(async (doc: DocSummary) => {
        setSelectedDoc(doc);
        setInvoices([]);
        setRoutes([]);
        setUnassigned(0);
        setShowReportInput(false);
        setLoadingInv(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            setInvoices(res.invoices || []);
            setRoutes(res.routes   || []);
            setUnassigned(res.unassigned_invoices || 0);
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

    // ── Métricas globales del documento ───────────────────────────────────────
    const stats = useMemo(() => {
        const total       = invoices.length;
        const legalizadas = invoices.filter(i => !!i.forma_pago).length;
        const entregadas  = invoices.filter(i => ENTREGADO_STATUS.includes(i.item_status || '')).length;
        const devueltas   = invoices.filter(i => DEVUELTO_STATUS.includes(i.item_status || '')).length;
        const parciales   = invoices.filter(i => PARCIAL_STATUS.includes(i.item_status || '')).length;
        const valorTotal  = invoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const assigned    = total - unassigned;
        return { total, legalizadas, entregadas, devueltas, parciales, valorTotal, assigned };
    }, [invoices, unassigned]);

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
            <div className="w-full sm:w-72 lg:w-80 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col">
                {/* Buscador */}
                <div className="px-3 py-3 border-b border-slate-100 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={searchPend} onChange={e => setSearchPend(e.target.value)}
                            placeholder="Buscar doc, placa…"
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] outline-none focus:border-emerald-500" />
                    </div>
                    <button onClick={onRefresh} disabled={loadingDocs}
                        className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center shrink-0">
                        <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loadingDocs ? 'animate-spin' : ''}`} />
                    </button>
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
                    ) : filteredDocs.map(doc => {
                        const complete = doc.pendientes === 0;
                        const pct = doc.total_invoices > 0
                            ? Math.round((doc.conciliadas / doc.total_invoices) * 100) : 0;
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
                                        {complete ? '✅' : `${doc.pendientes} pend.`}
                                    </span>
                                </div>
                                <div className="mt-2">
                                    <div className="flex justify-between mb-0.5">
                                        <span className="text-[7px] text-slate-400">{doc.conciliadas}/{doc.total_invoices}</span>
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
                                <div className="bg-white border-b border-slate-200 px-5 py-3">
                                    {/* Fila 1: valor + distribución de facturas */}
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {stats.valorTotal > 0 && (
                                            <div className="flex flex-col px-3 py-2 rounded-xl bg-slate-900 text-white">
                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-60 leading-none mb-0.5">Valor Total</span>
                                                <span className="text-sm font-black leading-none">{fmtCOP(stats.valorTotal)}</span>
                                            </div>
                                        )}
                                        <Metric label="Total Fact."  value={stats.total}    color="bg-slate-100 text-slate-700" />
                                        <Metric label="Asignadas"    value={stats.assigned}  color="bg-blue-50 text-blue-700" />
                                        {unassigned > 0 && (
                                            <Metric label="Sin Asignar" value={unassigned}   color="bg-rose-50 text-rose-700" />
                                        )}
                                    </div>
                                    {/* Fila 2: estados */}
                                    <div className="flex flex-wrap gap-2">
                                        <Metric label="Legalizadas"  value={stats.legalizadas} color="bg-emerald-100 text-emerald-700" />
                                        <Metric label="Entregadas"   value={stats.entregadas}  color="bg-teal-50 text-teal-700" />
                                        <Metric label="Devueltas"    value={stats.devueltas}   color="bg-amber-100 text-amber-700" />
                                        <Metric label="Parciales"    value={stats.parciales}   color="bg-orange-100 text-orange-700" />
                                    </div>
                                </div>

                                <div className="p-4 space-y-4">
                                    {/* ── Tarjetas de placas/rutas ──────────── */}
                                    {routes.length > 0 && (
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
                                                    const pct = route.invoice_count > 0
                                                        ? Math.round((route.legalizadas / route.invoice_count) * 100) : 0;
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
                                                                {/* Contadores estado */}
                                                                <div className="grid grid-cols-4 gap-1 text-center">
                                                                    <div className="bg-emerald-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-emerald-700 leading-none">{route.legalizadas}</p>
                                                                        <p className="text-[7px] font-bold text-emerald-600 uppercase mt-0.5">Leg.</p>
                                                                    </div>
                                                                    <div className="bg-teal-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-teal-700 leading-none">{route.completadas}</p>
                                                                        <p className="text-[7px] font-bold text-teal-600 uppercase mt-0.5">Entregadas</p>
                                                                    </div>
                                                                    <div className="bg-amber-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-amber-700 leading-none">{route.devueltas}</p>
                                                                        <p className="text-[7px] font-bold text-amber-600 uppercase mt-0.5">Devueltas</p>
                                                                    </div>
                                                                    <div className="bg-orange-50 rounded-lg py-1.5">
                                                                        <p className="text-sm font-black text-orange-700 leading-none">{route.parciales}</p>
                                                                        <p className="text-[7px] font-bold text-orange-600 uppercase mt-0.5">Parciales</p>
                                                                    </div>
                                                                </div>
                                                                {/* Efectivo / Crédito */}
                                                                {((route.efectivo > 0) || (route.credito > 0)) && (
                                                                    <div className="flex gap-2 mt-2">
                                                                        {route.efectivo > 0 && (
                                                                            <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
                                                                                <p className="text-[7px] font-black text-emerald-600 uppercase">💵 Efectivo</p>
                                                                                <p className="text-[10px] font-black text-emerald-800">{fmtCOP(route.efectivo)}</p>
                                                                            </div>
                                                                        )}
                                                                        {route.credito > 0 && (
                                                                            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                                                                                <p className="text-[7px] font-black text-blue-600 uppercase">💳 Crédito</p>
                                                                                <p className="text-[10px] font-black text-blue-800">{fmtCOP(route.credito)}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Botón conciliar */}
                                                            <div className="px-4 pb-3 pt-2">
                                                                <button
                                                                    onClick={() => setModalRoute(route)}
                                                                    className="w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-emerald-600 transition-all">
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
                                                                            Valor: {fmtCOP(inv.invoice_value)}
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

                                                                {/* Botón conciliar/editar */}
                                                                <button onClick={() => setModalInvoice(inv)}
                                                                    className={`shrink-0 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition-all
                                                                        ${legalizada
                                                                            ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                                                                    {legalizada ? 'Editar' : 'Legalizar'}
                                                                </button>
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
                />
            )}
        </div>
    );
};

export default TabPendientes;
