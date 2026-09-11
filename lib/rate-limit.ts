/**
 * Limitador de intentos en memoria. Suficiente para un servidor unico en localhost.
 * Se reinicia al reiniciar el proceso.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const CLEANUP_EVERY = 100;

interface Entry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Entry>();
let operations = 0;

function cleanup(now: number) {
  operations += 1;
  if (operations % CLEANUP_EVERY !== 0) return;
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

/** true si la clave ya agoto sus intentos dentro de la ventana. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  cleanup(now);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  attempts.set(key, { count: entry.count + 1, resetAt: entry.resetAt });
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export const RATE_LIMIT_MINUTES = WINDOW_MS / 60000;
