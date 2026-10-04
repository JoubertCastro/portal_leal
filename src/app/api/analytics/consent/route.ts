import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validOrigin, apiError } from '@/server/http';
import { analyticsEnabled, analyticsRepository, boundedJson, CONSENT_COOKIE, JOURNEY_COOKIE, cookieOptions, trackingCookies, trackingFailure, trackingResponse } from '@/server/analytics/http';
import { signTrackingToken } from '@/server/analytics/privacy';

export async function GET() {
  if (!analyticsEnabled()) return trackingResponse({ available:false, granted:false, decided:false });
  try {
    const {consentId}=await trackingCookies();
    return trackingResponse({available:true,granted:consentId?await analyticsRepository().consent(consentId):false,decided:!!consentId});
  } catch(error) {return trackingFailure(error);}
}
export async function POST(request:Request) {
  if(!validOrigin(request)) return apiError(403,'ORIGIN_DENIED','Solicitação não permitida.');
  try {
    const repository=analyticsRepository();
    await repository.limit('consent-global',1000,60);
    const result=z.object({granted:z.boolean()}).strict().safeParse(await boundedJson(request));
    if(!result.success) return apiError(400,'INVALID_REQUEST','Preferência inválida.');
    const {consentId}=await trackingCookies(); const id=consentId??randomUUID();
    await repository.saveConsent(id,result.data.granted);
    const response=trackingResponse({granted:result.data.granted});
    response.cookies.set(CONSENT_COOKIE,signTrackingToken(id,'consent',180*86400),{...cookieOptions(),maxAge:180*86400});
    response.cookies.set(JOURNEY_COOKIE,'',{...cookieOptions(),maxAge:0});
    return response;
  }catch(error){return trackingFailure(error);}
}
