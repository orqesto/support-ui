import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { BudgetGroupView } from '@/components/budget/BudgetGroupView';
import {
  useAllianceBudget,
  useRequestAllianceExtra,
  useSetAllianceWorkspaceLimits,
  useUpdateAllianceBudget,
} from '@/hooks/useBudgets';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';

const failed = (fallback: string) => (error: unknown) =>
  toast.error(getApiErrorMessage(error) ?? fallback);

const NOT_ON = 'Budgets are not switched on yet.';

/**
 * Organisation console → AI budget. The organisation admin sees the monthly budget (never
 * editable here), may change the bulk limit and the workspaces' own limits where the API says
 * so (`canEdit`), and asks the platform admin for extra.
 */
export const ConsoleAiBudget = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;
  const budgetQuery = useAllianceBudget(numericId);
  const update = useUpdateAllianceBudget(numericId ?? 0);
  const setLimits = useSetAllianceWorkspaceLimits(numericId ?? 0);
  const request = useRequestAllianceExtra(numericId ?? 0);
  const busy = update.isPending || setLimits.isPending || request.isPending;

  const data = budgetQuery.data;
  const unavailable =
    budgetQuery.error && [404, 409].includes(getErrorStatus(budgetQuery.error) ?? 0);

  let body;
  if (budgetQuery.isLoading) body = <ConsoleLoading />;
  else if (unavailable || (data && !data.active))
    body = <p className="text-sm text-muted-foreground">{NOT_ON}</p>;
  else if (budgetQuery.error || !data)
    body = (
      <Alert variant="danger">
        {getApiErrorMessage(budgetQuery.error) ?? 'Could not read this budget.'}
      </Alert>
    );
  else
    body = (
      <BudgetGroupView
        detail={data}
        canEdit={data.canEdit}
        mode="organisation"
        busy={busy}
        onUpdate={(changes) =>
          update
            .mutateAsync({ bulkLimitOn: changes.bulkLimitOn, bulkPct: changes.bulkPct })
            .then(
              () => true,
              (error: unknown) => {
                failed('Could not save.')(error);
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
        onRequestExtra={(organizationId, tokens, reason) =>
          request.mutateAsync({ tokens, reason, organizationId: organizationId ?? undefined }).then(
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
    );

  return (
    <div className="flex flex-col gap-4">
      <ConsolePageHeader
        title="AI budget"
        description={
          data?.active
            ? `${data.name} · ${data.month} · resets ${new Date(data.resetsAt).toLocaleDateString()}`
            : 'The monthly AI budget of this organisation'
        }
      />
      {body}
    </div>
  );
};
