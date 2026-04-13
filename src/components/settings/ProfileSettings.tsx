import { useState, useEffect } from 'react';
import { Lock, User, Tag, X, PenLine, ShieldCheck } from 'lucide-react';
import { TwoFactorSettings } from './TwoFactorSettings';
import { userService } from '@/services/user.service';
import { organizationService } from '@/services/organization.service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

export const ProfileSettings = () => {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);

  const [skillValues, setSkillValues] = useState<Record<string, string[]>>({});
  const [canEditSkills, setCanEditSkills] = useState(false);
  const [routingKeys, setRoutingKeys] = useState<Array<{ id: number; key: string; description: string | null }>>([]);
  const [skillInputs, setSkillInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user?.id) {
      void userService.getSelfSkillValues().then(setSkillValues).catch(() => setSkillValues({}));
      void userService.getSelfCanEditSkills().then(setCanEditSkills).catch(() => setCanEditSkills(false));
    }
  }, [user?.id]);

  useEffect(() => {
    void organizationService.getRoutingKeys().then(setRoutingKeys).catch(() => setRoutingKeys([]));
  }, []);

  const handleAddValue = (key: string) => {
    const raw = skillInputs[key]?.trim() ?? '';
    if (!raw) return;
    const newVals = raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    const merged = [...new Set([...(skillValues[key] ?? []), ...newVals])];
    setSkillValues((prev) => ({ ...prev, [key]: merged }));
    setSkillInputs((prev) => ({ ...prev, [key]: '' }));
    void userService.setSelfSkillValues(key, merged);
  };

  const handleRemoveValue = (key: string, value: string) => {
    const next = (skillValues[key] ?? []).filter((v) => v !== value);
    setSkillValues((prev) => ({ ...prev, [key]: next }));
    void userService.setSelfSkillValues(key, next);
  };

  const [signature, setSignature] = useState(user?.signature ?? '');
  const [sigSaving, setSigSaving] = useState(false);

  useEffect(() => {
    setSignature(user?.signature ?? '');
  }, [user?.signature]);

  const handleSaveSignature = async () => {
    setSigSaving(true);
    try {
      await userService.updateSelf({ signature: signature.trim() || null });
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, signature: signature.trim() || null } : s.user,
      }));
    } catch {
      // silent — could show notification here
    } finally {
      setSigSaving(false);
    }
  };

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

    if (passwords.new.length < 8) {
      setNotification({ type: 'error', message: 'New password must be at least 8 characters' });
      return;
    }
    if (passwords.new !== passwords.confirm) {
      setNotification({ type: 'error', message: 'New passwords do not match' });
      return;
    }
    if (passwords.new === passwords.current) {
      setNotification({ type: 'error', message: 'New password must be different from current password' });
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(passwords.current, passwords.new);
      setNotification({ type: 'success', message: 'Password changed successfully' });
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

      {/* Signature */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-md font-semibold mb-1 flex items-center gap-2">
          <PenLine className="w-5 h-5 text-blue-500" />
          Email Signature
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Appended to replies you send. Leave blank to send without a signature.
        </p>
        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm placeholder:text-muted-foreground"
          placeholder={'Best regards,\nJohn Smith\nSupport Team'}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">{signature.length} characters</span>
          <Button onClick={handleSaveSignature} disabled={sigSaving} size="sm">
            {sigSaving ? 'Saving…' : 'Save Signature'}
          </Button>
        </div>
      </div>

      {/* Routing Skills */}
      {routingKeys.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-500" />
            Routing Skills
          </h3>
          <div className="space-y-3">
            {routingKeys.map(({ key, description }) => {
              const values = skillValues[key] ?? [];
              return (
                <div key={key} className="p-3 rounded-md border border-border bg-muted/20">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {key}
                    </span>
                    {description && (
                      <span className="text-xs text-muted-foreground">{description}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {values.map((val) => (
                      <span
                        key={val}
                        className="flex gap-1 items-center px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary"
                      >
                        {val}
                        {canEditSkills && (
                          <button
                            type="button"
                            onClick={() => handleRemoveValue(key, val)}
                            className="hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {values.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">None set</span>
                    )}
                  </div>
                  {canEditSkills && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={skillInputs[key] ?? ''}
                        onChange={(e) =>
                          setSkillInputs((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddValue(key);
                          }
                        }}
                        placeholder="e.g. de, en (comma-separated)"
                        className="flex-1 px-2 py-1 text-xs rounded border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddValue(key)}
                        className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!canEditSkills && (
            <p className="mt-2 text-xs text-muted-foreground">
              Contact your administrator to update your routing skills.
            </p>
          )}
          {canEditSkills && (
            <p className="mt-2 text-xs text-muted-foreground">
              Tickets matching your skill values will be routed to you automatically.
            </p>
          )}
        </div>
      )}

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

      {/* Two-Factor Authentication */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="flex gap-2 items-center mb-4 text-lg font-semibold">
          <ShieldCheck className="w-5 h-5 text-blue-500" />
          Two-Factor Authentication
        </h3>
        <TwoFactorSettings />
      </div>
    </div>
  );
};
