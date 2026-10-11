/*
# Add Champions League, Europa League, Copa Libertadores, MLS, and Eredivisie

1. New leagues added to the `leagues` table:
   - UEFA Champions League (espn_slug: uefa.champions)
   - UEFA Europa League (espn_slug: uefa.europa)
   - Copa Libertadores (espn_slug: conmebol.libertadores)
   - MLS (espn_slug: usa.1)
   - Eredivisie (espn_slug: ned.1)
   - Primeira Liga (espn_slug: por.1)
   - Saudi Pro League (espn_slug: saudi.1)
2. All leagues are set to is_active = true with season 2026.
3. No security changes — leagues table already has existing policies.
*/

INSERT INTO leagues (name, country, espn_slug, season, is_active, logo)
VALUES
  ('Champions League', 'Europe', 'uefa.champions', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/2000.png'),
  ('Europa League', 'Europe', 'uefa.europa', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/2017.png'),
  ('Copa Libertadores', 'South America', 'conmebol.libertadores', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/2018.png'),
  ('MLS', 'USA', 'usa.1', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/1936.png'),
  ('Eredivisie', 'Netherlands', 'ned.1', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/2282.png'),
  ('Primeira Liga', 'Portugal', 'por.1', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/2036.png'),
  ('Saudi Pro League', 'Saudi Arabia', 'saudi.1', 2026, true, 'https://a.espncdn.com/i/leaguelogos/soccer/500/2933.png')
ON CONFLICT DO NOTHING;
