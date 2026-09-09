/**
 * The sentence the inbox never said.
 *
 * The list has always answered a narrowed question without mentioning it narrowed
 * anything. On one real workspace it renders `1–50 of 5` against 3,014 conversations —
 * 2,935 resolved, 2,952 mined from the knowledge base — with nothing on screen saying
 * so. Worse in the empty state: "No messages found" while three thousand sit one filter
 * away.
 *
 * ⛔ `scope === null` means NO INFORMATION (not asked, or the count failed) and renders
 * NOTHING. It is not `hidden: 0`, which means the list genuinely is everything. Showing
 * "0 hidden" for an unknown would be a confident false reassurance — the exact failure
 * this component exists to remove.
 *
 * ⚠️ The reasons OVERLAP and are never summed. A resolved thread mined from the KB is
 * counted under both; on that workspace the two are 2,935 and 2,952 against 3,009 hidden.
 *
 * ⛔ AND EACH CHIP IS THE SIZE OF ITS WHOLE BUCKET, not its overlap with `hidden`. The
 * backend does that deliberately so a chip's number equals the list the click opens
 * (`lensScope.ts`); intersecting would make the chip say 8 and the destination show 27.
 *
 * 🪤 Which is why the WORDING here has to keep them apart. This rendered
 * "19 hidden by the current view · 27 waiting on a reply · 11 awaiting routing" — one
 * sentence, one separator, so the chips read as a breakdown of the 19 and the whole line
 * read as broken arithmetic. It was reported as a bug, and a reader went and "fixed" the
 * SQL before an integration test stopped them. The counts were right; the sentence was
 * claiming something they never said. They are now labelled as somewhere to GO.
 */
import { ChevronDown, EyeOff } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import type { ListScope } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';

type Props = {
  scope: ListScope | null;
  /** `pagination.total` — how many the current lens matched. */
  shown: number;
  /**
   * Applies the lens that shows a hidden category.
   *
   * `needsListView` marks a category the KANBAN cannot display at all — the caller has to
   * leave the board as well as change the filter, or the click would set a filter and
   * appear to do nothing. Only `outbound_echo` is in that position today.
   */
  onJump: (filters: Partial<FilterState>, needsListView?: boolean) => void;
  /** Wording for where the rows are hidden from. The board hides more than the list does. */
  surface?: 'list' | 'board';
};

/**
 * Each chip jumps to the lens that actually holds those rows, mirroring the backend
 * bucket. `other` has no single lens — a lens can pin on things that are not a
 * classification (the Active view also pins "no reply yet") — so it is reported as
 * plain text rather than given a button that would land somewhere wrong.
 */
const REASONS: Array<{
  key: keyof ListScope['hiddenBecause'];
  label: string;
  filters?: Partial<FilterState>;
  /** The board has no column for these — jumping must also leave the board. */
  needsListView?: boolean;
}> = [
  {
    key: 'terminal',
    label: 'resolved or closed',
    filters: { lifecycle: 'resolved', queue: 'all' },
  },
  { key: 'knowledgeBase', label: 'from the knowledge base' },
  {
    key: 'awaitingOrReplied',
    label: 'waiting on a reply',
    filters: { lifecycle: 'awaiting', queue: 'all' },
  },
  {
    key: 'needsRouting',
    label: 'awaiting routing',
    filters: { queue: 'needs_routing', lifecycle: 'all' },
  },
  { key: 'spam', label: 'spam', filters: { queue: 'spam', lifecycle: 'all' } },
  { key: 'suspicious', label: 'suspicious', filters: { queue: 'suspicious', lifecycle: 'all' } },
  {
    key: 'notAnalysed',
    label: 'not yet reviewed',
    filters: { queue: 'not_analysed', lifecycle: 'all' },
  },
  { key: 'archived', label: 'auto-archived', filters: { queue: 'archived', lifecycle: 'all' } },
  {
    // Was the largest identifiable share of `other`, where it rendered as a number with
    // nothing to click. It now has both a name and the only lens that reaches it.
    key: 'orphanOutgoing',
    label: 'outbound echoes',
    filters: { queue: 'outbound_echo', lifecycle: 'all' },
    needsListView: true,
  },
  { key: 'other', label: 'hidden by this view' },
];

export const ListScopeNotice = ({ scope, shown, onJump, surface = 'list' }: Props) => {
  /**
   * The destinations live behind one trigger. On the board only the buckets with no lane
   * survive the filter (one or two), but the list shows every bucket and seven is a real
   * workspace: as one sentence they wrapped to three lines, pushed the list down, and read as
   * broken arithmetic. Behind a trigger the row is one line however many buckets a workspace
   * has, and the counts sit right-aligned where they can be compared.
   *
   * Hooks stay above the early return: React counts them per render.
   */
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(rootRef, open, close);

  // No information, or nothing hidden. In both cases the honest thing is silence:
  // the pagination line already states the count, and inventing a reassurance here
  // would be the same species of claim the component was written to stop.
  if (!scope || scope.hidden <= 0) return null;

  const isBoard = surface === 'board';

  // ⛔ `?? 0` would be wrong here: a bucket the backend does not send yet is UNKNOWN, and
  // the filter below drops it either way. Coalescing first and asserting later is how a
  // "0 outbound echoes" would eventually get rendered as a fact. Absent stays absent.
  const present = REASONS.map((reason) => ({
    ...reason,
    count: scope.hiddenBecause[reason.key],
  }))
    .filter((reason): reason is typeof reason & { count: number } => (reason.count ?? 0) > 0)
    /**
     * ⛔ ON THE BOARD, MOST OF THESE ARE NOT REASONS — THEY ARE LANES.
     *
     * `boardLanePredicate` ORs nine columns INCLUDING resolved, and applies no KB
     * exclusion at all, so terminal / suspicious / notAnalysed / archived / spam /
     * awaitingOrReplied rows are all ON the board, and `needs_routing` rides along as a
     * mark rather than being excluded. Listing them under "not shown on this board"
     * told the agent the board was hiding the very rows it was displaying.
     *
     * Observed on staging org 21: "Showing 2,880 of 2,910 — 30 not shown on this board ·
     * 2,864 resolved or closed · 2,904 from the knowledge base". The 2,864 are counted
     * INSIDE the 2,880 and cited as a reason for exclusion in the same sentence.
     *
     * 🔑 The board's own `needsListView` flag already encodes "this bucket has no column
     * here", so it is the filter — not a second list to keep in sync with the first.
     * `other` survives because it is BY DEFINITION the rows no lane claims, and on the
     * board it is the only honest entry: it is what `hidden` counts.
     */
    // ⛔ `??` is not interchangeable here and the lint rule's suggestion would be a bug:
    // `needsListView` is `boolean | undefined`, and `false ?? x` yields false where
    // `false || x` falls through to x. Compared explicitly so the operand is a boolean.
    .filter((reason) => !isBoard || reason.needsListView === true || reason.key === 'other');

  /**
   * Two different claims, so two different places. `other` is a SUBSET of `hidden` — the
   * rows no bucket claims — and is the menu's footnote row with nothing to click. The rest
   * are lens totals: each is the size of the list its row opens, so a number larger than
   * `hidden` is exactly what a reader should expect, and the menu labels them as filters.
   * The trigger's count is the destinations only; the subset is not somewhere to go.
   */
  const subsets = present.filter((reason) => reason.key === 'other');
  const destinations = present.filter((reason) => reason.key !== 'other');
  const hasMenu = destinations.length > 0 || subsets.length > 0;

  return (
    <div
      ref={rootRef}
      className={
        isBoard
          ? // On the board this is a caption on the Board/Triage row, not a card of its own:
            // the row it used to occupy (52px with its gap) came straight out of the lanes,
            // on the one screen where lane height IS the working area. One line, always:
            // the sentence truncates before anything else on that row yields.
            'flex items-center gap-x-1.5 min-w-0 text-xs text-muted-foreground'
          : 'flex items-center gap-x-2 min-w-0 px-3 py-2 mb-3 text-sm rounded-md border bg-muted/40 text-muted-foreground'
      }
      data-testid="list-scope-notice"
    >
      <EyeOff
        className={isBoard ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'}
        aria-hidden="true"
      />
      {/**
       * ⛔ The board does NOT say "Showing N". `shown` there is the board query's total
       * across all nine lanes, while the screen renders only the columns the agent has
       * toggled on — 2,880 claimed against 14 cards actually visible on staging org 21.
       * Neither number is wrong; "Showing" was. The board's honest claim is about
       * COVERAGE — which rows it has a lane for — and that holds whatever is collapsed.
       *
       * The sentence is VERBATIM what it was before the destinations moved behind the
       * trigger. Do not compress it: "1,356 hidden · 1 by this view" makes the subset read
       * as a second, contradictory total — the exact bug the wording exists to prevent.
       */}
      {isBoard ? (
        <span className="truncate min-w-0">
          This board has a lane for{' '}
          <strong className="text-foreground">
            {(scope.withoutLens - scope.hidden).toLocaleString()}
          </strong>{' '}
          of <strong className="text-foreground">{scope.withoutLens.toLocaleString()}</strong> —{' '}
          {scope.hidden.toLocaleString()} have none
        </span>
      ) : (
        <span className="truncate min-w-0">
          Showing <strong className="text-foreground">{shown.toLocaleString()}</strong> of{' '}
          <strong className="text-foreground">{scope.withoutLens.toLocaleString()}</strong> —{' '}
          {scope.hidden.toLocaleString()} hidden by the current view
        </span>
      )}
      {hasMenu && (
        <div className={isBoard ? 'relative shrink-0' : 'relative shrink-0 ml-auto'}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Not shown
            {/*
              The count of ITEMS hidden, not of categories.
              ⛔ This used to render `destinations.length` — how many kinds of not-shown the
              menu lists. "Not shown 7" therefore meant "seven categories", while every
              reader took it for seven conversations. The honest number was already on
              screen in the sentence beside this button, but that sentence is `truncate` in
              a flexed header, so it is the first thing to disappear when space is tight —
              leaving the misleading badge as the only number visible. Reported exactly that
              way from the board.
            */}
            <b className="font-semibold text-foreground">{scope.hidden.toLocaleString()}</b>
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          </button>
          {open && (
            <div
              id={menuId}
              role="menu"
              aria-label="Not shown"
              className="absolute left-0 top-full mt-1.5 z-30 w-[290px] rounded-lg border border-border bg-card p-[5px] shadow-xl text-foreground"
            >
              {/**
               * These rows are FILTER PRESETS, not navigation. Each carries `filters` and
               * calls `onJump`; the applied lens then shows in the token bar as a removable
               * token, so what changed and how to undo it are both visible. As underlined
               * words in a sentence they read as links to somewhere else.
               */}
              {destinations.length > 0 && (
                <div className="px-2 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Show instead — applies a filter
                </div>
              )}
              {destinations.map((reason) =>
                reason.filters ? (
                  <button
                    key={reason.key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onJump(reason.filters as Partial<FilterState>, reason.needsListView);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[5px] text-[13px] text-left hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                  >
                    <span className="truncate">{reason.label}</span>
                    <span className="ml-auto font-semibold tabular-nums text-muted-foreground">
                      {reason.count.toLocaleString()}
                    </span>
                  </button>
                ) : (
                  // A bucket with no single lens (the knowledge base) — a count, not a preset.
                  <div
                    key={reason.key}
                    role="presentation"
                    className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-muted-foreground"
                  >
                    <span className="truncate">{reason.label}</span>
                    <span className="ml-auto font-semibold tabular-nums">
                      {reason.count.toLocaleString()}
                    </span>
                  </div>
                )
              )}
              {subsets.map((reason) => (
                <div
                  key={reason.key}
                  role="presentation"
                  className="flex items-center gap-2 px-2 py-1.5 mt-1 border-t border-border text-[12.5px] text-muted-foreground"
                >
                  <span className="truncate">{reason.label}</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {reason.count.toLocaleString()}
                  </span>
                </div>
              ))}
              {destinations.length > 0 && (
                <div className="px-2 pt-1.5 pb-1 mt-0.5 border-t border-border text-[11.5px] leading-snug text-muted-foreground/80">
                  Each one sets a lens and lands in the filter bar as a token you can remove.
                  {/*
                    Say it before someone adds it up. Each figure is the size of its WHOLE
                    bucket, not its overlap with the hidden set, and a row can fall into
                    several — on one workspace these summed to 5,887 against 3,009 hidden.
                    Now that the button shows the real total, that mismatch is on screen and
                    unexplained silence would read as a bug.
                  */}
                  {/*
                    ⚠️ Says they will not MATCH, never that they add up to more. An earlier
                    draft asserted "more than N" — which is not guaranteed. Each figure is the
                    size of its whole bucket, so the rows usually exceed the total, but when
                    most hidden rows fall into `other` (which is a subset row, not a
                    destination) the destinations can sum to LESS. Asserting a direction the
                    data does not guarantee puts a falsifiable claim on screen, which is the
                    same class of bug as the badge this PR fixes.
                  */}
                  {destinations.length > 1 && (
                    <span className="block mt-0.5">
                      Each figure is the size of its whole bucket, so they will not add up to{' '}
                      {scope.hidden.toLocaleString()}.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
