import type { Mode } from '../types';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'hackathon', label: 'Hackathon', hint: 'Judge a submission against what the jury rewards' },
  { id: 'email', label: 'Email', hint: 'Critique an email before you send it' },
  { id: 'idea', label: 'Idea', hint: 'Judge an idea before you build it' },
];

export default function ModePicker({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mode-picker" role="tablist" aria-label="What shall the Count judge?">
      {MODES.map((m) => (
        <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'mode active' : 'mode'} onClick={() => onChange(m.id)}>
          <span className="mode-label">{m.label}</span>
          <span className="mode-hint">{m.hint}</span>
        </button>
      ))}
    </div>
  );
}
