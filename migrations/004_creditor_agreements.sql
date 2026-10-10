CREATE SCHEMA IF NOT EXISTS leal_creditor;
REVOKE ALL ON SCHEMA leal_creditor FROM PUBLIC;
CREATE TABLE leal_creditor.quotes (
  id uuid PRIMARY KEY, subject_key text NOT NULL, target_key text NOT NULL,
  session_hash text NOT NULL, payload text NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','processing','unknown','changed','failed','created')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz, notice_version text, option_index integer,
  offer_payload text, result_payload text
);
-- Shared across sessions and replicas: an ambiguous POST must never be retried.
CREATE UNIQUE INDEX one_contract_operation ON leal_creditor.quotes(target_key)
  WHERE state IN ('processing','unknown','created');
CREATE INDEX quotes_expiry ON leal_creditor.quotes(expires_at) WHERE state='prepared';
CREATE TABLE leal_creditor.deliveries (
  delivery_key text PRIMARY KEY, state text NOT NULL CHECK(state IN ('sending','accepted','unknown')),
  created_at timestamptz NOT NULL DEFAULT now(), message_hash text
);
REVOKE ALL ON ALL TABLES IN SCHEMA leal_creditor FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_portal_runtime') THEN
  GRANT USAGE ON SCHEMA leal_creditor TO leal_portal_runtime;
  GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA leal_creditor TO leal_portal_runtime;
 END IF;
END $$;
