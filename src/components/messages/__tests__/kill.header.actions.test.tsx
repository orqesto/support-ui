/**
 * Mutation kills — the header's top-row actions: Copy link (desktop label + revert timer, phone
 * toast), the read toggle and Close, on desktop and on a phone.
 * Shared mocks: md4.header.utils.tsx (imported first so its mocks register before the header).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { message, Where, setPhone } from './md4.header.utils';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast: toasts }));

type Props = Partial<Parameters<typeof MessageDetailHeader>[0]>;
const tree = (over: Props = {}) => (
  <ThemeProvider>
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/messages/1']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <MessageDetailHeader
                  message={message}
                  showFullPageButton={false}
                  isFullPage
                  threadCount={1}
                  {...over}
                />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

const writeText = vi.fn();
const setClipboard = () =>
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const copyButton = () => screen.getByRole('button', { name: 'Copy link' });
const tip = () => screen.queryByRole('tooltip')?.textContent;

beforeEach(() => {
  // The toast spies are shared across tests; a toast from one must not satisfy (or fail) another.
  Object.values(toasts).forEach((spy) => spy.mockClear());
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  setClipboard();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Copy link — desktop icon', () => {
  it('says "Link copied" after a copy, and reverts to "Copy link" 2 s later', async () => {
    vi.useFakeTimers();
    render(tree());
    act(() => copyButton().focus());
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(tip()).toBe('Copy link');
    fireEvent.click(copyButton());
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(tip()).toBe('Link copied');
    await act(() => vi.advanceTimersByTimeAsync(1900));
    expect(tip()).toBe('Link copied');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(tip()).toBe('Copy link');
  });

  it('a second copy within 2 s restarts the 2 s: the first timer does not revert it early', async () => {
    vi.useFakeTimers();
    render(tree());
    act(() => copyButton().focus());
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.click(copyButton());
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.click(copyButton());
    await flush();
    // 2.5 s after the first copy, 1.5 s after the second.
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(tip()).toBe('Link copied');
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(tip()).toBe('Copy link');
  });

  it("a failed copy from the desktop icon says so in a toast (the phone path's words)", async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(tree());
    fireEvent.click(copyButton());
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toasts.error).toHaveBeenCalledTimes(1);
    expect(toasts.error).toHaveBeenCalledWith(
      'Could not copy the link (denied) — copy it from the address bar.'
    );
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('a successful copy from the desktop icon stays tooltip-only: no toast', async () => {
    render(tree());
    fireEvent.click(copyButton());
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toasts.success).not.toHaveBeenCalled();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('after a thread switch it copies the link of the thread now shown', async () => {
    const { rerender } = render(tree());
    rerender(tree({ message: { ...message, id: 2, publicId: 'SUP-2' } as Message }));
    fireEvent.click(copyButton());
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/messages?id=TES-SUP-2`);
  });
});

describe('Copy link — phone More item (announced in a toast)', () => {
  const copyFromMore = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByTestId('more-menu')).getByText('Copy link'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  };
  const plain = 'Could not copy the link — copy it from the address bar.';

  it('a rejection that is not an Error: no "(undefined)" in the toast', async () => {
    setPhone(true);
    writeText.mockRejectedValue('denied');
    render(tree());
    await copyFromMore();
    expect(toasts.error).toHaveBeenCalledWith(plain);
  });

  it('an Error with no message: no empty "()" in the toast', async () => {
    setPhone(true);
    writeText.mockRejectedValue(new Error(''));
    render(tree());
    await copyFromMore();
    expect(toasts.error).toHaveBeenCalledWith(plain);
  });

  it('CONTROL: an Error with a message names it', async () => {
    setPhone(true);
    writeText.mockRejectedValue(new Error('denied'));
    render(tree());
    await copyFromMore();
    expect(toasts.error).toHaveBeenCalledWith(
      'Could not copy the link (denied) — copy it from the address bar.'
    );
  });

  it('CONTROL: a copy that worked says so', async () => {
    setPhone(true);
    render(tree());
    await copyFromMore();
    expect(toasts.success).toHaveBeenCalledWith('Link copied');
  });
});

describe('Read toggle icon', () => {
  const icon = () => screen.queryByRole('button', { name: 'Mark as read' });

  it('desktop with showReadToggle and onToggleRead: shown', () => {
    render(tree({ showReadToggle: true, onToggleRead: vi.fn() }));
    expect(icon()).toBeTruthy();
  });

  it('phone: never an icon (the More item replaces it)', () => {
    setPhone(true);
    render(tree({ showReadToggle: true, onToggleRead: vi.fn() }));
    expect(icon()).toBeNull();
  });

  it('without showReadToggle: not shown, even with a handler', () => {
    render(tree({ showReadToggle: false, onToggleRead: vi.fn() }));
    expect(icon()).toBeNull();
  });

  it('without a handler: not shown', () => {
    render(tree({ showReadToggle: true }));
    expect(icon()).toBeNull();
  });
});

describe('Close (X)', () => {
  const close = () => screen.queryByRole('button', { name: 'Close' });

  it('desktop, docked (not the full page) with onClose: shown', () => {
    render(tree({ isFullPage: false, onClose: vi.fn() }));
    expect(close()).toBeTruthy();
  });

  it('phone: never (Back replaces it)', () => {
    setPhone(true);
    render(tree({ isFullPage: false, onClose: vi.fn() }));
    expect(close()).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to inbox' })).toBeTruthy();
  });

  it('docked without onClose: not shown', () => {
    render(tree({ isFullPage: false }));
    expect(close()).toBeNull();
  });

  it('the full page: not shown', () => {
    render(tree({ isFullPage: true, onClose: vi.fn() }));
    expect(close()).toBeNull();
  });
});
