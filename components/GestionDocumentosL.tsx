
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice, DocumentLItem } from '../types';
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
  const [preview, setPreview] = useState<{ fileName: string; mapped: DocumentL[]; type: string } | null>(null);
  const [selectedPendingDoc, setSelectedPendingDoc] = useState<DocumentL | null>(null);

  const pendingDocs = useMemo(() => 
    documents.filter(d => d.statusId === 'EST-03' || d.status === DocStatus.PENDING),
    [documents]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        
        if (!rawData || rawData.length < 1) return;

        let headerRowIndex = -1;
        // Términos para validar que la fila ES de encabezados
        const requiredTerms = ['placa', 'carga', 'articulo', 'item', 'un orig', 'un', 'cant env'];
        
        for (let i = 0; i < Math.min(rawData.length, 50); i++) {
          const row = (rawData[i] || []).map(c => String(c || '').toLowerCase().trim());
          // Una fila de encabezado válida debe tener al menos 3 de nuestros términos clave
          const matches = row.filter(cell => requiredTerms.some(term => cell === term || cell.includes(term))).length;
          
          if (matches >= 3) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          alert("M7 ERROR: No se detectó la fila de títulos. Asegúrese que las columnas (Placa, Carga, Articulo, etc.) estén presentes en el archivo.");
          return;
        }

        const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
        const findIdx = (terms: string[]) => headers.findIndex(h => {
          if (!h) return false;
          const hLower = h.toLowerCase().trim();
          return terms.some(t => hLower === t.toLowerCase().trim() || hLower.includes(t.toLowerCase().trim()));
        });

        // MAPEOS SEGÚN IMÁGENES PROPORCIONADAS
        const iCodPlan = type === 'Plan Normal' ? findIdx(['un orig']) : findIdx(['un']);
        const iPlaca = findIdx(['placa']);
        const iCarga = findIdx(['carga']);
        const iFechaEnvio = findIdx(['ship date', 'fecha envio']);

        const iArticulo = type === 'Plan Normal' ? findIdx(['articulo']) : findIdx(['item']);
        const iCant = findIdx(['cant env']);
        const iVol = type === 'Plan Normal' ? findIdx(['total volume']) : findIdx(['volumen']);
        const iUnd = findIdx(['um', 'und']);
        const iFactura = findIdx(['remision/transferencia', 'factura']);
        const iCiudad = type === 'Plan Normal' ? findIdx(['destino']) : findIdx(['ciudad']);
        const iDir = type === 'Plan Normal' ? findIdx(['dirección 1']) : findIdx(['dir 1']);
        const iObs = type === 'Plan Normal' ? findIdx(['message']) : findIdx(['comentarios']);
        
        const dataRows = rawData.slice(headerRowIndex + 1);
        const docsMap = new Map<string, { codplan: string, placa: string, carga: string, city: string, address: string, items: DocumentLItem[] }>();

        dataRows.forEach((row) => {
          if (!row || row.length === 0 || row.every(c => c === '')) return;
          const val = (idx: number) => idx !== -1 ? String(row[idx] || '').trim() : '';

          const placa = val(iPlaca);
          const carga = val(iCarga);
          const codplan = val(iCodPlan);
          const sku = val(iArticulo);
          const ciudad = val(iCiudad);
          
          if (!sku && !placa && !carga) return;

          // AGRUPACIÓN: Placa + Carga define el documento maestro
          const groupKey = `${placa || 'S/A'}-${carga || 'S/C'}`;

          if (!docsMap.has(groupKey)) {
            docsMap.set(groupKey, { 
              codplan: codplan || groupKey,
              placa: placa || 'S/A',
              carga: carga || 'S/C',
              city: ciudad || 'S/D',
              address: val(iDir) || 'S/D',
              items: [] 
            });
          }
          
          const group = docsMap.get(groupKey)!;
          if (sku) {
            group.items.push({
              articleId: sku,
              expectedQty: Number(val(iCant).replace(/[^0-9.]/g, '') || 0),
              countedQty: 0,
              status: 'Pending',
              volume: val(iVol),
              unit: val(iUnd),
              invoice: val(iFactura),
              city: ciudad,
              address: val(iDir),
              observation: val(iObs),
              deliveryDate: val(iFechaEnvio)
            });
          }
        });

        const mapped: DocumentL[] = Array.from(docsMap.entries()).map(([key, data]) => ({
          id: `doc-${Date.now()}-${key}`,
          clientId: user.clientId,
          externalDocId: data.carga !== 'S/C' ? data.carga : data.codplan,
          vehicleData: data.placa,
          city: data.city,
          address: data.address,
          status: DocStatus.PENDING,
          planType: type as any,
          inventoryNotes: `M7 Cargue Masivo: ${data.items.length} líneas bajo placa ${data.placa}.`,
          items: data.items,
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          updatedAt: new Date().toISOString(),
          updatedBy: user.name,
          statusId: 'EST-03' 
        }));

        if (mapped.length === 0) {
          alert("No se encontraron datos procesables en las filas debajo de los encabezados.");
        } else {
          setPreview({ fileName: file.name, mapped, type });
        }
      } catch (err) {
        console.error("M7 Excel Crash:", err);
        alert("Fallo crítico: No se pudo leer el archivo. Verifique que no esté abierto en Excel o protegido.");
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-4 animate-in fade-in h-full flex flex-col overflow-hidden">
      <div className="bg-white px-6 py-3 rounded-[2rem] shadow-lg border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-4 shrink-0 transition-all">
         <div className="flex items-center gap-4 shrink-0">
            <div className="w-10 h-10 bg-slate-900 rounded-[1rem] flex items-center justify-center text-emerald-500 shadow-md"><Icons.Package /></div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">Cargues Operativos</h2>
              <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1">SISTEMA M7 GLOBAL</p>
            </div>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner h-10 relative">
            <button onClick={()=>setActiveTab('cargue')} className={`px-5 py-1.5 rounded-lg font-black text-[9px] uppercase transition-all relative z-10 ${activeTab === 'cargue' ? 'text-slate-900' : 'text-slate-400'}`}>Cargue Masivo</button>
            <button onClick={()=>setActiveTab('consultas')} className={`px-5 py-1.5 rounded-lg font-black text-[9px] uppercase transition-all relative z-10 ${activeTab === 'consultas' ? 'text-slate-900' : 'text-slate-400'}`}>Consulta Histórica</button>
            <div className={`absolute top-1 bottom-1 bg-white rounded-lg shadow-md transition-all duration-300 ${activeTab === 'cargue' ? 'left-1 w-[110px]' : 'left-[114px] w-[110px]'}`}></div>
         </div>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {activeTab === 'cargue' ? (
            <div className="max-w-7xl mx-auto space-y-12">
              {!preview ? (
                <div className="space-y-12 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="bg-slate-50 p-12 rounded-[3.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center hover:border-emerald-500 hover:bg-white transition-all group">
                        <div className="w-16 h-16 bg-white text-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg border border-slate-100 group-hover:scale-110 transition-transform"><Icons.Excel /></div>
                        <h3 className="text-lg font-black text-slate-900 uppercase">Plan Normal (Excel)</h3>
                        <p className="text-[9px] text-slate-400 font-black uppercase mt-2 tracking-widest">PROCESA FILAS CON "UN ORIG"</p>
                        <label className="bg-slate-900 text-white px-10 py-4 rounded-xl font-black text-[9px] uppercase mt-8 cursor-pointer shadow-xl hover:bg-emerald-600 transition-all active:scale-95">
                           Seleccionar .xls / .xlsx
                           <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>handleFileUpload(e, 'Plan Normal')} />
                        </label>
                     </div>
                     <div className="bg-slate-50 p-12 rounded-[3.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center hover:border-blue-500 hover:bg-white transition-all group">
                        <div className="w-16 h-16 bg-white text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg border border-slate-100 group-hover:scale-110 transition-transform"><Icons.Excel /></div>
                        <h3 className="text-lg font-black text-slate-900 uppercase">Plan R (Excel/CSV)</h3>
                        <p className="text-[9px] text-slate-400 font-black uppercase mt-2 tracking-widest">PROCESA FILAS CON "UN"</p>
                        <label className="bg-slate-900 text-white px-10 py-4 rounded-xl font-black text-[9px] uppercase mt-8 cursor-pointer shadow-xl hover:bg-blue-600 transition-all active:scale-95">
                           Seleccionar .csv / .xlsx
                           <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e=>handleFileUpload(e, 'Plan R')} />
                        </label>
                     </div>
                  </div>

                  <div className="space-y-8">
                    <div className="flex items-center gap-6">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] shrink-0">Pendientes por Auditoría ({pendingDocs.length})</h4>
                       <div className="h-[2px] w-full bg-slate-50"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {pendingDocs.map(doc => (
                        <div key={doc.id} className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col group hover:border-emerald-500 transition-all">
                           <div className="flex justify-between items-start mb-6">
                              <div className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${doc.planType === 'Plan R' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{doc.planType}</div>
                              <button onClick={()=>setSelectedPendingDoc(doc)} className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-emerald-500 transition-all shadow-lg active:scale-90"><Icons.Eye /></button>
                           </div>
                           <h5 className="text-base font-black text-slate-900 uppercase mb-2 tracking-tighter truncate">{doc.externalDocId}</h5>
                           <div className="flex items-center gap-3 text-slate-400">
                              <Icons.Truck className="w-3 h-3" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">{doc.vehicleData} • {doc.city}</span>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 flex flex-col max-h-[80vh]">
                   <div className="bg-slate-950 p-8 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-8">
                        <div className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl ${preview.type === 'Plan R' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{preview.type}</div>
                        <div><h4 className="font-black uppercase text-2xl tracking-tighter leading-none">Pre-Validación M7</h4><p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">{preview.fileName}</p></div>
                      </div>
                      <button onClick={()=>setPreview(null)} className="w-10 h-10 rounded-full hover:bg-red-500 transition-all flex items-center justify-center text-3xl font-thin">×</button>
                   </div>
                   <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Encabezados Detectados</p><p className="text-3xl font-black text-slate-900 leading-none">{preview.mapped.length}</p></div>
                         <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Total Ítems a Procesar</p><p className="text-3xl font-black text-slate-900 leading-none">{preview.mapped.reduce((acc, d) => acc + d.items.length, 0)}</p></div>
                      </div>

                      <div className="space-y-4">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Desglose de Líneas de Carga</h5>
                        <div className="bg-slate-50 rounded-[2rem] overflow-hidden border border-slate-200 shadow-inner">
                          <table className="w-full text-left text-[10px]">
                            <thead className="bg-slate-200 text-slate-600 font-black uppercase tracking-widest">
                              <tr>
                                <th className="px-6 py-4">Placa</th>
                                <th className="px-6 py-4">Articulo</th>
                                <th className="px-6 py-4 text-center">Cant.</th>
                                <th className="px-6 py-4">Ciudad / Destino</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {preview.mapped.slice(0, 50).map(doc => doc.items.map((it, idx) => (
                                <tr key={`${doc.id}-${idx}`} className="hover:bg-white transition-all font-bold text-slate-600">
                                  <td className="px-6 py-3 font-black text-slate-900">{doc.vehicleData}</td>
                                  <td className="px-6 py-3 uppercase">{it.articleId}</td>
                                  <td className="px-6 py-3 text-center font-black">{it.expectedQty}</td>
                                  <td className="px-6 py-3 uppercase text-emerald-600 truncate max-w-[150px]">{it.city}</td>
                                </tr>
                              ))).flat().slice(0, 100)}
                            </tbody>
                          </table>
                        </div>
                      </div>
                   </div>
                   <div className="p-8 border-t bg-slate-50 flex gap-6 shrink-0">
                      <button onClick={()=>setPreview(null)} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-red-700 transition-all">Anular</button>
                      <button onClick={()=>{onAddDocuments(preview.mapped); setPreview(null);}} className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4 active:scale-95">Sincronizar M7</button>
                   </div>
                </div>
              )}
            </div>
          ) : (
            <ConsultasDocumentosL documents={documents} invoices={invoices} user={user} masterEstados={masterEstados} />
          )}
        </div>
      </div>

      {selectedPendingDoc && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="bg-white w-full max-w-[95vw] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-white/5">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[1.8rem] flex items-center justify-center text-slate-950 shadow-2xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-3xl font-black uppercase tracking-tighter leading-none">Expediente M7: {selectedPendingDoc.externalDocId}</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">AUDITORÍA DE CARGA</p>
                    </div>
                 </div>
                 <button onClick={()=>setSelectedPendingDoc(null)} className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-4xl font-thin">×</button>
              </div>
              
              <div className="p-12 overflow-y-auto space-y-12 custom-scrollbar flex-1 bg-slate-50/20">
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Unidad</p><p className="font-black text-slate-900 text-lg uppercase">{selectedPendingDoc.vehicleData}</p></div>
                    <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Ciudad Base</p><p className="font-black text-slate-900 text-lg uppercase truncate">{selectedPendingDoc.city}</p></div>
                    <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Operador</p><p className="font-black text-slate-900 text-lg uppercase truncate">{selectedPendingDoc.createdBy}</p></div>
                    <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Plan</p><p className="font-black text-blue-600 text-lg uppercase">{selectedPendingDoc.planType}</p></div>
                    <div className="bg-white p-7 rounded-[2rem] shadow-sm border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase mb-2">Fecha</p><p className="font-black text-slate-900 text-lg uppercase">{new Date(selectedPendingDoc.createdAt).toLocaleDateString()}</p></div>
                 </div>

                 <div className="space-y-6">
                    <div className="flex items-center gap-4"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Detalle de Líneas de Carga</h4><div className="h-[2px] flex-1 bg-slate-100"></div></div>
                    <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100">
                       <div className="overflow-x-auto">
                          <table className="w-full text-left">
                             <thead className="bg-slate-900 text-white font-black uppercase text-[8px] tracking-widest">
                                <tr>
                                   <th className="px-6 py-5">Articulo</th>
                                   <th className="px-6 py-5 text-center">Cant.</th>
                                   <th className="px-6 py-5 text-center">Volumen</th>
                                   <th className="px-6 py-5 text-center">UM</th>
                                   <th className="px-6 py-5">Ciudad</th>
                                   <th className="px-6 py-5">Factura</th>
                                   <th className="px-6 py-5">Dirección</th>
                                   <th className="px-6 py-5">Observación</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                {selectedPendingDoc.items.map((it, idx) => (
                                   <tr key={idx} className="hover:bg-slate-50 transition-all text-[10px] font-bold text-slate-600">
                                      <td className="px-6 py-5 font-black text-slate-900 uppercase">{it.articleId}</td>
                                      <td className="px-6 py-5 text-center font-black text-slate-900">{it.expectedQty}</td>
                                      <td className="px-6 py-5 text-center">{it.volume || '0'}</td>
                                      <td className="px-6 py-5 text-center">{it.unit || 'UND'}</td>
                                      <td className="px-6 py-5 font-black text-emerald-600 uppercase">{it.city}</td>
                                      <td className="px-6 py-5 uppercase">{it.invoice || 'N/A'}</td>
                                      <td className="px-6 py-5 uppercase truncate max-w-[150px]">{it.address}</td>
                                      <td className="px-6 py-5 uppercase truncate max-w-[150px]">{it.observation}</td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="p-10 border-t bg-white flex justify-end shrink-0"><button onClick={()=>setSelectedPendingDoc(null)} className="px-12 py-5 bg-slate-900 text-white rounded-[1.8rem] font-black text-xs uppercase hover:bg-emerald-600 transition-all shadow-xl">Cerrar Expediente</button></div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GestionDocumentosL;
