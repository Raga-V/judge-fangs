import { createFangs } from './fangs-sprite.js';

const api = window.fangs;
const canvas = document.getElementById('fangs');
const bubble = document.getElementById('bubble');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fangs = createFangs({ canvas, scale: 4, getWidth: () => innerWidth, reducedMotion: reduced, dropFrom: innerHeight });
fangs.drop();

/* only the bubble catches clicks; everything else passes through to your apps */
bubble.addEventListener('mouseenter', () => api.interactive(true));
bubble.addEventListener('mouseleave', () => api.interactive(false));
addEventListener('keydown', (e) => { if (e.key === 'Escape') api.dismiss(); });

/* keep the bubble above the Count as he walks */
(function follow() {
  const w = bubble.offsetWidth || 340;
  const left = Math.max(12, Math.min(innerWidth - w - 12, fangs.x + 64 - w / 2));
  bubble.style.left = left + 'px';
  bubble.style.setProperty('--tail', Math.max(16, Math.min(w - 32, fangs.x + 56 - left)) + 'px');
  requestAnimationFrame(follow);
})();

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

function show(...nodes) {
  bubble.replaceChildren(...nodes.filter((n) => n != null));
  bubble.hidden = false;
}

function gavelSound() {
  try {
    const c = new AudioContext();
    for (let i = 0; i < 2; i++) {
      const t = c.currentTime + i * 0.33;
      const o = c.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
      const g = c.createGain();
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.25);
    }
  } catch { /* no audio */ }
}

async function hear(text) {
  const bytes = await api.voice(text);
  if (bytes) {
    const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })));
    audio.play().catch(() => {});
  } else if (window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.6;
    u.rate = 0.88;
    speechSynthesis.speak(u);
  }
}

const dismissBtn = (label = 'Dismiss') => el('button', { class: 'quiet', onclick: () => api.dismiss() }, label);

async function ask() {
  const preview = await api.preview();
  if (!preview) {
    show(el('h1', {}, 'Judge Fangs'),
      el('p', { class: 'err' }, 'I could not see your screen, mortal. (On a Mac, allow Screen Recording for this app.)'),
      el('div', { class: 'btns' }, dismissBtn()));
    return;
  }
  show(
    el('h1', {}, 'Shall I judge this, mortal?'),
    el('img', { src: preview, alt: 'Preview of your screen' }),
    el('p', { class: 'fine' }, 'Nothing is sent until you say so. The picture is never saved.'),
    el('div', { class: 'btns' }, el('button', { onclick: judge }, 'Judge this'), dismissBtn('Never mind')),
  );
}

async function judge() {
  fangs.dig();
  show(el('h1', {}, 'The Count digs…'),
    el('p', {}, 'Reading your screen, fetching the rules, checking your claims.'),
    el('p', { class: 'fine' }, 'This can take a minute.'));
  const res = await api.judge();
  if (res.error || !res.verdict) {
    fangs.verdict('unimpressed');
    show(el('h1', {}, 'Objection.'), el('p', { class: 'err' }, res.error || 'The tribunal fell silent.'), el('div', { class: 'btns' }, dismissBtn()));
    return;
  }
  const v = res.verdict;
  fangs.verdict(v.expression);
  gavelSound();
  const why = (v.why_not_winning || []).slice(0, 2);
  show(
    el('div', { class: 'score' }, String(v.overall), el('small', {}, '/100')),
    el('h1', {}, res.seen && res.seen.title ? res.seen.title.slice(0, 60) : 'The verdict'),
    el('p', { class: 'says' }, '“' + v.count_says + '”'),
    why.length ? el('ul', {}, ...why.map((w) => el('li', {}, w))) : null,
    el('p', {}, el('strong', {}, 'Three fixes:')),
    el('ol', {}, ...v.top_fixes.map((f) => el('li', {}, f))),
    v.banner ? el('p', { class: 'fine' }, v.banner) : null,
    el('div', { class: 'btns' },
      el('button', { onclick: () => hear(v.voice_line) }, 'Hear the sentence'),
      el('button', { onclick: () => api.open(v.id) }, 'Open full verdict'),
      dismissBtn()),
  );
  hear(v.voice_line);
}

setTimeout(ask, reduced ? 0 : 700);
