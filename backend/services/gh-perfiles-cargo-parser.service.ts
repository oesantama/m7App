/**
 * gh-perfiles-cargo-parser.service.ts
 *
 * Convierte el Excel "FO-SG-008 Formato Perfiles y Funciones del Cargo" (una
 * pestaña por cargo) en JSON estructurado. Las pestañas comparten la estructura
 * de encabezados romanos (I..V) y bloque de certificado — se detectan por
 * coincidencia flexible de texto para soportar variaciones en el formato.
 */
import * as XLSX from 'xlsx';
import crypto from 'crypto';

export interface PerfilCargoContenido {
  codigo_formato?: string;
  version_formato?: string;
  fecha_formato?: string;
  sistema_gestion?: string;
  titulo_documento?: string;
  cargo: string;
  fecha_actualizacion: string;
  dependencia: string;
  jefe_inmediato: string;
  cargo_critico: string;
  personas_a_cargo: string;
  condiciones_salario: string;
  proposito_cargo: string;
  porque_responde: string;
  competencias: {
    formacion_academica: string;
    experiencia: string;
    conocimientos_especificos: string;
    competencias_organizacionales: string;
  };
  comunicaciones: { internas: string; externas: string };
  responsabilidad_con: { left: string; right: string }[];
  flujograma: { proceso: string; funcion: string; actividad: string }[];
  elaborado_por: string;
  aprobado_por: string;
}

export interface PerfilCargoParseado {
  hoja: string;
  contenido: PerfilCargoContenido;
  contentHash: string;
}

type Row = any[];

const norm = (v: any): string => String(v ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
const normSingleLine = (v: any): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const normLabel = (v: any): string => normSingleLine(v).toLowerCase().replace(/[:.]/g, '');

function findRowIndex(rows: Row[], matcher: (label: string) => boolean, from = 0): number {
  const start = Math.max(0, from);
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    for (let c = 0; c < Math.min(row.length, 6); c++) {
      const cell = normLabel(row[c]);
      if (cell && matcher(cell)) return i;
    }
  }
  return -1;
}

function findFieldValue(rows: Row[], label: string): string {
  const target = label.toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = normLabel(row[c]);
      if (cell && (cell.startsWith(target) || cell.includes(target))) {
        // Buscar valor en celdas a la derecha de la misma fila
        for (let v = c + 1; v < row.length; v++) {
          const val = norm(row[v]);
          if (val && !normLabel(val).startsWith(target)) return val;
        }
        // O en la fila siguiente en caso de celdas combinadas verticalmente
        if (rows[i + 1] && Array.isArray(rows[i + 1])) {
          for (let v = c; v < rows[i + 1].length; v++) {
            const val = norm(rows[i + 1][v]);
            if (val) return val;
          }
        }
      }
    }
  }
  return '';
}

function parseSheet(ws: XLSX.WorkSheet, hoja: string): PerfilCargoParseado {
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows || rows.length === 0) {
    throw new Error(`Pestaña ${hoja} está vacía`);
  }

  // ── Encabezado Institucional (Celdas B1 y H1/G1/I1) ───────────────────
  let headerCell = '';
  let titleCell = '';
  if (rows[0] && Array.isArray(rows[0])) {
    for (let c = 0; c < rows[0].length; c++) {
      const cellVal = norm(rows[0][c]);
      if (!cellVal) continue;
      const lower = cellVal.toLowerCase();
      if (lower.includes('sistema integrado') || lower.includes('perfil y funciones')) {
        titleCell = cellVal;
      } else if (lower.includes('código') || lower.includes('codigo') || lower.includes('versión') || lower.includes('version')) {
        headerCell = cellVal;
      }
    }
  }
  if (!headerCell && (ws['H1'] || ws['G1'] || ws['I1'])) {
    headerCell = norm((ws['H1'] || ws['G1'] || ws['I1']).v);
  }
  if (!titleCell && (ws['B1'] || ws['C1'] || ws['D1'])) {
    titleCell = norm((ws['B1'] || ws['C1'] || ws['D1']).v);
  }

  const codigo_formato = (headerCell.match(/c[oó]digo\s*:\s*([^\n\r]+)/i) || [])[1]?.trim() || 'FO-SG-008';
  const version_formato = (headerCell.match(/versi[oó]n\s*:\s*([^\n\r]+)/i) || [])[1]?.trim() || '2';
  const fecha_formato = (headerCell.match(/fecha\s*:\s*([^\n\r]+)/i) || [])[1]?.trim() || '03/09/2025';

  const titleLines = titleCell.split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean);
  const sistema_gestion = titleLines[0] || 'SISTEMA INTEGRADO DE GESTIÓN BASC - PESV - SGA - SG-SST';
  const titulo_documento = titleLines[1] || 'PERFIL Y FUNCIONES DEL CARGO';

  const iOrganigrama = findRowIndex(rows, l => l.includes('organigrama') && l.length < 40);
  const iCompetencias = findRowIndex(rows, l => l.includes('competencia') && l.length < 40, iOrganigrama > 0 ? iOrganigrama + 1 : 0);
  const iComunicaciones = findRowIndex(rows, l => l.includes('comunicaci') && l.length < 40, iCompetencias > 0 ? iCompetencias + 1 : 0);
  const iResponsabilidad = findRowIndex(rows, l => l.includes('responsabilidad') && l.length < 40, iComunicaciones > 0 ? iComunicaciones + 1 : 0);
  const iFlujograma = findRowIndex(rows, l => (l.includes('flujograma') || l.includes('proceso')) && l.length < 40, iResponsabilidad > 0 ? iResponsabilidad + 1 : 0);
  const iCertificado = findRowIndex(rows, l => l.startsWith('certificado') || l.includes('certificado de aceptaci'), iFlujograma > 0 ? iFlujograma + 1 : 0);

  // ── Bloque superior ──────────────────────────────────────────────────
  const cargo = findFieldValue(rows, 'nombre del cargo') || findFieldValue(rows, 'cargo') || hoja;
  const fecha_actualizacion = findFieldValue(rows, 'fecha de actualizaci') || findFieldValue(rows, 'fecha');
  const dependencia = findFieldValue(rows, 'dependencia') || findFieldValue(rows, 'área') || findFieldValue(rows, 'area');
  const jefe_inmediato = findFieldValue(rows, 'jefe inmediato') || findFieldValue(rows, 'jefe');
  
  const idxCritico = findRowIndex(rows, l => l.includes('cargo critico') || l.includes('cargo crítico'));
  let cargo_critico = '';
  if (idxCritico >= 0 && rows[idxCritico]) {
    const r = rows[idxCritico];
    cargo_critico = [normSingleLine(r[1]), normSingleLine(r[2]), normSingleLine(r[3]), normSingleLine(r[4])].filter(Boolean).join(' · ');
  }

  // ── I. Organigrama ───────────────────────────────────────────────────
  const personas_a_cargo = findFieldValue(rows, 'personas a cargo');
  const idxCondiciones = findRowIndex(rows, l => l.includes('condiciones') || l.includes('salario'));
  const condiciones_salario = idxCondiciones >= 0 && rows[idxCondiciones] ? norm(rows[idxCondiciones][1] || rows[idxCondiciones][2]) : '';
  const proposito_cargo = findFieldValue(rows, 'propósito del cargo') || findFieldValue(rows, 'proposito');
  const porque_responde = findFieldValue(rows, 'porque responde') || findFieldValue(rows, 'por que responde');

  // ── II. Competencias ─────────────────────────────────────────────────
  const idxCompHead1 = findRowIndex(rows, l => l.includes('formación') || l.includes('formacion') || l.includes('académica') || l.includes('academica'), iCompetencias);
  const idxCompHead2 = findRowIndex(rows, l => l.includes('conocimientos') || l.includes('específicos') || l.includes('especificos'), iCompetencias);
  
  const getCellSafely = (rowIdx: number, colIndices: number[]): string => {
    if (rowIdx < 0 || rowIdx >= rows.length || !rows[rowIdx]) return '';
    for (const c of colIndices) {
      const val = norm(rows[rowIdx][c]);
      if (val) return val;
    }
    return '';
  };

  const competencias = {
    formacion_academica: idxCompHead1 >= 0 ? getCellSafely(idxCompHead1 + 1, [0, 1, 2]) : '',
    experiencia: idxCompHead1 >= 0 ? getCellSafely(idxCompHead1 + 1, [4, 5, 3, 2]) : '',
    conocimientos_especificos: idxCompHead2 >= 0 ? getCellSafely(idxCompHead2 + 1, [0, 1, 2]) : '',
    competencias_organizacionales: idxCompHead2 >= 0 ? getCellSafely(idxCompHead2 + 1, [4, 5, 3, 2]) : '',
  };

  // ── III. Comunicaciones ──────────────────────────────────────────────
  const idxComHead = findRowIndex(rows, l => l.includes('internas') || l.includes('externas'), iComunicaciones);
  const comunicaciones = {
    internas: idxComHead >= 0 ? getCellSafely(idxComHead + 1, [0, 1, 2]) : '',
    externas: idxComHead >= 0 ? getCellSafely(idxComHead + 1, [4, 5, 3, 2]) : '',
  };

  // ── IV. Responsabilidad con (pares genéricos, orden preservado) ─────
  const responsabilidad_con: { left: string; right: string }[] = [];
  if (iResponsabilidad >= 0) {
    const end = iFlujograma >= 0 ? iFlujograma : (iCertificado >= 0 ? iCertificado : rows.length);
    for (let i = iResponsabilidad + 1; i < end; i++) {
      if (!rows[i] || !Array.isArray(rows[i])) continue;
      const left = norm(rows[i][0] || rows[i][1]);
      const right = norm(rows[i][4] || rows[i][3] || rows[i][5]);
      if (left || right) responsabilidad_con.push({ left, right });
    }
  }

  // ── V. Flujograma de procesos (forward-fill de proceso/función) ─────
  const flujograma: { proceso: string; funcion: string; actividad: string }[] = [];
  if (iFlujograma >= 0) {
    const end = iCertificado >= 0 ? iCertificado : rows.length;
    let lastProceso = '';
    let lastFuncion = '';
    for (let i = iFlujograma + 1; i < end; i++) {
      if (!rows[i] || !Array.isArray(rows[i])) continue;
      const c0 = norm(rows[i][0]);
      const c1 = norm(rows[i][1]);
      const c2 = norm(rows[i][2] || rows[i][3]);
      if (normLabel(c0).includes('proceso') && (normLabel(c1).includes('funci') || !c1)) continue; // fila de encabezado
      if (normLabel(c2).includes('actividad') || normLabel(c2).includes('ruta cr')) continue; // fila de encabezado
      if (normLabel(c0) === normLabel(cargo) && !c1 && !c2) continue; // nombre del cargo repetido
      if (!c1 && !c2 && !c0) continue; // fila vacía
      if (c0) lastProceso = c0;
      if (c1) lastFuncion = c1;
      if (c2) flujograma.push({ proceso: lastProceso, funcion: lastFuncion, actividad: c2 });
    }
  }

  // ── Elaborado por / Aprobado por ─────────────────────────────────────
  const elaborado_por = findFieldValue(rows, 'elaborado por') || findFieldValue(rows, 'elaborado');
  const aprobado_por = findFieldValue(rows, 'aprobado por') || findFieldValue(rows, 'aprobado');

  const contenido: PerfilCargoContenido = {
    codigo_formato,
    version_formato,
    fecha_formato,
    sistema_gestion,
    titulo_documento,
    cargo,
    fecha_actualizacion,
    dependencia,
    jefe_inmediato,
    cargo_critico,
    personas_a_cargo,
    condiciones_salario,
    proposito_cargo,
    porque_responde,
    competencias,
    comunicaciones,
    responsabilidad_con,
    flujograma,
    elaborado_por,
    aprobado_por,
  };

  const contentHash = crypto.createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
  return { hoja, contenido, contentHash };
}

export function parseWorkbook(buffer: Buffer): PerfilCargoParseado[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const results: PerfilCargoParseado[] = [];

  for (const name of wb.SheetNames) {
    const cleanName = name.trim();
    if (!cleanName) continue;
    try {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const parsed = parseSheet(sheet, cleanName);
      if (parsed) results.push(parsed);
    } catch (err: any) {
      console.warn(`[FO-SG-008] Advertencia al procesar pestaña "${cleanName}": ${err.message}`);
    }
  }

  return results;
}
