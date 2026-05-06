import { Request, Response } from 'express';
import pool from '../config/database.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @ts-ignore
import * as XLSX from 'xlsx';

// Logo institucional en Base64
const LOGO_MILLA_SIETE = 'data:image/png;base64,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';









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
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS uso_tiempo_libre_id INTEGER;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS uso_tiempo_libre_otros TEXT;
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre VARCHAR(255);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono VARCHAR(50);
      ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS consentimiento BOOLEAN;
      
      -- Migración: practica_deporte -> celular
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gh_encuestas_sociodemograficas' AND column_name='practica_deporte') THEN
          ALTER TABLE gh_encuestas_sociodemograficas RENAME COLUMN practica_deporte TO celular;
        ELSE
          ALTER TABLE gh_encuestas_sociodemograficas ADD COLUMN IF NOT EXISTS celular VARCHAR(20);
        END IF;
      END $$;
      ALTER TABLE gh_encuestas_sociodemograficas DROP COLUMN IF EXISTS datos;

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
  if (!cedula) {
    return res.status(400).json({ error: 'Cédula requerida.' });
  }
  try {
    const r = await pool.query(`
      SELECT nombre, cedula, cargo, fecha_ingreso
      FROM gh_personal
      WHERE TRIM(cedula) = TRIM($1)
      LIMIT 1
    `, [cedula]);

    if (r.rows.length === 0) {
      return res.status(403).json({ error: 'Cédula no encontrada. Verifique el número e intente de nuevo.' });
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
        tipo_deporte_id, celular, uso_tiempo_libre_id, uso_tiempo_libre_otros,
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
      'CONSUMO ALCOHOL': e.bebe_alcohol || '—',
      'FUMA': e.fuma || '—',
      'PRACTICA DEPORTE': e.frec_deporte_nombre || '—',
      'CELULAR ENCUESTA': e.celular || '—',
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
             p.celular_personal as celular_personal,
             tl.nombre as turno_nombre
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
             td.nombre as tipo_deporte_nombre,
             p.celular_personal as celular_personal
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
    const headerH = 20;
    const logoW = 40;
    const infoW = 45;
    const titleW = innerWidth - logoW - infoW;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    
    // Logo Box
    doc.rect(margin, 10, logoW, headerH);
    
    try {
      // LOGO INSTITUCIONAL
      doc.addImage(LOGO_MILLA_SIETE, 'PNG', margin + 2, 11, logoW - 4, headerH - 2);
    } catch (e) {
      console.error('[GH-PDF] Error renderizando imágenes:', e);
    }

    // Title Box
    doc.rect(margin + logoW, 10, titleW, headerH);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize("SISTEMA INTEGRADO DE GESTIÓN BASC - PESV - SG-SST, E. 3.1.1\nENCUESTA PERFIL SOCIODEMOGRÁFICO", titleW - 4);
    doc.text(titleLines, margin + logoW + (titleW / 2), 17, { align: 'center' });

    // Info Box
    doc.rect(margin + logoW + titleW, 10, infoW, headerH);
    doc.setFontSize(7);
    doc.text("CÓDIGO: F-GA-013", margin + logoW + titleW + 2, 16);
    doc.text("VERSIÓN: 02", margin + logoW + titleW + 2, 21);
    doc.text(`FECHA: 23/10/2024`, margin + logoW + titleW + 2, 26);

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

    doc.rect(margin, y, innerWidth, dateRowH);
    doc.setFont("helvetica", "bold");
    doc.text(`NOMBRES Y APELLIDOS COMPLETOS: ${enc.nombre.toUpperCase()}`, margin + 2, y + 5);
    
    y += dateRowH + 2;

    const drawFormRow = (label1: string, val1: any, label2: string, val2: any, currentY: number): number => {
      const colW = innerWidth / 2;
      const labelH = 6;    // altura fija de la sub-fila de etiqueta
      const lineH = 4.2;   // alto por línea de texto en el valor
      const minH  = 6;     // mínimo alto del área de valor
      const pad   = 2;
      const displayVal = (v: any) => (v !== null && v !== undefined && v !== '') ? String(v) : '—';

      doc.setFontSize(7);

      // Pre-dividir el texto para medir cuántas líneas necesita cada columna
      const txt1 = doc.splitTextToSize(displayVal(val1), colW - pad * 2);
      const txt2 = doc.splitTextToSize(displayVal(val2), colW - pad * 2);
      const contentH = Math.max(txt1.length * lineH + pad, txt2.length * lineH + pad, minH);
      const rowH = labelH + contentH;

      // Salto de página automático si la fila no cabe
      const pageH = (doc.internal.pageSize as any).height;
      if (currentY + rowH > pageH - 15) {
        doc.addPage();
        currentY = 20;
      }

      doc.setTextColor(0);

      // Columna izquierda — etiqueta
      doc.setFont("helvetica", "bold");
      doc.rect(margin, currentY, colW, labelH);
      doc.text(label1, margin + pad, currentY + 4.5);
      // Columna izquierda — valor (altura dinámica)
      doc.setFont("helvetica", "normal");
      doc.rect(margin, currentY + labelH, colW, contentH);
      doc.text(txt1, margin + pad, currentY + labelH + lineH);

      // Columna derecha — etiqueta
      const col2X = margin + colW;
      doc.setFont("helvetica", "bold");
      doc.rect(col2X, currentY, colW, labelH);
      doc.text(label2, col2X + pad, currentY + 4.5);
      // Columna derecha — valor (altura dinámica)
      doc.setFont("helvetica", "normal");
      doc.rect(col2X, currentY + labelH, colW, contentH);
      doc.text(txt2, col2X + pad, currentY + labelH + lineH);

      return currentY + rowH;
    };

    const calculateAge = (birthDate: any) => {
      if (!birthDate) return '—';
      const today = new Date();
      const birth = new Date(birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    };

    y = drawFormRow("1. DOCUMENTO IDENTIDAD", enc.cedula, "2. LUGAR Y FECHA NAC.", `${enc.mun_nac_nombre} / ${enc.fecha_nacimiento ? new Date(enc.fecha_nacimiento).toLocaleDateString() : '—'}`, y);
    y = drawFormRow("3. TIPO DE SANGRE", enc.sangre_nombre, "4. ESTADO CIVIL", enc.civil_nombre, y);
    y = drawFormRow("5. EDAD", calculateAge(enc.fecha_nacimiento), "6. NIVEL EDUCATIVO", enc.edu_nombre, y);
    y = drawFormRow("7. FECHA DE INGRESO", enc.fecha_ingreso ? new Date(enc.fecha_ingreso).toLocaleDateString() : '—', "8. CARGO", enc.cargo_enc_nombre || enc.cargo_original, y);
    y = drawFormRow("9. TIPO DE CONTRATO", enc.contrato_nombre, "10. INGRESOS MENSUALES", enc.ingresos_nombre, y);
    y = drawFormRow("11. AFP", enc.afp_nombre, "12. EPS", enc.eps_nombre, y);
    y = drawFormRow("13. TURNO LABORAL", enc.turno_nombre, "14. TIPO DE VIVIENDA", enc.vivienda_nombre, y);
    y = drawFormRow("15. MUNICIPIO . BARRIO RES.", `${enc.mun_res_nombre} / ${enc.barrio}`, "16. DIRECCIÓN", enc.direccion, y);
    y = drawFormRow("17. SUFRE ENFERMEDAD", enc.sufre_enfermedad, "18. PERSONAS EN HOGAR", enc.viven_conmigo, y);
    y = drawFormRow("19. ESTRATO SOCIOECON.", enc.estrato, "20. CELULAR", enc.celular || enc.celular_personal, y);
    y = drawFormRow("21. ES PRINCIPAL SUSTENT.", enc.principal_sustentador, "22. PERSONAS A CARGO", enc.pcargo_nombre, y);
    y = drawFormRow("23. DISCAPACIDAD FAM.", enc.discapacidad_familia, "24. CON QUIÉN VIVE", enc.conviviente_nombre, y);
    
    y += 2;
    const numHijos = enc.cuantos_hijos === null || enc.cuantos_hijos === undefined ? '—' : enc.cuantos_hijos;
    const hijosText = familia.length > 0 
      ? familia.map(f => `${f.nombre} (${f.fecha_nacimiento ? new Date(f.fecha_nacimiento).toLocaleDateString() : '—'})`).join('\n')
      : (enc.cuantos_hijos > 0 ? "Información no disponible" : "Ninguno");
    
    y = drawFormRow("25. CUANTOS HIJOS TIENE", numHijos, "26. HIJOS MENORES DE 18 (Nombre y Fecha Nacimiento)", hijosText, y);

    if (y > 230) { doc.addPage(); y = 20; }
    y = drawFormRow("27. CONSUME ALCOHOL", enc.bebe_alcohol, "28. FUMA ACTUALMENTE", enc.fuma, y);
    y = drawFormRow("29. PRACTICA DEPORTE", enc.frec_deporte_nombre || '—', "30. TIPO DE DEPORTE", enc.tipo_deporte_nombre, y);
    const tiempoLibre = enc.tiempo_libre_nombre === 'Otros' ? enc.uso_tiempo_libre_otros : enc.tiempo_libre_nombre;
    y = drawFormRow("31. USO TIEMPO LIBRE", tiempoLibre, "32. CONTACTO EMERGENCIA", `${enc.contacto_emergencia_nombre} (${enc.contacto_emergencia_telefono})`, y);
    
    y += 5;
    if (y > 240) { doc.addPage(); y = 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.rect(margin, y, innerWidth, 6);
    doc.text("33. CONSENTIMIENTO INFORMADO", margin + 2, y + 4.5);
    y += 6;

    const consH = 15;
    const optW = 20;
    doc.rect(margin, y, optW, consH);
    doc.setFontSize(7);
    const hasConsent = enc.consentimiento === true || enc.consentimiento === 't';
    doc.text(`${hasConsent ? '[X]' : '[  ]'} a) SI`, margin + 2, y + 6);
    doc.text(`${!hasConsent ? '[X]' : '[  ]'} b) NO`, margin + 2, y + 11);
    
    doc.rect(margin + optW, y, innerWidth - optW, consH);
    doc.setFont("helvetica", "normal");
    const disclaimer = "Ley 1581 de 2012: de protección de datos personales, es una ley que complementa la regulación vigente para la protección del derecho fundamental que tienen todas las personas naturales a autorizar la información personal que es almacenada en bases de datos o archivos, así como su posterior actualización y rectificación.";
    doc.text(doc.splitTextToSize(disclaimer, innerWidth - optW - 4), margin + optW + 2, y + 5);
    y += consH + 10;

    // Paginación (Pág. X de Y)
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Pág. ${i} de ${pageCount}`, pageWidth - margin, doc.internal.pageSize.height - 10, { align: 'right' });
    }
    
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const cleanName = (enc.nombre || 'SIN_NOMBRE')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const fechaPdf = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=encuesta_${cleanName}_${enc.cedula}_${fechaPdf}.pdf`);
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
