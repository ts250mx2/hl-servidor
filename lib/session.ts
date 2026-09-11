import { createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { serialize } from 'cookie';
import { safeEqual } from './crypto';

export const SESSION_COOKIE = 'hl_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 semana
const MIN_SECRET_LENGTH = 32;

export interface SessionUser {
  IdUsuario: number;
  Usuario: string;
  Login: string;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('SESSION_SECRET no configurado o demasiado corto (minimo 32 caracteres)');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionCookie(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  return serialize(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: false, // permitir HTTP: el portal se usa por IP local sin SSL
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export function clearSessionCookie(): string {
  return serialize(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    expires: new Date(0),
    path: '/',
  });
}

export function parseSession(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser;
  } catch {
    return null;
  }
}

/** Devuelve el usuario de la sesion actual o null si la cookie falta o fue alterada. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return parseSession(store.get(SESSION_COOKIE)?.value);
}
