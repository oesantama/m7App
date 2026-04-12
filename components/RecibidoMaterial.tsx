import React, { useState, useMemo, useEffect } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DocumentL, User, DocStatus, MasterRecord, Article, DocumentLItem, getStatusLabel } from '../types';
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

  // Bloquear pull-to-refresh y overscroll del navegador móvil mientras el conteo está activo.
  // Sin esto, al deslizar hacia arriba en el celular durante el escaneo se recarga la página
  // y se pierde el conteo en curso.
  useEffect(() => {
    if (!selectedDocForCount) return;

    const originalOverscroll = document.body.style.overscrollBehavior;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'pan-x pan-y'; // permite scroll pero bloquea pull-to-refresh

    // Prevenir el gesto de refresh en Chrome Android (touchstart en top 10px)
    const blockPullToRefresh = (e: TouchEvent) => {
      if (window.scrollY === 0 && e.touches[0].clientY > 0) {
        // Si el usuario hace scroll hacia abajo desde el tope, lo bloqueamos
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', blockPullToRefresh, { passive: false });

    return () => {
      document.body.style.overscrollBehavior = originalOverscroll;
      document.body.style.touchAction = originalTouchAction;
      document.removeEventListener('touchstart', blockPullToRefresh);
    };
  }, [selectedDocForCount]);
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
  const [searchRecibo, setSearchRecibo] = useState('');

  // Cambio Rápido de Documento
  const [docToChangeStatus, setDocToChangeStatus] = useState<DocumentL | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const isPendingOrCounting = (s: string) =>
    s === DocStatus.PENDING || s === DocStatus.COUNTING ||
    s === 'PENDIENTE' || s === 'EN CONTEO';

  const isInventored = (s: string) =>
    s === DocStatus.INVENTORED || s === 'INVENTARIADO';

  const pendingRecibo = useMemo(() =>
    documents.filter(d => isPendingOrCounting(d.status || '')),
    [documents]
  );

  const completedRecibo = useMemo(() =>
    documents.filter(d => isInventored(d.status || '')),
    [documents]
  );

  const activeList = showHistory ? completedRecibo : pendingRecibo;

  const filteredList = useMemo(() => {
    if (!searchRecibo.trim()) return activeList;
    const term = searchRecibo.toLowerCase();
    return activeList.filter(d =>
      (d.externalDocId || '').toLowerCase().includes(term) ||
      (d.vehicleData || '').toLowerCase().includes(term) ||
      (d.inventoryUser || '').toLowerCase().includes(term) ||
      (d.planType || '').toLowerCase().includes(term)
    );
  }, [activeList, searchRecibo]);

  const paginatedDocs = useMemo(() => {
    if (rowsPerPage === 'all') return filteredList;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredList.slice(start, start + rowsPerPage);
  }, [filteredList, currentPage, rowsPerPage]);

  // Métricas por documento (volume total, progreso, novedades)
  const getDocMetrics = (doc: DocumentL) => {
    const items = doc.items || [];
    const totalItems = items.length;
    const countedItems = items.filter(i => i.countedQty > 0 || i.status === 'Matches' || i.status === 'OK').length;
    const novedades = items.filter(i => i.status === 'Mismatch' || i.status === 'Novedad' || i.novedad).length;
    const totalVol = items.reduce((acc, i) => acc + (parseFloat(String(i.volume || '0')) || 0), 0);
    const progress = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;
    return { totalItems, countedItems, novedades, totalVol, progress };
  };

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(filteredList.length / rowsPerPage);

  const handleStartCount = async (doc: DocumentL) => {
    try {
      await api.updateDocumentStatus(doc.id, DocStatus.COUNTING, user.name);
    } catch {
      // Estado local se actualiza igual; el fallo de red se reintentará en el siguiente sync
    }
    onUpdateDocuments(documents.map(d =>
      d.id === doc.id ? { ...d, status: DocStatus.COUNTING, updatedBy: user.name, updatedAt: new Date().toISOString() } : d
    ));
    setSelectedDocForCount({ ...doc, status: DocStatus.COUNTING });
  };

  const handlePartialSave = async (currentItems: DocumentLItem[], generalObs: string) => {
    if (!selectedDocForCount) return;
    setIsSyncingPartial(true);
    try {
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
        toast.info("Progreso guardado en el servidor.");
      }
    } catch (err: any) {
      toast.error("Error al guardar progreso parcial.");
      if (import.meta.env.DEV) console.error('[M7-PARTIAL-SYNC]', err);
    } finally {
      setIsSyncingPartial(false);
    }
  };

  const handleFinishCount = async (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => {
    if (!selectedDocForCount) return;
    if (updateEmail && onUpdateNotificationEmail) onUpdateNotificationEmail(updateEmail);

    setIsSyncingFinal(true);
    try {
      const res = await api.syncInventory({
        docId: selectedDocForCount.id,
        items: finalItems,
        user: user.name,
        notes: generalObs,
        isPartial: false,
        driverEmail: updateEmail
      });
      if (res.success) {
        toast.success("Inventario finalizado y sincronizado.");
        localStorage.removeItem(`m7_offline_count_${selectedDocForCount.id}`);
        onUpdateDocuments(documents.map(d =>
          d.id === selectedDocForCount.id
            ? { ...d, items: finalItems, status: DocStatus.INVENTORED, inventoryDate: new Date().toISOString(), inventoryUser: user.name, inventoryNotes: generalObs, updatedBy: user.name, updatedAt: new Date().toISOString() }
            : d
        ));
        setSelectedDocForCount(null);
      } else {
        toast.error("Error al sincronizar: " + (res.error || "Desconocido"));
      }
    } catch (err: any) {
      toast.error("Error al finalizar inventario.");
      if (import.meta.env.DEV) console.error('[M7-FINISH-SYNC]', err);
    } finally {
      setIsSyncingFinal(false);
    }
  };

  const handleResendClick = (doc: any) => {
    setResendTarget(doc);
    setManualEmail('');
    setShowResendDialog(true);
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

        const items: any[] = [];
        const consolidatedItems: any[] = [];

        rawData.slice(headerRowIndex + 1).forEach(row => {
          const sku = String(row[iArt] || '').trim();
          if (!sku) return;

          const qty = parseNumberM7(String(row[iCant] || '0'), isPlanR);
          let volVal = parseNumberM7(String(row[iVol] || '0'), isPlanR);
          
          // Corrección de unidades de volumen
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
          });

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

  const handleUpdateStatus = () => {
    if (!docToChangeStatus || !selectedStatus) return;
    setIsUpdatingStatus(true);
    api.updateDocumentStatus(docToChangeStatus.id, selectedStatus, user.name)
      .then(res => {
        if (res.success) {
          const updatedDocs = documents.map(d => d.id === docToChangeStatus.id ? { ...d, status: selectedStatus as DocStatus, updatedAt: new Date().toISOString() } : d);
          onUpdateDocuments(updatedDocs);
          toast.success(`Estado actualizado a ${selectedStatus}`);
          setDocToChangeStatus(null);
        } else {
          toast.error('Error al actualizar: ' + (res.error || "Desconocido"));
        }
      }).catch(err => {
        if (import.meta.env.DEV) console.error('[M7-STATUS]', err);
        toast.error('Error de red al actualizar estado');
      }).finally(() => {
        setIsUpdatingStatus(false);
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
            allowExtraItems={true}
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
              <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">{showHistory ? 'Historial de Auditoría' : 'Planes en Espera'}</h3>
                    <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase shadow-sm ${showHistory ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-slate-950'}`}>
                      {filteredList.length}{searchRecibo ? ` / ${activeList.length}` : ''} {showHistory ? 'FINALIZADOS' : 'ACTIVOS'}
                    </span>
                    <button
                      onClick={() => { setShowHistory(!showHistory); setCurrentPage(1); setSearchRecibo(''); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all border-2 ${showHistory ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-500 hover:text-blue-500'}`}
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
                {/* BÚSQUEDA */}
                <div className="relative">
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchRecibo}
                    onChange={e => { setSearchRecibo(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar por Doc L, placa, operador..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 transition-all shadow-sm"
                  />
                  {searchRecibo && (
                    <button onClick={() => setSearchRecibo('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                      <Icons.X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 md:p-8 flex-1 overflow-y-auto custom-scrollbar bg-slate-50/5">
                {/* ... (Contenido de Recibo existente) ... */}
            <div className="w-full max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
              {paginatedDocs.map(doc => {
                const metrics = getDocMetrics(doc);
                const isCountingStatus = doc.status === DocStatus.COUNTING || doc.status === 'EN CONTEO';
                const isInventoredStatus = doc.status === DocStatus.INVENTORED || doc.status === 'INVENTARIADO';
                const isPending = doc.status === DocStatus.PENDING || doc.status === 'PENDIENTE';
                const isManual = String(doc.planType || '').toUpperCase().includes('MANUAL');
                const planLabel = isManual ? 'MANUAL' : (String(doc.planType || '').toUpperCase().includes('PLAN R') ? 'PLAN R' : 'PLAN NORMAL');

                const docDate = doc.inventoryDate && !isNaN(new Date(doc.inventoryDate).getTime())
                  ? new Date(doc.inventoryDate)
                  : (doc.createdAt || (doc as any).created_at)
                    ? new Date(doc.createdAt || (doc as any).created_at)
                    : null;

                return (
                  <div key={doc.id} className="flex flex-col bg-white border-2 border-slate-100 rounded-[2rem] hover:border-emerald-400 transition-all group shadow-md hover:shadow-xl relative overflow-hidden">
                    {/* BARRA DE ESTADO LATERAL */}
                    <div className={`absolute top-0 left-0 bottom-0 w-1.5 rounded-l-[2rem] ${isCountingStatus ? 'bg-blue-500' : isInventoredStatus ? 'bg-emerald-500' : 'bg-amber-400'}`} />

                    {/* HEADER */}
                    <div className="p-5 pb-3 pl-6">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ${isCountingStatus ? 'bg-blue-900 text-blue-400 animate-pulse' : isInventoredStatus ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-900 text-emerald-400'}`}>
                            <Icons.Package className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Doc L</p>
                            <h4 className="font-black text-slate-900 uppercase text-base tracking-tight truncate leading-tight">{doc.externalDocId}</h4>
                          </div>
                        </div>
                        {/* BADGES */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${isCountingStatus ? 'bg-blue-50 text-blue-600 border border-blue-100' : isInventoredStatus ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                            {getStatusLabel(doc.status || '')}
                          </span>
                          <span className={`px-2.5 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest ${isManual ? 'bg-slate-900 text-emerald-400 border border-emerald-500/20' : planLabel === 'PLAN R' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                            {planLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* BARRA DE PROGRESO (solo si tiene items y no está inventoriado) */}
                    {metrics.totalItems > 0 && (
                      <div className="px-6 pb-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Progreso conteo</span>
                          <span className="text-[8px] font-black text-slate-700">{metrics.countedItems}/{metrics.totalItems} ref · {metrics.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${metrics.progress === 100 ? 'bg-emerald-500' : metrics.progress > 50 ? 'bg-blue-500' : 'bg-amber-400'}`}
                            style={{ width: `${metrics.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* DATOS PRINCIPALES */}
                    <div className="px-6 py-3 space-y-2">
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Vehículo</p>
                          <p className="text-[10px] font-black text-slate-900 uppercase truncate">{doc.vehicleData || 'S/A'}</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Ítems</p>
                          <p className="text-[10px] font-black text-emerald-600">{metrics.totalItems} REF</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Volumen</p>
                          <p className="text-[10px] font-black text-indigo-600">{metrics.totalVol.toFixed(3)} m³</p>
                        </div>
                        <div>
                          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Novedades</p>
                          <p className={`text-[10px] font-black ${metrics.novedades > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            {metrics.novedades > 0 ? `⚠ ${metrics.novedades} nov.` : '✓ Sin novedad'}
                          </p>
                        </div>
                        {doc.inventoryUser && (
                          <div className="col-span-2">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Operador</p>
                            <p className="text-[10px] font-black text-slate-700 uppercase truncate">{doc.inventoryUser}</p>
                          </div>
                        )}
                        {(doc.inventoryNotes || doc.inventory_observation) && (
                          <div className="col-span-2">
                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Observación</p>
                            <p className="text-[9px] text-slate-600 font-semibold leading-snug line-clamp-2 italic">
                              "{(doc.inventoryNotes || doc.inventory_observation || '').substring(0, 80)}"
                            </p>
                          </div>
                        )}
                      </div>

                      {/* FECHA */}
                      <div className="flex items-center justify-between">
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">
                          {isInventoredStatus ? 'Inventariado:' : 'Recibido:'}
                        </p>
                        <p className="text-[8px] font-black text-slate-600">
                          {docDate ? `${docDate.toLocaleDateString('es-CO')} ${docDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'SIN FECHA'}
                        </p>
                      </div>
                    </div>

                    {/* ACCIONES */}
                    <div className="px-6 pb-5 pt-2 mt-auto space-y-2 border-t border-slate-50">
                      {isPending && hasPermission(user, 'RECIBIDO_MATERIAL', 'create') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDocToChangeStatus(doc); setSelectedStatus(doc.status || ''); }}
                          className="w-full py-2 flex items-center justify-center gap-2 bg-white text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-sm"
                        >
                          <Icons.RefreshCw className="w-3 h-3" /> Cambiar Estado
                        </button>
                      )}

                      <button
                        onClick={() => handleStartCount(doc)}
                        disabled={isInventoredStatus || !hasPermission(user, 'RECIBIDO_MATERIAL', 'create')}
                        className={`w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${isInventoredStatus || !hasPermission(user, 'RECIBIDO_MATERIAL', 'create') ? 'hidden' : isCountingStatus ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95' : 'bg-slate-900 text-white hover:bg-emerald-600 active:scale-95'}`}
                      >
                        {isCountingStatus ? <Icons.Audit className="w-4 h-4" /> : <Icons.Signature className="w-4 h-4" />}
                        {isCountingStatus ? 'Continuar Conteo' : 'Iniciar Auditoría'}
                      </button>

                      {/* CARGA EXCEL PARA MANUALES */}
                      {isManual && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-black text-[8px] uppercase tracking-tight flex items-center justify-center gap-1.5 hover:bg-emerald-600 hover:text-white cursor-pointer active:scale-95 group transition-all">
                            <Icons.Excel className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            Plan Normal
                            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleManualExcelUpload(e, doc, 'Plan Normal')} />
                          </label>
                          <label className="py-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-black text-[8px] uppercase tracking-tight flex items-center justify-center gap-1.5 hover:bg-blue-600 hover:text-white cursor-pointer active:scale-95 group transition-all">
                            <Icons.Excel className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            Plan R
                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleManualExcelUpload(e, doc, 'Plan R')} />
                          </label>
                        </div>
                      )}

                      {!hasPermission(user, 'RECIBIDO_MATERIAL', 'create') && !isInventoredStatus && (
                        <div className="py-3 text-center">
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                            <Icons.Shield className="w-3 h-3 inline mr-1" /> MODO LECTURA
                          </span>
                        </div>
                      )}

                      {isInventoredStatus && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResendClick(doc); }}
                          className="w-full py-3 bg-slate-50 text-slate-500 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-center gap-2 border border-slate-100"
                        >
                          <Icons.Send className="w-3.5 h-3.5" /> Reenviar Notificación
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center items-center gap-6 shrink-0">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 transition-all shadow-sm">
                  <Icons.ChevronRight className="rotate-180 w-4 h-4" />
                </button>
                <span className="text-[10px] font-black uppercase text-slate-700 tracking-widest">
                  Pág {currentPage} / {totalPages} &nbsp;·&nbsp; {filteredList.length} docs
                </span>
                <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 disabled:opacity-20 hover:text-emerald-500 transition-all shadow-sm">
                  <Icons.ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
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
              onRefresh={async () => {
                try {
                  const res = await api.getDocuments();
                  onUpdateDocuments(res);
                } catch (e) {
                  if (import.meta.env.DEV) console.error('[M7-REFRESH]', e);
                }
              }}
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
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 text-center space-y-6 shadow-2xl">
            <div className="w-14 h-14 bg-blue-500 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg">
              <Icons.Send className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Reenviar Notificación</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Doc: {resendTarget?.externalDocId || '—'}
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3 text-left">
              <Icons.Alert className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[9px] text-blue-700 font-bold leading-relaxed">
                Se enviará el resumen del inventario al correo indicado. Verifique que la dirección sea correcta antes de continuar.
              </p>
            </div>

            <input
              type="email"
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              placeholder="correo@destino.com"
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-center text-sm outline-none focus:border-blue-500 transition-all"
            />
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmResend}
                disabled={!manualEmail.includes('@')}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 shadow-lg transition-all disabled:opacity-30 active:scale-95 flex items-center justify-center gap-2"
              >
                <Icons.Send className="w-4 h-4" /> Enviar Ahora
              </button>
              <button onClick={() => setShowResendDialog(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-700 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO CAMBIO ESTADO */}
      {docToChangeStatus && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-12 text-center space-y-8 shadow-2xl border border-white/5">
             <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-[1.5rem] mx-auto flex items-center justify-center shadow-inner mb-4">
                <Icons.RefreshCw className="w-8 h-8" />
             </div>
             
             <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Cambiar Estado</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Doc L: {docToChangeStatus.externalDocId}</p>
             </div>

             <div className="text-left space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Seleccione Nuevo Estado:</label>
                <select 
                   value={selectedStatus}
                   onChange={e => setSelectedStatus(e.target.value)}
                   className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-black text-xs uppercase outline-none focus:border-blue-500 transition-all text-slate-900"
                >
                   {masterEstados.map(est => (
                      <option key={est.id} value={est.name}>{est.name}</option>
                   ))}
                </select>
             </div>

             <div className="flex flex-col gap-4">
                <button
                  onClick={handleUpdateStatus}
                  disabled={isUpdatingStatus || !selectedStatus || selectedStatus === docToChangeStatus.status}
                  className="w-full py-4 bg-blue-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-blue-500 shadow-xl transition-all disabled:opacity-20 active:scale-95 flex items-center justify-center gap-2"
                >
                  {isUpdatingStatus ? <Icons.RefreshCw className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />} Actualizar
                </button>
                <button onClick={() => setDocToChangeStatus(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Cancelar</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecibidoMaterial;
