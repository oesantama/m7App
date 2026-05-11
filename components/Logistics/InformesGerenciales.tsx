import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, X, Search, Calendar, Filter, 
  CheckCircle2, RefreshCw, ChevronLeft, ChevronRight, 
  FileSpreadsheet, HelpCircle, BarChart3, ChevronDown
} from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

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
  created_by: string;
  created_at: string;
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
  const [subReportTab, setSubReportTab] = useState<'estados' | 'clientes'>('estados');

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

  // Excel parsing & upload states
  const [excelData, setExcelData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hierarchical Reports state
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportData, setReportData] = useState<{ [ocStatus: string]: HierarchicalReportNode }>({});
  const [clientReportData, setClientReportData] = useState<{ [clientName: string]: ClientPlateNode }>({});
  const [reportLoading, setReportLoading] = useState(false);

  // Expanded tree states
  const [expandedOcs, setExpandedOcs] = useState<{ [key: string]: boolean }>({});
  const [expandedRemesas, setExpandedRemesas] = useState<{ [key: string]: boolean }>({});
  const [expandedManifests, setExpandedManifests] = useState<{ [key: string]: boolean }>({});
  const [expandedClients, setExpandedClients] = useState<{ [key: string]: boolean }>({});

  // Check if dates are fully selected (Both needed to query)
  const isReportDateRangeComplete = reportFromDate !== '' && reportToDate !== '';

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
  }, [page, appliedFilters, limit]);

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

        const firstRow = rawJson[0] as any;
        const keys = Object.keys(firstRow);
        const hasOcKey = keys.some(k => k.toLowerCase().replace(/ú/g, 'u').includes('numero oc') || k.toLowerCase().includes('ocnumber'));

        if (!hasOcKey) {
          toast.error('El archivo Excel no coincide con las columnas (Falta "Número OC").');
          return;
        }

        setExcelData(rawJson);
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
      const res = await (api as any).uploadManagementReports(excelData);
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

  // Helper to format dates cleanly as DD/MM/YYYY HH:MM:SS
  const formatDate = (val: any) => {
    if (!val) return 'S/I';
    const parsed = parseCustomDate(val);
    if (!parsed) return String(val);

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    const ss = String(parsed.getSeconds()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha Desde (OC) <span className="text-red-500">*</span></span>
                <input 
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => setReportFromDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha Hasta (OC) <span className="text-red-500">*</span></span>
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
              
              {/* PROFESSIONAL PIE CHARTS ROW (Side-by-side on desktop) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Chart 1: Estado OC distribution */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Distribución de Órdenes por Estado de OC</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={getOcPieData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {getOcPieData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }} 
                        itemStyle={{ color: '#fff' }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        iconType="circle"
                        formatter={(value) => <span className="text-[9px] font-black text-slate-500 uppercase">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart 2: Client distribution */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Distribución de Volumen por Nombre de Cliente</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={getClientPieData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {getClientPieData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px' }} 
                        itemStyle={{ color: '#fff' }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        iconType="circle"
                        formatter={(value) => <span className="text-[9px] font-black text-slate-500 uppercase">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

              </div>

              {/* SUB-REPORT TAB SYSTEM SWITCHER */}
              <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl gap-1 shadow-sm">
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
              ) : (
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">Fecha Desde (OC)</span>
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">Fecha Hasta (OC)</span>
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
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Número OC</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado OC</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha OC</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Remisión / Remesa</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Manifiesto</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Placa / Conductor</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Cliente</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Valor CXC</th>
                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Valor CXP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
                          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Cargando registros...</span>
                        </div>
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center">
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
                        <td className="p-4 font-black text-slate-800">{row.oc_number}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase leading-none ${
                            row.oc_status === 'COMPLETADA' || row.oc_status === 'COMPLETADO' || row.oc_status === 'CUMPLIDO' || row.oc_status === 'ENTREGADO'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {row.oc_status || 'S/I'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 whitespace-nowrap">{formatDate(row.oc_date)}</td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{row.remission || 'S/I'}</span>
                            <span className="text-[9px] text-slate-400 font-bold uppercase">Remesa: {row.remesa_number || 'S/I'}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-600">{row.manifest_number || 'S/I'}</td>
                        <td className="p-4">
                          <span className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-600 font-mono">
                            {row.plate || 'S/I'}
                          </span>
                        </td>
                        <td className="p-4 font-bold truncate max-w-[150px]">{row.client_name || 'S/I'}</td>
                        <td className="p-4 font-black text-right text-indigo-600">
                          {formatMoney(row.total_value_cxc_final || row.total_cxc)}
                        </td>
                        <td className="p-4 font-black text-right text-slate-800">
                          {formatMoney(row.total_value_cxp_final || row.total_cxp)}
                        </td>
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
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide text-center">Arrastra tu archivo formatoinforme.xlsx aquí</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">O haz clic para explorar tus archivos locales (.xlsx, .xls).</p>
              <div className="flex items-center gap-2 mt-4 bg-slate-100/60 text-slate-500 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase">
                <FileSpreadsheet size={12} />
                <span>Formato requerido de 23 columnas</span>
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
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Previsualización de Carga Gerencial ({excelData.length} registros)</h2>
                    <p className="text-[10px] text-slate-400">Verifique detenidamente las 23 columnas cargadas antes de consolidar la información.</p>
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
                <span className="text-indigo-600 bg-white px-2 py-0.5 rounded-lg border border-indigo-100">ON CONFLICT (oc_number) DO UPDATE</span>
              </div>

              {/* Responsive Scrollable Preview Table */}
              <div className="overflow-x-auto max-h-[550px]">
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
                      <th className="p-3 whitespace-nowrap text-right">Valor CXC Final</th>
                      <th className="p-3 whitespace-nowrap text-right">Valor CXP Final</th>
                      <th className="p-3 whitespace-nowrap">Factura CXC</th>
                      <th className="p-3 whitespace-nowrap">Recibo</th>
                      <th className="p-3 whitespace-nowrap">Fecha Factura</th>
                      <th className="p-3 whitespace-nowrap text-right">Total CXC</th>
                      <th className="p-3 whitespace-nowrap">Egreso</th>
                      <th className="p-3 whitespace-nowrap">Fecha CXP</th>
                      <th className="p-3 whitespace-nowrap text-right">Total CXP</th>
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
    </div>
  );
};

export default InformesGerenciales;
