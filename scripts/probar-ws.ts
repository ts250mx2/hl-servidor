/**
 * Prueba del webservice /api/ws/llave.
 *
 * Uso:
 *   npm run ws -- <uuid> <key> [url] [secreto]
 *   npm run ws -- 3f9c2a7e-1b4d-4c8e-9a1f-2d5e6b7c8d9e hl_abc... http://localhost:3055 0f3a...
 *
 * Tambien acepta variables de entorno: WS_UUID, WS_KEY, WS_URL, WS_SECRET.
 * Si se da el secreto y la respuesta trae llaveCifrada, la descifra y la muestra enmascarada.
 */
import { decryptWithKey, maskSecret } from '../lib/crypto';

const [uuidArg, keyArg, urlArg, secretArg] = process.argv.slice(2);

const uuid = uuidArg || process.env.WS_UUID || '';
const key = keyArg || process.env.WS_KEY || '';
const baseUrl = (urlArg || process.env.WS_URL || 'http://localhost:3055').replace(/\/$/, '');
const secret = secretArg || process.env.WS_SECRET || '';

if (!uuid || !key) {
  console.error('Uso: npm run ws -- <uuid> <key> [url] [secreto]');
  process.exit(1);
}

interface Data {
  llave: string | null;
  llaveCifrada: string | null;
  cifrado: string | null;
}

async function main() {
  const url = `${baseUrl}/api/ws/llave/${uuid}`;
  console.log(`GET ${url}`);
  console.log(`X-HL-Key: ${key.slice(0, 8)}...`);

  const response = await fetch(url, { headers: { 'X-HL-Key': key } });
  const body = (await response.json()) as { success: boolean; data: Data | null; error: string | null };

  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (body.data?.llaveCifrada && secret) {
    const llave = decryptWithKey(body.data.llaveCifrada, Buffer.from(secret, 'hex'));
    console.log(`Llave descifrada con el secreto: ${maskSecret(llave)} (${llave.length} caracteres)`);
  } else if (body.data?.llaveCifrada) {
    console.log('La llave viene cifrada. Pasa el secreto como cuarto argumento para descifrarla.');
  }
  process.exit(response.ok ? 0 : 1);
}

main().catch((error) => {
  console.error('No se pudo conectar:', error instanceof Error ? error.message : error);
  process.exit(1);
});
