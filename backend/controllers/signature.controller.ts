
import { Request, Response } from 'express';
import pool from '../config/database.js';
import crypto from 'crypto';

// Utilidad simple para hashear clave (SHA-256)
const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

export const createSignature = async (req: Request, res: Response) => {
  const { documentNumber, digitalSignature, password, policyAccepted } = req.body;

  if (!documentNumber || !digitalSignature || !password) {
    return res.status(400).json({ error: "Faltan datos requeridos para la firma." });
  }

  if (!policyAccepted) {
    return res.status(400).json({ error: "Debe aceptar la política de firma digital." });
  }

  const encryptedPassword = hashPassword(password);

  try {
    const result = await pool.query(`
      INSERT INTO digital_signatures (document_number, digital_signature, encrypted_password, policy_accepted)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (document_number) DO UPDATE SET
      digital_signature = EXCLUDED.digital_signature,
      encrypted_password = EXCLUDED.encrypted_password,
      policy_accepted = EXCLUDED.policy_accepted,
      updated_at = NOW()
      RETURNING *
    `, [documentNumber, digitalSignature, encryptedPassword, policyAccepted]);

    res.json({ success: true, message: "Firma Digital Creada/Actualizada", signature: result.rows[0] });
  } catch (err: any) {
    console.error('[SIGNATURE-CREATE]', err.message);
    res.status(500).json({ error: "Error al guardar firma digital." });
  }
};

export const validateSignature = async (req: Request, res: Response) => {
    const { documentNumber, password } = req.body;

    try {
        const result = await pool.query('SELECT encrypted_password, digital_signature FROM digital_signatures WHERE document_number = $1', [documentNumber]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Usuario sin firma digital registrada." });
        }

        const storedHash = result.rows[0].encrypted_password;
        const inputHash = hashPassword(password);

        if (storedHash === inputHash) {
            res.json({ success: true, valid: true, signature: result.rows[0].digital_signature });
        } else {
            res.status(401).json({ success: false, valid: false, error: "Clave de firma incorrecta." });
        }

    } catch (err: any) {
        res.status(500).json({ error: "Error de validación" });
    }
};

export const getSignature = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT digital_signature, updated_at, approved FROM digital_signatures WHERE document_number = $1', [id]);
        if(result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({error: "No encontrada"});
        }
    } catch (err) {
        res.status(500).json({error: "Error servidor"});
    }
}
