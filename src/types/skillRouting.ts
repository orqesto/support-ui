/** Skill routing (BE spec docs/superpowers/specs/2026-11-02-skill-routing-matching-design.md). */
export type RoutingKeyType = 'language' | 'topic';

export type RoutingKey = { id: number; key: string; description: string | null; type: RoutingKeyType };

export type RoutingValue = {
  value: string;
  description: string | null;
  holders: number;
  unused: boolean;
  /** Skill-routed tickets a person moved to someone else in the last 30 days. */
  reassigned30d: number;
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
