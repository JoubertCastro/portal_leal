-- Remove only abandoned simulations. Accepted operations retain their audit and duplicate lock.
CREATE FUNCTION leal_creditor.purge_abandoned_quotes() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, leal_creditor AS $$
  DELETE FROM leal_creditor.quotes WHERE id IN (
    SELECT id FROM leal_creditor.quotes WHERE state='prepared' AND accepted_at IS NULL
      AND expires_at < now()-interval '1 day' ORDER BY expires_at LIMIT 2000
  );
$$;
REVOKE ALL ON FUNCTION leal_creditor.purge_abandoned_quotes() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_portal_runtime') THEN
  GRANT EXECUTE ON FUNCTION leal_creditor.purge_abandoned_quotes() TO leal_portal_runtime;
 END IF;
END $$;
