
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Invoice, Vehicle, Route, VehicleStatus, Driver, VehicleAssignment } from '../types';
import { Icons } from '../constants';

interface RoutePlannerProps {
  invoices: Invoice[];
  vehicles: Vehicle[];
  drivers: Driver[];
  assignments: VehicleAssignment[];
  onAssign: (vId: string, dId: string, cId: string) => void;
  onSaveRoute: (route: Partial<Route>) => void;
}

const RoutePlanner: React.FC<RoutePlannerProps> = ({ invoices, vehicles, drivers, assignments, onAssign, onSaveRoute }) => {
  const mapRef = useRef<L.Map | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('planner-map').setView([4.6097, -74.0817], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    }
    const map = mapRef.current;
    if (map) {
      map.eachLayer((layer: any) => { if (layer instanceof L.Marker) map.removeLayer(layer); });
      invoices.forEach(inv => {
        const isSelected = selectedInvoices.includes(inv.id);
        const icon = L.divIcon({
          html: `<div class="w-8 h-8 rounded-full border-2 ${isSelected ? 'bg-emerald-500 border-white' : 'bg-slate-400 border-white'} shadow flex items-center justify-center text-white font-bold text-[10px] transition-all">${inv.id.slice(-3)}</div>`,
          className: 'custom-icon', iconSize: [32, 32], iconAnchor: [16, 16],
        });
        L.marker([inv.lat, inv.lng], { icon }).addTo(map)
          .bindPopup(`<b>${inv.customerName}</b><br>${inv.address}<br>Vol: ${inv.volumeM3}m3`)
          .on('click', () => setSelectedInvoices(prev => prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id]));
      });
    }
  }, [invoices, selectedInvoices]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-in fade-in">
      <div className="lg:col-span-2 space-y-4">
        <div id="planner-map" className="w-full h-[600px] bg-slate-200 rounded-[2.5rem] shadow-xl border-4 border-white overflow-hidden z-0"></div>
      </div>
      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Vehículo Seleccionado</label>
          <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold text-xs">
            <option value="">Seleccione placa...</option>
            {vehicles.filter(v => v.status === VehicleStatus.AVAILABLE).map(v => <option key={v.id} value={v.id}>{v.plate} - Cap: {v.capacityM3}m3</option>)}
          </select>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar">
           <h3 className="text-xs font-black text-slate-900 uppercase">Facturas en Cola ({selectedInvoices.length})</h3>
           <div className="space-y-2">
              {invoices.filter(i => selectedInvoices.includes(i.id)).map(i => (
                <div key={i.id} className="p-4 bg-slate-50 rounded-xl flex justify-between items-center group">
                   <div className="flex flex-col"><span className="text-[10px] font-black">{i.id}</span><span className="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[120px]">{i.customerName}</span></div>
                   <button onClick={() => setSelectedInvoices(prev => prev.filter(id => id !== i.id))} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X /></button>
                </div>
              ))}
           </div>
        </div>
        <button disabled={!selectedVehicle || selectedInvoices.length === 0} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase hover:bg-emerald-600 transition-all disabled:opacity-30">Crear Ruta Despacho</button>
      </div>
    </div>
  );
};

export default RoutePlanner;
