import React, { useState, useEffect } from 'react';
import { DataTable } from '../shared/DataTable';
import { api } from '../../services/api';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function TabRedespachos() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.getPlanillasRedespachos();
      setData(result || []);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar historial de re-despachos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const columns = [
    { header: 'Pedido', key: 'pedido', render: (r: any) => <span className="font-bold text-slate-700">{r.pedido}</span> },
    { header: 'Cédula', key: 'cedula' },
    { header: 'Cliente', key: 'cliente' },
    { header: 'PLU', key: 'plu' },
    { header: 'Artículo', key: 'articulo' },
    { header: 'Dirección', key: 'direccion' },
    { header: 'Placa', key: 'placa' },
    { header: 'Última Fecha', key: 'fecha1' },
    { header: 'Total Salidas', key: 'salidas', render: (r: any) => <span className="text-center font-black text-orange-600 block bg-orange-50 py-1 rounded-lg">{r.salidas}</span> },
    { header: 'Último Estado Conciliación', key: 'estado_entrega', render: (r: any) => {
        const estado = r.estado_entrega;
        if (!estado || estado === 'No Conciliado Aún') return <span className="text-slate-400 italic">No Conciliado Aún</span>;
        
        const color = estado === 'Entregado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        return <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${color}`}>{estado}</span>;
    }}
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Consultor de Re-Despachos</h3>
              <p className="text-sm text-slate-500 font-medium">
                Historial completo de pedidos que han salido 2 o más veces
              </p>
            </div>
          </div>
          
          <button 
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        <DataTable 
          data={data}
          columns={columns}
          searchPlaceholder="Buscar por pedido, cliente, placa..."
          excelFileName="Historial_Redespachos.xlsx"
        />
      </div>
    </div>
  );
}
