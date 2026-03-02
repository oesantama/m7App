
import React, { useState, useMemo, useRef } from 'react';
import { Icons } from '../constants';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DocumentL, MasterRecord, User, DocStatus, Article } from '../types';

interface Novedad {
    id: number;
    document_id: string;
    article_id: string;
    article_sku?: string;
    article_name?: string;
    quantity: number;
    observation: string;
    photo_urls: string[];
    user_name: string;
    created_at: string;
}

interface NovedadesViewProps {
    documents: DocumentL[];
    user: User;
    masterArticulo: MasterRecord[];
    masterNotificaciones: MasterRecord[];
}

const NovedadesView: React.FC<NovedadesViewProps> = ({ documents, user, masterArticulo, masterNotificaciones }) => {
    const [selectedDoc, setSelectedDoc] = useState<DocumentL | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [articleSearch, setArticleSearch] = useState('');
    const [novedades, setNovedades] = useState<Novedad[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Formulario de Novedad
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const [quantity, setQuantity] = useState<number>(0);
    const [observation, setObservation] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredDocs = useMemo(() => {
        return documents.filter(d => 
            (d.status === DocStatus.PENDING || d.status === DocStatus.COUNTING) &&
            d.externalDocId.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [documents, searchTerm]);

    const handleSelectDoc = async (doc: DocumentL) => {
        setSelectedDoc(doc);
        setIsLoading(true);
        try {
            const res = await api.getNovedades(doc.id);
            setNovedades(res);
        } catch (err) {
            toast.error("Error al cargar novedades");
        } finally {
            setIsLoading(false);
        }
    };

    const articlesFound = useMemo(() => {
        if (articleSearch.length < 2) return [];
        return (masterArticulo as Article[]).filter(a => 
            a.sku?.toLowerCase().includes(articleSearch.toLowerCase()) || 
            a.name?.toLowerCase().includes(articleSearch.toLowerCase())
        ).slice(0, 5);
    }, [masterArticulo, articleSearch]);

    const compressImage = (base64Str: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1024;
                const MAX_HEIGHT = 1024;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const loadToast = toast.loading("Procesando imágenes...");
        try {
            for (const file of Array.from(files)) {
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                const compressed = await compressImage(base64);
                setPhotos(prev => [...prev, compressed]);
            }
            toast.dismiss(loadToast);
        } catch (err) {
            toast.error("Error al procesar fotos");
            toast.dismiss(loadToast);
        }
    };

    const handleSaveNovedad = async () => {
        if (!selectedDoc || !selectedArticle) return;
        if (quantity <= 0) return toast.error("Ingrese una cantidad válida");
        if (!observation) return toast.error("Ingrese una observación");

        const existing = novedades.find(n => n.article_sku === selectedArticle.sku || n.article_id === selectedArticle.id);
        if (existing) {
            const confirmMsg = `El artículo ${selectedArticle.sku} ya tiene novedades registradas. ¿Desea ADICIONAR esta información al registro existente?`;
            if (!window.confirm(confirmMsg)) return;
        }

        const saveToast = toast.loading("Guardando novedad...");
        setIsLoading(true);
        try {
            const res = await api.saveNovedad({
                documentId: selectedDoc.id,
                articleId: selectedArticle.id,
                quantity,
                observation,
                photoUrls: photos,
                userName: user.name
            });

            if (res.success) {
                toast.success("Novedad guardada correctamente", { id: saveToast });
                // Reset form
                setSelectedArticle(null);
                setQuantity(0);
                setObservation('');
                setPhotos([]);
                setArticleSearch('');
                // Reload news
                const updated = await api.getNovedades(selectedDoc.id);
                setNovedades(updated);
            }
        } catch (err: any) {
            toast.error(err.message || "Error al guardar novedad", { id: saveToast });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendReport = async () => {
        if (!selectedDoc || novedades.length === 0) return;

        const defaultEmails = masterNotificaciones
            .filter(n => n.name?.toLowerCase().includes('inventario') && n.notificationEmail)
            .map(n => n.notificationEmail!);

        const emailInput = prompt("Enviar reporte a las siguientes direcciones (separadas por coma):", defaultEmails.join(', '));
        if (emailInput === null) return;

        const emails = emailInput.split(',').map(e => e.trim()).filter(e => e.includes('@'));
        if (emails.length === 0) return toast.error("Ingrese al menos un correo válido");

        setIsLoading(true);
        try {
            const res = await api.sendNovedadesReport(selectedDoc.id, emails);
            if (res.success) toast.success("Reporte enviado con éxito");
        } catch (err) {
            toast.error("Error al enviar reporte");
        } finally {
            setIsLoading(false);
        }
    };

    if (selectedDoc) {
        return (
            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                {/* Cabecera del Documento Seleccionado */}
                <div className="bg-slate-900 p-4 text-white flex justify-between items-center shrink-0 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedDoc(null)} className="p-2 hover:bg-white/10 rounded-lg transition-all"><Icons.ChevronRight className="rotate-180 w-5 h-5" /></button>
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight leading-none">{selectedDoc.externalDocId}</h2>
                            <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mt-1">Novedades | {selectedDoc.vehicleData || 'SIN PLACA'}</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row p-2 md:p-4 gap-4 overflow-y-auto lg:overflow-hidden custom-scrollbar">
                    {/* Formulario Izquierda */}
                    <div className="w-full lg:w-5/12 bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 flex flex-col space-y-4 shrink-0 lg:overflow-y-auto custom-scrollbar">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight border-b border-slate-50 pb-2">Nueva Novedad</h3>
                        
                        <div className="space-y-4">
                            <div className="relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-2">Buscar Artículo</label>
                                <div className="relative">
                                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                                    <input 
                                        type="text" 
                                        value={articleSearch}
                                        onChange={e => setArticleSearch(e.target.value)}
                                        placeholder="SKU O NOMBRE..."
                                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs uppercase outline-none focus:border-emerald-500 transition-all"
                                    />
                                </div>
                                {articlesFound.length > 0 && (
                                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden">
                                        {articlesFound.map(a => (
                                            <button 
                                                key={a.id} 
                                                onClick={() => { setSelectedArticle(a); setArticleSearch(a.sku); setArticleSearch(''); }}
                                                className="w-full p-4 text-left hover:bg-slate-50 transition-all border-b border-slate-50 last:border-0 group"
                                            >
                                                <p className="text-xs font-black text-slate-900 uppercase">{a.sku}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{a.name}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selectedArticle && (
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl animate-in zoom-in-95">
                                    <p className="text-[8px] font-black text-blue-400 uppercase mb-1">Artículo Seleccionado</p>
                                    <p className="text-sm font-black text-blue-900 uppercase">{selectedArticle.sku} - {selectedArticle.name}</p>
                                </div>
                            )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">Cantidad</label>
                                    <input 
                                        type="number" 
                                        value={quantity}
                                        onChange={e => setQuantity(Number(e.target.value))}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">Fotos ({photos.length})</label>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full p-3 bg-blue-50 text-blue-600 border border-dashed border-blue-200 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Icons.Plus className="w-3 h-3" /> <Icons.Alert className="w-3 h-3" /> CAMARA / GALERIA
                                    </button>
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept="image/*" 
                                        capture="environment" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                        className="hidden" 
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">Observación</label>
                                <textarea 
                                    value={observation}
                                    onChange={e => setObservation(e.target.value)}
                                    placeholder="DETALLE..."
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs uppercase outline-none focus:border-blue-500 transition-all resize-none h-24"
                                />
                            </div>

                            {photos.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto py-2">
                                    {photos.map((p, idx) => (
                                        <div key={idx} className="relative shrink-0 w-20 h-20 group">
                                            <img src={p} className="w-full h-full object-cover rounded-xl border border-slate-200" />
                                            <button 
                                                onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg hover:scale-110 transition-all"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button 
                                onClick={handleSaveNovedad}
                                disabled={isLoading || !selectedArticle}
                                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md disabled:opacity-20 active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.Plus className="w-4 h-4" />}
                                GUARDAR REGISTRO
                            </button>
                        </div>
                    </div>

                    {/* Listado Derecha */}
                    <div className="w-full lg:w-7/12 flex flex-col space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Reporte Actual ({novedades.length})</h3>
                            <button 
                                onClick={handleSendReport}
                                disabled={novedades.length === 0 || isLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-20"
                            >
                                <Icons.Send className="w-3 h-3" /> ENVIAR REPORTE
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                            {novedades.map(n => (
                                <div key={n.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-[9px] font-black text-blue-600 uppercase">{n.article_sku}</p>
                                            <p className="text-xs font-black text-slate-900 uppercase leading-none mt-1">{n.article_name || 'Sin descripción'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-black text-slate-900 leading-none">{n.quantity}</p>
                                            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Unidades</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-600 font-bold uppercase leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 italic">"{n.observation}"</p>
                                    {n.photo_urls && n.photo_urls.length > 0 && (
                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {n.photo_urls.map((url, i) => (
                                                <img 
                                                    key={i} 
                                                    src={url} 
                                                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 hover:scale-105 transition-all cursor-zoom-in"
                                                    onClick={() => window.open(url, '_blank')}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                        <p className="text-[7px] text-slate-400 font-black uppercase">{n.user_name}</p>
                                        <p className="text-[7px] text-slate-400 font-black uppercase">{new Date(n.created_at).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                            {novedades.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                                    <Icons.Plus className="w-20 h-20 text-slate-400 mb-4" />
                                    <p className="text-slate-400 font-black uppercase text-xs">No hay novedades registradas</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 h-full flex flex-col bg-slate-50 overflow-hidden">
            <div className="max-w-4xl mx-auto w-full flex flex-col h-full space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"><Icons.Alert className="w-5 h-5" /></div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Gestión de Novedades</h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auditoría de averías y faltantes</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="relative mb-6">
                        <Icons.Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                        <input 
                            type="text" 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="DOCUMENTO O PLACA..."
                            className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-black text-xs outline-none focus:border-blue-600 transition-all shadow-inner"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                        {filteredDocs.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => handleSelectDoc(doc)}
                                className="w-full p-4 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl text-left transition-all group flex items-center justify-between gap-4 shadow-sm hover:shadow-md"
                            >
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black text-blue-600 uppercase mb-0.5">{doc.externalDocId}</p>
                                    <p className="text-base font-black text-slate-900 uppercase tracking-tighter truncate">{doc.vehicleData || 'SIN PLACA'}</p>
                                    <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'FECHA S/A'}</p>
                                </div>
                                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-600/10 transition-all shrink-0 border border-slate-100">
                                    <Icons.ChevronRight className="w-5 h-5" />
                                </div>
                            </button>
                        ))}
                        {filteredDocs.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                                <Icons.Package className="w-20 h-20 mb-4" />
                                <p className="font-black uppercase text-xs">No se encontraron documentos</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NovedadesView;
