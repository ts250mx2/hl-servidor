import pool from '@/lib/db';
import { parseId } from '@/lib/api';

export interface AgenteDeKey {
  IdAgente: number;
  Agente: string;
}

/** Agentes permitidos de cada key: sin entradas = sin restriccion (puede usar todos). */
export async function agentesPorKey(): Promise<Map<number, AgenteDeKey[]>> {
  const [rows] = await pool.query(
    'SELECT ka.IdKey, a.IdAgente, a.Agente FROM tblKeyAgentes ka INNER JOIN tblAgentes a ON a.IdAgente = ka.IdAgente ORDER BY a.Agente'
  );
  const out = new Map<number, AgenteDeKey[]>();
  for (const r of rows as { IdKey: number; IdAgente: number; Agente: string }[]) {
    out.set(r.IdKey, [...(out.get(r.IdKey) ?? []), { IdAgente: r.IdAgente, Agente: r.Agente }]);
  }
  return out;
}

/** Ids de agentes del cuerpo (arreglo de enteros); undefined si viene algo que no es lista. */
export function leerAgentes(raw: unknown): number[] | undefined {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.map((v) => parseId(String(v))).filter((v): v is number => v !== null);
  return [...new Set(ids)];
}

/** Nombres de los agentes indicados; los ids que no existen no aparecen. */
export async function nombresAgentes(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const [rows] = await pool.query('SELECT IdAgente, Agente FROM tblAgentes WHERE IdAgente IN (?)', [ids]);
  return new Map((rows as { IdAgente: number; Agente: string }[]).map((r) => [r.IdAgente, r.Agente]));
}

/** Reemplaza la lista de agentes permitidos de la key. Lista vacia = sin restriccion. */
export async function guardarAgentesDeKey(idKey: number, ids: number[]): Promise<void> {
  await pool.query('DELETE FROM tblKeyAgentes WHERE IdKey = ?', [idKey]);
  if (ids.length) await pool.query('INSERT INTO tblKeyAgentes (IdKey, IdAgente) VALUES ?', [ids.map((id) => [idKey, id])]);
}

/** Texto para la auditoria: "Todos" o los nombres. */
export const textoAgentes = (nombres: string[]): string => (nombres.length ? nombres.join(', ') : 'Todos (sin restriccion)');
