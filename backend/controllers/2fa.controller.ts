
import { Request, Response } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import pool from '../config/database.js';

export const twoFactorController = {
  /**
   * Genera un nuevo secreto y un código QR para el setup inicial
   */
  async generateSetup(req: Request, res: Response) {
    const { userId } = req.body;
    
    try {
      const secret = speakeasy.generateSecret({
        name: `Milla Siete (${userId})`
      });

      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

      res.json({
        success: true,
        secret: secret.base32,
        qrCode: qrCodeUrl
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Activa el 2FA verificando el primer código
   */
  async activate(req: Request, res: Response) {
    const { userId, secret, token } = req.body;

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token
    });

    if (verified) {
      try {
        await pool.query(
          'UPDATE users SET two_factor_enabled = true, two_factor_secret = $1 WHERE id = $2',
          [secret, userId]
        );
        res.json({ success: true, message: '2FA Activado Correctamente' });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    } else {
      res.status(400).json({ success: false, error: 'Código de verificación inválido' });
    }
  },

  /**
   * Verifica un token durante el flujo de Login
   */
  async verifyToken(req: Request, res: Response) {
    const { userId, token } = req.body;

    try {
      const result = await pool.query(
        'SELECT two_factor_secret, name, email, role_id FROM users WHERE id = $1',
        [userId]
      );

      const user = result.rows[0];

      if (!user || !user.two_factor_secret) {
        return res.status(400).json({ success: false, error: 'Configuración de 2FA no encontrada' });
      }

      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: token
      });

      if (verified) {
        res.json({
          success: true,
          user: { 
            id: userId, 
            email: user.email, 
            name: user.name, 
            role_id: user.role_id 
          }
        });
      } else {
        res.status(401).json({ success: false, error: 'Código 2FA incorrecto' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Desactiva el 2FA (Requiere permisos de Admin o el token actual)
   */
  async deactivate(req: Request, res: Response) {
    const { userId } = req.body;
    try {
      await pool.query(
        'UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1',
        [userId]
      );
      res.json({ success: true, message: '2FA Desactivado' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};
