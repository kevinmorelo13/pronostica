-- Update league api_id values to API-Football v3 IDs
-- API-Football v3 league IDs:
--   39  = Premier League (England)
--   140 = LaLiga (Spain)
--   78  = Bundesliga (Germany)
--   61  = Ligue 1 (France)
--   135 = Serie A (Italy)
--   239 = Liga BetPlay Dimayor (Colombia)

UPDATE leagues SET api_id = 39,  logo = 'https://media.api-sports.io/football/leagues/39.png',  season = 2025, updated_at = now() WHERE name = 'Premier League';
UPDATE leagues SET api_id = 140, logo = 'https://media.api-sports.io/football/leagues/140.png', season = 2025, updated_at = now() WHERE name = 'LaLiga';
UPDATE leagues SET api_id = 78,  logo = 'https://media.api-sports.io/football/leagues/78.png',  season = 2025, updated_at = now() WHERE name = 'Bundesliga';
UPDATE leagues SET api_id = 61,  logo = 'https://media.api-sports.io/football/leagues/61.png',  season = 2025, updated_at = now() WHERE name = 'Ligue 1';
UPDATE leagues SET api_id = 135, logo = 'https://media.api-sports.io/football/leagues/135.png', season = 2025, updated_at = now() WHERE name = 'Serie A';
UPDATE leagues SET api_id = 239, logo = 'https://media.api-sports.io/football/leagues/239.png', season = 2025, updated_at = now() WHERE name = 'Liga BetPlay Dimayor';

-- Clear old sample data so the new sync can populate cleanly
DELETE FROM predictions;
DELETE FROM standings;
DELETE FROM team_statistics;
DELETE FROM h2h_records;
DELETE FROM match_events;
DELETE FROM matches;
DELETE FROM teams;
