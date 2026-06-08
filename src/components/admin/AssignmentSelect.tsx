import { useState, useEffect, useCallback } from 'react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import { logger } from '@/lib/logger';

type AssignmentSelectProps = {
  type: 'message' | 'ticket' | 'thread';
  itemId: number | string; // threadId can be string
  currentAssigneeId?: number | null;
  skillFilter?: { key: string; value: string };
  /**
   * Wave 5 C-4: scope the picker to users in this dept. The BE enforces the
   * same scope on assignment, so callers should pass the item's dept here to
   * avoid the user picking someone who'll be rejected. Pass undefined to show
   * the full org list (used for unscoped contexts).
   */
  departmentId?: number | null;
  onAssign?: () => void;
  className?: string;
};

export const AssignmentSelect = ({
  type,
  itemId,
  currentAssigneeId,
  skillFilter,
  departmentId,
  onAssign,
  className,
}: AssignmentSelectProps) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await assignmentService.getAssignableUsers(
        skillFilter,
        departmentId ?? undefined
      );
      setUsers(data);
    } catch (error) {
      logger.error('Failed to fetch assignable users:', error);
    } finally {
      setLoading(false);
    }
  }, [skillFilter, departmentId]);

  useEffect(() => {
    fetchUsers().catch((err) => { logger.error(err); });
  }, [fetchUsers]);

  const handleAssign = async (value: string) => {
    const userId = value === '' ? null : Number.parseInt(value, 10);
    try {
      setAssigning(true);

      if (type === 'message') {
        await assignmentService.assignMessage(itemId as number, userId);
      } else if (type === 'thread') {
        await assignmentService.assignThread(itemId as string, userId);
      } else {
        await assignmentService.assignTicket(itemId as number, userId);
      }
      onAssign?.();
    } catch (error) {
      logger.error('[AssignmentSelect] Failed to assign:', error);
    } finally {
      setAssigning(false);
    }
  };

  const options = [
    { value: '', label: 'Unassigned' },
    ...users.map((user) => ({
      value: String(user.id),
      label: `${user.firstName} ${user.lastName} (${user.role})`,
    })),
  ];

  return (
    <ReactSelect
      className={className}
      value={currentAssigneeId ? String(currentAssigneeId) : ''}
      onChange={handleAssign}
      options={options}
      isDisabled={loading || assigning}
      placeholder={loading ? 'Loading...' : 'Select assignee'}
      isSearchable
    />
  );
};
