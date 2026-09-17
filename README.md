# HL Console · Administrador de llaves de IA

Portal + webservice para guardar cifradas las llaves de API de Claude, OpenAI, Gemini y los modelos que vayan saliendo. Tus aplicaciones ya no llevan la llave en su `.env`: llevan una **Key de acceso** y piden un **Agente** por UUID. El agente apunta a una **Llave de API** (proveedor + modelo + llave) y eso es lo que recibe la app. Cambias la llave del agente o el modelo de la llave aquí, y todas las apps lo toman en su siguiente consulta.

```
Aplicación ──(X-HL-Key + UUID del agente)──▶ HL Console
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
| **Bitácora** | Cada consulta al webservice y al proxy: IP, aplicación, agente, proveedor, modelo y resultado. |
| **Estadísticas** | Gráficas de llamadas por periodo agrupadas por agente, aplicación, proveedor o modelo, con rango de fechas, filtro por agente y aplicación, y zoom arrastrando sobre la gráfica. |

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
    "api": "anthropic",
    "modelo": "claude-opus-4-8",
    "llave": null,
    "llaveCifrada": "base64(iv).base64(tag).base64(cifrado)",
    "cifrado": "aes-256-gcm",
    "caducidad": null
  },
  "error": null
}
```

La llave de API viaja **cifrada con el secreto compartido de la Key** (AES-256-GCM). El secreto se muestra una sola vez al crear o regenerar la Key y nunca viaja en la petición, así que quien vea el tráfico HTTP no puede descifrarla. `cliente/hl-cliente.ts` la descifra con `HL_SECRET`. Una Key creada antes de la migración no tiene secreto: el portal la marca **Sin secreto** y la llave viaja en claro (`llave`) hasta que la regeneres.

Errores: `403` IP no autorizada, agente inactivo, llave inactiva o caducada; `401` key inválida o desactivada; `404` UUID que no existe; `400` UUID ausente o mal formado. Todo queda en la bitácora.

Si la base ya existía con la versión anterior (agentes con proveedor y modelo), ejecuta `db/migracion-agentes-llaves.sql` una sola vez. Conserva los UUID.

Para agregar el secreto compartido a una base existente ejecuta `db/migracion-secreto.sql` una sola vez y después regenera cada Key desde el portal.

Para que la bitácora guarde proveedor y modelo en una base existente ejecuta `db/migracion-bitacora-modelo.sql` una sola vez, y `db/migracion-bitacora-aplicacion.sql` para que guarde la aplicación.

### Cliente para tus apps

En `cliente/` está `hl-cliente.ts`, un módulo sin dependencias que se copia a `lib/` de cada app. Lee estas variables, consulta el webservice, descifra la llave con el secreto y la cachea en memoria:

```
HL_URL=http://127.0.0.1:3056
HL_KEY=hl_xxxxxxxx...
HL_SECRET=0f3a...   (64 hex, se muestra junto con la Key)
HL_AGENTE=3f9c2a7e-1b4d-4c8e-9a1f-2d5e6b7c8d9e
```

```ts
import { obtenerLlave } from '@/lib/hl-cliente';

const { proveedor, modelo, llave } = await obtenerLlave();
const client = new Anthropic({ apiKey: llave });
await client.messages.create({ model: modelo, ... });
```

Los pasos por aplicación están en `cliente/README.md`. Para probar desde este repo: `npm run ws -- <uuid> <key> <url> <secreto>`.

### Proxy transparente (recomendado): la app nunca ve la llave

En vez de pedir la llave, la app habla con el proveedor **a través de HL Console**. El proxy valida IP y `X-HL-Key`, inyecta la llave real del agente, sustituye el campo `model` por el modelo del agente y reenvía los bytes tal cual, incluido el streaming SSE. No interpreta ni limita las respuestas: tool use, visión, `stream: true`, todo pasa igual que contra el API oficial. Cada respuesta del proxy lleva los headers `X-HL-Proveedor` y `X-HL-Modelo` con el proveedor y el modelo que la atendieron, para que la app lo muestre sin otra consulta.

```
<HL_URL>/api/ws/proxy/<uuid>/<ruta del proveedor>

POST /api/ws/proxy/<uuid>/v1/messages            -> https://api.anthropic.com/v1/messages
POST /api/ws/proxy/<uuid>/v1/chat/completions    -> https://api.openai.com/v1/chat/completions
POST /api/ws/proxy/<uuid>/v1beta/models/x:generateContent -> Gemini (el modelo de la URL se sustituye)
También por proxy: DeepSeek, Groq, Mistral, xAI, OpenRouter, Kimi, Qwen y GLM (hablan el API de OpenAI, la app usa el SDK de OpenAI).

**Cambio de proveedor en caliente.** Las apps cachean proveedor y modelo (`HL_TTL_MIN`). Si en el portal el agente pasa de Claude a OpenAI (o al revés) y la app sigue llamando con el SDK anterior (`/v1/messages` contra OpenAI, por ejemplo), el proxy no reenvía la llamada: responde `422` con `X-HL-Error: PROVEEDOR_CAMBIADO` (422 y no 409 porque los SDK reintentan el 409) y lo anota en la bitácora con ese resultado. La app debe volver a pedir `/api/ws/llave/<uuid>` y repetir la llamada con el SDK que corresponda (así lo hace `vidaurri-ia`, en `correrTurnoAgente`).
Header obligatorio: X-HL-Key
```

Con el SDK oficial solo cambia la configuración; el `apiKey` es un relleno porque HL Console pone la real:

```ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { configProxy } from '@/lib/hl-cliente';

const { baseURL, headers } = configProxy();   // lee HL_URL, HL_KEY, HL_AGENTE

const anthropic = new Anthropic({ baseURL, apiKey: 'hl', defaultHeaders: headers });
const openai = new OpenAI({ baseURL: `${baseURL}/v1`, apiKey: 'hl', defaultHeaders: headers });

// El model que mandes se sustituye por el del agente; cambias de modelo en el portal sin tocar la app.
const stream = await anthropic.messages.create({ model: 'x', max_tokens: 1024, stream: true, messages });
```

Para agregar un proveedor: una línea en `lib/providers.ts` (portal) y su destino en `lib/proxy-providers.ts` (proxy). Los compatibles con OpenAI solo necesitan la URL base.

Ventajas frente a `/api/ws/llave`: quien comprometa el servidor de una app solo puede hacer llamadas a través de HL Console (con bitácora, lista de IPs y Key revocable), nunca obtiene la llave. Y cambiar de proveedor o modelo es editar el agente. Costo: un salto de red extra y HL Console pasa a ser parte del camino de cada llamada. Cada llamada queda en la bitácora con ruta y código de respuesta del proveedor.

## 4. Seguridad

- **IP real:** `server.js` sobrescribe `X-Forwarded-For` con la IP del socket, así un cliente no puede falsificarla. Si algún día pones nginx/IIS delante, cambia `TRUST_PROXY=true` en `.env`.
- **MySQL:** el usuario `hladministrador` solo existe para `localhost`, `127.0.0.1` y `201.172.236.128`. Cualquier otro origen es rechazado por MySQL aunque tenga la contraseña.
- **Llave cifrada en tránsito:** el webservice entrega la llave de API cifrada con el secreto compartido de cada Key; la Key viaja en el header pero el secreto nunca. Aun así, si agregas IPs externas conviene poner el servicio detrás de HTTPS para proteger también la Key.
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

## Respaldo y recuperación

Dos cosas hay que poder recuperar: la **base de datos** y la **MASTER_KEY**. El respaldo de la base no sirve sin la MASTER_KEY con la que se cifraron las llaves de API.

- **MASTER_KEY.** Guárdala fuera del servidor (gestor de contraseñas). `npm run db:verificar` imprime una huella de la llave (no la llave) y comprueba que descifra todas las llaves y secretos de la base; úsalo después de restaurar o de mover el servidor. El resumen del portal también avisa si alguna llave dejó de descifrarse.
- **Base de datos.** `npm run db:respaldar` vuelca esquema y datos a `respaldos/BDHLServer-AAAAMMDD-HHMMSS.sql.gz` sin depender de `mysqldump` y borra los respaldos con más de `RESPALDOS_DIAS` días (14 por defecto). Prográmalo a diario:

```
# Linux con PM2
pm2 start npm --name hl-respaldo --cron "0 3 * * *" --no-autorestart -- run db:respaldar
# Windows: Programador de tareas -> "npm run db:respaldar" en la carpeta del proyecto
```

Restaurar: `zcat respaldos/BDHLServer-....sql.gz | mysql -u usuario -p` (el archivo trae `USE` y `DROP/CREATE` de cada tabla), y luego `npm run db:verificar`.

## Auditoría del portal

Cada alta, cambio o baja de llaves, agentes, keys, IPs y usuarios queda en `tblAuditoria` con quién lo hizo, desde qué IP y qué campos cambiaron (valor anterior y nuevo). También los inicios de sesión y los intentos fallidos. Nunca se guardan secretos: de una llave de API o una contraseña solo queda "reemplazada". Se consulta en **Monitoreo → Auditoría**. Migración para bases previas: `db/migracion-auditoria.sql`.

## Llave de respaldo por agente

En el agente se puede elegir una **llave de respaldo**. Si el proveedor de la llave principal responde 401/402/403 (llave revocada o sin saldo), 408/429 (timeout, saturado) o 5xx (caído), el proxy repite la llamada con la llave de respaldo antes de contestarle a la app, y lo anota en la bitácora (el primer intento como `ERROR`, el segundo con `· respaldo "nombre"`). La respuesta lleva `X-HL-Respaldo: 1` y los headers `X-HL-Proveedor` / `X-HL-Modelo` de la llave que atendió.

Por proxy solo aplica si el respaldo habla el **mismo API** que la principal (Claude con Claude; OpenAI con OpenAI, DeepSeek, Groq, Mistral...), porque la app ya mandó la llamada en el formato de ese SDK. Conviene que sea otra cuenta u otro proveedor compatible. En modo llave, `/api/ws/llave` regresa también `respaldo` (proveedor, api, modelo y llave) para que la app reintente por su cuenta (`cliente/hl-cliente.ts` lo expone en `respaldo`). Migración: `db/migracion-agente-respaldo.sql`.
