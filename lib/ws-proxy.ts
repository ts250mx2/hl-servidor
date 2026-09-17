import { decryptSecret } from './crypto';
import { apiDeRuta, getUpstream, rewriteModelInBody, type ProxyUpstream } from './proxy-providers';
import { providerApi, providerLabel } from './providers';
import { autenticarWs, denyWs, errorDetalle, llaveRespaldoUtilizable, logWs, touchKey } from './ws-auth';

/**
 * Proxy transparente: /api/ws/proxy/<uuid>/<ruta del proveedor>
 * La app usa el SDK oficial apuntando aqui. HL Console valida IP + X-HL-Key, inyecta la
 * llave real del agente, fija el modelo y reenvia bytes tal cual, incluido el streaming SSE.
 * La llave nunca sale de HL Console.
 */

/** Tiempo maximo de una llamada al proveedor; los streams largos necesitan margen. */
const PROXY_TIMEOUT_MS = 10 * 60_000;
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Headers genericos de la app que se reenvian; los de credenciales nunca. */
const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language', 'user-agent'];
/** Headers del proveedor que no deben llegar a la app: ya vienen descomprimidos o son de conexion. */
const STRIP_RESPONSE_HEADERS = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie',
]);
/**
 * Respuestas del proveedor con las que vale la pena reintentar con la llave de respaldo:
 * llave invalida o sin saldo (401/402/403), timeout (408), saturado (429) y caidas (5xx, 529 de Anthropic).
 * Un 400 o 404 es de la peticion: repetirla con otra llave daria lo mismo.
 */
const REINTENTAR_CON_RESPALDO = new Set([401, 402, 403, 408, 429, 500, 502, 503, 504, 529]);

/** Query params de credenciales que algunos SDK agregan y no deben salir. */
const STRIP_QUERY_PARAMS = ['key'];

function buildUpstreamHeaders(request: Request, forwardHeaders: string[], defaults: Record<string, string> = {}): Headers {
  const headers = new Headers();
  for (const name of [...FORWARD_HEADERS, ...forwardHeaders]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const [name, value] of Object.entries(defaults)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
}

function buildTargetUrl(baseUrl: string, path: string, requestUrl: string): string {
  const search = new URL(requestUrl).searchParams;
  for (const p of STRIP_QUERY_PARAMS) search.delete(p);
  const query = search.toString();
  return `${baseUrl}/${path}${query ? `?${query}` : ''}`;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!STRIP_RESPONSE_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  headers.set('cache-control', 'no-store');
  return headers;
}

/** Con que llave, proveedor y modelo se manda una llamada al proveedor. */
interface Destino {
  upstream: ProxyUpstream;
  nombre: string;
  proveedor: string;
  modelo: string;
  llaveCifrada: string;
}

async function enviarAlProveedor(request: Request, method: string, pathSegments: string[], body: string | undefined, destino: Destino): Promise<Response> {
  const path = destino.upstream.rewritePath(pathSegments.join('/'), destino.modelo);
  const headers = buildUpstreamHeaders(request, destino.upstream.forwardHeaders, destino.upstream.defaultHeaders);
  destino.upstream.auth(headers, decryptSecret(destino.llaveCifrada));
  return fetch(buildTargetUrl(destino.upstream.baseUrl, path, request.url), {
    method,
    headers,
    body: body === undefined ? undefined : rewriteModelInBody(body, destino.modelo),
    redirect: 'manual',
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });
}

export async function proxyRequest(request: Request, uuid: string, pathSegments: string[]): Promise<Response> {
  const auth = await autenticarWs(request, uuid);
  if (!auth.ok) return auth.response;
  const { ip, prefijo, key, agente } = auth.ctx;

  const upstream = getUpstream(agente.Proveedor);
  if (!upstream) {
    await logWs(ip, prefijo, key, agente, 'ERROR', `Proveedor "${agente.Proveedor}" sin proxy`);
    return denyWs(400, `El proveedor "${agente.Proveedor}" no se puede usar por proxy; usa /api/ws/llave`);
  }

  const method = request.method.toUpperCase();
  const path = upstream.rewritePath(pathSegments.join('/'), agente.Modelo);
  const resumen = `App: ${key.Nombre} · proxy ${method} /${path}`;

  /*
   * La app suele cachear proveedor y modelo. Si en el portal el agente cambio de proveedor
   * (Claude -> OpenAI), la app sigue mandando la ruta del SDK anterior y el proveedor nuevo
   * contestaria un 404 confuso. Mejor un 422 claro para que la app refresque su credencial
   * (422 y no 409: los SDK oficiales reintentan el 409 varias veces antes de rendirse).
   */
  const apiAgente = providerApi(agente.Proveedor);
  const apiRuta = apiDeRuta(path);
  if (apiAgente && apiRuta && apiAgente !== apiRuta) {
    const mensaje = `El agente ahora corre con ${providerLabel(agente.Proveedor)} (API ${apiAgente}) y la app llamo /${path}, que es del API ${apiRuta}. Refresca la credencial del agente y usa el SDK de ${apiAgente}.`;
    await logWs(ip, prefijo, key, agente, 'PROVEEDOR_CAMBIADO', `${resumen} · SDK ${apiRuta}`);
    return denyWs(422, mensaje, 'PROVEEDOR_CAMBIADO');
  }

  try {
    const body = METHODS_WITH_BODY.has(method) ? await request.text() : undefined;
    let destino: Destino = { upstream, nombre: agente.Llave, proveedor: agente.Proveedor, modelo: agente.Modelo, llaveCifrada: agente.LlaveEncriptada };
    let respuesta = await enviarAlProveedor(request, method, pathSegments, body, destino);
    let conRespaldo = false;

    /*
     * Llave de respaldo: si el proveedor rechazo por saldo, llave, saturacion o caida y el agente
     * tiene respaldo del mismo API, se repite la llamada con esa llave antes de contestarle a la app.
     * Solo del mismo API: la app ya mando el cuerpo en el formato de ese SDK.
     */
    const respaldo = llaveRespaldoUtilizable(agente);
    const upstreamRespaldo = respaldo ? getUpstream(respaldo.Proveedor) : null;
    if (respaldo && upstreamRespaldo && REINTENTAR_CON_RESPALDO.has(respuesta.status) && providerApi(respaldo.Proveedor) === apiAgente) {
      await logWs(ip, prefijo, key, agente, 'ERROR', `${resumen} · ${respuesta.status} · se reintenta con la llave de respaldo "${respaldo.Llave}"`);
      await respuesta.body?.cancel().catch(() => undefined);
      destino = { upstream: upstreamRespaldo, nombre: respaldo.Llave, proveedor: respaldo.Proveedor, modelo: respaldo.Modelo, llaveCifrada: respaldo.LlaveEncriptada };
      respuesta = await enviarAlProveedor(request, method, pathSegments, body, destino);
      conRespaldo = true;
    }

    await touchKey(key.IdKey);
    const atendio = conRespaldo ? { ...agente, Llave: destino.nombre, Proveedor: destino.proveedor, Modelo: destino.modelo } : agente;
    await logWs(ip, prefijo, key, atendio, respuesta.ok ? 'OK' : 'ERROR', `${resumen} · ${respuesta.status}${conRespaldo ? ` · respaldo "${destino.nombre}"` : ''}`);

    const headersRespuesta = buildResponseHeaders(respuesta);
    /* Con que proveedor y modelo se atendio: la app lo puede mostrar sin consultar /api/ws/llave. */
    headersRespuesta.set('X-HL-Proveedor', destino.proveedor);
    headersRespuesta.set('X-HL-Modelo', destino.modelo);
    if (conRespaldo) headersRespuesta.set('X-HL-Respaldo', '1');
    return new Response(respuesta.body, { status: respuesta.status, headers: headersRespuesta });
  } catch (error) {
    console.error('Proxy webservice error:', error);
    await logWs(ip, prefijo, key, agente, 'ERROR', `${resumen} · ${errorDetalle(error)}`);
    return denyWs(502, 'No se pudo contactar al proveedor');
  }
}
