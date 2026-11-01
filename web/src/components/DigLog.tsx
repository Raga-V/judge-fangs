import { SpriteAvatar } from './Sprite';

/** The streamed digging log, with the Count reading his papers. */
export default function DigLog({ lines, busy, title = 'The Count digs' }: { lines: string[]; busy: boolean; title?: string }) {
  if (!lines.length && !busy) return null;
  return (
    <section className="dig-log fade-rise" aria-live="polite" aria-label="The Count's digging log">
      <div className="dig-head">
        <SpriteAvatar animate={busy ? 'dig' : false} expression={busy ? 'reading' : 'stern'} pose={busy ? 'read1' : 'idle'} scale={2} />
        <div>
          <h4>{title}</h4>
          <p className="muted small">{busy ? 'Reading the rules, the entries and your work…' : 'Done.'}</p>
        </div>
      </div>
      <ol>
        {lines.map((l, i) => <li key={i}>{l}</li>)}
        {busy && <li className="pending"><span className="candle" aria-hidden="true" /> <span className="dots">thinking</span></li>}
      </ol>
    </section>
  );
}
