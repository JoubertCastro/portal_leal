import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from '../database';
import { CONSENT_VERSION, serverTrackingEvent, type BrowserTrackingEvent, type ServerTrackingEvent } from '../../domain/tracking';
import { deviceContext, subjectKey, trustedGeography } from './privacy';

export class TrackingError extends Error {
  constructor(public code: 'consent_required' | 'rate_limited' | 'invalid_event' | 'expired') { super(code); }
}
export class AnalyticsRepository {
  constructor(private db: Pool) {}
  async maintain(){
    return transaction(this.db,async client=>{
      const lease=await client.query(`INSERT INTO leal_analytics.rate_limits(key,hits,expires_at) VALUES('retention-lease',1,now()+interval '1 hour') ON CONFLICT(key) DO UPDATE SET expires_at=now()+interval '1 hour' WHERE leal_analytics.rate_limits.expires_at<=now() RETURNING key`);
      if(!lease.rowCount)return;
      await client.query("DELETE FROM leal_analytics.journeys WHERE created_at<=now()-interval '90 days'");
      await client.query('DELETE FROM leal_analytics.consents WHERE expires_at<=now()');
      await client.query("DELETE FROM leal_analytics.rate_limits WHERE expires_at<now()-interval '1 day'");
    });
  }
  async limit(key: string, limit: number, seconds: number) {
    const result = await this.db.query(`INSERT INTO leal_analytics.rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
      ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN leal_analytics.rate_limits.expires_at<=now() THEN 1 ELSE leal_analytics.rate_limits.hits+1 END,
      expires_at=CASE WHEN leal_analytics.rate_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE leal_analytics.rate_limits.expires_at END RETURNING hits`, [key, seconds]);
    if (result.rows[0].hits > limit) throw new TrackingError('rate_limited');
  }
  async consent(id: string) {
    const result = await this.db.query('SELECT granted FROM leal_analytics.consents WHERE id=$1 AND version=$2 AND expires_at>now()', [id, CONSENT_VERSION]);
    return result.rows[0]?.granted === true;
  }
  async saveConsent(id: string, granted: boolean) {
    await transaction(this.db, async client => {
      await client.query(`INSERT INTO leal_analytics.consents(id,granted,version) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET granted=$2,version=$3,updated_at=now(),expires_at=now()+interval '180 days'`, [id, granted, CONSENT_VERSION]);
      await client.query('INSERT INTO leal_analytics.consent_history(consent_id,granted,version) VALUES($1,$2,$3)', [id, granted, CONSENT_VERSION]);
      // Withdrawal erases linked journeys/events immediately, leaving only the preference receipt.
      if (!granted) await client.query('DELETE FROM leal_analytics.journeys WHERE consent_id=$1', [id]);
    });
  }
  private async lockConsent(client: PoolClient, consentId: string) {
    const result = await client.query('SELECT id FROM leal_analytics.consents WHERE id=$1 AND granted=true AND version=$2 AND expires_at>now() FOR UPDATE', [consentId, CONSENT_VERSION]);
    if (!result.rowCount) throw new TrackingError('consent_required');
  }
  async start(consentId: string, existingJourney: string | null, input: { campaignCode?: string; referrerGroup: string }, headers: Headers) {
    await this.maintain();
    await this.limit(`start:${consentId}`, 20, 3600);
    return transaction(this.db, async client => {
      await this.lockConsent(client, consentId);
      if (existingJourney) {
        const existing = await client.query("SELECT id FROM leal_analytics.journeys WHERE id=$1 AND consent_id=$2 AND expires_at>now() AND last_seen_at>now()-interval '30 minutes'", [existingJourney, consentId]);
        if (existing.rowCount) return existingJourney;
      }
      let campaign: string | null = null;
      if (input.campaignCode) {
        const result = await client.query('SELECT code FROM leal_analytics.campaigns WHERE code=$1 AND active=true', [input.campaignCode]);
        campaign = result.rows[0]?.code ?? null;
      }
      const id = randomUUID(); const device = deviceContext(headers.get('user-agent') ?? ''); const geo = trustedGeography(headers);
      await client.query(`INSERT INTO leal_analytics.journeys(id,consent_id,device,browser,referrer_group,campaign_code,country,region,city,latitude,longitude,geo_source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id,consentId,device.device,device.browser,input.referrerGroup,campaign,geo?.country??null,geo?.region??null,geo?.city??null,geo?.latitude??null,geo?.longitude??null,geo?'trusted_edge':'unknown']);
      return id;
    });
  }
  private async lockJourney(client: PoolClient, consentId: string, journeyId: string) {
    await this.lockConsent(client, consentId);
    const result = await client.query('SELECT id FROM leal_analytics.journeys WHERE id=$1 AND consent_id=$2 AND expires_at>now() FOR UPDATE', [journeyId, consentId]);
    if (!result.rowCount) throw new TrackingError('expired');
  }
  async appendBrowser(consentId: string, journeyId: string, events: BrowserTrackingEvent[]) {
    await this.limit(`events:${journeyId}`, 240, 600);
    await transaction(this.db, async client => {
      await this.lockJourney(client, consentId, journeyId);
      const count = await client.query('SELECT count(*)::int AS n FROM leal_analytics.events WHERE journey_id=$1', [journeyId]);
      if (count.rows[0].n + events.length > 500) throw new TrackingError('rate_limited');
      for (const event of events) {
        if (Math.abs(Date.now() - Date.parse(event.occurredAt)) > 300_000) throw new TrackingError('invalid_event');
        await client.query(`INSERT INTO leal_analytics.events(id,journey_id,name,source,occurred_at,document_kind,duration_ms) VALUES($1,$2,$3,'browser',$4,$5,$6) ON CONFLICT(id) DO NOTHING`, [event.id,journeyId,event.name,event.occurredAt,event.documentKind??null,event.durationMs??null]);
      }
      await client.query('UPDATE leal_analytics.journeys SET last_seen_at=now() WHERE id=$1', [journeyId]);
    });
  }
  async appendServer(consentId: string, journeyId: string, input: ServerTrackingEvent, identity?: { document: string; verified: boolean }, occurredAt = new Date()) {
    const event = serverTrackingEvent.parse(input);
    await transaction(this.db, async client => {
      await this.lockJourney(client, consentId, journeyId);
      // Identity belongs to this server event, not every action on a shared device/journey.
      await client.query(`INSERT INTO leal_analytics.events(id,journey_id,name,source,occurred_at,document_kind,duration_ms,debt_count,agreement_count,subject_key,subject_verified) VALUES($1,$2,$3,'server',$10,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`, [event.id,journeyId,event.name,event.documentKind??null,event.durationMs??null,event.debtCount??null,event.agreementCount??null,identity?subjectKey(identity.document):null,identity?.verified??false,occurredAt]);
      await client.query('UPDATE leal_analytics.journeys SET last_seen_at=now() WHERE id=$1', [journeyId]);
    });
  }
}
