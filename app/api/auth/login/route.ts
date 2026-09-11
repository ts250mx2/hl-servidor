import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { createSessionCookie } from '@/lib/session';
import { cleanText, fail } from '@/lib/api';
import { getClientIp } from '@/lib/ip';
import { RATE_LIMIT_MINUTES, clearFailures, isRateLimited, registerFailure } from '@/lib/rate-limit';

interface UserRow {
  IdUsuario: number;
  Usuario: string;
  Login: string;
  Password: string;
}

/** Hash de relleno para que un login inexistente tarde lo mismo que una contrasena incorrecta. */
const DUMMY_HASH = bcrypt.hashSync('relleno-tiempo-constante', 10);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = cleanText(body.username, 45);
    const password = String(body.password ?? '');
    if (!username || !password) return fail('Usuario y contrasena son requeridos');

    const limitKey = `${getClientIp(request)}|${username.toLowerCase()}`;
    if (isRateLimited(limitKey)) {
      return fail(`Demasiados intentos. Espera ${RATE_LIMIT_MINUTES} minutos.`, 429);
    }

    const [rows] = await pool.query(
      'SELECT IdUsuario, Usuario, Login, Password FROM tblUsuarios WHERE Login = ? AND Status = 1 LIMIT 1',
      [username]
    );
    const user = (rows as UserRow[])[0];
    const valid = await bcrypt.compare(password, user?.Password ?? DUMMY_HASH);
    if (!user || !valid) {
      registerFailure(limitKey);
      return fail('Credenciales invalidas', 401);
    }

    clearFailures(limitKey);
    const sessionUser = { IdUsuario: user.IdUsuario, Usuario: user.Usuario, Login: user.Login };
    const response = NextResponse.json({ success: true, data: sessionUser, error: null });
    response.headers.set('Set-Cookie', createSessionCookie(sessionUser));
    return response;
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    return fail('Error interno del servidor', 500);
  }
}
