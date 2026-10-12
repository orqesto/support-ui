import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { managedAiUsageService, type TokenCapsTotals } from '@/services/managedAiUsage.service';
import { capEdit, describeCap, parseCapInput, toastLimitSaved } from './tokenLimits.helpers';

const NO_LIMIT = 'No monthly limit';

/**
 * The platform's MONTHLY AI token limits (calendar month, UTC; owner D2, 2026-10-12): the default
 * for every workspace without its own. Unlike the daily limits there is no built-in monthly
 * default — a blank field means no monthly limit, and 0 switches one off. Reaching one pauses KB
 * work and moves regular mail to the local model until a raise or the 1st; that mail is
 * marked for an AI re-analysis (the catch-up that re-runs it ships with wave 2b).
 */
export const MonthlyLimitsCard = ({ caps, kbMin }: { caps: TokenCapsTotals; kbMin: number }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [kbText, setKbText] = useState('');
  const [regularText, setRegularText] = useState('');
  const unreadable = caps.lookupFailed === true;

  const startEditing = () => {
    setKbText(caps.kbTokensPerMonth === undefined ? '' : String(caps.kbTokensPerMonth));
    setRegularText(
      caps.regularTokensPerMonth === undefined ? '' : String(caps.regularTokensPerMonth)
    );
    setEditing(true);
  };

  const kb = parseCapInput(kbText, true, kbMin, caps.kbTokensPerMonth);
  const regular = parseCapInput(regularText, false, kbMin);
  const edit = {
    kbTokensPerMonth: kb.ok ? capEdit(caps.kbTokensPerMonth, kb.value) : undefined,
    regularTokensPerMonth: regular.ok
      ? capEdit(caps.regularTokensPerMonth, regular.value)
      : undefined,
  };
  const changed = edit.kbTokensPerMonth !== undefined || edit.regularTokensPerMonth !== undefined;

  const save = useMutation({
    // Only the fields that changed are sent: a re-sent value re-runs a release (as on the daily card).
    mutationFn: () =>
      managedAiUsageService.updateTokenCaps(
        Object.fromEntries(Object.entries(edit).filter(([, value]) => value !== undefined))
      ),
    onSuccess: async (outcome) => {
      toastLimitSaved('Monthly token limits saved', outcome);
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
      setEditing(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the limits'),
  });
  const locked = save.isPending;

  const line = (label: string, value: number | undefined, isKb: boolean) => (
    <span className="text-sm flex flex-wrap items-center gap-x-2">
      <span className="font-semibold">{label}</span>
      <span className="text-muted-foreground">
        {unreadable ? 'unknown' : describeCap(value, NO_LIMIT, isKb ? { kbMin } : undefined)}
      </span>
    </span>
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Monthly token limits · calendar month (UTC) · the default for every workspace without
            its own
          </span>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={startEditing} disabled={unreadable}>
              Edit
            </Button>
          )}
        </div>
        {!editing ? (
          <>
            {unreadable && (
              <span className="text-xs text-warning">
                The stored monthly and alliance limits could not be read; they cannot be edited
                until they can.
              </span>
            )}
            {line('KB processing', caps.kbTokensPerMonth, true)}
            {line('Regular work', caps.regularTokensPerMonth, false)}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              label="KB processing (tokens per calendar month)"
              inputMode="numeric"
              value={kbText}
              onChange={(event) => setKbText(event.target.value)}
              error={kb.ok ? undefined : kb.error}
              disabled={locked}
            />
            <Input
              label="Regular work (tokens per calendar month)"
              inputMode="numeric"
              value={regularText}
              onChange={(event) => setRegularText(event.target.value)}
              error={regular.ok ? undefined : regular.error}
              disabled={locked}
            />
            <p className="text-xs text-muted-foreground">
              Blank = no monthly limit; 0 switches one off. Limits are soft: calls already running
              may go a little over. When a limit is reached, KB work pauses until a raise or the
              1st, and regular mail is sorted by the local model and marked for an AI re-analysis.
            </p>
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
                disabled={!kb.ok || !regular.ok || !changed || save.isPending}
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
