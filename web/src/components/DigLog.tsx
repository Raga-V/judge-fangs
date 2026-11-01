export default function DigLog({ lines, busy }: { lines: string[]; busy: boolean }) {
  if (!lines.length && !busy) return null;
  return (
    <section className="dig-log" aria-live="polite" aria-label="The Count's digging log">
      <h3>The Count digs</h3>
      <ol>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {busy && <li className="dig-pending"><span className="candle" aria-hidden="true" /> …</li>}
      </ol>
    </section>
  );
}
