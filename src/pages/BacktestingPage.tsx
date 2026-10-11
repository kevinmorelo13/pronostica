import { useState, useEffect } from 'react';
import { supabase, type Prediction } from '@/lib/supabase';
import { BarChart3, Calendar, TrendingUp, Target, Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function BacktestingPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [leagueFilter, setLeagueFilter] = useState<string>('all');

  useEffect(() => {
    supabase
      .from('predictions')
      .select(`
        *,
        match:matches(
          id, match_date, status, home_score, away_score,
          home_team:teams!matches_home_team_id_fkey(name),
          away_team:teams!matches_away_team_id_fkey(name),
          league:leagues(name)
        )
      `)
      .order('generated_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setPredictions(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = predictions.filter((p: any) => {
    if (leagueFilter === 'all') return true;
    return p.match?.league?.name === leagueFilter;
  });

  const evaluated = filtered.filter((p: any) => p.match?.status === 'finished' && p.prediction_result !== 'pending');
  const correct = evaluated.filter((p: any) => p.prediction_result === 'correct');
  const accuracy = evaluated.length > 0 ? (correct.length / evaluated.length) * 100 : 0;

  // Accuracy by confidence level
  const byConfidence = ['very_high', 'high', 'medium', 'low'].map(level => {
    const subset = evaluated.filter((p: any) => p.confidence === level);
    const c = subset.filter((p: any) => p.prediction_result === 'correct').length;
    return {
      name: level === 'very_high' ? 'Muy Alta' : level === 'high' ? 'Alta' : level === 'medium' ? 'Media' : 'Baja',
      total: subset.length,
      correct: c,
      accuracy: subset.length > 0 ? (c / subset.length) * 100 : 0,
    };
  });

  // Signal vs no signal
  const withSignal = evaluated.filter((p: any) => p.has_signal !== false);
  const signalCorrect = withSignal.filter((p: any) => p.prediction_result === 'correct');
  const signalAccuracy = withSignal.length > 0 ? (signalCorrect.length / withSignal.length) * 100 : 0;

  const leagues = [...new Set(predictions.map((p: any) => p.match?.league?.name).filter(Boolean))];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="text-blue-400" size={24} />
        <h1 className="text-2xl font-bold text-white">Backtesting</h1>
      </div>
      <p className="text-sm text-gray-400 -mt-4">Evaluación histórica de predicciones y rendimiento del modelo.</p>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Calendar size={16} className="text-gray-500" />
        <select
          value={leagueFilter}
          onChange={(e) => setLeagueFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">Todas las ligas</option>
          {leagues.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-blue-400" />
            <span className="text-xs text-gray-400">Predicciones evaluadas</span>
          </div>
          <p className="text-2xl font-bold text-white">{evaluated.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Percent size={16} className="text-green-400" />
            <span className="text-xs text-gray-400">Accuracy global</span>
          </div>
          <p className="text-2xl font-bold text-white">{accuracy.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-purple-400" />
            <span className="text-xs text-gray-400">Con señal</span>
          </div>
          <p className="text-2xl font-bold text-white">{withSignal.length}</p>
          <p className="text-xs text-gray-500">Acc: {signalAccuracy.toFixed(0)}%</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-yellow-400" />
            <span className="text-xs text-gray-400">Pendientes</span>
          </div>
          <p className="text-2xl font-bold text-white">{filtered.length - evaluated.length}</p>
        </div>
      </div>

      {/* Accuracy by confidence */}
      {byConfidence.some(b => b.total > 0) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Accuracy por nivel de confianza</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byConfidence.filter(b => b.total > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Bar dataKey="accuracy" fill="#3b82f6" name="Accuracy %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Results table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Predicciones evaluadas</h2>
        </div>
        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left px-4 py-3 font-medium">Partido</th>
                <th className="text-left px-4 py-3 font-medium">Predicción</th>
                <th className="text-right px-4 py-3 font-medium">Probabilidad</th>
                <th className="text-center px-4 py-3 font-medium">Resultado</th>
                <th className="text-center px-4 py-3 font-medium">Confianza</th>
                <th className="text-center px-4 py-3 font-medium">Señal</th>
              </tr>
            </thead>
            <tbody>
              {evaluated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No hay predicciones evaluadas todavía. Los resultados aparecerán cuando finalicen los partidos.
                  </td>
                </tr>
              ) : (
                evaluated.slice(0, 50).map((p: any) => {
                  const homeName = p.match?.home_team?.name ?? 'Local';
                  const awayName = p.match?.away_team?.name ?? 'Visitante';
                  const maxProb = Math.max(p.home_probability, p.draw_probability, p.away_probability);
                  const predLabel = maxProb === p.home_probability ? homeName : maxProb === p.away_probability ? awayName : 'Empate';
                  const isCorrect = p.prediction_result === 'correct';
                  return (
                    <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-300">{homeName} vs {awayName}</td>
                      <td className="px-4 py-3 text-white font-medium">{p.best_bet ?? predLabel}</td>
                      <td className="text-right px-4 py-3 text-gray-400">{(p.best_bet_probability ?? maxProb).toFixed(0)}%</td>
                      <td className="text-center px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${isCorrect ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isCorrect ? 'GANADA' : 'PERDIDA'}
                        </span>
                      </td>
                      <td className="text-center px-4 py-3 text-gray-400 text-xs capitalize">{p.confidence.replace('_', ' ')}</td>
                      <td className="text-center px-4 py-3">
                        {p.has_signal === false ? (
                          <span className="text-xs text-gray-500">Sin señal</span>
                        ) : (
                          <span className="text-xs text-blue-400">Con señal</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-yellow-500/5 rounded-lg border border-yellow-500/10">
        <p className="text-[11px] text-yellow-600">
          El backtesting es una simulación histórica y no garantiza resultados futuros. Las métricas mostradas son referencias estadísticas.
        </p>
      </div>
    </div>
  );
}
