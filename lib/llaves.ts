import { decryptSecret, maskSecret } from './crypto';

export interface LlaveRow {
  IdLlave: number;
  Llave: string;
  Proveedor: string;
  Modelo: string;
  LlaveEncriptada: string;
  FechaCaducidad: Date | null;
  Status: number;
  FechaAlta: Date;
  FechaModificacion: Date;
  TotalAgentes: number;
}

export const LLAVES_LIST_SQL = `
  SELECT l.IdLlave, l.Llave, l.Proveedor, l.Modelo, l.LlaveEncriptada, l.FechaCaducidad,
         l.Status, l.FechaAlta, l.FechaModificacion,
         (SELECT COUNT(*) FROM tblAgentes a WHERE a.IdLlave = l.IdLlave) AS TotalAgentes
  FROM tblLlaves l`;

/** Reemplaza la llave cifrada por una version enmascarada antes de mandarla al navegador. */
export function toPublicLlave(row: LlaveRow) {
  const { LlaveEncriptada, ...rest } = row;
  let LlaveMascara = '********';
  try {
    LlaveMascara = maskSecret(decryptSecret(LlaveEncriptada));
  } catch {
    LlaveMascara = 'No descifrable (MASTER_KEY cambio)';
  }
  return { ...rest, LlaveMascara };
}

export function isExpired(fechaCaducidad: Date | null): boolean {
  return fechaCaducidad !== null && fechaCaducidad.getTime() < Date.now();
}
