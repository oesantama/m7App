import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../../constants';
import { api } from '../../services/api';
import { toast } from 'sonner';

interface PaymentVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  user: any;
}

const PAYMENT_TYPES = ['CONSIGNACION', 'TRANSFERENCIA', 'EFECTIVO', 'CREDITO', 'CHEQUE'];

const computeHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res((reader.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

const PaymentVoucherModal: React.FC<PaymentVoucherModalProps> = ({ isOpen, onClose, invoice, user }) => {
  const [file, setFile]               = useState<File | null>(null);
  const [preview, setPreview]         = useState<string>('');
  const [paymentType, setPaymentType] = useState('CONSIGNACION');
  const [amount, setAmount]           = useState('');
  const [bankName, setBankName]       = useState('');
  const [notes, setNotes]             = useState('');
  const [uploading, setUploading]     = useState(false);
  const [vouchers, setVouchers]       = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [tab, setTab]                 = useState<'upload' | 'list'>('upload');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && invoice) {
      loadVouchers();
      setFile(null); setPreview(''); setAmount(''); setBankName(''); setNotes('');
      setPaymentType('CONSIGNACION');
    }
  }, [isOpen, invoice]);

  const loadVouchers = async () => {
    if (!invoice) return;
    setLoadingList(true);
    try {
      const data = await api.getVouchers(invoice.invoiceNumber || invoice.id);
      setVouchers(Array.isArray(data) ? data : []);
    } catch { setVouchers([]); } finally { setLoadingList(false); }
  };

  const handleFile = (f: File) => {
    if (f.size > 8 * 1024 * 1024) { toast.error('El archivo supera 8 MB'); return; }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file || !invoice) { toast.error('Seleccione un archivo'); return; }
    setUploading(true);
    try {
      const [fileHash, fileData] = await Promise.all([computeHash(file), toBase64(file)]);
      await api.uploadVoucher({
        invoiceId:   invoice.invoiceNumber || invoice.id,
        dispatchId:  invoice.dispatchId,
        fileData, fileName: file.name, fileType: file.type, fileHash,
        paymentType, amount: parseFloat(amount) || 0, bankName, notes,
        uploadedBy: user?.name || user?.email || '',
      });
      toast.success('Soporte subido correctamente');
      setFile(null); setPreview(''); setAmount(''); setBankName(''); setNotes('');
      setTab('list');
      await loadVouchers();
    } catch (e: any) {
      if (e?.message?.includes('ya fue subido') || e?.status === 409) {
        toast.error('⚠️ Este soporte ya fue registrado anteriormente en el sistema');
      } else {
        toast.error(e?.message || 'Error al subir soporte');
      }
    } finally { setUploading(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="p-6 bg-amber-50 border-b border-amber-100 flex items-center justify-between rounded-t-[2rem] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
              <Icons.Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">Soporte de Pago</h3>
              <p className="text-[10px] font-bold text-slate-500">#{invoice?.invoiceNumber || invoice?.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:bg-slate-100 transition-all shadow-sm">
            <Icons.X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {(['upload', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all
                ${tab === t ? 'border-b-2 border-amber-500 text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {t === 'upload' ? '⬆ Subir Soporte' : `📋 Soportes (${vouchers.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {tab === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-amber-200 rounded-2xl p-6 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-all"
              >
                {preview ? (
                  file?.type.startsWith('image/') ? (
                    <img src={preview} className="max-h-40 mx-auto rounded-xl object-contain" alt="preview" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Icons.FileText className="w-10 h-10 text-amber-400" />
                      <p className="text-xs font-bold text-slate-700">{file?.name}</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Icons.Upload className="w-8 h-8 text-amber-300" />
                    <p className="text-xs font-black text-slate-500 uppercase">Arrastra o haz clic para seleccionar</p>
                    <p className="text-[10px] text-slate-400">JPG, PNG, PDF — máx. 8 MB</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Tipo de pago */}
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de pago</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_TYPES.map(pt => (
                    <button key={pt} onClick={() => setPaymentType(pt)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all
                        ${paymentType === pt ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      {pt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto y banco */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Banco / Entidad</label>
                  <input type="text" value={bankName} onChange={e => setBankName(e.target.value.toUpperCase())} placeholder="BANCOLOMBIA"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase outline-none focus:border-amber-400" />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Observaciones</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Número de referencia, observaciones..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-400 resize-none" />
              </div>

              <button onClick={handleUpload} disabled={uploading || !file}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                {uploading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.Upload className="w-4 h-4" />}
                {uploading ? 'Subiendo...' : 'Subir Soporte'}
              </button>
            </div>
          )}

          {tab === 'list' && (
            <div className="space-y-3">
              {loadingList && (
                <div className="text-center py-10">
                  <span className="w-6 h-6 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin inline-block" />
                </div>
              )}
              {!loadingList && vouchers.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
                  <Icons.FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-[11px] font-black text-slate-400 uppercase">Sin soportes subidos</p>
                </div>
              )}
              {vouchers.map(v => (
                <div key={v.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">{v.payment_type}</span>
                        {v.verified && <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded-full">✓ VERIFICADO</span>}
                      </div>
                      <p className="text-xs font-black text-slate-800">{v.file_name}</p>
                      {v.amount > 0 && <p className="text-[11px] font-bold text-emerald-600">$ {Number(v.amount).toLocaleString()}</p>}
                      {v.bank_name && <p className="text-[10px] text-slate-500 font-bold">{v.bank_name}</p>}
                      {v.notes && <p className="text-[10px] text-slate-400 mt-1">{v.notes}</p>}
                      <p className="text-[9px] text-slate-300 mt-1">{new Date(v.created_at).toLocaleString('es-CO')} · {v.uploaded_by}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentVoucherModal;
