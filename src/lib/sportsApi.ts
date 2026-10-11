/**
 * SportsAPIService — abstraction layer over the sports data API.
 * All calls go through Supabase Edge Functions to keep the API key server-side.
 */

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callFunction<T>(slug: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const url = `${FUNCTIONS_URL}/${slug}${query ? `?${query}` : ''}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as T;
}

async function callFunctionPost<T>(slug: string, body: Record<string, unknown> = {}): Promise<T> {
  const url = `${FUNCTIONS_URL}/${slug}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as T;
}

export const SportsAPIService = {
  fetchMatchesForDate: (date: string) =>
    callFunctionPost<{ matches_fetched: number; predictions_generated: number }>('sports-sync', {
      action: 'fetch_matches',
      date,
    }),

  generatePredictions: (date?: string) =>
    callFunctionPost<{ predictions_generated: number }>('sports-sync', {
      action: 'generate_predictions',
      date,
    }),

  syncLiveMatches: () =>
    callFunctionPost<{ updated: number }>('sports-sync', { action: 'sync_live' }),

  syncStandings: (leagueApiId: number, season: number) =>
    callFunctionPost<{ updated: number }>('sports-sync', {
      action: 'sync_standings',
      league_api_id: leagueApiId,
      season,
    }),

  runFullSync: (date?: string) =>
    callFunctionPost<{ matches_fetched: number; predictions_generated: number; log_id: string }>(
      'sports-sync',
      { action: 'full_sync_frontend', date }
    ),
};
