'use client';

import { useState } from 'react';
import { fmtNum } from './chartUtils';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Texto del centro cuando no hay hover. */
  centerLabel?: string;
}

const GAP_DEG = 2;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const toXY = (a: number) => [cx + r * Math.cos((a - 90) * (Math.PI / 180)), cy + r * Math.sin((a - 90) * (Math.PI / 180))];
  const [x0, y0] = toXY(a0);
  const [x1, y1] = toXY(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** Dona de proporciones con centro informativo. */
export default function Donut({ slices, size = 160, thickness = 18, centerLabel = 'total' }: DonutProps) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const r = size / 2 - thickness / 2 - 2;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Sin datos">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        <text x={cx} y={cx + 4} textAnchor="middle" className="donut-center-sub">sin datos</text>
      </svg>
    );
  }

  /* Angulo inicial de cada rebanada, acumulado sin mutar variables durante el render. */
  const starts = slices.reduce<number[]>((acc, s, i) => {
    const prev = i === 0 ? 0 : acc[i - 1] + (slices[i - 1].value / total) * 360;
    return [...acc, prev];
  }, []);
  const paths = slices.map((s, i) => {
    const span = (s.value / total) * 360;
    const gap = slices.length > 1 ? GAP_DEG / 2 : 0;
    const a0 = starts[i] + gap;
    const a1 = starts[i] + span - gap;
    if (a1 <= a0) return null;
    const dim = hover !== null && hover !== i;
    return (
      <path
        key={s.id}
        d={arc(cx, cx, r, a0, span >= 359.99 ? a0 + 359.99 : a1)}
        fill="none"
        stroke={s.color}
        strokeWidth={hover === i ? thickness + 4 : thickness}
        strokeLinecap={slices.length > 1 ? 'round' : 'butt'}
        opacity={dim ? 0.35 : 1}
        style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
        onPointerEnter={() => setHover(i)}
        onPointerLeave={() => setHover(null)}
      />
    );
  });

  const active = hover !== null ? slices[hover] : null;
  const pct = active ? Math.round((active.value / total) * 100) : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribución">
      {paths}
      <text x={cx} y={cx - 2} textAnchor="middle" className="donut-center">
        {active ? `${pct}%` : fmtNum.format(total)}
      </text>
      <text x={cx} y={cx + 16} textAnchor="middle" className="donut-center-sub">
        {active ? active.label : centerLabel}
      </text>
    </svg>
  );
}
