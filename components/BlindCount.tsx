
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '../constants';
import { Article, DocumentL, DocumentLItem, MasterRecord, DocStatus } from '../types';

interface BlindCountProps {
  document: DocumentL;
  masterNotificaciones: MasterRecord[];
  masterArticulo: MasterRecord[];
  onConfirm: (finalItems: DocumentLItem[], updateEmail?: string) => void;
  onCancel: () => void;
  onAddArticleToMaster: (article: Article) => void;
  onAddNotificationToMaster: (notif: Partial<MasterRecord>) => void;
}

const BlindCount: React.FC<BlindCountProps> = ({ 
  document: docL, 
  masterNotificaciones,
  masterArticulo,
  onConfirm, 
  onCancel,
  onAddArticleToMaster,
  onAddNotificationToMaster
}) => {
  const [scanInput, setScanInput] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [counts, setCounts] = useState<{ [articleId: string]: number }>({});
  const [count1Data, setCount1Data] = useState<{ [articleId: string]: number }>({});
  const [validationAttempts, setValidationAttempts] = useState(0); 
  const [lastScan, setLastScan] = useState<{ article: Article | null, message: string, status: 'success' | 'error' | 'new' } | null>(null);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // AGRUPACIÓN DE ITEMS POR SKU
  const groupedItems = useMemo(() => {
    const groups: { [id: string]: DocumentLItem } = {};
    docL.items.forEach(item => {
      const id = item.articleId.toUpperCase();
      if (!groups[id]) {
        groups[id] = { ...item, expectedQty: 0 };
      }
      groups[id].expectedQty += item.expectedQty;
    });
    return Object.values(groups);
  }, [docL.items]);

  // OFFLINE CACHE
  useEffect(() => {
    const saved = localStorage.getItem(`m7_offline_count_${docL.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setCounts(data.counts || {});
        setCount1Data(data.count1Data || {});
        setValidationAttempts(data.validationAttempts || 0);
      } catch (e) { console.error("Error cargando caché M7", e); }
    }
  }, [docL.id]);

  useEffect(() => {
    localStorage.setItem(`m7_offline_count_${docL.id}`, JSON.stringify({
      counts, count1Data, validationAttempts
    }));
  }, [counts, count1Data, validationAttempts, docL.id]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;

    const itemInDoc = groupedItems.find(it => it.articleId.toUpperCase() === input);
    if (!itemInDoc) {
      setLastScan({ article: null, message: `Código "${input}" fuera de plan.`, status: 'error' });
      setScanInput(''); return;
    }

    let articleMaster = (masterArticulo as Article[]).find(a => a.sku.toUpperCase() === input || a.barcode === input);
    if (!articleMaster) {
      const newArticle: Article = { 
        id: itemInDoc.articleId, sku: itemInDoc.articleId, barcode: itemInDoc.articleId, 
        name: `SINCRO M7: ${itemInDoc.articleId}`, clientId: docL.clientId, 
        factorInter: 1, factorStd: 1, createdBy: 'M7-SYS', 
        createdAt: new Date().toISOString(), updatedBy: 'M7-SYS', 
        updatedAt: new Date().toISOString(), statusId: 'EST-01' 
      };
      onAddArticleToMaster(newArticle);
      articleMaster = newArticle;
    }

    setCounts(prev => ({ ...prev, [itemInDoc.articleId]: (prev[itemInDoc.articleId] || 0) + 1 }));
    setLastScan({ article: articleMaster, message: `Detectado: ${articleMaster.name}`, status: 'success' });
    setScanInput('');
    inputRef.current?.focus();
  };

  const handleSubtract = (articleId: string) => {
    setCounts(prev => ({
      ...prev,
      [articleId]: Math.max(0, (prev[articleId] || 0) - 1)
    }));
  };

  const handleValidation = () => {
    const mismatches = groupedItems.filter(it => (counts[it.articleId] || 0) !== it.expectedQty);
    if (mismatches.length > 0 && validationAttempts === 0) {
      setCount1Data({ ...counts });
      setValidationAttempts(1);
      setLastScan({ article: null, message: "NOVEDADES DETECTADAS. REVICE LOS ITEMS.", status: 'error' });
      return;
    }
    const targetNotif = masterNotificaciones.find(n => n.tipoNotificacionId === 'TN-01' && n.statusId === 'EST-01');
    if (!targetNotif || !targetNotif.notificationEmail) setShowEmailInput(true);
    else finalizeProcess(targetNotif.notificationEmail);
  };

  const finalizeProcess = (email: string) => {
    setIsProcessing(true);
    const emailInMaster = masterNotificaciones.some(n => n.notificationEmail === email);
    if (!emailInMaster) {
      onAddNotificationToMaster({
        name: `AUTO-NOTIF: ${email}`,
        notificationEmail: email,
        tipoNotificacionId: 'TN-01',
        statusId: 'EST-01'
      });
    }
    setTimeout(() => {
      const finalItems: DocumentLItem[] = groupedItems.map(it => ({
        ...it,
        countedQty: counts[it.articleId] || 0,
        count1: count1Data[it.articleId] || 0,
        count2: counts[it.articleId] || 0,
        status: (counts[it.articleId] || 0) === it.expectedQty ? 'Matches' : 'Mismatch'
      }));
      localStorage.removeItem(`m7_offline_count_${docL.id}`);
      onConfirm(finalItems, email);
      setIsProcessing(false);
    }, 1500);
  };

  const filteredItems = useMemo(() => {
    if (!tableSearch) return groupedItems;
    return groupedItems.filter(it => it.articleId.toLowerCase().includes(tableSearch.toLowerCase()));
  }, [groupedItems, tableSearch]);

  return (
    <div className="bg-white rounded-[3rem] shadow-[0_25px_100px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden w-full max-w-[98%] mx-auto animate-in fade-in zoom-in-95 duration-500 flex flex-col min-h-[700px]">
      {/* HEADER DINÁMICO */}
      <div className="bg-slate-900 px-10 py-6 text-white flex justify-between items-center shrink-0 border-b border-white/5">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20"><Icons.Scan /></div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight leading-none">Recibo Auditoría: {docL.externalDocId}</h2>
            <div className="flex items-center gap-3 mt-2">
               <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${validationAttempts === 0 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                 {validationAttempts === 0 ? 'Fase 1: Conteo Inicial' : 'Fase 2: Resolución de Novedades'}
               </span>
               <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{docL.vehicleData}</span>
            </div>
          </div>
        </div>
        <button onClick={() => { localStorage.removeItem(`m7_offline_count_${docL.id}`); onCancel(); }} className="text-slate-500 hover:text-red-500 transition-all text-5xl font-thin">&times;</button>
      </div>

      {/* CONTENIDO PRINCIPAL: CRECE CON EL CONTENIDO */}
      <div className="p-8 flex flex-col lg:flex-row gap-8 flex-1 bg-slate-50/20">
        
        {/* PANEL IZQUIERDO: SCANNER (Sticky para no perderlo al scrollar) */}
        <div className="w-full lg:w-96 space-y-6 shrink-0">
           <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 sticky top-8">
              <form onSubmit={handleScan} className="space-y-2 mb-8">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Escanear Referencia</label>
                 <div className="relative group">
                   <input 
                     ref={inputRef}
                     type="text" 
                     value={scanInput} 
                     onChange={e => setScanInput(e.target.value)} 
                     placeholder="SKU..." 
                     autoFocus 
                     className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-3xl uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner group-hover:border-slate-200"
                   />
                   <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors"><Icons.Search /></div>
                 </div>
              </form>

              {lastScan && (
                <div className={`p-6 rounded-3xl border-2 animate-in slide-in-from-left-4 shadow-sm ${lastScan.status === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                   <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${lastScan.status === 'success' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-red-500 text-white shadow-lg'}`}>
                         {lastScan.status === 'success' ? <Icons.Check /> : <Icons.Alert />}
                      </div>
                      <div className="min-w-0 flex-1">
                         <p className={`font-black text-[10px] uppercase truncate ${lastScan.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{lastScan.message}</p>
                         {lastScan.article && (
                           <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-black text-slate-950 tracking-tighter">{counts[lastScan.article.id]}</span>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidades</span>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
              )}

              <div className="mt-10 grid grid-cols-2 gap-4">
                 <div className="bg-slate-900 p-6 rounded-[2rem] text-center text-white shadow-xl">
                    <p className="text-3xl font-black text-emerald-400 leading-none">{Object.keys(counts).length}</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Items</p>
                 </div>
                 <div className="bg-slate-900 p-6 rounded-[2rem] text-center text-white shadow-xl">
                    <p className="text-3xl font-black text-white leading-none">{groupedItems.length}</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Plan</p>
                 </div>
              </div>
           </div>
        </div>

        {/* PANEL DERECHO: RESULTADOS / TABLA */}
        <div className="flex-1 flex flex-col min-h-0">
           <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col">
              {/* FILTRO DE TABLA */}
              <div className="p-6 border-b border-slate-50 bg-white flex items-center justify-between shrink-0">
                 <div className="relative flex-1 max-w-md">
                    <Icons.Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                    <input 
                      type="text" 
                      value={tableSearch}
                      onChange={e => setTableSearch(e.target.value)}
                      placeholder="BUSCAR EN LISTADO DE AUDITORÍA..." 
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-[10px] font-black uppercase outline-none focus:bg-white focus:border-emerald-500 transition-all"
                    />
                 </div>
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">M7 Auditoría en Vivo</span>
                    </div>
                 </div>
              </div>

              {/* LISTA DE ITEMS - SIN LIMITES RÍGIDOS */}
              <div className="flex-1 overflow-visible">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[10px]">
                       <tr>
                          <th className="px-10 py-6">Referencia Artículo / SKU</th>
                          <th className="px-10 py-6 text-center">Contado</th>
                          <th className="px-10 py-6 text-right pr-16">Corrección</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {filteredItems.map(it => {
                         const currentCount = counts[it.articleId] || 0;
                         const isNovedad = validationAttempts > 0 && currentCount !== it.expectedQty;
                         return (
                           <tr key={it.articleId} className={`hover:bg-slate-50 transition-all font-bold group ${isNovedad ? 'bg-red-50/50' : ''}`}>
                              <td className="px-10 py-5">
                                 <p className="font-black text-slate-950 text-base uppercase tracking-tight leading-none">{it.articleId}</p>
                                 <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1.5 font-black">Línea Auditoría M7</p>
                              </td>
                              <td className="px-10 py-5 text-center">
                                 <div className={`inline-flex items-center justify-center min-w-[80px] h-14 rounded-2xl text-2xl font-black shadow-inner transition-all ${currentCount > 0 ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-slate-100 text-slate-300'}`}>
                                    {currentCount}
                                 </div>
                              </td>
                              <td className="px-10 py-5 text-right pr-16">
                                 <button 
                                   onClick={() => handleSubtract(it.articleId)}
                                   disabled={currentCount === 0}
                                   className="inline-flex items-center justify-center w-12 h-12 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all shadow-lg active:scale-90 disabled:opacity-10"
                                 >
                                    <Icons.X className="w-6 h-6 stroke-[4px]" />
                                 </button>
                              </td>
                           </tr>
                         );
                       })}
                       {filteredItems.length === 0 && (
                         <tr>
                           <td colSpan={3} className="py-32 text-center">
                              <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.5em]">Sin coincidencias en auditoría</p>
                           </td>
                         </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      </div>

      {/* FOOTER: INTEGRADO AL FLUJO (NO ABSOLUTO) */}
      <div className="px-10 py-8 border-t bg-white flex flex-col md:flex-row gap-6 shrink-0 items-center">
         <button onClick={onCancel} className="w-full md:w-auto px-12 py-5 bg-white border-2 border-slate-200 rounded-[2rem] font-black text-[10px] uppercase text-slate-400 hover:bg-slate-100 transition-all shadow-sm">Cancelar Auditoría</button>
         <button 
            onClick={handleValidation}
            disabled={isProcessing || Object.keys(counts).length === 0}
            className="flex-1 w-full py-6 bg-slate-950 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] shadow-2xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-6"
         >
            {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full"></div> : <Icons.Signature className="w-6 h-6" />}
            {validationAttempts === 0 ? 'SINCRONIZAR Y VALIDAR CONTEO' : 'FINALIZAR AUDITORÍA CON NOVEDADES'}
         </button>
      </div>

      {/* MODAL EMAIL: CAPTURA SI NO EXISTE MAESTRO */}
      {showEmailInput && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-lg rounded-[4rem] p-14 text-center space-y-10 shadow-2xl border border-white/5">
              <div className="w-20 h-20 bg-emerald-500 text-slate-950 rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20 animate-bounce"><Icons.List className="w-8 h-8" /></div>
              <div className="space-y-4">
                 <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Reporte Ajover</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">No hay un correo configurado para esta operación. Ingrese el destino del informe.</p>
              </div>
              <input 
                type="email" 
                value={manualEmail} 
                onChange={e => setManualEmail(e.target.value)} 
                placeholder="DESTINO@AJOVER.COM"
                className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] font-black text-center text-sm outline-none focus:border-emerald-500 focus:bg-white shadow-inner transition-all"
              />
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => finalizeProcess(manualEmail)}
                  disabled={!manualEmail.includes('@')}
                  className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all disabled:opacity-20 active:scale-95"
                >
                  ENVIAR Y CERRAR AUDITORÍA
                </button>
                <button onClick={() => setShowEmailInput(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Volver a Revisión</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BlindCount;
