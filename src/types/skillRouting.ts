/** Skill routing (BE spec docs/superpowers/specs/2026-11-02-skill-routing-matching-design.md). */
export type RoutingKeyType = 'language' | 'topic';

export type RoutingKey = {
  id: number;
  key: string;
  description: string | null;
  type: RoutingKeyType;
  /** False on a backend that predates key types — the page then hides the new controls. */
  typeReported: boolean;
};

export type RoutingValue = {
  value: string;
  description: string | null;
  holders: number;
  unused: boolean;
  /** Skill-routed tickets moved to someone else in 30 days; null unless asked for. */
  reassigned30d: number | null;
  /** The keywords matching derives from the value and its description (absent on an older backend). */
  terms?: string[];
  /** Language keys: whether the router recognises the language; null for topic keys. */
  knownLanguage: boolean | null;
};

export type SkillMatchSource = 'keyword' | 'embedding' | 'language' | 'ai';

export type SkillMatch = {
  key: string;
  value: string;
  source: SkillMatchSource;
  score?: number;
  evidence: string | null;
};

export type KeyOutcome = {
  key: string;
  status: 'clear' | 'unclear' | 'none';
  accepted: SkillMatch[];
  candidates: SkillMatch[];
};

export type AiRefusal = 'no_ai' | 'budget' | 'failed';

export type RoutingTestResult = {
  detectedLanguage: string | null;
  keys: KeyOutcome[];
  truncated?: boolean;
  judgement: Record<string, string | null> | null;
  aiRefused: AiRefusal | null;
  matches: SkillMatch[];
  wouldAssign: { userId: number; reason: string; matches: SkillMatch[] } | null;
  notes: string[];
};
