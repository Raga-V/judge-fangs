import type { Brief, ChatMsg, Debrief, GeneratedIdea, JudgedIdea, ReviewRequest, Source, Verdict } from './types';

// Render's fromService gives a bare host ("fangs-api.onrender.com"), so add the scheme if missing.
const rawBase: string = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');
export const API_BASE: string = rawBase && !/^https?:\/\//.test(rawBase) ? `https://${rawBase}` : rawBase;

export interface ServerConfig {
  demo: boolean;
  voice: boolean;
  search: boolean;
  model: string | null;
  banner: string | null;
}

export async function getConfig(): Promise<ServerConfig | null> {
  try {
    const r = await fetch(`${API_BASE}/api/config`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export interface SSEEvent {
  event: string;
  data: any;
}

/** Parse a chunk of text/event-stream. Returns complete events and the unparsed remainder. */
export function parseSSE(buffer: string): { events: SSEEvent[]; rest: string } {
  const events: SSEEvent[] = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) });
    } catch {
      /* ignore a malformed event */
    }
  }
  return { events, rest };
}

async function postJSON(path: string, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('The tribunal is asleep (the API did not answer). Try again in a minute.');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || (out.detail ? 'The Count could not read that request.' : `The tribunal answered ${res.status}.`));
  return out;
}

/** POST and read server-sent events until `doneEvent`. */
async function stream(path: string, body: unknown, doneEvent: string, onLog: (msg: string) => void): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('The tribunal is asleep (the API did not answer). Try again in a minute.');
  }
  if (!res.ok || !res.body) {
    const out = await res.json().catch(() => ({}));
    throw new Error(out.error || `The tribunal answered ${res.status}.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSSE(buffer);
    buffer = rest;
    for (const ev of events) {
      if (ev.event === 'log') onLog(ev.data.msg);
      else if (ev.event === doneEvent) return ev.data;
      else if (ev.event === 'error') throw new Error(ev.data.msg || 'The tribunal fell silent.');
    }
  }
  throw new Error('The tribunal fell silent before it finished. Try again.');
}

export function streamReview(req: ReviewRequest, onLog: (msg: string) => void): Promise<Verdict> {
  return stream('/api/review/stream', req, 'verdict', onLog);
}

export async function jsonReview(req: ReviewRequest, onLog: (msg: string) => void, path = '/api/review'): Promise<Verdict> {
  const body = await postJSON(path, req);
  (body.logs || []).forEach((l: string) => onLog(l));
  if (!body.verdict) throw new Error('The tribunal fell silent.');
  return body.verdict as Verdict;
}

export interface CaseDig {
  brief: Brief;
  patterns: string[];
  winner_stats: Record<string, number> | null;
  winners: { title: string; url: string }[];
  sources: Source[];
  winners_url?: string | null;
  banner?: string;
}

export function streamCase(req: { url?: string; name?: string; text?: string; winners_url?: string }, onLog: (m: string) => void): Promise<CaseDig> {
  return stream('/api/case/stream', req, 'case', onLog);
}

export async function askFangs(body: { message: string; context: string; history: Pick<ChatMsg, 'role' | 'content'>[]; tab: string }): Promise<{ reply: string; banner?: string }> {
  return postJSON('/api/chat', body);
}

export async function judgeIdeas(body: { brief: Brief; ideas: string[]; patterns: string[]; user_context?: string }): Promise<{ ideas: JudgedIdea[]; best: number; banner?: string }> {
  return postJSON('/api/ideas', { mode: 'judge', ...body });
}

export async function generateIdeas(body: { brief: Brief; patterns: string[]; user_context?: string }): Promise<{ ideas: GeneratedIdea[]; count_says?: string; banner?: string }> {
  return postJSON('/api/ideas', { mode: 'generate', ideas: [], ...body });
}

export async function debriefCase(body: {
  brief: Brief; submission: { title?: string; url?: string; text?: string; verdict_summary?: string };
  winners_url?: string; winners_text?: string; result: 'won' | 'lost';
}): Promise<{ logs: string[]; debrief: Debrief; banner?: string }> {
  return postJSON('/api/debrief', body);
}

export async function getVerdict(id: string): Promise<Verdict> {
  const r = await fetch(`${API_BASE}/api/verdict/${encodeURIComponent(id)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'That verdict could not be found.');
  return body;
}

export async function scoreBacktest(results: { url: string; title: string; overall: number }[], winners: string[], topN: number) {
  return postJSON('/api/backtest/score', { results, winners, top_n: topN });
}

let audio: HTMLAudioElement | null = null;

/** "Hear the sentence": the server's ElevenLabs voice, else the browser's own. */
export async function speak(text: string): Promise<'eleven' | 'browser' | 'none'> {
  audio?.pause();
  window.speechSynthesis?.cancel();
  try {
    const r = await fetch(`${API_BASE}/api/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('audio')) throw new Error('no audio');
    audio = new Audio(URL.createObjectURL(await r.blob()));
    await audio.play();
    return 'eleven';
  } catch {
    const synth = window.speechSynthesis;
    if (!synth) return 'none';
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.6;
    u.rate = 0.88;
    const voices = synth.getVoices();
    const v = voices.find((x) => /en-GB/i.test(x.lang) && /male|daniel|george|arthur/i.test(x.name)) || voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    synth.speak(u);
    return 'browser';
  }
}
