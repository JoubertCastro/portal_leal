import { NextResponse } from 'next/server';
import { analyticsEnabled } from '@/server/analytics/http';
export const dynamic='force-dynamic';
export async function GET() { return NextResponse.json({ status: 'ok', authentication: 'unavailable', analytics: analyticsEnabled()?'configured':'disabled' }, { headers: { 'Cache-Control': 'no-store' } }); }
