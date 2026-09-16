/**
 * Cliente de HL Console para las aplicaciones consumidoras.
 *
 * Copia este archivo a tu proyecto (lib/hl-cliente.ts) y define en el entorno:
 *   HL_URL     = http://127.0.0.1:3056            (sin barra final; HL Console sirve HTTP plano)
 *   HL_KEY     = hl_xxxxxxxx...                   (Key de acceso de esta app, viaja en el header)
 *   HL_SECRET  = 64 caracteres hex                (secreto compartido: descifra la llave, nunca viaja)
 *   HL_AGENTE  = a7385432-c888-426b-...           (UUID del agente)
 *   HL_TTL_MIN = 30                               (opcional, minutos de cache)
 *
 * Uso:
 *   import { obtenerLlave } from './lib/hl-cliente';
 *   const { proveedor, modelo, llave } = await obtenerLlave();
 *
 * Sin dependencias: usa fetch y crypto nativos de Node 18+.
 * Solo del lado servidor: nunca importarlo desde codigo que llegue al navegador.
 */

import { createDecipheriv } from 'node:crypto';

/** API (SDK) que habla el proveedor. Elige el SDK por esto y no por el nombre del proveedor. */
export type ApiIA = 'anthropic' | 'openai' | 'gemini';

export interface LlaveIA {
  uuid: string;
  agente: string;
  proveedor: 'claude' | 'openai' | 'gemini' | 'otro' | string;
  /** null si el proveedor no tiene proxy (modo "otro") o si HL es anterior a este campo. */
  api: ApiIA | null;
  modelo: string;
  /** Llave de API ya descifrada, lista para el SDK del proveedor. */
  llave: string;
  caducidad: string | null;
}

export interface HlClienteConfig {
  url: string;
  key: string;
  /** Secreto compartido en bytes; null si la app aun no tiene uno (llave en claro). */
  secreto: Buffer | null;
  agente: string;
  /** Minutos que se conserva la respuesta en memoria. */
  ttlMinutos: number;
  /** Milisegundos maximos de espera por respuesta. */
  timeoutMs: number;
}

interface RespuestaWs {
  success: boolean;
  data: {
    uuid: string;
    agente: string;
    proveedor: string;
    api?: ApiIA | null;
    modelo: string;
    llave: string | null;
    llaveCifrada: string | null;
    cifrado: 'aes-256-gcm' | null;
    caducidad: string | null;
  } | null;
  error: string | null;
}

export class HlClienteError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = 'HlClienteError';
  }
}

const DEFAULT_TTL_MINUTOS = 30;
const DEFAULT_TIMEOUT_MS = 10_000;
const MS_POR_MINUTO = 60_000;
const KEY_FORMAT = /^hl_[0-9a-f]{48}$/;
const SECRET_FORMAT = /^[0-9a-fA-F]{64}$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGORITMO = 'aes-256-gcm';

function leerConfig(): HlClienteConfig {
  const url = (process.env.HL_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.HL_KEY || '').trim();
  const secretoHex = (process.env.HL_SECRET || '').trim();
  const agente = (process.env.HL_AGENTE || '').trim();
  const ttl = Number(process.env.HL_TTL_MIN);

  if (!url) throw new HlClienteError('Falta HL_URL en el entorno');
  if (!KEY_FORMAT.test(key)) throw new HlClienteError('HL_KEY ausente o con formato invalido (hl_ + 48 hex)');
  if (secretoHex && !SECRET_FORMAT.test(secretoHex)) throw new HlClienteError('HL_SECRET con formato invalido (64 hex)');
  if (!UUID_FORMAT.test(agente)) throw new HlClienteError('HL_AGENTE ausente o no es un UUID valido');

  return {
    url,
    key,
    secreto: secretoHex ? Buffer.from(secretoHex, 'hex') : null,
    agente,
    ttlMinutos: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_MINUTOS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/** Node envuelve la causa real (ECONNREFUSED, TLS, DNS) en "fetch failed"; aqui se saca a la luz. */
function describirErrorRed(error: unknown, baseUrl: string): string {
  const causa = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const mensaje = error instanceof Error ? error.message : 'error de red';
  const detalle = causa ? `${mensaje} (${causa})` : mensaje;
  const pareceTls = /ssl|tls|wrong version|certificate|EPROTO/i.test(causa);
  if (baseUrl.startsWith('https://') && pareceTls) {
    return `${detalle}. HL Console sirve HTTP plano; si no esta detras de un proxy con certificado, usa http:// en HL_URL`;
  }
  return detalle;
}

/** Descifra "iv.tag.cifrado" (base64) producido por HL Console con AES-256-GCM. */
function descifrarLlave(payload: string, secreto: Buffer): string {
  const partes = payload.split('.');
  if (partes.length !== 3) throw new HlClienteError('La llave cifrada no tiene el formato esperado');
  const [iv, tag, cifrado] = partes.map((p) => Buffer.from(p, 'base64'));
  try {
    const decipher = createDecipheriv(ALGORITMO, secreto, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
  } catch {
    throw new HlClienteError('No se pudo descifrar la llave: HL_SECRET no corresponde a esta Key de acceso');
  }
}

function extraerLlave(data: NonNullable<RespuestaWs['data']>, config: HlClienteConfig): string {
  if (data.llaveCifrada) {
    if (!config.secreto) {
      throw new HlClienteError('HL Console regreso la llave cifrada pero falta HL_SECRET en el entorno');
    }
    return descifrarLlave(data.llaveCifrada, config.secreto);
  }
  if (data.llave) return data.llave;
  throw new HlClienteError('HL Console no regreso ninguna llave');
}

async function consultarWs(config: HlClienteConfig): Promise<LlaveIA> {
  const url = `${config.url}/api/ws/llave/${config.agente}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { 'X-HL-Key': config.key, Accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    throw new HlClienteError(`No se pudo conectar con HL Console (${url}): ${describirErrorRed(error, config.url)}`);
  }

  let body: RespuestaWs;
  try {
    body = (await response.json()) as RespuestaWs;
  } catch {
    throw new HlClienteError(`HL Console respondio ${response.status} sin JSON valido`, response.status);
  }

  if (!response.ok || !body.success || !body.data) {
    throw new HlClienteError(body.error || `HL Console respondio ${response.status}`, response.status);
  }

  const { uuid, agente, proveedor, modelo, caducidad } = body.data;
  const api = body.data.api === 'anthropic' || body.data.api === 'openai' || body.data.api === 'gemini' ? body.data.api : null;
  return { uuid, agente, proveedor, api, modelo, caducidad, llave: extraerLlave(body.data, config) };
}

interface CacheEntry {
  valor: LlaveIA;
  expira: number;
}

let cache: CacheEntry | null = null;
let enCurso: Promise<LlaveIA> | null = null;

/**
 * Regresa proveedor, modelo y llave (ya descifrada) del agente configurado.
 * Cachea en memoria durante HL_TTL_MIN minutos y evita peticiones simultaneas.
 * Si el refresco falla y hay un valor previo en cache, lo reutiliza para no tirar la app.
 */
export async function obtenerLlave(opciones: { forzar?: boolean } = {}): Promise<LlaveIA> {
  const ahora = Date.now();
  if (!opciones.forzar && cache && cache.expira > ahora) return cache.valor;
  if (enCurso) return enCurso;

  const config = leerConfig();
  enCurso = consultarWs(config)
    .then((valor) => {
      cache = { valor, expira: Date.now() + config.ttlMinutos * MS_POR_MINUTO };
      return valor;
    })
    .catch((error) => {
      if (cache) {
        console.error('HL Console: fallo el refresco, se reutiliza la llave en cache.', error);
        return cache.valor;
      }
      throw error;
    })
    .finally(() => {
      enCurso = null;
    });

  return enCurso;
}

/** Descarta la cache. Util despues de rotar la llave en el portal. */
export function limpiarCacheLlave(): void {
  cache = null;
}

/**
 * Configuracion para usar el proxy transparente con el SDK oficial del proveedor.
 * La app nunca recibe la llave: HL Console la inyecta y fija el modelo del agente.
 *
 *   const { baseURL, headers } = configProxy();
 *   new Anthropic({ baseURL, apiKey: 'hl', defaultHeaders: headers });
 *   new OpenAI({ baseURL: `${baseURL}/v1`, apiKey: 'hl', defaultHeaders: headers });
 */
export function configProxy(): { baseURL: string; headers: Record<string, string> } {
  const url = (process.env.HL_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.HL_KEY || '').trim();
  const agente = (process.env.HL_AGENTE || '').trim();
  if (!url) throw new HlClienteError('Falta HL_URL en el entorno');
  if (!KEY_FORMAT.test(key)) throw new HlClienteError('HL_KEY ausente o con formato invalido (hl_ + 48 hex)');
  if (!UUID_FORMAT.test(agente)) throw new HlClienteError('HL_AGENTE ausente o no es un UUID valido');
  return { baseURL: `${url}/api/ws/proxy/${agente}`, headers: { 'X-HL-Key': key } };
}
