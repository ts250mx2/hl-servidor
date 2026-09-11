import pool from '@/lib/db';
import { cleanText, fail, ok, parseDateOrNull, parseStatus, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/crypto';
import { isProvider } from '@/lib/providers';
import { LLAVES_LIST_SQL, toPublicLlave, type LlaveRow } from '@/lib/llaves';

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(`${LLAVES_LIST_SQL} ORDER BY l.Llave`);
    return ok((rows as LlaveRow[]).map(toPublicLlave));
  });
}

export async function POST(request: Request) {
  return withAuth(async () => {
    const body = await request.json().catch(() => ({}));
    const nombre = cleanText(body.Llave, 45);
    const proveedor = cleanText(body.Proveedor, 30);
    const modelo = cleanText(body.Modelo, 100);
    const secreto = String(body.Secreto ?? '').trim();
    const fechaCaducidad = parseDateOrNull(body.FechaCaducidad);

    if (!nombre || !modelo || !secreto) return fail('Nombre, Modelo y Llave de API son requeridos');
    if (!isProvider(proveedor)) return fail('Proveedor invalido');
    if (fechaCaducidad === undefined) return fail('Fecha de caducidad invalida');

    const [result] = await pool.query(
      `INSERT INTO tblLlaves (Llave, Proveedor, Modelo, LlaveEncriptada, FechaCaducidad, Status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, proveedor, modelo, encryptSecret(secreto), fechaCaducidad, parseStatus(body.Status)]
    );
    const insertId = (result as { insertId: number }).insertId;
    return ok({ IdLlave: insertId }, 201);
  });
}
