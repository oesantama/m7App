
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
}

const BlindCount: React.FC<BlindCountProps> = ({ 
  document: docL, 
  masterNotificaciones,
  masterArticulo,
  onConfirm, 
  onCancel,
  onAddArticleToMaster
}) => {
  const [scanInput, setScanInput] = useState('');
  const [counts, setCounts] = useState<{ [articleId: string]: number }>({});
  const [count1Data, setCount1Data] = useState<{ [articleId: string]: number }>({});
  const [validationAttempts, setValidationAttempts] = useState(0); 
  const [lastScan, setLastScan] = useState<{ article: Article | null, message: string, status: 'success' | 'error' | 'new' } | null>(null);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // EFECTO OFFLINE: Cargar progreso al iniciar
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

  // Guardar progreso automáticamente
  useEffect(() => {
    localStorage.setItem(`m7_offline_count_${docL.id}`, JSON.stringify({
      counts, count1Data, validationAttempts
    }));
  }, [counts, count1Data, validationAttempts, docL.id]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;

    const itemInDoc = docL.items.find(it => it.articleId.toUpperCase() === input);
    if (!itemInDoc) {
      setLastScan({ article: null, message: `El código "${input}" no pertenece a este plan.`, status: 'error' });
      setScanInput(''); return;
    }

    let articleMaster = (masterArticulo as Article[]).find(a => a.sku.toUpperCase() === input || a.barcode === input);
    if (!articleMaster) {
      const newArticle: Article = { 
        id: itemInDoc.articleId, sku: itemInDoc.articleId, barcode: itemInDoc.articleId, 
        name: `AUTO-SINCRO: ${itemInDoc.articleId}`, clientId: docL.clientId, 
        factorInter: 1, factorStd: 1, createdBy: 'M7-RECEIVING', 
        createdAt: new Date().toISOString(), updatedBy: 'M7-RECEIVING', 
        updatedAt: new Date().toISOString(), statusId: 'EST-01' 
      };
      onAddArticleToMaster(newArticle);
      articleMaster = newArticle;
    }

    setCounts(prev => ({ ...prev, [itemInDoc.articleId]: (prev[itemInDoc.articleId] || 0) + 1 }));
    setLastScan({ article: articleMaster, message: `Escaneado: ${articleMaster.name}`, status: 'success' });
    setScanInput('');
    inputRef.current?.focus();
  };

  const handleSubtract = (articleId: string) => {
    setCounts(prev => ({
      ...prev,
      [articleId]: Math.max(0, (prev[articleId] || 0) - 1)
    }));
  };

  const getMismatches = () => {
    return docL.items.filter(it => (counts[it.articleId] || 0) !== it.expectedQty);
  };

  const handleValidation = () => {
    const mismatches = getMismatches();
    
    if (mismatches.length > 0 && validationAttempts === 0) {
      // PRIMER INTENTO CON NOVEDADES
      setCount1Data({ ...counts });
      setValidationAttempts(1);
      setLastScan({ article: null, message: "NOVEDADES DETECTADAS. POR FAVOR RE-VERIFIQUE LOS ITEMS EN ROJO.", status: 'error' });
      return;
    }

    // SI NO HAY NOVEDADES O ES EL SEGUNDO INTENTO, PREPARAR NOTIFICACIÓN
    const targetNotif = masterNotificaciones.find(n => n.name.toLowerCase().includes('ajover') || n.tipoNotificacionId === 'TN-01');
    if (!targetNotif || !targetNotif.notificationEmail) {
      setShowEmailInput(true);
    } else {
      finalizeProcess(targetNotif.notificationEmail);
    }
  };

  const finalizeProcess = (email: string) => {
    setIsProcessing(true);
    // Simular envío de correo
    setTimeout(() => {
      const finalItems: DocumentLItem[] = docL.items.map(it => ({
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

  const mismatches = useMemo(() => getMismatches(), [counts]);

  return (
    <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-500 flex flex-col h-[85vh]">
      <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-xl"><Icons.Scan /></div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">Recibo Auditoría: {docL.externalDocId}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
              {validationAttempts === 0 ? 'CONTEO INICIAL' : 'CONTEO DE VERIFICACIÓN (NOVEDADES)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {validationAttempts > 0 && <span className="bg-red-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase animate-pulse">Novedad Activa</span>}
           <button onClick={() => { localStorage.removeItem(`m7_offline_count_${docL.id}`); onCancel(); }} className="text-slate-400 hover:text-red-500 transition-all text-4xl font-thin">×</button>
        </div>
      </div>

      <div className="p-10 flex gap-10 flex-1 min-h-0">
        {/* Lado Izquierdo: Entrada y Feedback */}
        <div className="w-1/3 space-y-8 flex flex-col">
           <form onSubmit={handleScan} className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Escanear SKU / EAN</label>
              <div className="relative">
                <input 
                  ref={inputRef}
                  type="text" 
                  value={scanInput} 
                  onChange={e => setScanInput(e.target.value)} 
                  placeholder="SKU..." 
                  autoFocus 
                  className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-[2.5rem] font-black text-2xl uppercase outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-200"><Icons.Search /></div>
              </div>
           </form>

           {lastScan && (
             <div className={`p-8 rounded-[2.5rem] border-2 animate-in slide-in-from-left-4 ${lastScan.status === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <div className="flex items-start gap-4">
                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${lastScan.status === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                      {lastScan.status === 'success' ? <Icons.Check /> : <Icons.Alert />}
                   </div>
                   <div>
                      <p className={`font-black text-xs uppercase ${lastScan.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{lastScan.message}</p>
                      {lastScan.article && (
                        <p className="text-2xl font-black text-slate-900 mt-2 uppercase tracking-tighter">{counts[lastScan.article.id]} <span className="text-xs font-bold text-slate-400 ml-2">UNIDADES</span></p>
                      )}
                   </div>
                </div>
             </div>
           )}

           <div className="mt-auto p-8 bg-slate-900 rounded-[2.5rem] text-white">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 text-center">Resumen de Operación</p>
              <div className="grid grid-cols-2 gap-4">
                 <div className="text-center">
                    <p className="text-2xl font-black">{Object.keys(counts).length}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Items Contados</p>
                 </div>
                 <div className="text-center">
                    <p className="text-2xl font-black text-emerald-400">{docL.items.length}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Items Totales</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Lado Derecho: Listado de Conteo y Novedades */}
        <div className="flex-1 flex flex-col gap-6 min-h-0">
           <div className="bg-slate-50 rounded-[3rem] border border-slate-200 overflow-hidden flex flex-col flex-1">
              <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center">
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Detalle de Auditoría Física</h3>
                 <span className="bg-slate-100 px-4 py-1 rounded-full text-[9px] font-black text-slate-500 uppercase">Progreso Tiempo Real</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                 <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-900 text-white font-black uppercase tracking-widest sticky top-0">
                       <tr>
                          <th className="p-6">Artículo / SKU</th>
                          <th className="p-6 text-center">Esperado</th>
                          <th className="p-6 text-center">Contado</th>
                          <th className="p-6 text-right">Acción</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {docL.items.map(it => {
                         const currentCount = counts[it.articleId] || 0;
                         const isMismatch = validationAttempts > 0 && currentCount !== it.expectedQty;
                         return (
                           <tr key={it.articleId} className={`hover:bg-white transition-all font-bold ${isMismatch ? 'bg-red-50' : ''}`}>
                              <td className="p-6 uppercase">
                                 <p className="font-black text-slate-900">{it.articleId}</p>
                                 <p className="text-[9px] text-slate-400">AUDITORÍA M7</p>
                              </td>
                              <td className="p-6 text-center text-slate-400 font-black text-base">{it.expectedQty}</td>
                              <td className={`p-6 text-center text-lg font-black ${currentCount === it.expectedQty ? 'text-emerald-600' : 'text-slate-900'}`}>
                                 {currentCount}
                              </td>
                              <td className="p-6 text-right">
                                 <button 
                                   onClick={() => handleSubtract(it.articleId)}
                                   disabled={currentCount === 0}
                                   className="p-3 bg-white border border-slate-200 rounded-xl text-red-500 hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-90 disabled:opacity-30"
                                 >
                                    <Icons.X />
                                 </button>
                              </td>
                           </tr>
                         );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      </div>

      <div className="p-8 border-t bg-slate-50 flex gap-6 shrink-0">
         <button onClick={onCancel} className="px-12 py-5 bg-white border-2 border-slate-200 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-100 transition-all">Anular Proceso</button>
         <button 
            onClick={handleValidation}
            disabled={isProcessing || Object.keys(counts).length === 0}
            className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-4"
         >
            {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full"></div> : <Icons.Signature />}
            {validationAttempts === 0 ? 'CONFIRMAR CONTEO 1' : 'FINALIZAR Y NOTIFICAR NOVEDADES'}
         </button>
      </div>

      {/* MODAL DE CORREO (Si no hay maestro configurado) */}
      {showEmailInput && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 text-center space-y-8 shadow-2xl border border-white/5">
              <div className="w-20 h-20 bg-emerald-500 text-slate-950 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20"><Icons.List /></div>
              <div className="space-y-2">
                 <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Notificación M7</h3>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No se encontró correo configurado para Ajover</p>
              </div>
              <input 
                type="email" 
                value={manualEmail} 
                onChange={e => setManualEmail(e.target.value)} 
                placeholder="correo@ejemplo.com"
                className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] font-bold text-center text-sm outline-none focus:border-emerald-500"
              />
              <div className="flex flex-col gap-4">
                 <button 
                  onClick={() => finalizeProcess(manualEmail)}
                  disabled={!manualEmail.includes('@')}
                  className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-xl transition-all disabled:opacity-30"
                 >
                   Sincronizar y Enviar Reporte
                 </button>
                 <button onClick={() => setShowEmailInput(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Volver</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BlindCount;
