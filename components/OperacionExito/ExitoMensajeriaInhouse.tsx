import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { User } from '../../types';
import { API_URL, getStoredToken } from '../../services/api/client';
import { SearchableDropdown, SearchableOption } from './SearchableDropdown';
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  FileText,
  ExternalLink,
  ShieldCheck,
  Activity,
  FlaskConical,
  FolderSync,
  Plus,
  Search,
  RotateCcw,
  Warehouse,
  Navigation,
  XCircle,
  Download,
  Eye,
  Clock,
  ServerCrash,
  Sparkles,
  Building2,
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

const apiFetch = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${API_URL}/exito-mensajeria${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error HTTP ${res.status}`);
  return data;
};

const ESTADO_LABELS: Record<string, { label: string; idGuia: string; badge: string }> = {
  ESPERA_RECOGIDA: { label: 'Espera Recogida', idGuia: '1', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  DISPONIBLE: { label: 'Disponible en Nodo', idGuia: '1', badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  RECOGIDA_TIENDA: { label: 'Recogida en Tienda', idGuia: '2', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  EN_ALMACEN: { label: 'En Bodega Local M7', idGuia: '2', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
  EN_RUTA: { label: 'En Reparto Urbano', idGuia: '5', badge: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  ENTREGADO: { label: 'Entregado', idGuia: '6', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  ANULADO: { label: 'Anulado', idGuia: '7', badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  DEVOLUCION: { label: 'En Devolución', idGuia: '9', badge: 'bg-orange-100 text-orange-800 border-orange-300' },
};

const ExitoMensajeriaInhouse: React.FC<Props> = ({ user, onNavigate }) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'dashboard' | 'guias' | 'cola_dlq' | 'devoluciones' | 'maestras' | 'sandbox'
  >('guias');
  const [loading, setLoading] = useState(false);
  const [includeSandbox, setIncludeSandbox] = useState(true);

  // Datos de estado
  const [dashboard, setDashboard] = useState<any>(null);
  const [guias, setGuias] = useState<any[]>([]);
  const [totalCountGuias, setTotalCountGuias] = useState<number>(0);
  const [pageGuias, setPageGuias] = useState<number>(1);
  const [totalPagesGuias, setTotalPagesGuias] = useState<number>(1);
  const [selectedGuiaIds, setSelectedGuiaIds] = useState<number[]>([]);
  const [detailModalGuia, setDetailModalGuia] = useState<any>(null);
  const [manualModalGuia, setManualModalGuia] = useState<any>(null);
  const [showCreateManualModal, setShowCreateManualModal] = useState(false);

  // Catálogos maestros
  const [maestras, setMaestras] = useState<{
    nodos: any[];
    novedades: any[];
    estados: any[];
    config: any[];
    vehicles: any[];
    drivers: any[];
    programacionRecogidas?: any[];
  }>({ nodos: [], novedades: [], estados: [], config: [], vehicles: [], drivers: [], programacionRecogidas: [] });

  // Filtros de guías (Inicia mostrando DISPONIBLES para recoger, pero permite ver TODOS)
  const [filtroEstado, setFiltroEstado] = useState('DISPONIBLES_RECOGIDA');
  const [filtroOperacion, setFiltroOperacion] = useState('TODOS');
  const [filtroNodo, setFiltroNodo] = useState('TODOS');
  const [filtroSync, setFiltroSync] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  // Asignación GLOBAL de vehículo (placa) + conductor a Nodos Éxito para recogida
  const [selVehiculoId, setSelVehiculoId] = useState('');
  const [selConductorId, setSelConductorId] = useState('');
  const [selNodosRecogidaIds, setSelNodosRecogidaIds] = useState<number[]>([]);
  const [selTipoRuta, setSelTipoRuta] = useState<'SAME_DAY' | 'NEXT_DAY'>('SAME_DAY');

  const vehicleOptions: SearchableOption[] = useMemo(() => {
    return (maestras.vehicles || []).map((v: any) => ({
      value: String(v.id),
      label: `Placa: ${v.plate}`,
      sublabel: v.brand ? `${v.brand} · ${v.vehicle_type || ''}` : undefined,
    }));
  }, [maestras.vehicles]);

  const driverOptions: SearchableOption[] = useMemo(() => {
    return (maestras.drivers || []).map((d: any) => ({
      value: String(d.id),
      label: d.name,
      sublabel: d.document_number ? `CC ${d.document_number}` : undefined,
    }));
  }, [maestras.drivers]);

  const vehiculoSeleccionadoObj = useMemo(() => {
    return (maestras.vehicles || []).find((v: any) => String(v.id) === String(selVehiculoId)) || null;
  }, [maestras.vehicles, selVehiculoId]);

  const handleVehicleChange = (newVehId: string) => {
    setSelVehiculoId(newVehId);
    const newVehObj = (maestras.vehicles || []).find((v: any) => String(v.id) === String(newVehId));
    if (newVehObj) {
      const nodosConEstaPlaca = (maestras.nodos || [])
        .filter((n: any) => n.placa_recogida && n.placa_recogida.trim().toUpperCase() === newVehObj.plate.trim().toUpperCase())
        .map((n: any) => Number(n.id));
      if (nodosConEstaPlaca.length > 0) {
        setSelNodosRecogidaIds(nodosConEstaPlaca);
      }
    }
  };

  // Cola y Devoluciones
  const [syncQueueItems, setSyncQueueItems] = useState<any[]>([]);
  const [filtroCola, setFiltroCola] = useState('TODOS');
  const [lotesDevolucion, setLotesDevolucion] = useState<any[]>([]);

  // Contingencia manual form
  const [manualNuevoEstado, setManualNuevoEstado] = useState('RECOGIDA_TIENDA');
  const [manualObservacion, setManualObservacion] = useState('');

  // Crear guía manual form
  const [newGuiaForm, setNewGuiaForm] = useState({
    nodo_id: '',
    numero_pedido: '',
    contenedor: '',
    modalidad_pedido: 'FIRME',
    tipo_operacion: 'SAME_DAY',
    nombre_destinatario: '',
    nit_destinatario: '',
    direccion_destinatario: '',
    barrio_destinatario: '',
    celular_destinatario: '',
    cant_cajas: 1,
    peso_kg: 2.5,
    contenido: 'MERCANCÍA ÉXITO CORPORATIVO',
    observaciones: '',
    is_sandbox: false,
  });

  // Simulador Sandbox form
  const [sandboxCount, setSandboxCount] = useState(3);
  const [sandboxTipoOp, setSandboxTipoOp] = useState<'SAME_DAY' | 'NEXT_DAY'>('SAME_DAY');
  const [sandboxModalidad, setSandboxModalidad] = useState('FIRME');
  const [sandboxDependencia, setSandboxDependencia] = useState('0054');

  // Nodo form
  const [nodoForm, setNodoForm] = useState({
    codigo_dependencia: '',
    nombre: '',
    ciudad_dane: '05001000',
    ciudad_nombre: 'MEDELLÍN',
    departamento: 'ANTIOQUIA',
    direccion: '',
    barrio: '',
    contacto_nombre: '',
    contacto_telefono: '',
    hora_corte_same_day: '11:30:00',
  });

  const loadMasterCatalogs = useCallback(async () => {
    try {
      const data = await apiFetch('/maestras');
      setMaestras(data);
      if (data.vehicles?.[0] && !selVehiculoId) setSelVehiculoId(data.vehicles[0].id);
      if (data.drivers?.[0] && !selConductorId) setSelConductorId(data.drivers[0].id);
      if (data.nodos?.length > 0 && selNodosRecogidaIds.length === 0) {
        setSelNodosRecogidaIds(data.nodos.map((n: any) => Number(n.id)));
      }
      if (data.nodos?.[0] && !newGuiaForm.nodo_id) {
        setNewGuiaForm((prev) => ({ ...prev, nodo_id: String(data.nodos[0].id) }));
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [selVehiculoId, selConductorId, selNodosRecogidaIds.length, newGuiaForm.nodo_id]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/dashboard?includeSandbox=${includeSandbox}`);
      setDashboard(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [includeSandbox]);

  const loadGuias = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        estado: filtroEstado,
        tipoOperacion: filtroOperacion,
        nodoId: filtroNodo,
        syncStatus: filtroSync,
        search: searchQuery,
        page: String(pageGuias),
        limit: '150',
        ...(includeSandbox ? {} : { isSandbox: 'false' }),
      });
      const data = await apiFetch(`/guias?${qs.toString()}`);
      setGuias(data.guias || []);
      setTotalCountGuias(Number(data.totalCount || (data.guias || []).length));
      setTotalPagesGuias(Number(data.totalPages || 1));
      setSelectedGuiaIds([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroOperacion, filtroNodo, filtroSync, searchQuery, pageGuias, includeSandbox]);

  const loadQueue = useCallback(async () => {
    try {
      const data = await apiFetch(`/cola?estadoCola=${filtroCola}`);
      setSyncQueueItems(data.items || []);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [filtroCola]);

  const loadDevoluciones = useCallback(async () => {
    try {
      const data = await apiFetch('/devoluciones');
      setLotesDevolucion(data.lotes || []);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, []);

  useEffect(() => {
    loadMasterCatalogs();
  }, [loadMasterCatalogs]);

  useEffect(() => {
    if (activeSubTab === 'dashboard') loadDashboard();
    if (activeSubTab === 'guias' || activeSubTab === 'devoluciones') loadGuias();
    if (activeSubTab === 'cola_dlq') loadQueue();
    if (activeSubTab === 'devoluciones') loadDevoluciones();
  }, [activeSubTab, loadDashboard, loadGuias, loadQueue, loadDevoluciones]);

  const handleOpenDetail = async (id: number) => {
    try {
      const data = await apiFetch(`/guias/${id}`);
      setDetailModalGuia(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /**
   * Genera el Rótulo PDF 4x6" en memoria bajo demanda (sin guardarlo en Google Drive)
   * y lo abre listo para visualización o lanza el diálogo de impresión térmica inmediatamente.
   */
  const handlePrintOrViewGuideLabel = async (guiaId: number, numeroGuia: string, autoPrint = false) => {
    const toastId = toast.loading(`Generando rótulo ${numeroGuia} bajo demanda...`);
    try {
      const data = await apiFetch(`/guias/${guiaId}/rotulo.pdf?json=true`);
      const byteCharacters = atob(data.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      toast.dismiss(toastId);

      if (autoPrint) {
        const printWin = window.open(blobUrl, '_blank');
        if (printWin) {
          printWin.addEventListener('load', () => {
            printWin.focus();
            printWin.print();
          });
        } else {
          toast.info('Rótulo generado. Habilite ventanas emergentes para imprimir.');
        }
      } else {
        window.open(blobUrl, '_blank');
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || 'No se pudo generar el rótulo PDF.');
    }
  };

  /**
   * Genera la Remisión / Planilla PDF A4 en Blanco y Negro bajo demanda en RAM
   * (aplica para REC-EX-... de 1ra Milla Tienda y RUT-EX-... de Última Milla Reparto).
   */
  const handlePrintOrViewPlanilla = async (codigoDocumento: string, autoPrint = false) => {
    if (!codigoDocumento) return;
    const toastId = toast.loading(`Generando Planilla/Remisión ${codigoDocumento} (B/N)...`);
    try {
      const data = await apiFetch(`/planillas/${encodeURIComponent(codigoDocumento)}/pdf?json=true`);
      const byteCharacters = atob(data.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      toast.dismiss(toastId);

      const printWin = window.open(blobUrl, '_blank');
      if (printWin && autoPrint) {
        printWin.addEventListener('load', () => {
          printWin.focus();
          printWin.print();
        });
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || 'No se pudo generar la Planilla/Remisión PDF.');
    }
  };

  const handleManualResendToExito = async (guiaId: number, numeroGuia: string) => {
    try {
      toast.loading(`Reenviando estado de guía ${numeroGuia} a Go Éxito...`, { id: 'resend-exito' });
      const res = await apiFetch(`/guias/${guiaId}/reenviar-exito`, {
        method: 'POST',
        body: JSON.stringify({
          observacion: `Reenvío manual ejecutado por ${user.name} desde Torre de Control Inhouse`,
        }),
      });
      if (res.success) {
        toast.success(res.message, { id: 'resend-exito' });
      } else {
        toast.warning(res.message, { id: 'resend-exito' });
      }
      loadGuias();
      if (detailModalGuia?.guia?.id === guiaId) handleOpenDetail(guiaId);
    } catch (err: any) {
      toast.error(err.message, { id: 'resend-exito' });
    }
  };

  const handleAssignPickup = async () => {
    if (selNodosRecogidaIds.length === 0) {
      return toast.warning('Seleccione al menos un Nodo Éxito donde la placa va a recoger.');
    }
    if (!selVehiculoId || !selConductorId) {
      return toast.warning('Seleccione la Placa del Vehículo y el Conductor asignado.');
    }

    const vehObj = maestras.vehicles.find((v: any) => String(v.id) === String(selVehiculoId));
    const drvObj = maestras.drivers.find((d: any) => String(d.id) === String(selConductorId));
    const placaNombre = vehObj?.plate || selVehiculoId;
    const condNombre = drvObj?.name || 'Conductor';
    const nodosNombres = maestras.nodos
      .filter((n: any) => selNodosRecogidaIds.includes(Number(n.id)))
      .map((n: any) => `• Nodo ${n.codigo_dependencia} - ${n.nombre}`)
      .join('\n');

    const ok = window.confirm(
      `⚠️ CONFIRMACIÓN DE PROGRAMACIÓN DE RECOGIDA\n\n` +
      `¿Está completamente seguro de programar este vehículo para ir a recoger a las tiendas?\n\n` +
      `🚚 Placa del Vehículo: ${placaNombre}\n` +
      `👤 Conductor Asignado: ${condNombre} (${drvObj?.document_number || 'CC N/A'})\n\n` +
      `Nodos seleccionados para recoger (${selNodosRecogidaIds.length}):\n${nodosNombres}\n\n` +
      `Cuando el conductor ingrese con la placa "${placaNombre}" verá únicamente estos nodos para hacer el checkout.`
    );
    if (!ok) return;

    try {
      const res = await apiFetch('/guias/asignar-recogida', {
        method: 'POST',
        body: JSON.stringify({
          nodoIds: selNodosRecogidaIds,
          vehiculoId: selVehiculoId,
          placa: vehObj?.plate || selVehiculoId,
          conductorId: selConductorId,
          conductorNombre: drvObj?.name || '',
          conductorCedula: drvObj?.document_number || '',
        }),
      });
      toast.success(res.message);
      loadMasterCatalogs();
      loadGuias();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleWarehouseReception = async () => {
    if (selectedGuiaIds.length === 0) return toast.warning('Seleccione las guías a puntear en bodega.');
    try {
      const res = await apiFetch('/guias/recepcion-bodega', {
        method: 'POST',
        body: JSON.stringify({
          guiaIds: selectedGuiaIds,
          observacion: `Recepción en bodega urbana Milla 7 por ${user.name}`,
        }),
      });
      toast.success(res.message);
      loadGuias();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateUrbanRoute = async () => {
    if (selectedGuiaIds.length === 0) return toast.warning('Seleccione las guías que saldrán a reparto urbano.');
    if (!selVehiculoId || !selConductorId) return toast.warning('Seleccione vehículo y conductor de reparto.');
    try {
      toast.loading('Generando ruta urbana, PDF en Google Drive y notificando Id guía=5 a Go Éxito...', {
        id: 'route-create',
      });
      const res = await apiFetch('/rutas', {
        method: 'POST',
        body: JSON.stringify({
          guiaIds: selectedGuiaIds,
          vehiculoId: selVehiculoId,
          conductorId: selConductorId,
          tipoOperacion: selTipoRuta,
        }),
      });
      toast.success(res.message, { id: 'route-create' });
      loadGuias();
    } catch (err: any) {
      toast.error(err.message, { id: 'route-create' });
    }
  };

  const handleConfirmManualStateChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualModalGuia) return;
    try {
      const res = await apiFetch(`/guias/${manualModalGuia.id}/estado-manual`, {
        method: 'POST',
        body: JSON.stringify({
          nuevoEstado: manualNuevoEstado,
          observacion: manualObservacion,
          notificarExito: true,
        }),
      });
      toast.success(res.message);
      setManualModalGuia(null);
      setManualObservacion('');
      loadGuias();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateManualGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      toast.loading('Creando guía y subiendo rótulo PDF a Google Drive...', { id: 'manual-guide' });
      await apiFetch('/guias/manual', {
        method: 'POST',
        body: JSON.stringify(newGuiaForm),
      });
      toast.success('Guía creada exitosamente con rótulo en Google Drive.', { id: 'manual-guide' });
      setShowCreateManualModal(false);
      loadGuias();
    } catch (err: any) {
      toast.error(err.message, { id: 'manual-guide' });
    }
  };

  const handleSimulateSandbox = async () => {
    try {
      toast.loading('Generando guías simuladas Go Éxito v2.0 y subiendo rótulos a Google Drive...', {
        id: 'sbx-sim',
      });
      const res = await apiFetch('/sandbox/simular-guias', {
        method: 'POST',
        body: JSON.stringify({
          cantidad: sandboxCount,
          tipoOperacion: sandboxTipoOp,
          modalidadPedido: sandboxModalidad,
          codigoDependencia: sandboxDependencia,
        }),
      });
      toast.success(res.message, { id: 'sbx-sim' });
      loadDashboard();
      loadGuias();
    } catch (err: any) {
      toast.error(err.message, { id: 'sbx-sim' });
    }
  };

  const handleInitDriveFolders = async () => {
    try {
      toast.loading('Inicializando estructura exito_fulfillment en Google Drive...', { id: 'drv-init' });
      const res = await apiFetch('/drive/init-folders', { method: 'POST' });
      toast.success(
        `Estructura verificada en Google Drive (${res.foldersCreated?.length || 0} subcarpetas listas).`,
        { id: 'drv-init' }
      );
      loadDashboard();
    } catch (err: any) {
      toast.error(err.message, { id: 'drv-init' });
    }
  };

  const handleToggleSandbox503 = async (currentVal: boolean) => {
    try {
      await apiFetch('/configuracion', {
        method: 'POST',
        body: JSON.stringify({
          clave: 'SANDBOX_SIMULATE_WEBHOOK_503',
          valor: currentVal ? 'false' : 'true',
        }),
      });
      toast.success(
        !currentVal
          ? 'Simulación de caída 503 ACTIVADA en Sandbox (los cambios de estado irán a Cola/Reintento).'
          : 'Simulación 503 DESACTIVADA (el Webhook Sandbox responderá 200 OK).'
      );
      loadMasterCatalogs();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetSandbox = async () => {
    if (!window.confirm('¿Está seguro de limpiar únicamente las guías de prueba del entorno SANDBOX?')) return;
    try {
      const res = await apiFetch('/sandbox/reset', { method: 'POST' });
      toast.success(res.message);
      loadDashboard();
      loadGuias();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownloadOpenApi = async () => {
    try {
      const spec = await apiFetch('/openapi.json');
      const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openapi-go-exito-v2-orbitm7.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Contrato OpenAPI 3.0.3 descargado (Entregable #1 Anexo A Go Éxito).');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Totales por estado
  const getCount = (estado: string) => {
    if (!dashboard?.countsByState) return 0;
    return dashboard.countsByState
      .filter((r: any) => r.estado_operativo === estado)
      .reduce((acc: number, r: any) => acc + Number(r.total || 0), 0);
  };

  const simulate503Active =
    maestras.config.find((c: any) => c.clave === 'SANDBOX_SIMULATE_WEBHOOK_503')?.valor === 'true';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* HEADER PRINCIPAL */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider">
              MOD-11 · PAG-83
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
              Go Éxito v2.0 (100% Homologado)
            </span>
            <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold">
              Operación Urbana Misma Ciudad (Sin Tránsito Nacional 3/4)
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            ÉXITO MENSAJERÍA — TORRE DE CONTROL INHOUSE
          </h1>
          <p className="text-slate-400 text-xs md:text-sm">
            Gestión Same-Day y Next-Day · Almacenamiento 100% Google Drive (<code className="text-emerald-300">exito_fulfillment</code>) · Cola Durable 24h + DLQ y Contingencia Manual
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 bg-slate-800 px-3.5 py-2 rounded-2xl text-xs font-bold cursor-pointer border border-slate-700">
            <input
              type="checkbox"
              checked={includeSandbox}
              onChange={(e) => setIncludeSandbox(e.target.checked)}
              className="rounded text-emerald-500"
            />
            <span>Ver Guías Sandbox</span>
          </label>
          <button
            onClick={() => setShowCreateManualModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition"
          >
            <Plus className="w-4 h-4" /> Guía Contingencia
          </button>
          <button
            onClick={() => {
              loadDashboard();
              loadGuias();
              loadQueue();
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* NAVEGACIÓN DE PESTAÑAS */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
        {[
          { id: 'dashboard', label: '1. Dashboard & Observabilidad', icon: Activity },
          { id: 'guias', label: '2. Guías, Bodega, Rutas y Contingencia', icon: Package },
          { id: 'cola_dlq', label: '3. Cola Webhook & DLQ (24h)', icon: Send },
          { id: 'devoluciones', label: '4. Devoluciones Semanales', icon: RotateCcw },
          { id: 'maestras', label: '5. Nodos y Homologación Sección 16', icon: Building2 },
          { id: 'sandbox', label: '6. Entorno Pruebas (Sandbox) & OpenAPI', icon: FlaskConical },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                active
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          TAB 1: DASHBOARD & OBSERVABILIDAD EN VIVO GO ÉXITO v2.0
         ===================================================================== */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPIs del Flujo Urbano Misma Ciudad */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { code: 'ESPERA_RECOGIDA', title: 'Espera Recogida', idGuia: 'Id guía: 1', color: 'border-amber-400 bg-amber-50/60' },
              { code: 'DISPONIBLE', title: 'Disponible Nodo', idGuia: 'Id guía: 1', color: 'border-blue-400 bg-blue-50/60' },
              { code: 'RECOGIDA_TIENDA', title: 'Recogida Tienda', idGuia: 'Id guía: 2', color: 'border-indigo-400 bg-indigo-50/60' },
              { code: 'EN_ALMACEN', title: 'En Bodega Local', idGuia: 'Control M7', color: 'border-purple-400 bg-purple-50/60' },
              { code: 'EN_RUTA', title: 'En Reparto', idGuia: 'Id guía: 5', color: 'border-cyan-400 bg-cyan-50/60' },
              { code: 'ENTREGADO', title: 'Entregado', idGuia: 'Id guía: 6', color: 'border-emerald-500 bg-emerald-50/60' },
              { code: 'DEVOLUCION', title: 'Devolución', idGuia: 'Id guía: 9', color: 'border-orange-400 bg-orange-50/60' },
              { code: 'ANULADO', title: 'Cancelado', idGuia: 'Id guía: 7', color: 'border-rose-400 bg-rose-50/60' },
            ].map((k) => (
              <div
                key={k.code}
                onClick={() => {
                  setFiltroEstado(k.code);
                  setActiveSubTab('guias');
                }}
                className={`p-4 rounded-2xl border-l-4 ${k.color} bg-white shadow-sm cursor-pointer hover:shadow-md transition`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500">{k.idGuia}</span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">{getCount(k.code)}</div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">{k.title}</div>
              </div>
            ))}
          </div>

          {/* Estado Google Drive + Circuit Breaker + Cola DLQ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Google Drive Card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderSync className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-black text-sm uppercase text-slate-800">
                    Almacenamiento Google Drive
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                    dashboard?.driveStatus?.connected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {dashboard?.driveStatus?.connected ? 'CONECTADO (rclone)' : 'MODO DEV / SANDBOX'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Remoto: <strong className="text-slate-900">{dashboard?.driveStatus?.remote || 'cumplidos_m7'}</strong> · Carpeta Raíz:{' '}
                <strong className="text-slate-900">{dashboard?.driveStatus?.rootFolder || 'exito_fulfillment'}</strong>
              </p>
              <div className="text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-slate-600">
                exito_fulfillment / &#123;Same_Day | Next_Day&#125; / &#123;Recogidas | Entregas | Novedades | Devoluciones&#125; / &#123;año&#125; / &#123;mes&#125; / &#123;guia&#125;
              </div>
              <button
                onClick={handleInitDriveFolders}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition"
              >
                Verificar / Crear Carpetas en Google Drive
              </button>
            </div>

            {/* Circuit Breaker Card (Sección 9.1 Go Éxito) */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-black text-sm uppercase text-slate-800">
                    Circuit Breaker & Resiliencia (Sección 9.1)
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                    dashboard?.circuitBreaker?.state === 'CLOSED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  ESTADO: {dashboard?.circuitBreaker?.state || 'CLOSED'}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Umbral oficial Go Éxito: Abre por <strong>60s</strong> si ocurre <strong>&ge; 50%</strong> de fallas en <strong>&ge; 20</strong> llamadas dentro de <strong>30s</strong>.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <div className="text-lg font-black text-slate-900">
                    {dashboard?.circuitBreaker?.recentCalls30s || 0}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Llamadas (30s)</div>
                </div>
                <div>
                  <div className="text-lg font-black text-rose-600">
                    {dashboard?.circuitBreaker?.recentFailures30s || 0}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Fallas (30s)</div>
                </div>
                <div>
                  <div className="text-lg font-black text-slate-900">
                    {dashboard?.circuitBreaker?.failureRatePct || 0}%
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">% Error</div>
                </div>
              </div>
              <button
                onClick={async () => {
                  await apiFetch('/circuit-breaker/reset', { method: 'POST' });
                  toast.success('Circuit Breaker reiniciado a CLOSED.');
                  loadDashboard();
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-black uppercase tracking-wider transition"
              >
                Reiniciar Circuit Breaker Manualmente
              </button>
            </div>

            {/* Cola Durable y DLQ Card (Sección 9.2 Go Éxito) */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <h3 className="font-black text-sm uppercase text-slate-800">
                    Cola de Tracking 24h & DLQ (Sección 9.2)
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[11px] font-black">
                  RPO = 0
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Reintentos automáticos: <strong>0s, 1m, 2m, 5m, 15m, 30m... hasta 24h</strong>. Luego pasa a <strong>DLQ</strong> con reproceso manual.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                {['ENVIADO', 'REINTENTANDO', 'DLQ'].map((st) => {
                  const found = dashboard?.queueSummary?.find((q: any) => q.estado_cola === st);
                  return (
                    <div key={st}>
                      <div
                        className={`text-lg font-black ${
                          st === 'DLQ'
                            ? 'text-rose-600'
                            : st === 'REINTENTANDO'
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        {found?.total || 0}
                      </div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">{st}</div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setActiveSubTab('cola_dlq')}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition"
              >
                Abrir Monitor de Cola y DLQ
              </button>
            </div>
          </div>

          {/* Métricas de Latencia SLO (p50, p95, p99) exigidas en Sección 8 y 12 */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm uppercase text-slate-800">
                Métricas de Latencia y Nivel de Servicio (SLO Go Éxito v2.0 — Últimas 24h)
              </h3>
              <span className="text-xs font-bold text-slate-500">
                Meta SLO: p95 &le; 2000 ms · p99 &le; 4000 ms · Disponibilidad &ge; 99.5%
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase">
                    <th className="py-2 px-3">Operación API</th>
                    <th className="py-2 px-3">Total Llamadas</th>
                    <th className="py-2 px-3">Exitosas (OK)</th>
                    <th className="py-2 px-3">Errores</th>
                    <th className="py-2 px-3">Latencia p50</th>
                    <th className="py-2 px-3">Latencia p95</th>
                    <th className="py-2 px-3">Latencia p99</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(dashboard?.observability24h || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Sin tráfico registrado en las últimas 24h. Use la pestaña Sandbox para simular transacciones.
                      </td>
                    </tr>
                  ) : (
                    dashboard.observability24h.map((m: any) => (
                      <tr key={m.operation} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-black text-slate-900">{m.operation}</td>
                        <td className="py-2.5 px-3 font-bold">{m.total_calls}</td>
                        <td className="py-2.5 px-3 text-emerald-600 font-bold">{m.ok_calls}</td>
                        <td className="py-2.5 px-3 text-rose-600 font-bold">{m.error_calls}</td>
                        <td className="py-2.5 px-3 font-mono">{m.p50_ms} ms</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{m.p95_ms} ms</td>
                        <td className="py-2.5 px-3 font-mono">{m.p99_ms} ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: GESTIÓN DE GUÍAS, BODEGA, RUTAS URBANAS Y CONTINGENCIA MANUAL
         ===================================================================== */}
      {activeSubTab === 'guias' && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPageGuias(1);
                }}
                placeholder="Buscar por guía, pedido, contenedor, barrio o cliente..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value);
                setPageGuias(1);
              }}
              className="px-3 py-2 bg-amber-50 border-2 border-amber-400 rounded-xl text-xs font-black text-slate-900"
            >
              <option value="DISPONIBLES_RECOGIDA">📌 1 - Disponibles a Recoger (Vista Inicial)</option>
              <option value="TODOS">🔍 Ver Todos los Estados Urbanos</option>
              <option value="ESPERA_RECOGIDA">1 - Espera Recogida</option>
              <option value="DISPONIBLE">1 - Disponible en Nodo</option>
              <option value="RECOGIDA_TIENDA">2 - Recogida en Tienda (En Tránsito)</option>
              <option value="EN_ALMACEN">2 - En Bodega Local M7</option>
              <option value="EN_RUTA">5 - En Reparto Urbano</option>
              <option value="ENTREGADO">6 - Entregado</option>
              <option value="DEVOLUCION">9 - Devolución</option>
              <option value="ANULADO">7 - Cancelado</option>
            </select>
            <select
              value={filtroOperacion}
              onChange={(e) => {
                setFiltroOperacion(e.target.value);
                setPageGuias(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="TODOS">Same-Day + Next-Day</option>
              <option value="SAME_DAY">⚡ Same-Day (Mismo Día)</option>
              <option value="NEXT_DAY">📅 Next-Day (Día Siguiente)</option>
            </select>
            <select
              value={filtroNodo}
              onChange={(e) => {
                setFiltroNodo(e.target.value);
                setPageGuias(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="TODOS">Todos los Nodos Éxito</option>
              {maestras.nodos.map((n: any) => (
                <option key={n.id} value={n.id}>
                  Nodo {n.codigo_dependencia} - {n.nombre}
                </option>
              ))}
            </select>
            <select
              value={filtroSync}
              onChange={(e) => {
                setFiltroSync(e.target.value);
                setPageGuias(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
            >
              <option value="TODOS">Estado Sync Go Éxito</option>
              <option value="SINCRONIZADO">✅ Sincronizado</option>
              <option value="PENDIENTE">⏳ Pendiente</option>
              <option value="REINTENTANDO">🔄 Reintentando</option>
              <option value="DLQ">🚨 En DLQ (Fallo &gt;24h)</option>
            </select>
          </div>

          {/* Barra Global de Asignación de Placa Recogida por Nodos + Accesos a Páginas de Almacén y Despacho */}
          <div className="bg-slate-900 text-white p-4 md:p-5 rounded-3xl space-y-3 shadow-lg border border-slate-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-black uppercase text-amber-400 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Asignación Global de Placa para Recogida por Nodos (No guía por guía)
                </div>
                <p className="text-[11px] text-slate-300">
                  Seleccione la <strong>Placa + Conductor</strong> y marque los <strong>Nodos Éxito</strong> donde recogerá. Cuando el conductor ingrese con su placa, verá todos los disponibles en esos nodos y estampará su placa al recoger.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigate('exito-mensajeria-recepcion')}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase transition shadow"
                    >
                      <Warehouse className="w-4 h-4" /> 2. Página Recepción Almacén (Pistoleo)
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('exito-mensajeria-despacho')}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase transition shadow"
                    >
                      <Navigation className="w-4 h-4" /> 3. Página Despacho Inteligente (Rutas)
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-48 sm:w-56">
                  <SearchableDropdown
                    theme="dark"
                    options={vehicleOptions}
                    value={selVehiculoId}
                    onChange={handleVehicleChange}
                    placeholder="-- Placa Vehículo --"
                    searchPlaceholder="Buscar placa..."
                  />
                </div>
                <div className="w-56 sm:w-64">
                  <SearchableDropdown
                    theme="dark"
                    options={driverOptions}
                    value={selConductorId}
                    onChange={(val) => setSelConductorId(val)}
                    placeholder="-- Conductor --"
                    searchPlaceholder="Buscar conductor..."
                  />
                </div>

                {/* Selección de Nodos donde esa placa va a recoger */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {maestras.nodos.map((n: any) => {
                    const nId = Number(n.id);
                    const isChecked = selNodosRecogidaIds.includes(nId);
                    const currentPlate = vehiculoSeleccionadoObj?.plate || '';
                    return (
                      <button
                        key={nId}
                        type="button"
                        onClick={() =>
                          setSelNodosRecogidaIds((prev) =>
                            prev.includes(nId) ? prev.filter((id) => id !== nId) : [...prev, nId]
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black border transition flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-blue-600/40 border-blue-400 text-white shadow-sm ring-1 ring-blue-400/50'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        <input type="checkbox" checked={isChecked} readOnly className="rounded pointer-events-none" />
                        <span>Nodo {n.codigo_dependencia}</span>
                        {isChecked ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black shadow-sm flex items-center gap-0.5">
                            {currentPlate ? `→ ${currentPlate}` : (n.placa_recogida || 'ASIGNAR')}
                          </span>
                        ) : n.placa_recogida ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-bold">
                            {n.placa_recogida}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAssignPickup}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase transition shadow-md"
              >
                <Truck className="w-4 h-4" /> 1. Programar Vehículo a Recogida ({selNodosRecogidaIds.length} Nodos)
              </button>
            </div>

            {/* HISTÓRICO Y PROGRAMACIÓN ACTIVA DE VEHÍCULOS ASIGNADOS A RECOGER EN NODOS */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11px] font-black uppercase text-emerald-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Vehículos Programados para ir a Recoger e Histórico de Asignaciones ({(maestras.programacionRecogidas || []).length})
                </div>
                <span className="text-[10px] text-slate-400">
                  Muestra qué placas y conductores están programados actualmente para ir a recoger y el historial de recogidas realizadas
                </span>
              </div>

              {(maestras.programacionRecogidas || []).length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 text-xs text-slate-400 text-center">
                  Aún no hay vehículos programados en el historial. Seleccione Placa + Conductor + Nodos arriba y pulse "1. Programar Vehículo a Recogida".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {(maestras.programacionRecogidas || []).map((prg: any) => {
                    const esActiva = prg.estado === 'PROGRAMADO';
                    const esCompletada = prg.estado === 'RECOGIDA_COMPLETADA';
                    return (
                      <div
                        key={prg.id}
                        className={`p-3 rounded-2xl border text-left space-y-1.5 ${
                          esActiva
                            ? 'bg-blue-950/60 border-blue-500/50'
                            : esCompletada
                            ? 'bg-emerald-950/50 border-emerald-500/40'
                            : 'bg-slate-800/60 border-slate-700 opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-xs">
                            🚚 Placa: {prg.placa}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              esActiva
                                ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                                : esCompletada
                                ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {esActiva
                              ? '🟢 PROGRAMADO PARA RECOGER'
                              : esCompletada
                              ? `✅ RECOGIDA COMPLETADA (${prg.total_guias_recogidas || 0})`
                              : '🔄 REPROGRAMADO'}
                          </span>
                        </div>
                        <div className="text-xs font-black text-white">
                          Conductor: {prg.conductor_nombre}{' '}
                          {prg.conductor_cedula ? `(CC ${prg.conductor_cedula})` : ''}
                        </div>
                        <div className="text-[11px] font-bold text-slate-300 leading-snug">
                          📍 {prg.nodos_resumen}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700/60">
                          <span>Código: {prg.codigo_programacion}</span>
                          <span>
                            {prg.created_at
                              ? new Date(prg.created_at).toLocaleString('es-CO', {
                                  timeZone: 'America/Bogota',
                                })
                              : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Paginación y Contador Ágil (Soporta miles de guías) */}
          <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-600">
            <div>
              Mostrando <strong>{guias.length}</strong> de <strong>{totalCountGuias}</strong> guía(s) · Vista:{' '}
              <span className="text-indigo-700 font-black">
                {filtroEstado === 'DISPONIBLES_RECOGIDA'
                  ? 'DISPONIBLES A RECOGER'
                  : filtroEstado}
              </span>
            </div>
            {totalPagesGuias > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pageGuias <= 1}
                  onClick={() => setPageGuias((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-lg bg-white border border-slate-300 disabled:opacity-40 font-black"
                >
                  Anterior
                </button>
                <span>
                  Página {pageGuias} de {totalPagesGuias}
                </span>
                <button
                  type="button"
                  disabled={pageGuias >= totalPagesGuias}
                  onClick={() => setPageGuias((p) => Math.min(totalPagesGuias, p + 1))}
                  className="px-3 py-1 rounded-lg bg-white border border-slate-300 disabled:opacity-40 font-black"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>

          {/* Tabla de Guías */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                  <tr>
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={guias.length > 0 && selectedGuiaIds.length === guias.length}
                        onChange={(e) =>
                          setSelectedGuiaIds(e.target.checked ? guias.map((g) => Number(g.id)) : [])
                        }
                      />
                    </th>
                    <th className="p-3">Guía / Pedido / Modalidad</th>
                    <th className="p-3">Operación</th>
                    <th className="p-3">Nodo Origen</th>
                    <th className="p-3">Destinatario (Misma Ciudad)</th>
                    <th className="p-3">Trazabilidad Flota (1ra Milla Tienda vs Última Milla Reparto)</th>
                    <th className="p-3">Estado Urbano & Go Éxito</th>
                    <th className="p-3">Soportes & PDF B/N</th>
                    <th className="p-3">Sync Webhook</th>
                    <th className="p-3 text-right">Acciones / Contingencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {guias.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-slate-400">
                        No hay guías para los filtros seleccionados. Puede crear guías de prueba desde la pestaña 6 (Sandbox).
                      </td>
                    </tr>
                  ) : (
                    guias.map((g) => {
                      const estInfo = ESTADO_LABELS[g.estado_operativo] || {
                        label: g.estado_operativo,
                        idGuia: g.id_guia_exito,
                        badge: 'bg-slate-100 text-slate-700',
                      };
                      const checked = selectedGuiaIds.includes(Number(g.id));
                      return (
                        <tr key={g.id} className="hover:bg-slate-50/80">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedGuiaIds((prev) =>
                                  e.target.checked
                                    ? [...prev, Number(g.id)]
                                    : prev.filter((id) => id !== Number(g.id))
                                )
                              }
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-slate-900">{g.numero_guia}</span>
                              {g.is_sandbox && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[9px] font-black">
                                  SANDBOX
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              Ped: {g.numero_pedido} · {g.modalidad_pedido}
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                g.tipo_operacion === 'SAME_DAY'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {g.tipo_operacion === 'SAME_DAY' ? '⚡ Same Day' : '📅 Next Day'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">
                              Nodo {g.codigo_dependencia}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                              {g.nodo_nombre || g.nombre_remitente}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{g.nombre_destinatario}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                              {g.direccion_destinatario} ({g.barrio_destinatario})
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1.5 min-w-[210px]">
                              {/* 1RA MILLA: RECOGIDA EN TIENDA -> BODEGA M7 */}
                              <div className="p-1.5 rounded-lg bg-blue-50/90 border border-blue-200 text-[10px]">
                                <div className="flex items-center justify-between gap-1 font-black text-blue-950">
                                  <span>🏢 1ra Milla (Tienda):</span>
                                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white">
                                    {g.placa_recogida || 'Sin placa'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-blue-800 mt-0.5">
                                  <span className="truncate max-w-[120px]">
                                    {g.conductor_recogida_nombre || 'Pend. recoger en tienda'}
                                  </span>
                                  {g.codigo_recogida && (
                                    <button
                                      type="button"
                                      onClick={() => handlePrintOrViewPlanilla(g.codigo_recogida, false)}
                                      className="font-black underline text-blue-700 hover:text-blue-900"
                                      title="Ver/Imprimir Remisión de Recogida en Tienda (REC-EX-...)"
                                    >
                                      {g.codigo_recogida}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* ÚLTIMA MILLA: SALIDA DE BODEGA M7 -> CLIENTE FINAL */}
                              <div className="p-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200 text-[10px]">
                                <div className="flex items-center justify-between gap-1 font-black text-emerald-950">
                                  <span>🏠 Última Milla (Cliente):</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded ${
                                      g.placa_entrega
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {g.placa_entrega || 'En Almacén/Pend.'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-emerald-800 mt-0.5">
                                  <span className="truncate max-w-[120px]">
                                    {g.conductor_entrega_nombre || 'Pend. despacho reparto'}
                                  </span>
                                  {g.codigo_ruta && (
                                    <button
                                      type="button"
                                      onClick={() => handlePrintOrViewPlanilla(g.codigo_ruta, false)}
                                      className="font-black underline text-emerald-700 hover:text-emerald-900"
                                      title="Ver/Imprimir Planilla de Reparto a Cliente Final (RUT-EX-...)"
                                    >
                                      {g.codigo_ruta}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${estInfo.badge}`}>
                              {estInfo.label} (Id guía={estInfo.idGuia})
                            </span>
                            {g.tiene_novedad_activa && (
                              <div className="text-[10px] text-rose-600 font-bold mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {g.ultima_novedad_texto}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => handlePrintOrViewGuideLabel(Number(g.id), g.numero_guia, true)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] flex items-center gap-1 shadow-xs"
                                title="Generar e Imprimir Rótulo 4x6 bajo demanda (sin ocupar Google Drive)"
                              >
                                <FileText className="w-3 h-3" /> Imprimir Rótulo
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintOrViewGuideLabel(Number(g.id), g.numero_guia, false)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1"
                                title="Ver Rótulo PDF en pestaña nueva"
                              >
                                <Eye className="w-3 h-3 text-indigo-600" /> Ver PDF
                              </button>
                              {g.remision_pdf_url && (
                                <a
                                  href={g.remision_pdf_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-[10px] flex items-center gap-1"
                                  title="Abrir Remisión PDF en Google Drive"
                                >
                                  <FileText className="w-3 h-3" /> Remisión
                                </a>
                              )}
                              {(g.foto_entrega_url || g.foto_recogida_url || g.foto_url) && (
                                <a
                                  href={g.foto_entrega_url || g.foto_recogida_url || g.foto_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1"
                                  title="Ver Foto de Evidencia en Google Drive"
                                >
                                  <ExternalLink className="w-3 h-3" /> Foto Drive
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                g.exito_sync_status === 'SINCRONIZADO'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : g.exito_sync_status === 'DLQ'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {g.exito_sync_status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleManualResendToExito(Number(g.id), g.numero_guia)}
                                title="Reenviar estado actual al Webhook de Go Éxito"
                                className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] uppercase flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" /> Reenviar a Éxito
                              </button>
                              <button
                                onClick={() => {
                                  setManualModalGuia(g);
                                  setManualNuevoEstado(g.estado_operativo);
                                }}
                                title="Cambio manual de estado por contingencia"
                                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] uppercase"
                              >
                                Estado Manual
                              </button>
                              <button
                                onClick={() => handleOpenDetail(Number(g.id))}
                                title="Ver trazabilidad completa"
                                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: COLA DURABLE DE TRACKING Y DLQ (24 HORAS)
         ===================================================================== */}
      {activeSubTab === 'cola_dlq' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-base uppercase text-slate-900">
                Cola Durable de Notificaciones Webhook hacia Go Éxito & DLQ (Sección 9.2)
              </h3>
              <p className="text-xs text-slate-500">
                Política: Reintento inmediato, 1m, 2m, 5m, 15m, 30m y cada 30m hasta 24h. Permite reproceso manual en cualquier momento.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filtroCola}
                onChange={(e) => setFiltroCola(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                <option value="TODOS">Todos los Eventos</option>
                <option value="DLQ">🚨 Solo DLQ (Fallos &gt;24h)</option>
                <option value="REINTENTANDO">🔄 Reintentando</option>
                <option value="PENDIENTE">⏳ Pendientes</option>
                <option value="ENVIADO">✅ Enviados Exitosamente</option>
              </select>
              <button
                onClick={loadQueue}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase"
              >
                Refrescar Cola
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                <tr>
                  <th className="p-3">ID Cola</th>
                  <th className="p-3">Guía / Pedido</th>
                  <th className="p-3">Status Go Éxito</th>
                  <th className="p-3">Estado Cola</th>
                  <th className="p-3">Intentos</th>
                  <th className="p-3">Última Respuesta / Error</th>
                  <th className="p-3">Disparado Por</th>
                  <th className="p-3 text-right">Contingencia Manual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {syncQueueItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No hay eventos en la cola con el filtro seleccionado.
                    </td>
                  </tr>
                ) : (
                  syncQueueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold">#{item.id}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{item.numero_guia}</div>
                        <div className="text-[11px] text-slate-500">{item.numero_pedido}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-1 rounded bg-slate-100 font-black">
                          Id guía = {item.id_guia_status} ({item.codigo_interno})
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            item.estado_cola === 'ENVIADO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.estado_cola === 'DLQ'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.estado_cola}
                        </span>
                      </td>
                      <td className="p-3 font-bold">{item.intentos}</td>
                      <td className="p-3 max-w-xs truncate font-mono text-[11px] text-slate-600">
                        [{item.http_status || '---'}] {item.respuesta_exito}
                      </td>
                      <td className="p-3 text-[11px]">
                        {item.disparado_por}
                        {item.usuario_reproceso && ` (${item.usuario_reproceso})`}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={async () => {
                            const r = await apiFetch(`/cola/${item.id}/reintentar`, { method: 'POST' });
                            toast.success(r.message);
                            loadQueue();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] uppercase"
                        >
                          ⚡ Reenviar Ahora
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: DEVOLUCIONES SEMANALES A NODOS ÉXITO
         ===================================================================== */}
      {activeSubTab === 'devoluciones' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-base uppercase text-slate-900">
                  Generar Lote de Devolución Semanal al Nodo Éxito Local (Id guía = 9)
                </h3>
                <p className="text-xs text-slate-500">
                  Agrupa guías con 3 intentos fallidos o rechazo definitivo, genera el Acta PDF en Google Drive (<code className="text-slate-800">Devoluciones/</code>) y notifica a Go Éxito.
                </p>
              </div>
              <button
                onClick={async () => {
                  const devIds = guias
                    .filter((g) => g.estado_operativo === 'DEVOLUCION')
                    .map((g) => Number(g.id));
                  if (devIds.length === 0) {
                    return toast.warning('No hay guías en estado DEVOLUCION actualmente.');
                  }
                  const res = await apiFetch('/devoluciones', {
                    method: 'POST',
                    body: JSON.stringify({
                      guiaIds: devIds,
                      vehiculoId: selVehiculoId,
                      conductorId: selConductorId,
                      observaciones: 'Lote semanal de devolución generado desde Inhouse',
                    }),
                  });
                  toast.success(res.message);
                  loadDevoluciones();
                }}
                className="px-4 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-black text-xs uppercase"
              >
                Generar Acta PDF de Devolución ({guias.filter((g) => g.estado_operativo === 'DEVOLUCION').length} guías)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                  <tr>
                    <th className="p-3">Código Lote</th>
                    <th className="p-3">Nodo Destino</th>
                    <th className="p-3">Total Guías</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Acta PDF en Google Drive</th>
                    <th className="p-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lotesDevolucion.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        Sin lotes de devolución generados aún.
                      </td>
                    </tr>
                  ) : (
                    lotesDevolucion.map((l) => (
                      <tr key={l.id}>
                        <td className="p-3 font-black">{l.codigo_lote}</td>
                        <td className="p-3">{l.nodo_nombre || `Nodo #${l.nodo_id}`}</td>
                        <td className="p-3 font-bold">{l.total_guias}</td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 text-[10px] font-black">
                            {l.estado}
                          </span>
                        </td>
                        <td className="p-3">
                          {l.remision_pdf_url && (
                            <a
                              href={l.remision_pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 font-bold hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" /> Ver Acta en Google Drive
                            </a>
                          )}
                        </td>
                        <td className="p-3 text-slate-500">
                          {new Date(l.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: MAESTRAS Y MATRIZ OFICIAL DE HOMOLOGACIÓN (SECCIÓN 16)
         ===================================================================== */}
      {activeSubTab === 'maestras' && (
        <div className="space-y-6">
          {/* Matriz Oficial de Homologación Sección 16 Go Éxito v2.0 (Filtrada para Misma Ciudad) */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-black text-base uppercase text-slate-900">
              Matriz Oficial de Homologación de Estados — Sección 16 Go Éxito v2.0 (Operación Misma Ciudad Milla 7)
            </h3>
            <p className="text-xs text-slate-600">
              Como Milla 7 recoge y entrega dentro de los nodos de la <strong>misma ciudad</strong>, los estados nacionales <strong>Id guía 3 (En transporte)</strong> e <strong>Id guía 4 (En ciudad destino)</strong> están desactivados para no enviar pasos nacionales innecesarios.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                  <tr>
                    <th className="p-2.5">Código Interno M7</th>
                    <th className="p-2.5">¿Activo en Milla 7 (Urbano)?</th>
                    <th className="p-2.5">Id Paquete Go Éxito</th>
                    <th className="p-2.5">Id Guía (Webhook Status)</th>
                    <th className="p-2.5">Estado Transportadora</th>
                    <th className="p-2.5">Descripción Operativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maestras.estados.map((e: any) => (
                    <tr
                      key={e.codigo_interno}
                      className={e.activo_operacion_local ? 'bg-white' : 'bg-slate-50 opacity-60'}
                    >
                      <td className="p-2.5 font-mono font-black">{e.codigo_interno}</td>
                      <td className="p-2.5">
                        {e.activo_operacion_local ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">
                            ✅ ACTIVO (MISMA CIUDAD)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-black text-[10px]">
                            ⛔ OMITIDO (NACIONAL)
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-bold">
                        {e.id_paquete_go_exito} — {e.estado_go_exito}
                      </td>
                      <td className="p-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-black">
                          status = "{e.id_guia_transportadora}"
                        </span>
                      </td>
                      <td className="p-2.5 font-bold">{e.estado_transportadora}</td>
                      <td className="p-2.5 text-slate-600">{e.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gestión de Nodos / Tiendas Éxito */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/maestras/nodos', {
                  method: 'POST',
                  body: JSON.stringify(nodoForm),
                });
                toast.success('Nodo / Dependencia Éxito guardado.');
                setNodoForm({
                  codigo_dependencia: '',
                  nombre: '',
                  ciudad_dane: '05001000',
                  ciudad_nombre: 'MEDELLÍN',
                  departamento: 'ANTIOQUIA',
                  direccion: '',
                  barrio: '',
                  contacto_nombre: '',
                  contacto_telefono: '',
                  hora_corte_same_day: '11:30:00',
                });
                loadMasterCatalogs();
              }}
              className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3"
            >
              <h4 className="font-black text-sm uppercase text-slate-900">
                Registrar / Actualizar Nodo (Tienda Éxito)
              </h4>
              <input
                required
                placeholder="Código Dependencia (ej. 0054)"
                value={nodoForm.codigo_dependencia}
                onChange={(e) => setNodoForm({ ...nodoForm, codigo_dependencia: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <input
                required
                placeholder="Nombre Tienda (ej. ÉXITO WOW ENVIGADO)"
                value={nodoForm.nombre}
                onChange={(e) => setNodoForm({ ...nodoForm, nombre: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <input
                required
                placeholder="Dirección Tienda"
                value={nodoForm.direccion}
                onChange={(e) => setNodoForm({ ...nodoForm, direccion: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Ciudad (ej. MEDELLÍN)"
                  value={nodoForm.ciudad_nombre}
                  onChange={(e) => setNodoForm({ ...nodoForm, ciudad_nombre: e.target.value })}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
                <input
                  placeholder="Código DANE (05001000)"
                  value={nodoForm.ciudad_dane}
                  onChange={(e) => setNodoForm({ ...nodoForm, ciudad_dane: e.target.value })}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase"
              >
                Guardar Nodo Éxito
              </button>
            </form>

            <div className="lg:col-span-2 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <h4 className="font-black text-sm uppercase text-slate-900">
                Nodos / Dependencias Éxito Activos ({maestras.nodos.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                    <tr>
                      <th className="p-2.5">Dependencia</th>
                      <th className="p-2.5">Tienda / Nodo</th>
                      <th className="p-2.5">Ciudad (DANE)</th>
                      <th className="p-2.5">Dirección</th>
                      <th className="p-2.5">Corte Same-Day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maestras.nodos.map((n: any) => (
                      <tr key={n.id}>
                        <td className="p-2.5 font-mono font-black text-indigo-700">
                          {n.codigo_dependencia}
                        </td>
                        <td className="p-2.5 font-bold">{n.nombre}</td>
                        <td className="p-2.5">
                          {n.ciudad_nombre} ({n.ciudad_dane})
                        </td>
                        <td className="p-2.5 text-slate-600">{n.direccion}</td>
                        <td className="p-2.5 font-mono">{n.hora_corte_same_day}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: ENTORNO DE PRUEBAS (SANDBOX) & CONTRATO OPENAPI 3.0.3
         ===================================================================== */}
      {activeSubTab === 'sandbox' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Simulador de Peticiones Go Éxito v2.0 */}
            <div className="bg-white rounded-3xl p-6 border-2 border-amber-300 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-6 h-6 text-amber-600" />
                  <h3 className="font-black text-base uppercase text-slate-900">
                    Simulador de Integración Go Éxito v2.0 (SANDBOX)
                  </h3>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black">
                  AISLADO DE PRODUCCIÓN
                </span>
              </div>

              <p className="text-xs text-slate-600">
                Simula el envío de órdenes desde Grupo Éxito (<code className="text-slate-900">CREATE_GUIDE_REQUEST</code> + <code className="text-slate-900">COLLECT_GUIDE</code>), generando rótulos PDF reales en <code className="text-emerald-700">exito_fulfillment/Sandbox/</code> para que puedas probar todo el flujo Inhouse y la App de Conductor Adulto Mayor (<code className="text-slate-900">PAG-84</code>).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500">
                    Cantidad de Guías
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={sandboxCount}
                    onChange={(e) => setSandboxCount(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500">
                    Tipo de Operación
                  </label>
                  <select
                    value={sandboxTipoOp}
                    onChange={(e) => setSandboxTipoOp(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="SAME_DAY">Same-Day (Entrega Hoy)</option>
                    <option value="NEXT_DAY">Next-Day (Día Siguiente)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500">
                    Modalidad Go Éxito
                  </label>
                  <select
                    value={sandboxModalidad}
                    onChange={(e) => setSandboxModalidad(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    <option value="FIRME">FIRME</option>
                    <option value="VMI">VMI</option>
                    <option value="MARKETPLACE">MARKETPLACE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500">
                    Nodo / Tienda Origen
                  </label>
                  <select
                    value={sandboxDependencia}
                    onChange={(e) => setSandboxDependencia(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    {maestras.nodos.map((n: any) => (
                      <option key={n.codigo_dependencia} value={n.codigo_dependencia}>
                        {n.codigo_dependencia} - {n.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={handleSimulateSandbox}
                  className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow"
                >
                  <Sparkles className="w-4 h-4" /> Generar Guías de Prueba en Sandbox
                </button>
                <button
                  onClick={handleResetSandbox}
                  className="px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs uppercase"
                >
                  Limpiar Sandbox
                </button>
              </div>

              {/* Simulador de Caída 503 de Go Éxito para probar Contingencia Manual */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <div className="font-black text-xs uppercase text-slate-800 flex items-center gap-1.5">
                    <ServerCrash className="w-4 h-4 text-rose-600" />
                    Simular Caída 503 del Webhook de Go Éxito (Prueba de Contingencia)
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Actívelo para comprobar cómo los estados quedan en Cola/Reintento y probar el botón manual <strong>"Reenviar a Éxito"</strong>.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleSandbox503(simulate503Active)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase shrink-0 ${
                    simulate503Active
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {simulate503Active ? '503 ACTIVO (Desactivar)' : 'Simular 503'}
                </button>
              </div>
            </div>

            {/* Documentación B2B & Descarga OpenAPI 3.0.3 */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-base uppercase text-emerald-400">
                  Endpoints Exclusivos para Grupo Éxito & OpenAPI 3.0.3
                </h3>
                <button
                  onClick={handleDownloadOpenApi}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase"
                >
                  <Download className="w-4 h-4" /> OpenAPI 3.0.3 JSON
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="font-black text-amber-300">POST /api/v1/guides</div>
                  <div className="text-slate-300 text-[11px]">
                    7.1 Creación de guía y rótulo PDF en Google Drive (<code className="text-emerald-300">CREATE_GUIDE_REQUEST</code>).
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="font-black text-amber-300">POST /api/v1/pickups</div>
                  <div className="text-slate-300 text-[11px]">
                    7.2 Solicitud de recogida en tienda local (<code className="text-emerald-300">COLLECT_GUIDE</code>).
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="font-black text-amber-300">POST /api/v1/guides/:guideNumber/cancel</div>
                  <div className="text-slate-300 text-[11px]">
                    7.3 Anulación idempotente con validación de estado actual (<code className="text-emerald-300">200 / 409</code>).
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="font-black text-amber-300">GET /api/v1/guides/:guideNumber/label</div>
                  <div className="text-slate-300 text-[11px]">
                    7.1 Consulta / Reimpresión de Rótulo PDF desde Google Drive (<code className="text-emerald-300">PAQUETERA_GET_LABELS_RESPONSE</code>).
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="font-black text-amber-300">GET /api/v1/guides/:guideNumber</div>
                  <div className="text-slate-300 text-[11px]">
                    Consulta síncrona de estado homologado (<code className="text-emerald-300">1, 2, 5, 6, 7, 9</code>) y evidencias en Google Drive.
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-[11px] text-slate-300">
                <div>Headers obligatorios:</div>
                <div className="text-emerald-300">x-api-key: m7_goexito_sandbox_2026_test_key</div>
                <div className="text-cyan-300">x-correlation-id: &lt;uuid-v4&gt;</div>
                <div className="text-amber-300">Idempotency-Key: &lt;unique-key-24h&gt;</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: DETALLE COMPLETO Y TRAZABILIDAD DE GUÍA
         ===================================================================== */}
      {detailModalGuia && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-black uppercase text-indigo-600">
                  Trazabilidad y Evidencias en Google Drive
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  Guía {detailModalGuia.guia.numero_guia} · Pedido {detailModalGuia.guia.numero_pedido}
                </h3>
              </div>
              <button
                onClick={() => setDetailModalGuia(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* DIFERENCIACIÓN EXPLÍCITA: 1RA MILLA (RECOGIDA EN TIENDA) VS ÚLTIMA MILLA (ENTREGA DESDE ALMACÉN A CLIENTE FINAL) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-blue-800">
                    🏢 1ra Milla · Recogió en Tienda Éxito &rarr; Bodega M7
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-blue-700 text-white font-black text-xs">
                    Placa: {detailModalGuia.guia.placa_recogida || 'Sin asignar'}
                  </span>
                </div>
                <div className="text-xs font-black text-slate-900">
                  Conductor Tienda: {detailModalGuia.guia.conductor_recogida_nombre || 'Pendiente de recogida'}
                </div>
                <div className="flex items-center justify-between text-[11px] text-blue-900 pt-1">
                  <span>
                    Remisión Tienda: <strong>{detailModalGuia.guia.codigo_recogida || 'N/A'}</strong>
                  </span>
                  {detailModalGuia.guia.codigo_recogida && (
                    <button
                      type="button"
                      onClick={() => handlePrintOrViewPlanilla(detailModalGuia.guia.codigo_recogida, true)}
                      className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-black text-[10px]"
                    >
                      Imprimir Remisión REC-EX
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-emerald-800">
                    🏠 Última Milla · Salió de Bodega M7 &rarr; Cliente Final
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-700 text-white font-black text-xs">
                    Placa: {detailModalGuia.guia.placa_entrega || 'Pendiente despacho'}
                  </span>
                </div>
                <div className="text-xs font-black text-slate-900">
                  Conductor Reparto: {detailModalGuia.guia.conductor_entrega_nombre || 'Pendiente de despacho en almacén'}
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-900 pt-1">
                  <span>
                    Planilla Reparto: <strong>{detailModalGuia.guia.codigo_ruta || 'N/A'}</strong>
                  </span>
                  {detailModalGuia.guia.codigo_ruta && (
                    <button
                      type="button"
                      onClick={() => handlePrintOrViewPlanilla(detailModalGuia.guia.codigo_ruta, true)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-black text-[10px]"
                    >
                      Imprimir Planilla RUT-EX
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Acciones de Rótulo On-Demand y Soportes en Google Drive */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200">
                <div className="text-[10px] font-black uppercase text-indigo-700">Rótulo 4x6&quot; (On-Demand)</div>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintOrViewGuideLabel(
                        Number(detailModalGuia.guia.id),
                        detailModalGuia.guia.numero_guia,
                        true
                      )
                    }
                    className="text-xs font-black text-indigo-700 hover:underline flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" /> Imprimir
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintOrViewGuideLabel(
                        Number(detailModalGuia.guia.id),
                        detailModalGuia.guia.numero_guia,
                        false
                      )
                    }
                    className="text-xs font-bold text-slate-600 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver PDF
                  </button>
                </div>
              </div>
              {[
                { label: 'Remisión PDF (Drive)', url: detailModalGuia.guia.remision_pdf_url },
                { label: 'Foto Recogida (Drive)', url: detailModalGuia.guia.foto_recogida_url },
                { label: 'Foto Entrega (Drive)', url: detailModalGuia.guia.foto_entrega_url || detailModalGuia.guia.foto_url },
              ].map((doc) => (
                <div key={doc.label} className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-black uppercase text-slate-500">{doc.label}</div>
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-black text-emerald-700 hover:underline flex items-center gap-1 mt-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir en Drive
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Pendiente</span>
                  )}
                </div>
              ))}
            </div>

            {/* Historial de Eventos */}
            <div>
              <h4 className="font-black text-xs uppercase text-slate-700 mb-2">
                Historial Inmutable de Estados
              </h4>
              <div className="space-y-2">
                {(detailModalGuia.historial || []).map((h: any) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-black text-slate-900">
                        {h.estado_anterior || 'INICIO'} &rarr; {h.estado_nuevo} (Id guía={h.id_guia_exito})
                      </span>
                      <p className="text-slate-600 text-[11px]">{h.observacion}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <div>{h.usuario_nombre}</div>
                      <div>{new Date(h.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: CAMBIO MANUAL DE ESTADO / CONTINGENCIA INHOUSE
         ===================================================================== */}
      {manualModalGuia && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmManualStateChange}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-black text-slate-900">
              Contingencia Manual: Guía {manualModalGuia.numero_guia}
            </h3>
            <p className="text-xs text-slate-600">
              Actualiza manualmente el estado urbano de la guía y despacha inmediatamente la notificación homologada al Webhook de Go Éxito.
            </p>
            <div>
              <label className="text-xs font-black uppercase text-slate-600">
                Nuevo Estado Urbano (Misma Ciudad)
              </label>
              <select
                value={manualNuevoEstado}
                onChange={(e) => setManualNuevoEstado(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                <option value="DISPONIBLE">DISPONIBLE (Id guía = 1 — Guía generada)</option>
                <option value="RECOGIDA_TIENDA">RECOGIDA_TIENDA (Id guía = 2 — Paquete recogido)</option>
                <option value="EN_ALMACEN">EN_ALMACEN (Control interno bodega urbana M7)</option>
                <option value="EN_RUTA">EN_RUTA (Id guía = 5 — En reparto)</option>
                <option value="ENTREGADO">ENTREGADO (Id guía = 6 — Entregado)</option>
                <option value="DEVOLUCION">DEVOLUCION (Id guía = 9 — Devolución)</option>
                <option value="ANULADO">ANULADO (Id guía = 7 — Cancelado)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-600">
                Motivo / Observación de Auditoría
              </label>
              <textarea
                required
                rows={3}
                value={manualObservacion}
                onChange={(e) => setManualObservacion(e.target.value)}
                placeholder="Explique el motivo del ajuste manual o contingencia..."
                className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setManualModalGuia(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase"
              >
                Aplicar y Enviar a Éxito
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: CREACIÓN MANUAL DE GUÍA EN CONTINGENCIA
         ===================================================================== */}
      {showCreateManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateManualGuide}
            className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-slate-900">
              Crear Guía por Contingencia Manual (Genera Rótulo en Google Drive)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newGuiaForm.nodo_id}
                onChange={(e) => setNewGuiaForm({ ...newGuiaForm, nodo_id: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                {maestras.nodos.map((n: any) => (
                  <option key={n.id} value={n.id}>
                    Nodo {n.codigo_dependencia} - {n.nombre}
                  </option>
                ))}
              </select>
              <select
                value={newGuiaForm.tipo_operacion}
                onChange={(e) => setNewGuiaForm({ ...newGuiaForm, tipo_operacion: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              >
                <option value="SAME_DAY">Same-Day (Mismo Día)</option>
                <option value="NEXT_DAY">Next-Day (Día Siguiente)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="Número Pedido Éxito (ej. 1412345-01)"
                value={newGuiaForm.numero_pedido}
                onChange={(e) => setNewGuiaForm({ ...newGuiaForm, numero_pedido: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <input
                placeholder="Contenedor (ej. E12345-01-P-1)"
                value={newGuiaForm.contenedor}
                onChange={(e) => setNewGuiaForm({ ...newGuiaForm, contenedor: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <input
              required
              placeholder="Nombre Completo Destinatario"
              value={newGuiaForm.nombre_destinatario}
              onChange={(e) => setNewGuiaForm({ ...newGuiaForm, nombre_destinatario: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <input
              required
              placeholder="Dirección Urbana de Entrega"
              value={newGuiaForm.direccion_destinatario}
              onChange={(e) =>
                setNewGuiaForm({ ...newGuiaForm, direccion_destinatario: e.target.value })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Barrio"
                value={newGuiaForm.barrio_destinatario}
                onChange={(e) =>
                  setNewGuiaForm({ ...newGuiaForm, barrio_destinatario: e.target.value })
                }
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <input
                placeholder="Celular Destinatario"
                value={newGuiaForm.celular_destinatario}
                onChange={(e) =>
                  setNewGuiaForm({ ...newGuiaForm, celular_destinatario: e.target.value })
                }
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateManualModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black uppercase"
              >
                Crear Guía y Rótulo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ExitoMensajeriaInhouse;

