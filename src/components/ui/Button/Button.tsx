import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { getButtonClasses } from './button.styles';
import { LoadingSpinner } from './LoadingSpinner';
import type { ButtonProps } from './button.types';

/**
 * A Button out of use is NEVER natively `disabled`: a browser moves focus off a focused button
 * that turns disabled (Chrome 156, measured on staging 2026-11-03: to <body>, and it does not come
 * back), so a button pressed from the keyboard lost focus while it loaded, and again when a save
 * left it disabled (nothing changed since). Owner decision 2026-11-03: every disabled or loading
 * Button stays focusable — a Tab stop — marked aria-disabled, looking as before (dimmed, no
 * pointer events), and cancelling its own click: mouse, Enter, Space, and a form's implicit submit
 * alike, and no ancestor's bubbling handler sees the click. An explicit `disabled={false}` keeps a
 * loading Button clickable, as it always did.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, isLoading, disabled, children, type = 'button', onClick, ...props },
    ref
  ) => {
    const inactive = disabled === true || (isLoading === true && disabled !== false);
    return (
      // Default type="button" so a Button inside a <form> never submits by accident;
      // submit buttons opt in explicitly with type="submit".
      <button
        ref={ref}
        type={type}
        // `data-inactive` drives the dimmed look (`data-[inactive]:` in the base classes): an
        // attribute variant, so it outranks a caller's plain `opacity-*` as `disabled:` did, and
        // callers style it with `data-[inactive]:…` (a caller's own aria-disabled stays
        // unstyled).
        className={cn(getButtonClasses(variant, size), className)}
        data-inactive={inactive ? '' : undefined}
        {...props}
        // After the spread: a caller's aria-disabled / onClick never undo `inactive`.
        aria-disabled={inactive ? true : props['aria-disabled']}
        onClick={
          inactive
            ? (event) => {
                // As a disabled button: no submit, and no click bubbling to the ancestors either.
                event.preventDefault();
                event.stopPropagation();
              }
            : onClick
        }
      >
        {isLoading ? <LoadingSpinner /> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
