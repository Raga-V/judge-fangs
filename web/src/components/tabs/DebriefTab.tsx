import { useState } from 'react';
import { debriefCase } from '../../api';
import { latestVerdict } from '../../caseContext';
import { gavel } from '../../sounds';
import { addLessons, updateCase } from '../../store';
import type { Case } from '../../types';
import DigLog from '../DigLog';
import { EmptyState, type RoamerHandle } from '../Sprite';

export default function DebriefTab({ c, roamer }: { c: Case; roamer: React.RefObject<RoamerHandle | null> }) {
  const last = latestVerdict(c);
  const [result, setResult] = useState<'won' | 'lost' | ''>(c.result?.status || '');
  const [winnersUrl, setWinnersUrl] = useState(c.result?.winnersUrl || c.winnersUrl || '');
  const [winnersText, setWinnersText] = useState('');
  const [subUrl, setSubUrl] = useState(c.submission?.url || last?.submission?.url || '');
  const [subText, setSubText] = useState(c.submission?.text || '');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');
  const d = c.debrief;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!result) return setError('First tell the Count: did you win?');
    if (!winnersUrl.trim() && !winnersText.trim()) return setError('Paste the winners announcement URL (or the winning posts).');
    if (!subUrl.trim() && !subText.trim()) return setError('Give the Count your final submission: the DEV post URL or its text.');
    setBusy(true); setLines(['Reading the winners and your final submission…']); roamer.current?.dig();
    updateCase(c.id, (x) => ({ ...x, stage: 'results', result: { status: result, winnersUrl: winnersUrl.trim() || undefined } }));
    try {
      const out = await debriefCase({
        brief: c.brief, result,
        submission: { title: last?.submission?.title || undefined, url: subUrl.trim() || undefined, text: subText.trim() || undefined,
          verdict_summary: last ? `${last.overall}/100; weakest: ${[...last.criteria].sort((a, b) => a.score - b.score)[0]?.name}` : undefined },
        winners_url: winnersUrl.trim() || undefined, winners_text: winnersText.trim() || undefined,
      });
      setLines((xs) => [...xs, ...out.logs, 'Lessons written.']);
      updateCase(c.id, (x) => ({ ...x, debrief: out.debrief }));
      addLessons(c, out.debrief.lessons);
      gavel();
      roamer.current?.verdict(result === 'won' ? 'impressed' : 'grudging', result === 'won' ? 'A victory. I shall pretend I expected it.' : 'Three lessons. They are in the sidebar now, mortal.');
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="debrief">
      <form className="card form fade-rise" onSubmit={run}>
        <h2 className="section-title">The results are in?</h2>
        <div className="seg" role="radiogroup" aria-label="Result">
          <button type="button" role="radio" aria-checked={result === 'won'} className={result === 'won' ? 'on' : ''} onClick={() => setResult('won')}>🏆 I won</button>
          <button type="button" role="radio" aria-checked={result === 'lost'} className={result === 'lost' ? 'on' : ''} onClick={() => setResult('lost')}>I didn't win</button>
        </div>
        <div className="grid-2">
          <label className="field"><span>Winners announcement URL</span>
            <input value={winnersUrl} onChange={(e) => setWinnersUrl(e.target.value)} placeholder="https://dev.to/devteam/…-winners" />
          </label>
          <label className="field"><span>Your final submission (DEV post URL)</span>
            <input value={subUrl} onChange={(e) => setSubUrl(e.target.value)} placeholder="https://dev.to/you/your-post" />
          </label>
        </div>
        <details>
          <summary className="link">Paste text instead</summary>
          <div className="grid-2">
            <label className="field"><span>Winning posts (text)</span><textarea rows={4} value={winnersText} onChange={(e) => setWinnersText(e.target.value)} maxLength={20000} /></label>
            <label className="field"><span>Your final submission (text)</span><textarea rows={4} value={subText} onChange={(e) => setSubText(e.target.value)} maxLength={12000} /></label>
          </div>
        </details>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Comparing…' : 'Debrief me'}</button></div>
      </form>

      <DigLog lines={busy ? lines : []} busy={busy} title="The Count compares" />

      {d ? (
        <>
          <div className={`result-banner fade-rise ${d.result}`}>
            <span className="pixel-label">{d.result === 'won' ? 'Victory' : 'Not this time'}</span>
            {d.count_says && <p>“{d.count_says}”</p>}
          </div>
          <div className="debrief-grid">
            <section className="card fade-rise">
              <h3>What the winners did that you didn't</h3>
              <ul className="why">{d.winners_did.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
            <section className="card fade-rise" style={{ animationDelay: '80ms' }}>
              <h3>What you did well</h3>
              <ul className="why good">{d.you_did_well.map((x) => <li key={x}>{x}</li>)}</ul>
            </section>
          </div>
          <section className="lessons-card parchment fade-rise" style={{ animationDelay: '160ms' }}>
            <h3>3 lessons for your next hackathon</h3>
            <ol>{d.lessons.map((x) => <li key={x}>{x}</li>)}</ol>
            <p className="fine">Saved to Lessons learned. The Count will remind you in every future case.</p>
          </section>
          {d.winners && d.winners.length > 0 && (
            <section className="card sources">
              <h3>The winners he read</h3>
              <ul>{d.winners.map((w) => <li key={w.url}><a href={w.url} target="_blank" rel="noreferrer">{w.title}</a></li>)}</ul>
            </section>
          )}
        </>
      ) : !busy && (
        <EmptyState quip="The jury has not spoken. Come back when the results are in, and I shall tell you why the winners won." />
      )}
    </div>
  );
}
