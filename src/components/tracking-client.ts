'use client';
import type { BrowserEventName, BrowserTrackingEvent } from '@/domain/tracking';
let enabled=false; let queue:BrowserTrackingEvent[]=[]; let timer:ReturnType<typeof setTimeout>|undefined; let sending=false; let retries=0;let generation=0;
export function stopTracking(){generation++;enabled=false;queue=[];if(timer)clearTimeout(timer);timer=undefined;}
export async function startTracking(){
  if(location.pathname!=='/')return;
  try{if(localStorage.getItem('leal_analytics_block')==='1')return;}catch{}
  const attempt=generation;
  const raw=new URLSearchParams(window.location.search).get('utm_campaign');
  let referrerGroup='direct';
  try{if(document.referrer){const host=new URL(document.referrer).hostname;referrerGroup=host===location.hostname?'internal':/(^|\.)(google\.[a-z.]+|bing.com|duckduckgo.com)$/.test(host)?'search':/(^|\.)(facebook.com|instagram.com|t.co|linkedin.com)$/.test(host)?'social':'other';}}catch{}
  const response=await fetch('/api/analytics/journey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({referrerGroup,...(raw&&/^[a-z][a-z0-9_-]{0,63}$/.test(raw)?{campaignCode:raw}:{})}),cache:'no-store'});
  if(!response.ok||attempt!==generation) return;
  enabled=true;retries=0;track('portal_viewed');
}
export function track(name:BrowserEventName,attributes:Pick<BrowserTrackingEvent,'documentKind'|'durationMs'>={}){
  if(!enabled||queue.length>=100) return false;
  queue.push({id:crypto.randomUUID(),name,occurredAt:new Date().toISOString(),...attributes});
  if(!timer)timer=setTimeout(()=>{timer=undefined;void flushTracking();},1000);
  return true;
}
export async function flushTracking(){
  if(!enabled||sending||!queue.length)return;
  const batch=queue.slice(0,20); sending=true;
  try{
    const response=await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true,cache:'no-store'});
    if(response.ok){const ids=new Set(batch.map(event=>event.id));queue=queue.filter(event=>!ids.has(event.id));retries=0;}
    else if([400,403].includes(response.status)){stopTracking();return;}
    else retries++;
  }catch{retries++;}finally{sending=false;}
  // Same event IDs on retry: database insert is idempotent. Never block customer actions.
  if(enabled&&queue.length&&retries<4&&!timer)timer=setTimeout(()=>{timer=undefined;void flushTracking();},Math.min(30000,1000*2**retries));
}
