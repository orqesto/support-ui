import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import {
  customApiLookupService,
  type CustomApiLookupResult,
  type LookupRequest,
  type LookupSurface,
  type RunnableLookup,
} from '@/features/custom-api/services/customApiLookup.service';
import {
  CONTACT_NOT_VISIBLE,
  CONVERSATION_NOT_VISIBLE,
} from '@/features/custom-api/lib/customApiLookupText';
import {
  clearLookupCache,
  inFlightLookup,
  lookupCacheKey,
  readLookupCache,
  trackInFlightLookup,
  writeLookupCache,
} from '@/lib/lookupResultCache';

/**
 * State for the custom-API lookup panel (CA-3).
 *
 * ⛔ THE HOOK NEVER FETCHES ON ITS OWN. N enabled endpoints must not become N outbound calls to a
 * client's vendor every time any agent opens any thread (SC1). #920 (owner 2026-11-11) changed SC1
 * for the thread's LOOKUPS TAB only: the panel there calls `runOrReuse` when the tab is shown (its
 * mount), not when the thread opens — and a fresh cached result (lookupResultCache, 5 min) is reused
 * without a call. The contact drawer and the records page stay press-only.
 *
 * `hasRun` distinguishes "nobody has asked yet" from "asked, and there is nothing" — the panel
 * must not show an empty state that reads like a failed lookup before anyone pressed anything.
 */
const AVAILABILITY_KEY = 'custom-api-lookup-availability';

/**
 * Should the lookup panel render at all? (Release blocker, 2026-09-19.)
 *
 * The panel used to render on EVERY thread and EVERY contact in every workspace, and only stood
 * down after a press came back 404. On a backend that has the route, a workspace with nothing
 * configured instead answered "No integrations are set up for this workspace yet" — a dead
 * control shown to every client, with no screen yet to set one up. So the panel now asks first.
 *
 * ⛔ FAILS CLOSED. Loading, `available: false`, a 404 (an OLDER backend without this route — the
 * frontend ships from `main` independently of the backend tag) and any other error ALL render
 * nothing. The cost of a false "no" is a hidden button; the cost of a false "yes" is the dead
 * control this exists to remove.
 *
 * Keyed on org AND user AND surface: the answer depends on the caller's department scope (D26)
 * and on where each lookup declared it renders (D15). Cached for five minutes and deduped across
 * every panel on screen; never polled. `retry: false` because a 404 is an answer, not a blip.
 */
export function useCustomApiLookupAvailability(surface: LookupSurface): boolean {
  return useCustomApiLookupAvailabilityState(surface) === 'available';
}

/**
 * Availability with its REASON (2026-10-14). `not_on_server` is the one case the panel names: the
 * availability route itself 404s, i.e. this backend predates lookups. Everything else that is not
 * a yes — loading, `available: false`, a 400 or any other error — still renders nothing (fails
 * closed, unchanged). A press that 404s is NOT this: see `useCustomApiLookup`.
 */
export type LookupAvailability = 'loading' | 'available' | 'none' | 'not_on_server';

export function useCustomApiLookupAvailabilityState(surface: LookupSurface): LookupAvailability {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { data, error, isError } = useQuery({
    queryKey: [AVAILABILITY_KEY, orgId, userId, surface],
    queryFn: () => customApiLookupService.availability(surface),
    enabled: orgId !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (isError) return getErrorStatus(error) === 404 ? 'not_on_server' : 'none';
  if (data === undefined) return 'loading';
  return data ? 'available' : 'none';
}

/**
 * HOW MANY lookups a press on this surface could run for this caller — the Lookups tab's badge
 * (design v3; owner, 2026-09-23). `GET /lookup/options` (CA-6) is the SAME selection as the press
 * and as availability (`eligibleEndpoints` + `isPanelRunnable`), so the number cannot promise a
 * lookup the panel would not run. Configuration only: no vendor call, no customer named (SC1).
 *
 * ⚠️ Per workspace and user, NOT per thread — the number reads the same on every thread. That is
 * what it means: "this many connected systems can be asked about this customer".
 *
 * ⛔ FAILS CLOSED like availability: loading, error and a backend without the route are `null`,
 * and the caller renders nothing. Nested under AVAILABILITY_KEY on purpose, so the settings
 * screen's invalidation (below) refreshes the count along with the yes/no.
 */
export function useCustomApiLookupCount(surface: LookupSurface): number | null {
  const options = useCustomApiLookupOptions(surface);
  return options ? options.length : null;
}

/**
 * The lookups a press on this surface could run for this caller (CA-6 `GET /lookup/options`).
 * ONE query shared by the badge count and the tab name (spec 2026-10-09) — the key is the one the
 * count always used, so nothing new is requested and the settings screen's invalidation still
 * refreshes it. Fails closed: loading, error, older backend ⇒ null.
 */
export function useCustomApiLookupOptions(surface: LookupSurface): RunnableLookup[] | null {
  const { data } = useLookupOptionsQuery(surface);
  return Array.isArray(data) ? data : null;
}

/**
 * Whether the options query has ANSWERED — succeeded or failed — for this surface. The lookups
 * tab waits for it, so its name is final when it first appears (final review #4, 2026-10-09: it
 * showed "Lookups", then renamed itself "Orders"). A failure counts as an answer: the tab then
 * shows as "Lookups" rather than never.
 */
export function useCustomApiLookupOptionsSettled(surface: LookupSurface): boolean {
  const { isSuccess, isError } = useLookupOptionsQuery(surface);
  return isSuccess || isError;
}

function useLookupOptionsQuery(surface: LookupSurface) {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return useQuery({
    queryKey: [AVAILABILITY_KEY, 'options', orgId, userId, surface],
    queryFn: () => customApiLookupService.lookupOptions(surface),
    enabled: orgId !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/**
 * Drop the cached "is there a lookup here?" answer, for CA-5's settings screen to call after a
 * write that can change it. (Audit, 2026-09-19.)
 *
 * ⛔ WITHOUT THIS, CONFIGURING A LOOKUP DID NOTHING FOR FIVE MINUTES. The availability answer is
 * cached for five minutes (above), and an admin who had just created the first lookup went to a
 * thread and found no panel — the cached "no" from before the save was still being served. So
 * every SUCCESSFUL create or update calls this, because either can change what exists; a failed
 * write changed nothing and must not.
 *
 * ⚠️ The settings screen has no enabled, department or surface control today. Any future control
 * that can disable a lookup or move it between departments or surfaces changes availability too,
 * and must call this after its successful write.
 *
 * Invalidates every org/user/surface under the key: the admin cannot know which surfaces or
 * departments a change touched, and one refetch per mounted panel is cheap.
 *
 * ⚠️ Not called after Send test or a pasted sample: those READ the vendor and do not change
 * availability. (The wizard's own save-before-test does, and calls it from that write.)
 */
export function useInvalidateCustomApiAvailability(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY] });
    // #920: results cached from before the change may show a lookup that is gone or changed.
    clearLookupCache();
  }, [queryClient]);
}

export function useCustomApiLookup(
  target: Pick<LookupRequest, 'conversationId' | 'contactId'> & {
    /** The customer email the panel names: part of the cache key, so a re-linked thread misses. */
    customerEmail?: string;
    /** The lookups' config version (lookupConfigVersionOf): a changed lookup misses the cache. */
    configVersion?: string;
  }
) {
  const [results, setResults] = useState<CustomApiLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  /** When the results on screen were looked up (ISO); null with `hasRun` false. The "ran …" hint. */
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The email the backend CONFIRMED the current results were looked up as; null = the customer. */
  const [lookedUpAs, setLookedUpAs] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { conversationId, contactId } = target;
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const userId = useAuthStore((state) => state.user?.id ?? null);
  // The lookup cache (#920): the THREAD surface only, per workspace + user + thread + customer.
  const cacheKey = lookupCacheKey(
    orgId,
    userId,
    conversationId,
    `${target.customerEmail ?? ''}#${target.configVersion ?? ''}`
  );
  /**
   * ⛔ A PRESS ANSWERS FOR THE CUSTOMER IT WAS MADE ON, OR NOT AT ALL. The reset below clears the
   * panel when the agent moves on, but a `run()` already in flight used to land AFTER that reset —
   * press on conversation 1, open conversation 2, and conversation 1's orders rendered in 2's
   * panel, labelled as 2's (audit 2026-09-19, reproduced with renderHook). Every change of target
   * bumps this generation; a run captures it at the press and drops its response — success AND
   * error, and its `loading` too — when the generation has moved. Stale responses touch no state.
   */
  const generation = useRef(0);

  /**
   * ⛔ CLEAR WHEN THE CUSTOMER CHANGES. Audit pass 5: the results live in state, and nothing reset
   * them when the agent moved to another thread — so one customer's order numbers, statuses and
   * totals could sit in the panel under a DIFFERENT customer's conversation, labelled as theirs.
   * That is the D35 failure arriving through the UI instead of the API.
   *
   * ⚠️ This effect CLEARS, it never fetches. An effect that fetched would break SC1 — N enabled
   * endpoints must not become N outbound calls every time an agent opens a thread.
   */
  useEffect(() => {
    generation.current += 1;
    setResults([]);
    // A press still in flight for the previous customer will drop its own `finally`, so the
    // spinner it started is cleared here — otherwise it would stick on the new thread for ever.
    setLoading(false);
    setHasRun(false);
    setRanAt(null);
    setError(null);
    setLookedUpAs(null);
  }, [conversationId, contactId]);

  const run = useCallback(
    async (
      manual?: { endpointId: number; parameter: string },
      /** Run as this typed email instead of the ticket's customer; omitted = the customer. */
      lookupEmail?: string,
      /** #920: only these HTTP methods (the tab's automatic run sends ['GET']). */
      methods?: string[]
    ) => {
      // ⛔ THE LATEST RUN WINS (review of #920): a run still answering — the tab's automatic one, or
      // an earlier press — is superseded, so it cannot replace a typed-email run's cards or clear
      // its spinner. The generation also moves when the customer changes (the effect above).
      generation.current += 1;
      const pressedFor = generation.current;
      // Joining a run still answering is only for the SAME run: a press (every method) never joins
      // the tab's GET-only run, or the POST lookups would never run despite the press (8b review).
      const inFlightKey = cacheKey ? `${cacheKey}|${methods ? methods.join(',') : 'ALL'}` : null;
      const isStale = () => generation.current !== pressedFor;
      setLoading(true);
      setError(null);
      try {
        // The ordinary press keeps its old path untouched; only a typed email needs the backend's
        // confirmation, so only that press asks for it.
        const response = lookupEmail
          ? await customApiLookupService.runDetailed({
              conversationId,
              contactId,
              ...manual,
              lookupEmail,
            })
          : {
              // A run for the CUSTOMER (full, not one endpoint) is shared while it answers: the tab
              // reopened meanwhile (or a development double-mount) joins it rather than calling the
              // vendor again. "Look up again" is disabled while one answers, so a press always calls.
              results: await (manual
                ? customApiLookupService.run({ conversationId, contactId, ...manual })
                : (inFlightLookup<CustomApiLookupResult>(inFlightKey) ??
                  trackInFlightLookup(
                    inFlightKey,
                    customApiLookupService.run({
                      conversationId,
                      contactId,
                      ...(methods ? { methods } : {}),
                    })
                  ))),
              lookedUpAs: null,
            };
        if (isStale()) return;
        // ⛔ ASKED AS SOMEONE, ANSWERED FOR THE CUSTOMER: an older backend ignored the email. Showing
        // those rows under a "results for <typed email>" banner would put one person's orders under
        // another's name — so they are not shown, and the agent is told why.
        if (lookupEmail && response.lookedUpAs !== lookupEmail) {
          setResults([]);
          setLookedUpAs(null);
          setHasRun(false);
          setRanAt(null);
          setError('This server cannot look up another email yet.');
          return;
        }
        setLookedUpAs(response.lookedUpAs);
        const data = response.results;
        // A manual re-run answers for ONE endpoint; merge it over the existing cards rather than
        // replacing them, or looking up an order number would blank every other integration.
        const now = new Date().toISOString();
        // Kept for the tab's next opening (#920) — only what was looked up FOR THE CUSTOMER (a run as
        // a typed email is about someone else), and never with a failed lookup in it.
        const cacheable = (cards: CustomApiLookupResult[]) =>
          !lookupEmail && !response.lookedUpAs && !cards.some((card) => card.status === 'failed');
        // ⛔ A FULL run is cached HERE, not in the state update: if the agent left the tab before a
        // slow vendor answered, React drops that update — and the next opening would call again
        // (8b review F1). A merged one-lookup re-run needs the cards on screen, so it is cached in
        // the update (it can only happen while the panel is open).
        if (!manual && cacheable(data)) writeLookupCache(cacheKey, data, now);
        setResults((previous) => {
          if (!manual) return data;
          const next = previous.map(
            (card) => data.find((row) => row.endpointId === card.endpointId) ?? card
          );
          if (cacheable(next)) writeLookupCache(cacheKey, next, now);
          return next;
        });
        setHasRun(true);
        setRanAt(now);
        // The press is the freshest evidence there is. A full run that found NOTHING to run means
        // the cached "available" is stale (an admin disabled the last lookup since): refetch it so
        // the panel stands down, rather than keep offering a button that does nothing.
        if (!manual && data.length === 0) {
          void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY] });
        }
      } catch (err) {
        if (isStale()) return;
        // ⛔ `getErrorStatus`, never `err.response.status`. The api-client interceptor builds a
        // FRESH Error with `status` copied onto it and `.response` dropped entirely, so reading the
        // axios shape here type-checks, looks right and NEVER MATCHES — which is how nine call
        // sites once turned real 403s and 429s into generic "something went wrong" copy. This hook
        // had the same bug until `errorShape.test.ts` caught it.
        const status = getErrorStatus(err);
        if (status === 404) {
          // 2026-10-14: a press 404 is the D28 gate — this caller cannot open this conversation (or
          // contact). "Not on this server" is decided by the availability route alone (the skew
          // window is handled there: an older backend 404s that route before anyone can press).
          setError(conversationId ? CONVERSATION_NOT_VISIBLE : CONTACT_NOT_VISIBLE);
        } else {
          // ⛔ SHOW WHAT THE BACKEND SAID. A hardcoded string throws away a reason the agent could
          // act on — "the vendor rejected our credentials" becomes "something went wrong", which is
          // the failure `errorShape.test.ts` exists to prevent and which it caught here.
          setError(getApiErrorMessage(err) ?? 'The lookup could not be completed.');
        }
      } finally {
        if (!isStale()) setLoading(false);
      }
    },
    [conversationId, contactId, queryClient, cacheKey]
  );

  /**
   * The Lookups tab's automatic run (#920): show this thread's results from the last five minutes if
   * there are any — no vendor call — otherwise run for the customer. "Look up again" is `run`.
   */
  const runOrReuse = useCallback(
    async (methods?: string[]) => {
      const cached = readLookupCache<CustomApiLookupResult>(cacheKey);
      if (cached) {
        generation.current += 1;
        setResults(cached.results);
        setHasRun(true);
        setRanAt(cached.ranAt);
        setError(null);
        setLookedUpAs(null);
        setLoading(false);
        return;
      }
      // No fresh result: run — which joins a run still answering for this customer, if any.
      await run(undefined, undefined, methods);
    },
    [cacheKey, run]
  );

  return { results, loading, hasRun, ranAt, error, run, runOrReuse, lookedUpAs };
}
