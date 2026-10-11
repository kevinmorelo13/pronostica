// ============================================================
// ESPN Data Sync Service (runs in browser)
// Fetches match data from ESPN's public API (not blocked from browser)
// and sends it to the edge function for DB storage + predictions
// ============================================================

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_BASE_V2 = "https://site.api.espn.com/apis/v2/sports/soccer";

export interface SyncResult {
  matches_fetched: number;
  predictions_generated: number;
  log_id?: string;
  error?: string;
}

async function espnFetch(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ESPN ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Map ESPN status to our internal status
function mapEspnStatus(statusType: any): { status: string; minute: number | null } {
  const state = (statusType?.state ?? "").toLowerCase();
  const desc = (statusType?.description ?? "").toUpperCase();
  if (state === "post" || desc.includes("FULL TIME") || desc.includes("ENDED"))
    return { status: "finished", minute: null };
  if (state === "in" || desc.includes("IN PROGRESS")) {
    const clock = statusType?.clock ?? 0;
    const minute = Math.floor(clock / 60);
    if (desc.includes("HALF") || (minute >= 45 && minute <= 50))
      return { status: "halftime", minute: 45 };
    return { status: "live", minute: minute > 0 ? minute : null };
  }
  if (desc.includes("POSTPONED")) return { status: "postponed", minute: null };
  if (desc.includes("CANCEL") || desc.includes("ABANDONED"))
    return { status: "cancelled", minute: null };
  return { status: "scheduled", minute: null };
}

export interface EspnLeagueInfo {
  id: string;
  espn_slug: string;
  name: string;
  season: number;
}

export async function fetchEspnMatches(
  leagues: EspnLeagueInfo[],
  date: string
): Promise<any[]> {
  const espnDate = (date.includes("T") ? date.slice(0, 10) : date).replace(/-/g, "");
  const allEvents: any[] = [];

  for (const league of leagues) {
    if (!league.espn_slug) continue;
    try {
      const data = await espnFetch(
        `${ESPN_BASE}/${league.espn_slug}/scoreboard?dates=${espnDate}`
      );
      const events = data?.events ?? [];
      for (const ev of events) {
        const competition = ev.competitions?.[0] ?? ev;
        const competitors = competition.competitors ?? [];
        const homeComp = competitors.find((c: any) => c.homeAway === "home");
        const awayComp = competitors.find((c: any) => c.homeAway === "away");
        if (!homeComp?.team || !awayComp?.team) continue;

        const statusType = competition.status?.type ?? {};
        const statusInfo = mapEspnStatus(statusType);

        allEvents.push({
          league_id: league.id,
          event_id: Number(ev.id),
          match_date: ev.date ?? competition.date,
          status: statusInfo.status,
          minute: statusInfo.minute,
          venue: competition.venue?.fullName ?? null,
          round: statusType.shortDetail ?? null,
          home_team: {
            id: Number(homeComp.team.id),
            name: homeComp.team.displayName ?? homeComp.team.name,
            logo: homeComp.team.logos?.[0]?.href ?? null,
            code: homeComp.team.abbreviation,
            score: homeComp.score != null ? Number(homeComp.score) : null,
          },
          away_team: {
            id: Number(awayComp.team.id),
            name: awayComp.team.displayName ?? awayComp.team.name,
            logo: awayComp.team.logos?.[0]?.href ?? null,
            code: awayComp.team.abbreviation,
            score: awayComp.score != null ? Number(awayComp.score) : null,
          },
        });
      }
    } catch (e) {
      console.error(`ESPN scoreboard for ${league.espn_slug}: ${(e as Error).message}`);
    }
  }

  return allEvents;
}

export async function fetchEspnStandings(
  espnSlug: string,
  season: number
): Promise<any[]> {
  try {
    const data = await espnFetch(
      `${ESPN_BASE_V2}/${espnSlug}/standings?season=${season}`
    );
    const entries = data?.children?.[0]?.standings?.entries ?? [];
    return entries.map((entry: any, idx: number) => {
      const team = entry.team;
      const stats: Record<string, number> = {};
      for (const s of entry.stats ?? []) {
        if (s.value != null) stats[s.name] = Number(s.value);
      }
      return {
        team: {
          id: Number(team.id),
          name: team.displayName ?? team.name,
          logo: team.logos?.[0]?.href ?? null,
          code: team.abbreviation,
        },
        position: idx + 1,
        played: stats.gamesPlayed ?? 0,
        wins: stats.wins ?? 0,
        draws: stats.ties ?? 0,
        losses: stats.losses ?? 0,
        goals_for: stats.pointsFor ?? 0,
        goals_against: stats.pointsAgainst ?? 0,
        goal_diff: stats.pointDifferential ?? 0,
        points: stats.points ?? 0,
      };
    });
  } catch (e) {
    console.error(`ESPN standings for ${espnSlug}: ${(e as Error).message}`);
    return [];
  }
}

export async function fetchEspnTeamStats(
  espnSlug: string,
  teamApiId: number,
  season: number
): Promise<any | null> {
  try {
    const data = await espnFetch(
      `${ESPN_BASE}/${espnSlug}/teams/${teamApiId}/schedule?season=${season}`
    );
    const events = data?.events ?? [];
    if (events.length === 0) return null;

    let played = 0, wins = 0, draws = 0, losses = 0;
    let goalsFor = 0, goalsAgainst = 0;
    let homePlayed = 0, homeWins = 0, homeDraws = 0, homeLosses = 0;
    let homeGoalsScored = 0, homeGoalsConceded = 0;
    let awayPlayed = 0, awayWins = 0, awayDraws = 0, awayLosses = 0;
    let awayGoalsScored = 0, awayGoalsConceded = 0;
    let cleanSheets = 0;
    const formChars: string[] = [];

    const sortedEvents = [...events].sort(
      (a: any, b: any) =>
        new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
    );

    for (const ev of sortedEvents) {
      const competition = ev.competitions?.[0] ?? ev;
      const statusState = (competition.status?.type?.state ?? "").toLowerCase();
      if (statusState !== "post") continue;

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

    if (played === 0) return null;

    return {
      form: formChars.join(""),
      played, wins, draws, losses,
      goals_scored: goalsFor, goals_conceded: goalsAgainst, clean_sheets: cleanSheets,
      home_played: homePlayed, home_wins: homeWins, home_draws: homeDraws, home_losses: homeLosses,
      home_goals_scored: homeGoalsScored, home_goals_conceded: homeGoalsConceded,
      away_played: awayPlayed, away_wins: awayWins, away_draws: awayDraws, away_losses: awayLosses,
      away_goals_scored: awayGoalsScored, away_goals_conceded: awayGoalsConceded,
      avg_goals_scored: Number((goalsFor / played).toFixed(2)),
      avg_goals_conceded: Number((goalsAgainst / played).toFixed(2)),
    };
  } catch (e) {
    console.error(`ESPN team stats for ${teamApiId}: ${(e as Error).message}`);
    return null;
  }
}

export async function fetchEspnLiveUpdates(
  leagues: EspnLeagueInfo[]
): Promise<any[]> {
  const today = new Date();
  const bogota = new Date(today.getTime() - 5 * 60 * 60 * 1000);
  const espnDate = bogota.toISOString().slice(0, 10).replace(/-/g, "");
  // Also check yesterday in case of late matches still in progress
  const yesterday = new Date(bogota.getTime() - 24 * 60 * 60 * 1000);
  const espnDateYesterday = yesterday.toISOString().slice(0, 10).replace(/-/g, "");
  const updates: any[] = [];

  for (const league of leagues) {
    if (!league.espn_slug) continue;
    for (const dateStr of [espnDateYesterday, espnDate]) {
      try {
        const data = await espnFetch(
          `${ESPN_BASE}/${league.espn_slug}/scoreboard?dates=${dateStr}`
        );
        const events = data?.events ?? [];
        for (const ev of events) {
          const competition = ev.competitions?.[0] ?? ev;
          const statusType = competition.status?.type ?? {};
          const state = (statusType.state ?? "").toLowerCase();
          if (state !== "in" && state !== "post") continue;

          const statusInfo = mapEspnStatus(statusType);
          const competitors = competition.competitors ?? [];
          const homeComp = competitors.find((c: any) => c.homeAway === "home");
          const awayComp = competitors.find((c: any) => c.homeAway === "away");

          updates.push({
            event_id: Number(ev.id),
            status: statusInfo.status,
            minute: statusInfo.minute,
            home_score: homeComp?.score != null ? Number(homeComp.score) : null,
            away_score: awayComp?.score != null ? Number(awayComp.score) : null,
            home_name: homeComp?.team?.displayName ?? "Local",
            away_name: awayComp?.team?.displayName ?? "Visitante",
          });
        }
      } catch (e) {
        console.error(`ESPN live for ${league.espn_slug} ${dateStr}: ${(e as Error).message}`);
      }
    }
  }

  return updates;
}
