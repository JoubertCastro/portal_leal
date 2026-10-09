import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiError, validOrigin } from '@/server/http';
import { authBody, authFailure, browserCookie, sessionCookie } from '@/server/customer-auth-http';
import { authReadiness, getCustomerCreditors } from '@/server/runtime';
import { creditorRequest, CreditorQueryError } from '@/server/customer-creditors';
import { Arc4Error } from '@/server/integrations/creditors/arc4';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!validOrigin(request)) return apiError(403, 'ORIGIN_DENIED', 'Solicitação não permitida.');
  const jar = await cookies(); const session = jar.get(sessionCookie)?.value; const browser = jar.get(browserCookie)?.value;
  if (!authReadiness.available || !session || !browser) return apiError(401, 'UNAUTHENTICATED', 'Entre novamente para continuar.');
  try {
    const input = creditorRequest.safeParse(await authBody(request));
    if (!input.success) return apiError(400, 'INVALID_REQUEST', 'Confira a opção selecionada.');
    const result = await getCustomerCreditors().execute(session, browser, input.data);
    if (result.kind === 'pdf') return new Response(new Uint8Array(result.pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="boleto-leal.pdf"', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
    return NextResponse.json(result.data, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    if (error instanceof CreditorQueryError) {
      const response = apiError(503, 'CREDITOR_UNAVAILABLE', 'Não foi possível consultar a ARC4U. Tente novamente em alguns instantes.');
      const { requestId } = await response.clone().json();
      console.warn(JSON.stringify({ event: 'creditor_query_failed', requestId, stage: error.stage, code: error.code, kind: error.diagnostic?.kind, status: error.diagnostic?.status, reason: error.diagnostic?.reason }));
      return response;
    }
    if (error instanceof Arc4Error) {
      if (error.code === 'rate_limited') return apiError(429, 'RATE_LIMITED', 'Aguarde alguns minutos e tente novamente.');
      if (error.code === 'invalid_selection') return apiError(400, 'INVALID_SELECTION', 'As condições mudaram. Atualize a consulta e escolha novamente.');
      if (error.code === 'payment_unavailable' || error.code === 'pending' || error.code === 'not_found') return apiError(409, 'NOT_AVAILABLE', 'Este documento ainda não está disponível. Confira a situação do acordo ou fale com nossa equipe.');
    }
    return authFailure(error);
  }
}
