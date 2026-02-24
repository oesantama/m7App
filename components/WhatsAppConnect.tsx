
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { api } from '../services/api';
import { toast } from 'sonner';

interface WhatsAppCenterProps {
    user: any;
}

const WhatsAppCenter: React.FC<WhatsAppCenterProps> = ({ user }) => {
    const [status, setStatus] = useState<'DISCONNECTED' | 'SCAN_QR' | 'CONNECTED' | 'ERROR'>('DISCONNECTED');
    const [qr, setQr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [quickReplies, setQuickReplies] = useState<any[]>([]);
    const [showInfo, setShowInfo] = useState(false);
    const [showQuickReplyModal, setShowQuickReplyModal] = useState(false);
    const [newQR, setNewQR] = useState({ title: '', content: '' });

    // CRM States
    const [activeView, setActiveView] = useState<'status' | 'crm'>('status');
    const [chats, setChats] = useState<any[]>([]);
    const [selectedChat, setSelectedChat] = useState<any | null>(null);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [mediaBase64, setMediaBase64] = useState<string | null>(null);
    const [mediaName, setMediaName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showSessionDetails, setShowSessionDetails] = useState(false);
    const [sessionInfo, setSessionInfo] = useState<any>(null);

    const fetchStatus = async () => {
        if (!user?.id) return;
        try {
            const data = await api.getWhatsAppStatus(user.id);
            setStatus(data.status);
            setQr(data.qr || null);
            setError(data.message || null);
            
            if (data.status === 'CONNECTED') {
                const logs = await api.getWhatsAppHistory(user.id);
                setHistory(logs);
            }
        } catch (error: any) {
            console.error("Error fetching WA status", error);
        }
    };

    const fetchQuickReplies = async () => {
        if (!user?.id) return;
        const data = await api.getQuickReplies(user.id);
        setQuickReplies(data);
    };

    const fetchChats = async () => {
        if (!user?.id || status !== 'CONNECTED') return;
        try {
            const data = await api.getWhatsAppChats(user.id);
            setChats(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Error fetching chats", e);
        }
    };

    const fetchMessages = async (jid: string) => {
        if (!user?.id) return;
        try {
            const data = await api.getWhatsAppMessages(user.id, jid);
            // Evolution API returns messages in a list
            setChatMessages(Array.isArray(data) ? data.reverse() : []);
        } catch (e) {
            console.error("Error fetching messages", e);
        }
    };

    const handleConnect = async () => {
        try {
            toast.info("Iniciando motor de WhatsApp...");
            const data = await api.connectWhatsApp(user.id);
            if (data.qr) {
                setQr(data.qr);
                setStatus('SCAN_QR');
            }
            fetchStatus();
        } catch (e) {
            toast.error("Error al conectar");
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('¿Desvincular tu WhatsApp personal? Tendrás que escanear el QR de nuevo.')) return;
        try {
            setLoading(true);
            await api.disconnectWhatsApp(user.id);
            toast.success("Sesión desvinculada");
            setQr(null);
            setStatus('DISCONNECTED');
            setActiveView('status');
        } catch (e) {
            toast.error("Error al desvincular");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchChats();
        // Sincronizar lista de chats cada 15 segundos
        const chatInterval = setInterval(fetchChats, 15000);
        return () => clearInterval(chatInterval);
    }, [user?.id, status]);

    const handleSyncContacts = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const res = await api.syncWhatsAppContacts(user.id);
            if (res.success) {
                toast.success("Sincronización de agenda iniciada", { description: "Los nombres deberían aparecer en unos momentos." });
                setTimeout(fetchChats, 3000);
            } else {
                toast.error("Error al sincronizar: " + res.error);
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!selectedChat || (!newMessage && !mediaBase64)) return;
        setIsSending(true);
        try {
            const res = await api.sendWhatsAppNotification({
                phones: [selectedChat.id.split('@')[0]],
                message: newMessage,
                userId: user.id,
                media: mediaBase64 || undefined,
                fileName: mediaName || undefined
            });

            if (res.success) {
                setNewMessage('');
                setMediaBase64(null);
                setMediaName('');
                // Refresco inmediato
                await fetchMessages(selectedChat.id);
                fetchChats(); 
            } else {
                toast.error("Error al enviar: " + res.error);
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setIsSending(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setMediaBase64(reader.result as string);
                setMediaName(file.name);
                toast.success(`Archivo seleccionado: ${file.name}`);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveQuickReply = async () => {
        if (!newQR.title || !newQR.content) return toast.error("Completa todos los campos");
        try {
            await api.saveQuickReply({ userId: user.id, ...newQR });
            toast.success("Respuesta rápida guardada");
            setNewQR({ title: '', content: '' });
            setShowQuickReplyModal(false);
            fetchQuickReplies();
        } catch (e) {
            toast.error("Error al guardar");
        }
    };

    const handleDeleteQuickReply = async (id: string) => {
        if (!confirm('¿Eliminar respuesta rápida?')) return;
        try {
            await api.deleteQuickReply(id);
            fetchQuickReplies();
        } catch (e) {
            toast.error("Error al eliminar");
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchQuickReplies();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        if (activeView === 'crm' && status === 'CONNECTED') {
            fetchChats();
        }
    }, [activeView, status]);

    useEffect(() => {
        if (selectedChat) {
            fetchMessages(selectedChat.id);
            // Polling cada 5 segundos para mensajes nuevos
            const interval = setInterval(() => fetchMessages(selectedChat.id), 5000);
            return () => clearInterval(interval);
        }
    }, [selectedChat]);

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden rounded-[3rem] animate-in fade-in duration-700">
            
            {/* Header / Navigation */}
            <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg ${status === 'CONNECTED' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <Icons.MessageSquare />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Centro de Mensajería Orbit</h2>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                             Estado: <span className={status === 'CONNECTED' ? 'text-emerald-500' : 'text-slate-400'}>{status}</span>
                             {status === 'CONNECTED' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                        </p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
                    <button 
                        onClick={() => setActiveView('status')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'status' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        Conexión
                    </button>
                    <button 
                        onClick={() => status === 'CONNECTED' ? setActiveView('crm') : toast.error('Conecta tu WhatsApp primero')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === 'crm' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        CRM / Chat
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {activeView === 'status' ? (
                    <div className="w-full flex flex-col lg:flex-row p-10 gap-10 overflow-y-auto">
                        {/* Status Card */}
                        <div className="flex-1 flex flex-col gap-10">
                            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col items-center text-center space-y-8">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Sincronización de Línea</h3>
                                
                                {status === 'CONNECTED' ? (
                                    <div className="space-y-8 w-full">
                                        <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner text-4xl">
                                            <Icons.Check />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-xl font-black text-slate-900 uppercase tracking-tighter">¡Línea Orbit Vinculada!</p>
                                            <p className="text-xs text-slate-400 font-medium italic">Tu cuenta de WhatsApp empresarial está lista para operar.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-6 bg-slate-50 rounded-3xl text-left border border-slate-100">
                                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Sesión Activa</p>
                                                <p className="text-xs font-bold text-slate-700">{user?.name}</p>
                                            </div>
                                            <div className="p-6 bg-slate-50 rounded-3xl text-left border border-slate-100">
                                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Mensajes Hoy</p>
                                                <p className="text-xs font-bold text-slate-700">{history.length}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleDisconnect}
                                            className="w-full py-5 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-rose-100 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                        >
                                            Desvincular Línea Corporativa
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-8 w-full">
                                        {qr ? (
                                            <div className="bg-white p-6 rounded-[2.5rem] border-4 border-slate-50 shadow-2xl inline-block animate-in zoom-in duration-500">
                                                <img src={qr} alt="QR Code" className="w-64 h-64 object-contain" />
                                            </div>
                                        ) : (
                                            <div className="w-64 h-64 bg-slate-50 rounded-[2.5rem] flex flex-col items-center justify-center mx-auto border-4 border-dashed border-slate-100">
                                                <Icons.Loader className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Generando Protocolo...</p>
                                            </div>
                                        )}
                                        <div className="space-y-4">
                                            <p className="text-sm font-bold text-slate-500 leading-relaxed max-w-sm mx-auto">
                                                Escanea con tu WhatsApp para habilitar la **Inteligencia Logística Orbit**.
                                            </p>
                                            <button 
                                                onClick={handleConnect}
                                                className="px-10 py-5 bg-emerald-500 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all flex items-center gap-4 mx-auto"
                                            >
                                                <Icons.Settings /> Obtener Nuevo Enlace
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* High-End Info Card */}
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-[3rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                <div className="relative bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col items-center text-center space-y-6 overflow-hidden">
                                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-[1.5rem] flex items-center justify-center text-2xl mb-2">
                                        <Icons.Rocket />
                                    </div>
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Guía de Operación Orbit</h4>
                                        <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xs">
                                            Descubre cómo la **Inteligencia WhatsApp** transforma tu gestión logística y de envíos.
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            console.log("Opening info modal...");
                                            setShowInfo(true);
                                        }}
                                        className="w-full py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                    >
                                        ¿CÓMO FUNCIONA EL CRM?
                                        <Icons.ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity Mini-List */}
                        <div className="w-full lg:w-96 flex flex-col gap-6">
                            <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 flex-1 flex flex-col overflow-hidden">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Actividad Reciente</h3>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                                    {history.map((log, i) => (
                                        <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] font-black text-slate-900 font-mono">{log.phone_number}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${log.status === 'SENT' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                    {log.status === 'SENT' ? 'Enviado' : 'Falla'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 truncate italic">{log.message_body}</p>
                                        </div>
                                    ))}
                                    {history.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4">
                                            <Icons.Clock className="w-8 h-8" />
                                            <p className="text-[10px] font-black uppercase tracking-widest italic">Sin historial</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="w-full flex h-full overflow-hidden bg-white">
                        {/* Chat List */}
                        <div className="w-80 border-r border-slate-100 flex flex-col overflow-hidden shrink-0">
                            <div className="p-6 bg-slate-50/50 border-b border-slate-100">
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-white px-4 py-2 rounded-xl flex items-center gap-3 border border-slate-200 focus-within:border-emerald-500 transition-all">
                                            <Icons.Search className="w-3 h-3 text-slate-400" />
                                            <input 
                                                placeholder="BUSCAR CHAT..." 
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="bg-transparent border-none outline-none text-[9px] font-black uppercase w-full" 
                                            />
                                        </div>
                                        <button 
                                            onClick={() => fetchChats()}
                                            className="p-2 bg-white border border-slate-200 rounded-xl hover:text-emerald-500 transition-all"
                                            title="Refrescar Chats"
                                        >
                                            <Icons.RotateCcw className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={handleSyncContacts}
                                        disabled={loading}
                                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                                    >
                                        <Icons.RotateCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                        {loading ? 'Sincronizando...' : 'Sincronizar Agenda'}
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {chats
                                    .filter(chat => {
                                        const name = (chat.name || chat.id).toLowerCase();
                                        return name.includes(searchTerm.toLowerCase());
                                    })
                                    .sort((a, b) => (b.lastMessage?.messageTimestamp || 0) - (a.lastMessage?.messageTimestamp || 0))
                                    .map((chat) => {
                                        const isGroup = chat.id.endsWith('@g.us');
                                        const lastMsgTime = chat.lastMessage?.messageTimestamp 
                                            ? new Date(chat.lastMessage.messageTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : '';
                                        const lastMsgText = chat.lastMessage?.message?.conversation 
                                            || chat.lastMessage?.message?.extendedTextMessage?.text 
                                            || (chat.lastMessage?.message?.imageMessage ? '📷 Foto' : '')
                                            || (chat.lastMessage?.message?.documentMessage ? '📄 Documento' : '')
                                            || 'Conversación iniciada';

                                        return (
                                            <button 
                                                key={chat.id} 
                                                onClick={() => setSelectedChat(chat)}
                                                className={`w-full p-6 text-left border-b border-slate-50 flex items-center gap-4 transition-all hover:bg-slate-50 ${selectedChat?.id === chat.id ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : ''}`}
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-xs ${isGroup ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-emerald-500'}`}>
                                                    {isGroup ? <Icons.Users /> : (chat.name?.substring(0, 1).toUpperCase() || <Icons.User />)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <h4 className="font-black text-slate-900 text-[10px] uppercase truncate">{chat.name || chat.id.split('@')[0]}</h4>
                                                        <span className="text-[7px] text-slate-400 font-bold">{lastMsgTime}</span>
                                                    </div>
                                                    <p className="text-[9px] text-slate-400 truncate font-medium">{lastMsgText}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
                            {selectedChat ? (
                                <>
                                    <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-emerald-500">
                                                <Icons.User />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-black text-slate-900 text-xs uppercase truncate">{selectedChat.name || selectedChat.id.split('@')[0]}</h4>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                                    <p className="text-[8px] font-black text-emerald-500 uppercase">Chat Verificado</p>
                                                </div>
                                            </div>
                                        </div>
                                            <button 
                                                onClick={() => fetchMessages(selectedChat.id)}
                                                className="p-2.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                                            >
                                                <Icons.RotateCcw />
                                            </button>
                                            <button 
                                                onClick={async () => {
                                                    const info = await api.getWhatsAppStatus(user.id);
                                                    setSessionInfo(info);
                                                    setShowSessionDetails(true);
                                                }}
                                                className="p-2.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                                            >
                                                <Icons.Settings />
                                            </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar flex flex-col-reverse">
                                        {/* Reverse order list */}
                                        <div className="flex flex-col gap-6">
                                            {chatMessages.map((msg, i) => {
                                                const isMine = msg.key?.fromMe;
                                                const content = msg.message?.conversation 
                                                    || msg.message?.extendedTextMessage?.text 
                                                    || msg.message?.imageMessage?.caption 
                                                    || msg.message?.documentMessage?.caption 
                                                    || (msg.message?.imageMessage ? '📷 Foto' : '')
                                                    || (msg.message?.documentMessage ? '📄 Documento' : '')
                                                    || (msg.message?.audioMessage ? '🎤 Nota de voz' : '')
                                                    || "[Mensaje sin vista previa]";
                                                return (
                                                    <div key={i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`max-w-[70%] p-5 rounded-[2rem] shadow-sm relative group ${isMine ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                                                            <p className="text-xs font-medium leading-relaxed">{content}</p>
                                                            <div className={`mt-2 flex items-center gap-2 ${isMine ? 'justify-end text-slate-500' : 'justify-start text-slate-400'}`}>
                                                                <span className="text-[7px] font-black uppercase">{new Date(msg.messageTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                {isMine && <Icons.Check className="w-2 h-2 text-emerald-500" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Composer */}
                                    <div className="p-6 bg-white border-t border-slate-100 space-y-4">
                                        {/* Quick Reply Bar */}
                                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            <button 
                                                onClick={() => setShowQuickReplyModal(true)}
                                                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shrink-0"
                                            >
                                                + Nueva
                                            </button>
                                            {quickReplies.map(qr => (
                                                <button 
                                                    key={qr.id}
                                                    onClick={() => setNewMessage(qr.content)}
                                                    className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-100 hover:bg-slate-900 hover:text-white transition-all shrink-0"
                                                >
                                                    {qr.title}
                                                </button>
                                            ))}
                                        </div>
                                        
                                        <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-[2rem] border border-slate-100 focus-within:border-emerald-500 focus-within:bg-white transition-all">
                                            <label className="p-3 text-slate-400 hover:text-emerald-500 cursor-pointer transition-all">
                                                <Icons.Paperclip />
                                                <input type="file" className="hidden" onChange={handleFileSelect} />
                                            </label>
                                            <input 
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                                placeholder="ESCRIBE UN MENSAJE O ELIGE UNA RESPUESTA RÁPIDA..." 
                                                className="flex-1 bg-transparent border-none outline-none text-xs font-medium py-2 px-2"
                                            />
                                            {mediaBase64 && (
                                                <div className="px-4 py-2 bg-emerald-500 text-white rounded-full text-[8px] font-black uppercase animate-bounce">
                                                    Media OK
                                                </div>
                                            )}
                                            <button 
                                                onClick={handleSendMessage}
                                                disabled={isSending || (!newMessage && !mediaBase64)}
                                                className={`p-4 rounded-full shadow-lg transition-all ${isSending || (!newMessage && !mediaBase64) ? 'bg-slate-200 text-white' : 'bg-emerald-500 text-white hover:scale-110 active:scale-95'}`}
                                            >
                                                {isSending ? <Icons.Loader className="animate-spin" /> : <Icons.Send />}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 space-y-6">
                                    <div className="w-32 h-32 bg-slate-100 text-slate-300 rounded-[3rem] flex items-center justify-center text-5xl">
                                        <Icons.MessageCircle />
                                    </div>
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Tu Bandeja Orbit</h4>
                                        <p className="text-xs text-slate-400 font-medium max-w-xs mx-auto">Selecciona un chat de la izquierda para ver el historial y responder profesionalmente.</p>
                                    </div>
                                    <div className="flex gap-4">
                                         <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[8px] font-black uppercase flex items-center gap-2">
                                             <Icons.Check /> Encriptación AES-256
                                         </div>
                                         <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase flex items-center gap-2">
                                             <Icons.Zap /> Ultra-Rápido
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Informativo "Qué puedo hacer" */}
            {showInfo && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-500">
                    <div className="bg-white rounded-[4rem] w-full max-w-3xl overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-indigo-200">
                                    <Icons.Rocket />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Ecosistema WhatsApp Orbit</h3>
                                    <p className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.2em]">Guía de Alto Desempeño</p>
                                </div>
                            </div>
                            <button onClick={() => setShowInfo(false)} className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-900 transition-all text-2xl font-thin shadow-sm">×</button>
                        </div>

                        <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Icons.Paperclip />
                                    </div>
                                    <h5 className="font-black text-xs uppercase text-slate-900">Multimedia Inteligente</h5>
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Envía guías de despacho en **PDF**, fotos de entregas o audios de coordinación directamente desde cualquier módulo maestro o el chat CRM.</p>
                                </div>

                                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Icons.Users />
                                    </div>
                                    <h5 className="font-black text-xs uppercase text-slate-900">Bandeja de Entrada CRM</h5>
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Gestiona conversaciones reales en tiempo real. Visualiza mensajes entrantes, historial de chat y organiza tu comunicación logística profesionalmente.</p>
                                </div>

                                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Icons.Zap />
                                    </div>
                                    <h5 className="font-black text-xs uppercase text-slate-900">Respuestas Ultra-Rápidas</h5>
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Utiliza **Plantillas Orbit** para responder preguntas frecuentes en segundos. Configura respuestas predefinidas para estados de carga, rutas y confirmaciones.</p>
                                </div>

                                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4 hover:bg-white hover:shadow-xl transition-all duration-500 group">
                                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Icons.Brain />
                                    </div>
                                    <h5 className="font-black text-xs uppercase text-slate-900">Arquitectura Multi-Agente</h5>
                                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Cada administrador del sistema Orbit puede vincular su propia línea de WhatsApp de forma independiente, manteniendo la privacidad y eficiencia por usuario.</p>
                                </div>
                            </div>

                            <div className="mt-10 p-8 bg-indigo-900 rounded-[2.5rem] text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl shadow-indigo-200">
                                <div className="flex-1 space-y-2 text-center md:text-left">
                                    <h4 className="text-xl font-black uppercase tracking-tighter">¿Listo para escalar la operación?</h4>
                                    <p className="text-indigo-200 text-[10px] font-medium leading-relaxed">Vincule su línea ahora mismo a través del código QR y empiece a disfrutar de la comunicación logística elite de Orbit.</p>
                                </div>
                                <button onClick={() => setShowInfo(false)} className="px-10 py-5 bg-white text-indigo-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 hover:text-white transition-all shadow-xl">Entendido</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Nueva Respuesta Rápida */}
            {showQuickReplyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Mis Plantillas Orbit</h3>
                            <button onClick={()=>setShowQuickReplyModal(false)} className="text-slate-400 hover:text-slate-600"><Icons.X /></button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Título / Atajo</label>
                                <input 
                                    type="text" 
                                    value={newQR.title}
                                    onChange={e => setNewQR({...newQR, title: e.target.value})}
                                    placeholder="EJ: CONFIRMACIÓN ENTREGA"
                                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl text-[10px] font-bold uppercase border-none outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Contenido del Mensaje</label>
                                <textarea 
                                    value={newQR.content}
                                    onChange={e => setNewQR({...newQR, content: e.target.value})}
                                    placeholder="ESCRIBE AQUÍ EL TEXTO..."
                                    rows={4}
                                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl text-[10px] font-medium border-none outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                                />
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    onClick={handleSaveQuickReply}
                                    className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all"
                                >
                                    Guardar Plantilla
                                </button>
                            </div>

                            {/* List to Manage/Delete */}
                            <div className="pt-6 border-t border-slate-100 space-y-3">
                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest text-center">Gestionar Existentes</p>
                                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                                    {quickReplies.map(qr => (
                                        <div key={qr.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                                            <span className="text-[10px] font-black text-slate-700 uppercase">{qr.title}</span>
                                            <button onClick={()=>handleDeleteQuickReply(qr.id)} className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                                                <Icons.X />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalles de Sesión */}
            {showSessionDetails && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl border border-white/20 animate-in zoom-in-95">
                        <div className="p-10 space-y-8">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Detalles de Línea</h3>
                                <button onClick={() => setShowSessionDetails(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><Icons.X /></button>
                            </div>
                            
                            <div className="flex flex-col items-center gap-4 py-4">
                                <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center text-4xl shadow-xl ${status === 'CONNECTED' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                    <Icons.MessageSquare />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-black text-slate-900 uppercase">{user?.name}</p>
                                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{status}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Motor</span>
                                    <span className="text-[10px] font-black text-slate-900">EVOLUTION API v2</span>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Instancia</span>
                                    <span className="text-[10px] font-black text-slate-900 font-mono">user_{user.id}</span>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col gap-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Soporte Logístico</span>
                                    <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">
                                        Si tienes problemas con la sincronización, intenta desvincular y volver a escanear el código QR.
                                    </p>
                                </div>
                            </div>

                            <button 
                                onClick={() => {
                                    handleDisconnect();
                                    setShowSessionDetails(false);
                                }}
                                className="w-full py-5 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-rose-100 hover:bg-rose-600 hover:text-white transition-all"
                            >
                                Forzar Desvinculación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppCenter;
