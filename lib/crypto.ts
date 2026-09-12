import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_PREFIX = 'hl_';
const KEY_RANDOM_BYTES = 24;
const KEY_PREFIX_VISIBLE = 10;
const SHARED_SECRET_BYTES = 32;
const SHARED_SECRET_RE = /^[0-9a-fA-F]{64}$/;

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('MASTER_KEY invalida: debe ser 64 caracteres hexadecimales (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/** Cifra texto plano con una llave de 32 bytes. Devuelve "iv.tag.cifrado" en base64. */
export function encryptWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString('base64')).join('.');
}

/** Descifra el formato producido por encryptWithKey. */
export function decryptWithKey(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Formato de llave cifrada invalido');
  const [iv, tag, encrypted] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** Cifra con la MASTER_KEY del servidor (llaves de API y secretos en reposo). */
export function encryptSecret(plain: string): string {
  return encryptWithKey(plain, getMasterKey());
}

/** Descifra lo cifrado con encryptSecret. */
export function decryptSecret(payload: string): string {
  return decryptWithKey(payload, getMasterKey());
}

/**
 * Secreto compartido de una aplicacion: con el se cifra la llave de API en la respuesta
 * del webservice y la app lo usa para descifrarla. Nunca viaja en la peticion.
 */
export function generateSharedSecret(): string {
  return randomBytes(SHARED_SECRET_BYTES).toString('hex');
}

export function isSharedSecret(value: string): boolean {
  return SHARED_SECRET_RE.test(value);
}

/** Genera una Key nueva para una aplicacion cliente. Se muestra una sola vez. */
export function generateAccessKey(): string {
  return KEY_PREFIX + randomBytes(KEY_RANDOM_BYTES).toString('hex');
}

export function hashAccessKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function keyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX_VISIBLE);
}

/** Enmascara una llave de API para mostrarla en el portal. */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return '********';
  return `${plain.slice(0, 6)}********${plain.slice(-4)}`;
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
