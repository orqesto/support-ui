/**
 * The resolve decision: footer strip → header split button (09-22) → a row under the reply
 * (design v3, 2026-09-23).
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
import { ResolveDecisions } from '../ResolveDecisions';

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

const buttons = () => screen.queryAllByRole('button').map((el) => el.textContent);

describe('ResolveDecisions — the row under the reply (v3, 2026-09-23)', () => {
  it('renders nothing when there is no decision to make', () => {
    const { container } = render(<ResolveDecisions mode={null} onResolve={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('an active conversation: Resolve, save to KB, then the quiet exits — in that order', () => {
    render(
      <ResolveDecisions
        mode="active"
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={vi.fn()}
        onResolveAsSpam={vi.fn()}
      />
    );
    expect(buttons()).toEqual([
      'Resolve',
      'Resolve & save to KB',
      'Not customer work',
      'Resolve as spam',
    ]);
  });

  it.each([
    ['Resolve', 'onResolve'],
    ['Resolve & save to KB', 'onResolveToKb'],
    ['Not customer work', 'onNotCustomerWork'],
    ['Resolve as spam', 'onResolveAsSpam'],
  ] as const)('%s calls %s and nothing else', (label, prop) => {
    const handlers = {
      onResolve: vi.fn(),
      onResolveToKb: vi.fn(),
      onNotCustomerWork: vi.fn(),
      onResolveAsSpam: vi.fn(),
    };
    render(<ResolveDecisions mode="active" {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    for (const [name, fn] of Object.entries(handlers)) {
      expect(fn).toHaveBeenCalledTimes(name === prop ? 1 : 0);
    }
  });

  it('🔴 offers Not customer work on an UNREVIEWED thread — where a newsletter actually sits', () => {
    const onNotCustomerWork = vi.fn();
    render(
      <ResolveDecisions
        mode="unreviewed"
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={onNotCustomerWork}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not customer work' }));
    expect(onNotCustomerWork).toHaveBeenCalledTimes(1);
    // CONTROL: this adds an action, it does not replace one — the plain resolve is still there.
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
  });

  it('never offers KB capture on an unreviewed thread — there is no answer to capture', () => {
    render(<ResolveDecisions mode="unreviewed" onResolve={vi.fn()} onResolveToKb={vi.fn()} />);
    expect(buttons()).not.toContain('Resolve & save to KB');
  });

  it('a quiet exit follows its prop — absent handler, absent button, and no dangling rule', () => {
    render(<ResolveDecisions mode="active" onResolve={vi.fn()} onResolveToKb={vi.fn()} />);
    expect(buttons()).toEqual(['Resolve', 'Resolve & save to KB']);
    expect(document.querySelector('[aria-hidden="true"].w-px')).toBeNull();
  });

  it('⛔ nothing in the row is filled — Send stays the only filled button in the composer', () => {
    render(
      <ResolveDecisions
        mode="active"
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={vi.fn()}
        onResolveAsSpam={vi.fn()}
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
    }
  });

  it('busy disables every decision (a resolve request is in flight)', () => {
    render(
      <ResolveDecisions
        mode="active"
        busy
        onResolve={vi.fn()}
        onResolveToKb={vi.fn()}
        onNotCustomerWork={vi.fn()}
        onResolveAsSpam={vi.fn()}
      />
    );
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
