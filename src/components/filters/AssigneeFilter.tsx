import { useState, useEffect, useMemo } from 'react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

type AssigneeFilterProps = {
  value?: string;
  onChange: (value: string) => void;
  skillFilter?: { key: string; value: string };
  className?: string;
  hideLabel?: boolean;
};

export const AssigneeFilter = ({
  value,
  onChange,
  skillFilter,
  className,
  hideLabel = false,
}: AssigneeFilterProps) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedDepartmentRole = useAuthStore((state) => state.selectedDepartmentRole);
  const currentUser = useAuthStore((state) => state.user);

  // Serialize the skillFilter object so the effect only re-runs when the
  // filter content actually changes, not when the parent re-creates the object literal.
  const skillFilterKey = useMemo(() => JSON.stringify(skillFilter ?? null), [skillFilter]);

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
    // skillFilterKey is the stable JSON serialization of skillFilter (via useMemo on line ~29).
    // skillFilter itself is intentionally omitted from deps: using the raw object reference would
    // cause the effect to re-run on every parent render when the parent recreates the object literal.
    // This is safe because useMemo runs synchronously before effects, so skillFilter is always
    // up-to-date when the effect fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skillFilterKey is the stable serialization; skillFilter captured safely via synchronous useMemo
  }, [selectedDepartmentRole, skillFilterKey]);

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
      {!hideLabel && (
        <span className="flex gap-1 items-center text-xs font-semibold whitespace-nowrap text-muted-foreground">
          Assignee:
        </span>
      )}
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
