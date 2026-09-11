/**
 * The list said `1–50 of 5` against 3,014 conversations and nothing else. These pin the
 * three ways the replacement could tell the same lie in a friendlier font.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ListScopeNotice } from '../ListScopeNotice';
import type { ListScope } from '@/services/message.service';

afterEach(cleanup);

/**
 * The destinations sit behind one trigger now (Kanban space audit, 2026-09-07): seven of them
 * in a sentence wrapped to three lines and read as broken arithmetic. The sentence itself is
 * verbatim; the rows open from "Not shown N".
 */
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Not shown/ }));

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
    openMenu();
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
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /resolved or closed/ }));
    expect(onJump).toHaveBeenCalledWith({ lifecycle: 'resolved', queue: 'all' }, undefined);

    // A pick closes the menu: the applied lens shows up as a token in the filter bar.
    expect(screen.queryByRole('menu')).toBeNull();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /spam/ }));
    expect(onJump).toHaveBeenCalledWith({ queue: 'spam', lifecycle: 'all' }, undefined);
  });

  it('anchors the panel to the edge its trigger sits on, so it cannot open off-screen', () => {
    // Measured on live taco at 2560px: the trigger ended at x=2504 and the 290px panel ran
    // to x=2663 — 103px past the viewport, and worse the narrower the window. `left-0` pins
    // the panel's LEFT edge to the trigger's left, but the list pushes that trigger to the
    // far right with `ml-auto`, so there is nothing to grow into.
    //
    // jsdom does no layout, so this asserts the anchoring SIDE rather than pixels — the
    // thing that was wrong. The pixel claim above came from the browser, not from here.
    const { unmount } = render(<ListScopeNotice scope={framehouse} shown={5} onJump={vi.fn()} />);
    openMenu();
    expect(screen.getByRole('menu')).toHaveClass('right-0');
    expect(screen.getByRole('menu')).not.toHaveClass('left-0');
    unmount();
  });

  it('does not offer a jump for rows no single lens holds', () => {
    // `other` covers rows hidden by a pin that is not a classification at all — the
    // Active view also pins "no reply yet". A button there would land somewhere wrong.
    const withOther: ListScope = {
      ...framehouse,
      hiddenBecause: { ...framehouse.hiddenBecause, other: 3 },
    };
    render(<ListScopeNotice scope={withOther} shown={5} onJump={vi.fn()} />);
    openMenu();
    const label = screen.getByText('hidden by this view');
    expect(label.closest('button')).toBeNull();
    expect(label.closest('[role="menuitem"]')).toBeNull();
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

    openMenu();
    const chip = screen.getByRole('menuitem', { name: /outbound echoes/ });
    expect(chip.textContent).toContain('3');
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
    openMenu();
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
    openMenu();
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
    expect(text).toContain('outbound echoes7');
    expect(text).toContain('hidden by this view23');
  });

  it('keeps the board panel on the LEFT — its trigger is not right-aligned', () => {
    // The counterpart to the list-surface anchoring test. The fix is conditional, so a
    // blanket `right-0` would have pushed the board panel off the other edge instead.
    render(<ListScopeNotice scope={org21} shown={2880} onJump={vi.fn()} surface="board" />);
    openMenu();
    expect(screen.getByRole('menu')).toHaveClass('left-0');
    expect(screen.getByRole('menu')).not.toHaveClass('right-0');
  });

  it('is a caption on the board, not a card — the card row cost the lanes 52px', () => {
    render(<ListScopeNotice scope={org21} shown={2880} onJump={vi.fn()} surface="board" />);
    const cls = screen.getByTestId('list-scope-notice').className;
    expect(cls).not.toMatch(/\bborder\b|rounded-md|py-2|mb-3/);
    expect(cls).toMatch(/text-xs/);
    // And one line, always: the caption truncates before the row's counts yield.
    expect(cls).not.toMatch(/flex-wrap/);
  });

  it('keeps the card chrome on the list, where it is not above a bounded board', () => {
    render(<ListScopeNotice scope={org21} shown={5} onJump={vi.fn()} />);
    expect(screen.getByTestId('list-scope-notice').className).toMatch(/\bborder\b/);
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
    openMenu();
    const text = screen.getByTestId('list-scope-notice').textContent ?? '';
    expect(text).toContain('Showing');
    expect(text).toContain('resolved or closed2,864');
    expect(text).toContain('from the knowledge base2,904');
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

  it('labels the clickable counts as filters to apply, not places to go', () => {
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    openMenu();
    expect(screen.getByText('Show instead — applies a filter')).toBeTruthy();
    expect(screen.getByText(/lands in the filter bar as a token you can remove/)).toBeTruthy();
  });

  it('still renders a bucket LARGER than the hidden count, because that is correct', () => {
    // ⛔ Not a bug and must never be "fixed" by clamping: 27 is how many rows that lens
    // holds, which is what the click lands on.
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    openMenu();
    expect(screen.getByRole('menuitem', { name: /waiting on a reply/ }).textContent).toContain(
      '27'
    );
  });

  it('keeps `other` out of the clickable rows — a share, not a lens', () => {
    // CONTROL for the split: `other` counts hidden rows no bucket claims, so it is listed
    // but not clickable. Four destinations (suspicious, archived, waiting, routing).
    //
    // ⚠️ This used to assert the TRIGGER said '4'. That was pinning a defect: 4 is how many
    // categories the menu lists, and the button reads "Not shown 4" as though four
    // conversations were hidden. The split it exists to control for is about the ROWS, and
    // that half is unchanged and still asserted here.
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    openMenu();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByText('hidden by this view').closest('[role="menuitem"]')).toBeNull();
  });

  it('counts ITEMS on the trigger, not categories', () => {
    // Reported from the board: "Not shown 7" with seven rows in the menu, read as seven
    // conversations. The honest total was in the sentence beside it — which is `truncate`
    // in a flexed header and therefore the first thing to vanish, leaving only the
    // misleading badge.
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Not shown/ }).textContent ?? '';
    expect(trigger).toContain('19'); // scope.hidden
    expect(trigger).not.toContain('4'); // the category count it used to show
  });

  it('warns that the categories overlap, now that the button shows the real total', () => {
    // Each figure is the size of its WHOLE bucket, not its overlap with the hidden set, so
    // the rows sum to more than the trigger. Unexplained, that reads as a bug.
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    openMenu();
    expect(screen.getByText(/will not add up to/)).toBeInTheDocument();
  });

  it('keeps the sentence verbatim — the subset never gets folded into it', () => {
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    const text = screen.getByTestId('list-scope-notice').textContent ?? '';
    expect(text).toContain('Showing 53 of 72 — 19 hidden by the current view');
    expect(text).not.toContain('6 hidden by this view');
  });

  it('closes on Escape and on a click outside', () => {
    render(<ListScopeNotice scope={scope} shown={53} onJump={vi.fn()} />);
    openMenu();
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    openMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
