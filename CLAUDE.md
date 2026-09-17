<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# HL Console - Administrador de llaves de IA

- Portal Next.js 16 (App Router) + MySQL (BDHLServer). Misma estructura que tapioki-pos.
- `server.js` es un servidor propio: fija `x-forwarded-for` desde el socket para que la lista blanca de IPs no se pueda falsificar.
- Las llaves de API se cifran con AES-256-GCM usando `MASTER_KEY` del `.env`. Nunca se regresan al navegador.
- Modelo de datos: `tblLlaves` (proveedor + modelo + llave cifrada) <- `tblAgentes` (nombre + Uuid + IdLlave). `tblKeys` es solo la credencial de cada app.
- El webservice `/api/ws/llave/<uuid>` (o `?uuid=` / header `X-HL-Agente`) exige `X-HL-Key` valida, IP en `tblIPsPermitidas` y el UUID del agente; regresa proveedor, `api` (anthropic | openai | gemini | null: con que SDK se habla, las apps deben elegir el SDK por este campo y no por el nombre del proveedor), modelo y llave de la llave del agente. Logica en `lib/ws-llave.ts`.
- Cada Key tiene un secreto compartido (`tblKeys.SecretoCifrado`, cifrado con `MASTER_KEY`, se muestra una sola vez). El webservice regresa la llave de API cifrada con ese secreto (`llaveCifrada`, AES-256-GCM) y `cliente/hl-cliente.ts` la descifra con `HL_SECRET`. Keys sin secreto reciben `llave` en claro. Migracion: `db/migracion-secreto.sql`.
- Proxy transparente `/api/ws/proxy/<uuid>/<ruta>` (`lib/ws-proxy.ts`, destinos en `lib/proxy-providers.ts`): misma autenticacion (`lib/ws-auth.ts`, compartida con `/api/ws/llave`), inyecta la llave del agente, sustituye `model` por el del agente y reenvia la respuesta en streaming sin interpretarla, con headers `X-HL-Proveedor` y `X-HL-Modelo`. Las apps usan el SDK oficial con `baseURL` al proxy (`configProxy()` en `cliente/hl-cliente.ts`). Si la ruta que manda la app es de otro API que el del proveedor actual del agente (`apiDeRuta` vs `providerApi`), el proxy responde 422 `PROVEEDOR_CAMBIADO` (los SDK no lo reintentan, a diferencia del 409) (header `X-HL-Error`) para que la app refresque su cache de credencial.
- El `Uuid` se genera con `randomUUID()` al crear el agente (`lib/agentes.ts`) y nunca cambia. Migracion para bases previas: `db/migracion-agentes-llaves.sql`.
- `tblBitacora` guarda tambien `IdKey`/`Aplicacion` y `Proveedor`/`Modelo` de cada llamada (`logWs` en `lib/ws-auth.ts`); `/api/estadisticas` agrupa por agente, aplicacion, proveedor o modelo (`agrupar=`). Migraciones: `db/migracion-bitacora-modelo.sql`, `db/migracion-bitacora-aplicacion.sql`.
- Proveedores: `lib/providers.ts` (portal, con `api` que indica el SDK) y `lib/proxy-providers.ts` (destinos del proxy). Los compatibles con OpenAI usan `openAiCompatible()`.
- Identidad visual por proveedor: `PROVIDERS[].color` + glifos SVG propios en `components/ProviderMark.tsx` (`ProviderMark`, `ProviderBadge`, `ProviderGlyph` para incrustar en graficas). Selector visual: `components/ProviderPicker.tsx`. Al agregar un proveedor, dar de alta su `color` y, si se quiere, su glifo en `GLYPHS`.
- Diseño: `app/globals.css` (tokens, riel lateral flotante, bento del resumen, graficas). El resumen usa `components/charts/Sparkline.tsx` y `Donut.tsx`; `/api/dashboard` agrega `porProveedor`, `catalogo` y `tendencia`.
- Auditoria del portal: `lib/auditoria.ts` (`registrarAuditoria`) se llama desde las rutas de llaves, agentes, keys, IPs, usuarios y login; guarda en `tblAuditoria` quien, desde que IP, accion y `Cambios` JSON {campo:{antes,despues}} sin secretos. Pagina `/auditoria`. Migracion: `db/migracion-auditoria.sql`.
- Llave de respaldo por agente (`tblAgentes.IdLlaveRespaldo`, migracion `db/migracion-agente-respaldo.sql`): el proxy reintenta con ella ante 401/402/403/408/429/5xx si habla el mismo API que la principal (`llaveRespaldoUtilizable` en `lib/ws-auth.ts`, logica en `lib/ws-proxy.ts`, header `X-HL-Respaldo: 1`); `/api/ws/llave` la regresa en `respaldo` para las apps en modo llave.
- Respaldos: `npm run db:respaldar` (`scripts/respaldar-bd.ts`, sin mysqldump, rota por `RESPALDOS_DIAS`) y `npm run db:verificar` (`scripts/verificar-master-key.ts`, huella de MASTER_KEY + prueba de descifrado). El resumen muestra `llavesNoDescifrables` y `agentesSinRespaldo`.
- Script de base de datos: `db/BDHLServer.sql`.
