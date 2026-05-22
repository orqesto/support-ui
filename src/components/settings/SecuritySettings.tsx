import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { organizationService } from '@/services/organization.service';
import { logger } from '@/lib/logger';

export const SecuritySettings = () => {
  const [require2FA, setRequire2FA] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    organizationService
      .getSecuritySettings()
      .then((data) => {
        setRequire2FA(data.require2FA);
      })
      .catch((err: unknown) => logger.error('Failed to load security settings', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await organizationService.updateSecuritySettings({ require2FA });
      setSuccess('Security settings saved.');
    } catch (err: unknown) {
      logger.error('Failed to save security settings', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
          Enforce password and authentication requirements for all users in this organization.
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
          <button
            type="button"
            role="switch"
            aria-checked={require2FA}
            onClick={() => setRequire2FA(!require2FA)}
            className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
              require2FA ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                require2FA ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
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
