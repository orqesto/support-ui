import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const handlers = vi.hoisted(() => new Map<string, (data: unknown) => void>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));

const { useConversationNotesRefresh, CONV_NOTES_REFRESH_MS } = await import(
  '../useConversationNotesRefresh'
);
const fire = (conversationId: number, noteId: number, action = 'created') =>
  handlers.get('conv:notes_changed')?.({ organizationId: 7, conversationId, noteId, action });

const nothingKnown = () => false;

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useConversationNotesRefresh — a colleague's note shows without a reload", () => {
  it("a colleague's new note on THIS thread re-reads the notes", () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNotesRefresh(41, nothingKnown, refresh));
    fire(41, 900);
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a note on another thread does nothing', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNotesRefresh(41, nothingKnown, refresh));
    fire(42, 900);
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS * 4);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('the echo of our own note (already on screen) adds no second read', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNotesRefresh(41, (noteId) => noteId === 900, refresh));
    fire(41, 900);
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS * 4);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('an edit or delete of a note on screen still re-reads (the event carries no text)', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNotesRefresh(41, (noteId) => noteId === 900, refresh));
    fire(41, 900, 'updated');
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS);
    fire(41, 900, 'deleted');
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  // The real order (review 2026-11-01): the backend emits before it answers the add, so the echo
  // arrives while the note is NOT yet on screen; the add's own re-read shows it moments later.
  it('our own echo, arriving before our re-read shows the note, still adds no read', () => {
    const refresh = vi.fn();
    const onScreen = new Set<number>();
    renderHook(() => useConversationNotesRefresh(41, (noteId) => onScreen.has(noteId), refresh));
    fire(41, 900);
    vi.advanceTimersByTime(150);
    onScreen.add(900); // the add's own GET landed
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('two notes inside the window ⇒ one re-read', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNotesRefresh(41, nothingKnown, refresh));
    fire(41, 900);
    vi.advanceTimersByTime(200);
    fire(41, 901);
    vi.advanceTimersByTime(CONV_NOTES_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
