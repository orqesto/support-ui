import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useComposerText } from '../messageDetail/useComposerText';

/** Thread presence reads this time to tell "writing" from "a draft left in the box" (spec §5.1). */
describe('useComposerText — lastAgentEditAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useComposerText());
    expect(result.current.lastAgentEditAt.current).toBeNull();
  });

  it('typing stamps the time of the edit', () => {
    const { result } = renderHook(() => useComposerText());
    act(() => result.current.writeComposer('<p>Hello</p>'));
    expect(result.current.lastAgentEditAt.current).toBe(1_000_000);
    vi.setSystemTime(1_005_000);
    act(() => result.current.writeComposer('<p>Hello there</p>'));
    expect(result.current.lastAgentEditAt.current).toBe(1_005_000);
  });

  it('an insert (template, AI answer, add-record) stamps it too', () => {
    const { result } = renderHook(() => useComposerText());
    act(() => result.current.writeComposer('<p>From a template</p>', 'reply'));
    expect(result.current.lastAgentEditAt.current).toBe(1_000_000);
  });

  it('a re-normalised copy of the same visible text is not an edit', () => {
    const { result } = renderHook(() => useComposerText());
    act(() => result.current.writeComposer('<p>Hello</p>'));
    vi.setSystemTime(1_009_000);
    act(() => result.current.writeComposer('<p>Hello</p><p></p>'));
    expect(result.current.lastAgentEditAt.current).toBe(1_000_000);
  });

  it('a cleared composer (the clear after a send) resets it, so it cannot count as writing', () => {
    const { result } = renderHook(() => useComposerText());
    act(() => result.current.writeComposer('<p>Hello</p>'));
    act(() => result.current.writeComposer(''));
    expect(result.current.lastAgentEditAt.current).toBeNull();
  });
});
