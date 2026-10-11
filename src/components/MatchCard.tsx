import { type Match, type Prediction, type ModelAgreement } from '@/lib/supabase';
import {
  toLocaleTimeString, statusLabel, confidenceBg, confidenceLabel,
  getOutcomeLabel,
} from '@/lib/utils';
import { estimatedOdds } from '@/lib/betting';
import { ChevronRight, Clock, Zap, Ban, Gauge, Check, X } from 'lucide-react';
import EntityLogo from '@/components/EntityLogo';

interface Props {
  match: Match;
  onClick?: (match: Match) => void;
}

function parseAgreement(pred: Prediction): ModelAgreement | null {
  if (!pred.model_agreement) return null;
  if (typeof pred.model_agreement === 'string') {
    try { return JSON.parse(pred.model_agreement); } catch { return null; }
  }
  return pred.model_agreement as ModelAgreement;
}

export default function MatchCard({ match, onClick }: Props) {
  const home = match.home_team;
  const away = match.away_team;
  const pred = match.prediction;
  const isLive = match.status === 'live' || match.status === 'halftime';
  const isFinished = match.status === 'finished';
  const noSignal = pred && pred.has_signal === false;
  const topOutcome = pred && !noSignal
    ? getOutcomeLabel(pred, home?.short_name ?? home?.name ?? '', away?.short_name ?? away?.name ?? '')
    : null;

  return (
    <button
      onClick={() => onClick?.(match)}
      className="w-full rounded-2xl border border-black/10 bg-white p-4 text-left transition-all hover:border-black/30 hover:shadow-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <EntityLogo src={match.league?.logo} name={match.league?.name ?? 'Liga'} size="sm" />
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-700">
            {match.league?.name ?? ''} {match.round ? `· ${match.round}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1 text-xs font-bold text-red-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              {match.minute ? `${match.minute}'` : 'EN VIVO'}
            </span>
          ) : (
            <span className={`text-xs font-medium ${isFinished ? 'text-neutral-500' : 'text-neutral-700'}`}>
              {isFinished ? statusLabel(match.status) : (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {toLocaleTimeString(match.match_date)}
                </span>
              )}
            </span>
          )}
          <ChevronRight size={14} className="text-neutral-500" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2.5">
          <EntityLogo src={home?.logo} name={home?.name ?? 'Local'} />
          <span className="truncate text-sm font-bold tracking-tight text-neutral-900">
            {home?.short_name ?? home?.name ?? 'Local'}
          </span>
        </div>
        <div className="w-14 flex-shrink-0 text-center">
          {isLive || isFinished ? (
            <div className="flex items-center justify-center gap-1.5">
              <span className={`text-xl font-black ${isLive ? 'text-red-500' : 'text-neutral-900'}`}>
                {match.home_score ?? 0}
              </span>
              <span className="text-sm text-neutral-400">-</span>
              <span className={`text-xl font-black ${isLive ? 'text-red-500' : 'text-neutral-900'}`}>
                {match.away_score ?? 0}
              </span>
            </div>
          ) : (
            <span className="text-xs font-bold text-neutral-500">VS</span>
          )}
        </div>
        <div className="flex flex-1 items-center justify-end gap-2.5">
          <span className="truncate text-right text-sm font-bold tracking-tight text-neutral-900">
            {away?.short_name ?? away?.name ?? 'Visitante'}
          </span>
          <EntityLogo src={away?.logo} name={away?.name ?? 'Visitante'} />
        </div>
      </div>

      {pred && (
        <div className="mt-3 border-t border-black/10 pt-3">
          {noSignal ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <Ban size={14} className="text-neutral-500" />
              <span className="text-sm font-bold tracking-tight text-neutral-600">SIN SEÑAL</span>
              <span className="text-[10px] text-neutral-500">· Datos insuficientes</span>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap size={12} className="text-neutral-800" />
                  <span className="text-[11px] font-bold text-neutral-800">Pronóstico</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {pred.confidence_score != null && pred.confidence_score > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-neutral-600">
                      <Gauge size={10} />
                      {pred.confidence_score}/100
                    </span>
                  )}
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${confidenceBg(pred.confidence)}`}>
                    {confidenceLabel(pred.confidence)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-black/10 bg-neutral-100 px-3 py-2">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold tracking-tight text-neutral-900">{pred.best_bet ?? topOutcome}</span>
                  <span className="mt-1 block truncate text-[10px] text-neutral-600">
                    {pred.best_bet_probability != null ? `Cuota ${estimatedOdds(pred.best_bet_probability).toFixed(2)} · ` : ''}
                    Modelo: {pred.model_version?.replace('official_', '') ?? 'No disponible'}
                  </span>
                </div>
                <div className="ml-2 text-right">
                  {pred.best_bet_probability != null && <span className="block text-lg font-black text-neutral-900">{pred.best_bet_probability.toFixed(0)}%</span>}
                  {pred.best_bet_probability != null && (
                    <span className="text-[10px] font-bold text-neutral-600">{estimatedOdds(pred.best_bet_probability).toFixed(2)}</span>
                  )}
                </div>
              </div>
              {isFinished && (
                <div className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${pred.prediction_result === 'correct' ? 'border-[#c7ff00] bg-[#c7ff00]/20 text-neutral-900' : pred.prediction_result === 'incorrect' ? 'border-red-300 bg-red-50 text-red-600' : 'border-neutral-200 bg-neutral-50 text-neutral-600'}`}>
                  {pred.prediction_result === 'correct' ? <Check size={14} /> : pred.prediction_result === 'incorrect' ? <X size={14} /> : <Clock size={14} />}
                  {pred.prediction_result === 'correct' ? 'GANADA' : pred.prediction_result === 'incorrect' ? 'PERDIDA' : 'PENDIENTE'}
                  <span className="font-medium text-neutral-500">· {pred.best_bet ?? 'Sin selección'}{pred.actual_outcome ? ` · ${pred.actual_outcome}` : ''}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </button>
  );
}
