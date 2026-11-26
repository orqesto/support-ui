/**
 * Form comparisons after the normalisation the saves apply — strings trimmed, and null /
 * undefined read as "" (an empty optional field is sent as null or omitted, never as a different
 * value).
 */
const normalise = (value: unknown): unknown => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return value;
};

/** True when two values of one field would save the same thing. */
const sameField = (left: unknown, right: unknown): boolean => {
  const one = normalise(left);
  const two = normalise(right);
  if (one === two) return true;
  if (typeof one !== 'object' || typeof two !== 'object') return false;
  return JSON.stringify(one) === JSON.stringify(two);
};

const keysOf = (...forms: object[]): string[] => [
  ...new Set(forms.flatMap((form) => Object.keys(form))),
];

/** True when two form states would save the same thing, field by field. */
export const sameFormValues = (left: object, right: object): boolean => {
  const leftFields = left as Record<string, unknown>;
  const rightFields = right as Record<string, unknown>;
  return keysOf(left, right).every((key) => sameField(leftFields[key], rightFields[key]));
};

/**
 * A form the person may have edited (`current`, opened from `base`) meets newer saved values
 * (`incoming`). Fields they did not change take the incoming value; fields they changed keep
 * their text. `kept` names the changed fields whose text differs from what was saved.
 */
export const mergeUntouchedFields = <F extends object>(
  current: F,
  base: F,
  incoming: F
): { merged: F; kept: string[] } => {
  const now = current as Record<string, unknown>;
  const was = base as Record<string, unknown>;
  const saved = incoming as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  const kept: string[] = [];
  for (const key of keysOf(current, base, incoming)) {
    if (sameField(now[key], was[key])) {
      merged[key] = saved[key];
    } else {
      merged[key] = now[key];
      if (!sameField(now[key], saved[key])) kept.push(key);
    }
  }
  return { merged: merged as F, kept };
};
