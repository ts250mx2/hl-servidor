/** Proveedores de IA conocidos. Agregar aqui los nuevos que vayan saliendo. */
export const PROVIDERS = [
  { id: 'claude', label: 'Claude (Anthropic)', keyHint: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', keyHint: 'sk-...' },
  { id: 'gemini', label: 'Gemini (Google)', keyHint: 'AIza...' },
  { id: 'otro', label: 'Otro', keyHint: '' },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]['id'];

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
];

/** Lista plana para el autocompletado del navegador (datalist). */
export const ALL_MODEL_SUGGESTIONS = MODEL_SUGGESTIONS.flatMap((g) => g.models);

export function isProvider(value: unknown): value is ProviderId {
  return PROVIDERS.some((p) => p.id === value);
}

export function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
