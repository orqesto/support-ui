import type { FieldSource, ResolvedField } from '@/services/platformSettings.service';

/**
 * The seven routing-proposal platform settings (spec 2026-10-14 §5). Keys, defaults and ranges
 * mirror the backend's ROUTING_SETTING_SPECS (platformSettingsService.ts) — the backend enforces
 * them; the console form checks the same bounds so a bad value is refused before the request.
 */
export const ROUTING_SETTING_FIELDS = [
  'proposalMinConversations',
  'rerouteUndoMinutes',
  'dormantArchiveDays',
  'autoacceptMinConversations',
  'autoacceptMinDays',
  'autoacceptMinReplayRatio',
  'replayMinMatches',
] as const;
export type RoutingSettingField = (typeof ROUTING_SETTING_FIELDS)[number];

export type RoutingSettingSpec = {
  label: string;
  help: string;
  /** The backend's built-in value when nothing is saved. */
  defaultValue: number;
  min: number;
  max: number;
  /** Whole numbers only (everything except the replay ratio). */
  integer: boolean;
};

export const ROUTING_SETTING_SPECS: Record<RoutingSettingField, RoutingSettingSpec> = {
  proposalMinConversations: {
    label: 'Threads before a rule is proposed',
    help: 'How many different threads must be routed the same way before the engine proposes a rule.',
    defaultValue: 3,
    min: 1,
    max: 50,
    integer: true,
  },
  rerouteUndoMinutes: {
    label: 'Same-agent re-route window (minutes)',
    help: 'If the agent who routed a thread re-routes it within this many minutes, it counts as correcting a slip: the first team quietly loses it instead of recording a disagreement. 0 turns the window off.',
    defaultValue: 10,
    min: 0,
    max: 240,
    integer: true,
  },
  dormantArchiveDays: {
    label: 'Archive an idle proposed rule after (days)',
    help: 'A proposed rule with no new support and no open proposal for this many days is archived.',
    defaultValue: 90,
    min: 7,
    max: 3650,
    integer: true,
  },
  autoacceptMinConversations: {
    label: 'Auto-accept: threads needed',
    help: 'Balanced mode accepts a single-team proposal overnight only with at least this many threads. Aggressive mode uses 0.8 of it, rounded up.',
    defaultValue: 5,
    min: 1,
    max: 100,
    integer: true,
  },
  autoacceptMinDays: {
    label: 'Auto-accept: days of support needed',
    help: 'The same proposal must also be supported over at least this many days. Aggressive mode uses 0.8 of it, rounded up.',
    defaultValue: 5,
    min: 0,
    max: 365,
    integer: true,
  },
  autoacceptMinReplayRatio: {
    label: 'Auto-accept: share of past mail that must match',
    help: 'Replayed on past mail, at least this share of the matches must go to the proposed team (0.9 = 90 %). Aggressive mode uses 0.8 of it.',
    defaultValue: 0.9,
    min: 0.5,
    max: 1,
    integer: false,
  },
  replayMinMatches: {
    label: 'Minimum past-mail matches for an estimate',
    help: 'The proposal card shows a Recommended / Review badge and auto-accept counts the replay only when it found at least this many matches. Aggressive mode uses 0.8 of it, rounded up.',
    defaultValue: 5,
    min: 1,
    max: 100,
    integer: true,
  },
};

export type RoutingSettings = Record<RoutingSettingField, ResolvedField<number>>;
/** PATCH /settings/routing — any non-empty subset. */
export type PlatformRoutingInput = Partial<Record<RoutingSettingField, number>>;

const SOURCES: readonly FieldSource[] = ['db', 'env', 'default'];

/** All seven numeric fields with a known source, or undefined (older backend) — never guessed. */
export const normalizeRouting = (raw: unknown): RoutingSettings | undefined => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const out: Partial<RoutingSettings> = {};
  for (const name of ROUTING_SETTING_FIELDS) {
    const entry = record[name];
    if (typeof entry !== 'object' || entry === null) return undefined;
    const { value, source } = entry as { value?: unknown; source?: unknown };
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    out[name] = {
      value,
      source: SOURCES.includes(source as FieldSource) ? (source as FieldSource) : 'default',
    };
  }
  return out as RoutingSettings;
};

/** Why `text` cannot be saved for `name`, or null when it can. */
export const routingFieldError = (name: RoutingSettingField, text: string): string | null => {
  const spec = ROUTING_SETTING_SPECS[name];
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return 'Enter a number.';
  if (spec.integer && !Number.isInteger(value)) return 'Use a whole number.';
  if (value < spec.min || value > spec.max) return `Use ${spec.min} to ${spec.max}.`;
  return null;
};
