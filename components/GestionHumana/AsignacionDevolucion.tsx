import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { DataTable, ColumnDef } from '../shared/DataTable';
import { hasPermission } from '../../utils/permissions';
import { formatDate } from '../../utils/formatting';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AsignacionInformes from './AsignacionInformes';
import {
  ArrowLeftRight,
  Search,
  Trash2,
  Plus,
  RefreshCw,
  FileText,
  CheckCircle2,
  ChevronDown,
  Calendar,
  Barcode,
  Users,
  UserCheck,
  UserMinus,
  MessageSquare,
  FileSpreadsheet,
  PenLine,
  Clock,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Download,
  FileDown,
  Lock,
  Ban,
  History,
  BarChart3,
  Undo2,
  PackageX
} from 'lucide-react';

interface Props {
  user: User;
}

import SearchableSelect from './shared/SearchableSelect';

const calcularTiempoTranscurrido = (fechaUltimaStr: string, fechaActualStr?: string) => {
  const start = new Date(fechaUltimaStr);
  const end = fechaActualStr ? new Date(fechaActualStr) : new Date();

  const dInicio = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dFin = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (dInicio > dFin) {
    return {
      totalMeses: 0,
      meses: 0,
      dias: 0,
      textoCompleto: 'Recientemente',
      fechaFormatted: dInicio.toLocaleDateString('es-CO')
    };
  }

  let anos = dFin.getFullYear() - dInicio.getFullYear();
  let meses = dFin.getMonth() - dInicio.getMonth();
  let dias = dFin.getDate() - dInicio.getDate();

  if (dias < 0) {
    meses--;
    const ultimoDiaMesAnterior = new Date(dFin.getFullYear(), dFin.getMonth(), 0).getDate();
    dias += ultimoDiaMesAnterior;
  }

  if (meses < 0) {
    anos--;
    meses += 12;
  }

  const totalMeses = anos * 12 + meses;

  const partes: string[] = [];
  if (totalMeses > 0) {
    partes.push(`${totalMeses} ${totalMeses === 1 ? 'mes' : 'meses'}`);
  }
  if (dias > 0 || partes.length === 0) {
    partes.push(`${dias} ${dias === 1 ? 'día' : 'días'}`);
  }

  const diaStr = String(dInicio.getDate()).padStart(2, '0');
  const mesStr = String(dInicio.getMonth() + 1).padStart(2, '0');
  const anoStr = dInicio.getFullYear();

  return {
    totalMeses,
    meses,
    dias,
    textoCompleto: partes.join(' y '),
    fechaFormatted: `${diaStr}/${mesStr}/${anoStr}`
  };
};

/** La columna de acciones va de primera para que siempre esté a la vista. */
const accionesPrimero = (cols: ColumnDef<any>[]) => {
  const acc = cols.filter(c => c.key === 'acciones');
  return [...acc, ...cols.filter(c => c.key !== 'acciones')];
};

/** Encabezado completo de un movimiento (asignación o devolución) para el modal de detalle. */
const DetalleEncabezado: React.FC<{ d: any; esAsig: boolean }> = ({ d, esAsig }) => {
  const fechaHora = (v: any) => (v ? new Date(v).toLocaleString('es-CO') : '—');
  const firmado = d.firma_estado === 'FIRMADO';
  const anulada = d.estado === 'ANULADA';
  const Campo = ({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) => (
    <div className={wide ? 'md:col-span-2' : ''}>
      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
      <div className="text-xs font-bold text-slate-800 mt-0.5 break-words">{value || '—'}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase ${anulada ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {anulada ? 'Anulada' : 'Activa'}
        </span>
        <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase ${firmado ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          Firma: {firmado ? 'Firmado' : 'Pendiente'}
        </span>
        {esAsig && d.devolucion_reposicion_numero && (
          <span className="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase bg-rose-50 border-rose-200 text-rose-700">
            Devolución por reposición: {d.devolucion_reposicion_numero}
          </span>
        )}
        {!esAsig && d.asignacion_origen_numero && (
          <span className="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase bg-indigo-50 border-indigo-200 text-indigo-700">
            Generada por la asignación {d.asignacion_origen_numero}
          </span>
        )}
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-5 space-y-4">
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Encabezado</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Campo label="ID interno" value={`#${d.id}`} />
          <Campo label={esAsig ? 'N° asignación' : 'N° devolución'} value={esAsig ? d.numero_asignacion : d.numero_devolucion} />
          <Campo label="Fecha de operación" value={formatDate(d.fecha)} />
          {esAsig ? <Campo label="Autorizado por" value={d.autorizado_por} /> : <Campo label="Motivo" value={d.motivo} />}
          <Campo label="Registrado por" value={d.usuario_control} />
          <Campo label="Fecha de registro" value={fechaHora(d.fecha_control)} />
          <Campo label="Firmado por" value={firmado ? d.firmado_por : 'Pendiente'} />
          <Campo label="Fecha de firma" value={firmado ? fechaHora(d.fecha_firma) : '—'} />
          {d.editada_por && <Campo label="Última edición" value={`${d.editada_por} · ${fechaHora(d.fecha_edicion)}`} wide />}
          {anulada && d.anulada_por && <Campo label="Anulada por" value={`${d.anulada_por} · ${fechaHora(d.fecha_anulacion)}`} wide />}
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200/70 p-5 space-y-4">
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Funcionario</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Campo label="Nombre" value={d.personal_nombre} wide />
          <Campo label="Cédula" value={d.personal_documento} />
          <Campo label="Cargo" value={d.personal_cargo} />
          <Campo label="Operación" value={d.personal_operacion} />
          <Campo label="Placa" value={d.personal_placa} />
        </div>
      </div>
    </div>
  );
};

/** Qué pasó con el elemento anterior al entregar este (reposición). */
const ReposicionBadge: React.FC<{ item: any }> = ({ item }) => {
  const r = item?.reposicion;
  const devueltos = (item?.serials_devueltos || []).filter(Boolean);
  if (!r) return <span className="text-[10px] text-slate-400 uppercase font-black">Sin reposición</span>;
  const cls = r === 'BODEGA' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : r === 'BAJA' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700';
  const txt = r === 'BODEGA' ? `Devuelve ${item.cantidad_devuelta} a bodega`
    : r === 'BAJA' ? `Devuelve ${item.cantidad_devuelta} para baja` : 'No devuelve';
  return (
    <div className="space-y-1">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${cls}`}>
        {r === 'BAJA' ? <PackageX size={10} /> : <Undo2 size={10} />} {txt}
      </span>
      {devueltos.length > 0 && <div className="text-[9px] text-slate-500 font-bold">Seriales: {devueltos.join(', ')}</div>}
      {item.observacion_reposicion && <div className="text-[9px] text-slate-500 font-medium italic">{item.observacion_reposicion}</div>}
    </div>
  );
};

const AsignacionDevolucion: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'asignaciones' | 'devoluciones' | 'informes'>('asignaciones');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Lists
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [devoluciones, setDevoluciones] = useState<any[]>([]);
  
  // Dropdowns/Catalogs
  const [personalList, setPersonalList] = useState<any[]>([]);
  const [elementosBodegaList, setElementosBodegaList] = useState<any[]>([]); // elements with warehouse stock
  const [personalElementsList, setPersonalElementsList] = useState<any[]>([]); // elements assigned to selected person

  // Filtering
  const [searchId, setSearchId] = useState('');
  const [searchPersonalId, setSearchPersonalId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Row Expansion / Details Modal
  const [viewDetail, setViewDetail] = useState<any | null>(null);

  // Main Modal for new movements
  const [showModal, setShowModal] = useState(false);

  // Header & Detail states for new records
  const [formHeader, setFormHeader] = useState<any>({
    numero_operacion: '',
    personal_id: '',
    autorizado_por: '',
    motivo: '',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: ''
  });
  const [formItems, setFormItems] = useState<any[]>([]);

  // Edición / anulación de asignaciones (solo activas con firma pendiente)
  const [editingAsig, setEditingAsig] = useState<any | null>(null);
  const [motivoEdicion, setMotivoEdicion] = useState('');
  const [anularTarget, setAnularTarget] = useState<any | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [historial, setHistorial] = useState<any[] | null>(null);
  
  // Add item scratch state
  const [selectedElementId, setSelectedElementId] = useState('');
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [inputCantidad, setInputCantidad] = useState<number>(1);
  const [availableStock, setAvailableStock] = useState<number>(0);
  
  // Serial control
  const [availableSerials, setAvailableSerials] = useState<any[]>([]); // serials available to select
  const [selectedSerial, setSelectedSerial] = useState('');
  const [scannedSerials, setScannedSerials] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Post-create: sign now or later dialog
  const [signDialog, setSignDialog] = useState<{ isOpen: boolean; asignacionId: number | null; personalNombre: string; tab: 'asignaciones' | 'devoluciones' }>({ isOpen: false, asignacionId: null, personalNombre: '', tab: 'asignaciones' });

  // Firma key modal (from list or from sign-now dialog)
  const [firmaModal, setFirmaModal] = useState<{ isOpen: boolean; asignacionId: number | null; personalNombre: string; clave: string; isSigning: boolean; tab: 'asignaciones' | 'devoluciones' }>({
    isOpen: false, asignacionId: null, personalNombre: '', clave: '', isSigning: false, tab: 'asignaciones'
  });
  const [showFirmaClave, setShowFirmaClave] = useState(false);

  // Ultima entrega validation modal dialog
  const [ultimaEntregaModal, setUltimaEntregaModal] = useState<{
    isOpen: boolean;
    personalNombre: string;
    elementoNombre: string;
    hasPrevious: boolean;
    fechaUltima: string;
    numeroAsignacion: string;
    cantidadUltima: number;
    textoTiempo: string;
    pendingItemToAdd: any | null;
    // Reposición: saldo que el colaborador ya tiene del elemento y qué pasa con él
    tenencia?: number;
    serialesPersona?: string[];
    reposicion?: '' | 'BODEGA' | 'BAJA' | 'NO_DEVUELVE';
    cantidadDevuelta?: number;
    serialsDevueltos?: string[];
    observacionReposicion?: string;
  }>({
    isOpen: false,
    personalNombre: '',
    elementoNombre: '',
    hasPrevious: false,
    fechaUltima: '',
    numeroAsignacion: '',
    cantidadUltima: 0,
    textoTiempo: '',
    pendingItemToAdd: null
  });

  // Derived permissions
  const canViewAll = hasPermission(user, 'ASIGNACION_DEVOLUCION_GH', 'view') || hasPermission(user, 'MASTER_INVENTARIO_GH', 'view');
  const canCreate = hasPermission(user, 'ASIGNACION_DEVOLUCION_GH', 'create') || hasPermission(user, 'MASTER_INVENTARIO_GH', 'create');
  const canEdit = hasPermission(user, 'ASIGNACION_DEVOLUCION_GH', 'edit') || hasPermission(user, 'MASTER_INVENTARIO_GH', 'edit');
  const canDelete = hasPermission(user, 'ASIGNACION_DEVOLUCION_GH', 'delete') || hasPermission(user, 'MASTER_INVENTARIO_GH', 'delete');
  /** Una asignación se puede editar/anular solo si está activa y la firma sigue pendiente. */
  const esModificable = (a: any) => a && a.estado !== 'ANULADA' && a.firma_estado !== 'FIRMADO';

  const asignacionesColumns = React.useMemo<ColumnDef<any>[]>(() => accionesPrimero([
    {
      header: 'ID',
      key: 'id',
      render: (asig) => <span className="text-slate-400">#{asig.id}</span>
    },
    {
      header: 'Identificador',
      key: 'numero_asignacion',
      render: (asig) => <span className="font-black text-slate-900">{asig.numero_asignacion}</span>
    },
    {
      header: 'Funcionario',
      key: 'personal_nombre',
      render: (asig) => <span>{asig.personal_nombre || `Funcionario ID: ${asig.personal_id}`}</span>
    },
    {
      header: 'Fecha Operación',
      key: 'fecha',
      render: (asig) => <span>{formatDate(asig.fecha)}</span>
    },
    {
      header: 'Autorizado Por',
      key: 'autorizado_por',
      render: (asig) => <span className="text-indigo-600 font-black">{asig.autorizado_por}</span>
    },
    {
      header: 'Registrado Por',
      key: 'usuario_control',
      render: (asig) => (
        <div className="text-slate-400 font-medium">
          {asig.usuario_control}
          <div className="text-[9px]">{new Date(asig.fecha_control).toLocaleString()}</div>
        </div>
      )
    },
    {
      header: 'Firma',
      key: 'firma_estado',
      render: (asig) => (
        <div className="text-center">
          {asig.estado === 'ANULADA' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-300 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-wider" title={asig.motivo_anulacion || ''}>
              <Ban size={10} /> Anulada
            </span>
          ) : asig.firma_estado === 'FIRMADO' ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wider">
                <ShieldCheck size={10} /> Firmado
              </span>
              <span className="text-[9px] text-slate-600 font-bold">{asig.personal_nombre?.split(' ')[0]}</span>
              {asig.fecha_firma && (
                <span className="text-[9px] text-slate-400 font-medium">
                  {new Date(asig.fecha_firma).toLocaleDateString()}
                </span>
              )}
            </div>
          ) : (
            (() => {
              const userDoc = user.document_number || user.documentNumber;
              const isOwnRecord = userDoc && asig.personal_documento === userDoc;
              const canSign = canEdit || isOwnRecord;
              return canSign ? (
                <button
                  onClick={() => setFirmaModal({ isOpen: true, asignacionId: asig.id, personalNombre: asig.personal_nombre || '', clave: '', isSigning: false, tab: 'asignaciones' })}
                  className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                >
                  <span className="flex items-center gap-1"><Clock size={10} /> Pendiente</span>
                  <span className="text-[8px] text-amber-600 normal-case font-bold">{asig.personal_nombre?.split(' ')[0]}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
                  <Clock size={10} /> Pendiente
                </span>
              );
            })()
          )}
        </div>
      )
    },
    {
      header: 'Acción',
      key: 'acciones',
      sortable: false,
      render: (asig) => (
        <div className="flex items-center justify-start gap-2">
          <button
            onClick={() => exportToPDF(asig)}
            title="Exportar PDF"
            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-colors border border-red-200"
          >
            <FileDown size={12} />
          </button>
          <button
            onClick={() => setViewDetail(asig)}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5"
          >
            <FileText size={11} /> Detalle
          </button>
          {esModificable(asig) ? (
            <>
              {canEdit && (
                <button
                  onClick={() => handleOpenEditModal(asig)}
                  title="Editar asignación (firma pendiente)"
                  aria-label="Editar asignación"
                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors border border-indigo-200"
                >
                  <PenLine size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => { setAnularTarget(asig); setMotivoAnulacion(''); }}
                  title="Anular asignación (devuelve los elementos a bodega)"
                  aria-label="Anular asignación"
                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors border border-rose-200"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </>
          ) : asig.estado !== 'ANULADA' && (canEdit || canDelete) ? (
            <span title="Firmada por el colaborador: no se puede modificar" className="p-1.5 text-slate-300">
              <Lock size={12} />
            </span>
          ) : null}
        </div>
      )
    }
  ]), [user, canEdit, canDelete]);

  const devolucionesColumns = React.useMemo<ColumnDef<any>[]>(() => accionesPrimero([
    {
      header: 'ID',
      key: 'id',
      render: (dev) => <span className="text-slate-400">#{dev.id}</span>
    },
    {
      header: 'Identificador',
      key: 'numero_devolucion',
      render: (dev) => <span className="font-black text-slate-900">{dev.numero_devolucion}</span>
    },
    {
      header: 'Funcionario',
      key: 'personal_nombre',
      render: (dev) => <span>{dev.personal_nombre || `Funcionario ID: ${dev.personal_id}`}</span>
    },
    {
      header: 'Fecha Operación',
      key: 'fecha',
      render: (dev) => <span>{formatDate(dev.fecha)}</span>
    },
    {
      header: 'Motivo Devolución',
      key: 'motivo',
      render: (dev) => <span className="text-rose-500 font-black truncate max-w-xs block">{dev.motivo}</span>
    },
    {
      header: 'Registrado Por',
      key: 'usuario_control',
      render: (dev) => (
        <div className="text-slate-400 font-medium">
          {dev.usuario_control}
          <div className="text-[9px]">{new Date(dev.fecha_control).toLocaleString()}</div>
        </div>
      )
    },
    {
      header: 'Firma',
      key: 'firma_estado',
      render: (dev) => (
        <div className="text-center">
          {dev.firma_estado === 'FIRMADO' ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-wider">
                <ShieldCheck size={10} /> Firmado
              </span>
              <span className="text-[9px] text-slate-600 font-bold">{dev.personal_nombre?.split(' ')[0]}</span>
              {dev.fecha_firma && (
                <span className="text-[9px] text-slate-400 font-medium">
                  {new Date(dev.fecha_firma).toLocaleDateString()}
                </span>
              )}
            </div>
          ) : (
            (() => {
              const userDoc = user.document_number || user.documentNumber;
              const isOwnRecord = userDoc && dev.personal_documento === userDoc;
              const canSign = canEdit || isOwnRecord;
              return canSign ? (
                <button
                  onClick={() => setFirmaModal({ isOpen: true, asignacionId: dev.id, personalNombre: dev.personal_nombre || '', clave: '', isSigning: false, tab: 'devoluciones' })}
                  className="inline-flex flex-col items-center gap-0.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                >
                  <span className="flex items-center gap-1"><Clock size={10} /> Pendiente</span>
                  <span className="text-[8px] text-amber-600 normal-case font-bold">{dev.personal_nombre?.split(' ')[0]}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
                  <Clock size={10} /> Pendiente
                </span>
              );
            })()
          )}
        </div>
      )
    },
    {
      header: 'Acción',
      key: 'acciones',
      sortable: false,
      render: (dev) => (
        <div className="flex items-center justify-start gap-2">
          <button
            onClick={() => exportToPDF(dev)}
            title="Exportar PDF"
            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition-colors border border-red-200"
          >
            <FileDown size={12} />
          </button>
          <button
            onClick={() => setViewDetail(dev)}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider flex items-center gap-1.5"
          >
            <FileText size={11} /> Detalle
          </button>
        </div>
      )
    }
  ]), [user, canEdit]);

  // Auto-focus barcode input
  useEffect(() => {
    if (showModal && selectedElement?.es_serializado) {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [showModal, selectedElement, scannedSerials]);

  useEffect(() => {
    if (activeTab !== 'informes') loadTabRecords();
    loadDropdowns();
  }, [activeTab]);

  const loadDropdowns = async () => {
    try {
      const pRes = await api.getPersonal();
      setPersonalList(Array.isArray(pRes) ? pRes.filter((p: any) => p.estado === 'EST-01') : []);

      // Load all available elements from bodega dropdown
      const elRes = await api.getGhDropdownElementos();
      if (elRes.success) {
        setElementosBodegaList(elRes.data);
      }

      const cargosRes = await api.getGhMiscelaneos('cargos');
      if (Array.isArray(cargosRes)) setCargosOptions(cargosRes);
    } catch (e) {
      console.error(e);
    }
  };

  const loadTabRecords = async (customParams?: any) => {
    setIsLoading(true);
    try {
      if (activeTab === 'asignaciones') {
        const res = await api.getGhAsignaciones(customParams);
        if (res.success) setAsignaciones(res.data);
      } else {
        const res = await api.getGhDevoluciones(customParams);
        if (res.success) setDevoluciones(res.data);
      }
    } catch (e) {
      toast.error('Error al cargar movimientos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params: any = {};
    if (searchId.trim()) params.id = searchId.trim();
    if (searchPersonalId) params.personal_id = searchPersonalId;
    if (fechaInicio) params.fecha_inicio = fechaInicio;
    if (fechaFin) params.fecha_fin = fechaFin;
    loadTabRecords(params);
  };

  const resetSearch = () => {
    setSearchId('');
    setSearchPersonalId('');
    setFechaInicio('');
    setFechaFin('');
    loadTabRecords();
  };

  // Triggered when personal is selected inside the modal
  // Mini-modal para agregar persona rápida
  const [showQuickPersonModal, setShowQuickPersonModal] = useState(false);
  const [quickPerson, setQuickPerson] = useState({ nombre: '', cedula: '', operacion: '', cargo: '', placa: '' });
  const [savingQuickPerson, setSavingQuickPerson] = useState(false);
  const [cargosOptions, setCargosOptions] = useState<{ nombre: string }[]>([]);
  const [cargoSearch, setCargoSearch] = useState('');

  const handleSaveQuickPerson = async () => {
    if (!quickPerson.nombre.trim()) return toast.error('El nombre es requerido');
    if (!quickPerson.cedula.trim()) return toast.error('La cédula es requerida');
    setSavingQuickPerson(true);
    try {
      await api.savePersonal({
        nombre: quickPerson.nombre.trim().toUpperCase(),
        cedula: quickPerson.cedula.trim(),
        cargo: quickPerson.cargo.trim().toUpperCase() || null,
        operacion: quickPerson.operacion.trim().toUpperCase() || null,
        placa: quickPerson.placa.trim().toUpperCase() || null,
        estado: 'EST-01',
        usuarioControl: user.name
      });
      toast.success('Persona registrada correctamente');
      // Recargar solo el select de personal y auto-seleccionar el nuevo
      const pRes = await api.getPersonal();
      const list = Array.isArray(pRes) ? pRes.filter((p: any) => p.estado === 'EST-01') : [];
      setPersonalList(list);
      // Auto-seleccionar el recién creado
      const nuevo = list.find((p: any) => String(p.cedula).trim() === String(quickPerson.cedula).trim());
      if (nuevo) handlePersonalChange(String(nuevo.id));
      setShowQuickPersonModal(false);
      setQuickPerson({ nombre: '', cedula: '', operacion: '', cargo: '', placa: '' });
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar persona');
    } finally {
      setSavingQuickPerson(false);
    }
  };

  const handlePersonalChange = async (personalId: string) => {
    setFormHeader(prev => ({ ...prev, personal_id: personalId }));
    setFormItems([]);
    setSelectedElementId('');
    setSelectedElement(null);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);

    if (activeTab === 'devoluciones' && personalId) {
      try {
        const res = await api.getGhPersonalInventario(personalId);
        if (res.success) {
          setPersonalElementsList(res.data);
        }
      } catch (err) {
        toast.error('Error al obtener inventario del personal.');
      }
    }
  };

  // En edición, lo que ya entregó esta asignación vuelve a estar disponible para ella misma
  const originalDe = (elementoId: any) =>
    editingAsig?.details?.find((d: any) => String(d.elemento_id) === String(elementoId));
  const elementosBodegaOpciones = React.useMemo(() => {
    if (!editingAsig) return elementosBodegaList;
    const lista = elementosBodegaList.map(e => {
      const o = originalDe(e.id);
      return o ? { ...e, stock: Number(e.stock) + Number(o.cantidad) } : e;
    });
    (editingAsig.details || []).forEach((d: any) => {
      if (!lista.some(e => String(e.id) === String(d.elemento_id))) {
        lista.push({ id: d.elemento_id, nombre: d.elemento_nombre, stock: Number(d.cantidad), es_serializado: d.es_serializado });
      }
    });
    return lista;
  }, [elementosBodegaList, editingAsig]);

  // Triggered when element is selected inside the modal
  const handleElementChange = async (elementoId: string) => {
    setSelectedElementId(elementoId);
    setScannedSerials([]);
    setSelectedSerial('');
    setBarcodeInput('');

    if (!elementoId) {
      setSelectedElement(null);
      setAvailableStock(0);
      setAvailableSerials([]);
      return;
    }

    if (activeTab === 'asignaciones') {
      const el = elementosBodegaOpciones.find(e => e.id.toString() === elementoId.toString());
      setSelectedElement(el || null);
      setAvailableStock(el ? el.stock : 0);

      if (el?.es_serializado) {
        try {
          const res = await api.getGhAvailableSerials(elementoId);
          if (res.success) {
            // En edición se suman los seriales que esta misma asignación ya había entregado
            const propios = (originalDe(elementoId)?.serials || [])
              .filter((sr: string) => !res.data.some((x: any) => String(x.serial).toUpperCase() === String(sr).toUpperCase()))
              .map((sr: string) => ({ serial: sr }));
            setAvailableSerials([...res.data, ...propios]);
          }
        } catch (err) {
          toast.error('Error al consultar seriales en bodega.');
        }
      }
    } else {
      const el = personalElementsList.find(e => e.elemento_id.toString() === elementoId.toString());
      setSelectedElement(el ? { id: el.elemento_id, nombre: el.elemento_nombre, es_serializado: el.es_serializado } : null);
      setAvailableStock(el ? el.stock : 0);

      if (el?.es_serializado && formHeader.personal_id) {
        try {
          const res = await api.getGhPersonalSerials(formHeader.personal_id, elementoId);
          if (res.success) {
            setAvailableSerials(res.data);
          }
        } catch (err) {
          toast.error('Error al consultar seriales del personal.');
        }
      }
    }
  };

  const handleAddSerial = (serial: string) => {
    const raw = serial.trim().toUpperCase();
    if (!raw) return;

    if (scannedSerials.includes(raw)) {
      toast.error('El serial ya está adicionado.');
      setBarcodeInput('');
      return;
    }

    // Verify if serial is in the pool of available serials
    const exists = availableSerials.some(s => s.serial.toUpperCase() === raw);
    if (!exists) {
      toast.error(`El serial "${raw}" no está disponible en la lista.`);
      setBarcodeInput('');
      return;
    }

    setScannedSerials(prev => [...prev, raw]);
    setInputCantidad(prev => Math.max(prev, scannedSerials.length + 1));
    setBarcodeInput('');
    setSelectedSerial('');
  };

  const handleRemoveSerial = (serial: string) => {
    setScannedSerials(prev => prev.filter(s => s !== serial));
  };

  // Add Element to detailed form list
  const handleAddElementToForm = async () => {
    if (!selectedElement) {
      toast.error('Seleccione un elemento válido.');
      return;
    }

    if (formItems.some(i => i.elemento_id.toString() === selectedElement.id.toString())) {
      toast.error('Este elemento ya está registrado en la transacción.');
      return;
    }

    const qty = selectedElement.es_serializado ? scannedSerials.length : inputCantidad;
    if (qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0.');
      return;
    }

    if (qty > availableStock) {
      toast.error(`La cantidad excede el stock disponible (${availableStock}).`);
      return;
    }

    if (selectedElement.es_serializado && scannedSerials.length === 0) {
      toast.error('Debe adicionar al menos un serial.');
      return;
    }

    const newItem = {
      elemento_id: selectedElement.id,
      nombre: selectedElement.nombre,
      es_serializado: selectedElement.es_serializado,
      cantidad: qty,
      serials: selectedElement.es_serializado ? [...scannedSerials] : [],
      ...(activeTab === 'devoluciones' ? { destino: 'BODEGA' } : {})
    };

    // If activeTab is asignaciones and personal_id is selected, query last delivery date
    if (activeTab === 'asignaciones' && formHeader.personal_id) {
      const personalObj = personalList.find(p => p.id.toString() === formHeader.personal_id.toString());
      const personalNombre = personalObj?.nombre || 'Colaborador';

      try {
        const [res, invRes] = await Promise.all([
          api.getGhUltimaEntregaElemento(formHeader.personal_id, selectedElement.id, editingAsig?.id),
          api.getGhPersonalInventario(formHeader.personal_id).catch(() => ({ success: false, data: [] })),
        ]);
        // Saldo que ya tiene el colaborador ANTES de esta asignación (en edición se descuenta lo que
        // entregó esta misma asignación y se suma lo que devolvió por reposición)
        const inv = (invRes?.data || []).find((x: any) => String(x.elemento_id) === String(selectedElement.id));
        const orig = editingAsig && String(editingAsig.personal_id) === String(formHeader.personal_id) ? originalDe(selectedElement.id) : null;
        const tenencia = Math.max(0, Number(inv?.stock || 0) - Number(orig?.cantidad || 0) + Number(orig?.cantidad_devuelta || 0));
        let serialesPersona: string[] = [];
        if (tenencia > 0 && selectedElement.es_serializado) {
          try {
            const sr = await api.getGhPersonalSerials(formHeader.personal_id, selectedElement.id);
            const propios = new Set((orig?.serials || []).map((x: string) => String(x).toUpperCase()));
            serialesPersona = (sr?.data || []).map((x: any) => String(x.serial).toUpperCase()).filter((x: string) => !propios.has(x));
            (orig?.serials_devueltos || []).forEach((x: string) => { if (!serialesPersona.includes(x)) serialesPersona.push(x); });
          } catch { /* sin seriales */ }
        }
        if (res.success) {
          const fechaActual = formHeader.fecha || new Date().toISOString().split('T')[0];
          let textoTiempo = '';
          let fechaFormatted = '';
          let numeroAsig = '';
          let cantUlt = 0;

          if (res.hasPrevious && res.data) {
            const calc = calcularTiempoTranscurrido(res.data.fecha, fechaActual);
            textoTiempo = calc.textoCompleto;
            fechaFormatted = calc.fechaFormatted;
            numeroAsig = res.data.numero_asignacion || '';
            cantUlt = res.data.cantidad || 0;
          }

          setUltimaEntregaModal({
            isOpen: true,
            personalNombre,
            elementoNombre: selectedElement.nombre,
            hasPrevious: res.hasPrevious,
            fechaUltima: fechaFormatted,
            numeroAsignacion: numeroAsig,
            cantidadUltima: cantUlt,
            textoTiempo,
            pendingItemToAdd: newItem,
            tenencia,
            serialesPersona,
            reposicion: orig?.reposicion || '',
            cantidadDevuelta: orig?.reposicion && orig?.reposicion !== 'NO_DEVUELVE' ? Number(orig.cantidad_devuelta) : Math.min(tenencia, qty),
            serialsDevueltos: (orig?.serials_devueltos || []).filter(Boolean),
            observacionReposicion: orig?.observacion_reposicion || ''
          });
          return;
        }
      } catch (err) {
        console.error('Error al consultar última entrega:', err);
      }
    }

    // Direct add if no modal or devoluciones
    setFormItems(prev => [...prev, newItem]);
    setSelectedElementId('');
    setSelectedElement(null);
    setInputCantidad(1);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);
  };

  const handleConfirmAddFromUltimaEntrega = () => {
    const m = ultimaEntregaModal;
    if (m.pendingItemToAdd) {
      let item = { ...m.pendingItemToAdd, reposicion: null, cantidad_devuelta: 0, serials_devueltos: [], observacion_reposicion: null };
      if ((m.tenencia || 0) > 0) {
        if (!m.reposicion) {
          toast.error('Indique si el colaborador devuelve el elemento anterior.');
          return;
        }
        if (m.reposicion === 'NO_DEVUELVE') {
          if (!String(m.observacionReposicion || '').trim()) {
            toast.error('Indique por qué no devuelve el elemento anterior.');
            return;
          }
        } else {
          const cant = Number(m.cantidadDevuelta) || 0;
          if (cant < 1 || cant > (m.tenencia || 0)) {
            toast.error(`La cantidad devuelta debe estar entre 1 y ${m.tenencia}.`);
            return;
          }
          if (m.pendingItemToAdd.es_serializado && (m.serialsDevueltos || []).length !== cant) {
            toast.error(`Seleccione los ${cant} serial(es) que devuelve.`);
            return;
          }
        }
        item = {
          ...item,
          reposicion: m.reposicion,
          cantidad_devuelta: m.reposicion === 'NO_DEVUELVE' ? 0 : Number(m.cantidadDevuelta),
          serials_devueltos: m.reposicion === 'NO_DEVUELVE' ? [] : (m.serialsDevueltos || []),
          observacion_reposicion: String(m.observacionReposicion || '').trim() || null
        };
      }
      setFormItems(prev => [...prev, item]);
    }
    setSelectedElementId('');
    setSelectedElement(null);
    setInputCantidad(1);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);
    setUltimaEntregaModal({
      isOpen: false,
      personalNombre: '',
      elementoNombre: '',
      hasPrevious: false,
      fechaUltima: '',
      numeroAsignacion: '',
      cantidadUltima: 0,
      textoTiempo: '',
      pendingItemToAdd: null
    });
  };

  // Abrir la asignación en modo edición con su detalle precargado
  const handleOpenEditModal = (asig: any) => {
    if (!esModificable(asig)) {
      toast.error('Esta asignación ya fue firmada o anulada: no se puede modificar.');
      return;
    }
    setEditingAsig(asig);
    setMotivoEdicion('');
    setFormHeader({
      numero_operacion: asig.numero_asignacion,
      personal_id: String(asig.personal_id),
      autorizado_por: asig.autorizado_por || '',
      motivo: '',
      fecha: String(asig.fecha || '').slice(0, 10),
      observaciones: asig.observaciones || ''
    });
    setFormItems((asig.details || []).map((d: any) => ({
      elemento_id: d.elemento_id,
      nombre: d.elemento_nombre,
      es_serializado: d.es_serializado,
      cantidad: Number(d.cantidad),
      serials: d.es_serializado ? (d.serials || []).filter(Boolean) : [],
      reposicion: d.reposicion || null,
      cantidad_devuelta: Number(d.cantidad_devuelta) || 0,
      serials_devueltos: (d.serials_devueltos || []).filter(Boolean),
      observacion_reposicion: d.observacion_reposicion || null
    })));
    setSelectedElementId('');
    setSelectedElement(null);
    setInputCantidad(1);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);
    setShowModal(true);
  };

  // Anular (eliminación lógica): el servidor devuelve los elementos a bodega y conserva el registro
  const handleConfirmAnular = async () => {
    if (!anularTarget) return;
    if (!motivoAnulacion.trim()) {
      toast.error('Indique el motivo de la anulación.');
      return;
    }
    setAnulando(true);
    try {
      const res = await api.anularGhAsignacion(anularTarget.id, motivoAnulacion.trim());
      if (res.success) {
        toast.success(`Asignación ${anularTarget.numero_asignacion} anulada. Los elementos volvieron a bodega.`);
        setAnularTarget(null);
        loadTabRecords();
      } else {
        toast.error(res.error || 'No se pudo anular la asignación.');
      }
    } catch (err: any) {
      toast.error(err.message || 'No se pudo anular la asignación.', { duration: 8000 });
    } finally {
      setAnulando(false);
    }
  };

  // Open modal and initialize Header
  const handleOpenNewModal = () => {
    setEditingAsig(null);
    setMotivoEdicion('');
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    setFormHeader({
      numero_operacion: activeTab === 'asignaciones' ? `ASIG-${randomNum}` : `DEV-${randomNum}`,
      personal_id: '',
      autorizado_por: '',
      motivo: '',
      fecha: new Date().toISOString().split('T')[0],
      observaciones: ''
    });
    setFormItems([]);
    setSelectedElementId('');
    setSelectedElement(null);
    setInputCantidad(1);
    setAvailableStock(0);
    setAvailableSerials([]);
    setScannedSerials([]);
    setShowModal(true);
  };

  const handleSaveMovement = async () => {
    if (!formHeader.personal_id) {
      toast.error('Seleccione la persona.');
      return;
    }

    if (activeTab === 'asignaciones' && !formHeader.autorizado_por.trim()) {
      toast.error('Indique quién autoriza la asignación.');
      return;
    }

    if (activeTab === 'devoluciones' && !formHeader.motivo.trim()) {
      toast.error('Indique el motivo de la devolución.');
      return;
    }

    if (formItems.length === 0) {
      toast.error('Debe registrar al menos un elemento en el detalle.');
      return;
    }

    setIsSaving(true);
    try {
      if (activeTab === 'asignaciones' && editingAsig) {
        const res = await api.updateGhAsignacion(editingAsig.id, {
          personal_id: formHeader.personal_id,
          autorizado_por: formHeader.autorizado_por.trim(),
          fecha: formHeader.fecha,
          observaciones: formHeader.observaciones,
          items: formItems,
          motivo: motivoEdicion.trim(),
          usuario_control: user.name
        });
        if (res.success) {
          toast.success(`Asignación ${editingAsig.numero_asignacion} actualizada. El inventario se ajustó automáticamente.`);
          setShowModal(false);
          setEditingAsig(null);
          loadTabRecords();
        } else {
          toast.error(res.error || 'Error al editar la asignación.');
        }
      } else if (activeTab === 'asignaciones') {
        const payload = {
          numero_asignacion: formHeader.numero_operacion.trim().toUpperCase(),
          personal_id: formHeader.personal_id,
          autorizado_por: formHeader.autorizado_por.trim(),
          fecha: formHeader.fecha,
          observaciones: formHeader.observaciones,
          items: formItems,
          usuario_control: user.name
        };
        const res = await api.saveGhAsignacion(payload);
        if (res.success) {
          toast.success('Asignación registrada con éxito.');
          const personalSeleccionado = personalList.find(p => p.id.toString() === formHeader.personal_id.toString());
          setShowModal(false);
          loadTabRecords();
          setSignDialog({ isOpen: true, asignacionId: res.data?.id ?? null, personalNombre: personalSeleccionado?.nombre || '', tab: 'asignaciones' });
        } else {
          toast.error(res.error || 'Error al guardar la asignación.');
        }
      } else {
        const payload = {
          numero_devolucion: formHeader.numero_operacion.trim().toUpperCase(),
          personal_id: formHeader.personal_id,
          motivo: formHeader.motivo.trim(),
          fecha: formHeader.fecha,
          items: formItems,
          usuario_control: user.name
        };
        const res = await api.saveGhDevolucion(payload);
        if (res.success) {
          const personalSeleccionado = personalList.find(p => p.id.toString() === formHeader.personal_id.toString());
          setShowModal(false);
          loadTabRecords();
          // If the movement was done by someone else (not the personal), ask for signature
          if (res.data?.firma_estado === 'PENDIENTE') {
            toast.success('Devolución registrada. Firma pendiente del funcionario.');
            setSignDialog({ isOpen: true, asignacionId: res.data?.id ?? null, personalNombre: personalSeleccionado?.nombre || '', tab: 'devoluciones' });
          } else {
            toast.success('Devolución registrada y firmada automáticamente.');
          }
        } else {
          toast.error(res.error || 'Error al guardar la devolución.');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error de conexión.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFirmar = async () => {
    if (!firmaModal.asignacionId || !firmaModal.clave.trim()) {
      toast.error('Ingrese la clave de firma.');
      return;
    }
    setFirmaModal(prev => ({ ...prev, isSigning: true }));
    try {
      const firmarFn = firmaModal.tab === 'devoluciones' ? api.firmarDevolucion : api.firmarAsignacion;
      const res = await firmarFn(firmaModal.asignacionId, {
        clave_firma: firmaModal.clave.trim(),
        firmado_por: user.name,
      });
      if (res.success) {
        toast.success(res.message || 'Firmado exitosamente.');
        setFirmaModal({ isOpen: false, asignacionId: null, personalNombre: '', clave: '', isSigning: false, tab: 'asignaciones' });
        setShowFirmaClave(false);
        loadTabRecords();
      } else {
        toast.warning(res.error || 'Error al firmar.', {
          duration: Infinity,
          action: { label: 'Aceptar', onClick: () => {} },
        });
      }
    } catch (err: any) {
      toast.warning(err.message || 'Error de conexión.', {
        duration: Infinity,
        action: { label: 'Aceptar', onClick: () => {} },
      });
    } finally {
      setFirmaModal(prev => ({ ...prev, isSigning: false }));
    }
  };

  const exportToExcel = () => {
    const records = activeTab === 'asignaciones' ? asignaciones : devoluciones;
    const rows = records.map(r => {
      const base: any = {
        'ID': r.id,
        'Identificador': activeTab === 'asignaciones' ? r.numero_asignacion : r.numero_devolucion,
        'Funcionario': r.personal_nombre || '',
        'Documento': r.personal_documento || '',
        'Fecha Operación': formatDate(r.fecha),
      };
      if (activeTab === 'asignaciones') {
        base['Autorizado Por'] = r.autorizado_por || '';
      } else {
        base['Motivo'] = r.motivo || '';
      }
      base['Registrado Por'] = r.usuario_control || '';
      base['Fecha Registro'] = r.fecha_control ? new Date(r.fecha_control).toLocaleString('es-CO') : '';
      base['Estado Firma'] = r.firma_estado || 'PENDIENTE';
      if (r.numero_asignacion) base['Estado'] = r.estado || 'ACTIVA';
      base['Fecha Firma'] = r.fecha_firma ? new Date(r.fecha_firma).toLocaleDateString('es-CO') : '';
      base['Firmado Por'] = r.firmado_por || '';
      base['Elementos'] = r.details?.map((d: any) => `${d.elemento_nombre} x${d.cantidad}`).join('; ') || '';
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === 'asignaciones' ? 'Asignaciones' : 'Devoluciones');
    XLSX.writeFile(wb, `GH_${activeTab === 'asignaciones' ? 'Asignaciones' : 'Devoluciones'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = async (record: any) => {
    const isAsig = activeTab === 'asignaciones';
    try {
      if (isAsig) {
        await api.downloadAsignacionPDF(record.id);
      } else {
        await api.downloadDevolucionPDF(record.id);
      }
      toast.success('Documento PDF descargado exitosamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al descargar el acta PDF.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 shrink-0">
      
      {/* Header card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <ArrowLeftRight className="text-indigo-600" size={32} />
            Asignación y Devolución
          </h1>
          <p className="text-slate-500 font-bold mt-1">Gestión de activos y devoluciones del personal de la empresa</p>
        </div>
        {canCreate && activeTab !== 'informes' && (
          <button
            onClick={handleOpenNewModal}
            className="px-6 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl text-xs uppercase tracking-wider flex items-center gap-2 group border border-slate-800 active:scale-95"
          >
            <Plus size={16} className="transition-transform group-hover:rotate-90" />
            Nuevo Registro
          </button>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-2">
        <button 
          onClick={() => { setActiveTab('asignaciones'); setViewDetail(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'asignaciones' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <UserCheck size={15} className="text-indigo-500" /> Asignaciones a Personal
        </button>
        <button 
          onClick={() => { setActiveTab('devoluciones'); setViewDetail(null); }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
            activeTab === 'devoluciones' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <UserMinus size={15} className="text-rose-500" /> Devoluciones a Bodega
        </button>
        {canViewAll && (
          <button
            onClick={() => { setActiveTab('informes'); setViewDetail(null); }}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              activeTab === 'informes' ? 'bg-white text-slate-900 shadow-md font-black' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <BarChart3 size={15} className="text-amber-500" /> Informes
          </button>
        )}
      </div>

      {activeTab === 'informes' && <AsignacionInformes personalList={personalList} />}

      {/* Filter panel */}
      {activeTab !== 'informes' && (<>
      <form onSubmit={handleSearch} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Consultar por ID</label>
          <input
            type="number"
            placeholder="Ej: 5"
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Funcionario</label>
          <SearchableSelect
            placeholder="Todos..."
            value={searchPersonalId}
            onChange={val => setSearchPersonalId(val)}
            options={personalList.map(p => ({
              value: p.id,
              label: `${p.nombre} (${p.cedula})`
            }))}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={e => setFechaInicio(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fecha Fin</label>
          <input
            type="date"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-xs uppercase">
            <Search size={14} /> Consultar
          </button>
          <button type="button" onClick={resetSearch} className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-xs uppercase">
            Limpiar
          </button>
        </div>
      </form>

      {/* Main Records List */}
      {activeTab === 'asignaciones' ? (
        <DataTable
          data={canViewAll ? asignaciones : asignaciones.filter(a => (user.document_number || user.documentNumber) && a.personal_documento === (user.document_number || user.documentNumber))}
          columns={asignacionesColumns}
          onRowClick={row => setViewDetail(row)}
          searchPlaceholder="Buscar en asignaciones..."
          excelFileName={`GH_Asignaciones_${new Date().toISOString().split('T')[0]}.xlsx`}
          excelSheetName="Asignaciones"
        />
      ) : (
        <DataTable
          data={canViewAll ? devoluciones : devoluciones.filter(d => (user.document_number || user.documentNumber) && d.personal_documento === (user.document_number || user.documentNumber))}
          columns={devolucionesColumns}
          onRowClick={row => setViewDetail(row)}
          searchPlaceholder="Buscar en devoluciones..."
          excelFileName={`GH_Devoluciones_${new Date().toISOString().split('T')[0]}.xlsx`}
          excelSheetName="Devoluciones"
        />
      )}
      </>)}

      {/* Main Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className={`px-8 py-6 text-white flex justify-between items-center shrink-0 ${activeTab === 'asignaciones' ? 'bg-indigo-600' : 'bg-rose-500'}`}>
              <div className="flex items-center gap-3">
                {activeTab === 'asignaciones' ? (
                  <UserCheck size={26} className="bg-indigo-700/50 p-1 rounded-lg" />
                ) : (
                  <UserMinus size={26} className="bg-rose-600/50 p-1 rounded-lg" />
                )}
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    {activeTab === 'asignaciones' ? (editingAsig ? 'Editar Asignación a Funcionario' : 'Nueva Asignación a Funcionario') : 'Nueva Devolución a Bodega'}
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">{editingAsig ? 'Firma pendiente · el inventario se ajusta automáticamente' : 'Control de Inventario y Activos'}</p>
                </div>
              </div>
              <span className="bg-white/20 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider">
                {formHeader.numero_operacion}
              </span>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto space-y-6 flex-1 max-h-[70vh] custom-scrollbar">
              
              {editingAsig && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
                  <p className="text-xs text-indigo-800 font-semibold">
                    Al guardar, el sistema devuelve a bodega lo que tenía esta asignación y vuelve a entregar lo que quede en el detalle
                    (incluidos los seriales). Si el colaborador ya devolvió algo de esta asignación, el cambio se bloquea para no descuadrar el inventario.
                  </p>
                  <input
                    value={motivoEdicion}
                    onChange={e => setMotivoEdicion(e.target.value)}
                    placeholder="Motivo del cambio (queda en el historial)"
                    aria-label="Motivo del cambio"
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs"
                  />
                </div>
              )}

              {/* Header card form */}
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Funcionario *</label>
                    <button
                      type="button"
                      onClick={() => { setQuickPerson({ nombre: '', cedula: '', operacion: '', cargo: '', placa: '' }); setShowQuickPersonModal(true); }}
                      className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors border border-indigo-100"
                    >
                      <Plus size={10} /> Nueva Persona
                    </button>
                  </div>
                  <SearchableSelect
                    placeholder="Seleccione funcionario..."
                    value={formHeader.personal_id}
                    onChange={handlePersonalChange}
                    options={personalList.map(p => ({
                      value: p.id,
                      label: `${p.nombre} (${p.cedula})`
                    }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha *</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={formHeader.fecha}
                      onChange={e => setFormHeader({ ...formHeader, fecha: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800"
                    />
                  </div>
                </div>

                {activeTab === 'asignaciones' ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Autorizado Por *</label>
                    <input
                      type="text"
                      placeholder="Ej: Gerente Operaciones"
                      value={formHeader.autorizado_por}
                      onChange={e => setFormHeader({ ...formHeader, autorizado_por: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Motivo Devolución *</label>
                    <input
                      type="text"
                      placeholder="Ej: Fin de contrato / Daño"
                      value={formHeader.motivo}
                      onChange={e => setFormHeader({ ...formHeader, motivo: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800"
                    />
                  </div>
                )}

                {activeTab === 'asignaciones' && (
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Observaciones</label>
                    <textarea
                      placeholder="Indique especificaciones de la entrega o estado de los activos..."
                      rows={2}
                      value={formHeader.observaciones}
                      onChange={e => setFormHeader({ ...formHeader, observaciones: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold text-slate-800 resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Add item scratch area */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileSpreadsheet className="text-slate-500" size={14} /> Adicionar Elemento al Detalle
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Elemento *</label>
                    <SearchableSelect
                      placeholder={
                        !formHeader.personal_id 
                          ? 'Seleccione primero el funcionario...' 
                          : activeTab === 'asignaciones' 
                            ? 'Seleccione de Bodega...' 
                            : 'Seleccione de su inventario...'
                      }
                      disabled={!formHeader.personal_id}
                      value={selectedElementId}
                      onChange={handleElementChange}
                      options={
                        activeTab === 'asignaciones'
                          ? elementosBodegaOpciones.map(e => ({
                              value: e.id,
                              label: `${e.nombre} (Disponible: ${e.stock})${e.es_serializado ? ' - [SERIALIZADO]' : ''}`
                            }))
                          : personalElementsList.map(e => ({
                              value: e.elemento_id,
                              label: `${e.elemento_nombre} (Asignado: ${e.stock})${e.es_serializado ? ' - [SERIALIZADO]' : ''}`
                            }))
                      }
                    />
                  </div>

                  {!selectedElement?.es_serializado ? (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                        Cantidad * {availableStock > 0 && <span className="text-[9px] text-slate-400 font-bold uppercase">(Disponible: {availableStock})</span>}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={availableStock}
                        value={inputCantidad}
                        onChange={e => setInputCantidad(Math.max(1, Math.min(availableStock, Number(e.target.value))))}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-black text-slate-900 focus:bg-white"
                      />
                    </div>
                  ) : (
                    <div className="md:col-span-2 space-y-3">
                      
                      {/* Barcode scanner focus panel */}
                      <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1">
                          <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <Barcode size={13} className="animate-pulse" /> Ingreso Rápido por Código de Barras / Serial
                          </label>
                          <input
                            ref={barcodeInputRef}
                            type="text"
                            placeholder="Escanee serial con lector..."
                            value={barcodeInput}
                            onChange={e => setBarcodeInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSerial(barcodeInput);
                              }
                            }}
                            className="w-full px-4 py-2 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 text-xs font-black text-indigo-900 uppercase"
                          />
                        </div>
                        
                        <div className="w-full md:w-56">
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                            Selección Manual de Serial
                          </label>
                          <SearchableSelect
                            placeholder="Seleccione de la lista..."
                            value={selectedSerial}
                            onChange={val => {
                              setSelectedSerial(val);
                              handleAddSerial(val);
                            }}
                            options={availableSerials
                              .filter(s => !scannedSerials.includes(s.serial.toUpperCase()))
                              .map(s => ({
                                value: s.serial,
                                label: s.serial
                              }))}
                          />
                        </div>
                      </div>

                      {/* Display scanned serial badges */}
                      {scannedSerials.length > 0 && (
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
                            <span>Seriales seleccionados ({scannedSerials.length}):</span>
                            <button 
                              type="button" 
                              onClick={() => setScannedSerials([])}
                              className="text-[9px] text-rose-500 underline uppercase"
                            >
                              Limpiar todos
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200/60 custom-scrollbar">
                            {scannedSerials.map((s, idx) => (
                              <span key={idx} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-800 rounded-lg text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                                <Barcode size={10} className="text-slate-400" />
                                {s}
                                <button 
                                  onClick={() => handleRemoveSerial(s)}
                                  type="button" 
                                  className="text-rose-500 hover:text-rose-700 font-bold ml-0.5"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!selectedElement?.es_serializado && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddElementToForm}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-white ${activeTab === 'asignaciones' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-500 hover:bg-rose-600'}`}
                      >
                        <Plus size={14} /> Adicionar
                      </button>
                    </div>
                  )}
                </div>

                {selectedElement?.es_serializado && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleAddElementToForm}
                      className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-white ${activeTab === 'asignaciones' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-500 hover:bg-rose-600'}`}
                    >
                      <Plus size={14} /> Adicionar Elemento ({scannedSerials.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Form detailed items list table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="text-emerald-500" size={15} /> Detalle de la Transacción
                </h4>
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs font-semibold text-slate-600">
                    <thead>
                      <tr className="bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest">
                        <th className="p-4 pl-6 w-16">Item</th>
                        <th className="p-4">Elemento</th>
                        <th className="p-4 text-center">Cantidad</th>
                        <th className="p-4">Seriales</th>
                        <th className="p-4">{activeTab === 'asignaciones' ? 'Elemento anterior' : 'Destino'}</th>
                        <th className="p-4 text-right pr-6 w-24">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-wide">
                            Ningún elemento adicionado aún.
                          </td>
                        </tr>
                      ) : (
                        formItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="p-4 pl-6 text-slate-400 font-bold">#{idx + 1}</td>
                            <td className="p-4 font-black text-slate-800">{item.nombre}</td>
                            <td className="p-4 text-center font-black text-slate-900 bg-slate-50/50">{item.cantidad}</td>
                            <td className="p-4">
                              {item.es_serializado ? (
                                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 custom-scrollbar">
                                  {item.serials.map((s: string, sIdx: number) => (
                                    <span key={sIdx} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-md text-[9px] font-black tracking-wider uppercase flex items-center gap-1">
                                      <Barcode size={8} /> {s}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 uppercase font-black">No Serializado</span>
                              )}
                            </td>
                            <td className="p-4">
                              {activeTab === 'asignaciones' ? (
                                <ReposicionBadge item={item} />
                              ) : (
                                <div className="w-52">
                                  <SearchableSelect
                                    placeholder="Destino"
                                    value={item.destino || 'BODEGA'}
                                    onChange={val => setFormItems(formItems.map((it, i) => i === idx ? { ...it, destino: val } : it))}
                                    options={[
                                      { value: 'BODEGA', label: 'A bodega (reutilizable)' },
                                      { value: 'BAJA', label: 'Para baja (deteriorado)' }
                                    ]}
                                  />
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-right pr-6">
                              <button
                                type="button"
                                onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-6 py-3.5 bg-slate-200 text-slate-700 font-black rounded-2xl hover:bg-slate-300 transition-all text-xs uppercase tracking-wider"
              >
                Cancelar
              </button>
              
              <button
                type="button"
                onClick={handleSaveMovement}
                disabled={isSaving || formItems.length === 0}
                className={`px-8 py-3.5 text-white font-black rounded-2xl shadow-lg transition-all text-xs uppercase tracking-wider flex items-center gap-2 ${
                  isSaving || formItems.length === 0 
                    ? 'bg-slate-300 shadow-none cursor-not-allowed text-slate-400' 
                    : activeTab === 'asignaciones' 
                      ? 'bg-indigo-600 hover:bg-indigo-700' 
                      : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> {editingAsig ? 'Guardar Cambios' : 'Confirmar Movimiento'}
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Diálogo: Firmar ahora o después */}
      {signDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-indigo-600 px-6 py-5 text-white flex items-center gap-3">
              <PenLine size={22} className="bg-indigo-700/50 p-1 rounded-lg shrink-0" />
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">Firma de Asignación</h3>
                <p className="text-[11px] text-indigo-200 font-bold mt-0.5">Asignación creada — estado PENDIENTE DE FIRMA</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 font-semibold">
                ¿Desea que <span className="text-indigo-600 font-black">{signDialog.personalNombre}</span> firme ahora?
              </p>
              <p className="text-xs text-slate-500">
                El funcionario debe tener firma digital registrada y aprobada. Se requiere su clave de firma personal.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setSignDialog({ isOpen: false, asignacionId: null, personalNombre: '', tab: 'asignaciones' })}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all text-xs uppercase tracking-wider"
                >
                  Firmar Después
                </button>
                <button
                  onClick={() => {
                    setSignDialog({ isOpen: false, asignacionId: null, personalNombre: '', tab: 'asignaciones' });
                    setFirmaModal({ isOpen: true, asignacionId: signDialog.asignacionId, personalNombre: signDialog.personalNombre, clave: '', isSigning: false, tab: signDialog.tab });
                  }}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <PenLine size={13} /> Firmar Ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ingresar clave de firma */}
      {firmaModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center gap-3">
              <KeyRound size={22} className="bg-white/10 p-1 rounded-lg shrink-0" />
              <div>
                <h3 className="font-black text-base uppercase tracking-tight">Validar Firma Digital</h3>
                <p className="text-[11px] text-slate-300 font-bold mt-0.5">
                  Firma de: <span className="text-white">{firmaModal.personalNombre}</span>
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  Clave de Firma de {firmaModal.personalNombre} *
                </label>
                <div className="relative">
                  <input
                    type={showFirmaClave ? 'text' : 'password'}
                    autoFocus
                    placeholder="••••••••"
                    value={firmaModal.clave}
                    onChange={e => setFirmaModal(prev => ({ ...prev, clave: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleFirmar(); }}
                    className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold text-slate-800 tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirmaClave(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
                  >
                    {showFirmaClave ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <KeyRound size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 font-semibold">
                  Esta es la <strong>clave de firma digital</strong>, diferente a la clave de inicio de sesión. Si no la recuerda, contacte al administrador.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setFirmaModal({ isOpen: false, asignacionId: null, personalNombre: '', clave: '', isSigning: false, tab: 'asignaciones' }); setShowFirmaClave(false); }}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl transition-all text-xs uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFirmar}
                  disabled={firmaModal.isSigning || !firmaModal.clave.trim()}
                  className={`flex-1 py-3 px-4 font-black rounded-2xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 text-white ${
                    firmaModal.isSigning || !firmaModal.clave.trim()
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-slate-900 hover:bg-slate-700'
                  }`}
                >
                  {firmaModal.isSigning ? (
                    <><RefreshCw size={13} className="animate-spin" /> Firmando...</>
                  ) : (
                    <><ShieldCheck size={13} /> Confirmar Firma</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {viewDetail && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-8 py-6 text-white flex justify-between items-center shrink-0 ${activeTab === 'asignaciones' ? 'bg-indigo-600' : 'bg-rose-500'}`}>
              <div className="flex items-center gap-3">
                <FileText size={24} />
                <div>
                  <h3 className="font-black text-lg tracking-tight uppercase">
                    Detalle de {activeTab === 'asignaciones' ? 'Asignación' : 'Devolución'}
                  </h3>
                  <p className="text-[11px] text-white/80 font-bold uppercase mt-0.5">#{viewDetail.id} - {viewDetail.numero_asignacion || viewDetail.numero_devolucion}</p>
                </div>
              </div>
              <button onClick={() => { setViewDetail(null); setHistorial(null); }} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-sm transition-all">
                ×
              </button>
            </div>
            <div className="p-8 overflow-y-auto space-y-6 max-h-[75vh] custom-scrollbar">
              <DetalleEncabezado d={viewDetail} esAsig={!!viewDetail.numero_asignacion} />
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Detalle del movimiento ({viewDetail.details?.length || 0} elemento(s) · {(viewDetail.details || []).reduce((a: number, d: any) => a + Number(d.cantidad || 0), 0)} und):</h4>
                <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs font-semibold text-slate-600">
                    <thead>
                      <tr className="bg-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest border-b border-slate-200">
                        <th className="p-3 pl-5">Elemento</th>
                        <th className="p-3 text-center">Cantidad</th>
                        <th className="p-3">Seriales</th>
                        <th className="p-3">{viewDetail.numero_asignacion ? 'Elemento anterior' : 'Destino'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDetail.details?.map((det: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-b-0">
                          <td className="p-3 pl-5 font-bold text-slate-800">{det.elemento_nombre}</td>
                          <td className="p-3 text-center font-black text-slate-900">{det.cantidad}</td>
                          <td className="p-3">
                            {det.es_serializado ? (
                              <div className="flex flex-wrap gap-1.5">
                                {det.serials?.map((s: string, sIdx: number) => (
                                  <span key={sIdx} className={`px-2 py-0.5 border rounded-lg text-[9px] font-black tracking-wider uppercase flex items-center gap-1 ${activeTab === 'asignaciones' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                    <Barcode size={9} /> {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 uppercase font-black">N/A (No Serializado)</span>
                            )}
                          </td>
                          <td className="p-3">
                            {viewDetail.numero_asignacion ? (
                              <ReposicionBadge item={det} />
                            ) : (
                              <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${det.destino === 'BAJA' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                {det.destino === 'BAJA' ? 'Para baja' : 'A bodega'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {viewDetail.estado === 'ANULADA' && (
                <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-300 flex items-start gap-2">
                  <Ban size={14} className="text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Anulada</div>
                    <p className="text-xs text-slate-700 font-medium mt-0.5">
                      {viewDetail.motivo_anulacion} · {viewDetail.anulada_por}{viewDetail.fecha_anulacion ? ` · ${new Date(viewDetail.fecha_anulacion).toLocaleString()}` : ''}
                    </p>
                  </div>
                </div>
              )}
              {viewDetail.numero_asignacion && (viewDetail.estado === 'ANULADA' || viewDetail.editada_por) && (
                <div>
                  {historial === null ? (
                    <button
                      onClick={async () => {
                        try { const r = await api.getGhHistorialAsignacion(viewDetail.id); setHistorial(r.data || []); }
                        catch { toast.error('No se pudo cargar el historial.'); }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-600"
                    >
                      <History size={12} /> Ver historial de cambios
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historial de cambios</h4>
                      {historial.length === 0 && <p className="text-xs text-slate-400">Sin cambios registrados.</p>}
                      {historial.map((h: any) => (
                        <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3 text-xs">
                          <div className="flex justify-between gap-2 font-bold text-slate-700">
                            <span>{h.accion === 'ANULACION' ? 'Anulación' : 'Edición'} · {h.usuario}</span>
                            <span className="text-slate-400 font-medium">{new Date(h.fecha).toLocaleString()}</span>
                          </div>
                          {h.motivo && <p className="text-slate-600 mt-1">Motivo: {h.motivo}</p>}
                          <p className="text-slate-500 mt-1">
                            Antes: {(h.datos_antes?.items || []).map((i: any) => `${i.nombre} ×${i.cantidad}`).join(', ') || '—'}
                          </p>
                          {h.datos_despues && (
                            <p className="text-slate-500">
                              Después: {(h.datos_despues.items || []).map((i: any) => `${i.nombre} ×${i.cantidad}`).join(', ') || '—'}
                              {h.datos_antes?.personal_id !== h.datos_despues.personal_id ? ` · Funcionario: ${h.datos_antes?.personal_nombre} → ${h.datos_despues.personal_nombre}` : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {viewDetail.observaciones && (
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 flex items-start gap-2 shadow-sm">
                  <MessageSquare size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Observaciones:</div>
                    <p className="text-xs text-slate-700 font-medium mt-0.5">{viewDetail.observaciones}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anular asignación */}
      {anularTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center"><Trash2 size={18} className="text-rose-600" /></div>
              <div>
                <h3 className="font-black text-slate-900 uppercase text-sm">Anular asignación {anularTarget.numero_asignacion}</h3>
                <p className="text-[11px] text-slate-500">{anularTarget.personal_nombre}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Los elementos vuelven a bodega y los seriales quedan disponibles. El registro <b>no se borra</b>: queda como
              anulado con su detalle e historial. Si el colaborador ya devolvió algo de esta asignación, la anulación se bloquea.
            </p>
            <textarea
              value={motivoAnulacion}
              onChange={e => setMotivoAnulacion(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Motivo de la anulación *"
              aria-label="Motivo de la anulación"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setAnularTarget(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-500">Cancelar</button>
              <button onClick={handleConfirmAnular} disabled={anulando || !motivoAnulacion.trim()}
                className="flex-[2] py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase disabled:opacity-40 flex items-center justify-center gap-2">
                {anulando ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />} Anular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Person Modal */}
      {showQuickPersonModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Users size={16} className="text-indigo-600" />
                </div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Nueva Persona</h3>
              </div>
              <button
                onClick={() => setShowQuickPersonModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Nombre *</label>
                <input
                  type="text"
                  value={quickPerson.nombre}
                  onChange={e => setQuickPerson(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Nombre completo"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cédula *</label>
                <input
                  type="text"
                  value={quickPerson.cedula}
                  onChange={e => setQuickPerson(p => ({ ...p, cedula: e.target.value }))}
                  placeholder="Número de cédula"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Operación</label>
                <input
                  type="text"
                  value={quickPerson.operacion}
                  onChange={e => setQuickPerson(p => ({ ...p, operacion: e.target.value }))}
                  placeholder="Ej: LOGISTICA"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-400 transition-all"
                />
              </div>
              <div className="relative">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cargo</label>
                <input
                  type="text"
                  value={cargoSearch || quickPerson.cargo}
                  onChange={e => { setCargoSearch(e.target.value); if (!e.target.value) setQuickPerson(p => ({ ...p, cargo: '' })); }}
                  onFocus={() => setCargoSearch('')}
                  placeholder={quickPerson.cargo || 'Buscar cargo...'}
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-400 transition-all"
                />
                {cargoSearch.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto">
                    {cargosOptions
                      .filter(c => c.nombre.toLowerCase().includes(cargoSearch.toLowerCase()))
                      .map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => { setQuickPerson(p => ({ ...p, cargo: c.nombre })); setCargoSearch(''); }}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                        >
                          {c.nombre}
                        </button>
                      ))}
                    {cargosOptions.filter(c => c.nombre.toLowerCase().includes(cargoSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400">Sin resultados</div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Placa</label>
                <input
                  type="text"
                  value={quickPerson.placa}
                  onChange={e => setQuickPerson(p => ({ ...p, placa: e.target.value }))}
                  placeholder="Ej: ABC123"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <button
                onClick={() => setShowQuickPersonModal(false)}
                disabled={savingQuickPerson}
                className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-600 font-black rounded-xl text-xs uppercase tracking-wider hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveQuickPerson}
                disabled={savingQuickPerson}
                className="flex-1 py-2.5 px-4 bg-indigo-600 text-white font-black rounded-xl text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingQuickPerson ? (
                  <><RefreshCw size={12} className="animate-spin" /> Guardando...</>
                ) : (
                  <><UserCheck size={12} /> Guardar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog: Notificación / Validación de Última Entrega de Dotación */}
      {ultimaEntregaModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full max-h-[92vh] overflow-y-auto transform animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className={`p-5 text-white flex items-center gap-3 ${ultimaEntregaModal.hasPrevious ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-gradient-to-r from-indigo-600 to-blue-600'}`}>
              <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white">
                <Clock size={24} />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">Validación de Entrega Previa</h3>
                <p className="text-[11px] font-medium text-white/80">Gestión Humana - Historial por Artículo</p>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Colaborador</div>
                <div className="text-sm font-black text-slate-900">{ultimaEntregaModal.personalNombre}</div>
                <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest pt-1">Artículo / Ítem</div>
                <div className="text-xs font-bold text-slate-800">{ultimaEntregaModal.elementoNombre}</div>
              </div>

              {!ultimaEntregaModal.hasPrevious ? (
                /* Caso A: NUNCA se ha entregado este artículo previamente */
                <div className="bg-indigo-50/80 border-2 border-indigo-200 text-indigo-950 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                  <CheckCircle2 size={22} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wide text-indigo-900">Primera Entrega de este Artículo</h4>
                    <p className="text-xs font-medium text-indigo-800 leading-relaxed">
                      Es la <strong className="font-black text-indigo-950">primera vez</strong> que se entrega este artículo a este colaborador. No existen registros de entregas previas para este ítem.
                    </p>
                  </div>
                </div>
              ) : (
                /* Caso B: YA se ha entregado este artículo previamente */
                <div className="bg-amber-50/90 border-2 border-amber-200/90 text-amber-950 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-amber-200/60 pb-2">
                    <Clock size={18} className="text-amber-600 shrink-0" />
                    <h4 className="text-xs font-black uppercase tracking-wide text-amber-900">Historial de Entrega del Artículo</h4>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-800 font-bold">Fecha de última entrega:</span>
                      <span className="font-black text-amber-950 bg-amber-100 px-2.5 py-0.5 rounded-lg text-xs border border-amber-300">{ultimaEntregaModal.fechaUltima}</span>
                    </div>

                    <div className="flex justify-between items-center bg-amber-100/70 p-2.5 rounded-xl border border-amber-200">
                      <span className="text-amber-900 font-bold">Tiempo transcurrido:</span>
                      <span className="font-black text-amber-950 text-xs uppercase tracking-tight">{ultimaEntregaModal.textoTiempo}</span>
                    </div>

                    {ultimaEntregaModal.numeroAsignacion && (
                      <div className="flex justify-between items-center pt-1 text-[11px] text-amber-800 font-medium">
                        <span>Asignación previa: <strong>#{ultimaEntregaModal.numeroAsignacion}</strong></span>
                        {ultimaEntregaModal.cantidadUltima > 0 && (
                          <span>Cant: <strong>{ultimaEntregaModal.cantidadUltima} und(s)</strong></span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {(ultimaEntregaModal.tenencia || 0) > 0 && (
              <div className="px-6 pb-5 space-y-3">
                <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-3.5 space-y-3">
                  <div className="text-xs font-black uppercase tracking-wide text-rose-900">
                    El colaborador ya tiene {ultimaEntregaModal.tenencia} und(s) de este elemento
                  </div>
                  <p className="text-[11px] text-rose-800 font-medium leading-relaxed">
                    ¿Devuelve el elemento anterior? Si lo devuelve, se descuenta de su saldo en la misma operación y no se infla su inventario.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      ['BODEGA', 'Devuelve a bodega', 'En buen estado: vuelve al stock de bodega.'],
                      ['BAJA', 'Devuelve para baja', 'Deteriorado: sale del inventario (no vuelve a bodega).'],
                      ['NO_DEVUELVE', 'No devuelve', 'Se acumula en su saldo. Indique el motivo.'],
                    ] as const).map(([val, label, desc]) => (
                      <label key={val} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${ultimaEntregaModal.reposicion === val ? 'bg-white border-slate-900 shadow-sm' : 'bg-white/60 border-rose-200 hover:bg-white'}`}>
                        <input type="radio" name="reposicion" className="mt-0.5" checked={ultimaEntregaModal.reposicion === val}
                          onChange={() => setUltimaEntregaModal(prev => ({ ...prev, reposicion: val }))} />
                        <span>
                          <span className="block text-xs font-black text-slate-900">{label}</span>
                          <span className="block text-[10px] text-slate-500 font-medium">{desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {(ultimaEntregaModal.reposicion === 'BODEGA' || ultimaEntregaModal.reposicion === 'BAJA') && (
                    ultimaEntregaModal.pendingItemToAdd?.es_serializado ? (
                      <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Seriales que devuelve</div>
                        {(ultimaEntregaModal.serialesPersona || []).length === 0 ? (
                          <p className="text-[11px] text-slate-500">No hay seriales registrados a su nombre para este elemento.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {(ultimaEntregaModal.serialesPersona || []).map(sr => {
                              const sel = (ultimaEntregaModal.serialsDevueltos || []).includes(sr);
                              return (
                                <button key={sr} type="button"
                                  onClick={() => setUltimaEntregaModal(prev => {
                                    const list = sel ? (prev.serialsDevueltos || []).filter(x => x !== sr) : [...(prev.serialsDevueltos || []), sr];
                                    return { ...prev, serialsDevueltos: list, cantidadDevuelta: list.length };
                                  })}
                                  className={`px-2 py-1 rounded-lg border text-[10px] font-black flex items-center gap-1 ${sel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>
                                  <Barcode size={10} /> {sr}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Cantidad que devuelve (máx. {ultimaEntregaModal.tenencia})</div>
                        <input type="number" min={1} max={ultimaEntregaModal.tenencia}
                          value={ultimaEntregaModal.cantidadDevuelta ?? 1}
                          onChange={e => setUltimaEntregaModal(prev => ({ ...prev, cantidadDevuelta: Math.max(1, Math.min(prev.tenencia || 1, Number(e.target.value))) }))}
                          className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black" />
                      </div>
                    )
                  )}

                  {ultimaEntregaModal.reposicion && (
                    <div>
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                        Observación {ultimaEntregaModal.reposicion === 'NO_DEVUELVE' ? '*' : '(opcional)'}
                      </div>
                      <textarea rows={2} value={ultimaEntregaModal.observacionReposicion || ''}
                        onChange={e => setUltimaEntregaModal(prev => ({ ...prev, observacionReposicion: e.target.value }))}
                        placeholder={ultimaEntregaModal.reposicion === 'NO_DEVUELVE' ? 'Ej: lo perdió, lo conserva para cambio de turno...' : 'Estado del elemento devuelto...'}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium resize-none" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Action Button */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setUltimaEntregaModal(prev => ({ ...prev, isOpen: false, pendingItemToAdd: null }))}
                className="py-3 px-5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded-xl text-xs uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAddFromUltimaEntrega}
                className="flex-1 py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} className="text-emerald-400" />
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AsignacionDevolucion;
