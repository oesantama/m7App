import React, { useState, useCallback, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { Truck, ChevronDown, ChevronRight, Search, AlertCircle, AlertTriangle, Plus } from 'lucide-react';
import AssignmentModal from './AssignmentModal';
import ConciliacionDevolucionModal from './ConciliacionDevolucionModal';

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
    route_vehicle_plate?: string;
    invoice_value?: number;
    total_qty?: number;
    vehicle_plate?: string;
    conductor_id?: string;
    conductor_name?: string;
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

const TabPlanNormal: React.FC<Props> = ({ clientId, user }) => {
    const [docs, setDocs]             = useState<DocNormal[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [searchDoc, setSearchDoc]   = useState('');
    const [selectedDoc, setSelectedDoc] = useState<DocNormal | null>(null);

    const [invoices, setInvoices]     = useState<InvoiceRow[]>([]);
    const [routes, setRoutes]         = useState<any[]>([]);
    const [loadingInv, setLoadingInv] = useState(false);

    // per-invoice estado selections
    const [estados, setEstados]       = useState<Record<string, EstadoEntrega>>({});
    const [saving, setSaving]         = useState<Record<string, boolean>>({});

    // Plate search & Invoice search within plate
    const [searchPlate, setSearchPlate] = useState('');
    const [searchInvoice, setSearchInvoice] = useState('');
    const [expandedPlates, setExpandedPlates] = useState<Record<string, boolean>>({});

    // Vehicles and Assignments for AssignmentModal
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [assigningInvoice, setAssigningInvoice] = useState<InvoiceRow | null>(null);

    // Modal devolución
    const [devolucionInvoice, setDevolucionInvoice] = useState<InvoiceRow | null>(null);

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

    // Load vehicles and assignments on mount
    useEffect(() => {
        Promise.all([api.getVehicles(), api.getAssignments()])
            .then(([v, a]) => {
                setVehicles(v || []);
                setAssignments(a || []);
            })
            .catch(() => {});
    }, []);

    const loadInvoices = useCallback(async (doc: DocNormal) => {
        setSelectedDoc(doc);
        setInvoices([]);
        setRoutes([]);
        setEstados({});
        setExpandedPlates({});
        setLoadingInv(true);
        try {
            const res = await api.getConciliationByDocument(doc.id);
            const rows: InvoiceRow[] = res.invoices || [];
            const rList: any[] = res.routes || [];
            setInvoices(rows);
            setRoutes(rList);

            // Auto-expand all loaded plates by default
            const initialExpanded: Record<string, boolean> = {};
            rList.forEach(r => {
                if (r.plate) initialExpanded[r.plate] = true;
            });
            // Also expand unassigned section by default
            initialExpanded['unassigned'] = true;
            setExpandedPlates(initialExpanded);

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
    }, [loadDocs]);

    const handleEstadoClick = useCallback((inv: InvoiceRow, estado: EstadoEntrega) => {
        if (estado === 'devolucion') {
            setDevolucionInvoice(inv);
            return;
        }
        saveEstado(inv, estado);
    }, []);  // eslint-disable-line

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

    const filteredRoutes = routes.filter(r =>
        !searchPlate || r.plate?.toLowerCase().includes(searchPlate.toLowerCase())
    );

    const unassignedInvoices = invoices.filter(inv => !inv.route_vehicle_plate);
    const filteredUnassignedInvoices = unassignedInvoices.filter(inv =>
        !searchInvoice ||
        inv.invoice_number?.toLowerCase().includes(searchInvoice.toLowerCase()) ||
        inv.customer_name?.toLowerCase().includes(searchInvoice.toLowerCase())
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

            {/* ── Panel derecho: facturas agrupadas por placa ────────────────── */}
            {!selectedDoc ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-50/50">
                    <span className="text-5xl">📋</span>
                    <p className="text-[13px] font-black uppercase tracking-widest">Selecciona un documento</p>
                    <p className="text-[10px]">para ver sus facturas pendientes</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
                    {/* Header doc */}
                    <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black text-slate-900">{selectedDoc.external_doc_id}</h3>
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase">
                                    {selectedDoc.plan_type || 'PLAN NORMAL'}
                                </span>
                            </div>
                            <p className="text-[9px] text-slate-400 font-bold mt-1">
                                🚛 {selectedDoc.vehicle_plate || 'SIN PLACA PRINCIPAL'} · 👤 {selectedDoc.conductor_name || 'Sin conductor'} · 📅 {fmtDate(selectedDoc.created_at)}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-black bg-violet-100 text-violet-700 px-2.5 py-1 rounded-xl">
                                {selectedDoc.conciliadas}/{selectedDoc.total_invoices} conciliadas
                            </span>
                            <button onClick={() => loadInvoices(selectedDoc)}
                                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                                <Icons.RefreshCw className="w-4 h-4 text-slate-500 animate-hover" />
                            </button>
                        </div>
                    </div>

                    {/* Instrucción */}
                    <div className="px-6 py-2.5 bg-violet-50 border-b border-violet-100 shrink-0">
                        <p className="text-[9px] text-violet-700 font-bold uppercase tracking-wider">
                            Indica el estado de entrega de cada factura. No se requiere información de pago.
                        </p>
                    </div>

                    {/* Filtros de búsqueda para placas y facturas */}
                    <div className="bg-white border-b border-slate-100 px-6 py-3 flex gap-3 shrink-0">
                        {routes.length > 0 && (
                            <div className="relative flex-1">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={searchPlate}
                                    onChange={e => setSearchPlate(e.target.value)}
                                    placeholder="Buscar por placa..."
                                    className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-violet-400 transition-all"
                                />
                            </div>
                        )}
                        <div className="relative flex-1">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchInvoice}
                                onChange={e => setSearchInvoice(e.target.value)}
                                placeholder="Buscar por factura o cliente..."
                                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-violet-400 transition-all"
                            />
                        </div>
                    </div>

                    {/* Facturas y Placas agrupadas */}
                    {loadingInv ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Icons.Loader className="w-5 h-5 text-violet-500 animate-spin" />
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <span className="text-3xl">📭</span>
                            <p className="text-[10px] font-black uppercase tracking-wider">Sin facturas</p>
                        </div>
                    ) : routes.length > 0 ? (
                        /* Muestra placas */
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {filteredRoutes.map(route => {
                                const isOpen = !!expandedPlates[route.plate];
                                const invoicesInPlaca = invoices.filter(inv => inv.route_vehicle_plate === route.plate);
                                const filteredInvs = invoicesInPlaca.filter(inv =>
                                    !searchInvoice ||
                                    inv.invoice_number?.toLowerCase().includes(searchInvoice.toLowerCase()) ||
                                    inv.customer_name?.toLowerCase().includes(searchInvoice.toLowerCase())
                                );

                                const total = invoicesInPlaca.length;
                                const conciliated = invoicesInPlaca.filter(inv => !!estados[inv.invoice_number]).length;
                                const pct = total > 0 ? Math.round((conciliated / total) * 100) : 0;

                                if (searchPlate && !route.plate?.toLowerCase().includes(searchPlate.toLowerCase())) return null;
                                if (searchInvoice && filteredInvs.length === 0) return null;

                                return (
                                    <div key={route.route_id} className="bg-white rounded-2xl border border-slate-150 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                                        {/* Header placa */}
                                        <div
                                            className="flex items-center justify-between px-5 py-4 cursor-pointer bg-slate-50 hover:bg-slate-100/70 transition-colors"
                                            onClick={() => setExpandedPlates(p => ({ ...p, [route.plate]: !isOpen }))}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 shadow-sm">
                                                    <Truck size={15} className="text-white" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-slate-900 tracking-wider uppercase">{route.plate}</span>
                                                    </div>
                                                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">{route.driver_name || 'Sin conductor asignado'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Conciliadas</p>
                                                    <p className="text-[11px] font-black"><span className="text-emerald-600">{conciliated}</span><span className="text-slate-300">/{total}</span></p>
                                                </div>
                                                <div className="w-16">
                                                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <p className="text-[8px] text-slate-400 font-black text-right mt-0.5">{pct}%</p>
                                                </div>
                                                {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                            </div>
                                        </div>

                                        {/* Detalle facturas en placa */}
                                        {isOpen && (
                                            <div className="border-t border-slate-100 p-4 space-y-2 bg-white divide-y divide-slate-50">
                                                {filteredInvs.length === 0 ? (
                                                    <p className="text-[9px] text-slate-400 text-center py-4 font-bold uppercase tracking-wider">No se encontraron facturas coincidentes</p>
                                                ) : (
                                                    filteredInvs.map(inv => {
                                                        const current = estados[inv.invoice_number] || '';
                                                        const isSaved = !!inv.conciliation_id || !!current;
                                                        const isBusy  = saving[inv.invoice_number];

                                                        return (
                                                            <div key={inv.invoice_number} className="flex items-center gap-3 py-3 hover:bg-slate-50/50 transition-colors first:pt-0 last:pb-0">
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-[11px] font-black text-slate-900">{inv.invoice_number}</span>
                                                                    {inv.customer_name && (
                                                                        <p className="text-[8px] text-slate-500 font-bold truncate mt-0.5">{inv.customer_name}</p>
                                                                    )}
                                                                    {inv.city && (
                                                                        <p className="text-[7px] text-slate-400 mt-0.5">{inv.city}</p>
                                                                    )}
                                                                </div>

                                                                {/* Estado buttons */}
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    {STATUS_OPTS.map(opt => {
                                                                        const isActive = current === opt.value;
                                                                        return (
                                                                            <button key={opt.value}
                                                                                onClick={() => handleEstadoClick(inv, opt.value)}
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
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Facturas sin asignar bajo este documento con rutas */}
                            {unassignedInvoices.length > 0 && (
                                <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden transition-all duration-200">
                                    <div
                                        className="flex items-center justify-between px-5 py-4 cursor-pointer bg-rose-50/50 hover:bg-rose-50 transition-colors"
                                        onClick={() => setExpandedPlates(p => ({ ...p, unassigned: !p.unassigned }))}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                                                <AlertCircle className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-black text-rose-900 tracking-wider">FACTURAS SIN ASIGNAR</span>
                                                <p className="text-[9px] text-rose-500 font-bold mt-0.5">{unassignedInvoices.length} factura(s) pendiente(s) de placa</p>
                                            </div>
                                        </div>
                                        {expandedPlates['unassigned'] ? <ChevronDown size={14} className="text-rose-400" /> : <ChevronRight size={14} className="text-rose-400" />}
                                    </div>

                                    {expandedPlates['unassigned'] && (
                                        <div className="border-t border-rose-50 p-4 space-y-3 bg-white divide-y divide-slate-50">
                                            {filteredUnassignedInvoices.length === 0 ? (
                                                <p className="text-[9px] text-slate-400 text-center py-4 font-bold uppercase tracking-wider">No se encontraron facturas sin asignar coincidentes</p>
                                            ) : (
                                                filteredUnassignedInvoices.map(inv => (
                                                    <div key={inv.invoice_number} className="flex items-center gap-3 py-3 hover:bg-slate-50/50 transition-colors first:pt-0 last:pb-0">
                                                        <div className="flex-1 min-w-0">
                                                            <span className="text-[11px] font-black text-slate-900">{inv.invoice_number}</span>
                                                            {inv.customer_name && (
                                                                <p className="text-[8px] text-slate-500 font-bold truncate mt-0.5">{inv.customer_name}</p>
                                                            )}
                                                            {inv.city && (
                                                                <p className="text-[7px] text-slate-400 mt-0.5">{inv.city}</p>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => setAssigningInvoice(inv)}
                                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1 shrink-0"
                                                        >
                                                            <Plus className="w-3 h-3" /> Vincular
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* NO routes at all in the document, list all invoices with Assign Option */
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 shrink-0">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                                <div>
                                    <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-wider">Sin rutas asignadas</h4>
                                    <p className="text-[9px] text-amber-700 font-semibold mt-1">Este documento no tiene placas ni rutas vinculadas. Para iniciar la conciliación individual, vincule cada factura a un vehículo.</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 divide-y divide-slate-50 space-y-2">
                                {invoices.filter(inv =>
                                    !searchInvoice ||
                                    inv.invoice_number?.toLowerCase().includes(searchInvoice.toLowerCase()) ||
                                    inv.customer_name?.toLowerCase().includes(searchInvoice.toLowerCase())
                                ).map(inv => (
                                    <div key={inv.invoice_number} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[11px] font-black text-slate-900">{inv.invoice_number}</span>
                                            {inv.customer_name && (
                                                <p className="text-[8px] text-slate-500 font-bold truncate mt-0.5">{inv.customer_name}</p>
                                            )}
                                            {inv.city && (
                                                <p className="text-[7px] text-slate-400 mt-0.5">{inv.city}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setAssigningInvoice(inv)}
                                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1 shrink-0"
                                        >
                                            <Plus className="w-3 h-3" /> Vincular Vehículo
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Asignación / Vinculación */}
            {assigningInvoice && selectedDoc && (
                <AssignmentModal
                    isOpen={!!assigningInvoice}
                    onClose={() => setAssigningInvoice(null)}
                    invoice={assigningInvoice}
                    clientId={selectedDoc.client_id || clientId || ''}
                    vehicles={vehicles}
                    assignments={assignments}
                    userName={user?.name || user?.email || 'Sistema'}
                    onAssigned={() => {
                        if (selectedDoc) loadInvoices(selectedDoc);
                        loadDocs();
                    }}
                />
            )}

            {/* Modal de Confirmación de Devolución */}
            <ConciliacionDevolucionModal
                isOpen={!!devolucionInvoice}
                onClose={() => setDevolucionInvoice(null)}
                invoice={devolucionInvoice}
                documentId={selectedDoc?.id || ''}
                currentUserId={user?.id || ''}
                vehiclePlate={devolucionInvoice?.vehicle_plate || devolucionInvoice?.route_vehicle_plate}
                conductorId={devolucionInvoice?.conductor_id}
                conductorName={devolucionInvoice?.conductor_name}
                onSaved={(invoiceNumber) => {
                    setEstados(s => ({ ...s, [invoiceNumber]: 'devolucion' }));
                    setDevolucionInvoice(null);
                    loadDocs();
                }}
            />
        </div>
    );
};

export default TabPlanNormal;
