import { inactiveButtonProps } from './Button/inactiveProps';

/**
 * Small on/off switch. Extracted from AutoReplyConfiguration so the settings
 * pages share one accessible toggle (role=switch + aria-checked).
 *
 * `disabled` never disables it natively (as Button, 2026-11-03): it stays a focusable Tab stop,
 * aria-disabled and dimmed, and refuses its own press — a focused switch would otherwise lose
 * keyboard focus the moment it turned disabled.
 */
export const Toggle = ({
  checked,
  onChange,
  disabled,
  label,
  ariaLabel,
  ariaDescribedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  /** The switch's own name, when the visible `label` is only its state ("On" / "Off"). */
  ariaLabel?: string;
  /** Id of the text that explains the switch (e.g. why it is disabled). */
  ariaDescribedBy?: string;
}) => (
  <label
    className={`inline-flex gap-2 items-center text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      {...inactiveButtonProps(disabled === true, () => onChange(!checked))}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 data-[inactive]:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
    {label && <span className="text-xs text-muted-foreground">{label}</span>}
  </label>
);
