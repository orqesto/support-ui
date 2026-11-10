import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import type { PresenceSettings } from '../presence.types';
import {
  computePresenceState,
  HIDDEN_AWAY_MS,
  usePresenceReporter,
  type PresenceReporterInput,
} from '../usePresenceReporter';

const SETTINGS: PresenceSettings = {
  enabled: true,
  heartbeatMs: 15_000,
  expiryMs: 45_000,
  writingIdleMs: 120_000,
  awayAfterMs: 300_000,
  listFlushMs: 2_000,
  ticketWatchCap: 50,
};
const NOW = 1_000_000_000;

const base = {
  composerText: '',
  composerMode: 'reply' as const,
  lastAgentEditAt: null as number | null,
  hiddenSince: null as number | null,
  lastInputAt: NOW,
  settings: SETTINGS,
};

describe('computePresenceState — the rules of spec §5.1', () => {
  it('an open thread with an empty composer is viewing', () => {
    expect(computePresenceState(base, NOW)).toBe('viewing');
  });

  it('typing in reply mode ⇒ writing_reply', () => {
    const typed = { ...base, composerText: '<p>Hello</p>', lastAgentEditAt: NOW - 1_000 };
    expect(computePresenceState(typed, NOW)).toBe('writing_reply');
  });

  it('the same words in note mode ⇒ writing_note', () => {
    const typed = {
      ...base,
      composerText: '<p>Hello</p>',
      composerMode: 'note' as const,
      lastAgentEditAt: NOW - 1_000,
    };
    expect(computePresenceState(typed, NOW)).toBe('writing_note');
  });

  it('a draft left alone longer than writingIdleMs drops back to viewing', () => {
    const idle = {
      ...base,
      composerText: '<p>Hello</p>',
      lastAgentEditAt: NOW - SETTINGS.writingIdleMs - 1,
      lastInputAt: NOW,
    };
    expect(computePresenceState(idle, NOW)).toBe('viewing');
  });

  it('CONTROL: a draft edited just inside writingIdleMs is still writing', () => {
    const recent = {
      ...base,
      composerText: '<p>Hello</p>',
      lastAgentEditAt: NOW - SETTINGS.writingIdleMs,
    };
    expect(computePresenceState(recent, NOW)).toBe('writing_reply');
  });

  it('text the agent never edited (no agent edit time) is not writing', () => {
    expect(computePresenceState({ ...base, composerText: '<p>Hello</p>' }, NOW)).toBe('viewing');
  });

  it('a blank composer is not writing, even right after an edit', () => {
    const cleared = { ...base, composerText: '<p></p>', lastAgentEditAt: NOW };
    expect(computePresenceState(cleared, NOW)).toBe('viewing');
  });

  it('a tab hidden for more than 60 s is away — and away wins over writing', () => {
    const hidden = {
      ...base,
      composerText: '<p>Hello</p>',
      lastAgentEditAt: NOW - 1_000,
      hiddenSince: NOW - HIDDEN_AWAY_MS - 1,
    };
    expect(computePresenceState(hidden, NOW)).toBe('away');
  });

  it('CONTROL: hidden for exactly 60 s is not away yet', () => {
    expect(computePresenceState({ ...base, hiddenSince: NOW - HIDDEN_AWAY_MS }, NOW)).toBe(
      'viewing'
    );
  });

  it('no pointer or key input for awayAfterMs is away', () => {
    const quiet = { ...base, lastInputAt: NOW - SETTINGS.awayAfterMs - 1 };
    expect(computePresenceState(quiet, NOW)).toBe('away');
  });
});

const inputOf = (over: Partial<PresenceReporterInput> = {}): PresenceReporterInput => ({
  composerText: '',
  composerMode: 'reply',
  lastAgentEditAt: { current: null },
  ...over,
});

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  useAuthStore.setState({ user: { id: 1, role: 'user' } as User });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('usePresenceReporter — the state of this tab, kept current', () => {
  it('typing in reply ⇒ writing_reply; switching to note ⇒ writing_note', () => {
    const edit = { current: null as number | null };
    const { result, rerender } = renderHook(
      (props: PresenceReporterInput) => usePresenceReporter(props, SETTINGS),
      { initialProps: inputOf({ lastAgentEditAt: edit }) }
    );
    expect(result.current).toBe('viewing');

    edit.current = Date.now();
    rerender(inputOf({ composerText: '<p>Hi</p>', lastAgentEditAt: edit }));
    expect(result.current).toBe('writing_reply');

    rerender(inputOf({ composerText: '<p>Hi</p>', composerMode: 'note', lastAgentEditAt: edit }));
    expect(result.current).toBe('writing_note');
  });

  it('a draft left idle drops back to viewing on its own (no re-render from the caller)', () => {
    const edit = { current: Date.now() };
    const { result } = renderHook(() =>
      usePresenceReporter(inputOf({ composerText: '<p>Hi</p>', lastAgentEditAt: edit }), SETTINGS)
    );
    expect(result.current).toBe('writing_reply');
    // Keep the agent active so only the idle rule moves.
    for (let elapsed = 0; elapsed <= SETTINGS.writingIdleMs; elapsed += 60_000) {
      act(() => {
        vi.advanceTimersByTime(60_000);
        document.dispatchEvent(new Event('pointerdown'));
      });
    }
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe('viewing');
  });

  it('hidden > 60 s ⇒ away; visible again ⇒ viewing at once', () => {
    const { result } = renderHook(() => usePresenceReporter(inputOf(), SETTINGS));
    act(() => setVisibility('hidden'));
    act(() => {
      vi.advanceTimersByTime(HIDDEN_AWAY_MS - 1_000);
    });
    expect(result.current).toBe('viewing');
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe('away');
    act(() => setVisibility('visible'));
    expect(result.current).toBe('viewing');
  });

  it('no input for awayAfterMs ⇒ away; a key press brings it back', () => {
    const { result } = renderHook(() => usePresenceReporter(inputOf(), SETTINGS));
    act(() => {
      vi.advanceTimersByTime(SETTINGS.awayAfterMs + 1_000);
    });
    expect(result.current).toBe('away');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(result.current).toBe('viewing');
  });

  it('a global admin never reports a state', () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } as User });
    const { result } = renderHook(() => usePresenceReporter(inputOf(), SETTINGS));
    expect(result.current).toBeNull();
  });

  it('no reporter input (a list view) reports nothing', () => {
    const { result } = renderHook(() => usePresenceReporter(undefined, SETTINGS));
    expect(result.current).toBeNull();
  });

  it('removes its document listeners on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => usePresenceReporter(inputOf(), SETTINGS));
    unmount();
    const removed = remove.mock.calls.map(([name]) => name);
    expect(removed).toEqual(expect.arrayContaining(['visibilitychange', 'pointerdown', 'keydown']));
  });
});
