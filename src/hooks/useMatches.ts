import { useEffect, useState, useCallback } from 'react';
import { supabase, type Match, type Prediction, type TeamStatistics, type H2HRecord } from '@/lib/supabase';
import { getBogotaDateRange, getTodayBogota } from '@/lib/utils';

export function useMatches(filters: {
  date?: string;
  status?: string | string[];
  leagueId?: string;
} = {}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('matches')
        .select(`
          *,
          league:leagues(*),
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*),
          prediction:predictions(*)
        `)
        .order('match_date', { ascending: true });

      if (filters.date) {
        const { start, end } = getBogotaDateRange(filters.date);
        q = q.gte('match_date', start).lte('match_date', end);
      }
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          q = q.in('status', filters.status);
        } else {
          q = q.eq('status', filters.status);
        }
      }
      if (filters.leagueId) {
        q = q.eq('league_id', filters.leagueId);
      }

      const { data, error: err } = await q;
      if (err) throw err;

      const enriched = (data ?? []).map((m) => ({
        ...m,
        prediction: Array.isArray(m.prediction) ? m.prediction[0] ?? null : m.prediction,
      }));
      setMatches(enriched as Match[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.leagueId, JSON.stringify(filters.status)]);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [load]);

  return { matches, loading, error, refetch: load };
}

export function useLiveMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = getTodayBogota();
    const { start, end } = getBogotaDateRange(today);
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        league:leagues(*),
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*),
        prediction:predictions(*)
      `)
      .in('status', ['live', 'halftime'])
      .gte('match_date', start)
      .lte('match_date', end)
      .order('match_date', { ascending: true });

    const enriched = (data ?? []).map((m) => ({
      ...m,
      prediction: Array.isArray(m.prediction) ? m.prediction[0] ?? null : m.prediction,
    }));
    setMatches(enriched as Match[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    const channel = supabase
      .channel('live_matches')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => load())
      .subscribe();
    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { matches, loading, refetch: load };
}

export function useMatchDetail(matchId: string | null) {
  const [match, setMatch] = useState<Match | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [homeStats, setHomeStats] = useState<TeamStatistics | null>(null);
  const [awayStats, setAwayStats] = useState<TeamStatistics | null>(null);
  const [h2h, setH2h] = useState<H2HRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    (async () => {
      const { data: m } = await supabase
        .from('matches')
        .select(`
          *,
          league:leagues(*),
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .eq('id', matchId)
        .maybeSingle();

      if (!m) { setLoading(false); return; }
      setMatch(m as Match);

      const [predRes, hsRes, asRes, h2hRes] = await Promise.all([
        supabase.from('predictions').select('*').eq('match_id', matchId).maybeSingle(),
        supabase.from('team_statistics').select('*').eq('team_id', m.home_team_id).eq('league_id', m.league_id).maybeSingle(),
        supabase.from('team_statistics').select('*').eq('team_id', m.away_team_id).eq('league_id', m.league_id).maybeSingle(),
        supabase.from('h2h_records')
          .select('*, home_team:teams!h2h_records_home_team_id_fkey(*), away_team:teams!h2h_records_away_team_id_fkey(*)')
          .or(`and(home_team_id.eq.${m.home_team_id},away_team_id.eq.${m.away_team_id}),and(home_team_id.eq.${m.away_team_id},away_team_id.eq.${m.home_team_id})`)
          .order('match_date', { ascending: false })
          .limit(10),
      ]);

      setPrediction(predRes.data as Prediction | null);
      setHomeStats(hsRes.data as TeamStatistics | null);
      setAwayStats(asRes.data as TeamStatistics | null);
      setH2h((h2hRes.data ?? []) as H2HRecord[]);
      setLoading(false);
    })();
  }, [matchId]);

  return { match, prediction, homeStats, awayStats, h2h, loading };
}

export function useTodayStats() {
  const [stats, setStats] = useState({
    todayMatches: 0,
    liveMatches: 0,
    predictionsGenerated: 0,
    topLeague: '',
    topPrediction: '',
    topProbability: 0,
  });

  useEffect(() => {
    (async () => {
      const today = getTodayBogota();
      const { start, end } = getBogotaDateRange(today);

      const [todayRes, liveRes, predRes] = await Promise.all([
        supabase.from('matches').select('id, league_id, leagues(name)', { count: 'exact' }).gte('match_date', start).lte('match_date', end),
        supabase.from('matches').select('id', { count: 'exact' }).in('status', ['live', 'halftime']).gte('match_date', start).lte('match_date', end),
        supabase.from('predictions')
          .select('id, confidence, match_id, matches!inner(match_date, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), home_probability, draw_probability, away_probability)')
          .gte('generated_at', start)
          .lte('generated_at', end)
          .order('generated_at', { ascending: false }),
      ]);

      const todayMatches = todayRes.count ?? 0;
      const liveMatches = liveRes.count ?? 0;
      const preds = predRes.data ?? [];

      // top league
      const leagueCount: Record<string, { count: number; name: string }> = {};
      for (const m of todayRes.data ?? []) {
        const lid = m.league_id;
        const lname = (m as unknown as { leagues?: { name: string }[] }).leagues?.[0]?.name ?? 'Desconocida';
        if (!leagueCount[lid]) leagueCount[lid] = { count: 0, name: lname };
        leagueCount[lid].count++;
      }
      const topLeagueEntry = Object.values(leagueCount).sort((a, b) => b.count - a.count)[0];

      // top prediction
      const topPred = preds.find((p) => p.confidence === 'very_high') ?? preds.find((p) => p.confidence === 'high');

      setStats({
        todayMatches,
        liveMatches,
        predictionsGenerated: preds.length,
        topLeague: topLeagueEntry?.name ?? 'N/A',
        topPrediction: topPred
          ? `${(topPred.matches as unknown as { home_team?: { name: string }[]; away_team?: { name: string }[] })?.home_team?.[0]?.name ?? ''} vs ${(topPred.matches as unknown as { home_team?: { name: string }[]; away_team?: { name: string }[] })?.away_team?.[0]?.name ?? ''}`
          : 'N/A',
        topProbability: topPred ? Math.max((topPred as { home_probability?: number; draw_probability?: number; away_probability?: number }).home_probability ?? 0, (topPred as { draw_probability?: number }).draw_probability ?? 0, (topPred as { away_probability?: number }).away_probability ?? 0) : 0,
      });
    })();
    const interval = window.setInterval(async () => {
      const today = getTodayBogota();
      const { start, end } = getBogotaDateRange(today);
      const [todayRes, liveRes, predRes] = await Promise.all([
        supabase.from('matches').select('id, league_id, leagues(name)', { count: 'exact' }).gte('match_date', start).lte('match_date', end),
        supabase.from('matches').select('id', { count: 'exact' }).in('status', ['live', 'halftime']).gte('match_date', start).lte('match_date', end),
        supabase.from('predictions').select('id').gte('generated_at', start).lte('generated_at', end),
      ]);
      setStats((current) => ({ ...current, todayMatches: todayRes.count ?? 0, liveMatches: liveRes.count ?? 0, predictionsGenerated: predRes.data?.length ?? 0 }));
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  return stats;
}
