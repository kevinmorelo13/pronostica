import { useState, useEffect } from 'react';
import { Settings, Bell, Globe, Clock, Save, CheckCircle } from 'lucide-react';

const CONFIG_KEY = 'futbol_predictor_config';

type Config = {
  notifications_enabled: boolean;
  live_update_interval: number;
  default_league: string;
  timezone: string;
};

const defaults: Config = {
  notifications_enabled: true,
  live_update_interval: 60,
  default_league: 'all',
  timezone: 'America/Bogota',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') };
    } catch { return defaults; }
  });
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key: keyof Config, value: Config[keyof Config]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings size={22} className="text-blue-400" />
          <h1 className="text-2xl font-black text-white">Configuración</h1>
        </div>
        <p className="text-gray-400 text-sm">Ajusta las preferencias de la plataforma.</p>
      </div>

      <div className="space-y-4">
        {/* Notifications */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Bell size={18} className="text-blue-400" />
            <h3 className="font-semibold text-white">Notificaciones</h3>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-300">Notificaciones en la app</span>
            <button
              onClick={() => update('notifications_enabled', !config.notifications_enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.notifications_enabled ? 'bg-blue-600' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${config.notifications_enabled ? 'left-6' : 'left-1'}`} />
            </button>
          </label>
        </div>

        {/* Live updates */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Clock size={18} className="text-blue-400" />
            <h3 className="font-semibold text-white">Actualización en vivo</h3>
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-2">Intervalo de actualización (segundos)</label>
            <select
              value={config.live_update_interval}
              onChange={(e) => update('live_update_interval', Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-500"
            >
              <option value={30}>30 segundos</option>
              <option value={60}>1 minuto</option>
              <option value={120}>2 minutos</option>
              <option value={300}>5 minutos</option>
            </select>
          </div>
        </div>

        {/* Timezone */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Globe size={18} className="text-blue-400" />
            <h3 className="font-semibold text-white">Zona horaria</h3>
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-2">Zona horaria de la aplicación</label>
            <select
              value={config.timezone}
              onChange={(e) => update('timezone', e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-500"
            >
              <option value="America/Bogota">América/Bogotá (COT, UTC-5)</option>
              <option value="America/New_York">América/Nueva York (EST)</option>
              <option value="Europe/Madrid">Europa/Madrid (CET)</option>
              <option value="Europe/London">Europa/Londres (GMT)</option>
            </select>
            <p className="text-xs text-gray-600 mt-2">Los pronósticos se generan a las 6:00 AM hora Colombia independientemente de esta configuración.</p>
          </div>
        </div>
      </div>

      <button
        onClick={save}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${
          saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        {saved ? <><CheckCircle size={18} /> Guardado</> : <><Save size={18} /> Guardar configuración</>}
      </button>
    </div>
  );
}
