import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../../constants';

interface Option {
  id: string | number;
  nombre: string;
}

interface Props {
  options: Option[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

const SearchableSelect: React.FC<Props> = ({ options, value, onChange, placeholder = 'Seleccione...', label, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => 
    o.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-1.5 w-full relative" ref={containerRef}>
      {label && <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">{label}</label>}
      
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full h-12 px-4 rounded-2xl bg-slate-50 border transition-all flex items-center justify-between cursor-pointer ${isOpen ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={`text-[11px] font-bold uppercase truncate ${selectedOption ? 'text-slate-900' : 'text-slate-400'}`}>
          {selectedOption ? selectedOption.nombre : placeholder}
        </span>
        <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-2 bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 border-b border-slate-50">
            <div className="bg-slate-50 h-10 px-3 rounded-xl flex items-center gap-2 border border-slate-100">
              <Icons.Search className="w-3.5 h-3.5 text-slate-400" />
              <input 
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="BUSCAR..."
                className="bg-transparent border-none outline-none font-bold text-[10px] uppercase text-slate-700 w-full"
              />
            </div>
          </div>
          
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <div
                  key={option.id}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`px-4 py-3 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-colors ${value === option.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {option.nombre}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin resultados</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
