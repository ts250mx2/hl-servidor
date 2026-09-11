import { randomUUID } from 'crypto';

/** Agente con los datos de la llave a la que apunta (sin la llave cifrada). */
export interface AgenteRow {
  IdAgente: number;
  Uuid: string;
  Agente: string;
  IdLlave: number;
  Status: number;
  FechaAlta: Date;
  FechaModificacion: Date;
  Llave: string;
  Proveedor: string;
  Modelo: string;
  LlaveStatus: number;
  FechaCaducidad: Date | null;
}

export const AGENTES_LIST_SQL = `
  SELECT a.IdAgente, a.Uuid, a.Agente, a.IdLlave, a.Status, a.FechaAlta, a.FechaModificacion,
         l.Llave, l.Proveedor, l.Modelo, l.Status AS LlaveStatus, l.FechaCaducidad
  FROM tblAgentes a
  INNER JOIN tblLlaves l ON l.IdLlave = a.IdLlave`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificador publico del agente. Se genera una vez al crearlo y no cambia. */
export function generateAgenteUuid(): string {
  return randomUUID();
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
