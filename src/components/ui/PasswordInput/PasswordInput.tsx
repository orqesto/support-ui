import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { getInputLabelClasses, getInputErrorClasses } from '@/components/ui/Input/input.styles';
import { cn } from '@/lib/utils';
import type { PasswordInputProps } from './passwordInput.types';

/**
 * A masked field with a reveal toggle.
 *
 * Every secret in Settings — API keys, SMTP passwords, bot tokens — was a raw
 * `<input type="password">` with no way to check what had been typed or pasted,
 * which is where a mistyped credential turns into a support ticket. Only the four
 * auth pages had a toggle, each with its own copy of it.
 *
 * Revealing is safe here: the backend masks secrets on read as
 * `first4••••••••last4` and the edit form round-trips that mask, so a pre-filled
 * field holds a mask, never a live credential. Seeing the first and last four is
 * how an admin confirms WHICH key is configured.
 *
 * ⛔ Not for a write-only secret that the client never holds (see the platform
 * console's `SecretField`, which shows a status and no value) — there is nothing
 * to reveal, and a toggle would imply otherwise.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      revealLabel = 'password',
      autoComplete = 'new-password',
      label,
      error,
      success,
      id,
      ...props
    },
    ref
  ) => {
    const [revealed, setRevealed] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const Icon = revealed ? Eye : EyeOff;

    // The label and any error are rendered HERE, so the relative box wraps the input
    // and nothing else. Delegating the label to `Input` meant the toggle was centred
    // on label+input+error together, which needed a magic offset per combination —
    // and offsets like that are exactly what jsdom cannot check.
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className={getInputLabelClasses(props.size)}>
            {label}
          </label>
        )}
        <div className="relative">
          <Input
            {...props}
            id={inputId}
            aria-describedby={error ? `${inputId}-error` : undefined}
            ref={ref}
            type={revealed ? 'text' : 'password'}
            // 🪤 Defaults to `new-password`, NOT `off`: Chrome largely ignores `off` on a
            // password field. Observed on the OpenAI card — the browser autofilled a saved
            // login password into the API-key box, and it would have been SAVED as the key
            // on submit. A real login field should pass `current-password` explicitly.
            autoComplete={autoComplete}
            // Room for the button so a long value never runs underneath it.
            className={cn('pr-10', className)}
          />
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            // `tabIndex={-1}` keeps Tab going straight from the field to Save, which is
            // the path someone typing a credential is actually on.
            tabIndex={-1}
            aria-label={`${revealed ? 'Hide' : 'Show'} ${revealLabel}`}
            aria-pressed={revealed}
            disabled={props.disabled}
            // `inset-y-0` centres against the INPUT at any size — sm/md/lg differ in height,
            // so a fixed offset would only ever be right for one of them.
            className="flex absolute inset-y-0 right-2 items-center p-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon className="w-4 h-4" />
          </button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className={getInputErrorClasses(props.size)}>
            {error}
          </p>
        )}
        {success && !error && (
          <p className={cn(getInputErrorClasses(props.size), 'text-green-600 dark:text-green-400')}>
            {success}
          </p>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
