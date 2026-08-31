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
 * Each chip answers "how many of the hidden are also this", one question at a time.
 */
import { EyeOff } from 'lucide-react';
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
  { key: 'terminal', label: 'resolved or closed', filters: { lifecycle: 'resolved', queue: 'all' } },
  { key: 'knowledgeBase', label: 'from the knowledge base' },
  { key: 'awaitingOrReplied', label: 'waiting on a reply', filters: { lifecycle: 'awaiting', queue: 'all' } },
  { key: 'needsRouting', label: 'awaiting routing', filters: { queue: 'needs_routing', lifecycle: 'all' } },
  { key: 'spam', label: 'spam', filters: { queue: 'spam', lifecycle: 'all' } },
  { key: 'suspicious', label: 'suspicious', filters: { queue: 'suspicious', lifecycle: 'all' } },
  { key: 'notAnalysed', label: 'not yet reviewed', filters: { queue: 'not_analysed', lifecycle: 'all' } },
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
  // No information, or nothing hidden. In both cases the honest thing is silence:
  // the pagination line already states the count, and inventing a reassurance here
  // would be the same species of claim the component was written to stop.
  if (!scope || scope.hidden <= 0) return null;

  // ⛔ `?? 0` would be wrong here: a bucket the backend does not send yet is UNKNOWN, and
  // the filter below drops it either way. Coalescing first and asserting later is how a
  // "0 outbound echoes" would eventually get rendered as a fact. Absent stays absent.
  const present = REASONS.map((reason) => ({
    ...reason,
    count: scope.hiddenBecause[reason.key],
  })).filter((reason): reason is typeof reason & { count: number } => (reason.count ?? 0) > 0);

  return (
    <div
      className="flex flex-wrap gap-x-2 gap-y-1 items-center px-3 py-2 mb-3 text-sm rounded-md border bg-muted/40 text-muted-foreground"
      data-testid="list-scope-notice"
    >
      <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        Showing <strong className="text-foreground">{shown.toLocaleString()}</strong> of{' '}
        <strong className="text-foreground">{scope.withoutLens.toLocaleString()}</strong> —{' '}
        {scope.hidden.toLocaleString()}{' '}
        {surface === 'board' ? 'not shown on this board' : 'hidden by the current view'}
      </span>
      {present.length > 0 && <span aria-hidden="true">·</span>}
      {present.map((reason) =>
        reason.filters ? (
          <button
            key={reason.key}
            type="button"
            className="underline rounded underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onJump(reason.filters as Partial<FilterState>, reason.needsListView)}
          >
            {reason.count.toLocaleString()} {reason.label}
          </button>
        ) : (
          <span key={reason.key}>
            {reason.count.toLocaleString()} {reason.label}
          </span>
        )
      )}
    </div>
  );
};
