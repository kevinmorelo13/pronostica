-- =========================================================
-- FOOTBALL AI PREDICTOR — Extended Schema
-- Adds: elo_ratings, model_predictions, model_performance,
--   api_usage, patterns, prediction_scoreboard
-- Extends: predictions table with confidence_score, model_agreement,
--   model_weights, patterns, has_signal, score_probabilities
-- =========================================================

-- =========================================================
-- Extend predictions table
-- =========================================================
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS confidence_score integer DEFAULT 0;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_agreement jsonb;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_weights jsonb;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS patterns jsonb;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS has_signal boolean DEFAULT true;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS score_probabilities jsonb;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS elo_home numeric(6,2);
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS elo_away numeric(6,2);
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS over35_probability numeric(5,2);
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_version text DEFAULT 'ensemble_v1';

-- =========================================================
-- ELO RATINGS
-- =========================================================
CREATE TABLE IF NOT EXISTS elo_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  rating      numeric(6,2) NOT NULL DEFAULT 1200,
  peak_rating numeric(6,2) NOT NULL DEFAULT 1200,
  matches_played integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE elo_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "elo_select" ON elo_ratings;
DROP POLICY IF EXISTS "elo_insert" ON elo_ratings;
DROP POLICY IF EXISTS "elo_update" ON elo_ratings;
DROP POLICY IF EXISTS "elo_delete" ON elo_ratings;
CREATE POLICY "elo_select" ON elo_ratings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "elo_insert" ON elo_ratings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "elo_update" ON elo_ratings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "elo_delete" ON elo_ratings FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- MODEL PREDICTIONS (individual model outputs per match)
-- =========================================================
CREATE TABLE IF NOT EXISTS model_predictions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid REFERENCES matches(id) ON DELETE CASCADE,
  model_name      text NOT NULL,
  home_probability numeric(5,2) NOT NULL,
  draw_probability numeric(5,2) NOT NULL,
  away_probability numeric(5,2) NOT NULL,
  predicted_home_score integer,
  predicted_away_score integer,
  weight          numeric(5,4) DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(match_id, model_name)
);

ALTER TABLE model_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "model_pred_select" ON model_predictions;
DROP POLICY IF EXISTS "model_pred_insert" ON model_predictions;
DROP POLICY IF EXISTS "model_pred_update" ON model_predictions;
DROP POLICY IF EXISTS "model_pred_delete" ON model_predictions;
CREATE POLICY "model_pred_select" ON model_predictions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "model_pred_insert" ON model_predictions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "model_pred_update" ON model_predictions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "model_pred_delete" ON model_predictions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_model_pred_match_id ON model_predictions(match_id);

-- =========================================================
-- MODEL PERFORMANCE (historical metrics per model)
-- =========================================================
CREATE TABLE IF NOT EXISTS model_performance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name      text NOT NULL,
  season          integer NOT NULL DEFAULT 2025,
  total_predictions integer NOT NULL DEFAULT 0,
  correct_predictions integer NOT NULL DEFAULT 0,
  accuracy        numeric(5,2) NOT NULL DEFAULT 0,
  brier_score     numeric(5,4),
  log_loss        numeric(5,4),
  calibration_error numeric(5,4),
  precision       numeric(5,2),
  recall          numeric(5,2),
  f1_score        numeric(5,2),
  weight          numeric(5,4) DEFAULT 0,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(model_name, season)
);

ALTER TABLE model_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "model_perf_select" ON model_performance;
DROP POLICY IF EXISTS "model_perf_insert" ON model_performance;
DROP POLICY IF EXISTS "model_perf_update" ON model_performance;
DROP POLICY IF EXISTS "model_perf_delete" ON model_performance;
CREATE POLICY "model_perf_select" ON model_performance FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "model_perf_insert" ON model_performance FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "model_perf_update" ON model_performance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "model_perf_delete" ON model_performance FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- API USAGE (rate limiting tracking)
-- =========================================================
CREATE TABLE IF NOT EXISTS api_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL DEFAULT 'api-football',
  endpoint        text NOT NULL,
  requests        integer NOT NULL DEFAULT 1,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  remaining_requests integer,
  last_request    timestamptz DEFAULT now(),
  UNIQUE(provider, endpoint, date)
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_usage_select" ON api_usage;
DROP POLICY IF EXISTS "api_usage_insert" ON api_usage;
DROP POLICY IF EXISTS "api_usage_update" ON api_usage;
DROP POLICY IF EXISTS "api_usage_delete" ON api_usage;
CREATE POLICY "api_usage_select" ON api_usage FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "api_usage_insert" ON api_usage FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "api_usage_update" ON api_usage FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "api_usage_delete" ON api_usage FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- SEED MODEL PERFORMANCE with default weights
-- =========================================================
INSERT INTO model_performance (model_name, season, total_predictions, correct_predictions, accuracy, weight)
VALUES
  ('poisson', 2025, 0, 0, 0, 0.21),
  ('elo', 2025, 0, 0, 0, 0.14),
  ('dixon_coles', 2025, 0, 0, 0, 0.12),
  ('logistic', 2025, 0, 0, 0, 0.10),
  ('random_forest', 2025, 0, 0, 0, 0.17),
  ('xgboost', 2025, 0, 0, 0, 0.24),
  ('neural_network', 2025, 0, 0, 0, 0.12),
  ('ensemble', 2025, 0, 0, 0, 0.00)
ON CONFLICT (model_name, season) DO NOTHING;
