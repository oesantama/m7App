
import React from 'react';
import { Icons } from '../../constants';

interface DeliveryHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    historyTab: 'ENTREGAS' | 'DEVOLUCIONES';
    setHistoryTab: (tab: 'ENTREGAS' | 'DEVOLUCIONES') => void;
    historyFilters: any;
    setHistoryFilters: React.Dispatch<React.SetStateAction<any>>;
    drivers: any[];
    vehicles: any[];
    loadHistory: () => void;
    historyLoading: boolean;
    historyData: any[];
}

const DeliveryHistoryModal: React.FC<DeliveryHistoryModalProps> = ({
    isOpen,
    onClose,
    historyTab,
    setHistoryTab,
    historyFilters,
    setHistoryFilters,
    drivers,
    vehicles,
    loadHistory,
    historyLoading,
    historyData
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[900] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
                {/* HEADER */}
                <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 rounded-t-[2rem] flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Historial de Operaciones</h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Entregas y devoluciones registradas</p>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                        <Icons.X className="w-3.5 h-3.5 text-white" />
                    </button>
                </div>

                {/* TABS */}
                <div className="flex border-b border-slate-100">
                    {(['ENTREGAS', 'DEVOLUCIONES'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setHistoryTab(tab)}
                            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                                historyTab === tab ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-700'
                            }`}
                        >
                            {tab === 'ENTREGAS' ? '🚚 Entregas' : '🔄 Devoluciones'}
                        </button>
                    ))}
                </div>

                {/* FILTROS */}
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <input type="text" placeholder="Factura" value={historyFilters.invoiceId}
                            onChange={e => setHistoryFilters((p: any) => ({...p, invoiceId: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white" />
                        <select value={historyFilters.driverId}
                            onChange={e => setHistoryFilters((p: any) => ({...p, driverId: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white">
                            <option value="">Conductor</option>
                            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <select value={historyFilters.vehicleId}
                            onChange={e => setHistoryFilters((p: any) => ({...p, vehicleId: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white">
                            <option value="">Placa</option>
                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                        </select>
                        <input type="date" value={historyFilters.dateFrom}
                            onChange={e => setHistoryFilters((p: any) => ({...p, dateFrom: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black outline-none focus:border-emerald-400 bg-white" />
                        <input type="date" value={historyFilters.dateTo}
                            onChange={e => setHistoryFilters((p: any) => ({...p, dateTo: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black outline-none focus:border-emerald-400 bg-white" />
                        <button onClick={loadHistory} disabled={historyLoading}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 disabled:opacity-50">
                            {historyLoading ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Search className="w-3 h-3" />}
                            Buscar
                        </button>
                    </div>
                </div>

                {/* TABLA */}
                <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    {historyLoading ? (
                        <div className="flex items-center justify-center h-32">
                            <Icons.Loader className="w-6 h-6 animate-spin text-emerald-500" />
                            <span className="ml-2 text-slate-400 text-xs font-bold uppercase">Cargando...</span>
                        </div>
                    ) : historyData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-slate-300">
                            <Icons.FileText className="w-8 h-8 mb-2" />
                            <p className="text-xs font-black uppercase">Sin registros. Usa los filtros y presiona Buscar.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    {historyTab === 'ENTREGAS'
                                        ? ['ID', 'Factura', 'Conductor', 'Placa', 'Tipo', 'Fecha', 'Dev.'].map(h => (
                                            <th key={h} className="pb-2 text-[9px] font-black text-slate-400 uppercase tracking-widest pr-4">{h}</th>
                                        ))
                                        : ['ID', 'Factura', 'Conductor', 'Placa', 'Motivo', 'Estado', 'Fecha'].map(h => (
                                            <th key={h} className="pb-2 text-[9px] font-black text-slate-400 uppercase tracking-widest pr-4">{h}</th>
                                        ))
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                {historyData.map((row: any) => (
                                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all">
                                        {historyTab === 'ENTREGAS' ? <>
                                            <td className="py-2 pr-4 text-[9px] font-black text-slate-500">#{row.id}</td>
                                            <td className="py-2 pr-4 text-[9px] font-black text-slate-900">{row.invoiceId}</td>
                                            <td className="py-2 pr-4 text-[9px] text-slate-600 uppercase">{row.driverName || row.driverId}</td>
                                            <td className="py-2 pr-4 text-[9px] font-black text-emerald-600">{row.vehiclePlate || '-'}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${
                                                    row.deliveryType === 'FULL' ? 'bg-emerald-100 text-emerald-700'
                                                    : row.deliveryType === 'PARTIAL' ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                    {row.deliveryType === 'FULL' ? 'Completa' : row.deliveryType === 'PARTIAL' ? 'Parcial' : 'Devolución'}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-4 text-[9px] text-slate-400">{new Date(row.deliveredAt).toLocaleDateString('es-CO')}</td>
                                            <td className="py-2 pr-4 text-[9px] font-black">{row.returnId ? <span className="text-rose-500">#{row.returnId}</span> : <span className="text-slate-300">—</span>}</td>
                                        </> : <>
                                            <td className="py-2 pr-4 text-[9px] font-black text-slate-500">#{row.id}</td>
                                            <td className="py-2 pr-4 text-[9px] font-black text-slate-900">{row.invoiceId}</td>
                                            <td className="py-2 pr-4 text-[9px] text-slate-600 uppercase">{row.driverName || row.driverId}</td>
                                            <td className="py-2 pr-4 text-[9px] font-black text-emerald-600">{row.vehiclePlate || '-'}</td>
                                            <td className="py-2 pr-4 text-[9px] text-slate-600 max-w-[120px] truncate">{row.returnReason || '—'}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${
                                                    row.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700'
                                                    : row.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500'
                                                    : 'bg-amber-100 text-amber-700'
                                                }`}>{row.status}</span>
                                            </td>
                                            <td className="py-2 pr-4 text-[9px] text-slate-400">{new Date(row.createdAt).toLocaleDateString('es-CO')}</td>
                                        </>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeliveryHistoryModal;
