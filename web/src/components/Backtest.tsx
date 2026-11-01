import { useMemo, useState } from 'react';
import { jsonReview, scoreBacktest } from '../api';
import { parseUrls, toCSV, type BacktestRow } from '../backtest';

interface Score {
  top_n: number;
  winners_total: number;
  winners_in_top_n: number;
  precision_at_n: number | null;
  avg_winner: number | null;
  avg_non_winner: number | null;
  unmatched_winner_urls: string[];
}

export default function Backtest({ onDig, onDone }: { onDig: () => void; onDone: (expr: string) => void }) {
  const [urlsText, setUrlsText] = useState('');
  const [hackUrl, setHackUrl] = useState('');
  const [winnersUrl, setWinnersUrl] = useState('');
  const [rows, setRows] = useState<BacktestRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [running, setRunning] = useState(false);
  const [labels, setLabels] = useState('');
  const [topN, setTopN] = useState(3);
  const [score, setScore] = useState<Score | null>(null);
  const urls = useMemo(() => parseUrls(urlsText), [urlsText]);
  const winnerSet = useMemo(() => new Set(parseUrls(labels, 50).map((u) => u.toLowerCase())), [labels]);
  const ranked = [...rows].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));

  async function run() {
    if (!urls.length || !hackUrl.trim()) return;
    setRunning(true);
    setScore(null);
    onDig();
    const out: BacktestRow[] = urls.map((u) => ({ url: u, title: u, overall: null }));
    setRows([...out]);
    for (let i = 0; i < urls.length; i++) {
      setProgress({ done: i, total: urls.length, current: urls[i] });
      try {
        const v = await jsonReview({
          mode: 'hackathon', submission_url: urls[i], hackathon_url: hackUrl.trim(),
          winners_url: winnersUrl.trim() || undefined, exclude_urls: urls,
        }, () => {}, '/api/backtest/review');
        out[i] = { url: urls[i], title: v.submission?.title || urls[i], overall: v.overall, verdict: v };
      } catch (e) {
        out[i] = { url: urls[i], title: urls[i], overall: null, error: (e as Error).message };
      }
      setRows([...out]);
    }
    setProgress({ done: urls.length, total: urls.length, current: '' });
    setRunning(false);
    onDone('stern');
  }

  async function compute() {
    const done = rows.filter((r) => r.overall != null).map((r) => ({ url: r.url, title: r.title, overall: r.overall as number }));
    setScore(await scoreBacktest(done, [...winnerSet], topN));
  }

  function downloadCSV() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(ranked, winnerSet)], { type: 'text/csv' }));
    a.download = 'judge-fangs-backtest.csv';
    a.click();
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section className="backtest card form fade-rise">
      <p className="eyebrow">Backtest lab</p>
      <h1 className="page-title">Would the Count have picked the winners?</h1>
      <p className="fine">Blind by design: the Count never sees which entries won. Enter the true winners only after the run.</p>
      <label className="field">Up to 20 DEV post URLs <span className="muted small">({urls.length} found)</span>
        <textarea rows={6} value={urlsText} onChange={(e) => setUrlsText(e.target.value)} placeholder="One per line" />
      </label>
      <label className="field">Hackathon URL
        <input type="url" value={hackUrl} onChange={(e) => setHackUrl(e.target.value)} placeholder="https://dev.to/challenges/…" />
      </label>
      <label className="field">Winners announcement URL <span className="muted small">(optional; used for the brief and patterns only, with the judged posts left out)</span>
        <input type="url" value={winnersUrl} onChange={(e) => setWinnersUrl(e.target.value)} />
      </label>
      <button className="btn btn-primary" type="button" disabled={running || !urls.length || !hackUrl.trim()} onClick={run}>
        {running ? `Judging ${progress.done + 1} of ${progress.total}…` : `Judge ${urls.length || ''} entries`}
      </button>
      {progress.total > 0 && (
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {winnersUrl && <p className="fine blind">Winners' patterns were built without the posts being judged.</p>}

      {rows.length > 0 && (
        <table className="ranked">
          <thead>
            <tr><th>#</th><th>Entry</th><th>Overall</th><th>Winner?</th></tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.url} className={winnerSet.has(r.url.toLowerCase()) ? 'is-winner' : ''}>
                <td>{r.overall != null ? i + 1 : '–'}</td>
                <td><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{r.error && <span className="fine"> · {r.error}</span>}</td>
                <td>{r.overall ?? '…'}</td>
                <td>{winnerSet.has(r.url.toLowerCase()) ? '🏆' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.some((r) => r.overall != null) && !running && (
        <div className="labels">
          <label className="field">True winners (paste their URLs, after the run)
            <textarea rows={3} value={labels} onChange={(e) => setLabels(e.target.value)} />
          </label>
          <label className="field inline">Top N <input type="number" min={1} max={20} value={topN} onChange={(e) => setTopN(Number(e.target.value) || 1)} /></label>
          <div className="row-btns">
            <button type="button" className="btn btn-outline btn-sm" onClick={compute} disabled={!winnerSet.size}>Score the Count</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={downloadCSV}>Export CSV</button>
          </div>
        </div>
      )}
      {score && (
        <dl className="facts score">
          <div><dt>Real winners in the Count's top {score.top_n}</dt><dd>{score.winners_in_top_n} of {score.winners_total}</dd></div>
          <div><dt>Average score, winners</dt><dd>{score.avg_winner ?? '–'}</dd></div>
          <div><dt>Average score, everyone else</dt><dd>{score.avg_non_winner ?? '–'}</dd></div>
          {score.unmatched_winner_urls.length > 0 && <div><dt>Winner URLs not in the run</dt><dd>{score.unmatched_winner_urls.length}</dd></div>}
        </dl>
      )}
    </section>
  );
}
