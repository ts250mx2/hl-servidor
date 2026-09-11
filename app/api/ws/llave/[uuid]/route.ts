import type { NextRequest } from 'next/server';
import { resolveLlave } from '@/lib/ws-llave';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ws/llave/<uuid>  -> agente especifico por UUID
 * Header obligatorio: X-HL-Key
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  return resolveLlave(request, uuid);
}
