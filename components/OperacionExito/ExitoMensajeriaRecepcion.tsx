import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useConfirmDialog, FilaConfirm } from './useConfirmDialog';
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
  Mail,
  Settings,
  X,
  Send,
  Bell,
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
  const { confirmar, confirmDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'RECIBIR' | 'REMISIONES' | 'NO_LLEGARON'>('RECIBIR');
  const [submitting, setSubmitting] = useState(false);
  const [includeSandbox, setIncludeSandbox] = useState(true);
  const [soloPendientes, setSoloPendientes] = useState(true);

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

  // Gestión de correos de notificación de recogida y recepción
  const [emailSummary, setEmailSummary] = useState<{
    tieneCorreosRecepcion: boolean;
    recepcionAlmacenCount: number;
    tieneCorreosRecogida: boolean;
    recogidaTiendaCount: number;
    habilitado: boolean;
  } | null>(null);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailFormRecogida, setEmailFormRecogida] = useState('');
  const [emailFormRecepcion, setEmailFormRecepcion] = useState('');
  const [emailFormHabilitado, setEmailFormHabilitado] = useState(true);
  const [savingEmails, setSavingEmails] = useState(false);
  const [testEmailInput, setTestEmailInput] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const scannerRef = useRef<HTMLInputElement | null>(null);

  const cargarDatosRecepcion = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        includeSandbox: String(includeSandbox),
        soloPendientes: String(soloPendientes),
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
      if (data.emailConfig) {
        setEmailSummary(data.emailConfig);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [includeSandbox, soloPendientes, selectedRecogidaId, selectedPlaca]);

  const cargarConfiguracionCorreos = async () => {
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/notificaciones/correos`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setEmailFormRecogida((data.config.recogidaTienda || []).join(', '));
        setEmailFormRecepcion((data.config.recepcionAlmacen || []).join(', '));
        setEmailFormHabilitado(data.config.habilitado !== false);
      }
    } catch (err: any) {
      console.error('Error cargando configuración de correos:', err);
    }
  };

  const handleGuardarCorreos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmails(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/notificaciones/correos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          recogidaTienda: emailFormRecogida,
          recepcionAlmacen: emailFormRecepcion,
          habilitado: emailFormHabilitado,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar correos');
      toast.success('Configuración de correos guardada exitosamente.');
      setShowEmailModal(false);
      cargarDatosRecepcion();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingEmails(false);
    }
  };

  const handleProbarEnvio = async (tipo: 'RECOGIDA_TIENDA' | 'RECEPCION_ALMACEN') => {
    if (!testEmailInput.trim() || !testEmailInput.includes('@')) {
      return toast.warning('Ingrese un correo válido para la prueba.');
    }
    setSendingTestEmail(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/notificaciones/probar-envio`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          email: testEmailInput.trim(),
          tipo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar prueba');
      toast.success(data.message || 'Correo de prueba enviado con éxito.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingTestEmail(false);
    }
  };

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

  // Guías reportadas como "no llegaron al almacén" (novedad abierta): van en su propia pestaña
  const guiasNoLlegaron = useMemo(() => guiasPendientes.filter((g) => g.no_llego_almacen), [guiasPendientes]);

  // Filtrado ágil en cliente para miles de registros
  const guiasFiltradas = useMemo(() => {
    const q = searchFilter.trim().toUpperCase();
    return guiasPendientes.filter((g) => {
      if (g.no_llego_almacen) return false;
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

  // Faltantes de la remisión seleccionada: recogidas en tienda y aún sin pistolear
  const faltantesRemision = useMemo(
    () =>
      guiasFiltradas.filter((g) => g.estado_operativo === 'RECOGIDA_TIENDA' && !verificadasIds.has(Number(g.id))),
    [guiasFiltradas, verificadasIds]
  );

  const handleReportarNoLlego = async (ids: number[]) => {
    if (ids.length === 0) return;
    const lista = guiasPendientes.filter((g) => ids.includes(Number(g.id)));
    const ok = await confirmar({
      title: 'Reportar: no llegó al almacén',
      badge: { text: `${ids.length} guía(s)`, variant: 'rose' },
      message: (
        <div className="space-y-0.5 text-left">
          {lista.slice(0, 8).map((g) => (
            <FilaConfirm key={g.id} label={g.numero_guia} value={g.codigo_recogida || g.placa_mostrar || ''} />
          ))}
          {lista.length > 8 && <div className="text-xs text-slate-400 pt-1">y {lista.length - 8} más…</div>}
        </div>
      ),
      infoBox: {
        icon: 'alert',
        text: 'Se envía 10 NOVEDAD a Éxito, se retira de su ruta y no se podrá despachar. Si aparece, se recibe normal.',
        variant: 'rose',
      },
      confirmText: 'Reportar',
      variant: 'danger',
      icon: 'alert',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/guias/no-llego-almacen`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ guiaIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo reportar la novedad');
      toast.success(data.message);
      setVerificadasIds((prev) => {
        const n = new Set(prev);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      await cargarDatosRecepcion();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

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
  const handleConfirmarRecepcionAlmacen = async (forcedIds?: number[]) => {
    let idsArray = Array.isArray(forcedIds) ? forcedIds : Array.from(verificadasIds);
    if (idsArray.length === 0) {
      if (guiasFiltradas.length > 0) {
        const confirmarTodos = await confirmar({
          title: 'Recibir todos los paquetes',
          message: <FilaConfirm label="Paquetes visibles" value={guiasFiltradas.length} />,
          infoBox: { icon: 'alert', text: 'No ha pistoleado paquetes. Se recibirán todos los que están en pantalla.', variant: 'amber' },
          confirmText: 'Recibir todos',
          variant: 'warning',
          icon: 'alert',
        });
        if (confirmarTodos) {
          idsArray = guiasFiltradas.map((g) => Number(g.id));
        } else {
          return;
        }
      } else {
        return toast.warning('Pistolee o seleccione al menos un paquete antes de confirmar la recepción.');
      }
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

      if (data.emailNotified && data.emailRecipients?.length > 0) {
        toast.success(
          `✓ ${data.message}\n📧 Notificación por correo enviada a: ${data.emailRecipients.join(', ')}`,
          { duration: 6000 }
        );
      } else if (data.emailWarning === 'NO_EMAILS_CONFIGURED') {
        toast.warning(
          `⚠️ ${data.message}\nATENCIÓN: No hay correos registrados para la notificación de recepción en almacén. Ingréselos en "Correos de Notificación".`,
          { duration: 8000 }
        );
      } else {
        toast.success(data.message);
      }

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
    <>
      {confirmDialog}
    <div className="p-3 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* ENCABEZADO + PESTAÑAS */}
      <div className="bg-slate-900 text-white rounded-3xl p-3 md:p-4 shadow-xl flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 pr-3 mr-1 border-r border-slate-700">
            <Warehouse className="w-6 h-6 text-purple-400 shrink-0" />
            <span className="font-black text-sm uppercase tracking-tight">Recepción almacén</span>
          </div>
          {(
            [
              { id: 'RECIBIR', label: 'Recibir', count: guiasFiltradas.length },
              { id: 'REMISIONES', label: 'Remisiones', count: remisiones.length },
              { id: 'NO_LLEGARON', label: 'No llegaron', count: guiasNoLlegaron.length },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition ${
                tab === t.id ? 'bg-purple-600 text-white shadow' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t.label}
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] ${
                  t.id === 'NO_LLEGARON' && t.count > 0
                    ? 'bg-rose-500 text-white'
                    : tab === t.id
                    ? 'bg-white/20'
                    : 'bg-slate-700'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
              className="rounded accent-purple-500"
            />
            Solo pendientes
          </label>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={includeSandbox}
              onChange={(e) => setIncludeSandbox(e.target.checked)}
              className="rounded"
            />
            Sandbox
          </label>
          <button
            onClick={() => {
              cargarConfiguracionCorreos();
              setShowEmailModal(true);
            }}
            className={`px-3 py-2 rounded-xl font-black text-xs flex items-center gap-2 border transition ${
              emailSummary && !emailSummary.tieneCorreosRecepcion
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
            }`}
            title="Correos de notificación"
          >
            <Mail className="w-4 h-4" /> Correos
            {emailSummary && emailSummary.tieneCorreosRecepcion && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black">
                {emailSummary.recepcionAlmacenCount}
              </span>
            )}
          </button>
          <button
            onClick={cargarDatosRecepcion}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onNavigate && (
            <button
              onClick={() => onNavigate('exito-mensajeria-despacho')}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5"
            >
              Despacho <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ALERTA VISIBLE SI NO HAY CORREOS REGISTRADOS */}
      {emailSummary && (!emailSummary.tieneCorreosRecepcion || !emailSummary.tieneCorreosRecogida) && (
        <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-black text-amber-950 uppercase tracking-tight flex items-center gap-2">
                <span>No hay correos registrados para las notificaciones operativas</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black">
                  ACCIÓN REQUERIDA
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                Cuando se completen recogidas en tiendas Éxito o se reciban paquetes en el almacén de Milla 7, el sistema <strong>no podrá enviar comprobantes por correo</strong> hasta que registre al menos una dirección de destino.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              cargarConfiguracionCorreos();
              setShowEmailModal(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-black flex items-center justify-center gap-2 shrink-0 shadow-md transition"
          >
            <Mail className="w-4 h-4" /> REGISTRAR CORREOS AHORA
          </button>
        </div>
      )}

      {tab === 'RECIBIR' && (
        <>
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2">
        <span className="text-xs font-black uppercase text-slate-700 flex items-center gap-2">
          <Truck className="w-4 h-4 text-purple-600" /> Llega:
        </span>
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

      {/* PASO 2: PISTOLEO DE CÓDIGO DE BARRAS / QR + CONTADORES EN TIEMPO REAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <form
          onSubmit={handlePistolearGuia}
          className="lg:col-span-7 bg-slate-900 text-white rounded-2xl p-4 md:p-5 shadow-lg flex flex-col justify-between gap-3 border-2 border-purple-500/50"
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-2">
              <ScanBarcode className="w-5 h-5 text-purple-400" />
              LECTOR DE CÓDIGO DE BARRAS / QR
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
              El cursor queda activo para pistolear paquetes seguidos.
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
            onClick={() => handleConfirmarRecepcionAlmacen()}
            disabled={submitting || verificadasIds.size === 0}
            className="w-full h-14 rounded-2xl bg-purple-700 hover:bg-purple-600 active:scale-[0.99] text-white font-black text-sm md:text-base flex items-center justify-center gap-2.5 shadow-lg disabled:opacity-40 transition"
          >
            <CheckCircle2 className="w-6 h-6" />
            {submitting
              ? 'INGRESANDO A BODEGA M7...'
              : `CONFIRMAR RECEPCIÓN (${verificadasIds.size} PAQUETES)`}
          </button>
          {selectedRecogidaId !== 'TODAS' && faltantesRemision.length > 0 && (
            <button
              type="button"
              onClick={() => handleReportarNoLlego(faltantesRemision.map((g) => Number(g.id)))}
              disabled={submitting}
              className="w-full h-11 rounded-2xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 text-rose-800 font-black text-xs flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <AlertTriangle className="w-4 h-4" /> REPORTAR NO LLEGARON ({faltantesRemision.length} SIN PISTOLEAR)
            </button>
          )}
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
              Los paquetes recogidos ya se recibieron o se reportaron como no llegados.
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
                  <th className="p-3 text-right">Acciones</th>
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
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {g.estado_operativo === 'RECOGIDA_TIENDA' && (
                          <button
                            type="button"
                            onClick={() => handleReportarNoLlego([idNum])}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 font-black text-[11px] inline-flex items-center gap-1 border border-rose-200"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" /> No llegó
                          </button>
                        )}
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

        </>
      )}

      {tab === 'REMISIONES' && (
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4">
        {remisiones.length === 0 && (
          <div className="p-10 text-center text-sm font-black text-slate-500">Sin remisiones de recogida.</div>
        )}
        {/* Tarjetas rápidas de Remisiones de Recogida activas */}
        {remisiones.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {remisiones.map((r) => {
              const isSelected = selectedRecogidaId === String(r.id);
              const pendientes = Number(r.guias_pendientes_almacen || 0);
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRecogidaId(String(r.id));
                    setSelectedPlaca('TODAS');
                    setTab('RECIBIR');
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
      )}

      {tab === 'NO_LLEGARON' && (
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-3">
          <p className="text-xs text-slate-600">
            Guías recogidas en tienda que no llegaron al almacén. Éxito ya recibió el 10 NOVEDAD. Si aparecen, recíbalas aquí o pistoléelas; si se confirma la pérdida, Inhouse la pasa a Devolución.
          </p>
          {guiasNoLlegaron.length === 0 ? (
            <div className="p-10 text-center space-y-2 border-2 border-dashed border-slate-200 rounded-2xl">
              <PackageCheck className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-black text-slate-800">No hay guías reportadas como no llegadas</div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-[11px] font-black uppercase text-slate-600">
                  <tr>
                    <th className="p-3">Guía / Pedido</th>
                    <th className="p-3">Placa / Remisión</th>
                    <th className="p-3">Nodo</th>
                    <th className="p-3">Destinatario</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {guiasNoLlegaron.map((g) => (
                    <tr key={g.id} className="bg-rose-50/40">
                      <td className="p-3">
                        <div className="font-black text-slate-900 text-sm">{g.numero_guia}</div>
                        <div className="text-[11px] text-slate-500 font-bold">Ped: {g.numero_pedido}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-amber-300 font-black text-xs inline-block">
                          {g.placa_mostrar || 'SIN-PLACA'}
                        </span>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">{g.codigo_recogida || ''}</div>
                      </td>
                      <td className="p-3 font-black text-slate-800">
                        Nodo {g.codigo_dependencia}
                        <div className="text-[11px] text-slate-500 font-normal">{g.nodo_nombre}</div>
                      </td>
                      <td className="p-3 font-black text-slate-900">{g.nombre_destinatario}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleConfirmarRecepcionAlmacen([Number(g.id)])}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Llegó: recibir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL PARA CONFIGURACIÓN DE CORREOS DE NOTIFICACIÓN (RECOGIDA Y ALMACÉN) */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabecera del Modal */}
            <div className="bg-slate-900 text-white p-5 md:p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-lg">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black tracking-tight">
                    Correos de Notificación Automática Éxito
                  </h3>
                  <p className="text-xs text-slate-300">
                    Defina los correos a donde llegarán las alertas de recogida en nodo y recepción en almacén.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleGuardarCorreos} className="p-5 md:p-6 space-y-5 overflow-y-auto flex-1">
              {/* Toggle Habilitado */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-xs font-black uppercase text-slate-900">
                    Habilitar Envío de Notificaciones por Correo
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Activa o pausa el envío automático de correos en las etapas de recogida y almacén.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailFormHabilitado}
                    onChange={(e) => setEmailFormHabilitado(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Correos Recogida en Tienda */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-800 flex items-center justify-between">
                  <span>1. Correos para Recogida en Tienda / Nodo Éxito</span>
                  <span className="text-[10px] text-slate-500 font-bold lowercase">Separados por coma</span>
                </label>
                <textarea
                  rows={2}
                  value={emailFormRecogida}
                  onChange={(e) => setEmailFormRecogida(e.target.value)}
                  placeholder="ejemplo@millasiete.com, logistica@exito.com, supervisor@millasiete.com"
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  Reciben la remisión de recogida (REC-EX) y el detalle de paquetes cuando el conductor realiza el checkout en el nodo.
                </p>
              </div>

              {/* Correos Recepción en Bodega Milla 7 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-800 flex items-center justify-between">
                  <span>2. Correos para Recepción en Bodega Milla 7</span>
                  <span className="text-[10px] text-slate-500 font-bold lowercase">Separados por coma</span>
                </label>
                <textarea
                  rows={2}
                  value={emailFormRecepcion}
                  onChange={(e) => setEmailFormRecepcion(e.target.value)}
                  placeholder="bodega@millasiete.com, operaciones@millasiete.com, jefealmacen@millasiete.com"
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  Reciben el acta de ingreso a bodega cuando los paquetes son verificados y pistoleados para enrutamiento.
                </p>
              </div>

              {/* Sección de Prueba de Envío */}
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-2.5">
                <div className="text-xs font-black uppercase text-purple-950 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-purple-600" />
                  Probar Envío de Correo Inmediato
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={testEmailInput}
                    onChange={(e) => setTestEmailInput(e.target.value)}
                    placeholder="Ingrese su correo para recibir una prueba..."
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-purple-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={sendingTestEmail}
                      onClick={() => handleProbarEnvio('RECOGIDA_TIENDA')}
                      className="px-3 py-2 rounded-xl bg-white border border-purple-300 hover:bg-purple-100 text-purple-900 text-xs font-black disabled:opacity-50"
                    >
                      Probar Recogida
                    </button>
                    <button
                      type="button"
                      disabled={sendingTestEmail}
                      onClick={() => handleProbarEnvio('RECEPCION_ALMACEN')}
                      className="px-3 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-black disabled:opacity-50"
                    >
                      Probar Recepción
                    </button>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEmails}
                  className="px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-black text-xs shadow-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {savingEmails ? 'GUARDANDO...' : 'GUARDAR CONFIGURACIÓN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default ExitoMensajeriaRecepcion;

