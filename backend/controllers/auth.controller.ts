
import { Request, Response } from 'express';
import pool from '../config/database.js';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  // Validación de credenciales (demo - en producción usar hash)
  const validUsers = [
    { email: 'admin@millasiete.com', password: 'admin123', id: 'USR-01', name: 'ADMINISTRADOR PRINCIPAL', role_id: 'ROL-01' },
    { email: 'operaciones@millasiete.com', password: 'operaciones', id: 'U-002', name: 'OPERADOR LOGÍSTICO', role_id: 'ROL-03' },
    { email: 'calidad@millasiete.com', password: 'calidad', id: 'U-003', name: 'AUDITOR CALIDAD', role_id: 'ROL-04' }
  ];
  
  const user = validUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  
  console.log(`[M7-AUTH] Intento de login: ${email} - Encontrado: ${!!user}`);
  
  if (user) {
    console.log(`[M7-AUTH] Login exitoso para: ${email}`);
    res.json({ 
        success: true, 
        user: { id: user.id, email: user.email, name: user.name, role_id: user.role_id } 
    });
  } else {
    console.log(`[M7-AUTH] Login fallido para: ${email} - Contraseña incorrecta o usuario no existe`);
    res.status(401).json({ success: false, error: 'Credenciales inválidas' });
  }
};

export const logout = (req: Request, res: Response) => {
  res.json({ success: true, message: 'Sesión finalizada' });
};
