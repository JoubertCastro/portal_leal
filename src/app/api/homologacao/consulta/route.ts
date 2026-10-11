import {NextResponse} from 'next/server';
export async function POST(){return NextResponse.json({error:{code:'DISABLED',message:'Recurso desativado.'}},{status:410,headers:{'Cache-Control':'no-store'}});}
