import { Request, Response } from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcrypt';
import { signAccessToken } from '../utils/jwt.util.js';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  console.log(`[LOGIN-DEBUG] Solicitud de login recibida para el identificador: ${email}`);
  
  try {
    const identifier = email?.trim().toLowerCase();
    console.log(`[LOGIN-DEBUG] Ejecutando consulta de usuario en BD...`);
    
    const result = await pool.query(
      `SELECT id, email, password, name, role_id, client_ids, two_factor_enabled, two_factor_secret 
       FROM users 
       WHERE (LOWER(TRIM(email)) = $1 OR LOWER(TRIM(document_number)) = $1 OR LOWER(TRIM(phone)) = $1)`,
      [identifier]
    );

    console.log(`[LOGIN-DEBUG] Resultado de consulta: ${result.rows.length} usuarios encontrados.`);
    const user = result.rows[0];
    
    if (!user) {
        console.log(`[LOGIN-DEBUG] Rechazado: Usuario no encontrado.`);
        return res.status(401).json({ success: false, error: 'Usuario no registrado o identificador incorrecto' });
    }

    console.log(`[LOGIN-DEBUG] Verificando contraseña con bcrypt...`);
    const match = await bcrypt.compare(password, user.password);
    console.log(`[LOGIN-DEBUG] Resultado de bcrypt: ${match}`);
    
    if (!match) {
        return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // FETCH PERMISSIONS
    const permResult = await pool.query('SELECT permissions FROM user_permissions WHERE user_id = $1', [user.id]);
    let permissions: any[] = [];
    
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

        permissions = Array.from(permMap.entries()).map(([module, actions]) => ({
            module,
            actions: Array.from(actions)
        }));
    }

    if (user.two_factor_enabled) {
        return res.json({ 
            success: true, 
            require2FA: true, 
            userId: user.id 
        });
    }

    // GENERAR TOKEN JWT (Seguridad Arquitectónica)
    const userData = { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role_id: user.role_id,
        client_ids: user.client_ids || [], // NUEVO: Incluir clientes permitidos
        permissions: permissions 
    };

    const accessToken = signAccessToken(userData);

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
  res.json({ success: true, message: 'Sesión finalizada' });
};

import { sendEmail } from '../services/notification.service.js';

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

    // 2. Lógica de Envío de Email
    const recoveryLink = `https://orbitm7.m7apps.com/#/portal?recover=true&token=PENDING`; // Enlace base para portal
    
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
            Si no solicitaste este cambio, puedes ignorar este correo con seguridad. Tu contraseña actual seguirá siendo válida.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em;">
          © ${new Date().getFullYear()} OrbitM7 Logistics Systems • Milla 7
        </div>
      </div>
    `;

    await sendEmail(user.email, '🔐 Recuperación de Contraseña - OrbitM7', html);

    res.json({ 
      success: true, 
      message: 'Correo de recuperación enviado exitosamente' 
    });

  } catch (error: any) {
    console.error('[AUTH-FORGOT-ERR]', error.message);
    res.status(500).json({ success: false, error: 'Falla crítica al procesar la recuperación' });
  }
};
