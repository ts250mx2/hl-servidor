import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { AGENTES_LIST_SQL, type AgenteRow } from '@/lib/agentes';
import { registrarAuditoria } from '@/lib/auditoria';
import { instantaneaAgente, leerRespaldo, nombresLlaves } from '../comun';

type Ctx = { params: Promise<{ id: string }> };

async function agenteActual(id: number): Promise<AgenteRow | undefined> {
  const [rows] = await pool.query(`${AGENTES_LIST_SQL} WHERE a.IdAgente = ?`, [id]);
  return (rows as AgenteRow[])[0];
}

/** Actualiza nombre, llave destino, llave de respaldo y status. El UUID nunca cambia. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const agente = cleanText(body.Agente, 45);
    const idLlave = parseId(String(body.IdLlave ?? ''));
    if (!agente || !idLlave) return fail('Nombre del agente y Llave son requeridos');
    const respaldo = leerRespaldo(body.IdLlaveRespaldo, idLlave);
    if (respaldo === undefined) return fail('La llave de respaldo debe ser distinta de la principal');

    const nombres = await nombresLlaves([idLlave, respaldo]);
    if (!nombres.has(idLlave)) return fail('La llave no existe', 404);
    if (respaldo && !nombres.has(respaldo)) return fail('La llave de respaldo no existe', 404);

    const antes = await agenteActual(id);
    if (!antes) return fail('Agente no encontrado', 404);

    const status = parseStatus(body.Status);
    await pool.query(
      'UPDATE tblAgentes SET Agente = ?, IdLlave = ?, IdLlaveRespaldo = ?, Status = ? WHERE IdAgente = ?',
      [agente, idLlave, respaldo, status, id]
    );
    await registrarAuditoria({
      user, request, accion: 'EDITAR', entidad: 'agente', idEntidad: id, nombre: agente,
      antes: instantaneaAgente(antes),
      despues: instantaneaAgente({ Agente: agente, Llave: nombres.get(idLlave) ?? '', LlaveRespaldo: respaldo ? nombres.get(respaldo) ?? null : null, Status: status }),
    });
    return ok({ IdAgente: id });
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const antes = await agenteActual(id);
    if (!antes) return fail('Agente no encontrado', 404);
    await pool.query('DELETE FROM tblAgentes WHERE IdAgente = ?', [id]);
    await registrarAuditoria({
      user, request, accion: 'ELIMINAR', entidad: 'agente', idEntidad: id, nombre: antes.Agente,
      antes: instantaneaAgente(antes), detalle: `UUID ${antes.Uuid}`,
    });
    return ok({ IdAgente: id });
  });
}
