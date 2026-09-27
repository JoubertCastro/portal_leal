import { apiError, validOrigin } from '@/server/http';
export async function POST(request: Request) {
  if (!validOrigin(request)) return apiError(403, 'ORIGIN_DENIED', 'Solicitação não permitida.');
  // Do not acknowledge events that cannot be durably saved. No payload logging.
  return apiError(503, 'ANALYTICS_UNAVAILABLE', 'Coleta de eventos ainda não habilitada.');
}
