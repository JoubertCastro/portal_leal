import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getAdmin,adminCookie,adminCookieOptions,adminFailure} from '@/server/admin-http';
import {AdminError} from '@/server/admin-auth';
import {authBody} from '@/server/customer-auth-http';
import {validOrigin,apiError} from '@/server/http';
export const runtime='nodejs';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('login'),username:z.string().max(40),password:z.string().max(128)}).strict(),
 z.object({action:z.literal('setup'),password:z.string().min(12).max(128),phone:z.string().max(25)}).strict(),
 z.object({action:z.literal('send')}).strict(),z.object({action:z.literal('verify'),code:z.string().regex(/^\d{6}$/)}).strict(),z.object({action:z.literal('logout')}).strict()
]);
export async function GET(){try{const token=(await cookies()).get(adminCookie)?.value;if(!token)return NextResponse.json({stage:'login'},{headers:{'Cache-Control':'no-store'}});return NextResponse.json(await getAdmin().status(token),{headers:{'Cache-Control':'no-store'}});}catch(e){if(e instanceof AdminError&&e.code==='expired')return NextResponse.json({stage:'login'},{headers:{'Cache-Control':'no-store'}});return adminFailure(e);}}
export async function POST(request:Request){
 if(!validOrigin(request))return apiError(403,'ORIGIN_DENIED','Solicitação não permitida.');
 try{const input=schema.safeParse(await authBody(request));if(!input.success)throw new AdminError('invalid');const admin=getAdmin();let token=(await cookies()).get(adminCookie)?.value??'';const value=input.data;
  if(value.action==='login')token=await admin.login(value.username,value.password);
  else if(value.action==='setup')await admin.send(token,value);
  else if(value.action==='send')await admin.send(token);
  else if(value.action==='verify')token=await admin.verify(token,value.code);
  else {await admin.logout(token);token='';}
  const response=NextResponse.json(token?await admin.status(token):{stage:'login'},{headers:{'Cache-Control':'no-store'}});response.cookies.set(adminCookie,token,{...adminCookieOptions,maxAge:token?8*3600:0});return response;
 }catch(e){return adminFailure(e);}
}
