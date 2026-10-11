import { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, Target, Award } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

type PredictionStats = {
  total: number;
  correct: number;
  incorrect: number;
  pending: number;
  accuracy: number;
};

type LeagueStat = {
  name: string;
  total: number;
  correct: number;
  accuracy: number;
};

export default function StatsPage() {
  const [overall, setOverall] = useState<PredictionStats>({ total: 0, correct: 0, incorrect: 0, pending: 0, accuracy: 0 });
  const [byLeague, setByLeague] = useState<LeagueStat[]>([]);
  const [byConfidence, setByConfidence] = useState<Array<{ confidence: string; total: number; correct: number; accuracy: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [predRes, leagueRes] = await Promise.all([
        supabase.from('predictions').select('id, confidence, prediction_result, match_id, matches!inner(league_id, leagues(name))'),
        supabase.from('leagues').select('id, name').eq('is_active', true),
      ]);

      const preds = predRes.data ?? [];
      const total = preds.length;
      const correct = preds.filter((p) => p.prediction_result === 'correct').length;
      const incorrect = preds.filter((p) => p.prediction_result === 'incorrect').length;
      const pending = preds.filter((p) => p.prediction_result === 'pending').length;
      const decided = correct + incorrect;

      setOverall({ total, correct, incorrect, pending, accuracy: decided > 0 ? (correct / decided) * 100 : 0 });

      // By league
      const lMap: Record<string, { name: string; total: number; correct: number }> = {};
      for (const p of preds) {
        const m = p.matches as { leagues?: { name: string } };
        const lname = m?.leagues?.name ?? 'Desconocida';
        if (!lMap[lname]) lMap[lname] = { name: lname, total: 0, correct: 0 };
        lMap[lname].total++;
        if (p.prediction_result === 'correct') lMap[lname].correct++;
      }
      const lStats = Object.values(lMap).map((l) => ({
        ...l,
        accuracy: l.total > 0 ? (l.correct / l.total) * 100 : 0,
      }));
      setByLeague(lStats);

      // By confidence
      const cMap: Record<string, { total: number; correct: number }> = {};
      for (const p of preds) {
        const c = p.confidence as string;
        if (!cMap[c]) cMap[c] = { total: 0, correct: 0 };
        cMap[c].total++;
        if (p.prediction_result === 'correct') cMap[c].correct++;
      }
      const cOrder = ['very_high', 'high', 'medium', 'low'];
      const cLabels: Record<string, string> = { very_high: 'Muy Alta', high: 'Alta', medium: 'Media', low: 'Baja' };
      setByConfidence(
        cOrder
          .filter((c) => cMap[c])
          .map((c) => ({
            confidence: cLabels[c],
            total: cMap[c].total,
            correct: cMap[c].correct,
            accuracy: cMap[c].total > 0 ? (cMap[c].correct / cMap[c].total) * 100 : 0,
          }))
      );

      setLoading(false);
    })();
  }, []);

  const radialData = [{ name: 'Acierto', value: overall.accuracy, fill: '#3b82f6' }];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 size={22} className="text-blue-400" />
          <h1 className="text-2xl font-black text-white">Estadísticas</h1>
        </div>
        <p className="text-gray-400 text-sm">Rendimiento histórico del modelo de pronósticos.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-24 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Overall stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total pronósticos', value: overall.total, icon: Target, color: 'bg-blue-600' },
              { label: 'Acertados', value: overall.correct, icon: Award, color: 'bg-emerald-600' },
              { label: 'Fallidos', value: overall.incorrect, icon: TrendingUp, color: 'bg-red-600' },
              { label: 'Pendientes', value: overall.pending, icon: BarChart2, color: 'bg-gray-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
                <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black text-white">{value}</p>
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Accuracy + charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Radial accuracy */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Porcentaje de acierto global</h3>
              {overall.total === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">Aún no hay pronósticos resueltos.</div>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={120} height={120}>
                    <RadialBarChart innerRadius={35} outerRadius={55} data={radialData} startAngle={90} endAngle={-270}>
                      <RadialBar dataKey="value" cornerRadius={4} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div>
                    <p className="text-4xl font-black text-blue-400">{overall.accuracy.toFixed(1)}%</p>
                    <p className="text-sm text-gray-400 mt-1">de acierto</p>
                    <p className="text-xs text-gray-600 mt-2">{overall.correct} de {overall.correct + overall.incorrect} pronósticos resueltos</p>
                  </div>
                </div>
              )}
            </div>

            {/* By confidence */}
            {byConfidence.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Acierto por nivel de confianza</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={byConfidence} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="confidence" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#f9fafb' }}
                      formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Acierto']}
                    />
                    <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                      {byConfidence.map((_, i) => (
                        <Cell key={i} fill={['#10b981', '#22c55e', '#eab308', '#ef4444'][i] ?? '#6b7280'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* By league */}
          {byLeague.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Rendimiento por liga</h3>
              <div className="space-y-3">
                {byLeague.map((l) => (
                  <div key={l.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300 font-medium">{l.name}</span>
                      <span className="text-gray-400">{l.correct}/{l.total} · {l.accuracy.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${l.accuracy}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
