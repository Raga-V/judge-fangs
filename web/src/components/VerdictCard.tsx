import { useState } from 'react';
import { speak } from '../api';
import { quill } from '../sounds';
import type { Verdict } from '../types';
import EvidencePanel from './EvidencePanel';

/** A jagged wax-seal outline: alternate radii around a circle. */
function sealPath(points = 34, r1 = 50, r2 = 45.5) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points;
    const r = i % 2 ? r2 : r1 + ((i * 7) % 3) * 0.6;
    pts.push(`${(52 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}
const SEAL = sealPath();

export function WaxSeal({ score, size = 112, stamp = true }: { score: number; size?: number; stamp?: boolean }) {
  return (
    <div className={`seal ${stamp ? 'stamp' : ''}`} style={{ width: size, height: size }} role="img" aria-label={`Overall score ${score} out of 100`}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <defs>
          <radialGradient id="wax" cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#E0314F" />
            <stop offset=".55" stopColor="#B01D37" />
            <stop offset="1" stopColor="#6E0E20" />
          </radialGradient>
        </defs>
        <path d={SEAL} fill="url(#wax)" />
        <circle cx="52" cy="52" r="36" fill="none" stroke="rgba(255,220,200,.28)" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
      <span className="seal-num">{score}</span>
      <span className="seal-of">/100</span>
    </div>
  );
}

export function scoreClass(score: number) {
  return score < 5 ? 'low' : score < 8 ? 'mid' : 'high';
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        quill();
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      } catch { /* clipboard blocked */ }
    }}>
      {done ? 'Copied ✓' : label}
    </button>
  );
}

const WHY: Record<string, string> = {
  hackathon: "Why it won't win yet",
  email: 'What weakens it',
  idea: 'Why it might not win',
  pitch: 'What weakens it',
};

export default function VerdictCard({ v, compact = false }: { v: Verdict; compact?: boolean }) {
  const [voice, setVoice] = useState<'idle' | 'busy' | 'browser'>('idle');
  const title = v.submission?.title || ({ email: 'Your email', idea: 'Your idea', pitch: 'Your pitch' } as Record<string, string>)[v.mode] || 'Your submission';
  const when = v.judged_at ? new Date(v.judged_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return (
    <article className={`verdict parchment fade-rise ${v.expression}`} aria-label="The verdict">
      {v.banner && <p className="banner on-parchment">{v.banner}</p>}
      <header className="verdict-head">
        <WaxSeal score={v.overall} />
        <div className="verdict-title">
          <p className="eyebrow">The verdict on</p>
          <h2>{v.submission?.url ? <a href={v.submission.url} target="_blank" rel="noreferrer">{title}</a> : title}</h2>
          <p className="meta">{v.brief?.name ? `Judged against ${v.brief.name}` : 'Judged against the standard DEV criteria'}{when && ` · ${when}`}</p>
        </div>
      </header>

      <blockquote className="sentence">
        <p>{v.count_says}</p>
        <footer>
          <span>Judge Fangs</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={voice === 'busy'} onClick={async () => {
            setVoice('busy');
            const how = await speak(v.voice_line);
            setVoice(how === 'browser' ? 'browser' : 'idle');
          }}>
            {voice === 'busy' ? 'Clearing his throat…' : '▶ Hear the sentence'}
          </button>
          {voice === 'browser' && <span className="fine">(the browser's voice: the Count's own is resting)</span>}
        </footer>
      </blockquote>

      {v.overrules && v.overrules.length > 0 && (
        <ul className="overrules">{v.overrules.map((o) => <li key={o}><span aria-hidden="true">⚖</span> {o}</li>)}</ul>
      )}

      <section className="criteria">
        <h3>The criteria</h3>
        {v.criteria.map((c) => (
          <div className="criterion" key={c.name}>
            <div className="crit-top">
              <span className="crit-name">{c.name}</span>
              <span className={`crit-score ${scoreClass(c.score)}`}>{c.score}<small>/10</small></span>
            </div>
            <div className={`bar ${scoreClass(c.score)}`} role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={c.score} aria-label={c.name}>
              <span style={{ width: `${c.score * 10}%` }} />
            </div>
            <p className="crit-verdict">{c.verdict}</p>
            {c.evidence_quote ? (
              <details className="evidence-quote">
                <summary>Evidence</summary>
                <blockquote>“{c.evidence_quote}”</blockquote>
              </details>
            ) : (
              <p className="unsupported">Unsupported: no exact quote from your text backs this score.</p>
            )}
          </div>
        ))}
      </section>

      <div className="verdict-grid">
        {v.why_not_winning && v.why_not_winning.length > 0 && (
          <section>
            <h3>{WHY[v.mode] || WHY.hackathon}</h3>
            <ul className="why">{v.why_not_winning.map((w) => <li key={w}>{w}</li>)}</ul>
          </section>
        )}
        <section>
          <h3>{v.mode === 'idea' ? 'Three ways to sharpen it' : 'Three fixes'}</h3>
          <ol className="fixes">{v.top_fixes.map((f) => <li key={f}>{f}</li>)}</ol>
        </section>
      </div>

      {v.competitors && v.competitors.length > 0 && (
        <section>
          <h3>Closest competitors</h3>
          <ul className="why">{v.competitors.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>: {c.why_close}</li>)}</ul>
        </section>
      )}

      {(v.better_title || v.better_opening || v.rewrite) && (
        <div className="better-grid">
          {v.better_title && (
            <section className="better">
              <h3>{v.mode === 'email' ? 'A better subject' : v.mode === 'pitch' ? 'A sharper hook' : 'A better title'}</h3>
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
            <section className="better wide">
              <h3>The Count's rewrite</h3>
              <pre className="rewrite">{v.rewrite}</pre>
              <CopyButton text={v.rewrite} label="Copy the rewrite" />
            </section>
          )}
        </div>
      )}

      {!compact && <EvidencePanel v={v} />}

      {!compact && v.sources && v.sources.length > 0 && (
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
