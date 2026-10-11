import { useState, useEffect } from 'react';
import { Zap, RefreshCw, Filter, Info, BarChart3 } from 'lucide-react';
import { useMatches, useMatchDetail } from '@/hooks/useMatches';
import MatchCard from '@/components/MatchCard';
import MatchDetailModal from '@/components/MatchDetailModal';
import { getTodayBogota } from '@/lib/utils';
import { type Match } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { fullSync } from '@/lib/syncManager';

type LeagueFilter = { id: string; name: string; logo: string | null };

export default function PredictionsPage() {
  const today = getTodayBogota();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);
  const { matches, loading, refetch } = useMatches({ date: selectedDate });
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const { match: detailMatch, prediction, homeStats, awayStats, h2h } = useMatchDetail(selectedMatch?.id ?? null);
  const [leagues, setLeagues] = useState<LeagueFilter[]>([]);

  useEffect(() => {
    supabase.from('leagues').select('id, name, logo').eq('is_active', true).then(({ data }) => {
      if (data) setLeagues(data);
    });
  }, []);

  // If today has no matches, find next date with matches
  useEffect(() => {
    if (matches.length === 0 && !loading && selectedDate === today) {
      (async () => {
        const start = `${today}T00:00:00.000Z`;
        const endFuture = new Date();
        endFuture.setDate(endFuture.getDate() + 7);
        const { data } = await supabase
          .from('matches')
          .select('match_date')
          .gte('match_date', start)
          .lte('match_date', endFuture.toISOString())
          .in('status', ['scheduled', 'live', 'halftime'])
          .order('match_date', { ascending: true })
          .limit(1);
        if (data && data.length > 0) {
          setSelectedDate(data[0].match_date.slice(0, 10));
        }
      })();
    }
  }, [matches.length, loading, selectedDate, today]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fullSync(selectedDate);
      refetch();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const matchesWithPreds = matches.filter((m) => m.prediction);

  const filtered = matchesWithPreds.filter((m) => {
    if (selectedLeague !== 'all' && m.league_id !== selectedLeague) return false;
    if (selectedConfidence !== 'all' && m.prediction?.confidence !== selectedConfidence) return false;
    return true;
  });

  const confidenceCounts = {
    very_high: matchesWithPreds.filter((m) => m.prediction?.confidence === 'very_high').length,
    high: matchesWithPreds.filter((m) => m.prediction?.confidence === 'high').length,
    medium: matchesWithPreds.filter((m) => m.prediction?.confidence === 'medium').length,
    low: matchesWithPreds.filter((m) => m.prediction?.confidence === 'low').length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Zap size={22} className="text-blue-400" />
          <h1 className="text-2xl font-black text-white">Pronósticos</h1>
        </div>
        <p className="text-gray-400 text-sm">Análisis estadístico de partidos. Los pronósticos se generan diariamente a las 6:00 AM hora Colombia.</p>
      </div>

      {/* Date + filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm text-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-gray-900">Todas las ligas</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id} className="bg-gray-900">{l.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
          <select
            value={selectedConfidence}
            onChange={(e) => setSelectedConfidence(e.target.value)}
            className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-gray-900">Toda confianza</option>
            <option value="very_high" className="bg-gray-900">Muy Alta</option>
            <option value="high" className="bg-gray-900">Alta</option>
            <option value="medium" className="bg-gray-900">Media</option>
            <option value="low" className="bg-gray-900">Baja</option>
          </select>
        </div>

        <button
          onClick={handleSync}
          disabled={loading || syncing}
          className="flex items-center gap-2 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading || syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {/* Confidence summary */}
      {matchesWithPreds.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'very_high', label: 'Muy Alta', color: 'border-emerald-500/40 bg-emerald-500/10', textColor: 'text-emerald-400' },
            { key: 'high', label: 'Alta', color: 'border-green-500/40 bg-green-500/10', textColor: 'text-green-400' },
            { key: 'medium', label: 'Media', color: 'border-yellow-500/40 bg-yellow-500/10', textColor: 'text-yellow-400' },
            { key: 'low', label: 'Baja', color: 'border-red-500/40 bg-red-500/10', textColor: 'text-red-400' },
          ].map(({ key, label, color, textColor }) => (
            <button
              key={key}
              onClick={() => setSelectedConfidence(selectedConfidence === key ? 'all' : key)}
              className={`border rounded-xl p-3 text-center transition-all ${color} ${selectedConfidence === key ? 'ring-2 ring-white/20' : ''}`}
            >
              <p className={`text-2xl font-black ${textColor}`}>{confidenceCounts[key as keyof typeof confidenceCounts]}</p>
              <p className="text-xs text-gray-400 mt-0.5">Confianza {label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-300/70">
          Los pronósticos son estimaciones estadísticas y no garantizan resultados deportivos. Basados en forma reciente, estadísticas de temporada e historial H2H.
        </p>
      </div>

      {/* Predictions grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <BarChart3 size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">No hay pronósticos disponibles</p>
          <p className="text-gray-600 text-sm mt-1">
            {matchesWithPreds.length === 0
              ? 'Los pronósticos se generan automáticamente a las 6:00 AM hora Colombia.'
              : 'Prueba ajustando los filtros.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">{filtered.length} pronóstico{filtered.length !== 1 ? 's' : ''}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => (
              <MatchCard key={m.id} match={m} onClick={setSelectedMatch} />
            ))}
          </div>
        </>
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
