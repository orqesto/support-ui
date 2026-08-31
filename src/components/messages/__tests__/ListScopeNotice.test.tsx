/**
 * The list said `1–50 of 5` against 3,014 conversations and nothing else. These pin the
 * three ways the replacement could tell the same lie in a friendlier font.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ListScopeNotice } from '../ListScopeNotice';
import type { ListScope } from '@/services/message.service';

afterEach(cleanup);

/** The real framehouse shape: 5 shown, 3,009 hidden, categories that overlap. */
const framehouse: ListScope = {
  withoutLens: 3014,
  hidden: 3009,
  hiddenBecause: {
    terminal: 2935,
    knowledgeBase: 2952,
    spam: 40,
    awaitingOrReplied: 17,
    needsRouting: 12,
    archived: 5,
    suspicious: 0,
    notAnalysed: 0,
    other: 0,
  },
};

describe('ListScopeNotice', () => {
  it('says how many of the total the list is actually showing', () => {
    render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} />);
    const notice = screen.getByTestId('list-scope-notice');
    expect(notice.textContent).toContain('5');
    expect(notice.textContent).toContain('3,014');
    expect(notice.textContent).toContain('3,009');
  });

  it('renders NOTHING when scope is null, because null is not zero', () => {
    // `null` means the count could not be taken — not requested, or the aggregate
    // failed. Rendering "0 hidden" for an unknown is a confident false reassurance,
    // which is the failure mode this component exists to remove.
    const { container } = render(<ListScopeNotice scope={null} shown={5} onJump={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('stays silent when the list really is everything', () => {
    const nothingHidden: ListScope = { ...framehouse, hidden: 0, withoutLens: 5 };
    const { container } = render(
      <ListScopeNotice scope={nothingHidden} shown={5} onJump={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('never presents the overlapping reasons as a total', () => {
    // 2935 + 2952 + 40 + 17 + 12 + 5 = 5,961 against 3,009 hidden rows, because a
    // resolved thread mined from the KB is counted under both. A component that
    // summed them would render a number larger than the set it describes.
    render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} />);
    expect(screen.getByTestId('list-scope-notice').textContent).not.toContain('5,961');
  });

  it('omits reasons with no rows rather than listing zeros', () => {
    render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} />);
    const text = screen.getByTestId('list-scope-notice').textContent ?? '';
    // Control: the element has text at all, so the not.toContain assertions mean something.
    expect(text).toContain('3,009 hidden');
    expect(text).not.toContain('0 suspicious');
    expect(text).not.toContain('0 not yet reviewed');
  });

  it('jumps to the lens that actually holds the hidden rows', () => {
    // Each chip must land on the queue the backend counted, or the number is a
    // promise the click cannot keep.
    const onJump = vi.fn();
    render(<ListScopeNotice scope={framehouse} shown={5} onJump={onJump} />);

    // The trailing `undefined` is the `needsListView` flag: these categories DO have a
    // kanban column, so the jump must not also throw the user off the board.
    fireEvent.click(screen.getByText('2,935 resolved or closed'));
    expect(onJump).toHaveBeenCalledWith({ lifecycle: 'resolved', queue: 'all' }, undefined);

    fireEvent.click(screen.getByText('40 spam'));
    expect(onJump).toHaveBeenCalledWith({ queue: 'spam', lifecycle: 'all' }, undefined);
  });

  it('does not offer a jump for rows no single lens holds', () => {
    // `other` covers rows hidden by a pin that is not a classification at all — the
    // Active view also pins "no reply yet". A button there would land somewhere wrong.
    const withOther: ListScope = {
      ...framehouse,
      hiddenBecause: { ...framehouse.hiddenBecause, other: 3 },
    };
    render(<ListScopeNotice scope={withOther} shown={5} onJump={vi.fn()} />);
    const label = screen.getByText('3 hidden by this view');
    expect(label.tagName).not.toBe('BUTTON');
  });

  it('outbound echoes are a LINK, and one that also leaves the board', () => {
    // These rows match no kanban column and no other queue, so before `outbound_echo`
    // existed they fell into `other` and rendered as an unclickable number — counted by
    // the product and reachable from nowhere in it.
    const withEchoes: ListScope = {
      ...framehouse,
      hiddenBecause: { ...framehouse.hiddenBecause, orphanOutgoing: 3 },
    };
    const onJump = vi.fn();
    render(<ListScopeNotice scope={withEchoes} shown={5} onJump={onJump} surface="board" />);

    const chip = screen.getByText('3 outbound echoes');
    expect(chip.tagName).toBe('BUTTON');
    fireEvent.click(chip);
    // The second argument is what tells the page to leave the kanban. Without it the
    // click sets a filter the board cannot honour and visibly does nothing.
    expect(onJump).toHaveBeenCalledWith({ queue: 'outbound_echo', lifecycle: 'all' }, true);
  });

  it('treats a missing bucket as unknown, not as zero', () => {
    // An older backend does not send `orphanOutgoing` at all. `?? 0` here would be the
    // start of rendering "0 outbound echoes" as a fact about a deployment that never
    // counted them.
    render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} />);
    const text = screen.getByTestId('list-scope-notice').textContent ?? '';
    expect(text).toContain('3,009 hidden'); // control
    expect(text).not.toContain('outbound echoes');
  });

  it('says "not shown on this board" on the kanban, where more is missing', () => {
    render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} surface="board" />);
    expect(screen.getByTestId('list-scope-notice').textContent).toContain(
      'not shown on this board'
    );
  });
});
