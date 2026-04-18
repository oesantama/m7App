import React, { useState, useCallback } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

// ── Tipos ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Componente ────────────────────────────────────────────────────────────────

const TabConciliado: React.FC = () => {
    const [history, setHistory]         = useState<HistoryRow[]>([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [histFilters, setHistFilters] = useState({ from: '', to: '', doc_id: '', invoice: '', plate: '' });

    const loadHistory = useCallback(async () => {
        setLoadingHist(true);
        try {
            const res = await api.getConciliationHistory(histFilters);
            setHistory(res.data || []);
        } catch { toast.error('Error cargando historial'); }
        finally { setLoadingHist(false); }
    }, [histFilters]);

    const handleClear = () => {
        setHistFilters({ from: '', to: '', doc_id: '', invoice: '', plate: '' });
        setHistory([]);
    };

    return (
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
                    <button onClick={handleClear}
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
    );
};

export default TabConciliado;
