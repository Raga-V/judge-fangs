import { SpriteAvatar, Bubble } from './Sprite';

const FEATURES = [
  { tab: 'Ideate', title: 'Before: pick the idea that can win', body: 'Fangs judges your ideas against this jury’s criteria and the time left, or suggests three original ones that dodge what everyone else is building.', pose: 'read1', expr: 'reading' },
  { tab: 'Judge', title: 'During: know your score before the jury does', body: 'Paste your DEV post, repo or draft. Get a wax-sealed verdict with evidence quotes, three fixes, a better title, and your score climbing draft by draft.', pose: 'gavelDown', expr: 'grudging' },
  { tab: 'Debrief', title: 'After: learn why the winners won', body: 'Compare your entry with the actual winners. Fangs writes three lessons and remembers them in every future case.', pose: 'idle', expr: 'impressed' },
] as const;

export default function Landing({ onOpenCase, onExample }: { onOpenCase: () => void; onExample: () => void }) {
  return (
    <div className="landing">
      <section className="hero fade-rise">
        <div className="hero-art">
          <SpriteAvatar scale={7} animate="gavel" expression="stern" />
          <div className="hero-bubble"><Bubble tail="down">Order. Order! Bring me your hackathon, mortal.</Bubble></div>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">On every hackathon jury since the fall of Rome</p>
          <h1>Judge Fangs.</h1>
          <p className="hero-sub">Your hackathon companion, from idea to verdict.</p>
          <p className="lede">
            Open a case for each hackathon you enter. The Count digs up what this jury actually rewards, judges your ideas and drafts with
            evidence, counsels you on demand, and tells you afterwards exactly why the winners won.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-lg" onClick={onOpenCase}>Open your first case</button>
            <button type="button" className="btn btn-outline btn-lg" onClick={onExample}>See an example case</button>
          </div>
          <p className="fine">No account. Your cases stay in this browser.</p>
        </div>
      </section>

      <section className="features" aria-label="What Judge Fangs does">
        {FEATURES.map((f, i) => (
          <article key={f.tab} className="feature card fade-rise" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <div className="feature-top">
              <SpriteAvatar scale={2} crop pose={f.pose} expression={f.expr} />
              <span className="pixel-label">{f.tab}</span>
            </div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
