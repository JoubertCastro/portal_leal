CREATE SCHEMA leal_admin;
REVOKE ALL ON SCHEMA leal_admin FROM PUBLIC;
CREATE TABLE leal_admin.account (
 id integer PRIMARY KEY CHECK(id=1), password_hash text, phone_cipher text,
 bootstrap_phone_key text NOT NULL, version integer NOT NULL DEFAULT 1,
 activated_at timestamptz
);
CREATE TABLE leal_admin.sessions (
 token_hash text PRIMARY KEY, stage text NOT NULL CHECK(stage IN ('setup','otp','verified')),
 version integer NOT NULL, setup_password_hash text, phone_cipher text,
 code_digest text, attempts integer NOT NULL DEFAULT 0, code_expires_at timestamptz,
 sent_at timestamptz, expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_session_expiry ON leal_admin.sessions(expires_at);
CREATE TABLE leal_admin.limits(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE leal_admin.events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,action varchar(40) NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON ALL TABLES IN SCHEMA leal_admin FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_portal_runtime') THEN
 GRANT USAGE ON SCHEMA leal_admin TO leal_portal_runtime;
 GRANT SELECT,UPDATE ON leal_admin.account TO leal_portal_runtime;
 GRANT SELECT,INSERT,UPDATE,DELETE ON leal_admin.sessions,leal_admin.limits,leal_admin.events TO leal_portal_runtime;
 GRANT USAGE ON ALL SEQUENCES IN SCHEMA leal_admin TO leal_portal_runtime;
 GRANT USAGE ON SCHEMA leal_audit,leal_analytics TO leal_portal_runtime;
 GRANT SELECT ON leal_audit.integration_report,leal_audit.daily_integrations,leal_audit.operational_funnel,leal_audit.negotiations,
 leal_analytics.daily_funnel_v2,leal_analytics.journey_funnel_v2,leal_analytics.heatmap_cells,leal_analytics.timeline,leal_analytics.access_map TO leal_portal_runtime;
 END IF;
END $$;
