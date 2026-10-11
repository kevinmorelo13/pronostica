import { useState, useEffect } from 'react';
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase, type Standing, type League } from '@/lib/supabase';

type StandingRow = Standing & { team: { name: string; logo: string | null; short_name: string | null } };

function positionStyle(pos: number, total: number): string {
  if (pos <= 1) return 'text-amber-400 font-bold';
  if (pos <= 4) return 'text-blue-400 font-semibold';
  if (pos <= 6) return 'text-green-400 font-medium';
  if (pos >= total - 2) return 'text-red-400';
  return 'text-gray-400';
}

function FormBadges({ form }: { form?: string | null }) {
  if (!form) return null;
  const chars = form.slice(-5).split('');
  const map: Record<string, { color: string; label: string }> = {
    W: { color: 'bg-emerald-500', label: 'V' },
    D: { color: 'bg-yellow-500', label: 'E' },
    L: { color: 'bg-red-500', label: 'D' },
  };
  return (
    <div className="flex gap-0.5">
      {chars.map((c, i) => (
        <span key={i} className={`w-4 h-4 ${map[c]?.color ?? 'bg-gray-600'} rounded-sm text-white text-[9px] font-bold flex items-center justify-center`}>
          {map[c]?.label ?? c}
        </span>
      ))}
    </div>
  );
}

export default function StandingsPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('leagues').select('*').eq('is_active', true).then(({ data }) => {
      if (data && data.length > 0) {
        setLeagues(data as League[]);
        setSelectedLeague(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedLeague) return;
    setLoading(true);
    supabase
      .from('standings')
      .select('*, team:teams!standings_team_id_fkey(name, logo, short_name)')
      .eq('league_id', selectedLeague)
      .order('position', { ascending: true })
      .then(({ data }) => {
        setStandings((data ?? []) as StandingRow[]);
        setLoading(false);
      });
  }, [selectedLeague]);

  const selectedLeagueObj = leagues.find((l) => l.id === selectedLeague);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Trophy size={22} className="text-amber-400" />
          <h1 className="text-2xl font-black text-white">Clasificaciones</h1>
        </div>
        <p className="text-gray-400 text-sm">Tablas de posiciones de las ligas activas.</p>
      </div>

      {/* League tabs */}
      <div className="flex gap-2 flex-wrap">
        {leagues.map((l) => (
          <button
            key={l.id}
            onClick={() => setSelectedLeague(l.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedLeague === l.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            {l.logo && <img src={l.logo} alt={l.name} className="w-4 h-4 object-contain" />}
            {l.name}
          </button>
        ))}
      </div>

      {/* Legend */}
      {selectedLeagueObj && (
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Campeón</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" />Champions/Libertadores</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" />Europa/Sudamericana</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" />Descenso</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse space-y-2">
          {[...Array(18)].map((_, i) => <div key={i} className="h-10 bg-gray-800 rounded" />)}
        </div>
      ) : standings.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Trophy size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No hay datos de clasificación disponibles.</p>
          <p className="text-gray-600 text-xs mt-1">La tabla se actualiza tras la sincronización con la API deportiva.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_repeat(8,auto)_auto] gap-0 text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 border-b border-gray-800 bg-gray-900/80">
            <span className="w-6 text-center">#</span>
            <span className="px-2">Equipo</span>
            <span className="w-8 text-center">PJ</span>
            <span className="w-8 text-center">PG</span>
            <span className="w-8 text-center">PE</span>
            <span className="w-8 text-center">PP</span>
            <span className="w-8 text-center">GF</span>
            <span className="w-8 text-center">GC</span>
            <span className="w-8 text-center">DG</span>
            <span className="w-8 text-center font-bold">Pts</span>
            <span className="w-24 hidden sm:block">Forma</span>
          </div>
          {standings.map((row, idx) => (
            <div
              key={row.id}
              className={`border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors cursor-pointer`}
              onClick={() => setExpandedTeam(expandedTeam === row.id ? null : row.id)}
            >
              <div className="grid grid-cols-[auto_1fr_repeat(8,auto)_auto] gap-0 items-center px-3 py-2.5">
                <span className={`w-6 text-center text-xs ${positionStyle(row.position, standings.length)}`}>
                  {row.position}
                </span>
                <div className="flex items-center gap-2 px-2 min-w-0">
                  {row.team?.logo ? (
                    <img src={row.team.logo} alt={row.team.name} className="w-5 h-5 object-contain flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 bg-gray-700 rounded-full flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-white truncate">
                    {row.team?.short_name ?? row.team?.name ?? 'Equipo'}
                  </span>
                </div>
                <span className="w-8 text-center text-xs text-gray-400">{row.played}</span>
                <span className="w-8 text-center text-xs text-gray-300">{row.wins}</span>
                <span className="w-8 text-center text-xs text-gray-300">{row.draws}</span>
                <span className="w-8 text-center text-xs text-gray-300">{row.losses}</span>
                <span className="w-8 text-center text-xs text-gray-300">{row.goals_for}</span>
                <span className="w-8 text-center text-xs text-gray-300">{row.goals_against}</span>
                <span className={`w-8 text-center text-xs font-medium ${row.goal_diff > 0 ? 'text-emerald-400' : row.goal_diff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                </span>
                <span className="w-8 text-center text-sm font-bold text-white">{row.points}</span>
                <div className="w-24 hidden sm:flex items-center justify-end">
                  <FormBadges form={row.form} />
                </div>
              </div>
              {expandedTeam === row.id && (
                <div className="px-5 pb-3 bg-gray-800/20 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center">
                    <p className="text-[11px] text-gray-500">% Victorias</p>
                    <p className="text-sm font-bold text-white">{row.played > 0 ? ((row.wins / row.played) * 100).toFixed(0) : 0}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-gray-500">Goles/partido</p>
                    <p className="text-sm font-bold text-white">{row.played > 0 ? (row.goals_for / row.played).toFixed(1) : '0.0'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-gray-500">Recibidos/partido</p>
                    <p className="text-sm font-bold text-white">{row.played > 0 ? (row.goals_against / row.played).toFixed(1) : '0.0'}</p>
                  </div>
                  <div className="text-center sm:hidden">
                    <p className="text-[11px] text-gray-500">Forma</p>
                    <FormBadges form={row.form} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
