
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../constants';
import { getM7AssistantResponse } from '../services/geminiService';

const SUGGESTIONS = [
  "¿Cómo funciona el Conteo Ciego?",
  "¿Cómo optimizar una ruta?",
  "¿Cómo agregar vehículos masivamente?",
  "Gestión de estados y auditoría"
];

const HelpChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; text: string }[]>([
    { role: 'bot', text: 'Bienvenido a **M7 Support**. Selecciona un tema o escribe tu duda de forma breve.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const processMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setIsTyping(true);

    const botResponse = await getM7AssistantResponse(text, []);
    
    setIsTyping(false);
    setMessages(prev => [...prev, { role: 'bot', text: botResponse || 'No pude procesar tu solicitud.' }]);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    processMessage(input);
  };

  // Función simple para renderizar "negritas" básicas de markdown
  const renderText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-black text-slate-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="fixed bottom-8 right-8 z-[100]">
      {isOpen ? (
        <div className="bg-white w-96 h-[550px] rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
          {/* Header */}
          <div className="bg-slate-950 p-6 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg shadow-emerald-500/20">
                <Icons.Chat />
              </div>
              <div>
                <p className="font-black text-xs uppercase tracking-widest">Asistente M7</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">En línea</p>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
              <span className="text-xl">×</span>
            </button>
          </div>

          {/* Chat Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-white">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-3xl text-[13px] leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-slate-900 text-white rounded-tr-none font-bold' 
                    : 'bg-slate-50 text-slate-600 rounded-tl-none border border-slate-100'
                }`}>
                  {renderText(msg.text)}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-50 p-4 rounded-3xl rounded-tl-none border border-slate-100 flex gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-75"></div>
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions & Input */}
          <div className="p-4 bg-white border-t border-slate-50">
            {messages.length < 4 && !isTyping && (
              <div className="flex flex-wrap gap-2 mb-4">
                {SUGGESTIONS.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => processMessage(s)}
                    className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            
            <form onSubmit={handleSend} className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu duda aquí..."
                className="w-full bg-slate-100 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-2xl py-4 pl-5 pr-14 outline-none text-sm transition-all font-bold text-slate-700"
              />
              <button 
                type="submit" 
                className="absolute right-2 top-2 w-10 h-10 flex items-center justify-center bg-slate-900 text-white rounded-xl hover:bg-emerald-500 hover:text-slate-900 transition-all shadow-lg"
              >
                <Icons.Send />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 bg-slate-900 text-white rounded-[2rem] shadow-2xl flex items-center justify-center hover:scale-110 hover:bg-emerald-500 hover:text-slate-900 active:scale-95 transition-all group"
        >
          <Icons.Chat />
          <div className="absolute -top-12 right-0 bg-slate-900 text-white text-[10px] font-black py-2.5 px-5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
            ¿Dudas? Chat IA M7
          </div>
        </button>
      )}
    </div>
  );
};

export default HelpChat;
