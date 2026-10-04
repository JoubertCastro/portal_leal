CREATE SCHEMA leal_analytics;
REVOKE ALL ON SCHEMA leal_analytics FROM PUBLIC;

CREATE TABLE leal_analytics.consents (
 id uuid PRIMARY KEY,
 granted boolean NOT NULL,
 version text NOT NULL CHECK (length(version) <= 40),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '180 days'
);
CREATE TABLE leal_analytics.consent_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 consent_id uuid NOT NULL REFERENCES leal_analytics.consents(id) ON DELETE CASCADE,
 granted boolean NOT NULL, version text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE leal_analytics.campaigns (
 code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_-]{0,63}$'),
 source text NOT NULL CHECK (source ~ '^[a-z][a-z0-9_-]{0,39}$'),
 medium text NOT NULL CHECK (medium ~ '^[a-z][a-z0-9_-]{0,39}$'),
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE leal_analytics.journeys (
 id uuid PRIMARY KEY,
 consent_id uuid NOT NULL REFERENCES leal_analytics.consents(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
 device text NOT NULL CHECK (device IN ('mobile','tablet','desktop','unknown')),
 browser text NOT NULL CHECK (browser IN ('chrome','edge','firefox','safari','other')),
 referrer_group text NOT NULL CHECK (referrer_group IN ('direct','search','social','internal','other')),
 campaign_code text REFERENCES leal_analytics.campaigns(code),
 country varchar(2), region varchar(80), city varchar(100),
 latitude numeric(5,1) CHECK (latitude BETWEEN -90 AND 90),
 longitude numeric(5,1) CHECK (longitude BETWEEN -180 AND 180),
 geo_source text NOT NULL DEFAULT 'unknown' CHECK (geo_source IN ('unknown','trusted_edge'))
);
CREATE INDEX journeys_created_idx ON leal_analytics.journeys(created_at);
CREATE INDEX journeys_consent_idx ON leal_analytics.journeys(consent_id);
CREATE TABLE leal_analytics.events (
 id uuid PRIMARY KEY,
 journey_id uuid NOT NULL REFERENCES leal_analytics.journeys(id) ON DELETE CASCADE,
 name text NOT NULL,
 source text NOT NULL CHECK (source IN ('browser','server')),
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 document_kind text CHECK (document_kind IN ('cpf','cnpj')),
 duration_ms integer CHECK (duration_ms BETWEEN 0 AND 86400000),
 debt_count integer CHECK (debt_count BETWEEN 0 AND 500),
 agreement_count integer CHECK (agreement_count BETWEEN 0 AND 2000),
 subject_key varchar(67) CHECK (subject_key ~ '^v1:[a-f0-9]{64}$'),
 subject_verified boolean NOT NULL DEFAULT false,
 CONSTRAINT event_taxonomy CHECK (
   (source='browser' AND name IN ('portal_viewed','document_started','document_completed','document_invalid','access_submitted','access_unavailable','help_clicked','demo_opened','page_hidden','page_resumed')) OR
   (source='server' AND name IN ('registration_requested','registration_not_found','registration_found','registration_no_contacts','registration_review_required','registration_failed','otp_requested','authentication_completed','portfolio_loaded','portfolio_failed','agreement_confirmed'))
 ),
 CONSTRAINT financial_authority CHECK ((debt_count IS NULL AND agreement_count IS NULL) OR (source='server' AND name='portfolio_loaded'))
);
CREATE INDEX events_journey_time_idx ON leal_analytics.events(journey_id,received_at,id);
CREATE INDEX events_name_time_idx ON leal_analytics.events(name,received_at);
CREATE INDEX events_subject_idx ON leal_analytics.events(subject_key,received_at) WHERE subject_key IS NOT NULL;
CREATE TABLE leal_analytics.rate_limits (
 key text PRIMARY KEY CHECK (length(key) <= 100),
 hits integer NOT NULL, expires_at timestamptz NOT NULL
);

-- Received times are authoritative; browser clocks are informational only.
CREATE VIEW leal_analytics.journey_funnel AS
SELECT j.id,j.created_at,j.last_seen_at,j.device,j.browser,j.campaign_code,j.country,j.region,j.city,j.latitude,j.longitude,j.geo_source,
 bool_or(e.name='document_started') AS document_started,
 bool_or(e.name='document_completed') AS document_completed,
 bool_or(e.name='access_submitted') AS access_submitted,
 bool_or(e.name='access_unavailable') AS access_unavailable,
 bool_or(e.name='registration_not_found') AS registration_not_found,
 bool_or(e.name='registration_found') AS registration_found,
 bool_or(e.name IN ('authentication_completed','portfolio_loaded')) AS authenticated,
 bool_or(e.name='portfolio_loaded' AND e.debt_count=0) AS no_debt_returned,
 bool_or(e.name='portfolio_loaded' AND e.agreement_count>0) AS has_agreement,
 CASE WHEN j.last_seen_at > now()-interval '30 minutes' THEN 'active'
 WHEN bool_or(e.name='portfolio_loaded') THEN 'portfolio_viewed'
 WHEN bool_or(e.name='access_unavailable') THEN 'service_unavailable'
 WHEN bool_or(e.name='registration_failed' OR e.name='portfolio_failed') THEN 'service_error'
 WHEN bool_or(e.name='registration_not_found') THEN 'not_found'
 WHEN bool_or(e.name='registration_review_required' OR e.name='registration_no_contacts') THEN 'assistance_required'
 WHEN bool_or(e.name='document_completed') AND NOT bool_or(e.name='access_submitted') THEN 'completed_not_submitted'
 WHEN bool_or(e.name='document_started') AND NOT bool_or(e.name='access_submitted') THEN 'typing_abandoned'
 WHEN bool_or(e.name='access_submitted') AND NOT bool_or(e.name='authentication_completed') THEN 'authentication_abandoned'
 ELSE 'browse_only' END AS outcome
FROM leal_analytics.journeys j LEFT JOIN leal_analytics.events e ON e.journey_id=j.id GROUP BY j.id;

CREATE VIEW leal_analytics.daily_funnel AS
SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
 count(*) AS journeys,
 count(*) FILTER (WHERE document_started) AS document_started,
 count(*) FILTER (WHERE document_completed) AS document_completed,
 count(*) FILTER (WHERE access_submitted) AS submitted,
 count(*) FILTER (WHERE registration_not_found) AS not_found,
 count(*) FILTER (WHERE registration_found) AS found,
 count(*) FILTER (WHERE authenticated) AS authenticated,
 count(*) FILTER (WHERE no_debt_returned) AS no_debt_returned,
 count(*) FILTER (WHERE has_agreement) AS with_agreement,
 count(*) FILTER (WHERE outcome IN ('completed_not_submitted','typing_abandoned','authentication_abandoned')) AS abandoned,
 count(*) FILTER (WHERE outcome IN ('service_unavailable','service_error')) AS unavailable_or_error
FROM leal_analytics.journey_funnel GROUP BY 1;

-- Aggregate map suppresses groups below five journeys. It is not a customer location map.
CREATE VIEW leal_analytics.access_map AS
SELECT country,region,city,latitude,longitude,count(*) AS journeys
FROM leal_analytics.journeys WHERE geo_source='trusted_edge' AND created_at>now()-interval '90 days'
GROUP BY country,region,city,latitude,longitude HAVING count(DISTINCT consent_id)>=5;

CREATE VIEW leal_analytics.timeline AS
SELECT e.journey_id,e.id,e.name,e.source,e.occurred_at,e.received_at,e.document_kind,e.duration_ms,e.debt_count,e.agreement_count,e.subject_key,e.subject_verified
FROM leal_analytics.events e;

CREATE VIEW leal_analytics.campaign_funnel AS
SELECT (j.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,j.campaign_code,c.source,c.medium,
 count(*) AS journeys,count(*) FILTER(WHERE j.access_submitted) AS submitted,
 count(*) FILTER(WHERE j.registration_found) AS found,count(*) FILTER(WHERE j.has_agreement) AS with_agreement
FROM leal_analytics.journey_funnel j LEFT JOIN leal_analytics.campaigns c ON c.code=j.campaign_code
GROUP BY 1,j.campaign_code,c.source,c.medium;

REVOKE ALL ON ALL TABLES IN SCHEMA leal_analytics FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA leal_analytics FROM PUBLIC;
