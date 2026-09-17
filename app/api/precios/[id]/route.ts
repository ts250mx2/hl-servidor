import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, withAuth } from '@/lib/api';
import { invalidarPrecios, type Precio } from '@/lib/precios';
import { registrarAuditoria, type Instantanea } from '@/lib/auditoria';
import { parsePrecio } from '../route';

type Ctx = { params: Promise<{ id: string }> };

const instantanea = (p: Precio): Instantanea => ({
  Proveedor: p.Proveedor, Modelo: p.Modelo, Entrada: Number(p.Entrada), Salida: Number(p.Salida),
  CacheLectura: Number(p.CacheLectura), CacheEscritura: Number(p.CacheEscritura), Nota: p.Nota,
});

async function precioActual(id: number): Promise<Precio | undefined> {
  const [rows] = await pool.query('SELECT * FROM tblPrecios WHERE IdPrecio = ?', [id]);
  return (rows as Precio[])[0];
}

/** Solo cambian los precios y la nota: proveedor y modelo identifican la fila. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const body = await request.json().catch(() => ({}));
    const entrada = parsePrecio(body.Entrada);
    const salida = parsePrecio(body.Salida);
    const cacheLectura = parsePrecio(body.CacheLectura ?? 0);
    const cacheEscritura = parsePrecio(body.CacheEscritura ?? 0);
    const nota = cleanText(body.Nota, 120) || null;
    if (entrada === undefined || salida === undefined || cacheLectura === undefined || cacheEscritura === undefined) {
      return fail('Los precios deben ser numeros no negativos (USD por millon de tokens)');
    }

    const antes = await precioActual(id);
    if (!antes) return fail('Precio no encontrado', 404);

    await pool.query(
      'UPDATE tblPrecios SET Entrada = ?, Salida = ?, CacheLectura = ?, CacheEscritura = ?, Nota = ? WHERE IdPrecio = ?',
      [entrada, salida, cacheLectura, cacheEscritura, nota, id]
    );
    invalidarPrecios();
    await registrarAuditoria({
      user, request, accion: 'EDITAR', entidad: 'precio', idEntidad: id, nombre: `${antes.Proveedor} ${antes.Modelo}`,
      antes: instantanea(antes),
      despues: instantanea({ ...antes, Entrada: entrada, Salida: salida, CacheLectura: cacheLectura, CacheEscritura: cacheEscritura, Nota: nota }),
    });
    return ok({ IdPrecio: id });
  });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return withAuth(async (user) => {
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Id invalido');
    const antes = await precioActual(id);
    if (!antes) return fail('Precio no encontrado', 404);
    await pool.query('DELETE FROM tblPrecios WHERE IdPrecio = ?', [id]);
    invalidarPrecios();
    await registrarAuditoria({ user, request, accion: 'ELIMINAR', entidad: 'precio', idEntidad: id, nombre: `${antes.Proveedor} ${antes.Modelo}`, antes: instantanea(antes) });
    return ok({ IdPrecio: id });
  });
}
