import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { User } from '../../types';
import { DataTable, ColumnDef } from '../shared/DataTable';

interface Props { user: User; }

interface ConciliacionRow {
  id: number;
  orden_maestra: string | null;
  unidades_reales: number | null;
  documento_compras: string | null;
  factura: string | null;
  valor_por_om: string | null;
  tarifa: string | null;
  flete_ida: string | null;
  manifiesto_ida: string | null;
  remesa_ida: string | null;
  pedido_sap: string | null;
  flete_regreso: string | null;
  manifiesto_regreso: string | null;
  remesa_regreso: string | null;
  cantidad_ingresada_cedi: number | null;
  liquidacion_factura: string | null;
  fecha_creacion: string;
  confeccionista_nombre: string | null;
  estado_id: string;
  estado: string | null;
}

const fmtCOP = (v: any) => (v === null || v === undefined || v === '') ? '—' : `$${Math.round(Number(v)).toLocaleString('es-CO')}`;
const fmtDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ESTADO_COLORS: Record<string, string> = {
  'EST-03': 'bg-amber-100 text-amber-700',   // PENDIENTE
  'EST-19': 'bg-emerald-100 text-emerald-700', // CONCILIADO
  'EST-16': 'bg-red-100 text-red-700',       // ELIMINADO
};
const ESTADO_PENDIENTE = 'EST-03';

const labelCls = "block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1";
const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all";

export default function ConciliacionJhonUribe({ user }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pedidoSap, setPedidoSap] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ConciliacionRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [aprobando, setAprobando] = useState(false);
  const [aprobarTarget, setAprobarTarget] = useState<{ ids?: number[]; codigo_sap?: string; label: string } | null>(null);
  const [aprobarNota, setAprobarNota] = useState('');

  const consultar = async () => {
    setLoading(true);
    setBuscado(true);
    setSelected(new Set());
    try {
      const data = await api.dogamaGetConciliacionJhonUribe({ from: from || undefined, to: to || undefined });
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(`Error al consultar: ${err.message || err}`);
    } finally { setLoading(false); }
  };

  const limpiar = () => {
    setFrom(''); setTo(''); setPedidoSap(''); setRows([]); setBuscado(false); setSelected(new Set());
  };

  const filteredRows = useMemo(() => {
    if (!pedidoSap.trim()) return rows;
    const q = pedidoSap.trim().toLowerCase();
    return rows.filter(r => (r.pedido_sap || '').toLowerCase().includes(q));
  }, [rows, pedidoSap]);

  const pendientesVisibles = filteredRows.filter(r => r.estado_id === ESTADO_PENDIENTE);
  const seleccionadosPendientes = [...selected].filter(id => pendientesVisibles.some(r => r.id === id));

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (pendientesVisibles.every(r => selected.has(r.id))) {
      setSelected(prev => { const next = new Set(prev); pendientesVisibles.forEach(r => next.delete(r.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); pendientesVisibles.forEach(r => next.add(r.id)); return next; });
    }
  };

  const confirmarAprobar = async () => {
    if (!aprobarTarget) return;
    setAprobando(true);
    try {
      const res: any = await api.dogamaConciliarOrdenesServicio({
        ids: aprobarTarget.ids, codigo_sap: aprobarTarget.codigo_sap,
        nota: aprobarNota.trim() || undefined,
        usuario_actualizacion: user?.name || user?.email,
      });
      toast.success(`${res.conciliados} fila(s) conciliada(s) — ${aprobarTarget.label}`);
      setSelected(new Set());
      setAprobarTarget(null);
      setAprobarNota('');
      await consultar();
    } catch (err: any) {
      toast.error(`Error al conciliar: ${err.message || err}`);
    } finally { setAprobando(false); }
  };

  const columns: ColumnDef<ConciliacionRow>[] = [
    {
      header: '', key: 'id', sortable: false,
      render: r => r.estado_id === ESTADO_PENDIENTE ? (
        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="w-4 h-4 accent-indigo-600" />
      ) : null,
    },
    { header: 'Orden Maestra', key: 'orden_maestra', sortable: true, render: r => <span className="font-mono font-black text-slate-900">{r.orden_maestra || '—'}</span> },
    { header: 'Unidades Reales', key: 'unidades_reales', sortable: true, render: r => r.unidades_reales ?? '—' },
    { header: 'Documento Compras', key: 'documento_compras', sortable: true, render: r => <span className="font-mono">{r.documento_compras || '—'}</span> },
    { header: 'Factura', key: 'factura', sortable: true, render: r => r.factura || '—' },
    { header: 'Valor por OM', key: 'valor_por_om', sortable: true, render: r => <span className="font-black text-slate-800">{fmtCOP(r.valor_por_om)}</span> },
    { header: 'Tarifa', key: 'tarifa', sortable: true, render: r => fmtCOP(r.tarifa) },
    { header: 'Flete Ida', key: 'flete_ida', sortable: true, render: r => fmtCOP(r.flete_ida) },
    { header: 'Manifiesto Ida', key: 'manifiesto_ida', sortable: true, render: r => r.manifiesto_ida || '—' },
    { header: 'Remesa Ida', key: 'remesa_ida', sortable: true, render: r => r.remesa_ida || '—' },
    { header: 'Pedido SAP', key: 'pedido_sap', sortable: true, render: r => r.pedido_sap || '—' },
    { header: 'Flete Regreso', key: 'flete_regreso', sortable: true, render: r => fmtCOP(r.flete_regreso) },
    { header: 'Manifiesto Regreso', key: 'manifiesto_regreso', sortable: true, render: r => r.manifiesto_regreso || '—' },
    { header: 'Remesa Regreso', key: 'remesa_regreso', sortable: true, render: r => r.remesa_regreso || '—' },
    { header: 'Cantidad Ingresada al CEDI', key: 'cantidad_ingresada_cedi', sortable: true, render: r => r.cantidad_ingresada_cedi ?? 0 },
    { header: 'Liquidacion Factura', key: 'liquidacion_factura', sortable: true, render: r => fmtDate(r.liquidacion_factura) },
    { header: 'Confeccionista', key: 'confeccionista_nombre', sortable: true, render: r => r.confeccionista_nombre || '—' },
    {
      header: 'Estado', key: 'estado', sortable: true,
      render: r => <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${ESTADO_COLORS[r.estado_id] || 'bg-slate-100 text-slate-500'}`}>{r.estado || r.estado_id}</span>,
    },
    {
      header: 'Acciones', key: 'id', sortable: false,
      render: r => r.estado_id !== ESTADO_PENDIENTE ? null : (
        <button
          disabled={aprobando}
          onClick={() => r.pedido_sap
            ? setAprobarTarget({ codigo_sap: r.pedido_sap, label: `Pedido SAP ${r.pedido_sap}` })
            : setAprobarTarget({ ids: [r.id], label: `OM ${r.orden_maestra}` })}
          title={r.pedido_sap ? `Aprueba todas las filas pendientes con Pedido SAP ${r.pedido_sap}` : 'Aprobar esta fila'}
          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-black text-[9px] uppercase"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar
        </button>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 mb-5">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Filtrar por rango de fecha (opcional)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Desde</label><input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className={labelCls}>Hasta</label><input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="flex items-end gap-2 col-span-2">
            <button onClick={consultar} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Consultar
            </button>
            <button onClick={limpiar}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest">
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {!buscado ? (
        <div className="flex flex-col items-center justify-center py-24 gap-2">
          <Search className="w-10 h-10 text-slate-300" />
          <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Consulta de Conciliación</p>
          <p className="text-[10px] text-slate-400">Aplica un rango de fechas (o deja vacío para ver todo) y presiona Consultar</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 mb-4 flex flex-wrap items-end gap-3">
            <div className="w-56">
              <label className={labelCls}>Filtrar por Pedido SAP</label>
              <input className={inputCls} value={pedidoSap} onChange={e => setPedidoSap(e.target.value)} placeholder="Ej: SAP-12345" />
            </div>
            <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-indigo-600"
                checked={pendientesVisibles.length > 0 && pendientesVisibles.every(r => selected.has(r.id))}
                onChange={toggleSelectAll} disabled={!pendientesVisibles.length} />
              Seleccionar todos los pendientes ({pendientesVisibles.length})
            </label>
            {seleccionadosPendientes.length > 0 && (
              <button
                disabled={aprobando}
                onClick={() => setAprobarTarget({ ids: seleccionadosPendientes, label: `${seleccionadosPendientes.length} fila(s) seleccionada(s)` })}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">
                {aprobando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Aprobar seleccionados ({seleccionadosPendientes.length})
              </button>
            )}
          </div>

          <DataTable<ConciliacionRow>
            data={filteredRows}
            columns={columns}
            searchPlaceholder="Buscar OM, OC, confeccionista..."
            excelFileName="conciliacion_jhon_uribe.xlsx"
            excelSheetName="Conciliación"
            loading={loading}
          />
        </>
      )}

      {/* Confirmar aprobación — nota opcional */}
      {aprobarTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <p className="text-base font-black text-slate-800 mb-1">Aprobar Conciliación</p>
            <p className="text-sm text-slate-500 mb-4">{aprobarTarget.label}</p>
            <label className={labelCls}>Nota (opcional)</label>
            <textarea value={aprobarNota} onChange={e => setAprobarNota(e.target.value)} rows={3}
              placeholder="Observación de la conciliación..."
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <div className="flex gap-3">
              <button onClick={() => { setAprobarTarget(null); setAprobarNota(''); }} disabled={aprobando}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition">
                Cancelar
              </button>
              <button onClick={confirmarAprobar} disabled={aprobando}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50 transition">
                {aprobando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {aprobando ? 'Aprobando…' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
