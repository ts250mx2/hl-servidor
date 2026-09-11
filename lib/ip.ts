import pool from './db';

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,39}$/;
const IPV4_MAPPED_RE = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** Normaliza IPv6 mapeadas a IPv4 (::ffff:127.0.0.1 pasa a 127.0.0.1). */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = trimmed.match(IPV4_MAPPED_RE);
  return mapped ? mapped[1] : trimmed;
}

/** IP del cliente. server.js garantiza que X-Forwarded-For viene del socket real. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0];
  return normalizeIp(first || '');
}

export function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || (ip.includes(':') && IPV6_RE.test(ip));
}

export async function isIpAllowed(ip: string): Promise<boolean> {
  if (!ip) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM tblIPsPermitidas WHERE IP = ? AND Status = 1 LIMIT 1',
    [ip]
  );
  return (rows as unknown[]).length > 0;
}
