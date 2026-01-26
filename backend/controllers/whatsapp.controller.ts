
import { Request, Response } from 'express';
import { getBotStatus } from '../services/whatsapp.service.js';

export const getStatus = (req: Request, res: Response) => {
  try {
    const status = getBotStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: "No se pudo obtener el estado del bot" });
  }
};
