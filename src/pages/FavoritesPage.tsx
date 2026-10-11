import { useState, useEffect } from 'react';
import { Star, Calendar } from 'lucide-react';
import { useMatchDetail } from '@/hooks/useMatches';
import MatchCard from '@/components/MatchCard';
import MatchDetailModal from '@/components/MatchDetailModal';
import { supabase, type Match } from '@/lib/supabase';
import { type Match as MatchType } from '@/lib/supabase';

const FAVORITES_KEY = 'futbol_predictor_favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'); }
    catch { return []; }
  });

  const toggle = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { favorites, toggle };
}

export default function FavoritesPage() {
  const { favorites } = useFavorites();
  const [matches, setMatches] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchType | null>(null);
  const { match: detailMatch, prediction, homeStats, awayStats, h2h } = useMatchDetail(selectedMatch?.id ?? null);

  useEffect(() => {
    if (favorites.length === 0) { setMatches([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('matches')
      .select(`
        *,
        league:leagues(*),
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*),
        prediction:predictions(*)
      `)
      .in('id', favorites)
      .order('match_date', { ascending: true })
      .then(({ data }) => {
        const enriched = (data ?? []).map((m) => ({
          ...m,
          prediction: Array.isArray(m.prediction) ? m.prediction[0] ?? null : m.prediction,
        }));
        setMatches(enriched as MatchType[]);
        setLoading(false);
      });
  }, [favorites]);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Star size={22} className="text-amber-400" />
          <h1 className="text-2xl font-black text-white">Favoritos</h1>
        </div>
        <p className="text-gray-400 text-sm">Partidos que marcaste como favoritos.</p>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1,2,3].map((i) => <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-40 animate-pulse" />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Star size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No tienes partidos favoritos.</p>
          <p className="text-gray-600 text-sm mt-1">Haz clic en la estrella de cualquier partido para guardarlo aquí.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} onClick={setSelectedMatch} />
          ))}
        </div>
      )}

      {selectedMatch && detailMatch && (
        <MatchDetailModal
          match={detailMatch}
          prediction={prediction}
          homeStats={homeStats}
          awayStats={awayStats}
          h2h={h2h}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}
