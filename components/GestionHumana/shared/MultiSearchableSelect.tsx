import React, { useState } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

export interface MultiSearchableSelectProps {
  options: { value: string; label: string }[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}

/** Selector con buscador que permite marcar varias opciones (casillas, "todas las filtradas" y "limpiar"). */
export const MultiSearchableSelect: React.FC<MultiSearchableSelectProps> = ({ options, values, onChange, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const seleccionados = new Set(values);

  const toggle = (v: string) =>
    onChange(seleccionados.has(v) ? values.filter(x => x !== v) : [...values, v]);
  const marcarFiltradas = () =>
    onChange(Array.from(new Set([...values, ...filtered.map(o => o.value)])));

  const resumen = values.length === 0
    ? placeholder
    : values.length <= 2
      ? values.map(v => options.find(o => o.value === v)?.label || v).join(', ')
      : `${values.length} seleccionadas`;

  return (
    <div className="relative w-full">
      <div
        onClick={() => { if (!disabled) { setIsOpen(!isOpen); setSearch(''); } }}
        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl cursor-pointer ${disabled ? 'bg-slate-50 opacity-60 cursor-not-allowed text-slate-400' : 'text-slate-700'}`}
      >
        <span className={`text-xs font-semibold truncate ${values.length ? 'text-slate-800' : 'text-slate-400'}`}>{resumen}</span>
        <span className="flex items-center gap-1 shrink-0">
          {values.length > 0 && (
            <span
              role="button"
              title="Limpiar selección"
              onClick={e => { e.stopPropagation(); onChange([]); }}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150">
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
            <div className="px-3 py-1.5 border-b border-slate-100 flex justify-between text-[10px] font-black uppercase tracking-wider">
              <button type="button" onClick={marcarFiltradas} className="text-indigo-600 hover:underline">
                {search ? 'Marcar filtradas' : 'Marcar todas'}
              </button>
              <button type="button" onClick={() => onChange([])} className="text-slate-500 hover:underline">Limpiar</button>
            </div>
            <div className="overflow-y-auto custom-scrollbar max-h-56">
              {filtered.length === 0 ? (
                <div className="p-3 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin resultados</div>
              ) : (
                filtered.map(opt => {
                  const sel = seleccionados.has(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className={`w-full text-left px-4 py-2 text-xs font-bold uppercase transition-colors flex items-center gap-2 ${sel ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-300 bg-white'}`}>
                        {sel && <Check size={10} />}
                      </span>
                      {opt.label}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MultiSearchableSelect;
