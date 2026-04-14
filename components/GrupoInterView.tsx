import React, { useState, useEffect } from 'react';
import { 
  Upload, FileSpreadsheet, FileText, Search, Eye, 
  MapPin, Package, Truck, Clock, CheckCircle, 
  AlertCircle, ChevronRight, Download, Filter, User,
  Trash, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useAppStore } from '../stores/useAppStore';

interface Order {
  id: number;
  numero_documento: string;
  nit: string;
  cliente: string;
  direccion: string;
  notas_encabezado: string;
  municipio_destino: string;
  producto?: string;
  cantidad_total?: number;
  precio_total?: number;
  tipo_articulo?: string;
  peso_total_prod?: number;
  empresa: string;
  f_ultimo_corte: string | null;
  clasificacion: string;
  numero_guia: string;
  placa: string;
  estado: string;
  manifiesto?: string;
  planilla?: string;
  numero_planilla?: string;
  flete?: number;
  ruta?: string;
  items?: any[];
  historico?: any[];
  fecha_entregado: string | null;
  fecha_viaje: string | null;
  fecha_carge: string;
  create_at: string;
  create_by?: string;
  update_at?: string;
  valor_flete?: number;
  no_factura_m7?: string;
}

const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value: string; light?: boolean }> = ({ icon, label, value, light }) => (
  <div className="flex items-start gap-3">
    <div className={`mt-1 ${light ? 'text-blue-300' : 'text-blue-500'}`}>{icon}</div>
    <div className="flex flex-col">
      <span className={`text-[10px] uppercase font-black tracking-widest ${light ? 'text-white/70' : 'text-slate-400'}`}>{label}</span>
      <span className={`font-bold ${light ? 'text-white' : 'text-slate-900'} leading-tight`}>{value || '-'}</span>
    </div>
  </div>
);

const GrupoInterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'carga' | 'gestion'>('gestion');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetails, setOrderDetails] = useState<{items: any[], history: any[], novedades?: any[], reajustes?: any[]} | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showNovedadModal, setShowNovedadModal] = useState(false);
  const [showReajusteModal, setShowReajusteModal] = useState(false);
  const [newStatus, setNewStatus] = useState({ estado: '', observacion: '' });
  const [newNovedad, setNewNovedad] = useState({ observacion: '' });
  const [newReajuste, setNewReajuste] = useState({ valor: '', notas: '' });
  const [modalTab, setModalTab] = useState<'items' | 'historico' | 'novedades' | 'reajustes'>('items');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadExtra, setUploadExtra] = useState({ placa: '', fleteTotal: '', planilla: '' });
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showManifestPreview, setShowManifestPreview] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState<'operacion' | 'manifiesto' | null>(null);
  const [previewFilter, setPreviewFilter] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const itemsPerPagePreview = 10;
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [currentPageItems, setCurrentPageItems] = useState(1);
  const [currentPageHistorico, setCurrentPageHistorico] = useState(1);
  const itemsPerPageModal = 5;
  
  const [uploadProgress, setUploadProgress] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Iniciando...");
  const [isFinished, setIsFinished] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");

  const { user } = useAppStore();

  const [filters, setFilters] = useState<{
    status: string;
    client: string;
    fechaCorteDesde: string;
    fechaCorteHasta: string;
    placa?: string;
    planilla?: string;
    factura?: string;
  }>({
    status: '',
    client: '',
    fechaCorteDesde: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fechaCorteHasta: new Date().toISOString().split('T')[0],
    placa: '',
    planilla: '',
    factura: ''
  });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    // Solo carga inicial o cambio de pestaña, pero quitamos filters de la dependencia
    if (activeTab === 'gestion' && orders.length === 0) {
      // Opcional: cargar algo por defecto o dejar vacío hasta que den clic
    }
  }, [activeTab]);

  useEffect(() => {
    // Solo carga inicial si el usuario lo desea, pero según la solicitud, solo al presionar botones.
    // Dejamos vacío para que sea manual.
  }, []);

  const fetchOrders = async (query = '') => {
    try {
      setLoading(true);
      const params: any = { search: query };
      
      // [M7-OPTIMIZE] Validación de rango de fechas para notificar al usuario
      if (filters.fechaCorteDesde && filters.fechaCorteHasta) {
        const start = new Date(filters.fechaCorteDesde);
        const end = new Date(filters.fechaCorteHasta);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 90) {
          toast.warning(`Has seleccionado un rango de ${diffDays} días. La consulta podría tardar un poco más de lo habitual, por favor espera.`);
        }
        params.fechaCorteDesde = filters.fechaCorteDesde;
        params.fechaCorteHasta = filters.fechaCorteHasta;
      } else if (filters.fechaCorteDesde) {
        params.fechaCorteDesde = filters.fechaCorteDesde;
      } else if (filters.fechaCorteHasta) {
        params.fechaCorteHasta = filters.fechaCorteHasta;
      }

      if (filters.status) params.status = filters.status;
      if (filters.client) params.client = filters.client;
      if (filters.factura) params.invoice = filters.factura;
      if (filters.placa) params.plate = filters.placa;
      if (filters.planilla) params.planilla = filters.planilla;
      
      const data = await api.getGrupoInterOrders(params);
      
      // [M7-OPTIMIZE] Solo actualizamos el estado si la respuesta es válida
      // Esto evita el "falso positivo" de ver 0 resultados si la tabla se limpia antes de tiempo
      if (data) {
        if (data.length === 0) {
          toast.info('No se encontraron registros para los filtros aplicados');
        }
        setOrders(data);
        setCurrentPage(1);
      }
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      // Manejo específico para 502/Timeout
      if (error.status === 502 || error.message?.includes('502') || error.message?.includes('timeout')) {
        toast.error('El servidor tardó demasiado en responder (Timeout 502). Por favor, reduce el rango de fechas o contacta al administrador para aplicar índices de optimización.', { duration: 6000 });
      } else {
        toast.error(error.message || 'Error al cargar pedidos');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExcelFileChange = async (file: File | null) => {
    if (!file) return;
    setExcelFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (rows.length > 0) {
          const headers = rows[0] || [];
          const json = rows.slice(1).map(row => {
            const obj: any = {};
            for (let i = 0; i < headers.length; i++) {
              const h = headers[i];
              const val = row[i];
              obj[String(h || `COL_${i}`)] = (val === undefined || val === null || val === '') ? ' ' : val;
            }
            return obj;
          });
          setPreviewData(json);
        }
        setShowPreviewModal(true);
      } catch (err) {
        toast.error('Error al leer el archivo');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelUpload = async () => {
    try {
      if (!excelFile) return;
      if (!uploadExtra.placa || !uploadExtra.fleteTotal) {
        toast.error('Placa y Flete Total son obligatorios');
        return;
      }
      setLoading(true);
      const res = await api.uploadGrupoInterExcel(excelFile, user?.name || 'Admin', uploadExtra);
      if (res.duplicates > 0) {
        toast.warning(`Sincronizado: ${res.count} nuevos. Se omitieron ${res.duplicates} duplicados.`);
      } else {
        toast.success(res.message || 'Excel procesado con éxito');
      }
      setExcelFile(null);
      setPreviewData([]);
      setShowPreviewModal(false);
      fetchOrders(searchTerm);
    } catch (error: any) {
      toast.error(error.message || error.error || 'Error al subir Excel');
    } finally {
      setLoading(false);
    }
  };

  const handleManifestFileChange = async (file: File | null) => {
    if (!file) return;
    setManifestFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (rows.length > 0) {
          const headers = rows[0] || [];
          const json = rows.slice(1).map(row => {
            const obj: any = {};
            for (let i = 0; i < headers.length; i++) {
              const h = headers[i];
              const val = row[i];
              obj[String(h || `COL_${i}`)] = (val === undefined || val === null || val === '') ? ' ' : val;
            }
            return obj;
          });
          setPreviewData(json);
        }
        setShowManifestPreview(true);
      } catch (err) {
        toast.error('Error al leer el archivo');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleManifestUpload = async () => {
    if (!manifestFile) return;
    try {
      setLoading(true);
      const res = await api.uploadGrupoInterManifestExcel(manifestFile);
      toast.success(res.message || 'Manifiestos actualizados con éxito');
      setManifestFile(null);
      setPreviewData([]);
      setShowManifestPreview(false);
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || 'Error al subir Manifiestos');
    } finally {
      setLoading(false);
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) return;
    try {
      setLoading(true);
      setIsProcessing(true);
      setUploadProgress(0);
      setDebugLogs([]);
      setProcessingStatus("Iniciando escaneo de documentos...");
      
      await api.processGrupoInterPDF(pdfFile, (data) => {
        if (data.type === 'log') {
          setDebugLogs(prev => [...prev, data.message]);
          setProcessingStatus(data.message);
          if (data.progress) setUploadProgress(data.progress);
        } else if (data.type === 'end') {
          setUploadProgress(100);
          setProcessingStatus(`COMPLETADO: ${data.matches} COINCIDENCIAS.`);
          setIsFinished(true); // Marcamos el fin del proceso
          toast.success(`Se encontraron ${data.matches} coincidencias.`);
        }
      });
      setPdfFile(null);
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar PDF');
      setIsProcessing(false);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    try {
      if (orders.length === 0) {
        toast.error('No hay datos para exportar');
        return;
      }
      const exportData = orders.map(o => ({
        'Número Documento': o.numero_documento,
        'Planilla': o.numero_planilla || '-',
        'Placa': o.placa || '-',
        'Número Guía': o.numero_guia || '-',
        'Fct. Último Corte': o.f_ultimo_corte ? new Date(o.f_ultimo_corte).toLocaleDateString() : '-',
        'NIT Cliente': o.nit,
        'Nombre Cliente': o.cliente,
        'Municipio Destino': o.municipio_destino,
        'Dirección': o.direccion,
        'Manual': o.producto,
        'Clasificación': o.clasificacion,
        'Estado': o.estado,
        'Valor Flete': o.valor_flete || 0,
        'Fecha Carga': new Date(o.fecha_carge).toLocaleString()
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gestión Grupo Inter");
      XLSX.writeFile(wb, `Grupo_Inter_Gestion_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel exportado correctamente');
    } catch (error) {
      toast.error('Error al exportar');
    }
  };

  const openDetail = async (order: Order) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
    setOrderDetails(null); 
    setProductSearch('');
    setCurrentPageItems(1);
    setCurrentPageHistorico(1);
    try {
      const details = await api.getGrupoInterDetails(order.id.toString());
      setOrderDetails(details);
    } catch (error) {
      toast.error('Error al cargar detalles');
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedOrder || !newStatus.estado) return;
    try {
      setLoading(true);
      await api.updateGrupoInterStatus(selectedOrder.id.toString(), {
        ...newStatus,
        usuario: user?.name || 'System'
      });
      toast.success('Estado actualizado');
      setShowStatusModal(false);
      setNewStatus({ estado: '', observacion: '' });
      const details = await api.getGrupoInterDetails(selectedOrder.id.toString());
      setOrderDetails(details);
      fetchOrders(searchTerm);
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar estado');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNovedad = async () => {
    if (!selectedOrder) return;
    setNewNovedad({ observacion: '' });
    setShowNovedadModal(true);
  };

  const confirmAddNovedad = async () => {
    if (!selectedOrder || !newNovedad.observacion) return;
    try {
      setLoading(true);
      await api.addGrupoInterNovedad({
        pedido_id: selectedOrder.id,
        tipo: 'NOVEDAD',
        observacion: newNovedad.observacion,
        usuario: user?.name || 'System'
      });
      toast.success('Novedad registrada');
      setShowNovedadModal(false);
      const details = await api.getGrupoInterDetails(selectedOrder.id.toString());
      setOrderDetails(details);
    } catch (error: any) {
      toast.error(error.message || 'Error al registrar novedad');
    } finally {
      setLoading(false);
    }
  };

  const handleAddReajuste = async () => {
    if (!selectedOrder) return;
    setNewReajuste({ valor: '', notas: '' });
    setShowReajusteModal(true);
  };

  const confirmAddReajuste = async () => {
    if (!selectedOrder || !newReajuste.valor) return;
    const valor = parseFloat(newReajuste.valor);
    if (isNaN(valor)) return toast.error('Valor inválido');
    
    try {
      setLoading(true);
      await api.addGrupoInterReajuste({
        pedido_id: selectedOrder.id,
        numero_documento: selectedOrder.numero_documento,
        valor,
        notas: newReajuste.notas || '',
        usuario: user?.name || 'System'
      });
      toast.success('Reajuste registrado');
      setShowReajusteModal(false);
      const details = await api.getGrupoInterDetails(selectedOrder.id.toString());
      setOrderDetails(details);
      // Sincronización reactiva del flete total
      fetchOrders(searchTerm);
    } catch (error: any) {
      toast.error(error.message || 'Error al registrar reajuste');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = orderDetails?.items.filter(item => 
    item.producto.toLowerCase().includes(productSearch.toLowerCase()) ||
    item.remision?.toLowerCase().includes(productSearch.toLowerCase())
  ) || [];

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  let visibleOrders = orders.filter(o => {
    if (filters.placa && !(o.placa || '').toLowerCase().includes(filters.placa.toLowerCase().trim())) return false;
    if (filters.planilla && !(o.numero_planilla || '').toLowerCase().includes(filters.planilla.toLowerCase().trim())) return false;
    if (filters.factura && !(o.no_factura_m7 || '').toLowerCase().includes(filters.factura.toLowerCase().trim())) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (o.numero_documento || '').toLowerCase().includes(term) ||
           (o.cliente || '').toLowerCase().includes(term) ||
           String(o.nit || '').toLowerCase().includes(term) ||
           (o.numero_planilla || '').toLowerCase().includes(term) ||
           (o.placa || '').toLowerCase().includes(term) ||
           (o.municipio_destino || '').toLowerCase().includes(term) ||
           (o.estado || '').toLowerCase().includes(term) ||
           (o.no_factura_m7 || '').toLowerCase().includes(term) ||
           (o.historico && o.historico.length > 0 ? o.historico[0].estado : '').toLowerCase().includes(term);
  });

  if (sortConfig !== null) {
    visibleOrders.sort((a: any, b: any) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (sortConfig.key === 'clienteDestino') {
         aVal = (a.cliente || '') + (a.municipio_destino || '');
         bVal = (b.cliente || '') + (b.municipio_destino || '');
      } else if (sortConfig.key === 'ultimaNovedad') {
         aVal = a.historico && a.historico.length > 0 ? a.historico[0].estado : '';
         bVal = b.historico && b.historico.length > 0 ? b.historico[0].estado : '';
      }
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      {/* Overlay de Carga con Barra de Progreso */}
      {(loading || isProcessing) && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-10 rounded-[40px] shadow-2xl flex flex-col items-center max-w-sm w-full border border-white/20">
            {!isFinished && (
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              </div>
            )}
            {isFinished && (
              <div className="p-4 bg-emerald-100 text-emerald-600 rounded-full mb-6">
                <CheckCircle size={40} />
              </div>
            )}
            <h3 className="text-lg font-black text-slate-900 mb-2 uppercase tracking-tight text-center">
              {isProcessing ? (processingStatus || 'Analizando PDF...') : 'Sincronizando...'}
            </h3>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest text-center px-4">
              Por favor espere mientras el núcleo de M7 procesa su información
            </p>
            {isProcessing && !isFinished && (
              <div className="w-full mt-6 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
            
            {isFinished && (
              <button 
                onClick={() => {
                  setIsProcessing(false);
                  setIsFinished(false);
                  fetchOrders(searchTerm);
                }}
                className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition shadow-xl shadow-blue-100 active:scale-95"
              >
                Aceptar / Cerrar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
              <Package size={12} /> Gestión de Logística
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Grupo Inter</h1>
            <p className="text-slate-500 font-medium">Panel de trazabilidad y control de operaciones terrestres</p>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
            <button 
              onClick={() => setActiveTab('gestion')}
              className={`flex items-center gap-2 px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${activeTab === 'gestion' ? 'bg-white text-blue-600 shadow-lg shadow-blue-100/50' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Clock size={16} /> Gestión Operativa
            </button>
            <button 
              onClick={() => setActiveTab('carga')}
              className={`flex items-center gap-2 px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 ${activeTab === 'carga' ? 'bg-white text-blue-600 shadow-lg shadow-blue-100/50' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Upload size={16} /> Carga Masiva
            </button>
          </div>
        </div>

        {activeTab === 'carga' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Card Excel */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 flex flex-col transform transition hover:scale-[1.01]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><FileSpreadsheet size={24} /></div>
                  <h3 className="text-xl font-bold text-slate-800">Carga valorizados</h3>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Excel 1 (valorizados)</span>
                  <button onClick={() => setShowGuideModal('operacion')} className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1">
                    <AlertCircle size={12} /> VER FORMATO
                  </button>
                </div>
                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                  <Upload size={48} className="text-slate-400 group-hover:text-blue-500 mb-4" />
                  <span className="text-slate-600 font-medium text-center">Subir Pedidos</span>
                  <input type="file" className="hidden" accept=".xlsx,.csv" onChange={(e) => handleExcelFileChange(e.target.files?.[0] || null)} />
                </label>
            </div>

            {/* Card PDF */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 flex flex-col transform transition hover:scale-[1.01]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><FileText size={24} /></div>
                  <h3 className="text-xl font-bold text-slate-800">Escanear Actas</h3>
                </div>
                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                  <FileText size={48} className="text-slate-400 group-hover:text-amber-500 mb-4" />
                  <span className="text-slate-600 font-medium text-center text-sm">PDF Multipágina</span>
                  <input type="file" className="hidden" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                </label>
                {pdfFile && (
                  <button onClick={handlePdfUpload} disabled={loading} className="mt-4 w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition">
                    {loading ? 'Procesando...' : 'Iniciar OCR'}
                  </button>
                )}
            </div>

            {/* Card Manifiestos */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 flex flex-col transform transition hover:scale-[1.01]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Truck size={24} /></div>
                  <h3 className="text-xl font-bold text-slate-800">Carga Logística</h3>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Excel 2 (Rutas)</span>
                  <button onClick={() => setShowGuideModal('manifiesto')} className="text-[10px] font-black text-blue-600 hover:underline flex items-center gap-1">
                    <AlertCircle size={12} /> VER FORMATO
                  </button>
                </div>
                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                  <Upload size={48} className="text-slate-400 group-hover:text-blue-500 mb-4" />
                  <span className="text-slate-600 font-medium text-center">Subir Manifiestos</span>
                  <input type="file" className="hidden" accept=".xlsx,.csv" onChange={(e) => handleManifestFileChange(e.target.files?.[0] || null)} />
                </label>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="p-8 lg:p-10 space-y-8">
              {/* Primary Filter Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Clock size={12} className="text-blue-500" /> Rango de Consulta
                  </label>
                  <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                    <input type="date" className="flex-1 bg-transparent border-none text-xs font-bold p-2 outline-none text-slate-700" value={filters.fechaCorteDesde} onChange={(e) => setFilters({...filters, fechaCorteDesde: e.target.value})} />
                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                    <input type="date" className="flex-1 bg-transparent border-none text-xs font-bold p-2 outline-none text-slate-700" value={filters.fechaCorteHasta} onChange={(e) => setFilters({...filters, fechaCorteHasta: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Search size={12} className="text-blue-500" /> Búsqueda Global
                  </label>
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                    <input 
                      type="text" 
                      placeholder="Factura, placa, planilla..." 
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all" 
                      value={searchTerm} 
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }} 
                      onKeyDown={(e) => e.key === 'Enter' && fetchOrders(searchTerm)} 
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const today = new Date();
                      const eightDaysAgo = new Date();
                      eightDaysAgo.setDate(today.getDate() - 8);
                      setFilters({...filters, fechaCorteDesde: eightDaysAgo.toISOString().split('T')[0], fechaCorteHasta: today.toISOString().split('T')[0]});
                      setTimeout(() => fetchOrders(searchTerm), 0);
                    }}
                    className="flex-1 py-3.5 bg-white text-slate-600 border border-slate-200 rounded-2xl text-[10px] font-black flex items-center justify-center gap-2 hover:bg-slate-50 transition-all uppercase tracking-widest"
                  >
                    8 Días
                  </button>
                  <button onClick={() => fetchOrders(searchTerm)} className="flex-1 py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95">
                    Consultar
                  </button>
                </div>

                <div className="flex items-center justify-between px-6 py-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Resultados</span>
                    <span className="text-lg font-black text-blue-600 leading-tight">{visibleOrders.length}</span>
                  </div>
                  <button 
                    onClick={() => handleExportExcel()}
                    className="p-2.5 bg-white text-emerald-600 rounded-xl font-black hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100"
                    title="Exportar a Excel"
                  >
                    <FileSpreadsheet size={18} />
                  </button>
                </div>
              </div>

              {/* Secondary Specific Filters */}
              <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Filtro Factura</label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input type="text" placeholder="Ej. TI1000..." className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" value={filters.factura || ''} onChange={e => {setFilters({...filters, factura: e.target.value}); setCurrentPage(1);}} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Filtro Planilla</label>
                  <div className="relative">
                    <FileSpreadsheet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input type="text" placeholder="Ej. 100043" className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" value={filters.planilla || ''} onChange={e => {setFilters({...filters, planilla: e.target.value}); setCurrentPage(1);}} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Filtro Placa</label>
                  <div className="relative">
                    <Truck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input type="text" placeholder="Ej. LZN785" className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all uppercase" value={filters.placa || ''} onChange={e => {setFilters({...filters, placa: e.target.value}); setCurrentPage(1);}} />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto relative scrollbar-hide">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/80 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-100">
                  <tr>
                    {[
                      { key: 'numero_documento', label: 'Documento' },
                      { key: 'numero_planilla', label: 'Planilla' },
                      { key: 'placa', label: 'Placa' },
                      { key: 'f_ultimo_corte', label: 'Fct. Último C.' },
                      { key: 'clienteDestino', label: 'Cliente / Destino' },
                      { key: 'cantidad_total', label: 'Total Und' },
                      { key: 'peso_total_prod', label: 'Total Kg' },
                      { key: 'valor_flete', label: 'Flete ($)' },
                      { key: 'ultimaNovedad', label: 'Seguimiento' }
                    ].map(col => (
                      <th key={col.key} className="px-8 py-5 cursor-pointer hover:bg-slate-100/50 transition-colors group select-none" onClick={() => requestSort(col.key)}>
                        <div className="flex items-center gap-1">
                          {col.label} 
                          <span className={`text-[10px] transition-opacity ${sortConfig?.key === col.key ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-100 text-slate-300'}`}>
                            {sortConfig?.key === col.key ? (sortConfig.direction === 'asc' ? ' ↓' : ' ↑') : ' ↕'}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="px-8 py-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs text-slate-600">
                  {loading ? (
                    <tr><td colSpan={11} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                          <span className="font-black text-[10px] uppercase text-slate-400 tracking-widest">Sincronizando con el núcleo M7...</span>
                        </div>
                    </td></tr>
                  ) : visibleOrders.length === 0 ? (
                    <tr><td colSpan={11} className="py-24 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">Sin registros encontrados</td></tr>
                  ) : (
                    visibleOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(order => (
                      <tr key={order.id} className="hover:bg-blue-50/20 transition-all group">
                        <td className="px-8 py-5 font-black text-slate-900">{order.numero_documento}</td>
                        <td className="px-8 py-5">
                           <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-tight border border-slate-200 group-hover:bg-white transition-colors">
                             {order.numero_planilla || '-'}
                           </span>
                        </td>
                        <td className="px-8 py-5 font-black text-slate-700 uppercase">{order.placa || '-'}</td>
                        <td className="px-8 py-5 font-bold text-slate-400">{order.f_ultimo_corte ? new Date(order.f_ultimo_corte).toLocaleDateString() : '-'}</td>
                        <td className="px-8 py-5">
                           <div className="flex flex-col max-w-[200px]">
                             <span className="font-extrabold text-slate-800 truncate">{order.cliente}</span>
                             <div className="flex items-center gap-1.5 mt-0.5">
                               <MapPin size={10} className="text-blue-500" />
                               <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest truncate">{order.municipio_destino}</span>
                             </div>
                           </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <Package size={14} className="text-slate-300" />
                            <span className="font-black text-slate-500">{order.cantidad_total || 0}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 font-black text-slate-400">{order.peso_total_prod || 0} Kg</td>
                        <td className="px-8 py-5">
                           <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full font-black text-[11px] border border-emerald-100">
                             ${Math.round(order.valor_flete || 0).toLocaleString()}
                           </span>
                        </td>
                        <td className="px-8 py-5">
                           <div className="flex flex-col min-w-[180px] bg-slate-50 p-3 rounded-2xl border border-slate-100 group-hover:bg-white transition-colors">
                             <div className="flex items-center gap-2 mb-1.5">
                                <div className={`w-2 h-2 rounded-full ${['Entregado', 'Completado'].includes(order.estado || '') ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`}></div>
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">
                                  {order.historico && order.historico.length > 0 ? order.historico[0].estado : order.estado || 'PENDIENTE'}
                                </span>
                             </div>
                             <p className="text-[10px] text-slate-400 font-bold leading-[1.4] line-clamp-2">
                               {order.historico && order.historico.length > 0 ? order.historico[0].observacion : '-'}
                             </p>
                             <div className="flex items-center gap-1 mt-2">
                               <Clock size={10} className="text-slate-300" />
                               <span className="text-[9px] text-slate-300 font-black">
                                 {order.historico && order.historico.length > 0 ? new Date(order.historico[0].fecha).toLocaleString() : ''}
                               </span>
                             </div>
                           </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openDetail(order)} className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-black transition-all shadow-lg shadow-blue-200" title="Ver Detalle"><Eye size={18} /></button>
                            <button 
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setNewStatus({ estado: order.estado || '', observacion: '' });
                                  setShowStatusModal(true);
                                }}
                                className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-all shadow-lg"
                                title="Cambiar Estado"
                              >
                                <Clock size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-slate-50 flex items-center justify-between border-t gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 font-medium">Mostrar</span>
                  <select 
                    className="p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={5}>5 registros</option>
                    <option value={10}>10 registros</option>
                    <option value={20}>20 registros</option>
                    <option value={50}>50 registros</option>
                    <option value={10000}>Todos</option>
                  </select>
                </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                Página {currentPage} de {Math.ceil(visibleOrders.length / itemsPerPage)}
              </div>
              <div className="flex gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-4 py-2 bg-white border rounded-xl disabled:opacity-30 hover:bg-slate-100 transition shadow-sm text-xs font-bold">Anterior</button>
                <button disabled={currentPage >= Math.ceil(visibleOrders.length / itemsPerPage)} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-2 bg-white border rounded-xl disabled:opacity-30 hover:bg-slate-100 transition shadow-sm text-xs font-bold">Siguiente</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detalle */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}></div>
          <div className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in fade-in zoom-in duration-300">
             <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100"><Eye size={24} /></div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pedido {selectedOrder.numero_documento}</h2>
                    <div className="flex gap-2 items-center">
                      <p className="text-slate-400 text-sm font-medium">Información centralizada del despacho</p>
                      {selectedOrder.no_factura_m7 && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-md text-[9px] font-black uppercase tracking-widest border border-blue-200">
                          FACTURA: {selectedOrder.no_factura_m7}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                  <div className="flex items-center gap-2">
                    {(selectedOrder as any).acta_entrega_b64 && (
                      <>
                        <button 
                          onClick={() => {
                            let b64 = (selectedOrder as any).acta_entrega_b64;
                            if (!b64.startsWith('data:application/pdf;base64,')) {
                              b64 = `data:application/pdf;base64,${b64}`;
                            }
                            setPdfPreviewUrl(b64);
                            setShowPdfModal(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-tight hover:bg-blue-100 transition shadow-sm"
                        >
                          <Eye size={14} /> Ver Acta
                        </button>
                        <button 
                          onClick={() => {
                            let b64 = (selectedOrder as any).acta_entrega_b64;
                            // Asegurar prefijo para que el navegador lo identifique correctamente
                            if (!b64.startsWith('data:application/pdf;base64,')) {
                              b64 = `data:application/pdf;base64,${b64}`;
                            }
                            const link = document.createElement('a');
                            link.href = b64;
                            link.download = `Acta_Entrega_${selectedOrder.numero_documento}.pdf`;
                            link.click();
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-tight hover:bg-emerald-100 transition shadow-sm"
                        >
                          <Download size={14} /> Descargar
                        </button>
                      </>
                    )}
                    <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400"><X size={24} /></button>
                  </div>
             </div>

             <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
                {/* Encabezado de Datos Detallado */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col gap-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cliente & Destino</h4>
                      <DetailItem icon={<User size={14}/>} label="Cliente" value={selectedOrder.cliente} />
                      <DetailItem icon={<MapPin size={14}/>} label="Dirección" value={selectedOrder.direccion} />
                      <DetailItem icon={<MapPin size={14}/>} label="Ciudad" value={selectedOrder.municipio_destino} />
                   </div>
                   <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col gap-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Logística Operativa</h4>
                      <DetailItem icon={<Truck size={14}/>} label="Placa" value={selectedOrder.placa || '-'} />
                      <DetailItem icon={<Clock size={14}/>} label="Fecha Viaje" value={selectedOrder.fecha_viaje ? new Date(selectedOrder.fecha_viaje).toLocaleDateString() : '-'} />
                      <DetailItem icon={<Clock size={14}/>} label="Último Corte" value={selectedOrder.f_ultimo_corte ? new Date(selectedOrder.f_ultimo_corte).toLocaleDateString() : '-'} />
                      <DetailItem icon={<Filter size={14}/>} label="Clasificación" value={selectedOrder.clasificacion || '-'} />
                   </div>
                   <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col gap-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Totales Valorizados</h4>
                      <DetailItem icon={<Package size={14}/>} label="Cantidad Total" value={String(selectedOrder.cantidad_total || 0)} />
                      <DetailItem icon={<Download size={14}/>} label="Peso Total" value={`${selectedOrder.peso_total_prod || 0} Kg`} />
                      <DetailItem icon={<FileText size={14}/>} label="Precio Total" value={`$${(selectedOrder.precio_total || 0).toLocaleString()}`} />
                   </div>
                   <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl shadow-slate-200 flex flex-col gap-4">
                      <h4 className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Resumen de Gestión</h4>
                      <DetailItem icon={<CheckCircle size={14}/>} label="Estado" value={selectedOrder.estado || 'Pendiente'} light={true} />
                       <DetailItem icon={<FileSpreadsheet size={14}/>} label="flete inicial" value={`$${Math.round(selectedOrder.valor_flete || 0).toLocaleString()}`} light={true} />
                       {orderDetails?.reajustes && orderDetails.reajustes.length > 0 && (
                         <DetailItem 
                           icon={<FileText size={14}/>} 
                           label="flete total" 
                            value={`${Math.round(Number(selectedOrder.valor_flete || 0) + (orderDetails?.reajustes || []).reduce((acc: number, r: any) => acc + (Number(r.valor) || 0), 0)).toLocaleString()}`}
                           light={true} 
                         />
                       )}
                       <div className="mt-2 flex flex-col gap-1">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NOTAS ENCABEZADO:</span>
                         <div className="text-[10px] font-medium text-slate-200 italic">
                           {selectedOrder.notas_encabezado ? <p className="line-clamp-2">"{selectedOrder.notas_encabezado}"</p> : <p className="text-slate-500">Sin notas</p>}
                         </div>
                       </div>
                   </div>
                </div>

                {/* Sistema de Pestañas dinámicas */}
                <div className="flex-1 flex flex-col">
                   <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit mb-6">
                      {[
                        { id: 'items', label: 'Items', icon: <Package size={14}/> },
                        { id: 'historico', label: 'Histórico', icon: <Clock size={14}/> },
                        { id: 'novedades', label: 'Novedades', icon: <AlertCircle size={14}/> },
                        { id: 'reajustes', label: 'Reajustes', icon: <FileText size={14}/> }
                      ].map(tab => (
                        <button 
                          key={tab.id}
                          onClick={() => setModalTab(tab.id as any)}
                          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            modalTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {tab.icon} {tab.label}
                        </button>
                      ))}
                   </div>

                   <div className="flex-1 bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm min-h-[400px]">
                      {modalTab === 'items' && (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
                            <tr>
                              <th className="px-6 py-4">Producto / Descripción</th>
                              <th className="px-6 py-4">Tipo Artículo</th>
                              <th className="px-6 py-4 text-center">Cant</th>
                              <th className="px-6 py-4 text-right">Peso</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 font-bold text-slate-600">
                            {orderDetails?.items && orderDetails.items.length > 0 ? orderDetails.items.map((item: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 text-slate-900">{item.producto}</td>
                                <td className="px-6 py-4">
                                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] uppercase font-black">{item.tipo_articulo || '-'}</span>
                                </td>
                                <td className="px-6 py-4 text-center">{item.cantidad}</td>
                                <td className="px-6 py-4 text-right">{item.peso || item.peso_prod} Kg</td>
                              </tr>
                            )) : (
                              <tr><td colSpan={4} className="py-20 text-center text-slate-300 font-medium italic">
                                {loading ? 'Cargando productos...' : 'No hay productos registrados'}
                              </td></tr>
                            )}
                          </tbody>
                        </table>
                      )}

                      {modalTab === 'historico' && (
                        <div className="p-6 space-y-4">
                           {orderDetails?.history && orderDetails.history.length > 0 ? orderDetails.history.map((h: any, i: number) => (
                              <div key={i} className="flex gap-4 items-start bg-slate-50/50 p-5 rounded-3xl border border-slate-100 relative overflow-hidden">
                                 <div className="w-1.5 bg-blue-600 absolute left-0 top-0 bottom-0"></div>
                                 <div className="p-3 bg-white text-blue-600 rounded-2xl shadow-sm"><Clock size={18}/></div>
                                 <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                       <span className="font-black text-xs uppercase text-slate-900 tracking-tight">{h.estado || h.new_status}</span>
                                       <span className="text-[10px] text-slate-400 font-bold">{new Date(h.fecha || h.update_at).toLocaleString()}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium">{h.observacion || '(Sin observación)'}</p>
                                    <div className="mt-3 flex items-center gap-2">
                                       <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-black text-blue-600">
                                         {(h.usuario || h.update_by || '?')?.substring(0,1).toUpperCase()}
                                       </div>
                                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{h.usuario || h.update_by}</span>
                                    </div>
                                 </div>
                              </div>
                           )) : (
                             <div className="py-20 text-center text-slate-300 font-medium italic">
                               {loading ? 'Cargando historial...' : 'Historial vacío'}
                             </div>
                           )}
                        </div>
                      )}

                      {modalTab === 'novedades' && (
                        <div className="flex flex-col h-full bg-slate-50/30">
                           <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Trazabilidad de Novedades</h3>
                              <button onClick={handleAddNovedad} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-tight hover:bg-amber-600 transition shadow-lg shadow-amber-200">Reportar Nueva</button>
                           </div>
                           <div className="flex-1 overflow-y-auto p-6 space-y-4">
                              {orderDetails?.novedades && orderDetails.novedades.length > 0 ? orderDetails.novedades.map((n: any, i: number) => (
                                 <div key={i} className="flex gap-4 items-start bg-white p-5 rounded-3xl border border-slate-100 relative shadow-sm">
                                    <div className="p-2.5 bg-amber-50 text-amber-500 rounded-2xl"><AlertCircle size={16}/></div>
                                    <div className="flex-1">
                                       <div className="flex justify-between items-center mb-1">
                                          <span className="font-black text-[10px] uppercase text-slate-900 tracking-tight">{n.tipo}</span>
                                          <span className="text-[9px] text-slate-400 font-bold">{new Date(n.fecha).toLocaleString()}</span>
                                       </div>
                                       <p className="text-xs text-slate-500 font-medium">{n.observacion}</p>
                                       <div className="mt-2 text-[9px] font-black text-slate-300 uppercase italic">Reportado por: {n.usuario}</div>
                                    </div>
                                 </div>
                              )) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                   <div className="p-4 bg-slate-100 text-slate-300 rounded-full mb-4"><AlertCircle size={32}/></div>
                                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No hay novedades registradas</p>
                                </div>
                              )}
                           </div>
                        </div>
                      )}

                      {modalTab === 'reajustes' && (
                        <div className="flex flex-col h-full bg-slate-50/30">
                           <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Validación de Reajustes</h3>
                              <button onClick={handleAddReajuste} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-tight hover:bg-emerald-700 transition shadow-lg shadow-emerald-200">Nuevo Reajuste</button>
                           </div>
                           <div className="flex-1 overflow-y-auto p-6 space-y-4">
                              {orderDetails?.reajustes && orderDetails.reajustes.length > 0 ? orderDetails.reajustes.map((r: any, i: number) => (
                                 <div key={i} className="flex gap-4 items-start bg-white p-5 rounded-3xl border border-slate-100 relative shadow-sm">
                                    <div className="p-2.5 bg-emerald-50 text-emerald-500 rounded-2xl"><FileSpreadsheet size={16}/></div>
                                    <div className="flex-1">
                                       <div className="flex justify-between items-center mb-1">
                                          <span className="font-black text-xs text-emerald-600 tracking-tight">${parseFloat(r.valor).toLocaleString()}</span>
                                          <span className="text-[9px] text-slate-400 font-bold">{new Date(r.fecha).toLocaleString()}</span>
                                       </div>
                                       <p className="text-xs text-slate-500 font-medium italic">{r.notas || '(Sin notas)'}</p>
                                       <div className="mt-2 text-[9px] font-black text-slate-300 uppercase italic">Validado por: {r.usuario}</div>
                                    </div>
                                 </div>
                              )) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                   <div className="p-4 bg-slate-100 text-slate-300 rounded-full mb-4"><FileSpreadsheet size={32}/></div>
                                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No hay reajustes aplicados</p>
                                </div>
                              )}
                           </div>
                        </div>
                      )}
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Modal Cambio Estado */}
      {showStatusModal && selectedOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowStatusModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
             <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">Actualizar Estado</h3>
             <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nuevo Estado</label>
                  <select value={newStatus.estado} onChange={e => setNewStatus({...newStatus, estado: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-sm">
                    <option value="">Seleccione...</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="En Ruta">En Ruta</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Novedad">Novedad</option>
                    <option value="Devolución">Devolución</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Observación</label>
                  <textarea value={newStatus.observacion} onChange={e => setNewStatus({...newStatus, observacion: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none text-sm h-24 resize-none" placeholder="Motivo del cambio..." />
                </div>
                <div className="flex gap-3 pt-4">
                   <button onClick={() => setShowStatusModal(false)} className="flex-1 py-3 border border-slate-100 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition">Cerrar</button>
                   <button onClick={handleStatusUpdate} disabled={loading || !newStatus.estado} className="flex-2 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition disabled:opacity-50">Actualizar</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Preview Modal 1 */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white w-[95vw] max-w-7xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="p-6 border-b flex justify-between items-center px-8">
                 <h2 className="text-2xl font-black text-slate-900">Previsualización Carga 1 (valorizados)</h2>
                 <button onClick={() => setShowPreviewModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-auto bg-slate-50 p-6">
                 <table className="w-full text-[10px] text-left border-collapse bg-white rounded-xl overflow-hidden shadow-sm">
                    <thead className="bg-slate-100 sticky top-0 font-black uppercase text-slate-600 border-b">
                       <tr>{previewData[0] && Object.keys(previewData[0]).map(k => <th key={k} className="p-3 px-4 whitespace-nowrap">{k}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {previewData.slice(0, 100).map((r, i) => (
                         <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                           {Object.values(r).map((v:any, j) => <td key={j} className="p-3 px-4 text-slate-500 truncate max-w-[200px]">{String(v)}</td>)}
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              <div className="p-6 bg-slate-50 border-t border-b grid grid-cols-1 md:grid-cols-3 gap-6 px-10">
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa Vehículo *</label>
                    <input 
                      type="text" 
                      placeholder="Ej: XYZ-123" 
                      className="p-3 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                      value={uploadExtra.placa}
                      onChange={(e) => setUploadExtra(prev => ({ ...prev, placa: e.target.value.toUpperCase() }))}
                    />
                 </div>
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Flete Total *</label>
                    <input 
                      type="number" 
                      placeholder="Ej: 1500000" 
                      className="p-3 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      value={uploadExtra.fleteTotal}
                      onChange={(e) => setUploadExtra(prev => ({ ...prev, fleteTotal: e.target.value }))}
                    />
                 </div>
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Número de Planilla</label>
                    <input 
                      type="text" 
                      placeholder="Opcional..." 
                      className="p-3 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      value={uploadExtra.planilla}
                      onChange={(e) => setUploadExtra(prev => ({ ...prev, planilla: e.target.value }))}
                    />
                 </div>
              </div>

              <div className="p-6 bg-white border-t flex justify-end gap-4 px-8">
                 <button onClick={() => setShowPreviewModal(false)} className="px-8 py-3 border border-slate-200 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition">Cancelar</button>
                 <button onClick={handleExcelUpload} disabled={loading} className="px-12 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition shadow-xl shadow-emerald-100 active:scale-95 disabled:opacity-50">{loading ? 'Procesando...' : 'Confirmar Carga'}</button>
              </div>
           </div>
        </div>
      )}

      {/* Preview Modal 2 */}
      {showManifestPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white w-[95vw] max-w-7xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="p-6 border-b flex justify-between items-center px-8">
                 <h2 className="text-2xl font-black text-slate-900">Previsualización Carga 2 (Logística)</h2>
                 <button onClick={() => setShowManifestPreview(false)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-auto bg-slate-50 p-6">
                 <table className="w-full text-[10px] text-left border-collapse bg-white rounded-xl overflow-hidden shadow-sm">
                    <thead className="bg-slate-100 sticky top-0 font-black uppercase text-slate-600 border-b">
                       <tr>{previewData[0] && Object.keys(previewData[0]).map(k => <th key={k} className="p-3 px-4 whitespace-nowrap">{k}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {previewData.slice(0, 100).map((r, i) => (
                         <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                           {Object.values(r).map((v:any, j) => <td key={j} className="p-3 px-4 text-slate-500 truncate max-w-[200px]">{String(v)}</td>)}
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              <div className="p-6 bg-white border-t flex justify-end gap-4 px-8">
                 <button onClick={() => setShowManifestPreview(false)} className="px-8 py-3 border border-slate-200 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition">Cancelar</button>
                 <button onClick={handleManifestUpload} disabled={loading} className="px-12 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition shadow-xl shadow-blue-100 active:scale-95 disabled:opacity-50">{loading ? 'Actualizando...' : 'Actualizar Logística'}</button>
              </div>
           </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGuideModal(null)}></div>
           <div className="relative bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 border-b-4 border-blue-600 pb-1">Guía de Formato</h3>
                 <button onClick={() => setShowGuideModal(null)} className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"><X size={20}/></button>
              </div>
              <div className="space-y-4 text-xs font-medium text-slate-600">
                 <p>Para cargar correctamente, su archivo Excel debe tener los siguientes encabezados en la primera fila:</p>
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono text-[10px] leading-6">
                    {showGuideModal === 'operacion' ? (
                       <span className="text-emerald-600 font-bold underline uppercase">NUMERO DOCUMENTO, NIT CLIENTE, CLIENTE, PRODUCTO, CANTIDAD, PESO</span>
                    ) : (
                       <span className="text-blue-600 font-bold underline uppercase">DOCUMENTO, MANIFIESTO, PLANILLA, RUTA, FLETE</span>
                    )}
                 </div>
                 <p className="italic text-amber-600 font-bold">* El sistema buscará coincidencias exactas por "NUMERO DOCUMENTO" o "DOCUMENTO".</p>
                 <button onClick={() => setShowGuideModal(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest mt-4 hover:bg-blue-600 transition shadow-xl shadow-blue-100">Entendido</button>
              </div>
           </div>
        </div>
      )}
      {/* Modal Nueva Novedad */}
      {showNovedadModal && selectedOrder && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowNovedadModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300 border border-amber-100">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-amber-50 text-amber-500 rounded-2xl"><AlertCircle size={20}/></div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Reportar Novedad</h3>
             </div>
             <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Observación de la Novedad</label>
                  <textarea 
                    autoFocus
                    value={newNovedad.observacion} 
                    onChange={e => setNewNovedad({observacion: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none text-sm h-32 resize-none focus:ring-2 focus:ring-amber-500 transition-all font-medium" 
                    placeholder="Describa la novedad ocurrida..." 
                  />
                </div>
                <div className="flex gap-3 pt-4">
                   <button onClick={() => setShowNovedadModal(false)} className="flex-1 py-3 border border-slate-100 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition uppercase text-[10px] tracking-widest">Cancelar</button>
                   <button 
                    onClick={confirmAddNovedad} 
                    disabled={loading || !newNovedad.observacion} 
                    className="flex-2 py-3 bg-amber-500 text-white rounded-xl font-black hover:bg-amber-600 transition disabled:opacity-50 uppercase text-[10px] tracking-widest shadow-lg shadow-amber-100"
                   >
                     {loading ? 'ENVIANDO...' : 'REGISTRAR'}
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Reajuste */}
      {showReajusteModal && selectedOrder && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowReajusteModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300 border border-emerald-100">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl"><FileSpreadsheet size={20}/></div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nuevo Reajuste</h3>
             </div>
             <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor del Reajuste ($)</label>
                  <input 
                    type="number"
                    autoFocus
                    value={newReajuste.valor} 
                    onChange={e => setNewReajuste({...newReajuste, valor: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all" 
                    placeholder="0.00" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Notas / Justificación</label>
                  <textarea 
                    value={newReajuste.notas} 
                    onChange={e => setNewReajuste({...newReajuste, notas: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none text-sm h-24 resize-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium" 
                    placeholder="Escriba el motivo del reajuste..." 
                  />
                </div>
                <div className="flex gap-3 pt-4">
                   <button onClick={() => setShowReajusteModal(false)} className="flex-1 py-3 border border-slate-100 rounded-xl font-bold text-slate-400 hover:bg-slate-50 transition uppercase text-[10px] tracking-widest">Cancelar</button>
                   <button 
                    onClick={confirmAddReajuste} 
                    disabled={loading || !newReajuste.valor} 
                    className="flex-2 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition disabled:opacity-50 uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-100"
                   >
                     {loading ? 'ENVIANDO...' : 'APLICAR'}
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}
      {/* Modal Visualizador PDF */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
           <div className="bg-white w-[90vw] h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-6 border-b flex justify-between items-center px-8 bg-white">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><FileText size={20} /></div>
                    <h2 className="text-xl font-black text-slate-900 uppercase">Visualizador de Acta</h2>
                 </div>
                 <div className="flex items-center gap-4">
                    <a 
                      href={pdfPreviewUrl} 
                      download={`Acta_Entrega_${selectedOrder?.numero_documento}.pdf`}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
                    >
                      Descargar PDF
                    </a>
                    <button onClick={() => setShowPdfModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400"><X size={24}/></button>
                 </div>
              </div>
              <div className="flex-1 bg-slate-200 p-4">
                 <iframe 
                    src={pdfPreviewUrl} 
                    className="w-full h-full rounded-2xl border-none shadow-inner"
                    title="Previsualización de PDF"
                 />
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GrupoInterView;
