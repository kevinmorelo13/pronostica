import { Bell, Check, X } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationsContext';
import { getRelativeTime } from '@/lib/utils';

const ICON_MAP: Record<string, string> = {
  prediction_ready: '🎯',
  match_start: '⚽',
  goal: '🥅',
  match_end: '🏁',
  prediction_update: '📊',
  error: '⚠️',
};

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Bell size={16} className="text-blue-400" />
          Notificaciones
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllAsRead}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Check size={14} />
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
        {notifications.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No hay notificaciones
          </div>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => markAsRead(n.id)}
            className={`w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors ${
              !n.is_read ? 'bg-blue-600/5 border-l-2 border-blue-500' : ''
            }`}
          >
            <div className="flex gap-3">
              <span className="text-lg flex-shrink-0 mt-0.5">{ICON_MAP[n.type] ?? '🔔'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{n.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[11px] text-gray-600 mt-1">{getRelativeTime(n.created_at)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
