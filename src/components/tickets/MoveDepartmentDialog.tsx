import { useEffect, useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuthStore } from '@/stores/authStore';
import { assignmentService } from '@/services/assignment.service';
import { logger } from '@/lib/logger';

type MoveDepartmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  ticketId: number;
  currentDepartmentId: number | null | undefined;
  currentAssigneeId: number | null;
  currentAssigneeName?: string | null;
  onMoved?: () => void;
};

export const MoveDepartmentDialog = ({
  isOpen,
  onClose,
  ticketId,
  currentDepartmentId,
  currentAssigneeId,
  currentAssigneeName,
  onMoved,
}: MoveDepartmentDialogProps) => {
  const { data: departments = [] } = useDepartments();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.organizationRole === 'org_admin';

  const [targetDeptId, setTargetDeptId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the current assignee is a member of the selected target dept.
  // null = unknown (not yet checked / still loading), true = will stay,
  // false = will be cleared by the BE. Drives a more accurate warning than
  // "the assignee MIGHT be cleared if…".
  const [assigneeInTarget, setAssigneeInTarget] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTargetDeptId(null);
      setError(null);
      setSubmitting(false);
      setAssigneeInTarget(null);
    }
  }, [isOpen]);

  // When the target dept changes, fetch its assignable users and check whether
  // the current assignee is among them. Skips the call if there's no assignee
  // or no target — nothing to predict.
  useEffect(() => {
    if (!isOpen || targetDeptId === null || currentAssigneeId === null) {
      setAssigneeInTarget(null);
      return;
    }
    let cancelled = false;
    setAssigneeInTarget(null);
    assignmentService
      .getAssignableUsers(undefined, targetDeptId)
      .then((deptUsers) => {
        if (cancelled) return;
        setAssigneeInTarget(deptUsers.some((deptUser) => deptUser.id === currentAssigneeId));
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('Failed to check assignee target-dept membership:', err);
        // Treat as unknown so we fall back to the soft warning rather than misreport.
        setAssigneeInTarget(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, targetDeptId, currentAssigneeId]);

  // Active depts (excluding the current one). Non-admins are restricted to
  // depts they're a member of — the BE enforces this too, but filtering here
  // gives instant feedback.
  const callerDeptIds = user?.departmentIds ?? [];
  const candidateDepts = departments.filter((dept) => {
    if (!dept.active) return false;
    if (dept.id === currentDepartmentId) return false;
    if (isAdmin) return true;
    return callerDeptIds.includes(dept.id);
  });

  const currentDept = departments.find((dept) => dept.id === currentDepartmentId);

  const handleMove = async () => {
    if (!targetDeptId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await assignmentService.moveTicketDepartment(ticketId, targetDeptId);
      onMoved?.();
      onClose();
      if (result.assigneeCleared) {
        logger.info(
          `Ticket ${ticketId} moved to dept ${targetDeptId}. Assignee cleared (not in new dept).`
        );
      }
    } catch (err) {
      logger.error('Failed to move ticket dept:', err);
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to move the ticket. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Predict the assignee outcome from the target-dept membership lookup so we
  // only warn when we actually expect a clear. assigneeInTarget === null is the
  // pre-fetch state — render nothing rather than a misleading warning.
  const willClearAssignee =
    targetDeptId !== null &&
    currentAssigneeId !== null &&
    assigneeInTarget === false;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move ticket to another department</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current:</span>
            <span className="font-medium">{currentDept?.name ?? 'None'}</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {targetDeptId
                ? departments.find((dept) => dept.id === targetDeptId)?.name ?? '—'
                : 'Select…'}
            </span>
          </div>

          <div>
            <label htmlFor="target-dept" className="block mb-2 text-sm font-medium">
              Target department
            </label>
            {candidateDepts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No other departments available to move to. You can only move to depts you&apos;re a
                member of (or all active depts as an admin).
              </p>
            ) : (
              <select
                id="target-dept"
                value={targetDeptId ?? ''}
                onChange={(ev) => setTargetDeptId(Number(ev.target.value) || null)}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select department…</option>
                {candidateDepts.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {willClearAssignee && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900 dark:text-yellow-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                The current assignee
                {currentAssigneeName ? ` (${currentAssigneeName})` : ''} is not a member of the
                target department and will be cleared.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md text-sm text-red-600 bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-900 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleMove()}
            disabled={!targetDeptId || submitting}
          >
            {submitting ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
