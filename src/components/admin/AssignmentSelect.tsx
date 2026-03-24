import { useState, useEffect, useCallback } from 'react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';

type AssignmentSelectProps = {
  type: 'message' | 'ticket' | 'thread';
  itemId: number | string; // threadId can be string
  currentAssigneeId?: number | null;
  departmentRole?: string;
  onAssign?: () => void;
  className?: string;
};

export const AssignmentSelect = ({
  type,
  itemId,
  currentAssigneeId,
  departmentRole,
  onAssign,
  className,
}: AssignmentSelectProps) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await assignmentService.getAssignableUsers(departmentRole);
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch assignable users:', error);
    } finally {
      setLoading(false);
    }
  }, [departmentRole]);

  useEffect(() => {
    fetchUsers().catch(console.error);
  }, [fetchUsers]);

  const handleAssign = async (value: string) => {
    const userId = value === '' ? null : Number.parseInt(value, 10);

    console.log('[AssignmentSelect] Assigning:', {
      type,
      itemId,
      userId,
      isThread: type === 'thread',
    });

    try {
      setAssigning(true);

      if (type === 'message') {
        console.log('[AssignmentSelect] Calling assignMessage');
        await assignmentService.assignMessage(itemId as number, userId);
      } else if (type === 'thread') {
        console.log('[AssignmentSelect] Calling assignThread with threadId:', itemId);
        await assignmentService.assignThread(itemId as string, userId);
      } else {
        console.log('[AssignmentSelect] Calling assignTicket');
        await assignmentService.assignTicket(itemId as number, userId);
      }

      console.log('[AssignmentSelect] Assignment successful, calling onAssign');
      onAssign?.();
    } catch (error) {
      console.error('[AssignmentSelect] Failed to assign:', error);
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
