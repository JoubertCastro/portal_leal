import 'server-only';
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import type {OtpSender,RateLimiter} from '../domain/contracts';
import {AccessError,type CustomerAccessStore,type CodeChallengeIssuer,type PendingSelection,type VerifiedCustomerSession} from './customer-access';
import {transaction} from './database';
import type {RecordScope} from './integrations/sic';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
type IssueInput=Parameters<CodeChallengeIssuer['issue']>[0];
export class CustomerAuthStore implements CustomerAccessStore,CodeChallengeIssuer,RateLimiter {
  private key:Buffer;
  constructor(private db:Pool,private sender:OtpSender,encryptionKey:string,private digestKey:string){
    if(!/^[a-f0-9]{64}$/i.test(encryptionKey)||digestKey.length<32)throw new AccessError('unavailable');
    this.key=Buffer.from(encryptionKey,'hex');
  }
  private seal(value:unknown,purpose:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(purpose));return Buffer.concat([iv,cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
  private open<T>(value:string,purpose:string):T{const b=Buffer.from(value,'base64url');const decipher=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString('utf8'));}
  private digest(value:string){return createHmac('sha256',this.digestKey).update(value).digest('hex');}
  async take(key:string,limit:number,windowMs:number){
    const r=await this.db.query(`INSERT INTO leal_auth.rate_limits(key,hits,reset_at) VALUES($1,1,now()+$2*interval '1 millisecond') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN leal_auth.rate_limits.reset_at<=now() THEN 1 ELSE leal_auth.rate_limits.hits+1 END, reset_at=CASE WHEN leal_auth.rate_limits.reset_at<=now() THEN EXCLUDED.reset_at ELSE leal_auth.rate_limits.reset_at END RETURNING hits,reset_at`,[key,windowMs]);
    return {allowed:r.rows[0].hits<=limit,retryAfterSeconds:Math.max(1,Math.ceil((new Date(r.rows[0].reset_at).valueOf()-Date.now())/1000))};
  }
  async saveSelection(selection:PendingSelection){await this.db.query('INSERT INTO leal_auth.selections(id_hash,browser_hash,payload,expires_at) VALUES($1,$2,$3,$4)',[selection.idHash,selection.browserTokenHash,this.seal(selection.options,'selection:'+selection.idHash),new Date(selection.expiresAt)]);}
  async claimSelection(input:Parameters<CustomerAccessStore['claimSelection']>[0]){
    return transaction(this.db,async c=>{const r=await c.query('SELECT payload FROM leal_auth.selections WHERE id_hash=$1 AND browser_hash=$2 AND expires_at>now() FOR UPDATE',[input.idHash,input.browserTokenHash]);if(!r.rowCount)return null;
      const options=this.open<PendingSelection['options']>(r.rows[0].payload,'selection:'+input.idHash);const selected=options.find(o=>o.id===input.optionId);if(!selected)return null;
      await c.query('DELETE FROM leal_auth.selections WHERE id_hash=$1',[input.idHash]);return selected;});
  }
  async issue(input:IssueInput){
    const id=randomBytes(32).toString('base64url');const idHash=hash(id);const code=String(randomInt(0,1000000)).padStart(6,'0');const phoneKey=this.digest('phone:'+input.phone);
    await transaction(this.db,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[phoneKey]);
      const quota=await c.query("SELECT count(*)::int AS n,max(created_at) AS latest FROM leal_auth.challenges WHERE phone_key=$1 AND created_at>now()-interval '15 minutes'",[phoneKey]);
      if(quota.rows[0].n>=3||(quota.rows[0].latest&&Date.now()-new Date(quota.rows[0].latest).valueOf()<60000))throw new AccessError('rate_limited');
      await c.query("UPDATE leal_auth.challenges SET attempts=0 WHERE phone_key=$1 AND state IN ('sending','accepted','unknown')",[phoneKey]);
      await c.query("INSERT INTO leal_auth.challenges(id_hash,browser_hash,phone_key,payload,code_digest,state,expires_at) VALUES($1,$2,$3,$4,$5,'sending',now()+interval '5 minutes')",[idHash,input.browserTokenHash,phoneKey,this.seal({scope:input.scope,phone:input.phone,consent:input.consent},'challenge:'+idHash),this.digest(idHash+':'+code)]);
    });
    try{const sent=await this.sender.send(input.phone,code);await this.db.query("UPDATE leal_auth.challenges SET state='accepted',message_hash=$2 WHERE id_hash=$1 AND state='sending'",[idHash,hash(sent.messageId)]);}
    catch{await this.db.query("UPDATE leal_auth.challenges SET state='unknown',attempts=0 WHERE id_hash=$1 AND state='sending'",[idHash]).catch(()=>{});throw new AccessError('unavailable');}
    return {challengeId:id};
  }
  async verify(challengeId:string,browserToken:string,code:string):Promise<string|null>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(challengeId)||!/^[A-Za-z0-9_-]{43}$/.test(browserToken)||!/^\d{6}$/.test(code))return null;
    const idHash=hash(challengeId);const browserHash=hash(browserToken);
    return transaction(this.db,async c=>{
      const r=await c.query("SELECT payload,code_digest FROM leal_auth.challenges WHERE id_hash=$1 AND browser_hash=$2 AND expires_at>now() AND state='accepted' AND attempts>0 FOR UPDATE",[idHash,browserHash]);if(!r.rowCount)return null;
      if(!timingSafeEqual(Buffer.from(r.rows[0].code_digest,'hex'),Buffer.from(this.digest(idHash+':'+code),'hex'))){await c.query('UPDATE leal_auth.challenges SET attempts=attempts-1 WHERE id_hash=$1',[idHash]);return null;}
      const data=this.open<{scope:RecordScope;phone:string;consent:IssueInput['consent']}>(r.rows[0].payload,'challenge:'+idHash);
      const token=randomBytes(32).toString('base64url');const tokenHash=hash(token);
      await c.query("UPDATE leal_auth.challenges SET state='consumed',attempts=0 WHERE id_hash=$1",[idHash]);
      await c.query("INSERT INTO leal_auth.sessions(token_hash,browser_hash,payload,verified_at,expires_at) VALUES($1,$2,$3,now(),now()+interval '30 minutes')",[tokenHash,browserHash,this.seal(data.scope,'session:'+tokenHash)]);
      await c.query('INSERT INTO leal_auth.consents(challenge_hash,payload) VALUES($1,$2)',[idHash,this.seal({phone:data.phone,document:data.scope.document,consent:data.consent},'consent:'+idHash)]);
      return token;
    });
  }
  async findSession(tokenHash:string):Promise<VerifiedCustomerSession|null>{
    const r=await this.db.query('SELECT * FROM leal_auth.sessions WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL',[tokenHash]);if(!r.rowCount)return null;const s=r.rows[0];
    return {tokenHash,browserTokenHash:s.browser_hash,scope:this.open<RecordScope>(s.payload,'session:'+tokenHash),verifiedAt:new Date(s.verified_at).valueOf(),expiresAt:new Date(s.expires_at).valueOf(),revokedAt:null};
  }
  async revoke(token:string){await this.db.query('UPDATE leal_auth.sessions SET revoked_at=now() WHERE token_hash=$1',[hash(token)]);}
  async maintain(){await transaction(this.db,async c=>{
    await c.query('DELETE FROM leal_auth.selections WHERE expires_at<now()');
    await c.query("DELETE FROM leal_auth.challenges WHERE created_at<now()-interval '1 day'");
    await c.query('DELETE FROM leal_auth.sessions WHERE expires_at<now() OR revoked_at IS NOT NULL');
    await c.query('DELETE FROM leal_auth.rate_limits WHERE reset_at<now()');
    await c.query("DELETE FROM leal_auth.consents WHERE confirmed_at<now()-interval '180 days'");
  });}
}
