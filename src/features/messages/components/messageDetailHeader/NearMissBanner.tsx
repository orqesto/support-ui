import { X, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { useDepartments } from '@/hooks/useDepartments';
import type { Message } from '@/types';
import { LABEL } from '../messageDetailConstants';
import { ICON_BTN } from './headerStyles';
import { dismissNearMiss } from './nearMiss';

type NearMissBannerProps = {
  message: Message;
  nearMissDepts: number[];
  allDepts: NonNullable<ReturnType<typeof useDepartments>['data']>;
  nearMissText: string;
  routingTo: number | null;
  handleManualRoute: (deptId: number) => Promise<void>;
  setNearMissDismissed: (dismissed: boolean) => void;
};

/*
  Re-route banner — runner-up depts from the routing engine. Lets an agent move the conversation
  to a near-miss dept in one click.
*/
export function NearMissBanner({
  message,
  nearMissDepts,
  allDepts,
  nearMissText,
  routingTo,
  handleManualRoute,
  setNearMissDismissed,
}: NearMissBannerProps) {
  return (
    <div className="px-3.5 pb-[9px] max-sm:px-4 max-sm:pt-2.5 max-sm:pb-0 max-sm:bg-card">
      {/* One line (owner, 2026-10-29): the sentence wrapped to four lines and the buttons
          to two more rows, ~120px of the conversation's room. The sentence is now the ⓘ's
          hover (and read out to screen readers); the buttons name just the team. */}
      <div className="flex flex-wrap items-center gap-1.5 px-[9px] py-1 rounded-lg border border-primary-line bg-primary-muted">
        <span className={`${LABEL} text-primary`}>Also matched</span>
        {/* Opens to the right: centred under the ⓘ, the sentence ran past the panel's left
            edge and was cut off. */}
        <Tooltip content={nearMissText} side="right" size="sm">
          <span
            tabIndex={0}
            className="inline-flex items-center text-primary/70 hover:text-primary"
          >
            <Info className="w-3.5 h-3.5" aria-hidden />
            <span className="sr-only">{nearMissText}</span>
          </span>
        </Tooltip>
        {nearMissDepts.map((deptId) => {
          const dept = allDepts.find((entry) => entry.id === deptId);
          if (!dept) return null;
          const busy = routingTo === deptId;
          return (
            <Tooltip key={deptId} content={`Move this thread to ${dept.name}`} size="sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleManualRoute(deptId)}
                disabled={busy}
                aria-label={busy ? `Moving to ${dept.name}…` : `Move to ${dept.name} →`}
                className="h-[23px] px-2 rounded-md border border-border bg-card text-[11.5px] font-normal text-foreground hover:border-border-strong hover:bg-card data-[inactive]:opacity-50"
              >
                {busy ? `${dept.name}…` : `${dept.name} →`}
              </Button>
            </Tooltip>
          );
        })}
        <span className="flex-1" />
        <Tooltip content="Dismiss" side="bottom" size="sm">
          <button
            type="button"
            aria-label="Dismiss routing suggestion"
            onClick={() => {
              dismissNearMiss(message.id);
              setNearMissDismissed(true);
            }}
            className={ICON_BTN}
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
