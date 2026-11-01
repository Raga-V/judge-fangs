import type { Brief } from './types';

/** The deadline as a Date, from the ISO field or a parseable string. */
export function deadlineDate(b: Brief | null | undefined): Date | null {
  if (!b) return null;
  for (const s of [b.deadline_iso, b.deadline]) {
    if (!s) continue;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function msLeft(b: Brief | null | undefined, now = Date.now()): number | null {
  const d = deadlineDate(b);
  return d ? d.getTime() - now : null;
}

export function formatLeft(ms: number): string {
  if (ms <= 0) return 'Ended';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${mm}m left`;
  return `${mm}m left`;
}

export function timeLeftText(b: Brief | null | undefined): string {
  const ms = msLeft(b);
  if (ms == null) return b?.deadline ? `deadline: ${b.deadline}` : 'deadline unknown';
  return ms <= 0 ? 'the deadline has passed' : formatLeft(ms);
}
