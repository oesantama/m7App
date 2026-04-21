import React from 'react';
import { Icons } from '../../constants';

interface TableControlsProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  pageSize: number | 'all';
  onPageSizeChange: (size: number | 'all') => void;
  placeholder?: string;
  compact?: boolean;
  showSearch?: boolean;
  showPageSize?: boolean;
  onExport?: () => void;
}

/**
 * Componente unificado para controles de búsqueda y paginación.
 * Diseñado para ser compacto, profesional y altamente responsivo.
 */
const TableControls: React.FC<TableControlsProps> = ({
  searchValue,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  placeholder = "BUSCAR...",
  compact = false,
  showSearch = true,
  showPageSize = true,
  onExport
}) => {
  return (
    <div className={`flex flex-col md:flex-row justify-between items-center gap-4 ${showSearch ? (compact ? 'bg-slate-50/50 p-2' : 'bg-white p-4 shadow-sm') : ''} rounded-2xl border border-slate-100 transition-all hover:shadow-md`}>
      <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
        {/* Input de Búsqueda */}
        {showSearch && (
          <div className="bg-slate-50 h-10 px-4 rounded-xl flex items-center gap-3 w-full md:w-80 shadow-inner border border-slate-100 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10">
            <Icons.Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={placeholder}
              value={searchValue || ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-[10px] uppercase w-full text-slate-700 placeholder:text-slate-300 tracking-wide"
            />
          </div>
        )}

        {/* Botón Exportar */}
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-2 h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
          >
            <Icons.Download className="w-3.5 h-3.5" />
            Exportar Excel
          </button>
        )}
      </div>

      {/* Selectores de Paginación */}
      {showPageSize && (
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Mostrar:</span>
          <div className="flex gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100 shadow-sm">
            {[5, 10, 20, 50, 'all'].map((size) => (
              <button
                key={size}
                onClick={() => onPageSizeChange(size as number | 'all')}
                title={`Mostrar ${size === 'all' ? 'todos' : size} registros`}
                className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all whitespace-nowrap ${
                  pageSize === size 
                    ? 'bg-slate-900 text-white shadow-md scale-105' 
                    : 'text-slate-400 hover:text-slate-900 hover:bg-white'
                }`}
              >
                {size === 'all' ? 'Todo' : size}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TableControls;
