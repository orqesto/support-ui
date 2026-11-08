/**
 * One signature per workspace: when this workspace's signature is the copy of the person's old
 * one-for-every-workspace signature, the reply box asks them to check it — naming the workspace —
 * until they keep it (or save it in Profile). Someone working in several brand workspaces would
 * otherwise go on signing one brand's mail with another brand's sign-off.
 * CONTROLS: no notice once reviewed, on a backend that does not send the flag, or on a note.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message, User } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const confirmSignature = vi.fn<() => Promise<void>>();
vi.mock('@/services/user.service', () => ({ userService: { confirmSignature } }));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: vi.fn().mockResolvedValue({ name: 'Northwind Example' }) },
}));
vi.mock('@/services/replyTemplates.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  replyTemplatesService: { list: vi.fn().mockResolvedValue([]), downloadAttachment: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../ComposerAiActions', () => ({ ComposerAiActions: () => null }));
vi.mock('@/features/messages/hooks/useIsPhone', () => ({ useIsPhone: () => false }));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false }),
}));
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

const renderComposer = (mode: 'reply' | 'note' = 'reply') => {
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
        recipientDraft={{ to: '', cc: '', bcc: '' }}
        onRecipientDraftChange={vi.fn()}
      />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTestId('composer-field'));
};

const signedIn = (extra: Partial<User>) =>
  useAuthStore.setState({
    user: { id: 7, role: 'user', signature: 'Alex Example\nOther Brand Team', ...extra } as User,
  });

describe('reply box: check the copied signature', () => {
  beforeEach(() => {
    confirmSignature.mockReset();
    confirmSignature.mockResolvedValue(undefined);
  });

  it('names the workspace and shows the copied signature', async () => {
    signedIn({ signatureNeedsReview: true });
    renderComposer();
    const notice = screen.getByTestId('signature-review-notice');
    expect(notice.textContent).toContain('Alex Example · Other Brand Team');
    await waitFor(() => expect(notice.textContent).toContain('Northwind Example'));
    expect(screen.getByRole('link', { name: 'Edit in Profile' }).getAttribute('href')).toBe(
      '/settings#profile'
    );
  });

  it('"Keep it" confirms on the server and the notice goes away', async () => {
    signedIn({ signatureNeedsReview: true });
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByTestId('signature-review-notice')).toBeNull());
    expect(confirmSignature).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user?.signatureNeedsReview).toBe(false);
  });

  it('a failed keep leaves the notice up', async () => {
    confirmSignature.mockRejectedValue(new Error('offline'));
    signedIn({ signatureNeedsReview: true });
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(confirmSignature).toHaveBeenCalled());
    expect(screen.getByTestId('signature-review-notice')).toBeTruthy();
    expect(useAuthStore.getState().user?.signatureNeedsReview).toBe(true);
  });

  it.each([
    ['already reviewed', { signatureNeedsReview: false }],
    ['a backend that does not send the flag', {}],
  ])('CONTROL: no notice when %s', (_label, extra) => {
    signedIn(extra);
    renderComposer();
    expect(screen.queryByTestId('signature-review-notice')).toBeNull();
    expect(screen.getByTestId('composer-signature')).toBeTruthy();
  });

  it('CONTROL: no notice on an internal note', () => {
    signedIn({ signatureNeedsReview: true });
    renderComposer('note');
    expect(screen.queryByTestId('signature-review-notice')).toBeNull();
  });
});
