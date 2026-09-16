import mysql from 'mysql2/promise';

/*
 * Pool de MySQL. La base puede estar en otro servidor: los routers y firewalls intermedios
 * descartan sesiones TCP inactivas sin avisar, y el pool entregaria conexiones muertas
 * ("read ECONNRESET"). Por eso: keepalive TCP, cierre de conexiones ociosas y un reintento.
 */

/** Cada cuanto se manda el latido TCP en conexiones inactivas. */
const KEEPALIVE_DELAY_MS = 10_000;
/** Una conexion ociosa mas tiempo que esto se cierra antes de que la red la corte. */
const IDLE_TIMEOUT_MS = 60_000;
/** Conexiones ociosas que se conservan listas. */
const MAX_IDLE = 2;
/** Errores que significan "la conexion ya no sirve": vale la pena repetir la consulta con otra. */
const CONNECTION_LOST_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ECONNREFUSED']);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'hladministrador',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'BDHLServer',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: KEEPALIVE_DELAY_MS,
  idleTimeout: IDLE_TIMEOUT_MS,
  maxIdle: MAX_IDLE,
});

function isConnectionLost(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && CONNECTION_LOST_CODES.has(code);
}

/* Reintento unico: si la consulta fallo por una conexion muerta, el pool ya la desecho y la siguiente sale limpia. */
const queryOriginal = pool.query.bind(pool);
pool.query = (async (...args: unknown[]) => {
  const ejecutar = () => (queryOriginal as (...a: unknown[]) => Promise<unknown>)(...args);
  try {
    return await ejecutar();
  } catch (error) {
    if (!isConnectionLost(error)) throw error;
    console.warn(`MySQL: conexion perdida (${(error as { code: string }).code}); se repite la consulta`);
    return ejecutar();
  }
}) as typeof pool.query;

export default pool;
