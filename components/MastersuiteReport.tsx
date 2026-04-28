import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import { Icons } from '../constants';

interface ReportRow {
  DOCUMENT_ID: string;
  TRUCK_ID_ORIGIN: string;
  LOAD_ID: string;
  TRUCK_ID_DESTIN: string;
  DRIVER_ID_DESTIN: string;
}

const COLS: Array<keyof ReportRow> = [
  'DOCUMENT_ID', 'TRUCK_ID_ORIGIN', 'LOAD_ID', 'TRUCK_ID_DESTIN', 'DRIVER_ID_DESTIN',
];

const MastersuiteReport: React.FC = () => {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [filterDoc, setFilterDoc] = useState('');
  const [filterPlate, setFilterPlate] = useState('');

  const fetchReport = useCallback(async () => {
    if (!filterDoc.trim() && !filterPlate.trim()) {
      setError('Ingrese al menos un filtro: documento o placa.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await api.getMastersuiteReport({
        document: filterDoc.trim(),
        plate: filterPlate.trim(),
      });
      setRows(Array.isArray(data) ? data : []);
      setSearched(true);
    } catch (e: any) {
      setError(e?.message || 'Error al consultar. Intente nuevamente.');
      setRows([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [filterDoc, filterPlate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') fetchReport();
  };

  const exportExcel = () => {
    if (rows.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(rows, { header: COLS });
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `informe_mastersuite_${date}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
          <Icons.FileText className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Informe Mastersuite</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
            Gestión de última milla • <span className="text-slate-900">Origen:</span> Vehículo que trae a bodega • <span className="text-emerald-500">Destino:</span> Vehículo de reparto final
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">

          <div className="flex-1 min-w-[200px]">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Documento L / Factura
            </label>
            <div className="relative">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="text"
                placeholder="Ej: L0109, L0110..."
                value={filterDoc}
                onChange={e => { setFilterDoc(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase outline-none focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 min-w-[180px]">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Placa Origen
            </label>
            <div className="relative">
              <Icons.Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="text"
                placeholder="Ej: PUN493, ABC123..."
                value={filterPlate}
                onChange={e => { setFilterPlate(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase outline-none focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          <button
            onClick={fetchReport}
            disabled={loading}
            className="px-8 py-3 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Icons.Search className="w-4 h-4" />}
            {loading ? 'Consultando...' : 'Consultar'}
          </button>

          {rows.length > 0 && (
            <button
              onClick={exportExcel}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
            >
              <Icons.Download className="w-4 h-4" />
              Exportar Excel ({rows.length})
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-4 py-3 rounded-xl uppercase">
            <Icons.AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Resultados</span>
            {rows.length > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">
                {rows.length} registros
              </span>
            )}
          </div>
          {searched && rows.length > 0 && (
            <span className="text-[9px] text-slate-400 font-bold uppercase hidden sm:block">
              DOCUMENT_ID · TRUCK_ID_ORIGIN · LOAD_ID · TRUCK_ID_DESTIN · DRIVER_ID_DESTIN
            </span>
          )}
        </div>

        {/* Empty state — not yet searched */}
        {!searched && !loading && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Icons.FileText className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Ingrese el documento L o la placa y presione Consultar
            </p>
          </div>
        )}

        {/* Empty state — searched, no results */}
        {searched && rows.length === 0 && !loading && !error && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Icons.Package className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Sin resultados para los filtros seleccionados
            </p>
            <p className="text-[10px] text-slate-300 font-bold mt-2 uppercase">
              Verifique que el documento o la placa exista en el sistema
            </p>
          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-900">
                  {COLS.map(h => (
                    <th key={h} className="text-left px-4 py-3 font-black uppercase tracking-widest text-[10px] text-slate-300 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-50 hover:bg-emerald-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-2.5 font-black text-slate-900 uppercase whitespace-nowrap">
                      {row.DOCUMENT_ID || '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.TRUCK_ID_ORIGIN
                        ? <div className="flex flex-col">
                          <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Bodega Origen</span>
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200">{row.TRUCK_ID_ORIGIN}</span>
                        </div>
                        : <span className="text-slate-300 font-bold">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-slate-500 uppercase whitespace-nowrap">
                      {row.LOAD_ID || '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.TRUCK_ID_DESTIN
                        ? <div className="flex flex-col">
                          <span className="text-[7px] font-black text-emerald-500 uppercase mb-0.5">Reparto Destino</span>
                          <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm">{row.TRUCK_ID_DESTIN}</span>
                        </div>
                        : <div className="flex flex-col opacity-40">
                          <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Sin Asignar</span>
                          <span className="border border-dashed border-slate-300 text-slate-400 text-[9px] px-2 py-1 rounded-lg italic">Pendiente</span>
                        </div>}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-slate-600 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Identificación</span>
                        {row.DRIVER_ID_DESTIN || '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MastersuiteReport;

