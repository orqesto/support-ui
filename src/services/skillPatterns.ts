import type {
  PlatformSkillPatternCatalogue,
  PlatformSkillPatternPreset,
  SkillPattern,
  SkillPatternPreset,
  SkillPatternStrength,
} from '@/types/skillRouting';

/**
 * Normalisers for skill routing text patterns (BE 2026-11-09). The FE ships on merge, the BE on a
 * tag, so every field the backend sends is read defensively here: a malformed entry is dropped,
 * never rendered half-formed.
 */

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const strengthOf = (raw: unknown): SkillPatternStrength | undefined =>
  raw === 'hint' || raw === 'decides' ? raw : undefined;

/**
 * One stored pattern in the shape Save sends back: defaults are left out (`strength: 'decides'`,
 * `caseSensitive: false`), everything else kept — so a `hint` or a case-sensitive regex the
 * backend returned survives a save made for another reason.
 */
export const canonicalPattern = (pattern: SkillPattern): SkillPattern => {
  const hint = pattern.strength === 'hint' ? { strength: 'hint' as const } : {};
  if ('preset' in pattern) return { preset: pattern.preset, ...hint };
  return {
    regex: pattern.regex,
    ...(pattern.caseSensitive === true ? { caseSensitive: true } : {}),
    ...hint,
  };
};

/** A value's `patterns` as the backend sent them; undefined when absent (older backend). */
export const normalizeSkillPatterns = (raw: unknown): SkillPattern[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((entry): SkillPattern[] => {
    if (!isRecord(entry)) return [];
    const strength = strengthOf(entry.strength);
    if (typeof entry.preset === 'string' && entry.preset) {
      return [{ preset: entry.preset, ...(strength ? { strength } : {}) }];
    }
    if (typeof entry.regex === 'string' && entry.regex) {
      return [
        {
          regex: entry.regex,
          ...(typeof entry.caseSensitive === 'boolean'
            ? { caseSensitive: entry.caseSensitive }
            : {}),
          ...(strength ? { strength } : {}),
        },
      ];
    }
    return [];
  });
};

const optionalText = (raw: unknown): { example?: string } =>
  typeof raw === 'string' && raw.trim() ? { example: raw } : {};

/** The workspace picker's presets (`GET /api/organizations/routing-pattern-presets`). */
export const normalizePresets = (raw: unknown): SkillPatternPreset[] =>
  (Array.isArray(raw) ? raw : []).flatMap((entry): SkillPatternPreset[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) return [];
    return [
      {
        id: entry.id,
        label: typeof entry.label === 'string' && entry.label ? entry.label : entry.id,
        ...optionalText(entry.example),
        category: typeof entry.category === 'string' && entry.category ? entry.category : 'other',
        caseSensitive: entry.caseSensitive === true,
      },
    ];
  });

const normalizePlatformPreset = (raw: unknown): PlatformSkillPatternPreset[] => {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.regex !== 'string') return [];
  return [
    {
      id: raw.id,
      label: typeof raw.label === 'string' ? raw.label : '',
      ...optionalText(raw.example),
      category: typeof raw.category === 'string' ? raw.category : '',
      regex: raw.regex,
      caseSensitive: raw.caseSensitive === true,
      enabled: raw.enabled !== false,
    },
  ];
};

/**
 * The console catalogue. Read as `{ presets, isDefault }`; a bare array (a save answered with the
 * saved list only) is accepted too and reads as saved, not built-in.
 */
export const normalizeCatalogue = (raw: unknown): PlatformSkillPatternCatalogue | null => {
  if (Array.isArray(raw))
    return { presets: raw.flatMap(normalizePlatformPreset), isDefault: false };
  if (!isRecord(raw) || !Array.isArray(raw.presets)) return null;
  return {
    presets: raw.presets.flatMap(normalizePlatformPreset),
    isDefault: raw.isDefault === true,
  };
};
