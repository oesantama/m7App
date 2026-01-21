
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Article, DocumentLItem } from '../types';
import BlindCount from './BlindCount';

interface RecibidoMaterialProps {
  documents: DocumentL[];
  user: User;
  masterEstados: MasterRecord[];
  masterNotificaciones: MasterRecord[];
  masterArticulo: MasterRecord[];
  onUpdateDocuments: (docs: DocumentL[]) => void;
  onAddArticleToMaster: (article: Article) => void;
  onAddNotificationToMaster: (notif: Partial<MasterRecord>) => void;
  onUpdateNotificationEmail?: (email: string) => void;
}

const RecibidoMaterial: React.FC<RecibidoMaterialProps> = ({ 
  documents, user, masterEstados, masterNotificaciones, masterArticulo, onUpdateDocuments, onAddArticleToMaster, onAddNotificationToMaster, onUpdateNotificationEmail
}) => {
  const [selectedDocForCount, setSelectedDocForCount] = useState<DocumentL | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const pendingRecibo = useMemo(() => 
    documents.filter(d => d.status === DocStatus.PENDING || d.status === DocStatus.COUNTING),
    [documents]
  );

  const paginatedPending = useMemo(() => {
    if (rowsPerPage === 'all') return pendingRecibo;
    const start = (currentPage - 1) * rowsPerPage;
    return pendingRecibo.slice(start, start + rowsPerPage);
  }, [pendingRecibo, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(pendingRecibo.length / rowsPerPage);

  const handleStartCount = (doc: DocumentL) => {
    const updatedDocs = documents.map(d => d.id === doc.id ? { ...d, status: DocStatus.COUNTING, updatedBy: user.name, updatedAt: new Date().toISOString() } : d);
    onUpdateDocuments(updatedDocs);
    setSelectedDocForCount({ ...doc, status: DocStatus.COUNTING });
  };

  const handleFinishCount = (finalItems: DocumentLItem[], updateEmail?: string) => {
    if (!selectedDocForCount) return;

    if (updateEmail && onUpdateNotificationEmail) {
      onUpdateNotificationEmail(updateEmail);
    }

    const updatedDocs = documents.map(d => 
      d.id === selectedDocForCount.id 
        ? { 
            ...d, 
            items: finalItems, 
            status: DocStatus.INVENTORED, 
            inventoryDate: new Date().toISOString(),
            inventoryUser: user.name,
            updatedBy: user.name, 
            updatedAt: new Date().toISOString() 
          } 
        : d
    );
    
    onUpdateDocuments(updatedDocs);
    setSelectedDocForCount(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-10 h-full flex flex-col overflow-hidden">
      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 flex justify-between items-center shrink-0 transition-all">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-900 rounded-[1.8rem] flex items-center justify-center text-emerald-500 shadow-2xl"><Icons.Scan /></div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">M7 Recibo Físico</h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">Auditoría de Mercancía • Sincronización en Tiempo Real</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {selectedDocForCount ? (
          <BlindCount 
            document={selectedDocForCount} 
            masterNotificaciones={masterNotificaciones} 
            masterArticulo={masterArticulo} 
            onConfirm={handleFinishCount} 
            onCancel={() => setSelectedDocForCount(null)} 
            onAddArticleToMaster={onAddArticleToMaster}
            onAddNotificationToMaster={onAddNotificationToMaster}
          />
        ) : (
          <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden h-full flex flex-col">
            {/* SUBHEADER DE CONTROL */}
            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center shrink-0 px-10">
               <div className="flex items-center gap-6">
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Planes en Espera</h3>
                  <span className="px-5 py-2 bg-emerald-500 text-slate-950 rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-emerald-500/20">{pendingRecibo.length} CARGUES ACTIVOS</span>
               </div>
               <div className="flex items-center gap-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filas por página:</label>
                  <select value={rowsPerPage} onChange={e => {setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1);}} className="p-3 bg-white border-2 border-slate-100 rounded-xl text-[11px] font-black uppercase outline-none focus:border-emerald-500 shadow-sm cursor-pointer">
                     <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value="all">Ver Todas</option>
                  </select>
               </div>
            </div>
            
            <div className="p-10 flex-1 overflow-y-auto custom-scrollbar bg-slate-50/10">
              <div className="w-full max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
                {paginatedPending.map(doc => (
                  <div key={doc.id} className="flex flex-col p-8 bg-white border-2 border-slate-100 rounded-[3rem] hover:border-emerald-500 transition-all group shadow-lg hover:shadow-2xl relative overflow-hidden">
                    <div className={`absolute top-0 left-0 bottom-0 w-2 ${doc.status === DocStatus.COUNTING ? 'bg-blue-500' : 'bg-amber-400'}`}></div>
                    
                    <div className="flex justify-between items-start mb-8 pl-2">
                      <div className={`w-16 h-16 rounded-[1.6rem] flex items-center justify-center shadow-xl ${doc.status === DocStatus.COUNTING ? 'bg-blue-900 text-blue-400 animate-pulse' : 'bg-slate-900 text-emerald-500'}`}>
                        <Icons.Package />
                      </div>
                      <div className="text-right">
                         <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase border tracking-widest shadow-sm ${doc.status === DocStatus.COUNTING ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                           {doc.status}
                         </span>
                         <p className="text-[10px] text-slate-400 font-black uppercase mt-3 tracking-widest">{new Date(doc.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="pl-2 space-y-4">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Documento L</p>
                          <h4 className="font-black text-slate-900 uppercase text-3xl tracking-tighter truncate">{doc.externalDocId}</h4>
                        </div>

                        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-2">
                           <div className="flex justify-between items-center">
                              <span className="text-[9px] font-black text-slate-400 uppercase">Vehículo / Placa:</span>
                              <span className="text-[11px] font-black text-slate-900 uppercase">{doc.vehicleData || 'SIN ASIGNAR'}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="text-[9px] font-black text-slate-400 uppercase">Líneas a Contar:</span>
                              <span className="text-[11px] font-black text-emerald-600 uppercase">{doc.items.length} ITEMS</span>
                           </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-50 pl-2">
                       <button onClick={() => handleStartCount(doc)} className="w-full py-5 bg-slate-900 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3">
                          {doc.status === DocStatus.COUNTING ? <Icons.Audit /> : <Icons.Signature />}
                          {doc.status === DocStatus.COUNTING ? 'CONTINUAR AUDITORÍA' : 'INICIAR VALIDACIÓN'}
                       </button>
                    </div>
                  </div>
                ))}
                {pendingRecibo.length === 0 && (
                  <div className="col-span-full py-40 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 border-4 border-dashed border-slate-100"><Icons.Check /></div>
                    <h4 className="text-2xl font-black text-slate-200 uppercase tracking-[0.5em] animate-pulse">Operación al día</h4>
                  </div>
                )}
              </div>
            </div>

            {/* PAGINACIÓN INFERIOR */}
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-center items-center gap-10 shrink-0">
               <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-4 bg-white border-2 border-slate-200 rounded-2xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 hover:border-emerald-500 transition-all shadow-md active:scale-90"><Icons.ChevronRight className="rotate-180" /></button>
               <div className="flex flex-col items-center">
                  <span className="text-[12px] font-black uppercase text-slate-900 tracking-widest">Página {currentPage} de {totalPages || 1}</span>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Navegación M7</p>
               </div>
               <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-4 bg-white border-2 border-slate-200 rounded-2xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 hover:border-emerald-500 transition-all shadow-md active:scale-90"><Icons.ChevronRight /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecibidoMaterial;
