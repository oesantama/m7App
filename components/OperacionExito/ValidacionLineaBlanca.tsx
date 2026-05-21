import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, DollarSign, Activity, FileSpreadsheet, Download, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { DataTable } from '../shared/DataTable';

const EXPECTED_HEADERS_CONCILIACION = ['fecha', 'placa', 'systram', '#viaje - pedido', 'columna1', 'valor flete x unidad2', 'operador'];

const VALIDATION_STATES = { OK: 'OK', DISCREPANCY: 'Discrepancia', NOT_FOUND: 'No encontrado', NOVELTY: 'Novedad', ERROR: 'Error' };
const VALIDATION_TYPES = { DELIVERED: 'Entregado', FAILED_70: 'Fallida 70%', FAILED_100: 'Fallida 100%', FAILED_TRANSPORT: 'Fallida Transporte', NO_MATCH: 'Sin coincidencia', NO_MARKER: 'Sin Marcador', ERROR: 'Error' };

const extractMonth = (fecha: any) => {
  if (!fecha) return 'Sin mes';
  if (typeof fecha === 'number' && fecha > 1) {
    // Usa matemática UTC directa para evitar cambios de día por zona horaria
    const date = new Date((fecha - 25569) * 86400 * 1000);
    return date.toLocaleString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return fecha.toString().trim().substring(0, 7);
};

export default function ValidacionLineaBlanca({ user }: { user: any }) {
  const [tarifasBase, setTarifasBase] = useState<any[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);

  const [conciliacionFile, setConciliacionFile] = useState<File | null>(null);
  const [validando, setValidando] = useState(false);
  const [resultados, setResultados] = useState<any[]>([]);
  const [resumenTipos, setResumenTipos] = useState<any[]>([]);
  const [resumenPlacas, setResumenPlacas] = useState<any[]>([]);
  const [resumenMensual, setResumenMensual] = useState<any[]>([]);
  const [reporteBarbosa, setReporteBarbosa] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [guardando, setGuardando] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => {
    fetchTarifasBase();
    fetchHistorico();
  }, []);

  const fetchTarifasBase = async () => {
    setLoadingBase(true);
    try {
      const data = await api.getTarifasLineaBlanca();
      setTarifasBase(data);
    } catch (e) {
      console.error('Error fetching tarifas base', e);
    } finally {
      setLoadingBase(false);
    }
  };

  const fetchHistorico = async () => {
    try {
      const data = await api.getHistorialConciliacionesLB();
      setHistorico(data);
    } catch (e) {
      console.error('Error fetching historico', e);
    }
  };

  const normalizeHeader = (header: any) => {
    if (!header) return '';
    return header.toString()
      .trim()
      .toLowerCase()
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ');
  };

  const handleValidar = async () => {
    if (!conciliacionFile) return toast.warning('Seleccione un archivo de conciliación');
    if (tarifasBase.length === 0) return toast.warning('No hay tarifas base sincronizadas. Sincronice primero.');
    
    setValidando(true);
    
    try {
      const buffer = await conciliacionFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      let sheetName = workbook.SheetNames[0];
      const simuladorSheet = workbook.SheetNames.find(name => name.toLowerCase().includes('simulador'));
      if (simuladorSheet) {
        sheetName = simuladorSheet;
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length === 0) throw new Error('Archivo vacío');

      const headers = jsonData[0];
      const missingHeaders = EXPECTED_HEADERS_CONCILIACION.filter(h => {
        // Fallback for tricky spaces/characters
        const found = headers.map(normalizeHeader).some(headerText => headerText.includes(h) || h.includes(headerText));
        return !found;
      });

      if (missingHeaders.length > 0) {
        throw new Error(`Faltan columnas obligatorias: ${missingHeaders.join(', ')}. Verifica el formato del archivo.`);
      }

      // Map rows
      const validRows = jsonData.slice(1).filter(r => r && r.length > 0);
      const rows = validRows.map((row, idx) => {
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          obj[normalizeHeader(h)] = row[i];
        });
        return obj;
      });

      // Index base
      const baseIndex = new Map();
      tarifasBase.forEach(b => {
        const d = (b.destino || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
        const a = (b.articulo || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
        if (d && a) {
          baseIndex.set(`${d}${a}`, b);
          baseIndex.set(`${a}${d}`, b);
        }
      });

      // Filter Milla 7
      const millaRows = rows.filter(r => {
        const operador = (r['operador'] || '').toString().trim().toLowerCase();
        return operador === 'milla 7';
      });

      let res: any[] = [];
      let barbosaMap = new Map();

      // Pass 1: Count Barbosa trips per truck
      millaRows.forEach(row => {
        const c1 = (row['columna1'] || '').toString().trim().toLowerCase();
        const placa = (row['placa'] || '').toString().trim().toUpperCase();
        if (c1.includes('barbosa')) {
          const current = barbosaMap.get(placa) || { viajes: 0 };
          barbosaMap.set(placa, { viajes: current.viajes + 1 });
        }
      });

      // Pass 2: Validation
      millaRows.forEach((row, index) => {
        const c1 = (row['columna1'] || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
        const placa = (row['placa'] || '').toString().trim().toUpperCase();
        
        let matchingBase = baseIndex.get(c1);
        
        if (!matchingBase && c1.length > 3) {
          // Partial match fallback
          for (let [k, v] of baseIndex.entries()) {
            if (c1.includes(k) || k.includes(c1)) {
              matchingBase = v; break;
            }
          }
        }

        const precioArchivo2 = Math.round(parseFloat(row['valor flete x unidad2'] || '0') || 0);
        const precioArchivo1 = matchingBase ? Math.round(parseFloat(matchingBase.precio) || 0) : 0;
        const precio70Base = Math.round(precioArchivo1 * 0.7);
        
        // Barbosa analysis
        const placaUpperCase = placa.toUpperCase();
        const esBarbosa = c1.includes('barbosa');

        let estado = VALIDATION_STATES.ERROR;
        let tipo = VALIDATION_TYPES.NO_MARKER;
        let notasValidacion = '';
        let diff = precioArchivo2;

        if (matchingBase) {
          const entregadasText = (row['entregadas'] || '').toString().toLowerCase().trim();
          const fallida70Text = (row['fallida pagada al 70%'] || '').toString().toLowerCase().trim();
          const fallida100Text = (row['fallida pagada al 100%'] || '').toString().toLowerCase().trim();
          const fallidaTransporteText = (row['fallida transporte'] || '').toString().toLowerCase().trim();
          
          const placaData = barbosaMap.get(placaUpperCase);
          const debePagarDoble = esBarbosa && placaData && placaData.viajes === 1;

          if (entregadasText.includes('x')) {
            const precioEsperado = Math.round(debePagarDoble ? precioArchivo1 * 2 : precioArchivo1);
            if (Math.abs(precioEsperado - precioArchivo2) <= 1) {
              estado = VALIDATION_STATES.OK;
              tipo = VALIDATION_TYPES.DELIVERED;
              diff = 0;
              notasValidacion = debePagarDoble ? 'Regla Barbosa (doble) aplicada' : 'Precio coincide';
            } else {
              estado = VALIDATION_STATES.DISCREPANCY;
              tipo = VALIDATION_TYPES.DELIVERED;
              diff = precioArchivo2 - precioEsperado;
              notasValidacion = `Diferencia: Esperado ${precioEsperado} vs Pagado ${precioArchivo2}`;
            }
          } else if (fallida70Text.includes('x')) {
            const precioEsperado = Math.round(precioArchivo1 * 0.7);
            if (Math.abs(precioEsperado - precioArchivo2) <= 1) {
              estado = VALIDATION_STATES.OK;
              tipo = VALIDATION_TYPES.FAILED_70;
              diff = 0;
              notasValidacion = 'Precio 70% coincide';
            } else {
              estado = VALIDATION_STATES.DISCREPANCY;
              tipo = VALIDATION_TYPES.FAILED_70;
              diff = precioArchivo2 - precioEsperado;
              notasValidacion = `Diferencia 70%: Esperado ${precioEsperado} vs Pagado ${precioArchivo2}`;
            }
          } else if (fallida100Text.includes('x')) {
            const precioEsperado = Math.round(precioArchivo1);
            if (Math.abs(precioEsperado - precioArchivo2) <= 1) {
              estado = VALIDATION_STATES.OK;
              tipo = VALIDATION_TYPES.FAILED_100;
              diff = 0;
              notasValidacion = 'Precio 100% coincide';
            } else {
              estado = VALIDATION_STATES.DISCREPANCY;
              tipo = VALIDATION_TYPES.FAILED_100;
              diff = precioArchivo2 - precioEsperado;
              notasValidacion = `Diferencia 100%: Esperado ${precioEsperado} vs Pagado ${precioArchivo2}`;
            }
          } else if (fallidaTransporteText.includes('x')) {
            if (precioArchivo2 > 0) {
              estado = VALIDATION_STATES.NOVELTY;
              tipo = VALIDATION_TYPES.FAILED_TRANSPORT;
              diff = precioArchivo2;
              notasValidacion = 'NOVEDAD: Se pagó fallida transporte';
            } else {
              estado = VALIDATION_STATES.OK;
              tipo = VALIDATION_TYPES.FAILED_TRANSPORT;
              diff = 0;
              notasValidacion = 'Fallida transporte - sin pago (correcto)';
            }
          } else {
            estado = VALIDATION_STATES.ERROR;
            tipo = VALIDATION_TYPES.NO_MARKER;
            diff = precioArchivo2 - precioArchivo1;
            notasValidacion = 'No se encontró marcador (x)';
          }
        } else {
          estado = VALIDATION_STATES.NOT_FOUND;
          tipo = VALIDATION_TYPES.NO_MATCH;
          diff = precioArchivo2;
          notasValidacion = 'No se encontró en base';
        }

        const valorAdicional = Math.round(parseFloat(row['valor adicional operador auxiliar'] || row['VALOR ADICIONAL OPERADOR AUXILIAR'] || '0') || 0);
        const totalMilla7 = Math.round(parseFloat(row['total milla 7'] || row['TOTAL MILLA 7'] || '0') || 0);

        res.push({
          index: index + 1,
          fecha: row['fecha'],
          placa: row['placa'],
          systram: row['systram'],
          viajePedido: row['#viaje - pedido'],
          destino: matchingBase?.destino || '',
          articulo: matchingBase?.articulo || '',
          precioArchivo1,
          precio70Base,
          precioArchivo2,
          diferencia: diff,
          valorAdicional,
          totalMilla7,
          estado,
          tipoValidacion: tipo,
          notasValidacion: matchingBase ? '' : 'No se encontró en base',
          notas2: ''
        });
      });

      // Barbosa Report
      const bRep: any[] = [];
      res.forEach(r => {
        if (r.destino.toLowerCase().includes('barbosa')) {
          const stats = barbosaMap.get(r.placa);
          if (stats && stats.viajes === 1) {
            // Debe pagar doble
            r.notasValidacion = 'Regla Barbosa: 1 viaje, debe pagar doble';
            if (r.precioArchivo2 < r.precioArchivo1 * 2) {
              r.estado = VALIDATION_STATES.DISCREPANCY;
            }
          }
        }
      });

      setResultados(res);

      // Calc stats
      const totalRegistros = res.length;
      const fallidasTransporte = res.filter(r => r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT).length;
      const coincidencias = res.filter(r => r.estado === VALIDATION_STATES.OK).length;
      const discrepancias = res.filter(r => r.estado === VALIDATION_STATES.DISCREPANCY).length + res.filter(r => r.estado === VALIDATION_STATES.NOT_FOUND).length;
      const novedades = res.filter(r => r.estado === VALIDATION_STATES.NOVELTY).length;
      const porcentajeCoincidencia = totalRegistros > 0 ?
        Math.round((coincidencias / totalRegistros) * 100) : 0;
      
      const totalMilla7 = res.reduce((sum, r) => sum + (r.totalMilla7 || 0), 0);
      const valorAdicionalTotal = res.reduce((sum, r) => sum + (r.valorAdicional || 0), 0);
      const diferenciaPositiva = res.reduce((sum, r) => {
        const diff = r.diferencia || 0;
        return sum + (diff > 0 ? diff : 0);
      }, 0);
      const diferenciaNegativa = res.reduce((sum, r) => {
        const diff = r.diferencia || 0;
        return sum + (diff < 0 ? Math.abs(diff) : 0);
      }, 0);
      const pagadoOK = res.filter(r => r.estado === VALIDATION_STATES.OK).reduce((sum, r) => sum + (r.precioArchivo2 || 0), 0);
      const valorNovedades = res.filter(r => r.estado === VALIDATION_STATES.NOVELTY).reduce((sum, r) => sum + (r.precioArchivo2 || 0), 0);

      const totalPagado = res.reduce((sum, r) => sum + (r.precioArchivo2 || 0), 0);
      const totalDebido = res.reduce((sum, r) => {
        let montoDebido = 0;
        if (r.estado === VALIDATION_STATES.OK) {
          montoDebido = r.precioArchivo2 || 0;
        } else {
          if (r.tipoValidacion === VALIDATION_TYPES.FAILED_70) {
            montoDebido = r.precio70Base || 0;
          } else if (r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT) {
            montoDebido = 0;
          } else {
            montoDebido = r.precioArchivo1 || 0;
          }
        }
        return sum + montoDebido;
      }, 0);

      setStats({
        totalRegistros, fallidasTransporte, coincidencias, discrepancias,
        porcentajeCoincidencia, novedades, valorNovedades, totalMilla7,
        valorAdicionalTotal, diferenciaPositiva, diferenciaNegativa,
        pagadoOK, totalDebido, totalPagado
      });

      // Calculate resumenTipos
      const typeCounts: Record<string, any> = {};
      res.forEach(r => {
        const tipo = r.tipoValidacion || 'Sin tipo';
        if (!typeCounts[tipo]) typeCounts[tipo] = { cantidad: 0, valorTotal: 0 };
        typeCounts[tipo].cantidad++;
        typeCounts[tipo].valorTotal += r.precioArchivo2 || 0;
      });
      setResumenTipos(Object.entries(typeCounts).map(([tipo, data]) => ({
        tipoValidacion: tipo,
        cantidad: data.cantidad,
        porcentaje: totalRegistros > 0 ? (data.cantidad / totalRegistros) * 100 : 0,
        valorTotal: data.valorTotal
      })).sort((a, b) => b.cantidad - a.cantidad));

      // Calculate resumenPlacas
      const placasData: Record<string, any> = {};
      res.forEach(r => {
        const placa = r.placa.toUpperCase().trim();
        if (!placasData[placa]) {
          placasData[placa] = { placa, totalViajes: 0, debePagar: 0, pago: 0, valorAdicional: 0, totalMilla7: 0 };
        }
        placasData[placa].totalViajes++;
        
        let montoDebido = 0;
        if (r.estado === VALIDATION_STATES.OK) {
          montoDebido = r.precioArchivo2 || 0;
        } else {
          if (r.tipoValidacion === VALIDATION_TYPES.FAILED_70) {
            montoDebido = r.precio70Base || 0;
          } else if (r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT) {
            montoDebido = 0;
          } else {
            montoDebido = r.precioArchivo1 || 0;
          }
        }

        placasData[placa].debePagar += montoDebido;
        placasData[placa].pago += r.precioArchivo2 || 0;
        placasData[placa].valorAdicional += r.valorAdicional || 0;
        placasData[placa].totalMilla7 += r.totalMilla7 || 0;
      });
      setResumenPlacas(Object.values(placasData).map(item => {
        const diferencia = item.pago - item.debePagar;
        const ochentaYTres = item.totalMilla7 * 0.83;
        const d_83 = item.pago - ochentaYTres;
        return { ...item, diferenciaNeta: diferencia, ochentaYTres, d_83 };
      }).sort((a, b) => b.totalViajes - a.totalViajes));

      // Calculate resumenMensual
      const monthlyData: Record<string, any> = {};
      res.forEach(r => {
        const mes = r.mes || (r.fecha ? extractMonth(r.fecha) : 'Sin mes');
        if (!monthlyData[mes]) {
          monthlyData[mes] = { mes, totalRegistros: 0, totalMilla7: 0, totalDebido: 0, totalPagado: 0, valorAdicionalTotal: 0 };
        }
        monthlyData[mes].totalRegistros++;
        monthlyData[mes].totalMilla7 += r.totalMilla7 || 0;
        monthlyData[mes].valorAdicionalTotal += r.valorAdicional || 0;
        
        let montoDebido = 0;
        if (r.estado === VALIDATION_STATES.OK) {
          montoDebido = r.precioArchivo2 || 0;
        } else {
          if (r.tipoValidacion === VALIDATION_TYPES.FAILED_70) {
            montoDebido = r.precio70Base || 0;
          } else if (r.tipoValidacion === VALIDATION_TYPES.FAILED_TRANSPORT) {
            montoDebido = 0;
          } else {
            montoDebido = r.precioArchivo1 || 0;
          }
        }
        
        monthlyData[mes].totalDebido += montoDebido;
        monthlyData[mes].totalPagado += r.precioArchivo2 || 0;
      });
      setResumenMensual(Object.values(monthlyData).map(item => ({
        ...item,
        diferenciaNeta: item.totalPagado - item.totalDebido
      })));

      toast.success('Archivo validado correctamente');
    } catch (e: any) {
      toast.error(e.message || 'Error validando archivo');
    } finally {
      setValidando(false);
    }
  };

  const handleGuardar = async () => {
    if (resultados.length === 0) return;
    setGuardando(true);
    try {
      const payload = {
        nombre_archivo: conciliacionFile?.name || 'Archivo.xlsx',
        mes_anio: extractMonth(resultados[0]?.fecha),
        stats,
        usuario_creacion: user.email,
        detalles: resultados
      };
      const res = await api.saveConciliacionLB(payload);
      toast.success(res.message || 'Guardado con éxito');
      fetchHistorico();
    } catch (e: any) {
      toast.error('Error al guardar: ' + e.message);
    } finally {
      setGuardando(false);
    }
  };

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
      <span className={r.diferencia < 0 ? 'text-red-500 font-bold' : r.diferencia > 0 ? 'text-green-500 font-bold' : ''}>
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

  const historicoColumns = [
    { header: 'Archivo', key: 'nombre_archivo' },
    { header: 'Mes', key: 'mes_anio' },
    { header: 'Registros', key: 'total_registros' },
    { header: 'Coincidencias', key: 'coincidencias' },
    { header: 'Diferencia', key: 'diferencia_neta', render: (r: any) => `$${Number(r.diferencia_neta).toLocaleString()}` },
    { header: 'Fecha Carga', key: 'fecha_creacion', render: (r: any) => new Date(r.fecha_creacion).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-center">
          <p className="text-3xl font-black text-blue-600">{tarifasBase.length}</p>
          <p className="text-xs font-bold text-blue-800 uppercase">Tarifas Base Cargadas</p>
          <button onClick={fetchTarifasBase} className="mt-2 text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full uppercase tracking-widest font-bold">
            {loadingBase ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* UPLOAD FILE */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
            <FileSpreadsheet size={32} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-lg">Archivo de Conciliación</h3>
            <p className="text-xs text-slate-500">Formato Excel (.xlsx) de Milla 7</p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <input 
            type="file" 
            accept=".xlsx" 
            onChange={e => setConciliacionFile(e.target.files?.[0] || null)}
            className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          <button 
            onClick={handleValidar}
            disabled={validando}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {validando ? 'Validando...' : 'Validar Archivo'}
          </button>
        </div>
      </div>

      {/* RESULTADOS DASHBOARD */}
      {resultados.length > 0 && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-800">Resultados de Validación</h3>
            <button 
              onClick={handleGuardar}
              disabled={guardando}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {guardando ? 'Guardando...' : 'Guardar Resultados en BD'}
            </button>
          </div>

          {/* Dashboard Section */}
          <div className="space-y-6">
            {/* Primera fila - Estadísticas generales */}
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
              {stats.novedades > 0 && (
                <div className="bg-purple-100 border border-purple-300 p-6 rounded-2xl text-center shadow-sm">
                  <p className="text-3xl font-black text-purple-800">{stats.novedades}</p>
                  <p className="text-[10px] font-bold text-purple-900 uppercase mt-1">Novedades</p>
                </div>
              )}
              {stats.valorNovedades > 0 && (
                <div className="bg-purple-200 border border-purple-400 p-6 rounded-2xl text-center shadow-sm">
                  <p className="text-3xl font-black text-purple-900">${(stats.valorNovedades || 0).toLocaleString()}</p>
                  <p className="text-[10px] font-bold text-purple-900 uppercase mt-1">Valor Novedades</p>
                </div>
              )}
            </div>

            {/* Segunda fila - Estadisticas financieras */}
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
              <div className="bg-green-100 border border-green-300 p-4 rounded-2xl text-center shadow-sm">
                <p className="text-xl font-black text-green-700">+${(stats.diferenciaPositiva || 0).toLocaleString()}</p>
                <p className="text-[10px] font-bold text-green-800 uppercase mt-1">Pagado de Más</p>
              </div>
              <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-center shadow-sm">
                <p className="text-xl font-black text-red-600">-${(stats.diferenciaNegativa || 0).toLocaleString()}</p>
                <p className="text-[10px] font-bold text-red-700 uppercase mt-1">No Pagado</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-center shadow-sm">
                <p className="text-xl font-black text-amber-600">${Math.round((stats.diferenciaPositiva || 0) - (stats.diferenciaNegativa || 0)).toLocaleString()}</p>
                <p className="text-[10px] font-bold text-amber-700 uppercase mt-1">Diferencia Neta</p>
              </div>
              <div className="bg-lime-50 border border-lime-200 p-4 rounded-2xl text-center shadow-sm">
                <p className="text-xl font-black text-lime-600">${(stats.pagadoOK || 0).toLocaleString()}</p>
                <p className="text-[10px] font-bold text-lime-700 uppercase mt-1">Pagado OK</p>
              </div>
            </div>

            {/* Tercera fila - Totales Generales */}
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

          {/* TABLAS ADICIONALES */}
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
      )}

      {/* HISTÓRICO */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 mt-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Activity size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">Historial de Conciliaciones</h3>
            <p className="text-xs text-slate-500 font-medium">Archivos procesados y guardados en la base de datos</p>
          </div>
        </div>

        {historico.length > 0 ? (
          <DataTable
            data={historico}
            columns={historicoColumns}
            searchPlaceholder="Buscar archivo..."
          />
        ) : (
          <div className="text-center py-12 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-slate-100">
            No hay histórico de conciliaciones guardadas.
          </div>
        )}
      </div>

    </div>
  );
}
