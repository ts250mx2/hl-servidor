/**
 * Prueba del webservice /api/ws/llave.
 *
 * Uso:
 *   npm run ws -- <uuid> <key> [url]
 *   npm run ws -- 3f9c2a7e-1b4d-4c8e-9a1f-2d5e6b7c8d9e hl_abc... http://localhost:3055
 *
 * Tambien acepta variables de entorno: WS_UUID, WS_KEY, WS_URL.
 */
const [uuidArg, keyArg, urlArg] = process.argv.slice(2);

const uuid = uuidArg || process.env.WS_UUID || '';
const key = keyArg || process.env.WS_KEY || '';
const baseUrl = (urlArg || process.env.WS_URL || 'http://localhost:3055').replace(/\/$/, '');

if (!uuid || !key) {
  console.error('Uso: npm run ws -- <uuid> <key> [url]');
  process.exit(1);
}

async function main() {
  const url = `${baseUrl}/api/ws/llave/${uuid}`;
  console.log(`GET ${url}`);
  console.log(`X-HL-Key: ${key.slice(0, 8)}...`);

  const response = await fetch(url, { headers: { 'X-HL-Key': key } });
  const body = await response.json();

  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(response.ok ? 0 : 1);
}

main().catch((error) => {
  console.error('No se pudo conectar:', error instanceof Error ? error.message : error);
  process.exit(1);
});
