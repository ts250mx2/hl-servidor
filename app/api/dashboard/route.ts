import pool from '@/lib/db';
import { ok, withAuth } from '@/lib/api';

const DAYS_WARNING = 15;

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
        (SELECT COUNT(*) FROM tblBitacora WHERE Fecha >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND Resultado <> 'OK') AS rechazos24h
    `, [DAYS_WARNING]);

    const [ultimos] = await pool.query(`
      SELECT b.Fecha, b.IP, b.KeyPrefijo, b.Resultado, a.Agente
      FROM tblBitacora b LEFT JOIN tblAgentes a ON a.IdAgente = b.IdAgente
      ORDER BY b.IdBitacora DESC LIMIT 8
    `);

    return ok({ ...(rows as object[])[0], ultimos, diasAviso: DAYS_WARNING });
  });
}
