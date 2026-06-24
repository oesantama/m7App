import React from 'react';
import { Search, FileSpreadsheet } from 'lucide-react';
import { DataTable } from '../shared/DataTable';

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

interface TabConsultasProps {
  records: ManagementOrder[];
  total: number;
  loading: boolean;
  page: number;
  setPage: (v: number) => void;
  limit: number;
  setLimit: (v: number) => void;
  filters: { ocNumber: string; manifestNumber: string; plate: string; clientName: string; fromDate: string; toDate: string; };
  setFilters: (v: any) => void;
  setAppliedFilters: (v: any) => void;
  handleConsultasSort: (field: string) => void;
  handleExportToExcel: () => void;
  columnsConfig: any[];
  formatDate: (val: any) => string;
  formatMoney: (val: any) => string;
}

export const TabConsultas: React.FC<TabConsultasProps> = ({
  records,
  total,
  loading,
  page,
  setPage,
  limit,
  setLimit,
  filters,
  setFilters,
  setAppliedFilters,
  handleConsultasSort,
  handleExportToExcel,
  columnsConfig,
}) => {
  return (
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
                setFilters((prev: any) => ({ ...prev, fromDate: val }));
                setAppliedFilters((prev: any) => ({ ...prev, fromDate: val }));
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
                setFilters((prev: any) => ({ ...prev, toDate: val }));
                setAppliedFilters((prev: any) => ({ ...prev, toDate: val }));
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
            />
          </div>

          {(filters.fromDate || filters.toDate) && (
            <button
              type="button"
              onClick={() => {
                setFilters((prev: any) => ({ ...prev, fromDate: '', toDate: '' }));
                setAppliedFilters((prev: any) => ({ ...prev, fromDate: '', toDate: '' }));
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
                setFilters((prev: any) => ({ ...prev, ocNumber: val }));
                setAppliedFilters((prev: any) => ({ ...prev, ocNumber: val }));
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
      <DataTable
        columns={columnsConfig.map((c: any) => ({
          header: c.label,
          key: c.key,
          render: (row: any) => c.render(row as ManagementOrder)
        }))}
        data={records}
        serverSide={true}
        totalRows={total}
        currentPage={page}
        pageSize={limit}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => setLimit(newSize as number)}
        onSort={(key, _dir) => {
          handleConsultasSort(key);
        }}
        loading={loading}
        hideTopControls={true}
      />
    </div>
  );
};
