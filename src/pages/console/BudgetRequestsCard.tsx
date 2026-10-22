import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExtraBox } from '@/components/budget/ExtraBox';
import { fmtMoney, type ExtraEndChoice } from '@/components/budget/budget.rules';
import { useBudgetGroup, useDeclineRequest, useGiveExtra } from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { RequestRow } from '@/services/budgets.service';

/** Why Give is off for an organisation-wide request once its organisation is `separate`. */
export const ORG_WIDE_SEPARATE_REASON =
  'This organisation now gives each workspace its own budget, so there is no organisation-wide extra to give. Decline it, or give extra to one of its workspaces.';

/**
 * Is the organisation of an organisation-wide request `separate` now? The group page passes what it
 * knows (`known`); elsewhere (the list page) the organisation's detail is read. `false` for a
 * workspace request; `undefined` while unknown (Give stays on, the backend still refuses).
 */
const useOrgWideSeparate = (request: RequestRow, known: boolean | undefined) => {
  const orgWide = request.target.organizationId === null && request.target.allianceId !== null;
  const lookup = orgWide && known === undefined;
  const { data } = useBudgetGroup(lookup ? `a:${request.target.allianceId}` : null);
  if (!orgWide) return false;
  if (known !== undefined) return known;
  return data?.mode ? data.mode.current === 'separate' : undefined;
};

/**
 * Open requests for extra (from organisation and workspace admins). Give opens the extra box
 * with the requested amount and answers the request; Decline asks first.
 */
export const BudgetRequestsCard = ({
  requests,
  count = requests.length,
  groupKey,
  organisation,
}: {
  requests: RequestRow[];
  /** All open requests (the list may be capped). */
  count?: number;
  /** The group whose page shows the card, so it is refreshed after an answer. */
  groupKey?: string;
  /**
   * The group page's own organisation: its id and whether it is `separate` now. Organisation-wide
   * requests of it then need no extra read.
   */
  organisation?: { allianceId: number; separate: boolean };
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
            <RequestItem
              key={request.id}
              request={request}
              separateKnown={
                organisation && request.target.allianceId === organisation.allianceId
                  ? organisation.separate
                  : undefined
              }
              giving={giving === request.id}
              busy={busy}
              onToggleGive={() =>
                setGiving((current) => (current === request.id ? null : request.id))
              }
              onDecline={() => setDeclining(request)}
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
            />
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

const RequestItem = ({
  request,
  separateKnown,
  giving,
  busy,
  onToggleGive,
  onDecline,
  onGive,
}: {
  request: RequestRow;
  separateKnown: boolean | undefined;
  giving: boolean;
  busy: boolean;
  onToggleGive: () => void;
  onDecline: () => void;
  onGive: (amountMicros: number | 'suggested', end: ExtraEndChoice) => void;
}) => {
  // An organisation-wide request made while the organisation was `shared`: after a switch to
  // `separate` the backend refuses the give (400), so Give is off with the reason; Decline stays.
  const giveBlocked = useOrgWideSeparate(request, separateKnown) === true;
  return (
    <li
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
            variant={giving ? 'outline' : 'primary'}
            disabled={busy || giveBlocked}
            title={giveBlocked ? ORG_WIDE_SEPARATE_REASON : undefined}
            onClick={onToggleGive}
          >
            {giving ? 'Cancel' : 'Give'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDecline}>
            Decline
          </Button>
        </div>
      </div>
      {giveBlocked && (
        <p className="text-sm text-muted-foreground" data-testid={`budget-request-${request.id}-blocked`}>
          {ORG_WIDE_SEPARATE_REASON}
        </p>
      )}
      {giving && !giveBlocked && (
        <div className="max-w-md">
          <ExtraBox
            key={`request-${request.id}`}
            extra={null}
            initialAmount={request.amountMicros}
            busy={busy}
            onGive={onGive}
            onEnd={() => {}}
          />
        </div>
      )}
    </li>
  );
};
