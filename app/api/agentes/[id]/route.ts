import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

/** Actualiza nombre, llave destino y status. El UUID nunca cambia. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const agente = cleanText(body.Agente, 45);
    const idLlave = parseId(String(body.IdLlave ?? ''));
    if (!agente || !idLlave) return fail('Nombre del agente y Llave son requeridos');

    const [llaves] = await pool.query('SELECT 1 FROM tblLlaves WHERE IdLlave = ?', [idLlave]);
    if ((llaves as unknown[]).length === 0) return fail('La llave no existe', 404);

    const [result] = await pool.query(
      'UPDATE tblAgentes SET Agente = ?, IdLlave = ?, Status = ? WHERE IdAgente = ?',
      [agente, idLlave, parseStatus(body.Status), id]
    );
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdAgente: id }) : fail('Agente no encontrado', 404);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const [result] = await pool.query('DELETE FROM tblAgentes WHERE IdAgente = ?', [id]);
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdAgente: id }) : fail('Agente no encontrado', 404);
  });
}
