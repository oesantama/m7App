import React, { useState, useEffect } from 'react';
import { 
  Upload, FileSpreadsheet, FileText, Search, Eye, 
  MapPin, Package, Truck, Clock, CheckCircle, 
  AlertCircle, ChevronRight, Download, Filter 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { api } from '../services/api';

interface Order {
  id: number;
  nro_documento: string;
  cliente: string;
  ciudad_origen: string;
  ciudad_destino: string;
  estado: string;
  nro_guia: string;
  fecha_entregado: string | null;
  placa: string;
  peso: number;
  cantidad: number;
  valor_flete: number;
  valor_declarado: number;
  acta_entrega_b64: string | null;
  created_at: string;
}

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
  const itemsPerPage = 10;
  
  const [filters, setFilters] = useState({
    status: '',
    client: '',
  });

  useEffect(() => {
    if (activeTab === 'gestion') {
      fetchOrders();
    }
  }, [activeTab]);

  const fetchOrders = async (query = '') => {
    try {
      setLoading(true);
      const params: any = { search: query };
      if (filters.status) params.status = filters.status;
      if (filters.client) params.client = filters.client;
      
      const data = await api.getGrupoInterOrders(params);
      setOrders(data);
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
        const json = XLSX.utils.sheet_to_json(sheet);
        setPreviewData(json);
        setShowPreviewModal(true);
      } catch (err) {
        toast.error('Error al leer el archivo para previsualización');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelUpload = async () => {
    if (!excelFile) return;
    try {
      setLoading(true);
      const res = await api.uploadGrupoInterExcel(excelFile);
      toast.success(res.message || 'Excel procesado con éxito');
      setExcelFile(null);
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
      const res = await api.processGrupoInterPDF(pdfFile);
      toast.success(res.message || 'PDF procesado con captura de actas');
      setPdfFile(null);
    } catch (error: any) {
      toast.error(error.message || error.error || 'Error al procesar PDF');
    } finally {
      setLoading(false);
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
                  <div className="mt-4 flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="text-blue-600 flex-shrink-0" size={20} />
                      <span className="text-blue-700 font-medium truncate">{pdfFile.name}</span>
                    </div>
                    <button 
                      onClick={handlePdfUpload}
                      disabled={loading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {loading ? 'Escaneando...' : 'Iniciar Escaneo'}
                    </button>
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
                <select 
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-medium"
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                >
                  <option value="">Todos los Estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Entregado">Entregado</option>
                </select>

                <button 
                  onClick={() => fetchOrders(searchTerm)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 active:scale-95"
                >
                  Filtrar Resultados
                </button>

                <button 
                  onClick={() => {
                    setFilters({status: '', client: ''});
                    setSearchTerm('');
                    fetchOrders('');
                  }}
                  className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition text-slate-400"
                  title="Limpiar Filtros"
                >
                  <Clock size={20} />
                </button>
              </div>
            </div>

            {/* Tabla con Estetica Malla Siete */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 uppercase text-xs font-bold tracking-wider">
                    <th className="px-6 py-4">Documento</th>
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Origen / Destino</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Guía / Placa</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
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
                  ) : orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4 font-bold text-slate-900">{order.nro_documento}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium max-w-[200px] truncate">{order.cliente}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-[10px] font-bold">A: {order.ciudad_destino}</span>
                          <span className="text-slate-900 text-xs font-semibold">{order.ciudad_origen || 'MEDELLIN'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          order.estado === 'Entregado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}>
                          {order.estado || 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm text-blue-600 font-semibold">{order.nro_guia}</span>
                          <span className="text-[10px] text-slate-400 font-bold">{order.placa || 'SIN PLACA'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => openDetail(order)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-all transform active:scale-95"
                        >
                          <Eye size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Previsualización de Excel */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPreviewModal(false)}></div>
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in fade-in zoom-in duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Previsualización de Carga</h2>
                  <p className="text-slate-500 text-sm font-medium">Filtra y revisa los datos antes de sincronizar</p>
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
                <button onClick={() => setShowPreviewModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                  <ChevronRight size={28} className="rotate-90 md:rotate-0" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-0">
               <table className="w-full text-left text-sm border-collapse">
                 <thead className="sticky top-0 bg-slate-50 z-20 border-b border-slate-200">
                   <tr>
                     <th className="px-6 py-4 font-bold text-slate-600">Documento</th>
                     <th className="px-6 py-4 font-bold text-slate-600">Cliente</th>
                     <th className="px-6 py-4 font-bold text-slate-600">Ciudad Destino</th>
                     <th className="px-6 py-4 font-bold text-slate-600">Cantidad</th>
                     <th className="px-6 py-4 font-bold text-slate-600">Peso</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {previewData
                    .filter(row => {
                      const str = JSON.stringify(row).toLowerCase();
                      return str.includes(previewFilter.toLowerCase());
                    })
                    .slice((previewPage - 1) * itemsPerPage, previewPage * itemsPerPage)
                    .map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-3 font-bold text-blue-600">{row['NRO DOCUMENTO'] || row['Documento'] || row['Documento_Externo'] || 'N/A'}</td>
                        <td className="px-6 py-3 text-slate-600">{row['CLIENTE'] || row['Nombre'] || 'N/A'}</td>
                        <td className="px-6 py-3 text-slate-500">{row['CIUDAD DESTINO'] || row['Destino'] || 'N/A'}</td>
                        <td className="px-6 py-3 font-mono">{row['CANTIDAD'] || row['Unidades'] || 0}</td>
                        <td className="px-6 py-3 font-mono">{row['PESO'] || 0} kg</td>
                      </tr>
                   ))}
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
                  disabled={previewPage * itemsPerPage >= previewData.length}
                  onClick={() => setPreviewPage(p => p + 1)}
                  className="p-2 bg-white border border-slate-200 rounded-lg disabled:opacity-30"
                >
                  Siguiente
                </button>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400 font-medium">Total: {previewData.length} registros</span>
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
                <p className="text-slate-500 text-sm font-medium">Documento: {selectedOrder.nro_documento}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <ChevronRight size={28} className="rotate-90 md:rotate-0" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Info Card */}
                <div className="md:col-span-2 grid grid-cols-2 gap-6">
                  <DetailItem icon={<Truck size={20} />} label="Vehículo / Placa" value={selectedOrder.placa || 'No asignada'} />
                  <DetailItem icon={<Package size={20} />} label="Guía de Transporte" value={selectedOrder.nro_guia} />
                  <DetailItem icon={<MapPin size={20} />} label="Ciudad Destino" value={selectedOrder.ciudad_destino} />
                  <DetailItem icon={<Clock size={20} />} label="Fecha Entrega" value={selectedOrder.fecha_entregado ? new Date(selectedOrder.fecha_entregado).toLocaleString() : 'Pendiente'} />
                  <DetailItem icon={<AlertCircle size={20} />} label="Estado Actual" value={selectedOrder.estado} />
                  <DetailItem icon={<Package size={20} />} label="Unidades / Cantidad" value={selectedOrder.cantidad.toString()} />
                </div>

                {/* Acta de Entrega - Screenshot del PDF */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 aspect-square md:aspect-auto flex flex-col items-center justify-center text-center overflow-hidden">
                  {selectedOrder.acta_entrega_b64 ? (
                    <div className="w-full h-full flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acta Digitalizada (PDF)</span>
                      <iframe 
                        src={`data:application/pdf;base64,${selectedOrder.acta_entrega_b64}`} 
                        className="w-full h-80 rounded-lg shadow-sm border border-slate-200 bg-white"
                        title="Acta de Entrega"
                      />
                      <button 
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `data:application/pdf;base64,${selectedOrder.acta_entrega_b64}`;
                          link.download = `Acta_${selectedOrder.nro_documento}.pdf`;
                          link.click();
                        }}
                        className="mt-auto flex items-center justify-center gap-2 w-full py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                      >
                        <Download size={16} /> Descargar Acta
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center p-8">
                      <FileText size={48} className="text-slate-300 mb-4" />
                      <p className="text-slate-400 text-sm font-medium italic">El acta aún no ha sido cargada vía PDF</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Métricas Adicionales */}
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricBox label="Peso" value={`${selectedOrder.peso} kg`} />
                <MetricBox label="Flete" value={`$${selectedOrder.valor_flete.toLocaleString()}`} />
                <MetricBox label="Declarado" value={`$${selectedOrder.valor_declarado.toLocaleString()}`} />
                <MetricBox label="Fecha Creación" value={new Date(selectedOrder.created_at).toLocaleDateString()} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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

export default GrupoInterView;
