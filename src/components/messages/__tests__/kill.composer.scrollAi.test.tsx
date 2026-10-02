import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useRef } from 'react';

vi.mock('@/services/message.service', () => ({
  messageService: { composeReply: vi.fn() },
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => vi.fn(),
}));

import { ComposerAiActions } from '@/components/messages/ComposerAiActions';
import { usePhoneDetailScroll } from '@/components/messages/usePhoneDetailScroll';

describe('ComposerAiActions activity ignores a whitespace-only note', () => {
  afterEach(cleanup);

  it('spaces in the open note are not activity; a real character is', () => {
    const onActivityChange = vi.fn<(active: boolean) => void>();
    render(
      <ComposerAiActions
        messageId={42}
        composer=""
        setComposer={() => undefined}
        onApplied={() => undefined}
        onActivityChange={onActivityChange}
      />
    );
    fireEvent.click(screen.getByTitle('Draft this reply with AI'));
    const note = screen.getByPlaceholderText(/Optional — leave empty/);
    fireEvent.change(note, { target: { value: '   ' } });
    expect(onActivityChange).toHaveBeenLastCalledWith(false);
    expect(onActivityChange).not.toHaveBeenCalledWith(true);
    fireEvent.change(note, { target: { value: '  x ' } });
    expect(onActivityChange).toHaveBeenLastCalledWith(true);
  });
});

function Harness({
  enabled,
  view,
  stripHeight = 0,
  contentTop = 0,
}: {
  enabled: boolean;
  view: string;
  stripHeight?: number;
  contentTop?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePhoneDetailScroll(ref as React.RefObject<HTMLElement>, enabled, view);
  return (
    <div ref={ref}>
      <div
        data-panel-strip
        ref={(el) => {
          if (el)
            Object.defineProperty(el, 'offsetHeight', { value: stripHeight, configurable: true });
        }}
      />
      <div
        data-panel-content
        ref={(el) => {
          if (el)
            el.getBoundingClientRect = () =>
              ({ top: contentTop, bottom: 0, left: 0, right: 0, width: 0, height: 0 }) as DOMRect;
        }}
      />
    </div>
  );
}

const setScrollY = (value: number) =>
  Object.defineProperty(window, 'scrollY', { value, configurable: true, writable: true });

describe('usePhoneDetailScroll', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setScrollY(0);
    scrollTo = vi.fn();
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo as unknown as typeof window.scrollTo);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setScrollY(0);
  });

  const scrollWindow = (top: number) =>
    act(() => {
      setScrollY(top);
      window.dispatchEvent(new Event('scroll'));
    });

  it('Back to Thread returns to a place scrolled to AFTER mount', () => {
    const { rerender } = render(<Harness enabled view="thread" />);
    scrollWindow(500);
    setScrollY(0);
    rerender(<Harness enabled view="customer" />);
    scrollTo.mockClear();
    rerender(<Harness enabled view="thread" />);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 });
  });

  it('removes its own scroll listener on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Harness enabled view="thread" />);
    const added = add.mock.calls.find(([type]) => type === 'scroll');
    expect(added).toBeDefined();
    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', added?.[1]);
  });

  it('attaches the listener when it becomes enabled after mount (rotate into phone)', () => {
    const { rerender } = render(<Harness enabled={false} view="thread" />);
    rerender(<Harness enabled view="thread" />);
    scrollWindow(300);
    setScrollY(0);
    rerender(<Harness enabled view="customer" />);
    scrollTo.mockClear();
    rerender(<Harness enabled view="thread" />);
    expect(scrollTo).toHaveBeenCalledWith({ top: 300 });
  });

  it('no recorded thread place (mounted on a tab) => Back to Thread does not scroll', () => {
    const { rerender } = render(<Harness enabled view="customer" />);
    scrollWindow(200);
    scrollTo.mockClear();
    rerender(<Harness enabled view="thread" />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('a tab opens with its panel right under the stuck strip (strip height subtracted)', () => {
    const { rerender } = render(
      <Harness enabled view="thread" stripHeight={50} contentTop={-500} />
    );
    setScrollY(1000);
    scrollTo.mockClear();
    rerender(<Harness enabled view="customer" stripHeight={50} contentTop={-500} />);
    expect(scrollTo).toHaveBeenCalledWith({ top: 450 });
  });
});
