import 'server-only';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,randomInt,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import type {Pool} from 'pg';
import {transaction} from './database';
import type {OtpSender} from '../domain/contracts';
const scrypt=promisify(derive);
export class AdminError extends Error{constructor(public code:'invalid'|'expired'|'limited'|'unavailable'){super(code);}}
export function adminDigest(value:string){const secret=process.env.AUTH_DIGEST_KEY??'';if(secret.length<32)throw new AdminError('unavailable');return createHmac('sha256',secret).update('admin:v1:'+value).digest('hex');}
export function adminPhone(input:string){const digits=input.replace(/\D/g,'');const value=digits.length===11?'55'+digits:digits;if(!/^55[1-9]\d9\d{8}$/.test(value))throw new AdminError('invalid');return '+'+value;}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64) as Buffer;return salt+':'+hash.toString('hex');}
async function matches(password:string,saved:string){const [salt,hex]=saved.split(':');if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hex))return false;return timingSafeEqual(await scrypt(password,salt,64) as Buffer,Buffer.from(hex,'hex'));}
function key(){const value=process.env.AUTH_ENCRYPTION_KEY??'';if(!/^[a-f0-9]{64}$/i.test(value))throw new AdminError('unavailable');return Buffer.from(value,'hex');}
function seal(phone:string){const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from('admin-phone:v1'));return Buffer.concat([iv,c.update(phone),c.final(),c.getAuthTag()]).toString('base64url');}
function open(value:string){const b=Buffer.from(value,'base64url');const c=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));c.setAAD(Buffer.from('admin-phone:v1'));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();}
type Session={token_hash:string;stage:'setup'|'otp'|'verified';version:number;setup_password_hash:string|null;phone_cipher:string|null;code_digest:string|null;attempts:number;code_expires_at:Date|null};
export class AdminAuth{
 constructor(private db:Pool,private sender:OtpSender){}
 async event(action:string){await this.db.query('INSERT INTO leal_admin.events(action) VALUES($1)',[action]);}
 async limit(name:string,max:number,seconds:number){const r=await this.db.query(`INSERT INTO leal_admin.limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN leal_admin.limits.expires_at<=now() THEN 1 ELSE leal_admin.limits.hits+1 END,expires_at=CASE WHEN leal_admin.limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE leal_admin.limits.expires_at END RETURNING hits`,[name,seconds]);if(r.rows[0].hits>max)throw new AdminError('limited');}
 async session(token:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AdminError('expired');const r=await this.db.query<Session>(`SELECT s.* FROM leal_admin.sessions s JOIN leal_admin.account a ON a.id=1 AND a.version=s.version WHERE token_hash=$1 AND expires_at>now() AND last_seen_at>now()-interval '30 minutes'`,[adminDigest(token)]);if(!r.rowCount)throw new AdminError('expired');return r.rows[0];}
 async status(token:string){const s=await this.session(token);return {stage:s.stage,phone:s.phone_cipher?('(**) *****-'+open(s.phone_cipher).slice(-4)):null};}
 async login(username:string,password:string){
  await this.limit('login-global',60,900);await this.db.query('DELETE FROM leal_admin.sessions WHERE expires_at<now()');await this.db.query("DELETE FROM leal_admin.limits WHERE expires_at<now()-interval '1 day'");await this.db.query("DELETE FROM leal_admin.events WHERE created_at<now()-interval '180 days'");
  const blocked=await this.db.query("SELECT 1 FROM leal_admin.limits WHERE key='login-failed' AND expires_at>now() AND hits>=10");if(blocked.rowCount)throw new AdminError('limited');
  const result=await this.db.query('SELECT * FROM leal_admin.account WHERE id=1');const account=result.rows[0];if(!account)throw new AdminError('unavailable');
  const correct=account.password_hash?await matches(password,account.password_hash):timingSafeEqual(Buffer.from(adminDigest(password)),Buffer.from(adminDigest('admin')));
  if(username!=='admin'||!correct){await this.event('login_failed');await this.limit('login-failed',10,900);throw new AdminError('invalid');}
  const token=randomBytes(32).toString('base64url');const stage=account.password_hash?'otp':'setup';
  await this.db.query("INSERT INTO leal_admin.sessions(token_hash,stage,version,phone_cipher,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')",[adminDigest(token),stage,account.version,account.phone_cipher]);
  await this.event(stage==='setup'?'setup_started':'password_verified');return token;
 }
 async send(token:string,input?:{password:string;phone:string}){
  const session=await this.session(token);if(session.stage==='verified')throw new AdminError('invalid');
  await this.limit('send:'+session.token_hash,10,900);
  if(session.stage==='setup')await this.limit('enrollment-global',30,900);
  let phone:string;let passwordHash:string|null=null;
  if(session.stage==='setup'){
   if(!input||input.password.trim().length<12||input.password.length>128||/^(.)\1+$/.test(input.password)||['admin','adminadminadmin','passwordpassword','123456789012'].includes(input.password.toLowerCase()))throw new AdminError('invalid');
   phone=adminPhone(input.phone);const account=await this.db.query('SELECT bootstrap_phone_key FROM leal_admin.account WHERE id=1');
   if(adminDigest('phone:'+phone)!==account.rows[0]?.bootstrap_phone_key)throw new AdminError('invalid');
   passwordHash=await hashPassword(input.password);
  }else{if(!session.phone_cipher)throw new AdminError('invalid');phone=open(session.phone_cipher);}
  await this.limit('otp-global',5,3600);
  const code=randomInt(100000,1000000).toString();
  const updated=await this.db.query("UPDATE leal_admin.sessions SET stage='otp',setup_password_hash=COALESCE($2,setup_password_hash),phone_cipher=$3,code_digest=$4,attempts=5,code_expires_at=now()+interval '5 minutes',sent_at=now() WHERE token_hash=$1 AND (sent_at IS NULL OR sent_at<now()-interval '60 seconds') RETURNING token_hash",[session.token_hash,passwordHash,seal(phone),adminDigest(session.token_hash+':'+code)]);
  if(!updated.rowCount)throw new AdminError('limited');
  await this.event('code_requested');await this.sender.send(phone,code);await this.event('code_accepted');
 }
 async verify(token:string,code:string){
  const session=await this.session(token);await this.limit('verify:'+session.token_hash,30,300);const newToken=randomBytes(32).toString('base64url');
  const result=await transaction(this.db,async c=>{
   // Account lock serializes enrollment against all concurrent bootstrap sessions.
   const a=(await c.query('SELECT * FROM leal_admin.account WHERE id=1 FOR UPDATE')).rows[0];
   const s=(await c.query<Session>('SELECT * FROM leal_admin.sessions WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',[session.token_hash])).rows[0];
   if(!s||s.version!==a.version||s.stage!=='otp'||!s.code_digest||s.attempts<=0||!s.code_expires_at||new Date(s.code_expires_at).getTime()<=Date.now())return false;
   if(!/^\d{6}$/.test(code)||!timingSafeEqual(Buffer.from(s.code_digest),Buffer.from(adminDigest(s.token_hash+':'+code)))){await c.query('UPDATE leal_admin.sessions SET attempts=attempts-1 WHERE token_hash=$1',[s.token_hash]);return false;}
   let version=a.version;
   if(s.setup_password_hash){if(a.password_hash)return false;version++;await c.query('UPDATE leal_admin.account SET password_hash=$1,phone_cipher=$2,version=$3,activated_at=now() WHERE id=1',[s.setup_password_hash,s.phone_cipher,version]);await c.query('DELETE FROM leal_admin.sessions');}
   else await c.query('DELETE FROM leal_admin.sessions WHERE token_hash=$1',[s.token_hash]);
   await c.query("INSERT INTO leal_admin.sessions(token_hash,stage,version,phone_cipher,expires_at) VALUES($1,'verified',$2,$3,now()+interval '8 hours')",[adminDigest(newToken),version,s.phone_cipher]);
   await c.query("DELETE FROM leal_admin.limits WHERE key='login-failed'");return true;
  });
  await this.event(result?'login_completed':'code_failed');if(!result)throw new AdminError('invalid');return newToken;
 }
 async require(token:string){const s=await this.session(token);if(s.stage!=='verified')throw new AdminError('expired');await this.limit('report:'+s.token_hash,120,60);await this.db.query('UPDATE leal_admin.sessions SET last_seen_at=now() WHERE token_hash=$1',[s.token_hash]);return s;}
 async logout(token:string){await this.db.query('DELETE FROM leal_admin.sessions WHERE token_hash=$1',[adminDigest(token)]);await this.event('logout');}
}
