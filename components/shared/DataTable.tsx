import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  header: string;
  key: keyof T | string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  excelFileName?: string;
  excelSheetName?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Buscar...',
  excelFileName = 'reporte.xlsx',
  excelSheetName = 'Datos',
}: DataTableProps<T>) {
  // Búsqueda
  const [searchTerm, setSearchTerm] = useState('');

  // Ordenamiento
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Paginación
  const [pageSize, setPageSize] = useState<number | 'all'>(5);
  const [currentPage, setCurrentPage] = useState(1);

  // 1. Filtrar los datos basados en la búsqueda
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lowerSearch = searchTerm.toLowerCase();

    return data.filter((row) => {
      return Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, searchTerm]);

  // 2. Ordenar los datos filtrados
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      // Si son números
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Si son fechas válidas
      const aDate = Date.parse(aVal);
      const bDate = Date.parse(bVal);
      if (!isNaN(aDate) && !isNaN(bDate) && isNaN(Number(aVal)) && isNaN(Number(bVal))) {
        return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
      }

      // Por defecto comparar como strings
      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();

      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredData, sortKey, sortDirection]);

  // 3. Paginación de los datos ordenados
  const paginatedData = useMemo(() => {
    if (pageSize === 'all') return sortedData;
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Calcular el total de páginas
  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(sortedData.length / pageSize) || 1;
  }, [sortedData.length, pageSize]);

  // Asegurar que la página actual no quede huérfana al cambiar el tamaño de página o búsqueda
  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Manejar el cambio de orden al hacer clic en las cabeceras
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Exportación a Excel genérica
  const handleExportExcel = () => {
    // Preparar los datos mapeándolos según los headers
    const exportRows = sortedData.map((row) => {
      const exportRow: Record<string, any> = {};
      columns.forEach((col) => {
        // Ignorar la columna de "Acciones" en el reporte de Excel
        if (col.header.toLowerCase() === 'acciones' || col.header.toLowerCase() === 'accion') return;
        
        let value = row[col.key as string];
        if (value === null || value === undefined) {
          exportRow[col.header] = '—';
        } else if (typeof value === 'boolean') {
          exportRow[col.header] = value ? 'Sí' : 'No';
        } else if (typeof value === 'number') {
          exportRow[col.header] = value;
        } else {
          exportRow[col.header] = String(value);
        }
      });
      return exportRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName);
    
    // Auto-ajustar ancho de columnas
    const maxLens = exportRows.reduce<Record<string, number>>((acc, row) => {
      Object.keys(row).forEach(key => {
        acc[key] = Math.max(acc[key] || 0, String(row[key]).length);
      });
      return acc;
    }, {});
    worksheet['!cols'] = Object.keys(maxLens).map(key => ({
      wch: Math.max(key.length + 3, maxLens[key] + 2)
    }));

    XLSX.writeFile(workbook, excelFileName);
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-6 md:p-8 animate-in fade-in duration-500">
      {/* Controles de Búsqueda, Acciones y Exportar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors w-5 h-5" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Badge Total Registros */}
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total:</span>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black">
              {sortedData.length}
            </span>
          </div>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2.5 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95 transition-all"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Contenedor de la Tabla */}
      <div className="overflow-x-auto rounded-3xl border border-slate-100">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white select-none">
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                const isCurrentSort = sortKey === col.key;
                return (
                  <th
                    key={String(col.key)}
                    onClick={() => isSortable && handleSort(col.key as string)}
                    className={`px-6 py-4.5 text-xs font-black tracking-widest uppercase border-b border-slate-800 ${
                      isSortable ? 'cursor-pointer hover:bg-slate-800/55 transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {isSortable && (
                        <span className="inline-block text-slate-400">
                          {isCurrentSort ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                            )
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 opacity-30 transform rotate-90" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={row.id || rIdx}
                  className="hover:bg-slate-50/70 transition-colors group"
                >
                  {columns.map((col) => {
                    const value = row[col.key as string];
                    return (
                      <td
                        key={String(col.key)}
                        className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap"
                      >
                        {col.render ? (
                          col.render(row)
                        ) : value !== null && value !== undefined && value !== '' ? (
                          String(value)
                        ) : (
                          <span className="text-slate-300 font-bold">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-slate-400 font-medium"
                >
                  No se encontraron registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginación */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
        {/* Tamaño de Página */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ver:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value;
              setPageSize(val === 'all' ? 'all' : Number(val));
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-100 transition-all cursor-pointer"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {/* Botones de Navegación de Página */}
        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className={`p-2.5 rounded-xl border transition-all ${
                currentPage === 1
                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'
              }`}
            >
              <ChevronRight className="w-4 h-4 transform rotate-180" />
            </button>

            <span className="px-4 text-xs font-bold text-slate-500">
              Página {currentPage} de {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className={`p-2.5 rounded-xl border transition-all ${
                currentPage === totalPages
                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
