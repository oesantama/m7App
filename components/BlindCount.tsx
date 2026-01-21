
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
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

  const handleValidationTrigger = () => {
    const mismatches = groupedItems.filter(it => (counts[it.articleId] || 0) !== it.expectedQty);
    
    if (mismatches.length > 0 && validationAttempts === 0) {
      setCount1Data({ ...counts });
      setValidationAttempts(1);
      setLastScan({ article: null, message: "NOVEDADES DETECTADAS. REVISIÓN ACTIVADA.", status: 'error' });
      return;
    }

    setShowConfirmDialog(true);
  };

  const proceedToFinalize = () => {
    setShowConfirmDialog(false);
    const targetNotif = masterNotificaciones.find(n => n.tipoNotificacionId === 'TN-01' && n.statusId === 'EST-01');
    
    if (!targetNotif || !targetNotif.notificationEmail) {
      setShowEmailInput(true);
    } else {
      finalizeProcess(targetNotif.notificationEmail);
    }
  };

  const finalizeProcess = (email: string) => {
    setIsProcessing(true);
    
    const emailInMaster = masterNotificaciones.some(n => n.notificationEmail === email && n.tipoNotificacionId === 'TN-01');
    if (!emailInMaster) {
      onAddNotificationToMaster({
        name: `REGISTRO AUTO M7: ${email}`,
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
      setSaveSuccess(true);
      
      setTimeout(() => {
        onConfirm(finalItems, email);
        setIsProcessing(false);
      }, 2000);
    }, 1500);
  };

  // Lógica de filtrado: 
  // 1. Si validationAttempts es 0, mostramos los que tienen algún conteo (conteo ciego).
  // 2. Si validationAttempts es 1, mostramos ÚNICAMENTE los que tienen novedad.
  const filteredItems = useMemo(() => {
    let baseList = groupedItems;
    if (validationAttempts === 0) {
      // En conteo inicial, solo mostramos lo que se ha escaneado para mantener el ciego
      baseList = groupedItems.filter(it => (counts[it.articleId] || 0) > 0);
    } else {
      // Tras validar, ocultamos los OK y solo mostramos NOVEDADES
      baseList = groupedItems.filter(it => (counts[it.articleId] || 0) !== it.expectedQty);
    }

    if (!tableSearch) return baseList;
    return baseList.filter(it => it.articleId.toLowerCase().includes(tableSearch.toLowerCase()));
  }, [groupedItems, tableSearch, validationAttempts, counts]);

  return (
    <div className="bg-white rounded-[2.5rem] shadow-[0_20px_100px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden w-full max-w-[98%] mx-auto animate-in fade-in zoom-in-95 duration-500 flex flex-col h-full relative">
      
      {/* ÉXITO OVERLAY */}
      {saveSuccess && (
        <div className="absolute inset-0 z-[700] bg-emerald-500 flex flex-col items-center justify-center text-slate-950 animate-in fade-in duration-500">
           <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl mb-6 animate-bounce">
              <Icons.Check className="w-12 h-12" />
           </div>
           <h2 className="text-4xl font-black uppercase tracking-tighter text-center">Inventario Guardado Exitoso</h2>
           <p className="text-sm font-bold uppercase tracking-widest mt-2 opacity-60">M7 Logística Sincronizada</p>
        </div>
      )}

      {/* HEADER COMPACTO CON BOTONES */}
      <div className="bg-slate-900 px-8 py-4 text-white flex justify-between items-center shrink-0 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 shadow-lg"><Icons.Scan /></div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black uppercase tracking-tight leading-none">Recibo Auditoría: {docL.externalDocId}</h2>
              <span className="text-[10px] text-slate-500 font-bold uppercase bg-slate-800 px-3 py-1 rounded-lg border border-white/5">{docL.vehicleData}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
               <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${validationAttempts === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                 {validationAttempts === 0 ? 'Fase 1: Conteo en Vivo' : 'Fase 2: Resolución de Novedades'}
               </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <button onClick={onCancel} className="px-5 py-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">Cancelar</button>
           <button 
              onClick={handleValidationTrigger}
              disabled={isProcessing || Object.keys(counts).length === 0}
              className="px-6 py-2.5 bg-emerald-500 text-slate-950 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all flex items-center gap-2 disabled:opacity-20 active:scale-95"
           >
              {isProcessing ? <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent animate-spin rounded-full"></div> : <Icons.Signature className="w-3.5 h-3.5" />}
              {validationAttempts === 0 ? 'Sincronizar Conteo' : 'Validar y Finalizar'}
           </button>
           <div className="w-[1px] h-8 bg-white/10 mx-2"></div>
           <button onClick={() => { localStorage.removeItem(`m7_offline_count_${docL.id}`); onCancel(); }} className="text-slate-500 hover:text-red-500 transition-all text-4xl font-thin leading-none">&times;</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 min-h-0 bg-slate-50/20 overflow-hidden">
        {/* PANEL IZQUIERDO: SCANNER */}
        <div className="w-full lg:w-72 space-y-4 shrink-0 flex flex-col">
           <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-4">
              <form onSubmit={handleScan} className="space-y-1">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Escanear Referencia</label>
                 <div className="relative group">
                   <input 
                     ref={inputRef}
                     type="text" 
                     value={scanInput} 
                     onChange={e => setScanInput(e.target.value)} 
                     placeholder="SKU..." 
                     autoFocus 
                     className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-2xl uppercase outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                   />
                   <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-emerald-500 transition-colors"><Icons.Search className="w-4 h-4" /></div>
                 </div>
              </form>

              {lastScan && (
                <div className={`p-4 rounded-2xl border-2 animate-in slide-in-from-left-4 shadow-sm ${lastScan.status === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                   <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${lastScan.status === 'success' ? 'bg-emerald-500 text-white shadow-md' : 'bg-red-500 text-white shadow-md'}`}>
                         {lastScan.status === 'success' ? <Icons.Check /> : <Icons.Alert />}
                      </div>
                      <div className="min-w-0 flex-1">
                         <p className={`font-black text-[8px] uppercase truncate ${lastScan.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{lastScan.message}</p>
                         {lastScan.article && (
                           <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-2xl font-black text-slate-950 tracking-tighter">{counts[lastScan.article.id]}</span>
                              <span className="text-[8px] font-black text-slate-400 uppercase">Unds</span>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
              )}
           </div>

           <div className="mt-auto bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
              <div className="grid grid-cols-2 gap-4">
                 <div className="text-center">
                    <p className="text-2xl font-black text-emerald-400 leading-none">{Object.keys(counts).length}</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Items</p>
                 </div>
                 <div className="text-center">
                    <p className="text-2xl font-black text-white leading-none">{groupedItems.length}</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Plan</p>
                 </div>
              </div>
           </div>
        </div>

        {/* PANEL DERECHO: TABLA CON SCROLL */}
        <div className="flex-1 flex flex-col min-h-0">
           <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col flex-1">
              <div className="p-4 border-b border-slate-50 bg-white flex items-center shrink-0">
                 <div className="relative flex-1 max-w-xs">
                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                    <input 
                      type="text" 
                      value={tableSearch}
                      onChange={e => setTableSearch(e.target.value)}
                      placeholder="FILTRAR LISTADO..." 
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border-2 border-transparent rounded-lg text-[9px] font-black uppercase outline-none focus:bg-white focus:border-emerald-500 transition-all"
                    />
                 </div>
                 {validationAttempts === 1 && (
                    <div className="ml-4 flex items-center gap-2 text-red-600 animate-pulse">
                       <Icons.Alert className="w-3 h-3" />
                       <span className="text-[8px] font-black uppercase">Mostrando únicamente novedades por resolver</span>
                    </div>
                 )}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
                 <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] sticky top-0 z-10 shadow-sm">
                       <tr>
                          <th className="px-8 py-4">Artículo / Referencia</th>
                          <th className="px-8 py-4 text-center">Estado</th>
                          <th className="px-8 py-4 text-center">Auditado</th>
                          <th className="px-8 py-4 text-right pr-12">Acción</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {filteredItems.map(it => {
                         const currentCount = counts[it.articleId] || 0;
                         const isNovedad = currentCount !== it.expectedQty;
                         return (
                           <tr key={it.articleId} className={`hover:bg-slate-50/50 transition-all font-bold group ${isNovedad && validationAttempts === 1 ? 'bg-red-50/50' : ''}`}>
                              <td className="px-8 py-3">
                                 <p className="font-black text-slate-950 text-sm uppercase tracking-tight leading-none">{it.articleId}</p>
                                 <p className="text-[8px] text-slate-400 uppercase tracking-widest mt-1">Línea Auditoría M7</p>
                              </td>
                              <td className="px-8 py-3 text-center">
                                 {validationAttempts === 1 && isNovedad ? (
                                   <span className="px-3 py-1 bg-red-500 text-white rounded-lg text-[7px] font-black uppercase tracking-widest shadow-md">NOVEDAD</span>
                                 ) : (
                                   <span className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[7px] font-black uppercase tracking-widest">EN CONTEO</span>
                                 )}
                              </td>
                              <td className="px-8 py-3 text-center">
                                 <div className={`inline-flex items-center justify-center min-w-[60px] h-10 rounded-xl text-lg font-black shadow-inner transition-all ${currentCount > 0 ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-slate-100 text-slate-300'}`}>
                                    {currentCount}
                                 </div>
                              </td>
                              <td className="px-8 py-3 text-right pr-12">
                                 <button 
                                   onClick={() => handleSubtract(it.articleId)}
                                   disabled={currentCount === 0}
                                   className="inline-flex items-center justify-center w-9 h-9 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-md active:scale-90 disabled:opacity-10"
                                 >
                                    <Icons.X className="w-5 h-5 stroke-[4px]" />
                                 </button>
                              </td>
                           </tr>
                         );
                       })}
                       {filteredItems.length === 0 && (
                         <tr>
                            <td colSpan={4} className="py-24 text-center">
                               <p className="font-black text-slate-300 uppercase text-[10px] tracking-[0.3em]">
                                  {validationAttempts === 0 ? 'Escanee para iniciar inventario' : 'Sin novedades pendientes ✓'}
                               </p>
                            </td>
                         </tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      </div>

      {/* DIÁLOGO DE CONFIRMACIÓN M7 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-md rounded-[3rem] p-10 text-center space-y-8 shadow-2xl border border-white/5">
              <div className="w-16 h-16 bg-slate-900 text-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg"><Icons.Audit className="w-8 h-8" /></div>
              <div className="space-y-2">
                 <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Cerrar Auditoría M7</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Se sincronizarán los datos y se enviará el informe de inventario al centro de control.</p>
              </div>
              <div className="flex flex-col gap-4">
                <button 
                  onClick={proceedToFinalize}
                  className="w-full py-4 bg-emerald-500 text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-400 transition-all active:scale-95"
                >
                  Sincronizar y Finalizar
                </button>
                <button onClick={() => setShowConfirmDialog(false)} className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Volver a Revisión</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL EMAIL (SI NO EXISTE EN MAESTRO) */}
      {showEmailInput && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 text-center space-y-8 shadow-2xl border border-white/5">
              <div className="w-16 h-16 bg-emerald-500 text-slate-950 rounded-[1.5rem] mx-auto flex items-center justify-center shadow-xl animate-bounce"><Icons.List className="w-8 h-8" /></div>
              <div className="space-y-3">
                 <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Notificación Ajover</h3>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ingrese el correo de destino para el informe de novedades.</p>
              </div>
              <input 
                type="email" 
                value={manualEmail} 
                onChange={e => setManualEmail(e.target.value)} 
                placeholder="CORREO@DESTINO.COM"
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] font-black text-center text-xs outline-none focus:border-emerald-500 transition-all shadow-inner"
              />
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => finalizeProcess(manualEmail)}
                  disabled={!manualEmail.includes('@')}
                  className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all disabled:opacity-20 active:scale-95"
                >
                  Enviar y Finalizar
                </button>
                <button onClick={() => setShowEmailInput(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Cancelar</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BlindCount;
