import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DocumentL, User, DocStatus, MasterRecord, Article, DocumentLItem } from '../types';
import BlindCount from './BlindCount';
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
  documents, user, masterNotificaciones,
  masterTipoNotificacion,
  masterArticulo,
  clients,
  onUpdateDocuments, onAddArticleToMaster
}) => {
  const [selectedDocForCount, setSelectedDocForCount] = useState<DocumentL | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>(user.clientId || '');
  const [externalDocId, setExternalDocId] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [planType, setPlanType] = useState<'PLAN NORMAL' | 'PLAN R'>('PLAN NORMAL');
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocs = useMemo(() => {
    return documents.filter(d =>
      d.id?.startsWith('L-MAN-') &&
      (!selectedClientId || String(d.clientId) === String(selectedClientId)) &&
      (d.status === DocStatus.PENDING || d.status === DocStatus.COUNTING || d.status === 'PENDIENTE' || d.status === 'EN CONTEO') &&
      (d.externalDocId.toLowerCase().includes(searchTerm.toLowerCase()) || (d.vehicleData || '').toLowerCase().includes(searchTerm.toLowerCase()))
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
        planType,
        user: user.name
      });

      if (res.success) {
        // createManualDocument ya creó el documento en BD — no llamar bulkCreateDocuments aquí
        // (causaría 409 duplicado al intentar insertar el mismo ID de documento)
        const newDoc: DocumentL = { ...res.document, items: [] };
        toast.success("Inventario manual iniciado.");
        onUpdateDocuments([...documents, newDoc]);
        setSelectedDocForCount(newDoc);
      } else {
        toast.error(res.error || "Error al crear documento");
      }
    } catch (e: any) {
      toast.error("Error de conexión: " + e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePartialSave = async (currentItems: DocumentLItem[], generalObs: string): Promise<void> => {
    if (!selectedDocForCount) return; // nada que guardar, sin error
    const res = await api.syncInventory({
      docId: selectedDocForCount.id,
      items: currentItems,
      user: user.name,
      notes: generalObs,
      isPartial: true
    });
    if (res.success) {
      onUpdateDocuments(documents.map(d =>
        d.id === selectedDocForCount.id ? { ...d, items: currentItems, updatedAt: new Date().toISOString() } : d
      ));
    } else {
      // Lanzar para que BlindCount muestre syncStatus = 'error' (punto rojo)
      throw new Error(res.error || 'Error al guardar parcial');
    }
  };

  const handleFinishCount = async (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string): Promise<void> => {
    if (!selectedDocForCount) return;
    const res = await api.syncInventory({
      docId: selectedDocForCount.id,
      items: finalItems,
      user: user.name,
      notes: generalObs,
      isPartial: false,
      driverEmail: updateEmail
    });
    if (res.success) {
      toast.success("Recibo manual finalizado.");
      onUpdateDocuments(documents.map(d =>
        d.id === selectedDocForCount.id
          ? { ...d, items: finalItems, status: DocStatus.INVENTORED, inventoryDate: new Date().toISOString(), inventoryUser: user.name, inventoryNotes: generalObs, updatedBy: user.name, updatedAt: new Date().toISOString() }
          : d
      ));
      setSelectedDocForCount(null);
    } else {
      // Lanzar para que BlindCount resetee isProcessing y muestre el error
      throw new Error((res.error || 'Error desconocido') + (res.detail ? ` — ${res.detail}` : ''));
    }
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
        const iUn = findIdx(['un orig', 'un', 'un code', 'cod plan']);
        const iRef = findIdx(['ref 1', 'referencia', 'client ref', 'ref']);
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
            volume: String(volVal),
            unCode: iUn !== -1 ? String(row[iUn]) : '',
            clientRef: iRef !== -1 ? String(row[iRef]) : ''
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
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 flex-1 min-h-0">
        
        {/* PANEL IZQUIERDA: CREAR NUEVO */}
        <div className="bg-white rounded-[2.5rem] md:rounded-[3rem] p-6 md:p-10 shadow-xl border border-slate-100 space-y-6 md:space-y-8 flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-500 text-slate-900 rounded-2xl flex items-center justify-center shadow-lg shrink-0"><Icons.Plus className="w-6 h-6 md:w-8 md:h-8" /></div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter">Nuevo Recibo Manual</h2>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inicie un proceso sin documento</p>
            </div>
          </div>

          <div className="space-y-4 md:space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Cliente / Operación</label>
              <select 
                value={selectedClientId} 
                onChange={e => setSelectedClientId(e.target.value)}
                className="w-full p-3 md:p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all cursor-pointer"
              >
                <option value="">SELECCIONE CLIENTE</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Documento de Referencia</label>
              <input 
                type="text" 
                value={externalDocId}
                onChange={e => setExternalDocId(e.target.value.toUpperCase())}
                placeholder="EJ: L-2024-XXXX"
                className="w-full p-3 md:p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Vehículo / Placa</label>
              <input 
                type="text" 
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="EJ: ABC-123"
                className="w-full p-3 md:p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Tipo de Plan</label>
              <div className="grid grid-cols-2 gap-2 md:gap-3">
                <button
                  onClick={() => setPlanType('PLAN NORMAL')}
                  className={`py-3 rounded-2xl font-black text-[9px] md:text-[10px] uppercase border-2 transition-all ${planType === 'PLAN NORMAL' ? 'bg-emerald-500 border-emerald-500 text-slate-900 shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                >
                  Normal (Ajover)
                </button>
                <button
                  onClick={() => setPlanType('PLAN R')}
                  className={`py-3 rounded-2xl font-black text-[9px] md:text-[10px] uppercase border-2 transition-all ${planType === 'PLAN R' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                >
                  R (Externo)
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleStartManual}
            disabled={isCreating}
            className="w-full py-4 md:py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-20 shrink-0"
          >
            {isCreating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.Play className="w-5 h-5" />}
            Iniciar Auditoría
          </button>
        </div>

        {/* PANEL DERECHA: CONTINUAR EXISTENTES */}
        <div className="bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl flex flex-col min-h-[400px] lg:min-h-0">
          <div className="flex justify-between items-center mb-6 md:mb-8 shrink-0">
            <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Continuar Pendientes</h3>
            <span className="px-3 py-1 bg-emerald-500 text-slate-950 rounded-lg text-[10px] font-black">{filteredDocs.length}</span>
          </div>

          <div className="relative mb-4 md:mb-6 shrink-0">
            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 w-4 h-4" />
            <input 
              type="text" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="BUSCAR POR ID O PLACA..."
              className="w-full pl-12 pr-4 py-3 md:py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold text-xs outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 md:space-y-4 pr-2">
            {filteredDocs.map(doc => (
              <div key={doc.id} className="bg-white/5 border border-white/10 rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group/card hover:bg-white/10 transition-all">
                <div className="p-4 md:p-6 flex items-center justify-between gap-3 md:gap-4">
                  <button
                    onClick={() => setSelectedDocForCount(doc)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-[10px] font-black text-emerald-500 uppercase mb-1">{doc.externalDocId}</p>
                    <p className="text-base md:text-lg font-black text-white uppercase tracking-tighter truncate">{doc.vehicleData || 'S/A'}</p>
                    <p className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase mt-1">
                      {doc.createdAt && !isNaN(new Date(doc.createdAt).getTime()) 
                        ? `HACE ${Math.round((Date.now() - new Date(doc.createdAt).getTime()) / 60000)} MINS`
                        : 'RECIÉN CREADO'}
                    </p>
                  </button>
                  <button 
                    onClick={() => setSelectedDocForCount(doc)}
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white hover:bg-emerald-500 transition-all shrink-0"
                  >
                    <Icons.ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                
                {/* BOTONES CARGA EXCEL PARA MANUALES (Plan Normal / Plan R) */}
                {String(doc.planType).toUpperCase().includes('MANUAL') && (
                  <div className="px-4 md:px-6 pb-4 md:pb-6 mt-[-10px] grid grid-cols-2 gap-2">
                    <label className="py-2.5 md:py-3 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 rounded-xl font-black text-[7px] md:text-[8px] uppercase tracking-tighter transition-all flex items-center justify-center gap-1 cursor-pointer shadow-lg group">
                      <Icons.Excel className="w-3 h-3 md:w-4 md:h-4 group-hover:scale-110 transition-transform" />
                      Plan Normal
                      <input 
                        type="file" 
                        accept=".xlsx,.xls" 
                        className="hidden" 
                        onChange={(e) => handleManualExcelUpload(e, doc, 'Plan Normal')} 
                      />
                    </label>
                    <label className="py-2.5 md:py-3 bg-blue-500/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 rounded-xl font-black text-[7px] md:text-[8px] uppercase tracking-tighter transition-all flex items-center justify-center gap-1 cursor-pointer shadow-lg group">
                      <Icons.Excel className="w-3 h-3 md:w-4 md:h-4 group-hover:scale-110 transition-transform" />
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
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-10 md:py-20">
                <Icons.Package className="w-16 h-16 md:w-20 md:h-20 text-white mb-4" />
                <p className="text-white font-black uppercase text-[10px] md:text-xs">No hay planes pendientes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecibidoManual;
