import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { Article, DocumentL, DocumentLItem, MasterRecord, DocStatus, User } from '../types';
import { cleanSkuM7 } from '../utils/scanner';

interface BlindCountProps {
  document: DocumentL;
  user: User;
  masterNotificaciones: MasterRecord[];
  masterTipoNotificacion: MasterRecord[];
  masterArticulo: MasterRecord[];
  onConfirm: (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => void;
  onPartialSave: (currentItems: DocumentLItem[], generalObs: string) => void;
  onCancel: () => void;
  onAddArticleToMaster: (article: Article) => void;
  onAddNotificationToMaster: (notif: Partial<MasterRecord>) => void;
  allowExtraItems?: boolean;
}

const BlindCount: React.FC<BlindCountProps> = ({
  document: docL,
  user,
  masterNotificaciones,
  masterTipoNotificacion,
  masterArticulo,
  onConfirm,
  onPartialSave,
  onCancel,
  onAddArticleToMaster,
  onAddNotificationToMaster,
  allowExtraItems = false
}) => {
  const [scanInput, setScanInput] = useState('');
  const [extraItems, setExtraItems] = useState<DocumentLItem[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  // ESTADOS DE INVENTARIO M7
  const [counts, setCounts] = useState<{ [articleId: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    docL.items.forEach(it => {
      // Priorizar countedQty del servidor (Cloud)
      if ((it.countedQty || 0) > 0) initial[it.articleId] = it.countedQty;
    });
    return initial;
  });

  const [count1Data, setCount1Data] = useState<{ [articleId: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    docL.items.forEach(it => {
      if (it.count1 > 0) initial[it.articleId] = it.count1;
    });
    return initial;
  });

  const [itemObservations, setItemObservations] = useState<{ [articleId: string]: string }>(() => {
    const initial: { [id: string]: string } = {};
    docL.items.forEach(it => {
      // M7-FIX: Solo cargar si es una nota REAL de inventario, no instrucciones de entrega
      // Las instrucciones de entrega vienen en 'notes', no en 'inventoryNote'
      if (it.inventoryNote && it.inventoryNote !== it.notes) {
        initial[it.articleId] = it.inventoryNote;
      }
    });
    return initial;
  });

  const [inventoryObservation, setInventoryObservation] = useState(docL.inventoryNotes || '');
  
  // M7-MOD: Estado de Incidencias (Tabla 2)
  const [incidents, setIncidents] = useState<{ 
    id: string; 
    code: string; 
    note: string; 
    timestamp: string; 
    status: 'pending' | 'resolved';
    suggestion?: string;
  }[]>(() => {
    const saved = localStorage.getItem(`m7_incidents_${docL.id}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const processingTimer = useRef<NodeJS.Timeout | null>(null);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [validationAttempts, setValidationAttempts] = useState(0);
  const [lastScan, setLastScan] = useState<{ article: Article | null, message: string, status: 'success' | 'error' | 'new' } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(20);
  const [currentPage, setCurrentPage] = useState(1);
  /* ESTADO UNIFICADO DE TRANSACCIÓN */
  const [unitTransaction, setUnitTransaction] = useState<{
    type: 'CONVERT' | 'REVERSE';
    articleId: string;
    currentQty: number;
    qtyToProcess: number; // Nueva: cantidad parcial
    options: {
      id: string;
      label: string;
      sourceUnit: string;
      targetUnit: string;
      factor: number;
      operation: 'multiply' | 'divide';
      resultQty: number;
    }[];
    selectedOption?: {
      id: string;
      label: string;
      sourceUnit: string;
      targetUnit: string;
      factor: number;
      operation: 'multiply' | 'divide';
      resultQty: number;
    };
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoaded = useRef(false);
  const ignoreScan = useRef(false); // Ref para ignorar basura del scanner

  // AGRUPACIÓN DE ITEMS POR SKU (VISTA GENERAL)
  const groupedItems = useMemo(() => {
    const groups: { [id: string]: DocumentLItem } = {};
    const allItems = [...docL.items, ...extraItems];
    
    allItems.forEach(item => {
      // Normalización: Usar SKU si existe, sino articleId
      const id = (item.sku || item.articleId || '').trim().toUpperCase();
      if (!id) return;

      if (!groups[id]) {
        // M7-FIX: Limpiar nombre para evitar prefijos redundantes en la vista
        let cleanName = (item as any).articleName || '';
        if (cleanName.startsWith('SINCRO M7: ')) {
          cleanName = cleanName.replace('SINCRO M7: ', '');
        }

        groups[id] = { 
          ...item, 
          articleId: id, 
          ['articleName' as any]: cleanName,
          expectedQty: item.expectedQty || 0,
          ['isExtra' as any]: extraItems.some(ex => ex.articleId === item.articleId)
        } as DocumentLItem;
      } else {
        groups[id].expectedQty += (item.expectedQty || 0);
      }
    });
    return Object.values(groups);
  }, [docL.items, extraItems]);

  // AUTO-SAVE CLOUD M7 (Protección de Datos en Tiempo Real)
  useEffect(() => {
    // Evitar disparo inicial vacío
    if (!isLoaded.current) {
      isLoaded.current = true;
      return;
    }

    localStorage.setItem(`m7_offline_count_${docL.id}`, JSON.stringify(counts));
    localStorage.setItem(`m7_incidents_${docL.id}`, JSON.stringify(incidents));

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    setSyncStatus('syncing');
    autoSaveTimer.current = setTimeout(() => {
      const finalItems: DocumentLItem[] = groupedItems.map(it => ({
        ...it,
        countedQty: counts[it.articleId] || 0,
        count1: count1Data[it.articleId] || 0,
        count2: counts[it.articleId] || 0,
        inventoryNote: itemObservations[it.articleId] || '',
      }));

      onPartialSave(finalItems, inventoryObservation);
      setSyncStatus('synced');
      setLastSyncTime(new Date());
    }, 2000); // 2 segundos de debounce

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [counts, itemObservations, inventoryObservation, groupedItems, incidents]);

  const processBarcode = (rawCode: string) => {
    const input = cleanSkuM7(rawCode);
    if (!input || input.length < 3) return;

    // 1. Buscar en el plan (Match Directo - TABLA 1)
    const itemInDoc = groupedItems.find(it => 
      (it.articleId?.toUpperCase() === input) || 
      (it.sku?.toUpperCase() === input)
    );

    if (itemInDoc) {
        const targetId = itemInDoc.articleId;
        const newCount = (counts[targetId] || 0) + 1;
        setCounts(prev => ({ ...prev, [targetId]: newCount }));
        setLastScan({ 
          article: (masterArticulo as Article[]).find(a => a.id === targetId || a.sku === targetId) || null, 
          message: `Confirmado: ${targetId} [x${newCount}]`, 
          status: 'success' 
        });
        setScanInput('');
        return;
    }

    // 2. Si no está en plan, buscar sugerencia inteligente (Ráfagas incompletas)
    const possibleBetterMatch = groupedItems.find(it => 
      it.articleId?.toUpperCase().startsWith(input) || 
      it.sku?.toUpperCase().startsWith(input)
    );

    const suggestion = possibleBetterMatch 
        ? `¿Quiso decir ${possibleBetterMatch.articleId}? (Lectura incompleta detectada)`
        : `Artículo fuera de plan o código desconocido.`;

    // 3. Registrar en TABLA 2 (Incidencias)
    const newIncident = {
      id: `inc-${Date.now()}`,
      code: input,
      note: suggestion,
      timestamp: new Date().toLocaleTimeString(),
      status: 'pending' as const,
      suggestion: possibleBetterMatch?.articleId
    };

    setIncidents(prev => [newIncident, ...prev]);
    setLastScan({ 
      article: null, 
      message: `Incidencia registrada: ${input}`, 
      status: 'error' 
    });
    setScanInput('');
  };

  // Manejo inteligente del input para ignorar basura post-Ñ
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();

    if (processingTimer.current) {
      clearTimeout(processingTimer.current);
      processingTimer.current = null;
    }

    if (ignoreScan.current) {
      setScanInput('');
      return;
    }

    // M7 REVOLUTION V9: Integridad Total
    // Solo disparamos el match automático si vemos un indicio de "basura de hardware"
    const scannerGarbageRegex = /(:|Ñ|S4:)/i;
    const match = val.match(scannerGarbageRegex);

    if (match) {
      setScanInput(val);

      // Esperamos 80ms para recibir la ráfaga completa
      processingTimer.current = setTimeout(() => {
          const cleanedInput = cleanSkuM7(val);
          
          if (cleanedInput.length >= 3) {
            // PROCESAMIENTO ÚNICO: Pasamos a processBarcode que decidirá si va a Tabla 1 o Tabla 2
            processBarcode(cleanedInput);
            
            // Bloqueo temporal para ignorar el resto de la ráfaga de basura
            ignoreScan.current = true;
            setTimeout(() => {
              ignoreScan.current = false;
              setScanInput('');
            }, 400);
          }
          processingTimer.current = null;
      }, 80); 

    } else {
      setScanInput(val);
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    processBarcode(scanInput);
  };

  const handleSubtract = (articleId: string) => {
    setCounts(prev => ({
      ...prev,
      [articleId]: Math.max(0, (prev[articleId] || 0) - 1)
    }));
  };

  const handleValidationTrigger = () => {
    const mismatches = groupedItems.filter(it => (counts[it.articleId] || 0) !== it.expectedQty);

    if (mismatches.length > 0 && validationAttempts === 0) {
      setCount1Data({ ...counts });
      setValidationAttempts(1);
      setMismatchIds(mismatches.map(m => m.articleId)); // Fijamos qué items mostramos en pantalla de revisión
      setLastScan({ article: null, message: "NOVEDADES DETECTADAS. REVISIÓN ACTIVADA.", status: 'error' });
      return;
    }

    setShowConfirmDialog(true);
  };

  const proceedToFinalize = () => {
    setShowConfirmDialog(false);
    
    // 1. Identificar el ID del tipo de notificación "INVENTARIO AJOVER"
    const typeId = masterTipoNotificacion.find(t => 
      t.name?.trim().toUpperCase() === 'INVENTARIO AJOVER'
    )?.id;

    // 2. Buscar si hay alertas activas de ese tipo con correos válidos (Validación Mayúsculas/Minúsculas)
    const activeNotifs = masterNotificaciones.filter(n => {
      const isCorrectType = n.tipo_notificacion_id === typeId || n.tipoNotificacionId === typeId;
      const isActive = n.statusId === 'EST-01' || n.status?.toUpperCase() === 'ACTIVO' || n.statusId === 'ACTIVO';
      return isCorrectType && isActive && n.notificationEmail;
    });

    if (activeNotifs.length === 0) {
      // Fallback: búsqueda por nombre si no se encontró por ID de tipo (por seguridad)
      const fallbackNotif = masterNotificaciones.find(n =>
        n.name?.trim().toUpperCase().includes('INVENTARIO') &&
        n.notificationEmail &&
        (n.statusId === 'EST-01' || n.status?.toUpperCase() === 'ACTIVO')
      );

      if (!fallbackNotif) {
        setShowEmailInput(true);
        return;
      }
      finalizeProcess(fallbackNotif.notificationEmail);
    } else {
      // Si hay al menos una activa del tipo correcto, el servidor enviará a todos
      // Le mandamos el primero como referencia pero el backend iterará por todos los del tipo
      finalizeProcess(activeNotifs[0].notificationEmail!);
    }
  };

  const handleOpenTransaction = (articleId: string, type: 'CONVERT' | 'REVERSE') => {
    const currentQty = counts[articleId] || 0;
    if (currentQty === 0) {
      toast.warning('No hay cantidad para procesar');
      return;
    }

    const masterInfo = masterArticulo.find(m => m.id === articleId || m.sku === articleId);
    if (!masterInfo) {
      toast.error('Artículo no encontrado en maestra');
      return;
    }

    // Nombres de Unidades (Fallback seguros)
    const uomGen = (masterInfo as any).uom_general || 'CAJA'; // Nivel 1
    const uomInter = (masterInfo as any).uom_inter || (masterInfo as any).uom_intermediate || 'PACK'; // Nivel 2
    const uomStd = (masterInfo as any).uom_std || (masterInfo as any).uom_standard || 'UND'; // Nivel 3

    // Factores
    const fInter = Number((masterInfo as any).factorInter || (masterInfo as any).factor_inter || 1); // Cuantos N2 hay en N1
    const fStd = Number((masterInfo as any).factorStd || (masterInfo as any).factor_std || 1); // Cuantos N3 hay en N2

    const options: any[] = [];

    if (type === 'CONVERT') {
      // CONVERSIÓN (Desglose / Multiplicación)
      // Escenario 1: Nivel 1 -> Nivel 2 (Caja -> Pack)
      if (fInter > 1) {
        options.push({
            id: 'gen_to_inter',
            label: `Desglosar ${uomGen} a ${uomInter}`,
            sourceUnit: uomGen,
            targetUnit: uomInter,
            factor: fInter,
            operation: 'multiply',
            resultQty: currentQty * fInter
        });
      }
      // Escenario 2: Nivel 2 -> Nivel 3 (Pack -> Und)
      if (fStd > 1) {
         options.push({
            id: 'inter_to_std',
            label: `Desglosar ${uomInter} a ${uomStd}`,
            sourceUnit: uomInter,
            targetUnit: uomStd,
            factor: fStd,
            operation: 'multiply',
            resultQty: currentQty * fStd
        });
      }
      // Escenario 3: Nivel 1 -> Nivel 3 (Directo: Caja -> Und)
      const fTotal = fInter * fStd;
      if (fTotal > 1 && fTotal !== fInter && fTotal !== fStd) {
         options.push({
            id: 'gen_to_std',
            label: `Desglosar Completamente (${uomGen} -> ${uomStd})`,
            sourceUnit: uomGen,
            targetUnit: uomStd,
            factor: fTotal,
            operation: 'multiply',
            resultQty: currentQty * fTotal
        });
      }
      
      // Fallback si no hay factores configurados pero el usuario intenta convertir (ej. caso del usuario con 30 y 1)
      if (options.length === 0 && fInter > 1) {
          options.push({
            id: 'simple_convert',
            label: `Convertir ${uomGen} a ${uomStd}`,
            sourceUnit: uomGen,
            targetUnit: uomStd,
            factor: fInter,
            operation: 'multiply',
            resultQty: currentQty * fInter
        });
      }

    } else {
      // REVERSA (Agrupación / División)
      // Escenario 1: Nivel 3 -> Nivel 2 (Und -> Pack)
      if (fStd > 1) {
        options.push({
            id: 'std_to_inter',
            label: `Agrupar ${uomStd} en ${uomInter}`,
            sourceUnit: uomStd,
            targetUnit: uomInter,
            factor: fStd,
            operation: 'divide',
            resultQty: currentQty / fStd
        });
      }
      // Escenario 2: Nivel 2 -> Nivel 1 (Pack -> Caja)
      if (fInter > 1) {
         options.push({
            id: 'inter_to_gen',
            label: `Agrupar ${uomInter} en ${uomGen}`,
            sourceUnit: uomInter,
            targetUnit: uomGen,
            factor: fInter,
            operation: 'divide',
            resultQty: currentQty / fInter
        });
      }
       // Escenario 3: Nivel 3 -> Nivel 1 (Directo: Und -> Caja)
       const fTotal = fInter * fStd;
       if (fTotal > 1 && fTotal !== fInter && fTotal !== fStd) {
          options.push({
             id: 'std_to_gen',
             label: `Agrupación Completa (${uomStd} -> ${uomGen})`,
             sourceUnit: uomStd,
             targetUnit: uomGen,
             factor: fTotal,
             operation: 'divide',
             resultQty: currentQty / fTotal
         });
       }

       // Fallback simple
       if (options.length === 0 && fInter > 1) {
          options.push({
            id: 'simple_reverse',
            label: `Convertir ${uomStd} a ${uomGen}`,
            sourceUnit: uomStd,
            targetUnit: uomGen,
            factor: fInter,
            operation: 'divide',
            resultQty: currentQty / fInter
        });
       }
    }

    if (options.length === 0) {
        toast.error('No hay factores de conversión configurados.');
        return;
    }

    setUnitTransaction({
        type,
        articleId,
        currentQty,
        qtyToProcess: currentQty, // Por defecto procesamos todo
        options,
    });
  };

  const applyTransaction = () => {
    if (!unitTransaction || !unitTransaction.selectedOption) return;

    const opt = unitTransaction.selectedOption;
    const qtyToProc = unitTransaction.qtyToProcess;
    
    // M7-LOGIC: (qtyToProcess * factor) + (originalQty - qtyToProcess)
    const convertedPart = opt.operation === 'multiply' 
        ? (qtyToProc * opt.factor) 
        : (qtyToProc / opt.factor);
    
    const remainder = unitTransaction.currentQty - qtyToProc;
    const finalResult = Number((convertedPart + remainder).toFixed(2));

    // Validación de decimales
    if (!Number.isInteger(finalResult)) {
        if(!confirm(`La operación resultará en decimales (${finalResult}). ¿Continuar?`)) return;
    }

    setCounts(prev => ({
      ...prev,
      [unitTransaction.articleId]: finalResult
    }));

    const opSymbol = opt.operation === 'multiply' ? 'x' : '/';
    const logMsg = `${unitTransaction.type === 'CONVERT' ? 'Conv' : 'Rev'} PARCIAL: ${qtyToProc} ${opt.sourceUnit} ${opSymbol} ${opt.factor} + ${remainder} rem = ${finalResult} ${opt.targetUnit}`;

    setItemObservations(prev => ({
      ...prev,
      [unitTransaction.articleId]: `${logMsg}. ${prev[unitTransaction.articleId] || ''}`
    }));

    toast.success('Cambio aplicado');
    setUnitTransaction(null);
  };

  const exportToExcel = () => {
    const dataToExport = groupedItems.map(item => ({
      'Artículo / SKU': item.articleId,
      'Descripción': (item as any).articleName || (masterArticulo.find(m => m.id === item.articleId) as any)?.name || 'Sin descripción',
      'Estado': (counts[item.articleId] || 0) > 0 ? 'Conteo' : 'Pendiente',
      'Cant. Auditada': counts[item.articleId] || 0,
      'U.M.': item.unit || 'UND',
      'Volumen': (item as any).volume || 0,
      'Nota Inventario': itemObservations[item.articleId] || '',
      'Nota General': inventoryObservation
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario M7");
    XLSX.writeFile(wb, `Inventario_${docL.externalDocId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleResolveIncident = (incidentId: string, action: 'confirm' | 'delete') => {
    const incident = incidents.find(inc => inc.id === incidentId);
    if (!incident) return;

    if (action === 'confirm') {
      const targetCode = incident.suggestion || incident.code;
      processBarcode(targetCode);
      toast.success(`Artículo ${targetCode} integrado al plan.`);
    }

    setIncidents(prev => prev.filter(inc => inc.id !== incidentId));
  };

  const finalizeProcess = (email: string) => {
    setIsProcessing(true);

    const emailInMaster = masterNotificaciones.some(n => n.notificationEmail === email && n.name?.toLowerCase().includes('ajover'));
    if (!emailInMaster) {
      onAddNotificationToMaster({
        id: `not-ajover-${Date.now()}`,
        name: `inventario ajover`,
        notificationEmail: email,
        tipoNotificacionId: 'TN-01',
        statusId: 'EST-01'
      });
    }

    const finalItems: DocumentLItem[] = groupedItems.map(it => ({
      ...it,
      countedQty: counts[it.articleId] || 0,
      count1: count1Data[it.articleId] || 0,
      count2: counts[it.articleId] || 0,
      inventoryNote: itemObservations[it.articleId] || '',
      status: (counts[it.articleId] || 0) === it.expectedQty ? 'Matches' : 'Mismatch'
    }));

    onConfirm(finalItems, inventoryObservation, email);
    // NO cerramos el procesamiento aquí, dejamos que el padre lo maneje o que el componente se desmonte
  };

  const filteredItems = useMemo(() => {
    let list = groupedItems;

    if (validationAttempts === 0) {
      // Fase 1: Solo mostramos lo que se ha escaneado
      list = groupedItems.filter(it => (counts[it.articleId] || 0) > 0);
    } else {
      // Fase 2: Novedades
      list = groupedItems.filter(it => mismatchIds.includes(it.articleId));
    }

    if (tableSearch) {
      const search = tableSearch.toLowerCase();
      list = list.filter(it =>
        it.articleId.toLowerCase().includes(search) ||
        ((it as any).articleName || '').toLowerCase().includes(search) ||
        (it.invoice || '').toLowerCase().includes(search)
      );
    }

    if (sortConfig) {
      list.sort((a, b) => {
        const aVal = (a as any)[sortConfig.key] || '';
        const bVal = (b as any)[sortConfig.key] || '';

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [groupedItems, tableSearch, validationAttempts, counts, mismatchIds, sortConfig]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === 'all') return 1;
    return Math.ceil(filteredItems.length / rowsPerPage);
  }, [filteredItems, rowsPerPage]);

  const paginatedItems = useMemo(() => {
    if (rowsPerPage === 'all') return filteredItems;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, currentPage, rowsPerPage]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // FIX: Restauramos la función que se rompió
  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const totalUnits = Object.values(counts).reduce((a, b) => a + b, 0);



  return (
    <div className="bg-white w-full h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden">

      {/* ÉXITO OVERLAY */}
      {saveSuccess && (
        <div className="absolute inset-0 z-[700] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300 border border-white/20">
            <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg mb-6 animate-bounce">
              <Icons.Check className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 mb-2">Inventario Guardado</h2>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg">Operación Exitosa</p>
          </div>
        </div>
      )}
      {/* STATUS DE SINCRONIZACIÓN CLOUD */}
      <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 border-t border-slate-100 shrink-0">
        <div className={`w-2 h-2 rounded-full ${syncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' : syncStatus === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
          {syncStatus === 'syncing' ? 'Cloud Sync: Sincronizando...' : syncStatus === 'error' ? 'Cloud Sync: Error de Conexión' : 'Cloud Sync: Protegido en la Nube'}
          {lastSyncTime && syncStatus === 'synced' && (
            <span className="ml-2 text-slate-300 font-bold opacity-60 italic">({lastSyncTime.toLocaleTimeString()})</span>
          )}
        </p>
      </div>

      <div className="bg-slate-900 px-4 py-1 text-white flex flex-col lg:flex-row justify-between items-center shrink-0 border-none gap-3">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 shadow-lg shrink-0"><Icons.Scan className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base md:text-xl font-black uppercase tracking-tight leading-none truncate -mt-1">{docL.externalDocId}</h2>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[8px] text-slate-500 font-bold uppercase bg-slate-800 px-2 py-0.5 rounded border border-white/5">{docL.vehicleData}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${validationAttempts === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                {validationAttempts === 0 ? 'Fase 1: Conteo' : 'Fase 2: Novedades'}
              </span>
            </div>
          </div>
          <button onClick={onCancel} className="lg:hidden text-slate-500 hover:text-red-500 transition-all text-2xl font-thin">&times;</button>
        </div>

        <div className="flex items-center gap-6 w-full lg:w-auto justify-end">
          {/* CONTADORES (FOTO 3) */}
          <div className="flex items-center gap-6 mr-2">
            <div className="text-center">
              <p className="text-xl font-black text-emerald-400 leading-none">{Object.keys(counts).length}</p>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Items</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white leading-none">{groupedItems.length}</p>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Plan</p>
            </div>
          </div>

          {/* SCANNER EN HEADER (FOTO 1 - BACKGROUND BLANCO) */}
          <form onSubmit={handleScan} className="relative group w-48 md:w-64">
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={handleInputChange}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="ESCANEAR SKU..."
              autoFocus
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-white/20 rounded-xl text-slate-900 font-black uppercase text-sm outline-none focus:border-emerald-500 transition-all placeholder:text-slate-300 shadow-sm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors pointer-events-none">
              <Icons.Scan className="w-4 h-4" />
            </div>
          </form>

          <div className="flex flex-col items-end mr-4">
            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Total Unidades</span>
            <span className="text-2xl font-black leading-none">{totalUnits}</span>
          </div>
          <button onClick={onCancel} className="hidden md:block px-6 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">Cancelar</button>
          <button
            onClick={handleValidationTrigger}
            disabled={isProcessing || Object.keys(counts).length === 0}
            className="px-6 py-2 bg-emerald-500 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-[0.1em] shadow-lg hover:bg-emerald-400 transition-all flex items-center gap-2 disabled:opacity-20 active:scale-95"
          >
            {isProcessing ? <Icons.Alert className="w-3 h-3 animate-spin" /> : <Icons.Signature className="w-3.5 h-3.5" />}
            {validationAttempts === 0 ? 'Finalizar' : 'Cerrar'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden h-[calc(100vh-250px)]">
        {/* TABLA PRINCIPAL - M7-MOD: Ocupa el 70% del alto con scroll interno */}
        <div className="flex-[0.7] flex flex-col min-h-0 w-full overflow-hidden border-b-4 border-slate-100">
          <div className="bg-white flex flex-col h-full relative">
            <div className="px-0 py-1 border-b border-slate-50 bg-white flex items-center shrink-0 gap-4 overflow-x-auto z-30">
              {/* SEARCH INPUT */}
              <div className="relative flex-1 max-w-xs shrink-0 pl-4">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="FILTRAR LISTADO..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl text-[9px] font-black uppercase outline-none focus:bg-white focus:border-emerald-500 transition-all placeholder:text-slate-400 text-slate-900"
                />
              </div>

              {/* XLS BUTTON */}
              <button onClick={exportToExcel} className="flex px-4 py-3 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 hover:scale-110 active:scale-95 transition-all shadow-lg hover:shadow-xl items-center gap-2 border border-emerald-400/20 shrink-0 font-black text-[9px] uppercase tracking-widest">
                <Icons.Excel className="w-3.5 h-3.5" /> XLS
              </button>

              {/* LAST SCAN FEEDBACK */}
              {lastScan && (
                <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 animate-in slide-in-from-left-4 shadow-xl shrink-0 ${lastScan.status === 'success' ? 'bg-white border-slate-100' : 'bg-red-50 border-red-100'}`}>
                   <p className={`font-black text-[9px] uppercase tracking-widest ${lastScan.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {lastScan.message}
                   </p>
                </div>
              )}

              {/* NOTAS DEL INVENTARIO */}
              <div className="flex-1 max-w-md shrink-0">
                <textarea
                  value={inventoryObservation}
                  onChange={(e) => setInventoryObservation(e.target.value)}
                  placeholder="OBSERVACIONES GENERALES..."
                  className="w-full h-11 bg-slate-50 border-2 border-transparent rounded-xl px-4 py-3 text-[10px] font-bold text-slate-900 outline-none focus:bg-white focus:border-emerald-500/50 transition-all resize-none placeholder:text-slate-300 uppercase leading-tight"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] sticky top-0 z-20 shadow-sm">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('articleId')}>Artículo / Referencia{getSortIndicator('articleId')}</th>
                    <th className="px-4 py-4 text-center">Auditado</th>
                    <th className="px-4 py-4 text-left">Novedades / Notas</th>
                    <th className="px-4 py-4 text-right pr-6">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedItems.map(it => {
                    const currentCount = counts[it.articleId] || 0;
                    return (
                      <tr key={it.articleId} className={`hover:bg-slate-50/50 transition-all font-bold group ${validationAttempts === 1 ? 'bg-red-50/10' : ''}`}>
                        <td className="px-3 py-1.5 min-w-[300px]">
                          <div className="flex flex-col">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest w-fit mb-0.5 ${ (it as any).isExtra ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                              { (it as any).isExtra ? 'EXTRA / SINCRO' : `PLAN ID: ${it.articleId}` }
                            </span>
                            <p className="font-black text-slate-900 text-[10px] uppercase tracking-tight leading-none">
                               {(it as any).articleName || (masterArticulo.find(m => m.id === it.articleId || m.sku === it.articleId) as any)?.name || it.articleId || 'SIN DESCRIPCIÓN'}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <div className={`inline-flex items-center justify-center min-w-[50px] h-8 rounded-lg text-base font-black shadow-inner transition-all ${currentCount > 0 ? (validationAttempts === 1 ? 'bg-slate-800 text-white' : 'bg-emerald-500 text-white') : 'bg-slate-50 text-slate-200'}`}>
                            {currentCount}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-left">
                          <input
                            type="text"
                            value={itemObservations[it.articleId] || ''}
                            onChange={(e) => setItemObservations(prev => ({ ...prev, [it.articleId]: e.target.value }))}
                            placeholder="NOTAS..."
                            className="w-full bg-slate-50 border border-transparent rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-600 outline-none focus:bg-white focus:border-emerald-500 transition-all uppercase"
                          />
                        </td>
                        <td className="px-4 py-3 text-right pr-6 flex justify-end gap-2">
                          {validationAttempts === 1 && (
                            <>
                              <button onClick={() => handleOpenTransaction(it.articleId, 'CONVERT')} className="w-8 h-8 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 flex items-center justify-center"><Icons.RefreshCw className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenTransaction(it.articleId, 'REVERSE')} className="w-8 h-8 bg-amber-500 text-white rounded-lg shadow-md hover:bg-amber-600 flex items-center justify-center"><Icons.RotateCcw className="w-4 h-4" /></button>
                            </>
                          )}
                          {(user?.roleId === 'ROL-01' || user?.roleId === 'ROL-02') && (
                            <button onClick={() => handleSubtract(it.articleId)} disabled={currentCount === 0} className="w-8 h-8 bg-red-400 text-white rounded-lg shadow-md disabled:opacity-10 flex items-center justify-center"><Icons.Trash className="w-3 h-3" /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-20 text-center">
                        <p className="font-black text-slate-300 uppercase text-[10px] tracking-[0.3em]">No hay registros para mostrar</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINACIÓN INFERIOR COMPACTA */}
            <div className="p-3 bg-slate-900 border-t border-white/5 flex justify-between items-center shrink-0 px-6">
              <div className="flex items-center gap-4">
                <select
                  value={rowsPerPage}
                  onChange={e => { setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1); }}
                  className="p-1.5 bg-slate-800 border border-white/10 rounded-lg text-[10px] font-black text-white uppercase outline-none"
                >
                  <option value={5}>5 líneas</option>
                  <option value={10}>10 líneas</option>
                  <option value={20}>20 líneas</option>
                  <option value="all">Todo</option>
                </select>
                <span className="text-[9px] font-black text-slate-500 uppercase">Total: {filteredItems.length}</span>
              </div>

              <div className="flex items-center gap-4">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 bg-slate-800 border border-white/10 rounded-lg text-slate-400 disabled:opacity-20"><Icons.ChevronRight className="w-4 h-4 rotate-180" /></button>
                <span className="text-[10px] font-black uppercase text-white">Pag {currentPage} / {totalPages || 1}</span>
                <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 bg-slate-800 border border-white/10 rounded-lg text-slate-400 disabled:opacity-20"><Icons.ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>

        {/* TABLA 2: INCIDENCIAS / NOVEDADES INTELIGENTES (M7-MOD: Flex-0.3 para visualización dual) 30% */}
        <div className="flex-[0.3] min-h-[180px] flex flex-col bg-slate-50 overflow-hidden shrink-0">
          <div className="px-6 py-3 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 text-amber-500 rounded-lg flex items-center justify-center shadow-md">
                <Icons.Alert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Incidencias y Ráfagas</h3>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Lecturas incompletas o fuera de plan</p>
              </div>
            </div>
            {incidents.length > 0 && (
              <button 
                onClick={() => { if(confirm('¿Limpiar todas las incidencias?')) setIncidents([]); }}
                className="text-[9px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest transition-colors"
              >
                Limpiar Todo
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {incidents.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-400 font-black uppercase text-[8px] tracking-[0.2em] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3">Hora</th>
                    <th className="px-6 py-3">Código Detectado</th>
                    <th className="px-6 py-3">Análisis M7 IQ</th>
                    <th className="px-6 py-3 text-right pr-6">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {incidents.map(inc => (
                    <tr key={inc.id} className="bg-white hover:bg-amber-50/30 transition-all font-bold group">
                      <td className="px-6 py-2 text-[9px] text-slate-400">{inc.timestamp}</td>
                      <td className="px-6 py-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase">
                          {inc.code}
                        </span>
                      </td>
                      <td className="px-6 py-2">
                        <div className="flex items-center gap-2">
                          <Icons.Brain className="w-3 h-3 text-slate-300" />
                          <p className={`text-[10px] uppercase tracking-tight leading-tight ${inc.suggestion ? 'text-amber-600 font-black' : 'text-slate-500'}`}>
                            {inc.note}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-2 text-right pr-6 flex justify-end gap-2">
                        {inc.suggestion && (
                          <button
                            onClick={() => handleResolveIncident(inc.id, 'confirm')}
                            className="px-3 py-1 bg-emerald-500 text-slate-950 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-sm"
                          >
                            Integrar {inc.suggestion}
                          </button>
                        )}
                        {!inc.suggestion && (
                            <button
                                onClick={() => handleResolveIncident(inc.id, 'confirm')}
                                className="px-3 py-1 bg-blue-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-blue-400 transition-all shadow-sm"
                            >
                                Forzar como Extra
                            </button>
                        )}
                        <button
                          onClick={() => handleResolveIncident(inc.id, 'delete')}
                          className="p-1.5 bg-slate-100 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                        >
                          <Icons.Trash className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-10 opacity-30 grayscale">
                <Icons.Check className="w-6 h-6 text-slate-300 mb-2" />
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Sin incidencias de ráfaga</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DIÁLOGO DE CONFIRMACIÓN M7 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 text-center space-y-8 shadow-2xl border border-white/5">
            <div className="w-16 h-16 bg-slate-900 text-emerald-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg"><Icons.Audit className="w-8 h-8" /></div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Cerrar Auditoría M7</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Se sincronizarán los datos y se enviará el informe de inventario al centro de control.</p>
            </div>
            <div className="flex flex-col gap-4">
              <button
                onClick={proceedToFinalize}
                className="w-full py-4 bg-emerald-500 text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-400 transition-all active:scale-95"
              >
                Sincronizar y Finalizar
              </button>
              <button onClick={() => setShowConfirmDialog(false)} className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Volver a Revisión</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EMAIL (SI NO EXISTE EN MAESTRO) */}
      {showEmailInput && (
        <div className="fixed inset-0 z-[600] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-12 text-center space-y-8 shadow-2xl border border-white/5">
            <div className="w-16 h-16 bg-emerald-500 text-slate-950 rounded-[1.5rem] mx-auto flex items-center justify-center shadow-xl animate-bounce"><Icons.List className="w-8 h-8" /></div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Notificación Ajover</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ingrese el correo de destino para el informe de novedades.</p>
            </div>
            <input
              type="email"
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              placeholder="CORREO@DESTINO.COM"
              className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] font-black text-center text-xs outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
            <div className="flex flex-col gap-4">
              <button
                onClick={async () => {
                  setIsFinalizing(true);
                  try {
                    await finalizeProcess(manualEmail);
                  } finally {
                    setIsFinalizing(false);
                  }
                }}
                disabled={!manualEmail.includes('@') || isFinalizing}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-600 shadow-2xl transition-all disabled:opacity-20 active:scale-95 flex items-center justify-center gap-3"
              >
                {isFinalizing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Sincronizando...</span>
                  </>
                ) : 'Enviar y Finalizar'}
              </button>
              <button onClick={() => setShowEmailInput(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UNIFICADO DE TRANSACCIÓN */}
      {unitTransaction && (
        <div className="fixed inset-0 z-[800] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 text-center shadow-2xl border border-white/10 relative overflow-hidden">
             
             {/* Header Dinámico */}
             <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${unitTransaction.type === 'CONVERT' ? 'from-blue-500 to-indigo-500' : 'from-amber-500 to-orange-500'}`}></div>
             
             <div className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center shadow-lg mb-6 ${unitTransaction.type === 'CONVERT' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                {unitTransaction.type === 'CONVERT' ? <Icons.RefreshCw className="w-8 h-8" /> : <Icons.RotateCcw className="w-8 h-8" />}
             </div>

             <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">
                {unitTransaction.type === 'CONVERT' ? 'Convertir Unidades' : 'Reversar Unidades'}
             </h3>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">
                Artículo: {unitTransaction.articleId} | Actual: {unitTransaction.currentQty}
             </p>

             {/* Selector de Opciones */}
             <div className="space-y-4 mb-8">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                    <p className="text-left text-[9px] font-black text-slate-400 uppercase mb-2">Cantidad a Procesar (de {unitTransaction.currentQty}):</p>
                    <div className="flex items-center gap-4">
                        <input 
                            type="number"
                            min={0}
                            max={unitTransaction.currentQty}
                            value={unitTransaction.qtyToProcess}
                            onChange={(e) => {
                                const val = Math.min(unitTransaction.currentQty, Math.max(0, Number(e.target.value)));
                                setUnitTransaction({...unitTransaction, qtyToProcess: val});
                            }}
                            className="bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-slate-900 w-full outline-none focus:border-blue-500 transition-all"
                        />
                        <div className="shrink-0 flex flex-col items-center">
                            <span className="text-[10px] font-black text-slate-300">EXCEDENTE</span>
                            <span className="text-xs font-black text-slate-900">{(unitTransaction.currentQty - unitTransaction.qtyToProcess).toFixed(2).replace(/\.00$/, '')}</span>
                        </div>
                    </div>
                </div>

                <p className="text-left text-[9px] font-black text-slate-400 uppercase ml-2">Seleccione Operación:</p>
                {unitTransaction.options.map(opt => {
                    const partialResult = opt.operation === 'multiply' 
                        ? (unitTransaction.qtyToProcess * opt.factor) 
                        : (unitTransaction.qtyToProcess / opt.factor);
                    const finalDisplayResult = (partialResult + (unitTransaction.currentQty - unitTransaction.qtyToProcess)).toFixed(2).replace(/\.00$/, '');

                    return (
                        <div 
                            key={opt.id}
                            onClick={() => setUnitTransaction({...unitTransaction, selectedOption: opt})}
                            className={`cursor-pointer p-4 rounded-2xl border-2 transition-all group relative overflow-hidden ${unitTransaction.selectedOption?.id === opt.id ? (unitTransaction.type === 'CONVERT' ? 'border-blue-500 bg-blue-50/50' : 'border-amber-500 bg-amber-50/50') : 'border-slate-100 bg-white hover:border-slate-300'}`}
                        >
                             <div className="flex justify-between items-center relative z-10">
                                <div className="text-left">
                                    <p className="text-[11px] font-black uppercase text-slate-800">{opt.label}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">Factor: {opt.factor}</span>
                                        <span className="text-[9px] font-bold text-slate-400">{opt.sourceUnit} → {opt.targetUnit}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xl font-black ${unitTransaction.type === 'CONVERT' ? 'text-blue-600' : 'text-amber-600'}`}>
                                        {finalDisplayResult}
                                    </p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase">Resultado Total</p>
                                </div>
                             </div>
                        </div>
                    );
                })}
             </div>

             <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setUnitTransaction(null)} className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                    Cancelar
                  </button>
                  <button 
                    onClick={applyTransaction}
                    disabled={!unitTransaction.selectedOption}
                    className={`py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all ${!unitTransaction.selectedOption ? 'bg-slate-300 cursor-not-allowed' : (unitTransaction.type === 'CONVERT' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/30')}`}
                  >
                    Aplicar Cambio
                  </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlindCount;
