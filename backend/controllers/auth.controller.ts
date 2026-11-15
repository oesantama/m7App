import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signAccessToken } from '../utils/jwt.util.js';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const identifier = email?.trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, email, password, name, role_id, client_ids, document_number, status_id, two_factor_enabled, two_factor_secret, permissions as user_level_permissions
       FROM users
       WHERE (LOWER(TRIM(email)) = $1 OR LOWER(TRIM(document_number)) = $1 OR LOWER(TRIM(phone)) = $1)`,
      [identifier]
    );

    const user = result.rows[0];

    if (!user) {
        return res.status(401).json({ success: false, error: 'Usuario no registrado o identificador incorrecto' });
    }

    const statusUpper = String(user.status_id || '').trim().toUpperCase();
    if (statusUpper === 'EST-02' || statusUpper === 'INACTIVO' || statusUpper === 'DESACTIVADO' || (user.status_id && statusUpper !== 'EST-01' && statusUpper !== 'ACTIVO')) {
        return res.status(403).json({ success: false, error: 'Usuario inactivo. No tiene permitido iniciar sesión. Contacte al administrador.' });
    }

    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // FETCH PERMISSIONS
    const permResult = await pool.query('SELECT permissions FROM user_permissions WHERE user_id = $1', [user.id]);
    let permissions: any[] = user.user_level_permissions || [];
    
    if (permResult.rows.length > 0) {
        const rawPerms = permResult.rows[0].permissions || {};
        const permMap = new Map<string, Set<string>>();

        Object.keys(rawPerms).forEach(key => {
            if (rawPerms[key] === true) {
                const parts = key.toLowerCase().split('_');
                if (parts.length >= 3 && parts[0] === 'page') {
                     const action = parts.pop();
                     const pageId = parts.slice(1).join('_').toUpperCase();
                     
                     if (pageId && action) {
                         if (!permMap.has(pageId)) permMap.set(pageId, new Set());
                         permMap.get(pageId)?.add(action);
                     }
                }
            }
        });

        const granularPerms = Array.from(permMap.entries()).map(([module, actions]) => ({
            module,
            actions: Array.from(actions)
        }));

        // Combinar permisos si existen ambos
        permissions = [...permissions, ...granularPerms];
    }

    if (String(user.two_factor_enabled) === '1' || user.two_factor_enabled === true) {
        return res.json({ 
            success: true, 
            require2FA: true, 
            userId: user.id 
        });
    }

    // Compactar permisos para el JWT: solo module + actions
    const compactPerms = permissions.map((p: any) => ({
        module: p.module,
        actions: Array.isArray(p.actions) ? p.actions : []
    }));

    const tokenPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role_id: user.role_id,
        document_number: user.document_number || '',
        client_ids: user.client_ids || [],
        permissions: compactPerms,
    };

    const accessToken = signAccessToken(tokenPayload);

    // La respuesta al cliente incluye permissions para hidratar el store
    const userData = { ...tokenPayload, permissions };

    // Cookie segura HttpOnly para mitigar robo de tokens vía XSS en navegador
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', `m7_session=${accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${isProd ? '; Secure' : ''}`);

    res.json({
        success: true,
        token: accessToken,
        user: userData
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `m7_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`);
  res.json({ success: true, message: 'Sesión finalizada' });
};

export const validateSession = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Sesión no válida o usuario inactivo.' });
  }
  res.json({ success: true, user });
};

export const renewToken = async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  if (!currentUser || (!currentUser.id && !currentUser.email)) {
    return res.status(401).json({ success: false, error: 'Sesión no válida para renovación.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, name, role_id, client_ids, document_number, status_id, permissions as user_level_permissions
       FROM users
       WHERE id = $1 OR LOWER(TRIM(email)) = LOWER($2) LIMIT 1`,
      [currentUser.id || '0', currentUser.email || '']
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado en base de datos.' });
    }

    const statusUpper = String(user.status_id || '').trim().toUpperCase();
    if (statusUpper === 'EST-02' || statusUpper === 'INACTIVO' || statusUpper === 'DESACTIVADO' || 
       (user.status_id && statusUpper !== 'EST-01' && statusUpper !== 'ACTIVO')) {
      return res.status(403).json({ success: false, error: 'Usuario inactivo. No es posible renovar sesión.' });
    }

    const permResult = await pool.query('SELECT permissions FROM user_permissions WHERE user_id = $1', [user.id]);
    let permissions: any[] = user.user_level_permissions || [];

    if (permResult.rows.length > 0) {
      const rawPerms = permResult.rows[0].permissions || {};
      const permMap = new Map<string, Set<string>>();

      Object.keys(rawPerms).forEach(key => {
        if (rawPerms[key] === true) {
          const parts = key.toLowerCase().split('_');
          if (parts.length >= 3 && parts[0] === 'page') {
            const action = parts.pop();
            const pageId = parts.slice(1).join('_').toUpperCase();
            if (pageId && action) {
              if (!permMap.has(pageId)) permMap.set(pageId, new Set());
              permMap.get(pageId)?.add(action);
            }
          }
        }
      });

      const granularPerms = Array.from(permMap.entries()).map(([module, actions]) => ({
        module,
        actions: Array.from(actions)
      }));

      permissions = [...permissions, ...granularPerms];
    } else if (currentUser.permissions) {
      permissions = currentUser.permissions;
    }

    const compactPerms = permissions.map((p: any) => ({
      module: p.module,
      actions: Array.isArray(p.actions) ? p.actions : []
    }));

    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role_id: user.role_id,
      document_number: user.document_number || '',
      client_ids: user.client_ids || [],
      permissions: compactPerms,
    };

    const newToken = signAccessToken(tokenPayload);

    res.json({
      success: true,
      token: newToken,
      user: { ...tokenPayload, permissions }
    });
  } catch (error: any) {
    console.error('[AUTH-RENEW-ERR]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};


import { sendEmail } from '../services/notification.service.js';

const RESET_TOKEN_MINUTES = 30;
const hashResetToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

// El enlace vuelve al mismo sitio desde donde se pidió (producción o pruebas) si es un dominio propio;
// si no, APP_URL; si no, producción.
const resetBaseUrl = (req: Request): string => {
  const origin = String(req.headers.origin || '');
  if (/^https:\/\/([a-z0-9-]+\.)*m7apps\.com$/i.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return (process.env.APP_URL || 'https://orbitm7.m7apps.com').replace(/\/$/, '');
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'El correo electrónico es requerido' });
  }

  try {
    const identifier = email.trim().toLowerCase();
    
    // 1. Buscar si el usuario existe
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE LOWER(TRIM(email)) = $1',
      [identifier]
    );

    const user = result.rows[0];
    
    if (!user) {
      // Por seguridad, M7 Security recomienda no revelar si el correo existe o no, 
      // pero Oscar solicitó explícitamente validar la base de datos para la UX actual.
      return res.status(404).json({ 
        success: false, 
        error: "ORBIT SECURITY: El correo ingresado no se encuentra en nuestra base de datos." 
      });
    }

    // 2. Token de un solo uso (30 min). En BD solo queda su SHA-256.
    const rawToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
       VALUES ($1, $2, NOW() + INTERVAL '${RESET_TOKEN_MINUTES} minutes', $3)`,
      [user.id, hashResetToken(rawToken), String(req.ip || '').slice(0, 100)]
    );
    const recoveryLink = `${resetBaseUrl(req)}/?reset=${rawToken}`;
    
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #0f172a; margin: 0; font-weight: 900; letter-spacing: -0.05em; text-transform: uppercase;">ORBITM7</h1>
          <p style="color: #10b981; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3em; margin: 5px 0;">Logística Circular</p>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 30px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #1e293b; font-size: 20px; font-weight: 800; margin-bottom: 20px; text-transform: uppercase;">Recuperación de Acceso</h2>
          <p style="color: #475569; line-height: 1.6; margin-bottom: 30px;">
            Hola <strong>${user.name}</strong>, hemos recibido una solicitud para restablecer tu contraseña en la plataforma OrbitM7.
          </p>
          
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${recoveryLink}" style="background-color: #10b981; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; text-transform: uppercase; font-size: 14px; letter-spacing: 0.05em;">Restablecer Contraseña</a>
          </div>
          
          <p style="color: #64748b; font-size: 12px;">
            El enlace vence en ${RESET_TOKEN_MINUTES} minutos y solo se puede usar una vez.
            Si no solicitaste este cambio, puedes ignorar este correo con seguridad. Tu contraseña actual seguirá siendo válida.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em;">
          © ${new Date().getFullYear()} OrbitM7 Logistics Systems • Milla 7
        </div>
      </div>
    `;

    // sendEmail no devuelve nada si EMAIL_ENABLED != 'true' y lanza si fallan Resend y SMTP.
    const sent = await sendEmail(user.email, '🔐 Recuperación de Contraseña - OrbitM7', html)
      .catch((e: any) => { console.error('[AUTH-FORGOT-EMAIL]', e?.message); return null; });
    if (!sent?.success) {
      return res.status(503).json({
        success: false,
        error: 'No fue posible enviar el correo en este momento. Intente más tarde o contacte a soporte.'
      });
    }

    res.json({ 
      success: true, 
      message: 'Correo de recuperación enviado exitosamente' 
    });

  } catch (error: any) {
    console.error('[AUTH-FORGOT-ERR]', error.message);
    res.status(500).json({ success: false, error: 'Falla crítica al procesar la recuperación' });
  }
};


/** POST /api/auth/reset-password { token, password } — fija la contraseña nueva con un token vigente. */
export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ success: false, error: 'El enlace de recuperación no es válido.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres, con letras y números.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tk = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [hashResetToken(token)]
    );
    if (tk.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'El enlace venció o ya fue usado. Solicite uno nuevo desde "¿Olvidó su contraseña?".' });
    }
    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    await client.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, tk.rows[0].user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [tk.rows[0].user_id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Contraseña actualizada. Ya puede iniciar sesión.' });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[AUTH-RESET-ERR]', error.message);
    res.status(500).json({ success: false, error: 'No fue posible actualizar la contraseña.' });
  } finally {
    client.release();
  }
};
