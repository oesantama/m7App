
import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';
import { DocumentL } from '../types';

interface PickingHistoryProps {
    onBack?: () => void;
}

const PickingHistory: React.FC<PickingHistoryProps> = ({ onBack }) => {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewDetail, setViewDetail] = useState<any | null>(null);

    useEffect(() => {
        loadHistory();
    }, []);

    async function loadHistory() {
        setLoading(true);
        try {
            const data = await api.getInvoices();
            // Filtrar solo los que tienen alguna actividad de picking o están finalizados
            // Asumimos que si tienen pickingId ya pasaron por el proceso
            const history = data.filter((inv: any) => 
                inv.pickingId || 
                inv.status === 'Entregado' || 
                inv.status === 'EST-11'
            );
            setInvoices(history);
        } catch (e) {
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    }

    const filteredInvoices = useMemo(() => {
        if (!searchTerm) return invoices;
        const lower = searchTerm.toLowerCase();
        return invoices.filter((inv: any) => 
            (inv.invoiceNumber || '').toLowerCase().includes(lower) ||
            (inv.customerName || '').toLowerCase().includes(lower) ||
            (inv.id || '').toLowerCase().includes(lower) ||
            (inv.pickingId || '').toLowerCase().includes(lower)
        );
    }, [invoices, searchTerm]);

    return (
        <div className="flex flex-col h-full bg-white/50 rounded-[3rem] overflow-hidden animate-in fade-in duration-500">
            {/* Header / Filtros */}
            <div className="p-8 border-b border-slate-100 bg-white flex flex-col md:flex-row gap-6 justify-between items-center shrink-0">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-emerald-500 shadow-xl">
                        <Icons.History className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Histórico de Alistados</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredInvoices.length} Registros Encontrados</p>
                    </div>
                </div>

                <div className="relative w-full md:max-w-md group">
                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="BUSCAR FACTURA, CLIENTE O ID..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-900 uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                    />
                </div>
            </div>

            {/* Lista de Histórico */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 gap-4">
                    {filteredInvoices.map((inv, idx) => (
                        <div key={inv.id || idx} className="p-6 bg-white border border-slate-100 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-6 hover:shadow-lg transition-all group">
                            <div className="flex-1 min-w-0 flex items-center gap-4 w-full">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${inv.status === 'Entregado' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {idx + 1}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-lg font-black text-slate-900 truncate">
                                            {inv.invoiceNumber || inv.id}
                                        </p>
                                        {inv.pickingId && (
                                            <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase border border-emerald-100">
                                                Alistado
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">
                                        {inv.customerName} • {inv.city || 'N/A'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Items</p>
                                    <p className="text-sm font-black text-slate-900">{inv.items?.length || 0}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Volumen</p>
                                    <p className="text-sm font-black text-slate-900">{Number(inv.volumeM3 || 0).toFixed(2)} m³</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Estado</p>
                                    <p className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg ${
                                        inv.status === 'Entregado' ? 'bg-emerald-500 text-white' : 
                                        inv.status === 'EST-11' ? 'bg-blue-500 text-white' : 
                                        'bg-slate-200 text-slate-500'
                                    }`}>
                                        {inv.status || 'Pendiente'}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setViewDetail(inv)}
                                    className="p-3 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                >
                                    <Icons.Eye className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {filteredInvoices.length === 0 && !loading && (
                        <div className="py-20 text-center space-y-4 opacity-50">
                            <Icons.Search className="w-12 h-12 mx-auto text-slate-300" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No se encontraron registros</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Detalle (Read Only) */}
            {viewDetail && (
                <div className="fixed inset-0 z-[900] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Detalle de Factura</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">
                                    {viewDetail.invoiceNumber || viewDetail.id}
                                </p>
                            </div>
                            <button onClick={() => setViewDetail(null)} className="w-10 h-10 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all">
                                <Icons.X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar">
                           {(viewDetail.items || []).map((item: any, i: number) => (
                               <div key={i} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center">
                                   <div>
                                       <p className="text-sm font-black text-slate-900">{item.articleName || item.sku}</p>
                                       <p className="text-[9px] font-bold text-slate-400 uppercase">SKU: {item.sku}</p>
                                   </div>
                                   <div className="text-right">
                                       <p className="text-lg font-black text-indigo-600">{item.expectedQty} <span className="text-[10px] text-slate-400">{item.unit || 'UND'}</span></p>
                                   </div>
                               </div>
                           ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                ID Picking: {viewDetail.pickingId || 'SIN PROCESAR'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PickingHistory;
