import { useEffect, useRef, useState } from 'react';
import { askFangs } from '../api';
import { buildChatContext } from '../caseContext';
import { updateCase, useLessons } from '../store';
import type { Case, ChatMsg, Tab } from '../types';
import { Bubble, SpriteAvatar } from './Sprite';

const CHIPS: Record<Tab, string[]> = {
  brief: ['What does this jury care about most?', 'Is my idea too similar to past winners?', 'What should I build first?'],
  ideate: ['Which idea should I pick?', 'Is my idea too similar to past winners?', 'Make my best idea more original'],
  judge: ['Fix my weakest criterion', 'Rewrite my title', 'What should I do with 3 hours left?'],
  debrief: ['Why did I lose?', 'What should I do differently next time?', 'Which lesson matters most?'],
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Types out the newest reply once. */
function Typewriter({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(reduced() ? text.length : 0);
  useEffect(() => {
    if (n >= text.length) { onDone(); return; }
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + 3)), 16);
    return () => clearTimeout(t);
  }, [n, text, onDone]);
  return <>{text.slice(0, n)}{n < text.length && <span className="caret" aria-hidden="true">▍</span>}</>;
}

export default function ChatDrawer({ c, tab, open, onClose }: { c: Case; tab: Tab; open: boolean; onClose: () => void }) {
  const lessons = useLessons();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState<string | null>(null); // timestamp of the reply being typed
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }); }, [c.chat.length, busy, typing]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput(''); setError(''); setBusy(true);
    const history = c.chat;
    const mine: ChatMsg = { role: 'user', content: msg, at: new Date().toISOString() };
    updateCase(c.id, (x) => ({ ...x, chat: [...x.chat, mine].slice(-60) }));
    try {
      const out = await askFangs({
        message: msg, tab,
        context: buildChatContext(c, lessons, history),
        history: history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) })),
      });
      const reply: ChatMsg = { role: 'fangs', content: out.reply, at: new Date().toISOString() };
      setTyping(reply.at);
      updateCase(c.id, (x) => ({ ...x, chat: [...x.chat, reply].slice(-60) }));
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <aside className={`chat ${open ? 'open' : ''}`} aria-label={`Ask Fangs: counsel for ${c.name}`} aria-hidden={!open}>
      <header className="chat-head">
        <SpriteAvatar crop scale={2} expression={busy ? 'reading' : 'stern'} animate={busy ? 'dig' : false} pose={busy ? 'read1' : 'idle'} />
        <div>
          <p className="eyebrow">Ask Fangs</p>
          <h2>Counsel for: <span>{c.name}</span></h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close chat">✕</button>
      </header>

      <div className="chat-list" ref={list}>
        {c.chat.length === 0 && (
          <div className="chat-empty"><Bubble>Counsel is in session. Ask, mortal. I know this jury's criteria, your deadline and your verdicts.</Bubble></div>
        )}
        {c.chat.map((m) => (
          <div key={m.at + m.role} className={`msg ${m.role}`}>
            {m.role === 'fangs' && <SpriteAvatar crop scale={1} />}
            <div className="msg-body">
              {m.role === 'fangs' && typing === m.at ? <Typewriter text={m.content} onDone={() => setTyping(null)} /> : m.content}
            </div>
          </div>
        ))}
        {busy && <div className="msg fangs"><SpriteAvatar crop scale={1} expression="reading" /><div className="msg-body dots">The Count consults his ledgers</div></div>}
        {error && <p className="error small">{error}</p>}
      </div>

      <div className="chat-chips" aria-label="Suggested questions">
        {CHIPS[tab].map((q) => <button key={q} type="button" className="chip chip-btn" onClick={() => send(q)} disabled={busy}>{q}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Ask about this hackathon…" aria-label="Your question"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </aside>
  );
}
