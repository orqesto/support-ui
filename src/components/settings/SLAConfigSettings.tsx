import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type SLAEntry = {
  type: 'ticket' | 'message';
  key: string;
  firstResponseMinutes: number;
  resolutionHours: number | null;
  isCustom: boolean;
};

type EditState = {
  firstResponseMinutes: string;
  resolutionHours: string;
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  slack: 'Slack',
  email: 'Email',
  other: 'Other',
};

const inputCls =
  'w-24 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

export const SLAConfigSettings = () => {
  const [entries, setEntries] = useState<SLAEntry[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/organizations/sla-config')
      .then((r) => {
        const data = (r.data as { data: SLAEntry[] }).data;
        setEntries(data);
        const init: Record<string, EditState> = {};
        data.forEach((e) => {
          init[`${e.type}:${e.key}`] = {
            firstResponseMinutes: String(e.firstResponseMinutes),
            resolutionHours: e.resolutionHours !== null && e.resolutionHours !== undefined ? String(e.resolutionHours) : '',
          };
        });
        setEdits(init);
      })
      .catch(() => setError('Failed to load SLA configuration'));
  }, []);

  const setField = (type: string, key: string, field: keyof EditState, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [`${type}:${key}`]: { ...prev[`${type}:${key}`], [field]: value },
    }));
  };

  const save = () => {
    const configs = entries.map((e) => {
      const edit = edits[`${e.type}:${e.key}`];
      return {
        type: e.type,
        key: e.key,
        firstResponseMinutes: parseInt(edit?.firstResponseMinutes ?? String(e.firstResponseMinutes), 10),
        resolutionHours:
          e.type === 'ticket' && edit?.resolutionHours
            ? parseInt(edit.resolutionHours, 10)
            : null,
      };
    });

    // Validate
    for (const c of configs) {
      if (isNaN(c.firstResponseMinutes) || c.firstResponseMinutes <= 0) {
        setError('All first response values must be positive numbers');
        return;
      }
      if (c.type === 'ticket' && (c.resolutionHours === null || isNaN(c.resolutionHours) || c.resolutionHours <= 0)) {
        setError('All ticket resolution values must be positive numbers');
        return;
      }
    }

    setError(null);
    setSaving(true);
    setSaved(false);

    apiClient
      .put('/api/organizations/sla-config', { configs })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => setError('Failed to save SLA configuration'))
      .finally(() => setSaving(false));
  };

  const ticketEntries = entries.filter((e) => e.type === 'ticket');
  const messageEntries = entries.filter((e) => e.type === 'message');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex gap-2 items-center text-sm font-semibold mb-1">
          <Timer className="w-4 h-4" />
          SLA Thresholds
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Configure response and resolution time targets per priority and channel. Changes take effect for new tickets and messages.
        </p>
      </div>

      {/* Ticket SLA */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ticket SLA</p>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left font-medium">Priority</th>
                <th className="px-4 py-2 text-left font-medium">First Response (min)</th>
                <th className="px-4 py-2 text-left font-medium">Resolution (hrs)</th>
              </tr>
            </thead>
            <tbody>
              {ticketEntries.map((e) => {
                const id = `${e.type}:${e.key}`;
                const edit = edits[id];
                return (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {PRIORITY_LABELS[e.key] ?? e.key}
                      {e.isCustom && (
                        <span className="ml-2 text-xs text-primary">(custom)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={edit?.firstResponseMinutes ?? ''}
                        onChange={(ev) => setField(e.type, e.key, 'firstResponseMinutes', ev.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={edit?.resolutionHours ?? ''}
                        onChange={(ev) => setField(e.type, e.key, 'resolutionHours', ev.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message SLA */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Message SLA</p>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2 text-left font-medium">Channel</th>
                <th className="px-4 py-2 text-left font-medium">Response Target (min)</th>
              </tr>
            </thead>
            <tbody>
              {messageEntries.map((e) => {
                const id = `${e.type}:${e.key}`;
                const edit = edits[id];
                return (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {CHANNEL_LABELS[e.key] ?? e.key}
                      {e.isCustom && (
                        <span className="ml-2 text-xs text-primary">(custom)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={edit?.firstResponseMinutes ?? ''}
                        onChange={(ev) => setField(e.type, e.key, 'firstResponseMinutes', ev.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
      {saved && <p className="text-xs text-green-600">Saved</p>}

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        Save changes
      </button>
    </div>
  );
};
