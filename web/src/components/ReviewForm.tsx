import { useState } from 'react';
import type { Mode, ReviewRequest } from '../types';

interface Props {
  mode: Mode;
  busy: boolean;
  onSubmit: (req: ReviewRequest) => void;
}

const clean = (s: string) => s.trim() || undefined;

export default function ReviewForm({ mode, busy, onSubmit }: Props) {
  const [hackUrl, setHackUrl] = useState('');
  const [hackText, setHackText] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [subText, setSubText] = useState('');
  const [winnersUrl, setWinnersUrl] = useState('');
  const [context, setContext] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'hackathon' && !subUrl.trim() && !subText.trim()) return setError('Give the Count a DEV post, a GitHub repo, or some text, mortal.');
    if (mode !== 'hackathon' && !subText.trim()) return setError(mode === 'email' ? 'Paste the email first.' : 'Describe the idea first.');
    onSubmit({
      mode,
      hackathon_url: mode === 'email' ? undefined : clean(hackUrl),
      hackathon_text: mode === 'email' ? undefined : clean(hackText),
      submission_url: mode === 'hackathon' ? clean(subUrl) : undefined,
      submission_text: clean(subText),
      winners_url: mode === 'email' ? undefined : clean(winnersUrl),
      context: mode === 'email' ? clean(context) : undefined,
    });
  }

  return (
    <form className="review-form parchment" onSubmit={submit}>
      {mode === 'hackathon' && (
        <>
          <fieldset>
            <legend>The hackathon</legend>
            <label>Challenge URL <span className="opt">(DEV challenge page or announcement post)</span>
              <input type="url" value={hackUrl} onChange={(e) => setHackUrl(e.target.value)} placeholder="https://dev.to/challenges/…" />
            </label>
            <label>…or paste the brief
              <textarea rows={3} value={hackText} onChange={(e) => setHackText(e.target.value)} placeholder="Judging criteria, prize categories, theme…" maxLength={30000} />
            </label>
          </fieldset>
          <fieldset>
            <legend>Your submission</legend>
            <label>DEV post or GitHub repo URL
              <input type="url" value={subUrl} onChange={(e) => setSubUrl(e.target.value)} placeholder="https://dev.to/you/your-post or https://github.com/you/repo" />
            </label>
            <label>…or paste the text
              <textarea rows={4} value={subText} onChange={(e) => setSubText(e.target.value)} maxLength={40000} />
            </label>
          </fieldset>
          <label>Past winners announcement <span className="opt">(optional, the "why" magic)</span>
            <input type="url" value={winnersUrl} onChange={(e) => setWinnersUrl(e.target.value)} placeholder="https://dev.to/devteam/…-winners" />
          </label>
        </>
      )}
      {mode === 'email' && (
        <>
          <label>The email
            <textarea rows={9} value={subText} onChange={(e) => setSubText(e.target.value)} maxLength={20000} placeholder="Hi Sam, …" />
          </label>
          <label>Context <span className="opt">(optional: who it's to, what you want)</span>
            <input value={context} onChange={(e) => setContext(e.target.value)} maxLength={2000} placeholder="To my tech lead. I want a review of my PR by Friday." />
          </label>
        </>
      )}
      {mode === 'idea' && (
        <>
          <label>The idea
            <textarea rows={6} value={subText} onChange={(e) => setSubText(e.target.value)} maxLength={20000} placeholder="A browser extension that…" />
          </label>
          <label>Hackathon brief URL <span className="opt">(optional)</span>
            <input type="url" value={hackUrl} onChange={(e) => setHackUrl(e.target.value)} placeholder="https://dev.to/challenges/…" />
          </label>
          <label>…or paste the brief <span className="opt">(optional)</span>
            <textarea rows={2} value={hackText} onChange={(e) => setHackText(e.target.value)} maxLength={30000} />
          </label>
          <label>Winners or entries post <span className="opt">(optional, to name your closest competitors)</span>
            <input type="url" value={winnersUrl} onChange={(e) => setWinnersUrl(e.target.value)} />
          </label>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="summon" type="submit" disabled={busy}>{busy ? 'The Count is digging…' : 'Summon the Count'}</button>
      <p className="fine">Links are fetched on the server from dev.to and GitHub only. Your text goes to the hosted model and is never stored.</p>
    </form>
  );
}
