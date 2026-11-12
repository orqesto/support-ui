import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  changedSlaRows,
  getSlaConfig,
  resetSlaRow,
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
  // The values as loaded or last saved: Save sends only rows that differ from these.
  const [baseline, setBaseline] = useState<SlaTargetRow[]>([]);
  const [noChanges, setNoChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // The row whose "Reset to default" is in flight (`<type>:<key>`).
  const [resetting, setResetting] = useState<string | null>(null);
  // Bumped per row on a reset: its inputs start over from the default (dropping typed text).
  const [resetCounts, setResetCounts] = useState<Record<string, number>>({});
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
      .then((loaded) => {
        setConfig(loaded);
        setBaseline(loaded.rows);
      })
      .catch((err) => setError(getApiErrorMessage(err) ?? 'Failed to load SLA configuration'));
  }, []);

  const update = (
    target: SlaTargetRow,
    patch: Partial<Pick<SlaTargetRow, 'firstResponseMinutes' | 'resolutionMinutes'>>
  ) => {
    setNoChanges(false);
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
  };

  const save = () => {
    if (!config) return;
    if (invalidFields.size > 0) {
      setNoChanges(false);
      setError('Fix the highlighted values before saving: each must be a whole number above zero.');
      return;
    }
    setError(null);
    setSaved(false);
    const changed = changedSlaRows(config.rows, baseline);
    if (changed.length === 0) {
      setNoChanges(true);
      return;
    }
    setNoChanges(false);
    setSaving(true);
    const sentRows = config.rows;
    const sentOf = (row: SlaTargetRow) =>
      changed.find((entry) => entry.row.type === row.type && entry.row.key === row.key);
    saveSlaConfig(changed, config)
      .then(() => {
        // What was sent is now stored as custom, and is the new baseline.
        setBaseline(sentRows);
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((row) => {
                  const sent = sentOf(row);
                  if (!sent) return row;
                  // As the backend reads it: a value sent is an override, a null resolution is
                  // the default ("no cap" on a channel). An older backend was sent both fields.
                  const both = !prev.supportsFieldSave;
                  const firstResponseIsCustom =
                    row.firstResponseIsCustom || sent.firstResponse || both;
                  const resolutionIsCustom =
                    sent.resolution || both
                      ? row.resolutionMinutes !== null
                      : row.resolutionIsCustom;
                  return {
                    ...row,
                    isCustom: firstResponseIsCustom || resolutionIsCustom,
                    firstResponseIsCustom,
                    resolutionIsCustom,
                  };
                }),
              }
            : prev
        );
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch((err) => setError(getApiErrorMessage(err) ?? 'Failed to save SLA configuration'))
      .finally(() => setSaving(false));
  };

  /**
   * Removes the row's override: it shows the defaults the backend answers with, and any unsaved
   * edit on that row is dropped. Other rows keep what is typed into them.
   */
  const reset = (target: SlaTargetRow) => {
    const id = `${target.type}:${target.key}`;
    setError(null);
    setSaved(false);
    setNoChanges(false);
    setResetting(id);
    const rowOf = (loaded: SlaConfig) =>
      loaded.rows.find((row) => row.type === target.type && row.key === target.key);
    resetSlaRow(target)
      // A response without the row cannot say what is stored now: read it back rather than leave
      // the old override on screen.
      .then(async (fresh) => rowOf(fresh) ?? rowOf(await getSlaConfig()))
      .then((next) => {
        if (!next) {
          setError('The target was reset, but its new values could not be read. Reload the page.');
          return;
        }
        const swap = (rows: SlaTargetRow[]) =>
          rows.map((row) => (row.type === target.type && row.key === target.key ? next : row));
        setConfig((prev) => (prev ? { ...prev, rows: swap(prev.rows) } : prev));
        setBaseline(swap);
        setInvalidFields((prev) => {
          if (![...prev].some((field) => field.startsWith(`${id}:`))) return prev;
          return new Set([...prev].filter((field) => !field.startsWith(`${id}:`)));
        });
        setResetCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
      })
      .catch((err) => setError(getApiErrorMessage(err) ?? 'Failed to reset the SLA target'))
      .finally(() => setResetting(null));
  };
  // An older backend has no per-row reset (see `supportsFieldSave`).
  const resetProps = config?.supportsFieldSave
    ? { onReset: reset, resetting, resetCounts, busy: saving || resetting !== null }
    : {};

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
            {...resetProps}
          />
          {config.supportsThreadPriority && (
            <SlaTargetTable
              onValidity={onValidity}
              title="Thread SLA by priority"
              keyHeader="Priority"
              rows={group('threadPriority')}
              onChange={update}
              {...resetProps}
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
            {...resetProps}
          />

          {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
          {saved && <p className="text-xs text-success">Saved</p>}
          {noChanges && <p className="text-xs text-muted-foreground">No changes to save</p>}

          <Button onClick={save} disabled={saving || resetting !== null} className="text-sm">
            Save changes
          </Button>
        </>
      )}
    </div>
  );
};
