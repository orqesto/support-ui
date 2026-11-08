import { useDroppable } from '@dnd-kit/core';
import { ArrowRightCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APPROVE_TARGET, VALID_TARGETS } from '../kanbanColumns';

// Triage-tab approve bar: drop a triaged card here to approve it (classify='approve').
// The item then leaves triage and re-enters the lifecycle at "Open". Rendered only
// while a triaged card that CAN be approved is being dragged, so it's non-intrusive.
export const ApproveDropZone = ({ activeDragColId }: { activeDragColId: string | null }) => {
  const { setNodeRef, isOver } = useDroppable({ id: APPROVE_TARGET });
  const canApprove =
    activeDragColId !== null && (VALID_TARGETS[activeDragColId]?.has(APPROVE_TARGET) ?? false);
  if (!canApprove) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm font-medium transition-colors',
        isOver ? 'border-success bg-success/10 text-success' : 'border-border text-muted-foreground'
      )}
    >
      <ArrowRightCircle className="w-4 h-4" />
      Drop here to approve → moves to Open
    </div>
  );
};
