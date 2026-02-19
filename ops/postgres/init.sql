CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('solo', 'multi')),
  scenario_id text,
  team_name text,
  score integer NOT NULL,
  duration_sec integer,
  region text,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS telemetry_clients (
  client_hash text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_hash text NOT NULL REFERENCES telemetry_clients(client_hash),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  mode text NOT NULL CHECK (mode IN ('solo', 'multi')),
  region text,
  build_version text,
  platform text
);

CREATE TABLE IF NOT EXISTS telemetry_daily_rollup (
  rollup_date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('solo', 'multi')),
  unique_players integer NOT NULL DEFAULT 0,
  total_sessions integer NOT NULL DEFAULT 0,
  total_plays integer NOT NULL DEFAULT 0,
  peak_concurrent integer NOT NULL DEFAULT 0,
  PRIMARY KEY (rollup_date, mode)
);

CREATE TABLE IF NOT EXISTS telemetry_region_daily (
  rollup_date date NOT NULL,
  region text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('solo', 'multi')),
  unique_players integer NOT NULL DEFAULT 0,
  total_sessions integer NOT NULL DEFAULT 0,
  PRIMARY KEY (rollup_date, region, mode)
);
