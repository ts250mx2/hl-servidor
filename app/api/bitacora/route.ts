import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { ok, withAuth } from '@/lib/api';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_PENDIENTES = 50;

export async function GET(request: NextRequest) {
  return withAuth(async () => {
    const raw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
    /* ?despues=<IdBitacora>: solo las llamadas posteriores, de la mas antigua a la mas nueva (bitacora en vivo). */
    const despues = Number(request.nextUrl.searchParams.get('despues') ?? 0);
    const enVivo = Number.isInteger(despues) && despues > 0;
    /* ?pendientes=id,id: llamadas ya mostradas que seguian en curso; se reenvian con su duracion, tokens y gasto ya completos. */
    const pendientes = (request.nextUrl.searchParams.get('pendientes') ?? '')
      .split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX_PENDIENTES);
    const [rows] = await pool.query(
      `SELECT b.IdBitacora, b.Fecha, b.IP, b.KeyPrefijo, b.IdKey, b.Aplicacion, b.IdAgente, b.Proveedor, b.Modelo, b.Resultado, b.Detalle, b.DuracionMs, b.TokensEntrada, b.TokensSalida, b.TokensCacheLectura, b.TokensCacheEscritura, b.CostoUsd, a.Agente
       FROM tblBitacora b
       LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
       ${enVivo ? `WHERE b.IdBitacora > ?${pendientes.length ? ' OR b.IdBitacora IN (?)' : ''}` : ''}
       ORDER BY b.IdBitacora ${enVivo ? 'ASC' : 'DESC'}
       LIMIT ?`,
      enVivo ? (pendientes.length ? [despues, pendientes, limit] : [despues, limit]) : [limit]
    );
    return ok(rows);
  });
}
