import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';

type AssigneeFilterProps = {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
};

export const AssigneeFilter = ({ value, onChange, className }: AssigneeFilterProps) => {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const data = await assignmentService.getAssignableUsers();
        setUsers(data);
      } catch (error) {
        console.error('Failed to fetch assignable users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers().catch(console.error);
  }, []);

  const options = [
    { value: 'all', label: 'All Assignees' },
    { value: 'unassigned', label: 'Unassigned' },
    ...users.map((user) => ({
      value: String(user.id),
      label: `${user.firstName} ${user.lastName}`,
    })),
  ];

  return (
    <div className={`flex gap-2 items-center ${className ?? ''}`}>
      <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground flex items-center gap-1">
        <User className="w-3 h-3" />
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
