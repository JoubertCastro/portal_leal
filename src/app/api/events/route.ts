import { apiError, validOrigin } from '@/server/http';
import { trackingBatch } from '@/domain/tracking';
import { analyticsRepository, boundedJson, trackingCookies, trackingFailure, trackingResponse } from '@/server/analytics/http';
export async function POST(request: Request) {
  if (!validOrigin(request)) return apiError(403, 'ORIGIN_DENIED', 'Solicitação não permitida.');
  try {
    const repository = analyticsRepository();
    const {consentId,journeyId}=await trackingCookies();
    if(!consentId||!journeyId) return apiError(403,'CONSENT_REQUIRED','Preferência necessária.');
    const input=trackingBatch.safeParse(await boundedJson(request));
    if(!input.success) return apiError(400,'INVALID_EVENT','Evento inválido.');
    await repository.appendBrowser(consentId,journeyId,input.data.events);
    return trackingResponse({accepted:input.data.events.length});
  }catch(error){return trackingFailure(error);}
}
