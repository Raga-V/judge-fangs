import { useState } from 'react';
import { speak } from '../api';
import { quill } from '../sounds';
import type { Verdict } from '../types';
import EvidencePanel from './EvidencePanel';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          quill();
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

const WHY_HEADING: Record<string, string> = {
  hackathon: "Why you didn't win",
  email: 'What weakens it',
  idea: 'Why it might not win',
};

export default function VerdictCard({ v }: { v: Verdict }) {
  const [voice, setVoice] = useState<'idle' | 'busy' | 'browser'>('idle');
  const title = v.submission?.title || (v.mode === 'email' ? 'Your email' : v.mode === 'idea' ? 'Your idea' : 'Your submission');
  return (
    <article className={`verdict parchment ${v.expression}`} aria-label="The verdict">
      {v.banner && <p className="banner">{v.banner}</p>}
      {v.example_label && !v.banner && <p className="banner subtle">{v.example_label}</p>}
      <header className="verdict-head">
        <div className="seal" aria-label={`Overall score ${v.overall} out of 100`}>
          <span className="seal-score">{v.overall}</span>
          <span className="seal-of">/100</span>
        </div>
        <div>
          <p className="eyebrow">The verdict on</p>
          <h2>{v.submission?.url ? <a href={v.submission.url} target="_blank" rel="noreferrer">{title}</a> : title}</h2>
          {v.brief?.name && <p className="fine">Judged against {v.brief.name}{v.brief.default ? ' (standard DEV jury criteria)' : ''}</p>}
        </div>
      </header>

      <blockquote className="count-says">
        <p>“{v.count_says}”</p>
        <footer>
          — Judge Fangs
          <button
            type="button"
            className="hear"
            disabled={voice === 'busy'}
            onClick={async () => {
              setVoice('busy');
              const how = await speak(v.voice_line);
              setVoice(how === 'browser' ? 'browser' : 'idle');
            }}
          >
            {voice === 'busy' ? 'Clearing his throat…' : 'Hear the sentence'}
          </button>
          {voice === 'browser' && <span className="fine"> (the browser's voice: the Count's own is resting)</span>}
        </footer>
      </blockquote>

      {v.overrules && v.overrules.length > 0 && (
        <ul className="overrules">{v.overrules.map((o) => <li key={o}>⚖ {o}</li>)}</ul>
      )}

      <section className="criteria">
        <h3>The criteria</h3>
        {v.criteria.map((c) => (
          <div className="criterion" key={c.name}>
            <div className="crit-top">
              <span className="crit-name">{c.name}</span>
              <span className="crit-score">{c.score}/10</span>
            </div>
            <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={c.score} aria-label={c.name}>
              <span style={{ width: `${c.score * 10}%` }} />
            </div>
            <p className="crit-verdict">{c.verdict}</p>
            {c.evidence_quote ? (
              <p className="quote">“{c.evidence_quote}”</p>
            ) : (
              <p className="quote unsupported">Unsupported: no exact quote from your text backs this score.</p>
            )}
          </div>
        ))}
      </section>

      {v.why_not_winning && v.why_not_winning.length > 0 && (
        <section>
          <h3>{WHY_HEADING[v.mode]}</h3>
          <ul className="why">{v.why_not_winning.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      )}

      {v.competitors && v.competitors.length > 0 && (
        <section>
          <h3>Closest competitors</h3>
          <ul className="why">{v.competitors.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>: {c.why_close}</li>)}</ul>
        </section>
      )}

      <section>
        <h3>{v.mode === 'idea' ? 'Three ways to sharpen it' : 'Three fixes'}</h3>
        <ol className="fixes">{v.top_fixes.map((f) => <li key={f}>{f}</li>)}</ol>
      </section>

      {v.better_title && (
        <section className="better">
          <h3>{v.mode === 'email' ? 'A better subject' : v.mode === 'idea' ? 'A sharper name' : 'A better title'}</h3>
          <p className="better-text">{v.better_title}</p>
          <CopyButton text={v.better_title} />
        </section>
      )}
      {v.better_opening && (
        <section className="better">
          <h3>A better opening</h3>
          <p className="better-text">{v.better_opening}</p>
          <CopyButton text={v.better_opening} />
        </section>
      )}
      {v.rewrite && (
        <section className="better">
          <h3>The Count's rewrite</h3>
          <pre className="rewrite">{v.rewrite}</pre>
          <CopyButton text={v.rewrite} label="Copy the rewrite" />
        </section>
      )}

      <EvidencePanel v={v} />

      {v.sources && v.sources.length > 0 && (
        <section className="sources">
          <h3>Sources</h3>
          <ul>
            {v.sources.map((s, i) => (
              <li key={i}>
                {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}
                <span className="fine"> · {s.chars.toLocaleString()} characters read</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
