
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice } from '../types';

interface ConsultasDocumentosLProps {
  documents: DocumentL[];
  invoices: Invoice[];
  user: User;
  masterEstados: MasterRecord[];
}

const ConsultasDocumentosL: React.FC<ConsultasDocumentosLProps> = ({ documents, invoices, user, masterEstados }) => {
  const [filters, setFilters] = useState({ 
    plate: '', docL: '', status: '', planType: '', 
    dateCargueFrom: '', dateCargueTo: '' 
  });
  const [selectedDoc, setSelectedDoc] = useState<DocumentL | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      const matchPlaca = !filters.plate || (doc.vehicleData || '').toLowerCase().includes(filters.plate.toLowerCase());
      const matchDocL = !filters.docL || doc.externalDocId.toLowerCase().includes(filters.docL.toLowerCase());
      const matchStatus = !filters.status || doc.status === filters.status;
      const matchPlanType = !filters.planType || doc.planType === filters.planType;
      
      const cargueDate = new Date(doc.createdAt).toISOString().split('T')[0];
      const matchCargueFrom = !filters.dateCargueFrom || cargueDate >= filters.dateCargueFrom;
      const matchCargueTo = !filters.dateCargueTo || cargueDate <= filters.dateCargueTo;

      return matchPlaca && matchDocL && matchStatus && matchPlanType && matchCargueFrom && matchCargueTo;
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [documents, filters]);

  const paginatedDocs = useMemo(() => {
    if (rowsPerPage === 'all') return filteredDocs;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredDocs.slice(start, start + rowsPerPage);
  }, [filteredDocs, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(filteredDocs.length / rowsPerPage);

  const clearFilters = () => {
    setFilters({ plate: '', docL: '', status: '', planType: '', dateCargueFrom: '', dateCargueTo: '' });
    setCurrentPage(1);
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 items-end">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">ID Pedido / Carga</label>
          <input type="text" placeholder="Buscar ID..." value={filters.docL} onChange={e => {setFilters({...filters, docL: e.target.value}); setCurrentPage(1);}} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500 transition-all" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">F. Cargue (Desde)</label>
          <input type="date" value={filters.dateCargueFrom} onChange={e => {setFilters({...filters, dateCargueFrom: e.target.value}); setCurrentPage(1);}} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">F. Cargue (Hasta)</label>
          <input type="date" value={filters.dateCargueTo} onChange={e => {setFilters({...filters, dateCargueTo: e.target.value}); setCurrentPage(1);}} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Tipo de Operación</label>
          <select value={filters.planType} onChange={e => {setFilters({...filters, planType: e.target.value}); setCurrentPage(1);}} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold outline-none uppercase cursor-pointer">
            <option value="">TODOS LOS PLANES</option>
            <option value="Plan Normal">ENTREGAS (NORMAL)</option>
            <option value="Plan R">RECOLECCIONES (R)</option>
          </select>
        </div>
        <button onClick={clearFilters} className="w-full py-5 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 shadow-xl transition-all active:scale-95">Limpiar Filtros</button>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 px-10">
           <div className="flex items-center gap-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filas:</label>
              <select value={rowsPerPage} onChange={e => {setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1);}} className="p-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase shadow-sm cursor-pointer outline-none focus:border-emerald-500">
                 <option value={5}>5</option>
                 <option value={10}>10</option>
                 <option value={20}>20</option>
                 <option value={50}>50</option>
                 <option value="all">Todas</option>
              </select>
           </div>
           <div className="flex items-center gap-6">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-30 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight className="rotate-180" /></button>
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Página {currentPage} de {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-30 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight /></button>
           </div>
        </div>
        
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
              <tr>
                <th className="p-8">Identificador / Placa</th>
                <th className="p-8">Ciudad de Destino</th>
                <th className="p-8 text-center">Tipo de Plan</th>
                <th className="p-8 text-center">Estado Logístico</th>
                <th className="p-8 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-all group/row">
                  <td className="p-8">
                    <p className="font-black text-slate-900 text-sm uppercase tracking-tight">{doc.externalDocId}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">PLACA: {doc.vehicleData}</p>
                  </td>
                  <td className="p-8 font-black text-slate-600 text-[11px] uppercase tracking-tight">{doc.city || 'PENDIENTE'}</td>
                  <td className="p-8 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase shadow-sm border ${doc.planType === 'Plan R' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      {doc.planType || 'Normal'}
                    </span>
                  </td>
                  <td className="p-8 text-center">
                    <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-inner ${doc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{doc.status}</span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => setSelectedDoc(doc)} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-90"><Icons.Eye /></button>
                  </td>
                </tr>
              ))}
              {paginatedDocs.length === 0 && <tr><td colSpan={5} className="py-20 text-center text-xs font-bold text-slate-300 uppercase tracking-[0.4em]">Sin resultados de auditoría</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DETALLE HISTÓRICO */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[400] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-10 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-6xl rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/10">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center text-slate-900 shadow-xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-3xl font-black uppercase tracking-tighter">Historial M7: {selectedDoc.externalDocId}</h3>
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-2 leading-none">Cierre de Inventario: <span className="text-emerald-400">{selectedDoc.inventoryDate ? new Date(selectedDoc.inventoryDate).toLocaleString() : 'PENDIENTE'}</span></p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedDoc(null)} className="text-4xl font-thin hover:text-red-500 transition-all">×</button>
              </div>
              <div className="p-10 md:p-14 overflow-y-auto space-y-10 custom-scrollbar bg-slate-50/20 flex-1">
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Estado</p><p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.status}</p></div>
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Placa Auditoría</p><p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.vehicleData || 'S/I'}</p></div>
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Destino Final</p><p className="font-black text-emerald-600 text-xs uppercase">{selectedDoc.city || 'S/I'}</p></div>
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo Plan</p><p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.planType || 'NORMAL'}</p></div>
                 </div>
                 <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border-4 border-slate-100">
                   <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-900 text-white uppercase tracking-widest font-black">
                        <tr>
                          <th className="p-8">Articulo / SKU</th>
                          <th className="p-8 text-center">Esperado</th>
                          <th className="p-8 text-center text-blue-400">Conteo 1</th>
                          <th className="p-8 text-center text-amber-400">Conteo 2</th>
                          <th className="p-8 text-center">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {selectedDoc.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-8 font-black uppercase text-slate-800 tracking-tight">{it.articleId}</td>
                            <td className="p-8 text-center text-slate-500">{it.expectedQty}</td>
                            <td className="p-8 text-center font-black text-blue-600 bg-blue-50/20">{it.count1 || 0}</td>
                            <td className="p-8 text-center font-black text-amber-600 bg-amber-50/20">{it.countedQty || 0}</td>
                            <td className="p-8 text-center">
                              <span className={`px-6 py-2 rounded-xl text-[9px] font-black uppercase shadow-sm ${it.countedQty === it.expectedQty ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                {it.countedQty === it.expectedQty ? 'CERRADO ✓' : 'NOVEDAD ⚠️'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                 </div>
              </div>
              <div className="p-10 border-t bg-white flex justify-end shrink-0">
                 <button onClick={() => setSelectedDoc(null)} className="px-14 py-6 bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-2xl active:scale-95">Cerrar Historial</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ConsultasDocumentosL;
