import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { isValidIp, normalizeIp } from '@/lib/ip';
import { registrarAuditoria } from '@/lib/auditoria';

interface IpAuditable { IP: string; Descripcion: string | null; Status: number }

async function ipActual(id: number): Promise<IpAuditable | undefined> {
  const [rows] = await pool.query('SELECT IP, Descripcion, Status FROM tblIPsPermitidas WHERE IdIP = ?', [id]);
  return (rows as IpAuditable[])[0];
}

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
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

    const antes = await ipActual(id);
    if (!antes) return fail('IP no encontrada', 404);
    const status = parseStatus(body.Status);
    await pool.query('UPDATE tblIPsPermitidas SET IP = ?, Descripcion = ?, Status = ? WHERE IdIP = ?', [ip, descripcion || null, status, id]);
    await registrarAuditoria({ user, request, accion: 'EDITAR', entidad: 'ip', idEntidad: id, nombre: ip, antes: { ...antes }, despues: { IP: ip, Descripcion: descripcion || null, Status: status } });
    return ok({ IdIP: id });
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const antes = await ipActual(id);
    if (!antes) return fail('IP no encontrada', 404);
    await pool.query('DELETE FROM tblIPsPermitidas WHERE IdIP = ?', [id]);
    await registrarAuditoria({ user, request, accion: 'ELIMINAR', entidad: 'ip', idEntidad: id, nombre: antes.IP, antes: { ...antes } });
    return ok({ IdIP: id });
  });
}
