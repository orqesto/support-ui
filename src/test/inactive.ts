/**
 * Whether a control is out of use: natively disabled (itself, or inside a disabled fieldset),
 * or `aria-disabled="true"`.
 *
 * A Button out of use is aria-disabled, never natively `disabled` — a browser moves focus off a
 * focused button that turns disabled (Chrome, staging, 2026-11-03), so it stays focusable and
 * cancels its own presses instead. jest-dom's `toBeDisabled()` only sees native `disabled`, and
 * `.not.toBeDisabled()` passes on a Button that is out of use — so tests use `toBeInactive()`
 * (registered in setup.ts) and lint forbids `toBeDisabled` / `toBeEnabled` / `.disabled` reads.
 *
 * ⚠️ An attribute is not the behaviour: a caller's own aria-disabled passes too. Where a press
 * matters, pair it with a second press and an unchanged call count.
 */
export const isInactive = (element: Element): boolean =>
  element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';

/** `expect(element).toBeInactive()` — see `isInactive`. */
export function toBeInactive(received: unknown) {
  // As jest-dom's toBeDisabled: no element is an error, never a pass — or
  // `expect(queryBy…()).not.toBeInactive()` would stay green after the control was removed.
  if (!(received instanceof Element)) {
    throw new TypeError(`toBeInactive() needs an element, got: ${String(received)}`);
  }
  const pass = isInactive(received);
  const describe = received.outerHTML.slice(0, 160);
  return {
    pass,
    message: () =>
      pass
        ? `expected element not to be inactive (disabled or aria-disabled), got: ${describe}`
        : `expected element to be inactive (disabled or aria-disabled), got: ${describe}`,
  };
}

declare module 'vitest' {
  interface Assertion<T> {
    toBeInactive(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeInactive(): unknown;
  }
}
