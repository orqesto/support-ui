import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Badge } from '@/components/ui/Badge';

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
 */
export const SourceRowBadges = ({
  departmentId,
  isKnowledgeBase,
}: {
  departmentId?: number | null;
  isKnowledgeBase?: boolean;
}) => (
  <>
    {typeof departmentId === 'number' && <DepartmentBadge departmentId={departmentId} size="sm" />}
    {isKnowledgeBase === true && <Badge variant="secondary">Knowledge Base</Badge>}
  </>
);
