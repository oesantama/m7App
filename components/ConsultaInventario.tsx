import React from 'react';
import { api } from '../services/api';
import { Icons } from '../constants';
import { exportToExcel } from '../utils/exportUtils';
import TableControls from './shared/TableControls';
import Pagination from './shared/Pagination';

type Tab = 'bodega' | 'vehiculos' | 'movimientos';

interface Client { id: string; name: string; }

interface StockRow {
    article_id?: string;
    sku?: string;
    article_name?: string;
    batch?: string;
    qty?: number;
    quantity?: number;
    unit?: string;
    vehicle_plate?: string;
}

interface Movement {
    id: number;
    movement_type: string;
    article_id: string;
    article_name?: string;
    batch?: string;
    quantity: number;
    unit?: string;
    location_from?: string;
    location_to?: string;
    invoice?: string;
    vehicle_plate?: string;
    created_at: string;
    created_by?: string;
}

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
    INGRESO:           { label: 'Ingreso',          color: 'bg-emerald-100 text-emerald-700' },
    DESPACHO:          { label: 'Despacho',         color: 'bg-blue-100 text-blue-700' },
    ENTREGA:           { label: 'Entrega',          color: 'bg-violet-100 text-violet-700' },
    ENTREGA_PARCIAL:   { label: 'Parcial',          color: 'bg-amber-100 text-amber-700' },
    DEVOLUCION_BODEGA: { label: 'Devolución',       color: 'bg-rose-100 text-rose-700' },
    SALIDA_PROVEEDOR:  { label: 'Salida Prov.',     color: 'bg-slate-100 text-slate-600' },
    REPICE:            { label: 'Repice',           color: 'bg-cyan-100 text-cyan-700' },
    AJUSTE:            { label: 'Ajuste',           color: 'bg-orange-100 text-orange-700' },
};

const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ConsultaInventario: React.FC<{ user: any }> = ({ user }) => {
    const [tab, setTab] = React.useState<Tab>('bodega');

    // Client selector
    const [clients, setClients] = React.useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = React.useState<string>(
        user?.clientId || (user?.clientIds?.[0]) || ''
    );

    // Stock
    const [bodegaRows, setBodegaRows] = React.useState<StockRow[]>([]);
    const [vehiculoRows, setVehiculoRows] = React.useState<StockRow[]>([]);

    // Movements
    const [movements, setMovements] = React.useState<Movement[]>([]);
    const [page, setPage] = React.useState(1);
    const [hasMore, setHasMore] = React.useState(false);
    const [filterArticle, setFilterArticle] = React.useState('');
    const [filterPlate, setFilterPlate]     = React.useState('');
    const [filterType, setFilterType]       = React.useState('');
    const [filterInvoice, setFilterInvoice] = React.useState('');
    const [filterDateFrom, setFilterDateFrom] = React.useState('');
    const [filterDateTo, setFilterDateTo]     = React.useState('');

    const [loading, setLoading] = React.useState(false);

    // Resolve allowed clients
    React.useEffect(() => {
        const allowedIds: string[] = user?.clientIds?.length
            ? user.clientIds
            : user?.clientId ? [user.clientId] : [];

        if (allowedIds.length === 0) {
            setClients([]);
            return;
        }

        api.getClients().then((all: any[]) => {
            const filtered = allowedIds.length === 1 && allowedIds[0] === 'CLI-01'
                ? all  // admin with CLI-01 gets all
                : all.filter((c: any) => allowedIds.includes(c.id));
            setClients(filtered.map((c: any) => ({ id: c.id, name: c.name || c.id })));
            if (filtered.length > 0 && !selectedClientId) {
                setSelectedClientId(filtered[0].id);
            }
        }).catch(() => {});
    }, [user]);

    const loadStock = React.useCallback(async () => {
        if (!selectedClientId) return;
        setLoading(true);
        try {
            const res = await api.getInventoryStock({ clientId: selectedClientId, location: 'all' });
            setBodegaRows(res?.bodega ?? []);
            setVehiculoRows(res?.vehiculos ?? []);
        } catch { setBodegaRows([]); setVehiculoRows([]); }
        finally { setLoading(false); }
    }, [selectedClientId]);

    const loadMovements = React.useCallback(async (p = 1) => {
        if (!selectedClientId) return;
        setLoading(true);
        try {
            const params: any = { clientId: selectedClientId, page: p, limit: 50 };
            if (filterArticle) params.articleId    = filterArticle;
            if (filterPlate)   params.vehiclePlate = filterPlate;
            if (filterType)    params.movementType = filterType;
            if (filterInvoice) params.invoice      = filterInvoice;
            if (filterDateFrom) params.dateFrom    = filterDateFrom;
            if (filterDateTo)   params.dateTo      = filterDateTo;
            const res = await api.getInventoryMovements(params);
            const rows: Movement[] = res?.data ?? res ?? [];
            if (p === 1) setMovements(rows); else setMovements(prev => [...prev, ...rows]);
            setHasMore(rows.length === 50);
            setPage(p);
        } catch { if (p === 1) setMovements([]); }
        finally { setLoading(false); }
    }, [selectedClientId, filterArticle, filterPlate, filterType, filterInvoice, filterDateFrom, filterDateTo]);

    React.useEffect(() => {
        if (selectedClientId) { loadStock(); loadMovements(1); }
    }, [selectedClientId]);

    const handleRefresh = () => { loadStock(); loadMovements(1); };

    const tabs: { id: Tab; label: string }[] = [
        { id: 'bodega',      label: 'Stock Bodega' },
        { id: 'vehiculos',   label: 'Stock Vehículos' },
        { id: 'movimientos', label: 'Kardex / Movimientos' },
    ];

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-6">
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">Consulta de Inventario</h1>
                    <p className="text-[11px] text-slate-500 mt-0.5">Stock actual en bodega, vehículos y kardex de movimientos</p>
                </div>
                <button onClick={handleRefresh}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shrink-0">
                    <Icons.RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Client selector */}
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Cliente</span>
                {clients.length === 0 ? (
                    <span className="text-[10px] text-slate-500">Cargando clientes…</span>
                ) : clients.length === 1 ? (
                    <span className="text-[11px] font-black text-slate-700">{clients[0].name}</span>
                ) : (
                    <select
                        value={selectedClientId}
                        onChange={e => setSelectedClientId(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-bold bg-white outline-none focus:border-emerald-500 transition-all">
                        {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 flex-wrap">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                            ${tab === t.id
                                ? 'bg-slate-900 text-white shadow'
                                : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {!selectedClientId ? (
                <div className="flex flex-col items-center py-20 gap-2 text-slate-400">
                    <Icons.Package className="w-8 h-8" />
                    <p className="text-[11px] font-black uppercase tracking-widest">Selecciona un cliente</p>
                </div>
            ) : loading && movements.length === 0 && bodegaRows.length === 0 ? (
                <div className="flex justify-center items-center py-20">
                    <Icons.Loader className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
            ) : tab === 'bodega' ? (
                <StockTable rows={bodegaRows} mode="bodega" />
            ) : tab === 'vehiculos' ? (
                <StockTable rows={vehiculoRows} mode="vehiculos" />
            ) : (
                <>
                    {/* Filters */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                        <FilterInput placeholder="Artículo / SKU"  value={filterArticle}  onChange={setFilterArticle} />
                        <FilterInput placeholder="Placa vehículo"  value={filterPlate}    onChange={setFilterPlate} />
                        <FilterInput placeholder="Factura"         value={filterInvoice}  onChange={setFilterInvoice} />
                        <select value={filterType} onChange={e => setFilterType(e.target.value)}
                            className="px-2 py-2 border border-slate-200 rounded-xl text-[10px] text-slate-600 bg-white outline-none focus:border-slate-400 font-bold uppercase transition-all">
                            <option value="">Todos los tipos</option>
                            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                            className="px-2 py-2 border border-slate-200 rounded-xl text-[10px] text-slate-600 outline-none focus:border-slate-400 font-bold transition-all" />
                        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                            className="px-2 py-2 border border-slate-200 rounded-xl text-[10px] text-slate-600 outline-none focus:border-slate-400 font-bold transition-all" />
                        <button onClick={() => loadMovements(1)}
                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95">
                            <Icons.Search className="w-3.5 h-3.5" /> Filtrar
                        </button>
                    </div>

                    {/* Movements table */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        {movements.length === 0 ? (
                            <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                                <Icons.Package className="w-8 h-8" />
                                <p className="text-[11px] font-black uppercase tracking-widest">Sin movimientos</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50">
                                                {['Fecha', 'Tipo', 'Artículo', 'Lote', 'Cant.', 'Origen → Destino', 'Factura', 'Placa', 'Usuario'].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {movements.map(m => {
                                                const info = MOVEMENT_LABELS[m.movement_type] ?? { label: m.movement_type, color: 'bg-slate-100 text-slate-500' };
                                                return (
                                                    <tr key={m.id} className="hover:bg-slate-50/50">
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${info.color}`}>{info.label}</span>
                                                        </td>
                                                        <td className="px-3 py-2 font-bold text-slate-700">
                                                            {m.article_id}
                                                            {m.article_name && <span className="block text-[8px] text-slate-400 font-normal">{m.article_name}</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-500">{m.batch || 'S/L'}</td>
                                                        <td className="px-3 py-2 font-black text-slate-900 text-right">{m.quantity} {m.unit || 'und'}</td>
                                                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                                            {m.location_from && <span className="text-slate-400">{m.location_from}</span>}
                                                            {m.location_from && m.location_to && <span className="mx-1 text-slate-300">→</span>}
                                                            {m.location_to && <span className="text-slate-600">{m.location_to}</span>}
                                                        </td>
                                                        <td className="px-3 py-2 text-slate-500">{m.invoice || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-500">{m.vehicle_plate || '—'}</td>
                                                        <td className="px-3 py-2 text-slate-400">{m.created_by || '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {hasMore && (
                                    <div className="p-3 flex justify-center border-t border-slate-100">
                                        <button onClick={() => loadMovements(page + 1)} disabled={loading}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 hover:bg-slate-800 transition-all">
                                            {loading ? 'Cargando…' : 'Cargar más'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const StockTable: React.FC<{ rows: StockRow[]; mode: 'bodega' | 'vehiculos' }> = ({ rows, mode }) => {
    const [search, setSearch] = React.useState('');
    const [currentPage, setCurrentPage] = React.useState(1);
    const [rowsPerPage, setRowsPerPage] = React.useState<number | 'all'>(10);

    const filtered = React.useMemo(() => rows.filter(r => {
        const q = search.toLowerCase();
        return !q
            || (r.article_id ?? r.sku ?? '').toLowerCase().includes(q)
            || (r.article_name ?? '').toLowerCase().includes(q)
            || (r.vehicle_plate ?? '').toLowerCase().includes(q);
    }), [rows, search]);

    const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(filtered.length / rowsPerPage);
    const paginatedRows = rowsPerPage === 'all' 
        ? filtered 
        : filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    React.useEffect(() => { setCurrentPage(1); }, [search, rows, rowsPerPage]);

    const handleExport = () => {
        const data = filtered.map(r => ({
            'Artículo': r.article_id ?? r.sku,
            'Nombre': r.article_name,
            'Lote': r.batch || 'S/L',
            ...(mode === 'vehiculos' ? { 'Placa': r.vehicle_plate } : {}),
            'Cantidad': r.qty ?? r.quantity,
            'Unidad': r.unit || 'und'
        }));
        exportToExcel(data, `Stock_${mode}_${new Date().toISOString().split('T')[0]}`, 'Stock');
    };

    return (
        <div className="flex flex-col gap-4">
            <TableControls 
                searchValue={search}
                onSearchChange={setSearch}
                pageSize={rowsPerPage}
                onPageSizeChange={setRowsPerPage}
                onExport={handleExport}
                placeholder={`Buscar artículo${mode === 'vehiculos' ? ' o placa' : ''}...`}
            />

            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 transition-all">
                {paginatedRows.length === 0 ? (
                    <div className="py-20 flex flex-col items-center gap-3 text-slate-300">
                        <Icons.Package className="w-12 h-12" />
                        <p className="text-[11px] font-black uppercase tracking-widest">Sin existencias encontradas</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-900 text-white font-black uppercase tracking-widest text-[8px] sticky top-0 z-10">
                                        {[ 
                                            'Artículo', 'Nombre', 'Lote', 
                                            ...(mode === 'vehiculos' ? ['Placa'] : []), 
                                            'Cantidad', 'Unidad'
                                        ].map(h => (
                                            <th key={h} className="px-6 py-4">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {paginatedRows.map((r, i) => (
                                        <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-6 py-4 font-black text-slate-900">{r.article_id ?? r.sku ?? '—'}</td>
                                            <td className="px-6 py-4 text-slate-600 font-medium">{r.article_name || '—'}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black tracking-tighter">
                                                    {r.batch || 'S/L'}
                                                </span>
                                            </td>
                                            {mode === 'vehiculos' && <td className="px-6 py-4 text-slate-500 font-bold uppercase tracking-widest">{r.vehicle_plate || '—'}</td>}
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-[13px] font-black text-slate-900">{r.qty ?? r.quantity ?? '—'}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[8px] bg-slate-100 text-slate-400 font-black px-1.5 py-0.5 rounded uppercase">
                                                    {r.unit || 'und'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {rowsPerPage !== 'all' && totalPages > 1 && (
                            <Pagination 
                                currentPage={currentPage} 
                                totalPages={totalPages} 
                                onPageChange={setCurrentPage} 
                                totalItems={filtered.length}
                                itemsPerPage={rowsPerPage}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const FilterInput: React.FC<{ placeholder: string; value: string; onChange: (v: string) => void }> = ({ placeholder, value, onChange }) => (
    <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-2 py-1.5 border border-slate-200 rounded-xl text-[10px] text-slate-600 outline-none focus:border-slate-400 bg-white" />
);

export default ConsultaInventario;
