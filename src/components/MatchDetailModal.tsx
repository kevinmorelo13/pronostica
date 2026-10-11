import { type Match, type Prediction, type ModelAgreement, type ModelPrediction } from '@/lib/supabase';
import {
  confidenceBg, confidenceLabel, toLocaleTimeString,
  toLocaleDateString, statusLabel, statusColor, getOutcomeLabel, getFormChar,
} from '@/lib/utils';
import { estimatedOdds } from '@/lib/betting';
import { X, MapPin, User, Clock, Zap, TrendingUp, Info, Ban, Layers, Gauge, Brain, Target } from 'lucide-react';
import EntityLogo from '@/components/EntityLogo';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  match: Match;
  prediction: Prediction | null;
  homeStats: { form: string | null; avg_goals_scored: number; avg_goals_conceded: number } | null;
  awayStats: { form: string | null; avg_goals_scored: number; avg_goals_conceded: number } | null;
  h2h: Array<{ home_score: number; away_score: number; winner: string; competition: string | null; match_date: string }>;
  onClose: () => void;
}

function FormBadges({ form }: { form?: string | null }) {
  if (!form) return <span className="text-xs text-neutral-500">Sin datos</span>;
  const chars = form.slice(-5).split('');
  return (
    <div className="flex gap-1">
      {chars.map((c, i) => {
        const { char, color } = getFormChar(c);
        return (
          <span key={i} className={`w-6 h-6 ${color} rounded text-neutral-900 text-[10px] font-bold flex items-center justify-center`}>
            {char}
          </span>
        );
      })}
    </div>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-600">{label}</span>
        <span className="font-semibold text-neutral-900">{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function parseAgreement(pred: Prediction): ModelAgreement | null {
  if (!pred.model_agreement) return null;
  if (typeof pred.model_agreement === 'string') {
    try { return JSON.parse(pred.model_agreement); } catch { return null; }
  }
  return pred.model_agreement as ModelAgreement;
}

function parsePatterns(pred: Prediction): string[] {
  if (!pred.patterns) return [];
  if (Array.isArray(pred.patterns)) return pred.patterns as string[];
  try { return JSON.parse(pred.patterns as string); } catch { return []; }
}

function parseScoreProbs(pred: Prediction): Record<string, number> {
  if (!pred.score_probabilities) return {};
  if (typeof pred.score_probabilities === 'string') {
    try { return JSON.parse(pred.score_probabilities); } catch { return {}; }
  }
  return pred.score_probabilities as Record<string, number>;
}

function parseAdditionalMarkets(pred: Prediction): Record<string, Record<string, number>> {
  if (!pred.additional_markets) return {};
  if (typeof pred.additional_markets === 'string') {
    try { return JSON.parse(pred.additional_markets); } catch { return {}; }
  }
  return pred.additional_markets as Record<string, Record<string, number>>;
}

const MODEL_LABELS: Record<string, string> = {
  elo: 'Elo',
  poisson: 'Poisson',
  dixon_coles: 'Dixon-Coles',
  logistic: 'Logistic',
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  neural_network: 'Neural Network',
};

const PICK_COLORS: Record<string, string> = {
  home: 'text-neutral-900',
  away: 'text-neutral-700',
  draw: 'text-neutral-600',
};

const PICK_LABELS: Record<string, string> = {
  home: 'Local',
  away: 'Visitante',
  draw: 'Empate',
};

export default function MatchDetailModal({ match, prediction, homeStats, awayStats, h2h, onClose }: Props) {
  const home = match.home_team;
  const away = match.away_team;
  const isLive = match.status === 'live' || match.status === 'halftime';
  const isFinished = match.status === 'finished';
  const noSignal = prediction && prediction.has_signal === false;
  const agreement = prediction ? parseAgreement(prediction) : null;
  const patterns = prediction ? parsePatterns(prediction) : [];
  const scoreProbs = prediction ? parseScoreProbs(prediction) : {};
  const additionalMarkets = prediction ? parseAdditionalMarkets(prediction) : {};
  const [modelPreds, setModelPreds] = useState<ModelPrediction[]>([]);

  useEffect(() => {
    if (prediction && !noSignal) {
      supabase
        .from('model_predictions')
        .select('*')
        .eq('match_id', match.id)
        .order('weight', { ascending: false })
        .then(({ data }) => setModelPreds(data ?? []));
    }
  }, [match.id, prediction, noSignal]);

  const sortedScores = Object.entries(scoreProbs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border border-black/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <EntityLogo src={match.league?.logo} name={match.league?.name ?? 'Liga'} size="sm" />
            <span className="text-sm font-medium text-neutral-700">{match.league?.name}</span>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Match header */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-6 mb-3">
              <div className="flex flex-col items-center gap-2 flex-1">
                <EntityLogo src={home?.logo} name={home?.name ?? 'Local'} size="lg" />
                <span className="text-sm font-bold text-neutral-900 text-center">{home?.name ?? 'Local'}</span>
              </div>
              <div className="text-center flex-shrink-0">
                {isLive || isFinished ? (
                  <div className="flex items-center gap-2">
                    <span className={`text-4xl font-black ${isLive ? 'text-red-500' : 'text-neutral-900'}`}>{match.home_score ?? 0}</span>
                    <span className="text-neutral-400 text-2xl">-</span>
                    <span className={`text-4xl font-black ${isLive ? 'text-red-500' : 'text-neutral-900'}`}>{match.away_score ?? 0}</span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-neutral-600">VS</div>
                )}
                <span className={`text-xs font-semibold mt-1 block ${statusColor(match.status)}`}>
                  {isLive && match.minute ? `${match.minute}'` : statusLabel(match.status)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 flex-1">
                <EntityLogo src={away?.logo} name={away?.name ?? 'Visitante'} size="lg" />
                <span className="text-sm font-bold text-neutral-900 text-center">{away?.name ?? 'Visitante'}</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-neutral-600 mt-2">
              <span className="flex items-center gap-1"><Clock size={12} />{toLocaleDateString(match.match_date)} · {toLocaleTimeString(match.match_date)}</span>
              {match.venue && <span className="flex items-center gap-1"><MapPin size={12} />{match.venue}</span>}
              {match.referee && <span className="flex items-center gap-1"><User size={12} />{match.referee}</span>}
            </div>
          </div>

          {/* Elo display */}
          {prediction && (prediction.elo_home != null || prediction.elo_away != null) && (
            <div className="flex items-center justify-center gap-6 bg-neutral-100/40 rounded-lg py-2 px-4">
              <div className="text-center">
                <span className="text-[10px] text-neutral-500 block">Elo Local</span>
                <span className="text-lg font-bold text-neutral-900">{prediction.elo_home?.toFixed(0) ?? '—'}</span>
              </div>
              <span className="text-neutral-400 text-sm">vs</span>
              <div className="text-center">
                <span className="text-[10px] text-neutral-500 block">Elo Visitante</span>
                <span className="text-lg font-bold text-neutral-900">{prediction.elo_away?.toFixed(0) ?? '—'}</span>
              </div>
            </div>
          )}

          {/* SIN SEÑAL */}
          {prediction && noSignal ? (
            <div className="bg-neutral-100 rounded-xl p-6 border border-black/10 text-center">
              <Ban size={32} className="text-neutral-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-neutral-700 tracking-tight">SIN SEÑAL</p>
              <p className="text-sm text-neutral-600 mt-1">Datos insuficientes para generar una señal confiable.</p>
            </div>
          ) : prediction ? (
            <div className="bg-neutral-50 rounded-xl p-4 border border-black/10">
              {/* BEST BET */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-neutral-700" />
                  <span className="font-semibold text-neutral-800 text-sm tracking-tight">Pronóstico principal</span>
                </div>
                <div className="flex items-center gap-2">
                  {prediction.confidence_score != null && prediction.confidence_score > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-neutral-600">
                      <Gauge size={11} />
                      {prediction.confidence_score}/100
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${confidenceBg(prediction.confidence)}`}>
                    {confidenceLabel(prediction.confidence)}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-black/10 mb-4">
                <p className="text-[10px] text-neutral-500 uppercase tracking-tight mb-1">Mejor pronóstico</p>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-neutral-900 tracking-tight">
                    {prediction.best_bet ?? getOutcomeLabel(prediction, home?.name ?? 'Local', away?.name ?? 'Visitante')}
                  </p>
                  {prediction.best_bet_probability != null && (
                    <div className="text-right">
                      <span className="block text-3xl font-bold text-neutral-900">
                        {prediction.best_bet_probability.toFixed(0)}%
                      </span>
                      <span className="text-xs font-bold text-neutral-600">Cuota {estimatedOdds(prediction.best_bet_probability).toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {prediction.best_bet_market && (
                  <p className="text-xs text-neutral-600 mt-1">Mercado: {prediction.best_bet_market} · Modelo oficial: {prediction.model_version?.replace('official_', '') ?? 'No disponible'}</p>
                )}
                {prediction.predicted_home_score !== null && prediction.predicted_away_score !== null && (
                  <p className="text-sm text-neutral-600 mt-2">
                    Marcador estimado: <span className="text-neutral-900 font-semibold">{prediction.predicted_home_score} - {prediction.predicted_away_score}</span>
                  </p>
                )}
                {isFinished && (
                  <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${prediction.prediction_result === 'correct' ? 'bg-[#c7ff00]/25 text-neutral-900' : prediction.prediction_result === 'incorrect' ? 'bg-red-50 text-red-600' : 'bg-neutral-100 text-neutral-600'}`}>
                    {prediction.prediction_result === 'correct' ? 'GANADA' : prediction.prediction_result === 'incorrect' ? 'PERDIDA' : 'PENDIENTE'}
                    {' · '}Apuesta: {prediction.best_bet ?? 'Sin selección'}
                    {prediction.best_bet_probability != null ? ` · Cuota ${estimatedOdds(prediction.best_bet_probability).toFixed(2)}` : ''}
                    {prediction.actual_outcome ? ` · ${prediction.actual_outcome}` : ''}
                  </p>
                )}
              </div>

              {/* Other markets — compact grid */}
              <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Otros mercados</p>
              <div className="space-y-3 mb-4">
                <ProbBar label={`Victoria ${home?.short_name ?? 'Local'}`} value={prediction.home_probability} color="bg-neutral-800" />
                <ProbBar label="Empate" value={prediction.draw_probability} color="bg-neutral-500" />
                <ProbBar label={`Victoria ${away?.short_name ?? 'Visitante'}`} value={prediction.away_probability} color="bg-neutral-400" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {prediction.over15_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Más de 1.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.over15_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.over25_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Más de 2.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.over25_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.over35_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Más de 3.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.over35_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.under25_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Menos de 2.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.under25_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.btts_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Ambos marcan</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.btts_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.over25_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Más de 2.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.over25_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.over35_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Más de 3.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.over35_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.under25_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Menos de 2.5</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.under25_probability?.toFixed(0)}%</p>
                  </div>
                )}
                {prediction.btts_probability != null && (
                  <div className="bg-neutral-100 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-neutral-600">Ambos marcan</p>
                    <p className="text-lg font-bold text-neutral-900">{prediction.btts_probability?.toFixed(0)}%</p>
                  </div>
                )}
              </div>

              {/* Additional markets */}
              {Object.keys(additionalMarkets).length > 0 && (
                <div className="mt-5">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">
                    <Layers size={12} /> Todos los mercados disponibles
                  </p>
                  <div className="space-y-3">
                    {Object.entries(additionalMarkets).map(([marketName, selections]) => (
                      <div key={marketName} className="rounded-xl border border-black/10 bg-white p-3">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500">{marketName}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {Object.entries(selections).map(([selection, probability]) => (
                            <div key={selection} className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2">
                              <span className="pr-2 text-xs font-medium text-neutral-800">{selection}</span>
                              <span className="text-sm font-black text-neutral-900">{Number(probability).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Score probabilities */}
              {sortedScores.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Target size={12} /> Marcadores probables
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {sortedScores.map(([score, prob]) => (
                      <div key={score} className="bg-neutral-100 rounded px-2 py-1.5 flex items-center justify-between">
                        <span className="text-sm font-bold text-neutral-900">{score}</span>
                        <span className="text-xs text-neutral-600">{prob.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model breakdown */}
              {modelPreds.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Brain size={12} /> Modelos individuales
                  </p>
                  <div className="space-y-1.5">
                    {modelPreds.map((mp) => {
                      const max = Math.max(mp.home_probability, mp.draw_probability, mp.away_probability);
                      const pick = max === mp.home_probability ? 'home' : max === mp.away_probability ? 'away' : 'draw';
                      return (
                        <div key={mp.id} className="flex items-center justify-between bg-neutral-100 rounded px-3 py-2">
                          <span className="text-xs font-medium text-neutral-800">{MODEL_LABELS[mp.model_name] ?? mp.model_name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-neutral-600">{mp.home_probability.toFixed(0)}/{mp.draw_probability.toFixed(0)}/{mp.away_probability.toFixed(0)}</span>
                            <span className={`text-xs font-bold ${PICK_COLORS[pick]}`}>{PICK_LABELS[pick]}</span>
                            <span className="text-[10px] text-neutral-600 w-8 text-right">{(mp.weight * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Patterns */}
              {patterns.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <TrendingUp size={12} /> Patrones detectados
                  </p>
                  <div className="space-y-1.5">
                    {patterns.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 bg-blue-500/5 rounded px-3 py-2 border border-blue-500/10">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                        <span className="text-xs text-neutral-800">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {prediction.analysis && (
                <div className="mt-4 p-3 bg-neutral-100 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={13} className="text-neutral-600" />
                    <span className="text-xs font-semibold text-neutral-700">Análisis del modelo</span>
                  </div>
                  <p className="text-sm text-neutral-800 leading-relaxed tracking-tight">{prediction.analysis}</p>
                </div>
              )}

              <div className="mt-3 flex items-start gap-2 p-2 bg-neutral-100 rounded-lg border border-black/10">
                <Info size={12} className="text-neutral-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-neutral-600">Los pronósticos son estimaciones estadísticas y no garantizan resultados deportivos.</p>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-100 rounded-xl p-4 border border-black/10 text-center text-sm text-neutral-600">
              Sin datos suficientes para generar un pronóstico.
            </div>
          )}

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Forma reciente · {home?.short_name ?? 'Local'}</p>
              <FormBadges form={homeStats?.form ?? undefined} />
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Forma reciente · {away?.short_name ?? 'Visitante'}</p>
              <FormBadges form={awayStats?.form ?? undefined} />
            </div>
          </div>

          {/* H2H */}
          <div>
            <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-3">Historial H2H</p>
            {h2h.length === 0 ? (
              <div className="rounded-lg border border-black/10 bg-neutral-100 px-3 py-3 text-xs text-neutral-600">No hay enfrentamientos previos registrados para estos equipos.</div>
            ) : (
              <div className="space-y-2">
                {h2h.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-neutral-100 rounded-lg px-3 py-2">
                    <span className="text-xs text-neutral-700">{toLocaleDateString(r.match_date, 'dd/MM/yy')}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.winner === 'home' ? 'text-blue-700' : r.winner === 'away' ? 'text-red-600' : 'text-neutral-700'}`}>
                      {r.home_score} - {r.away_score}
                    </span>
                    <span className="text-xs text-neutral-700">{r.competition ?? ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
