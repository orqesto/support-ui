/**
 * The agent's signature is appended by the server on send, so the reply box shows it — read-only,
 * outside the editor — wherever the server will add it: an email reply (one with addressing).
 * Not on an internal note, not on a channel without addressing, not when the profile has none.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message, User } from '@/types';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/services/replyTemplates.service', () => ({
  replyTemplatesService: { list: vi.fn().mockResolvedValue([]), downloadAttachment: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../ComposerAiActions', () => ({ ComposerAiActions: () => null }));
vi.mock('../useIsPhone', () => ({ useIsPhone: () => false }));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({ useAiDraftsOff: () => ({ off: false }) }));
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: () => <div aria-label="Reply text" />,
  extractImageFiles: () => [],
}));

const { MessageComposer } = await import('../MessageComposer');

const message = {
  id: 1,
  subject: 'Order',
  channel: 'email',
  sender: 'Customer <customer@example.com>',
  from: 'Customer <customer@example.com>',
  recipients: [],
} as unknown as Message;

const renderComposer = ({
  mode = 'reply' as 'reply' | 'note',
  withAddressing = true,
}: { mode?: 'reply' | 'note'; withAddressing?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <MessageComposer
        message={message}
        composer=""
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
        {...(withAddressing
          ? { recipientDraft: { to: '', cc: '', bcc: '' }, onRecipientDraftChange: vi.fn() }
          : {})}
      />
    </MemoryRouter>
  );

const signedInWith = (signature: string | null) =>
  useAuthStore.setState({ user: { id: 7, role: 'user', signature } as User });

describe('reply box signature', () => {
  beforeEach(() => signedInWith('Alex Example\nSupport, Example Ltd'));

  it('shows the profile signature under an email reply, with a link to edit it in Profile', () => {
    renderComposer();
    const block = screen.getByTestId('composer-signature');
    expect(block.textContent).toContain('Alex Example');
    expect(block.textContent).toContain('Support, Example Ltd');
    expect(screen.getByRole('link', { name: 'Edit signature in Profile' }).getAttribute('href')).toBe(
      '/settings#profile'
    );
  });

  it('is not shown on an internal note', () => {
    renderComposer({ mode: 'note' });
    expect(screen.queryByTestId('composer-signature')).toBeNull();
  });

  it('is not shown on a channel without addressing (chat: the server adds none)', () => {
    renderComposer({ withAddressing: false });
    expect(screen.queryByTestId('composer-signature')).toBeNull();
  });

  it('is not shown when the profile has no signature', () => {
    signedInWith('   ');
    renderComposer();
    expect(screen.queryByTestId('composer-signature')).toBeNull();
  });
});
