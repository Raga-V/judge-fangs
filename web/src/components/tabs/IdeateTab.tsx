import { useState } from 'react';
import { generateIdeas, judgeIdeas } from '../../api';
import { userContext } from '../../caseContext';
import { gavel } from '../../sounds';
import { uid, updateCase, useLessons } from '../../store';
import type { Case, Idea } from '../../types';
import { EmptyState, type RoamerHandle } from '../Sprite';
import { scoreClass, WaxSeal } from '../VerdictCard';

export default function IdeateTab({ c, roamer }: { c: Case; roamer: React.RefObject<RoamerHandle | null> }) {
  const lessons = useLessons();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'' | 'judge' | 'generate'>('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  function addIdea(text: string, extra: Partial<Idea> = {}) {
    const t = text.trim();
    if (!t) return;
    if (c.ideas.length >= 5) return setError('Five ideas is plenty, mortal. Remove one first.');
    updateCase(c.id, (x) => ({ ...x, ideas: [...x.ideas, { id: uid('idea-'), text: t, from: 'mine', ...extra }] }));
    setDraft('');
  }

  async function judgeAll() {
    const list = c.ideas;
    if (!list.length) return setError('Add at least one idea first.');
    setBusy('judge'); setError(''); roamer.current?.dig();
    try {
      const out = await judgeIdeas({ brief: c.brief, ideas: list.map((i) => i.text), patterns: c.patterns, user_context: userContext(c, lessons) || undefined });
      updateCase(c.id, (x) => ({ ...x, ideas: x.ideas.map((i, k) => (out.ideas[k] ? { ...i, judged: out.ideas[k] } : i)) }));
      const best = out.ideas[out.best];
      gavel();
      roamer.current?.verdict(best && best.overall >= 75 ? 'impressed' : best && best.overall >= 50 ? 'grudging' : 'unimpressed',
        best ? `If I had to build one: idea ${out.best + 1}.` : undefined);
      setNote(out.banner || '');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(''); }
  }

  async function generate() {
    setBusy('generate'); setError(''); roamer.current?.dig();
    try {
      const out = await generateIdeas({ brief: c.brief, patterns: c.patterns, user_context: userContext(c, lessons) || undefined });
      updateCase(c.id, (x) => ({ ...x, generated: out.ideas }));
      roamer.current?.verdict('grudging', out.count_says || 'Three ideas. You may thank me later.');
      setNote(out.banner || '');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(''); }
  }

  const choose = (id: string) => updateCase(c.id, (x) => ({ ...x, chosenIdeaId: x.chosenIdeaId === id ? undefined : id, stage: x.stage === 'ideating' ? 'building' : x.stage }));
  const star = (id: string) => updateCase(c.id, (x) => ({ ...x, ideas: x.ideas.map((i) => (i.id === id ? { ...i, starred: !i.starred } : i)) }));
  const remove = (id: string) => updateCase(c.id, (x) => ({ ...x, ideas: x.ideas.filter((i) => i.id !== id), chosenIdeaId: x.chosenIdeaId === id ? undefined : x.chosenIdeaId }));
  const sorted = [...c.ideas].sort((a, b) => (b.judged?.overall ?? -1) - (a.judged?.overall ?? -1));

  return (
    <div className="ideate">
      <section className="card form fade-rise">
        <h2 className="section-title">Your ideas <span className="muted small">({c.ideas.length}/5)</span></h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); addIdea(draft); }}>
          <input className="grow" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1200} placeholder="An idea in a sentence or two…" aria-label="New idea" />
          <button type="submit" className="btn btn-outline" disabled={!draft.trim()}>Add</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {note && <p className="banner">{note}</p>}
        <div className="row between">
          <p className="fine">Each idea is scored on originality, theme fit, buildability before the deadline and partner-category fit.</p>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={generate} disabled={!!busy}>{busy === 'generate' ? 'Conjuring…' : 'Give me ideas'}</button>
            <button type="button" className="btn btn-primary" onClick={judgeAll} disabled={!!busy || !c.ideas.length}>{busy === 'judge' ? 'Judging…' : 'Judge my ideas'}</button>
          </div>
        </div>
      </section>

      {sorted.length === 0 && !(c.generated?.length) && (
        <EmptyState quip="An empty docket. Bring me ideas, or press “Give me ideas” and I shall supply some." animate={busy ? 'dig' : true} />
      )}

      <div className="idea-list">
        {sorted.map((i) => {
          const j = i.judged;
          const chosen = c.chosenIdeaId === i.id;
          return (
            <article key={i.id} className={`idea card fade-rise ${chosen ? 'chosen' : ''}`}>
              <div className="idea-top">
                {j ? <WaxSeal score={j.overall} size={72} stamp={false} /> : <div className="seal-placeholder" aria-hidden="true">?</div>}
                <div className="idea-body">
                  <p className="idea-text">{i.text}</p>
                  {j && <p className="idea-verdict">“{j.verdict}”</p>}
                </div>
                <div className="idea-actions">
                  <button type="button" className={`icon-btn ${i.starred ? 'starred' : ''}`} aria-pressed={!!i.starred} aria-label={i.starred ? 'Unstar' : 'Star'} onClick={() => star(i.id)}>{i.starred ? '★' : '☆'}</button>
                  <button type="button" className="icon-btn" aria-label="Remove idea" onClick={() => remove(i.id)}>✕</button>
                </div>
              </div>
              {j && (
                <>
                  <div className="mini-crits">
                    {j.criteria.map((k) => (
                      <div key={k.name} className="mini-crit" title={k.verdict}>
                        <span className="mc-name">{k.name}</span>
                        <div className={`bar ${scoreClass(k.score)}`}><span style={{ width: `${k.score * 10}%` }} /></div>
                        <span className={`mc-score ${scoreClass(k.score)}`}>{k.score}</span>
                      </div>
                    ))}
                  </div>
                  <div className="how"><strong>How it could win:</strong> {j.how_it_could_win}</div>
                  {j.partners.length > 0 && <div className="chips-wrap">{j.partners.map((p) => <span className="chip chip-prize" key={p}>{p}</span>)}</div>}
                </>
              )}
              <div className="row end">
                <button type="button" className={`btn btn-sm ${chosen ? 'btn-primary' : 'btn-outline'}`} onClick={() => choose(i.id)} aria-pressed={chosen}>
                  {chosen ? '✓ Chosen idea' : 'Choose this idea'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {c.generated && c.generated.length > 0 && (
        <section className="fade-rise">
          <h2 className="section-title">Fangs suggests</h2>
          <div className="patterns-grid">
            {c.generated.map((g) => (
              <article key={g.title} className="card gen">
                <h3>{g.title}</h3>
                <p>{g.pitch}</p>
                {g.why_original && <p className="muted small">{g.why_original}</p>}
                {g.partners.length > 0 && <div className="chips-wrap">{g.partners.map((p) => <span className="chip chip-prize" key={p}>{p}</span>)}</div>}
                <button type="button" className="btn btn-ghost btn-sm" disabled={c.ideas.length >= 5 || c.ideas.some((i) => i.text.startsWith(g.title))}
                  onClick={() => addIdea(`${g.title}: ${g.pitch}`, { from: 'fangs', pitch: g.pitch, partners: g.partners })}>
                  {c.ideas.some((i) => i.text.startsWith(g.title)) ? 'Added' : '+ Add to my ideas'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
