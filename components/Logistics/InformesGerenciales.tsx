import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, X, Search, Calendar, Filter, 
  CheckCircle2, RefreshCw, ChevronLeft, ChevronRight, 
  FileSpreadsheet, HelpCircle, BarChart3, ChevronDown, AlertCircle,
  Download, Eye, Truck
} from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';

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

export const InformesGerenciales: React.FC = () => {
  // Tabs state: 'informes' | 'consultas' | 'cargar'
  const [activeTab, setActiveTab] = useState<'informes' | 'consultas' | 'cargar'>('informes');

  // Sub-reports tab: 'estados' | 'clientes'
  const [subReportTab, setSubReportTab] = useState<'estados' | 'clientes' | 'tdmVentas'>('tdmVentas');
  const [provClientes, setProvClientes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

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
    };
    fetchOnMount();
  }, []);

  const [rightChartLimit, setRightChartLimit] = useState<'top10' | 'all'>('top10');
  const [rightChartGroupBy, setRightChartGroupBy] = useState<'oc' | 'manifiesto'>('manifiesto');
  const [tdmSearchQuery, setTdmSearchQuery] = useState('');
  const [tdmSortField, setTdmSortField] = useState<
    'clientName' | 'ventaTotal' | 'ingTerceros' | 'ingresosPropios' | 'int' | 'participation' | 'invoicedSameMonthVal' | 'invoicedSameMonthPct' | 'averagePaymentDays' | 'workedDaysCount' | 'totalVehicleUtilizations' | 'averageVehiclesPerDay' | 'averageRecDays' | 'averageEgrDays' | 'averageManRecDays' | 'receivedValue' | 'receivedPct'
  >('ventaTotal');
  const [tdmSortDirection, setTdmSortDirection] = useState<'asc' | 'desc'>('desc');

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
  const [vehiclesSearchQuery, setVehiclesSearchQuery] = useState('');
  const [vehiclesSortField, setVehiclesSortField] = useState<'plate' | 'manifestCount' | 'ventaTotal' | 'ingTerceros' | 'ingresosPropios' | 'int'>('ventaTotal');
  const [vehiclesSortDirection, setVehiclesSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hierarchical Reports state
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportData, setReportData] = useState<{ [ocStatus: string]: HierarchicalReportNode }>({});
  const [clientReportData, setClientReportData] = useState<{ [clientName: string]: ClientPlateNode }>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRecords, setReportRecords] = useState<ManagementOrder[]>([]);
  const [selectedClientChartName, setSelectedClientChartName] = useState<string | null>(null);

  // Expanded tree states
  const [expandedOcs, setExpandedOcs] = useState<{ [key: string]: boolean }>({});
  const [expandedRemesas, setExpandedRemesas] = useState<{ [key: string]: boolean }>({});
  const [expandedManifests, setExpandedManifests] = useState<{ [key: string]: boolean }>({});
  const [expandedClients, setExpandedClients] = useState<{ [key: string]: boolean }>({});

  // Check if dates are fully selected (Both needed to query)
  const isReportDateRangeComplete = reportFromDate !== '' && reportToDate !== '';

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
    if (!isReportDateRangeComplete) {
      return; // Hold execution as requested until both date bounds are selected
    }

    setReportLoading(true);
    try {
      const res = await (api as any).getManagementReports({
        page: 1,
        limit: 50000,
        fromDate: reportFromDate,
        toDate: reportToDate
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

  // Re-generate report only when dates are fully selected and changed
  useEffect(() => {
    if (activeTab === 'informes') {
      generateReport();
    }
  }, [activeTab, reportFromDate, reportToDate]);

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
          toast.success(`Archivo de ${uploadType === 'recibo' ? 'Recibidos' : 'Egresos'} cargado: ${rawJson.length} filas detectadas.`);
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

          if (clientName.toUpperCase() === 'TDM TRANSPORTES S.A.S') {
            const originUpper = origenVal.toUpperCase();
            const descLower = descVal.toLowerCase();

            if (originUpper === 'CALI') {
              clientName = 'TDM (DIANA - CALI)';
            } else if (originUpper === 'GIRARDOTA') {
              clientName = 'TDM (PREBEL)';
            } else if (originUpper === 'LA ESTRELLA') {
              if (descLower.includes('plan normal medellin')) {
                clientName = 'TDM (MULAS - MEDELLIN)';
              } else {
                clientName = 'TDM (BOG 10 - MEDELLIN)';
              }
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
        'Valor Total CXC final': r.total_value_cxc_final,
        'Valor Tot CXP final': r.total_value_cxp_final,
        'Factura CXC': r.invoice_cxc,
        'Recibo': r.receipt,
        'Fecha Factura': formatDate(r.invoice_date),
        'Total CXC': r.total_cxc,
        'Egreso': r.egress,
        'Fecha CXP': formatDate(r.cxp_date),
        'Total CXP': r.total_cxp
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
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
          receivedValue: 0
        };
      }

      clientsMap[client].ventaTotal += ventaRecord;
      clientsMap[client].ingTerceros += ingTercerosRecord;

      // Calculate same month invoicing & payment speed days
      let invoicedInSameMonth = 0;
      const dMan = parseCustomDate(r.manifest_date);
      const dInv = parseCustomDate(r.invoice_date);
      const dRec = parseCustomDate(r.fecha_recibo);
      const dEgr = parseCustomDate(r.fecha_egreso);

      if (dMan && dInv) {
        const diffMs = dInv.getTime() - dMan.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalPaymentDays += diffDays;
        clientsMap[client].paymentDaysCount += 1;

        const hasInvoice = r.invoice_cxc && String(r.invoice_cxc).trim() !== '' && String(r.invoice_cxc).trim() !== '0';
        if (hasInvoice) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            invoicedInSameMonth = ventaRecord;
          }
        }
      }
      clientsMap[client].invoicedSameMonth += invoicedInSameMonth;

      // 1. prom dias rec (invoice to receipt)
      if (dInv && dRec) {
        const diffMs = dRec.getTime() - dInv.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalRecDays += diffDays;
        clientsMap[client].recDaysCount += 1;
      }

      // 2. prom dias egreso (receipt to egress)
      if (dRec && dEgr) {
        const diffMs = dEgr.getTime() - dRec.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalEgrDays += diffDays;
        clientsMap[client].egrDaysCount += 1;
      }

      // 3. prom dia man recibido (manifest to receipt) and received value
      if (dMan && dRec) {
        const diffMs = dRec.getTime() - dMan.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalManRecDays += diffDays;
        clientsMap[client].manRecDaysCount += 1;
      }

      if (dRec) {
        clientsMap[client].receivedValue += ventaRecord;
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
      const int = ventaTotal > 0 ? (ingresosPropios / ventaTotal) * 100 : 0;
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
          receivedValue: 0
        };
      }

      clientsMap[client].ventaTotal += ventaRecord;
      clientsMap[client].ingTerceros += ingTercerosRecord;

      // Calculate same month invoicing & payment speed days
      let invoicedInSameMonth = 0;
      const dMan = parseCustomDate(r.manifest_date);
      const dInv = parseCustomDate(r.invoice_date);
      const dRec = parseCustomDate(r.fecha_recibo);
      const dEgr = parseCustomDate(r.fecha_egreso);

      if (dMan && dInv) {
        const diffMs = dInv.getTime() - dMan.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalPaymentDays += diffDays;
        clientsMap[client].paymentDaysCount += 1;

        const hasInvoice = r.invoice_cxc && String(r.invoice_cxc).trim() !== '' && String(r.invoice_cxc).trim() !== '0';
        if (hasInvoice) {
          if (dMan.getFullYear() === dInv.getFullYear() && dMan.getMonth() === dInv.getMonth()) {
            invoicedInSameMonth = ventaRecord;
          }
        }
      }
      clientsMap[client].invoicedSameMonth += invoicedInSameMonth;

      // 1. prom dias rec (invoice to receipt)
      if (dInv && dRec) {
        const diffMs = dRec.getTime() - dInv.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalRecDays += diffDays;
        clientsMap[client].recDaysCount += 1;
      }

      // 2. prom dias egreso (receipt to egress)
      if (dRec && dEgr) {
        const diffMs = dEgr.getTime() - dRec.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalEgrDays += diffDays;
        clientsMap[client].egrDaysCount += 1;
      }

      // 3. prom dia man recibido (manifest to receipt) and received value
      if (dMan && dRec) {
        const diffMs = dRec.getTime() - dMan.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        clientsMap[client].totalManRecDays += diffDays;
        clientsMap[client].manRecDaysCount += 1;
      }

      if (dRec) {
        clientsMap[client].receivedValue += ventaRecord;
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
      const int = ventaTotal > 0 ? (ingresosPropios / ventaTotal) * 100 : 0;
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
        ventaTotal: number;
        ingTerceros: number;
        manifestCount: number;
      }
    } = {};

    reportRecords.forEach(r => {
      const manifestStatus = r.manifest_status ? String(r.manifest_status).trim().toUpperCase() : '';
      if (manifestStatus === 'ANULADO' || manifestStatus === 'ANULADA') {
        return;
      }

      const client = r.client_name ? String(r.client_name).trim().toUpperCase() : 'S/I';
      if (client !== targetClient) {
        return;
      }

      const plate = r.plate ? String(r.plate).trim().toUpperCase() : 'SIN PLACA';

      const cxc = parseValNum(r.total_cxc);
      const cxcFinal = parseValNum(r.total_value_cxc_final);
      const ventaRecord = cxc === 0 ? cxcFinal : cxc;

      const ingTercerosRecord = parseValNum(r.total_value_cxp_final);

      if (!platesMap[plate]) {
        platesMap[plate] = {
          plate,
          ventaTotal: 0,
          ingTerceros: 0,
          manifestCount: 0
        };
      }

      platesMap[plate].ventaTotal += ventaRecord;
      platesMap[plate].ingTerceros += ingTercerosRecord;
      platesMap[plate].manifestCount += 1;
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

  const exportGeneralTdmToExcel = () => {
    try {
      const tdmTableData = getGeneralTdmTableData();
      
      // Sheet 1: Resumen Ventas TDM (with real numbers)
      const summaryRows = tdmTableData.map(row => ({
        "CLIENTE": row.clientName,
        "VENTA": row.ventaTotal,
        "ING TERCEROS": row.ingTerceros,
        "INGRESOS PROPIOS": row.ingresosPropios,
        "INT (%)": Math.round(row.int * 10) / 10,
        "PARTICIPACIÓN (%)": Math.round(row.participation),
        "FACT. MISMO MES": row.invoicedSameMonthVal,
        "% FACT. MISMO MES": Math.round(row.invoicedSameMonthPct * 10) / 10,
        "PROM DÍA PAGO": Math.round(row.averagePaymentDays * 10) / 10,
        "PROM DIAS REC": Math.round((row.averageRecDays || 0) * 10) / 10,
        "PROM DIAS EGRESO": Math.round((row.averageEgrDays || 0) * 10) / 10,
        "PROM DIA MAN RECIBIDO": Math.round((row.averageManRecDays || 0) * 10) / 10,
        "VL RECIBIDO": row.receivedValue,
        "% RECIBIDO": Math.round((row.receivedPct || 0) * 10) / 10,
        "DÍAS LABORADOS": row.workedDaysCount,
        "VEHÍCULOS UTILIZADOS": row.totalVehicleUtilizations,
        "PROMEDIO DÍA": Math.round(row.averageVehiclesPerDay * 10) / 10
      }));

      // Calculate totals for summary
      const totalVenta = tdmTableData.reduce((sum, item) => sum + item.ventaTotal, 0);
      const totalIngTerceros = tdmTableData.reduce((sum, item) => sum + item.ingTerceros, 0);
      const totalIngresosPropios = tdmTableData.reduce((sum, item) => sum + item.ingresosPropios, 0);
      const overallInt = totalVenta > 0 ? (totalIngresosPropios / totalVenta) * 100 : 0;
      
      const totalInvoicedSameMonth = tdmTableData.reduce((sum, item) => sum + item.invoicedSameMonthVal, 0);
      const overallInvoicedSameMonthPct = totalVenta > 0 ? (totalInvoicedSameMonth / totalVenta) * 100 : 0;

      const totalPaymentDaysVal = tdmTableData.reduce((sum, item) => sum + item.totalPaymentDays, 0);
      const totalPaymentDaysCount = tdmTableData.reduce((sum, item) => sum + item.paymentDaysCount, 0);
      const overallAveragePaymentDays = totalPaymentDaysCount > 0 ? totalPaymentDaysVal / totalPaymentDaysCount : 0;

      const overallAverageRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.recDaysCount || 0), 0) || 0;
      const overallAverageEgrDays = tdmTableData.reduce((sum, i) => sum + (i.totalEgrDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.egrDaysCount || 0), 0) || 0;
      const overallAverageManRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalManRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.manRecDaysCount || 0), 0) || 0;
      const totalReceivedValueVal = tdmTableData.reduce((sum, item) => sum + (item.receivedValue || 0), 0);
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
        "VENTA": totalVenta,
        "ING TERCEROS": totalIngTerceros,
        "INGRESOS PROPIOS": totalIngresosPropios,
        "INT (%)": Math.round(overallInt * 10) / 10,
        "PARTICIPACIÓN (%)": 100,
        "FACT. MISMO MES": totalInvoicedSameMonth,
        "% FACT. MISMO MES": Math.round(overallInvoicedSameMonthPct * 10) / 10,
        "PROM DÍA PAGO": Math.round(overallAveragePaymentDays * 10) / 10,
        "PROM DIAS REC": Math.round(overallAverageRecDays * 10) / 10,
        "PROM DIAS EGRESO": Math.round(overallAverageEgrDays * 10) / 10,
        "PROM DIA MAN RECIBIDO": Math.round(overallAverageManRecDays * 10) / 10,
        "VL RECIBIDO": totalReceivedValueVal,
        "% RECIBIDO": Math.round(overallReceivedPct * 10) / 10,
        "DÍAS LABORADOS": totalWorkedDays,
        "VEHÍCULOS UTILIZADOS": totalVehicleDaysCount,
        "PROMEDIO DÍA": Math.round(totalAvgVehiclesPerDay * 10) / 10
      });

      const worksheetSummary = XLSX.utils.json_to_sheet(summaryRows);

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
      XLSX.utils.book_append_sheet(workbook, worksheetSummary, "Clientes General TDM");
      XLSX.utils.book_append_sheet(workbook, worksheetDetail, "Detalle Transacciones");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Clientes_General_100_TDM_${dateStr}.xlsx`);
      toast.success('Reporte Excel de Clientes General descargado con éxito.');
    } catch (err) {
      console.error('[EXPORT-GENERAL-XLSX-ERR]', err);
      toast.error('Hubo un error al exportar el reporte a Excel.');
    }
  };

  const exportTdmToExcel = () => {
    try {
      const tdmTableData = getClientTdmTableData();
      
      // Sheet 1: Resumen Ventas TDM (with real numbers)
      const summaryRows = tdmTableData.map(row => ({
        "CLIENTE": row.clientName,
        "VENTA": row.ventaTotal,
        "ING TERCEROS": row.ingTerceros,
        "INGRESOS PROPIOS": row.ingresosPropios,
        "INT (%)": Math.round(row.int * 10) / 10,
        "PARTICIPACIÓN (%)": Math.round(row.participation),
        "FACT. MISMO MES": row.invoicedSameMonthVal,
        "% FACT. MISMO MES": Math.round(row.invoicedSameMonthPct * 10) / 10,
        "PROM DÍA PAGO": Math.round(row.averagePaymentDays * 10) / 10,
        "PROM DIAS REC": Math.round((row.averageRecDays || 0) * 10) / 10,
        "PROM DIAS EGRESO": Math.round((row.averageEgrDays || 0) * 10) / 10,
        "PROM DIA MAN RECIBIDO": Math.round((row.averageManRecDays || 0) * 10) / 10,
        "VL RECIBIDO": row.receivedValue,
        "% RECIBIDO": Math.round((row.receivedPct || 0) * 10) / 10,
        "DÍAS LABORADOS": row.workedDaysCount,
        "VEHÍCULOS UTILIZADOS": row.totalVehicleUtilizations,
        "PROMEDIO DÍA": Math.round(row.averageVehiclesPerDay * 10) / 10
      }));

      // Calculate totals for summary
      const totalVenta = tdmTableData.reduce((sum, item) => sum + item.ventaTotal, 0);
      const totalIngTerceros = tdmTableData.reduce((sum, item) => sum + item.ingTerceros, 0);
      const totalIngresosPropios = tdmTableData.reduce((sum, item) => sum + item.ingresosPropios, 0);
      const overallInt = totalVenta > 0 ? (totalIngresosPropios / totalVenta) * 100 : 0;
      
      const totalInvoicedSameMonth = tdmTableData.reduce((sum, item) => sum + item.invoicedSameMonthVal, 0);
      const overallInvoicedSameMonthPct = totalVenta > 0 ? (totalInvoicedSameMonth / totalVenta) * 100 : 0;

      const totalPaymentDaysVal = tdmTableData.reduce((sum, item) => sum + item.totalPaymentDays, 0);
      const totalPaymentDaysCount = tdmTableData.reduce((sum, item) => sum + item.paymentDaysCount, 0);
      const overallAveragePaymentDays = totalPaymentDaysCount > 0 ? totalPaymentDaysVal / totalPaymentDaysCount : 0;

      const overallAverageRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.recDaysCount || 0), 0) || 0;
      const overallAverageEgrDays = tdmTableData.reduce((sum, i) => sum + (i.totalEgrDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.egrDaysCount || 0), 0) || 0;
      const overallAverageManRecDays = tdmTableData.reduce((sum, i) => sum + (i.totalManRecDays || 0), 0) / tdmTableData.reduce((sum, i) => sum + (i.manRecDaysCount || 0), 0) || 0;
      const totalReceivedValueVal = tdmTableData.reduce((sum, item) => sum + (item.receivedValue || 0), 0);
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
        "VENTA": totalVenta,
        "ING TERCEROS": totalIngTerceros,
        "INGRESOS PROPIOS": totalIngresosPropios,
        "INT (%)": Math.round(overallInt * 10) / 10,
        "PARTICIPACIÓN (%)": 100,
        "FACT. MISMO MES": totalInvoicedSameMonth,
        "% FACT. MISMO MES": Math.round(overallInvoicedSameMonthPct * 10) / 10,
        "PROM DÍA PAGO": Math.round(overallAveragePaymentDays * 10) / 10,
        "PROM DIAS REC": Math.round(overallAverageRecDays * 10) / 10,
        "PROM DIAS EGRESO": Math.round(overallAverageEgrDays * 10) / 10,
        "PROM DIA MAN RECIBIDO": Math.round(overallAverageManRecDays * 10) / 10,
        "VL RECIBIDO": totalReceivedValueVal,
        "% RECIBIDO": Math.round(overallReceivedPct * 10) / 10,
        "DÍAS LABORADOS": totalWorkedDays,
        "VEHÍCULOS UTILIZADOS": totalVehicleDaysCount,
        "PROMEDIO DÍA": Math.round(totalAvgVehiclesPerDay * 10) / 10
      });

      const worksheetSummary = XLSX.utils.json_to_sheet(summaryRows);

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
    }
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
      const exportRows = vehiclesData.map(v => ({
        "PLACA / VEHÍCULO": v.plate,
        "CANTIDAD MANIFIESTOS": v.manifestCount,
        "VALOR CXC CXP INICIAL (VENTA)": v.ventaTotal,
        "ING TERCEROS": v.ingTerceros,
        "INGRESOS PROPIOS": v.ingresosPropios,
        "INT (%)": Math.round(v.int * 10) / 10
      }));

      // Calculate totals
      const totalVentas = vehiclesData.reduce((sum, item) => sum + item.ventaTotal, 0);
      const totalIngTerceros = vehiclesData.reduce((sum, item) => sum + item.ingTerceros, 0);
      const totalIngresosPropios = vehiclesData.reduce((sum, item) => sum + item.ingresosPropios, 0);
      const overallInt = totalVentas > 0 ? (totalIngresosPropios / totalVentas) * 100 : 0;
      const totalManifests = vehiclesData.reduce((sum, item) => sum + item.manifestCount, 0);

      exportRows.push({
        "PLACA / VEHÍCULO": "TOTAL GENERAL",
        "CANTIDAD MANIFIESTOS": totalManifests,
        "VALOR CXC CXP INICIAL (VENTA)": totalVentas,
        "ING TERCEROS": totalIngTerceros,
        "INGRESOS PROPIOS": totalIngresosPropios,
        "INT (%)": Math.round(overallInt * 10) / 10
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
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
          
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".xlsx, .xls" 
            className="hidden" 
            onChange={handleFileInputChange} 
          />
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

              {isReportDateRangeComplete && (
                <button
                  type="button"
                  onClick={() => {
                    setReportFromDate('');
                    setReportToDate('');
                  }}
                  className="self-end bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Limpiar Rango
                </button>
              )}
            </div>

            <button
              onClick={generateReport}
              disabled={reportLoading || !isReportDateRangeComplete}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/15 self-stretch md:self-auto justify-center transition-all disabled:opacity-40"
            >
              <RefreshCw className={reportLoading ? 'animate-spin' : ''} size={14} />
              <span>Generar Consolidado</span>
            </button>
          </div>

          {/* RENDER BODY ONLY WHEN DATE RANGE IS SELECTED AS REQUESTED */}
          {!isReportDateRangeComplete ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-20 text-center shadow-sm">
              <div className="flex flex-col items-center justify-center space-y-4 max-w-md mx-auto">
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                  <Calendar size={32} />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Selección de Rango de Fechas Obligatoria</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para optimizar las consultas y evitar la carga accidental de miles de registros, **debe seleccionar tanto la Fecha Inicial como la Fecha Final** para ejecutar el consolidado gerencial.
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
              {(() => {
                const ocBarData = getOcBarDataByMonth();
                const clientBarData = getDynamicClientBarData(rightChartGroupBy, rightChartLimit);
                return (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Chart 1: Estado Manifiesto distribution (Grouped by Month) */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col">
                      <div className="border-b border-slate-100 pb-3 mb-3">
                        <span className="text-[9px] font-black tracking-widest text-indigo-600 uppercase font-mono">Volúmenes Mensuales</span>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mt-0.5">ESTADO DE MANIFIESTO POR MES - Total: {reportRecords.length.toLocaleString()}</h3>
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
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm overflow-hidden flex flex-col">
                      <div className="border-b border-slate-100 pb-3 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-[9px] font-black tracking-widest text-violet-600 uppercase font-mono">Volúmenes de Clientes</span>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mt-0.5">ESTADO DE MANIFIESTO por Cliente - Total: {reportRecords.length.toLocaleString()}</h3>
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
                  Ventas con el 100% de TDM
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
              {subReportTab === 'estados' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <span>Arborescencia: Estado OC ➔ Estado Remesa ➔ Estado Manifiesto ➔ Clientes con Cantidad</span>
                    <span>Mostrando {Object.keys(reportData).length} Estados de OC</span>
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
              ) : subReportTab === 'clientes' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <span>Arborescencia: Nombre Cliente ➔ Placa Vehículo (Cantidad de Viajes / Remesas)</span>
                    <span>Mostrando {Object.keys(clientReportData).length} Clientes</span>
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
              ) : (
                <div className="space-y-8 animate-in fade-in duration-300">
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
                          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Ventas
Clientes General</h3>
                                </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">Agrupado por el nombre del cliente de prov_cliente según su documento. Excluye anulados.</p>
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
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/15 transition-all"
                                title="Descargar Excel con Clientes General (Hoja 1) y detalle origen (Hoja 2)"
                              >
                                <Download size={14} />
                                <span>Exportar Excel</span>
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
                              <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-blue-100/80 bg-blue-50/70 text-[9px] font-black uppercase tracking-wider text-blue-800">
                                    <th onClick={() => handleTdmSort('clientName')} className="p-3.5 cursor-pointer hover:bg-slate-100 select-none transition-colors">
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
                                    <th onClick={() => handleTdmSort('averagePaymentDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dia fact</span>
                                        {tdmSortField === 'averagePaymentDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dias rec</span>
                                        {tdmSortField === 'averageRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageEgrDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dias egreso</span>
                                        {tdmSortField === 'averageEgrDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageManRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dia man recibido</span>
                                        {tdmSortField === 'averageManRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedValue')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl Recibido</span>
                                        {tdmSortField === 'receivedValue' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
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
                                    <tr key={index} className="hover:bg-slate-50/40 transition-colors">
                                      <td className="p-3.5 font-bold text-slate-800 uppercase tracking-tight">{row.clientName}</td>
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
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${row.invoicedSameMonthPct < 60 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                          {row.invoicedSameMonthPct.toFixed(1)}%
                                        </span>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averagePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-indigo-600/85">{row.averageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-violet-600/85">{row.averageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                                        {row.receivedValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
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
                                  <tr className="bg-slate-100/50 border-t-2 border-slate-200 font-black text-slate-900">
                                    <td className="p-3.5 text-[10px] uppercase tracking-wider">Total General</td>
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

                              {/* Bottom Section: Pie Chart */}
                              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center justify-center w-full shadow-xs mt-4">
                                <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider mb-2 text-center">Distribución y Participación de Venta</h4>
                                <SalesPieChart data={filteredGeneralData.map(item => ({ client: item.clientName, ventaTotal: item.ventaTotal }))} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* TABLE 2: RESUMEN VENTAS CON EL 100% DE TDM */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 font-bold">Resumen: Ventas con el 100% de TDM</h3>
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
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/15 transition-all"
                                title="Descargar Excel con reporte resumen (Hoja 1) y detalle origen (Hoja 2)"
                              >
                                <Download size={14} />
                                <span>Exportar Excel</span>
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
                              <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-blue-100/80 bg-blue-50/70 text-[9px] font-black uppercase tracking-wider text-blue-800">
                                    <th onClick={() => handleTdmSort('clientName')} className="p-3.5 cursor-pointer hover:bg-slate-100 select-none transition-colors">
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
                                    <th onClick={() => handleTdmSort('averagePaymentDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dia fact</span>
                                        {tdmSortField === 'averagePaymentDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dias rec</span>
                                        {tdmSortField === 'averageRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageEgrDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dias egreso</span>
                                        {tdmSortField === 'averageEgrDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('averageManRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>prom dia man recibido</span>
                                        {tdmSortField === 'averageManRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                    </th>
                                    <th onClick={() => handleTdmSort('receivedValue')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors">
                                      <div className="flex items-center justify-end gap-1">
                                        <span>Vl Recibido</span>
                                        {tdmSortField === 'receivedValue' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}
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
                                    <tr key={index} className="hover:bg-slate-50/40 transition-colors">
                                      <td className="p-3.5 font-bold text-slate-800 uppercase tracking-tight">{row.clientName}</td>
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
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${row.invoicedSameMonthPct < 60 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>
                                          {row.invoicedSameMonthPct.toFixed(1)}%
                                        </span>
                                      </td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averagePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-indigo-600/85">{row.averageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-violet-600/85">{row.averageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                      <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                                        {row.receivedValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
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
                                  <tr className="bg-slate-100/50 border-t-2 border-slate-200 font-black text-slate-900">
                                    <td className="p-3.5 text-[10px] uppercase tracking-wider">Total General</td>
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

                              {/* Bottom Section: Pie Chart */}
                              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center justify-center w-full shadow-xs mt-4">
                                <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider mb-2 text-center">Distribución y Participación de Venta</h4>
                                <SalesPieChart data={filteredSummaryData.map(item => ({ client: item.clientName, ventaTotal: item.ventaTotal }))} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONSULTATION TAB PANEL */}
      {activeTab === 'consultas' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* CONSULTATION CONTROLS BAR WITH DATE RANGE, QUICK SEARCH, LIMIT SELECTOR AND EXPORT */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            
            {/* Left: Date Range selectors */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">Fecha Desde (MANIFIESTO)</span>
                <input 
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilters(prev => ({ ...prev, fromDate: val }));
                    setAppliedFilters(prev => ({ ...prev, fromDate: val }));
                    setPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">Fecha Hasta (MANIFIESTO)</span>
                <input 
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilters(prev => ({ ...prev, toDate: val }));
                    setAppliedFilters(prev => ({ ...prev, toDate: val }));
                    setPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                />
              </div>

              {(filters.fromDate || filters.toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, fromDate: '', toDate: '' }));
                    setAppliedFilters(prev => ({ ...prev, fromDate: '', toDate: '' }));
                    setPage(1);
                  }}
                  className="self-end bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Limpiar Fechas
                </button>
              )}
            </div>

            {/* Middle: General quick query text input */}
            <div className="flex-1 max-w-sm relative self-stretch sm:self-auto flex items-end">
              <div className="relative w-full">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  value={filters.ocNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilters(prev => ({ ...prev, ocNumber: val }));
                    setAppliedFilters(prev => ({ ...prev, ocNumber: val }));
                    setPage(1);
                  }}
                  placeholder="Buscar Número OC..."
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 pl-10 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                />
              </div>
            </div>

            {/* Right: Records limit dropdown & Export Spreadsheets button */}
            <div className="flex items-center gap-3 self-end xl:self-auto">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ver:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <button
                onClick={handleExportToExcel}
                className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100/80 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                <FileSpreadsheet size={14} />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>

          {/* MAIN RESULTS DATA TABLE */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-200/80">
                    {columnsConfig.map((col) => (
                      <th 
                        key={col.key}
                        onClick={() => handleConsultasSort(col.key)}
                        className={`p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:bg-slate-100 select-none transition-colors whitespace-nowrap ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                          <span>{col.label}</span>
                          {consultasSortField === col.key && (
                            <span className="text-indigo-600 font-bold text-[8px]">{consultasSortDirection === 'asc' ? '▲' : '▼'}</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={columnsConfig.length} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
                          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Cargando registros...</span>
                        </div>
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={columnsConfig.length} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
                          <FileSpreadsheet size={32} className="stroke-1 animate-pulse" />
                          <span className="text-xs font-black uppercase tracking-wider">No se encontraron registros</span>
                          <p className="text-[10px] text-slate-400">Asegúrate de cambiar las fechas de consulta o importar información en la pestaña "Cargar Información".</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    records.map((row) => (
                      <tr key={row.oc_number} className="hover:bg-slate-50/50 transition-all text-xs font-medium text-slate-700">
                        {columnsConfig.map((col) => (
                          <td 
                            key={col.key} 
                            className={`p-4 whitespace-nowrap ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION PANEL */}
            {total > limit && (
              <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-3.5 bg-slate-50/40">
                <span className="text-xs text-slate-500 font-bold">
                  Mostrando <span className="text-slate-800">{(page - 1) * limit + 1}</span> a <span className="text-slate-800">{Math.min(page * limit, total)}</span> de <span className="text-slate-800">{total}</span> registros
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-black px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-800">
                    {page}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(p + 1, Math.ceil(total / limit)))}
                    disabled={page >= Math.ceil(total / limit)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CARGAR INFORMACION TAB PANEL */}
      {activeTab === 'cargar' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* SELECTOR DE TIPO DE CARGA */}
          <div className="flex items-center justify-center p-1 bg-slate-100/80 rounded-2xl max-w-md mx-auto shadow-sm border border-slate-200/50">
            <button
              onClick={() => { setUploadType('general'); setExcelData([]); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                uploadType === 'general'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Carga General
            </button>
            <button
              onClick={() => { setUploadType('recibo'); setExcelData([]); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                uploadType === 'recibo'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Recibidos
            </button>
            <button
              onClick={() => { setUploadType('egreso'); setExcelData([]); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                uploadType === 'egreso'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Egresos
            </button>
          </div>

          {excelData.length === 0 ? (
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-24 border-2 border-dashed rounded-3xl cursor-pointer transition-all ${
                dragActive 
                  ? 'border-indigo-500 bg-indigo-50/40' 
                  : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/50'
              }`}
            >
              <div className="p-5 rounded-full bg-indigo-50 text-indigo-600 mb-4 shadow-sm">
                <Upload size={28} className="animate-bounce" />
              </div>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide text-center">
                {uploadType === 'general' && 'Arrastra tu archivo formatoinforme.xlsx aquí'}
                {uploadType === 'recibo' && 'Arrastra tu archivo de Recibidos aquí'}
                {uploadType === 'egreso' && 'Arrastra tu archivo de Egresos aquí'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">O haz clic para explorar tus archivos locales (.xlsx, .xls).</p>
              <div className="flex items-center gap-2 mt-4 bg-slate-100/60 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase">
                <FileSpreadsheet size={12} />
                <span>
                  {uploadType === 'general' && 'Formato requerido de 23 columnas'}
                  {uploadType === 'recibo' && 'Columnas requeridas: Consecutivo, Fecha'}
                  {uploadType === 'egreso' && 'Columnas requeridas: Consecutivo, Fecha'}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-350">
              {/* Previsualization Table Header */}
              <div className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <FileSpreadsheet size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                      {uploadType === 'general' && `Previsualización de Carga Gerencial (${excelData.length} registros)`}
                      {uploadType === 'recibo' && `Previsualización de Carga de Recibidos (${excelData.length} registros)`}
                      {uploadType === 'egreso' && `Previsualización de Carga de Egresos (${excelData.length} registros)`}
                    </h2>
                    <p className="text-[10px] text-slate-400">
                      {uploadType === 'general' && 'Verifique detenidamente las 23 columnas cargadas antes de consolidar la información.'}
                      {(uploadType === 'recibo' || uploadType === 'egreso') && 'Verifique las columnas cargadas. Se actualizará la fecha correspondiente según el Consecutivo.'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExcelData([])}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Descartar Archivo
                  </button>
                  <button
                    onClick={handleConfirmUpload}
                    disabled={isUploading}
                    className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="animate-spin" size={13} />
                        <span>Guardando en BD...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} />
                        <span>Confirmar Carga</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Alert banner inside preview uploader */}
              <div className="bg-indigo-50/60 border-b border-indigo-100 px-6 py-2.5 flex flex-wrap gap-4 items-center justify-between text-[10px] font-black uppercase text-indigo-800 font-mono">
                <span>Registros listos para importar/actualizar: {excelData.length}</span>
                <span className="text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">
                  {uploadType === 'general' ? 'ON CONFLICT (oc_number) DO UPDATE' : `UPDATE BY CONSECUTIVE (${uploadType === 'recibo' ? 'receipt' : 'egress'})`}
                </span>
              </div>

              {/* Responsive Scrollable Preview Table */}
              <div className="overflow-x-auto max-h-[550px]">
                {uploadType === 'general' ? (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100/85 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                        <th className="p-3 whitespace-nowrap">Número OC</th>
                        <th className="p-3 whitespace-nowrap">Estado OC</th>
                        <th className="p-3 whitespace-nowrap">Fecha OC</th>
                        <th className="p-3 whitespace-nowrap">Número Remesa</th>
                        <th className="p-3 whitespace-nowrap">Remisión</th>
                        <th className="p-3 whitespace-nowrap">Estado Remesa</th>
                        <th className="p-3 whitespace-nowrap">Fecha Remesa</th>
                        <th className="p-3 whitespace-nowrap">Número Manifiesto</th>
                        <th className="p-3 whitespace-nowrap">Orden Cliente</th>
                        <th className="p-3 whitespace-nowrap">Observaciones Manifiesto</th>
                        <th className="p-3 whitespace-nowrap">Estado Manifiesto</th>
                        <th className="p-3 whitespace-nowrap">Fecha Manifiesto</th>
                        <th className="p-3 whitespace-nowrap">Placa</th>
                        <th className="p-3 whitespace-nowrap">Nombre Cliente</th>
                        <th className="p-3 whitespace-nowrap">Documento Cliente</th>
                        <th className="p-3 whitespace-nowrap text-right">Valor CXC Final</th>
                        <th className="p-3 whitespace-nowrap text-right">Valor CXP Final</th>
                        <th className="p-3 whitespace-nowrap">Factura CXC</th>
                        <th className="p-3 whitespace-nowrap">Recibo</th>
                        <th className="p-3 whitespace-nowrap">Fecha Factura</th>
                        <th className="p-3 whitespace-nowrap text-right">Total CXC</th>
                        <th className="p-3 whitespace-nowrap">Egreso</th>
                        <th className="p-3 whitespace-nowrap">Fecha CXP</th>
                        <th className="p-3 whitespace-nowrap text-right text-slate-800">Total CXP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                      {excelData.slice(0, 100).map((row, idx) => {
                        const ocNo = row.ocNumber || row['Número OC'];
                        const stateOc = row.ocStatus || row['Estado OC'];
                        const dtOc = row.ocDate || row['Fecha OC'];
                        const remNum = row.remesaNumber || row['Número Remesa'];
                        const remision = row.remission || row['Remisión'];
                        const stRem = row.remissionStatus || row['Estado Remesa'];
                        const dtRem = row.remissionDate || row['Fecha Remesa'];
                        const manNum = row.manifestNumber || row['Número Manifiesto'];
                        const cliOrd = row.clientOrder || row['Orden Cliente'];
                        const obsMan = row.manifestObservations || row['Observaciones Manifiesto'];
                        const stMan = row.manifestStatus || row['Estado Manifiesto'];
                        const dtMan = row.manifestDate || row['Fecha Manifiesto'];
                        const placa = row.plate || row['Placa'];
                        const cliName = row.clientName || row['Nombre Cliente'];
                        const cliDoc = row.clientDocument || row['Documento Cliente'] || row['NIT Cliente'] || row['Nit Cliente'] || row['NIT cliente'] || row['Documento cliente'];
                        const valCxcF = row.totalValueCxcFinal || row['Valor Total CXC final'];
                        const valCxpF = row.totalValueCxpFinal || row['Valor Tot CXP final'];
                        const invCxc = row.invoiceCxc || row['Factura CXC'];
                        const recibo = row.receipt || row['Recibo'];
                        const dtInv = row.invoiceDate || row['Fecha Factura'];
                        const totCxc = row.totalCxc || row['Total CXC'];
                        const egreso = row.egress || row['Egreso'];
                        const dtCxp = row.cxpDate || row['Fecha CXP'];
                        const totCxp = row.totalCxp || row['Total CXP'];

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                            <td className="p-3 font-black text-slate-800">{ocNo || 'S/I'}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-600">
                                {stateOc || 'S/I'}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">{formatDate(dtOc)}</td>
                            <td className="p-3 font-bold">{remNum || 'S/I'}</td>
                            <td className="p-3 font-bold text-slate-800">{remision || 'S/I'}</td>
                            <td className="p-3">{stRem || 'S/I'}</td>
                            <td className="p-3 whitespace-nowrap">{formatDate(dtRem)}</td>
                            <td className="p-3 font-bold">{manNum || 'S/I'}</td>
                            <td className="p-3">{cliOrd || 'S/I'}</td>
                            <td className="p-3 truncate max-w-[120px]">{obsMan || 'S/I'}</td>
                            <td className="p-3">{stMan || 'S/I'}</td>
                            <td className="p-3 whitespace-nowrap">{formatDate(dtMan)}</td>
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-600">{placa || 'S/I'}</span>
                            </td>
                            <td className="p-3 truncate max-w-[150px] font-bold">{cliName || 'S/I'}</td>
                            <td className="p-3 font-mono text-[10px] text-slate-500">{cliDoc || '—'}</td>
                            <td className="p-3 font-bold text-right text-indigo-600">{formatMoney(valCxcF)}</td>
                            <td className="p-3 font-bold text-right text-slate-800">{formatMoney(valCxpF)}</td>
                            <td className="p-3">{invCxc || 'S/I'}</td>
                            <td className="p-3">{recibo || 'S/I'}</td>
                            <td className="p-3 whitespace-nowrap">{formatDate(dtInv)}</td>
                            <td className="p-3 font-black text-right text-indigo-600">{formatMoney(totCxc)}</td>
                            <td className="p-3">{egreso || 'S/I'}</td>
                            <td className="p-3 whitespace-nowrap">{formatDate(dtCxp)}</td>
                            <td className="p-3 font-black text-right text-slate-800">{formatMoney(totCxp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100/85 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                        <th className="p-3 whitespace-nowrap">Sede</th>
                        <th className="p-3 whitespace-nowrap">Tipo Documento</th>
                        <th className="p-3 whitespace-nowrap">Consecutivo</th>
                        <th className="p-3 whitespace-nowrap">Estado</th>
                        <th className="p-3 whitespace-nowrap">Fecha (Nueva fecha)</th>
                        <th className="p-3 whitespace-nowrap text-right">Total</th>
                        <th className="p-3 whitespace-nowrap">Nombre Tercero</th>
                        <th className="p-3 whitespace-nowrap">Documento Tercero</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                      {excelData.slice(0, 100).map((row, idx) => {
                        const sede = row.Sede || row.sede || 'S/I';
                        const tipoDoc = row['Tipo Documento'] || row.tipoDoc || 'S/I';
                        const consecutivo = row.Consecutivo || row.consecutivo || 'S/I';
                        const estado = row.Estado || row.estado || 'S/I';
                        const fechaVal = row.Fecha || row.fecha;
                        const totalVal = row.Total || row.total;
                        const nombreTercero = row['Nombre tercero'] || row['Nombre Tercero'] || row.nombreTercero || 'S/I';
                        const documentoTercero = row['Documento tercero'] || row['Documento Tercero'] || row.documentoTercero || 'S/I';

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                            <td className="p-3">{sede}</td>
                            <td className="p-3">{tipoDoc}</td>
                            <td className="p-3 font-black text-slate-800">{consecutivo}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-600">
                                {estado}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap font-bold text-indigo-600">{formatDate(fechaVal)}</td>
                            <td className="p-3 font-bold text-right text-slate-800">{formatMoney(totalVal)}</td>
                            <td className="p-3 font-bold truncate max-w-[150px]">{nombreTercero}</td>
                            <td className="p-3 font-mono">{documentoTercero}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              
              {excelData.length > 100 && (
                <p className="text-[10px] text-slate-400 p-4 border-t border-slate-100 font-black text-center uppercase tracking-wider">
                  * Mostrando las primeras 100 de {excelData.length} filas totales cargadas.
                </p>
              )}
            </div>
          )}
        </div>
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

              {/* Search and Export Row */}
              <div className="mx-6 mt-5 p-3.5 bg-slate-50/60 border border-slate-150 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={vehiclesSearchQuery}
                    onChange={(e) => setVehiclesSearchQuery(e.target.value)}
                    placeholder="Buscar por placa de vehículo..."
                    className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 bg-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  />
                  {vehiclesSearchQuery && (
                    <button
                      onClick={() => setVehiclesSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={exportVehiclesToExcel}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all active:scale-[0.98] shadow-sm self-start sm:self-auto"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Exportar a Excel
                </button>
              </div>

              {/* Table Body Container */}
              <div className="p-6 overflow-y-auto flex-1 min-h-0">
                {vehiclesData.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 uppercase tracking-wider font-bold text-xs">
                    No se encontraron registros de vehículos.
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          <th 
                            onClick={() => handleVehiclesSort('plate')}
                            className="p-3 cursor-pointer hover:bg-slate-100 select-none transition-colors"
                          >
                            <div className="flex items-center gap-1">
                              <span>Vehículo (Placa)</span>
                              {vehiclesSortField === 'plate' && (
                                <span className="text-indigo-600 font-bold text-[8px]">{vehiclesSortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleVehiclesSort('manifestCount')}
                            className="p-3 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Cantidad Manifiestos</span>
                              {vehiclesSortField === 'manifestCount' && (
                                <span className="text-indigo-600 font-bold text-[8px]">{vehiclesSortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleVehiclesSort('ventaTotal')}
                            className="p-3 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Venta</span>
                              {vehiclesSortField === 'ventaTotal' && (
                                <span className="text-indigo-600 font-bold text-[8px]">{vehiclesSortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleVehiclesSort('ingTerceros')}
                            className="p-3 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Ing Terceros</span>
                              {vehiclesSortField === 'ingTerceros' && (
                                <span className="text-indigo-600 font-bold text-[8px]">{vehiclesSortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleVehiclesSort('ingresosPropios')}
                            className="p-3 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Ingresos Propios</span>
                              {vehiclesSortField === 'ingresosPropios' && (
                                <span className="text-indigo-600 font-bold text-[8px]">{vehiclesSortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            onClick={() => handleVehiclesSort('int')}
                            className="p-3 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>INT (%)</span>
                              {vehiclesSortField === 'int' && (
                                <span className="text-indigo-600 font-bold text-[8px]">{vehiclesSortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] text-slate-600 font-medium">
                        {vehiclesData.map((v, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black text-slate-700">{v.plate}</span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold">{v.manifestCount}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">
                              {v.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-500">
                              {v.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </td>
                            <td className="p-3 text-right font-mono text-indigo-600 font-bold">
                              {v.ingresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                            </td>
                            <td className="p-3 text-right font-mono">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                v.int < 18 ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'
                              }`}>
                                {v.int.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
    </div>
  );
};

export default InformesGerenciales;
