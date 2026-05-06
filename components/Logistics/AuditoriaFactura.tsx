import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Search, RefreshCw, FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';

type Tab = 'subir' | 'consultar';

interface Client { id: string; name: string; }

interface Encabezado {
  id: number;
  os: string;
  fecha_carge: string;
  placa: string;
  conductor: string;
  fecha_programado: string;
  cant_clientes: number;
  nombre_ruta: string;
  coordinador: string;
  usuariocontrol: string;
  fechacontrol: string;
  valor_flete: number;
  client_id: string;
  uploaded_at: string;
  cant_facturas?: number;
}

interface Detalle {
  id: number;
  id_enca: number;
  factura: string;
  notas: string;
}

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtMoney = (v?: number) =>
  v != null ? `$${Number(v).toLocaleString('es-CO')}` : '—';

// ─── Tab 1: Subir planilla ────────────────────────────────────────────────────
const TabSubir: React.FC<{ user: User; clients: Client[] }> = ({ user, clients }) => {
  const [clientId, setClientId]     = useState(clients[0]?.id || '');
  const [file, setFile]             = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [result, setResult]         = useState<{ encabezados: number; detalles: number } | null>(null);
  const [error, setError]           = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (clients.length > 0 && !clientId) setClientId(clients[0].id); }, [clients]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError('');
  };

  const handleUpload = async () => {
    if (!file)     { toast.error('Seleccione un archivo Excel.'); return; }
    if (!clientId) { toast.error('Seleccione un cliente.'); return; }

    setUploading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientId', clientId);
      const res = await (api as any).uploadAuditoriaB36(formData);
      setResult(res);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(`Cargado: ${res.encabezados} encabezado(s), ${res.detalles} detalle(s)`);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar el archivo.');
      toast.error('Error al cargar el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) { toast.error('Librería no disponible.'); return; }

    import('xlsx').then(XLSXmod => {
      const encHeaders = [['OS','FECHA_CARGE','PLACA','CONDUCTOR','FECHA_PROGRAMADO','CANT_CLIENTES','NOMBRE_RUTA','COORDINADOR','USUARIOCONTROL','FECHACONTROL','VALOR_FLETE']];
      const detHeaders = [['ID_ENCA','FACTURA','NOTAS']];
      const wb = XLSXmod.utils.book_new();
      XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(encHeaders), 'Encabezado');
      XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(detHeaders), 'Detalle');
      XLSXmod.writeFile(wb, 'plantilla_auditoria_b36.xlsx');
    });
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Instrucciones */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-blue-700 space-y-1">
        <p className="font-black uppercase tracking-widest mb-2">Formato esperado del archivo</p>
        <p>• Hoja <strong>"Encabezado"</strong>: columnas OS, FECHA_CARGE, PLACA, CONDUCTOR, FECHA_PROGRAMADO, CANT_CLIENTES, NOMBRE_RUTA, COORDINADOR, USUARIOCONTROL, FECHACONTROL, VALOR_FLETE</p>
        <p>• Hoja <strong>"Detalle"</strong>: columnas ID_ENCA (posición del encabezado), FACTURA, NOTAS</p>
        <button onClick={downloadTemplate} className="mt-2 flex items-center gap-1.5 text-blue-600 font-black hover:underline">
          <Download size={12} /> Descargar plantilla vacía
        </button>
      </div>

      {/* Selector cliente */}
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cliente</label>
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-[12px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
        >
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* File input */}
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Archivo Excel (.xlsx)</label>
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
            file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 bg-slate-50'
          }`}
        >
          {file ? (
            <>
              <CheckCircle size={28} className="text-emerald-500" />
              <p className="text-[12px] font-black text-emerald-700">{file.name}</p>
              <p className="text-[10px] text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <FileSpreadsheet size={28} className="text-slate-300" />
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Haga clic para seleccionar</p>
              <p className="text-[10px] text-slate-300">Formato .xlsx — máx. 10 MB</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </div>
        {file && (
          <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
            className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-500 font-black transition-colors">
            <X size={11} /> Quitar archivo
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700 font-medium">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Carga exitosa</p>
            <p className="text-[10px] text-emerald-600">{result.encabezados} encabezado(s) y {result.detalles} detalle(s) importados.</p>
          </div>
        </div>
      )}

      {/* Botón subir */}
      <button
        onClick={handleUpload}
        disabled={uploading || !file}
        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-40"
      >
        {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
        {uploading ? 'Cargando...' : 'Subir Planilla'}
      </button>
    </div>
  );
};

// ─── Tab 2: Consultar / Descargar ─────────────────────────────────────────────
const TabConsultar: React.FC<{ user: User; clients: Client[] }> = ({ user, clients }) => {
  const [clientId, setClientId]     = useState(clients[0]?.id || '');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [searchOs, setSearchOs]     = useState('');
  const [searchPlaca, setSearchPlaca] = useState('');
  const [rows, setRows]             = useState<Encabezado[]>([]);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState<Record<number, Detalle[]>>({});
  const [loadingDet, setLoadingDet] = useState<number | null>(null);

  useEffect(() => { if (clients.length > 0 && !clientId) setClientId(clients[0].id); }, [clients]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await (api as any).getAuditoriaB36Encabezados({ clientId, from: dateFrom, to: dateTo, placa: searchPlaca, os: searchOs });
      setRows(Array.isArray(data) ? data : []);
      setExpanded({});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleDetalle = async (id: number) => {
    if (expanded[id]) {
      setExpanded(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setLoadingDet(id);
    try {
      const det = await (api as any).getAuditoriaB36Detalle(id);
      setExpanded(prev => ({ ...prev, [id]: Array.isArray(det) ? det : [] }));
    } catch {
      setExpanded(prev => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingDet(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro y sus detalles?')) return;
    try {
      await (api as any).deleteAuditoriaB36(id);
      setRows(prev => prev.filter(r => r.id !== id));
      toast.success('Registro eliminado.');
    } catch {
      toast.error('Error al eliminar.');
    }
  };

  const handleExport = (id: number) => {
    const token = (user as any)?.token || localStorage.getItem('token') || '';
    const url = `/api/ajover-b36/export/${id}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `auditoria_b36_${id}.xlsx`;
        a.click();
      });
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white"
        >
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <input type="text" placeholder="OS / Carga..." value={searchOs}
          onChange={e => setSearchOs(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white w-32" />

        <input type="text" placeholder="Placa..." value={searchPlaca}
          onChange={e => setSearchPlaca(e.target.value.toUpperCase())}
          className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white w-28" />

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-medium focus:outline-none focus:border-emerald-400 bg-white" />
        </div>

        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50">
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
          {loading ? 'Buscando...' : 'Consultar'}
        </button>
      </div>

      {/* Tabla */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
            Planillas — {rows.length} registro{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                {['OS', 'Fecha Carge', 'Placa', 'Conductor', 'Ruta', 'F. Programado', 'Clientes', 'Valor Flete', 'Facturas', 'Cargado', 'Acciones'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={12} className="py-16 text-center">
                  <RefreshCw size={20} className="animate-spin text-slate-300 mx-auto" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet size={28} className="text-slate-300" />
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Sin planillas</p>
                    <p className="text-[10px] text-slate-300">Seleccione filtros y presione Consultar</p>
                  </div>
                </td></tr>
              ) : rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-slate-50 transition-colors">
                    {/* Expandir detalle */}
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleDetalle(row.id)}
                        className="text-slate-400 hover:text-emerald-600 transition-colors">
                        {loadingDet === row.id
                          ? <RefreshCw size={13} className="animate-spin" />
                          : expanded[row.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-black text-slate-900">{row.os || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(row.fecha_carge)}</td>
                    <td className="px-3 py-2.5">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-black">{row.placa || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.conductor || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium">{row.nombre_ruta || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(row.fecha_programado)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700 font-bold">{row.cant_clientes ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-black text-emerald-700">{fmtMoney(row.valor_flete)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-black text-[10px]">{row.cant_facturas ?? 0}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-[10px]">{fmtDate(row.uploaded_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleExport(row.id)} title="Descargar Excel"
                          className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                          <Download size={12} />
                        </button>
                        <button onClick={() => handleDelete(row.id)} title="Eliminar"
                          className="p-1.5 rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Detalle expandido */}
                  {expanded[row.id] && (
                    <tr>
                      <td colSpan={12} className="bg-slate-50 px-8 py-3 border-b border-slate-200">
                        {expanded[row.id].length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic">Sin facturas de detalle registradas.</p>
                        ) : (
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-slate-500 font-black uppercase tracking-wider">
                                <th className="py-1 pr-6 text-left">#</th>
                                <th className="py-1 pr-6 text-left">Factura</th>
                                <th className="py-1 text-left">Notas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {expanded[row.id].map((d, i) => (
                                <tr key={d.id}>
                                  <td className="py-1 pr-6 text-slate-400">{i + 1}</td>
                                  <td className="py-1 pr-6 font-black text-slate-800">{d.factura || '—'}</td>
                                  <td className="py-1 text-slate-500">{d.notas || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const AuditoriaFactura: React.FC<{ user: User }> = ({ user }) => {
  const [tab, setTab]         = useState<Tab>('subir');
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    const allowedIds: string[] = (user as any)?.clientIds?.length
      ? (user as any).clientIds
      : (user as any)?.clientId ? [(user as any).clientId] : [];

    api.getClients().then((all: any[]) => {
      const isAdmin = allowedIds.includes('CLI-01') || allowedIds.length === 0;
      const filtered = isAdmin ? all : all.filter((c: any) => allowedIds.includes(c.id));
      setClients(filtered.map((c: any) => ({ id: c.id, name: c.name || c.id })));
    }).catch(() => {});
  }, [user]);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'subir',     label: 'Subir Planilla',         icon: <Upload size={13} /> },
    { key: 'consultar', label: 'Consultar / Descargar',  icon: <Download size={13} /> },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Gestión Ajover — MOD-03</p>
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Auditoría Factura — Bodega 36</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'subir'     && <TabSubir     user={user} clients={clients} />}
      {tab === 'consultar' && <TabConsultar user={user} clients={clients} />}
    </div>
  );
};

export default AuditoriaFactura;
