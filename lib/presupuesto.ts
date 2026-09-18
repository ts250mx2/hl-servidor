/**
 * Presupuesto diario por key (aplicacion) y por agente: gasto maximo en USD y tope de
 * llamadas por dia. NULL = sin tope. Lo hace valer `autenticarWs` (429 PRESUPUESTO).
 */

export interface Presupuesto {
  PresupuestoDiarioUsd: number | null;
  MaxLlamadasDia: number | null;
}

const MAX_USD = 1_000_000;
const MAX_LLAMADAS = 100_000_000;

/** Vacio, null o 0 = sin tope; undefined si no es un numero valido. */
function leerTope(raw: unknown, maximo: number, entero: boolean): number | null | undefined {
  if (raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > maximo) return undefined;
  if (entero && !Number.isInteger(n)) return undefined;
  return entero ? n : Math.round(n * 100) / 100;
}

/** Lee ambos topes del cuerpo de la peticion; undefined si alguno es invalido. */
export function leerPresupuesto(body: { PresupuestoDiarioUsd?: unknown; MaxLlamadasDia?: unknown }): Presupuesto | undefined {
  const usd = leerTope(body.PresupuestoDiarioUsd, MAX_USD, false);
  const llamadas = leerTope(body.MaxLlamadasDia, MAX_LLAMADAS, true);
  if (usd === undefined || llamadas === undefined) return undefined;
  return { PresupuestoDiarioUsd: usd, MaxLlamadasDia: llamadas };
}

/** Los DECIMAL de MySQL llegan como texto: se normalizan a numero o null. */
export function normalizarPresupuesto(p: { PresupuestoDiarioUsd?: unknown; MaxLlamadasDia?: unknown }): Presupuesto {
  const usd = p.PresupuestoDiarioUsd === null || p.PresupuestoDiarioUsd === undefined ? null : Number(p.PresupuestoDiarioUsd);
  const llamadas = p.MaxLlamadasDia === null || p.MaxLlamadasDia === undefined ? null : Number(p.MaxLlamadasDia);
  return { PresupuestoDiarioUsd: Number.isFinite(usd as number) ? usd : null, MaxLlamadasDia: Number.isFinite(llamadas as number) ? llamadas : null };
}

/** Texto corto para tablas y auditoria: "$2.00/día · 500 llamadas/día" o "sin tope". */
export function textoPresupuesto(p: Presupuesto): string {
  const partes = [
    p.PresupuestoDiarioUsd !== null ? `$${p.PresupuestoDiarioUsd.toFixed(2)}/día` : null,
    p.MaxLlamadasDia !== null ? `${p.MaxLlamadasDia} llamadas/día` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'sin tope';
}
