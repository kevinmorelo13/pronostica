import { useState, useEffect } from 'react';
import { Globe, BarChart3, Calendar, Trophy, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, type League } from '@/lib/supabase';
import { getTodayBogota } from '@/lib/utils';

function LeagueDetailCard({ league, matchCount, onSelect }: { league: League; matchCount: number; onSelect: () => void }) {
  const flagMap: Record<string, string> = {
    Colombia: '🇨🇴',
    England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    Spain: '🇪🇸',
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition-all group cursor-pointer" onClick={onSelect}>
      <div className="h-24 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border-b border-gray-800">
        {league.logo ? (
          <img src={league.logo} alt={league.name} className="h-16 w-16 object-contain group-hover:scale-105 transition-transform" />
        ) : (
          <Trophy size={40} className="text-gray-600" />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-bold text-white">{league.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{flagMap[league.country] ?? ''} {league.country} · Temporada {league.season}</p>
          </div>
          <ArrowRight size={16} className="text-gray-600 group-hover:text-gray-400 mt-1 transition-colors" />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-gray-800/60 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{matchCount}</p>
            <p className="text-[10px] text-gray-500">Hoy</p>
          </div>
          <Link
            to="/clasificaciones"
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800/60 rounded-lg p-2 text-center hover:bg-gray-700/60 transition-colors"
          >
            <Trophy size={16} className="text-amber-400 mx-auto mb-0.5" />
            <p className="text-[10px] text-gray-500">Tabla</p>
          </Link>
          <Link
            to="/predicciones"
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800/60 rounded-lg p-2 text-center hover:bg-gray-700/60 transition-colors"
          >
            <TrendingUp size={16} className="text-blue-400 mx-auto mb-0.5" />
            <p className="text-[10px] text-gray-500">Pronóst.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

const FUTURE_LEAGUES = [
  { name: 'Champions League', flag: '🏆' },
  { name: 'Serie A', flag: '🇮🇹' },
  { name: 'Bundesliga', flag: '🇩🇪' },
  { name: 'Ligue 1', flag: '🇫🇷' },
  { name: 'Liga Argentina', flag: '🇦🇷' },
  { name: 'Copa Libertadores', flag: '🌎' },
];

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  const today = getTodayBogota();

  useEffect(() => {
    supabase.from('leagues').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setLeagues(data as League[]);
    });

    const start = `${today}T00:00:00.000Z`;
    const end = `${today}T23:59:59.999Z`;
    supabase
      .from('matches')
      .select('league_id')
      .gte('match_date', start)
      .lte('match_date', end)
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        for (const m of data ?? []) {
          counts[m.league_id] = (counts[m.league_id] ?? 0) + 1;
        }
        setMatchCounts(counts);
      });
  }, [today]);

  return (
    <div className="p-4 lg:p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Globe size={22} className="text-blue-400" />
          <h1 className="text-2xl font-black text-white">Competiciones</h1>
        </div>
        <p className="text-gray-400 text-sm">Ligas activas con análisis y pronósticos disponibles.</p>
      </div>

      {/* Active leagues */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {leagues.map((l) => (
          <LeagueDetailCard
            key={l.id}
            league={l}
            matchCount={matchCounts[l.id] ?? 0}
            onSelect={() => {}}
          />
        ))}
      </div>

      {/* Coming soon */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Próximamente</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FUTURE_LEAGUES.map((l) => (
            <div key={l.name} className="bg-gray-900/50 border border-dashed border-gray-700/50 rounded-xl p-4 flex items-center gap-3 opacity-60">
              <span className="text-2xl">{l.flag}</span>
              <div>
                <p className="text-sm font-medium text-gray-400">{l.name}</p>
                <p className="text-xs text-gray-600">En desarrollo</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
