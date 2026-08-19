import { useEffect, useState } from 'react';
import { Bot, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { assignmentService } from '@/services/assignment.service';
import { approvalProvenance, type KBEntry } from '@/services/kb.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Who approved a KB entry — and, more to the point, whether anyone did.
 *
 * `approved` used to carry two meanings at once: "a person vetted this" and "a score
 * cleared this". BE #373 split them; this renders the difference. It matters because an
 * approved entry is quotable by the AI as ground truth, and on production every approval
 * to date was automatic.
 */

const AUTO_APPROVED_HINT =
  'Approved automatically because its quality score cleared the threshold. No person has reviewed it.';

/** Resolve the approver's name. Falls back to a neutral label — never blocks the badge. */
const useApproverName = (userId: number | null | undefined): string | null => {
  const currentUser = useAuthStore((state) => state.user);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof userId !== 'number') {
      setName(null);
      return;
    }
    if (currentUser?.id === userId) {
      setName('you');
      return;
    }

    let cancelled = false;
    assignmentService
      .getAssignableUsers()
      .then((users) => {
        if (cancelled) return;
        const match = users.find((user) => user.id === userId);
        // A deactivated reviewer is no longer assignable (BE #366 filters them out), so a
        // miss here is expected rather than an error — the neutral label covers it.
        setName(match ? `${match.firstName} ${match.lastName}`.trim() : null);
      })
      .catch((error) => {
        logger.warn('[KB] Could not resolve approver name', error);
        if (!cancelled) setName(null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, currentUser?.id]);

  return name;
};

/**
 * Compact badge for lists. Renders nothing for entries that are not approved, and nothing
 * when the backend has not shipped the fields yet — an unknown provenance must not be
 * drawn as a known one.
 */
export const KBApprovalBadge = ({ entry }: { entry: KBEntry }) => {
  const provenance = approvalProvenance(entry);

  if (provenance === 'unreviewed') {
    return (
      <Badge variant="secondary" className="gap-1" title={AUTO_APPROVED_HINT}>
        <Bot className="w-3 h-3" />
        Auto
      </Badge>
    );
  }

  if (provenance === 'reviewed') {
    return (
      <Badge variant="secondary" className="gap-1" title="Reviewed and approved by a person.">
        <UserCheck className="w-3 h-3" />
        Reviewed
      </Badge>
    );
  }

  return null;
};

/** Full line for the detail drawer, where there is room to say what it means. */
export const KBApprovalProvenance = ({ entry }: { entry: KBEntry }) => {
  const provenance = approvalProvenance(entry);
  const approverName = useApproverName(provenance === 'reviewed' ? entry.approvedBy : null);

  if (provenance === 'pending' || provenance === 'unknown') return null;

  const approvedAt = entry.approvedAt ? formatDate(entry.approvedAt) : null;

  return (
    <div className="col-span-2">
      <span className="text-muted-foreground">Approval:</span>
      {provenance === 'unreviewed' ? (
        <div className="flex gap-2 items-center mt-1 font-medium">
          <Bot className="w-4 h-4 text-muted-foreground" />
          <span>Auto-approved by quality score</span>
          <span className="font-normal text-muted-foreground">— not reviewed by a person</span>
        </div>
      ) : (
        <div className="flex gap-2 items-center mt-1 font-medium">
          <UserCheck className="w-4 h-4 text-green-600" />
          <span>Reviewed by {approverName ?? 'a team member'}</span>
          {approvedAt && <span className="font-normal text-muted-foreground">on {approvedAt}</span>}
        </div>
      )}
    </div>
  );
};
