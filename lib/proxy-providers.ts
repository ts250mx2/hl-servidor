/**
 * Destinos del proxy transparente por proveedor. Solo servidor.
 * El proxy reenvia la peticion tal cual al API oficial, inyecta la llave real y,
 * si el agente lo indica, sustituye el modelo. No interpreta las respuestas.
 */

import type { ProviderApi } from './providers';

export interface ProxyUpstream {
  baseUrl: string;
  /** Pone la credencial del proveedor en los headers salientes. */
  auth: (headers: Headers, llave: string) => void;
  /** Ajusta la ruta destino (Gemini lleva el modelo en la URL). */
  rewritePath: (path: string, modelo: string) => string;
  /** Headers propios del proveedor que la app puede mandar y conviene dejar pasar. */
  forwardHeaders: string[];
  /** Headers por defecto si la app no los manda. */
  defaultHeaders?: Record<string, string>;
}

const ANTHROPIC_VERSION = '2023-06-01';
const GEMINI_MODEL_IN_PATH = /models\/[^/:]+/;

/**
 * Proveedores que hablan el API de OpenAI: solo cambia la URL base, la app usa el SDK de OpenAI.
 * Algunos montan el API compatible en otro prefijo distinto de /v1; rewritePath lo ajusta.
 */
function openAiCompatible(
  baseUrl: string,
  forwardHeaders: string[] = [],
  rewritePath: (path: string) => string = (path) => path
): ProxyUpstream {
  return {
    baseUrl,
    auth: (headers, llave) => headers.set('authorization', `Bearer ${llave}`),
    rewritePath,
    forwardHeaders,
  };
}

/** El SDK de OpenAI manda /v1/...; este proveedor lo expone bajo otro prefijo. */
const replaceV1 = (prefijo: string) => (path: string) => path.replace(/^v1(\/|$)/, `${prefijo}$1`);

const UPSTREAMS: Record<string, ProxyUpstream> = {
  claude: {
    baseUrl: 'https://api.anthropic.com',
    auth: (headers, llave) => headers.set('x-api-key', llave),
    rewritePath: (path) => path,
    forwardHeaders: ['anthropic-version', 'anthropic-beta'],
    defaultHeaders: { 'anthropic-version': ANTHROPIC_VERSION },
  },
  openai: openAiCompatible('https://api.openai.com', ['openai-beta', 'openai-organization', 'openai-project']),
  deepseek: openAiCompatible('https://api.deepseek.com'),
  groq: openAiCompatible('https://api.groq.com/openai'),
  mistral: openAiCompatible('https://api.mistral.ai'),
  xai: openAiCompatible('https://api.x.ai'),
  openrouter: openAiCompatible('https://openrouter.ai/api', ['http-referer', 'x-title']),
  // Endpoints internacionales. Para las versiones de China: api.moonshot.cn,
  // dashscope.aliyuncs.com y open.bigmodel.cn respectivamente.
  kimi: openAiCompatible('https://api.moonshot.ai'),
  qwen: openAiCompatible('https://dashscope-intl.aliyuncs.com/compatible-mode'),
  glm: openAiCompatible('https://api.z.ai', [], replaceV1('api/paas/v4')),
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    auth: (headers, llave) => headers.set('x-goog-api-key', llave),
    rewritePath: (path, modelo) => path.replace(GEMINI_MODEL_IN_PATH, `models/${modelo}`),
    forwardHeaders: ['x-goog-api-client'],
  },
};

export function getUpstream(proveedor: string): ProxyUpstream | null {
  return UPSTREAMS[proveedor] ?? null;
}

/** Rutas caracteristicas de cada SDK: sirven para detectar que la app habla el API equivocado. */
const RUTAS_POR_API: { api: ProviderApi; patron: RegExp }[] = [
  { api: 'anthropic', patron: /^v1\/(messages|complete)(\/|$)/ },
  { api: 'openai', patron: /^v1\/(chat\/completions|responses|completions|embeddings)(\/|$)/ },
  { api: 'gemini', patron: /^(v1beta|v1)\/models\/[^/]+:/ },
];

/**
 * API que implica la ruta que mando la app (anthropic, openai, gemini) o null si la ruta
 * no es de ninguna en particular (listar modelos, archivos...).
 */
export function apiDeRuta(path: string): ProviderApi {
  return RUTAS_POR_API.find((r) => r.patron.test(path))?.api ?? null;
}

/**
 * En chat/completions de OpenAI el stream no trae el uso de tokens salvo que se pida con
 * stream_options.include_usage. Se agrega solo ahi (otros compatibles podrian rechazarlo).
 */
export function pedirUsoEnStream(body: string, proveedor: string, path: string): string {
  if (!body || proveedor !== 'openai' || !/^v1\/chat\/completions(\/|$)/.test(path)) return body;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
    const o = parsed as Record<string, unknown>;
    if (o.stream !== true || o.stream_options !== undefined) return body;
    return JSON.stringify({ ...o, stream_options: { include_usage: true } });
  } catch {
    return body;
  }
}

/** Sustituye "model" en un cuerpo JSON. Si el cuerpo no es JSON o no trae model, lo deja igual. */
export function rewriteModelInBody(body: string, modelo: string): string {
  if (!body) return body;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'model' in parsed) {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), model: modelo });
    }
    return body;
  } catch {
    return body;
  }
}
