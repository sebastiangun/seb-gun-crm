CREATE TABLE IF NOT EXISTS crm_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_documents (key text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_journal (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS lead_journal_peer ON lead_journal ((payload->>'peerId'));
CREATE INDEX IF NOT EXISTS lead_journal_manager ON lead_journal ((payload->>'currentManager'));
CREATE INDEX IF NOT EXISTS lead_journal_status ON lead_journal ((payload->>'currentCrmStatus'));
CREATE INDEX IF NOT EXISTS lead_journal_received ON lead_journal ((payload->>'receivedAt'));
CREATE TABLE IF NOT EXISTS sla_settings (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notification_deliveries (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notification_state (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_events (
 id bigserial PRIMARY KEY, lead_id text NOT NULL REFERENCES lead_journal(id) ON DELETE RESTRICT,
 event_type text NOT NULL, payload jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_lead_time ON lead_events(lead_id, recorded_at);
CREATE TABLE IF NOT EXISTS customer_create_requests (key text PRIMARY KEY, state text NOT NULL CHECK(state IN ('pending','confirmed')), client_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO crm_migrations(id) VALUES ('001-storage') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS user_sessions (id_hash text PRIMARY KEY, sealed_payload text NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS user_sessions_expiry ON user_sessions(expires_at);
CREATE TABLE IF NOT EXISTS clients (scope text NOT NULL, id text NOT NULL, payload jsonb NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,id));
CREATE INDEX IF NOT EXISTS clients_vk ON clients(scope, (payload->'social'->>'vkId'));
CREATE TABLE IF NOT EXISTS calendar_events (scope text NOT NULL, client_id text NOT NULL, next_contact text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(scope,client_id), FOREIGN KEY(scope,client_id) REFERENCES clients(scope,id));
CREATE TABLE IF NOT EXISTS client_events (id bigserial PRIMARY KEY, scope text NOT NULL, client_id text NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(scope,client_id) REFERENCES clients(scope,id));
CREATE INDEX IF NOT EXISTS client_events_client ON client_events(scope,client_id,observed_at);
CREATE TABLE IF NOT EXISTS lead_assignments (id text PRIMARY KEY, lead_id text NOT NULL REFERENCES lead_journal(id), from_manager text, to_manager text NOT NULL, changed_at timestamptz, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sla_violations (lead_id text PRIMARY KEY REFERENCES lead_journal(id), manager_at_detection text NOT NULL, threshold_minutes integer NOT NULL, detected_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL);
