import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import { evolutionService } from './evolution.service.js';

dotenv.config();

// Inicializamos Resend si la API Key existe
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Configuración de Nodemailer (Fallback)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendEmail = async (to: string | string[], subject: string, html: string, attachments?: any[]) => {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log('[M7-EMAIL] Envío desactivado en .env');
    return;
  }

  const toList = Array.isArray(to) ? to : [to];

  // 1. Intentar enviar vía Resend (API)
  if (resend) {
    try {
      const fromEmail = process.env.EMAIL_FROM || `M7 Apps <onboarding@resend.dev>`;
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: toList,
        subject,
        html,
        attachments: attachments?.map(a => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      });

      if (error) throw error;
      console.log('[M7-EMAIL] Enviado vía Resend API:', data?.id);
      return { success: true, messageId: data?.id };
    } catch (error: any) {
      console.warn('[M7-EMAIL] Falló Resend, intentando fallback SMTP...', error.message);
    }
  }

  // 2. Fallback a Nodemailer (SMTP)
  try {
    const info = await transporter.sendMail({
      from: `"Milla Siete (M7)" <${process.env.EMAIL_USER}>`,
      to: toList.join(', '),
      subject,
      html,
      attachments: attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    console.log('[M7-EMAIL] Enviado vía SMTP: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('[M7-EMAIL] Error crítico en envío:', error.message);
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
