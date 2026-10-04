import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {apiError,validOrigin} from '@/server/http';
import {authReadiness,getCustomerAuth} from '@/server/runtime';
import {authFailure,browserCookie,sessionCookie,authCookieOptions} from '@/server/customer-auth-http';
export async function GET(){
  const jar=await cookies();const session=jar.get(sessionCookie)?.value;const browser=jar.get(browserCookie)?.value;
  if(!authReadiness.available||!session||!browser)return apiError(401,'UNAUTHENTICATED','Entre para acessar seus dados.');
  try{return NextResponse.json(await getCustomerAuth().service.portfolio(session,browser),{headers:{'Cache-Control':'no-store'}});}catch(e){return authFailure(e);}
}
export async function DELETE(request:Request){
  if(!validOrigin(request))return apiError(403,'ORIGIN_DENIED','Solicitação não permitida.');
  try{const token=(await cookies()).get(sessionCookie)?.value;if(token&&authReadiness.available)await getCustomerAuth().store.revoke(token);
    const response=NextResponse.json({signedOut:true},{headers:{'Cache-Control':'no-store'}});response.cookies.set(sessionCookie,'',{...authCookieOptions,maxAge:0});return response;
  }catch(e){const response=authFailure(e);response.cookies.set(sessionCookie,'',{...authCookieOptions,maxAge:0});return response;}
}
