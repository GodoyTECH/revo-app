-- Setup completo para colar uma única vez no SQL Editor do Neon.
-- Incremental, idempotente e não destrutivo: preserva tabelas e dados existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Migration incremental e não destrutiva para Neon PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organization_factions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  logo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_faction_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faction_id uuid NOT NULL REFERENCES organization_factions(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('00', '01', '02')),
  whatsapp text NOT NULL CHECK (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_faction_members_faction_idx
  ON organization_faction_members(faction_id);
CREATE INDEX IF NOT EXISTS organization_faction_members_name_idx
  ON organization_faction_members(lower(name));

CREATE TABLE IF NOT EXISTS external_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  relation_type text NOT NULL CHECK (relation_type IN ('blacklist', 'official_ally')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, relation_type)
);

CREATE TABLE IF NOT EXISTS app_security_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  operation text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  actor_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credential_attempts (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credential_attempts_rate_idx
  ON credential_attempts(ip_hash, created_at DESC);

-- Seed oficial idempotente. A aplicação poderá editar estes dados depois.
INSERT INTO external_relations (name, normalized_name, relation_type)
VALUES
  ('00 NOIS MERMO', '00 NOIS MERMO', 'blacklist'),
  ('FML BLOODS', 'FML BLOODS', 'blacklist'),
  ('TROPA DO CORONEL', 'TROPA DO CORONEL', 'blacklist'),
  ('VOVÓ METRALHA', 'VOVÓ METRALHA', 'blacklist'),
  ('DESTRUIÇÃO', 'DESTRUICAO', 'blacklist'),
  ('AFRICA DO SUL', 'AFRICA DO SUL', 'blacklist'),
  ('COMANDO CAVEIRA', 'COMANDO CAVEIRA', 'blacklist'),
  ('MILICIA PRIME', 'MILICIA PRIME', 'blacklist'),
  ('BELLADONA', 'BELLADONA', 'blacklist')
ON CONFLICT (normalized_name, relation_type) DO NOTHING;

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

-- Registra as migrations para que `npm run migrate` não tente reaplicá-las.
INSERT INTO schema_migrations (name)
VALUES ('001_organization_factions.sql'), ('002_diplomacy_ocr.sql')
ON CONFLICT (name) DO NOTHING;

COMMIT;
