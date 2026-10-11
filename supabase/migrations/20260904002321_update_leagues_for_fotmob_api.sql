-- Update seed leagues to use FotMob API IDs (free-api-live-football-data.p.rapidapi.com)
-- League IDs from FotMob: 47=Premier League (ENG), 87=LaLiga (ESP), 111=Bundesliga (GER),
-- 53=Ligue 1 (FRA), 55=Serie A (ITA), 54=2. Bundesliga, 339=LaLiga2, 110=Ligue 2
-- Colombia Liga BetPlay: need to discover via matches (likely a dynamic ID)

-- Update existing leagues
UPDATE leagues SET api_id = 47, name = 'Premier League', country = 'England', logo = 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/47.png', season = 2025, updated_at = now() WHERE name = 'Premier League';
UPDATE leagues SET api_id = 87, name = 'LaLiga', country = 'Spain', logo = 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/87.png', season = 2025, updated_at = now() WHERE name = 'LaLiga';

-- Update Liga Colombiana — FotMob ID for Colombia top division
UPDATE leagues SET api_id = 1000001751, name = 'Liga BetPlay Dimayor', country = 'Colombia', logo = null, season = 2025, updated_at = now() WHERE name = 'Liga BetPlay Dimayor';

-- Add more popular leagues
INSERT INTO leagues (api_id, name, country, logo, season, is_active) VALUES
  (111, 'Bundesliga', 'Germany', 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/111.png', 2025, true),
  (53, 'Ligue 1', 'France', 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/53.png', 2025, true),
  (55, 'Serie A', 'Italy', 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/55.png', 2025, true)
ON CONFLICT (api_id) DO UPDATE SET
  name = EXCLUDED.name,
  country = EXCLUDED.country,
  logo = EXCLUDED.logo,
  is_active = true,
  updated_at = now();
