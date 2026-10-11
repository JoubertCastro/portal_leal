ALTER TABLE leal_analytics.events DROP CONSTRAINT event_taxonomy;
ALTER TABLE leal_analytics.events ADD CONSTRAINT event_taxonomy CHECK (
 (source='browser' AND name IN ('portal_viewed','document_started','document_completed','document_invalid','access_submitted','access_unavailable','help_clicked','demo_opened','page_hidden','page_resumed','control_clicked','human_handoff')) OR
 (source='server' AND name IN ('registration_requested','registration_not_found','registration_found','registration_no_contacts','registration_review_required','registration_failed','otp_requested','authentication_completed','portfolio_loaded','portfolio_failed','agreement_confirmed','simulation_requested','simulation_completed','agreement_confirmation_requested','agreement_confirmation_unknown','agreement_confirmation_failed','boleto_available','boleto_whatsapp_accepted'))
);
CREATE TABLE leal_analytics.interactions (
 event_id uuid PRIMARY KEY REFERENCES leal_analytics.events(id) ON DELETE CASCADE,
 attributes jsonb NOT NULL CHECK(jsonb_typeof(attributes)='object' AND octet_length(attributes::text)<1500)
);
CREATE VIEW leal_analytics.heatmap_cells AS
 SELECT (e.received_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
 attributes->>'layout' AS layout,attributes->>'page' AS page,attributes->>'screen' AS screen,
 attributes->>'control' AS control,attributes->>'viewport' AS viewport,attributes->>'modality' AS modality,
 LEAST(9,(attributes->>'elementX')::int/10) AS element_x_cell,LEAST(9,(attributes->>'elementY')::int/10) AS element_y_cell,
 LEAST(9,(attributes->>'pageX')::int/10) AS page_x_cell,LEAST(9,(attributes->>'pageY')::int/10) AS page_y_cell,
 count(*) AS clicks,count(DISTINCT e.journey_id) AS journeys
 FROM leal_analytics.interactions i JOIN leal_analytics.events e ON e.id=i.event_id
 WHERE e.name='control_clicked' GROUP BY 1,2,3,4,5,6,7,8,9,10,11;
CREATE VIEW leal_analytics.journey_funnel_v2 AS
 SELECT f.*,coalesce(x.has_debts,false) AS has_debts,coalesce(x.simulated,false) AS simulated,
 coalesce(x.confirmed,false) AS confirmed,coalesce(x.human_handoff,false) AS human_handoff,
 coalesce(x.boleto_available,false) AS boleto_available,coalesce(x.whatsapp_accepted,false) AS whatsapp_accepted
 FROM leal_analytics.journey_funnel f LEFT JOIN (
 SELECT journey_id,bool_or(name='portfolio_loaded' AND debt_count>0) AS has_debts,
 bool_or(name='simulation_completed') AS simulated,bool_or(name='agreement_confirmed') AS confirmed,
 bool_or(name='human_handoff') AS human_handoff,bool_or(name='boleto_available') AS boleto_available,
 bool_or(name='boleto_whatsapp_accepted') AS whatsapp_accepted
 FROM leal_analytics.events GROUP BY journey_id) x ON x.journey_id=f.id;
CREATE VIEW leal_analytics.daily_funnel_v2 AS
 SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,campaign_code,device,
 count(*) AS consented_journeys,count(*) FILTER(WHERE document_completed) AS document_completed,
 count(*) FILTER(WHERE access_submitted) AS submitted,count(*) FILTER(WHERE registration_not_found) AS not_found,
 count(*) FILTER(WHERE registration_found) AS found,count(*) FILTER(WHERE authenticated) AS authenticated,
 count(*) FILTER(WHERE has_debts) AS with_debts,count(*) FILTER(WHERE no_debt_returned) AS without_debts,
 count(*) FILTER(WHERE has_agreement) AS existing_agreement,count(*) FILTER(WHERE simulated) AS simulated,
 count(*) FILTER(WHERE confirmed) AS negotiated,count(*) FILTER(WHERE human_handoff) AS human_handoff,
 count(*) FILTER(WHERE boleto_available) AS boleto_available,count(*) FILTER(WHERE whatsapp_accepted) AS whatsapp_accepted,
 count(*) FILTER(WHERE outcome IN ('completed_not_submitted','typing_abandoned','authentication_abandoned')) AS abandoned
 FROM leal_analytics.journey_funnel_v2 GROUP BY 1,2,3;
REVOKE ALL ON leal_analytics.interactions FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_portal_runtime') THEN
 GRANT SELECT,INSERT ON leal_analytics.interactions TO leal_portal_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='leal_analytics_reader') THEN
 GRANT SELECT ON leal_analytics.heatmap_cells,leal_analytics.journey_funnel_v2,leal_analytics.daily_funnel_v2 TO leal_analytics_reader;
 END IF;
END $$;
