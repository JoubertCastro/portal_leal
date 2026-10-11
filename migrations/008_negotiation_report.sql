-- One confirmed proposal across the retained history, regardless of request replay.
CREATE VIEW leal_audit.negotiations AS
 SELECT resource_id AS quote_id,min(started_at) AS first_confirmed_at,
 max(creditor) AS creditor,max(subject_key) AS subject_key,max(contract_key) AS contract_key
 FROM leal_audit.actions
 WHERE action='agreement_confirmation' AND outcome='created' AND resource_id IS NOT NULL
 GROUP BY resource_id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_analytics_reader') THEN
 GRANT SELECT ON leal_audit.negotiations TO leal_analytics_reader;
 END IF;
END $$;
