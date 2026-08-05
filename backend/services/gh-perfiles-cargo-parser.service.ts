/**
 * gh-perfiles-cargo-parser.service.ts
 *
 * Convierte el Excel "FO-SG-008 Formato Perfiles y Funciones del Cargo" (una
 * pestaña por cargo) en JSON estructurado. Las 30 pestañas comparten la misma
 * estructura de encabezados romanos (I..V) y bloque de certificado — se
 * detectan por texto, no por posición de fila, porque el número de filas
 * varía entre pestañas.
 */
import * as XLSX from 'xlsx';
import crypto from 'crypto';

export interface PerfilCargoContenido {
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

const norm = (v: any): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const normLabel = (v: any): string => norm(v).toLowerCase().replace(/:$/, '');

function findRowIndex(rows: Row[], matcher: (label: string) => boolean, from = 0): number {
  for (let i = from; i < rows.length; i++) {
    if (matcher(normLabel(rows[i][0]))) return i;
  }
  return -1;
}

function findFieldValue(rows: Row[], label: string): string {
  const idx = findRowIndex(rows, l => l.startsWith(label));
  return idx >= 0 ? norm(rows[idx][1]) : '';
}

function parseSheet(ws: XLSX.WorkSheet, hoja: string): PerfilCargoParseado {
  const rows: Row[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const iOrganigrama = findRowIndex(rows, l => l === 'i. organigrama');
  const iCompetencias = findRowIndex(rows, l => l === 'ii. competencias');
  const iComunicaciones = findRowIndex(rows, l => l === 'iii. comunicaciones');
  const iResponsabilidad = findRowIndex(rows, l => l === 'iv. responsabilidad con');
  const iFlujograma = findRowIndex(rows, l => l === 'v. flujograma de procesos');
  const iCertificado = findRowIndex(rows, l => l.startsWith('certificado de aceptación'));

  // ── Bloque superior ──────────────────────────────────────────────────
  const cargo = findFieldValue(rows, 'nombre del cargo');
  const fecha_actualizacion = findFieldValue(rows, 'fecha de actualización');
  const dependencia = findFieldValue(rows, 'dependencia');
  const jefe_inmediato = findFieldValue(rows, 'jefe inmediato');
  const idxCritico = findRowIndex(rows, l => l.startsWith('cargo critico'));
  const cargo_critico = idxCritico >= 0
    ? [norm(rows[idxCritico][1]), norm(rows[idxCritico][4])].filter(Boolean).join(' · ')
    : '';

  // ── I. Organigrama ───────────────────────────────────────────────────
  const personas_a_cargo = findFieldValue(rows, 'personas a cargo');
  const idxCondiciones = findRowIndex(rows, l => l.startsWith('condiciones') && l.includes('salario'));
  const condiciones_salario = idxCondiciones >= 0 ? norm(rows[idxCondiciones][1]) : '';
  const proposito_cargo = findFieldValue(rows, 'propósito del cargo');
  const porque_responde = findFieldValue(rows, 'porque responde');

  // ── II. Competencias ─────────────────────────────────────────────────
  const idxCompHead1 = findRowIndex(rows, l => l === 'formación académica', iCompetencias);
  const idxCompHead2 = findRowIndex(rows, l => l === 'conocimientos específicos', iCompetencias);
  const competencias = {
    formacion_academica: idxCompHead1 >= 0 ? norm(rows[idxCompHead1 + 1]?.[0]) : '',
    experiencia: idxCompHead1 >= 0 ? norm(rows[idxCompHead1 + 1]?.[4]) : '',
    conocimientos_especificos: idxCompHead2 >= 0 ? norm(rows[idxCompHead2 + 1]?.[0]) : '',
    competencias_organizacionales: idxCompHead2 >= 0 ? norm(rows[idxCompHead2 + 1]?.[4]) : '',
  };

  // ── III. Comunicaciones ──────────────────────────────────────────────
  const idxComHead = findRowIndex(rows, l => l === 'internas', iComunicaciones);
  const comunicaciones = {
    internas: idxComHead >= 0 ? norm(rows[idxComHead + 1]?.[0]) : '',
    externas: idxComHead >= 0 ? norm(rows[idxComHead + 1]?.[4]) : '',
  };

  // ── IV. Responsabilidad con (pares genéricos, orden preservado) ─────
  const responsabilidad_con: { left: string; right: string }[] = [];
  if (iResponsabilidad >= 0) {
    const end = iFlujograma >= 0 ? iFlujograma : (iCertificado >= 0 ? iCertificado : rows.length);
    for (let i = iResponsabilidad + 1; i < end; i++) {
      const left = norm(rows[i]?.[0]);
      const right = norm(rows[i]?.[4]);
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
      const c0 = norm(rows[i]?.[0]);
      const c1 = norm(rows[i]?.[1]);
      const c2 = norm(rows[i]?.[2]);
      if (normLabel(c0).startsWith('proceso')) continue; // fila de encabezado de tabla
      if (!c1 && !c2) continue; // fila de título de sección, sin datos de tabla
      if (c0) lastProceso = c0;
      if (c1) lastFuncion = c1;
      if (c2) flujograma.push({ proceso: lastProceso, funcion: lastFuncion, actividad: c2 });
    }
  }

  // ── Elaborado por / Aprobado por ─────────────────────────────────────
  const elaborado_por = findFieldValue(rows, 'elaborado por');
  const aprobado_por = findFieldValue(rows, 'aprobado por');

  const contenido: PerfilCargoContenido = {
    cargo, fecha_actualizacion, dependencia, jefe_inmediato, cargo_critico,
    personas_a_cargo, condiciones_salario, proposito_cargo, porque_responde,
    competencias, comunicaciones, responsabilidad_con, flujograma,
    elaborado_por, aprobado_por,
  };

  const contentHash = crypto.createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
  return { hoja, contenido, contentHash };
}

export function parseWorkbook(buffer: Buffer): PerfilCargoParseado[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return wb.SheetNames
    .map(name => parseSheet(wb.Sheets[name], name.trim()))
    .filter(p => !!p.contenido.cargo);
}
