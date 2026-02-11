import { useState, type FormEvent } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';

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
    organizationRole: 'org_admin' | 'moderator' | 'support' | 'associate';
    departmentRole: 'support' | 'sales' | 'billing' | 'general' | 'hr';
  }) => Promise<void>;
};

export const CreateUserModal = ({ isOpen, onClose, onCreate }: CreateUserModalProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [organizationRole, setOrganizationRole] = useState<'org_admin' | 'moderator' | 'support' | 'associate'>('associate');
  const [departmentRole, setDepartmentRole] = useState<'support' | 'sales' | 'billing' | 'general' | 'hr'>('general');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
      await onCreate({
        email,
        password,
        firstName,
        lastName: lastName || undefined,
        position: position || undefined,
        role,
        organizationRole,
        departmentRole,
      });
      
      // Reset form
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setPosition('');
      setRole('user');
      setOrganizationRole('associate');
      setDepartmentRole('general');
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

  const departmentRoleOptions = [
    { value: 'general', label: 'General' },
    { value: 'support', label: 'Support' },
    { value: 'sales', label: 'Sales' },
    { value: 'billing', label: 'Billing' },
    { value: 'hr', label: 'HR' },
  ];

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
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
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
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Last Name</label>
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">Position</label>
            <Input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
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
            onChange={(value) => setOrganizationRole(value as 'org_admin' | 'moderator' | 'support' | 'associate')}
            options={organizationRoleOptions}
            placeholder="Select organization role"
          />

          <ReactSelect
            label="Department"
            value={departmentRole}
            onChange={(value) => setDepartmentRole(value as 'support' | 'sales' | 'billing' | 'general' | 'hr')}
            options={departmentRoleOptions}
            placeholder="Select department"
          />

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
