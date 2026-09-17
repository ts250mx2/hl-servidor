import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseDateOrNull, parseId, parseStatus, withAuth } from '@/lib/api';
import { encryptSecret } from '@/lib/crypto';
import { isProvider } from '@/lib/providers';
import { fechaTexto, registrarAuditoria, type Instantanea } from '@/lib/auditoria';

interface LlaveAuditable { Llave: string; Proveedor: string; Modelo: string; FechaCaducidad: Date | string | null; Status: number }

const instantanea = (l: LlaveAuditable): Instantanea => ({
  Llave: l.Llave, Proveedor: l.Proveedor, Modelo: l.Modelo, FechaCaducidad: fechaTexto(l.FechaCaducidad), Status: l.Status,
});

async function llaveActual(id: number): Promise<LlaveAuditable | undefined> {
  const [rows] = await pool.query('SELECT Llave, Proveedor, Modelo, FechaCaducidad, Status FROM tblLlaves WHERE IdLlave = ?', [id]);
  return (rows as LlaveAuditable[])[0];
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
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

    const antes = await llaveActual(id);
    if (!antes) return fail('Llave no encontrada', 404);

    const status = parseStatus(body.Status);
    const fields = ['Llave = ?', 'Proveedor = ?', 'Modelo = ?', 'FechaCaducidad = ?', 'Status = ?'];
    const values: unknown[] = [nombre, proveedor, modelo, fechaCaducidad, status];
    if (secreto) {
      fields.push('LlaveEncriptada = ?');
      values.push(encryptSecret(secreto));
    }

    await pool.query(`UPDATE tblLlaves SET ${fields.join(', ')} WHERE IdLlave = ?`, [...values, id]);
    await registrarAuditoria({
      user, request, accion: 'EDITAR', entidad: 'llave', idEntidad: id, nombre,
      antes: instantanea(antes),
      despues: instantanea({ Llave: nombre, Proveedor: proveedor, Modelo: modelo, FechaCaducidad: fechaCaducidad, Status: status }),
      detalle: secreto ? 'Llave de API reemplazada' : null,
    });
    return ok({ IdLlave: id });
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const [agentes] = await pool.query('SELECT COUNT(*) AS total FROM tblAgentes WHERE IdLlave = ?', [id]);
    const total = (agentes as { total: number }[])[0].total;
    if (total > 0) {
      return fail(`No se puede eliminar: hay ${total} agente(s) usando esta llave. Reasigna o elimina esos agentes primero.`, 409);
    }

    const antes = await llaveActual(id);
    if (!antes) return fail('Llave no encontrada', 404);
    await pool.query('DELETE FROM tblLlaves WHERE IdLlave = ?', [id]);
    await registrarAuditoria({ user, request, accion: 'ELIMINAR', entidad: 'llave', idEntidad: id, nombre: antes.Llave, antes: instantanea(antes) });
    return ok({ IdLlave: id });
  });
}
