import { format, parseISO, isToday, isTomorrow, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export const BOGOTA_TZ = 'America/Bogota';

export function toLocaleDateString(iso: string, fmt = 'dd MMM yyyy'): string {
  try {
    return format(parseISO(iso), fmt, { locale: es });
  } catch {
    return iso;
  }
}

export function toLocaleTimeString(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: BOGOTA_TZ,
    });
  } catch {
    return '';
  }
}

export function isMatchToday(iso: string): boolean {
  try {
    return isToday(parseISO(iso));
  } catch {
    return false;
  }
}

export function isMatchTomorrow(iso: string): boolean {
  try {
    return isTomorrow(parseISO(iso));
  } catch {
    return false;
  }
}

export function getRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

export function getTodayBogota(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ });
}

// Returns UTC ISO boundaries for a Bogota-local date (UTC-5)
// Bogota midnight = 05:00 UTC, so 2026-09-28 in Bogota spans
// 2026-09-28T05:00:00Z to 2026-09-29T04:59:59Z in UTC
export function getBogotaDateRange(date: string): { start: string; end: string } {
  const next = new Date(date + 'T05:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: `${date}T05:00:00.000Z`,
    end: `${next.toISOString().slice(0, 10)}T04:59:59.999Z`,
  };
}

export function formatMatchDate(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return 'Hoy';
    if (isTomorrow(d)) return 'Mañana';
    return format(d, "EEE dd MMM", { locale: es });
  } catch {
    return iso;
  }
}

export function confidenceLabel(c: string): string {
  const map: Record<string, string> = {
    very_high: 'Muy Alta',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
  };
  return map[c] ?? c;
}

export function confidenceColor(c: string): string {
  const map: Record<string, string> = {
    very_high: 'text-white',
    high: 'text-neutral-100',
    medium: 'text-neutral-300',
    low: 'text-neutral-500',
  };
  return map[c] ?? 'text-neutral-400';
}

export function confidenceBg(c: string): string {
  const map: Record<string, string> = {
    very_high: 'bg-[#c7ff00] border-[#c7ff00] text-neutral-900',
    high: 'bg-[#c7ff00]/30 border-[#c7ff00]/50 text-neutral-900',
    medium: 'bg-neutral-200 border-neutral-300 text-neutral-600',
    low: 'bg-neutral-100 border-neutral-200 text-neutral-400',
  };
  return map[c] ?? 'bg-neutral-100 border-neutral-200 text-neutral-500';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    live: 'text-red-500',
    halftime: 'text-orange-500',
    finished: 'text-neutral-400',
    scheduled: 'text-neutral-600',
    postponed: 'text-neutral-400',
    cancelled: 'text-red-500',
  };
  return map[status] ?? 'text-neutral-400';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    live: 'EN VIVO',
    halftime: 'MEDIO TIEMPO',
    finished: 'FINALIZADO',
    scheduled: 'PROGRAMADO',
    postponed: 'APLAZADO',
    cancelled: 'CANCELADO',
  };
  return map[status] ?? status.toUpperCase();
}

export function getOutcomeLabel(prediction: { home_probability: number; draw_probability: number; away_probability: number }, homeTeam: string, awayTeam: string): string {
  const max = Math.max(prediction.home_probability, prediction.draw_probability, prediction.away_probability);
  if (max === prediction.home_probability) return `Victoria ${homeTeam}`;
  if (max === prediction.away_probability) return `Victoria ${awayTeam}`;
  return 'Empate';
}

export function getFormChar(result: string): { char: string; color: string } {
  const map: Record<string, { char: string; color: string }> = {
    W: { char: 'V', color: 'bg-[#c7ff00] text-neutral-900' },
    D: { char: 'E', color: 'bg-neutral-300 text-neutral-700' },
    L: { char: 'D', color: 'bg-neutral-200 text-neutral-500' },
  };
  return map[result] ?? { char: result, color: 'bg-neutral-200 text-neutral-500' };
}
