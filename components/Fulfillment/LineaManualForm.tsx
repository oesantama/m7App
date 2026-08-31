import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface Cliente { id: number; codigo: string; nombre: string; moneda: 'USD' | 'COP'; }
interface MasterItem { id: number; nombre: string; }

const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";
export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const NUEVO = '__nuevo__';

// Período fijo (cuando el formulario se abre DESDE el detalle de un registro existente):
// se ocultan los selectores de cliente/año/mes/subtipo porque ya se sabe a cuál período pertenece.
export interface PeriodoFijo { cliente_id: number; anio: number; mes: string; subtipo: string | null; }

// Select "creatable": siempre se elige de lo que ya existe en Maestras (por id, sin riesgo de
// duplicar por error de tipeo) y solo si de verdad es nuevo se habilita el campo de texto libre.
const CreatableSelect: React.FC<{
  label: string; required?: boolean; placeholder: string; items: MasterItem[];
  value: string; nuevoValue: string; onChange: (v: string) => void; onChangeNuevo: (v: string) => void;
}> = ({ label, required, placeholder, items, value, nuevoValue, onChange, onChangeNuevo }) => (
  <div>
    <label className={labelCls}>{label}{required && ' *'}</label>
    <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{required ? '— Seleccionar —' : '— Ninguno —'}</option>
      {items.map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
      <option value={NUEVO}>+ Nuevo — crear en Maestras...</option>
    </select>
    {value === NUEVO && (
      <input className={`${inputCls} mt-2`} value={nuevoValue} onChange={e => onChangeNuevo(e.target.value)} placeholder={placeholder} autoFocus />
    )}
  </div>
);

// ── Formulario reutilizable para capturar UNA línea de Fullfilment ──────────
// Se usa tanto en el tab "Registro" (dentro de un diálogo, período libre) como dentro del
// modal de Detalle de un registro ya existente (período fijo, solo se agrega el ítem/valor).
export const LineaManualForm: React.FC<{
  clientes: Cliente[]; productos: MasterItem[]; transportistas: MasterItem[];
  periodoFijo?: PeriodoFijo; onSaved: () => void;
}> = ({ clientes, productos, transportistas, periodoFijo, onSaved }) => {
  const EMPTY = {
    cliente_id: periodoFijo ? String(periodoFijo.cliente_id) : '',
    anio: periodoFijo ? String(periodoFijo.anio) : String(new Date().getFullYear()),
    mes: periodoFijo ? periodoFijo.mes : '',
    subtipo: periodoFijo?.subtipo || '',
    fecha: '', producto: '', productoNuevo: '', descripcion: '', cantidad: '1', tarifa: '', monto: '',
    costo_transportista: '', transportista: '', transportistaNuevo: '', seguimiento: '',
  };
  const [linea, setLinea] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const productoFinal = linea.producto === NUEVO ? linea.productoNuevo.trim() : linea.producto;
  const transportistaFinal = linea.transportista === NUEVO ? linea.transportistaNuevo.trim() : linea.transportista;

  const handleGuardar = async () => {
    if (!linea.cliente_id) { toast.error('Selecciona el cliente'); return; }
    if (!linea.anio || !linea.mes) { toast.error('El año y el mes son obligatorios'); return; }
    if (!productoFinal) { toast.error('El producto/servicio es obligatorio'); return; }
    if (!linea.monto || Number(linea.monto) <= 0) { toast.error('El monto es obligatorio'); return; }
    setSaving(true);
    try {
      const res = await api.createFulfillmentDetalleManual({
        cliente_id: Number(linea.cliente_id), anio: linea.anio, mes: linea.mes, subtipo: linea.subtipo || undefined,
        fecha: linea.fecha || undefined, producto: productoFinal, descripcion: linea.descripcion || undefined,
        cantidad: linea.cantidad || undefined, tarifa: linea.tarifa || undefined, monto: linea.monto,
        costo_transportista: linea.costo_transportista || undefined, transportista: transportistaFinal || undefined,
        seguimiento: linea.seguimiento || undefined,
      });
      if (res.success) {
        toast.success('Registrado — el registro del período se actualizó acumulando este valor.');
        // Se conserva el período para seguir capturando líneas rápidamente; solo se limpia el ítem.
        setLinea(l => ({ ...EMPTY, cliente_id: l.cliente_id, anio: l.anio, mes: l.mes, subtipo: l.subtipo }));
        onSaved();
      } else toast.error(res.error || 'No se pudo guardar');
    } catch (e: any) { toast.error(e.message || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {!periodoFijo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div><label className={labelCls}>Cliente *</label>
            <select className={inputCls} value={linea.cliente_id} onChange={e => setLinea(l => ({ ...l, cliente_id: e.target.value }))}>
              <option value="">— Seleccionar —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Año *</label><input className={inputCls} value={linea.anio} onChange={e => setLinea(l => ({ ...l, anio: e.target.value }))} /></div>
          <div><label className={labelCls}>Mes *</label>
            <select className={inputCls} value={linea.mes} onChange={e => setLinea(l => ({ ...l, mes: e.target.value }))}>
              <option value="">— Seleccionar —</option>
              {MESES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Subtipo (opcional)</label><input className={inputCls} value={linea.subtipo} onChange={e => setLinea(l => ({ ...l, subtipo: e.target.value }))} placeholder="Ej: ECOMMERCE" /></div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={linea.fecha} onChange={e => setLinea(l => ({ ...l, fecha: e.target.value }))} /></div>
        <CreatableSelect
          label="Producto/Servicio" required placeholder="Nombre del nuevo producto/servicio"
          items={productos} value={linea.producto} nuevoValue={linea.productoNuevo}
          onChange={v => setLinea(l => ({ ...l, producto: v }))} onChangeNuevo={v => setLinea(l => ({ ...l, productoNuevo: v }))}
        />
        <div className="md:col-span-2"><label className={labelCls}>Descripción</label><input className={inputCls} value={linea.descripcion} onChange={e => setLinea(l => ({ ...l, descripcion: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label className={labelCls}>Cantidad</label><input type="number" className={inputCls} value={linea.cantidad} onChange={e => setLinea(l => ({ ...l, cantidad: e.target.value }))} /></div>
        <div><label className={labelCls}>Tarifa</label><input type="number" className={inputCls} value={linea.tarifa} onChange={e => setLinea(l => ({ ...l, tarifa: e.target.value }))} /></div>
        <div><label className={labelCls}>Monto *</label><input type="number" className={inputCls} value={linea.monto} onChange={e => setLinea(l => ({ ...l, monto: e.target.value }))} /></div>
        <div><label className={labelCls}>Costo Transportista</label><input type="number" className={inputCls} value={linea.costo_transportista} onChange={e => setLinea(l => ({ ...l, costo_transportista: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <CreatableSelect
          label="Transportista" placeholder="Nombre del nuevo transportista"
          items={transportistas} value={linea.transportista} nuevoValue={linea.transportistaNuevo}
          onChange={v => setLinea(l => ({ ...l, transportista: v }))} onChangeNuevo={v => setLinea(l => ({ ...l, transportistaNuevo: v }))}
        />
        <div><label className={labelCls}>Seguimiento</label><input className={inputCls} value={linea.seguimiento} onChange={e => setLinea(l => ({ ...l, seguimiento: e.target.value }))} /></div>
      </div>
      <button onClick={handleGuardar} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
};
