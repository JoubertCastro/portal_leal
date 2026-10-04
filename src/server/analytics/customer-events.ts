import 'server-only';
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import type { ServerTrackingEvent } from '../../domain/tracking';
import { analyticsEnabled, analyticsRepository, trackingCookies } from './http';
export interface CustomerAnalytics {
  record(event: Omit<ServerTrackingEvent,'id'>, identity?: {document:string;verified:boolean}): Promise<void>;
}
export const customerAnalytics: CustomerAnalytics = {
  async record(event,identity){
    if(!analyticsEnabled())return;
    try{
      const {consentId,journeyId}=await trackingCookies();
      if(!consentId||!journeyId)return;
      const id=randomUUID();const occurredAt=new Date();
      after(async()=>{
        try{await analyticsRepository().appendServer(consentId,journeyId,{...event,id},identity,occurredAt);}
        catch{console.error('ANALYTICS_SERVER_EVENT_NOT_RECORDED');}
      });
    }catch{
      // Observability signal only; never swallow an access error or expose query payloads.
      console.error('ANALYTICS_SERVER_EVENT_NOT_RECORDED');
    }
  },
};
