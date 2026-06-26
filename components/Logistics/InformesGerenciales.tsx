import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, X, Search, Calendar, Filter, 
  CheckCircle2, RefreshCw, ChevronLeft, ChevronRight, 
  FileSpreadsheet, HelpCircle, BarChart3, ChevronDown, AlertCircle,
  Download, Eye, Truck, FileText, Check, Camera
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { LOGO_MILLA_SIETE } from '../../utils/logoMillaSiete';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { DataTable, ColumnDef } from '../shared/DataTable';
import { TabCargar } from '../Gerencia/TabCargar';
import { TabConsultas } from '../Gerencia/TabConsultas';
import { TabTdmVentas } from '../Gerencia/TabTdmVentas';

interface ManagementOrder {
  oc_number: string;
  oc_status: string;
  oc_date: string;
  remesa_number: string;
  remission: string;
  remission_status: string;
  remission_date: string;
  manifest_number: string;
  client_order: string;
  manifest_observations: string;
  manifest_status: string;
  manifest_date: string;
  plate: string;
  client_name: string;
  total_value_cxc_final: string | number;
  total_value_cxp_final: string | number;
  invoice_cxc: string;
  receipt: string;
  invoice_date: string;
  total_cxc: string | number;
  egress: string;
  cxp_date: string;
  total_cxp: string | number;
  fecha_recibo?: string;
  fecha_egreso?: string;
  created_by: string;
  created_at: string;
  client_document?: string;
  driver_name?: string;
}

interface HierarchicalReportNode {
  name: string;
  count: number;
  children: {
    [remStatus: string]: {
      count: number;
      children: {
        [manStatus: string]: {
          count: number;
          clients: {
            [clientName: string]: number;
          };
        };
      };
    };
  };
}

interface ClientPlateNode {
  name: string;
  count: number;
  plates: {
    [plate: string]: number;
  };
}

const CHART_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#f43f5e', // Rose
];

// Intermediación real: si rawPct >= 20 → divide en 2; si < 20 → resta 10 (mínimo 0)
function calcIntReal(rawPct: number): number {
  return rawPct >= 20 ? rawPct / 2 : Math.max(0, rawPct - 10);
}

export const InformesGerenciales: React.FC = () => {
  // Tabs state: 'informes' | 'consultas' | 'cargar'
  const [activeTab, setActiveTab] = useState<'informes' | 'consultas' | 'cargar'>('informes');

  // Helper to download an element as an image
  const downloadAsImage = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Temporarily expand scrollable areas inside the element
    const scrollables = Array.from(element.querySelectorAll('.overflow-y-auto, .overflow-x-auto, .overflow-hidden, .max-h-\\[65vh\\], .custom-scrollbar')) as HTMLElement[];
    scrollables.push(element); // Incluir el contenedor principal

    const originalStyles = scrollables.map(el => ({
      el,
      maxHeight: el.style.maxHeight,
      overflow: el.style.overflow,
      overflowX: el.style.overflowX,
      overflowY: el.style.overflowY,
      height: el.style.height,
      width: el.style.width
    }));
    
    scrollables.forEach(el => {
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      el.style.overflowX = 'visible';
      el.style.overflowY = 'visible';
      el.style.height = 'auto';
      if (el.className.includes('overflow-x-auto') || el === element) {
        el.style.width = 'max-content';
      }
    });

    try {
      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.click();
    } catch (err) {
      console.error("Error al generar imagen", err);
      toast.error('Error al generar la imagen');
    } finally {
      // Restore styles
      originalStyles.forEach(({ el, maxHeight, overflow, overflowX, overflowY, height, width }) => {
        el.style.maxHeight = maxHeight;
        el.style.overflow = overflow;
        el.style.overflowX = overflowX;
        el.style.overflowY = overflowY;
        el.style.height = height;
        el.style.width = width;
      });
    }
  };

  // Sub-reports tab: 'estados' | 'clientes'
  const [subReportTab, setSubReportTab] = useState<'estados' | 'clientes' | 'tdmVentas' | 'pendienteFacturar'>('tdmVentas');
  const [provClientes, setProvClientes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [managementClients, setManagementClients] = useState<string[]>([]);

  // --- PDF REPORT MODAL STATE ---
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const pdfTitleRef = useRef('Informe Gerencial');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  
  const PDF_SECTIONS = [
    { id: 'chart-manifiesto-mes', label: 'Gráfica: Volúmenes Mensuales' },
    { id: 'chart-manifiesto-cliente', label: 'Gráfica: Volúmenes por Cliente' },
    { id: 'table-ventas-clientes-general', label: 'Tabla: Ventas Clientes General' },
    { id: 'chart-pie-ventas-general', label: 'Gráfica: Distribución Ventas General' },
    { id: 'table-resumen-ventas-generales', label: 'Tabla: Resumen Ventas Generales' },
    { id: 'chart-pie-ventas-resumen', label: 'Gráfica: Distribución Resumen Ventas' },
    { id: 'table-pendiente-facturar', label: 'Tabla: Pendiente por Facturar' },
    { id: 'table-estados', label: 'Tabla: Consolidado por Estados' },
    { id: 'table-clientes', label: 'Tabla: Consolidado Clientes y Placas' }
  ];
  
  const [pdfSelectedSections, setPdfSelectedSections] = useState<string[]>([
    'chart-manifiesto-mes', 'table-ventas-clientes-general'
  ]);

  const generatePdfReport = async () => {
    if (pdfSelectedSections.length === 0) {
      toast.error('Debe seleccionar al menos un elemento para el informe');
      return;
    }
    setPdfGenerating(true);

    // Wait for React to re-render the hidden tabs before capturing
    setTimeout(async () => {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      let yPos = 10;

      try {
        // Add Logo
        pdf.addImage(LOGO_MILLA_SIETE, 'PNG', margin, yPos, 40, 15);
        yPos += 20;

        // Add Title
        const currentTitle = pdfTitleRef.current || 'Informe Gerencial';
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        const titleWidth = pdf.getTextWidth(currentTitle);
        pdf.text(currentTitle, (pageWidth - titleWidth) / 2, yPos);
        yPos += 8;

        // Add Metadata (Dates and Clients)
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Fecha Desde: ${reportFromDate || 'N/A'} - Fecha Hasta: ${reportToDate || 'N/A'}`, margin, yPos);
        yPos += 6;
        const clientText = reportSelectedClients.includes('ALL') ? 'Todos los Clientes' : reportSelectedClients.join(', ');
        const splitClientText = pdf.splitTextToSize(`Clientes: ${clientText}`, pageWidth - (margin * 2));
        pdf.text(splitClientText, margin, yPos);
        yPos += (splitClientText.length * 5) + 10;

        // Add sections
        for (const sectionId of pdfSelectedSections) {
          const element = document.getElementById(sectionId);
          if (!element) continue;

          const scrollables = Array.from(element.querySelectorAll('.overflow-y-auto, .overflow-x-auto, .overflow-hidden, .max-h-\\[65vh\\], .custom-scrollbar')) as HTMLElement[];
          scrollables.push(element);

          const originalStyles = scrollables.map(el => ({
            el,
            maxHeight: el.style.maxHeight,
            overflow: el.style.overflow,
            overflowX: el.style.overflowX,
            overflowY: el.style.overflowY,
            height: el.style.height,
            width: el.style.width
          }));

          scrollables.forEach(el => {
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
            el.style.overflowX = 'visible';
            el.style.overflowY = 'visible';
            el.style.height = 'auto';
            if (el.className.includes('overflow-x-auto') || el === element) {
              el.style.width = 'max-content';
            }
          });

          await new Promise(resolve => setTimeout(resolve, 100));

          const dataUrl = await htmlToImage.toPng(element, {
            backgroundColor: '#ffffff',
            pixelRatio: 2,
          });

          originalStyles.forEach(({ el, maxHeight, overflow, overflowX, overflowY, height, width }) => {
            el.style.maxHeight = maxHeight;
            el.style.overflow = overflow;
            el.style.overflowX = overflowX;
            el.style.overflowY = overflowY;
            el.style.height = height;
            el.style.width = width;
          });

          const imgProps = pdf.getImageProperties(dataUrl);
          let imgWidth = pageWidth - (margin * 2);
          let imgHeight = (imgProps.height * imgWidth) / imgProps.width;

          // Scale down if it exceeds the max available height on a full page
          const maxAvailableHeight = pageHeight - (margin * 2);
          if (imgHeight > maxAvailableHeight) {
            imgHeight = maxAvailableHeight;
            imgWidth = (imgProps.width * imgHeight) / imgProps.height;
          }

          if (yPos + imgHeight > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }

          // Center the scaled image if its width is smaller than the full width
          const xPos = margin + ((pageWidth - (margin * 2) - imgWidth) / 2);

          pdf.addImage(dataUrl, 'PNG', xPos, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }

        pdf.save(`${currentTitle.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
        toast.success('Informe generado exitosamente');
        setIsPdfModalOpen(false);
      } catch (error) {
        console.error('Error generando PDF:', error);
        toast.error('Ocurrió un error al generar el PDF');
      } finally {
        setPdfGenerating(false);
      }
    }, 400); // Wait 400ms to guarantee React layout flushes correctly
  };

  useEffect(() => {
    const fetchOnMount = async () => {
      try {
        const data = await api.getProvClientes();
        if (Array.isArray(data)) {
          setProvClientes(data);
        }
      } catch (err) {
        console.error("Error loading prov clientes:", err);
      }
      try {
        const vehiclesData = await api.getVehicles();
        if (Array.isArray(vehiclesData)) {
          setVehicles(vehiclesData);
        }
      } catch (err) {
        console.error("Error loading vehicles:", err);
      }
      try {
        const clientsData = await api.getClients();
        if (Array.isArray(clientsData)) {
          setClients(clientsData);
        }
      } catch (err) {
        console.error("Error loading clients:", err);
      }
      try {
        const mgtClients = await (api as any).getManagementClients();
        if (Array.isArray(mgtClients)) {
          setManagementClients(mgtClients);
        }
      } catch (err) {
        console.error("Error loading management clients:", err);
      }
    };
    fetchOnMount();
  }, []);

  const [rightChartLimit, setRightChartLimit] = useState<'top10' | 'all'>('top10');
  const [rightChartGroupBy, setRightChartGroupBy] = useState<'oc' | 'manifiesto'>('manifiesto');
  const [tdmSearchQuery, setTdmSearchQuery] = useState('');
  const [tdmSortField, setTdmSortField] = useState<
    'clientName' | 'ventaTotal' | 'ingTerceros' | 'ingresosPropios' | 'int' | 'participation' | 'invoicedSameMonthVal' | 'invoicedSameMonthPct' | 'averagePaymentDays' | 'workedDaysCount' | 'totalVehicleUtilizations' | 'averageVehiclesPerDay' | 'averageRecDays' | 'averageEgrDays' | 'averageManRecDays' | 'receivedValue' | 'receivedDiffMonth' | 'receivedPct'
  >('ventaTotal');
  const [tdmSortDirection, setTdmSortDirection] = useState<'asc' | 'desc'>('desc');

  const [pendienteSearchQuery, setPendienteSearchQuery] = useState('');
  const [pendienteSortField, setPendienteSortField] = useState<string>('cxc');
  const [pendienteSortDirection, setPendienteSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pendienteShowCounts, setPendienteShowCounts] = useState(false);
  const [selectedPendingManifests, setSelectedPendingManifests] = useState<{ title: string, manifests: any[] } | null>(null);

  // DB Records state
  const [records, setRecords] = useState<ManagementOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10); // Dynamic pagination limit

  // Filters state
  const [filters, setFilters] = useState({
    ocNumber: '',
    manifestNumber: '',
    plate: '',
    clientName: '',
    fromDate: '',
    toDate: ''
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // Sorting state for Consultas de Información tab
  const [consultasSortField, setConsultasSortField] = useState<string>('manifest_date');
  const [consultasSortDirection, setConsultasSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleConsultasSort = (field: string) => {
    if (consultasSortField === field) {
      setConsultasSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setConsultasSortField(field);
      setConsultasSortDirection('desc');
    }
    setPage(1);
  };

  // Excel parsing & upload states
  const [excelData, setExcelData] = useState<any[]>([]);
  const [uploadType, setUploadType] = useState<'general' | 'recibo' | 'egreso'>('general');
  const [selectedClientForVehiclesInt, setSelectedClientForVehiclesInt] = useState<string | null>(null);
  const [selectedClientForVehiclesFactMes, setSelectedClientForVehiclesFactMes] = useState<string | null>(null);
  const [selectedVehicleManifestsFact, setSelectedVehicleManifestsFact] = useState<{
    plate: string;
    manifests: Array<{
      manifest_number: string;
      manifest_date: string;
      invoice_date: string;
      venta: number;
      facturado: number;
      factMesPct: number;
    }>;
  } | null>(null);
  const [selectedVehicleManifests, setSelectedVehicleManifests] = useState<{
    plate: string;
    manifests: Array<{
      manifest_number: string;
      manifest_date: string;
      venta: number;
      ingTerceros: number;
      ingresosPropios: number;
      int: number;
    }>;
  } | null>(null);
  const [vehiclesSearchQuery, setVehiclesSearchQuery] = useState('');
  const [vehiclesSortField, setVehiclesSortField] = useState<'plate' | 'manifestCount' | 'ventaTotal' | 'ingTerceros' | 'ingresosPropios' | 'int'>('ventaTotal');
  const [vehiclesSortDirection, setVehiclesSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isUploading, setIsUploading] = useState(false);
  const [isExportingGeneral, setIsExportingGeneral] = useState(false);
  const [isExportingTdm, setIsExportingTdm] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hierarchical Reports state
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportData, setReportData] = useState<{ [ocStatus: string]: HierarchicalReportNode }>({});
  const [clientReportData, setClientReportData] = useState<{ [clientName: string]: ClientPlateNode }>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRecords, setReportRecords] = useState<ManagementOrder[]>([]);
  const [tdmFlotaRows, setTdmFlotaRows] = useState<any[]>([]);
  const [selectedClientChartName, setSelectedClientChartName] = useState<string | null>(null);
  const [reportSelectedClients, setReportSelectedClients] = useState<string[]>(['ALL']);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Expanded tree states
  const [expandedOcs, setExpandedOcs] = useState<{ [key: string]: boolean }>({});
  const [expandedRemesas, setExpandedRemesas] = useState<{ [key: string]: boolean }>({});
  const [expandedManifests, setExpandedManifests] = useState<{ [key: string]: boolean }>({});
  const [expandedClients, setExpandedClients] = useState<{ [key: string]: boolean }>({});

  // Check if dates or clients are selected to allow query
  const canGenerateReport = (reportFromDate !== '' && reportToDate !== '') || (reportSelectedClients.length > 0 && !reportSelectedClients.includes('ALL'));

  // 25 columns configuration mapping for general import, receipts and egresses
  const columnsConfig = [
    { key: 'oc_number', label: 'Número OC', render: (row: ManagementOrder) => <span className="font-black text-slate-800">{row.oc_number}</span> },
    { key: 'oc_status', label: 'Estado OC', render: (row: ManagementOrder) => (
      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase leading-none ${
        row.oc_status === 'COMPLETADA' || row.oc_status === 'COMPLETADO' || row.oc_status === 'CUMPLIDO' || row.oc_status === 'ENTREGADO'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700'
      }`}>
        {row.oc_status || 'S/I'}
      </span>
    ) },
    { key: 'oc_date', label: 'Fecha OC', render: (row: ManagementOrder) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.oc_date)}</span> },
    { key: 'remesa_number', label: 'Número Remesa', render: (row: ManagementOrder) => <span className="font-bold text-slate-600">{row.remesa_number || 'S/I'}</span> },
    { key: 'remission', label: 'Remisión', render: (row: ManagementOrder) => <span className="font-bold text-slate-800">{row.remission || 'S/I'}</span> },
    { key: 'remission_status', label: 'Estado Remisión', render: (row: ManagementOrder) => <span className="text-slate-500">{row.remission_status || 'S/I'}</span> },
    { key: 'remission_date', label: 'Fecha Remisión', render: (row: ManagementOrder) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.remission_date)}</span> },
    { key: 'manifest_number', label: 'Número Manifiesto', render: (row: ManagementOrder) => <span className="font-bold text-slate-600">{row.manifest_number || 'S/I'}</span> },
    { key: 'manifest_status', label: 'Estado Manifiesto', render: (row: ManagementOrder) => <span className="text-slate-500">{row.manifest_status || 'S/I'}</span> },
    { key: 'manifest_date', label: 'Fecha Manifiesto', render: (row: ManagementOrder) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.manifest_date)}</span> },
    { key: 'manifest_observations', label: 'Observaciones Manifiesto', render: (row: ManagementOrder) => <span className="text-slate-400 truncate max-w-[150px] inline-block" title={row.manifest_observations}>{row.manifest_observations || 'S/I'}</span> },
    { key: 'client_order', label: 'Orden Cliente', render: (row: ManagementOrder) => <span className="text-slate-500">{row.client_order || 'S/I'}</span> },
    { key: 'plate', label: 'Placa', render: (row: ManagementOrder) => (
      <span className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-600 font-mono">
        {row.plate || 'S/I'}
      </span>
    ) },
    { key: 'client_name', label: 'Nombre Cliente', render: (row: ManagementOrder) => <span className="font-bold truncate max-w-[150px] inline-block" title={row.client_name}>{row.client_name || 'S/I'}</span> },
    { key: 'client_document', label: 'Documento Cliente', render: (row: ManagementOrder) => <span className="font-mono text-[10px] text-slate-500">{row.client_document || '—'}</span> },
    { key: 'total_value_cxc_final', label: 'Valor Total CXC final', align: 'right', render: (row: ManagementOrder) => <span className="font-black text-indigo-600">{formatMoney(row.total_value_cxc_final)}</span> },
    { key: 'total_value_cxp_final', label: 'Valor Tot CXP final', align: 'right', render: (row: ManagementOrder) => <span className="font-black text-slate-800">{formatMoney(row.total_value_cxp_final)}</span> },
    { key: 'invoice_cxc', label: 'Factura CXC', render: (row: ManagementOrder) => <span className="font-bold text-slate-700">{row.invoice_cxc || 'S/I'}</span> },
    { key: 'receipt', label: 'Recibo', render: (row: ManagementOrder) => <span className="font-bold text-slate-700">{row.receipt || 'S/I'}</span> },
    { key: 'invoice_date', label: 'Fecha Factura', render: (row: ManagementOrder) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.invoice_date)}</span> },
    { key: 'total_cxc', label: 'Total CXC', align: 'right', render: (row: ManagementOrder) => <span className="font-bold text-slate-600">{formatMoney(row.total_cxc)}</span> },
    { key: 'egress', label: 'Egreso', render: (row: ManagementOrder) => <span className="font-bold text-slate-700">{row.egress || 'S/I'}</span> },
    { key: 'cxp_date', label: 'Fecha CXP', render: (row: ManagementOrder) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.cxp_date)}</span> },
    { key: 'total_cxp', label: 'Total CXP', align: 'right', render: (row: ManagementOrder) => <span className="font-bold text-slate-600">{formatMoney(row.total_cxp)}</span> },
    { key: 'fecha_recibo', label: 'Fecha Recibo', render: (row: ManagementOrder) => <span className="font-bold whitespace-nowrap text-slate-500">{row.fecha_recibo ? formatDate(row.fecha_recibo) : '-'}</span> },
    { key: 'fecha_egreso', label: 'Fecha Egreso', render: (row: ManagementOrder) => <span className="font-bold whitespace-nowrap text-slate-500">{row.fecha_egreso ? formatDate(row.fecha_egreso) : '-'}</span> }
  ];

  // Load records from DB for the "Consultas" tab
  const loadRecords = async (currentPage = page, filterParams = appliedFilters, currentLimit = limit) => {
    // If one of the dates is selected but not both, do NOT execute query to avoid inconsistency
    const hasFrom = !!filterParams.fromDate;
    const hasTo = !!filterParams.toDate;
    if ((hasFrom && !hasTo) || (!hasFrom && hasTo)) {
      return;
    }

    setLoading(true);
    try {
      const res = await (api as any).getManagementReports({
        page: currentPage,
        limit: currentLimit,
        sortBy: consultasSortField,
        sortDirection: consultasSortDirection,
        ...filterParams
      });
      if (res) {
        setRecords(res.records || []);
        setTotal(res.total || 0);
      }
    } catch (err: any) {
      console.error('[M7-MGT-LOAD-ERR]', err);
      toast.error('No se pudieron cargar los informes gerenciales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(page, appliedFilters, limit);
  }, [page, appliedFilters, limit, consultasSortField, consultasSortDirection]);

  // Hierarchical Report Generator (Both States and Clients trees in one pass)
  const generateReport = async () => {
    if (!canGenerateReport) {
      return; // Hold execution as requested until valid bounds are selected
    }

    setReportLoading(true);
    try {
      const res = await (api as any).getManagementReports({
        page: 1,
        limit: 50000,
        fromDate: reportFromDate,
        toDate: reportToDate,
        clientNames: reportSelectedClients.includes('ALL') ? undefined : reportSelectedClients.join(',')
      });

      const recordsList: ManagementOrder[] = res.records || [];
      const tree: { [ocStatus: string]: HierarchicalReportNode } = {};
      const clientTree: { [clientName: string]: ClientPlateNode } = {};

      recordsList.forEach(r => {
        // 1. Process Status Tree (OC -> Remesa -> Manifiesto -> Cliente)
        const rawOc = r.oc_status ? String(r.oc_status).trim().toUpperCase() : 'S/I';
        const rawRem = r.remission_status ? String(r.remission_status).trim().toUpperCase() : 'S/I';
        const rawMan = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : 'S/I';
        const clientName = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';

        if (!tree[rawOc]) {
          tree[rawOc] = {
            name: rawOc,
            count: 0,
            children: {}
          };
        }
        tree[rawOc].count++;

        if (!tree[rawOc].children[rawRem]) {
          tree[rawOc].children[rawRem] = {
            count: 0,
            children: {}
          };
        }
        tree[rawOc].children[rawRem].count++;

        if (!tree[rawOc].children[rawRem].children[rawMan]) {
          tree[rawOc].children[rawRem].children[rawMan] = {
            count: 0,
            clients: {}
          };
        }
        tree[rawOc].children[rawRem].children[rawMan].count++;

        if (!tree[rawOc].children[rawRem].children[rawMan].clients[clientName]) {
          tree[rawOc].children[rawRem].children[rawMan].clients[clientName] = 0;
        }
        tree[rawOc].children[rawRem].children[rawMan].clients[clientName]++;

        // 2. Process Client & Plate Tree (Nombre Cliente -> Placa)
        const plate = r.plate ? String(r.plate).trim().toUpperCase() : 'S/I';

        if (!clientTree[clientName]) {
          clientTree[clientName] = {
            name: clientName,
            count: 0,
            plates: {}
          };
        }
        clientTree[clientName].count++;

        if (!clientTree[clientName].plates[plate]) {
          clientTree[clientName].plates[plate] = 0;
        }
        clientTree[clientName].plates[plate]++;
      });

      setReportData(tree);
      setClientReportData(clientTree);
      setReportRecords(recordsList);

      // Fetch TDM flota manifiestos for the same date range
      try {
        const flotaRes = await (api as any).getTdmManifiestos({
          from: reportFromDate || undefined,
          to: reportToDate || undefined,
        });
        setTdmFlotaRows(Array.isArray(flotaRes) ? flotaRes : (flotaRes?.data ?? []));
      } catch (flotaErr) {
        console.warn('[TDM-FLOTA-FETCH-WARN]', flotaErr);
        setTdmFlotaRows([]);
      }

      // Auto-expand Level 1 and Level 2 nodes on initial generation
      const initialOcs: { [key: string]: boolean } = {};
      Object.keys(tree).forEach(k => {
        initialOcs[k] = true;
      });
      setExpandedOcs(initialOcs);

      const initialClients: { [key: string]: boolean } = {};
      Object.keys(clientTree).forEach(k => {
        initialClients[k] = true;
      });
      setExpandedClients(initialClients);

      // Auto-expand Manifest nodes to instantly show level 4 clients
      const initialMans: { [key: string]: boolean } = {};
      Object.keys(tree).forEach(oc => {
        Object.keys(tree[oc].children).forEach(rem => {
          Object.keys(tree[oc].children[rem].children).forEach(man => {
            initialMans[`${oc}__${rem}__${man}`] = true;
          });
        });
      });
      setExpandedManifests(initialMans);

    } catch (err) {
      console.error('[M7-GENERATE-REPORT-ERR]', err);
      toast.error('Ocurrió un error al procesar el reporte jerárquico.');
    } finally {
      setReportLoading(false);
    }
  };



  // Expanded Tree toggles
  const toggleOc = (ocName: string) => {
    setExpandedOcs(prev => ({ ...prev, [ocName]: !prev[ocName] }));
  };

  const toggleRemesa = (ocName: string, remName: string) => {
    const key = `${ocName}__${remName}`;
    setExpandedRemesas(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleManifest = (ocName: string, remName: string, manName: string) => {
    const key = `${ocName}__${remName}__${manName}`;
    setExpandedManifests(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleClient = (clientName: string) => {
    setExpandedClients(prev => ({ ...prev, [clientName]: !prev[clientName] }));
  };

  // Handle filter submission for queries tab
  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const hasFrom = !!filters.fromDate;
    const hasTo = !!filters.toDate;
    if ((hasFrom && !hasTo) || (!hasFrom && hasTo)) {
      toast.warning('Por favor seleccione ambas fechas (Desde y Hasta) para filtrar por rango.');
      return;
    }
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleClearFilters = () => {
    const defaultFilters = {
      ocNumber: '',
      manifestNumber: '',
      plate: '',
      clientName: '',
      fromDate: '',
      toDate: ''
    };
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  // Drag and Drop files handling
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Parsing Excel using SheetJS
  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rawJson.length === 0) {
          toast.error('El archivo Excel cargado está vacío.');
          return;
        }

        if (uploadType === 'recibo' || uploadType === 'egreso') {
          // Check for Consecutivo and Fecha
          const firstRow = rawJson[0] as any;
          const keys = Object.keys(firstRow);
          const hasConsecutivo = keys.some(k => k.toLowerCase() === 'consecutivo');
          const hasFecha = keys.some(k => k.toLowerCase() === 'fecha');

          if (!hasConsecutivo || !hasFecha) {
            toast.error('El archivo Excel no coincide con las columnas requeridas (Falta "Consecutivo" o "Fecha").');
            return;
          }

          setExcelData(rawJson);
          toast.success(`Archivo de ${uploadType === 'recibo' ? 'Recibo' : 'Egresos'} cargado: ${rawJson.length} filas detectadas.`);
          return;
        }

        // Apply custom TDM TRANSPORTES S.A.S clients mapping logic before displaying/storing
        const transformedJson = rawJson.map((row: any) => {
          const clientKey = Object.keys(row).find(k => k.toLowerCase() === 'nombre cliente' || k.toLowerCase() === 'clientname') || 'Nombre Cliente';
          const origenKey = Object.keys(row).find(k => k.toLowerCase() === 'origen') || 'Origen';
          const descKey = Object.keys(row).find(k => k.toLowerCase() === 'descripcion cxc' || k.toLowerCase() === 'descripcion_cxc' || k.toLowerCase().replace(/ó/g, 'o') === 'descripcion cxc') || 'Descripción CXC';

          let clientName = String(row[clientKey] || '').trim();
          const origenVal = String(row[origenKey] || '').trim();
          const descVal = String(row[descKey] || '').trim();

          const clientUpper = clientName.toUpperCase();
          const originUpper = origenVal.toUpperCase();
          
          const docKey = Object.keys(row).find(k => k.toLowerCase() === 'documento cliente' || k.toLowerCase().includes('nit')) || 'Documento Cliente';
          const docVal = String(row[docKey] || '').trim();

          const isAjover = clientUpper.includes('AJOVER') || docVal.includes('860013771');
          const isTdm = clientUpper.includes('TDM') || docVal.includes('890901352');

          if (isAjover) {
            if (originUpper.includes('CALI')) {
              clientName = 'AJOVER CALI M7 LINA';
              row[clientKey] = clientName;
              row['Nombre Cliente'] = clientName;
              row.clientName = clientName;
            } else {
              clientName = 'AJOVER M7_BODEGA36';
              row[clientKey] = clientName;
              row['Nombre Cliente'] = clientName;
              row.clientName = clientName;
            }
          } else if (isTdm) {
            if (originUpper.includes('ESTRELLA')) {
              clientName = 'AJOVER_BODEGA10';
            } else if (originUpper.includes('CALI')) {
              clientName = 'AJOVER CALI DIANA LOBATON';
            } else if (originUpper.includes('GIRARDOTA')) {
              clientName = 'TDM (PREBEL)';
            }
            
            row[clientKey] = clientName;
            row['Nombre Cliente'] = clientName;
            row.clientName = clientName;
          }

          return row;
        });

        const firstRow = transformedJson[0] as any;
        const keys = Object.keys(firstRow);
        const hasOcKey = keys.some(k => k.toLowerCase().replace(/ú/g, 'u').includes('numero oc') || k.toLowerCase().includes('ocnumber'));

        if (!hasOcKey) {
          toast.error('El archivo Excel no coincide con las columnas (Falta "Número OC").');
          return;
        }

        setExcelData(transformedJson);
        toast.success(`Archivo cargado: ${rawJson.length} filas detectadas para previsualizar.`);
      } catch (err: any) {
        console.error('[M7-PARSE-EXCEL-ERR]', err);
        toast.error('Error al leer el archivo de Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Confirm upload to backend
  const handleConfirmUpload = async () => {
    setIsUploading(true);
    try {
      let res;
      if (uploadType === 'recibo') {
        res = await (api as any).uploadReceiptDates(excelData);
      } else if (uploadType === 'egreso') {
        res = await (api as any).uploadEgressDates(excelData);
      } else {
        res = await (api as any).uploadManagementReports(excelData);
      }

      if (res && res.success) {
        toast.success(res.message || 'Información importada correctamente');
        setExcelData([]);
        setActiveTab('consultas'); 
        loadRecords(1); 
      } else {
        toast.error(res.error || 'Hubo un error al guardar la información');
      }
    } catch (err: any) {
      console.error('[M7-CONFIRM-UPLOAD-ERR]', err);
      toast.error('Error inesperado al guardar los informes.');
    } finally {
      setIsUploading(false);
    }
  };

  // Robust custom date parsing helper
  const parseCustomDate = (val: any): Date | null => {
    if (val === null || val === undefined || val === '') return null;
    
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? null : val;
    }
    
    if (typeof val === 'number') {
      if (val > 10000 && val < 100000) {
        return new Date(Math.round((val - 25569) * 86400 * 1000));
      }
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    
    const str = String(val).trim();
    if (!str || str.toLowerCase() === 's/i' || str.toLowerCase() === 'null') return null;

    const dmyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/;
    const match = str.match(dmyRegex);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const minute = match[5] ? parseInt(match[5], 10) : 0;
      const second = match[6] ? parseInt(match[6], 10) : 0;
      
      const d = new Date(year, month, day, hour, minute, second);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // Helper to format currency
  const formatMoney = (val: any) => {
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num);
  };

  // Helper to format dates cleanly as DD/MM/YYYY strictly in America/Bogota timezone
  const formatColombianDateStr = (val: any): string => {
    if (!val) return '';
    const parsed = parseCustomDate(val);
    if (!parsed) return String(val);
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(parsed);
      const year = parts.find(p => p.type === 'year')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      return `${day}/${month}/${year}`;
    } catch (e) {
      return String(val);
    }
  };

  // Helper to format dates cleanly as DD/MM/YYYY HH:MM:SS strictly in America/Bogota timezone
  const formatDate = (val: any) => {
    if (!val) return 'S/I';
    const parsed = parseCustomDate(val);
    if (!parsed) return String(val);

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(parsed);
      const year = parts.find(p => p.type === 'year')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      const hour = parts.find(p => p.type === 'hour')?.value || '00';
      const minute = parts.find(p => p.type === 'minute')?.value || '00';
      const second = parts.find(p => p.type === 'second')?.value || '00';
      return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
    } catch (e) {
      const day = String(parsed.getDate()).padStart(2, '0');
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const year = parsed.getFullYear();
      
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      const ss = String(parsed.getSeconds()).padStart(2, '0');
      
      return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
    }
  };

  // SheetJS Export to Excel implementation
  const handleExportToExcel = () => {
    if (records.length === 0) {
      toast.error('No hay datos disponibles para exportar.');
      return;
    }
    try {
      const exportRows = records.map(r => ({
        'Número OC': r.oc_number,
        'Estado OC': r.oc_status,
        'Fecha OC': formatDate(r.oc_date),
        'Número Remesa': r.remesa_number,
        'Remisión': r.remission,
        'Estado Remesa': r.remission_status,
        'Fecha Remesa': formatDate(r.remission_date),
        'Número Manifiesto': r.manifest_number,
        'Orden Cliente': r.client_order,
        'Observaciones Manifiesto': r.manifest_observations,
        'Estado Manifiesto': r.manifest_status,
        'Fecha Manifiesto': formatDate(r.manifest_date),
        'Placa': r.plate,
        'Nombre Cliente': r.client_name,
        'Valor Total CXC final': parseValNum(r.total_value_cxc_final),
        'Valor Tot CXP final': parseValNum(r.total_value_cxp_final),
        'Factura CXC': r.invoice_cxc,
        'Recibo': r.receipt,
        'Fecha Factura': formatDate(r.invoice_date),
        'Total CXC': parseValNum(r.total_cxc),
        'Egreso': r.egress,
        'Fecha CXP': formatDate(r.cxp_date),
        'Total CXP': parseValNum(r.total_cxp)
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);

      const colZFormats: Record<string, string> = {
        'Valor Total CXC final': '"$"#,##0',
        'Valor Tot CXP final': '"$"#,##0',
        'Total CXC': '"$"#,##0',
        'Total CXP': '"$"#,##0'
      };

      if (worksheet['!ref']) {
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const colNames: Record<number, string> = {};
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell && cell.v) colNames[C] = cell.v.toString();
        }
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const colName = colNames[C];
            if (colName && colZFormats[colName]) {
              const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
              if (cell && cell.t === 'n') {
                cell.z = colZFormats[colName];
              }
            }
          }
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "InformesGerenciales");
      
      const maxLens = Object.keys(exportRows[0]).map(key => {
        let max = key.length;
        exportRows.forEach(row => {
          const val = String((row as any)[key] || '');
          if (val.length > max) max = val.length;
        });
        return { wch: max + 3 };
      });
      worksheet['!cols'] = maxLens;

      XLSX.writeFile(workbook, `Reporte_Gerencial_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Reporte exportado a Excel exitosamente.');
    } catch (err) {
      console.error('[EXPORT-XLSX-ERR]', err);
      toast.error('Error al generar el archivo de Excel.');
    }
  };

  // Pie chart calculation helper
  const getOcPieData = () => {
    return Object.keys(reportData).map(key => ({
      name: key,
      value: reportData[key].count
    }));
  };

  const getClientPieData = () => {
    const sorted = Object.keys(clientReportData).map(key => ({
      name: key,
      value: clientReportData[key].count
    })).sort((a, b) => b.value - a.value);

    if (sorted.length <= 5) return sorted;
    const top = sorted.slice(0, 4);
    const othersVal = sorted.slice(4).reduce((sum, curr) => sum + curr.value, 0);
    top.push({ name: 'OTROS CLIENTES', value: othersVal });
    return top;
  };

  const getOcBarDataByMonth = () => {
    const monthsMap: { [monthKey: string]: { [status: string]: number; sortKey: number } } = {};
    const allStatuses = new Set<string>();
    
    const MONTHS_SPANISH = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    reportRecords.forEach(r => {
      const parsed = parseCustomDate(r.manifest_date);
      if (!parsed) return;
      
      const year = parsed.getFullYear();
      const monthIndex = parsed.getMonth();
      const monthName = MONTHS_SPANISH[monthIndex];
      const monthStr = `${monthName} ${year}`;
      const sortKey = year * 12 + monthIndex;

      const status = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : 'S/I';
      allStatuses.add(status);

      if (!monthsMap[monthStr]) {
        monthsMap[monthStr] = { sortKey };
      }
      if (!monthsMap[monthStr][status]) {
        monthsMap[monthStr][status] = 0;
      }
      monthsMap[monthStr][status]++;
    });

    const sortedMonths = Object.keys(monthsMap).sort((a, b) => monthsMap[a].sortKey - monthsMap[b].sortKey);

    return {
      data: sortedMonths.map(monthStr => {
        const obj: any = { month: monthStr };
        allStatuses.forEach(st => {
          obj[st] = monthsMap[monthStr][st] || 0;
        });
        return obj;
      }),
      statuses: Array.from(allStatuses)
    };
  };

  const getDynamicClientBarData = (groupBy: 'oc' | 'manifiesto', limitMode: 'top10' | 'all') => {
    const clientsMap: { [clientName: string]: { [status: string]: number; totalCount: number } } = {};
    const allStatuses = new Set<string>();

    reportRecords.forEach(r => {
      const client = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';
      const status = groupBy === 'oc'
        ? (r.oc_status ? String(r.oc_status).trim().toUpperCase() : 'S/I')
        : (r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : 'S/I');

      allStatuses.add(status);

      if (!clientsMap[client]) {
        clientsMap[client] = { totalCount: 0 };
      }
      if (!clientsMap[client][status]) {
        clientsMap[client][status] = 0;
      }
      clientsMap[client][status]++;
      clientsMap[client].totalCount++;
    });

    let clientList = Object.keys(clientsMap).map(client => ({
      client,
      totalCount: clientsMap[client].totalCount,
      ...clientsMap[client]
    })).sort((a, b) => b.totalCount - a.totalCount);

    if (limitMode === 'top10') {
      clientList = clientList.slice(0, 10);
    }

    // Map to recharts data format
    const chartData = clientList.map(item => {
      const obj: any = { client: item.client };
      allStatuses.forEach(st => {
        obj[st] = item[st] || 0;
      });
      return obj;
    });

    return {
      data: chartData,
      statuses: Array.from(allStatuses)
    };
  };

  const parseValNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  const SalesPieChart: React.FC<{ data: { client: string; ventaTotal: number }[] }> = ({ data }) => {
    const chartData = data
      .filter(item => item.ventaTotal > 0)
      .map(item => ({
        name: item.client,
        value: item.ventaTotal
      }));

    if (chartData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs font-bold py-12">
          No hay ventas registradas para graficar.
        </div>
      );
    }

    const CHART_COLORS = [
      '#6366f1', // Indigo
      '#10b981', // Emerald
      '#3b82f6', // Blue
      '#f59e0b', // Amber
      '#ec4899', // Pink
      '#8b5cf6', // Violet
      '#06b6d4', // Cyan
      '#f43f5e', // Rose
      '#14b8a6', // Teal
      '#a855f7'  // Purple
    ];

    return (
      <div className="w-full flex flex-col items-center">
        <div className="h-[280px] w-full max-w-lg">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [`$${Number(value).toLocaleString('es-CO')}`, 'Venta']}
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Custom Legend for premium look with sales details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4 w-full max-h-[160px] overflow-y-auto custom-scrollbar bg-white/80 p-3 rounded-2xl border border-slate-100 shadow-xs">
          {chartData.map((item, index) => {
            const color = CHART_COLORS[index % CHART_COLORS.length];
            return (
              <div key={item.name} className="flex items-start gap-2 p-2 rounded-xl hover:bg-white transition-all shadow-xs border border-slate-50">
                <span className="w-3 h-3 rounded-full mt-0.5 shrink-0 shadow-xs" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-slate-800 truncate uppercase tracking-tight leading-tight">{item.name}</p>
                  <p className="text-[10px] font-mono font-bold text-indigo-600 leading-none mt-1">
                    ${item.value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getClientTdmTableData = () => {
    const clientsMap: { 
      [clientName: string]: { 
        ventaTotal: number; 
        ingTerceros: number; 
        vehicles: Set<string>; 
        workedDates: Set<string>;
        vehicleDays: Set<string>;
        invoicedSameMonth: number;
        totalPaymentDays: number;
        paymentDaysCount: number;
        totalRecDays: number;
        recDaysCount: number;
        totalEgrDays: number;
        egrDaysCount: number;
        totalManRecDays: number;
        manRecDaysCount: number;
        receivedValue: number;
        receivedDiffMonth: number;
      } 
    } = {};

    reportRecords.forEach(r => {
      const manifestStatus = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
      if (manifestStatus === 'ANULADO' || manifestStatus === 'ANULADA') {
        return;
      }

      let client = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';
      if (client === 'LOGISTICA,TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S' || client === 'LOGISTICA, TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S') {
        const p = r.plate ? String(r.plate).trim().toUpperCase() : '';
        const veh = vehicles.find(v => String(v.plate).trim().toUpperCase() === p);
        if (veh && veh.client_id) {
          const cli = clients.find(c => String(c.id).trim().toUpperCase() === String(veh.client_id).trim().toUpperCase());
          if (cli && cli.name) {
            client = String(cli.name).trim().toUpperCase();
          }
        }
      }

      const cxc = parseValNum(r.total_cxc);
      const cxcFinal = parseValNum(r.total_value_cxc_final);
      const ventaRecord = cxc === 0 ? cxcFinal : cxc;

      const ingTercerosRecord = parseValNum(r.total_value_cxp_final);

      const plate = r.plate ? String(r.plate).trim().toUpperCase() : '';
      const date = r.manifest_date ? String(r.manifest_date).trim() : '';

      if (!clientsMap[client]) {
        clientsMap[client] = {
          ventaTotal: 0,
          ingTerceros: 0,
          vehicles: new Set<string>(),
          workedDates: new Set<string>(),
          vehicleDays: new Set<string>(),
          invoicedSameMonth: 0,
          totalPaymentDays: 0,
          paymentDaysCount: 0,
          totalRecDays: 0,
          recDaysCount: 0,
          totalEgrDays: 0,
          egrDaysCount: 0,
          totalManRecDays: 0,
          manRecDaysCount: 0,
          receivedValue: 0,
          receivedDiffMonth: 0
        };
      }

      clientsMap[client].ventaTotal += ventaRecord;
      clientsMap[client].ingTerceros += ingTercerosRecord;

      // Calcular días usando solo fecha calendario (sin horas) para evitar error ±1 día
      const toDateOnly = (d: Date | null) => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
      const calDaysOnly = (a: Date | null, b: Date | null) => {
        const da = toDateOnly(a), db = toDateOnly(b);
        return da && db ? Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000)) : null;
      };

      let invoicedInSameMonth = 0;
      const dMan = toDateOnly(parseCustomDate(r.manifest_date));
      const dInv = toDateOnly(parseCustomDate(r.invoice_date));
      const dRec = toDateOnly(parseCustomDate(r.fecha_recibo));
      const dEgr = toDateOnly(parseCustomDate(r.fecha_egreso));

      if (dMan && dInv) {
        clientsMap[client].totalPaymentDays += calDaysOnly(dMan, dInv)!;
        clientsMap[client].paymentDaysCount += 1;

        const invStr = r.invoice_cxc ? String(r.invoice_cxc).trim().toUpperCase() : '';
        const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A' && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
        if (hasInvoice) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            invoicedInSameMonth = ventaRecord;
          }
        }
      }
      clientsMap[client].invoicedSameMonth += invoicedInSameMonth;

      // 1. prom dias rec (invoice to receipt)
      if (dInv && dRec) {
        clientsMap[client].totalRecDays += calDaysOnly(dInv, dRec)!;
        clientsMap[client].recDaysCount += 1;
      }

      // 2. prom dias egreso (manifest to egress)
      if (dMan && dEgr) {
        clientsMap[client].totalEgrDays += calDaysOnly(dMan, dEgr)!;
        clientsMap[client].egrDaysCount += 1;
      }

      // 3. prom dia man recibido (manifest to receipt) and received value
      if (dMan && dRec) {
        clientsMap[client].totalManRecDays += calDaysOnly(dMan, dRec)!;
        clientsMap[client].manRecDaysCount += 1;
      }

      if (dRec) {
        const invStr = r.invoice_cxc ? String(r.invoice_cxc).trim().toUpperCase() : '';
        const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A' && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
        if (hasInvoice && dInv && dMan) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            clientsMap[client].receivedValue += ventaRecord;
          } else {
            clientsMap[client].receivedDiffMonth += ventaRecord;
          }
        } else {
          clientsMap[client].receivedDiffMonth += ventaRecord;
        }
      }

      if (plate) {
        clientsMap[client].vehicles.add(plate);
      }
      if (date) {
        clientsMap[client].workedDates.add(date);
        if (plate) {
          clientsMap[client].vehicleDays.add(`${plate}_${date}`);
        }
      }
    });

    // Merge flota_tdm_manifiestos rows into RESUMEN VENTAS GENERALES
    tdmFlotaRows.forEach(r => {
      const clientObj = clients.find(c => String(c.id).trim().toUpperCase() === String(r.client_id || '').trim().toUpperCase());
      const clientBaseName = clientObj ? String(clientObj.name).trim().toUpperCase() : String(r.client_id || 'S/I').trim().toUpperCase();
      const client = `TDM ${clientBaseName}`;
      const cobrar = Number(r.valor_cobrar) || 0;
      const pagar = Number(r.valor_pagar) || 0;
      const plate = r.placa ? String(r.placa).trim().toUpperCase() : '';
      const date = r.fecha_operacion ? String(r.fecha_operacion).trim().slice(0, 10) : '';
      if (!clientsMap[client]) {
        clientsMap[client] = {
          ventaTotal: 0, ingTerceros: 0,
          vehicles: new Set(), workedDates: new Set(), vehicleDays: new Set(),
          invoicedSameMonth: 0, totalPaymentDays: 0, paymentDaysCount: 0,
          totalRecDays: 0, recDaysCount: 0, totalEgrDays: 0, egrDaysCount: 0,
          totalManRecDays: 0, manRecDaysCount: 0, receivedValue: 0, receivedDiffMonth: 0,
        };
      }
      clientsMap[client].ventaTotal += cobrar;
      clientsMap[client].ingTerceros += pagar;
      if (plate) clientsMap[client].vehicles.add(plate);
      if (date) {
        clientsMap[client].workedDates.add(date);
        if (plate) clientsMap[client].vehicleDays.add(`${plate}_${date}`);
      }
    });

    // Calculate total sales of all clients combined
    let grandTotalSales = 0;
    Object.values(clientsMap).forEach(node => {
      grandTotalSales += node.ventaTotal;
    });

    return Object.keys(clientsMap).map(clientName => {
      const node = clientsMap[clientName];
      const ventaTotal = node.ventaTotal;
      const ingTerceros = node.ingTerceros;
      const ingresosPropios = ventaTotal - ingTerceros;
      const int = calcIntReal(ventaTotal > 0 ? (ingresosPropios / ventaTotal) * 100 : 0);
      const vehiculosCount = node.vehicles.size;
      const workedDaysCount = node.workedDates.size;
      const totalVehicleUtilizations = node.vehicleDays.size;
      const averageVehiclesPerDay = workedDaysCount > 0 ? totalVehicleUtilizations / workedDaysCount : 0;
      const participation = grandTotalSales > 0 ? (ventaTotal / grandTotalSales) * 100 : 0;
      
      const invoicedSameMonthVal = node.invoicedSameMonth;
      const invoicedSameMonthPct = ventaTotal > 0 ? (invoicedSameMonthVal / ventaTotal) * 100 : 0;

      const averagePaymentDays = node.paymentDaysCount > 0 ? node.totalPaymentDays / node.paymentDaysCount : 0;

      const averageRecDays = node.recDaysCount > 0 ? node.totalRecDays / node.recDaysCount : 0;
      const averageEgrDays = node.egrDaysCount > 0 ? node.totalEgrDays / node.egrDaysCount : 0;
      const averageManRecDays = node.manRecDaysCount > 0 ? node.totalManRecDays / node.manRecDaysCount : 0;
      const receivedValue = node.receivedValue;
      const receivedPct = ventaTotal > 0 ? (receivedValue / ventaTotal) * 100 : 0;

      return {
        clientName,
        ventaTotal,
        ingTerceros,
        ingresosPropios,
        int,
        vehiculosCount,
        uniquePlates: node.vehicles,
        workedDaysCount,
        totalVehicleUtilizations,
        averageVehiclesPerDay,
        workedDates: node.workedDates,
        vehicleDays: node.vehicleDays,
        participation,
        invoicedSameMonthVal,
        invoicedSameMonthPct,
        averagePaymentDays,
        totalPaymentDays: node.totalPaymentDays,
        paymentDaysCount: node.paymentDaysCount,
        totalRecDays: node.totalRecDays,
        recDaysCount: node.recDaysCount,
        totalEgrDays: node.totalEgrDays,
        egrDaysCount: node.egrDaysCount,
        totalManRecDays: node.totalManRecDays,
        manRecDaysCount: node.manRecDaysCount,
        averageRecDays,
        averageEgrDays,
        averageManRecDays,
        receivedValue,
        receivedDiffMonth: node.receivedDiffMonth,
        receivedPct
      };
    }).sort((a, b) => {
      const valA = a[tdmSortField];
      const valB = b[tdmSortField];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return tdmSortDirection === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return tdmSortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });
  };

  const getGeneralTdmTableData = () => {
    const clientsMap: { 
      [clientName: string]: { 
        ventaTotal: number; 
        ingTerceros: number; 
        vehicles: Set<string>; 
        workedDates: Set<string>;
        vehicleDays: Set<string>;
        invoicedSameMonth: number;
        totalPaymentDays: number;
        paymentDaysCount: number;
        totalRecDays: number;
        recDaysCount: number;
        totalEgrDays: number;
        egrDaysCount: number;
        totalManRecDays: number;
        manRecDaysCount: number;
        receivedValue: number;
        receivedDiffMonth: number;
      } 
    } = {};

    reportRecords.forEach(r => {
      const manifestStatus = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
      if (manifestStatus === 'ANULADO' || manifestStatus === 'ANULADA') {
        return;
      }

      // Join logic using provClientes state
      const doc = r.client_document ? String(r.client_document).trim().toUpperCase() : 'S/I';
      const match = provClientes.find(pc => String(pc.documento).trim().toUpperCase() === doc);
      const client = match ? String(match.nombre).trim().toUpperCase() : (r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I');

      const cxc = parseValNum(r.total_cxc);
      const cxcFinal = parseValNum(r.total_value_cxc_final);
      const ventaRecord = cxc === 0 ? cxcFinal : cxc;

      const ingTercerosRecord = parseValNum(r.total_value_cxp_final);

      const plate = r.plate ? String(r.plate).trim().toUpperCase() : '';
      const date = r.manifest_date ? String(r.manifest_date).trim() : '';

      if (!clientsMap[client]) {
        clientsMap[client] = {
          ventaTotal: 0,
          ingTerceros: 0,
          vehicles: new Set<string>(),
          workedDates: new Set<string>(),
          vehicleDays: new Set<string>(),
          invoicedSameMonth: 0,
          totalPaymentDays: 0,
          paymentDaysCount: 0,
          totalRecDays: 0,
          recDaysCount: 0,
          totalEgrDays: 0,
          egrDaysCount: 0,
          totalManRecDays: 0,
          manRecDaysCount: 0,
          receivedValue: 0,
          receivedDiffMonth: 0
        };
      }

      clientsMap[client].ventaTotal += ventaRecord;
      clientsMap[client].ingTerceros += ingTercerosRecord;

      // Calcular días usando solo fecha calendario (sin horas) para evitar error ±1 día
      const toDateOnly = (d: Date | null) => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
      const calDaysOnly = (a: Date | null, b: Date | null) => {
        const da = toDateOnly(a), db = toDateOnly(b);
        return da && db ? Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000)) : null;
      };

      let invoicedInSameMonth = 0;
      const dMan = toDateOnly(parseCustomDate(r.manifest_date));
      const dInv = toDateOnly(parseCustomDate(r.invoice_date));
      const dRec = toDateOnly(parseCustomDate(r.fecha_recibo));
      const dEgr = toDateOnly(parseCustomDate(r.fecha_egreso));

      if (dMan && dInv) {
        clientsMap[client].totalPaymentDays += calDaysOnly(dMan, dInv)!;
        clientsMap[client].paymentDaysCount += 1;

        const invStr = r.invoice_cxc ? String(r.invoice_cxc).trim().toUpperCase() : '';
        const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A' && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
        if (hasInvoice) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            invoicedInSameMonth = ventaRecord;
          }
        }
      }
      clientsMap[client].invoicedSameMonth += invoicedInSameMonth;

      // 1. prom dias rec (invoice to receipt)
      if (dInv && dRec) {
        clientsMap[client].totalRecDays += calDaysOnly(dInv, dRec)!;
        clientsMap[client].recDaysCount += 1;
      }

      // 2. prom dias egreso (manifest to egress)
      if (dMan && dEgr) {
        clientsMap[client].totalEgrDays += calDaysOnly(dMan, dEgr)!;
        clientsMap[client].egrDaysCount += 1;
      }

      // 3. prom dia man recibido (manifest to receipt) and received value
      if (dMan && dRec) {
        clientsMap[client].totalManRecDays += calDaysOnly(dMan, dRec)!;
        clientsMap[client].manRecDaysCount += 1;
      }

      if (dRec) {
        const invStr = r.invoice_cxc ? String(r.invoice_cxc).trim().toUpperCase() : '';
        const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A' && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
        if (hasInvoice && dInv && dMan) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            clientsMap[client].receivedValue += ventaRecord;
          } else {
            clientsMap[client].receivedDiffMonth += ventaRecord;
          }
        } else {
          clientsMap[client].receivedDiffMonth += ventaRecord;
        }
      }

      if (plate) {
        clientsMap[client].vehicles.add(plate);
      }
      if (date) {
        clientsMap[client].workedDates.add(date);
        if (plate) {
          clientsMap[client].vehicleDays.add(`${plate}_${date}`);
        }
      }
    });

    // Merge flota_tdm_manifiestos rows
    tdmFlotaRows.forEach(r => {
      const clientObj = clients.find(c => String(c.id).trim().toUpperCase() === String(r.client_id || '').trim().toUpperCase());
      const clientBaseName = clientObj ? String(clientObj.name).trim().toUpperCase() : String(r.client_id || 'S/I').trim().toUpperCase();
      const client = `TDM ${clientBaseName}`;
      const cobrar = Number(r.valor_cobrar) || 0;
      const pagar = Number(r.valor_pagar) || 0;
      const plate = r.placa ? String(r.placa).trim().toUpperCase() : '';
      const date = r.fecha_operacion ? String(r.fecha_operacion).trim().slice(0, 10) : '';
      if (!clientsMap[client]) {
        clientsMap[client] = {
          ventaTotal: 0, ingTerceros: 0,
          vehicles: new Set(), workedDates: new Set(), vehicleDays: new Set(),
          invoicedSameMonth: 0, totalPaymentDays: 0, paymentDaysCount: 0,
          totalRecDays: 0, recDaysCount: 0, totalEgrDays: 0, egrDaysCount: 0,
          totalManRecDays: 0, manRecDaysCount: 0, receivedValue: 0, receivedDiffMonth: 0,
        };
      }
      clientsMap[client].ventaTotal += cobrar;
      clientsMap[client].ingTerceros += pagar;
      if (plate) clientsMap[client].vehicles.add(plate);
      if (date) {
        clientsMap[client].workedDates.add(date);
        if (plate) clientsMap[client].vehicleDays.add(`${plate}_${date}`);
      }
    });


    // Calculate total sales of all clients combined
    let grandTotalSales = 0;
    Object.values(clientsMap).forEach(node => {
      grandTotalSales += node.ventaTotal;
    });

    return Object.keys(clientsMap).map(clientName => {
      const node = clientsMap[clientName];
      const ventaTotal = node.ventaTotal;
      const ingTerceros = node.ingTerceros;
      const ingresosPropios = ventaTotal - ingTerceros;
      const int = calcIntReal(ventaTotal > 0 ? (ingresosPropios / ventaTotal) * 100 : 0);
      const vehiculosCount = node.vehicles.size;
      const workedDaysCount = node.workedDates.size;
      const totalVehicleUtilizations = node.vehicleDays.size;
      const averageVehiclesPerDay = workedDaysCount > 0 ? totalVehicleUtilizations / workedDaysCount : 0;
      const participation = grandTotalSales > 0 ? (ventaTotal / grandTotalSales) * 100 : 0;
      
      const invoicedSameMonthVal = node.invoicedSameMonth;
      const invoicedSameMonthPct = ventaTotal > 0 ? (invoicedSameMonthVal / ventaTotal) * 100 : 0;

      const averagePaymentDays = node.paymentDaysCount > 0 ? node.totalPaymentDays / node.paymentDaysCount : 0;

      const averageRecDays = node.recDaysCount > 0 ? node.totalRecDays / node.recDaysCount : 0;
      const averageEgrDays = node.egrDaysCount > 0 ? node.totalEgrDays / node.egrDaysCount : 0;
      const averageManRecDays = node.manRecDaysCount > 0 ? node.totalManRecDays / node.manRecDaysCount : 0;
      const receivedValue = node.receivedValue;
      const receivedPct = ventaTotal > 0 ? (receivedValue / ventaTotal) * 100 : 0;

      return {
        clientName,
        ventaTotal,
        ingTerceros,
        ingresosPropios,
        int,
        vehiculosCount,
        uniquePlates: node.vehicles,
        workedDaysCount,
        totalVehicleUtilizations,
        averageVehiclesPerDay,
        workedDates: node.workedDates,
        vehicleDays: node.vehicleDays,
        participation,
        invoicedSameMonthVal,
        invoicedSameMonthPct,
        averagePaymentDays,
        totalPaymentDays: node.totalPaymentDays,
        paymentDaysCount: node.paymentDaysCount,
        totalRecDays: node.totalRecDays,
        recDaysCount: node.recDaysCount,
        totalEgrDays: node.totalEgrDays,
        egrDaysCount: node.egrDaysCount,
        totalManRecDays: node.totalManRecDays,
        manRecDaysCount: node.manRecDaysCount,
        averageRecDays,
        averageEgrDays,
        averageManRecDays,
        receivedValue,
        receivedDiffMonth: node.receivedDiffMonth,
        receivedPct
      };
    }).sort((a, b) => {
      const valA = a[tdmSortField];
      const valB = b[tdmSortField];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return tdmSortDirection === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return tdmSortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });
  };

  // Calculation for vehicle INT detail of the selected client
  const getVehiclesIntDetails = () => {
    if (!selectedClientForVehiclesInt) return [];

    const targetClient = selectedClientForVehiclesInt.toUpperCase();
    const platesMap: {
      [plate: string]: {
        plate: string;
        clientName: string;
        ventaTotal: number;
        ingTerceros: number;
        manifestCount: number;
        manifests: Array<{
          manifest_number: string;
          manifest_date: string;
          venta: number;
          ingTerceros: number;
          ingresosPropios: number;
          int: number;
        }>;
      }
    } = {};

    reportRecords.forEach(r => {
      const manifestStatus = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
      if (manifestStatus === 'ANULADO' || manifestStatus === 'ANULADA') {
        return;
      }

      const doc = r.client_document ? String(r.client_document).trim().toUpperCase() : 'S/I';
      const match = provClientes.find(pc => String(pc.documento).trim().toUpperCase() === doc);
      const providerClient = match ? String(match.nombre).trim().toUpperCase() : (r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I');

      let tdmClient = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';
      if (tdmClient === 'LOGISTICA,TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S' || tdmClient === 'LOGISTICA, TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S') {
        const p = r.plate ? String(r.plate).trim().toUpperCase() : '';
        const veh = vehicles.find(v => String(v.plate).trim().toUpperCase() === p);
        if (veh && veh.client_id) {
          const cli = clients.find(c => String(c.id).trim().toUpperCase() === String(veh.client_id).trim().toUpperCase());
          if (cli && cli.name) {
            tdmClient = String(cli.name).trim().toUpperCase();
          }
        }
      }

      if (targetClient !== 'GENERAL' && providerClient !== targetClient && tdmClient !== targetClient) {
        return;
      }
      const client = providerClient === targetClient ? providerClient : tdmClient;

      const plate = r.plate ? String(r.plate).trim().toUpperCase() : 'SIN PLACA';

      const cxc = parseValNum(r.total_cxc);
      const cxcFinal = parseValNum(r.total_value_cxc_final);
      const ventaRecord = cxc === 0 ? cxcFinal : cxc;

      const ingTercerosRecord = parseValNum(r.total_value_cxp_final);
      const manifestNumber = r.manifest_number ? String(r.manifest_number).trim() : 'S/I';
      const manifestDate = r.manifest_date ? String(r.manifest_date).trim() : 'S/I';

      const mapKey = targetClient === 'GENERAL' ? `${plate}_${client}` : plate;

      if (!platesMap[mapKey]) {
        platesMap[mapKey] = {
          plate,
          clientName: client,
          ventaTotal: 0,
          ingTerceros: 0,
          manifestCount: 0,
          manifests: []
        };
      }

      platesMap[mapKey].ventaTotal += ventaRecord;
      platesMap[mapKey].ingTerceros += ingTercerosRecord;
      platesMap[mapKey].manifestCount += 1;
      
      const currentIngresosPropios = ventaRecord - ingTercerosRecord;
      const currentInt = ventaRecord > 0 ? (currentIngresosPropios / ventaRecord) * 100 : 0;
      
      platesMap[mapKey].manifests.push({
        manifest_number: manifestNumber,
        manifest_date: manifestDate,
        venta: ventaRecord,
        ingTerceros: ingTercerosRecord,
        ingresosPropios: currentIngresosPropios,
        int: currentInt
      });
    });

    // Merge tdmFlotaRows for INT detail
    tdmFlotaRows.forEach(r => {
      const clientObj = clients.find(c => String(c.id).trim().toUpperCase() === String(r.client_id || '').trim().toUpperCase());
      const clientBaseName = clientObj ? String(clientObj.name).trim().toUpperCase() : String(r.client_id || 'S/I').trim().toUpperCase();
      const rowClient = `TDM ${clientBaseName}`;
      if (targetClient !== 'GENERAL' && rowClient !== targetClient) return;
      const plate = r.placa ? String(r.placa).trim().toUpperCase() : 'SIN PLACA';
      const cobrar = Number(r.valor_cobrar) || 0;
      const pagar = Number(r.valor_pagar) || 0;
      const mapKey = targetClient === 'GENERAL' ? `${plate}_${rowClient}` : plate;
      if (!platesMap[mapKey]) {
        platesMap[mapKey] = { plate, clientName: rowClient, ventaTotal: 0, ingTerceros: 0, manifestCount: 0, manifests: [] };
      }
      platesMap[mapKey].ventaTotal += cobrar;
      platesMap[mapKey].ingTerceros += pagar;
      platesMap[mapKey].manifestCount += 1;
      const ip = cobrar - pagar;
      const intVal = calcIntReal(cobrar > 0 ? (ip / cobrar) * 100 : 0);
      platesMap[mapKey].manifests.push({
        manifest_number: String(r.manifiesto || 'S/I'),
        manifest_date: String(r.fecha_operacion || 'S/I').slice(0, 10),
        venta: cobrar, ingTerceros: pagar, ingresosPropios: ip, int: intVal
      });
    });

    const rawPlates = Object.values(platesMap).map(p => {
      const ingresosPropios = p.ventaTotal - p.ingTerceros;
      const int = p.ventaTotal > 0 ? (ingresosPropios / p.ventaTotal) * 100 : 0;
      return {
        ...p,
        ingresosPropios,
        int
      };
    });

    const filtered = vehiclesSearchQuery.trim() === ''
      ? rawPlates
      : rawPlates.filter(p => p.plate.toLowerCase().includes(vehiclesSearchQuery.toLowerCase()));

    return filtered.sort((a, b) => {
      const valA = a[vehiclesSortField];
      const valB = b[vehiclesSortField];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return vehiclesSortDirection === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return vehiclesSortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });
  };

  const getVehiclesFactMesDetails = () => {
    if (!selectedClientForVehiclesFactMes) return [];

    const targetClient = selectedClientForVehiclesFactMes.toUpperCase();
    const platesMap: {
      [plate: string]: {
        plate: string;
        clientName: string;
        ventaTotal: number;
        facturadoTotal: number;
        manifestCount: number;
        manifests: Array<{
          manifest_number: string;
          manifest_date: string;
          invoice_date: string;
          venta: number;
          facturado: number;
          factMesPct: number;
        }>;
      }
    } = {};

    reportRecords.forEach(r => {
      const manifestStatus = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
      if (manifestStatus === 'ANULADO' || manifestStatus === 'ANULADA') {
        return;
      }

      const doc = r.client_document ? String(r.client_document).trim().toUpperCase() : 'S/I';
      const match = provClientes.find(pc => String(pc.documento).trim().toUpperCase() === doc);
      const providerClient = match ? String(match.nombre).trim().toUpperCase() : (r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I');

      let tdmClient = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';
      if (tdmClient === 'LOGISTICA,TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S' || tdmClient === 'LOGISTICA, TRANSPORTE Y SERVICIOS ASOCIADOS S.A.S') {
        const p = r.plate ? String(r.plate).trim().toUpperCase() : '';
        const veh = vehicles.find(v => String(v.plate).trim().toUpperCase() === p);
        if (veh && veh.client_id) {
          const cli = clients.find(c => String(c.id).trim().toUpperCase() === String(veh.client_id).trim().toUpperCase());
          if (cli && cli.name) {
            tdmClient = String(cli.name).trim().toUpperCase();
          }
        }
      }

      if (targetClient !== 'GENERAL' && providerClient !== targetClient && tdmClient !== targetClient) {
        return;
      }
      const client = providerClient === targetClient ? providerClient : tdmClient;

      const plate = r.plate ? String(r.plate).trim().toUpperCase() : 'SIN PLACA';

      const cxc = parseValNum(r.total_cxc);
      const cxcFinal = parseValNum(r.total_value_cxc_final);
      const ventaRecord = cxc === 0 ? cxcFinal : cxc;

      let invoicedInSameMonth = 0;
      const dMan = parseCustomDate(r.manifest_date);
      const dInv = parseCustomDate(r.invoice_date);
      
      if (dMan && dInv) {
        const invStr = r.invoice_cxc ? String(r.invoice_cxc).trim().toUpperCase() : '';
        const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A' && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
        if (hasInvoice) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            invoicedInSameMonth = ventaRecord;
          }
        }
      }

      const manifestNumber = r.manifest_number ? String(r.manifest_number).trim() : 'S/I';
      const manifestDate = r.manifest_date ? String(r.manifest_date).trim() : 'S/I';
      const invoiceDate = r.invoice_date ? String(r.invoice_date).trim() : 'S/I';
      const mapKey = targetClient === 'GENERAL' ? `${plate}_${client}` : plate;

      if (!platesMap[mapKey]) {
        platesMap[mapKey] = {
          plate,
          clientName: client,
          ventaTotal: 0,
          facturadoTotal: 0,
          manifestCount: 0,
          manifests: []
        };
      }

      platesMap[mapKey].ventaTotal += ventaRecord;
      platesMap[mapKey].facturadoTotal += invoicedInSameMonth;
      platesMap[mapKey].manifestCount += 1;
      
      const currentFactMesPct = ventaRecord > 0 ? (invoicedInSameMonth / ventaRecord) * 100 : 0;
      
      platesMap[mapKey].manifests.push({
        manifest_number: manifestNumber,
        manifest_date: manifestDate,
        invoice_date: invoiceDate,
        venta: ventaRecord,
        facturado: invoicedInSameMonth,
        factMesPct: currentFactMesPct
      });
    });

    // Merge tdmFlotaRows for % Fact. Mes detail
    tdmFlotaRows.forEach(r => {
      const clientObj = clients.find(c => String(c.id).trim().toUpperCase() === String(r.client_id || '').trim().toUpperCase());
      const clientBaseName = clientObj ? String(clientObj.name).trim().toUpperCase() : String(r.client_id || 'S/I').trim().toUpperCase();
      const rowClient = `TDM ${clientBaseName}`;
      if (targetClient !== 'GENERAL' && rowClient !== targetClient) return;
      const plate = r.placa ? String(r.placa).trim().toUpperCase() : 'SIN PLACA';
      const cobrar = Number(r.valor_cobrar) || 0;
      const mapKey = targetClient === 'GENERAL' ? `${plate}_${rowClient}` : plate;
      if (!platesMap[mapKey]) {
        platesMap[mapKey] = { plate, clientName: rowClient, ventaTotal: 0, facturadoTotal: 0, manifestCount: 0, manifests: [] };
      }
      platesMap[mapKey].ventaTotal += cobrar;
      platesMap[mapKey].manifestCount += 1;
      platesMap[mapKey].manifests.push({
        manifest_number: String(r.manifiesto || 'S/I'),
        manifest_date: String(r.fecha_operacion || 'S/I').slice(0, 10),
        invoice_date: 'S/I',
        venta: cobrar, facturado: 0, factMesPct: 0
      });
    });

    const rawPlates = Object.values(platesMap).map(p => {
      const factMesPct = p.ventaTotal > 0 ? (p.facturadoTotal / p.ventaTotal) * 100 : 0;
      return {
        ...p,
        factMesPct
      };
    });

    return rawPlates.sort((a, b) => b.ventaTotal - a.ventaTotal);
  };

  const exportGeneralTdmToExcel = () => {
    setIsExportingGeneral(true);
    setTimeout(() => {
    try {
      const tdmTableData = getGeneralTdmTableData();
      
      // Sheet 1: Resumen Ventas TDM (with real numbers)
      const summaryRows = tdmTableData.map(row => ({
        "CLIENTE": row.clientName,
        "VENTA": Math.round(row.ventaTotal || 0),
        "ING TERCEROS": Math.round(row.ingTerceros || 0),
        "INGRESOS PROPIOS": Math.round(row.ingresosPropios || 0),
        "INT (%)": (Math.round((row.int || 0) * 10) / 10) / 100,
        "PARTICIPACIÓN (%)": (Math.round((row.participation || 0) * 10) / 10) / 100,
        "FACT. MISMO MES": Math.round(row.invoicedSameMonthVal || 0),
        "% FACT. MISMO MES": (Math.round((row.invoicedSameMonthPct || 0) * 10) / 10) / 100,
        "PROM DÍA FACT": Math.round(row.averagePaymentDays || 0),
        "PROM DIAS REC": Math.round(row.averageRecDays || 0),
        "PROM DIAS EGRESO": Math.round(row.averageEgrDays || 0),
        "PROM DIA MAN RECIBIDO": Math.round(row.averageManRecDays || 0),
        "VL REC MISMO MES": Math.round(row.receivedValue || 0),
        "VL REC DIF MES": Math.round(row.receivedDiffMonth || 0),
        "% RECIBIDO": (Math.round((row.receivedPct || 0) * 10) / 10) / 100,
        "DÍAS LABORADOS": Math.round(row.workedDaysCount || 0),
        "VEHÍCULOS UTILIZADOS": Math.round(row.totalVehicleUtilizations || 0),
        "PROMEDIO DÍA": Math.round((row.averageVehiclesPerDay || 0) * 10) / 10
      }));

      // Calculate totals for summary
      const totalVenta = tdmTableData.reduce((sum, item) => sum + item.ventaTotal, 0);
      const totalIngTerceros = tdmTableData.reduce((sum, item) => sum + item.ingTerceros, 0);
      const totalIngresosPropios = tdmTableData.reduce((sum, item) => sum + item.ingresosPropios, 0);
      const overallInt = calcIntReal(totalVenta > 0 ? (totalIngresosPropios / totalVenta) * 100 : 0);
      
      const totalInvoicedSameMonth = tdmTableData.reduce((sum, item) => sum + item.invoicedSameMonthVal, 0);
      const overallInvoicedSameMonthPct = totalVenta > 0 ? (totalInvoicedSameMonth / totalVenta) * 100 : 0;

      const totalPaymentDaysVal = tdmTableData.reduce((sum, item) => sum + item.totalPaymentDays, 0);
      const totalPaymentDaysCount = tdmTableData.reduce((sum, item) => sum + item.paymentDaysCount, 0);
      const overallAveragePaymentDays = totalPaymentDaysCount > 0 ? totalPaymentDaysVal / totalPaymentDaysCount : 0;

      const overallAverageRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.recDaysCount || 0), 0) || 0;
      const overallAverageEgrDays = tdmTableData.reduce((sum, i) => sum + (i.totalEgrDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.egrDaysCount || 0), 0) || 0;
      const overallAverageManRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalManRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.manRecDaysCount || 0), 0) || 0;
      const totalReceivedValueVal = tdmTableData.reduce((sum, item) => sum + (item.receivedValue || 0), 0);
      const totalReceivedDiffMonthVal = tdmTableData.reduce((sum, item) => sum + (item.receivedDiffMonth || 0), 0);
      const overallReceivedPct = totalVenta > 0 ? (totalReceivedValueVal / totalVenta) * 100 : 0;

      const allPlates = new Set<string>();
      const allDates = new Set<string>();
      const allVehicleDays = new Set<string>();

      tdmTableData.forEach(item => {
        item.uniquePlates.forEach(p => allPlates.add(p));
        item.workedDates.forEach(d => allDates.add(d));
        item.vehicleDays.forEach(vd => allVehicleDays.add(vd));
      });

      const totalWorkedDays = allDates.size;
      const totalVehicleDaysCount = allVehicleDays.size;
      const totalAvgVehiclesPerDay = totalWorkedDays > 0 ? totalVehicleDaysCount / totalWorkedDays : 0;

      summaryRows.push({
        "CLIENTE": "TOTAL GENERAL",
        "VENTA": Math.round(totalVenta || 0),
        "ING TERCEROS": Math.round(totalIngTerceros || 0),
        "INGRESOS PROPIOS": Math.round(totalIngresosPropios || 0),
        "INT (%)": (Math.round((overallInt || 0) * 10) / 10) / 100,
        "PARTICIPACIÓN (%)": 1,
        "FACT. MISMO MES": Math.round(totalInvoicedSameMonth || 0),
        "% FACT. MISMO MES": (Math.round((overallInvoicedSameMonthPct || 0) * 10) / 10) / 100,
        "PROM DÍA FACT": Math.round(overallAveragePaymentDays || 0),
        "PROM DIAS REC": Math.round(overallAverageRecDays || 0),
        "PROM DIAS EGRESO": Math.round(overallAverageEgrDays || 0),
        "PROM DIA MAN RECIBIDO": Math.round(overallAverageManRecDays || 0),
        "VL REC MISMO MES": Math.round(totalReceivedValueVal || 0),
        "VL REC DIF MES": Math.round(totalReceivedDiffMonthVal || 0),
        "% RECIBIDO": (Math.round((overallReceivedPct || 0) * 10) / 10) / 100,
        "DÍAS LABORADOS": Math.round(totalWorkedDays || 0),
        "VEHÍCULOS UTILIZADOS": Math.round(totalVehicleDaysCount || 0),
        "PROMEDIO DÍA": Math.round((totalAvgVehiclesPerDay || 0) * 10) / 10
      });

      const worksheetSummary = XLSX.utils.json_to_sheet(summaryRows);

      // Apply Excel formatting to raw numbers
      const colZFormats: Record<string, string> = {
        "VENTA": '"$"#,##0',
        "ING TERCEROS": '"$"#,##0',
        "INGRESOS PROPIOS": '"$"#,##0',
        "INT (%)": '0.0%',
        "PARTICIPACIÓN (%)": '0.0%',
        "FACT. MISMO MES": '"$"#,##0',
        "% FACT. MISMO MES": '0.0%',
        "PROM DÍA FACT": '#,##0',
        "PROM DIAS REC": '#,##0',
        "PROM DIAS EGRESO": '#,##0',
        "PROM DIA MAN RECIBIDO": '#,##0',
        "VL REC MISMO MES": '"$"#,##0',
        "VL REC DIF MES": '"$"#,##0',
        "% RECIBIDO": '0.0%',
        "DÍAS LABORADOS": '#,##0',
        "VEHÍCULOS UTILIZADOS": '#,##0',
        "PROMEDIO DÍA": '0.0'
      };

      if (worksheetSummary['!ref']) {
        const range = XLSX.utils.decode_range(worksheetSummary['!ref']);
        const colNames: Record<number, string> = {};
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = worksheetSummary[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell && cell.v) colNames[C] = cell.v.toString();
        }
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const colName = colNames[C];
            if (colName && colZFormats[colName]) {
              const cell = worksheetSummary[XLSX.utils.encode_cell({ r: R, c: C })];
              if (cell && cell.t === 'n') {
                cell.z = colZFormats[colName];
              }
            }
          }
        }
      }

      // Sheet 2: Detalle Transacciones (exclude ANULADO)
      const detailRecords = reportRecords.filter(r => {
        const st = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
        return st !== 'ANULADO' && st !== 'ANULADA';
      });

      const safeStr = (v: any): string => (v !== null && v !== undefined ? String(v).trim() : '');
      // Truncar a medianoche local para comparar solo fechas calendario (sin horas)
      const dateOnly = (d: Date | null): Date | null =>
        d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
      const daysDiff = (a: Date | null, b: Date | null): number | '' => {
        const da = dateOnly(a), db = dateOnly(b);
        return da && db ? Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000)) : '';
      };

      const detailRows = detailRecords.map(r => {
        const cxc = parseValNum(r.total_cxc);
        const cxcFinal = parseValNum(r.total_value_cxc_final);
        const ventaRow = cxc === 0 ? cxcFinal : cxc;

        const rawManDate = safeStr(r.manifest_date);
        const rawInvDate = safeStr(r.invoice_date);
        // fecha_recibo y fecha_egreso son campos de fecha dedicados (actualizados manualmente)
        // r.receipt y r.egress son números de referencia, NO fechas — no usar como fallback
        const rawRecStr  = safeStr(r.fecha_recibo);
        const rawEgrStr  = safeStr(r.fecha_egreso);

        const isValidYear = (d: Date | null) => d !== null && d.getFullYear() >= 2000 && d.getFullYear() <= 2100;

        const dManRaw = rawManDate ? parseCustomDate(rawManDate) : null;
        const dInvRaw = rawInvDate ? parseCustomDate(rawInvDate) : null;
        const dRecRaw = rawRecStr  ? parseCustomDate(rawRecStr)  : null;
        const dEgrRaw = rawEgrStr  ? parseCustomDate(rawEgrStr)  : null;

        const dMan = isValidYear(dManRaw) ? dManRaw : null;
        const dInv = isValidYear(dInvRaw) ? dInvRaw : null;
        const dRec = isValidYear(dRecRaw) ? dRecRaw : null;
        const dEgr = isValidYear(dEgrRaw) ? dEgrRaw : null;

        const diasPago   = daysDiff(dMan, dInv);
        const diasRec    = daysDiff(dInv, dRec);
        const diasEgreso = daysDiff(dMan, dEgr);
        const diasManRec = daysDiff(dMan, dRec);

        const invStr = safeStr(r.invoice_cxc).toUpperCase();
        const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A'
          && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
        const sameMonth = !!(dMan && dInv
          && dMan.getFullYear() === dInv.getFullYear()
          && dMan.getMonth()    === dInv.getMonth());
        const factMismoMes = hasInvoice && sameMonth ? ventaRow : 0;

        const vlRecMismoMes = (dRec && hasInvoice && sameMonth) ? ventaRow : 0;
        const vlRecDifMes   = (dRec && (!hasInvoice || !sameMonth)) ? ventaRow : 0;

        return {
          "ORDEN DE COMPRA":       safeStr(r.oc_number),
          "MANIFIESTO":            safeStr(r.manifest_number),
          "FECHA MANIFIESTO":      formatColombianDateStr(r.manifest_date),
          "ESTADO MANIFIESTO":     safeStr(r.manifest_status),
          "CLIENTE":               safeStr(r.client_name),
          "TOTAL CXC":             parseValNum(r.total_cxc),
          "VALOR TOTAL CXC FINAL": parseValNum(r.total_value_cxc_final),
          "VALOR TOT CXP FINAL":   parseValNum(r.total_value_cxp_final),
          "PLACA":                 safeStr(r.plate),
          "CONDUCTOR":             safeStr(r.driver_name),
          // Fechas fuente — permiten ver qué datos hay disponibles por fila
          "FECHA FACTURA":         dInv  ? formatColombianDateStr(rawInvDate)  : '',
          "FECHA RECIBO":          dRec  ? formatColombianDateStr(rawRecStr)   : '',
          "FECHA EGRESO":          dEgr  ? formatColombianDateStr(rawEgrStr)   : '',
          // Métricas calculadas — vacías si la fecha fuente no existe
          "FACT. MISMO MES":       factMismoMes,
          "DÍA FACTURACION (MAN→FACT)":  diasPago,
          "DIAS REC (FACT→REC)":  diasRec,
          "DIAS EGRESO (MAN→EGR)": diasEgreso,
          "DIA MAN RECIBIDO (MAN→REC)": diasManRec,
          "VL REC MISMO MES":      vlRecMismoMes,
          "VL REC DIF MES":        vlRecDifMes,
        };
      });

      const worksheetDetail = XLSX.utils.json_to_sheet(detailRows);

      // Aplicar formatos numéricos en Detalle Transacciones
      const detailColFormats: Record<string, string> = {
        "TOTAL CXC":             '"$"#,##0',
        "VALOR TOTAL CXC FINAL": '"$"#,##0',
        "VALOR TOT CXP FINAL":   '"$"#,##0',
        "FACT. MISMO MES":       '"$"#,##0',
        "DÍA FACTURACION (MAN→FACT)":  '#,##0',
        "DIAS REC (FACT→REC)":  '#,##0',
        "DIAS EGRESO (MAN→EGR)": '#,##0',
        "DIA MAN RECIBIDO (MAN→REC)": '#,##0',
        "VL REC MISMO MES":      '"$"#,##0',
        "VL REC DIF MES":        '"$"#,##0',
      };
      if (worksheetDetail['!ref']) {
        const dRange = XLSX.utils.decode_range(worksheetDetail['!ref']);
        const dColNames: Record<number, string> = {};
        for (let C = dRange.s.c; C <= dRange.e.c; ++C) {
          const cell = worksheetDetail[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell && cell.v) dColNames[C] = cell.v.toString();
        }
        for (let R = dRange.s.r + 1; R <= dRange.e.r; ++R) {
          for (let C = dRange.s.c; C <= dRange.e.c; ++C) {
            const colName = dColNames[C];
            if (colName && detailColFormats[colName]) {
              const cell = worksheetDetail[XLSX.utils.encode_cell({ r: R, c: C })];
              if (cell && cell.t === 'n') cell.z = detailColFormats[colName];
            }
          }
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheetSummary, "Clientes General TDM");
      XLSX.utils.book_append_sheet(workbook, worksheetDetail, "Detalle Transacciones");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Clientes_General_100_TDM_${dateStr}.xlsx`);
      toast.success('Reporte Excel de Clientes General descargado con éxito.');
    } catch (err) {
      console.error('[EXPORT-GENERAL-XLSX-ERR]', err);
      toast.error('Hubo un error al exportar el reporte a Excel.');
    } finally {
      setIsExportingGeneral(false);
    }
    }, 50);
  };

  const exportTdmToExcel = () => {
    setIsExportingTdm(true);
    setTimeout(() => {
    try {
      const tdmTableData = getClientTdmTableData();
      
      // Sheet 1: Resumen Ventas TDM (with real numbers)
      const summaryRows = tdmTableData.map(row => ({
        "CLIENTE": row.clientName,
        "VENTA": Math.round(row.ventaTotal || 0),
        "ING TERCEROS": Math.round(row.ingTerceros || 0),
        "INGRESOS PROPIOS": Math.round(row.ingresosPropios || 0),
        "INT (%)": (Math.round((row.int || 0) * 10) / 10) / 100,
        "PARTICIPACIÓN (%)": (Math.round((row.participation || 0) * 10) / 10) / 100,
        "FACT. MISMO MES": Math.round(row.invoicedSameMonthVal || 0),
        "% FACT. MISMO MES": (Math.round((row.invoicedSameMonthPct || 0) * 10) / 10) / 100,
        "PROM DÍA FACT": Math.round(row.averagePaymentDays || 0),
        "PROM DIAS REC": Math.round(row.averageRecDays || 0),
        "PROM DIAS EGRESO": Math.round(row.averageEgrDays || 0),
        "PROM DIA MAN RECIBIDO": Math.round(row.averageManRecDays || 0),
        "VL REC MISMO MES": Math.round(row.receivedValue || 0),
        "VL REC DIF MES": Math.round(row.receivedDiffMonth || 0),
        "% RECIBIDO": (Math.round((row.receivedPct || 0) * 10) / 10) / 100,
        "DÍAS LABORADOS": Math.round(row.workedDaysCount || 0),
        "VEHÍCULOS UTILIZADOS": Math.round(row.totalVehicleUtilizations || 0),
        "PROMEDIO DÍA": Math.round((row.averageVehiclesPerDay || 0) * 10) / 10
      }));

      // Calculate totals for summary
      const totalVenta = tdmTableData.reduce((sum, item) => sum + item.ventaTotal, 0);
      const totalIngTerceros = tdmTableData.reduce((sum, item) => sum + item.ingTerceros, 0);
      const totalIngresosPropios = tdmTableData.reduce((sum, item) => sum + item.ingresosPropios, 0);
      const overallInt = calcIntReal(totalVenta > 0 ? (totalIngresosPropios / totalVenta) * 100 : 0);
      
      const totalInvoicedSameMonth = tdmTableData.reduce((sum, item) => sum + item.invoicedSameMonthVal, 0);
      const overallInvoicedSameMonthPct = totalVenta > 0 ? (totalInvoicedSameMonth / totalVenta) * 100 : 0;

      const totalPaymentDaysVal = tdmTableData.reduce((sum, item) => sum + item.totalPaymentDays, 0);
      const totalPaymentDaysCount = tdmTableData.reduce((sum, item) => sum + item.paymentDaysCount, 0);
      const overallAveragePaymentDays = totalPaymentDaysCount > 0 ? totalPaymentDaysVal / totalPaymentDaysCount : 0;

      const overallAverageRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.recDaysCount || 0), 0) || 0;
      const overallAverageEgrDays = tdmTableData.reduce((sum, i) => sum + (i.totalEgrDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.egrDaysCount || 0), 0) || 0;
      const overallAverageManRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalManRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.manRecDaysCount || 0), 0) || 0;
      const totalReceivedValueVal = tdmTableData.reduce((sum, item) => sum + (item.receivedValue || 0), 0);
      const totalReceivedDiffMonthVal = tdmTableData.reduce((sum, item) => sum + (item.receivedDiffMonth || 0), 0);
      const overallReceivedPct = totalVenta > 0 ? (totalReceivedValueVal / totalVenta) * 100 : 0;

      const allPlates = new Set<string>();
      const allDates = new Set<string>();
      const allVehicleDays = new Set<string>();

      tdmTableData.forEach(item => {
        item.uniquePlates.forEach(p => allPlates.add(p));
        item.workedDates.forEach(d => allDates.add(d));
        item.vehicleDays.forEach(vd => allVehicleDays.add(vd));
      });

      const totalWorkedDays = allDates.size;
      const totalVehicleDaysCount = allVehicleDays.size;
      const totalAvgVehiclesPerDay = totalWorkedDays > 0 ? totalVehicleDaysCount / totalWorkedDays : 0;

      summaryRows.push({
        "CLIENTE": "TOTAL GENERAL",
        "VENTA": Math.round(totalVenta || 0),
        "ING TERCEROS": Math.round(totalIngTerceros || 0),
        "INGRESOS PROPIOS": Math.round(totalIngresosPropios || 0),
        "INT (%)": (Math.round((overallInt || 0) * 10) / 10) / 100,
        "PARTICIPACIÓN (%)": 1,
        "FACT. MISMO MES": Math.round(totalInvoicedSameMonth || 0),
        "% FACT. MISMO MES": (Math.round((overallInvoicedSameMonthPct || 0) * 10) / 10) / 100,
        "PROM DÍA FACT": Math.round(overallAveragePaymentDays || 0),
        "PROM DIAS REC": Math.round(overallAverageRecDays || 0),
        "PROM DIAS EGRESO": Math.round(overallAverageEgrDays || 0),
        "PROM DIA MAN RECIBIDO": Math.round(overallAverageManRecDays || 0),
        "VL REC MISMO MES": Math.round(totalReceivedValueVal || 0),
        "VL REC DIF MES": Math.round(totalReceivedDiffMonthVal || 0),
        "% RECIBIDO": (Math.round((overallReceivedPct || 0) * 10) / 10) / 100,
        "DÍAS LABORADOS": Math.round(totalWorkedDays || 0),
        "VEHÍCULOS UTILIZADOS": Math.round(totalVehicleDaysCount || 0),
        "PROMEDIO DÍA": Math.round((totalAvgVehiclesPerDay || 0) * 10) / 10
      });

      const worksheetSummary = XLSX.utils.json_to_sheet(summaryRows);

      // Apply Excel formatting to raw numbers
      const colZFormats: Record<string, string> = {
        "VENTA": '"$"#,##0',
        "ING TERCEROS": '"$"#,##0',
        "INGRESOS PROPIOS": '"$"#,##0',
        "INT (%)": '0.0%',
        "PARTICIPACIÓN (%)": '0.0%',
        "FACT. MISMO MES": '"$"#,##0',
        "% FACT. MISMO MES": '0.0%',
        "PROM DÍA FACT": '#,##0',
        "PROM DIAS REC": '#,##0',
        "PROM DIAS EGRESO": '#,##0',
        "PROM DIA MAN RECIBIDO": '#,##0',
        "VL REC MISMO MES": '"$"#,##0',
        "VL REC DIF MES": '"$"#,##0',
        "% RECIBIDO": '0.0%',
        "DÍAS LABORADOS": '#,##0',
        "VEHÍCULOS UTILIZADOS": '#,##0',
        "PROMEDIO DÍA": '0.0'
      };

      if (worksheetSummary['!ref']) {
        const range = XLSX.utils.decode_range(worksheetSummary['!ref']);
        const colNames: Record<number, string> = {};
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = worksheetSummary[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell && cell.v) colNames[C] = cell.v.toString();
        }
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const colName = colNames[C];
            if (colName && colZFormats[colName]) {
              const cell = worksheetSummary[XLSX.utils.encode_cell({ r: R, c: C })];
              if (cell && cell.t === 'n') {
                cell.z = colZFormats[colName];
              }
            }
          }
        }
      }

      // Sheet 2: Detalle Transacciones (exclude ANULADO)
      const detailRecords = reportRecords.filter(r => {
        const st = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
        return st !== 'ANULADO' && st !== 'ANULADA';
      });

      const detailRows = detailRecords.map(r => ({
        "ORDEN DE COMPRA": r.oc_number || '',
        "MANIFIESTO": r.manifest_number || '',
        "FECHA MANIFIESTO": formatColombianDateStr(r.manifest_date),
        "ESTADO MANIFIESTO": r.manifest_status || '',
        "CLIENTE": r.client_name || '',
        "TOTAL CXC": parseValNum(r.total_cxc),
        "VALOR TOTAL CXC FINAL": parseValNum(r.total_value_cxc_final),
        "VALOR TOT CXP FINAL": parseValNum(r.total_value_cxp_final),
        "PLACA": r.plate || '',
        "CONDUCTOR": r.driver_name || ''
      }));

      const worksheetDetail = XLSX.utils.json_to_sheet(detailRows);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheetSummary, "Resumen Ventas TDM");
      XLSX.utils.book_append_sheet(workbook, worksheetDetail, "Detalle Transacciones");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Resumen_Ventas_100_TDM_${dateStr}.xlsx`);
      toast.success('Reporte Excel de Ventas TDM descargado con éxito.');
    } catch (err) {
      console.error('[EXPORT-TDM-XLSX-ERR]', err);
      toast.error('Hubo un error al exportar el reporte a Excel.');
    } finally {
      setIsExportingTdm(false);
    }
    }, 50);
  };

  const handleTdmSort = (field: typeof tdmSortField) => {
    if (tdmSortField === field) {
      setTdmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTdmSortField(field);
      setTdmSortDirection('desc');
    }
  };

  const handleVehiclesSort = (field: typeof vehiclesSortField) => {
    if (vehiclesSortField === field) {
      setVehiclesSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setVehiclesSortField(field);
      setVehiclesSortDirection('desc');
    }
  };

  const exportVehiclesToExcel = () => {
    try {
      if (!selectedClientForVehiclesInt) return;

      const vehiclesData = getVehiclesIntDetails();
      const exportRows = vehiclesData.map(v => {
        const ingresosPropios = v.ventaTotal - v.ingTerceros;
        const currentInt = v.ventaTotal > 0 ? (ingresosPropios / v.ventaTotal) : 0;
        
        const row: any = {
          "PLACA / VEHÍCULO": v.plate
        };
        if (selectedClientForVehiclesInt === 'GENERAL') {
          row["CLIENTE"] = v.clientName || 'S/I';
        }
        row["CANTIDAD MANIFIESTOS"] = Math.round(v.manifestCount || 0);
        row["VALOR CXC CXP INICIAL (VENTA)"] = Math.round(v.ventaTotal || 0);
        row["ING TERCEROS"] = Math.round(v.ingTerceros || 0);
        row["INGRESOS PROPIOS"] = Math.round(ingresosPropios || 0);
        row["INT (%)"] = currentInt;
        return row;
      });

      // Calculate totals
      const totalVentas = vehiclesData.reduce((sum, item) => sum + item.ventaTotal, 0);
      const totalIngTerceros = vehiclesData.reduce((sum, item) => sum + item.ingTerceros, 0);
      const totalIngresosPropios = totalVentas - totalIngTerceros;
      const overallInt = calcIntReal(totalVentas > 0 ? (totalIngresosPropios / totalVentas) * 100 : 0) / 100;
      const totalManifests = vehiclesData.reduce((sum, item) => sum + item.manifestCount, 0);

      const totalRow: any = {
        "PLACA / VEHÍCULO": "TOTAL GENERAL"
      };
      if (selectedClientForVehiclesInt === 'GENERAL') {
        totalRow["CLIENTE"] = "";
      }
      totalRow["CANTIDAD MANIFIESTOS"] = Math.round(totalManifests || 0);
      totalRow["VALOR CXC CXP INICIAL (VENTA)"] = Math.round(totalVentas || 0);
      totalRow["ING TERCEROS"] = Math.round(totalIngTerceros || 0);
      totalRow["INGRESOS PROPIOS"] = Math.round(totalIngresosPropios || 0);
      totalRow["INT (%)"] = overallInt;

      exportRows.push(totalRow);

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      
      const colZFormats: Record<string, string> = {
        "CANTIDAD MANIFIESTOS": '#,##0',
        "VALOR CXC CXP INICIAL (VENTA)": '"$"#,##0',
        "ING TERCEROS": '"$"#,##0',
        "INGRESOS PROPIOS": '"$"#,##0',
        "INT (%)": '0.00%'
      };

      if (worksheet['!ref']) {
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const colNames: Record<number, string> = {};
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell && cell.v) colNames[C] = cell.v.toString();
        }
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const colName = colNames[C];
            if (colName && colZFormats[colName]) {
              const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
              if (cell && cell.t === 'n') {
                cell.z = colZFormats[colName];
              }
            }
          }
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vehículos INT");
      XLSX.writeFile(workbook, `Vehiculos_INT_${selectedClientForVehiclesInt.replace(/\s+/g, '_')}.xlsx`);
      toast.success('Detalle de vehículos exportado con éxito.');
    } catch (err) {
      console.error('[EXPORT-VEHICLES-XLSX-ERR]', err);
      toast.error('Hubo un error al exportar el detalle a Excel.');
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 bg-slate-50 min-h-screen animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black tracking-widest text-indigo-600 uppercase">Módulo Gerencia • PAG-50</span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mt-1 font-outfit">Informes Gerenciales</h1>
          <p className="text-xs text-slate-500 mt-1">Consolidación jerárquica de operaciones por estado, consultas de transacciones y carga de archivos.</p>
        </div>

        {/* Filters and File Inputs */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
              showFiltersPanel 
                ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <Filter size={14} />
            <span>Filtros Avanzados</span>
          </button>
          
          {/* Hidden file input lives in TabCargar */}
        </div>
      </div>

      {/* THREE TABS SYSTEM SWITCHER */}
      <div className="flex flex-wrap border-b border-slate-200/80 bg-white/50 p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('informes')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'informes'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
          }`}
        >
          <BarChart3 size={14} />
          <span>Informes / Indicadores</span>
        </button>

        <button
          onClick={() => setActiveTab('consultas')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'consultas'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
          }`}
        >
          <Search size={14} />
          <span>Consultas de Información</span>
        </button>

        <button
          onClick={() => setActiveTab('cargar')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'cargar'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
          }`}
        >
          <Upload size={14} />
          <span>Cargar Información</span>
        </button>
      </div>

      {/* ADVANCED FILTER PANEL */}
      {showFiltersPanel && (
        <form onSubmit={handleApplyFilters} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-slate-500" />
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Filtros Avanzados</h3>
            </div>
            <button type="button" onClick={() => setShowFiltersPanel(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Número OC</label>
              <div className="relative">
                <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={filters.ocNumber}
                  onChange={(e) => setFilters({ ...filters, ocNumber: e.target.value })}
                  placeholder="Buscar OC..." 
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 pl-9 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Número Manifiesto</label>
              <div className="relative">
                <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={filters.manifestNumber}
                  onChange={(e) => setFilters({ ...filters, manifestNumber: e.target.value })}
                  placeholder="Buscar manifiesto..." 
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 pl-9 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Placa Vehículo</label>
              <div className="relative">
                <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={filters.plate}
                  onChange={(e) => setFilters({ ...filters, plate: e.target.value })}
                  placeholder="Buscar placa..." 
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 pl-9 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Nombre Cliente</label>
              <div className="relative">
                <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={filters.clientName}
                  onChange={(e) => setFilters({ ...filters, clientName: e.target.value })}
                  placeholder="Buscar cliente..." 
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 pl-9 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleClearFilters}
              className="bg-slate-50 text-slate-600 border border-slate-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-100"
            >
              Limpiar
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/10"
            >
              Aplicar Filtros
            </button>
          </div>
        </form>
      )}

      {/* TAB 1: CONSOLIDATED HIERARCHICAL REPORTS & PIE CHARTS PANEL */}
      {activeTab === 'informes' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* BARRA DE SELECCION OBLIGATORIA DE FECHAS */}
          <div className="bg-white border border-indigo-100 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha Desde (MANIFIESTO) <span className="text-red-500">*</span></span>
                <input 
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => setReportFromDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha Hasta (MANIFIESTO) <span className="text-red-500">*</span></span>
                <input 
                  type="date"
                  value={reportToDate}
                  onChange={(e) => setReportToDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col space-y-1 relative" ref={clientDropdownRef}>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cliente(s)</span>
                
                <div 
                  onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-slate-700 cursor-pointer min-w-[250px] h-[36px] flex justify-between items-center transition-colors hover:bg-slate-100"
                >
                  <span className="truncate max-w-[200px]">
                    {reportSelectedClients.includes('ALL') 
                      ? 'TODOS LOS CLIENTES' 
                      : `${reportSelectedClients.length} SELECCIONADO(S)`}
                  </span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                
                {isClientDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full max-h-[300px] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 custom-scrollbar">
                    <div 
                      onClick={() => setReportSelectedClients(['ALL'])}
                      className={`px-4 py-2.5 text-[10px] font-black cursor-pointer hover:bg-slate-50 flex items-center gap-2.5 transition-colors ${reportSelectedClients.includes('ALL') ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                    >
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${reportSelectedClients.includes('ALL') ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                        {reportSelectedClients.includes('ALL') && <Check size={10} className="text-white" />}
                      </div>
                      TODOS
                    </div>
                    {managementClients.map((c, i) => {
                      const isSelected = reportSelectedClients.includes(c);
                      return (
                        <div 
                          key={i}
                          onClick={() => {
                            if (reportSelectedClients.includes('ALL')) {
                              setReportSelectedClients([c]);
                            } else if (isSelected) {
                              const newSel = reportSelectedClients.filter(v => v !== c);
                              setReportSelectedClients(newSel.length === 0 ? ['ALL'] : newSel);
                            } else {
                              setReportSelectedClients([...reportSelectedClients, c]);
                            }
                          }}
                          className={`px-4 py-2.5 text-[10px] font-black cursor-pointer hover:bg-slate-50 flex items-center gap-2.5 transition-colors ${isSelected ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                        >
                          <div className={`w-3.5 h-3.5 flex-shrink-0 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                            {isSelected && <Check size={10} className="text-white" />}
                          </div>
                          <span className="truncate">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {canGenerateReport && (
                <button
                  type="button"
                  onClick={() => {
                    setReportFromDate('');
                    setReportToDate('');
                    setReportSelectedClients(['ALL']);
                  }}
                  className="self-end bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Limpiar Filtros
                </button>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <button
                onClick={() => setIsPdfModalOpen(true)}
                disabled={reportRecords.length === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/15 justify-center transition-all disabled:opacity-40"
              >
                <Download size={14} />
                <span>Bajar Informe</span>
              </button>
              <button
                onClick={generateReport}
                disabled={reportLoading || !canGenerateReport}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 justify-center transition-all disabled:opacity-40"
              >
                <RefreshCw className={reportLoading ? 'animate-spin' : ''} size={14} />
                <span>Generar Consolidado</span>
              </button>
            </div>
          </div>

          {/* RENDER BODY ONLY WHEN DATE RANGE IS SELECTED AS REQUESTED */}
          {!canGenerateReport ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-20 text-center shadow-sm">
              <div className="flex flex-col items-center justify-center space-y-4 max-w-md mx-auto">
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                  <Calendar size={32} />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Selección de Filtros Requerida</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para optimizar las consultas, **debe seleccionar tanto la Fecha Inicial como la Fecha Final** o **seleccionar uno o más clientes** para ejecutar el consolidado gerencial.
                </p>
              </div>
            </div>
          ) : reportLoading ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-20 text-center shadow-sm">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Generando Árboles y Gráficos de Torta...</span>
              </div>
            </div>
          ) : Object.keys(reportData).length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-16 text-center shadow-sm">
              <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
                <BarChart3 size={36} className="stroke-1 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider">No se encontraron registros en el rango seleccionado</span>
                <p className="text-[10px] text-slate-400">Prueba con un rango diferente de fechas o sube registros en la pestaña "Cargar Información".</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">

              {/* SUB-REPORT TAB SYSTEM SWITCHER */}
              <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl gap-1 shadow-sm">
                <button
                  onClick={() => setSubReportTab('tdmVentas')}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center ${
                    subReportTab === 'tdmVentas'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
                  }`}
                >
                  Ventas generales
                </button>

                <button
                  onClick={() => setSubReportTab('pendienteFacturar')}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center ${
                    subReportTab === 'pendienteFacturar'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
                  }`}
                >
                  Pendiente por Facturar
                </button>

                <button
                  onClick={() => setSubReportTab('estados')}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center ${
                    subReportTab === 'estados'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
                  }`}
                >
                  Consolidado por Estados (Árbol 4 Niveles)
                </button>

                <button
                  onClick={() => setSubReportTab('clientes')}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-center ${
                    subReportTab === 'clientes'
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'
                  }`}
                >
                  Consolidado Clientes y Placas (Árbol 2 Niveles)
                </button>
              </div>

              {/* RENDER TREE SYSTEM */}
              <div className={subReportTab === 'pendienteFacturar' || pdfGenerating ? 'block' : 'hidden'}>
                <div className="space-y-4 animate-in fade-in duration-300">
                  {(() => {
                    // Calculate pending data
                    const pendingRows = reportRecords.filter(r => {
                      const manifestStatus = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
                      if (manifestStatus === 'ANULADO' || manifestStatus === 'ANULADA') return false;

                      const invStr = r.invoice_cxc ? String(r.invoice_cxc).trim().toUpperCase() : '';
                      const hasInvoice = invStr !== '' && invStr !== '0' && invStr !== 'S/I' && invStr !== 'N/A' && !invStr.includes('SIN FACTURA') && invStr !== 'NO APLICA';
                      return !hasInvoice;
                    });

                    const clientMap = new Map<string, any>();
                    const monthsSet = new Set<string>();

                    pendingRows.forEach(r => {
                      const clientName = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';

                      let d = new Date(r.manifest_date);
                      if (isNaN(d.getTime())) d = new Date(); // fallback
                      
                      const m = d.getMonth();
                      const y = d.getFullYear();
                      const monthKey = `${y}-${m.toString().padStart(2, '0')}`;
                      monthsSet.add(monthKey);

                      if (!clientMap.has(clientName)) {
                        clientMap.set(clientName, {
                          clientName,
                          cxc: 0,
                          cxp: 0,
                          months: {} as Record<string, number>,
                          manifestCount: 0,
                          monthCounts: {} as Record<string, number>,
                          manifests: [] as any[],
                          monthManifests: {} as Record<string, any[]>
                        });
                      }
                      const c = clientMap.get(clientName);
                      
                      const cxc = parseValNum(r.total_cxc);
                      const cxcFinal = parseValNum(r.total_value_cxc_final);
                      const cxcVal = cxc === 0 ? cxcFinal : cxc;

                      const cxpVal = parseValNum(r.total_value_cxp_final);
                      
                      c.cxc += cxcVal;
                      c.cxp += cxpVal;
                      c.manifestCount += 1;
                      c.months[monthKey] = (c.months[monthKey] || 0) + cxcVal;
                      c.monthCounts[monthKey] = (c.monthCounts[monthKey] || 0) + 1;
                      
                      const manifestData = { manifest_number: r.manifest_number, manifest_date: r.manifest_date, cxc: cxcVal, cxp: cxpVal, plate: r.plate, clientName: clientName };
                      c.manifests.push(manifestData);
                      if (!c.monthManifests[monthKey]) c.monthManifests[monthKey] = [];
                      c.monthManifests[monthKey].push(manifestData);
                    });

                    const sortedMonths = Array.from(monthsSet).sort();
                    const tableRows = Array.from(clientMap.values()).sort((a, b) => b.cxc - a.cxc);
                    
                    const totals = { cxc: 0, cxp: 0, months: {} as Record<string, number>, manifestCount: 0, monthCounts: {} as Record<string, number>, manifests: [] as any[], monthManifests: {} as Record<string, any[]> };
                    tableRows.forEach(r => {
                      totals.cxc += r.cxc;
                      totals.cxp += r.cxp;
                      totals.manifestCount += r.manifestCount;
                      totals.manifests.push(...r.manifests);
                      sortedMonths.forEach(sm => {
                        totals.months[sm] = (totals.months[sm] || 0) + (r.months[sm] || 0);
                        totals.monthCounts[sm] = (totals.monthCounts[sm] || 0) + (r.monthCounts[sm] || 0);
                        if (!totals.monthManifests[sm]) totals.monthManifests[sm] = [];
                        totals.monthManifests[sm].push(...(r.monthManifests[sm] || []));
                      });
                    });

                    const monthNames = sortedMonths.map(sm => {
                      const [y, m] = sm.split('-');
                      const d = new Date(Number(y), Number(m), 1);
                      return d.toLocaleString('es-CO', { month: 'long', year: 'numeric' }).toUpperCase();
                    });

                    let filteredTableRows = tableRows;
                    if (pendienteSearchQuery.trim() !== '') {
                      filteredTableRows = tableRows.filter(r => r.clientName.toLowerCase().includes(pendienteSearchQuery.toLowerCase()));
                    }

                    filteredTableRows.sort((a, b) => {
                      let valA: any = a[pendienteSortField as keyof typeof a];
                      let valB: any = b[pendienteSortField as keyof typeof b];

                      if (pendienteSortField.startsWith('month_')) {
                        const month = pendienteSortField.replace('month_', '');
                        valA = a.months[month] || 0;
                        valB = b.months[month] || 0;
                      }

                      if (valA < valB) return pendienteSortDirection === 'asc' ? -1 : 1;
                      if (valA > valB) return pendienteSortDirection === 'asc' ? 1 : -1;
                      return 0;
                    });

                    const handleSort = (field: string) => {
                      if (pendienteSortField === field) {
                        setPendienteSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setPendienteSortField(field);
                        setPendienteSortDirection('desc');
                      }
                    };

                    const exportPendienteFacturarToExcel = () => {
                      import('xlsx').then(XLSX => {
                        const rowsForExcel = filteredTableRows.map(r => {
                          const row: any = {
                            "CLIENTE": r.clientName,
                            "VALOR CXC FINAL": Math.round(r.cxc),
                            "VALOR CXP FINAL": Math.round(r.cxp),
                          };
                          sortedMonths.forEach((sm, idx) => {
                            row[monthNames[idx]] = Math.round(r.months[sm] || 0);
                          });
                          return row;
                        });

                        const totalsRow: any = {
                          "CLIENTE": "TOTAL",
                          "VALOR CXC FINAL": Math.round(totals.cxc),
                          "VALOR CXP FINAL": Math.round(totals.cxp),
                        };
                        sortedMonths.forEach((sm, idx) => {
                          totalsRow[monthNames[idx]] = Math.round(totals.months[sm] || 0);
                        });

                        rowsForExcel.push(totalsRow);

                        const ws = XLSX.utils.json_to_sheet(rowsForExcel);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Pendiente Facturar");
                        XLSX.writeFile(wb, "Informe_Pendiente_Facturar.xlsx");
                      }).catch(err => console.error("Error loading xlsx", err));
                    };

                    return (
                      <div id="table-pendiente-facturar" className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                              Pendiente por Facturar 
                              {pendienteShowCounts && <span className="ml-2 text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full text-[10px]">Total: {totals.manifestCount} Manifiestos</span>}
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">Consolidado de valores pendientes según el rango seleccionado</p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Buscar por cliente..."
                                value={pendienteSearchQuery}
                                onChange={(e) => setPendienteSearchQuery(e.target.value)}
                                className="bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-[180px] sm:w-[220px] transition-all"
                              />
                              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              {pendienteSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setPendienteSearchQuery('')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedPendingManifests({ title: 'Consolidado General de Manifiestos', manifests: totals.manifests })}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-indigo-600/15 transition-all"
                            >
                              <Eye size={14} />
                              <span>Ver Detalle General</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPendienteShowCounts(!pendienteShowCounts)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all ${
                                pendienteShowCounts ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/15' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                              }`}
                            >
                              <FileText size={14} />
                              <span>{pendienteShowCounts ? 'Ocultar Manifiestos' : 'Ver Manifiestos'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={exportPendienteFacturarToExcel}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/15 transition-all"
                            >
                              <Download size={14} />
                              <span>Exportar Excel</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => downloadAsImage('table-pendiente-facturar', 'Pendiente_Facturar.png')}
                              className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-slate-800/15 transition-all"
                              title="Descargar como Imagen"
                            >
                              <Camera size={14} />
                              <span>Imagen</span>
                            </button>

                            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase font-mono border border-indigo-100/50">
                              {filteredTableRows.length} Clientes
                            </span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50 select-none">
                                <th onClick={() => handleSort('clientName')} className="text-left cursor-pointer hover:bg-slate-100 transition-colors font-black text-[10px] text-slate-400 uppercase tracking-widest p-4">
                                  Cliente {pendienteSortField === 'clientName' && <span className="text-indigo-600 text-[8px]">{pendienteSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th onClick={() => handleSort('cxc')} className="text-right cursor-pointer hover:bg-slate-100 transition-colors font-black text-[10px] text-slate-400 uppercase tracking-widest p-4 border-l border-slate-200">
                                  Valor CXC Final {pendienteSortField === 'cxc' && <span className="text-indigo-600 text-[8px]">{pendienteSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th onClick={() => handleSort('cxp')} className="text-right cursor-pointer hover:bg-slate-100 transition-colors font-black text-[10px] text-slate-400 uppercase tracking-widest p-4">
                                  Valor CXP Final {pendienteSortField === 'cxp' && <span className="text-indigo-600 text-[8px]">{pendienteSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                {sortedMonths.map((sm, idx) => {
                                  const pct = totals.cxc > 0 ? ((totals.months[sm] || 0) / totals.cxc) * 100 : 0;
                                  return (
                                    <th onClick={() => handleSort(`month_${sm}`)} key={sm} className="text-right cursor-pointer hover:bg-slate-100 transition-colors font-black text-[10px] text-slate-400 uppercase tracking-widest p-4 border-l border-slate-200">
                                      <div className="text-[9px] text-indigo-500 mb-1">{pct.toFixed(2)}%</div>
                                      {monthNames[idx]} {pendienteSortField === `month_${sm}` && <span className="text-indigo-600 text-[8px]">{pendienteSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredTableRows.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-4 text-[11px] font-bold text-slate-700">
                                    <div className="flex items-center justify-between group">
                                      <span>{row.clientName}</span>
                                      <button 
                                        onClick={() => setSelectedPendingManifests({ title: `Cliente: ${row.clientName}`, manifests: row.manifests })}
                                        className="p-1.5 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-lg transition-all text-slate-400"
                                        title="Ver manifiestos del cliente"
                                      >
                                        <Eye size={12} />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="p-4 text-right border-l border-slate-100">
                                    <div className="font-black text-slate-800 text-[11px]">
                                      {row.cxc.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </div>
                                    {pendienteShowCounts && <div className="text-[9px] text-indigo-500 font-bold mt-0.5">{row.manifestCount} Manifiestos</div>}
                                  </td>
                                  <td className="p-4 text-right font-bold text-slate-600 text-[11px]">
                                    {row.cxp.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                  </td>
                                  {sortedMonths.map((sm, idx) => (
                                    <td key={sm} className="p-4 text-right border-l border-slate-100 group relative">
                                      <div className="font-bold text-slate-600 text-[11px]">
                                        {(row.months[sm] || 0) > 0 ? (row.months[sm] || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 }) : ''}
                                      </div>
                                      {pendienteShowCounts && (row.monthCounts[sm] || 0) > 0 && (
                                        <div className="text-[9px] text-indigo-500 font-bold mt-0.5">{row.monthCounts[sm]} Manifiestos</div>
                                      )}
                                      {(row.months[sm] || 0) > 0 && (
                                        <button 
                                          onClick={() => setSelectedPendingManifests({ title: `Cliente: ${row.clientName} - Mes: ${monthNames[idx]}`, manifests: row.monthManifests[sm] })}
                                          className="absolute top-1/2 -translate-y-1/2 left-2 p-1 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-md transition-all text-slate-400"
                                          title="Ver detalle del mes"
                                        >
                                          <Eye size={10} />
                                        </button>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              <tr className="bg-slate-900 text-white">
                                <td className="p-4 font-black text-[11px] uppercase tracking-widest">TOTAL</td>
                                <td className="p-4 text-right border-l border-slate-700">
                                  <div className="font-black text-[11px]">
                                    {totals.cxc.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                  </div>
                                  {pendienteShowCounts && <div className="text-[9px] text-indigo-300 font-bold mt-0.5">{totals.manifestCount} Manifiestos</div>}
                                </td>
                                <td className="p-4 text-right border-l border-slate-700 font-black text-[11px]">
                                  {totals.cxp.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                </td>
                                {sortedMonths.map((sm, idx) => (
                                    <td key={sm} className="p-4 text-right border-l border-slate-700 text-indigo-200 group relative">
                                      <div className="font-black text-[11px]">
                                        {(totals.months[sm] || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                                      </div>
                                      {pendienteShowCounts && (totals.monthCounts[sm] || 0) > 0 && (
                                        <div className="text-[9px] text-indigo-300 font-bold mt-0.5">{totals.monthCounts[sm]} Manifiestos</div>
                                      )}
                                      {(totals.months[sm] || 0) > 0 && (
                                        <button 
                                          onClick={() => setSelectedPendingManifests({ title: `Consolidado: ${monthNames[idx]}`, manifests: totals.monthManifests[sm] })}
                                          className="absolute top-1/2 -translate-y-1/2 left-2 p-1 bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-md transition-all text-slate-400"
                                          title="Ver detalle del mes"
                                        >
                                          <Eye size={10} />
                                        </button>
                                      )}
                                    </td>
                                  ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Detail Modal */}
                        {selectedPendingManifests && (
                          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                                <div>
                                  <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                                    <FileText className="text-indigo-500" size={20} />
                                    Detalle de Manifiestos Pendientes
                                  </h3>
                                  <p className="text-sm font-medium text-slate-500">{selectedPendingManifests.title} ({selectedPendingManifests.manifests.length} Registros)</p>
                                </div>
                                <button
                                  onClick={() => setSelectedPendingManifests(null)}
                                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-2 rounded-full transition-colors bg-white border border-slate-200 shadow-sm"
                                >
                                  <X size={20} />
                                </button>
                              </div>
                              <div className="p-4 overflow-auto flex-1 bg-slate-50/30">
                                <DataTable
                                  data={selectedPendingManifests.manifests || []}
                                  columns={[
                                    {
                                      header: 'Manifiesto',
                                      key: 'manifest_number',
                                      render: (row: any) => <span className="font-bold text-indigo-700 text-xs">{row.manifest_number || 'S/I'}</span>
                                    },
                                    {
                                      header: 'Fecha',
                                      key: 'manifest_date',
                                      render: (row: any) => <span className="font-bold text-slate-600 text-xs">{row.manifest_date ? new Date(row.manifest_date).toLocaleDateString('es-CO') : 'S/I'}</span>
                                    },
                                    {
                                      header: 'Placa',
                                      key: 'plate',
                                      render: (row: any) => <span className="font-black text-slate-700 text-xs">{row.plate || 'S/I'}</span>
                                    },
                                    ...(selectedPendingManifests.title.includes('Consolidado General') ? [{
                                      header: 'Cliente',
                                      key: 'clientName',
                                      render: (row: any) => <span className="font-bold text-slate-600 text-xs">{row.clientName || 'S/I'}</span>
                                    }] : []),
                                    {
                                      header: 'Valor CXC',
                                      key: 'cxc',
                                      render: (row: any) => (
                                        <div className="text-right font-black text-slate-800 text-xs">
                                          {row.cxc.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                        </div>
                                      )
                                    },
                                    {
                                      header: 'Valor CXP',
                                      key: 'cxp',
                                      render: (row: any) => (
                                        <div className="text-right font-bold text-slate-600 text-xs">
                                          {row.cxp.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                        </div>
                                      )
                                    }
                                  ]}
                                  searchPlaceholder="Buscar en manifiestos..."
                                  excelFileName="Manifiestos_Pendientes.xlsx"
                                  onExportExcel={(exportRows, sortedData) => {
                                    const workbook = XLSX.utils.book_new();
                                    const processedRows = sortedData.map((m: any) => {
                                      const newRow: any = {
                                        "Manifiesto": m.manifest_number || 'S/I',
                                        "Fecha": m.manifest_date ? new Date(m.manifest_date).toLocaleDateString('es-CO') : 'S/I',
                                        "Placa": m.plate || 'S/I'
                                      };
                                      if (selectedPendingManifests.title.includes('Consolidado General')) {
                                        newRow["Cliente"] = m.clientName || 'S/I';
                                      }
                                      newRow["Valor CXC"] = Math.round(m.cxc || 0);
                                      newRow["Valor CXP"] = Math.round(m.cxp || 0);
                                      return newRow;
                                    });
                                    const worksheet = XLSX.utils.json_to_sheet(processedRows);
                                    const colZFormats: Record<string, string> = {
                                      "Valor CXC": '"$"#,##0',
                                      "Valor CXP": '"$"#,##0'
                                    };
                                    if (worksheet['!ref']) {
                                      const range = XLSX.utils.decode_range(worksheet['!ref']);
                                      const colNames: Record<number, string> = {};
                                      for (let C = range.s.c; C <= range.e.c; ++C) {
                                        const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
                                        if (cell && cell.v) colNames[C] = cell.v.toString();
                                      }
                                      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                                        for (let C = range.s.c; C <= range.e.c; ++C) {
                                          const colName = colNames[C];
                                          if (colName && colZFormats[colName]) {
                                            const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
                                            if (cell && cell.t === 'n') {
                                              cell.z = colZFormats[colName];
                                            }
                                          }
                                        }
                                      }
                                    }
                                    XLSX.utils.book_append_sheet(workbook, worksheet, "Pendientes");
                                    XLSX.writeFile(workbook, `Detalle_Pendiente_Facturar_${new Date().toISOString().slice(0, 10)}.xlsx`);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className={subReportTab === 'estados' || pdfGenerating ? 'block' : 'hidden'}>
                <div id="table-estados" className="space-y-3 relative">
                  <div className="flex items-start justify-between px-2 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    <div className="flex flex-col gap-1">
                      <span>Arborescencia: Estado OC ➔ Estado Remesa ➔ Estado Manifiesto ➔ Clientes con Cantidad</span>
                      <span>Mostrando {Object.keys(reportData).length} Estados de OC</span>
                    </div>
                    <button
                      onClick={() => downloadAsImage('table-estados', 'Consolidado_Estados.png')}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded-lg transition-all"
                      title="Descargar como Imagen"
                    >
                      <Camera size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {Object.keys(reportData).map(ocKey => {
                      const ocNode = reportData[ocKey];
                      const isOcExpanded = expandedOcs[ocKey];
                      return (
                        <div key={ocKey} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                          
                          {/* LEVEL 1: Estado OC */}
                          <div 
                            onClick={() => toggleOc(ocKey)}
                            className="p-4 bg-slate-50/50 hover:bg-slate-100/50 flex items-center justify-between cursor-pointer select-none transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                ocKey.includes('CUMPLI') || ocKey.includes('COMPLET') || ocKey.includes('ENTREGA')
                                  ? 'bg-emerald-500' : 'bg-amber-500'
                              }`} />
                              <span className="text-xs font-black uppercase text-slate-800 tracking-wider font-mono">Estado OC: {ocKey}</span>
                            </div>
                            <div className="flex items-center gap-3 font-mono">
                              <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-[10px] font-black uppercase">
                                {ocNode.count} OC
                              </span>
                              <ChevronDown 
                                size={16} 
                                className={`text-slate-400 transition-transform ${isOcExpanded ? 'rotate-180 text-indigo-600' : ''}`} 
                              />
                            </div>
                          </div>

                          {/* LEVEL 2: Estado Remesa */}
                          {isOcExpanded && (
                            <div className="divide-y divide-slate-100 pl-6 bg-white border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                              {Object.keys(ocNode.children).length === 0 ? (
                                <div className="p-4 text-xs text-slate-400 font-bold">No hay estados de remesas registrados.</div>
                              ) : (
                                Object.keys(ocNode.children).map(remKey => {
                                  const remNode = ocNode.children[remKey];
                                  const remKeyCombo = `${ocKey}__${remKey}`;
                                  const isRemExpanded = expandedRemesas[remKeyCombo];
                                  return (
                                    <div key={remKey} className="overflow-hidden">
                                      
                                      <div 
                                        onClick={() => toggleRemesa(ocKey, remKey)}
                                        className="p-3.5 hover:bg-slate-50/30 flex items-center justify-between cursor-pointer select-none transition-all"
                                      >
                                        <div className="flex items-center gap-2.5">
                                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                          <span className="text-[11px] font-black uppercase text-slate-600 font-mono">↳ Estado Remesa: {remKey}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase font-mono">
                                            {remNode.count} Remesas
                                          </span>
                                          <ChevronDown 
                                            size={14} 
                                            className={`text-slate-400 transition-transform ${isRemExpanded ? 'rotate-180 text-indigo-600' : ''}`} 
                                          />
                                        </div>
                                      </div>

                                      {/* LEVEL 3: Estado Manifiesto */}
                                      {isRemExpanded && (
                                        <div className="border-t border-slate-100/60 divide-y divide-slate-100 pl-8 bg-slate-50/10 py-1 animate-in slide-in-from-top-1 duration-150">
                                          {Object.keys(remNode.children).length === 0 ? (
                                            <div className="p-3 text-[10px] text-slate-400 font-medium">No hay estados de manifiesto registrados.</div>
                                          ) : (
                                            Object.keys(remNode.children).map(manKey => {
                                              const manNode = remNode.children[manKey];
                                              const manKeyCombo = `${ocKey}__${remKey}__${manKey}`;
                                              const isManExpanded = expandedManifests[manKeyCombo];
                                              return (
                                                <div key={manKey} className="overflow-hidden">
                                                  
                                                  <div 
                                                    onClick={() => toggleManifest(ocKey, remKey, manKey)}
                                                    className="p-3 hover:bg-slate-50/30 flex items-center justify-between cursor-pointer select-none"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <span className="text-[10px] text-indigo-400 font-black">↳</span>
                                                      <span className="text-[11px] font-bold text-slate-500 font-mono">Estado Manifiesto: {manKey}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                      <span className="bg-violet-50 text-violet-700 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase font-mono">
                                                        {manNode.count} Manifiestos
                                                      </span>
                                                      <ChevronDown 
                                                        size={12} 
                                                        className={`text-slate-400 transition-transform ${isManExpanded ? 'rotate-180 text-indigo-600' : ''}`} 
                                                      />
                                                    </div>
                                                  </div>

                                                  {/* LEVEL 4: Clientes with Count */}
                                                  {isManExpanded && (
                                                    <div className="border-t border-slate-100/40 divide-y divide-slate-50 pl-10 bg-indigo-50/10 py-1 animate-in slide-in-from-top-1 duration-100">
                                                      {Object.keys(manNode.clients).length === 0 ? (
                                                        <div className="p-2 text-[10px] text-slate-400 font-bold">No hay clientes asociados.</div>
                                                      ) : (
                                                        Object.keys(manNode.clients).map(cliName => {
                                                          const count = manNode.clients[cliName];
                                                          return (
                                                            <div key={cliName} className="p-2.5 flex items-center justify-between">
                                                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                                                                <span className="text-[10px] text-violet-400 font-black">•</span>
                                                                <span>Cliente: {cliName}</span>
                                                              </div>
                                                              <span className="bg-indigo-50/60 border border-indigo-100/50 text-indigo-700 px-2.5 py-0.5 rounded-md text-[9px] font-black font-mono">
                                                                {count} Viajes
                                                              </span>
                                                            </div>
                                                          );
                                                        })
                                                      )}
                                                    </div>
                                                  )}

                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      )}

                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className={subReportTab === 'clientes' || pdfGenerating ? 'block' : 'hidden'}>
                <div id="table-clientes" className="space-y-3 relative">
                  <div className="flex items-start justify-between px-2 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    <div className="flex flex-col gap-1">
                      <span>Arborescencia: Nombre Cliente ➔ Placa Vehículo (Cantidad de Viajes / Remesas)</span>
                      <span>Mostrando {Object.keys(clientReportData).length} Clientes</span>
                    </div>
                    <button
                      onClick={() => downloadAsImage('table-clientes', 'Consolidado_Clientes.png')}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded-lg transition-all"
                      title="Descargar como Imagen"
                    >
                      <Camera size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {Object.keys(clientReportData).map(clientKey => {
                      const clientNode = clientReportData[clientKey];
                      const isClientExpanded = expandedClients[clientKey];
                      return (
                        <div key={clientKey} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                          
                          {/* LEVEL 1: Nombre Cliente */}
                          <div 
                            onClick={() => toggleClient(clientKey)}
                            className="p-4 bg-slate-50/50 hover:bg-slate-100/50 flex items-center justify-between cursor-pointer select-none transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                              <span className="text-xs font-black uppercase text-slate-800 tracking-wider">Cliente: {clientKey}</span>
                            </div>
                            <div className="flex items-center gap-3 font-mono">
                              <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-[10px] font-black uppercase">
                                {clientNode.count} Órdenes
                              </span>
                              <ChevronDown 
                                size={16} 
                                className={`text-slate-400 transition-transform ${isClientExpanded ? 'rotate-180 text-indigo-600' : ''}`} 
                              />
                            </div>
                          </div>

                          {/* LEVEL 2: Placa Vehículo */}
                          {isClientExpanded && (
                            <div className="divide-y divide-slate-100 pl-6 bg-white border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                              {Object.keys(clientNode.plates).length === 0 ? (
                                <div className="p-4 text-xs text-slate-400 font-bold">No hay registros de vehículos para este cliente.</div>
                              ) : (
                                Object.keys(clientNode.plates).map(plateKey => {
                                  const count = clientNode.plates[plateKey];
                                  return (
                                    <div key={plateKey} className="p-3.5 flex items-center justify-between hover:bg-slate-50/20">
                                      <div className="flex items-center gap-2.5">
                                        <span className="text-[10px] text-indigo-400 font-black font-mono">↳</span>
                                        <span className="text-[11px] font-bold text-slate-600">Placa del Vehículo:</span>
                                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black text-slate-600 font-mono">
                                          {plateKey}
                                        </span>
                                      </div>
                                      <span className="bg-violet-50 text-violet-700 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase font-mono">
                                        {count} Viajes / Remesas
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className={subReportTab === 'tdmVentas' || pdfGenerating ? 'block' : 'hidden'}>
                <div className="space-y-8 animate-in fade-in duration-300">
              {(() => {
                const ocBarData = getOcBarDataByMonth();
                const clientBarData = getDynamicClientBarData(rightChartGroupBy, rightChartLimit);
                return (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Chart 1: Estado Manifiesto distribution (Grouped by Month) */}
                    <div id="chart-manifiesto-mes" className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col">
                      <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-start">
                        <div>
                          <span className="text-[9px] font-black tracking-widest text-indigo-600 uppercase font-mono">Volúmenes Mensuales</span>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mt-0.5">ESTADO DE MANIFIESTO POR MES - Total: {reportRecords.length.toLocaleString()}</h3>
                        </div>
                        <button
                          onClick={() => downloadAsImage('chart-manifiesto-mes', 'Manifiestos_Mes.png')}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-all"
                          title="Descargar Gráfica como Imagen"
                        >
                          <Camera size={14} />
                        </button>
                      </div>

                      {/* Dynamic Title Badges for Left Chart */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(() => {
                          const totals: { [st: string]: number } = {};
                          let grandTotal = 0;
                          reportRecords.forEach(r => {
                            const st = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : 'S/I';
                            totals[st] = (totals[st] || 0) + 1;
                            grandTotal++;
                          });
                          return Object.entries(totals).map(([status, count]) => {
                            const pct = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(1) : '0.0';
                            return (
                              <div key={status} className="px-2.5 py-1 bg-slate-50 border border-slate-200/60 rounded-lg text-[9px] font-black uppercase font-mono flex items-center gap-1.5 shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                <span className="text-slate-500">{status}:</span>
                                <span className="text-indigo-600">{count.toLocaleString()} ({pct}%)</span>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={ocBarData.data} margin={{ top: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }} 
                            itemStyle={{ color: '#fff' }}
                          />
                          <Legend 
                            verticalAlign="bottom" 
                            height={36} 
                            iconType="circle"
                            formatter={(value) => <span className="text-[9px] font-black text-slate-500 uppercase">{value}</span>}
                          />
                          {ocBarData.statuses.map((status, index) => (
                            <Bar key={status} dataKey={status} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[4, 4, 0, 0]}>
                              <LabelList dataKey={status} position="top" fill="#475569" fontSize={8} fontWeight="bold" formatter={(val) => Number(val) > 0 ? val : ''} />
                            </Bar>
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Chart 2: States per Client */}
                    <div id="chart-manifiesto-cliente" className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm overflow-hidden flex flex-col">
                      <div className="border-b border-slate-100 pb-3 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex justify-between w-full sm:w-auto items-start">
                          <div>
                            <span className="text-[9px] font-black tracking-widest text-violet-600 uppercase font-mono">Volúmenes de Clientes</span>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mt-0.5">ESTADO DE MANIFIESTO por Cliente - Total: {reportRecords.length.toLocaleString()}</h3>
                          </div>
                          <button
                            onClick={() => downloadAsImage('chart-manifiesto-cliente', 'Manifiestos_Cliente.png')}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-all"
                            title="Descargar Gráfica como Imagen"
                          >
                            <Camera size={14} />
                          </button>
                        </div>
                        
                        {/* Interactive Dimension & limit Switchers */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <button
                              type="button"
                              onClick={() => setRightChartGroupBy('manifiesto')}
                              className={`px-2 py-1 text-[9px] font-black uppercase tracking-wide rounded-md transition-all ${
                                rightChartGroupBy === 'manifiesto' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Manifiesto
                            </button>
                            <button
                              type="button"
                              onClick={() => setRightChartGroupBy('oc')}
                              className={`px-2 py-1 text-[9px] font-black uppercase tracking-wide rounded-md transition-all ${
                                rightChartGroupBy === 'oc' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              OC
                            </button>
                          </div>

                          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shadow-xs">
                            <button
                              type="button"
                              onClick={() => setRightChartLimit('top10')}
                              className={`px-2 py-1 text-[9px] font-black uppercase tracking-wide rounded-md transition-all ${
                                rightChartLimit === 'top10' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Top 10
                            </button>
                            <button
                              type="button"
                              onClick={() => setRightChartLimit('all')}
                              className={`px-2 py-1 text-[9px] font-black uppercase tracking-wide rounded-md transition-all ${
                                rightChartLimit === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Todos
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Dynamic Title Badges for Right Chart */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(() => {
                          const totals: { [st: string]: number } = {};
                          let grandTotal = 0;
                          reportRecords.forEach(r => {
                            const st = rightChartGroupBy === 'oc'
                              ? (r.oc_status ? String(r.oc_status).trim().toUpperCase() : 'S/I')
                              : (r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : 'S/I');
                            totals[st] = (totals[st] || 0) + 1;
                            grandTotal++;
                          });
                          return Object.entries(totals).map(([status, count]) => {
                            const pct = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(1) : '0.0';
                            return (
                              <div key={status} className="px-2.5 py-1 bg-slate-50 border border-slate-200/60 rounded-lg text-[9px] font-black uppercase font-mono flex items-center gap-1.5 shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                                <span className="text-slate-500">{status}:</span>
                                <span className="text-violet-600">{count.toLocaleString()} ({pct}%)</span>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      <div className="flex-1 overflow-x-auto">
                        <div className={`${rightChartLimit === 'all' ? 'min-w-[2000px]' : 'w-full'} h-[280px]`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={clientBarData.data} 
                              margin={{ bottom: 45 }}
                              onClick={(state) => {
                                if (state && state.activeLabel) {
                                  setSelectedClientChartName(String(state.activeLabel));
                                }
                              }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="client" stroke="#94a3b8" fontSize={8} tickLine={false} angle={-35} textAnchor="end" interval={0} style={{ cursor: 'pointer' }} />
                              <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }} 
                                itemStyle={{ color: '#fff' }}
                              />
                              <Legend 
                                verticalAlign="top" 
                                height={36} 
                                iconType="circle"
                                formatter={(value) => <span className="text-[9px] font-black text-slate-500 uppercase">{value}</span>}
                              />
                              {clientBarData.statuses.map((status, index) => (
                                <Bar 
                                  key={status} 
                                  dataKey={status} 
                                  fill={CHART_COLORS[index % CHART_COLORS.length]} 
                                  stackId="a"
                                  style={{ cursor: 'pointer' }}
                                >
                                  <LabelList dataKey={status} position="inside" fill="#fff" fontSize={8} fontWeight="black" formatter={(val) => Number(val) > 0 ? val : ''} />
                                </Bar>
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Interactive Legend/Details Panel when a client is clicked */}
                  {selectedClientChartName && (
                    <div className="border border-violet-100 bg-violet-50/30 rounded-2xl p-6 shadow-sm animate-fadeIn">
                      <div className="flex items-center justify-between border-b border-violet-100 pb-3 mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-violet-600 text-white rounded-xl shadow-xs">
                            <FileSpreadsheet size={18} />
                          </div>
                          <div>
                            <span className="text-[9px] font-bold tracking-widest text-violet-600 uppercase font-mono">Detalle de Cliente Seleccionado</span>
                            <h4 className="text-sm font-black uppercase text-slate-800">{selectedClientChartName}</h4>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setSelectedClientChartName(null)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all text-xs font-bold font-mono"
                        >
                          CERRAR ✕
                        </button>
                      </div>

                      {/* Financial and Operating TDM Metrics (Sleek Grid) */}
                      {(() => {
                        const clientTdmData = getClientTdmTableData().find(
                          x => x.clientName === selectedClientChartName
                        );
                        
                        // Filter client's records for active statuses
                        const clientRecords = reportRecords.filter(
                          r => r.client_name?.trim().toUpperCase() === selectedClientChartName
                        );
                        
                        const clientStatusTotals: { [st: string]: number } = {};
                        clientRecords.forEach(r => {
                          const st = rightChartGroupBy === 'oc'
                            ? (r.oc_status ? String(r.oc_status).trim().toUpperCase() : 'S/I')
                            : (r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : 'S/I');
                          clientStatusTotals[st] = (clientStatusTotals[st] || 0) + 1;
                        });

                        return (
                          <div className="flex flex-col gap-5">
                            {/* Metrics Row */}
                            {clientTdmData ? (
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">Venta Total</span>
                                  <span className="text-xs font-black text-slate-800 block mt-0.5">{formatMoney(clientTdmData.ventaTotal)}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">Ing. Terceros</span>
                                  <span className="text-xs font-black text-rose-600 block mt-0.5">{formatMoney(clientTdmData.ingTerceros)}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">Ing. Propios</span>
                                  <span className="text-xs font-black text-emerald-600 block mt-0.5">{formatMoney(clientTdmData.ingresosPropios)}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">INT (%)</span>
                                  <span className="text-xs font-black text-indigo-600 block mt-0.5">{clientTdmData.int.toFixed(1)}%</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">Días Lab.</span>
                                  <span className="text-xs font-black text-slate-700 block mt-0.5">{clientTdmData.workedDaysCount} días</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">Veh. Utilizados</span>
                                  <span className="text-xs font-black text-slate-700 block mt-0.5">{clientTdmData.totalVehicleUtilizations}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs col-span-2 lg:col-span-1">
                                  <span className="text-[8px] font-bold text-slate-400 block uppercase">Promedio/Día</span>
                                  <span className="text-xs font-black text-violet-600 block mt-0.5">{clientTdmData.averageVehiclesPerDay.toFixed(1)} veh/día</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-slate-400 text-[10px] italic">No hay datos financieros consolidados para este cliente (estatus anulado o sin transacciones válidas).</div>
                            )}

                            {/* Status Badges Row */}
                            <div>
                              <span className="text-[8px] font-bold text-slate-400 block uppercase mb-2">ESTADO DE MANIFIESTO ({rightChartGroupBy.toUpperCase()})</span>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(clientStatusTotals).map(([st, count]) => {
                                  const pct = clientRecords.length > 0 ? ((count / clientRecords.length) * 100).toFixed(1) : '0.0';
                                  return (
                                    <div key={st} className="px-3.5 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-black uppercase font-mono flex items-center gap-2 shadow-2xs">
                                      <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse" />
                                      <span className="text-slate-500">{st}:</span>
                                      <span className="text-slate-800">{count} ({pct}%)</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              );
            })()}
                  {(() => {
                    const rawGeneralData = getGeneralTdmTableData();
                    const filteredGeneralData = tdmSearchQuery.trim() === ''
                      ? rawGeneralData
                      : rawGeneralData.filter(row => row.clientName.toLowerCase().includes(tdmSearchQuery.toLowerCase()));

                    // General Totals
                    const totalGeneralVenta = filteredGeneralData.reduce((sum, item) => sum + item.ventaTotal, 0);
                    const totalGeneralIngTerceros = filteredGeneralData.reduce((sum, item) => sum + item.ingTerceros, 0);
                    const totalGeneralIngresosPropios = filteredGeneralData.reduce((sum, item) => sum + item.ingresosPropios, 0);
                    const overallGeneralInt = totalGeneralVenta > 0 ? (totalGeneralIngresosPropios / totalGeneralVenta) * 100 : 0;
                    const totalGeneralInvoicedSameMonthVal = filteredGeneralData.reduce((sum, item) => sum + item.invoicedSameMonthVal, 0);
                    const overallGeneralInvoicedSameMonthPct = totalGeneralVenta > 0 ? (totalGeneralInvoicedSameMonthVal / totalGeneralVenta) * 100 : 0;
                    
                    const totalGeneralPaymentDaysVal = filteredGeneralData.reduce((sum, item) => sum + item.totalPaymentDays, 0);
                    const totalGeneralPaymentDaysCount = filteredGeneralData.reduce((sum, item) => sum + item.paymentDaysCount, 0);
                    const overallGeneralAveragePaymentDays = totalGeneralPaymentDaysCount > 0 ? totalGeneralPaymentDaysVal / totalGeneralPaymentDaysCount : 0;

                    const overallGeneralAverageRecDays = filteredGeneralData.reduce((sum, i) => sum + (i.totalRecDays || 0), 0) / filteredGeneralData.reduce((sum, i) => sum + (i.recDaysCount || 0), 0) || 0;
                    const overallGeneralAverageEgrDays = filteredGeneralData.reduce((sum, i) => sum + (i.totalEgrDays || 0), 0) / filteredGeneralData.reduce((sum, i) => sum + (i.egrDaysCount || 0), 0) || 0;
                    const overallGeneralAverageManRecDays = filteredGeneralData.reduce((sum, i) => sum + (i.totalManRecDays || 0), 0) / filteredGeneralData.reduce((sum, i) => sum + (i.manRecDaysCount || 0), 0) || 0;
                    const totalGeneralReceivedValueVal = filteredGeneralData.reduce((sum, item) => sum + (item.receivedValue || 0), 0);
                    const totalGeneralReceivedDiffMonthVal = filteredGeneralData.reduce((sum, item) => sum + (item.receivedDiffMonth || 0), 0);
                    const overallGeneralReceivedPct = totalGeneralVenta > 0 ? (totalGeneralReceivedValueVal / totalGeneralVenta) * 100 : 0;

                    const allGeneralPlates = new Set<string>();
                    const allGeneralDates = new Set<string>();
                    const allGeneralVehicleDays = new Set<string>();
                    filteredGeneralData.forEach(item => {
                      item.uniquePlates.forEach(p => allGeneralPlates.add(p));
                      item.workedDates.forEach(d => allGeneralDates.add(d));
                      item.vehicleDays.forEach(vd => allGeneralVehicleDays.add(vd));
                    });
                    const totalGeneralVehicles = allGeneralPlates.size;
                    const totalGeneralWorkedDaysCount = allGeneralDates.size;
                    const totalGeneralVehicleUtilizationsCount = allGeneralVehicleDays.size;
                    const overallGeneralAverageVehiclesPerDay = totalGeneralWorkedDaysCount > 0 ? totalGeneralVehicleUtilizationsCount / totalGeneralWorkedDaysCount : 0;


                    const rawSummaryData = getClientTdmTableData();
                    const filteredSummaryData = tdmSearchQuery.trim() === ''
                      ? rawSummaryData
                      : rawSummaryData.filter(row => row.clientName.toLowerCase().includes(tdmSearchQuery.toLowerCase()));

                    // Summary Totals
                    const totalSummaryVenta = filteredSummaryData.reduce((sum, item) => sum + item.ventaTotal, 0);
                    const totalSummaryIngTerceros = filteredSummaryData.reduce((sum, item) => sum + item.ingTerceros, 0);
                    const totalSummaryIngresosPropios = filteredSummaryData.reduce((sum, item) => sum + item.ingresosPropios, 0);
                    const overallSummaryInt = totalSummaryVenta > 0 ? (totalSummaryIngresosPropios / totalSummaryVenta) * 100 : 0;
                    const totalSummaryInvoicedSameMonthVal = filteredSummaryData.reduce((sum, item) => sum + item.invoicedSameMonthVal, 0);
                    const overallSummaryInvoicedSameMonthPct = totalSummaryVenta > 0 ? (totalSummaryInvoicedSameMonthVal / totalSummaryVenta) * 100 : 0;
                    
                    const totalSummaryPaymentDaysVal = filteredSummaryData.reduce((sum, item) => sum + item.totalPaymentDays, 0);
                    const totalSummaryPaymentDaysCount = filteredSummaryData.reduce((sum, item) => sum + item.paymentDaysCount, 0);
                    const overallSummaryAveragePaymentDays = totalSummaryPaymentDaysCount > 0 ? totalSummaryPaymentDaysVal / totalSummaryPaymentDaysCount : 0;

                    const overallSummaryAverageRecDays = filteredSummaryData.reduce((sum, i) => sum + (i.totalRecDays || 0), 0) / filteredSummaryData.reduce((sum, i) => sum + (i.recDaysCount || 0), 0) || 0;
                    const overallSummaryAverageEgrDays = filteredSummaryData.reduce((sum, i) => sum + (i.totalEgrDays || 0), 0) / filteredSummaryData.reduce((sum, i) => sum + (i.egrDaysCount || 0), 0) || 0;
                    const overallSummaryAverageManRecDays = filteredSummaryData.reduce((sum, i) => sum + (i.totalManRecDays || 0), 0) / filteredSummaryData.reduce((sum, i) => sum + (i.manRecDaysCount || 0), 0) || 0;
                    const totalSummaryReceivedValueVal = filteredSummaryData.reduce((sum, item) => sum + (item.receivedValue || 0), 0);
                    const totalSummaryReceivedDiffMonthVal = filteredSummaryData.reduce((sum, item) => sum + (item.receivedDiffMonth || 0), 0);
                    const overallSummaryReceivedPct = totalSummaryVenta > 0 ? (totalSummaryReceivedValueVal / totalSummaryVenta) * 100 : 0;

                    const allSummaryPlates = new Set<string>();
                    const allSummaryDates = new Set<string>();
                    const allSummaryVehicleDays = new Set<string>();
                    filteredSummaryData.forEach(item => {
                      item.uniquePlates.forEach(p => allSummaryPlates.add(p));
                      item.workedDates.forEach(d => allSummaryDates.add(d));
                      item.vehicleDays.forEach(vd => allSummaryVehicleDays.add(vd));
                    });
                    const totalSummaryVehicles = allSummaryPlates.size;
                    const totalSummaryWorkedDaysCount = allSummaryDates.size;
                    const totalSummaryVehicleUtilizationsCount = allSummaryVehicleDays.size;
                    const overallSummaryAverageVehiclesPerDay = totalSummaryWorkedDaysCount > 0 ? totalSummaryVehicleUtilizationsCount / totalSummaryWorkedDaysCount : 0;

                    return (
                      <div className="space-y-8">
                        {/* TABLE 1: CLIENTES GENERAL */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                          <div id="table-ventas-clientes-general">
                          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Ventas Clientes General</h3>
                                <div className="flex items-center gap-1.5 ml-2">
                                  <button 
                                    onClick={() => setSelectedClientForVehiclesInt('GENERAL')}
                                    className="p-1.5 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-lg transition-all text-slate-500 shadow-sm border border-slate-200/50 flex items-center gap-1.5"
                                    title="Ver detalle general de INT"
                                  >
                                    <Truck size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-wider">Ver INT</span>
                                  </button>
                                  <button 
                                    onClick={() => setSelectedClientForVehiclesFactMes('GENERAL')}
                                    className="p-1.5 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 rounded-lg transition-all text-slate-500 shadow-sm border border-slate-200/50 flex items-center gap-1.5"
                                    title="Ver detalle general de % FACT. MES"
                                  >
                                    <Truck size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-wider">Ver % Fact. Mes</span>
                                  </button>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Agrupado por el nombre del cliente de prov_cliente según su documento. Excluye anulados.</p>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2.5">
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Buscar por cliente..."
                                  value={tdmSearchQuery}
                                  onChange={(e) => setTdmSearchQuery(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-[180px] sm:w-[220px] transition-all"
                                />
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                {tdmSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setTdmSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={exportGeneralTdmToExcel}
                                disabled={isExportingGeneral}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/15 transition-all"
                                title="Descargar Excel con Clientes General (Hoja 1) y detalle origen (Hoja 2)"
                              >
                                {isExportingGeneral
                                  ? <><svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg><span>Generando…</span></>
                                  : <><Download size={14} /><span>Exportar Excel</span></>
                                }
                              </button>

                              <button
                                type="button"
                                onClick={() => downloadAsImage('table-ventas-clientes-general', 'Ventas_Clientes_General.png')}
                                className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-slate-800/15 transition-all"
                                title="Descargar como Imagen"
                              >
                                <Camera size={14} />
                                <span>Imagen</span>
                              </button>

                              <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase font-mono border border-indigo-100/50">
                                {filteredGeneralData.length} Clientes
                              </span>
                            </div>
                          </div>

                          {filteredGeneralData.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 font-bold text-xs">
                              No se encontraron clientes en el listado general.
                            </div>
                          ) : (
                            <div className="flex flex-col gap-8 p-6">
                              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] custom-scrollbar relative">
                                <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-blue-200 bg-blue-50 text-[9px] font-black uppercase tracking-wider text-blue-800 sticky top-0 z-20 shadow-sm">
                                    <th onClick={() => handleTdmSort('clientName')} className="p-3.5 cursor-pointer hover:bg-blue-100 select-none transition-colors sticky left-0 z-30 bg-blue-50 border-r border-blue-100/50">
                                      <div className="flex items-center gap-1">
                                        <span>Cliente</span>
                                        {tdmSortField === 'clientName' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('ventaTotal')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Venta</span>
                                        {tdmSortField === 'ventaTotal' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('ingTerceros')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Ing Terceros</span>
                                        {tdmSortField === 'ingTerceros' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('ingresosPropios')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Ingresos Propios</span>
                                        {tdmSortField === 'ingresosPropios' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('int')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>INT</span>
                                        {tdmSortField === 'int' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('participation')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Part-vta</span>
                                        {tdmSortField === 'participation' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('invoicedSameMonthVal')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl fact mes</span>
                                        {tdmSortField === 'invoicedSameMonthVal' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('invoicedSameMonthPct')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>% Fact. Mes</span>
                                        {tdmSortField === 'invoicedSameMonthPct' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averagePaymentDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Factura (Fecha Factura - Fecha Manifiesto)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dia fact <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averagePaymentDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Factura hasta Recibo (Fecha Recibo - Fecha Factura)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dias rec <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averageRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageEgrDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Egreso (Fecha Egreso - Fecha Manifiesto)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dias egreso <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averageEgrDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageManRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Recibo (Fecha Recibo - Fecha Manifiesto)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dia man recibido <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averageManRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedValue')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl Rec Mismo Mes</span>
                                        {tdmSortField === 'receivedValue' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedDiffMonth')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl Rec Dif Mes</span>
                                        {tdmSortField === 'receivedDiffMonth' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedPct')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>% Recibido</span>
                                        {tdmSortField === 'receivedPct' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('workedDaysCount')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Días Lab.</span>
                                        {tdmSortField === 'workedDaysCount' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('totalVehicleUtilizations')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Veh. prom mes</span>
                                        {tdmSortField === 'totalVehicleUtilizations' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageVehiclesPerDay')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>veh Prom. Día</span>
                                        {tdmSortField === 'averageVehiclesPerDay' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                  {filteredGeneralData.map((row, index) => (
                                    <tr key={index} className="group hover:bg-slate-50/60 transition-colors">
                                      <td className="p-3.5 font-bold text-slate-800 uppercase tracking-tight sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">{row.clientName}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                                        {row.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono text-slate-600">
                                        {row.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono text-indigo-600 font-bold">
                                        {row.ingresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-black">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <span className={`px-2 py-0.5 rounded text-[10px] ${row.int < 18 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                            {row.int.toFixed(1)}%
                                          </span>
                                          <button 
                                            onClick={() => setSelectedClientForVehiclesInt(row.clientName)}
                                            title="Ver detalle de vehículos que afectaron el INT"
                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                          >
                                            <Truck className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{Math.round(row.participation)}%</td>
                                      <td className="p-3.5 text-right font-mono text-slate-600 font-bold">
                                        {row.invoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-black">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <span className={`px-2 py-0.5 rounded text-[10px] ${row.invoicedSameMonthPct < 60 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                            {row.invoicedSameMonthPct.toFixed(1)}%
                                          </span>
                                          <button 
                                            onClick={() => setSelectedClientForVehiclesFactMes(row.clientName)}
                                            title="Ver detalle de facturación por mes"
                                            className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                          >
                                            <Truck className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averagePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-indigo-600/85">{row.averageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-violet-600/85">{row.averageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                                        {row.receivedValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-amber-700">
                                        {row.receivedDiffMonth.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-black">
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${row.receivedPct < 60 ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                          {row.receivedPct.toFixed(1)}%
                                        </span>
                                      </td>
                                      <td className="p-3.5 text-right font-mono text-slate-600 font-bold">{row.workedDaysCount}</td>
                                      <td className="p-3.5 text-right font-mono text-violet-600 font-bold">{row.totalVehicleUtilizations}</td>
                                      <td className="p-3.5 text-right font-mono text-indigo-600 font-black">{row.averageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                    </tr>
                                  ))}

                                  {/* Grand Total Row */}
                                  <tr className="bg-slate-100 border-t-2 border-slate-200 font-black text-slate-900 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.02)] group">
                                    <td className="p-3.5 text-[10px] uppercase tracking-wider sticky left-0 z-30 bg-slate-100 border-r border-slate-200/60">Total General</td>
                                    <td className="p-3.5 text-right font-mono font-bold text-slate-950">
                                      {totalGeneralVenta.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-800">
                                      {totalGeneralIngTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700 font-bold">
                                      {totalGeneralIngresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700">
                                      <span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">
                                        {overallGeneralInt.toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">100%</td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      {totalGeneralInvoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700 font-black">
                                      {overallGeneralInvoicedSameMonthPct.toFixed(1)}%
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      {overallGeneralAveragePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700/90 font-black">
                                      {overallGeneralAverageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-violet-700/90 font-black">
                                      {overallGeneralAverageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      {overallGeneralAverageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono font-bold text-slate-950 font-black">
                                      {totalGeneralReceivedValueVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono font-bold text-amber-800 font-black">
                                      {totalGeneralReceivedDiffMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      <span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">
                                        {overallGeneralReceivedPct.toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-800">{totalGeneralWorkedDaysCount}</td>
                                    <td className="p-3.5 text-right font-mono text-violet-700">{totalGeneralVehicleUtilizationsCount}</td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700">
                                      {overallGeneralAverageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                  </tr>
                                </tbody>
                                </table>
                              </div>
                              </div>
                            )}
                          </div>
                          {filteredGeneralData.length > 0 && (
                            <div className="px-6 pb-6 pt-0">
                              {/* Bottom Section: Pie Chart */}
                              <div id="chart-pie-ventas-general" className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center justify-center w-full shadow-xs mt-0 relative">
                                <div className="w-full flex justify-between items-start absolute top-4 left-0 px-6">
                                  <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Distribución y Participación de Venta</h4>
                                  <button
                                    onClick={() => downloadAsImage('chart-pie-ventas-general', 'Distribucion_Ventas_General.png')}
                                    className="bg-white hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg transition-all border border-slate-200"
                                    title="Descargar Gráfica como Imagen"
                                  >
                                    <Camera size={14} />
                                  </button>
                                </div>
                                <div className="mt-8">
                                  <SalesPieChart data={filteredGeneralData.map(item => ({ client: item.clientName, ventaTotal: item.ventaTotal }))} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* TABLE 2: RESUMEN VENTAS CON EL 100% DE TDM */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                          <div id="table-resumen-ventas-generales">
                          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 font-bold">Resumen: Ventas Generales</h3>
                                <span className="bg-indigo-50 border border-indigo-100/50 text-indigo-700 px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono">
                                  FECHA MANIFIESTO
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">Filtrado por Rango de Fecha Manifiesto. Excluye manifiestos anulados.</p>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2.5">
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Buscar por cliente..."
                                  value={tdmSearchQuery}
                                  onChange={(e) => setTdmSearchQuery(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-[180px] sm:w-[220px] transition-all"
                                />
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                {tdmSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setTdmSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={exportTdmToExcel}
                                disabled={isExportingTdm}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/15 transition-all"
                                title="Descargar Excel con reporte resumen (Hoja 1) y detalle origen (Hoja 2)"
                              >
                                {isExportingTdm
                                  ? <><svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg><span>Generando…</span></>
                                  : <><Download size={14} /><span>Exportar Excel</span></>
                                }
                              </button>

                              <button
                                type="button"
                                onClick={() => downloadAsImage('table-resumen-ventas-generales', 'Resumen_Ventas_Generales.png')}
                                className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-slate-800/15 transition-all"
                                title="Descargar como Imagen"
                              >
                                <Camera size={14} />
                                <span>Imagen</span>
                              </button>

                              <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase font-mono border border-indigo-100/50">
                                {filteredSummaryData.length} Clientes
                              </span>
                            </div>
                          </div>

                          {filteredSummaryData.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 font-bold text-xs">
                              No se encontraron clientes que coincidan con la búsqueda.
                            </div>
                          ) : (
                            <div className="flex flex-col gap-8 p-6">
                              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] custom-scrollbar relative">
                                <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-blue-200 bg-blue-50 text-[9px] font-black uppercase tracking-wider text-blue-800 sticky top-0 z-20 shadow-sm">
                                    <th onClick={() => handleTdmSort('clientName')} className="p-3.5 cursor-pointer hover:bg-blue-100 select-none transition-colors sticky left-0 z-30 bg-blue-50 border-r border-blue-100/50">
                                      <div className="flex items-center gap-1">
                                        <span>Cliente</span>
                                        {tdmSortField === 'clientName' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('ventaTotal')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Venta</span>
                                        {tdmSortField === 'ventaTotal' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('ingTerceros')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Ing Terceros</span>
                                        {tdmSortField === 'ingTerceros' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('ingresosPropios')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Ingresos Propios</span>
                                        {tdmSortField === 'ingresosPropios' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('int')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>INT</span>
                                        {tdmSortField === 'int' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('participation')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Part-vta</span>
                                        {tdmSortField === 'participation' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('invoicedSameMonthVal')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl fact mes</span>
                                        {tdmSortField === 'invoicedSameMonthVal' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('invoicedSameMonthPct')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>% Fact. Mes</span>
                                        {tdmSortField === 'invoicedSameMonthPct' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averagePaymentDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Factura (Fecha Factura - Fecha Manifiesto)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dia fact <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averagePaymentDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Factura hasta Recibo (Fecha Recibo - Fecha Factura)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dias rec <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averageRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageEgrDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Egreso (Fecha Egreso - Fecha Manifiesto)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dias egreso <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averageEgrDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageManRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Recibo (Fecha Recibo - Fecha Manifiesto)">
                                      <div className="flex flex-col items-end justify-center gap-1">
                                        <div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dia man recibido <HelpCircle size={14} className="text-slate-400" /></div>
                                        {tdmSortField === 'averageManRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedValue')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl Rec Mismo Mes</span>
                                        {tdmSortField === 'receivedValue' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedDiffMonth')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl Rec Dif Mes</span>
                                        {tdmSortField === 'receivedDiffMonth' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedPct')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>% Recibido</span>
                                        {tdmSortField === 'receivedPct' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('workedDaysCount')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Días Lab.</span>
                                        {tdmSortField === 'workedDaysCount' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('totalVehicleUtilizations')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Veh. prom mes</span>
                                        {tdmSortField === 'totalVehicleUtilizations' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageVehiclesPerDay')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>veh Prom. Día</span>
                                        {tdmSortField === 'averageVehiclesPerDay' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                  {filteredSummaryData.map((row, index) => (
                                    <tr key={index} className="group hover:bg-slate-50/60 transition-colors">
                                      <td className="p-3.5 font-bold text-slate-800 uppercase tracking-tight sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">{row.clientName}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                                        {row.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono text-slate-600">
                                        {row.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono text-indigo-600 font-bold">
                                        {row.ingresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-black">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <span className={`px-2 py-0.5 rounded text-[10px] ${row.int < 18 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                            {row.int.toFixed(1)}%
                                          </span>
                                          <button 
                                            onClick={() => setSelectedClientForVehiclesInt(row.clientName)}
                                            title="Ver detalle de vehículos que afectaron el INT"
                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                          >
                                            <Truck className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{Math.round(row.participation)}%</td>
                                      <td className="p-3.5 text-right font-mono text-slate-600 font-bold">
                                        {row.invoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-black">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <span className={`px-2 py-0.5 rounded text-[10px] ${row.invoicedSameMonthPct < 60 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                            {row.invoicedSameMonthPct.toFixed(1)}%
                                          </span>
                                          <button 
                                            onClick={() => setSelectedClientForVehiclesFactMes(row.clientName)}
                                            title="Ver detalle de facturación por mes"
                                            className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                          >
                                            <Truck className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averagePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-indigo-600/85">{row.averageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-violet-600/85">{row.averageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                                        {row.receivedValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-amber-700">
                                        {row.receivedDiffMonth.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-black">
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${row.receivedPct < 60 ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                          {row.receivedPct.toFixed(1)}%
                                        </span>
                                      </td>
                                      <td className="p-3.5 text-right font-mono text-slate-600 font-bold">{row.workedDaysCount}</td>
                                      <td className="p-3.5 text-right font-mono text-violet-600 font-bold">{row.totalVehicleUtilizations}</td>
                                      <td className="p-3.5 text-right font-mono text-indigo-600 font-black">{row.averageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                    </tr>
                                  ))}

                                  {/* Grand Total Row */}
                                  <tr className="bg-slate-100 border-t-2 border-slate-200 font-black text-slate-900 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.02)] group">
                                    <td className="p-3.5 text-[10px] uppercase tracking-wider sticky left-0 z-30 bg-slate-100 border-r border-slate-200/60">Total General</td>
                                    <td className="p-3.5 text-right font-mono font-bold text-slate-950">
                                      {totalSummaryVenta.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-800">
                                      {totalSummaryIngTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700 font-bold">
                                      {totalSummaryIngresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700">
                                      <span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">
                                        {overallSummaryInt.toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">100%</td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      {totalSummaryInvoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700 font-black">
                                      {overallSummaryInvoicedSameMonthPct.toFixed(1)}%
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      {overallSummaryAveragePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700/90 font-black">
                                      {overallSummaryAverageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-violet-700/90 font-black">
                                      {overallSummaryAverageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      {overallSummaryAverageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono font-bold text-slate-950 font-black">
                                      {totalSummaryReceivedValueVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono font-bold text-amber-800 font-black">
                                      {totalSummaryReceivedDiffMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-950 font-black">
                                      <span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">
                                        {overallSummaryReceivedPct.toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-slate-800">{totalSummaryWorkedDaysCount}</td>
                                    <td className="p-3.5 text-right font-mono text-violet-700">{totalSummaryVehicleUtilizationsCount}</td>
                                    <td className="p-3.5 text-right font-mono text-indigo-700">
                                      {overallSummaryAverageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </td>
                                  </tr>
                                </tbody>
                                </table>
                              </div>
                              </div>
                            )}
                          </div>
                          {filteredSummaryData.length > 0 && (
                            <div className="px-6 pb-6 pt-0">
                              {/* Bottom Section: Pie Chart */}
                              <div id="chart-pie-ventas-resumen" className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center justify-center w-full shadow-xs mt-0 relative">
                                <div className="w-full flex justify-between items-start absolute top-4 left-0 px-6">
                                  <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Distribución y Participación de Venta</h4>
                                  <button
                                    onClick={() => downloadAsImage('chart-pie-ventas-resumen', 'Distribucion_Ventas_Resumen.png')}
                                    className="bg-white hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg transition-all border border-slate-200"
                                    title="Descargar Gráfica como Imagen"
                                  >
                                    <Camera size={14} />
                                  </button>
                                </div>
                                <div className="mt-8">
                                  <SalesPieChart data={filteredSummaryData.map(item => ({ client: item.clientName, ventaTotal: item.ventaTotal }))} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONSULTATION TAB PANEL */}
      {activeTab === 'consultas' && (
        <TabConsultas
          records={records}
          total={total}
          loading={loading}
          page={page}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          filters={filters}
          setFilters={setFilters}
          setAppliedFilters={setAppliedFilters}
          handleConsultasSort={handleConsultasSort}
          handleExportToExcel={handleExportToExcel}
          columnsConfig={columnsConfig}
          formatDate={formatDate}
          formatMoney={formatMoney}
        />
      )}

      {/* TAB 3: CARGAR INFORMACION TAB PANEL */}
      {activeTab === 'cargar' && (
        <TabCargar
          excelData={excelData}
          setExcelData={setExcelData}
          uploadType={uploadType}
          setUploadType={setUploadType}
          isUploading={isUploading}
          dragActive={dragActive}
          showColumns={showColumns}
          setShowColumns={setShowColumns}
          fileInputRef={fileInputRef}
          handleDrop={handleDrop}
          handleDrag={handleDrag}
          handleFileInputChange={handleFileInputChange}
          handleConfirmUpload={handleConfirmUpload}
          formatDate={formatDate}
          formatMoney={formatMoney}
        />
      )}
      {/* Premium Vehicles INT Detail Modal */}
      {selectedClientForVehiclesInt && (() => {
        const vehiclesData = getVehiclesIntDetails();
        const clientSales = vehiclesData.reduce((sum, item) => sum + item.ventaTotal, 0);
        const clientIngresosPropios = vehiclesData.reduce((sum, item) => sum + item.ingresosPropios, 0);
        const clientOverallInt = clientSales > 0 ? (clientIngresosPropios / clientSales) * 100 : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-150 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Vehículos que afectaron el INT</h3>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{selectedClientForVehiclesInt}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedClientForVehiclesInt(null);
                    setVehiclesSearchQuery('');
                  }}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats Summary Cards */}
              <div className="px-6 pt-5 grid grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Ventas</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-slate-900">
                    {clientSales.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50/40 border border-indigo-100/50 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-indigo-400 uppercase tracking-wider mb-1">Ingresos Propios</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-indigo-600">
                    {clientIngresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/40 border border-emerald-100/50 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-emerald-400 uppercase tracking-wider mb-1">INT Consolidado</span>
                  <span className="block">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-black font-mono ${
                      clientOverallInt < 18 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {clientOverallInt.toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>

              {/* Table Body Container */}
              <div className="p-6 overflow-y-auto flex-1 min-h-0 bg-slate-50/30">
                <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-white">
                  <DataTable
                    data={vehiclesData || []}
                    columns={[
                      {
                        header: 'Vehículo (Placa)',
                        key: 'plate',
                        render: (row: any) => <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black text-slate-700">{row.plate}</span>
                      },
                      ...(selectedClientForVehiclesInt === 'GENERAL' ? [{
                        header: 'Cliente',
                        key: 'clientName',
                        render: (row: any) => <span className="text-xs font-bold text-slate-600">{row.clientName || 'S/I'}</span>
                      }] : []),
                      {
                        header: 'Cantidad Manifiestos',
                        key: 'manifestCount',
                        render: (row: any) => (
                          <div className="text-right">
                            <button 
                              onClick={() => setSelectedVehicleManifests(row)}
                              className="inline-flex items-center justify-end gap-1.5 px-2 py-1 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 rounded transition-colors active:scale-95"
                              title="Ver detalle de manifiestos"
                            >
                              <span className="font-mono font-bold">{row.manifestCount}</span>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      },
                      {
                        header: 'Venta',
                        key: 'ventaTotal',
                        render: (row: any) => (
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900">
                              {row.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </span>
                          </div>
                        )
                      },
                      {
                        header: 'Ing Terceros',
                        key: 'ingTerceros',
                        render: (row: any) => (
                          <div className="text-right">
                            <span className="font-mono text-slate-500">
                              {row.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </span>
                          </div>
                        )
                      },
                      {
                        header: 'Ingresos Propios',
                        key: 'ingresosPropios',
                        render: (row: any) => {
                          const ip = (row.ventaTotal || 0) - (row.ingTerceros || 0);
                          return (
                            <div className="text-right">
                              <span className="font-mono text-indigo-600 font-bold">
                                {ip.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                              </span>
                            </div>
                          );
                        }
                      },
                      {
                        header: 'INT (%)',
                        key: 'int',
                        render: (row: any) => {
                          const ip = (row.ventaTotal || 0) - (row.ingTerceros || 0);
                          const currentInt = row.ventaTotal > 0 ? (ip / row.ventaTotal) * 100 : 0;
                          return (
                            <div className="text-right">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                currentInt < 18 ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'
                              }`}>
                                {currentInt.toFixed(1)}%
                              </span>
                            </div>
                          );
                        }
                      }
                    ]}
                    excelFileName={`Vehiculos_INT_${selectedClientForVehiclesInt}.xlsx`}
                    searchPlaceholder="Buscar por placa de vehículo..."
                    onExportExcel={(exportRows, sortedData) => {
                      const workbook = XLSX.utils.book_new();

                      const processedExportRows = sortedData.map((v: any) => {
                        const ip = (v.ventaTotal || 0) - (v.ingTerceros || 0);
                        const currentInt = v.ventaTotal > 0 ? (ip / v.ventaTotal) : 0;
                        const newRow: any = {};
                        newRow['Vehículo (Placa)'] = v.plate;
                        if (selectedClientForVehiclesInt === 'GENERAL') {
                          newRow['Cliente'] = v.clientName || 'S/I';
                        }
                        newRow['Cantidad Manifiestos'] = Math.round(v.manifestCount || 0);
                        newRow['Venta'] = Math.round(v.ventaTotal || 0);
                        newRow['Ing Terceros'] = Math.round(v.ingTerceros || 0);
                        newRow['Ingresos Propios'] = Math.round(ip || 0);
                        newRow['INT (%)'] = currentInt;
                        return newRow;
                      });

                      const totalVentas = sortedData.reduce((sum: number, item: any) => sum + item.ventaTotal, 0);
                      const totalIngTerceros = sortedData.reduce((sum: number, item: any) => sum + item.ingTerceros, 0);
                      const totalIngresosPropios = totalVentas - totalIngTerceros;
                      const overallInt = calcIntReal(totalVentas > 0 ? (totalIngresosPropios / totalVentas) * 100 : 0) / 100;
                      const totalManifests = sortedData.reduce((sum: number, item: any) => sum + item.manifestCount, 0);

                      const totalRow: any = {
                        "Vehículo (Placa)": "TOTAL GENERAL"
                      };
                      if (selectedClientForVehiclesInt === 'GENERAL') {
                        totalRow["Cliente"] = "";
                      }
                      totalRow["Cantidad Manifiestos"] = Math.round(totalManifests || 0);
                      totalRow["Venta"] = Math.round(totalVentas || 0);
                      totalRow["Ing Terceros"] = Math.round(totalIngTerceros || 0);
                      totalRow["Ingresos Propios"] = Math.round(totalIngresosPropios || 0);
                      totalRow["INT (%)"] = overallInt;

                      processedExportRows.push(totalRow);

                      const worksheetResumen = XLSX.utils.json_to_sheet(processedExportRows);
                      
                      const colZFormatsResumen: Record<string, string> = {
                        "Venta": '"$"#,##0',
                        "Ing Terceros": '"$"#,##0',
                        "Ingresos Propios": '"$"#,##0',
                        "INT (%)": '0.00%'
                      };

                      if (worksheetResumen['!ref']) {
                        const range = XLSX.utils.decode_range(worksheetResumen['!ref']);
                        const colNames: Record<number, string> = {};
                        for (let C = range.s.c; C <= range.e.c; ++C) {
                          const cell = worksheetResumen[XLSX.utils.encode_cell({ r: 0, c: C })];
                          if (cell && cell.v) colNames[C] = cell.v.toString();
                        }
                        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                          for (let C = range.s.c; C <= range.e.c; ++C) {
                            const colName = colNames[C];
                            if (colName && colZFormatsResumen[colName]) {
                              const cell = worksheetResumen[XLSX.utils.encode_cell({ r: R, c: C })];
                              if (cell && cell.t === 'n') {
                                cell.z = colZFormatsResumen[colName];
                              }
                            }
                          }
                        }
                      }
                      
                      XLSX.utils.book_append_sheet(workbook, worksheetResumen, "Resumen_Vehiculos");
                      XLSX.writeFile(workbook, `Vehiculos_INT_${selectedClientForVehiclesInt}.xlsx`);
                    }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedClientForVehiclesInt(null);
                    setVehiclesSearchQuery('');
                  }}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-slate-900 shadow-sm transition-all active:scale-[0.98]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manifests Detail Modal */}
      {selectedVehicleManifests && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Detalle de Manifiestos</h3>
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">Vehículo: {selectedVehicleManifests.plate}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVehicleManifests(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Table Body Container */}
            <div className="p-6 overflow-y-auto flex-1 min-h-0 bg-slate-50/30">
              <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-white">
                <DataTable
                  data={selectedVehicleManifests.manifests || []}
                  columns={[
                    {
                      header: 'Manifiesto',
                      key: 'manifest_number',
                      render: (row: any) => <span className="font-bold text-slate-800">{row.manifest_number}</span>
                    },
                    {
                      header: 'Fecha',
                      key: 'manifest_date',
                      render: (row: any) => <span className="text-slate-500">{formatDate(row.manifest_date)}</span>
                    },
                    {
                      header: 'Venta',
                      key: 'venta',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900">
                            {row.venta.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                          </span>
                        </div>
                      )
                    },
                    {
                      header: 'Ing Terceros',
                      key: 'ingTerceros',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className="font-mono text-slate-500">
                            {row.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                          </span>
                        </div>
                      )
                    },
                    {
                      header: 'Ingresos Propios',
                      key: 'ingresosPropios',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className="font-mono text-indigo-600 font-bold">
                            {row.ingresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                          </span>
                        </div>
                      )
                    },
                    {
                      header: 'INT (%)',
                      key: 'int',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            row.int < 18 ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {row.int.toFixed(1)}%
                          </span>
                        </div>
                      )
                    }
                  ]}
                  excelFileName={`Manifiestos_${selectedVehicleManifests.plate}.xlsx`}
                  searchPlaceholder="Buscar en manifiestos..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end">
              <button
                onClick={() => setSelectedVehicleManifests(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-slate-900 shadow-sm transition-all active:scale-[0.98]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Vehicles Fact Mes Modal */}
      {selectedClientForVehiclesFactMes && (() => {
        const vehiclesDataFact = getVehiclesFactMesDetails();
        const clientSalesFact = vehiclesDataFact.reduce((sum, v) => sum + v.ventaTotal, 0);
        const clientFacturado = vehiclesDataFact.reduce((sum, v) => sum + v.facturadoTotal, 0);
        const clientOverallFactPct = clientSalesFact > 0 ? (clientFacturado / clientSalesFact) * 100 : 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-150 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Vehículos que afectaron la Facturación del Mes</h3>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{selectedClientForVehiclesFactMes}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedClientForVehiclesFactMes(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats Summary Cards */}
              <div className="px-6 pt-5 grid grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Ventas</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-slate-900">
                    {clientSalesFact.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="p-3 bg-blue-50/40 border border-blue-100/50 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-blue-400 uppercase tracking-wider mb-1">Total Facturado</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-blue-600">
                    {clientFacturado.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/40 border border-emerald-100/50 rounded-xl text-center">
                  <span className="block text-[9px] font-black text-emerald-400 uppercase tracking-wider mb-1">% Fact. Mes Consolidado</span>
                  <span className="block">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-black font-mono ${
                      clientOverallFactPct < 60 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {clientOverallFactPct.toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>

              {/* Table Body Container */}
              <div className="p-6 overflow-y-auto flex-1 min-h-0 bg-slate-50/30">
                <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-white">
                  <DataTable
                    data={vehiclesDataFact || []}
                    columns={[
                      {
                        header: 'Vehículo (Placa)',
                        key: 'plate',
                        render: (row: any) => <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black text-slate-700">{row.plate}</span>
                      },
                      ...(selectedClientForVehiclesFactMes === 'GENERAL' ? [{
                        header: 'Cliente',
                        key: 'clientName',
                        render: (row: any) => <span className="text-xs font-bold text-slate-600">{row.clientName || 'S/I'}</span>
                      }] : []),
                      {
                        header: 'Cantidad Manifiestos',
                        key: 'manifestCount',
                        render: (row: any) => (
                          <div className="text-right">
                            <button 
                              onClick={() => setSelectedVehicleManifestsFact(row)}
                              className="inline-flex items-center justify-end gap-1.5 px-2 py-1 bg-blue-50/50 hover:bg-blue-100 text-blue-700 rounded transition-colors active:scale-95"
                              title="Ver detalle de manifiestos"
                            >
                              <span className="font-mono font-bold">{row.manifestCount}</span>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      },
                      {
                        header: 'Venta',
                        key: 'ventaTotal',
                        render: (row: any) => (
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900">
                              {row.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </span>
                          </div>
                        )
                      },
                      {
                        header: 'Facturado',
                        key: 'facturadoTotal',
                        render: (row: any) => (
                          <div className="text-right">
                            <span className="font-mono text-blue-600 font-bold">
                              {row.facturadoTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </span>
                          </div>
                        )
                      },
                      {
                        header: '% Fact. Mes',
                        key: 'factMesPct',
                        render: (row: any) => (
                          <div className="text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              row.factMesPct < 60 ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {row.factMesPct.toFixed(1)}%
                            </span>
                          </div>
                        )
                      }
                    ]}
                    excelFileName={`Vehiculos_Fact_Mes_${selectedClientForVehiclesFactMes}.xlsx`}
                    searchPlaceholder="Buscar por placa de vehículo..."
                    onExportExcel={(exportRows, sortedData) => {
                      const workbook = XLSX.utils.book_new();

                      // Hoja 1: Resumen
                      const processedExportRows = sortedData.map((v: any) => {
                        const newRow: any = {};
                        newRow['Vehículo (Placa)'] = v.plate;
                        if (selectedClientForVehiclesFactMes === 'GENERAL') {
                          newRow['Cliente'] = v.clientName || 'S/I';
                        }
                        newRow['Cantidad Manifiestos'] = Math.round(v.manifestCount || 0);
                        newRow['Venta'] = Math.round(v.ventaTotal || 0);
                        newRow['Facturado'] = Math.round(v.facturadoTotal || 0);
                        newRow['% Fact. Mes'] = v.ventaTotal > 0 ? (v.facturadoTotal / v.ventaTotal) : 0;
                        return newRow;
                      });

                      const totalVentas = sortedData.reduce((sum: number, item: any) => sum + item.ventaTotal, 0);
                      const totalFacturado = sortedData.reduce((sum: number, item: any) => sum + item.facturadoTotal, 0);
                      const overallPct = totalVentas > 0 ? (totalFacturado / totalVentas) : 0;
                      const totalManifests = sortedData.reduce((sum: number, item: any) => sum + item.manifestCount, 0);

                      const totalRow: any = {
                        "Vehículo (Placa)": "TOTAL GENERAL"
                      };
                      if (selectedClientForVehiclesFactMes === 'GENERAL') {
                        totalRow["Cliente"] = "";
                      }
                      totalRow["Cantidad Manifiestos"] = Math.round(totalManifests || 0);
                      totalRow["Venta"] = Math.round(totalVentas || 0);
                      totalRow["Facturado"] = Math.round(totalFacturado || 0);
                      totalRow["% Fact. Mes"] = overallPct;

                      processedExportRows.push(totalRow);

                      const worksheetResumen = XLSX.utils.json_to_sheet(processedExportRows);
                      
                      const colZFormatsResumen: Record<string, string> = {
                        "Venta": '"$"#,##0',
                        "Facturado": '"$"#,##0',
                        "% Fact. Mes": '0.00%'
                      };

                      if (worksheetResumen['!ref']) {
                        const range = XLSX.utils.decode_range(worksheetResumen['!ref']);
                        const colNames: Record<number, string> = {};
                        for (let C = range.s.c; C <= range.e.c; ++C) {
                          const cell = worksheetResumen[XLSX.utils.encode_cell({ r: 0, c: C })];
                          if (cell && cell.v) colNames[C] = cell.v.toString();
                        }
                        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                          for (let C = range.s.c; C <= range.e.c; ++C) {
                            const colName = colNames[C];
                            if (colName && colZFormatsResumen[colName]) {
                              const cell = worksheetResumen[XLSX.utils.encode_cell({ r: R, c: C })];
                              if (cell && cell.t === 'n') {
                                cell.z = colZFormatsResumen[colName];
                              }
                            }
                          }
                        }
                      }

                      XLSX.utils.book_append_sheet(workbook, worksheetResumen, "Resumen_Vehiculos");

                      // Hoja 2: Detalle Manifiestos
                      const detailRows: any[] = [];
                      sortedData.forEach((vehicle: any) => {
                        if (vehicle.manifests) {
                          vehicle.manifests.forEach((m: any) => {
                            const rowObj: any = {
                              "PLACA": vehicle.plate,
                              "Manifiesto": m.manifest_number,
                              "F. Manifiesto": formatDate(m.manifest_date) || "S/I",
                              "F. Factura": formatDate(m.invoice_date) || "S/I",
                              "Venta": Math.round(m.venta || 0),
                              "Facturado": Math.round(m.facturado || 0),
                              "% Fact. Mes": (m.factMesPct || 0) / 100
                            };
                            if (selectedClientForVehiclesFactMes === 'GENERAL') {
                              rowObj["Cliente"] = vehicle.clientName || 'S/I';
                            }
                            detailRows.push(rowObj);
                          });
                        }
                      });
                      const worksheetDetalle = XLSX.utils.json_to_sheet(detailRows);

                      const colZFormatsDetalle: Record<string, string> = {
                        "Venta": '"$"#,##0',
                        "Facturado": '"$"#,##0',
                        "% Fact. Mes": '0.00%'
                      };

                      if (worksheetDetalle['!ref']) {
                        const range = XLSX.utils.decode_range(worksheetDetalle['!ref']);
                        const colNames: Record<number, string> = {};
                        for (let C = range.s.c; C <= range.e.c; ++C) {
                          const cell = worksheetDetalle[XLSX.utils.encode_cell({ r: 0, c: C })];
                          if (cell && cell.v) colNames[C] = cell.v.toString();
                        }
                        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                          for (let C = range.s.c; C <= range.e.c; ++C) {
                            const colName = colNames[C];
                            if (colName && colZFormatsDetalle[colName]) {
                              const cell = worksheetDetalle[XLSX.utils.encode_cell({ r: R, c: C })];
                              if (cell && cell.t === 'n') {
                                cell.z = colZFormatsDetalle[colName];
                              }
                            }
                          }
                        }
                      }

                      XLSX.utils.book_append_sheet(workbook, worksheetDetalle, "Manifiestos");

                      XLSX.writeFile(workbook, `Vehiculos_Fact_Mes_${selectedClientForVehiclesFactMes}.xlsx`);
                    }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end">
                <button
                  onClick={() => setSelectedClientForVehiclesFactMes(null)}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-slate-900 shadow-sm transition-all active:scale-[0.98]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manifests Detail Modal for Fact Mes */}
      {selectedVehicleManifestsFact && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Detalle de Manifiestos (Fact. Mes)</h3>
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">Vehículo: {selectedVehicleManifestsFact.plate}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVehicleManifestsFact(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Table Body Container */}
            <div className="p-6 overflow-y-auto flex-1 min-h-0 bg-slate-50/30">
              <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm bg-white">
                <DataTable
                  data={selectedVehicleManifestsFact.manifests || []}
                  columns={[
                    {
                      header: 'Manifiesto',
                      key: 'manifest_number',
                      render: (row: any) => <span className="font-bold text-slate-800">{row.manifest_number}</span>
                    },
                    {
                      header: 'F. Manifiesto',
                      key: 'manifest_date',
                      render: (row: any) => <span className="text-slate-500">{formatDate(row.manifest_date)}</span>
                    },
                    {
                      header: 'F. Factura',
                      key: 'invoice_date',
                      render: (row: any) => <span className="text-slate-500">{formatDate(row.invoice_date)}</span>
                    },
                    {
                      header: 'Venta',
                      key: 'venta',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900">
                            {row.venta.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                          </span>
                        </div>
                      )
                    },
                    {
                      header: 'Facturado',
                      key: 'facturado',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className="font-mono text-blue-600 font-bold">
                            {row.facturado.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                          </span>
                        </div>
                      )
                    },
                    {
                      header: '% Fact. Mes',
                      key: 'factMesPct',
                      render: (row: any) => (
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            row.factMesPct < 60 ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {row.factMesPct.toFixed(1)}%
                          </span>
                        </div>
                      )
                    }
                  ]}
                  excelFileName={`Manifiestos_Fact_Mes_${selectedVehicleManifestsFact.plate}.xlsx`}
                  searchPlaceholder="Buscar en manifiestos..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex justify-end">
              <button
                onClick={() => setSelectedVehicleManifestsFact(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-slate-900 shadow-sm transition-all active:scale-[0.98]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PDF REPORT MODAL */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-black uppercase text-slate-800 tracking-wider">Configurar Informe PDF</h2>
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-600">Título del Informe</label>
                <input 
                  type="text"
                  defaultValue={pdfTitleRef.current}
                  onChange={(e) => { pdfTitleRef.current = e.target.value; }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Ej. Informe Gerencial"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase text-slate-600">Secciones a Incluir (Orden de Aparición)</label>
                <p className="text-[10px] text-slate-400">Seleccione las secciones y use las flechas para ordenar cómo aparecerán en el PDF.</p>
                
                <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {pdfSelectedSections.map((sectionId, index) => {
                    const section = PDF_SECTIONS.find(s => s.id === sectionId);
                    if (!section) return null;
                    return (
                      <div key={sectionId} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => {
                              setPdfSelectedSections(prev => prev.filter(id => id !== sectionId));
                            }}
                            className="w-5 h-5 rounded border border-indigo-600 bg-indigo-600 flex items-center justify-center"
                          >
                            <Check size={12} className="text-white" />
                          </button>
                          <span className="text-xs font-bold text-slate-700">{section.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            disabled={index === 0}
                            onClick={() => {
                              const newArr = [...pdfSelectedSections];
                              [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
                              setPdfSelectedSections(newArr);
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft size={16} className="rotate-90" />
                          </button>
                          <button 
                            disabled={index === pdfSelectedSections.length - 1}
                            onClick={() => {
                              const newArr = [...pdfSelectedSections];
                              [newArr[index + 1], newArr[index]] = [newArr[index], newArr[index + 1]];
                              setPdfSelectedSections(newArr);
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft size={16} className="-rotate-90" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {PDF_SECTIONS.filter(s => !pdfSelectedSections.includes(s.id)).map(section => (
                    <div key={section.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200/60 shadow-sm opacity-70 hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setPdfSelectedSections(prev => [...prev, section.id]);
                          }}
                          className="w-5 h-5 rounded border border-slate-300 bg-slate-50 flex items-center justify-center hover:border-indigo-400"
                        />
                        <span className="text-xs font-bold text-slate-600">{section.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={generatePdfReport}
                disabled={pdfGenerating || pdfSelectedSections.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
              >
                {pdfGenerating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Generando...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Generar y Bajar PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
};

export default InformesGerenciales;
