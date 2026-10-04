import 'server-only';
import { AccessError } from './customer-access';
import { apiError } from './http';
export const browserCookie='__Host-leal_browser';
export const sessionCookie='__Host-leal_session';
export const authCookieOptions={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'};
export async function authBody(request:Request):Promise<unknown>{
  const reader=request.body?.getReader();if(!reader)throw new AccessError('invalid_request');
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AccessError('invalid_request');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw new AccessError('invalid_request');}finally{reader.releaseLock();}
}
export function authFailure(error:unknown){
  if(error instanceof AccessError&&error.code==='rate_limited')return apiError(429,'RATE_LIMITED','Aguarde alguns minutos antes de tentar novamente.');
  if(error instanceof AccessError&&error.code==='invalid_request')return apiError(400,'INVALID_REQUEST','Confira os dados e reinicie o acesso.');
  if(error instanceof AccessError&&error.code==='unauthenticated')return apiError(401,'UNAUTHENTICATED','Entre novamente para acessar seus dados.');
  return apiError(503,'AUTH_UNAVAILABLE','Não foi possível concluir o acesso. Tente novamente mais tarde.');
}
