'use client';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/** fetch con envoltura estandar. Si la sesion expiro, manda al login. */
export async function api<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth')) {
      window.location.href = '/login';
    }
    const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!body) return { success: false, data: null, error: `Respuesta invalida (${res.status})` };
    return body;
  } catch {
    return { success: false, data: null, error: 'Error de conexion con el servidor' };
  }
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

/** Convierte una fecha a "YYYY-MM-DDTHH:mm" para <input type="datetime-local">. */
export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
