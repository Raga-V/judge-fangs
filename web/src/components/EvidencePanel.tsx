import type { Verdict } from '../types';

const STATUS: Record<string, string> = {
  backed: 'Backed by code',
  mentioned: 'Mentioned only',
  not_found: 'Not found',
  no_repo: 'No repo to check',
};

const FACT_LABELS: [string, string, (v: unknown) => string][] = [
  ['word_count', 'Words', (v) => String(v)],
  ['reading_time_min', 'Reading time', (v) => `${v} min`],
  ['title_has_number', 'Number in the title', (v) => (v ? 'Yes' : 'No')],
  ['images', 'Images', (v) => String(v)],
  ['videos', 'Embedded videos', (v) => String(v)],
  ['has_demo_link', 'Demo link', (v) => (v ? 'Yes' : 'No')],
  ['has_repo_link', 'Repo link', (v) => (v ? 'Yes' : 'No')],
  ['has_open_innovation_section', '"Why open innovation matters" section', (v) => (v ? 'Yes' : 'No')],
  ['repo_commits', 'Repo commits', (v) => String(v)],
  ['repo_has_ci', 'CI workflow', (v) => (v ? 'Yes' : 'No')],
  ['repo_languages', 'Languages', (v) => (Array.isArray(v) ? v.join(', ') : String(v))],
];

export default function EvidencePanel({ v }: { v: Verdict }) {
  const facts = v.facts || {};
  const shown = FACT_LABELS.filter(([k]) => facts[k] !== undefined && facts[k] !== null);
  const stats = v.winner_stats;
  return (
    <section className="evidence">
      <h3>Evidence the Count gathered</h3>
      {shown.length > 0 && (
        <dl className="facts">
          {shown.map(([k, label, fmt]) => (
            <div key={k}>
              <dt>{label}</dt>
              <dd>{fmt(facts[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      {v.partners && v.partners.length > 0 && (
        <>
          <h4>Partner claims vs reality</h4>
          <ul className="partners">
            {v.partners.map((p) => (
              <li key={p.partner} className={`partner ${p.status}`}>
                <span className="badge">{STATUS[p.status] || p.status}</span>
                <strong>{p.partner}</strong> <span className="claim">({p.claim})</span>
                {p.evidence.length > 0 && <ul className="ev">{p.evidence.map((e) => <li key={e}><code>{e}</code></li>)}</ul>}
              </li>
            ))}
          </ul>
        </>
      )}
      {v.patterns && v.patterns.length > 0 && (
        <>
          <h4>What the winners had in common</h4>
          <ul className="patterns">{v.patterns.map((p) => <li key={p}>{p}</li>)}</ul>
          {stats && (
            <p className="fine">
              Across {stats.winners} winners: {stats.pct_title_with_number}% had a number in the title, {stats.pct_with_demo_link}% a demo link,
              {' '}{stats.pct_with_video}% a video, about {Math.round(stats.avg_words)} words and {stats.avg_images} images.
            </p>
          )}
          {v.patterns_blind && <p className="fine blind">Winners' patterns were built without the posts being judged.</p>}
        </>
      )}
    </section>
  );
}
