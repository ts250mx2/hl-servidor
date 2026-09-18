import { ok, withAuth } from '@/lib/api';
import { revisarAlertasProgramadas, revisarGastoDiario } from '@/lib/alertas';

/** POST /api/alertas/revisar: corre ahora las revisiones programadas (caducidad de llaves, gasto del dia). */
export async function POST() {
  return withAuth(async () => {
    const llaves = await revisarAlertasProgramadas();
    await revisarGastoDiario();
    return ok(llaves);
  });
}
