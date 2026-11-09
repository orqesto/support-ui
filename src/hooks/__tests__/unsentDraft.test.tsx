/**
 * Owner, 2026-11-09: text typed in an editor was lost when the panel closed, the page changed or a
 * phone browser killed the background tab. useUnsentDraft keeps it in this browser per user,
 * workspace and place, and hands it back when the place opens again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUnsentDraft } from '@/hooks/useUnsentDraft';
import {
  UNSENT_DRAFT_TTL_MS,
  resetUnsentDraftPruneForTests,
  unsentDraftKey,
  writeUnsentDraft,
} from '@/lib/unsentDrafts';
import { isBlankRichText } from '@/lib/stripHtml';
import type { User } from '@/types';

const signIn = (userId: number, workspaceId: number) =>
  useAuthStore.setState({
    user: { id: userId } as User,
    isAuthenticated: true,
    selectedOrganizationId: workspaceId,
  });

/** An editor: its text, wired through the hook exactly as the composers are. */
const useEditor = (scope: string | null) => {
  const [text, setText] = useState('');
  const draft = useUnsentDraft({
    scope,
    value: text,
    isBlank: isBlankRichText(text),
    restore: setText,
  });
  return { text, setText, ...draft };
};

const stored = (scope: string, userId = 1, workspaceId = 5) =>
  window.localStorage.getItem(unsentDraftKey(userId, workspaceId, scope)!);

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  resetUnsentDraftPruneForTests();
  signIn(1, 5);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useUnsentDraft', () => {
  it('keeps typed text and gives it back when the same place opens again', () => {
    const first = renderHook(() => useEditor('thread:42'));
    act(() => first.result.current.setText('<p>Hello, your order</p>'));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(stored('thread:42')).toContain('Hello, your order');
    first.unmount();

    const again = renderHook(() => useEditor('thread:42'));
    expect(again.result.current.text).toBe('<p>Hello, your order</p>');
    expect(again.result.current.restored).toBe(true);
  });

  it('saves at once when the editor closes, without waiting for the delay', () => {
    const view = renderHook(() => useEditor('thread:42'));
    act(() => view.result.current.setText('<p>typed just before closing</p>'));
    view.unmount();
    expect(stored('thread:42')).toContain('typed just before closing');
  });

  it('saves at once when the tab goes to the background (a phone may kill it there)', () => {
    const view = renderHook(() => useEditor('thread:42'));
    act(() => view.result.current.setText('<p>switching apps</p>'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(stored('thread:42')).toContain('switching apps');
  });

  it('removes the kept copy once the editor is empty again (a send clears it)', () => {
    const view = renderHook(() => useEditor('thread:42'));
    act(() => view.result.current.setText('<p>reply</p>'));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => view.result.current.setText('<p></p>'));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(stored('thread:42')).toBeNull();
  });

  it('never shows one place’s text in another, nor to another person or workspace', () => {
    const view = renderHook(() => useEditor('thread:42'));
    act(() => view.result.current.setText('<p>for thread 42</p>'));
    view.unmount();

    expect(renderHook(() => useEditor('thread:43')).result.current.text).toBe('');
    signIn(2, 5);
    expect(renderHook(() => useEditor('thread:42')).result.current.text).toBe('');
    signIn(1, 6);
    expect(renderHook(() => useEditor('thread:42')).result.current.text).toBe('');
    // Control: the right person, workspace and place still gets it back.
    signIn(1, 5);
    expect(renderHook(() => useEditor('thread:42')).result.current.text).toBe(
      '<p>for thread 42</p>'
    );
  });

  it('switching place keeps the old text under the old place and loads the new one', () => {
    writeUnsentDraft(unsentDraftKey(1, 5, 'ticket:2')!, '<p>kept for ticket 2</p>');
    const view = renderHook(({ scope }) => useEditor(scope), {
      initialProps: { scope: 'ticket:1' },
    });
    act(() => view.result.current.setText('<p>for ticket 1</p>'));
    view.rerender({ scope: 'ticket:2' });
    expect(stored('ticket:1')).toContain('for ticket 1');
    expect(view.result.current.text).toBe('<p>kept for ticket 2</p>');
  });

  it('clearDraft drops the kept copy and anything waiting to be written', () => {
    const view = renderHook(() => useEditor('compose-new'));
    act(() => view.result.current.setText('<p>sent mail</p>'));
    act(() => view.result.current.clearDraft());
    view.unmount();
    expect(stored('compose-new')).toBeNull();
  });

  it('drops a copy older than a week', () => {
    const key = unsentDraftKey(1, 5, 'thread:42')!;
    writeUnsentDraft(key, '<p>old</p>', Date.now() - UNSENT_DRAFT_TTL_MS - 1000);
    const view = renderHook(() => useEditor('thread:42'));
    expect(view.result.current.text).toBe('');
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('sign-out removes every kept text from this browser', () => {
    const view = renderHook(() => useEditor('thread:42'));
    act(() => view.result.current.setText('<p>private words</p>'));
    view.unmount();
    expect(stored('thread:42')).not.toBeNull();
    act(() => useAuthStore.getState().logout());
    expect(stored('thread:42')).toBeNull();
  });
});
