import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeFrame, EXPRESSIONS, PALETTE, POSES, SIZE } from '../../shared/fangs-sprite.js';
import strong from '../../app/demo/strong.json';
import weak from '../../app/demo/weak.json';
import { parseSSE } from './api';
import { parseUrls, toCSV } from './backtest';
import type { Verdict } from './types';

describe('the build', () => {
  it('produced an index.html that loads a script', () => {
    const html = new URL('../dist/index.html', import.meta.url);
    expect(existsSync(html)).toBe(true);
    expect(readFileSync(html, 'utf8')).toMatch(/<script type="module" crossorigin src="\/assets\/.+\.js">/);
  });
});

describe('the sprite', () => {
  it('has 32x32 frames for every pose and expression, in palette colours', () => {
    for (const pose of POSES) {
      for (const expr of EXPRESSIONS) {
        const f = composeFrame(pose, expr);
        expect(f).toHaveLength(SIZE);
        for (const row of f) {
          expect(row).toHaveLength(SIZE);
          for (const ch of row) expect(ch === '.' || ch in PALETTE).toBe(true);
        }
      }
    }
  });
  it('changes his face with the verdict', () => {
    expect(composeFrame('idle', 'impressed').join('')).not.toEqual(composeFrame('idle', 'unimpressed').join(''));
  });
});

describe('the bundled examples', () => {
  it('are complete verdicts', () => {
    for (const v of [strong, weak] as unknown as Verdict[]) {
      expect(v.top_fixes).toHaveLength(3);
      expect(v.criteria.length).toBeGreaterThan(0);
      expect(v.voice_line).toContain(String(v.overall));
    }
  });
});

describe('streaming and backtest helpers', () => {
  it('parses server-sent events across chunks', () => {
    const a = parseSSE('event: log\ndata: {"msg":"Fetching…"}\n\nevent: verdict\ndata: {"over');
    expect(a.events).toEqual([{ event: 'log', data: { msg: 'Fetching…' } }]);
    const b = parseSSE(a.rest + 'all":42}\n\n');
    expect(b.events[0]).toEqual({ event: 'verdict', data: { overall: 42 } });
  });
  it('parses DEV URLs and writes the CSV', () => {
    const urls = parseUrls('https://dev.to/a/one\nhttps://www.dev.to/b/two, https://dev.to/a/one https://example.com/x');
    expect(urls).toEqual(['https://dev.to/a/one', 'https://dev.to/b/two']);
    const csv = toCSV([
      { url: urls[0], title: 'One, "quoted"', overall: 80, verdict: { criteria: [{ name: 'Creativity', score: 8 }] } as unknown as Verdict },
      { url: urls[1], title: 'Two', overall: 40 },
    ], new Set([urls[1]]));
    expect(csv.split('\n')[0]).toBe('url,title,overall,Creativity,winner');
    expect(csv).toContain('"One, ""quoted""",80,8,no');
    expect(csv).toContain('https://dev.to/b/two,Two,40,,yes');
  });
});
