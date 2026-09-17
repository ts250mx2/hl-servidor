import { NextResponse } from 'next/server';
import pool from './db';
import { hashAccessKey, keyPrefix } from './crypto';
import { getClientIp, isIpAllowed } from './ip';
import { isUuid } from './agentes';
import { isExpired } from './llaves';

/**
 * Autenticacion comun de los webservices (/api/ws/llave y /api/ws/proxy):
 * IP en lista blanca, X-HL-Key activa y agente por UUID con llave vigente.
 */

export const KEY_HEADER = 'x-hl-key';
export const AGENTE_HEADER = 'x-hl-agente';
const KEY_FORMAT = /^hl_[0-9a-f]{48}$/;
const MAX_DETALLE = 200;

export type Resultado =
  | 'OK'
  | 'IP_BLOQUEADA'
  | 'KEY_INVALIDA'
  | 'AGENTE_INVALIDO'
  | 'AGENTE_INACTIVO'
  | 'LLAVE_INACTIVA'
  | 'CADUCADO'
  | 'PROVEEDOR_CAMBIADO'
  | 'ERROR';

export interface KeyRow {
  IdKey: number;
  Nombre: string;
  Status: number;
  SecretoCifrado: string | null;
}

export interface AgenteWsRow {
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
  /* Llave de respaldo del agente (LEFT JOIN): nulos si no tiene. */
  RespaldoIdLlave: number | null;
  RespaldoLlave: string | null;
  RespaldoProveedor: string | null;
  RespaldoModelo: string | null;
  RespaldoLlaveEncriptada: string | null;
  RespaldoFechaCaducidad: Date | null;
  RespaldoStatus: number | null;
}

export interface LlaveRespaldo {
  IdLlave: number;
  Llave: string;
  Proveedor: string;
  Modelo: string;
  LlaveEncriptada: string;
  FechaCaducidad: Date | null;
}

/** La llave de respaldo del agente si existe, esta activa y no ha caducado. */
export function llaveRespaldoUtilizable(a: AgenteWsRow): LlaveRespaldo | null {
  if (!a.RespaldoIdLlave || !a.RespaldoLlave || !a.RespaldoProveedor || !a.RespaldoModelo || !a.RespaldoLlaveEncriptada) return null;
  if (a.RespaldoStatus !== 1 || isExpired(a.RespaldoFechaCaducidad)) return null;
  return {
    IdLlave: a.RespaldoIdLlave,
    Llave: a.RespaldoLlave,
    Proveedor: a.RespaldoProveedor,
    Modelo: a.RespaldoModelo,
    LlaveEncriptada: a.RespaldoLlaveEncriptada,
    FechaCaducidad: a.RespaldoFechaCaducidad,
  };
}

export interface WsContext {
  ip: string;
  prefijo: string | null;
  key: KeyRow;
  agente: AgenteWsRow;
}

export type WsAuthResult = { ok: true; ctx: WsContext } | { ok: false; response: Response };

/**
 * Registra la llamada. Si ya se conocen la key y el agente, guarda tambien la aplicacion,
 * el proveedor y el modelo del momento (el historico no cambia aunque despues se editen).
 */
export async function logWs(
  ip: string,
  prefijo: string | null,
  key: KeyRow | null,
  agente: AgenteWsRow | null,
  resultado: Resultado,
  detalle: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tblBitacora (IP, KeyPrefijo, IdKey, Aplicacion, IdAgente, Proveedor, Modelo, Resultado, Detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ip,
        prefijo,
        key?.IdKey ?? null,
        key?.Nombre ?? null,
        agente?.IdAgente ?? null,
        agente?.Proveedor ?? null,
        agente?.Modelo ?? null,
        resultado,
        detalle ? detalle.slice(0, MAX_DETALLE) : null,
      ]
    );
  } catch (error) {
    console.error('No se pudo escribir en tblBitacora:', error);
  }
}

/** Header con el codigo de rechazo, para que las apps lo distingan sin parsear el mensaje. */
export const HL_ERROR_HEADER = 'X-HL-Error';

export function denyWs(status: number, message: string, code?: string): Response {
  const headers = code ? { [HL_ERROR_HEADER]: code } : undefined;
  return NextResponse.json({ success: false, data: null, error: message, code: code ?? null }, { status, headers });
}

export function errorDetalle(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, MAX_DETALLE) : 'Error desconocido';
}

async function findKey(rawKey: string): Promise<KeyRow | undefined> {
  const [rows] = await pool.query(
    'SELECT IdKey, Nombre, Status, SecretoCifrado FROM tblKeys WHERE KeyHash = ? LIMIT 1',
    [hashAccessKey(rawKey)]
  );
  return (rows as KeyRow[])[0];
}

async function findAgenteByUuid(uuid: string): Promise<AgenteWsRow | undefined> {
  const [rows] = await pool.query(
    `SELECT a.IdAgente, a.Uuid, a.Agente, a.Status AS AgenteStatus,
            l.Llave, l.Proveedor, l.Modelo, l.LlaveEncriptada, l.FechaCaducidad, l.Status AS LlaveStatus,
            r.IdLlave AS RespaldoIdLlave, r.Llave AS RespaldoLlave, r.Proveedor AS RespaldoProveedor, r.Modelo AS RespaldoModelo,
            r.LlaveEncriptada AS RespaldoLlaveEncriptada, r.FechaCaducidad AS RespaldoFechaCaducidad, r.Status AS RespaldoStatus
     FROM tblAgentes a
     INNER JOIN tblLlaves l ON l.IdLlave = a.IdLlave
     LEFT JOIN tblLlaves r ON r.IdLlave = a.IdLlaveRespaldo
     WHERE a.Uuid = ?
     LIMIT 1`,
    [uuid]
  );
  return (rows as AgenteWsRow[])[0];
}

/** Marca la key como usada. Se llama solo cuando la peticion fue atendida. */
export async function touchKey(idKey: number): Promise<void> {
  await pool.query('UPDATE tblKeys SET UltimoUso = NOW() WHERE IdKey = ?', [idKey]);
}

/**
 * Valida IP, key y agente. Si algo falla, regresa la respuesta de rechazo ya registrada en bitacora.
 * El UUID puede venir en la ruta, en ?uuid= o en el header X-HL-Agente.
 */
export async function autenticarWs(request: Request, uuidFromPath?: string): Promise<WsAuthResult> {
  const ip = getClientIp(request);
  const rawKey = (request.headers.get(KEY_HEADER) || '').trim();
  const prefijo = rawKey ? keyPrefix(rawKey) : null;
  const url = new URL(request.url);
  const uuidParam = (uuidFromPath || url.searchParams.get('uuid') || request.headers.get(AGENTE_HEADER) || '').trim();

  let keyActual: KeyRow | null = null;
  const rechazo = async (status: number, message: string, resultado: Resultado, detalle: string | null, agente: AgenteWsRow | null = null) => {
    await logWs(ip, prefijo, keyActual, agente, resultado, detalle);
    return { ok: false as const, response: denyWs(status, message) };
  };

  try {
    if (!(await isIpAllowed(ip))) return rechazo(403, 'IP no autorizada', 'IP_BLOQUEADA', 'IP fuera de la lista blanca');

    if (!KEY_FORMAT.test(rawKey)) {
      return rechazo(401, 'Key invalida', 'KEY_INVALIDA', 'Header X-HL-Key ausente o con formato invalido');
    }
    const key = await findKey(rawKey);
    if (!key || key.Status !== 1) {
      return rechazo(401, 'Key invalida', 'KEY_INVALIDA', key ? 'Key desactivada' : 'Key no registrada');
    }
    keyActual = key;

    if (!uuidParam) return rechazo(400, 'Falta el UUID del agente', 'AGENTE_INVALIDO', 'No se indico el UUID del agente');
    if (!isUuid(uuidParam)) {
      return rechazo(400, 'UUID de agente invalido', 'AGENTE_INVALIDO', `UUID con formato invalido: ${uuidParam.slice(0, 50)}`);
    }

    const agente = await findAgenteByUuid(uuidParam.toLowerCase());
    if (!agente) return rechazo(404, 'Agente no encontrado', 'AGENTE_INVALIDO', `No existe el agente ${uuidParam}`);
    if (agente.AgenteStatus !== 1) return rechazo(403, 'El agente esta desactivado', 'AGENTE_INACTIVO', null, agente);
    if (agente.LlaveStatus !== 1) {
      return rechazo(403, 'La llave del agente esta desactivada', 'LLAVE_INACTIVA', `Llave "${agente.Llave}" desactivada`, agente);
    }
    if (isExpired(agente.FechaCaducidad)) {
      return rechazo(403, 'La llave del agente ya caduco', 'CADUCADO', `Llave "${agente.Llave}" caducada`, agente);
    }

    return { ok: true, ctx: { ip, prefijo, key, agente } };
  } catch (error) {
    console.error('Webservice: error al autenticar:', error);
    return rechazo(500, 'Error interno del servidor', 'ERROR', errorDetalle(error));
  }
}
