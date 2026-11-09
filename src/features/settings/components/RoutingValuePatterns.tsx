import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { getErrorBody } from '@/lib/errorMessages';
import { organizationService } from '@/services/organization.service';
import {
  SKILL_PATTERN_PRESETS,
  type SkillPattern,
  type SkillPatternPresetId,
} from '@/types/skillRouting';

const MAX_PATTERNS = 10;
const MAX_REGEX_CHARS = 200;

const presetsOf = (patterns: SkillPattern[]): Set<SkillPatternPresetId> =>
  new Set(patterns.flatMap((pattern) => ('preset' in pattern ? [pattern.preset] : [])));
const regexesOf = (patterns: SkillPattern[]): string[] =>
  patterns.flatMap((pattern) => ('regex' in pattern ? [pattern.regex] : []));

/** The list Save sends: presets in their fixed order, then the regexes (a typed, not yet added
 *  regex included — review 2026-11-09: pressing Save without Add dropped it). */
const patternsFrom = (
  presets: Set<SkillPatternPresetId>,
  regexes: string[],
  draft: string
): SkillPattern[] => {
  const typed = draft.trim();
  const all = typed && !regexes.includes(typed) ? [...regexes, typed] : regexes;
  return [
    ...SKILL_PATTERN_PRESETS.filter((preset) => presets.has(preset.id)).map((preset) => ({
      preset: preset.id,
    })),
    ...all.map((regex) => ({ regex })),
  ];
};
const keyOf = (patterns: SkillPattern[]): string => JSON.stringify(patterns);

/**
 * A routing value's text patterns (BE 2026-11-09): text in the customer's mail that counts like a
 * keyword — ready-made patterns (an EVM transaction hash, a Tron address …) or the admin's own
 * regular expression. The backend checks a custom pattern for safety and says why it refused one.
 */
export const RoutingValuePatterns = ({
  routingKey,
  value,
  initial,
}: {
  routingKey: string;
  value: string;
  initial: SkillPattern[];
}) => {
  const [presets, setPresets] = useState<Set<SkillPatternPresetId>>(() => presetsOf(initial));
  const [regexes, setRegexes] = useState<string[]>(() => regexesOf(initial));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState(() =>
    keyOf(patternsFrom(presetsOf(initial), regexesOf(initial), ''))
  );

  const total = presets.size + regexes.length;
  const pending = patternsFrom(presets, regexes, draft);
  const dirty = keyOf(pending) !== savedKey;

  const togglePreset = (id: SkillPatternPresetId, on: boolean) => {
    setNotice(null);
    setPresets((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const addRegex = () => {
    const regex = draft.trim();
    if (!regex) return;
    if (!regexes.includes(regex)) setRegexes((current) => [...current, regex]);
    setDraft('');
    setNotice(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const patterns = pending;
      await organizationService.setRoutingValuePatterns(routingKey, value, patterns);
      setRegexes(regexesOf(patterns));
      setDraft('');
      setSavedKey(keyOf(patterns));
      setNotice('Patterns saved.');
    } catch (error) {
      // The controller's own 400s carry `message`; an ApiError (unsafe regex) carries `error`.
      const body = getErrorBody(error) as { message?: unknown; error?: unknown } | undefined;
      const reason = [body?.message, body?.error].find(
        (text): text is string => typeof text === 'string' && text.length > 0
      );
      setNotice(reason ?? 'Could not save the patterns. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs font-medium">Text patterns</p>
      <p className="text-xs text-muted-foreground">
        A mail that contains one of these goes to this value, like a keyword. If another value has a
        pattern matching the same text, the AI decides between them.
      </p>
      <div className="grid gap-1 sm:grid-cols-2">
        {SKILL_PATTERN_PRESETS.map((preset) => (
          <Checkbox
            key={preset.id}
            label={`${preset.label} (${preset.example})`}
            checked={presets.has(preset.id)}
            disabled={busy || (!presets.has(preset.id) && total >= MAX_PATTERNS)}
            onChange={(event) => togglePreset(preset.id, event.target.checked)}
          />
        ))}
      </div>
      {regexes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {regexes.map((regex) => (
            <Badge key={regex} variant="secondary" className="gap-1 font-mono">
              {regex}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove pattern ${regex}`}
                className="h-4 w-4 p-0"
                disabled={busy}
                onClick={() => {
                  setRegexes((current) => current.filter((entry) => entry !== regex));
                  setNotice(null);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Custom pattern for ${value}`}
          className="font-mono"
          value={draft}
          maxLength={MAX_REGEX_CHARS}
          placeholder="Your own regular expression, e.g. ORD-\d{6}"
          disabled={busy || total >= MAX_PATTERNS}
          onChange={(event) => {
            setDraft(event.target.value);
            setNotice(null);
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
          disabled={busy || !draft.trim() || total >= MAX_PATTERNS}
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
