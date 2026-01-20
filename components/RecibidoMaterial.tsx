
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
  onUpdateNotificationEmail?: (email: string) => void;
}

const RecibidoMaterial: React.FC<RecibidoMaterialProps> = ({ 
  documents, user, masterEstados, masterNotificaciones, masterArticulo, onUpdateDocuments, onAddArticleToMaster, onUpdateNotificationEmail
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

    // Si el usuario ingresó un correo manual, se debería persistir en la lógica del sistema (opcional según el backend)
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
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 h-full flex flex-col overflow-hidden">
      <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-8">
          <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center text-emerald-500 shadow-2xl"><Icons.Scan /></div>
          <div>
            <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">M7 Recibo Físico</h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">Auditoría de Mercancía con Soporte Offline</p>
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
          />
        ) : (
          <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden h-full flex flex-col">
            <div className="p-10 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4">
                  <h3 className="text-xl font-black text-slate-900 uppercase">Planes en Espera</h3>
                  <span className="px-4 py-1.5 bg-emerald-500 text-slate-950 rounded-full text-[9px] font-black uppercase">{pendingRecibo.length} CARGUES</span>
               </div>
               <div className="flex items-center gap-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filas:</label>
                  <select value={rowsPerPage} onChange={e => {setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1);}} className="p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-sm">
                     <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value="all">Todas</option>
                  </select>
               </div>
            </div>
            
            <div className="p-10 flex-1 overflow-y-auto custom-scrollbar">
              <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                {paginatedPending.map(doc => (
                  <div key={doc.id} className="flex flex-col p-10 bg-white border-2 border-slate-100 rounded-[3.5rem] hover:border-emerald-500 transition-all group shadow-xl hover:shadow-emerald-500/10">
                    <div className="flex justify-between items-start mb-8">
                      <div className={`w-20 h-20 rounded-[2.2rem] flex items-center justify-center shadow-2xl ${doc.status === DocStatus.COUNTING ? 'bg-blue-900 text-blue-400 animate-pulse' : 'bg-slate-900 text-emerald-500'}`}><Icons.Package /></div>
                      <div className="text-right">
                         <span className={`px-4 py-2 rounded-full text-[8px] font-black uppercase border tracking-widest ${doc.status === DocStatus.COUNTING ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{doc.status}</span>
                         <p className="text-[9px] text-slate-400 font-black uppercase mt-3 tracking-widest">{new Date(doc.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div>
                        <h4 className="font-black text-slate-900 uppercase text-3xl tracking-tighter truncate">{doc.externalDocId}</h4>
                        <div className="flex items-center gap-4 mt-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PLACA: {doc.vehicleData || 'S/I'}</p>
                        </div>
                    </div>
                    <div className="mt-10 pt-8 border-t border-slate-50">
                       <button onClick={() => handleStartCount(doc)} className="w-full px-10 py-5 bg-slate-900 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-xl active:scale-95">
                          {doc.status === DocStatus.COUNTING ? 'CONTINUAR AUDITORÍA' : 'INICIAR VALIDACIÓN'}
                       </button>
                    </div>
                  </div>
                ))}
                {pendingRecibo.length === 0 && <div className="col-span-full py-40 text-center"><h4 className="text-2xl font-black text-slate-200 uppercase tracking-[0.5em] animate-pulse">Operación al día</h4></div>}
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-center items-center gap-8 shrink-0">
               <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight className="rotate-180" /></button>
               <span className="text-[11px] font-black uppercase text-slate-900 tracking-widest">Página {currentPage} de {totalPages || 1}</span>
               <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecibidoMaterial;
