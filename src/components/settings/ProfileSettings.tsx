import { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

export const ProfileSettings = () => {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    // Validation
    if (passwords.new.length < 8) {
      setNotification({
        type: 'error',
        message: 'New password must be at least 8 characters',
      });
      return;
    }

    if (passwords.new !== passwords.confirm) {
      setNotification({
        type: 'error',
        message: 'New passwords do not match',
      });
      return;
    }

    if (passwords.new === passwords.current) {
      setNotification({
        type: 'error',
        message: 'New password must be different from current password',
      });
      return;
    }

    setLoading(true);

    try {
      await authService.changePassword(passwords.current, passwords.new);
      setNotification({
        type: 'success',
        message: 'Password changed successfully',
      });
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (error) {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to change password',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-lg border ${
            notification.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* User Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-500" />
          Profile Information
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {user?.firstName} {user?.lastName}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
            <p className="text-sm text-gray-900 dark:text-gray-100 capitalize">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-blue-500" />
          Change Password
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label
              htmlFor="current-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Current Password
            </label>
            <Input
              id="current-password"
              type="password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              placeholder="Enter current password"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              New Password
            </label>
            <Input
              id="new-password"
              type="password"
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
              placeholder="Enter new password (min 8 characters)"
              required
              disabled={loading}
              minLength={8}
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Confirm New Password
            </label>
            <Input
              id="confirm-password"
              type="password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              placeholder="Confirm new password"
              required
              disabled={loading}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Changing Password...' : 'Change Password'}
          </Button>
        </form>
      </div>
    </div>
  );
};
