// ============================================================
// Sync Manager - coordinates ESPN data fetching (browser) 
// with edge function (DB storage + predictions)
// ============================================================

import { supabase } from "./supabase";
import {
  fetchEspnMatches,
  fetchEspnStandings,
  fetchEspnLiveUpdates,
  type EspnLeagueInfo,
} from "./espnSync";

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sports-sync`;

async function callEdgeFunction(body: any): Promise<any> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge function ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

// Auto-sync: fetch ESPN data for today + next 7 days and ingest
export async function autoSyncIfNeeded(force = false): Promise<void> {
  // Check last successful sync
  const { data: lastSync } = await supabase
    .from('admin_logs')
    .select('completed_at')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSync?.completed_at) {
    const age = Date.now() - new Date(lastSync.completed_at).getTime();
    if (!force && age < 5 * 60 * 1000) return; // fresh enough
  }

  const leagues = await getActiveLeagues();
  if (leagues.length === 0) return;

  // Fetch matches for today + next 7 days
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }));
  }

  let totalMatches = 0;
  const allStandings: any[] = [];

  for (const date of dates) {
    try {
      const matches = await fetchEspnMatches(leagues, date);
      if (matches.length > 0) {
        await callEdgeFunction({ action: 'ingest_matches', date, matches });
        totalMatches += matches.length;
      }
    } catch (e) {
      console.error(`Auto-sync matches for ${date}:`, (e as Error).message);
    }
  }

  // Fetch standings for each league
  for (const league of leagues) {
    try {
      const season = league.season ?? new Date().getFullYear();
      const standings = await fetchEspnStandings(league.espn_slug, season);
      for (const s of standings) {
        allStandings.push({ ...s, league_id: league.id, season });
      }
    } catch (e) {
      console.error(`Auto-sync standings for ${league.espn_slug}:`, (e as Error).message);
    }
  }

  if (allStandings.length > 0) {
    // Send standings in batches per league
    const byLeague: Record<string, any[]> = {};
    for (const s of allStandings) {
      const key = `${s.league_id}-${s.season}`;
      if (!byLeague[key]) byLeague[key] = [];
      byLeague[key].push(s);
    }
    for (const [key, entries] of Object.entries(byLeague)) {
      const [leagueId, season] = key.split('-');
      try {
        await callEdgeFunction({
          action: 'ingest_standings',
          league_id: leagueId,
          season: parseInt(season),
          standings: entries,
        });
      } catch (e) {
        console.error('Auto-sync standings ingest:', (e as Error).message);
      }
    }
  }

  // Refresh live scores and evaluate finished predictions on every cycle
  try {
    await syncLive();
    await evaluateResults();
  } catch (e) {
    console.error('Auto-sync live/results:', (e as Error).message);
  }

  // Generate predictions for dates with scheduled matches
  for (const date of dates) {
    try {
      await callEdgeFunction({ action: 'generate_predictions', date });
    } catch (e) {
      console.error(`Auto-sync predictions for ${date}:`, (e as Error).message);
    }
  }

  console.log(`Auto-sync complete: ${totalMatches} matches, ${allStandings.length} standings`);
}

export async function getActiveLeagues(): Promise<EspnLeagueInfo[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, espn_slug, name, season")
    .eq("is_active", true);

  if (error) throw new Error(`getActiveLeagues: ${error.message}`);
  return (data ?? []).filter((l) => l.espn_slug);
}

// Full sync: fetch matches + standings from ESPN (browser),
// send to edge function for DB storage + prediction generation
export async function fullSync(date: string): Promise<{
  matches_fetched: number;
  predictions_generated: number;
}> {
  const leagues = await getActiveLeagues();

  // 1. Fetch matches from ESPN (browser, not blocked)
  const matches = await fetchEspnMatches(leagues, date);

  // 2. Fetch standings for each league
  const allStandings: any[] = [];
  for (const league of leagues) {
    const standings = await fetchEspnStandings(
      league.espn_slug,
      league.season ?? parseInt(date.slice(0, 4))
    );
    for (const s of standings) {
      allStandings.push({ ...s, league_id: league.id, season: league.season ?? parseInt(date.slice(0, 4)) });
    }
  }

  // 3. Send to edge function for DB storage + predictions
  const result = await callEdgeFunction({
    action: "full_sync_frontend",
    date,
    matches,
    standings: allStandings,
  });

  try {
    await evaluateResults();
  } catch (e) {
    console.error('Evaluate after full sync:', (e as Error).message);
  }

  return {
    matches_fetched: result.matches_fetched ?? 0,
    predictions_generated: result.predictions_generated ?? 0,
  };
}

// Fetch matches only (no predictions)
export async function syncMatches(date: string): Promise<number> {
  const leagues = await getActiveLeagues();
  const matches = await fetchEspnMatches(leagues, date);

  const result = await callEdgeFunction({
    action: "ingest_matches",
    date,
    matches,
  });

  return result.matches_fetched ?? 0;
}

// Sync live updates
export async function syncLive(): Promise<number> {
  const leagues = await getActiveLeagues();
  const updates = await fetchEspnLiveUpdates(leagues);

  const result = await callEdgeFunction({
    action: "ingest_live",
    updates,
  });

  return result.updated ?? 0;
}

// Generate predictions only (no data fetch)
export async function evaluateResults(): Promise<number> {
  const result = await callEdgeFunction({ action: 'evaluate_results' });
  return result.evaluated ?? 0;
}

export async function generatePredictions(date: string): Promise<number> {
  const result = await callEdgeFunction({
    action: "generate_predictions",
    date,
  });

  return result.predictions_generated ?? 0;
}

// Sync standings only
export async function syncStandings(): Promise<number> {
  const leagues = await getActiveLeagues();
  let total = 0;

  for (const league of leagues) {
    const standings = await fetchEspnStandings(
      league.espn_slug,
      league.season ?? new Date().getFullYear()
    );

    const result = await callEdgeFunction({
      action: "ingest_standings",
      league_id: league.id,
      season: league.season ?? new Date().getFullYear(),
      standings,
    });

    total += result.updated ?? 0;
  }

  return total;
}
