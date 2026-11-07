import { Toggle } from '@/components/ui/Toggle';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { WorkingHours } from '@/services/notificationSettingsService';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const browserZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const zoneList = (current: string): string[] => {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
};

/** What the server also rejects: no days, a malformed time, or start equal to end. Null = fine. */
export const validateWorkingHours = (hours: WorkingHours): string | null => {
  if (hours.days.length === 0) return 'Pick at least one day.';
  if (!TIME.test(hours.start) || !TIME.test(hours.end)) return 'Enter the start and end as hours and minutes.';
  if (hours.start === hours.end) return 'Start and end must be different.';
  return null;
};

export const defaultWorkingHours = (): WorkingHours => ({
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
  timeZone: browserZone(),
});

/** `null` = always (notify at any time). */
export const WorkingHoursEditor = ({
  value,
  onChange,
  disabled,
}: {
  value: WorkingHours | null;
  onChange: (next: WorkingHours | null) => void;
  disabled?: boolean;
}) => {
  const error = value ? validateWorkingHours(value) : null;
  const toggleDay = (day: number, on: boolean) => {
    if (!value) return;
    const days = on ? [...new Set([...value.days, day])].sort() : value.days.filter((each) => each !== day);
    onChange({ ...value, days });
  };
  return (
    <div className="space-y-3 py-3">
      <Toggle
        checked={value === null}
        ariaLabel="Always"
        label="Always"
        disabled={disabled}
        onChange={(always) => onChange(always ? null : defaultWorkingHours())}
      />
      {value && (
        <>
          <div className="flex flex-wrap gap-3">
            {DAY_NAMES.map((name, day) => (
              <Toggle
                key={name}
                ariaLabel={name}
                label={name}
                checked={value.days.includes(day)}
                disabled={disabled}
                onChange={(on) => toggleDay(day, on)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              type="time"
              label="From"
              value={value.start}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, start: event.target.value })}
            />
            <Input
              type="time"
              label="To"
              value={value.end}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, end: event.target.value })}
            />
            <div className="min-w-[14rem]">
              <Select
                label="Time zone"
                disabled={disabled}
                options={zoneList(value.timeZone).map((zone) => ({ value: zone, label: zone }))}
                value={value.timeZone}
                onChange={(zone) => onChange({ ...value, timeZone: zone })}
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
};
