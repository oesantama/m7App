import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  header: string;
  key: keyof T | string;
  sortable?: boolean;
  noWrap?: boolean;
  minWidth?: string;
  maxWidth?: string;
  render?: (row: T) => React.ReactNode;
  exportRender?: (row: T) => any;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  excelFileName?: string;
  excelSheetName?: string;
  onExportExcel?: (exportRows: Record<string, any>[], sortedData: T[]) => void;
  renderExpandedRow?: (row: T) => React.ReactNode;
  
  // Opciones de Server-Side
  serverSide?: boolean;
  totalRows?: number;
  currentPage?: number;
  pageSize?: number | 'all';
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number | 'all') => void;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  onSearch?: (term: string) => void;
  loading?: boolean;
  hideTopControls?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Buscar...',
  excelFileName = 'reporte.xlsx',
  excelSheetName = 'Datos',
  onExportExcel,
  renderExpandedRow,
  serverSide = false,
  totalRows,
  currentPage: externalCurrentPage,
  pageSize: externalPageSize,
  onPageChange,
  onPageSizeChange,
  onSort,
  onSearch,
  loading = false,
  hideTopControls = false,
}: DataTableProps<T>) {
  // Búsqueda
  const [searchTerm, setSearchTerm] = useState('');

  // Ordenamiento
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Paginación
  const [pageSize, setPageSize] = useState<number | 'all'>(5);
  const [currentPage, setCurrentPage] = useState(1);

  // Estado real usando props externos si existen
  const actualCurrentPage = serverSide && externalCurrentPage !== undefined ? externalCurrentPage : currentPage;
  const actualPageSize = serverSide && externalPageSize !== undefined ? externalPageSize : pageSize;

  // 1. Filtrar los datos basados en la búsqueda
  const filteredData = useMemo(() => {
    if (serverSide) return data; // Si es serverSide, los datos ya vienen filtrados
    if (!searchTerm.trim()) return data;
    const lowerSearch = searchTerm.toLowerCase();

    return data.filter((row) => {
      return Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, searchTerm, serverSide]);

  // 2. Ordenar los datos filtrados
  const sortedData = useMemo(() => {
    if (serverSide) return filteredData; // Si es serverSide, los datos ya vienen ordenados
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
  }, [filteredData, sortKey, sortDirection, serverSide]);

  // 3. Paginación de los datos ordenados
  const paginatedData = useMemo(() => {
    if (serverSide) return sortedData; // Si es serverSide, los datos ya vienen paginados
    if (actualPageSize === 'all') return sortedData;
    const startIndex = (actualCurrentPage - 1) * actualPageSize;
    return sortedData.slice(startIndex, startIndex + actualPageSize);
  }, [sortedData, actualCurrentPage, actualPageSize, serverSide]);

  // Calcular el total de páginas
  const totalPages = useMemo(() => {
    if (actualPageSize === 'all') return 1;
    if (serverSide && totalRows !== undefined) return Math.ceil(totalRows / (actualPageSize as number)) || 1;
    return Math.ceil(sortedData.length / (actualPageSize as number)) || 1;
  }, [sortedData.length, actualPageSize, serverSide, totalRows]);

  // Asegurar que la página actual no quede huérfana al cambiar el tamaño de página o búsqueda
  React.useEffect(() => {
    if (!serverSide && actualCurrentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, actualCurrentPage, serverSide]);

  // Manejar el cambio de orden al hacer clic en las cabeceras
  const handleSort = (key: string) => {
    let newDirection: 'asc' | 'desc' = 'asc';
    let newKey: string | null = key;

    if (sortKey === key) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else {
        newKey = null;
      }
    }

    setSortKey(newKey);
    setSortDirection(newDirection);

    if (serverSide) {
      if (onSort) onSort(newKey || '', newDirection);
    } else {
      setCurrentPage(1);
    }
  };

  // Exportación a Excel genérica
  const handleExportExcel = () => {
    // Preparar los datos mapeándolos según los headers
    const exportRows = sortedData.map((row) => {
      const exportRow: Record<string, any> = {};
      columns.forEach((col) => {
        // Ignorar la columna de "Acciones" en el reporte de Excel
        if (col.header.toLowerCase() === 'acciones' || col.header.toLowerCase() === 'accion' || col.header === '') return;
        
        if (col.exportRender) {
          exportRow[col.header] = col.exportRender(row);
        } else {
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
        }
      });
      return exportRow;
    });

    if (onExportExcel) {
      onExportExcel(exportRows, sortedData);
      return;
    }

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

  // Estado para filas expandidas
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

  const toggleRow = (id: string | number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-6 md:p-8 animate-in fade-in duration-500">
      {/* Controles de Búsqueda, Acciones y Exportar */}
      {!hideTopControls && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors w-5 h-5" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              if (serverSide && onSearch) {
                onSearch(val);
              } else {
                setCurrentPage(1);
              }
            }}
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Badge Total Registros */}
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total:</span>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black">
              {serverSide && totalRows !== undefined ? totalRows : sortedData.length}
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
      )}

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
                    className={`px-6 py-4.5 text-xs font-black tracking-widest uppercase border-b border-slate-800 whitespace-nowrap ${
                      isSortable ? 'cursor-pointer hover:bg-slate-800/55 transition-colors' : ''
                    }`}
                    style={col.minWidth ? { minWidth: col.minWidth } : undefined}
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
          <tbody className="divide-y divide-slate-100 relative">
            {loading && (
              <tr>
                <td colSpan={columns.length} className="p-0 border-0 h-1">
                  <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 animate-pulse w-1/3"></div>
                  </div>
                </td>
              </tr>
            )}
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rIdx) => {
                const rowId = row.id || rIdx;
                const isExpanded = expandedRows.has(rowId);
                return (
                  <React.Fragment key={rowId}>
                    <tr
                      className={`hover:bg-slate-50/70 transition-colors group ${renderExpandedRow ? 'cursor-pointer' : ''}`}
                      onClick={() => renderExpandedRow && toggleRow(rowId)}
                    >
                      {columns.map((col) => {
                        const value = row[col.key as string];
                        return (
                          <td
                            key={String(col.key)}
                            className={`px-6 py-4 text-sm text-slate-600 font-medium align-top ${col.noWrap ? 'whitespace-nowrap' : 'break-words'}`}
                            style={{
                              ...(col.minWidth ? { minWidth: col.minWidth } : {}),
                              ...(col.maxWidth ? { maxWidth: col.maxWidth, wordBreak: 'break-word' } : {}),
                            }}
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
                    {renderExpandedRow && isExpanded && (
                      <tr>
                        <td colSpan={columns.length} className="bg-slate-50 border-b-2 border-slate-200 p-0">
                          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            {renderExpandedRow(row)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
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
            value={actualPageSize}
            onChange={(e) => {
              const val = e.target.value;
              const newSize = val === 'all' ? 'all' : Number(val);
              setPageSize(newSize);
              if (serverSide && onPageSizeChange) {
                onPageSizeChange(newSize);
              } else {
                setCurrentPage(1);
              }
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
        {actualPageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const newPage = Math.max(actualCurrentPage - 1, 1);
                setCurrentPage(newPage);
                if (serverSide && onPageChange) onPageChange(newPage);
              }}
              disabled={actualCurrentPage === 1}
              className={`p-2.5 rounded-xl border transition-all ${
                actualCurrentPage === 1
                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'
              }`}
            >
              <ChevronRight className="w-4 h-4 transform rotate-180" />
            </button>

            <span className="px-4 text-xs font-bold text-slate-500">
              Página {actualCurrentPage} de {totalPages}
            </span>

            <button
              onClick={() => {
                const newPage = Math.min(actualCurrentPage + 1, totalPages);
                setCurrentPage(newPage);
                if (serverSide && onPageChange) onPageChange(newPage);
              }}
              disabled={actualCurrentPage === totalPages}
              className={`p-2.5 rounded-xl border transition-all ${
                actualCurrentPage === totalPages
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
