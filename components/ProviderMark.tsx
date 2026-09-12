'use client';

import { providerColor, providerLabel } from '@/lib/providers';

/**
 * Glifos propios (no logotipos oficiales) que identifican a cada proveedor de IA.
 * Todos se dibujan en un lienzo de 24x24 y toman el color de marca del proveedor.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  // Claude: estrella de ocho puntas (rayos redondeados)
  claude: (
    <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" />
    </g>
  ),
  // OpenAI: anillo de seis pétalos
  openai: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6z" />
      <path d="M12 8.4l3.1 1.8v3.6L12 15.6l-3.1-1.8v-3.6z" fill="currentColor" stroke="none" />
    </g>
  ),
  // Gemini: destello de cuatro puntas
  gemini: (
    <path fill="currentColor" d="M12 2c.6 5.6 4.4 9.4 10 10-5.6.6-9.4 4.4-10 10-.6-5.6-4.4-9.4-10-10 5.6-.6 9.4-4.4 10-10z" />
  ),
  // DeepSeek: ola
  deepseek: (
    <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M3 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M3 9.5c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
  ),
  // Groq: rayo
  groq: (
    <path fill="currentColor" d="M13.5 2L5 13.5h6L10.5 22 19 10.5h-6z" />
  ),
  // Mistral: bloques escalonados
  mistral: (
    <g fill="currentColor">
      <rect x="3" y="4" width="5" height="5" rx="1" />
      <rect x="16" y="4" width="5" height="5" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="5" height="4" rx="1" />
      <rect x="9.5" y="16" width="5" height="4" rx="1" />
      <rect x="16" y="16" width="5" height="4" rx="1" />
    </g>
  ),
  // xAI: trazo diagonal
  xai: (
    <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M5 5l14 14M19 5l-6.5 6.5M5 19l4.5-4.5" />
    </g>
  ),
  // OpenRouter: nodos enrutados
  openrouter: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M3 12h4c3 0 3-5 6-5h2M3 12h4c3 0 3 5 6 5h2" />
      <path d="M15 4.5L18 7l-3 2.5M15 14.5L18 17l-3 2.5" strokeLinejoin="round" />
    </g>
  ),
  // Kimi: luna
  kimi: (
    <path fill="currentColor" d="M14.5 2.5a9.5 9.5 0 1 0 7 15.8A8 8 0 0 1 14.5 2.5z" />
  ),
  // Qwen: nube de puntos
  qwen: (
    <g fill="currentColor">
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5.5" cy="9" r="2.2" />
      <circle cx="18.5" cy="9" r="2.2" />
      <circle cx="8" cy="16" r="2.2" />
      <circle cx="16" cy="16" r="2.2" />
      <circle cx="12" cy="11" r="1.6" opacity="0.6" />
    </g>
  ),
  // GLM: capas
  glm: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17.5l9 5 9-5" opacity="0.5" />
    </g>
  ),
};

function Fallback({ id }: { id: string }) {
  return (
    <text x="12" y="16.2" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor" fontFamily="Outfit, system-ui, sans-serif">
      {(id || '?').slice(0, 1).toUpperCase()}
    </text>
  );
}

/** Contenido SVG puro del glifo, para incrustar dentro de otro SVG (gráficas). */
export function ProviderGlyph({ id }: { id: string | null | undefined }) {
  const key = id ?? 'otro';
  return <>{GLYPHS[key] ?? <Fallback id={key} />}</>;
}

interface ProviderMarkProps {
  id: string | null | undefined;
  size?: number;
  /** "tile": cuadro con fondo de color de marca. "plain": solo el glifo en color de marca. */
  variant?: 'tile' | 'plain';
  className?: string;
}

/** Marca del proveedor lista para usar en HTML. */
export default function ProviderMark({ id, size = 22, variant = 'tile', className = '' }: ProviderMarkProps) {
  const color = providerColor(id);
  const label = providerLabel(id ?? 'otro');
  const style: React.CSSProperties =
    variant === 'tile'
      ? { width: size, height: size, background: color, color: '#fff', borderRadius: Math.max(5, size * 0.27) }
      : { width: size, height: size, color };
  return (
    <span className={`pmark pmark-${variant} ${className}`} style={style} title={label} aria-label={label} role="img">
      <svg viewBox="0 0 24 24" width={variant === 'tile' ? size * 0.62 : size} height={variant === 'tile' ? size * 0.62 : size} aria-hidden="true">
        <ProviderGlyph id={id} />
      </svg>
    </span>
  );
}

/** Marca + nombre, para celdas de tabla y listas. */
export function ProviderBadge({ id, short = false, size = 20 }: { id: string | null | undefined; short?: boolean; size?: number }) {
  const label = id ? providerLabel(id) : 'Sin proveedor';
  const text = short ? label.replace(/\s*\(.*\)$/, '') : label;
  return (
    <span className="pbadge">
      <ProviderMark id={id} size={size} />
      <span>{text}</span>
    </span>
  );
}
