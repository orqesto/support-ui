/**
 * The reply / note editor can be made taller or shorter by dragging the bar on the box's top edge
 * (owner, 2026-10-29). Open box on a desktop only; the size is remembered per mode on this browser;
 * double-click returns to the default (grows with the text up to 160px).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message } from '@/types';

const phone = vi.hoisted(() => ({ on: false }));

vi.mock('@/services/replyTemplates.service', () => ({
  replyTemplatesService: { list: vi.fn().mockResolvedValue([]), downloadAttachment: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../ComposerAiActions', () => ({ ComposerAiActions: () => null }));
vi.mock('../useIsPhone', () => ({ useIsPhone: () => phone.on }));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({ useAiDraftsOff: () => ({ off: false }) }));
// The stand-in reports the heights the composer asked of it.
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: ({ minHeight, maxHeight }: { minHeight?: string; maxHeight?: string }) => (
    <div data-testid="editor" data-min={minHeight} data-max={maxHeight} />
  ),
  extractImageFiles: () => [],
}));

const { MessageComposer } = await import('../MessageComposer');

const message = { id: 1, subject: 'Order', channel: 'email' } as unknown as Message;

const renderComposer = (mode: 'reply' | 'note' = 'reply') => {
  const view = render(
    <MemoryRouter>
      <MessageComposer
        message={message}
        composer="<p>Hello</p>"
        setComposer={vi.fn()}
        composerMode={mode}
        setComposerMode={vi.fn()}
        submitting={false}
        onSend={vi.fn()}
        richEditorRef={{ current: null }}
        noteEditorRef={{ current: null }}
        onOpenSimilarMessages={vi.fn()}
        selectedFiles={[]}
        onFilesChange={vi.fn()}
      />
    </MemoryRouter>
  );
  return view;
};
const editor = () => screen.getByTestId('editor');
const bar = () => screen.getByRole('separator', { name: /Resize the (reply|note) box/ });

beforeEach(() => {
  window.localStorage.clear();
  phone.on = false;
});

describe('reply box: resize by dragging its top edge', () => {
  it('default: no size chosen — the editor grows with the text (one line → 160px)', () => {
    renderComposer();
    expect(editor()).toHaveAttribute('data-min', '44px');
    expect(editor()).toHaveAttribute('data-max', '160px');
  });

  it('dragging up sets a fixed height, and it is remembered for the next reply box', () => {
    const { unmount } = renderComposer();
    fireEvent.keyDown(bar(), { key: 'ArrowUp' }); // from the measured start (44 in jsdom) + 24
    expect(editor()).toHaveAttribute('data-min', '68px');
    expect(editor()).toHaveAttribute('data-max', '68px');
    unmount();
    renderComposer();
    expect(editor()).toHaveAttribute('data-max', '68px');
  });

  it('reply and note sizes are separate', () => {
    window.localStorage.setItem('odly.composerHeight.reply', '300');
    renderComposer('note');
    expect(editor()).toHaveAttribute('data-max', '160px');
    expect(bar()).toHaveAccessibleName('Resize the note box');
  });

  it('never taller than the cap (no panel measured in jsdom: 480px)', () => {
    window.localStorage.setItem('odly.composerHeight.reply', '5000');
    renderComposer();
    expect(editor()).toHaveAttribute('data-max', '480px');
  });

  it('double-click returns to the default and forgets the size', () => {
    window.localStorage.setItem('odly.composerHeight.reply', '300');
    renderComposer();
    expect(editor()).toHaveAttribute('data-max', '300px');
    fireEvent.doubleClick(bar());
    expect(editor()).toHaveAttribute('data-max', '160px');
    expect(window.localStorage.getItem('odly.composerHeight.reply')).toBeNull();
  });

  it('a phone has no handle and ignores a stored size (the box is sized for the screen)', () => {
    window.localStorage.setItem('odly.composerHeight.reply', '300');
    phone.on = true;
    renderComposer();
    expect(screen.queryByRole('separator')).toBeNull();
    expect(editor()).not.toHaveAttribute('data-max', '300px');
  });

  it('a stored value that is not a size is ignored', () => {
    window.localStorage.setItem('odly.composerHeight.reply', 'tall');
    renderComposer();
    expect(editor()).toHaveAttribute('data-max', '160px');
  });
});
