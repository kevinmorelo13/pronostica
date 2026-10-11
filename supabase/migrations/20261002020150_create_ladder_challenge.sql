/*
# Create ladder challenge table (single-tenant, no auth)

1. New Tables
- `ladder_entries`: stores each bet in the "safe odds ladder" challenge.
  - `id` (uuid, primary key)
  - `step` (int, step number in the ladder, starts at 1)
  - `match_id` (uuid, nullable, FK to matches)
  - `selection` (text, what was bet on, e.g. "Victoria Real Madrid")
  - `odds` (numeric, the odds used, max 1.50)
  - `stake` (numeric, amount wagered — starts at the initial balance, then rolls over all winnings)
  - `status` (text: 'pending' | 'won' | 'lost' | 'void')
  - `return_amount` (numeric, nullable, actual return including stake)
  - `profit` (numeric, nullable, net gain/loss for this step)
  - `balance_after` (numeric, running balance after this step resolved)
  - `match_date` (date, the date of the match bet on)
  - `notes` (text, nullable)
  - `created_at`, `updated_at` (timestamps)

2. Security
- Enable RLS on `ladder_entries`.
- Single-tenant app (no sign-in screen): allow `anon, authenticated` full CRUD.
*/

CREATE TABLE IF NOT EXISTS ladder_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step int NOT NULL DEFAULT 1,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  selection text NOT NULL,
  odds numeric NOT NULL DEFAULT 1.50,
  stake numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'void')),
  return_amount numeric,
  profit numeric,
  balance_after numeric,
  match_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ladder_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ladder" ON ladder_entries;
CREATE POLICY "anon_select_ladder" ON ladder_entries FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ladder" ON ladder_entries;
CREATE POLICY "anon_insert_ladder" ON ladder_entries FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ladder" ON ladder_entries;
CREATE POLICY "anon_update_ladder" ON ladder_entries FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ladder" ON ladder_entries;
CREATE POLICY "anon_delete_ladder" ON ladder_entries FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ladder_step ON ladder_entries(step);