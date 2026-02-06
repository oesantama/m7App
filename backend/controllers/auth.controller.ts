
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query(
      'SELECT id, email, password, name, role_id, two_factor_enabled, two_factor_secret FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (user && user.password === password) { // En prod usar bcrypt.compare
      console.log(`[M7-AUTH] Credenciales válidas para: ${email}`);

      if (user.two_factor_enabled) {
        return res.json({ 
          success: true, 
          require2FA: true, 
          userId: user.id 
        });
      }

      res.json({ 
          success: true, 
          user: { id: user.id, email: user.email, name: user.name, role_id: user.role_id } 
      });
    } else {
      console.log(`[M7-AUTH] Login fallido para: ${email}`);
      res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = (req: Request, res: Response) => {
  res.json({ success: true, message: 'Sesión finalizada' });
};
