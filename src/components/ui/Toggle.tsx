/**
 * Small on/off switch. Extracted from AutoReplyConfiguration so re-route "Create rule"
 * and the auto-reply settings share one accessible toggle (role=switch + aria-checked).
 */
export const Toggle = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) => (
  <label className="inline-flex gap-2 items-center text-sm cursor-pointer">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
    {label && <span className="text-xs text-muted-foreground">{label}</span>}
  </label>
);
