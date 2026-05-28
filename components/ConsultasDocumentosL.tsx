import React, { useState, useMemo, useRef } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice, getStatusLabel } from '../types';
import { api } from '../services/api';
import { toast } from 'sonner';
import ProcessPaymentLModal from './ProcessPaymentLModal';
import AddMissingInvoiceModal from './Conciliacion/AddMissingInvoiceModal';
import * as XLSX from 'xlsx';
import TableControls from './shared/TableControls';
import { formatCurrency, formatDate } from '../utils/formatting';
import { DataTable, ColumnDef } from './shared/DataTable';

interface ConsultasDocumentosLProps {
  documents: DocumentL[];
  invoices: Invoice[];
  user: User;
  masterEstados: MasterRecord[];
  onRefresh?: () => void;
}

const ConsultasDocumentosL: React.FC<ConsultasDocumentosLProps> = ({ documents, invoices, user, masterEstados, onRefresh }) => {
  const [filters, setFilters] = useState({
    plate: '',
    docL: '',
    remesaTDM: '',
    status: '',
    planType: '',
    deliveryDate: '',
    cargueDate: '',
    inventoryDate: ''
  });
  const [appliedFilters, setAppliedFilters] = useState({
    plate: '',
    docL: '',
    remesaTDM: '',
    status: '',
    planType: '',
    deliveryDate: '',
    cargueDate: '',
    inventoryDate: ''
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DocumentL[] | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentL | null>(null);

  // States for Document L Payment Upload
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddMissingInvoiceModal, setShowAddMissingInvoiceModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<DocumentL | null>(null);

  // ESTADOS para el modal de detalle
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState<number | 'all'>(10);
  const [activeDetailTab, setActiveDetailTab] = useState<'reception' | 'audit' | 'payments'>('reception');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  // Estados para Historial de Conciliación
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async (docId: string, articleId: string) => {
    setHistoryTarget(articleId);
    setLoadingHistory(true);
    setHistoryLogs([]);
    try {
      const res = await api.getConciliationLogs(docId, articleId);
      if (res.success) {
        setHistoryLogs(res.data);
      }
    } catch (err: any) {
      console.error('Error fetching history:', err);
      toast.error('Error al cargar el historial');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Estados para Reenvío de Correo
  const [manualEmail, setManualEmail] = useState('');
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [resendTarget, setResendTarget] = useState<DocumentL | null>(null);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  // PDF Verification states
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pdfVerifyTargetRef = useRef<DocumentL | null>(null);
  const [pdfVerifyTarget, setPdfVerifyTarget] = useState<DocumentL | null>(null);
  const [pdfVerifying, setPdfVerifying] = useState(false);
  const [pdfResults, setPdfResults] = useState<{
    rows: { remision: string; coincide: boolean }[];
    fileName: string;
    docExtId: string;
  } | null>(null);

  // Estados para edición de count_2 en auditoría
  const [editingAuditItem, setEditingAuditItem] = useState<any | null>(null);
  const [editCount2, setEditCount2] = useState<string>('');
  const [editObservation, setEditObservation] = useState<string>('');
  const [editAuditLoading, setEditAuditLoading] = useState(false);
  const [editAuditError, setEditAuditError] = useState<string | null>(null);

  // Estados para edición de factura de un item
  const [editingInvoiceItem, setEditingInvoiceItem] = useState<any | null>(null);
  const [newInvoiceValue, setNewInvoiceValue] = useState<string>('');
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [saveInvoiceError, setSaveInvoiceError] = useState<string | null>(null);

  const handleSaveItemInvoice = async () => {
    if (!editingInvoiceItem || !selectedDoc) return;
    const val = newInvoiceValue.trim();
    if (!val) {
      setSaveInvoiceError('El número de factura es obligatorio');
      return;
    }

    setIsSavingInvoice(true);
    setSaveInvoiceError(null);

    try {
      const data = await api.updateItemInvoice({
        itemId: editingInvoiceItem.id,
        newInvoice: val
      });

      // Actualizar localmente el item en selectedDoc.items
      const updated = { ...selectedDoc };
      updated.items = (updated.items || []).map((it: any) => {
        return it.id === editingInvoiceItem.id ? { ...it, invoice: val } : it;
      });
      setSelectedDoc(updated);

      toast.success('Factura asignada correctamente');
      setEditingInvoiceItem(null);
      setNewInvoiceValue('');

      if (onRefresh) onRefresh();
    } catch (err: any) {
      setSaveInvoiceError(err.message || 'Error desconocido');
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const canEditAudit = user.roleId === 'ROL-01' || (user as any).role === 'ADMIN' ||
    user.permissions?.some((p: any) =>
      (p.module === 'PAG-17' || p.module === 'PAG-16' || p.module === 'PAG-30') &&
      p.actions.includes('edit')
    );

  const handleSaveAuditCount2 = async () => {
    if (!editingAuditItem || !selectedDoc) return;
    const obs = editObservation.trim();
    if (!obs) { setEditAuditError('La observación es obligatoria'); return; }
    
    const newVal = Number(editCount2);
    if (isNaN(newVal) || newVal < 0) { setEditAuditError('Ingrese un número válido mayor o igual a 0'); return; }
    
    const currentObs = editingAuditItem.inventory_observation || editingAuditItem.inventoryObservation || '';
    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const appendText = `${obs} (${user.name} - ${formattedDate})`;
    const finalObs = currentObs ? `${currentObs} | ${appendText}` : appendText;

    setEditAuditLoading(true);
    setEditAuditError(null);
    try {
      const articleId = editingAuditItem.article_id || editingAuditItem.articleId || editingAuditItem.sku;
      const data = await api.updateConsolidatedCount2({
        docId: selectedDoc.id,
        articleId,
        newCount2: newVal,
        observation: obs
      });
      // Actualizar localmente
      const updated = { ...selectedDoc };
      (updated as any).consolidatedItems = ((updated as any).consolidatedItems || []).map((it: any) => {
        const itId = it.article_id || it.articleId || it.sku;
        return itId === articleId
          ? { ...it, count_2: newVal, count2: newVal, inventory_observation: finalObs, inventoryObservation: finalObs }
          : it;
      });
      setSelectedDoc(updated);
      setEditingAuditItem(null);
    } catch (e: any) {
      setEditAuditError(e.message);
    } finally {
      setEditAuditLoading(false);
    }
  };

  const isAuthorizedToDelete = useMemo(() => {
    if (user.roleId === 'ROL-01' || user.id === 'USR-01') return true;
    return user.permissions?.some(p =>
      (p.module === 'inventory' || p.module === 'routing' || p.module === 'PAG-11' || (p.module as any) === 'masterPaginas') &&
      p.actions.includes('delete')
    );
  }, [user]);

  const handleDeleteDocument = (docId: string) => {
    setDocToDelete(docId);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    try {
        const res = await api.deleteDocument(docToDelete, user.name);
        if (res.success) {
            toast.success("Documento eliminado");
            if (onRefresh) onRefresh();
            setDocToDelete(null);
        } else {
            toast.error("Error: " + res.error);
        }
    } catch (err) {
        toast.error("Error de conexión");
    }
  };

  const handleResendClick = (doc: DocumentL) => {
    setResendTarget(doc);
    setManualEmail('');
    setShowResendDialog(true);
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

  const sortedDetailItems = useMemo(() => {
    if (!selectedDoc) return [];

    // Si estamos en la pestaña de Recepción (Detalle por ítem)
    if (activeDetailTab === 'reception') {
      let items = [...selectedDoc.items];
      if (detailSearch) {
        const lower = detailSearch.toLowerCase();
        items = items.filter(it =>
          it.articleId.toLowerCase().includes(lower) ||
          (it.inventoryNote || '').toLowerCase().includes(lower) ||
          (it.orderNumber || '').toLowerCase().includes(lower)
        );
      }
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
    }

    // Si estamos en la pestaña de Pagos (Recaudos)
    else if (activeDetailTab === 'payments') {
      const items = (selectedDoc.items?.filter((it: any) => it.paymentValue) || []);
      if (detailSearch) {
        const lower = detailSearch.toLowerCase();
        return items.filter((it: any) => 
          String(it.articleId || '').toLowerCase().includes(lower) ||
          String(it.orderNumber || '').toLowerCase().includes(lower) ||
          String(it.invoice || '').toLowerCase().includes(lower)
        );
      }
      return items;
    }

    // Si estamos en la pestaña de Auditoría (Consolidado)
    else {
      let items = [...(selectedDoc.consolidatedItems || [])];
      if (detailSearch) {
        const lower = detailSearch.toLowerCase();
        items = items.filter(it =>
          (it.articleId || it.sku || '').toLowerCase().includes(lower) ||
          (it.inventoryObservation || it.inventory_observation || '').toLowerCase().includes(lower)
        );
      }
      // Podemos añadir sorting para auditoría también si es necesario
      return items;
    }
  }, [selectedDoc, sortConfig, detailSearch, activeDetailTab]);

  const paginatedDetailItems = useMemo(() => {
    if (detailPageSize === 'all') return sortedDetailItems;
    const start = (detailPage - 1) * detailPageSize;
    return sortedDetailItems.slice(start, start + detailPageSize);
  }, [sortedDetailItems, detailPage, detailPageSize]);

  const totalDetailPageItems = detailPageSize === 'all' ? 1 : Math.ceil(sortedDetailItems.length / detailPageSize);

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



  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja 1");
    XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
  };

  const handleDetailExport = () => {
    let dataToExport: any[] = [];
    if (activeDetailTab === 'reception') {
      dataToExport = sortedDetailItems.map(it => ({
        ARTICULO: it.articleId,
        UN: it.unCode || '-',
        REF: it.clientRef || '-',
        CIUDAD: it.city || '-',
        CANT_PLAN: it.expectedQty,
        RECIBIDO: Number(it.receivedQty || it.count1 || 0),
        UM: it.unit || 'und',
        FACTURA: it.invoice || '-',
        PEDIDO: it.orderNumber || 'S/I',
        PESO: Number(it.peso || 0),
        ESTADO: it.itemStatus === 'En Conteo' ? 'Pendiente' : (it.itemStatus || 'Pendiente'),
        OBS_CONDUCTOR: 'driverNote' in it ? (it as any).driverNote : (it as any).observation || '',
        NOTA_AUDITORIA: it.inventoryNote || ''
      }));
    } else {
      dataToExport = sortedDetailItems.map((it: any) => ({
        ARTICULO: it.article_id || it.articleId || it.sku,
        CANT_PLAN: Number(it.expected_qty || it.expectedQty || 0),
        CONTEO_1: Number(it.count_1 || it.count1 || 0),
        CONTEO_2: Number(it.count_2 || it.count2 || 0),
        ALISTADO: Number(it.picked_qty || it.pickedQty || 0),
        DESPACHADO: Number(it.dispatched_qty || it.dispatchedQty || 0),
        OBS_INVENTARIO: it.inventory_observation || it.inventoryObservation || ''
      }));
    }
    exportToExcel(dataToExport, `Detalle_${activeDetailTab.toUpperCase()}_MOV_${selectedDoc?.externalDocId}`);
  };

  const filteredDocs = useMemo(() => {
    // Si hay resultados de búsqueda directa por API, aplicar solo filtros locales restantes
    const source = searchResults !== null ? searchResults : documents;

    return source.filter(doc => {
      if (!hasSearched) {
         // Sin búsqueda activa: solo mes actual de los documentos en memoria
         if (!doc.createdAt && !(doc as any).created_at) return false;
         const docDate = new Date(doc.createdAt || (doc as any).created_at);
         const now = new Date();
         return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
      }

      // Si la API ya filtró por docL y plate, estos checks son redundantes pero inofensivos
      const matchPlaca = !appliedFilters.plate || (doc.vehicleData || '').toLowerCase().includes(appliedFilters.plate.toLowerCase());
      const matchDocL = !appliedFilters.docL || appliedFilters.docL.split(',').some(term =>
        doc.externalDocId.toLowerCase().includes(term.trim().toLowerCase())
      );
      const matchCodPlan = !appliedFilters.remesaTDM || (doc.remesaTDM || '').toLowerCase().includes(appliedFilters.remesaTDM.toLowerCase());
      const matchStatus = !appliedFilters.status || doc.status === appliedFilters.status;
      const matchPlanType = !appliedFilters.planType || doc.planType === appliedFilters.planType;
      const cargueDate = doc.createdAt && !isNaN(new Date(doc.createdAt).getTime())
        ? new Date(doc.createdAt).toISOString().split('T')[0] : '';
      const matchCargue = !appliedFilters.cargueDate || cargueDate === appliedFilters.cargueDate;
      const matchDelivery = !appliedFilters.deliveryDate || (doc.deliveryDate || '').includes(appliedFilters.deliveryDate.split('-').reverse().join('/'));
      const invDate = doc.inventoryDate && !isNaN(new Date(doc.inventoryDate).getTime())
        ? new Date(doc.inventoryDate).toISOString().split('T')[0] : '';
      const matchInventory = !appliedFilters.inventoryDate || invDate === appliedFilters.inventoryDate;

      return matchPlaca && matchDocL && matchCodPlan && matchStatus && matchPlanType && matchCargue && matchDelivery && matchInventory;
    }).sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [documents, searchResults, appliedFilters, hasSearched]);

  const clearFilters = () => {
    setFilters({
      plate: '', docL: '', remesaTDM: '', status: '',
      planType: '', deliveryDate: '', cargueDate: '', inventoryDate: ''
    });
    setAppliedFilters({
      plate: '', docL: '', remesaTDM: '', status: '',
      planType: '', deliveryDate: '', cargueDate: '', inventoryDate: ''
    });
    setHasSearched(false);
    setSearchResults(null);
  };

  const handleSearch = async () => {
    setAppliedFilters(filters);
    setHasSearched(true);
    // Fetch directo a la API para no depender de la carga inicial en memoria
    if (filters.docL || filters.plate) {
      setSearching(true);
      try {
        const data = await api.getDocuments(
          undefined,
          filters.status ? [filters.status] : undefined,
          filters.docL || undefined,
          filters.plate || undefined,
        );
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        toast.error('Error al consultar documentos');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    } else {
      setSearchResults(null);
    }
  };

  const handlePdfVerification = async (file: File, targetDoc: DocumentL) => {
    setPdfVerifying(true);
    try {
      // Enviar el PDF al backend para que lo parsee con pdf-parse (Node.js)
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const resp = await fetch('/api/documents/parse-pdf', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast.error('Error al leer el PDF: ' + (err.error || resp.statusText));
        return;
      }

      const { remisiones } = await resp.json() as { remisiones: string[]; totalPages: number };

      if (!remisiones || remisiones.length === 0) {
        toast.error('No se encontraron remisiones en el PDF');
        return;
      }

      // Comparar contra las facturas del documento seleccionado
      const docInvoices = new Set(
        (targetDoc.items || [])
          .map((it: any) => (it.invoice || '').toUpperCase().trim())
          .filter(Boolean)
      );

      const rows = remisiones.map(remision => ({
        remision,
        coincide: docInvoices.has(remision.toUpperCase())
      }));

      rows.sort((a, b) => (b.coincide ? 1 : 0) - (a.coincide ? 1 : 0));

      setPdfResults({ rows, fileName: file.name, docExtId: targetDoc.externalDocId });
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión al procesar el PDF');
    } finally {
      setPdfVerifying(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const inputClass = "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-emerald-500 transition-all placeholder:text-slate-300";
  const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-1 block";

  const columnsDocs: ColumnDef<DocumentL>[] = [
    {
      header: 'Documento / Placa',
      key: 'externalDocId',
      render: (doc) => (
        <div>
          <p className="font-black text-slate-900 text-xs uppercase">{doc.externalDocId}</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">PLACA: {doc.vehicleData}</p>
        </div>
      )
    },
    {
      header: 'F. Cargue',
      key: 'createdAt',
      render: (doc) => (
        <span className="font-bold text-slate-400 text-[9px] uppercase">
          {(doc.createdAt || (doc as any).created_at)
            ? new Date(doc.createdAt || (doc as any).created_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'S/F'}
        </span>
      )
    },
    {
      header: 'Tipo Plan',
      key: 'planType',
      render: (doc) => (
        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${doc.planType === 'Plan R' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {doc.planType || 'NORMAL'}
        </span>
      )
    },
    {
      header: 'Cliente',
      key: 'clientId',
      render: (doc) => <span className="font-bold text-slate-600 text-[10px] uppercase">{doc.clientId || 'S/C'}</span>
    },
    {
      header: 'Estado',
      key: 'status',
      render: (doc) => (
        <div className="text-center">
          <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase border shadow-inner ${
            (doc.status === DocStatus.INVENTORED || doc.status === 'INVENTARIADO') ? 'bg-emerald-500 text-white border-emerald-400' :
            (doc.status === DocStatus.IN_ROUTE || doc.status === 'EN RUTA')        ? 'bg-blue-500 text-white border-blue-400' :
            (doc.status === DocStatus.DELIVERED || doc.status === 'ENTREGADO')     ? 'bg-emerald-600 text-white border-emerald-500' :
            (doc.status === DocStatus.RETURNED || doc.status === 'DEVUELTO')       ? 'bg-red-500 text-white border-red-400' :
            (doc.status === DocStatus.ELIMINATED || doc.status === 'ELIMINADO')    ? 'bg-slate-400 text-white border-slate-300' :
            'bg-amber-50 text-amber-600 border-amber-100'
          }`}>{getStatusLabel(doc.status || '')}</span>
        </div>
      )
    },
    {
      header: 'Acción',
      key: 'actions',
      sortable: false,
      render: (doc) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => { pdfVerifyTargetRef.current = doc; setPdfVerifyTarget(doc); pdfInputRef.current?.click(); }}
            disabled={pdfVerifying}
            className="p-3 bg-violet-50 text-violet-600 rounded-xl hover:bg-violet-600 hover:text-white transition-all disabled:opacity-50"
            title="Verificar PDF"
          >
            <Icons.Upload className="w-4 h-4" />
          </button>
          <button onClick={() => setSelectedDoc(doc)} className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all" title="Ver Detalle"><Icons.Eye className="w-4 h-4" /></button>
          
          {doc.status === DocStatus.INVENTORED && (
            <button 
              onClick={() => handleResendClick(doc)}
              className="p-3 bg-blue-50 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
              title="Reenviar Correo"
            >
              <Icons.Send className="w-4 h-4" />
            </button>
          )}

          {canEditAudit && (doc.status === DocStatus.INVENTORED || doc.status === 'INVENTARIADO' || doc.status === 'EST-08') && (doc.consolidatedItems || []).some((it: any) => Number(it.count_2 || it.count2 || 0) !== Number(it.expected_qty || it.expectedQty || 0)) && (
            <button 
              onClick={() => { setSelectedDoc(doc); setActiveDetailTab('audit'); }}
              className="p-3 bg-amber-50 text-amber-500 rounded-xl hover:bg-amber-600 hover:text-white transition-all"
              title="Conciliar Inventario"
            >
              <Icons.Audit className="w-4 h-4" />
            </button>
          )}

          {doc.planType === 'Plan R' && (
          <button
            onClick={() => {
              if ((doc as any).paymentsCount > 0) {
                setSelectedDoc(doc);
                setActiveDetailTab('payments');
              } else {
                setPaymentTarget(doc);
                setShowPaymentModal(true);
              }
            }} 
            className={`p-3 rounded-xl transition-all ${(doc as any).paymentsCount > 0 ? 'bg-slate-900 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
            title={(doc as any).paymentsCount > 0 ? `Pagos: ${(doc as any).paymentsCount} Cargados` : 'Cargar Pagos'}
          >
            {(doc as any).paymentsCount > 0 ? <Icons.Check className="w-4 h-4" /> : <Icons.Excel className="w-4 h-4" />}
          </button>
          )}
          {isAuthorizedToDelete && (
            <button 
              onClick={() => handleDeleteDocument(doc.id)} 
              className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white transition-all"
              title="Eliminar"
            >
              <Icons.Trash className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in p-4 md:p-6">
      {/* Input global para verificación PDF — un solo elemento para todas las filas */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && pdfVerifyTargetRef.current) handlePdfVerification(f, pdfVerifyTargetRef.current);
          if (pdfInputRef.current) pdfInputRef.current.value = '';
        }}
      />

      {/* Loading overlay PDF */}
      {pdfVerifying && (
        <div className="fixed inset-0 z-[700] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-12 flex flex-col items-center gap-6 shadow-2xl border border-slate-100 max-w-xs w-full mx-4">
            <div className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
            <div className="text-center space-y-2">
              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Analizando PDF</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Extrayendo remisiones del documento...</p>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className={labelClass}>Placa</label>
            <input type="text" placeholder="PLACA..." value={filters.plate} onChange={e => setFilters({ ...filters, plate: e.target.value })} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Documento L</label>
            <input type="text" placeholder="DOCUMENTO L..." value={filters.docL} onChange={e => setFilters({ ...filters, docL: e.target.value })} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Tipo Plan</label>
            <select value={filters.planType} onChange={e => setFilters({ ...filters, planType: e.target.value })} className={inputClass}>
              <option value=""></option>
              <option value="Plan Normal">PLAN NORMAL</option>
              <option value="Plan R">PLAN R</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Estado</label>
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className={inputClass}>
              <option value=""></option>
              {Object.values(DocStatus).map(s => <option key={s} value={s}>{getStatusLabel(s).toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 flex-wrap">
          <button onClick={handleSearch} disabled={searching} className="px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-60">
            {searching ? <Icons.RotateCcw className="w-4 h-4 animate-spin" /> : <Icons.Search className="w-4 h-4" />}
            {searching ? 'Buscando...' : 'Consultar'}
          </button>
          <button onClick={clearFilters} className="px-6 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-md">Limpiar</button>
        </div>
      </div>

      <DataTable
        data={filteredDocs}
        columns={columnsDocs}
        searchPlaceholder="Buscar documento..."
        excelFileName="M7_Historial.xlsx"
      />

      {selectedDoc && (
        <div className="fixed inset-0 z-[400] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-[95vw] h-[95vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
            <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-slate-900 shadow-lg"><Icons.Audit className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">Detalle Auditoría: {selectedDoc.externalDocId}</h3>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Milla7 Intelligence System</p>
                </div>
              </div>
                <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAddMissingInvoiceModal(true)}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-2 font-black text-[9px] uppercase border border-blue-500"
                  title="Adicionar Factura Faltante al Documento"
                >
                  ➕ Adicionar Factura
                </button>
                {(!((selectedDoc as any).paymentsCount > 0)) && (
                  <button 
                    onClick={() => { setActiveDetailTab('payments'); setPaymentTarget(selectedDoc); setShowPaymentModal(true); }}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2 font-black text-[9px] uppercase"
                  >
                    <Icons.Excel className="w-4 h-4" /> Cargar Pagos L
                  </button>
                )}
                <button onClick={() => setSelectedDoc(null)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-3xl font-thin">×</button>
              </div>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto space-y-6 custom-scrollbar bg-slate-50/20 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Estado</p>
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${
                    (selectedDoc.status === DocStatus.INVENTORED || selectedDoc.status === 'INVENTARIADO') ? 'bg-emerald-500 text-white border-emerald-400' :
                    (selectedDoc.status === DocStatus.IN_ROUTE   || selectedDoc.status === 'EN RUTA')      ? 'bg-blue-500 text-white border-blue-400' :
                    (selectedDoc.status === DocStatus.DELIVERED  || selectedDoc.status === 'ENTREGADO')    ? 'bg-emerald-600 text-white border-emerald-500' :
                    (selectedDoc.status === DocStatus.RETURNED   || selectedDoc.status === 'DEVUELTO')     ? 'bg-red-500 text-white border-red-400' :
                    'bg-amber-50 text-amber-600 border-amber-100'
                  }`}>
                    {getStatusLabel(selectedDoc.status || '')}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Remesa TDM</p>
                  <p className="font-bold text-slate-900 text-[11px] uppercase">{selectedDoc.remesaTDM || 'S/I'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Tipo</p>
                  <p className="font-bold text-emerald-600 text-[11px] uppercase">{selectedDoc.planType || 'Normal'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">F. Cargue</p>
                  <p className="font-bold text-slate-900 text-[10px] uppercase">{formatDate(selectedDoc.createdAt, true)}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Placa</p>
                  <p className="font-bold text-slate-900 text-[11px] uppercase">{selectedDoc.vehicleData}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">F. Auditoría</p>
                  <p className="font-bold text-slate-900 text-[10px] uppercase">
                    {formatDate(selectedDoc.inventoryDate, true)}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Auditor</p>
                  <p className="font-black text-slate-900 text-xs uppercase truncate" title={selectedDoc.inventoryUser}>
                    {selectedDoc.inventoryUser || 'S/A'}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Picking</p>
                  <p className="font-black text-blue-600 text-xs uppercase">
                    {(selectedDoc as any).picking_date ? new Date((selectedDoc as any).picking_date).toLocaleString('es-CO') : 'N/A'}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Picker</p>
                  <p className="font-black text-slate-900 text-xs uppercase truncate">{(selectedDoc as any).picker_user || 'S/A'}</p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Entregador</p>
                  <p className="font-black text-slate-900 text-xs uppercase truncate">{(selectedDoc as any).deliverer_user || 'S/A'}</p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Usuario Receptor</p>
                  <p className="font-black text-slate-900 text-xs uppercase truncate">{(selectedDoc as any).receiver_user || 'S/A'}</p>
                </div>
                <div className="bg-slate-900 p-5 rounded-[1.8rem] border border-slate-800 shadow-2xl flex flex-col justify-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Total Unidades Plan</p>
                  <p className="font-black text-emerald-400 text-xl tracking-tighter">
                    {selectedDoc.items.reduce((acc: any, it: any) => acc + (Number(it.expectedQty) || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm lg:col-span-2 xl:col-span-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Nota Auditoría</p>
                  <p className="font-black text-slate-600 text-[10px] uppercase italic truncate" title={selectedDoc.inventoryNotes}>{selectedDoc.inventoryNotes || 'SIN NOVEDAD'}</p>
                </div>
              </div>

               <div className="bg-white rounded-[2rem] overflow-hidden shadow-xl border border-slate-100 flex flex-col min-h-[400px]">
                <div className="p-4 border-b border-slate-50 flex flex-col xl:flex-row justify-end items-center gap-4">
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                      <button onClick={() => setActiveDetailTab('reception')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeDetailTab === 'reception' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-500'}`}>Recepción</button>
                      <button onClick={() => setActiveDetailTab('audit')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeDetailTab === 'audit' ? 'bg-white shadow-md text-amber-600' : 'text-slate-500'}`}>Auditoría</button>
                      <button onClick={() => setActiveDetailTab('payments')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeDetailTab === 'payments' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>Pagos</button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 bg-white p-4">
                  {activeDetailTab === 'reception' ? (
                    <DataTable
                        data={selectedDoc.items}
                        columns={[
                            { header: 'ARTICULO', key: 'articleId', render: (row: any) => <span className="font-black uppercase text-slate-800">{row.articleId}</span> },
                            { header: 'UN', key: 'unCode', render: (row: any) => <span className="uppercase text-slate-500 font-bold">{row.unCode || '-'}</span> },
                            { header: 'REF', key: 'clientRef', render: (row: any) => <span className="uppercase text-slate-500 font-bold">{row.clientRef || '-'}</span> },
                            { header: 'CIUDAD', key: 'city', render: (row: any) => <span className="uppercase text-slate-600">{row.city || '-'}</span> },
                            { header: 'CANT.', key: 'expectedQty', render: (row: any) => <span className="font-bold text-slate-900">{row.expectedQty}</span> },
                            { header: 'RECIBIDO', key: 'count1', render: (row: any) => <span className="text-blue-600 font-black">{row.receivedQty || row.count1 || 0}</span> },
                            { header: 'UM', key: 'unit', render: (row: any) => <span className="uppercase text-slate-500 font-bold">{row.unit || 'und'}</span> },
                            { header: 'FACTURA', key: 'invoice', render: (row: any) => (
                                (!row.invoice || String(row.invoice).trim() === '' || String(row.invoice).trim().toUpperCase() === 'S/I') ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 italic font-black text-[8px]">S/I</span>
                                      {canEditAudit && (
                                        <button
                                          onClick={() => { setEditingInvoiceItem(row); setNewInvoiceValue(''); setSaveInvoiceError(null); }}
                                          className="p-1 bg-amber-500 hover:bg-amber-600 text-white rounded transition-all"
                                        >
                                          <Icons.Edit className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </div>
                                ) : <span className="text-slate-900 font-black">{row.invoice}</span>
                            )},
                            { header: 'PEDIDO', key: 'orderNumber', render: (row: any) => <span className="text-emerald-600 font-black">{row.orderNumber || 'S/I'}</span> },
                            { header: 'PESO', key: 'peso', render: (row: any) => <span className="text-emerald-600 font-black">{formatCurrency(row.peso)}</span> },
                            { header: 'ESTADO', key: 'itemStatus', render: (row: any) => (
                                <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${row.itemStatus === 'Auditado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                    {row.itemStatus === 'En Conteo' ? 'Pendiente' : getStatusLabel(row.itemStatus || 'EST-03')}
                                </span>
                            )},
                            { header: 'OBS. CONDUCTOR', key: 'driverNote', render: (row: any) => <span className="uppercase italic text-slate-400">{'driverNote' in row ? row.driverNote : (row.observation || '-')}</span> },
                            { header: 'NOTAS AUDITORIA', key: 'inventoryNote', render: (row: any) => <span className="uppercase text-slate-600 italic">{row.inventoryNote || '-'}</span> }
                        ]}
                        excelFileName={`Recepción_${selectedDoc?.externalDocId}.xlsx`}
                    />
                  ) : activeDetailTab === 'audit' ? (
                    <DataTable
                        data={selectedDoc.consolidatedItems || []}
                        columns={[
                            { header: 'ARTICULO', key: 'articleId', render: (row: any) => <span className="font-black uppercase text-slate-800">{row.article_id || row.articleId || row.sku}</span> },
                            { header: 'CANT. PLAN', key: 'expected_qty', render: (row: any) => <span className="text-slate-900 font-bold">{row.expected_qty || row.expectedQty || 0}</span> },
                            { header: 'CONTEO 1', key: 'count_1', render: (row: any) => <span className="text-emerald-600 font-black">{row.count_1 || row.count1 || 0}</span> },
                            { header: 'CONTEO 2', key: 'count_2', render: (row: any) => <span className={`font-black ${Number(row.count_2 || row.count2 || 0) !== Number(row.expected_qty || row.expectedQty || 0) ? 'text-red-600' : 'text-amber-600'}`}>{row.count_2 || row.count2 || 0}</span> },
                            { header: 'ALISTADO', key: 'picked_qty', render: (row: any) => <span className="text-slate-500 font-bold">{row.picked_qty || row.pickedQty || 0}</span> },
                            { header: 'DESPACHADO', key: 'dispatched_qty', render: (row: any) => <span className="text-slate-500 font-bold">{row.dispatched_qty || row.dispatchedQty || 0}</span> },
                            { header: 'OBS. INVENTARIO', key: 'inventory_observation', render: (row: any) => <span className="uppercase italic text-slate-400">{row.inventory_observation || row.inventoryObservation || '-'}</span> },
                            { header: 'ACCIONES', key: 'actions', sortable: false, render: (row: any) => {
                                const hasDiff = Number(row.count_2 || row.count2 || 0) !== Number(row.expected_qty || row.expectedQty || 0);
                                return canEditAudit ? (
                                    <div className="flex gap-2">
                                        {!!(row.inventory_observation || row.inventoryObservation) && (
                                            <button onClick={() => fetchHistory(selectedDoc?.id || '', row.article_id || row.articleId || row.sku)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600"><Icons.History className="w-3.5 h-3.5" /></button>
                                        )}
                                        {hasDiff && selectedDoc && (selectedDoc.status === DocStatus.INVENTORED || selectedDoc.status === 'INVENTARIADO' || selectedDoc.statusId === 'EST-08') && (
                                            <button onClick={() => { setEditingAuditItem(row); setEditCount2(String(row.count_2 || row.count2 || 0)); setEditObservation(''); setEditAuditError(null); }} className="px-2 py-1 bg-amber-500 text-white rounded-lg text-[8px] font-black">CONCILIAR</button>
                                        )}
                                    </div>
                                ) : null;
                            }}
                        ]}
                        excelFileName={`Auditoria_${selectedDoc?.externalDocId}.xlsx`}
                    />
                  ) : (
                    <DataTable
                        data={selectedDoc.payments || []}
                        columns={[
                            { header: 'FACTURA / REF', key: 'invoice', render: (row: any) => (
                                <div><span className="font-black uppercase text-slate-800">{row.invoice}</span><div className="text-[7px] text-slate-400 font-bold uppercase">{row.paymentRef || 'S/R'}</div></div>
                            )},
                            { header: 'VALOR MÉTODO', key: 'paymentValue', render: (row: any) => <span className="text-indigo-600 font-black">{formatCurrency(row.paymentValue)}</span> },
                            { header: 'MÉTODO PAGO', key: 'paymentMethod', render: (row: any) => <span className="uppercase text-slate-900 font-bold">{row.paymentMethod || 'S/M'}</span> },
                            { header: 'UN CODE', key: 'unCode', render: (row: any) => <span className="text-slate-400 font-mono">{row.unCode || '-'}</span> }
                        ]}
                        excelFileName={`Pagos_${selectedDoc?.externalDocId}.xlsx`}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="p-5 border-t bg-white flex justify-end shrink-0">
              <button onClick={() => setSelectedDoc(null)} className="px-10 py-4 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-2xl">Cerrar Detalle Histórico</button>
            </div>
          </div>
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

      {showPaymentModal && paymentTarget && (
        <ProcessPaymentLModal 
          document={paymentTarget}
          userId={user.id}
          onClose={() => { setShowPaymentModal(false); setPaymentTarget(null); }}
          onSuccess={() => { if (onRefresh) onRefresh(); }}
        />
      )}

      {showAddMissingInvoiceModal && selectedDoc && (
        <AddMissingInvoiceModal
            isOpen={showAddMissingInvoiceModal}
            onClose={() => setShowAddMissingInvoiceModal(false)}
            documentId={selectedDoc.id}
            routes={[]}
            onSuccess={() => {
                if (onRefresh) onRefresh();
            }}
        />
      )}

      {/* DIÁLOGO VERIFICACIÓN PDF */}
      {pdfResults && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
            {/* Header */}
            <div className="bg-violet-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-400 rounded-lg flex items-center justify-center"><Icons.Upload className="w-4 h-4 text-violet-900" /></div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">Verificación de PDF</h3>
                  <p className="text-[8px] font-bold text-violet-300 uppercase tracking-widest truncate max-w-[300px]">Doc: {pdfResults.docExtId} — {pdfResults.fileName}</p>
                </div>
              </div>
              <button onClick={() => setPdfResults(null)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-600 transition-all text-2xl font-thin">×</button>
            </div>

            {/* Summary badges */}
            <div className="flex gap-4 p-5 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-emerald-600">{pdfResults.rows.filter(r => r.coincide).length}</p>
                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Coinciden</p>
              </div>
              <div className="flex-1 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-rose-600">{pdfResults.rows.filter(r => !r.coincide).length}</p>
                <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mt-0.5">No coinciden</p>
              </div>
              <div className="flex-1 bg-slate-100 border border-slate-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-slate-700">{pdfResults.rows.length}</p>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Total PDF</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar p-5">
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="px-5 py-3 text-left font-black uppercase tracking-widest">Remisión # (PDF)</th>
                      <th className="px-5 py-3 text-center font-black uppercase tracking-widest">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pdfResults.rows.map((r, i) => (
                      <tr key={i} className={`transition-colors ${r.coincide ? 'hover:bg-emerald-50/50' : 'hover:bg-rose-50/50'}`}>
                        <td className="px-5 py-2.5 font-black text-slate-800 tracking-tight">{r.remision}</td>
                        <td className="px-5 py-2.5 text-center">
                          <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase border ${
                            r.coincide
                              ? 'bg-emerald-500 text-white border-emerald-400'
                              : 'bg-rose-500 text-white border-rose-400'
                          }`}>
                            {r.coincide ? 'COINCIDE' : 'NO COINCIDE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 border-t bg-white flex justify-between items-center shrink-0">
              <button
                onClick={() => {
                  const ws = XLSX.utils.json_to_sheet(
                    pdfResults!.rows.map(r => ({
                      'REMISIÓN # (PDF)': r.remision,
                      'DOCUMENTO': pdfResults!.docExtId,
                      'RESULTADO': r.coincide ? 'COINCIDE' : 'NO COINCIDE'
                    }))
                  );
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Verificacion_PDF');
                  XLSX.writeFile(wb, `Verificacion_${pdfResults!.docExtId}_${Date.now()}.xlsx`);
                }}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2"
              >
                <Icons.Excel className="w-4 h-4" /> Exportar Excel
              </button>
              <button onClick={() => setPdfResults(null)} className="px-10 py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-violet-700 transition-all shadow-xl">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial de Conciliación */}
      {historyTarget && (
        <div className="fixed inset-0 z-[610] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setHistoryTarget(null)} />
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100 flex flex-col max-h-[80vh]">
            <div className="p-8 pb-4 shrink-0 flex justify-between items-center border-b border-slate-100">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Icons.History className="w-6 h-6 text-indigo-500" />
                  Historial de Conciliación
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                  Artículo: <span className="text-indigo-600">{historyTarget}</span>
                </p>
              </div>
              <button onClick={() => setHistoryTarget(null)} className="w-10 h-10 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-400 rounded-2xl flex items-center justify-center transition-all">
                <Icons.X />
              </button>
            </div>
            <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                  <Icons.Loader className="w-8 h-8 animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Cargando historial...</p>
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="text-center py-10">
                  <Icons.Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500">No hay correcciones registradas para este artículo.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyLogs.map((log, idx) => (
                    <div key={idx} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-400 to-indigo-600"></div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Modificado por</p>
                          <p className="text-xs font-black text-slate-800 uppercase bg-slate-100 px-2 py-1 rounded-md inline-block">{log.changed_by || 'SISTEMA'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha y Hora</p>
                          <p className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded-md">
                            {new Date(log.changed_at).toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 py-3 border-y border-slate-100 my-4">
                        <div className="flex-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Anterior</p>
                          <p className="text-xl font-black text-rose-500">{log.old_count_2}</p>
                        </div>
                        <div className="text-slate-300">
                          <Icons.ChevronRight className="w-6 h-6" />
                        </div>
                        <div className="flex-1 text-right">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nuevo Valor</p>
                          <p className="text-xl font-black text-emerald-500">{log.new_count_2}</p>
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Motivo / Observación</p>
                        <p className="text-[11px] font-bold text-slate-600 italic bg-amber-50/50 p-3 rounded-xl border border-amber-100/50">
                          "{log.observation || 'Sin justificación registrada'}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Edición Factura Recepción */}
      {editingInvoiceItem && (
        <div className="fixed inset-0 z-[610] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => !isSavingInvoice && setEditingInvoiceItem(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="h-2 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500" />
            <div className="p-8 flex flex-col gap-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1">Asignación de Factura</p>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingInvoiceItem.articleId}</h3>
                <p className="text-[10px] text-slate-400 mt-1">Pedido: <span className="font-black text-slate-700">{editingInvoiceItem.orderNumber || 'S/I'}</span> · Cliente: <span className="font-black text-slate-700">{selectedDoc?.clientId || 'S/I'}</span></p>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Número de Factura</label>
                <input
                  type="text"
                  value={newInvoiceValue}
                  onChange={e => setNewInvoiceValue(e.target.value.toUpperCase())}
                  placeholder="Escriba el número de factura..."
                  className="w-full border-2 border-emerald-200 rounded-xl px-4 py-3 text-sm font-black text-emerald-700 focus:outline-none focus:border-emerald-500 bg-emerald-50/30 uppercase"
                  disabled={isSavingInvoice}
                />
              </div>
              {saveInvoiceError && <p className="text-[10px] font-black text-red-500 bg-red-50 px-4 py-2 rounded-xl">{saveInvoiceError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingInvoiceItem(null)} disabled={isSavingInvoice}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-slate-200 transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleSaveItemInvoice} disabled={isSavingInvoice}
                  className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-600 transition-colors shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSavingInvoice ? (
                    <>
                      <Icons.RefreshCw className="w-3 h-3 animate-spin" />
                      Guardando...
                    </>
                  ) : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edición Count2 Auditoría */}
      {editingAuditItem && (
        <div className="fixed inset-0 z-[610] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => !editAuditLoading && setEditingAuditItem(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />
            <div className="p-8 flex flex-col gap-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">Corrección de Conteo</p>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingAuditItem.article_id || editingAuditItem.articleId || editingAuditItem.sku}</h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  Cant. Plan: <span className="font-black text-slate-700">{editingAuditItem.expected_qty || editingAuditItem.expectedQty || 0}</span>
                  {' · '}Conteo 1: <span className="font-black text-emerald-600">{editingAuditItem.count_1 || editingAuditItem.count1 || 0}</span>
                  {' · '}Conteo 2 actual: <span className="font-black text-red-500">{editingAuditItem.count_2 || editingAuditItem.count2 || 0}</span>
                </p>
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

      {/* Modal de Confirmación de Eliminación */}
      {docToDelete && (
         <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setDocToDelete(null)} />
            <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
               <div className="h-3 bg-rose-600" />
               <div className="p-10 flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-6">
                     <Icons.Trash className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-2">Eliminar Documento</h3>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed px-4">
                     ¿Está seguro de eliminar este registro? Esta acción quedará grabada en la auditoría del sistema.
                  </p>
                  <div className="grid grid-cols-2 gap-4 w-full mt-8">
                     <button onClick={() => setDocToDelete(null)} className="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[9px] uppercase hover:bg-slate-200 transition-all">Cancelar</button>
                     <button onClick={confirmDelete} className="py-4 bg-rose-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg hover:bg-rose-700 transition-all">Confirmar</button>
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
};

export default ConsultasDocumentosL;
