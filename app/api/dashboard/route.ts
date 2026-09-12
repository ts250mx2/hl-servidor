import pool from '@/lib/db';
import { ok, withAuth } from '@/lib/api';

const DAYS_WARNING = 15;
const TREND_DAYS = 7;
const LAST_CALLS = 8;

interface ProviderRow { Proveedor: string | null; total: number; ok: number }
interface LlaveProviderRow { Proveedor: string; llaves: number; agentes: number }
interface DayRow { dia: string; total: number }

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tblLlaves) AS llaves,
        (SELECT COUNT(*) FROM tblLlaves WHERE Status = 1) AS llavesActivas,
        (SELECT COUNT(*) FROM tblLlaves WHERE FechaCaducidad IS NOT NULL AND FechaCaducidad < NOW()) AS llavesCaducadas,
        (SELECT COUNT(*) FROM tblLlaves WHERE FechaCaducidad IS NOT NULL
            AND FechaCaducidad >= NOW() AND FechaCaducidad < DATE_ADD(NOW(), INTERVAL ? DAY)) AS llavesPorCaducar,
        (SELECT COUNT(*) FROM tblAgentes) AS agentes,
        (SELECT COUNT(*) FROM tblAgentes WHERE Status = 1) AS agentesActivos,
        (SELECT COUNT(*) FROM tblKeys) AS totalKeys,
        (SELECT COUNT(*) FROM tblKeys WHERE Status = 1) AS keysActivas,
        (SELECT COUNT(*) FROM tblIPsPermitidas WHERE Status = 1) AS ipsActivas,
        (SELECT COUNT(*) FROM tblBitacora WHERE Fecha >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS consultas24h,
        (SELECT COUNT(*) FROM tblBitacora WHERE Fecha >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND Resultado <> 'OK') AS rechazos24h,
        (SELECT COUNT(*) FROM tblBitacora WHERE Fecha >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS consultas7d
    `, [DAYS_WARNING, TREND_DAYS]);

    const [ultimos] = await pool.query(`
      SELECT b.Fecha, b.IP, b.KeyPrefijo, b.Aplicacion, b.Proveedor, b.Modelo, b.Resultado, a.Agente
      FROM tblBitacora b LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
      ORDER BY b.IdBitacora DESC LIMIT ?
    `, [LAST_CALLS]);

    /* Llamadas por proveedor en los ultimos dias (para la dona y el ranking). */
    const [porProveedor] = await pool.query(`
      SELECT b.Proveedor, COUNT(*) AS total, SUM(b.Resultado = 'OK') AS ok
      FROM tblBitacora b
      WHERE b.Fecha >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY b.Proveedor
      ORDER BY total DESC
    `, [TREND_DAYS]);

    /* Catalogo: cuantas llaves y agentes hay por proveedor. */
    const [catalogo] = await pool.query(`
      SELECT l.Proveedor, COUNT(DISTINCT l.IdLlave) AS llaves, COUNT(a.IdAgente) AS agentes
      FROM tblLlaves l LEFT JOIN tblAgentes a ON a.IdLlave = l.IdLlave
      GROUP BY l.Proveedor
      ORDER BY llaves DESC
    `);

    /* Tendencia diaria de llamadas. */
    const [tendencia] = await pool.query(`
      SELECT DATE_FORMAT(b.Fecha, '%Y-%m-%d') AS dia, COUNT(*) AS total
      FROM tblBitacora b
      WHERE b.Fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY dia ORDER BY dia
    `, [TREND_DAYS - 1]);

    return ok({
      ...(rows as object[])[0],
      ultimos,
      diasAviso: DAYS_WARNING,
      diasTendencia: TREND_DAYS,
      porProveedor: (porProveedor as ProviderRow[]).map((r) => ({ proveedor: r.Proveedor, total: Number(r.total), ok: Number(r.ok) })),
      catalogo: (catalogo as LlaveProviderRow[]).map((r) => ({ proveedor: r.Proveedor, llaves: Number(r.llaves), agentes: Number(r.agentes) })),
      tendencia: (tendencia as DayRow[]).map((r) => ({ dia: r.dia, total: Number(r.total) })),
    });
  });
}
