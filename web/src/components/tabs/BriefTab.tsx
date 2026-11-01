import type { Case } from '../../types';
import { Countdown } from '../Chips';
import { EmptyState } from '../Sprite';

export default function BriefTab({ c }: { c: Case }) {
  const b = c.brief;
  const max = Math.max(1, ...b.criteria.map((k) => k.weight_pct || 0));
  const stats = c.winnerStats;
  return (
    <div className="brief">
      <section className="doc parchment fade-rise">
        <p className="eyebrow">The theme</p>
        <p className="theme">{b.theme || 'The brief did not state a theme. Judge by the criteria.'}</p>
        <div className="doc-row">
          <div>
            <p className="eyebrow">Deadline</p>
            <p className="doc-strong">{b.deadline || 'Not stated'}</p>
          </div>
          <Countdown brief={b} large />
        </div>
      </section>

      <section className="card fade-rise" style={{ animationDelay: '60ms' }}>
        <h2 className="section-title">How this jury scores</h2>
        {b.default && <p className="muted small">The page listed no criteria, so these are the standard DEV jury criteria.</p>}
        <ol className="weights">
          {b.criteria.map((k, i) => (
            <li key={k.name}>
              <div className="weight-top">
                <span className="weight-name"><span className="rank">{i + 1}</span>{k.name}</span>
                <span className="weight-pct">{k.weight_pct ? `${Math.round(k.weight_pct)}%` : ''}{k.weight && !/^\d+%$/.test(k.weight) ? <em> · {k.weight}</em> : null}</span>
              </div>
              <div className="wbar"><span style={{ width: `${((k.weight_pct || 0) / max) * 100}%` }} /></div>
              {k.description && <p className="muted small">{k.description}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="card fade-rise" style={{ animationDelay: '120ms' }}>
        <h2 className="section-title">Prize categories</h2>
        {b.prize_categories.length ? (
          <div className="chips-wrap">{b.prize_categories.map((p) => <span className="chip chip-prize" key={p}>{p}</span>)}</div>
        ) : <p className="muted">No categories listed. Aim for the overall prize.</p>}
      </section>

      <section className="fade-rise" style={{ animationDelay: '180ms' }}>
        <h2 className="section-title">What winners usually have</h2>
        {c.patterns.length ? (
          <>
            <div className="patterns-grid">
              {c.patterns.map((p, i) => (
                <article className="pattern card" key={p}>
                  <span className="pixel-label">#{i + 1}</span>
                  <p>{p}</p>
                </article>
              ))}
            </div>
            {stats && (
              <p className="muted small stats-line">
                From {stats.winners} winning posts: {stats.pct_title_with_number}% had a number in the title · {stats.pct_with_demo_link}% a demo link ·
                {' '}{stats.pct_with_video}% a video · about {Math.round(stats.avg_words).toLocaleString()} words and {stats.avg_images} images.
              </p>
            )}
          </>
        ) : (
          <EmptyState quip="No winners to study yet. I will judge by the criteria alone, and remind you to come back when the results are in." />
        )}
      </section>

      {c.sources.length > 0 && (
        <section className="card sources fade-rise" style={{ animationDelay: '240ms' }}>
          <h2 className="section-title">Sources the Count read</h2>
          <ul>
            {c.sources.map((s, i) => (
              <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}<span className="muted small"> · {s.chars.toLocaleString()} chars</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
