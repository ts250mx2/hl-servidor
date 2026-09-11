# Cliente para apps consumidoras

Archivos para copiar a cada aplicación que pide llaves a HL Servidor.

| Archivo | Para qué |
|---|---|
| `hl-cliente.ts` | Módulo sin dependencias. Lee `HL_URL`, `HL_KEY`, `HL_AGENTE`, consulta el webservice y cachea en memoria. |
| `ejemplo-uso.ts` | Cómo llamarlo y armar el SDK del proveedor. |
| `ecosystem.config.example.js` | Plantilla PM2 para inyectar las variables sin `.env` en disco. |

## Pasos por aplicación

1. En HL Servidor: da de alta la IP de la app en **IPs permitidas**, crea una Key en **Keys** y copia el UUID del agente en **Agentes**.
2. Copia `hl-cliente.ts` a `lib/` de la app.
3. Define las variables (`.env` fuera de git, PM2, variables del sistema o dotenvx):

```
HL_URL=https://hl.tudominio.com
HL_KEY=hl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HL_AGENTE=a7385432-c888-426b-9f2b-35d981ccad78
HL_TTL_MIN=30
```

4. En el código:

```ts
import { obtenerLlave } from '@/lib/hl-cliente';

const { proveedor, modelo, llave } = await obtenerLlave();
```

Si rotas la llave o cambias el modelo en el portal, la app lo toma en cuanto vence el cache (`HL_TTL_MIN`) o al llamar `limpiarCacheLlave()`.

## Prueba rápida desde este repo

```bash
HL_URL=http://localhost:3055 HL_KEY=hl_... HL_AGENTE=<uuid> npx tsx cliente/ejemplo-uso.ts
```
