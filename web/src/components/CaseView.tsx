import { deleteCase, exportCase, updateCase } from '../store';
import type { Case, Stage, Tab } from '../types';
import { Countdown, STAGES } from './Chips';
import type { RoamerHandle } from './Sprite';
import BriefTab from './tabs/BriefTab';
import DebriefTab from './tabs/DebriefTab';
import IdeateTab from './tabs/IdeateTab';
import JudgeTab from './tabs/JudgeTab';

export const TABS: { id: Tab; label: string; when: string }[] = [
  { id: 'brief', label: 'Brief', when: 'What this jury wants' },
  { id: 'ideate', label: 'Ideate', when: 'Before' },
  { id: 'judge', label: 'Judge', when: 'During' },
  { id: 'debrief', label: 'Debrief', when: 'After' },
];

interface Props {
  c: Case;
  tab: Tab;
  onTab: (t: Tab) => void;
  onDeleted: () => void;
  roamer: React.RefObject<RoamerHandle | null>;
  chatOpen: boolean;
  onToggleChat: () => void;
}

export default function CaseView({ c, tab, onTab, onDeleted, roamer, chatOpen, onToggleChat }: Props) {
  return (
    <div className="case">
      <header className="case-head fade-rise">
        <div className="case-title">
          <p className="eyebrow">Case file</p>
          <h1>{c.name}</h1>
          <div className="case-chips">
            <label className="stage-select">
              <span className="sr-only">Stage</span>
              <select value={c.stage} className={`chip stage-${c.stage}`}
                onChange={(e) => updateCase(c.id, (x) => ({ ...x, stage: e.target.value as Stage }))}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <Countdown brief={c.brief} />
            {c.demo && <span className="chip chip-quiet">Example case</span>}
          </div>
        </div>
        <div className="case-actions">
          <button type="button" className={`btn btn-outline ${chatOpen ? 'on' : ''}`} onClick={onToggleChat} aria-pressed={chatOpen}>Ask Fangs</button>
          <details className="menu">
            <summary className="btn btn-ghost" aria-label="Case actions">⋯</summary>
            <div className="menu-pop">
              <button type="button" onClick={() => exportCase(c)}>Export case (JSON)</button>
              <button type="button" className="danger" onClick={() => {
                if (confirm(`Delete the case “${c.name}”? Its ideas, verdicts and chat go with it. Lessons learned stay.`)) {
                  deleteCase(c.id);
                  onDeleted();
                }
              }}>Delete case</button>
            </div>
          </details>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Hackathon timeline">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => onTab(t.id)}>
            <span className="tab-label">{t.label}</span>
            <span className="tab-when">{t.when}</span>
          </button>
        ))}
      </nav>

      <div className="tab-panel" role="tabpanel" key={tab}>
        {tab === 'brief' && <BriefTab c={c} />}
        {tab === 'ideate' && <IdeateTab c={c} roamer={roamer} />}
        {tab === 'judge' && <JudgeTab c={c} roamer={roamer} />}
        {tab === 'debrief' && <DebriefTab c={c} roamer={roamer} />}
      </div>
    </div>
  );
}
