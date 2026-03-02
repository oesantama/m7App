import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DocumentL, User, DocStatus, MasterRecord, Article, DocumentLItem } from '../types';
import BlindCount from './BlindCount';
import { hasPermission } from '../utils/permissions';
import * as XLSX from 'xlsx';

interface RecibidoManualProps {
  documents: DocumentL[];
  user: User;
  masterEstados: MasterRecord[];
  masterNotificaciones: MasterRecord[];
  masterTipoNotificacion: MasterRecord[];
  masterArticulo: MasterRecord[];
  clients: MasterRecord[];
  onUpdateDocuments: (docs: DocumentL[]) => void;
  onAddArticleToMaster: (article: Article) => void;
}

const RecibidoManual: React.FC<RecibidoManualProps> = ({
  documents, user, masterEstados, masterNotificaciones,
  masterTipoNotificacion,
  masterArticulo,
  clients,
  onUpdateDocuments, onAddArticleToMaster
}) => {
  const [selectedDocForCount, setSelectedDocForCount] = useState<DocumentL | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>(user.clientId || '');
  const [externalDocId, setExternalDocId] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocs = useMemo(() => {
    return documents.filter(d => 
      (!selectedClientId || d.clientId === selectedClientId) && 
      (d.status === DocStatus.PENDING || d.status === DocStatus.COUNTING) &&
      (d.externalDocId.toLowerCase().includes(searchTerm.toLowerCase()) || d.vehicleData?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [documents, selectedClientId, searchTerm]);

  const handleStartManual = async () => {
    if (!selectedClientId) return toast.error("Seleccione un cliente");
    if (!externalDocId) return toast.error("Ingrese ID de Documento");
    if (!vehiclePlate) return toast.error("Ingrese Placa de Vehículo");

    setIsCreating(true);
    try {
      const res = await api.createManualDocument({
        externalDocId,
        clientId: selectedClientId,
        vehiclePlate,
        user: user.name
      });

      if (res.success) {
        const newDoc: DocumentL = {
          ...res.document,
          items: [] // Inicia vacío para manual
        };
        api.bulkCreateDocuments({ documents: [newDoc] })
      .then(res => {
        if (res.success) {
          toast.success("Inventario manual iniciado.");
          onUpdateDocuments([...documents, newDoc]);
          setSelectedDocForCount(newDoc);
        }
      })
      .catch(err => {
        console.error(err);
        const errorMsg = err.response?.data?.error || "Error al iniciar auditoría manual";
        const details = err.response?.data?.details || "";
        
        if (err.response?.status === 409) {
            toast.error(errorMsg, {
                description: details,
                duration: 5000
            });
        } else {
            toast.error(errorMsg);
        }
      });
      } else {
        toast.error(res.error || "Error al crear documento");
      }
    } catch (e: any) {
      toast.error("Error de conexión: " + e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePartialSave = (currentItems: DocumentLItem[], generalObs: string) => {
    if (!selectedDocForCount) return;

    api.syncInventory({
      docId: selectedDocForCount.id,
      items: currentItems,
      user: user.name,
      notes: generalObs,
      isPartial: true
    }).then(res => {
      if (res.success) {
        const updatedDocs = documents.map(d =>
          d.id === selectedDocForCount.id ? { ...d, items: currentItems, updatedAt: new Date().toISOString() } : d
        );
        onUpdateDocuments(updatedDocs);
      }
    });
  };

  const handleFinishCount = (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => {
    if (!selectedDocForCount) return;

    api.syncInventory({
      docId: selectedDocForCount.id,
      items: finalItems,
      user: user.name,
      notes: generalObs,
      isPartial: false,
      driverEmail: updateEmail
    }).then(res => {
      if (res.success) {
        toast.success("Recibo manual finalizado.");
        const updatedDocs = documents.map(d =>
          d.id === selectedDocForCount.id
            ? {
              ...d,
              items: finalItems,
              status: DocStatus.INVENTORED,
              inventoryDate: new Date().toISOString(),
              inventoryUser: user.name,
              inventoryNotes: generalObs,
              updatedBy: user.name,
              updatedAt: new Date().toISOString()
            }
            : d
        );
        onUpdateDocuments(updatedDocs);
        setSelectedDocForCount(null);
      } else {
        toast.error("Error al sincronizar: " + (res.error || "Desconocido"));
      }
    });
  };

  const handleManualExcelUpload = (e: React.ChangeEvent<HTMLInputElement>, doc: DocumentL, forcedType?: 'Plan Normal' | 'Plan R') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBuffer = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];

        if (!rawData || rawData.length < 1) return;

        // 1. Motor de Detección Avanzado (M7 Engine)
        let headerRowIndex = -1;
        const requiredTerms = ['articulo', 'item', 'codigo', 'sku', 'cantidad', 'qty', 'cant env', 'un orig', 'un'];
        
        for (let i = 0; i < Math.min(rawData.length, 50); i++) {
          const row = (rawData[i] || []).map(c => String(c || '').toLowerCase().trim());
          if (row.filter(cell => requiredTerms.some(term => cell.includes(term))).length >= 2) { 
            headerRowIndex = i; 
            break; 
          }
        }

        if (headerRowIndex === -1) {
          toast.error("ERROR DE FORMATO M7: No se detectó la fila de títulos.");
          return;
        }

        const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
        const findIdx = (terms: string[]) => headers.findIndex(h => terms.some(t => h.toLowerCase().trim().includes(t.toLowerCase().trim())));

        // Identificar tipo de plan automáticamente si no se forzó
        const iExactUnOrig = headers.findIndex(h => h.toLowerCase().trim() === 'un orig');
        const detectedType = iExactUnOrig !== -1 ? 'Plan Normal' : 'Plan R';
        const finalType = forcedType || detectedType;

        const isPlanR = finalType === 'Plan R';

        // Mapeo selectivo según tipo detectado
        const iArt = findIdx(['articulo', 'item', 'codigo', 'sku']);
        const iCant = findIdx(['cant env', 'cantidad', 'qty', 'cantidad esperada']);
        const iUnd = findIdx(['um', 'und', 'unid', 'unidad']);
        const iFactura = findIdx(['remision', 'factura', 'documento', 'invoice']);
        const iCity = findIdx(['destino', 'ciudad', 'city']);
        const iDir = findIdx(['dirección', 'direccion', 'address']);
        const iVol = findIdx(isPlanR ? ['volumen'] : ['vol. total', 'total volume']);

        if (iArt === -1 || iCant === -1) {
          toast.error(`Faltan columnas críticas en ${finalType}.`);
          return;
        }

        // Utilidad de parseo numérico (M7 Specs)
        const parseNumberM7 = (raw: string, isR: boolean) => {
          if (!raw || raw.trim() === '') return 0;
          let val = raw.trim();
          if (!isR) {
              val = val.replace(/,/g, '.'); // Plan Normal: Coma es decimal
          }
          return parseFloat(val) || 0;
        };

        const items: DocumentLItem[] = [];
        const consolidatedItems: any[] = [];

        rawData.slice(headerRowIndex + 1).forEach(row => {
          const sku = String(row[iArt] || '').trim();
          if (!sku) return;

          const qty = parseNumberM7(String(row[iCant] || '0'), isPlanR);
          let volVal = parseNumberM7(String(row[iVol] || '0'), isPlanR);
          
          if (!isPlanR && volVal > 1000) volVal = volVal / 1000000;

          items.push({
            articleId: sku,
            expectedQty: qty,
            receivedQty: 0,
            countedQty: 0,
            status: 'Pending',
            unit: iUnd !== -1 ? String(row[iUnd]) : 'UND',
            invoice: iFactura !== -1 ? String(row[iFactura]) : '',
            city: iCity !== -1 ? String(row[iCity]) : '',
            address: iDir !== -1 ? String(row[iDir]) : '',
            volume: String(volVal)
          } as DocumentLItem);

          consolidatedItems.push({
            articleId: sku,
            expectedQty: qty,
            count1: 0,
            count2: 0,
            pickedQty: 0,
            dispatchedQty: 0
          });
        });

        if (items.length === 0) {
          toast.error("No se encontraron datos válidos.");
          return;
        }

        api.bulkCreateDocuments({
          documents: [{
            ...doc,
            items,
            consolidatedItems,
            planType: 'MANUAL',
            status: doc.status,
            updatedBy: user.name,
            inventoryNotes: `Sincro Excel ${finalType}: ${items.length} líneas`
          }]
        }).then(res => {
          if (res.success) {
            toast.success(`¡ÉXITO! Se cargaron ${items.length} líneas como ${finalType}.`);
            onUpdateDocuments(documents.map(d => d.id === doc.id ? { ...d, items, consolidatedItems, inventoryNotes: `Sincro Excel ${finalType}: ${items.length} líneas` } : d));
          } else {
            toast.error("Error al sincronizar: " + res.error);
          }
        }).catch(() => toast.error("Error de conexión."));

      } catch (err) {
        toast.error("Fallo crítico leyendo el archivo.");
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  if (selectedDocForCount) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        <BlindCount
          document={selectedDocForCount}
          user={user}
          masterNotificaciones={masterNotificaciones}
          masterTipoNotificacion={masterTipoNotificacion}
          masterArticulo={masterArticulo}
          onConfirm={handleFinishCount}
          onPartialSave={handlePartialSave}
          onCancel={() => setSelectedDocForCount(null)}
          onAddArticleToMaster={onAddArticleToMaster}
          onAddNotificationToMaster={() => {}} // No necesitamos agregar notifs aquí por ahora
          allowExtraItems={true}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 h-full flex flex-col bg-slate-50 overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        
        {/* PANEL IZQUIERDA: CREAR NUEVO */}
        <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100 space-y-8 flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-500 text-slate-900 rounded-2xl flex items-center justify-center shadow-lg"><Icons.Plus className="w-8 h-8" /></div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Nuevo Recibo Manual</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inicie un proceso sin documento previo</p>
            </div>
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Cliente / Operación</label>
              <select 
                value={selectedClientId} 
                onChange={e => setSelectedClientId(e.target.value)}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all cursor-pointer"
              >
                <option value="">SELECCIONE CLIENTE</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Documento de Referencia (ID L)</label>
              <input 
                type="text" 
                value={externalDocId}
                onChange={e => setExternalDocId(e.target.value.toUpperCase())}
                placeholder="EJ: L-2024-XXXX"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Vehículo / Placa</label>
              <input 
                type="text" 
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="EJ: ABC-123"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <button
            onClick={handleStartManual}
            disabled={isCreating}
            className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-20"
          >
            {isCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.Play className="w-5 h-5" />}
            Iniciar Auditoría Manual
          </button>
        </div>

        {/* PANEL DERECHA: CONTINUAR EXISTENTES */}
        <div className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Continuar Pendientes</h3>
            <span className="px-3 py-1 bg-emerald-500 text-slate-950 rounded-lg text-[10px] font-black">{filteredDocs.length}</span>
          </div>

          <div className="relative mb-6">
            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="BUSCAR POR ID O PLACA..."
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-xs outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
            {filteredDocs.map(doc => (
              <div key={doc.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group/card hover:bg-white/10 transition-all">
                <div className="p-6 flex items-center justify-between gap-4">
                  <button
                    onClick={() => setSelectedDocForCount(doc)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-[10px] font-black text-emerald-500 uppercase mb-1">{doc.externalDocId}</p>
                    <p className="text-lg font-black text-white uppercase tracking-tighter truncate">{doc.vehicleData || 'S/A'}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">HACE {Math.round((Date.now() - new Date(doc.createdAt).getTime()) / 60000)} MINS</p>
                  </button>
                  <button 
                    onClick={() => setSelectedDocForCount(doc)}
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white hover:bg-emerald-500 transition-all shrink-0"
                  >
                    <Icons.ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                
                {/* BOTONES CARGA EXCEL PARA MANUALES (Plan Normal / Plan R) */}
                {doc.planType === 'MANUAL' && (
                  <div className="px-6 pb-6 mt-[-10px] grid grid-cols-2 gap-2">
                    <label className="py-3 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 rounded-xl font-black text-[8px] uppercase tracking-tighter transition-all flex items-center justify-center gap-1 cursor-pointer shadow-lg group">
                      <Icons.Excel className="w-3 h-3 group-hover:scale-110 transition-transform" />
                      Plan Normal
                      <input 
                        type="file" 
                        accept=".xlsx,.xls" 
                        className="hidden" 
                        onChange={(e) => handleManualExcelUpload(e, doc, 'Plan Normal')} 
                      />
                    </label>
                    <label className="py-3 bg-blue-500/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 rounded-xl font-black text-[8px] uppercase tracking-tighter transition-all flex items-center justify-center gap-1 cursor-pointer shadow-lg group">
                      <Icons.Excel className="w-3 h-3 group-hover:scale-110 transition-transform" />
                      Plan R
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv" 
                        className="hidden" 
                        onChange={(e) => handleManualExcelUpload(e, doc, 'Plan R')} 
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
            {filteredDocs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                <Icons.Package className="w-20 h-20 text-white mb-4" />
                <p className="text-white font-black uppercase text-xs">No hay planes pendientes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecibidoManual;
