import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Radio, Calendar, Trophy, Zap, RefreshCw, ArrowRight, BarChart3, type LucideIcon } from 'lucide-react';
import { useMatches, useLiveMatches, useTodayStats } from '@/hooks/useMatches';
import { useMatchDetail } from '@/hooks/useMatches';
import MatchCard from '@/components/MatchCard';
import MatchDetailModal from '@/components/MatchDetailModal';
import { getTodayBogota } from '@/lib/utils';
import { type Match } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import EntityLogo from '@/components/EntityLogo';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: LucideIcon; color: string }) {
  return (
    <div className={`bg-white border border-black/10 rounded-xl p-4 flex items-center gap-4`}>
      <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className="text-neutral-900" />
      </div>
      <div>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
        <p className="text-xs text-neutral-600 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function LeagueCard({ name, country, logo, matchCount }: { name: string; country: string; logo?: string; matchCount: number }) {
  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 flex items-center gap-3 hover:border-gray-600 transition-colors">
      <EntityLogo src={logo} name={name} />
      <div className="min-w-0">
        <p className="font-semibold text-neutral-900 text-sm truncate">{name}</p>
        <p className="text-xs text-neutral-500">{country} · {matchCount} partidos</p>
      </div>
    </div>
  );
}

// Find the next date (within 7 days) that has scheduled matches
function useNextMatchDate(today: string): string {
  const [date, setDate] = useState(today);
  useEffect(() => {
    (async () => {
      const start = `${today}T00:00:00.000Z`;
      const endFuture = new Date();
      endFuture.setDate(endFuture.getDate() + 7);
      const end = endFuture.toISOString();
      const { data } = await supabase
        .from('matches')
        .select('match_date')
        .gte('match_date', start)
        .lte('match_date', end)
        .in('status', ['scheduled', 'live', 'halftime'])
        .order('match_date', { ascending: true })
        .limit(1);
      if (data && data.length > 0) {
        setDate(data[0].match_date.slice(0, 10));
      }
    })();
  }, [today]);
  return date;
}

export default function HomePage() {
  const today = getTodayBogota();
  const effectiveDate = useNextMatchDate(today);
  const { matches, loading, refetch } = useMatches({ date: effectiveDate });
  const { matches: liveMatches } = useLiveMatches();
  const stats = useTodayStats();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [leagues, setLeagues] = useState<Array<{ id: string; name: string; country: string; logo: string | null }>>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('leagues').select('id, name, country, logo').eq('is_active', true).then(({ data }) => {
      if (data) setLeagues(data);
    });
    supabase.from('admin_logs').select('completed_at').eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      if (data?.completed_at) setLastUpdated(data.completed_at);
    });
  }, []);

  const { match: detailMatch, prediction, homeStats, awayStats, h2h } = useMatchDetail(selectedMatch?.id ?? null);

  const matchesWithPreds = matches.filter((m) => m.prediction);
  const leagueMatchCounts = matches.reduce<Record<string, number>>((acc, m) => {
    const lid = m.league_id;
    acc[lid] = (acc[lid] ?? 0) + 1;
    return acc;
  }, {});

  const showingToday = effectiveDate === today;

  return (
    <div className="p-4 lg:p-6 space-y-8 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br bg-[#171717] border border-black p-6 lg:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(199,255,0,0.12)_0%,_transparent_70%)]" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#c7ff00] bg-[#c7ff00]/15 border border-[#c7ff00]/40 px-3 py-1 rounded-full">
              Análisis estadístico deportivo
            </span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-black text-white mb-3 leading-tight">
            Pronósticos deportivos
            <br />
            <span className="text-[#c7ff00]">basados en datos</span>
          </h1>
          <p className="text-neutral-200 text-base lg:text-lg mb-6 max-w-xl">
            Analiza los partidos de las principales ligas y consulta probabilidades actualizadas con modelos estadísticos.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/predicciones"
              className="inline-flex items-center gap-2 bg-[#c7ff00] hover:bg-[#d8ff4c] text-neutral-900 text-neutral-900 font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              <Zap size={16} />
              Ver pronósticos de hoy
            </Link>
            <Link
              to="/en-vivo"
              className="inline-flex items-center gap-2 bg-white hover:bg-neutral-100 text-neutral-900 font-semibold px-5 py-2.5 rounded-xl transition-colors border border-white"
            >
              <Radio size={16} className="text-red-500" />
              Partidos en vivo
              {liveMatches.length > 0 && (
                <span className="bg-red-500 text-neutral-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {liveMatches.length}
                </span>
              )}
            </Link>
          </div>
          {lastUpdated && (
            <p className="text-xs text-neutral-300 mt-4">
              Última actualización: {new Date(lastUpdated).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Partidos hoy" value={stats.todayMatches} icon={Calendar} color="bg-[#171717]" />
        <StatCard label="En vivo" value={liveMatches.length} icon={Radio} color="bg-red-500" />
        <StatCard label="Pronósticos" value={stats.predictionsGenerated} icon={TrendingUp} color="bg-[#c7ff00]" />
        <StatCard label="Liga destacada" value={stats.topLeague} icon={Trophy} color="bg-neutral-900" />
      </div>

      {/* Live matches */}
      {liveMatches.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              <h2 className="text-lg font-bold text-neutral-900">Partidos en vivo</h2>
              <span className="text-xs font-bold text-red-500 bg-red-400/10 px-2 py-0.5 rounded-full">{liveMatches.length}</span>
            </div>
            <Link to="/en-vivo" className="text-xs text-[#c7ff00] hover:text-[#d8ff4c] flex items-center gap-1">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {liveMatches.slice(0, 3).map((m) => (
              <MatchCard key={m.id} match={m} onClick={setSelectedMatch} />
            ))}
          </div>
        </section>
      )}

      {/* Today's predictions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-[#c7ff00]" />
            <h2 className="text-lg font-bold text-neutral-900">
              {showingToday ? 'Pronósticos de hoy' : 'Próximos pronósticos'}
            </h2>
            {!showingToday && (
              <span className="text-xs text-neutral-500">
                {new Date(effectiveDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refetch}
              disabled={loading}
              className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link to="/predicciones" className="text-xs text-[#c7ff00] hover:text-[#d8ff4c] flex items-center gap-1">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1,2,3].map((i) => (
              <div key={i} className="bg-white border border-black/10 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-1/2 mb-3" />
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-800 rounded-full" />
                  <div className="flex-1 h-4 bg-gray-800 rounded" />
                  <div className="w-12 h-6 bg-gray-800 rounded" />
                  <div className="flex-1 h-4 bg-gray-800 rounded" />
                  <div className="w-8 h-8 bg-gray-800 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : matchesWithPreds.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-xl p-8 text-center">
            <BarChart3 size={40} className="text-neutral-400 mx-auto mb-3" />
            <p className="text-neutral-600 text-sm">No hay pronósticos generados para hoy.</p>
            <p className="text-neutral-500 text-xs mt-1">Los pronósticos se generan automáticamente a las 6:00 AM hora Colombia.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {matchesWithPreds.slice(0, 6).map((m) => (
              <MatchCard key={m.id} match={m} onClick={setSelectedMatch} />
            ))}
          </div>
        )}
      </section>

      {/* Featured leagues */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-neutral-900" />
            <h2 className="text-lg font-bold text-neutral-900">Ligas destacadas</h2>
          </div>
          <Link to="/clasificaciones" className="text-xs text-[#c7ff00] hover:text-[#d8ff4c] flex items-center gap-1">
            Clasificaciones <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {leagues.map((l) => (
            <LeagueCard
              key={l.id}
              name={l.name}
              country={l.country}
              logo={l.logo ?? undefined}
              matchCount={leagueMatchCounts[l.id] ?? 0}
            />
          ))}
        </div>
      </section>

      {/* All matches */}
      {matches.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-neutral-600" />
              <h2 className="text-lg font-bold text-neutral-900">
                {showingToday ? 'Todos los partidos de hoy' : 'Partidos próximos'}
              </h2>
            </div>
            <Link to="/calendario" className="text-xs text-[#c7ff00] hover:text-[#d8ff4c] flex items-center gap-1">
              Calendario <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} onClick={setSelectedMatch} />
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <div className="bg-white/50 border border-black/10 rounded-xl p-4 text-center">
        <p className="text-xs text-neutral-500">
          Los pronósticos son estimaciones estadísticas basadas en datos históricos y actuales.
          No representan resultados garantizados ni constituyen asesoramiento de apuestas.
        </p>
      </div>

      {/* Match detail modal */}
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
