import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isAutoRecovering: boolean;
}

// M7-FIX: reset completo de todo lo que ocupa cuota de almacenamiento del navegador —
// localStorage, sessionStorage, Cache Storage del Service Worker (donde vive el bundle
// de la PWA) y el propio Service Worker. Borrar solo localStorage no alcanza: en
// Firefox la cuota se cuenta junto con el Cache Storage, así que si ese caché ya está
// grande, el QuotaExceededError vuelve de inmediato.
async function hardResetStorage() {
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
    }
  } catch {}
}

const AUTO_RECOVERY_FLAG = 'm7_auto_recovery_attempted';

function isStorageQuotaError(error: Error): boolean {
  return error?.name === 'QuotaExceededError' || /quota.*exceeded/i.test(String(error?.message || ''));
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isAutoRecovering: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });

    // M7-FIX: auto-reparación SIN depender del usuario final. Cuando el error es de cuota
    // de almacenamiento excedida (el caso más común y silencioso — se acumula solo con el
    // uso diario), no tiene sentido mostrarle al operador una pantalla técnica y esperar a
    // que sepa que debe tocar "Borrar Caché" — se limpia todo y se recarga de una vez.
    // Guardado con una bandera de un solo intento por sesión para no entrar en loop de
    // recarga infinita si el reset no resolviera el problema.
    if (isStorageQuotaError(error)) {
      let alreadyTried = false;
      try { alreadyTried = sessionStorage.getItem(AUTO_RECOVERY_FLAG) === '1'; } catch {}
      if (!alreadyTried) {
        this.setState({ isAutoRecovering: true });
        hardResetStorage().finally(() => {
          try { sessionStorage.setItem(AUTO_RECOVERY_FLAG, '1'); } catch {}
          window.location.reload();
        });
      }
    }
  }

  public render() {
    if (this.state.isAutoRecovering) {
      // M7-FIX: mientras se auto-repara (localStorage/caché lleno), no tiene sentido asustar
      // al operador con la traza técnica del error — la recarga automática ya viene en camino.
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Optimizando almacenamiento...</p>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-4xl w-full bg-slate-800 rounded-3xl p-8 shadow-2xl border border-red-500/30">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-500 text-3xl">⚠️</div>
              <div>
                <h1 className="text-3xl font-black">Algo salió mal</h1>
                <p className="text-slate-400">Error de Ejecución Detectado</p>
              </div>
            </div>
            
            <div className="bg-slate-950 rounded-xl p-6 overflow-auto max-h-[60vh] border border-slate-700">
              <h2 className="text-red-400 font-mono font-bold text-lg mb-2">
                {this.state.error?.toString()}
              </h2>
              {this.state.errorInfo && (
                <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="mt-8 flex gap-4">
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all"
              >
                Recargar Página
              </button>
              <button
                onClick={() => { hardResetStorage().finally(() => window.location.reload()); }}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all"
              >
                Borrar Caché y Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
