import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileCheck, Upload, Search, AlertTriangle, Loader2, X, Plus, Lock, Download,
  Truck, Package, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { api } from '../../services/api';
import { User as UserType } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface LegalizacionesDicorpProps { user: UserType; }

interface ConsolidadoRow {
  placa: string; fecha: string; conductor_nombre: string; cargues: number; cargue_numeros: string;
  valor_total: string | number; pagado_individual: string | number; pagado_pool: string | number; pendiente: string | number;
  pagado_grupal: string | number; sobrecosto_aprobado: string | number; sobrecosto_pendiente: string | number;
  devolucion_total: string | number; tipo_descuadre: string | null; comentario_descuadre: string | null;
  banco_reciente: string | null; fecha_consignacion_reciente: string | null;
}
interface Encabezado {
  id: number; cargue_numero: string; fecha: string; placa: string; conductor_nombre: string;
  valor_total: string | number; kilos_total: string | number; pedidos_total: number; estado: string;
  pagado_individual: string | number; pagos_individuales_count: number;
}
interface DetalleRow {
  id: number; pedido_sap: string; nombre_cliente: string | null; codigo_cliente: string | null;
  ciudad: string | null; kilos: string | number; valor: string | number;
}
interface PagoIndividual {
  id: number; id_detalle: number; placa: string; banco: string | null; comprobante: string;
  valor: string | number; fecha_pago: string | null; metodo_pago: string; observacion: string | null; usuario: string | null;
  anulado?: boolean; anulado_motivo?: string | null; anulado_por?: string | null; anulado_at?: string | null;
}
interface PagoGrupal {
  id: number; placa: string; banco: string | null; comprobante: string; valor: string | number;
  fecha_pago: string | null; metodo_pago: string; observacion: string | null; usuario: string | null;
  anulado?: boolean; anulado_motivo?: string | null; anulado_por?: string | null; anulado_at?: string | null;
}
interface Sobrecosto {
  id: number; placa: string; id_encabezado: number | null; valor: string | number; referencia: string | null;
  fecha: string | null; tipo: string; status: string; observaciones: string | null; usuario: string | null;
  anulado?: boolean; anulado_motivo?: string | null; anulado_por?: string | null; anulado_at?: string | null;
}
interface Devolucion {
  id: number; placa: string; valor: string | number; fecha: string | null; observacion: string | null; usuario: string | null;
  anulado?: boolean; anulado_motivo?: string | null; anulado_por?: string | null; anulado_at?: string | null;
}
interface MasterRecord { id: string; category: string; name: string; }
interface DuplicadoInfo {
  tipo: 'individual' | 'grupal'; id: number; cargue_numero: string | null; pedido_sap: string | null;
  nombre_cliente: string | null; ciudad: string | null; placa: string;
  banco: string | null; metodo_pago: string | null; observacion: string | null;
  valor: string | number; fecha_pago: string | null; created_at: string | null; usuario: string | null;
}

const fmtCOP = (v: any) => `$${Math.round(Number(v) || 0).toLocaleString('es-CO')}`;
const fmtKilos = (v: any) => (Number(v) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const fmtDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
};
// Fecha de hoy en Colombia (UTC-5) — límite máximo para los campos de fecha de pago.
const todayCO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const fmtDateTime = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
};

const Metric: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className={`flex flex-col items-center px-3 py-2 rounded-xl ${color}`}>
    <span className="text-[9px] font-black uppercase tracking-widest opacity-70 leading-none mb-0.5">{label}</span>
    <span className="text-sm font-black leading-none">{value}</span>
  </div>
);

const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-cyan-500 transition-all";
const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";

interface IndividualFormData { bancoId: string; comprobante: string; valor: string; fechaPago: string; metodoPagoId: string; observacion: string; }
const DEFAULT_BANCO_ID = 'BANCO-BANCOLOMBIA';
const DEFAULT_METODO_PAGO_ID = 'MPAGO-CONSIGNACION';
const EMPTY_IND_FORM: IndividualFormData = { bancoId: DEFAULT_BANCO_ID, comprobante: '', valor: '', fechaPago: '', metodoPagoId: DEFAULT_METODO_PAGO_ID, observacion: '' };

// Formulario de pago individual por PEDIDO (factura) — estado propio para no chocar entre filas expandidas.
const IndividualPagoForm: React.FC<{
  pedido: DetalleRow;
  pagos: PagoIndividual[];
  bancos: MasterRecord[];
  metodosPago: MasterRecord[];
  onSave: (idDetalle: number, data: IndividualFormData) => Promise<boolean>;
  onAlert: (title: string, message: string) => void;
  onAnular: (tipo: 'individual', id: number, label: string) => void;
}> = ({ pedido, pagos, bancos, metodosPago, onSave, onAlert, onAnular }) => {
  const [form, setForm] = useState<IndividualFormData>(EMPTY_IND_FORM);
  const [saving, setSaving] = useState(false);

  const pagadoPrevio = pagos.filter(p => !p.anulado).reduce((s, p) => s + Number(p.valor), 0);
  const saldoDisponible = Math.max(0, Number(pedido.valor) - pagadoPrevio);

  const submit = async () => {
    const valorNum = Number(form.valor) || 0;
    if (valorNum <= 0) { onAlert('Valor no válido', 'Ingresa un valor mayor a cero para registrar el pago.'); return; }
    if (valorNum > saldoDisponible + 1) {
      onAlert('El valor supera el saldo pendiente', `El pedido ${pedido.pedido_sap} tiene un saldo pendiente de ${fmtCOP(saldoDisponible)}. El valor ingresado no puede superar ese monto.`);
      return;
    }
    if (!form.comprobante.trim()) { onAlert('Comprobante requerido', 'Ingresa el número de comprobante de la consignación o transferencia.'); return; }
    if (!form.fechaPago) { onAlert('Fecha requerida', 'Ingresa la fecha del pago.'); return; }
    if (form.fechaPago > todayCO()) { onAlert('Fecha inválida', 'La fecha de pago no puede ser posterior al día de hoy.'); return; }
    setSaving(true);
    const ok = await onSave(pedido.id, form);
    setSaving(false);
    if (ok) setForm(EMPTY_IND_FORM);
  };

  return (
    <div className="px-4 py-4 bg-slate-50/70 space-y-3">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Saldo pendiente del pedido: <span className="text-slate-700">{fmtCOP(saldoDisponible)}</span></p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Banco</label>
          <select className={inputCls} value={form.bancoId} onChange={e => setForm(f => ({ ...f, bancoId: e.target.value }))}>
            {bancos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Comprobante *</label><input className={inputCls} value={form.comprobante} onChange={e => setForm(f => ({ ...f, comprobante: e.target.value }))} /></div>
        <div><label className={labelCls}>Método</label>
          <select className={inputCls} value={form.metodoPagoId} onChange={e => setForm(f => ({ ...f, metodoPagoId: e.target.value }))}>
            {metodosPago.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Valor</label>
          <input type="number" max={saldoDisponible} min={0} className={inputCls} value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
        </div>
        <div><label className={labelCls}>Fecha</label><input type="date" max={todayCO()} className={inputCls} value={form.fechaPago} onChange={e => setForm(f => ({ ...f, fechaPago: e.target.value }))} /></div>
        <div><label className={labelCls}>Observación</label><input className={inputCls} value={form.observacion} onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))} /></div>
      </div>
      <button onClick={submit} disabled={saving || saldoDisponible <= 0}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Registrar Pago
      </button>
      {pagos.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-[10px] text-left">
            <thead className="bg-slate-100 text-slate-500 uppercase font-black"><tr><th className="px-3 py-1.5">Comprobante</th><th className="px-3 py-1.5">Banco</th><th className="px-3 py-1.5">Fecha</th><th className="px-3 py-1.5 text-right">Valor</th><th></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pagos.map(p => (
                <tr key={p.id} className={p.anulado ? 'opacity-50' : ''}>
                  <td className={`px-3 py-1.5 font-mono ${p.anulado ? 'line-through' : ''}`}>{p.comprobante}</td>
                  <td className="px-3 py-1.5">{p.banco || '—'}</td>
                  <td className="px-3 py-1.5">{fmtDate(p.fecha_pago)}</td>
                  <td className={`px-3 py-1.5 text-right font-black text-emerald-700 ${p.anulado ? 'line-through' : ''}`}>{fmtCOP(p.valor)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {p.anulado ? (
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-rose-100 text-rose-700" title={p.anulado_motivo || ''}>Anulado</span>
                    ) : (
                      <button onClick={() => onAnular('individual', p.id, `Comprobante ${p.comprobante} — ${fmtCOP(p.valor)}`)}
                        className="text-rose-500 hover:text-rose-700 font-black text-[9px] uppercase">Anular</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const LegalizacionesDicorp: React.FC<LegalizacionesDicorpProps> = ({ user }) => {
  const [tab, setTab] = useState<'pendientes' | 'cerrados'>('pendientes');

  // ── Catálogos maestros compartidos (bancos / métodos de pago) ────────────
  const [bancos, setBancos] = useState<MasterRecord[]>([]);
  const [metodosPago, setMetodosPago] = useState<MasterRecord[]>([]);
  useEffect(() => {
    api.getGenericMasters().then((rows: MasterRecord[]) => {
      if (!Array.isArray(rows)) return;
      setBancos(rows.filter(r => r.category === 'bancos').sort((a, b) => a.name.localeCompare(b.name)));
      setMetodosPago(rows.filter(r => r.category === 'metodos_pago').sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(err => console.error(err));
  }, []);

  // ── Anulación (con motivo obligatorio) de pagos individuales/grupales/sobrecostos/devoluciones ──
  const [anularTarget, setAnularTarget] = useState<{ tipo: 'individual' | 'grupal' | 'sobrecosto' | 'devolucion'; id: number; label: string } | null>(null);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);

  // ── PENDIENTES: consolidado por placa+fecha ──────────────────────────────
  const [consolidado, setConsolidado] = useState<ConsolidadoRow[]>([]);
  const [loadingConsolidado, setLoadingConsolidado] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConsolidado = useCallback(async () => {
    setLoadingConsolidado(true);
    try {
      const res = await api.getDicorpConsolidadoPendientes();
      if (res.success) setConsolidado(res.data);
    } catch (err: any) {
      toast.error(`Error al cargar pendientes: ${err.message || err}`);
    } finally { setLoadingConsolidado(false); }
  }, []);

  useEffect(() => { if (tab === 'pendientes') loadConsolidado(); }, [tab, loadConsolidado]);

  // ── CERRADOS: gateado por filtros ────────────────────────────────────────
  const [filtros, setFiltros] = useState({ from: '', to: '', placa: '', conductor: '' });
  const [buscado, setBuscado] = useState(false);
  const [cerrados, setCerrados] = useState<Encabezado[]>([]);
  const [loadingCerrados, setLoadingCerrados] = useState(false);

  const buscarCerrados = async () => {
    setLoadingCerrados(true);
    setBuscado(true);
    try {
      const res = await api.getDicorpEncabezados({
        estado: 'cerrados',
        from: filtros.from || undefined,
        to: filtros.to || undefined,
        search: filtros.placa || filtros.conductor || undefined,
      });
      if (res.success) setCerrados(res.data);
    } catch (err: any) {
      toast.error(`Error al buscar: ${err.message || err}`);
    } finally { setLoadingCerrados(false); }
  };

  // ── KPIs generales ────────────────────────────────────────────────────────
  const totalPlacas = consolidado.length;
  const totalValor = consolidado.reduce((s, r) => s + Number(r.valor_total), 0);
  const totalPendiente = consolidado.reduce((s, r) => s + Number(r.pendiente), 0);
  const totalPagado = totalValor - totalPendiente;
  const fechasPresentes = [...new Set(consolidado.map(r => r.fecha))].sort().reverse();

  // ── Upload con previsualización previa — modo "nuevo" bloquea cualquier duplicado,
  // modo "editar" permite corregir cargues ya cargados pero SIEMPRE protege los ya legalizados.
  const [previewing, setPreviewing] = useState(false);
  const [uploadMode, setUploadMode] = useState<'nuevo' | 'editar'>('nuevo');
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [previewData, setPreviewData] = useState<{
    cargues: Array<{
      cargue: string; fecha: string; placa: string | null; conductor: string | null;
      pedidos: number; pedidosNuevos: number; pedidosExistentes: number; valorTotal: number;
      yaExiste: boolean; estadoActual: string | null; uploadedBy: string | null; uploadedAt: string | null;
    }>;
    resumen: {
      totalCargues: number; carguesNuevos: number; carguesExistentes: number;
      pedidosNuevos: number; pedidosExistentes: number; valorTotal: number; esDuplicadoExacto: boolean;
      hayConflictos: boolean; hayLegalizados: boolean;
    };
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const handleUploadClick = () => { setUploadMode('nuevo'); fileInputRef.current?.click(); };
  const handleEditClick = () => { setUploadMode('editar'); editFileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewing(true);
    try {
      const res = await api.previewDicorpEntregas(file);
      if (res.success) { setPreviewData(res); setPreviewFile(file); }
      else setAlertInfo({
        title: 'El archivo no tiene el formato esperado',
        message: (res.error || 'No se pudo analizar el archivo.') + ' Verifica que sea el Excel de entregas de Dicorp (debe incluir la columna "Pedido SAP" y una columna de Fecha válida).',
      });
    } catch (err: any) {
      setAlertInfo({ title: 'Error al analizar el archivo', message: err.message || String(err) });
    } finally {
      setPreviewing(false);
      e.target.value = '';
    }
  };

  const cancelUpload = () => { setPreviewData(null); setPreviewFile(null); };

  const confirmUpload = async () => {
    if (!previewFile) return;
    setUploading(true);
    try {
      const res = await api.uploadDicorpEntregas(previewFile, uploadMode);
      if (res.success) {
        const partes = [`${res.encabezadosNuevos} cargues nuevos`, `${res.detallesInsertados} pedidos nuevos`];
        if (res.detallesActualizados) partes.push(`${res.detallesActualizados} actualizados`);
        if (res.carguesOmitidosLegalizados?.length) partes.push(`${res.carguesOmitidosLegalizados.length} cargue(s) ya legalizados protegidos sin tocar`);
        toast.success(`Información guardada: ${partes.join(', ')}.`);
        setPreviewData(null); setPreviewFile(null);
        loadConsolidado();
      } else if (res.duplicados) {
        setAlertInfo({ title: 'Información ya cargada', message: res.error || 'Ya existe información para uno o más cargues de este archivo. Usa "Editar Información Cargada" para corregirla.' });
      } else setAlertInfo({ title: 'No se pudo procesar el archivo', message: res.error || 'Ocurrió un error al procesar el archivo.' });
    } catch (err: any) {
      toast.error(`Error al subir el archivo: ${err.message || err}`);
    } finally { setUploading(false); }
  };

  // ── Modal placa+fecha (individual / grupal / sobrecosto) ─────────────────
  const [selectedGroup, setSelectedGroup] = useState<ConsolidadoRow | null>(null);
  const [modalTab, setModalTab] = useState<'individual' | 'grupal' | 'sobrecosto' | 'devolucion'>('individual');
  const [cargues, setCargues] = useState<Encabezado[]>([]);
  const [pedidos, setPedidos] = useState<DetalleRow[]>([]);
  const [loadingCargues, setLoadingCargues] = useState(false);
  const [pagosIndividuales, setPagosIndividuales] = useState<Record<number, PagoIndividual[]>>({});
  const [pagosGrupales, setPagosGrupales] = useState<PagoGrupal[]>([]);
  const [sobrecostos, setSobrecostos] = useState<Sobrecosto[]>([]);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);

  const [duplicado, setDuplicado] = useState<DuplicadoInfo[] | null>(null);
  const [alertInfo, setAlertInfo] = useState<{ title: string; message: string } | null>(null);
  const confirmedRefs = useRef<Set<string>>(new Set());
  const pendingIndividualRef = useRef<{ idDetalle: number; data: IndividualFormData } | null>(null);

  // Refresca las cards del listado (y las cifras del modal abierto) sin necesidad de cerrarlo — estilo AJAX.
  const refreshAfterChange = useCallback(async () => {
    try {
      const res = await api.getDicorpConsolidadoPendientes();
      if (res.success) {
        setConsolidado(res.data);
        setSelectedGroup(prev => {
          if (!prev) return prev;
          const updated = res.data.find((r: ConsolidadoRow) => r.placa === prev.placa && r.fecha === prev.fecha);
          return updated || prev;
        });
      }
    } catch (err) { console.error(err); }
  }, []);

  const loadGroupDetail = async (row: ConsolidadoRow) => {
    setLoadingCargues(true);
    try {
      const encRes = await api.getDicorpEncabezados({ placa: row.placa, from: row.fecha, to: row.fecha });
      const encRows: Encabezado[] = encRes.success ? encRes.data : [];
      setCargues(encRows);

      const allPedidos: DetalleRow[] = [];
      const pagosMap: Record<number, PagoIndividual[]> = {};
      let grupales: PagoGrupal[] = [];
      let sob: Sobrecosto[] = [];
      let devs: Devolucion[] = [];
      for (const enc of encRows) {
        const det = await api.getDicorpEncabezadoDetalle(enc.id);
        if (det.success) {
          allPedidos.push(...det.detalle);
          (det.pagosIndividuales as PagoIndividual[]).forEach(p => {
            if (!pagosMap[p.id_detalle]) pagosMap[p.id_detalle] = [];
            pagosMap[p.id_detalle].push(p);
          });
          grupales = det.pagosGrupales;
          sob = det.sobrecostos;
          devs = det.devoluciones;
        }
      }
      setPedidos(allPedidos);
      setPagosIndividuales(pagosMap);
      setPagosGrupales(grupales);
      setSobrecostos(sob);
      setDevoluciones(devs);
    } catch (err: any) {
      toast.error(`Error al cargar el detalle: ${err.message || err}`);
    } finally { setLoadingCargues(false); }
  };

  const openGroup = (row: ConsolidadoRow) => {
    setSelectedGroup(row);
    setModalTab('individual');
    setDuplicado(null);
    setEditingSobId(null);
    setFormSob(EMPTY_SOB_FORM);
    setFormDevo({ valor: '', fecha: '', observacion: '' });
    loadGroupDetail(row);
  };

  const closeGroupModal = () => {
    setSelectedGroup(null); setEditingSobId(null); setFormSob(EMPTY_SOB_FORM);
    setFormDevo({ valor: '', fecha: '', observacion: '' }); loadConsolidado();
  };

  // ── Formularios de captura ──────────────────────────────────────────────
  const [formGru, setFormGru] = useState({ bancoId: DEFAULT_BANCO_ID, comprobante: '', valor: '', fechaPago: '', metodoPagoId: DEFAULT_METODO_PAGO_ID, observacion: '' });
  const [formSob, setFormSob] = useState({ idEncabezado: '', valor: '', referencia: '', fecha: '', tipo: 'EFECTIVO', observaciones: '' });
  const [editingSobId, setEditingSobId] = useState<number | null>(null);
  const EMPTY_SOB_FORM = { idEncabezado: '', valor: '', referencia: '', fecha: '', tipo: 'EFECTIVO', observaciones: '' };

  const startEditSobrecosto = (s: Sobrecosto) => {
    setEditingSobId(s.id);
    setFormSob({
      idEncabezado: s.id_encabezado ? String(s.id_encabezado) : '',
      valor: s.valor != null ? String(s.valor) : '',
      referencia: s.referencia || '',
      fecha: s.fecha ? s.fecha.slice(0, 10) : '',
      tipo: s.tipo || 'EFECTIVO',
      observaciones: s.observaciones || '',
    });
  };
  const cancelEditSobrecosto = () => { setEditingSobId(null); setFormSob(EMPTY_SOB_FORM); };
  const [savingGru, setSavingGru] = useState(false);
  const [savingSob, setSavingSob] = useState(false);

  const doSaveIndividual = async (idDetalle: number, data: IndividualFormData): Promise<boolean> => {
    try {
      const res = await api.saveDicorpPagoIndividual({
        idDetalle, bancoId: data.bancoId || undefined, comprobante: data.comprobante.trim(),
        valor: Number(data.valor) || 0, fechaPago: data.fechaPago || undefined,
        metodoPagoId: data.metodoPagoId, observacion: data.observacion || undefined,
      });
      if (res.success) {
        toast.success('Pago individual registrado.');
        if (selectedGroup) loadGroupDetail(selectedGroup);
        refreshAfterChange();
        return true;
      }
      if (res.duplicado) { setDuplicado(res.duplicado); pendingIndividualRef.current = { idDetalle, data }; return false; }
      setAlertInfo({ title: 'No se pudo guardar el pago', message: res.error || 'Ocurrió un error al guardar el pago.' });
      return false;
    } catch (err: any) { setAlertInfo({ title: 'Error', message: err.message || String(err) }); return false; }
  };

  const trySaveIndividual = async (idDetalle: number, data: IndividualFormData): Promise<boolean> => {
    const ref = data.comprobante.trim();
    if (!ref) { setAlertInfo({ title: 'Comprobante requerido', message: 'Ingresa el número de comprobante de la consignación o transferencia.' }); return false; }
    if (!confirmedRefs.current.has(`individual:${ref.toUpperCase()}`)) {
      try {
        const chk = await api.checkDicorpComprobante(ref);
        if (chk.success && chk.exists) {
          setDuplicado(chk.data);
          pendingIndividualRef.current = { idDetalle, data };
          return false;
        }
      } catch (err) { console.error(err); }
    }
    return doSaveIndividual(idDetalle, data);
  };

  const handleSaveGrupal = async () => {
    if (!selectedGroup) return;
    const ref = formGru.comprobante.trim();
    if (!ref) { setAlertInfo({ title: 'Comprobante requerido', message: 'Ingresa el número de comprobante de la consignación o transferencia.' }); return; }
    if (!formGru.valor || Number(formGru.valor) <= 0) { setAlertInfo({ title: 'Valor requerido', message: 'Ingresa el valor del pago grupal.' }); return; }
    if (!formGru.fechaPago) { setAlertInfo({ title: 'Fecha requerida', message: 'Ingresa la fecha del pago.' }); return; }
    if (formGru.fechaPago > todayCO()) { setAlertInfo({ title: 'Fecha inválida', message: 'La fecha de pago no puede ser posterior al día de hoy.' }); return; }
    if (!confirmedRefs.current.has(`grupal:${ref.toUpperCase()}`)) {
      try {
        const chk = await api.checkDicorpComprobante(ref);
        if (chk.success && chk.exists) { setDuplicado(chk.data); return; }
      } catch (err) { console.error(err); }
    }
    setSavingGru(true);
    try {
      const res = await api.saveDicorpPagoGrupal({
        placa: selectedGroup.placa, bancoId: formGru.bancoId || undefined, comprobante: formGru.comprobante.trim(),
        valor: Number(formGru.valor) || 0, fechaPago: formGru.fechaPago || undefined,
        metodoPagoId: formGru.metodoPagoId, observacion: formGru.observacion || undefined,
      });
      if (res.success) {
        toast.success(`Consignación grupal registrada para la placa ${selectedGroup.placa}.`);
        setFormGru({ bancoId: DEFAULT_BANCO_ID, comprobante: '', valor: '', fechaPago: '', metodoPagoId: DEFAULT_METODO_PAGO_ID, observacion: '' });
        loadGroupDetail(selectedGroup);
        refreshAfterChange();
      } else if (res.duplicado) setDuplicado(res.duplicado);
      else setAlertInfo({ title: 'No se pudo guardar el pago grupal', message: res.error || 'Ocurrió un error al guardar el pago.' });
    } catch (err: any) { setAlertInfo({ title: 'Error', message: err.message || String(err) }); }
    finally { setSavingGru(false); }
  };

  const handleSaveSobrecosto = async () => {
    if (!selectedGroup) return;
    if (!formSob.valor || Number(formSob.valor) <= 0) { setAlertInfo({ title: 'Valor requerido', message: 'Ingresa el valor del sobrecosto.' }); return; }
    if (!formSob.fecha) { setAlertInfo({ title: 'Fecha requerida', message: 'Ingresa la fecha del sobrecosto.' }); return; }
    if (formSob.fecha > todayCO()) { setAlertInfo({ title: 'Fecha inválida', message: 'La fecha no puede ser posterior al día de hoy.' }); return; }
    setSavingSob(true);
    try {
      const payload = {
        idEncabezado: formSob.idEncabezado ? Number(formSob.idEncabezado) : undefined,
        valor: Number(formSob.valor), referencia: formSob.referencia || undefined, fecha: formSob.fecha,
        tipo: formSob.tipo, observaciones: formSob.observaciones || undefined,
      };
      const res = editingSobId
        ? await api.updateDicorpSobrecosto(editingSobId, payload)
        : await api.saveDicorpSobrecosto({ placa: selectedGroup.placa, ...payload });
      if (res.success) {
        toast.success(editingSobId ? 'Sobrecosto actualizado.' : 'Sobrecosto registrado — queda pendiente de aprobación.');
        setFormSob(EMPTY_SOB_FORM);
        setEditingSobId(null);
        loadGroupDetail(selectedGroup);
        refreshAfterChange();
      } else setAlertInfo({ title: 'No se pudo guardar el sobrecosto', message: res.error || 'Ocurrió un error al guardar el sobrecosto.' });
    } catch (err: any) { toast.error(`Error: ${err.message || err}`); }
    finally { setSavingSob(false); }
  };

  const handleAprobarSobrecosto = async (id: number) => {
    try {
      const res = await api.aprobarDicorpSobrecosto(id);
      if (res.success) {
        toast.success('Sobrecosto aprobado.');
        if (selectedGroup) loadGroupDetail(selectedGroup);
        refreshAfterChange();
      } else setAlertInfo({ title: 'No se pudo aprobar', message: res.error || 'Ocurrió un error al aprobar el sobrecosto.' });
    } catch (err: any) { setAlertInfo({ title: 'Error', message: err.message || String(err) }); }
  };

  const [formDevo, setFormDevo] = useState({ valor: '', fecha: '', observacion: '' });
  const [savingDevo, setSavingDevo] = useState(false);
  const handleSaveDevolucion = async () => {
    if (!selectedGroup) return;
    if (!formDevo.valor || Number(formDevo.valor) <= 0) { setAlertInfo({ title: 'Valor requerido', message: 'Ingresa el valor de la devolución.' }); return; }
    if (!formDevo.fecha) { setAlertInfo({ title: 'Fecha requerida', message: 'Ingresa la fecha de la devolución.' }); return; }
    if (formDevo.fecha > todayCO()) { setAlertInfo({ title: 'Fecha inválida', message: 'La fecha no puede ser posterior al día de hoy.' }); return; }
    setSavingDevo(true);
    try {
      const res = await api.saveDicorpDevolucion({
        placa: selectedGroup.placa, valor: Number(formDevo.valor), fecha: formDevo.fecha, observacion: formDevo.observacion || undefined,
      });
      if (res.success) {
        toast.success(`Devolución registrada para la placa ${selectedGroup.placa}.`);
        setFormDevo({ valor: '', fecha: '', observacion: '' });
        loadGroupDetail(selectedGroup);
        refreshAfterChange();
      } else setAlertInfo({ title: 'No se pudo guardar la devolución', message: res.error || 'Ocurrió un error al guardar la devolución.' });
    } catch (err: any) { toast.error(`Error: ${err.message || err}`); }
    finally { setSavingDevo(false); }
  };

  const confirmAnular = async () => {
    if (!anularTarget) return;
    if (!anularMotivo.trim()) { setAlertInfo({ title: 'Motivo requerido', message: 'Debes indicar el motivo de la anulación para conservar el histórico.' }); return; }
    setAnulando(true);
    try {
      const { tipo, id } = anularTarget;
      const res = tipo === 'individual' ? await api.anularDicorpPagoIndividual(id, anularMotivo.trim())
        : tipo === 'grupal' ? await api.anularDicorpPagoGrupal(id, anularMotivo.trim())
        : tipo === 'sobrecosto' ? await api.anularDicorpSobrecosto(id, anularMotivo.trim())
        : await api.anularDicorpDevolucion(id, anularMotivo.trim());
      if (res.success) {
        toast.success('Registro anulado — el histórico queda visible en el detalle.');
        setAnularTarget(null); setAnularMotivo('');
        if (selectedGroup) loadGroupDetail(selectedGroup);
        refreshAfterChange();
      } else setAlertInfo({ title: 'No se pudo anular', message: res.error || 'Ocurrió un error al anular el registro.' });
    } catch (err: any) { setAlertInfo({ title: 'Error', message: err.message || String(err) }); }
    finally { setAnulando(false); }
  };

  const handleCancelDuplicate = () => {
    setDuplicado(null);
    pendingIndividualRef.current = null;
    toast.info('Registra un número de comprobante diferente.');
  };
  const handleConfirmDuplicate = () => {
    setDuplicado(null);
    toast.success('Comprobante confirmado — se guardará de todas formas.');
    if (pendingIndividualRef.current) {
      const { idDetalle, data } = pendingIndividualRef.current;
      confirmedRefs.current.add(`individual:${data.comprobante.trim().toUpperCase()}`);
      pendingIndividualRef.current = null;
      doSaveIndividual(idDetalle, data);
    } else if (formGru.comprobante.trim()) {
      confirmedRefs.current.add(`grupal:${formGru.comprobante.trim().toUpperCase()}`);
      handleSaveGrupal();
    }
  };

  // ── Cerrar placa del día ──────────────────────────────────────────────────
  const [warnClose, setWarnClose] = useState<ConsolidadoRow | null>(null);
  const [confirmClose, setConfirmClose] = useState<ConsolidadoRow | null>(null);
  const [closing, setClosing] = useState(false);
  const [tipoDescuadreCierre, setTipoDescuadreCierre] = useState('');
  const [comentarioDescuadreCierre, setComentarioDescuadreCierre] = useState('');

  const requestCerrarPlaca = (row: ConsolidadoRow) => {
    setTipoDescuadreCierre(''); setComentarioDescuadreCierre('');
    if (Number(row.pendiente) > 1) setWarnClose(row);
    else setConfirmClose(row);
  };

  const doCerrarPlaca = async (row: ConsolidadoRow) => {
    if (Number(row.pendiente) > 1 && !tipoDescuadreCierre) {
      setAlertInfo({ title: 'Tipo de descuadre requerido', message: 'Indica si el saldo pendiente corresponde a efectivo o mercancía antes de cerrar la placa.' });
      return;
    }
    setClosing(true);
    try {
      const res = await api.cerrarDicorpPlacaDia({
        placa: row.placa, fecha: row.fecha,
        tipoDescuadre: tipoDescuadreCierre || undefined, comentarioDescuadre: comentarioDescuadreCierre || undefined,
      });
      if (res.success) {
        toast.success(`Placa ${row.placa} cerrada — ${res.cargues_cerrados} factura(s) legalizada(s) administrativamente.`);
        setWarnClose(null); setConfirmClose(null);
        loadConsolidado();
      } else setAlertInfo({ title: 'No se pudo cerrar la placa', message: res.error || 'Ocurrió un error al cerrar la placa.' });
    } catch (err: any) { toast.error(`Error: ${err.message || err}`); }
    finally { setClosing(false); }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  // Fila con el mismo orden de columnas que la planilla física de liquidación de Dicorp,
  // + una columna final con todas las observaciones de esa placa/fecha concatenadas.
  const consolidadoExportRow = (r: ConsolidadoRow, observaciones: string) => ({
    'Fecha': r.fecha,
    'Placa': r.placa,
    'Nombre Conductor': r.conductor_nombre,
    'No Planilla': r.cargue_numeros,
    'Valor Total Planilla': Number(r.valor_total),
    'Banco': r.banco_reciente || '',
    'Valor Consignación': Number(r.pagado_individual) + Number(r.pagado_grupal),
    'Fecha Consignación': r.fecha_consignacion_reciente || '',
    'Valor Devolución': Number(r.devolucion_total),
    'Sobrecostos': Number(r.sobrecosto_aprobado),
    'Valor de Descuadre': Number(r.pendiente),
    'Tipo de Descuadre Efectivo / Mercancía': r.tipo_descuadre || '',
    'Observaciones': observaciones || '',
  });

  const safeSheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Hoja';

  // Aplica formato de pesos colombianos ($ #.##0) a las columnas numéricas indicadas (0-based),
  // desde la fila de datos `startRow` (0-based) durante `rowCount` filas.
  const applyCurrencyFormat = (ws: XLSX.WorkSheet, colIndexes: number[], startRow: number, rowCount: number) => {
    for (let r = startRow; r < startRow + rowCount; r++) {
      for (const c of colIndexes) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = '"$"#,##0';
      }
    }
  };

  // Trae, para una placa+fecha: (1) el detalle de pedidos del viaje y (2) el registro de cada
  // movimiento de legalización (individual, grupal, sobrecosto, devolución) con sus observaciones.
  const fetchPlacaExportData = async (row: ConsolidadoRow): Promise<{
    pedidos: Array<Record<string, any>>; movimientos: Array<Record<string, any>>; observacionesConcat: string;
  }> => {
    const encRes = await api.getDicorpEncabezados({ placa: row.placa, from: row.fecha, to: row.fecha });
    const encRows: Encabezado[] = encRes.success ? encRes.data : [];
    const pedidos: Array<Record<string, any>> = [];
    const movimientos: Array<Record<string, any>> = [];
    const obsList: string[] = [];
    let grupalesCargadas = false, sobrecostosCargados = false, devolucionesCargadas = false;

    for (const enc of encRows) {
      const det = await api.getDicorpEncabezadoDetalle(enc.id);
      if (!det.success) continue;

      for (const p of det.detalle as DetalleRow[]) {
        const pagos = (det.pagosIndividuales as PagoIndividual[]).filter(pi => pi.id_detalle === p.id);
        pedidos.push({
          Cargue: enc.cargue_numero, 'Pedido SAP': p.pedido_sap, Cliente: p.nombre_cliente || p.codigo_cliente || '',
          Ciudad: p.ciudad || '', Valor: Number(p.valor), Pagado: pagos.filter(pi => !pi.anulado).reduce((s, pi) => s + Number(pi.valor), 0),
        });
        for (const pi of pagos) {
          movimientos.push({
            Tipo: 'Individual', Referencia: `Cargue ${enc.cargue_numero} · Pedido ${p.pedido_sap}`, Fecha: pi.fecha_pago || '',
            Banco: pi.banco || '', 'Comprobante/Ref': pi.comprobante, Valor: Number(pi.valor), Estado: pi.anulado ? 'ANULADO' : '',
            Observación: pi.anulado ? `${pi.observacion || ''} [ANULADO: ${pi.anulado_motivo || ''}]`.trim() : (pi.observacion || ''), Usuario: pi.usuario || '',
          });
          if (pi.anulado) obsList.push(`Individual ANULADO: ${pi.anulado_motivo || ''}`);
          else if (pi.observacion) obsList.push(`Individual: ${pi.observacion}`);
        }
      }

      // Grupal, sobrecostos y devoluciones son por PLACA (no por cargue) — solo se cargan una vez.
      if (!grupalesCargadas) {
        for (const pg of det.pagosGrupales as PagoGrupal[]) {
          movimientos.push({
            Tipo: 'Grupal', Referencia: `Placa ${row.placa}`, Fecha: pg.fecha_pago || '',
            Banco: pg.banco || '', 'Comprobante/Ref': pg.comprobante, Valor: Number(pg.valor), Estado: pg.anulado ? 'ANULADO' : '',
            Observación: pg.anulado ? `${pg.observacion || ''} [ANULADO: ${pg.anulado_motivo || ''}]`.trim() : (pg.observacion || ''), Usuario: pg.usuario || '',
          });
          if (pg.anulado) obsList.push(`Grupal ANULADO: ${pg.anulado_motivo || ''}`);
          else if (pg.observacion) obsList.push(`Grupal: ${pg.observacion}`);
        }
        grupalesCargadas = true;
      }
      if (!sobrecostosCargados) {
        for (const s of det.sobrecostos as Sobrecosto[]) {
          movimientos.push({
            Tipo: 'Sobrecosto', Referencia: `Placa ${row.placa} (${s.tipo})`, Fecha: s.fecha || '',
            Banco: '', 'Comprobante/Ref': s.referencia || '', Valor: Number(s.valor), Estado: s.anulado ? 'ANULADO' : s.status,
            Observación: s.anulado ? `${s.observaciones || ''} [ANULADO: ${s.anulado_motivo || ''}]`.trim() : (s.observaciones || ''), Usuario: s.usuario || '',
          });
          if (s.anulado) obsList.push(`Sobrecosto ANULADO: ${s.anulado_motivo || ''}`);
          else if (s.observaciones) obsList.push(`Sobrecosto (${s.status}): ${s.observaciones}`);
        }
        sobrecostosCargados = true;
      }
      if (!devolucionesCargadas) {
        for (const dv of (det.devoluciones || []) as Devolucion[]) {
          movimientos.push({
            Tipo: 'Devolución', Referencia: `Placa ${row.placa}`, Fecha: dv.fecha || '',
            Banco: '', 'Comprobante/Ref': '', Valor: Number(dv.valor), Estado: dv.anulado ? 'ANULADO' : '',
            Observación: dv.anulado ? `${dv.observacion || ''} [ANULADO: ${dv.anulado_motivo || ''}]`.trim() : (dv.observacion || ''), Usuario: dv.usuario || '',
          });
          if (dv.anulado) obsList.push(`Devolución ANULADA: ${dv.anulado_motivo || ''}`);
          else if (dv.observacion) obsList.push(`Devolución: ${dv.observacion}`);
        }
        devolucionesCargadas = true;
      }
    }

    if (row.comentario_descuadre) obsList.push(`Tipo de Descuadre (${row.tipo_descuadre || ''}): ${row.comentario_descuadre}`);

    return { pedidos, movimientos, observacionesConcat: obsList.join(' | ') };
  };

  // Columnas monetarias (0-based) de cada tabla según el orden de sus encabezados.
  const CONSOLIDADO_MONEY_COLS = [4, 6, 8, 9, 10]; // Valor Total Planilla, Valor Consignación, Valor Devolución, Sobrecostos, Valor de Descuadre
  const PEDIDOS_MONEY_COLS = [4, 5]; // Valor, Pagado
  const MOVIMIENTOS_MONEY_COLS = [5]; // Valor

  // Arma la hoja de una placa con DOS tablas: Detalle del Viaje y Legalizaciones (movimientos).
  const buildPlacaSheet = (pedidos: Array<Record<string, any>>, movimientos: Array<Record<string, any>>): XLSX.WorkSheet => {
    const ws = XLSX.utils.aoa_to_sheet([['DETALLE DEL VIAJE']]);
    XLSX.utils.sheet_add_json(ws, pedidos, { origin: 'A2' });
    applyCurrencyFormat(ws, PEDIDOS_MONEY_COLS, 2, pedidos.length);

    const movTitleRow = 2 + pedidos.length + 2; // título + encabezado + datos + fila en blanco
    XLSX.utils.sheet_add_aoa(ws, [['LEGALIZACIONES (MOVIMIENTOS)']], { origin: { r: movTitleRow, c: 0 } });
    XLSX.utils.sheet_add_json(ws, movimientos, { origin: { r: movTitleRow + 1, c: 0 } });
    applyCurrencyFormat(ws, MOVIMIENTOS_MONEY_COLS, movTitleRow + 2, movimientos.length);
    return ws;
  };

  const [exportingGeneral, setExportingGeneral] = useState(false);
  const exportGeneral = async () => {
    setExportingGeneral(true);
    try {
      await exportConsolidadoRows(consolidado, `legalizacion_dicorp_pendientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      toast.error(`Error al exportar: ${err.message || err}`);
    } finally { setExportingGeneral(false); }
  };

  const exportPlaca = async (row: ConsolidadoRow) => {
    try {
      await exportConsolidadoRows([row], `dicorp_${row.placa}_${row.fecha}.xlsx`);
    } catch (err: any) {
      toast.error(`Error al exportar: ${err.message || err}`);
    }
  };

  // Construye el libro Excel: hoja "Consolidado" (con observaciones concatenadas al final) +
  // una hoja por placa con sus dos tablas (viaje + legalizaciones) — con formato de pesos.
  const exportConsolidadoRows = async (rows: ConsolidadoRow[], filename: string) => {
    const wb = XLSX.utils.book_new();
    const placaData = await Promise.all(rows.map(row => fetchPlacaExportData(row)));

    const consolidadoRows = rows.map((row, i) => consolidadoExportRow(row, placaData[i].observacionesConcat));
    const wsConsolidado = XLSX.utils.json_to_sheet(consolidadoRows);
    applyCurrencyFormat(wsConsolidado, CONSOLIDADO_MONEY_COLS, 1, rows.length);
    XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado');

    rows.forEach((row, i) => {
      const wsPlaca = buildPlacaSheet(placaData[i].pedidos, placaData[i].movimientos);
      XLSX.utils.book_append_sheet(wb, wsPlaca, safeSheetName(`${row.placa}_${row.fecha}`));
    });

    XLSX.writeFile(wb, filename);
  };

  const [exportingPorFecha, setExportingPorFecha] = useState(false);
  const exportPorFecha = async () => {
    if (!filtros.from || !filtros.to) {
      setAlertInfo({ title: 'Fechas requeridas', message: 'Selecciona "Desde" y "Hasta" para exportar la legalización de esas fechas (incluye pendientes y cerradas).' });
      return;
    }
    setExportingPorFecha(true);
    try {
      const res = await api.getDicorpConsolidadoPorFecha({
        from: filtros.from, to: filtros.to,
        placa: filtros.placa || undefined, conductor: filtros.conductor || undefined,
      });
      if (!res.success) { setAlertInfo({ title: 'No se pudo exportar', message: res.error || 'Ocurrió un error.' }); return; }
      if (!res.data.length) { setAlertInfo({ title: 'Sin resultados', message: 'No hay legalizaciones (pendientes o cerradas) para ese rango de fechas.' }); return; }
      await exportConsolidadoRows(res.data, `legalizacion_dicorp_${filtros.from}_a_${filtros.to}.xlsx`);
    } catch (err: any) {
      toast.error(`Error al exportar: ${err.message || err}`);
    } finally { setExportingPorFecha(false); }
  };

  const cerradosColumns: ColumnDef<Encabezado>[] = [
    { header: 'Cargue #', key: 'cargue_numero', sortable: true, render: r => <span className="font-mono font-black text-slate-900">{r.cargue_numero}</span> },
    { header: 'Fecha', key: 'fecha', sortable: true, render: r => <span className="text-slate-500 font-bold">{fmtDate(r.fecha)}</span> },
    { header: 'Placa', key: 'placa', sortable: true, render: r => <span className="font-mono font-black text-slate-900">{r.placa}</span> },
    { header: 'Conductor', key: 'conductor_nombre', sortable: true },
    { header: 'Pedidos', key: 'pedidos_total', sortable: true },
    { header: 'Kilos', key: 'kilos_total', sortable: true, render: r => fmtKilos(r.kilos_total) },
    { header: 'Valor', key: 'valor_total', sortable: true, render: r => <span className="font-black text-slate-900">{fmtCOP(r.valor_total)}</span> },
    { header: 'Pagado Ind.', key: 'pagado_individual', sortable: true, render: r => <span className="font-black text-emerald-700">{fmtCOP(r.pagado_individual)}</span> },
    { header: 'Estado', key: 'estado', sortable: true, render: r => <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-700">{r.estado}</span> },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
      <input ref={editFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 pt-5 pb-0 flex-shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Legalización Dicorp</h2>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                Consignaciones individuales, grupales y sobrecostos por placa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleEditClick} disabled={previewing}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-amber-300 hover:text-amber-700 disabled:opacity-60 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95"
              title="Corrige información de cargues ya cargados que quedaron mal — los cargues ya legalizados nunca se tocan">
              Editar Información Cargada
            </button>
            <button onClick={handleUploadClick} disabled={previewing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-cyan-600 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow transition-all active:scale-95">
              {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {previewing ? 'Analizando...' : 'Cargar Excel de Entregas'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {([{ id: 'pendientes', label: 'Pendientes', icon: '⏳', badge: totalPlacas }, { id: 'cerrados', label: 'Cerrados', icon: '✅', badge: 0 }] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-wide border-b-2 transition-all
                ${tab === t.id ? 'border-cyan-500 text-cyan-700 bg-cyan-50/60' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <span>{t.icon}</span>{t.label}
              {t.badge > 0 && <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pendientes' ? (
        <div className="flex-1 p-6 space-y-5">
          {/* Cards generales (por fecha) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3" />Fechas Activas</p>
              <p className="text-xl font-black text-slate-900 mt-1">{fechasPresentes.length}</p>
              <p className="text-[9px] text-slate-400 font-bold mt-0.5">{fechasPresentes.slice(0, 3).map(fmtDate).join(' · ')}</p>
            </div>
            <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Total</p>
              <p className="text-xl font-black text-slate-900 mt-1">{fmtCOP(totalValor)}</p>
            </div>
            <div className="bg-white rounded-2xl border-2 border-emerald-100 p-4 bg-emerald-50/40">
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Pagado</p>
              <p className="text-xl font-black text-emerald-700 mt-1">{fmtCOP(totalPagado)}</p>
            </div>
            <div className="bg-white rounded-2xl border-2 border-amber-100 p-4 bg-amber-50/40">
              <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Pendiente</p>
              <p className="text-xl font-black text-amber-700 mt-1">{fmtCOP(totalPendiente)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Consolidado por placa y fecha</h3>
            <button onClick={exportGeneral} disabled={!consolidado.length || exportingGeneral}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-xl disabled:opacity-40">
              {exportingGeneral ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} {exportingGeneral ? 'Exportando...' : 'Exportar General'}
            </button>
          </div>

          {/* Cards individuales por placa+fecha */}
          {loadingConsolidado ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
          ) : consolidado.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2">
              <Package className="w-10 h-10 text-slate-300" />
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">No hay legalizaciones pendientes</p>
              <p className="text-[10px] text-slate-400">Carga un Excel de entregas para comenzar</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {consolidado.map(row => {
                const pct = Number(row.valor_total) > 0 ? Math.min(100, Math.round(((Number(row.pagado_individual) + Number(row.pagado_pool)) / Number(row.valor_total)) * 100)) : 0;
                return (
                  <div key={`${row.placa}-${row.fecha}`} className="rounded-2xl border-2 border-slate-100 bg-white overflow-hidden hover:border-slate-200 transition-all">
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-none flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-slate-400" />{row.placa}
                          </p>
                          <p className="text-[9px] text-slate-500 font-bold mt-1">👤 {row.conductor_nombre} · 📅 {fmtDate(row.fecha)}</p>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">No. Planilla: <span className="font-mono text-slate-600">{row.cargue_numeros}</span></p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-slate-900 leading-none">{row.cargues}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">cargue{row.cargues !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[8px] font-black text-emerald-700 shrink-0">{pct}% pagado</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                          <p className="text-[7px] font-black text-slate-400 uppercase">Total</p>
                          <p className="text-[10px] font-black text-slate-800">{fmtCOP(row.valor_total)}</p>
                        </div>
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-2 py-1.5">
                          <p className="text-[7px] font-black text-emerald-600 uppercase">Pagado</p>
                          <p className="text-[10px] font-black text-emerald-800">{fmtCOP(Number(row.pagado_individual) + Number(row.pagado_pool))}</p>
                        </div>
                        <div className={`border rounded-xl px-2 py-1.5 ${Number(row.pendiente) > 1 ? 'bg-amber-500 border-amber-600' : 'bg-emerald-500 border-emerald-600'}`}>
                          <p className="text-[7px] font-black text-white/80 uppercase">Pendiente</p>
                          <p className="text-[10px] font-black text-white">{fmtCOP(row.pendiente)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="bg-violet-50/50 border border-violet-100 rounded-xl px-2 py-1.5">
                          <p className="text-[7px] font-black text-violet-600 uppercase">Grupal</p>
                          <p className="text-[10px] font-black text-violet-800">{fmtCOP(row.pagado_grupal)}</p>
                        </div>
                        <div className="bg-blue-50/50 border border-blue-100 rounded-xl px-2 py-1.5">
                          <p className="text-[7px] font-black text-blue-600 uppercase">Devolución</p>
                          <p className="text-[10px] font-black text-blue-800">{fmtCOP(row.devolucion_total)}</p>
                        </div>
                        <div className="bg-orange-50/50 border border-orange-100 rounded-xl px-2 py-1.5">
                          <p className="text-[7px] font-black text-orange-600 uppercase">Sobrec. Aprob.</p>
                          <p className="text-[10px] font-black text-orange-800">{fmtCOP(row.sobrecosto_aprobado)}</p>
                        </div>
                        <div className="bg-slate-100 border border-slate-200 rounded-xl px-2 py-1.5">
                          <p className="text-[7px] font-black text-slate-500 uppercase">Sobrec. Pend.</p>
                          <p className="text-[10px] font-black text-slate-700">{fmtCOP(row.sobrecosto_pendiente)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-3 pt-2 flex gap-2">
                      <button onClick={() => exportPlaca(row)} title="Exportar esta placa"
                        className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"><Download className="w-3.5 h-3.5" /></button>
                      <button onClick={() => requestCerrarPlaca(row)}
                        className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center gap-1.5">
                        <Lock className="w-3 h-3" /> Cerrar Placa del Día
                      </button>
                      <button onClick={() => openGroup(row)}
                        className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-cyan-600 transition-all">
                        Legalizar →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 p-6 space-y-5">
          <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Filtrar historial (requerido para evitar cargar toda la base)</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><label className={labelCls}>Desde</label><input type="date" className={inputCls} value={filtros.from} onChange={e => setFiltros(f => ({ ...f, from: e.target.value }))} /></div>
              <div><label className={labelCls}>Hasta</label><input type="date" className={inputCls} value={filtros.to} onChange={e => setFiltros(f => ({ ...f, to: e.target.value }))} /></div>
              <div><label className={labelCls}>Placa</label><input className={inputCls} value={filtros.placa} onChange={e => setFiltros(f => ({ ...f, placa: e.target.value }))} placeholder="Ej: NNL629" /></div>
              <div><label className={labelCls}>Conductor</label><input className={inputCls} value={filtros.conductor} onChange={e => setFiltros(f => ({ ...f, conductor: e.target.value }))} placeholder="Nombre" /></div>
              <div className="flex items-end">
                <button onClick={buscarCerrados} disabled={loadingCerrados}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-cyan-600 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
                  {loadingCerrados ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Buscar
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <p className="text-[9px] text-slate-400 font-bold">Exporta la legalización de "Desde"/"Hasta" — incluye pendientes y cerradas, sin importar el estado.</p>
              <button onClick={exportPorFecha} disabled={exportingPorFecha}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-xl disabled:opacity-40 shrink-0">
                {exportingPorFecha ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} {exportingPorFecha ? 'Exportando...' : 'Exportar Legalización'}
              </button>
            </div>
          </div>

          {!buscado ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2">
              <Search className="w-10 h-10 text-slate-300" />
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Consulta Histórica</p>
              <p className="text-[10px] text-slate-400">Aplica un filtro y presiona Buscar para ver las legalizaciones cerradas</p>
            </div>
          ) : (
            <DataTable
              data={cerrados}
              columns={cerradosColumns}
              searchPlaceholder="Buscar en resultados..."
              excelFileName="dicorp_legalizaciones_cerradas.xlsx"
              excelSheetName="Cerrados"
              loading={loadingCerrados}
            />
          )}
        </div>
      )}

      {/* Modal placa+fecha: individual/grupal/sobrecosto */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
              <div>
                <h3 className="text-base font-black text-slate-900">{selectedGroup.placa} · {fmtDate(selectedGroup.fecha)}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{selectedGroup.conductor_nombre} · {selectedGroup.cargues} cargue(s)</p>
              </div>
              <button onClick={closeGroupModal} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex gap-3 overflow-x-auto pb-1">
                <Metric label="Valor Total" value={fmtCOP(selectedGroup.valor_total)} color="bg-slate-100 text-slate-700" />
                <Metric label="Pagado Individual" value={fmtCOP(selectedGroup.pagado_individual)} color="bg-emerald-50 text-emerald-700" />
                <Metric label="Pagado Grupal" value={fmtCOP(selectedGroup.pagado_grupal)} color="bg-violet-50 text-violet-700" />
                <Metric label="Sobrecosto Aprob." value={fmtCOP(selectedGroup.sobrecosto_aprobado)} color="bg-orange-50 text-orange-700" />
                <Metric label="Sobrecosto Pend." value={fmtCOP(selectedGroup.sobrecosto_pendiente)} color="bg-slate-100 text-slate-600" />
                <Metric label="Devolución" value={fmtCOP(selectedGroup.devolucion_total)} color="bg-blue-50 text-blue-700" />
                <Metric label="Descuadre" value={fmtCOP(selectedGroup.pendiente)} color="bg-amber-50 text-amber-700" />
              </div>
              {selectedGroup.cargue_numeros && (
                <p className="text-[10px] text-slate-400 font-bold -mt-2">No. Planilla / Cargue: <span className="font-mono text-slate-700">{selectedGroup.cargue_numeros}</span></p>
              )}

              <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 w-fit">
                <button onClick={() => { setModalTab('individual'); cancelEditSobrecosto(); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${modalTab === 'individual' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>Individual</button>
                <button onClick={() => { setModalTab('grupal'); cancelEditSobrecosto(); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${modalTab === 'grupal' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>Grupal</button>
                <button onClick={() => { setModalTab('sobrecosto'); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${modalTab === 'sobrecosto' ? 'bg-orange-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>Sobrecosto</button>
                <button onClick={() => { setModalTab('devolucion'); cancelEditSobrecosto(); }} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${modalTab === 'devolucion' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>Devolución</button>
              </div>

              {loadingCargues ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : modalTab === 'individual' ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 font-bold">Cada pedido (factura) se legaliza con su propia consignación/transferencia — {pedidos.length} en total.</p>
                  <DataTable
                    data={pedidos}
                    naked
                    searchPlaceholder="Buscar pedido, cliente, ciudad..."
                    excelFileName={`dicorp_${selectedGroup.placa}_${selectedGroup.fecha}_pedidos.xlsx`}
                    excelSheetName="Pedidos"
                    columns={[
                      { header: 'Pedido SAP', key: 'pedido_sap', sortable: true, render: r => <span className="font-mono font-black text-slate-900 text-xs">{r.pedido_sap}</span> },
                      { header: 'Cliente', key: 'nombre_cliente', sortable: true, render: r => <span className="text-xs">{r.nombre_cliente || r.codigo_cliente || '—'}</span> },
                      { header: 'Ciudad', key: 'ciudad', sortable: true, render: r => <span className="text-xs">{r.ciudad || '—'}</span> },
                      { header: 'Valor', key: 'valor', sortable: true, render: r => <span className="font-black text-slate-800 text-xs">{fmtCOP(r.valor)}</span> },
                      {
                        header: 'Pagado', key: 'id', sortable: false,
                        render: r => {
                          const pagado = (pagosIndividuales[r.id] || []).filter(p => !p.anulado).reduce((s, p) => s + Number(p.valor), 0);
                          return <span className={`font-black text-xs ${pagado > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>{pagado > 0 ? fmtCOP(pagado) : '—'}</span>;
                        },
                        exportRender: r => (pagosIndividuales[r.id] || []).filter(p => !p.anulado).reduce((s, p) => s + Number(p.valor), 0),
                      },
                    ] as ColumnDef<DetalleRow>[]}
                    renderExpandedRow={(row) => (
                      <IndividualPagoForm pedido={row} pagos={pagosIndividuales[row.id] || []} bancos={bancos} metodosPago={metodosPago}
                        onSave={trySaveIndividual} onAlert={(title, message) => setAlertInfo({ title, message })}
                        onAnular={(tipo, id, label) => setAnularTarget({ tipo, id, label })} />
                    )}
                  />
                </div>
              ) : modalTab === 'grupal' ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500 font-bold">Este recaudo se asocia a la placa <span className="font-mono text-slate-800">{selectedGroup.placa}</span> y suma al acumulado de todos sus cargues, no solo a los de esta fecha.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelCls}>Banco</label>
                      <select className={inputCls} value={formGru.bancoId} onChange={e => setFormGru(f => ({ ...f, bancoId: e.target.value }))}>
                        {bancos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div><label className={labelCls}>Comprobante *</label><input className={inputCls} value={formGru.comprobante} onChange={e => setFormGru(f => ({ ...f, comprobante: e.target.value }))} /></div>
                    <div><label className={labelCls}>Método</label>
                      <select className={inputCls} value={formGru.metodoPagoId} onChange={e => setFormGru(f => ({ ...f, metodoPagoId: e.target.value }))}>
                        {metodosPago.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div><label className={labelCls}>Valor</label><input type="number" className={inputCls} value={formGru.valor} onChange={e => setFormGru(f => ({ ...f, valor: e.target.value }))} /></div>
                    <div><label className={labelCls}>Fecha</label><input type="date" max={todayCO()} className={inputCls} value={formGru.fechaPago} onChange={e => setFormGru(f => ({ ...f, fechaPago: e.target.value }))} /></div>
                    <div><label className={labelCls}>Observación</label><input className={inputCls} value={formGru.observacion} onChange={e => setFormGru(f => ({ ...f, observacion: e.target.value }))} /></div>
                  </div>
                  <button onClick={handleSaveGrupal} disabled={savingGru}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
                    {savingGru ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Registrar Pago Grupal
                  </button>
                  {pagosGrupales.length > 0 && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-[10px] text-left">
                        <thead className="bg-slate-100 text-slate-500 uppercase font-black"><tr><th className="px-3 py-1.5">Comprobante</th><th className="px-3 py-1.5">Banco</th><th className="px-3 py-1.5">Fecha</th><th className="px-3 py-1.5 text-right">Valor</th><th></th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {pagosGrupales.map(p => (
                            <tr key={p.id} className={p.anulado ? 'opacity-50' : ''}>
                              <td className={`px-3 py-1.5 font-mono ${p.anulado ? 'line-through' : ''}`}>{p.comprobante}</td>
                              <td className="px-3 py-1.5">{p.banco || '—'}</td>
                              <td className="px-3 py-1.5">{fmtDate(p.fecha_pago)}</td>
                              <td className={`px-3 py-1.5 text-right font-black text-violet-700 ${p.anulado ? 'line-through' : ''}`}>{fmtCOP(p.valor)}</td>
                              <td className="px-3 py-1.5 text-right">
                                {p.anulado ? (
                                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-rose-100 text-rose-700" title={p.anulado_motivo || ''}>Anulado</span>
                                ) : (
                                  <button onClick={() => setAnularTarget({ tipo: 'grupal', id: p.id, label: `Comprobante ${p.comprobante} — ${fmtCOP(p.valor)}` })}
                                    className="text-rose-500 hover:text-rose-700 font-black text-[9px] uppercase">Anular</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : modalTab === 'sobrecosto' ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500 font-bold">Sobrecosto/descuadre de la placa <span className="font-mono text-slate-800">{selectedGroup.placa}</span>. Requiere referencia antes de aprobarse. Haz clic en una fila pendiente para completar o corregir sus datos.</p>
                  {editingSobId && (
                    <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                      <span className="text-[10px] font-black text-orange-700 uppercase tracking-wide">Editando sobrecosto #{editingSobId}</span>
                      <button onClick={cancelEditSobrecosto} className="text-[10px] font-black text-slate-500 hover:text-slate-700 uppercase">Cancelar edición</button>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelCls}>Cargue (opcional)</label>
                      <select className={inputCls} value={formSob.idEncabezado} onChange={e => setFormSob(f => ({ ...f, idEncabezado: e.target.value }))}>
                        <option value="">— General de la placa —</option>
                        {cargues.map(c => <option key={c.id} value={c.id}>{c.cargue_numero}</option>)}
                      </select>
                    </div>
                    <div><label className={labelCls}>Valor</label><input type="number" className={inputCls} value={formSob.valor} onChange={e => setFormSob(f => ({ ...f, valor: e.target.value }))} /></div>
                    <div><label className={labelCls}>Referencia / NIT</label><input className={inputCls} value={formSob.referencia} onChange={e => setFormSob(f => ({ ...f, referencia: e.target.value }))} /></div>
                    <div><label className={labelCls}>Tipo</label>
                      <select className={inputCls} value={formSob.tipo} onChange={e => setFormSob(f => ({ ...f, tipo: e.target.value }))}>
                        <option value="EFECTIVO">Efectivo</option><option value="MERCANCIA">Mercancía</option>
                      </select>
                    </div>
                    <div><label className={labelCls}>Fecha</label><input type="date" max={todayCO()} className={inputCls} value={formSob.fecha} onChange={e => setFormSob(f => ({ ...f, fecha: e.target.value }))} /></div>
                    <div><label className={labelCls}>Observaciones</label><input className={inputCls} value={formSob.observaciones} onChange={e => setFormSob(f => ({ ...f, observaciones: e.target.value }))} /></div>
                  </div>
                  <button onClick={handleSaveSobrecosto} disabled={savingSob}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
                    {savingSob ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {editingSobId ? 'Guardar Cambios' : 'Registrar Sobrecosto'}
                  </button>
                  {sobrecostos.length > 0 && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-[10px] text-left">
                        <thead className="bg-slate-100 text-slate-500 uppercase font-black"><tr><th className="px-3 py-1.5">Referencia</th><th className="px-3 py-1.5">Tipo</th><th className="px-3 py-1.5">Fecha</th><th className="px-3 py-1.5 text-right">Valor</th><th className="px-3 py-1.5">Observación</th><th className="px-3 py-1.5">Estado</th><th></th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {sobrecostos.map(s => (
                            <tr key={s.id}
                              onClick={() => !s.anulado && s.status === 'PENDIENTE' && startEditSobrecosto(s)}
                              className={`${s.anulado ? 'opacity-50' : ''} ${!s.anulado && s.status === 'PENDIENTE' ? `cursor-pointer hover:bg-orange-50/60 transition-colors ${editingSobId === s.id ? 'bg-orange-50' : ''}` : ''}`}
                              title={!s.anulado && s.status === 'PENDIENTE' ? 'Clic para editar' : undefined}
                            >
                              <td className={`px-3 py-1.5 font-mono ${s.anulado ? 'line-through' : ''}`}>{s.referencia || '—'}</td>
                              <td className="px-3 py-1.5">{s.tipo}</td>
                              <td className="px-3 py-1.5">{fmtDate(s.fecha)}</td>
                              <td className={`px-3 py-1.5 text-right font-black text-orange-700 ${s.anulado ? 'line-through' : ''}`}>{fmtCOP(s.valor)}</td>
                              <td className="px-3 py-1.5 text-slate-600 max-w-[160px] truncate" title={s.observaciones || ''}>{s.observaciones || '—'}</td>
                              <td className="px-3 py-1.5">
                                {s.anulado ? (
                                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-rose-100 text-rose-700" title={s.anulado_motivo || ''}>Anulado</span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${s.status === 'APROBADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right space-x-2">
                                {!s.anulado && s.status === 'PENDIENTE' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!s.referencia) { setAlertInfo({ title: 'Referencia requerida', message: 'Debes registrar una referencia/NIT antes de aprobar este sobrecosto.' }); return; }
                                      handleAprobarSobrecosto(s.id);
                                    }}
                                    className={`font-black ${s.referencia ? 'text-cyan-600 hover:text-cyan-800' : 'text-slate-300 cursor-not-allowed'}`}
                                    title={!s.referencia ? 'Requiere referencia' : 'Aprobar'}
                                  >
                                    Aprobar
                                  </button>
                                )}
                                {!s.anulado && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setAnularTarget({ tipo: 'sobrecosto', id: s.id, label: `Sobrecosto (${s.status}) — ${fmtCOP(s.valor)}` }); }}
                                    className="text-rose-500 hover:text-rose-700 font-black text-[9px] uppercase"
                                  >
                                    Anular
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-500 font-bold">Devolución de mercancía o dinero de la placa <span className="font-mono text-slate-800">{selectedGroup.placa}</span> — se descuenta del descuadre general junto con lo consignado.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelCls}>Valor</label><input type="number" className={inputCls} value={formDevo.valor} onChange={e => setFormDevo(f => ({ ...f, valor: e.target.value }))} /></div>
                    <div><label className={labelCls}>Fecha</label><input type="date" max={todayCO()} className={inputCls} value={formDevo.fecha} onChange={e => setFormDevo(f => ({ ...f, fecha: e.target.value }))} /></div>
                    <div><label className={labelCls}>Observación</label><input className={inputCls} value={formDevo.observacion} onChange={e => setFormDevo(f => ({ ...f, observacion: e.target.value }))} /></div>
                  </div>
                  <button onClick={handleSaveDevolucion} disabled={savingDevo}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
                    {savingDevo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Registrar Devolución
                  </button>
                  {devoluciones.length > 0 && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-[10px] text-left">
                        <thead className="bg-slate-100 text-slate-500 uppercase font-black"><tr><th className="px-3 py-1.5">Fecha</th><th className="px-3 py-1.5 text-right">Valor</th><th className="px-3 py-1.5">Observación</th><th className="px-3 py-1.5">Usuario</th><th></th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {devoluciones.map(dv => (
                            <tr key={dv.id} className={dv.anulado ? 'opacity-50' : ''}>
                              <td className="px-3 py-1.5">{fmtDate(dv.fecha)}</td>
                              <td className={`px-3 py-1.5 text-right font-black text-blue-700 ${dv.anulado ? 'line-through' : ''}`}>{fmtCOP(dv.valor)}</td>
                              <td className="px-3 py-1.5 text-slate-600 max-w-[200px] truncate" title={dv.observacion || ''}>{dv.observacion || '—'}</td>
                              <td className="px-3 py-1.5">{dv.usuario || '—'}</td>
                              <td className="px-3 py-1.5 text-right">
                                {dv.anulado ? (
                                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-rose-100 text-rose-700" title={dv.anulado_motivo || ''}>Anulado</span>
                                ) : (
                                  <button onClick={() => setAnularTarget({ tipo: 'devolucion', id: dv.id, label: `Devolución — ${fmtCOP(dv.valor)}` })}
                                    className="text-rose-500 hover:text-rose-700 font-black text-[9px] uppercase">Anular</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button onClick={closeGroupModal} className="px-5 py-2 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerta genérica de validación (valor inválido, campo requerido, error de guardado...) */}
      {/* Anular pago/sobrecosto/devolución — motivo obligatorio, conserva el histórico */}
      {anularTarget && (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-rose-600" /></div>
              <h3 className="text-base font-black text-slate-900">Anular Registro</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 font-bold">{anularTarget.label}</p>
              <p className="text-[11px] text-slate-500">El registro no se elimina — queda marcado como anulado y visible en el histórico del detalle, y su valor se reversa del total legalizado.</p>
              <div>
                <label className={labelCls}>Motivo de anulación *</label>
                <textarea className={`${inputCls} min-h-[70px]`} value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} placeholder="Ej: comprobante duplicado por error, valor mal digitado, etc." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setAnularTarget(null); setAnularMotivo(''); }} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50">Cancelar</button>
                <button onClick={confirmAnular} disabled={anulando || !anularMotivo.trim()}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow flex items-center gap-2">
                  {anulando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Anular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {alertInfo && (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-5 flex items-center gap-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <h3 className="text-sm font-black text-slate-900">{alertInfo.title}</h3>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">{alertInfo.message}</p>
              <div className="flex justify-end mt-5">
                <button onClick={() => setAlertInfo(null)}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-cyan-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow">
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicado */}
      {duplicado && duplicado.length > 0 && (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-rose-600" /></div>
              <h3 className="text-base font-black text-slate-900">Comprobante ya Registrado</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 font-bold">Este número de comprobante ya fue reportado en:</p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {duplicado.map(d => (
                  <div key={`${d.tipo}-${d.id}`} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] space-y-1">
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Tipo</span><span className="font-black text-slate-800">{d.tipo}</span></div>
                    {d.cargue_numero && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Cargue</span><span className="font-mono font-black text-slate-800">{d.cargue_numero}</span></div>}
                    {d.pedido_sap && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Pedido</span><span className="font-mono font-black text-slate-800">{d.pedido_sap}</span></div>}
                    {d.nombre_cliente && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Cliente</span><span className="font-black text-slate-800 text-right">{d.nombre_cliente}</span></div>}
                    {d.ciudad && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Ciudad</span><span className="font-black text-slate-800">{d.ciudad}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Placa</span><span className="font-black text-slate-800">{d.placa}</span></div>
                    {d.banco && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Banco</span><span className="font-black text-slate-800">{d.banco}</span></div>}
                    {d.metodo_pago && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Método</span><span className="font-black text-slate-800">{d.metodo_pago}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Fecha de Pago</span><span className="font-black text-slate-800">{fmtDate(d.fecha_pago)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Valor</span><span className="font-black text-slate-800">{fmtCOP(d.valor)}</span></div>
                    {d.observacion && <div className="flex justify-between gap-3"><span className="text-slate-400 font-bold uppercase shrink-0">Observación</span><span className="font-black text-slate-800 text-right">{d.observacion}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Reportado por</span><span className="font-black text-slate-800">{d.usuario || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Registrado el</span><span className="font-black text-slate-800">{fmtDateTime(d.created_at)}</span></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={handleCancelDuplicate} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50">Cancelar, usar otro número</button>
                <button onClick={handleConfirmDuplicate} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow">Continuar de todas formas</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cerrar placa del día — advertencia con saldo */}
      {warnClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <div><h3 className="text-base font-black text-slate-900">Aún hay saldo pendiente</h3><p className="text-[10px] text-slate-500 font-bold">Placa {warnClose.placa} · {fmtDate(warnClose.fecha)}</p></div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
              <p className="text-[11px] font-bold text-amber-800">
                Hay <span className="font-black">{fmtCOP(warnClose.pendiente)}</span> pendientes por legalizar en <span className="font-black">{warnClose.cargues}</span> factura{warnClose.cargues !== 1 ? 's' : ''}.
              </p>
            </div>
            <p className="text-xs text-slate-500 mb-3">¿Está seguro de cerrar la placa del día de todas formas? Las facturas restantes quedarán marcadas como legalizadas administrativamente. Debes clasificar el descuadre:</p>
            <div className="space-y-3 mb-6">
              <div>
                <label className={labelCls}>Tipo de Descuadre *</label>
                <select className={inputCls} value={tipoDescuadreCierre} onChange={e => setTipoDescuadreCierre(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="MERCANCIA">Mercancía</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Comentario / Novedad (opcional)</label>
                <input className={inputCls} value={comentarioDescuadreCierre} onChange={e => setComentarioDescuadreCierre(e.target.value)} placeholder="Ej: descuadre del conductor, peaje, etc." />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setWarnClose(null)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50">Cancelar</button>
              <button onClick={() => doCerrarPlaca(warnClose)} disabled={closing || !tipoDescuadreCierre}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow flex items-center gap-2">
                {closing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Sí, cerrar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cerrar placa del día — confirmación simple (sin saldo) */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0"><Lock className="w-5 h-5 text-slate-600" /></div>
              <h3 className="text-base font-black text-slate-900">Cerrar Placa del Día</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              ¿Está seguro de cerrar la placa <span className="font-black text-slate-900">{confirmClose.placa}</span> del <span className="font-black text-slate-900">{fmtDate(confirmClose.fecha)}</span>? Se marcarán <span className="font-black">{confirmClose.cargues}</span> factura{confirmClose.cargues !== 1 ? 's' : ''} como legalizada{confirmClose.cargues !== 1 ? 's' : ''}.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmClose(null)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50">Cancelar</button>
              <button onClick={() => doCerrarPlaca(confirmClose)} disabled={closing}
                className="px-6 py-2.5 bg-slate-900 hover:bg-cyan-600 disabled:opacity-60 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow flex items-center gap-2">
                {closing && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Previsualización de carga — qué se va a guardar, con detección de duplicados */}
      {previewData && previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-3xl">
              <h3 className="text-base font-black text-slate-900">
                {uploadMode === 'editar' ? 'Editar Información Cargada' : 'Confirmar Carga'} — {previewFile.name}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">Revisa lo que se va a guardar antes de continuar</p>
            </div>

            <div className="p-6 space-y-4">
              {uploadMode === 'nuevo' && previewData.resumen.hayConflictos && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-rose-800">No se puede cargar — ya existe información</p>
                    <p className="text-[11px] text-rose-700 mt-1">
                      Uno o más cargues/pedidos de este archivo ya están registrados en el sistema. Para proteger la integridad de la información, esta carga <strong>no sobrescribe</strong> nada automáticamente. Si necesitas corregir lo que ya subiste, cierra esto y usa <strong>"Editar Información Cargada"</strong>.
                    </p>
                  </div>
                </div>
              )}
              {uploadMode === 'editar' && previewData.resumen.hayLegalizados && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-amber-800">Algunos cargues ya están legalizados</p>
                    <p className="text-[11px] text-amber-700 mt-1">Los cargues marcados como "Legalizado" en la tabla no se van a modificar — quedan protegidos aunque vengan en este archivo. Solo se actualizará la información de los cargues aún pendientes.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Cargues</p>
                  <p className="text-sm font-black text-slate-800">{previewData.resumen.totalCargues} <span className="text-[9px] text-emerald-600 font-bold">({previewData.resumen.carguesNuevos} nuevos)</span></p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Pedidos Nuevos</p>
                  <p className="text-sm font-black text-emerald-700">{previewData.resumen.pedidosNuevos}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Pedidos Existentes</p>
                  <p className="text-sm font-black text-amber-700">{previewData.resumen.pedidosExistentes}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Valor Total</p>
                  <p className="text-sm font-black text-slate-800">{fmtCOP(previewData.resumen.valorTotal)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-[10px] text-left">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-black sticky top-0">
                    <tr><th className="px-3 py-2">Cargue</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Placa</th><th className="px-3 py-2">Conductor</th><th className="px-3 py-2">Pedidos</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Estado</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.cargues.map(c => (
                      <tr key={c.cargue}>
                        <td className="px-3 py-1.5 font-mono font-black">{c.cargue}</td>
                        <td className="px-3 py-1.5">{fmtDate(c.fecha)}</td>
                        <td className="px-3 py-1.5 font-mono">{c.placa || '—'}</td>
                        <td className="px-3 py-1.5">{c.conductor || '—'}</td>
                        <td className="px-3 py-1.5">{c.pedidos} <span className="text-slate-400">({c.pedidosNuevos} nuevos)</span></td>
                        <td className="px-3 py-1.5 text-right font-black">{fmtCOP(c.valorTotal)}</td>
                        <td className="px-3 py-1.5">
                          {c.estadoActual === 'LEGALIZADO' ? (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-200 text-slate-600 inline-flex items-center gap-1"><Lock className="w-2.5 h-2.5" />Legalizado — protegido</span>
                          ) : c.yaExiste ? (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-700">Ya existe ({c.estadoActual})</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-emerald-100 text-emerald-700">Nuevo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={cancelUpload} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50">Cancelar</button>
                {!(uploadMode === 'nuevo' && previewData.resumen.hayConflictos) && (
                  <button onClick={confirmUpload} disabled={uploading}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-cyan-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow flex items-center gap-2 disabled:opacity-60">
                    {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {uploadMode === 'editar' ? 'Guardar Ediciones' : 'Confirmar y Guardar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalizacionesDicorp;
