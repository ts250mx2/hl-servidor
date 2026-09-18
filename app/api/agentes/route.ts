import pool from '@/lib/db';
import { cleanText, fail, ok, parseId, parseStatus, withAuth } from '@/lib/api';
import { AGENTES_LIST_SQL, generateAgenteUuid } from '@/lib/agentes';
import { registrarAuditoria } from '@/lib/auditoria';
import { leerRespaldo, nombresLlaves } from './comun';
import { leerPresupuesto, textoPresupuesto } from '@/lib/presupuesto';

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(`${AGENTES_LIST_SQL} ORDER BY a.Agente`);
    return ok(rows);
  });
}

export async function POST(request: Request) {
  return withAuth(async (user) => {
    const body = await request.json().catch(() => ({}));
    const agente = cleanText(body.Agente, 45);
    const idLlave = parseId(String(body.IdLlave ?? ''));
    if (!agente || !idLlave) return fail('Nombre del agente y Llave son requeridos');
    const respaldo = leerRespaldo(body.IdLlaveRespaldo, idLlave);
    if (respaldo === undefined) return fail('La llave de respaldo debe ser distinta de la principal');
    const presupuesto = leerPresupuesto(body);
    if (!presupuesto) return fail('Presupuesto diario o tope de llamadas invalido');

    const nombres = await nombresLlaves([idLlave, respaldo]);
    if (!nombres.has(idLlave)) return fail('La llave no existe', 404);
    if (respaldo && !nombres.has(respaldo)) return fail('La llave de respaldo no existe', 404);

    const uuid = generateAgenteUuid();
    const status = parseStatus(body.Status);
    const [result] = await pool.query(
      'INSERT INTO tblAgentes (Uuid, Agente, IdLlave, IdLlaveRespaldo, Status, PresupuestoDiarioUsd, MaxLlamadasDia) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid, agente, idLlave, respaldo, status, presupuesto.PresupuestoDiarioUsd, presupuesto.MaxLlamadasDia]
    );
    const insertId = (result as { insertId: number }).insertId;
    await registrarAuditoria({
      user, request, accion: 'CREAR', entidad: 'agente', idEntidad: insertId, nombre: agente,
      despues: { Agente: agente, LlaveNombre: nombres.get(idLlave), LlaveRespaldo: respaldo ? nombres.get(respaldo) : null, Status: status, Presupuesto: textoPresupuesto(presupuesto) },
    });
    return ok({ IdAgente: insertId, Uuid: uuid }, 201);
  });
}
