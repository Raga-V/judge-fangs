export type Mode = 'hackathon' | 'email' | 'idea' | 'pitch';
export type Expression = 'stern' | 'reading' | 'unimpressed' | 'grudging' | 'impressed';
export type Stage = 'ideating' | 'building' | 'submitted' | 'results';
export type Tab = 'brief' | 'ideate' | 'judge' | 'debrief';

export interface Criterion {
  name: string;
  score: number;
  verdict: string;
  evidence_quote: string | null;
  supported: boolean;
}

export interface PartnerCheck {
  partner: string;
  claim: string;
  status: 'backed' | 'mentioned' | 'not_found' | 'no_repo';
  evidence: string[];
  overruled?: boolean;
}

export interface Source {
  label: string;
  url: string | null;
  chars: number;
}

export interface BriefCriterion {
  name: string;
  description?: string;
  weight?: string | null;
  weight_pct?: number;
}

export interface Brief {
  name: string;
  theme: string;
  deadline: string | null;
  deadline_iso?: string | null;
  criteria: BriefCriterion[];
  prize_categories: string[];
  default?: boolean;
  winners_url_hint?: string;
}

export interface Verdict {
  id: string;
  mode: Mode;
  demo?: boolean;
  banner?: string;
  example_label?: string;
  overall: number;
  expression: Expression;
  criteria: Criterion[];
  why_not_winning?: string[];
  top_fixes: string[];
  better_title?: string;
  better_opening?: string;
  rewrite?: string;
  competitors?: { title: string; url: string; why_close: string }[];
  count_says: string;
  voice_line: string;
  facts?: Record<string, unknown>;
  partners?: PartnerCheck[];
  overrules?: string[];
  patterns?: string[];
  winner_stats?: Record<string, number> | null;
  winners?: { title: string; url: string }[];
  patterns_blind?: boolean;
  brief?: Brief | null;
  sources?: Source[];
  submission?: { title?: string | null; url?: string | null };
  judged_at?: string;
}

export interface ReviewRequest {
  mode: Mode;
  hackathon_url?: string;
  hackathon_text?: string;
  submission_url?: string;
  repo_url?: string;
  submission_text?: string;
  context?: string;
  winners_url?: string;
  exclude_urls?: string[];
  brief?: Brief;
  patterns?: string[];
  user_context?: string;
}

export interface IdeaCriterion {
  name: string;
  score: number;
  verdict: string;
}

export interface JudgedIdea {
  idea: string;
  overall: number;
  criteria: IdeaCriterion[];
  verdict: string;
  how_it_could_win: string;
  partners: string[];
}

export interface Idea {
  id: string;
  text: string;
  starred?: boolean;
  from?: 'mine' | 'fangs';
  pitch?: string;
  partners?: string[];
  judged?: JudgedIdea;
}

export interface GeneratedIdea {
  title: string;
  pitch: string;
  partners: string[];
  why_original?: string;
}

export interface ChatMsg {
  role: 'user' | 'fangs';
  content: string;
  at: string;
}

export interface Debrief {
  result: 'won' | 'lost';
  winners_did: string[];
  you_did_well: string[];
  lessons: string[];
  count_says?: string;
  winners?: { title: string; url: string }[];
  sources?: Source[];
  debriefed_at?: string;
}

export interface Case {
  id: string;
  name: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  stage: Stage;
  brief: Brief;
  patterns: string[];
  winnerStats?: Record<string, number> | null;
  winners: { title: string; url: string }[];
  sources: Source[];
  winnersUrl?: string;
  ideas: Idea[];
  generated?: GeneratedIdea[];
  chosenIdeaId?: string;
  verdicts: Verdict[];
  submission?: { url?: string; repoUrl?: string; text?: string; mode?: Mode };
  chat: ChatMsg[];
  result?: { status: 'won' | 'lost'; winnersUrl?: string; winnersText?: string };
  debrief?: Debrief;
  demo?: boolean;
}

export interface Lesson {
  text: string;
  caseId: string;
  caseName: string;
  at: string;
}
