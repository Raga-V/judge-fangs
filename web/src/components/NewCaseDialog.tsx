import { useEffect, useRef, useState } from 'react';
import { streamCase } from '../api';
import { addCase, uid } from '../store';
import type { Case } from '../types';
import DigLog from './DigLog';

export default function NewCaseDialog({ open, onClose, onCreated, onDig }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void; onDig: (on: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [brief, setBrief] = useState('');
  const [winners, setWinners] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function reset() {
    setQuery(''); setBrief(''); setWinners(''); setLines([]); setError(''); setMore(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q && !brief.trim()) return setError('Paste the hackathon URL, or type its name.');
    const isUrl = /^https?:\/\//i.test(q);
    setBusy(true); setError(''); setLines([]); onDig(true);
    try {
      const dug = await streamCase({
        url: isUrl ? q : undefined, name: isUrl ? undefined : q || undefined,
        text: brief.trim() || undefined, winners_url: winners.trim() || undefined,
      }, (l) => setLines((xs) => [...xs, l]));
      const now = new Date().toISOString();
      const c: Case = {
        id: uid('case-'), name: dug.brief.name || q || 'Unnamed hackathon', url: isUrl ? q : undefined,
        createdAt: now, updatedAt: now, stage: 'ideating', brief: dug.brief, patterns: dug.patterns || [],
        winnerStats: dug.winner_stats, winners: dug.winners || [], sources: dug.sources || [], winnersUrl: dug.winners_url || undefined,
        ideas: [], verdicts: [], chat: [],
      };
      addCase(c);
      reset();
      onCreated(c.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false); onDig(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={() => { if (!busy) { reset(); onClose(); } }} aria-labelledby="new-case-title">
      <form method="dialog" className="dialog-close"><button aria-label="Close" disabled={busy}>✕</button></form>
      <h2 id="new-case-title">Open a new case</h2>
      <p className="muted">Paste the hackathon's URL, or just type its name. The Count digs up the theme, the judging criteria, the prizes, the deadline and what past winners had in common.</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Hackathon URL or name</span>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy}
            placeholder="https://dev.to/challenges/…  or  Hacktoberfest Week 4" />
        </label>
        {!more ? (
          <button type="button" className="link left" onClick={() => setMore(true)}>+ Paste the brief or a winners post instead</button>
        ) : (
          <>
            <label className="field">
              <span>Or paste the brief <em>(optional)</em></span>
              <textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} disabled={busy} maxLength={30000} />
            </label>
            <label className="field">
              <span>Winners announcement URL <em>(optional, if results are in)</em></span>
              <input value={winners} onChange={(e) => setWinners(e.target.value)} disabled={busy} placeholder="https://dev.to/devteam/…-winners" />
            </label>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Digging…' : 'Open the case'}</button>
        </div>
      </form>
      <DigLog lines={lines} busy={busy} title="The Count digs up the case" />
    </dialog>
  );
}
