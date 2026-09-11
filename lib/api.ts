import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from './session';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data, error: null }, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, data: null, error: message }, { status });
}

/** Ejecuta un handler solo si hay sesion valida y firmada. */
export async function withAuth(
  handler: (user: SessionUser) => Promise<Response>
): Promise<Response> {
  const user = await getSession();
  if (!user) return fail('No autenticado', 401);
  try {
    return await handler(user);
  } catch (error) {
    console.error('API error:', error);
    return fail('Error interno del servidor', 500);
  }
}

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseStatus(value: unknown): number {
  return value === 0 || value === '0' || value === false ? 0 : 1;
}

/** Acepta "YYYY-MM-DDTHH:mm" o "YYYY-MM-DD". Regresa Date, null si viene vacio, undefined si es invalido. */
export function parseDateOrNull(value: unknown): Date | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function cleanText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}
