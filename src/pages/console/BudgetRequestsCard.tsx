import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExtraBox } from '@/components/budget/ExtraBox';
import { fmtMoney } from '@/components/budget/budget.rules';
import { useDeclineRequest, useGiveExtra } from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { RequestRow } from '@/services/budgets.service';

/**
 * Open requests for extra (from organisation and workspace admins). Give opens the extra box
 * with the requested amount and answers the request; Decline asks first.
 */
export const BudgetRequestsCard = ({
  requests,
  count = requests.length,
  groupKey,
}: {
  requests: RequestRow[];
  /** All open requests (the list may be capped). */
  count?: number;
  /** The group whose page shows the card, so it is refreshed after an answer. */
  groupKey?: string;
}) => {
  const [giving, setGiving] = useState<number | null>(null);
  const [declining, setDeclining] = useState<RequestRow | null>(null);
  const give = useGiveExtra(groupKey);
  const decline = useDeclineRequest(groupKey);
  const busy = give.isPending || decline.isPending;

  if (count === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
        <h3 className="font-display text-base font-semibold">Requests for extra · {count} open</h3>
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li
              key={request.id}
              data-testid={`budget-request-${request.id}`}
              className="flex flex-col gap-2 pb-3 border-b border-border last:border-b-0"
            >
              <div className="flex flex-wrap gap-2.5 justify-between items-center">
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {request.target.name} asks for{' '}
                    {request.amountMicros > 0
                      ? `${fmtMoney(request.amountMicros)}`
                      : 'extra (asked in tokens, before money budgets)'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {request.requestedBy} · {new Date(request.createdAt).toLocaleDateString()}
                    {request.reason ? ` · “${request.reason}”` : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={giving === request.id ? 'outline' : 'primary'}
                    disabled={busy}
                    onClick={() =>
                      setGiving((current) => (current === request.id ? null : request.id))
                    }
                  >
                    {giving === request.id ? 'Cancel' : 'Give'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setDeclining(request)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
              {giving === request.id && (
                <div className="max-w-md">
                  <ExtraBox
                    key={`request-${request.id}`}
                    extra={null}
                    initialAmount={request.amountMicros}
                    busy={busy}
                    onGive={(amountMicros, end) =>
                      give.mutate(
                        {
                          targets: [
                            {
                              allianceId: request.target.allianceId,
                              organizationId: request.target.organizationId,
                            },
                          ],
                          amountMicros,
                          end,
                          requestId: request.id,
                        },
                        {
                          onSuccess: () => {
                            setGiving(null);
                            toast.success(`Extra given to ${request.target.name}`);
                          },
                          onError: (error) =>
                            toast.error(getApiErrorMessage(error) ?? 'Could not give the extra.'),
                        }
                      )
                    }
                    onEnd={() => {}}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        {count > requests.length && (
          <p className="text-sm text-muted-foreground">
            Showing the newest {requests.length} of {count}.
          </p>
        )}
        <ConfirmDialog
          open={declining !== null}
          onOpenChange={(open) => {
            if (!open) setDeclining(null);
          }}
          title="Decline this request?"
          description={
            declining
              ? `${declining.target.name} asked for ${declining.amountMicros > 0 ? `${fmtMoney(declining.amountMicros)}` : 'extra'}.`
              : ''
          }
          confirmText="Decline"
          onConfirm={() => {
            if (!declining) return;
            decline.mutate(declining.id, {
              onError: (error) =>
                toast.error(getApiErrorMessage(error) ?? 'Could not decline the request.'),
            });
          }}
        />
      </CardContent>
    </Card>
  );
};
