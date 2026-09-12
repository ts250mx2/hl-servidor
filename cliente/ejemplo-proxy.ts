/**
 * Ejemplo del proxy transparente: la app nunca ve la llave del proveedor.
 * Llama a Anthropic con streaming a traves de HL Console usando fetch puro.
 * Con el SDK oficial es lo mismo: apunta baseURL al proxy y manda X-HL-Key (ver README).
 *
 *   HL_URL=http://localhost:3055 HL_KEY=hl_... HL_AGENTE=<uuid de un agente Claude> npx tsx cliente/ejemplo-proxy.ts
 */
import { configProxy } from './hl-cliente';

const MAX_TOKENS = 60;

async function main() {
  const { baseURL, headers } = configProxy();

  const respuesta = await fetch(`${baseURL}/v1/messages`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      // El modelo lo fija el agente en el portal; este valor se sustituye.
      model: 'lo-decide-hl-servidor',
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: [{ role: 'user', content: 'Di "hola desde HL Console" y nada mas.' }],
    }),
  });

  if (!respuesta.ok || !respuesta.body) {
    console.error(`HTTP ${respuesta.status}:`, await respuesta.text());
    process.exit(1);
  }

  const reader = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  let modelo = '';
  process.stdout.write('Respuesta: ');
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const linea of value.split('\n')) {
      if (!linea.startsWith('data: ')) continue;
      const evento = JSON.parse(linea.slice(6)) as {
        type: string;
        message?: { model: string };
        delta?: { type: string; text?: string };
      };
      if (evento.type === 'message_start' && evento.message) modelo = evento.message.model;
      if (evento.type === 'content_block_delta' && evento.delta?.text) process.stdout.write(evento.delta.text);
    }
  }
  console.log(`\nModelo usado (fijado por el portal): ${modelo}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
