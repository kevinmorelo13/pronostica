-- Add ESPN slug column to leagues for API routing
DO $$ BEGIN
  ALTER TABLE leagues ADD COLUMN IF NOT EXISTS espn_slug text;
EXCEPTION WHEN OTHERS THEN END $$;

UPDATE leagues SET espn_slug = 'eng.1' WHERE name = 'Premier League';
UPDATE leagues SET espn_slug = 'esp.1' WHERE name = 'LaLiga';
UPDATE leagues SET espn_slug = 'ger.1' WHERE name = 'Bundesliga';
UPDATE leagues SET espn_slug = 'ita.1' WHERE name = 'Serie A';
UPDATE leagues SET espn_slug = 'fra.1' WHERE name = 'Ligue 1';
UPDATE leagues SET espn_slug = 'col.1' WHERE name = 'Liga BetPlay Dimayor';