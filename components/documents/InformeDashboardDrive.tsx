import React, { useState, useEffect, useMemo } from 'react';
import { FileText, TrendingUp, Upload, CheckCircle, AlertCircle, Clock, Download, RefreshCw, Filter, Users } from 'lucide-react';
import { User } from '../../types';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, 
  PieChart, Pie
} from 'recharts';
import { toast } from 'sonner';

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
  fileName?: string;
  file_name?: string;
  category?: string;
  clientName?: string;
  client_id?: string;
  clientType?: string;
  uploadDate?: string;
  upload_date?: string;
  folderDate?: string;
  folder_date?: string;
  status?: string;
  driveLink?: string;
  drive_link?: string;
  userId?: string;
  user_id?: string;
  userName?: string;
  isDeleted?: boolean;
  deleteReason?: string;
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ERROR:   'bg-rose-50 text-rose-700 border-rose-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

const COLORS = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
];

// Cálculo del SLA contemplando el horario hábil colombiano (Lunes a Sábado de 07:00 a 17:00, sin domingos ni festivos)
const calculateLocalSLA = (uploadStr?: string, folderStr?: string, type?: string) => {
  if (!uploadStr || !folderStr) return 0;

  const upload = new Date(uploadStr);
  const folder = folderStr.includes('T') ? new Date(folderStr) : new Date(`${folderStr}T12:00:00`);

  const uploadMs = isNaN(upload.getTime()) ? Date.now() : upload.getTime();
  const folderMs = isNaN(folder.getTime()) ? uploadMs : folder.getTime();

  if (uploadMs <= folderMs) {
    return 0;
  }

  const years = new Set<number>([new Date(folderMs).getFullYear(), new Date(uploadMs).getFullYear()]);
  const colombianHolidays = new Set<string>();

  const getColombiaHolidays = (year: number): Set<string> => {
    const holidays = new Set<string>();
    const add = (month: number, day: number) => {
      holidays.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    };
    const addMovable = (month: number, day: number) => {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 1) {
        add(month, day);
      } else {
        const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        const movedDate = new Date(year, month - 1, day + daysToAdd);
        add(movedDate.getMonth() + 1, movedDate.getDate());
      }
    };

    add(1, 1);    // Año Nuevo
    add(5, 1);    // Día del Trabajo
    add(7, 20);   // Independencia de Colombia
    add(8, 7);    // Batalla de Boyacá
    add(12, 8);   // Inmaculada Concepción
    add(12, 25);  // Navidad

    addMovable(1, 6);   // Reyes Magos
    addMovable(3, 19);  // San José
    addMovable(6, 29);  // San Pedro y San Pablo
    addMovable(8, 15);  // Asunción de la Virgen
    addMovable(10, 12); // Día de la Raza
    addMovable(11, 1);  // Todos los Santos
    addMovable(11, 11); // Independencia de Cartagena

    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const L = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * L) / 451);
    const month = Math.floor((h + L - 7 * m + 114) / 31);
    const day = ((h + L - 7 * m + 114) % 31) + 1;

    const easter = new Date(year, month - 1, day);
    const addFromEaster = (days: number, isMovable = false) => {
      const d = new Date(easter);
      d.setDate(easter.getDate() + days);
      if (isMovable) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 1) {
          const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
          d.setDate(d.getDate() + daysToAdd);
        }
      }
      add(d.getMonth() + 1, d.getDate());
    };

    addFromEaster(-3); // Jueves Santo
    addFromEaster(-2); // Viernes Santo
    addFromEaster(39, true); // Ascensión del Señor
    addFromEaster(60, true); // Corpus Christi
    addFromEaster(68, true); // Sagrado Corazón

    return holidays;
  };

  years.forEach(y => {
    const yHols = getColombiaHolidays(y);
    yHols.forEach(h => colombianHolidays.add(h));
  });

  let totalMs = 0;
  const currentDay = new Date(folderMs);
  const endDay = new Date(uploadMs);

  const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const startTrunc = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate());
  const endTrunc = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate());

  for (let t = startTrunc.getTime(); t <= endTrunc.getTime(); t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    const dayOfWeek = d.getDay();
    const ymd = toYMD(d);

    if (dayOfWeek === 0 || colombianHolidays.has(ymd)) {
      continue;
    }

    if (startTrunc.getTime() === endTrunc.getTime()) {
      const startHour = 7;
      const endHour = 17;

      const uploadHour = endDay.getHours() + endDay.getMinutes() / 60;
      const activeStart = startHour;
      const activeEnd = Math.min(endHour, Math.max(startHour, uploadHour));
      totalMs += (activeEnd - activeStart) * 60 * 60 * 1000;
    } else if (t === startTrunc.getTime()) {
      totalMs += 10 * 60 * 60 * 1000;
    } else if (t === endTrunc.getTime()) {
      const startHour = 7;
      const endHour = 17;

      const uploadHour = endDay.getHours() + endDay.getMinutes() / 60;
      const activeStart = startHour;
      const activeEnd = Math.min(endHour, Math.max(startHour, uploadHour));
      totalMs += (activeEnd - activeStart) * 60 * 60 * 1000;
    } else {
      totalMs += 10 * 60 * 60 * 1000;
    }
  }

  const diffHours = totalMs / (1000 * 60 * 60);
  return isNaN(diffHours) ? 0 : diffHours;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl shadow-2xl text-[10px] text-white">
        <p className="font-black uppercase tracking-wider mb-2 text-slate-400">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="font-black flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-slate-300 capitalize">{p.name}:</span>
            <span className="font-black text-white">{p.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
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

  // Filtrado local que reacciona de forma reactiva a los inputs
  const filtered = useMemo(() => {
    return logs.filter(l => {
      const fName = (l.fileName || l.file_name || '').toLowerCase();
      const cName = (l.clientName || l.client_id || '').toLowerCase();
      const term = search.toLowerCase();
      const matchSearch = !search || fName.includes(term) || cName.includes(term);
      
      const logStatus = l.status || 'SUCCESS';
      const matchStatus = !filterStatus || logStatus === filterStatus;
      
      return matchSearch && matchStatus;
    });
  }, [logs, search, filterStatus]);

  // Métricas de KPIs
  const total    = filtered.length;
  const success  = filtered.filter(l => (l.status || 'SUCCESS') === 'SUCCESS').length;
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

  // 1. Archivos subidos por usuario
  const uploadsByUser = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(log => {
      const name = log.userName || log.userId || 'Sistema';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // 2. Archivos por Cliente y Tipo de Cliente
  const clientTypeStats = useMemo(() => {
    let national = 0;
    let municipal = 0;
    filtered.forEach(log => {
      const type = (log.clientType || 'MUNICIPAL').toUpperCase();
      if (type.includes('NACIONAL')) national++;
      else municipal++;
    });
    return [
      { name: 'Nacionales', value: national },
      { name: 'Municipales', value: municipal },
    ];
  }, [filtered]);

  // 3. Tiempos de respuesta en orden del que más se demora (promedios)
  const averageSLAByClient = useMemo(() => {
    const clientTimes: Record<string, { totalHours: number; count: number }> = {};
    filtered.forEach(log => {
      const client = log.clientName || log.client_id || 'Sin Cliente';
      const upDate = log.uploadDate || log.upload_date;
      const folDate = log.folderDate || log.folder_date;
      const type = log.clientType || 'MUNICIPAL';
      if (upDate && folDate) {
        const hours = calculateLocalSLA(upDate, folDate, type);
        if (!clientTimes[client]) {
          clientTimes[client] = { totalHours: 0, count: 0 };
        }
        clientTimes[client].totalHours += hours;
        clientTimes[client].count += 1;
      }
    });

    return Object.entries(clientTimes)
      .map(([name, stat]) => ({
        name,
        value: Number((stat.totalHours / stat.count).toFixed(1))
      }))
      .sort((a, b) => b.value - a.value); // Orden del que más se demora a menor (descendente)
  }, [filtered]);

  // 4. Tasa de Cumplimiento de SLA Global para toma de decisiones
  const complianceStats = useMemo(() => {
    let compliant = 0;
    let nonCompliant = 0;
    filtered.forEach(log => {
      const upDate = log.uploadDate || log.upload_date;
      const folDate = log.folderDate || log.folder_date;
      const type = log.clientType || 'MUNICIPAL';
      if (upDate && folDate) {
        const hours = calculateLocalSLA(upDate, folDate, type);
        const limit = type.toUpperCase() === 'NACIONAL' ? 72 : 24;
        if (hours <= limit) compliant++;
        else nonCompliant++;
      }
    });
    const totalWithDate = compliant + nonCompliant;
    return [
      { name: 'Dentro de SLA', value: compliant, percentage: totalWithDate > 0 ? Math.round((compliant / totalWithDate) * 100) : 100 },
      { name: 'Fuera de SLA', value: nonCompliant, percentage: totalWithDate > 0 ? Math.round((nonCompliant / totalWithDate) * 100) : 0 }
    ];
  }, [filtered]);

  const exportToExcel = () => {
    if (filtered.length === 0) {
      toast.warning('No hay datos para exportar');
      return;
    }
    import('xlsx').then(XLSX => {
      const data = filtered.map((h, idx) => {
        const upDate = h.uploadDate || h.upload_date || '';
        const folDate = h.folderDate || h.folder_date || '';
        const type = h.clientType || 'MUNICIPAL';
        const slaHours = upDate && folDate ? Number(calculateLocalSLA(upDate, folDate, type).toFixed(1)) : 0;
        const limit = type.toUpperCase() === 'NACIONAL' ? 72 : 24;
        const stateSLA = slaHours <= limit ? 'CUMPLE' : 'DEMORADO';

        return {
          '#': idx + 1,
          'Archivo': h.fileName || h.file_name,
          'Categoría': h.category || 'CUMPLIDOS',
          'Cliente': h.clientName || h.client_id,
          'Tipo Cliente': type,
          'Fecha Carpeta (Documento)': folDate,
          'Fecha Subida': upDate ? new Date(upDate).toLocaleString('es-CO') : '—',
          'Tiempo de Respuesta (Horas Hábiles)': slaHours,
          'Límite SLA (Horas)': limit,
          'Estado SLA': stateSLA,
          'Subido Por': h.userName || h.userId || 'Sistema',
          'Drive Link': h.driveLink || h.drive_link || '—'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Trazabilidad Drive');
      XLSX.writeFile(workbook, `Reporte_Cumplidos_Drive_${new Date().getTime()}.xlsx`);
      toast.success('📊 Reporte Excel descargado correctamente');
    });
  };

  return (
    <div className="p-6 space-y-6">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className={`p-5 rounded-[2rem] border-2 shadow-sm ${card.color} flex items-start gap-3.5 transition-all hover:scale-[1.02]`}>
            <div className="mt-0.5 opacity-70">{card.icon}</div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-0.5">{card.label}</p>
              <p className="text-3xl font-black leading-none">{card.value}</p>
              {card.sub && <p className="text-[9px] opacity-65 mt-1 font-bold uppercase tracking-wider">{card.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-5 bg-slate-50 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <Filter size={14} className="text-slate-400" />

        <input
          type="text"
          placeholder="Buscar archivo o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 bg-white transition-all shadow-sm"
        />

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 bg-white shadow-sm cursor-pointer"
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
            className="px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 bg-white shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-4 py-2.5 border-2 border-slate-200 rounded-2xl text-[11px] font-bold focus:outline-none focus:border-emerald-500 bg-white shadow-sm"
          />
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-slate-900/10"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>

        <button 
          onClick={exportToExcel}
          className="flex items-center gap-2 px-5 py-2.5 border-2 border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:border-slate-300 transition-all cursor-pointer shadow-sm"
        >
          <Download size={12} />
          Exportar
        </button>
      </div>

      {/* Sección de Gráficas Estadísticas para Toma de Decisiones de Gerencia */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Gráfica 1: Tiempos de Respuesta Promedio por Cliente (SLA) */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl flex flex-col min-h-[380px]">
          <div className="mb-4">
            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-0.5">SLA de Respuesta</span>
            <h3 className="text-sm font-black text-slate-900 uppercase">Tiempos de Respuesta Promedio por Cliente (Horas Hábiles)</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-relaxed">
              Ordenado de mayor a menor tiempo de demora. Límites permitidos: Nacional (72h) / Municipal (24h)
            </p>
          </div>
          {averageSLAByClient.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 italic text-[11px] font-bold uppercase tracking-wider">
              No hay datos de SLA calculables
            </div>
          ) : (
            <div className="flex-1 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={averageSLAByClient} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="#94a3b8" fontSize={9} fontStyle="bold" unit="h" />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={120} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Promedio Horas SLA" radius={[0, 8, 8, 0]}>
                    {averageSLAByClient.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Gráfica 2: Archivos Subidos por Usuario */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl flex flex-col min-h-[380px]">
          <div className="mb-4">
            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-0.5">Carga de Trabajo</span>
            <h3 className="text-sm font-black text-slate-900 uppercase">Cantidad de Archivos Subidos por Usuario</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-relaxed">
              Métricas de productividad individual del equipo de soporte
            </p>
          </div>
          {uploadsByUser.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 italic text-[11px] font-bold uppercase tracking-wider">
              No hay datos de productividad por usuario
            </div>
          ) : (
            <div className="flex-1 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={uploadsByUser} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                  <YAxis stroke="#94a3b8" fontSize={9} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Archivos Subidos" fill="#10b981" radius={[8, 8, 0, 0]}>
                    {uploadsByUser.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Gráfica 3: Tasa de Cumplimiento de SLA */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl flex flex-col min-h-[380px]">
          <div className="mb-4">
            <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest block mb-0.5">Cumplimiento SLA</span>
            <h3 className="text-sm font-black text-slate-900 uppercase">Tasa de Cumplimiento de SLA</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-relaxed">
              Porcentaje de archivos cargados dentro del tiempo reglamentario
            </p>
          </div>
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 italic text-[11px] font-bold uppercase tracking-wider">
              No hay datos de cumplimiento disponibles
            </div>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row items-center justify-around gap-6">
              <div className="w-52 h-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={complianceStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      <Cell name="Dentro de SLA" fill="#10b981" />
                      <Cell name="Fuera de SLA" fill="#f43f5e" />
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-4">
                {complianceStats.map((stat, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: i === 0 ? '#10b981' : '#f43f5e' }} />
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{stat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block">{stat.value} archivos</span>
                      <span className={`text-[10px] font-black ${i === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gráfica 4: Segmentación por Tipo de Cliente (Nacionales vs Municipales) */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl flex flex-col min-h-[380px]">
          <div className="mb-4">
            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest block mb-0.5">Tipología de Soportes</span>
            <h3 className="text-sm font-black text-slate-900 uppercase">Segmentación por Tipo de Cliente</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-relaxed">
              Distribución de soportes cargados por mercado geográfico
            </p>
          </div>
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 italic text-[11px] font-bold uppercase tracking-wider">
              No hay datos tipológicos disponibles
            </div>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row items-center justify-around gap-6">
              <div className="w-52 h-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientTypeStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      <Cell name="Nacionales" fill="#6366f1" />
                      <Cell name="Municipales" fill="#06b6d4" />
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-4">
                {clientTypeStats.map((stat, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: i === 0 ? '#6366f1' : '#06b6d4' }} />
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{stat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block">{stat.value} archivos</span>
                      <span className="text-[10px] font-black text-slate-500">
                        {filtered.length > 0 ? Math.round((stat.value / filtered.length) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Tabla */}
      <div className="border border-slate-200 rounded-[2.5rem] overflow-hidden bg-white shadow-xl animate-in fade-in duration-700">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
            Registro de Archivos — {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
          {isSuper && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <Users size={12} />
              Vista de todos los clientes
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['#', 'Archivo', 'Categoría', 'Cliente', 'Subido Por', 'Fecha Subida', 'Estado', 'Enlace Drive'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw size={24} className="text-slate-300 animate-spin" />
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Cargando registros...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileText size={32} className="text-slate-300" />
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Sin registros</p>
                      <p className="text-[10px] text-slate-300 font-bold uppercase">No hay archivos que coincidan con los filtros</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((log, idx) => {
                const fName = log.fileName || log.file_name || '—';
                const cName = log.clientName || log.client_id || '—';
                const uDate = log.uploadDate || log.upload_date || '';
                const uName = log.userName || log.userId || '—';
                const dLink = log.driveLink || log.drive_link || '';
                const logStatus = log.status || 'SUCCESS';

                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-5 py-3 text-slate-800 max-w-[250px] truncate uppercase tracking-tight" title={fName}>
                      {fName}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg font-black text-[9px] uppercase tracking-wider">
                        {log.category || 'CUMPLIDOS'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 uppercase tracking-tight">{cName}</td>
                    <td className="px-5 py-3 text-slate-600 uppercase tracking-tight">{uName}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(uDate)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-lg font-black text-[9px] border uppercase tracking-wider ${STATUS_BADGE[logStatus] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {logStatus === 'SUCCESS' ? 'Exitoso' : logStatus === 'ERROR' ? 'Error' : logStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {dLink ? (
                        <a
                          href={dLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-black text-[9px] uppercase tracking-wider transition-colors"
                        >
                          <FileText size={11} />
                          Abrir Link
                        </a>
                      ) : (
                        <span className="text-slate-300 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InformeDashboardDrive;
