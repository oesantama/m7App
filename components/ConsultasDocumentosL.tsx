
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
      {/* PANEL DE FILTROS OPTIMIZADO */}
      <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Fila 1 */}
          <div className="space-y-1">
            <label className={labelClass}>Placa</label>
            <input type="text" placeholder="PLACA..." value={filters.plate} onChange={e => {setFilters({...filters, plate: e.target.value}); setCurrentPage(1);}} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Documento L</label>
            <input type="text" placeholder="DOCUMENTO L..." value={filters.docL} onChange={e => {setFilters({...filters, docL: e.target.value}); setCurrentPage(1);}} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>CodPlan</label>
            <input type="text" placeholder="CODPLAN..." value={filters.codplan} onChange={e => {setFilters({...filters, codplan: e.target.value}); setCurrentPage(1);}} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Tipo Operación</label>
            <select value={filters.planType} onChange={e => {setFilters({...filters, planType: e.target.value}); setCurrentPage(1);}} className={inputClass}>
              <option value="">TODOS</option>
              <option value="Plan Normal">PLAN NORMAL</option>
              <option value="Plan R">PLAN R</option>
            </select>
          </div>

          {/* Fila 2 */}
          <div className="space-y-1">
            <label className={labelClass}>Estado</label>
            <select value={filters.status} onChange={e => {setFilters({...filters, status: e.target.value}); setCurrentPage(1);}} className={inputClass}>
              <option value="">TODOS</option>
              {Object.values(DocStatus).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Fecha Envío</label>
            <input type="date" value={filters.deliveryDate} onChange={e => {setFilters({...filters, deliveryDate: e.target.value}); setCurrentPage(1);}} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Fecha Cargue</label>
            <input type="date" value={filters.cargueDate} onChange={e => {setFilters({...filters, cargueDate: e.target.value}); setCurrentPage(1);}} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Fecha Inventario</label>
            <input type="date" value={filters.inventoryDate} onChange={e => {setFilters({...filters, inventoryDate: e.target.value}); setCurrentPage(1);}} className={inputClass} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={clearFilters} className="px-10 py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 shadow-xl transition-all active:scale-95 flex items-center gap-3">
             <Icons.X /> Limpiar Filtros
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 px-10">
           <div className="flex items-center gap-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mostrar:</label>
              <select value={rowsPerPage} onChange={e => {setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1);}} className="p-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase shadow-sm outline-none">
                 <option value={5}>5</option>
                 <option value={10}>10</option>
                 <option value={20}>20</option>
                 <option value={50}>50</option>
                 <option value="all">Todas</option>
              </select>
           </div>
           <div className="flex items-center gap-6">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-30 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight className="rotate-180" /></button>
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Página {currentPage} de {totalPages || 1}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-30 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight /></button>
           </div>
        </div>
        
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
              <tr>
                <th className="p-8">Documento / Placa</th>
                <th className="p-8">CodPlan</th>
                <th className="p-8">F. Envío</th>
                <th className="p-8 text-center">Estado</th>
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
                  <td className="p-8 font-black text-slate-600 text-[11px] uppercase tracking-tight">{doc.codplan || 'S/I'}</td>
                  <td className="p-8 font-black text-slate-400 text-[10px] uppercase tracking-tight">{doc.deliveryDate || 'S/I'}</td>
                  <td className="p-8 text-center">
                    <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-inner ${doc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{doc.status}</span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => setSelectedDoc(doc)} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm active:scale-90"><Icons.Eye /></button>
                  </td>
                </tr>
              ))}
              {paginatedDocs.length === 0 && <tr><td colSpan={5} className="py-20 text-center text-xs font-bold text-slate-300 uppercase tracking-[0.4em]">Sin resultados históricos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDoc && (
        <div className="fixed inset-0 z-[400] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-10 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-[98vw] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/10">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center text-slate-900 shadow-xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-3xl font-black uppercase tracking-tighter">Expediente M7: {selectedDoc.externalDocId}</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase mt-2">Detalle Histórico Global</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedDoc(null)} className="text-4xl font-thin hover:text-red-500 transition-all">×</button>
              </div>
              <div className="p-10 md:p-14 overflow-y-auto space-y-10 custom-scrollbar bg-slate-50/20 flex-1">
                 <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">CodPlan</p><p className="font-black text-slate-900 text-[10px] uppercase">{selectedDoc.codplan || 'S/I'}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Envío</p><p className="font-black text-slate-900 text-[10px] uppercase">{selectedDoc.deliveryDate || 'S/I'}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Placa</p><p className="font-black text-slate-900 text-[10px] uppercase">{selectedDoc.vehicleData}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Documento L</p><p className="font-black text-slate-900 text-[10px] uppercase">{selectedDoc.externalDocId}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Cargue</p><p className="font-black text-slate-900 text-[10px] uppercase">{new Date(selectedDoc.createdAt).toLocaleDateString('es-CO')}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Cargue</p><p className="font-black text-slate-900 text-[10px] uppercase truncate">{selectedDoc.createdBy}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Estado</p><p className="font-black text-emerald-600 text-[10px] uppercase">{selectedDoc.status}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Inventario</p><p className="font-black text-slate-900 text-[10px] uppercase">{selectedDoc.inventoryDate ? new Date(selectedDoc.inventoryDate).toLocaleDateString('es-CO') : 'N/A'}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Inventario</p><p className="font-black text-slate-900 text-[10px] uppercase truncate">{selectedDoc.inventoryUser || selectedDoc.updatedBy}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Observación</p><p className="font-black text-slate-900 text-[10px] uppercase truncate">{selectedDoc.inventoryNotes || 'S/O'}</p></div>
                 </div>

                 <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border-4 border-slate-100">
                   <table className="w-full text-left text-[10px]">
                      <thead className="bg-slate-900 text-white uppercase tracking-widest font-black">
                        <tr>
                          <th className="p-6">Articulo / SKU</th>
                          <th className="p-6 text-center">Nº Ped</th>
                          <th className="p-6 text-center">Cant. Exp</th>
                          <th className="p-6 text-center">UM</th>
                          <th className="p-6 text-center">Vol. Total</th>
                          <th className="p-6 text-center">Vol. Unit</th>
                          <th className="p-6">Notas Inv.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {selectedDoc.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-6 font-black uppercase text-slate-800 tracking-tight">{it.articleId}</td>
                            <td className="p-6 text-center text-emerald-600 font-black">{it.orderNumber || 'S/I'}</td>
                            <td className="p-6 text-center text-slate-900">{it.expectedQty}</td>
                            <td className="p-6 text-center text-blue-600 font-black">{it.unit || 'und'}</td>
                            <td className="p-6 text-center">{it.volume || '0'}</td>
                            <td className="p-6 text-center text-slate-400 italic">{it.unitVolume || '0'}</td>
                            <td className="p-6 text-[9px] uppercase italic text-slate-400 truncate max-w-[150px]">{it.inventoryNote || 'S/N'}</td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                 </div>
              </div>
              <div className="p-10 border-t bg-white flex justify-end shrink-0">
                 <button onClick={() => setSelectedDoc(null)} className="px-14 py-6 bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-red-700 shadow-2xl active:scale-95">Cerrar Expediente Histórico</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ConsultasDocumentosL;
