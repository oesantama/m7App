import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../../constants';

export const SearchableSelect = ({ options, value, onChange, placeholder }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find((o: any) => o.id === value);
    const filteredOptions = options.filter((o: any) => o.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div ref={wrapperRef} className="relative w-36">
            <div 
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase outline-none focus:border-emerald-400 bg-white cursor-pointer flex items-center justify-between"
                onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
            >
                <span className="truncate">{selectedOption ? selectedOption.name : placeholder}</span>
                <Icons.ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-48 flex flex-col">
                    <div className="p-1">
                        <input 
                            type="text" 
                            className="w-full px-2 py-1 text-[9px] border border-slate-200 rounded outline-none focus:border-emerald-400"
                            placeholder="Buscar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                        />
                    </div>
                    <div className="overflow-y-auto custom-scrollbar flex-1">
                        <div 
                            className="px-2 py-1.5 text-[9px] font-black uppercase hover:bg-emerald-50 cursor-pointer text-slate-500"
                            onClick={() => { onChange(''); setIsOpen(false); }}
                        >
                            {placeholder}
                        </div>
                        {filteredOptions.map((o: any) => (
                            <div 
                                key={o.id}
                                className={`px-2 py-1.5 text-[9px] font-black uppercase hover:bg-emerald-50 cursor-pointer ${value === o.id ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700'}`}
                                onClick={() => { onChange(o.id); setIsOpen(false); }}
                            >
                                {o.name}
                            </div>
                        ))}
                        {filteredOptions.length === 0 && (
                            <div className="px-2 py-2 text-[9px] text-slate-400 text-center italic">Sin resultados</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
