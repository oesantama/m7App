import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload,
  Loader2,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  DollarSign,
  TrendingDown,
  CheckSquare,
  Square,
  X,
  FileCheck,
  FileDown
} from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface Props {
  user: User;
}

interface Cliente {
  id: number;
  codigo: string;
  nombre: string;
  moneda: 'USD' | 'COP';
  sede: 'CAF' | 'M7' | null;
}

interface Transportista {
  id: number;
  nombre: string;
}

interface ConciliacionRegistro {
  id: number;
  registro_id: number;
  fecha: string | null;
  orden: string | null;
  seguimiento: string | null;
  descripcion: string | null;
  monto_inicial: string | number;
  monto_final: string | number | null;
  diferencia_monto: string | number | null;
  factura_transportista: string | null;
  fecha_factura_transportista: string | null;
  estado_id: string;
  estado_nombre: string;
  transportista_id: number | null;
  transportista_nombre: string | null;
  cliente_id: number;
  cliente_nombre: string;
  cliente_codigo: string;
  referencia_factura: string | null;
}

interface CoincidenciaItem {
  detalle_id: number;
  orden: string | null;
  seguimiento: string | null;
  cliente_nombre: string;
  transportista_nombre: string;
  monto_inicial: number;
  monto_final_bd: number | null;
  monto_extraido: number | null;
  monto_final: number;
  diferencia_monto: number;
  factura_transportista: string;
  fecha_factura_transportista: string;
  estado_actual_id: string;
  estado_actual_nombre: string;
  ya_conciliado?: boolean;
}


interface SinCoincidenciaItem {
  seguimiento_o_ref: string;
  monto_file: number | null;
  motivo: string;
}

interface AnalisisResultado {
  facturaTransportista: string;
  fechaFacturaTransportista: string;
  transportista: string;
  coincidencias: CoincidenciaItem[];
  sinCoincidencia: SinCoincidenciaItem[];
}

const fmtMoney = (v: any) => {
  const n = Number(v) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtFecha = (fecha: string | null) => {
  if (!fecha) return '—';
  const parts = fecha.slice(0, 10).split('-');
  if (parts.length !== 3) return fecha;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";

export const ConciliacionFulfillment: React.FC<Props> = ({ user }) => {
  const [registros, setRegistros] = useState<ConciliacionRegistro[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Filtros
  const [facturaFilter, setFacturaFilter] = useState('');
  const [fechaFacturaFilter, setFechaFacturaFilter] = useState('');
  const [refFacturaFilter, setRefFacturaFilter] = useState('');
  const [transportistaFilter, setTransportistaFilter] = useState('');
  const [clienteFilter, setClienteFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [anioFilter, setAnioFilter] = useState('');
  const [mesFilter, setMesFilter] = useState('');
  const [busquedaFilter, setBusquedaFilter] = useState('');


  const [formatoArchivo, setFormatoArchivo] = useState<'FEDEX_USA' | 'FEDEX_COL' | 'GENERIC_EXCEL'>('FEDEX_USA');
  const [downloadingPlantilla, setDownloadingPlantilla] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleDescargarPlantilla = async () => {
    setDownloadingPlantilla(true);
    try {
      await api.downloadConciliacionPlantillaExcel();
      toast.success('Plantilla descargada correctamente.');
    } catch (e: any) {
      toast.error(e.message || 'Error al descargar la plantilla.');
    } finally {
      setDownloadingPlantilla(false);
    }
  };
  const [analisisData, setAnalisisData] = useState<AnalisisResultado | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [fileNameUploaded, setFileNameUploaded] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState<'coincidencias' | 'sinCoincidencia'>('coincidencias');

  const cargarCatalogos = async () => {
    try {
      const [cRes, tRes] = await Promise.all([
        api.getFulfillmentClientes(),
        api.getFulfillmentTransportistas(),
      ]);
      const cList = Array.isArray(cRes) ? cRes : (cRes?.data || cRes?.clientes || []);
      const tList = Array.isArray(tRes) ? tRes : (tRes?.data || tRes?.transportistas || []);
      setClientes(Array.isArray(cList) ? cList : []);
      setTransportistas(Array.isArray(tList) ? tList : []);
    } catch (e: any) {
      toast.error('Error cargando catálogos de fulfillment');
    }
  };


  const cargarRegistros = async () => {
    setLoading(true);
    try {
      const res = await api.getFulfillmentConciliacionRegistros({
        factura_transportista: facturaFilter || undefined,
        fecha_factura_transportista: fechaFacturaFilter || undefined,
        referencia_factura: refFacturaFilter || undefined,
        transportista_id: transportistaFilter || undefined,
        estado_id: estadoFilter || undefined,
        cliente_id: clienteFilter || undefined,
        anio: anioFilter || undefined,
        mes: mesFilter || undefined,
        busqueda: busquedaFilter || undefined,
      });
      if (res.success) {
        setRegistros(res.registros || []);
      } else {
        toast.error(res.error || 'Error al cargar registros');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al obtener datos de conciliación');
    } finally {
      setLoading(false);
    }
  };

  const handleLimpiarFiltros = () => {
    setFacturaFilter('');
    setFechaFacturaFilter('');
    setRefFacturaFilter('');
    setTransportistaFilter('');
    setClienteFilter('');
    setEstadoFilter('');
    setAnioFilter('');
    setMesFilter('');
    setBusquedaFilter('');
    setTimeout(() => {
      cargarRegistros();
    }, 50);
  };


  useEffect(() => {
    cargarCatalogos();
    cargarRegistros();
  }, []);




  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFileNameUploaded(file.name);
    try {
      const res = await api.analizarFulfillmentConciliacionFile(file, formatoArchivo);
      if (res.success) {
        setAnalisisData(res);
        // Seleccionar por defecto solo coincidencias pendientes SIN diferencia de monto
        const matchPendingIds = new Set<number>(
          (res.coincidencias || [])
            .filter((c: CoincidenciaItem) => !c.ya_conciliado && Math.abs(c.diferencia_monto || 0) < 0.01)
            .map((c: CoincidenciaItem) => c.detalle_id)
        );
        setSelectedItemIds(matchPendingIds);
        setActiveTab((res.coincidencias || []).length > 0 ? 'coincidencias' : 'sinCoincidencia');
        setModalOpen(true);
        const yaConciliadosNum = (res.coincidencias || []).filter((c: CoincidenciaItem) => c.ya_conciliado).length;
        if (yaConciliadosNum > 0) {
          toast.warning(`Archivo analizado. ${res.coincidencias?.length || 0} coincidencias encontradas (${yaConciliadosNum} ya estaban conciliadas).`);
        } else {
          toast.success(`Archivo analizado. ${res.coincidencias?.length || 0} coincidencias encontradas.`);
        }
      } else {

        toast.error(res.error || 'No se pudo analizar el archivo');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error analizando archivo');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleSelectItem = (id: number) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItemIds(next);
  };

  const toggleSelectAll = () => {
    if (!analisisData) return;
    if (selectedItemIds.size === analisisData.coincidencias.length) {
      setSelectedItemIds(new Set());
    } else {
      const allIds = new Set(analisisData.coincidencias.map(c => c.detalle_id));
      setSelectedItemIds(allIds);
    }
  };

  const handleConfirmarConciliacion = async () => {
    if (!analisisData || selectedItemIds.size === 0) {
      toast.error('Selecciona al menos un registro para conciliar');
      return;
    }

    const itemsToConfirm = analisisData.coincidencias
      .filter(c => selectedItemIds.has(c.detalle_id))
      .map(c => ({
        detalle_id: c.detalle_id,
        factura_transportista: c.factura_transportista || analisisData.facturaTransportista,
        fecha_factura_transportista: c.fecha_factura_transportista || analisisData.fechaFacturaTransportista,
        monto_final: c.monto_final
      }));

    setConfirming(true);
    try {
      const res = await api.confirmarFulfillmentConciliacion(itemsToConfirm);
      if (res.success) {
        toast.success(res.message || `${itemsToConfirm.length} registros conciliados correctamente`);
        setModalOpen(false);
        setAnalisisData(null);
        cargarRegistros();
      } else {
        toast.error(res.error || 'Error al conciliar registros');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error en backend durante conciliación');
    } finally {
      setConfirming(false);
    }
  };

  // KPIs
  const totalRegistros = registros.length;
  const conciliados = registros.filter(r => r.estado_id === 'EST-19').length;
  const montoInicialTotal = registros.reduce((sum, r) => sum + (Number(r.monto_inicial) || 0), 0);
  const montoFinalTotal = registros.reduce((sum, r) => sum + (Number(r.monto_final) || 0), 0);
  const diferenciaTotal = registros.reduce((sum, r) => sum + (Number(r.diferencia_monto) || 0), 0);

  const columns: ColumnDef<ConciliacionRegistro>[] = [
    {
      header: 'Orden / Ref',
      key: 'orden',
      render: (r) => <span className="font-bold text-slate-700">{r.orden || '—'}</span>,
    },
    {
      header: 'Seguimiento / Guía',
      key: 'seguimiento',
      render: (r) => <span className="font-mono text-xs text-indigo-600 font-semibold">{r.seguimiento || '—'}</span>,
    },
    {
      header: 'Cliente',
      key: 'cliente_nombre',
      render: (r) => <span className="font-semibold text-slate-800">{r.cliente_nombre}</span>,
    },
    {
      header: 'Transportista',
      key: 'transportista_nombre',
      render: (r) => <span className="text-slate-600 font-medium">{r.transportista_nombre || 'FEDEX'}</span>,
    },
    {
      header: 'Monto Inicial',
      key: 'monto_inicial',
      render: (r) => <span className="font-mono text-slate-700">{fmtMoney(r.monto_inicial)}</span>,
    },
    {
      header: 'Monto Final',
      key: 'monto_final',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900">
          {r.monto_final !== null ? fmtMoney(r.monto_final) : '—'}
        </span>
      ),
    },
    {
      header: 'Diferencia',
      key: 'diferencia_monto',
      render: (r) => {
        if (r.diferencia_monto === null) return '—';
        const diff = Number(r.diferencia_monto);
        const isZero = Math.abs(diff) < 0.01;
        const isPos = diff > 0;
        return (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono inline-block ${
              isZero
                ? 'bg-slate-100 text-slate-600'
                : isPos
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {isPos ? `+${fmtMoney(diff)}` : fmtMoney(diff)}
          </span>
        );
      },
    },
    {
      header: 'Factura Transp.',
      key: 'factura_transportista',
      render: (r) => (
        <span className="font-mono font-bold text-slate-800">
          {r.factura_transportista || '—'}
        </span>
      ),
    },
    {
      header: 'Fecha Factura Transp. (DD/MM/AAAA)',
      key: 'fecha_factura_transportista',
      render: (r) => fmtFecha(r.fecha_factura_transportista),
    },
    {
      header: 'Estado',
      key: 'estado_nombre',
      render: (r) => {
        let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
        if (r.estado_id === 'EST-19') badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
        else if (r.estado_id === 'EST-22') badgeStyle = 'bg-amber-50 text-amber-700 border-amber-300';
        else if (r.estado_id === 'EST-23') badgeStyle = 'bg-blue-50 text-blue-700 border-blue-300';

        return (
          <span className={`px-2.5 py-1 rounded-lg border text-[10px] uppercase font-black tracking-wider ${badgeStyle}`}>
            {r.estado_nombre || r.estado_id}
          </span>
        );
      },
    },
    {
      header: 'Factura M7 / CAF',
      key: 'referencia_factura',
      render: (r) => <span className="text-xs font-semibold text-slate-600">{r.referencia_factura || '—'}</span>,
    },
  ];

  const modalCoincidenciaColumns = React.useMemo<ColumnDef<CoincidenciaItem>[]>(() => [
    {
      header: 'Orden',
      key: 'orden',
      render: (c) => <span className="font-bold text-slate-800">{c.orden || '—'}</span>,
    },
    {
      header: 'Seguimiento / Guía',
      key: 'seguimiento',
      render: (c) => <span className="font-mono text-xs text-indigo-600 font-semibold">{c.seguimiento || '—'}</span>,
    },
    {
      header: 'Cliente',
      key: 'cliente_nombre',
      render: (c) => <span className="text-slate-700 font-medium">{c.cliente_nombre}</span>,
    },
    {
      header: 'Transportista',
      key: 'transportista_nombre',
      render: (c) => <span className="text-slate-600 font-medium">{c.transportista_nombre || 'FEDEX'}</span>,
    },
    {
      header: 'Factura Transp.',
      key: 'factura_transportista',
      render: (c) => (
        <span className="font-mono font-bold text-amber-600">
          {c.factura_transportista || analisisData?.facturaTransportista || '—'}
        </span>
      ),
    },
    {
      header: 'Fecha Factura Transp. (DD/MM/AAAA)',
      key: 'fecha_factura_transportista',
      render: (c) => (
        <span className="font-semibold text-slate-700">
          {fmtFecha(c.fecha_factura_transportista || analisisData?.fechaFacturaTransportista || null)}
        </span>
      ),
    },
    {
      header: 'Monto Inicial (BD)',
      key: 'monto_inicial',
      render: (c) => <span className="font-mono text-slate-600">{fmtMoney(c.monto_inicial)}</span>,
    },
    {
      header: 'Monto Final BD',
      key: 'monto_final_bd',
      render: (c) => (
        <span className="font-mono text-slate-700 font-semibold">
          {c.monto_final_bd !== null ? fmtMoney(c.monto_final_bd) : '—'}
        </span>
      ),
    },
    {
      header: 'Monto Extraído (Archivo)',
      key: 'monto_extraido',
      render: (c) => (
        <span className="font-mono font-bold text-slate-900">
          {c.monto_extraido !== null ? fmtMoney(c.monto_extraido) : '—'}
        </span>
      ),
    },
    {
      header: 'Diferencia',
      key: 'diferencia_monto',
      render: (c) => {
        const diff = Number(c.diferencia_monto || 0);
        const isZero = Math.abs(diff) < 0.01;
        const isPos = diff > 0;
        return (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono inline-block ${
              isZero
                ? 'bg-slate-100 text-slate-600'
                : isPos
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {isZero ? '$0.00' : isPos ? `+${fmtMoney(diff)}` : fmtMoney(diff)}
          </span>
        );
      },
    },
    {
      header: 'Estado Actual',
      key: 'estado_actual_nombre',
      render: (c) => {
        if (c.ya_conciliado) {
          return (
            <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>YA CONCILIADO</span>
            </span>
          );
        }
        return (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 uppercase">
            {c.estado_actual_nombre}
          </span>
        );
      },
    },
  ], [analisisData]);

  const modalSinCoincidenciaColumns = React.useMemo<ColumnDef<SinCoincidenciaItem>[]>(() => [
    {
      header: 'Seguimiento / Guía / Referencia en Archivo',
      key: 'seguimiento_o_ref',
      render: (sc) => <span className="font-mono font-bold text-slate-800">{sc.seguimiento_o_ref}</span>,
    },
    {
      header: 'Monto en Archivo',
      key: 'monto_file',
      render: (sc) => (
        <span className="font-mono text-slate-700">
          {sc.monto_file !== null ? fmtMoney(sc.monto_file) : '—'}
        </span>
      ),
    },
    {
      header: 'Observación',
      key: 'motivo',
      render: (sc) => <span className="text-amber-700 font-medium">{sc.motivo}</span>,
    },
  ], []);



  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* ── Encabezado y Acción de Carga de Archivo ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">CONCILIACIÓN FULFILLMENT</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Carga de archivos de transportistas (PDF FedEx, Excel), cruce automático y confirmación a estado CONCILIADO (EST-19).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">
              Origen / Formato del Archivo
            </label>
            <select
              value={formatoArchivo}
              onChange={(e) => setFormatoArchivo(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 transition-all"
            >
              <option value="FEDEX_USA">🇺🇸 FedEx Estados Unidos (PDF - USD)</option>
              <option value="FEDEX_COL">🇨🇴 FedEx Colombia (PDF - COP)</option>
              <option value="GENERIC_EXCEL">📊 Excel Genérico / Otro Transportista</option>
            </select>
          </div>

          {formatoArchivo === 'GENERIC_EXCEL' && (
            <button
              type="button"
              onClick={handleDescargarPlantilla}
              disabled={downloadingPlantilla}
              className="flex items-center space-x-2 px-4 py-3 rounded-xl bg-teal-50 border-2 border-dashed border-teal-300 hover:bg-teal-100 text-teal-800 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
            >
              {downloadingPlantilla ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 text-teal-600" />}
              <span>Descargar Plantilla Excel</span>
            </button>
          )}

          <label className={`cursor-pointer flex items-center space-x-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analizando archivo...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Subir {formatoArchivo === 'FEDEX_USA' ? 'PDF (USA)' : formatoArchivo === 'FEDEX_COL' ? 'PDF (Colombia)' : 'Excel'}</span>
              </>
            )}
            <input
              type="file"
              accept=".pdf,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* ── Tarjetas Resumen KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Registros</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalRegistros}</p>
        </div>
        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Conciliados (EST-19)</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-black text-emerald-700">{conciliados}</p>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Monto Inicial Total</p>
          <p className="text-lg font-black text-slate-800 mt-1 font-mono">{fmtMoney(montoInicialTotal)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Monto Final Total</p>
          <p className="text-lg font-black text-slate-900 mt-1 font-mono">{fmtMoney(montoFinalTotal)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Diferencia Fletes</p>
          <p className={`text-lg font-black mt-1 font-mono ${diferenciaTotal < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {diferenciaTotal > 0 ? `+${fmtMoney(diferenciaTotal)}` : fmtMoney(diferenciaTotal)}
          </p>
        </div>
      </div>

      {/* ── Barra de Filtros ────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
          <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">Filtros de Búsqueda</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className={labelCls}>Factura Transportista</label>
            <input
              type="text"
              placeholder="Ej: 2-608-61692"
              className={inputCls}
              value={facturaFilter}
              onChange={(e) => setFacturaFilter(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Fecha Factura</label>
            <input
              type="date"
              className={inputCls}
              value={fechaFacturaFilter}
              onChange={(e) => setFechaFacturaFilter(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Factura M7 / CAF</label>
            <input
              type="text"
              placeholder="Ej: M7-1045"
              className={inputCls}
              value={refFacturaFilter}
              onChange={(e) => setRefFacturaFilter(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Transportista</label>
            <select
              className={inputCls}
              value={transportistaFilter}
              onChange={(e) => setTransportistaFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {(Array.isArray(transportistas) ? transportistas : []).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cliente</label>
            <select
              className={inputCls}
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {(Array.isArray(clientes) ? clientes : []).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Estado</label>
            <select
              className={inputCls}
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
            >
              <option value="">Todos los Estados</option>
              <option value="EST-19">CONCILIADO</option>
              <option value="EST-22">PREAPROBADO</option>
              <option value="EST-23">APROBADO</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Año</label>
            <select
              className={inputCls}
              value={anioFilter}
              onChange={(e) => setAnioFilter(e.target.value)}
            >
              <option value="">Todos los Años</option>
              {[2024, 2025, 2026, 2027].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Mes</label>
            <select
              className={inputCls}
              value={mesFilter}
              onChange={(e) => setMesFilter(e.target.value)}
            >
              <option value="">Todos los Meses</option>
              {['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Búsqueda Libre</label>
            <input
              type="text"
              placeholder="Orden, seguimiento..."
              className={inputCls}
              value={busquedaFilter}
              onChange={(e) => setBusquedaFilter(e.target.value)}
            />
          </div>

        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            onClick={handleLimpiarFiltros}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
          >
            Limpiar Filtros
          </button>
          <button
            onClick={cargarRegistros}
            disabled={loading}
            className="flex items-center space-x-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Consultar Registros</span>
          </button>
        </div>
      </div>

      {/* ── Tabla de Resultados ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <DataTable
          data={registros}
          columns={columns}
          loading={loading}
          defaultPageSize={25}
          excelFileName="conciliacion_fulfillment.xlsx"
          excelSheetName="Conciliación"
        />

      </div>

      {/* ── DIALOG MODAL CONFIRMACIÓN CONCILIACIÓN ──────────────────────── */}
      {modalOpen && analisisData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 bg-emerald-500 text-white text-[10px] font-black uppercase rounded-full tracking-wider">
                    Cruce Automático
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{fileNameUploaded}</span>
                </div>
                <h3 className="text-lg font-black mt-1">CONFIRMAR CONCILIACIÓN DE ARCHIVO</h3>
                <div className="flex flex-wrap gap-4 mt-3 text-xs">
                  <div>
                    <span className="text-slate-400">Factura Extraída:</span>{' '}
                    <span className="font-mono font-bold text-amber-300">{analisisData.facturaTransportista || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Fecha Factura:</span>{' '}
                    <span className="font-bold text-white">{fmtFecha(analisisData.fechaFacturaTransportista)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Transportista:</span>{' '}
                    <span className="font-bold text-emerald-400">{analisisData.transportista}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pestañas / Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3">
              <button
                onClick={() => setActiveTab('coincidencias')}
                className={`flex items-center space-x-2 pb-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  activeTab === 'coincidencias'
                    ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-xl'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Coincidencias Encontradas</span>
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                  {analisisData.coincidencias.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('sinCoincidencia')}
                className={`flex items-center space-x-2 pb-3 px-4 text-xs font-bold border-b-2 transition-all ${
                  activeTab === 'sinCoincidencia'
                    ? 'border-amber-600 text-amber-700 bg-white rounded-t-xl'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Sin Coincidencia en BD</span>
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                  {analisisData.sinCoincidencia.length}
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[65vh] overflow-y-auto space-y-4">
              {activeTab === 'coincidencias' && (
                <div className="space-y-4">
                  {analisisData.coincidencias.filter(c => c.ya_conciliado).length > 0 && (
                    <div className="flex items-center space-x-2 bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-800 font-bold">
                      <AlertTriangle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0" />
                      <span>
                        Atención: {analisisData.coincidencias.filter(c => c.ya_conciliado).length} de {analisisData.coincidencias.length} registros YA se encontraban en estado CONCILIADO previamente (deshabilitados y desmarcados por defecto).
                      </span>
                    </div>
                  )}

                  {analisisData.coincidencias.filter(c => !c.ya_conciliado && Math.abs(c.diferencia_monto || 0) >= 0.01).length > 0 && (
                    <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-xs text-blue-800 font-bold">
                      <AlertTriangle className="w-4.5 h-4.5 text-blue-600 flex-shrink-0" />
                      <span>
                        Atención: {analisisData.coincidencias.filter(c => !c.ya_conciliado && Math.abs(c.diferencia_monto || 0) >= 0.01).length} registros tienen diferencia de tarifa (desmarcados por defecto). Selecciónelos manualmente si desea aprobarlos.
                      </span>
                    </div>
                  )}

                  <DataTable
                    data={(analisisData.coincidencias || []).map(c => ({ ...c, id: c.detalle_id }))}
                    columns={modalCoincidenciaColumns}
                    selectable={true}
                    isRowSelectable={(c) => !c.ya_conciliado}
                    selectedIds={selectedItemIds}
                    onSelectionChange={(newSet) => setSelectedItemIds(newSet as Set<number>)}
                    searchPlaceholder="Buscar en coincidencias por orden, guía, cliente..."
                    excelFileName={`coincidencias_${analisisData.facturaTransportista || 'conciliacion'}.xlsx`}
                    excelSheetName="Coincidencias"
                    defaultPageSize={25}
                    naked={true}
                  />
                </div>
              )}

              {activeTab === 'sinCoincidencia' && (
                <div className="space-y-4">
                  <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                    Los siguientes {analisisData.sinCoincidencia.length} ítems se encuentran en el archivo cargado pero <strong>no existen o no coinciden</strong> en la base de datos de Fulfillment.
                  </div>

                  <DataTable
                    data={(analisisData.sinCoincidencia || []).map((sc, idx) => ({ ...sc, id: idx }))}
                    columns={modalSinCoincidenciaColumns}
                    searchPlaceholder="Buscar en sin coincidencia..."
                    excelFileName={`sin_coincidencia_${analisisData.facturaTransportista || 'conciliacion'}.xlsx`}
                    excelSheetName="Sin Coincidencia"
                    defaultPageSize={25}
                    naked={true}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-5 border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Seleccionados: <strong className="text-slate-800 font-black">{selectedItemIds.size}</strong> de {analisisData.coincidencias.length} coincidencias.
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={confirming}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarConciliacion}
                  disabled={confirming || selectedItemIds.size === 0}
                  className="flex items-center space-x-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {confirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Conciliando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar y Conciliar ({selectedItemIds.size})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
