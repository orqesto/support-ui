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
  /** Text patterns that count like keywords (BE 2026-11-09); absent on an older backend. */
  patterns?: SkillPattern[];
};

/** A ready-made pattern a workspace admin can tick (BE 2026-11-09: a console-managed catalogue). */
export type SkillPatternPreset = {
  id: string;
  label: string;
  example?: string;
  /** Groups the list ("crypto", "banking", …). */
  category: string;
  caseSensitive: boolean;
};

/**
 * The v1.1.325 presets — what an older backend without `GET /routing-pattern-presets` knows
 * (its list is hard-coded there). Used only as the fallback on a 404.
 */
export const SKILL_PATTERN_PRESETS: readonly SkillPatternPreset[] = [
  {
    id: 'evm_tx_hash',
    label: 'EVM transaction hash',
    example: '0x + 64 hex characters',
    category: 'crypto',
    caseSensitive: true,
  },
  {
    id: 'evm_address',
    label: 'EVM address',
    example: '0x + 40 hex characters',
    category: 'crypto',
    caseSensitive: true,
  },
  {
    id: 'tron_address',
    label: 'Tron address',
    example: 'T + 33 characters',
    category: 'crypto',
    caseSensitive: true,
  },
  {
    id: 'btc_address',
    label: 'Bitcoin address',
    example: '1…, 3… or bc1… — may also match other codes starting with 1 or 3',
    category: 'crypto',
    caseSensitive: true,
  },
  {
    id: 'hex64_hash',
    label: 'Transaction hash without 0x',
    example: '64 hex characters: Tron, Bitcoin and others look the same — also other 64-hex codes',
    category: 'crypto',
    caseSensitive: true,
  },
];

/** `decides`: a hit is a clear match (the default). `hint`: a hit only offers the value to the AI. */
export type SkillPatternStrength = 'decides' | 'hint';

export type SkillPattern =
  | { preset: string; strength?: SkillPatternStrength }
  | { regex: string; caseSensitive?: boolean; strength?: SkillPatternStrength };

/** A catalogue row as the global admin edits it (`/api/admin/platform/skill-pattern-presets`). */
export type PlatformSkillPatternPreset = SkillPatternPreset & {
  regex: string;
  /** false ⇒ hidden from the workspace picker and never matched. */
  enabled: boolean;
};

export type PlatformSkillPatternCatalogue = {
  presets: PlatformSkillPatternPreset[];
  /** True while nothing is saved: the backend serves its built-in list. */
  isDefault: boolean;
};

export type SkillMatchSource = 'keyword' | 'pattern' | 'embedding' | 'language' | 'ai';

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
