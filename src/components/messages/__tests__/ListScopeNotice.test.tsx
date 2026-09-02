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

  it('does not say "Showing N" on the kanban, where N is not what is on screen', () => {
    // Was: asserted the board said "not shown on this board". That wording is gone, and
    // the reason it is gone matters more than the phrase — see the block below.
    const text =
      render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} surface="board" />) &&
      (screen.getByTestId('list-scope-notice').textContent ?? '');
    expect(text).toContain('has a lane for');
    expect(text).not.toContain('Showing');
  });
});

/**
 * The board is not the list, and the notice used to pretend it was.
 *
 * Observed on staging org 21: "Showing 2,880 of 2,910 — 30 not shown on this board ·
 * 2,864 resolved or closed · 2,904 from the knowledge base · 4 awaiting routing".
 * Two independent falsehoods in one line:
 *   1. the 2,864 resolved are counted INSIDE the 2,880 and cited as a reason for exclusion;
 *   2. the board rendered 14 cards at the time — the resolved lane is behind a toggle that
 *      is off by default, so "Showing 2,880" described a screen nobody was looking at.
 */
describe('ListScopeNotice — board surface', () => {
  // A KB-mined workspace: everything is in a bucket the BOARD has a lane for.
  const org21: ListScope = {
    withoutLens: 2910,
    hidden: 30,
    hiddenBecause: {
      terminal: 2864,
      knowledgeBase: 2904,
      needsRouting: 4,
      archived: 2,
      spam: 0,
      suspicious: 0,
      notAnalysed: 0,
      awaitingOrReplied: 0,
      orphanOutgoing: 7,
      other: 23,
    },
  } as unknown as ListScope;

  const boardText = () => {
    render(<ListScopeNotice scope={org21} shown={2880} onJump={vi.fn()} surface="board" />);
    return screen.getByTestId('list-scope-notice').textContent ?? '';
  };

  it('does not cite buckets the board has a lane for', () => {
    const text = boardText();
    // boardLanePredicate ORs nine lanes INCLUDING resolved, and applies no KB exclusion.
    expect(text).not.toContain('resolved or closed');
    expect(text).not.toContain('from the knowledge base');
    expect(text).not.toContain('awaiting routing');
    expect(text).not.toContain('auto-archived');
  });

  it('still cites what the board genuinely cannot display', () => {
    // The control for the test above: if the filter were simply dropping everything, this
    // would pass vacuously. `orphanOutgoing` carries needsListView, `other` is the residue.
    const text = boardText();
    expect(text).toContain('7 outbound echoes');
    expect(text).toContain('23 hidden by this view');
  });

  it('states coverage rather than a count of what is on screen', () => {
    // 2,910 − 30 = 2,880 rows have a lane. That claim holds whichever columns are
    // collapsed, which is exactly why it replaced "Showing".
    const text = boardText(); // 🪤 calling boardText() twice renders twice, and
    expect(text).toContain('2,880'); //    getByTestId then fails on TWO matches.
    expect(text).toContain('30 have none');
  });

  it('leaves the LIST surface untouched — every reason still shown', () => {
    // Scope control. The same scope on the list must still name all four, because on the
    // list they really are the reasons rows are missing.
    render(<ListScopeNotice scope={org21} shown={0} onJump={vi.fn()} />);
    const text = screen.getByTestId('list-scope-notice').textContent ?? '';
    expect(text).toContain('Showing');
    expect(text).toContain('2,864 resolved or closed');
    expect(text).toContain('2,904 from the knowledge base');
  });
});

/**
 * THE REPORTED CONFUSION, and the reason the numbers looked broken.
 *
 * "Showing 53 of 72 — 19 hidden by the current view · 27 waiting on a reply · 11 awaiting
 * routing" — one sentence, one separator, so the chips read as a decomposition of the 19
 * and 27-of-19 read as nonsense. The counts were right: each chip is the size of its whole
 * bucket, deliberately, so it matches the list the click opens. It was the SENTENCE that
 * claimed something they never said, and a reader went and changed the SQL before an
 * integration test stopped them.
 */
describe('a chip is a destination, not a share of the hidden count', () => {
  const scope = {
    withoutLens: 72,
    hidden: 19,
    hiddenBecause: {
      terminal: 0,
      spam: 0,
      suspicious: 4,
      notAnalysed: 0,
      archived: 4,
      knowledgeBase: 0,
      awaitingOrReplied: 27,
      needsRouting: 11,
      orphanOutgoing: 0,
      other: 6,
    },
  } as never;

  it('labels the clickable counts as somewhere to go', () => {
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);

    expect(screen.getByText(/Jump to/)).toBeTruthy();
  });

  it('still renders a bucket LARGER than the hidden count, because that is correct', () => {
    // ⛔ Not a bug and must never be "fixed" by clamping: 27 is how many rows that lens
    // holds, which is what the click lands on.
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);

    expect(screen.getByRole('button', { name: '27 waiting on a reply' })).toBeTruthy();
  });

  it('keeps `other` in the sentence, since it IS a share of the hidden count', () => {
    // CONTROL for the split: `other` counts hidden rows no bucket claims, so it is the one
    // entry that genuinely decomposes `hidden` and must not move behind "Jump to".
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);

    const other = screen.getByText('6 hidden by this view');
    expect(other.tagName).not.toBe('BUTTON');
  });
});
