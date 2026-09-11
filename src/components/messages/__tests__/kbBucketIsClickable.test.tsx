import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ListScopeNotice } from '@/components/messages/ListScopeNotice';
import type { ListScope } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';

/**
 * "from the knowledge base — 2,402" was a figure with nothing to click, sitting under a
 * heading that reads "Show instead — applies a filter" and a footnote promising "each one
 * sets a lens and lands in the filter bar as a token you can remove". For that row the
 * words were false, and the owner asked for it to be clickable more than once.
 *
 * The justification in the code — "a bucket with no single lens" — was wrong. `showKBOnly`
 * is parsed from the query string and adds `isFromKBSource = 'true'`; on staging org 21 it
 * partitions the default lens exactly (29 KB + 21 not-KB = 50).
 */
const scope = {
  withoutLens: 2481,
  hidden: 2340,
  hiddenBecause: {
    terminal: 2318,
    knowledgeBase: 2402,
    awaitingOrReplied: 83,
    needsRouting: 26,
    archived: 22,
    spam: 0,
    suspicious: 0,
    notAnalysed: 0,
    orphanOutgoing: 0,
    other: 0,
  },
} as unknown as ListScope;

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Not shown/ }));

afterEach(cleanup);

describe('the "from the knowledge base" bucket', () => {
  it('is a button that applies the KB lens', () => {
    const onJump = vi.fn<(filters: Partial<FilterState>, needsListView?: boolean) => void>();
    render(<ListScopeNotice scope={scope} shown={141} onJump={onJump} />);
    openMenu();

    const row = screen.getByRole('menuitem', { name: /from the knowledge base/i });
    fireEvent.click(row);

    expect(onJump).toHaveBeenCalledTimes(1);
    const [filters] = onJump.mock.calls[0];
    // ⚠️ The lens must arrive with the existing one CLEARED. The jump merges onto whatever
    // is set, and the menu promises each figure is "the size of its whole bucket".
    // Measured on staging org 21: 29 alone, 12 under a stale lifecycle=awaiting, 0 under
    // queue=spam — the last lands the operator on an empty list after clicking 2,402.
    expect(filters).toMatchObject({ showKBOnly: true, lifecycle: 'all', queue: 'all' });
  });

  it('does not ask the board to leave the board', () => {
    // The board's predicate applies no KB exclusion, so these rows are already on it.
    const onJump = vi.fn<(filters: Partial<FilterState>, needsListView?: boolean) => void>();
    render(<ListScopeNotice scope={scope} shown={141} onJump={onJump} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /from the knowledge base/i }));

    const [, needsListView] = onJump.mock.calls[0];
    expect(needsListView).toBeFalsy();
  });

  it('leaves every row under the "applies a filter" heading clickable', () => {
    // The heading and footnote make a promise about the rows beneath them. `other`
    // ("hidden by this view") is deliberately below the divider, not under that heading.
    render(<ListScopeNotice scope={scope} shown={141} onJump={vi.fn()} />);
    openMenu();

    const labels = ['resolved or closed', 'from the knowledge base', 'waiting on a reply'];
    for (const label of labels) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label, 'i') })).toBeEnabled();
    }
  });
});
