import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {getAdmin,adminCookie,adminFailure} from '@/server/admin-http';
import {getDatabase} from '@/server/database';
import {reportInput,adminReport} from '@/server/admin-reports';
import {AdminError} from '@/server/admin-auth';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const token=(await cookies()).get(adminCookie)?.value;
 if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AdminError('expired');
 const admin=getAdmin();await admin.require(token);
 const input=reportInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!input.success)throw new AdminError('invalid');
 await admin.event('report_'+input.data.report);const result=await adminReport(getDatabase(),input.data);
 return NextResponse.json(result,{headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
 }catch(e){return adminFailure(e);}}
