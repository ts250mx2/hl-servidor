import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { ok, withAuth } from '@/lib/api';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/** GET /api/auditoria?limit=: ultimos cambios hechos desde el portal, del mas reciente al mas antiguo. */
export async function GET(request: NextRequest) {
  return withAuth(async () => {
    const raw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
    const [rows] = await pool.query(
      `SELECT IdAuditoria, Fecha, IdUsuario, Usuario, IP, Accion, Entidad, IdEntidad, Nombre, Cambios, Detalle
       FROM tblAuditoria
       ORDER BY IdAuditoria DESC
       LIMIT ?`,
      [limit]
    );
    return ok(rows);
  });
}
