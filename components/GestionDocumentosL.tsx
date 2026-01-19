
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice } from '../types';
import ConsultasDocumentosL from './ConsultasDocumentosL';
import * as XLSX from 'xlsx';

interface GestionDocumentosLProps {
  documents: DocumentL[];
  invoices: Invoice[];
  user: User;
  masterEstados: MasterRecord[];
  onAddDocuments: (docs: DocumentL[]) => void;
}

const GestionDocumentosL: React.FC<GestionDocumentosLProps> = ({ documents, invoices, user, masterEstados, onAddDocuments }) => {
  const [activeTab, setActiveTab] = useState<'cargue' | 'consultas'>('cargue');
  const [preview, setPreview] = useState<{ fileName: string; rows: any[]; headers: string[]; mapped: DocumentL[]; type: string } | null>(null);
  const [selectedPendingDoc, setSelectedPendingDoc] = useState<DocumentL | null>(null);

  const pendingDocs = useMemo(() => 
    documents.filter(d => d.status === DocStatus.PENDING),
    [documents]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      
      if (rawData.length < 1) return;

      const headers = (rawData[0] || []).map(h => String(h).trim());
      const dataRows = rawData.slice(1);

      const findIdx = (terms: string[]) => headers.findIndex(h => terms.some(t => h.toLowerCase().includes(t.toLowerCase())));

      // Mapeo basado en Imágenes 1 y 2
      const iCodPlan = findIdx(['UN Orig', 'codplan']);
      const iFechaEnvio = findIdx(['Ship Date', 'fecha envio']);
      const iPlaca = findIdx(['Placa', 'placa']);
      const iDocL = findIdx(['Carga', 'Documento L']);

      // Detalle (Imagen 2)
      const iPedido = findIdx(['Nº Ped', 'Pedido']);
      const iArticulo = findIdx(['Articulo', 'item']);
      const iCant = findIdx(['Cant Env', 'cant']);
      const iDir = findIdx(['Dirección 1', 'direccion']);
      const iObs = findIdx(['Message', 'observacion']);

      const docsMap = new Map<string, any>();
      dataRows.forEach(row => {
        const cargaId = String(row[iDocL] || row[iCodPlan] || 'S/I');
        if (!docsMap.has(cargaId)) {
          docsMap.set(cargaId, { 
            placa: String(row[iPlaca] || 'S/I'),
            fechaEnvio: String(row[iFechaEnvio] || 'S/I'),
            items: new Map() 
          });
        }
        const doc = docsMap.get(cargaId);
        const sku = String(row[iArticulo] || 'S/I');
        const qty = Number(row[iCant] || 0);
        const currentQty = doc.items.get(sku) || 0;
        doc.items.set(sku, { qty: currentQty + qty, direccion: String(row[iDir] || 'S/I'), observacion: String(row[iObs] || 'S/I') });
      });

      const mapped: DocumentL[] = Array.from(docsMap.entries()).map(([cargaId, data]) => {
        // Fix: Explicitly cast to any array to resolve 'unknown' type errors for 'direccion' and 'observacion' properties.
        const itemsList = Array.from(data.items.values()) as any[];
        const firstItem = itemsList[0];
        
        return {
          id: `doc-${Date.now()}-${cargaId}`,
          clientId: user.clientId,
          externalDocId: cargaId,
          vehicleData: data.placa,
          city: 'POR DEFINIR',
          status: DocStatus.PENDING,
          planType: type as any,
          address: firstItem?.direccion,
          inventoryNotes: firstItem?.observacion,
          items: Array.from(data.items.entries()).map(([sku, info]: any) => ({ 
            articleId: sku, expectedQty: info.qty, countedQty: 0, status: 'Pending' 
          })),
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          updatedAt: new Date().toISOString(),
          updatedBy: user.name,
          statusId: 'EST-01'
        };
      });

      setPreview({ fileName: file.name, headers, rows: dataRows.slice(0, 5), mapped, type });
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-12 animate-in fade-in pb-20">
      <div className="bg-white p-10 rounded-[4rem] shadow-2xl border border-slate-100 flex justify-between items-center">
         <div className="flex items-center gap-8">
            <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center text-emerald-500 shadow-2xl"><Icons.Package /></div>
            <div>
              <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none">Gestión Documentos L</h2>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mt-3">Validación de Manifiestos y Entregas</p>
            </div>
         </div>
         <div className="flex bg-slate-100 p-2.5 rounded-[2.5rem] shadow-inner">
            <button onClick={()=>setActiveTab('cargue')} className={`px-12 py-5 rounded-[2rem] font-black text-xs uppercase transition-all ${activeTab === 'cargue' ? 'bg-white shadow-2xl text-slate-900' : 'text-slate-400'}`}>Cargue de Planes</button>
            <button onClick={()=>setActiveTab('consultas')} className={`px-12 py-5 rounded-[2rem] font-black text-xs uppercase transition-all ${activeTab === 'consultas' ? 'bg-white shadow-2xl text-slate-900' : 'text-slate-400'}`}>Auditoría Histórica</button>
         </div>
      </div>

      {activeTab === 'cargue' ? (
        <div className="space-y-12">
          {!preview ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                 <div className="bg-white p-16 rounded-[5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center text-center hover:border-emerald-500 transition-all shadow-xl group">
                    <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mb-10 group-hover:scale-110 transition-transform"><Icons.Excel /></div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Plan Normal M7</h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase mt-3 tracking-widest">Soporta Estructura: UN Orig / Ship Date / Placa / Carga</p>
                    <label className="bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black text-xs uppercase mt-12 cursor-pointer shadow-2xl hover:bg-emerald-600 transition-all active:scale-95">
                       Seleccionar Excel
                       <input type="file" accept=".xls,.xlsx" className="hidden" onChange={e=>handleFileUpload(e, 'Plan Normal')} />
                    </label>
                 </div>
                 <div className="bg-white p-16 rounded-[5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center text-center hover:border-blue-500 transition-all shadow-xl group">
                    <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center mb-10 group-hover:scale-110 transition-transform"><Icons.Excel /></div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Plan R Recolección</h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase mt-3 tracking-widest">Soporta Estructura: codplan / fecha envio / placa / Documento L</p>
                    <label className="bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black text-xs uppercase mt-12 cursor-pointer shadow-2xl hover:bg-blue-600 transition-all active:scale-95">
                       Seleccionar CSV
                       <input type="file" accept=".csv" className="hidden" onChange={e=>handleFileUpload(e, 'Plan R')} />
                    </label>
                 </div>
              </div>

              <div className="bg-white p-14 rounded-[5rem] shadow-2xl border border-slate-100">
                 <div className="flex items-center justify-between mb-16 px-6">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.4em]">Documentos en Espera de Validación ({pendingDocs.length})</h3>
                    <div className="h-1 flex-1 mx-12 bg-slate-50 rounded-full"></div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                    {pendingDocs.map(doc => (
                      <div key={doc.id} className="p-12 bg-slate-50 border border-slate-100 rounded-[4rem] flex flex-col gap-10 group hover:bg-white hover:shadow-[0_40px_80px_rgba(0,0,0,0.12)] transition-all animate-in zoom-in-95">
                         <div className="flex justify-between items-start">
                            <div className="w-16 h-16 bg-slate-900 text-emerald-500 rounded-[1.5rem] flex items-center justify-center shadow-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all"><Icons.Package /></div>
                            <span className="bg-amber-100 text-amber-700 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200">Pendiente Auditoría</span>
                         </div>
                         <div>
                            <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mb-2">Manifiesto Carga</p>
                            <p className="font-black text-slate-900 text-4xl uppercase leading-none tracking-tighter">{doc.externalDocId}</p>
                         </div>
                         <div className="space-y-4">
                            <div className="flex justify-between items-center text-[12px] font-black uppercase"><span className="text-slate-400 tracking-tighter">Unidad Placa:</span> <span className="text-slate-800">{doc.vehicleData}</span></div>
                            <div className="flex justify-between items-center text-[12px] font-black uppercase"><span className="text-slate-400 tracking-tighter">Destino Plan:</span> <span className="text-emerald-600">{doc.city}</span></div>
                         </div>
                         <button onClick={()=>setSelectedPendingDoc(doc)} className="w-full py-7 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-2xl active:scale-95">Ver Detalle del Plan</button>
                      </div>
                    ))}
                    {pendingDocs.length === 0 && <div className="col-span-full py-40 text-center font-black text-slate-200 uppercase tracking-[0.8em]">Bandeja de Entrada Vacía</div>}
                 </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-[5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
               <div className="bg-slate-900 p-12 text-white flex justify-between items-center">
                  <div className="flex items-center gap-6">
                    <span className="bg-emerald-500 text-slate-950 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">{preview.type}</span>
                    <h4 className="font-black uppercase text-xl tracking-tighter">Previsualizando: {preview.fileName}</h4>
                  </div>
                  <div className="flex gap-6">
                     <button onClick={()=>setPreview(null)} className="px-16 py-6 bg-red-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-red-700 transition-all">Cancelar Cargue</button>
                     <button onClick={()=>{onAddDocuments(preview.mapped); setPreview(null);}} className="px-16 py-6 bg-emerald-500 text-slate-950 rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-[0_20px_40px_rgba(16,185,129,0.3)] hover:bg-emerald-400 transition-all">Confirmar Operación</button>
                  </div>
               </div>
               <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                  <table className="w-full text-left text-[12px]">
                     <thead className="bg-slate-100 text-slate-600 font-black uppercase tracking-widest">
                        <tr>{preview.headers.map((h, i) => <th key={i} className="p-10">{h}</th>)}</tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {preview.rows.map((row, i) => <tr key={i} className="hover:bg-slate-50 transition-all">{preview.headers.map((_, j) => <td key={j} className="p-10 font-bold text-slate-500">{row[j]}</td>)}</tr>)}
                     </tbody>
                  </table>
               </div>
            </div>
          )}
        </div>
      ) : (
        <ConsultasDocumentosL documents={documents} invoices={invoices} user={user} masterEstados={masterEstados} />
      )}

      {selectedPendingDoc && (
        <div className="fixed inset-0 z-[400] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-6 md:p-14 animate-in fade-in zoom-in-95">
           <div className="bg-white w-full max-w-7xl rounded-[6rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/10">
              <div className="bg-slate-900 p-14 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-10">
                    <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center text-slate-950 shadow-2xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-5xl font-black uppercase tracking-tighter leading-none">Expediente M7: {selectedPendingDoc.externalDocId}</h3>
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mt-3">Estado Logístico: Pendiente Validación SKU por SKU</p>
                    </div>
                 </div>
                 <button onClick={()=>setSelectedPendingDoc(null)} className="w-16 h-16 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-6xl font-thin">×</button>
              </div>
              <div className="p-14 md:p-20 overflow-y-auto space-y-16 custom-scrollbar flex-1 bg-slate-50/40">
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 transition-all hover:shadow-xl"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Unidad Asignada</p><p className="font-black text-slate-900 text-lg uppercase">{selectedPendingDoc.vehicleData}</p></div>
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 transition-all hover:shadow-xl"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Ciudad / Destino</p><p className="font-black text-emerald-600 text-lg uppercase">{selectedPendingDoc.city}</p></div>
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 transition-all hover:shadow-xl"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Fecha de Cargue</p><p className="font-black text-slate-900 text-base">{new Date(selectedPendingDoc.createdAt).toLocaleDateString()}</p></div>
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 transition-all hover:shadow-xl"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Planificador M7</p><p className="font-black text-slate-900 text-base uppercase">{selectedPendingDoc.createdBy}</p></div>
                 </div>

                 <div className="bg-white p-12 rounded-[4rem] shadow-xl border border-slate-100">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 px-6">Información de Destino y Mensajes de Carga</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                       <div className="space-y-4 px-6 border-l-4 border-emerald-500">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Dirección de Entrega Principal</p>
                          <p className="font-black text-slate-800 text-sm uppercase leading-relaxed">{selectedPendingDoc.address || 'Sin Dirección Registrada'}</p>
                       </div>
                       <div className="space-y-4 px-6 border-l-4 border-slate-900">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Observaciones del Manifiesto</p>
                          <p className="font-bold text-slate-500 text-xs italic leading-relaxed">{selectedPendingDoc.inventoryNotes || 'No hay mensajes adicionales para esta carga.'}</p>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-8">
                    <div className="flex items-center gap-6 px-6">
                       <h4 className="text-sm font-black text-slate-900 uppercase tracking-[0.4em]">Detalle de Artículos para Conteo Ciego</h4>
                       <div className="h-0.5 flex-1 bg-slate-100"></div>
                    </div>
                    <div className="bg-white rounded-[5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.1)] border-4 border-slate-50">
                       <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-white font-black uppercase tracking-[0.2em]">
                             <tr><th className="p-12">Artículo / SKU</th><th className="p-12 text-center">Cantidad Esperada</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-bold">
                             {selectedPendingDoc.items.map((it, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-all group">
                                   <td className="p-12 font-black text-slate-800 uppercase text-lg tracking-tight group-hover:text-emerald-600 transition-colors">{it.articleId}</td>
                                   <td className="p-12 text-center text-slate-500 text-lg">{it.expectedQty} <span className="text-[10px] font-black text-slate-300 ml-2">UND</span></td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>
              <div className="p-14 border-t bg-white flex justify-end shrink-0">
                 <button onClick={()=>setSelectedPendingDoc(null)} className="px-20 py-8 bg-red-600 text-white rounded-[3rem] font-black text-xs uppercase tracking-widest hover:bg-red-700 shadow-2xl active:scale-95 transition-all">Cerrar Expediente</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GestionDocumentosL;
