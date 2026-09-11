/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Servidor propio de HL Servidor.
 * Su única razón de existir: fijar X-Forwarded-For con la IP real del socket
 * para que la lista blanca de IPs del webservice no pueda falsificarse
 * mandando la cabecera desde el cliente.
 *
 * Uso:  node server.js [--dev] [--port 3055]
 * Prioridad del puerto: --port > PORT del .env > 3055 (dev) / 3056 (producción)
 */
const { createServer } = require('http');
const next = require('next');
require('dotenv').config();

const DEFAULT_DEV_PORT = 3055;
const DEFAULT_PROD_PORT = 3056;

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const portArgIndex = args.indexOf('--port');
const portFromArg = portArgIndex >= 0 ? parseInt(args[portArgIndex + 1], 10) : NaN;
const portFromEnv = parseInt(process.env.PORT || '', 10);
const port = Number.isInteger(portFromArg)
  ? portFromArg
  : Number.isInteger(portFromEnv)
    ? portFromEnv
    : dev
      ? DEFAULT_DEV_PORT
      : DEFAULT_PROD_PORT;
const trustProxy = process.env.TRUST_PROXY === 'true';

const app = next({ dev, turbopack: dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    if (!trustProxy) {
      req.headers['x-forwarded-for'] = req.socket.remoteAddress || '';
    }
    handle(req, res);
  }).listen(port, () => {
    console.log(`> HL Servidor escuchando en http://localhost:${port} (${dev ? 'desarrollo' : 'producción'})`);
    console.log(`> TRUST_PROXY=${trustProxy}`);
  });
});
