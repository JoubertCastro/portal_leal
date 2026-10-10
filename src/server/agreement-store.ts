import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from './database';
import { AccessError } from './customer-access';
import { AGREEMENT_NOTICE, AGREEMENT_NOTICE_VERSION, type AgreementQuote, type AgreementOperation, type AgreementState } from '../domain/agreement';

export interface AgreementActor { document: string; contract: string; session: string }
export class AgreementStore {
  private key: Buffer;
  constructor(private db: Pool, encryptionKey: string, private digestKey: string) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey) || digestKey.length < 32) throw new AccessError('unavailable');
    this.key = Buffer.from(encryptionKey, 'hex');
  }
  private digest(value: string) { return createHmac('sha256', this.digestKey).update('creditor:v1:' + value).digest('hex'); }
  private keys(actor: AgreementActor) { return [this.digest(actor.document), this.digest(actor.document + ':ARC4U:' + actor.contract), createHash('sha256').update(actor.session).digest('hex')]; }
  private seal(value: unknown, purpose: string) {
    const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', this.key, iv); c.setAAD(Buffer.from(purpose));
    return Buffer.concat([iv, c.update(JSON.stringify(value)), c.final(), c.getAuthTag()]).toString('base64url');
  }
  private open<T>(value: string, purpose: string): T {
    const b = Buffer.from(value, 'base64url'); const d = createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12));
    d.setAAD(Buffer.from(purpose)); d.setAuthTag(b.subarray(-16)); return JSON.parse(Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString());
  }
  async prepare(actor: AgreementActor, quote: AgreementQuote) {
    const id = randomUUID(); const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.db.query('INSERT INTO leal_creditor.quotes(id,subject_key,target_key,session_hash,payload,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [id, ...this.keys(actor), this.seal({ ...quote, notice: AGREEMENT_NOTICE, noticeVersion: AGREEMENT_NOTICE_VERSION }, 'quote:' + id), expiresAt]);
    return { quoteId: id, expiresAt: expiresAt.toISOString(), noticeVersion: AGREEMENT_NOTICE_VERSION };
  }
  async get(actor: AgreementActor, id: string) {
    const [subject, target, session] = this.keys(actor);
    const r = await this.db.query('SELECT * FROM leal_creditor.quotes WHERE id=$1 AND subject_key=$2 AND target_key=$3 AND session_hash=$4', [id, subject, target, session]);
    if (!r.rowCount) throw new AccessError('invalid_request');
    const row = r.rows[0];
    return { quote: this.open<AgreementQuote>(row.payload, 'quote:' + id), expiresAt: new Date(row.expires_at).valueOf(), state: row.state as AgreementState,
      operation: { quoteId: id, state: row.state, ...(row.result_payload ? this.open<{ agreementId: string }>(row.result_payload, 'result:' + id) : {}) } as AgreementOperation };
  }
  async active(actor: AgreementActor): Promise<AgreementOperation | null> {
    const [subject, target] = this.keys(actor);
    const r = await this.db.query("SELECT id,state,result_payload FROM leal_creditor.quotes WHERE subject_key=$1 AND target_key=$2 AND state IN ('processing','unknown','created')", [subject, target]);
    if (!r.rowCount) return null;
    const row = r.rows[0];
    return { quoteId: row.id, state: row.state, ...(row.result_payload ? this.open<{ agreementId: string }>(row.result_payload, 'result:' + row.id) : {}) };
  }
  async claim(actor: AgreementActor, id: string, optionIndex: number): Promise<boolean> {
    const [subject, target, session] = this.keys(actor);
    return transaction(this.db, async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [target]);
      const active = await db.query("SELECT id FROM leal_creditor.quotes WHERE target_key=$1 AND state IN ('processing','unknown','created')", [target]);
      if (active.rowCount) return false;
      const r = await db.query("UPDATE leal_creditor.quotes SET state='processing',accepted_at=now(),notice_version=$5,option_index=$6 WHERE id=$1 AND subject_key=$2 AND target_key=$3 AND session_hash=$4 AND state='prepared' AND expires_at>now() RETURNING id", [id, subject, target, session, AGREEMENT_NOTICE_VERSION, optionIndex]);
      return !!r.rowCount;
    });
  }
  async saveOffer(id: string, offerId: string) { await this.db.query("UPDATE leal_creditor.quotes SET offer_payload=$2 WHERE id=$1 AND state='processing'", [id, this.seal({ offerId }, 'offer:' + id)]); }
  async finish(id: string, state: 'created' | 'changed' | 'failed' | 'unknown', agreementId?: string) {
    await this.db.query("UPDATE leal_creditor.quotes SET state=$2,result_payload=$3 WHERE id=$1 AND state='processing'", [id, state, agreementId ? this.seal({ agreementId }, 'result:' + id) : null]);
  }
  deliveryKey(document: string, agreementId: string, installment: string) { return this.digest(`boleto:${document}:${agreementId}:${installment}`); }
  async claimDelivery(key: string) {
    return !!(await this.db.query("INSERT INTO leal_creditor.deliveries(delivery_key,state) VALUES($1,'sending') ON CONFLICT DO NOTHING RETURNING delivery_key", [key])).rowCount;
  }
  async deliveryState(key: string): Promise<string> { return (await this.db.query('SELECT state FROM leal_creditor.deliveries WHERE delivery_key=$1', [key])).rows[0]?.state ?? 'unknown'; }
  async finishDelivery(key: string, messageId?: string) { await this.db.query('UPDATE leal_creditor.deliveries SET state=$2,message_hash=$3 WHERE delivery_key=$1', [key, messageId ? 'accepted' : 'unknown', messageId ? createHash('sha256').update(messageId).digest('hex') : null]); }
}
