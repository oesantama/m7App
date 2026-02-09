import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
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
                onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                }}
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
