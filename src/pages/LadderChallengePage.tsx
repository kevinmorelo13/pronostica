import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, XCircle, Clock, Flame, Target,
  TrendingUp, TrendingDown, Wallet, Trophy, Info, RefreshCw, Calendar,
} from 'lucide-react';
import { supabase, type LadderEntry, type Prediction } from '@/lib/supabase';
import { getTodayBogota, toLocaleDateString } from '@/lib/utils';

const INITIAL_BALANCE_KEY = 'ladder_initial_balance';
const DEFAULT_INITIAL_BALANCE = 100000;
const MAX_ODDS = 1.50;
const BOOKMAKER_MARGIN = 0.06;
const SEARCH_DAYS = 3;

type MarketCandidate = {
  predictionId: string;
  matchId: string;
  market: string;
  label: string;
  probability: number;
  odds: number;
  matchDate: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
};

function estimatedOdds(probability: number): number {
  const fairOdds = 100 / probability;
  const adjusted = fairOdds / (1 + BOOKMAKER_MARGIN);
  return Math.max(1.01, Number(adjusted.toFixed(2)));
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function statusIcon(status: LadderEntry['status']) {
  switch (status) {
    case 'won': return <CheckCircle2 size={16} className="text-[#c7ff00]" />;
    case 'lost': return <XCircle size={16} className="text-red-500" />;
    case 'void': return <Clock size={16} className="text-neutral-400" />;
    default: return <Clock size={16} className="text-amber-500" />;
  }
}

function statusLabel(status: LadderEntry['status']): string {
  const map: Record<string, string> = {
    pending: 'Pendiente',
    won: 'Ganada',
    lost: 'Perdida',
    void: 'Anulada',
  };
  return map[status] ?? status;
}

function marketColor(market: string): string {
  const map: Record<string, string> = {
    '1X2': 'bg-blue-100 text-blue-700',
    'Doble oportunidad': 'bg-green-100 text-green-700',
    'Goles': 'bg-purple-100 text-purple-700',
    'Corners': 'bg-orange-100 text-orange-700',
    'Tarjetas': 'bg-yellow-100 text-yellow-700',
    'Disparos': 'bg-teal-100 text-teal-700',
    'Disparos a puerta': 'bg-cyan-100 text-cyan-700',
    'Resultado': 'bg-pink-100 text-pink-700',
  };
  return map[market] ?? 'bg-neutral-100 text-neutral-700';
}

export default function LadderChallengePage() {
  const [entries, setEntries] = useState<LadderEntry[]>([]);
  const [candidates, setCandidates] = useState<MarketCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialBalance, setInitialBalance] = useState<number>(DEFAULT_INITIAL_BALANCE);
  const [showConfig, setShowConfig] = useState(false);
  const [tempBalance, setTempBalance] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<string>('all');

  const currentBalance = useMemo(() => {
    if (entries.length === 0) return initialBalance;
    const resolved = entries.filter((e) => e.status === 'won' || e.status === 'lost');
    if (resolved.length === 0) return initialBalance;
    const last = resolved[resolved.length - 1];
    return last.balance_after ?? initialBalance;
  }, [entries, initialBalance]);

  const nextStep = useMemo(() => {
    if (entries.length === 0) return 1;
    return Math.max(...entries.map((e) => e.step)) + 1;
  }, [entries]);

  const activeEntry = useMemo(
    () => entries.find((e) => e.status === 'pending'),
    [entries],
  );

  const stats = useMemo(() => {
    const won = entries.filter((e) => e.status === 'won').length;
    const lost = entries.filter((e) => e.status === 'lost').length;
    const total = won + lost;
    const winRate = total > 0 ? (won / total) * 100 : 0;
    const peakBalance = entries.reduce((max, e) => {
      if (e.status === 'won' && e.balance_after != null) return Math.max(max, e.balance_after);
      return max;
    }, initialBalance);
    return { won, lost, total, winRate, peakBalance };
  }, [entries, initialBalance]);

  const loadAll = useCallback(async () => {
    setLoading(true);

    const today = getTodayBogota();
    const startDate = `${today}T00:00:00.000Z`;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + SEARCH_DAYS);
    const endDate = `${futureDate.toISOString().slice(0, 10)}T23:59:59.999Z`;

    const [entriesRes, predsRes] = await Promise.all([
      supabase.from('ladder_entries').select('*').order('step', { ascending: true }),
      supabase
        .from('predictions')
        .select(`
          id, match_id, best_bet, best_bet_probability, best_bet_market,
          home_probability, draw_probability, away_probability,
          over15_probability, over25_probability, under25_probability,
          over35_probability, btts_probability, additional_markets,
          matches!inner(
            match_date, status,
            league:leagues(name),
            home_team:teams!matches_home_team_id_fkey(short_name, name),
            away_team:teams!matches_away_team_id_fkey(short_name, name)
          )
        `)
        .gte('matches.match_date', startDate)
        .lte('matches.match_date', endDate)
        .in('matches.status', ['scheduled', 'live', 'halftime'])
        .order('matches.match_date', { ascending: true }),
    ]);

    setEntries((entriesRes.data ?? []) as unknown as LadderEntry[]);

    // Build candidates from ALL markets, not just best_bet
    const allCandidates: MarketCandidate[] = [];
    for (const pred of (predsRes.data ?? []) as any[]) {
      const match = pred.matches;
      if (!match) continue;
      const homeName = match.home_team?.short_name ?? match.home_team?.name ?? 'Local';
      const awayName = match.away_team?.short_name ?? match.away_team?.name ?? 'Visitante';
      const leagueName = match.league?.name ?? '';
      const matchDate = match.match_date;

      // 1X2
      const markets: Array<{ market: string; label: string; probability: number }> = [
        { market: '1X2', label: `Victoria ${homeName}`, probability: pred.home_probability },
        { market: '1X2', label: `Victoria ${awayName}`, probability: pred.away_probability },
        { market: '1X2', label: 'Empate', probability: pred.draw_probability },
      ];

      // Doble oportunidad
      const dc1X = pred.home_probability + pred.draw_probability;
      const dcX2 = pred.draw_probability + pred.away_probability;
      const dc12 = pred.home_probability + pred.away_probability;
      markets.push(
        { market: 'Doble oportunidad', label: `1X - ${homeName} o Empate`, probability: dc1X },
        { market: 'Doble oportunidad', label: `X2 - Empate o ${awayName}`, probability: dcX2 },
        { market: 'Doble oportunidad', label: `12 - ${homeName} o ${awayName}`, probability: dc12 },
      );

      // Goles
      if (pred.over15_probability != null) {
        markets.push({ market: 'Goles', label: 'Mas de 1.5 goles', probability: pred.over15_probability });
        markets.push({ market: 'Goles', label: 'Menos de 1.5 goles', probability: 100 - pred.over15_probability });
      }
      if (pred.over25_probability != null) {
        markets.push({ market: 'Goles', label: 'Mas de 2.5 goles', probability: pred.over25_probability });
        markets.push({ market: 'Goles', label: 'Menos de 2.5 goles', probability: pred.under25_probability ?? 100 - pred.over25_probability });
      }
      if (pred.over35_probability != null) {
        markets.push({ market: 'Goles', label: 'Mas de 3.5 goles', probability: pred.over35_probability });
      }
      if (pred.btts_probability != null) {
        markets.push({ market: 'Goles', label: 'Ambos equipos marcan', probability: pred.btts_probability });
        markets.push({ market: 'Goles', label: 'Ambos no marcan', probability: 100 - pred.btts_probability });
      }

      // Additional markets from JSON
      if (pred.additional_markets && typeof pred.additional_markets === 'object') {
        for (const [marketName, options] of Object.entries(pred.additional_markets)) {
          if (marketName === 'Goles') continue; // already covered above
          for (const [optionLabel, prob] of Object.entries(options as Record<string, number>)) {
            markets.push({ market: marketName, label: optionLabel, probability: prob });
          }
        }
      }

      for (const m of markets) {
        if (m.probability == null || m.probability <= 0) continue;
        const odds = estimatedOdds(m.probability);
        if (odds > MAX_ODDS || odds <= 1.0) continue;
        allCandidates.push({
          predictionId: pred.id,
          matchId: pred.match_id,
          market: m.market,
          label: m.label,
          probability: m.probability,
          odds,
          matchDate,
          leagueName,
          homeTeam: homeName,
          awayTeam: awayName,
        });
      }
    }

    // Sort by odds descending (closest to 1.50 = highest probability = safest)
    allCandidates.sort((a, b) => b.odds - a.odds);
    setCandidates(allCandidates);
    setLoading(false);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(INITIAL_BALANCE_KEY);
    if (stored) setInitialBalance(Number(stored));
    loadAll();
  }, [loadAll]);

  const availableMarkets = useMemo(() => {
    const set = new Set(candidates.map((c) => c.market));
    return Array.from(set).sort();
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    if (selectedMarket === 'all') return candidates;
    return candidates.filter((c) => c.market === selectedMarket);
  }, [candidates, selectedMarket]);

  const placeBet = async (row: MarketCandidate) => {
    if (activeEntry) return;
    const stake = currentBalance;
    const potentialReturn = stake * row.odds;

    const { error } = await supabase.from('ladder_entries').insert({
      step: nextStep,
      match_id: row.matchId,
      selection: row.label,
      odds: row.odds,
      stake,
      status: 'pending',
      match_date: row.matchDate.slice(0, 10),
      notes: `${row.market} - ${row.homeTeam} vs ${row.awayTeam} - ${toLocaleDateString(row.matchDate, 'dd MMM')}`,
    });

    if (!error) {
      await loadAll();
    }
  };

  const resolveBet = async (entry: LadderEntry, status: 'won' | 'lost' | 'void') => {
    let returnAmount: number | null = null;
    let profit: number | null = null;
    let balanceAfter: number | null = null;

    if (status === 'won') {
      returnAmount = entry.stake * entry.odds;
      profit = returnAmount - entry.stake;
      balanceAfter = returnAmount;
    } else if (status === 'lost') {
      returnAmount = 0;
      profit = -entry.stake;
      balanceAfter = 0;
    } else {
      returnAmount = entry.stake;
      profit = 0;
      balanceAfter = entry.stake;
    }

    await supabase
      .from('ladder_entries')
      .update({
        status,
        return_amount: returnAmount,
        profit,
        balance_after: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id);

    await loadAll();
  };

  const deleteEntry = async (entry: LadderEntry) => {
    await supabase.from('ladder_entries').delete().eq('id', entry.id);
    await loadAll();
  };

  const saveInitialBalance = () => {
    const value = Number(tempBalance);
    if (value > 0) {
      setInitialBalance(value);
      localStorage.setItem(INITIAL_BALANCE_KEY, String(value));
    }
    setShowConfig(false);
  };

  const profitTotal = currentBalance - initialBalance;
  const profitPercent = initialBalance > 0 ? (profitTotal / initialBalance) * 100 : 0;

  return (
    <div className="min-h-full bg-[#f2f2f0] p-4 text-[#171717] lg:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#c7ff00] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]">
              <Flame size={13} /> Reto escalera
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Cuotas super seguras</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-700">
              Un pronostico diario con cuota maxima {MAX_ODDS.toFixed(2)}. El saldo completo se reinvierte en cada paso. Buscamos en todos los mercados disponibles de los proximos {SEARCH_DAYS} dias.
            </p>
          </div>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-neutral-900"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-[#171717] p-6 text-white">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">
              <Wallet size={14} /> Saldo actual
            </div>
            <p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatCOP(currentBalance)}</p>
            <p className="mt-2 text-xs text-neutral-400">Paso {nextStep} de la escalera</p>
          </div>

          <div className={`rounded-2xl border p-6 ${profitTotal >= 0 ? 'border-[#c7ff00]/30 bg-[#c7ff00]/10' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">
              {profitTotal >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} Ganancia / Perdida
            </div>
            <p className={`mt-3 text-3xl font-black tracking-[-0.04em] ${profitTotal >= 0 ? 'text-neutral-900' : 'text-red-600'}`}>
              {profitTotal >= 0 ? '+' : ''}{formatCOP(profitTotal)}
            </p>
            <p className={`mt-2 text-xs ${profitTotal >= 0 ? 'text-neutral-600' : 'text-red-500'}`}>
              {profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(1)}% del saldo inicial
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-300 bg-white p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">
              <Target size={14} /> Aciertos
            </div>
            <p className="mt-3 text-3xl font-black tracking-[-0.04em]">{stats.won}<span className="text-lg text-neutral-400">/{stats.total}</span></p>
            <p className="mt-2 text-xs text-neutral-600">{stats.winRate.toFixed(0)}% de acierto</p>
          </div>

          <div className="rounded-2xl border border-neutral-300 bg-white p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-600">
              <Trophy size={14} /> Saldo pico
            </div>
            <p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatCOP(stats.peakBalance)}</p>
            <p className="mt-2 text-xs text-neutral-600">Mayor saldo alcanzado</p>
          </div>
        </section>

        {activeEntry && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200 text-amber-800">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Apuesta en curso - Paso {activeEntry.step}</p>
                  <p className="mt-1 text-lg font-black tracking-tight">{activeEntry.selection}</p>
                  <p className="mt-1 text-sm text-neutral-700">
                    Cuota {activeEntry.odds.toFixed(2)} - Apostado {formatCOP(activeEntry.stake)} - Retorno estimado {formatCOP(activeEntry.stake * activeEntry.odds)}
                  </p>
                  {activeEntry.notes && <p className="mt-1 text-xs text-neutral-500">{activeEntry.notes}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => resolveBet(activeEntry, 'won')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#c7ff00] px-4 py-2.5 text-sm font-bold text-neutral-900 transition hover:bg-[#d8ff4c]"
                >
                  <CheckCircle2 size={16} /> Ganada
                </button>
                <button
                  onClick={() => resolveBet(activeEntry, 'lost')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-600"
                >
                  <XCircle size={16} /> Perdida
                </button>
                <button
                  onClick={() => resolveBet(activeEntry, 'void')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 transition hover:border-neutral-900"
                >
                  Anular
                </button>
              </div>
            </div>
          </section>
        )}

        {!activeEntry && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-neutral-800" />
                <h2 className="text-lg font-bold">Opciones con cuota menor o igual a {MAX_ODDS.toFixed(2)}</h2>
                {!loading && (
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-neutral-700">{filteredCandidates.length}</span>
                )}
              </div>
              <button
                onClick={() => { setTempBalance(String(initialBalance)); setShowConfig(!showConfig); }}
                className="text-xs font-bold text-neutral-600 hover:text-neutral-900"
              >
                Configurar saldo
              </button>
            </div>

            {showConfig && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-300 bg-white p-4">
                <label className="text-sm font-semibold">Saldo inicial:</label>
                <input
                  type="number"
                  value={tempBalance}
                  onChange={(e) => setTempBalance(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold focus:border-neutral-900 focus:outline-none"
                  placeholder="100000"
                />
                <button
                  onClick={saveInitialBalance}
                  className="rounded-full bg-[#c7ff00] px-4 py-2 text-sm font-bold text-neutral-900 transition hover:bg-[#d8ff4c]"
                >
                  Guardar
                </button>
                <span className="text-xs text-neutral-500">Solo aplica si la escalera no ha empezado</span>
              </div>
            )}

            {/* Market filter pills */}
            {!loading && availableMarkets.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedMarket('all')}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${selectedMarket === 'all' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'}`}
                >
                  Todos ({candidates.length})
                </button>
                {availableMarkets.map((m) => {
                  const count = candidates.filter((c) => c.market === m).length;
                  return (
                    <button
                      key={m}
                      onClick={() => setSelectedMarket(m)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${selectedMarket === m ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'}`}
                    >
                      {m} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-200" />
                ))}
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="rounded-2xl border border-neutral-300 bg-white p-8 text-center">
                <Target size={40} className="mx-auto mb-3 text-neutral-400" />
                <p className="text-sm font-semibold text-neutral-700">No hay opciones con cuota menor o igual a {MAX_ODDS.toFixed(2)} en los proximos {SEARCH_DAYS} dias.</p>
                <p className="mt-1 text-xs text-neutral-500">Vuelve mas tarde o intenta sincronizar los partidos.</p>
                <Link to="/predicciones" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-neutral-900 hover:underline">
                  Ver todos los pronosticos <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredCandidates.slice(0, 30).map((row, idx) => {
                  const potentialReturn = currentBalance * row.odds;
                  return (
                    <button
                      key={`${row.predictionId}-${row.label}-${idx}`}
                      onClick={() => placeBet(row)}
                      className="flex items-center gap-4 rounded-2xl border border-neutral-300 bg-white p-4 text-left transition hover:border-neutral-900 hover:shadow-md"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c7ff00] text-sm font-black text-neutral-900">
                        {row.odds.toFixed(2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${marketColor(row.market)}`}>{row.market}</span>
                          <p className="truncate text-sm font-bold tracking-tight">{row.label}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-neutral-600">
                          {row.homeTeam} vs {row.awayTeam} - {row.leagueName}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          <Calendar size={10} className="mr-1 inline" />
                          {toLocaleDateString(row.matchDate, "EEE dd MMM")} - Prob. {row.probability.toFixed(0)}% - Retorno {formatCOP(potentialReturn)}
                        </p>
                      </div>
                      <ArrowRight size={18} className="shrink-0 text-neutral-400" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-neutral-800" />
            <h2 className="text-lg font-bold">Historial de apuestas</h2>
            {entries.length > 0 && (
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-neutral-700">{entries.length}</span>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="rounded-2xl border border-neutral-300 bg-white p-8 text-center">
              <Info size={36} className="mx-auto mb-3 text-neutral-400" />
              <p className="text-sm font-semibold text-neutral-700">Aun no has empezado la escalera.</p>
              <p className="mt-1 text-xs text-neutral-500">Selecciona una opcion de arriba para dar el primer paso.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-neutral-300 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-bold uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-4 py-3">Paso</th>
                    <th className="px-4 py-3">Seleccion</th>
                    <th className="px-4 py-3 text-right">Cuota</th>
                    <th className="px-4 py-3 text-right">Apostado</th>
                    <th className="px-4 py-3 text-right">Resultado</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {entries.slice().reverse().map((entry) => (
                    <tr key={entry.id} className="transition hover:bg-neutral-50">
                      <td className="px-4 py-3 font-black">{entry.step}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold tracking-tight">{entry.selection}</p>
                        {entry.notes && <p className="text-[11px] text-neutral-500">{entry.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{entry.odds.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{formatCOP(entry.stake)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${
                        entry.profit != null && entry.profit > 0 ? 'text-[#c7ff00]' :
                        entry.profit != null && entry.profit < 0 ? 'text-red-500' : 'text-neutral-500'
                      }`}>
                        {entry.return_amount != null ? formatCOP(entry.return_amount) : '--'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {entry.balance_after != null ? formatCOP(entry.balance_after) : '--'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {statusIcon(entry.status)}
                          <span className="text-xs font-semibold">{statusLabel(entry.status)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {entry.status === 'pending' && (
                          <button
                            onClick={() => deleteEntry(entry)}
                            className="text-xs font-bold text-neutral-400 transition hover:text-red-500"
                          >
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-neutral-300 bg-white p-4">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0 text-neutral-500" />
            <p className="text-xs leading-5 text-neutral-600">
              Las cuotas incluyen un margen aproximado del 6%, similar al de casas de apuestas. Los mercados de corners, tarjetas y disparos son estimaciones basadas en promedios del equipo. Los pronosticos son estimaciones estadisticas y no garantizan resultados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
