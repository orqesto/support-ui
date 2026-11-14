import { Button } from '@/components/ui/Button';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { DurationInput, type DurationUnit } from '@/components/ui/DurationInput';
import type { SlaTargetRow } from '../services/slaConfig.service';

const KEY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  email: 'Email',
  telegram: 'Telegram',
  slack: 'Slack',
  chat: 'Chat',
  whatsapp: 'WhatsApp',
  other: 'Other',
};

/** A year: the backend's upper bound for an SLA target, in minutes. */
const MAX_MINUTES = 525600;

type Props = {
  title: string;
  hint?: string;
  keyHeader: string;
  rows: SlaTargetRow[];
  /** Channel caps: an empty resolution means "no cap". */
  resolutionOptional?: boolean;
  /** Default true. */
  showResolution?: boolean;
  /** Units the resolution field offers (an older backend stores ticket resolution in hours). */
  resolutionUnits?: DurationUnit[];
  /** A field's validity changed (`<type>:<key>:<first|resolution>`). */
  onValidity: (field: string, valid: boolean) => void;
  onChange: (
    row: SlaTargetRow,
    patch: Partial<Pick<SlaTargetRow, 'firstResponseMinutes' | 'resolutionMinutes'>>
  ) => void;
  /**
   * Set ⇒ a row with an override offers "Reset to default", and each overridden field is marked.
   * Unset (an older backend) ⇒ neither.
   */
  onReset?: (row: SlaTargetRow) => void;
  /** The row whose reset is in flight (`<type>:<key>`). */
  resetting?: string | null;
  /** A save or a reset is in flight: no other reset starts. */
  busy?: boolean;
  /** Every input waits (a Save and its read-back are in flight). */
  inputsDisabled?: boolean;
  /** Per row (`<type>:<key>`): bumped on a reset, so its inputs start over from the new value. */
  resetCounts?: Record<string, number>;
};

/** A field that carries its own override, next to the input (shown only with `onReset`). */
const CustomMark = () => <span className="text-xs text-muted-foreground">custom</span>;

/** One group of SLA targets: a row per priority or channel, first response and resolution. */
export const SlaTargetTable = ({
  title,
  hint,
  keyHeader,
  rows,
  resolutionOptional = false,
  showResolution = true,
  resolutionUnits,
  onValidity,
  onChange,
  onReset,
  resetting = null,
  busy = false,
  inputsDisabled = false,
  resetCounts = {},
}: Props) => {
  const labelOf = (row: SlaTargetRow) => KEY_LABELS[row.key] ?? row.key;
  const idOf = (row: SlaTargetRow) => `${row.type}:${row.key}`;
  const inputKey = (row: SlaTargetRow, field: string) =>
    `${idOf(row)}:${field}:${resetCounts[idOf(row)] ?? 0}`;
  const columns: ColumnDef<SlaTargetRow>[] = [
    {
      id: 'key',
      header: keyHeader,
      cellClassName: 'font-medium align-middle',
      cell: (row) => (
        <>
          {labelOf(row)}
          {row.isCustom && <span className="ml-2 text-xs text-foreground">(custom)</span>}
        </>
      ),
    },
    {
      id: 'first',
      header: 'First response',
      cellClassName: 'align-middle',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <DurationInput
            key={inputKey(row, 'first')}
            aria-label={`${title} ${labelOf(row)} first response`}
            // Its reset is in flight: the row is about to take the defaults.
            disabled={inputsDisabled || resetting === idOf(row)}
            value={row.firstResponseMinutes}
            max={MAX_MINUTES}
            onValidChange={(valid) => onValidity(`${row.type}:${row.key}:first`, valid)}
            onChange={(minutes) => {
              if (minutes !== null) onChange(row, { firstResponseMinutes: minutes });
            }}
          />
          {onReset && row.firstResponseIsCustom && <CustomMark />}
        </div>
      ),
    },
  ];
  if (showResolution) {
    columns.push({
      id: 'resolution',
      header: `Resolution${resolutionOptional ? ' (optional)' : ''}`,
      cellClassName: 'align-middle',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <DurationInput
            key={inputKey(row, 'resolution')}
            aria-label={`${title} ${labelOf(row)} resolution`}
            // Its reset is in flight: the row is about to take the defaults.
            disabled={inputsDisabled || resetting === idOf(row)}
            value={row.resolutionMinutes}
            max={MAX_MINUTES}
            allowEmpty={resolutionOptional}
            units={resolutionUnits}
            onValidChange={(valid) => onValidity(`${row.type}:${row.key}:resolution`, valid)}
            onChange={(minutes) => onChange(row, { resolutionMinutes: minutes })}
          />
          {onReset && row.resolutionIsCustom && <CustomMark />}
        </div>
      ),
    });
  }

  return (
    <div>
      <p className="font-display text-xs font-medium text-muted-foreground uppercase tracking-[0.09em] mb-1">
        {title}
      </p>
      {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(row) => `${row.type}:${row.key}`}
          columns={columns}
          // Every row on one page: a target table is a handful of priorities or channels.
          pagination={{ mode: 'client', pageSize: Math.max(rows.length, 1) }}
          empty={{ message: 'No targets.' }}
          actionsLabel="Actions"
          actions={
            onReset
              ? (row) =>
                  row.isCustom ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Reset ${title} ${labelOf(row)} to default`}
                      isLoading={resetting === idOf(row)}
                      disabled={busy}
                      onClick={() => onReset(row)}
                    >
                      Reset to default
                    </Button>
                  ) : null
              : undefined
          }
        />
      </div>
    </div>
  );
};
