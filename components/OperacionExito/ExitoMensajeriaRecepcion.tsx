import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { User } from '../../types';
import { API_URL, getStoredToken } from '../../services/api/client';
import { formatColombiaDateTime } from '../../utils/formatting';
import {
  Warehouse,
  ScanBarcode,
  Truck,
  CheckCircle2,
  Search,
  RefreshCw,
  Printer,
  FileText,
  ArrowRight,
  PackageCheck,
  AlertTriangle,
  CheckSquare,
  Square,
} from 'lucide-react';

interface Props {
  user: User;
  onNavigate?: (tab: string) => void;
}

const authHeaders = () => {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const ExitoMensajeriaRecepcion: React.FC<Props> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [includeSandbox, setIncludeSandbox] = useState(true);

  // Remisiones de recogida y guías pendientes de recepción en almacén
  const [remisiones, setRemisiones] = useState<any[]>([]);
  const [guiasPendientes, setGuiasPendientes] = useState<any[]>([]);

  // Filtros de Placa / Remisión y Pistoleo
  const [selectedRecogidaId, setSelectedRecogidaId] = useState<string>('TODAS');
  const [selectedPlaca, setSelectedPlaca] = useState<string>('TODAS');
  const [scanInput, setScanInput] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [ultimoPistoleo, setUltimoPistoleo] = useState<{
    numeroGuia: string;
    destinatario: string;
    timestamp: string;
  } | null>(null);

  // IDs de guías pistoleadas o seleccionadas para ingreso a almacén
  const [verificadasIds, setVerificadasIds] = useState<Set<number>>(new Set());

  const scannerRef = useRef<HTMLInputElement | null>(null);

  const cargarDatosRecepcion = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        includeSandbox: String(includeSandbox),
      });
      if (selectedRecogidaId !== 'TODAS') {
        qs.set('recogidaId', selectedRecogidaId);
      } else if (selectedPlaca !== 'TODAS') {
        qs.set('placa', selectedPlaca);
      }

      const res = await fetch(
        `${API_URL}/exito-mensajeria/almacen/remisiones-recogida?${qs.toString()}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al consultar remisiones de recogida');

      setRemisiones(data.remisiones || []);
      setGuiasPendientes(data.guiasPendientes || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [includeSandbox, selectedRecogidaId, selectedPlaca]);

  useEffect(() => {
    cargarDatosRecepcion();
  }, [cargarDatosRecepcion]);

  // Placas únicas presentes en las remisiones o guías pendientes
  const placasDisponibles = useMemo(() => {
    const map = new Map<string, { placa: string; conductor: string; totalPendientes: number }>();
    for (const r of remisiones) {
      const p = String(r.placa_mostrar || 'SIN-PLACA').toUpperCase();
      const prev = map.get(p) || {
        placa: p,
        conductor: r.conductor_mostrar || 'Conductor M7',
        totalPendientes: 0,
      };
      prev.totalPendientes += Number(r.guias_pendientes_almacen || 0);
      map.set(p, prev);
    }
    for (const g of guiasPendientes) {
      const p = String(g.placa_mostrar || 'SIN-PLACA').toUpperCase();
      if (!map.has(p)) {
        map.set(p, {
          placa: p,
          conductor: g.conductor_mostrar || 'Conductor M7',
          totalPendientes: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [remisiones, guiasPendientes]);

  // Filtrado ágil en cliente para miles de registros
  const guiasFiltradas = useMemo(() => {
    const q = searchFilter.trim().toUpperCase();
    return guiasPendientes.filter((g) => {
      if (selectedRecogidaId !== 'TODAS' && String(g.recogida_id) !== selectedRecogidaId) {
        return false;
      }
      if (
        selectedPlaca !== 'TODAS' &&
        String(g.placa_mostrar || '').toUpperCase() !== selectedPlaca.toUpperCase()
      ) {
        return false;
      }
      if (!q) return true;
      return (
        String(g.numero_guia || '').toUpperCase().includes(q) ||
        String(g.numero_pedido || '').toUpperCase().includes(q) ||
        String(g.id_contenedor || '').toUpperCase().includes(q) ||
        String(g.nombre_destinatario || '').toUpperCase().includes(q) ||
        String(g.barrio_destino || g.barrio_destinatario || '').toUpperCase().includes(q) ||
        String(g.codigo_recogida || '').toUpperCase().includes(q)
      );
    });
  }, [guiasPendientes, selectedRecogidaId, selectedPlaca, searchFilter]);

  // Pistoleo rápido con lector de códigos de barras o teclado (Enter)
  const handlePistolearGuia = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = scanInput.trim().toUpperCase();
    if (!raw) return;

    // Buscar coincidencia exacta o parcial por número de guía, pedido o contenedor
    const match = guiasPendientes.find(
      (g) =>
        String(g.numero_guia || '').toUpperCase() === raw ||
        String(g.numero_pedido || '').toUpperCase() === raw ||
        String(g.id_contenedor || '').toUpperCase() === raw ||
        String(g.numero_guia || '').toUpperCase().endsWith(raw)
    );

    if (!match) {
      toast.error(`Código "${raw}" no encontrado entre los paquetes pendientes por recibir en almacén.`);
      setScanInput('');
      scannerRef.current?.focus();
      return;
    }

    const idNum = Number(match.id);
    setVerificadasIds((prev) => {
      const next = new Set(prev);
      next.add(idNum);
      return next;
    });

    setUltimoPistoleo({
      numeroGuia: match.numero_guia,
      destinatario: match.nombre_destinatario,
      timestamp: new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
    });

    toast.success(`Pistoleada: ${match.numero_guia} (${match.nombre_destinatario})`);
    setScanInput('');
    scannerRef.current?.focus();
  };

  const toggleGuiaSeleccion = (id: number) => {
    setVerificadasIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodasVisibles = () => {
    setVerificadasIds((prev) => {
      const next = new Set(prev);
      for (const g of guiasFiltradas) {
        next.add(Number(g.id));
      }
      return next;
    });
    toast.info(`${guiasFiltradas.length} guía(s) marcadas para recepción en almacén.`);
  };

  const limpiarSeleccion = () => {
    setVerificadasIds(new Set());
  };

  // Confirmar ingreso en Bodega Milla 7 (EST-33 / EN_ALMACEN)
  const handleConfirmarRecepcionAlmacen = async () => {
    const idsArray = Array.from(verificadasIds);
    if (idsArray.length === 0) {
      return toast.warning('Pistolee o seleccione al menos un paquete antes de confirmar la recepción.');
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/guias/recepcion-bodega`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          guiaIds: idsArray,
          recogidaId: selectedRecogidaId !== 'TODAS' ? Number(selectedRecogidaId) : undefined,
          placa: selectedPlaca !== 'TODAS' ? selectedPlaca : undefined,
          observaciones: `Recepción verificada en Almacén M7 (${idsArray.length} guías pistoleadas/seleccionadas).`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar recepción en almacén');

      toast.success(data.message);
      setVerificadasIds(new Set());
      setUltimoPistoleo(null);
      cargarDatosRecepcion();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Ver / Imprimir PDF On-Demand de Remisión de Recogida (REC-EX-...) o Rótulo (4x6")
  const handleOpenPlanillaPdf = async (codigoRecogida: string, autoPrint: boolean = false) => {
    try {
      const res = await fetch(
        `${API_URL}/exito-mensajeria/planillas/${encodeURIComponent(codigoRecogida)}/pdf?json=true`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok || !data.pdfBase64) throw new Error(data.error || 'No se pudo generar PDF');
      const bin = atob(data.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const win = window.open(blobUrl, '_blank');
      if (win && autoPrint) {
        win.addEventListener('load', () => {
          try {
            win.focus();
            win.print();
          } catch {
            // Ignorar
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleOpenGuideLabelPdf = async (guiaId: number, autoPrint: boolean = false) => {
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/guias/${guiaId}/rotulo.pdf?json=true`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.pdfBase64) throw new Error(data.error || 'No se pudo generar rótulo');
      const bin = atob(data.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const win = window.open(blobUrl, '_blank');
      if (win && autoPrint) {
        win.addEventListener('load', () => {
          try {
            win.focus();
            win.print();
          } catch {
            // Ignorar
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* ENCABEZADO RESPONSIVE DE RECEPCIÓN EN ALMACÉN (PAG-85) */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 md:p-7 shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/30 text-xs font-black uppercase">
              PAG-85 · RECEPCIÓN EN ALMACÉN M7
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-black uppercase">
              PISTOLEO ÁGIL · ALTA CAPACIDAD
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2.5">
            <Warehouse className="w-7 h-7 text-purple-400 shrink-0" />
            RECEPCIÓN DE PAQUETES EN BODEGA POR PLACA / REMISIÓN
          </h1>
          <p className="text-xs md:text-sm text-slate-300 max-w-3xl">
            Seleccione la <strong>Placa o Remisión de Recogida (REC-EX-...)</strong> que llega de los Nodos Éxito y pistolee con lector láser (o seleccione) los paquetes para ingresarlos a <strong>En Almacén M7 (EST-33)</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={includeSandbox}
              onChange={(e) => setIncludeSandbox(e.target.checked)}
              className="rounded"
            />
            Incluir Guías Sandbox
          </label>

          <button
            onClick={cargarDatosRecepcion}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs flex items-center gap-2 border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            ACTUALIZAR
          </button>

          {onNavigate && (
            <button
              onClick={() => onNavigate('exito-mensajeria-despacho')}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 shadow-lg"
            >
              IR A DESPACHO INTELIGENTE <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* PASO 1: SELECCIONAR PLACA O REMISIÓN DE RECOGIDA */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-600" />
              1. Seleccione la Placa o Remisión de Recogida que llega al Almacén
            </h2>
            <p className="text-xs text-slate-500">
              Filtra instantáneamente las guías recogidas en nodos por ese vehículo o acta de recogida.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedPlaca}
              onChange={(e) => {
                setSelectedPlaca(e.target.value);
                setSelectedRecogidaId('TODAS');
              }}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-black bg-slate-50"
            >
              <option value="TODAS">Todas las Placas ({guiasPendientes.length} guías)</option>
              {placasDisponibles.map((p) => (
                <option key={p.placa} value={p.placa}>
                  Placa {p.placa} — {p.conductor} ({p.totalPendientes} pend.)
                </option>
              ))}
            </select>

            <select
              value={selectedRecogidaId}
              onChange={(e) => setSelectedRecogidaId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-black bg-slate-50"
            >
              <option value="TODAS">Todas las Remisiones (REC-EX-...)</option>
              {remisiones.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.codigo_recogida} · Placa {r.placa_mostrar} · {r.nodo_nombre || 'Nodo'} ({r.guias_pendientes_almacen}/{r.total_guias_recogidas} pend.)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tarjetas rápidas de Remisiones de Recogida activas */}
        {remisiones.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {remisiones.slice(0, 8).map((r) => {
              const isSelected = selectedRecogidaId === String(r.id);
              const pendientes = Number(r.guias_pendientes_almacen || 0);
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRecogidaId(isSelected ? 'TODAS' : String(r.id));
                    setSelectedPlaca('TODAS');
                  }}
                  className={`cursor-pointer rounded-2xl p-3.5 border-2 transition flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'border-purple-600 bg-purple-50/70 shadow-md'
                      : pendientes > 0
                      ? 'border-slate-200 hover:border-purple-300 bg-slate-50/60'
                      : 'border-emerald-200 bg-emerald-50/40 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-amber-300 text-xs font-black">
                      🚚 {r.placa_mostrar || 'SIN-PLACA'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        pendientes > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {pendientes > 0 ? `${pendientes} por recibir` : '✓ Recibida'}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs font-black text-slate-900">{r.codigo_recogida}</div>
                    <div className="text-[11px] font-bold text-slate-600 truncate">
                      {r.nodo_nombre || `Nodo ${r.codigo_dependencia || ''}`}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      Cond: {r.conductor_mostrar || 'Milla 7'} · {formatColombiaDateTime(r.created_at)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                    <span className="text-[11px] font-black text-purple-700">
                      Total: {r.total_guias_recogidas} guía(s)
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPlanillaPdf(r.codigo_recogida, true);
                      }}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-[10px] font-black flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" /> Remisión PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PASO 2: PISTOLEO DE CÓDIGO DE BARRAS / QR + CONTADORES EN TIEMPO REAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <form
          onSubmit={handlePistolearGuia}
          className="lg:col-span-7 bg-slate-900 text-white rounded-2xl p-4 md:p-5 shadow-lg flex flex-col justify-between gap-3 border-2 border-purple-500/50"
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-2">
              <ScanBarcode className="w-5 h-5 text-purple-400" />
              2. LECTOR DE CÓDIGO DE BARRAS / QR (PISTOLEO DIRECTO)
            </label>
            {ultimoPistoleo && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-black">
                ✓ Última: {ultimoPistoleo.numeroGuia} ({ultimoPistoleo.timestamp})
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              ref={scannerRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Pistolee aquí el código de barras de la guía, pedido o contenedor y presione Enter..."
              className="flex-1 h-13 px-4 rounded-xl bg-white text-slate-950 font-black text-base md:text-lg uppercase tracking-wider placeholder:text-slate-400 placeholder:font-semibold focus:outline-none focus:ring-4 focus:ring-purple-400"
              autoFocus
            />
            <button
              type="submit"
              className="h-13 px-6 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-sm flex items-center justify-center gap-2 shrink-0 shadow"
            >
              <ScanBarcode className="w-5 h-5" /> MARCAR GUÍA
            </button>
          </div>

          <div className="text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              💡 El cursor permanece activo en este campo para pistolear cientos de paquetes seguidos sin usar el mouse.
            </span>
          </div>
        </form>

        {/* Panel de Resumen y Botón Maestro de Confirmación de Ingreso a Bodega */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-4 md:p-5 border-2 border-purple-200 shadow-sm flex flex-col justify-between gap-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-slate-100">
              <div className="text-[10px] font-black uppercase text-slate-500">En Placa/Filtro</div>
              <div className="text-2xl font-black text-slate-900">{guiasFiltradas.length}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-100 border border-purple-300">
              <div className="text-[10px] font-black uppercase text-purple-800">Pistoleadas</div>
              <div className="text-2xl font-black text-purple-950">{verificadasIds.size}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[10px] font-black uppercase text-amber-800">Faltantes</div>
              <div className="text-2xl font-black text-amber-900">
                {Math.max(0, guiasFiltradas.length - verificadasIds.size)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmarRecepcionAlmacen}
            disabled={submitting || verificadasIds.size === 0}
            className="w-full h-14 rounded-2xl bg-purple-700 hover:bg-purple-600 active:scale-[0.99] text-white font-black text-sm md:text-base flex items-center justify-center gap-2.5 shadow-lg disabled:opacity-40 transition"
          >
            <CheckCircle2 className="w-6 h-6" />
            {submitting
              ? 'INGRESANDO A BODEGA M7...'
              : `3. CONFIRMAR RECEPCIÓN EN ALMACÉN (${verificadasIds.size} PAQUETES)`}
          </button>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA RÁPIDA Y SELECCIÓN MASIVA */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar rápido por guía, pedido, barrio, destinatario o código de recogida..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={seleccionarTodasVisibles}
              disabled={guiasFiltradas.length === 0}
              className="px-3.5 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <CheckSquare className="w-4 h-4" /> Seleccionar Visibles ({guiasFiltradas.length})
            </button>
            <button
              type="button"
              onClick={limpiarSeleccion}
              disabled={verificadasIds.size === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <Square className="w-4 h-4" /> Limpiar Selección
            </button>
          </div>
        </div>

        {/* TABLA / TARJETAS RESPONSIVE DE PAQUETES POR RECIBIR EN ALMACÉN */}
        {guiasFiltradas.length === 0 ? (
          <div className="p-10 text-center space-y-2 border-2 border-dashed border-slate-200 rounded-2xl">
            <PackageCheck className="w-10 h-10 text-emerald-500 mx-auto" />
            <div className="text-sm font-black text-slate-800">
              No hay paquetes pendientes en tránsito desde tienda para este filtro
            </div>
            <p className="text-xs text-slate-500">
              Todos los paquetes recogidos ya fueron ingresados a Bodega M7 (`EN_ALMACEN`) o están listos en la página de Despacho a Reparto.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 text-[11px] font-black uppercase text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3 w-12 text-center">Check</th>
                  <th className="p-3">Guía / Pedido / Contenedor</th>
                  <th className="p-3">Placa / Remisión Recogida</th>
                  <th className="p-3">Nodo Origen Éxito</th>
                  <th className="p-3">Destinatario / Barrio Destino</th>
                  <th className="p-3 text-center">Cajas / Peso</th>
                  <th className="p-3 text-right">Rótulo On-Demand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {guiasFiltradas.map((g) => {
                  const idNum = Number(g.id);
                  const checked = verificadasIds.has(idNum);
                  return (
                    <tr
                      key={idNum}
                      onClick={() => toggleGuiaSeleccion(idNum)}
                      className={`cursor-pointer transition ${
                        checked ? 'bg-purple-50/90 hover:bg-purple-100/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGuiaSeleccion(idNum)}
                          className="w-5 h-5 rounded accent-purple-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                          {g.numero_guia}
                          {checked && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-black">
                              PISTOLEADA
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-bold">
                          Ped: {g.numero_pedido} · Cont: {g.id_contenedor || 'N/A'}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-amber-300 font-black text-xs inline-block">
                          {g.placa_mostrar || 'SIN-PLACA'}
                        </span>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">
                          {g.codigo_recogida || 'Recogida Directa'} · {g.conductor_mostrar || ''}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-black text-slate-800">
                          Nodo {g.codigo_dependencia}
                        </div>
                        <div className="text-[11px] text-slate-500">{g.nodo_nombre}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{g.nombre_destinatario}</div>
                        <div className="text-[11px] font-bold text-indigo-700">
                          Barrio: {g.barrio_destino || g.barrio_destinatario || 'SECTOR GENERAL'} ·{' '}
                          {g.direccion_destino || g.direccion_destinatario}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-black text-slate-800">
                          {g.cant_cajas || 1} cj · {g.peso_kg || 1} kg
                        </span>
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleOpenGuideLabelPdf(idNum, true)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-black text-[11px] inline-flex items-center gap-1 border border-indigo-200"
                        >
                          <Printer className="w-3.5 h-3.5" /> Rótulo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExitoMensajeriaRecepcion;

