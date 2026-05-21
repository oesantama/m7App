import React, { useMemo } from 'react';
import { DataTable } from '../shared/DataTable';
import { Save } from 'lucide-react';

const extractMonth = (fecha: any) => {
  if (!fecha) return 'Sin mes';
  if (typeof fecha === 'number' && fecha > 1) {
    // Usa matemática UTC directa para evitar cambios de día por zona horaria
    const date = new Date((fecha - 25569) * 86400 * 1000);
    return date.toLocaleString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return fecha.toString().trim().substring(0, 7);
};

// Constants
const VALIDATION_STATES = {
  OK: 'OK',
  DISCREPANCY: 'Discrepancia',
  ERROR: 'Error',
  NOVELTY: 'Novedad',
  NOT_FOUND: 'No Encontrado'
};

const VALIDATION_TYPES = {
  FAILED_TRANSPORT: 'Fallida Transporte',
  FAILED_70: 'Fallida 70%',
  FAILED_100: 'Fallida 100%',
  DELIVERED: 'Entregado',
  NOT_DELIVERED: 'No Entregado',
  NOVELTY: 'Novedad',
  DISPATCHED: 'Despachado'
};

interface Props {
  resultados: any[];
  onSave?: () => void;
  guardando?: boolean;
}

export default function DashboardResultadosLB({ resultados, onSave, guardando }: Props) {
  const { stats, resumenTipos, resumenPlacas, resumenMensual } = useMemo(() => {
    if (!resultados || resultados.length === 0) return { stats: {}, resumenTipos: [], resumenPlacas: [], resumenMensual: [] };

    const totalRegistros = resultados.length;
    const fallidasTransporte = resultados.filter(r => r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT).length;
    const coincidencias = resultados.filter(r => r.estado === VALIDATION_STATES.OK).length;
    const discrepancias = resultados.filter(r => r.estado === VALIDATION_STATES.DISCREPANCY).length + resultados.filter(r => r.estado === VALIDATION_STATES.NOT_FOUND).length;
    const novedades = resultados.filter(r => r.estado === VALIDATION_STATES.NOVELTY).length;
    const porcentajeCoincidencia = totalRegistros > 0 ? Math.round((coincidencias / totalRegistros) * 100) : 0;
    
    const totalMilla7 = resultados.reduce((sum, r) => sum + (Number(r.totalMilla7) || 0), 0);
    const valorAdicionalTotal = resultados.reduce((sum, r) => sum + (Number(r.valorAdicional) || 0), 0);
    const diferenciaPositiva = resultados.reduce((sum, r) => sum + (Number(r.diferencia) > 0 ? Number(r.diferencia) : 0), 0);
    const diferenciaNegativa = resultados.reduce((sum, r) => sum + (Number(r.diferencia) < 0 ? Math.abs(Number(r.diferencia)) : 0), 0);
    
    const pagadoOK = resultados.reduce((sum, r) => sum + (r.estado === VALIDATION_STATES.OK ? (Number(r.precioArchivo2) || 0) : 0), 0);
    const totalPagado = resultados.reduce((sum, r) => sum + (Number(r.precioArchivo2) || 0), 0);
    const totalDebido = resultados.reduce((sum, r) => {
      let montoDebido = 0;
      if (r.estado === VALIDATION_STATES.OK) {
        montoDebido = Number(r.precioArchivo2) || 0;
      } else {
        if (r.tipoValidacion === VALIDATION_TYPES.FAILED_70) {
          montoDebido = Number(r.precio70Base) || 0;
        } else if (r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT) {
          montoDebido = 0;
        } else {
          montoDebido = Number(r.precioArchivo1) || 0;
        }
      }
      return sum + montoDebido;
    }, 0);

    const calcStats = {
      totalRegistros, fallidasTransporte, coincidencias, discrepancias,
      porcentajeCoincidencia, novedades, valorNovedades: 0, totalMilla7,
      valorAdicionalTotal, diferenciaPositiva, diferenciaNegativa,
      pagadoOK, totalDebido, totalPagado
    };

    // Resumen Tipos
    const typeCounts: Record<string, any> = {};
    resultados.forEach(r => {
      const tipo = r.tipoValidacion || 'Sin tipo';
      if (!typeCounts[tipo]) typeCounts[tipo] = { cantidad: 0, valorTotal: 0 };
      typeCounts[tipo].cantidad++;
      typeCounts[tipo].valorTotal += Number(r.precioArchivo2) || 0;
    });
    const cResumenTipos = Object.entries(typeCounts).map(([tipo, data]) => ({
      tipoValidacion: tipo,
      cantidad: data.cantidad,
      porcentaje: totalRegistros > 0 ? (data.cantidad / totalRegistros) * 100 : 0,
      valorTotal: data.valorTotal
    })).sort((a, b) => b.cantidad - a.cantidad);

    // Resumen Placas
    const placasData: Record<string, any> = {};
    resultados.forEach(r => {
      const placa = r.placa?.toString().toUpperCase().trim() || 'SIN PLACA';
      if (!placasData[placa]) {
        placasData[placa] = { placa, totalViajes: 0, debePagar: 0, pago: 0, valorAdicional: 0, totalMilla7: 0 };
      }
      placasData[placa].totalViajes++;
      
      let montoDebido = 0;
      if (r.estado === VALIDATION_STATES.OK) {
        montoDebido = Number(r.precioArchivo2) || 0;
      } else {
        if (r.tipoValidacion === VALIDATION_TYPES.FAILED_70) {
          montoDebido = Number(r.precio70Base) || 0;
        } else if (r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT) {
          montoDebido = 0;
        } else {
          montoDebido = Number(r.precioArchivo1) || 0;
        }
      }

      placasData[placa].debePagar += montoDebido;
      placasData[placa].pago += Number(r.precioArchivo2) || 0;
      placasData[placa].valorAdicional += Number(r.valorAdicional) || 0;
      placasData[placa].totalMilla7 += Number(r.totalMilla7) || 0;
    });
    const cResumenPlacas = Object.values(placasData).map(item => {
      const diferencia = item.pago - item.debePagar;
      const ochentaYTres = item.totalMilla7 * 0.83;
      const d_83 = item.pago - ochentaYTres;
      return { ...item, diferenciaNeta: diferencia, ochentaYTres, d_83 };
    }).sort((a, b) => b.totalViajes - a.totalViajes);

    // Resumen Mensual
    const monthlyData: Record<string, any> = {};
    resultados.forEach(r => {
      const mes = r.mes || (r.fecha ? extractMonth(r.fecha) : 'Sin mes');
      if (!monthlyData[mes]) {
        monthlyData[mes] = { mes, totalRegistros: 0, totalMilla7: 0, totalDebido: 0, totalPagado: 0, valorAdicionalTotal: 0 };
      }
      monthlyData[mes].totalRegistros++;
      monthlyData[mes].totalMilla7 += Number(r.totalMilla7) || 0;
      monthlyData[mes].valorAdicionalTotal += Number(r.valorAdicional) || 0;
      
      let montoDebido = 0;
      if (r.estado === VALIDATION_STATES.OK) {
        montoDebido = Number(r.precioArchivo2) || 0;
      } else {
        if (r.tipoValidacion === VALIDATION_TYPES.FAILED_70) {
          montoDebido = Number(r.precio70Base) || 0;
        } else if (r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT) {
          montoDebido = 0;
        } else {
          montoDebido = Number(r.precioArchivo1) || 0;
        }
      }
      
      monthlyData[mes].totalDebido += montoDebido;
      monthlyData[mes].totalPagado += Number(r.precioArchivo2) || 0;
    });
    const cResumenMensual = Object.values(monthlyData).map(item => ({
      ...item,
      diferenciaNeta: item.totalPagado - item.totalDebido
    }));

    return { stats: calcStats, resumenTipos: cResumenTipos, resumenPlacas: cResumenPlacas, resumenMensual: cResumenMensual };
  }, [resultados]);

  const tableColumns = [
    { header: '#', key: 'index' },
    { header: 'Fecha', key: 'fecha', render: (r: any) => {
        if (!r.fecha) return '';
        // Si es un número serial de excel:
        if (!isNaN(Number(r.fecha))) return new Date((Number(r.fecha) - 25569) * 86400 * 1000).toLocaleDateString('es-CO', { timeZone: 'UTC' });
        // Fallback
        const d = new Date(r.fecha);
        return isNaN(d.getTime()) ? r.fecha : d.toLocaleDateString('es-CO', { timeZone: 'UTC' });
    }},
    { header: 'Placa', key: 'placa' },
    { header: 'SYSTRAM', key: 'systram' },
    { header: '# Viaje', key: 'viajePedido' },
    { header: 'Destino', key: 'destino' },
    { header: 'Artículo', key: 'articulo' },
    { header: 'Precio Base', key: 'precioArchivo1', render: (r: any) => `$${Number(r.precioArchivo1).toLocaleString()}` },
    { header: 'Precio 70%', key: 'precio70Base', render: (r: any) => `$${Number(r.precio70Base).toLocaleString()}` },
    { header: 'Pagado', key: 'precioArchivo2', render: (r: any) => `$${Number(r.precioArchivo2).toLocaleString()}` },
    { header: 'Diferencia', key: 'diferencia', render: (r: any) => (
      <span className={Number(r.diferencia) < 0 ? 'text-red-500 font-bold' : Number(r.diferencia) > 0 ? 'text-green-500 font-bold' : ''}>
        ${Number(r.diferencia).toLocaleString()}
      </span>
    )},
    { header: 'Valor Adicional', key: 'valorAdicional', render: (r: any) => `$${Number(r.valorAdicional).toLocaleString()}` },
    { header: 'Total Milla 7', key: 'totalMilla7', render: (r: any) => `$${Number(r.totalMilla7).toLocaleString()}` },
    { header: 'Estado', key: 'estado', render: (r: any) => (
      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
        r.estado === 'OK' ? 'bg-green-100 text-green-700' :
        r.estado === 'Discrepancia' ? 'bg-orange-100 text-orange-700' :
        r.estado === 'Error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
      }`}>{r.estado}</span>
    )},
    { header: 'Tipo', key: 'tipoValidacion' },
    { header: 'Notas', key: 'notasValidacion' },
  ];

  if (!resultados || resultados.length === 0) return null;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-black text-slate-800">Resultados de Validación</h3>
        {onSave && (
          <button 
            onClick={onSave}
            disabled={guardando}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            <Save size={16} />
            {guardando ? 'Guardando...' : 'Guardar Resultados en BD'}
          </button>
        )}
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl text-center shadow-sm">
            <p className="text-3xl font-black text-blue-600">{stats.totalRegistros} - {stats.fallidasTransporte} = {stats.totalRegistros - stats.fallidasTransporte}</p>
            <p className="text-[10px] font-bold text-blue-700 uppercase mt-1">Total Servicios - Fallidas Transporte = total</p>
          </div>
          <div className="bg-green-50 border border-green-200 p-6 rounded-2xl text-center shadow-sm">
            <p className="text-3xl font-black text-green-600">{stats.coincidencias}</p>
            <p className="text-[10px] font-bold text-green-700 uppercase mt-1">Coincidencias</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 p-6 rounded-2xl text-center shadow-sm">
            <p className="text-3xl font-black text-orange-600">{stats.discrepancias}</p>
            <p className="text-[10px] font-bold text-orange-700 uppercase mt-1">Discrepancias</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl text-center shadow-sm">
            <p className="text-3xl font-black text-purple-600">{stats.porcentajeCoincidencia}%</p>
            <p className="text-[10px] font-bold text-purple-700 uppercase mt-1">% Coincidencia</p>
          </div>
        </div>

        <h4 className="text-lg font-black text-slate-500 uppercase tracking-widest mt-8 mb-4">Resumen Financiero</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-teal-50 border border-teal-200 p-4 rounded-2xl text-center shadow-sm">
            <p className="text-xl font-black text-teal-600">${(stats.totalMilla7 || 0).toLocaleString()}</p>
            <p className="text-[10px] font-bold text-teal-700 uppercase mt-1">Total Milla 7</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-center shadow-sm">
            <p className="text-xl font-black text-indigo-600">${(stats.valorAdicionalTotal || 0).toLocaleString()}</p>
            <p className="text-[10px] font-bold text-indigo-700 uppercase mt-1">Valor Pago Auxiliares</p>
          </div>
          <div className="bg-sky-50 border border-sky-200 p-4 rounded-2xl text-center shadow-sm">
            <p className="text-xl font-black text-sky-600">${(stats.diferenciaPositiva || 0).toLocaleString()}</p>
            <p className="text-[10px] font-bold text-sky-700 uppercase mt-1">Diferencia Positiva (+)</p>
          </div>
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-center shadow-sm">
            <p className="text-xl font-black text-rose-600">${(stats.diferenciaNegativa || 0).toLocaleString()}</p>
            <p className="text-[10px] font-bold text-rose-700 uppercase mt-1">Diferencia Negativa (-)</p>
          </div>
          <div className="bg-lime-50 border border-lime-200 p-4 rounded-2xl text-center shadow-sm">
            <p className="text-xl font-black text-lime-600">${(stats.pagadoOK || 0).toLocaleString()}</p>
            <p className="text-[10px] font-bold text-lime-700 uppercase mt-1">Pagado OK</p>
          </div>
        </div>

        <h4 className="text-lg font-black text-slate-500 uppercase tracking-widest mt-8 mb-4">Totales Generales</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-2xl text-center shadow-sm">
            <p className="text-3xl font-black text-yellow-600">${(stats.totalDebido || 0).toLocaleString()}</p>
            <p className="text-xs font-bold text-yellow-700 uppercase mt-1">Total Debido</p>
          </div>
          <div className="bg-cyan-50 border border-cyan-200 p-6 rounded-2xl text-center shadow-sm">
            <p className="text-3xl font-black text-cyan-600">${(stats.totalPagado || 0).toLocaleString()}</p>
            <p className="text-xs font-bold text-cyan-700 uppercase mt-1">Total Pagado</p>
          </div>
          <div className="bg-pink-50 border border-pink-200 p-6 rounded-2xl text-center shadow-sm">
            <p className={`text-3xl font-black ${(stats.totalPagado - stats.totalDebido) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {((stats.totalPagado || 0) - (stats.totalDebido || 0)) >= 0 ? '+' : ''}
              {Math.round((stats.totalPagado || 0) - (stats.totalDebido || 0)).toLocaleString()}
            </p>
            <p className="text-xs font-bold text-pink-700 uppercase mt-1">Diferencia Total</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl mt-8">
        <h3 className="text-xl font-black text-slate-800 mb-6">Resultados de Validación</h3>
        <DataTable
          data={resultados}
          columns={tableColumns}
          searchPlaceholder="Buscar por placa, viaje o destino..."
          excelFileName="Resultados_Validacion_LB.xlsx"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl">
          <h3 className="text-xl font-black text-slate-800 mb-6">Resumen por Tipo de Validación</h3>
          <DataTable
            data={resumenTipos}
            columns={[
              { header: 'Tipo de Validación', key: 'tipoValidacion' },
              { header: 'Cantidad', key: 'cantidad' },
              { header: 'Porcentaje', key: 'porcentaje', render: (r: any) => `${Math.round(r.porcentaje)}%` },
              { header: 'Valor Total', key: 'valorTotal', render: (r: any) => `$${Number(r.valorTotal).toLocaleString()}` },
            ]}
            searchPlaceholder="Buscar tipo..."
            excelFileName="Resumen_Tipos_LB.xlsx"
          />
        </div>
        
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl">
          <h3 className="text-xl font-black text-slate-800 mb-6">Resumen Mensual</h3>
          <DataTable
            data={resumenMensual}
            columns={[
              { header: 'Mes', key: 'mes' },
              { header: 'Servicios', key: 'totalRegistros' },
              { header: 'Total Milla 7', key: 'totalMilla7', render: (r: any) => `$${Number(r.totalMilla7).toLocaleString()}` },
              { header: 'Total Debido', key: 'totalDebido', render: (r: any) => `$${Number(r.totalDebido).toLocaleString()}` },
              { header: 'Total Pagado', key: 'totalPagado', render: (r: any) => `$${Number(r.totalPagado).toLocaleString()}` },
              { header: 'Dif. Neta', key: 'diferenciaNeta', render: (r: any) => (
                <span className={r.diferenciaNeta < 0 ? 'text-red-500 font-bold' : r.diferenciaNeta > 0 ? 'text-green-500 font-bold' : ''}>
                  ${Number(r.diferenciaNeta).toLocaleString()}
                </span>
              )},
            ]}
            searchPlaceholder="Buscar mes..."
            excelFileName="Resumen_Mensual_LB.xlsx"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl mt-8">
        <h3 className="text-xl font-black text-slate-800 mb-6">Discriminado por Placa</h3>
        <DataTable
          data={resumenPlacas}
          columns={[
            { header: 'Placa', key: 'placa', render: (r: any) => <span className="font-bold">{r.placa}</span> },
            { header: 'Viajes', key: 'totalViajes' },
            { header: 'Debe Pagar', key: 'debePagar', render: (r: any) => `$${Number(r.debePagar).toLocaleString()}` },
            { header: 'Pago', key: 'pago', render: (r: any) => `$${Number(r.pago).toLocaleString()}` },
            { header: 'Diferencia', key: 'diferenciaNeta', render: (r: any) => (
              <span className={r.diferenciaNeta < 0 ? 'text-red-500 font-bold' : r.diferenciaNeta > 0 ? 'text-green-500 font-bold' : ''}>
                ${Number(r.diferenciaNeta).toLocaleString()}
              </span>
            )},
            { header: 'Total Milla 7', key: 'totalMilla7', render: (r: any) => `$${Number(r.totalMilla7).toLocaleString()}` },
            { header: 'Auxiliar', key: 'valorAdicional', render: (r: any) => `$${Number(r.valorAdicional).toLocaleString()}` },
            { header: '83% Milla 7', key: 'ochentaYTres', render: (r: any) => `$${Number(Math.round(r.ochentaYTres)).toLocaleString()}` },
            { header: 'Dif 83%', key: 'd_83', render: (r: any) => (
              <span className={r.d_83 < 0 ? 'text-red-500 font-bold' : r.d_83 > 0 ? 'text-green-500 font-bold' : ''}>
                ${Number(Math.round(r.d_83)).toLocaleString()}
              </span>
            )},
          ]}
          searchPlaceholder="Buscar placa..."
          excelFileName="Resumen_Placas_LB.xlsx"
        />
      </div>
    </div>
  );
}
