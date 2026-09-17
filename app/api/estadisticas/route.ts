import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { fail, ok, parseId, withAuth } from '@/lib/api';

/** Rango maximo permitido para no agrupar millones de filas en una sola consulta. */
const MAX_RANGE_DAYS = 366;
/** Hasta este numero de dias se agrupa por dia; despues, por mes. */
const DAILY_MAX_DAYS = 120;
/** Hasta este numero de dias se agrupa por hora. */
const HOURLY_MAX_DAYS = 3;
const MS_POR_DIA = 86_400_000;
const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type Granularidad = 'hora' | 'dia' | 'mes';
export type Agrupar = 'agente' | 'aplicacion' | 'proveedor' | 'modelo';

export interface SerieRow {
  periodo: string;
  clave: string | null;
  etiqueta: string | null;
  total: number;
  costo: number;
  tokens: number;
  duracionProm: number | null;
}

export interface PorGrupoRow {
  clave: string | null;
  etiqueta: string | null;
  total: number;
  ok: number;
  costo: number;
  tokens: number;
  duracionProm: number | null;
  duracionMax: number | null;
  /** Llamadas con tokens pero sin precio para el modelo (gasto no estimado). */
  sinPrecio: number;
}

/** Sumas de uso que comparten la serie y el agrupado. */
const USO_SQL = `SUM(b.CostoUsd) AS costo,
       SUM(IFNULL(b.TokensEntrada, 0) + IFNULL(b.TokensSalida, 0) + IFNULL(b.TokensCacheLectura, 0) + IFNULL(b.TokensCacheEscritura, 0)) AS tokens,
       AVG(b.DuracionMs) AS duracionProm`;

/** Acepta "YYYY-MM-DD" (dia completo) o "YYYY-MM-DDTHH:mm" (minuto completo). */
function parseFecha(raw: string | null, fin: boolean): Date | null {
  if (!raw) return null;
  let texto = raw;
  if (raw.length === 10) texto = `${raw}T${fin ? '23:59:59' : '00:00:00'}`;
  else if (DATETIME_LOCAL_RE.test(raw)) texto = `${raw}:${fin ? '59' : '00'}`;
  const d = new Date(texto);
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

/** Expresiones SQL de clave y etiqueta para cada dimension de agrupacion. */
const DIMENSIONES: Record<Agrupar, { clave: string; etiqueta: string }> = {
  agente: { clave: 'CAST(b.IdAgente AS CHAR)', etiqueta: 'a.Agente' },
  aplicacion: { clave: 'CAST(b.IdKey AS CHAR)', etiqueta: 'b.Aplicacion' },
  proveedor: { clave: 'b.Proveedor', etiqueta: 'b.Proveedor' },
  modelo: { clave: 'b.Modelo', etiqueta: 'b.Modelo' },
};

function parseAgrupar(raw: string | null): Agrupar {
  return raw === 'aplicacion' || raw === 'proveedor' || raw === 'modelo' ? raw : 'agente';
}

/**
 * GET /api/estadisticas?desde=&hasta=[&agente=IdAgente][&key=IdKey][&soloOk=1][&agrupar=agente|aplicacion|proveedor|modelo]
 * Llamadas al webservice agrupadas por periodo y por la dimension elegida, dentro del rango.
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
    const agrupar = parseAgrupar(params.get('agrupar'));
    const dim = DIMENSIONES[agrupar];

    const condiciones = ['b.Fecha BETWEEN ? AND ?'];
    const valores: unknown[] = [desde, hasta];

    if (idAgente) {
      condiciones.push('b.IdAgente = ?');
      valores.push(idAgente);
    }
    if (idKey) {
      condiciones.push('b.IdKey = ?');
      valores.push(idKey);
    }
    if (soloOk) condiciones.push("b.Resultado = 'OK'");

    const where = condiciones.join(' AND ');
    const granularidad = granularidadPara(desde, hasta);
    const formato = FORMATO_PERIODO[granularidad];

    const [serie] = await pool.query(
      `SELECT DATE_FORMAT(b.Fecha, ?) AS periodo, ${dim.clave} AS clave, ${dim.etiqueta} AS etiqueta, COUNT(*) AS total, ${USO_SQL}
       FROM tblBitacora b
       LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
       WHERE ${where}
       GROUP BY periodo, clave, etiqueta
       ORDER BY periodo, clave`,
      [formato, ...valores]
    );

    const [porGrupo] = await pool.query(
      `SELECT ${dim.clave} AS clave, ${dim.etiqueta} AS etiqueta, COUNT(*) AS total, SUM(b.Resultado = 'OK') AS ok, ${USO_SQL},
              MAX(b.DuracionMs) AS duracionMax, SUM(b.TokensSalida IS NOT NULL AND b.CostoUsd IS NULL) AS sinPrecio
       FROM tblBitacora b
       LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
       WHERE ${where}
       GROUP BY clave, etiqueta
       ORDER BY total DESC`,
      valores
    );

    return ok({
      desde,
      hasta,
      granularidad,
      agrupar,
      serie: (serie as SerieRow[]).map((r) => ({ ...r, total: Number(r.total), costo: Number(r.costo ?? 0), tokens: Number(r.tokens ?? 0), duracionProm: r.duracionProm === null ? null : Number(r.duracionProm) })),
      porGrupo: (porGrupo as PorGrupoRow[]).map((r) => ({
        ...r, total: Number(r.total), ok: Number(r.ok), costo: Number(r.costo ?? 0), tokens: Number(r.tokens ?? 0),
        duracionProm: r.duracionProm === null ? null : Number(r.duracionProm), duracionMax: r.duracionMax === null ? null : Number(r.duracionMax), sinPrecio: Number(r.sinPrecio ?? 0),
      })),
    });
  });
}
