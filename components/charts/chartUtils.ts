'use client';

import { useEffect, useRef, useState } from 'react';

/** Maximo de series con color propio. Las demas se pliegan en "Otros". */
export const MAX_SERIES = 8;

/** Color de la serie n (1..8) desde los tokens CSS validados para ambos temas. */
export function seriesColor(index: number): string {
  const slot = Math.min(Math.max(index, 0), MAX_SERIES - 1) + 1;
  return `var(--series-${slot})`;
}

/** Ancho real del contenedor para que el SVG se dibuje a la medida y no se deforme el texto. */
export function useContainerWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/** Ticks "bonitos" para un eje que arranca en cero. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export const fmtNum = new Intl.NumberFormat('es-MX');

const usdCentavos = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdFino = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** Gasto en USD: con 4 decimales por debajo de un dolar, para que las llamadas chicas no salgan en $0.00. */
export const fmtUsd = (v: number): string => (Math.abs(v) < 1 ? usdFino : usdCentavos).format(v);
/** Duracion: ms por debajo de un segundo, segundos con un decimal despues. */
export const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** Etiqueta corta del periodo segun la granularidad del API. */
export function fmtPeriodo(periodo: string, granularidad: 'hora' | 'dia' | 'mes'): string {
  if (granularidad === 'hora') return periodo.slice(11, 16);
  const [y, m, d] = periodo.slice(0, 10).split('-');
  if (granularidad === 'mes') return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Posicion del tooltip dentro del contenedor, sin salirse por la derecha. */
export function tooltipStyle(x: number, y: number, width: number): React.CSSProperties {
  const flip = x > width * 0.6;
  return {
    left: flip ? undefined : x + 14,
    right: flip ? width - x + 14 : undefined,
    top: Math.max(0, y - 10),
  };
}
