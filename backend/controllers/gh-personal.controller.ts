import { Request, Response } from 'express';
import pool from '../config/database.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import * as XLSX from 'xlsx';

const initTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gh_personal (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        cedula VARCHAR(50) UNIQUE NOT NULL,
        cargo VARCHAR(255),
        eps VARCHAR(255),
        afp VARCHAR(255),
        celular_personal VARCHAR(50),
        correo_personal VARCHAR(255),
        celular_corporativo VARCHAR(50),
        correo_corporativo VARCHAR(255),
        jefe_inmediato_id INTEGER,
        area_trabajo_id INTEGER,
        es_jefe BOOLEAN DEFAULT FALSE,
        fecha_ingreso DATE,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_encuestas_activas (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(50) NOT NULL,
        fecha_activacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_encuestas_sociodemograficas (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(50) NOT NULL,
        fecha_ingreso DATE,
        cargo_id INTEGER,
        municipio_nacimiento_id INTEGER,
        fecha_nacimiento DATE,
        tipo_sangre_id INTEGER,
        estado_civil_id INTEGER,
        nivel_educativo_id INTEGER,
        tipo_contrato_id INTEGER,
        ingresos_mensuales_id INTEGER,
        afp_id INTEGER,
        eps_id INTEGER,
        turno_laboral_id INTEGER,
        tipo_vivienda_id INTEGER,
        estrato INTEGER,
        municipio_residencia_id INTEGER,
        barrio VARCHAR(255),
        direccion TEXT,
        sufre_enfermedad VARCHAR(10),
        viven_conmigo INTEGER,
        principal_sustentador VARCHAR(10),
        personas_a_cargo_id INTEGER,
        discapacidad_familia VARCHAR(10),
        con_quien_vive_id INTEGER,
        cuantos_hijos INTEGER,
        bebe_alcohol VARCHAR(50),
        fuma VARCHAR(10),
        frecuencia_deporte_id INTEGER,
        tipo_deporte_id INTEGER,
        uso_tiempo_libre_id INTEGER,
        uso_tiempo_libre_otros TEXT,
        contacto_emergencia_nombre VARCHAR(255),
        contacto_emergencia_telefono VARCHAR(50),
        consentimiento BOOLEAN,
        fecha_realizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario_control VARCHAR(255) DEFAULT 'PUBLIC_USER'
      );

      CREATE TABLE IF NOT EXISTS gh_encuesta_familia (
        id SERIAL PRIMARY KEY,
        encuesta_id INTEGER REFERENCES gh_encuestas_sociodemograficas(id) ON DELETE CASCADE,
        nombre VARCHAR(255),
        parentesco_id INTEGER,
        fecha_nacimiento DATE,
        ocupacion VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS gh_miscelaneos (
        id SERIAL PRIMARY KEY,
        categoria VARCHAR(100) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_areas (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

      -- LMS Gamificado
      CREATE TABLE IF NOT EXISTS gh_capacitaciones (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        puntos_premio INTEGER DEFAULT 100,
        estado VARCHAR(50) DEFAULT 'BORRADOR',
        usuario_control VARCHAR(255),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gh_capacitacion_preguntas (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER REFERENCES gh_capacitaciones(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        pregunta TEXT NOT NULL,
        config_json JSONB,
        orden INTEGER
      );

      CREATE TABLE IF NOT EXISTS gh_capacitacion_asignaciones (
        id SERIAL PRIMARY KEY,
        capacitacion_id INTEGER REFERENCES gh_capacitaciones(id) ON DELETE CASCADE,
        cedula VARCHAR(50) NOT NULL,
        tipo_proceso VARCHAR(50),
        desde DATE,
        hasta DATE,
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        progreso INTEGER DEFAULT 0,
        calificacion DECIMAL(5,2),
        fecha_completado TIMESTAMP,
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS gh_jefes_inmediatos (id SERIAL PRIMARY KEY, nombre VARCHAR(255), area_id INTEGER, personal_id INTEGER, estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_eps (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_afp (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_tipos_vivienda (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_tipos_contrato (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_ingresos_mensuales (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_cargos (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_tipos_sangre (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_estados_civiles (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_niveles_educativos (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_turnos_laborales (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_personas_a_cargo (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_convivientes (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_frecuencia_deporte (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_tipos_deporte (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gh_usos_tiempo_libre (id SERIAL PRIMARY KEY, nombre VARCHAR(255), estado VARCHAR(50) DEFAULT 'ACTIVO', usuario_control VARCHAR(255), fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

      -- Asegurar columnas nuevas en gh_encuestas_sociodemograficas
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS fecha_ingreso DATE;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS cargo_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS municipio_nacimiento_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS tipo_sangre_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS estado_civil_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS nivel_educativo_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS tipo_contrato_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS ingresos_mensuales_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS afp_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS eps_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS turno_laboral_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS tipo_vivienda_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS estrato INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS municipio_residencia_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS barrio VARCHAR(255);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS direccion TEXT;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS sufre_enfermedad VARCHAR(10);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS viven_conmigo INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS principal_sustentador VARCHAR(10);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS personas_a_cargo_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS discapacidad_familia VARCHAR(10);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS con_quien_vive_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS cuantos_hijos INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS bebe_alcohol VARCHAR(50);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS fuma VARCHAR(10);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS frecuencia_deporte_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS tipo_deporte_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS practica_deporte VARCHAR(10);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS uso_tiempo_libre_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS uso_tiempo_libre_otros TEXT;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre VARCHAR(255);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono VARCHAR(50);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS consentimiento BOOLEAN;
      ALTER TABLE gh_encuestas_sociodemograficas ALTER COLUMN datos DROP NOT NULL;

      -- Registrar Pagina Personal si no existe
      INSERT INTO pages (id, parent_id, name, route, status_id)
      SELECT 'PAG-43', 'MOD-09', 'Personal', 'gestion-humana-personal', 'EST-01'
      WHERE NOT EXISTS (SELECT 1 FROM pages WHERE id = 'PAG-43');
    `);
  } catch (err) {
    console.error('[GH-PERSONAL-INIT] Error:', err);
  }
};

initTables();

export const getPersonal = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.*, a.nombre as area_nombre, j.nombre as jefe_nombre
      FROM gh_personal p
      LEFT JOIN gh_areas a ON a.id = p.area_trabajo_id
      LEFT JOIN gh_jefes_inmediatos j ON j.id = p.jefe_inmediato_id
      ORDER BY p.nombre ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const savePersonal = async (req: Request, res: Response) => {
  const {
    id, nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
    celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
    es_jefe, fecha_ingreso, estado, usuarioControl
  } = req.body;

  try {
    if (id) {
      await pool.query(`
        UPDATE gh_personal SET
          nombre=$1, cedula=$2, cargo=$3, eps=$4, afp=$5, celular_personal=$6, 
          correo_personal=$7, celular_corporativo=$8, correo_corporativo=$9,
          jefe_inmediato_id=$10, area_trabajo_id=$11, es_jefe=$12, 
          fecha_ingreso=$13, estado=$14, usuario_control=$15, fecha_control=CURRENT_TIMESTAMP
        WHERE id=$16
      `, [
        nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
        celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
        es_jefe, fecha_ingreso, estado, usuarioControl || 'System', id
      ]);
    } else {
      await pool.query(`
        INSERT INTO gh_personal (
          nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
          celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
          es_jefe, fecha_ingreso, estado, usuario_control
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [
        nombre, cedula, cargo, eps, afp, celular_personal, correo_personal,
        celular_corporativo, correo_corporativo, jefe_inmediato_id, area_trabajo_id,
        es_jefe, fecha_ingreso, estado || 'EST-01', usuarioControl || 'System'
      ]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deletePersonal = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM gh_personal WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// --- ENCUESTAS ---

export const getPersonalEncuestas = async (req: Request, res: Response) => {
  try {
    // AUTO-MIGRACIÓN TEMPORAL DE ESTADOS (TEXTO -> ID)
    await pool.query(`UPDATE gh_encuestas_activas SET estado = 'EST-01' WHERE estado = 'ACTIVO' OR estado = 'Activo'`);
    await pool.query(`UPDATE gh_encuestas_activas SET estado = 'EST-05' WHERE estado = 'COMPLETADO' OR estado = 'Completado'`);
    await pool.query(`UPDATE gh_encuestas_activas SET estado = 'EST-02' WHERE estado = 'INACTIVO' OR estado = 'Inactivo'`);

    const result = await pool.query('SELECT * FROM gh_encuestas_activas ORDER BY fecha_activacion DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const activateEncuesta = async (req: Request, res: Response) => {
  const { cedula, usuarioControl } = req.body;
  try {
    
    await pool.query(`
      INSERT INTO gh_encuestas_activas (cedula, usuario_control)
      VALUES ($1, $2)
    `, [cedula, usuarioControl || 'System']);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deactivateEncuesta = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE gh_encuestas_activas SET estado = 'EST-02' WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const validateSurveyAccess = async (req: Request, res: Response) => {
  const { cedula } = req.query;
  try {
    const r = await pool.query(`
      SELECT p.nombre, p.cedula, p.cargo, p.fecha_ingreso
      FROM gh_personal p
      JOIN gh_encuestas_activas a ON a.cedula = p.cedula
      WHERE p.cedula = $1 AND a.estado = 'EST-01'
      LIMIT 1
    `, [cedula]);

    if (r.rows.length === 0) {
      return res.status(403).json({ error: 'No está autorizado para realizar la encuesta o ya expiró.' });
    }

    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const savePublicSurvey = async (req: Request, res: Response) => {
  const { cedula, data, familia } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const surveyRes = await client.query(`
      INSERT INTO gh_encuestas_sociodemograficas (
        cedula, fecha_ingreso, cargo_id, municipio_nacimiento_id, fecha_nacimiento,
        tipo_sangre_id, estado_civil_id, nivel_educativo_id, tipo_contrato_id,
        ingresos_mensuales_id, afp_id, eps_id, turno_laboral_id, tipo_vivienda_id,
        estrato, municipio_residencia_id, barrio, direccion, sufre_enfermedad,
        viven_conmigo, principal_sustentador, personas_a_cargo_id, discapacidad_familia,
        con_quien_vive_id, cuantos_hijos, bebe_alcohol, fuma, frecuencia_deporte_id,
        tipo_deporte_id, practica_deporte, uso_tiempo_libre_id, uso_tiempo_libre_otros,
        contacto_emergencia_nombre, contacto_emergencia_telefono, consentimiento,
        usuario_control
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, 'PUBLIC_USER'
      ) RETURNING id
    `, [
      cedula, data.fecha_ingreso, data.cargo_id, data.municipio_nacimiento_id, data.fecha_nacimiento,
      data.tipo_sangre_id, data.estado_civil_id, data.nivel_educativo_id, data.tipo_contrato_id,
      data.ingresos_mensuales_id, data.afp_id, data.eps_id, data.turno_laboral_id, data.tipo_vivienda_id,
      data.estrato, data.municipio_residencia_id, data.barrio, data.direccion, data.sufre_enfermedad,
      data.viven_conmigo, data.principal_sustentador, data.personas_a_cargo_id, data.discapacidad_familia,
      data.con_quien_vive_id, data.cuantos_hijos, data.bebe_alcohol, data.fuma, data.frecuencia_deporte_id,
      data.tipo_deporte_id, data.practica_deporte, data.uso_tiempo_libre_id, data.uso_tiempo_libre_otros,
      data.contacto_emergencia_nombre, data.contacto_emergencia_telefono, data.consentimiento
    ]);

    const encuestaId = surveyRes.rows[0].id;

    if (familia && Array.isArray(familia)) {
      for (const fam of familia) {
        await client.query(`
          INSERT INTO gh_encuesta_familia (encuesta_id, nombre, fecha_nacimiento)
          VALUES ($1, $2, $3)
        `, [encuestaId, fam.nombre, fam.fecha_nacimiento]);
      }
    }

    await client.query("UPDATE gh_encuestas_activas SET estado = 'EST-05' WHERE cedula = $1 AND estado = 'EST-01'", [cedula]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Encuesta guardada exitosamente.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[GH-SAVE] Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

export const getEncuestasResultados = async (req: Request, res: Response) => {
  try {
    const { from, to, search, areaId } = req.query;
    let query = `
      SELECT r.*, p.nombre, p.cargo, a.nombre as area_nombre
      FROM gh_encuestas_sociodemograficas r
      JOIN gh_personal p ON p.cedula = r.cedula
      LEFT JOIN gh_areas a ON a.id = p.area_trabajo_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let p = 1;

    if (from) { query += ` AND r.fecha_realizacion >= $${p++}`; params.push(from); }
    if (to) { query += ` AND r.fecha_realizacion <= $${p++}`; params.push(`${to} 23:59:59`); }
    if (search) { 
      query += ` AND (p.nombre ILIKE $${p} OR p.cedula ILIKE $${p})`; 
      params.push(`%${search}%`); 
      p++;
    }
    if (areaId) { query += ` AND p.area_trabajo_id = $${p++}`; params.push(areaId); }

    query += ` ORDER BY r.fecha_realizacion DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const exportEncuestasExcel = async (req: Request, res: Response) => {
  try {
    const { from, to, search, areaId } = req.query;
    
    console.log('[GH-EXCEL] Iniciando exportación con filtros:', { from, to, search, areaId });

    // 1. Obtener encuestas con todos los nombres de misceláneos
    let query = `
      SELECT r.*, p.nombre as colaborador_nombre, p.cargo as cargo_actual, a.nombre as area_nombre,
             mn.nombre as mun_nac_nombre, dn.nombre as dep_nac_nombre,
             mr.nombre as mun_res_nombre, dr.nombre as dep_res_nombre,
             ts.nombre as sangre_nombre, ec.nombre as civil_nombre,
             ne.nombre as edu_nombre, tv.nombre as vivienda_nombre,
             utl.nombre as tiempo_libre_nombre,
             tc.nombre as contrato_nombre, im.nombre as ingresos_nombre,
             afp.nombre as afp_nombre, eps.nombre as eps_nombre,
             tl.nombre as turno_nombre,
             pac.nombre as pcargo_nombre, cvv.nombre as conviviente_nombre,
             cg.nombre as cargo_enc_nombre,
             fd.nombre as frec_deporte_nombre,
             td.nombre as tipo_deporte_nombre
      FROM gh_encuestas_sociodemograficas r
      JOIN gh_personal p ON p.cedula = r.cedula
      LEFT JOIN gh_areas a ON a.id = p.area_trabajo_id
      LEFT JOIN cfg_ciudades mn ON mn.id = r.municipio_nacimiento_id
      LEFT JOIN cfg_departamentos dn ON dn.id = mn.id_departamento
      LEFT JOIN cfg_ciudades mr ON mr.id = r.municipio_residencia_id
      LEFT JOIN cfg_departamentos dr ON dr.id = mr.id_departamento
      LEFT JOIN gh_tipos_sangre ts ON ts.id = r.tipo_sangre_id
      LEFT JOIN gh_estados_civiles ec ON ec.id = r.estado_civil_id
      LEFT JOIN gh_niveles_educativos ne ON ne.id = r.nivel_educativo_id
      LEFT JOIN gh_tipos_vivienda tv ON tv.id = r.tipo_vivienda_id
      LEFT JOIN gh_usos_tiempo_libre utl ON utl.id = r.uso_tiempo_libre_id
      LEFT JOIN gh_tipos_contrato tc ON tc.id = r.tipo_contrato_id
      LEFT JOIN gh_ingresos_mensuales im ON im.id = r.ingresos_mensuales_id
      LEFT JOIN gh_afp afp ON afp.id = r.afp_id
      LEFT JOIN gh_eps eps ON eps.id = r.eps_id
      LEFT JOIN gh_turnos_laborales tl ON tl.id = r.turno_laboral_id
      LEFT JOIN gh_personas_a_cargo pac ON pac.id = r.personas_a_cargo_id
      LEFT JOIN gh_convivientes cvv ON cvv.id = r.con_quien_vive_id
      LEFT JOIN gh_cargos cg ON cg.id = r.cargo_id
      LEFT JOIN gh_frecuencia_deporte fd ON fd.id = r.frecuencia_deporte_id
      LEFT JOIN gh_tipos_deporte td ON td.id = r.tipo_deporte_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pCount = 1;
    if (from && from !== '') { query += ` AND r.fecha_realizacion >= $${pCount++}`; params.push(from); }
    if (to && to !== '') { query += ` AND r.fecha_realizacion <= $${pCount++}`; params.push(`${to} 23:59:59`); }
    if (search && search !== '') { 
      query += ` AND (p.nombre ILIKE $${pCount} OR p.cedula ILIKE $${pCount})`; 
      params.push(`%${search}%`); 
      pCount++; 
    }
    if (areaId && areaId !== 'null' && areaId !== '') { query += ` AND p.area_trabajo_id = $${pCount++}`; params.push(areaId); }

    query += ` ORDER BY r.fecha_realizacion DESC`;

    const resEnc = await pool.query(query, params);
    const encuestas = resEnc.rows;

    // 2. Obtener hijos de estas encuestas
    let familia: any[] = [];
    if (encuestas.length > 0) {
      const ids = encuestas.map(e => e.id);
      const resFam = await pool.query(`
        SELECT f.*, r.cedula as cedula_personal, p.nombre as nombre_personal
        FROM gh_encuesta_familia f
        JOIN gh_encuestas_sociodemograficas r ON r.id = f.encuesta_id
        JOIN gh_personal p ON p.cedula = r.cedula
        WHERE f.encuesta_id = ANY($1)
      `, [ids]);
      familia = resFam.rows;
    }

    // 3. Formatear para Excel
    const dataEnc = encuestas.map(e => ({
      'COLABORADOR': e.colaborador_nombre,
      'CÉDULA': e.cedula,
      'ÁREA': e.area_nombre || '—',
      'CARGO ACTUAL': e.cargo_actual || '—',
      'CARGO EN ENCUESTA': e.cargo_enc_nombre || '—',
      'FECHA REALIZACIÓN': e.fecha_realizacion ? new Date(e.fecha_realizacion).toLocaleString() : '—',
      'FECHA INGRESO': e.fecha_ingreso ? new Date(e.fecha_ingreso).toLocaleDateString() : '—',
      'LUGAR NACIMIENTO': `${e.mun_nac_nombre || '—'}, ${e.dep_nac_nombre || '—'}`,
      'FECHA NACIMIENTO': e.fecha_nacimiento ? new Date(e.fecha_nacimiento).toLocaleDateString() : '—',
      'TIPO SANGRE': e.sangre_nombre || '—',
      'ESTADO CIVIL': e.civil_nombre || '—',
      'NIVEL EDUCATIVO': e.edu_nombre || '—',
      'TIPO CONTRATO': e.contrato_nombre || '—',
      'INGRESOS': e.ingresos_nombre || '—',
      'AFP': e.afp_nombre || '—',
      'EPS': e.eps_nombre || '—',
      'TURNO': e.turno_nombre || '—',
      'ESTRATO': e.estrato || '—',
      'TIPO VIVIENDA': e.vivienda_nombre || '—',
      'CIUDAD RESIDENCIA': `${e.mun_res_nombre || '—'}, ${e.dep_res_nombre || '—'}`,
      'BARRIO': e.barrio || '—',
      'DIRECCIÓN': e.direccion || '—',
      'SUFRE ENFERMEDAD': e.sufre_enfermedad || '—',
      'VIVEN CONMIGO': e.viven_conmigo || '0',
      'SUSTENTADOR': e.principal_sustentador || '—',
      'PERS. A CARGO': e.pcargo_nombre || '—',
      'DISCAPACIDAD FAM.': e.discapacidad_familia || '—',
      'CON QUIEN VIVE': e.conviviente_nombre || '—',
      'CUANTOS HIJOS': e.cuantos_hijos || '0',
      'BEBE ALCOHOL': e.bebe_alcohol || '—',
      'FUMA': e.fuma || '—',
      'PRACTICA DEPORTE': e.practica_deporte || (e.frec_deporte_nombre?.toLowerCase().includes('no practico') ? 'NO' : (e.frec_deporte_nombre ? 'SI' : '—')),
      'TIPO DEPORTE': e.tipo_deporte_nombre || '—',
      'FRECUENCIA DEPORTE': e.frec_deporte_nombre || '—',
      'USO TIEMPO LIBRE': e.tiempo_libre_nombre === 'Otros' ? e.uso_tiempo_libre_otros : (e.tiempo_libre_nombre || '—'),
      'CONTACTO EMERGENCIA': e.contacto_emergencia_nombre || '—',
      'TELÉFONO EMERGENCIA': e.contacto_emergencia_telefono || '—'
    }));

    const dataFam = familia.map(f => ({
      'CÉDULA COLABORADOR': f.cedula_personal,
      'NOMBRE COLABORADOR': f.nombre_personal,
      'NOMBRE FAMILIAR': f.nombre,
      'FECHA NACIMIENTO': f.fecha_nacimiento ? new Date(f.fecha_nacimiento).toLocaleDateString() : 'N/A'
    }));

    const wb = XLSX.utils.book_new();
    const wsEnc = XLSX.utils.json_to_sheet(dataEnc);
    const wsFam = XLSX.utils.json_to_sheet(dataFam);
    XLSX.utils.book_append_sheet(wb, wsEnc, 'Encuestas');
    XLSX.utils.book_append_sheet(wb, wsFam, 'Familiares');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Encuestas_Sociodemograficas.xlsx');
    res.send(buffer);

  } catch (err: any) {
    console.error('[GH-EXCEL-CRITICAL] Error:', err);
    res.status(500).json({ 
      error: 'Error al generar Excel', 
      details: err.message
    });
  }
};

export const getEncuestaDetail = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT r.*, p.nombre as colaborador_nombre, p.cargo as cargo_actual, a.nombre as area_nombre,
             mn.nombre as mun_nac_nombre, dn.nombre as dep_nac_nombre,
             mr.nombre as mun_res_nombre, dr.nombre as dep_res_nombre,
             ts.nombre as sangre_nombre, ec.nombre as civil_nombre,
             ne.nombre as edu_nombre, tv.nombre as vivienda_nombre,
             utl.nombre as tiempo_libre_nombre,
             tc.nombre as contrato_nombre, im.nombre as ingresos_nombre,
             afp.nombre as afp_nombre, eps.nombre as eps_nombre,
             pac.nombre as pcargo_nombre, cvv.nombre as conviviente_nombre,
             cg.nombre as cargo_enc_nombre,
             fd.nombre as frec_deporte_nombre,
             td.nombre as tipo_deporte_nombre,
             p.celular_personal as celular_personal
      FROM gh_encuestas_sociodemograficas r
      JOIN gh_personal p ON p.cedula = r.cedula
      LEFT JOIN gh_areas a ON a.id = p.area_trabajo_id
      LEFT JOIN cfg_ciudades mn ON mn.id = r.municipio_nacimiento_id
      LEFT JOIN cfg_departamentos dn ON dn.id = mn.id_departamento
      LEFT JOIN cfg_ciudades mr ON mr.id = r.municipio_residencia_id
      LEFT JOIN cfg_departamentos dr ON dr.id = mr.id_departamento
      LEFT JOIN gh_tipos_sangre ts ON ts.id = r.tipo_sangre_id
      LEFT JOIN gh_estados_civiles ec ON ec.id = r.estado_civil_id
      LEFT JOIN gh_niveles_educativos ne ON ne.id = r.nivel_educativo_id
      LEFT JOIN gh_tipos_vivienda tv ON tv.id = r.tipo_vivienda_id
      LEFT JOIN gh_usos_tiempo_libre utl ON utl.id = r.uso_tiempo_libre_id
      LEFT JOIN gh_tipos_contrato tc ON tc.id = r.tipo_contrato_id
      LEFT JOIN gh_ingresos_mensuales im ON im.id = r.ingresos_mensuales_id
      LEFT JOIN gh_afp afp ON afp.id = r.afp_id
      LEFT JOIN gh_eps eps ON eps.id = r.eps_id
      LEFT JOIN gh_personas_a_cargo pac ON pac.id = r.personas_a_cargo_id
      LEFT JOIN gh_convivientes cvv ON cvv.id = r.con_quien_vive_id
      LEFT JOIN gh_cargos cg ON cg.id = r.cargo_id
      LEFT JOIN gh_frecuencia_deporte fd ON fd.id = r.frecuencia_deporte_id
      LEFT JOIN gh_tipos_deporte td ON td.id = r.tipo_deporte_id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });
    
    const fam = await pool.query('SELECT * FROM gh_encuesta_familia WHERE encuesta_id = $1', [id]);
    
    res.json({
      ...result.rows[0],
      familia: fam.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const generateEncuestaPDF = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT r.*, p.nombre, p.cargo as cargo_original, p.fecha_ingreso as fi_original,
             mn.nombre as mun_nac_nombre, dn.nombre as dep_nac_nombre,
             mr.nombre as mun_res_nombre, dr.nombre as dep_res_nombre,
             ts.nombre as sangre_nombre, ec.nombre as civil_nombre,
             ne.nombre as edu_nombre, tv.nombre as vivienda_nombre,
             utl.nombre as tiempo_libre_nombre,
             tc.nombre as contrato_nombre, im.nombre as ingresos_nombre,
             afp.nombre as afp_nombre, eps.nombre as eps_nombre,
             tl.nombre as turno_nombre,
             pac.nombre as pcargo_nombre, cvv.nombre as conviviente_nombre,
             cg.nombre as cargo_enc_nombre,
             fd.nombre as frec_deporte_nombre,
             td.nombre as tipo_deporte_nombre
      FROM gh_encuestas_sociodemograficas r
      JOIN gh_personal p ON p.cedula = r.cedula
      LEFT JOIN cfg_ciudades mn ON mn.id = r.municipio_nacimiento_id
      LEFT JOIN cfg_departamentos dn ON dn.id = mn.id_departamento
      LEFT JOIN cfg_ciudades mr ON mr.id = r.municipio_residencia_id
      LEFT JOIN cfg_departamentos dr ON dr.id = mr.id_departamento
      LEFT JOIN gh_tipos_sangre ts ON ts.id = r.tipo_sangre_id
      LEFT JOIN gh_estados_civiles ec ON ec.id = r.estado_civil_id
      LEFT JOIN gh_niveles_educativos ne ON ne.id = r.nivel_educativo_id
      LEFT JOIN gh_tipos_vivienda tv ON tv.id = r.tipo_vivienda_id
      LEFT JOIN gh_usos_tiempo_libre utl ON utl.id = r.uso_tiempo_libre_id
      LEFT JOIN gh_tipos_contrato tc ON tc.id = r.tipo_contrato_id
      LEFT JOIN gh_ingresos_mensuales im ON im.id = r.ingresos_mensuales_id
      LEFT JOIN gh_afp afp ON afp.id = r.afp_id
      LEFT JOIN gh_eps eps ON eps.id = r.eps_id
      LEFT JOIN gh_turnos_laborales tl ON tl.id = r.turno_laboral_id
      LEFT JOIN gh_personas_a_cargo pac ON pac.id = r.personas_a_cargo_id
      LEFT JOIN gh_convivientes cvv ON cvv.id = r.con_quien_vive_id
      LEFT JOIN gh_cargos cg ON cg.id = r.cargo_id
      LEFT JOIN gh_frecuencia_deporte fd ON fd.id = r.frecuencia_deporte_id
      LEFT JOIN gh_tipos_deporte td ON td.id = r.tipo_deporte_id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const enc = result.rows[0];
    const famResult = await pool.query(`SELECT * FROM gh_encuesta_familia WHERE encuesta_id = $1`, [id]);
    const familia = famResult.rows;

    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    const innerWidth = pageWidth - (margin * 2);

    // 1. HEADER (Grid Style F-GA-013)
    const logoPath = path.join(process.cwd(), 'public', 'logo-encuesta.png');
    if (fs.existsSync(logoPath)) {
      const logoData = fs.readFileSync(logoPath).toString('base64');
      doc.addImage(`data:image/png;base64,${logoData}`, 'PNG', margin + 2, 12, 35, 16);
    }

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, 10, innerWidth, 20); // Main Header Box
    doc.line(margin + 40, 10, margin + 40, 30); // Logo divider
    doc.line(pageWidth - margin - 45, 10, pageWidth - margin - 45, 30); // Right Divider

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const headerTitle1 = "SISTEMA INTEGRADO DE GESTIÓN BASC - PESV - SG-SST, E. 3.1.1";
    const headerTitle2 = "ENCUESTA PERFIL SOCIODEMOGRÁFICO";
    doc.text(headerTitle1, margin + 40 + (innerWidth - 85) / 2, 18, { align: 'center' });
    doc.text(headerTitle2, margin + 40 + (innerWidth - 85) / 2, 24, { align: 'center' });

    doc.setFontSize(7);
    doc.text("CÓDIGO: F-GA-013", pageWidth - margin - 43, 16);
    doc.text("VERSIÓN: 02", pageWidth - margin - 43, 21);
    doc.text(`FECHA: 23/10/2024`, pageWidth - margin - 43, 26);

    let y = 30;
    const surveyDate = enc.fecha_realizacion ? new Date(enc.fecha_realizacion) : new Date();

    // Row for Fecha, Dia, Año, N°
    const dateRowH = 8;
    doc.rect(margin, y, innerWidth, dateRowH);
    doc.setFontSize(7);
    doc.text(`FECHA: ${surveyDate.toLocaleDateString()}`, margin + 2, y + 5);
    doc.line(margin + 60, y, margin + 60, y + dateRowH);
    doc.text(`DIA: ${surveyDate.getDate()}`, margin + 62, y + 5);
    doc.line(margin + 100, y, margin + 100, y + dateRowH);
    doc.text(`AÑO: ${surveyDate.getFullYear()}`, margin + 102, y + 5);
    doc.line(pageWidth - margin - 30, y, pageWidth - margin - 30, y + dateRowH);
    doc.text(`N°: ${enc.id}`, pageWidth - margin - 28, y + 5);
    
    y += dateRowH;

    // Row for Full Name
    doc.rect(margin, y, innerWidth, dateRowH);
    doc.setFont("helvetica", "bold");
    doc.text(`NOMBRES Y APELLIDOS COMPLETOS: ${enc.nombre.toUpperCase()}`, margin + 2, y + 5);
    
    y += dateRowH + 5;

    // Helper para dibujar filas tipo formulario (LADO A LADO)
    const drawFormRow = (label1: string, val1: any, label2: string, val2: any, currentY: number) => {
      const rowH = 8;
      const labelW = 42;
      const valW = (innerWidth / 2) - labelW;
      
      doc.setFontSize(7);
      doc.setTextColor(0);

      // Col 1 - Izquierda
      doc.setFont("helvetica", "bold");
      doc.setFillColor(235, 235, 235);
      doc.rect(margin, currentY, labelW, rowH, 'FD'); // Label Box Gray
      doc.text(label1, margin + 2, currentY + 5);
      
      doc.setFont("helvetica", "normal");
      doc.setFillColor(255, 255, 255);
      doc.rect(margin + labelW, currentY, valW, rowH, 'FD'); // Value Box White
      doc.text(String(val1 || '—'), margin + labelW + 2, currentY + 5, { maxWidth: valW - 4 });

      // Col 2 - Derecha
      const col2X = margin + (innerWidth / 2);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(235, 235, 235);
      doc.rect(col2X, currentY, labelW, rowH, 'FD'); // Label Box Gray
      doc.text(label2, col2X + 2, currentY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFillColor(255, 255, 255);
      doc.rect(col2X + labelW, currentY, valW, rowH, 'FD'); // Value Box White
      doc.text(String(val2 || '—'), col2X + labelW + 2, currentY + 5, { maxWidth: valW - 4 });

      return currentY + rowH;
    };

    // FLUJO DE PREGUNTAS (1-L, 2-R, 3-L, 4-R...)
    y = drawFormRow("1. DOCUMENTO IDENTIDAD", enc.cedula, "2. LUGAR Y FECHA NAC.", `${enc.mun_nac_nombre} / ${enc.fecha_nacimiento ? new Date(enc.fecha_nacimiento).toLocaleDateString() : '—'}`, y);
    y = drawFormRow("3. TIPO DE SANGRE", enc.sangre_nombre, "4. ESTADO CIVIL", enc.civil_nombre, y);
    y = drawFormRow("5. EDAD", enc.fecha_nacimiento ? (new Date().getFullYear() - new Date(enc.fecha_nacimiento).getFullYear()) : '—', "6. NIVEL EDUCATIVO", enc.edu_nombre, y);
    y = drawFormRow("7. FECHA DE INGRESO", enc.fecha_ingreso ? new Date(enc.fecha_ingreso).toLocaleDateString() : '—', "8. CARGO", enc.cargo_enc_nombre || enc.cargo_original, y);
    y = drawFormRow("9. TIPO DE CONTRATO", enc.contrato_nombre, "10. INGRESOS MENSUALES", enc.ingresos_nombre, y);
    y = drawFormRow("11. AFP", enc.afp_nombre, "12. EPS", enc.eps_nombre, y);
    y = drawFormRow("13. TURNO LABORAL", enc.turno_nombre, "14. TIPO DE VIVIENDA", enc.vivienda_nombre, y);
    y = drawFormRow("15. MUNICIPIO . BARRIO RES.", `${enc.mun_res_nombre} / ${enc.barrio}`, "16. DIRECCIÓN", enc.direccion, y);
    y = drawFormRow("17. SUFRE ENFERMEDAD", enc.sufre_enfermedad, "18. PERSONAS EN HOGAR", enc.viven_conmigo, y);
    y = drawFormRow("19. ESTRATO SOCIOECON.", enc.estrato, "20. NÚMERO DE CELULAR", enc.celular_personal, y);
    y = drawFormRow("21. ES PRINCIPAL SUSTENT.", enc.principal_sustentador, "22. PERSONAS A CARGO", enc.pcargo_nombre, y);
    y = drawFormRow("23. DISCAPACIDAD FAM.", enc.discapacidad_familia, "24. CON QUIÉN VIVE", enc.conviviente_nombre, y);
    
    y += 2;
    // 25 y 26 (Hijos)
    const numHijos = enc.cuantos_hijos || 0;
    y = drawFormRow("25. CUANTOS HIJOS TIENE", numHijos, "26. HIJOS MENORES DE 18", numHijos > 0 ? "Ver tabla" : "Ninguno", y);

    if (familia.length > 0) {
      const famData = familia.map(f => [f.nombre, f.fecha_nacimiento ? new Date(f.fecha_nacimiento).toLocaleDateString() : '—']);
      autoTable(doc, {
        startY: y,
        head: [['NOMBRE COMPLETO DEL HIJO/A', 'FECHA NACIMIENTO']],
        body: famData,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
        margin: { left: margin, right: margin }
      });
      y = (doc as any).lastAutoTable.finalY + 2;
    }

    if (y > 230) { doc.addPage(); y = 20; }
    y = drawFormRow("27. CONSUME ALCOHOL", enc.bebe_alcohol, "28. FUMA ACTUALMENTE", enc.fuma, y);
    y = drawFormRow("29. PRACTICA DEPORTE", enc.practica_deporte || (enc.frec_deporte_nombre?.toLowerCase().includes('no practico') ? 'NO' : (enc.frec_deporte_nombre ? 'SI' : '—')), "30. TIPO DE DEPORTE", enc.tipo_deporte_nombre, y);
    const tiempoLibre = enc.tiempo_libre_nombre === 'Otros' ? enc.uso_tiempo_libre_otros : enc.tiempo_libre_nombre;
    y = drawFormRow("31. USO TIEMPO LIBRE", tiempoLibre, "32. CONTACTO EMERGENCIA", `${enc.contacto_emergencia_nombre} (${enc.contacto_emergencia_telefono})`, y);
    
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("33. CONSENTIMIENTO INFORMADO", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const disclaimer = "Ley 1581 de 2012: de protección de datos personales, es una ley que complementa la regulación vigente para la protección del derecho fundamental que tienen todas las personas naturales a autorizar la información personal que es almacenada en bases de datos o archivos, así como su posterior actualización y rectificación.";
    doc.text(doc.splitTextToSize(disclaimer, innerWidth), margin, y + 5);
    y += 15;
    doc.setDrawColor(180);
    doc.line(margin, y, margin + 70, y);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("FIRMA DEL COLABORADOR", margin, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(`C.C. No. ${enc.cedula}`, margin, y + 9);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=F-GA-013_${enc.cedula}.pdf`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[PDF-ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

// --- LMS GAMIFICADO ---

export const getCapacitaciones = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM gh_capacitaciones ORDER BY fecha_creacion DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const saveCapacitacion = async (req: Request, res: Response) => {
  const { id, titulo, descripcion, puntos_premio, estado, preguntas } = req.body;
  const usuario = (req as any).user?.nombre || 'ADMIN';
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let capId = id;
    
    if (id) {
      await client.query(`
        UPDATE gh_capacitaciones 
        SET titulo = $1, descripcion = $2, puntos_premio = $3, estado = $4, usuario_control = $5
        WHERE id = $6
      `, [titulo, descripcion, puntos_premio, estado, usuario, id]);
      await client.query('DELETE FROM gh_capacitacion_preguntas WHERE capacitacion_id = $1', [id]);
    } else {
      const resCap = await client.query(`
        INSERT INTO gh_capacitaciones (titulo, descripcion, puntos_premio, estado, usuario_control)
        VALUES ($1, $2, $3, $4, $5) RETURNING id
      `, [titulo, descripcion, puntos_premio, estado || 'BORRADOR', usuario]);
      capId = resCap.rows[0].id;
    }
    
    if (preguntas && preguntas.length > 0) {
      for (let i = 0; i < preguntas.length; i++) {
        const p = preguntas[i];
        await client.query(`
          INSERT INTO gh_capacitacion_preguntas (capacitacion_id, tipo, pregunta, config_json, orden)
          VALUES ($1, $2, $3, $4, $5)
        `, [capId, p.tipo, p.pregunta, JSON.stringify(p.config_json), i]);
      }
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Capacitación guardada', id: capId });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

export const getAsignacionesCapacitacion = async (req: Request, res: Response) => {
  const { capId } = req.params;
  try {
    const result = await pool.query(`
      SELECT a.*, p.nombre as colaborador_nombre, pr.nombre as area_nombre
      FROM gh_capacitacion_asignaciones a
      JOIN gh_personal p ON p.cedula = a.cedula
      LEFT JOIN gh_areas pr ON pr.id = p.area_trabajo_id
      WHERE a.capacitacion_id = $1
      ORDER BY a.fecha_control DESC
    `, [capId]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const asignarCapacitacion = async (req: Request, res: Response) => {
  const { capacitacion_id, cedulas, desde, hasta } = req.body;
  const usuario = (req as any).user?.nombre || 'ADMIN';
  
  try {
    for (const cedula of cedulas) {
      // Detección automática de Reinducción
      const check = await pool.query(`
        SELECT id FROM gh_capacitacion_asignaciones 
        WHERE capacitacion_id = $1 AND cedula = $2 AND estado = 'COMPLETADO'
      `, [capacitacion_id, cedula]);
      
      const tipo = check.rows.length > 0 ? 'REINDUCCION' : 'INDUCCION';
      
      await pool.query(`
        INSERT INTO gh_capacitacion_asignaciones (capacitacion_id, cedula, tipo_proceso, desde, hasta, usuario_control)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [capacitacion_id, cedula, tipo, desde, hasta, usuario]);
    }
    res.json({ message: 'Personal asignado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getPublicCapacitacion = async (req: Request, res: Response) => {
  const { id, cedula } = req.query;
  try {
    const asig = await pool.query(`
      SELECT a.*, c.titulo, c.descripcion, c.puntos_premio
      FROM gh_capacitacion_asignaciones a
      JOIN gh_capacitaciones c ON c.id = a.capacitacion_id
      WHERE a.capacitacion_id = $1 AND a.cedula = $2 AND c.estado = 'ACTIVO'
    `, [id, cedula]);
    
    if (asig.rows.length === 0) {
      return res.status(403).json({ error: 'No tienes una asignación activa para esta capacitación' });
    }
    
    const questions = await pool.query(`
      SELECT * FROM gh_capacitacion_preguntas 
      WHERE capacitacion_id = $1 ORDER BY orden ASC
    `, [id]);
    
    res.json({
      asignacion: asig.rows[0],
      preguntas: questions.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const submitCapacitacionResult = async (req: Request, res: Response) => {
  const { asignacion_id, calificacion, progreso } = req.body;
  try {
    await pool.query(`
      UPDATE gh_capacitacion_asignaciones 
      SET calificacion = $1, progreso = $2, estado = CASE WHEN $2 >= 100 THEN 'COMPLETADO' ELSE 'EN_CURSO' END,
          fecha_completado = CASE WHEN $2 >= 100 THEN CURRENT_TIMESTAMP ELSE fecha_completado END
      WHERE id = $3
    `, [calificacion, progreso, asignacion_id]);
    res.json({ message: 'Progreso guardado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
