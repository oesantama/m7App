
import React from 'react';

interface PortalLayoutProps {
  children: React.ReactNode;
}

const PortalLayout: React.FC<PortalLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-emerald-500/30">
        {/* Simple Header */}
        <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <span className="font-black text-slate-950 text-xl tracking-tighter">M7</span>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-lg tracking-tight leading-none">MILLA SIETE</h1>
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Portal de Cliente</span>
                    </div>
                </div>
                <div>
                    <a href="/" className="text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest">
                        Ir al Admin
                    </a>
                </div>
            </div>
        </header>

        {/* Content */}
        <main className="pt-24 pb-10 px-6 max-w-7xl mx-auto">
            {children}
        </main>

        {/* Footer */}
        <footer className="py-10 text-center text-slate-600 text-xs border-t border-white/5 mt-auto">
            <p>&copy; {new Date().getFullYear()} MILLA SIETE GLOBAL. Todos los derechos reservados.</p>
        </footer>
    </div>
  );
};

export default PortalLayout;
