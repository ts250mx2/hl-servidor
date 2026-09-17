import pool from './db';
import type { UsoTokens } from './uso';

/**
 * Precios por modelo (USD por millon de tokens) para estimar el gasto de cada llamada.
 * Se administran en el portal (tblPrecios). El modelo se guarda como prefijo con limite de guion:
 * "claude-sonnet-5" cubre "claude-sonnet-5" y "claude-sonnet-5-20260101", pero "gpt-5" NO cubre
 * "gpt-5.6-sol" (otra version: necesita su propio precio). Gana el prefijo mas largo que coincida.
 */

export interface Precio {
  IdPrecio: number;
  Proveedor: string;
  Modelo: string;
  Entrada: number;
  Salida: number;
  CacheLectura: number;
  CacheEscritura: number;
  Nota: string | null;
  FechaModificacion: Date | string;
}

const CACHE_MS = 60_000;
const POR_MILLON = 1_000_000;

let cache: { filas: Precio[]; expira: number } | null = null;

/** DECIMAL llega como texto desde MySQL. */
const aNumero = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

function normalizarFila(r: Precio): Precio {
  return { ...r, Entrada: aNumero(r.Entrada), Salida: aNumero(r.Salida), CacheLectura: aNumero(r.CacheLectura), CacheEscritura: aNumero(r.CacheEscritura) };
}

export async function listaPrecios(): Promise<Precio[]> {
  if (cache && cache.expira > Date.now()) return cache.filas;
  const [rows] = await pool.query('SELECT * FROM tblPrecios ORDER BY Proveedor, Modelo');
  const filas = (rows as Precio[]).map(normalizarFila);
  cache = { filas, expira: Date.now() + CACHE_MS };
  return filas;
}

/** El portal la llama al editar precios para que el proxy los use de inmediato. */
export function invalidarPrecios(): void {
  cache = null;
}

/** El prefijo coincide si es el modelo exacto o va seguido de un guion (sufijo de fecha o variante). */
export function prefijoCoincide(modelo: string, prefijo: string): boolean {
  const mod = modelo.trim().toLowerCase();
  const pre = prefijo.trim().toLowerCase();
  return mod === pre || mod.startsWith(`${pre}-`);
}

/** Precio aplicable a un modelo entre los dados: mismo proveedor y el prefijo mas largo; null si no hay. */
export function elegirPrecio(precios: Precio[], proveedor: string, modelo: string): Precio | null {
  const prov = proveedor.trim().toLowerCase();
  const candidatos = precios.filter((p) => p.Proveedor === prov && prefijoCoincide(modelo, p.Modelo));
  if (candidatos.length === 0) return null;
  return candidatos.reduce((mejor, p) => (p.Modelo.length > mejor.Modelo.length ? p : mejor));
}

export async function precioPara(proveedor: string, modelo: string): Promise<Precio | null> {
  return elegirPrecio(await listaPrecios(), proveedor, modelo);
}

interface FilaUso {
  IdBitacora: number;
  Proveedor: string | null;
  Modelo: string | null;
  TokensEntrada: number | null;
  TokensSalida: number | null;
  TokensCacheLectura: number | null;
  TokensCacheEscritura: number | null;
  CostoUsd: string | number | null;
}

/**
 * Vuelve a calcular el gasto de todas las llamadas con tokens usando los precios actuales.
 * Para despues de capturar o corregir precios. Regresa cuantas filas cambiaron y cuantas siguen sin precio.
 */
export async function recalcularCostos(): Promise<{ revisadas: number; actualizadas: number; sinPrecio: number }> {
  invalidarPrecios();
  const precios = await listaPrecios();
  const [rows] = await pool.query(
    `SELECT IdBitacora, Proveedor, Modelo, TokensEntrada, TokensSalida, TokensCacheLectura, TokensCacheEscritura, CostoUsd
     FROM tblBitacora WHERE TokensSalida IS NOT NULL`
  );
  let actualizadas = 0;
  let sinPrecio = 0;
  for (const r of rows as FilaUso[]) {
    const precio = r.Proveedor && r.Modelo ? elegirPrecio(precios, r.Proveedor, r.Modelo) : null;
    const nuevo = precio
      ? calcularCosto({ entrada: r.TokensEntrada ?? 0, salida: r.TokensSalida ?? 0, cacheLectura: r.TokensCacheLectura ?? 0, cacheEscritura: r.TokensCacheEscritura ?? 0 }, precio)
      : null;
    if (nuevo === null) sinPrecio++;
    const actual = r.CostoUsd === null ? null : Number(r.CostoUsd);
    if (actual === nuevo || (actual !== null && nuevo !== null && Math.abs(actual - nuevo) < 1e-6)) continue;
    await pool.query('UPDATE tblBitacora SET CostoUsd = ? WHERE IdBitacora = ?', [nuevo, r.IdBitacora]);
    actualizadas++;
  }
  return { revisadas: (rows as FilaUso[]).length, actualizadas, sinPrecio };
}

/** Gasto en USD de una llamada segun sus tokens y el precio del modelo. */
export function calcularCosto(tokens: UsoTokens, precio: Precio): number {
  const total =
    tokens.entrada * precio.Entrada +
    tokens.salida * precio.Salida +
    tokens.cacheLectura * precio.CacheLectura +
    tokens.cacheEscritura * precio.CacheEscritura;
  return Math.round((total / POR_MILLON) * 1_000_000) / 1_000_000;
}
