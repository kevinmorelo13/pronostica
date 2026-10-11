/*
# Fútbol Predictor — Core Database Schema

## Overview
Creates all tables needed for the football prediction platform:
leagues, teams, matches, predictions, team_statistics, match_events,
h2h_records, notifications, admin_logs, and prediction_results.

## New Tables

### leagues
Stores each football competition (Liga Colombiana, Premier League, LaLiga, etc.)
- id: internal UUID primary key
- api_id: external API identifier (e.g. from API-Football)
- name, country, logo, season, is_active

### teams
Stores clubs and national teams
- id: UUID PK, api_id: external ID
- name, short_name, logo, country, league_id (FK → leagues)

### matches
Stores scheduled and completed matches
- id: UUID PK, api_id: external ID
- league_id → leagues, home_team_id / away_team_id → teams
- match_date (UTC), status (scheduled/live/finished/postponed/cancelled)
- home_score, away_score, minute, venue, referee

### team_statistics
Aggregated per-team per-league stats for the current season
- form (last 5 char string e.g. "WWDLW"), played, wins, draws, losses
- goals_scored, goals_conceded, clean_sheets
- home_played/wins/draws/losses/scored/conceded
- away equivalents, avg_goals_scored, avg_goals_conceded

### predictions
AI/statistical prediction for each match
- match_id (FK → matches, unique — one prediction per match)
- home_probability, draw_probability, away_probability (sum ≈ 100)
- over15/over25/under25/btts probabilities
- predicted_home_score, predicted_away_score
- confidence: 'very_high'|'high'|'medium'|'low'
- analysis: text explanation
- prediction_result: 'correct'|'incorrect'|'pending'

### match_events
Goals, cards, substitutions from live/finished matches
- match_id, minute, type, team_id, player_name, detail

### h2h_records
Historical head-to-head results between pairs of teams
- home_team_id, away_team_id, match_date, home_score, away_score
- winner: 'home'|'away'|'draw', competition

### notifications
In-app notification queue
- type: 'prediction_ready'|'match_start'|'goal'|'match_end'|'prediction_update'
- title, message, is_read, match_id (nullable)

### admin_logs
Audit trail for scheduled and manual API runs
- action, status, details (jsonb), matches_fetched, predictions_generated

## Security
RLS enabled on all tables. Single-tenant (no per-user auth), so policies
grant anon + authenticated full CRUD on all tables.

## Notes
1. All timestamps stored as timestamptz (UTC). Colombia (UTC-5) offset applied in UI.
2. `api_id` columns allow syncing with external sports API without duplicates.
3. Indexes on frequently-filtered columns (league_id, match_date, status, api_id).
*/

-- =========================================================
-- LEAGUES
-- =========================================================
CREATE TABLE IF NOT EXISTS leagues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id      integer UNIQUE,
  name        text NOT NULL,
  country     text NOT NULL,
  logo        text,
  season      integer NOT NULL DEFAULT 2025,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues_select" ON leagues;
DROP POLICY IF EXISTS "leagues_insert" ON leagues;
DROP POLICY IF EXISTS "leagues_update" ON leagues;
DROP POLICY IF EXISTS "leagues_delete" ON leagues;

CREATE POLICY "leagues_select" ON leagues FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "leagues_insert" ON leagues FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "leagues_update" ON leagues FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leagues_delete" ON leagues FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- TEAMS
-- =========================================================
CREATE TABLE IF NOT EXISTS teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id      integer UNIQUE,
  name        text NOT NULL,
  short_name  text,
  logo        text,
  country     text,
  league_id   uuid REFERENCES leagues(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select" ON teams;
DROP POLICY IF EXISTS "teams_insert" ON teams;
DROP POLICY IF EXISTS "teams_update" ON teams;
DROP POLICY IF EXISTS "teams_delete" ON teams;

CREATE POLICY "teams_select" ON teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "teams_update" ON teams FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "teams_delete" ON teams FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- MATCHES
-- =========================================================
CREATE TABLE IF NOT EXISTS matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_id          integer UNIQUE,
  league_id       uuid REFERENCES leagues(id) ON DELETE CASCADE,
  home_team_id    uuid REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id    uuid REFERENCES teams(id) ON DELETE CASCADE,
  match_date      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','live','finished','postponed','cancelled','halftime')),
  home_score      integer,
  away_score      integer,
  minute          integer,
  venue           text,
  referee         text,
  round           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches_select" ON matches;
DROP POLICY IF EXISTS "matches_insert" ON matches;
DROP POLICY IF EXISTS "matches_update" ON matches;
DROP POLICY IF EXISTS "matches_delete" ON matches;

CREATE POLICY "matches_select" ON matches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "matches_insert" ON matches FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "matches_update" ON matches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "matches_delete" ON matches FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_match_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_api_id ON matches(api_id);

-- =========================================================
-- TEAM_STATISTICS
-- =========================================================
CREATE TABLE IF NOT EXISTS team_statistics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid REFERENCES teams(id) ON DELETE CASCADE,
  league_id             uuid REFERENCES leagues(id) ON DELETE CASCADE,
  season                integer NOT NULL DEFAULT 2025,
  form                  text,
  played                integer NOT NULL DEFAULT 0,
  wins                  integer NOT NULL DEFAULT 0,
  draws                 integer NOT NULL DEFAULT 0,
  losses                integer NOT NULL DEFAULT 0,
  goals_scored          integer NOT NULL DEFAULT 0,
  goals_conceded        integer NOT NULL DEFAULT 0,
  clean_sheets          integer NOT NULL DEFAULT 0,
  home_played           integer NOT NULL DEFAULT 0,
  home_wins             integer NOT NULL DEFAULT 0,
  home_draws            integer NOT NULL DEFAULT 0,
  home_losses           integer NOT NULL DEFAULT 0,
  home_goals_scored     integer NOT NULL DEFAULT 0,
  home_goals_conceded   integer NOT NULL DEFAULT 0,
  away_played           integer NOT NULL DEFAULT 0,
  away_wins             integer NOT NULL DEFAULT 0,
  away_draws            integer NOT NULL DEFAULT 0,
  away_losses           integer NOT NULL DEFAULT 0,
  away_goals_scored     integer NOT NULL DEFAULT 0,
  away_goals_conceded   integer NOT NULL DEFAULT 0,
  avg_goals_scored      numeric(4,2) NOT NULL DEFAULT 0,
  avg_goals_conceded    numeric(4,2) NOT NULL DEFAULT 0,
  avg_possession        numeric(5,2),
  avg_shots             numeric(5,2),
  avg_shots_on_target   numeric(5,2),
  avg_corners           numeric(5,2),
  avg_yellow_cards      numeric(5,2),
  avg_red_cards         numeric(5,2),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(team_id, league_id, season)
);

ALTER TABLE team_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_stats_select" ON team_statistics;
DROP POLICY IF EXISTS "team_stats_insert" ON team_statistics;
DROP POLICY IF EXISTS "team_stats_update" ON team_statistics;
DROP POLICY IF EXISTS "team_stats_delete" ON team_statistics;

CREATE POLICY "team_stats_select" ON team_statistics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "team_stats_insert" ON team_statistics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "team_stats_update" ON team_statistics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_stats_delete" ON team_statistics FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- PREDICTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS predictions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                uuid UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  home_probability        numeric(5,2) NOT NULL,
  draw_probability        numeric(5,2) NOT NULL,
  away_probability        numeric(5,2) NOT NULL,
  over15_probability      numeric(5,2),
  over25_probability      numeric(5,2),
  under25_probability     numeric(5,2),
  btts_probability        numeric(5,2),
  predicted_home_score    integer,
  predicted_away_score    integer,
  confidence              text NOT NULL DEFAULT 'medium'
                            CHECK (confidence IN ('very_high','high','medium','low')),
  analysis                text,
  prediction_result       text DEFAULT 'pending'
                            CHECK (prediction_result IN ('correct','incorrect','pending')),
  actual_outcome          text,
  generated_at            timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "predictions_select" ON predictions;
DROP POLICY IF EXISTS "predictions_insert" ON predictions;
DROP POLICY IF EXISTS "predictions_update" ON predictions;
DROP POLICY IF EXISTS "predictions_delete" ON predictions;

CREATE POLICY "predictions_select" ON predictions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "predictions_insert" ON predictions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "predictions_update" ON predictions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "predictions_delete" ON predictions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_generated_at ON predictions(generated_at);

-- =========================================================
-- MATCH_EVENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS match_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid REFERENCES matches(id) ON DELETE CASCADE,
  api_id      integer,
  minute      integer NOT NULL,
  type        text NOT NULL CHECK (type IN ('goal','card','substitution','var','penalty')),
  team_id     uuid REFERENCES teams(id) ON DELETE SET NULL,
  player_name text,
  assist_name text,
  detail      text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select" ON match_events;
DROP POLICY IF EXISTS "events_insert" ON match_events;
DROP POLICY IF EXISTS "events_update" ON match_events;
DROP POLICY IF EXISTS "events_delete" ON match_events;

CREATE POLICY "events_select" ON match_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "events_insert" ON match_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "events_update" ON match_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "events_delete" ON match_events FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_events_match_id ON match_events(match_id);

-- =========================================================
-- H2H RECORDS
-- =========================================================
CREATE TABLE IF NOT EXISTS h2h_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_id    uuid REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id    uuid REFERENCES teams(id) ON DELETE CASCADE,
  match_date      timestamptz NOT NULL,
  home_score      integer NOT NULL,
  away_score      integer NOT NULL,
  winner          text NOT NULL CHECK (winner IN ('home','away','draw')),
  competition     text,
  api_match_id    integer,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE h2h_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "h2h_select" ON h2h_records;
DROP POLICY IF EXISTS "h2h_insert" ON h2h_records;
DROP POLICY IF EXISTS "h2h_update" ON h2h_records;
DROP POLICY IF EXISTS "h2h_delete" ON h2h_records;

CREATE POLICY "h2h_select" ON h2h_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "h2h_insert" ON h2h_records FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "h2h_update" ON h2h_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "h2h_delete" ON h2h_records FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- STANDINGS
-- =========================================================
CREATE TABLE IF NOT EXISTS standings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       uuid REFERENCES leagues(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES teams(id) ON DELETE CASCADE,
  season          integer NOT NULL DEFAULT 2025,
  position        integer NOT NULL,
  played          integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  draws           integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,
  goals_for       integer NOT NULL DEFAULT 0,
  goals_against   integer NOT NULL DEFAULT 0,
  goal_diff       integer NOT NULL DEFAULT 0,
  points          integer NOT NULL DEFAULT 0,
  form            text,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(league_id, team_id, season)
);

ALTER TABLE standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "standings_select" ON standings;
DROP POLICY IF EXISTS "standings_insert" ON standings;
DROP POLICY IF EXISTS "standings_update" ON standings;
DROP POLICY IF EXISTS "standings_delete" ON standings;

CREATE POLICY "standings_select" ON standings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "standings_insert" ON standings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "standings_update" ON standings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "standings_delete" ON standings FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_standings_league_id ON standings(league_id);

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('prediction_ready','match_start','goal','match_end','prediction_update','error')),
  title       text NOT NULL,
  message     text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  match_id    uuid REFERENCES matches(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select" ON notifications;
DROP POLICY IF EXISTS "notif_insert" ON notifications;
DROP POLICY IF EXISTS "notif_update" ON notifications;
DROP POLICY IF EXISTS "notif_delete" ON notifications;

CREATE POLICY "notif_select" ON notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "notif_insert" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "notif_delete" ON notifications FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- ADMIN LOGS
-- =========================================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action                  text NOT NULL,
  status                  text NOT NULL CHECK (status IN ('success','error','running')),
  details                 jsonb,
  matches_fetched         integer DEFAULT 0,
  predictions_generated   integer DEFAULT 0,
  error_message           text,
  started_at              timestamptz DEFAULT now(),
  completed_at            timestamptz
);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_select" ON admin_logs;
DROP POLICY IF EXISTS "logs_insert" ON admin_logs;
DROP POLICY IF EXISTS "logs_update" ON admin_logs;
DROP POLICY IF EXISTS "logs_delete" ON admin_logs;

CREATE POLICY "logs_select" ON admin_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "logs_insert" ON admin_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "logs_update" ON admin_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "logs_delete" ON admin_logs FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- SEED DEFAULT LEAGUES
-- =========================================================
INSERT INTO leagues (api_id, name, country, logo, season, is_active) VALUES
  (239, 'Liga BetPlay Dimayor', 'Colombia', 'https://media.api-sports.io/football/leagues/239.png', 2025, true),
  (39,  'Premier League',       'England',  'https://media.api-sports.io/football/leagues/39.png',  2024, true),
  (140, 'LaLiga',               'Spain',    'https://media.api-sports.io/football/leagues/140.png', 2024, true)
ON CONFLICT (api_id) DO UPDATE SET
  name = EXCLUDED.name,
  country = EXCLUDED.country,
  logo = EXCLUDED.logo,
  updated_at = now();
