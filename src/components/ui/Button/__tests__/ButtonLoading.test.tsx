import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';

/**
 * Staging, Chrome 156 (2026-11-03): a focused button that turns natively `disabled` loses focus
 * to <body>, and it does not come back. So a Button out of use — `disabled`, or loading — is
 * never natively disabled (owner decision 2026-11-03): it stays focusable, is aria-disabled,
 * looks as before (dimmed, no pointer events) and cancels its own click.
 *
 * `hasNativeDisabled` reads the attribute on purpose: these tests pin the mechanism itself.
 */
afterEach(cleanup);

const classesOf = (element: HTMLElement) => element.className.split(' ');
const hasNativeDisabled = (element: HTMLElement) => element.matches(':disabled');

describe('Button — out of use keeps keyboard focus', () => {
  it.each([
    ['loading', { isLoading: true }],
    ['disabled', { disabled: true }],
    ['disabled and loading', { disabled: true, isLoading: true }],
  ])(
    '🔴 %s: never natively disabled, aria-disabled, looks inactive, keeps focus',
    (_name, state) => {
      const { rerender } = render(<Button onClick={() => undefined}>Save</Button>);
      const button = screen.getByRole('button', { name: 'Save' });
      button.focus();
      rerender(
        <Button {...state} onClick={() => undefined}>
          Save
        </Button>
      );
      expect(hasNativeDisabled(button)).toBe(false);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button).toBeInactive();
      // Dimmed, no pointer events: `data-[inactive]:` in the base classes, driven by the attribute.
      expect(button.hasAttribute('data-inactive')).toBe(true);
      expect(classesOf(button)).toEqual(
        expect.arrayContaining([
          'data-[inactive]:opacity-50',
          'data-[inactive]:pointer-events-none',
        ])
      );
      expect(document.activeElement).toBe(button);
    }
  );

  it.each([
    ['loading', { isLoading: true }],
    ['disabled', { disabled: true }],
  ])('🔴 %s: a press does not reach onClick, nor an ancestor', (_name, state) => {
    const onClick = vi.fn();
    const onRowClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <Button {...state} onClick={onClick}>
          Save
        </Button>
      </div>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it.each([
    ['loading', { isLoading: true }],
    ['disabled', { disabled: true }],
  ])('🔴 %s submit button: a press does not submit its form', (_name, state) => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" {...state}>
          Send
        </Button>
      </form>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("🔴 a caller's aria-disabled={false} does not undo loading or disabled", () => {
    render(
      <>
        <Button isLoading aria-disabled={false}>
          Load
        </Button>
        <Button disabled aria-disabled={false}>
          Off
        </Button>
      </>
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('[control] in use: onClick runs, a submit button submits, nothing looks inactive', () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" onClick={onClick}>
          Send
        </Button>
      </form>
    );
    const button = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button).not.toBeInactive();
    expect(button.hasAttribute('data-inactive')).toBe(false);
  });

  it('[control] `disabled={false}` with loading stays clickable, as it always was', () => {
    const onClick = vi.fn();
    render(
      <Button disabled={false} isLoading onClick={onClick}>
        Save
      </Button>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').hasAttribute('aria-disabled')).toBe(false);
  });

  it("[control] a caller's own aria-disabled passes through when in use", () => {
    render(<Button aria-disabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('🔴 IconButton, disabled: the same — focusable, aria-disabled, dimmed, press cancelled', () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Remove" icon="x" disabled onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(hasNativeDisabled(button)).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('data-inactive')).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('🔴 IconButton, disabled: a press reaches neither onClick nor an ancestor, and does not submit', () => {
    const onClick = vi.fn();
    const onRowClick = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <form onSubmit={onSubmit}>
          <IconButton type="submit" aria-label="Send" icon="x" disabled onClick={onClick} />
        </form>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("🔴 IconButton: a caller's aria-disabled={false} does not undo disabled", () => {
    render(<IconButton aria-label="Remove" icon="x" disabled aria-disabled={false} />);
    expect(screen.getByRole('button', { name: 'Remove' }).getAttribute('aria-disabled')).toBe(
      'true'
    );
  });

  it('[matcher] toBeInactive() throws on a missing element, negated or not', () => {
    expect(() => expect(null).not.toBeInactive()).toThrow(/needs an element/);
    expect(() => expect(undefined).toBeInactive()).toThrow(/needs an element/);
  });
});
