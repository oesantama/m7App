
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { DocumentL, User, DocStatus, MasterRecord, Invoice, DocumentLItem, UserRole } from '../types';
import { api } from '../services/api';
import ConsultasDocumentosL from './ConsultasDocumentosL';
import * as XLSX from 'xlsx';

// Extendemos DocumentL localmente para manejar el estado de duplicado en la UI
interface PreviewDocument extends DocumentL {
  isDuplicate?: boolean;
  consolidatedItems?: any[];
}

interface SyncError {
  title: string;
  message: string;
  duplicates: { placa: string; carga: string }[];
}

interface GestionDocumentosLProps {
  documents: DocumentL[];
  invoices: Invoice[];
  user: User;
  masterEstados: MasterRecord[];
  onDocumentsChange: (docs: DocumentL[]) => void;
}

const GestionDocumentosL: React.FC<GestionDocumentosLProps> = ({ documents, invoices, user, masterEstados, onDocumentsChange }) => {
  const [activeTab, setActiveTab] = useState<'cargue' | 'consultas'>('cargue');
  const [activeModalTab, setActiveModalTab] = useState<'reception' | 'audit'>('reception');
  const [preview, setPreview] = useState<{ fileName: string; mapped: PreviewDocument[]; type: string } | null>(null);
  const [selectedPendingDoc, setSelectedPendingDoc] = useState<DocumentL | null>(null);
  const [syncError, setSyncError] = useState<SyncError | null>(null); // Búsqueda y Paginación
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState<number | 'all'>(6);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState<number | 'all'>(5);
  const [detectedHeaders, setDetectedHeaders] = useState<{ placa: string; carga: string } | null>(null);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  // Estados para Modal de Detalle (Recepción/Auditoría)
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize, setModalPageSize] = useState<number | 'all'>(10);

  // Utilidad para exportar a Excel
  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "M7_Datos");
    XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
  };

  const formatExcelDate = (val: any): string | null => {
    if (!val) return null;
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0]; // Formato YYYY-MM-DD para SQL
    }
    const str = String(val).trim();
    if (!str || str.toUpperCase() === 'S/I' || str.toUpperCase() === 'SIN INFORMACIÓN') return null;
    return str;
  };

  const pendingDocs = useMemo(() => {
    // Normalización y DEDUPLICACIÓN (M7 Safety)
    const uniqueMap = new Map();
    documents.forEach(d => {
      // Normalizar campos para la llave única
      const extId = d.externalDocId || (d as any).external_doc_id || '';
      const plate = d.vehicleData || (d as any).vehicle_plate || (d as any).plate || '';
      const key = `${extId}-${plate}`.toLowerCase();
      
      const normalized = {
        ...d,
        externalDocId: extId,
        vehicleData: plate,
        status: d.status || d.statusId || (d as any).status_id,
        codplan: d.codplan || (d as any).cod_plan || (d as any).un_orig
      };

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, normalized);
      }
    });

    const list = Array.from(uniqueMap.values()).filter((d: any) => 
      (d.statusId === 'EST-03' || d.status === DocStatus.PENDING || d.status === 'Pendiente') && 
      d.status !== 'ELIMINADO'
    );
    
    if (!searchTerm) return list;
    return list.filter(d => 
      (d.externalDocId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.vehicleData || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.city || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [documents, searchTerm]);

  const handleDeleteDocument = (docId: string) => {
    setDocToDelete(docId);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    
    try {
        const res = await api.deleteDocument(docToDelete, user.name);
        if (res.success) {
            toast.success("Documento eliminado correctamente");
            if (onDocumentsChange) onDocumentsChange(documents.filter(d => d.id !== docToDelete));
            setDocToDelete(null);
        } else {
            toast.error("Error al eliminar: " + (res.error || "Desconocido"));
        }
    } catch (err) {
        toast.error("Error de conexión al eliminar");
    }
  };

  const isAuthorizedToDelete = useMemo(() => {
    if (user.role === UserRole.ADMIN || user.roleId === 'ROL-01') return true;
    return user.permissions?.some(p => 
      (p.module === 'inventory' || p.module === 'routing' || (p.module as any) === 'masterPaginas') && 
      p.actions.includes('delete')
    );
  }, [user]);

  const paginatedPending = useMemo(() => {
    if (pendingPageSize === 'all') return pendingDocs;
    const start = (pendingPage - 1) * pendingPageSize;
    return pendingDocs.slice(start, start + pendingPageSize);
  }, [pendingDocs, pendingPage, pendingPageSize]);

  const totalPendingPages = pendingPageSize === 'all' ? 1 : Math.ceil(pendingDocs.length / pendingPageSize);

  const sortedItems = useMemo(() => {
    let items = [...(selectedPendingDoc?.items || [])];
    if (sortConfig) {
      items.sort((a, b) => {
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
    return items;
  }, [selectedPendingDoc, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // USO DE raw: false PARA OBTENER EL TEXTO FORMATEADO (Crucial para "86.000" -> "86.000")
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];
        
        if (!rawData || rawData.length < 1) return;

        let headerRowIndex = -1;
        // Priorizar detección de cabeceras
        const requiredTerms = ['placa', 'carga', 'articulo', 'item', 'un orig', 'un', 'cant env'];
        
        for (let i = 0; i < Math.min(rawData.length, 50); i++) {
          const row = (rawData[i] || []).map(c => String(c || '').toLowerCase().trim());
          const matches = row.filter(cell => requiredTerms.some(term => cell === term || cell.includes(term))).length;
          if (matches >= 3) { headerRowIndex = i; break; }
        }

        if (headerRowIndex === -1) {
          setSyncError({
            title: "M7 FORMAT ERROR",
            message: "No se detectó la fila de títulos. Verifique el formato del archivo Excel.",
            duplicates: []
          });
          return;
        }

        const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
        
        // FUNCIÓN DE BÚSQUEDA MEJORADA: PRIORIDAD EXACTA
        const findIdx = (terms: string[]) => {
           // Paso 1: Búsqueda EXACTA
           const exactIdx = headers.findIndex(h => {
             if (!h) return false;
             return terms.some(t => h.toLowerCase().trim() === t.toLowerCase().trim());
           });
           if (exactIdx !== -1) return exactIdx;

           // Paso 2: Búsqueda PARCIAL (Solo si falla la exacta)
           return headers.findIndex(h => {
             if (!h) return false;
             return terms.some(t => h.toLowerCase().trim().includes(t.toLowerCase().trim()));
           });
        };

        const iCodPlan = findIdx(type === 'Plan Normal' ? ['un orig', 'cod plan', 'codplan'] : ['un', 'cod plan', 'codplan']);
        
        // Detección Exacta para Validación Cruzada (Solicitud Usuario)
        const iExactUnOrig = headers.findIndex(h => h.toLowerCase().trim() === 'un orig');
        const iExactUn = headers.findIndex(h => h.toLowerCase().trim() === 'un');

        const iPlaca = findIdx(['placa', 'vehículo', 'vehiculo', 'plate']);
        // Quitamos "carga" de términos genéricos que pueden coincidir con "carga wms" si queremos ser estrictos, 
        // pero con la prioridad exacta "Carga" ganará a "Carga WMS".
        const iCarga = findIdx(['carga', 'nº carga', 'n de carga', 'documento de transporte', 'shipment', 'viaje', 'trip']);
        
        // Guardar nombres reales de columnas detectadas para DEBUG
        const headerPlaca = iPlaca !== -1 ? headers[iPlaca] : 'NO DETECTADA';
        const headerCarga = iCarga !== -1 ? headers[iCarga] : 'NO DETECTADA';
        setDetectedHeaders({ placa: headerPlaca, carga: headerCarga });

        // VALIDACIÓN CRÍTICA DE COLUMNAS
        if (iPlaca === -1 || iCarga === -1) {
             setSyncError({
               title: "ERROR DE FORMATO M7",
               message: `No se pudieron identificar las columnas obligatorias: ${iPlaca === -1 ? 'PLACA' : ''} ${iCarga === -1 ? 'CARGA' : ''}. Por favor verifique los títulos en la fila de cabecera.`,
               duplicates: []
             });
             return;
        }

        // VALIDACIÓN ESTRICTA POR TIPO DE PLAN (Solicitud Usuario)
        if (type === 'Plan Normal') {
          if (iExactUnOrig === -1) {
            setSyncError({
              title: "FORMATO INCORRECTO: PLAN NORMAL",
              message: "Usted seleccionó PLAN NORMAL y el documento NO coincide con lo requerido para el cargue.",
              duplicates: []
            });
            return;
          }
        }

        if (type === 'Plan R') {
          // Si tiene 'UN ORIG', es un Plan Normal, debe ser bloqueado en la opción de Plan R
          if (iExactUnOrig !== -1) {
            setSyncError({
              title: "FORMATO CRUZADO DETECTADO",
              message: "Usted seleccionó PLAN R y el documento NO coincide con lo requerido para el cargue (Se detectó formato PLAN NORMAL).",
              duplicates: []
            });
            return;
          }
          
          // Debe tener la columna 'UN' exacta
          if (iExactUn === -1) {
            setSyncError({
              title: "FORMATO INCORRECTO: PLAN R",
              message: "Usted seleccionó PLAN R y el documento NO coincide con lo requerido para el cargue.",
              duplicates: []
            });
            return;
          }
        }

        const isPlanR = type === 'Plan R';

        // Lógica Específica por Tipo de Plan
        const iFechaEnvio = isPlanR 
          ? -1 // Plan R no tiene fecha demanda, se usa fecha actual
          : findIdx(['f demanda', 'f. demanda', 'fecha demanda', 'ship date']);

        const iObs = findIdx(isPlanR ? ['comentarios', 'comentario'] : ['message', 'mensaje']);
        
        // Mapeos comunes
        const iArticulo = findIdx(['articulo', 'item', 'codigo', 'código', 'cod. art', 'sku']);
        const iCant = findIdx(['cant env', 'cantidad', 'qty', 'cantidad esperada']);
        
        // Lógica de Mapeo de Volúmenes (M7 RE-FIX)
        // Para Plan R: "Volumen" es el número directo (m3).
        // Para Plan Normal: "Vol. Total" es el número, "Volumen" es la unidad (CM3/MT3).
        const iVolTotal = isPlanR 
          ? findIdx(['volumen', 'total volume', 'volumen total'])
          : findIdx(['vol. total', 'total volume', 'volumen total']);
        
        const iVolUnit = isPlanR ? -1 : findIdx(['volumen']);
        const iVolUnidad = findIdx(['volumen unitario']); 
        
        const iUnd = findIdx(['um', 'und', 'unid', 'unidad']);
        const iFactura = findIdx(['remision/transferencia', 'factura', 'remision', 'documento', 'invoice']);
        const iCiudad = findIdx(['destino', 'ciudad', 'city']);
        const iDir = findIdx(['dirección 1', 'f_dirección', 'dirección', 'direccion', 'address', 'dir 1']);
        const iPed = findIdx(['nº ped', 'pedido', 'order']);
        const iPeso = findIdx(['peso', 'weight', 'kgs', 'kilogramos']);
        
        // [NEW] Campos requeridos en detalle con discriminación por Plan (Solicitud Usuario)
        const iUnCodeDetail = isPlanR 
          ? findIdx(['un']) 
          : findIdx(['un orig']);

        const iClientRefDetail = isPlanR 
          ? findIdx(['cliente']) 
          : findIdx(['envío', 'envio']);
        
        const dataRows = rawData.slice(headerRowIndex + 1);
        const docsMap = new Map<string, { codplan: string, placa: string, carga: string, city: string, address: string, deliveryDate: string | null, items: any[], consolidatedItems: any[] }>();

        dataRows.forEach((row) => {
          if (!row || row.length === 0 || row.every(c => c === '')) return;
          const val = (idx: number) => idx !== -1 ? String(row[idx] || '').trim() : '';

          const placa = val(iPlaca);
          const carga = val(iCarga);
          if (!placa && !carga) return;

          const groupKey = `${placa}-${carga}`; // Sin defaults 'S/A' o 'S/C' para forzar datos reales

          if (!docsMap.has(groupKey)) {
            docsMap.set(groupKey, { 
              codplan: val(iCodPlan) || groupKey,
              placa: placa,
              carga: carga,
              city: val(iCiudad) || 'S/D',
              address: val(iDir) || 'S/D',
              deliveryDate: isPlanR ? new Date().toISOString().split('T')[0] : (formatExcelDate(row[iFechaEnvio]) || ''), // Plan R usa fecha actual
              items: [],
              consolidatedItems: [] 
            });
          }
          
          const group = docsMap.get(groupKey)!;
          const sku = val(iArticulo);
          if (sku) {
             const rawVol = val(iVolTotal);
             
             // Lógica de Parseo Númerico (M7 FIX)
             const parseNumberM7 = (raw: string, isPlanR: boolean, columnType: 'qty' | 'vol' | 'weight') => {
                 if (!raw || raw.trim() === '') return 0;
                 let val = raw.trim();
                 
                 // REGLA M7: PESO
                 if (columnType === 'weight') {
                     if (!isPlanR) return 0; // Plan Normal: Peso siempre 0
                     // Plan R: Punto (.) es separador de miles
                     val = val.replace(/[.]/g, ''); 
                     return parseFloat(val) || 0;
                 }

                 // REGLA M7: CANTIDADES Y VOLÚMENES
                 if (columnType === 'qty' || columnType === 'vol') {
                     if (!isPlanR) {
                         // Plan Normal: Coma (,) es decimal
                         val = val.replace(/,/g, '.');
                         return parseFloat(val) || 0;
                     } else {
                         // Plan R: Punto (.) es decimal
                         return parseFloat(val) || 0;
                     }
                 }

                 return 0;
             };

            const qty = parseNumberM7(val(iCant), isPlanR, 'qty');
            const pesoVal = isPlanR ? parseNumberM7(val(iPeso), true, 'weight') : 0;
            let volVal = parseNumberM7(val(iVolTotal), isPlanR, 'vol');
            
            // CONVERSIÓN DE UNIDADES (M7 SMART DETECT)
            if (!isPlanR && iVolUnit !== -1) {
                const vUnit = val(iVolUnit).toUpperCase().trim();
                if (vUnit === 'CM3' || vUnit === 'CMT3') {
                    volVal = volVal / 1000000;
                }
            } else if (volVal > 1000) {
                // Fallback detect
                volVal = volVal / 1000000;
            }

            // 1. Mapeo para RECEPCIÓN (Detalle Logístico / Conductor)
            group.items.push({
              articleId: sku,
              expectedQty: qty,
              receivedQty: 0, // Inicia en 0
              unit: val(iUnd),
              volume: String(volVal),
              unitVolume: val(iVolUnidad),
              invoice: val(iFactura),
              city: val(iCiudad),
              address: val(iDir),
              driverNote: val(iObs), // Observación Excel -> Nota Conductor
              orderNumber: val(iPed),
              peso: pesoVal,
              unCode: val(iUnCodeDetail),      // [NEW]
              clientRef: val(iClientRefDetail) // [NEW]
            });

            // 2. Mapeo para AUDITORÍA (Consolidado Inventario)
            group.consolidatedItems.push({
              articleId: sku,
              expectedQty: qty,
              count1: 0,
              count2: 0,
              pickedQty: 0, // Default 0
              dispatchedQty: 0, // Default 0
              inventoryObservation: val(iObs) // Observación Excel -> Obs Inventario
            });
          }
        });

        // VALIDACIÓN DE DUPLICADOS: Placa y Carga (Case Insensitive)
        const mapped: PreviewDocument[] = Array.from(docsMap.entries()).map(([key, data]) => {
          const isDuplicate = documents.some(d => {
            const dCarga = String(d.externalDocId || (d as any).external_doc_id || '').trim().toLowerCase();
            const dPlaca = String(d.vehicleData || (d as any).vehicle_plate || (d as any).plate || '').trim().toLowerCase();
            const currCarga = String(data.carga || '').trim().toLowerCase();
            const currPlaca = String(data.placa || '').trim().toLowerCase();
            return dCarga === currCarga && dPlaca === currPlaca;
          });

          return {
            id: `doc-${data.placa}-${data.carga}`,
            clientId: user.clientId,
            externalDocId: data.carga,
            vehicleData: data.placa,
            codplan: data.codplan,
            deliveryDate: data.deliveryDate || undefined,
            city: data.city,
            address: data.address,
            planType: type as any,
            inventoryNotes: `M7 Cargue: ${data.items.length} líneas`,
            items: data.items,
            consolidatedItems: data.consolidatedItems,
            createdAt: new Date().toISOString(),
            createdBy: user.name,
            updatedAt: new Date().toISOString(),
            updatedBy: user.name,
            status: DocStatus.PENDING,
            statusId: 'EST-03',
            isDuplicate: isDuplicate
          };
        });

        setPreview({ fileName: file.name, mapped, type });
        setPreviewPage(1);
        setPreviewSearch('');
      } catch (err) {
        setSyncError({
          title: "M7 ERROR",
          message: "Fallo crítico en lectura de Excel.",
          duplicates: []
        });
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredPreviewItems = useMemo(() => {
    if (!preview) return [];
    const allItems = preview.mapped.flatMap(doc => doc.items.map(it => ({ ...it, docId: doc.externalDocId, docVehicle: doc.vehicleData, isDuplicate: doc.isDuplicate })));
    if (!previewSearch) return allItems;
    return allItems.filter(it => 
      it.articleId.toLowerCase().includes(previewSearch.toLowerCase()) ||
      it.docId.toLowerCase().includes(previewSearch.toLowerCase()) ||
      it.docVehicle.toLowerCase().includes(previewSearch.toLowerCase())
    );
  }, [preview, previewSearch]);

  const paginatedPreviewItems = useMemo(() => {
    if (previewPageSize === 'all') return filteredPreviewItems;
    const start = (previewPage - 1) * previewPageSize;
    return filteredPreviewItems.slice(start, start + previewPageSize);
  }, [filteredPreviewItems, previewPage, previewPageSize]);

  const totalPreviewPages = previewPageSize === 'all' ? 1 : Math.ceil(filteredPreviewItems.length / previewPageSize);

  const handleSync = () => {
    if (!preview) return;
    
    // Restaurada lógica de BLOQUEO de duplicados a petición del usuario
    // Separamos nuevos de duplicados
    const newDocs = preview.mapped.filter(d => !d.isDuplicate);
    const duplicatedDocs = preview.mapped.filter(d => d.isDuplicate);

    if (newDocs.length > 0) {
      // ENVIAR SOLO NUEVOS
      api.bulkCreateDocuments({ documents: newDocs }).then(res => {
        if (res.success) {
            onDocumentsChange([...newDocs, ...documents]);
           toast.success(`Cargados ${newDocs.length} documentos nuevos exitosamente.`);
           setPreview(null);
        } else {
           toast.error(`Error del servidor: ${res.error || 'Desconocido'}`);
        }
      }).catch((err) => {
         console.error('[M7-SYNC] Error:', err);
         toast.error("Error al sincronizar con el servidor. Verifique su conexión.");
      });

      // Si había duplicados, avisamos pero permitimos el proceso de los nuevos
      if (duplicatedDocs.length > 0) {
        setSyncError({
          title: "Sincronización Parcial",
          message: `Se cargaron ${newDocs.length} documentos nuevos. Sin embargo, ${duplicatedDocs.length} registros fueron omitidos porque YA EXISTEN en el sistema (Placa/Carga coincidieron).`,
          duplicates: duplicatedDocs.map(d => ({ placa: d.vehicleData || 'S/I', carga: d.externalDocId }))
        });
      }
    } else {
      // Si todos son duplicados, bloqueamos totalmente y mostramos detalle
      setSyncError({
        title: "Bloqueo de Sincronización",
        message: "No se guardó nada. Todos los documentos del archivo ya existen en el sistema. Revise si está intentando cargar el mismo archivo.",
        duplicates: duplicatedDocs.map(d => ({ placa: d.vehicleData || 'S/I', carga: d.externalDocId }))
      });
    }
  };

  // Lógica de Paginación y Búsqueda para MODAL
  const filteredModalItems = useMemo(() => {
    if (!selectedPendingDoc) return [];
    const items = activeModalTab === 'reception' 
      ? (selectedPendingDoc.items || []) 
      : ((selectedPendingDoc as any).consolidatedItems || []);
    
    if (!modalSearch) return items;
    return items.filter((it: any) => 
      String(it.articleId || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      String(it.orderNumber || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      String(it.invoice || '').toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [selectedPendingDoc, activeModalTab, modalSearch]);

  const paginatedModalItems = useMemo(() => {
    if (modalPageSize === 'all') return filteredModalItems;
    const start = (modalPage - 1) * modalPageSize;
    return filteredModalItems.slice(start, start + modalPageSize);
  }, [filteredModalItems, modalPage, modalPageSize]);

  const totalModalPages = modalPageSize === 'all' ? 1 : Math.ceil(filteredModalItems.length / modalPageSize);

  // Componente Reutilizable de Controles de Tabla
  const TableControls = ({ 
    searchValue, 
    onSearchChange, 
    pageSize, 
    onPageSizeChange, 
    placeholder = "BUSCAR..." 
  }: any) => (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50 p-4 rounded-3xl border border-slate-100 shadow-sm transition-all hover:bg-slate-50">
      <div className="bg-white h-10 px-4 rounded-xl flex items-center gap-3 w-full md:w-80 shadow-inner border border-slate-100 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <Icons.Search className="w-3 h-3 text-slate-300" />
        <input 
          type="text" 
          placeholder={placeholder} 
          value={searchValue} 
          onChange={(e) => {
            onSearchChange(e.target.value);
            // Reset page on search
          }} 
          className="bg-transparent border-none outline-none font-black text-[9px] uppercase w-full text-slate-600 placeholder:text-slate-300" 
        />
      </div>
      <div className="flex items-center gap-4 shrink-0 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Mostrar:</span>
        <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-100 shadow-sm">
          {[5, 10, 20, 50, 'all'].map((size) => (
            <button
              key={size}
              onClick={() => onPageSizeChange(size)}
              className={`px-3 py-1 rounded-md text-[8px] font-black uppercase transition-all whitespace-nowrap ${pageSize === size ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}
            >
              {size === 'all' ? 'Todos' : size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

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
                    <div className="flex flex-col gap-6">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] shrink-0 px-2">Pendientes por Auditoría ({pendingDocs.length})</h4>
                       <TableControls 
                         searchValue={searchTerm} 
                         onSearchChange={(val:string) => {setSearchTerm(val); setPendingPage(1);}}
                         pageSize={pendingPageSize}
                         onPageSizeChange={(size:any) => {setPendingPageSize(size); setPendingPage(1);}}
                         placeholder="BUSCAR EN PENDIENTES..."
                       />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {paginatedPending.map(doc => (
                        <div key={doc.id} className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col group hover:border-emerald-500 transition-all">
                            <div className="flex justify-between items-start mb-6">
                             <div className={`px-6 py-2.5 rounded-2xl text-[13px] font-black uppercase tracking-[0.1em] shadow-lg ${doc.planType === 'Plan R' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>{doc.planType}</div>
                              <div className="flex gap-2">
                                {isAuthorizedToDelete && (
                                  <button onClick={()=>handleDeleteDocument(doc.id)} className="w-10 h-10 bg-white text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-lg active:scale-90 border border-slate-100" title="Eliminar Documento"><Icons.Trash /></button>
                                )}
                                <button onClick={()=>setSelectedPendingDoc(doc)} className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-emerald-500 transition-all shadow-lg active:scale-90"><Icons.Eye /></button>
                              </div>
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
                <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                    <div className="bg-slate-950 px-6 py-4 text-white flex justify-between items-center shrink-0">
                       <div className="flex items-center gap-6">
                         <div className={`px-10 py-4 rounded-2xl text-[14px] font-black uppercase tracking-[0.2em] shadow-2xl ${preview.type === 'Plan R' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{preview.type}</div>
                         <div>
                           <h4 className="font-black uppercase text-lg tracking-tighter leading-none">Pre-Validación M7 <span className="bg-white text-slate-900 px-2 rounded text-[9px]">v1.0.4-FIX</span></h4>
                           <div className="flex gap-4 items-center mt-1">
                              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{preview.fileName}</p>
                              <div className="h-4 w-[1px] bg-slate-800"></div>
                              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Total Unidades: {preview.mapped.reduce((acc, doc) => acc + doc.items.reduce((sum, it) => sum + (Number(it.expectedQty) || 0), 0), 0).toLocaleString()}</p>
                           </div>
                         </div>
                       </div>
                      <div className="flex items-center gap-3">
                         <button onClick={() => exportToExcel(filteredPreviewItems, "M7_Prevalidacion")} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all"><Icons.Excel className="w-4 h-4" /></button>
                         <button onClick={()=>setPreview(null)} className="w-8 h-8 rounded-full hover:bg-red-500 transition-all flex items-center justify-center text-xl font-thin">×</button>
                      </div>
                   </div>
                    <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
                       <TableControls 
                         searchValue={previewSearch} 
                         onSearchChange={(val:string) => {setPreviewSearch(val); setPreviewPage(1);}}
                         pageSize={previewPageSize}
                         onPageSizeChange={(size:any) => {setPreviewPageSize(size); setPreviewPage(1);}}
                         placeholder="BUSCAR EN PRE-VALIDACIÓN (SKU, CARGA, PLACA)..."
                       />

                       {preview.mapped.some(d => d.isDuplicate) && (
                         <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-xl space-y-4">
                           <div className="flex items-start gap-4">
                             <Icons.Alert className="text-amber-500 w-6 h-6 mt-1" />
                             <div>
                               <h4 className="text-sm font-black text-amber-800 uppercase tracking-wide">Conflicto de Duplicidad Detectado</h4>
                               <p className="text-[10px] font-bold text-amber-700/80 uppercase mt-1">SISTEMA M7: Los siguientes documentos ya existen en base de datos:</p>
                             </div>
                           </div>
                           <div className="bg-white/50 p-4 rounded-xl border border-amber-200/50 max-h-32 overflow-y-auto">
                              <table className="w-full text-left text-[9px]">
                                 <thead className="text-amber-900/50 uppercase"><tr><th>Placa Leída</th><th>Carga Leída</th></tr></thead>
                                 <tbody className="font-black text-amber-900">
                                   {preview.mapped.filter(d => d.isDuplicate).map((d, i) => (
                                     <tr key={i}>
                                       <td className="py-1">{d.vehicleData}</td>
                                       <td className="py-1">{d.externalDocId}</td>
                                     </tr>
                                   ))}
                                 </tbody>
                              </table>
                           </div>
                           <p className="text-[9px] font-bold text-amber-600 italic">Verifique que no esté intentando subir un archivo ya procesado.</p>
                         </div>
                       )}

                       {/* INFO DE MAPEO DE COLUMNAS COMPACTA */}
                       {detectedHeaders && (
                          <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Diagnóstico de Lectura</span>
                             <div className="flex gap-3 text-[8px]">
                                <span className="text-slate-500 font-bold">Placa: <span className="text-slate-900 font-black">{detectedHeaders.placa}</span></span>
                                <span className="text-slate-500 font-bold">Carga: <span className="text-slate-900 font-black">{detectedHeaders.carga}</span></span>
                             </div>
                          </div>
                       )}

                       <div className="bg-slate-50 rounded-[1.5rem] overflow-hidden border border-slate-200 shadow-sm">
                         <div className="overflow-x-auto">
                           <table className="w-full text-left text-[9px] min-w-[1400px]">
                             <thead className="bg-slate-900 text-white font-black uppercase tracking-widest sticky top-0 z-10">
                               <tr>
                                 <th className="px-4 py-3">Documento / Placa</th>
                                 <th className="px-4 py-3">Articulo</th>
                                 <th className="px-4 py-3 text-center">Cant.</th>
                                 <th className="px-4 py-3">Nº Ped</th>
                                 <th className="px-4 py-3">Factura</th>
                                 <th className="px-4 py-3">UM</th>
                                 <th className="px-4 py-3">Vol. Total</th>
                                 <th className="px-4 py-3 text-center">Peso</th>
                                 <th className="px-4 py-3">Ciudad</th>
                                 <th className="px-4 py-3">Dirección</th>
                                 <th className="px-4 py-3 text-center">Validación</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                               {paginatedPreviewItems.map((it: any, idx) => (
                                 <tr key={idx} className={`hover:bg-white transition-all font-bold ${it.isDuplicate ? 'bg-red-50/50 opacity-60' : 'text-slate-600'}`}>
                                   <td className="px-4 py-2 font-black text-slate-900 uppercase whitespace-nowrap">{it.docId} <span className="text-slate-300 mx-1">|</span> {it.docVehicle}</td>
                                   <td className="px-4 py-2 uppercase whitespace-nowrap">{it.articleId}</td>
                                   <td className="px-4 py-2 text-center font-black">{it.expectedQty}</td>
                                   <td className="px-4 py-2 uppercase text-emerald-600 whitespace-nowrap">{it.orderNumber || 'S/I'}</td>
                                   <td className="px-4 py-2 uppercase text-slate-500 whitespace-nowrap">{it.invoice || 'S/I'}</td>
                                   <td className="px-4 py-2 text-blue-600 font-black">{it.unit || 'und'}</td>
                                   <td className="px-4 py-2">{it.volume || '0'}</td>
                                   <td className="px-4 py-2 text-center text-orange-600 font-black">{it.peso || '0'}</td>
                                   <td className="px-4 py-2 uppercase max-w-[100px] truncate" title={it.city}>{it.city || '-'}</td>
                                   <td className="px-4 py-2 uppercase max-w-[150px] truncate" title={it.address}>{it.address || '-'}</td>
                                   <td className="px-4 py-2 text-center">
                                     {it.isDuplicate ? (
                                       <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest">YA EXISTE</span>
                                     ) : (
                                       <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest">NUEVO</span>
                                     )}
                                   </td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </div>
                       </div>
                      {totalPreviewPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-4">
                           <button disabled={previewPage === 1} onClick={()=>setPreviewPage(p=>p-1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight className="rotate-180" /></button>
                           <span className="text-[10px] font-black uppercase">Pág {previewPage} de {totalPreviewPages}</span>
                           <button disabled={previewPage >= totalPreviewPages} onClick={()=>setPreviewPage(p=>p+1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight /></button>
                        </div>
                      )}
                   </div>
                   <div className="p-4 border-t bg-slate-50 flex gap-4 shrink-0">
                      <button onClick={()=>setPreview(null)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-[9px] uppercase tracking-[0.2em] hover:bg-red-700 transition-all">Anular</button>
                      <button onClick={handleSync} className="flex-[2] py-3 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-[0.3em] hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 active:scale-95">Sincronizar</button>
                   </div>
                 </div>
               )}
            </div>
          ) : (
            <ConsultasDocumentosL documents={documents} invoices={invoices} user={user} masterEstados={masterEstados} />
          )}
        </div>
      </div>

      {/* MODAL DE ERROR PREMIUM M7 */}
      {syncError && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 md:p-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] md:rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/5">
               <div className="bg-red-600 p-6 md:p-8 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-4 md:gap-6">
                     <div className="w-12 h-12 md:w-16 md:h-16 bg-white rounded-xl md:rounded-2xl flex items-center justify-center text-red-600 shadow-2xl scale-100 md:scale-110 shrink-0"><Icons.Alert className="w-6 h-6 md:w-8 md:h-8" /></div>
                     <div>
                       <h3 className="text-xl md:text-4xl font-black uppercase tracking-tighter leading-none">{syncError.title}</h3>
                       <p className="text-[9px] md:text-[10px] font-black text-red-100 uppercase tracking-widest mt-1 md:mt-2 bg-red-800/30 px-3 py-1 rounded-full inline-block">CONFLICTO OPERATIVO CRÍTICO</p>
                     </div>
                  </div>
                  <button onClick={() => setSyncError(null)} className="text-3xl md:text-4xl font-thin hover:opacity-70 transition-all">×</button>
               </div>
               <div className="p-8 md:p-20 space-y-8 md:space-y-12 bg-slate-50/20 flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center text-center">
                  <div className="max-w-4xl space-y-6 md:space-y-10">
                    <p className="text-slate-900 font-black text-2xl md:text-5xl leading-tight uppercase tracking-tight">{syncError.message}</p>
                    <div className="h-1.5 md:h-2 w-24 md:w-40 bg-red-600 mx-auto rounded-full"></div>
                    <p className="text-slate-400 font-bold text-sm md:text-xl uppercase tracking-[0.2em] md:tracking-[0.3em]">SISTEMA DE SEGURIDAD M7 GESTIÓN LOGÍSTICA</p>
                  </div>
                  
                  {syncError.duplicates.length > 0 && (
                     <div className="space-y-6 w-full max-w-2xl mt-8 md:mt-12">
                        <h4 className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.4em]">Registros Duplicados Encontrados</h4>
                        <div className="grid grid-cols-1 gap-4">
                           {syncError.duplicates.map((dup, i) => (
                              <div key={i} className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 md:gap-6">
                                 <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0"><Icons.X /></div>
                                 <div className="text-left">
                                    <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase leading-none mb-1 md:mb-2">PLACA: {dup.placa}</p>
                                    <p className="text-base md:text-xl font-black text-slate-900 uppercase leading-none">CARGA: {dup.carga}</p>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}
               </div>
               <div className="p-6 md:p-8 border-t bg-white flex justify-end shrink-0">
                  <button onClick={() => setSyncError(null)} className="w-full py-4 md:py-6 bg-slate-900 text-white rounded-xl md:rounded-2xl font-black text-lg md:text-xl uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-2xl active:scale-95">Entendido</button>
               </div>
           </div>
        </div>
      )}

      {selectedPendingDoc && (
        <div className="fixed inset-0 z-[600] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-4 md:p-6 animate-in fade-in zoom-in-95 duration-500">
           <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] md:rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/5">
              <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 shadow-xl"><Icons.Audit /></div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Expediente M7: {selectedPendingDoc.externalDocId}</h3>
                      <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">AUDITORÍA INTEGRAL DE CARGA</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <button onClick={() => exportToExcel(selectedPendingDoc.items, `M7_Detalles_${selectedPendingDoc.externalDocId}`)} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all flex items-center gap-2 font-black text-[9px] uppercase"><Icons.Excel /> Exportar</button>
                    <button onClick={()=>setSelectedPendingDoc(null)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-3xl font-thin">×</button>
                 </div>
              </div>
              
              <div className="p-10 overflow-y-auto space-y-10 custom-scrollbar flex-1 bg-slate-50/20">
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">UN Orig</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.codplan || 'S/I'}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Envío</p><p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.deliveryDate || 'S/I'}</p></div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">PLACA</p>
                      <p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.vehicleData || 'S/I'}</p>
                    </div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. INVENTARIO</p>
                      <p className="font-black text-slate-900 text-xs uppercase">{selectedPendingDoc.inventoryDate ? new Date(selectedPendingDoc.inventoryDate).toLocaleDateString('es-CO') : 'PENDIENTE'}</p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-[1.8rem] border border-slate-800 shadow-2xl flex flex-col justify-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Total Unidades Plan</p>
                        <p className="font-black text-emerald-400 text-2xl tracking-tighter">
                           {selectedPendingDoc.items.reduce((acc:any, it:any) => acc + (Number(it.expectedQty) || 0), 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Nota Auditoría</p>
                        <p className="font-black text-slate-600 text-[10px] uppercase italic truncate" title={selectedPendingDoc.inventoryNotes}>{selectedPendingDoc.inventoryNotes || 'SIN NOVEDAD'}</p>
                    </div>
                 </div>

                 <div className="space-y-6">
                     <div className="flex flex-col md:flex-row justify-between items-center gap-4 px-2">
                        <div className="flex gap-2">
                           <button onClick={() => {setActiveModalTab('reception'); setModalPage(1);}} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${activeModalTab === 'reception' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Recepción</button>
                           <button onClick={() => {setActiveModalTab('audit'); setModalPage(1);}} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${activeModalTab === 'audit' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Auditoría (Consolidado)</button>
                        </div>
                        <div className="flex-1 w-full md:max-w-xl">
                           <TableControls 
                             searchValue={modalSearch} 
                             onSearchChange={(val:string) => {setModalSearch(val); setModalPage(1);}}
                             pageSize={modalPageSize}
                             onPageSizeChange={(size:any) => {setModalPageSize(size); setModalPage(1);}}
                             placeholder="BUSCAR SKU, PEDIDO O FACTURA..."
                           />
                        </div>
                     </div>
                  
                     {/* VISUALIZACIÓN DE TABS */}
                     {activeModalTab === 'reception' ? (
                       // TABLA RECEPCIÓN
                       <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-left-4 duration-300">
                          <h5 className="px-6 py-4 bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b">Vista de Recepción (Conductor)</h5>
                          <div className="overflow-x-auto">
                             <table className="w-full text-left border-collapse">
                               <thead>
                                 <tr className="text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                   <th className="py-6 px-4 font-black min-w-[200px]">ARTICULO / SKU</th>
                                   <th className="py-6 px-4 font-black min-w-[100px] text-slate-500">UN</th>
                                   <th className="py-6 px-4 font-black min-w-[100px] text-slate-500">REF</th>
                                   <th className="py-6 px-4 font-black text-center min-w-[100px]">CANT. ESP</th>
                                   <th className="py-6 px-4 font-black text-center min-w-[100px] text-blue-600 bg-blue-50">RECIBIDO</th>
                                   <th className="py-6 px-4 font-black min-w-[80px]">UM</th>
                                   <th className="py-6 px-4 font-black text-right min-w-[100px]">VOL</th>
                                   <th className="py-6 px-4 font-black text-center min-w-[100px] text-orange-600">PESO</th>
                                   <th className="py-6 px-4 font-black text-right min-w-[120px]">Nº PEDIDO</th>
                                   <th className="py-6 px-4 font-black text-right min-w-[120px]">FACTURA</th>
                                   <th className="py-6 px-4 font-black text-right min-w-[150px]">CIUDAD</th>
                                   <th className="py-6 px-4 font-black text-right min-w-[200px]">DIRECCIÓN</th>
                                   <th className="py-6 px-4 font-black text-right min-w-[200px]">OBS. CONDUCTOR</th>
                                 </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                 {paginatedModalItems.map((it:any, idx:number) => (
                                  <tr key={idx} className="text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                                    <td className="py-5 px-4 font-bold text-slate-900 truncate">{it.articleId}</td>
                                    <td className="py-5 px-4 text-center font-bold text-slate-900">{it.unCode || 'S/I'}</td>
                                    <td className="py-5 px-4 text-center font-bold text-slate-900">{it.clientRef || 'S/I'}</td>
                                    <td className="py-5 px-4 text-center font-bold text-slate-900">{it.expectedQty}</td>
                                    <td className="py-5 px-4 text-center font-black text-blue-600 bg-blue-50/50">{it.receivedQty || 0}</td>
                                    <td className="py-5 px-4 text-center text-slate-500">{it.unit || 'UND'}</td>
                                    <td className="py-5 px-4 text-right text-slate-400">{it.volume || 0}</td>
                                    <td className="py-5 px-4 text-center font-black text-orange-600 italic border-x border-orange-50 bg-orange-50/20">{it.peso || 0}</td>
                                    <td className="py-5 px-4 text-right font-bold text-emerald-600">{it.orderNumber || 'S/I'}</td>
                                    <td className="py-5 px-4 text-right text-slate-600">{it.invoice || 'S/I'}</td>
                                    <td className="py-5 px-4 text-right text-slate-500 truncate">{it.city || '-'}</td>
                                    <td className="py-5 px-4 text-right text-slate-500 truncate">{it.address || '-'}</td>
                                    <td className="py-5 px-4 text-right text-slate-400 italic truncate">{it.driverNote || 'SIN OBS.'}</td>
                                  </tr>
                                ))}
                                {paginatedModalItems.length === 0 && (
                                  <tr>
                                    <td colSpan={13} className="py-10 text-center text-slate-500 text-[10px] italic">
                                      No hay datos de recepción disponibles para este documento o no coinciden con la búsqueda.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                         </div>
                         {totalModalPages > 1 && (
                           <div className="flex justify-center items-center gap-4 mt-4 p-4 border-t bg-slate-50">
                              <button disabled={modalPage === 1} onClick={()=>setModalPage(p=>p-1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight className="rotate-180" /></button>
                              <span className="text-[10px] font-black uppercase">Pág {modalPage} de {totalModalPages}</span>
                              <button disabled={modalPage >= totalModalPages} onClick={()=>setModalPage(p=>p+1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight /></button>
                           </div>
                         )}
                      </div>
                    ) : (
                      // TABLA AUDITORÍA
                      <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-right-4 duration-300">
                         <h5 className="px-6 py-4 bg-emerald-50 text-[9px] font-black uppercase text-emerald-600 tracking-widest border-b border-emerald-100">Vista de Auditoría (Consolidado)</h5>
                         <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                  <th className="py-6 px-4 font-black min-w-[200px]">ARTICULO / SKU</th>
                                  <th className="py-6 px-4 font-black text-center min-w-[100px]">CANT. PLAN</th>
                                  <th className="py-6 px-4 font-black text-center min-w-[100px] text-emerald-600 bg-emerald-50">CONTEO 1</th>
                                  <th className="py-6 px-4 font-black text-center min-w-[100px] text-amber-600 bg-amber-50">CONTEO 2</th>
                                  <th className="py-6 px-4 font-black text-center min-w-[100px]">ALISTADO</th>
                                  <th className="py-6 px-4 font-black text-center min-w-[100px]">DESPACHADO</th>
                                  <th className="py-6 px-4 font-black text-right min-w-[200px]">OBS. INVENTARIO</th>
                                </tr>
                              </thead>
                               <tbody className="divide-y divide-slate-100">
                                 {paginatedModalItems.map((it:any, idx:number) => (
                                  <tr key={idx} className="text-[10px] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                                    <td className="py-5 px-4 font-bold text-slate-900 truncate">{it.articleId}</td>
                                    <td className="py-5 px-4 text-center font-bold text-slate-900">{it.expectedQty}</td>
                                    <td className="py-5 px-4 text-center font-black text-emerald-600 bg-emerald-50/50">{it.count1 || 0}</td>
                                    <td className="py-5 px-4 text-center font-black text-amber-600 bg-amber-50/50">{it.count2 || 0}</td>
                                    <td className="py-5 px-4 text-center text-slate-500">{it.pickedQty || 0}</td>
                                    <td className="py-5 px-4 text-center text-slate-500">{it.dispatchedQty || 0}</td>
                                    <td className="py-5 px-4 text-right text-slate-400 italic truncate">{it.inventoryObservation || 'SIN NOVEDAD'}</td>
                                  </tr>
                                ))}
                                {paginatedModalItems.length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="py-10 text-center text-slate-500 text-[10px] italic">
                                      No hay datos de consolidado disponibles para este documento o no coinciden con la búsqueda.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                         </div>
                         {totalModalPages > 1 && (
                           <div className="flex justify-center items-center gap-4 mt-4 p-4 border-t bg-slate-50">
                              <button disabled={modalPage === 1} onClick={()=>setModalPage(p=>p-1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight className="rotate-180" /></button>
                              <span className="text-[10px] font-black uppercase">Pág {modalPage} de {totalModalPages}</span>
                              <button disabled={modalPage >= totalModalPages} onClick={()=>setModalPage(p=>p+1)} className="p-3 bg-white border rounded-xl disabled:opacity-20"><Icons.ChevronRight /></button>
                           </div>
                         )}
                      </div>
                    )}
                 </div>
              </div>

              <div className="p-10 border-t bg-white flex justify-end shrink-0">
                <button onClick={()=>setSelectedPendingDoc(null)} className="px-12 py-5 bg-slate-900 text-white rounded-[1.8rem] font-black text-xs uppercase hover:bg-emerald-600 transition-all shadow-xl">Cerrar Auditoría</button>
              </div>
           </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación - M7 PREMIUM STYLE */}
      {docToDelete && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setDocToDelete(null)} />
            <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
               {/* Decorative Header */}
               <div className="h-3 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-600" />
               
               <div className="p-10 flex flex-col items-center text-center">
                  <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500">
                     <Icons.Trash className="w-10 h-10" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4">
                     ¿Confirmar Eliminación?
                  </h3>
                  
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed px-4">
                     Este documento operativo será marcado como <span className="text-rose-600 font-black">ELIMINADO</span>. Esta acción quedará registrada para auditoría de <span className="text-slate-900">Milla Siete</span>.
                  </p>

                  <div className="grid grid-cols-2 gap-4 w-full mt-10">
                     <button 
                        onClick={() => setDocToDelete(null)}
                        className="py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                     >
                        Mantener
                     </button>
                     <button 
                        onClick={confirmDelete}
                        className="py-5 bg-rose-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-200 hover:bg-rose-700 hover:shadow-rose-300 transition-all active:scale-95 flex items-center justify-center gap-2"
                     >
                        Confirmar
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default GestionDocumentosL;
