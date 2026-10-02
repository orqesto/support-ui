/**
 * Message detail v4 — the phone layout: folding the composer puts the editor back in its one-line
 * form (M7). The REAL RichTextEditor (TipTap runs in jsdom): its expanded/collapsed state lives
 * inside it, so only a remount — the `restGeneration` key — collapses it again. The shared phone
 * utils stub the editor with a stateless textarea, which cannot show that, so this file does not
 * import them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import type { Message } from '@/types';
import { MessageComposer } from '../MessageComposer';
import { PHONE_QUERY } from '../useIsPhone';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/services/message.service', () => ({
  messageService: { composeReply: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (store: unknown) => unknown) =>
    select({ user: { id: 7, organizationId: 3, firstName: 'Dana' }, selectedOrganizationId: 3 }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));

const setViewport = (phone: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: phone && query === PHONE_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
};

const props = (composerMode: 'reply' | 'note') => ({
  message: { id: 4242, sender: 'Ada <ada@example.com>', channel: 'email' } as unknown as Message,
  composer: '',
  setComposer: vi.fn(),
  composerMode,
  setComposerMode: vi.fn(),
  submitting: false,
  onSend: vi.fn(),
  richEditorRef: createRef<never>(),
  noteEditorRef: createRef<never>(),
  onOpenSimilarMessages: vi.fn(),
  selectedFiles: [],
  onFilesChange: vi.fn(),
});

const box = () => screen.getByTestId('message-composer');
/** The TipTap surface: only the expanded editor renders it. */
const surface = () => box().querySelector('.ProseMirror');
const tap = async (el: Element) => {
  fireEvent.pointerDown(el);
  fireEvent.click(el);
  // The placeholder focuses the editor on a timer; let it run while the editor is mounted.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('M7 — folding the phone composer collapses the editor again', () => {
  it.each([
    ['reply', 'Reply as Dana…'],
    ['note', 'Internal note — only visible to the team…'],
  ] as const)(
    '%s: open, then an outside press while empty → the one-line placeholder',
    async (mode, placeholder) => {
      setViewport(true);
      render(<MessageComposer {...props(mode)} />);
      expect(surface()).toBeNull();
      await tap(within(box()).getByRole('button', { name: placeholder }));
      expect(box().getAttribute('data-phone-state')).toBe('open');
      expect(surface()).not.toBeNull();
      expect(within(box()).queryByRole('button', { name: placeholder })).toBeNull();
      await tap(document.body);
      expect(box().getAttribute('data-phone-state')).toBe('rest');
      expect(surface()).toBeNull();
      expect(within(box()).getByRole('button', { name: placeholder })).toBeTruthy();
    }
  );

  it('CONTROL desktop: an outside press leaves the expanded editor expanded', async () => {
    setViewport(false);
    render(<MessageComposer {...props('reply')} />);
    await tap(within(box()).getByRole('button', { name: 'Reply as Dana…' }));
    expect(surface()).not.toBeNull();
    await tap(document.body);
    expect(surface()).not.toBeNull();
  });
});
