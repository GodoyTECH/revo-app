-- Diplomacia relacional e histórico de leituras OCR (incremental e não destrutiva).
CREATE TABLE IF NOT EXISTS gangs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gang_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id uuid NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_factions ADD COLUMN IF NOT EXISTS gang_id uuid REFERENCES gangs(id);
ALTER TABLE external_relations ADD COLUMN IF NOT EXISTS gang_id uuid REFERENCES gangs(id);

INSERT INTO gangs(canonical_name, normalized_name)
SELECT name, normalized_name FROM organization_factions
ON CONFLICT (normalized_name) DO NOTHING;
INSERT INTO gangs(canonical_name, normalized_name)
SELECT name, normalized_name FROM external_relations
ON CONFLICT (normalized_name) DO NOTHING;
UPDATE organization_factions f SET gang_id=g.id FROM gangs g
WHERE f.gang_id IS NULL AND f.normalized_name=g.normalized_name;
UPDATE external_relations r SET gang_id=g.id FROM gangs g
WHERE r.gang_id IS NULL AND r.normalized_name=g.normalized_name;
CREATE UNIQUE INDEX IF NOT EXISTS organization_factions_gang_idx ON organization_factions(gang_id) WHERE gang_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS diplomacy_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_faction_id uuid NOT NULL REFERENCES organization_factions(id),
  relation_type text NOT NULL CHECK (relation_type IN ('ALLY','ENEMY')),
  import_mode text NOT NULL DEFAULT 'COMPLETE' CHECK (import_mode IN ('COMPLETE','PARTIAL')),
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('REVIEW','CONFIRMED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS diplomacy_snapshots_current_idx
  ON diplomacy_snapshots(source_faction_id, relation_type, confirmed_at DESC) WHERE status='CONFIRMED';

CREATE TABLE IF NOT EXISTS diplomacy_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES diplomacy_snapshots(id) ON DELETE CASCADE,
  target_gang_id uuid NOT NULL REFERENCES gangs(id),
  ocr_original_text text NOT NULL,
  ocr_confidence numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_id, target_gang_id)
);

CREATE TABLE IF NOT EXISTS submission_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES diplomacy_snapshots(id) ON DELETE CASCADE,
  file_name text,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_images_hash_idx ON submission_images(sha256);

CREATE TABLE IF NOT EXISTS ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_image_id uuid NOT NULL REFERENCES submission_images(id) ON DELETE CASCADE,
  raw_text text NOT NULL,
  processed_json jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
