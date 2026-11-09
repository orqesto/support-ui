import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { getErrorBody } from '@/lib/errorMessages';
import { organizationService } from '@/services/organization.service';
import { canonicalPattern } from '@/services/skillPatterns';
import type { SkillPattern, SkillPatternPreset, SkillPatternStrength } from '@/types/skillRouting';

/**
 * The highest per-value cap the console allows (`skillPatternsPerValue`, 1–50). The workspace's
 * own cap is not sent to the page: the backend checks it on save and says why it refused.
 */
const MAX_PATTERNS = 50;
const MAX_REGEX_CHARS = 200;

type PresetPick = { preset: string; strength: SkillPatternStrength };
type RegexPick = { regex: string; caseSensitive: boolean; strength: SkillPatternStrength };

const STRENGTH_OPTIONS = [
  { value: 'decides', label: 'Decides' },
  { value: 'hint', label: 'Only a hint for the AI' },
];

const presetsOf = (patterns: SkillPattern[]): PresetPick[] =>
  patterns.flatMap((pattern) =>
    'preset' in pattern ? [{ preset: pattern.preset, strength: pattern.strength ?? 'decides' }] : []
  );
const regexesOf = (patterns: SkillPattern[]): RegexPick[] =>
  patterns.flatMap((pattern) =>
    'regex' in pattern
      ? [
          {
            regex: pattern.regex,
            caseSensitive: pattern.caseSensitive === true,
            strength: pattern.strength ?? 'decides',
          },
        ]
      : []
  );

/**
 * The list Save sends: presets in catalogue order (stored ids the catalogue no longer offers
 * after them, in stored order — kept, so re-enabling one restores routing), then the regexes,
 * defaults left out. Used for the saved list too, so Save is off when nothing changed even
 * after the catalogue arrives and reorders the presets.
 */
const arrange = (
  patterns: SkillPattern[],
  catalogue: SkillPatternPreset[] | null
): SkillPattern[] => {
  const order = new Map((catalogue ?? []).map((preset, index) => [preset.id, index]));
  const rank = (id: string) => order.get(id) ?? order.size;
  const presets = presetsOf(patterns)
    .map((pick, index) => ({ pick, index }))
    .sort(
      (left, right) => rank(left.pick.preset) - rank(right.pick.preset) || left.index - right.index
    )
    .map(({ pick }) => pick);
  return [...presets, ...regexesOf(patterns)].map(canonicalPattern);
};

/** The picks plus a typed, not yet added regex (review 2026-11-09: Save without Add dropped it). */
const withDraft = (presets: PresetPick[], regexes: RegexPick[], draft: string): SkillPattern[] => {
  const typed = draft.trim();
  const all =
    typed && !regexes.some((entry) => entry.regex === typed)
      ? [...regexes, { regex: typed, caseSensitive: false, strength: 'decides' as const }]
      : regexes;
  return [...presets, ...all];
};
const keyOf = (patterns: SkillPattern[]): string => JSON.stringify(patterns);

const groupByCategory = (catalogue: SkillPatternPreset[]): [string, SkillPatternPreset[]][] => {
  const groups = new Map<string, SkillPatternPreset[]>();
  for (const preset of catalogue) {
    groups.set(preset.category, [...(groups.get(preset.category) ?? []), preset]);
  }
  return [...groups.entries()];
};

const reasonOf = (error: unknown): string | undefined => {
  // The controller's own 400s carry `message`; an ApiError (unsafe regex) carries `error`.
  const body = getErrorBody(error) as { message?: unknown; error?: unknown } | undefined;
  return [body?.message, body?.error].find(
    (text): text is string => typeof text === 'string' && text.length > 0
  );
};

/**
 * A routing value's text patterns (BE 2026-11-09): text in the customer's mail that counts like a
 * keyword — ready-made patterns from the platform catalogue or the admin's own regular expression.
 * Each one either decides the value or only offers it to the AI. The backend checks a custom
 * pattern for safety and says why it refused one.
 */
export const RoutingValuePatterns = ({
  routingKey,
  value,
  initial,
  presets: catalogue,
  presetsFailed = false,
  languageKey = false,
}: {
  routingKey: string;
  value: string;
  initial: SkillPattern[];
  /** The workspace's ready-made patterns; null while loading or after a failed read. */
  presets: SkillPatternPreset[] | null;
  presetsFailed?: boolean;
  /** A language key: a detected language still decides; patterns count for short mails. */
  languageKey?: boolean;
}) => {
  const [picks, setPicks] = useState<PresetPick[]>(() => presetsOf(initial));
  const [regexes, setRegexes] = useState<RegexPick[]>(() => regexesOf(initial));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<SkillPattern[]>(() => initial);

  const total = picks.length + regexes.length;
  const pending = arrange(withDraft(picks, regexes, draft), catalogue);
  const dirty = keyOf(pending) !== keyOf(arrange(saved, catalogue));
  const full = total >= MAX_PATTERNS;
  const offered = new Set((catalogue ?? []).map((preset) => preset.id));
  const elsewhere = picks.filter((pick) => !offered.has(pick.preset));

  const edited = () => setNotice(null);
  const pickOf = (id: string) => picks.find((pick) => pick.preset === id);

  const togglePreset = (id: string, on: boolean) => {
    edited();
    setPicks((current) =>
      on
        ? current.some((pick) => pick.preset === id)
          ? current
          : [...current, { preset: id, strength: 'decides' }]
        : current.filter((pick) => pick.preset !== id)
    );
  };
  const setPresetStrength = (id: string, strength: SkillPatternStrength) => {
    edited();
    setPicks((current) =>
      current.map((pick) => (pick.preset === id ? { ...pick, strength } : pick))
    );
  };
  const updateRegex = (regex: string, change: Partial<RegexPick>) => {
    edited();
    setRegexes((current) =>
      current.map((entry) => (entry.regex === regex ? { ...entry, ...change } : entry))
    );
  };

  const addRegex = () => {
    const regex = draft.trim();
    if (!regex) return;
    if (!regexes.some((entry) => entry.regex === regex)) {
      setRegexes((current) => [...current, { regex, caseSensitive: false, strength: 'decides' }]);
    }
    setDraft('');
    edited();
  };

  const save = async () => {
    setBusy(true);
    try {
      const patterns = pending;
      await organizationService.setRoutingValuePatterns(routingKey, value, patterns);
      setPicks(presetsOf(patterns));
      setRegexes(regexesOf(patterns));
      setDraft('');
      setSaved(patterns);
      setNotice('Patterns saved.');
    } catch (error) {
      setNotice(reasonOf(error) ?? 'Could not save the patterns. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const strengthSelect = (
    name: string,
    current: SkillPatternStrength,
    onPick: (next: SkillPatternStrength) => void
  ) => (
    <div className="w-48 shrink-0">
      <Select
        size="sm"
        aria-label={`Strength of ${name}`}
        options={STRENGTH_OPTIONS}
        value={current}
        disabled={busy}
        onChange={(next) => onPick(next === 'hint' ? 'hint' : 'decides')}
      />
    </div>
  );

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs font-medium">Text patterns</p>
      <p className="text-xs text-muted-foreground">
        A mail that contains one of these goes to this value, like a keyword. If another value has a
        pattern matching the same text, the AI decides between them. A pattern set to “Only a hint
        for the AI” never decides on its own: it only offers this value to the AI.
      </p>
      {languageKey && (
        <p className="text-xs text-muted-foreground">
          A detected or requested language still decides. Patterns count only for short mails where
          no language is detected.
        </p>
      )}
      {catalogue === null ? (
        <p className="text-xs text-muted-foreground">
          {presetsFailed
            ? 'Could not load the ready-made patterns. Your own patterns still work.'
            : 'Loading ready-made patterns…'}
        </p>
      ) : (
        groupByCategory(catalogue).map(([category, group]) => (
          <div key={category} className="space-y-1">
            <p className="text-xs font-medium capitalize text-muted-foreground">{category}</p>
            <ul className="space-y-1">
              {group.map((preset) => {
                const pick = pickOf(preset.id);
                return (
                  <li key={preset.id} className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Checkbox
                        label={
                          preset.example ? `${preset.label} (${preset.example})` : preset.label
                        }
                        checked={pick !== undefined}
                        disabled={busy || (pick === undefined && full)}
                        onChange={(event) => togglePreset(preset.id, event.target.checked)}
                      />
                    </div>
                    {pick &&
                      strengthSelect(preset.label, pick.strength, (next) =>
                        setPresetStrength(preset.id, next)
                      )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      {elsewhere.length > 0 && (
        <ul className="space-y-1">
          {elsewhere.map((pick) => (
            <li key={pick.preset} className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {pick.preset}
              </Badge>
              {catalogue !== null && (
                <Badge variant="warning">
                  Unavailable — does not match until it is offered again
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove pattern ${pick.preset}`}
                className="h-6 w-6 p-0"
                disabled={busy}
                onClick={() => togglePreset(pick.preset, false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {regexes.length > 0 && (
        <ul className="space-y-1">
          {regexes.map((entry) => (
            <li key={entry.regex} className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 font-mono">
                {entry.regex}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove pattern ${entry.regex}`}
                  className="h-4 w-4 p-0"
                  disabled={busy}
                  onClick={() => {
                    setRegexes((current) => current.filter((other) => other.regex !== entry.regex));
                    edited();
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
              <Checkbox
                label="Case-sensitive"
                aria-label={`Case-sensitive ${entry.regex}`}
                checked={entry.caseSensitive}
                disabled={busy}
                onChange={(event) =>
                  updateRegex(entry.regex, { caseSensitive: event.target.checked })
                }
              />
              {strengthSelect(entry.regex, entry.strength, (next) =>
                updateRegex(entry.regex, { strength: next })
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Custom pattern for ${value}`}
          className="font-mono"
          value={draft}
          maxLength={MAX_REGEX_CHARS}
          placeholder="Your own regular expression, e.g. ORD-\d{6}"
          disabled={busy || full}
          onChange={(event) => {
            setDraft(event.target.value);
            edited();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addRegex();
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          aria-label={`Add pattern for ${value}`}
          disabled={busy || !draft.trim() || full}
          onClick={addRegex}
        >
          Add
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          aria-label={`Save patterns for ${value}`}
          isLoading={busy}
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          Save patterns
        </Button>
        {notice ? (
          <span className="text-xs text-muted-foreground">{notice}</span>
        ) : (
          dirty && <span className="text-xs text-warning">Unsaved changes</span>
        )}
      </div>
    </div>
  );
};
