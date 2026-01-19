
import React, { useState } from 'react';
import { Icons } from '../constants';
import { Invoice, DocStatus, Route } from '../types';

interface DeliveryAppProps {
  route: Route;
  invoices: Invoice[];
  onUpdateInvoice: (id: string, status: DocStatus, data: any) => void;
  onFinishRoute: () => void;
}

const DeliveryApp: React.FC<DeliveryAppProps> = ({ route, invoices, onUpdateInvoice, onFinishRoute }) => {
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [signature, setSignature] = useState(false);

  const routeInvoices = invoices.filter(inv => route.invoiceIds.includes(inv.id));

  const handleDelivery = (status: DocStatus) => {
    if (!activeInvoice) return;
    onUpdateInvoice(activeInvoice.id, status, {
      signatureUrl: 'data:image/png;base64,...',
      receiverName: 'Cliente Prueba'
    });
    setActiveInvoice(null);
    setSignature(false);
  };

  if (activeInvoice) {
    return (
      <div className="bg-slate-50 min-h-screen p-4 animate-in fade-in duration-300">
        <button onClick={() => setActiveInvoice(null)} className="mb-6 flex items-center gap-2 text-slate-600 font-bold">
          <Icons.Alert /> Volver al Listado
        </button>
        
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200">
          <h2 className="text-2xl font-black text-slate-900 mb-2">{activeInvoice.id}</h2>
          <p className="text-slate-500 font-medium mb-6">{activeInvoice.customerName}</p>
          
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase mb-2">Dirección de Entrega</p>
              <p className="font-bold text-slate-800">{activeInvoice.address}</p>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase">Registro de Evidencia</p>
              <div className="grid grid-cols-2 gap-4">
                <button className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl hover:border-emerald-500 hover:bg-emerald-50 transition-all text-slate-400 hover:text-emerald-600">
                  <Icons.Signature />
                  <span className="text-xs font-bold mt-2">Tomar Foto</span>
                </button>
                <button 
                  onClick={() => setSignature(true)}
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-3xl transition-all ${signature ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-400'}`}
                >
                  <Icons.Audit />
                  <span className="text-xs font-bold mt-2">{signature ? 'Firmado' : 'Capturar Firma'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-6">
              <button 
                onClick={() => handleDelivery(DocStatus.DELIVERED)}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-600/20"
              >
                Entrega Completa
              </button>
              <button 
                onClick={() => handleDelivery(DocStatus.PARTIAL)}
                className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black"
              >
                Entrega Parcial / Novedad
              </button>
              <button 
                onClick={() => handleDelivery(DocStatus.RETURNED)}
                className="w-full bg-red-100 text-red-600 py-4 rounded-2xl font-black"
              >
                Devolución Total
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allDone = routeInvoices.every(inv => [DocStatus.DELIVERED, DocStatus.PARTIAL, DocStatus.RETURNED].includes(inv.status));

  return (
    <div className="bg-slate-900 min-h-screen p-4 text-white">
      <header className="py-6 flex justify-between items-center px-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Mi Ruta: {route.id}</h1>
          <p className="text-slate-400 text-xs font-bold uppercase">{routeInvoices.length} Entregas Pendientes</p>
        </div>
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center">
          <Icons.Truck />
        </div>
      </header>

      <div className="space-y-4 mt-4 pb-24">
        {routeInvoices.map((inv) => (
          <button 
            key={inv.id}
            onClick={() => setActiveInvoice(inv)}
            disabled={[DocStatus.DELIVERED, DocStatus.PARTIAL, DocStatus.RETURNED].includes(inv.status)}
            className={`w-full text-left p-6 rounded-[2rem] border transition-all ${
              inv.status === DocStatus.DELIVERED ? 'bg-slate-800 border-emerald-900 opacity-50' : 'bg-slate-800 border-slate-700 hover:border-emerald-500'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <span className="px-3 py-1 bg-slate-900 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest">{inv.id}</span>
              <Icons.ChevronRight />
            </div>
            <h3 className="text-lg font-black mb-1">{inv.customerName}</h3>
            <p className="text-slate-400 text-sm font-medium line-clamp-1">{inv.address}</p>
            
            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-2">
                 <span className="text-[10px] font-black bg-slate-700 px-2 py-1 rounded">{inv.volumeM3}m³</span>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${
                inv.status === DocStatus.DELIVERED ? 'text-emerald-500' : 'text-amber-500'
              }`}>{inv.status}</span>
            </div>
          </button>
        ))}
      </div>

      {allDone && (
        <div className="fixed bottom-6 left-4 right-4 animate-in slide-in-from-bottom-10">
          <button 
            onClick={onFinishRoute}
            className="w-full bg-emerald-500 text-slate-900 py-5 rounded-2xl font-black text-lg shadow-2xl shadow-emerald-500/40"
          >
            Cerrar Ruta y Volver a Disponible
          </button>
        </div>
      )}
    </div>
  );
};

export default DeliveryApp;
