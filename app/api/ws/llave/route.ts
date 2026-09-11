import { resolveLlave } from '@/lib/ws-llave';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ws/llave              -> agente asignado a la key
 * GET /api/ws/llave?uuid=<uuid>  -> agente especifico por UUID
 * Header obligatorio: X-HL-Key
 * Header opcional:    X-HL-Agente: <uuid>
 */
export async function GET(request: Request) {
  return resolveLlave(request);
}
