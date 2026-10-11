CREATE SCHEMA leal_audit;
REVOKE ALL ON SCHEMA leal_audit FROM PUBLIC;
CREATE TABLE leal_audit.actions (
 id uuid PRIMARY KEY, action varchar(50) NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 state text NOT NULL DEFAULT 'started' CHECK(state IN ('started','completed','failed')),
 outcome varchar(40), error_code varchar(40),
 session_key varchar(64), subject_key varchar(64), subject_verified boolean NOT NULL DEFAULT false,
 resource_id uuid, contract_key varchar(64), creditor varchar(40), identity_cipher text,
 debt_count integer CHECK(debt_count BETWEEN 0 AND 500), agreement_count integer CHECK(agreement_count BETWEEN 0 AND 2000)
);
CREATE TABLE leal_audit.api_calls (
 id uuid PRIMARY KEY, trace_id uuid NOT NULL REFERENCES leal_audit.actions(id) ON DELETE CASCADE,
 provider varchar(20) NOT NULL, operation varchar(50) NOT NULL, method varchar(10) NOT NULL,
 endpoint_template varchar(150) NOT NULL, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz, http_status integer CHECK(http_status BETWEEN 100 AND 599), error_kind varchar(40)
);
CREATE INDEX audit_actions_time ON leal_audit.actions(started_at);
CREATE INDEX audit_actions_subject ON leal_audit.actions(subject_key,started_at) WHERE subject_key IS NOT NULL;
CREATE INDEX audit_calls_trace ON leal_audit.api_calls(trace_id,started_at);
CREATE INDEX audit_calls_provider_time ON leal_audit.api_calls(provider,started_at);
CREATE VIEW leal_audit.integration_report AS
 SELECT a.id AS trace_id,a.resource_id,a.action,a.outcome,a.state,a.subject_key,a.subject_verified,a.contract_key,a.creditor,
 c.id AS call_id,c.provider,c.operation,c.method,c.endpoint_template,c.started_at,c.finished_at,c.http_status,c.error_kind,
 round(extract(epoch FROM (c.finished_at-c.started_at))*1000)::bigint AS duration_ms,
 row_number() OVER(PARTITION BY c.trace_id,c.provider,c.operation ORDER BY c.started_at,c.id) AS call_number
 FROM leal_audit.actions a JOIN leal_audit.api_calls c ON c.trace_id=a.id;
CREATE VIEW leal_audit.daily_integrations AS
 SELECT (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,provider,operation,
 count(*) AS calls,count(*) FILTER(WHERE http_status BETWEEN 200 AND 299 AND error_kind IS NULL) AS successful,
 count(*) FILTER(WHERE http_status>=400 OR error_kind IS NOT NULL) AS failed,
 count(*) FILTER(WHERE finished_at IS NULL) AS incomplete,
 percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) AS p95_duration_ms
 FROM leal_audit.integration_report GROUP BY 1,2,3;
CREATE VIEW leal_audit.operational_funnel AS
 SELECT (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,action,creditor,outcome,
 count(DISTINCT resource_id) FILTER(WHERE action='agreement_confirmation' AND outcome='created') AS confirmed_quotes,
 count(*) AS attempts,count(DISTINCT subject_key) AS identified_subjects,
 count(DISTINCT subject_key) FILTER(WHERE subject_verified) AS verified_subjects,
 count(*) FILTER(WHERE debt_count>0) AS portfolios_with_debts,
 count(*) FILTER(WHERE debt_count=0) AS portfolios_without_debts,
 count(*) FILTER(WHERE agreement_count>0) AS portfolios_with_agreements
 FROM leal_audit.actions GROUP BY 1,2,3,4;
CREATE FUNCTION leal_audit.purge_expired() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,leal_audit AS $$
 DELETE FROM leal_audit.actions WHERE id IN (SELECT id FROM leal_audit.actions WHERE started_at<now()-interval '180 days' ORDER BY started_at LIMIT 2000);
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA leal_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION leal_audit.purge_expired() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_portal_runtime') THEN
  GRANT USAGE ON SCHEMA leal_audit TO leal_portal_runtime;
  GRANT SELECT,INSERT,UPDATE ON leal_audit.actions,leal_audit.api_calls TO leal_portal_runtime;
  GRANT EXECUTE ON FUNCTION leal_audit.purge_expired() TO leal_portal_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_analytics_reader') THEN
  GRANT USAGE ON SCHEMA leal_audit TO leal_analytics_reader;
  GRANT SELECT ON leal_audit.integration_report,leal_audit.daily_integrations,leal_audit.operational_funnel TO leal_analytics_reader;
 END IF;
END $$;
