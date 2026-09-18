/**
 * Revisiones programadas de alertas: llaves caducadas o por caducar y gasto del dia.
 * Las alertas de tiempo real (proveedor que rechaza, respaldo usado, presupuesto
 * agotado) las genera el proxy solo; esto cubre lo que no depende de una llamada.
 *
 * Uso:  npm run alertas:revisar
 * Programar a diario:  pm2 start npm --name hl-alertas --cron "0 8 * * *" --no-autorestart -- run alertas:revisar
 */
import 'dotenv/config';
import pool from '../lib/db';
import { revisarAlertasProgramadas, revisarGastoDiario } from '../lib/alertas';

(async () => {
  const r = await revisarAlertasProgramadas();
  await revisarGastoDiario();
  console.log(`Alertas nuevas: ${r.caducadas} llave(s) caducada(s), ${r.porCaducar} por caducar.`);
  await pool.end();
})().catch((error) => {
  console.error('La revision fallo:', error instanceof Error ? error.message : error);
  process.exit(1);
});
