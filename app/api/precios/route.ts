import pool from '@/lib/db';
import { cleanText, fail, ok, withAuth } from '@/lib/api';
import { isProvider } from '@/lib/providers';
import { invalidarPrecios, listaPrecios } from '@/lib/precios';
import { registrarAuditoria } from '@/lib/auditoria';

const MAX_USD_POR_MILLON = 10_000;

/** Precio en USD por millon: numero no negativo con hasta 4 decimales; undefined si es invalido. */
export function parsePrecio(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_USD_POR_MILLON) return undefined;
  return Math.round(n * 10_000) / 10_000;
}

export async function GET() {
  return withAuth(async () => ok(await listaPrecios()));
}

export async function POST(request: Request) {
  return withAuth(async (user) => {
    const body = await request.json().catch(() => ({}));
    const proveedor = cleanText(body.Proveedor, 30).toLowerCase();
    const modelo = cleanText(body.Modelo, 100).toLowerCase();
    const entrada = parsePrecio(body.Entrada);
    const salida = parsePrecio(body.Salida);
    const cacheLectura = parsePrecio(body.CacheLectura ?? 0);
    const cacheEscritura = parsePrecio(body.CacheEscritura ?? 0);
    const nota = cleanText(body.Nota, 120) || null;

    if (!isProvider(proveedor)) return fail('Proveedor invalido');
    if (!modelo) return fail('El modelo (o su prefijo) es requerido');
    if (entrada === undefined || salida === undefined || cacheLectura === undefined || cacheEscritura === undefined) {
      return fail('Los precios deben ser numeros no negativos (USD por millon de tokens)');
    }

    const [existe] = await pool.query('SELECT 1 FROM tblPrecios WHERE Proveedor = ? AND Modelo = ?', [proveedor, modelo]);
    if ((existe as unknown[]).length > 0) return fail('Ya hay un precio para ese proveedor y modelo', 409);

    const [result] = await pool.query(
      'INSERT INTO tblPrecios (Proveedor, Modelo, Entrada, Salida, CacheLectura, CacheEscritura, Nota) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [proveedor, modelo, entrada, salida, cacheLectura, cacheEscritura, nota]
    );
    invalidarPrecios();
    const insertId = (result as { insertId: number }).insertId;
    await registrarAuditoria({
      user, request, accion: 'CREAR', entidad: 'precio', idEntidad: insertId, nombre: `${proveedor} ${modelo}`,
      despues: { Proveedor: proveedor, Modelo: modelo, Entrada: entrada, Salida: salida, CacheLectura: cacheLectura, CacheEscritura: cacheEscritura, Nota: nota },
    });
    return ok({ IdPrecio: insertId }, 201);
  });
}
