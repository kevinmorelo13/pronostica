// ============================================================
// Sports Sync Edge Function (ESPN API + AI Ensemble)
// ============================================================
// Data source: ESPN public JSON API (no API key needed)
// Endpoints:
//   /sports/soccer/{slug}/scoreboard?dates=YYYYMMDD
//   /sports/soccer/{slug}/standings?season=YYYY
//   /sports/soccer/{slug}/teams/{teamId}/schedule?season=YYYY
//   /sports/soccer/{slug}/summary?event={eventId}
// Models: Elo, Poisson, Dixon-Coles, Logistic Regression,
//         Random Forest (simplified), XGBoost (simplified),
//         Neural Network (simplified)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_BASE_V2 = "https://site.api.espn.com/apis/v2/sports/soccer";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ============================================================
// ESPN fetch helper
// ============================================================

async function espnFetch(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ESPN ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Map ESPN status to our status
function mapEspnStatus(statusType: any): { status: string; minute: number | null } {
  const state = (statusType?.state ?? "").toLowerCase();
  const desc = (statusType?.description ?? "").toUpperCase();
  if (state === "post" || desc.includes("FULL TIME") || desc.includes("ENDED")) return { status: "finished", minute: null };
  if (state === "in" || desc.includes("IN PROGRESS")) {
    const clock = statusType?.clock ?? 0;
    const minute = Math.floor(clock / 60);
    if (desc.includes("HALF") || minute >= 45 && minute <= 50) return { status: "halftime", minute: 45 };
    return { status: "live", minute: minute > 0 ? minute : null };
  }
  if (desc.includes("POSTPONED")) return { status: "postponed", minute: null };
  if (desc.includes("CANCEL") || desc.includes("ABANDONED")) return { status: "cancelled", minute: null };
  return { status: "scheduled", minute: null };
}

// ============================================================
// Date helpers
// ============================================================

function getBogotaDate(): string {
  const now = new Date();
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

function getSeasonYear(date: string): number {
  return parseInt(date.slice(0, 4));
}

// ============================================================
// Status mapping
// ============================================================

// Legacy status mapper (kept for compatibility)
function mapMatchStatus(short: string, elapsed: number | null): { status: string; minute: number | null } {
  const s = (short ?? "").toUpperCase();
  if (s === "FT" || s === "AET" || s === "PEN") return { status: "finished", minute: null };
  if (s === "PST") return { status: "postponed", minute: null };
  if (s === "CANC") return { status: "cancelled", minute: null };
  if (s === "HT") return { status: "halftime", minute: elapsed ?? 45 };
  if (s === "1H" || s === "2H" || s === "ET" || s === "BT" || s === "LIVE") {
    return { status: "live", minute: elapsed ?? null };
  }
  return { status: "scheduled", minute: null };
}

// ============================================================
// Upsert helpers
// ============================================================

async function upsertTeam(apiTeam: { id: number; name: string; logo?: string; code?: string }, leagueId: string | null): Promise<string> {
  const { data, error } = await supabase
    .from("teams")
    .upsert({
      api_id: apiTeam.id,
      name: apiTeam.name,
      short_name: apiTeam.code ?? apiTeam.name.slice(0, 3).toUpperCase(),
      logo: apiTeam.logo ?? null,
      league_id: leagueId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_id" })
    .select("id")
    .single();
  if (error) throw new Error(`upsertTeam: ${error.message}`);
  return data.id;
}

// Upsert an ESPN match event
async function upsertEspnMatch(event: any, leagueId: string, homeTeamId: string, awayTeamId: string): Promise<string> {
  const competition = event.competitions?.[0] ?? event;
  const statusType = competition.status?.type ?? event.status?.type ?? {};
  const statusInfo = mapEspnStatus(statusType);
  const matchDate = event.date ?? competition.date ?? new Date().toISOString();
  const competitors = competition.competitors ?? [];
  const homeComp = competitors.find((c: any) => c.homeAway === "home");
  const awayComp = competitors.find((c: any) => c.homeAway === "away");
  const homeScore = homeComp?.score != null ? Number(homeComp.score) : null;
  const awayScore = awayComp?.score != null ? Number(awayComp.score) : null;
  const venue = competition.venue?.fullName ?? null;
  const round = event.status?.type?.shortDetail ?? null;

  const { data, error } = await supabase
    .from("matches")
    .upsert({
      api_id: Number(event.id),
      league_id: leagueId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDate,
      status: statusInfo.status,
      home_score: homeScore,
      away_score: awayScore,
      minute: statusInfo.minute,
      venue: venue,
      referee: null,
      round: round,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_id" })
    .select("id")
    .single();
  if (error) throw new Error(`upsertMatch: ${error.message}`);
  return data.id;
}

// Legacy upsertMatch kept for compatibility
async function upsertMatch(fixture: any, leagueId: string, homeTeamId: string, awayTeamId: string): Promise<string> {
  const statusInfo = mapMatchStatus(fixture.fixture?.status?.short, fixture.fixture?.status?.elapsed ?? null);
  const matchDate = fixture.fixture?.date ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("matches")
    .upsert({
      api_id: fixture.fixture.id,
      league_id: leagueId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: matchDate,
      status: statusInfo.status,
      home_score: fixture.goals?.home ?? null,
      away_score: fixture.goals?.away ?? null,
      minute: statusInfo.minute,
      venue: fixture.fixture?.venue?.name ?? null,
      referee: fixture.fixture?.referee ?? null,
      round: fixture.league?.round ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_id" })
    .select("id")
    .single();
  if (error) throw new Error(`upsertMatch: ${error.message}`);
  return data.id;
}

// ============================================================
// Fetch matches for a date
// ============================================================

// ============================================================
// Fetch matches for a date from ESPN
// Calls per-league scoreboard with ?dates=YYYYMMDD
// ============================================================

async function fetchMatchesForDate(date: string): Promise<{ fetched: number; leagueIds: string[] }> {
  const espnDate = (date.includes("T") ? date.slice(0, 10) : date).replace(/-/g, "");

  const { data: activeLeagues } = await supabase
    .from("leagues")
    .select("id, api_id, espn_slug, name")
    .eq("is_active", true);

  const leagueIds: string[] = [];
  let fetched = 0;

  for (const league of activeLeagues ?? []) {
    if (!league.espn_slug) continue;

    let events: any[] = [];
    try {
      const data = await espnFetch(`${ESPN_BASE}/${league.espn_slug}/scoreboard?dates=${espnDate}`);
      events = data?.events ?? [];
    } catch (e) {
      console.error(`ESPN scoreboard for ${league.espn_slug}: ${(e as Error).message}`);
      continue;
    }

    if (!leagueIds.includes(league.id)) leagueIds.push(league.id);

    for (const ev of events) {
      const competition = ev.competitions?.[0] ?? ev;
      const competitors = competition.competitors ?? [];
      const homeComp = competitors.find((c: any) => c.homeAway === "home");
      const awayComp = competitors.find((c: any) => c.homeAway === "away");
      if (!homeComp?.team || !awayComp?.team) continue;

      const homeTeam = homeComp.team;
      const awayTeam = awayComp.team;

      const homeId = await upsertTeam({
        id: Number(homeTeam.id),
        name: homeTeam.displayName ?? homeTeam.name,
        logo: homeTeam.logos?.[0]?.href ?? null,
        code: homeTeam.abbreviation,
      }, league.id);
      const awayId = await upsertTeam({
        id: Number(awayTeam.id),
        name: awayTeam.displayName ?? awayTeam.name,
        logo: awayTeam.logos?.[0]?.href ?? null,
        code: awayTeam.abbreviation,
      }, league.id);
      await upsertEspnMatch(ev, league.id, homeId, awayId);
      fetched++;
    }
  }

  return { fetched, leagueIds };
}

// ============================================================
// Sync standings
// ============================================================

// ============================================================
// Sync standings from ESPN
// Endpoint: /v2/sports/soccer/{slug}/standings?season=YYYY
// ============================================================

async function syncStandings(espnSlugOrId: string | number, seasonYear: number): Promise<number> {
  // Resolve league by espn_slug or api_id
  const slugStr = String(espnSlugOrId);
  let leagueRow: any = null;
  if (slugStr.includes(".")) {
    const { data } = await supabase.from("leagues").select("id, espn_slug").eq("espn_slug", slugStr).maybeSingle();
    leagueRow = data;
  } else {
    const { data } = await supabase.from("leagues").select("id, espn_slug").eq("api_id", Number(slugStr)).maybeSingle();
    leagueRow = data;
  }
  if (!leagueRow?.espn_slug) return 0;

  let standingsData: any;
  try {
    standingsData = await espnFetch(`${ESPN_BASE_V2}/${leagueRow.espn_slug}/standings?season=${seasonYear}`);
  } catch (e) {
    console.error(`ESPN standings for ${leagueRow.espn_slug}: ${(e as Error).message}`);
    return 0;
  }

  const entries = standingsData?.children?.[0]?.standings?.entries ?? [];
  if (entries.length === 0) return 0;

  let updated = 0;
  for (const entry of entries) {
    const team = entry.team;
    const stats: Record<string, number> = {};
    for (const s of entry.stats ?? []) {
      if (s.value != null) stats[s.name] = Number(s.value);
    }

    const teamId = await upsertTeam({
      id: Number(team.id),
      name: team.displayName ?? team.name,
      logo: team.logos?.[0]?.href ?? null,
      code: team.abbreviation,
    }, leagueRow.id);

    await supabase.from("standings").upsert({
      league_id: leagueRow.id, team_id: teamId, season: seasonYear,
      position: updated + 1,
      played: stats.gamesPlayed ?? 0,
      wins: stats.wins ?? 0, draws: stats.ties ?? 0, losses: stats.losses ?? 0,
      goals_for: stats.pointsFor ?? 0, goals_against: stats.pointsAgainst ?? 0,
      goal_diff: stats.pointDifferential ?? 0, points: stats.points ?? 0,
      form: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "league_id,team_id,season" });
    updated++;
  }

  return updated;
}

// ============================================================
// Fetch team statistics
// ============================================================

// ============================================================
// Fetch team statistics from ESPN
// Uses team schedule endpoint to compute form, goals, home/away splits
// Endpoint: /site/v2/sports/soccer/{slug}/teams/{teamId}/schedule?season=YYYY
// ============================================================

async function fetchTeamStats(leagueApiId: number, seasonYear: number, teamApiId: number): Promise<void> {
  const { data: leagueRow } = await supabase
    .from("leagues").select("id, espn_slug").eq("api_id", leagueApiId).maybeSingle();
  if (!leagueRow?.espn_slug) return;
  const { data: teamRow } = await supabase.from("teams").select("id").eq("api_id", teamApiId).maybeSingle();
  if (!teamRow) return;

  let events: any[] = [];
  try {
    const data = await espnFetch(`${ESPN_BASE}/${leagueRow.espn_slug}/teams/${teamApiId}/schedule?season=${seasonYear}`);
    events = data?.events ?? [];
  } catch (e) {
    console.error(`ESPN team schedule for ${teamApiId}: ${(e as Error).message}`);
    return;
  }

  if (events.length === 0) return;

  let played = 0, wins = 0, draws = 0, losses = 0;
  let goalsFor = 0, goalsAgainst = 0;
  let homePlayed = 0, homeWins = 0, homeDraws = 0, homeLosses = 0;
  let homeGoalsScored = 0, homeGoalsConceded = 0;
  let awayPlayed = 0, awayWins = 0, awayDraws = 0, awayLosses = 0;
  let awayGoalsScored = 0, awayGoalsConceded = 0;
  let cleanSheets = 0;
  const formChars: string[] = [];

  // Process in reverse chronological order (most recent first for form)
  const sortedEvents = [...events].sort((a: any, b: any) =>
    new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  );

  for (const ev of sortedEvents) {
    const competition = ev.competitions?.[0] ?? ev;
    const statusState = (competition.status?.type?.state ?? "").toLowerCase();
    if (statusState !== "post") continue; // only finished matches

    const competitors = competition.competitors ?? [];
    const myComp = competitors.find((c: any) => Number(c.team?.id) === teamApiId);
    const oppComp = competitors.find((c: any) => Number(c.team?.id) !== teamApiId);
    if (!myComp || !oppComp) continue;

    const isHome = myComp.homeAway === "home";
    const myGoals = Number(myComp.score ?? 0);
    const oppGoals = Number(oppComp.score ?? 0);

    played++;
    goalsFor += myGoals;
    goalsAgainst += oppGoals;

    let result: string;
    if (myGoals > oppGoals) { wins++; result = "W"; }
    else if (myGoals === oppGoals) { draws++; result = "D"; }
    else { losses++; result = "L"; }
    if (formChars.length < 5) formChars.push(result);

    if (oppGoals === 0) cleanSheets++;

    if (isHome) {
      homePlayed++; homeGoalsScored += myGoals; homeGoalsConceded += oppGoals;
      if (result === "W") homeWins++; else if (result === "D") homeDraws++; else homeLosses++;
    } else {
      awayPlayed++; awayGoalsScored += myGoals; awayGoalsConceded += oppGoals;
      if (result === "W") awayWins++; else if (result === "D") awayDraws++; else awayLosses++;
    }
  }

  if (played === 0) return;

  await supabase.from("team_statistics").upsert({
    team_id: teamRow.id, league_id: leagueRow.id, season: seasonYear,
    form: formChars.join(""), played,
    wins, draws, losses,
    goals_scored: goalsFor, goals_conceded: goalsAgainst, clean_sheets: cleanSheets,
    home_played: homePlayed, home_wins: homeWins, home_draws: homeDraws, home_losses: homeLosses,
    home_goals_scored: homeGoalsScored, home_goals_conceded: homeGoalsConceded,
    away_played: awayPlayed, away_wins: awayWins, away_draws: awayDraws, away_losses: awayLosses,
    away_goals_scored: awayGoalsScored, away_goals_conceded: awayGoalsConceded,
    avg_goals_scored: Number((goalsFor / played).toFixed(2)),
    avg_goals_conceded: Number((goalsAgainst / played).toFixed(2)),
    updated_at: new Date().toISOString(),
  }, { onConflict: "team_id,league_id,season" });
}

// ============================================================
// Fetch H2H
// ============================================================

// ============================================================
// Fetch H2H from ESPN
// Uses the summary endpoint's seasonseries (head-to-head)
// We need a match event ID — find the next match between the two teams
// Alternative: fetch team schedule and cross-reference
// ============================================================

async function fetchH2H(homeApiId: number, awayApiId: number): Promise<number> {
  const { data: homeTeam } = await supabase.from("teams").select("id").eq("api_id", homeApiId).maybeSingle();
  const { data: awayTeam } = await supabase.from("teams").select("id").eq("api_id", awayApiId).maybeSingle();
  if (!homeTeam || !awayTeam) return 0;

  // Find a recent match between these two teams to get an event ID for the summary endpoint
  const { data: matchRow } = await supabase
    .from("matches")
    .select("api_id, league:leagues(espn_slug)")
    .or(`and(home_team_id.eq.${homeTeam.id},away_team_id.eq.${awayTeam.id}),and(home_team_id.eq.${awayTeam.id},away_team_id.eq.${homeTeam.id})`)
    .order("match_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const espnSlug = (matchRow as any)?.league?.espn_slug;
  const eventId = (matchRow as any)?.api_id;
  if (!espnSlug || !eventId) return 0;

  let summaryData: any;
  try {
    summaryData = await espnFetch(`${ESPN_BASE}/${espnSlug}/summary?event=${eventId}`);
  } catch { return 0; }

  const seriesData = (summaryData?.seasonseries ?? []).find((s: any) => s.type === "head-to-head");
  const events = seriesData?.events ?? [];
  if (events.length === 0) return 0;

  let count = 0;
  for (const ev of events) {
    const competition = ev;
    const statusState = (competition.statusType?.state ?? competition.status?.type?.state ?? "").toLowerCase();
    if (statusState !== "post") continue;

    const competitors = competition.competitions?.[0]?.competitors ?? [];
    if (competitors.length === 0) continue;
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;

    const hs = Number(home.score ?? 0);
    const as = Number(away.score ?? 0);
    const winner = hs > as ? "home" : as > hs ? "away" : "draw";
    const matchDate = ev.date ?? new Date().toISOString();

    await supabase.from("h2h_records").upsert({
      home_team_id: homeTeam.id, away_team_id: awayTeam.id,
      match_date: matchDate,
      home_score: hs, away_score: as, winner,
      competition: summaryData?.leagues?.[0]?.name ?? null,
    }, { onConflict: "home_team_id,away_team_id,match_date" });
    count++;
  }
  return count;
}

// ============================================================
// ELO RATING SYSTEM
// ============================================================

const ELO_K = 32;
const ELO_HOME_ADVANTAGE = 65;

async function getElo(teamId: string): Promise<number> {
  const { data } = await supabase.from("elo_ratings").select("rating").eq("team_id", teamId).maybeSingle();
  return data?.rating ?? 1200;
}

async function updateElo(homeId: string, awayId: string, homeScore: number, awayScore: number): Promise<void> {
  const homeElo = await getElo(homeId);
  const awayElo = await getElo(awayId);

  const expectedHome = 1 / (1 + Math.pow(10, (awayElo - homeElo - ELO_HOME_ADVANTAGE) / 400));
  const expectedAway = 1 - expectedHome;

  const actualHome = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
  const actualAway = 1 - actualHome;

  const goalDiff = Math.abs(homeScore - awayScore);
  const multiplier = goalDiff <= 1 ? 1 : goalDiff === 2 ? 1.5 : (11 + goalDiff) / 8;

  const newHomeElo = homeElo + ELO_K * multiplier * (actualHome - expectedHome);
  const newAwayElo = awayElo + ELO_K * multiplier * (actualAway - expectedAway);

  const { data: homeExisting } = await supabase.from("elo_ratings").select("matches_played, peak_rating").eq("team_id", homeId).maybeSingle();
  const homeMatches = (homeExisting?.matches_played ?? 0) + 1;
  const homePeak = Math.max(homeExisting?.peak_rating ?? newHomeElo, newHomeElo);
  await supabase.from("elo_ratings").upsert({
    team_id: homeId, rating: Number(newHomeElo.toFixed(2)),
    peak_rating: Number(homePeak.toFixed(2)),
    matches_played: homeMatches,
    updated_at: new Date().toISOString(),
  }, { onConflict: "team_id" });

  const { data: awayExisting } = await supabase.from("elo_ratings").select("matches_played, peak_rating").eq("team_id", awayId).maybeSingle();
  const awayMatches = (awayExisting?.matches_played ?? 0) + 1;
  const awayPeak = Math.max(awayExisting?.peak_rating ?? newAwayElo, newAwayElo);
  await supabase.from("elo_ratings").upsert({
    team_id: awayId, rating: Number(newAwayElo.toFixed(2)),
    peak_rating: Number(awayPeak.toFixed(2)),
    matches_played: awayMatches,
    updated_at: new Date().toISOString(),
  }, { onConflict: "team_id" });
}

async function updateEloForFinishedMatches(): Promise<number> {
  const { data: recentFinished } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, home_score, away_score")
    .eq("status", "finished")
    .not("home_score", "is", null)
    .order("match_date", { ascending: false })
    .limit(50);

  let count = 0;
  for (const m of recentFinished ?? []) {
    await updateElo(m.home_team_id, m.away_team_id, m.home_score ?? 0, m.away_score ?? 0);
    count++;
  }
  return count;
}

function eloProbability(homeElo: number, awayElo: number): { home: number; draw: number; away: number } {
  const adjustedHomeElo = homeElo + ELO_HOME_ADVANTAGE;
  const expectedHome = 1 / (1 + Math.pow(10, (awayElo - adjustedHomeElo) / 400));
  // Calibrated draw probability: based on empirical football data,
  // draws occur ~26% of the time when teams are evenly matched, dropping
  // to ~15% when the Elo gap exceeds 200 points.
  const diff = Math.abs(adjustedHomeElo - awayElo);
  const drawProb = Math.max(0.15, 0.28 - diff / 800);
  // Split the remaining probability using the Elo expected score
  const homeProb = expectedHome * (1 - drawProb);
  const awayProb = (1 - expectedHome) * (1 - drawProb);
  const sum = homeProb + drawProb + awayProb;
  return {
    home: Math.min(95, (homeProb / sum) * 100),
    draw: Math.min(45, (drawProb / sum) * 100),
    away: Math.min(95, (awayProb / sum) * 100),
  };
}

// ============================================================
// POISSON MODEL
// ============================================================

function poissonProb(lambda: number, k: number): number {
  const fact = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact[k];
}

function poissonModel(homeLambda: number, awayLambda: number) {
  let pHome = 0, pDraw = 0, pAway = 0;
  let pOver05 = 0, pOver15 = 0, pOver25 = 0, pOver35 = 0, pUnder25 = 0, pBtts = 0;
  const scoreProbs: Record<string, number> = {};
  const maxG = 8;

  for (let h = 0; h <= maxG; h++) {
    for (let a = 0; a <= maxG; a++) {
      const p = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      const total = h + a;
      if (h > a) pHome += p; else if (h === a) pDraw += p; else pAway += p;
      if (total > 0) pOver05 += p;
      if (total > 1) pOver15 += p;
      if (total > 2) pOver25 += p; else pUnder25 += p;
      if (total > 3) pOver35 += p;
      if (h > 0 && a > 0) pBtts += p;
      if (total <= 4) scoreProbs[`${h}-${a}`] = Number((p * 100).toFixed(1));
    }
  }

  return {
    home: pHome * 100, draw: pDraw * 100, away: pAway * 100,
    over05: pOver05 * 100, over15: pOver15 * 100, over25: pOver25 * 100,
    over35: pOver35 * 100, under25: pUnder25 * 100, btts: pBtts * 100,
    scoreProbs,
    homeScore: Math.round(homeLambda), awayScore: Math.round(awayLambda),
  };
}

// ============================================================
// DIXON-COLES MODEL
// Correction for low scores (0-0, 1-0, 0-1, 1-1)
// ============================================================

function dixonColesModel(homeLambda: number, awayLambda: number) {
  const tau = (h: number, a: number): number => {
    if (h === 0 && a === 0) return 1 - (homeLambda * awayLambda * 0.05);
    if (h === 0 && a === 1) return 1 + (homeLambda * 0.05);
    if (h === 1 && a === 0) return 1 + (awayLambda * 0.05);
    if (h === 1 && a === 1) return 1 - (0.05);
    return 1;
  };

  let pHome = 0, pDraw = 0, pAway = 0;
  let pOver25 = 0, pUnder25 = 0, pBtts = 0;
  const scoreProbs: Record<string, number> = {};
  const maxG = 8;

  for (let h = 0; h <= maxG; h++) {
    for (let a = 0; a <= maxG; a++) {
      const p = poissonProb(homeLambda, h) * poissonProb(awayLambda, a) * tau(h, a);
      const total = h + a;
      if (h > a) pHome += p; else if (h === a) pDraw += p; else pAway += p;
      if (total > 2) pOver25 += p; else pUnder25 += p;
      if (h > 0 && a > 0) pBtts += p;
      if (total <= 4) scoreProbs[`${h}-${a}`] = Number((p * 100).toFixed(1));
    }
  }

  const sum = pHome + pDraw + pAway;
  return {
    home: (pHome / sum) * 100, draw: (pDraw / sum) * 100, away: (pAway / sum) * 100,
    over25: Math.min(98, pOver25 * 100), under25: Math.max(2, pUnder25 * 100),
    btts: Math.min(95, pBtts * 100), scoreProbs,
    homeScore: Math.round(homeLambda), awayScore: Math.round(awayLambda),
  };
}

// ============================================================
// LOGISTIC REGRESSION (simplified)
// Uses form, Elo diff, home advantage
// ============================================================

function logisticRegression(homeForm: number, awayForm: number, eloDiff: number, homeAdv: number) {
  const z = 0.8 * eloDiff / 100 + 1.5 * (homeForm - awayForm) + 0.5 * homeAdv;
  const pHomeWin = 1 / (1 + Math.exp(-z));
  const zDraw = -0.45 - Math.abs(z) * 0.25;
  const pDrawRaw = 1 / (1 + Math.exp(-zDraw));
  const pAwayWin = 1 - pHomeWin;
  const sum = pHomeWin + pDrawRaw + pAwayWin;
  return {
    home: (pHomeWin / sum) * 100,
    draw: (pDrawRaw / sum) * 100,
    away: (pAwayWin / sum) * 100,
  };
}

// ============================================================
// RANDOM FOREST (simplified decision tree ensemble)
// ============================================================

function randomForestModel(homeForm: number, awayForm: number, homeAttack: number, awayAttack: number, homeDefense: number, awayDefense: number, eloDiff: number) {
  // Simplified: multiple "trees" voting with slight perturbations
  const trees: { home: number; draw: number; away: number }[] = [];
  const seeds = [0.95, 1.0, 1.05, 0.98, 1.02, 0.93, 1.07];

  for (const s of seeds) {
    const adjElo = eloDiff * s;
    const formDiff = (homeForm - awayForm) * s;
    const attackDiff = (homeAttack - awayDefense) - (awayAttack - homeDefense);
    const score = adjElo / 80 + formDiff * 2 + attackDiff * 0.5 + 0.3;

    const pHome = 1 / (1 + Math.exp(-score));
    const pAway = 1 - pHome;
    const pDraw = Math.max(0.15, 0.28 - Math.abs(score) * 0.04);
    const sum = pHome + pDraw + pAway;
    trees.push({ home: (pHome / sum) * 100, draw: (pDraw / sum) * 100, away: (pAway / sum) * 100 });
  }

  const avg = trees.reduce((acc, t) => ({
    home: acc.home + t.home, draw: acc.draw + t.draw, away: acc.away + t.away,
  }), { home: 0, draw: 0, away: 0 });

  return {
    home: avg.home / trees.length,
    draw: avg.draw / trees.length,
    away: avg.away / trees.length,
  };
}

// ============================================================
// XGBOOST (simplified gradient boosting)
// ============================================================

function xgboostModel(homeForm: number, awayForm: number, homeAttack: number, awayAttack: number, homeDefense: number, awayDefense: number, eloDiff: number) {
  // Simplified: sequential corrections (like gradient boosting residuals)
  let score = 0;
  // Round 1: base prediction from Elo
  score += eloDiff / 100 * 0.4;
  // Round 2: form correction
  score += (homeForm - awayForm) * 1.8;
  // Round 3: attack/defense correction
  score += (homeAttack - awayDefense) * 0.3 - (awayAttack - homeDefense) * 0.3;
  // Round 4: home advantage
  score += 0.4;

  const pHome = 1 / (1 + Math.exp(-score));
  const pAway = 1 - pHome;
  const pDraw = Math.max(0.12, 0.26 - Math.abs(score) * 0.05);
  const sum = pHome + pDraw + pAway;
  return {
    home: (pHome / sum) * 100,
    draw: (pDraw / sum) * 100,
    away: (pAway / sum) * 100,
  };
}

// ============================================================
// NEURAL NETWORK (simplified single hidden layer)
// ============================================================

function neuralNetworkModel(homeForm: number, awayForm: number, eloDiff: number, homeAttack: number, awayAttack: number, homeDefense: number, awayDefense: number) {
  // Simplified: weighted inputs through sigmoid activation
  const inputs = [homeForm, awayForm, eloDiff / 200, homeAttack, awayAttack, homeDefense, awayDefense, 1];
  // Hidden layer weights (pre-trained approximation)
  const weights = [
    [2.0, -1.5, 1.8, 0.8, -0.5, -0.4, 0.3, 0.5],
    [-0.5, 0.8, -0.6, 0.3, 0.4, 0.2, -0.3, -0.2],
    [1.2, -1.0, 1.5, 0.5, -0.3, -0.2, 0.1, 0.3],
  ];
  const outputWeights = [1.5, -0.8, 1.2];

  const hidden = weights.map(w => {
    const sum = inputs.reduce((acc, x, i) => acc + x * w[i], 0);
    return 1 / (1 + Math.exp(-sum));
  });

  const outputSum = hidden.reduce((acc, h, i) => acc + h * outputWeights[i], 0);
  const pHome = 1 / (1 + Math.exp(-outputSum));
  const pAway = 1 - pHome;
  const pDraw = Math.max(0.15, 0.27 - Math.abs(outputSum) * 0.08);
  const sum = pHome + pDraw + pAway;
  return {
    home: (pHome / sum) * 100,
    draw: (pDraw / sum) * 100,
    away: (pAway / sum) * 100,
  };
}

// ============================================================
// PATTERN DETECTION
// ============================================================

function detectPatterns(homeStats: any, awayStats: any, h2h: any[]): string[] {
  const patterns: string[] = [];

  if (!homeStats || !awayStats) return patterns;

  // Home team scoring patterns
  if (homeStats.played >= 5) {
    const homeScoringRate = homeStats.goals_scored / homeStats.played;
    if (homeScoringRate >= 1.5) {
      patterns.push(`El equipo local marca un promedio de ${homeScoringRate.toFixed(1)} goles por partido.`);
    }
    const homeConcedingRate = homeStats.goals_conceded / homeStats.played;
    if (homeConcedingRate >= 1.3) {
      patterns.push(`El equipo local recibe un promedio de ${homeConcedingRate.toFixed(1)} goles por partido.`);
    }
  }

  // Away team scoring patterns
  if (awayStats.played >= 5) {
    const awayScoringRate = awayStats.goals_scored / awayStats.played;
    if (awayScoringRate >= 1.3) {
      patterns.push(`El equipo visitante marca un promedio de ${awayScoringRate.toFixed(1)} goles por partido.`);
    }
    const awayConcedingRate = awayStats.goals_conceded / awayStats.played;
    if (awayConcedingRate >= 1.5) {
      patterns.push(`El equipo visitante recibe un promedio de ${awayConcedingRate.toFixed(1)} goles por partido.`);
    }
  }

  // Form patterns
  if (homeStats.form) {
    const homeWins = (homeStats.form.slice(-5).match(/W/g) || []).length;
    if (homeWins >= 4) patterns.push(`El local tiene ${homeWins} victorias en sus últimos 5 partidos.`);
  }
  if (awayStats.form) {
    const awayLosses = (awayStats.form.slice(-5).match(/L/g) || []).length;
    if (awayLosses >= 3) patterns.push(`El visitante tiene ${awayLosses} derrotas en sus últimos 5 partidos.`);
  }

  // H2H patterns
  if (h2h.length >= 3) {
    const homeWins = h2h.filter(r => r.winner === "home").length;
    const awayWins = h2h.filter(r => r.winner === "away").length;
    if (homeWins > awayWins && homeWins >= 2) {
      patterns.push(`En los últimos ${h2h.length} enfrentamientos, el local ha ganado ${homeWins} veces.`);
    } else if (awayWins > homeWins && awayWins >= 2) {
      patterns.push(`En los últimos ${h2h.length} enfrentamientos, el visitante ha ganado ${awayWins} veces.`);
    }
    const btts = h2h.filter(r => r.home_score > 0 && r.away_score > 0).length;
    if (btts >= h2h.length * 0.6) {
      patterns.push(`Ambos equipos marcaron en ${btts} de los últimos ${h2h.length} enfrentamientos.`);
    }
    const over25 = h2h.filter(r => r.home_score + r.away_score > 2).length;
    if (over25 >= h2h.length * 0.6) {
      patterns.push(`Superaron 2.5 goles en ${over25} de los últimos ${h2h.length} enfrentamientos.`);
    }
  }

  // Home/away specific patterns
  if (homeStats.home_played >= 4) {
    const homeWinRate = homeStats.home_wins / homeStats.home_played;
    if (homeWinRate >= 0.6) {
      patterns.push(`El local gana el ${(homeWinRate * 100).toFixed(0)}% de sus partidos como local.`);
    }
  }
  if (awayStats.away_played >= 4) {
    const awayLossRate = awayStats.away_losses / awayStats.away_played;
    if (awayLossRate >= 0.5) {
      patterns.push(`El visitante pierde el ${(awayLossRate * 100).toFixed(0)}% de sus partidos como visitante.`);
    }
  }

  return patterns;
}

// ============================================================
// CONFIDENCE SCORE (0-100)
// ============================================================

function calculateConfidence(
  models: { home: number; draw: number; away: number }[],
  homeStats: any,
  awayStats: any,
  h2hCount: number
): number {
  // Factor 1: Data quality (0-30)
  let dataQuality = 0;
  if (homeStats?.played >= 5) dataQuality += 10;
  else if (homeStats?.played >= 2) dataQuality += 7;
  if (awayStats?.played >= 5) dataQuality += 10;
  else if (awayStats?.played >= 2) dataQuality += 7;
  if (h2hCount >= 3) dataQuality += 10;
  else if (h2hCount >= 1) dataQuality += 5;

  // Factor 2: Model agreement (0-35)
  const predictions = models.map(m => {
    const max = Math.max(m.home, m.draw, m.away);
    if (max === m.home) return "home";
    if (max === m.away) return "away";
    return "draw";
  });
  const agreement = Math.max(predictions.filter(p => p === predictions[0]).length, 1) / models.length;
  const modelAgreementScore = agreement * 35;

  // Factor 3: Prediction strength (0-20)
  const avgMax = models.reduce((sum, m) => sum + Math.max(m.home, m.draw, m.away), 0) / models.length;
  const strengthScore = Math.min(20, (avgMax - 33) / 67 * 20);

  // Factor 4: Calibration / stability (0-15)
  const variances = models.map(m => {
    const avg = (m.home + m.draw + m.away) / 3;
    return Math.sqrt((Math.pow(m.home - avg, 2) + Math.pow(m.draw - avg, 2) + Math.pow(m.away - avg, 2)) / 3);
  });
  const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
  const stabilityScore = Math.max(0, 15 - avgVariance / 3);

  return Math.round(Math.min(100, Math.max(0, dataQuality + modelAgreementScore + strengthScore + stabilityScore)));
}

// ============================================================
// SIN SEÑAL determination
// ============================================================

function shouldShowSinSignal(
  homeStats: any,
  awayStats: any,
  confidence: number,
  models: { home: number; draw: number; away: number }[]
): boolean {
  // Only show SIN SEÑAL if we truly have zero data on either team
  if (!homeStats && !awayStats) return true;
  if (homeStats && homeStats.played < 2 && awayStats && awayStats.played < 2) return true;
  if (!homeStats && awayStats && awayStats.played < 2) return true;
  if (!awayStats && homeStats && homeStats.played < 2) return true;
  if (confidence < 15) return true;

  // Check if models are too divided
  const predictions = models.map(m => {
    const max = Math.max(m.home, m.draw, m.away);
    if (max === m.home) return "home";
    if (max === m.away) return "away";
    return "draw";
  });
  const counts: Record<string, number> = {};
  for (const p of predictions) counts[p] = (counts[p] ?? 0) + 1;
  const maxAgreement = Math.max(...Object.values(counts));
  const agreementRatio = maxAgreement / models.length;

  if (agreementRatio < 0.5) return true;

  // Check if top probability is too low
  const avgTop = models.reduce((sum, m) => sum + Math.max(m.home, m.draw, m.away), 0) / models.length;
  if (avgTop < 38) return true;

  return false;
}

// ============================================================
// Get model weights from performance table
// ============================================================

async function getModelWeights(season: number): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("model_performance")
    .select("model_name, weight")
    .eq("season", season);

  const weights: Record<string, number> = {};
  for (const row of data ?? []) {
    weights[row.model_name] = Number(row.weight);
  }

  // Defaults
  return {
    poisson: weights.poisson ?? 0.21,
    elo: weights.elo ?? 0.14,
    dixon_coles: weights.dixon_coles ?? 0.12,
    logistic: weights.logistic ?? 0.10,
    random_forest: weights.random_forest ?? 0.17,
    xgboost: weights.xgboost ?? 0.24,
    neural_network: weights.neural_network ?? 0.12,
  };
}

// ============================================================
// FEATURE EXTRACTION
// ============================================================

type TeamStats = {
  form: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
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
};

function formScore(form: string | null): number {
  if (!form) return 0.5;
  const chars = form.slice(-5).split("");
  let score = 0;
  for (const c of chars) {
    if (c === "W") score += 1;
    else if (c === "D") score += 0.5;
  }
  return score / 5;
}

// ============================================================
// GENERATE PREDICTIONS (Ensemble)
// ============================================================

async function generatePredictions(date: string): Promise<number> {
  const next = new Date(`${date}T05:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const start = `${date}T00:00:00.000Z`;
  const end = `${next.toISOString().slice(0, 10)}T04:59:59.999Z`;
  const seasonYear = getSeasonYear(date);

  const { data: matches, error } = await supabase
    .from("matches")
    .select(`
      id, home_team_id, away_team_id, league_id,
      home_team:teams!matches_home_team_id_fkey(id, api_id, name, short_name),
      away_team:teams!matches_away_team_id_fkey(id, api_id, name, short_name),
      league:leagues(id, api_id, season)
    `)
    .gte("match_date", start)
    .lte("match_date", end)
    .in("status", ["scheduled", "live", "halftime"]);

  if (error) throw new Error(`fetch matches: ${error.message}`);
  if (!matches || matches.length === 0) return 0;

  // Fetch team stats and H2H concurrently so large match days finish within the edge limit.
  const statsFetched = new Set<string>();
  const statsRequests: Promise<unknown>[] = [];
  for (const m of matches) {
    const leagueApiId = (m.league as any)?.api_id;
    const homeApiId = (m.home_team as any)?.api_id;
    const awayApiId = (m.away_team as any)?.api_id;
    if (!leagueApiId || !homeApiId || !awayApiId) continue;

    const homeKey = `${leagueApiId}-${homeApiId}`;
    const awayKey = `${leagueApiId}-${awayApiId}`;
    if (!statsFetched.has(homeKey)) {
      statsFetched.add(homeKey);
      statsRequests.push(fetchTeamStats(leagueApiId, seasonYear, homeApiId));
    }
    if (!statsFetched.has(awayKey)) {
      statsFetched.add(awayKey);
      statsRequests.push(fetchTeamStats(leagueApiId, seasonYear, awayApiId));
    }
    const h2hKey = `h2h-${homeApiId}-${awayApiId}`;
    if (!statsFetched.has(h2hKey)) {
      statsFetched.add(h2hKey);
      statsRequests.push(fetchH2H(homeApiId, awayApiId));
    }
  }
  await Promise.allSettled(statsRequests);

  // Update Elo for finished matches
  await updateEloForFinishedMatches();

  // Get dynamic model weights
  const weights = await getModelWeights(seasonYear);

  let count = 0;

  for (const m of matches) {
    let { data: hs } = await supabase.from("team_statistics").select("*").eq("team_id", m.home_team_id).eq("league_id", m.league_id).maybeSingle();
    let { data: as } = await supabase.from("team_statistics").select("*").eq("team_id", m.away_team_id).eq("league_id", m.league_id).maybeSingle();
    const { data: h2hData } = await supabase.from("h2h_records").select("winner, home_score, away_score").or(`and(home_team_id.eq.${m.home_team_id},away_team_id.eq.${m.away_team_id}),and(home_team_id.eq.${m.away_team_id},away_team_id.eq.${m.home_team_id})`).limit(10);

    // FALLBACK: derive team_statistics from standings when not available
    // ESPN team schedule endpoint is often blocked from edge functions,
    // but standings are ingested from the browser. Use them to compute
    // attack/defense strengths and form.
    if (!hs) {
      const { data: homeStand } = await supabase
        .from("standings").select("*").eq("team_id", m.home_team_id).eq("league_id", m.league_id)
        .order("season", { ascending: false }).limit(1).maybeSingle();
      if (homeStand && homeStand.played > 0) {
        const p = homeStand.played;
        const gf = homeStand.goals_for;
        const ga = homeStand.goals_against;
        // Estimate form from recent results (W/D/L ratio)
        const winRate = homeStand.wins / p;
        const drawRate = homeStand.draws / p;
        const formChars: string[] = [];
        const formStr = "W".repeat(Math.round(homeStand.wins * 5 / p)) + "D".repeat(Math.round(homeStand.draws * 5 / p)) + "L".repeat(Math.round(homeStand.losses * 5 / p));
        hs = {
          form: formStr.slice(0, 5),
          played: p, wins: homeStand.wins, draws: homeStand.draws, losses: homeStand.losses,
          goals_scored: gf, goals_conceded: ga, clean_sheets: 0,
          home_played: Math.round(p / 2), home_wins: Math.round(homeStand.wins / 2),
          home_draws: Math.round(homeStand.draws / 2), home_losses: Math.round(homeStand.losses / 2),
          home_goals_scored: Math.round(gf / 2), home_goals_conceded: Math.round(ga / 2),
          away_played: Math.round(p / 2), away_wins: Math.round(homeStand.wins / 2),
          away_draws: Math.round(homeStand.draws / 2), away_losses: Math.round(homeStand.losses / 2),
          away_goals_scored: Math.round(gf / 2), away_goals_conceded: Math.round(ga / 2),
          avg_goals_scored: Number((gf / p).toFixed(2)),
          avg_goals_conceded: Number((ga / p).toFixed(2)),
        };
      }
    }
    if (!as) {
      const { data: awayStand } = await supabase
        .from("standings").select("*").eq("team_id", m.away_team_id).eq("league_id", m.league_id)
        .order("season", { ascending: false }).limit(1).maybeSingle();
      if (awayStand && awayStand.played > 0) {
        const p = awayStand.played;
        const gf = awayStand.goals_for;
        const ga = awayStand.goals_against;
        const formStr = "W".repeat(Math.round(awayStand.wins * 5 / p)) + "D".repeat(Math.round(awayStand.draws * 5 / p)) + "L".repeat(Math.round(awayStand.losses * 5 / p));
        as = {
          form: formStr.slice(0, 5),
          played: p, wins: awayStand.wins, draws: awayStand.draws, losses: awayStand.losses,
          goals_scored: gf, goals_conceded: ga, clean_sheets: 0,
          home_played: Math.round(p / 2), home_wins: Math.round(awayStand.wins / 2),
          home_draws: Math.round(awayStand.draws / 2), home_losses: Math.round(awayStand.losses / 2),
          home_goals_scored: Math.round(gf / 2), home_goals_conceded: Math.round(ga / 2),
          away_played: Math.round(p / 2), away_wins: Math.round(awayStand.wins / 2),
          away_draws: Math.round(awayStand.draws / 2), away_losses: Math.round(awayStand.losses / 2),
          away_goals_scored: Math.round(gf / 2), away_goals_conceded: Math.round(ga / 2),
          avg_goals_scored: Number((gf / p).toFixed(2)),
          avg_goals_conceded: Number((ga / p).toFixed(2)),
        };
      }
    }

    const homeStats = hs as TeamStats | null;
    const awayStats = as as TeamStats | null;
    const h2h = h2hData ?? [];

    // Elo
    const homeElo = await getElo(m.home_team_id);
    const awayElo = await getElo(m.away_team_id);
    const eloDiff = homeElo - awayElo;

    // Features
    const homeForm = formScore(homeStats?.form ?? null);
    const awayForm = formScore(awayStats?.form ?? null);
    const homeAttack = homeStats?.avg_goals_scored ?? 1.2;
    const homeDefense = homeStats?.avg_goals_conceded ?? 1.2;
    const awayAttack = awayStats?.avg_goals_scored ?? 1.0;
    const awayDefense = awayStats?.avg_goals_conceded ?? 1.2;

    const homeHomeAttack = homeStats && homeStats.home_played > 0 ? homeStats.home_goals_scored / homeStats.home_played : homeAttack;
    const homeHomeDefense = homeStats && homeStats.home_played > 0 ? homeStats.home_goals_conceded / homeStats.home_played : homeDefense;
    const awayAwayAttack = awayStats && awayStats.away_played > 0 ? awayStats.away_goals_scored / awayStats.away_played : awayAttack;
    const awayAwayDefense = awayStats && awayStats.away_played > 0 ? awayStats.away_goals_conceded / awayStats.away_played : awayDefense;

    // Lambdas for Poisson/Dixon-Coles
    const leagueAvg = 1.35;
    const homeLambda = Math.max(0.3, (homeHomeAttack * 0.6 + homeAttack * 0.4) * (awayAwayDefense / leagueAvg) * (1 + (homeForm - awayForm) * 0.15));
    const awayLambda = Math.max(0.2, (awayAwayAttack * 0.6 + awayAttack * 0.4) * (homeHomeDefense / leagueAvg) * (1 - (homeForm - awayForm) * 0.15));

    // === RUN ALL MODELS ===
    const eloResult = eloProbability(homeElo, awayElo);
    const poissonResult = poissonModel(homeLambda, awayLambda);
    const dcResult = dixonColesModel(homeLambda, awayLambda);
    const logisticResult = logisticRegression(homeForm, awayForm, eloDiff, 1);
    const rfResult = randomForestModel(homeForm, awayForm, homeAttack, awayAttack, homeDefense, awayDefense, eloDiff);
    const xgbResult = xgboostModel(homeForm, awayForm, homeAttack, awayAttack, homeDefense, awayDefense, eloDiff);
    const nnResult = neuralNetworkModel(homeForm, awayForm, eloDiff, homeAttack, awayAttack, homeDefense, awayDefense);

    const allModels = [
      { name: "elo", result: eloResult, weight: weights.elo ?? 0.14 },
      { name: "poisson", result: poissonResult, weight: weights.poisson ?? 0.21 },
      { name: "dixon_coles", result: dcResult, weight: weights.dixon_coles ?? 0.12 },
      { name: "logistic", result: logisticResult, weight: weights.logistic ?? 0.10 },
      { name: "random_forest", result: rfResult, weight: weights.random_forest ?? 0.17 },
      { name: "xgboost", result: xgbResult, weight: weights.xgboost ?? 0.24 },
      { name: "neural_network", result: nnResult, weight: weights.neural_network ?? 0.12 },
    ];

    // === ENSEMBLE: weighted average ===
    const totalWeight = allModels.reduce((sum, m) => sum + m.weight, 0);
    const ensembleHome = allModels.reduce((sum, m) => sum + m.result.home * m.weight, 0) / totalWeight;
    const ensembleDraw = allModels.reduce((sum, m) => sum + m.result.draw * m.weight, 0) / totalWeight;
    const ensembleAway = allModels.reduce((sum, m) => sum + m.result.away * m.weight, 0) / totalWeight;

    // Normalize
    const sumP = ensembleHome + ensembleDraw + ensembleAway;
    const finalHome = (ensembleHome / sumP) * 100;
    const finalDraw = (ensembleDraw / sumP) * 100;
    const finalAway = (ensembleAway / sumP) * 100;

    // Over/Under from Poisson
    const finalOver05 = poissonResult.over05;
    const finalOver15 = poissonResult.over15;
    const finalOver25 = (poissonResult.over25 * 0.5 + dcResult.over25 * 0.5);
    const finalOver35 = poissonResult.over35;
    const finalUnder25 = 100 - finalOver25;
    const finalBtts = (poissonResult.btts + dcResult.btts) / 2;

    // Best score from Poisson score probs
    const scoreProbs = poissonResult.scoreProbs;
    let bestScore = "1-1", bestScoreProb = 0;
    for (const [score, prob] of Object.entries(scoreProbs)) {
      if (prob > bestScoreProb) { bestScoreProb = prob; bestScore = score; }
    }
    const [predHomeScore, predAwayScore] = bestScore.split("-").map(Number);

    // Model agreement
    const modelPicks = allModels.map(m => {
      const r = m.result;
      const max = Math.max(r.home, r.draw, r.away);
      const pick = max === r.home ? "home" : max === r.away ? "away" : "draw";
      return { model: m.name, pick };
    });
    const pickCounts: Record<string, number> = {};
    for (const p of modelPicks) pickCounts[p.pick] = (pickCounts[p.pick] ?? 0) + 1;
    const topPick = Object.entries(pickCounts).sort((a, b) => b[1] - a[1])[0];
    const agreementRatio = topPick ? topPick[1] : 0;
    const totalModels = allModels.length;

    // Confidence score
    const confidenceScore = calculateConfidence(
      allModels.map(m => m.result),
      homeStats, awayStats, h2h.length
    );

    // SIN SEÑAL check
    const hasSignal = !shouldShowSinSignal(homeStats, awayStats, confidenceScore, allModels.map(m => m.result));

    // Patterns
    const patterns = detectPatterns(homeStats, awayStats, h2h);

    // Confidence level
    const maxProb = Math.max(finalHome, finalDraw, finalAway);
    let confidence = "low";
    if (confidenceScore >= 75) confidence = "very_high";
    else if (confidenceScore >= 60) confidence = "high";
    else if (confidenceScore >= 40) confidence = "medium";

    // Analysis text
    const analysisParts: string[] = [];
    const homeStrength = homeForm * 0.4 + (homeStats?.home_played && homeStats.home_played > 0 ? (homeStats.home_wins * 3 + homeStats.home_draws) / (homeStats.home_played * 3) : 0.5) * 0.6;
    const awayStrength = awayForm * 0.4 + (awayStats?.away_played && awayStats.away_played > 0 ? (awayStats.away_wins * 3 + awayStats.away_draws) / (awayStats.away_played * 3) : 0.5) * 0.6;

    if (!hasSignal) {
      analysisParts.push("Datos insuficientes o modelos demasiado divididos para generar una señal confiable.");
    } else if (homeStrength > awayStrength + 0.15) {
      analysisParts.push(`El equipo local muestra mejor forma reciente (${(homeForm * 100).toFixed(0)}% de victorias en últimos 5) y aprovecha su condición de local.`);
    } else if (awayStrength > homeStrength + 0.15) {
      analysisParts.push(`El equipo visitante llega con mejor forma reciente (${(awayForm * 100).toFixed(0)}% en últimos 5), aunque juega como visitante.`);
    } else {
      analysisParts.push("Ambos equipos presentan forma reciente similar, lo que sugiere un partido equilibrado.");
    }

    analysisParts.push(`Elo: local ${homeElo.toFixed(0)} vs visitante ${awayElo.toFixed(0)} (diferencia ${eloDiff > 0 ? "+" : ""}${eloDiff.toFixed(0)}).`);
    analysisParts.push(`Promedio de goles: local ${homeAttack.toFixed(1)} a favor / ${homeDefense.toFixed(1)} en contra; visitante ${awayAttack.toFixed(1)} / ${awayDefense.toFixed(1)}.`);
    analysisParts.push(`Ensemble de ${totalModels} modelos: ${agreementRatio}/${totalModels} coinciden en ${topPick?.[0] === "home" ? "LOCAL" : topPick?.[0] === "away" ? "VISITANTE" : "EMPATE"}.`);

    if (patterns.length > 0) {
      analysisParts.push(`Patrones detectados: ${patterns.length}.`);
    }

    // ============================================================
    // BEST BET: pick the single highest-probability prediction
    // across ALL markets (1X2, Over/Under, BTTS, exact score)
    // ============================================================
    const homeName = (m as any).home_team?.name ?? "Local";
    const awayName = (m as any).away_team?.name ?? "Visitante";

    // Double chance probabilities
    const dc1X = finalHome + finalDraw;
    const dcX2 = finalDraw + finalAway;
    const dc12 = finalHome + finalAway;

    // Over/Under 0.5 from Poisson
    const finalUnder05 = 100 - finalOver05;
    const finalUnder15 = 100 - finalOver15;
    const finalOver45 = Math.min(15, finalOver35 * 0.35);
    const finalUnder45 = 100 - finalOver45;

    // Estimated corner markets from team stats (avg_corners may be null)
    const homeCorners = (homeStats as any)?.avg_corners ?? 5.2;
    const awayCorners = (awayStats as any)?.avg_corners ?? 4.6;
    const expectedCorners = homeCorners * 0.55 + awayCorners * 0.45;
    const over85Corners = Math.min(90, Math.max(35, (expectedCorners / 8.5) * 65));
    const over95Corners = Math.min(80, Math.max(20, (expectedCorners / 9.5) * 55));
    const under85Corners = 100 - over85Corners;

    // Estimated card markets from team stats
    const homeYellows = (homeStats as any)?.avg_yellow_cards ?? 2.1;
    const awayYellows = (awayStats as any)?.avg_yellow_cards ?? 2.0;
    const expectedCards = homeYellows + awayYellows;
    const over35Cards = Math.min(85, Math.max(40, (expectedCards / 3.5) * 55));
    const under35Cards = 100 - over35Cards;
    const over45Cards = Math.min(70, Math.max(25, (expectedCards / 4.5) * 50));
    const under45Cards = 100 - over45Cards;

    // Estimated shot markets
    const homeShots = (homeStats as any)?.avg_shots ?? 12.5;
    const awayShots = (awayStats as any)?.avg_shots ?? 10.8;
    const expectedShots = homeShots + awayShots;
    const over105Shots = Math.min(90, Math.max(45, (expectedShots / 10.5) * 60));
    const under105Shots = 100 - over105Shots;
    const over125Shots = Math.min(75, Math.max(30, (expectedShots / 12.5) * 55));
    const under125Shots = 100 - over125Shots;

    // Shots on target
    const homeSOT = (homeStats as any)?.avg_shots_on_target ?? 4.5;
    const awaySOT = (awayStats as any)?.avg_shots_on_target ?? 3.8;
    const expectedSOT = homeSOT + awaySOT;
    const over45SOT = Math.min(85, Math.max(40, (expectedSOT / 4.5) * 58));
    const under45SOT = 100 - over45SOT;
    const over55SOT = Math.min(65, Math.max(22, (expectedSOT / 5.5) * 50));
    const under55SOT = 100 - over55SOT;

    const allBets: Array<{ label: string; prob: number; market: string }> = [
      { label: `Victoria ${homeName}`, prob: finalHome, market: "1X2" },
      { label: `Victoria ${awayName}`, prob: finalAway, market: "1X2" },
      { label: "Empate", prob: finalDraw, market: "1X2" },
      { label: `Doble oportunidad ${homeName} o Empate`, prob: dc1X, market: "Doble oportunidad" },
      { label: `Doble oportunidad Empate o ${awayName}`, prob: dcX2, market: "Doble oportunidad" },
      { label: `Doble oportunidad ${homeName} o ${awayName}`, prob: dc12, market: "Doble oportunidad" },
      { label: "Más de 0.5 goles", prob: finalOver05, market: "Goles" },
      { label: "Menos de 0.5 goles", prob: finalUnder05, market: "Goles" },
      { label: "Más de 1.5 goles", prob: finalOver15, market: "Goles" },
      { label: "Menos de 1.5 goles", prob: finalUnder15, market: "Goles" },
      { label: "Más de 2.5 goles", prob: finalOver25, market: "Goles" },
      { label: "Menos de 2.5 goles", prob: finalUnder25, market: "Goles" },
      { label: "Más de 3.5 goles", prob: finalOver35, market: "Goles" },
      { label: "Más de 4.5 goles", prob: finalOver45, market: "Goles" },
      { label: "Menos de 4.5 goles", prob: finalUnder45, market: "Goles" },
      { label: "Ambos equipos marcan", prob: finalBtts, market: "Goles" },
      { label: "Ambos no marcan", prob: 100 - finalBtts, market: "Goles" },
      { label: "Más de 8.5 corners", prob: over85Corners, market: "Corners" },
      { label: "Menos de 8.5 corners", prob: under85Corners, market: "Corners" },
      { label: "Más de 9.5 corners", prob: over95Corners, market: "Corners" },
      { label: "Más de 3.5 tarjetas", prob: over35Cards, market: "Tarjetas" },
      { label: "Menos de 3.5 tarjetas", prob: under35Cards, market: "Tarjetas" },
      { label: "Más de 4.5 tarjetas", prob: over45Cards, market: "Tarjetas" },
      { label: "Menos de 4.5 tarjetas", prob: under45Cards, market: "Tarjetas" },
      { label: "Más de 10.5 disparos", prob: over105Shots, market: "Disparos" },
      { label: "Menos de 10.5 disparos", prob: under105Shots, market: "Disparos" },
      { label: "Más de 12.5 disparos", prob: over125Shots, market: "Disparos" },
      { label: "Menos de 12.5 disparos", prob: under125Shots, market: "Disparos" },
      { label: "Más de 4.5 disparos a puerta", prob: over45SOT, market: "Disparos a puerta" },
      { label: "Menos de 4.5 disparos a puerta", prob: under45SOT, market: "Disparos a puerta" },
      { label: "Más de 5.5 disparos a puerta", prob: over55SOT, market: "Disparos a puerta" },
      { label: "Menos de 5.5 disparos a puerta", prob: under55SOT, market: "Disparos a puerta" },
    ];
    // Add top exact score if prob > 5%
    if (bestScoreProb > 5) {
      allBets.push({ label: `Resultado exacto ${bestScore}`, prob: bestScoreProb, market: "Resultado" });
    }

    // Build additional_markets JSON for storage
    const additionalMarkets: Record<string, Record<string, number>> = {
      "Doble oportunidad": {
        [`1X - ${homeName} o Empate`]: dc1X,
        [`X2 - Empate o ${awayName}`]: dcX2,
        [`12 - ${homeName} o ${awayName}`]: dc12,
      },
      "Goles": {
        "Más de 0.5": finalOver05, "Menos de 0.5": finalUnder05,
        "Más de 1.5": finalOver15, "Menos de 1.5": finalUnder15,
        "Más de 2.5": finalOver25, "Menos de 2.5": finalUnder25,
        "Más de 3.5": finalOver35, "Más de 4.5": finalOver45, "Menos de 4.5": finalUnder45,
        "Ambos marcan": finalBtts, "Ambos no marcan": 100 - finalBtts,
      },
      "Corners": {
        "Más de 8.5": over85Corners, "Menos de 8.5": under85Corners,
        "Más de 9.5": over95Corners,
      },
      "Tarjetas": {
        "Más de 3.5": over35Cards, "Menos de 3.5": under35Cards,
        "Más de 4.5": over45Cards, "Menos de 4.5": under45Cards,
      },
      "Disparos": {
        "Más de 10.5": over105Shots, "Menos de 10.5": under105Shots,
        "Más de 12.5": over125Shots, "Menos de 12.5": under125Shots,
      },
      "Disparos a puerta": {
        "Más de 4.5": over45SOT, "Menos de 4.5": under45SOT,
        "Más de 5.5": over55SOT, "Menos de 5.5": under55SOT,
      },
    };

    // Official bet: highest-probability market that can be settled from the
    // final score (ESPN). Corners/cards/shots stay in additional markets only.
    const officialModel = allModels.reduce((best, model) => model.weight > best.weight ? model : best, allModels[0]);
    const scoreMarkets = new Set(["1X2", "Doble oportunidad", "Goles", "Resultado"]);
    const settleable = allBets.filter((bet) => scoreMarkets.has(bet.market) && bet.prob > 0);
    const candidates = settleable.length > 0 ? settleable : allBets.filter((bet) => scoreMarkets.has(bet.market));
    const bestBet = (candidates.length > 0 ? candidates : allBets).reduce(
      (best, bet) => bet.prob > best.prob ? bet : best,
      (candidates.length > 0 ? candidates : allBets)[0],
    );
    const bestBetLabel = bestBet.label;
    const bestBetProb = Number(bestBet.prob.toFixed(1));
    const bestBetMarket = bestBet.market;

    // Adjust analysis to lead with the best bet
    if (hasSignal) {
      analysisParts.unshift(`APUESTA OFICIAL: ${bestBetLabel} (${bestBetProb}% probabilidad). Modelo oficial: ${officialModel.name}.`);
    }

    // Save ensemble prediction
    const { error: predErr } = await supabase.from("predictions").upsert({
      match_id: m.id,
      home_probability: Number(finalHome.toFixed(2)),
      draw_probability: Number(finalDraw.toFixed(2)),
      away_probability: Number(finalAway.toFixed(2)),
      over15_probability: Number(finalOver15.toFixed(2)),
      over25_probability: Number(finalOver25.toFixed(2)),
      under25_probability: Number(finalUnder25.toFixed(2)),
      over35_probability: Number(finalOver35.toFixed(2)),
      btts_probability: Number(finalBtts.toFixed(2)),
      predicted_home_score: predHomeScore,
      predicted_away_score: predAwayScore,
      confidence,
      confidence_score: confidenceScore,
      has_signal: hasSignal,
      best_bet: bestBetLabel,
      best_bet_probability: bestBetProb,
      best_bet_market: bestBetMarket,
      analysis: analysisParts.join(" "),
      patterns: patterns.length > 0 ? JSON.stringify(patterns) : null,
      model_agreement: JSON.stringify({ agreement: `${agreementRatio}/${totalModels}`, pick: topPick?.[0], picks: modelPicks }),
      model_weights: JSON.stringify(weights),
      score_probabilities: JSON.stringify(scoreProbs),
      additional_markets: additionalMarkets,
      elo_home: Number(homeElo.toFixed(2)),
      elo_away: Number(awayElo.toFixed(2)),
      model_version: `official_${officialModel.name}`,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "match_id" });

    if (predErr) {
      console.error(`Prediction upsert failed for match ${m.id}: ${predErr.message}`);
    } else {
      // Save individual model predictions
      for (const mdl of allModels) {
        await supabase.from("model_predictions").upsert({
          match_id: m.id,
          model_name: mdl.name,
          home_probability: Number(mdl.result.home.toFixed(2)),
          draw_probability: Number(mdl.result.draw.toFixed(2)),
          away_probability: Number(mdl.result.away.toFixed(2)),
          weight: mdl.weight,
        }, { onConflict: "match_id,model_name" });
      }
      count++;
    }
  }

  if (count > 0) {
    await supabase.from("notifications").insert({
      type: "prediction_ready",
      title: "Pronósticos listos",
      message: `Se han generado ${count} pronósticos para ${date}.`,
      is_read: false,
    });
  }

  return count;
}

// ============================================================
// Sync live matches
// ============================================================

// ============================================================
// Sync live matches from ESPN
// Calls per-league scoreboard for today and updates live/finished matches
// ============================================================

async function syncLiveMatches(): Promise<number> {
  const today = getBogotaDate();
  const espnDate = today.replace(/-/g, "");

  const { data: activeLeagues } = await supabase.from("leagues").select("espn_slug").eq("is_active", true);

  let updated = 0;

  for (const league of activeLeagues ?? []) {
    if (!league.espn_slug) continue;

    let events: any[] = [];
    try {
      const data = await espnFetch(`${ESPN_BASE}/${league.espn_slug}/scoreboard?dates=${espnDate}`);
      events = data?.events ?? [];
    } catch (e) {
      console.error(`ESPN live sync for ${league.espn_slug}: ${(e as Error).message}`);
      continue;
    }

    for (const ev of events) {
      const competition = ev.competitions?.[0] ?? ev;
      const statusType = competition.status?.type ?? {};
      const state = (statusType.state ?? "").toLowerCase();
      if (state !== "in" && state !== "post") continue;

      const { data: existing } = await supabase.from("matches").select("id").eq("api_id", Number(ev.id)).maybeSingle();
      if (!existing) continue;

      const statusInfo = mapEspnStatus(statusType);
      const competitors = competition.competitors ?? [];
      const homeComp = competitors.find((c: any) => c.homeAway === "home");
      const awayComp = competitors.find((c: any) => c.homeAway === "away");

      await supabase.from("matches").update({
        status: statusInfo.status,
        home_score: homeComp?.score != null ? Number(homeComp.score) : null,
        away_score: awayComp?.score != null ? Number(awayComp.score) : null,
        minute: statusInfo.minute,
        updated_at: new Date().toISOString(),
      }).eq("api_id", Number(ev.id));

      updated++;

      if (statusInfo.status === "finished") {
        const { data: notifCheck } = await supabase.from("notifications").select("id").eq("match_id", existing.id).eq("type", "match_end").maybeSingle();
        if (!notifCheck) {
          await supabase.from("notifications").insert({
            type: "match_end",
            title: "Partido finalizado",
            message: `${homeComp?.team?.displayName ?? "Local"} ${homeComp?.score ?? 0} - ${awayComp?.score ?? 0} ${awayComp?.team?.displayName ?? "Visitante"}`,
            match_id: existing.id,
            is_read: false,
          });
        }
      }
    }
  }

  return updated;
}

// ============================================================
// Evaluate the single primary bet selected for each prediction
// ============================================================

function normalizeBetText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function evaluatePrimaryBet(
  label: string | null,
  homeScore: number,
  awayScore: number,
  homeName: string,
  awayName: string,
): { verifiable: boolean; correct: boolean; actual: string } {
  const totalGoals = homeScore + awayScore;
  const actualResult = homeScore > awayScore ? `Victoria ${homeName}` : awayScore > homeScore ? `Victoria ${awayName}` : "Empate";
  if (!label) return { verifiable: false, correct: false, actual: actualResult };

  const n = normalizeBetText(label);
  if (n.includes("corner") || n.includes("tarjeta") || n.includes("disparo")) {
    return { verifiable: false, correct: false, actual: "No verificable con el marcador" };
  }

  const home = normalizeBetText(homeName);
  const away = normalizeBetText(awayName);

  if (n === "empate") return { verifiable: true, correct: homeScore === awayScore, actual: actualResult };
  if (n === `victoria ${home}` || n === "victoria local") return { verifiable: true, correct: homeScore > awayScore, actual: actualResult };
  if (n === `victoria ${away}` || n === "victoria visitante") return { verifiable: true, correct: awayScore > homeScore, actual: actualResult };

  const isDoubleChance = n.includes("doble oportunidad") || n.startsWith("1x") || n.startsWith("x2") || n.startsWith("12");
  if (isDoubleChance) {
    if (n.includes("12") || (n.includes(home) && n.includes(away))) {
      return { verifiable: true, correct: homeScore !== awayScore, actual: actualResult };
    }
    if (n.startsWith("1x") || (n.includes(home) && n.includes("empate"))) {
      return { verifiable: true, correct: homeScore >= awayScore, actual: actualResult };
    }
    if (n.startsWith("x2") || (n.includes(away) && n.includes("empate"))) {
      return { verifiable: true, correct: awayScore >= homeScore, actual: actualResult };
    }
  }

  if (n.includes("ambos") && (n.includes("marcan") || n.includes("marca"))) {
    const bothScore = homeScore > 0 && awayScore > 0;
    const wantsBoth = !n.includes("no marcan") && !n.includes("no marca");
    return { verifiable: true, correct: wantsBoth ? bothScore : !bothScore, actual: `${homeScore}-${awayScore}` };
  }

  const exactScore = n.match(/resultado exacto (\d+)\s*-\s*(\d+)/);
  if (exactScore) {
    return {
      verifiable: true,
      correct: homeScore === Number(exactScore[1]) && awayScore === Number(exactScore[2]),
      actual: `${homeScore}-${awayScore}`,
    };
  }

  const over = n.match(/mas de (\d+(?:\.\d+)?)/);
  const under = n.match(/menos de (\d+(?:\.\d+)?)/);
  if (over) return { verifiable: true, correct: totalGoals > Number(over[1]), actual: `${totalGoals} goles` };
  if (under) return { verifiable: true, correct: totalGoals < Number(under[1]), actual: `${totalGoals} goles` };

  return { verifiable: false, correct: false, actual: actualResult };
}

async function evaluatePredictionResults(): Promise<number> {
  const { data: pending } = await supabase
    .from("predictions")
    .select("id, match_id, best_bet, home_probability, draw_probability, away_probability, matches!inner(status, home_score, away_score, match_date, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name))")
    .eq("prediction_result", "pending")
    .eq("matches.status", "finished")
    .not("matches.home_score", "is", null)
    .not("matches.away_score", "is", null)
    .limit(500);

  let evaluated = 0;
  for (const prediction of pending ?? []) {
    const match = (prediction as any).matches;
    const homeScore = Number(match.home_score);
    const awayScore = Number(match.away_score);
    const homeName = match.home_team?.name ?? "Local";
    const awayName = match.away_team?.name ?? "Visitante";
    const evaluation = evaluatePrimaryBet(prediction.best_bet, homeScore, awayScore, homeName, awayName);
    if (!evaluation.verifiable) continue;
    const actual = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";

    await supabase.from("predictions").update({
      prediction_result: evaluation.correct ? "correct" : "incorrect",
      actual_outcome: evaluation.actual,
      updated_at: new Date().toISOString(),
    }).eq("id", prediction.id);

    const { data: modelRows } = await supabase
      .from("model_predictions")
      .select("model_name, home_probability, draw_probability, away_probability, weight")
      .eq("match_id", prediction.match_id);
    const season = getSeasonYear(match.match_date);

    for (const model of modelRows ?? []) {
      const modelPredicted = Number(model.home_probability) >= Number(model.draw_probability) && Number(model.home_probability) >= Number(model.away_probability)
        ? "home"
        : Number(model.away_probability) >= Number(model.draw_probability) ? "away" : "draw";
      const { data: performance } = await supabase.from("model_performance")
        .select("id, total_predictions, correct_predictions")
        .eq("model_name", model.model_name).eq("season", season).maybeSingle();
      const total = Number(performance?.total_predictions ?? 0) + 1;
      const correct = Number(performance?.correct_predictions ?? 0) + (modelPredicted === actual ? 1 : 0);
      const accuracy = (correct / total) * 100;
      // Auto-adjust weight: combine raw accuracy with a recency bonus and normalize later.
      // Weight = accuracy^2 * (1 + log(1 + total/10)) — rewards both precision and sample size.
      const sampleFactor = 1 + Math.log10(1 + total / 10);
      const rawWeight = Math.pow(accuracy / 100, 2) * sampleFactor;
      await supabase.from("model_performance").upsert({
        model_name: model.model_name,
        season,
        total_predictions: total,
        correct_predictions: correct,
        accuracy: Number(accuracy.toFixed(2)),
        weight: Number(rawWeight.toFixed(4)),
        updated_at: new Date().toISOString(),
      }, { onConflict: "model_name,season" });
    }
    evaluated++;
  }

  // Normalize weights across all models for this season so they sum to ~1.0
  if (evaluated > 0) {
    const { data: allPerf } = await supabase.from("model_performance")
      .select("model_name, season, weight, total_predictions")
      .eq("season", getSeasonYear("2026-01-01"));
    const bySeason: Record<number, Array<{ model_name: string; weight: number; total_predictions: number }>> = {};
    for (const row of allPerf ?? []) {
      const s = row.season;
      if (!bySeason[s]) bySeason[s] = [];
      bySeason[s].push(row);
    }
    for (const [seasonStr, rows] of Object.entries(bySeason)) {
      const seasonNum = Number(seasonStr);
      const activeRows = rows.filter((r) => r.total_predictions > 0);
      if (activeRows.length === 0) continue;
      const totalWeight = activeRows.reduce((sum, r) => sum + r.weight, 0);
      if (totalWeight <= 0) continue;
      for (const row of activeRows) {
        const normalized = row.weight / totalWeight;
        await supabase.from("model_performance").update({
          weight: Number(normalized.toFixed(4)),
          updated_at: new Date().toISOString(),
        }).eq("model_name", row.model_name).eq("season", seasonNum);
      }
    }
  }

  try {
    await evaluateLadderEntries();
  } catch (e) {
    console.error(`ladder evaluate: ${(e as Error).message}`);
  }
  return evaluated;
}

async function evaluateLadderEntries(): Promise<number> {
  const { data: pending } = await supabase
    .from("ladder_entries")
    .select(`
      id, match_id, selection, notes, odds, stake,
      match:matches(
        status, home_score, away_score,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      )
    `)
    .eq("status", "pending")
    .limit(200);

  let resolved = 0;
  for (const entry of pending ?? []) {
    const match = (entry as any).match;
    if (!match || match.status !== "finished" || match.home_score == null || match.away_score == null) continue;
    const homeName = match.home_team?.name ?? "Local";
    const awayName = match.away_team?.name ?? "Visitante";
    const evaluation = evaluatePrimaryBet(entry.selection, Number(match.home_score), Number(match.away_score), homeName, awayName);
    if (!evaluation.verifiable) continue;

    const stake = Number(entry.stake);
    const odds = Number(entry.odds);
    const won = evaluation.correct;
    await supabase.from("ladder_entries").update({
      status: won ? "won" : "lost",
      return_amount: won ? stake * odds : 0,
      profit: won ? stake * odds - stake : -stake,
      balance_after: won ? stake * odds : 0,
      updated_at: new Date().toISOString(),
    }).eq("id", entry.id);
    resolved++;
  }
  return resolved;
}

// ============================================================
// Full sync
// ============================================================

async function fullSync(date: string): Promise<{ matches_fetched: number; predictions_generated: number }> {
  const { fetched } = await fetchMatchesForDate(date);

  const { data: activeLeagues } = await supabase.from("leagues").select("api_id, espn_slug, season").eq("is_active", true);
  for (const l of activeLeagues ?? []) {
    const slug = l.espn_slug ?? String(l.api_id);
    if (slug) {
      try { await syncStandings(slug, l.season ?? getSeasonYear(date)); } catch (e) { console.error(`Standings: ${(e as Error).message}`); }
    }
  }

  const predictions = await generatePredictions(date);
  const evaluated = await evaluatePredictionResults();
  return { matches_fetched: fetched, predictions_generated: predictions, evaluated };
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "full_sync";
    const date = body.date ?? getBogotaDate();

    const { data: logRow } = await supabase.from("admin_logs").insert({
      action, status: "running", started_at: new Date().toISOString(),
    }).select("id").single();

    let result: any;
    try {
      switch (action) {
        case "fetch_matches":
          result = await fetchMatchesForDate(date);
          break;
        case "generate_predictions":
          result = { predictions_generated: await generatePredictions(date) };
          break;
        case "sync_live":
          result = { updated: await syncLiveMatches() };
          break;
        case "evaluate_results":
          result = { evaluated: await evaluatePredictionResults() };
          break;
        case "sync_standings": {
          const seasonYear = body.season ?? getSeasonYear(date);
          result = { updated: await syncStandings(String(body.league_api_id ?? body.espn_slug), seasonYear) };
          break;
        }
        case "debug_espn": {
          const slug = body.espn_slug ?? "eng.1";
          const d = body.date ?? "20260920";
          try {
            const raw = await espnFetch(`${ESPN_BASE}/${slug}/scoreboard?dates=${d}`);
            result = { events_count: raw?.events?.length ?? 0, keys: Object.keys(raw ?? {}), first_event: raw?.events?.[0]?.name ?? null, raw_size: JSON.stringify(raw).length };
          } catch (e) {
            result = { error: (e as Error).message };
          }
          break;
        }
        case "ingest_matches": {
          const matches: any[] = body.matches ?? [];
          let ingested = 0;
          for (const m of matches) {
            try {
              const homeId = await upsertTeam({
                id: m.home_team.id, name: m.home_team.name,
                logo: m.home_team.logo, code: m.home_team.code,
              }, m.league_id);
              const awayId = await upsertTeam({
                id: m.away_team.id, name: m.away_team.name,
                logo: m.away_team.logo, code: m.away_team.code,
              }, m.league_id);
              await supabase.from("matches").upsert({
                api_id: m.event_id, league_id: m.league_id,
                home_team_id: homeId, away_team_id: awayId,
                match_date: m.match_date, status: m.status,
                home_score: m.home_team.score, away_score: m.away_team.score,
                minute: m.minute, venue: m.venue, referee: null,
                round: m.round, updated_at: new Date().toISOString(),
              }, { onConflict: "api_id" });
              ingested++;
            } catch (e) {
              console.error(`Ingest match ${m.event_id}: ${(e as Error).message}`);
            }
          }
          result = { matches_fetched: ingested };
          break;
        }
        case "ingest_standings": {
          const standings: any[] = body.standings ?? [];
          const leagueId = body.league_id;
          const seasonYear = body.season ?? getSeasonYear(date);
          let ingested = 0;
          for (const s of standings) {
            try {
              const teamId = await upsertTeam({
                id: s.team.id, name: s.team.name,
                logo: s.team.logo, code: s.team.code,
              }, leagueId);
              await supabase.from("standings").upsert({
                league_id: leagueId, team_id: teamId, season: seasonYear,
                position: s.position, played: s.played,
                wins: s.wins, draws: s.draws, losses: s.losses,
                goals_for: s.goals_for, goals_against: s.goals_against,
                goal_diff: s.goal_diff, points: s.points,
                form: null, updated_at: new Date().toISOString(),
              }, { onConflict: "league_id,team_id,season" });
              ingested++;
            } catch (e) {
              console.error(`Ingest standing: ${(e as Error).message}`);
            }
          }
          result = { updated: ingested };
          break;
        }
        case "ingest_live": {
          const updates: any[] = body.updates ?? [];
          let updated = 0;
          const seenEventIds = new Set(updates.map((u) => u.event_id));
          for (const u of updates) {
            const { data: existing } = await supabase.from("matches").select("id").eq("api_id", u.event_id).maybeSingle();
            if (!existing) continue;
            await supabase.from("matches").update({
              status: u.status, home_score: u.home_score, away_score: u.away_score,
              minute: u.minute, updated_at: new Date().toISOString(),
            }).eq("api_id", u.event_id);
            updated++;
            if (u.status === "finished") {
              const { data: notifCheck } = await supabase.from("notifications").select("id").eq("match_id", existing.id).eq("type", "match_end").maybeSingle();
              if (!notifCheck) {
                await supabase.from("notifications").insert({
                  type: "match_end", title: "Partido finalizado",
                  message: `${u.home_name} ${u.home_score ?? 0} - ${u.away_score ?? 0} ${u.away_name}`,
                  match_id: existing.id, is_read: false,
                });
              }
            }
          }
          // Clean up stale live matches: any match still marked live/halftime
          // that wasn't in today's ESPN update should be set to finished
          const { data: staleLive } = await supabase
            .from("matches")
            .select("id, api_id")
            .in("status", ["live", "halftime"]);
          if (staleLive && staleLive.length > 0) {
            for (const m of staleLive) {
              if (!seenEventIds.has(m.api_id)) {
                await supabase.from("matches").update({
                  status: "finished", minute: null, updated_at: new Date().toISOString(),
                }).eq("id", m.id);
                updated++;
              }
            }
          }
          const evaluated = await evaluatePredictionResults();
          result = { updated, evaluated };
          break;
        }
        case "ingest_team_stats": {
          const stats: any = body.stats;
          const teamApiId = body.team_api_id;
          const leagueApiId = body.league_api_id;
          const seasonYear = body.season ?? getSeasonYear(date);
          if (!stats) { result = { updated: 0 }; break; }
          const { data: leagueRow } = await supabase.from("leagues").select("id").eq("api_id", leagueApiId).maybeSingle();
          const { data: teamRow } = await supabase.from("teams").select("id").eq("api_id", teamApiId).maybeSingle();
          if (!leagueRow || !teamRow) { result = { updated: 0 }; break; }
          await supabase.from("team_statistics").upsert({
            team_id: teamRow.id, league_id: leagueRow.id, season: seasonYear,
            form: stats.form, played: stats.played, wins: stats.wins,
            draws: stats.draws, losses: stats.losses,
            goals_scored: stats.goals_scored, goals_conceded: stats.goals_conceded,
            clean_sheets: stats.clean_sheets,
            home_played: stats.home_played, home_wins: stats.home_wins,
            home_draws: stats.home_draws, home_losses: stats.home_losses,
            home_goals_scored: stats.home_goals_scored, home_goals_conceded: stats.home_goals_conceded,
            away_played: stats.away_played, away_wins: stats.away_wins,
            away_draws: stats.away_draws, away_losses: stats.away_losses,
            away_goals_scored: stats.away_goals_scored, away_goals_conceded: stats.away_goals_conceded,
            avg_goals_scored: stats.avg_goals_scored, avg_goals_conceded: stats.avg_goals_conceded,
            updated_at: new Date().toISOString(),
          }, { onConflict: "team_id,league_id,season" });
          result = { updated: 1 };
          break;
        }
        case "full_sync_frontend": {
          // Ingest matches from frontend, then generate predictions
          const matches: any[] = body.matches ?? [];
          const allStandings: any[] = body.standings ?? [];
          let ingested = 0;
          for (const m of matches) {
            try {
              const homeId = await upsertTeam({
                id: m.home_team.id, name: m.home_team.name,
                logo: m.home_team.logo, code: m.home_team.code,
              }, m.league_id);
              const awayId = await upsertTeam({
                id: m.away_team.id, name: m.away_team.name,
                logo: m.away_team.logo, code: m.away_team.code,
              }, m.league_id);
              await supabase.from("matches").upsert({
                api_id: m.event_id, league_id: m.league_id,
                home_team_id: homeId, away_team_id: awayId,
                match_date: m.match_date, status: m.status,
                home_score: m.home_team.score, away_score: m.away_team.score,
                minute: m.minute, venue: m.venue, referee: null,
                round: m.round, updated_at: new Date().toISOString(),
              }, { onConflict: "api_id" });
              ingested++;
            } catch (e) {
              console.error(`Ingest match ${m.event_id}: ${(e as Error).message}`);
            }
          }
          for (const s of allStandings) {
            try {
              const teamId = await upsertTeam({
                id: s.team.id, name: s.team.name,
                logo: s.team.logo, code: s.team.code,
              }, s.league_id);
              await supabase.from("standings").upsert({
                league_id: s.league_id, team_id: teamId, season: s.season,
                position: s.position, played: s.played,
                wins: s.wins, draws: s.draws, losses: s.losses,
                goals_for: s.goals_for, goals_against: s.goals_against,
                goal_diff: s.goal_diff, points: s.points,
                form: null, updated_at: new Date().toISOString(),
              }, { onConflict: "league_id,team_id,season" });
            } catch (e) {
              console.error(`Ingest standing: ${(e as Error).message}`);
            }
          }
          const predictions = await generatePredictions(date);
          const evaluated = await evaluatePredictionResults();
          result = { matches_fetched: ingested, predictions_generated: predictions, evaluated };
          break;
        }
        case "full_sync":
        default:
          result = await fullSync(date);
          break;
      }

      await supabase.from("admin_logs").update({
        status: "success",
        matches_fetched: result.matches_fetched ?? 0,
        predictions_generated: result.predictions_generated ?? 0,
        completed_at: new Date().toISOString(),
      }).eq("id", logRow?.id);
    } catch (e) {
      const errorMsg = (e as Error).message;
      await supabase.from("admin_logs").update({
        status: "error", error_message: errorMsg, completed_at: new Date().toISOString(),
      }).eq("id", logRow?.id);
      throw e;
    }

    return new Response(JSON.stringify({ ...result, log_id: logRow?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
