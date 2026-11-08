import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { User } from '../../types';
import { API_URL, getStoredToken } from '../../services/api/client';
import { formatColombiaDateTime } from '../../utils/formatting';
import {
  Sparkles,
  Truck,
  MapPin,
  Package,
  Printer,
  FileText,
  Plus,
  Minus,
  Search,
  RefreshCw,
  CheckCircle2,
  ScanBarcode,
  Layers,
  Navigation,
  Trash2,
  ChevronDown,
  X,
  AlertTriangle,
  HelpCircle,
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

interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface SearchableDropdownProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  theme?: 'dark' | 'light';
  disabled?: boolean;
  className?: string;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccione...',
  searchPlaceholder = 'Buscar...',
  theme = 'dark',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)) ||
        (o.badge && o.badge.toLowerCase().includes(q))
    );
  }, [options, search]);

  const isDark = theme === 'dark';

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full h-11 px-3.5 rounded-xl border text-left flex items-center justify-between gap-2 transition focus:outline-none ${
          isDark
            ? 'bg-slate-800 border-slate-600 text-white hover:bg-slate-750 focus:ring-2 focus:ring-emerald-400'
            : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="truncate flex-1">
          {selected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className={`text-xs font-black truncate ${isDark && selected.value ? 'text-amber-300' : ''}`}>
                {selected.label}
              </span>
              {selected.sublabel && (
                <span className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  · {selected.sublabel}
                </span>
              )}
            </div>
          ) : (
            <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${isDark ? 'text-slate-400' : 'text-slate-500'} ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-[100] left-0 right-0 mt-1.5 rounded-2xl shadow-2xl border overflow-hidden ${
            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}
          style={{ minWidth: '100%' }}
        >
          <div className={`p-2 border-b ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'}`}>
            <div className="relative flex items-center">
              <Search className={`w-3.5 h-3.5 absolute left-3 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={`w-full h-8 pl-8 pr-7 text-xs font-bold rounded-lg border focus:outline-none ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-emerald-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                }`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-transparent p-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs font-bold text-slate-400">
                No se encontraron opciones para "{search}"
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between gap-2 text-xs transition ${
                      isSelected
                        ? isDark
                          ? 'bg-emerald-500/20 text-emerald-300 font-black'
                          : 'bg-indigo-50 text-indigo-900 font-black'
                        : isDark
                        ? 'text-slate-200 hover:bg-slate-800'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-bold truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {opt.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${
                          isDark
                            ? 'bg-slate-800 text-amber-300 border border-slate-700'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ExitoMensajeriaDespacho: React.FC<Props> = () => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [includeSandbox, setIncludeSandbox] = useState(true);
  const [maxGuiasPorRuta, setMaxGuiasPorRuta] = useState<number>(35);

  // Datos del motor inteligente de despacho
  const [totalEnAlmacen, setTotalEnAlmacen] = useState<number>(0);
  const [sugerenciasRutas, setSugerenciasRutas] = useState<any[]>([]);
  const [guiasEnAlmacen, setGuiasEnAlmacen] = useState<any[]>([]);
  const [rutasActivas, setRutasActivas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [conductores, setConductores] = useState<any[]>([]);

  // Grupo de guías armado por Inhouse para despachar a una placa
  const [grupoDespachoIds, setGrupoDespachoIds] = useState<Set<number>>(new Set());
  const [nombreRutaCustom, setNombreRutaCustom] = useState<string>('');
  const [vehiculoIdSeleccionado, setVehiculoIdSeleccionado] = useState<string>('');
  const [conductorIdSeleccionado, setConductorIdSeleccionado] = useState<string>('');
  const [rutaExistenteId, setRutaExistenteId] = useState<string>('NUEVA');

  // Filtros ágiles para miles de resultados
  const [vistaTabla, setVistaTabla] = useState<'TODAS_ALMACEN' | 'SOLO_SELECCIONADAS'>('TODAS_ALMACEN');
  const [filtroBarrio, setFiltroBarrio] = useState<string>('TODOS');
  const [filtroBusqueda, setFiltroBusqueda] = useState<string>('');
  const [scanInput, setScanInput] = useState<string>('');

  // Gestión interactiva y seguimiento en vivo de una Ruta / Remisión ya creada (RUT-EX-...)
  const [rutaEnGestionId, setRutaEnGestionId] = useState<number | null>(null);
  const [placaCambioRuta, setPlacaCambioRuta] = useState<string>('');
  const [conductorCambioRuta, setConductorCambioRuta] = useState<string>('');
  const [scanAdicionarARuta, setScanAdicionarARuta] = useState<string>('');
  const [detalleGuiaModal, setDetalleGuiaModal] = useState<any | null>(null);

  const cargarSugerenciasYCatalogos = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        includeSandbox: String(includeSandbox),
        maxGuiasPorRuta: String(maxGuiasPorRuta),
      });

      const [resDesp, resMaestras] = await Promise.all([
        fetch(`${API_URL}/exito-mensajeria/despacho/sugerencias-inteligentes?${qs.toString()}`, {
          headers: authHeaders(),
        }),
        fetch(`${API_URL}/exito-mensajeria/maestras`, {
          headers: authHeaders(),
        }),
      ]);

      const dataDesp = await resDesp.json();
      const dataMaestras = await resMaestras.json();

      if (dataDesp.success) {
        setTotalEnAlmacen(Number(dataDesp.totalEnAlmacen || 0));
        setSugerenciasRutas(dataDesp.sugerenciasRutas || []);
        setGuiasEnAlmacen(dataDesp.guiasEnAlmacen || []);
        setRutasActivas(dataDesp.rutasActivas || []);
      }

      if (dataMaestras.success) {
        setVehiculos(dataMaestras.vehiculos || []);
        setConductores(dataMaestras.conductores || []);
      }
    } catch (err: any) {
      toast.error('Error al cargar el motor inteligente de despacho: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [includeSandbox, maxGuiasPorRuta]);

  useEffect(() => {
    cargarSugerenciasYCatalogos();
  }, [cargarSugerenciasYCatalogos]);

  // Barrios únicos en almacén para filtrado rápido
  const barriosDisponibles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of guiasEnAlmacen) {
      const b = String(g.barrio_cluster || g.barrio_destino || g.barrio_destinatario || 'SECTOR GENERAL')
        .trim()
        .toUpperCase();
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([barrio, count]) => ({ barrio, count }))
      .sort((a, b) => b.count - a.count);
  }, [guiasEnAlmacen]);

  // Resumen en tiempo real del grupo seleccionado para despacho
  const resumenGrupoSeleccionado = useMemo(() => {
    let cajas = 0;
    let peso = 0;
    const barrios = new Set<string>();
    for (const g of guiasEnAlmacen) {
      if (grupoDespachoIds.has(Number(g.id))) {
        cajas += Number(g.cant_cajas || 1);
        peso += Number(g.peso_kg || 1);
        barrios.add(
          String(g.barrio_cluster || g.barrio_destino || g.barrio_destinatario || 'URBANO')
            .trim()
            .toUpperCase()
        );
      }
    }
    return {
      totalGuias: grupoDespachoIds.size,
      totalCajas: cajas,
      totalPesoKg: Number(peso.toFixed(2)),
      barrios: Array.from(barrios),
    };
  }, [guiasEnAlmacen, grupoDespachoIds]);

  // Filtrado instantáneo para miles de registros
  const guiasFiltradas = useMemo(() => {
    const q = filtroBusqueda.trim().toUpperCase();
    return guiasEnAlmacen.filter((g) => {
      const idNum = Number(g.id);
      if (vistaTabla === 'SOLO_SELECCIONADAS' && !grupoDespachoIds.has(idNum)) {
        return false;
      }
      const barrioG = String(
        g.barrio_cluster || g.barrio_destino || g.barrio_destinatario || 'SECTOR GENERAL'
      )
        .trim()
        .toUpperCase();
      if (filtroBarrio !== 'TODOS' && barrioG !== filtroBarrio) {
        return false;
      }
      if (!q) return true;
      return (
        String(g.numero_guia || '').toUpperCase().includes(q) ||
        String(g.numero_pedido || '').toUpperCase().includes(q) ||
        String(g.nombre_destinatario || '').toUpperCase().includes(q) ||
        String(g.direccion_destino || g.direccion_destinatario || '').toUpperCase().includes(q) ||
        barrioG.includes(q)
      );
    });
  }, [guiasEnAlmacen, vistaTabla, grupoDespachoIds, filtroBarrio, filtroBusqueda]);

  // Cargar o adicionar una ruta sugerida por el motor inteligente
  const handleCargarSugerencia = (sug: any, modo: 'REEMPLAZAR' | 'ADICIONAR') => {
    const ids = (sug.guiaIds || []).map((id: any) => Number(id));
    setGrupoDespachoIds((prev) => {
      const next = modo === 'REEMPLAZAR' ? new Set<number>() : new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    if (modo === 'REEMPLAZAR' || !nombreRutaCustom) {
      setNombreRutaCustom(sug.tituloSugerido || '');
    }
    toast.success(
      modo === 'REEMPLAZAR'
        ? `Ruta sugerida cargada: ${sug.tituloSugerido} (${ids.length} guías)`
        : `Se adicionaron ${ids.length} guías al grupo de despacho actual.`
    );
  };

  // Adicionar o quitar guía individualmente
  const toggleGuiaEnGrupo = (id: number) => {
    setGrupoDespachoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Pistoleo directo para adicionar guía al grupo de reparto
  const handlePistolearParaDespacho = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = scanInput.trim().toUpperCase();
    if (!raw) return;

    const match = guiasEnAlmacen.find(
      (g) =>
        String(g.numero_guia || '').toUpperCase() === raw ||
        String(g.numero_pedido || '').toUpperCase() === raw ||
        String(g.id_contenedor || '').toUpperCase() === raw ||
        String(g.numero_guia || '').toUpperCase().endsWith(raw)
    );

    if (!match) {
      toast.error(`Guía "${raw}" no encontrada en Almacén M7.`);
      setScanInput('');
      return;
    }

    setGrupoDespachoIds((prev) => {
      const next = new Set(prev);
      next.add(Number(match.id));
      return next;
    });
    toast.success(`Adicionada al despacho: ${match.numero_guia} (${match.barrio_cluster || 'Urbano'})`);
    setScanInput('');
  };

  // Abrir / Imprimir Planilla y Remisión PDF On-Demand en RAM
  const handleOpenOrPrintPlanillaPdf = async (codigoRuta: string, autoPrint: boolean = false) => {
    try {
      toast.info(`Generando Planilla y Remisión ${codigoRuta}...`);
      const res = await fetch(
        `${API_URL}/exito-mensajeria/planillas/${encodeURIComponent(codigoRuta)}/pdf?json=true`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!res.ok || !data.pdfBase64) {
        throw new Error(data.error || 'No se pudo generar el PDF de la planilla');
      }
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
            // El usuario puede imprimir desde el visor
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Confirmar creación de ruta / agrupación (con o sin placa inicial) o adición a ruta existente
  const handleDespacharGrupoAPlaca = async (autoPrintPlanilla: boolean = false) => {
    const guiaIds = Array.from(grupoDespachoIds);
    if (guiaIds.length === 0) {
      return toast.warning('Seleccione una ruta sugerida o marque al menos una guía del almacén.');
    }

    const vehObj = vehiculos.find((v) => String(v.id) === String(vehiculoIdSeleccionado));
    const drvObj = conductores.find((d) => String(d.id) === String(conductorIdSeleccionado));
    const placaNombre = vehObj?.plate || (vehiculoIdSeleccionado ? String(vehiculoIdSeleccionado) : '');

    let confirmMsg = '';
    if (rutaExistenteId !== 'NUEVA') {
      const rObj = rutasActivas.find((r) => String(r.id) === String(rutaExistenteId));
      confirmMsg = `¿Confirmar adición de ${guiaIds.length} guía(s) a la ruta ${rObj?.codigo_ruta || 'existente'}?`;
    } else if (placaNombre) {
      confirmMsg = `¿Confirmar despacho de ${guiaIds.length} guía(s) con la Placa "${placaNombre}"${
        drvObj?.name ? ` (Conductor: ${drvObj.name})` : ''
      }?`;
    } else {
      confirmMsg = `¿Guardar esta agrupación de ${guiaIds.length} guía(s) como ruta SIN PLACA aún?\n\nPodrá destinarle la placa en cualquier momento desde el panel de gestión cuando el vehículo esté disponible.`;
    }

    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/rutas`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          guiaIds,
          vehiculoId: vehiculoIdSeleccionado || undefined,
          placaVehiculo: vehObj?.plate || vehiculoIdSeleccionado || undefined,
          conductorId: conductorIdSeleccionado || undefined,
          conductorNombre: drvObj?.name || undefined,
          conductorCedula: drvObj?.document_number || undefined,
          nombreRuta:
            nombreRutaCustom ||
            `Ruta ${resumenGrupoSeleccionado.barrios.slice(0, 3).join(' + ')}`,
          rutaIdExistente: rutaExistenteId !== 'NUEVA' ? Number(rutaExistenteId) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar la ruta urbana');

      toast.success(data.message);
      setGrupoDespachoIds(new Set());
      setNombreRutaCustom('');
      await cargarSugerenciasYCatalogos();

      if (data.ruta?.id) {
        setRutaEnGestionId(Number(data.ruta.id));
        setPlacaCambioRuta(data.ruta.vehiculo_id || '');
        setConductorCambioRuta(data.ruta.conductor_id || '');
      }

      if (data.codigoRuta && autoPrintPlanilla) {
        handleOpenOrPrintPlanillaPdf(data.codigoRuta, true);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Asignar o Cambiar la Placa + Conductor de toda una Ruta existente
  const handleCambiarPlacaDeRuta = async (rutaId: number) => {
    if (!placaCambioRuta) {
      return toast.warning('Seleccione la Placa del vehículo que va a destinar para esta ruta.');
    }

    const rutaObj = rutasActivas.find((r) => Number(r.id) === Number(rutaId));
    const vehObj = vehiculos.find((v) => String(v.id) === String(placaCambioRuta));
    const placaNombre = vehObj?.plate || placaCambioRuta;
    const condObj = conductores.find((c) => String(c.id) === String(conductorCambioRuta));
    const condNombre = condObj?.name ? ` y conductor "${condObj.name}"` : '';

    const ok = window.confirm(
      `¿Confirmar asignación de la Placa "${placaNombre}"${condNombre} a la ruta ${rutaObj?.codigo_ruta || ''}?\n\n` +
      `Todas las guías activas de esta ruta (${rutaObj?.total_guias || 0} guías) quedarán vinculadas a esta placa.`
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/rutas/${rutaId}/gestionar`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'CAMBIAR_PLACA',
          vehiculoId: placaCambioRuta,
          conductorId: conductorCambioRuta || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo asignar/cambiar la placa de la ruta');
      toast.success(data.message);
      await cargarSugerenciasYCatalogos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Quitar una guía de una Ruta existente (incluso después de tener placa asignada) y devolverla a Almacén
  const handleQuitarGuiaDeRutaExistente = async (rutaId: number, guiaId: number, numeroGuia: string) => {
    const rutaObj = rutasActivas.find((r) => Number(r.id) === Number(rutaId));
    const nomRuta = rutaObj?.codigo_ruta || `Ruta #${rutaId}`;
    const ok = window.confirm(
      `¿Desea retirar la guía "${numeroGuia}" de la ruta ${nomRuta}?\n\nLa guía volverá a estar disponible en el Almacén M7 para asignarse a otro vehículo o ruta.`
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/rutas/${rutaId}/gestionar`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'QUITAR_GUIAS',
          guiaIds: [guiaId],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `No se pudo quitar la guía ${numeroGuia}`);
      toast.success(data.message);
      await cargarSugerenciasYCatalogos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Eliminar una ruta cuando tiene 0 guías (o todas fueron quitadas)
  const handleEliminarRutaVacia = async (rutaId: number, codigoRuta: string) => {
    const ok = window.confirm(
      `⚠️ ¿Está completamente seguro de ELIMINAR la ruta ${codigoRuta}?\n\nEsta ruta no tiene guías asociadas y será borrada definitivamente del sistema.`
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/rutas/${rutaId}/gestionar`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'ELIMINAR_RUTA_VACIA',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `No se pudo eliminar la ruta ${codigoRuta}`);
      toast.success(data.message);
      if (Number(rutaEnGestionId) === Number(rutaId)) {
        setRutaEnGestionId(null);
      }
      await cargarSugerenciasYCatalogos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Adicionar una o varias guías del Almacén a la Ruta actualmente en gestión
  const handleAdicionarGuiasARutaExistente = async (rutaId: number, guiaIdsToAdd: number[]) => {
    if (guiaIdsToAdd.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/rutas/${rutaId}/gestionar`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'ADICIONAR_GUIAS',
          guiaIds: guiaIdsToAdd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron adicionar las guías a la ruta');
      toast.success(data.message);
      setScanAdicionarARuta('');
      await cargarSugerenciasYCatalogos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal de trazabilidad completa de una guía individual
  const handleAbrirDetalleGuia = async (guiaId: number) => {
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/guias/${guiaId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo consultar el detalle de la guía');
      setDetalleGuiaModal(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Imprimir o ver Rótulo 4x6" de una guía individual en B/N
  const handleOpenGuideLabelPdf = async (guiaId: number, autoPrint: boolean = false) => {
    try {
      const res = await fetch(`${API_URL}/exito-mensajeria/guias/${guiaId}/rotulo.pdf?json=true`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.pdfBase64) throw new Error(data.error || 'Error al generar rótulo');
      const bin = atob(data.pdfBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const win = window.open(blobUrl, '_blank');
      if (win && autoPrint) {
        win.addEventListener('load', () => {
          win.focus();
          win.print();
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const rutaActivaSeleccionada = useMemo(
    () => rutasActivas.find((r) => Number(r.id) === Number(rutaEnGestionId)) || null,
    [rutasActivas, rutaEnGestionId]
  );

  const rutaOptions = useMemo<SearchableOption[]>(
    () => [
      { value: 'NUEVA', label: '+ Crear Nueva Agrupación / Ruta (RUT-EX-...)', badge: 'NUEVA' },
      ...rutasActivas.map((r) => ({
        value: String(r.id),
        label: `${r.codigo_ruta} · ${r.placa_mostrar ? `Placa ${r.placa_mostrar}` : 'SIN PLACA'}`,
        sublabel: `${r.nombre_ruta} (${r.total_guias || 0} guías)`,
        badge: Number(r.total_guias || 0) === 0 ? 'VACÍA' : `${r.total_guias} guías`,
      })),
    ],
    [rutasActivas]
  );

  const vehiculoOptions = useMemo<SearchableOption[]>(
    () => [
      { value: '', label: '-- Sin Placa aún (Asignar después) --', sublabel: 'Guardar solo la agrupación' },
      ...vehiculos.map((v) => ({
        value: String(v.id),
        label: `Placa: ${v.plate}`,
        sublabel: v.model ? `${v.brand || ''} ${v.model}`.trim() : undefined,
        badge: v.plate,
      })),
    ],
    [vehiculos]
  );

  const conductorOptions = useMemo<SearchableOption[]>(
    () => [
      { value: '', label: '-- Sin Conductor aún (Asignar después) --' },
      ...conductores.map((c) => ({
        value: String(c.id),
        label: c.name || 'Conductor',
        sublabel: c.document_number ? `CC: ${c.document_number}` : undefined,
        badge: c.document_number || undefined,
      })),
    ],
    [conductores]
  );

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* ENCABEZADO RESPONSIVE DE DESPACHO INTELIGENTE (PAG-86) */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 md:p-7 shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-black uppercase">
              RUTEO SUGERIDO POR BARRIOS, DIRECCIONES Y VOLUMEN
            </span>
          </div>
         
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold">
            <span>Capacidad sugerida/ruta:</span>
            <select
              value={maxGuiasPorRuta}
              onChange={(e) => setMaxGuiasPorRuta(Number(e.target.value))}
              className="bg-slate-900 text-amber-300 font-black rounded px-2 py-0.5 border border-slate-600"
            >
              <option value={15}>15 guías (Moto / Express)</option>
              <option value={25}>25 guías (Carry / Van)</option>
              <option value={35}>35 guías (Estándar Urbano)</option>
              <option value={50}>50 guías (Camión / NHR)</option>
              <option value={80}>80 guías (Ruta Masiva)</option>
            </select>
          </div>

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
            onClick={cargarSugerenciasYCatalogos}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs flex items-center gap-2 border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            RECALCULAR SUGERENCIAS
          </button>
        </div>
      </div>

      {/* SECCIÓN 1: TARJETAS DE RUTAS SUGERIDAS POR EL MOTOR INTELIGENTE */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-emerald-600" />
              1. Rutas Sugeridas Automáticamente por Cercanía (Barrios, Direcciones y Volumen)
            </h2>
            <p className="text-xs text-slate-500">
              El motor agrupa paquetes del mismo barrio o sector para optimizar el kilometraje y combustible del vehículo.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-black">
            {sugerenciasRutas.length} ruta(s) sugerida(s) · {totalEnAlmacen} guía(s) en almacén
          </span>
        </div>

        {/* Banner explicativo de la diferencia entre Cargar y Adicionar */}
        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="font-black text-emerald-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ¿Qué diferencia hay entre "Cargar Solo Este Sector" y "+ Sumar a Selección"?
            </div>
            <div className="text-[11px] text-emerald-800 leading-relaxed">
              • <strong>Cargar Solo Este Sector (Verde):</strong> Limpia cualquier selección previa y carga <em>únicamente</em> las guías de este barrio en la agrupación.<br />
              • <strong>+ Sumar a Selección (Oscuro):</strong> Mantiene las guías que ya tenga seleccionadas y les <em>adiciona</em> este sector (útil para que un mismo vehículo reparta dos barrios contiguos, ej: Poblado + Envigado).
            </div>
          </div>
          {grupoDespachoIds.size > 0 && (
            <div className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-200/80 text-emerald-950 font-black text-xs border border-emerald-300">
              Selección actual: {grupoDespachoIds.size} guía(s)
            </div>
          )}
        </div>

        {sugerenciasRutas.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-1">
            <Package className="w-9 h-9 text-slate-400 mx-auto" />
            <div className="text-sm font-black text-slate-700">
              No hay paquetes en estado "En Almacén M7" pendientes por despachar
            </div>
           
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {sugerenciasRutas.map((sug) => (
              <div
                key={sug.clusterId}
                className="rounded-2xl p-4 border-2 border-slate-200 hover:border-emerald-400 bg-slate-50/60 flex flex-col justify-between gap-3 transition shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        String(sug.prioridad).includes('ALTA')
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-indigo-100 text-indigo-900'
                      }`}
                    >
                      {sug.prioridad}
                    </span>
                    <span className="text-xs font-black text-slate-700">
                      {sug.totalGuias} guías · {sug.totalCajas} cj · {sug.totalPesoKg} kg
                    </span>
                  </div>

                  <div className="text-sm font-black text-slate-950 leading-snug">
                    {sug.tituloSugerido}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(sug.barriosIncluidos || []).map((b: string) => (
                      <span
                        key={b}
                        className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700"
                      >
                        📍 {b}
                      </span>
                    ))}
                  </div>

                  {Array.isArray(sug.muestraDirecciones) && sug.muestraDirecciones.length > 0 && (
                    <div className="text-[11px] text-slate-500 space-y-0.5 bg-white/80 p-2 rounded-xl border border-slate-200/70">
                      <div className="font-black text-[10px] uppercase text-slate-400">
                        Muestra de recorrido:
                      </div>
                      {sug.muestraDirecciones.slice(0, 3).map((dir: string, i: number) => (
                        <div key={i} className="truncate">
                          • {dir}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleCargarSugerencia(sug, 'REEMPLAZAR')}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex flex-col items-center justify-center gap-0.5 shadow transition"
                    title="Limpia la selección previa y carga únicamente las guías de este sector"
                  >
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Cargar Solo Este</span>
                    </div>
                    <span className="text-[9px] font-normal opacity-85">Reemplaza selección</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCargarSugerencia(sug, 'ADICIONAR')}
                    className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex flex-col items-center justify-center gap-0.5 transition shadow"
                    title="Conserva las guías que ya seleccionó y suma las guías de este sector"
                  >
                    <div className="flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Sumar al Grupo</span>
                    </div>
                    <span className="text-[9px] font-normal opacity-85">
                      {grupoDespachoIds.size > 0 ? `Unir a las ${grupoDespachoIds.size} actuales` : 'Adicionar a despacho'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: ARMAR AGRUPACIÓN / RUTA (CON O SIN PLACA INICIAL) Y ADICIONAR/QUITAR DEL ALMACÉN */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 md:p-6 shadow-xl border-2 border-emerald-500/40 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-emerald-400 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              2. Armar Agrupación / Ruta y Destinar Placa (Opcional Ahora o Después)
            </div>
            <div className="text-lg font-black mt-0.5">
              Agrupación Actual: <span className="text-amber-300">{resumenGrupoSeleccionado.totalGuias} guía(s)</span> ·{' '}
              {resumenGrupoSeleccionado.totalCajas} caja(s) · {resumenGrupoSeleccionado.totalPesoKg} kg
            </div>
            <div className="text-xs text-slate-300">
              Puede guardar la ruta <strong>sin placa</strong> mientras organiza las guías del almacén, o destinarle la placa de una vez con búsqueda rápida.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGrupoDespachoIds(new Set())}
              disabled={grupoDespachoIds.size === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs border border-slate-700 disabled:opacity-40"
            >
              Vaciar Selección
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              ¿Crear Nueva Ruta o Adicionar a una Existente?
            </label>
            <SearchableDropdown
              theme="dark"
              options={rutaOptions}
              value={rutaExistenteId}
              onChange={setRutaExistenteId}
              placeholder="Seleccionar destino de ruta..."
              searchPlaceholder="Buscar código ej: RUT-EX..."
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Placa que Destina Inhouse (Opcional - con Filtro)
            </label>
            <SearchableDropdown
              theme="dark"
              options={vehiculoOptions}
              value={vehiculoIdSeleccionado}
              onChange={setVehiculoIdSeleccionado}
              placeholder="-- Sin Placa aún (Asignar después) --"
              searchPlaceholder="Escriba placa ej: AAA542..."
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
              Conductor Asignado (Opcional - con Filtro)
            </label>
            <SearchableDropdown
              theme="dark"
              options={conductorOptions}
              value={conductorIdSeleccionado}
              onChange={setConductorIdSeleccionado}
              placeholder="-- Sin Conductor aún --"
              searchPlaceholder="Escriba nombre o cédula..."
            />
          </div>

          <div className="lg:col-span-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleDespacharGrupoAPlaca(false)}
              disabled={submitting || grupoDespachoIds.size === 0}
              className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40 transition px-3"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {submitting
                ? 'GUARDANDO...'
                : rutaExistenteId !== 'NUEVA'
                ? `ADICIONAR (${grupoDespachoIds.size})`
                : vehiculoIdSeleccionado
                ? `CREAR CON PLACA (${grupoDespachoIds.size})`
                : `GUARDAR SIN PLACA (${grupoDespachoIds.size})`}
            </button>

            <button
              type="button"
              onClick={() => handleDespacharGrupoAPlaca(true)}
              disabled={submitting || grupoDespachoIds.size === 0}
              className="h-11 px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40 transition"
              title="Guardar y abrir inmediatamente la Planilla PDF para imprimir"
            >
              <Printer className="w-4 h-4 shrink-0" /> PDF
            </button>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: TABLA ÁGIL PARA ADICIONAR O QUITAR GUÍAS INDIVIDUALES (SOPORTA MILES) */}
      <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVistaTabla('TODAS_ALMACEN')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                vistaTabla === 'TODAS_ALMACEN'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Disponibles en Almacén ({guiasEnAlmacen.length})
            </button>
            <button
              type="button"
              onClick={() => setVistaTabla('SOLO_SELECCIONADAS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                vistaTabla === 'SOLO_SELECCIONADAS'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
              }`}
            >
              En Grupo de Ruta Actual ({grupoDespachoIds.size})
            </button>

            <select
              value={filtroBarrio}
              onChange={(e) => setFiltroBarrio(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-black bg-slate-50"
            >
              <option value="TODOS">Todos los Barrios / Sectores ({barriosDisponibles.length})</option>
              {barriosDisponibles.map((b) => (
                <option key={b.barrio} value={b.barrio}>
                  {b.barrio} ({b.count} guías)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
            <form onSubmit={handlePistolearParaDespacho} className="flex gap-1.5 flex-1">
              <div className="relative flex-1">
                <ScanBarcode className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Pistolear guía para adicionar a la agrupación..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border-2 border-emerald-400 text-xs font-black uppercase"
                />
              </div>
            </form>

            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                placeholder="Buscar dirección, barrio, guía o cliente..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10 text-[11px] font-black uppercase text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3 w-36 text-center">Acción Ruta</th>
                <th className="p-3">Guía / Modalidad</th>
                <th className="p-3">1ra Milla (Quién trajo de Tienda)</th>
                <th className="p-3">Barrio / Sector</th>
                <th className="p-3">Dirección de Entrega</th>
                <th className="p-3">Destinatario</th>
                <th className="p-3 text-center">Volumen</th>
                <th className="p-3 text-right">Seguimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {guiasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                    No hay guías sueltas en Almacén para el filtro seleccionado. Revise abajo las Rutas/Remisiones creadas (`RUT-EX-...`).
                  </td>
                </tr>
              ) : (
                guiasFiltradas.map((g) => {
                  const idNum = Number(g.id);
                  const inGroup = grupoDespachoIds.has(idNum);
                  return (
                    <tr
                      key={idNum}
                      onClick={() => toggleGuiaEnGrupo(idNum)}
                      className={`cursor-pointer transition ${
                        inGroup ? 'bg-emerald-50/90 hover:bg-emerald-100/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleGuiaEnGrupo(idNum)}
                            className={`px-2.5 py-1.5 rounded-lg font-black text-[11px] inline-flex items-center gap-1 ${
                              inGroup
                                ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            {inGroup ? (
                              <>
                                <Minus className="w-3.5 h-3.5" /> Quitar
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" /> Agrupar
                              </>
                            )}
                          </button>
                          {rutaActivaSeleccionada && (
                            <button
                              type="button"
                              onClick={() => handleAdicionarGuiasARutaExistente(Number(rutaActivaSeleccionada.id), [idNum])}
                              className="px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px]"
                              title={`Meter directo en ${rutaActivaSeleccionada.codigo_ruta}`}
                            >
                              + A {rutaActivaSeleccionada.codigo_ruta}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-black text-slate-900">{g.numero_guia}</div>
                        <div className="text-[10px] font-bold text-slate-500">
                          Ped: {g.numero_pedido} · {g.tipo_operacion}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 font-black text-[10px]">
                          🏢 Placa Tienda: {g.placa_recogida_tienda || 'Directo'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                          {g.codigo_recogida ? `${g.codigo_recogida} · ` : ''}Nodo {g.codigo_dependencia}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 font-black text-[11px] inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-indigo-600" />
                          {g.barrio_cluster || g.barrio_destino || g.barrio_destinatario || 'SECTOR GENERAL'}
                        </span>
                      </td>
                      <td className="p-2.5 font-black text-slate-900">
                        {g.direccion_destino || g.direccion_destinatario}
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-slate-800">{g.nombre_destinatario}</div>
                        <div className="text-[10px] text-slate-500">
                          Tel: {g.telefono_destinatario || g.celular_destinatario || 'N/A'}
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-black text-slate-700">
                        {g.cant_cajas || 1} cj · {g.peso_kg || 1} kg
                      </td>
                      <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleAbrirDetalleGuia(idNum)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-[10px]"
                        >
                          Ver Trazabilidad
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          SECCIÓN 4: SEGUIMIENTO PRÁCTICO DE REMISIONES DE RUTA (RUT-EX-...) Y DE CADA GUÍA
          (Permite Asignar/Cambiar Placa, Quitar o Adicionar Guías en cualquier momento y ver en qué estado va cada paquete)
         ===================================================================== */}
      <div className="bg-white rounded-2xl p-4 md:p-6 border-2 border-indigo-200 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black uppercase text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              3. Seguimiento en Vivo de Rutas / Remisiones (`RUT-EX-...`) y Gestión de Placas y Guías
            </h2>
            <p className="text-xs text-slate-600">
              Seleccione cualquier ruta para <strong>destinarle o cambiarle la Placa</strong>, <strong>quitar o adicionar guías</strong> (incluso después de asignada la placa) y hacer seguimiento paquete por paquete.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-900 font-black text-xs border border-indigo-200">
            {rutasActivas.length} Ruta(s) / Remisión(es) Registradas
          </span>
        </div>

        {rutasActivas.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center border-2 border-dashed border-slate-200 rounded-2xl">
            Aún no hay rutas/remisiones creadas. Seleccione una ruta sugerida arriba y pulse <strong>"Guardar Ruta Sin Placa"</strong> o <strong>"Crear Ruta con Placa"</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {rutasActivas.map((r) => {
              const isSelected = Number(rutaEnGestionId) === Number(r.id);
              const totalG = Number(r.total_guias || 0);
              const entregadasG = Number(r.guias_entregadas || 0);
              const novedadG = Number(r.guias_novedad || 0);
              const enRepartoG = Number(r.guias_en_reparto || 0);
              const enAlmacenG = Number(r.guias_en_almacen || 0);
              const pctAvance = totalG > 0 ? Math.round(((entregadasG + novedadG) / totalG) * 100) : 0;
              const tienePlaca = Boolean(r.placa_mostrar);

              return (
                <div
                  key={r.id}
                  className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-3 transition ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 shadow-md'
                      : 'border-slate-200 bg-slate-50 hover:border-indigo-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {tienePlaca ? (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-amber-300 font-black text-xs">
                          🚚 Placa: {r.placa_mostrar}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-black text-[11px]">
                          ⏳ SIN PLACA ASIGNADA AÚN
                        </span>
                      )}
                      <span className="text-xs font-black text-indigo-700">{r.codigo_ruta}</span>
                    </div>

                    <div className="text-sm font-black text-slate-900">{r.nombre_ruta}</div>
                    <div className="text-xs font-bold text-slate-600">
                      Conductor: {r.conductor_mostrar || 'Pendiente por asignar en Inhouse'}
                    </div>

                    {/* Resumen de seguimiento en vivo de la Remisión */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-500">Total</div>
                        <div className="text-xs font-black text-slate-900">{totalG}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-200">
                        <div className="text-[10px] font-bold text-blue-700">En Ruta</div>
                        <div className="text-xs font-black text-blue-900">{enRepartoG + enAlmacenG}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                        <div className="text-[10px] font-bold text-emerald-700">Entreg.</div>
                        <div className="text-xs font-black text-emerald-900">{entregadasG}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200">
                        <div className="text-[10px] font-bold text-rose-700">Novedad</div>
                        <div className="text-xs font-black text-rose-900">{novedadG}</div>
                      </div>
                    </div>

                    {/* Barra de progreso de la ruta */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-black text-slate-500">
                        <span>Avance de la Remisión: {pctAvance}%</span>
                        <span>{formatColombiaDateTime(r.created_at)}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 transition-all"
                          style={{ width: `${pctAvance}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setRutaEnGestionId(null);
                        } else {
                          setRutaEnGestionId(Number(r.id));
                          setPlacaCambioRuta(r.vehiculo_id || '');
                          setConductorCambioRuta(r.conductor_id || '');
                        }
                      }}
                      className={`w-full py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition shadow-xs ${
                        isSelected
                          ? 'bg-slate-900 text-amber-300'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      {isSelected
                        ? 'CERRAR PANEL DE GESTIÓN Y SEGUIMIENTO'
                        : 'GESTIONAR PLACA / QUITAR O ADICIONAR GUÍAS / SEGUIMIENTO'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenOrPrintPlanillaPdf(r.codigo_ruta, false)}
                        className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-black text-xs flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" /> Ver Planilla PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenOrPrintPlanillaPdf(r.codigo_ruta, true)}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" /> Imprimir Remisión
                      </button>
                    </div>

                    {totalG === 0 && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEliminarRutaVacia(Number(r.id), r.codigo_ruta);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow transition"
                        title="Eliminar ruta vacía (0 guías)"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar Ruta Vacía
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PANEL DESPLEGADO DE GESTIÓN Y SEGUIMIENTO DETALLADO DE LA RUTA SELECCIONADA */}
        {rutaActivaSeleccionada && (
          <div className="mt-4 rounded-3xl border-2 border-indigo-600 bg-slate-50 p-4 md:p-6 space-y-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full bg-indigo-600 text-white font-black text-xs">
                    REMISIÓN / RUTA: {rutaActivaSeleccionada.codigo_ruta}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-900 text-amber-300 font-black text-xs">
                    {rutaActivaSeleccionada.placa_mostrar
                      ? `🚚 Placa Actual: ${rutaActivaSeleccionada.placa_mostrar} (${rutaActivaSeleccionada.conductor_mostrar || 'Conductor'})`
                      : '⏳ SIN PLACA ASIGNADA'}
                  </span>
                  {Number(rutaActivaSeleccionada.total_guias || 0) === 0 && (
                    <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-black text-xs">
                      ⚠️ RUTA VACÍA (0 GUÍAS)
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black text-slate-950 mt-1">
                  {rutaActivaSeleccionada.nombre_ruta} — {rutaActivaSeleccionada.total_guias} Guía(s) en esta Remisión
                </h3>
              </div>

              {/* Control para Asignar o Cambiar la Placa + Conductor de toda esta Ruta con Búsqueda */}
              <div className="flex flex-wrap items-end gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <div className="w-56">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Destinar / Cambiar Placa (con Filtro):
                  </label>
                  <SearchableDropdown
                    theme="light"
                    options={vehiculoOptions}
                    value={placaCambioRuta}
                    onChange={setPlacaCambioRuta}
                    placeholder="-- Seleccionar Placa --"
                    searchPlaceholder="Buscar placa ej: AAA..."
                  />
                </div>

                <div className="w-56">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                    Conductor (con Filtro):
                  </label>
                  <SearchableDropdown
                    theme="light"
                    options={conductorOptions}
                    value={conductorCambioRuta}
                    onChange={setConductorCambioRuta}
                    placeholder="-- Seleccionar Conductor --"
                    searchPlaceholder="Buscar conductor..."
                  />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleCambiarPlacaDeRuta(Number(rutaActivaSeleccionada.id))}
                  className="h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-1.5 shadow disabled:opacity-50 transition"
                >
                  <Truck className="w-4 h-4" />
                  {rutaActivaSeleccionada.placa_mostrar ? 'CAMBIAR PLACA DE RUTA' : 'ASIGNAR PLACA A RUTA'}
                </button>

                {Number(rutaActivaSeleccionada.total_guias || 0) === 0 && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      handleEliminarRutaVacia(Number(rutaActivaSeleccionada.id), rutaActivaSeleccionada.codigo_ruta)
                    }
                    className="h-11 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-1.5 shadow transition"
                    title="Eliminar esta ruta porque no tiene ninguna guía asignada"
                  >
                    <Trash2 className="w-4 h-4" /> ELIMINAR RUTA VACÍA
                  </button>
                )}
              </div>
            </div>

            {/* Barra para Adicionar Guías del Almacén a esta Ruta en cualquier momento */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-700">
                <strong>➕ Adicionar más guías del Almacén a {rutaActivaSeleccionada.codigo_ruta}:</strong>{' '}
                Pistolee aquí el código de barras o use el botón <strong>"+ A {rutaActivaSeleccionada.codigo_ruta}"</strong> en la tabla de Almacén arriba.
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const raw = scanAdicionarARuta.trim().toUpperCase();
                  if (!raw) return;
                  const match = guiasEnAlmacen.find(
                    (g) =>
                      String(g.numero_guia || '').toUpperCase() === raw ||
                      String(g.numero_pedido || '').toUpperCase() === raw ||
                      String(g.numero_guia || '').toUpperCase().endsWith(raw)
                  );
                  if (!match) {
                    toast.error(`La guía "${raw}" no está disponible en Almacén.`);
                    return;
                  }
                  handleAdicionarGuiasARutaExistente(Number(rutaActivaSeleccionada.id), [Number(match.id)]);
                }}
                className="flex items-center gap-2 min-w-[280px]"
              >
                <input
                  type="text"
                  value={scanAdicionarARuta}
                  onChange={(e) => setScanAdicionarARuta(e.target.value)}
                  placeholder="Pistolear guía para meter en esta ruta..."
                  className="flex-1 h-9 px-3 rounded-xl border-2 border-indigo-400 text-xs font-black uppercase"
                />
                <button
                  type="submit"
                  className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs"
                >
                  + Adicionar
                </button>
              </form>
            </div>

            {/* Tabla de Seguimiento Práctico Paquete por Paquete dentro de esta Remisión */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900 text-white text-[10px] font-black uppercase">
                    <tr>
                      <th className="p-3">Guía / Pedido</th>
                      <th className="p-3">Destinatario y Dirección</th>
                      <th className="p-3">1ra Milla (Tienda) vs Última Milla (Reparto)</th>
                      <th className="p-3">Línea de Tiempo / En qué momento se encuentra</th>
                      <th className="p-3 text-right">Acciones / Quitar de Ruta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(rutaActivaSeleccionada.guias_ruta || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 font-bold space-y-3">
                          <Package className="w-8 h-8 text-slate-400 mx-auto" />
                          <div>Esta ruta no tiene guías activas en este momento.</div>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() =>
                                handleEliminarRutaVacia(
                                  Number(rutaActivaSeleccionada.id),
                                  rutaActivaSeleccionada.codigo_ruta
                                )
                              }
                              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs inline-flex items-center gap-1.5 shadow"
                            >
                              <Trash2 className="w-4 h-4" /> Eliminar Esta Ruta Vacía
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      (rutaActivaSeleccionada.guias_ruta || []).map((g: any) => {
                        const entregada = g.estado_operativo === 'ENTREGADO';
                        const enRuta = g.estado_operativo === 'EN_RUTA';
                        const conNov = Boolean(g.tiene_novedad_activa || g.estado_operativo === 'NOVEDAD');
                        return (
                          <tr key={g.id} className="hover:bg-slate-50">
                            <td className="p-3">
                              <div className="font-black text-slate-950">{g.numero_guia}</div>
                              <div className="text-[10px] text-slate-500 font-bold">
                                Ped: {g.numero_pedido} · {g.cant_cajas || 1} cj ({g.peso_kg || 1} kg)
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-black text-slate-900">{g.nombre_destinatario}</div>
                              <div className="text-[11px] font-bold text-slate-700">
                                {g.direccion_destinatario}
                              </div>
                              <div className="text-[10px] text-indigo-700 font-black">
                                📍 {g.barrio_destinatario} ({g.ciudad_destinatario_nombre})
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="space-y-1 text-[10px]">
                                <div className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                                  🏢 1ra Milla: <strong>{g.placa_recogida_tienda || 'Directo'}</strong>{' '}
                                  {g.codigo_recogida ? `(${g.codigo_recogida})` : ''}
                                </div>
                                <div className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                                  🏠 Última Milla:{' '}
                                  <strong>{rutaActivaSeleccionada.placa_mostrar || 'Sin Placa'}</strong> (
                                  {rutaActivaSeleccionada.codigo_ruta})
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              {/* Línea de tiempo práctica de los 4 momentos operativos */}
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black">
                                <span
                                  className={`px-2 py-0.5 rounded-md border ${
                                    g.fecha_recogida_tienda
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                      : 'bg-slate-100 border-slate-200 text-slate-500'
                                  }`}
                                >
                                  1. Tienda {g.fecha_recogida_tienda ? '✓' : '•'}
                                </span>
                                <span>&rarr;</span>
                                <span
                                  className={`px-2 py-0.5 rounded-md border ${
                                    g.fecha_ingreso_almacen || g.estado_operativo === 'EN_ALMACEN' || enRuta || entregada
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                      : 'bg-slate-100 border-slate-200 text-slate-500'
                                  }`}
                                >
                                  2. Bodega M7 ✓
                                </span>
                                <span>&rarr;</span>
                                <span
                                  className={`px-2 py-0.5 rounded-md border ${
                                    enRuta || entregada
                                      ? 'bg-blue-100 border-blue-400 text-blue-950'
                                      : 'bg-amber-50 border-amber-300 text-amber-900'
                                  }`}
                                >
                                  3. {enRuta || entregada ? 'En Reparto ✓' : 'En Almacén (Esp. Placa)'}
                                </span>
                                <span>&rarr;</span>
                                <span
                                  className={`px-2 py-0.5 rounded-md border ${
                                    entregada
                                      ? 'bg-emerald-600 border-emerald-700 text-white'
                                      : conNov
                                      ? 'bg-rose-600 border-rose-700 text-white'
                                      : 'bg-slate-100 border-slate-200 text-slate-500'
                                  }`}
                                >
                                  4. {entregada ? '✅ ENTREGADO' : conNov ? '⚠️ NOVEDAD' : 'Pend. Entrega'}
                                </span>
                              </div>
                              {conNov && g.ultima_novedad_texto && (
                                <div className="text-[10px] font-bold text-rose-700 mt-1">
                                  ⚠️ {g.ultima_novedad_texto}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenGuideLabelPdf(Number(g.id), false)}
                                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-[10px]"
                                  title="Ver/Imprimir Rótulo 4x6 B/N de esta guía"
                                >
                                  Rótulo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAbrirDetalleGuia(Number(g.id))}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-black text-[10px]"
                                >
                                  Historial / Fotos
                                </button>
                                {!entregada && (
                                  <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={() =>
                                      handleQuitarGuiaDeRutaExistente(
                                        Number(rutaActivaSeleccionada.id),
                                        Number(g.id),
                                        g.numero_guia
                                      )
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-black text-[10px] flex items-center gap-1"
                                    title="Quitar guía de esta ruta y devolverla al Almacén M7"
                                  >
                                    <Minus className="w-3 h-3" /> Quitar de Ruta
                                  </button>
                                )}
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
      </div>

      {/* MODAL DE SEGUIMIENTO Y TRAZABILIDAD COMPLETA DE UNA GUÍA INDIVIDUAL */}
      {detalleGuiaModal?.guia && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-black uppercase text-indigo-600">
                  Seguimiento Detallado de Guía y Soportes
                </div>
                <h3 className="text-xl font-black text-slate-950">
                  Guía {detalleGuiaModal.guia.numero_guia} · Pedido {detalleGuiaModal.guia.numero_pedido}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetalleGuiaModal(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-1">
                <div className="font-black text-blue-950 uppercase text-[10px]">
                  🏢 1ra Milla (Recogida en Tienda &rarr; Bodega M7)
                </div>
                <div className="font-black text-slate-900">
                  Placa: {detalleGuiaModal.guia.placa_recogida || 'Sin placa'} ·{' '}
                  {detalleGuiaModal.guia.conductor_recogida_nombre || 'Pendiente'}
                </div>
                <div className="text-blue-800">
                  Remisión Tienda: <strong>{detalleGuiaModal.guia.codigo_recogida || 'N/A'}</strong>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                <div className="font-black text-emerald-950 uppercase text-[10px]">
                  🏠 Última Milla (Salida Bodega M7 &rarr; Cliente Final)
                </div>
                <div className="font-black text-slate-900">
                  Placa: {detalleGuiaModal.guia.placa_entrega || 'En Almacén / Sin placa'} ·{' '}
                  {detalleGuiaModal.guia.conductor_entrega_nombre || 'Pendiente'}
                </div>
                <div className="text-emerald-800">
                  Planilla Ruta: <strong>{detalleGuiaModal.guia.codigo_ruta || 'N/A'}</strong>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-black uppercase text-slate-700">
                Bitácora Cronológica de Movimientos (Hora Oficial de Colombia):
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {(detalleGuiaModal.historial || []).map((h: any) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-black text-slate-900">
                        {h.estado_anterior || 'INICIO'} &rarr; {h.estado_nuevo}
                      </div>
                      <div className="text-slate-600 text-[11px]">{h.observacion}</div>
                    </div>
                    <div className="text-right text-[10px] text-slate-500 shrink-0">
                      <div className="font-bold">{h.usuario_nombre}</div>
                      <div>{formatColombiaDateTime(h.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExitoMensajeriaDespacho;

