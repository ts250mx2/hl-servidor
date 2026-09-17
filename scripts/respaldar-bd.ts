/**
 * Respaldo de la base BDHLServer sin depender de mysqldump: vuelca esquema y
 * datos de todas las tablas a un .sql.gz con la fecha en el nombre y borra los
 * respaldos mas viejos que RESPALDOS_DIAS.
 *
 * Uso:
 *   npm run db:respaldar
 *
 * Variables (.env):
 *   RESPALDOS_DIR   carpeta destino (default ./respaldos)
 *   RESPALDOS_DIAS  dias que se conservan (default 14)
 *
 * Programarlo: PM2 (Linux)  pm2 start npm --name hl-respaldo --cron "0 3 * * *" --no-autorestart -- run db:respaldar
 *              Windows      Programador de tareas -> npm run db:respaldar en la carpeta del proyecto
 *
 * Restaurar:  zcat respaldos/BDHLServer-AAAAMMDD-HHMMSS.sql.gz | mysql -u usuario -p
 *             (el archivo trae USE BDHLServer y DROP/CREATE de cada tabla)
 *
 * IMPORTANTE: el respaldo de la base NO sirve sin MASTER_KEY: las llaves de API
 * estan cifradas con ella. Guarda MASTER_KEY aparte (gestor de contrasenas).
 */
import 'dotenv/config';
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import mysql from 'mysql2/promise';

const DEFAULT_DIAS = 14;
const LOTE = 500;
const MS_POR_DIA = 86_400_000;

const dir = resolve(process.env.RESPALDOS_DIR || 'respaldos');
const dias = Number(process.env.RESPALDOS_DIAS) > 0 ? Number(process.env.RESPALDOS_DIAS) : DEFAULT_DIAS;
const baseDatos = process.env.DB_NAME || 'BDHLServer';

const sello = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function escribir(stream: NodeJS.WritableStream, texto: string): Promise<void> {
  return new Promise((res) => {
    if (!stream.write(texto)) stream.once('drain', res);
    else res();
  });
}

async function main(): Promise<void> {
  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: baseDatos,
    connectTimeout: 15_000,
  });

  mkdirSync(dir, { recursive: true });
  const archivo = join(dir, `${baseDatos}-${sello()}.sql.gz`);
  const gzip = createGzip({ level: 9 });
  const salida = createWriteStream(archivo);
  gzip.pipe(salida);

  await escribir(gzip, `-- Respaldo de ${baseDatos} generado por HL Console el ${new Date().toISOString()}\n`);
  await escribir(gzip, `CREATE DATABASE IF NOT EXISTS \`${baseDatos}\` CHARACTER SET utf8mb4;\nUSE \`${baseDatos}\`;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`);

  const [tablas] = await conexion.query('SHOW TABLES');
  const nombres = (tablas as Record<string, string>[]).map((t) => Object.values(t)[0]);
  let totalFilas = 0;

  for (const tabla of nombres) {
    const [def] = await conexion.query(`SHOW CREATE TABLE \`${tabla}\``);
    const createSql = (def as { 'Create Table': string }[])[0]['Create Table'];
    await escribir(gzip, `DROP TABLE IF EXISTS \`${tabla}\`;\n${createSql};\n\n`);

    const [filas] = await conexion.query(`SELECT * FROM \`${tabla}\``);
    const registros = filas as Record<string, unknown>[];
    for (let i = 0; i < registros.length; i += LOTE) {
      const lote = registros.slice(i, i + LOTE);
      const columnas = Object.keys(lote[0]).map((c) => `\`${c}\``).join(', ');
      const valores = lote.map((r) => `(${Object.values(r).map((v) => conexion.escape(v)).join(', ')})`).join(',\n');
      await escribir(gzip, `INSERT INTO \`${tabla}\` (${columnas}) VALUES\n${valores};\n`);
    }
    if (registros.length) await escribir(gzip, '\n');
    totalFilas += registros.length;
    console.log(`  ${tabla}: ${registros.length} filas`);
  }

  await escribir(gzip, 'SET FOREIGN_KEY_CHECKS = 1;\n');
  await new Promise<void>((res, rej) => { salida.on('finish', res); salida.on('error', rej); gzip.end(); });
  await conexion.end();

  const tamano = (statSync(archivo).size / 1024).toFixed(1);
  console.log(`\nRespaldo listo: ${archivo} (${tamano} KB, ${nombres.length} tablas, ${totalFilas} filas)`);

  // Rotacion: se conservan solo los ultimos RESPALDOS_DIAS dias.
  const limite = Date.now() - dias * MS_POR_DIA;
  let borrados = 0;
  for (const nombre of readdirSync(dir)) {
    if (!nombre.startsWith(`${baseDatos}-`) || !nombre.endsWith('.sql.gz')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).mtimeMs < limite) { unlinkSync(ruta); borrados++; }
  }
  if (borrados) console.log(`Se borraron ${borrados} respaldo(s) con mas de ${dias} dias.`);
}

main().catch((error) => {
  console.error('El respaldo fallo:', error instanceof Error ? error.message : error);
  process.exit(1);
});
