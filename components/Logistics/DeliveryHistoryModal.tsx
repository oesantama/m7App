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

    const inputClass = "w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-white transition-all placeholder:text-slate-400 placeholder:font-normal";
    const labelClass = "block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1";

    return (
        <div className="fixed inset-0 z-[900] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-200">

                {/* HEADER */}
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-t-3xl flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <Icons.Clock className="w-4.5 h-4.5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wider">Historial Operativo</h3>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Ciclo de vida de facturas y asignaciones</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all group">
                        <Icons.X className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                    </button>
                </div>

                {/* FILTROS */}
                <div className="px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div>
                            <label className={labelClass}>Factura</label>
                            <input type="text" placeholder="Ej: FAC-001" value={historyFilters.invoiceId || ''}
                                onChange={e => setHistoryFilters((p: any) => ({...p, invoiceId: e.target.value}))}
                                className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Doc. Legal</label>
                            <input type="text" placeholder="Número doc." value={historyFilters.documentL || ''}
                                onChange={e => setHistoryFilters((p: any) => ({...p, documentL: e.target.value}))}
                                className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Conductor</label>
                            <SearchableSelect
                                options={assignedDrivers}
                                value={historyFilters.driverId || ''}
                                onChange={(val: string) => setHistoryFilters((p: any) => ({...p, driverId: val}))}
                                placeholder="Seleccionar..."
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Placa</label>
                            <SearchableSelect
                                options={assignedVehicles.map((v: any) => ({ id: v.id, name: v.plate }))}
                                value={historyFilters.vehicleId || ''}
                                onChange={(val: string) => setHistoryFilters((p: any) => ({...p, vehicleId: val}))}
                                placeholder="Seleccionar..."
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Fecha desde</label>
                            <input type="date" value={historyFilters.dateFrom || ''}
                                onChange={e => setHistoryFilters((p: any) => ({...p, dateFrom: e.target.value}))}
                                className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Fecha hasta</label>
                            <input type="date" value={historyFilters.dateTo || ''}
                                onChange={e => setHistoryFilters((p: any) => ({...p, dateTo: e.target.value}))}
                                className={inputClass} />
                        </div>
                    </div>

                    {/* Botones de acción */}
                    <div className="flex items-center gap-2 mt-4">
                        <button onClick={loadHistory} disabled={historyLoading}
                            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-sm shadow-emerald-600/30">
                            {historyLoading
                                ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" />
                                : <Icons.Search className="w-3.5 h-3.5" />}
                            Buscar
                        </button>
                        <button onClick={() => {
                            setHistoryFilters({ invoiceId: '', documentL: '', driverId: '', vehicleId: '', dateFrom: '', dateTo: '', deliveryType: '', status: '' });
                            setTimeout(loadHistory, 0);
                        }}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all">
                            <Icons.X className="w-3.5 h-3.5" />
                            Limpiar
                        </button>
                    </div>
                </div>

                {/* TABLA */}
                <div className="flex-1 overflow-auto p-5 custom-scrollbar">
                    {historyLoading ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                <Icons.Loader className="w-5 h-5 animate-spin text-emerald-600" />
                            </div>
                            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cargando historial...</span>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <DataTable
                                data={historyData}
                                columns={[
                                    {
                                        header: 'OP. ID',
                                        key: 'operation_id',
                                        render: (row) => (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-black">
                                                #{row.operation_id}
                                            </span>
                                        )
                                    },
                                    {
                                        header: 'FACTURA',
                                        key: 'factura',
                                        render: (row) => <span className="font-black text-slate-800 text-xs">{row.factura || row.invoice_id}</span>,
                                        exportRender: (row) => row.factura || row.invoice_id || '-'
                                    },
                                    {
                                        header: 'DOC. L',
                                        key: 'documento_l',
                                        render: (row) => <span className="text-slate-500 text-xs">{row.documento_l || <span className="text-slate-300">—</span>}</span>,
                                        exportRender: (row) => row.documento_l || '-'
                                    },
                                    {
                                        header: 'CONDUCTOR',
                                        key: 'driver_name',
                                        render: (row) => (
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                                    <Icons.User className="w-2.5 h-2.5 text-slate-500" />
                                                </div>
                                                <span className="text-slate-700 text-xs font-semibold uppercase truncate max-w-[100px]">{row.driver_name || row.driver_id || '—'}</span>
                                            </div>
                                        ),
                                        exportRender: (row) => row.driver_name || row.driver_id || '-'
                                    },
                                    {
                                        header: 'PLACA',
                                        key: 'vehicle_plate',
                                        render: (row) => (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-100">
                                                {row.vehicle_plate || '—'}
                                            </span>
                                        ),
                                        exportRender: (row) => row.vehicle_plate || '-'
                                    },
                                    {
                                        header: 'DESTINO',
                                        key: 'info',
                                        render: (row) => (
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-bold text-slate-800 uppercase leading-tight">{row.client_name || 'SIN CLIENTE'}</span>
                                                {row.city && <span className="text-[10px] text-slate-500 uppercase">{row.city}</span>}
                                                {row.address && <span className="text-[10px] text-slate-400 uppercase truncate max-w-[140px]">{row.address}</span>}
                                                <span className="text-[10px] font-bold text-emerald-600 uppercase">{row.delivery_type || 'Plan Normal'}</span>
                                            </div>
                                        ),
                                        exportRender: (row) => `${row.client_name || 'SIN CLIENTE'} ${row.city ? `- ${row.city}` : ''} | ${row.address || ''} | ${row.delivery_type || 'Plan Normal'}`
                                    },
                                    {
                                        header: 'ESTADO',
                                        key: 'estado',
                                        render: (row) => {
                                            const status = (row.status_name || 'PENDIENTE').toUpperCase();
                                            const colors: Record<string, string> = {
                                                'ENTREGADO': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                                                'COMPLETADO': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                                                'EN RUTA': 'bg-blue-100 text-blue-700 border-blue-200',
                                                'ASIGNADO': 'bg-amber-100 text-amber-700 border-amber-200',
                                                'PENDIENTE': 'bg-slate-100 text-slate-600 border-slate-200',
                                                'DEVUELTO': 'bg-red-100 text-red-700 border-red-200',
                                            };
                                            const colorClass = colors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
                                            return (
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase ${colorClass}`}>
                                                    {status}
                                                </span>
                                            );
                                        },
                                        exportRender: (row) => row.status_name || 'PENDIENTE'
                                    },
                                    {
                                        header: 'F. ASIGNADA',
                                        key: 'fecha',
                                        render: (row) => (
                                            <span className="text-slate-500 text-[10px] font-medium">
                                                {row.route_created_at ? new Date(row.route_created_at).toLocaleString('es-CO') : '—'}
                                            </span>
                                        ),
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
