import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  managedAiUsageService,
  type OrgTokenBudget,
  type TokenBucket,
} from '@/services/managedAiUsage.service';
import { CapWarnings } from './CapWarnings';
import { capEdit, parseCapInput, toastLimitSaved } from './tokenLimits.helpers';

type Monthly = NonNullable<OrgTokenBudget['monthly']>;
type Override = { kbTokensPerMonth?: number; regularTokensPerMonth?: number };

const SOURCE: Record<'workspace' | 'platform' | 'alliance', string> = {
  workspace: 'set for this workspace',
  platform: 'platform setting',
  alliance: 'alliance pool',
};

/**
 * One workspace's MONTHLY limits (wave 2) inside the limits dialog: the limit in force with this
 * calendar month's spend, and the workspace's own override. Saved on its own — the daily form
 * above is not touched by it. Blank follows the platform; 0 switches the limit off here.
 */
export const WorkspaceMonthlyLimits = ({
  organizationId,
  monthly,
  override,
  kbMin,
  unreadable = false,
  backlog,
  dailyLimits,
  poolMonthly,
}: {
  organizationId: number;
  monthly: Monthly;
  override: Override | undefined;
  kbMin: number;
  /** The stored monthly limits could not be read: what is shown is unknown, not "none". */
  unreadable?: boolean;
  /**
   * Conversations waiting for the AI catch-up (BE `aiDeferredBacklog`): null = could not be
   * counted; absent (an older backend) or 0 = nothing said.
   */
  backlog?: number | null;
  /** This workspace's daily limits in force — a monthly one below them is warned about (§3). */
  dailyLimits?: { kb: number; regular: number };
  /** Its alliance pool's monthly limits — a workspace limit above them is warned about (§3). */
  poolMonthly?: { kbTokensPerMonth?: number; regularTokensPerMonth?: number };
}) => {
  const queryClient = useQueryClient();
  const seed = (value: number | undefined) => (value === undefined ? '' : String(value));
  const [kbText, setKbText] = useState(seed(override?.kbTokensPerMonth));
  const [regularText, setRegularText] = useState(seed(override?.regularTokensPerMonth));

  const kb = parseCapInput(kbText, true, kbMin, override?.kbTokensPerMonth);
  const regular = parseCapInput(regularText, false, kbMin);
  const edit = {
    kbTokensPerMonth: kb.ok ? capEdit(override?.kbTokensPerMonth, kb.value) : undefined,
    regularTokensPerMonth: regular.ok
      ? capEdit(override?.regularTokensPerMonth, regular.value)
      : undefined,
  };
  const changed = edit.kbTokensPerMonth !== undefined || edit.regularTokensPerMonth !== undefined;

  const save = useMutation({
    mutationFn: () =>
      managedAiUsageService.updateWorkspaceCaps(
        organizationId,
        Object.fromEntries(Object.entries(edit).filter(([, value]) => value !== undefined))
      ),
    onSuccess: async (outcome) => {
      toastLimitSaved('Monthly limits saved', outcome);
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the limits'),
  });

  const inForce = (bucket: TokenBucket, label: string) => {
    const cap = monthly[bucket];
    return (
      <span className="text-xs text-muted-foreground">
        {label}:{' '}
        {unreadable
          ? 'unknown (the stored monthly limits could not be read)'
          : cap
            ? `${cap.spentThisMonth.toLocaleString('en-US')} of ${cap.limit.toLocaleString('en-US')} this month · ${SOURCE[cap.source]}`
            : 'No monthly limit'}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-border">
      <span className="text-sm font-semibold">Monthly limits (calendar month, UTC)</span>
      {inForce('kb', 'KB processing')}
      {inForce('regular', 'Regular work')}
      {backlog === null ? (
        <span className="text-xs text-muted-foreground">
          The threads waiting for the AI catch-up could not be counted.
        </span>
      ) : backlog !== undefined && backlog > 0 ? (
        <span className="text-xs text-muted-foreground">
          {backlog.toLocaleString('en-US')} thread{backlog === 1 ? '' : 's'} sorted without AI
          wait{backlog === 1 ? 's' : ''} for the AI catch-up: they are analysed again with AI after
          a raise or the reset.
        </span>
      ) : null}
      <Input
        label="KB processing this workspace (tokens per month)"
        inputMode="numeric"
        value={kbText}
        onChange={(event) => setKbText(event.target.value)}
        error={kb.ok ? undefined : kb.error}
        disabled={save.isPending}
      />
      <CapWarnings
        value={kb.ok ? kb.value : null}
        daily={dailyLimits?.kb}
        poolMonthly={poolMonthly?.kbTokensPerMonth}
      />
      <Input
        label="Regular work this workspace (tokens per month)"
        inputMode="numeric"
        value={regularText}
        onChange={(event) => setRegularText(event.target.value)}
        error={regular.ok ? undefined : regular.error}
        disabled={save.isPending}
      />
      <CapWarnings
        value={regular.ok ? regular.value : null}
        daily={dailyLimits?.regular}
        poolMonthly={poolMonthly?.regularTokensPerMonth}
      />
      <p className="text-xs text-muted-foreground">
        Blank follows the platform monthly limit; 0 switches it off for this workspace.
      </p>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => save.mutate()}
          isLoading={save.isPending}
          disabled={!kb.ok || !regular.ok || !changed || save.isPending || unreadable}
        >
          Save monthly limits
        </Button>
      </div>
    </div>
  );
};
