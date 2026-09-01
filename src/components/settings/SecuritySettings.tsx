import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService } from '@/services/organization.service';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/errorMessages';

export const SecuritySettings = () => {
  const { isAdmin, isOrgAdmin } = usePermissions();
  const canManageSecurity = isAdmin || isOrgAdmin;
  const [require2FA, setRequire2FA] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Admin-only control; skip the fetch entirely for non-admins (the section is
    // also hidden by the parent). BE requireOrgAdmin is the real authority.
    if (!canManageSecurity) return;
    organizationService
      .getSecuritySettings()
      .then((data) => {
        setRequire2FA(data.require2FA);
      })
      .catch((err: unknown) => logger.error('Failed to load security settings', err))
      .finally(() => setLoading(false));
  }, [canManageSecurity]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await organizationService.updateSecuritySettings({ require2FA });
      setSuccess('Security settings saved.');
    } catch (err: unknown) {
      logger.error('Failed to save security settings', err);
      setError(getApiErrorMessage(err) ?? 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Defense-in-depth: never render workspace security policy for a non-admin, even
  // if this component is reached directly (deep-link / future reuse).
  if (!canManageSecurity) return null;

  if (loading) {
    return <div className="py-4 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex gap-2 items-center text-base font-semibold">
          <Shield className="w-4 h-4" />
          Security Policies
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enforce password and authentication requirements for all users in this workspace.
        </p>
      </div>

      <div className="p-4 space-y-5 rounded-lg border">
        <div className="flex gap-3 items-start">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium">Require two-factor authentication</label>
            <p className="text-xs text-muted-foreground">
              When enabled, users who haven't set up 2FA will be prompted to do so during their next
              login before gaining access.
            </p>
          </div>
          <Toggle
            checked={require2FA}
            onChange={(next) => setRequire2FA(next)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  );
};
