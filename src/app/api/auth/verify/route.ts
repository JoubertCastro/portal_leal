import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {apiError,validOrigin} from '@/server/http';
import {authReadiness,getCustomerAuth} from '@/server/runtime';
import {authBody,authFailure,browserCookie,sessionCookie,authCookieOptions} from '@/server/customer-auth-http';
const schema=z.object({challengeId:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().regex(/^\d{6}$/)}).strict();
export async function POST(request:Request){
  if(!validOrigin(request))return apiError(403,'ORIGIN_DENIED','Solicitação não permitida.');
  if(!authReadiness.available)return apiError(503,'AUTH_UNAVAILABLE','A confirmação de identidade ainda não está disponível.');
  try{
    const parsed=schema.safeParse(await authBody(request));if(!parsed.success)return apiError(400,'INVALID_CODE','Informe os seis dígitos.');
    const browser=(await cookies()).get(browserCookie)?.value??'';
    const token=await getCustomerAuth().store.verify(parsed.data.challengeId,browser,parsed.data.code);
    if(!token)return apiError(401,'INVALID_CODE','Código inválido, expirado ou sem tentativas. Reinicie o acesso se necessário.');
    const response=NextResponse.json({verified:true},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(sessionCookie,token,{...authCookieOptions,maxAge:1800});return response;
  }catch(e){return authFailure(e);}
}
