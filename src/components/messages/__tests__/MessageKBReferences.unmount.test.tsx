/**
 * The KB-references fetch outlives the component that started it.
 *
 * 🪤 This is what made a green CI run fail: a test file finishes, vitest tears the jsdom
 * environment down, the pending response resolves, and React's `dispatchSetState` reaches for
 * `window` and throws `ReferenceError: window is not defined` as an unhandled rejection. The
 * suite reports 2332 passed AND exit code 1. Reproduced on untouched `staging`, so the race is
 * not new — it only sometimes lands inside the run.
 *
 * In the app the same race means a thread the agent closed, or a `messageId` that changed while
 * the request was in flight, still reports its count to the tab badge.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MessageKBReferences } from '../MessageKBReferences';

const getKBReferences = vi.fn<(id: number) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getKBReferences: (id: number) => getKBReferences(id) },
}));

afterEach(() => {
  cleanup();
  getKBReferences.mockReset();
});

describe('a response that arrives after the component is gone', () => {
  it('🔴 reports NO count once unmounted', async () => {
    let settle!: (value: unknown) => void;
    getKBReferences.mockReturnValue(
      new Promise((resolveFetch) => {
        settle = resolveFetch;
      })
    );
    const onCountChange = vi.fn();

    const { unmount } = render(
      <MessageKBReferences messageId={7} onCountChange={onCountChange} />
    );
    unmount();
    settle({ success: true, data: [{ id: 1 }, { id: 2 }] });
    await Promise.resolve();
    await Promise.resolve();

    // A count from a closed thread is a badge that describes a message nobody is looking at.
    expect(onCountChange).not.toHaveBeenCalled();
  });

  it('CONTROL: a response that arrives while it is still mounted DOES report its count', async () => {
    // Without this, a component that never called back would pass the test above.
    getKBReferences.mockResolvedValue({ success: true, data: [{ id: 1 }, { id: 2 }] });
    const onCountChange = vi.fn();

    render(<MessageKBReferences messageId={7} onCountChange={onCountChange} />);

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(7, 2));
  });
});
