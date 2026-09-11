<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# HL Servidor - Administrador de llaves de IA

- Portal Next.js 16 (App Router) + MySQL (BDHLServer). Misma estructura que tapioki-pos.
- `server.js` es un servidor propio: fija `x-forwarded-for` desde el socket para que la lista blanca de IPs no se pueda falsificar.
- Las llaves de API se cifran con AES-256-GCM usando `MASTER_KEY` del `.env`. Nunca se regresan al navegador.
- Modelo de datos: `tblLlaves` (proveedor + modelo + llave cifrada) <- `tblAgentes` (nombre + Uuid + IdLlave). `tblKeys` es solo la credencial de cada app.
- El webservice `/api/ws/llave/<uuid>` (o `?uuid=` / header `X-HL-Agente`) exige `X-HL-Key` valida, IP en `tblIPsPermitidas` y el UUID del agente; regresa proveedor, modelo y llave de la llave del agente. Logica en `lib/ws-llave.ts`.
- El `Uuid` se genera con `randomUUID()` al crear el agente (`lib/agentes.ts`) y nunca cambia. Migracion para bases previas: `db/migracion-agentes-llaves.sql`.
- Script de base de datos: `db/BDHLServer.sql`.
