import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { encryptSecret, generateAccessKey, generateSharedSecret, hashAccessKey, keyPrefix } from '@/lib/crypto';
import { registrarAuditoria } from '@/lib/auditoria';
import { agentesPorKey, guardarAgentesDeKey, leerAgentes, nombresAgentes, textoAgentes } from '../comun';

interface KeyAuditable { Nombre: string; Status: number; KeyPrefijo: string }

async function keyActual(id: number): Promise<KeyAuditable | undefined> {
  const [rows] = await pool.query('SELECT Nombre, Status, KeyPrefijo FROM tblKeys WHERE IdKey = ?', [id]);
  return (rows as KeyAuditable[])[0];
}

type Ctx = { params: Promise<{ id: string }> };

/** Actualiza nombre y status. Con { Regenerar: true } genera Key y secreto nuevos. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');

    const body = await request.json().catch(() => ({}));
    const nombre = cleanText(body.Nombre, 80);
    if (!nombre) return fail('El nombre de la aplicacion es requerido');

    const agentesIds = leerAgentes(body.Agentes);
    if (agentesIds === undefined) return fail('Agentes invalidos');
    const nombres = await nombresAgentes(agentesIds);
    if (nombres.size !== agentesIds.length) return fail('Alguno de los agentes no existe', 404);

    const antes = await keyActual(id);
    if (!antes) return fail('Key no encontrada', 404);
    const agentesAntes = (await agentesPorKey()).get(id) ?? [];

    const status = parseStatus(body.Status);
    const fields = ['Nombre = ?', 'Status = ?'];
    const values: unknown[] = [nombre, status];
    const newKey = body.Regenerar === true ? generateAccessKey() : null;
    const newSecret = newKey ? generateSharedSecret() : null;
    if (newKey && newSecret) {
      fields.push('KeyHash = ?', 'KeyPrefijo = ?', 'SecretoCifrado = ?', 'UltimoUso = NULL');
      values.push(hashAccessKey(newKey), keyPrefix(newKey), encryptSecret(newSecret));
    }

    const [result] = await pool.query(
      `UPDATE tblKeys SET ${fields.join(', ')} WHERE IdKey = ?`,
      [...values, id]
    );
    const affected = (result as { affectedRows: number }).affectedRows;
    if (!affected) return fail('Key no encontrada', 404);
    await guardarAgentesDeKey(id, agentesIds);
    await registrarAuditoria({
      user, request, accion: newKey ? 'REGENERAR' : 'EDITAR', entidad: 'key', idEntidad: id, nombre,
      antes: { Nombre: antes.Nombre, Status: antes.Status, Agentes: textoAgentes(agentesAntes.map((a) => a.Agente)) },
      despues: { Nombre: nombre, Status: status, Agentes: textoAgentes([...nombres.values()]) },
      detalle: newKey ? `Key y secreto nuevos (${antes.KeyPrefijo}… -> ${keyPrefix(newKey)}…)` : null,
    });
    return ok({ IdKey: id, Key: newKey, Secreto: newSecret });
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const antes = await keyActual(id);
    if (!antes) return fail('Key no encontrada', 404);
    await pool.query('DELETE FROM tblKeys WHERE IdKey = ?', [id]);
    await registrarAuditoria({ user, request, accion: 'ELIMINAR', entidad: 'key', idEntidad: id, nombre: antes.Nombre, antes: { Nombre: antes.Nombre, Status: antes.Status }, detalle: `Key ${antes.KeyPrefijo}…` });
    return ok({ IdKey: id });
  });
}
