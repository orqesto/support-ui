import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/**
 * On-hold with a reason and a recheck date (contingency page, owner 2026-10-19): "there should be a
 * reason for it, and a notification when it should be rechecked" — presets 1 day / 3 days / 1 week,
 * or a date. When the date comes the thread goes back to the active list and its owner is told.
 * Used by the thread header's On-hold and by the ticket page's "Send & put on hold".
 */
export type HoldPreset = '1d' | '3d' | '1w' | 'custom';

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<Exclude<HoldPreset, 'custom'>, number> = { '1d': 1, '3d': 3, '1w': 7 };
/** The server refuses a recheck further out than this. */
export const MAX_HOLD_DAYS = 366;
export const MAX_HOLD_REASON = 500;

export const HOLD_PRESET_OPTIONS: Array<{ value: HoldPreset; label: string }> = [
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '1w', label: '1 week' },
  { value: 'custom', label: 'Pick a date' },
];

/** `YYYY-MM-DD` of a local date, as `<input type="date">` reads and writes it. */
const dateInput = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * The recheck moment: a preset counts from now; a picked date means 9:00 that morning (local), the
 * start of a working day. Null when the picked date is missing, not in the future, or too far out.
 */
export const holdUntilFor = (
  preset: HoldPreset,
  customDate: string,
  now: Date = new Date()
): Date | null => {
  if (preset !== 'custom') return new Date(now.getTime() + PRESET_DAYS[preset] * DAY_MS);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate);
  if (!match) return null;
  const until = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0);
  if (Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) return null;
  if (until.getTime() > now.getTime() + MAX_HOLD_DAYS * DAY_MS) return null;
  return until;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Put this thread on hold" / "Send & put 3 threads on hold". */
  title: string;
  description?: string;
  confirmText: string;
  busy?: boolean;
  onConfirm: (hold: { reason: string; until: Date }) => void;
};

export const HoldDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  busy = false,
  onConfirm,
}: Props) => {
  const [reason, setReason] = useState('');
  const [preset, setPreset] = useState<HoldPreset>('3d');
  const [customDate, setCustomDate] = useState('');
  // Each opening starts clean: a reason typed for another thread is not this one's.
  useEffect(() => {
    if (!open) return;
    setReason('');
    setPreset('3d');
    setCustomDate('');
  }, [open]);

  const until = holdUntilFor(preset, customDate);
  const trimmed = reason.trim();
  const tomorrow = dateInput(new Date(Date.now() + DAY_MS));
  const latest = dateInput(new Date(Date.now() + (MAX_HOLD_DAYS - 1) * DAY_MS));
  const dateError =
    preset === 'custom' && customDate !== '' && !until
      ? 'Pick a date from tomorrow up to a year ahead.'
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>
        <div className="space-y-3">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <Input
            label="Reason"
            value={reason}
            maxLength={MAX_HOLD_REASON}
            placeholder="e.g. Waiting for the carrier’s tracking update"
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
          <Select
            label="Recheck in"
            value={preset}
            options={HOLD_PRESET_OPTIONS}
            onChange={(value) => setPreset(value as HoldPreset)}
            aria-label="Recheck in"
          />
          {preset === 'custom' && (
            <Input
              type="date"
              label="Recheck on"
              value={customDate}
              min={tomorrow}
              max={latest}
              error={dateError}
              onChange={(event) => setCustomDate(event.target.value)}
            />
          )}
          {until && (
            <p className="text-xs text-muted-foreground">
              Back in the active list on {until.toLocaleString()}, and you are reminded to recheck
              it. A customer reply brings it back sooner.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => until && onConfirm({ reason: trimmed, until })}
            disabled={busy || !trimmed || !until}
            isLoading={busy}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
