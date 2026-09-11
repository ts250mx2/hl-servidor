/**
 * Ejemplo: como una app obtiene su llave y arma el cliente del proveedor.
 * Ejecutar desde este repo con los datos reales:
 *   HL_URL=http://localhost:3055 HL_KEY=hl_... HL_AGENTE=<uuid> npx tsx cliente/ejemplo-uso.ts
 */
import { obtenerLlave, HlClienteError } from './hl-cliente';

async function main() {
  const { proveedor, modelo, llave, agente } = await obtenerLlave();

  console.log(`Agente:    ${agente}`);
  console.log(`Proveedor: ${proveedor}`);
  console.log(`Modelo:    ${modelo}`);
  console.log(`Llave:     ${llave.slice(0, 10)}... (${llave.length} caracteres)`);

  // Con esto se arma el SDK que corresponda, por ejemplo:
  //   if (proveedor === 'claude') new Anthropic({ apiKey: llave })  -> model: modelo
  //   if (proveedor === 'openai') new OpenAI({ apiKey: llave })     -> model: modelo
}

main().catch((error) => {
  if (error instanceof HlClienteError) {
    console.error(`HL Servidor (${error.status ?? 'sin respuesta'}): ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
