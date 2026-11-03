import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Toggle } from '../Toggle';
import { SegmentedControl } from '../SegmentedControl';
import { PasswordInput } from '../PasswordInput';
import { ChoiceCard } from '../ChoiceCard';

/**
 * The design-system controls that drew their own <button> follow Button (#826): out of use they
 * are NEVER natively disabled — a focused button that turns disabled loses keyboard focus to
 * <body> (Chrome 156, staging, 2026-11-03). They stay focusable, aria-disabled, dimmed through
 * `data-inactive`, and cancel their own press (mouse, Enter, Space), ancestors included.
 *
 * `hasNativeDisabled` reads the attribute on purpose: these tests pin the mechanism itself.
 */
afterEach(cleanup);

const hasNativeDisabled = (element: HTMLElement) => element.matches(':disabled');

type Case = {
  name: string;
  /** The control, in use or not, with the press handler it reports to. */
  ui: (inactive: boolean, onPress: () => void) => ReactElement;
  find: () => HTMLElement;
};

const CASES: Case[] = [
  {
    name: 'Toggle',
    ui: (inactive, onPress) => (
      <Toggle checked={false} onChange={onPress} disabled={inactive} ariaLabel="Auto reply" />
    ),
    find: () => screen.getByRole('switch', { name: 'Auto reply' }),
  },
  {
    name: 'SegmentedControl segment',
    ui: (inactive, onPress) => (
      <SegmentedControl
        ariaLabel="View"
        value="list"
        onChange={(next) => next === 'board' && onPress()}
        segments={[
          { value: 'list', label: 'List' },
          { value: 'board', label: 'Board', disabled: inactive },
        ]}
      />
    ),
    find: () => screen.getByRole('button', { name: 'Board' }),
  },
  {
    name: 'PasswordInput reveal',
    // The reveal's own effect is the field's type; `onPress` cannot see it, so it is not called.
    ui: (inactive) => <PasswordInput revealLabel="API key" disabled={inactive} />,
    find: () => screen.getByRole('button', { name: 'Show API key' }),
  },
  {
    name: 'ChoiceCard',
    ui: (inactive, onPress) => (
      <ChoiceCard selected={false} onSelect={onPress} disabled={inactive}>
        Use our AI
      </ChoiceCard>
    ),
    find: () => screen.getByRole('button', { name: 'Use our AI' }),
  },
];

describe.each(CASES)('$name — out of use keeps keyboard focus', ({ ui, find }) => {
  it('🔴 never natively disabled, aria-disabled, marked inactive, keeps focus', () => {
    const { rerender } = render(ui(false, () => undefined));
    const control = find();
    control.focus();
    rerender(ui(true, () => undefined));
    expect(hasNativeDisabled(control)).toBe(false);
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(control.hasAttribute('data-inactive')).toBe(true);
    expect(control).toBeInactive();
    expect(document.activeElement).toBe(control);
  });

  it('🔴 a press does nothing and reaches no ancestor; back in use it works again', () => {
    const onPress = vi.fn();
    const onRow = vi.fn();
    const wrap = (inactive: boolean) => (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRow}>{ui(inactive, onPress)}</div>
    );
    const { rerender } = render(wrap(true));
    fireEvent.click(find());
    expect(onPress).not.toHaveBeenCalled();
    expect(onRow).not.toHaveBeenCalled();

    // CONTROL: the same press counts once the control is in use.
    rerender(wrap(false));
    fireEvent.click(find());
    expect(onRow).toHaveBeenCalledTimes(1);
  });
});

describe('PasswordInput reveal — out of use', () => {
  it('🔴 a press does not reveal the value; in use it does (control)', () => {
    const { rerender } = render(<PasswordInput revealLabel="API key" disabled />);
    const field = () => document.querySelector('input') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Show API key' }));
    expect(field().type).toBe('password');
    rerender(<PasswordInput revealLabel="API key" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show API key' }));
    expect(field().type).toBe('text');
  });
});

describe('ChoiceCard', () => {
  it('reports its choice: aria-pressed follows `selected`, a press calls onSelect once', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ChoiceCard selected={false} onSelect={onSelect}>
        Bring your own keys
      </ChoiceCard>
    );
    const card = screen.getByRole('button', { name: 'Bring your own keys' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    rerender(
      <ChoiceCard selected onSelect={onSelect}>
        Bring your own keys
      </ChoiceCard>
    );
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(card.getAttribute('type')).toBe('button');
  });
});
