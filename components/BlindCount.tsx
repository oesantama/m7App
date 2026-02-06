
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '../constants';
import { Article, DocumentL, DocumentLItem, MasterRecord, DocStatus } from '../types';

interface BlindCountProps {
  document: DocumentL;
  masterNotificaciones: MasterRecord[];
  masterArticulo: MasterRecord[];
  onConfirm: (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => void;
  onPartialSave: (currentItems: DocumentLItem[], generalObs: string) => void;
  onCancel: () => void;
  onAddArticleToMaster: (article: Article) => void;
  onAddNotificationToMaster: (notif: Partial<MasterRecord>) => void;
}

const BlindCount: React.FC<BlindCountProps> = ({ 
  document: docL, 
  masterNotificaciones,
  masterArticulo,
  onConfirm, 
  onPartialSave,
  onCancel,
  onAddArticleToMaster,
  onAddNotificationToMaster
}) => {
  const [scanInput, setScanInput] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [counts, setCounts] = useState<{ [articleId: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    docL.items.forEach(it => {
      if ((it.count2 || it.countedQty) > 0) initial[it.articleId] = it.count2 || it.countedQty;
    });
    return initial;
  });
  const [count1Data, setCount1Data] = useState<{ [articleId: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    docL.items.forEach(it => {
      if (it.count1 > 0) initial[it.articleId] = it.count1;
    });
    return initial;
  });
  const [itemObservations, setItemObservations] = useState<{ [articleId: string]: string }>(() => {
    const initial: { [id: string]: string } = {};
    docL.items.forEach(it => {
      if (it.inventoryNote) initial[it.articleId] = it.inventoryNote;
    });
    return initial;
  });
  const [inventoryObservation, setInventoryObservation] = useState(docL.inventoryObservation || '');
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [validationAttempts, setValidationAttempts] = useState(0); 
  const [lastScan, setLastScan] = useState<{ article: Article | null, message: string, status: 'success' | 'error' | 'new' } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoaded = useRef(false);

  // AGRUPACIÓN DE ITEMS POR SKU (VISTA GENERAL)
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

  // OFFLINE CACHE: Cargar al montar si existe algo más reciente
  useEffect(() => {
    const saved = localStorage.getItem(`m7_offline_count_${docL.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Mezclar con lo que venga de la DB (preferir el conteo más alto por seguridad)
        setCounts(prev => {
          const merged = { ...prev };
          Object.keys(data.counts || {}).forEach(k => {
            merged[k] = Math.max(merged[k] || 0, data.counts[k]);
          });
          return merged;
        });
        setCount1Data(prev => {
           const merged = { ...prev };
           Object.keys(data.count1Data || {}).forEach(k => {
             merged[k] = Math.max(merged[k] || 0, data.count1Data[k]);
           });
           return merged;
        });
        if (data.validationAttempts > 0) setValidationAttempts(data.validationAttempts);
        if (data.mismatchIds?.length > 0) setMismatchIds(data.mismatchIds);
        if (data.itemObservations) setItemObservations(data.itemObservations);
        if (data.inventoryObservation) setInventoryObservation(data.inventoryObservation);
      } catch (e) { console.error("Error cargando caché M7", e); }
    }
    setTimeout(() => { isLoaded.current = true; }, 500); // Pequeño delay para no auto-guardar el estado inicial vacío
  }, [docL.id]);

  useEffect(() => {
    if (!isLoaded.current) return;
    localStorage.setItem(`m7_offline_count_${docL.id}`, JSON.stringify({
      counts, count1Data, validationAttempts, mismatchIds, itemObservations, inventoryObservation
    }));
  }, [counts, count1Data, validationAttempts, mismatchIds, itemObservations, inventoryObservation, docL.id]);

  // AUTO-SAVE AL SERVIDOR CADA 60 SEGUNDOS SI HAY CAMBIOS
  useEffect(() => {
    const timer = setInterval(() => {
      if (Object.keys(counts).length > 0) {
        handleManualSave();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [counts]);

  const handleManualSave = () => {
    onPartialSave(
      groupedItems.map(it => ({ 
        ...it, 
        countedQty: counts[it.articleId] || 0, 
        inventoryNote: itemObservations[it.articleId] 
      })),
      inventoryObservation
    );
  };

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
      setMismatchIds(mismatches.map(m => m.articleId)); // Fijamos qué items mostramos en pantalla de revisión
      setLastScan({ article: null, message: "NOVEDADES DETECTADAS. REVISIÓN ACTIVADA.", status: 'error' });
      return;
    }

    setShowConfirmDialog(true);
  };

  const proceedToFinalize = () => {
    setShowConfirmDialog(false);
    // Buscar notificación específica "inventario ajover"
    const targetNotif = masterNotificaciones.find(n => 
      n.name?.trim().toLowerCase() === 'inventario ajover' && 
      n.statusId === 'EST-01'
    );
    
    if (!targetNotif || !targetNotif.notificationEmail) {
      setShowEmailInput(true);
    } else {
      finalizeProcess(targetNotif.notificationEmail);
    }
  };

  const finalizeProcess = (email: string) => {
    setIsProcessing(true);
    
    const emailInMaster = masterNotificaciones.some(n => n.notificationEmail === email && n.name?.toLowerCase().includes('ajover'));
    if (!emailInMaster) {
      onAddNotificationToMaster({
        name: `inventario ajover`,
        notificationEmail: email,
        tipoNotificacionId: 'TN-01',
        statusId: 'EST-01'
      });
    }

      const finalItems: DocumentLItem[] = groupedItems.map(it => ({
        ...it,
        countedQty: counts[it.articleId] || 0,
        count1: count1Data[it.articleId] || 0,
        count2: counts[it.articleId] || 0,
        inventoryNote: itemObservations[it.articleId] || '',
        status: (counts[it.articleId] || 0) === it.expectedQty ? 'Matches' : 'Mismatch'
      }));
      
      onConfirm(finalItems, inventoryObservation, email);
      // NO cerramos el procesamiento aquí, dejamos que el padre lo maneje o que el componente se desmonte
  };

  const filteredItems = useMemo(() => {
    let list = groupedItems;
    
    if (validationAttempts === 0) {
      // Fase 1: Solo mostramos lo que se ha escaneado
      list = groupedItems.filter(it => (counts[it.articleId] || 0) > 0);
    } else {
      // Fase 2: Novedades
      list = groupedItems.filter(it => mismatchIds.includes(it.articleId));
    }

    if (tableSearch) {
      const search = tableSearch.toLowerCase();
      list = list.filter(it => 
        it.articleId.toLowerCase().includes(search) ||
        (it.articleName || '').toLowerCase().includes(search) ||
        (it.invoice || '').toLowerCase().includes(search)
      );
    }

    if (sortConfig) {
      list.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key] || '';
        const bVal = (b as any)[sortConfig.key] || '';
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
           return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [groupedItems, tableSearch, validationAttempts, counts, mismatchIds, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden">
      
      {/* ÉXITO OVERLAY */}
      {saveSuccess && (
        <div className="absolute inset-0 z-[700] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300 border border-white/20">
             <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg mb-6 animate-bounce">
                <Icons.Check className="w-10 h-10" />
             </div>
             <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-2">Inventario Guardado</h2>
             <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg">Operación Exitosa</p>
           </div>
        </div>
      )}

      <div className="bg-slate-900 px-4 py-3 text-white flex flex-col lg:flex-row justify-between items-center shrink-0 border-b border-white/5 gap-3">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 shadow-lg shrink-0"><Icons.Scan className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base md:text-xl font-black uppercase tracking-tight leading-none truncate">Recibo: {docL.externalDocId}</h2>
            <div className="mt-1 flex items-center gap-2">
               <span className="text-[8px] text-slate-500 font-bold uppercase bg-slate-800 px-2 py-0.5 rounded border border-white/5">{docL.vehicleData}</span>
               <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${validationAttempts === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                 {validationAttempts === 0 ? 'Fase 1: Conteo' : 'Fase 2: Novedades'}
               </span>
            </div>
          </div>
          <button onClick={onCancel} className="lg:hidden text-slate-500 hover:text-red-500 transition-all text-3xl font-thin">&times;</button>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
           <button onClick={onCancel} className="hidden md:block px-6 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">Cancelar</button>
           <button 
              onClick={handleValidationTrigger}
              disabled={isProcessing || Object.keys(counts).length === 0}
              className="px-6 py-2 bg-emerald-500 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-[0.1em] shadow-lg hover:bg-emerald-400 transition-all flex items-center gap-2 disabled:opacity-20 active:scale-95"
           >
              {isProcessing ? <Icons.Alert className="w-3 h-3 animate-spin" /> : <Icons.Signature className="w-3.5 h-3.5" />}
              {validationAttempts === 0 ? 'Finalizar' : 'Cerrar'}
           </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-slate-50/20 overflow-hidden">
        {/* PANEL IZQUIERDO: SCANNER Y OBS - AHORA CON SCROLL */}
        <div className="w-full lg:w-80 p-4 md:p-6 space-y-4 shrink-0 flex flex-col border-r border-slate-100 bg-white overflow-y-auto custom-scrollbar">
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

            <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden shrink-0">
               <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                     <p className="text-2xl font-black text-emerald-400 leading-none">{Object.keys(counts).length}</p>
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Items</p>
                  </div>
                  <div className="text-center">
                     <p className="text-2xl font-black text-white leading-none">{groupedItems.length}</p>
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Plan</p>
                  </div>
               </div>
               <div className="space-y-2 pt-4 border-t border-white/10">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 text-emerald-500/50">Notas del Inventario</label>
                  <textarea 
                    value={inventoryObservation}
                    onChange={(e) => setInventoryObservation(e.target.value)}
                    placeholder="ESCRIBIR OBSERVACIONES..."
                    className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] font-bold text-emerald-400 outline-none focus:border-emerald-500/50 transition-all resize-none placeholder:text-slate-700 uppercase"
                  />
               </div>
            </div>
        </div>

        {/* PANEL DERECHO: TABLA CON SCROLL */}
        <div className="flex-1 flex flex-col min-h-0 w-full p-4 md:p-6 overflow-hidden">
           <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full relative">
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
                       <span className="text-[8px] font-black uppercase">Mostrando únicamente novedades registradas</span>
                    </div>
                 )}
              </div>

               <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                      <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] sticky top-0 z-20 shadow-sm">
                         <tr>
                            <th className="px-4 py-4 cursor-pointer hover:text-emerald-400 min-w-[200px]" onClick={() => requestSort('articleId')}>Artículo / Ref{getSortIndicator('articleId')}</th>
                            <th className="px-4 py-4 text-center cursor-pointer hover:text-emerald-400 min-w-[100px]" onClick={() => requestSort('status')}>Estado{getSortIndicator('status')}</th>
                            <th className="px-4 py-4 text-center min-w-[100px]">Auditado</th>
                            <th className="px-4 py-4 text-right min-w-[60px]">UM</th>
                            <th className="px-4 py-4 text-right cursor-pointer hover:text-emerald-400 min-w-[80px]" onClick={() => requestSort('volume')}>Vol{getSortIndicator('volume')}</th>
                            <th className="px-4 py-4 text-left min-w-[200px]">Notas Inventario</th>
                            <th className="px-4 py-4 text-right pr-6 min-w-[80px]">Acción</th>
                         </tr>
                      </thead>
                     <tbody className="divide-y divide-slate-50">
                        {filteredItems.map(it => {
                          const currentCount = counts[it.articleId] || 0;
                          return (
                            <tr key={it.articleId} className={`hover:bg-slate-50/50 transition-all font-bold group ${validationAttempts === 1 ? 'bg-red-50/10' : ''}`}>
                               <td className="px-4 py-3 max-w-[150px]">
                                  <p className="font-black text-slate-900 text-xs uppercase tracking-tight leading-none truncate" title={it.articleId}>{it.articleId}</p>
                                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1 truncate" title={(it as any).articleName || ''}>{(it as any).articleName || 'Sin descripción'}</p>
                               </td>
                               <td className="px-4 py-3 text-center">
                                  {validationAttempts === 1 ? (
                                    <span className="px-2 py-0.5 bg-red-500 text-white rounded text-[7px] font-black uppercase tracking-widest shadow-sm">REVISIÓN</span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[7px] font-black uppercase tracking-widest">EN CONTEO</span>
                                  )}
                               </td>
                               <td className="px-4 py-3 text-center">
                                  <div className={`inline-flex items-center justify-center min-w-[50px] h-8 rounded-lg text-sm font-black shadow-inner transition-all ${currentCount > 0 ? (validationAttempts === 1 ? 'bg-slate-800 text-white' : 'bg-emerald-500 text-white') : 'bg-slate-100 text-slate-300'}`}>
                                     {currentCount}
                                  </div>
                               </td>
                               <td className="px-4 py-3 text-right text-[9px] text-slate-500">{it.unit || 'UND'}</td>
                               <td className="px-4 py-3 text-right text-[9px] text-slate-500">{(it as any).volume || '-'}</td>
                               <td className="px-4 py-3 text-left">
                                  <input 
                                    type="text"
                                    value={itemObservations[it.articleId] || ''}
                                    onChange={(e) => setItemObservations(prev => ({ ...prev, [it.articleId]: e.target.value }))}
                                    placeholder="NOTA SKU..."
                                    className="w-full bg-slate-50 border border-transparent rounded-lg px-2 py-1 text-[8px] font-bold text-slate-600 outline-none focus:bg-white focus:border-emerald-500 transition-all uppercase"
                                  />
                               </td>
                               <td className="px-4 py-3 text-right pr-6">
                                  <button 
                                    onClick={() => handleSubtract(it.articleId)}
                                    disabled={currentCount === 0}
                                    className="inline-flex items-center justify-center w-7 h-7 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-md active:scale-90 disabled:opacity-10"
                                  >
                                     <span className="font-black text-xs">-1</span>
                                  </button>
                               </td>
                            </tr>
                          );
                        })}
                        {filteredItems.length === 0 && (
                          <tr>
                             <td colSpan={7} className="py-24 text-center">
                                <p className="font-black text-slate-300 uppercase text-[10px] tracking-[0.3em]">
                                   {validationAttempts === 0 ? 'Escanee para iniciar inventario' : 'Sin novedades registradas ✓'}
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
