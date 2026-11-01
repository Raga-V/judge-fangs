export type Mode = 'hackathon' | 'email' | 'idea';
export type Expression = 'stern' | 'reading' | 'unimpressed' | 'grudging' | 'impressed';

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

export interface Brief {
  name: string;
  theme: string;
  deadline: string | null;
  criteria: { name: string; description?: string; weight?: string | null }[];
  prize_categories: string[];
  default?: boolean;
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
  submission_text?: string;
  context?: string;
  winners_url?: string;
  exclude_urls?: string[];
}
