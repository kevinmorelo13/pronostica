DO $$ BEGIN
  ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sofa_id integer;
EXCEPTION WHEN OTHERS THEN END $$;

-- Map leagues to SofaScore tournament IDs
UPDATE leagues SET sofa_id = 35 WHERE name = 'Premier League';
UPDATE leagues SET sofa_id = 34 WHERE name = 'LaLiga';
UPDATE leagues SET sofa_id = 32 WHERE name = 'Bundesliga';
UPDATE leagues SET sofa_id = 33 WHERE name = 'Serie A';
UPDATE leagues SET sofa_id = 31 WHERE name = 'Ligue 1';
UPDATE leagues SET sofa_id = 574 WHERE name = 'Liga BetPlay Dimayor';