/**
 * Message detail v4 — the phone layout: the rail tab strip (M4), the thread (M5), the resolve row
 * (M6), useIsPhone. Shared mocks and render helpers: md4.mobile.utils.tsx. Every phone test has a
 * desktop CONTROL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setViewport,
  baseMessage,
  renderDetail,
  wrap,
  composer,
  decisions,
  classOf,
  event,
  svc,
  stubs,
  tabsProps,
} from './md4.mobile.utils';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { Message } from '@/types';
import { MessagePanelTabs } from '../MessagePanelTabs';
import { ThreadMessageItem } from '../ThreadMessageItem';
import { ThreadNoteItem } from '../ThreadNoteItem';
import { MessageAttachments, type Attachment } from '../MessageAttachments';
import type { MessageNote } from '@/services/message.service';
import { PHONE_QUERY } from '../useIsPhone';

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

describe('M4 — the rail tab strip on a phone', () => {
  beforeEach(() => {
    stubs.panel = false;
    svc.message.getSimilarResolvedMessages = vi.fn().mockResolvedValue({ success: true, data: [] });
    svc.message.getKBReferences = vi.fn().mockResolvedValue({ success: true, data: [] });
  });

  it('rail: the wrapper has no box, the strip sticks under the header row, 44px tabs', () => {
    setViewport(true);
    wrap(<MessagePanelTabs {...tabsProps({})} />);
    expect(classOf(screen.getByTestId('panel-tabs-root'))).toContain('max-sm:contents');
    const thread = screen.getByRole('button', { name: 'Thread' });
    const strip = thread.parentElement!;
    expect(classOf(strip)).toContain('max-sm:sticky');
    expect(classOf(strip)).toContain('max-sm:top-[calc(var(--md-sticky-top,0px)+52px)]');
    expect(classOf(strip)).toContain('overflow-x-auto'); // still scrolls sideways
    expect(classOf(thread)).toContain('max-sm:h-11');
    expect(classOf(thread)).toContain('max-sm:text-[13.5px]');
    // The open panel is not its own scroller on a phone — the document scrolls.
    expect(
      classOf(screen.getByText('No internal notes yet.').closest('.overflow-y-auto'))
    ).toContain('max-sm:overflow-visible');
  });

  it('M9: "Add a note via the composer" is a 44px target on a phone', () => {
    setViewport(true);
    wrap(<MessagePanelTabs {...tabsProps({})} />);
    expect(classOf(screen.getByRole('button', { name: /Add a note via the composer/ }))).toContain(
      'max-sm:h-11'
    );
  });

  it("M9: the Customer tab's contact controls get 40px targets on a phone", () => {
    setViewport(true);
    wrap(<MessagePanelTabs {...tabsProps({ tab: 'customer' })} />);
    expect(
      screen
        .getByText('No contact record for this sender.')
        .closest('[class*="max-sm:[&_button]:min-h-10"]')
    ).not.toBeNull();
  });

  it('M9: the 40px input rule leaves tick boxes and radios alone (a tall checkbox drops below its label)', () => {
    setViewport(true);
    wrap(<MessagePanelTabs {...tabsProps({ tab: 'customer' })} />);
    const root = screen
      .getByText('No contact record for this sender.')
      .closest('[class*="max-sm:[&_button]:min-h-10"]');
    expect(root?.className).toContain(
      'max-sm:[&_input:not([type=checkbox]):not([type=radio])]:min-h-10'
    );
    expect(root?.className).not.toContain('max-sm:[&_input]:min-h-10');
  });

  it('M9: file Preview / Download are 40px on a phone (30px from 640px up)', () => {
    const att = {
      id: 31,
      originalFilename: 'receipt.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      messageEventId: null,
      createdAt: '2026-09-22T10:00:00Z',
    } as unknown as Attachment;
    wrap(<MessageAttachments message={baseMessage} preloadedAttachments={[att]} />);
    const download = screen.getByRole('button', { name: 'Download receipt.pdf' });
    expect(classOf(download)).toContain('max-sm:w-10');
    expect(classOf(download)).toContain('max-sm:h-10');
    expect(classOf(download)).toContain('w-[30px]');
  });

  it('CONTROL sidebar (desktop full page): never sticky, keeps its box', () => {
    setViewport(false);
    wrap(<MessagePanelTabs {...tabsProps({ variant: 'sidebar' })} />);
    expect(classOf(screen.getByTestId('panel-tabs-root'))).not.toContain('max-sm:contents');
    const strip = screen.getByRole('button', { name: 'AI' }).parentElement!;
    expect(classOf(strip)).not.toContain('max-sm:sticky');
  });
});

describe('M5 — the thread on a phone', () => {
  it('inbound: no avatar, full width, 14px bubble that wraps pre/code', () => {
    const { container } = wrap(<ThreadMessageItem msg={event({})} attachments={[]} />);
    const row = container.firstElementChild!;
    expect(classOf(row)).toContain('max-sm:block');
    const avatar = row.firstElementChild!;
    expect(classOf(avatar)).toContain('max-sm:hidden');
    const col = avatar.nextElementSibling!;
    expect(classOf(col)).toContain('max-sm:max-w-none');
    expect(classOf(col)).toContain('max-sm:w-full');
    const bubble = col.querySelector('.bg-bubble')!;
    expect(classOf(bubble)).toContain('max-sm:text-[14px]');
    expect(classOf(bubble)).toContain('max-sm:[&_pre]:whitespace-pre-wrap');
    // CONTROL: the desktop look is untouched (21px avatar, 90% column, 13.5px).
    expect(classOf(avatar)).toContain('w-[21px]');
    expect(classOf(col)).toContain('max-w-[90%]');
    expect(classOf(bubble)).toContain('text-[13.5px]');
  });

  it('outbound: indented 28px, no avatar', () => {
    const { container } = wrap(
      <ThreadMessageItem msg={event({ type: 'outbound', authorName: 'Dana' })} attachments={[]} />
    );
    const row = container.firstElementChild!;
    expect(classOf(row.firstElementChild)).toContain('max-sm:hidden');
    expect(classOf(row.firstElementChild!.nextElementSibling)).toContain('max-sm:ml-7');
    expect(classOf(row.querySelector('.bg-agent'))).toContain('max-sm:text-[14px]');
  });

  it('a note in the thread: no avatar, full width', () => {
    const note = {
      id: 1,
      content: 'Checked the warehouse',
      authorName: 'Dana',
      createdAt: '2026-09-22T10:00:00Z',
    } as unknown as MessageNote;
    const { container } = render(<ThreadNoteItem note={note} />);
    const row = container.firstElementChild!;
    expect(classOf(row)).toContain('max-sm:block');
    expect(classOf(row.firstElementChild)).toContain('max-sm:hidden');
    expect(classOf(row.firstElementChild!.nextElementSibling)).toContain('max-sm:w-full');
  });
});

describe('M6 — the resolve row on a phone', () => {
  it('sits OUTSIDE the composer, after the thread and before the composer', () => {
    setViewport(true);
    renderDetail();
    const row = decisions()!;
    expect(row).toBeTruthy();
    expect(row.getAttribute('data-variant')).toBe('phone');
    expect(composer().contains(row)).toBe(false);
    const thread = screen.getByTestId('thread-scroller');
    expect(thread.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(composer()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The Resolve pair share the width at 42px; the quiet exits sit on their own row.
    expect(classOf(within(row).getByRole('button', { name: 'Resolve' }))).toContain('!h-[42px]');
    expect(classOf(within(row).getByRole('button', { name: 'Resolve' }))).toContain('!flex-1');
    expect(
      classOf(within(row).getByRole('button', { name: 'Not customer work' }).parentElement)
    ).toContain('justify-center');
  });

  it('is hidden while another tab is open', () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
    expect(decisions()).toBeNull();
  });

  it('a resolved thread: no row, no composer', () => {
    setViewport(true);
    renderDetail({ status: 'closed' } as Partial<Message>);
    expect(decisions()).toBeNull();
    expect(screen.queryByTestId('message-composer')).toBeNull();
  });

  it('CONTROL desktop: the row stays inside the composer (messageDetailV3.test.tsx:182)', () => {
    setViewport(false);
    renderDetail();
    const row = decisions()!;
    expect(row.getAttribute('data-variant')).toBe('inline');
    expect(composer().contains(row)).toBe(true);
  });
});

describe('M6 — the phone resolve row follows the composer mode', () => {
  it('hidden while the composer is on Internal note, as on desktop', () => {
    setViewport(true);
    renderDetail();
    expect(decisions()).not.toBeNull();
    fireEvent.click(within(composer()).getByRole('button', { name: 'Internal note' }));
    expect(decisions()).toBeNull();
    fireEvent.click(within(composer()).getByRole('button', { name: 'Reply' }));
    expect(decisions()).not.toBeNull();
  });
});

describe('R and N on a phone with the Notes tab open', () => {
  // The composer shows under Notes too, so R / N have no reason to leave it.
  const press = (key: string) =>
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  const panel = () => screen.getByTestId('panel-tabs');

  for (const key of ['r', 'n']) {
    it(`${key.toUpperCase()} keeps the Notes panel open`, () => {
      setViewport(true);
      renderDetail();
      fireEvent.click(screen.getByRole('button', { name: 'open Notes tab' }));
      expect(panel()).toHaveAttribute('data-open', 'true');
      press(key);
      expect(panel()).toHaveAttribute('data-open', 'true');
      expect(panel()).toHaveAttribute('data-tab', 'notes');
    });

    it(`CONTROL ${key.toUpperCase()} with another tab (AI) open goes back to the Thread`, () => {
      setViewport(true);
      renderDetail();
      fireEvent.click(screen.getByRole('button', { name: 'open AI tab' }));
      expect(panel()).toHaveAttribute('data-open', 'true');
      press(key);
      expect(panel()).toHaveAttribute('data-open', 'false');
    });
  }
});

describe('useIsPhone — the same query as Tailwind max-sm', () => {
  // The phone-opens-as-page redirect calls useIsPhone itself (usePhoneOpensMessageAsPage.test
  // drives it through this same constant), so the two cannot hold different queries.
  it('is Tailwind 3’s max-sm query exactly', () => {
    expect(PHONE_QUERY).toBe('not all and (min-width: 640px)');
  });
});
