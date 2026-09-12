/**
 * Formato de API que habla cada proveedor. Define que SDK usa la app cuando va por el proxy:
 *   anthropic -> @anthropic-ai/sdk · openai -> SDK de OpenAI (y todos los compatibles) · gemini -> @google/genai
 *   null      -> sin proxy, solo modo llave (/api/ws/llave)
 */
export type ProviderApi = 'anthropic' | 'openai' | 'gemini' | null;

/**
 * Proveedores de IA conocidos. Para agregar uno: una linea aqui (portal) y, si tiene proxy,
 * su destino en lib/proxy-providers.ts. Los compatibles con OpenAI solo cambian de baseUrl.
 */
export const PROVIDERS = [
  { id: 'claude', label: 'Claude (Anthropic)', short: 'Claude', keyHint: 'sk-ant-...', api: 'anthropic', color: '#d97757' },
  { id: 'openai', label: 'OpenAI', short: 'OpenAI', keyHint: 'sk-...', api: 'openai', color: '#10a37f' },
  { id: 'gemini', label: 'Gemini (Google)', short: 'Gemini', keyHint: 'AIza...', api: 'gemini', color: '#4e8cf5' },
  { id: 'deepseek', label: 'DeepSeek', short: 'DeepSeek', keyHint: 'sk-...', api: 'openai', color: '#4d6bfe' },
  { id: 'groq', label: 'Groq', short: 'Groq', keyHint: 'gsk_...', api: 'openai', color: '#f55036' },
  { id: 'mistral', label: 'Mistral', short: 'Mistral', keyHint: '', api: 'openai', color: '#ff7000' },
  { id: 'xai', label: 'xAI (Grok)', short: 'Grok', keyHint: 'xai-...', api: 'openai', color: '#6b7189' },
  { id: 'openrouter', label: 'OpenRouter', short: 'OpenRouter', keyHint: 'sk-or-...', api: 'openai', color: '#6467f2' },
  { id: 'kimi', label: 'Kimi (Moonshot)', short: 'Kimi', keyHint: 'sk-...', api: 'openai', color: '#1c1c1e' },
  { id: 'qwen', label: 'Qwen (Alibaba)', short: 'Qwen', keyHint: 'sk-...', api: 'openai', color: '#615ced' },
  { id: 'glm', label: 'GLM (Zhipu / Z.ai)', short: 'GLM', keyHint: '', api: 'openai', color: '#3b5bdb' },
  { id: 'otro', label: 'Otro (solo modo llave)', short: 'Otro', keyHint: '', api: null, color: '#9aa0b4' },
] as const satisfies readonly { id: string; label: string; short: string; keyHint: string; api: ProviderApi; color: string }[];

export type ProviderId = (typeof PROVIDERS)[number]['id'];

/** Color de marca (aproximado) de un proveedor; gris para desconocidos. */
export function providerColor(id: string | null | undefined): string {
  return PROVIDERS.find((p) => p.id === id)?.color ?? '#9aa0b4';
}

/** Nombre corto para chips, leyendas y gráficas. */
export function providerShort(id: string | null | undefined): string {
  return PROVIDERS.find((p) => p.id === id)?.short ?? (id || 'Sin proveedor');
}

const API_LABEL: Record<Exclude<ProviderApi, null>, string> = {
  anthropic: 'SDK de Anthropic',
  openai: 'SDK de OpenAI',
  gemini: 'SDK de Google GenAI',
};

/** API (SDK) que habla el proveedor; null si no tiene proxy. */
export function providerApi(id: string): ProviderApi {
  return PROVIDERS.find((p) => p.id === id)?.api ?? null;
}

/** Texto de ayuda del portal: con que SDK habla la app si usa el proxy. */
export function providerProxyHint(id: string): string {
  const api = PROVIDERS.find((p) => p.id === id)?.api ?? null;
  if (!api) return 'Sin proxy: las apps deben pedir la llave con /api/ws/llave.';
  return `Funciona por proxy con el ${API_LABEL[api]} apuntando a HL Console.`;
}

/**
 * Modelos mas populares por proveedor. Son solo sugerencias: el campo Modelo es libre
 * y acepta cualquier identificador, incluidos los que salgan despues de esta lista.
 */
export const MODEL_SUGGESTIONS: { provider: ProviderId; label: string; models: string[] }[] = [
  {
    provider: 'claude',
    label: 'Claude',
    models: [
      'claude-fable-5-1',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
    ],
  },
  {
    provider: 'openai',
    label: 'GPT (OpenAI)',
    models: [
      'gpt-6-astra',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
      'gpt-5.6-luna',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4o',
      'gpt-4o-mini',
      'o3',
      'o4-mini',
    ],
  },
  {
    provider: 'gemini',
    label: 'Gemini (Google)',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
  },
  { provider: 'deepseek', label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { provider: 'groq', label: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'] },
  { provider: 'mistral', label: 'Mistral', models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest'] },
  { provider: 'xai', label: 'xAI (Grok)', models: ['grok-4', 'grok-4-fast', 'grok-3-mini'] },
  { provider: 'openrouter', label: 'OpenRouter', models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro', 'meta-llama/llama-4-maverick'] },
  { provider: 'kimi', label: 'Kimi (Moonshot)', models: ['kimi-k2-thinking', 'kimi-k2-0905-preview', 'kimi-k2-turbo-preview'] },
  { provider: 'qwen', label: 'Qwen (Alibaba)', models: ['qwen3-max', 'qwen-plus', 'qwen-flash', 'qwen3-coder-plus'] },
  { provider: 'glm', label: 'GLM (Zhipu / Z.ai)', models: ['glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash'] },
];

/** Lista plana para el autocompletado del navegador (datalist). */
export const ALL_MODEL_SUGGESTIONS = MODEL_SUGGESTIONS.flatMap((g) => g.models);

export function isProvider(value: unknown): value is ProviderId {
  return PROVIDERS.some((p) => p.id === value);
}

export function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
