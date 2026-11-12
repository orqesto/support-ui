import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  getSlaConfig,
  saveSlaConfig,
  type SlaConfig,
  type SlaTargetRow,
} from '../services/slaConfig.service';
import { SlaTargetTable } from './SlaTargetTable';

/**
 * SLA targets (owner 2026-11-11/12): tickets by priority; threads by priority (first response +
 * resolution); threads by channel as caps — the shorter of priority and channel applies to each
 * clock. Every value is a number + minutes / hours / days, stored in minutes.
 */
export const SLAConfigSettings = () => {
  const [config, setConfig] = useState<SlaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fields holding a value they refuse: saving then would send the previous value as if saved.
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const onValidity = (field: string, valid: boolean) =>
    setInvalidFields((prev) => {
      if (valid === !prev.has(field)) return prev;
      const next = new Set(prev);
      if (valid) next.delete(field);
      else next.add(field);
      return next;
    });

  useEffect(() => {
    getSlaConfig()
      .then(setConfig)
      .catch((err) => setError(getApiErrorMessage(err) ?? 'Failed to load SLA configuration'));
  }, []);

  const update = (
    target: SlaTargetRow,
    patch: Partial<Pick<SlaTargetRow, 'firstResponseMinutes' | 'resolutionMinutes'>>
  ) =>
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((row) =>
              row.type === target.type && row.key === target.key ? { ...row, ...patch } : row
            ),
          }
        : prev
    );

  const save = () => {
    if (!config) return;
    if (invalidFields.size > 0) {
      setError('Fix the highlighted values before saving: each must be a whole number above zero.');
      return;
    }
    setError(null);
    setSaving(true);
    setSaved(false);
    saveSlaConfig(config.rows, config)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch((err) => setError(getApiErrorMessage(err) ?? 'Failed to save SLA configuration'))
      .finally(() => setSaving(false));
  };

  const group = (name: SlaTargetRow['group']) =>
    config?.rows.filter((row) => row.group === name) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display flex gap-2 items-center text-sm font-semibold mb-1">
          <Timer className="w-4 h-4" />
          SLA Thresholds
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Response and resolution targets per priority and channel. Changes apply to new tickets and
          threads, and to a thread or ticket whose priority changes.
        </p>
      </div>

      {error && (
        <Alert variant="danger">
          <p className="text-sm">{error}</p>
        </Alert>
      )}

      {config && (
        <>
          <SlaTargetTable
            onValidity={onValidity}
            // An older backend stores ticket resolution in whole hours.
            resolutionUnits={config.supportsThreadPriority ? undefined : ['hour', 'day']}
            title="Ticket SLA"
            keyHeader="Priority"
            rows={group('ticket')}
            onChange={update}
          />
          {config.supportsThreadPriority && (
            <SlaTargetTable
              onValidity={onValidity}
              title="Thread SLA by priority"
              keyHeader="Priority"
              rows={group('threadPriority')}
              onChange={update}
            />
          )}
          <SlaTargetTable
            onValidity={onValidity}
            title="Thread SLA by channel"
            hint="Optional caps: for each clock, the shorter of the priority's target and the channel's applies. Leave resolution empty for no cap."
            keyHeader="Channel"
            rows={group('threadChannel')}
            resolutionOptional
            // An older backend has no channel resolution cap.
            showResolution={config.supportsThreadPriority}
            onChange={update}
          />

          {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
          {saved && <p className="text-xs text-success">Saved</p>}

          <Button onClick={save} disabled={saving} className="text-sm">
            Save changes
          </Button>
        </>
      )}
    </div>
  );
};
