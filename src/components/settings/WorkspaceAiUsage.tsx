import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { BudgetBar } from '@/components/budget/BudgetBar';
import { BudgetField } from '@/components/budget/BudgetGroupView';
import { BulkLimitField, FieldLabel } from '@/components/budget/BulkLimitField';
import { RequestExtraBox } from '@/components/budget/RequestExtraBox';
import { StatusText } from '@/components/budget/StatusText';
import { extraEndsText, fmtTokens } from '@/components/budget/budget.rules';
import { useMyAiUsage, useRequestMyExtra, useUpdateMyBudget } from '@/hooks/useBudgets';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import type { WorkspaceBudgetUpdate } from '@/services/budgets.service';

const NOT_ON = 'Budgets are not switched on yet.';

const failed = (fallback: string) => (error: unknown) =>
  toast.error(getApiErrorMessage(error) ?? fallback);

/**
 * Workspace settings → AI usage. Every member sees this workspace's group budget and its own
 * bulk numbers (read-only); a workspace admin may request extra; a hosted own-key standalone
 * admin also sets the budget and the bulk limit. What is editable comes from `canEdit`.
 */
export const WorkspaceAiUsage = () => {
  const usageQuery = useMyAiUsage();
  const update = useUpdateMyBudget();
  const request = useRequestMyExtra();
  const busy = update.isPending || request.isPending;

  const data = usageQuery.data;
  const unavailable =
    usageQuery.error && [404, 409].includes(getErrorStatus(usageQuery.error) ?? 0);

  if (usageQuery.isLoading) return <ConsoleLoading />;
  if (unavailable || (data && !data.active))
    return <p className="text-sm text-muted-foreground">{NOT_ON}</p>;
  if (usageQuery.error || !data)
    return (
      <Alert variant="danger">
        {getApiErrorMessage(usageQuery.error) ?? 'Could not read the AI usage.'}
      </Alert>
    );

  const save = (body: WorkspaceBudgetUpdate) =>
    update.mutateAsync(body).then(
      () => true,
      (error: unknown) => {
        failed('Could not save.')(error);
        return false;
      }
    );
  const cap = data.budget && data.bulkLimitOn ? (data.budget * data.bulkPct) / 100 : 0;
  const { canEdit } = data;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2.5 items-center">
            <h3 className="font-display text-base font-semibold">
              {data.group.kind === 'alliance'
                ? `Organisation ${data.group.name}`
                : 'Not in an organisation'}
            </h3>
            <Badge variant="secondary">{data.month}</Badge>
            <span className="text-sm text-muted-foreground">
              resets {new Date(data.resetsAt).toLocaleDateString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 items-end">
            <BudgetField
              key={`${data.group.key}-${data.budget}-${data.budgetSource}`}
              detail={{ key: data.group.key, budget: data.budget, budgetSource: data.budgetSource }}
              canEdit={canEdit.budget}
              plansAvailable={false}
              busy={busy}
              onUpdate={(body) => save({ budget: body.budget })}
            />
            <BulkLimitField
              on={data.bulkLimitOn}
              pct={data.bulkPct}
              cap={cap}
              canEdit={canEdit.bulk && !busy}
              onToggle={(bulkLimitOn) => void save({ bulkLimitOn })}
            />
          </div>
          <BudgetBar
            budget={data.budget}
            spend={{ ...data.spend, extra: data.extra?.used ?? 0 }}
            bulkLimitOn={data.bulkLimitOn}
            bulkPct={data.bulkPct}
            bulkPctMin={data.bulkPctMin}
            bulkPctMax={data.bulkPctMax}
            canEdit={canEdit.bulk}
            onBulkPctChange={(bulkPct) => save({ bulkPct })}
          />
          <StatusText tone={data.groupStatus.tone} text={data.groupStatus.text} testId="group-status" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <h3 className="font-display text-base font-semibold">This workspace</h3>
          <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Its bulk limit</FieldLabel>
              <span className="font-mono text-lg" data-testid="my-bulk-limit">
                {data.myBulkLimit === null ? 'No own limit' : `At most ${fmtTokens(data.myBulkLimit)}`}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Its bulk spend this month</FieldLabel>
              <span className="font-mono text-lg" data-testid="my-bulk-spend">
                {fmtTokens(data.myBulkSpend)}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Extra for bulk work</FieldLabel>
              {data.extra ? (
                <>
                  <span className="font-mono text-lg">+{fmtTokens(data.extra.tokens)}</span>
                  <span className="text-sm text-muted-foreground">
                    {fmtTokens(data.extra.used)} used · {extraEndsText(data.extra.endsAt)}
                  </span>
                </>
              ) : (
                <span className="font-mono text-lg">None</span>
              )}
            </div>
          </div>
          <StatusText tone={data.status.tone} text={data.status.text} testId="my-status" />
          {data.bulkPaused && (
            <p className="text-sm text-muted-foreground" data-testid="bulk-paused-hint">
              Bulk work (knowledge base, imports, re-mines) is paused for this workspace. Live mail
              continues.{' '}
              {canEdit.request
                ? 'Request extra below to let it continue.'
                : 'A workspace admin can request extra to let it continue.'}
            </p>
          )}
          {canEdit.request && (
            <RequestExtraBox
              busy={busy}
              onRequest={(tokens, reason) =>
                request.mutateAsync({ tokens, reason }).then(
                  () => {
                    toast.success('Request sent to the platform admin');
                    return true;
                  },
                  (error: unknown) => {
                    failed('Could not send the request.')(error);
                    return false;
                  }
                )
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
