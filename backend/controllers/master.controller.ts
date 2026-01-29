
import { Request, Response } from 'express';
import pool from '../config/database.js';


export const getMasters = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM master_records ORDER BY category, name ASC');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[M7-MASTERS] Error getting masters:', err);
    res.status(500).json({ error: "Error al obtener maestros" });
  }
};

export const saveMasterRecord = async (req: Request, res: Response) => {
  const { category } = req.params;
  const r = req.body;
  
  try {
    // Verificar que categoría existe en la tabla (opcional, pero buena práctica)
    // Para simplificar, asumimos que 'category' coincide con la columna 'category' en master_records
    
    await pool.query(`
      INSERT INTO master_records (id, category, name, description, parent_id, notification_email, icon_class, status_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
      name = $3, description = $4, parent_id = $5, notification_email = $6, icon_class = $7, status_id = $8, updated_at = CURRENT_TIMESTAMP
    `, [r.id, category, r.name, r.description, r.parentId, r.notificationEmail, r.iconClass, r.statusId]);

    res.json({ success: true, message: 'Registro maestro guardado correctamente' });
  } catch (err: any) {
    console.error(`[M7-MASTERS] Error saving to ${category}:`, err);
    res.status(500).json({ error: "Error al guardar registro maestro" });
  }
};
