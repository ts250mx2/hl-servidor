import pool from '@/lib/db';
import { parseId } from '@/lib/api';
import type { Instantanea } from '@/lib/auditoria';

/**
 * Llave de respaldo del cuerpo: null si no viene, undefined si es invalida
 * (igual a la principal). El proxy reintenta con ella cuando la principal falla.
 */
export function leerRespaldo(raw: unknown, idLlave: number): number | null | undefined {
  if (raw === null || raw === undefined || raw === '' || raw === 0 || raw === '0') return null;
  const id = parseId(String(raw));
  if (!id || id === idLlave) return undefined;
  return id;
}

/** Nombres de las llaves indicadas, para validarlas y para la auditoria. */
export async function nombresLlaves(ids: (number | null)[]): Promise<Map<number, string>> {
  const validos = ids.filter((id): id is number => typeof id === 'number');
  if (validos.length === 0) return new Map();
  const [rows] = await pool.query('SELECT IdLlave, Llave FROM tblLlaves WHERE IdLlave IN (?)', [validos]);
  return new Map((rows as { IdLlave: number; Llave: string }[]).map((r) => [r.IdLlave, r.Llave]));
}

/** Lo que se compara en la auditoria de un agente (sin UUID: nunca cambia). */
export interface AgenteAuditable {
  Agente: string;
  Llave: string;
  LlaveRespaldo: string | null;
  Status: number;
}

export function instantaneaAgente(a: AgenteAuditable): Instantanea {
  return { Agente: a.Agente, LlaveNombre: a.Llave, LlaveRespaldo: a.LlaveRespaldo, Status: a.Status };
}
