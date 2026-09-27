import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ status: 'ok', authentication: 'unavailable', analytics: 'disabled' }, { headers: { 'Cache-Control': 'no-store' } }); }
