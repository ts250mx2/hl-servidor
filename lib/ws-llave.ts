import { NextResponse } from 'next/server';
import { decryptSecret, encryptWithKey } from './crypto';
import { providerApi } from './providers';
import { autenticarWs, denyWs, errorDetalle, llaveRespaldoUtilizable, logWs, touchKey } from './ws-auth';

export { KEY_HEADER, AGENTE_HEADER } from './ws-auth';

export const CIFRADO_RESPUESTA = 'aes-256-gcm';

interface EntregaLlave {
  llave: string | null;
  llaveCifrada: string | null;
  cifrado: typeof CIFRADO_RESPUESTA | null;
}

/** Con secreto compartido la llave va cifrada; sin el, en claro (compatibilidad). */
function empaquetarLlave(llave: string, secretoCifrado: string | null): EntregaLlave {
  if (!secretoCifrado) return { llave, llaveCifrada: null, cifrado: null };
  const secreto = Buffer.from(decryptSecret(secretoCifrado), 'hex');
  return { llave: null, llaveCifrada: encryptWithKey(llave, secreto), cifrado: CIFRADO_RESPUESTA };
}

/**
 * GET /api/ws/llave[/<uuid>]: entrega proveedor, modelo y llave del agente.
 * 1. La IP debe estar en la lista blanca.
 * 2. X-HL-Key debe ser una key de acceso activa (credencial de la aplicacion).
 * 3. El UUID del agente (ruta, ?uuid= o header X-HL-Agente) es obligatorio.
 * Si la key tiene secreto compartido, la llave viaja cifrada con el (llaveCifrada);
 * si no lo tiene (keys anteriores a la migracion), viaja en claro (llave).
 */
export async function resolveLlave(request: Request, uuidFromPath?: string): Promise<Response> {
  const auth = await autenticarWs(request, uuidFromPath);
  if (!auth.ok) return auth.response;
  const { ip, prefijo, key, agente } = auth.ctx;

  try {
    const llave = decryptSecret(agente.LlaveEncriptada);
    const entrega = empaquetarLlave(llave, key.SecretoCifrado);
    /* Llave de respaldo (si el agente la tiene activa): la app puede reintentar con ella si el proveedor falla. */
    const respaldo = llaveRespaldoUtilizable(agente);
    const entregaRespaldo = respaldo
      ? {
          nombre: respaldo.Llave,
          proveedor: respaldo.Proveedor,
          api: providerApi(respaldo.Proveedor),
          modelo: respaldo.Modelo,
          ...empaquetarLlave(decryptSecret(respaldo.LlaveEncriptada), key.SecretoCifrado),
          caducidad: respaldo.FechaCaducidad,
        }
      : null;
    await touchKey(key.IdKey);
    await logWs(ip, prefijo, key, agente, 'OK', `App: ${key.Nombre}${entrega.cifrado ? '' : ' (llave sin cifrar: key sin secreto)'}`);

    return NextResponse.json(
      {
        success: true,
        data: {
          uuid: agente.Uuid,
          agente: agente.Agente,
          proveedor: agente.Proveedor,
          /* API (SDK) que habla el proveedor: anthropic | openai | gemini | null. La app elige el SDK por esto, no por el nombre. */
          api: providerApi(agente.Proveedor),
          modelo: agente.Modelo,
          ...entrega,
          caducidad: agente.FechaCaducidad,
          respaldo: entregaRespaldo,
        },
        error: null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('GET /api/ws/llave error:', error);
    await logWs(ip, prefijo, key, agente, 'ERROR', errorDetalle(error));
    return denyWs(500, 'Error interno del servidor');
  }
}
