import { useState, useEffect } from 'react';
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

const Toggle = ({
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
        checked ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

export const NotificationPreferencesSettings = () => {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient
      .get('/api/users/me/notification-preferences')
      .then((result) => setPrefs({ ...defaults, ...((result.data as { data: Partial<Prefs> }).data) }))
      .catch(() => {});
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setSaved(false);
    apiClient
      .put('/api/users/me/notification-preferences', patch)
      .then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); })
      .catch(() => setPrefs(prefs))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Minimum severity</h3>
        <p className="text-xs text-muted-foreground mb-3">Only show alerts that meet this threshold.</p>
        <div className="flex gap-2">
          {(['warning', 'critical'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => update({ minSeverity: sev })}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors capitalize ${
                prefs.minSeverity === sev
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-card hover:bg-accent'
              }`}
            >
              {sev === 'warning' ? 'All (warning+)' : 'Critical only'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-1">Alert types</h3>
        <p className="text-xs text-muted-foreground mb-3">Choose which breach types appear in the alert center.</p>
        <div className="rounded-lg border border-border bg-card px-4">
          <Toggle
            label="Message SLA"
            checked={prefs.notifyMessages}
            onChange={(val) => update({ notifyMessages: val })}
          />
          <Toggle
            label="Ticket first response"
            checked={prefs.notifyTicketFirstResponse}
            onChange={(val) => update({ notifyTicketFirstResponse: val })}
          />
          <Toggle
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
