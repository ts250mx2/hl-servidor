# Cliente para apps consumidoras

Archivos para copiar a cada aplicación que pide llaves a HL Console.

| Archivo | Para qué |
|---|---|
| `hl-cliente.ts` | Módulo sin dependencias. Lee `HL_URL`, `HL_KEY`, `HL_SECRET`, `HL_AGENTE`, consulta el webservice, descifra la llave y cachea en memoria. |
| `ejemplo-uso.ts` | Cómo obtener la llave (modo llave) y armar el SDK del proveedor. |
| `ejemplo-proxy.ts` | Cómo llamar al proveedor con streaming a través del proxy (modo proxy, la app nunca ve la llave). |
| `ecosystem.config.example.js` | Plantilla PM2 para inyectar las variables sin `.env` en disco. |

## Pasos por aplicación

1. En HL Console: da de alta la IP de la app en **IPs permitidas**, crea una Key en **Keys** (copia la Key y el Secreto, se muestran una sola vez) y copia el UUID del agente en **Agentes**.
2. Copia `hl-cliente.ts` a `lib/` de la app.
3. Define las variables (`.env` fuera de git, PM2, variables del sistema o dotenvx):

```
HL_URL=http://127.0.0.1:3056
HL_KEY=hl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HL_AGENTE=a7385432-c888-426b-9f2b-35d981ccad78
HL_TTL_MIN=30
```

`HL_URL` va con `http://`: HL Console sirve HTTP plano. La llave de API llega cifrada con AES-256-GCM y el módulo la descifra con `HL_SECRET`, que nunca viaja por la red.

4. En el código:

```ts
import { obtenerLlave } from '@/lib/hl-cliente';

const { proveedor, modelo, llave } = await obtenerLlave();
```

Si rotas la llave o cambias el modelo en el portal, la app lo toma en cuanto vence el cache (`HL_TTL_MIN`) o al llamar `limpiarCacheLlave()`.

## Modo proxy (recomendado)

La app no recibe la llave. Apunta el SDK oficial a HL Console y este inyecta la llave y el modelo del agente:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { configProxy } from '@/lib/hl-cliente';

const { baseURL, headers } = configProxy();
const anthropic = new Anthropic({ baseURL, apiKey: 'hl', defaultHeaders: headers });
// OpenAI: new OpenAI({ baseURL: `${baseURL}/v1`, apiKey: 'hl', defaultHeaders: headers })
```

Streaming, tool use y el resto del API funcionan igual que directo contra el proveedor. En este modo `HL_SECRET` no hace falta.

## Prueba rápida desde este repo

```bash
HL_URL=http://localhost:3055 HL_KEY=hl_... HL_SECRET=... HL_AGENTE=<uuid> npx tsx cliente/ejemplo-uso.ts
```
