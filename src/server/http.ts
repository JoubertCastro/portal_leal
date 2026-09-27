import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message }, requestId: randomUUID() }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function validOrigin(request: Request): boolean {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return false;
  try { return request.headers.get('origin') === new URL(origin).origin; } catch { return false; }
}
