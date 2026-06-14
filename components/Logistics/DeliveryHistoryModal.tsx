import React, { useState, useEffect } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { DataTable } from '../shared/DataTable';
import { SearchableSelect } from '../shared/SearchableSelect';


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
    const [assignedDrivers, setAssignedDrivers] = useState<{id: string, name: string}[]>([]);
    const [assignedVehicles, setAssignedVehicles] = useState<{id: string, plate: string}[]>([]);

    useEffect(() => {
        if (isOpen) {
            api.getHistoryFiltersData().then((res: any) => {
                if (res?.success) {
                    setAssignedDrivers(res.drivers || []);
                    setAssignedVehicles(res.vehicles || []);
                }
            }).catch(() => {});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[900] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden">
                {/* HEADER */}
                <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 rounded-t-[2rem] flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Historial Operativo</h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Ciclo de vida de facturas y asignaciones</p>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
                        <Icons.X className="w-3.5 h-3.5 text-white" />
                    </button>
                </div>

                {/* FILTROS */}
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        <input type="text" placeholder="Factura" value={historyFilters.invoiceId || ''}
                            onChange={e => setHistoryFilters((p: any) => ({...p, invoiceId: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white" />
                        <input type="text" placeholder="Doc. L" value={historyFilters.documentL || ''}
                            onChange={e => setHistoryFilters((p: any) => ({...p, documentL: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white" />
                        <SearchableSelect 
                            options={assignedDrivers}
                            value={historyFilters.driverId || ''}
                            onChange={(val: string) => setHistoryFilters((p: any) => ({...p, driverId: val}))}
                            placeholder="Conductor"
                        />
                        <SearchableSelect 
                            options={assignedVehicles.map((v: any) => ({ id: v.id, name: v.plate }))}
                            value={historyFilters.vehicleId || ''}
                            onChange={(val: string) => setHistoryFilters((p: any) => ({...p, vehicleId: val}))}
                            placeholder="Placa"
                        />
                        <input type="date" value={historyFilters.dateFrom || ''}
                            onChange={e => setHistoryFilters((p: any) => ({...p, dateFrom: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black outline-none focus:border-emerald-400 bg-white" />
                        <input type="date" value={historyFilters.dateTo || ''}
                            onChange={e => setHistoryFilters((p: any) => ({...p, dateTo: e.target.value}))}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black outline-none focus:border-emerald-400 bg-white" />
                        <button onClick={loadHistory} disabled={historyLoading}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 disabled:opacity-50">
                            {historyLoading ? <Icons.Loader className="w-3 h-3 animate-spin" /> : <Icons.Search className="w-3 h-3" />}
                            Buscar
                        </button>
                        <button onClick={() => {
                            setHistoryFilters({ invoiceId: '', documentL: '', driverId: '', vehicleId: '', dateFrom: '', dateTo: '', deliveryType: '', status: '' });
                            setTimeout(loadHistory, 0);
                        }}
                            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase hover:bg-slate-300 transition-all flex items-center justify-center gap-1">
                            <Icons.X className="w-3 h-3" />
                            Limpiar
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
                    ) : (
                        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 h-full overflow-hidden">
                            <DataTable
                                data={historyData}
                                columns={[
                                    {
                                        header: 'OP. ID',
                                        key: 'operation_id',
                                        render: (row) => <span className="font-black text-slate-500 text-[9px]">#{row.operation_id}</span>
                                    },
                                    {
                                        header: 'FACTURA',
                                        key: 'factura',
                                        render: (row) => <span className="font-black text-slate-900 text-[9px]">{row.factura || row.invoice_id}</span>,
                                        exportRender: (row) => row.factura || row.invoice_id || '-'
                                    },
                                    {
                                        header: 'DOC. L',
                                        key: 'documento_l',
                                        render: (row) => <span className="text-slate-500 text-[9px]">{row.documento_l || '-'}</span>,
                                        exportRender: (row) => row.documento_l || '-'
                                    },
                                    {
                                        header: 'CONDUCTOR',
                                        key: 'driver_name',
                                        render: (row) => <span className="text-slate-600 uppercase text-[9px]">{row.driver_name || row.driver_id}</span>,
                                        exportRender: (row) => row.driver_name || row.driver_id || '-'
                                    },
                                    {
                                        header: 'PLACA',
                                        key: 'vehicle_plate',
                                        render: (row) => <span className="font-black text-emerald-600 text-[9px]">{row.vehicle_plate || '-'}</span>,
                                        exportRender: (row) => row.vehicle_plate || '-'
                                    },
                                    {
                                        header: 'INFO. DESTINO',
                                        key: 'info',
                                        render: (row) => (
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-bold text-slate-700 uppercase">{row.client_name || 'SIN CLIENTE'} {row.city ? `- ${row.city}` : ''}</span>
                                                {row.address && <span className="text-[7px] font-bold text-slate-500 uppercase">{row.address}</span>}
                                                <span className="text-[7px] font-bold text-emerald-600 uppercase">{row.delivery_type || 'Plan Normal'}</span>
                                            </div>
                                        ),
                                        exportRender: (row) => `${row.client_name || 'SIN CLIENTE'} ${row.city ? `- ${row.city}` : ''} | ${row.address || ''} | ${row.delivery_type || 'Plan Normal'}`
                                    },
                                    {
                                        header: 'ESTADO',
                                        key: 'estado',
                                        render: (row) => (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[8px] font-black uppercase">
                                                {row.status_name || 'PENDIENTE'}
                                            </span>
                                        ),
                                        exportRender: (row) => row.status_name || 'PENDIENTE'
                                    },
                                    {
                                        header: 'F. ASIGNADA',
                                        key: 'fecha',
                                        render: (row) => <span className="text-slate-500 text-[9px]">{row.route_created_at ? new Date(row.route_created_at).toLocaleString('es-CO') : '-'}</span>,
                                        exportRender: (row) => row.route_created_at ? new Date(row.route_created_at).toLocaleString('es-CO') : '-'
                                    }
                                ]}
                                searchPlaceholder="Buscar en historial..."
                                excelFileName="Historial_Operaciones.xlsx"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeliveryHistoryModal;
