/** Utilidades de busqueda incremental para las listas del portal. */

/** Minusculas y sin acentos, para que "Vidaurri" y "vidáurri" coincidan. */
export const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Coincide si TODAS las palabras de la consulta aparecen en alguno de los campos.
 * Campos nulos o vacios se ignoran. Con consulta vacia todo coincide.
 */
export function coincideTexto(consulta: string, campos: (string | null | undefined)[]): boolean {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const pajar = normalizar(campos.filter((c): c is string => typeof c === 'string' && c !== '').join(' '));
  return palabras.every((palabra) => pajar.includes(palabra));
}
