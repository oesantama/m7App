
import React, { useState, useMemo, useRef } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice, getStatusLabel } from '../types';
import { api } from '../services/api';
import { toast } from 'sonner';
import ProcessPaymentLModal from './ProcessPaymentLModal';
import * as XLSX from 'xlsx';
import TableControls from './shared/TableControls';
import { formatCurrency, formatDate } from '../utils/formatting';

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
    codplan: '',
    status: '',
    planType: '',
    deliveryDate: '',
    cargueDate: '',
    inventoryDate: ''
  });
  const [selectedDoc, setSelectedDoc] = useState<DocumentL | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // States for Document L Payment Upload
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<DocumentL | null>(null);

  // ESTADOS para el modal de detalle
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState<number | 'all'>(10);
  const [activeDetailTab, setActiveDetailTab] = useState<'reception' | 'audit' | 'payments'>('reception');

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
      const token = localStorage.getItem('token') || '';
      const articleId = editingAuditItem.article_id || editingAuditItem.articleId || editingAuditItem.sku;
      const resp = await fetch('/api/documents/consolidated-count2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ docId: selectedDoc.id, articleId, newCount2: newVal, observation: finalObs }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error al guardar');
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
    return documents.filter(doc => {
      const matchPlaca = !filters.plate || (doc.vehicleData || '').toLowerCase().includes(filters.plate.toLowerCase());
      const matchDocL = !filters.docL || filters.docL.split(',').some(term => 
        doc.externalDocId.toLowerCase().includes(term.trim().toLowerCase())
      );
      const matchCodPlan = !filters.codplan || (doc.codplan || '').toLowerCase().includes(filters.codplan.toLowerCase());
      const matchStatus = !filters.status || doc.status === filters.status;
      const matchPlanType = !filters.planType || doc.planType === filters.planType;
      const cargueDate = doc.createdAt && !isNaN(new Date(doc.createdAt).getTime())
        ? new Date(doc.createdAt).toISOString().split('T')[0]
        : '';
      const matchCargue = !filters.cargueDate || cargueDate === filters.cargueDate;
      const matchDelivery = !filters.deliveryDate || (doc.deliveryDate || '').includes(filters.deliveryDate.split('-').reverse().join('/'));

      const invDate = doc.inventoryDate && !isNaN(new Date(doc.inventoryDate).getTime())
        ? new Date(doc.inventoryDate).toISOString().split('T')[0]
        : '';
      const matchInventory = !filters.inventoryDate || invDate === filters.inventoryDate;

      return matchPlaca && matchDocL && matchCodPlan && matchStatus && matchPlanType && matchCargue && matchDelivery && matchInventory;
    }).sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [documents, filters]);

  const paginatedDocs = useMemo(() => {
    if (rowsPerPage === 'all') return filteredDocs;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredDocs.slice(start, start + rowsPerPage);
  }, [filteredDocs, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(filteredDocs.length / rowsPerPage);

  const clearFilters = () => {
    setFilters({
      plate: '', docL: '', codplan: '', status: '',
      planType: '', deliveryDate: '', cargueDate: '', inventoryDate: ''
    });
    setCurrentPage(1);
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
              <option value="">TODOS</option>
              <option value="Plan Normal">PLAN NORMAL</option>
              <option value="Plan R">PLAN R</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Estado</label>
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className={inputClass}>
              <option value="">TODOS</option>
              {Object.values(DocStatus).map(s => <option key={s} value={s}>{getStatusLabel(s).toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 flex-wrap">
          <button onClick={() => exportToExcel(filteredDocs, "M7_Historial")} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2">
            <Icons.Excel className="w-4 h-4" /> Exportar
          </button>
          <button onClick={clearFilters} className="px-6 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-md">Limpiar</button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
              <tr>
                <th className="px-6 py-5">Documento / Placa</th>
                <th className="px-6 py-5">F. Cargue</th>
                <th className="px-6 py-5">Tipo Plan</th>
                <th className="px-6 py-5">Cliente</th>
                <th className="px-6 py-5 text-center">Estado</th>
                <th className="px-6 py-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-all">
                  <td className="px-6 py-5">
                    <p className="font-black text-slate-900 text-xs uppercase">{doc.externalDocId}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">PLACA: {doc.vehicleData}</p>
                  </td>
                  <td className="px-6 py-5 font-bold text-slate-400 text-[9px] uppercase">
                    {(doc.createdAt || (doc as any).created_at)
                      ? new Date(doc.createdAt || (doc as any).created_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      : 'S/F'}
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${doc.planType === 'Plan R' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {doc.planType || 'NORMAL'}
                    </span>
                  </td>
                  <td className="px-6 py-5 font-bold text-slate-600 text-[10px] uppercase">{doc.clientId || 'S/C'}</td>
                  <td className="px-6 py-5 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase border shadow-inner ${
                      (doc.status === DocStatus.INVENTORED || doc.status === 'INVENTARIADO') ? 'bg-emerald-500 text-white border-emerald-400' :
                      (doc.status === DocStatus.IN_ROUTE || doc.status === 'EN RUTA')        ? 'bg-blue-500 text-white border-blue-400' :
                      (doc.status === DocStatus.DELIVERED || doc.status === 'ENTREGADO')     ? 'bg-emerald-600 text-white border-emerald-500' :
                      (doc.status === DocStatus.RETURNED || doc.status === 'DEVUELTO')       ? 'bg-red-500 text-white border-red-400' :
                      (doc.status === DocStatus.ELIMINATED || doc.status === 'ELIMINADO')    ? 'bg-slate-400 text-white border-slate-300' :
                      'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>{getStatusLabel(doc.status || '')}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
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

                      {canEditAudit && (doc.consolidatedItems || []).some((it: any) => Number(it.count_2 || it.count2 || 0) !== Number(it.expected_qty || it.expectedQty || 0)) && (
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
                  onClick={handleDetailExport}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-2 font-black text-[9px] uppercase border border-slate-200"
                  title="Exportar Detalle Actual a Excel"
                >
                  <Icons.Excel className="w-4 h-4" /> Exportar Excel
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
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Cod. Plan</p>
                  <p className="font-bold text-slate-900 text-[11px] uppercase">{selectedDoc.codplan || 'S/I'}</p>
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
                {/* BARRA DE BÚSQUEDA Y TABS */}
                <div className="p-4 border-b border-slate-50 flex flex-col xl:flex-row justify-between items-center gap-4">
                  <div className="flex-1 w-full max-w-2xl">
                    <TableControls
                      searchValue={detailSearch}
                      onSearchChange={(val: string) => { setDetailSearch(val); setDetailPage(1); }}
                      pageSize={detailPageSize}
                      onPageSizeChange={(size: any) => { setDetailPageSize(size); setDetailPage(1); }}
                      placeholder="SKU, PEDIDO O FACTURA..."
                      compact
                    />
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                      <button onClick={() => { setActiveDetailTab('reception'); setDetailPage(1); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeDetailTab === 'reception' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-500'}`}>Recepción</button>
                      <button onClick={() => { setActiveDetailTab('audit'); setDetailPage(1); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeDetailTab === 'audit' ? 'bg-white shadow-md text-amber-600' : 'text-slate-500'}`}>Auditoría</button>
                      <button onClick={() => { setActiveDetailTab('payments'); setDetailPage(1); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeDetailTab === 'payments' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>Pagos</button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto flex-1 bg-white relative">
                  {activeDetailTab === 'reception' ? (
                    // TABLA DE RECEPCIÓN (Detalle Items)
                    <table className="w-full text-left text-[10px] animate-in fade-in slide-in-from-left-4 duration-300">
                      <thead className="bg-slate-900 text-white uppercase tracking-widest font-black sticky top-0 z-10">
                        <tr>
                          <th className="p-4 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('articleId')}>Articulo{getSortIndicator('articleId')}</th>
                          <th className="p-4 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('unCode')}>UN{getSortIndicator('unCode')}</th>
                          <th className="p-4 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('clientRef')}>REF{getSortIndicator('clientRef')}</th>
                          <th className="p-4 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('city')}>Ciudad{getSortIndicator('city')}</th>
                          <th className="p-4 text-center cursor-pointer hover:text-emerald-400" onClick={() => requestSort('expectedQty')}>Cant.{getSortIndicator('expectedQty')}</th>
                          <th className="p-4 text-center bg-blue-600/20 cursor-pointer hover:text-emerald-400" onClick={() => requestSort('count1')}>Recibido{getSortIndicator('count1')}</th>
                          <th className="p-4 text-center">UM</th>
                          <th className="p-4 text-center cursor-pointer hover:text-emerald-400" onClick={() => requestSort('invoice')}>Factura{getSortIndicator('invoice')}</th>
                          <th className="p-4 text-center cursor-pointer hover:text-emerald-400" onClick={() => requestSort('orderNumber')}>Pedido{getSortIndicator('orderNumber')}</th>
                          <th className="p-4 text-center">Peso</th>
                          <th className="p-4 text-center">Estado</th>
                          <th className="p-4">Obs. Conductor</th>
                          <th className="p-4">Notas Auditoría</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {paginatedDetailItems.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-all text-[9px] border-b border-slate-50 last:border-0">
                            <td className="px-4 py-2 font-black uppercase text-slate-800 tracking-tight leading-tight">{it.articleId}</td>
                            <td className="px-4 py-2 uppercase text-slate-500 font-bold max-w-[80px] truncate" title={(it as any).unCode}>{(it as any).unCode || '-'}</td>
                            <td className="px-4 py-2 uppercase text-slate-500 font-bold max-w-[80px] truncate" title={(it as any).clientRef}>{(it as any).clientRef || '-'}</td>
                            <td className="px-4 py-2 uppercase text-slate-600 max-w-[80px] truncate" title={(it as any).city}>{(it as any).city || '-'}</td>
                            <td className="px-4 py-2 text-center text-slate-900 font-bold">{it.expectedQty}</td>
                            <td className="px-4 py-2 text-center text-blue-600 font-black bg-blue-50/20">{it.receivedQty || it.count1 || 0}</td>
                            <td className="px-4 py-2 text-center text-slate-500 uppercase font-bold">{it.unit || 'und'}</td>
                            <td className="px-4 py-2 text-center text-slate-500 font-bold">{(it as any).invoice || '-'}</td>
                            <td className="px-4 py-2 text-center text-emerald-600 font-black">{it.orderNumber || 'S/I'}</td>
                            <td className="px-4 py-2 text-center text-emerald-600 font-black">{formatCurrency(it.peso)}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${it.itemStatus === 'Auditado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                {it.itemStatus === 'En Conteo' ? 'Pendiente' : (it.itemStatus || 'Pendiente')}
                              </span>
                            </td>
                            <td className="px-4 py-2 uppercase italic text-slate-400 max-w-[150px] truncate" title={'driverNote' in it ? (it as any).driverNote : (it as any).observation}>{'driverNote' in it ? (it as any).driverNote : (it as any).observation || '-'}</td>
                            <td className="px-4 py-2 uppercase text-slate-600 max-w-[150px] truncate italic" title={it.inventoryNote}>{it.inventoryNote || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : activeDetailTab === 'audit' ? (
                    // TABLA DE AUDITORÍA (Consolidado)
                    <table className="w-full text-left text-[10px] animate-in fade-in slide-in-from-right-4 duration-300">
                      <thead className="bg-emerald-900 text-white uppercase tracking-widest font-black sticky top-0 z-10">
                        <tr>
                          <th className="p-4">Articulo</th>
                          <th className="p-4 text-center">Cant. Plan</th>
                          <th className="p-4 text-center bg-emerald-800/50">Conteo 1</th>
                          <th className="p-4 text-center bg-amber-800/50">Conteo 2</th>
                          <th className="p-4 text-center">Alistado</th>
                          <th className="p-4 text-center">Despachado</th>
                          <th className="p-4">Obs. Inventario</th>
                          {canEditAudit && <th className="p-4 text-center w-20"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {paginatedDetailItems.map((it: any, idx: number) => {
                          const itCount2 = Number(it.count_2 || it.count2 || 0);
                          const itExpected = Number(it.expected_qty || it.expectedQty || 0);
                          const hasDiff = itCount2 !== itExpected;
                          return (
                            <tr key={idx} className={`hover:bg-slate-50 transition-all text-[9px] border-b border-slate-50 last:border-0 ${hasDiff ? 'bg-red-50/30' : ''}`}>
                              <td className="px-4 py-2 font-black uppercase text-slate-800 tracking-tight">{it.article_id || it.articleId || it.sku}</td>
                              <td className="px-4 py-2 text-center text-slate-900 font-bold">{itExpected}</td>
                              <td className="px-4 py-2 text-center text-emerald-600 font-black bg-emerald-50/20">{it.count_1 || it.count1 || 0}</td>
                              <td className={`px-4 py-2 text-center font-black bg-amber-50/20 ${hasDiff ? 'text-red-600' : 'text-amber-600'}`}>{itCount2}</td>
                              <td className="px-4 py-2 text-center text-slate-500 font-bold">{it.picked_qty || it.pickedQty || 0}</td>
                              <td className="px-4 py-2 text-center text-slate-500 font-bold">{it.dispatched_qty || it.dispatchedQty || 0}</td>
                              <td className="px-4 py-2 uppercase italic text-slate-400 max-w-[200px] truncate font-medium" title={it.inventory_observation || it.inventoryObservation}>{it.inventory_observation || it.inventoryObservation || '-'}</td>
                              {canEditAudit && (
                                <td className="px-4 py-2 text-center">
                                  {hasDiff && (
                                    <button
                                      onClick={() => { setEditingAuditItem(it); setEditCount2(String(itCount2)); setEditObservation(''); setEditAuditError(null); }}
                                      className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[8px] font-black uppercase transition-all"
                                      title="Corregir Conteo 2"
                                    >
                                      CONCILIAR
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {(!selectedDoc.consolidatedItems || selectedDoc.consolidatedItems.length === 0) && (
                          <tr>
                            <td colSpan={canEditAudit ? 8 : 7} className="p-10 text-center text-slate-500 italic">No hay datos consolidados disponibles.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    // TABLA DE PAGOS (Recaudos)
                    <table className="w-full text-left text-[10px] animate-in fade-in zoom-in-95 duration-300">
                      <thead className="bg-indigo-900 text-white uppercase tracking-widest font-black sticky top-0 z-10">
                        <tr>
                          <th className="p-4">FACTURA / REF</th>
                          <th className="p-4 text-center">VALOR MÉTODO</th>
                          <th className="p-4">MÉTODO PAGO</th>
                          <th className="p-4 text-center">UN CODE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {paginatedDetailItems.map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors text-[9px]">
                            <td className="p-4 font-black uppercase text-slate-800 tracking-tight">
                              {it.invoice}
                              <div className="text-[7px] text-slate-400 font-bold uppercase">{it.paymentRef || 'S/R'}</div>
                            </td>
                            <td className="p-4 text-center text-indigo-600 font-black bg-indigo-50/30">{formatCurrency(it.paymentValue)}</td>
                            <td className="p-4 uppercase text-slate-900 font-bold">{(it as any).paymentMethod || 'S/M'}</td>
                            <td className="p-4 text-center text-slate-400 font-mono">{(it as any).unCode || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* PAGINACIÓN DEL DETALLE */}
                {totalDetailPageItems > 1 && (
                  <div className="p-6 border-t border-slate-50 flex justify-center items-center gap-4 bg-white">
                    <button disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)} className="p-3 bg-slate-50 rounded-xl disabled:opacity-30 hover:bg-slate-900 hover:text-white transition-all shadow-sm"><Icons.ChevronRight className="rotate-180 w-4 h-4" /></button>
                    <span className="text-[10px] font-black uppercase text-slate-900 bg-slate-100 px-6 py-2 rounded-lg">Pág {detailPage} de {totalDetailPageItems}</span>
                    <button disabled={detailPage >= totalDetailPageItems} onClick={() => setDetailPage(p => p + 1)} className="p-3 bg-slate-50 rounded-xl disabled:opacity-30 hover:bg-slate-900 hover:text-white transition-all shadow-sm"><Icons.ChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
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
