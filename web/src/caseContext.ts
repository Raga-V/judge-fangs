/* The compact case context sent with chat, ideas and reviews. Built in the browser, capped. */
import type { Case, ChatMsg, Lesson } from './types';
import { realLessons } from './store';
import { timeLeftText } from './time';

export const CONTEXT_CAP = 6000;

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function chosenIdea(c: Case) {
  return c.ideas.find((i) => i.id === c.chosenIdeaId);
}

export function latestVerdict(c: Case) {
  return c.verdicts[c.verdicts.length - 1];
}

/** Chosen idea + lessons, for the review and ideas prompts. */
export function userContext(c: Case, lessons: Lesson[]): string {
  const parts: string[] = [];
  const idea = chosenIdea(c);
  if (idea) parts.push(`Chosen idea: ${clip(idea.text, 500)}`);
  const own = realLessons(lessons).filter((l) => l.caseId !== c.id).slice(0, 6);
  if (own.length) parts.push('Lessons from past hackathons: ' + own.map((l) => `"${clip(l.text, 140)}" (${clip(l.caseName, 40)})`).join('; '));
  return parts.join('\n').slice(0, 2000);
}

/** The case file the chat sees: brief, time left, idea, latest verdict, lessons, older messages in one line each. */
export function buildChatContext(c: Case, lessons: Lesson[], history: ChatMsg[]): string {
  const b = c.brief;
  const lines: string[] = [];
  lines.push(`Hackathon: ${b.name || c.name}`);
  if (b.theme) lines.push(`Theme: ${clip(b.theme, 300)}`);
  if (b.criteria?.length) lines.push('Criteria: ' + b.criteria.map((k) => `${k.name}${k.weight_pct ? ` ${Math.round(k.weight_pct)}%` : ''}`).join('; '));
  if (b.prize_categories?.length) lines.push('Prizes: ' + clip(b.prize_categories.join(', '), 600));
  lines.push(`Deadline: ${b.deadline || 'unknown'} (${timeLeftText(b)})`);
  lines.push(`Stage: ${c.stage}`);
  if (c.patterns.length) lines.push('What winners usually have: ' + c.patterns.map((p) => clip(p, 120)).join('; '));
  const idea = chosenIdea(c);
  if (idea) lines.push(`Chosen idea: ${clip(idea.text, 400)}${idea.judged ? ` (scored ${idea.judged.overall}/100)` : ''}`);
  const others = c.ideas.filter((i) => i.id !== c.chosenIdeaId).slice(0, 4);
  if (others.length) lines.push('Other ideas: ' + others.map((i) => `${clip(i.text, 90)}${i.judged ? ` [${i.judged.overall}]` : ''}`).join(' | '));
  const v = latestVerdict(c);
  if (v) {
    const weakest = [...v.criteria].sort((a, z) => a.score - z.score)[0];
    lines.push(`Latest verdict (${c.verdicts.length} so far): ${v.overall}/100 on "${clip(v.submission?.title || 'draft', 100)}". ` +
      `Weakest: ${weakest ? `${weakest.name} ${weakest.score}/10` : 'n/a'}. Fixes: ${v.top_fixes.map((f) => clip(f, 110)).join(' / ')}`);
    if (c.verdicts.length > 1) lines.push('Score history: ' + c.verdicts.map((x) => x.overall).join(' → '));
  }
  if (c.debrief) lines.push(`Result: ${c.debrief.result === 'won' ? 'won' : 'did not win'}. Lessons: ${c.debrief.lessons.join('; ')}`);
  const known = c.demo ? lessons : realLessons(lessons);
  if (known.length) lines.push('Lessons learned across hackathons: ' + known.slice(0, 6).map((l) => clip(l.text, 120)).join('; '));
  const older = history.slice(0, -10);
  if (older.length) lines.push('Earlier in this chat: ' + older.map((m) => `${m.role === 'user' ? 'Mortal' : 'Fangs'}: ${clip(m.content, 90)}`).join(' | '));
  let out = lines.join('\n');
  if (out.length > CONTEXT_CAP) out = out.slice(0, CONTEXT_CAP - 1) + '…';
  return out;
}

