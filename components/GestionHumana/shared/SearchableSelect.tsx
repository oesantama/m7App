import React, { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectProps {
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedOpt = options.find(o => o.value.toString() === value?.toString());

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    setSearch('');
  };

  return (
    <div className="relative w-full">
      <div 
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer focus-within:ring-2 focus-within:ring-slate-900 ${disabled ? 'bg-slate-50 opacity-60 cursor-not-allowed text-slate-400' : 'text-slate-700'}`}
      >
        <span className={`text-xs font-semibold ${selectedOpt ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-60 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50 shrink-0">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-xs font-bold text-slate-700 uppercase"
              />
            </div>
            
            <div className="overflow-y-auto custom-scrollbar flex-1 max-h-48">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Sin resultados
                </div>
              ) : (
                filteredOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value.toString());
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold uppercase transition-colors block ${opt.value.toString() === value?.toString() ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SearchableSelect;
