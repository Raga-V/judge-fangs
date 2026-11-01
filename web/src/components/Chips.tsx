import { useEffect, useState } from 'react';
import { formatLeft, msLeft } from '../time';
import type { Brief, Stage } from '../types';

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'ideating', label: 'Ideating' },
  { id: 'building', label: 'Building' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'results', label: 'Results in' },
];

export function StageChip({ stage }: { stage: Stage }) {
  const s = STAGES.find((x) => x.id === stage) || STAGES[0];
  return <span className={`chip stage-${s.id}`}>{s.label}</span>;
}

function useNow(every = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Deadline countdown. Turns crimson under 6 hours. */
export function Countdown({ brief, large = false }: { brief: Brief; large?: boolean }) {
  const now = useNow();
  const ms = msLeft(brief, now);
  if (ms == null) {
    return brief.deadline ? <span className={`chip countdown ${large ? 'large' : ''}`} title="Deadline">⏳ {brief.deadline}</span> : null;
  }
  const urgent = ms > 0 && ms < 6 * 3600 * 1000;
  const ended = ms <= 0;
  return (
    <span className={`chip countdown ${urgent ? 'urgent' : ''} ${ended ? 'ended' : ''} ${large ? 'large' : ''}`} title={brief.deadline || ''}>
      <span aria-hidden="true">{ended ? '⚑' : '⏳'}</span> {formatLeft(ms)}
    </span>
  );
}
