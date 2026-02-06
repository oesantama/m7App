
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { evolutionService } from './evolution.service.js';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('[M7-EMAIL] Envío desactivado en .env');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Milla Siete (M7)" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log('[M7-EMAIL] Mensaje enviado: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('[M7-EMAIL] Error:', error.message);
    throw error;
  }
};

export const sendWhatsApp = async (number: string, text: string, userId: string = 'USR-01') => {
  try {
    const result = await evolutionService.sendMessage(userId, number, text);
    return { success: true, result };
  } catch (error: any) {
    console.error('[M7-WHATSAPP] Error en notificación:', error.message);
    return { success: false, error: error.message };
  }
};
