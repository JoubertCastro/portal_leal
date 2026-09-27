import { apiError, validOrigin } from '@/server/http';
export async function POST(request: Request) {
  if (!validOrigin(request)) return apiError(403, 'ORIGIN_DENIED', 'Solicitação não permitida.');
  return apiError(503, 'AUTH_UNAVAILABLE', 'A confirmação de identidade ainda não está disponível.');
}
