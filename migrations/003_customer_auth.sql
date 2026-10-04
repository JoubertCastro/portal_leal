CREATE SCHEMA IF NOT EXISTS leal_auth;
REVOKE ALL ON SCHEMA leal_auth FROM PUBLIC;
CREATE TABLE leal_auth.selections (id_hash text PRIMARY KEY, browser_hash text NOT NULL, payload text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE leal_auth.challenges (
  id_hash text PRIMARY KEY, browser_hash text NOT NULL, phone_key text NOT NULL,
  payload text NOT NULL, code_digest text NOT NULL, attempts integer NOT NULL DEFAULT 5 CHECK(attempts BETWEEN 0 AND 5),
  state text NOT NULL CHECK(state IN ('sending','accepted','unknown','consumed')),
  message_hash text, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX challenges_phone_quota ON leal_auth.challenges(phone_key,created_at);
CREATE TABLE leal_auth.sessions (token_hash text PRIMARY KEY,browser_hash text NOT NULL,payload text NOT NULL,verified_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz);
CREATE TABLE leal_auth.rate_limits (key text PRIMARY KEY,hits integer NOT NULL,reset_at timestamptz NOT NULL);
CREATE TABLE leal_auth.consents (challenge_hash text PRIMARY KEY,payload text NOT NULL,confirmed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX selections_expiry ON leal_auth.selections(expires_at);
CREATE INDEX sessions_expiry ON leal_auth.sessions(expires_at);
REVOKE ALL ON ALL TABLES IN SCHEMA leal_auth FROM PUBLIC;
