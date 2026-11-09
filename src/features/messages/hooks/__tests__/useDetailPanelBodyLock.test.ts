/**
 * The page locks body scroll while the slide-over is open. The lock used to be keyed on the
 * whole open message, so every re-read of the open thread (a reply, a status change — a new
 * object, same thread) unlocked and relocked the body, undoing any other lock held meanwhile.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { useDetailPanelBodyLock } from '../useDetailPanelBodyLock';

const message = (subject: string) => ({ id: 7, subject }) as unknown as Message;

afterEach(() => {
  document.body.style.overflow = '';
});

describe('useDetailPanelBodyLock', () => {
  it('a re-read of the open thread (new object, same thread) does not re-run the lock', () => {
    const view = renderHook(({ open }) => useDetailPanelBodyLock(open, false, false), {
      initialProps: { open: message('first') as Message | null },
    });
    expect(document.body.style.overflow).toBe('hidden');
    // Something else holds the body meanwhile (a dialog over the panel).
    document.body.style.overflow = 'clip';
    view.rerender({ open: message('re-read') });
    expect(document.body.style.overflow).toBe('clip');
  });

  it('CONTROL: opening locks, closing unlocks; never on a phone or in split', () => {
    const view = renderHook(
      ({ open, phone, split }) => useDetailPanelBodyLock(open, phone, split),
      { initialProps: { open: null as Message | null, phone: false, split: false } }
    );
    expect(document.body.style.overflow).toBe('');
    view.rerender({ open: message('a'), phone: false, split: false });
    expect(document.body.style.overflow).toBe('hidden');
    view.rerender({ open: null, phone: false, split: false });
    expect(document.body.style.overflow).toBe('');
    view.rerender({ open: message('a'), phone: true, split: false });
    expect(document.body.style.overflow).toBe('');
    view.rerender({ open: message('a'), phone: false, split: true });
    expect(document.body.style.overflow).toBe('');
    view.rerender({ open: message('a'), phone: false, split: false });
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
