
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Icons } from '../constants';
import { api } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  context: any;
}

const AIChat: React.FC<AIChatProps> = ({ context }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Bienvenido al Centro de Inteligencia **OrbitM7 IQ**! 🚀\n\nEstoy conectado al núcleo operativo de OrbitM7. Puedo ayudarte a:\n- **Optimizar rutas** de despacho.\n- **Auditar documentos** pendientes.\n- **Analizar disponibilidad** de tu flota.\n\n¿Por dónde empezamos hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
        setTimeout(scrollToBottom, 100);
    }
  }, [messages, isOpen]);

  const handleSend = async (forcedMsg?: string) => {
    const userMsg = forcedMsg || input.trim();
    if (!userMsg || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // Simulación de latencia de pensamiento para realismo
      await new Promise(r => setTimeout(r, 1000));
      
      const res = await api.aiChat(userMsg, context);
      if (res.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "Lo siento, tuve un problema procesando tu solicitud. Por favor intenta de nuevo." }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "M7 Offline: No pude conectar con el núcleo de inteligencia. Verifica tu conexión." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Portales: El disparador (botón) va al header si existe, la ventana va al body siempre.
  const [headerPortal, setHeaderPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const target = document.getElementById('orbit-header-chat-target');
    if (target) setHeaderPortal(target);
  }, []);

  const trigger = (
    <button 
      onClick={() => setIsOpen(!isOpen)}
      className={`rounded-2xl flex items-center justify-center transition-all duration-500 hover:scale-105 active:scale-90 group relative overflow-hidden pointer-events-auto ${
        isOpen 
          ? 'bg-slate-900 w-14 h-14' 
          : 'bg-emerald-500 px-6 h-14 shadow-[0_10px_30px_rgba(16,185,129,0.3)] hover:shadow-emerald-500/40'
      } ${headerPortal ? 'h-10 px-4 bg-slate-900 border border-white/10' : 'fixed bottom-10 right-10 z-[2147483647] w-24 h-24 rounded-[2.5rem]'}`}
    >
      {isOpen ? (
        <Icons.X className="text-white w-6 h-6" />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-slate-950 font-black text-lg leading-none tracking-tighter">OrbitM7</span>
            <span className="text-slate-950 text-[8px] font-black uppercase tracking-[0.2em] opacity-60">IQ</span>
          </div>
          {headerPortal && (
            <div className="w-8 h-8 bg-slate-950 rounded-xl flex items-center justify-center">
               <Icons.Brain className="text-emerald-400 w-5 h-5" />
            </div>
          )}
          {/* Indicador de actividad IA */}
          <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-ping"></div>
          </div>
        </div>
      )}
    </button>
  );

  const window = isOpen ? (
    <div className="fixed bottom-32 right-10 z-[2147483647] w-[380px] md:w-[420px] max-h-[calc(100vh-160px)] h-[650px] bg-slate-900/95 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] shadow-[0_48px_150px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 zoom-in-95 duration-500 pointer-events-auto">
      {/* Header Compacto - Refinado */}
      <div className="p-5 bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 flex justify-between items-center shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center shadow-2xl border border-white/10">
            <Icons.Brain className="text-emerald-400 w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="font-black text-slate-950 uppercase tracking-tighter text-base leading-none">OrbitM7 Intelligence</h3>
            <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1 h-1 bg-slate-950 rounded-full animate-ping"></div>
                <span className="text-[8px] text-slate-950 font-black uppercase tracking-[0.2em] opacity-80">Núcleo Online</span>
            </div>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 flex items-center justify-center transition-all active:scale-90 relative z-10">
           <Icons.X className="text-slate-900 w-4 h-4" />
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide bg-slate-950/40">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[90%] p-5 rounded-[2rem] text-[12px] leading-relaxed shadow-lg ${
              msg.role === 'user' 
                ? 'bg-emerald-500 text-slate-950 font-black rounded-tr-md' 
                : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-md'
            }`}>
              {msg.content.split('\n').map((line, idx) => (
                  <p key={idx} className={idx > 0 ? 'mt-2' : ''}>{line}</p>
              ))}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-white/5 border border-white/10 px-5 py-3 rounded-[1.8rem] rounded-tl-md flex gap-2 items-center">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest ml-2">IA Pensando</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="px-8 pb-4 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 pt-1">
        {[
            { label: "📊 Resumen", msg: "Dame un resumen ejecutivo de la operación actual (documentos, vehículos y asignaciones)." },
            { label: "🚛 Flota", msg: "¿Cuál es el estado de disponibilidad de mi flota en este momento?" },
            { label: "⚡ Auditoría", msg: "¿Qué documentos requieren mi atención inmediata para liberar rutas?" }
        ].map((action, i) => (
            <button 
              key={i}
              onClick={() => {
                setInput(action.msg);
                handleSend(action.msg);
              }}
              className="whitespace-nowrap bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-5 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all active:scale-95"
            >
                {action.label}
            </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-8 pt-2 bg-slate-900/80 border-t border-white/5">
        <div className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Pregunta a M7 IQ..."
            className="w-full bg-slate-800/80 border-2 border-white/5 rounded-[1.8rem] py-5 pl-6 pr-16 text-white placeholder:text-slate-600 outline-none focus:border-emerald-500 transition-all text-sm font-bold shadow-2xl"
          />
          <button 
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 w-12 h-12 bg-emerald-500 rounded-[1.2rem] flex items-center justify-center text-slate-950 hover:bg-emerald-400 disabled:opacity-20 transition-all shadow-xl active:scale-90"
          >
            <Icons.Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {headerPortal ? ReactDOM.createPortal(trigger, headerPortal) : ReactDOM.createPortal(trigger, document.body)}
      {ReactDOM.createPortal(window, document.body)}
    </>
  );
};

export default AIChat;
