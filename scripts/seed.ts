/**
 * Crea el usuario admin y las IPs iniciales si la base esta vacia.
 * Uso:  npm run seed
 * Requiere que db/BDHLServer.sql ya se haya ejecutado y que .env tenga las credenciales.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../lib/db';

const BCRYPT_ROUNDS = 10;
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin123';
const INITIAL_IPS: [string, string][] = [
  ['127.0.0.1', 'Localhost'],
  ['::1', 'Localhost IPv6'],
  ['201.172.236.128', 'IP publica del servidor'],
];

async function seed() {
  try {
    const [users] = await pool.query('SELECT COUNT(*) AS total FROM tblUsuarios');
    if ((users as { total: number }[])[0].total === 0) {
      console.log(`Creando usuario ${ADMIN_LOGIN} / ${ADMIN_PASSWORD} ...`);
      await pool.query(
        'INSERT INTO tblUsuarios (Usuario, Login, Password, Status) VALUES (?, ?, ?, 1)',
        ['Administrador', ADMIN_LOGIN, bcrypt.hashSync(ADMIN_PASSWORD, BCRYPT_ROUNDS)]
      );
    } else {
      console.log('tblUsuarios ya tiene usuarios, no se toca.');
    }

    for (const [ip, descripcion] of INITIAL_IPS) {
      await pool.query('INSERT IGNORE INTO tblIPsPermitidas (IP, Descripcion, Status) VALUES (?, ?, 1)', [ip, descripcion]);
    }
    console.log('IPs iniciales verificadas.');
    console.log('Listo.');
  } catch (error) {
    console.error('Error al sembrar la base:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
