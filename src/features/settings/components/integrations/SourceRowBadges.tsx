import DepartmentBadge from '@/components/admin/DepartmentBadge';
import {
  describeHold,
  holdSeverity,
  HOLD_LABEL,
  type WithSyncHold,
} from '@/features/settings/components/integrations/syncHold';
import { describeMarkImportedWarning } from '@/features/settings/components/integrations/markImported';
import type { MarkImportedWarning } from '@/services/integrations.service';
import { Badge } from '@/components/ui/Badge';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * The badges on a channel row: which department it feeds, and whether it is also mined
 * into the Knowledge Base.
 *
 * The KB marker exists because channels and KB sources used to live in two separate
 * sections of `MessageSourcesSettings`, so "this mailbox is mined" was implied by which
 * heading a row appeared under. Those sections are now one list — a KB source is not a
 * different kind of entity, it is the same `message_sources` row with `isKnowledgeBase`
 * set, and a mailbox can be both an inbox and a KB source at once.
 *
 * Both badges live here rather than inlined in each card: the Email and Gmail rows render
 * an identical pair, duplicated markup like that drifts, and both card files sit at the
 * repo's max-lines cap.
 *
 * The hold-down badge joined them for the same reason, and for a sharper one: a source
 * that is being skipped by every poll rendered here identically to a working one. Both
 * channels can be held down, so both rows have to be able to say it.
 *
 * ⛔ Absence of `syncHold` renders NOTHING, not a healthy state. The field is missing
 * entirely until the backend release carrying it lands (it ships on a tag; this deploys on
 * push), and "we have nothing to report" must never be drawn as "this is fine".
 */
export const SourceRowBadges = ({
  source,
  onReconnect,
}: {
  source: {
    departmentId?: number | null;
    isKnowledgeBase?: boolean;
    markImportedWarning?: MarkImportedWarning | null;
  } & WithSyncHold;
  /** Gmail only: a hold for a rejected sign-in offers the card's "Reconnect Google Account". */
  onReconnect?: () => void | Promise<void>;
}) => (
  <>
    {typeof source.departmentId === 'number' && (
      <DepartmentBadge departmentId={source.departmentId} size="sm" />
    )}
    {source.isKnowledgeBase === true && <Badge variant="secondary">Knowledge Base</Badge>}
    {source.syncHold ? (
      <Tooltip content={describeHold(source.syncHold)}>
        <Badge variant={holdSeverity(source.syncHold.reason)}>
          {HOLD_LABEL[source.syncHold.reason] ?? HOLD_LABEL.unknown}
        </Badge>
      </Tooltip>
    ) : null}
    {source.syncHold?.reason === 'auth_failed' && onReconnect ? (
      <ReconnectButton onReconnect={onReconnect} />
    ) : null}
    {source.markImportedWarning ? (
      <Tooltip content={describeMarkImportedWarning(source.markImportedWarning)}>
        <Badge variant={source.markImportedWarning.status === 'failed' ? 'warning' : 'secondary'}>
          {source.markImportedWarning.status === 'failed' ? 'Not marked read' : 'No label'}
        </Badge>
      </Tooltip>
    ) : null}
  </>
);

/** Disabled while the Google popup is open, so a double click cannot open two. */
const ReconnectButton = ({ onReconnect }: { onReconnect: () => void | Promise<void> }) => {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      isLoading={busy}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void Promise.resolve(onReconnect()).finally(() => setBusy(false));
      }}
    >
      Reconnect
    </Button>
  );
};
