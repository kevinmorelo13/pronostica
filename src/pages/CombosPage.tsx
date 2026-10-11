import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, RefreshCw, ShieldCheck, Sparkles, Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getBogotaDateRange, getTodayBogota } from '@/lib/utils';

type ComboRow = {
  id: string;
  match_id: string;
  best_bet: string | null;
  best_bet_probability: number | null;
  confidence: string;
  match: {
    match_date: string;
    league: { name: string } | null;
    home_team: { short_name: string | null; name: string } | null;
    away_team: { short_name: string | null; name: string } | null;
  } | null;
};

type ComboSelection = ComboRow & { odds: number };
type ComboTicket = { selections: ComboSelection[]; product: number };

const BOOKMAKER_MARGIN = 0.06;

function estimatedOdds(probability: number): number {
  const fairOdds = 100 / probability;
  const adjusted = fairOdds / (1 + BOOKMAKER_MARGIN);
  return Math.max(1.05, Number(adjusted.toFixed(2)));
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00-05:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function ticketFromRows(rows: ComboRow[], excludedIds: Set<string>): ComboTicket {
  const selections = rows
    .filter((row) => !excludedIds.has(row.match_id) && row.best_bet && (row.best_bet_probability ?? 0) >= 50)
    .slice(0, 2)
    .map((row) => ({ ...row, odds: estimatedOdds(row.best_bet_probability ?? 0) }));

  return {
    selections,
    product: selections.reduce((product, selection) => product * selection.odds, 1),
  };
}

function matchDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

function TicketCard({ ticket, number }: { ticket: ComboTicket; number: number }) {
  return (
    <article className="rounded-3xl bg-[#171717] p-6 text-white shadow-xl sm:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-5">
        <div className="flex items-center gap-3">
          <Ticket className="text-[#c7ff00]" size={22} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-300">Ticket {number}</p>
            <p className="font-bold">Combinada recomendada</p>
          </div>
        </div>
        {ticket.selections.length > 0 && (
          <span className="rounded-full bg-[#c7ff00] px-3 py-1 text-sm font-black text-black">{ticket.product.toFixed(2)}</span>
        )}
      </div>
      <div className="divide-y divide-white/10">
        {ticket.selections.length === 0 ? (
          <p className="py-10 text-sm text-neutral-300">No hay dos pronósticos válidos disponibles para este ticket.</p>
        ) : ticket.selections.map((row) => {
          const match = row.match;
          return (
            <div key={row.id} className="flex items-center gap-3 py-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c7ff00] text-black"><Check size={16} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{row.best_bet}</p>
                <p className="mt-1 truncate text-xs text-neutral-300">
                  {match?.home_team?.short_name ?? match?.home_team?.name} vs {match?.away_team?.short_name ?? match?.away_team?.name}
                </p>
                <p className="mt-1 text-[11px] text-neutral-200">{match?.match_date ? matchDate(match.match_date) : 'Fecha pendiente'} · {match?.league?.name}</p>
              </div>
              <span className="text-sm font-bold text-[#c7ff00]">{row.odds.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default function CombosPage() {
  const [rows, setRows] = useState<ComboRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(new Date());

  const load = async () => {
    setLoading(true);
    const today = getTodayBogota();
    const { start } = getBogotaDateRange(today);
    const { end } = getBogotaDateRange(addDays(today, 2));
    const { data } = await supabase
      .from('predictions')
      .select(`
        id, match_id, best_bet, best_bet_probability, confidence,
        match:matches!predictions_match_id_fkey(
          match_date,
          league:leagues(name),
          home_team:teams!matches_home_team_id_fkey(short_name, name),
          away_team:teams!matches_away_team_id_fkey(short_name, name)
        )
      `)
      .gte('match.match_date', start)
      .lte('match.match_date', end)
      .in('confidence', ['very_high', 'high'])
      .order('best_bet_probability', { ascending: false })
      .limit(20);
    setRows(((data ?? []) as unknown as ComboRow[]).filter((row) => row.match != null));
    setUpdatedAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const tickets = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (b.best_bet_probability ?? 0) - (a.best_bet_probability ?? 0));
    const first = ticketFromRows(sorted, new Set());
    const used = new Set(first.selections.map((row) => row.match_id));
    const second = ticketFromRows(sorted, used);
    return [first, second];
  }, [rows]);

  return (
    <div className="min-h-full bg-[#f2f2f0] p-4 text-[#171717] lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#c7ff00] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]"><Sparkles size={13} /> Selección automática</div>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-6xl">2 tickets recomendados</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-600">Dos combinadas con partidos de hoy y de los próximos dos días. Cada selección usa la apuesta principal del modelo y cada ticket evita repetir partidos.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-neutral-900"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar</button>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          {tickets.map((ticket, index) => <TicketCard key={index} ticket={ticket} number={index + 1} />)}
        </section>

        <section className="grid gap-4 md:grid-cols-[.7fr_1.3fr]">
          <div className="rounded-3xl border border-neutral-300 bg-white p-6 sm:p-8">
            <ShieldCheck size={25} className="mb-6" />
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Estado del sistema</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em]">Cada 5 min</p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Las dos propuestas se actualizan con los pronósticos más recientes.</p>
            <p className="mt-6 text-[11px] text-neutral-400">Última revisión: {updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <div className="rounded-3xl border border-neutral-300 bg-white p-6 sm:p-8">
            <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Disponibles</p><h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Otros pronósticos</h2></div><Link to="/predicciones" className="inline-flex items-center gap-1 text-sm font-bold hover:underline">Ver todos <ArrowRight size={14} /></Link></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {rows.slice(0, 6).map((row) => <div key={row.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><div className="flex items-center justify-between"><span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">{row.match?.league?.name}</span><span className="rounded-full bg-[#c7ff00] px-2 py-1 text-[10px] font-black">{estimatedOdds(row.best_bet_probability ?? 0).toFixed(2)}</span></div><p className="mt-4 text-sm font-bold">{row.best_bet ?? 'Sin señal'}</p><p className="mt-1 text-xs text-neutral-500">{row.match?.home_team?.short_name ?? row.match?.home_team?.name} vs {row.match?.away_team?.short_name ?? row.match?.away_team?.name}</p></div>)}
            </div>
          </div>
        </section>
        <p className="text-center text-xs text-neutral-600">Las cuotas mostradas incluyen un margen de approximately 6%, similar al de casas de apuestas. Las probabilidades son estimaciones estadísticas y no garantizan resultados.</p>
      </div>
    </div>
  );
}
