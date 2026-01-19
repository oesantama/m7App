
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

  const [searchTerm, setSearchTerm] = useState('');
  const [pendingPage, setPendingPage] = useState(1);
  const itemsPerPage = 6;

  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const previewItemsPerPage = 10;

  // Utilidad para exportar a Excel
  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "M7_Datos");
    XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
  };

  const formatExcelDate = (val: any): string => {
    if (!val) return 'S/I';
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toLocaleDateString('es-CO');
    }
    return String(val).trim();
  };

  const pendingDocs = useMemo(() => {
    const list = documents.filter(d => d.statusId === 'EST-03' || d.status === DocStatus.PENDING);
    if (!searchTerm) return list;
    return list.filter(d => 
      d.externalDocId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.vehicleData || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.city || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  const paginatedPending = useMemo(() => {
    const start = (pendingPage - 1) * itemsPerPage;
    return pendingDocs.slice(start, start + itemsPerPage);
  }, [pendingDocs, pendingPage]);

  const totalPendingPages = Math.ceil(pendingDocs.length / itemsPerPage);

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
        const requiredTerms = ['placa', 'carga', 'articulo', 'item', 'un orig', 'un', 'cant env'];
        
        for (let i = 0; i < Math.min(rawData.length, 50); i++) {
          const row = (rawData[i] || []).map(c => String(c || '').toLowerCase().trim());
          const matches = row.filter(cell => requiredTerms.some(term => cell === term || cell.includes(term))).length;
          if (matches >= 3) { headerRowIndex = i; break; }
        }

        if (headerRowIndex === -1) {
          alert("M7 ERROR: No se detectó la fila de títulos. Verifique el formato.");
          return;
        }

        const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
        const findIdx = (terms: string[]) => headers.findIndex(h => {
          if (!h) return false;
          const hLower = h.toLowerCase().trim();
          if (terms.some(t => hLower === t.toLowerCase().trim())) return true;
          return terms.some(t => {
            const tLower = t.toLowerCase().trim();
            if (tLower === 'um' && (hLower.includes('volume') || hLower.includes('volum'))) return false;
            return hLower.includes(tLower);
          });
        });

        const iCodPlan = type === 'Plan Normal' ? findIdx(['un orig', 'cod plan']) : findIdx(['un', 'cod plan']);
        const iPlaca = findIdx(['placa']);
        const iCarga = findIdx(['carga', 'nº carga']);
        const iFechaEnvio = findIdx(['ship date', 'fecha envio', 'fecha despacho']);
        const iArticulo = type === 'Plan Normal' ? findIdx(['articulo']) : findIdx(['item']);
        const iCant = findIdx(['cant env', 'cantidad']);
        const iVolTotal = findIdx(['total volume']);
        const iVolUnidad = findIdx(['volumen']);
        const iUnd = findIdx(['um', 'und', 'unid']);
        const iFactura = findIdx(['remision/transferencia', 'factura']);
        const iCiudad = type === 'Plan Normal' ? findIdx(['destino', 'ciudad']) : findIdx(['ciudad']);
        const iDir = type === 'Plan Normal' ? findIdx(['dirección 1']) : findIdx(['dir 1']);
        const iObs = type === 'Plan Normal' ? findIdx(['message', 'observacion']) : findIdx(['comentarios', 'observacion']);
        const iPed = findIdx(['nº ped', 'pedido', 'order']);
        
        const dataRows = rawData.slice(headerRowIndex + 1);
        const docsMap = new Map<string, { codplan: string, placa: string, carga: string, city: string, address: string, deliveryDate: string, items: DocumentLItem[] }>();

        dataRows.forEach((row) => {
          if (!row || row.length === 0 || row.every(c => c === '')) return;
          const val = (idx: number) => idx !== -1 ? String(row[idx] || '').trim() : '';

          const placa = val(iPlaca);
          const carga = val(iCarga);
          if (!placa && !carga) return;

          const groupKey = `${placa || 'S/A'}-${carga || 'S/C'}`;

          if (!docsMap.has(groupKey)) {
            docsMap.set(groupKey, { 
              codplan: val(iCodPlan) || groupKey,
              placa: placa || 'S/A',
              carga: carga || 'S/C',
              city: val(iCiudad) || 'S/D',
              address: val(iDir) || 'S/D',
              deliveryDate: formatExcelDate(row[iFechaEnvio]),
              items: [] 
            });
          }
          
          const group = docsMap.get(groupKey)!;
          const sku = val(iArticulo);
          if (sku) {
            group.items.push({
              articleId: sku,
              expectedQty: Number(val(iCant).replace(/[^0-9.]/g, '') || 0),
              countedQty: 0,
              status: 'Pending',
              volume: val(iVolTotal),
              unitVolume: val(iVolUnidad),
              unit: val(iUnd),
              invoice: val(iFactura),
              city: val(iCiudad),
              address: val(iDir),
              observation: val(iObs),
              deliveryDate: formatExcelDate(row[iFechaEnvio]),
              orderNumber: val(iPed)
            });
          }
        });

        const mapped: DocumentL[] = Array.from(docsMap.entries()).map(([key, data]) => ({
          id: `doc-${Date.now()}-${key}`,
          clientId: user.clientId,
          externalDocId: data.carga,
          vehicleData: data.placa,
          codplan: data.codplan,
          deliveryDate: data.deliveryDate,
          city: data.city,
          address: data.address,
          status: DocStatus.PENDING,
          planType: type as any,
          inventoryNotes: `M7 Cargue: ${data.items.length} líneas`,
          items: data.items,
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          updatedAt: new Date().toISOString(),
          updatedBy: user.name,
          statusId: 'EST-03' 
        }));

        setPreview({ fileName: file.name, mapped, type });
        setPreviewPage(1);
        setPreviewSearch('');
      } catch (err) {
        alert("Fallo en lectura de Excel.");
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredPreviewItems = useMemo(() => {
    if (!preview) return [];
    const allItems = preview.mapped.flatMap(doc => doc.items.map(it => ({ ...it, docId: doc.externalDocId, docVehicle: doc.vehicleData })));
    if (!previewSearch) return allItems;
    return allItems.filter(it => 
      it.articleId.toLowerCase().includes(previewSearch.toLowerCase()) ||
      it.docId.toLowerCase().includes(previewSearch.toLowerCase()) ||
      it.docVehicle.toLowerCase().includes(previewSearch.toLowerCase())
    );
  }, [preview, previewSearch]);

  const paginatedPreviewItems = useMemo(() => {
    const start = (previewPage - 1) * previewItemsPerPage;
    return filteredPreviewItems.slice(start, start + previewItemsPerPage);
  }, [filteredPreviewItems, previewPage]);

  const totalPreviewPages = Math.ceil(filteredPreviewItems.length / previewItemsPerPage);

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
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] shrink-0">Pendientes por Auditoría ({pendingDocs.length})</h4>
                       <div className="flex items-center gap-4">
                          <button onClick={() => exportToExcel(pendingDocs.map(d => ({ DocumentoL: d.externalDocId, UNOrig: d.codplan, Placa: d.vehicleData, Ciudad: d.city, Status: d.status })), "M7_Pendientes")} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><Icons.Excel /></button>
                          <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3">
                            <Icons.Search className="w-3 h-3 text-slate-300" />
                            <input type="text" placeholder="BUSCAR PENDIENTES..." value={searchTerm} onChange={e=>{setSearchTerm(e.target.value); setPendingPage(1);}} className="bg-transparent border-none outline-none font-black text-[9px] uppercase w-full" />
                          </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {paginatedPending.map(doc => (
                        <div key={doc.id} className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col group hover:border-emerald-500 transition-all">
                           <div className="flex justify-between items-start mb-6">
                              <div className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${doc.planType === 'Plan R' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{doc.planType}</div>
                              <button onClick={()=>setSelectedPendingDoc(doc)} className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-emerald-500 transition-all shadow-lg active:scale-90"><Icons.Eye /></button>
                           </div>
                           <h5 className="text-base font-black text-slate-900 uppercase mb-1 tracking-tighter truncate">{doc.externalDocId}</h5>
                           <div className="space-y-2 mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                              <p><span className="text-slate-900">UN ORIG:</span> {doc.codplan || 'S/I'}</p>
                              <p><span className="text-slate-900">PLACA:</span> {doc.vehicleData}</p>
                              <p><span className="text-slate-900">CARGUE:</span> {new Date(doc.createdAt).toLocaleDateString()}</p>
                              <p><span className="text-slate-900">ESTADO:</span> {doc.status}</p>
                           </div>
                        </div>
                      ))}
                    </div>

                    {totalPendingPages > 1 && (
                      <div className="flex justify-center items-center gap-4 mt-8">
                         <button disabled={pendingPage === 1} onClick={()=>setPendingPage(p => p-1)} className="p-3 bg-slate-100 rounded-xl disabled:opacity-20"><Icons.ChevronRight className="rotate-180" /></button>
                         <span className="text-[10px] font-black uppercase">Pág {pendingPage} de {totalPendingPages}</span>
                         <button disabled={pendingPage >= totalPendingPages} onClick={()=>setPendingPage(p => p+1)} className="p-3 bg-slate-100 rounded-xl disabled:opacity-20"><Icons.ChevronRight /></button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[3.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 flex flex-col max-h-[85vh]">
                   <div className="bg-slate-950 p-8 text-white flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-8">
                        <div className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl ${preview.type === 'Plan R' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{preview.type}</div>
                        <div><h4 className="font-black uppercase text-2xl tracking-tighter leading-none">Pre-Validación M7</h4><p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">{preview.fileName}</p></div>
                      </div>
                      <div className="flex items-center gap-4">
                         <button onClick={() => exportToExcel(filteredPreviewItems, "M7_Prevalidacion")} className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all"><Icons.Excel /></button>
                         <button onClick={()=>setPreview(null)} className="w-10 h-10 rounded-full hover:bg-red-500 transition-all flex items-center justify-center text-3xl font-thin">×</button>
                      </div>
                   </div>
                   <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                      <div className="flex justify-between items-center">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3 flex-1 max-w-md">
                          <Icons.Search className="w-3 h-3 text-slate-300" />
                          <input type="text" placeholder="FILTRAR PRE-VALIDACIÓN..." value={previewSearch} onChange={e => {setPreviewSearch(e.target.value); setPreviewPage(1);}} className="bg-transparent border-none outline-none font-black text-[9px] uppercase w-full" />
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-[2rem] overflow-hidden border border-slate-200">
                        <table className="w-full text-left text-[9px]">
                          <thead className="bg-slate-900 text-white font-black uppercase tracking-widest">
                            <tr>
                              <th className="px-6 py-4">Documento / Placa</th>
                              <th className="px-6 py-4">Articulo</th>
                              <th className="px-6 py-4 text-center">Cant.</th>
                              <th className="px-6 py-4">Nº Ped</th>
                              <th className="px-6 py-4">UM</th>
                              <th className="px-6 py-4">Vol. Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedPreviewItems.map((it: any, idx) => (
                              <tr key={idx} className="hover:bg-white transition-all font-bold text-slate-600">
                                <td className="px-6 py-3 font-black text-slate-900 uppercase">{it.docId} <span className="text-slate-300 mx-2">|</span> {it.docVehicle}</td>
                                <td className="px-6 py-3 uppercase">{it.articleId}</td>
                                <td className="px-6 py-3 text-center font-black">{it.expectedQty}</td>
                                <td className="px-6 py-3 uppercase text-emerald-600">{it.orderNumber || 'S/I'}</td>
                                <td className="px-6 py-3 text-blue-600 font-black">{it.unit || 'und'}</td>
                                <td className="px-6 py-3">{it.volume || '0'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {totalPreviewPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-4">
                           <button disabled={previewPage === 1} onClick={()=>setPreviewPage(p=>p-1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight className="rotate-180" /></button>
                           <span className="text-[10px] font-black uppercase">Pág {previewPage} de {totalPreviewPages}</span>
                           <button disabled={previewPage >= totalPreviewPages} onClick={()=>setPreviewPage(p=>p+1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight /></button>
                        </div>
                      )}
                   </div>
                   <div className="p-8 border-t bg-slate-50 flex gap-6 shrink-0">
                      <button onClick={()=>setPreview(null)} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-red-700 transition-all">Anular</button>
                      <button onClick={()=>{onAddDocuments(preview.mapped); setPreview(null);}} className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-4 active:scale-95">Sincronizar</button>
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
           <div className="bg-white w-full max-w-[98vw] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/5">
              <div className="bg-slate-900 p-10 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-8">
                    <div className="w-16 h-16 bg-emerald-500 rounded-[1.8rem] flex items-center justify-center text-slate-950 shadow-2xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-3xl font-black uppercase tracking-tighter leading-none">Expediente M7: {selectedPendingDoc.externalDocId}</h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">AUDITORÍA INTEGRAL DE CARGA</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <button onClick={() => exportToExcel(selectedPendingDoc.items, `M7_Detalles_${selectedPendingDoc.externalDocId}`)} className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all flex items-center gap-2 font-black text-[10px] uppercase"><Icons.Excel /> Exportar</button>
                    <button onClick={()=>setSelectedPendingDoc(null)} className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-4xl font-thin">×</button>
                 </div>
              </div>
              
              <div className="p-10 overflow-y-auto space-y-10 custom-scrollbar flex-1 bg-slate-50/20">
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">UN Orig</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.codplan || 'S/I'}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Envío</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.deliveryDate || 'S/I'}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Placa</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.vehicleData}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Documento L</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.externalDocId}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Cargue</p><p className="font-black text-slate-900 text-xs uppercase">{new Date(selectedPendingDoc.createdAt).toLocaleDateString('es-CO')}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Cargue</p><p className="font-black text-slate-900 text-xs uppercase truncate">{selectedPendingDoc.createdBy}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Estado</p><p className="font-black text-emerald-600 text-xs uppercase">{selectedPendingDoc.status}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Inventario</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.inventoryDate ? new Date(selectedPendingDoc.inventoryDate).toLocaleDateString('es-CO') : 'PENDIENTE'}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Inventario</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.inventoryUser || 'S/A'}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Observación</p><p className="font-black text-slate-900 text-[10px] uppercase truncate">{selectedPendingDoc.inventoryNotes || 'S/O'}</p></div>
                 </div>

                 <div className="space-y-6">
                    <div className="flex items-center gap-4"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Detalle de Líneas de Carga M7</h4><div className="h-[2px] flex-1 bg-slate-100"></div></div>
                    <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100">
                       <div className="overflow-x-auto">
                          <table className="w-full text-left">
                             <thead className="bg-slate-900 text-white font-black uppercase text-[8px] tracking-widest">
                                <tr>
                                   <th className="px-6 py-5">Articulo</th>
                                   <th className="px-6 py-5 text-center">Cant. Exp</th>
                                   <th className="px-6 py-5 text-center">Cant 1</th>
                                   <th className="px-6 py-5 text-center">Cant 2</th>
                                   <th className="px-6 py-5">Nº Ped</th>
                                   <th className="px-6 py-5">UM</th>
                                   <th className="px-6 py-5">Volumen Total</th>
                                   <th className="px-6 py-5">Vol. Unidad</th>
                                   <th className="px-6 py-5">Factura</th>
                                   <th className="px-6 py-5">Ciudad</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                {selectedPendingDoc.items.map((it, idx) => (
                                   <tr key={idx} className="hover:bg-slate-50 transition-all text-[9px] font-bold text-slate-600">
                                      <td className="px-6 py-5 font-black text-slate-900 uppercase">{it.articleId}</td>
                                      <td className="px-6 py-5 text-center font-black text-slate-900 bg-slate-50">{it.expectedQty}</td>
                                      <td className="px-6 py-5 text-center font-black text-blue-600">{it.count1 || 0}</td>
                                      <td className="px-6 py-5 text-center font-black text-amber-600">{it.count2 || it.countedQty || 0}</td>
                                      <td className="px-6 py-5 text-emerald-600 font-black uppercase">{it.orderNumber || 'S/I'}</td>
                                      <td className="px-6 py-5 font-black text-slate-900">{it.unit || 'und'}</td>
                                      <td className="px-6 py-3">{it.volume || '0'}</td>
                                      <td className="px-6 py-3 text-slate-400 italic">{it.unitVolume || '0'}</td>
                                      <td className="px-6 py-5 uppercase truncate max-w-[100px]">{it.invoice || 'N/A'}</td>
                                      <td className="px-6 py-5 uppercase font-black text-slate-800">{it.city}</td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="p-10 border-t bg-white flex justify-end shrink-0"><button onClick={()=>setSelectedPendingDoc(null)} className="px-12 py-5 bg-slate-900 text-white rounded-[1.8rem] font-black text-xs uppercase hover:bg-emerald-600 transition-all shadow-xl">Cerrar Auditoría</button></div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GestionDocumentosL;
