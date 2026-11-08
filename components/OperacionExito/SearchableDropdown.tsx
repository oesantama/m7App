import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

export interface SearchableDropdownProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  theme?: 'dark' | 'light';
  disabled?: boolean;
  className?: string;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccione...',
  searchPlaceholder = 'Buscar...',
  theme = 'dark',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)) ||
        (o.badge && o.badge.toLowerCase().includes(q))
    );
  }, [options, search]);

  const isDark = theme === 'dark';

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition focus:outline-none ${
          isDark
            ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-750 focus:ring-2 focus:ring-emerald-400'
            : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="truncate flex-1">
          {selected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className={`text-xs font-black truncate ${isDark && selected.value ? 'text-amber-300' : ''}`}>
                {selected.label}
              </span>
              {selected.sublabel && (
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  · {selected.sublabel}
                </span>
              )}
            </div>
          ) : (
            <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${isDark ? 'text-slate-400' : 'text-slate-500'} ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-[100] left-0 right-0 mt-1.5 rounded-2xl shadow-2xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}
          style={{ minWidth: '100%' }}
        >
          <div className={`p-2 border-b ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
            <div className="relative flex items-center">
              <Search className={`w-3.5 h-3.5 absolute left-3 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={`w-full h-8 pl-8 pr-7 text-xs font-bold rounded-lg border focus:outline-none ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-emerald-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                }`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-transparent p-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs font-bold text-slate-400">
                No se encontraron opciones para "{search}"
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between gap-2 text-xs transition ${
                      isSelected
                        ? isDark
                          ? 'bg-emerald-500/20 text-emerald-300 font-black'
                          : 'bg-indigo-50 text-indigo-900 font-black'
                        : isDark
                        ? 'text-slate-200 hover:bg-slate-800'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-bold truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {opt.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${
                          isDark
                            ? 'bg-slate-800 text-amber-300 border border-slate-700'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

