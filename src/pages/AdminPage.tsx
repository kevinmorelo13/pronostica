import { useState, useEffect, useCallback } from 'react';
import {
  Play, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle,
  ToggleLeft, ToggleRight, Wifi, WifiOff, Calendar, Database, BarChart3,
  Zap, Trophy, Target, Activity, Trash2, Layers, Shield, Users,
} from 'lucide-react';
import { supabase, type League, type AdminLog } from '@/lib/supabase';
import { fullSync, syncLive, generatePredictions, evaluateResults, syncStandings } from '@/lib/syncManager';
import { toLocaleDateString, toLocaleTimeString, getTodayBogota } from '@/lib/utils';

type Stats = {
  totalMatches: number;
  scheduledMatches: number;
  liveMatches: number;
  finishedMatches: number;
  totalPredictions: number;
  pendingPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  totalTeams: number;
  totalLeagues: number;
  activeLeagues: number;
  totalLadderEntries: number;
};

export default function AdminPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncAction, setSyncAction] = useState('');
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [stats, setStats] = useState<Stats | null>(null);
  const [syncDays, setSyncDays] = useState(3);

  const loadData = useCallback(() => {
    supabase.from('leagues').select('*').order('name').then(({ data }) => {
      if (data) setLeagues(data as League[]);
    });
    supabase.from('admin_logs').select('*').order('started_at', { ascending: false }).limit(20).then(({ data }) => {
      if (data) setLogs(data as AdminLog[]);
    });
  }, []);

  const loadStats = useCallback(async () => {
    const [
      matchesRes, scheduledRes, liveRes, finishedRes,
      predsRes, pendingPredsRes, correctRes, incorrectRes,
      teamsRes, leaguesRes, activeLeaguesRes, ladderRes,
    ] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true }),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'live'),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
      supabase.from('predictions').select('id', { count: 'exact', head: true }),
      supabase.from('predictions').select('id', { count: 'exact', head: true }).eq('prediction_result', 'pending'),
      supabase.from('predictions').select('id', { count: 'exact', head: true }).eq('prediction_result', 'correct'),
      supabase.from('predictions').select('id', { count: 'exact', head: true }).eq('prediction_result', 'incorrect'),
      supabase.from('teams').select('id', { count: 'exact', head: true }),
      supabase.from('leagues').select('id', { count: 'exact', head: true }),
      supabase.from('leagues').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('ladder_entries').select('id', { count: 'exact', head: true }),
    ]);

    setStats({
      totalMatches: matchesRes.count ?? 0,
      scheduledMatches: scheduledRes.count ?? 0,
      liveMatches: liveRes.count ?? 0,
      finishedMatches: finishedRes.count ?? 0,
      totalPredictions: predsRes.count ?? 0,
      pendingPredictions: pendingPredsRes.count ?? 0,
      correctPredictions: correctRes.count ?? 0,
      incorrectPredictions: incorrectRes.count ?? 0,
      totalTeams: teamsRes.count ?? 0,
      totalLeagues: leaguesRes.count ?? 0,
      activeLeagues: activeLeaguesRes.count ?? 0,
      totalLadderEntries: ladderRes.count ?? 0,
    });
  }, []);

  useEffect(() => {
    loadData();
    loadStats();
    supabase.from('admin_logs').select('status').eq('status', 'success').order('started_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      setApiStatus(data ? 'ok' : 'unknown');
    });
  }, [loadData, loadStats]);

  const runAction = async (action: string, fn: () => Promise<any>, message: string) => {
    setSyncStatus('running');
    setSyncAction(action);
    setSyncMessage(message);
    try {
      const result = await fn();
      setSyncStatus('success');
      setSyncMessage(
        typeof result === 'string' ? result :
        result?.message ?? `Completado: ${result?.matches_fetched ?? 0} partidos, ${result?.predictions_generated ?? 0} pronosticos`
      );
      setApiStatus('ok');
      loadData();
      loadStats();
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage((e as Error).message);
      setApiStatus('error');
    }
  };

  const runFullSync = () => {
    const today = getTodayBogota();
    runAction('Sincronizacion completa', () => fullSync(today), 'Sincronizando datos desde ESPN...');
  };

  const runMultiDaySync = async () => {
    setSyncStatus('running');
    setSyncAction('Sincronizacion multi-dia');
    setSyncMessage(`Sincronizando ${syncDays} dias...`);
    try {
      const today = new Date();
      let totalMatches = 0;
      let totalPreds = 0;
      for (let i = 0; i < syncDays; i++) {
        const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
        try {
          const result = await fullSync(dateStr);
          totalMatches += result.matches_fetched ?? 0;
          totalPreds += result.predictions_generated ?? 0;
        } catch (e) {
          console.error(`Sync for ${dateStr}:`, (e as Error).message);
        }
      }
      setSyncStatus('success');
      setSyncMessage(`Completado: ${totalMatches} partidos, ${totalPreds} pronosticos en ${syncDays} dias`);
      setApiStatus('ok');
      loadData();
      loadStats();
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage((e as Error).message);
      setApiStatus('error');
    }
  };

  const runLiveSync = () => {
    runAction('En vivo', async () => {
      const updated = await syncLive();
      return { message: `Actualizados ${updated} partidos en vivo` };
    }, 'Actualizando partidos en vivo...');
  };

  const runGeneratePredictions = () => {
    const today = getTodayBogota();
    runAction('Generar pronosticos', async () => {
      const preds = await generatePredictions(today);
      return { message: `Generados ${preds} pronosticos` };
    }, 'Generando pronosticos...');
  };

  const runEvaluateResults = () => {
    runAction('Evaluar resultados', async () => {
      const evaluated = await evaluateResults();
      return { message: `Evaluados ${evaluated} pronosticos` };
    }, 'Evaluando resultados de partidos finalizados...');
  };

  const runSyncStandings = () => {
    runAction('Tabla de posiciones', async () => {
      const updated = await syncStandings();
      return { message: `Actualizadas ${updated} entradas de tablas` };
    }, 'Sincronizando tablas de posiciones...');
  };

  const toggleLeague = async (league: League) => {
    await supabase.from('leagues').update({ is_active: !league.is_active, updated_at: new Date().toISOString() }).eq('id', league.id);
    setLeagues((prev) => prev.map((l) => l.id === league.id ? { ...l, is_active: !l.is_active } : l));
    loadStats();
  };

  const clearOldLogs = async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await supabase.from('admin_logs').delete().lt('started_at', cutoff.toISOString());
    loadData();
  };

  const accuracyRate = stats && (stats.correctPredictions + stats.incorrectPredictions) > 0
    ? ((stats.correctPredictions / (stats.correctPredictions + stats.incorrectPredictions)) * 100).toFixed(1)
    : null;

  const actionLabels: Record<string, string> = {
    full_sync: 'Sincronizacion completa',
    full_sync_frontend: 'Sincronizacion completa',
    generate_predictions: 'Generar pronosticos',
    sync_live: 'Actualizar en vivo',
    ingest_live: 'Actualizar en vivo',
    evaluate_results: 'Evaluar resultados',
    sync_standings: 'Tablas de posiciones',
    ingest_matches: 'Descargar partidos',
    ingest_standings: 'Descargar tablas',
  };

  return (
    <div className="min-h-full bg-[#f2f2f0] p-4 text-[#171717] lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <header>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#c7ff00] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]">
            <Shield size={13} /> Administracion
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Panel de control</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-700">
            Controla la sincronizacion de datos, genera pronosticos manuales y supervisa el estado del sistema.
          </p>
        </header>

        {/* Status cards */}
        <section className="grid gap-4 sm:grid-cols-3">
          <StatusCard
            icon={apiStatus === 'ok' ? Wifi : apiStatus === 'error' ? WifiOff : Wifi}
            title="API Deportiva"
            value={apiStatus === 'ok' ? 'Conectada' : apiStatus === 'error' ? 'Error de conexion' : 'Estado desconocido'}
            tone={apiStatus === 'ok' ? 'success' : apiStatus === 'error' ? 'error' : 'neutral'}
          />
          <StatusCard
            icon={Clock}
            title="Generacion automatica"
            value="06:00 AM · America/Bogota"
            tone="info"
          />
          <StatusCard
            icon={CheckCircle}
            title="Ligas activas"
            value={`${stats?.activeLeagues ?? 0} de ${stats?.totalLeagues ?? 0}`}
            tone="success"
          />
        </section>

        {/* Database stats */}
        {stats && (
          <section className="rounded-2xl border border-neutral-300 bg-white p-6">
            <div className="flex items-center gap-2 mb-5">
              <Database size={18} className="text-neutral-800" />
              <h2 className="text-lg font-bold tracking-tight">Estado de la base de datos</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={Calendar} label="Partidos" value={stats.totalMatches} />
              <StatTile icon={Clock} label="Programados" value={stats.scheduledMatches} />
              <StatTile icon={Activity} label="En vivo" value={stats.liveMatches} />
              <StatTile icon={CheckCircle} label="Finalizados" value={stats.finishedMatches} />
              <StatTile icon={Zap} label="Pronosticos" value={stats.totalPredictions} />
              <StatTile icon={Target} label="Pendientes" value={stats.pendingPredictions} />
              <StatTile icon={Trophy} label="Aciertos" value={stats.correctPredictions} accent="text-emerald-600" />
              <StatTile icon={XCircle} label="Fallos" value={stats.incorrectPredictions} accent="text-red-500" />
            </div>
            {accuracyRate && (
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-neutral-50 p-4">
                <BarChart3 size={18} className="text-neutral-800" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-neutral-900">Precision global: {accuracyRate}%</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className="h-full rounded-full bg-[#c7ff00] transition-all duration-500"
                      style={{ width: `${accuracyRate}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Sync controls */}
        <section className="rounded-2xl border border-neutral-300 bg-white p-6">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={18} className="text-neutral-800" />
            <h2 className="text-lg font-bold tracking-tight">Sincronizacion manual</h2>
          </div>
          <p className="mb-5 text-xs text-neutral-500">Descarga partidos, genera pronosticos y actualiza datos en tiempo real.</p>

          {/* Sync status banner */}
          {syncStatus !== 'idle' && (
            <div className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm ${
              syncStatus === 'running' ? 'border-blue-200 bg-blue-50 text-blue-700' :
              syncStatus === 'success' ? 'border-[#c7ff00]/40 bg-[#c7ff00]/10 text-neutral-800' :
              'border-red-200 bg-red-50 text-red-600'
            }`}>
              {syncStatus === 'running' && <RefreshCw size={16} className="mt-0.5 animate-spin flex-shrink-0" />}
              {syncStatus === 'success' && <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />}
              {syncStatus === 'error' && <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
              <div className="flex-1">
                {syncAction && <span className="block text-[11px] font-bold uppercase tracking-wide opacity-60">{syncAction}</span>}
                <span className="font-semibold">{syncMessage}</span>
              </div>
            </div>
          )}

          {/* Multi-day sync */}
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <Calendar size={16} className="text-neutral-600" />
            <label className="text-sm font-semibold text-neutral-800">Sincronizar multiples dias:</label>
            <select
              value={syncDays}
              onChange={(e) => setSyncDays(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 focus:border-neutral-900 focus:outline-none"
            >
              <option value={1}>1 dia</option>
              <option value={2}>2 dias</option>
              <option value={3}>3 dias</option>
              <option value={5}>5 dias</option>
              <option value={7}>7 dias</option>
            </select>
            <button
              onClick={runMultiDaySync}
              disabled={syncStatus === 'running'}
              className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              <Play size={14} /> Sincronizar {syncDays} dias
            </button>
          </div>

          {/* Action buttons grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ActionTile icon={Play} title="Sincronizar hoy" desc="Descargar partidos y generar pronosticos" onClick={runFullSync} disabled={syncStatus === 'running'} />
            <ActionTile icon={Zap} title="Solo pronosticos" desc="Generar sin descargar partidos" onClick={runGeneratePredictions} disabled={syncStatus === 'running'} />
            <ActionTile icon={RefreshCw} title="Actualizar en vivo" desc="Marcadores de partidos en juego" onClick={runLiveSync} disabled={syncStatus === 'running'} />
            <ActionTile icon={CheckCircle} title="Evaluar resultados" desc="Verificar pronosticos finalizados" onClick={runEvaluateResults} disabled={syncStatus === 'running'} />
            <ActionTile icon={BarChart3} title="Tablas de posiciones" desc="Sincronizar posiciones de ligas" onClick={runSyncStandings} disabled={syncStatus === 'running'} />
            <ActionTile icon={RefreshCw} title="Recargar datos" desc="Refrescar ligas, logs y stats" onClick={() => { loadData(); loadStats(); }} disabled={syncStatus === 'running'} />
          </div>
        </section>

        {/* League management */}
        <section className="rounded-2xl border border-neutral-300 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-neutral-800" />
              <h2 className="text-lg font-bold tracking-tight">Gestion de ligas</h2>
            </div>
            <span className="text-xs font-semibold text-neutral-500">{stats?.totalTeams ?? 0} equipos</span>
          </div>
          <div className="space-y-2">
            {leagues.map((league) => (
              <div key={league.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-3 transition hover:border-neutral-400">
                <div className="flex items-center gap-3">
                  {league.logo && <img src={league.logo} alt={league.name} className="h-6 w-6 object-contain" />}
                  <div>
                    <p className="text-sm font-bold tracking-tight text-neutral-900">{league.name}</p>
                    <p className="text-xs text-neutral-500">{league.country} · Temporada {league.season}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${league.is_active ? 'bg-[#c7ff00]/20 text-emerald-700' : 'bg-neutral-200 text-neutral-500'}`}>
                    {league.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                  <button onClick={() => toggleLeague(league)} className="text-neutral-400 transition hover:text-neutral-900">
                    {league.is_active ? <ToggleRight size={24} className="text-emerald-500" /> : <ToggleLeft size={24} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Execution logs */}
        <section className="rounded-2xl border border-neutral-300 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Historial de ejecuciones</h2>
            {logs.length > 0 && (
              <button
                onClick={clearOldLogs}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 transition hover:text-red-500"
              >
                <Trash2 size={12} /> Limpiar antiguos
              </button>
            )}
          </div>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm font-medium text-neutral-400">No hay registros de ejecucion.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {log.status === 'success' && <CheckCircle size={16} className="text-emerald-500" />}
                    {log.status === 'error' && <XCircle size={16} className="text-red-500" />}
                    {log.status === 'running' && <Clock size={16} className="animate-pulse text-amber-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold tracking-tight text-neutral-900">{actionLabels[log.action] ?? log.action}</p>
                      <span className="text-xs text-neutral-400">{toLocaleDateString(log.started_at)} {toLocaleTimeString(log.started_at)}</span>
                    </div>
                    {(log.matches_fetched > 0 || log.predictions_generated > 0) && (
                      <p className="mt-0.5 text-xs text-neutral-500">{log.matches_fetched} partidos · {log.predictions_generated} pronosticos</p>
                    )}
                    {log.error_message && <p className="mt-0.5 truncate text-xs text-red-500">{log.error_message}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusCard({ icon: Icon, title, value, tone }: { icon: any; title: string; value: string; tone: 'success' | 'error' | 'info' | 'neutral' }) {
  const tones: Record<string, { icon: string; value: string }> = {
    success: { icon: 'text-emerald-600', value: 'text-emerald-700' },
    error: { icon: 'text-red-500', value: 'text-red-600' },
    info: { icon: 'text-blue-600', value: 'text-blue-700' },
    neutral: { icon: 'text-neutral-500', value: 'text-neutral-600' },
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-300 bg-white p-5">
      <Icon size={22} className={tones[tone].icon} />
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">{title}</p>
        <p className={`mt-1 text-sm font-bold ${tones[tone].value}`}>{value}</p>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-neutral-600" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      </div>
      <p className={`mt-1.5 text-2xl font-black tracking-[-0.04em] ${accent ?? 'text-neutral-900'}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function ActionTile({ icon: Icon, title, desc, onClick, disabled }: { icon: any; title: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex items-start gap-3 rounded-2xl border border-neutral-300 bg-white p-4 text-left transition hover:border-neutral-900 hover:shadow-md disabled:opacity-50 disabled:hover:border-neutral-300 disabled:hover:shadow-none"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition group-hover:bg-[#c7ff00] group-hover:text-neutral-900">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold tracking-tight text-neutral-900">{title}</p>
        <p className="mt-0.5 text-xs leading-4 text-neutral-500">{desc}</p>
      </div>
    </button>
  );
}
