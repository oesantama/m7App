import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { DataTable, ColumnDef } from './shared/DataTable';
import { toast } from 'sonner';

interface Props {
  user: any;
  clientId: string; // Recibido desde RecibidoMaterial.tsx (el cliente activo, si lo hay)
  clients?: { id: string; name: string }[];
}

interface DriveLog {
  id: number;
  fileName?: string; file_name?: string;
  category?: string;
  clientName?: string;
  uploadDate?: string; upload_date?: string;
  folderDate?: string; folder_date?: string;
  driveLink?: string; drive_link?: string;
  userName?: string;
}

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtShortDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ConsultaNovedadesDrive: React.FC<Props> = ({ user, clientId, clients }) => {
  const [logs, setLogs] = useState<DriveLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [localClientId, setLocalClientId] = useState(clientId || '');
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    setLocalClientId(clientId || '');
  }, [clientId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const p = new URLSearchParams();
      if (dateFrom) p.append('dateFrom', dateFrom);
      if (dateTo) p.append('dateTo', dateTo);
      
      const filterClientId = localClientId || clientId;
      if (filterClientId) p.append('clientId', filterClientId);
      
      if (fileName) p.append('fileName', fileName);
      p.append('category', 'NOVEDADES MILLA 7');

      const res = await fetch(`/api/documents/drive-logs?${p}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (!res.ok) throw new Error('Error al cargar logs');
      const data = await res.json();
      setLogs(data || []);
    } catch (err: any) {
      toast.error('Error al cargar historial de Drive: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [clientId]);

  const columns: ColumnDef<DriveLog>[] = [
    {
      header: 'Archivo',
      key: 'fileName',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shadow-sm shrink-0">
            <Icons.FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 text-xs truncate max-w-[200px]" title={r.fileName || r.file_name}>{r.fileName || r.file_name}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">NOVEDAD M7</p>
          </div>
        </div>
      )
    },
    {
      header: 'Cliente',
      key: 'clientName',
      render: (r) => <span className="font-bold text-slate-600 text-[10px] uppercase">{r.clientName || 'N/A'}</span>
    },
    {
      header: 'Fecha Novedad',
      key: 'folderDate',
      render: (r) => <span className="font-bold text-slate-600 text-[10px] uppercase">{fmtShortDate(r.folderDate || r.folder_date)}</span>
    },
    {
      header: 'F. Subida',
      key: 'uploadDate',
      render: (r) => <span className="font-bold text-slate-600 text-[10px] uppercase">{fmtDate(r.uploadDate || r.upload_date)}</span>
    },
    {
      header: 'Usuario',
      key: 'userName',
      render: (r) => <span className="font-bold text-slate-600 text-[10px] uppercase">{r.userName || 'SISTEMA'}</span>
    },
    {
      header: 'Acción',
      key: 'actions',
      sortable: false,
      render: (r) => {
        const link = r.driveLink || r.drive_link;
        return (
          <div className="flex justify-end gap-2">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Abrir en Drive">
                <Icons.Eye className="w-4 h-4" />
              </a>
            ) : (
              <span className="text-[10px] text-slate-400 font-bold uppercase">Sin Link</span>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="p-3 sm:p-4 md:p-6 h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="max-w-full mx-auto w-full flex flex-col h-full space-y-4 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg border border-emerald-500 ring-4 ring-emerald-500/20 shrink-0">
              <Icons.Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Consultas Drive</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                Historial de Novedades enviadas
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end shrink-0">
          <div className="space-y-1.5 flex-1 min-w-[150px] max-w-[200px]">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</label>
            <div className="relative">
              <select 
                 value={localClientId} 
                 onChange={e => setLocalClientId(e.target.value)} 
                 className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase outline-none focus:border-emerald-500 transition-all" 
              >
                <option value="">-- TODOS LOS CLIENTES --</option>
                {clients?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[150px] max-w-[200px]">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Archivo</label>
            <div className="relative">
              <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input 
                 type="text" 
                 value={fileName} 
                 onChange={e => setFileName(e.target.value)} 
                 placeholder="Ej: NOV_123"
                 className="w-full h-11 pl-11 pr-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold uppercase outline-none focus:border-emerald-500 transition-all" 
              />
            </div>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[130px] max-w-[180px]">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-emerald-500 transition-all" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[130px] max-w-[180px]">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold outline-none focus:border-emerald-500 transition-all" />
          </div>
          <button onClick={fetchLogs} disabled={loading} className="h-11 px-6 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Icons.Search className="w-4 h-4" />}
            Consultar
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 flex-1 overflow-hidden flex flex-col min-h-[400px]">
          <DataTable
            data={logs}
            columns={columns}
            searchPlaceholder="Buscar archivo..."
            excelFileName="Novedades_Drive.xlsx"
          />
        </div>
      </div>
    </div>
  );
};

export default ConsultaNovedadesDrive;
