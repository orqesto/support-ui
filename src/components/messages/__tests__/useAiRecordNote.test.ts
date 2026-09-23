/**
 * L2 P4 — the note that carries record facts into the AI draft.
 *
 * ⛔ The rule worth a test of its own: it is PER THREAD. The note is only visible when the AI
 * panel is open, so a fact about one customer's order that survived into the next thread would
 * reach a stranger's reply with nobody having seen it. `ComposerAiActions` is already remounted
 * per conversation for the same reason — its own comment calls the alternative "a cross-thread
 * text leak".
 */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAiRecordNote } from '../useAiRecordNote';

describe('the note an agent gives the AI draft', () => {
  it('appends facts in the order they were added', () => {
    const { result } = renderHook(() => useAiRecordNote(1));

    act(() => {
      expect(result.current.add('Order 137416.')).toBe('added');
    });
    act(() => {
      expect(result.current.add('Shipment 99 — Status: On its way.')).toBe('added');
    });

    expect(result.current.note).toBe('Order 137416. Shipment 99 — Status: On its way.');
  });

  it('🔴 EMPTIES when the agent opens another thread', () => {
    const { result, rerender } = renderHook(({ id }) => useAiRecordNote(id), {
      initialProps: { id: 1 },
    });

    act(() => {
      result.current.add('Order 137416 — Status: On its way.');
    });
    expect(result.current.note).not.toBe('');

    rerender({ id: 2 });

    expect(result.current.note).toBe('');
    expect(result.current.reveal).toBe(0);
  });

  it('CONTROL: a re-render on the SAME thread keeps what the agent has', () => {
    // Without this, a hook that cleared on every render would pass the test above.
    const { result, rerender } = renderHook(({ id }) => useAiRecordNote(id), {
      initialProps: { id: 1 },
    });

    act(() => {
      result.current.add('Order 137416.');
    });
    rerender({ id: 1 });

    expect(result.current.note).toBe('Order 137416.');
  });

  it('keeps what the agent TYPED, and adds to it', () => {
    const { result } = renderHook(() => useAiRecordNote(1));

    act(() => result.current.change('We are chasing the courier.'));
    act(() => {
      result.current.add('Order 137416.');
    });

    expect(result.current.note).toBe('We are chasing the courier. Order 137416.');
  });

  it('🔴 two adds in ONE batch both survive', () => {
    // The outcome is returned synchronously to the control, so the add reads a ref rather than
    // state — through state, the second add would read the pre-first value and replace it, and
    // a fact the agent watched go in would never appear again.
    const { result } = renderHook(() => useAiRecordNote(1));

    act(() => {
      result.current.add('Order 1.');
      result.current.add('Order 2.');
    });

    expect(result.current.note).toBe('Order 1. Order 2.');
  });

  it('refuses a fact that does not fit, and says why', () => {
    const { result } = renderHook(() => useAiRecordNote(1));

    act(() => result.current.change('x'.repeat(1999)));

    let outcome: string | undefined;
    act(() => {
      outcome = result.current.add('Order 137416.');
    });

    // The NOTE is what is full here, and the control's wording differs from a fact that could
    // never fit at all.
    expect(outcome).toBe('too_long');
    expect(result.current.note).toBe('x'.repeat(1999));
  });

  it('🔴 says the FACT is too long when it could not fit into an empty note either', () => {
    const { result } = renderHook(() => useAiRecordNote(1));

    let outcome: string | undefined;
    act(() => {
      outcome = result.current.add(`Order ${'9'.repeat(2100)}.`);
    });

    expect(outcome).toBe('fact_too_long');
  });

  it('says "duplicate" rather than "full" for a record already in the note', () => {
    const { result } = renderHook(() => useAiRecordNote(1));

    act(() => {
      result.current.add('Order 137416.');
    });

    let outcome: string | undefined;
    act(() => {
      outcome = result.current.add('Order 137416.');
    });

    expect(outcome).toBe('duplicate');
  });

  it('counts only the adds that landed, so the box is not opened for nothing', () => {
    const { result } = renderHook(() => useAiRecordNote(1));

    act(() => {
      result.current.add('Order 137416.');
    });
    const afterFirst = result.current.reveal;
    act(() => {
      result.current.add('Order 137416.');
    });

    expect(result.current.reveal).toBe(afterFirst);
  });
});
