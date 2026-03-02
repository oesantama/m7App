import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DocumentL, User, DocStatus, MasterRecord, Article, DocumentLItem } from '../types';
import BlindCount from './BlindCount';
import PickingView from './PickingView';
import PickingHistory from './PickingHistory';
import NovedadesView from './NovedadesView';
import { hasPermission } from '../utils/permissions';
import * as XLSX from 'xlsx';

interface RecibidoMaterialProps {
  documents: DocumentL[];
  user: User;
  masterEstados: MasterRecord[];
  masterNotificaciones: MasterRecord[];
  masterTipoNotificacion: MasterRecord[];
  masterArticulo: MasterRecord[];
  onUpdateDocuments: (docs: DocumentL[]) => void;
  onAddArticleToMaster: (article: Article) => void;
  onAddNotificationToMaster: (notif: Partial<MasterRecord>) => void;
  onUpdateNotificationEmail?: (email: string) => void;
}

const RecibidoMaterial: React.FC<RecibidoMaterialProps> = ({
  documents, user, masterEstados, masterNotificaciones,
  masterTipoNotificacion,
  masterArticulo,
  onUpdateDocuments, onAddArticleToMaster, onAddNotificationToMaster, onUpdateNotificationEmail
}) => {
  const [selectedDocForCount, setSelectedDocForCount] = useState<DocumentL | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [manualEmail, setManualEmail] = useState('');
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [resendTarget, setResendTarget] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'recibo' | 'picking' | 'novedades' | 'historico'>('recibo');
  const [pickingSearch, setPickingSearch] = useState('');
  const [isSyncingPartial, setIsSyncingPartial] = useState(false);
  const [isSyncingFinal, setIsSyncingFinal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const pendingRecibo = useMemo(() =>
    documents.filter(d => d.status === DocStatus.PENDING || d.status === DocStatus.COUNTING),
    [documents]
  );

  const completedRecibo = useMemo(() =>
    documents.filter(d => d.status === DocStatus.INVENTORED),
    [documents]
  );

  const activeList = showHistory ? completedRecibo : pendingRecibo;

  const paginatedDocs = useMemo(() => {
    if (rowsPerPage === 'all') return activeList;
    const start = (currentPage - 1) * rowsPerPage;
    return activeList.slice(start, start + rowsPerPage);
  }, [activeList, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(activeList.length / rowsPerPage);

  const handleStartCount = (doc: DocumentL) => {
    api.updateDocumentStatus(doc.id, DocStatus.COUNTING, user.name);
    const updatedDocs = documents.map(d => d.id === doc.id ? { ...d, status: DocStatus.COUNTING, updatedBy: user.name, updatedAt: new Date().toISOString() } : d);
    onUpdateDocuments(updatedDocs);
    setSelectedDocForCount({ ...doc, status: DocStatus.COUNTING });
  };

  const handlePartialSave = (currentItems: DocumentLItem[], generalObs: string) => {
    if (!selectedDocForCount) return;

    setIsSyncingPartial(true);
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
        toast.info("Progreso guardado en el servidor.");
      }
    }).catch(err => {
      console.error('[M7-PARTIAL-SYNC] Error:', err);
      toast.error("Error al guardar progreso parcial.");
    }).finally(() => {
      setIsSyncingPartial(false);
    });
  };

  const handleFinishCount = (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => {
    if (!selectedDocForCount) return;

    if (updateEmail && onUpdateNotificationEmail) {
      onUpdateNotificationEmail(updateEmail);
    }

    setIsSyncingFinal(true);
    // Persistir en el servidor
    api.syncInventory({
      docId: selectedDocForCount.id,
      items: finalItems,
      user: user.name,
      notes: generalObs,
      isPartial: false,
      driverEmail: updateEmail
    }).then(res => {
      if (res.success) {
        toast.success("Inventario finalizado y sincronizado.");

        // SOLO SI HAY ÉXITO: Actualizar localmente y cerrar modal
        const updatedDocs = documents.map(d =>
          d.id === selectedDocForCount.id
            ? {
              ...d,
              items: finalItems,
              status: DocStatus.INVENTORED,
              inventoryDate: new Date().toISOString(),
              inventoryUser: user.name,
              inventoryNotes: generalObs, // Persistencia local de las notas
              updatedBy: user.name,
              updatedAt: new Date().toISOString()
            }
            : d
        );

        localStorage.removeItem(`m7_offline_count_${selectedDocForCount.id}`);
        onUpdateDocuments(updatedDocs);
        setSelectedDocForCount(null);
      } else {
        toast.error("Error al sincronizar: " + (res.error || "Desconocido"));
        // El modal permanece abierto para que el usuario NO pierda el trabajo
      }
    }).catch(err => {
      console.error('[M7-FINISH-SYNC] Error:', err);
      toast.error("Error al finalizar inventario.");
    }).finally(() => {
      setIsSyncingFinal(false);
    });
  };

  const handleResendClick = (doc: any) => {
    setResendTarget(doc);
    setManualEmail('');
    setShowResendDialog(true);
  };

  const handleManualExcelUpload = (e: React.ChangeEvent<HTMLInputElement>, doc: DocumentL) => {
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

        // Buscar cabecera (Lógica simplificada basada en GestionDocumentosL)
        let headerIdx = -1;
        const requiredTerms = ['articulo', 'item', 'codigo', 'sku', 'cantidad', 'qty', 'cant env'];
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
          const row = (rawData[i] || []).map(c => String(c || '').toLowerCase().trim());
          if (row.filter(cell => requiredTerms.some(t => cell.includes(t))).length >= 2) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          toast.error("No se detectó el formato correcto en el Excel.");
          return;
        }

        const headers = rawData[headerIdx].map(h => String(h || '').trim().toLowerCase());
        const findCol = (terms: string[]) => headers.findIndex(h => terms.some(t => h.includes(t)));

        const iArt = findCol(['articulo', 'item', 'codigo', 'sku']);
        const iCant = findCol(['cant env', 'cantidad', 'qty', 'cantidad esperada']);
        const iUnd = findCol(['um', 'und', 'unid', 'unidad']);
        const iFactura = findCol(['remision', 'factura', 'documento', 'invoice']);
        const iCiudad = findCol(['destino', 'ciudad', 'city']);
        const iDir = findCol(['dirección', 'direccion', 'address']);

        if (iArt === -1 || iCant === -1) {
          toast.error("Faltan columnas obligatorias (Articulo/SKU o Cantidad).");
          return;
        }

        const items: any[] = [];
        const consolidatedItems: any[] = [];

        rawData.slice(headerIdx + 1).forEach(row => {
          const sku = String(row[iArt] || '').trim();
          if (!sku) return;

          const qty = parseFloat(String(row[iCant] || '0').replace(/,/g, '.')) || 0;
          
          items.push({
            articleId: sku,
            expectedQty: qty,
            receivedQty: 0,
            unit: iUnd !== -1 ? String(row[iUnd]) : 'UND',
            invoice: iFactura !== -1 ? String(row[iFactura]) : '',
            city: iCiudad !== -1 ? String(row[iCiudad]) : '',
            address: iDir !== -1 ? String(row[iDir]) : ''
          });

          consolidatedItems.push({
            articleId: sku,
            expectedQty: qty,
            count1: 0,
            count2: 0
          });
        });

        if (items.length === 0) {
          toast.error("No se encontraron datos válidos en el archivo.");
          return;
        }

        // Sincronizar con Backend usando bulkCreateDocuments
        // El backend hará upsert sobre el documento manual existente
        const payload = {
          documents: [{
            ...doc,
            items,
            consolidatedItems,
            planType: 'MANUAL', // Aseguramos que se mantenga como manual
            status: doc.status,
            updatedBy: user.name
          }]
        };

        api.bulkCreateDocuments(payload).then(res => {
          if (res.success) {
            toast.success(`Referencia cargada: ${items.length} ítems configurados.`);
            // Actualizar localmente
            const updatedDocs = documents.map(d => 
              d.id === doc.id ? { ...d, items, consolidatedItems } : d
            );
            onUpdateDocuments(updatedDocs);
          } else {
            toast.error("Error al sincronizar: " + res.error);
          }
        }).catch(err => {
          console.error(err);
          toast.error("Error de conexión al cargar referencia.");
        });

      } catch (err) {
        console.error(err);
        toast.error("Error al leer el archivo Excel.");
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmResend = () => {
    if (!resendTarget || !manualEmail) return;

    api.resendInventoryNotification(resendTarget.id, manualEmail)
      .then(res => {
        if (res.success) {
          toast.success('Correo reenviado correctamente');
          setShowResendDialog(false);
          setResendTarget(null);
        } else {
          toast.error('Error: ' + res.error);
        }
      }).catch(err => {
        console.error(err);
        toast.error('Error al reenviar correo');
      });
  };



  return (
    <div className="animate-in fade-in duration-700 h-full flex flex-col overflow-hidden max-h-screen">
      {selectedDocForCount ? (
        <div className="w-full h-full flex flex-col overflow-hidden flex-1">
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
            onAddNotificationToMaster={onAddNotificationToMaster}
          />
        </div>
      ) : (
        <div className="bg-white overflow-hidden h-full flex flex-col">
          {/* TABS DE NAVEGACIÓN */}
          <div className="flex bg-slate-100/50 p-2 shrink-0 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('recibo')}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'recibo' ? 'bg-white text-slate-900 shadow-xl shadow-slate-200 border-2 border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icons.Package className="w-4 h-4" />
              Recibo / Auditoría
            </button>
            <button 
              onClick={() => setActiveTab('picking')}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'picking' ? 'bg-white text-slate-900 shadow-xl shadow-slate-200 border-2 border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icons.Audit className="w-4 h-4" />
              Alistado / Picking
            </button>
            <button 
              onClick={() => setActiveTab('novedades')}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'novedades' ? 'bg-white text-slate-900 shadow-xl shadow-slate-200 border-2 border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icons.Alert className="w-4 h-4" />
              Novedades
            </button>
            <button 
              onClick={() => setActiveTab('historico')}
              className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'historico' ? 'bg-white text-slate-900 shadow-xl shadow-slate-200 border-2 border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icons.History className="w-4 h-4" />
              Historial de Picking
            </button>
          </div>

          {activeTab === 'recibo' ? (
            <>
              {/* SUBHEADER DE CONTROL (RECIBO) */}
              <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center shrink-0 px-8">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{showHistory ? 'Historial de Auditoría' : 'Planes en Espera'}</h3>
                  <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-md ${showHistory ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-slate-950'}`}>
                    {activeList.length} {showHistory ? 'FINALIZADOS' : 'ACTIVOS'}
                  </span>
                  
                  {/* TOGGLE HISTORIAL */}
                  <button 
                    onClick={() => { setShowHistory(!showHistory); setCurrentPage(1); }}
                    className={`ml-4 flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border-2 ${showHistory ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-500 hover:text-blue-500'}`}
                  >
                    <Icons.History className="w-3 h-3" />
                    {showHistory ? 'Ver Pendientes' : 'Ver Historial'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Filas:</label>
                  <select value={rowsPerPage} onChange={e => { setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1); }} className="p-2 bg-white border-2 border-slate-100 rounded-lg text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-sm cursor-pointer">
                    <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value="all">Todas</option>
                  </select>
                </div>
              </div>

              <div className="p-4 md:p-8 flex-1 overflow-y-auto custom-scrollbar bg-slate-50/5">
                {/* ... (Contenido de Recibo existente) ... */}
            <div className="w-full max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
              {paginatedDocs.map(doc => (
                <div key={doc.id} className="flex flex-col p-6 bg-white border-2 border-slate-50 rounded-[2.5rem] hover:border-emerald-500 transition-all group shadow-md hover:shadow-xl relative overflow-hidden">
                  <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${doc.status === DocStatus.COUNTING ? 'bg-blue-500' : doc.status === DocStatus.INVENTORED ? 'bg-slate-400' : 'bg-amber-400'}`}></div>

                  <div className="flex justify-between items-start mb-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${doc.status === DocStatus.COUNTING ? 'bg-blue-900 text-blue-400 animate-pulse' : 'bg-slate-900 text-emerald-500'}`}>
                      <Icons.Package />
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase border tracking-widest ${doc.status === DocStatus.COUNTING ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {doc.status}
                      </span>
                      <p className="text-[9px] text-slate-400 font-black uppercase mt-2 tracking-widest">{new Date(doc.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Documento L</p>
                      <h4 className="font-black text-slate-900 uppercase text-xl tracking-tighter truncate">{doc.externalDocId}</h4>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase">Vehículo / Placa:</span>
                        <span className="text-[10px] font-black text-slate-900 uppercase">{doc.vehicleData || 'S/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase">Items:</span>
                        <span className="text-[10px] font-black text-emerald-600 uppercase">{doc.items.length} REF</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-50">
                    <button 
                      onClick={() => handleStartCount(doc)} 
                      disabled={doc.status === DocStatus.INVENTORED || !hasPermission(user, 'RECIBIDO_MATERIAL', 'create')}
                      className={`w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-3 ${(doc.status === DocStatus.INVENTORED || !hasPermission(user, 'RECIBIDO_MATERIAL', 'create')) ? 'opacity-20 cursor-not-allowed hidden' : 'hover:bg-emerald-600 active:scale-95'}`}
                    >
                      {doc.status === DocStatus.COUNTING ? <Icons.Audit /> : <Icons.Signature />}
                      {doc.status === DocStatus.INVENTORED ? 'INVENTARIADO' : (doc.status === DocStatus.COUNTING ? 'CONTINUAR' : 'AUDITAR')}
                    </button>

                    {/* BOTÓN CARGA EXCEL PARA MANUALES */}
                    {doc.planType === 'MANUAL' && (
                      <label className="mt-2 w-full py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 hover:bg-emerald-600 hover:text-white cursor-pointer active:scale-95">
                        <Icons.Excel className="w-4 h-4" />
                        Cargar Referencia Excel
                        <input 
                          type="file" 
                          accept=".xlsx,.xls" 
                          className="hidden" 
                          onChange={(e) => handleManualExcelUpload(e, doc)} 
                        />
                      </label>
                    )}

                    {(!hasPermission(user, 'RECIBIDO_MATERIAL', 'create') && doc.status !== DocStatus.INVENTORED) && (
                       <div className="w-full py-4 items-center justify-center text-center">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest"><Icons.Shield className="w-3 h-3 inline mr-1" /> MODO LECTURA</span>
                       </div>
                    )}
                    {doc.status === DocStatus.INVENTORED && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResendClick(doc); }}
                        className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 mt-2"
                      >
                        <Icons.Send className="w-4 h-4" /> REENVIAR
                      </button>
                    )}
                  </div>
                </div>
              ))}
               {activeList.length === 0 && (
                <div className="col-span-full py-32 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 border-4 border-dashed border-slate-100"><Icons.Check /></div>
                  <h4 className="text-xl font-black text-slate-200 uppercase tracking-[0.4em] animate-pulse">
                    {showHistory ? 'Historial vacío' : 'Operación al día'}
                  </h4>
                </div>
              )}
            </div>
          </div>

            {/* PAGINACIÓN INFERIOR (RECIBO) */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center items-center gap-8 shrink-0">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight className="rotate-180" /></button>
              <span className="text-[11px] font-black uppercase text-slate-900 tracking-widest">Página {currentPage} de {totalPages || 1}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 transition-all shadow-sm"><Icons.ChevronRight /></button>
            </div>
          </>
        ) : activeTab === 'picking' ? (
          <div className="p-8 flex-1 overflow-hidden flex flex-col">
            <PickingView user={user} documents={documents} />
          </div>
        ) : activeTab === 'novedades' ? (
          <div className="p-8 flex-1 overflow-hidden flex flex-col h-full">
            <NovedadesView 
              documents={documents} 
              user={user} 
              masterArticulo={masterArticulo} 
              masterNotificaciones={masterNotificaciones} 
            />
          </div>
        ) : (
          <div className="p-8 flex-1 overflow-hidden flex flex-col">
            <PickingHistory />
          </div>
        )}
      </div>
    )}
      {/* DIÁLOGO REENVÍO */}
      {showResendDialog && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 text-center space-y-8 shadow-2xl border border-white/5">
            <div className="w-16 h-16 bg-blue-500 text-white rounded-[1.5rem] mx-auto flex items-center justify-center shadow-xl mb-4"><Icons.Send className="w-8 h-8" /></div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Reenviar Informe</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ingrese el correo de destino para reenviar las novedades.</p>
            </div>
            <input
              type="email"
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              placeholder="CORREO@DESTINO.COM"
              className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] font-black text-center text-xs outline-none focus:border-blue-500 transition-all shadow-inner"
            />
            <div className="flex flex-col gap-4">
              <button
                onClick={confirmResend}
                disabled={!manualEmail.includes('@')}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-blue-600 shadow-2xl transition-all disabled:opacity-20 active:scale-95"
              >
                Enviar Ahora
              </button>
              <button onClick={() => setShowResendDialog(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecibidoMaterial;
