import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageListItem } from '@/features/messages/components/MessageListItem';
import { scopeReasonJump } from '@/features/messages/components/ListScopeNotice';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Typography } from '@/components/ui/Typography';
import { threadApiFilters } from '@/hooks/threadApiFilters';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { formatTotal } from '@/lib/listTotals';
import {
  messageService,
  type ListScope,
  type MessageThread,
  type ThreadsResponse,
} from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import type { FilterState } from '@/stores/messagesStore';

type Place = keyof ListScope['hiddenBecause'];

/** What each "Not shown" bucket is called where an agent reads it as a place. */
const PLACE_TITLE: Record<Place, string> = {
  terminal: 'Resolved or closed',
  knowledgeBase: 'Knowledge base',
  awaitingOrReplied: 'Waiting on a reply',
  needsRouting: 'Awaiting routing',
  spam: 'Spam',
  suspicious: 'Suspicious',
  notAnalysed: 'Not yet reviewed',
  archived: 'Auto-archived',
  orphanOutgoing: 'Outbound echoes',
  other: 'Hidden by this view',
};
/** A bucket a newer backend adds: still a place, never a blank heading. */
const placeTitle = (place: string): string => PLACE_TITLE[place as Place] ?? 'Elsewhere';

/**
 * Every lens a jump can land on top of. A jump MERGES onto the current filters, so a group's
 * "Show in that view" from inside the knowledge-base lens or a column chip kept `showKBOnly` /
 * `columnId` and landed on a list without the rows it promised (review of #798).
 */
const LENS_RESET: Partial<FilterState> = {
  lifecycle: 'all',
  queue: 'all',
  columnId: 'all',
  showKBOnly: false,
  status: 'all',
};

const PAGE = 25;

/** A failed or timed-out answer is asked again for the same question after this long at most once. */
export const FAILED_RETRY_MS = 60_000;
/**
 * The same question is asked again at most this often. `refreshKey` moves on every server-event
 * flush (any colleague's change, ~5 s), and each move sent the heavy outside-view read again —
 * per tab, never cancelled (release review, 2026-11-02). A move inside the window is asked once
 * at its end, so the section still catches up.
 */
export const REFRESH_MIN_MS = 15_000;
/**
 * An ask of the same question still out after this long is replaced: the client sets no request
 * timeout, and a read that never settled kept every re-ask away (release review, round 3).
 */
export const ASK_STALE_MS = 30_000;

/**
 * The negations a jump keeps: a negated lifecycle or queue ("not awaiting") would turn the jump
 * into "everything EXCEPT …", but any other ("not AI state X") is the agent's own filter — clearing
 * it turned "everything except X" into "only X" (review of #798).
 */
const negateKeptByJump = (negate: string | undefined): string =>
  (negate ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key !== '' && key !== 'lifecycle' && key !== 'queue')
    .join(',');

/** The rows of an `outsideView` answer, or null when it must not be shown. */
const outsideRows = (answer: ThreadsResponse): MessageThread[] | null => {
  if (!answer.success) return null;
  // A backend without outsideView answers the VIEW's own rows (or none) to the same request: an
  // empty answer from it looked like "nothing elsewhere" and was asked again on every refresh.
  if (answer.outsideView !== true) return null;
  // Not finished in time: say nothing rather than a part presented as the whole.
  if (answer.timedOut === true || answer.search?.timedOut === true) return null;
  const listed = (answer.data ?? []) as MessageThread[];
  // ⛔ A backend without `outsideView` answers the VIEW's own rows (no `foundIn`): never list
  // them a second time as "elsewhere".
  return listed.every((thread) => thread.foundIn) ? listed : null;
};

/**
 * A searched list's matches that its view does not show, grouped by where they are, each group
 * with a way to go there (search kept). A customer's workspace, 2026-11-02: an address searched
 * under Needs us showed nothing while all 10 matches sat in Resolved and the knowledge base, and
 * agents read the empty list as "not in Odly".
 *
 * Rows come from the backend's `outsideView` (the scope count's hidden set, listed, each with the
 * bucket that names it). Asked again when the search, filters, team or workspace change, and when
 * the list's rows move (`refreshKey`) — not on every poll, and not on its own once the agent has
 * pressed "Show more": then only the Refresh button asks again, from page 1.
 */
export const OutsideViewMatches = ({
  filters,
  onJump,
  onOpen,
  highlightTerms,
  refreshKey,
  enabled = true,
}: {
  filters: FilterState;
  onJump: (filters: Partial<FilterState>, needsListView?: boolean) => void;
  onOpen: (thread: MessageThread) => void;
  highlightTerms?: string[];
  /** Moves when the list's rows change (status, assignee…): a match may have moved in or out. */
  refreshKey?: string;
  /**
   * False while the list itself is loading: asked once it landed, not once before and again when
   * its rows move `refreshKey` — two heavy reads per typed search (review of #798).
   */
  enabled?: boolean;
}) => {
  const search = filters.search?.trim() ?? '';
  const deptKey = useDepartmentContextKey();
  const organizationId = useAuthStore((state) => state.selectedOrganizationId);
  const request = useMemo(
    () => (search ? { ...threadApiFilters(filters, false), outsideView: '1' } : null),
    [filters, search]
  );
  // What the answer is FOR (a new one clears the section) vs when to re-ask it (a refresh keeps
  // the rows on screen until the new answer — no blink each time a row moves).
  const queryKey = request ? JSON.stringify([request, deptKey, String(organizationId)]) : '';
  // `enabled` is NOT part of the key: the list's own re-reads flip it, and with it in the key every
  // re-read asked again and dropped an answer landing meanwhile (review of #799, probed).
  const requestKey = request ? JSON.stringify([queryKey, refreshKey ?? '']) : '';
  // The key last asked: a flip of `enabled` back on with the same key asks nothing.
  const askedKey = useRef('');
  // A QUESTION whose answer failed, and when: asked again only after FAILED_RETRY_MS — every list
  // re-read asked a persistently failing term again (review of #803). Keyed on `queryKey`, not
  // `requestKey`: `refreshKey` moves on every colleague's update, and keyed on it the back-off
  // never matched on a busy inbox — the heavy read went out again on every flush (review of #805).
  const failedAt = useRef<{ key: string; at: number; failed: boolean } | null>(null);
  // Only the newest "Show more" clears its spinner.
  const moreSeq = useRef(0);
  const shownQuery = useRef('');
  const [rows, setRows] = useState<MessageThread[]>([]);
  const [total, setTotal] = useState(0);
  const [totalCapped, setTotalCapped] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  // The request the rows on screen belong to: an answer for an older one is dropped.
  const currentKey = useRef('');
  currentKey.current = requestKey;

  // What the agent is told while there are no rows: asking, could not check, or nothing.
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed' | 'done'>('idle');
  // Bumped by a timer to ask again: after the failure window, or at the end of the refresh window.
  const [retryTick, setRetryTick] = useState(0);
  const lastAsked = useRef<{ key: string; at: number } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  // The question the ask in flight is FOR: a refresh of the same question lets it finish.
  const inFlightQuery = useRef('');
  const inFlightAt = useRef(0);
  // The page shown: past page 1 (the agent pressed "Show more") nothing refreshes automatically.
  const pageRef = useRef(1);
  pageRef.current = page;
  // Moves when a failure (or an older backend's answer) clears the rows: a "Show more" still out
  // then has nothing to append to and is dropped.
  const rowsEpoch = useRef(0);
  // Moves each time a "Show more" ADDS rows. A refresh is dropped if this moved while it was out —
  // in either order: pressed before or after the refresh was asked, as long as it landed meanwhile.
  // A "Show more" that failed or was dropped adds nothing and costs no refresh (round-7 review).
  const moreApplied = useRef(0);
  // The "Show more" read in flight, aborted when the question changes, Refresh is pressed, or the
  // section unmounts.
  const moreAbort = useRef<AbortController | null>(null);
  // The in-flight ask's own stale timer, cleared only when THAT ask ends: kept out of the effect's
  // cleanup, which every list re-read (`enabled` off and on) ran and so cancelled it (round 4).
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The one root element every shown state renders in — "Checking…", "could not be checked", "no
  // matches now", the matches — so React keeps it, and the focus Refresh puts on it, while the
  // content changes (round-17/18 reviews). It carries the section's top margin, which the list's
  // `space-y-*` overrides exactly as it did the section's (round-19 review).
  const regionRef = useRef<HTMLElement>(null);
  // Set when a render may remove the element that has keyboard focus inside the section (Refresh
  // takes its own button away; an answer can take a row, Show more or a jump button away). After
  // that render (a layout effect, before paint), focus that fell to <body> goes to the root — so
  // it is never lost, and the old rows are never read out as its content (round-17–22 reviews).
  const focusRootIfLost = useRef(false);
  const holdFocusIfInside = () => {
    if (regionRef.current?.contains(document.activeElement)) focusRootIfLost.current = true;
  };
  // Refresh's own answer was empty: the section the agent was in went, so that is SAID (shown) —
  // until the question changes or matches come back; later re-asks keep it (no "Checking…"
  // flicker each time the list moves). Silence after a Refresh read as "it broke" (round-18/19).
  const refreshPending = useRef(false);
  const [nothingAfterRefresh, setNothingAfterRefresh] = useState(false);
  // An answer the agent is owed in words, not by the section silently going: one to their own
  // Refresh, or any answer while keyboard focus is inside the section — unmounting it would drop
  // focus to <body> (round-21 review).
  const owedAnswer = () =>
    refreshPending.current || regionRef.current?.contains(document.activeElement) === true;
  useLayoutEffect(() => {
    if (!focusRootIfLost.current) return;
    focusRootIfLost.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body) regionRef.current?.focus();
  });
  const clearStale = () => {
    if (staleTimer.current !== null) clearTimeout(staleTimer.current);
    staleTimer.current = null;
  };
  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
      moreAbort.current?.abort();
      clearStale();
      // StrictMode re-runs the effects after this: the question must be asked again then, or the
      // aborted first ask left "Checking…" for good (release review, 2026-11-02).
      askedKey.current = '';
      lastAsked.current = null;
    },
    []
  );

  useEffect(() => {
    // `rows` below is this render's: just cleared for a new question, it still holds the old rows.
    let cleared = false;
    if (shownQuery.current !== queryKey) {
      cleared = true;
      shownQuery.current = queryKey;
      setRows([]);
      setTotal(0);
      setTotalCapped(false);
      setPage(1);
      setLoadingMore(false);
      refreshPending.current = false;
      setNothingAfterRefresh(false);
      // Focus inside (a jump or a filter changed from the keyboard there): the section stays, as
      // "Checking…" for the new question, and focus goes to its root — not to <body> (round-23).
      holdFocusIfInside();
      setStatus(focusRootIfLost.current ? 'loading' : 'idle');
      moreSeq.current += 1;
      // Anything still out for the previous question — a refresh or a "Show more" — is not for
      // this one, even if the agent switches back before it lands (round-10 review): aborted, and
      // an aborted Show more appends nothing (loadMore checks its signal after the read).
      moreAbort.current?.abort();
      inFlight.current?.abort();
      clearStale();
      // The refresh window is per shown question: a new one (or one changed back) asks at once.
      lastAsked.current = null;
      // A new question: whatever was asked before (even this same key, before a change and back
      // while the list was loading) must be asked again (review of #801, probed).
      askedKey.current = '';
    }
    if (!request || !enabled || askedKey.current === requestKey) return undefined;
    const later = (waitMs: number) => {
      const timer = setTimeout(() => {
        askedKey.current = '';
        setRetryTick((tick) => tick + 1);
      }, waitMs);
      return () => clearTimeout(timer);
    };
    const now = Date.now();
    // A question that failed waits FAILED_RETRY_MS, then is asked again on its own — on a quiet
    // inbox nothing else would re-run this (release review).
    if (failedAt.current?.key === queryKey && now - failedAt.current.at < FAILED_RETRY_MS) {
      // Back on a question that FAILED a moment ago: say so until its retry, not silence — read as
      // "nowhere else" (round-24 review). An older backend's quiet window stays quiet, unless an
      // answer is owed (focus inside): then, as for that backend's answer, a failed check — never
      // "Checking…" with nothing asked (round-25 review). (Its rows are already empty.)
      // Otherwise quiet — also over a "Checking…" a question change left while the list loaded
      // (round-26 review): nothing is asked until the window ends.
      setStatus(failedAt.current.failed || owedAnswer() ? 'failed' : 'idle');
      return later(FAILED_RETRY_MS - (now - failedAt.current.at));
    }
    // Once the agent pressed "Show more" for this question, it is not refreshed automatically: a
    // refresh racing the pages the agent asked for broke the list four review rounds running
    // (skipped pages, wiped pages, stray pages). It is asked afresh when the question changes.
    if (lastAsked.current?.key === queryKey && pageRef.current > 1) return undefined;
    // The same question again inside the refresh window: once, at its end.
    if (lastAsked.current?.key === queryKey && now - lastAsked.current.at < REFRESH_MIN_MS) {
      return later(REFRESH_MIN_MS - (now - lastAsked.current.at));
    }
    // The same question is already on its way: its answer is still the right one — let it land,
    // unless it has been out so long it may never answer (then it is replaced, at ASK_STALE_MS).
    const sameOut =
      inFlight.current !== null &&
      !inFlight.current.signal.aborted &&
      inFlightQuery.current === queryKey;
    if (sameOut && now - inFlightAt.current < ASK_STALE_MS) {
      return later(ASK_STALE_MS - (now - inFlightAt.current));
    }
    askedKey.current = requestKey;
    lastAsked.current = { key: queryKey, at: now };
    setMoreFailed(false);
    // Cleared for a new question this run: "Checking…", not silence until the answer (round-17).
    if (cleared || rows.length === 0) setStatus('loading');
    // A different question's answer is no longer wanted: stop it on the server too.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    inFlightQuery.current = queryKey;
    inFlightAt.current = now;
    const failedFor = queryKey;
    const askedRows = requestKey;
    // A "Show more" that adds rows while this is out makes this answer older than the screen.
    const appliedAtAsk = moreApplied.current;
    // An answer is for the QUESTION (search, filters, team, workspace), not for the moment the
    // list rows stood at: matching on requestKey dropped every answer that arrived after any
    // colleague's change, and on a busy inbox the section never left "Checking…" (release review).
    const stillAsked = () => !controller.signal.aborted && shownQuery.current === failedFor;
    const settle = () => {
      if (inFlight.current === controller) {
        inFlight.current = null;
        clearStale();
      }
      // The list's rows moved while this was out: its answer is shown, and the question is asked
      // once more (the refresh window decides when) so the move is reflected.
      if (!controller.signal.aborted && currentKey.current !== askedRows) {
        askedKey.current = '';
        setRetryTick((tick) => tick + 1);
      }
    };
    // A "Show more" added rows while this was out: whatever this answer is (rows, a failure, an
    // older backend), it is older than the screen — keep the rows (rounds 6–11).
    // Dropped, not re-asked: past page 1 nothing refreshes automatically (the page gate).
    const overtaken = () => moreApplied.current !== appliedAtAsk;
    const failed = () => {
      // Only an answer to the question on screen records a failure.
      if (shownQuery.current !== failedFor) return;
      if (overtaken()) return;
      // Only once it will render: a flag left by a dropped answer pulled focus from <body> into
      // the section on a later, unrelated render (round-23 review).
      holdFocusIfInside();
      // The rows are gone: a "Show more" still out would append its page to nothing (round 9).
      rowsEpoch.current += 1;
      setRows([]);
      setStatus('failed');
      // refreshPending is kept: the automatic retry still answers the agent's Refresh.
      askedKey.current = '';
      failedAt.current = { key: failedFor, at: Date.now(), failed: true };
      // Run the effect again so it sets the timer that asks at the end of the window.
      setRetryTick((tick) => tick + 1);
    };
    void messageService
      .getThreads(request, 1, PAGE, undefined, 'time', {
        allowTimedOut: true,
        signal: controller.signal,
      })
      .then((answer) => {
        settle();
        if (!stillAsked()) return;
        if (overtaken()) return;
        holdFocusIfInside(); // after the drops: only an answer that renders (round-23 review)
        if (answer.success && answer.outsideView !== true) {
          // A backend without outsideView: nothing to say, and not asked again for the window.
          // It vouches for nothing, so an earlier "no matches now" goes (round-20 review).
          setNothingAfterRefresh(false);
          // Owed to the agent (their Refresh, or focus inside; a backend rolled back mid-session):
          // said, as a failed check — retried after the window — and the root stays (round-20/21).
          if (owedAnswer()) {
            failed();
            return;
          }
          rowsEpoch.current += 1;
          setRows([]);
          setStatus('idle');
          failedAt.current = { key: failedFor, at: Date.now(), failed: false };
          return;
        }
        const listed = outsideRows(answer);
        if (!listed) {
          // Not finished, failed, or a backend without outsideView: nothing it cannot vouch for,
          // asked again after the window (review of #801).
          failed();
          return;
        }
        if (failedAt.current?.key === failedFor) failedAt.current = null;
        setStatus('done');
        if (listed.length > 0) setNothingAfterRefresh(false);
        else if (owedAnswer()) setNothingAfterRefresh(true);
        refreshPending.current = false;
        // Only ever page 1 (a refresh is asked at page 1, and one a Show more overtook is dropped):
        // a Show more still out keeps a valid offset and is appended after it (round-11 review).
        setRows(listed);
        setTotal(answer.pagination?.total ?? listed.length);
        setTotalCapped(
          answer.pagination?.totalCapped === true || answer.pagination?.countTimedOut === true
        );
      })
      .catch(() => {
        settle();
        if (controller.signal.aborted) return;
        failed();
      });
    // Its own stale timer: on a quiet inbox nothing else re-runs this effect, and an ask that never
    // settles left "Checking…" for good (release review, round 4). Acts only if THIS ask is still out.
    clearStale();
    staleTimer.current = setTimeout(() => {
      staleTimer.current = null;
      if (inFlight.current !== controller) return;
      askedKey.current = '';
      setRetryTick((tick) => tick + 1);
    }, ASK_STALE_MS);
    return undefined;
    // requestKey stands for `request` and everything else that changes the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled, retryTick]);

  // Past page 1 nothing refreshes automatically (the page gate): the agent can, on demand — back to
  // a fresh first page, so rows that stopped matching and an old total do not stay for good
  // (round-15 review).
  const refreshNow = () => {
    // Everything out is cancelled — an older refresh too (it would hold the new ask for up to
    // ASK_STALE_MS) — and the section is cleared to "Checking…": no Show more can be pressed into
    // the middle of it and cancel it (round-16 review).
    // The pressed button goes with the rows: keyboard focus moves to the section's root, which
    // stays mounted through "Checking…" and whatever the fresh answer is (round-17/18 reviews).
    holdFocusIfInside(); // a mouse click in Safari leaves focus where it was (round-25 review)
    refreshPending.current = true;
    inFlight.current?.abort();
    inFlight.current = null;
    moreAbort.current?.abort();
    clearStale();
    moreSeq.current += 1;
    rowsEpoch.current += 1;
    setLoadingMore(false);
    setMoreFailed(false);
    setRows([]);
    setStatus('loading');
    setPage(1);
    lastAsked.current = null;
    askedKey.current = '';
    setRetryTick((tick) => tick + 1);
  };

  const loadMore = async () => {
    if (!request) return;
    // For the QUESTION, as page 1: a colleague's change while it was out dropped it (round 3).
    const askedFor = queryKey;
    const epochAtAsk = rowsEpoch.current;
    const nextPage = page + 1;
    moreSeq.current += 1;
    const seq = moreSeq.current;
    // (Button cancels a press while one is out, so there is never an earlier one to abort here.)
    const moreController = new AbortController();
    moreAbort.current = moreController;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const answer = await messageService.getThreads(request, nextPage, PAGE, undefined, 'time', {
        allowTimedOut: true,
        signal: moreController.signal,
      });
      if (moreController.signal.aborted) return;
      if (shownQuery.current !== askedFor) return;
      // A failure (or an older backend) cleared the rows meanwhile: nothing to append to.
      if (rowsEpoch.current !== epochAtAsk) return;
      const listed = outsideRows(answer);
      if (!listed) {
        setMoreFailed(true);
        return;
      }
      // The last page takes the Show more button away: focus on it goes to the root (round-24).
      holdFocusIfInside();
      // Offset pages shift when a match moves: never the same thread twice.
      setRows((shown) => {
        const seen = new Set(shown.map((thread) => thread.threadId));
        return [...shown, ...listed.filter((thread) => !seen.has(thread.threadId))];
      });
      setPage(nextPage);
      moreApplied.current += 1;
      // Its count is as fresh as any refresh's: a refresh this one overtook is dropped, so the total
      // would otherwise stay as old as the last refresh that applied (round-7 review).
      // Only when this answer carries a count — never clear a capped flag it says nothing about.
      if (typeof answer.pagination?.total === 'number') {
        setTotal(answer.pagination.total);
        setTotalCapped(
          answer.pagination.totalCapped === true || answer.pagination.countTimedOut === true
        );
      }
    } catch {
      // Aborted (question change, unmount, Refresh): not a failure.
      if (!moreController.signal.aborted && shownQuery.current === askedFor) setMoreFailed(true);
    } finally {
      // A refresh during "Show more" left the button on "Loading…" for good; an older one settling
      // must not clear a newer one's spinner.
      if (moreSeq.current === seq) setLoadingMore(false);
    }
  };

  if (!search) return null;
  // The named region itself is the focus target (named for a screen reader; no ring of its own,
  // like the app's other script-focused containers — round-24 review).
  const region = (content: ReactNode) => (
    <section
      ref={regionRef}
      tabIndex={-1}
      aria-label="Also found in other views"
      className="mt-4 focus:outline-none"
    >
      {content}
    </section>
  );
  if (rows.length === 0) {
    // Silence here read as "not anywhere else" — the screen of the original complaint, an empty
    // view the agent took for "not in Odly". Say that other views are being checked, or could not
    // be (release review, 2026-11-02). Done with no rows: nothing elsewhere to show — said only
    // when it answers the agent's own Refresh.
    if (nothingAfterRefresh && status !== 'failed') {
      return region(
        <div className="px-1" role="status">
          <Typography variant="caption" color="muted">
            No matches in other views for this search now.
          </Typography>
        </div>
      );
    }
    if (status === 'loading') {
      return region(
        <div className="flex items-center gap-2 px-1" role="status">
          <Spinner size={12} />
          <Typography variant="caption" color="muted">
            Checking other views for this search…
          </Typography>
        </div>
      );
    }
    if (status === 'failed') {
      return region(
        <div className="px-1" role="status">
          <Typography variant="caption" color="muted">
            Other views could not be checked for this search just now. Trying again shortly.
          </Typography>
        </div>
      );
    }
    return null;
  }

  // Groups in the order their first match arrived (the list's own order).
  const groups = new Map<string, MessageThread[]>();
  for (const thread of rows) {
    const place = thread.foundIn as string;
    groups.set(place, [...(groups.get(place) ?? []), thread]);
  }
  // A group's own count is exact only once every match is loaded.
  const allLoaded = !totalCapped && rows.length >= total;

  return region(
    <div>
      <div className="flex gap-2 items-baseline px-1 mb-2">
        <Typography variant="label">Also found in other views</Typography>
        <Typography variant="caption" color="muted" className="font-mono">
          {formatTotal(total, totalCapped)}
        </Typography>
        {page > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={refreshNow}
            aria-label="Refresh matches in other views"
          >
            Refresh
          </Button>
        )}
      </div>
      <Card padding="none" className="overflow-hidden">
        {[...groups].map(([place, threads]) => {
          const jump = scopeReasonJump(place as Place);
          const title = placeTitle(place);
          return (
            <div key={place} className="border-t first:border-t-0 border-border">
              <div className="flex gap-2.5 items-center px-4 h-[34px] bg-raised">
                <h3>
                  <Typography variant="body3" weight="semibold">
                    {title}
                  </Typography>
                  {allLoaded && (
                    <>
                      {' '}
                      <Typography variant="caption" color="muted" className="font-mono">
                        {threads.length}
                      </Typography>
                    </>
                  )}
                </h3>
                {jump && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7"
                    // Contains the visible words (WCAG 2.5.3), so "Show in that view" works by voice.
                    aria-label={`Show in that view: ${title}`}
                    onClick={() =>
                      onJump(
                        {
                          ...LENS_RESET,
                          negate: negateKeptByJump(filters.negate),
                          ...jump.filters,
                          search,
                        },
                        jump.needsListView
                      )
                    }
                  >
                    Show in that view
                  </Button>
                )}
              </div>
              {threads.map((thread) => (
                <MessageListItem
                  key={thread.threadId}
                  thread={thread}
                  density="compact"
                  onOpen={onOpen}
                  highlightTerms={highlightTerms}
                />
              ))}
            </div>
          );
        })}
      </Card>
      {(rows.length < total || totalCapped) && (
        <div className="flex gap-3 justify-center items-center mt-2">
          {moreFailed && (
            <Typography variant="caption" color="muted">
              Could not load more — try again.
            </Typography>
          )}
          {/* While loading, Button keeps it focusable (aria-disabled, not `disabled`) and
              cancels a press: keyboard focus stays on it (staging, Chrome, 2026-11-03). */}
          <Button
            variant="outline"
            size="sm"
            isLoading={loadingMore}
            onClick={() => void loadMore()}
          >
            Show more
            {totalCapped ? '' : ` (${(total - rows.length).toLocaleString()})`}
          </Button>
        </div>
      )}
    </div>
  );
};
