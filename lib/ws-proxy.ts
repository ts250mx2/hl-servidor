import { decryptSecret } from './crypto';
import { apiDeRuta, getUpstream, rewriteModelInBody } from './proxy-providers';
import { providerApi, providerLabel } from './providers';
import { autenticarWs, denyWs, errorDetalle, logWs, touchKey } from './ws-auth';

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
    const llave = decryptSecret(agente.LlaveEncriptada);
    const headers = buildUpstreamHeaders(request, upstream.forwardHeaders, upstream.defaultHeaders);
    upstream.auth(headers, llave);

    const body = METHODS_WITH_BODY.has(method) ? rewriteModelInBody(await request.text(), agente.Modelo) : undefined;
    const target = buildTargetUrl(upstream.baseUrl, path, request.url);

    const respuesta = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    await touchKey(key.IdKey);
    await logWs(ip, prefijo, key, agente, respuesta.ok ? 'OK' : 'ERROR', `${resumen} · ${respuesta.status}`);

    return new Response(respuesta.body, { status: respuesta.status, headers: buildResponseHeaders(respuesta) });
  } catch (error) {
    console.error('Proxy webservice error:', error);
    await logWs(ip, prefijo, key, agente, 'ERROR', `${resumen} · ${errorDetalle(error)}`);
    return denyWs(502, 'No se pudo contactar al proveedor');
  }
}
