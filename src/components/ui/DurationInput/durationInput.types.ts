export type DurationInputProps = {
  /** Minutes; null = empty (only meaningful with `allowEmpty`). */
  value: number | null;
  /** Minutes, or null when emptied with `allowEmpty`. Not called for an invalid amount. */
  onChange: (minutes: number | null) => void;
  /** Empty is a legitimate value (e.g. "no cap"). Default false. */
  allowEmpty?: boolean;
  /** Upper bound in minutes; an amount above it emits nothing. */
  max?: number;
  disabled?: boolean;
  id?: string;
  /** Same scale as Input / Select. Default 'sm'. */
  size?: 'sm' | 'md';
  /** Names the amount; the unit picker is "<aria-label> unit". */
  'aria-label': string;
};
