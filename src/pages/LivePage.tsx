import { useState, useEffect, useCallback } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { useLiveMatches, useMatchDetail } from '@/hooks/useMatches';
import MatchCard from '@/components/MatchCard';
import MatchDetailModal from '@/components/MatchDetailModal';
import { type Match } from '@/lib/supabase';
import { syncLive } from '@/lib/syncManager';

export default function LivePage() {
  const { matches, loading, refetch } = useLiveMatches();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { match: detailMatch, prediction, homeStats, awayStats, h2h } = useMatchDetail(selectedMatch?.id ?? null);

  const syncFromEspn = useCallback(async () => {
    setSyncing(true);
    try {
      await syncLive();
      refetch();
    } catch (e) {
      console.error('Live sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [refetch]);

  useEffect(() => {
    syncFromEspn();
    const iv = setInterval(syncFromEspn, 60_000);
    return () => clearInterval(iv);
  }, [syncFromEspn]);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="w-3 h-3 bg-red-400 rounded-full animate-pulse" />
            <h1 className="text-2xl font-black text-white">Partidos en vivo</h1>
          </div>
          <p className="text-gray-400 text-sm">Actualizándose automáticamente cada minuto.</p>
        </div>
        <button
          onClick={syncFromEspn}
          disabled={loading || syncing}
          className="flex items-center gap-2 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading || syncing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1,2,3].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-40" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <Radio size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">No hay partidos en vivo en este momento</p>
          <p className="text-gray-600 text-sm mt-1">Esta sección se actualiza automáticamente cuando haya partidos en curso.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">{matches.length} partido{matches.length !== 1 ? 's' : ''} en vivo</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((m) => (
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
