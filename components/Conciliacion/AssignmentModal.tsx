import React, { useMemo, useState } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface Vehicle {
    id: string;
    plate: string;
    capacityM3?: number;
    capacity_m3?: number;
}

interface Assignment {
    vehicleId: string;
    driverId: string;
    clientId: string;
    isActive: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    clientId: string;
    vehicles: Vehicle[];
    assignments: Assignment[];
    userName: string;
    onAssigned: () => void;
}

const AssignmentModal: React.FC<Props> = ({
    isOpen,
    onClose,
    invoice,
    clientId,
    vehicles,
    assignments,
    userName,
    onAssigned
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const availableVehicles = useMemo(() => {
        // Filtrar vehículos que tengan un vínculo activo con este cliente
        const activeLinks = assignments.filter(a => {
            const isClientMatch = a.clientId === clientId;
            const isActive = a.isActive;
            return isClientMatch && isActive;
        });

        const activeVehicleIds = new Set(activeLinks.map(a => String(a.vehicleId)));
        
        return vehicles
            .filter(v => activeVehicleIds.has(String(v.id)))
            .filter(v => 
                !searchTerm || 
                v.plate.toLowerCase().includes(searchTerm.toLowerCase())
            );
    }, [vehicles, assignments, clientId, searchTerm]);

    const handleAssign = async (vehicle: Vehicle) => {
        setIsSaving(true);
        try {
            const link = assignments.find(a => String(a.vehicleId) === String(vehicle.id) && a.isActive);
            
            const res = await api.saveRoute({
                id: `rt-manual-${Date.now()}`,
                vehicleId: vehicle.id,
                driverId: link?.driverId || 'S/A',
                clientId: clientId,
                invoiceIds: [invoice.invoice_number],
                createdBy: userName,
                totalVolume: 0,
                utilization: 0,
                capacityM3: Number(vehicle.capacityM3 || vehicle.capacity_m3 || 0)
            });

            if (res.success) {
                toast.success(`Factura ${invoice.invoice_number} asignada a placa ${vehicle.plate}`);
                onAssigned();
                onClose();
            } else {
                toast.error(res.error || "Error al asignar vehículo");
            }
        } catch (error: any) {
            toast.error(error.message || "Error de conexión");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[800] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                            <Icons.Truck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Asignar Vehículo</h3>
                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">Factura: {invoice.invoice_number}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-sm transition-all">
                        <Icons.X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                    <div className="relative">
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            autoFocus
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar placa..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto max-h-[350px] p-2 custom-scrollbar">
                    {availableVehicles.length === 0 ? (
                        <div className="py-12 text-center">
                            <div className="text-4xl mb-2">🚛</div>
                            <p className="text-xs text-slate-400 font-bold">No se encontraron vehículos disponibles</p>
                            <p className="text-[10px] text-slate-400 mt-1">Asegúrese de que el vehículo tenga un vínculo activo para este cliente.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-1">
                            {availableVehicles.map(v => (
                                <button
                                    key={v.id}
                                    disabled={isSaving}
                                    onClick={() => handleAssign(v)}
                                    className="flex items-center justify-between p-3.5 hover:bg-blue-50 rounded-2xl border border-transparent hover:border-blue-100 transition-all group text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center group-hover:bg-white transition-colors">
                                            <span className="text-sm font-black text-slate-600 group-hover:text-blue-600">
                                                {v.plate.substring(0, 3)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900 group-hover:text-blue-700">{v.plate}</p>
                                            <p className="text-[10px] text-slate-500 font-bold">Vínculo Activo ✅</p>
                                        </div>
                                    </div>
                                    <Icons.ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        Seleccione una placa para confirmar la asignación
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AssignmentModal;
