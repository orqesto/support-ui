/** Triage chips with counts the backend stopped at its cap (search plan step 3½d): `+`, never exact. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriageMenu } from '../ThreadViews';

afterEach(cleanup);

describe('TriageMenu counts', () => {
  it('adds "at least" counts into an "at least" total on the trigger', () => {
    render(
      <TriageMenu
        active={null}
        counts={{ not_analysed: 3, archived: { atLeast: 40 }, spam: 2, no_lane: 0 }}
        arrivals={{}}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Triage/ }).textContent).toContain('45+');
  });

  it('CONTROL: exact counts add up to an exact total', () => {
    render(
      <TriageMenu
        active={null}
        counts={{ not_analysed: 3, archived: 40, spam: 2, no_lane: 0 }}
        arrivals={{}}
        onSelect={vi.fn()}
      />
    );
    const trigger = screen.getByRole('button', { name: /Triage/ }).textContent ?? '';
    expect(trigger).toContain('45');
    expect(trigger).not.toContain('+');
  });

  it('an unknown count leaves the total unknown, not a smaller number', () => {
    render(
      <TriageMenu
        active={null}
        counts={{ not_analysed: 3, archived: undefined, spam: 2, no_lane: 0 }}
        arrivals={{}}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Triage/ }).textContent).not.toMatch(/\d/);
  });
});
