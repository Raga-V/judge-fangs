import { useState } from 'react';
import { streamReview } from '../../api';
import { userContext } from '../../caseContext';
import { gavel } from '../../sounds';
import { realLessons, updateCase, useLessons } from '../../store';
import type { Case, Mode } from '../../types';
import DigLog from '../DigLog';
import ScoreChart from '../ScoreChart';
import { EmptyState, type RoamerHandle } from '../Sprite';
import VerdictCard from '../VerdictCard';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'hackathon', label: 'Submission', hint: 'A DEV post, a repo, a draft or README: any mix.' },
  { id: 'pitch', label: 'Pitch', hint: 'An elevator pitch or project summary, judged against this brief.' },
  { id: 'email', label: 'Email', hint: 'An email to a teammate, sponsor or organiser.' },
];

export default function JudgeTab({ c, roamer }: { c: Case; roamer: React.RefObject<RoamerHandle | null> }) {
  const allLessons = useLessons();
  const lessons = c.demo ? allLessons : realLessons(allLessons);
  const [mode, setMode] = useState<Mode>(c.submission?.mode || 'hackathon');
  const [url, setUrl] = useState(c.submission?.url || '');
  const [repo, setRepo] = useState(c.submission?.repoUrl || '');
  const [text, setText] = useState(c.submission?.text || '');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [shown, setShown] = useState<number>(c.verdicts.length - 1);
  const current = c.verdicts[Math.min(shown, c.verdicts.length - 1)] || c.verdicts[c.verdicts.length - 1];

  async function judge(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'hackathon' && !url.trim() && !repo.trim() && !text.trim()) return setError('Give the Count your DEV post, your repo, or paste your draft.');
    if (mode !== 'hackathon' && !text.trim()) return setError(mode === 'email' ? 'Paste the email first.' : 'Paste the pitch first.');
    setBusy(true);
    setLines([]);
    roamer.current?.dig();
    updateCase(c.id, (x) => ({ ...x, submission: { url: url.trim(), repoUrl: repo.trim(), text, mode } }));
    try {
      const v = await streamReview({
        mode,
        submission_url: mode === 'hackathon' ? url.trim() || undefined : undefined,
        repo_url: mode === 'hackathon' ? repo.trim() || undefined : undefined,
        submission_text: text.trim() || undefined,
        context: context.trim() || undefined,
        brief: c.brief,
        patterns: c.patterns,
        user_context: userContext(c, lessons) || undefined,
      }, (l) => setLines((xs) => [...xs, l]));
      updateCase(c.id, (x) => ({
        ...x,
        verdicts: [...x.verdicts, { ...v, judged_at: v.judged_at || new Date().toISOString() }].slice(-30),
        stage: x.stage === 'ideating' ? 'building' : x.stage,
      }));
      setShown(c.verdicts.length);
      gavel();
      const line = v.overall >= 75 ? 'Impressive. Do not let it go to your head.' : v.overall >= 50 ? 'Acceptable. Barely. Read the fixes.' : 'Objection. To all of it.';
      roamer.current?.verdict(v.expression, line);
    } catch (err) {
      setError((err as Error).message);
      roamer.current?.verdict('unimpressed', 'The tribunal stumbled. Try again, mortal.');
    } finally {
      setBusy(false);
    }
  }

  const last = c.verdicts[c.verdicts.length - 1];
  return (
    <div className="judge">
      <form className="card form fade-rise" onSubmit={judge}>
        <div className="seg" role="radiogroup" aria-label="What to judge">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        <p className="muted small">{MODES.find((m) => m.id === mode)?.hint}</p>
        {mode === 'hackathon' && (
          <div className="grid-2">
            <label className="field"><span>DEV post URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://dev.to/you/your-post" inputMode="url" />
            </label>
            <label className="field"><span>GitHub repo URL</span>
              <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/you/project" inputMode="url" />
            </label>
          </div>
        )}
        <label className="field">
          <span>{mode === 'hackathon' ? 'Draft post or README' : mode === 'pitch' ? 'Your pitch' : 'The email'} {mode === 'hackathon' && <em>(optional if you gave a link)</em>}</span>
          <textarea rows={mode === 'hackathon' ? 6 : 8} value={text} onChange={(e) => setText(e.target.value)} maxLength={40000}
            placeholder={mode === 'hackathon' ? 'Paste a draft. The Count reads it like the jury will.' : ''} />
        </label>
        {mode === 'email' && (
          <label className="field"><span>Context <em>(who it's to, what you want)</em></span>
            <input value={context} onChange={(e) => setContext(e.target.value)} maxLength={2000} />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row between">
          <p className="fine">Judged against <strong>{c.brief.name || c.name}</strong>{c.patterns.length ? ` and ${c.patterns.length} winners' patterns` : ''}{lessons.length ? `, remembering ${lessons.length} lesson${lessons.length > 1 ? 's' : ''}` : ''}.</p>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'The Count is reading…' : 'Summon the Count'}</button>
        </div>
      </form>

      <DigLog lines={lines} busy={busy} />

      {c.verdicts.length > 0 ? (
        <>
          <section className="card history fade-rise">
            <ScoreChart verdicts={c.verdicts} active={Math.min(shown, c.verdicts.length - 1)} onPick={setShown} />
            {last && c.stage !== 'submitted' && c.stage !== 'results' && (
              <div className="row between">
                <p className="muted small">Happy with draft #{c.verdicts.length}? Mark it as your final submission.</p>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => updateCase(c.id, (x) => ({ ...x, stage: 'submitted' }))}>Mark as submitted</button>
              </div>
            )}
          </section>
          {current && <VerdictCard v={current} key={current.id + shown} />}
        </>
      ) : !busy && (
        <EmptyState quip="Nothing to judge yet. I have waited three thousand years, mortal; I can wait for your README." />
      )}
    </div>
  );
}
