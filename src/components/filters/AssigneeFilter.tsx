import { useState, useEffect } from 'react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

type AssigneeFilterProps = {
  value?: string;
  onChange: (value: string) => void;
  skillFilter?: { key: string; value: string };
  className?: string;
};

export const AssigneeFilter = ({
  value,
  onChange,
  skillFilter,
  className,
}: AssigneeFilterProps) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedDepartmentRole = useAuthStore((state) => state.selectedDepartmentRole);
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const data = await assignmentService.getAssignableUsers(
          selectedDepartmentRole ?? undefined,
          skillFilter
        );
        setUsers(data);
      } catch (error) {
        logger.error('Failed to fetch assignable users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers().catch((e) => {
      logger.error(e);
    });
  }, [selectedDepartmentRole, skillFilter]);

  const options = [
    { value: 'all', label: 'All Assignees' },
    { value: 'unassigned', label: 'Unassigned' },
    ...(currentUser ? [{ value: String(currentUser.id), label: 'Me' }] : []),
    ...users
      .filter((u) => !currentUser || u.id !== currentUser.id)
      .map((user) => ({
        value: String(user.id),
        label: `${user.firstName} ${user.lastName}`,
      })),
  ];

  return (
    <div className={`flex gap-2 items-center ${className ?? ''}`}>
      <span className="flex gap-1 items-center text-xs font-semibold whitespace-nowrap text-muted-foreground">
        Assignee:
      </span>
      <ReactSelect
        value={value ?? 'all'}
        onChange={onChange}
        options={options}
        isDisabled={loading}
        placeholder={loading ? 'Loading...' : 'Select assignee'}
        className="min-w-[150px]"
      />
    </div>
  );
};
