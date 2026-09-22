/**
 * The resolve decision moved from the footer strip to the header's split Resolve button.
 *
 * These are the footer's own regressions, carried over rather than deleted — the three that
 * matter most were each found the hard way:
 *   - a customer-replied thread whose status is still 'open' must get the ACTIVE action set
 *     (the status→client_replied transition does not fire on every ingest path);
 *   - "Not customer work" must be offered on the UNREVIEWED thread, which is exactly the shape
 *     a newsletter arrives in (it was missing there in the first version of that feature);
 *   - nothing spam-related may be called a resolve (backend decision SP-D5).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Message, ThreadStatus } from '@/types';
import { getResolveMode, noKbResolveDialog } from '../resolveMode';
import { ResolveSplitButton } from '../ResolveSplitButton';

afterEach(cleanup);

type Fields = Pick<Message, 'status' | 'lastReplyFromClient'>;
const msg = (status: string, lastReplyFromClient: boolean | null = null): Fields => ({
  status: status as ThreadStatus,
  lastReplyFromClient,
});
const clean = { isFiltered: false, isSuspicious: false };

describe('getResolveMode — the one predicate the header and the strip share', () => {
  it.each([
    ['open, no customer reply', msg('open'), 'unreviewed'],
    ['open + client replied (the CLIENT REPLIED badge case)', msg('open', true), 'active'],
    ['client_replied (BE value outside the FE union)', msg('client_replied', true), 'active'],
    ['in_progress', msg('in_progress'), 'active'],
    ['pending', msg('pending', true), 'active'],
    ['resolved', msg('resolved'), null],
    ['closed', msg('closed'), null],
  ])('%s → %s', (_label, message, expected) => {
    expect(getResolveMode(message, clean)).toBe(expected);
  });

  it.each([
    ['filtered', { ...clean, isFiltered: true }],
    ['suspicious', { ...clean, isSuspicious: true }],
    ['spam-flagged outside triage', { ...clean, isSpamFlaggedOutsideTriage: true }],
  ])('a %s conversation is answered by its banner, never by Resolve', (_label, flags) => {
    // Even on an otherwise-active status: the banner's actions come first, as they did in the strip.
    expect(getResolveMode(msg('in_progress'), flags)).toBeNull();
    expect(getResolveMode(msg('open'), flags)).toBeNull();
  });

  it('a linked ticket takes the decision away from an active conversation', () => {
    expect(getResolveMode(msg('in_progress'), { ...clean, hasLinkedTicket: true })).toBeNull();
  });
});

describe('noKbResolveDialog — the one-press Resolve opens the footer’s old dialog', () => {
  it('dismisses an unreviewed thread through the reject dialog', () => {
    expect(noKbResolveDialog('unreviewed')).toBe('reject');
  });
  it('closes an active one through the no-KB confirm', () => {
    expect(noKbResolveDialog('active')).toBe('closeConfirm');
  });
});

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Other resolve options' }));
const items = () => screen.queryAllByRole('menuitem').map((el) => el.textContent);

describe('ResolveSplitButton', () => {
  it('renders nothing when there is no decision to make', () => {
    const { container } = render(<ResolveSplitButton mode={null} onResolve={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('one press resolves — the common case', () => {
    const onResolve = vi.fn();
    render(<ResolveSplitButton mode="active" onResolve={onResolve} onResolveToKb={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Resolve$/ }));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('an active conversation offers KB capture, Not customer work and Move to spam under the caret', () => {
    const onResolveToKb = vi.fn();
    render(
      <ResolveSplitButton
        mode="active"
        onResolve={vi.fn()}
        onResolveToKb={onResolveToKb}
        onNotCustomerWork={vi.fn()}
        onMoveToSpam={vi.fn()}
      />
    );
    openMenu();
    expect(items()).toEqual(['Resolve & save to KB', 'Not customer work', 'Move to spam']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resolve & save to KB' }));
    expect(onResolveToKb).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('🔴 offers Not customer work on an UNREVIEWED thread — where a newsletter actually sits', () => {
    const onNotCustomerWork = vi.fn();
    render(
      <ResolveSplitButton
        mode="unreviewed"
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={onNotCustomerWork}
      />
    );
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Not customer work' }));
    expect(onNotCustomerWork).toHaveBeenCalledTimes(1);
    // CONTROL: this adds an action, it does not replace one — the plain resolve is still there.
    expect(screen.getByRole('button', { name: /^Resolve$/ })).toBeTruthy();
  });

  it('never offers KB capture on an unreviewed thread — there is no answer to capture', () => {
    render(
      <ResolveSplitButton
        mode="unreviewed"
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={vi.fn()}
      />
    );
    openMenu();
    expect(items()).not.toContain('Resolve & save to KB');
  });

  it('does not offer Not customer work when the caller wires no handler', () => {
    // CONTROL for the two above: the item follows the prop, it is not always rendered.
    render(<ResolveSplitButton mode="active" onResolve={vi.fn()} onResolveToKb={vi.fn()} />);
    openMenu();
    expect(items()).not.toContain('Not customer work');
  });

  it('shows no caret at all when there are no variants', () => {
    render(<ResolveSplitButton mode="unreviewed" onResolve={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Other resolve options' })).toBeNull();
  });

  it('⛔ never calls a spam action a resolve (SP-D5)', () => {
    render(
      <ResolveSplitButton
        mode="active"
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={vi.fn()}
        onMoveToSpam={vi.fn()}
      />
    );
    openMenu();
    const spamItems = items().filter((label) => /spam/i.test(label ?? ''));
    expect(spamItems).toEqual(['Move to spam']);
    expect(spamItems.some((label) => /resolve/i.test(label ?? ''))).toBe(false);
  });

  it('Escape closes the menu without reaching the detail view’s own Escape (close the rail)', () => {
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    render(<ResolveSplitButton mode="active" onResolve={vi.fn()} onResolveToKb={vi.fn()} />);
    openMenu();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });
});
