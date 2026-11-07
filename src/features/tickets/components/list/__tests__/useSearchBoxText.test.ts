import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSearchBoxText } from '../useSearchBoxText';

describe('useSearchBoxText', () => {
  it('shows a search applied after the first render (a link `/tickets?search=…`)', () => {
    // The URL is read into the store on mount, so the box first renders with no search.
    const { result, rerender } = renderHook(({ applied }) => useSearchBoxText(applied), {
      initialProps: { applied: '' as string | undefined },
    });
    expect(result.current[0]).toBe('');
    rerender({ applied: 'parcel' });
    expect(result.current[0]).toBe('parcel');
  });

  it('keeps what is being typed while the applied search does not change', () => {
    const { result, rerender } = renderHook(({ applied }) => useSearchBoxText(applied), {
      initialProps: { applied: 'parcel' as string | undefined },
    });
    act(() => result.current[1]('parcel lost'));
    // Another filter changes (a pill): the applied search is the same, the typing stays.
    rerender({ applied: 'parcel' });
    expect(result.current[0]).toBe('parcel lost');
    // CONTROL: a different applied search (a saved view, Clear) replaces it.
    rerender({ applied: undefined });
    expect(result.current[0]).toBe('');
  });
});
