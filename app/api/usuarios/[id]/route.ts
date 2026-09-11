import type { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async (session) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const usuario = cleanText(body.Usuario, 80);
    const login = cleanText(body.Login, 45);
    const password = String(body.Password ?? '');
    const status = parseStatus(body.Status);
    if (!usuario || !login) return fail('Usuario y Login son requeridos');
    if (password && password.length < MIN_PASSWORD_LENGTH) return fail(`La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
    if (id === session.IdUsuario && status === 0) return fail('No puedes desactivar tu propio usuario');

    const [existing] = await pool.query('SELECT 1 FROM tblUsuarios WHERE Login = ? AND IdUsuario <> ?', [login, id]);
    if ((existing as unknown[]).length > 0) return fail('Ese login ya existe', 409);

    const fields = ['Usuario = ?', 'Login = ?', 'Status = ?'];
    const values: unknown[] = [usuario, login, status];
    if (password) {
      fields.push('Password = ?');
      values.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
    }

    const [result] = await pool.query(
      `UPDATE tblUsuarios SET ${fields.join(', ')} WHERE IdUsuario = ?`,
      [...values, id]
    );
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdUsuario: id }) : fail('Usuario no encontrado', 404);
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withAuth(async (session) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    if (id === session.IdUsuario) return fail('No puedes eliminar tu propio usuario');
    const [result] = await pool.query('DELETE FROM tblUsuarios WHERE IdUsuario = ?', [id]);
    const affected = (result as { affectedRows: number }).affectedRows;
    return affected ? ok({ IdUsuario: id }) : fail('Usuario no encontrado', 404);
  });
}
