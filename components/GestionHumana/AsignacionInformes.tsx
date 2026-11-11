import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { api } from '../../services/api';
import { formatDate } from '../../utils/formatting';
import { BarChart3, Search, FileSpreadsheet, Users, Package, Clock, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react';
import SearchableSelect from './shared/SearchableSelect';
import MultiSearchableSelect from './shared/MultiSearchableSelect';

type Modo = 'GENERAL' | 'OPERACION' | 'FUNCIONARIO';

/** gh_personal.estado usa códigos maestros: EST-01 = activo. */
const esActivo = (estado?: string | null) => !estado || estado === 'EST-01' || estado.toUpperCase() === 'ACTIVO';

interface Props {
  personalList: any[];
}

/**
 * Informe de antigüedad: elementos que el personal tiene en su poder entregados hace más de X meses.
 * El backend reparte el saldo actual en las entregas más recientes (las devoluciones consumen lo más antiguo).
 */
const AsignacionInformes: React.FC<Props> = ({ personalList }) => {
  const [modo, setModo] = useState<Modo>('GENERAL');
  const [operacionesSel, setOperacionesSel] = useState<string[]>([]);
  const [operaciones, setOperaciones] = useState<string[]>([]);
  const [personalId, setPersonalId] = useState('');
  const [meses, setMeses] = useState<number>(6);
  const [incluirSinSoporte, setIncluirSinSoporte] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [mesesConsultados, setMesesConsultados] = useState(6);
  const [loading, setLoading] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroElemento, setFiltroElemento] = useState('');
  // Paginación de la tabla (inicia en 5 registros)
  const [pageSize, setPageSize] = useState<number | 'all'>(5);
  const [page, setPage] = useState(1);

  const consultar = async () => {
    if (modo === 'OPERACION' && !operacionesSel.length) { toast.error('Seleccione al menos una operación.'); return; }
    if (modo === 'FUNCIONARIO' && !personalId) { toast.error('Seleccione el funcionario.'); return; }
    if (!(meses >= 0)) { toast.error('Indique los meses.'); return; }
    setLoading(true);
    try {
      const res = await api.getGhInformeAntiguedad({
        meses,
        operacion: modo === 'OPERACION' ? operacionesSel : undefined,
        personal_id: modo === 'FUNCIONARIO' ? personalId : undefined,
        incluir_sin_soporte: incluirSinSoporte,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo generar el informe');
      setRows(res.data || []);
      setMesesConsultados(meses);
      if (Array.isArray(res.operaciones)) setOperaciones(res.operaciones);
      setFiltroElemento('');
      if (!res.data?.length) toast.info(`No hay elementos en poder del personal con más de ${meses} mes(es).`);
    } catch (e: any) {
      toast.error(e.message || 'Error al consultar el informe');
    } finally {
      setLoading(false);
    }
  };

  // Cargar operaciones al abrir el selector por primera vez
  const asegurarOperaciones = async () => {
    if (operaciones.length) return;
    try {
      const res = await api.getGhInformeAntiguedad({ meses: 240, personal_id: -1 });
      if (Array.isArray(res.operaciones)) setOperaciones(res.operaciones);
    } catch { /* se cargan al consultar */ }
  };

  const elementosDisponibles = useMemo(
    () => Array.from(new Set((rows || []).map(r => r.elemento_nombre).filter(Boolean))).sort(),
    [rows]);

  const visibles = useMemo(() => {
    const q = filtroTexto.trim().toUpperCase();
    return (rows || []).filter(r =>
      (!filtroElemento || r.elemento_nombre === filtroElemento) &&
      (!q || `${r.personal_nombre} ${r.personal_documento} ${r.personal_operacion} ${r.elemento_nombre} ${r.personal_cargo || ''} ${r.personal_placa || ''}`.toUpperCase().includes(q)));
  }, [rows, filtroTexto, filtroElemento]);

  const totalPaginas = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(visibles.length / pageSize));
  const paginaActual = Math.min(page, totalPaginas);
  const paginados = useMemo(
    () => (pageSize === 'all' ? visibles : visibles.slice((paginaActual - 1) * pageSize, paginaActual * pageSize)),
    [visibles, pageSize, paginaActual]
  );
  // Al cambiar los filtros o el resultado se vuelve a la primera página
  React.useEffect(() => { setPage(1); }, [filtroTexto, filtroElemento, rows]);

  const kpis = useMemo(() => ({
    funcionarios: new Set(visibles.map(r => r.personal_id)).size,
    registros: visibles.length,
    unidades: visibles.reduce((s, r) => s + Number(r.unidades_vencidas || 0), 0),
    sinSoporte: visibles.reduce((s, r) => s + Number(r.sin_soporte || 0), 0),
    maxMeses: visibles.reduce((m, r) => Math.max(m, Number(r.meses_antiguedad || 0)), 0),
  }), [visibles]);

  const colorMeses = (m: number | null) => {
    if (m == null) return 'bg-slate-100 text-slate-500 border-slate-200';
    if (m >= 12) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (m >= 6) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  const exportar = () => {
    if (!visibles.length) { toast.error('No hay datos para exportar.'); return; }
    const detalle = visibles.map(r => ({
      'Funcionario': r.personal_nombre,
      'Cédula': r.personal_documento,
      'Cargo': r.personal_cargo || '',
      'Operación': r.personal_operacion || '',
      'Placa': r.personal_placa || '',
      'Estado funcionario': esActivo(r.personal_estado) ? 'ACTIVO' : 'INACTIVO',
      'Elemento': r.elemento_nombre,
      'Saldo en poder': Number(r.stock),
      [`Unidades > ${mesesConsultados} meses`]: Number(r.unidades_vencidas),
      'Sin entrega registrada': Number(r.sin_soporte),
      'Entrega más antigua en poder': r.fecha_mas_antigua ? formatDate(r.fecha_mas_antigua) : '',
      'Meses de antigüedad': r.meses_antiguedad ?? '',
      'Última entrega': r.fecha_ultima_entrega ? formatDate(r.fecha_ultima_entrega) : '',
      'Asignaciones (en poder)': (r.entregas || []).map((e: any) => `${e.numero} (${formatDate(e.fecha)}: ${e.en_poder})`).join(' | '),
    }));
    const porFuncionario = new Map<string, any>();
    for (const r of visibles) {
      const k = String(r.personal_id);
      const acc = porFuncionario.get(k) || {
        'Funcionario': r.personal_nombre, 'Cédula': r.personal_documento, 'Operación': r.personal_operacion || '',
        'Cargo': r.personal_cargo || '', 'Elementos': 0, 'Saldo en poder': 0, [`Unidades > ${mesesConsultados} meses`]: 0,
        'Sin entrega registrada': 0, 'Máx. meses': 0,
      };
      acc['Elementos'] += 1;
      acc['Saldo en poder'] += Number(r.stock);
      acc[`Unidades > ${mesesConsultados} meses`] += Number(r.unidades_vencidas);
      acc['Sin entrega registrada'] += Number(r.sin_soporte);
      acc['Máx. meses'] = Math.max(acc['Máx. meses'], Number(r.meses_antiguedad || 0));
      porFuncionario.set(k, acc);
    }
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(Array.from(porFuncionario.values()));
    ws1['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por funcionario');
    const ws2 = XLSX.utils.json_to_sheet(detalle);
    ws2['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');
    const sufijo = modo === 'OPERACION' ? `_${operacionesSel.length === 1 ? operacionesSel[0] : `${operacionesSel.length}_operaciones`}` : modo === 'FUNCIONARIO' ? `_${visibles[0]?.personal_documento || personalId}` : '_GENERAL';
    XLSX.writeFile(wb, `GH_Antiguedad_Entregas_${mesesConsultados}m${sufijo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const inputCls = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-xs font-semibold';
  const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5';

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-amber-500" />
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Elementos en poder con más de X meses de entregados</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div>
            <label className={labelCls}>Consultar por</label>
            <SearchableSelect
              placeholder="Seleccione..."
              value={modo}
              onChange={val => { setModo(val as Modo); if (val === 'OPERACION') asegurarOperaciones(); }}
              options={[
                { value: 'GENERAL', label: 'General' },
                { value: 'OPERACION', label: 'Operación' },
                { value: 'FUNCIONARIO', label: 'Conductor / Funcionario' }
              ]}
            />
          </div>

          {modo === 'OPERACION' && (
            <div className="md:col-span-2">
              <label className={labelCls}>Operación(es)</label>
              <MultiSearchableSelect
                placeholder="Seleccione una o varias..."
                values={operacionesSel}
                onChange={setOperacionesSel}
                options={operaciones.map(o => ({ value: o, label: o }))}
              />
            </div>
          )}

          {modo === 'FUNCIONARIO' && (
            <div className="md:col-span-2">
              <label className={labelCls}>Funcionario</label>
              <SearchableSelect
                placeholder="Seleccione..."
                value={personalId}
                onChange={setPersonalId}
                options={personalList.map(p => ({ value: p.id, label: `${p.nombre} (${p.cedula})` }))}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Entregado hace más de</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={240} value={meses} onChange={e => setMeses(Number(e.target.value))} className={inputCls} />
              <span className="text-[10px] font-black text-slate-500 uppercase">meses</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 pb-2.5 cursor-pointer md:col-span-1">
            <input type="checkbox" checked={incluirSinSoporte} onChange={e => setIncluirSinSoporte(e.target.checked)} className="rounded" />
            Incluir saldos sin entrega registrada
          </label>

          <button onClick={consultar} disabled={loading}
            className="py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-xs uppercase disabled:opacity-60">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Consultar
          </button>
        </div>
      </div>

      {rows && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Funcionarios', value: kpis.funcionarios, icon: <Users size={16} className="text-indigo-500" /> },
              { label: 'Elementos (registros)', value: kpis.registros, icon: <Package size={16} className="text-slate-500" /> },
              { label: `Unidades > ${mesesConsultados} meses`, value: kpis.unidades, icon: <AlertTriangle size={16} className="text-amber-500" /> },
              { label: 'Antigüedad máxima', value: `${kpis.maxMeses} meses`, icon: <Clock size={16} className="text-rose-500" /> },
            ].map(k => (
              <div key={k.label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">{k.icon}{k.label}</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{k.value}</div>
              </div>
            ))}
          </div>
          {kpis.sinSoporte > 0 && (
            <p className="text-[11px] font-semibold text-slate-500">
              {kpis.sinSoporte} unidad(es) del saldo no tienen una asignación registrada que las respalde (cargues iniciales o ajustes).
            </p>
          )}

          {/* Tabla */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between border-b border-slate-100">
              <div className="flex flex-col md:flex-row gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} placeholder="Buscar funcionario, operación, elemento, placa..."
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900" />
                </div>
                <div className="w-full md:w-72">
                  <SearchableSelect
                    placeholder="Todos los elementos"
                    value={filtroElemento}
                    onChange={setFiltroElemento}
                    options={[{ value: '', label: 'Todos los elementos' }, ...elementosDisponibles.map(e => ({ value: e, label: e }))]}
                  />
                </div>
              </div>
              <button onClick={exportar} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet size={14} /> Exportar Excel
              </button>
            </div>
            <div className="overflow-x-auto max-h-[65vh] custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">
                    <th className="p-3 pl-5">Funcionario</th>
                    <th className="p-3">Operación</th>
                    <th className="p-3">Elemento</th>
                    <th className="p-3 text-center">Saldo</th>
                    <th className="p-3 text-center">&gt; {mesesConsultados} meses</th>
                    <th className="p-3">Entrega más antigua</th>
                    <th className="p-3 text-center">Antigüedad</th>
                    <th className="p-3">Última entrega</th>
                    <th className="p-3">Asignaciones en poder</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold">Sin resultados</td></tr>
                  )}
                  {paginados.map((r, i) => (
                    <tr key={`${r.personal_id}-${r.elemento_id}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="p-3 pl-5">
                        <div className="font-black text-slate-800 uppercase">{r.personal_nombre}</div>
                        <div className="text-[10px] text-slate-400 font-bold">
                          {r.personal_documento}{r.personal_cargo ? ` · ${r.personal_cargo}` : ''}{r.personal_placa ? ` · ${r.personal_placa}` : ''}
                          {!esActivo(r.personal_estado) && <span className="ml-1 text-rose-600 font-black">· INACTIVO</span>}
                        </div>
                      </td>
                      <td className="p-3 font-bold text-slate-600">{r.personal_operacion || '—'}</td>
                      <td className="p-3 font-bold text-slate-800">{r.elemento_nombre}</td>
                      <td className="p-3 text-center font-black text-slate-900">{r.stock}</td>
                      <td className="p-3 text-center">
                        <span className="font-black text-amber-700">{r.unidades_vencidas}</span>
                        {Number(r.sin_soporte) > 0 && <div className="text-[9px] text-slate-400 font-bold">+{r.sin_soporte} sin soporte</div>}
                      </td>
                      <td className="p-3 font-semibold text-slate-600">{r.fecha_mas_antigua ? formatDate(r.fecha_mas_antigua) : '—'}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black ${colorMeses(r.meses_antiguedad)}`}>
                          {r.meses_antiguedad != null ? `${r.meses_antiguedad} m` : 'N/D'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-600">{r.fecha_ultima_entrega ? formatDate(r.fecha_ultima_entrega) : '—'}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.entregas || []).map((e: any) => (
                            <span key={e.asignacion_id} title={`${formatDate(e.fecha)} · ${e.en_poder} und en poder`}
                              className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded text-[9px] font-black">
                              {e.numero} ×{e.en_poder}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Paginación */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ver:</span>
                <div className="w-28">
                  <SearchableSelect
                    placeholder="5"
                    value={String(pageSize)}
                    onChange={val => { setPageSize(val === 'all' ? 'all' : Number(val)); setPage(1); }}
                    options={[
                      { value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' },
                      { value: '50', label: '50' }, { value: '100', label: '100' }, { value: 'all', label: 'Todos' }
                    ]}
                  />
                </div>
                <span className="text-xs font-bold text-slate-400">{visibles.length} registro(s)</span>
              </div>
              {pageSize !== 'all' && totalPaginas > 1 && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage(Math.max(paginaActual - 1, 1))} disabled={paginaActual === 1}
                    className={`p-2.5 rounded-xl border transition-all ${paginaActual === 1 ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'}`}>
                    <ChevronRight className="w-4 h-4 transform rotate-180" />
                  </button>
                  <span className="px-4 text-xs font-bold text-slate-500">Página {paginaActual} de {totalPaginas}</span>
                  <button onClick={() => setPage(Math.min(paginaActual + 1, totalPaginas))} disabled={paginaActual === totalPaginas}
                    className={`p-2.5 rounded-xl border transition-all ${paginaActual === totalPaginas ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95'}`}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AsignacionInformes;
