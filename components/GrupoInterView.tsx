import React, { useState, useEffect } from 'react';
import { 
  Upload, FileSpreadsheet, FileText, Search, Eye, 
  MapPin, Package, Truck, Clock, CheckCircle, 
  AlertCircle, ChevronRight, Download, Filter, User 
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
  producto: string;
  cantidad_total: number;
  precio_total: number;
  tipo_articulo: string;
  empresa: string;
  peso_total_prod: number;
  f_ultimo_corte: string | null;
  clasificacion: string;
  numero_guia: string;
  latitud: string;
  longitud: string;
  placa: string;
  estado: string;
  history: any[];
  fecha_entregado: string | null;
  fecha_carge: string;
  acta_entrega_b64: string | null;
  create_at: string;
  create_by: string | null;
  update_at: string;
  update_by: string | null;
}

const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="mt-1 text-blue-500">{icon}</div>
    <div className="flex flex-col">
      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</span>
      <span className="text-slate-900 font-semibold">{value}</span>
    </div>
  </div>
);

const MetricBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">{label}</span>
    <span className="text-lg font-black text-slate-900">{value}</span>
  </div>
);

const GrupoInterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'carga' | 'gestion'>('gestion');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFilter, setPreviewFilter] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const itemsPerPagePreview = 10;
  
  // Paginación Gestión Operativa
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Estados de Progreso y Diagnóstico
  const [uploadProgress, setUploadProgress] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Iniciando...");
  const [finalMatches, setFinalMatches] = useState(0);

  // Auto-scroll para los logs
  useEffect(() => {
    if (isProcessing) {
      const terminal = document.getElementById('ocr-terminal');
      if (terminal) {
        terminal.scrollTop = terminal.scrollHeight;
      }
    }
  }, [debugLogs, isProcessing]);

  const [filters, setFilters] = useState({
    status: '',
    client: '',
    fechaCorteDesde: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fechaCorteHasta: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (activeTab === 'gestion') {
      fetchOrders(searchTerm);
    }
  }, [activeTab]);

  const fetchOrders = async (query = '') => {
    try {
      setLoading(true);
      const params: any = { search: query };
      if (filters.status) params.status = filters.status;
      if (filters.client) params.client = filters.client;
      if (filters.fechaCorteDesde) params.fechaCorteDesde = filters.fechaCorteDesde;
      if (filters.fechaCorteHasta) params.fechaCorteHasta = filters.fechaCorteHasta;
      
      const data = await api.getGrupoInterOrders(params);
      setOrders(data);
      setCurrentPage(1); // Resetear a la primera página en cada búsqueda
    } catch (error: any) {
      toast.error(error.message || error.error || 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleExcelFileChange = async (file: File | null) => {
    if (!file) return;
    setExcelFile(file);
    
    // Leer para previsualización
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // Usar formato array para evitar que las columnas sin nombre se salten y desplacen la info visualmente
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (rows.length > 0) {
          const headers = rows[0] || [];
          const json = rows.slice(1).map(row => {
            const obj: any = {};
            // Alineación estricta por longitud de encabezado (llena huecos nulos)
            for (let i = 0; i < headers.length; i++) {
              const h = headers[i];
              const val = row[i];
              obj[String(h || `COL_${i}`)] = (val === undefined || val === null || val === '') ? ' ' : val;
            }
            return obj;
          });
          setPreviewData(json);
        } else {
          setPreviewData([]);
        }
        setShowPreviewModal(true);
      } catch (err) {
        toast.error('Error al leer el archivo para previsualización');
      }
    };
    reader.readAsBinaryString(file);
  };

  const { user } = useAppStore();

  const handleExcelUpload = async () => {
    if (!excelFile) return;
    try {
      setLoading(true);
      const res = await api.uploadGrupoInterExcel(excelFile, user?.name || 'System');
      
      if (res.duplicates > 0) {
        toast.warning(`Completado: ${res.count} nuevos. Se omitieron ${res.duplicates} duplicados (Documento + Producto ya existentes).`, {
            duration: 6000
        });
      } else {
        toast.success(res.message || 'Excel procesado con éxito');
      }

      setExcelFile(null);
      setPreviewData([]);
      setShowPreviewModal(false);
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || error.error || 'Error al subir Excel');
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
      setFinalMatches(0);
      setProcessingStatus("Subiendo archivo y preparando escaneo...");
      
      await api.processGrupoInterPDF(pdfFile, (data) => {
        if (data.type === 'start') {
          setProcessingStatus(`Procesando ${data.totalPages} páginas...`);
        } else if (data.type === 'log') {
          setDebugLogs(prev => [...prev, data.message]);
          setProcessingStatus(data.message);
          if (data.progress) setUploadProgress(data.progress);
        } else if (data.type === 'end') {
          setFinalMatches(data.matches);
          setUploadProgress(100);
          setProcessingStatus(`Completado: ${data.matches} coincidencias.`);
          
          if (data.matches > 0) {
            toast.success(`Se encontraron ${data.matches} coincidencias.`);
          } else {
            toast.info("No se encontraron coincidencias en este documento.");
          }
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

      // Preparar datos para exportación con nombres de columna amigables
      const exportData = orders.map(o => ({
        'Número Documento': o.numero_documento,
        'Número Guía': o.numero_guia || '-',
        'Fct. Último Corte': o.f_ultimo_corte ? new Date(o.f_ultimo_corte).toLocaleDateString() : '-',
        'NIT Cliente': o.nit,
        'Nombre Cliente': o.cliente,
        'Dirección': o.direccion,
        'Municipio Destino': o.municipio_destino,
        'Producto': o.producto,
        'Cantidad': o.cantidad_total,
        'Peso (Kg)': o.peso_total_prod,
        'Precio Total': o.precio_total,
        'Clasificación': o.clasificacion,
        'Estado': o.estado,
        'Fecha Entrega': o.fecha_entregado ? new Date(o.fecha_entregado).toLocaleString() : '-',
        'Cargado Por': o.create_by || 'Sistema',
        'Fecha Carga': new Date(o.fecha_carge).toLocaleString()
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gestión Grupo Inter");
      
      const fileName = `Gestion_Grupo_Inter_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast.success('Excel exportado correctamente');
    } catch (error) {
      toast.error('Error al exportar a Excel');
    }
  };

  const openDetail = (order: Order) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header con Estetica Premium */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Gestión Grupo Inter
            </h1>
            <p className="text-slate-500 mt-1">Control operativo y trazabilidad de pedidos públicos</p>
          </div>
          
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 self-start">
            <button 
              onClick={() => setActiveTab('gestion')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'gestion' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Gestión Operativa
            </button>
            <button 
              onClick={() => setActiveTab('carga')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'carga' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Carga Masiva
            </button>
          </div>
        </div>

        {activeTab === 'carga' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Carga Excel */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden transform transition hover:scale-[1.01]">
              <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                    <FileSpreadsheet size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Importar Excel de Operación</h3>
                </div>
              </div>
              <div className="p-8">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                  <Upload size={48} className="text-slate-400 group-hover:text-blue-500 mb-4 transition-colors" />
                  <span className="text-slate-600 font-medium">Arrastra el archivo Excel aquí</span>
                  <span className="text-slate-400 text-sm mt-1">Soporta .xlsx y .csv</span>
                  <input type="file" className="hidden" accept=".xlsx,.csv" onChange={(e) => handleExcelFileChange(e.target.files?.[0] || null)} />
                </label>
                
                {excelFile && (
                  <div className="mt-4 flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileSpreadsheet className="text-blue-600 flex-shrink-0" size={20} />
                      <span className="text-blue-700 font-medium truncate">{excelFile.name}</span>
                    </div>
                    <button 
                      onClick={handleExcelUpload}
                      disabled={loading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {loading ? 'Procesando...' : 'Subir Archivo'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Carga PDF */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden transform transition hover:scale-[1.01]">
              <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <FileText size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Procesar PDF de Actas</h3>
                </div>
              </div>
              <div className="p-8">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
                  <Upload size={48} className="text-slate-400 group-hover:text-blue-500 mb-4 transition-colors" />
                  <span className="text-slate-600 font-medium">Arrastra el PDF multipágina aquí</span>
                  <span className="text-slate-400 text-sm mt-1">El sistema buscará coincidencias y extraerá fotos</span>
                  <input type="file" className="hidden" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                </label>

                {pdfFile && (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="text-blue-600 flex-shrink-0" size={20} />
                        <span className="text-blue-700 font-medium truncate">{pdfFile.name}</span>
                      </div>
                      <button 
                        onClick={handlePdfUpload}
                        disabled={loading}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
                      >
                        {loading ? 'Analizando...' : 'Iniciar Escaneo'}
                      </button>
                    </div>

                    {loading && (
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden border border-slate-200 shadow-inner">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-500 ease-out"
                          style={{ width: `${uploadProgress || 45}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                )}
                
                {debugLogs.length > 0 && (
                  <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden bg-slate-900 shadow-2xl">
                    <button 
                      onClick={() => setShowDebug(!showDebug)}
                      className="w-full flex items-center justify-between p-3 bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition"
                    >
                      <span className="flex items-center gap-2">
                         <AlertCircle size={14} className="text-amber-400" />
                         CONSOLA DE DIAGNÓSTICO OCR
                      </span>
                      <span>{showDebug ? 'OCULTAR' : 'VER DETALLE'}</span>
                    </button>
                    {showDebug && (
                      <div className="p-4 bg-black/50 font-mono text-[10px] text-emerald-400 h-48 overflow-y-auto space-y-1">
                        {debugLogs.map((log, lIdx) => (
                          <div key={lIdx} className="border-l border-emerald-900/50 pl-2">
                            <span className="text-slate-500 mr-2">[{lIdx + 1}]</span>
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            {/* Buscador y Filtros Avanzados */}
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30">
              <div className="relative flex-1 max-w-lg">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Documento, guía o cliente..." 
                  className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && fetchOrders(searchTerm)}
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                <div className="flex flex-col">
                   <span className="text-[10px] text-slate-400 font-bold ml-1">F. CORTE DESDE</span>
                   <input 
                    type="date"
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm"
                    value={filters.fechaCorteDesde}
                    onChange={(e) => setFilters({...filters, fechaCorteDesde: e.target.value})}
                  />
                </div>

                <div className="flex flex-col">
                   <span className="text-[10px] text-slate-400 font-bold ml-1">F. CORTE HASTA</span>
                   <input 
                    type="date"
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm"
                    value={filters.fechaCorteHasta}
                    onChange={(e) => setFilters({...filters, fechaCorteHasta: e.target.value})}
                  />
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold ml-1">ESTADO</span>
                  <select 
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm"
                    value={filters.status}
                    onChange={(e) => setFilters({...filters, status: e.target.value})}
                  >
                    <option value="">Todos</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Entregado">Entregado</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <button 
                    onClick={() => handleExportExcel()}
                    className="p-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition shadow-sm border border-emerald-100"
                    title="Exportar a Excel"
                  >
                    <FileSpreadsheet size={20} />
                  </button>

                  <button 
                    onClick={() => fetchOrders(searchTerm)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 active:scale-95 text-sm"
                  >
                    Consultar
                  </button>

                  <button 
                    onClick={() => {
                      setFilters({
                        status: '', 
                        client: '', 
                        fechaCorteDesde: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
                        fechaCorteHasta: new Date().toISOString().split('T')[0]
                      });
                      setSearchTerm('');
                      fetchOrders('');
                    }}
                    className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition text-slate-500 font-bold text-sm shadow-sm"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>

            {/* Tabla con Estetica Malla Siete */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                    <th className="px-4 py-4">Número Documento</th>
                    <th className="px-4 py-4">Fct. Último Co</th>
                    <th className="px-4 py-4">Nombre Cliente / NIT</th>
                    <th className="px-4 py-4">Dirección / Municipio Destino</th>
                    <th className="px-4 py-4">Estado</th>
                    <th className="px-4 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
                        <p className="mt-2 text-slate-500 font-medium">Sincronizando con el núcleo Orbit...</p>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <AlertCircle size={48} className="mx-auto text-slate-200 mb-4" />
                        <p className="text-slate-500 font-medium">No se encontraron pedidos de Grupo Inter</p>
                      </td>
                    </tr>
                  ) : (
                    orders
                      .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                      .map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group text-xs">
                          <td className="px-4 py-4 font-bold text-slate-900">{order.numero_documento}</td>
                          <td className="px-4 py-4 text-slate-500 font-medium">
                            {order.f_ultimo_corte ? new Date(order.f_ultimo_corte).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <span className="text-slate-900 font-bold max-w-[200px] truncate">{order.cliente}</span>
                              <span className="text-slate-400 text-[10px] font-bold">{order.nit}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <span className="text-slate-600 font-medium max-w-[200px] truncate">{order.direccion === ' ' ? '' : order.direccion}</span>
                              <span className="text-slate-400 text-[10px] font-bold">A: {order.municipio_destino}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              order.estado === 'Entregado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 border border-amber-200'
                            }`}>
                              {order.estado || 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button 
                              onClick={() => openDetail(order)}
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all transform active:scale-95"
                            >
                              <Eye size={20} />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación Gestión Operativa */}
            {!loading && orders.length > 0 && (
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
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

                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition drop-shadow-sm"
                  >
                    Anterior
                  </button>
                  <div className="flex items-center px-4">
                    <span className="text-sm font-bold text-slate-600">Página {currentPage} de {Math.ceil(orders.length / itemsPerPage)}</span>
                  </div>
                  <button 
                    disabled={currentPage >= Math.ceil(orders.length / itemsPerPage)}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition drop-shadow-sm"
                  >
                    Siguiente
                  </button>
                </div>

                <div className="text-sm text-slate-400 font-medium">
                  Total: <span className="font-bold text-slate-600">{orders.length}</span> registros encontrados
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Previsualización de Excel */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Fondo persistente (sin clic para cerrar) */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"></div>
          <div className="relative bg-white w-[95vw] max-w-7xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Previsualización de Carga</h2>
                  <p className="text-slate-500 text-sm font-medium">Revisa la totalidad de los datos antes de sincronizar con el servidor</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Filtrar en tabla..." 
                    className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={previewFilter}
                    onChange={(e) => {
                      setPreviewFilter(e.target.value);
                      setPreviewPage(1);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-0">
               <table className="w-full text-left text-xs border-collapse">
                 <thead className="sticky top-0 bg-slate-50 z-20 border-b border-slate-200">
                   <tr>
                     {previewData.length > 0 && Object.keys(previewData[0]).map((key) => (
                       <th key={key} className="px-4 py-3 font-bold text-slate-600 whitespace-nowrap bg-slate-50">
                         {key.toUpperCase()}
                       </th>
                     ))}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {previewData
                    .filter(row => {
                      const str = JSON.stringify(row).toLowerCase();
                      return str.includes(previewFilter.toLowerCase());
                    })
                    .slice((previewPage - 1) * itemsPerPagePreview, previewPage * itemsPerPagePreview)
                    .map((row: any, idx) => {
                      // Usar las llaves del primer objeto para garantizar el orden de las columnas
                      const headers = Object.keys(previewData[0]);
                      return (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          {headers.map((key, vIdx) => (
                            <td key={vIdx} className="px-4 py-2 text-slate-600 whitespace-nowrap">
                              {String(row[key] || ' ')}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                 </tbody>
               </table>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button 
                  disabled={previewPage === 1}
                  onClick={() => setPreviewPage(p => p - 1)}
                  className="p-2 bg-white border border-slate-200 rounded-lg disabled:opacity-30"
                >
                  Anterior
                </button>
                <span className="text-sm font-bold text-slate-600 px-4">Página {previewPage}</span>
                <button 
                  disabled={previewPage * itemsPerPagePreview >= previewData.length}
                  onClick={() => setPreviewPage(p => p + 1)}
                  className="p-2 bg-white border border-slate-200 rounded-lg disabled:opacity-30"
                >
                  Siguiente
                </button>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400 font-medium mr-4">Total: {previewData.length} registros</span>
                
                <button 
                  onClick={() => {
                    setExcelFile(null);
                    setPreviewData([]);
                    setShowPreviewModal(false);
                    toast.info('Carga cancelada y archivo purgado');
                  }}
                  className="px-6 py-3 rounded-2xl font-bold border border-slate-200 text-slate-500 hover:bg-white transition"
                >
                  Cancelar
                </button>

                <button 
                  onClick={handleExcelUpload}
                  disabled={loading}
                  className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition flex items-center gap-2"
                >
                  {loading ? 'Cargando...' : 'Confirmar y Guardar'}
                  <CheckCircle size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle Express con Glassmorphism */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Detalle de Operación</h2>
                <p className="text-slate-500 text-sm font-medium">Documento: {selectedOrder.numero_documento}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <ChevronRight size={28} className="rotate-90 md:rotate-0" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-8">
              <div className="space-y-8">
                {/* Grilla de Detalles */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <DetailItem icon={<Package size={18} />} label="Producto" value={selectedOrder.producto} />
                  <DetailItem icon={<User size={18} />} label="Nombre Cliente" value={selectedOrder.cliente} />
                  <DetailItem icon={<FileText size={18} />} label="NIT Cliente" value={selectedOrder.nit} />
                  <DetailItem icon={<MapPin size={18} />} label="Dirección" value={selectedOrder.direccion} />
                  <DetailItem icon={<Truck size={18} />} label="Municipio Destino" value={selectedOrder.municipio_destino} />
                  <DetailItem icon={<Filter size={18} />} label="Tipo Artículo" value={selectedOrder.tipo_articulo} />
                  <DetailItem icon={<AlertCircle size={18} />} label="Empresa" value={selectedOrder.empresa} />
                  <DetailItem icon={<AlertCircle size={18} />} label="Clasificación" value={selectedOrder.clasificacion} />
                  <DetailItem icon={<Clock size={18} />} label="Fecha Carga" value={new Date(selectedOrder.fecha_carge).toLocaleString()} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricBox label="Cantidad" value={String(selectedOrder.cantidad_total)} />
                  <MetricBox label="Peso Total" value={`${selectedOrder.peso_total_prod} Kg`} />
                  <MetricBox label="Precio Total" value={`$ ${new Intl.NumberFormat().format(selectedOrder.precio_total)}`} />
                  <MetricBox label="Estado" value={selectedOrder.estado} />
                </div>

                {/* Historial de Trazabilidad */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                    <Clock size={16} className="text-blue-500" />
                    HISTORIAL DE TRAZABILIDAD
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-4">
                        <span>CREADO: {new Date(selectedOrder.create_at).toLocaleString()}</span>
                        <span>POR: {selectedOrder.create_by || 'SISTEMA'}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span>ULT. ACTUALIZACIÓN: {new Date(selectedOrder.update_at).toLocaleString()}</span>
                        <span>POR: {selectedOrder.update_by || 'SISTEMA'}</span>
                      </div>
                    </div>

                    {selectedOrder.history && selectedOrder.history.length > 0 ? (
                      <div className="space-y-3">
                        {selectedOrder.history.map((h: any, idx: number) => (
                          <div key={idx} className="flex gap-4 p-3 bg-white border border-slate-100 rounded-xl shadow-sm italic text-xs">
                            <span className="text-slate-400 font-bold w-32">{new Date(h.date || h.fecha).toLocaleString()}</span>
                            <span className="text-slate-600">{h.action || h.novedad}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm font-medium italic">No hay novedades registradas en el historial</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Acta de Entrega */}
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
                    <FileText size={16} className="text-blue-500" />
                    ACTA DE ENTREGA (DOCUMENTO DIGITAL)
                  </h3>
                  {selectedOrder.acta_entrega_b64 ? (
                    <div className="flex flex-col gap-4">
                      <iframe 
                        src={`data:application/pdf;base64,${selectedOrder.acta_entrega_b64}`} 
                        className="w-full h-96 rounded-xl shadow-sm border border-slate-200 bg-white"
                        title="Acta de Entrega"
                      />
                      <button 
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `data:application/pdf;base64,${selectedOrder.acta_entrega_b64}`;
                          link.download = `Acta_${selectedOrder.numero_documento}.pdf`;
                          link.click();
                        }}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg"
                      >
                        <Download size={18} /> Descargar Acta PDF
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-dashed border-slate-200">
                      <FileText size={48} className="text-slate-200 mb-4" />
                      <p className="text-slate-400 text-sm font-medium italic">El acta aún no ha sido cargada vía PDF</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Persistente de Progreso OCR */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"></div>
          <div className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <FileText size={40} className="text-blue-600" />
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 mb-2">Escaneando Documento</h3>
              <p className="text-slate-500 font-medium mb-8">Por favor, no cierre esta ventana hasta finalizar.</p>

              {/* Barra de Progreso */}
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden border border-slate-200 shadow-inner mb-4">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out flex items-center justify-end px-2"
                  style={{ width: `${uploadProgress}%` }}
                >
                  <span className="text-[10px] font-black text-white">{uploadProgress}%</span>
                </div>
              </div>

              {/* Terminal de Logs */}
              <div 
                id="ocr-terminal"
                className="bg-slate-900 rounded-xl p-4 h-40 overflow-y-auto text-left font-mono text-[10px] text-emerald-400 border border-slate-800 shadow-2xl mb-8"
              >
                {debugLogs.length === 0 && <span className="animate-pulse">Esperando respuesta del servidor...</span>}
                {debugLogs.map((log, idx) => (
                  <div key={idx} className={`${log.includes('✅') ? 'text-blue-300 font-bold' : log.includes('❌') ? 'text-rose-400' : ''}`}>
                    <span className="text-slate-500 mr-2">[{idx + 1}]</span>
                    {log}
                  </div>
                ))}
                <div id="logs-end"></div>
              </div>

              {/* Status footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400 italic text-xs">
                  <Clock size={14} className="animate-spin" />
                  <span className="truncate max-w-[250px]">{processingStatus}</span>
                </div>
                
                {uploadProgress === 100 && (
                  <button 
                    onClick={() => setIsProcessing(false)}
                    className="bg-blue-600 text-white px-8 py-2 rounded-xl font-bold hover:bg-blue-700 transition animate-in slide-in-from-bottom-2"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrupoInterView;
