import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { generateAccessKey, hashAccessKey, keyPrefix } from '@/lib/crypto';

type Ctx = { params: Promise<{ id: string }> };

/** Actualiza nombre y status. Con { Regenerar: true } genera una Key nueva. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const nombre = cleanText(body.Nombre, 80);
    if (!nombre) return fail('El nombre de la aplicacion es requerido');

    const fields = ['Nombre = ?', 'Status = ?'];
    const values: unknown[] = [nombre, parseStatus(body.Status)];
    const newKey = body.Regenerar === true ? generateAccessKey() : null;
    if (newKey) {
      fields.push('KeyHash = ?', 'KeyPrefijo = ?', 'UltimoUso = NULL');
      values.push(hashAccessKey(newKey), keyPrefix(newKey));
    }

    const [result] = await pool.query(
      `UPDATE tblKeys SET ${fields.join(', ')} WHERE IdKey = ?`,
      [...values, id]
    );
    const affected = (result as { affectedRows: number }).affectedRows;
    if (!affected) return fail('Key no encontrada', 404);
    return ok({ IdKey: id, Key: newKey });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const [result] = await pool.query('DELETE FROM tblKeys WHERE IdKey = ?', [id]);
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdKey: id }) : fail('Key no encontrada', 404);
  });
}
