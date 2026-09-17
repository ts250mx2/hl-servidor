/**
 * Verifica que la MASTER_KEY del .env descifra todo lo que hay en la base:
 * llaves de API (tblLlaves) y secretos compartidos (tblKeys).
 *
 * Uso:
 *   npm run db:verificar
 *
 * Imprime una huella de la MASTER_KEY (no la llave) para que puedas comparar
 * la copia que guardaste en tu gestor de contrasenas con la del servidor:
 * misma huella = misma llave. Termina con codigo 1 si algo no se pudo descifrar.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { decryptSecret } from '../lib/crypto';

const HUELLA_CHARS = 12;

interface Fila { id: number; nombre: string; cifrado: string | null }

function huella(masterKey: string): string {
  return createHash('sha256').update(masterKey).digest('hex').slice(0, HUELLA_CHARS);
}

async function main(): Promise<void> {
  const masterKey = (process.env.MASTER_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(masterKey)) {
    console.error('MASTER_KEY ausente o con formato invalido: debe tener 64 caracteres hex.');
    process.exit(1);
  }
  console.log(`Huella de MASTER_KEY: ${huella(masterKey)}  (compara con la copia que tienes guardada)`);

  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'BDHLServer',
    connectTimeout: 15_000,
  });

  const [llaves] = await conexion.query('SELECT IdLlave AS id, Llave AS nombre, LlaveEncriptada AS cifrado FROM tblLlaves');
  const [keys] = await conexion.query('SELECT IdKey AS id, Nombre AS nombre, SecretoCifrado AS cifrado FROM tblKeys');
  await conexion.end();

  let fallas = 0;
  const revisar = (tipo: string, filas: Fila[]) => {
    for (const f of filas) {
      if (!f.cifrado) { console.log(`  ${tipo} "${f.nombre}": sin secreto (key anterior a la migracion)`); continue; }
      try {
        decryptSecret(f.cifrado);
        console.log(`  ${tipo} "${f.nombre}": OK`);
      } catch {
        fallas++;
        console.log(`  ${tipo} "${f.nombre}": NO SE PUEDE DESCIFRAR`);
      }
    }
  };
  console.log(`\nLlaves de API (${(llaves as Fila[]).length}):`);
  revisar('llave', llaves as Fila[]);
  console.log(`\nSecretos de keys de acceso (${(keys as Fila[]).length}):`);
  revisar('key', keys as Fila[]);

  if (fallas) {
    console.error(`\n${fallas} registro(s) no se descifran con esta MASTER_KEY. Si la cambiaste, restaura la anterior; si no, esos registros hay que recapturarlos.`);
    process.exit(1);
  }
  console.log('\nTodo se descifra correctamente con la MASTER_KEY actual.');
}

main().catch((error) => {
  console.error('La verificacion fallo:', error instanceof Error ? error.message : error);
  process.exit(1);
});
