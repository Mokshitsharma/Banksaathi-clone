import crypto from 'node:crypto';
import { env } from '../config/env';

const key = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');

/** AES-256-GCM. Output format: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmac(value: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Keeps the last `visible` characters: ABCDE1234F -> XXXXXX234F */
export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return value;
  return 'X'.repeat(value.length - visible) + value.slice(-visible);
}

export function randomOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function randomCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}
