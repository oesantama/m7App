import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Icons } from '../../constants';

interface DriveSyncProps {
  tree: any;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

const DriveSync: React.FC<DriveSyncProps> = ({ tree, loading, onRefresh }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.bascGetSyncHistory();
      if (res && res.success) {
        setHistory(res.history || []);
      }
    } catch (e) {
      console.error('Error fetching sync history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await api.bascTriggerSync();
      if (res && res.success) {
        // Poll sync logs for update or just wait 3 seconds and refresh
        await new Promise(r => setTimeout(r, 3000));
        await onRefresh();
        await fetchHistory();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SYNCHRONIZED':
      case 'SUCCESS':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Sincronizado
          </span>
        );
      case 'PENDING':
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            Pendiente
          </span>
        );
      case 'ERROR':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
            Error
          </span>
        );
    }
  };

  const displayNames: Record<string, string> = {};

  return (
    <div className="flex-1 flex flex-col p-6 md:p-10 bg-slate-950 text-white min-h-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <Icons.RefreshCw className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Sincronización Google Drive</h1>
          </div>
          <p className="text-slate-400 text-sm">Administre la vinculación, explore el árbol documental y dispare escaneos del SGCS BASC.</p>
        </div>

        <button
          onClick={handleManualSync}
          disabled={syncing || loading}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
        >
          {syncing ? (
            <>
              <Icons.Loader className="w-4 h-4 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <Icons.Upload className="w-4 h-4" />
              Sincronizar Manualmente
            </>
          )}
        </button>
      </div>

      {/* Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Folder Tree Explorer */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
          <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-wider flex items-center gap-2">
            <Icons.Category className="w-5 h-5 text-slate-400" />
            Explorador de Carpetas
          </h3>

          <div className="space-y-4">
            {tree && Object.entries(tree).map(([folderName, files]: any) => {
              const isExpanded = expandedFolder === folderName;
              return (
                <div key={folderName} className="border border-slate-800/60 rounded-2xl overflow-hidden bg-slate-950/40">
                  {/* Folder Header */}
                  <button
                    onClick={() => setExpandedFolder(isExpanded ? null : folderName)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-900/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-amber-500">
                        <Icons.Category className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-200">{displayNames[folderName] || folderName}</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-0.5">
                          {files.length} archivos
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-slate-500">
                      {isExpanded ? (
                        <Icons.ChevronUp className="w-5 h-5" />
                      ) : (
                        <Icons.ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </button>

                  {/* Files list inside folder */}
                  {isExpanded && (
                    <div className="border-t border-slate-800/80 p-4 space-y-2 bg-slate-950/80 animate-in slide-in-from-top-2 duration-200">
                      {files.length === 0 ? (
                        <p className="text-xs text-slate-600 italic py-2">No hay archivos en este directorio.</p>
                      ) : (
                        files.map((file: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-slate-900/40 hover:bg-slate-900 border border-slate-850 rounded-xl transition-all duration-300">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <Icons.FileText className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="overflow-hidden">
                                <p className="text-xs font-bold text-slate-200 truncate">{file.name}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  {(file.sizeBytes / 1024).toFixed(1)} KB • {file.lastSync ? new Date(file.lastSync).toLocaleString() : 'Pendiente de escaneo'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              {getStatusBadge(file.status)}
                              {file.status === 'SYNCHRONIZED' && (
                                <a
                                  href={file.driveLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
                                  title="Ver archivo"
                                >
                                  <Icons.ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Sync Execution History */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Icons.History className="w-5 h-5 text-slate-400" />
              Historial de Sinc
            </h3>
            <button
              onClick={fetchHistory}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Actualizar historial"
            >
              <Icons.RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {loadingHistory && history.length === 0 ? (
              <div className="flex justify-center items-center py-10">
                <Icons.Loader className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-10">No se registran sincronizaciones.</p>
            ) : (
              history.map((log: any) => (
                <div key={log.id} className="p-4 bg-slate-950/60 border border-slate-900 rounded-2xl hover:border-slate-800 transition-all duration-300">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-slate-300">{new Date(log.executed_at).toLocaleString()}</p>
                    {getStatusBadge(log.status)}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{log.details}</p>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-900 pt-2">
                    <span>Nuevos: {log.new_files} • Procesados: {log.processed_files}</span>
                    <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
                  </div>
                  {log.error_message && (
                    <div className="mt-2 p-2 bg-red-950/30 border border-red-900/30 rounded-lg text-[10px] text-red-400 font-mono break-all">
                      {log.error_message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriveSync;
