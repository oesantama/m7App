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
  onConfirm: (finalItems: DocumentLItem[], generalObs: string, updateEmail?: string) => Promise<void> | void;
  onPartialSave: (currentItems: DocumentLItem[], generalObs: string) => Promise<void>;
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
  const [extraItems, setExtraItems] = useState<DocumentLItem[]>(() => {
    const saved = localStorage.getItem(`m7_extras_${docL.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [tableSearch, setTableSearch] = useState('');

  // Persistir extras
  useEffect(() => {
    localStorage.setItem(`m7_extras_${docL.id}`, JSON.stringify(extraItems));
  }, [extraItems, docL.id]);

  // Bloquear pull-to-refresh móvil durante todo el tiempo que el conteo esté montado.
  // Evita que el operario recargue la página accidentalmente al hacer scroll hacia arriba.
  useEffect(() => {
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overscrollBehavior = '';
    };
  }, []);
  // ESTADOS DE INVENTARIO M7
  const [counts, setCounts] = useState<{ [articleId: string]: number }>(() => {
    // M7 V16 FIX: Prevenir "Ghost Deletion" hidratando primero desde LocalStorage antes que de la base de datos (Cloud)
    const saved = localStorage.getItem(`m7_offline_count_${docL.id}`);
    if (saved) {
       try { 
         const parsed = JSON.parse(saved);
         // M7 V17 FIX: Asegurar que todos los valores sean Números para evitar concatenación en Android
         const numericOnly: { [id: string]: number } = {};
         Object.keys(parsed).forEach(k => { numericOnly[k] = Number(parsed[k]); });
         return numericOnly;
       } catch (e) { console.warn('Error parseando caché offline', e); }
    }
    
    const initial: { [id: string]: number } = {};
    docL.items.forEach(it => {
      const val = Number(it.count2 || it.countedQty || 0);
      if (val > 0) initial[it.articleId] = val;
    });
    return initial;
  });

  const [count1Data, setCount1Data] = useState<{ [articleId: string]: number }>(() => {
    const initial: { [id: string]: number } = {};
    docL.items.forEach(it => {
      const val = Number(it.count1 || 0);
      if (val > 0) initial[it.articleId] = val;
    });
    return initial;
  });

  const [itemObservations, setItemObservations] = useState<{ [articleId: string]: string }>(() => {
    const initial: { [id: string]: string } = {};
    docL.items.forEach(it => {
      // M7-FIX: Cargar desde inventoryNote o inventory_observation
      const note = it.inventoryNote || (it as any).inventory_observation;
      if (note && note !== it.notes) {
        initial[it.articleId] = note;
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
    createdAt: number;
    status: 'pending' | 'resolved';
    suggestion?: string;
    qty?: number;
  }[]>(() => {
    const saved = localStorage.getItem(`m7_incidents_${docL.id}`);
    const parsed = saved ? JSON.parse(saved) : [];
    // Migración retro-compatible para createdAt
    return parsed.map((p: any) => ({...p, createdAt: p.createdAt || Date.now()}));
  });

  // M7 AI BRAIN: Memoria Auto-Regenerativa (Aprendizaje por Operador)
  const [aiBrain, setAiBrain] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('m7_ai_brain_relations');
    return saved ? JSON.parse(saved) : {};
  });

  // M7 V12 BACKGROUND WORKER: Cola virtual para procesos pesados de escáner.
  const scanQueue = useRef<string[]>([]);
  const isQueueProcessing = useRef(false);

  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const processingTimer = useRef<NodeJS.Timeout | null>(null);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [validationAttempts, setValidationAttempts] = useState(0);
  const [lastScan, setLastScan] = useState<{ id?: number; article: Article | null, message: string, status: 'success' | 'error' | 'new', qty?: number } | null>(null);
  const [lastScannedAt, setLastScannedAt] = useState<Record<string, number>>({}); // M7 V15b: Timeline de escaneos
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showClearIncidentsDialog, setShowClearIncidentsDialog] = useState(false);
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
  const lastValidScanAt = useRef<number>(0); // M7 V15: Control de Ventana de Tiempo Lógico
  const tableContainerRef = useRef<HTMLDivElement>(null); // M7 V16: Ref para scroll automático

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
    autoSaveTimer.current = setTimeout(async () => {
      const finalItems: DocumentLItem[] = groupedItems.map(it => ({
        ...it,
        countedQty: counts[it.articleId] || 0,
        count1: count1Data[it.articleId] || 0,
        count2: counts[it.articleId] || 0,
        inventoryNote: itemObservations[it.articleId] || '',
      }));

      try {
        await onPartialSave(finalItems, inventoryObservation);
        setSyncStatus('synced');
        setLastSyncTime(new Date());
      } catch {
        setSyncStatus('error');
      }
    }, 5000); // M7 V17: Aumentado a 5 segundos para priorizar ráfaga de escaneo sin bloqueos

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [counts, itemObservations, inventoryObservation, groupedItems, incidents]);

  // M7 V12 BACKGROUND WORKER LOGIC
  const processNextInQueue = () => {
      if (scanQueue.current.length === 0) {
          isQueueProcessing.current = false;
          return;
      }
      
      isQueueProcessing.current = true;
      const nextBatch = scanQueue.current.shift(); // Saca el primero de la fila global
      
      if (nextBatch) {
         // El worker procesa la pesada Anti-concatenación de ese batch específico aislado
         let buffer = nextBatch;
         let foundTokens: string[] = [];
         
         if (buffer.length > 15) { 
             const planIds = groupedItems.map(it => it.articleId.toUpperCase()).sort((a,b) => b.length - a.length);
             let keepSearching = true;
             while(keepSearching && buffer.length > 0) {
                 let matchedPrefix = false;
                 for(const id of planIds) {
                     if(buffer.startsWith(id)) {
                         foundTokens.push(id);
                         buffer = buffer.substring(id.length).trim();
                         matchedPrefix = true;
                         break;
                     }
                 }
                 if (!matchedPrefix) {
                     // M7 FIX: Intentar detectar si el remanente es un solo código desconocido pistoleado "N" veces repetidas (Ej. A020384626A020384626)
                     const repeatMatch = buffer.match(/^(.+?)\1+$/);
                     if (repeatMatch && repeatMatch[1].length >= 3) {
                         const repeatedPattern = repeatMatch[1];
                         const times = buffer.length / repeatedPattern.length;
                         if (Number.isInteger(times)) {
                             for (let i=0; i<times; i++) foundTokens.push(repeatedPattern);
                             buffer = "";
                             matchedPrefix = true;
                         }
                     }
                     if (!matchedPrefix) {
                         keepSearching = false; 
                     }
                 }
             }
         }

         if (foundTokens.length > 1 && buffer.length === 0) {
             foundTokens.forEach(token => processBarcode(token)); // Procesar múltiple
         } else {
             processBarcode(nextBatch); // Procesar simple o IA
         }
      }

      // Procesar el siguiente en 5 milisegundos asíncronamente (evita bloquear render main thread)
      setTimeout(() => {
          processNextInQueue();
      }, 5);
  };

  const enqueueScan = (rawString: string) => {
      if (!rawString || rawString.trim().length < 2) return;
      // M7 V18: Encolar siempre — processBarcode se encarga de limpiar y clasificar.
      // Ya no descartamos códigos sin ':' aquí; eso causaba pérdida silenciosa de lecturas 1D largas.
      scanQueue.current.push(rawString);
      if (!isQueueProcessing.current) {
          processNextInQueue();
      }
  };

  const handleBingoEffects = () => {
      lastValidScanAt.current = Date.now();
      
      // M7 V16: Scroll al tope de la tabla para ver el registro TOP 1 inyectado
      if (tableContainerRef.current) {
         tableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // M7 V15: Retrospective Garbage Collection
      // Si tuvimos incidencias fallidas hace menos de 800ms, seguro son prefijos basura
      // de la misma estampa que mandó el hardware antes de mandar el código limpio.
      setIncidents(prev => {
          const now = Date.now();
          const toKeep = prev.filter(inc => (now - inc.createdAt) > 800);
          const toAutoIgnore = prev.filter(inc => (now - inc.createdAt) <= 800);
          
          if (toAutoIgnore.length > 0) {
              const newBrainUpdates: Record<string, string> = {};
              toAutoIgnore.forEach(inc => {
                  if (inc.code) newBrainUpdates[inc.code] = '*IGNORE*';
              });
              setAiBrain(prevBrain => {
                 const nextBrain = { ...prevBrain, ...newBrainUpdates };
                 localStorage.setItem('m7_ai_brain_relations', JSON.stringify(nextBrain));
                 return nextBrain;
              });
          }
          return toKeep;
      });
  };

  const processBarcode = (rawCode: string) => {
    let input = cleanSkuM7(rawCode);
    if (!input || input.length < 3) return;

    // === M7 V17.1: El SKU siempre está antes de los dos puntos ===
    // Ya lo maneja cleanSkuM7, pero aquí aseguramos que la ráfaga fue capturada con su delimitador

    // === M7 AI BRAIN: Verificar memoria auto-regenerativa primero ===
    // Si la lectura "sucia" (ej: D403199:BL:1) ya fue aprendida, la traducimos al SKU real (D403199).
    const translatedInput = aiBrain[input] || input;

    // M7 V14 AI FILTER: Silenciador de Basura
    if (translatedInput === '*IGNORE*' || translatedInput.startsWith('A02')) {
        // M7 V16.3: Auto-recuperación de SKUs "baneados" por error en ráfagas rápidas
        const isActuallyValid = groupedItems.some(it => it.articleId?.toUpperCase() === input || it.sku?.toUpperCase() === input) ||
                                (masterArticulo as Article[]).some(a => (a.id && a.id.toUpperCase() === input) || (a.sku && a.sku.toUpperCase() === input) || (a.barcode && a.barcode === input));
        
        if (isActuallyValid && translatedInput === '*IGNORE*') {
            // El cerebro se equivocó por una ráfaga previa. Lo "desbaneamos" en caliente.
            const nextBrain = { ...aiBrain };
            delete nextBrain[input];
            setAiBrain(nextBrain);
            localStorage.setItem('m7_ai_brain_relations', JSON.stringify(nextBrain));
            // Dejamos que continúe el flujo para procesar la lectura ahora limpia
        } else {
            // Es OP real o basura real confirmada
            setScanInput('');
            return;
        }
    }

    // 1. Buscar en el plan (Match Directo - TABLA 1)
    const master = (masterArticulo as Article[]).find(m => 
        (m.id && m.id.toUpperCase() === translatedInput) || 
        (m.sku && m.sku.toUpperCase() === translatedInput) || 
        (m.barcode && m.barcode === translatedInput)
    );

    const itemInDoc = groupedItems.find(it => 
      (it.articleId?.toUpperCase() === translatedInput) || 
      (it.sku?.toUpperCase() === translatedInput) ||
      (master && master.id === it.articleId)
    );

    if (itemInDoc) {
        const targetId = itemInDoc.articleId;
        
        setCounts(prev => {
          const newQty = (Number(prev[targetId]) || 0) + 1;
          setLastScan({
            id: Math.random(),
            article: master || null,
            message: targetId,
            status: 'success',
            qty: newQty
          });
          return { ...prev, [targetId]: newQty };
        });
        setLastScannedAt(prev => ({ ...prev, [targetId]: Date.now() }));
        handleBingoEffects();
        setCurrentPage(1); 
        setScanInput(''); 
        return; 
    }

    // === 2. HEURÍSTICA M7 V10 (Descomposición Inteligente en Vuelo) ===
    // Si llegó hasta aquí, no está en el plan y no fue corregido antes.
    // Ajover envía basura como: D403199:BL:1:A010236539:8573516 o D403199ÑBLÑ1Ñ...
    
    // Tratamos de desglosar agresivamente el código por los separadores comunes detectados.
    const aggressiveDelimiters = /([:|Ñ+\-#;]|BL)/i;
    const heuristicalParts = input.split(aggressiveDelimiters).map(p => p.trim()).filter(p => p.length >= 3);

    // Iteramos por las piezas extraídas (ej de 'D403199:BL:1' -> ['D403199', '1'])
    for (const part of heuristicalParts) {
      const heuristicMatch = groupedItems.find(it => 
        (it.articleId?.toUpperCase() === part) || 
        (it.sku?.toUpperCase() === part)
      );

      if (heuristicMatch) {
         // ¡BINGO! La heurística encontró el código enterrado en la basura.
         const targetId = heuristicMatch.articleId;
         // FIX: Previene State batching bug
         setCounts(prev => {
           const newQty = (Number(prev[targetId]) || 0) + 1;
           setLastScan({ 
              id: Math.random(),
              article: (masterArticulo as Article[]).find(a => a.id === targetId || a.sku === targetId) || null, 
              message: targetId, 
              status: 'success',
              qty: newQty
           });
           return { ...prev, [targetId]: newQty };
         });
         setLastScannedAt(prev => ({ ...prev, [targetId]: Date.now() }));
         
         // Inmediatamente alimentamos el Cerebro Auto-Regenerador para el futuro
         const newBrain = { ...aiBrain, [input]: targetId };
         setAiBrain(newBrain);
         localStorage.setItem('m7_ai_brain_relations', JSON.stringify(newBrain));

         setLastScan({ 
            id: Math.random(),
            article: (masterArticulo as Article[]).find(a => a.id === targetId || a.sku === targetId) || null, 
            message: `🤖 DESCOMPUESTO (${targetId}) [+1]`, 
            status: 'success' 
         });
         handleBingoEffects();
         setCurrentPage(1); // M7 V16: Auto-Focus
         setScanInput('');
         return;
      }
    }


    // === 3. M7 V14 DEEP SEARCH ===
    // Si el string es largo (ej. concatenado) buscamos si contiene algún SKU válido en su interior
    if (input.length >= 6) {
        // Ordenamos los del plan del más largo al más corto para evitar falsos positivos
        const planIds = groupedItems.map(it => it.articleId.toUpperCase()).sort((a,b) => b.length - a.length);
        for (const id of planIds) {
            // Solo buscar SKUs de longitud decente para evitar matches erróneos
            // FIX M7: Verificar que el carácter inmediatamente después del match NO sea alfanumérico.
            // Esto evita que "D650702" coincida dentro de "D650702T" (son artículos distintos).
            const matchIdx = id.length >= 4 ? input.indexOf(id) : -1;
            const charAfter = matchIdx !== -1 ? input[matchIdx + id.length] : undefined;
            const isWordBoundaryMatch = matchIdx !== -1 && (charAfter === undefined || !/[A-Z0-9]/i.test(charAfter));
            if (isWordBoundaryMatch) {
                const targetId = id;
                setCounts(prev => {
                  const newQty = (Number(prev[targetId]) || 0) + 1;
                  setLastScan({ 
                      id: Math.random(),
                      article: (masterArticulo as Article[]).find(a => a.id === targetId || a.sku === targetId) || null, 
                      message: targetId, 
                      status: 'success',
                      qty: newQty
                  });
                  return { ...prev, [targetId]: newQty };
                });
                setLastScannedAt(prev => ({ ...prev, [targetId]: Date.now() }));
                
                // Enseñar al cerebro que este código gigante significa 'targetId'
                const newBrain = { ...aiBrain, [input]: targetId };
                setAiBrain(newBrain);
                localStorage.setItem('m7_ai_brain_relations', JSON.stringify(newBrain));

                handleBingoEffects();
                setCurrentPage(1); // M7 V16: Auto-Focus
                setScanInput('');
                return; 
            }
        }
    }

    // 4. Si no está en plan ni la heurística lo salvó, buscar sugerencia suave para Incidencias (StartsWith)
    const possibleBetterMatch = groupedItems.find(it => 
      it.articleId?.toUpperCase().startsWith(translatedInput) || 
      it.sku?.toUpperCase().startsWith(translatedInput)
    );

    const suggestion = possibleBetterMatch 
        ? `¿Quiso decir ${possibleBetterMatch.articleId}? (Lectura incompleta)`
        : `Artículo fuera de plan o código desconocido.`;

    // M7 V15 FUTURE FILTER (Post-Context Filter):
    // Solo aplicar el filtro de "basura rápida" si el código NO ES un producto conocido (Plan o Maestra)
    const isKnownProduct = groupedItems.some(it => it.articleId?.toUpperCase() === input || it.sku?.toUpperCase() === input) ||
                           (masterArticulo as Article[]).some(a => (a.id && a.id.toUpperCase() === input) || (a.sku && a.sku.toUpperCase() === input) || (a.barcode && a.barcode === input));
    
    if (!isKnownProduct && Date.now() - lastValidScanAt.current <= 800) {
        // Silenciador de ráfagas para códigos desconocidos (ej: lotes)
        const newBrain = { ...aiBrain, [input]: '*IGNORE*' };
        setAiBrain(newBrain);
        localStorage.setItem('m7_ai_brain_relations', JSON.stringify(newBrain));
        setScanInput('');
        return; 
    }

    // === M7 V15c: AUTO PROCESAR EXTRAS DESDE MAESTRO ===
    // Si la lectura no está en el plan actual (groupedItems) pero SÍ es un artículo real de base de datos
    // Lo anexamos dinámicamente como "Extra" para evitar engrosar innecesariamente las incidencias.
    const inMaster = (masterArticulo as Article[]).find(a => 
        (a.id && a.id.toUpperCase() === input) || 
        (a.sku && a.sku.toUpperCase() === input) ||
        (a.barcode && a.barcode === input)
    );
    if (inMaster) {
        const newExtra = {
          articleId: inMaster.id,
          sku: inMaster.sku || inMaster.id,
          ['articleName' as any]: inMaster.name || `EXTRA ${inMaster.id}`,
          expectedQty: 0,
          count1: 0,
          countedQty: 0,
          unit: inMaster.factorInter > 1 ? 'CJ' : 'UND', // Sugerencia de unidad basada en factor
          id: `extra-${Date.now()}`,
          status: 'pending' as DocStatus,
          isExtra: true
        } as unknown as DocumentLItem;

        // Lo inyectamos silenciosamente a la malla de items.
        setExtraItems(prev => {
            if (prev.some(it => it.articleId === inMaster.id)) return prev;
            return [...prev, newExtra];
        });
        
        // Siempre sumar 1 por pistoleada — el factor solo aplica en botones Convertir/Revertir
        setTimeout(() => {
            enqueueScan(inMaster.sku || inMaster.id);
        }, 100);
        return; 
    }

    // M7 V15d: FILTRO DURO "SOLO LETRAS".
    // El 99% de las incidencias inútiles u olvidadas son códigos numéricos puramente (basura del empaque).
    // Si la lectura NO empieza por una letra (A-Z) Y NO es un barcode válido en maestra, se descarta.
    if (!/^[a-zA-Z]/i.test(input) && !inMaster) {
        // Enseñar al bot para que lo descarte más rápido todavía la prox. vez (Caché O(1))
        const newBrain = { ...aiBrain, [input]: '*IGNORE*' };
        setAiBrain(newBrain);
        localStorage.setItem('m7_ai_brain_relations', JSON.stringify(newBrain));
        setScanInput('');
        return;
    }

    // 4. Registrar en TABLA 2 (Incidencias)
    const newIncident = {
      id: `inc-${Date.now()}`,
      code: input, // Guardamos la ráfaga pura como error.
      note: suggestion,
      timestamp: new Date().toLocaleTimeString(),
      createdAt: Date.now(), // Para la V15 (Retro-GC)
      status: 'pending' as const,
      suggestion: possibleBetterMatch?.articleId,
      qty: 1
    };

    setIncidents(prev => {
        // M7 V15c: AGRUPAR INCIDENCIAS IDÉNTICAS PARA EVITAR SPAM EN TABLET
        const existingCodeIndex = prev.findIndex(inc => inc.code === input);
        if (existingCodeIndex !== -1) {
             const copy = [...prev];
             copy[existingCodeIndex] = { 
                 ...copy[existingCodeIndex], 
                 qty: (copy[existingCodeIndex].qty || 1) + 1,
                 timestamp: new Date().toLocaleTimeString(),
                 createdAt: Date.now() // Refresca su timeline
             };
             return copy;
        }
        return [newIncident, ...prev];
    });
    setLastScan({ 
      id: Math.random(),
      article: null, 
      message: `🚫 INCIDENCIA O FUERA DE PLAN`, 
      status: 'error' 
    });
    setScanInput(''); // Limpiar input para el próximo
  };

  // M7 V18 FAST SCANNER: Manejo de entrada sin doble-disparo
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setScanInput(val);

    if (processingTimer.current) {
      clearTimeout(processingTimer.current);
      processingTimer.current = null;
    }

    // PDF417 Ajover: el ':' indica que la ráfaga llegó completa → procesar AHORA, sin esperar Enter.
    // Esto evita que el Enter del scanner dispare handleScan DESPUÉS del timer (doble-add).
    if (val.includes(':') && val.length >= 5) {
      enqueueScan(val);
      setScanInput('');
      return;
    }

    // Fallback para códigos muy largos sin ':' (hardware que no envía Enter en ciertos modelos)
    if (val.length > 20) {
      processingTimer.current = setTimeout(() => {
        processBarcode(val);
        setScanInput('');
      }, 200);
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    // CRÍTICO: Cancelar timer pendiente antes de procesar (evita doble-add con PDF417)
    if (processingTimer.current) {
      clearTimeout(processingTimer.current);
      processingTimer.current = null;
    }
    const code = scanInput.trim();
    setScanInput('');
    if (code.length >= 2) processBarcode(code);
  };

  const handleSubtract = (articleId: string) => {
    setCounts(prev => ({
      ...prev,
      [articleId]: Math.max(0, (Number(prev[articleId]) || 0) - 1)
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
    
    // 1. Identificar todos los IDs posibles del tipo de notificación "INVENTARIO AJOVER"
    // Usamos filter en lugar de find para capturar múltiples coincidencias y añadimos TGN-01 por requisito
    const matchedTypes = masterTipoNotificacion.filter(t => 
      t.name?.trim().toUpperCase() === 'INVENTARIO AJOVER' ||
      t.id === 'TGN-01'
    );
    const typeIds = matchedTypes.map(t => t.id);

    // 2. Buscar si hay alertas activas vinculadas a cualquiera de esos IDs
    const activeNotifs = masterNotificaciones.filter(n => {
      const typeId = n.tipo_notificacion_id || n.tipoNotificacionId;
      const isCorrectType = typeIds.includes(typeId);
      const isActive = n.statusId === 'EST-01' || n.status?.toUpperCase() === 'ACTIVO' || n.statusId === 'ACTIVO';
      return isCorrectType && isActive && n.notificationEmail;
    });

    if (activeNotifs.length === 0) {
      // Fallback: búsqueda por nombre si no se encontró por ID técnico
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
      // Si hay activas, enviamos la primera (el backend se encargará de notificar al grupo configurado)
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
      'Tipo de Plan': docL.planType || 'PLAN NORMAL',
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

  const handleResolveIncident = (incidentId: string, action: 'confirm' | 'delete' | 'ignore') => {
    const incident = incidents.find(inc => inc.id === incidentId);
    if (!incident) return;

    if (action === 'ignore' && incident.code) {
        const newBrain = { ...aiBrain, [incident.code]: '*IGNORE*' };
        setAiBrain(newBrain);
        localStorage.setItem('m7_ai_brain_relations', JSON.stringify(newBrain));
        toast.success('Regla de IA guardada', { description: `El sistema ignorará silenciosamente esta ráfaga de basura.` });
    } else if (action === 'confirm') {
      const targetCode = cleanSkuM7(incident.suggestion || incident.code);
      
      // M7-FIX: Verificar si ya existe en el plan (incluyendo extras anteriores)
      const exists = groupedItems.find(it => 
        (it.articleId?.toUpperCase() === targetCode.toUpperCase()) || 
        (it.sku?.toUpperCase() === targetCode.toUpperCase())
      );

      if (!exists) {
        // ES UN ITEM EXTRA NUEVO
        const newExtra = {
          articleId: targetCode,
          sku: targetCode,
          ['articleName' as any]: `AUTO-CREATED ${targetCode}`,
          expectedQty: 0,
          count1: 0,
          countedQty: 0,
          unit: 'UND',
          id: `extra-${Date.now()}`,
          status: 'pending' as DocStatus
        } as unknown as DocumentLItem;

        setExtraItems(prev => [...prev, newExtra]);
        // Delay para asegurar que el estado se procese antes del barcode logic
        setTimeout(() => {
            processBarcode(targetCode);
            toast.success(`Artículo ${targetCode} integrado al plan.`);
        }, 100);
      } else {
        processBarcode(targetCode);
        toast.success(`Artículo ${targetCode} integrado al plan.`);
      }

      // M7 AI BRAIN - APRENDIZAJE: Vinculamos para siempre la basura (code) a su equivalente limpio o forzado (targetCode)
      // Solo si la ráfaga incidente era diferente a la conclusión forzada y existía.
      if (incident.code && incident.code !== targetCode) {
         const newBrain = { ...aiBrain, [incident.code]: targetCode };
         setAiBrain(newBrain);
         localStorage.setItem('m7_ai_brain_relations', JSON.stringify(newBrain));
         toast.success('M7 AI Memoria Actualizada', { description: `Ráfaga configurada para procesarse automáticamente en el futuro.` });
      }
    }

    setIncidents(prev => prev.filter(inc => inc.id !== incidentId));
  };

  const finalizeProcess = async (email: string) => {
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

    try {
      await onConfirm(finalItems, inventoryObservation, email);
      // M7 V18 FIX: Asegurar limpieza total de UI tras éxito
      setIsProcessing(false);
      setShowEmailInput(false);
      setShowConfirmDialog(false);
    } catch (e: any) {
      toast.error('Error al finalizar: ' + (e.message || 'Error desconocido'));
      setIsProcessing(false); // Desbloquear botón para reintentar o corregir
    }
  };

  const filteredItems = useMemo(() => {
    // 1. FILTRADO INICIAL (Fases y Búsqueda)
    let list: DocumentLItem[] = [];
    
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

    // 2. ORDENAMIENTO (Prioridad M7: Escaneo Reciente > Sort Manual)
    // El último pistoleado SIEMPRE debe estar arriba para eficiencia en tablet
    list.sort((a, b) => {
        // M7 V16 ULTRA-PRIORITY: El que tenga el timestamp más joven gana siempre
        const timeA = lastScannedAt[a.articleId] || 0;
        const timeB = lastScannedAt[b.articleId] || 0;

        // Si uno es más reciente que el otro, ponerlo de primero
        if (timeA !== timeB) return timeB - timeA;

        // Si ninguno tiene timestamp o son iguales, aplicamos el sort manual si existe
        if (sortConfig) {
            const aVal = (a as any)[sortConfig.key] || '';
            const bVal = (b as any)[sortConfig.key] || '';

            if (typeof aVal === 'number' && typeof bVal === 'number') {
              return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        }

        return 0;
    });

    return list;
  }, [groupedItems, tableSearch, validationAttempts, counts, mismatchIds, sortConfig, lastScannedAt]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === 'all') return 1;
    return Math.ceil(filteredItems.length / rowsPerPage);
  }, [filteredItems, rowsPerPage]);

  const paginatedItems = useMemo(() => {
    if (rowsPerPage === 'all') return filteredItems;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, currentPage, rowsPerPage]);

  // M7 V18 OPTIMIZATION: Evitar sort redundante dentro del render de la tabla
  const maxScanTimestamp = useMemo(() => {
    const values = Object.values(lastScannedAt);
    if (values.length === 0) return 0;
    return Math.max(...values);
  }, [lastScannedAt]);

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

  // M7 V17 FIX: Usar Number() explícito para evitar concatenación de strings en la suma total
  const totalUnits = Object.values(counts).reduce((a, b) => Number(a) + Number(b), 0);



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

      {/* HEADER — Fila 1 (móvil): Doc info + botón cerrar siempre visible */}
      <div className="bg-slate-900 text-white shrink-0 border-none">

        {/* Fila superior: identidad del doc + cerrar siempre accesible */}
        <div className="flex items-center gap-3 px-4 pt-2 pb-1">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 shadow-lg shrink-0">
            <Icons.Scan className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm md:text-lg font-black uppercase tracking-tight leading-none truncate">{docL.externalDocId}</h2>
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="text-[8px] text-slate-500 font-bold uppercase bg-slate-800 px-2 py-0.5 rounded border border-white/5">{docL.vehicleData}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${validationAttempts === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                {validationAttempts === 0 ? 'Fase 1: Conteo' : 'Fase 2: Novedades'}
              </span>
            </div>
          </div>
          {/* Contadores compactos */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <p className="text-lg font-black text-emerald-400 leading-none">{Object.keys(counts).length}</p>
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Items</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white leading-none">{groupedItems.length}</p>
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Plan</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white leading-none">{totalUnits}</p>
              <p className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">Uds</p>
            </div>
          </div>
          {/* Botón cancelar SIEMPRE visible */}
          <button
            onClick={onCancel}
            className="ml-1 shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all text-lg font-thin"
            title="Cancelar inventario"
          >
            &times;
          </button>
        </div>

        {/* Fila inferior: scanner + botón finalizar */}
        <div className="flex items-center gap-2 px-4 pb-2 pt-1">
          {/* SCANNER */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <form onSubmit={handleScan} className="relative group w-full">
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
            {lastScan && (
              <div
                key={lastScan.id}
                className={`w-full px-3 flex items-center justify-between gap-2 rounded-xl shadow-md shrink-0 animate-in slide-in-from-top-2 fade-in duration-300 ${
                  lastScan.status === 'success' ? 'bg-[#e0f2fe] border-l-4 border-blue-400' : 'bg-rose-100 border-l-4 border-rose-500'
                }`}
              >
                <span className={`text-[15px] md:text-[20px] font-black uppercase tracking-tighter truncate py-1 ${lastScan.status === 'success' ? 'text-blue-900' : 'text-rose-900'}`}>{lastScan.message}</span>
                {lastScan.qty !== undefined && (
                  <div className="flex flex-col items-center py-1 justify-center pl-3 border-l-2 border-white/40 shrink-0">
                    <span className={`text-[8px] font-extrabold uppercase leading-none opacity-60 ${lastScan.status === 'success' ? 'text-blue-900' : 'text-rose-900'}`}>Total</span>
                    <span className={`text-xl font-black leading-none ${lastScan.status === 'success' ? 'text-blue-700' : 'text-rose-700'}`}>{lastScan.qty}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botón finalizar/cerrar SIEMPRE visible */}
          <button
            onClick={handleValidationTrigger}
            disabled={isProcessing || Object.keys(counts).length === 0}
            className="shrink-0 px-5 py-2.5 bg-emerald-500 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-[0.1em] shadow-lg hover:bg-emerald-400 transition-all flex items-center gap-1.5 disabled:opacity-20 active:scale-95"
          >
            {isProcessing ? <Icons.Alert className="w-3 h-3 animate-spin" /> : <Icons.Signature className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{validationAttempts === 0 ? 'Finalizar' : 'Cerrar'}</span>
            <span className="sm:hidden">{validationAttempts === 0 ? 'OK' : 'X'}</span>
          </button>
        </div>
      </div>

      {/* DISEÑO RESPONSIVO M7: LADO A LADO EN DESKTOP, UNO SOBRE OTRO EN TABLET/MOBILE */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-white overflow-hidden h-[calc(100vh-250px)]">
        
        {/* TABLA 1: PLAN DE AUDITORÍA (IZQUIERDA / ARRIBA) - M7-MOD: Ocupa el 80% en LG para dar más espacio */}
        <div className="flex-1 lg:flex-[0.8] flex flex-col min-h-0 w-full overflow-hidden border-b-4 lg:border-b-0 lg:border-r-4 border-slate-100">
          <div className="bg-white flex flex-col h-full relative">
            <div className="px-4 py-2 border-b border-slate-50 bg-white flex items-center shrink-0 gap-4 overflow-x-auto z-30">
              {/* SEARCH INPUT */}
              <div className="relative flex-1 max-w-xs shrink-0 pl-1">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="FILTRAR PLAN..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl text-[9px] font-black uppercase outline-none focus:bg-white focus:border-emerald-500 transition-all placeholder:text-slate-400 text-slate-900"
                />
              </div>

              {/* XLS BUTTON */}
              <button onClick={exportToExcel} className="flex px-4 py-2.5 bg-emerald-500 text-slate-950 rounded-xl hover:bg-emerald-400 transition-all shadow-md items-center gap-2 shrink-0 font-black text-[9px] uppercase tracking-widest">
                <Icons.Excel className="w-3.5 h-3.5" /> XLS
              </button>

              {/* NOTAS DEL INVENTARIO */}
              <div className="flex-1 max-w-sm shrink-0">
                <textarea
                  value={inventoryObservation}
                  onChange={(e) => setInventoryObservation(e.target.value)}
                  placeholder="NOTAS GENERALES..."
                  className="w-full h-10 bg-slate-50 border border-transparent rounded-xl px-4 py-2 text-[9px] font-bold text-slate-900 outline-none focus:bg-white focus:border-emerald-500/50 transition-all resize-none placeholder:text-slate-300 uppercase leading-tight"
                />
              </div>
            </div>

            <div 
              ref={tableContainerRef}
              className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar"
            >
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[8px] sticky top-0 z-20 shadow-sm">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('articleId')}>Artículo / Referencia{getSortIndicator('articleId')}</th>
                    <th className="px-4 py-4 text-center">Auditado</th>
                    <th className="px-4 py-4 text-left">Notas Inventario</th>
                    <th className="px-4 py-4 text-right pr-6">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedItems.map(it => {
                    const currentCount = counts[it.articleId] || 0;
                    const isLatest = lastScan?.article?.id === it.articleId || lastScan?.article?.sku === it.articleId || 
                                     (lastScannedAt[it.articleId] && lastScannedAt[it.articleId] === maxScanTimestamp);

                    return (
                      <tr key={it.articleId} className={`hover:bg-slate-50 transition-all duration-500 font-bold 
                        ${validationAttempts === 1 ? 'bg-red-50/10' : ''} 
                        ${isLatest ? 'bg-[#dbeafe] text-blue-950 outline outline-[3px] outline-blue-400 scale-[1.01] shadow-lg relative z-10' : ''}
                      `}>
                        <td className="px-6 py-2 border-r border-slate-50">
                          <div className="flex flex-col">
                            <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest w-fit mb-0.5 ${ (it as any).isExtra ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                              { (it as any).isExtra ? 'EXTRA / SINCRO' : `ID: ${it.articleId}` }
                            </span>
                            <p className="font-extrabold text-slate-900 text-[10px] uppercase tracking-tight leading-tight truncate max-w-[350px]">
                               {(it as any).articleName || (masterArticulo.find(m => m.id === it.articleId || m.sku === it.articleId) as any)?.name || it.articleId || 'SIN DESCRIPCIÓN'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center border-r border-slate-50">
                          <div className={`inline-flex items-center justify-center min-w-[60px] h-9 rounded-xl text-lg font-black shadow-sm transition-all ${currentCount > 0 ? (validationAttempts === 1 ? 'bg-slate-900 text-white' : 'bg-emerald-500 text-white') : 'bg-slate-100 text-slate-300'}`}>
                            {currentCount}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-left border-r border-slate-50">
                          <input
                            type="text"
                            value={itemObservations[it.articleId] || ''}
                            onChange={(e) => setItemObservations(prev => ({ ...prev, [it.articleId]: e.target.value }))}
                            placeholder="NOTAS..."
                            className="w-full bg-slate-50/50 border border-slate-100 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-600 outline-none focus:bg-white focus:border-emerald-500 transition-all uppercase"
                          />
                        </td>
                        <td className="px-4 py-2 text-right pr-6 flex justify-end items-center h-full gap-2">
                          <button 
                            onClick={() => handleOpenTransaction(it.articleId, 'CONVERT')} 
                            className="w-9 h-9 bg-emerald-600 text-white rounded-xl shadow-lg flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all border border-emerald-400/50 shadow-emerald-500/20"
                            title="DESGLOSAR / CONVERTIR"
                          >
                            <Icons.Maximize2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleOpenTransaction(it.articleId, 'REVERSE')} 
                            className="w-9 h-9 bg-amber-600 text-white rounded-xl shadow-lg flex items-center justify-center hover:bg-amber-500 active:scale-95 transition-all border border-amber-400/50 shadow-amber-500/20"
                            title="AGRUPAR / REVERSAR"
                          >
                            <Icons.Minimize2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleSubtract(it.articleId)} 
                            disabled={currentCount === 0} 
                            className="w-9 h-9 bg-red-600 text-white rounded-xl shadow-lg disabled:opacity-20 flex items-center justify-center font-black text-sm hover:bg-red-700 active:scale-95 transition-all border border-red-500/50 ml-2"
                          >
                            -1
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
                  <option value={50}>50 líneas</option>
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

        {/* TABLA 2: INCIDENCIAS / NOVEDADES (DERECHA / ABAJO) - M7-MOD: Ancho reducido para priorizar el plan */}
        <div className="w-full lg:w-[320px] h-[350px] lg:h-auto flex flex-col bg-slate-50 overflow-hidden shrink-0 border-t-8 lg:border-t-0 border-slate-100 shadow-inner lg:shadow-none">
          <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 text-amber-500 rounded-xl flex items-center justify-center shadow-md">
                <Icons.Alert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-tighter">
                  Incidencias {incidents.length > 0 && <span className="text-amber-500 ml-1">({incidents.length})</span>}
                </h4>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Captura de ráfagas</p>
              </div>
            </div>
            {incidents.length > 0 && (
              <button 
                onClick={() => setShowClearIncidentsDialog(true)} 
                className="text-[9px] font-black text-red-500 uppercase tracking-widest"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 bg-slate-50/50">
            {incidents.length > 0 ? (
              <div className="space-y-3">
                {incidents.map(inc => (
                  <div key={inc.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group transition-all hover:border-amber-400">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                      <span className="text-[8px] text-slate-400 font-extrabold tracking-widest uppercase">{inc.timestamp}</span>
                      <Icons.Alert className="w-3 h-3 text-amber-500" />
                    </div>
                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase shadow-md truncate flex-1 flex items-center justify-between">
                          <span>{inc.code}</span>
                          {(inc.qty || 1) > 1 && (
                              <span className="bg-amber-500 text-slate-900 px-1.5 py-0.5 rounded text-[8px] tracking-widest leading-none">
                                  x{inc.qty}
                              </span>
                          )}
                        </span>
                        <button
                         onClick={() => handleResolveIncident(inc.id, 'delete')}
                         className="p-2 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
                        >
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">
                        <div className="flex items-start gap-2">
                          <Icons.Brain className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-[10px] uppercase font-bold text-amber-800 leading-tight">
                            {inc.note}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full">
                        <button
                          onClick={() => handleResolveIncident(inc.id, 'ignore')}
                          className="w-1/3 py-3 bg-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all shadow-sm active:scale-95"
                          title="Enseñar a la IA a ignorar permanentemente esta ráfaga"
                        >
                          Basura
                        </button>
                        <button
                          onClick={() => handleResolveIncident(inc.id, 'confirm')}
                          className="w-2/3 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg active:scale-95 shadow-blue-600/20"
                        >
                          {inc.suggestion ? `Sugerir ${inc.suggestion}` : 'Forzar como Extra'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-20 opacity-20 grayscale">
                <Icons.Check className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Sin incidencias</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DIÁLOGO DE LIMPIAR INCIDENCIAS M7 */}
      {showClearIncidentsDialog && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 text-center space-y-6 shadow-2xl border border-white/5">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
              <Icons.Trash className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">¿Limpiar incidencias?</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">Se eliminará el registro actual de ráfagas desconocidas visualizadas en pantalla.</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setIncidents([]);
                  setShowClearIncidentsDialog(false);
                }}
                className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-rose-400 transition-all active:scale-95"
              >
                Sí, limpiar registro
              </button>
              <button 
                onClick={() => setShowClearIncidentsDialog(false)} 
                className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${unitTransaction.type === 'CONVERT' ? 'from-emerald-500 to-teal-500' : 'from-amber-500 to-orange-500'}`}></div>
              
              <div className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center shadow-lg mb-6 ${unitTransaction.type === 'CONVERT' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                 {unitTransaction.type === 'CONVERT' ? <Icons.Maximize2 className="w-8 h-8" /> : <Icons.Minimize2 className="w-8 h-8" />}
              </div>

              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">
                 {unitTransaction.type === 'CONVERT' ? 'Desglosar / Convertir' : 'Agrupar / Reversar'}
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
