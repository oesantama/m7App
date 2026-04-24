import { Request, Response } from 'express';
import pool from '../config/database.js';

// ─── DEPARTAMENTOS ────────────────────────────────────────────────────────────

export const getDepartamentos = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, estado, usuario_control, fecha_control FROM cfg_departamentos ORDER BY nombre ASC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CFG-CIUDADES] Error GET departamentos:', err);
    res.status(500).json({ error: 'Error al obtener departamentos' });
  }
};

export const saveDepartamento = async (req: Request, res: Response) => {
  const { id, nombre, estado, usuarioControl } = req.body;
  try {
    if (id) {
      await pool.query(
        `UPDATE cfg_departamentos SET nombre=$1, estado=$2, usuario_control=$3, fecha_control=CURRENT_TIMESTAMP WHERE id=$4`,
        [nombre, estado, usuarioControl || 'System', id]
      );
    } else {
      await pool.query(
        `INSERT INTO cfg_departamentos (nombre, estado, usuario_control, fecha_control) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
        [nombre, estado, usuarioControl || 'System']
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CFG-CIUDADES] Error SAVE departamento:', err);
    res.status(500).json({ error: 'Error al guardar departamento' });
  }
};

export const bulkSaveDepartamentos = async (req: Request, res: Response) => {
  const { items, usuarioControl } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const nombre = item.nombre.trim();
      const exist = await client.query('SELECT id FROM cfg_departamentos WHERE UPPER(nombre) = UPPER($1)', [nombre]);
      if (exist.rowCount === 0) {
        await client.query(
          `INSERT INTO cfg_departamentos (nombre, estado, usuario_control, fecha_control) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
          [nombre, 'EST-01', usuarioControl || 'System']
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CFG-CIUDADES] Error BULK SAVE departamentos:', err);
    res.status(500).json({ error: 'Error en importación masiva' });
  } finally {
    client.release();
  }
};

export const deleteDepartamento = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const depUsed = await pool.query(
      `SELECT COUNT(*) FROM cfg_ciudades WHERE id_departamento=$1`, [id]
    );
    if (parseInt(depUsed.rows[0].count) > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: tiene ciudades asociadas' });
    }
    const result = await pool.query(`DELETE FROM cfg_departamentos WHERE id=$1 RETURNING id`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Departamento no encontrado' });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CFG-CIUDADES] Error DELETE departamento:', err);
    res.status(500).json({ error: 'Error al eliminar departamento', details: err.detail || err.message });
  }
};

// ─── CIUDADES ─────────────────────────────────────────────────────────────────

export const getCiudades = async (req: Request, res: Response) => {
  const { departamentoId } = req.query;
  try {
    const base = `
      SELECT c.id, c.nombre, c.id_departamento, d.nombre AS departamento_nombre,
             c.estado, c.usuario_control, c.fecha_control
      FROM cfg_ciudades c
      LEFT JOIN cfg_departamentos d ON c.id_departamento = d.id
    `;
    const depId = (departamentoId && departamentoId !== 'undefined') ? departamentoId : null;
    const result = depId
      ? await pool.query(base + ` WHERE c.id_departamento=$1 ORDER BY c.nombre ASC`, [depId])
      : await pool.query(base + ` ORDER BY c.nombre ASC`);
    res.json(result.rows);
  } catch (err: any) {
    console.error('[CFG-CIUDADES] Error GET ciudades:', err);
    res.status(500).json({ error: 'Error al obtener ciudades' });
  }
};

export const saveCiudad = async (req: Request, res: Response) => {
  const { id, nombre, idDepartamento, estado, usuarioControl } = req.body;
  try {
    if (id) {
      await pool.query(
        `UPDATE cfg_ciudades SET nombre=$1, id_departamento=$2, estado=$3, usuario_control=$4, fecha_control=CURRENT_TIMESTAMP WHERE id=$5`,
        [nombre, idDepartamento, estado, usuarioControl || 'System', id]
      );
    } else {
      await pool.query(
        `INSERT INTO cfg_ciudades (nombre, id_departamento, estado, usuario_control, fecha_control) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,
        [nombre, idDepartamento, estado, usuarioControl || 'System']
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CFG-CIUDADES] Error SAVE ciudad:', err);
    res.status(500).json({ error: 'Error al guardar ciudad' });
  }
};

export const bulkSaveCiudades = async (req: Request, res: Response) => {
  const { items, usuarioControl } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const nombre = item.nombre.trim();
      const idDep  = item.idDepartamento;
      const exist = await client.query('SELECT id FROM cfg_ciudades WHERE UPPER(nombre) = UPPER($1) AND id_departamento = $2', [nombre, idDep]);
      if (exist.rowCount === 0) {
        await client.query(
          `INSERT INTO cfg_ciudades (nombre, id_departamento, estado, usuario_control, fecha_control) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,
          [nombre, idDep, 'EST-01', usuarioControl || 'System']
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CFG-CIUDADES] Error BULK SAVE ciudades:', err);
    res.status(500).json({ error: 'Error en importación masiva' });
  } finally {
    client.release();
  }
};

export const deleteCiudad = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`DELETE FROM cfg_ciudades WHERE id=$1 RETURNING id`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Ciudad no encontrada' });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[CFG-CIUDADES] Error DELETE ciudad:', err);
    res.status(500).json({ error: 'Error al eliminar ciudad', details: err.detail || err.message });
  }
};
