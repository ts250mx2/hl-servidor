import pool from '@/lib/db';
import { cleanText, fail, ok, parseStatus, withAuth } from '@/lib/api';
import { generateAccessKey, hashAccessKey, keyPrefix } from '@/lib/crypto';

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(
      'SELECT IdKey, Nombre, KeyPrefijo, Status, UltimoUso, FechaAlta FROM tblKeys ORDER BY Nombre'
    );
    return ok(rows);
  });
}

/** Crea una Key nueva. La Key en claro se regresa UNA sola vez; en la base solo queda el hash. */
export async function POST(request: Request) {
  return withAuth(async () => {
    const body = await request.json().catch(() => ({}));
    const nombre = cleanText(body.Nombre, 80);
    if (!nombre) return fail('El nombre de la aplicacion es requerido');

    const key = generateAccessKey();
    const [result] = await pool.query(
      'INSERT INTO tblKeys (Nombre, KeyHash, KeyPrefijo, Status) VALUES (?, ?, ?, ?)',
      [nombre, hashAccessKey(key), keyPrefix(key), parseStatus(body.Status)]
    );
    const insertId = (result as { insertId: number }).insertId;
    return ok({ IdKey: insertId, Key: key }, 201);
  });
}
