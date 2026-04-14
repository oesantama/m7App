
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { DocumentL, User, DocStatus, MasterRecord, Invoice, UserRole, getStatusLabel } from '../types';
import { api } from '../services/api';
import ConsultasDocumentosL from './ConsultasDocumentosL';
import ProcessPaymentLModal from './ProcessPaymentLModal';
import * as XLSX from 'xlsx';
import TableControls from './shared/TableControls';
import { formatCurrency } from '../utils/formatting';

// Extendemos DocumentL localmente para manejar el estado de duplicado en la UI
interface PreviewDocument extends DocumentL {
  isDuplicate?: boolean;
  isHeaderUpdate?: boolean; // New flag for metadata corrections
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
  onRefresh?: () => void; // New prop for global refresh
}



const GestionDocumentosL: React.FC<GestionDocumentosLProps> = ({ documents, invoices, user, masterEstados, onDocumentsChange, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'cargue' | 'consultas'>('cargue');
  const [activeModalTab, setActiveModalTab] = useState<'reception' | 'audit' | 'payments'>('reception');
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
  const [selectedClientId, setSelectedClientId] = useState(user.clientId || 'CLI-01');
  const [allClients, setAllClients] = useState<{id: string, name: string}[]>([]);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  // Estados para Modal de Detalle (Recepción/Auditoría)
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize, setModalPageSize] = useState<number | 'all'>(10);
  
  // Nuevo Estado: Cambio Rápido de Documento
  const [docToChangeStatus, setDocToChangeStatus] = useState<DocumentL | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // States for Document L Payment Upload
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<DocumentL | null>(null);

  // Estados para edición de count_2 en auditoría
  const [editingAuditItem, setEditingAuditItem] = useState<any | null>(null);
  const [editCount2, setEditCount2] = useState<string>('');
  const [editObservation, setEditObservation] = useState<string>('');
  const [editAuditLoading, setEditAuditLoading] = useState(false);
  const [editAuditError, setEditAuditError] = useState<string | null>(null);

  const canEditAudit = user.roleId === 'ROL-01' || user.role === 'ADMIN' ||
    user.permissions?.some((p: any) =>
      (p.module === 'PAG-17' || p.module === 'PAG-16' || p.module === 'PAG-30') &&
      p.actions.includes('edit')
    );

  const handleSaveAuditCount2 = async () => {
    if (!editingAuditItem || !selectedPendingDoc) return;
    const obs = editObservation.trim();
    if (!obs) { setEditAuditError('La observación es obligatoria'); return; }
    const newVal = Number(editCount2);
    if (isNaN(newVal) || newVal < 0) { setEditAuditError('Ingrese un número válido mayor o igual a 0'); return; }
    setEditAuditLoading(true);
    setEditAuditError(null);
    try {
      const token = localStorage.getItem('token') || '';
      const resp = await fetch('/api/documents/consolidated-count2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ docId: selectedPendingDoc.id, articleId: editingAuditItem.articleId, newCount2: newVal, observation: obs }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al guardar');
      // Actualizar localmente el item en consolidatedItems
      const updated = { ...selectedPendingDoc };
      (updated as any).consolidatedItems = ((updated as any).consolidatedItems || []).map((it: any) =>
        it.articleId === editingAuditItem.articleId
          ? { ...it, count2: newVal, inventoryObservation: obs }
          : it
      );
      setSelectedPendingDoc(updated);
      setEditingAuditItem(null);
    } catch (e: any) {
      setEditAuditError(e.message);
    } finally {
      setEditAuditLoading(false);
    }
  };

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
      (d.status === DocStatus.PENDING || d.status === 'PENDIENTE' || d.status === 'Pendiente') &&
      d.status !== 'EST-16' && d.status !== 'ELIMINADO'
    );
    
    if (!searchTerm) return list;
    const searchTerms = searchTerm.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    return list.filter(d => {
      const docId = (d.externalDocId || '').toLowerCase();
      const plate = (d.vehicleData || '').toLowerCase();
      const city = (d.city || '').toLowerCase();
      return searchTerms.some(term => 
        docId.includes(term) || plate.includes(term) || city.includes(term)
      );
    });
  }, [documents, searchTerm]);

  React.useEffect(() => {
    api.getClients().then(data => {
      if (Array.isArray(data)) setAllClients(data);
    }).catch(() => { /* clients load failed — non-critical */ });
  }, []);

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
      (p.module === 'inventory' || p.module === 'routing' || p.module === 'PAG-11' || (p.module as any) === 'masterPaginas') && 
      p.actions.includes('delete')
    );
  }, [user]);
  
  const handleUpdateStatus = () => {
    if (!docToChangeStatus || !selectedStatus) return;
    setIsUpdatingStatus(true);
    api.updateDocumentStatus(docToChangeStatus.id, selectedStatus, user.name)
      .then(res => {
        if (res.success) {
          const updatedDocs = documents.map(d => d.id === docToChangeStatus.id ? { ...d, status: selectedStatus as DocStatus, updatedAt: new Date().toISOString() } : d);
          onDocumentsChange(updatedDocs);
          toast.success(`Estado guardado`);
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
        
        // FUNCIÓN DE BÚSQUEDA MEJORADA: PRIORIDAD EXACTA + normalización de acentos
        const normStr = (s: string) =>
          s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const findIdx = (terms: string[]) => {
           // Paso 1: Búsqueda EXACTA (insensible a acentos)
           const exactIdx = headers.findIndex(h => {
             if (!h) return false;
             return terms.some(t => normStr(h) === normStr(t));
           });
           if (exactIdx !== -1) return exactIdx;

           // Paso 2: Búsqueda PARCIAL (insensible a acentos, solo si falla la exacta)
           return headers.findIndex(h => {
             if (!h) return false;
             return terms.some(t => normStr(h).includes(normStr(t)));
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

        // VALIDACIÓN CRÃTICA DE COLUMNAS
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
        const iDir = findIdx(['dirección 1', 'dirección', 'dirección1', 'direccion 1', 'direccion', 'direccion1', 'dir 1', 'dir1', 'address', 'f_dirección', 'f_direccion', 'dirección 1', 'dirección']);
        const iPed = findIdx(['nº ped', 'pedido', 'order']);
        const iPeso = findIdx(['peso', 'weight', 'kgs', 'kilogramos']);
        
        // [NEW] Campos requeridos en detalle con discriminación por Plan (Solicitud Usuario)
        const iUnCodeDetail = isPlanR
          ? findIdx(['un'])
          : findIdx(['un orig']);

        const iClientRefDetail = isPlanR
          ? findIdx(['cliente'])
          : findIdx(['envío', 'envio']);

        // Nombre del cliente destinatario (para identificar almacenes de cadena)
        // Plan R: columna "Nombre" | Plan Normal: columna "Clnt Envío" (con variantes)
        const iCustomerName = isPlanR
          ? findIdx(['nombre', 'nombre cliente', 'razon social', 'razon'])
          : findIdx(['clnt envio', 'clnt env', 'cliente envio', 'nombre envio', 'nombre cliente', 'razon social']);

        if (import.meta.env.DEV) {
          const dataRowsDebug = rawData.slice(headerRowIndex + 1).filter(r => r && r.length > 0).slice(0, 3);
          const sampleCustomerNames = dataRowsDebug.map(r => iCustomerName !== -1 ? String(r[iCustomerName] || '') : 'IDX=-1');
          console.group('[M7-COLUMNAS DETECTADAS]');
          console.log('Tipo plan:', type, '| isPlanR:', isPlanR);
          console.log('Headers del Excel:', headers);
          console.log('customerName idx:', iCustomerName, iCustomerName !== -1 ? `→ col="${headers[iCustomerName]}" | samples: ${JSON.stringify(sampleCustomerNames)}` : '→ NO DETECTADA');
          console.log('clientRef idx:', iClientRefDetail, iClientRefDetail !== -1 ? `→ "${headers[iClientRefDetail]}"` : '→ NO DETECTADA');
          console.log('Todos los headers (normalizados):', headers.map((h, i) => `[${i}] "${h}" → "${h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}"`));
          console.groupEnd();
        }
        
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
             // Lógica de Parseo Numerico (M7 FIX)
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
              unCode: val(iUnCodeDetail),
              clientRef: val(iClientRefDetail),
              customerName: val(iCustomerName), // nombre destinatario para deteccion de cadenas
              itemStatus: 'EST-03'
            });

            // 2. Mapeo para AUDITORÃA (Consolidado Inventario)
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
        const mapped: PreviewDocument[] = Array.from(docsMap.entries()).map(([, data]) => {
          const existingDoc = documents.find(d => {
            const dCarga = String(d.externalDocId || (d as any).external_doc_id || '').trim().toLowerCase();
            const dPlaca = String(d.vehicleData || (d as any).vehicle_plate || (d as any).plate || '').trim().toLowerCase();
            const currCarga = String(data.carga || '').trim().toLowerCase();
            const currPlaca = String(data.placa || '').trim().toLowerCase();
            return dCarga === currCarga && dPlaca === currPlaca;
          });

          const isDuplicate = !!existingDoc;
          // Si existe pero el Plan Type es diferente, permitimos la actualización (Solo Cabecera)
          const isHeaderUpdate = isDuplicate && existingDoc?.planType !== type;

          return {
            id: `doc-${data.placa}-${data.carga}`,
            clientId: selectedClientId,
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
            isDuplicate: isDuplicate && !isHeaderUpdate, // Si es update, no lo marcamos como duplicate bloqueante
            isHeaderUpdate: isHeaderUpdate
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

  const handleSync = async () => {
    if (!preview) return;
    
    // Restaurada lógica de BLOQUEO de duplicados a petición del usuario
    // Separamos nuevos de duplicados
    const newDocs = preview.mapped.filter(d => !d.isDuplicate);
    const duplicatedDocs = preview.mapped.filter(d => d.isDuplicate);

    // Preparar payload: Los que son HeaderUpdate se envían SIN items para evitar duplicar cantidades
    const payloadDocs = newDocs.map(d => {
      if (d.isHeaderUpdate) {
        return { ...d, items: [], consolidatedItems: [] };
      }
      return d;
    });

    if (payloadDocs.length > 0) {
      try {
        const res = await api.bulkCreateDocuments({ documents: payloadDocs });
        if (res.success) {
          onDocumentsChange([...payloadDocs, ...documents]);
          if (onRefresh) onRefresh();
          toast.success(`Procesados ${payloadDocs.length} documentos (Creación/Actualización).`);
          setPreview(null);
        } else {
          toast.error(`Error del servidor: ${res.error || 'Desconocido'}`);
        }
      } catch (err: any) {
        if (import.meta.env.DEV) console.error('[M7-SYNC]', err);
        setSyncError({
          title: 'Error de Sincronización',
          message: err.message || 'Error al sincronizar con el servidor. Verifique su conexión.',
          duplicates: []
        });
        return;
      }

      if (duplicatedDocs.length > 0) {
        setSyncError({
          title: "Sincronización Parcial",
          message: `Se cargaron ${newDocs.length} documentos nuevos. Sin embargo, ${duplicatedDocs.length} registros fueron omitidos porque YA EXISTEN en el sistema (Placa/Carga coincidieron).`,
          duplicates: duplicatedDocs.map(d => ({ placa: d.vehicleData || 'S/I', carga: d.externalDocId }))
        });
      }
    } else {
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
      : activeModalTab === 'audit'
      ? ((selectedPendingDoc as any).consolidatedItems || [])
      : (selectedPendingDoc.items?.filter((it: any) => it.paymentValue) || []);
    
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



  return (
    <div className="space-y-4 animate-in fade-in h-full flex flex-col overflow-hidden">
      <div className="bg-white px-6 py-2.5 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-4 shrink-0">
         <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-emerald-500 shadow-sm"><Icons.Package className="w-4 h-4" /></div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none">Cargues Operativos</h2>
              <p className="text-[7px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">SISTEMA M7 GLOBAL</p>
            </div>
         </div>
         <div className="flex bg-slate-50 p-1 rounded-xl shadow-inner border border-slate-100">
            <button onClick={()=>setActiveTab('cargue')} className={`px-4 py-1.5 rounded-lg font-black text-[9px] uppercase transition-all ${activeTab === 'cargue' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Cargue Masivo</button>
            <button onClick={()=>setActiveTab('consultas')} className={`px-4 py-1.5 rounded-lg font-black text-[9px] uppercase transition-all ${activeTab === 'consultas' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Consulta Histórica</button>
         </div>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {activeTab === 'cargue' ? (
            <div className="max-w-7xl mx-auto space-y-12">
              {!preview ? (
                <div className="space-y-12 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-emerald-50/20 p-8 rounded-[2rem] border-2 border-dashed border-emerald-100 flex flex-col items-center justify-center text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition-all group">
                        <div className="w-12 h-12 bg-white text-emerald-600 rounded-xl flex items-center justify-center mb-4 shadow-sm border border-emerald-50 group-hover:scale-110 transition-transform"><Icons.Excel className="w-6 h-6" /></div>
                        <h3 className="text-sm font-black text-slate-900 uppercase">Plan Normal</h3>
                        <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Excel con columnas "UN ORIG"</p>
                        <label className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black text-[9px] uppercase mt-6 cursor-pointer shadow-md hover:bg-emerald-600 transition-all active:scale-95">
                           Subir Normal
                           <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>handleFileUpload(e, 'Plan Normal')} />
                        </label>
                     </div>
                     <div className="bg-blue-50/20 p-8 rounded-[2rem] border-2 border-dashed border-blue-100 flex flex-col items-center justify-center text-center hover:border-blue-500 hover:bg-blue-50/40 transition-all group">
                        <div className="w-12 h-12 bg-white text-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-sm border border-blue-50 group-hover:scale-110 transition-transform"><Icons.Excel className="w-6 h-6" /></div>
                        <h3 className="text-sm font-black text-slate-900 uppercase">Plan R</h3>
                        <p className="text-[8px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Excel/CSV con columnas "UN"</p>
                        <label className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black text-[9px] uppercase mt-6 cursor-pointer shadow-md hover:bg-blue-600 transition-all active:scale-95">
                           Subir Plan R
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
                              <p><span className="text-slate-900">CLIENTE:</span> {doc.clientId || 'S/C'}</p>
                              <p><span className="text-slate-900">PLACA:</span> {doc.vehicleData}</p>
                              <p>
                                <span className="text-slate-900">CARGUE:</span> 
                                {(doc.createdAt || (doc as any).created_at) ? new Date(doc.createdAt || (doc as any).created_at).toLocaleDateString() : 'SIN FECHA'}
                              </p>
                              <div className="flex justify-between items-center group/status">
                                  <p><span className="text-slate-900">ESTADO:</span> {getStatusLabel(doc.status || '')}</p>
                                  {(doc.status === DocStatus.PENDING || doc.status === 'PENDIENTE' || doc.status === 'Pendiente') && (
                                     <button 
                                       onClick={(e) => { e.stopPropagation(); setDocToChangeStatus(doc); setSelectedStatus(doc.status || ''); }}
                                       className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-blue-500 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-sm opacity-0 group-hover/status:opacity-100"
                                     >
                                        <Icons.RefreshCw className="w-2.5 h-2.5" /> ESTADO
                                     </button>
                                  )}
                              </div>
                           </div>
                            {doc.planType === 'Plan R' && (
                            <div className="mt-6 pt-6 border-t border-slate-50 flex gap-2">
                                <button
                                  onClick={() => {
                                    if ((doc as any).paymentsCount > 0) {
                                      setSelectedPendingDoc(doc);
                                      setActiveModalTab('payments');
                                    } else {
                                      setPaymentTarget(doc);
                                      setShowPaymentModal(true);
                                    }
                                  }}
                                  className={`flex-1 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                    (doc as any).paymentsCount > 0
                                      ? 'bg-slate-900 text-emerald-400 border border-emerald-500/30 shadow-lg'
                                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                                  }`}
                                >
                                  <Icons.Excel className="w-4 h-4" />
                                  {(doc as any).paymentsCount > 0 ? `Pagos: ${(doc as any).paymentsCount} Cargados` : 'Cargar Pagos L'}
                                </button>
                            </div>
                            )}
                         </div>
                       ))}
                    </div>

                     {totalPendingPages > 1 && (
                      <div className="flex flex-col items-center gap-4 mt-8">
                         <div className="flex justify-center items-center gap-4">
                            <button disabled={pendingPage === 1} onClick={()=>setPendingPage(p => p-1)} className="p-3 bg-slate-100 rounded-xl disabled:opacity-20" title="Anterior"><Icons.ChevronRight className="rotate-180" /></button>
                            <span className="text-[10px] font-black uppercase">Pág {pendingPage} de {totalPendingPages}</span>
                            <button disabled={pendingPage >= totalPendingPages} onClick={()=>setPendingPage(p => p+1)} className="p-3 bg-slate-100 rounded-xl disabled:opacity-20" title="Siguiente"><Icons.ChevronRight /></button>
                         </div>
                         <TableControls 
                            showSearch={false}
                            pageSize={pendingPageSize}
                            onPageSizeChange={(size:any) => {setPendingPageSize(size); setPendingPage(1);}}
                         />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[1.5rem] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 flex flex-col max-h-[85vh]">
                    <div className="bg-slate-900 px-4 py-2.5 text-white flex justify-between items-center shrink-0">
                       <div className="flex items-center gap-3">
                          <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight shadow-lg ${preview.type === 'Plan R' ? 'bg-blue-600' : 'bg-emerald-600'}`}>{preview.type}</div>
                          <div>
                            <h4 className="font-black uppercase text-xs tracking-tight leading-none">Pre-Validación M7</h4>
                            <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{preview.fileName}</p>
                          </div>
                       </div>
                       
                       <div className="flex-1 max-w-sm mx-4">
                          <TableControls
                            searchValue={previewSearch}
                            onSearchChange={(v)=>{setPreviewSearch(v); setPreviewPage(1);}}
                            pageSize={previewPageSize}
                            onPageSizeChange={(s)=>{setPreviewPageSize(s); setPreviewPage(1);}}
                            placeholder="FILTRAR PRE-CARGA..."
                            compact
                          />
                       </div>

                       <div className="flex items-center gap-2">
                          <button onClick={() => exportToExcel(filteredPreviewItems, "M7_Prevalidacion")} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all border border-emerald-400" title="Exportar"><Icons.Excel className="w-4 h-4" /></button>
                          <button onClick={()=>setPreview(null)} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-red-500 hover:text-white transition-all" title="Cerrar"><Icons.X className="w-4 h-4" /></button>
                       </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-slate-50/20">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-widest sticky top-0 z-20 border-b">
                          <tr>
                            <th className="px-4 py-2">Documento / Placa</th>
                            <th className="px-4 py-2">SKU</th>
                            <th className="px-4 py-2 text-center">Cant</th>
                            <th className="px-4 py-2 text-center">Peso</th>
                            <th className="px-4 py-2 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedPreviewItems.map((it, idx) => (
                            <tr key={idx} className={`hover:bg-white transition-all text-[9px] ${it.isDuplicate ? 'bg-rose-50/30 font-bold' : ''}`}>
                              <td className="px-4 py-2">
                                <span className="text-slate-900 font-bold">{it.docId}</span>
                                <span className="text-slate-400 mx-2 text-[8px]">|</span>
                                <span className="text-slate-500">{it.docVehicle}</span>
                              </td>
                              <td className="px-4 py-2 text-slate-600 font-bold">{it.articleId}</td>
                              <td className="px-4 py-2 text-center text-slate-900">{it.expectedQty}</td>
                              <td className="px-4 py-2 text-center text-emerald-600">{formatCurrency(it.peso)}</td>
                              <td className="px-4 py-2 text-center">
                                {it.isDuplicate ? (
                                  <span className="px-2 py-0.5 bg-rose-500 text-white rounded text-[7px] font-black uppercase">Duplicado</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[7px] font-black uppercase">Listo</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-4 border-t bg-slate-50 flex justify-between items-center shrink-0">
                       <button onClick={()=>setPreview(null)} className="px-6 py-2 bg-white text-slate-500 border rounded-xl font-bold text-[9px] uppercase hover:bg-slate-100 transition-all">Cancelar</button>
                       <div className="flex gap-4 items-center">
                         <span className="text-[10px] font-black text-slate-400 uppercase">Confirmar {preview.mapped.length} documentos</span>
                         <button onClick={handleSync} className="px-10 py-2 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition-all active:scale-95 shadow-lg">Iniciar Sincronización</button>
                       </div>
                    </div>
                </div>
               )}
            </div>
          ) : (
            <ConsultasDocumentosL 
              documents={documents} 
              invoices={invoices} 
              user={user} 
              masterEstados={masterEstados} 
              onRefresh={onRefresh}
            />
          )}
        </div>
      </div>

      {showPaymentModal && paymentTarget && (
        <ProcessPaymentLModal
          document={paymentTarget}
          userId={user.id}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            onRefresh && onRefresh();
          }}
        />
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
                  <button onClick={() => setSyncError(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all" title="Cerrar"><Icons.X className="w-6 h-6 md:w-8 md:h-8" /></button>
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
                    <button onClick={() => exportToExcel(selectedPendingDoc.items, `M7_Detalles_${selectedPendingDoc.externalDocId}`)} className="px-5 py-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 hover:scale-110 active:scale-95 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 font-black text-[9px] uppercase"><Icons.Excel className="w-4 h-4" /> Exportar</button>
                     <button onClick={()=>setSelectedPendingDoc(null)} className="p-2 hover:bg-red-600 rounded-xl transition-all" title="Cerrar"><Icons.X className="w-6 h-6" /></button>
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
                           <button onClick={() => {setActiveModalTab('audit'); setModalPage(1);}} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${activeModalTab === 'audit' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Auditoría</button>
                            <button onClick={() => {setActiveModalTab('payments'); setModalPage(1);}} className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${activeModalTab === 'payments' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Pagos</button>
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
                                  <tr key={idx} className="text-[9px] hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                                    <td className="py-2 px-4">
                                      <div className="flex flex-col">
                                        <span className="text-slate-900 font-bold uppercase">{it.articleId}</span>
                                        <span className="text-[7px] text-slate-400 font-black">{it.sku || ''}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-4 text-center text-slate-900 font-bold">{it.unCode || '-'}</td>
                                    <td className="py-2 px-4 text-center text-slate-900 font-bold">{it.clientRef || '-'}</td>
                                    <td className="py-2 px-4 text-center text-slate-900 font-bold">{it.expectedQty || 0}</td>
                                    <td className="py-2 px-4 text-center font-black text-blue-600 bg-blue-50/30">{it.receivedQty || 0}</td>
                                    <td className="py-2 px-4 text-center text-slate-500 font-black">{it.unit || 'CJ'}</td>
                                    <td className="py-2 px-4 text-right text-slate-400 font-black">{it.volume || 0}</td>
                                    <td className="py-2 px-4 text-center font-black text-orange-600 italic bg-orange-50/10 font-mono text-[8px]">{formatCurrency(it.peso)}</td>
                                    <td className="py-2 px-4 text-right font-black text-emerald-600 font-mono">{it.orderNumber || '-'}</td>
                                    <td className="py-2 px-4 text-right font-black text-slate-900 font-mono">{it.invoice || '-'}</td>
                                    <td className="py-2 px-4 text-right text-slate-500 truncate max-w-[100px]" title={it.city}>{it.city || '-'}</td>
                                    <td className="py-2 px-4 text-right text-slate-400 italic truncate max-w-[150px]" title={it.driverNote}>{it.driverNote || '-'}</td>
                                  </tr>
                                ))}
                                 {paginatedModalItems.length === 0 && (
                                   <tr>
                                     <td colSpan={13} className="py-10 text-center text-slate-400 text-[9px] font-black uppercase tracking-widest italic bg-slate-50/50">
                                       No hay registros en esta vista
                                     </td>
                                   </tr>
                                 )}
                               </tbody>
                             </table>
                          </div>
                          {totalModalPages > 1 && (
                            <div className="flex justify-center items-center gap-4 mt-4 p-4 border-t bg-slate-50">
                               <button disabled={modalPage === 1} onClick={()=>setModalPage(p=>p-1)} className="p-3 bg-white border rounded-xl disabled:opacity-20" title="Anterior"><Icons.ChevronRight className="rotate-180" /></button>
                               <span className="text-[10px] font-black uppercase">Pág {modalPage} de {totalModalPages}</span>
                               <button disabled={modalPage >= totalModalPages} onClick={()=>setModalPage(p=>p+1)} className="p-3 bg-white border rounded-xl disabled:opacity-20" title="Siguiente"><Icons.ChevronRight /></button>
                            </div>
                          )}
                       </div>
                     ) : activeModalTab === 'audit' ? (
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
                                  {canEditAudit && <th className="py-6 px-4 font-black text-center min-w-[80px]"></th>}
                                </tr>
                              </thead>
                               <tbody className="divide-y divide-slate-100">
                                 {paginatedModalItems.map((it:any, idx:number) => {
                                  const hasDiff = Number(it.count2 || 0) !== Number(it.expectedQty || 0);
                                  return (
                                    <tr key={idx} className={`text-[9px] hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${hasDiff ? 'bg-red-50/30' : ''}`}>
                                      <td className="py-2 px-4 font-black text-slate-900 uppercase truncate">{it.articleId}</td>
                                      <td className="py-2 px-4 text-center font-bold text-slate-900">{it.expectedQty}</td>
                                      <td className="py-2 px-4 text-center font-black text-emerald-600 bg-emerald-50/30">{it.count1 || 0}</td>
                                      <td className={`py-2 px-4 text-center font-black bg-amber-50/30 ${hasDiff ? 'text-red-600' : 'text-amber-600'}`}>{it.count2 || 0}</td>
                                      <td className="py-2 px-4 text-center text-slate-500">{it.pickedQty || 0}</td>
                                      <td className="py-2 px-4 text-center text-slate-500">{it.dispatchedQty || 0}</td>
                                      <td className="py-2 px-4 text-right text-slate-400 italic truncate max-w-[200px]" title={it.inventoryObservation}>{it.inventoryObservation || 'SIN NOVEDAD'}</td>
                                      {canEditAudit && (
                                        <td className="py-2 px-4 text-center">
                                          {hasDiff && (
                                            <button
                                              onClick={() => { setEditingAuditItem(it); setEditCount2(String(it.count2 || 0)); setEditObservation(it.inventoryObservation || ''); setEditAuditError(null); }}
                                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[8px] font-black uppercase transition-all"
                                              title="Corregir Conteo 2"
                                            >
                                              EDITAR
                                            </button>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
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
                     ) : (
                       // TABLA PAGOS
                       <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-300">
                          <h5 className="px-6 py-4 bg-indigo-50 text-[9px] font-black uppercase text-indigo-600 tracking-widest border-b border-indigo-100">Vista de Pagos (Recaudos)</h5>
                          <div className="overflow-x-auto">
                             <table className="w-full text-left border-collapse">
                               <thead>
                                 <tr className="text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                   <th className="py-6 px-4 font-black min-w-[200px]">FACTURA / REF</th>
                                   <th className="py-6 px-4 font-black text-center min-w-[120px] text-indigo-600">VALOR MÉTODO</th>
                                   <th className="py-6 px-4 font-black min-w-[150px]">MÉTODO PAGO</th>
                                   <th className="py-6 px-4 font-black text-center min-w-[120px]">UN CODE</th>
                                 </tr>
                               </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {paginatedModalItems.map((it:any, idx:number) => (
                                   <tr key={idx} className="text-[9px] font-bold text-slate-600 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0">
                                     <td className="py-2 px-4">
                                       <span className="text-slate-900 font-black">{it.invoice}</span>
                                       <div className="text-[7px] text-slate-400 font-black uppercase">{it.paymentRef || 'S/R'}</div>
                                     </td>
                                     <td className="py-2 px-4 text-center font-black text-indigo-600 bg-indigo-50/20">{formatCurrency(it.paymentValue)}</td>
                                     <td className="py-2 px-4 text-slate-900 font-black uppercase">{it.paymentMethod || 'S/M'}</td>
                                     <td className="py-2 px-4 text-center text-slate-400 font-mono text-[8px]">{it.unCode || '-'}</td>
                                   </tr>
                                 ))}
                                 {paginatedModalItems.length === 0 && (
                                   <tr>
                                     <td colSpan={5} className="py-10 text-center flex flex-col items-center justify-center bg-slate-50/50">
                                       <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">No hay pagos registrados</p>
                                     </td>
                                   </tr>
                                 )}
                               </tbody>
                             </table>
                          </div>
                       </div>
                    )}
                 </div>
              </div>

              <div className="p-10 border-t bg-white flex justify-end shrink-0">
                <button onClick={()=>setSelectedPendingDoc(null)} className="px-12 py-5 bg-slate-900 text-white rounded-[1.8rem] font-black text-xs uppercase hover:bg-emerald-600 transition-all shadow-xl">Cerrar Auditorí­a</button>
              </div>
           </div>
        </div>
      )}

      {/* Modal Edición Count2 Auditoría */}
      {editingAuditItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => !editAuditLoading && setEditingAuditItem(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />
            <div className="p-8 flex flex-col gap-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">Corrección de Conteo</p>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingAuditItem.articleId}</h3>
                <p className="text-[10px] text-slate-400 mt-1">Cant. Plan: <span className="font-black text-slate-700">{editingAuditItem.expectedQty}</span> · Conteo 1: <span className="font-black text-emerald-600">{editingAuditItem.count1 || 0}</span> · Conteo 2 actual: <span className="font-black text-red-500">{editingAuditItem.count2 || 0}</span></p>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Nuevo Conteo 2</label>
                <input
                  type="number" min={0} value={editCount2}
                  onChange={e => setEditCount2(e.target.value)}
                  className="w-full border-2 border-amber-200 rounded-xl px-4 py-3 text-lg font-black text-amber-700 focus:outline-none focus:border-amber-500 bg-amber-50"
                  disabled={editAuditLoading}
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Observación <span className="text-red-500">*</span></label>
                <textarea
                  rows={3} value={editObservation}
                  onChange={e => setEditObservation(e.target.value)}
                  placeholder="Explique el motivo de la corrección..."
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-400 resize-none"
                  disabled={editAuditLoading}
                />
              </div>
              {editAuditError && <p className="text-[10px] font-black text-red-500 bg-red-50 px-4 py-2 rounded-xl">{editAuditError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingAuditItem(null)} disabled={editAuditLoading}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase hover:bg-slate-50 transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveAuditCount2} disabled={editAuditLoading || !editObservation.trim()}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs uppercase transition-all shadow-lg">
                  {editAuditLoading ? 'Guardando...' : 'Guardar Corrección'}
                </button>
              </div>
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
                     Este documento operativo será marcado como <span className="text-rose-600 font-black">ELIMINADO</span>. Esta acción quedará registrada para auditoría de <span className="text-slate-900">OrbitM7 (Milla Siete)</span>.
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
