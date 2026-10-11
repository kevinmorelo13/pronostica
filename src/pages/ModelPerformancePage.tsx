import { useState, useEffect } from 'react';
import { supabase, type ModelPerformance } from '@/lib/supabase';
import { Brain, TrendingUp, Target, Activity, Award } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const MODEL_LABELS: Record<string, string> = {
  elo: 'Elo',
  poisson: 'Poisson',
  dixon_coles: 'Dixon-Coles',
  logistic: 'Logistic Reg.',
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  neural_network: 'Neural Net',
  ensemble: 'Ensemble',
};

export default function ModelPerformancePage() {
  const [models, setModels] = useState<ModelPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('model_performance')
        .select('*')
        .order('weight', { ascending: false });
      setModels(data ?? []);
      setLoading(false);
    };
    load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const chartData = models
    .filter(m => m.model_name !== 'ensemble')
    .map(m => ({
      name: MODEL_LABELS[m.model_name] ?? m.model_name,
      accuracy: Number(m.accuracy),
      weight: Number(m.weight) * 100,
    }));

  const radarData = models
    .filter(m => m.model_name !== 'ensemble' && m.total_predictions > 0)
    .map(m => ({
      model: MODEL_LABELS[m.model_name] ?? m.model_name,
      precision: Number(m.precision ?? 0),
      recall: Number(m.recall ?? 0),
      f1: Number(m.f1_score ?? 0),
    }));

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
        <Brain className="text-blue-400" size={24} />
        <h1 className="text-2xl font-bold text-white">Rendimiento de Modelos</h1>
      </div>
      <p className="text-sm text-gray-400 -mt-4">Métricas de cada modelo de predicción y sus pesos en el ensemble.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-blue-400" />
            <span className="text-xs text-gray-400">Modelos activos</span>
          </div>
          <p className="text-2xl font-bold text-white">{models.filter(m => m.model_name !== 'ensemble').length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-green-400" />
            <span className="text-xs text-gray-400">Predicciones totales</span>
          </div>
          <p className="text-2xl font-bold text-white">{models.reduce((s, m) => s + m.total_predictions, 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Award size={16} className="text-yellow-400" />
            <span className="text-xs text-gray-400">Aciertos</span>
          </div>
          <p className="text-2xl font-bold text-white">{models.reduce((s, m) => s + m.correct_predictions, 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-purple-400" />
            <span className="text-xs text-gray-400">Accuracy promedio</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {models.length > 0
              ? `${(models.reduce((s, m) => s + Number(m.accuracy), 0) / models.length).toFixed(1)}%`
              : '—'}
          </p>
        </div>
      </div>

      {/* Accuracy chart */}
      {chartData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Accuracy y pesos por modelo</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Bar dataKey="accuracy" fill="#171717" name="Accuracy %" />
              <Bar dataKey="weight" fill="#c7ff00" name="Peso %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Radar chart */}
      {radarData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Precision / Recall / F1</h2>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="model" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Radar name="Precision" dataKey="precision" stroke="#171717" fill="#171717" fillOpacity={0.25} />
              <Radar name="Recall" dataKey="recall" stroke="#c7ff00" fill="#c7ff00" fillOpacity={0.25} />
              <Radar name="F1" dataKey="f1" stroke="#737373" fill="#737373" fillOpacity={0.2} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Detalle por modelo</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left px-4 py-3 font-medium">Modelo</th>
                <th className="text-right px-4 py-3 font-medium">Predicciones</th>
                <th className="text-right px-4 py-3 font-medium">Aciertos</th>
                <th className="text-right px-4 py-3 font-medium">Accuracy</th>
                <th className="text-right px-4 py-3 font-medium">Brier</th>
                <th className="text-right px-4 py-3 font-medium">Log Loss</th>
                <th className="text-right px-4 py-3 font-medium">Calibration</th>
                <th className="text-right px-4 py-3 font-medium">Peso</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium text-white">{MODEL_LABELS[m.model_name] ?? m.model_name}</td>
                  <td className="text-right px-4 py-3 text-gray-400">{m.total_predictions}</td>
                  <td className="text-right px-4 py-3 text-gray-400">{m.correct_predictions}</td>
                  <td className="text-right px-4 py-3 text-white font-semibold">{Number(m.accuracy).toFixed(1)}%</td>
                  <td className="text-right px-4 py-3 text-gray-400">{m.brier_score != null ? Number(m.brier_score).toFixed(3) : '—'}</td>
                  <td className="text-right px-4 py-3 text-gray-400">{m.log_loss != null ? Number(m.log_loss).toFixed(3) : '—'}</td>
                  <td className="text-right px-4 py-3 text-gray-400">{m.calibration_error != null ? Number(m.calibration_error).toFixed(3) : '—'}</td>
                  <td className="text-right px-4 py-3">
                    <span className="text-neutral-900 font-semibold">{(Number(m.weight) * 100).toFixed(0)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-[#c7ff00]/20 rounded-lg border border-[#c7ff00]/50">
        <p className="text-[11px] text-neutral-700">
          Las métricas se actualizan automáticamente cada cinco minutos después de finalizar partidos. Si todavía no hay partidos evaluados, los modelos aparecerán cuando el primer resultado sea procesado.
        </p>
      </div>
    </div>
  );
}
