-- Operational Hardening: Event Outbox + Document Consent System
-- Sprint: 2026-03-07

-- ─── Event Outbox ─────────────────────────────────────────────────────────────
-- Transactional outbox for guaranteed async event delivery.
-- API routes write an outbox row in the same transaction as domain data.
-- A background worker polls pending rows, dispatches notifications, and
-- marks them delivered. Failed deliveries use exponential backoff.

CREATE TABLE IF NOT EXISTS event_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  correlation_id TEXT,
  actor_id       UUID,
  retry_count    INT NOT NULL DEFAULT 0,
  max_retries    INT NOT NULL DEFAULT 5,
  last_error     TEXT,
  next_retry_at  TIMESTAMPTZ,
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
  ON event_outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_event_outbox_aggregate
  ON event_outbox (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_event_outbox_event_type
  ON event_outbox (event_type);

-- ─── Parent Documents ─────────────────────────────────────────────────────────
-- Catalog of policy documents parents must acknowledge.

CREATE TABLE IF NOT EXISTS parent_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  required    BOOLEAN NOT NULL DEFAULT true,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Document Versions ────────────────────────────────────────────────────────
-- Versioned content. New version = new row. Existing signatures stay linked.

CREATE TABLE IF NOT EXISTS document_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES parent_documents(id) ON DELETE CASCADE,
  version      INT NOT NULL,
  content      TEXT NOT NULL,
  changelog    TEXT,
  published    BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_document_version_published
  ON document_versions (document_id, published);

-- ─── Document Signatures ──────────────────────────────────────────────────────
-- Immutable record of parent acknowledging a document version.
-- Never updated or deleted (legal requirement).

CREATE TABLE IF NOT EXISTS document_signatures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES document_versions(id),
  ip_address TEXT,
  user_agent TEXT,
  signed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_document_signatures_parent
  ON document_signatures (parent_id);

-- ─── Triggers: updated_at on new tables ───────────────────────────────────────

CREATE TRIGGER set_updated_at_parent_documents
  BEFORE UPDATE ON parent_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

-- Event outbox: only service role (supabaseAdmin) can read/write
CREATE POLICY "event_outbox_service_only" ON event_outbox
  FOR ALL USING (false);

-- Parent documents: all authenticated users can read active documents
CREATE POLICY "parent_documents_read_active" ON parent_documents
  FOR SELECT USING (active = true);

-- Document versions: all authenticated users can read published versions
CREATE POLICY "document_versions_read_published" ON document_versions
  FOR SELECT USING (published = true);

-- Document signatures: parents can read only their own
CREATE POLICY "document_signatures_own_read" ON document_signatures
  FOR SELECT USING (parent_id = auth.uid());

-- Document signatures: parents can insert only their own
CREATE POLICY "document_signatures_own_insert" ON document_signatures
  FOR INSERT WITH CHECK (parent_id = auth.uid());

-- Document signatures: immutable — no updates or deletes
-- (no UPDATE or DELETE policies = blocked by default with RLS enabled)
