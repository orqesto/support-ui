import { useState, useEffect, type FormEvent } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { departmentService, type Department } from '@/services/department.service';
import type { OrganizationRole } from '@/types/roles';

type CreateUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    position?: string;
    role?: 'admin' | 'user';
    organizationRole: OrganizationRole;
    departmentIds: number[];
  }) => Promise<void>;
};

export const CreateUserModal = ({ isOpen, onClose, onCreate }: CreateUserModalProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [organizationRole, setOrganizationRole] = useState<OrganizationRole>('associate');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    if (isOpen) {
      departmentService
        .getAll()
        .then((depts) => {
          setDepartments(depts);
          if (depts.length > 0) setDepartmentId((prev) => prev ?? depts[0].id);
        })
        .catch(() => setDepartments([]));
    }
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!email || !password || !firstName) {
      setError('Email, password, and first name are required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      // org_admin (and global admin) need cross-dept visibility — without it the
      // smart-routing fan-out lands in depts they can't see. Default to all active
      // depts; admin can pare it back via the edit modal after create.
      const departmentIds =
        organizationRole === 'org_admin' || role === 'admin'
          ? departments.map((dept) => dept.id)
          : departmentId
            ? [departmentId]
            : [];

      await onCreate({
        email,
        password,
        firstName,
        lastName: lastName || undefined,
        position: position || undefined,
        role,
        organizationRole,
        departmentIds,
      });

      // Reset form
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setPosition('');
      setRole('user');
      setOrganizationRole('associate');
      setDepartmentId(departments[0]?.id ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const organizationRoleOptions = [
    { value: 'org_admin', label: 'Organization Admin' },
    { value: 'moderator', label: 'Moderator' },
    { value: 'support', label: 'Support' },
    { value: 'associate', label: 'Associate' },
  ];

  const departmentOptions = departments.map((dept) => ({ value: String(dept.id), label: dept.name }));

  const globalRoleOptions = [
    { value: 'user', label: 'User' },
    { value: 'admin', label: 'Admin (Global)' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center bg-black/50">
      <div className="relative p-6 w-full max-w-md bg-white rounded-lg shadow-xl dark:bg-gray-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex gap-3 items-center mb-6">
          <div className="flex justify-center items-center w-12 h-12 rounded-lg bg-primary/10">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Create User</h2>
            <p className="text-sm text-muted-foreground">
              Create a new user account directly
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium">
              Email <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">
              Password <span className="text-red-500">*</span>
            </label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              required
              minLength={8}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium">
                First Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="John"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Last Name</label>
              <Input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Position</label>
            <Input
              type="text"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              placeholder="Support Agent"
            />
          </div>

          <ReactSelect
            label="Global Role"
            value={role}
            onChange={(value) => setRole(value as 'admin' | 'user')}
            options={globalRoleOptions}
            placeholder="Select global role"
          />

          <ReactSelect
            label="Organization Role"
            value={organizationRole}
            onChange={(value) => setOrganizationRole(value as OrganizationRole)}
            options={organizationRoleOptions}
            placeholder="Select organization role"
          />

          {organizationRole === 'org_admin' || role === 'admin' ? (
            <div className="px-3 py-2 text-sm rounded-md border bg-muted/30 text-muted-foreground">
              <strong>Departments:</strong> All active departments (admin role — auto-linked for
              cross-dept routing visibility). Adjust later via Edit.
            </div>
          ) : (
            <ReactSelect
              label="Department"
              value={String(departmentId ?? '')}
              onChange={(value) => setDepartmentId(value ? Number(value) : null)}
              options={departmentOptions}
              placeholder={departments.length === 0 ? 'Loading...' : 'Select department'}
            />
          )}

          {error && (
            <div className="p-3 text-sm text-red-600 rounded bg-red-50 dark:bg-red-900/20">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
