import { startJourney } from '@/domain/tracking';
import { validOrigin, apiError } from '@/server/http';
import { analyticsRepository, boundedJson, JOURNEY_COOKIE, cookieOptions, trackingCookies, trackingFailure, trackingResponse } from '@/server/analytics/http';
import { signTrackingToken } from '@/server/analytics/privacy';
export async function POST(request:Request){
  if(!validOrigin(request)) return apiError(403,'ORIGIN_DENIED','Solicitação não permitida.');
  try{
    const repository=analyticsRepository(); const {consentId,journeyId}=await trackingCookies();
    if(!consentId) return apiError(403,'CONSENT_REQUIRED','Preferência necessária.');
    const input=startJourney.safeParse(await boundedJson(request));
    if(!input.success) return apiError(400,'INVALID_REQUEST','Solicitação inválida.');
    const id=await repository.start(consentId,journeyId,input.data,request.headers);
    const response=trackingResponse({ready:true});
    response.cookies.set(JOURNEY_COOKIE,signTrackingToken(id,'journey',86400),{...cookieOptions(),maxAge:86400});
    return response;
  }catch(error){return trackingFailure(error);}
}
