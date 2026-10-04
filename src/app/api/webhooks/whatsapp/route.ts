import { apiError } from '@/server/http';
import { getDatabase } from '@/server/database';
import { metaDeliveryEvents, validMetaSignature, verifyMetaSubscription } from '@/server/integrations/meta-webhook';
import { saveMetaDelivery } from '@/server/whatsapp-delivery';
export const runtime='nodejs';
export async function GET(request:Request){
  const challenge=verifyMetaSubscription(new URL(request.url),process.env.META_WEBHOOK_VERIFY_TOKEN??'');
  return challenge===null?apiError(403,'WEBHOOK_DENIED','Verificação inválida.'):new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
}
export async function POST(request:Request){
  const secret=process.env.META_APP_SECRET??'';
  if(secret.length<16)return apiError(503,'WEBHOOK_UNAVAILABLE','Webhook indisponível.');
  const reader=request.body?.getReader();if(!reader)return apiError(400,'INVALID_BODY','Corpo inválido.');
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();return apiError(413,'BODY_TOO_LARGE','Corpo excede o limite.');}chunks.push(value);}}
  catch{return apiError(400,'INVALID_BODY','Corpo inválido.');}finally{reader.releaseLock();}
  const body=Buffer.concat(chunks);
  if(!validMetaSignature(body,request.headers.get('x-hub-signature-256'),secret))return apiError(401,'INVALID_SIGNATURE','Assinatura inválida.');
  if(!process.env.META_WABA_ID||!process.env.META_PHONE_NUMBER_ID)return apiError(503,'WEBHOOK_UNAVAILABLE','Webhook indisponível.');
  let events;
  try{events=metaDeliveryEvents(JSON.parse(body.toString('utf8')),process.env.META_WABA_ID,process.env.META_PHONE_NUMBER_ID);}
  catch{return apiError(400,'INVALID_EVENT','Evento inválido.');}
  try{if(events.length)await saveMetaDelivery(getDatabase(),events);}
  catch{return apiError(503,'WEBHOOK_STORAGE_UNAVAILABLE','Não foi possível persistir o evento.');}
  return new Response('EVENT_RECEIVED',{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});
}
