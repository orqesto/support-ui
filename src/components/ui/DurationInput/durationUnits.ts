/** SLA targets are stored in minutes (backend migration 0238) and edited as minutes, hours or days. */
export type DurationUnit = 'minute' | 'hour' | 'day';

export const UNIT_MINUTES: Record<DurationUnit, number> = { minute: 1, hour: 60, day: 1440 };

/** The largest unit that divides `minutes` evenly: 120 → 2 hours, 90 → 90 minutes, 1440 → 1 day. */
export const splitMinutes = (minutes: number): { amount: number; unit: DurationUnit } => {
  if (minutes > 0 && minutes % UNIT_MINUTES.day === 0)
    return { amount: minutes / UNIT_MINUTES.day, unit: 'day' };
  if (minutes > 0 && minutes % UNIT_MINUTES.hour === 0)
    return { amount: minutes / UNIT_MINUTES.hour, unit: 'hour' };
  return { amount: minutes, unit: 'minute' };
};

export const toMinutes = (amount: number, unit: DurationUnit): number =>
  amount * UNIT_MINUTES[unit];
