import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { AGENTES_LIST_SQL, generateAgenteUuid } from '@/lib/agentes';

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(`${AGENTES_LIST_SQL} ORDER BY a.Agente`);
    return ok(rows);
  });
}

export async function POST(request: Request) {
  return withAuth(async () => {
    const body = await request.json().catch(() => ({}));
    const agente = cleanText(body.Agente, 45);
    const idLlave = parseId(String(body.IdLlave ?? ''));
    if (!agente || !idLlave) return fail('Nombre del agente y Llave son requeridos');

    const [llaves] = await pool.query('SELECT 1 FROM tblLlaves WHERE IdLlave = ?', [idLlave]);
    if ((llaves as unknown[]).length === 0) return fail('La llave no existe', 404);

    const uuid = generateAgenteUuid();
    const [result] = await pool.query(
      'INSERT INTO tblAgentes (Uuid, Agente, IdLlave, Status) VALUES (?, ?, ?, ?)',
      [uuid, agente, idLlave, parseStatus(body.Status)]
    );
    const insertId = (result as { insertId: number }).insertId;
    return ok({ IdAgente: insertId, Uuid: uuid }, 201);
  });
}
