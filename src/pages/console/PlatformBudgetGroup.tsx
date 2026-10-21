import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { BudgetGroupView } from '@/components/budget/BudgetGroupView';
import {
  useBudgetGroup,
  useBudgetState,
  useEndExtra,
  useGiveExtra,
  useSetGroupMode,
  useSetWorkspaceLimits,
  useUpdateBudgetGroup,
} from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { BudgetRequestsCard } from './BudgetRequestsCard';
import { groupPath } from './PlatformBudgets';

const failed = (fallback: string) => (error: unknown) =>
  toast.error(getApiErrorMessage(error) ?? fallback);

/** Platform → AI Spend → one organisation or standalone workspace (`ai-spend/groups/:key`). */
export const PlatformBudgetGroup = () => {
  const { key = '' } = useParams<{ key: string }>();
  const stateQuery = useBudgetState();
  const state = stateQuery.data?.available ? stateQuery.data.state : null;
  // The group call answers 409 before Apply: only made once the state says the budgets are on.
  const { data: detail, isLoading, error } = useBudgetGroup(state?.active ? key : null);
  const update = useUpdateBudgetGroup(key);
  const setLimits = useSetWorkspaceLimits(key);
  const give = useGiveExtra(key);
  const end = useEndExtra(key);
  const setMode = useSetGroupMode(key);
  const busy =
    update.isPending || setLimits.isPending || give.isPending || end.isPending || setMode.isPending;

  const back = (
    <Link
      to="/console/platform/ai-spend"
      className="inline-flex gap-1.5 items-center text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      AI Spend
    </Link>
  );

  let body;
  if (stateQuery.isLoading || (state?.active && isLoading)) body = <ConsoleLoading />;
  else if (stateQuery.data && !stateQuery.data.available)
    body = <p className="text-sm text-muted-foreground">Budgets need the latest server update.</p>;
  else if (state && !state.active)
    body = <p className="text-sm text-muted-foreground">Budgets are not switched on yet.</p>;
  else if (stateQuery.error || error || !detail)
    body = (
      <Alert variant="danger">
        {getApiErrorMessage(stateQuery.error ?? error) ?? 'Could not read this budget.'}
      </Alert>
    );
  else
    body = (
      <>
        <BudgetRequestsCard requests={detail.requests} groupKey={key} />
        <BudgetGroupView
          detail={detail}
          canEdit={detail.canEdit}
          mode="platform"
          workspacePath={(organizationId) => groupPath(`w:${organizationId}`)}
          plansAvailable={state ? !state.selfHosted : false}
          busy={busy}
          onUpdate={(body) =>
            update.mutateAsync(body).then(
              () => true,
              (saveError: unknown) => {
                failed('Could not save.')(saveError);
                return false;
              }
            )
          }
          onSetLimits={(organizationIds, limit) =>
            setLimits.mutate(
              { organizationIds, limit },
              { onError: failed('Could not set the limit.') }
            )
          }
          onSetMode={(mode) =>
            setMode.mutateAsync(mode).then(
              () => {
                toast.success('Mode saved; it applies from the next reset');
                return true;
              },
              (saveError: unknown) => {
                failed('Could not change the mode.')(saveError);
                return false;
              }
            )
          }
          onGiveExtra={(targets, amountMicros, endChoice) =>
            give.mutate(
              { targets, amountMicros, end: endChoice },
              {
                onSuccess: () => toast.success('Extra given'),
                onError: failed('Could not give the extra.'),
              }
            )
          }
          onEndExtra={(grantIds) =>
            end.mutate(grantIds, { onError: failed('Could not end the extra.') })
          }
        />
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      {back}
      <ConsolePageHeader
        title={detail?.name ?? 'Budget'}
        description={
          detail
            ? `${detail.workspaces} workspace${detail.workspaces === 1 ? '' : 's'} · ${detail.month} · resets ${new Date(detail.resetsAt).toLocaleDateString()}`
            : undefined
        }
        actions={
          detail ? (
            <Badge variant="secondary">
              {detail.kind === 'alliance' ? 'Organisation' : 'Workspace'}
            </Badge>
          ) : undefined
        }
      />
      {body}
    </div>
  );
};
