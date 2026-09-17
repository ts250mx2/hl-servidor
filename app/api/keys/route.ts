import pool from '@/lib/db';
import { cleanText, fail, ok, parseStatus, withAuth } from '@/lib/api';
import { encryptSecret, generateAccessKey, generateSharedSecret, hashAccessKey, keyPrefix } from '@/lib/crypto';
import { registrarAuditoria } from '@/lib/auditoria';

export async function GET() {
  return withAuth(async () => {
    const [rows] = await pool.query(
      `SELECT IdKey, Nombre, KeyPrefijo, Status, UltimoUso, FechaAlta,
              (SecretoCifrado IS NOT NULL) AS TieneSecreto
       FROM tblKeys ORDER BY Nombre`
    );
    return ok(rows);
  });
}

/**
 * Crea una Key nueva junto con su secreto compartido. Ambos se regresan UNA sola vez:
 * de la Key queda el hash y el secreto queda cifrado con MASTER_KEY.
 */
export async function POST(request: Request) {
  return withAuth(async (user) => {
    const body = await request.json().catch(() => ({}));
    const nombre = cleanText(body.Nombre, 80);
    if (!nombre) return fail('El nombre de la aplicacion es requerido');

    const key = generateAccessKey();
    const secreto = generateSharedSecret();
    const [result] = await pool.query(
      'INSERT INTO tblKeys (Nombre, KeyHash, KeyPrefijo, SecretoCifrado, Status) VALUES (?, ?, ?, ?, ?)',
      [nombre, hashAccessKey(key), keyPrefix(key), encryptSecret(secreto), parseStatus(body.Status)]
    );
    const insertId = (result as { insertId: number }).insertId;
    await registrarAuditoria({
      user, request, accion: 'CREAR', entidad: 'key', idEntidad: insertId, nombre,
      despues: { Nombre: nombre, Status: parseStatus(body.Status) }, detalle: `Key ${keyPrefix(key)}…`,
    });
    return ok({ IdKey: insertId, Key: key, Secreto: secreto }, 201);
  });
}
