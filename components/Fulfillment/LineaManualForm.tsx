import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface Cliente { id: number; codigo: string; nombre: string; moneda: 'USD' | 'COP'; }
interface MasterItem { id: number; nombre: string; }

const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";
export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const NUEVO = '__nuevo__';
const hoyISO = () => new Date().toISOString().slice(0, 10);

// Período fijo (cuando el formulario se abre DESDE el detalle de un registro existente):
// se ocultan los selectores de cliente/año/mes/subtipo porque ya se sabe a cuál período pertenece.
export interface PeriodoFijo { cliente_id: number; anio: number; mes: string; subtipo: string | null; }

// Línea existente a editar — cuando se pasa, el formulario precarga sus valores y guarda con
// PUT en vez de POST. Siempre se usa junto con periodoFijo (se edita dentro de un registro dado).
export interface DetalleEditable {
  id: number; fecha: string | null; producto_servicio_nombre: string | null; descripcion: string | null;
  orden: string | null; cantidad: string | number; tarifa: string | number; monto: string | number;
  costo_transportista: string | number | null; transportista_nombre: string | null; seguimiento: string | null;
  nota?: string | null;
  monto_final?: string | number | null;
  diferencia_monto?: string | number | null;
  factura_transportista?: string | null;
  fecha_factura_transportista?: string | null;
  estado_id?: string | null;
  estado_nombre?: string | null;
}

// Select "creatable": siempre se elige de lo que ya existe en Maestras (por id, sin riesgo de
// duplicar por error de tipeo) y solo si de verdad es nuevo se habilita el campo de texto libre.
const CreatableSelect: React.FC<{
  label: string; required?: boolean; placeholder: string; items: MasterItem[];
  value: string; nuevoValue: string; onChange: (v: string) => void; onChangeNuevo: (v: string) => void;
}> = ({ label, required, placeholder, items, value, nuevoValue, onChange, onChangeNuevo }) => {
  const { t } = useTranslation(['fulfillment', 'common']);
  return (
    <div>
      <label className={labelCls}>{label}{required && ' *'}</label>
      <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{required ? t('common:actions.selectPlaceholder') : t('common:actions.nonePlaceholder')}</option>
        {items.map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
        <option value={NUEVO}>{t('fulfillment:lineaManualForm.newOptionLabel')}</option>
      </select>
      {value === NUEVO && (
        <input className={`${inputCls} mt-2`} value={nuevoValue} onChange={e => onChangeNuevo(e.target.value)} placeholder={placeholder} autoFocus />
      )}
    </div>
  );
};

// Resuelve el valor inicial de un CreatableSelect a partir de un nombre ya guardado: si el nombre
// existe en la maestra se selecciona tal cual, si no existe (fue borrado, o vino de importación
// libre) se activa el modo "+ Nuevo" con ese nombre precargado en el campo de texto.
function resolveSelectValue(nombre: string | null | undefined, items: MasterItem[]): { value: string; nuevo: string } {
  if (!nombre) return { value: '', nuevo: '' };
  const existe = items.some(i => i.nombre === nombre);
  return existe ? { value: nombre, nuevo: '' } : { value: NUEVO, nuevo: nombre };
}

// ── Formulario reutilizable para capturar (o editar) UNA línea de FULFILLMENT ───────
// Se usa tanto en el tab "Registro" (dentro de un diálogo, período libre) como dentro del
// modal de Detalle de un registro ya existente (período fijo, agregar o editar un ítem/valor).
export const LineaManualForm: React.FC<{
  clientes: Cliente[]; productos: MasterItem[]; transportistas: MasterItem[];
  periodoFijo?: PeriodoFijo; editDetalle?: DetalleEditable; onSaved: () => void;
}> = ({ clientes, productos, transportistas, periodoFijo, editDetalle, onSaved }) => {
  const { t } = useTranslation(['fulfillment', 'common']);
  const productoInit = resolveSelectValue(editDetalle?.producto_servicio_nombre, productos);
  const transportistaInit = resolveSelectValue(editDetalle?.transportista_nombre, transportistas);
  const EMPTY = {
    cliente_id: periodoFijo ? String(periodoFijo.cliente_id) : '',
    anio: periodoFijo ? String(periodoFijo.anio) : String(new Date().getFullYear()),
    mes: periodoFijo ? periodoFijo.mes : '',
    subtipo: periodoFijo?.subtipo || '',
    fecha: editDetalle?.fecha ? String(editDetalle.fecha).slice(0, 10) : hoyISO(),
    producto: productoInit.value, productoNuevo: productoInit.nuevo,
    descripcion: editDetalle?.descripcion || '',
    orden: editDetalle?.orden || '',
    cantidad: editDetalle ? String(editDetalle.cantidad) : '1',
    tarifa: editDetalle ? String(editDetalle.tarifa) : '',
    monto: editDetalle ? String(editDetalle.monto) : '',
    montoTocado: !!editDetalle,
    costo_transportista: editDetalle?.costo_transportista != null ? String(editDetalle.costo_transportista) : '',
    transportista: transportistaInit.value, transportistaNuevo: transportistaInit.nuevo,
    seguimiento: editDetalle?.seguimiento || '',
    nota: editDetalle?.nota || '',
    monto_final: editDetalle?.monto_final != null ? String(editDetalle.monto_final) : '',
    factura_transportista: editDetalle?.factura_transportista || '',
    fecha_factura_transportista: editDetalle?.fecha_factura_transportista ? String(editDetalle.fecha_factura_transportista).slice(0, 10) : '',
  };
  const [linea, setLinea] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorModalMsg, setErrorModalMsg] = useState<string | null>(null);

  const productoFinal = linea.producto === NUEVO ? linea.productoNuevo.trim() : linea.producto;
  const transportistaFinal = linea.transportista === NUEVO ? linea.transportistaNuevo.trim() : linea.transportista;

  const numMontoInicial = linea.monto !== '' && !isNaN(Number(linea.monto)) ? Number(linea.monto) : null;
  const numMontoFinal = linea.monto_final !== '' && !isNaN(Number(linea.monto_final)) ? Number(linea.monto_final) : null;
  const calcDiferencia = numMontoFinal !== null && numMontoInicial !== null ? (numMontoInicial - numMontoFinal) : null;

  // Monto = Cantidad × Tarifa, recalculado en vivo — pero el usuario puede sobrescribirlo a mano
  // en cualquier momento (ej. para dejarlo en 0, o un valor negociado distinto al cálculo).
  const aplicarCalculo = (cantidad: string, tarifa: string) => {
    const c = parseFloat(cantidad), tf = parseFloat(tarifa);
    if (!isNaN(c) && !isNaN(tf)) return (c * tf).toFixed(2);
    return '';
  };

  const handleGuardar = async () => {
    if (!linea.cliente_id) { toast.error(t('fulfillment:lineaManualForm.toastClientRequired')); return; }
    if (!linea.anio || !linea.mes) { toast.error(t('fulfillment:lineaManualForm.toastPeriodRequired')); return; }
    if (!productoFinal) { toast.error(t('fulfillment:lineaManualForm.toastProductRequired')); return; }
    if (linea.monto === '' || Number(linea.monto) < 0) { toast.error(t('fulfillment:lineaManualForm.toastAmountRequired')); return; }

    const hasMontoFinal = linea.monto_final !== '' && linea.monto_final !== null && linea.monto_final !== undefined;
    const hasFactura = !!linea.factura_transportista?.trim();
    const hasFechaFactura = !!linea.fecha_factura_transportista;

    const hasAnyFinal = hasMontoFinal || hasFactura || hasFechaFactura;
    const hasAllFinal = hasMontoFinal && hasFactura && hasFechaFactura;

    if (hasAnyFinal && !hasAllFinal) {
      setErrorModalMsg('Si diligencia la liquidación final (Monto Final, Factura Transportista o Fecha Factura), es obligatorio ingresar los 3 campos completos.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fecha: linea.fecha || undefined, producto: productoFinal, descripcion: linea.descripcion || undefined,
        orden: linea.orden || undefined,
        cantidad: linea.cantidad || undefined, tarifa: linea.tarifa || undefined, monto: linea.monto,
        costo_transportista: linea.costo_transportista || undefined, transportista: transportistaFinal || undefined,
        seguimiento: linea.seguimiento || undefined, nota: linea.nota || undefined,
        monto_final: linea.monto_final || undefined,
        factura_transportista: linea.factura_transportista || undefined,
        fecha_factura_transportista: linea.fecha_factura_transportista || undefined,
      };
      const res = editDetalle
        ? await api.updateFulfillmentDetalleManual(editDetalle.id, payload)
        : await api.createFulfillmentDetalleManual({
            cliente_id: Number(linea.cliente_id), anio: linea.anio, mes: linea.mes, subtipo: linea.subtipo || undefined,
            ...payload,
          });
      if (res.success) {
        toast.success(editDetalle ? t('fulfillment:lineaManualForm.toastUpdated') : t('fulfillment:lineaManualForm.toastSaved'));
        if (!editDetalle) {
          // Se conserva el período para seguir capturando líneas rápidamente; solo se limpia el ítem.
          setLinea(l => ({ ...EMPTY, cliente_id: l.cliente_id, anio: l.anio, mes: l.mes, subtipo: l.subtipo, fecha: hoyISO() }));
        }
        onSaved();
      } else toast.error(res.error || t('fulfillment:lineaManualForm.toastSaveError'));
    } catch (e: any) { toast.error(e.message || t('fulfillment:lineaManualForm.toastSaveError')); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {!periodoFijo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.clientLabel')}</label>
            <select className={inputCls} value={linea.cliente_id} onChange={e => setLinea(l => ({ ...l, cliente_id: e.target.value }))}>
              <option value="">{t('common:actions.selectPlaceholder')}</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </div>
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.yearLabel')}</label><input className={inputCls} value={linea.anio} onChange={e => setLinea(l => ({ ...l, anio: e.target.value }))} /></div>
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.monthLabel')}</label>
            <select className={inputCls} value={linea.mes} onChange={e => setLinea(l => ({ ...l, mes: e.target.value }))}>
              <option value="">{t('common:actions.selectPlaceholder')}</option>
              {MESES.map(m => <option key={m} value={m}>{t(`common:months.${m}`)}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.subtypeLabel')}</label><input className={inputCls} value={linea.subtipo} onChange={e => setLinea(l => ({ ...l, subtipo: e.target.value }))} placeholder={t('fulfillment:lineaManualForm.subtypePlaceholder')} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label className={labelCls}>{t('fulfillment:lineaManualForm.dateLabel')}</label><input type="date" className={inputCls} value={linea.fecha} onChange={e => setLinea(l => ({ ...l, fecha: e.target.value }))} /></div>
        <CreatableSelect
          label={t('fulfillment:lineaManualForm.productLabel')} required placeholder={t('fulfillment:lineaManualForm.productPlaceholder')}
          items={productos} value={linea.producto} nuevoValue={linea.productoNuevo}
          onChange={v => setLinea(l => ({ ...l, producto: v }))} onChangeNuevo={v => setLinea(l => ({ ...l, productoNuevo: v }))}
        />
        <div><label className={labelCls}>{t('fulfillment:lineaManualForm.orderLabel')}</label><input className={inputCls} value={linea.orden} onChange={e => setLinea(l => ({ ...l, orden: e.target.value }))} placeholder={t('fulfillment:lineaManualForm.orderPlaceholder')} /></div>
        <div><label className={labelCls}>{t('fulfillment:lineaManualForm.descriptionLabel')}</label><input className={inputCls} value={linea.descripcion} onChange={e => setLinea(l => ({ ...l, descripcion: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label className={labelCls}>{t('fulfillment:lineaManualForm.quantityLabel')}</label>
          <input type="number" className={inputCls} value={linea.cantidad}
            onChange={e => setLinea(l => ({ ...l, cantidad: e.target.value, monto: l.montoTocado ? l.monto : aplicarCalculo(e.target.value, l.tarifa) }))} />
        </div>
        <div><label className={labelCls}>{t('fulfillment:lineaManualForm.rateLabel')}</label>
          <input type="number" className={inputCls} value={linea.tarifa}
            onChange={e => setLinea(l => ({ ...l, tarifa: e.target.value, monto: l.montoTocado ? l.monto : aplicarCalculo(l.cantidad, e.target.value) }))} />
        </div>
        <div><label className={labelCls}>Monto Inicial *</label>
          <input type="number" step="0.01" className={inputCls} value={linea.monto}
            onChange={e => setLinea(l => ({ ...l, monto: e.target.value, montoTocado: true }))} />
        </div>
      </div>

      {/* Información interna — nunca visible ni exportada para el cliente. Bloque visualmente
          separado a propósito, para que quien captura sepa que esto es solo de uso interno. */}
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 mb-4">
        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">
          <Lock className="w-3 h-3" /> {t('fulfillment:lineaManualForm.internalBlockLabel')}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.carrierCostLabel')}</label><input type="number" className={inputCls} value={linea.costo_transportista} onChange={e => setLinea(l => ({ ...l, costo_transportista: e.target.value }))} /></div>
          <CreatableSelect
            label={t('fulfillment:lineaManualForm.carrierLabel')} placeholder={t('fulfillment:lineaManualForm.carrierPlaceholder')}
            items={transportistas} value={linea.transportista} nuevoValue={linea.transportistaNuevo}
            onChange={v => setLinea(l => ({ ...l, transportista: v }))} onChangeNuevo={v => setLinea(l => ({ ...l, transportistaNuevo: v }))}
          />
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.trackingLabel')}</label><input className={inputCls} value={linea.seguimiento} onChange={e => setLinea(l => ({ ...l, seguimiento: e.target.value }))} /></div>
          <div><label className={labelCls}>{t('fulfillment:lineaManualForm.noteLabel')}</label><input className={inputCls} value={linea.nota} onChange={e => setLinea(l => ({ ...l, nota: e.target.value }))} placeholder={t('fulfillment:lineaManualForm.notePlaceholder')} /></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
          <div><label className={labelCls}>Monto Final</label><input type="number" step="0.01" className={inputCls} value={linea.monto_final} onChange={e => setLinea(l => ({ ...l, monto_final: e.target.value }))} placeholder="Monto final liquidación" /></div>
          <div><label className={labelCls}>Diferencia Monto</label><input readOnly className={`${inputCls} bg-slate-100 font-bold ${calcDiferencia && calcDiferencia < 0 ? 'text-red-600' : 'text-emerald-700'}`} value={calcDiferencia !== null ? calcDiferencia.toFixed(2) : '—'} /></div>
          <div><label className={labelCls}>Factura Transportista</label><input className={inputCls} value={linea.factura_transportista} onChange={e => setLinea(l => ({ ...l, factura_transportista: e.target.value }))} placeholder="Nº Factura" /></div>
          <div><label className={labelCls}>Fecha Factura Transportista</label><input type="date" className={inputCls} value={linea.fecha_factura_transportista} onChange={e => setLinea(l => ({ ...l, fecha_factura_transportista: e.target.value }))} /></div>
        </div>
      </div>

      <button onClick={handleGuardar} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {saving ? t('fulfillment:lineaManualForm.saving') : t('fulfillment:lineaManualForm.save')}
      </button>

      {errorModalMsg && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-black text-slate-800 mb-2 uppercase tracking-widest">Validación de Liquidación Final</h3>
            <p className="text-xs text-slate-600 mb-6 font-semibold leading-relaxed">{errorModalMsg}</p>
            <button
              type="button"
              onClick={() => setErrorModalMsg(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/30"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
