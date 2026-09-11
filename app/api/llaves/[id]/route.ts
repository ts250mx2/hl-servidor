import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseDateOrNull, parseId, parseStatus, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/crypto';
import { isProvider } from '@/lib/providers';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const nombre = cleanText(body.Llave, 45);
    const proveedor = cleanText(body.Proveedor, 30);
    const modelo = cleanText(body.Modelo, 100);
    const secreto = String(body.Secreto ?? '').trim();
    const fechaCaducidad = parseDateOrNull(body.FechaCaducidad);

    if (!nombre || !modelo) return fail('Nombre y Modelo son requeridos');
    if (!isProvider(proveedor)) return fail('Proveedor invalido');
    if (fechaCaducidad === undefined) return fail('Fecha de caducidad invalida');

    const fields = ['Llave = ?', 'Proveedor = ?', 'Modelo = ?', 'FechaCaducidad = ?', 'Status = ?'];
    const values: unknown[] = [nombre, proveedor, modelo, fechaCaducidad, parseStatus(body.Status)];
    if (secreto) {
      fields.push('LlaveEncriptada = ?');
      values.push(encryptSecret(secreto));
    }

    const [result] = await pool.query(
      `UPDATE tblLlaves SET ${fields.join(', ')} WHERE IdLlave = ?`,
      [...values, id]
    );
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdLlave: id }) : fail('Llave no encontrada', 404);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const [agentes] = await pool.query('SELECT COUNT(*) AS total FROM tblAgentes WHERE IdLlave = ?', [id]);
    const total = (agentes as { total: number }[])[0].total;
    if (total > 0) {
      return fail(`No se puede eliminar: hay ${total} agente(s) usando esta llave. Reasigna o elimina esos agentes primero.`, 409);
    }

    const [result] = await pool.query('DELETE FROM tblLlaves WHERE IdLlave = ?', [id]);
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdLlave: id }) : fail('Llave no encontrada', 404);
  });
}
