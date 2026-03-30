
import { Request, Response } from 'express';
import { sendEmail, sendWhatsApp } from '../services/notification.service.js';

export const notifyTest = async (req: Request, res: Response) => {
  const { to, subject, message } = req.body;
  try {
    await sendEmail(to, subject, `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2 style="color: #10b981; text-transform: uppercase;">Notificación Milla Siete</h2>
        <hr style="border: 1px solid #f1f5f9;" />
        <p>${message}</p>
        <p style="font-size: 10px; color: #94a3b8; margin-top: 30px;">Este es un mensaje automático del Procesador M7.</p>
      </div>
    `);
    res.json({ success: true, message: 'Email enviado correctamente' });
  } catch (err: any) {
    res.status(500).json({ error: "Falla al enviar notificación" });
  }
};

export const notifyWhatsAppTest = async (req: Request, res: Response) => {
  const { number, message } = req.body;
  try {
    const result = await sendWhatsApp(number, message);
    if (result.success) {
      res.json({ success: true, details: result.result });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Falla al procesar envío de WhatsApp" });
  }
};
