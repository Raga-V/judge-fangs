/* Judge Fangs: pixel-art sprite, drawn in code. Shared by the web app and the desktop companion.
 * Frames are 32x32 arrays of palette characters. "." is transparent. Patches overlay a base
 * frame; in a patch "." means "leave as is" and "_" means "make transparent". */

export const SIZE = 32;

export const PALETTE = {
  k: '#140a10', // outline
  w: '#efe8da', // wig
  v: '#c8bda8', // wig shade
  s: '#e9dfe9', // skin
  z: '#c3b3c6', // skin shade
  e: '#2b0b14', // eye
  b: '#3a2a32', // brow
  m: '#6b1424', // mouth
  f: '#ffffff', // fang
  c: '#1d1422', // robe
  d: '#33243c', // robe highlight
  l: '#8e1330', // crimson collar
  L: '#5c0a1e', // crimson shade
  g: '#e8c46a', // gold
  G: '#a8842e', // gold shade
  p: '#bfe6ff', // pince-nez lens
  o: '#8a5a2e', // gavel wood
  O: '#4e2d14', // gavel wood shade
  y: '#f3e7c9', // parchment
  Y: '#c9b88f', // parchment ink
  h: '#0c070a', // shoe
};

const BASE = [
  '................................',
  '..........kkkkkkkkkkkk..........',
  '.........kwwwvwwwwvwwwk.........',
  '........kwwvwwwwwwwwvwwk........',
  '........kwvwwvwwwwvwwvwk........',
  '........kwvwsssssbbswvwk........',
  '........kwwvsbbssssswwvk........',
  '........kwvwspeggepswvwk........',
  '........kvwwssszsssswwvk........',
  '........kwvwssmmmmsswvwk........',
  '.......kkwwvssfssfsswwvkk.......',
  '.......lkvwwzsssssszwvwkl.......',
  '.......lkwvwlzsssszlwvwkl.......',
  '.......lkvwvllzzzzllvwvkl.......',
  '.......lkLlllccwwcclllLkl.......',
  '.......klcgccccwwccccgclk.......',
  '.......kcccgcccwwcccgccck.......',
  '.......kccdcgccwwccgcdcck.......',
  '.......kccdccgccccgccdcck.......',
  '.......kccdcccgGGgcccdcck.......',
  '.......kccdccccggccccdcck.......',
  '.......kccdccccccccccdcck.......',
  '.......kscdccccccccccdcsk.......',
  '.......kzcccccccccccccczk.......',
  '......kccdccccccccccccdcck......',
  '......kccdccccccccccccdcck......',
  '......kLccccccccccccccccLk......',
  '......kkkkkkkkkkkkkkkkkkkk......',
  '...........kcck..kcck...........',
  '...........kcck..kcck...........',
  '..........khhhk..khhhk..........',
  '..........kkkkk..kkkkk..........',
];

/* Faces: rows 5-11, columns 12-19 */
const FACES = {
  stern: ['sssssbbs', 'sbbsssss', 'speggeps', 'ssszssss', 'ssmmmmss', 'ssfssfss', 'zssssssz'],
  reading: ['ssssssss', 'sbbssbbs', 'ssessess', 'spsggsps', 'sssmmsss', 'ssssssss', 'zssssssz'],
  unimpressed: ['sbssssbs', 'ssbssbss', 'speggeps', 'ssszssss', 'sssmmsss', 'ssmssmss', 'zssssssz'],
  grudging: ['sssssbbs', 'sbbsssss', 'speggeps', 'ssszssss', 'sssmmmms', 'ssfsssss', 'zssssssz'],
  impressed: ['sbbssbbs', 'ssssssss', 'speggeps', 'ssszssss', 'smssssms', 'ssmffmss', 'zssssssz'],
};

/* Legs: rows 28-31 */
const LEGS = {
  stand: BASE.slice(28),
  walk1: ['..........kcck...kcck...........', '.........kcck....kcck...........', '........khhhk....khhhk..........', '........kkkkk....kkkkk..........'],
  walk2: ['...........kcck...kcck..........', '...........kcck....kcck.........', '..........khhhk....khhhk........', '..........kkkkk....kkkkk........'],
  tap: ['...........kcck..kcck...........', '...........kcck..khhhk..........', '..........khhhk..kkkkk..........', '..........kkkkk.................'],
};

/* Arm poses: [row, col, pattern] overlays */
const ARMS = {
  rest: [],
  read: [
    [19, 10, 'ckkkkkkkkkkc'],
    [20, 10, 'ckyyyyyyyykc'],
    [21, 10, 'skyYYYYYYyks'],
    [22, 10, 'skyyyyyyyyks'],
    [23, 10, 'ckyYYYYyyykc'],
    [24, 10, 'ckkkkkkkkkkc'],
    [22, 8, 'c'], [22, 23, 'c'], [23, 8, 'c'], [23, 23, 'c'],
  ],
  gavelUp: [
    [5, 23, 'kkkkkkk'],
    [6, 23, 'kOoooOk'],
    [7, 23, 'kOoooOk'],
    [8, 23, 'kkkokkk'],
    [9, 25, 'kok'],
    [10, 25, 'kok'],
    [11, 24, 'ksssk'],
    [12, 23, 'kcck'],
    [13, 22, 'kcck'],
    [14, 21, 'kcck'],
    [15, 21, 'cc'],
    [22, 23, 'c'], [23, 23, 'c'],
  ],
  gavelDown: [
    [14, 23, 'kcck'],
    [15, 22, 'kcccck'],
    [16, 23, 'kccsk'],
    [17, 25, 'kssk'],
    [18, 25, 'kok'],
    [19, 23, 'kkkokkk'],
    [20, 23, 'kOoooOk'],
    [21, 23, 'kOoooOk'],
    [22, 23, 'kkkkkkk'],
    [23, 22, 'g.g.g'],
    [22, 22, 'c'], [23, 23, 'c'],
  ],
};

export const EXPRESSIONS = Object.keys(FACES);
export const POSES = ['idle', 'walk1', 'walk2', 'tapUp', 'tapDown', 'read1', 'read2', 'gavelUp', 'gavelDown'];

function overlay(rows, row, col, pattern) {
  const r = rows[row].split('');
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '.' || col + i < 0 || col + i >= SIZE) continue;
    r[col + i] = ch === '_' ? '.' : ch;
  }
  rows[row] = r.join('');
}

/** Build one 32x32 frame for a pose and an expression. */
export function composeFrame(pose, expression) {
  const rows = BASE.slice();
  const face = FACES[expression] || FACES.stern;
  face.forEach((pat, i) => overlay(rows, 5 + i, 12, pat));
  const legs = { walk1: 'walk1', walk2: 'walk2', tapUp: 'tap', read2: 'tap' }[pose] || 'stand';
  LEGS[legs].forEach((pat, i) => { rows[28 + i] = pat; });
  const arms = pose.startsWith('read') ? 'read' : pose === 'gavelUp' ? 'gavelUp' : pose === 'gavelDown' ? 'gavelDown' : 'rest';
  for (const [r, c, pat] of ARMS[arms]) overlay(rows, r, c, pat);
  return rows;
}

/** Draw a frame crisply at an integer scale. */
export function drawFrame(ctx, rows, scale, flip) {
  ctx.clearRect(0, 0, SIZE * scale, SIZE * scale);
  for (let y = 0; y < SIZE; y++) {
    const row = rows[y];
    for (let x = 0; x < SIZE; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = PALETTE[ch] || '#ff00ff';
      const dx = flip ? SIZE - 1 - x : x;
      ctx.fillRect(dx * scale, y * scale, scale, scale);
    }
  }
}

/**
 * The roaming judge. The host positions the canvas; this moves it along the bottom edge.
 * opts: { canvas, scale, getWidth(): number, reducedMotion?: boolean }
 * Returns { dig(), verdict(expression), idle(), roam(), drop(), destroy() }.
 */
export function createFangs(opts) {
  const { canvas } = opts;
  const scale = opts.scale || 4;
  const reduced = !!opts.reducedMotion;
  const ctx = canvas.getContext('2d');
  canvas.width = SIZE * scale;
  canvas.height = SIZE * scale;
  canvas.style.imageRendering = 'pixelated';
  const cache = new Map();
  const frame = (pose, expr) => {
    const key = pose + ':' + expr;
    if (!cache.has(key)) cache.set(key, composeFrame(pose, expr));
    return cache.get(key);
  };
  let x = Math.max(0, (opts.getWidth() - SIZE * scale) * 0.8);
  let y = 0;
  let targetX = x;
  let dir = -1;
  let mode = 'roam';
  let expression = 'stern';
  let t0 = performance.now();
  let pauseUntil = performance.now() + 1500;
  let modeUntil = 0;
  let raf = 0;
  let last = performance.now();
  let dropV = 0;

  function place() {
    canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const w = Math.max(SIZE * scale, opts.getWidth());
    const maxX = w - SIZE * scale;
    let pose = 'idle';
    const phase = Math.floor((now - t0) / 220) % 2;
    if (mode === 'drop') {
      dropV += 2200 * dt;
      y = Math.min(0, y + dropV * dt);
      pose = 'idle';
      if (y >= 0) { mode = 'roam'; pauseUntil = now + 900; }
    } else if (mode === 'roam') {
      if (now < pauseUntil) {
        pose = (Math.floor((now - t0) / 1600) % 3 === 2 && !reduced) ? (phase ? 'tapUp' : 'tapDown') : 'idle';
      } else {
        if (Math.abs(targetX - x) < 2) {
          targetX = Math.random() * maxX;
          pauseUntil = now + 1800 + Math.random() * 3000;
        } else {
          dir = targetX > x ? 1 : -1;
          x += dir * (reduced ? 0 : 38) * dt;
          if (reduced) x = targetX;
          pose = phase ? 'walk1' : 'walk2';
        }
      }
    } else if (mode === 'dig') {
      pose = reduced ? 'read1' : (phase ? 'read1' : 'read2');
    } else if (mode === 'verdict') {
      const k = Math.floor((now - t0) / 260);
      pose = k < 6 && !reduced ? (k % 2 ? 'gavelDown' : 'gavelUp') : 'gavelDown';
      if (now > modeUntil) { mode = 'roam'; pauseUntil = now + 1500; }
    }
    x = Math.max(0, Math.min(maxX, x));
    const expr = mode === 'dig' ? 'reading' : expression;
    drawFrame(ctx, frame(pose, expr), scale, dir > 0 && mode === 'roam');
    place();
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    dig() { mode = 'dig'; t0 = performance.now(); },
    verdict(expr) { expression = EXPRESSIONS.includes(expr) ? expr : 'stern'; mode = 'verdict'; t0 = performance.now(); modeUntil = t0 + 9000; },
    idle() { mode = 'roam'; expression = 'stern'; },
    roam() { mode = 'roam'; },
    drop() { y = -(opts.dropFrom || 600); dropV = 0; mode = 'drop'; },
    get x() { return x; },
    destroy() { cancelAnimationFrame(raf); },
  };
}
