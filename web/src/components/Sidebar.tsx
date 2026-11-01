import { removeLesson, useCases, useLessons } from '../store';
import { Countdown, StageChip } from './Chips';
import { Bubble, SpriteAvatar } from './Sprite';

interface Props {
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onHome: () => void;
  onBacktest: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ activeId, onOpen, onNew, onHome, onBacktest, mobileOpen, onCloseMobile }: Props) {
  const cases = useCases();
  const lessons = useLessons();
  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Case files">
      <div className="side-head">
        <button type="button" className="brand" onClick={onHome} aria-label="Judge Fangs home">
          <SpriteAvatar crop scale={2} expression="stern" />
          <span>
            <span className="brand-name">Judge Fangs</span>
            <span className="brand-sub">Hackathon companion</span>
          </span>
        </button>
        <button type="button" className="icon-btn mobile-only" onClick={onCloseMobile} aria-label="Close menu">✕</button>
      </div>

      <button type="button" className="btn btn-outline new-case" onClick={onNew}>+ Open a new case</button>

      <nav className="cases" aria-label="Your hackathons">
        <h2 className="side-label">Case files</h2>
        {cases.length === 0 ? (
          <div className="side-empty">
            <Bubble>No cases? A vampire with nothing to judge is just a man in a cape.</Bubble>
          </div>
        ) : (
          <ul>
            {cases.map((c) => (
              <li key={c.id}>
                <button type="button" className={`case-item ${c.id === activeId ? 'active' : ''}`} onClick={() => onOpen(c.id)} aria-current={c.id === activeId ? 'page' : undefined}>
                  <span className="case-name">{c.name}{c.demo && <span className="demo-tag">example</span>}</span>
                  <span className="case-meta">
                    <StageChip stage={c.stage} />
                    <Countdown brief={c.brief} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <section className="lessons" aria-label="Lessons learned">
        <h2 className="side-label">Lessons learned</h2>
        {lessons.length === 0 ? (
          <p className="side-note">No lessons yet. Debrief a hackathon and the Count will write some.</p>
        ) : (
          <ul>
            {lessons.slice(0, 8).map((l, i) => (
              <li key={l.at + i} title={`From ${l.caseName}`}>
                <span>{l.text}{l.caseId.startsWith('demo-') && <em className="lesson-src"> · example</em>}</span>
                <button type="button" className="icon-btn tiny" aria-label={`Forget lesson: ${l.text}`} onClick={() => removeLesson(i)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="side-foot">
        <button type="button" className="link" onClick={onBacktest}>Backtest lab</button>
        <span className="fine">Cases live in this browser only.</span>
      </footer>
    </aside>
  );
}
