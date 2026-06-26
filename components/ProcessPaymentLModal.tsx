import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';
import { DocumentL } from '../types';

interface ProcessPaymentLModalProps {
  document: DocumentL;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
}

const ProcessPaymentLModal: React.FC<ProcessPaymentLModalProps> = ({ document, onClose, onSuccess, userId }) => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ processed: number; errors: any[] } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

        if (!rawData || rawData.length < 13) {
          toast.error("El archivo no tiene el formato esperado o está vacío.");
          setLoading(false);
          return;
        }

        const excelDocL = String(rawData[3]?.[2] || '').trim().toUpperCase();
        const excelPlate = String(rawData[5]?.[2] || '').trim().toUpperCase();

        const cleanTargetDocL = String(document.externalDocId || '').trim().toUpperCase();
        const cleanTargetPlate = String(document.vehicleData || '').trim().toUpperCase();
        const cleanTargetPlate2 = String((document as any).vehicle_plate || '').trim().toUpperCase();

        if (excelDocL !== cleanTargetDocL) {
          toast.error(`Conflicto de Documento: El Excel dice "${excelDocL}" pero el seleccionado es "${cleanTargetDocL}"`);
          setLoading(false);
          return;
        }

        if (excelPlate !== cleanTargetPlate && excelPlate !== cleanTargetPlate2) {
          toast.error(`Conflicto de Placa: El Excel dice "${excelPlate}" pero el documento tiene "${cleanTargetPlate}"`);
          setLoading(false);
          return;
        }

        // Extracción de pagos desde fila 13 (index 12)
        const payments = [];
        for (let i = 12; i < rawData.length; i++) {
          const row = rawData[i];
          const unCode = String(row[0] || '').trim(); // A
          const invoice = String(row[1] || '').trim(); // B
          const vmetodo = String(row[3] || '').trim(); // D
          const metodoPago = String(row[7] || '').trim(); // H
          const clientRef = String(row[11] || '').trim(); // L

          if (invoice && invoice !== 'S/I' && invoice !== '') {
            payments.push({
              unCode,
              invoice,
              vmetodo,
              metodoPago,
              clientRef
            });
          }
        }

        if (payments.length === 0) {
          toast.error("No se encontraron facturas válidas en el archivo.");
          setLoading(false);
          return;
        }

        const res = await api.processDocumentLPayment({
          documentId: document.id,
          payments,
          userId
        });

        if (res.success) {
          setSummary({ processed: res.processed, errors: res.errors });
          toast.success(`Proceso completado: ${res.processed} facturas actualizadas.`);
          if (res.errors.length === 0) {
            onSuccess();
          }
        } else {
          toast.error(res.error || "Error al procesar el archivo");
        }
      } catch (err) {
        console.error(err);
        toast.error("Error al leer el archivo Excel");
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportErrors = () => {
    if (!summary || summary.errors.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(summary.errors.map(e => ({
      FACTURA: e.invoice,
      MOTIVO: e.reason,
      ...e.data
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errores_Pagos");
    XLSX.writeFile(wb, `Errores_Pagos_${document.externalDocId}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg">
              <Icons.Excel className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Cargar Pagos: {document.externalDocId}</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Placa: {document.vehicleData}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-3xl font-thin hover:text-red-500 transition-all">&times;</button>
        </div>

        <div className="p-10 space-y-8">
          {!summary ? (
            <div className="space-y-6">
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-12 text-center group hover:border-emerald-500 transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-sm group-hover:scale-110 transition-all">
                    {loading ? (
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Icons.Upload className="w-8 h-8 text-slate-300 group-hover:text-emerald-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900 uppercase">Seleccionar Excel de Pagos</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Formato Documento L (Normal/R)</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-[8px] font-black text-emerald-600 uppercase mb-1">Columnas Requeridas</p>
                  <p className="text-[10px] text-emerald-800 font-bold">A(UN), B(Fact), D(Val), H(Met), L(Ref)</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <p className="text-[8px] font-black text-amber-600 uppercase mb-1">Validación de Cabecera</p>
                  <p className="text-[10px] text-amber-800 font-bold">Doc L en C4 y Placa en C6</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <h4 className="text-3xl font-black text-emerald-400 leading-none">{summary.processed}</h4>
                    <p className="text-[9px] font-black uppercase tracking-widest mt-2 opacity-50">Facturas Procesadas</p>
                  </div>
                  <div className="text-right">
                    <h4 className={`text-3xl font-black leading-none ${summary.errors.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>{summary.errors.length}</h4>
                    <p className="text-[9px] font-black uppercase tracking-widest mt-2 opacity-50">No Encontradas</p>
                  </div>
                </div>
              </div>

              {summary.errors.length > 0 && (
                <div className="space-y-4">
                  <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                    {summary.errors.slice(0, 5).map((err, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                        <span className="text-[10px] font-black text-red-900">{err.invoice}</span>
                        <span className="text-[8px] font-bold text-red-400 uppercase">{err.reason}</span>
                      </div>
                    ))}
                    {summary.errors.length > 5 && (
                      <p className="text-[8px] text-center text-slate-400 font-bold uppercase">y {summary.errors.length - 5} más...</p>
                    )}
                  </div>
                  <button
                    onClick={exportErrors}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-lg"
                  >
                    <Icons.Excel className="w-5 h-5" /> Exportar Reporte de Errores
                  </button>
                </div>
              )}

              <button
                onClick={() => { onSuccess(); onClose(); }}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl"
              >
                Finalizar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProcessPaymentLModal;
