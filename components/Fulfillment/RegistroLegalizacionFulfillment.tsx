import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Loader2, Trash2, DollarSign, TrendingUp, Package, Users, X, Search, Plus, FileDown } from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';
import { LineaManualForm, MESES } from './LineaManualForm';

interface Props { user: User; }

interface Cliente { id: number; codigo: string; nombre: string; moneda: 'USD' | 'COP'; }
interface MasterItem { id: number; nombre: string; }
interface Registro {
  id: number; cliente_id: number; cliente_nombre: string; cliente_codigo: string; cliente_moneda: 'USD' | 'COP';
  anio: number; mes: string; subtipo: string | null; hoja_origen: string | null;
  moneda: 'USD' | 'COP'; valor_total: string; costo_transporte_total: string; utilidad: string;
  num_lineas: number; referencia_factura: string | null; fecha_creacion: string;
}
interface DetalleRow {
  id: number; fecha: string | null; producto_servicio_nombre: string | null; descripcion: string | null;
  orden: string | null; cantidad: string; tarifa: string; monto: string;
  costo_transportista: string | null; transportista_nombre: string | null; seguimiento: string | null;
}

const fmt = (v: any, moneda: string) => {
  const n = Math.round(Number(v) || 0);
  return moneda === 'USD' ? `US$${n.toLocaleString('en-US')}` : `$${n.toLocaleString('es-CO')}`;
};
const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";

const KpiCard: React.FC<{ label: string; value: string; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className={`rounded-2xl border-2 p-4 ${color}`}>
    <div className="flex items-center justify-between">
      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</p>
      {icon}
    </div>
    <p className="text-xl font-black mt-1">{value}</p>
  </div>
);

// ── Modal Detalle (compartido por las 2 pestañas) ───────────────────────────
// Incluye el mismo formulario de captura de línea (reutilizado), en modo "período fijo":
// se puede agregar un ítem/producto/valor nuevo directamente a ESTE registro ya existente.
const DetalleModal: React.FC<{
  registro: Registro; onClose: () => void; clientes: Cliente[]; onRegistroChanged?: () => void;
}> = ({ registro, onClose, clientes, onRegistroChanged }) => {
  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<MasterItem[]>([]);
  const [transportistas, setTransportistas] = useState<MasterItem[]>([]);

  const cargarDetalle = async () => {
    setLoading(true);
    try {
      const res = await api.getFulfillmentRegistroDetalle(registro.id);
      setRows(res.success ? res.detalle : []);
    } catch { toast.error('Error al cargar el detalle'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    cargarDetalle();
    api.getFulfillmentProductos().then(r => setProductos(r.success ? r.data : [])).catch(() => {});
    api.getFulfillmentTransportistas().then(r => setTransportistas(r.success ? r.data : [])).catch(() => {});
  }, [registro.id]);

  const handleLineaAgregada = () => {
    cargarDetalle();
    onRegistroChanged?.();
  };

  const columns: ColumnDef<DetalleRow>[] = [
    { header: 'Fecha', key: 'fecha', sortable: true, render: r => r.fecha ? new Date(r.fecha).toLocaleDateString('es-CO') : '—' },
    { header: 'Producto/Servicio', key: 'producto_servicio_nombre', sortable: true },
    { header: 'Descripción', key: 'descripcion', sortable: false },
    { header: 'Cantidad', key: 'cantidad', sortable: true },
    { header: 'Tarifa', key: 'tarifa', sortable: true, render: r => fmt(r.tarifa, registro.moneda) },
    { header: 'Monto', key: 'monto', sortable: true, render: r => <span className="font-black">{fmt(r.monto, registro.moneda)}</span> },
    { header: 'Costo Transportista', key: 'costo_transportista', sortable: true, render: r => r.costo_transportista ? fmt(r.costo_transportista, registro.moneda) : '—' },
    { header: 'Transportista', key: 'transportista_nombre', sortable: true, render: r => r.transportista_nombre || '—' },
    { header: 'Seguimiento', key: 'seguimiento', sortable: true, render: r => r.seguimiento || '—' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-8 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-indigo-200 uppercase tracking-widest mb-0.5">{registro.cliente_nombre}</p>
            <p className="text-lg font-black text-white">{registro.mes} {registro.anio}{registro.subtipo ? ` · ${registro.subtipo}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 mb-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Agregar ítem / producto / valor a este registro</p>
            <LineaManualForm
              clientes={clientes} productos={productos} transportistas={transportistas}
              periodoFijo={{ cliente_id: registro.cliente_id, anio: registro.anio, mes: registro.mes, subtipo: registro.subtipo }}
              onSaved={handleLineaAgregada}
            />
          </div>
          {loading
            ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
            : <DataTable<DetalleRow> data={rows} columns={columns} searchPlaceholder="Buscar..." excelFileName={`fulfillment_${registro.cliente_codigo}_${registro.mes}_${registro.anio}.xlsx`} excelSheetName="Detalle" />
          }
        </div>
      </div>
    </div>
  );
};

export default function RegistroLegalizacionFulfillment({ user }: Props) {
  const [tab, setTab] = useState<'consulta' | 'registro'>('consulta');
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    api.getFulfillmentClientes().then(res => setClientes(res.success ? res.data : [])).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {[
          { key: 'consulta', label: 'Consulta' },
          { key: 'registro', label: 'Registro' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-5 py-2.5 text-sm font-bold rounded-t-2xl transition border-b-2 -mb-px ${
              tab === t.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'consulta' && <ConsultaTab clientes={clientes} />}
      {tab === 'registro' && <RegistroTab clientes={clientes} user={user} />}
    </div>
  );
}

// ══════════════════════════════ TAB: CONSULTA (solo lectura) ═══════════════
function ConsultaTab({ clientes }: { clientes: Cliente[] }) {
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [resumen, setResumen] = useState<{ porMoneda: any[]; topTransportistas: any[]; topProductos: any[] } | null>(null);
  const [detalleReg, setDetalleReg] = useState<Registro | null>(null);

  const buscar = async (opts?: { latest?: boolean }) => {
    setLoading(true);
    const filtros = opts?.latest
      ? { latest: true }
      : { cliente_id: filtroCliente || undefined, anio: filtroAnio || undefined, mes: filtroMes || undefined };
    try {
      const [regRes, resRes] = await Promise.all([
        api.getFulfillmentRegistros(filtros),
        api.getFulfillmentResumenGerencial(filtros),
      ]);
      setRegistros(regRes.success ? regRes.data : []);
      if (resRes.success) setResumen(resRes);
    } catch { toast.error('Error al consultar'); }
    finally { setLoading(false); }
  };

  // Al entrar, se muestra automáticamente solo el último mes/año — sin necesidad de filtrar.
  useEffect(() => { buscar({ latest: true }); }, []);

  const limpiar = () => {
    setFiltroCliente(''); setFiltroAnio(''); setFiltroMes('');
    buscar({ latest: true });
  };

  const usd = resumen?.porMoneda.find(m => m.moneda === 'USD');
  const cop = resumen?.porMoneda.find(m => m.moneda === 'COP');

  const columns: ColumnDef<Registro>[] = [
    { header: 'Cliente', key: 'cliente_nombre', sortable: true, render: r => <span className="font-black text-slate-800">{r.cliente_nombre}</span> },
    { header: 'Periodo', key: 'mes', sortable: true, render: r => <span>{r.mes} {r.anio}{r.subtipo ? ` · ${r.subtipo}` : ''}</span> },
    { header: 'Moneda', key: 'moneda', sortable: true, render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.moneda === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.moneda}</span> },
    { header: 'Valor Total', key: 'valor_total', sortable: true, render: r => <span className="font-black text-slate-800">{fmt(r.valor_total, r.moneda)}</span> },
    { header: 'Costo Transporte', key: 'costo_transporte_total', sortable: true, render: r => fmt(r.costo_transporte_total, r.moneda) },
    { header: 'Utilidad', key: 'utilidad', sortable: true, render: r => <span className="font-black text-emerald-700">{fmt(r.utilidad, r.moneda)}</span> },
    { header: 'Líneas', key: 'num_lineas', sortable: true },
    { header: 'Factura', key: 'referencia_factura', sortable: true, render: r => r.referencia_factura || '—' },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: r => <button onClick={() => setDetalleReg(r)} className="text-indigo-600 hover:text-indigo-800 font-black text-[9px] uppercase">Ver Detalle</button>,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Facturado USD" value={fmt(usd?.valor_total || 0, 'USD')} icon={<DollarSign className="w-4 h-4" />} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
        <KpiCard label="Facturado COP" value={fmt(cop?.valor_total || 0, 'COP')} icon={<DollarSign className="w-4 h-4" />} color="bg-blue-50 border-blue-100 text-blue-800" />
        <KpiCard label="Utilidad USD" value={fmt(usd?.utilidad || 0, 'USD')} icon={<TrendingUp className="w-4 h-4" />} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
        <KpiCard label="Utilidad COP" value={fmt(cop?.utilidad || 0, 'COP')} icon={<TrendingUp className="w-4 h-4" />} color="bg-blue-50 border-blue-100 text-blue-800" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Top Transportistas por Costo</p>
          {resumen?.topTransportistas.length ? resumen.topTransportistas.map((t: any) => (
            <div key={t.nombre} className="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-600">{t.nombre}</span>
              <span className="text-slate-400">{t.envios} envíos</span>
            </div>
          )) : <p className="text-xs text-slate-300 py-3 text-center">Sin datos</p>}
        </div>
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Top Productos/Servicios por Monto</p>
          {resumen?.topProductos.length ? resumen.topProductos.map((p: any) => (
            <div key={p.nombre} className="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-600">{p.nombre}</span>
              <span className="text-slate-400">{p.lineas} líneas</span>
            </div>
          )) : <p className="text-xs text-slate-300 py-3 text-center">Sin datos</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 mb-5 flex flex-wrap items-end gap-3">
        <div className="w-52"><label className={labelCls}>Cliente</label>
          <select className={inputCls} value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="w-32"><label className={labelCls}>Año</label><input className={inputCls} value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} placeholder="2026" /></div>
        <div className="w-40"><label className={labelCls}>Mes</label>
          <select className={inputCls} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="">Todos</option>
            {MESES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <button onClick={() => buscar()} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Consultar
        </button>
        <button onClick={limpiar} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest">Limpiar</button>
        <p className="text-[9px] text-slate-400 font-bold ml-auto">Al entrar se muestra solo el último mes con información. Cambia los filtros y presiona Consultar para ver otro período.</p>
      </div>

      <DataTable<Registro> data={registros} columns={columns} loading={loading} searchPlaceholder="Buscar cliente, periodo..." excelFileName="fulfillment_consulta.xlsx" excelSheetName="Consulta" />

      {detalleReg && <DetalleModal registro={detalleReg} onClose={() => setDetalleReg(null)} clientes={clientes} onRegistroChanged={() => buscar()} />}
    </div>
  );
}

// ══════════════════════════════ TAB: REGISTRO (crear / importar / gestionar) ═
function RegistroTab({ clientes, user }: { clientes: Cliente[]; user: User }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<MasterItem[]>([]);
  const [transportistas, setTransportistas] = useState<MasterItem[]>([]);

  const [detalleReg, setDetalleReg] = useState<Registro | null>(null);
  const [confirmDel, setConfirmDel] = useState<Registro | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showLinea, setShowLinea] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importCliente, setImportCliente] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingPlantilla, setDownloadingPlantilla] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDescargarPlantilla = async () => {
    setDownloadingPlantilla(true);
    try { await api.downloadFulfillmentPlantilla(); }
    catch (e: any) { toast.error(e.message || 'No se pudo descargar la plantilla'); }
    finally { setDownloadingPlantilla(false); }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await api.getFulfillmentRegistros();
      setRegistros(res.success ? res.data : []);
    } catch { toast.error('Error al cargar registros'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    loadAll();
    api.getFulfillmentProductos().then(r => setProductos(r.success ? r.data : [])).catch(() => {});
    api.getFulfillmentTransportistas().then(r => setTransportistas(r.success ? r.data : [])).catch(() => {});
  }, []);

  const handleImport = async () => {
    if (!importCliente) { toast.error('Selecciona el cliente'); return; }
    if (!importFile) { toast.error('Selecciona el archivo Excel'); return; }
    setImporting(true);
    try {
      const res = await api.importFulfillmentXlsx(importFile, Number(importCliente));
      if (res.success) {
        toast.success(`Importación completa: ${res.hojasImportadas} hoja(s), ${res.lineasImportadas} línea(s).`);
        setShowImport(false); setImportFile(null); setImportCliente('');
        loadAll();
      } else toast.error(res.error || 'No se pudo importar el archivo');
    } catch (e: any) { toast.error(e.message || 'No se pudo importar el archivo'); }
    finally { setImporting(false); }
  };

  const handleDeleteRegistro = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      const res = await api.deleteFulfillmentRegistro(confirmDel.id);
      if (res.success) { toast.success('Registro eliminado'); setConfirmDel(null); loadAll(); }
      else toast.error(res.error || 'No se pudo eliminar el registro');
    } catch (e: any) { toast.error(e.message || 'No se pudo eliminar el registro'); }
    finally { setDeleting(false); }
  };

  const columns: ColumnDef<Registro>[] = [
    { header: 'Cliente', key: 'cliente_nombre', sortable: true, render: r => <span className="font-black text-slate-800">{r.cliente_nombre}</span> },
    { header: 'Periodo', key: 'mes', sortable: true, render: r => <span>{r.mes} {r.anio}{r.subtipo ? ` · ${r.subtipo}` : ''}</span> },
    { header: 'Moneda', key: 'moneda', sortable: true, render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.moneda === 'USD' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.moneda}</span> },
    { header: 'Valor Total', key: 'valor_total', sortable: true, render: r => <span className="font-black text-slate-800">{fmt(r.valor_total, r.moneda)}</span> },
    { header: 'Líneas', key: 'num_lineas', sortable: true },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: r => (
        <div className="flex gap-2 items-center">
          <button onClick={() => setDetalleReg(r)} className="text-indigo-600 hover:text-indigo-800 font-black text-[9px] uppercase">Ver Detalle</button>
          <button onClick={() => setConfirmDel(r)} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-5">
        <button onClick={() => setShowLinea(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
          <Plus className="w-3.5 h-3.5" /> Registrar Línea
        </button>
        <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
          <Upload className="w-3.5 h-3.5" /> Importar Excel
        </button>
      </div>

      <DataTable<Registro> data={registros} columns={columns} loading={loading} searchPlaceholder="Buscar cliente, periodo..." excelFileName="fulfillment_registros.xlsx" excelSheetName="Registros" />

      {/* Modal Registrar Línea (una a una) — se acumula sobre el registro del período */}
      {showLinea && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
              <p className="text-lg font-black text-white">Registrar Línea</p>
              <button onClick={() => setShowLinea(false)} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <LineaManualForm clientes={clientes} productos={productos} transportistas={transportistas} onSaved={loadAll} />
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-6 py-4">
              <p className="text-xs font-black text-teal-200 uppercase tracking-widest mb-0.5">Registro</p>
              <p className="text-lg font-black text-white">Importar Excel de Facturación</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Cliente *</label>
                <select className={inputCls} value={importCliente} onChange={e => setImportCliente(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                El archivo puede tener varias hojas (una por mes/sub-operación) — se importan todas las que reconozca automáticamente.
                Los registros duplicados (mismo cliente + mes + sub-tipo) reemplazan el detalle de esa hoja.
              </p>
              <button onClick={handleDescargarPlantilla} disabled={downloadingPlantilla}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 text-xs font-black uppercase tracking-widest disabled:opacity-60">
                {downloadingPlantilla ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Descargar Plantilla de Ejemplo
              </button>
              <div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => fileRef.current?.click()}
                  className={`w-full py-3 rounded-2xl border-2 border-dashed text-sm font-semibold transition ${importFile ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-500 hover:border-teal-400 hover:text-teal-600'}`}>
                  {importFile ? `✓ ${importFile.name}` : 'Seleccionar archivo .xlsx…'}
                </button>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => { setShowImport(false); setImportFile(null); }} disabled={importing}
                className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleImport} disabled={importing || !importFile || !importCliente}
                className="flex-1 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />} {importing ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalleReg && <DetalleModal registro={detalleReg} onClose={() => setDetalleReg(null)} clientes={clientes} onRegistroChanged={loadAll} />}

      {/* Confirmar eliminar registro */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-1">Eliminar Registro</p>
            <p className="text-sm text-slate-500 mb-5">¿Eliminar el registro de <span className="font-black text-slate-800">{confirmDel.cliente_nombre} — {confirmDel.mes} {confirmDel.anio}</span>? Se eliminará todo su detalle.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              <button onClick={handleDeleteRegistro} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-2xl bg-red-600 text-white text-sm font-black hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
