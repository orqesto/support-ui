import DepartmentBadge from '@/components/admin/DepartmentBadge';
import {
  describeHold,
  holdSeverity,
  HOLD_LABEL,
  type WithSyncHold,
} from '@/components/settings/integrations/syncHold';
import { Badge } from '@/components/ui/Badge';
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
}: {
  source: { departmentId?: number | null; isKnowledgeBase?: boolean } & WithSyncHold;
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
  </>
);
