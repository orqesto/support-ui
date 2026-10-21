import type { CSSProperties, ReactNode } from 'react';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/utils';
import { fmtMoney } from './budget.rules';

export const FieldLabel = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) =>
  htmlFor ? (
    <label
      htmlFor={htmlFor}
      className="font-display text-xs tracking-wider uppercase text-muted-foreground"
    >
      {children}
    </label>
  ) : (
    <span className="font-display text-xs tracking-wider uppercase text-muted-foreground">
      {children}
    </span>
  );

export const Swatch = ({ className, style }: { className: string; style?: CSSProperties }) => (
  <span
    aria-hidden="true"
    className={cn('inline-block mr-1.5 w-2.5 h-2.5 rounded-sm align-[-1px]', className)}
    style={style}
  />
);

/** The bulk limit header: on/off, its value, and the warning while it is off. */
export const BulkLimitField = ({
  on,
  pct,
  cap,
  canEdit = true,
  onToggle,
}: {
  on: boolean;
  pct: number;
  /** The limit in micros (budget × bulk %). */
  cap: number;
  /** Read-only when false: the switch is disabled. */
  canEdit?: boolean;
  onToggle: (on: boolean) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <FieldLabel>Bulk processing (knowledge base, imports, re-mines)</FieldLabel>
    <Toggle
      checked={on}
      onChange={onToggle}
      disabled={!canEdit}
      label="Limit it · drag the line on the bar"
    />
    {/* Same size either way, so switching never moves the layout; the warning for "off" is
        in the status line under the bar. */}
    <span className="font-mono text-lg min-h-[1.75rem]">
      {on ? `At most ${pct}% · ${fmtMoney(cap)} · counts bulk spend only` : 'No limit'}
    </span>
  </div>
);

/** The bulk part of the legend. */
export const BulkLegend = ({ on, used, cap }: { on: boolean; used: number; cap: number }) => (
  <span>
    <Swatch className="bg-pending" />
    Bulk processing <span className="font-mono">{fmtMoney(used)}</span>
    {on && (
      <>
        {' '}
        of <span className="font-mono">{fmtMoney(cap)}</span>
      </>
    )}
  </span>
);

/** The limit line in the legend, shown only while the bulk limit is on. */
export const BulkLimitLegend = ({ on }: { on: boolean }) =>
  on ? (
    <span>
      <Swatch className="!w-0.5 bg-foreground" />
      Bulk limit (compared with the purple part only)
    </span>
  ) : null;
