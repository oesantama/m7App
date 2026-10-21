import crypto from 'crypto';

// Clave secreta para cifrado de queries administrativas (Soporte SuperAdmin)
const SQL_SECRET = process.env.SQL_CIPHER_SECRET || 'M7_SQL_SECRET_SUPERADMIN_2026_KEY_PROD';
const RAW_KEY = crypto.createHash('sha256').update(SQL_SECRET).digest();

/**
 * Descifra un payload cifrado con AES-256-GCM desde el frontend
 * Estructura esperada (Base64):
 * - Primeros 12 bytes: IV (Vector de Inicialización)
 * - Siguientes 16 bytes: Auth Tag (GCM)
 * - Resto: Texto cifrado
 */
export const decryptSqlPayload = (base64Payload: string): string => {
  try {
    const data = Buffer.from(base64Payload, 'base64');
    if (data.length < 28) {
      throw new Error('Payload cifrado inválido: longitud insuficiente.');
    }

    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', RAW_KEY, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');

    return decrypted;
  } catch (err: any) {
    throw new Error(`Fallo al descifrar query administrativo: ${err.message}`);
  }
};

/**
 * Cifra una cadena con AES-256-GCM (para pruebas o respuestas protegidas)
 */
export const encryptSqlPayload = (plaintext: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', RAW_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
};
