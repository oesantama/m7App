import { Request, Response } from 'express';
import pool from '../config/database.js';

const ALLOWED_TABLES: Record<string, string> = {
  'horarios-laborales': 'gh_horarios_laborales',
  'eps':                'gh_eps',
  'afp':                'gh_afp',
  'tipos-vivienda':     'gh_tipos_vivienda',
  'tipos-contrato':     'gh_tipos_contrato',
  'ingresos-mensuales': 'gh_ingresos_mensuales',
  'cargos':             'gh_cargos',
  'tipos-sangre':       'gh_tipos_sangre',
  'estados-civiles':    'gh_estados_civiles',
  'niveles-educativos': 'gh_niveles_educativos',
  'areas':              'gh_areas',
  'jefes-inmediatos':   'gh_jefes_inmediatos',
  'turnos-laborales':   'gh_turnos_laborales',
  'personas-a-cargo':   'gh_personas_a_cargo',
  'convivientes':       'gh_convivientes',
  'frecuencia-deporte': 'gh_frecuencia_deporte',
  'tipos-deporte':      'gh_tipos_deporte',
  'usos-tiempo-libre':  'gh_usos_tiempo_libre',
};

const resolveTable = (tabla: string): string | null => ALLOWED_TABLES[tabla] ?? null;

const GENERIC_CATEGORIES = ['parentescos'];

export const getGhMiscelaneos = async (req: Request, res: Response) => {
  const tabla = req.params.tabla as string;
  const table = resolveTable(tabla);

  try {
    if (table) {
      let query = `SELECT id, nombre, estado, usuario_control, fecha_control FROM ${table} ORDER BY nombre ASC`;
      
      if (tabla === 'jefes-inmediatos') {
        query = `
          SELECT j.*, a.nombre as area_nombre 
          FROM gh_jefes_inmediatos j
          LEFT JOIN gh_areas a ON a.id = j.area_id
          ORDER BY j.nombre ASC
        `;
      }
      const result = await pool.query(query);
      return res.json(result.rows);
    } else if (GENERIC_CATEGORIES.includes(tabla)) {
      // Buscar en la tabla genérica gh_miscelaneos por categoría
      const result = await pool.query(
        `SELECT id, nombre FROM gh_miscelaneos WHERE categoria = $1 ORDER BY nombre ASC`,
        [tabla]
      );
      return res.json(result.rows);
    } else {
      return res.status(400).json({ error: 'Tabla o categoría no permitida' });
    }
  } catch (err: any) {
    console.error(`[GH-MISC] Error GET ${tabla}:`, err);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
};

export const saveGhMiscelaneo = async (req: Request, res: Response) => {
  const table = resolveTable(req.params.tabla as string);
  if (!table) return res.status(400).json({ error: 'Tabla no permitida' });

  const { id, nombre, estado, usuarioControl, area_id, personal_id } = req.body;

  try {
    if (id) {
      if (req.params.tabla === 'jefes-inmediatos') {
        await pool.query(
          `UPDATE gh_jefes_inmediatos SET nombre=$1, estado=$2, usuario_control=$3, area_id=$4, personal_id=$5, fecha_control=CURRENT_TIMESTAMP WHERE id=$6`,
          [nombre, estado, usuarioControl || 'System', area_id, personal_id, id]
        );
      } else {
        await pool.query(
          `UPDATE ${table} SET nombre=$1, estado=$2, usuario_control=$3, fecha_control=CURRENT_TIMESTAMP WHERE id=$4`,
          [nombre, estado, usuarioControl || 'System', id]
        );
      }
    } else {
      if (req.params.tabla === 'jefes-inmediatos') {
        await pool.query(
          `INSERT INTO gh_jefes_inmediatos (nombre, estado, usuario_control, area_id, personal_id, fecha_control) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
          [nombre, estado, usuarioControl || 'System', area_id, personal_id]
        );
      } else {
        await pool.query(
          `INSERT INTO ${table} (nombre, estado, usuario_control, fecha_control) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
          [nombre, estado, usuarioControl || 'System']
        );
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[GH-MISC] Error SAVE ${table}:`, err);
    res.status(500).json({ error: 'Error al guardar registro' });
  }
};

export const deleteGhMiscelaneo = async (req: Request, res: Response) => {
  const table = resolveTable(req.params.tabla as string);
  if (!table) return res.status(400).json({ error: 'Tabla no permitida' });

  const { id } = req.params;
  try {
    const result = await pool.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[GH-MISC] Error DELETE ${table}:`, err);
    res.status(500).json({ error: 'Error al eliminar registro', details: err.detail || err.message });
  }
};
