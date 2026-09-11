import { NextResponse } from 'next/server';
import pool from './db';
import { decryptSecret, hashAccessKey, keyPrefix } from './crypto';
import { getClientIp, isIpAllowed } from './ip';
import { isUuid } from './agentes';
import { isExpired } from './llaves';

export const KEY_HEADER = 'x-hl-key';
export const AGENTE_HEADER = 'x-hl-agente';
const KEY_FORMAT = /^hl_[0-9a-f]{48}$/;

type Resultado =
  | 'OK'
  | 'IP_BLOQUEADA'
  | 'KEY_INVALIDA'
  | 'AGENTE_INVALIDO'
  | 'AGENTE_INACTIVO'
  | 'LLAVE_INACTIVA'
  | 'CADUCADO'
  | 'ERROR';

interface KeyRow {
  IdKey: number;
  Nombre: string;
  Status: number;
}

interface AgenteWsRow {
  IdAgente: number;
  Uuid: string;
  Agente: string;
  AgenteStatus: number;
  Llave: string;
  Proveedor: string;
  Modelo: string;
  LlaveEncriptada: string;
  FechaCaducidad: Date | null;
  LlaveStatus: number;
}

async function log(ip: string, prefijo: string | null, idAgente: number | null, resultado: Resultado, detalle: string | null) {
  try {
    await pool.query(
      'INSERT INTO tblBitacora (IP, KeyPrefijo, IdAgente, Resultado, Detalle) VALUES (?, ?, ?, ?, ?)',
      [ip, prefijo, idAgente, resultado, detalle]
    );
  } catch (error) {
    console.error('No se pudo escribir en tblBitacora:', error);
  }
}

function deny(status: number, message: string) {
  return NextResponse.json({ success: false, data: null, error: message }, { status });
}

async function findKey(rawKey: string): Promise<KeyRow | undefined> {
  const [rows] = await pool.query(
    'SELECT IdKey, Nombre, Status FROM tblKeys WHERE KeyHash = ? LIMIT 1',
    [hashAccessKey(rawKey)]
  );
  return (rows as KeyRow[])[0];
}

async function findAgenteByUuid(uuid: string): Promise<AgenteWsRow | undefined> {
  const [rows] = await pool.query(
    `SELECT a.IdAgente, a.Uuid, a.Agente, a.Status AS AgenteStatus,
            l.Llave, l.Proveedor, l.Modelo, l.LlaveEncriptada, l.FechaCaducidad, l.Status AS LlaveStatus
     FROM tblAgentes a
     INNER JOIN tblLlaves l ON l.IdLlave = a.IdLlave
     WHERE a.Uuid = ?
     LIMIT 1`,
    [uuid]
  );
  return (rows as AgenteWsRow[])[0];
}

/**
 * Resuelve la llave para una peticion del webservice.
 * 1. La IP debe estar en la lista blanca.
 * 2. X-HL-Key debe ser una key de acceso activa (credencial de la aplicacion).
 * 3. El UUID del agente (ruta, ?uuid= o header X-HL-Agente) es obligatorio.
 * Regresa proveedor, modelo y llave de la llave a la que apunta ese agente.
 */
export async function resolveLlave(request: Request, uuidFromPath?: string): Promise<Response> {
  const ip = getClientIp(request);
  const rawKey = (request.headers.get(KEY_HEADER) || '').trim();
  const prefijo = rawKey ? keyPrefix(rawKey) : null;
  const url = new URL(request.url);
  const uuidParam = (uuidFromPath || url.searchParams.get('uuid') || request.headers.get(AGENTE_HEADER) || '').trim();

  try {
    if (!(await isIpAllowed(ip))) {
      await log(ip, prefijo, null, 'IP_BLOQUEADA', 'IP fuera de la lista blanca');
      return deny(403, 'IP no autorizada');
    }

    if (!KEY_FORMAT.test(rawKey)) {
      await log(ip, prefijo, null, 'KEY_INVALIDA', 'Header X-HL-Key ausente o con formato invalido');
      return deny(401, 'Key invalida');
    }

    const key = await findKey(rawKey);
    if (!key || key.Status !== 1) {
      await log(ip, prefijo, null, 'KEY_INVALIDA', key ? 'Key desactivada' : 'Key no registrada');
      return deny(401, 'Key invalida');
    }

    if (!uuidParam) {
      await log(ip, prefijo, null, 'AGENTE_INVALIDO', 'No se indico el UUID del agente');
      return deny(400, 'Falta el UUID del agente');
    }
    if (!isUuid(uuidParam)) {
      await log(ip, prefijo, null, 'AGENTE_INVALIDO', `UUID con formato invalido: ${uuidParam.slice(0, 50)}`);
      return deny(400, 'UUID de agente invalido');
    }

    const agente = await findAgenteByUuid(uuidParam.toLowerCase());
    if (!agente) {
      await log(ip, prefijo, null, 'AGENTE_INVALIDO', `No existe el agente ${uuidParam}`);
      return deny(404, 'Agente no encontrado');
    }
    if (agente.AgenteStatus !== 1) {
      await log(ip, prefijo, agente.IdAgente, 'AGENTE_INACTIVO', null);
      return deny(403, 'El agente esta desactivado');
    }
    if (agente.LlaveStatus !== 1) {
      await log(ip, prefijo, agente.IdAgente, 'LLAVE_INACTIVA', `Llave "${agente.Llave}" desactivada`);
      return deny(403, 'La llave del agente esta desactivada');
    }
    if (isExpired(agente.FechaCaducidad)) {
      await log(ip, prefijo, agente.IdAgente, 'CADUCADO', `Llave "${agente.Llave}" caducada`);
      return deny(403, 'La llave del agente ya caduco');
    }

    const llave = decryptSecret(agente.LlaveEncriptada);
    await pool.query('UPDATE tblKeys SET UltimoUso = NOW() WHERE IdKey = ?', [key.IdKey]);
    await log(ip, prefijo, agente.IdAgente, 'OK', `App: ${key.Nombre}`);

    return NextResponse.json(
      {
        success: true,
        data: {
          uuid: agente.Uuid,
          agente: agente.Agente,
          proveedor: agente.Proveedor,
          modelo: agente.Modelo,
          llave,
          caducidad: agente.FechaCaducidad,
        },
        error: null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('GET /api/ws/llave error:', error);
    await log(ip, prefijo, null, 'ERROR', error instanceof Error ? error.message.slice(0, 200) : 'Error desconocido');
    return deny(500, 'Error interno del servidor');
  }
}
