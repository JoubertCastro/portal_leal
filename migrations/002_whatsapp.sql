CREATE SCHEMA IF NOT EXISTS leal_whatsapp;
REVOKE ALL ON SCHEMA leal_whatsapp FROM PUBLIC;
-- No raw payload, phone, document, code, message text or provider error text.
CREATE TABLE leal_whatsapp.delivery_events (
  message_hash text NOT NULL CHECK (message_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('sent','delivered','read','failed')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_hash,status,occurred_at)
);
CREATE INDEX delivery_events_retention ON leal_whatsapp.delivery_events(received_at);
REVOKE ALL ON ALL TABLES IN SCHEMA leal_whatsapp FROM PUBLIC;
