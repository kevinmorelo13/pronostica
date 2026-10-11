/*
# Add additional_markets JSONB column to predictions

1. Modified Tables
- `predictions`: add `additional_markets` JSONB column to store extended market
  probabilities (double chance, corners, cards, shots, fouls) without needing
  a separate column per market.

2. Security
- No changes to RLS (existing policies cover the new column automatically).
*/

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS additional_markets jsonb DEFAULT '{}'::jsonb;
