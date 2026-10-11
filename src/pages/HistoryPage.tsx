import { useState, useEffect } from 'react';
import { History, Filter, CheckCircle, XCircle, Clock, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import EntityLogo from '@/components/EntityLogo';
import { toLocaleDateString, toLocaleTimeString, confidenceBg, confidenceLabel } from '@/lib/utils';

type HistoryRow = {
  id: string;
  match_id: string;
  confidence: string;
  prediction_result: string;
  actual_outcome: string | null;
  best_bet: string | null;
  best_bet_probability: number | null;
  analysis: string | null;
  home_probability: number;
  draw_probability: number;
  away_probability: number;
  generated_at: string;
  match: {
    match_date: string;
    home_score: number | null;
    away_score: number | null;
    league: { name: string; logo: string | null } | null;
    home_team: { name: string; logo: string | null; short_name: string | null } | null;
    away_team: { name: string; logo: string | null; short_name: string | null } | null;
  };
};

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResult, setFilterResult] = useState<string>('all');
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from('predictions')
      .select(`
        id, match_id, confidence, prediction_result, actual_outcome, best_bet, best_bet_probability, analysis,
        home_probability, draw_probability, away_probability, generated_at,
        match:matches!predictions_match_id_fkey(
          match_date, home_score, away_score,
          league:leagues(name, logo),
          home_team:teams!matches_home_team_id_fkey(name, logo, short_name),
          away_team:teams!matches_away_team_id_fkey(name, logo, short_name)
        )
      `)
      .order('generated_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterResult !== 'all') q = q.eq('prediction_result', filterResult);
    if (filterConfidence !== 'all') q = q.eq('confidence', filterConfidence);

    q.then(({ data }) => {
      setRows((data ?? []) as unknown as HistoryRow[]);
      setLoading(false);
    });
  }, [filterResult, filterConfidence, page]);

  const resultIcon = (r: string) => {
    if (r === 'correct') return <CheckCircle size={16} className="text-emerald-400" />;
    if (r === 'incorrect') return <XCircle size={16} className="text-red-400" />;
    return <Clock size={16} className="text-neutral-500" />;
  };

  const resultLabel = (r: string) => {
    if (r === 'correct') return 'Acertado';
    if (r === 'incorrect') return 'Fallido';
    return 'Pendiente';
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <History size={22} className="text-blue-400" />
          <h1 className="text-2xl font-black text-neutral-900">Historial de pronósticos</h1>
        </div>
        <p className="text-neutral-600 text-sm">Todos los pronósticos generados por el sistema, sin modificar.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border border-black/10 rounded-xl px-3 py-2">
          <Filter size={14} className="text-neutral-600" />
          <select
            value={filterResult}
            onChange={(e) => { setFilterResult(e.target.value); setPage(0); }}
            className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white">Todos los resultados</option>
            <option value="correct" className="bg-white">Acertados</option>
            <option value="incorrect" className="bg-white">Fallidos</option>
            <option value="pending" className="bg-white">Pendientes</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-black/10 rounded-xl px-3 py-2">
          <select
            value={filterConfidence}
            onChange={(e) => { setFilterConfidence(e.target.value); setPage(0); }}
            className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-white">Toda confianza</option>
            <option value="very_high" className="bg-white">Muy Alta</option>
            <option value="high" className="bg-white">Alta</option>
            <option value="medium" className="bg-white">Media</option>
            <option value="low" className="bg-white">Baja</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="bg-white border border-black/10 rounded-xl h-20 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-black/10 rounded-xl p-12 text-center">
          <BarChart3 size={40} className="text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-600">No se encontraron pronósticos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const m = row.match;
            return (
              <div key={row.id} className="bg-white border border-black/10 rounded-2xl p-4 flex items-center gap-4">
                <div className="flex-shrink-0">{resultIcon(row.prediction_result)}</div>

                {/* Teams */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <EntityLogo src={m?.home_team?.logo} name={m?.home_team?.name ?? 'Local'} size="sm" />
                    <span className="text-sm font-medium text-neutral-900 truncate">{m?.home_team?.short_name ?? m?.home_team?.name ?? '?'}</span>
                  </div>
                  <span className="text-xs text-neutral-500 flex-shrink-0">
                    {m?.home_score != null ? `${m.home_score} - ${m.away_score}` : 'vs'}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <EntityLogo src={m?.away_team?.logo} name={m?.away_team?.name ?? 'Visitante'} size="sm" />
                    <span className="text-sm font-medium text-neutral-900 truncate">{m?.away_team?.short_name ?? m?.away_team?.name ?? '?'}</span>
                  </div>
                </div>

                {/* Meta */}
                <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg border ${confidenceBg(row.confidence)}`}>
                    {confidenceLabel(row.confidence)}
                  </span>
                  <span className="text-[11px] text-neutral-500">{toLocaleDateString(row.generated_at, 'dd/MM/yy')}</span>
                </div>

                <div className="hidden min-w-[190px] flex-shrink-0 text-right md:block">
                  <p className="truncate text-xs font-bold text-neutral-900">{row.best_bet ?? 'Sin apuesta principal'}</p>
                  <p className={`mt-1 text-xs font-bold ${row.prediction_result === 'correct' ? 'text-neutral-900' : row.prediction_result === 'incorrect' ? 'text-red-600' : 'text-neutral-500'}`}>{resultLabel(row.prediction_result)}{row.actual_outcome ? ` · ${row.actual_outcome}` : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-4 py-2 bg-white border border-black/10 rounded-xl text-sm text-gray-300 disabled:opacity-40 hover:border-gray-600 transition-colors"
        >
          Anterior
        </button>
        <span className="text-xs text-neutral-500">Página {page + 1}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={rows.length < PAGE_SIZE}
          className="px-4 py-2 bg-white border border-black/10 rounded-xl text-sm text-gray-300 disabled:opacity-40 hover:border-gray-600 transition-colors"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
