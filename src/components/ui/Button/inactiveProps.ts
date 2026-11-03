import type { AriaAttributes, MouseEvent, MouseEventHandler } from 'react';

/** As a natively disabled button: no submit, and no click bubbling to the ancestors either. */
const cancelPress = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * What a design-system <button> out of use carries INSTEAD of native `disabled`: a focused button
 * that turns disabled loses keyboard focus to <body> and does not get it back (Chrome 156, staging,
 * 2026-11-03). Owner decision 2026-11-03: every control out of use stays focusable — a Tab stop —
 * marked aria-disabled, dimmed through `data-inactive` (style it with `data-[inactive]:…`), and
 * cancelling its own press: mouse, Enter, Space and a form's implicit submit alike.
 *
 * Spread it AFTER any caller props, so a caller's aria-disabled / onClick never undo `inactive`.
 * `ariaDisabled` is the caller's own value, kept while the control is in use.
 */
export const inactiveButtonProps = <Element extends HTMLElement>(
  inactive: boolean,
  onClick: MouseEventHandler<Element> | undefined,
  ariaDisabled?: AriaAttributes['aria-disabled']
): {
  'data-inactive': '' | undefined;
  'aria-disabled': AriaAttributes['aria-disabled'];
  onClick: MouseEventHandler<Element> | undefined;
} => ({
  'data-inactive': inactive ? '' : undefined,
  'aria-disabled': inactive ? true : ariaDisabled,
  onClick: inactive ? cancelPress : onClick,
});
