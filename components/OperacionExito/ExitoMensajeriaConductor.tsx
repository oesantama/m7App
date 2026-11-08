import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { User } from '../../types';
import { API_URL, getStoredToken } from '../../services/api/client';
import {
  Truck,
  PackageCheck,
  Camera,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Eraser,
  RefreshCw,
  Building2,
  FileText,
  Printer,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

interface Props {
  user: User;
}

const authHeaders = () => {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

/**
 * Comprime agresivamente en el celular cualquier foto tomada por el conductor
 * a máx 960px JPEG (calidad 0.65) con interpolación de alta calidad.
 * Reduce el peso de ~5MB a solo ~45-60 KB para que suba al instante incluso con 1 barra de señal móvil.
 */
async function compressImageFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No se pudo procesar la imagen'));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        // Calidad 0.65 JPEG: ultra liviana para baja capacidad de red móvil
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.src = String(ev.target?.result || '');
    };
    reader.onerror = () => reject(new Error('No se pudo leer la foto'));
    reader.readAsDataURL(file);
  });
}

const ExitoMensajeriaConductor: React.FC<Props> = ({ user }) => {
  const [modoPrincipal, setModoPrincipal] = useState<'inicio' | 'recogida' | 'entrega' | 'novedad'>('inicio');
  const [rolOperativoActivo, setRolOperativoActivo] = useState<'TIENDA' | 'REPARTO'>('TIENDA');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMsg, setSubmittingMsg] = useState<string>('');

  // Paso 0: Digitación de Placa + Validación de Cédula del Conductor (Siempre pide la placa al entrar para evitar confusión si cambió de vehículo)
  const [placaInput, setPlacaInput] = useState<string>('');
  const [cedulaInput, setCedulaInput] = useState<string>(() => user.documentNumber || '');
  const [placaValidada, setPlacaValidada] = useState<string>('');
  const [vehiculoIdValidado, setVehiculoIdValidado] = useState<string>('');
  const [conductorIdValidado, setConductorIdValidado] = useState<string>('');
  const [conductorNombreValidado, setConductorNombreValidado] = useState<string>('');
  const [conductorCedulaValidada, setConductorCedulaValidada] = useState<string>('');
  const [placasProgramadasRecogida, setPlacasProgramadasRecogida] = useState<any[]>([]);
  const [placasEnReparto, setPlacasEnReparto] = useState<any[]>([]);
  const [programacionRecogidas, setProgramacionRecogidas] = useState<any[]>([]);
  const [programacionesPlaca, setProgramacionesPlaca] = useState<any[]>([]);
  const [nodosAsignados, setNodosAsignados] = useState<any[]>([]);
  const [rutasActivas, setRutasActivas] = useState<any[]>([]);
  const [ultimaRemisionRecogida, setUltimaRemisionRecogida] = useState<string>('');

  // Determinar si el usuario en sesión es un conductor real (o perfil operativo de conductor)
  const isConductor = useMemo(() => {
    const roleName = String(user.role || '').toUpperCase();
    const roleId = String(user.roleId || (user as any).role_id || '').toUpperCase();
    const userName = String(user.name || '').toUpperCase();

    // Si es Administrador, Super Admin, Director TI o Inhouse, NO es conductor (entra en modo consulta)
    if (
      roleId === 'ROL-01' ||
      roleId === 'ROL-02' ||
      roleName.includes('ADMIN') ||
      roleName.includes('SUPER') ||
      roleName.includes('INHOUSE') ||
      roleName.includes('PLANIFICADOR') ||
      userName.includes('ADMIN')
    ) {
      return false;
    }

    const isDriverRole =
      roleName.includes('CONDUCTOR') ||
      roleName.includes('DRIVER') ||
      roleName.includes('MENSAJERO') ||
      roleId === 'ROL-03' ||
      roleId === 'ROL-04';

    if (isDriverRole) return true;

    // Verificar si su cédula está entre los conductores con programación activa
    const userCedula = String(user.documentNumber || '').trim();
    if (userCedula) {
      const matchRec = (placasProgramadasRecogida || []).some(
        (p: any) => String(p.conductor_cedula || '').trim() === userCedula
      );
      const matchRep = (placasEnReparto || []).some(
        (p: any) => String(p.conductor_cedula || '').trim() === userCedula
      );
      if (matchRec || matchRep) return true;
    }

    return false;
  }, [user.role, user.roleId, user.name, user.documentNumber, placasProgramadasRecogida, placasEnReparto]);

  // Si es conductor, filtrar únicamente las placas y programaciones asignadas a su cédula
  const userCedula = String(user.documentNumber || '').trim();
  const misPlacasRecogida = useMemo(() => {
    if (!isConductor) return [];
    if (!userCedula) return placasProgramadasRecogida;
    const filtradas = placasProgramadasRecogida.filter(
      (p: any) => String(p.conductor_cedula || '').trim() === userCedula
    );
    return filtradas.length > 0 ? filtradas : placasProgramadasRecogida;
  }, [isConductor, userCedula, placasProgramadasRecogida]);

  const misPlacasReparto = useMemo(() => {
    if (!isConductor) return [];
    if (!userCedula) return placasEnReparto;
    const filtradas = placasEnReparto.filter(
      (p: any) => String(p.conductor_cedula || '').trim() === userCedula
    );
    return filtradas.length > 0 ? filtradas : placasEnReparto;
  }, [isConductor, userCedula, placasEnReparto]);

  const miHistoricoRecogidas = useMemo(() => {
    if (!isConductor) return [];
    if (!userCedula) return programacionRecogidas;
    const filtradas = programacionRecogidas.filter(
      (prg: any) => String(prg.conductor_cedula || '').trim() === userCedula
    );
    return filtradas.length > 0 ? filtradas : programacionRecogidas;
  }, [isConductor, userCedula, programacionRecogidas]);

  // Datos cargados para la placa validada
  const [recogidasPendientes, setRecogidasPendientes] = useState<any[]>([]);
  const [entregasEnRuta, setEntregasEnRuta] = useState<any[]>([]);
  const [catalogoNovedades, setCatalogoNovedades] = useState<any[]>([]);

  // Flujo Recogida en Tienda (3 pasos simples)
  const [pasoRecogida, setPasoRecogida] = useState<1 | 2 | 3>(1);
  const [guiasMarcadasRecogida, setGuiasMarcadasRecogida] = useState<number[]>([]);
  const [fotoRecogidaB64, setFotoRecogidaB64] = useState<string>('');
  const [nombreEncargadoTienda, setNombreEncargadoTienda] = useState<string>('');

  // Flujo Entrega a Cliente (3 pasos simples)
  const [guiaActiva, setGuiaActiva] = useState<any | null>(null);
  const [pasoEntrega, setPasoEntrega] = useState<1 | 2 | 3>(1);
  const [fotoEntregaB64, setFotoEntregaB64] = useState<string>('');
  const [fotoRotuloB64, setFotoRotuloB64] = useState<string>('');
  const [nombreReceptor, setNombreReceptor] = useState<string>('');
  const [cedulaReceptor, setCedulaReceptor] = useState<string>('');

  // Flujo Novedad (2 pasos simples)
  const [causalSeleccionada, setCausalSeleccionada] = useState<any | null>(null);
  const [fotoNovedadB64, setFotoNovedadB64] = useState<string>('');
  const [notaNovedad, setNotaNovedad] = useState<string>('');

  // Lienzo de firma táctil grande
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  // Abrir / Imprimir Planilla o Remisión PDF On-Demand en RAM
  const handleOpenOrPrintPlanillaPdf = async (codigoDocumento: string, autoPrint: boolean = false) => {
    try {
      toast.info(`Generando Planilla y Remisión ${codigoDocumento}...`);
      const res = await fetch(
        `${API_URL}/exito-mensajeria/planillas/${encodeURIComponent(codigoDocumento)}/pdf?json=true`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok || !data.pdfBase64) {
        throw new Error(data.error || 'No se pudo generar el PDF de la planilla');
      }
      const byteCharacters = atob(data.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      const win = window.open(blobUrl, '_blank');
      if (!win) {
        toast.warning('Permita ventanas emergentes para ver o imprimir la planilla.');
        return;
      }
      if (autoPrint) {
        win.addEventListener('load', () => {
          try {
            win.focus();
            win.print();
          } catch {
            // El usuario puede imprimir desde el visor
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const cargarResumenPlacasDisponibles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/conductor/tareas?includeSandbox=true`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setPlacasProgramadasRecogida(data.placasProgramadasRecogida || []);
        setPlacasEnReparto(data.placasEnReparto || []);
        setProgramacionRecogidas(data.programacionRecogidas || []);
        setCatalogoNovedades(data.catalogoNovedades || []);
      }
    } catch {
      // Silencioso en carga inicial de sugerencias
    }
  }, []);

  const validarPlacaYCargarTareas = useCallback(
    async (placaToValidate?: string, cedulaToValidate?: string) => {
      const p = (placaToValidate ?? placaInput).trim().toUpperCase();
      const c = (cedulaToValidate ?? cedulaInput).trim();
      if (!p) {
        return toast.warning('Por favor digite la PLACA del vehículo para continuar.');
      }
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          placa: p,
          cedula: c,
          includeSandbox: 'true',
        });
        const res = await fetch(`${API_URL}/exito-mensajeria/conductor/tareas?${qs.toString()}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'No se pudo validar la placa asignada.');
        }

        if (data.requiresPlate) {
          setPlacaValidada('');
          return;
        }

        const pVal = data.placaValidada || p;
        setPlacaInput(pVal);
        setPlacaValidada(pVal);
        setVehiculoIdValidado(data.vehiculoId || pVal);
        setConductorIdValidado(data.conductorId || '');
        setConductorNombreValidado(data.conductorNombre || user.name);
        setConductorCedulaValidada(data.conductorCedula || c);
        setNodosAsignados(data.nodosAsignados || []);
        setProgramacionesPlaca(data.programacionesPlaca || []);
        setProgramacionRecogidas(data.programacionRecogidas || []);
        setRutasActivas(data.rutasActivas || []);
        setRecogidasPendientes(data.recogidasPendientes || []);
        setEntregasEnRuta(data.entregasEnRuta || []);
        setCatalogoNovedades(data.catalogoNovedades || []);
        setGuiasMarcadasRecogida((data.recogidasPendientes || []).map((g: any) => Number(g.id)));

        // Auto-seleccionar rol según lo que tenga asignado esta placa o lanzar alerta si no tiene nada programado
        const tieneRutas = (data.rutasActivas || []).length > 0 || (data.entregasEnRuta || []).length > 0;
        const tieneNodos = (data.nodosAsignados || []).length > 0 || (data.recogidasPendientes || []).length > 0;
        if (!tieneNodos && !tieneRutas) {
          toast.warning(
            `⚠️ La placa ${pVal} NO tiene recogidas en tienda ni rutas de reparto programadas en este momento.`
          );
        } else if (tieneRutas && !tieneNodos) {
          setRolOperativoActivo('REPARTO');
        } else {
          setRolOperativoActivo('TIENDA');
        }
      } catch (err: any) {
        toast.error(err.message);
        setPlacaValidada('');
      } finally {
        setLoading(false);
      }
    },
    [placaInput, cedulaInput, user.name]
  );

  useEffect(() => {
    // Siempre pide digitar/seleccionar la placa al entrar para evitar confusiones si el conductor cambió de vehículo
    sessionStorage.removeItem('m7_exito_placa_activa');
    cargarResumenPlacasDisponibles();
  }, [cargarResumenPlacasDisponibles]);

  // Helpers para firma con el dedo en pantalla
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const startSign = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const moveSign = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endSign = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  useEffect(() => {
    if ((modoPrincipal === 'recogida' && pasoRecogida === 3) || (modoPrincipal === 'entrega' && pasoEntrega === 3)) {
      setTimeout(() => clearSignature(), 80);
    }
  }, [modoPrincipal, pasoRecogida, pasoEntrega]);

  const exportSignatureBase64 = (): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    // Exportar con fondo blanco y compresión JPEG ligera (~10 KB en vez de ~250 KB PNG)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return canvas.toDataURL('image/jpeg', 0.7);
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    return tempCanvas.toDataURL('image/jpeg', 0.7);
  };

  // Finalizar Checkout de Recogida en Tienda Éxito
  const handleFinalizarRecogidaTienda = async () => {
    if (!hasSigned) {
      return toast.warning('Por favor pida la firma en el recuadro blanco antes de guardar.');
    }
    setSubmitting(true);
    setSubmittingMsg('Registrando recogida...');
    const slowTimer = setTimeout(() => {
      setSubmittingMsg('Conexión lenta detectada, guardando datos...');
    }, 2800);

    try {
      const firmaB64 = exportSignatureBase64();
      const todasIds = recogidasPendientes.map((g) => Number(g.id));
      const faltantesIds = todasIds.filter((id) => !guiasMarcadasRecogida.includes(id));

      const res = await fetch(`${API_URL}/exito-mensajeria/conductor/recogida-tienda`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          nodoId: recogidasPendientes[0]?.nodo_id,
          guiaIdsRecogidas: guiasMarcadasRecogida,
          guiaIdsFaltantes: faltantesIds,
          fotoRecogidaBase64: fotoRecogidaB64,
          firmaTiendaBase64: firmaB64,
          nombreFuncionarioTienda: nombreEncargadoTienda || 'Encargado Despachos Éxito',
          vehiculoId: vehiculoIdValidado,
          placaVehiculo: placaValidada,
          conductorId: conductorIdValidado,
          conductorNombre: conductorNombreValidado || user.name,
          conductorCedula: conductorCedulaValidada || cedulaInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar recogida');

      toast.success(data.message || 'Recogida guardada exitosamente.');
      if (data.codigoRecogida) {
        setUltimaRemisionRecogida(data.codigoRecogida);
      }
      setFotoRecogidaB64('');
      setNombreEncargadoTienda('');
      setPasoRecogida(1);
      setModoPrincipal('inicio');
      validarPlacaYCargarTareas(placaValidada, cedulaInput);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setSubmittingMsg('');
    }
  };

  // Finalizar Entrega Exitosa al Cliente
  const handleFinalizarEntregaCliente = async () => {
    if (!guiaActiva) return;
    if (!hasSigned) {
      return toast.warning('Por favor pida la firma del cliente en el recuadro blanco.');
    }
    setSubmitting(true);
    setSubmittingMsg('Guardando entrega...');
    const slowTimer = setTimeout(() => {
      setSubmittingMsg('Conexión lenta detectada, finalizando registro...');
    }, 2800);

    try {
      const firmaB64 = exportSignatureBase64();
      const res = await fetch(`${API_URL}/exito-mensajeria/conductor/guias/${guiaActiva.id}/entregar`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          fotoEntregaBase64: fotoEntregaB64,
          fotoRotuloBase64: fotoRotuloB64 || undefined,
          firmaClienteBase64: firmaB64,
          receptorNombre: nombreReceptor || guiaActiva.nombre_destinatario,
          receptorDocumento: cedulaReceptor || guiaActiva.nit_destinatario,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la entrega');

      toast.success(data.message || 'Entrega registrada exitosamente.');
      setGuiaActiva(null);
      setFotoEntregaB64('');
      setFotoRotuloB64('');
      setPasoEntrega(1);
      setModoPrincipal('inicio');
      validarPlacaYCargarTareas(placaValidada, cedulaInput);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setSubmittingMsg('');
    }
  };

  // Reportar Problema / Novedad
  const handleConfirmarNovedad = async () => {
    if (!guiaActiva || !causalSeleccionada) return;
    if (causalSeleccionada.requiere_foto && !fotoNovedadB64) {
      return toast.warning('Por favor tome 1 foto de la puerta o paquete para comprobar el problema.');
    }
    setSubmitting(true);
    setSubmittingMsg('Registrando novedad...');
    const slowTimer = setTimeout(() => {
      setSubmittingMsg('Conexión lenta detectada, enviando reporte...');
    }, 2800);

    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/conductor/guias/${guiaActiva.id}/novedad`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          codigoNovedad: causalSeleccionada.codigo_novedad,
          fotoNovedadBase64: fotoNovedadB64,
          descripcion: notaNovedad,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la novedad');

      toast.success(data.message || 'Novedad registrada exitosamente.');
      setGuiaActiva(null);
      setCausalSeleccionada(null);
      setFotoNovedadB64('');
      setNotaNovedad('');
      setModoPrincipal('inicio');
      validarPlacaYCargarTareas(placaValidada, cedulaInput);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setSubmittingMsg('');
    }
  };

  // ===========================================================================
  // PASO 0: REGISTRO Y VALIDACIÓN DE PLACA + CÉDULA DEL CONDUCTOR
  // ===========================================================================
  if (!placaValidada) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-6 pb-20">
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black uppercase">
              {isConductor ? 'PASO INICIAL · CONTROL DE FLOTA M7' : 'MODO CONSULTA DE VEHÍCULOS · CONTROL DE FLOTA'}
            </span>
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Hola, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-300 text-sm font-medium leading-relaxed">
            {isConductor ? (
              <>Digite la <strong>PLACA del vehículo</strong> asignado para validar su cédula y consultar los nodos donde va a recoger o su ruta de reparto activa:</>
            ) : (
              <>Digite la <strong>PLACA del vehículo</strong> a consultar para ver en tiempo real los nodos programados para recogida o las rutas de reparto activas:</>
            )}
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-slate-200 space-y-5">
          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-2">
              1. PLACA DEL VEHÍCULO (EJ: AAA542)
            </label>
            <input
              type="text"
              value={placaInput}
              onChange={(e) => setPlacaInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') validarPlacaYCargarTareas();
              }}
              placeholder="DIGITE PLACA AQUÍ"
              className="w-full h-16 px-5 rounded-2xl border-4 border-slate-900 bg-amber-50 text-slate-950 text-3xl font-black uppercase tracking-widest text-center focus:outline-none focus:border-blue-600"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-2">
              2. CÉDULA DEL CONDUCTOR {isConductor ? 'EN SESIÓN' : '(OPCIONAL EN CONSULTA)'}
            </label>
            <input
              type="text"
              value={cedulaInput}
              onChange={(e) => setCedulaInput(e.target.value)}
              placeholder="Número de Cédula del Conductor"
              className="w-full h-14 px-4 rounded-2xl border-2 border-slate-300 bg-slate-50 text-slate-900 text-xl font-black text-center"
            />
            <p className="text-xs text-slate-500 mt-1 text-center font-semibold">
              {isConductor
                ? `Se valida tu usuario (${user.name}) más la placa asignada por Inhouse.`
                : `Usuario (${user.name}) en modo consulta. Pulse el botón para ver la información de la placa.`}
            </p>
          </div>

          <button
            onClick={() => validarPlacaYCargarTareas()}
            disabled={loading}
            className="w-full min-h-[68px] rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-black text-xl shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <Truck className="w-7 h-7" />
            {loading ? 'CONSULTANDO PLACA...' : isConductor ? 'INGRESAR CON ESTA PLACA' : 'INGRESAR CON ESTA PLACA'}
          </button>

          {/* Acceso rápido de 1 toque ÚNICAMENTE si el usuario que inició sesión es un conductor con asignaciones */}
          {isConductor && (misPlacasRecogida.length > 0 || misPlacasReparto.length > 0) && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="text-xs font-black uppercase text-slate-600">
                🚚 Tus Vehículos Programados hoy para ir a Recoger o en Reparto (Toque su placa):
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {misPlacasRecogida.map((p, idx) => (
                  <button
                    key={`rec-${idx}`}
                    type="button"
                    onClick={() => {
                      setPlacaInput(p.placa);
                      if (p.conductor_cedula) setCedulaInput(p.conductor_cedula);
                      validarPlacaYCargarTareas(p.placa, p.conductor_cedula || cedulaInput);
                    }}
                    className="p-3.5 rounded-2xl bg-blue-50 hover:bg-blue-100 border-2 border-blue-400 text-blue-950 text-left transition space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-black">🚚 PLACA: {p.placa}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase">
                        PROGRAMADO PARA RECOGER
                      </span>
                    </div>
                    <div className="text-xs font-bold text-blue-900">
                      Conductor: {p.conductor_nombre || 'Conductor asignado'}{' '}
                      {p.conductor_cedula ? `(CC ${p.conductor_cedula})` : ''}
                    </div>
                    {p.nodos_resumen && (
                      <div className="text-[11px] font-semibold text-blue-800">
                        📍 Nodos a recoger: {p.nodos_resumen}
                      </div>
                    )}
                  </button>
                ))}
                {misPlacasReparto.map((p, idx) => (
                  <button
                    key={`rut-${idx}`}
                    type="button"
                    onClick={() => {
                      setPlacaInput(p.placa);
                      if (p.conductor_cedula) setCedulaInput(p.conductor_cedula);
                      validarPlacaYCargarTareas(p.placa, p.conductor_cedula || cedulaInput);
                    }}
                    className="p-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-400 text-emerald-950 text-left transition space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-black">📦 PLACA: {p.placa}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase">
                        EN REPARTO URBANO
                      </span>
                    </div>
                    <div className="text-xs font-bold text-emerald-900">
                      Conductor: {p.conductor_nombre || 'Conductor en ruta'}{' '}
                      {p.conductor_cedula ? `(CC ${p.conductor_cedula})` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Histórico de asignaciones ÚNICAMENTE si el usuario que inició sesión es un conductor */}
          {isConductor && miHistoricoRecogidas.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="text-[11px] font-black uppercase text-slate-500">
                Histórico de Programación de Vehículos a Recogida ({miHistoricoRecogidas.length}):
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {miHistoricoRecogidas.slice(0, 8).map((prg: any) => (
                  <div
                    key={prg.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between font-black text-slate-900">
                      <span>
                        Placa {prg.placa} · {prg.conductor_nombre}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          prg.estado === 'PROGRAMADO'
                            ? 'bg-blue-100 text-blue-800'
                            : prg.estado === 'RECOGIDA_COMPLETADA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {prg.estado === 'PROGRAMADO'
                          ? 'PROGRAMADO PARA RECOGER'
                          : prg.estado === 'RECOGIDA_COMPLETADA'
                          ? 'RECOGIDA COMPLETADA'
                          : prg.estado}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">{prg.nodos_resumen}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // PANTALLA DE INICIO (UNA VEZ VALIDADA LA PLACA Y CÉDULA)
  // ===========================================================================
  if (modoPrincipal === 'inicio') {
    const tieneProgramacionTienda = nodosAsignados.length > 0 || recogidasPendientes.length > 0;
    const tieneRutaAsignada = rutasActivas.length > 0 || entregasEnRuta.length > 0;
    const sinNadaProgramado = !tieneProgramacionTienda && !tieneRutaAsignada;

    return (
      <div className="max-w-xl mx-auto p-4 space-y-6 pb-20">
        {/* Encabezado de alto contraste con Placa Validada y Nodos Asignados */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-slate-950 text-base font-black uppercase tracking-wider">
              PLACA: {placaValidada}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => validarPlacaYCargarTareas(placaValidada, cedulaInput)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-slate-800 text-white text-xs font-black border border-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> ACTUALIZAR
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem('m7_exito_placa_activa');
                  setPlacaInput('');
                  setPlacaValidada('');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-black"
              >
                <LogOut className="w-4 h-4" /> CAMBIAR PLACA
              </button>
            </div>
          </div>

          <div>
            <h1 className="text-xl font-black tracking-tight">
              Conductor: {conductorNombreValidado || user.name}
            </h1>
            {conductorCedulaValidada && (
              <div className="text-xs font-bold text-emerald-400">
                ✓ Cédula validada: {conductorCedulaValidada}
              </div>
            )}
          </div>

          {nodosAsignados.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-black uppercase text-amber-300">
                  🟢 VEHÍCULO PROGRAMADO PARA RECOGER EN ESTOS NODOS:
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                  {nodosAsignados.length} Nodo(s) Activos
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nodosAsignados.map((n: any) => (
                  <span
                    key={n.id}
                    className="px-2.5 py-1 rounded-lg bg-blue-600/30 border border-blue-400/40 text-xs font-black text-blue-100"
                  >
                    Nodo {n.codigo_dependencia} · {n.nombre}
                  </span>
                ))}
              </div>
              {programacionesPlaca.length > 0 && (
                <div className="pt-2 border-t border-slate-700/80 space-y-1">
                  <div className="text-[10px] font-black uppercase text-slate-400">
                    Histórico de programación de esta placa ({programacionesPlaca.length}):
                  </div>
                  {programacionesPlaca.slice(0, 3).map((prg: any) => (
                    <div
                      key={prg.id}
                      className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/60 px-2.5 py-1 rounded-lg"
                    >
                      <span>
                        {prg.codigo_programacion} · {prg.estado === 'PROGRAMADO' ? '🟢 Programado para recoger' : '✅ Recogida completada'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {prg.created_at
                          ? new Date(prg.created_at).toLocaleString('es-CO', {
                              timeZone: 'America/Bogota',
                            })
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ALERTA CLARA SI LA PLACA NO TIENE NI RECOGIDA EN TIENDA NI RUTA DE REPARTO PROGRAMADA */}
        {sinNadaProgramado && (
          <div className="bg-amber-50 border-4 border-amber-400 rounded-3xl p-6 text-center space-y-4 shadow-lg">
            <AlertTriangle className="w-14 h-14 text-amber-600 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-950 uppercase">
                No tienes nada programado en la placa {placaValidada}
              </h2>
              <p className="text-sm font-bold text-slate-700 leading-relaxed">
                En este momento el vehículo con placa <strong>{placaValidada}</strong> no tiene programada ninguna <strong>Recogida en Tienda Éxito</strong> ni ninguna <strong>Ruta de Reparto desde Bodega M7</strong>.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => validarPlacaYCargarTareas(placaValidada, cedulaInput)}
                className="min-h-[56px] rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm flex items-center justify-center gap-2 shadow"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /> VOLVER A CONSULTAR
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlacaInput('');
                  setPlacaValidada('');
                }}
                className="min-h-[56px] rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow"
              >
                <Truck className="w-5 h-5" /> DIGITAR OTRA PLACA
              </button>
            </div>
          </div>
        )}

        {/* SELECTOR DE PESTAÑA SOLO CUANDO LA PLACA TIENE AMBAS ASIGNACIONES (TIENDA Y REPARTO AL MISMO TIEMPO) */}
        {tieneProgramacionTienda && tieneRutaAsignada && (
          <div className="bg-white rounded-3xl p-2 shadow-lg border-2 border-slate-200 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRolOperativoActivo('TIENDA')}
              className={`p-3.5 rounded-2xl text-left transition flex flex-col justify-between gap-1 ${
                rolOperativoActivo === 'TIENDA'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider opacity-90">
                  🏢 1RA MILLA (TIENDA ÉXITO)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    rolOperativoActivo === 'TIENDA'
                      ? 'bg-white text-blue-700'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {recogidasPendientes.length} disp.
                </span>
              </div>
              <div className="text-sm md:text-base font-black leading-tight">
                1. Recoger en Tienda
              </div>
              <div
                className={`text-[11px] font-bold ${
                  rolOperativoActivo === 'TIENDA' ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                Tienda Éxito &rarr; Llevar a Bodega M7
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRolOperativoActivo('REPARTO')}
              className={`p-3.5 rounded-2xl text-left transition flex flex-col justify-between gap-1 ${
                rolOperativoActivo === 'REPARTO'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider opacity-90">
                  🏠 ÚLTIMA MILLA (ALMACÉN M7)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    rolOperativoActivo === 'REPARTO'
                      ? 'bg-white text-emerald-700'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {entregasEnRuta.length} clientes
                </span>
              </div>
              <div className="text-sm md:text-base font-black leading-tight">
                2. Reparto a Cliente Final
              </div>
              <div
                className={`text-[11px] font-bold ${
                  rolOperativoActivo === 'REPARTO' ? 'text-emerald-100' : 'text-slate-500'
                }`}
              >
                Sale de Bodega M7 &rarr; Cliente Final
              </div>
            </button>
          </div>
        )}

        {/* ===================================================================
            BOTÓN DE RECOGER EN TIENDA: SOLO SE MUESTRA SI ESTÁ PROGRAMADO A TIENDA
           =================================================================== */}
        {tieneProgramacionTienda && (!tieneRutaAsignada || rolOperativoActivo === 'TIENDA') && (
          <div className="space-y-5">
            {ultimaRemisionRecogida && (
              <div className="bg-emerald-50 border-2 border-emerald-400 rounded-3xl p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase text-emerald-800">
                    Remisión de Recogida en Tienda (Entregar en Bodega M7)
                  </div>
                  <div className="text-lg font-black text-emerald-950">{ultimaRemisionRecogida}</div>
                </div>
                <button
                  onClick={() => handleOpenOrPrintPlanillaPdf(ultimaRemisionRecogida, true)}
                  className="px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-2 shadow"
                >
                  <Printer className="w-4 h-4" /> IMPRIMIR REMISIÓN
                </button>
              </div>
            )}

            <button
              onClick={() => {
                if (recogidasPendientes.length === 0) {
                  return toast.info(
                    `La placa ${placaValidada} está programada en ${nodosAsignados.length} nodo(s), pero en este instante hay 0 paquetes disponibles para recoger.`
                  );
                }
                setPasoRecogida(1);
                setModoPrincipal('recogida');
              }}
              className="w-full text-left bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white rounded-3xl p-6 shadow-xl transition flex items-center justify-between gap-4 border-4 border-blue-400"
            >
              <div className="space-y-1">
                <div className="text-xs font-black uppercase tracking-wider text-blue-100">
                  1RA MILLA: RECOGER EN TIENDA ÉXITO Y LLEVAR A ALMACÉN M7 ({placaValidada})
                </div>
                <div className="text-2xl font-black">1. RECOGER EN TIENDA ÉXITO</div>
                <div className="text-base font-bold text-blue-100">
                  {recogidasPendientes.length} paquete(s) disponibles para recoger en tienda
                </div>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <Building2 className="w-10 h-10 text-white" />
              </div>
            </button>
          </div>
        )}

        {/* ===================================================================
            SECCIÓN DE REPARTO A CLIENTE FINAL: SOLO SE MUESTRA SI TIENE RUTA ASIGNADA
           =================================================================== */}
        {tieneRutaAsignada && (!tieneProgramacionTienda || rolOperativoActivo === 'REPARTO') && (
          <div className="space-y-5">
            {rutasActivas.length > 0 && (
              <div className="bg-indigo-950 text-white rounded-3xl p-5 shadow-lg space-y-3 border-2 border-indigo-400">
                <div className="text-xs font-black uppercase tracking-wider text-indigo-300">
                  ÚLTIMA MILLA: PLANILLA DE SALIDA DE ALMACÉN M7 A CLIENTE FINAL ({placaValidada})
                </div>
                {rutasActivas.map((r: any) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 bg-indigo-900/70 p-3.5 rounded-2xl border border-indigo-700"
                  >
                    <div>
                      <div className="text-lg font-black text-amber-300">{r.codigo_ruta}</div>
                      <div className="text-xs font-bold text-indigo-200">
                        {r.nombre_ruta} · {r.total_guias} guía(s) ({r.total_unidades || r.total_guias} und)
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenOrPrintPlanillaPdf(r.codigo_ruta, false)}
                        className="px-3.5 py-2.5 rounded-xl bg-white text-indigo-950 font-black text-xs flex items-center gap-1.5 shadow"
                      >
                        <FileText className="w-4 h-4" /> VER PDF
                      </button>
                      <button
                        onClick={() => handleOpenOrPrintPlanillaPdf(r.codigo_ruta, true)}
                        className="px-3.5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow"
                      >
                        <Printer className="w-4 h-4" /> IMPRIMIR PLANILLA
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xl font-black text-slate-900 uppercase">
                  2. ENTREGAS A CLIENTE FINAL ({entregasEnRuta.length})
                </h2>
              </div>

              {entregasEnRuta.map((g, index) => {
                const telCliente = g.celular_destinatario || g.telefono_destinatario || '';
                const mapQuery = encodeURIComponent(
                  `${g.direccion_destinatario}, ${g.ciudad_destinatario_nombre || 'Medellin'}, Colombia`
                );
                return (
                  <div
                    key={g.id}
                    className="bg-white rounded-3xl p-6 shadow-lg border-2 border-slate-200 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-4 py-1.5 rounded-full bg-slate-900 text-white text-sm font-black">
                        PARADA #{index + 1} · {g.cant_cajas || 1} CAJA(S)
                      </span>
                      <span className="text-sm font-black text-indigo-700">
                        Guía: {g.numero_guia}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-black uppercase text-slate-500">CLIENTE:</div>
                      <div className="text-2xl font-black text-slate-900 leading-tight">
                        {g.nombre_destinatario}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-1">
                      <div className="text-xs font-black uppercase text-slate-500">
                        DIRECCIÓN DE ENTREGA:
                      </div>
                      <div className="text-xl font-black text-slate-950">
                        {g.direccion_destinatario}
                      </div>
                      <div className="text-base font-bold text-slate-700">
                        Barrio: {g.barrio_destinatario || 'Urbano'} · {g.ciudad_destinatario_nombre || 'Misma Ciudad'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {telCliente ? (
                        <a
                          href={`tel:${telCliente}`}
                          className="min-h-[60px] rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow"
                        >
                          <Phone className="w-6 h-6" /> LLAMAR CLIENTE
                        </a>
                      ) : (
                        <div className="min-h-[60px] rounded-2xl bg-slate-100 text-slate-400 font-bold text-sm flex items-center justify-center">
                          Sin Teléfono
                        </div>
                      )}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[60px] rounded-2xl bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-black text-base flex items-center justify-center gap-2"
                      >
                        <MapPin className="w-6 h-6" /> VER MAPA
                      </a>
                    </div>

                    <div className="space-y-3 pt-2">
                      <button
                        onClick={() => {
                          setGuiaActiva(g);
                          setNombreReceptor(g.nombre_destinatario);
                          setCedulaReceptor(g.nit_destinatario || '');
                          setFotoEntregaB64('');
                          setFotoRotuloB64('');
                          setPasoEntrega(1);
                          setModoPrincipal('entrega');
                        }}
                        className="w-full min-h-[72px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black text-xl flex items-center justify-center gap-3 shadow-lg"
                      >
                        <CheckCircle2 className="w-8 h-8" /> ENTREGAR PAQUETE
                      </button>

                      <button
                        onClick={() => {
                          setGuiaActiva(g);
                          setCausalSeleccionada(null);
                          setFotoNovedadB64('');
                          setNotaNovedad('');
                          setModoPrincipal('novedad');
                        }}
                        className="w-full min-h-[60px] rounded-2xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-black text-base flex items-center justify-center gap-2 border-2 border-rose-300"
                      >
                        <AlertTriangle className="w-6 h-6 text-rose-700" /> NO PUDE ENTREGAR / PROBLEMA
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODO 1: ASISTENTE EN 3 PASOS PARA RECOGER EN TIENDA ÉXITO
  // ===========================================================================
  if (modoPrincipal === 'recogida') {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-6 pb-20">
        <button
          onClick={() => setModoPrincipal('inicio')}
          className="min-h-[56px] px-5 rounded-2xl bg-slate-200 text-slate-900 font-black text-base flex items-center gap-2"
        >
          <ArrowLeft className="w-6 h-6" /> VOLVER ATRÁS
        </button>

        <div className="bg-blue-700 text-white rounded-3xl p-5 space-y-1">
          <div className="text-sm font-black uppercase text-blue-200">
            PASO {pasoRecogida} DE 3 · RECOGIDA EN TIENDA ÉXITO
          </div>
          <h2 className="text-2xl font-black">
            {pasoRecogida === 1 && '1. Revise los paquetes a recoger'}
            {pasoRecogida === 2 && '2. Tome 1 foto de los paquetes'}
            {pasoRecogida === 3 && '3. Firma de la Tienda Éxito'}
          </h2>
        </div>

        {/* PASO 1: LISTA DE PAQUETES CON CHECKBOX GIGANTE */}
        {pasoRecogida === 1 && (
          <div className="space-y-4">
            <p className="text-base font-bold text-slate-700">
              Toque cada paquete que le entregaron en la tienda (si falta alguno, desmárquelo):
            </p>
            {recogidasPendientes.map((g) => {
              const marcado = guiasMarcadasRecogida.includes(Number(g.id));
              return (
                <div
                  key={g.id}
                  onClick={() =>
                    setGuiasMarcadasRecogida((prev) =>
                      marcado ? prev.filter((id) => id !== Number(g.id)) : [...prev, Number(g.id)]
                    )
                  }
                  className={`p-5 rounded-3xl border-4 cursor-pointer transition flex items-center justify-between gap-3 ${
                    marcado
                      ? 'bg-emerald-50 border-emerald-500'
                      : 'bg-white border-slate-300 opacity-75'
                  }`}
                >
                  <div>
                    <div className="text-lg font-black text-slate-900">
                      Guía: {g.numero_guia} ({g.cant_cajas || 1} Caja)
                    </div>
                    <div className="text-base font-bold text-slate-700">
                      Cliente: {g.nombre_destinatario}
                    </div>
                    <div className="text-sm text-slate-500">
                      Nodo {g.codigo_dependencia} - {g.nodo_nombre}
                    </div>
                  </div>
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                      marcado ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {marcado ? '✓' : ''}
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => {
                if (guiasMarcadasRecogida.length === 0) {
                  return toast.warning('Marque al menos un paquete para continuar.');
                }
                setPasoRecogida(2);
              }}
              className="w-full min-h-[72px] rounded-3xl bg-emerald-600 text-white font-black text-xl shadow-lg"
            >
              SIGUIENTE PASO: TOMAR FOTO &rarr;
            </button>
          </div>
        )}

        {/* PASO 2: TOMAR FOTO DE LOS PAQUETES */}
        {pasoRecogida === 2 && (
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 space-y-5 text-center">
            <label className="w-full min-h-[120px] rounded-3xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xl flex flex-col items-center justify-center gap-2 cursor-pointer shadow-lg p-6">
              <Camera className="w-12 h-12" />
              <span>{fotoRecogidaB64 ? '📸 CAMBIAR FOTO' : '📸 TOCAR AQUÍ PARA TOMAR FOTO'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const b64 = await compressImageFileToBase64(file);
                    setFotoRecogidaB64(b64);
                    toast.success('¡Foto lista!');
                  } catch {
                    toast.error('No se pudo tomar la foto.');
                  }
                }}
              />
            </label>

            {fotoRecogidaB64 && (
              <div className="space-y-2">
                <img
                  src={fotoRecogidaB64}
                  alt="Foto Recogida"
                  className="w-full max-h-64 object-cover rounded-2xl border-2 border-emerald-500 mx-auto"
                />
                <div className="text-base font-black text-emerald-700">
                  ✅ Foto guardada correctamente
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (!fotoRecogidaB64) {
                  return toast.warning('Primero toque el botón azul para tomar la foto.');
                }
                setPasoRecogida(3);
              }}
              className="w-full min-h-[72px] rounded-3xl bg-emerald-600 text-white font-black text-xl shadow-lg"
            >
              SIGUIENTE PASO: FIRMA DE LA TIENDA &rarr;
            </button>
          </div>
        )}

        {/* PASO 3: FIRMA EN PANTALLA DEL ENCARGADO DE LA TIENDA */}
        {pasoRecogida === 3 && (
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 space-y-4">
            <div>
              <label className="text-base font-black text-slate-800">
                Nombre de quien entrega en la tienda Éxito:
              </label>
              <input
                type="text"
                value={nombreEncargadoTienda}
                onChange={(e) => setNombreEncargadoTienda(e.target.value)}
                placeholder="Ej. Juan Pérez (Despachos Éxito)"
                className="w-full mt-1 px-4 py-4 bg-slate-50 border-2 border-slate-300 rounded-2xl text-lg font-bold"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-black text-slate-900">
                  Firme con el dedo en este recuadro:
                </span>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 font-black text-sm flex items-center gap-1"
                >
                  <Eraser className="w-4 h-4" /> BORRAR FIRMA
                </button>
              </div>
              <canvas
                ref={canvasRef}
                width={500}
                height={240}
                onMouseDown={startSign}
                onMouseMove={moveSign}
                onMouseUp={endSign}
                onMouseLeave={endSign}
                onTouchStart={startSign}
                onTouchMove={moveSign}
                onTouchEnd={endSign}
                className="w-full h-56 bg-white border-4 border-slate-800 rounded-2xl touch-none"
              />
            </div>

            <button
              disabled={submitting}
              onClick={handleFinalizarRecogidaTienda}
              className="w-full min-h-[76px] rounded-3xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xl shadow-xl flex items-center justify-center gap-2.5 transition active:scale-[0.98]"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-7 h-7 animate-spin" />
                  <span>{submittingMsg || 'REGISTRANDO RECOGIDA...'}</span>
                </>
              ) : (
                '✅ TERMINAR Y GUARDAR RECOGIDA'
              )}
            </button>
            {submitting && (
              <p className="text-center text-xs text-slate-500 font-bold mt-2">
                {submittingMsg ? `${submittingMsg} Por favor no cierre la pantalla.` : 'Optimizando fotos y guardando comprobante...'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODO 2: ASISTENTE EN 3 PASOS PARA ENTREGAR PAQUETE AL CLIENTE
  // ===========================================================================
  if (modoPrincipal === 'entrega' && guiaActiva) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-6 pb-20">
        <button
          onClick={() => setModoPrincipal('inicio')}
          className="min-h-[56px] px-5 rounded-2xl bg-slate-200 text-slate-900 font-black text-base flex items-center gap-2"
        >
          <ArrowLeft className="w-6 h-6" /> VOLVER A MIS ENTREGAS
        </button>

        <div className="bg-emerald-700 text-white rounded-3xl p-5 space-y-1">
          <div className="text-sm font-black uppercase text-emerald-200">
            PASO {pasoEntrega} DE 3 · ENTREGAR A {guiaActiva.nombre_destinatario}
          </div>
          <h2 className="text-2xl font-black">
            {pasoEntrega === 1 && '1. Tome foto de la entrega'}
            {pasoEntrega === 2 && '2. Foto del rótulo / etiqueta'}
            {pasoEntrega === 3 && '3. Firma del cliente'}
          </h2>
        </div>

        {/* PASO 1: FOTO DEL PAQUETE ENTREGADO */}
        {pasoEntrega === 1 && (
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 space-y-5 text-center">
            <p className="text-lg font-bold text-slate-700">
              Tome una foto clara entregando el paquete en la dirección:
            </p>
            <label className="w-full min-h-[120px] rounded-3xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xl flex flex-col items-center justify-center gap-2 cursor-pointer shadow-lg p-6">
              <Camera className="w-12 h-12" />
              <span>{fotoEntregaB64 ? '📸 CAMBIAR FOTO DE ENTREGA' : '📸 TOMAR FOTO DE ENTREGA'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const b64 = await compressImageFileToBase64(file);
                  setFotoEntregaB64(b64);
                  toast.success('¡Foto de entrega lista!');
                }}
              />
            </label>

            {fotoEntregaB64 && (
              <img
                src={fotoEntregaB64}
                alt="Foto Entrega"
                className="w-full max-h-64 object-cover rounded-2xl border-2 border-emerald-500 mx-auto"
              />
            )}

            <button
              onClick={() => {
                if (!fotoEntregaB64) {
                  return toast.warning('Por favor tome primero la foto de la entrega.');
                }
                setPasoEntrega(2);
              }}
              className="w-full min-h-[72px] rounded-3xl bg-slate-900 text-white font-black text-xl shadow-lg"
            >
              SIGUIENTE PASO &rarr;
            </button>
          </div>
        )}

        {/* PASO 2: FOTO DEL RÓTULO / ETIQUETA */}
        {pasoEntrega === 2 && (
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 space-y-5 text-center">
            <p className="text-lg font-bold text-slate-700">
              Tome una foto de la etiqueta (rótulo) pegada en la caja:
            </p>
            <label className="w-full min-h-[110px] rounded-3xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xl flex flex-col items-center justify-center gap-2 cursor-pointer shadow-lg p-6">
              <FileText className="w-10 h-10" />
              <span>{fotoRotuloB64 ? '📸 CAMBIAR FOTO DE ETIQUETA' : '📸 TOMAR FOTO DE LA ETIQUETA'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const b64 = await compressImageFileToBase64(file);
                  setFotoRotuloB64(b64);
                  toast.success('¡Foto de etiqueta lista!');
                }}
              />
            </label>

            {fotoRotuloB64 && (
              <img
                src={fotoRotuloB64}
                alt="Foto Rótulo"
                className="w-full max-h-60 object-cover rounded-2xl border-2 border-indigo-500 mx-auto"
              />
            )}

            <button
              onClick={() => setPasoEntrega(3)}
              className="w-full min-h-[72px] rounded-3xl bg-emerald-600 text-white font-black text-xl shadow-lg"
            >
              SIGUIENTE PASO: FIRMA DEL CLIENTE &rarr;
            </button>
          </div>
        )}

        {/* PASO 3: FIRMA EN PANTALLA DEL CLIENTE */}
        {pasoEntrega === 3 && (
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 space-y-4">
            <div>
              <label className="text-base font-black text-slate-800">
                Nombre de quien recibe el paquete:
              </label>
              <input
                type="text"
                value={nombreReceptor}
                onChange={(e) => setNombreReceptor(e.target.value)}
                className="w-full mt-1 px-4 py-3.5 bg-slate-50 border-2 border-slate-300 rounded-2xl text-lg font-bold"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-black text-slate-900">
                  Firma del cliente con el dedo:
                </span>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 font-black text-sm flex items-center gap-1"
                >
                  <Eraser className="w-4 h-4" /> BORRAR FIRMA
                </button>
              </div>
              <canvas
                ref={canvasRef}
                width={500}
                height={240}
                onMouseDown={startSign}
                onMouseMove={moveSign}
                onMouseUp={endSign}
                onMouseLeave={endSign}
                onTouchStart={startSign}
                onTouchMove={moveSign}
                onTouchEnd={endSign}
                className="w-full h-56 bg-white border-4 border-slate-800 rounded-2xl touch-none"
              />
            </div>

            <button
              disabled={submitting}
              onClick={handleFinalizarEntregaCliente}
              className="w-full min-h-[76px] rounded-3xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xl shadow-xl flex items-center justify-center gap-2.5 transition active:scale-[0.98]"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-7 h-7 animate-spin" />
                  <span>{submittingMsg || 'GUARDANDO ENTREGA...'}</span>
                </>
              ) : (
                <>
                  <PackageCheck className="w-8 h-8" />
                  <span>CONFIRMAR ENTREGA EXITOSA</span>
                </>
              )}
            </button>
            {submitting && (
              <p className="text-center text-xs text-slate-500 font-bold mt-2">
                {submittingMsg ? `${submittingMsg} Por favor espere un momento.` : 'Optimizando evidencias y confirmando entrega...'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MODO 3: REPORTAR PROBLEMA / NOVEDAD CON BOTONES GRANDES
  // ===========================================================================
  if (modoPrincipal === 'novedad' && guiaActiva) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-5 pb-20">
        <button
          onClick={() => setModoPrincipal('inicio')}
          className="min-h-[56px] px-5 rounded-2xl bg-slate-200 text-slate-900 font-black text-base flex items-center gap-2"
        >
          <ArrowLeft className="w-6 h-6" /> VOLVER ATRÁS
        </button>

        <div className="bg-rose-700 text-white rounded-3xl p-5 space-y-1">
          <div className="text-sm font-black uppercase text-rose-200">
            REPORTAR PROBLEMA · GUÍA {guiaActiva.numero_guia}
          </div>
          <h2 className="text-2xl font-black">¿Qué pasó en la entrega?</h2>
        </div>

        <div className="space-y-3">
          {catalogoNovedades
            .filter((c) => c.etapa === 'ENTREGA' || c.etapa === 'TODAS')
            .map((c) => {
              const sel = causalSeleccionada?.codigo_novedad === c.codigo_novedad;
              return (
                <button
                  key={c.codigo_novedad}
                  type="button"
                  onClick={() => setCausalSeleccionada(c)}
                  className={`w-full min-h-[68px] p-4 rounded-2xl text-left font-black text-lg border-4 transition flex items-center justify-between ${
                    sel
                      ? 'bg-rose-600 text-white border-rose-900 shadow-lg'
                      : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  <span>{c.etiqueta_conductor}</span>
                  {sel && <span className="text-2xl">✓</span>}
                </button>
              );
            })}
        </div>

        {causalSeleccionada && (
          <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 space-y-4">
            <label className="w-full min-h-[100px] rounded-2xl bg-amber-500 text-slate-950 font-black text-lg flex flex-col items-center justify-center gap-2 cursor-pointer p-4 shadow">
              <Camera className="w-10 h-10" />
              <span>
                {fotoNovedadB64 ? '📸 CAMBIAR FOTO DE SOPORTE' : '📸 TOMAR FOTO DE LA CASA / FACHADA'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const b64 = await compressImageFileToBase64(file);
                  setFotoNovedadB64(b64);
                  toast.success('¡Foto de soporte lista!');
                }}
              />
            </label>

            {fotoNovedadB64 && (
              <img
                src={fotoNovedadB64}
                alt="Foto Novedad"
                className="w-full max-h-56 object-cover rounded-2xl border-2 border-amber-500"
              />
            )}

            <button
              disabled={submitting}
              onClick={handleConfirmarNovedad}
              className="w-full min-h-[72px] rounded-3xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xl shadow-xl flex items-center justify-center gap-2.5 transition active:scale-[0.98]"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span>{submittingMsg || 'REGISTRANDO NOVEDAD...'}</span>
                </>
              ) : (
                '⚠️ GUARDAR Y AVISAR A LA OFICINA'
              )}
            </button>
            {submitting && (
              <p className="text-center text-xs text-slate-500 font-bold mt-2">
                {submittingMsg || 'Enviando reporte de novedad...'}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default ExitoMensajeriaConductor;

