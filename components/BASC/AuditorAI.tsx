import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api';
import { Icons } from '../../constants';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  sources?: string[];
  timestamp: Date;
}

const AuditorAI: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'ai',
      text: 'Hola, soy BASC Auditor AI. Estoy aquí para resolver tus dudas sobre el SGCS BASC de Orbit M7. Puedo auditar políticas, inspeccionar matrices de riesgos, debida diligencia de asociados de negocio o analizar informes de auditoría. ¿Qué deseas consultar hoy?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.bascChat(textToSend);
      if (res && res.success) {
        setMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: res.response,
            sources: res.sources || [],
            timestamp: new Date()
          }
        ]);
      } else {
        throw new Error(res.error || 'No se recibió respuesta de BASC AI.');
      }
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `Error de Auditoría: No se pudo establecer conexión con los modelos de IA orquestados. Detalle técnico: ${error.message || error}`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    '¿Cuál es el protocolo de inspección de contenedores de 17 puntos?',
    '¿Qué hallazgos críticos se encontraron en la última auditoría?',
    '¿Qué debida diligencia se realiza a los asociados de negocio?',
    '¿Cómo mitigamos el riesgo de contaminación de carga?'
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-white h-full relative">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
            <Icons.Brain className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Auditor Inteligente BASC</h1>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">RAG Engine / Gemini Orquestado</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Modelo Activo</span>
        </div>
      </div>

      {/* Main chat messages container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((msg, index) => {
            const isAI = msg.sender === 'ai';
            return (
              <div
                key={index}
                className={`flex gap-4 animate-in fade-in duration-300 ${isAI ? 'justify-start' : 'justify-end'}`}
              >
                {/* AI Avatar */}
                {isAI && (
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                    <Icons.Shield className="w-5 h-5" />
                  </div>
                )}

                {/* Message Balloon */}
                <div className="flex flex-col gap-2 max-w-[80%]">
                  <div
                    className={`px-5 py-3.5 rounded-2xl leading-relaxed text-sm ${
                      isAI
                        ? 'bg-slate-900/60 border border-slate-850 text-slate-100 rounded-tl-none'
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-none'
                    }`}
                  >
                    {/* Preserve line breaks for format */}
                    <p className="whitespace-pre-wrap">{msg.text}</p>

                    {/* Sources Section */}
                    {isAI && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2">
                          Documentos Fuente Consultados
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((source, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-850 text-[10px] font-bold text-slate-400"
                            >
                              <Icons.FileText className="w-3 h-3 text-slate-500" />
                              {source}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] text-slate-500 ${!isAI && 'text-right'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* User Avatar */}
                {!isAI && (
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0">
                    <Icons.User className="w-5 h-5" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-4 justify-start">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                <Icons.Shield className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex flex-col gap-2 max-w-[80%]">
                <div className="bg-slate-900/60 border border-slate-850 text-slate-400 rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-3">
                  <Icons.Loader className="w-4 h-4 animate-spin text-purple-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">Auditor BASC analizando documentos...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Suggested Topics and Input Section */}
      <div className="p-6 border-t border-slate-800/80 bg-slate-900/20 backdrop-blur-md shrink-0">
        <div className="max-w-4xl mx-auto">
          {/* Quick suggestions */}
          {messages.length === 1 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-2">Preguntas Sugeridas</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s)}
                    className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 rounded-xl text-left text-xs text-slate-300 hover:text-white transition-all text-ellipsis overflow-hidden whitespace-nowrap active:scale-[0.99]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form Input */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-3 bg-slate-900 border border-slate-800/85 hover:border-slate-700/80 p-1.5 rounded-2xl focus-within:border-purple-500 transition-all"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Realice una consulta de auditoría BASC (ej: manual de seguridad, hallazgos...)"
              disabled={loading}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-white placeholder-slate-500 px-3 py-2 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-3 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white rounded-xl transition-all shadow-md shadow-purple-500/10 active:scale-95 disabled:opacity-40 shrink-0"
            >
              <Icons.Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuditorAI;
