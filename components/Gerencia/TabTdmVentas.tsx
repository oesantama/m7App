import React from 'react';
import {
  Search, HelpCircle, Download, Truck, Camera, FileSpreadsheet
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts';
import { DataTable, ColumnDef } from '../shared/DataTable';

const CHART_COLORS = [
  '#6366f1',
  '#ec4899',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#3b82f6',
  '#f43f5e',
];

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

interface TdmFlotaRow {
  manifiesto?: string;
  fecha_operacion?: string;
  remesa?: string;
  valor_cobrar?: number | string;
  valor_pagar?: number | string;
  ciudad_origen?: string;
  ciudad_destino?: string;
  placa?: string;
  client_name?: string;
  [key: string]: any;
}

interface TabTdmVentasProps {
  reportRecords: ManagementOrder[];
  reportFromDate: string;
  reportToDate: string;
  managementClients: string[];
  vehicles: any[];
  clients: any[];
  provClientes: any[];
  pdfGenerating: boolean;
  downloadAsImage: (elementId: string, filename: string) => Promise<void>;
  rightChartLimit: 'top10' | 'all';
  setRightChartLimit: (v: 'top10' | 'all') => void;
  rightChartGroupBy: 'oc' | 'manifiesto';
  setRightChartGroupBy: (v: 'oc' | 'manifiesto') => void;
  tdmSearchQuery: string;
  setTdmSearchQuery: (v: string) => void;
  tdmSortField: string;
  setTdmSortField: (v: any) => void;
  tdmSortDirection: 'asc' | 'desc';
  setTdmSortDirection: (v: 'asc' | 'desc') => void;
  selectedClientForVehiclesInt: string | null;
  setSelectedClientForVehiclesInt: (v: string | null) => void;
  selectedVehicleManifests: any | null;
  setSelectedVehicleManifests: (v: any | null) => void;
  selectedClientForVehiclesFactMes: string | null;
  setSelectedClientForVehiclesFactMes: (v: string | null) => void;
  selectedVehicleManifestsFact: any | null;
  setSelectedVehicleManifestsFact: (v: any | null) => void;
  vehiclesSearchQuery: string;
  setVehiclesSearchQuery: (v: string) => void;
  vehiclesSortField: string;
  setVehiclesSortField: (v: any) => void;
  vehiclesSortDirection: 'asc' | 'desc';
  setVehiclesSortDirection: (v: 'asc' | 'desc') => void;
  isExportingGeneral: boolean;
  setIsExportingGeneral: (v: boolean) => void;
  isExportingTdm: boolean;
  setIsExportingTdm: (v: boolean) => void;
  selectedPendingManifests: { title: string; manifests: any[] } | null;
  setSelectedPendingManifests: (v: any | null) => void;
  selectedClientChartName: string | null;
  setSelectedClientChartName: (v: string | null) => void;
  formatMoney: (val: any) => string;
  formatDate: (val: any) => string;
  formatColombianDateStr: (val: any) => string;
  parseValNum: (val: any) => number;
  parseCustomDate: (val: any) => Date | null;
  getClientTdmTableData: () => any[];
  getGeneralTdmTableData: () => any[];
  getVehiclesIntDetails: () => any[];
  getVehiclesFactMesDetails: () => any[];
  exportGeneralTdmToExcel: () => void;
  exportTdmToExcel: () => void;
  getOcBarDataByMonth: () => { data: any[]; statuses: string[] };
  getDynamicClientBarData: (groupBy: 'oc' | 'manifiesto', limitMode: 'top10' | 'all') => { data: any[]; statuses: string[] };
  SalesPieChart: React.FC<{ data: { client: string; ventaTotal: number }[] }>;
  tdmFlotaRows: TdmFlotaRow[];
}

export const TabTdmVentas: React.FC<TabTdmVentasProps> = ({
  reportRecords,
  pdfGenerating,
  downloadAsImage,
  rightChartLimit,
  setRightChartLimit,
  rightChartGroupBy,
  setRightChartGroupBy,
  tdmSearchQuery,
  setTdmSearchQuery,
  tdmSortField,
  setTdmSortField,
  tdmSortDirection,
  setTdmSortDirection,
  selectedClientForVehiclesInt,
  setSelectedClientForVehiclesInt,
  selectedClientForVehiclesFactMes,
  setSelectedClientForVehiclesFactMes,
  isExportingGeneral,
  isExportingTdm,
  selectedClientChartName,
  setSelectedClientChartName,
  formatMoney,
  formatDate: _formatDate,
  parseValNum,
  getClientTdmTableData,
  getGeneralTdmTableData,
  exportGeneralTdmToExcel,
  exportTdmToExcel,
  getOcBarDataByMonth,
  getDynamicClientBarData,
  SalesPieChart,
  tdmFlotaRows,
}) => {
  const handleTdmSort = (field: typeof tdmSortField) => {
    if (tdmSortField === field) {
      setTdmSortDirection(tdmSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setTdmSortField(field);
      setTdmSortDirection('desc');
    }
  };

  const ocBarData = getOcBarDataByMonth();
  const clientBarData = getDynamicClientBarData(rightChartGroupBy, rightChartLimit);

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
    item.uniquePlates.forEach((p: string) => allGeneralPlates.add(p));
    item.workedDates.forEach((d: string) => allGeneralDates.add(d));
    item.vehicleDays.forEach((vd: string) => allGeneralVehicleDays.add(vd));
  });
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
    item.uniquePlates.forEach((p: string) => allSummaryPlates.add(p));
    item.workedDates.forEach((d: string) => allSummaryDates.add(d));
    item.vehicleDays.forEach((vd: string) => allSummaryVehicleDays.add(vd));
  });
  const totalSummaryWorkedDaysCount = allSummaryDates.size;
  const totalSummaryVehicleUtilizationsCount = allSummaryVehicleDays.size;
  const overallSummaryAverageVehiclesPerDay = totalSummaryWorkedDaysCount > 0 ? totalSummaryVehicleUtilizationsCount / totalSummaryWorkedDaysCount : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* CHARTS ROW */}
      {(() => {
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
                        <LabelList dataKey={status} position="top" fill="#475569" fontSize={8} fontWeight="bold" formatter={(val: any) => Number(val) > 0 ? val : ''} />
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
                            <LabelList dataKey={status} position="inside" fill="#fff" fontSize={8} fontWeight="black" formatter={(val: any) => Number(val) > 0 ? val : ''} />
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

      {/* TABLES */}
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
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900">{row.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono text-slate-600">{row.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono text-indigo-600 font-bold">{row.ingresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-black">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${row.int < 18 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>{row.int.toFixed(1)}%</span>
                              <button onClick={() => setSelectedClientForVehiclesInt(row.clientName)} title="Ver detalle de vehículos que afectaron el INT" className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"><Truck className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700">{Math.round(row.participation)}%</td>
                          <td className="p-3.5 text-right font-mono text-slate-600 font-bold">{row.invoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-black">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${row.invoicedSameMonthPct < 60 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>{row.invoicedSameMonthPct.toFixed(1)}%</span>
                              <button onClick={() => setSelectedClientForVehiclesFactMes(row.clientName)} title="Ver detalle de facturación por mes" className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Truck className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averagePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-indigo-600/85">{row.averageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-violet-600/85">{row.averageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900">{row.receivedValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-amber-700">{row.receivedDiffMonth.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-black"><span className={`px-2 py-0.5 rounded text-[10px] ${row.receivedPct < 60 ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>{row.receivedPct.toFixed(1)}%</span></td>
                          <td className="p-3.5 text-right font-mono text-slate-600 font-bold">{row.workedDaysCount}</td>
                          <td className="p-3.5 text-right font-mono text-violet-600 font-bold">{row.totalVehicleUtilizations}</td>
                          <td className="p-3.5 text-right font-mono text-indigo-600 font-black">{row.averageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 border-t-2 border-slate-200 font-black text-slate-900 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.02)] group">
                        <td className="p-3.5 text-[10px] uppercase tracking-wider sticky left-0 z-30 bg-slate-100 border-r border-slate-200/60">Total General</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-950">{totalGeneralVenta.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-slate-800">{totalGeneralIngTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700 font-bold">{totalGeneralIngresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700"><span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">{overallGeneralInt.toFixed(1)}%</span></td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">100%</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">{totalGeneralInvoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700 font-black">{overallGeneralInvoicedSameMonthPct.toFixed(1)}%</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">{overallGeneralAveragePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700/90 font-black">{overallGeneralAverageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono text-violet-700/90 font-black">{overallGeneralAverageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">{overallGeneralAverageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-950 font-black">{totalGeneralReceivedValueVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-amber-800 font-black">{totalGeneralReceivedDiffMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black"><span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">{overallGeneralReceivedPct.toFixed(1)}%</span></td>
                        <td className="p-3.5 text-right font-mono text-slate-800">{totalGeneralWorkedDaysCount}</td>
                        <td className="p-3.5 text-right font-mono text-violet-700">{totalGeneralVehicleUtilizationsCount}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700">{overallGeneralAverageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          {filteredGeneralData.length > 0 && (
            <div className="px-6 pb-6 pt-0">
              <div id="chart-pie-ventas-general" className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center justify-center w-full shadow-xs mt-0 relative">
                <div className="w-full flex justify-between items-start absolute top-4 left-0 px-6">
                  <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Distribución y Participación de Venta</h4>
                  <button onClick={() => downloadAsImage('chart-pie-ventas-general', 'Distribucion_Ventas_General.png')} className="bg-white hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg transition-all border border-slate-200" title="Descargar Gráfica como Imagen"><Camera size={14} /></button>
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
                  <span className="bg-indigo-50 border border-indigo-100/50 text-indigo-700 px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono">FECHA MANIFIESTO</span>
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
                    <button type="button" onClick={() => setTdmSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs">×</button>
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
              <div className="p-8 text-center text-slate-400 font-bold text-xs">No se encontraron clientes que coincidan con la búsqueda.</div>
            ) : (
              <div className="flex flex-col gap-8 p-6">
                <div className="overflow-x-auto overflow-y-auto max-h-[65vh] custom-scrollbar relative">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-blue-200 bg-blue-50 text-[9px] font-black uppercase tracking-wider text-blue-800 sticky top-0 z-20 shadow-sm">
                        <th onClick={() => handleTdmSort('clientName')} className="p-3.5 cursor-pointer hover:bg-blue-100 select-none transition-colors sticky left-0 z-30 bg-blue-50 border-r border-blue-100/50">
                          <div className="flex items-center gap-1"><span>Cliente</span>{tdmSortField === 'clientName' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div>
                        </th>
                        <th onClick={() => handleTdmSort('ventaTotal')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Venta</span>{tdmSortField === 'ventaTotal' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('ingTerceros')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Ing Terceros</span>{tdmSortField === 'ingTerceros' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('ingresosPropios')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Ingresos Propios</span>{tdmSortField === 'ingresosPropios' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('int')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>INT</span>{tdmSortField === 'int' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('participation')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Part-vta</span>{tdmSortField === 'participation' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('invoicedSameMonthVal')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Vl fact mes</span>{tdmSortField === 'invoicedSameMonthVal' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('invoicedSameMonthPct')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>% Fact. Mes</span>{tdmSortField === 'invoicedSameMonthPct' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('averagePaymentDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Factura"><div className="flex flex-col items-end justify-center gap-1"><div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dia fact <HelpCircle size={14} className="text-slate-400" /></div>{tdmSortField === 'averagePaymentDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('averageRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Factura hasta Recibo"><div className="flex flex-col items-end justify-center gap-1"><div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dias rec <HelpCircle size={14} className="text-slate-400" /></div>{tdmSortField === 'averageRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('averageEgrDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Egreso"><div className="flex flex-col items-end justify-center gap-1"><div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dias egreso <HelpCircle size={14} className="text-slate-400" /></div>{tdmSortField === 'averageEgrDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('averageManRecDays')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors" title="Promedio de días desde Manifiesto hasta Recibo"><div className="flex flex-col items-end justify-center gap-1"><div className="uppercase flex items-center justify-end gap-1 text-center text-xs">prom dia man recibido <HelpCircle size={14} className="text-slate-400" /></div>{tdmSortField === 'averageManRecDays' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('receivedValue')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Vl Rec Mismo Mes</span>{tdmSortField === 'receivedValue' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('receivedDiffMonth')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Vl Rec Dif Mes</span>{tdmSortField === 'receivedDiffMonth' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('receivedPct')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>% Recibido</span>{tdmSortField === 'receivedPct' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('workedDaysCount')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Días Lab.</span>{tdmSortField === 'workedDaysCount' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('totalVehicleUtilizations')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>Veh. prom mes</span>{tdmSortField === 'totalVehicleUtilizations' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                        <th onClick={() => handleTdmSort('averageVehiclesPerDay')} className="p-3.5 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"><div className="flex items-center justify-end gap-1"><span>veh Prom. Día</span>{tdmSortField === 'averageVehiclesPerDay' && <span className="text-indigo-600 font-bold text-[8px]">{tdmSortDirection === 'asc' ? '▲' : '▼'}</span>}</div></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {filteredSummaryData.map((row, index) => (
                        <tr key={index} className="group hover:bg-slate-50/60 transition-colors">
                          <td className="p-3.5 font-bold text-slate-800 uppercase tracking-tight sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">{row.clientName}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900">{row.ventaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono text-slate-600">{row.ingTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono text-indigo-600 font-bold">{row.ingresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-black">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${row.int < 18 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>{row.int.toFixed(1)}%</span>
                              <button onClick={() => setSelectedClientForVehiclesInt(row.clientName)} title="Ver detalle de vehículos que afectaron el INT" className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"><Truck className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700">{Math.round(row.participation)}%</td>
                          <td className="p-3.5 text-right font-mono text-slate-600 font-bold">{row.invoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-black">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${row.invoicedSameMonthPct < 60 ? 'bg-red-100 text-red-600 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>{row.invoicedSameMonthPct.toFixed(1)}%</span>
                              <button onClick={() => setSelectedClientForVehiclesFactMes(row.clientName)} title="Ver detalle de facturación por mes" className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Truck className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averagePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-indigo-600/85">{row.averageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-violet-600/85">{row.averageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-700">{row.averageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900">{row.receivedValue.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-amber-700">{row.receivedDiffMonth.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                          <td className="p-3.5 text-right font-mono font-black"><span className={`px-2 py-0.5 rounded text-[10px] ${row.receivedPct < 60 ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-emerald-50 text-emerald-600'}`}>{row.receivedPct.toFixed(1)}%</span></td>
                          <td className="p-3.5 text-right font-mono text-slate-600 font-bold">{row.workedDaysCount}</td>
                          <td className="p-3.5 text-right font-mono text-violet-600 font-bold">{row.totalVehicleUtilizations}</td>
                          <td className="p-3.5 text-right font-mono text-indigo-600 font-black">{row.averageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 border-t-2 border-slate-200 font-black text-slate-900 sticky bottom-0 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.02)] group">
                        <td className="p-3.5 text-[10px] uppercase tracking-wider sticky left-0 z-30 bg-slate-100 border-r border-slate-200/60">Total General</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-950">{totalSummaryVenta.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-slate-800">{totalSummaryIngTerceros.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700 font-bold">{totalSummaryIngresosPropios.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700"><span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">{overallSummaryInt.toFixed(1)}%</span></td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">100%</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">{totalSummaryInvoicedSameMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700 font-black">{overallSummaryInvoicedSameMonthPct.toFixed(1)}%</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">{overallSummaryAveragePaymentDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700/90 font-black">{overallSummaryAverageRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono text-violet-700/90 font-black">{overallSummaryAverageEgrDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black">{overallSummaryAverageManRecDays.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-950 font-black">{totalSummaryReceivedValueVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-amber-800 font-black">{totalSummaryReceivedDiffMonthVal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}</td>
                        <td className="p-3.5 text-right font-mono text-slate-950 font-black"><span className="px-2.5 py-0.5 bg-indigo-100 rounded text-[10px] font-black font-mono">{overallSummaryReceivedPct.toFixed(1)}%</span></td>
                        <td className="p-3.5 text-right font-mono text-slate-800">{totalSummaryWorkedDaysCount}</td>
                        <td className="p-3.5 text-right font-mono text-violet-700">{totalSummaryVehicleUtilizationsCount}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-700">{overallSummaryAverageVehiclesPerDay.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          {filteredSummaryData.length > 0 && (
            <div className="px-6 pb-6 pt-0">
              <div id="chart-pie-ventas-resumen" className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center justify-center w-full shadow-xs mt-0 relative">
                <div className="w-full flex justify-between items-start absolute top-4 left-0 px-6">
                  <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Distribución y Participación de Venta</h4>
                  <button onClick={() => downloadAsImage('chart-pie-ventas-resumen', 'Distribucion_Ventas_Resumen.png')} className="bg-white hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg transition-all border border-slate-200" title="Descargar Gráfica como Imagen"><Camera size={14} /></button>
                </div>
                <div className="mt-8">
                  <SalesPieChart data={filteredSummaryData.map(item => ({ client: item.clientName, ventaTotal: item.ventaTotal }))} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── SECCIÓN: Operaciones Flota Manual (TDM) ─── */}
      {tdmFlotaRows.length > 0 && (() => {
        const totalManifiestos = tdmFlotaRows.length;
        const totalCobrar = tdmFlotaRows.reduce((s, r) => s + (parseValNum(r.valor_cobrar)), 0);
        const totalPagar = tdmFlotaRows.reduce((s, r) => s + (parseValNum(r.valor_pagar)), 0);
        const margenGlobal = totalCobrar - totalPagar;

        const byClient: Record<string, { manifiestos: number; cobrar: number; pagar: number }> = {};
        tdmFlotaRows.forEach(r => {
          const k = r.client_name || 'S/I';
          if (!byClient[k]) byClient[k] = { manifiestos: 0, cobrar: 0, pagar: 0 };
          byClient[k].manifiestos++;
          byClient[k].cobrar += parseValNum(r.valor_cobrar);
          byClient[k].pagar += parseValNum(r.valor_pagar);
        });

        const byRuta: Record<string, { manifiestos: number; cobrar: number; pagar: number }> = {};
        tdmFlotaRows.forEach(r => {
          const k = `${r.ciudad_origen || 'S/I'} → ${r.ciudad_destino || 'S/I'}`;
          if (!byRuta[k]) byRuta[k] = { manifiestos: 0, cobrar: 0, pagar: 0 };
          byRuta[k].manifiestos++;
          byRuta[k].cobrar += parseValNum(r.valor_cobrar);
          byRuta[k].pagar += parseValNum(r.valor_pagar);
        });

        const byPlaca: Record<string, { manifiestos: number; cobrar: number; pagar: number }> = {};
        tdmFlotaRows.forEach(r => {
          const k = r.placa || 'S/I';
          if (!byPlaca[k]) byPlaca[k] = { manifiestos: 0, cobrar: 0, pagar: 0 };
          byPlaca[k].manifiestos++;
          byPlaca[k].cobrar += parseValNum(r.valor_cobrar);
          byPlaca[k].pagar += parseValNum(r.valor_pagar);
        });

        const clientRows = Object.entries(byClient).map(([k, v]) => ({ cliente: k, ...v, margen: v.cobrar - v.pagar }));
        const rutaRows = Object.entries(byRuta).map(([k, v]) => ({ ruta: k, ...v }));
        const placaRows = Object.entries(byPlaca).map(([k, v]) => ({ placa: k, ...v }));

        return (
          <div className="space-y-6 mt-8 border-t border-slate-200 pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
                <Truck size={18} />
              </div>
              <div>
                <span className="text-[9px] font-black tracking-widest text-orange-600 uppercase font-mono">Flota Manual TDM</span>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Operaciones Flota Manual (TDM)</h3>
              </div>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Manifiestos', value: totalManifiestos.toLocaleString('es-CO'), color: 'text-indigo-600' },
                { label: 'Total Cobrar', value: formatMoney(totalCobrar), color: 'text-emerald-600' },
                { label: 'Total Pagar', value: formatMoney(totalPagar), color: 'text-rose-600' },
                { label: 'Margen Global', value: formatMoney(margenGlobal), color: margenGlobal >= 0 ? 'text-emerald-600' : 'text-rose-600' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">{kpi.label}</span>
                  <span className={`text-sm font-black block mt-1 ${kpi.color}`}>{kpi.value}</span>
                </div>
              ))}
            </div>

            {/* DataTable: Por Cliente */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h4 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Por Cliente</h4>
              </div>
              <div className="p-4">
                <DataTable
                  data={clientRows}
                  columns={[
                    { header: 'Cliente', key: 'cliente', sortable: true },
                    { header: 'Manifiestos', key: 'manifiestos', sortable: true },
                    { header: 'V. Cobrar', key: 'cobrar', sortable: true, render: (row: any) => formatMoney(row.cobrar) },
                    { header: 'V. Pagar', key: 'pagar', sortable: true, render: (row: any) => formatMoney(row.pagar) },
                    { header: 'Margen', key: 'margen', sortable: true, render: (row: any) => <span className={row.margen >= 0 ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>{formatMoney(row.margen)}</span> },
                  ] as ColumnDef<any>[]}
                  excelFileName="TDM_Flota_Por_Cliente.xlsx"
                  searchPlaceholder="Buscar cliente..."
                />
              </div>
            </div>

            {/* DataTable: Por Ruta */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h4 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Por Ruta</h4>
              </div>
              <div className="p-4">
                <DataTable
                  data={rutaRows}
                  columns={[
                    { header: 'Ruta', key: 'ruta', sortable: true },
                    { header: 'Manifiestos', key: 'manifiestos', sortable: true },
                    { header: 'V. Cobrar', key: 'cobrar', sortable: true, render: (row: any) => formatMoney(row.cobrar) },
                    { header: 'V. Pagar', key: 'pagar', sortable: true, render: (row: any) => formatMoney(row.pagar) },
                  ] as ColumnDef<any>[]}
                  excelFileName="TDM_Flota_Por_Ruta.xlsx"
                  searchPlaceholder="Buscar ruta..."
                />
              </div>
            </div>

            {/* DataTable: Por Placa */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h4 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Por Placa</h4>
              </div>
              <div className="p-4">
                <DataTable
                  data={placaRows}
                  columns={[
                    { header: 'Placa', key: 'placa', sortable: true },
                    { header: 'Manifiestos', key: 'manifiestos', sortable: true },
                    { header: 'V. Cobrar', key: 'cobrar', sortable: true, render: (row: any) => formatMoney(row.cobrar) },
                    { header: 'V. Pagar', key: 'pagar', sortable: true, render: (row: any) => formatMoney(row.pagar) },
                  ] as ColumnDef<any>[]}
                  excelFileName="TDM_Flota_Por_Placa.xlsx"
                  searchPlaceholder="Buscar placa..."
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
