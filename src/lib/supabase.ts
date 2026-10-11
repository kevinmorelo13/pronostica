import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type League = {
  id: string;
  api_id: number | null;
  name: string;
  country: string;
  logo: string | null;
  season: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  api_id: number | null;
  name: string;
  short_name: string | null;
  logo: string | null;
  country: string | null;
  league_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Match = {
  id: string;
  api_id: number | null;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'halftime';
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  venue: string | null;
  referee: string | null;
  round: string | null;
  created_at: string;
  updated_at: string;
  league?: League;
  home_team?: Team;
  away_team?: Team;
  prediction?: Prediction;
};

export type Prediction = {
  id: string;
  match_id: string;
  home_probability: number;
  draw_probability: number;
  away_probability: number;
  over15_probability: number | null;
  over25_probability: number | null;
  under25_probability: number | null;
  over35_probability: number | null;
  btts_probability: number | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  confidence: 'very_high' | 'high' | 'medium' | 'low';
  confidence_score: number | null;
  has_signal: boolean | null;
  best_bet: string | null;
  best_bet_probability: number | null;
  best_bet_market: string | null;
  analysis: string | null;
  patterns: string[] | null;
  model_agreement: ModelAgreement | null;
  model_weights: Record<string, number> | null;
  score_probabilities: Record<string, number> | null;
  elo_home: number | null;
  elo_away: number | null;
  model_version: string | null;
  prediction_result: 'correct' | 'incorrect' | 'pending';
  actual_outcome: string | null;
  additional_markets: Record<string, Record<string, number>> | null;
  generated_at: string;
  updated_at: string;
};

export type ModelAgreement = {
  agreement: string;
  pick: string;
  picks: Array<{ model: string; pick: string }>;
};

export type ModelPrediction = {
  id: string;
  match_id: string;
  model_name: string;
  home_probability: number;
  draw_probability: number;
  away_probability: number;
  weight: number;
  created_at: string;
};

export type ModelPerformance = {
  id: string;
  model_name: string;
  season: number;
  total_predictions: number;
  correct_predictions: number;
  accuracy: number;
  brier_score: number | null;
  log_loss: number | null;
  calibration_error: number | null;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  weight: number;
  updated_at: string;
};

export type EloRating = {
  id: string;
  team_id: string;
  rating: number;
  peak_rating: number;
  matches_played: number;
  updated_at: string;
};

export type TeamStatistics = {
  id: string;
  team_id: string;
  league_id: string;
  season: number;
  form: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  clean_sheets: number;
  home_played: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  home_goals_scored: number;
  home_goals_conceded: number;
  away_played: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
  away_goals_scored: number;
  away_goals_conceded: number;
  avg_goals_scored: number;
  avg_goals_conceded: number;
  avg_possession: number | null;
  avg_shots: number | null;
  avg_shots_on_target: number | null;
  avg_corners: number | null;
  avg_yellow_cards: number | null;
  avg_red_cards: number | null;
};

export type Standing = {
  id: string;
  league_id: string;
  team_id: string;
  season: number;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  form: string | null;
  team?: Team;
  league?: League;
};

export type MatchEvent = {
  id: string;
  match_id: string;
  minute: number;
  type: 'goal' | 'card' | 'substitution' | 'var' | 'penalty';
  team_id: string | null;
  player_name: string | null;
  assist_name: string | null;
  detail: string | null;
  team?: Team;
};

export type Notification = {
  id: string;
  type: 'prediction_ready' | 'match_start' | 'goal' | 'match_end' | 'prediction_update' | 'error';
  title: string;
  message: string;
  is_read: boolean;
  match_id: string | null;
  created_at: string;
};

export type AdminLog = {
  id: string;
  action: string;
  status: 'success' | 'error' | 'running';
  details: Record<string, unknown> | null;
  matches_fetched: number;
  predictions_generated: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export type H2HRecord = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  home_score: number;
  away_score: number;
  winner: 'home' | 'away' | 'draw';
  competition: string | null;
  home_team?: Team;
  away_team?: Team;
};

export type LadderEntry = {
  id: string;
  step: number;
  match_id: string | null;
  selection: string;
  odds: number;
  stake: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  return_amount: number | null;
  profit: number | null;
  balance_after: number | null;
  match_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  match?: Match;
};

export type ApiUsage = {
  id: string;
  provider: string;
  endpoint: string;
  requests: number;
  date: string;
  remaining_requests: number | null;
  last_request: string;
};
