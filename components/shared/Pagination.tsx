
import React from 'react';
import { Icons } from '../../constants';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalResults?: number;
    pageSize?: number | 'all';
}

const Pagination: React.FC<PaginationProps> = ({ 
    currentPage, 
    totalPages, 
    onPageChange, 
    totalResults,
    pageSize
}) => {
    if (totalPages <= 1 || pageSize === 'all') return null;

    // Generate page numbers to show
    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-white border-t border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {totalResults !== undefined && (
                    <span>Total: <span className="text-slate-900">{totalResults}</span> registros | </span>
                )}
                Página <span className="text-slate-900">{currentPage}</span> de <span className="text-slate-900">{totalPages}</span>
            </div>
            
            <div className="flex items-center gap-1">
                <button
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <Icons.ChevronLeft className="w-4 h-4" />
                </button>

                {getPageNumbers().map(p => (
                    <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all ${
                            currentPage === p 
                                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-110' 
                                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-200'
                        }`}
                    >
                        {p}
                    </button>
                ))}

                <button
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                    <Icons.ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
