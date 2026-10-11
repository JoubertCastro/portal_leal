import 'server-only';
import {AdminAuth,AdminError} from './admin-auth';
import {getDatabase} from './database';
import {getOtpSender} from './runtime';
import {apiError} from './http';
export const adminCookie='__Host-leal_admin';
export const adminCookieOptions={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/',maxAge:8*3600};
export function getAdmin(){return new AdminAuth(getDatabase(),{send:(to,code)=>getOtpSender().send(to,code)});}
export function adminFailure(error:unknown){
 if(error instanceof AdminError){
  if(error.code==='limited')return apiError(429,'ADMIN_LIMITED','Muitas tentativas. Aguarde antes de tentar novamente.');
  if(error.code==='expired')return apiError(401,'ADMIN_EXPIRED','Entre novamente para continuar.');
  if(error.code==='invalid')return apiError(400,'ADMIN_INVALID','Confira os dados, o telefone autorizado e o código informado.');
 }
 return apiError(503,'ADMIN_UNAVAILABLE','Não foi possível concluir a solicitação. Tente novamente em instantes.');
}
