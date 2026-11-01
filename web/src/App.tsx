import { useEffect, useRef, useState } from 'react';
import strong from '../../app/demo/strong.json';
import weak from '../../app/demo/weak.json';
import { getConfig, getVerdict, streamReview, type ServerConfig } from './api';
import Backtest from './components/Backtest';
import DigLog from './components/DigLog';
import FangsSprite, { type FangsHandle } from './components/FangsSprite';
import ModePicker from './components/ModePicker';
import ReviewForm from './components/ReviewForm';
import VerdictCard from './components/VerdictCard';
import { gavel, isMuted, setMuted } from './sounds';
import type { Mode, ReviewRequest, Verdict } from './types';

// bundled, so the example works even when the API is asleep
const EXAMPLES = { strong: strong as unknown as Verdict, weak: weak as unknown as Verdict };

function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return [path, (p: string) => { window.history.pushState({}, '', p); setPath(p); window.scrollTo(0, 0); }];
}

export default function App() {
  const [path, go] = usePath();
  const [mode, setMode] = useState<Mode>('hackathon');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [muted, setMute] = useState(isMuted());
  const fangs = useRef<FangsHandle>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConfig().then((c) => { setConfig(c); setApiDown(!c); });
  }, []);

  useEffect(() => {
    const m = path.match(/^\/verdict\/([\w-]+)/);
    if (!m) return;
    const id = m[1];
    const local = Object.values(EXAMPLES).find((e) => e.id === id);
    if (local) return deliver(local, false);
    setBusy(true);
    getVerdict(id).then((v) => deliver(v, false)).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [path]);

  function deliver(v: Verdict, sound = true) {
    setVerdict(v);
    fangs.current?.verdict(v.expression);
    if (sound) gavel();
    setTimeout(() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function summon(req: ReviewRequest) {
    setBusy(true);
    setError('');
    setVerdict(null);
    setLines([]);
    fangs.current?.dig();
    try {
      const v = await streamReview(req, (l) => setLines((xs) => [...xs, l]));
      deliver(v);
    } catch (e) {
      setError((e as Error).message);
      fangs.current?.verdict('unimpressed');
    } finally {
      setBusy(false);
    }
  }

  function showExample(which: 'strong' | 'weak') {
    setLines([]);
    setError('');
    deliver(EXAMPLES[which]);
  }

  const onBacktest = path.startsWith('/backtest');
  return (
    <>
      <div className="candlelight" aria-hidden="true" />
      <header className="top">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go('/'); }}>Judge Fangs</a>
        <nav>
          <a href="/" className={!onBacktest ? 'on' : ''} onClick={(e) => { e.preventDefault(); go('/'); }}>Review</a>
          <a href="/backtest" className={onBacktest ? 'on' : ''} onClick={(e) => { e.preventDefault(); go('/backtest'); }}>Backtest</a>
          <button type="button" className="mute" aria-pressed={muted} onClick={() => { setMuted(!muted); setMute(!muted); }}>
            {muted ? 'Sounds off' : 'Sounds on'}
          </button>
        </nav>
      </header>

      <main>
        {(config?.banner || apiDown) && (
          <p className="banner">{apiDown ? 'The tribunal is asleep (the API did not answer). The example judgements still work.' : config?.banner}</p>
        )}

        {onBacktest ? (
          <Backtest onDig={() => fangs.current?.dig()} onDone={(e) => { fangs.current?.verdict(e); gavel(); }} />
        ) : (
          <>
            <section className="hero">
              <p className="eyebrow">Sitting on every hackathon jury since the fall of Rome</p>
              <h1>Judge Fangs</h1>
              <p className="lede">
                A strict, theatrical, 3,000-year-old vampire judge. Give him the hackathon and your submission. He digs up the judging
                criteria, the prize categories and what past winners had in common, checks your code for the partner tech you claim, and
                tells you bluntly, with evidence, why you would or wouldn't win, and exactly what to fix.
              </p>
              <div className="hero-btns">
                <button type="button" className="summon ghost" onClick={() => showExample('weak')}>See an example judgement</button>
                <button type="button" className="link" onClick={() => showExample('strong')}>…or a rare good one</button>
              </div>
            </section>

            <ModePicker mode={mode} onChange={setMode} />
            <ReviewForm mode={mode} busy={busy} onSubmit={summon} />
            <DigLog lines={lines} busy={busy} />
            {error && <p className="form-error big" role="alert">{error}</p>}
          </>
        )}

        <div ref={verdictRef}>{verdict && !onBacktest && <VerdictCard v={verdict} />}</div>
      </main>

      <footer className="foot">
        <p>
          Judge Fangs is an original character. Words by an open-weight model (Gemma), voice by ElevenLabs. Your text is sent to the
          hosted model to be judged and is never stored.
        </p>
      </footer>
      <FangsSprite ref={fangs} />
    </>
  );
}
