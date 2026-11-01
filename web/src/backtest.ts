import type { Verdict } from './types';

export interface BacktestRow {
  url: string;
  title: string;
  overall: number | null;
  verdict?: Verdict;
  error?: string;
}

/** Up to 20 unique DEV post URLs from free text. */
export function parseUrls(text: string, max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?dev\.to\/[\w.-]+\/[\w-]+/g)) {
    const u = m[0].replace('://www.', '://');
    if (!seen.has(u.toLowerCase())) {
      seen.add(u.toLowerCase());
      out.push(u);
    }
  }
  return out.slice(0, max);
}

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV: url, title, overall, each criterion score, winner label. */
export function toCSV(rows: BacktestRow[], winners: Set<string>): string {
  const names: string[] = [];
  for (const r of rows) for (const c of r.verdict?.criteria || []) if (!names.includes(c.name)) names.push(c.name);
  const header = ['url', 'title', 'overall', ...names, 'winner'];
  const lines = rows.map((r) => {
    const byName = new Map((r.verdict?.criteria || []).map((c) => [c.name, c.score]));
    return [r.url, r.title, r.overall ?? '', ...names.map((n) => byName.get(n) ?? ''), winners.has(r.url.toLowerCase()) ? 'yes' : 'no'];
  });
  return [header, ...lines].map((l) => l.map(cell).join(',')).join('\n') + '\n';
}
