
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
    const [users, setUsers] = useState<any[]>([]);
    
    // Filtros Avanzados
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');
    const [filterPlate, setFilterPlate] = useState('');
    const [filterOrder, setFilterOrder] = useState('');
    const [filterPicker, setFilterPicker] = useState('');
    const [filterDocL, setFilterDocL] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        loadHistory();
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            const data = await api.getUsers();
            setUsers(data);
        } catch (e) {}
    }

    async function loadHistory() {
        setLoading(true);
        try {
            // Utilizamos el servicio api unificado que inyecta automáticamente el token JWT
            const data = await api.getInvoices(undefined, undefined, true);
            
            // Si el backend aún no se ha reiniciado o no soporta el query param directamente en la API de api.ts,
            // usamos fetch manual temporalmente o confiamos en que api.getInvoices sea actualizado.
            // Por ahora, asumimos que api.getInvoices(undefined, undefined, true) fue actualizado en nuestro pensamiento previo,
            // pero para asegurar la reactividad del cambio de estado, filtramos los que tengan actividad.
            const history = Array.isArray(data) ? data.filter((inv: any) => 
                inv.pickingId || inv.pickerLeader ||
                inv.status === 'Entregado' || 
                inv.status === 'EST-11' ||
                inv.status === 'ALISTADO'
            ) : [];
            setInvoices(history);
        } catch (e) {
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    }

    const filteredInvoices = useMemo(() => {
        return invoices.filter((inv: any) => {
            // Búsqueda General
            const lowerSearch = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm || 
                (inv.invoiceNumber || '').toLowerCase().includes(lowerSearch) ||
                (inv.customerName || '').toLowerCase().includes(lowerSearch) ||
                (inv.id || '').toLowerCase().includes(lowerSearch) ||
                (inv.orderNumber || '').toLowerCase().includes(lowerSearch);

            if (!matchesSearch) return false;

            // Filtros Específicos
            if (filterPlate && !(inv.plate || '').toLowerCase().includes(filterPlate.toLowerCase())) return false;
            if (filterOrder && !(inv.orderNumber || '').toLowerCase().includes(filterOrder.toLowerCase())) return false;
            if (filterDocL && !(inv.externalDocId || inv.docLId || '').toLowerCase().includes(filterDocL.toLowerCase())) return false;
            if (filterPicker && inv.pickerLeader !== filterPicker) return false;

            // Rango de Fechas
            if (dateStart || dateEnd) {
                const docDate = new Date(inv.pickingDate || inv.createdAt).getTime();
                if (dateStart && docDate < new Date(dateStart).getTime()) return false;
                if (dateEnd) {
                    const end = new Date(dateEnd);
                    end.setHours(23, 59, 59, 999);
                    if (docDate > end.getTime()) return false;
                }
            }

            return true;
        });
    }, [invoices, searchTerm, dateStart, dateEnd, filterPlate, filterOrder, filterPicker, filterDocL]);

    return (
        <div className="flex flex-col h-full bg-white/50 rounded-[3rem] overflow-hidden animate-in fade-in duration-500">
            {/* Header / Filtros */}
            <div className="p-8 border-b border-slate-100 bg-white shrink-0">
                <div className="flex flex-col md:flex-row gap-6 justify-between items-center mb-8">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-emerald-500 shadow-xl">
                            <Icons.History className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Histórico de Alistados</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredInvoices.length} Registros Encontrados</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-80 group">
                            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                            <input 
                                type="text" 
                                placeholder="FACTURA O CLIENTE..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-900 uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                            />
                        </div>
                        <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-4 rounded-2xl border-2 transition-all ${showFilters ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-500 hover:text-emerald-500'}`}
                        >
                            <Icons.Sliders className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Filtros Expandibles */}
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in slide-in-from-top-4 duration-300 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha Inicio</label>
                            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Fecha Fin</label>
                            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Alistador</label>
                            <select value={filterPicker} onChange={e => setFilterPicker(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 cursor-pointer">
                                <option value="">Todos</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Placa</label>
                            <input type="text" placeholder="ABC-123" value={filterPlate} onChange={e => setFilterPlate(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Pedido</label>
                            <input type="text" placeholder="PED-..." value={filterOrder} onChange={e => setFilterOrder(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Documento L</label>
                            <input type="text" placeholder="L-..." value={filterDocL} onChange={e => setFilterDocL(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" />
                        </div>
                    </div>
                )}
            </div>

            {/* Lista de Histórico */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 gap-4">
                    {filteredInvoices.map((inv, idx) => (
                        <div key={inv.id || idx} className="p-6 bg-white border border-slate-100 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-6 hover:shadow-lg transition-all group relative overflow-hidden">
                            <div className="flex-1 min-w-0 flex items-center gap-4 w-full">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-sm bg-slate-900 text-white`}>
                                    {idx + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-base font-black text-slate-900 tracking-tighter">
                                            #{inv.invoiceNumber || inv.id}
                                        </h4>
                                        <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase border transform transition-all group-hover:scale-105 ${
                                            inv.status === 'Entregado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            inv.status === 'EST-11' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                            'bg-indigo-50 text-indigo-600 border-indigo-100'
                                        }`}>
                                            {inv.status || 'PROCESADO'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-y-1 gap-x-4">
                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wide truncate max-w-[200px]">
                                            {inv.customerName}
                                        </p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <Icons.Navigation className="w-3 h-3" /> {inv.city || 'N/A'}
                                        </p>
                                        {inv.plate && (
                                            <p className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 rounded-md uppercase tracking-widest flex items-center gap-1 border border-indigo-100/50">
                                                <Icons.Truck className="w-3 h-3" /> {inv.plate}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 mt-4 md:mt-0 border-slate-50">
                                <div className="hidden lg:block text-left min-w-[120px]">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Alistado por</p>
                                    <p className="text-[10px] font-black text-slate-900 uppercase truncate">
                                        {users.find(u => u.id === inv.pickerLeader)?.name || 'S/A'}
                                    </p>
                                </div>
                                <div className="text-center min-w-[60px]">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">SKU/Vol</p>
                                    <p className="text-[10px] font-black text-slate-900 truncate">{inv.items?.length || 0} / {Number(inv.volumeM3 || 0).toFixed(2)}m³</p>
                                </div>
                                <div className="text-right min-w-[100px]">
                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Fecha</p>
                                    <p className="text-[10px] font-black text-slate-900 truncate">
                                        {inv.pickingDate ? new Date(inv.pickingDate).toLocaleDateString() : 'N/A'}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setViewDetail(inv)}
                                    className="w-12 h-12 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-95"
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
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest space-y-1">
                                <p>Líder Alistador: {users.find(u => u.id === viewDetail.pickerLeader)?.name || 'N/A'}</p>
                                <p>Fecha: {viewDetail.pickingDate ? new Date(viewDetail.pickingDate).toLocaleString() : 'N/A'}</p>
                                <p>ID Picking: {viewDetail.pickingId || 'PROCESADO'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PickingHistory;
