import { useState } from 'react';
import { Calendar as CalIcon, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useMatches, useMatchDetail } from '@/hooks/useMatches';
import MatchCard from '@/components/MatchCard';
import MatchDetailModal from '@/components/MatchDetailModal';
import { getTodayBogota, formatMatchDate } from '@/lib/utils';
import { type Match } from '@/lib/supabase';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

function getWeekDates(anchor: string): string[] {
  const d = new Date(anchor + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toLocaleDateString('en-CA', { timeZone: 'UTC' });
  });
}

export default function CalendarPage() {
  const today = getTodayBogota();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [leagues, setLeagues] = useState<Array<{ id: string; name: string }>>([]);
  const weekDates = getWeekDates(weekAnchor);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('leagues').select('id, name').eq('is_active', true).then(({ data }) => {
      if (data) setLeagues(data);
    });
  }, []);

  const { matches, loading } = useMatches({
    date: selectedDate,
    ...(selectedLeague !== 'all' ? { leagueId: selectedLeague } : {}),
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
  });

  const { match: detailMatch, prediction, homeStats, awayStats, h2h } = useMatchDetail(selectedMatch?.id ?? null);

  const prevWeek = () => {
    const d = new Date(weekAnchor + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 7);
    setWeekAnchor(d.toLocaleDateString('en-CA', { timeZone: 'UTC' }));
  };
  const nextWeek = () => {
    const d = new Date(weekAnchor + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7);
    setWeekAnchor(d.toLocaleDateString('en-CA', { timeZone: 'UTC' }));
  };

  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <CalIcon size={22} className="text-blue-400" />
          <h1 className="text-2xl font-black text-white">Calendario</h1>
        </div>
        <p className="text-gray-400 text-sm">Consulta todos los partidos por fecha.</p>
      </div>

      {/* Week nav */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevWeek} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-300">
            {new Date(weekDates[0] + 'T12:00:00Z').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        <div ref={containerRef} className="grid grid-cols-7 gap-1">
          {weekDates.map((date, i) => {
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const dayNum = new Date(date + 'T12:00:00Z').getUTCDate();
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isToday
                    ? 'bg-gray-800 text-white border border-blue-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-[10px] uppercase">{days[i]}</span>
                <span className="text-sm font-bold">{dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-gray-900">Todos los estados</option>
            <option value="scheduled" className="bg-gray-900">Programados</option>
            <option value="live" className="bg-gray-900">En vivo</option>
            <option value="finished" className="bg-gray-900">Finalizados</option>
          </select>
        </div>
      </div>

      {/* Date label */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-white capitalize">{formatMatchDate(selectedDate + 'T12:00:00Z')}</h2>
        <span className="text-xs text-gray-500">{selectedDate}</span>
      </div>

      {/* Matches */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1,2,3].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-40" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <CalIcon size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No hay partidos para esta fecha.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">{matches.length} partido{matches.length !== 1 ? 's' : ''}</p>
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
