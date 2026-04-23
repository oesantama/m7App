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
};

const resolveTable = (tabla: string): string | null => ALLOWED_TABLES[tabla] ?? null;

export const getGhMiscelaneos = async (req: Request, res: Response) => {
  const table = resolveTable(req.params.tabla as string);
  if (!table) return res.status(400).json({ error: 'Tabla no permitida' });

  try {
    const result = await pool.query(
      `SELECT id, nombre, estado, usuario_control, fecha_control FROM ${table} ORDER BY nombre ASC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error(`[GH-MISC] Error GET ${table}:`, err);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
};

export const saveGhMiscelaneo = async (req: Request, res: Response) => {
  const table = resolveTable(req.params.tabla as string);
  if (!table) return res.status(400).json({ error: 'Tabla no permitida' });

  const { id, nombre, estado, usuarioControl } = req.body;

  try {
    if (id) {
      await pool.query(
        `UPDATE ${table} SET nombre=$1, estado=$2, usuario_control=$3, fecha_control=CURRENT_TIMESTAMP WHERE id=$4`,
        [nombre, estado, usuarioControl || 'System', id]
      );
    } else {
      await pool.query(
        `INSERT INTO ${table} (nombre, estado, usuario_control, fecha_control) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
        [nombre, estado, usuarioControl || 'System']
      );
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
