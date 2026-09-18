import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { fail, ok, withAuth } from '@/lib/api';
import { contarNoLeidas } from '@/lib/alertas';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * GET /api/alertas?limit=&noLeidas=1   lista (mas recientes primero)
 * GET /api/alertas?conteo=1            solo { noLeidas } para la campana
 */
export async function GET(request: NextRequest) {
  return withAuth(async () => {
    const p = request.nextUrl.searchParams;
    if (p.get('conteo') === '1') return ok({ noLeidas: await contarNoLeidas() });
    const raw = Number(p.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
    const soloNoLeidas = p.get('noLeidas') === '1';
    const [rows] = await pool.query(
      `SELECT IdAlerta, Fecha, Tipo, Nivel, Titulo, Detalle, Clave, Leida, Enviada, Canal
       FROM tblAlertas ${soloNoLeidas ? 'WHERE Leida = 0' : ''}
       ORDER BY IdAlerta DESC LIMIT ?`,
      [limit]
    );
    return ok(rows);
  });
}

/** PATCH /api/alertas  { ids: number[] } o { todas: true }: marca como leidas. */
export async function PATCH(request: NextRequest) {
  return withAuth(async () => {
    const body = await request.json().catch(() => ({}));
    if (body.todas === true) {
      const [r] = await pool.query('UPDATE tblAlertas SET Leida = 1 WHERE Leida = 0');
      return ok({ marcadas: (r as { affectedRows: number }).affectedRows });
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) return fail('Indica ids o todas');
    const [r] = await pool.query('UPDATE tblAlertas SET Leida = 1 WHERE IdAlerta IN (?)', [ids]);
    return ok({ marcadas: (r as { affectedRows: number }).affectedRows });
  });
}
