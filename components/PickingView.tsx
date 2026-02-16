
import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { User, DocumentL } from '../types';
import { toast } from 'sonner';

interface PickingViewProps {
    user: User;
    documents: DocumentL[];
}

const PickingView: React.FC<PickingViewProps> = ({ user, documents }) => {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // UI States
    const [activeInvoice, setActiveInvoice] = useState<any | null>(null); // Detail view
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [selectedHelpers, setSelectedHelpers] = useState<User[]>([]);
    
    // Picking Progress
    const [confirmedItems, setConfirmedItems] = useState<string[]>([]); // SKU list
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [itemSearch, setItemSearch] = useState('');

    useEffect(() => {
        loadInvoices();
        api.getUsers().then(res => setAllUsers(res)).catch(console.error);
    }, []);

    async function loadInvoices() {
        setLoading(true);
        try {
            const data = await api.getInvoices();
            // Mostrar TODO lo que no esté terminal (Entregado/Devolución)
            // Incluso si está en ruta (EST-11), podría ser útil verlo, aunque no iniciarlo
            setInvoices(data.filter((inv: any) => 
                inv.status !== 'Entregado' && 
                inv.status !== 'Devolución'
            ));
        } catch (e) {
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    }

    const filteredInvoices = useMemo(() => {
        // Solo mostrar facturas cuyos documentos maestros estén en proceso de Auditoría/Conteo o Inventariado
        const pickingDocIds = (documents || [])
            .filter(d => (d.status as any) === 'En Conteo' || (d.status as any) === 'Inventariado' || (d.status as any) === 'INVENTARIADO')
            .map(d => d.id);

        let list = invoices.filter(inv => pickingDocIds.includes(inv.docLId));

        if (!searchTerm) return list;
        const lower = searchTerm.toLowerCase();
        return list.filter((inv: any) => 
            (inv.invoiceNumber || '').toLowerCase().includes(lower) ||
            (inv.customerName || '').toLowerCase().includes(lower) ||
            (inv.id || '').toLowerCase().includes(lower)
        );
    }, [invoices, documents, searchTerm]);

    const helpersList = useMemo(() => {
        return allUsers.filter(u => u.id !== user.id);
    }, [allUsers, user.id]);

    const handleItemToggle = (sku: string) => {
        setConfirmedItems(prev => 
            prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku]
        );
    };

    const isAllConfirmed = useMemo(() => {
        if (!activeInvoice || !activeInvoice.items) return false;
        return activeInvoice.items.every((item: any) => confirmedItems.includes(item.sku));
    }, [activeInvoice, confirmedItems]);

    async function handleStartActivity(inv: any) {
        if (inv.status === 'EST-11') {
            toast.info("Esta factura ya está en ruta de despacho.");
            return;
        }

        setLoading(true);
        try {
            const res = await api.initPicking({
                invoiceId: inv.invoiceNumber || inv.id,
                leaderId: user.id,
                createdBy: user.name
            });
            if (res.success) {
                setActiveInvoice({ ...inv, pickingId: res.pickingId });
                setConfirmedItems([]);
            }
        } catch (e: any) {
            toast.error(e.message || "Error al iniciar");
        } finally {
            setLoading(false);
        }
    }

    async function processSaveFinal() {
        if (!activeInvoice) return;
        setIsSubmitting(true);
        try {
            // 1. Finalizar tiempo y registrar equipo
            await api.finishPicking({ 
                pickingId: activeInvoice.pickingId,
                helperIds: selectedHelpers.map(h => h.id)
            });
            
            // 2. Registrar firmas pendientes (backend lo maneja ahora)
            toast.success("Alistado guardado. Pendiente de firmas del equipo.");
            setActiveInvoice(null);
            setShowSaveModal(false);
            loadInvoices();
        } catch (e: any) {
            toast.error(e.message || "Error al guardar");
        } finally {
            setIsSubmitting(false);
        }
    }

    if (activeInvoice) {
        return (
            <div className="flex flex-col h-full bg-slate-50/50 rounded-[3rem] overflow-hidden border border-slate-200 shadow-2xl animate-in slide-in-from-right duration-500">
                {/* Header Detalle */}
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setActiveInvoice(null); setItemSearch(''); }} className="p-2.5 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all">
                            <Icons.ChevronRight className="w-4 h-4 rotate-180" />
                        </button>
                        <div>
                            <p className="text-[8px] font-black text-slate-400 theme-text-secondary uppercase tracking-widest">Alistando Factura</p>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">
                                {activeInvoice.invoiceNumber || activeInvoice.id}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* Buscador Interno de Artículos */}
                <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 shrink-0">
                    <div className="relative group">
                        <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="FILTRAR ARTÍCULOS (SKU O NOMBRE)..." 
                            value={itemSearch}
                            onChange={(e) => setItemSearch(e.target.value.toUpperCase())}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-900 uppercase outline-none focus:border-emerald-500 shadow-sm transition-all"
                        />
                    </div>
                </div>

                {/* Lista de Artículos */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {activeInvoice.items?.filter((item: any) => {
                        if (!itemSearch) return true;
                        const lowerSearch = itemSearch.toLowerCase();
                        return (item.sku || '').toLowerCase().includes(lowerSearch) || 
                               (item.articleName || '').toLowerCase().includes(lowerSearch);
                    }).map((item: any, idx: number) => (
                        <div key={idx} className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-4 ${confirmedItems.includes(item.sku) ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100 shadow-sm'}`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 ${confirmedItems.includes(item.sku) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    {idx + 1}
                                </div>
                                <div className="truncate flex flex-col">
                                    <h4 className="font-black text-slate-900 uppercase text-[11px] truncate leading-tight">SKU: {item.sku}</h4>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.articleName || 'Descripción no disponible'}</p>
                                    <p className="text-[8px] font-black text-emerald-600 uppercase mt-0.5">Cantidad: {item.expectedQty} {item.unit}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleItemToggle(item.sku)}
                                className={`px-5 py-2 rounded-lg font-black text-[8px] uppercase tracking-widest transition-all shrink-0 ${confirmedItems.includes(item.sku) ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-slate-900 text-white hover:bg-emerald-500'}`}
                            >
                                {confirmedItems.includes(item.sku) ? 'LISTO' : 'CONFIRMAR'}
                            </button>
                        </div>
                    ))}
                    
                    {activeInvoice.items?.length === 0 && (
                        <div className="py-20 text-center opacity-20 filter grayscale">
                            <Icons.Package className="w-16 h-16 mx-auto mb-4" />
                            <p className="font-black text-xs">Sin artículos registrados</p>
                        </div>
                    )}
                </div>

                {/* Footer Acciones */}
                <div className="p-8 bg-white border-t border-slate-100 shrink-0 flex justify-between items-center">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest italic">
                        * Todos los elementos deben estar confirmados para guardar.
                    </p>
                    <button 
                        disabled={!isAllConfirmed}
                        onClick={() => setShowSaveModal(true)}
                        className={`px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all shadow-2xl ${isAllConfirmed ? 'bg-emerald-600 text-white shadow-emerald-200 active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    >
                        Guardar Alistado
                    </button>
                </div>

                {/* Modal de Finalización (Equipo y Firmas) */}
                {showSaveModal && (
                    <div className="fixed inset-0 z-[800] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-3xl rounded-[4rem] p-12 shadow-2xl border border-white/10 space-y-10">
                            <div className="text-center space-y-3">
                                <div className="w-20 h-20 bg-emerald-500 text-white rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl mb-4 rotate-3">
                                    <Icons.Signature className="w-10 h-10" />
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Finalizar Proceso</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">¿Con quién más realizó este alistado? (Opcional)</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-64 overflow-y-auto p-2 custom-scrollbar">
                                {helpersList.map(h => (
                                    <button 
                                        key={h.id}
                                        onClick={() => {
                                            if (selectedHelpers.find(x => x.id === h.id)) {
                                                setSelectedHelpers(prev => prev.filter(x => x.id !== h.id));
                                            } else if (selectedHelpers.length < 5) {
                                                setSelectedHelpers(prev => [...prev, h]);
                                            }
                                        }}
                                        className={`p-4 rounded-3xl border-2 text-left transition-all relative ${selectedHelpers.find(x => x.id === h.id) ? 'bg-emerald-50 border-emerald-500 shadow-xl' : 'bg-slate-50 border-slate-50 hover:border-slate-200'}`}
                                    >
                                        <p className={`text-[10px] font-black uppercase truncate ${selectedHelpers.find(x => x.id === h.id) ? 'text-emerald-700' : 'text-slate-600'}`}>{h.name}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{h.role}</p>
                                        {selectedHelpers.find(x => x.id === h.id) && (
                                            <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                                <Icons.Check className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col gap-4">
                                <button 
                                    onClick={processSaveFinal}
                                    className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-[12px] uppercase tracking-[0.3em] hover:bg-emerald-600 transition-all shadow-2xl flex items-center justify-center gap-4"
                                >
                                    Confirmar y Guardar Alistado
                                    <Icons.Zap className="w-5 h-5 text-amber-400" />
                                </button>
                                <button onClick={() => setShowSaveModal(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 shrink-0">
                <div>
                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Alistado de Material</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Cola de Trabajo Bodega M7</p>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative group w-full md:w-64">
                        <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="BUSCAR FACTURA..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-3xl text-sm font-black text-slate-900 uppercase outline-none focus:border-emerald-500 shadow-sm transition-all"
                        />
                    </div>
                    <button 
                        onClick={loadInvoices} 
                        className={`p-5 bg-white border-2 border-slate-100 rounded-3xl hover:border-emerald-500 transition-all shadow-sm ${loading ? 'animate-pulse' : ''}`}
                    >
                        <Icons.RefreshCw className={`w-6 h-6 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 content-start">
                    {filteredInvoices.map((inv, idx) => {
                        const isDispatched = inv.status === 'EST-11' || inv.status === 'Entregado';
                        const isInventored = (documents || []).find(d => d.id === inv.docLId)?.status?.toUpperCase() === 'INVENTARIADO';
                        
                        return (
                            <div 
                                key={inv.id || idx} 
                                className="group relative bg-white border border-slate-100 rounded-[3rem] p-8 transition-all hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.08)] hover:border-emerald-500/30 flex flex-col justify-between min-h-[380px] overflow-hidden"
                            >
                                {/* Fondo Decorativo */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[4rem] -z-0 transition-all group-hover:bg-emerald-50/50" />
                                
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-8">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-2xl transition-all group-hover:scale-110 group-hover:rotate-3 ${isInventored ? 'bg-indigo-600 shadow-indigo-100' : 'bg-slate-900 shadow-slate-200'}`}>
                                            {isDispatched ? <Icons.Truck className="w-7 h-7" /> : <Icons.Package className="w-7 h-7" />}
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                                                isInventored ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            }`}>
                                                {isInventored ? 'INVENTARIADO' : 'EN CONTEO'}
                                            </span>
                                            {inv.plate && (
                                                <span className="bg-slate-900 text-white text-[8px] font-black px-3 py-1 rounded-lg tracking-[0.2em] shadow-lg">
                                                    {inv.plate}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-8">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            {inv.customerName || 'CLIENTE PENDIENTE'}
                                        </p>
                                        <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-tight">
                                            #{inv.invoiceNumber || inv.id}
                                        </h4>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-3xl group-hover:bg-white group-hover:border-emerald-100 transition-all">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Refs</p>
                                            <p className="text-sm font-black text-slate-900">{inv.items?.length || 0} SKU</p>
                                        </div>
                                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-3xl group-hover:bg-white group-hover:border-emerald-100 transition-all">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Volumen</p>
                                            <p className="text-sm font-black text-slate-900">{Number(inv.volumeM3 || 0).toFixed(2)} m³</p>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => handleStartActivity(inv)}
                                    disabled={isDispatched}
                                    className={`relative z-10 w-full py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 overflow-hidden ${
                                        isDispatched 
                                        ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed' 
                                        : 'bg-slate-900 text-white hover:bg-emerald-600 shadow-xl hover:shadow-emerald-200 active:scale-95'
                                    }`}
                                >
                                    {isDispatched ? 'PROCESADO' : 'INICIAR ALISTADO'}
                                    {!isDispatched && <Icons.ChevronRight className="w-4 h-4" />}
                                </button>
                            </div>
                        );
                    })}
                </div>
    
                {filteredInvoices.length === 0 && !loading && (
                    <div className="col-span-full py-40 text-center space-y-6">
                        <div className="w-24 h-24 bg-slate-50 rounded-full mx-auto flex items-center justify-center text-slate-200 border-4 border-dashed border-slate-100">
                            <Icons.Check className="w-12 h-12" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-200 uppercase tracking-[0.5em] animate-pulse">
                            {searchTerm ? 'Busca otra factura' : 'Bodega al día'}
                        </h4>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PickingView;
