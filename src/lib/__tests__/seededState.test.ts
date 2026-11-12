import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearSessionCaches } from '../sessionCaches';
import { forgetSeeds, readSeed, useSeededState, writeSeed } from '../seededState';

describe('useSeededState', () => {
  it('starts empty, then from the last value written for the same key', () => {
    const first = renderHook(() => useSeededState<string[]>(['thread', 7, 'notes'], []));
    expect(first.result.current[0]).toEqual([]);
    expect(first.result.current[2]).toBe(false);
    act(() => first.result.current[1](['a note']));
    first.unmount();

    const again = renderHook(() => useSeededState<string[]>(['thread', 7, 'notes'], []));
    expect(again.result.current[0]).toEqual(['a note']);
    expect(again.result.current[2]).toBe(true);
  });

  it('another key starts from its own value, never the previous one', () => {
    writeSeed(['thread', 8, 'notes'], ['eight']);
    const view = renderHook(({ id }) => useSeededState<string[]>(['thread', id, 'notes'], []), {
      initialProps: { id: 7 },
    });
    act(() => view.result.current[1](['seven']));
    view.rerender({ id: 8 });
    expect(view.result.current[0]).toEqual(['eight']);
    view.rerender({ id: 9 });
    expect(view.result.current[0]).toEqual([]);
    // A write after the switch belongs to the thread now shown.
    act(() => view.result.current[1](['nine']));
    expect(readSeed(['thread', 9, 'notes'])).toEqual(['nine']);
    expect(readSeed(['thread', 7, 'notes'])).toEqual(['seven']);
  });

  it('keeps null as a value (not read yet ≠ nothing remembered)', () => {
    writeSeed(['thread', 3, 'merges'], null);
    const view = renderHook(() => useSeededState<string[] | null>(['thread', 3, 'merges'], []));
    expect(view.result.current[0]).toBeNull();
    expect(view.result.current[2]).toBe(true);
  });

  it('sign-out and a workspace switch forget everything', () => {
    writeSeed(['thread', 5, 'notes'], ['ours']);
    clearSessionCaches();
    expect(readSeed(['thread', 5, 'notes'])).toBeUndefined();
  });

  it('forgets one thread, or everything', () => {
    writeSeed(['thread', 1, 'notes'], ['one']);
    writeSeed(['thread', 2, 'notes'], ['two']);
    forgetSeeds('thread', 1);
    expect(readSeed(['thread', 1, 'notes'])).toBeUndefined();
    expect(readSeed(['thread', 2, 'notes'])).toEqual(['two']);
    forgetSeeds();
    expect(readSeed(['thread', 2, 'notes'])).toBeUndefined();
  });

  it('holds at most 200 values, dropping the least recently written', () => {
    for (let index = 0; index < 201; index += 1) writeSeed(['thread', index, 'notes'], index);
    expect(readSeed(['thread', 0, 'notes'])).toBeUndefined();
    expect(readSeed(['thread', 200, 'notes'])).toBe(200);
  });
});
