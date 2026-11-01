import { useEffect, useRef, useState } from 'react';
import demoCaseJson from '../../app/demo/case.json';
import { getConfig, getVerdict, type ServerConfig } from './api';
import Backtest from './components/Backtest';
import CaseView from './components/CaseView';
import ChatDrawer from './components/ChatDrawer';
import Landing from './components/Landing';
import NewCaseDialog from './components/NewCaseDialog';
import Sidebar from './components/Sidebar';
import { EmptyState, Roamer, type RoamerHandle } from './components/Sprite';
import VerdictCard from './components/VerdictCard';
import { gavel, isMuted, setMuted } from './sounds';
import { addCase, addLessons, getCase, useCases, useLessons } from './store';
import type { Case, Tab, Verdict } from './types';

const DEMO_ID = 'demo-hacktoberfest-week3';
const TAB_IDS: Tab[] = ['brief', 'ideate', 'judge', 'debrief'];

function usePath(): [string, (p: string, replace?: boolean) => void] {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return [path, (p, replace = false) => {
    if (replace) window.history.replaceState({}, '', p);
    else window.history.pushState({}, '', p);
    setPath(p);
  }];
}

/** The bundled example case, as a fresh copy (no API calls needed to view it). */
function demoCase(): Case {
  const d = JSON.parse(JSON.stringify(demoCaseJson)) as Case & Record<string, unknown>;
  for (const k of ['judged_ideas', 'chat_replies', 'chat_default', 'winner_stats', 'winners_url']) delete d[k];
  return { ...d, id: DEMO_ID, demo: true };
}

export default function App() {
  const [path, go] = usePath();
  const cases = useCases();
  const lessons = useLessons();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => window.matchMedia('(min-width: 1200px)').matches);
  const [muted, setMute] = useState(isMuted());
  const [standalone, setStandalone] = useState<Verdict | null>(null);
  const [standaloneError, setStandaloneError] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const roamer = useRef<RoamerHandle>(null);

  useEffect(() => { getConfig().then((c) => { setConfig(c); setApiDown(!c); }); }, []);

  const caseMatch = path.match(/^\/case\/([\w-]+)(?:\/(\w+))?/);
  const activeCase = caseMatch ? cases.find((c) => c.id === caseMatch[1]) : undefined;
  const tab: Tab = (TAB_IDS.includes(caseMatch?.[2] as Tab) ? caseMatch?.[2] : 'brief') as Tab;
  const verdictMatch = path.match(/^\/verdict\/([\w-]+)/);
  const onBacktest = path.startsWith('/backtest');

  // a case URL whose case isn't in this browser (or the demo id): restore the demo, else go home
  useEffect(() => {
    if (caseMatch && !activeCase) {
      if (caseMatch[1] === DEMO_ID) addCase(demoCase());
      else go('/', true);
    }
  }, [caseMatch?.[1], activeCase]);

  useEffect(() => {
    if (!verdictMatch) return;
    setStandalone(null); setStandaloneError('');
    getVerdict(verdictMatch[1]).then((v) => { setStandalone(v); gavel(); roamer.current?.verdict(v.expression); })
      .catch((e) => setStandaloneError(e.message));
  }, [verdictMatch?.[1]]);

  useEffect(() => { roamer.current?.idle(); setMobileNav(false); }, [path]);

  const openCase = (id: string, t: Tab = 'brief') => go(`/case/${id}/${t}`);
  const openExample = () => {
    if (!getCase(DEMO_ID)) addCase(demoCase());
    const demo = getCase(DEMO_ID);
    if (demo?.debrief && !lessons.some((l) => l.caseId === DEMO_ID)) addLessons(demo, demo.debrief.lessons);
    openCase(DEMO_ID);
    roamer.current?.say('An example case. Every tab is filled in: have a look around.', 6000);
  };

  return (
    <div className={`shell ${activeCase && chatOpen ? 'with-chat' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <Sidebar activeId={activeCase?.id || null} onOpen={(id) => openCase(id)} onNew={() => setNewOpen(true)} onHome={() => go('/')}
        onBacktest={() => go('/backtest')} mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)} />

      <div className="mobile-bar">
        <button type="button" className="icon-btn" onClick={() => setMobileNav(true)} aria-label="Open case files">☰</button>
        <select aria-label="Choose a case" value={activeCase?.id || ''} onChange={(e) => (e.target.value === '__new' ? setNewOpen(true) : e.target.value ? openCase(e.target.value) : go('/'))}>
          <option value="">Judge Fangs</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new">+ Open a new case</option>
        </select>
      </div>

      <main id="main" ref={mainRef} className="main">
        <div className="topline">
          {(config?.banner || apiDown) && (
            <p className="banner">{apiDown ? 'The tribunal is asleep (the API did not answer). Your cases and the example still work.' : config?.banner}</p>
          )}
          <button type="button" className="icon-btn sound" onClick={() => { setMuted(!muted); setMute(!muted); }} aria-pressed={muted} aria-label={muted ? 'Turn sounds on' : 'Turn sounds off'}>
            {muted ? '🔇' : '🔔'}
          </button>
        </div>

        {onBacktest ? (
          <Backtest onDig={() => roamer.current?.dig()} onDone={(e) => { roamer.current?.verdict(e); gavel(); }} />
        ) : verdictMatch ? (
          standalone ? <VerdictCard v={standalone} /> : standaloneError
            ? <EmptyState quip={`${standaloneError} Verdicts last one hour on the server.`} expression="unimpressed" />
            : <EmptyState quip="Fetching the verdict from the tribunal's archive…" animate="dig" />
        ) : activeCase ? (
          <CaseView c={activeCase} tab={tab} onTab={(t) => openCase(activeCase.id, t)} onDeleted={() => go('/')} roamer={roamer}
            chatOpen={chatOpen} onToggleChat={() => setChatOpen((x) => !x)} />
        ) : (
          <Landing onOpenCase={() => setNewOpen(true)} onExample={openExample} />
        )}
      </main>

      {activeCase && <ChatDrawer c={activeCase} tab={tab} open={chatOpen} onClose={() => setChatOpen(false)} />}
      {activeCase && !chatOpen && (
        <button type="button" className="chat-fab" onClick={() => setChatOpen(true)}>Ask Fangs</button>
      )}

      <NewCaseDialog open={newOpen} onClose={() => setNewOpen(false)} onDig={(on) => (on ? roamer.current?.dig() : roamer.current?.idle())}
        onCreated={(id) => { setNewOpen(false); openCase(id); gavel(); roamer.current?.verdict('grudging', 'A new case. I have read the rules; now show me your ideas.'); }} />
      <Roamer ref={roamer} host={mainRef} />
    </div>
  );
}
