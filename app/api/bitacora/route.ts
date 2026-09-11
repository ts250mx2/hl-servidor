import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { ok, withAuth } from '@/lib/api';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  return withAuth(async () => {
    const raw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
    const [rows] = await pool.query(
      `SELECT b.IdBitacora, b.Fecha, b.IP, b.KeyPrefijo, b.IdAgente, b.Resultado, b.Detalle, a.Agente
       FROM tblBitacora b
       LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
       ORDER BY b.IdBitacora DESC
       LIMIT ?`,
      [limit]
    );
    return ok(rows);
  });
}
