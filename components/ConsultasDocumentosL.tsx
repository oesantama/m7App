
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { DocumentL, User, DocStatus, MasterRecord, Invoice } from '../types';
import { api } from '../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ConsultasDocumentosLProps {
  documents: DocumentL[];
  invoices: Invoice[];
  user: User;
  masterEstados: MasterRecord[];
}

const ConsultasDocumentosL: React.FC<ConsultasDocumentosLProps> = ({ documents, invoices, user, masterEstados }) => {
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

  // ESTADOS para el modal de detalle
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState<number | 'all'>(10);
  const [activeDetailTab, setActiveDetailTab] = useState<'reception' | 'audit'>('reception');

  // Estados para Reenvío de Correo
  const [manualEmail, setManualEmail] = useState('');
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [resendTarget, setResendTarget] = useState<DocumentL | null>(null);

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

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "M7_Historial");
    XLSX.writeFile(wb, `${fileName}_${new Date().getTime()}.xlsx`);
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

  const inputClass = "w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[11px] font-black uppercase outline-none focus:border-emerald-500 transition-all placeholder:text-slate-300";
  const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4 mb-1 block";

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <div className="flex justify-end gap-4">
          <button onClick={() => exportToExcel(filteredDocs, "M7_Historial")} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-3">
            <Icons.Excel /> Exportar Excel
          </button>
          <button onClick={clearFilters} className="px-10 py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all">Limpiar Filtros</button>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
              <tr>
                <th className="p-8">Documento / Placa</th>
                <th className="p-8">UN Orig</th>
                <th className="p-8">F. Envío</th>
                <th className="p-8 text-center">Estado</th>
                <th className="p-8 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-all">
                  <td className="p-8">
                    <p className="font-black text-slate-900 text-sm uppercase">{doc.externalDocId}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">PLACA: {doc.vehicleData}</p>
                  </td>
                  <td className="p-8 font-black text-slate-600 text-[11px] uppercase">{doc.planType || 'Plan Normal'}</td>
                  <td className="p-8 font-black text-slate-400 text-[10px] uppercase">{doc.deliveryDate}</td>
                  <td className="p-8 text-center">
                    <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase border shadow-inner ${doc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>{doc.status}</span>
                  </td>
                  <td className="p-8 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setSelectedDoc(doc)} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all"><Icons.Eye /></button>
                      {doc.status === DocStatus.INVENTORED && (
                        <button
                          onClick={() => handleResendClick(doc)}
                          className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all"
                          title="Reenviar Correo"
                        >
                          <Icons.Send className="w-4 h-4" />
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
        <div className="fixed inset-0 z-[400] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-10 animate-in fade-in zoom-in-95">
          <div className="bg-white w-[90vw] h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/5">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-900 shadow-xl"><Icons.Audit /></div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter leading-none">Detalle Auditoría M7: {selectedDoc.externalDocId}</h3>
                  <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1">Trazabilidad Total de Inventario</p>
                </div>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-3xl font-thin hover:text-red-500 transition-all leading-none">&times;</button>
            </div>

            <div className="p-10 md:p-14 overflow-y-auto space-y-10 custom-scrollbar bg-slate-50/20 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <div className="bg-white p-5 rounded-[1.8rem] border border-emerald-100 shadow-sm bg-emerald-50/10">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Estado Documento</p>
                  <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase border shadow-inner ${selectedDoc.status === DocStatus.INVENTORED ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {selectedDoc.status === 'En Conteo' ? 'Pendiente' : selectedDoc.status}
                  </span>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Cod. Plan</p>
                  <p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.codplan || 'S/I'}</p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">UN ORIG (TIPO)</p>
                  <p className="font-black text-emerald-600 text-xs uppercase">{selectedDoc.planType || 'Plan Normal'}</p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Cargue (es-CO)</p>
                  <p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.createdAt ? new Date(selectedDoc.createdAt).toLocaleString('es-CO') : 'S/I'}</p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Placa</p>
                  <p className="font-black text-slate-900 text-xs uppercase">{selectedDoc.vehicleData}</p>
                </div>
                <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">F. Auditoría (es-CO)</p>
                  <p className="font-black text-slate-900 text-xs uppercase">
                    {selectedDoc.inventoryDate ? new Date(selectedDoc.inventoryDate).toLocaleString('es-CO') : 'PENDIENTE'}
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

              <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border-4 border-slate-100 flex flex-col min-h-[400px]">
                {/* BARRA DE BÚSQUEDA Y TABS */}
                <div className="p-4 border-b border-slate-50 flex flex-col xl:flex-row justify-between items-center gap-4">
                  <div className="flex-1 w-full max-w-2xl">
                    <TableControls
                      searchValue={detailSearch}
                      onSearchChange={(val: string) => { setDetailSearch(val); setDetailPage(1); }}
                      pageSize={detailPageSize}
                      onPageSizeChange={(size: any) => { setDetailPageSize(size); setDetailPage(1); }}
                      placeholder="BUSCAR SKU, PEDIDO O FACTURA..."
                    />
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
                      <button onClick={() => { setActiveDetailTab('reception'); setDetailPage(1); }} className={`px-5 py-2 rounded-md text-[9px] font-black uppercase transition-all ${activeDetailTab === 'reception' ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>Recepción</button>
                      <button onClick={() => { setActiveDetailTab('audit'); setDetailPage(1); }} className={`px-5 py-2 rounded-md text-[9px] font-black uppercase transition-all ${activeDetailTab === 'audit' ? 'bg-white shadow-md text-emerald-600' : 'text-slate-400'}`}>Auditoría</button>
                    </div>
                    <div className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg">
                      Reg: {sortedDetailItems.length}
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
                          <tr key={idx} className="hover:bg-slate-50 transition-colors text-[9px]">
                            <td className="p-4 font-black uppercase text-slate-800 tracking-tight">{it.articleId}</td>
                            <td className="p-4 uppercase text-slate-500 font-bold max-w-[80px] truncate" title={(it as any).unCode}>{(it as any).unCode || '-'}</td>
                            <td className="p-4 uppercase text-slate-500 font-bold max-w-[80px] truncate" title={(it as any).clientRef}>{(it as any).clientRef || '-'}</td>
                            <td className="p-4 uppercase text-slate-600 max-w-[80px] truncate" title={(it as any).city}>{(it as any).city || '-'}</td>
                            <td className="p-4 text-center text-slate-900">{it.expectedQty}</td>
                            <td className="p-4 text-center text-blue-600 font-black bg-blue-50/30">{it.receivedQty || it.count1 || 0}</td>
                            <td className="p-4 text-center text-slate-500 uppercase">{it.unit || 'und'}</td>
                            <td className="p-4 text-center text-slate-500 max-w-[80px] truncate" title={(it as any).invoice || ''}>{(it as any).invoice || '-'}</td>
                            <td className="p-4 text-center text-emerald-600 font-black">{it.orderNumber || 'S/I'}</td>
                            <td className="p-4 text-center text-emerald-600 font-black">
                              {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(it.peso || 0)}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${it.itemStatus === 'Auditado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                {it.itemStatus === 'En Conteo' ? 'Pendiente' : (it.itemStatus || (it.countedQty > 0 ? 'Auditado' : 'Pendiente'))}
                              </span>
                            </td>
                            <td className="p-4 uppercase italic text-slate-400 max-w-[150px] truncate" title={'driverNote' in it ? (it as any).driverNote : (it as any).observation}>{'driverNote' in it ? (it as any).driverNote : (it as any).observation || '-'}</td>
                            <td className="p-4 uppercase text-slate-600 max-w-[150px] truncate" title={it.inventoryNote}>{it.inventoryNote || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
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
                          <tr key={idx} className="hover:bg-slate-50 transition-colors text-[9px]">
                            <td className="p-4 font-black uppercase text-slate-800 tracking-tight">{it.article_id || it.articleId || it.sku}</td>
                            <td className="p-4 text-center text-slate-900">{it.expected_qty || it.expectedQty || 0}</td>
                            <td className="p-4 text-center text-emerald-600 font-black bg-emerald-50/30">{it.count_1 || it.count1 || 0}</td>
                            <td className="p-4 text-center text-amber-600 font-black bg-amber-50/30">{it.count_2 || it.count2 || 0}</td>
                            <td className="p-4 text-center text-slate-500">{it.picked_qty || it.pickedQty || 0}</td>
                            <td className="p-4 text-center text-slate-500">{it.dispatched_qty || it.dispatchedQty || 0}</td>
                            <td className="p-4 uppercase italic text-slate-400 max-w-[200px] truncate" title={it.inventory_observation || it.inventoryObservation}>{it.inventory_observation || it.inventoryObservation || '-'}</td>
                          </tr>
                        ))}
                        {(!selectedDoc.consolidatedItems || selectedDoc.consolidatedItems.length === 0) && (
                          <tr>
                            <td colSpan={7} className="p-10 text-center text-slate-500 italic">No hay datos consolidados disponibles.</td>
                          </tr>
                        )}
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

    </div>
  );
};

export default ConsultasDocumentosL;
