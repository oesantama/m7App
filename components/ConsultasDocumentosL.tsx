
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice } from '../types';
import * as XLSX from 'xlsx';

interface ConsultasDocumentosLProps {
  documents: DocumentL[];
  invoices: Invoice[];
  user: User;
  masterEstados: MasterRecord[];
}

const ConsultasDocumentosL: React.FC<ConsultasDocumentosLProps> = ({ documents, invoices, user, masterEstados }) => {
  const [filters, setFilters] = useState({ 
    plate: '', 
    docL: '', 
    codplan: '',
    status: '', 
    planType: '', 
    deliveryDate: '', 
    cargueDate: '',
    inventoryDate: ''
  });
  const [selectedDoc, setSelectedDoc] = useState<DocumentL | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "M7_Historial");
    XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
  };

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      const matchPlaca = !filters.plate || (doc.vehicleData || '').toLowerCase().includes(filters.plate.toLowerCase());
      const matchDocL = !filters.docL || doc.externalDocId.toLowerCase().includes(filters.docL.toLowerCase());
      const matchCodPlan = !filters.codplan || (doc.codplan || '').toLowerCase().includes(filters.codplan.toLowerCase());
      const matchStatus = !filters.status || doc.status === filters.status;
      const matchPlanType = !filters.planType || doc.planType === filters.planType;
      const cargueDate = new Date(doc.createdAt).toISOString().split('T')[0];
      const matchCargue = !filters.cargueDate || cargueDate === filters.cargueDate;
      const matchDelivery = !filters.deliveryDate || (doc.deliveryDate || '').includes(filters.deliveryDate.split('-').reverse().join('/'));
      const invDate = doc.inventoryDate ? new Date(doc.inventoryDate).toISOString().split('T')[0] : '';
      const matchInventory = !filters.inventoryDate || invDate === filters.inventoryDate;

      return matchPlaca && matchDocL && matchCodPlan && matchStatus && matchPlanType && matchCargue && matchDelivery && matchInventory;
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [documents, filters]);

  const paginatedDocs = useMemo(() => {
    if (rowsPerPage === 'all') return filteredDocs;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredDocs.slice(start, start + rowsPerPage);
  }, [filteredDocs, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(filteredDocs.length / rowsPerPage);

  const clearFilters = () => {
    setFilters({ 
      plate: '', docL: '', codplan: '', status: '', 
      planType: '', deliveryDate: '', cargueDate: '', inventoryDate: '' 
    });
    setCurrentPage(1);
  };

  const inputClass = "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-emerald-500 transition-all placeholder:text-slate-300";
  const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-1 block";

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1">
            <label className={labelClass}>Placa</label>
            <input type="text" placeholder="PLACA..." value={filters.plate} onChange={e => setFilters({...filters, plate: e.target.value})} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Documento L</label>
            <input type="text" placeholder="DOCUMENTO L..." value={filters.docL} onChange={e => setFilters({...filters, docL: e.target.value})} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>UN Orig</label>
            <input type="text" placeholder="UN ORIG..." value={filters.codplan} onChange={e => setFilters({...filters, codplan: e.target.value})} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Estado</label>
            <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className={inputClass}>
              <option value="">TODOS</option>
              {Object.values(DocStatus).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <button onClick={() => exportToExcel(filteredDocs, "M7_Historial")} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-3">
             <Icons.Excel /> Exportar Excel
          </button>
          <button onClick={clearFilters} className="px-10 py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all">Limpiar Filtros</button>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
              <tr>
                <th className="p-8">Documento / Placa</th>
                <th className="p-8">UN Orig</th>
                <th className="p-8">F. Envío</th>
                <th className="p-8 text-center">Estado</th>
                <th className="p-8 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-all">
                  <td className="p-8">
                    <p className="font-black text-slate-900 text-sm uppercase">{doc.externalDocId}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">PLACA: {doc.vehicleData}</p>
                  </td>
                  <td className="p-8 font-black text-slate-600 text-[11px] uppercase">{doc.codplan}</td>
                  <td className="p-8 font-black text-slate-400 text-[10px] uppercase">{doc.deliveryDate}</td>
                  <td className="p-8 text-center">
                    <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase border shadow-inner ${doc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{doc.status}</span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => setSelectedDoc(doc)} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all"><Icons.Eye /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDoc && (
        <div className="fixed inset-0 z-[400] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-10 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-[98vw] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/5">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center text-slate-900 shadow-xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-3xl font-black uppercase tracking-tighter">Detalle Auditoría M7: {selectedDoc.externalDocId}</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase mt-2">Trazabilidad Total de Inventario</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedDoc(null)} className="text-4xl font-thin hover:text-red-500 transition-all">×</button>
              </div>
              
              <div className="p-10 md:p-14 overflow-y-auto space-y-10 custom-scrollbar bg-slate-50/20 flex-1">
                 {/* RESTAURACIÓN DE METADATA DEL ENCABEZADO */}
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">UN Orig</p>
                      <p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.codplan || 'S/I'}</p>
                    </div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Envío</p>
                      <p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.deliveryDate || 'S/I'}</p>
                    </div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Placa</p>
                      <p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.vehicleData}</p>
                    </div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Inventario</p>
                      <p className="font-black text-slate-900 text-xs uppercase">
                        {selectedDoc.inventoryDate ? new Date(selectedDoc.inventoryDate).toLocaleDateString('es-CO') : 'PENDIENTE'}
                      </p>
                    </div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Auditor M7</p>
                      <p className="font-black text-slate-900 text-xs uppercase truncate">{selectedDoc.inventoryUser || 'S/A'}</p>
                    </div>
                 </div>

                 <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border-4 border-slate-100">
                   <table className="w-full text-left text-[10px]">
                      <thead className="bg-slate-900 text-white uppercase tracking-widest font-black">
                        <tr>
                          <th className="p-6">Articulo / SKU</th>
                          <th className="p-6 text-center">Cant. Plan</th>
                          <th className="p-6 text-center bg-blue-600/20">Conteo 1</th>
                          <th className="p-6 text-center bg-amber-600/20">Conteo 2</th>
                          <th className="p-6 text-center">UM</th>
                          <th className="p-6 text-center">Nº Pedido</th>
                          <th className="p-6">Observaciones de Auditoría</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {selectedDoc.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-6 font-black uppercase text-slate-800 tracking-tight">{it.articleId}</td>
                            <td className="p-6 text-center text-slate-900">{it.expectedQty}</td>
                            <td className="p-6 text-center text-blue-600 font-black bg-blue-50/30">{it.count1 || 0}</td>
                            <td className="p-6 text-center text-amber-600 font-black bg-amber-50/30">{it.count2 || it.countedQty || 0}</td>
                            <td className="p-6 text-center text-slate-500 uppercase">{it.unit || 'und'}</td>
                            <td className="p-6 text-center text-emerald-600 font-black">{it.orderNumber || 'S/I'}</td>
                            <td className="p-6 text-[9px] uppercase italic text-slate-400 max-w-[250px] truncate">{it.inventoryNote || 'Sin novedad reportada'}</td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                 </div>
              </div>
              <div className="p-10 border-t bg-white flex justify-end shrink-0">
                 <button onClick={() => setSelectedDoc(null)} className="px-14 py-6 bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-2xl">Cerrar Detalle Histórico</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ConsultasDocumentosL;
