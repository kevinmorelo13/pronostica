import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import PredictionsPage from '@/pages/PredictionsPage';
import LivePage from '@/pages/LivePage';
import CalendarPage from '@/pages/CalendarPage';
import StatsPage from '@/pages/StatsPage';
import StandingsPage from '@/pages/StandingsPage';
import LeaguesPage from '@/pages/LeaguesPage';
import HistoryPage from '@/pages/HistoryPage';
import FavoritesPage from '@/pages/FavoritesPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/AdminPage';
import ModelPerformancePage from '@/pages/ModelPerformancePage';
import BacktestingPage from '@/pages/BacktestingPage';
import CombosPage from '@/pages/CombosPage';
import LadderChallengePage from '@/pages/LadderChallengePage';
import { autoSyncIfNeeded } from '@/lib/syncManager';

function App() {
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    let mounted = true;
    const runSync = async (force = false) => {
      try {
        await autoSyncIfNeeded(force);
      } catch (e) {
        console.error('Auto-sync failed:', e);
      } finally {
        if (mounted) setSyncing(false);
      }
    };
    runSync();
    const interval = window.setInterval(() => runSync(true), 5 * 60 * 1000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  if (syncing) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Cargando datos deportivos...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <NotificationsProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/predicciones" element={<PredictionsPage />} />
            <Route path="/en-vivo" element={<LivePage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/estadisticas" element={<StatsPage />} />
            <Route path="/clasificaciones" element={<StandingsPage />} />
            <Route path="/ligas" element={<LeaguesPage />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/favoritos" element={<FavoritesPage />} />
            <Route path="/modelos" element={<ModelPerformancePage />} />
            <Route path="/backtesting" element={<BacktestingPage />} />
            <Route path="/combinadas" element={<CombosPage />} />
            <Route path="/reto-escalera" element={<LadderChallengePage />} />
            <Route path="/configuracion" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Layout>
      </NotificationsProvider>
    </BrowserRouter>
  );
}

export default App;
