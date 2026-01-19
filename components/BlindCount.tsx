
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

interface CustomDialogState {
  isOpen: boolean;
  type: 'confirm' | 'alert' | 'success' | 'sending';
  title: string;
  message: string;
  onConfirm?: () => void;
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
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error' | 'new', message: string } | null>(null);
  const [auditNotes, setAuditNotes] = useState('');
  const [dialog, setDialog] = useState<CustomDialogState>({ isOpen: false, type: 'alert', title: '', message: '' });
  const [showFinalEmailInput, setShowFinalEmailInput] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedProgress = localStorage.getItem(`m7_progress_${docL.id}`);
    if (savedProgress) {
      try {
        const data = JSON.parse(savedProgress);
        setCounts(data.counts || {});
        setCount1Data(data.count1Data || {});
        setValidationAttempts(data.validationAttempts || 0);
        setAuditNotes(data.auditNotes || '');
      } catch (e) { console.error("Error cache M7", e); }
    }
  }, [docL.id]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;

    const itemInDoc = docL.items.find(it => it.articleId.toUpperCase() === input);
    if (!itemInDoc) {
      setLastScanResult({ status: 'error', message: `Código "${input}" NO pertenece a este documento.` });
      setScanInput(''); return;
    }

    let articleMaster = (masterArticulo as Article[]).find(a => a.sku.toUpperCase() === input || a.barcode === input || a.id === input);
    if (!articleMaster) {
      const newArticle: Article = { id: itemInDoc.articleId, sku: itemInDoc.articleId, barcode: itemInDoc.articleId, name: `AUTO-SINCRO: ${itemInDoc.articleId}`, clientId: docL.clientId, factorInter: 1, factorStd: 1, createdBy: 'M7-RECEIVING', createdAt: new Date().toISOString(), updatedBy: 'M7-RECEIVING', updatedAt: new Date().toISOString(), statusId: 'EST-01' };
      onAddArticleToMaster(newArticle);
      articleMaster = newArticle;
      setLastScanResult({ status: 'new', message: `Nuevo artículo registrado automáticamente.` });
    } else {
      setLastScanResult({ status: 'success', message: `Lectura correcta: ${articleMaster.name}` });
    }

    const increment = articleMaster.factorStd || 1;
    setCounts(prev => ({ ...prev, [itemInDoc.articleId]: (prev[itemInDoc.articleId] || 0) + increment }));
    setScanInput('');
    inputRef.current?.focus();
    setTimeout(() => setLastScanResult(null), 2500);
  };

  const handleValidationStep = () => {
    const mismatch = docL.items.some(i => (counts[i.articleId] || 0) !== i.expectedQty);
    if (mismatch && validationAttempts === 0) {
      setDialog({ isOpen: true, type: 'alert', title: 'NOVEDADES DETECTADAS', message: 'Discrepancias encontradas. Capturando Conteo 1. Por favor inicie revisión física para Conteo 2.', onConfirm: () => { setCount1Data({...counts}); setValidationAttempts(1); setDialog(prev => ({ ...prev, isOpen: false })); } });
      return;
    }
    setShowFinalEmailInput(true);
  };

  return (
    <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden max-w-6xl mx-auto animate-in fade-in zoom-in-95 duration-500">
      <div className="bg-slate-900 p-10 text-white flex flex-col md:flex-row justify-between items-center gap-6 relative">
        <h2 className="text-2xl font-black uppercase tracking-tighter">Recibo M7: {docL.externalDocId}</h2>
        <button onClick={() => { localStorage.removeItem(`m7_progress_${docL.id}`); onCancel(); }} className="px-8 py-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all font-black text-[10px] uppercase tracking-widest shadow-xl">Anular Conteo</button>
      </div>
      <div className="p-10 space-y-12">
        <div className="max-w-3xl mx-auto space-y-4">
          <form onSubmit={handleScan} className="flex gap-4">
            <input ref={inputRef} type="text" value={scanInput} onChange={(e) => setScanInput(e.target.value)} placeholder="Escanee SKU o Barcode..." className="flex-1 p-8 bg-slate-50 border-4 border-slate-100 rounded-[2.5rem] font-black text-2xl outline-none focus:border-emerald-500 transition-all shadow-inner" autoFocus />
            <button type="submit" className="bg-slate-900 text-white px-12 rounded-[2.5rem] font-black uppercase text-xs hover:bg-emerald-600 transition-all shadow-2xl">Validar</button>
          </form>
          {lastScanResult && <div className={`p-5 rounded-2xl text-xs font-black uppercase tracking-tight border-2 ${lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>{lastScanResult.message}</div>}
        </div>
        <div className="pt-10 flex gap-6 border-t border-slate-100">
           <button onClick={() => onCancel()} className="px-12 py-7 bg-red-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl">Cancelar</button>
           <button onClick={handleValidationStep} className="flex-1 py-7 bg-emerald-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-[0.25em] shadow-2xl hover:bg-emerald-700 transition-all">Confirmar Operación</button>
        </div>
      </div>
      {dialog.isOpen && (
        <div className="fixed inset-0 z-[500] bg-slate-950/95 flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 text-center space-y-10 shadow-2xl">
              <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-tight">{dialog.title}</h3>
              <p className="text-sm text-slate-500 font-bold uppercase">{dialog.message}</p>
              <button onClick={dialog.onConfirm} className="w-full py-7 bg-slate-950 text-white rounded-[2.5rem] font-black text-xs uppercase hover:bg-emerald-600 shadow-xl transition-all">SÍ, PROCEDER</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default BlindCount;
