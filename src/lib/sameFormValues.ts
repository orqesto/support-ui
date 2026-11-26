/**
 * True when two form states would save the same thing: compared field by field after the
 * normalisation the saves apply — strings trimmed, and null / undefined read as "" (an empty
 * optional field is sent as null or omitted, never as a different value).
 *
 * Used to tell an editor the person has not touched from one they typed in.
 */
const normalise = (value: unknown): unknown => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return value;
};

export const sameFormValues = (left: object, right: object): boolean => {
  const leftFields = left as Record<string, unknown>;
  const rightFields = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftFields), ...Object.keys(rightFields)]);
  for (const key of keys) {
    const one = normalise(leftFields[key]);
    const two = normalise(rightFields[key]);
    if (one === two) continue;
    if (typeof one !== 'object' || typeof two !== 'object') return false;
    if (JSON.stringify(one) !== JSON.stringify(two)) return false;
  }
  return true;
};
