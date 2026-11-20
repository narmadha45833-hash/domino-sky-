export function parseTimeToMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(':');
  if (parts.length !== 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function formatMinutesToTime(totalMins: number | null | undefined): string {
  if (totalMins === null || totalMins === undefined || !Number.isFinite(totalMins)) {
    return '--:--';
  }
  const dayOffset = Math.floor(totalMins / 1440);
  const normalized = ((Math.round(totalMins) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return dayOffset > 0 ? `${hh}:${mm} (+${dayOffset}d)` : `${hh}:${mm}`;
}

export function formatDuration(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}
