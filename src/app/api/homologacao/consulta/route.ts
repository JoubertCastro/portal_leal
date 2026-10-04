import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, validOrigin } from '@/server/http';
import { homologationAllowed } from '@/server/homologation';
import { getSicGateway } from '@/server/runtime';

const schema = z.object({ key: z.string().max(128), code: z.string().max(8), document: z.string().max(18), legalName: z.string().max(250).optional() }).strict();
// Load protection for the single homologation replica, not customer authentication.
let busy = false;
let nextQueryAt = 0;
export async function POST(request: Request) {
  if (!validOrigin(request)) return apiError(403, 'ORIGIN_DENIED', 'Solicitação não permitida.');
  let raw = '';
  const reader = request.body?.getReader();
  if (!reader) return apiError(400, 'INVALID_REQUEST', 'Confira os campos.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return apiError(413,'INVALID_REQUEST','Solicitação muito grande.');}chunks.push(value); }
    raw=Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
  let parsed;
  try { parsed=schema.safeParse(JSON.parse(raw)); } catch { return apiError(400,'INVALID_REQUEST','Confira os campos.'); }
  if (!parsed.success || !homologationAllowed(parsed.data)) return apiError(403,'TEST_ACCESS_DENIED','Acesso de teste inválido, expirado ou documento não autorizado.');
  if (busy || Date.now()<nextQueryAt) return apiError(429,'WAIT','Aguarde alguns segundos antes de consultar novamente.');
  busy=true;nextQueryAt=Date.now()+10_000;
  try {
    const sic=getSicGateway();
    const registration=await sic.registration(parsed.data.document,parsed.data.legalName);
    if(registration.kind!=='ready') return NextResponse.json({status:registration.kind},{headers:{'Cache-Control':'no-store'}});
    const scope={document:registration.document,identityKey:registration.identityKey,acceptedNames:registration.acceptedNames,internalIds:[...new Set(registration.contacts.flatMap(c=>c.internalIds))]};
    const [debts,agreements]=await Promise.all([sic.debts(scope),sic.agreements(scope)]);
    // This is an operator-only test. It never creates a verified customer session,
    // sends WhatsApp, or records marketing/identity consent.
    return NextResponse.json({status:'ready',debts,agreements},{headers:{'Cache-Control':'no-store'}});
  } catch { return apiError(502,'UPSTREAM_UNAVAILABLE','Não foi possível validar a resposta da Leal. Tente novamente mais tarde.'); }
  finally {busy=false;}
}
