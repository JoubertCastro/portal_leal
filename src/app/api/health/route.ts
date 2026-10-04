import { NextResponse } from 'next/server';
import { analyticsEnabled } from '@/server/analytics/http';
import {authReadiness} from '@/server/runtime';
export const dynamic='force-dynamic';
export async function GET() { return NextResponse.json({ status: 'ok', authentication: authReadiness.available?'configured':'unavailable', analytics: analyticsEnabled()?'configured':'disabled' }, { headers: { 'Cache-Control': 'no-store' } }); }
