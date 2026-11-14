/**
 * A finite number from an API value, or null. A numeric string counts (Postgres numerics and
 * averages can arrive as text); null, undefined, '', booleans, NaN and Infinity do not.
 */
export const finiteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
