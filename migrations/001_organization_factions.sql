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
