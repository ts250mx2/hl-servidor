'use client';

import { useState } from 'react';
import { fmtNum, niceTicks, tooltipStyle, useContainerWidth } from './chartUtils';

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  /** Etiquetas del eje X, una por punto. */
  labels: string[];
  /** Titulo largo de cada punto para el tooltip (si difiere de la etiqueta). */
  titles?: string[];
  series: LineSeries[];
  height?: number;
  /** Zoom por arrastre: se llama con el primer y ultimo indice seleccionados. */
  onZoom?: (fromIndex: number, toIndex: number) => void;
}

const MARGIN = { top: 16, right: 20, bottom: 30, left: 44 };
const MAX_X_TICKS = 8;
/** Separacion minima entre etiquetas del eje X para que no se encimen en pantallas angostas. */
const MIN_PX_POR_TICK = 64;
const MARKER_R = 4;

interface Hover { index: number; x: number; y: number }
interface Brush { start: number; end: number }

export default function LineChart({ labels, titles, series, height = 280, onZoom }: LineChartProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);

  const n = labels.length;
  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;

  if (n === 0 || series.length === 0) {
    return <div ref={ref} className="chart-empty">Sin llamadas en el rango seleccionado.</div>;
  }

  const maxVal = Math.max(0, ...series.flatMap((s) => s.values));
  const yTicks = niceTicks(maxVal);
  const yMax = yTicks[yTicks.length - 1];
  const xAt = (i: number) => MARGIN.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => MARGIN.top + innerH - (v / yMax) * innerH;

  // Ticks del eje X repartidos de forma pareja e incluyendo ambos extremos, sin encimarse.
  const ticksX = Math.min(n, MAX_X_TICKS, Math.max(2, Math.floor(innerW / MIN_PX_POR_TICK)));
  const xTickIdx = new Set(Array.from({ length: ticksX }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, ticksX - 1))));

  const indexAt = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const index = n === 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    return { index: Math.min(n - 1, Math.max(0, index)), y: e.clientY - rect.top + MARGIN.top };
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const { index, y } = indexAt(e);
    setHover({ index, x: xAt(index), y });
    if (brush) setBrush({ ...brush, end: index });
  };

  const onDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (!onZoom || n < 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { index } = indexAt(e);
    setBrush({ start: index, end: index });
  };

  const onUp = () => {
    if (brush && onZoom) {
      const from = Math.min(brush.start, brush.end);
      const to = Math.max(brush.start, brush.end);
      if (to > from) onZoom(from, to);
    }
    setBrush(null);
  };

  // Si los datos cambiaron (zoom, filtro) el indice del hover previo puede quedar fuera de rango.
  const hoverIdx = hover && hover.index < n ? hover.index : null;
  const brushFrom = brush ? Math.min(brush.start, brush.end) : 0;
  const brushTo = brush ? Math.max(brush.start, brush.end) : 0;
  const brushX1 = xAt(Math.min(brushFrom, n - 1));
  const brushX2 = xAt(Math.min(brushTo, n - 1));

  return (
    <div ref={ref} className={`chart-wrap ${onZoom ? 'zoomable' : ''}`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Llamadas por periodo">
        <g className="chart-grid">
          {yTicks.map((t) => (
            <line key={t} x1={MARGIN.left} x2={MARGIN.left + innerW} y1={yAt(t)} y2={yAt(t)} />
          ))}
        </g>
        <line className="chart-baseline" x1={MARGIN.left} x2={MARGIN.left + innerW} y1={yAt(0)} y2={yAt(0)} />

        <g className="chart-axis">
          {yTicks.map((t) => (
            <text key={t} x={MARGIN.left - 8} y={yAt(t) + 4} textAnchor="end">{fmtNum.format(t)}</text>
          ))}
          {labels.map((l, i) =>
            xTickIdx.has(i) ? <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle">{l}</text> : null
          )}
        </g>

        {brush && (
          <rect className="chart-brush" x={brushX1} y={MARGIN.top} width={Math.max(2, brushX2 - brushX1)} height={innerH} />
        )}

        {series.map((s) => {
          const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
          return <path key={s.id} className="chart-line" d={d} stroke={s.color} />;
        })}

        {hover && hoverIdx !== null && !brush && (
          <g>
            <line className="chart-crosshair" x1={hover.x} x2={hover.x} y1={MARGIN.top} y2={MARGIN.top + innerH} />
            {series.map((s) =>
              s.values[hoverIdx] === undefined ? null : (
                <circle key={s.id} className="chart-dot" cx={hover.x} cy={yAt(s.values[hoverIdx])} r={MARKER_R} fill={s.color} />
              )
            )}
          </g>
        )}

        <rect
          className="chart-hit"
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          onPointerMove={onMove}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hover && hoverIdx !== null && !brush && (
        <div className="chart-tooltip" style={tooltipStyle(hover.x, hover.y, width)}>
          <div className="tt-title">{titles?.[hoverIdx] ?? labels[hoverIdx]}</div>
          {series.map((s) => (
            <div key={s.id} className="tt-row">
              <span className="tt-key" style={{ background: s.color }} />
              <span className="tt-val">{fmtNum.format(s.values[hoverIdx] ?? 0)}</span>
              <span className="tt-name">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {brush && (
        <div className="chart-tooltip" style={tooltipStyle(brushX2, MARGIN.top + 8, width)}>
          <div className="tt-title">Acercar</div>
          <div className="tt-row">
            <span className="tt-val">{labels[brushFrom]}</span>
            <span className="tt-name">a {labels[brushTo]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
