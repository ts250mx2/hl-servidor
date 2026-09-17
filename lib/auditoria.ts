import pool from './db';
import { getClientIp } from './ip';
import type { SessionUser } from './session';

/**
 * Auditoria del portal: quien cambio que y cuando. Complementa a tblBitacora,
 * que solo registra las llamadas del webservice. Nunca se guardan secretos:
 * quien llama pasa objetos ya limpios (sin llaves, hashes ni contrasenas).
 */

export type AccionAuditoria = 'CREAR' | 'EDITAR' | 'ELIMINAR' | 'REGENERAR' | 'LOGIN' | 'LOGIN_FALLIDO';
export type EntidadAuditoria = 'llave' | 'agente' | 'key' | 'ip' | 'usuario' | 'sesion';

/** Valores comparables de un registro (fechas ya como texto, secretos ya sustituidos). */
export type Instantanea = Record<string, string | number | boolean | null | undefined>;

export interface Cambio {
  antes: string | number | boolean | null;
  despues: string | number | boolean | null;
}

interface RegistroAuditoria {
  user: SessionUser | null;
  request: Request;
  accion: AccionAuditoria;
  entidad: EntidadAuditoria;
  idEntidad?: number | null;
  nombre: string;
  /** Estado previo y nuevo; se guardan solo los campos que cambiaron. */
  antes?: Instantanea | null;
  despues?: Instantanea | null;
  /** Nota libre ("contrasena cambiada", "llave de API reemplazada"). */
  detalle?: string | null;
}

const MAX_NOMBRE = 100;
const MAX_DETALLE = 200;

const normalizarValor = (v: unknown): string | number | boolean | null => {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
};

/** Diferencia campo por campo. Con solo "despues" (alta) o solo "antes" (baja) regresa todo. */
export function diferencias(antes?: Instantanea | null, despues?: Instantanea | null): Record<string, Cambio> {
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  const out: Record<string, Cambio> = {};
  for (const campo of campos) {
    const a = normalizarValor(antes?.[campo]);
    const d = normalizarValor(despues?.[campo]);
    if (antes && despues && a === d) continue;
    out[campo] = { antes: a, despues: d };
  }
  return out;
}

/** Guarda el registro. Nunca sube: si la auditoria falla, la operacion del portal ya se hizo y no debe deshacerse. */
export async function registrarAuditoria(r: RegistroAuditoria): Promise<void> {
  try {
    const cambios = diferencias(r.antes, r.despues);
    await pool.query(
      `INSERT INTO tblAuditoria (IdUsuario, Usuario, IP, Accion, Entidad, IdEntidad, Nombre, Cambios, Detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.user?.IdUsuario ?? null,
        (r.user?.Usuario ?? r.user?.Login ?? 'desconocido').slice(0, 80),
        getClientIp(r.request).slice(0, 45),
        r.accion,
        r.entidad,
        r.idEntidad ?? null,
        r.nombre.slice(0, MAX_NOMBRE),
        Object.keys(cambios).length ? JSON.stringify(cambios) : null,
        r.detalle ? r.detalle.slice(0, MAX_DETALLE) : null,
      ]
    );
  } catch (error) {
    console.error('No se pudo escribir en tblAuditoria:', error);
  }
}

/** Fecha a texto corto para comparar y mostrar (null se conserva). */
export const fechaTexto = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : null;
