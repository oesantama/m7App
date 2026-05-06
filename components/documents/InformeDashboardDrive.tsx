import React, { useState, useEffect } from 'react';
import { FileText, TrendingUp, Upload, CheckCircle, AlertCircle, Clock, Download, RefreshCw, Filter, Users } from 'lucide-react';
import { User } from '../../types';
import { api } from '../../services/api';

interface Props {
  user: User;
}

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}

interface DriveLog {
  id: number;
  file_name: string;
  category: string;
  client_id: string;
  upload_date: string;
  status: string;
  drive_link?: string;
  user_id?: string;
}

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  ERROR:   'bg-rose-100 text-rose-700',
  PENDING: 'bg-amber-100 text-amber-700',
};

const InformeDashboardDrive: React.FC<Props> = ({ user }) => {
  const [logs, setLogs]         = useState<DriveLog[]>([]);
  const [loading, setLoading]   = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const isSuper = (user as any)?.roleId === 'ROL-01' || (user as any)?.role_id === 'ROL-01';

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = (user as any)?.token || localStorage.getItem('token') || '';
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo)   params.append('to', dateTo);
      const res = await fetch(`/api/documents/drive-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : data.data || []);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  // Filtrado local
  const filtered = logs.filter(l => {
    const matchSearch = !search ||
      l.file_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.client_id?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // Métricas
  const total    = filtered.length;
  const success  = filtered.filter(l => l.status === 'SUCCESS').length;
  const errors   = filtered.filter(l => l.status === 'ERROR').length;
  const pending  = filtered.filter(l => l.status === 'PENDING').length;

  const statCards: StatCard[] = [
    {
      label: 'Total Subidos',
      value: total,
      icon: <Upload size={18} />,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      sub: 'archivos en Drive',
    },
    {
      label: 'Exitosos',
      value: success,
      icon: <CheckCircle size={18} />,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      sub: `${total > 0 ? Math.round((success / total) * 100) : 0}% del total`,
    },
    {
      label: 'Con Error',
      value: errors,
      icon: <AlertCircle size={18} />,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
      sub: 'requieren revisión',
    },
    {
      label: 'Pendientes',
      value: pending,
      icon: <Clock size={18} />,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      sub: 'en procesamiento',
    },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Gestión Documentos Drive — MOD-10</p>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Informe Dashboard Drive</h1>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-2xl">
          <TrendingUp size={14} className="text-blue-600" />
          <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Actividad de Carga</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className={`p-4 rounded-2xl border ${card.color} flex items-start gap-3`}>
            <div className="mt-0.5 opacity-70">{card.icon}</div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-0.5">{card.label}</p>
              <p className="text-2xl font-black leading-none">{card.value}</p>
              {card.sub && <p className="text-[9px] opacity-60 mt-1">{card.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <Filter size={13} className="text-slate-400" />

        <input
          type="text"
          placeholder="Buscar archivo o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
        />

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="SUCCESS">Exitoso</option>
          <option value="ERROR">Con Error</option>
          <option value="PENDING">Pendiente</option>
        </select>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
          />
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>

        <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all ml-auto">
          <Download size={12} />
          Exportar
        </button>
      </div>

      {/* Tabla */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
            Registro de Archivos — {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
          {isSuper && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
              <Users size={11} />
              Vista de todos los clientes
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['#', 'Archivo', 'Categoría', 'Cliente', 'Fecha Subida', 'Estado', 'Enlace Drive'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw size={24} className="text-slate-300 animate-spin" />
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Cargando registros...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileText size={32} className="text-slate-300" />
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Sin registros</p>
                      <p className="text-[10px] text-slate-300 font-medium">No hay archivos que coincidan con los filtros</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((log, idx) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate" title={log.file_name}>
                    {log.file_name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-black text-[10px] uppercase">
                      {log.category || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-medium">{log.client_id || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(log.upload_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-lg font-black text-[10px] uppercase ${STATUS_BADGE[log.status] || 'bg-slate-100 text-slate-500'}`}>
                      {log.status === 'SUCCESS' ? 'Exitoso' : log.status === 'ERROR' ? 'Error' : log.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.drive_link ? (
                      <a
                        href={log.drive_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-black text-[10px] uppercase tracking-wide transition-colors"
                      >
                        <FileText size={11} />
                        Abrir
                      </a>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InformeDashboardDrive;
