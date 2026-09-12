import type { NextRequest } from 'next/server';
import { proxyRequest } from '@/lib/ws-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ uuid: string; path: string[] }> };

/**
 * /api/ws/proxy/<uuid>/<ruta del proveedor>
 * Ej. POST /api/ws/proxy/<uuid>/v1/messages  ->  https://api.anthropic.com/v1/messages
 * Header obligatorio: X-HL-Key. La llave del proveedor la pone HL Console.
 */
async function handle(request: NextRequest, ctx: Ctx) {
  const { uuid, path } = await ctx.params;
  return proxyRequest(request, uuid, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
