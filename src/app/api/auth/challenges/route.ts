import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {apiError,validOrigin} from '@/server/http';
import {authReadiness,getCustomerAuth} from '@/server/runtime';
import {authBody,authFailure,browserCookie,authCookieOptions} from '@/server/customer-auth-http';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('prepare'),document:z.string().max(18),legalName:z.string().max(250).optional()}).strict(),
  z.object({action:z.literal('send'),selectionId:z.string().max(43),optionId:z.string().max(43),authentication:z.boolean(),communications:z.boolean(),noticeVersion:z.string().max(64)}).strict(),
]);
export async function POST(request:Request){
  if(!validOrigin(request))return apiError(403,'ORIGIN_DENIED','Solicitação não permitida.');
  if(!authReadiness.available)return apiError(503,'AUTH_UNAVAILABLE','O acesso está em preparação. Por enquanto, fale com nossa equipe.');
  try{
    const raw=await authBody(request);
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&!Object.keys(raw).length)return NextResponse.json({available:true},{headers:{'Cache-Control':'no-store'}});
    const parsed=schema.safeParse(raw);if(!parsed.success)return apiError(400,'INVALID_REQUEST','Confira os dados.');
    const existing=(await cookies()).get(browserCookie)?.value;
    const browserToken=existing&&/^[A-Za-z0-9_-]{43}$/.test(existing)?existing:randomBytes(32).toString('base64url');
    const {service}=getCustomerAuth();
    // Conservative shared global ceiling until an authenticated perimeter supplies
    // network identity. Never trust arbitrary X-Forwarded-For to evade quotas.
    const result=parsed.data.action==='prepare'?await service.prepare(parsed.data.document,browserToken,'public-global',parsed.data.legalName):await service.requestCode({...parsed.data,browserToken});
    const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(browserCookie,browserToken,{...authCookieOptions,maxAge:3600});return response;
  }catch(e){return authFailure(e);}
}
