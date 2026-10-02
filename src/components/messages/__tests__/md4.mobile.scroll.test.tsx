/**
 * Message detail v4 — the phone layout: a new message and a new tab start at their top. Shared
 * mocks and render helpers: md4.mobile.utils.tsx. Every phone test has a desktop CONTROL.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setViewport, renderDetail, wrap, stubs, baseMessage, tabsProps } from './md4.mobile.utils';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageDetail } from '../MessageDetail';
import { MessagePanelTabs } from '../MessagePanelTabs';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => {
  // The services' auto-stub (md4.mobile.utils.tsx): each method a vi.fn resolving [].
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    apiClient: new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    }),
  };
});

describe('Phone scrolling — a new message and a new tab start at their top', () => {
  const setScrollY = (value: number) =>
    Object.defineProperty(window, 'scrollY', { configurable: true, value });
  afterEach(() => setScrollY(0));

  /** The panel's top sits `top` px down the viewport (jsdom lays nothing out). */
  const panelTopAt = (top: number) =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const at = this.hasAttribute('data-panel-content') ? top : 0;
      return {
        top: at,
        bottom: at,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: at,
      } as DOMRect;
    });

  it('phone: a tab opening under the sticky rows scrolls back to the strip; Thread returns to its place', () => {
    setViewport(true);
    setScrollY(800);
    panelTopAt(-50); // the panel would begin 50px above the screen's top
    renderDetail({}, { isFullPage: true });
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    // panel top in the document = 800 - 50 = 750; the strip sticks at 108px ⇒ 642.
    expect(scrollTo).toHaveBeenCalledWith({ top: 642 });
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'back to Thread' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 800 });
  });

  it('phone: the offset the browser clamps to as the thread hides is not the place returned to', () => {
    setViewport(true);
    setScrollY(800);
    panelTopAt(400);
    renderDetail({}, { isFullPage: true });
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    // The shorter page: the browser clamps the offset and reports a scroll.
    setScrollY(120);
    fireEvent.scroll(window);
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'back to Thread' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 800 });
  });

  it('phone: a tab whose top is already in view leaves the page where it is', () => {
    setViewport(true);
    setScrollY(100);
    panelTopAt(400);
    renderDetail({}, { isFullPage: true });
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('phone: a message opens at the top of the document — and the next one does too', () => {
    setViewport(true);
    setScrollY(800);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = (id: number) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MessageDetail key={id} message={{ ...baseMessage, id }} onClose={vi.fn()} isFullPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(page(101));
    const resets = () =>
      vi.mocked(window.scrollTo).mock.calls.filter(([arg]) => (arg as ScrollToOptions)?.top === 0)
        .length;
    expect(resets()).toBe(1);
    // A merge, Related "Open": the next message, remounted by its key.
    view.rerender(page(102));
    expect(resets()).toBe(2);
  });

  it('CONTROL desktop: no scrolling on open, on a tab switch or back on Thread', () => {
    setViewport(false);
    setScrollY(800);
    panelTopAt(-50);
    renderDetail({}, { isFullPage: true });
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'back to Thread' }));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('the real rail marks its strip and panel for it; the sidebar does not', () => {
    stubs.panel = false;
    setViewport(true);
    const view = wrap(<MessagePanelTabs {...tabsProps({})} />);
    expect(view.container.querySelector('[data-panel-strip]')).not.toBeNull();
    expect(view.container.querySelector('[data-panel-content]')).not.toBeNull();
    cleanup();
    const side = wrap(<MessagePanelTabs {...tabsProps({ variant: 'sidebar' })} />);
    expect(side.container.querySelector('[data-panel-strip]')).toBeNull();
  });
});
