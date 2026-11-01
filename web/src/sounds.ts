/* Small sounds generated with the Web Audio API: a gavel bang and a quill scratch. */
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('fangs-muted') === '1';

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem('fangs-muted', m ? '1' : '0');
}

function ac(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noise(c: AudioContext, secs: number) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * secs), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function gavel(times = 2) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  for (let i = 0; i < times; i++) {
    const t = c.currentTime + i * 0.34;
    // the wooden knock: a short noise burst through a band-pass
    const s = c.createBufferSource();
    s.buffer = noise(c, 0.15);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    // the low thump of the bench
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const og = c.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + 0.25);
  }
}

export function quill() {
  if (muted) return;
  const c = ac();
  if (!c) return;
  for (let i = 0; i < 3; i++) {
    const t = c.currentTime + i * 0.11;
    const s = c.createBufferSource();
    s.buffer = noise(c, 0.1);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3200 + i * 500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
  }
}
