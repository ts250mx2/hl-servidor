import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { isValidIp, normalizeIp } from '@/lib/ip';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const ip = normalizeIp(cleanText(body.IP, 45));
    const descripcion = cleanText(body.Descripcion, 100);
    if (!isValidIp(ip)) return fail('IP invalida');

    const [existing] = await pool.query(
      'SELECT 1 FROM tblIPsPermitidas WHERE IP = ? AND IdIP <> ?',
      [ip, id]
    );
    if ((existing as unknown[]).length > 0) return fail('Esa IP ya esta registrada', 409);

    const [result] = await pool.query(
      'UPDATE tblIPsPermitidas SET IP = ?, Descripcion = ?, Status = ? WHERE IdIP = ?',
      [ip, descripcion || null, parseStatus(body.Status), id]
    );
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdIP: id }) : fail('IP no encontrada', 404);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withAuth(async () => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const [result] = await pool.query('DELETE FROM tblIPsPermitidas WHERE IdIP = ?', [id]);
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdIP: id }) : fail('IP no encontrada', 404);
  });
}
