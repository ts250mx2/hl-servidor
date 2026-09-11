import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { fail, ok, parseId, withAuth } from '@/lib/api';

/** Rango maximo permitido para no agrupar millones de filas en una sola consulta. */
const MAX_RANGE_DAYS = 366;
/** Hasta este numero de dias se agrupa por dia; despues, por mes. */
const DAILY_MAX_DAYS = 120;
/** Hasta este numero de dias se agrupa por hora. */
const HOURLY_MAX_DAYS = 2;
const MS_POR_DIA = 86_400_000;

export type Granularidad = 'hora' | 'dia' | 'mes';

export interface SerieRow {
  periodo: string;
  IdAgente: number | null;
  Agente: string | null;
  total: number;
}

export interface PorAgenteRow {
  IdAgente: number | null;
  Agente: string | null;
  total: number;
  ok: number;
}

function parseFecha(raw: string | null, fin: boolean): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T${fin ? '23:59:59' : '00:00:00'}` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function granularidadPara(desde: Date, hasta: Date): Granularidad {
  const dias = (hasta.getTime() - desde.getTime()) / MS_POR_DIA;
  if (dias <= HOURLY_MAX_DAYS) return 'hora';
  if (dias <= DAILY_MAX_DAYS) return 'dia';
  return 'mes';
}

const FORMATO_PERIODO: Record<Granularidad, string> = {
  hora: '%Y-%m-%d %H:00',
  dia: '%Y-%m-%d',
  mes: '%Y-%m-01',
};

/**
 * GET /api/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&agente=IdAgente][&key=IdKey][&soloOk=1]
 * Llamadas al webservice agrupadas por periodo y por agente, dentro del rango.
 * La bitacora guarda el prefijo de la key, por eso el filtro por aplicacion se resuelve a KeyPrefijo.
 */
export async function GET(request: NextRequest) {
  return withAuth(async () => {
    const params = request.nextUrl.searchParams;
    const hasta = parseFecha(params.get('hasta'), true) ?? new Date();
    const desde = parseFecha(params.get('desde'), false) ?? new Date(hasta.getTime() - 30 * MS_POR_DIA);

    if (desde > hasta) return fail('La fecha inicial no puede ser mayor que la final');
    if ((hasta.getTime() - desde.getTime()) / MS_POR_DIA > MAX_RANGE_DAYS) {
      return fail(`El rango maximo es de ${MAX_RANGE_DAYS} dias`);
    }

    const idAgente = params.get('agente') ? parseId(params.get('agente') as string) : null;
    const idKey = params.get('key') ? parseId(params.get('key') as string) : null;
    const soloOk = params.get('soloOk') === '1';

    const condiciones = ['b.Fecha BETWEEN ? AND ?'];
    const valores: unknown[] = [desde, hasta];

    if (idAgente) {
      condiciones.push('b.IdAgente = ?');
      valores.push(idAgente);
    }
    if (idKey) {
      const [keys] = await pool.query('SELECT KeyPrefijo FROM tblKeys WHERE IdKey = ? LIMIT 1', [idKey]);
      const key = (keys as { KeyPrefijo: string }[])[0];
      if (!key) return fail('La aplicacion no existe', 404);
      condiciones.push('b.KeyPrefijo = ?');
      valores.push(key.KeyPrefijo);
    }
    if (soloOk) condiciones.push("b.Resultado = 'OK'");

    const where = condiciones.join(' AND ');
    const granularidad = granularidadPara(desde, hasta);
    const formato = FORMATO_PERIODO[granularidad];

    const [serie] = await pool.query(
      `SELECT DATE_FORMAT(b.Fecha, ?) AS periodo, b.IdAgente, a.Agente, COUNT(*) AS total
       FROM tblBitacora b
       LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
       WHERE ${where}
       GROUP BY periodo, b.IdAgente, a.Agente
       ORDER BY periodo, b.IdAgente`,
      [formato, ...valores]
    );

    const [porAgente] = await pool.query(
      `SELECT b.IdAgente, a.Agente, COUNT(*) AS total, SUM(b.Resultado = 'OK') AS ok
       FROM tblBitacora b
       LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
       WHERE ${where}
       GROUP BY b.IdAgente, a.Agente
       ORDER BY total DESC`,
      valores
    );

    return ok({
      desde,
      hasta,
      granularidad,
      serie: (serie as SerieRow[]).map((r) => ({ ...r, total: Number(r.total) })),
      porAgente: (porAgente as PorAgenteRow[]).map((r) => ({ ...r, total: Number(r.total), ok: Number(r.ok) })),
    });
  });
}
