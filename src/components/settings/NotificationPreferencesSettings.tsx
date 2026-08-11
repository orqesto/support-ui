import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { apiClient } from '@/lib/api-client';

type Prefs = {
  minSeverity: 'warning' | 'critical';
  notifyMessages: boolean;
  notifyTicketFirstResponse: boolean;
  notifyTicketResolution: boolean;
};

const defaults: Prefs = {
  minSeverity: 'warning',
  notifyMessages: true,
  notifyTicketFirstResponse: true,
  notifyTicketResolution: true,
};

const PreferenceRow = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex justify-between items-center py-3 border-b border-border last:border-0">
    <p className="text-sm font-medium">{label}</p>
    <Toggle checked={checked} onChange={onChange} />
  </div>
);

export const NotificationPreferencesSettings = () => {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  useEffect(() => {
    apiClient
      .get('/api/users/me/notification-preferences')
      .then((result) => setPrefs({ ...defaults, ...((result.data as { data: Partial<Prefs> }).data) }))
      .catch(() => {});
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const preUpdatePrefs = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setSaved(false);
    apiClient
      .put('/api/users/me/notification-preferences', patch)
      .then(() => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => setPrefs(preUpdatePrefs))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">SLA Alert Preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Which SLA breach alerts you see in your alert center — a personal preference.
          SLA time targets themselves are configured in Workspace › SLA Thresholds.
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-1">Minimum severity</h3>
        <p className="text-xs text-muted-foreground mb-3">Only show alerts that meet this threshold.</p>
        <div className="flex gap-2">
          {(['warning', 'critical'] as const).map((sev) => (
            <Button
              key={sev}
              size="sm"
              variant={prefs.minSeverity === sev ? 'primary' : 'outline'}
              onClick={() => update({ minSeverity: sev })}
            >
              {sev === 'warning' ? 'All (warning+)' : 'Critical only'}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-1">Alert types</h3>
        <p className="text-xs text-muted-foreground mb-3">Choose which breach types appear in the alert center.</p>
        <div className="rounded-lg border border-border bg-card px-4">
          <PreferenceRow
            label="Message SLA"
            checked={prefs.notifyMessages}
            onChange={(val) => update({ notifyMessages: val })}
          />
          <PreferenceRow
            label="Ticket first response"
            checked={prefs.notifyTicketFirstResponse}
            onChange={(val) => update({ notifyTicketFirstResponse: val })}
          />
          <PreferenceRow
            label="Ticket resolution"
            checked={prefs.notifyTicketResolution}
            onChange={(val) => update({ notifyTicketResolution: val })}
          />
        </div>
      </div>

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
      {saved && <p className="text-xs text-green-600">Saved</p>}
    </div>
  );
};
