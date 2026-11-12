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
};

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
}: Props) => (
  <div>
    <p className="font-display text-xs font-medium text-muted-foreground uppercase tracking-[0.09em] mb-1">
      {title}
    </p>
    {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2 text-left font-medium">{keyHeader}</th>
            <th className="px-4 py-2 text-left font-medium">First response</th>
            {showResolution && (
              <th className="px-4 py-2 text-left font-medium">
                Resolution{resolutionOptional ? ' (optional)' : ''}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = KEY_LABELS[row.key] ?? row.key;
            return (
              <tr key={`${row.type}:${row.key}`} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {label}
                  {row.isCustom && <span className="ml-2 text-xs text-foreground">(custom)</span>}
                </td>
                <td className="px-4 py-2.5">
                  <DurationInput
                    aria-label={`${title} ${label} first response`}
                    value={row.firstResponseMinutes}
                    max={MAX_MINUTES}
                    onValidChange={(valid) => onValidity(`${row.type}:${row.key}:first`, valid)}
                    onChange={(minutes) => {
                      if (minutes !== null) onChange(row, { firstResponseMinutes: minutes });
                    }}
                  />
                </td>
                {showResolution && (
                  <td className="px-4 py-2.5">
                    <DurationInput
                      aria-label={`${title} ${label} resolution`}
                      value={row.resolutionMinutes}
                      max={MAX_MINUTES}
                      allowEmpty={resolutionOptional}
                      units={resolutionUnits}
                      onValidChange={(valid) =>
                        onValidity(`${row.type}:${row.key}:resolution`, valid)
                      }
                      onChange={(minutes) => onChange(row, { resolutionMinutes: minutes })}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
