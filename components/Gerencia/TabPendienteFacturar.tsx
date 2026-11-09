import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Check, ChevronDown, Download, FileText, RefreshCw, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { api } from '../../services/api';

/**
 * Pestaña "Pendiente por Facturar": manifiestos no anulados sin factura CxC,
 * filtrables por uno, varios o todos los clientes y rango de fecha de manifiesto opcional.
 * El Excel trae el resumen por cliente/mes y el detalle con las mismas columnas de "Consultas".
 */

interface Props {
  managementClients: string[];
}

const PAGE_SIZE = 20000;

const num = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

/** Fecha local YYYY-MM-DD; los TIMESTAMPTZ llegan como ISO con -05:00. */
const fechaDia = (val: any): string => {
  if (!val) return '';
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
};

const money = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const mesLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('es-CO', { month: 'short', year: 'numeric' }).toUpperCase();
};

const diasDesde = (dia: string): number | '' => {
  if (!dia) return '';
  const [y, m, d] = dia.split('-').map(Number);
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((base.getTime() - new Date(y, m - 1, d).getTime()) / 86400000));
};

export const TabPendienteFacturar: React.FC<Props> = ({ managementClients }) => {
  const [selected, setSelected] = useState<string[]>(['ALL']);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [consultaInfo, setConsultaInfo] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggleClient = (c: string) => {
    if (selected.includes('ALL')) { setSelected([c]); return; }
    const next = selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c];
    setSelected(next.length === 0 ? ['ALL'] : next);
  };

  const consultar = async () => {
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      toast.error('Seleccione ambas fechas o deje las dos vacías para consultar todo el histórico.');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error('La fecha desde no puede ser mayor que la fecha hasta.');
      return;
    }
    setLoading(true);
    try {
      // Se trae todo lo pendiente del rango y se filtra el cliente aquí con coincidencia exacta
      // (el filtro del servidor parte por comas y nombres como "LOGISTICA, TRANSPORTE..." fallarían).
      const all: any[] = [];
      let page = 1;
      let total = Infinity;
      while (all.length < total) {
        const res = await (api as any).getManagementReports({
          page, limit: PAGE_SIZE, fromDate: fromDate || undefined, toDate: toDate || undefined,
          sortBy: 'manifest_date', sortDirection: 'asc', pendingInvoice: true,
        });
        const recs: any[] = res?.records || [];
        total = Number(res?.total ?? recs.length);
        all.push(...recs);
        if (recs.length < PAGE_SIZE) break;
        page++;
      }
      const set = new Set(selected.map(s => s.trim().toUpperCase()));
      const filtrados = selected.includes('ALL')
        ? all
        : all.filter(r => set.has(String(r.client_name || '').trim().toUpperCase()));
      setRows(filtrados);
      const quien = selected.includes('ALL') ? 'todos los clientes' : `${selected.length} cliente(s)`;
      const rango = fromDate ? `${fromDate} a ${toDate}` : 'todo el histórico';
      setConsultaInfo(`${quien} · ${rango}`);
      if (filtrados.length === 0) toast.info('No hay manifiestos pendientes por facturar con esos filtros.');
    } catch (err: any) {
      console.error('[PENDIENTE-FACTURAR-ERR]', err);
      toast.error('No se pudo consultar lo pendiente por facturar.');
    } finally {
      setLoading(false);
    }
  };

  const resumen = useMemo(() => {
    if (!rows) return null;
    const meses = new Set<string>();
    const map = new Map<string, { cliente: string; cxc: number; cxp: number; manifiestos: number; meses: Record<string, number> }>();
    rows.forEach(r => {
      const cliente = String(r.client_name || 'S/I').trim().toUpperCase();
      const cxcBase = num(r.total_cxc);
      const cxc = cxcBase === 0 ? num(r.total_value_cxc_final) : cxcBase;
      const cxp = num(r.total_value_cxp_final);
      const mes = fechaDia(r.manifest_date).slice(0, 7) || 'S/F';
      meses.add(mes);
      if (!map.has(cliente)) map.set(cliente, { cliente, cxc: 0, cxp: 0, manifiestos: 0, meses: {} });
      const c = map.get(cliente)!;
      c.cxc += cxc;
      c.cxp += cxp;
      c.manifiestos += 1;
      c.meses[mes] = (c.meses[mes] || 0) + cxc;
    });
    const mesesOrden = Array.from(meses).sort();
    const clientes = Array.from(map.values()).sort((a, b) => b.cxc - a.cxc);
    const totales = clientes.reduce(
      (t, c) => {
        t.cxc += c.cxc; t.cxp += c.cxp; t.manifiestos += c.manifiestos;
        mesesOrden.forEach(m => { t.meses[m] = (t.meses[m] || 0) + (c.meses[m] || 0); });
        return t;
      },
      { cxc: 0, cxp: 0, manifiestos: 0, meses: {} as Record<string, number> },
    );
    return { mesesOrden, clientes, totales };
  }, [rows]);

  const descargarExcel = () => {
    if (!rows || !resumen || rows.length === 0) {
      toast.error('Primero consulte la información a descargar.');
      return;
    }
    const { mesesOrden, clientes, totales } = resumen;
    const etiquetaMes = (m: string) => (m === 'S/F' ? 'SIN FECHA' : mesLabel(m));

    const hojaResumen = clientes.map(c => {
      const fila: Record<string, any> = {
        CLIENTE: c.cliente,
        MANIFIESTOS: c.manifiestos,
        'VALOR CXC': Math.round(c.cxc),
        'VALOR CXP': Math.round(c.cxp),
        'INGRESOS PROPIOS': Math.round(c.cxc - c.cxp),
      };
      mesesOrden.forEach(m => { fila[etiquetaMes(m)] = Math.round(c.meses[m] || 0); });
      return fila;
    });
    const filaTotal: Record<string, any> = {
      CLIENTE: 'TOTAL', MANIFIESTOS: totales.manifiestos,
      'VALOR CXC': Math.round(totales.cxc), 'VALOR CXP': Math.round(totales.cxp),
      'INGRESOS PROPIOS': Math.round(totales.cxc - totales.cxp),
    };
    mesesOrden.forEach(m => { filaTotal[etiquetaMes(m)] = Math.round(totales.meses[m] || 0); });
    hojaResumen.push(filaTotal);

    // Mismas columnas que la exportación de "Consultas de Información" + días sin facturar
    const hojaDetalle = rows.map(r => {
      const diaMan = fechaDia(r.manifest_date);
      return {
        'Número OC': r.oc_number,
        'Estado OC': r.oc_status,
        'Fecha OC': fechaDia(r.oc_date),
        'Número Remesa': r.remesa_number,
        'Remisión': r.remission,
        'Estado Remesa': r.remission_status,
        'Fecha Remesa': fechaDia(r.remission_date),
        'Número Manifiesto': r.manifest_number,
        'Orden Cliente': r.client_order,
        'Observaciones Manifiesto': r.manifest_observations,
        'Estado Manifiesto': r.manifest_status,
        'Fecha Manifiesto': diaMan,
        'Días sin facturar': diasDesde(diaMan),
        'Placa': r.plate,
        'Nombre Cliente': r.client_name,
        'Valor Total CXC final': num(r.total_value_cxc_final),
        'Valor Tot CXP final': num(r.total_value_cxp_final),
        'Factura CXC': r.invoice_cxc,
        'Recibo': r.receipt,
        'Fecha Factura': fechaDia(r.invoice_date),
        'Total CXC': num(r.total_cxc),
        'Egreso': r.egress,
        'Fecha CXP': fechaDia(r.cxp_date),
        'Total CXP': num(r.total_cxp),
      };
    });

    const formatoMoneda = (ws: XLSX.WorkSheet, columnas: string[]) => {
      if (!ws['!ref']) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const objetivo = new Set<number>();
      for (let C = range.s.c; C <= range.e.c; C++) {
        const h = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (h && columnas.includes(String(h.v))) objetivo.add(C);
      }
      for (let R = 1; R <= range.e.r; R++) {
        objetivo.forEach(C => {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.t === 'n') cell.z = '"$"#,##0';
        });
      }
    };

    const anchos = (data: Record<string, any>[]) =>
      Object.keys(data[0] || {}).map(k => ({
        wch: Math.min(45, Math.max(k.length, ...data.slice(0, 500).map(f => String(f[k] ?? '').length)) + 2),
      }));

    const wsResumen = XLSX.utils.json_to_sheet(hojaResumen);
    formatoMoneda(wsResumen, ['VALOR CXC', 'VALOR CXP', 'INGRESOS PROPIOS', ...mesesOrden.map(etiquetaMes)]);
    wsResumen['!cols'] = anchos(hojaResumen);

    const wsDetalle = XLSX.utils.json_to_sheet(hojaDetalle);
    formatoMoneda(wsDetalle, ['Valor Total CXC final', 'Valor Tot CXP final', 'Total CXC', 'Total CXP']);
    wsDetalle['!cols'] = anchos(hojaDetalle);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen por cliente');
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle manifiestos');

    const sufijoCliente = selected.includes('ALL')
      ? 'Todos'
      : selected.length === 1 ? selected[0].replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) : `${selected.length}_clientes`;
    const sufijoFecha = fromDate ? `${fromDate}_a_${toDate}` : `historico_${new Date().toISOString().slice(0, 10)}`;
    XLSX.writeFile(wb, `Pendiente_Facturar_${sufijoCliente}_${sufijoFecha}.xlsx`);
    toast.success('Excel de pendiente por facturar descargado.');
  };

  const clientesVisibles = managementClients.filter(c => c.toLowerCase().includes(clientFilter.toLowerCase()));

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Filtros */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col space-y-1 relative" ref={dropdownRef}>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cliente(s)</span>
            <button
              type="button"
              onClick={() => setDropdownOpen(o => !o)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-slate-700 min-w-[260px] h-[36px] flex justify-between items-center hover:bg-slate-100"
            >
              <span className="truncate max-w-[210px]">
                {selected.includes('ALL') ? 'TODOS LOS CLIENTES' : selected.length === 1 ? selected[0] : `${selected.length} SELECCIONADOS`}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-[340px] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50">
                <div className="p-2 border-b border-slate-100 relative">
                  <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    value={clientFilter}
                    onChange={e => setClientFilter(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="max-h-[280px] overflow-y-auto py-1">
                  <div
                    onClick={() => setSelected(['ALL'])}
                    className={`px-4 py-2 text-[10px] font-black cursor-pointer hover:bg-slate-50 flex items-center gap-2.5 ${selected.includes('ALL') ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${selected.includes('ALL') ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                      {selected.includes('ALL') && <Check size={10} className="text-white" />}
                    </span>
                    TODOS
                  </div>
                  {clientesVisibles.map(c => {
                    const on = !selected.includes('ALL') && selected.includes(c);
                    return (
                      <div
                        key={c}
                        onClick={() => toggleClient(c)}
                        className={`px-4 py-2 text-[10px] font-black cursor-pointer hover:bg-slate-50 flex items-center gap-2.5 ${on ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                      >
                        <span className={`w-3.5 h-3.5 flex-shrink-0 rounded flex items-center justify-center border ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {on && <Check size={10} className="text-white" />}
                        </span>
                        <span className="truncate">{c}</span>
                      </div>
                    );
                  })}
                  {clientesVisibles.length === 0 && (
                    <p className="px-4 py-3 text-[10px] font-bold text-slate-400">Sin coincidencias</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha desde (manifiesto)</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-700 focus:bg-white focus:outline-none" />
          </div>
          <div className="flex flex-col space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha hasta (manifiesto)</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-700 focus:bg-white focus:outline-none" />
          </div>
          {(fromDate || toDate || !selected.includes('ALL')) && (
            <button type="button" onClick={() => { setFromDate(''); setToDate(''); setSelected(['ALL']); }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <X size={13} /> Limpiar
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={consultar} disabled={loading}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/20 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Consultando...' : 'Consultar'}
          </button>
          <button type="button" onClick={descargarExcel} disabled={!rows || rows.length === 0}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/15 disabled:opacity-40">
            <Download size={14} /> Descargar Excel
          </button>
        </div>
      </div>
      <p className="text-[11px] font-medium text-slate-500 -mt-2 px-1">
        Manifiestos no anulados sin factura CxC. Sin fechas se consulta todo el histórico pendiente.
      </p>

      {/* Resultado */}
      {!resumen ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center shadow-sm">
          <FileText className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-black text-slate-500 uppercase tracking-wider">Seleccione cliente(s) y consulte</p>
          <p className="text-xs text-slate-400 mt-1">Puede elegir un cliente, varios o todos; el rango de fechas es opcional.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { l: 'Manifiestos pendientes', v: resumen.totales.manifiestos.toLocaleString('es-CO'), c: 'text-slate-800' },
              { l: 'Valor CxC pendiente', v: money(resumen.totales.cxc), c: 'text-indigo-600' },
              { l: 'Valor CxP', v: money(resumen.totales.cxp), c: 'text-slate-600' },
              { l: 'Clientes', v: String(resumen.clientes.length), c: 'text-emerald-600' },
            ].map(k => (
              <div key={k.l} className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{k.l}</p>
                <p className={`mt-1 text-lg font-black font-mono ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Pendiente por facturar por cliente</h3>
              <p className="text-xs text-slate-500 font-medium">{consultaInfo}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-3 text-left sticky left-0 bg-slate-50">Cliente</th>
                    <th className="p-3 text-right">Manif.</th>
                    <th className="p-3 text-right">Valor CxC</th>
                    <th className="p-3 text-right">Valor CxP</th>
                    {resumen.mesesOrden.map(m => (
                      <th key={m} className="p-3 text-right whitespace-nowrap">{m === 'S/F' ? 'SIN FECHA' : mesLabel(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumen.clientes.map(c => (
                    <tr key={c.cliente} className="hover:bg-slate-50/60">
                      <td className="p-3 font-bold text-slate-800 sticky left-0 bg-white">{c.cliente}</td>
                      <td className="p-3 text-right font-mono">{c.manifiestos}</td>
                      <td className="p-3 text-right font-mono font-bold text-indigo-600">{money(c.cxc)}</td>
                      <td className="p-3 text-right font-mono text-slate-600">{money(c.cxp)}</td>
                      {resumen.mesesOrden.map(m => (
                        <td key={m} className="p-3 text-right font-mono text-slate-700">{c.meses[m] ? money(c.meses[m]) : '—'}</td>
                      ))}
                    </tr>
                  ))}
                  {resumen.clientes.length === 0 && (
                    <tr><td colSpan={4 + resumen.mesesOrden.length} className="p-8 text-center text-slate-400 font-bold">No hay pendientes por facturar.</td></tr>
                  )}
                </tbody>
                {resumen.clientes.length > 0 && (
                  <tfoot className="bg-slate-900 text-white font-black">
                    <tr>
                      <td className="p-3 sticky left-0 bg-slate-900">TOTAL</td>
                      <td className="p-3 text-right font-mono">{resumen.totales.manifiestos}</td>
                      <td className="p-3 text-right font-mono">{money(resumen.totales.cxc)}</td>
                      <td className="p-3 text-right font-mono">{money(resumen.totales.cxp)}</td>
                      {resumen.mesesOrden.map(m => (
                        <td key={m} className="p-3 text-right font-mono">{money(resumen.totales.meses[m] || 0)}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabPendienteFacturar;
