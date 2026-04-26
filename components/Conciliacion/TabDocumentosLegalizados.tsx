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

const ENTREGADO_STATUS = ['EST-12', 'ENTREGADO', 'COMPLETED', 'FINALIZADO'];
const DEVUELTO_STATUS  = ['EST-13', 'DEVUELTO'];
const PARCIAL_STATUS   = ['EST-14', 'ENTREGA PARCIAL'];
const REPICE_STATUS    = ['EST-15', 'REPICE'];

const TabDocumentosLegalizados: React.FC<{ user: any }> = ({ user }) => {
    const [searchId, setSearchId]           = useState('');
    const [loading, setLoading]             = useState(false);
    const [selectedDoc, setSelectedDoc]     = useState<DocSummary | null>(null);
    const [invoices, setInvoices]           = useState<InvoiceRow[]>([]);
    const [routes, setRoutes]               = useState<RouteGroup[]>([]);
    const [routeSurcharges, setRouteSurcharges] = useState<any[]>([]);
    const [groupPayments, setGroupPayments]     = useState<any[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const [searchInvoice, setSearchInvoice]     = useState('');
    const [searchRoute, setSearchRoute]         = useState('');
    const [summaryFilter, setSummaryFilter]     = useState<string | null>(null);
    const [detailRoute, setDetailRoute]         = useState<RouteGroup | null>(null);

    const handleSearch = async () => {
        if (!searchId.trim()) return;
        setLoading(true);
        setSelectedDoc(null);
        try {
            // Reutilizamos getPendingConciliations pasándole el docId
            const res = await api.getConciliationPending({ docId: searchId.trim() });
            if (res.data && res.data.length > 0) {
                const doc = res.data[0];
                setSelectedDoc(doc);
                loadDocDetail(doc);
            } else {
                toast.error('Documento no encontrado o no pertenece a un flujo de conciliación');
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
            setRouteSurcharges(res.routeSurcharges || []);
            setGroupPayments(res.groupPayments || []);
        } catch {
            toast.error('Error cargando detalle');
        } finally {
            setLoadingDetail(false);
        }
    };

    // ── Lógica de Métricas (Clonada de TabPendientes) ─────────────────────────
    const stats = useMemo(() => {
        const total           = invoices.length;
        const legalizadas     = invoices.filter(i => !!i.forma_pago).length;
        
        const individualLeg   = invoices.reduce((s, i) => s + (Number(i.valor) || 0), 0);
        const grupalRows      = groupPayments.filter(p => !p.invoice || p.invoice.trim() === '');
        const totalGrupal     = grupalRows.reduce((s, p) => s + (Number(p.valor) || 0), 0);
        const approvedRows    = routeSurcharges.filter(s => s.status_id === 'APROBADO' || s.status_id === 'EST-02');
        const approvedSurch   = approvedRows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
        const pendingRows     = routeSurcharges.filter(s => s.status_id === 'PENDIENTE' || s.status_id === 'EST-01' || !s.status_id);
        const pendingSurch    = pendingRows.reduce((s, r) => s + (Number(r.valor) || 0), 0);

        const efectivoInvoices = invoices.filter(i => {
            const m = (i.invoice_metodo_pago || '').toUpperCase().trim();
            return m === 'EF' || m.includes('EFE') || m === 'CASH' || m === '';
        });

        const valorTotal      = efectivoInvoices.reduce((s, i) => s + (Number(i.invoice_value) || 0), 0);
        const valorDevuelto   = efectivoInvoices.reduce((s, i) => {
            const isDev = i.es_devolucion || DEVUELTO_STATUS.includes((i.item_status || '').toUpperCase());
            const isPar = PARCIAL_STATUS.includes((i.item_status || '').toUpperCase());
            if (isDev) return s + (Number(i.invoice_value) || 0);
            if (isPar && i.forma_pago) return s + (Math.max(0, (Number(i.invoice_value) || 0) - (Number(i.valor) || 0)));
            return s;
        }, 0);
        const valorParcial    = efectivoInvoices.filter(i => PARCIAL_STATUS.includes((i.item_status || '').toUpperCase())).reduce((s, i) => s + (Number(i.valor) || 0), 0);

        const totalExtra      = totalGrupal + approvedSurch;

        return { 
            total, legalizadas, valorTotal,
            valorLegalizado: individualLeg,
            totalGrupal,
            totalLegalizado: individualLeg + totalGrupal + approvedSurch,
            valorDevuelto, valorParcial, 
            approvedSurch, pendingSurch, totalExtra,
            grupalCount: grupalRows.length,
            approvedSurchCount: approvedRows.length,
            pendingSurchCount: pendingRows.length,
            pendiente: valorTotal - (individualLeg + totalGrupal + approvedSurch) + valorDevuelto
        };
    }, [invoices, groupPayments, routeSurcharges]);

    const routeFinancials = useMemo(() => {
        const map = new Map<string, any>();
        invoices.forEach(inv => {
            const plate = inv.route_vehicle_plate || inv.vehicle_plate || '';
            if (!plate) return;
            const cur = map.get(plate) ?? { valor_legalizado: 0, valor_grupal: 0 };
            if (inv.forma_pago) cur.valor_legalizado += (Number(inv.valor) || 0);
            map.set(plate, cur);
        });
        groupPayments.forEach(p => {
            const plate = p.plate || '';
            if (!plate) return;
            const cur = map.get(plate) ?? { valor_legalizado: 0, valor_grupal: 0 };
            cur.valor_grupal += (Number(p.valor) || 0);
            map.set(plate, cur);
        });
        return map;
    }, [invoices, groupPayments]);

    const isAllLegalized = stats.total > 0 && stats.legalizadas === stats.total;

    // --- Export Excel (Copiado de TabPendientes) ---
    const handleExportExcel = useCallback(() => {
        if (!selectedDoc) return;
        try {
            const wb = XLSX.utils.book_new();
            const docName = `HIST-L-${selectedDoc.external_doc_id}`;

            const mapInvoices = (list: any[]) => list.map(i => ({
                'FACTURA': i.invoice_number,
                'CLIENTE': i.customer_name || '—',
                'CIUDAD': i.city || '—',
                'PLACA': i.route_vehicle_plate || '—',
                'VALOR FACTURA': i.invoice_value || 0,
                'VALOR RECAUDADO': i.valor || 0,
                'METODO': i.forma_pago || '—',
                'COMPROBANTE': i.comprobante || '—',
                'FECHA PAGO': i.fecha_pago ? i.fecha_pago.slice(0, 10) : '—',
            }));

            const ws = XLSX.utils.json_to_sheet(mapInvoices(invoices));
            XLSX.utils.book_append_sheet(wb, ws, 'Detalle');
            XLSX.writeFile(wb, `${docName}.xlsx`);
            toast.success('Excel generado');
        } catch (err: any) { toast.error('Error exportando: ' + err.message); }
    }, [selectedDoc, invoices]);

    return (
        <div className="flex flex-col flex-1 bg-slate-50 overflow-hidden">
            
            {/* Cabecera de Búsqueda */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
                <div className="flex-1 max-w-md relative">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                        type="text" 
                        value={searchId}
                        onChange={e => setSearchId(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="Ingrese Documento (ej: LO109...)"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                    />
                </div>
                <button 
                    onClick={handleSearch}
                    disabled={loading || !searchId.trim()}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2"
                >
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
                        <p className="text-[10px] font-bold mt-1">Ingrese el ID del documento para ver su detalle de legalización</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    
                    {/* Header del Doc Encontrado */}
                    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-black text-slate-900 uppercase">{selectedDoc.external_doc_id}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${isAllLegalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isAllLegalized ? '✅ Legalizado' : '⚠️ Pendientes'}
                            </span>
                        </div>
                        <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[8px] font-black uppercase transition-all shadow-sm">
                            <Icons.Download className="w-3 h-3" /> Exportar Excel
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {/* Métrica Cards (Similar a TabPendientes) */}
                        <div className="bg-white border-b border-slate-200 px-6 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Total Documento</p>
                                <p className="text-sm font-black text-slate-900">{fmtCOP(stats.valorTotal)}</p>
                            </div>
                            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                                <p className="text-[8px] font-black text-emerald-600 uppercase mb-1">Recaudado (Facturas)</p>
                                <p className="text-sm font-black text-emerald-700">{fmtCOP(stats.valorLegalizado)}</p>
                            </div>
                            <div className="bg-violet-50 p-3 rounded-2xl border border-violet-100">
                                <p className="text-[8px] font-black text-violet-600 uppercase mb-1">Recaudado (Grupales)</p>
                                <p className="text-sm font-black text-violet-700">{fmtCOP(stats.totalGrupal)}</p>
                            </div>
                            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100">
                                <p className="text-[8px] font-black text-rose-600 uppercase mb-1">Devoluciones</p>
                                <p className="text-sm font-black text-rose-700">{fmtCOP(stats.valorDevuelto)}</p>
                            </div>
                            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
                                <p className="text-[8px] font-black text-amber-600 uppercase mb-1">Sobrecostos Apr.</p>
                                <p className="text-sm font-black text-amber-700">{fmtCOP(stats.approvedSurch)}</p>
                            </div>
                            <div className={`p-3 rounded-2xl border ${Math.abs(stats.pendiente) < 5 ? 'bg-emerald-900 text-white' : 'bg-slate-900 text-white'}`}>
                                <p className="text-[8px] font-black opacity-60 uppercase mb-1">Saldo Pendiente</p>
                                <p className="text-sm font-black">{fmtCOP(stats.pendiente)}</p>
                            </div>
                        </div>

                        {/* Lista de Rutas/Placas */}
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {routes.map(r => {
                                    const fin = routeFinancials.get(r.plate);
                                    return (
                                        <div key={r.plate} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="text-xs font-black text-slate-900">{r.plate}</h4>
                                                    <p className="text-[9px] text-slate-500 font-bold">{r.driver_name || 'Sin conductor'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] font-black text-emerald-600">{fmtCOP(fin?.valor_legalizado)}</p>
                                                    <p className="text-[7px] text-slate-400 font-bold">{r.legalizadas}/{r.invoice_count} Facts</p>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-emerald-500 transition-all" 
                                                    style={{ width: `${Math.round((r.legalizadas/r.invoice_count)*100)}%` }} 
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TabDocumentosLegalizados;
