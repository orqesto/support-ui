/**
 * Taco, 2026-09-23: during a 2,287-message Gmail import the progress widget's numbers "jumped",
 * and when the run stopped under load it closed as "Complete — Processed 0". Three causes, each
 * pinned here:
 *  1. Knowledge-base progress overwrote Found/Processed on a session an email fetch was driving,
 *     so the fetch and the KB stream took turns writing the same tiles.
 *  2. "Stale" was measured from the session's CREATION, so any run older than a minute reset its
 *     counters on the next total change.
 *  3. A run that DEFERRED under load was shown as complete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { useEmailProcessingSessions } from '@/hooks/useEmailProcessingSessions';
import { makeKBHandlers } from '@/hooks/useEmailProcessingKBHandlers';

const handlers = new Map<string, (data: unknown) => void>();
// ONE socket object: the hook stores it in state on every effect run, and a fresh object per call
// re-renders forever.
const SOCKET = {};
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => SOCKET,
  subscribeToEvent: (event: string, callback: (data: unknown) => void) => {
    handlers.set(event, callback);
  },
  unsubscribeFromEvent: () => undefined,
  releaseSocket: () => undefined,
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { useEmailProcessingSocket } = await import('@/hooks/useEmailProcessingSocket');
const { MessageProcessingProgress } = await import(
  '@/components/messages/MessageProcessingProgress'
);

type Sessions = Map<string, ProcessingSession>;

const fetchSession = (over: Partial<ProcessingSession> = {}): ProcessingSession => ({
  sessionKey: '68',
  integrationId: 68,
  integrationName: 'Gmail-orders',
  status: 'processing',
  stage: 'kb-processing',
  total: 2287,
  current: 0,
  processed: 300,
  failed: 0,
  isProcessing: true,
  progress: 0,
  timestamp: Date.now(),
  hasEmailFetch: true,
  ...over,
});

const kbEvent = (processed: number) => ({
  messageSourceId: 68,
  status: 'processing',
  messageSourceName: 'Gmail-orders',
  progress: 1,
  messages: { total: 1859, processed, successful: processed, failed: 0, skipped: 0 },
});

/** Run a KB handler against one session and return the session it produced. */
const applyKB = (session: ProcessingSession, event: unknown): ProcessingSession => {
  let state: Sessions = new Map([[session.sessionKey, session]]);
  const setSessions = (update: Sessions | ((prev: Sessions) => Sessions)) => {
    state = typeof update === 'function' ? update(state) : update;
  };
  makeKBHandlers({ setSessions: setSessions as never }).handleKBProgress(event);
  return state.get(session.sessionKey) as ProcessingSession;
};

describe('1. KB progress does not overwrite the fetch counters', () => {
  it('keeps Found/Processed for the email fetch; KB numbers go to the kb* fields', () => {
    const after = applyKB(fetchSession(), kbEvent(13));
    expect(after.total).toBe(2287);
    expect(after.processed).toBe(300);
    expect(after.kbMessagesTotal).toBe(1859);
    expect(after.kbMessagesProcessed).toBe(13);
  });

  it('CONTROL — a standalone KB session (no fetch behind it) still shows KB numbers on top', () => {
    const after = applyKB(fetchSession({ hasEmailFetch: false }), kbEvent(13));
    expect(after.total).toBe(1859);
    expect(after.processed).toBe(13);
  });

  it('a found event marks the session as fetch-driven — the flag the KB rule reads', () => {
    const { fire, session } = mountSocket(fetchSession({ hasEmailFetch: undefined }));
    fire({
      type: 'found',
      integrationId: 68,
      integrationName: 'Gmail-orders',
      data: { total: 2287, found: 300 },
    });
    expect(session().hasEmailFetch).toBe(true);
    expect(applyKB(session(), kbEvent(13)).total).toBe(2287);
  });

  it('stamps when the session last changed', () => {
    const after = applyKB(fetchSession(), kbEvent(13));
    expect(after.updatedAt).toBeGreaterThan(0);
  });
});

/** Mount the socket hook on a live session map and hand back a way to fire events at it. */
const mountSocket = (initial: ProcessingSession) => {
  handlers.clear();
  let state: Sessions = new Map([[initial.sessionKey, initial]]);
  const setSessions = (update: Sessions | ((prev: Sessions) => Sessions)) => {
    state = typeof update === 'function' ? update(state) : update;
  };
  // Stable references, as React's real setters are — they are the effect's dependencies.
  const setState = vi.fn();
  renderHook(() =>
    useEmailProcessingSocket({
      enabled: true,
      setSessions: setSessions as never,
      setState: setState as never,
    })
  );
  const fire = (event: unknown) => act(() => handlers.get('email:processing')?.(event));
  return { fire, session: () => state.get(initial.sessionKey) as ProcessingSession };
};

const processingEvent = (total: number, current: number) => ({
  type: 'processing',
  integrationId: 68,
  integrationName: 'Gmail-orders',
  data: { total, current, status: 'analyzing' },
});

describe('2. a long run is not "stale" while events keep arriving', () => {
  it('does NOT reset an import created 5 min ago that was updated 10 s ago', () => {
    const now = Date.now();
    const { fire, session } = mountSocket(
      fetchSession({ stage: 'analyzing', timestamp: now - 5 * 60_000, updatedAt: now - 10_000 })
    );
    fire(processingEvent(2487, 40));
    // A reset would rebuild the session and drop the fetch flag and the processed count.
    expect(session().processed).toBe(300);
    expect(session().hasEmailFetch).toBe(true);
  });

  it('CONTROL — a session silent for 2 min IS treated as left over and reset', () => {
    const now = Date.now();
    const { fire, session } = mountSocket(
      fetchSession({ stage: 'analyzing', timestamp: now - 5 * 60_000, updatedAt: now - 120_000 })
    );
    fire(processingEvent(2487, 40));
    expect(session().hasEmailFetch).toBeUndefined();
  });
});

describe('3. a deferred run is shown as paused, not complete', () => {
  it('carries deferred from the complete event onto the session', () => {
    const { fire, session } = mountSocket(fetchSession());
    fire({
      type: 'complete',
      integrationId: 68,
      integrationName: 'Gmail-orders',
      data: { total: 2487, processed: 0, deferred: true },
    });
    expect(session().status).toBe('complete');
    expect(session().deferred).toBe(true);
  });

  it('a finished run is not marked deferred (and an older BE sends no flag at all)', () => {
    const { fire, session } = mountSocket(fetchSession());
    fire({
      type: 'complete',
      integrationId: 68,
      integrationName: 'Gmail-orders',
      data: { total: 5, processed: 5 },
    });
    expect(session().deferred).toBe(false);
  });

  describe('the widget', () => {
    beforeEach(() => localStorage.clear());
    afterEach(cleanup);

    const done = (deferred: boolean) =>
      fetchSession({
        status: 'complete',
        isProcessing: false,
        total: 2487,
        processed: 0,
        deferred,
      });

    it('says Paused and how much is saved', () => {
      render(<MessageProcessingProgress session={done(true)} index={0} onClose={vi.fn()} />);
      expect(screen.getByText('Paused')).toBeTruthy();
      expect(screen.queryByText('Complete')).toBeNull();
      expect(screen.getByText(/0 of 2487 saved so far/)).toBeTruthy();
      expect(screen.queryByText(/Processed 0/)).toBeNull();
    });

    it('CONTROL — a finished run still says Complete', () => {
      render(<MessageProcessingProgress session={done(false)} index={0} onClose={vi.fn()} />);
      expect(screen.getByText('Complete')).toBeTruthy();
      expect(screen.queryByText('Paused')).toBeNull();
    });
  });
});

describe('the 20-minute stuck check reads the LAST event, not creation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const withSession = (session: ProcessingSession) => {
    const { result } = renderHook(() => useEmailProcessingSessions({ setState: vi.fn() as never }));
    act(() => result.current.setSessions(new Map([[session.sessionKey, session]])));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    return result.current.sessions.get(session.sessionKey) as ProcessingSession;
  };

  it('an import started 25 min ago but updated a minute ago is not stuck', () => {
    const now = Date.now();
    const after = withSession(
      fetchSession({ timestamp: now - 25 * 60_000, updatedAt: now - 60_000 })
    );
    expect(after.status).toBe('processing');
  });

  it('CONTROL — one silent for 25 min is', () => {
    const now = Date.now();
    const after = withSession(
      fetchSession({ timestamp: now - 25 * 60_000, updatedAt: now - 25 * 60_000 })
    );
    expect(after.status).toBe('error');
  });
});
