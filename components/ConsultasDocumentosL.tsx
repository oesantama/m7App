
import React, { useState, useMemo, useRef } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice } from '../types';
import { api } from '../services/api';
import { toast } from 'sonner';
import ProcessPaymentLModal from './ProcessPaymentLModal';
import * as XLSX from 'xlsx';
import TableControls from './shared/TableControls';
import { formatCurrency, formatDate } from '../utils/formatting';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
    matched: { pdfPedido: string; pdfRemision: string; docId: string; docExtId: string; matchField: 'pedido' | 'factura' }[];
    unmatched: { pdfPedido: string; pdfRemision: string }[];
    fileName: string;
    docExtId: string;
  } | null>(null);

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
    XLSX.utils.book_append_sheet(wb, ws, "M7_Historial");
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
      const matchDocL = !filters.docL || doc.externalDocId.toLowerCase().includes(filters.docL.toLowerCase());
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
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // Extract all text items with their x positions to reconstruct columns
      const allRows: { x: number; y: number; text: string; page: number }[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        for (const item of content.items as any[]) {
          if (item.str?.trim()) {
            allRows.push({ x: item.transform[4], y: item.transform[5], text: item.str.trim(), page: p });
          }
        }
      }

      // Find header row to locate column x-positions for PEDIDO # and REMISIÓN # TRANSFER #
      // Sort by page then y descending (top to bottom) then x
      const sorted = [...allRows].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

      // Group items by approximate y (same row = within 3px)
      const rows: { y: number; page: number; items: { x: number; text: string }[] }[] = [];
      for (const item of sorted) {
        const existing = rows.find(r => r.page === item.page && Math.abs(r.y - item.y) <= 3);
        if (existing) {
          existing.items.push({ x: item.x, text: item.text });
          existing.items.sort((a, b) => a.x - b.x);
        } else {
          rows.push({ y: item.y, page: item.page, items: [{ x: item.x, text: item.text }] });
        }
      }

      // Find header row (contains "PEDIDO" and "REMIS")
      let pedidoX = -1;
      let remisionX = -1;
      for (const row of rows) {
        const texts = row.items.map(i => i.text.toUpperCase());
        const combined = texts.join(' ');
        if (combined.includes('PEDIDO') && (combined.includes('REMIS') || combined.includes('TRANSFER'))) {
          for (const item of row.items) {
            const t = item.text.toUpperCase();
            if (t.includes('PEDIDO')) pedidoX = item.x;
            if (t.includes('REMIS') || t.includes('TRANSFER')) remisionX = item.x;
          }
          break;
        }
      }

      // Fallback: try to detect column positions from data patterns (AFE/AJV prefixes)
      const pdfEntries: { pedido: string; remision: string }[] = [];

      if (pedidoX >= 0 && remisionX >= 0) {
        const tolerance = 40;
        for (const row of rows) {
          const pedidoItem = row.items.find(i => Math.abs(i.x - pedidoX) <= tolerance);
          const remisionItem = row.items.find(i => Math.abs(i.x - remisionX) <= tolerance);
          const pedidoText = pedidoItem?.text || '';
          const remisionText = remisionItem?.text || '';
          // Only include data rows (not header, not empty, not total rows)
          if ((pedidoText.match(/^[A-Z]{2,4}\d{5,}/i) || pedidoText.match(/^\d{6,}/)) &&
              (remisionText.match(/^[A-Z]{2,4}\d{5,}/i) || remisionText === '')) {
            pdfEntries.push({ pedido: pedidoText.trim(), remision: remisionText.trim() });
          }
          // Also capture rows where only pedido has a value (multi-order per remision rows)
          if (pedidoText.match(/^[A-Z]{2,4}\d{5,}/i) && !remisionText) {
            const last = pdfEntries[pdfEntries.length - 1];
            if (last) pdfEntries.push({ pedido: pedidoText.trim(), remision: last.remision });
          }
        }
      }

      // Fallback: scan for AJV/AFE-pattern values heuristically
      if (pdfEntries.length === 0) {
        for (const row of rows) {
          const rowTexts = row.items.map(i => i.text);
          const pedidoCands = rowTexts.filter(t => /^AJV\d{7}/i.test(t));
          const remisionCands = rowTexts.filter(t => /^AFE\d{7}/i.test(t));
          for (const ped of pedidoCands) {
            pdfEntries.push({ pedido: ped, remision: remisionCands[0] || '' });
          }
        }
      }

      if (pdfEntries.length === 0) {
        toast.error('No se encontraron datos de Pedido/Remisión en el PDF');
        setPdfVerifying(false);
        return;
      }

      // Deduplicate entries
      const uniqueEntries = pdfEntries.filter((e, i, arr) =>
        arr.findIndex(x => x.pedido === e.pedido && x.remision === e.remision) === i
      );

      // Cross-reference only against the target document's items
      const matched: { pdfPedido: string; pdfRemision: string; docId: string; docExtId: string; matchField: 'pedido' | 'factura' }[] = [];
      const unmatched: { pdfPedido: string; pdfRemision: string }[] = [];

      for (const entry of uniqueEntries) {
        let found = false;
        for (const item of targetDoc.items || []) {
          const orderMatch = entry.pedido && (item.orderNumber || '').toUpperCase() === entry.pedido.toUpperCase();
          const invoiceMatch = entry.remision && ((item as any).invoice || '').toUpperCase() === entry.remision.toUpperCase();
          if (orderMatch || invoiceMatch) {
            matched.push({
              pdfPedido: entry.pedido,
              pdfRemision: entry.remision,
              docId: targetDoc.id,
              docExtId: targetDoc.externalDocId,
              matchField: orderMatch ? 'pedido' : 'factura'
            });
            found = true;
            break;
          }
        }
        if (!found) unmatched.push(entry);
      }

      setPdfResults({ matched, unmatched, fileName: file.name, docExtId: targetDoc.externalDocId });
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar el PDF');
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
            <label className={labelClass}>UN Orig</label>
            <input type="text" placeholder="UN ORIG..." value={filters.codplan} onChange={e => setFilters({ ...filters, codplan: e.target.value })} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Estado</label>
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className={inputClass}>
              <option value="">TODOS</option>
              {Object.values(DocStatus).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
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
                <th className="px-6 py-5">UN Orig</th>
                <th className="px-6 py-5">F. Envío</th>
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
                  <td className="px-6 py-5 font-bold text-slate-600 text-[10px] uppercase">{doc.codplan || doc.planType || 'MANUAL'}</td>
                  <td className="px-6 py-5 font-bold text-slate-400 text-[9px] uppercase">{doc.deliveryDate}</td>
                  <td className="px-6 py-5 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase border shadow-inner ${doc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{doc.status}</span>
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
                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${selectedDoc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {selectedDoc.status}
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
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold">
                        {paginatedDetailItems.map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-all text-[9px] border-b border-slate-50 last:border-0">
                            <td className="px-4 py-2 font-black uppercase text-slate-800 tracking-tight">{it.article_id || it.articleId || it.sku}</td>
                            <td className="px-4 py-2 text-center text-slate-900 font-bold">{it.expected_qty || it.expectedQty || 0}</td>
                            <td className="px-4 py-2 text-center text-emerald-600 font-black bg-emerald-50/20">{it.count_1 || it.count1 || 0}</td>
                            <td className="px-4 py-2 text-center text-amber-600 font-black bg-amber-50/20">{it.count_2 || it.count2 || 0}</td>
                            <td className="px-4 py-2 text-center text-slate-500 font-bold">{it.picked_qty || it.pickedQty || 0}</td>
                            <td className="px-4 py-2 text-center text-slate-500 font-bold">{it.dispatched_qty || it.dispatchedQty || 0}</td>
                            <td className="px-4 py-2 uppercase italic text-slate-400 max-w-[200px] truncate font-medium" title={it.inventory_observation || it.inventoryObservation}>{it.inventory_observation || it.inventoryObservation || '-'}</td>
                          </tr>
                        ))}
                        {(!selectedDoc.consolidatedItems || selectedDoc.consolidatedItems.length === 0) && (
                          <tr>
                            <td colSpan={7} className="p-10 text-center text-slate-500 italic">No hay datos consolidados disponibles.</td>
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
                <p className="text-2xl font-black text-emerald-600">{pdfResults.matched.length}</p>
                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Encontrados</p>
              </div>
              <div className="flex-1 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-rose-600">{pdfResults.unmatched.length}</p>
                <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mt-0.5">No encontrados</p>
              </div>
              <div className="flex-1 bg-slate-100 border border-slate-200 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-slate-700">{pdfResults.matched.length + pdfResults.unmatched.length}</p>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Total PDF</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar">
              {/* Matched */}
              {pdfResults.matched.length > 0 && (
                <div className="p-5">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Coincidencias encontradas
                  </p>
                  <div className="overflow-x-auto rounded-2xl border border-emerald-100">
                    <table className="w-full text-[9px]">
                      <thead className="bg-emerald-800 text-white">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest">Pedido # (PDF)</th>
                          <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest">Remisión # (PDF)</th>
                          <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest">Documento</th>
                          <th className="px-4 py-2.5 text-center font-black uppercase tracking-widest">Coincidió por</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-50">
                        {pdfResults.matched.map((r, i) => (
                          <tr key={i} className="hover:bg-emerald-50 transition-colors">
                            <td className="px-4 py-2 font-black text-slate-800">{r.pdfPedido || '—'}</td>
                            <td className="px-4 py-2 font-bold text-slate-600">{r.pdfRemision || '—'}</td>
                            <td className="px-4 py-2 font-black text-emerald-700 uppercase">{r.docExtId}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase border ${r.matchField === 'pedido' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                {r.matchField === 'pedido' ? 'Pedido' : 'Factura'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unmatched */}
              {pdfResults.unmatched.length > 0 && (
                <div className="p-5 pt-0">
                  <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> No encontrados en los documentos cargados
                  </p>
                  <div className="overflow-x-auto rounded-2xl border border-rose-100">
                    <table className="w-full text-[9px]">
                      <thead className="bg-rose-800 text-white">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest">Pedido # (PDF)</th>
                          <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest">Remisión # (PDF)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-50">
                        {pdfResults.unmatched.map((r, i) => (
                          <tr key={i} className="hover:bg-rose-50 transition-colors">
                            <td className="px-4 py-2 font-black text-slate-800">{r.pedido || '—'}</td>
                            <td className="px-4 py-2 font-bold text-slate-600">{r.remision || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t bg-white flex justify-end shrink-0">
              <button onClick={() => setPdfResults(null)} className="px-10 py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-violet-700 transition-all shadow-xl">Cerrar</button>
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
