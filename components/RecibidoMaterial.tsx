
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
    const updatedDocs = documents.map(d => d.id === selectedDocForCount.id ? { ...d, items: finalItems, status: DocStatus.INVENTORED, updatedBy: user.name, updatedAt: new Date().toISOString() } : d);
    onUpdateDocuments(updatedDocs);
    setSelectedDocForCount(null);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center text-emerald-500 shadow-2xl"><Icons.Scan /></div>
          <div><h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">M7 Recibo Físico</h2></div>
        </div>
      </div>

      <div className="min-h-[700px]">
        {selectedDocForCount ? (
          <BlindCount document={selectedDocForCount} masterNotificaciones={masterNotificaciones} masterArticulo={masterArticulo} onConfirm={handleFinishCount} onCancel={() => setSelectedDocForCount(null)} onAddArticleToMaster={onAddArticleToMaster} />
        ) : (
          <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[700px] flex flex-col">
            <div className="p-10 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
               <h3 className="text-xl font-black text-slate-900 uppercase">Planes para Auditoría</h3>
               <div className="flex items-center gap-4">
                  <select value={rowsPerPage} onChange={e => {setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1);}} className="p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase">
                     <option value={5}>5 Filas</option><option value={10}>10 Filas</option><option value={20}>20 Filas</option><option value="all">Todas</option>
                  </select>
               </div>
            </div>
            <div className="p-10 flex-1 overflow-y-auto custom-scrollbar">
              <div className="max-w-5xl mx-auto space-y-6">
                {paginatedPending.map(doc => (
                  <div key={doc.id} className="flex flex-col xl:flex-row items-center justify-between p-8 bg-white border-4 border-slate-50 rounded-[3rem] hover:border-emerald-500 transition-all group shadow-sm">
                    <div className="flex items-center gap-8">
                      <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-inner ${doc.status === DocStatus.COUNTING ? 'bg-blue-900 text-blue-400' : 'bg-slate-100 text-slate-300 group-hover:bg-slate-900 group-hover:text-emerald-500'}`}><Icons.Package /></div>
                      <div>
                        <h4 className="font-black text-slate-900 uppercase text-2xl">{doc.externalDocId}</h4>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa: {doc.vehicleData || 'S/I'}</p>
                      </div>
                    </div>
                    <button onClick={() => handleStartCount(doc)} className="w-full xl:w-auto px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl">INICIAR VALIDACIÓN</button>
                  </div>
                ))}
                {pendingRecibo.length === 0 && <div className="p-40 text-center"><h4 className="text-2xl font-black text-slate-200 uppercase tracking-[0.5em]">Operación al día</h4></div>}
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-center gap-4">
               <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-3 bg-white border border-slate-200 rounded-xl disabled:opacity-30"><Icons.ChevronRight className="rotate-180" /></button>
               <span className="text-[11px] font-black uppercase mt-2">Página {currentPage} de {totalPages}</span>
               <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-3 bg-white border border-slate-200 rounded-xl disabled:opacity-30"><Icons.ChevronRight /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecibidoMaterial;
