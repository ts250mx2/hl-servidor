import pool from './db';

/**
 * Uso de cada llamada por el proxy: cuanto tardo y cuantos tokens consumio.
 * Los tokens se leen de la respuesta del proveedor (JSON o stream SSE) sin
 * alterarla; con la tabla de precios se convierten en gasto estimado.
 */

export interface UsoTokens {
  /** Tokens de entrada cobrados a precio completo (sin los de cache). */
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura: number;
}

export interface UsoLlamada {
  duracionMs: number;
  tokens: UsoTokens | null;
  costoUsd: number | null;
}

/** Cuerpo maximo que se retiene para buscar el uso; mas alla, se deja pasar sin leerlo. */
const MAX_CAPTURA_BYTES = 4 * 1024 * 1024;

type Json = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);

/**
 * Normaliza el bloque de uso de cada API a una sola forma:
 *   Anthropic   usage.input_tokens (sin cache) + cache_read_input_tokens + cache_creation_input_tokens + output_tokens
 *   OpenAI chat usage.prompt_tokens (incluye cache: prompt_tokens_details.cached_tokens) + completion_tokens
 *   OpenAI resp usage.input_tokens (incluye cache: input_tokens_details.cached_tokens) + output_tokens
 *   Gemini      usageMetadata.promptTokenCount (incluye cachedContentTokenCount) + candidatesTokenCount (+ thoughtsTokenCount)
 */
function normalizarUso(u: Json): UsoTokens | null {
  if ('promptTokenCount' in u || 'candidatesTokenCount' in u) {
    const cache = num(u.cachedContentTokenCount);
    return {
      entrada: Math.max(0, num(u.promptTokenCount) - cache),
      salida: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount),
      cacheLectura: cache,
      cacheEscritura: 0,
    };
  }
  if ('prompt_tokens' in u) {
    const cache = num(obj(u.prompt_tokens_details)?.cached_tokens);
    return { entrada: Math.max(0, num(u.prompt_tokens) - cache), salida: num(u.completion_tokens), cacheLectura: cache, cacheEscritura: 0 };
  }
  if ('input_tokens_details' in u) {
    const cache = num(obj(u.input_tokens_details)?.cached_tokens);
    return { entrada: Math.max(0, num(u.input_tokens) - cache), salida: num(u.output_tokens), cacheLectura: cache, cacheEscritura: 0 };
  }
  if ('input_tokens' in u || 'output_tokens' in u) {
    return {
      entrada: num(u.input_tokens),
      salida: num(u.output_tokens),
      cacheLectura: num(u.cache_read_input_tokens),
      cacheEscritura: num(u.cache_creation_input_tokens),
    };
  }
  return null;
}

/** Bloque de uso de un objeto de respuesta, este donde este segun el API. */
function usoDe(o: Json): Json | null {
  return obj(o.usage) ?? obj(obj(o.message)?.usage) ?? obj(obj(o.response)?.usage) ?? obj(o.usageMetadata);
}

/** Objetos JSON de un cuerpo: un JSON completo, un arreglo, o las lineas "data:" de un stream SSE. */
function objetosDe(cuerpo: string): Json[] {
  const texto = cuerpo.trim();
  if (!texto) return [];
  if (texto.startsWith('{') || texto.startsWith('[')) {
    try {
      const parsed = JSON.parse(texto) as unknown;
      if (Array.isArray(parsed)) return parsed.map(obj).filter((o): o is Json => o !== null);
      const o = obj(parsed);
      return o ? [o] : [];
    } catch {
      /* JSON incompleto o NDJSON: se intenta linea por linea */
    }
  }
  const out: Json[] = [];
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    const carga = l.startsWith('data:') ? l.slice(5).trim() : l;
    if (!carga.startsWith('{')) continue;
    try {
      const o = obj(JSON.parse(carga));
      if (o) out.push(o);
    } catch {
      /* linea partida o no JSON */
    }
  }
  return out;
}

/**
 * Tokens de una respuesta del proveedor. En streams el uso llega repartido (Anthropic manda la
 * entrada al inicio y la salida al final; OpenAI todo en el ultimo chunk): se toma el maximo por campo.
 */
export function extraerUso(cuerpo: string): UsoTokens | null {
  let total: UsoTokens | null = null;
  for (const o of objetosDe(cuerpo)) {
    const u = usoDe(o);
    const n = u ? normalizarUso(u) : null;
    if (!n) continue;
    total = total
      ? {
          entrada: Math.max(total.entrada, n.entrada),
          salida: Math.max(total.salida, n.salida),
          cacheLectura: Math.max(total.cacheLectura, n.cacheLectura),
          cacheEscritura: Math.max(total.cacheEscritura, n.cacheEscritura),
        }
      : n;
  }
  return total;
}

export interface FinRespuesta {
  duracionMs: number;
  cuerpo: string;
  /** true si el cuerpo supero MAX_CAPTURA_BYTES y no se retuvo completo. */
  truncado: boolean;
}

/**
 * Envuelve el cuerpo de la respuesta para medir cuanto tardo en llegar completo y retener
 * su texto (hasta un tope) sin retrasar ni alterar lo que recibe la app. `alTerminar` se
 * llama una sola vez: al acabar el stream o si la app corta la conexion.
 */
export function instrumentarRespuesta(respuesta: Response, inicioMs: number, alTerminar: (fin: FinRespuesta) => void): ReadableStream<Uint8Array> | null {
  if (!respuesta.body) {
    alTerminar({ duracionMs: Date.now() - inicioMs, cuerpo: '', truncado: false });
    return null;
  }
  const reader = respuesta.body.getReader();
  const decoder = new TextDecoder();
  const partes: string[] = [];
  let bytes = 0;
  let truncado = false;
  let terminado = false;

  const finalizar = () => {
    if (terminado) return;
    terminado = true;
    partes.push(decoder.decode());
    alTerminar({ duracionMs: Date.now() - inicioMs, cuerpo: partes.join(''), truncado });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finalizar();
          controller.close();
          return;
        }
        if (!truncado) {
          bytes += value.byteLength;
          if (bytes <= MAX_CAPTURA_BYTES) partes.push(decoder.decode(value, { stream: true }));
          else truncado = true;
        }
        controller.enqueue(value);
      } catch (error) {
        finalizar();
        controller.error(error);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => undefined);
      finalizar();
    },
  });
}

/** Completa la fila de la bitacora con duracion, tokens y costo. Nunca sube. */
export async function registrarUso(idBitacora: number, uso: UsoLlamada): Promise<void> {
  try {
    await pool.query(
      `UPDATE tblBitacora
       SET DuracionMs = ?, TokensEntrada = ?, TokensSalida = ?, TokensCacheLectura = ?, TokensCacheEscritura = ?, CostoUsd = ?
       WHERE IdBitacora = ?`,
      [
        uso.duracionMs,
        uso.tokens?.entrada ?? null,
        uso.tokens?.salida ?? null,
        uso.tokens?.cacheLectura ?? null,
        uso.tokens?.cacheEscritura ?? null,
        uso.costoUsd,
        idBitacora,
      ]
    );
  } catch (error) {
    console.error('No se pudo registrar el uso en tblBitacora:', error);
  }
}
