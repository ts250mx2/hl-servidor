import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ success: true, data: null, error: null });
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}
