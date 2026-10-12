import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { managedAiUsageService, type TokenLimitRules } from '@/services/managedAiUsage.service';
import { toastLimitSaved } from './tokenLimits.helpers';

type RuleKey = keyof TokenLimitRules;

/** One rule: its label, how it is typed (percent of a share, or a whole number) and its range. */
interface RuleSpec {
  key: RuleKey;
  label: string;
  unit: 'minutes' | 'tokens';
  min: number;
  max: number;
}

/**
 * The rules this version APPLIES, with the backend's ranges (`tokenLimitRulesSchema`). The other
 * saved rules (near-limit share, catch-up share, burst margin and expiry) are used only from wave
 * 2b / 3 on; showing them editable here would state behaviour that is not shipped (pass 2 m1).
 */
const RULES: RuleSpec[] = [
  {
    key: 'periodRecheckMinutes',
    label: 'Re-check a monthly or alliance pause every',
    unit: 'minutes',
    min: 5,
    max: 1440,
  },
  {
    key: 'kbMinTokensPerDay',
    label: 'Lowest KB limit (other than 0)',
    unit: 'tokens',
    min: 0,
    max: 1_000_000_000_000,
  },
];

const parseRule = (
  spec: RuleSpec,
  text: string
): { ok: true; value: number } | { ok: false; error: string } => {
  const digits = text.trim().replace(/,/g, '');
  const value = Number(digits);
  if (digits === '' || !Number.isInteger(value) || value < spec.min || value > spec.max) {
    return {
      ok: false,
      error: `A whole number between ${spec.min.toLocaleString('en-US')} and ${spec.max.toLocaleString('en-US')}.`,
    };
  }
  return { ok: true, value };
};

/**
 * The thresholds of the token limits (owner D11, 2026-10-12: every number an admin may tune is a
 * console setting, none in code or .env). Saved in `ai.token_limit_rules`; only a changed rule is
 * sent.
 */
export const TokenLimitRulesCard = ({ rules }: { rules: TokenLimitRules }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [texts, setTexts] = useState<Record<RuleKey, string>>({} as Record<RuleKey, string>);

  const startEditing = () => {
    setTexts(
      Object.fromEntries(RULES.map((spec) => [spec.key, String(rules[spec.key])])) as Record<
        RuleKey,
        string
      >
    );
    setEditing(true);
  };

  const parsed = RULES.map((spec) => ({ spec, result: parseRule(spec, texts[spec.key] ?? '') }));
  const valid = parsed.every(({ result }) => result.ok);
  const edit: Partial<TokenLimitRules> = {};
  for (const { spec, result } of parsed) {
    if (result.ok && result.value !== rules[spec.key]) {
      edit[spec.key] = result.value;
    }
  }
  const changed = Object.keys(edit).length > 0;

  const save = useMutation({
    mutationFn: () => managedAiUsageService.updateTokenLimitRules(edit),
    // A higher KB minimum releases the KB work it lifts (BE M3): reported like a limit save.
    onSuccess: async ({ release }) => {
      toastLimitSaved('Token limit rules saved', { release, regularRelease: null });
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
      setEditing(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the rules'),
  });
  const locked = save.isPending;

  const words = (spec: RuleSpec, value: number) => `${value.toLocaleString('en-US')} ${spec.unit}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Token limit rules</span>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={startEditing}>
              Edit
            </Button>
          )}
        </div>
        {!editing ? (
          <ul className="flex flex-col gap-0.5">
            {RULES.map((spec) => (
              <li key={spec.key} className="text-sm flex flex-wrap gap-x-2">
                <span className="font-semibold">{spec.label}</span>
                <span className="text-muted-foreground">{words(spec, rules[spec.key])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-2">
            {parsed.map(({ spec, result }) => (
              <Input
                key={spec.key}
                label={`${spec.label} (${spec.unit})`}
                inputMode="numeric"
                value={texts[spec.key] ?? ''}
                onChange={(event) =>
                  setTexts((current) => ({ ...current, [spec.key]: event.target.value }))
                }
                error={result.ok ? undefined : result.error}
                disabled={locked}
              />
            ))}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={locked}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate()}
                isLoading={save.isPending}
                disabled={!valid || !changed || save.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
