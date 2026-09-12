'use client';

import { useState } from 'react';
import { fmtNum, tooltipStyle, useContainerWidth } from './chartUtils';
import { ProviderGlyph } from '@/components/ProviderMark';
import { providerColor } from '@/lib/providers';

export interface BarItem {
  id: string;
  label: string;
  color: string;
  value: number;
  /** Texto extra para el tooltip (ej. "120 OK, 3 rechazos"). */
  detail?: string;
  /** Si la barra representa un proveedor de IA, su id: se dibuja su glifo junto al nombre. */
  provider?: string | null;
}

interface BarChartProps {
  items: BarItem[];
}

const ROW_H = 30;
const BAR_H = 18;
const RADIUS = 4;
const MARGIN = { top: 6, right: 56, bottom: 6 };
const MAX_LABEL_CHARS = 30;
/** El nombre ocupa hasta este porcentaje del ancho, con tope en pixeles. */
const LABEL_RATIO = 0.45;
const LABEL_MAX_PX = 240;
const MARK = 20;
const MARK_GAP = 8;

function truncate(text: string, max = MAX_LABEL_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Barra con extremo redondeado solo del lado del dato, anclada a la linea base. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (w <= 0) return '';
  const r = Math.min(RADIUS, w);
  return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`;
}

export default function BarChart({ items }: BarChartProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  if (items.length === 0) {
    return <div ref={ref} className="chart-empty">Sin llamadas en el rango seleccionado.</div>;
  }

  const withMarks = items.some((i) => i.provider !== undefined);
  const height = MARGIN.top + MARGIN.bottom + items.length * ROW_H;
  const x0 = Math.min(LABEL_MAX_PX, Math.round(width * LABEL_RATIO));
  const innerW = Math.max(10, width - x0 - MARGIN.right);
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const labelMax = withMarks ? MAX_LABEL_CHARS - 4 : MAX_LABEL_CHARS;

  const onMove = (index: number) => (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    setHover({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div ref={ref} className="chart-wrap">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Llamadas por categoría">
        <line className="chart-baseline" x1={x0} x2={x0} y1={MARGIN.top} y2={height - MARGIN.bottom} />
        {items.map((item, i) => {
          const y = MARGIN.top + i * ROW_H;
          const barY = y + (ROW_H - BAR_H) / 2;
          const w = (item.value / maxVal) * innerW;
          const dim = hover !== null && hover.index !== i;
          const markX = x0 - 8 - MARK;
          const labelX = withMarks ? markX - MARK_GAP : x0 - 8;
          return (
            <g key={item.id} className={`chart-bar ${dim ? 'dim' : ''}`}>
              {item.provider !== undefined && (
                <g transform={`translate(${markX}, ${y + (ROW_H - MARK) / 2})`}>
                  <rect width={MARK} height={MARK} rx={5} fill={providerColor(item.provider)} />
                  <g transform={`translate(${MARK * 0.19}, ${MARK * 0.19}) scale(${(MARK * 0.62) / 24})`} style={{ color: '#fff' }}>
                    <ProviderGlyph id={item.provider} />
                  </g>
                </g>
              )}
              <text className="chart-label" x={labelX} y={y + ROW_H / 2 + 4} textAnchor="end">
                <title>{item.label}</title>
                {truncate(item.label, labelMax)}
              </text>
              <path d={barPath(x0, barY, w, BAR_H)} fill={item.color} />
              <text className="chart-label" x={x0 + w + 6} y={y + ROW_H / 2 + 4} style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                {fmtNum.format(item.value)}
              </text>
              <rect className="chart-hit" x={0} y={y} width={width} height={ROW_H} onPointerMove={onMove(i)} onPointerLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={tooltipStyle(hover.x, hover.y, width)}>
          <div className="tt-title">{items[hover.index].label}</div>
          <div className="tt-row">
            <span className="tt-key rect" style={{ background: items[hover.index].color }} />
            <span className="tt-val">{fmtNum.format(items[hover.index].value)}</span>
            <span className="tt-name">llamadas</span>
          </div>
          {items[hover.index].detail && <div className="chart-sub" style={{ marginTop: '0.25rem' }}>{items[hover.index].detail}</div>}
        </div>
      )}
    </div>
  );
}
