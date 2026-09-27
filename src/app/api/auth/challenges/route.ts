import { apiError, validOrigin } from '@/server/http';
import { authReadiness } from '@/server/runtime';
export async function POST(request: Request) {
  if (!validOrigin(request)) return apiError(403, 'ORIGIN_DENIED', 'Solicitação não permitida.');
  // Fail closed BEFORE reading a CPF or calling any upstream. No temporary in-memory auth.
  if (!authReadiness.available) return apiError(503, 'AUTH_UNAVAILABLE', 'O acesso está em preparação. Por enquanto, fale com nossa equipe.');
  return apiError(503, 'AUTH_UNAVAILABLE', 'Acesso indisponível.');
}
