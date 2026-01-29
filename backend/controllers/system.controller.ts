
import { Request, Response } from 'express';
import { restoreSystem } from '../services/migration.service.js';

export const handleRestoreSystem = async (req: Request, res: Response) => {
  try {
    const result = await restoreSystem();
    res.json(result);
  } catch (err: any) {
    console.error('[M7-SYSTEM] Error en restauración:', err);
    res.status(500).json({ error: err.message });
  }
};
