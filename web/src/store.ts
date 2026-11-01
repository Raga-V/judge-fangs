/* Case files live in localStorage. No accounts, nothing on the server. */
import { useSyncExternalStore } from 'react';
import type { Case, Lesson } from './types';

const CASES_KEY = 'fangs.cases.v1';
const LESSONS_KEY = 'fangs.lessons.v1';

type Listener = () => void;
const listeners = new Set<Listener>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let cases: Case[] = read<Case[]>(CASES_KEY, []);
let lessons: Lesson[] = read<Lesson[]>(LESSONS_KEY, []);

function emit() {
  try {
    localStorage.setItem(CASES_KEY, JSON.stringify(cases));
    localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons));
  } catch {
    /* storage full: keep working in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCases(): Case[] {
  return useSyncExternalStore(subscribe, () => cases);
}

export function useLessons(): Lesson[] {
  return useSyncExternalStore(subscribe, () => lessons);
}

export function getCase(id: string): Case | undefined {
  return cases.find((c) => c.id === id);
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function addCase(c: Case) {
  cases = [c, ...cases.filter((x) => x.id !== c.id)];
  emit();
}

/** Immutable update of one case. */
export function updateCase(id: string, fn: (c: Case) => Case) {
  cases = cases.map((c) => (c.id === id ? { ...fn(c), updatedAt: new Date().toISOString() } : c));
  emit();
}

export function deleteCase(id: string) {
  cases = cases.filter((c) => c.id !== id);
  if (id.startsWith('demo-')) lessons = lessons.filter((l) => l.caseId !== id); // the example's lessons go with it
  emit();
}

export function addLessons(c: Case, texts: string[]) {
  const at = new Date().toISOString();
  lessons = [
    ...texts.map((text) => ({ text, caseId: c.id, caseName: c.name, at })),
    ...lessons.filter((l) => l.caseId !== c.id),
  ].slice(0, 30);
  emit();
}

/** Lessons from the example case are shown, but never fed into prompts for real cases. */
export function realLessons(ls: Lesson[]): Lesson[] {
  return ls.filter((l) => !l.caseId.startsWith('demo-'));
}

export function removeLesson(index: number) {
  lessons = lessons.filter((_, i) => i !== index);
  emit();
}

export function exportCase(c: Case) {
  const blob = new Blob([JSON.stringify({ app: 'judge-fangs', version: 1, case: c }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${c.name.replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 50) || 'case'}.fangs.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
