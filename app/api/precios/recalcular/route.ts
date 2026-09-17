import { ok, withAuth } from '@/lib/api';
import { recalcularCostos } from '@/lib/precios';
import { registrarAuditoria } from '@/lib/auditoria';

/** POST /api/precios/recalcular: vuelve a calcular el gasto de la bitacora con los precios actuales. */
export async function POST(request: Request) {
  return withAuth(async (user) => {
    const resultado = await recalcularCostos();
    await registrarAuditoria({
      user, request, accion: 'EDITAR', entidad: 'precio', nombre: 'Recalculo de gasto',
      detalle: `${resultado.actualizadas} llamada(s) actualizada(s) de ${resultado.revisadas}; ${resultado.sinPrecio} sin precio`,
    });
    return ok(resultado);
  });
}
