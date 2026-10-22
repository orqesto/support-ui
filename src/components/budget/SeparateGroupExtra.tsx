import { Button } from '@/components/ui/Button';
import type { ExtraView } from '@/services/budgets.service';
import { extraEndsText, extraLeft, fmtMoney } from './budget.rules';

/**
 * An organisation extra given while the organisation was `shared` stays active after a switch to
 * `separate` until it ends (release punch list F1): shown read-only, and the platform admin can End
 * it (`onEnd` given only to someone who may).
 */
export const SeparateGroupExtra = ({
  extra,
  busy,
  onEnd,
}: {
  extra: ExtraView;
  busy?: boolean;
  onEnd?: (grantIds: number[]) => void;
}) => (
  <div
    className="flex flex-wrap gap-3 items-center text-sm text-muted-foreground"
    data-testid="budget-separate-group-extra"
  >
    <span>
      Extra for the whole organisation (given before the switch): {fmtMoney(extra.amountMicros)},{' '}
      {fmtMoney(extraLeft(extra))} left · {extraEndsText(extra.endsAt)}
    </span>
    {onEnd && (
      <Button variant="outline" size="sm" disabled={busy} onClick={() => onEnd(extra.grantIds)}>
        End extra
      </Button>
    )}
  </div>
);
