import type { Verdict } from '../types';

/** Overall score over time: a small line chart of the case's verdicts. */
export default function ScoreChart({ verdicts, onPick, active }: { verdicts: Verdict[]; onPick?: (i: number) => void; active?: number }) {
  if (verdicts.length < 1) return null;
  const W = 520;
  const H = 150;
  const pad = { l: 34, r: 16, t: 14, b: 26 };
  const n = verdicts.length;
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const pts = verdicts.map((v, i) => `${x(i)},${y(v.overall)}`).join(' ');
  const first = verdicts[0].overall;
  const last = verdicts[n - 1].overall;
  const delta = last - first;
  return (
    <figure className="score-chart">
      <figcaption>
        <span>Score over drafts</span>
        {n > 1 && <span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} since the first draft</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Overall scores: ${verdicts.map((v) => v.overall).join(', ')}`}>
        {[0, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} className={`grid g${g}`} />
            <text x={pad.l - 8} y={y(g) + 4} className="axis" textAnchor="end">{g}</text>
          </g>
        ))}
        {n > 1 && <polyline points={pts} className="line" />}
        {verdicts.map((v, i) => (
          <g key={v.id + i} className={`pt ${active === i ? 'active' : ''}`} onClick={() => onPick?.(i)} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined}
            onKeyDown={(e) => { if (e.key === 'Enter') onPick?.(i); }}>
            <circle cx={x(i)} cy={y(v.overall)} r={active === i ? 7 : 5} />
            <text x={x(i)} y={y(v.overall) - 11} textAnchor="middle" className="val">{v.overall}</text>
            <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">#{i + 1}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
