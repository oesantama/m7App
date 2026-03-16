
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
    onRefresh?: () => void;
}

const NovedadesView: React.FC<NovedadesViewProps> = ({ documents, user, masterArticulo, masterNotificaciones, onRefresh }) => {
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

    // Modal de Reporte
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [targetEmails, setTargetEmails] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState('');

    // Modal de Confirmación Adicionar
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const filteredDocs = useMemo(() => {
        const now = new Date();
        const twoDaysAgo = new Date(now);
        twoDaysAgo.setDate(now.getDate() - 2);
        twoDaysAgo.setHours(0, 0, 0, 0); // Inicio del día hace 2 días

        return documents.filter(d => {
            const s = String(d.status || '').toUpperCase();
            // M7 FIX: Permitir ver documentos en Pendiente, En Conteo e Inventariado (Auditados)
            const matchStatus = 
                s === DocStatus.PENDING.toUpperCase() || 
                s === DocStatus.COUNTING.toUpperCase() ||
                s === DocStatus.INVENTORED.toUpperCase();
            
            const search = searchTerm.toLowerCase();
            const matchSearch = 
                d.externalDocId.toLowerCase().includes(search) ||
                (d.vehicleData || '').toLowerCase().includes(search);

            // M7 V16.5: Filtro de fecha (Hoy + 2 días atrás)
            const displayDateStr = d.createdAt || d.inventoryDate || (d as any).receivingDate || d.updatedAt;
            const displayDate = displayDateStr ? new Date(displayDateStr) : null;
            const matchDate = displayDate ? displayDate >= twoDaysAgo : true; // Si no hay fecha, lo mostramos por seguridad
            
            return matchStatus && matchSearch && matchDate;
        });
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
            setIsConfirmModalOpen(true);
            return;
        }

        await executeSaveNovedad();
    };

    const executeSaveNovedad = async () => {
        if (!selectedDoc || !selectedArticle) return;
        setIsConfirmModalOpen(false);

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
                // Reload news for current doc
                const updated = await api.getNovedades(selectedDoc.id);
                setNovedades(updated);
                // NOTIFY PARENT TO REFRESH LIST
                if (onRefresh) onRefresh();
            }
        } catch (err: any) {
            toast.error(err.message || "Error al guardar novedad", { id: saveToast });
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenReportModal = () => {
        if (!selectedDoc || novedades.length === 0) return;
        const defaultEmails = masterNotificaciones
            .filter(n => n.name?.toLowerCase().includes('inventario') && n.notificationEmail)
            .map(n => n.notificationEmail!);
        setTargetEmails(defaultEmails);
        setIsReportModalOpen(true);
    };

    const handleSendReport = async () => {
        if (!selectedDoc || targetEmails.length === 0) return toast.error("Seleccione al menos un destinatario");

        const reportToast = toast.loading("Enviando reporte por correo...");
        try {
            const res = await api.sendNovedadesReport(selectedDoc.id, targetEmails);
            if (res.success) {
                toast.success("Reporte enviado con éxito", { id: reportToast });
                setIsReportModalOpen(false);
            }
        } catch (err) {
            toast.error("Error al enviar reporte", { id: reportToast });
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
                                onClick={handleOpenReportModal}
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

                {/* Modal de Reporte Profesional */}
                {isReportModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
                            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Icons.Send className="w-5 h-5" /></div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-tight">Enviar Reporte</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{selectedDoc.externalDocId}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsReportModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all"><Icons.Alert className="w-4 h-4 rotate-45" /></button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Destinatarios Sugeridos</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                        {masterNotificaciones
                                            .filter(n => n.name?.toLowerCase().includes('inventario') && n.notificationEmail)
                                            .map((n, i) => (
                                            <label key={i} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group border-2 ${targetEmails.includes(n.notificationEmail!) ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={targetEmails.includes(n.notificationEmail!)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setTargetEmails(prev => [...prev, n.notificationEmail!]);
                                                        else setTargetEmails(prev => prev.filter(email => email !== n.notificationEmail));
                                                    }}
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-slate-900 uppercase truncate">{n.name}</p>
                                                    <p className="text-[9px] text-blue-600 font-bold">{n.notificationEmail}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Añadir Otro Correo</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="email" 
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            placeholder="CORREO@EJEMPLO.COM"
                                            className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-500 transition-all shadow-inner"
                                        />
                                        <button 
                                            onClick={() => {
                                                if (newEmail.includes('@') && !targetEmails.includes(newEmail)) {
                                                    setTargetEmails(prev => [...prev, newEmail]);
                                                    setNewEmail('');
                                                }
                                            }}
                                            className="px-6 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-blue-600 transition-all shadow-md active:scale-95"
                                        >
                                            AÑADIR
                                        </button>
                                    </div>
                                </div>

                                {targetEmails.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-2">
                                        {targetEmails.map((email, i) => (
                                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 animate-in zoom-in-95">
                                                <span className="text-[9px] font-black">{email}</span>
                                                <button onClick={() => setTargetEmails(prev => prev.filter(e => e !== email))} className="hover:text-red-500 font-bold transition-colors">×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                                <button 
                                    onClick={() => setIsReportModalOpen(false)}
                                    className="flex-1 py-4 bg-white text-slate-500 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all active:scale-95 shadow-sm"
                                >
                                    CANCELAR
                                </button>
                                <button 
                                    onClick={handleSendReport}
                                    disabled={targetEmails.length === 0 || isLoading}
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.Send className="w-4 h-4" />}
                                    ENVIAR REPORTE
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Confirmación Adicionar Profesional */}
                {isConfirmModalOpen && selectedArticle && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-500 border border-slate-200">
                            <div className="p-8 text-center space-y-6">
                                <div className="mx-auto w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-blue-200 animate-bounce-subtle">
                                    <Icons.Alert className="w-10 h-10 text-white" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">¿Adicionar Novedad?</h3>
                                    <p className="text-xs text-slate-500 font-bold leading-relaxed px-4">
                                        El artículo <span className="text-blue-600 font-black">{selectedArticle.sku}</span> ya tiene registros. ¿Deseas sumar esta información al registro actual?
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 pt-2">
                                    <button 
                                        onClick={executeSaveNovedad}
                                        className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        SÍ, ADICIONAR REGISTRO
                                    </button>
                                    <button 
                                        onClick={() => setIsConfirmModalOpen(false)}
                                        className="w-full py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-900 transition-all"
                                    >
                                        CANCELAR
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

        <div className="p-4 md:p-6 h-full flex flex-col bg-slate-50 overflow-hidden">
            <div className="max-w-full mx-auto w-full flex flex-col h-full space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 ring-4 ring-slate-900/5 animate-pulse-slow">
                            <Icons.Alert className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Gestión de Novedades</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                {filteredDocs.length} documentos encontrados
                            </p>
                        </div>
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

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 pb-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredDocs.map(doc => {
                            const nCounts = Number((doc as any).newsCount || 0);
                            const displayDate = doc.createdAt || doc.inventoryDate || (doc as any).receivingDate || doc.updatedAt;
                            
                            return (
                                <button
                                    key={doc.id}
                                    onClick={() => handleSelectDoc(doc)}
                                    className="w-full bg-white hover:bg-slate-50 border-2 border-slate-100 rounded-3xl text-left transition-all group flex items-center gap-4 p-5 shadow-md hover:shadow-xl hover:-translate-y-1 border-l-[8px] border-l-slate-200 hover:border-l-blue-600 duration-500 relative overflow-hidden"
                                >
                                    {/* Glassmorphism accent */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-600/20 transition-all duration-700"></div>

                                    <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform duration-500 shrink-0 shadow-xl relative z-10">
                                        <Icons.Package className="w-7 h-7" />
                                        {nCounts > 0 && (
                                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-black border-2 border-white shadow-lg animate-bounce-subtle">
                                                {nCounts}
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-1 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black text-blue-600 bg-blue-100/50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-blue-200 truncate">
                                                {doc.externalDocId}
                                            </span>
                                            <div className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border shrink-0 ${
                                                doc.status === DocStatus.INVENTORED ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                                            }`}>
                                                {doc.status}
                                            </div>
                                        </div>
                                        
                                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter truncate leading-tight group-hover:text-blue-900 transition-colors">
                                            {doc.vehicleData || 'SIN PLACA'}
                                        </h3>

                                        <div className="flex items-center gap-2 pt-0.5">
                                            <Icons.History className="w-3 h-3 text-slate-400" />
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">
                                                {displayDate ? 
                                                    new Date(displayDate).toLocaleString('es-CO', { 
                                                        day: '2-digit', month: 'short', year: 'numeric',
                                                        hour: '2-digit', minute: '2-digit', hour12: true
                                                    }) 
                                                    : 'S/A'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-200 group-hover:text-blue-600 group-hover:bg-blue-100/50 transition-all shrink-0 border-2 border-transparent group-hover:border-blue-200">
                                        <Icons.ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </button>
                            );
                        })}
                        </div>
                        {filteredDocs.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-32 space-y-4">
                                <Icons.Package className="w-24 h-24 text-slate-300" />
                                <div className="space-y-1">
                                    <p className="font-black uppercase text-xl text-slate-900">Sin correspondencias</p>
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No hay documentos con ese criterio</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NovedadesView;
