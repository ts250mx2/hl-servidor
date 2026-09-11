'use client';

import { useEffect } from 'react';

/**
 * Ejecuta una carga asincrona al montar y cada vez que cambie la funcion.
 * La llamada se difiere a un microtask para no hacer setState sincrono dentro del efecto.
 */
export function useLoad(load: () => Promise<void>) {
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
}
