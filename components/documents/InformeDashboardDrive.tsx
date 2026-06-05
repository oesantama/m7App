import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, TrendingUp, Upload, CheckCircle, AlertCircle, Clock,
  Download, RefreshCw, Filter, Users, BarChart2, Target, ShieldCheck,
} from 'lucide-react';
import { DataTable, ColumnDef } from '../shared/DataTable';
import { User } from '../../types';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { toast } from 'sonner';

interface Props { user: User; }

interface DriveLog {
  id: number;
  fileName?: string; file_name?: string;
  category?: string;
  clientName?: string; client_id?: string;
  clientType?: string;
  uploadDate?: string; upload_date?: string;
  folderDate?: string; folder_date?: string;
  status?: string;
  driveLink?: string; drive_link?: string;
  userId?: string; user_id?: string;
  userName?: string;
  isDeleted?: boolean;
  deleteReason?: string;
}

interface CoverageRow {
  clientName: string;
  manifestCount: number;
  uploadCount: number;
  successCount: number;
  errorCount: number;
  avgDelayHours: number | null;
  coveragePct: number | null;
  status: 'CUBIERTO' | 'FALTANTE' | 'EXCEDENTE';
}

interface CoverageSummary {
  cubiertos: number;
  faltantes: number;
  excedentes: number;
  coveragePct: number;
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtShortDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ERROR:   'bg-rose-50 text-rose-700 border-rose-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

const COVERAGE_BADGE: Record<string, string> = {
  CUBIERTO:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  FALTANTE:  'bg-rose-50 text-rose-700 border-rose-200',
  EXCEDENTE: 'bg-amber-50 text-amber-700 border-amber-200',
};

const CHART_COLORS = ['#6366f1','#06b6d4','#f59e0b','#10b981','#8b5cf6','#ec4899','#f43f5e','#22c55e','#f97316','#14b8a6','#a855f7','#3b82f6'];

// ─── SLA horario hábil colombiano (Lun-Sab 07:00-17:00, sin festivos) ─────────
const calculateLocalSLA = (uploadStr?: string, folderStr?: string, _type?: string) => {
  if (!uploadStr || !folderStr) return 0;
  const upload = new Date(uploadStr);
  const folder = folderStr.includes('T') ? new Date(folderStr) : new Date(`${folderStr}T12:00:00`);
  const uploadMs = isNaN(upload.getTime()) ? Date.now() : upload.getTime();
  const folderMs = isNaN(folder.getTime()) ? uploadMs : folder.getTime();
  if (uploadMs <= folderMs) return 0;

  const years = new Set<number>([new Date(folderMs).getFullYear(), new Date(uploadMs).getFullYear()]);
  const colombianHolidays = new Set<string>();

  const getHolidays = (year: number) => {
    const h = new Set<string>();
    const add = (m: number, d: number) => h.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    const addMov = (m: number, d: number) => {
      const dt = new Date(year, m - 1, d);
      const dow = dt.getDay();
      if (dow === 1) { add(m, d); } else { const skip = dow === 0 ? 1 : 8 - dow; const mv = new Date(year, m - 1, d + skip); add(mv.getMonth()+1, mv.getDate()); }
    };
    [[ 1,1],[5,1],[7,20],[8,7],[12,8],[12,25]].forEach(([m,d])=>add(m,d));
    [[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]].forEach(([m,d])=>addMov(m,d));
    const a=year%19,b=Math.floor(year/100),c=year%100,d2=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),hh=(19*a+b-d2-g+15)%30,i=Math.floor(c/4),k=c%4,L=(32+2*e+2*i-hh-k)%7,mm=Math.floor((a+11*hh+22*L)/451),mo=Math.floor((hh+L-7*mm+114)/31),dy=((hh+L-7*mm+114)%31)+1;
    const easter=new Date(year,mo-1,dy);
    const fromE=(days:number,mov=false)=>{const dd=new Date(easter);dd.setDate(easter.getDate()+days);if(mov){const dow=dd.getDay();if(dow!==1){const sk=dow===0?1:8-dow;dd.setDate(dd.getDate()+sk);}}add(dd.getMonth()+1,dd.getDate());};
    fromE(-3);fromE(-2);fromE(39,true);fromE(60,true);fromE(68,true);
    return h;
  };
  years.forEach(y => getHolidays(y).forEach(hh => colombianHolidays.add(hh)));

  let totalMs = 0;
  const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const startTrunc = new Date(new Date(folderMs).getFullYear(), new Date(folderMs).getMonth(), new Date(folderMs).getDate());
  const endTrunc   = new Date(new Date(uploadMs).getFullYear(), new Date(uploadMs).getMonth(), new Date(uploadMs).getDate());
  const endDay     = new Date(uploadMs);

  for (let t = startTrunc.getTime(); t <= endTrunc.getTime(); t += 86400000) {
    const d = new Date(t);
    if (d.getDay() === 0 || colombianHolidays.has(toYMD(d))) continue;
    if (startTrunc.getTime() === endTrunc.getTime()) {
      const uh = endDay.getHours() + endDay.getMinutes() / 60;
      totalMs += (Math.min(17, Math.max(7, uh)) - 7) * 3600000;
    } else if (t === startTrunc.getTime() || t !== endTrunc.getTime()) {
      totalMs += 10 * 3600000;
    } else {
      const uh = endDay.getHours() + endDay.getMinutes() / 60;
      totalMs += (Math.min(17, Math.max(7, uh)) - 7) * 3600000;
    }
  }
  const diff = totalMs / 3600000;
  return isNaN(diff) ? 0 : diff;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl shadow-2xl text-[10px] text-white min-w-[160px]">
      <p className="font-black uppercase tracking-wider mb-2 text-slate-400">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-black flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white">{typeof p.value === 'number' ? p.value.toLocaleString('es-CO') : p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const InformeDashboardDrive: React.FC<Props> = ({ user }) => {
  const [logs, setLogs]             = useState<DriveLog[]>([]);
  const [loading, setLoading]       = useState(false);
  const [coverage, setCoverage]     = useState<{ summary: CoverageSummary; data: CoverageRow[] } | null>(null);
  const [loadingCov, setLoadingCov] = useState(false);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [coverageFilter, setCoverageFilter] = useState<'ALL'|'CUBIERTO'|'FALTANTE'|'EXCEDENTE'>('ALL');

  const isSuper = (user as any)?.roleId === 'ROL-01' || (user as any)?.role_id === 'ROL-01';
  const token   = () => (user as any)?.token || localStorage.getItem('token') || '';

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (dateFrom) p.append('from', dateFrom);
      if (dateTo)   p.append('to', dateTo);
      const res = await fetch(`/api/documents/drive-logs?${p}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) { const d = await res.json(); setLogs(Array.isArray(d) ? d : d.data || []); }
    } catch { setLogs([]); } finally { setLoading(false); }
  };

  const fetchCoverage = async () => {
    setLoadingCov(true);
    try {
      const p = new URLSearchParams();
      if (dateFrom) p.append('from', dateFrom);
      if (dateTo)   p.append('to', dateTo);
      const res = await fetch(`/api/documents/drive-coverage?${p}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) { const d = await res.json(); if (d.success) setCoverage(d); }
    } catch { setCoverage(null); } finally { setLoadingCov(false); }
  };

  const handleRefresh = () => { fetchLogs(); fetchCoverage(); };

  useEffect(() => { fetchLogs(); fetchCoverage(); }, []);

  // ── Filtro local (estado — el texto lo maneja DataTable internamente) ────────
  const filtered = useMemo(() => logs.filter(l =>
    !filterStatus || (l.status || 'SUCCESS') === filterStatus
  ), [logs, filterStatus]);

  // ── KPI base ────────────────────────────────────────────────────────────────
  const total   = filtered.length;
  const success = filtered.filter(l => (l.status || 'SUCCESS') === 'SUCCESS').length;
  const errors  = filtered.filter(l => l.status === 'ERROR').length;
  const pending = filtered.filter(l => l.status === 'PENDING').length;

  // ── SLA por cliente ─────────────────────────────────────────────────────────
  const slaByClient = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    filtered.forEach(l => {
      const c = l.clientName || l.client_id || 'Sin Cliente';
      const h = calculateLocalSLA(l.uploadDate || l.upload_date, l.folderDate || l.folder_date, l.clientType);
      if ((l.uploadDate || l.upload_date) && (l.folderDate || l.folder_date)) {
        if (!map[c]) map[c] = { total: 0, count: 0 };
        map[c].total += h; map[c].count++;
      }
    });
    return Object.entries(map)
      .map(([name, s]) => ({ name, value: Number((s.total / s.count).toFixed(1)) }))
      .sort((a, b) => b.value - a.value).slice(0, 20);
  }, [filtered]);

  // ── SLA compliance ──────────────────────────────────────────────────────────
  const compliance = useMemo(() => {
    let ok = 0, out = 0;
    filtered.forEach(l => {
      const up = l.uploadDate || l.upload_date;
      const fo = l.folderDate || l.folder_date;
      if (up && fo) {
        const h = calculateLocalSLA(up, fo, l.clientType);
        const lim = (l.clientType || '').toUpperCase() === 'NACIONAL' ? 72 : 24;
        if (h <= lim) ok++; else out++;
      }
    });
    const tot = ok + out;
    return [
      { name: 'Dentro de SLA', value: ok,  pct: tot > 0 ? Math.round((ok / tot) * 100) : 100, color: '#10b981' },
      { name: 'Fuera de SLA',  value: out, pct: tot > 0 ? Math.round((out / tot) * 100) : 0,  color: '#f43f5e' },
    ];
  }, [filtered]);

  // ── Histograma de demoras ───────────────────────────────────────────────────
  const delayHistogram = useMemo(() => {
    const bins = [
      { label: '< 12h',   count: 0, color: '#10b981' },
      { label: '12 – 24h', count: 0, color: '#22c55e' },
      { label: '24 – 48h', count: 0, color: '#f59e0b' },
      { label: '48 – 72h', count: 0, color: '#f97316' },
      { label: '> 72h',   count: 0, color: '#ef4444' },
    ];
    filtered.forEach(l => {
      const up = l.uploadDate || l.upload_date;
      const fo = l.folderDate || l.folder_date;
      if (up && fo) {
        const h = calculateLocalSLA(up, fo, l.clientType);
        if (h < 12) bins[0].count++;
        else if (h < 24) bins[1].count++;
        else if (h < 48) bins[2].count++;
        else if (h < 72) bins[3].count++;
        else bins[4].count++;
      }
    });
    return bins;
  }, [filtered]);

  // ── Productividad por usuario ───────────────────────────────────────────────
  const userStats = useMemo(() => {
    const map: Record<string, { uploads: number; totalH: number; slaCount: number; compliant: number }> = {};
    filtered.forEach(l => {
      const name = l.userName || l.userId || 'Sistema';
      if (!map[name]) map[name] = { uploads: 0, totalH: 0, slaCount: 0, compliant: 0 };
      map[name].uploads++;
      const up = l.uploadDate || l.upload_date;
      const fo = l.folderDate || l.folder_date;
      if (up && fo) {
        const h   = calculateLocalSLA(up, fo, l.clientType);
        const lim = (l.clientType || '').toUpperCase() === 'NACIONAL' ? 72 : 24;
        map[name].totalH += h;
        map[name].slaCount++;
        if (h <= lim) map[name].compliant++;
      }
    });
    return Object.entries(map).map(([name, s]) => ({
      name,
      uploads:   s.uploads,
      avgHours:  s.slaCount > 0 ? Number((s.totalH / s.slaCount).toFixed(1)) : null,
      compliant: s.compliant,
      slaCount:  s.slaCount,
      pct:       s.slaCount > 0 ? Math.round((s.compliant / s.slaCount) * 100) : 100,
    })).sort((a, b) => b.uploads - a.uploads);
  }, [filtered]);

  // ── Cobertura chart data (top 15 por manifiestos) ───────────────────────────
  const coverageChartData = useMemo(() => {
    if (!coverage) return [];
    return coverage.data
      .filter(r => r.manifestCount > 0)
      .slice(0, 15)
      .map(r => ({ name: r.clientName.length > 22 ? r.clientName.slice(0, 20) + '…' : r.clientName, Manifiestos: r.manifestCount, Cumplidos: r.uploadCount }));
  }, [coverage]);

  const filteredCoverage = useMemo(() => {
    if (!coverage) return [];
    return coverageFilter === 'ALL' ? coverage.data : coverage.data.filter(r => r.status === coverageFilter);
  }, [coverage, coverageFilter]);

  // Datos enriquecidos para DataTable (campos computados para ordenamiento)
  const tableData = useMemo(() => filtered.map((l, idx) => {
    const up   = l.uploadDate || l.upload_date || '';
    const fo   = l.folderDate  || l.folder_date  || '';
    const type = l.clientType  || 'MUNICIPAL';
    const sla  = up && fo ? calculateLocalSLA(up, fo, type) : null;
    const lim  = type.toUpperCase() === 'NACIONAL' ? 72 : 24;
    return {
      ...l,
      _idx:        idx + 1,
      _fileName:   l.fileName   || l.file_name   || '',
      _clientName: l.clientName || l.client_id   || '',
      _userName:   l.userName   || l.userId       || '',
      _uploadDate: up,
      _folderDate: fo,
      _slaHours:   sla !== null ? Number(sla.toFixed(1)) : null,
      _slaLimit:   lim,
      _status:     l.status || 'SUCCESS',
    };
  }), [filtered]);

  const tableColumns: ColumnDef<(typeof tableData)[0]>[] = [
    { header: '#',              key: '_idx',        sortable: false,
      render: r => <span className="text-slate-400 font-medium">{r._idx}</span> },
    { header: 'Archivo',        key: '_fileName',
      render: r => <span className="font-bold text-slate-800 uppercase max-w-[200px] truncate block" title={r._fileName}>{r._fileName || '—'}</span> },
    { header: 'Cliente',        key: '_clientName',
      render: r => <span className="text-slate-600 uppercase">{r._clientName || '—'}</span> },
    { header: 'Subido Por',     key: '_userName',
      render: r => <span className="text-slate-500">{r._userName || '—'}</span> },
    { header: 'Fecha Documento', key: '_folderDate',
      render: r => <span className="text-slate-500 whitespace-nowrap">{r._folderDate ? fmtShortDate(r._folderDate) : '—'}</span> },
    { header: 'Fecha Subida',   key: '_uploadDate',
      render: r => <span className="text-slate-500 whitespace-nowrap">{r._uploadDate ? fmtDate(r._uploadDate) : '—'}</span> },
    { header: 'SLA (h)',        key: '_slaHours',
      render: r => r._slaHours !== null
        ? <span className={`font-black text-[11px] ${r._slaHours > r._slaLimit ? 'text-rose-600' : 'text-emerald-600'}`}>{r._slaHours}h</span>
        : <span className="text-slate-300">—</span> },
    { header: 'Estado',         key: '_status',
      render: r => <span className={`px-2 py-0.5 rounded-lg border font-black text-[9px] uppercase ${STATUS_BADGE[r._status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
        {r._status === 'SUCCESS' ? 'Exitoso' : r._status === 'ERROR' ? 'Error' : r._status}
      </span> },
    { header: 'Drive',          key: 'drive_link',  sortable: false,
      render: r => (r.driveLink || r.drive_link)
        ? <a href={r.driveLink || r.drive_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-black text-[9px] uppercase">
            <FileText size={10} />Abrir
          </a>
        : <span className="text-slate-300">—</span> },
  ];

  const exportToExcel = () => {
    if (filtered.length === 0) { toast.warning('No hay datos para exportar'); return; }
    import('xlsx').then(XLSX => {
      const data = filtered.map((h, i) => {
        const up = h.uploadDate || h.upload_date || '';
        const fo = h.folderDate || h.folder_date || '';
        const type = h.clientType || 'MUNICIPAL';
        const sla  = up && fo ? Number(calculateLocalSLA(up, fo, type).toFixed(1)) : 0;
        const lim  = type.toUpperCase() === 'NACIONAL' ? 72 : 24;
        return {
          '#': i + 1,
          'Archivo': h.fileName || h.file_name || '—',
          'Cliente': h.clientName || h.client_id || '—',
          'Tipo': type,
          'Subido Por': h.userName || h.userId || 'Sistema',
          'Fecha Subida': up ? new Date(up).toLocaleString('es-CO') : '—',
          'Fecha Documento': fo ? fmtShortDate(fo) : '—',
          'Tiempo Respuesta (h)': sla,
          'Límite SLA (h)': lim,
          'Estado SLA': sla <= lim ? 'CUMPLE' : 'DEMORADO',
          'Estado': h.status || 'SUCCESS',
          'Link Drive': h.driveLink || h.drive_link || '—',
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cumplidos Drive');
      if (coverage) {
        const covData = coverage.data.map(r => ({
          'Cliente': r.clientName, 'Manifiestos': r.manifestCount,
          'Cumplidos Subidos': r.uploadCount, 'Cobertura %': r.coveragePct ?? 'N/A',
          'Demora Prom (h)': r.avgDelayHours ?? '—', 'Estado': r.status,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(covData), 'Cobertura');
      }
      XLSX.writeFile(wb, `InformeDrive_${Date.now()}.xlsx`);
      toast.success('Reporte Excel descargado');
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-screen">

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-1">Gestión Documentos Drive — MOD-10</p>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Informe Gerencial Drive</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cobertura, tiempos de respuesta y productividad del equipo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2.5 border-2 border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm">
            <Download size={12} />Exportar
          </button>
        </div>
      </div>

      {/* ── FILTROS ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-end gap-4">
        <Filter size={14} className="text-slate-400 self-center" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 bg-white cursor-pointer">
          <option value="">Todos los estados</option>
          <option value="SUCCESS">Exitoso</option>
          <option value="ERROR">Con Error</option>
          <option value="PENDING">Pendiente</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 bg-white" />
        </div>
        <button onClick={handleRefresh} disabled={loading || loadingCov}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-md">
          <RefreshCw size={12} className={loading || loadingCov ? 'animate-spin' : ''} />
          {loading || loadingCov ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {/* ── BLOQUE 1: KPIs base + cobertura ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Subidos',    value: total,   icon: <Upload size={16} />,       color: 'bg-blue-600',    sub: 'archivos en Drive' },
          { label: 'Exitosos',         value: success, icon: <CheckCircle size={16} />,  color: 'bg-emerald-600', sub: `${total > 0 ? Math.round((success/total)*100) : 0}% del total` },
          { label: 'Con Error',        value: errors,  icon: <AlertCircle size={16} />,  color: 'bg-rose-600',    sub: 'requieren revisión' },
          { label: 'Pendientes',       value: pending, icon: <Clock size={16} />,        color: 'bg-amber-500',   sub: 'en procesamiento' },
          { label: 'Cobertura Global', value: coverage ? `${coverage.summary.coveragePct}%` : '—', icon: <Target size={16} />, color: 'bg-violet-600', sub: 'clientes cubiertos' },
          { label: 'Faltantes',        value: coverage ? coverage.summary.faltantes : '—', icon: <ShieldCheck size={16} />, color: 'bg-orange-500', sub: 'sin cumplido subido' },
        ].map(k => (
          <div key={k.label} className={`${k.color} text-white rounded-3xl p-4 shadow-sm`}>
            <div className="opacity-80 mb-2">{k.icon}</div>
            <p className="text-2xl font-black leading-none">{k.value}</p>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-75 mt-1">{k.label}</p>
            {k.sub && <p className="text-[9px] opacity-60 mt-0.5 font-bold">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── BLOQUE 2: COBERTURA VS MANIFIESTOS ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-indigo-500" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Cobertura vs. Manifiestos</h2>
          <span className="text-[9px] text-slate-400 font-bold uppercase">— Comparativo entre manifiestos del período y cumplidos subidos</span>
        </div>

        {/* Mini-KPIs cobertura */}
        {coverage && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Clientes con Manifiesto', value: coverage.summary.cubiertos + coverage.summary.faltantes, color: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
              { label: 'Cubiertos',  value: coverage.summary.cubiertos,  color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
              { label: 'Faltantes',  value: coverage.summary.faltantes,  color: 'border-rose-200 bg-rose-50 text-rose-700' },
              { label: 'Excedentes', value: coverage.summary.excedentes, color: 'border-amber-200 bg-amber-50 text-amber-700' },
            ].map(k => (
              <div key={k.label} className={`border-2 rounded-2xl p-4 ${k.color}`}>
                <p className="text-2xl font-black">{k.value}</p>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Gráfica grouped bar */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Manifiestos vs. Cumplidos por cliente (Top 15)</p>
          {coverageChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-300 text-[11px] font-black uppercase tracking-widest">
              {loadingCov ? 'Cargando cobertura…' : 'Sin datos — seleccione un rango de fechas y actualice'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={coverageChartData} margin={{ top: 10, right: 10, left: -10, bottom: 80 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }} angle={-40} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                <Bar dataKey="Manifiestos" fill="#6366f1" radius={[4,4,0,0]} />
                <Bar dataKey="Cumplidos"   fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabla de cobertura detallada */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
              Detalle por Cliente — {filteredCoverage.length} registros
            </span>
            <div className="flex items-center gap-1">
              {(['ALL','CUBIERTO','FALTANTE','EXCEDENTE'] as const).map(f => (
                <button key={f} onClick={() => setCoverageFilter(f)}
                  className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${coverageFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {f === 'ALL' ? 'Todos' : f}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Cliente','Manifiestos','Cumplidos Subidos','Cobertura %','Demora Prom. (h)','Estado'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider text-slate-500 whitespace-nowrap text-[9px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {loadingCov ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-[11px] font-black uppercase">Cargando…</td></tr>
                ) : filteredCoverage.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-300 text-[11px] font-black uppercase">Sin datos — actualice con un rango de fechas</td></tr>
                ) : filteredCoverage.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-800 font-black">{r.clientName}</td>
                    <td className="px-4 py-3 text-center text-indigo-700 font-black">{r.manifestCount}</td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      <span className="font-black">{r.uploadCount}</span>
                      {r.errorCount > 0 && <span className="ml-1 text-[9px] text-rose-500">({r.errorCount} error)</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.coveragePct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${r.coveragePct}%`, background: r.coveragePct >= 100 ? '#10b981' : r.coveragePct >= 50 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className="text-[10px] font-black text-slate-700 w-8 text-right">{r.coveragePct}%</span>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {r.avgDelayHours !== null ? `${r.avgDelayHours}h` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-lg border font-black text-[9px] uppercase tracking-wider ${COVERAGE_BADGE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── BLOQUE 3: ANÁLISIS DE TIEMPOS ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-amber-500" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Análisis de Tiempos de Respuesta</h2>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* SLA por cliente */}
          <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[340px]">
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Promedio horas hábiles</span>
            <h3 className="text-sm font-black text-slate-900 uppercase mb-1">Demora Promedio por Cliente</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase mb-4">Límites: Nacional 72h — Municipal 24h</p>
            {slaByClient.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-300 text-[11px] font-black uppercase">Sin datos SLA calculables</div>
            ) : (
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={slaByClient} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                    <XAxis type="number" stroke="#94a3b8" fontSize={9} unit="h" />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={130} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Horas prom." radius={[0,6,6,0]}>
                      {slaByClient.map((e, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Pie SLA compliance */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[340px]">
            <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-0.5">Cumplimiento SLA</span>
            <h3 className="text-sm font-black text-slate-900 uppercase mb-4">Dentro vs. Fuera de SLA</h3>
            <div className="flex-1 flex flex-col items-center gap-4">
              <div className="w-44 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={compliance} cx="50%" cy="50%" innerRadius={52} outerRadius={70} paddingAngle={4} dataKey="value">
                      {compliance.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full space-y-2">
                {compliance.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                      <span className="text-[10px] font-black text-slate-700 uppercase">{c.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block">{c.value}</span>
                      <span className="text-[9px] font-black" style={{ color: c.color }}>{c.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Histograma de demoras */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-0.5 block">Distribución de tiempos</span>
          <h3 className="text-sm font-black text-slate-900 uppercase mb-4">Histograma de Demoras en Subida</h3>
          {delayHistogram.every(b => b.count === 0) ? (
            <div className="flex items-center justify-center h-32 text-slate-300 text-[11px] font-black uppercase">Sin datos con fecha de documento registrada</div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {delayHistogram.map(bin => {
                const max = Math.max(...delayHistogram.map(b => b.count), 1);
                const pct = Math.round((bin.count / max) * 100);
                return (
                  <div key={bin.label} className="flex flex-col items-center gap-2">
                    <span className="text-sm font-black text-slate-800">{bin.count}</span>
                    <div className="w-full bg-slate-100 rounded-full h-24 flex items-end overflow-hidden">
                      <div className="w-full rounded-t-xl transition-all" style={{ height: `${pct}%`, background: bin.color, minHeight: bin.count > 0 ? 8 : 0 }} />
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase text-center">{bin.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── BLOQUE 4: PRODUCTIVIDAD POR USUARIO ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-cyan-500" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Productividad por Usuario</h2>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">{userStats.length} usuario{userStats.length !== 1 ? 's' : ''} con actividad</span>
          </div>
          {userStats.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-slate-300 text-[11px] font-black uppercase">Sin datos de productividad</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['#','Usuario','Archivos Subidos','Demora Prom. (h)','Dentro de SLA','% Cumplimiento','Rendimiento'].map(h => (
                      <th key={h} className="px-5 py-3 text-left font-black uppercase tracking-wider text-slate-500 text-[9px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userStats.map((u, i) => (
                    <tr key={u.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-5 py-3 font-black text-slate-800 uppercase">{u.name}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-lg font-black text-indigo-700">{u.uploads}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {u.avgHours !== null ? (
                          <span className={`font-black ${u.avgHours > 72 ? 'text-rose-600' : u.avgHours > 24 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {u.avgHours}h
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="font-black text-slate-700">{u.compliant}</span>
                        <span className="text-slate-400"> / {u.slaCount}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`font-black text-lg ${u.pct >= 90 ? 'text-emerald-600' : u.pct >= 70 ? 'text-amber-500' : 'text-rose-600'}`}>{u.pct}%</span>
                      </td>
                      <td className="px-5 py-3 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all"
                              style={{ width: `${u.pct}%`, background: u.pct >= 90 ? '#10b981' : u.pct >= 70 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {userStats.length > 1 && (
                  <tfoot className="border-t-2 border-slate-200">
                    <tr className="font-black text-slate-800">
                      <td colSpan={2} className="px-5 py-3 text-[9px] uppercase tracking-widest text-slate-500">TOTAL EQUIPO</td>
                      <td className="px-5 py-3 text-center text-lg text-indigo-700">{total}</td>
                      <td className="px-5 py-3 text-center text-[10px] text-slate-400">—</td>
                      <td className="px-5 py-3 text-center">{compliance[0].value} / {compliance[0].value + compliance[1].value}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-lg font-black ${compliance[0].pct >= 90 ? 'text-emerald-600' : compliance[0].pct >= 70 ? 'text-amber-500' : 'text-rose-600'}`}>
                          {compliance[0].pct}%
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── BLOQUE 5: REGISTRO DE ARCHIVOS ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-slate-500" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Registro de Archivos</h2>
          {isSuper && <span className="text-[9px] text-slate-400 font-bold uppercase">— Vista de todos los clientes</span>}
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <DataTable
            data={tableData}
            columns={tableColumns}
            searchPlaceholder="Buscar archivo, cliente, usuario…"
            excelFileName={`InformeDrive_${Date.now()}.xlsx`}
            excelSheetName="Cumplidos Drive"
            onExportExcel={() => exportToExcel()}
          />
        )}
      </section>
    </div>
  );
};

export default InformeDashboardDrive;
