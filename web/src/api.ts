import type { ReviewRequest, Verdict } from './types';

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

/** Stream the digging log over SSE; fall back to one JSON response if streaming fails. */
export async function streamReview(req: ReviewRequest, onLog: (msg: string) => void): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/review/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    return jsonReview(req, onLog);
  }
  if (!res.ok || !res.body) {
    if (res.status === 413) throw new Error('That is far too long, mortal.');
    return jsonReview(req, onLog);
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
      else if (ev.event === 'verdict') return ev.data as Verdict;
      else if (ev.event === 'error') throw new Error(ev.data.msg || 'The tribunal fell silent.');
    }
  }
  throw new Error('The tribunal fell silent before the verdict. Try again.');
}

export async function jsonReview(req: ReviewRequest, onLog: (msg: string) => void, path = '/api/review'): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error('The tribunal is asleep (the API did not answer). Try an example judgement meanwhile.');
  }
  const body = await res.json().catch(() => ({}));
  (body.logs || []).forEach((l: string) => onLog(l));
  if (!res.ok || !body.verdict) throw new Error(body.error || (body.detail && 'The Count could not read that request.') || `The tribunal answered ${res.status}.`);
  return body.verdict as Verdict;
}

export async function getVerdict(id: string): Promise<Verdict> {
  const r = await fetch(`${API_BASE}/api/verdict/${encodeURIComponent(id)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'That verdict could not be found.');
  return body;
}

export async function scoreBacktest(results: { url: string; title: string; overall: number }[], winners: string[], topN: number) {
  const r = await fetch(`${API_BASE}/api/backtest/score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ results, winners, top_n: topN }),
  });
  if (!r.ok) throw new Error('Scoring failed.');
  return r.json();
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
