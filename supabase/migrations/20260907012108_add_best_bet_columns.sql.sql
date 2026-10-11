ALTER TABLE predictions ADD COLUMN IF NOT EXISTS best_bet text;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS best_bet_probability numeric(5,2);
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS best_bet_market text;