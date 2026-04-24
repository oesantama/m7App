import { Request, Response } from 'express';
import pool from '../config/database.js';

/**
 * Asegura que las tablas necesarias existan.
 */
const initTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gh_areas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS gh_jefes_inmediatos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        area_id INTEGER,
        personal_id INTEGER,
        estado VARCHAR(50) DEFAULT 'ACTIVO',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
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
    CREATE TABLE IF NOT EXISTS gh_personal_has_encuesta (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(50) NOT NULL,
        fecha_activacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        usuario_control VARCHAR(255),
        fecha_control TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Registrar Pagina Personal si no existe
    INSERT INTO pages (id, parent_id, name, route, status_id)
    SELECT 'PAG-43', 'MOD-09', 'Personal', 'gestion-humana-personal', 'EST-01'
    WHERE NOT EXISTS (SELECT 1 FROM pages WHERE id = 'PAG-43');

    -- Asegurar columnas si ya existía la tabla
    ALTER TABLE gh_jefes_inmediatos ADD COLUMN IF NOT EXISTS area_id INTEGER;
    ALTER TABLE gh_jefes_inmediatos ADD COLUMN IF NOT EXISTS personal_id INTEGER;
  `);
};

// Ejecutar init al cargar el módulo
initTables().catch(err => console.error('[GH-PERSONAL] Error init tables:', err));

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
    console.error('[GH-PERSONAL] Error getPersonal:', err);
    res.status(500).json({ error: 'Error al obtener personal' });
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
        es_jefe, fecha_ingreso, estado || 'ACTIVO', usuarioControl || 'System'
      ]);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[GH-PERSONAL] Error savePersonal:', err);
    res.status(500).json({ error: 'Error al guardar personal', details: err.message });
  }
};

export const deletePersonal = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM gh_personal WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[GH-PERSONAL] Error deletePersonal:', err);
    res.status(500).json({ error: 'Error al eliminar personal' });
  }
};

// Encuestas
export const getPersonalEncuestas = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM gh_personal_has_encuesta ORDER BY fecha_activacion DESC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[GH-PERSONAL] Error getPersonalEncuestas:', err);
    res.status(500).json({ error: 'Error al obtener encuestas' });
  }
};

export const activateEncuesta = async (req: Request, res: Response) => {
  const { cedula, usuarioControl } = req.body;
  try {
    await pool.query(`
      INSERT INTO gh_personal_has_encuesta (cedula, usuario_control)
      VALUES ($1, $2)
    `, [cedula, usuarioControl || 'System']);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[GH-PERSONAL] Error activateEncuesta:', err);
    res.status(500).json({ error: 'Error al activar encuesta' });
  }
};
