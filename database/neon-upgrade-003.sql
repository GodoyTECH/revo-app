-- Executar somente quando as migrations 001 e 002 já estiverem instaladas.
BEGIN;
-- Incremental: preserve reviewed names; images and raw OCR are never persisted by the new flow.
ALTER TABLE diplomacy_entries ADD COLUMN IF NOT EXISTS reviewed_name text;
ALTER TABLE diplomacy_entries ADD COLUMN IF NOT EXISTS review_provenance jsonb NOT NULL DEFAULT '[]';
ALTER TABLE diplomacy_snapshots ADD COLUMN IF NOT EXISTS input_source text NOT NULL DEFAULT 'OCR' CHECK (input_source IN ('OCR','MANUAL'));
CREATE TABLE IF NOT EXISTS ocr_submission_attempts (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocr_submission_attempts_rate_idx ON ocr_submission_attempts(ip_hash, created_at DESC);

-- Repair master links for records added after migration 002 by older app versions.
INSERT INTO gangs(canonical_name,normalized_name)
SELECT f.name,f.normalized_name FROM organization_factions f
WHERE f.gang_id IS NULL AND NOT EXISTS (SELECT 1 FROM gang_aliases a WHERE a.normalized_alias=f.normalized_name)
ON CONFLICT(normalized_name) DO NOTHING;
INSERT INTO gangs(canonical_name,normalized_name)
SELECT r.name,r.normalized_name FROM external_relations r
WHERE r.gang_id IS NULL AND NOT EXISTS (SELECT 1 FROM gang_aliases a WHERE a.normalized_alias=r.normalized_name)
ON CONFLICT(normalized_name) DO NOTHING;
UPDATE organization_factions f SET gang_id=g.id FROM gangs g
WHERE f.gang_id IS NULL AND f.normalized_name=g.normalized_name;
UPDATE external_relations r SET gang_id=g.id FROM gangs g
WHERE r.gang_id IS NULL AND r.normalized_name=g.normalized_name;
UPDATE organization_factions f SET gang_id=a.gang_id FROM gang_aliases a
WHERE f.gang_id IS NULL AND f.normalized_name=a.normalized_alias
AND NOT EXISTS(SELECT 1 FROM organization_factions other WHERE other.gang_id=a.gang_id);
UPDATE external_relations r SET gang_id=a.gang_id FROM gang_aliases a
WHERE r.gang_id IS NULL AND r.normalized_name=a.normalized_alias;

CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(name) VALUES ('003_review_provenance.sql') ON CONFLICT(name) DO NOTHING;
COMMIT;
