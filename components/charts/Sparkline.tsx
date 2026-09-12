'use client';

import { useState } from 'react';
import { fmtNum, tooltipStyle, useContainerWidth } from './chartUtils';

interface SparklineProps {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  ariaLabel?: string;
}

const MARGIN = { top: 10, right: 8, bottom: 22, left: 8 };
const MAX_X_TICKS = 7;

/** Área suave con línea, para tendencias compactas. */
export default function Sparkline({ labels, values, color = 'var(--primary)', height = 150, ariaLabel = 'Tendencia' }: SparklineProps) {
  const { ref, width } = useContainerWidth<HTMLDivElement>(400);
  const [hover, setHover] = useState<number | null>(null);

  const n = values.length;
  if (n === 0) return <div ref={ref} className="chart-empty" style={{ height }}>Sin datos.</div>;

  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const max = Math.max(1, ...values);
  const xAt = (i: number) => MARGIN.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => MARGIN.top + innerH - (v / max) * innerH;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  const area = `${line} L${xAt(n - 1).toFixed(1)},${(MARGIN.top + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(MARGIN.top + innerH).toFixed(1)} Z`;
  const ticks = Math.min(n, MAX_X_TICKS);
  const tickIdx = new Set(Array.from({ length: ticks }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, ticks - 1))));
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    setHover(Math.min(n - 1, Math.max(0, n === 1 ? 0 : Math.round((px / rect.width) * (n - 1)))));
  };

  return (
    <div ref={ref} className="chart-wrap">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} className="chart-line" stroke={color} strokeWidth={2.5} />
        <g className="chart-axis">
          {labels.map((l, i) => (tickIdx.has(i) ? <text key={i} x={xAt(i)} y={height - 6} textAnchor="middle">{l}</text> : null))}
        </g>
        {hover !== null && (
          <g>
            <line className="chart-crosshair" x1={xAt(hover)} x2={xAt(hover)} y1={MARGIN.top} y2={MARGIN.top + innerH} />
            <circle className="chart-dot" cx={xAt(hover)} cy={yAt(values[hover])} r={4.5} fill={color} />
          </g>
        )}
        <rect className="chart-hit" x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className="chart-tooltip" style={tooltipStyle(xAt(hover), yAt(values[hover]), width)}>
          <div className="tt-title">{labels[hover]}</div>
          <div className="tt-row"><span className="tt-val">{fmtNum.format(values[hover])}</span><span className="tt-name">llamadas</span></div>
        </div>
      )}
    </div>
  );
}
