# HL Servidor · Administrador de llaves de IA

Portal + webservice para guardar cifradas las llaves de API de Claude, OpenAI, Gemini y los modelos que vayan saliendo. Tus aplicaciones ya no llevan la llave en su `.env`: llevan una **Key de acceso** y piden un **Agente** por UUID. El agente apunta a una **Llave de API** (proveedor + modelo + llave) y eso es lo que recibe la app. Cambias la llave del agente o el modelo de la llave aquí, y todas las apps lo toman en su siguiente consulta.

```
Aplicación ──(X-HL-Key + UUID del agente)──▶ HL Servidor
                                              Agente ──▶ Llave de API (proveedor, modelo, llave cifrada)
Aplicación ◀──(proveedor, modelo, llave)──────┘
```

## 1. Instalación

```bash
npm install
```

### Base de datos

1. Abre `db/BDHLServer.sql` en MySQL Workbench conectado como **root** y ejecútalo completo.
   Crea la base `BDHLServer`, el usuario `hladministrador` (solo `localhost`, `127.0.0.1` y `201.172.236.128`), las tablas y el usuario inicial del portal.
2. Verifica `.env` (ya viene generado con `MASTER_KEY` y `SESSION_SECRET` aleatorios). Si lo pierdes, copia `.env.example` y genera valores nuevos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Importante:** `MASTER_KEY` cifra todas las llaves. Respáldala. Si cambia, las llaves guardadas ya no se pueden descifrar.

3. (Opcional) Si no ejecutaste la parte de datos iniciales del SQL:

```bash
npm run seed
```

### Arrancar

```bash
npm run dev      # desarrollo  → http://localhost:3055
npm run build
npm run start    # producción  → http://localhost:3056
```

Usuario inicial del portal: `admin` / `admin123`. Cámbialo en **Usuarios** después de entrar.

## 2. Cómo se usa el portal

| Sección | Para qué |
|---|---|
| **Llaves de API** | Proveedor + modelo + llave de API. La llave se cifra con AES-256-GCM y solo se muestra enmascarada. Puedes ponerle fecha de caducidad. |
| **Agentes** | Nombre + UUID + la llave que ejecuta. Es lo que tus apps piden por UUID. |
| **Keys de acceso** | Credencial de cada aplicación. Se muestra una sola vez; en la base solo queda su hash SHA-256. |
| **IPs permitidas** | Lista blanca del webservice. Viene con `127.0.0.1`, `::1` y `201.172.236.128`. |
| **Usuarios** | Quién entra al portal (bcrypt). |
| **Bitácora** | Cada consulta al webservice: IP, key, resultado. |

Para **rotar el modelo** de una app: edita la llave y cambia el campo Modelo, o edita el agente y reasígnale otra llave. No hay que tocar la app.

## 3. Webservice

Siempre se mandan la key de la aplicación y el UUID del agente. El UUID puede ir en la ruta, en el query o en un header.

```
GET http://localhost:3056/api/ws/llave/<uuid>         # UUID en la ruta (recomendado)
GET http://localhost:3056/api/ws/llave?uuid=<uuid>    # UUID en query
GET http://localhost:3056/api/ws/llave                # UUID en header X-HL-Agente
Header obligatorio: X-HL-Key: hl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

El UUID de cada agente se genera al crearlo y se copia desde la tabla de **Agentes**.

Respuesta correcta:

```json
{
  "success": true,
  "data": {
    "uuid": "3f9c2a7e-1b4d-4c8e-9a1f-2d5e6b7c8d9e",
    "agente": "Tapi POS Opus",
    "proveedor": "claude",
    "modelo": "claude-opus-4-8",
    "llave": "sk-ant-...",
    "caducidad": null
  },
  "error": null
}
```

Errores: `403` IP no autorizada, agente inactivo, llave inactiva o caducada; `401` key inválida o desactivada; `404` UUID que no existe; `400` UUID ausente o mal formado. Todo queda en la bitácora.

Si la base ya existía con la versión anterior (agentes con proveedor y modelo), ejecuta `db/migracion-agentes-llaves.sql` una sola vez. Conserva los UUID.

### Ejemplo de cliente en Node (para tapioki-pos u otra app)

```ts
// lib/hl-llave.ts
const HL_URL = process.env.HL_URL || 'http://localhost:3056/api/ws/llave';
const HL_KEY = process.env.HL_KEY || '';
const CACHE_MS = 5 * 60 * 1000;

const cache = new Map<string, { data: HlLlave; expira: number }>();

export interface HlLlave { uuid: string; agente: string; proveedor: string; modelo: string; llave: string; caducidad: string | null }

/** Pide al servidor la llave del agente indicado por UUID. */
export async function obtenerLlave(agenteUuid: string): Promise<HlLlave> {
  const hit = cache.get(agenteUuid);
  if (hit && hit.expira > Date.now()) return hit.data;
  const res = await fetch(`${HL_URL}/${agenteUuid}`, { headers: { 'X-HL-Key': HL_KEY }, cache: 'no-store' });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error || `HL Servidor respondió ${res.status}`);
  cache.set(agenteUuid, { data: body.data, expira: Date.now() + CACHE_MS });
  return body.data;
}
```

Y en el `.env` de la app solo:

```
HL_URL=http://localhost:3056/api/ws/llave
HL_KEY=hl_xxxxxxxx...
HL_AGENTE_ASISTENTE=3f9c2a7e-1b4d-4c8e-9a1f-2d5e6b7c8d9e
```

Con Anthropic quedaría:

```ts
const { modelo, llave } = await obtenerLlave(process.env.HL_AGENTE_ASISTENTE!);
const client = new Anthropic({ apiKey: llave });
await client.messages.create({ model: modelo, ... });
```

## 4. Seguridad

- **IP real:** `server.js` sobrescribe `X-Forwarded-For` con la IP del socket, así un cliente no puede falsificarla. Si algún día pones nginx/IIS delante, cambia `TRUST_PROXY=true` en `.env`.
- **MySQL:** el usuario `hladministrador` solo existe para `localhost`, `127.0.0.1` y `201.172.236.128`. Cualquier otro origen es rechazado por MySQL aunque tenga la contraseña.
- **HTTPS:** el webservice entrega la llave en claro al cliente autorizado. Entre localhost no hay riesgo. Si agregas IPs externas, pon el servicio detrás de HTTPS.
- **Sesión del portal:** cookie firmada con HMAC (`SESSION_SECRET`), httpOnly, `SameSite=Strict`.

## 5. Estructura

```
server.js                 servidor propio (fija la IP real)
proxy.ts                  protege el portal con sesión
db/BDHLServer.sql         base, usuario y tablas
lib/crypto.ts             AES-256-GCM, hash de keys
lib/llaves.ts             llaves de API (proveedor + modelo)
lib/agentes.ts            agentes (UUID -> llave)
lib/ws-llave.ts           logica del webservice
lib/session.ts            cookie firmada
lib/ip.ts                 lista blanca
app/api/ws/llave          webservice
app/api/{llaves,agentes,keys,ips,usuarios,bitacora,dashboard}
app/(dashboard)/*         páginas del portal
```
