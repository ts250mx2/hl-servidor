/**
 * Cliente de HL Servidor para las aplicaciones consumidoras.
 *
 * Copia este archivo a tu proyecto (lib/hl-cliente.ts) y define en el entorno:
 *   HL_URL     = https://hl.tudominio.com        (sin barra final)
 *   HL_KEY     = hl_xxxxxxxx...                  (Key de acceso de esta app)
 *   HL_AGENTE  = a7385432-c888-426b-...          (UUID del agente)
 *   HL_TTL_MIN = 30                              (opcional, minutos de cache)
 *
 * Uso:
 *   import { obtenerLlave } from './lib/hl-cliente';
 *   const { proveedor, modelo, llave } = await obtenerLlave();
 *
 * Sin dependencias: usa fetch nativo (Node 18+).
 */

export interface LlaveIA {
  uuid: string;
  agente: string;
  proveedor: 'claude' | 'openai' | 'gemini' | 'otro' | string;
  modelo: string;
  llave: string;
  caducidad: string | null;
}

export interface HlClienteConfig {
  url: string;
  key: string;
  agente: string;
  /** Minutos que se conserva la respuesta en memoria. */
  ttlMinutos: number;
  /** Milisegundos maximos de espera por respuesta. */
  timeoutMs: number;
}

interface RespuestaWs {
  success: boolean;
  data: LlaveIA | null;
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
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerConfig(): HlClienteConfig {
  const url = (process.env.HL_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.HL_KEY || '').trim();
  const agente = (process.env.HL_AGENTE || '').trim();
  const ttl = Number(process.env.HL_TTL_MIN);

  if (!url) throw new HlClienteError('Falta HL_URL en el entorno');
  if (!KEY_FORMAT.test(key)) throw new HlClienteError('HL_KEY ausente o con formato invalido (hl_ + 48 hex)');
  if (!UUID_FORMAT.test(agente)) throw new HlClienteError('HL_AGENTE ausente o no es un UUID valido');

  return {
    url,
    key,
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
    return `${detalle}. HL Servidor sirve HTTP plano; si no esta detras de un proxy con certificado, usa http:// en HL_URL`;
  }
  return detalle;
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
    throw new HlClienteError(`No se pudo conectar con HL Servidor (${url}): ${describirErrorRed(error, config.url)}`);
  }

  let body: RespuestaWs;
  try {
    body = (await response.json()) as RespuestaWs;
  } catch {
    throw new HlClienteError(`HL Servidor respondio ${response.status} sin JSON valido`, response.status);
  }

  if (!response.ok || !body.success || !body.data) {
    throw new HlClienteError(body.error || `HL Servidor respondio ${response.status}`, response.status);
  }

  return body.data;
}

interface CacheEntry {
  valor: LlaveIA;
  expira: number;
}

let cache: CacheEntry | null = null;
let enCurso: Promise<LlaveIA> | null = null;

/**
 * Regresa proveedor, modelo y llave del agente configurado.
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
        console.error('HL Servidor: fallo el refresco, se reutiliza la llave en cache.', error);
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
