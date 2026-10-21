// Clave secreta compartida para cifrado de queries administrativas (Soporte SuperAdmin)
const SQL_SECRET = 'M7_SQL_SECRET_SUPERADMIN_2026_KEY_PROD';

/**
 * Deriva una clave AES-GCM usando SHA-256 sobre el secreto compartido
 */
async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = enc.encode(SQL_SECRET);
  const hash = await window.crypto.subtle.digest('SHA-256', keyMaterial);
  return window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra una sentencia SQL usando AES-256-GCM para envío seguro en tránsito
 * Formato resultante en Base64:
 * - 12 bytes IV (Vector de Inicialización)
 * - 16 bytes Auth Tag (Autenticación GCM)
 * - Resto: Ciphertext
 */
export async function encryptSqlPayload(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const data = enc.encode(plaintext);

  // Web Crypto AES-GCM concatena el ciphertext y el tag de 16 bytes al final
  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const encryptedArr = new Uint8Array(encryptedBuf);
  const tag = encryptedArr.slice(encryptedArr.length - 16);
  const ciphertext = encryptedArr.slice(0, encryptedArr.length - 16);

  // Combinar IV (12) + Tag (16) + Ciphertext
  const combined = new Uint8Array(12 + 16 + ciphertext.length);
  combined.set(iv, 0);
  combined.set(tag, 12);
  combined.set(ciphertext, 28);

  // Convertir a Base64
  let binary = '';
  const len = combined.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return window.btoa(binary);
}
